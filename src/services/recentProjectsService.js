/**
 * 最近项目列表服务
 * 存于 electron localStorage（用户机器级持久化，跨重启保留）
 * 结构：[{ path, name, lastOpened }]，按 lastOpened 倒序，去重按 path
 */

const STORAGE_KEY = 'myide_recent_projects'
const MAX_ITEMS = 12

/** 从路径取项目名（最后一段目录名） */
function dirNameOf(p) {
  if (!p) return '未命名项目'
  return String(p).split(/[\\/]/).filter(Boolean).pop() || '未命名项目'
}

export async function listRecentProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    console.error('[recentProjects] 读取失败:', e)
    return []
  }
}

/** 登记一个项目（打开/切换/AI 写完后调用），自动去重置顶 */
export async function rememberProject(path) {
  if (!path) return
  try {
    const list = await listRecentProjects()
    const filtered = list.filter((it) => it.path !== path)
    filtered.unshift({ path, name: dirNameOf(path), lastOpened: Date.now() })
    while (filtered.length > MAX_ITEMS) filtered.pop()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch (e) {
    console.error('[recentProjects] 登记失败:', e)
  }
}

/** 移除一个项目（目录已删除等） */
export async function forgetProject(path) {
  if (!path) return
  try {
    const list = await listRecentProjects()
    const kept = list.filter((it) => it.path !== path)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept))
  } catch (e) {
    console.error('[recentProjects] 移除失败:', e)
  }
}
