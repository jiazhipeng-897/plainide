<!-- RightPanel.vue -->
<template>
  <div 
    class="right-panel" 
    :style="{ width: isCollapsed ? collapsedWidth + 'px' : width + 'px' }"
    :class="{ collapsed: isCollapsed }"
  >
    <!-- 折叠/展开按钮 -->
    <div class="panel-toggle" @click="toggleCollapse">
      <span>{{ isCollapsed ? '◀' : '▶' }}</span>
    </div>

    <!-- 你原有的内容，折叠时隐藏 -->
    <div v-show="!isCollapsed" class="panel-content">
      <div class="outline-wrapper" :style="{ flex: outlineFlex }">
        <Outline />
      </div>
      
      <div 
        class="inner-resizer" 
        @mousedown.stop="startResize"
        @dblclick="resetHeights"
      >
        <div class="resizer-handle"></div>
      </div>

      <div class="agent-wrapper" :style="{ flex: agentFlex }">
        <AgentPanel />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Outline } from '@/components/editor'
import AgentPanel from '@/components/ai-features/AgentTranslator.vue'

defineProps({
  width: { type: Number, default: 320 },
  collapsedWidth: { type: Number, default: 18 },
})

// ===== 整体折叠状态（默认折叠） =====
const isCollapsed = ref(true)

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

// ===== 以下是你原有的拖拽逻辑 =====
const outlineFlex = ref('1')
const agentFlex = ref('1')
const isResizing = ref(false)

const startResize = (e) => {
  isResizing.value = true
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
}

const onResize = (e) => {
  if (!isResizing.value) return
  const panel = document.querySelector('.right-panel')
  const rect = panel.getBoundingClientRect()
  const relativeY = e.clientY - rect.top
  const panelHeight = rect.height
  const minHeight = 60
  const maxHeight = panelHeight - minHeight
  const newTopHeight = Math.max(minHeight, Math.min(maxHeight, relativeY))
  const ratio = newTopHeight / (panelHeight - newTopHeight)
  outlineFlex.value = ratio
  agentFlex.value = 1
}

const stopResize = () => {
  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
}

const resetHeights = () => {
  outlineFlex.value = '1'
  agentFlex.value = '1'
}
</script>

<style scoped>
.right-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-panel-2);
  border-left: 1px solid var(--border-default);
  flex-shrink: 0;
  min-width: 200px;
  overflow: hidden;
  border-radius: 0 12px 12px 0;
  box-shadow: 0 4px 20px var(--shadow-soft);
  transition: width 0.25s ease;
}

.right-panel.collapsed {
  min-width: 18px !important;
  width: 18px !important;
}

.panel-toggle {
  position: absolute;
  left: 2px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  width: 12px;
  height: 32px;
  background: var(--surface-raised);
  border-radius: var(--radius-4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-subtle);
  font-size: 10px;
  user-select: none;
  transition: background 0.2s;
}

.panel-toggle:hover {
  background: var(--surface-tab);
  color: var(--text-primary);
}

.panel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin-left: 16px;
}

.outline-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.inner-resizer {
  flex-shrink: 0;
  height: 4px;
  background: transparent;
  cursor: row-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  position: relative;
  z-index: 10;
}

.inner-resizer:hover {
  background: var(--surface-tab);
}

.inner-resizer .resizer-handle {
  width: 30px;
  height: 2px;
  background: var(--surface-item);
  border-radius: 2px;
}

.agent-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 60px;
  border-top: 1px solid var(--border-default);
  overflow: hidden;
}
</style>