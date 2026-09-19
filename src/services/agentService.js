// src/services/agentService.js
/**
 * Agent 服务
 * 调用 Electron IPC，与 Python 后端通信
 */

/**
 * 流式翻译（调用 Python Agent）
 */
export async function agentTranslate({
  code,
  filePath,
  projectPath,
  language,
  provider,
  onChunk,
  onComplete,
  onError,
}) {
  try {
    console.log('[agentService] ========== 开始调用翻译 ==========')
    console.log('[agentService] filePath:', filePath)
    console.log('[agentService] projectPath:', projectPath)
    console.log('[agentService] language:', language)
    console.log('[agentService] provider:', provider)
    console.log('[agentService] code length:', code?.length || 0)

    const result = await window.electronAPI.agentTranslate({
      code,
      filePath,
      projectPath,
      language,
      provider,
    })

    console.log('[agentService] 收到结果:', result)
    console.log('[agentService] result.success:', result?.success)
    console.log('[agentService] result.content length:', result?.content?.length || 0)

    if (!result || typeof result !== 'object') {
      console.error('[agentService] ❌ 无效的响应:', result)
      onError?.('无效的响应')
      return
    }

    if (result.success && result.content) {
      const content = result.content
      console.log('[agentService] ✅ 翻译成功，开始流式推送...')
      console.log('[agentService] 内容长度:', content.length)
      
      let i = 0
      let chunkCount = 0
      while (i < content.length) {
        const twoChars = content.slice(i, i + 2)
        chunkCount++
        if (chunkCount <= 3) {
          console.log(`[agentService] 推送第 ${chunkCount} 个 chunk:`, twoChars)
        } else if (chunkCount === 4) {
          console.log('[agentService] ... 后续省略 (太多了)')
        }
        onChunk?.(twoChars)
        i += 2
        await new Promise(r => setTimeout(r, 10))
      }
      console.log(`[agentService] ✅ 推送完成，共 ${chunkCount} 个 chunks`)
      onComplete?.({ success: true })
    } else {
      console.error('[agentService] ❌ 翻译失败:', result?.error || '未知错误')
      onError?.(result?.error || '翻译失败')
    }
  } catch (err) {
    console.error('[agentService] ❌ 异常:', err)
    onError?.(err.message)
  }
}

/**
 * 读取翻译文件
 * @param {string} projectPath - 项目根路径
 * @param {string} filePath - 当前文件路径（绝对路径）
 * @returns {Promise<string|null>} 翻译内容
 */
export async function loadTranslation(projectPath, filePath) {
  try {
    console.log('[agentService] loadTranslation - projectPath:', projectPath)
    console.log('[agentService] loadTranslation - filePath:', filePath)

    const result = await window.electronAPI.loadTranslation({
      projectPath,
      filePath,
    })

    console.log('[agentService] loadTranslation - result.success:', result?.success)
    console.log('[agentService] loadTranslation - result.content length:', result?.content?.length || 0)

    return result.success ? result.content : null
  } catch (err) {
    console.error('[agentService] ❌ 读取翻译失败:', err)
    return null
  }
}

/**
 * 保存翻译文件
 * @param {string} projectPath - 项目根路径
 * @param {string} filePath - 当前文件路径（绝对路径）
 * @param {string} content - 翻译内容
 * @returns {Promise<boolean>}
 */
export async function saveTranslation(projectPath, filePath, content) {
  try {
    console.log('[agentService] saveTranslation - projectPath:', projectPath)
    console.log('[agentService] saveTranslation - filePath:', filePath)
    console.log('[agentService] saveTranslation - content length:', content?.length || 0)

    const result = await window.electronAPI.saveTranslation({
      projectPath,
      filePath,
      content,
    })

    console.log('[agentService] saveTranslation - result:', result)
    console.log('[agentService] saveTranslation - result.success:', result?.success)

    if (!result.success) {
      console.error('[agentService] ❌ 保存失败:', result?.error)
    }

    return result.success
  } catch (err) {
    console.error('[agentService] ❌ 保存翻译异常:', err)
    return false
  }
}