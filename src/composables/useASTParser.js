/**
 * AST 解析组合式函数
 * 封装代码解析 + 防抖逻辑
 */
import { ref, onBeforeUnmount } from 'vue'
import { parseCode } from '@/services/astService'
import { useDebouncedAction } from '@/composables/useDebouncedAction'

/**
 * 创建 AST 解析器
 * @param {Object} editorStore - editor store 实例
 * @param {number} delay - 防抖延迟（默认 500ms）
 * @returns {Object} { parse, parseDebounced, cancel }
 */
export function useASTParser(editorStore, delay = 500) {
  const parseTimer = ref(null)

  const parse = async (filePath, content) => {
    if (!filePath || !content) return

    try {
      const result = await parseCode(filePath, content, {
        includeTemplateAst: true,
      })

      if (result.success) {
        editorStore.setASTTree(result.root || null)

        if (result.outline) {
          const symbols = []
          const funcs = result.outline.functions || result.outline.top_level_functions || []
          for (const func of funcs) {
            symbols.push({
              name: func.name || 'unnamed',
              type: 'function',
              lineno: func.start_line || func.start?.line || 0,
              params: func.params || [],
            })
          }
          const classes = result.outline.classes || []
          for (const cls of classes) {
            symbols.push({
              name: cls.name || 'unnamed',
              type: 'class',
              lineno: cls.start_line || cls.start?.line || 0,
            })
          }
          editorStore.setOutline(symbols)
        } else {
          editorStore.setOutline([])
        }
      } else {
        editorStore.setASTTree(null)
        editorStore.setOutline([])
      }
    } catch (error) {
      console.error('AST 解析异常:', error)
      editorStore.setASTTree(null)
      editorStore.setOutline([])
    }
  }

  const { run: parseDebounced, cancel } = useDebouncedAction(parse, delay)

  onBeforeUnmount(() => {
    cancel()
  })

  return {
    parse,
    parseDebounced,
    cancel,
  }
}