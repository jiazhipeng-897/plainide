// src/stores/outlineStore.js

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { parseCodeOutline } from '@/utils/codeOutlineParser'

export const useOutlineStore = defineStore('outline', () => {
  // ===== 状态 =====
  const outlineData = ref([])
  const currentFilePath = ref('')
  const selectedItem = ref(null)
  const isLoading = ref(false)

  // ===== 计算属性 =====
  const hasData = computed(() => outlineData.value.length > 0)
  const functionCount = computed(() =>
    outlineData.value.filter(item => item.type === 'function' || item.type === 'method').length
  )
  const classCount = computed(() =>
    outlineData.value.filter(item => item.type === 'class').length
  )

  // ===== 方法 =====
  function parseOutlineFromCode(code, filePath) {
    if (!code || !filePath) {
      outlineData.value = []
      currentFilePath.value = filePath || ''
      selectedItem.value = null
      return
    }
    
    const items = parseCodeOutline(code, filePath)
    outlineData.value = items
    currentFilePath.value = filePath
    selectedItem.value = null
  }

  function setOutlineData(data, filePath) {
    outlineData.value = data || []
    currentFilePath.value = filePath || ''
    selectedItem.value = null
  }

  function getOutlineData() {
    return outlineData.value
  }

  function setSelectedItem(item) {
    selectedItem.value = item
  }

  function findItemByLine(line) {
    return outlineData.value.find(item =>
      line >= item.startLine && line <= (item.endLine || item.startLine)
    ) || null
  }

  function findItemByName(name) {
    return outlineData.value.find(item => item.name === name) || null
  }

  function clear() {
    outlineData.value = []
    currentFilePath.value = ''
    selectedItem.value = null
  }

  return {
    outlineData,
    currentFilePath,
    selectedItem,
    isLoading,
    hasData,
    functionCount,
    classCount,
    parseOutlineFromCode,
    setOutlineData,
    getOutlineData,
    setSelectedItem,
    findItemByLine,
    findItemByName,
    clear
  }
})