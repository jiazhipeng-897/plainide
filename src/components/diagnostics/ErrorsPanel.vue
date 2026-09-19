<template>
  <div class="errors-panel">
    <div v-if="errors.length === 0" class="empty">
      ✅ 暂无错误
    </div>
    <div
      v-for="err in errors"
      :key="err.id"
      class="error-item"
      :class="err.level"
    >
      <span class="icon">
        {{ err.level === 'error' ? '❌' : err.level === 'warning' ? '⚠️' : 'ℹ️' }}
      </span>
      <span class="message">{{ err.message }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const errors = ref([])

// IPC 监听器移除函数
let offPythonError = null

onMounted(() => {
  // 监听错误事件
  offPythonError = window.electronAPI?.onPythonError?.((data) => {
    errors.value.push({
      id: Date.now(),
      level: 'error',
      message: data.error,
    })
  })
})

onBeforeUnmount(() => {
  offPythonError?.()
})
</script>

<style scoped>
.errors-panel {
  height: 100%;
  overflow-y: auto;
  padding: 4px 12px;
  background: var(--surface-window);
  font-size: 13px;
}

.errors-panel::-webkit-scrollbar {
  width: 4px;
}

.errors-panel::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: 2px;
}

.empty {
  color: var(--status-ok);
  text-align: center;
  padding: 20px 0;
}

.error-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  border-bottom: 1px solid var(--surface-panel-2);
}

.error-item.error {
  color: var(--status-err);
}

.error-item.warning {
  color: var(--status-warn);
}

.error-item.info {
  color: var(--info-2);
}

.icon {
  font-size: 14px;
}

.message {
  word-break: break-all;
}
</style>
