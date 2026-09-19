/**
 * 单击/双击区分组合式函数
 * 用于区分单击和双击事件，单击延迟触发，双击取消单击
 */
import { ref, onBeforeUnmount } from 'vue'

const DEFAULT_DELAY = 200

/**
 * 创建单击/双击区分器
 * @param {Function} onSingleClick - 单击回调
 * @param {Function} onDoubleClick - 双击回调
 * @param {number} delay - 单击延迟毫秒数（默认 200）
 * @returns {Object} { handleClick, handleDblClick, cancel }
 */
export function useClickTimer(onSingleClick, onDoubleClick, delay = DEFAULT_DELAY) {
  let clickTimer = null

  const handleClick = (...args) => {
    if (clickTimer) {
      clearTimeout(clickTimer)
      clickTimer = null
    }

    clickTimer = setTimeout(() => {
      if (onSingleClick) {
        onSingleClick(...args)
      }
      clickTimer = null
    }, delay)
  }

  const handleDblClick = (...args) => {
    if (clickTimer) {
      clearTimeout(clickTimer)
      clickTimer = null
    }
    if (onDoubleClick) {
      onDoubleClick(...args)
    }
  }

  const cancel = () => {
    if (clickTimer) {
      clearTimeout(clickTimer)
      clickTimer = null
    }
  }

  onBeforeUnmount(() => {
    cancel()
  })

  return {
    handleClick,
    handleDblClick,
    cancel,
  }
}