<template>
  <div class="search-bar-container">
    <div class="search-bar">
      <span class="search-icon">🔍</span>
      <input
        ref="searchInput"
        v-model="keyword"
        class="search-input"
        placeholder="请输入关键词..."
        @keydown.enter="handleSearch"
        @focus="onFocus"
      />
      <el-button size="small" type="primary" @click="handleSearch">搜索</el-button>
      <span class="arrow-btn" @click="toggleExpand">
        {{ expanded ? '▲' : '▼' }}
      </span>
      <span class="close-btn" @click="close">✕</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  expanded: { type: Boolean, default: false }
})
const emit = defineEmits(['update:visible', 'update:expanded', 'search'])

const keyword = ref('')
const searchInput = ref(null)

const handleSearch = () => {
  if (!keyword.value.trim()) {
    return
  }
  emit('search', keyword.value.trim())
}

const toggleExpand = () => {
  emit('update:expanded', !props.expanded)
}

const close = () => {
  emit('update:visible', false)
  emit('update:expanded', false)
  keyword.value = ''
}

const onFocus = () => {
  nextTick(() => {
    if (searchInput.value) {
      searchInput.value.select()
    }
  })
}

watch(() => props.visible, (val) => {
  if (val) {
    nextTick(() => {
      if (searchInput.value) {
        searchInput.value.focus()
      }
    })
  }
})
</script>

<style scoped>
.search-bar-container {
  background: var(--surface-panel-2);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  width: fit-content;
  min-width: 500px;
  box-shadow: 0 8px 32px var(--shadow-drop);
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: var(--space-8) var(--space-12);
}

.search-icon {
  font-size: 16px;
}

.search-input {
  flex: 1;
  min-width: 120px;
  background: var(--surface-window);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--text-strong);
  font-size: 14px;
  outline: none;
  height: 32px;
}

.search-input:focus {
  border-color: var(--info-strong);
}

.el-button {
  font-size: 12px;
  padding: var(--space-4) var(--space-8);
}

.arrow-btn,
.close-btn {
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: all 0.2s;
  user-select: none;
}

.arrow-btn:hover,
.close-btn:hover {
  background: var(--border-default);
  color: var(--text-strong);
}
</style>