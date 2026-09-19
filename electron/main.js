const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')
const { spawn, exec, execSync } = require('child_process')
const fs = require('fs')
const net = require('net')
// ========== 错误收集器 ==========
const collector = require('./error-collector')
const { showErrorWindow, getErrorWindow } = require('./error-window')
// ========== Python API 转发 ==========
const parserApi = require('./ipc/parser-api')
const debuggerIpc = require('./ipc/debugger')
// ========== 终端处理器 ==========
const terminalHandlers = require('./ipc/terminal')
// ========== Agent 翻译处理器 ==========
const agentTranslate = require('./ipc/agent-translate')
const agentChat = require('./ipc/agent-chat')
// ========== Git 集成处理器 ==========
const gitHandlers = require('./ipc/git')
// ========== 路径守卫（文件操作白名单） ==========
const { registerRoot, isPathAllowed } = require('./utils/path-guard')

// ========== API 配置文件路径 ==========
const CONFIG_PATH = path.join(app.getPath('userData'), 'api-config.json')
// ========== 全局错误捕获 ==========
process.on('uncaughtException', (error) => {
  collector.add({
    level: 'error',
    message: error.message || '未捕获异常',
    stack: error.stack,
    source: 'system',
  })
})
process.on('unhandledRejection', (reason) => {
  collector.add({
    level: 'error',
    message: reason?.message || String(reason) || '未处理的 Promise 拒绝',
    stack: reason?.stack || null,
    source: 'system',
  })
})
// ========== Python 进程管理 ==========
let pythonProcess = null
let pythonPort = 8765
let isPythonStarting = false
let viteDevProcess = null

// ========== 统一销毁进程 ==========
function killAllChildProcess() {
  if (pythonProcess) {
    const pid = pythonProcess.pid
    const proc = pythonProcess
    pythonProcess = null
    isPythonStarting = false
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${pid} /T /F`, (err) => {
        if (err) {
          console.error('[Python] taskkill 失败:', err.message)
        } else {
          console.log('[Python] 进程已终止 (taskkill)')
        }
      })
    } else {
      try {
        proc.kill('SIGTERM')
        setTimeout(() => {
          try { proc.kill('SIGKILL') } catch (e) {}
        }, 2000)
      } catch (e) {
        console.error('[Python] kill 失败:', e.message)
      }
    }
  }

  if (viteDevProcess) {
    const pid = viteDevProcess.pid
    const proc = viteDevProcess
    viteDevProcess = null
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${pid} /T /F`, (err) => {
        if (!err) console.log('[Vite] 开发服务进程已销毁')
      })
    } else {
      proc.kill('SIGTERM')
      setTimeout(() => proc.kill('SIGKILL'), 2000)
    }
  }
}

// 端口探测
function findAvailablePort(startPort, maxTry = 20) {
  return new Promise((resolve, reject) => {
    let port = startPort
    const tryNext = () => {
      if (port - startPort >= maxTry) {
        return reject(new Error('无法找到可用端口'))
      }
      const server = net.createServer()
      server.once('error', () => {
        port++
        tryNext()
      })
      server.once('listening', () => {
        server.close(() => resolve(port))
      })
      server.listen(port, '127.0.0.1')
    }
    tryNext()
  })
}

// ===== 探测可用的 Python 解释器（根治 PATH 被沙箱/Store stub 污染） =====
function findPython() {
  const candidates = [
    process.env.MYIDE_PYTHON || '',
    'D:\\Program Files\\Python311\\python.exe',
    'D:\\Python311\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Program Files\\Python311\\python.exe',
  ].filter(Boolean)
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p } catch (e) { /* 忽略 */ }
  }
  // py launcher（Windows 官方启动器）
  try {
    const out = execSync('py -3 -c "import sys; print(sys.executable)"', { encoding: 'utf8', timeout: 5000 })
    const p = (out || '').trim()
    if (p && fs.existsSync(p)) return p
  } catch (e) { /* 忽略 */ }
  // PATH 里的真实 python（排除 Store stub 与沙箱 runtime）
  try {
    const out = execSync('where python', { encoding: 'utf8', timeout: 5000 })
    for (const line of (out || '').split(/\r?\n/)) {
      const p = (line || '').trim()
      if (!p) continue
      const low = p.toLowerCase()
      if (low.includes('windowsapps')) continue
      if (low.includes('sandbox_runtime')) continue
      try { if (fs.existsSync(p)) return p } catch (e) { /* 忽略 */ }
    }
  } catch (e) { /* 忽略 */ }
  return 'python' // 最后兜底：交给系统解析
}

// 启动 Python 服务
async function startPythonServer() {
  if (pythonProcess || isPythonStarting) {
    console.log('[Python] 进程已存在，跳过重复启动')
    return
  }
  isPythonStarting = true

  // 启动超时保护：20 秒内未就绪则解除启动锁，防止永久锁死（体检第 7 项修复）
  const startTimeout = setTimeout(() => {
    if (isPythonStarting) {
      isPythonStarting = false
      console.error('[Python] 启动超时（20s），已解除启动锁')
      collector.add({ level: 'error', message: 'Python 后端启动超时（20s）', source: 'python' })
    }
  }, 20000)

  try {
    pythonPort = await findAvailablePort(8765)
    console.log(`[Python] 使用端口: ${pythonPort}`)
  } catch (e) {
    isPythonStarting = false
    console.error('[Python] 端口探测失败:', e.message)
    collector.add({
      level: 'error',
      message: `Python 端口探测失败: ${e.message}`,
      source: 'python',
    })
    return
  }
  const pythonScript = path.join(__dirname, '../python/main.py')
  const pythonExe = findPython()
  console.log('[Python] 使用解释器:', pythonExe)
  pythonProcess = spawn(pythonExe, [pythonScript, '--port', pythonPort.toString()])
  pythonProcess.stdout.on('data', (data) => {
    const msg = data.toString()
    console.log('[Python]', msg)
    if (msg.includes('Uvicorn running') || msg.includes('Application startup complete')) {
      onBackendReady()
    }
  })

  // 后端就绪轮询：stdout 字符串不可靠，主动探测端口（幂等，onBackendReady 只执行一次）
  let backendReadyCalled = false
  const onBackendReady = () => {
    if (backendReadyCalled) return
    backendReadyCalled = true
    isPythonStarting = false
    clearTimeout(startTimeout)
    parserApi.setPythonPort(pythonPort)
    debuggerIpc.setPythonPort(pythonPort)
    if (mainWindow) {
      mainWindow.webContents.send('python-ready', { port: pythonPort })
    }
    console.log('[Python] 后端已就绪:', pythonPort)
  }
  const pollBackend = async (retries = 40) => {
    for (let i = 0; i < retries && backendReadyCalled === false; i++) {
      await new Promise(r => setTimeout(r, 500))
      try {
        await new Promise((resolve) => {
          const s = net.connect(pythonPort, '127.0.0.1')
          s.once('connect', () => { s.destroy(); resolve(true) })
          s.once('error', () => { s.destroy(); resolve(false) })
          s.setTimeout(1000, () => { s.destroy(); resolve(false) })
        }).then((ok) => {
          if (ok) onBackendReady()
        })
      } catch (e) { /* 忽略单次探测失败 */ }
    }
    if (!backendReadyCalled) {
      console.error('[Python] 后端 20 秒内未就绪（端口无响应）')
      collector.add({ level: 'error', message: 'Python 后端 20 秒内未就绪（端口无响应）', source: 'python' })
    }
  }
  pollBackend()
  pythonProcess.stderr.on('data', (data) => {
    const msg = data.toString()
    console.error('[Python Error]', msg)
    collector.add({
      level: 'error',
      message: `Python 后端错误: ${msg}`,
      source: 'python',
    })
    if (mainWindow) {
      mainWindow.webContents.send('python-error', { error: msg })
    }
  })
  pythonProcess.on('close', (code) => {
    console.log(`[Python] 进程退出，代码: ${code}`)
    pythonProcess = null
    isPythonStarting = false
    clearTimeout(startTimeout)
  })
  pythonProcess.on('error', (err) => {
    console.error('[Python] 启动失败:', err)
    pythonProcess = null
    isPythonStarting = false
    clearTimeout(startTimeout)
  })
}

function startViteDevServer() {
  return new Promise((resolve, reject) => {
    findAvailablePort(5173, 10).then(port => {
      const url = `http://localhost:${port}`
      console.log(`[Vite] 使用端口: ${port}`)
      
      viteDevProcess = spawn('npm', ['run', 'dev', '--', '--port', port.toString()], {
        cwd: path.resolve(__dirname, '../'),
        shell: true
      })
      
      let isReady = false
      
      viteDevProcess.stdout.on('data', (data) => {
        const msg = data.toString()
        console.log('[Vite]', msg)
        if (!isReady && (msg.includes('ready') || msg.includes('Local:'))) {
          isReady = true
          resolve(url)
        }
      })
      
      viteDevProcess.stderr.on('data', (data) => {
        const msg = data.toString()
        console.error('[Vite Err]', msg)
        if (msg.includes('Port') && msg.includes('is already in use')) {
          reject(new Error('端口被占用'))
        }
      })
      
      viteDevProcess.on('error', (err) => {
        reject(err)
      })
      
      setTimeout(() => {
        if (!isReady) {
          resolve(url)
        }
      }, 5000)
    }).catch(err => {
      reject(err)
    })
  })
}

// ========== IPC 处理 ==========
ipcMain.handle('path-exists', (_event, payload) => {
  try {
    const p = (payload && payload.path) || ''
    return !!(p && fs.existsSync(p))
  } catch (e) {
    return false
  }
})

ipcMain.handle('select-folder', async (_event, options) => {
  // 修复：不传 parent（无主对话框）。frameless 窗口 + parent 模态对话框在 Windows
  // 会触发光标渲染 bug——浏览文件夹过程中指针消失，关闭后才恢复（治标）。
  // 无主对话框光标正常，关闭后仍执行恢复逻辑兜底。
  const result = await dialog.showOpenDialog({
    title: (options && options.title) || '选择项目文件夹',
    properties: ['openDirectory', 'createDirectory'],
  })
  // 兜底：frameless 窗口 + Windows 原生对话框关闭后，鼠标指针可能不恢复。
  // 强制主窗口聚焦 + 通知渲染进程重置光标状态。
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus()
    mainWindow.webContents.send('app-cursor-reset')
  }
  if (!result.canceled && result.filePaths.length > 0) {
    // 登记为允许的文件操作根目录（路径守卫）
    registerRoot(result.filePaths[0])
    return result.filePaths[0]
  }
  return null
})
// 前端打开项目时显式登记项目根目录（路径守卫）
ipcMain.handle('set-project-path', (event, projectPath) => {
  if (typeof projectPath !== 'string' || !projectPath.trim()) {
    return false
  }
  return registerRoot(projectPath)
})
ipcMain.handle('read-file', (event, filePath) => {
  try {
    if (!isPathAllowed(filePath)) {
      console.warn('[IPC] 拒绝越权读取:', filePath)
      return null
    }
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8')
    }
    return null
  } catch (e) {
    return null
  }
})
ipcMain.handle('write-file', (event, filePath, content) => {
  try {
    if (!isPathAllowed(filePath)) {
      console.warn('[IPC] 拒绝越权写入:', filePath)
      return false
    }
    if (typeof content !== 'string') {
      console.warn('[IPC] 写入内容必须为字符串')
      return false
    }
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
  } catch (e) {
    return false
  }
})
// 写入图片文件（base64 → Buffer），供 AI 生图落盘到项目 assets/ 等目录
ipcMain.handle('write-image-file', (event, filePath, base64Data) => {
  try {
    if (!isPathAllowed(filePath)) {
      console.warn('[IPC] 拒绝越权写入图片:', filePath)
      return { success: false, error: '路径不在允许范围内' }
    }
    const ext = (path.extname(filePath) || '').toLowerCase()
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      return { success: false, error: '仅支持 png/jpg/jpeg/webp 图片格式' }
    }
    if (typeof base64Data !== 'string' || !base64Data) {
      return { success: false, error: '图片数据为空' }
    }
    const clean = base64Data.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
    const buffer = Buffer.from(clean, 'base64')
    if (!buffer.length) {
      return { success: false, error: '图片数据解码失败' }
    }
    fs.writeFileSync(filePath, buffer)
    return { success: true, path: filePath, bytes: buffer.length }
  } catch (e) {
    return { success: false, error: e.message || '图片写入失败' }
  }
})
ipcMain.handle('delete-file', (event, filePath) => {
  try {
    if (!isPathAllowed(filePath)) {
      console.warn('[IPC] 拒绝越权删除:', filePath)
      return false
    }
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      return true
    }
    return false
  } catch (e) {
    return false
  }
})
// ========== 确保目录存在 ==========
ipcMain.handle('ensure-dir', async (event, dirPath) => {
  try {
    if (!isPathAllowed(dirPath)) {
      console.warn('[IPC] 拒绝越权创建目录:', dirPath)
      return false
    }
    await fs.promises.mkdir(dirPath, { recursive: true })
    return true
  } catch (e) {
    console.error('[IPC] 创建目录失败:', dirPath, e)
    return false
  }
})

// ========== API 配置读写（实际持久化，按厂商分组存储） ==========
// 存储结构：{ current: 'deepseek', providers: { deepseek: {api_key, model, base_url}, ... } }
// 兼容旧扁平结构（{ provider, api_key, model, base_url }），读取/保存时自动归一化
const PROVIDERS_ALL = ['deepseek', 'volcengine', 'qwen', 'tencent', 'baidu', 'minimax', 'kimi', 'openai']

function normalizeApiConfig(cfg) {
  const base = { current: 'deepseek', providers: {}, snapshot_dir: '', web_search: false }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return base
  const webSearch = typeof cfg.web_search === 'boolean' ? cfg.web_search : false
  if (cfg.providers && typeof cfg.providers === 'object') {
    // 新结构：补齐缺失厂商的空条目，保证前端切厂商能拿到干净配置
    const providers = {}
    for (const p of PROVIDERS_ALL) {
      providers[p] = (cfg.providers[p] && typeof cfg.providers[p] === 'object')
        ? { api_key: cfg.providers[p].api_key || '', model: cfg.providers[p].model || '', base_url: cfg.providers[p].base_url || '' }
        : { api_key: '', model: '', base_url: '' }
    }
    return { current: PROVIDERS_ALL.includes(cfg.current) ? cfg.current : 'deepseek', providers, snapshot_dir: typeof cfg.snapshot_dir === 'string' ? cfg.snapshot_dir : '', web_search: webSearch }
  }
  // 旧扁平结构：迁移到新结构
  const p = PROVIDERS_ALL.includes(cfg.provider) ? cfg.provider : 'deepseek'
  const providers = {}
  for (const key of PROVIDERS_ALL) {
    providers[key] = { api_key: '', model: '', base_url: '' }
  }
  providers[p] = {
    api_key: cfg.api_key || '',
    model: cfg.model || '',
    base_url: cfg.base_url || '',
  }
  return { current: p, providers, snapshot_dir: typeof cfg.snapshot_dir === 'string' ? cfg.snapshot_dir : '', web_search: webSearch }
}

ipcMain.handle('get-api-config', () => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      return normalizeApiConfig(raw)
    }
  } catch (e) {
    console.error('读取配置失败:', e)
  }
  return normalizeApiConfig({})
})

ipcMain.handle('save-api-config', (event, config) => {
  try {
    const normalized = normalizeApiConfig(config)
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2), 'utf-8')
    return true
  } catch (e) {
    console.error('保存配置失败:', e)
    return false
  }
})

// ========== 项目聊天记录读写（按项目持久化到 <项目>/.myide/chat-history.json） ==========
// 聊天记录跟随项目走：打开旧项目恢复记录，无项目（临时聊天）不落盘，关软件即销毁。
// 所有写入均经路径白名单校验（isPathAllowed），防路径穿越。
const CHAT_HISTORY_DIR = '.myide'
const CHAT_HISTORY_FILE = 'chat-history.json'

function chatHistoryPath(projectPath) {
  if (typeof projectPath !== 'string' || !projectPath.trim()) return null
  return path.join(projectPath, CHAT_HISTORY_DIR, CHAT_HISTORY_FILE)
}

ipcMain.handle('save-chat-history', (event, payload) => {
  try {
    const projectPath = payload && typeof payload === 'object' ? payload.projectPath : null
    const messages = payload && Array.isArray(payload.messages) ? payload.messages : []
    const filePath = chatHistoryPath(projectPath)
    if (!filePath || !isPathAllowed(filePath)) {
      console.warn('[IPC] 拒绝越权保存聊天记录:', filePath)
      return false
    }
    // 裁剪到安全字段，避免把运行时对象/敏感大对象落盘
    const slim = messages
      .filter((m) => m && (m.role === 'user' || (m.role === 'assistant' && m.text)))
      .slice(-100)
      .map((m) => ({ id: m.id, role: m.role, text: m.text, time: m.time }))
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(slim, null, 2), 'utf-8')
    return true
  } catch (e) {
    console.error('[IPC] 保存聊天记录失败:', e.message)
    return false
  }
})

ipcMain.handle('load-chat-history', (event, payload) => {
  try {
    const projectPath = payload && typeof payload === 'object' ? payload.projectPath : null
    const filePath = chatHistoryPath(projectPath)
    if (!filePath || !isPathAllowed(filePath)) {
      console.warn('[IPC] 拒绝越权读取聊天记录:', filePath)
      return []
    }
    if (!fs.existsSync(filePath)) return []
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return Array.isArray(data) ? data.filter((m) => m && typeof m.text === 'string') : []
  } catch (e) {
    return []
  }
})

ipcMain.handle('clear-chat-history', (event, payload) => {
  try {
    const projectPath = payload && typeof payload === 'object' ? payload.projectPath : null
    const filePath = chatHistoryPath(projectPath)
    if (!filePath || !isPathAllowed(filePath)) {
      console.warn('[IPC] 拒绝越权清除聊天记录:', filePath)
      return false
    }
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return true
  } catch (e) {
    console.error('[IPC] 清除聊天记录失败:', e.message)
    return false
  }
})

// ===== 终端 IPC 注册 =====
ipcMain.handle('terminal-init', terminalHandlers.init)
ipcMain.handle('terminal-input', terminalHandlers.input)
ipcMain.handle('terminal-resize', terminalHandlers.resize)
ipcMain.handle('terminal:findMain', terminalHandlers.findMain)
ipcMain.handle('terminal:kill', terminalHandlers.killTerminal)
ipcMain.handle('terminal:killAll', terminalHandlers.killAll)
ipcMain.handle('terminal:listSessions', terminalHandlers.listSessions)

ipcMain.on('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize()
  }
})
ipcMain.on('window-maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  }
})
ipcMain.on('window-close', () => {
  killAllChildProcess()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close()
  }
})
ipcMain.on('show-error-window', () => {
  showErrorWindow()
})
ipcMain.on('error-window-minimize', () => {
  const win = getErrorWindow()
  if (win && !win.isDestroyed()) {
    win.minimize()
  }
})
ipcMain.on('error-window-maximize', () => {
  const win = getErrorWindow()
  if (win && !win.isDestroyed()) {
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  }
})
ipcMain.on('error-window-close', () => {
  const win = getErrorWindow()
  if (win && !win.isDestroyed()) {
    win.close()
  }
})

// ========== 菜单 ==========
const menuTemplate = [
  {
    label: '查看',
    submenu: [
      {
        label: '📋 错误日志',
        click: () => showErrorWindow(),
        accelerator: 'CmdOrCtrl+Shift+E',
      },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'toggleDevTools' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
    ],
  },
]
Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))

// ========== 主窗口 ==========
let mainWindow
let splashWindow = null

// ========== 启动页窗口（缓冲白屏） ==========
function createSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    return
  }
  splashWindow = new BrowserWindow({
    width: 460,
    height: 330,
    icon: path.join(__dirname, 'plain-ide-icon.ico'),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
  splashWindow.center()
  splashWindow.on('closed', () => {
    splashWindow = null
  })
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.destroy()
  }
  splashWindow = null
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, 'plain-ide-icon.ico'),
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    show: false, // 先隐藏，ready-to-show 后再显示，避免白屏
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // webSecurity 保持默认开启（已移除 webSecurity:false，体检 TOP2 修复）
    },
  })

  // 页面首次渲染就绪后：关启动页，显示主窗口
  mainWindow.once('ready-to-show', () => {
    closeSplash()
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  })

  // 兜底：12 秒内未就绪也强制切换，避免永远停在启动页
  setTimeout(() => {
    closeSplash()
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  }, 12000)
  
  const isDev = process.env.NODE_ENV === 'development'
  
  if (isDev) {
    startViteDevServer().then(url => {
      mainWindow.loadURL(url)
    }).catch(err => {
      console.error('[Vite] 启动失败:', err)
      mainWindow.loadURL('http://localhost:5173')
    })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  
  mainWindow.webContents.on('crashed', () => {
    collector.add({
      level: 'error',
      message: '渲染进程崩溃',
      source: 'renderer',
    })
  })
}

// ==========================================
// app.whenReady - 启动所有服务并注册处理器
// ==========================================
app.whenReady().then(async () => {
  createSplashWindow()
  createWindow()
  await startPythonServer()

  // ---- 设置 Python 端口并注册处理器 ----
  agentTranslate.setPythonPort(pythonPort)
  agentTranslate.registerAgentHandlers()
  agentChat.setPythonPort(pythonPort)
  agentChat.registerAgentHandlers()
  // ---- Git 集成处理器（不依赖 Python 端口） ----
  gitHandlers.registerGitHandlers()
})

app.on('window-all-closed', () => {
  killAllChildProcess()
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => {
  killAllChildProcess()
})
app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSplashWindow()
    createWindow()
    await startPythonServer()
    // ---- 重新注册处理器 ----
    agentTranslate.setPythonPort(pythonPort)
    agentTranslate.registerAgentHandlers()
    agentChat.setPythonPort(pythonPort)
    agentChat.registerAgentHandlers()
  }
})
