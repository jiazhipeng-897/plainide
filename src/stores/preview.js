import { defineStore } from 'pinia'

export const usePreviewStore = defineStore('preview', {
  state: () => ({
    path: null,
    content: '',
  }),

  getters: {
    isPreviewing: (state) => !!state.path && !!state.content,
  },

  actions: {
    setPreview(path, content) {
      this.path = path
      this.content = content || ''
    },
    clear() {
      this.path = null
      this.content = ''
    },
    updateContent(content) {
      this.content = content
    },
  },
})