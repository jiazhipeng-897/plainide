<template>
  <div class="menubar">
    <div class="menu-left">
      <el-button size="small" class="menu-btn" @click="saveFile" :disabled="!editorStore.activeFile">
        💾 保存
      </el-button>
      <el-button size="small" class="menu-btn" @click="openSettings">⚙️ API设置</el-button>
      <el-button size="small" class="menu-btn" @click="showErrors">📋 错误日志</el-button>
      <!-- ⭐ 新增：翻译插件 -->
      <TranslationPlugin />
    </div>
    <div class="menu-right">
      <span class="file-info" v-if="editorStore.activeFile">
        {{ getFileName(editorStore.activeFile) }}
        <span v-if="editorStore.isCurrentModified" class="modified">● 未保存</span>
        <span v-else class="saved">✓ 已保存</span>
      </span>
    </div>
  </div>
</template>

<script setup>
import { useEditorStore } from '@/stores/editor'
import { ElMessage } from 'element-plus'
import { TranslationPlugin } from '@/components/ai-features'

const editorStore = useEditorStore()

const getFileName = (path) => {
  if (!path) return ''
  return path.split(/[\\/]/).pop()
}

const saveFile = async () => {
  const success = await editorStore.saveCurrentFile()
  if (success) {
    ElMessage.success('✅ 已保存')
  } else {
    ElMessage.error('❌ 保存失败')
  }
}

const openSettings = () => {
  window.dispatchEvent(new CustomEvent('open-settings'))
}

const showErrors = () => {
  window.electronAPI?.showErrorWindow?.()
}
</script>

<style scoped>
.menubar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 34px;
  padding: 0 12px;
  background: var(--surface-menu);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
  user-select: none;
  -webkit-app-region: no-drag;
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.menu-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-info {
  font-size: 12px;
  color: var(--text-muted);
}

.modified {
  color: var(--status-heat-3);
  margin-left: 4px;
}

.saved {
  color: var(--status-ok);
  margin-left: 4px;
}

.menu-btn {
  background: transparent !important;
  color: var(--text-secondary) !important;
  border: none !important;
  border-radius: 6px !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  padding: 4px 12px !important;
  transition: all 0.2s ease !important;
}

.menu-btn:hover:not(:disabled) {
  background: var(--surface-input-active) !important;
  color: var(--text-strong) !important;
}

.menu-btn:disabled {
  color: var(--text-disabled) !important;
  cursor: not-allowed !important;
}
</style>