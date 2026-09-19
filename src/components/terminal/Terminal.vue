<!-- src/components/terminal/Terminal.vue -->
<!-- xterm.js + 多标签页，VS Code 风格 -->

<template>
  <div class="terminal-container">
    <!-- ===== 顶部标签栏 ===== -->
    <div class="terminal-tabs">
      <div
        v-for="tab in terminalService.state.tabs"
        :key="tab.id"
        class="tab-item"
        :class="{ active: tab.id === terminalService.state.activeTabId }"
        @click="terminalService.switchTab(tab.id)"
      >
        <span class="tab-name">
          <span
            class="status-dot"
            :class="tab.status === 'running' ? 'running' : 'stopped'"
          ></span>
          {{ tab.name }}
        </span>
        <span
          class="tab-close"
          @click.stop="terminalService.closeTab(tab.id)"
        >✕</span>
      </div>
      
      <!-- 新建终端按钮 -->
      <button class="new-tab-btn" @click="handleNewTerminal" title="新建终端">
        +
      </button>
    </div>

    <!-- ===== xterm.js 终端容器 ===== -->
    <div
      v-for="tab in terminalService.state.tabs"
      :key="tab.id"
      class="xterm-wrapper"
      :class="{ hidden: tab.id !== terminalService.state.activeTabId }"
      :ref="el => setXtermRef(tab.id, el)"
    ></div>

    <!-- ===== 空状态 ===== -->
    <div v-if="terminalService.state.tabs.length === 0" class="empty-state">
      <div class="empty-text">暂无终端</div>
      <button class="empty-btn" @click="handleNewTerminal">+ 新建终端</button>
    </div>

    <!-- ===== 终端选择器弹窗 ===== -->
    <TerminalSelector
      ref="selectorRef"
      v-model="showSelector"
      @confirm="onSelectorConfirm"
      @cancel="onSelectorCancel"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import terminalService from '@/services/terminalService'
import TerminalSelector from './TerminalSelector.vue'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebglAddon } from 'xterm-addon-webgl'
import 'xterm/css/xterm.css'

const projectStore = useProjectStore()

// ============================================================
// xterm 实例管理
// ============================================================
const xtermInstances = new Map()
const xtermRefs = ref({})

function setXtermRef(tabId, el) {
  if (el) {
    xtermRefs.value[tabId] = el
  }
}

// ============================================================
// 状态：选择器
// ============================================================
const selectorRef = ref(null)
const showSelector = ref(false)

// 存储用户偏好（从 localStorage 读取）
const savedShell = ref(localStorage.getItem('terminal_saved_shell') || null)
const rememberChoice = ref(localStorage.getItem('terminal_remember_choice') === 'true')

// ============================================================
// 处理新建终端
// ============================================================
function handleNewTerminal() {
  const projectPath = projectStore.projectPath
  if (!projectPath) {
    console.warn('请先打开一个项目')
    return
  }

  // 如果"记住上一次"为 true，直接创建
  if (rememberChoice.value && savedShell.value) {
    createTerminalDirect(savedShell.value)
    return
  }

  // 否则弹出选择器
  showSelector.value = true
  selectorRef.value?.open()
}

// 选择器确认
async function onSelectorConfirm(result) {
  const { shell, remember } = result
  
  // 保存用户选择
  savedShell.value = shell
  rememberChoice.value = remember
  
  // 保存到 localStorage
  localStorage.setItem('terminal_saved_shell', shell)
  localStorage.setItem('terminal_remember_choice', String(remember))
  
  // 创建终端
  await createTerminalDirect(shell)
}

// 选择器取消
function onSelectorCancel() {
  // 啥也不做
}

// 直接创建终端
async function createTerminalDirect(shellType) {
  try {
    const projectPath = projectStore.projectPath
    if (!projectPath) {
      console.warn('请先打开一个项目')
      return
    }
    
    const name = shellType === 'cmd' ? 'CMD' : 'PowerShell'
    
    const tab = await terminalService.createTerminalTab({
      name: `${name} ${terminalService.state.tabs.length + 1}`,
      cwd: projectPath,
      shell: shellType === 'cmd' ? 'cmd.exe' : 'powershell.exe'
    })
    
    await nextTick()
    initXtermForTab(tab.id)
  } catch (error) {
    console.error('创建终端失败:', error)
  }
}

// 强制打开选择器（供外部调用）
function forceOpenSelector() {
  showSelector.value = true
  selectorRef.value?.open()
}

// ============================================================
// 初始化 xterm
// ============================================================
function initXtermForTab(tabId) {
  const container = xtermRefs.value[tabId]
  if (!container) {
    console.warn('容器不存在:', tabId)
    return
  }

  if (xtermInstances.has(tabId)) {
    return
  }

  /* token-exempt: third-party */
  const terminal = new Terminal({
    theme: {
      background: '#0E1518',
      foreground: '#CCCCCC',
      cursor: '#CCCCCC',
      selectionBackground: '#2A3840',
      black: '#0E1518',
      red: '#EF5350',
      green: '#4CAF50',
      yellow: '#FFB74D',
      blue: '#569CD6',
      magenta: '#C792EA',
      cyan: '#42A5F5',
      white: '#CCCCCC',
      brightBlack: '#5A6A72',
      brightRed: '#EF5350',
      brightGreen: '#4CAF50',
      brightYellow: '#FFB74D',
      brightBlue: '#569CD6',
      brightMagenta: '#C792EA',
      brightCyan: '#42A5F5',
      brightWhite: '#E8E8E8'
    },
  /* end token-exempt */
    fontSize: 13,
    fontFamily: 'Consolas, "Courier New", monospace',
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: 10000,
    allowTransparency: true
  })

  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  try {
    const webglAddon = new WebglAddon()
    terminal.loadAddon(webglAddon)
  } catch (e) {}

  terminal.open(container)
  fitAddon.fit()

  // ===== 聚焦：让终端可输入 =====
  terminal.focus()
  container.addEventListener('click', () => {
    terminal.focus()
  })

  xtermInstances.set(tabId, { terminal, fitAddon, container })

  const tab = terminalService.state.tabs.find(t => t.id === tabId)
  if (tab) {
    if (tab.outputBuffer) {
      terminal.write(tab.outputBuffer)
    }

    const unwatch = watch(
      () => tab.outputBuffer,
      (newVal, oldVal) => {
        if (newVal && newVal.length > (oldVal?.length || 0)) {
          const chunk = newVal.substring(oldVal?.length || 0)
          terminal.write(chunk)
        }
      }
    )
    terminal._unwatch = unwatch
  }

  // 用户输入
  terminal.onData((data) => {
    try {
      terminalService.writeToTerminal(tabId, data)
    } catch (error) {
      console.error('写入终端失败:', error)
    }
  })

  // 窗口大小变化
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit()
    const dims = terminal.cols || 80
    const rows = terminal.rows || 24
    const tab = terminalService.state.tabs.find(t => t.id === tabId)
    if (tab) {
      window.electronAPI.terminalResize({
        sessionId: tab.sessionId,
        cols: dims,
        rows: rows
      }).catch(() => {})
    }
  })
  resizeObserver.observe(container)
  terminal._resizeObserver = resizeObserver
}

// ============================================================
// 清理 xterm 实例
// ============================================================
function disposeXterm(tabId) {
  const instance = xtermInstances.get(tabId)
  if (instance) {
    instance.terminal._unwatch?.()
    instance.terminal._resizeObserver?.disconnect()
    instance.terminal.dispose()
    xtermInstances.delete(tabId)
  }
}

// ============================================================
// 监听 Tab 切换
// ============================================================
watch(
  () => terminalService.state.activeTabId,
  (newId) => {
    if (newId) {
      nextTick(() => {
        const instance = xtermInstances.get(newId)
        if (instance) {
          instance.fitAddon.fit()
          instance.terminal.focus()
        }
      })
    }
  }
)

// ============================================================
// 生命周期
// ============================================================
let offData = null
let offExit = null

onMounted(() => {
  offData = window.electronAPI.onTerminalData((payload) => {
    terminalService.onTerminalData(payload)
  })
  
  offExit = window.electronAPI.onTerminalExit((payload) => {
    terminalService.onTerminalExit(payload)
  })

  if (projectStore.projectPath) {
    setTimeout(() => {
      handleNewTerminal()
    }, 300)
  }
})

onBeforeUnmount(() => {
  for (const [tabId] of xtermInstances) {
    disposeXterm(tabId)
  }
  
  if (offData) offData()
  if (offExit) offExit()
})

// ============================================================
// 暴露方法
// ============================================================
defineExpose({
  createNewTerminal: handleNewTerminal,
  killAll: terminalService.killAllTerminals,
  forceOpenSelector
})
</script>

<style scoped>
.terminal-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-window);
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
}

.terminal-tabs {
  display: flex;
  align-items: center;
  background: var(--surface-window);
  border-bottom: 1px solid var(--border-default);
  height: 32px;
  padding: 0 4px;
  gap: 2px;
  overflow-x: auto;
  flex-shrink: 0;
}
.terminal-tabs::-webkit-scrollbar {
  height: 0;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 var(--space-8);
  height: 26px;
  border-radius: 4px 4px 0 0;
  font-size: 12px;
  color: var(--text-subtle);
  cursor: pointer;
  white-space: nowrap;
  background: transparent;
  transition: all 0.15s ease;
  border-bottom: 2px solid transparent;
  margin-top: 2px;
}

.tab-item:hover {
  background: var(--surface-panel-2);
  color: var(--text-primary);
}

.tab-item.active {
  background: var(--surface-panel-1);
  color: var(--text-strong);
  border-bottom-color: var(--info);
}

.tab-name {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.status-dot.running {
  background: var(--status-ok);
  animation: pulse 1.2s infinite;
}

.status-dot.stopped {
  background: var(--status-err);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}

.tab-close {
  font-size: 10px;
  color: var(--text-muted);
  padding: 0 2px;
  border-radius: 2px;
  cursor: pointer;
  transition: color 0.15s;
}

.tab-close:hover {
  color: var(--text-strong);
  background: var(--surface-raised);
}

.new-tab-btn {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--text-subtle);
  font-size: 16px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
  margin-top: 2px;
}

.new-tab-btn:hover {
  background: var(--surface-panel-2);
  color: var(--text-strong);
}

.xterm-wrapper {
  flex: 1;
  min-height: 0;
  padding: 2px 4px 4px 4px;
  background: var(--surface-window);
}

.xterm-wrapper.hidden {
  display: none;
}

.xterm-wrapper :deep(.xterm) {
  height: 100%;
}

.xterm-wrapper :deep(.xterm-viewport) {
  background: var(--surface-window);
}

.xterm-wrapper :deep(.xterm-screen) {
  background: var(--surface-window);
}

/* ===== 空状态：自适应，不超出界面 ===== */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  gap: 12px;
  padding: 20px;
  min-height: 0;
  overflow: hidden;
}

.empty-text {
  font-size: 14px;
  color: var(--text-subtle);
  flex-shrink: 0;
}

.empty-btn {
  background: var(--surface-panel-2);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  padding: var(--space-8) var(--space-16);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  flex-shrink: 0;
  max-width: 100%;
  white-space: nowrap;
}

.empty-btn:hover {
  background: var(--surface-raised);
  color: var(--text-strong);
}
</style>