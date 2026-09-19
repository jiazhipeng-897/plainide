<template>
  <div class="statusbar">
    <div class="status-left">
      <span class="status-item" v-if="editorStore.activeFile">
        {{ getFileName(editorStore.activeFile) }}
      </span>
      <span class="status-item" v-if="editorStore.activeFile">
        行: {{ cursorPosition.line || 1 }}  列: {{ cursorPosition.column || 1 }}
      </span>
      <span class="status-item">空格: {{ editorStore.tabSize || 4 }}</span>
      <span class="status-item">UTF-8</span>
      <span class="status-item" v-if="editorStore.currentLanguage">
        {{ editorStore.currentLanguage.toUpperCase() }}
      </span>
    </div>
    <div class="status-right">
      <span class="status-item" v-if="currentModel">🤖 {{ currentModel }}</span>
      <span class="status-item" v-if="gitStore.isRepo">⎇ {{ gitStore.branch || 'main' }}</span>
      <span class="status-item" v-else>Git: -</span>
      <span class="status-item status-error">⚡ 0错误</span>
      <span class="status-item status-warning">2警告</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { getDefaultModel } from '@/constants/providerConfig'
import { useEditorStore } from '@/stores/editor'
import { useGitStore } from '@/stores/git'
import { getFileName } from '@/utils/pathHelper'
import { EVENT_CURSOR_CHANGE } from '@/constants/eventNames'

const editorStore = useEditorStore()
const agentStore = useAgentStore()
const gitStore = useGitStore()
// 右下角模型标识：跟随设置里切换的厂商（标签跟着变）
const currentModel = ref('')
watch(
  () => agentStore.provider,
  async (val) => {
    try {
      const saved = await window.electronAPI?.getApiConfig?.()
      currentModel.value = saved?.providers?.[val]?.model || getDefaultModel(val) || ''
    } catch (e) {}
  },
  { immediate: true }
)
const cursorPosition = ref({ line: 1, column: 1 })

const handleCursorChange = (event) => {
  cursorPosition.value = event.detail || { line: 1, column: 1 }
}

onMounted(() => {
  window.addEventListener(EVENT_CURSOR_CHANGE, handleCursorChange)
})

onUnmounted(() => {
  window.removeEventListener(EVENT_CURSOR_CHANGE, handleCursorChange)
})
</script>

<style scoped>
.statusbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 26px;
  padding: 0 16px;
  background: var(--surface-window);
  color: var(--text-status);
  font-size: 12px;
  flex-shrink: 0;
  user-select: none;
  border-top: 1px solid var(--border-default);
}

.status-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-item {
  opacity: 0.8;
  color: var(--text-secondary);
  transition: opacity 0.2s ease, color 0.2s ease;
  font-size: 11px;
}

.status-item:hover {
  opacity: 1;
  color: var(--text-status);
}

/* ===== 错误 ===== */
.status-error {
  color: var(--status-heat-1) !important;
  opacity: 1 !important;
}

.status-error:hover {
  color: var(--status-heat-2) !important;
}

/* ===== 警告 ===== */
.status-warning {
  color: var(--status-heat-3) !important;
  opacity: 1 !important;
}

.status-warning:hover {
  color: var(--status-heat-4) !important;
}
</style>
