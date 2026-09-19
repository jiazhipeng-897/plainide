<template>
  <teleport to="body">
    <transition name="search-fade">
      <div v-if="visible" class="search-overlay" @click.self="close">
        <SearchBar
          :visible="visible"
          :expanded="expanded"
          @update:visible="val => emit('update:visible', val)"
          @update:expanded="val => expanded = val"
          @search="handleSearch"
        />

        <SearchResults
          v-if="expanded"
          :visible="expanded"
          :results="results"
          :loading="loading"
          :searched="searched"
          :keyword="keyword"
          @close="close"
        />
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { SearchBar } from '@/components/common'
import SearchResults from './SearchResults.vue'
import { searchInProject } from '@/services/searchService'

const props = defineProps({
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['update:visible'])

const projectStore = useProjectStore()

const keyword = ref('')
const results = ref([])
const loading = ref(false)
const searched = ref(false)
const expanded = ref(false)

const handleSearch = async (searchKeyword) => {
  keyword.value = searchKeyword

  if (!keyword.value.trim()) {
    ElMessage.warning('请输入搜索关键词')
    return
  }
  if (!projectStore.projectPath) {
    ElMessage.warning('请先打开项目')
    return
  }
  if (!projectStore.fileTree || projectStore.fileTree.length === 0) {
    ElMessage.warning('请先扫描项目文件')
    return
  }

  loading.value = true
  searched.value = true
  results.value = []

  try {
    const searchResults = await searchInProject(
      projectStore.fileTree,
      keyword.value.trim()
    )

    results.value = searchResults
    expanded.value = true

    const total = results.value.reduce((sum, f) => sum + f.matches.length, 0)
    if (total > 0) {
      ElMessage.success(`找到 ${total} 个匹配，共 ${results.value.length} 个文件`)
    } else {
      ElMessage.info('没有找到匹配的内容')
    }
  } catch (error) {
    console.error('搜索失败:', error)
    ElMessage.error('搜索失败')
  } finally {
    loading.value = false
  }
}

const close = () => {
  emit('update:visible', false)
  setTimeout(() => {
    keyword.value = ''
    results.value = []
    searched.value = false
    expanded.value = false
    loading.value = false
  }, 200)
}

watch(() => props.visible, (val) => {
  if (!val) {
    expanded.value = false
    results.value = []
    searched.value = false
  }
})
</script>

<style scoped>
.search-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--overlay-mask);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 80px; /* scale-exempt: layout-outliers */
}

.search-overlay > * {
  margin-bottom: 0;
}

.search-fade-enter-active,
.search-fade-leave-active {
  transition: all 0.25s ease;
}

.search-fade-enter-from,
.search-fade-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.96);
}
</style>