import { defineStore } from 'pinia'

export const useTranslationStore = defineStore('translation', {
  state: () => ({
    cache: {},
    projectPath: '',
    isTranslating: false,
    fileList: [],
  }),

  getters: {
    getTranslation: (state) => (fileName) => {
      const baseName = fileName.replace(/\.[^.]+$/, '')
      return state.cache[baseName] || ''
    },
  },

  actions: {
    async setProjectPath(path) {
      this.projectPath = path
      await this.loadCache()
      await this.loadFileList()
    },

    async loadCache() {
      console.log('loadCache 被调用, projectPath:', this.projectPath)
      if (!this.projectPath) {
        console.warn('loadCache: projectPath 为空，直接返回')
        return
      }
      try {
        const path = `${this.projectPath}/translations.json`
        console.log('loadCache: 读取路径', path)
        const result = await window.electronAPI?.readFile?.(path)
        console.log('loadCache: 读取结果', result)
        if (result) {
          this.cache = JSON.parse(result)
          console.log('✅ 加载翻译缓存成功，共', Object.keys(this.cache).length, '条')
        } else {
          this.cache = {}
          console.log('📭 没有翻译缓存')
        }
      } catch (e) {
        console.error('loadCache 失败:', e)
        this.cache = {}
      }
    },

    saveCache() {
      if (!this.projectPath) return
      try {
        const path = `${this.projectPath}/translations.json`
        window.electronAPI?.writeFile?.(path, JSON.stringify(this.cache, null, 2))
      } catch (e) {
        console.error('保存翻译缓存失败:', e)
      }
    },

    // ===== 加载项目翻译文档（给 AgentPanel.vue 用） =====
    async loadProjectDoc() {
      if (!this.projectPath) {
        console.warn('loadProjectDoc: projectPath 为空')
        return ''
      }
      try {
        const path = `${this.projectPath}/translation.md`
        const result = await window.electronAPI?.readFile?.(path)
        return result || ''
      } catch (e) {
        console.error('loadProjectDoc 失败:', e)
        return ''
      }
    },

    // ===== 保存项目翻译文档（给 AgentPanel.vue 用） =====
    async saveProjectDoc(content) {
      if (!this.projectPath) {
        console.warn('saveProjectDoc: projectPath 为空')
        return
      }
      try {
        const path = `${this.projectPath}/translation.md`
        await window.electronAPI?.writeFile?.(path, content)
        console.log('✅ 项目翻译文档已保存')
      } catch (e) {
        console.error('saveProjectDoc 失败:', e)
      }
    },

    async loadFileList() {
      if (!this.projectPath) return
      try {
        const path = `${this.projectPath}/file_list.json`
        const result = await window.electronAPI?.readFile?.(path)
        if (result) {
          this.fileList = JSON.parse(result)
          console.log('加载 file_list.json 成功，共', this.fileList.length, '个')
        } else {
          this.fileList = []
        }
      } catch (e) {
        console.error('加载 file_list.json 失败:', e)
        this.fileList = []
      }
    },

    saveFileList() {
      if (!this.projectPath) return
      try {
        const path = `${this.projectPath}/file_list.json`
        window.electronAPI?.writeFile?.(path, JSON.stringify(this.fileList, null, 2))
      } catch (e) {
        console.error('保存文件清单失败:', e)
      }
    },

    extractFileNames(fileTree) {
      const names = []
      const traverse = (node) => {
        const baseName = node.name.replace(/\.[^.]+$/, '')
        if (baseName) {
          names.push(baseName)
        }
        if (node.children) {
          node.children.forEach(traverse)
        }
      }
      if (Array.isArray(fileTree)) {
        fileTree.forEach(traverse)
      } else if (fileTree) {
        traverse(fileTree)
      }
      return names
    },

    syncFromFileTree(fileTree) {
      if (!this.projectPath || !fileTree) return

      const currentNames = this.extractFileNames(fileTree)
      const currentSet = new Set(currentNames)

      let cleaned = 0
      for (const key of Object.keys(this.cache)) {
        if (!currentSet.has(key)) {
          delete this.cache[key]
          cleaned++
        }
      }
      if (cleaned > 0) {
        this.saveCache()
        console.log('清理了', cleaned, '个废弃翻译')
      }

      const existingSet = new Set(this.fileList)
      const added = currentNames.filter(name => !existingSet.has(name))

      if (added.length > 0) {
        this.fileList.push(...added)
        this.saveFileList()
        console.log('新增', added.length, '个名称到 file_list.json')
      }

      const fileListSet = new Set(currentNames)
      const removedFromList = this.fileList.filter(name => !fileListSet.has(name))
      if (removedFromList.length > 0) {
        this.fileList = this.fileList.filter(name => fileListSet.has(name))
        this.saveFileList()
        console.log('从 file_list.json 移除了', removedFromList.length, '个已删除名称')
      }
    },

    async translateName(fileName) {
      try {
        const result = await callGoogleTranslate(fileName)
        if (result) {
          this.cache[fileName] = result
          return result
        }
      } catch (e) {
        console.error('翻译失败:', fileName, e)
      }
      return fileName
    },

    async translateAll() {
      if (!this.fileList || this.fileList.length === 0) {
        console.warn('没有文件清单')
        return
      }

      this.isTranslating = true

      const toTranslate = this.fileList.filter(name => !(name in this.cache))

      if (toTranslate.length === 0) {
        console.log('所有名称已翻译')
        this.isTranslating = false
        return
      }

      console.log('开始翻译', toTranslate.length, '个名称...')

      let translated = 0
      const failedList = []

      for (const name of toTranslate) {
        try {
          const result = await this.translateName(name)
          if (result) {
            translated++
            if (translated % 5 === 0) {
              this.saveCache()
              console.log('已翻译', translated, '/', toTranslate.length)
            }
          } else {
            failedList.push(name)
          }
        } catch (e) {
          console.error('翻译异常:', name, e)
          failedList.push(name)
        }
        await new Promise(r => setTimeout(r, 150))
      }

      this.saveCache()
      this.isTranslating = false
      console.log('翻译完成！成功:', translated, '失败:', failedList.length)
      if (failedList.length > 0) {
        console.warn('失败列表:', failedList)
      }
    },

    setTranslation(fileName, translation) {
      const baseName = fileName.replace(/\.[^.]+$/, '')
      this.cache[baseName] = translation.trim() || ''
      this.saveCache()
    },

    clearAll() {
      this.cache = {}
      this.saveCache()
      console.log('已清除所有翻译')
    },
  },
})

async function callGoogleTranslate(text) {
  if (!text || text.trim() === '') return text
  try {
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`
    const response = await fetch(url)
    if (!response.ok) throw new Error('翻译请求失败')
    const data = await response.json()
    if (data && data[0] && data[0][0] && data[0][0][0]) {
      return data[0][0][0]
    }
    return text
  } catch (e) {
    console.error('谷歌翻译失败:', e)
    try {
      const url2 =
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`
      const res2 = await fetch(url2)
      const data2 = await res2.json()
      if (data2.responseData && data2.responseData.translatedText) {
        return data2.responseData.translatedText
      }
    } catch (e2) {
      console.error('备用翻译也失败:', e2)
    }
    return text
  }
}