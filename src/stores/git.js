// src/stores/git.js
// Git 状态管理：分支 + 变更列表 + 文件状态映射（供文件树角标使用）
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useGitStore = defineStore('git', () => {
  const isRepo = ref(false)
  const branch = ref('')
  const changes = ref([])          // [{ path, status, staged, kind }]
  const loading = ref(false)
  const error = ref('')
  const fileStatusMap = ref({})    // 绝对路径 → 状态字母（M/A/U/D），文件树角标用

  // 状态字母 → 展示文案
  const STATUS_LABEL = {
    M: '已修改',
    A: '已新增',
    D: '已删除',
    R: '已重命名',
    C: '已复制',
    U: '未跟踪',
  }

  const reset = () => {
    isRepo.value = false
    branch.value = ''
    changes.value = []
    error.value = ''
    fileStatusMap.value = {}
  }

  // 拉取最新 Git 状态
  const refresh = async (projectPath) => {
    if (!projectPath) {
      reset()
      return
    }
    loading.value = true
    error.value = ''
    try {
      const res = await window.electronAPI.gitStatus(projectPath)
      if (res?.ok) {
        isRepo.value = !!res.isRepo
        branch.value = res.branch || ''
        changes.value = res.changes || []
        // 构建 绝对路径 → 状态 映射（状态优先级：已暂存 > 未暂存 > 未跟踪）
        const map = {}
        for (const c of res.changes || []) {
          const abs = projectPath.replace(/\\/g, '/').replace(/\/$/, '') + '/' + c.path
          // 未跟踪标记 U；已暂存优先显示大写字母，未暂存用原字母
          map[abs] = c.status
        }
        fileStatusMap.value = map
        regroup()
      } else {
        error.value = res?.error || 'Git 状态读取失败'
      }
    } catch (e) {
      error.value = e.message || 'Git 状态读取失败'
    } finally {
      loading.value = false
    }
  }

  // 分组：已暂存 / 未暂存 / 未跟踪
  const stagedChanges = ref([])
  const unstagedChanges = ref([])
  const untrackedChanges = ref([])

  const regroup = () => {
    stagedChanges.value = changes.value.filter((c) => c.staged)
    unstagedChanges.value = changes.value.filter((c) => !c.staged && c.kind === 'tracked')
    untrackedChanges.value = changes.value.filter((c) => !c.staged && c.kind === 'untracked')
  }

  // 暂存 / 取消暂存 / 提交 / 丢弃（成功后刷新）
  const stage = async (projectPath, files) => {
    const res = await window.electronAPI.gitStage(projectPath, files)
    if (res?.ok) {
      await refresh(projectPath)
      return true
    }
    throw new Error(res?.error || '暂存失败')
  }

  const unstage = async (projectPath, files) => {
    const res = await window.electronAPI.gitUnstage(projectPath, files)
    if (res?.ok) {
      await refresh(projectPath)
      return true
    }
    throw new Error(res?.error || '取消暂存失败')
  }

  const commit = async (projectPath, message) => {
    const res = await window.electronAPI.gitCommit(projectPath, message)
    if (res?.ok) {
      await refresh(projectPath)
      return true
    }
    throw new Error(res?.error || '提交失败')
  }

  const discard = async (projectPath, filePath) => {
    const res = await window.electronAPI.gitDiscard(projectPath, filePath)
    if (res?.ok) {
      await refresh(projectPath)
      return true
    }
    throw new Error(res?.error || '丢弃失败')
  }

  // ---- 分支管理 ----
  const listBranches = async (projectPath) => {
    const res = await window.electronAPI.gitBranches(projectPath)
    if (res?.ok) return { branches: res.branches || [], current: res.current || '' }
    throw new Error(res?.error || '分支读取失败')
  }

  const checkout = async (projectPath, branch) => {
    const res = await window.electronAPI.gitCheckout(projectPath, branch)
    if (res?.ok) {
      await refresh(projectPath)
      return true
    }
    throw new Error(res?.error || '切换分支失败')
  }

  const createBranch = async (projectPath, branch) => {
    const res = await window.electronAPI.gitCreateBranch(projectPath, branch)
    if (res?.ok) {
      await refresh(projectPath)
      return true
    }
    throw new Error(res?.error || '创建分支失败')
  }

  const deleteBranch = async (projectPath, branch) => {
    const res = await window.electronAPI.gitDeleteBranch(projectPath, branch)
    if (res?.ok) {
      await refresh(projectPath)
      return true
    }
    throw new Error(res?.error || '删除分支失败')
  }

  // ---- 远端同步 ----
  const getRemote = async (projectPath) => {
    const res = await window.electronAPI.gitRemote(projectPath)
    if (res?.ok) return { hasRemote: !!res.hasRemote, remotes: res.remotes || [] }
    return { hasRemote: false, remotes: [] }
  }

  const pull = async (projectPath) => {
    const res = await window.electronAPI.gitPull(projectPath)
    if (res?.ok) return { ok: true, stdout: res.stdout || '' }
    throw new Error(res?.error || '拉取失败')
  }

  const push = async (projectPath) => {
    const res = await window.electronAPI.gitPush(projectPath)
    if (res?.ok) return { ok: true, stdout: res.stdout || '' }
    throw new Error(res?.error || '推送失败')
  }

  const fetchRemote = async (projectPath) => {
    const res = await window.electronAPI.gitFetch(projectPath)
    if (res?.ok) return { ok: true, stdout: res.stdout || '' }
    throw new Error(res?.error || '抓取失败')
  }

  // ---- 提交历史 ----
  const getLog = async (projectPath, limit) => {
    const res = await window.electronAPI.gitLog(projectPath, limit)
    if (res?.ok) return res.commits || []
    throw new Error(res?.error || '日志读取失败')
  }

  return {
    isRepo,
    branch,
    changes,
    loading,
    error,
    fileStatusMap,
    stagedChanges,
    unstagedChanges,
    untrackedChanges,
    STATUS_LABEL,
    refresh,
    regroup,
    reset,
    stage,
    unstage,
    commit,
    discard,
    listBranches,
    checkout,
    createBranch,
    deleteBranch,
    getRemote,
    pull,
    push,
    fetchRemote,
    getLog,
  }
})
