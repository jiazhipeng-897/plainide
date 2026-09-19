const { ipcMain, BrowserWindow } = require('electron')
const axios = require('axios')

let pythonPort = 8765

// 链路计时工具：终端可见（Electron 主进程 console.log 会打到 start.bat 窗口）
const t0 = Date.now()
function ts() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}
function logChain(tag, msg, ms) {
  console.log(`[agent-chain][${ts()}] ${tag} ${msg}${typeof ms === 'number' ? ' (+' + ms + 'ms)' : ''}`)
}

function setPythonPort(port) {
  pythonPort = port
  console.log('[agent-chat] Python 端口已设置:', pythonPort)
}

function getPythonUrl(endpoint) {
  return `http://127.0.0.1:${pythonPort}${endpoint}`
}

// ========== SSE 解析：把 event:/data: 块解析为 {event, data} ==========
function parseSSEBlock(raw) {
  let event = 'message'
  let data = null
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('event:')) {
      event = trimmed.slice(6).trim()
    } else if (trimmed.startsWith('data:')) {
      try {
        data = JSON.parse(trimmed.slice(5).trim())
      } catch (e) {
        data = { raw: trimmed.slice(5).trim() }
      }
    }
  }
  return { event, data }
}

function registerAgentHandlers() {
  // 非流式（保留兼容：旧单轮 chat，不被新链路依赖）
  ipcMain.handle('agent-chat', async (event, params) => {
    // 参数校验：params 必须是对象
    if (!params || typeof params !== 'object') {
      return { success: false, error: '参数必须是对象' }
    }
    const { messages, message, model } = params

    // 日志脱敏：只记录元信息，不打印消息正文
    console.log('[agent-chat] 收到请求, messages:', Array.isArray(messages) ? messages.length : 0, ', message长度:', typeof message === 'string' ? message.length : 0, ', model:', model)

    try {
      const response = await axios({
        method: 'post',
        url: getPythonUrl('/agent/chat'),
        data: {
          messages: Array.isArray(messages) ? messages : [],
          message: typeof message === 'string' ? message : '',
          model: typeof model === 'string' ? model : 'deepseek-v4-flash',
        },
        timeout: 120000,
      })

      console.log('[agent-chat] 响应状态:', response.status)
      // 不打印响应正文，避免代码内容进入日志

      // 直接返回后端数据，不做额外转换
      return response.data
    } catch (error) {
      console.error('[agent-chat] 调用失败:', error.message)
      if (error.response) {
        console.error('[agent-chat] 响应状态:', error.response.status)
      }
      return {
        success: false,
        error: error.message,
      }
    }
  })

  // ========== 流式工作链路（orchestrator）：SSE 逐事件转发到渲染进程 ==========
  ipcMain.handle('agent-chat-stream', async (event, params) => {
    if (!params || typeof params !== 'object') {
      return { success: false, error: '参数必须是对象' }
    }
    const { message, messages, projectPath } = params
    if (typeof message !== 'string' || !message.trim()) {
      return { success: false, error: 'message 不能为空' }
    }

    const win = BrowserWindow.fromWebContents(event.sender)

    const sendEvent = (evt) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('agent-event', evt)
      }
    }

    const sStart = Date.now()
    let firstEventMs = null
    logChain('chat-stream 收到', `消息长度=${message.trim().length}`)
    try {
      const response = await axios({
        method: 'post',
        url: getPythonUrl('/orchestrator/chat'),
        data: {
          message: message.trim(),
          messages: Array.isArray(messages) ? messages : [],
          projectPath: typeof projectPath === 'string' ? projectPath : '',
        },
        responseType: 'stream',
        timeout: 300000,
      })
      logChain('chat-stream 已连接后端', `HTTP ${response.status}`, Date.now() - sStart)

      let buffer = ''
      let evtCount = 0
      for await (const chunk of response.data) {
        buffer += chunk.toString('utf-8')
        let idx
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          const evt = parseSSEBlock(block)
          if (evt.data !== null) {
            if (firstEventMs === null) {
              firstEventMs = Date.now() - sStart
              logChain('chat-stream 首个事件', `${evt.event}`, firstEventMs)
            } else {
              logChain('chat-stream 事件', `${evt.event}`, Date.now() - sStart)
            }
            evtCount++
            sendEvent(evt)
          }
        }
      }
      logChain('chat-stream 结束', `事件数=${evtCount} 总耗时`, Date.now() - sStart)
      return { success: true }
    } catch (error) {
      const ms = Date.now() - sStart
      console.error(`[agent-chat] 流式调用失败 (${ms}ms):`, error.message)
      logChain('chat-stream 失败', error.message, ms)
      sendEvent({ event: 'error', data: { error: error.message } })
      return { success: false, error: error.message }
    }
  })

  // ========== 意图判定（前端分流：dev → 任务；chat/plan → 对话） ==========
  ipcMain.handle('agent-classify', async (event, params) => {
    if (!params || typeof params !== 'object') {
      return { success: false, error: '参数必须是对象', intent: 'chat' }
    }
    const { message } = params
    if (typeof message !== 'string' || !message.trim()) {
      return { success: false, error: 'message 不能为空', intent: 'chat' }
    }
    const cStart = Date.now()
    logChain('classify 收到', `消息长度=${message.trim().length}`)
    try {
      const response = await axios({
        method: 'post',
        url: getPythonUrl('/orchestrator/classify'),
        data: { message: message.trim() },
        timeout: 10000,
      })
      const ms = Date.now() - cStart
      logChain('classify 返回', `intent=${response.data?.intent || 'chat'}`, ms)
      return { success: true, intent: response.data?.intent || 'chat' }
    } catch (error) {
      const ms = Date.now() - cStart
      console.error(`[agent-chat] classify 失败 (${ms}ms):`, error.message)
      logChain('classify 失败', error.message, ms)
      return { success: false, error: error.message, intent: 'chat' }
    }
  })

  // ========== 技术栈建议（dev 任务缺技术栈时调用：弹确认卡片） ==========
  ipcMain.handle('agent-tech-stack', async (event, params) => {
    if (!params || typeof params !== 'object') {
      return { success: false, error: '参数必须是对象' }
    }
    const { message } = params
    if (typeof message !== 'string' || !message.trim()) {
      return { success: false, error: 'message 不能为空' }
    }
    try {
      const response = await axios({
        method: 'post',
        url: getPythonUrl('/orchestrator/tech-stack'),
        data: { message: message.trim() },
        timeout: 10000,
      })
      return { success: true, ...response.data }
    } catch (error) {
      console.error('[agent-chat] tech-stack 失败:', error.message)
      if (error.response) {
        return { success: false, error: error.response.data?.error || error.message }
      }
      return { success: false, error: error.message }
    }
  })

  // ========== 项目计划预览（选完文件夹后调用：一次性 LLM 生成计划，展示卡片等确认） ==========
  ipcMain.handle('agent-plan-preview', async (event, params) => {
    if (!params || typeof params !== 'object') {
      return { success: false, error: '参数必须是对象' }
    }
    const { message, techStack } = params
    if (typeof message !== 'string' || !message.trim()) {
      return { success: false, error: 'message 不能为空' }
    }
    try {
      const response = await axios({
        method: 'post',
        url: getPythonUrl('/orchestrator/plan-preview'),
        data: {
          message: message.trim(),
          techStack: techStack && typeof techStack === 'object' ? techStack : {},
        },
        timeout: 30000,
      })
      return { success: true, ...response.data }
    } catch (error) {
      console.error('[agent-chat] plan-preview 失败:', error.message)
      if (error.response) {
        return { success: false, error: error.response.data?.error || error.message }
      }
      return { success: false, error: error.message }
    }
  })

  // ========== 提交后台任务：立即返回 taskId，不等待执行完 ==========
  ipcMain.handle('agent-submit-task', async (event, params) => {
    if (!params || typeof params !== 'object') {
      return { success: false, error: '参数必须是对象' }
    }
    const { requirement, projectPath, messages, techStack, scale, mode } = params
    if (typeof requirement !== 'string' || !requirement.trim()) {
      return { success: false, error: 'requirement 不能为空' }
    }
    try {
      const response = await axios({
        method: 'post',
        url: getPythonUrl('/orchestrator/submit-task'),
        data: {
          requirement: requirement.trim(),
          projectPath: typeof projectPath === 'string' ? projectPath : '',
          messages: Array.isArray(messages) ? messages : [],
          techStack: techStack && typeof techStack === 'object' ? techStack : undefined,
          scale: typeof scale === 'string' ? scale : 'standard',
          mode: typeof mode === 'string' ? mode : 'full',
        },
        timeout: 15000,
      })
      return { success: true, ...response.data }
    } catch (error) {
      console.error('[agent-chat] submit-task 失败:', error.message)
      if (error.response) {
        return { success: false, error: error.response.data?.error || error.message }
      }
      return { success: false, error: error.message }
    }
  })

  // ========== 项目上下文（续写模式）：选定已有项目后读取记忆+文件数 ==========
  ipcMain.handle('agent-project-context', async (event, params) => {
    if (!params || typeof params !== 'object' || typeof params.projectPath !== 'string' || !params.projectPath.trim()) {
      return { success: false, error: 'projectPath 不能为空' }
    }
    try {
      const response = await axios({
        method: 'post',
        url: getPythonUrl('/orchestrator/project-context'),
        data: { projectPath: params.projectPath.trim() },
        timeout: 15000,
      })
      return { success: true, ...response.data }
    } catch (error) {
      if (error.response) {
        return { success: false, error: error.response.data?.error || error.message }
      }
      return { success: false, error: error.message }
    }
  })

  // ========== 打包任务：写完后用户选"打包成 EXE"（build.bat + 执行，独立任务） ==========
  ipcMain.handle('agent-package-task', async (event, params) => {
    if (!params || typeof params !== 'object') {
      return { success: false, error: '参数必须是对象' }
    }
    const { taskId, projectPath } = params
    if (typeof taskId !== 'string' || !taskId.trim()) {
      return { success: false, error: 'taskId 不能为空' }
    }
    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      return { success: false, error: 'projectPath 不能为空' }
    }
    try {
      const response = await axios({
        method: 'post',
        url: getPythonUrl('/orchestrator/package-task'),
        data: { taskId: taskId.trim(), projectPath: projectPath.trim() },
        timeout: 15000,
      })
      return { success: true, ...response.data }
    } catch (error) {
      console.error('[agent-chat] package-task 失败:', error.message)
      if (error.response) {
        return { success: false, error: error.response.data?.error || error.message }
      }
      return { success: false, error: error.message }
    }
  })

  // ========== 取消任务：终止后台流水线（已生成文件保留） ==========
  ipcMain.handle('agent-cancel-task', async (event, params) => {
    if (!params || typeof params !== 'object' || typeof params.taskId !== 'string') {
      return { success: false, error: 'taskId 不能为空' }
    }
    try {
      const response = await axios({
        method: 'post',
        url: getPythonUrl('/orchestrator/cancel-task'),
        data: { taskId: params.taskId },
        timeout: 10000,
      })
      return { success: true, ...response.data }
    } catch (error) {
      if (error.response) {
        return { success: false, error: error.response.data?.error || error.message }
      }
      return { success: false, error: error.message }
    }
  })

  // ========== 暂停 / 恢复任务：流水线挂起与续跑 ==========
  const controlTask = async (path, taskId) => {
    if (!taskId || typeof taskId !== 'string') {
      return { success: false, error: 'taskId 不能为空' }
    }
    try {
      const response = await axios({
        method: 'post',
        url: getPythonUrl(path),
        data: { taskId },
        timeout: 10000,
      })
      return { success: true, ...response.data }
    } catch (error) {
      if (error.response) {
        return { success: false, error: error.response.data?.error || error.message }
      }
      return { success: false, error: error.message }
    }
  }

  ipcMain.handle('agent-pause-task', async (event, params) =>
    controlTask('/orchestrator/pause-task', params?.taskId))
  ipcMain.handle('agent-resume-task', async (event, params) =>
    controlTask('/orchestrator/resume-task', params?.taskId))

  // ========== question 工具：用户回答 agent 提问（Debugger 等） ==========
  ipcMain.handle('agent-answer-question', async (event, params) => {
    if (!params || typeof params !== 'object') {
      return { success: false, error: '参数必须是对象' }
    }
    const { taskId, questionId, answer } = params
    if (!taskId || typeof taskId !== 'string' ||
        !questionId || typeof questionId !== 'string' ||
        typeof answer !== 'string' || !answer.trim()) {
      return { success: false, error: 'taskId / questionId / answer 不能为空' }
    }
    try {
      const response = await axios({
        method: 'post',
        url: getPythonUrl('/orchestrator/answer'),
        data: { taskId, questionId, answer: answer.trim() },
        timeout: 10000,
      })
      return { success: true, ...response.data }
    } catch (error) {
      if (error.response) {
        return { success: false, error: error.response.data?.error || error.message }
      }
      return { success: false, error: error.message }
    }
  })

  // ========== 共绘蓝图模式（Map-Hand Mode，独立新通道） ==========
  // 构思对话：转发 /map-hand/chat，SSE 逐事件转发（独立事件通道，前端复用现有解析）
  ipcMain.handle('map-hand-chat-stream', async (event, params) => {
    if (!params || typeof params !== 'object') {
      return { success: false, error: '参数必须是对象' }
    }
    const { message, messages, projectPath } = params
    if (typeof message !== 'string' || !message.trim()) {
      return { success: false, error: 'message 不能为空' }
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    // 独立事件通道 'map-hand-event'（与主对话 'agent-event' 隔离，互不干扰）
    const sendEvent = (evt) => {
      if (win && !win.isDestroyed()) win.webContents.send('map-hand-event', evt)
    }
    const sStart = Date.now()
    logChain('map-hand-chat 收到', `消息长度=${message.trim().length}`)
    try {
      const response = await axios({
        method: 'post',
        url: getPythonUrl('/map-hand/chat'),
        data: {
          message: message.trim(),
          messages: Array.isArray(messages) ? messages : [],
          projectPath: typeof projectPath === 'string' ? projectPath : '',
        },
        responseType: 'stream',
        timeout: 300000,
      })
      let buffer = ''
      let evtCount = 0
      for await (const chunk of response.data) {
        buffer += chunk.toString('utf-8')
        let idx
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          const evt = parseSSEBlock(block)
          if (evt.data !== null) {
            evtCount++
            sendEvent(evt)
          }
        }
      }
      logChain('map-hand-chat 结束', `事件数=${evtCount} 总耗时`, Date.now() - sStart)
      return { success: true }
    } catch (error) {
      console.error('[agent-chat] map-hand-chat 失败:', error.message)
      logChain('map-hand-chat 失败', error.message, Date.now() - sStart)
      sendEvent({ event: 'error', data: { error: error.message } })
      return { success: false, error: error.message }
    }
  })

  // 完成构思：转发 /map-hand/finalize，总结设计文档并落盘 .mycode/design.json
  ipcMain.handle('map-hand-finalize', async (event, params) => {
    if (!params || typeof params !== 'object') {
      return { success: false, error: '参数必须是对象' }
    }
    const { requirement, messages, projectPath, scale } = params
    if (typeof projectPath !== 'string' || !projectPath.trim()) {
      return { success: false, error: 'projectPath 不能为空' }
    }
    try {
      const response = await axios({
        method: 'post',
        url: getPythonUrl('/map-hand/finalize'),
        data: {
          requirement: typeof requirement === 'string' ? requirement : '',
          messages: Array.isArray(messages) ? messages : [],
          projectPath: projectPath.trim(),
          scale: typeof scale === 'string' ? scale : 'standard',
        },
        timeout: 180000,
      })
      return { success: true, ...response.data }
    } catch (error) {
      console.error('[agent-chat] map-hand-finalize 失败:', error.message)
      if (error.response) {
        return { success: false, error: error.response.data?.error || error.message }
      }
      return { success: false, error: error.message }
    }
  })

  // ========== 任务状态查询（重连/兜底） ==========
  ipcMain.handle('agent-task-status', async (event, params) => {
    if (!params || typeof params !== 'object' || typeof params.taskId !== 'string') {
      return { success: false, error: 'taskId 不能为空' }
    }
    try {
      const response = await axios({
        method: 'get',
        url: getPythonUrl(`/orchestrator/task-status/${params.taskId}`),
        timeout: 10000,
      })
      return { success: true, ...response.data }
    } catch (error) {
      if (error.response?.status === 404) {
        return { success: false, error: '任务不存在' }
      }
      return { success: false, error: error.message }
    }
  })

  // ========== 任务 SSE 事件流：实时进度转发到渲染进程 ==========
  ipcMain.handle('agent-task-stream', async (event, params) => {
    if (!params || typeof params !== 'object' || typeof params.taskId !== 'string') {
      return { success: false, error: 'taskId 不能为空' }
    }
    const taskId = params.taskId
    const win = BrowserWindow.fromWebContents(event.sender)

    const sendEvent = (evt) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('task-event', { ...evt, taskId })
      }
    }

    try {
      const response = await axios({
        method: 'get',
        url: getPythonUrl(`/orchestrator/task-stream/${taskId}`),
        responseType: 'stream',
        timeout: 600000,
      })

      let buffer = ''
      for await (const chunk of response.data) {
        buffer += chunk.toString('utf-8')
        let idx
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          const evt = parseSSEBlock(block)
          if (evt.data !== null) {
            sendEvent(evt)
          }
        }
      }
      return { success: true }
    } catch (error) {
      console.error('[agent-chat] task-stream 失败:', error.message)
      sendEvent({ event: 'error', data: { error: error.message } })
      return { success: false, error: error.message }
    }
  })
}

module.exports = {
  registerAgentHandlers,
  setPythonPort,
}
