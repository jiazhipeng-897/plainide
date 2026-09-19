/**
 * 搜索与替换服务
 * 封装全局搜索、内容查找、批量替换功能
 */

import { flattenFileTree } from '@/utils/treeUtils'
import { findTextMatches } from '@/utils/searchUtils'
import { readFile, writeFile } from '@/services/fileService'

/**
 * 在项目文件中搜索关键词
 * @param {Array} fileTree - 文件树
 * @param {string} keyword - 搜索关键词
 * @param {Function} onProgress - 进度回调 (current, total)
 * @returns {Promise<Array>} 搜索结果 [{ path, fileName, matches }]
 */
export async function searchInProject(fileTree, keyword, onProgress) {
  const files = flattenFileTree(fileTree)
  const results = []
  const keywordTrimmed = keyword.trim()

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    try {
      const content = await readFile(file.path)
      const matches = findTextMatches(content, keywordTrimmed)
      if (matches.length > 0) {
        results.push({
          path: file.path,
          fileName: file.name,
          matches,
        })
      }
    } catch {
      // 单个文件读取失败跳过
    }

    if (onProgress) {
      onProgress(i + 1, files.length)
    }
  }

  return results
}

/**
 * 批量替换所有匹配项
 * @param {Array} results - 搜索结果数组
 * @param {string} keyword - 原关键词
 * @param {string} replaceText - 替换文本
 * @param {Function} onProgress - 进度回调 (current, total)
 * @returns {Promise<{ replacedCount: number, failedCount: number }>}
 */
export async function replaceAllMatches(results, keyword, replaceText, onProgress) {
  let replacedCount = 0
  let failedCount = 0

  for (let i = 0; i < results.length; i++) {
    const file = results[i]
    try {
      const content = await readFile(file.path)
      const newContent = content.split(keyword).join(replaceText)
      await writeFile(file.path, newContent)
      replacedCount += file.matches.length
    } catch {
      failedCount++
    }

    if (onProgress) {
      onProgress(i + 1, results.length)
    }
  }

  return { replacedCount, failedCount }
}

/**
 * 计算匹配总数
 * @param {Array} results - 搜索结果数组
 * @returns {number}
 */
export function countTotalMatches(results) {
  return results.reduce((sum, f) => sum + f.matches.length, 0)
}