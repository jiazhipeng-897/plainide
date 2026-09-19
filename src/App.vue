<template>
  <Layout />
</template>

<script setup>
import './styles/theme.css'
import Layout from './views/Layout.vue'
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
html, body, #app {
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  background: var(--surface-window);
  color: var(--text-status);
}

/* ===== 全局滚动条 ===== */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--surface-raised);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--surface-hover-2);
}

/* ===== 全局文字选中的颜色 ===== */
::selection {
  background: var(--accent-soft-30);
  color: var(--text-strong);
}

/* ===== 全局按钮基础 ===== */
button {
  font-family: inherit;
}

/* ===== 全局焦点反馈（细节质感，不改背景色值） ===== */
:where(button, input, textarea, select, [contenteditable]):focus-visible {
  outline: 1px solid var(--info-ring);
  outline-offset: -1px;
}
.monaco-editor :focus-visible,
.xterm :focus-visible,
.el-input__inner:focus,
.el-textarea__inner:focus {
  outline: none;
}

/* ===== Element Plus 弹窗质感（阴影分层） ===== */
.el-dialog,
.el-message-box {
  border-radius: var(--radius-8);
  box-shadow: 0 8px 32px var(--shadow-strong);
}
.el-dialog__header {
  padding: var(--space-12) var(--space-16) 0;
}
.el-dialog__body {
  padding: var(--space-8) var(--space-16) var(--space-12);
}
.el-dialog__footer {
  padding: 0 var(--space-16) var(--space-12);
}

</style>