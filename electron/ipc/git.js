// electron/ipc/git.js
// Git 集成：基于内置 git CLI（execFile 参数数组模式，不经过 shell，防命令注入）
// 安全约束：仅在已登记的项目根目录内执行；命令白名单；文件路径必须通过路径守卫
const { execFile } = require('child_process')
const path = require('path')
const { ipcMain } = require('electron')
const { isPathAllowed } = require('../utils/path-guard')

// git 子命令白名单（只允许这些命令被调用）
const ALLOWED_CMDS = new Set([
  'status', 'diff', 'show', 'add', 'reset', 'restore', 'commit',
  'checkout', 'branch', 'log', 'remote', 'pull', 'push', 'fetch',
  'rev-parse', 'init', 'merge', 'stash',
])

function runGit(projectPath, args) {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd: projectPath, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, code: err.code || 1, stdout: stdout || '', stderr: stderr || '' })
        } else {
          resolve({ ok: true, stdout: stdout || '', stderr: stderr || '' })
        }
      }
    )
  })
}

// 校验项目根目录在白名单内
function checkProjectRoot(projectPath) {
  return typeof projectPath === 'string' && projectPath.trim() && isPathAllowed(projectPath)
}

// 校验相对路径安全（禁止 ../ 穿越）
function safeRel(relPath) {
  if (typeof relPath !== 'string' || !relPath.trim()) return null
  const norm = relPath.replace(/\\/g, '/')
  if (norm.includes('..') || norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) return null
  return norm
}

// 校验分支名安全（禁止以 - 开头当 git 选项解析；只允许常见分支名字符）
function safeBranch(name) {
  if (typeof name !== 'string') return null
  const v = name.trim()
  if (!v || v.startsWith('-') || !/^[A-Za-z0-9._/-]+$/.test(v)) return null
  return v
}

// 解析 git status --porcelain=v1 -b 输出
// 首行 `## branch...upstream`，其余每行 `XY path`；`??` 表示未跟踪
function parsePorcelain(out) {
  const lines = out.split(/\r?\n/).filter(Boolean)
  let branch = ''
  const changes = []
  const seen = new Set()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('## ')) {
      branch = line.slice(3).split('...')[0].trim()
      continue
    }
    if (line.startsWith('??')) {
      const p = line.slice(3).trim()
      if (p && !seen.has(p)) {
        seen.add(p)
        changes.push({ path: p, status: 'U', staged: false, kind: 'untracked' })
      }
      continue
    }
    const xy = line.slice(0, 2)
    const p = line.slice(3).trim()
    if (!p || seen.has(p)) continue
    seen.add(p)
    const X = xy[0]
    const Y = xy[1]
    const map = { M: 'M', A: 'A', D: 'D', R: 'R', C: 'C', U: 'U' }
    // 工作区状态优先：XY 都有内容（如 `AM`）说明暂存后又改了，按工作区状态显示 M
    const status = map[Y] || map[X] || 'M'
    changes.push({ path: p, status, staged: map[X] !== undefined && map[X] !== ' ', kind: 'tracked' })
  }
  return { branch, changes }
}

// ========== IPC 处理 ==========
let registered = false
function registerGitHandlers() {
  if (registered) return
  registered = true
  // Git 状态（含分支）
  ipcMain.handle('git-status', async (event, projectPath) => {
    if (!checkProjectRoot(projectPath)) {
      return { ok: false, error: '路径不在允许范围内' }
    }
    // 先探测是否为 git 仓库
    const probe = await runGit(projectPath, ['rev-parse', '--is-inside-work-tree'])
    if (!probe.ok || probe.stdout.trim() !== 'true') {
      return { ok: true, isRepo: false, branch: '', changes: [] }
    }
    const res = await runGit(projectPath, ['status', '--porcelain=v1', '-b'])
    if (!res.ok) {
      return { ok: false, error: res.stderr.trim() || 'git status 失败' }
    }
    const parsed = parsePorcelain(res.stdout)
    return { ok: true, isRepo: true, branch: parsed.branch, changes: parsed.changes }
  })

  // 单文件 Diff（工作区 vs HEAD/暂存区）
  // staged=true → `git show :<file>` 取暂存区版本；staged=false → `git show HEAD:<file>` 取 HEAD 版本
  ipcMain.handle('git-show-version', async (event, projectPath, filePath, staged) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    const rel = safeRel(filePath)
    if (!rel) return { ok: false, error: '非法文件路径' }
    const target = path.join(projectPath, rel)
    if (!isPathAllowed(target)) return { ok: false, error: '文件路径不在允许范围内' }
    const ref = staged ? ':' + rel : 'HEAD:' + rel
    const res = await runGit(projectPath, ['show', ref])
    if (!res.ok) {
      // 可能是未跟踪文件或首次提交无 HEAD，无历史版本可对比
      return { ok: false, error: res.stderr.trim() || 'no-version' }
    }
    return { ok: true, content: res.stdout }
  })

  // 暂存文件
  ipcMain.handle('git-stage', async (event, projectPath, files) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    if (!Array.isArray(files) || !files.length) return { ok: false, error: '未选择文件' }
    const rels = files.map(safeRel)
    if (rels.some((r) => !r)) return { ok: false, error: '非法文件路径' }
    const res = await runGit(projectPath, ['add', '--', ...rels])
    return res.ok ? { ok: true } : { ok: false, error: res.stderr.trim() || '暂存失败' }
  })

  // 取消暂存
  ipcMain.handle('git-unstage', async (event, projectPath, files) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    if (!Array.isArray(files) || !files.length) return { ok: false, error: '未选择文件' }
    const rels = files.map(safeRel)
    if (rels.some((r) => !r)) return { ok: false, error: '非法文件路径' }
    const res = await runGit(projectPath, ['restore', '--staged', '--', ...rels])
    return res.ok ? { ok: true } : { ok: false, error: res.stderr.trim() || '取消暂存失败' }
  })

  // 提交
  ipcMain.handle('git-commit', async (event, projectPath, message) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    const msg = typeof message === 'string' ? message.trim() : ''
    if (!msg) return { ok: false, error: '提交信息不能为空' }
    const res = await runGit(projectPath, ['commit', '-m', msg])
    if (res.ok) return { ok: true, stdout: res.stdout.trim() }
    // 常见情况：无可提交内容
    return { ok: false, error: res.stderr.trim() || '提交失败' }
  })

  // 丢弃工作区改动（不可恢复，前端必须二次确认）
  ipcMain.handle('git-discard', async (event, projectPath, filePath) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    const rel = safeRel(filePath)
    if (!rel) return { ok: false, error: '非法文件路径' }
    const target = path.join(projectPath, rel)
    if (!isPathAllowed(target)) return { ok: false, error: '文件路径不在允许范围内' }
    const res = await runGit(projectPath, ['checkout', '--', rel])
    return res.ok ? { ok: true } : { ok: false, error: res.stderr.trim() || '丢弃失败' }
  })

  // 初始化仓库
  ipcMain.handle('git-init', async (event, projectPath) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    const res = await runGit(projectPath, ['init'])
    return res.ok ? { ok: true } : { ok: false, error: res.stderr.trim() || '初始化失败' }
  })

  // 分支列表（含当前分支标记）
  ipcMain.handle('git-branches', async (event, projectPath) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    const res = await runGit(projectPath, ['branch', '--format=%(HEAD)|%(refname:short)'])
    if (!res.ok) return { ok: false, error: res.stderr.trim() || '分支读取失败' }
    const branches = []
    let current = ''
    for (const line of res.stdout.split(/\r?\n/)) {
      const m = /^(\*?)\|(.*)$/.exec(line.trim())
      if (!m || !m[2]) continue
      if (m[1] === '*') current = m[2]
      branches.push(m[2])
    }
    return { ok: true, branches, current }
  })

  // 切换分支
  ipcMain.handle('git-checkout', async (event, projectPath, branch) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    const name = safeBranch(branch)
    if (!name) return { ok: false, error: '非法分支名' }
    const res = await runGit(projectPath, ['checkout', name])
    return res.ok ? { ok: true } : { ok: false, error: res.stderr.trim() || '切换失败' }
  })

  // 新建分支并切换
  ipcMain.handle('git-create-branch', async (event, projectPath, branch) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    const name = safeBranch(branch)
    if (!name) return { ok: false, error: '非法分支名' }
    const res = await runGit(projectPath, ['checkout', '-b', name])
    return res.ok ? { ok: true } : { ok: false, error: res.stderr.trim() || '创建失败' }
  })

  // 删除分支（-d 安全删除，未合并分支会被 git 拒绝）
  ipcMain.handle('git-delete-branch', async (event, projectPath, branch) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    const name = safeBranch(branch)
    if (!name) return { ok: false, error: '非法分支名' }
    const res = await runGit(projectPath, ['branch', '-d', name])
    return res.ok ? { ok: true } : { ok: false, error: res.stderr.trim() || '删除失败' }
  })

  // 远端信息（判断是否有远程仓库，决定前端是否显示拉取/推送）
  ipcMain.handle('git-remote', async (event, projectPath) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    const res = await runGit(projectPath, ['remote', '-v'])
    if (!res.ok) return { ok: false, error: res.stderr.trim() || '远端读取失败' }
    const remotes = res.stdout.split(/\r?\n/).filter(Boolean).map((l) => l.trim())
    return { ok: true, hasRemote: remotes.length > 0, remotes }
  })

  // 拉取（当前分支，用 upstream 配置；无 upstream 时 git 会给出提示）
  ipcMain.handle('git-pull', async (event, projectPath) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    const res = await runGit(projectPath, ['pull'])
    return res.ok ? { ok: true, stdout: res.stdout.trim() } : { ok: false, error: res.stderr.trim() || '拉取失败' }
  })

  // 推送（当前分支，用 upstream 配置）
  ipcMain.handle('git-push', async (event, projectPath) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    const res = await runGit(projectPath, ['push'])
    return res.ok ? { ok: true, stdout: res.stdout.trim() } : { ok: false, error: res.stderr.trim() || '推送失败' }
  })

  // 抓取远端更新（不合并）
  ipcMain.handle('git-fetch', async (event, projectPath) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    const res = await runGit(projectPath, ['fetch'])
    return res.ok ? { ok: true, stdout: res.stdout.trim() } : { ok: false, error: res.stderr.trim() || '抓取失败' }
  })

  // 提交历史（oneline，最多 100 条）
  ipcMain.handle('git-log', async (event, projectPath, limit) => {
    if (!checkProjectRoot(projectPath)) return { ok: false, error: '路径不在允许范围内' }
    let n = parseInt(limit, 10)
    if (!Number.isFinite(n) || n < 1) n = 30
    if (n > 100) n = 100
    const res = await runGit(projectPath, ['log', '--oneline', '--decorate=short', '-n', String(n)])
    if (!res.ok) return { ok: false, error: res.stderr.trim() || '日志读取失败' }
    const commits = res.stdout.split(/\r?\n/).filter(Boolean).map((l) => l.trim())
    return { ok: true, commits }
  })
}

module.exports = { registerGitHandlers }
