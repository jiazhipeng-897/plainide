/**
 * 窗口 resize 监听组合式函数
 * 自动在 onMounted 绑定、onBeforeUnmount 解绑，解决内存泄漏
 * 原 Editor.vue / EditorArea.vue 两处重复实现且其中一处未销毁
 */
import { onMounted, onBeforeUnmount } from 'vue'

/**
 * 监听 window resize 事件，自动管理生命周期
 * @param {Function} handler - resize 回调函数
 * @param {Object} [options]
 * @param {number} [options.debounceMs=100] - 防抖毫秒数
 */
export function useWindowResize(handler, options = {}) {
  const { debounceMs = 100 } = options
  let timer = null

  const debouncedHandler = () => {
    if (debounceMs > 0) {
      clearTimeout(timer)
      timer = setTimeout(handler, debounceMs)
    } else {
      handler()
    }
  }

  onMounted(() => {
    window.addEventListener('resize', debouncedHandler)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', debouncedHandler)
    if (timer) clearTimeout(timer)
  })
}
