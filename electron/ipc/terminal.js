// electron/ipc/terminal.js
// 主进程终端 IPC 处理

const os = require('os')
const path = require('path')
const fs = require('fs')

// node-pty 动态导入
let pty = null
try {
  pty = require('node-pty')
} catch (e) {
  console.warn('node-pty 未安装，终端功能不可用')
}

// 存储所有终端会话
const terminalSessions = new Map()
let sessionIdCounter = 0

// ============================================================
// 工具：查找项目主入口文件
// ============================================================
// ============================================================
// 工具：查找项目主入口文件（递归探测，支持 Python/Node/Go/C++/HTML）
// ============================================================

// 探测可用的 Python 解释器（优先项目虚拟环境，其次系统安装，最后 py 启动器）
function getPythonCmd(projectPath) {
  const venvCandidates = [
    path.join(projectPath, '.venv', 'Scripts', 'python.exe'),
    path.join(projectPath, 'venv', 'Scripts', 'python.exe'),
    path.join(projectPath, '.venv', 'bin', 'python'),
    path.join(projectPath, 'venv', 'bin', 'python'),
  ]
  for (const p of venvCandidates) {
    try { if (fs.existsSync(p)) return `"${p}"` } catch (e) { /* 忽略 */ }
  }
  const sysCandidates = [
    process.env.MYIDE_PYTHON || '',
    'D:\\Program Files\\Python311\\python.exe',
    'D:\\Python311\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Program Files\\Python311\\python.exe',
    'C:\\Program Files\\Python312\\python.exe',
  ].filter(Boolean)
  for (const p of sysCandidates) {
    try { if (fs.existsSync(p)) return `"${p}"` } catch (e) { /* 忽略 */ }
  }
  return 'python' // 兜底：交给系统解析
}

// 扫描时跳过的目录
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.idea', '.vscode', '.venv', 'venv', 'dist', 'build',
  '__pycache__', '.code_rag', '.memory', '.mycode', '.myide', '.preview',
  '.next', '.nuxt', 'out', 'target', '.gradle', '.tox', '.pytest_cache',
])

// 一层子目录里常见的源码目录（入口常放在这些目录里）
const SRC_DIR_HINTS = ['src', 'backend', 'server', 'app', 'python', 'core', 'main', 'lib', 'project']

function findMainFile(projectPath) {
  const results = []
  if (!projectPath || !fs.existsSync(projectPath)) {
    return results
  }

  const pythonCmd = getPythonCmd(projectPath)

  // 收集"根 + 一层常见源码目录"里的候选文件（跳过依赖/隐藏目录）
  const candidates = new Map() // relPath -> absPath
  const collectDir = (dir, depth) => {
    if (depth > 1) return
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) { return }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue
        if (depth === 0 && SRC_DIR_HINTS.includes(ent.name)) {
          collectDir(path.join(dir, ent.name), depth + 1)
        }
      } else if (ent.isFile()) {
        const rel = path.relative(projectPath, path.join(dir, ent.name)).split(path.sep).join('/')
        candidates.set(rel, path.join(dir, ent.name))
      }
    }
  }
  collectDir(projectPath, 0)

  const has = (name) => candidates.has(name)

  // 1) Python：main.py > app.py > manage.py > run.py > server.py（根目录优先）
  const pyPriorities = ['main.py', 'app.py', 'manage.py', 'run.py', 'server.py']
  const pyRoot = pyPriorities.find((f) => fs.existsSync(path.join(projectPath, f)))
  if (pyRoot) {
    results.push({ type: 'python', name: 'Python', startCommand: `${pythonCmd} ${pyRoot}`, file: pyRoot })
  } else {
    for (const f of pyPriorities) {
      const hit = Array.from(candidates.keys()).find((rel) => rel.endsWith('/' + f))
      if (hit) {
        results.push({ type: 'python', name: 'Python', startCommand: `${pythonCmd} ${hit}`, file: hit })
        break
      }
    }
  }

  // 2) Node：package.json（dev/start/serve/main 字段）> main.js/main.ts/index.js/server.js
  if (has('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(candidates.get('package.json'), 'utf8'))
      const scripts = pkg.scripts || {}
      let startCommand = null
      let scriptName = null
      if (scripts.dev) {
        startCommand = 'npm run dev'
        scriptName = 'dev'
      } else if (scripts.start) {
        startCommand = 'npm start'
        scriptName = 'start'
      } else if (scripts.serve) {
        startCommand = 'npm run serve'
        scriptName = 'serve'
      } else if (typeof pkg.main === 'string' && /\.(js|mjs|cjs|ts)$/.test(pkg.main)) {
        startCommand = `node ${pkg.main}`
        scriptName = 'main'
      }
      if (startCommand) {
        results.push({ type: 'node', name: 'Node.js', startCommand, scriptName, file: 'package.json' })
      }
    } catch (e) { /* 忽略 JSON 解析错误 */ }
  } else {
    const jsEntry = ['main.js', 'server.js', 'index.js', 'main.ts', 'index.ts', 'app.js']
      .map((f) => Array.from(candidates.keys()).find((rel) => rel === f || rel.endsWith('/' + f)))
      .find(Boolean)
    if (jsEntry) {
      results.push({ type: 'node', name: 'Node.js', startCommand: `node ${jsEntry}`, file: jsEntry })
    }
  }

  // 3) Go：go.mod + main.go，或直接 main.go
  const goEntry = Array.from(candidates.keys()).find((rel) => rel === 'main.go' || rel.endsWith('/main.go'))
  if (goEntry) {
    results.push({ type: 'go', name: 'Go', startCommand: `go run ${goEntry}`, file: goEntry })
  }

  // 4) C/C++：main.c / main.cpp（有 gcc 则编译运行）
  const cEntry = ['main.c', 'main.cpp', 'main.cc']
    .map((f) => Array.from(candidates.keys()).find((rel) => rel === f || rel.endsWith('/' + f)))
    .find(Boolean)
  if (cEntry) {
    const exe = path.basename(cEntry).replace(/\.(c|cpp|cc)$/, '')
    results.push({
      type: 'cpp', name: 'C/C++',
      startCommand: `gcc "${cEntry}" -o "${exe}.exe" && "${exe}.exe"`,
      file: cEntry,
    })
  }

  // 5) HTML 静态页：没有任何代码入口时才启用（用内置 Python 起本地服务器）
  if (results.length === 0) {
    const htmlEntry = Array.from(candidates.keys()).find((rel) => rel === 'index.html' || rel.endsWith('/index.html'))
    if (htmlEntry) {
      results.push({
        type: 'html', name: 'HTML 静态页',
        startCommand: `${pythonCmd} -m http.server 8000 --directory "${path.dirname(path.join(projectPath, htmlEntry))}"`,
        file: htmlEntry,
      })
    }
  }

  return results
}


// ============================================================
// 创建伪终端
// ============================================================
function createPtySession(cwd, cols = 120, rows = 30, shell = null) {
  if (!pty) {
    throw new Error('node-pty 未安装，请运行: npm install node-pty')
  }

  // 确定 shell
  if (!shell) {
    if (os.platform() === 'win32') {
      shell = 'powershell.exe'
    } else {
      shell = process.env.SHELL || '/bin/bash'
    }
  }

  const sessionId = ++sessionIdCounter
  
  // 创建伪终端进程
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: cols,
    rows: rows,
    cwd: cwd,
    env: process.env,
    useConpty: os.platform() === 'win32'
  })

  const session = {
    id: sessionId,
    process: ptyProcess,
    cwd: cwd,
    shell: shell,
    cols: cols,
    rows: rows,
    status: 'running'
  }

  terminalSessions.set(sessionId, session)

  // 进程退出时自动清理
  ptyProcess.on('exit', (code, signal) => {
    const s = terminalSessions.get(sessionId)
    if (s) {
      s.status = 'stopped'
    }
  })

  return sessionId
}

// ============================================================
// IPC 处理器（兼容你现有的命名）
// ============================================================

// 初始化终端
async function init(event, { cwd, cols, rows, shell }) {
  try {
    const sessionId = createPtySession(cwd || process.cwd(), cols || 120, rows || 30, shell)
    
    // 设置数据监听，转发到渲染进程
    const session = terminalSessions.get(sessionId)
    session.process.on('data', (data) => {
      // 发送到所有窗口
      const { BrowserWindow } = require('electron')
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(win => {
        win.webContents.send('terminal-data', { sessionId, data })
      })
    })

    // 进程退出通知
    session.process.on('exit', (code, signal) => {
      const { BrowserWindow } = require('electron')
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(win => {
        win.webContents.send('terminal-exit', { sessionId, code, signal })
      })
    })

    return { success: true, sessionId }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 终端输入
async function input(event, { sessionId, data }) {
  const session = terminalSessions.get(sessionId)
  if (!session || session.status === 'stopped') {
    return { success: false, error: '终端已关闭' }
  }
  try {
    session.process.write(data)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 调整终端大小
async function resize(event, { sessionId, cols, rows }) {
  const session = terminalSessions.get(sessionId)
  if (!session || session.status === 'stopped') {
    return { success: false, error: '终端已关闭' }
  }
  try {
    session.process.resize(cols, rows)
    session.cols = cols
    session.rows = rows
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 查找项目 main 文件（新增）
async function findMain(event, { projectPath }) {
  if (!projectPath) return []
  return findMainFile(projectPath)
}

// 杀死终端（新增）
async function killTerminal(event, { sessionId }) {
  const session = terminalSessions.get(sessionId)
  if (!session) {
    return { success: false, error: '终端不存在' }
  }
  try {
    session.process.kill()
    session.status = 'stopped'
    terminalSessions.delete(sessionId)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 杀死所有终端（新增）
async function killAll(event) {
  const ids = Array.from(terminalSessions.keys())
  let killed = 0
  for (const id of ids) {
    try {
      const session = terminalSessions.get(id)
      if (session) {
        session.process.kill()
        terminalSessions.delete(id)
        killed++
      }
    } catch (e) {
      // 忽略
    }
  }
  return { success: true, killed }
}

// 列出所有终端会话（新增）
async function listSessions(event) {
  const result = []
  for (const [id, session] of terminalSessions) {
    result.push({
      id,
      cwd: session.cwd,
      shell: session.shell,
      status: session.status,
      cols: session.cols,
      rows: session.rows
    })
  }
  return result
}

// ============================================================
// 导出
// ============================================================
module.exports = {
  // 兼容你现有的命名
  init,
  input,
  resize,
  // 新增方法
  findMain,
  killTerminal,
  killAll,
  listSessions,
  // 工具函数（导出供其他模块使用）
  findMainFile,
  createPtySession,
  terminalSessions
}