<!-- TranslateTab.vue -->
<template>
  <div class="tab-content translate-content">
    <div v-if="content || isTranslating" class="content-wrapper">
      <div class="content-header">
        <span class="title">📝 翻译结果</span>
        <span class="status">
          <span v-if="isTranslating" class="streaming">● 流式渲染中...</span>
          <span v-else-if="content" class="done">✓ 翻译完成</span>
          <span v-else class="empty-status">等待翻译</span>
        </span>
      </div>
      <div ref="contentBody" class="content-body" v-html="formattedContent" />
    </div>
    <div v-else class="empty-state">
      <span class="empty-icon">📄</span>
      <p>暂无翻译内容</p>
      <p class="hint">请切换到「AGENT」面板点击「开始翻译」</p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'

const props = defineProps({
  content: {
    type: String,
    default: ''
  },
  isTranslating: {
    type: Boolean,
    default: false
  }
})

const contentBody = ref(null)

// 格式化：保留换行和空格，高亮 JSON 结构
const formattedContent = computed(() => {
  if (!props.content) return ''
  // 转义 HTML
  let html = props.content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 保留换行
    .replace(/\n/g, '<br>')
    // 保留空格
    .replace(/ /g, '&nbsp;')
  
  // 简单高亮 JSON 键名
  html = html.replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
  
  return html
})

// 内容变化时自动滚动到底部
watch(() => props.content, async () => {
  await nextTick()
  if (contentBody.value) {
    contentBody.value.scrollTop = contentBody.value.scrollHeight
  }
})
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

.translate-content {
  padding: 0;
}

.content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
  background: var(--surface-panel-1);
}

.content-header .title {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
}

.content-header .status {
  font-size: 11px;
}

.content-header .status .streaming {
  color: var(--status-warn);
  animation: pulse 1s ease-in-out infinite;
}

.content-header .status .done {
  color: var(--status-ok);
}

.content-header .status .empty-status {
  color: var(--text-muted);
}

.content-body {
  flex: 1;
  padding: 16px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.8;
  overflow-y: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  background: var(--surface-window);
}

.content-body::-webkit-scrollbar {
  width: 6px;
}
.content-body::-webkit-scrollbar-thumb {
  background: var(--surface-raised);
  border-radius: var(--radius-4);
}

.content-body :deep(.json-key) {
  color: var(--info);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: var(--text-muted);
}

.empty-state .empty-icon {
  font-size: 48px; /* scale-exempt: big-headings */
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-state p {
  margin: 4px 0;
  font-size: 13px;
}

.empty-state .hint {
  font-size: 12px;
  color: var(--border-ast);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>