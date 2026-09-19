<template>
  <div class="editor-area">
    <div class="tabs">
      <div
        v-for="file in editorStore.openFiles"
        :key="file.path"
        class="tab"
        :class="{ active: file.path === editorStore.activeFile }"
        @click="onTabClick(file.path)"
      >
        <span>{{ getFileName(file.path) }}</span>
        <span v-if="editorStore.getFileModified?.(file.path)" class="modified-dot">●</span>
        <span class="tab-close" @click.stop="closeFile(file.path)">✕</span>
      </div>
      <el-button size="small" text class="tab-add" @click="createNewTab">+</el-button>
    </div>

    <div class="editor-wrapper" ref="editorWrapperRef">
      <CodeEditor
        ref="codeEditorRef"
        :model-value="displayContent"
        @update:model-value="handleCodeUpdate"
        :language="editorLanguage"
        :theme="editorStore.theme"
        :font-size="editorStore.fontSize"
        :tab-size="editorStore.tabSize"
        @ready="onEditorReady"
        @cursor-change="onCursorChange"
        @change="onCodeChange"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useProjectStore } from '@/stores/project'
import { useOutlineStore } from '@/stores/outlineStore'
import { ElMessage } from 'element-plus'
import { CodeEditor } from '@/components/editor'
import { getFileName } from '@/utils/pathHelper'
import { EVENT_CURSOR_CHANGE } from '@/constants/eventNames'
import { useASTParser } from '@/composables/useASTParser'
import { parseCodeOutline } from '@/utils/codeOutlineParser'

const editorStore = useEditorStore()
const projectStore = useProjectStore()
const outlineStore = useOutlineStore()
const codeEditorRef = ref(null)
const editorWrapperRef = ref(null)

const { parse, parseDebounced } = useASTParser(editorStore, 500)

const displayContent = computed(() => {
  const active = editorStore.activeFile
  if (active) {
    return editorStore.fileContents[active] || ''
  }
  return ''
})

const editorLanguage = computed(() => {
  return editorStore.currentLanguage || 'plaintext'
})

const handleCodeUpdate = (value) => {
  const active = editorStore.activeFile
  if (!active) return
  editorStore.updateContent(active, value)
}

const closeFile = (file) => {
  editorStore.closeFile(file)
}

const createNewTab = () => {
  if (!projectStore.projectPath) {
    ElMessage.warning('请先打开项目')
    return
  }
  const name = `untitled-${Date.now()}.py`
  editorStore.openFile(name, '')
}

const onEditorReady = (editor) => {
  nextTick(() => {
    setTimeout(() => {
      editor.layout()
      if (editorStore.activeFile && editorStore.currentContent) {
        parse(editorStore.activeFile, editorStore.currentContent)
        const outline = parseCodeOutline(editorStore.currentContent, editorStore.activeFile)
        outlineStore.setOutlineData(outline, editorStore.activeFile)
      }
    }, 50)
  })
}

const onCursorChange = (position) => {
  window.dispatchEvent(new CustomEvent(EVENT_CURSOR_CHANGE, { detail: position }))
}

const onCodeChange = (value) => {
  const active = editorStore.activeFile
  if (!active) return
  editorStore.updateContent(active, value)
  parseDebounced(active, value)
  const outline = parseCodeOutline(value, active)
  outlineStore.setOutlineData(outline, active)
}

const onTabClick = (file) => {
  editorStore.setActiveFile(file)
  nextTick(() => {
    const editor = codeEditorRef.value?.getEditor()
    if (editor) setTimeout(() => editor.layout(), 50)
    const content = editorStore.fileContents[file] || ''
    if (file && content) {
      parse(file, content)
      const outline = parseCodeOutline(content, file)
      outlineStore.setOutlineData(outline, file)
    }
  })
}

watch(() => editorStore.activeFile, (newFile, oldFile) => {
  if (newFile && newFile !== oldFile) {
    nextTick(() => {
      const editor = codeEditorRef.value?.getEditor()
      if (editor) setTimeout(() => editor.layout(), 100)
      const content = editorStore.fileContents[newFile] || ''
      if (newFile && content) {
        parse(newFile, content)
        const outline = parseCodeOutline(content, newFile)
        outlineStore.setOutlineData(outline, newFile)
      }
    })
  }
})

const handleResize = () => {
  const editor = codeEditorRef.value?.getEditor()
  if (editor) editor.layout()
}

// ============================================================
// 替换和删除功能
// ============================================================

function getEditorInstance() {
  return codeEditorRef.value?.getEditor()
}

function getCurrentFilePath() {
  return editorStore.activeFile || ''
}

function getCodeBlock(target) {
  const editor = getEditorInstance()
  if (!editor) return ''
  
  const model = editor.getModel()
  if (!model) return ''
  
  const startLine = target.startLine || target.line
  const endLine = target.endLine || target.startLine || target.line
  const endCol = model.getLineMaxColumn(endLine)
  
  return model.getValueInRange({
    startLineNumber: startLine,
    startColumn: 1,
    endLineNumber: endLine,
    endColumn: endCol
  })
}

function goToLine(line) {
  const editor = getEditorInstance()
  if (!editor) return
  editor.revealLineInCenter(line)
  editor.setPosition({ lineNumber: line, column: 1 })
  editor.focus()
}

function highlightCodeBlock(target) {
  const editor = getEditorInstance()
  if (!editor || !target) return
  
  const model = editor.getModel()
  if (!model) return
  
  const startLine = target.startLine || target.line
  const endLine = target.endLine || target.startLine || target.line
  
  goToLine(startLine)
  
  editor.setSelection({
    startLineNumber: startLine,
    startColumn: 1,
    endLineNumber: endLine,
    endColumn: model.getLineMaxColumn(endLine)
  })
  
  editor.focus()
}

function handleOutlineReplace(event) {
  const { target, newCode } = event.detail
  const editor = getEditorInstance()
  if (!editor || !target) return
  
  const model = editor.getModel()
  if (!model) return
  
  const startLine = target.startLine || target.line
  const endLine = target.endLine || target.startLine || target.line
  
  if (newCode === undefined || newCode === null) return
  
  const originalCode = getCodeBlock(target)
  if (newCode === originalCode) {
    console.log('[EditorArea] 代码未变化，跳过替换')
    return
  }
  
  const endCol = model.getLineMaxColumn(endLine)
  
  // 使用 editor.executeEdits 自动处理撤销栈，Ctrl+Z 可撤销
  editor.executeEdits('outline-replace', [{
    range: {
      startLineNumber: startLine,
      startColumn: 1,
      endLineNumber: endLine,
      endColumn: endCol
    },
    text: newCode,
    forceMoveMarkers: true
  }])
  
  const content = model.getValue()
  const outline = parseCodeOutline(content, getCurrentFilePath())
  outlineStore.setOutlineData(outline, getCurrentFilePath())
  
  console.log('[EditorArea] 替换完成:', target.name)
}

function handleOutlineDelete(event) {
  const { target } = event.detail
  const editor = getEditorInstance()
  if (!editor || !target) return
  
  const model = editor.getModel()
  if (!model) return
  
  const startLine = target.startLine || target.line
  const endLine = target.endLine || target.startLine || target.line
  const endCol = model.getLineMaxColumn(endLine)
  
  // 使用 editor.executeEdits 自动处理撤销栈，Ctrl+Z 可撤销
  editor.executeEdits('outline-delete', [{
    range: {
      startLineNumber: startLine,
      startColumn: 1,
      endLineNumber: endLine,
      endColumn: endCol
    },
    text: '',
    forceMoveMarkers: true
  }])
  
  const content = model.getValue()
  const outline = parseCodeOutline(content, getCurrentFilePath())
  outlineStore.setOutlineData(outline, getCurrentFilePath())
  
  console.log('[EditorArea] 删除完成:', target.name)
}

// ============================================================
// 生命周期
// ============================================================

onMounted(() => {
  window.addEventListener('resize', handleResize)
  
  window.addEventListener('outline-replace', handleOutlineReplace)
  window.addEventListener('outline-delete', handleOutlineDelete)
  
  window.addEventListener('outline-request-original-code', (event) => {
    const { target } = event.detail
    const originalCode = getCodeBlock(target)
    
    window.dispatchEvent(new CustomEvent('outline-original-code-response', {
      detail: {
        originalCode: originalCode || '',
        target: target,
        newCode: ''
      }
    }))
  })
  
  window.addEventListener('outline-item-click', (event) => {
    const { startLine, name, type, endLine } = event.detail
    if (startLine) {
      const target = {
        name: name,
        type: type,
        startLine: startLine,
        endLine: endLine || startLine
      }
      highlightCodeBlock(target)
    }
  })
  
  setTimeout(() => {
    const editor = codeEditorRef.value?.getEditor()
    if (editor) editor.layout()
    if (editorStore.activeFile && editorStore.currentContent) {
      parse(editorStore.activeFile, editorStore.currentContent)
      const outline = parseCodeOutline(editorStore.currentContent, editorStore.activeFile)
      outlineStore.setOutlineData(outline, editorStore.activeFile)
    }
  }, 300)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('outline-replace', handleOutlineReplace)
  window.removeEventListener('outline-delete', handleOutlineDelete)
})
</script>

<style scoped>
.editor-area {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--surface-window);
  position: relative;
}

.tabs {
  display: flex;
  align-items: center;
  background: var(--surface-panel-1);
  border-bottom: 1px solid var(--border-default);
  padding: 0 8px;
  height: 34px;
  flex-shrink: 0;
  overflow-x: auto;
  gap: 2px;
  position: relative;
  z-index: 10;
}

.tabs::-webkit-scrollbar {
  height: 0;
}

.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: var(--space-4) var(--space-8);
  background: transparent;
  color: var(--text-subtle);
  font-size: 12px;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}

.tab:hover {
  background: var(--surface-editor-aux);
  color: var(--text-primary);
}

.tab.active {
  background: var(--surface-window);
  color: var(--text-bright);
  border-bottom-color: var(--info);
}

.tab .modified-dot {
  color: var(--status-warn);
  font-size: 10px;
}

.tab-close {
  font-size: 12px;
  opacity: 0.5;
  padding: 0 2px;
  border-radius: 2px;
}

.tab-close:hover {
  opacity: 1;
  background: var(--surface-debug);
}

.tab-add {
  color: var(--text-subtle);
  font-size: 16px;
  padding: 0 8px;
  cursor: pointer;
}

.tab-add:hover {
  color: var(--text-primary);
}

.editor-wrapper {
  position: absolute;
  top: 34px;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--surface-window);
}
</style>