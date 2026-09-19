/**
 * AI 功能服务
 * 封装代码翻译、代码医生格式化等 AI 相关接口
 */
import { API_TRANSLATE, API_DOCTOR_FORMAT } from '@/constants/apiPaths'

/**
 * 代码翻译
 * @param {string} code - 源代码
 * @param {string} [mode='full'] - 翻译模式 full/comment
 * @returns {Promise<Object>} 翻译结果
 */
export async function translateCode(code, mode = 'full') {
  try {
    const result = await window.electronAPI?.callPythonAPI?.(API_TRANSLATE, {
      code,
      mode,
    })
    return result
  } catch (e) {
    console.error('[aiService] 翻译失败:', e)
    return { success: false, error: e.message }
  }
}

/**
 * 代码医生格式化
 * @param {string} file_path - 文件路径
 * @returns {Promise<Object>} 格式化结果
 */
export async function doctorFormat(file_path) {
  try {
    const result = await window.electronAPI?.callPythonAPI?.(API_DOCTOR_FORMAT, {
      file_path,
    })
    return result
  } catch (e) {
    console.error('[aiService] 格式化失败:', e)
    return { success: false, message: e.message, errors: [] }
  }
}
