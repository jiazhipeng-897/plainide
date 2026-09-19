// src/stores/agent.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { agentTranslate, loadTranslation, saveTranslation } from '@/services/agentService'
import { ElMessage, ElMessageBox } from 'element-plus'

export const useAgentStore = defineStore('agent', () => {
  // ===== State =====
  const isTranslating = ref(false)
  const translationContent = ref('')
  const currentFilePath = ref('')
  const currentProjectPath = ref('')
  const error = ref(null)
  const provider = ref('deepseek')

  // ===== Getters =====
  const hasTranslation = computed(() => translationContent.value.length > 0)

  // ===== Actions =====

  /**
   * 加载翻译（切换文件时调用）
   */
  const loadTranslationForFile = async (projectPath, filePath) => {
    if (!projectPath || !filePath) {
      translationContent.value = ''
      currentFilePath.value = ''
      currentProjectPath.value = ''
      return
    }

    currentFilePath.value = filePath
    currentProjectPath.value = projectPath

    const content = await loadTranslation(projectPath, filePath)
    if (content) {
      translationContent.value = content
    } else {
      translationContent.value = ''
    }
  }

  /**
   * 开始翻译（有缓存时弹窗确认是否重新翻译）
   */
  const startTranslate = async ({ code, filePath, projectPath, language }) => {
    if (!code) {
      ElMessage.warning('没有可翻译的代码')
      return
    }

    // 1. 检查有没有缓存
    const cached = await loadTranslation(projectPath, filePath)
    if (cached) {
      // 有缓存，弹窗确认是否重新翻译
      try {
        await ElMessageBox.confirm(
          '该文件已有翻译，是否重新翻译？（将消耗 token）',
          '确认重新翻译',
          {
            confirmButtonText: '是，重新翻译',
            cancelButtonText: '取消',
            type: 'info',
          }
        )
        // 用户点了"是"，继续往下走（重新翻译）
      } catch {
        // 用户点了"取消"，无事发生
        return
      }
    }

    // 2. 执行翻译（不管有没有缓存，走到这里就是要翻译）
    // 同步已保存的服务商配置（覆盖硬编码默认值，修复"配置不生效"）
    try {
      const saved = await window.electronAPI?.getApiConfig?.()
      if (saved?.provider || saved?.current) provider.value = saved.provider || saved.current
    } catch (e) {}
    translationContent.value = ''
    currentFilePath.value = filePath
    currentProjectPath.value = projectPath
    error.value = null
    isTranslating.value = true

    try {
      await agentTranslate({
        code,
        filePath,
        projectPath,
        language,
        provider: provider.value,
        onChunk: (chunk) => {
          translationContent.value += chunk
        },
        onComplete: async () => {
          console.log('====== 翻译完成，开始保存 ======')
          isTranslating.value = false
          const saved = await saveTranslation(projectPath, filePath, translationContent.value)
          console.log('保存结果:', saved)
          if (saved) {
            ElMessage.success('翻译完成并已保存')
          } else {
            ElMessage.warning('翻译完成但保存失败')
          }
        },
        onError: (err) => {
          error.value = err
          isTranslating.value = false
          ElMessage.error('翻译失败: ' + err)
        }
      })
    } catch (err) {
      error.value = err.message
      isTranslating.value = false
      ElMessage.error('翻译失败: ' + err.message)
    }
  }

  /**
   * 强制重新翻译（忽略缓存）
   */
  const forceRetranslate = async ({ code, filePath, projectPath, language }) => {
    if (!code) {
      ElMessage.warning('没有可翻译的代码')
      return
    }

    // 同步已保存的服务商配置（覆盖硬编码默认值，修复"配置不生效"）
    try {
      const saved = await window.electronAPI?.getApiConfig?.()
      if (saved?.provider || saved?.current) provider.value = saved.provider || saved.current
    } catch (e) {}
    translationContent.value = ''
    error.value = null
    isTranslating.value = true

    try {
      await agentTranslate({
        code,
        filePath,
        projectPath,
        language,
        provider: provider.value,
        onChunk: (chunk) => {
          translationContent.value += chunk
        },
        onComplete: async () => {
          console.log('====== 重新翻译完成，开始保存 ======')
          isTranslating.value = false
          const saved = await saveTranslation(projectPath, filePath, translationContent.value)
          console.log('保存结果:', saved)
          if (saved) {
            ElMessage.success('重新翻译完成')
          } else {
            ElMessage.warning('重新翻译完成但保存失败')
          }
        },
        onError: (err) => {
          error.value = err
          isTranslating.value = false
          ElMessage.error('翻译失败: ' + err)
        }
      })
    } catch (err) {
      error.value = err.message
      isTranslating.value = false
      ElMessage.error('翻译失败: ' + err.message)
    }
  }

  /**
   * 保存翻译（用户手动保存）
   */
  const saveCurrentTranslation = async () => {
    if (!currentProjectPath.value || !currentFilePath.value) {
      ElMessage.warning('没有可保存的文件')
      return false
    }
    if (!translationContent.value) {
      ElMessage.warning('没有可保存的内容')
      return false
    }

    const success = await saveTranslation(
      currentProjectPath.value,
      currentFilePath.value,
      translationContent.value
    )

    if (success) {
      ElMessage.success('保存成功')
    } else {
      ElMessage.error('保存失败')
    }
    return success
  }

  /**
   * 设置翻译内容（允许清空）
   */
  const setTranslation = (content) => {
    translationContent.value = content || ''  // 允许清空
  }

  const clearTranslation = () => {
    translationContent.value = ''
    error.value = null
  }

  const setProvider = (val) => {
    provider.value = val
  }

  /**
   * 从已保存的配置同步当前厂商（新结构 current / 旧结构 provider）
   */
  const syncProviderFromConfig = async () => {
    try {
      const saved = await window.electronAPI?.getApiConfig?.()
      if (saved?.current || saved?.provider) {
        provider.value = saved.current || saved.provider
      }
    } catch (e) {}
  }

  return {
    isTranslating,
    translationContent,
    currentFilePath,
    currentProjectPath,
    error,
    provider,
    hasTranslation,
    loadTranslationForFile,
    startTranslate,
    forceRetranslate,
    saveCurrentTranslation,
    setTranslation,
    clearTranslation,
    setProvider,
    syncProviderFromConfig,
  }
})