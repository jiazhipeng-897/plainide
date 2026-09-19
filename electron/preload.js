const { contextBridge, ipcRenderer } = require('electron')

// ========== 基础 IPC ==========
contextBridge.exposeInMainWorld('electronAPI', {
  // ---- 文件操作 ----
  selectFolder: (options) => ipcRenderer.invoke('select-folder', options),
  pathExists: (payload) => ipcRenderer.invoke('path-exists', payload),
  // 原生对话框关闭后主进程通知重置光标（返回退订函数）
  onCursorReset: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('app-cursor-reset', listener)
    return () => ipcRenderer.removeListener('app-cursor-reset', listener)
  },
  setProjectPath: (projectPath) => ipcRenderer.invoke('set-project-path', projectPath),
  saveChatHistory: (payload) => ipcRenderer.invoke('save-chat-history', payload),
  loadChatHistory: (payload) => ipcRenderer.invoke('load-chat-history', payload),
  clearChatHistory: (payload) => ipcRenderer.invoke('clear-chat-history', payload),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  writeImageFile: (filePath, base64Data) =>
    ipcRenderer.invoke('write-image-file', filePath, base64Data),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  ensureDir: (dirPath) => ipcRenderer.invoke('ensure-dir', dirPath),

  // ---- Python 服务状态（返回移除函数，避免重复注册）----
  onPythonReady: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on('python-ready', listener)
    return () => ipcRenderer.removeListener('python-ready', listener)
  },
  onPythonError: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on('python-error', listener)
    return () => ipcRenderer.removeListener('python-error', listener)
  },

  // ---- 核心：调用 Python API ----
  callPythonAPI: (endpoint, data = {}) => {
    return ipcRenderer.invoke('call-python-api', { endpoint, data })
  },

  // ---- API 配置 ----
  getApiConfig: () => ipcRenderer.invoke('get-api-config'),
  saveApiConfig: (config) => ipcRenderer.invoke('save-api-config', config),

  // ---- 窗口控制 ----
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // ---- 错误窗口 ----
  showErrorWindow: () => ipcRenderer.send('show-error-window'),

  // ---- 终端（新增完整终端方法）----
  terminalInit: (data) => ipcRenderer.invoke('terminal-init', data),
  terminalInput: (data) => ipcRenderer.invoke('terminal-input', data),
  terminalResize: (data) => ipcRenderer.invoke('terminal-resize', data),
  terminalFindMain: (data) => ipcRenderer.invoke('terminal:findMain', data),
  terminalKill: (data) => ipcRenderer.invoke('terminal:kill', data),
  terminalKillAll: () => ipcRenderer.invoke('terminal:killAll'),
  terminalListSessions: () => ipcRenderer.invoke('terminal:listSessions'),

  // ==========================================
  // ---- 交互式调试器（debugpy DAP） ----
  // ==========================================
  debugLaunch: (data) => ipcRenderer.invoke('debug-launch', data),
  debugTerminate: (sid) => ipcRenderer.invoke('debug-terminate', sid),
  debugSessions: () => ipcRenderer.invoke('debug-sessions'),
  debugBreakpoints: (data) => ipcRenderer.invoke('debug-breakpoints', data),
  debugContinue: (sid) => ipcRenderer.invoke('debug-continue', sid),
  debugPause: (sid) => ipcRenderer.invoke('debug-pause', sid),
  debugStep: (data) => ipcRenderer.invoke('debug-step', data),
  debugState: (data) => ipcRenderer.invoke('debug-state', data),
  debugEvaluate: (data) => ipcRenderer.invoke('debug-evaluate', data),

  // ---- 监听终端事件 ----
  onTerminalData: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on('terminal-data', listener)
    return () => ipcRenderer.removeListener('terminal-data', listener)
  },
  onTerminalExit: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on('terminal-exit', listener)
    return () => ipcRenderer.removeListener('terminal-exit', listener)
  },

  // ---- 错误监听 ----
  onNewError: (callback) => {
    const listener = (event, error) => callback(error)
    ipcRenderer.on('new-error', listener)
    return () => ipcRenderer.removeListener('new-error', listener)
  },

  // ==========================================
  // ---- Agent 翻译 ----
  // ==========================================
  agentTranslate: (params) => ipcRenderer.invoke('agent-translate', params),
  saveTranslationMap: (params) => ipcRenderer.invoke('save-translation-map', params),
  loadTranslationMap: (params) => ipcRenderer.invoke('load-translation-map', params),

  // ==========================================
  // ---- 翻译文件读写（新增） ----
  // ==========================================
  loadTranslation: (params) => ipcRenderer.invoke('load-translation', params),
  saveTranslation: (params) => ipcRenderer.invoke('save-translation', params),

  // ==========================================
  // ---- Agent 通用对话（新增） ----
  // ==========================================
  agentChat: (params) => ipcRenderer.invoke('agent-chat', params),

  // ==========================================
  // ---- 多 Agent 工作链路（orchestrator 流式） ----
  // ==========================================
  agentChatStream: (params) => ipcRenderer.invoke('agent-chat-stream', params),
  // 订阅链路事件（返回退订函数）：callback({event, data})
  onAgentEvent: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on('agent-event', listener)
    return () => ipcRenderer.removeListener('agent-event', listener)
  },

  // ==========================================
  // ---- 多 Agent 工作链路（orchestrator 异步任务模式） ----
  // ==========================================
  agentClassify: (params) => ipcRenderer.invoke('agent-classify', params),
  agentTechStack: (params) => ipcRenderer.invoke('agent-tech-stack', params),
  agentPlanPreview: (params) => ipcRenderer.invoke('agent-plan-preview', params),
  agentSubmitTask: (params) => ipcRenderer.invoke('agent-submit-task', params),
  agentProjectContext: (params) => ipcRenderer.invoke('agent-project-context', params),
  agentPackageTask: (params) => ipcRenderer.invoke('agent-package-task', params),
  agentCancelTask: (params) => ipcRenderer.invoke('agent-cancel-task', params),
  agentPauseTask: (params) => ipcRenderer.invoke('agent-pause-task', params),
  agentResumeTask: (params) => ipcRenderer.invoke('agent-resume-task', params),
  agentAnswerQuestion: (params) => ipcRenderer.invoke('agent-answer-question', params),
  agentTaskStatus: (params) => ipcRenderer.invoke('agent-task-status', params),
  agentTaskStream: (params) => ipcRenderer.invoke('agent-task-stream', params),
  // ---- 订阅任务事件流（返回退订函数）：callback({event, data, taskId})
  onTaskEvent: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on('task-event', listener)
    return () => ipcRenderer.removeListener('task-event', listener)
  },

  // ==========================================
  // ---- 共绘蓝图模式（Map-Hand Mode，独立新通道） ----
  // ==========================================
  mapHandChatStream: (params) => ipcRenderer.invoke('map-hand-chat-stream', params),
  mapHandFinalize: (params) => ipcRenderer.invoke('map-hand-finalize', params),
  // 订阅共绘蓝图事件（独立通道，返回退订函数）：callback({event, data})
  onMapHandEvent: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on('map-hand-event', listener)
    return () => ipcRenderer.removeListener('map-hand-event', listener)
  },

  // ==========================================
  // ---- Git 集成 ----
  // ==========================================
  gitStatus: (projectPath) => ipcRenderer.invoke('git-status', projectPath),
  gitShowVersion: (projectPath, filePath, staged) =>
    ipcRenderer.invoke('git-show-version', projectPath, filePath, staged),
  gitStage: (projectPath, files) => ipcRenderer.invoke('git-stage', projectPath, files),
  gitUnstage: (projectPath, files) => ipcRenderer.invoke('git-unstage', projectPath, files),
  gitCommit: (projectPath, message) => ipcRenderer.invoke('git-commit', projectPath, message),
  gitDiscard: (projectPath, filePath) => ipcRenderer.invoke('git-discard', projectPath, filePath),
  gitInit: (projectPath) => ipcRenderer.invoke('git-init', projectPath),
  gitBranches: (projectPath) => ipcRenderer.invoke('git-branches', projectPath),
  gitCheckout: (projectPath, branch) => ipcRenderer.invoke('git-checkout', projectPath, branch),
  gitCreateBranch: (projectPath, branch) => ipcRenderer.invoke('git-create-branch', projectPath, branch),
  gitDeleteBranch: (projectPath, branch) => ipcRenderer.invoke('git-delete-branch', projectPath, branch),
  gitRemote: (projectPath) => ipcRenderer.invoke('git-remote', projectPath),
  gitPull: (projectPath) => ipcRenderer.invoke('git-pull', projectPath),
  gitPush: (projectPath) => ipcRenderer.invoke('git-push', projectPath),
  gitFetch: (projectPath) => ipcRenderer.invoke('git-fetch', projectPath),
  gitLog: (projectPath, limit) => ipcRenderer.invoke('git-log', projectPath, limit),
})
