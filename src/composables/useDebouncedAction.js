/**
 * 防抖 Action 组合式函数
 * 带自动清理的防抖封装，组件卸载时自动取消待执行调用
 * 解决原 EditorArea.vue parseTimer、AgentPanel.vue saveTimer 等内存泄漏问题
 */
import { onBeforeUnmount } from 'vue'

/**
 * 创建带自动清理的防抖函数
 * @param {Function} fn - 要防抖的函数
 * @param {number} [defaultDelay=500] - 默认延迟毫秒
 * @returns {Object} { run, cancel, flush }
 */
export function useDebouncedAction(fn, defaultDelay = 500) {
  let timer = null

  const run = (...args) => {
    cancel()
    timer = setTimeout(() => {
      fn(...args)
      timer = null
    }, defaultDelay)
  }

  const cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  const flush = (...args) => {
    cancel()
    fn(...args)
  }

  // 组件卸载时自动清理
  onBeforeUnmount(() => {
    cancel()
  })

  return {
    run,
    cancel,
    flush,
  }
}
