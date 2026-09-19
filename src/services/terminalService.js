// src/renderer/services/terminalService.js
// 终端核心逻辑 - 一个文件搞定所有

import { ref, reactive, computed } from 'vue'
import { useProjectStore } from '@/stores/project'

// ============================================================
// 状态管理（单例）
// ============================================================
const state = reactive({
  tabs: [],                // { id, name, sessionId, status, cwd }
  activeTabId: null,
  isReady: false
})

let tabIdCounter = 0

// ============================================================
// 核心方法
// ============================================================

// 查找项目主入口文件
async function findMainFiles(projectPath) {
  if (!projectPath) {
    projectPath = useProjectStore().projectPath
  }
  if (!projectPath) {
    throw new Error('请先打开一个项目')
  }
  
  const result = await window.electronAPI.terminalFindMain({ projectPath })
  return result || []
}

// 启动项目（查找 main + 创建终端）
async function startProject(projectPath) {
  if (!projectPath) {
    projectPath = useProjectStore().projectPath
  }
  if (!projectPath) {
    throw new Error('请先打开一个项目')
  }

  // 1. 查找 main 文件
  const entries = await findMainFiles(projectPath)
  
  if (entries.length === 0) {
    throw new Error('未找到可识别的项目入口文件 (main.py / package.json / main.go)')
  }

  // 2. 为每个入口创建一个终端 Tab
  const createdTabs = []
  for (const entry of entries) {
    const tab = await createTerminalTab({
      name: entry.name || entry.type,
      cwd: projectPath,
      startCommand: entry.startCommand,
      entry: entry
    })
    createdTabs.push(tab)
  }

  // 3. 激活第一个 Tab
  if (createdTabs.length > 0) {
    state.activeTabId = createdTabs[0].id
  }

  return createdTabs
}

// ============================================================
// 创建终端 Tab（✅ 已修改：新增 shell 参数）
// ============================================================
async function createTerminalTab(options = {}) {
  const {
    name = `终端 ${state.tabs.length + 1}`,
    cwd = useProjectStore().projectPath,
    startCommand = null,
    entry = null,
    shell = null  // ← 新增：指定 shell 类型 (cmd.exe / powershell.exe)
  } = options

  if (!cwd) {
    throw new Error('请先打开一个项目')
  }

  const id = ++tabIdCounter
  
  // 创建伪终端，传入 shell 参数
  const result = await window.electronAPI.terminalInit({
    cwd: cwd,
    cols: 120,
    rows: 30,
    shell: shell  // ← 新增：传给主进程
  })

  if (!result.success) {
    throw new Error(result.error || '创建终端失败')
  }

  const tab = {
    id,
    name: name,
    sessionId: result.sessionId,
    status: 'running',
    cwd: cwd,
    startCommand: startCommand,
    entry: entry,
    outputBuffer: ''
  }

  state.tabs.push(tab)
  state.activeTabId = id

  // 如果有启动命令，自动执行
  if (startCommand) {
    setTimeout(() => {
      writeToTerminal(id, startCommand + '\n')
    }, 300)
  }

  return tab
}

// ============================================================
// 其他方法（保持不变）
// ============================================================

// 写入终端
function writeToTerminal(tabId, data) {
  const tab = state.tabs.find(t => t.id === tabId)
  if (!tab) {
    throw new Error('终端不存在')
  }
  
  window.electronAPI.terminalInput({
    sessionId: tab.sessionId,
    data: data
  }).catch(err => {
    console.error('写入终端失败:', err)
  })
}

// 杀死终端
async function killTerminal(tabId) {
  const tab = state.tabs.find(t => t.id === tabId)
  if (!tab) {
    return { success: false, error: '终端不存在' }
  }

  const result = await window.electronAPI.terminalKill({
    sessionId: tab.sessionId
  })

  if (result.success) {
    tab.status = 'stopped'
    const index = state.tabs.indexOf(tab)
    if (index > -1) {
      state.tabs.splice(index, 1)
    }
    if (state.activeTabId === tabId) {
      state.activeTabId = state.tabs[0]?.id || null
    }
  }

  return result
}

// 杀死所有终端
async function killAllTerminals() {
  const result = await window.electronAPI.terminalKillAll()
  state.tabs = []
  state.activeTabId = null
  return result
}

// 切换 Tab
function switchTab(tabId) {
  const tab = state.tabs.find(t => t.id === tabId)
  if (tab) {
    state.activeTabId = tabId
  }
}

// 关闭 Tab
async function closeTab(tabId) {
  await killTerminal(tabId)
}

// 清空终端输出
function clearOutput(tabId) {
  const tab = state.tabs.find(t => t.id === tabId)
  if (tab) {
    tab.outputBuffer = ''
  }
}

// 接收终端数据
function onTerminalData(payload) {
  const { sessionId, data } = payload
  const tab = state.tabs.find(t => t.sessionId === sessionId)
  if (tab) {
    tab.outputBuffer += data
  }
}

// 终端退出事件
function onTerminalExit(payload) {
  const { sessionId } = payload
  const tab = state.tabs.find(t => t.sessionId === sessionId)
  if (tab) {
    tab.status = 'stopped'
  }
}

// ============================================================
// 导出
// ============================================================
export default {
  state,
  findMainFiles,
  startProject,
  createTerminalTab,
  writeToTerminal,
  killTerminal,
  killAllTerminals,
  switchTab,
  closeTab,
  clearOutput,
  onTerminalData,
  onTerminalExit
}