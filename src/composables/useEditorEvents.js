/**
 * 编辑器事件监听组合式函数
 * 封装 EVENT_EDITOR_JUMP 和 EVENT_EDITOR_REFRESH 事件
 */
import { onMounted, onBeforeUnmount } from 'vue'
import { EVENT_EDITOR_JUMP, EVENT_EDITOR_REFRESH } from '@/constants/eventNames'

/**
 * 监听编辑器跳转和刷新事件
 * @param {Function} getEditor - 获取 monaco editor 实例的函数
 * @param {Function} getContent - 获取当前内容的函数（用于刷新）
 * @param {Function} setContent - 设置内容的函数（用于刷新）
 */
export function useEditorEvents(getEditor, getContent, setContent) {
  const handleEditorJump = (event) => {
    const { startLine, endLine } = event.detail
    const editor = getEditor()
    if (!editor) return

    editor.setSelection({
      startLineNumber: startLine,
      startColumn: 0,
      endLineNumber: endLine || startLine,
      endColumn: 999,
    })
    editor.revealLinesInCenter(startLine, endLine || startLine)
    editor.focus()
  }

  const handleEditorRefresh = () => {
    const editor = getEditor()
    if (!editor) return

    const content = getContent()
    if (content !== undefined) {
      editor.setValue(content || '')
    }
  }

  onMounted(() => {
    window.addEventListener(EVENT_EDITOR_JUMP, handleEditorJump)
    window.addEventListener(EVENT_EDITOR_REFRESH, handleEditorRefresh)
  })

  onBeforeUnmount(() => {
    window.removeEventListener(EVENT_EDITOR_JUMP, handleEditorJump)
    window.removeEventListener(EVENT_EDITOR_REFRESH, handleEditorRefresh)
  })
}