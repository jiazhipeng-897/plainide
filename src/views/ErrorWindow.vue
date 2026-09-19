<template>
  <div class="error-window">
    <!-- ===== 自定义标题栏 ===== -->
    <div class="titlebar">
      <div class="titlebar-drag">
        <span class="title">🔴 错误日志</span>
        <span class="count">{{ errors.length }} 条</span>
      </div>
      <div class="titlebar-actions">
        <button class="titlebar-btn" @click="minimizeWindow">─</button>
        <button class="titlebar-btn" @click="maximizeWindow">☐</button>
        <button class="titlebar-btn close" @click="closeWindow">✕</button>
      </div>
    </div>

    <!-- ===== 错误列表（包含按钮） ===== -->
    <div class="body" ref="bodyRef">
      <!-- 用 Flex 布局替代原来的工具栏，不产生任何边框线 -->
      <div class="action-bar">
        <el-button size="small" class="action-btn" @click="clearErrors">清空</el-button>
        <el-button size="small" type="primary" class="action-btn" @click="exportErrors">导出日志</el-button>
      </div>

      <div v-if="errors.length === 0" class="empty">
        ✅ 暂无错误，一切正常
      </div>
      <div
        v-for="err in errors"
        :key="err.id"
        class="error-item"
        :class="err.level"
      >
        <div class="error-icon">
          <span v-if="err.level === 'error'">❌</span>
          <span v-else-if="err.level === 'warning'">⚠️</span>
          <span v-else>ℹ️</span>
        </div>
        <div class="error-content">
          <div class="error-message">{{ err.message }}</div>
          <div class="error-meta">
            <span class="timestamp">{{ formatTime(err.timestamp) }}</span>
            <span class="source" v-if="err.source">来源: {{ err.source }}</span>
          </div>
          <div class="error-stack" v-if="err.stack" @click="toggleStack(err.id)">
            <span class="stack-toggle">📄 查看堆栈</span>
            <pre v-if="expandedStacks.includes(err.id)">{{ err.stack }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage } from 'element-plus'

const errors = ref([])
const expandedStacks = ref([])
const bodyRef = ref(null)

const formatTime = (isoString) => {
  const d = new Date(isoString)
  return d.toLocaleString('zh-CN')
}

const toggleStack = (id) => {
  const idx = expandedStacks.value.indexOf(id)
  if (idx > -1) {
    expandedStacks.value.splice(idx, 1)
  } else {
    expandedStacks.value.push(id)
  }
}

const clearErrors = async () => {
  await window.errorAPI.clearErrors()
  errors.value = []
  ElMessage.success('已清空错误日志')
}

const exportErrors = async () => {
  const data = await window.errorAPI.exportErrors()
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `error-log-${new Date().toISOString().slice(0,10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('导出成功')
}

// ========== 窗口控制 ==========
const minimizeWindow = () => window.errorAPI.minimizeWindow?.()
const maximizeWindow = () => window.errorAPI.maximizeWindow?.()
const closeWindow = () => window.errorAPI.closeWindow?.()

onMounted(() => {
  window.errorAPI.onHistory((history) => {
    errors.value = history
  })
  window.errorAPI.onNewError((err) => {
    errors.value.unshift(err)
    nextTick(() => {
      if (bodyRef.value) {
        bodyRef.value.scrollTop = 0
      }
    })
  })
  window.errorAPI.onCleared(() => {
    errors.value = []
  })
})
</script>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
html, body {
  height: 100%;
}
.error-window {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--surface-window);
  color: var(--text-primary);
  font-family: 'Segoe UI', -apple-system, sans-serif;
  font-size: 13px;
}

/* ===== 自定义标题栏 ===== */
.titlebar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 32px;
  flex-shrink: 0;
  background: var(--surface-window);
  -webkit-app-region: drag;
  user-select: none;
  padding: 0 12px;
}
.titlebar-drag {
  display: flex;
  align-items: center;
  gap: 12px;
  -webkit-app-region: drag;
}
.titlebar-drag .title {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-strong);
}
.titlebar-drag .count {
  color: var(--text-subtle);
  font-size: 12px;
}
.titlebar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  -webkit-app-region: no-drag;
}
.titlebar-btn {
  transition: background 0.12s ease, color 0.12s ease;
  background: transparent;
  border: none;
  color: var(--text-primary);
  width: 28px;
  height: 28px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: no-drag;
}
.titlebar-btn:hover {
  background: var(--border-default);
}
.titlebar-btn.close:hover {
  background: var(--status-err-strong);
  color: var(--text-inverse);
}

/* ===== 错误列表主体 ===== */
.body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
.body::-webkit-scrollbar {
  width: 6px;
}
.body::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: var(--radius-4);
}
.body::-webkit-scrollbar-track {
  background: transparent;
}

/* ===== 替代原来工具栏的按钮行 ===== */
.action-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px 8px 16px; /* 下边距把按钮和列表分开 */
  background: var(--surface-window);
}
/* 强制按钮本身没有任何边框或阴影 */
.action-btn {
  background: var(--surface-panel-1) !important;
  border: 1px solid var(--surface-panel-1) !important;
  box-shadow: none !important;
}
.action-btn:hover {
  background: var(--border-default) !important;
}

.empty {
  color: var(--status-ok);
  text-align: center;
  padding: 50px 0; /* scale-exempt: layout-outliers */
  font-size: var(--fs-16);
}

.error-item {
  display: flex;
  align-items: flex-start;
  padding: 8px 16px;
  border-bottom: 1px solid var(--surface-panel-2);
  gap: 10px;
}
.error-item:hover {
  background: var(--surface-panel-1);
}
.error-item.error {
  border-left: 3px solid var(--status-err);
}
.error-item.warning {
  border-left: 3px solid var(--status-warn);
}
.error-item.info {
  border-left: 3px solid var(--info-2);
}

.error-icon {
  flex-shrink: 0;
  padding-top: 2px;
  font-size: 16px;
}
.error-content {
  flex: 1;
  min-width: 0;
}
.error-message {
  color: var(--text-primary);
  word-break: break-word;
}
.error-item.error .error-message {
  color: var(--status-err);
}
.error-item.warning .error-message {
  color: var(--status-warn);
}
.error-item.info .error-message {
  color: var(--info-2);
}

.error-meta {
  color: var(--text-subtle);
  font-size: 11px;
  margin-top: 4px;
  display: flex;
  gap: 16px;
}
.error-stack {
  margin-top: 4px;
}
.stack-toggle {
  color: var(--info);
  font-size: 12px;
  cursor: pointer;
}
.stack-toggle:hover {
  text-decoration: underline;
}
.error-stack pre {
  margin-top: 6px;
  padding: 8px 12px;
  background: var(--surface-stack);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-subtle);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>