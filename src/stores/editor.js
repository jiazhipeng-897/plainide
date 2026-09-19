import { defineStore } from 'pinia'
import { detectLanguage } from '@/constants/langMap'
import { EVENT_EDITOR_JUMP } from '@/constants/eventNames'
import { useProjectStore } from '@/stores/project'
import { useGitStore } from '@/stores/git'

export const useEditorStore = defineStore('editor', {
  state: () => ({
    activeFile: null,
    openFiles: [],
    fileContents: {},
    fileLanguages: {},
    theme: 'vs-dark',
    fontSize: 14,
    tabSize: 2,
    wordWrap: true,
    minimap: true,
    readOnly: false,
    isModified: {},
    cursorPosition: { lineNumber: 1, column: 1 },
    selectedText: '',
    outline: [],
    astTree: null,
    saving: false,
    lastSavedContent: {},
    streamingFiles: {}, // 正在被 Agent 流式写入的文件（path → true）
    monacoInstance: null, // Monaco 编辑器实例（构思核心流式播放用，由 CodeEditor 注册）
  }),
  getters: {
    currentContent: (state) => {
      if (!state.activeFile) return ''
      return state.fileContents[state.activeFile] || ''
    },
    currentLanguage: (state) => {
      if (!state.activeFile) return 'plaintext'
      return state.fileLanguages[state.activeFile] || detectLanguage(state.activeFile)
    },
    isCurrentModified: (state) => {
      if (!state.activeFile) return false
      return state.isModified[state.activeFile] || false
    },
    getFileModified: (state) => (filePath) => {
      return state.isModified[filePath] || false
    },
    validOutline: (state) => {
      return Array.isArray(state.outline) ? state.outline : []
    },
    // 获取当前预览标签
    previewTab: (state) => state.openFiles.find(f => f.pinned === false),
  },
  actions: {
    setMonacoInstance(instance) {
      this.monacoInstance = instance
    },
    /**
     * 对齐VSCode打开逻辑
     * mode: click(单击预览) / dblclick(双击固定打开，插入标签最前面)
     */
    openFile(filePath, content, mode = 'click') {
      const existTab = this.openFiles.find(f => f.path === filePath)
      // 文件已打开：直接切到该文件
      if (existTab) {
        this.activeFile = filePath
        this.fileContents[filePath] = content
        this.fileLanguages[filePath] = detectLanguage(filePath)
        this.outline = []
        this.astTree = null
        return
      }

      const previewTab = this.previewTab

      // 1. 单击：预览模式，复用唯一预览标签
      if (mode === 'click') {
        if (previewTab) {
          // 删除旧预览缓存，覆盖标签
          const oldPath = previewTab.path
          delete this.fileContents[oldPath]
          delete this.fileLanguages[oldPath]
          delete this.isModified[oldPath]
          delete this.lastSavedContent[oldPath]
          const idx = this.openFiles.findIndex(f => f.path === oldPath)
          this.openFiles[idx] = { path: filePath, pinned: false }
        } else {
          // 无预览标签，新增预览放末尾
          this.openFiles.push({ path: filePath, pinned: false })
        }

        this.fileContents[filePath] = content
        this.fileLanguages[filePath] = detectLanguage(filePath)
        this.activeFile = filePath
        this.isModified[filePath] = false
        this.lastSavedContent[filePath] = content
        this.outline = []
        this.astTree = null
        return
      }

      // 2. 双击：新建固定标签，插入数组最前面（首位展示）
      if (mode === 'dblclick') {
        this.openFiles.unshift({ path: filePath, pinned: true })
        this.fileContents[filePath] = content
        this.fileLanguages[filePath] = detectLanguage(filePath)
        this.activeFile = filePath
        this.isModified[filePath] = false
        this.lastSavedContent[filePath] = content
        this.outline = []
        this.astTree = null
      }
    },

    /**
     * VSCode规则：预览文件编辑后自动转正，不再被覆盖
     */
    pinPreviewTabIfEdit(filePath) {
      const tab = this.openFiles.find(f => f.path === filePath)
      if (tab && tab.pinned === false) {
        tab.pinned = true
      }
    },

    closeFileInternal(filePath) {
      const index = this.openFiles.findIndex(f => f.path === filePath)
      if (index > -1) {
        this.openFiles.splice(index, 1)
        // 只移除标签，保留缓存（对齐VSCode，重开不丢内容）
      }
    },

    closeFile(filePath) {
      if (this.isModified[filePath]) {
        if (!confirm(`文件 "${filePath}" 有未保存的修改，确定关闭吗？`)) {
          return false
        }
      }
      this.closeFileInternal(filePath)
      const stillActive = this.openFiles.find(f => f.path === this.activeFile)
      if (!stillActive && this.openFiles.length > 0) {
        this.activeFile = this.openFiles[0].path
      } else if (this.openFiles.length === 0) {
        this.activeFile = null
        this.outline = []
        this.astTree = null
      }
      return true
    },

    getFileMode(filePath) {
      const entry = this.openFiles.find(f => f.path === filePath)
      return entry ? entry.mode : null
    },

    updateContent(filePath, content) {
      this.fileContents[filePath] = content
      const lastSaved = this.lastSavedContent[filePath] || ''
      this.isModified[filePath] = content !== lastSaved
      // 修改预览文件自动转正
      if (this.isModified[filePath]) {
        this.pinPreviewTabIfEdit(filePath)
      }
    },

    // ---- Agent 流式写入（黄点联动 + 编辑器实时增量渲染） ----
    markStreaming(filePath) {
      if (!filePath) return
      this.streamingFiles = { ...this.streamingFiles, [filePath]: true }
    },

    unmarkStreaming(filePath) {
      if (!filePath) return
      const next = { ...this.streamingFiles }
      delete next[filePath]
      this.streamingFiles = next
    },

    isStreaming(filePath) {
      return !!filePath && !!this.streamingFiles[filePath]
    },

    // 收到 file_writing 事件：文件已打开则把新 chunk 追加到内存内容（CodeEditor watch 增量渲染）
    appendStreamChunk(filePath, chunk) {
      if (!filePath || !this.streamingFiles[filePath]) return
      if (!this.fileContents[filePath]) return
      this.fileContents[filePath] = (this.fileContents[filePath] || '') + chunk
      // 流式写入不算用户未保存修改（避免黄点/保存提示干扰观看）
      this.lastSavedContent[filePath] = this.fileContents[filePath]
      this.isModified[filePath] = false
    },

    async saveFile(filePath) {
      if (!filePath) return false
      if (!this.fileContents[filePath]) return false
      this.saving = true
      try {
        const content = this.fileContents[filePath]
        const success = await window.electronAPI.writeFile(filePath, content)
        if (success) {
          this.isModified[filePath] = false
          this.lastSavedContent[filePath] = content
          // 保存后自动刷新 Git 状态（文件树角标 / 变更列表实时更新，无需手动点刷新）
          try {
            const pp = useProjectStore().projectPath
            if (pp) useGitStore().refresh(pp)
          } catch (e) {
            /* 忽略：Git 刷新失败不影响保存结果 */
          }
          return true
        }
        return false
      } catch (error) {
        console.error('保存文件失败:', error)
        return false
      } finally {
        this.saving = false
      }
    },

    async saveCurrentFile() {
      return this.saveFile(this.activeFile)
    },

    setActiveFile(filePath) {
      const exists = this.openFiles.some(f => f.path === filePath)
      if (exists) {
        this.activeFile = filePath
      }
    },

    setOutline(data) {
      if (Array.isArray(data)) {
        this.outline = data.filter(item => {
          return item && typeof item === 'object' && typeof item.name === 'string' && typeof item.lineno === 'number' && (item.type === 'function' || item.type === 'class')
        })
      } else {
        this.outline = []
      }
    },

    setASTTree(data) {
      this.astTree = data
    },

    jumpToLine(startLine, endLine = null) {
      if (typeof startLine !== 'number' || startLine <= 0) return
      window.dispatchEvent(new CustomEvent(EVENT_EDITOR_JUMP, {
        detail: { startLine, endLine: endLine || startLine }
      }))
    },

    resetAll() {
      this.activeFile = null
      this.openFiles = []
      this.fileContents = {}
      this.fileLanguages = {}
      this.isModified = {}
      this.lastSavedContent = {}
      this.outline = []
      this.astTree = null
      this.saving = false
      this.cursorPosition = { lineNumber: 1, column: 1 }
      this.selectedText = ''
    },
  },
})