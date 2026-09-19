// 后端端口（从文件读取，启动时动态获取）
let backendPort = 8765  // 默认值

// 读取端口号
export async function getBackendPort() {
  try {
    // 如果有 Electron API，通过 IPC 读取文件
    if (window.electronAPI && window.electronAPI.readFile) {
      const portStr = await window.electronAPI.readFile('python/cache/port.txt')
      if (portStr) {
        const port = parseInt(portStr.trim())
        if (!isNaN(port) && port > 0) {
          backendPort = port
          console.log('✅ 后端端口:', backendPort)
          return backendPort
        }
      }
    }
    // 降级：尝试从 HTTP 请求获取端口（通过轮询）
    return await discoverPort()
  } catch (error) {
    console.warn('⚠️ 读取端口失败，使用默认端口 8765')
    return backendPort
  }
}

// 自动发现端口（从 8765 开始尝试）
async function discoverPort() {
  const startPort = 8765
  const maxPort = 8800
  
  for (let port = startPort; port <= maxPort; port++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(500)
      })
      if (response.ok) {
        backendPort = port
        console.log('✅ 发现后端端口:', port)
        return port
      }
    } catch (e) {
      // 继续尝试下一个端口
    }
  }
  console.warn('⚠️ 未发现后端服务，使用默认端口 8765')
  return 8765
}

// 获取当前使用的端口
export function getPort() {
  return backendPort
}

// ========== 对外 API ==========

// 调用 Python API
export async function callPythonAPI(endpoint, data = {}) {
  // 通过 Electron IPC 调用
  if (window.electronAPI && window.electronAPI.callPythonAPI) {
    return window.electronAPI.callPythonAPI(endpoint, data)
  }
  
  // 降级：直接 HTTP
  const baseUrl = `http://127.0.0.1:${backendPort}`
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return await response.json()
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 健康检查
export async function checkPythonHealth() {
  const baseUrl = `http://127.0.0.1:${backendPort}`
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    return await response.json()
  } catch (error) {
    console.warn('⚠️ Python 健康检查失败:', error.message)
    return null
  }
}