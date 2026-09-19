<template>
  <div class="layout">
    <TitleBar />
    <MenuBar />
    <div class="main">
      <!-- 左侧：侧边栏 -->
      <Sidebar ref="sidebarRef" />

      <!-- 左侧分隔条 -->
      <Resizer direction="vertical" @resize="onResizeLeft" />
      <!-- 中间区域 -->
      <div class="center-area">
        <!-- 编辑器 -->
        <EditorArea />

        <!-- 底部水平分隔条 -->
        <Resizer direction="horizontal" @resize="onResizeBottom" />

        <!-- 底部面板 -->
        <BottomPanel :height="bottomHeight" />
      </div>
      <!-- 右侧分隔条（控制 Agent 面板宽度） -->
      <Resizer direction="vertical" @resize="onResizeAgent" />
      <!-- 新 Agent 面板 -->
      <AgentPanel :width="agentWidth" />
      <!-- 右侧面板 -->
      <RightPanel :width="rightWidth" />
    </div>
    <!-- 状态栏 -->
    <StatusBar />
    <!-- API设置弹窗 -->
    <el-dialog v-model="settingsVisible" title="⚙️ 设置" width="520px" destroy-on-close>
      <ApiSettings />
    </el-dialog>
  </div>
</template>

<script setup>
import '../styles/theme.css'
/**
 * 主布局组件（重构适配版）
 *
 * 已重构组件（从目录统一导入）：
 * - MenuBar（common）
 * - EditorArea（layout）
 * - ApiSettings（settings）
 *
 * 待重构组件（直接导入原文件，后续逐步替换为目录导入）：
 * - TitleBar、StatusBar、Resizer
 * - Sidebar、BottomPanel、RightPanel
 *
 * 架构适配点：
 * - open-settings 事件 → EVENT_OPEN_SETTINGS 常量
 * - projectStore.setProjectPath() → openProject() 统一入口
 * - translationStore.setProjectPath() → loadCache()
 */
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useTranslationStore } from '@/stores/translation'
import { EVENT_OPEN_SETTINGS } from '@/constants/eventNames'
import { sfx } from '@/utils/sound'

// ===== 已重构：从目录导入 =====
import { MenuBar } from '@/components/common'
import { EditorArea } from '@/components/layout'
import { ApiSettings } from '@/components/settings'

// ===== 待重构：直接导入文件（后续逐步迁移）=====
import TitleBar from '@/components/common/TitleBar.vue'
import StatusBar from '@/components/common/StatusBar.vue'
import Resizer from '@/components/common/Resizer.vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import BottomPanel from '@/components/layout/BottomPanel.vue'
import RightPanel from '@/components/layout/RightPanel.vue'
import AgentPanel from '@/components/agent/agent.vue'

const projectStore = useProjectStore()
const translationStore = useTranslationStore()

const sidebarRef = ref(null)

// 面板尺寸
const leftWidth = ref(240)
const agentWidth = ref(300)
const rightWidth = ref(300)
const bottomHeight = ref(180)

// API 设置弹窗
const settingsVisible = ref(false)

// 原生对话框光标重置订阅（Layout 级，保证全局生效）
let offCursorReset = null

// 全局点击音效（80ms 节流，避免连点轰炸；开关在设置里控制）
let lastClickSfx = 0
const onGlobalClick = () => {
  const now = Date.now()
  if (now - lastClickSfx < 80) return
  lastClickSfx = now
  sfx.click()
}

// 监听打开设置事件
const onOpenSettings = () => {
  settingsVisible.value = true
}

// 分隔条拖拽
const onResizeLeft = (delta) => {
  leftWidth.value = Math.max(160, Math.min(500, leftWidth.value + delta))
}
const onResizeAgent = (delta) => {
  // 分隔条位于 AgentPanel 左侧：向左拖 = 面板变宽，向右拖 = 面板变窄（与右侧分隔条方向相反）
  agentWidth.value = Math.max(220, Math.min(640, agentWidth.value - delta))
}
const onResizeRight = (delta) => {
  rightWidth.value = Math.max(200, Math.min(500, rightWidth.value - delta))
}
const onResizeBottom = (delta) => {
  bottomHeight.value = Math.max(60, Math.min(400, bottomHeight.value - delta))
}

// 不再自动恢复上次项目：每次启动都是新的空白状态（项目由用户手动打开）

onMounted(() => {
  window.addEventListener(EVENT_OPEN_SETTINGS, onOpenSettings)
  document.addEventListener('click', onGlobalClick)
  // 原生对话框（如选择文件夹）关闭后重置光标：修复 frameless 窗口指针消失
  offCursorReset = window.electronAPI?.onCursorReset?.(() => {
    document.body.style.cursor = 'default'
    const s = document.createElement('style')
    s.id = 'cursor-reset-override'
    s.textContent = '*, *::before, *::after { cursor: default !important; }'
    document.head.appendChild(s)
    setTimeout(() => {
      const el = document.getElementById('cursor-reset-override')
      if (el) el.remove()
    }, 80)
  })
})

onBeforeUnmount(() => {
  window.removeEventListener(EVENT_OPEN_SETTINGS, onOpenSettings)
  if (typeof offCursorReset === 'function') offCursorReset()
  document.removeEventListener('click', onGlobalClick)
})

// 监听项目路径变化，同步到 translationStore
watch(() => projectStore.projectPath, (path) => {
  if (path) {
    translationStore.loadCache(path)
  }
})
</script>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--surface-window);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  overflow: hidden;
}

.main {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
  background: var(--surface-window);
}

.center-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: var(--surface-window);
}

.sidebar {
  width: v-bind(leftWidth + 'px');
  flex-shrink: 0;
}

.right-panel {
  width: v-bind(rightWidth + 'px');
  flex-shrink: 0;
}

/* ===== API 设置弹窗 ===== */
:deep(.el-dialog) {
  background: var(--surface-panel-1);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  box-shadow: 0 8px 32px var(--shadow-panel);
}
:deep(.el-dialog__title) {
  color: var(--text-bright);
  font-weight: 500;
}
:deep(.el-dialog__headerbtn .el-dialog__close) {
  color: var(--text-subtle);
  font-size: 18px;
}
:deep(.el-dialog__headerbtn .el-dialog__close:hover) {
  color: var(--text-primary);
}
:deep(.el-dialog__body) {
  padding: 20px 24px;
  color: var(--text-primary);
}
:deep(.el-dialog__header) {
  border-bottom: 1px solid var(--border-default);
  padding: 16px 24px;
  margin: 0;
}
</style>

<!-- ==========================================================
     🌟 全局强制覆盖：彻底隐藏小三角 + 下拉菜单深色化
     ========================================================== -->
<style>
/* 1. 彻底隐藏 Element Plus 下拉菜单的小三角箭头（永绝白块） */
.el-popper__arrow {
  display: none !important;
}
/* 2. 下拉菜单整体深色 */
.el-select-dropdown {
  background-color: var(--surface-window) !important;
  border: 1px solid var(--border-default) !important;
  border-radius: 6px !important;
  box-shadow: 0 4px 16px var(--shadow-strong) !important;
}
/* 3. 下拉选项 */
.el-select-dropdown__item {
  color: var(--text-primary) !important;
  padding: 8px 16px !important;
}
/* 4. 鼠标悬停 */
.el-select-dropdown__item.hover,
.el-select-dropdown__item:hover {
  background-color: var(--surface-panel-2) !important;
  color: var(--text-inverse) !important;
}
/* 5. 选中项 */
.el-select-dropdown__item.selected {
  color: var(--info) !important;
  background-color: var(--surface-window) !important;
  font-weight: 500 !important;
}
</style>