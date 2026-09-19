/**
 * 编辑器 Layout 刷新组合式函数
 * 统一封装 nextTick + setTimeout + editor.layout() 刷新模式
 * 原 Editor.vue / EditorArea.vue 各4处重复，延时参数不统一
 */
import { nextTick } from 'vue'

/**
 * 创建编辑器 layout 刷新工具
 * @param {Function} getEditor - 获取 monaco editor 实例的函数
 * @param {Object} [options]
 * @param {number} [options.delay=100] - 默认延时毫秒
 * @returns {Object} { refreshLayout, refreshDelayed }
 */
export function useEditorLayout(getEditor, options = {}) {
  const { delay = 100 } = options

  /**
   * 立即刷新（nextTick 后执行）
   */
  const refreshLayout = () => {
    nextTick(() => {
      const editor = getEditor()
      if (editor && typeof editor.layout === 'function') {
        editor.layout()
      }
    })
  }

  /**
   * 延时刷新（nextTick + setTimeout）
   * @param {number} [customDelay] - 自定义延时，不传用默认值
   */
  const refreshDelayed = (customDelay) => {
    const ms = customDelay ?? delay
    nextTick(() => {
      setTimeout(() => {
        const editor = getEditor()
        if (editor && typeof editor.layout === 'function') {
          editor.layout()
        }
      }, ms)
    })
  }

  return {
    refreshLayout,
    refreshDelayed,
  }
}
