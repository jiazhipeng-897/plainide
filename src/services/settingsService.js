/**
 * 设置相关服务
 * 封装 API 配置、连接测试等设置功能接口
 */
import { API_TEST_CONNECTION } from '@/constants/apiPaths'

/**
 * 测试 API 连接
 * @param {string} provider - 服务商标识
 * @returns {Promise<Object>} { success, message, error }
 */
export async function testConnection(provider) {
  try {
    const result = await window.electronAPI?.callPythonAPI?.(API_TEST_CONNECTION, {
      provider,
    })
    return result
  } catch (e) {
    console.error('[settingsService] 连接测试失败:', e)
    return { success: false, error: e.message }
  }
}

/**
 * 获取已保存的 API 配置
 * @returns {Promise<Object|null>} 配置对象
 */
export async function getApiConfig() {
  try {
    const saved = await window.electronAPI?.getApiConfig?.()
    return saved || null
  } catch (e) {
    console.error('[settingsService] 读取配置失败:', e)
    return null
  }
}

/**
 * 保存 API 配置
 * @param {Object} config - 配置对象
 * @returns {Promise<boolean>} 是否成功
 */
export async function saveApiConfig(config) {
  try {
    await window.electronAPI?.saveApiConfig?.({ ...config })
    return true
  } catch (e) {
    console.error('[settingsService] 保存配置失败:', e)
    return false
  }
}
