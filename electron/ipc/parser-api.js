const { ipcMain } = require('electron')
const { isPathAllowed } = require('../utils/path-guard')

// Python 服务地址（从 main.js 传入）
let pythonPort = 8765

function setPythonPort(port) {
  pythonPort = port
  console.log(`[Parser API] Python 端口已设置为: ${pythonPort}`)
}

// ========== endpoint 白名单（体检第 4 项修复） ==========
// 只允许转发已知的 Python 接口，杜绝任意 endpoint 探测
const KNOWN_ENDPOINTS = new Set([
  '/scan', '/scan/',
  '/parse', '/parse/',
  '/translate', '/translate/',
  '/doctor/format', '/doctor/reset',
  '/agent/translate', '/agent/chat', '/agent/agents',
  '/file/create', '/folder/create', '/file/delete', '/file/rename',
  '/test-connection',
  '/orchestrator/complete',
  '/orchestrator/ai-edit',
  '/mirror/translate', '/mirror/evaluate', '/mirror/apply',
])

// 请求中含路径语义的字段，转发前必须通过路径守卫白名单校验
const PATH_FIELDS = ['path', 'filePath', 'oldPath', 'dirPath', 'projectPath']

// 转发超时（毫秒），防止 Python 端无响应时 IPC 永久挂起
const REQUEST_TIMEOUT_MS = 60000

async function callPythonAPI(event, { endpoint, data }) {
  // 1. endpoint 白名单校验
  if (typeof endpoint !== 'string' || !KNOWN_ENDPOINTS.has(endpoint)) {
    console.warn('[Parser API] 拒绝未知 endpoint:', endpoint)
    return { success: false, error: 'endpoint 不在允许范围内' }
  }

  // 2. 路径安全校验（体检 TOP1 补充）：/scan、/file/*、/folder/* 等含路径请求
  //    必须落在已登记的白名单根目录内，防止任意目录扫描与读写
  if (data && typeof data === 'object') {
    for (const field of PATH_FIELDS) {
      const p = data[field]
      if (typeof p === 'string' && p && !isPathAllowed(p)) {
        console.warn('[Parser API] 拒绝越权路径访问:', field, p)
        return { success: false, error: '路径不在允许范围内' }
      }
    }
  }

  const url = `http://127.0.0.1:${pythonPort}${endpoint}`
  console.log(`[Parser API] 调用: ${endpoint}`)

  // 3. AbortController 超时
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = await response.json()
    console.log(`[Parser API] 响应:`, result)
    return result
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[Python API] 调用超时 ${endpoint}`)
      return { success: false, error: 'Python 服务响应超时（30s）' }
    }
    console.error(`[Python API] 调用失败 ${endpoint}:`, error.message)
    return {
      success: false,
      error: `Python 服务未响应: ${error.message}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

// ========== IPC 注册 ==========
// 只在模块加载时注册一次
ipcMain.handle('call-python-api', callPythonAPI)

// ========== 导出 ==========
module.exports = {
  setPythonPort,
  callPythonAPI,
}
