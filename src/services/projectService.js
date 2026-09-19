/**
 * 项目与文件扫描服务
 * 封装所有与项目扫描、文件操作相关的后端 API 调用
 */

import { callPythonAPI } from '@/utils/http'

/**
 * 扫描指定目录，获取文件列表
 * @param {string} path - 目录路径
 * @returns {Promise<Object>} 扫描结果，包含 files 数组
 */
export async function scanDirectory(path) {
  return await callPythonAPI('/scan', {
    path
  })
}

/**
 * 选择文件夹（打开系统对话框）
 * @returns {Promise<string|null>} 选中的文件夹路径，取消返回 null
 */
export async function selectFolder() {
  try {
    const path = await window.electronAPI?.selectFolder?.()
    return path || null
  } catch (e) {
    console.error('[projectService] 选择文件夹失败:', e)
    return null
  }
}

/**
 * 在指定目录创建文件
 * @param {string} dirPath - 目标目录路径
 * @param {string} fileName - 文件名（含扩展名）
 * @returns {Promise<Object>} 创建结果
 */
export async function createFile(dirPath, fileName) {
  // 🔑 关键修复：拼接完整路径
  const normalizedDir = dirPath.replace(/\\/g, '/')
  const normalizedName = fileName.replace(/\\/g, '/')
  const fullPath = normalizedDir.endsWith('/') 
    ? normalizedDir + normalizedName 
    : normalizedDir + '/' + normalizedName
  
  console.log('[createFile] 完整路径:', fullPath)
  
  return await callPythonAPI('/file/create', {
    path: fullPath  // 传完整路径
  })
}

/**
 * 在指定目录创建文件夹
 * @param {string} dirPath - 目标目录路径
 * @param {string} folderName - 文件夹名称
 * @returns {Promise<Object>} 创建结果
 */
export async function createFolder(dirPath, folderName) {
  const normalizedDir = dirPath.replace(/\\/g, '/')
  const normalizedName = folderName.replace(/\\/g, '/')
  const fullPath = normalizedDir.endsWith('/') 
    ? normalizedDir + normalizedName 
    : normalizedDir + '/' + normalizedName
  
  console.log('[createFolder] 完整路径:', fullPath)
  
  return await callPythonAPI('/folder/create', {
    path: fullPath
  })
}

/**
 * 删除文件或文件夹
 * @param {string} path - 要删除的路径
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteFile(path) {
  return await callPythonAPI('/file/delete', {
    path
  })
}

/**
 * 重命名文件或文件夹
 * @param {string} oldPath - 原路径
 * @param {string} newName - 新名称
 * @returns {Promise<Object>} 重命名结果
 */
export async function renameFile(oldPath, newName) {
  return await callPythonAPI('/file/rename', {
    oldPath,
    newName
  })
}