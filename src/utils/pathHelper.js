/**
 * 路径处理工具函数
 * 统一管理文件路径相关的纯函数逻辑
 */

/**
 * 从完整路径中提取文件名（含后缀）
 * @param {string} filePath - 完整文件路径
 * @returns {string} 文件名，路径为空时返回空字符串
 */
export function getFileName(filePath) {
  if (!filePath || typeof filePath !== 'string') return ''
  return filePath.split(/[\\/]/).pop() || ''
}

/**
 * 从文件名或路径中提取文件后缀（不含点）
 * @param {string} filePath - 文件名或完整路径
 * @returns {string} 小写的文件后缀，无后缀时返回空字符串
 */
export function getFileExt(filePath) {
  if (!filePath || typeof filePath !== 'string') return ''
  const fileName = getFileName(filePath)
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex === -1 || dotIndex === 0) return ''
  return fileName.slice(dotIndex + 1).toLowerCase()
}
