<template>
  <div class="titlebar">
    <div class="titlebar-left">
      <span class="logo-text">
        <svg class="logo-mark" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6.3 7.7 L3.5 12 L6.3 16.3" stroke="currentColor" stroke-width="1.9" stroke-linecap="square"/>
          <path d="M12.8 16.3 L15.1 7.7" stroke="currentColor" stroke-width="1.9" stroke-linecap="square"/>
          <path d="M17.2 7.7 L20 12 L17.2 16.3" stroke="currentColor" stroke-width="1.9" stroke-linecap="square"/>
          <line x1="21.6" y1="10" x2="21.6" y2="14" stroke="#4EC9B0" stroke-width="1.4"/>
        </svg>
        Plain IDE
      </span>
      <span class="project-name" v-if="projectStore.projectPath">
        {{ getFileName(projectStore.projectPath) }}
      </span>
    </div>

    <div class="titlebar-menu">
      <span class="menu-item" @click="handleMenu('file')">📂 文件</span>
      <span class="menu-item" @click="openSearch">🔍 搜索</span>
      <span class="menu-item" @click="handleMenu('run')">▶ 运行</span>
      <span class="menu-item" @click="handleMenu('settings')">⚙️ 设置</span>
      <span class="menu-item" @click="handleMenu('login')">🔐 登录</span>
    </div>

    <div class="titlebar-drag-area"></div>

    <div class="titlebar-actions">
      <span class="status" :class="pythonStatus">
        {{ pythonStatus === 'running' ? '● Python已连接' : '○ Python未连接' }}
      </span>
      <button class="titlebar-btn" @click="minimizeWindow">─</button>
      <button class="titlebar-btn" @click="maximizeWindow">☐</button>
      <button class="titlebar-btn close" @click="closeWindow">✕</button>
    </div>

    <el-dropdown v-if="showFileMenu" trigger="click" @visible-change="onFileMenuVisible">
      <span style="display:none"></span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item @click="openProject">📂 打开项目</el-dropdown-item>
          <el-dropdown-item @click="closeProject" :disabled="!projectStore.projectPath">✕ 关闭项目</el-dropdown-item>
          <el-dropdown-item @click="switchProject" :disabled="!projectStore.projectPath">🔄 切换项目</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <GlobalSearch v-model:visible="searchVisible" />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useEditorStore } from '@/stores/editor'
import { useTranslationStore } from '@/stores/translation'
import { ElMessage } from 'element-plus'
import { GlobalSearch } from '@/components/search'
import { getFileName } from '@/utils/pathHelper'
import { EVENT_OPEN_SETTINGS } from '@/constants/eventNames'
// ===== 新增：导入终端服务 =====
import terminalService from '@/services/terminalService'

const projectStore = useProjectStore()
const editorStore = useEditorStore()
const translationStore = useTranslationStore()

const pythonStatus = ref('running')
const showFileMenu = ref(false)
const searchVisible = ref(false)

let offPythonReady = null
let offPythonError = null

const minimizeWindow = () => window.electronAPI?.minimizeWindow?.()
const maximizeWindow = () => window.electronAPI?.maximizeWindow?.()
const closeWindow = () => window.electronAPI?.closeWindow?.()

const handleMenu = async (item) => {
  if (item === 'file') {
    showFileMenu.value = !showFileMenu.value
  } else if (item === 'settings') {
    window.dispatchEvent(new CustomEvent(EVENT_OPEN_SETTINGS))
  } else if (item === 'run') {
    // ===== 修改：运行按钮绑定终端逻辑 =====
    if (!projectStore.projectPath) {
      ElMessage.warning('⚠️ 请先打开一个项目')
      return
    }
    // 检查是否已有「正在运行」的终端，避免重复启动（已停止的残留 tab 不拦截）
    const runningTabs = terminalService.state.tabs.filter((t) => t.status === 'running')
    if (runningTabs.length > 0) {
      ElMessage.info('ℹ️ 终端已运行，如需重新启动请先关闭所有终端')
      return
    }
    try {
      ElMessage.info('🚀 正在启动项目...')
      const tabs = await terminalService.startProject(projectStore.projectPath)
      if (tabs && tabs.length > 0) {
        ElMessage.success(`✅ 已启动 ${tabs.length} 个服务`)
        // 触发事件，让底部终端面板展开
        window.dispatchEvent(new CustomEvent('terminal-started'))
      } else {
        ElMessage.warning('⚠️ 未找到可识别的项目入口文件')
      }
    } catch (error) {
      ElMessage.error(error.message || '❌ 启动失败')
    }
  } else if (item === 'login') {
    ElMessage.info('🔐 登录功能开发中...')
  }
}

const onFileMenuVisible = (visible) => {
  if (!visible) showFileMenu.value = false
}

const openProject = async () => {
  const result = await window.electronAPI.selectFolder?.()
  if (result) {
    projectStore.setProjectPath(result)
    await projectStore.scanDirectory()
    await translationStore.loadCache(result)
    ElMessage.success(`📁 已打开项目: ${getFileName(result)}`)
  }
  showFileMenu.value = false
}

const closeProject = () => {
  if (!projectStore.projectPath) return
  // 关闭项目时顺便清理所有终端
  terminalService.killAllTerminals()
  projectStore.closeProject()
  ElMessage.success('项目已关闭')
  showFileMenu.value = false
}

const switchProject = async () => {
  if (!projectStore.projectPath) return
  const result = await window.electronAPI.selectFolder?.()
  if (result) {
    // 切换项目时清理旧终端的终端
    terminalService.killAllTerminals()
    projectStore.closeProject()
    projectStore.setProjectPath(result)
    await projectStore.scanDirectory()
    await translationStore.loadCache(result)
    ElMessage.success(`🔄 已切换到项目: ${getFileName(result)}`)
  }
  showFileMenu.value = false
}

const openSearch = () => {
  searchVisible.value = true
}

onMounted(() => {
  offPythonReady = window.electronAPI?.onPythonReady?.((data) => {
    pythonStatus.value = 'running'
  })
  offPythonError = window.electronAPI?.onPythonError?.((data) => {
    pythonStatus.value = 'error'
  })
})

onBeforeUnmount(() => {
  offPythonReady?.()
  offPythonError?.()
})
</script>

<style scoped>
.titlebar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 36px;
  flex-shrink: 0;
  background: var(--surface-window);
  user-select: none;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-default);
  position: relative;
}

.titlebar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  -webkit-app-region: drag;
}

.logo-text {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--fs-16);
  font-weight: 600;
  color: var(--text-strong);
  letter-spacing: 0.5px;
  -webkit-app-region: drag;
}

.logo-mark {
  display: block;
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: var(--accent, #4EC9B0);
}

.logo-text .arrow {
  color: var(--accent);
  font-weight: 700;
}

.project-name {
  color: var(--text-muted);
  font-size: 12px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  -webkit-app-region: drag;
}

.titlebar-menu {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
  flex: 0 0 auto;
  margin-left: 20px;
}

.menu-item {
  color: var(--text-secondary);
  font-size: 13px;
  padding: var(--space-4) var(--space-8);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.menu-item:hover {
  background: var(--surface-input-active);
  color: var(--text-strong);
}

.titlebar-drag-area {
  flex: 1;
  height: 100%;
  -webkit-app-region: drag;
  min-width: 20px;
}

.titlebar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
  flex: 0 0 auto;
  margin-left: 8px;
}

.status {
  font-size: 12px;
  padding: var(--space-2) var(--space-8);
  border-radius: 12px;
}

.status.running {
  color: var(--status-ok);
}

.status.stopped {
  color: var(--status-err);
}

.titlebar-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  width: 30px;
  height: 30px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.titlebar-btn:hover {
  background: var(--surface-input-active);
  color: var(--text-strong);
}

.titlebar-btn.close:hover {
  background: var(--status-err-strong);
  color: var(--text-inverse);
}
</style>