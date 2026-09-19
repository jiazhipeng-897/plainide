<!-- src/components/editor/DiffConfirmModal.vue -->

<template>
  <el-dialog
    v-model="visible"
    title="确认代码替换"
    width="85%"
    top="5vh"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div class="diff-container" ref="diffContainerRef"></div>
    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" @click="handleConfirm">确认替换</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import * as monaco from 'monaco-editor'

// ===== 状态 =====
const visible = ref(false)
const diffContainerRef = ref(null)
let diffEditor = null
let resolveCallback = null
let currentFilePath = ''

// ===== 语言推断 =====
const getLanguage = (filePath) => {
  if (!filePath) return 'plaintext'
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map = {
    js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    vue: 'vue', py: 'python', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
    cs: 'csharp', rs: 'rust', rb: 'ruby', php: 'php', html: 'html',
    css: 'css', json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', sh: 'shell', bash: 'shell'
  }
  return map[ext] || 'plaintext'
}

// ===== 初始化 Diff Editor =====
const initDiffEditor = (originalCode, modifiedCode, filePath) => {
  if (!diffContainerRef.value) return

  if (diffEditor) {
    diffEditor.dispose()
    diffEditor = null
  }

  const language = getLanguage(filePath)

  diffEditor = monaco.editor.createDiffEditor(diffContainerRef.value, {
    theme: 'my-dark',
    automaticLayout: true,
    renderSideBySide: true,
    originalEditable: false,
    modifiedEditable: true,
    readOnly: false,
    ignoreTrimWhitespace: false,
    renderIndicators: true,
    diffAlgorithm: 'advanced',
    fontSize: 13,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    renderOverviewRuler: false,
    enableSplitViewResizing: true,
  })

  const originalModel = monaco.editor.createModel(originalCode || '', language)
  const modifiedModel = monaco.editor.createModel(modifiedCode || '', language)

  diffEditor.setModel({
    original: originalModel,
    modified: modifiedModel,
  })

  setTimeout(() => {
    try {
      diffEditor?.getAction('editor.action.formatDocument')?.run()
    } catch {
      // ignore
    }
  }, 100)
}

// ===== 打开弹窗 =====
const open = (options) => {
  const { originalCode, newCode, filePath, onConfirm } = options

  currentFilePath = filePath || ''
  resolveCallback = onConfirm || null

  visible.value = true

  nextTick(() => {
    initDiffEditor(originalCode, newCode, currentFilePath)
  })
}

// ===== 事件 =====
const handleCancel = () => {
  visible.value = false
  resolveCallback = null
}

const handleConfirm = () => {
  if (!diffEditor) return

  const modifiedModel = diffEditor.getModel()?.modified
  const newCode = modifiedModel?.getValue() || ''

  if (resolveCallback) {
    resolveCallback(newCode)
  }

  visible.value = false
  resolveCallback = null
}

// ===== 清理 =====
const cleanup = () => {
  if (diffEditor) {
    diffEditor.dispose()
    diffEditor = null
  }
}

watch(visible, (val) => {
  if (!val) {
    setTimeout(cleanup, 300)
  }
})

onBeforeUnmount(() => {
  cleanup()
})

defineExpose({ open })
</script>

<style scoped>
.diff-container {
  width: 100%;
  height: 60vh;
  min-height: 400px;
  background: var(--surface-window);
  border-radius: 4px;
  overflow: hidden;
}
</style>