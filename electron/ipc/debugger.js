const { ipcMain } = require('electron')
const { isPathAllowed } = require('../utils/path-guard')

// Python 服务地址（从 main.js 传入）
let pythonPort = 8765

function setPythonPort(port) {
  pythonPort = port
  console.log(`[Debugger IPC] Python 端口已设置为: ${pythonPort}`)
}

// 调试器端点白名单（POST + GET 分别登记）
const KNOWN_POST = new Set([
  '/debug/launch',
  '/debug/terminate',
  '/debug/breakpoints',
  '/debug/continue',
  '/debug/pause',
  '/debug/step',
  '/debug/evaluate',
])
const KNOWN_GET = new Set([
  '/debug/sessions',
  '/debug/state',
])

// 请求中路径语义字段，转发前必须通过路径守卫
const PATH_FIELDS = ['file', 'path']

const REQUEST_TIMEOUT_MS = 60000

function buildUrl(endpoint, params) {
  let url = `http://127.0.0.1:${pythonPort}${endpoint}`
  if (params && Object.keys(params).length) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.append(k, String(v))
    }
    const s = qs.toString()
    if (s) url += `?${s}`
  }
  return url
}

async function callPython(method, endpoint, data, params) {
  if (typeof endpoint !== 'string') {
    return { success: false, error: 'endpoint 不合法' }
  }
  const known = method === 'POST' ? KNOWN_POST : KNOWN_GET
  if (!known.has(endpoint)) {
    console.warn('[Debugger IPC] 拒绝未知 endpoint:', method, endpoint)
    return { success: false, error: 'endpoint 不在允许范围内' }
  }

  // 路径守卫
  const payload = method === 'POST' ? (data || {}) : (params || {})
  for (const field of PATH_FIELDS) {
    const p = payload[field]
    if (typeof p === 'string' && p && !isPathAllowed(p)) {
      console.warn('[Debugger IPC] 拒绝越权路径:', field, p)
      return { success: false, error: '路径不在允许范围内' }
    }
  }

  const url = buildUrl(endpoint, method === 'GET' ? params : undefined)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(data || {}) : undefined,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const result = await response.json()
    return result
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[Debugger IPC] 调用超时 ${endpoint}`)
      return { success: false, error: 'Python 服务响应超时' }
    }
    console.error(`[Debugger IPC] 调用失败 ${endpoint}:`, error.message)
    return { success: false, error: `Python 服务未响应: ${error.message}` }
  } finally {
    clearTimeout(timer)
  }
}

// ========== IPC 注册 ==========
ipcMain.handle('debug-launch', (_e, data) => callPython('POST', '/debug/launch', data))
ipcMain.handle('debug-terminate', (_e, sid) => callPython('POST', `/debug/${sid}/terminate`, {}))
ipcMain.handle('debug-sessions', () => callPython('GET', '/debug/sessions', null))
ipcMain.handle('debug-breakpoints', (_e, data) => callPython('POST', `/debug/${data.sid}/breakpoints`, data))
ipcMain.handle('debug-continue', (_e, sid) => callPython('POST', `/debug/${sid}/continue`, {}))
ipcMain.handle('debug-pause', (_e, sid) => callPython('POST', `/debug/${sid}/pause`, {}))
ipcMain.handle('debug-step', (_e, data) => callPython('POST', `/debug/${data.sid}/step`, data))
ipcMain.handle('debug-state', (_e, data) => callPython('GET', `/debug/${data.sid}/state`, null, { variables_ref: data.variables_ref }))
ipcMain.handle('debug-evaluate', (_e, data) => callPython('POST', `/debug/${data.sid}/evaluate`, data))

// ========== 导出 ==========
module.exports = { setPythonPort }
