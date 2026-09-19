// electron/ipc/agent-translate.js
const { ipcMain } = require('electron')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { isPathAllowed } = require('../utils/path-guard')

let pythonPort = 8765

function setPythonPort(port) {
  pythonPort = port
}

function getPythonUrl(endpoint) {
  return `http://127.0.0.1:${pythonPort}${endpoint}`
}

function registerAgentHandlers() {
  // ===== 翻译请求 =====
  ipcMain.handle('agent-translate', async (event, params) => {
    // 参数校验：params 必须是对象
    if (!params || typeof params !== 'object') {
      return { success: false, error: '参数必须是对象' }
    }
    const { code, filePath, projectPath, language, provider } = params

    try {
      const response = await axios({
        method: 'post',
        url: getPythonUrl('/agent/translate'),
        data: {
          code: typeof code === 'string' ? code : '',
          file_path: typeof filePath === 'string' ? filePath : '',
          project_path: typeof projectPath === 'string' ? projectPath : '',
          language: language || '',
          provider: provider || 'deepseek',
        },
        timeout: 120000,
      })

      return {
        success: true,
        content: response.data,
      }
    } catch (error) {
      console.error('[agent-translate] 翻译失败:', error.message)
      return {
        success: false,
        error: error.message,
      }
    }
  })

  // ===== 读取翻译文件（每个文件独立） =====
  ipcMain.handle('load-translation', async (event, params) => {
    const { projectPath, filePath } = params || {}

    if (typeof projectPath !== 'string' || typeof filePath !== 'string') {
      return { success: false, content: null, error: '缺少路径参数' }
    }

    // 路径守卫：projectPath 必须在允许的根目录内
    if (!isPathAllowed(projectPath)) {
      console.warn('[load-translation] 拒绝越权路径:', projectPath)
      return { success: false, content: null, error: '路径不在允许范围内' }
    }

    // 获取文件名
    const fileName = path.basename(filePath)
    // 翻译文件路径：.myide/translations/文件名.json
    const translationDir = path.join(projectPath, '.myide', 'translations')
    const translationFile = path.join(translationDir, `${fileName}.json`)

    console.log('[load-translation] 读取:', fileName)

    try {
      if (!fs.existsSync(translationFile)) {
        console.log('[load-translation] 文件不存在')
        return { success: true, content: null }
      }
      const content = fs.readFileSync(translationFile, 'utf-8')
      console.log('[load-translation] 读取成功, content length:', content.length)
      return { success: true, content }
    } catch (error) {
      console.error('[load-translation] 读取失败:', error.message)
      return { success: false, content: null, error: error.message }
    }
  })

  // ===== 保存翻译文件（每个文件独立） =====
  ipcMain.handle('save-translation', async (event, params) => {
    const { projectPath, filePath, content } = params || {}

    if (typeof projectPath !== 'string' || typeof filePath !== 'string') {
      return { success: false, error: '缺少路径参数' }
    }

    // 路径守卫：projectPath 必须在允许的根目录内
    if (!isPathAllowed(projectPath)) {
      console.warn('[save-translation] 拒绝越权路径:', projectPath)
      return { success: false, error: '路径不在允许范围内' }
    }

    // 获取文件名
    const fileName = path.basename(filePath)
    // 翻译文件路径：.myide/translations/文件名.json
    const translationDir = path.join(projectPath, '.myide', 'translations')
    const translationFile = path.join(translationDir, `${fileName}.json`)

    console.log('[save-translation] 保存:', fileName, ', content length:', typeof content === 'string' ? content.length : 0)

    try {
      // 确保目录存在（隐藏文件夹）
      if (!fs.existsSync(translationDir)) {
        fs.mkdirSync(translationDir, { recursive: true })
      }

      fs.writeFileSync(translationFile, content, 'utf-8')

      // 验证文件是否真的写入了
      if (fs.existsSync(translationFile)) {
        const stats = fs.statSync(translationFile)
        console.log('[save-translation] 写入验证成功, size:', stats.size, 'bytes')
      }

      return { success: true }
    } catch (error) {
      console.error('[save-translation] 写入失败:', error.message)
      return { success: false, error: error.message }
    }
  })
}

module.exports = {
  registerAgentHandlers,
  setPythonPort,
}
