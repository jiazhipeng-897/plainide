/**
 * AST 语法解析服务
 * 封装所有与代码语法解析相关的后端 API 调用
 */

import { callPythonAPI } from '@/utils/http'

/**
 * 解析代码文件，获取 AST 语法树和大纲
 * @param {string} fullPath - 文件完整路径
 * @param {string} source - 文件源代码内容
 * @param {Object} extraOptions - 额外的解析选项
 * @returns {Promise<Object>} 解析结果，包含 outline 和 astTree
 */
export async function parseCode(fullPath, source, extraOptions = {}) {
  return await callPythonAPI('/parse', {
    fullPath,
    source,
    ...extraOptions
  })
}
