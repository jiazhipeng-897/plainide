/**
 * 防抖 / 节流 高阶函数工具
 * 纯函数版本，不包含生命周期管理
 * 如需自动清理的组件级防抖，请使用 composables/useDebouncedAction
 */

/**
 * 创建防抖函数
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟毫秒数
 * @returns {Function} 防抖后的函数，附带 cancel 方法用于手动取消
 */
export function debounce(fn, delay = 300) {
  let timer = null

  const debounced = function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
      timer = null
    }, delay)
  }

  /**
   * 取消待执行的防抖调用
   */
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  /**
   * 立即执行（取消等待并立即调用）
   */
  debounced.flush = function (...args) {
    debounced.cancel()
    fn.apply(this, args)
  }

  return debounced
}

/**
 * 创建节流函数
 * @param {Function} fn - 要节流的函数
 * @param {number} wait - 节流间隔毫秒数
 * @returns {Function} 节流后的函数
 */
export function throttle(fn, wait = 300) {
  let lastTime = 0

  return function (...args) {
    const now = Date.now()
    if (now - lastTime >= wait) {
      lastTime = now
      fn.apply(this, args)
    }
  }
}
