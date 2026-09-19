/**
 * 代码片段补全服务
 */

import * as monaco from 'monaco-editor'
import snippetsData from '@/snippets.json'

let completionDisposable = null

/**
 * 注册代码片段补全提供器
 * @param {string[]} languages - 要注册的语言列表
 */
export function registerSnippets(languages) {
  if (completionDisposable) {
    completionDisposable.dispose()
    completionDisposable = null
  }

  completionDisposable = monaco.languages.registerCompletionItemProvider(languages, {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      // 当前文件关键词建议
      const textUntilPosition = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })
      const words = new Set(textUntilPosition.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g) || [])
      const fileSuggestions = Array.from(words).map((w) => ({
        label: w,
        kind: monaco.languages.CompletionItemKind.Text,
        insertText: w,
        range,
        detail: '当前文件',
      }))

      // 从 snippets.json 加载片段
      const currentLanguage = model.getLanguageId()
      const langSnippets = snippetsData[currentLanguage] || {}
      const snippetSuggestions = Object.values(langSnippets).map((s) => ({
        label: s.prefix,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: s.body.join('\n'),
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: s.description || s.prefix,
        range,
      }))

      return {
        suggestions: [...snippetSuggestions, ...fileSuggestions],
      }
    },
  })
}

/**
 * 销毁补全提供器
 */
export function disposeSnippets() {
  if (completionDisposable) {
    completionDisposable.dispose()
    completionDisposable = null
  }
}