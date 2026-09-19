<template>
  <div class="function-panel">
    <div class="panel-header">
      <div class="header-left">
        <span class="icon">📋</span>
        <span class="title">函数导航</span>
        <span class="file-path" v-if="store.currentFilePath">{{ store.currentFilePath }}</span>
        <span class="file-stats" v-if="store.hasData">
          ({{ store.functionCount }} 函数 · {{ store.classCount }} 类)
        </span>
      </div>
      <div class="header-right">
        <div class="custom-select" @click="toggleMenu">
          <span class="select-text">{{ selectedLabel }}</span>
          <span class="select-arrow" :class="{ 'is-open': isMenuOpen }">▼</span>
        </div>
        <div v-if="isMenuOpen" class="custom-dropdown">
          <div
            v-for="option in options"
            :key="option.value"
            class="custom-option"
            :class="{ 'is-active': selectedScope === option.value }"
            @click="selectOption(option)"
          >
            {{ option.label }}
          </div>
        </div>
      </div>
    </div>

    <div class="panel-body">
      <!-- 列表 -->
      <div class="code-area-box">
        <div v-if="filteredItems.length > 0" class="outline-list">
          <div
            v-for="(item, index) in filteredItems"
            :key="index"
            class="outline-item"
            :class="{ 'is-active': store.selectedItem?.name === item.name && store.selectedItem?.startLine === item.startLine }"
            @click="handleItemClick(item)"
            @dblclick="handleItemDoubleClick(item)"
          >
            <span class="item-icon" :class="item.type">
              {{ item.type === 'class' ? '📦' : 'ƒ' }}
            </span>
            <span class="item-name">{{ item.name }}</span>
            <span class="item-line">[行{{ item.startLine }}]</span>
            <span v-if="store.selectedItem?.name === item.name && store.selectedItem?.startLine === item.startLine" class="item-selected-badge">✓</span>
          </div>
        </div>
        <div v-else class="empty-tip">
          {{ store.hasData ? '无匹配结果' : '暂无函数或类' }}
        </div>
      </div>

      <!-- 搜索 -->
      <div class="input-group">
        <div class="input-label">
          <span class="dot-icon blue">●</span> 查找内容 <span class="hint">(留空=全部)</span>
        </div>
        <div class="search-row">
          <el-input
            v-model="searchText"
            placeholder="输入函数/类名搜索..."
            class="dark-input"
            clearable
            @input="handleSearch"
            @keyup.enter="handleSearch"
          />
          <el-button class="search-btn" @click="handleSearch">搜索</el-button>
        </div>
      </div>

      <!-- 替换 -->
      <div class="input-group replace-group">
        <div class="input-label">
          <span class="pencil-icon">✏️</span> 替换为...
        </div>
        <el-input
          v-model="replaceText"
          type="textarea"
          :rows="4"
          class="dark-input big-textarea"
          resize="none"
          placeholder="输入要替换成的新代码..."
        />
      </div>

      <!-- 操作按钮 -->
      <div class="action-buttons-row">
        <el-button class="big-action-btn global-replace" @click="handleGlobalReplace">
          <span class="pencil-icon">✏️</span> 整体替换
        </el-button>
        <el-button class="big-action-btn global-delete" @click="handleGlobalDelete">
          <span class="delete-icon">✖</span> 整体删除
        </el-button>
      </div>
    </div>

    <DiffConfirmModal ref="diffModalRef" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import DiffConfirmModal from './DiffConfirmModal.vue'
import { useOutlineStore } from '@/stores/outlineStore'

const store = useOutlineStore()

const searchText = ref('')
const replaceText = ref('')
const isMenuOpen = ref(false)
const selectedScope = ref('all')
const diffModalRef = ref(null)

const options = [
  { label: '全部', value: 'all' },
  { label: '仅函数', value: 'function' },
  { label: '仅类', value: 'class' }
]
const selectedLabel = computed(() => {
  return options.find(o => o.value === selectedScope.value)?.label || '全部'
})

const filteredItems = computed(() => {
  let result = store.outlineData
  if (selectedScope.value === 'function') {
    result = result.filter(item => item.type === 'function' || item.type === 'method')
  } else if (selectedScope.value === 'class') {
    result = result.filter(item => item.type === 'class')
  }
  const keyword = searchText.value.trim().toLowerCase()
  if (keyword) {
    result = result.filter(item => item.name.toLowerCase().includes(keyword))
  }
  return result
})

const handleSearch = () => {
  const keyword = searchText.value.trim().toLowerCase()
  if (keyword && store.selectedItem) {
    const stillVisible = store.outlineData.some(item =>
      item.name.toLowerCase().includes(keyword) &&
      item.name === store.selectedItem.name &&
      item.startLine === store.selectedItem.startLine
    )
    if (!stillVisible) {
      store.setSelectedItem(null)
    }
  }
}

const toggleMenu = () => { isMenuOpen.value = !isMenuOpen.value }
const selectOption = (option) => {
  selectedScope.value = option.value
  isMenuOpen.value = false
}

const handleItemClick = (item) => {
  store.setSelectedItem(item)
  window.dispatchEvent(new CustomEvent('outline-item-click', {
    detail: {
      name: item.name,
      type: item.type,
      startLine: item.startLine,
      endLine: item.endLine || item.startLine
    }
  }))
}

const handleItemDoubleClick = (item) => {
  store.setSelectedItem(item)
  window.dispatchEvent(new CustomEvent('outline-item-click', {
    detail: {
      name: item.name,
      type: item.type,
      startLine: item.startLine,
      endLine: item.endLine || item.startLine
    }
  }))
  setTimeout(() => {
    openReplaceDialog(item)
  }, 100)
}

const openReplaceDialog = (item) => {
  window.dispatchEvent(new CustomEvent('outline-request-original-code', {
    detail: {
      target: item,
      callbackId: 'replace-' + Date.now()
    }
  }))
}

const handleGlobalReplace = () => {
  if (!store.selectedItem) {
    alert('请先选中一个类或函数（单击列表项）')
    return
  }
  openReplaceDialog(store.selectedItem)
}

const handleGlobalDelete = () => {
  if (!store.selectedItem) {
    alert('请先选中一个类或函数（单击列表项）')
    return
  }
  const item = store.selectedItem
  if (confirm(`确定要删除 "${item.name}" 吗？`)) {
    window.dispatchEvent(new CustomEvent('outline-delete', {
      detail: { target: item }
    }))
    const index = store.outlineData.indexOf(item)
    if (index > -1) {
      const newData = [...store.outlineData]
      newData.splice(index, 1)
      store.setOutlineData(newData, store.currentFilePath)
    }
    store.setSelectedItem(null)
  }
}

const handleOriginalCodeResponse = (event) => {
  const { originalCode, target, newCode } = event.detail
  diffModalRef.value?.open({
    originalCode: originalCode || '',
    newCode: newCode || replaceText.value || '',
    filePath: store.currentFilePath,
    onConfirm: (finalCode) => {
      window.dispatchEvent(new CustomEvent('outline-replace', {
        detail: {
          target: target,
          newCode: finalCode
        }
      }))
    }
  })
}

onMounted(() => {
  window.addEventListener('outline-original-code-response', handleOriginalCodeResponse)
})

onBeforeUnmount(() => {
  window.removeEventListener('outline-original-code-response', handleOriginalCodeResponse)
})
</script>

<style scoped>
.function-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--surface-window);
  padding: var(--space-12) var(--space-12);
  box-sizing: border-box;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}

.panel-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 30px;
  padding: 0 4px;
  background: var(--surface-window);
  border-bottom: 1px solid var(--border-default);
  margin-bottom: 8px;
  position: relative;
}

.header-left {
  display: flex;
  align-items: center;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  flex: 1;
  min-width: 0;
}

.header-left .icon {
  margin-right: 8px;
  font-size: 14px;
}

.header-left .title {
  margin-right: 12px;
}

.header-left .file-path {
  font-size: 11px;
  color: var(--text-faint);
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.header-left .file-stats {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 400;
  margin-left: 8px;
  flex-shrink: 0;
}

.header-right {
  position: relative;
  flex-shrink: 0;
}

.custom-select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 90px;
  height: 28px;
  padding: 0 var(--space-8);
  background: var(--surface-window);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 13px;
  user-select: none;
}

.custom-select:hover {
  border-color: var(--border-mid);
}

.select-text {
  flex: 1;
  text-align: center;
}

.select-arrow {
  font-size: 10px;
  margin-left: 4px;
  transition: transform 0.2s;
  color: var(--text-faint);
}

.select-arrow.is-open {
  transform: rotate(180deg);
}

.custom-dropdown {
  position: absolute;
  top: 34px;
  right: 0;
  width: 100px;
  background: var(--surface-window);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  box-shadow: 0 4px 16px var(--shadow-strong);
  z-index: 100;
  overflow: hidden;
}

.custom-option {
  padding: 8px 12px;
  color: var(--text-primary);
  cursor: pointer;
  text-align: center;
  font-size: 13px;
}

.custom-option:hover {
  background: var(--surface-panel-2);
}

.custom-option.is-active {
  color: var(--info);
  font-weight: 500;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 6px;
}

.panel-body::-webkit-scrollbar {
  width: 6px;
}

.panel-body::-webkit-scrollbar-thumb {
  background: var(--surface-raised);
  border-radius: 4px;
}

.panel-body::-webkit-scrollbar-track {
  background: transparent;
}

.code-area-box {
  width: 100%;
  min-height: 120px;
  max-height: 200px;
  background: var(--surface-panel-1);
  border-radius: 6px;
  border: 1px solid var(--border-default);
  flex-shrink: 0;
  overflow-y: auto;
}

.code-area-box::-webkit-scrollbar {
  width: 4px;
}

.code-area-box::-webkit-scrollbar-thumb {
  background: var(--surface-raised);
  border-radius: 4px;
}

.outline-list {
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.outline-item {
  display: flex;
  align-items: center;
  padding: var(--space-4) var(--space-12);
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  font-family: 'Consolas', monospace;
  color: var(--text-primary);
  transition: background-color 0.15s;
  position: relative;
}

.outline-item:hover {
  background-color: var(--surface-panel-2);
}

.outline-item.is-active {
  background-color: var(--surface-detail);
  color: var(--info);
}

.outline-item.is-active .item-line {
  color: var(--info);
}

.item-icon {
  margin-right: 8px;
  font-size: 12px;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}

.item-icon.function {
  color: var(--code-sym-func);
}

.item-icon.class {
  color: var(--code-sym-var);
}

.item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-line {
  color: var(--text-faint);
  font-size: 11px;
  margin-left: 8px;
  flex-shrink: 0;
}

.item-selected-badge {
  color: var(--code-sym-var);
  font-size: 12px;
  margin-left: 6px;
  flex-shrink: 0;
}

.empty-tip {
  color: var(--text-muted);
  text-align: center;
  padding-top: 40px;
  font-size: 13px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.input-group.replace-group {
  flex-shrink: 0;
}

.input-label {
  font-size: 12px;
  color: var(--text-subtle);
  display: flex;
  align-items: center;
}

.input-label .hint {
  color: var(--text-muted);
  margin-left: 6px;
}

.search-row {
  display: flex;
  gap: 6px;
}

.search-btn {
  background: var(--surface-highlight);
  border: 1px solid var(--border-mid);
  color: var(--text-primary);
  height: 32px;
  border-radius: 6px;
  padding: 0 12px;
  flex-shrink: 0;
}

.search-btn:hover {
  background: var(--surface-panel-3);
}

.dot-icon.blue {
  color: var(--info);
  margin-right: 6px;
  font-size: 14px;
}

.pencil-icon {
  color: var(--code-sym-param);
  margin-right: 6px;
  font-size: 14px;
}

.delete-icon {
  color: var(--status-err);
  margin-right: 6px;
  font-size: 14px;
}

:deep(.dark-input .el-input__wrapper) {
  background-color: var(--surface-panel-1) !important;
  box-shadow: 0 0 0 1px var(--border-default) inset !important;
  border-radius: 6px;
  padding: var(--space-4) var(--space-12);
}

:deep(.dark-input .el-input__inner) {
  color: var(--text-primary) !important;
  height: 32px;
}

:deep(.dark-input .el-input__inner::placeholder) {
  color: var(--text-muted);
}

:deep(.dark-input .el-input__clear) {
  color: var(--text-muted);
}

:deep(.dark-input .el-input__clear:hover) {
  color: var(--text-primary);
}

:deep(.big-textarea .el-textarea__inner) {
  background-color: var(--surface-panel-1) !important;
  box-shadow: 0 0 0 1px var(--border-default) inset !important;
  border-radius: 6px;
  color: var(--text-primary) !important;
  padding: var(--space-8) var(--space-12);
  font-family: inherit;
  line-height: 1.5;
  min-height: 80px;
}

:deep(.big-textarea .el-textarea__inner::placeholder) {
  color: var(--text-muted);
}

.action-buttons-row {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
  margin-top: 4px;
  padding-bottom: 4px;
}

.big-action-btn {
  flex: 1;
  height: 36px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
  font-size: 13px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
  cursor: pointer;
  background: transparent;
}

.big-action-btn:hover {
  background: var(--surface-panel-2);
}

.global-replace {
  background: var(--surface-panel-2);
}

.global-replace:hover {
  background: var(--surface-editor-aux);
  border-color: var(--surface-debug);
}

.global-delete {
  background: var(--status-err-badge);
  border-color: var(--status-err-badge-border);
  color: var(--status-err);
}

.global-delete:hover {
  background: var(--status-err-badge-2);
  border-color: var(--status-err-badge-border-2);
}
</style>