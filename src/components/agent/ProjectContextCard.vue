<template>
  <div class="pcc-card">
    <div class="pcc-header">
      <span class="pcc-title">📂 项目上下文</span>
      <span class="pcc-name">{{ ctx.projectName || '未命名项目' }}</span>
    </div>
    <div class="pcc-body">
      <div class="pcc-row">
        <span class="pcc-label">文件数</span>
        <span class="pcc-value">{{ ctx.fileCount }} 个</span>
      </div>
      <div class="pcc-row" v-if="ctx.techStack">
        <span class="pcc-label">技术栈</span>
        <span class="pcc-value">{{ ctx.techStack }}</span>
      </div>
      <div class="pcc-row" v-if="ctx.lastTask">
        <span class="pcc-label">上次任务</span>
        <span class="pcc-value pcc-ellipsis" :title="ctx.lastTask">{{ ctx.lastTask }}</span>
      </div>
      <div class="pcc-row" v-if="!ctx.memoryLoaded">
        <span class="pcc-label">记忆</span>
        <span class="pcc-value pcc-dim">无项目记忆（首次续写该目录）</span>
      </div>
    </div>
    <div class="pcc-footer">
      <span class="pcc-hint">已选定该项目，回复想改什么（如"把按钮改成红色"）</span>
      <slot name="actions"></slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  ctx: { type: Object, default: () => ({}) },
})
</script>

<style scoped>
.pcc-card {
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: var(--space-12) var(--space-12);
  font-size: 12px;
  line-height: 1.6;
  max-width: 520px;
transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
}
.pcc-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px var(--shadow-soft);
  border-color: var(--border-mid);
}

.pcc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.pcc-title {
  color: var(--info);
  font-weight: 600;
  font-size: 13px;
}
.pcc-name {
  color: var(--text-soft);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pcc-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pcc-row {
  display: flex;
  gap: 8px;
  min-width: 0;
}
.pcc-label {
  color: var(--text-desc);
  flex-shrink: 0;
  width: 56px;
}
.pcc-value {
  color: var(--text-soft);
  word-break: break-all;
}
.pcc-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pcc-dim {
  color: var(--text-meta);
}
.pcc-footer {
  margin-top: var(--space-8);
  padding-top: 8px;
  border-top: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.pcc-hint {
  color: var(--text-desc);
  font-size: 11px;
}
</style>
