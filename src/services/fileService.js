/**
 * 文件读写服务
 * 统一封装 Electron IPC 文件操作
 * 所有文件读写统一走此服务，不再分散在组件和 store 中
 */

/**
 * 读取文件内容
 * @param {string} filePath - 文件路径
 * @returns {Promise<string|null>} 文件内容，失败返回 null
 */
export async function readFile(filePath) {
  try {
    const content = await window.electronAPI?.readFile?.(filePath)
    return content
  } catch (e) {
    console.error('[fileService] 读取文件失败:', filePath, e)
    return null
  }
}

/**
 * 写入文件内容
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 * @returns {Promise<boolean>} 是否成功
 */
export async function writeFile(filePath, content) {
  try {
    await window.electronAPI?.writeFile?.(filePath, content)
    return true
  } catch (e) {
    console.error('[fileService] 写入文件失败:', filePath, e)
    return false
  }
}

/**
 * 确保目录存在
 * @param {string} dirPath - 目录路径
 * @returns {Promise<boolean>} 是否成功
 */
export async function ensureDir(dirPath) {
  try {
    await window.electronAPI?.ensureDir?.(dirPath)
    return true
  } catch (e) {
    console.error('[fileService] 创建目录失败:', dirPath, e)
    return false
  }
}

/**
 * 删除文件
 * @param {string} filePath - 文件路径
 * @returns {Promise<boolean>} 是否成功
 */
export async function deleteFile(filePath) {
  try {
    await window.electronAPI?.deleteFile?.(filePath)
    return true
  } catch (e) {
    console.error('[fileService] 删除文件失败:', filePath, e)
    return false
  }
}

/**
 * 保存文件（带状态更新的保存，走编辑器专用保存IPC）
 * @param {Object} params - { path, content }
 * @returns {Promise<Object>} 保存结果
 */
export async function saveEditorFile(params) {
  try {
    const result = await window.electronAPI?.saveFile?.(params)
    return result
  } catch (e) {
    console.error('[fileService] 保存文件失败:', e)
    return { success: false, error: e.message }
  }
}

/**
 * 批量读取文件
 * @param {Array<string>} filePaths - 文件路径数组
 * @returns {Promise<Array<{path:string, content:string}>>}
 */
export async function batchReadFiles(filePaths) {
  const results = []
  for (const path of filePaths) {
    try {
      const content = await readFile(path)
      if (content !== null) {
        results.push({ path, content })
      }
    } catch {
      // 单个文件失败不中断整体
      continue
    }
  }
  return results
}