/**
 * Monaco 编辑器装饰器工具
 * 白框（相同单词高亮）+ 中文绿色边框
 */

/**
 * 给所有相同单词加白色边框
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} editor
 * @param {import('monaco-editor')} monaco
 * @returns {string[]} 装饰器 ID 数组（用于后续清除）
 */
export function addWhiteBorders(editor, monaco) {
  if (!editor) return []

  const model = editor.getModel()
  const position = editor.getPosition()
  if (!model || !position) return []

  const wordAtPosition = model.getWordAtPosition(position)
  if (!wordAtPosition) return []

  const word = wordAtPosition.word
  const decorations = []
  const fullText = model.getValue()
  const lines = fullText.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let index = line.indexOf(word)

    while (index !== -1) {
      const beforeChar = index > 0 ? line[index - 1] : ''
      const afterChar = index + word.length < line.length ? line[index + word.length] : ''
      const isWordBoundary = !/[\w$]/.test(beforeChar) && !/[\w$]/.test(afterChar)

      if (isWordBoundary) {
        decorations.push({
          range: new monaco.Range(i + 1, index + 1, i + 1, index + 1 + word.length),
          options: {
            inlineClassName: 'word-white-border',
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        })
      }
      index = line.indexOf(word, index + 1)
    }
  }

  return decorations
}

/**
 * 给所有连续中文字符串加浅绿色边框
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} editor
 * @param {import('monaco-editor')} monaco
 * @returns {Array<{range: import('monaco-editor').IRange, options: Object}>} 装饰器配置数组
 */
export function getChineseDecorations(editor, monaco) {
  if (!editor) return []

  const model = editor.getModel()
  if (!model) return []

  const fullText = model.getValue()
  const decorations = []
  const chineseRegex = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+/g
  let match

  while ((match = chineseRegex.exec(fullText)) !== null) {
    const startIndex = match.index
    const endIndex = startIndex + match[0].length - 1
    const startPos = model.getPositionAt(startIndex)
    const endPos = model.getPositionAt(endIndex)

    if (startPos.lineNumber === endPos.lineNumber) {
      decorations.push({
        range: new monaco.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column + 1
        ),
        options: {
          inlineClassName: 'chinese-char-border',
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      })
    }
  }

  return decorations
}

/**
 * 应用装饰器到编辑器
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} editor
 * @param {import('monaco-editor')} monaco
 * @param {string[]} oldDecorationIds - 旧装饰器 ID 数组
 * @param {Function} getDecorationsFn - 返回装饰器配置数组的函数
 * @returns {string[]} 新的装饰器 ID 数组
 */
export function applyDecorations(editor, monaco, oldDecorationIds, getDecorationsFn) {
  if (!editor) return []

  const decorations = getDecorationsFn(editor, monaco)
  if (decorations.length === 0) {
    if (oldDecorationIds.length > 0) {
      editor.deltaDecorations(oldDecorationIds, [])
    }
    return []
  }

  return editor.deltaDecorations(oldDecorationIds, decorations)
}