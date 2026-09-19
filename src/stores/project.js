import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useTranslationStore } from './translation'
import { useGitStore } from './git'
import { buildFileTree } from '@/utils/fileTreeBuilder'
import { 
  scanDirectory as scanDirectoryAPI,
  createFile as createFileAPI,
  createFolder as createFolderAPI
} from '@/services/projectService'

export const useProjectStore = defineStore('project', () => {
  const projectPath = ref('')
  const fileTree = ref([])
  const currentFile = ref('')
  const pythonPort = ref(null)
  const selectedPath = ref(null) // 当前选中的文件夹路径
  // 正在被 Agent 写入的文件（路径 → 真值），文件树据此显示黄点闪烁
  const writingFiles = ref({})

  const markWriting = (path) => {
    if (!path) return
    writingFiles.value = { ...writingFiles.value, [path]: true }
  }

  const unmarkWriting = (path) => {
    if (!path) return
    const next = { ...writingFiles.value }
    delete next[path]
    writingFiles.value = next
  }

  const setProjectPath = (path) => {
    projectPath.value = path
    // 同步登记到主进程文件操作白名单（路径守卫，安全加固）
    window.electronAPI?.setProjectPath?.(path)
  }

  const setSelectedPath = (path) => {
    selectedPath.value = path
  }

  const scanDirectory = async () => {
    if (!projectPath.value) return
    
    console.log('🔍 开始扫描目录:', projectPath.value)
    let result
    try {
      result = await scanDirectoryAPI(projectPath.value)
    } catch (e) {
      console.error('❌ 扫描请求异常:', e)
      result = { success: false, error: e.message }
    }
    
    console.log('📊 扫描结果:', result)
    
    if (result.success) {
      const tree = buildFileTree(result.files || [], projectPath.value)
      fileTree.value = tree

      const translationStore = useTranslationStore()
      translationStore.syncFromFileTree(tree)

      // 文件树变化后同步刷新 Git 状态（新写文件/删除后角标实时更新；非 Git 仓库时探测一次即停）
      useGitStore().refresh(projectPath.value)

      console.log('📂 文件树已构建，根节点数:', tree.length)
    } else {
      console.error('❌ 扫描失败:', result.error)
      fileTree.value = []
    }
  }

  const openFile = (path) => {
    currentFile.value = path
  }

  const setPythonPort = (port) => {
    pythonPort.value = port
  }

  /**
   * 获取文件的父目录路径
   */
  const getParentPath = (filePath) => {
    if (!filePath) return null
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
    if (lastSlash > 0) {
      return filePath.substring(0, lastSlash)
    }
    return null
  }

  /**
   * 在当前选中目录（或根目录）创建文件
   */
  const createFile = async (fileName) => {
    if (!projectPath.value) {
      console.warn('未打开项目')
      return null
    }
    
    let targetDir = selectedPath.value || projectPath.value
    
    // 🔑 保护：如果 targetDir 是文件路径，自动转为父目录
    const extMatch = targetDir.match(/\.[^.]+$/)
    if (extMatch && !targetDir.endsWith('/') && !targetDir.endsWith('\\')) {
      const parent = getParentPath(targetDir)
      if (parent) {
        targetDir = parent
        console.warn('⚠️ selectedPath 是文件路径，自动转为目录:', targetDir)
      }
    }
    
    console.log('📝 在目录创建文件:', targetDir, '文件名:', fileName)
    
    const result = await createFileAPI(targetDir, fileName)
    if (result.success) {
      await scanDirectory()
      // 返回新文件的完整路径
      const normalizedDir = targetDir.replace(/\\/g, '/')
      const normalizedName = fileName.replace(/\\/g, '/')
      const fullPath = normalizedDir.endsWith('/') 
        ? normalizedDir + normalizedName 
        : normalizedDir + '/' + normalizedName
      return result.path || fullPath
    }
    return null
  }

  /**
   * 在当前选中目录（或根目录）创建文件夹
   */
  const createFolder = async (folderName) => {
    if (!projectPath.value) {
      console.warn('未打开项目')
      return false
    }
    
    let targetDir = selectedPath.value || projectPath.value
    
    // 保护：如果是文件路径，转为父目录
    const extMatch = targetDir.match(/\.[^.]+$/)
    if (extMatch && !targetDir.endsWith('/') && !targetDir.endsWith('\\')) {
      const parent = getParentPath(targetDir)
      if (parent) {
        targetDir = parent
      }
    }
    
    console.log('📁 在目录创建文件夹:', targetDir, folderName)
    
    const result = await createFolderAPI(targetDir, folderName)
    if (result.success) {
      await scanDirectory()
      return true
    }
    return false
  }

  // ========== 打开项目（恢复项目记忆时调用） ==========
  const openProject = async (path) => {
    if (!path) return
    setProjectPath(path)
    await scanDirectory()
  }

  // ========== 关闭项目 ==========
  const closeProject = () => {
    projectPath.value = ''
    fileTree.value = []
    currentFile.value = ''
    selectedPath.value = null
    // 同时清空编辑器打开的文件
    const editorStore = useEditorStore?.()
    if (editorStore) {
      editorStore.openedFiles = []
      editorStore.activeFile = null
    }
    console.log('📁 项目已关闭')
  }

  // ========== 切换项目 ==========
  const switchProject = async (newPath) => {
    if (!newPath) return
    closeProject()
    setProjectPath(newPath)
    await scanDirectory()
    const translationStore = useTranslationStore()
    translationStore.setProjectPath(newPath)
    console.log('🔄 已切换到项目:', newPath)
  }

  return {
    projectPath,
    openProject,
    fileTree,
    currentFile,
    pythonPort,
    selectedPath,
    setProjectPath,
    scanDirectory,
    openFile,
    setPythonPort,
    setSelectedPath,
    writingFiles,
    markWriting,
    unmarkWriting,
    createFile,
    createFolder,
    closeProject,
    switchProject,
  }
})
