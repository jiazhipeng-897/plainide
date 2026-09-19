<template>
  <div ref="editorContainer" class="code-editor-container">
    <!-- AI 选区浮动条 -->
    <div v-if="aiBarVisible" class="ai-selection-bar" :style="aiBarStyle">
      <button v-for="a in aiActions" :key="a.key" class="ai-bar-btn" @mousedown.prevent="runAiAction(a.key)">{{ a.label }}</button>
    </div>
    <!-- AI 结果浮层 -->
    <div v-if="aiResultVisible" class="ai-result-overlay" @mousedown.self="closeAiResult">
      <div class="ai-result-panel">
        <div class="ai-result-head">
          <span class="ai-result-title">{{ aiResultTitle }}</span>
          <span v-if="aiResultLoading" class="ai-result-spin"></span>
          <button class="ai-result-close" @click="closeAiResult">✕</button>
        </div>
        <div class="ai-result-body">
          <pre v-if="!aiResultLoading">{{ aiResultText }}</pre>
          <div v-else class="ai-result-wait">AI 思考中…</div>
        </div>
        <div v-if="!aiResultLoading" class="ai-result-foot">
          <button v-if="aiCanApply" class="ai-foot-btn primary" @click="applyAiResult">应用到编辑器</button>
          <button class="ai-foot-btn" @click="copyAiResult">复制</button>
          <button class="ai-foot-btn" @click="closeAiResult">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { useEditorStore } from '@/stores/editor'
import { useProjectStore } from '@/stores/project'
import { useDebugStore } from '@/stores/debug'
import { ElMessage } from 'element-plus'
import { EVENT_EDITOR_JUMP, EVENT_EDITOR_REFRESH } from '@/constants/eventNames'
import { registerCustomTheme } from '@/config/editorTheme'
import {
  addWhiteBorders,
  getChineseDecorations,
  applyDecorations,
} from '@/utils/editorDecorations'
import { registerSnippets, disposeSnippets } from '@/services/snippetService'
import { registerBasicCompletion, disposeBasicCompletion } from '@/services/basicCompletionService'
import { registerAiCompletion, disposeAiCompletion } from '@/services/aiCompletionService'
import { API_AI_EDIT } from '@/constants/apiPaths'

// ===== Worker 配置 =====
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

// ===== Props =====
const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'javascript' },
  theme: { type: String, default: 'vs-dark' },
  readOnly: { type: Boolean, default: false },
  fontSize: { type: Number, default: 14 },
  tabSize: { type: Number, default: 2 },
})

const emit = defineEmits(['update:modelValue', 'change', 'ready'])

// ===== 本地状态 =====
const editorStore = useEditorStore()
const projectStore = useProjectStore()
const debugStore = useDebugStore()

// ===== AI 选区操作 =====
const aiBarVisible = ref(false)
const aiBarStyle = ref({ top: '0px', left: '0px' })
const aiResultVisible = ref(false)
const aiResultLoading = ref(false)
const aiResultText = ref('')
const aiAction = ref('explain')
const aiCanApply = ref(false)
let aiSelection = null
let aiSelectionDisposable = null

const aiActions = [
  { key: 'explain', label: '解释' },
  { key: 'optimize', label: '优化' },
  { key: 'refactor', label: '重构' },
  { key: 'fix', label: '找Bug' },
]

const aiResultTitle = computed(() => {
  const map = {
    explain: '解释这段代码',
    optimize: '优化这段代码',
    refactor: '重构这段代码',
    fix: '查找并修复 Bug',
  }
  return map[aiAction.value] || 'AI 操作'
})
const editorContainer = ref(null)
let editorInstance = null
let whiteBorderDecorationIds = []
let bpDecorationIds = []
let chineseDecorationIds = []

// ===== 应用所有装饰器 =====
const applyAllDecorations = () => {
  if (!editorInstance) return

  whiteBorderDecorationIds = applyDecorations(
    editorInstance,
    monaco,
    whiteBorderDecorationIds,
    (editor, m) => addWhiteBorders(editor, m)
  )

  chineseDecorationIds = applyDecorations(
    editorInstance,
    monaco,
    chineseDecorationIds,
    (editor, m) => getChineseDecorations(editor, m)
  )
}

// ===== 获取文件名 =====
// ===== 断点装饰（调试器） =====
const updateBreakpointDecorations = () => {
  if (!editorInstance) return
  const model = editorInstance.getModel()
  if (!model) return
  const path = editorStore.activeFile
  const lines = (path && debugStore.breakpoints[path]) || []
  if (bpDecorationIds.length) {
    editorInstance.deltaDecorations(bpDecorationIds, [])
    bpDecorationIds = []
  }
  const valid = lines.filter((l) => l >= 1 && l <= model.getLineCount())
  if (!valid.length) return
  bpDecorationIds = editorInstance.deltaDecorations(
    [],
    valid.map((l) => ({
      range: new monaco.Range(l, 1, l, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: 'debug-bp-glyph',
        glyphMarginHoverMessage: { value: '断点（点击行号切换）' },
      },
    }))
  )
}

// gutter 点击切换断点
let bpMouseDisposable = null
const bindBreakpointGutter = () => {
  if (!editorInstance || bpMouseDisposable) return
  bpMouseDisposable = editorInstance.onMouseDown((e) => {
    const type = e.target.type
    if (
      type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
      type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
    ) {
      const line = e.target.position.lineNumber
      const path = editorStore.activeFile
      if (path) debugStore.toggleBreakpoint(path, line)
    }
  })
}

// ===== 获取文件名 =====
const getFileName = (filePath) => {
  if (!filePath) return '文件'
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1]
}

// ===== 初始化编辑器 =====
const initEditor = () => {
  if (!editorContainer.value) return

  registerCustomTheme(monaco)

  if (editorInstance) {
    editorInstance.dispose()
  }

  editorStore.setMonacoInstance(editorInstance)
  editorInstance = monaco.editor.create(editorContainer.value, {
    value: props.modelValue,
    language: props.language,
    theme: 'my-dark',
    readOnly: props.readOnly,
    fontSize: props.fontSize,
    tabSize: props.tabSize,
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    autoSurround: 'languageDefined',
    autoIndent: 'full',
    formatOnPaste: true,
    formatOnType: true,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    minimap: { enabled: true },
    lineNumbers: 'on',
    renderLineHighlight: 'all',
    wordWrap: 'on',
    folding: true,
    links: true,
    colorDecorators: true,
    bracketPairColorization: { enabled: true },
    guides: {
      bracketPairs: true,
      indentation: true,
    },
    quickSuggestions: {
      other: true,
      comments: false,
      strings: false,
    },
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on',
    tabCompletion: 'on',
    wordBasedSuggestions: 'on',
    snippetSuggestions: 'top',
    // ===== 滚动条配置（半透明） =====
    /* token-exempt: third-party */
    scrollbar: {
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
      scrollSliderBackground: 'rgba(255, 255, 255, 0.15)',
      scrollSliderHoverBackground: 'rgba(255, 255, 255, 0.25)',
      scrollSliderActiveBackground: 'rgba(255, 255, 255, 0.35)',
      useShadows: false,
    },
    /* end token-exempt */
  })

  applyAllDecorations()

  editorInstance.onDidChangeCursorPosition(() => {
    setTimeout(applyAllDecorations, 10)
  })

  registerSnippets(['python', 'javascript', 'typescript', 'vue', 'html', 'css'])
  registerBasicCompletion(['python'])
  registerAiCompletion(() => projectStore.projectPath)

  aiSelectionDisposable = editorInstance.onDidChangeCursorSelection(() => {
    const sel = editorInstance.getSelection()
    const model = editorInstance.getModel()
    const selText = model ? model.getValueInRange(sel) : ''
    const hasText = !!(selText && selText.trim())
    editorStore.selectedText = hasText ? selText : ''
    if (hasText && !aiResultVisible.value) {
      aiSelection = { start: sel.getStartPosition(), end: sel.getEndPosition(), text: selText }
      const rect = editorInstance.getScrolledVisiblePosition(sel.getStartPosition())
      if (rect) {
        aiBarStyle.value = { top: Math.max(rect.top, 4) + 'px', left: Math.min(rect.left, 180) + 'px' }
      }
      aiBarVisible.value = true
    } else {
      aiBarVisible.value = false
    }
  })

  editorInstance.onDidChangeModelContent(() => {
    const value = editorInstance.getValue()
    emit('update:modelValue', value)
    emit('change', value)

    const filePath = editorStore.activeFile
    if (filePath) {
      editorStore.updateContent(filePath, value)
    }

    applyAllDecorations()
    if (editorStore.debouncedParse) {
      editorStore.debouncedParse(500)
    }
  })

  editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
    const success = await editorStore.saveCurrentFile()
    if (success) {
      ElMessage.success(`✅ 已保存: ${editorStore.activeFile ? getFileName(editorStore.activeFile) : '文件'}`)
    }
  })

  bindBreakpointGutter()
  updateBreakpointDecorations()

  setTimeout(() => {
    if (editorInstance) {
      editorInstance.layout()
    }
  }, 100)

  emit('ready', editorInstance)
}

// ===== 跳转事件 =====
const handleEditorJump = (event) => {
  const { startLine, endLine } = event.detail
  if (!editorInstance) return
  editorInstance.setSelection({
    startLineNumber: startLine,
    startColumn: 0,
    endLineNumber: endLine || startLine,
    endColumn: 999,
  })
  editorInstance.revealLinesInCenter(startLine, endLine || startLine)
  editorInstance.focus()
}

// 👇 新增：处理大纲点击跳转
const handleOutlineItemClick = (event) => {
  const { startLine, endLine } = event.detail
  if (!editorInstance) return
  
  editorInstance.setSelection({
    startLineNumber: startLine,
    startColumn: 1,
    endLineNumber: endLine || startLine,
    endColumn: 9999
  })
  editorInstance.revealLinesInCenter(startLine, endLine || startLine)
  editorInstance.focus()
}

const handleEditorRefresh = () => {
  const content = editorStore.currentContent
  if (editorInstance && content !== undefined) {
    editorInstance.setValue(content || '')
  }
}

// ===== 窗口 resize =====
const handleResize = () => {
  if (editorInstance) {
    editorInstance.layout()
  }
}

// ===== Watch =====
watch(() => editorStore.currentContent, (newContent, oldContent) => {
  if (!editorInstance) return
  const model = editorInstance.getModel()
  if (!model) return
  const fp = editorStore.activeFile
  // Agent 流式写入：仅在文档末尾增量追加（不整体 setValue，避免闪烁/跳光标），
  // 并自动滚动到末尾，呈现"代码正在长出来"的效果
  if (
    fp &&
    editorStore.isStreaming(fp) &&
    typeof oldContent === 'string' &&
    newContent.startsWith(oldContent) &&
    newContent.length > oldContent.length
  ) {
    const diff = newContent.slice(oldContent.length)
    const lastLine = model.getLineCount()
    const lastCol = model.getLineMaxColumn(lastLine)
    model.pushEditOperations(
      [],
      [{
        range: {
          startLineNumber: lastLine,
          startColumn: lastCol,
          endLineNumber: lastLine,
          endColumn: lastCol,
        },
        text: diff,
      }],
      () => null,
    )
    editorInstance.revealLine(model.getLineCount())
  } else {
    const current = editorInstance.getValue()
    if (newContent !== current) {
      editorInstance.setValue(newContent || '')
    }
  }
})

watch(() => editorStore.currentLanguage, (newLang) => {
  if (editorInstance) {
    const model = editorInstance.getModel()
    if (model) {
      monaco.editor.setModelLanguage(model, newLang)
      registerSnippets(['python', 'javascript', 'typescript', 'vue', 'html', 'css'])
      registerBasicCompletion(['python'])
    }
  }
})

watch(() => props.language, (newLang) => {
  if (editorInstance) {
    const model = editorInstance.getModel()
    if (model) {
      monaco.editor.setModelLanguage(model, newLang)
      registerSnippets(['python', 'javascript', 'typescript', 'vue', 'html', 'css'])
      registerBasicCompletion(['python'])
    }
  }
})

// ===== 断点变化 → 重绘装饰 =====
watch(
  () => {
    const path = editorStore.activeFile
    return JSON.stringify((path && debugStore.breakpoints[path]) || [])
  },
  () => updateBreakpointDecorations()
)

watch(() => editorStore.activeFile, () => updateBreakpointDecorations())

watch(() => props.modelValue, (newValue) => {
  if (editorInstance) {
    const currentValue = editorInstance.getValue()
    if (newValue !== currentValue) {
      editorInstance.setValue(newValue || '')
    }
  }
})

watch(() => props.readOnly, (readOnly) => {
  if (editorInstance) {
    editorInstance.updateOptions({ readOnly })
  }
})

// ===== 生命周期 =====
onMounted(() => {
  window.addEventListener(EVENT_EDITOR_JUMP, handleEditorJump)
  window.addEventListener(EVENT_EDITOR_REFRESH, handleEditorRefresh)
  window.addEventListener('resize', handleResize)
  // 👇 新增：监听大纲点击
  window.addEventListener('outline-item-click', handleOutlineItemClick)

  nextTick(() => {
    initEditor()
    setTimeout(() => {
      if (editorInstance) {
        editorInstance.layout()
      }
    }, 150)
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener(EVENT_EDITOR_JUMP, handleEditorJump)
  window.removeEventListener(EVENT_EDITOR_REFRESH, handleEditorRefresh)
  // 👇 新增：移除监听
  window.removeEventListener('outline-item-click', handleOutlineItemClick)

  disposeSnippets()
  disposeBasicCompletion()
  disposeAiCompletion()
  if (aiSelectionDisposable) { aiSelectionDisposable.dispose(); aiSelectionDisposable = null }

  if (bpMouseDisposable) { bpMouseDisposable.dispose(); bpMouseDisposable = null }

  if (editorInstance) {
    editorInstance.dispose()
    editorInstance = null
  }
})

const runAiAction = async (key) => {
  if (!aiSelection) return
  aiAction.value = key
  aiResultVisible.value = true
  aiResultLoading.value = true
  aiResultText.value = ''
  aiCanApply.value = ['optimize', 'refactor', 'fix'].includes(key)
  try {
    const res = await window.electronAPI?.callPythonAPI?.(API_AI_EDIT, {
      action: key,
      code: aiSelection.text,
      language: editorStore.currentLanguage,
    })
    aiResultText.value = res && res.success ? res.text : ('❌ ' + (res?.error || '调用失败'))
  } catch (e) {
    aiResultText.value = '❌ ' + (e?.message || e)
  } finally {
    aiResultLoading.value = false
  }
}

const applyAiResult = () => {
  if (!aiSelection || !editorInstance) return
  const m = aiResultText.value.match(/```[\s\S]*?\n([\s\S]*?)```/)
  const newText = m ? m[1].trim() : aiResultText.value.trim()
  if (!newText) return
  const model = editorInstance.getModel()
  const range = new monaco.Range(
    aiSelection.start.lineNumber, aiSelection.start.column,
    aiSelection.end.lineNumber, aiSelection.end.column
  )
  model.pushEditOperations([], [{ range, text: newText }], () => null)
  const path = editorStore.activeFile
  if (path && model.getValue() !== editorStore.lastSavedContent[path]) {
    editorStore.isModified[path] = true
  }
  editorStore.selectedText = ''
  closeAiResult()
  ElMessage.success('已应用到编辑器')
}

const copyAiResult = async () => {
  try {
    await navigator.clipboard.writeText(aiResultText.value)
    ElMessage.success('已复制')
  } catch (e) {
    ElMessage.warning('复制失败')
  }
}

const closeAiResult = () => {
  aiResultVisible.value = false
  aiResultLoading.value = false
  aiBarVisible.value = false
  if (editorInstance) editorInstance.focus()
}

defineExpose({
  getEditor: () => editorInstance,
  getValue: () => editorInstance?.getValue(),
  setValue: (value) => editorInstance?.setValue(value),
  focus: () => editorInstance?.focus(),
  formatDocument: () => editorInstance?.getAction('editor.action.formatDocument').run(),
  saveCurrentFile: () => editorStore.saveCurrentFile(),
})
</script>

<style scoped>
.code-editor-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}

:deep(.word-white-border) {
  border: 1px solid var(--border-current) !important;
  border-radius: 2px;
  background: transparent !important;
  box-sizing: border-box;
}

:deep(.chinese-char-border) {
  border: 1px solid var(--mark-cjk) !important;
  border-radius: var(--radius-2);
  background: transparent !important;
  box-sizing: border-box;
  margin: 0 -0.5px; /* scale-exempt: cjk-char-frame 字符框亚像素对齐 */
}

/* token-exempt: third-party */
/* ===== Minimap 滑块 - 玻璃质感半透明 ===== */
:deep(.minimap-slider .minimap-slider-horizontal) {
  background: rgba(255, 255, 255, 0.12) !important;
  backdrop-filter: blur(2px) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 2px !important;
  transition: background 0.15s ease !important;
}

:deep(.minimap-slider .minimap-slider-horizontal:hover) {
  background: rgba(255, 255, 255, 0.2) !important;
}

:deep(.minimap-slider .minimap-slider-horizontal:active) {
  background: rgba(255, 255, 255, 0.3) !important;
}

:deep(.minimap-slider .minimap-slider-shadow) {
  background: rgba(255, 255, 255, 0.04) !important;
}
/* end token-exempt */
/* ===== AI 选区浮动条 ===== */
.ai-selection-bar {
  position: absolute; z-index: 30; display: flex; gap: 2px; padding: 3px;
  background: rgba(22, 32, 36, 0.92); border: 1px solid rgba(78, 201, 176, 0.35);
  border-radius: 6px; backdrop-filter: blur(6px); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}
.ai-bar-btn {
  border: none; background: transparent; color: #B8D8D2; font-size: 11px;
  padding: 3px 8px; border-radius: 4px; cursor: pointer; transition: all .15s;
}
.ai-bar-btn:hover { background: rgba(78, 201, 176, 0.18); color: #4EC9B0; }

/* ===== AI 结果浮层 ===== */
.ai-result-overlay {
  position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center;
  background: rgba(8, 12, 14, 0.55); backdrop-filter: blur(3px);
}
.ai-result-panel {
  width: min(640px, 86%); max-height: 78%; display: flex; flex-direction: column;
  background: #121B1F; border: 1px solid rgba(78, 201, 176, 0.25); border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5); overflow: hidden;
}
.ai-result-head {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.ai-result-title { color: #4EC9B0; font-size: 13px; font-weight: 600; flex: 1; }
.ai-result-close {
  border: none; background: transparent; color: #6A7A82; font-size: 12px;
  cursor: pointer; padding: 2px 6px; border-radius: 4px;
}
.ai-result-close:hover { color: #E8F2F0; background: rgba(255, 255, 255, 0.08); }
.ai-result-body { flex: 1; overflow: auto; padding: 12px 14px; min-height: 120px; }
.ai-result-body pre {
  margin: 0; white-space: pre-wrap; word-break: break-word;
  color: #C8D8D5; font-size: 12.5px; line-height: 1.6; font-family: 'Consolas', 'Courier New', monospace;
}
.ai-result-wait { color: #6A7A82; font-size: 13px; padding: 24px 0; text-align: center; }
.ai-result-spin {
  width: 12px; height: 12px; border: 2px solid rgba(78, 201, 176, 0.25);
  border-top-color: #4EC9B0; border-radius: 50%; animation: ai-spin .8s linear infinite;
}
@keyframes ai-spin { to { transform: rotate(360deg); } }
.ai-result-foot { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid rgba(255, 255, 255, 0.06); }
.ai-foot-btn {
  border: 1px solid rgba(255, 255, 255, 0.12); background: transparent; color: #C8D8D5;
  font-size: 12px; padding: 5px 14px; border-radius: 6px; cursor: pointer; transition: all .15s;
}
.ai-foot-btn:hover { border-color: rgba(78, 201, 176, 0.5); color: #4EC9B0; }
.ai-foot-btn.primary { background: rgba(78, 201, 176, 0.16); border-color: rgba(78, 201, 176, 0.5); color: #4EC9B0; }
.ai-foot-btn.primary:hover { background: rgba(78, 201, 176, 0.28); }
:deep(.debug-bp-glyph) {
  width: 8px !important;
  height: 8px !important;
  border-radius: 50%;
  background: #E5484D !important;
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 4px rgba(229, 72, 77, 0.8);
  margin-left: 5px;
  box-sizing: content-box;
}
</style>