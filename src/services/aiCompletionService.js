/**
 * AI 代码补全服务（Cursor Tab 风格幽灵文本）
 * 基于 Monaco InlineCompletionsProvider：
 * - 停笔 ~300ms 触发
 * - 取光标前 prefix（2000 字符）+ 光标后 suffix（400 字符）
 * - 调 Python 后端 /orchestrator/complete（FIM 优先）
 * - 渲染为灰色幽灵文本：Tab 接受、Esc 拒绝（Monaco 内置行为）
 * - 缓存 5 秒 + 请求去重 + 过期响应丢弃
 */

import * as monaco from 'monaco-editor'
import { API_COMPLETE } from '@/constants/apiPaths'

let disposable = null
let debounceTimer = null
let requestSeq = 0 // 递增序号，只采用最新一次请求的结果

// prefix(尾部120) + suffix(尾部60) -> { suggestions, ts }
const cache = new Map()
const CACHE_TTL = 5000

const DEBOUNCE_MS = 300
const PREFIX_MAX = 2000
const SUFFIX_MAX = 400
const MIN_TEXT_LEN = 2

/** 补全开关（设置面板控制，默认开） */
export function isAiCompletionEnabled() {
  try {
    return localStorage.getItem('ai-completion-enabled') !== 'false'
  } catch (e) {
    return true
  }
}

function cacheKey(prefix, suffix) {
  return `${prefix.slice(-120)}|${suffix.slice(-60)}`
}

/**
 * 注册 AI 行内补全
 * @param {Function} [getProjectPath] - 返回当前项目根路径的回调（用于仓库感知 RAG）
 */
export function registerAiCompletion(getProjectPath) {
  disposeAiCompletion()

  disposable = monaco.languages.registerInlineCompletionsProvider(
    ['python', 'javascript', 'typescript', 'vue', 'html', 'css', 'json', 'markdown'],
    {
      provideInlineCompletions(model, position, context, token) {
        // 开关关闭：不补全
        if (!isAiCompletionEnabled()) return null

        // 当前行光标前只有空白：不补全（避免在缩进处乱弹）
        const lineText = model.getLineContent(position.lineNumber)
        const textBeforeOnLine = lineText.substring(0, position.column - 1)
        if (!textBeforeOnLine.trim()) return null

        const mySeq = ++requestSeq

        // 停笔去抖：新输入会重置计时器，300ms 内未再输入才发起请求
        return new Promise((resolve) => {
          clearTimeout(debounceTimer)
          debounceTimer = setTimeout(async () => {
            try {
              if (token.isCancellationRequested || mySeq !== requestSeq) {
                resolve(null)
                return
              }

              const fullPrefix = model.getValueInRange({
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              })
              const fullSuffix = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: model.getLineCount(),
                endColumn: model.getLineMaxColumn(model.getLineCount()),
              })
              const prefix = fullPrefix.slice(-PREFIX_MAX)
              const suffix = fullSuffix.slice(0, SUFFIX_MAX)
              if (!prefix.trim()) {
                resolve(null)
                return
              }

              const key = cacheKey(prefix, suffix)
              const hit = cache.get(key)
              if (hit && Date.now() - hit.ts < CACHE_TTL) {
                resolve(hit.suggestions)
                return
              }

              const result = await window.electronAPI?.callPythonAPI?.(API_COMPLETE, {
                prefix,
                suffix,
                language: model.getLanguageId(),
                project_path: typeof getProjectPath === 'function' ? getProjectPath() : '',
              })

              // 过期响应丢弃
              if (token.isCancellationRequested || mySeq !== requestSeq) {
                resolve(null)
                return
              }

              const text = result?.success ? String(result.text || '').trim() : ''
              if (!text || text.length < MIN_TEXT_LEN) {
                resolve(null)
                return
              }

              // 幽灵文本插入范围 = 光标处 0 宽
              const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column,
                endColumn: position.column,
              }
              const suggestions = {
                suggestions: [{ insertText: text, range }],
              }
              cache.set(key, { suggestions, ts: Date.now() })
              resolve(suggestions)
            } catch (e) {
              resolve(null)
            }
          }, DEBOUNCE_MS)
        })
      },

      freeInlineCompletions() {
        // 无需额外清理（内存缓存有 TTL）
      },
    }
  )
}

/**
 * 销毁 AI 补全
 */
export function disposeAiCompletion() {
  clearTimeout(debounceTimer)
  debounceTimer = null
  if (disposable) {
    disposable.dispose()
    disposable = null
  }
}
