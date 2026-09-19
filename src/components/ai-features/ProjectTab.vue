<!-- ProjectTab.vue -->
<template>
  <div class="tab-content project-content">
    <div class="project-editor">
      <el-input
        :model-value="modelValue"
        type="textarea"
        class="project-textarea"
        placeholder="暂无翻译内容，请先点击「开始翻译」生成翻译"
        @update:model-value="$emit('update:modelValue', $event)"
      />
    </div>
    <div class="project-footer">
      <div class="footer-left">
        <span class="hint">💡 编辑后点击「保存」按钮更新翻译</span>
      </div>
      <div class="footer-right">
        <span v-if="saved" class="saved-hint">✅ 已保存</span>
        <el-button
          class="save-btn"
          size="small"
          :disabled="!modelValue"
          @click="$emit('save')"
        >
          💾 保存
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  saved: {
    type: Boolean,
    default: false
  }
})

defineEmits(['update:modelValue', 'save'])
</script>

<style scoped>
.tab-content {
  flex: 1;
  padding: 0;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.project-content {
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.project-editor {
  flex: 1;
  overflow: hidden;
}

.project-textarea {
  height: 100%;
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
}

:deep(.project-textarea .el-textarea__inner) {
  height: 100% !important;
  min-height: 200px;
  background: transparent !important;
  color: var(--text-primary);
  border: none !important;
  padding: 12px 16px;
  font-size: 13px;
  resize: none;
  line-height: 1.8;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
}

:deep(.project-textarea .el-textarea__inner:focus) {
  box-shadow: none !important;
  border: none !important;
}

:deep(.project-textarea .el-textarea__inner::-webkit-scrollbar) {
  width: 6px;
}
:deep(.project-textarea .el-textarea__inner::-webkit-scrollbar-thumb) {
  background: var(--surface-raised);
  border-radius: var(--radius-4);
}

.project-footer {
  padding: 8px 16px;
  border-top: 1px solid var(--border-default);
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--surface-panel-1);
}

.footer-left .hint {
  font-size: 11px;
  color: var(--text-muted);
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.saved-hint {
  font-size: 12px;
  color: var(--status-ok);
  animation: fadeOut 2s ease forwards;
}

.save-btn {
  background: var(--status-warn-badge) !important;
  border: 1px solid var(--status-warn-badge-border) !important;
  color: var(--status-warn) !important;
  border-radius: 4px !important;
  transition: all 0.2s !important;
}

.save-btn:hover:not(:disabled) {
  background: var(--status-warn-badge-2) !important;
  border-color: var(--status-warn-badge-border-2) !important;
}

.save-btn:disabled {
  opacity: 0.4 !important;
  cursor: not-allowed !important;
}

@keyframes fadeOut {
  0% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; }
}
</style>