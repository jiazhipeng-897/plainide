<template>
  <div v-if="visible" class="search-results-container">
    <div class="search-divider"></div>
    <div class="search-body">
      <div v-if="loading" class="search-status">⏳ 搜索中...</div>
      <div v-else-if="searched && results.length === 0" class="search-status">
        🔍 没有找到匹配的内容
      </div>
      <div v-else-if="results.length > 0" class="search-results">
        <div
          v-for="file in results"
          :key="file.path"
          class="result-file"
        >
          <div class="result-file-header" @click="toggleFile(file.path)">
            <span>📄 {{ file.fileName }}</span>
            <span class="result-count">{{ file.matches.length }} 个匹配</span>
          </div>
          <div v-if="expandedFiles.includes(file.path)" class="result-lines">
            <div
              v-for="(match, idx) in file.matches"
              :key="idx"
              class="result-line"
              @click="openFile(file.path, match.line)"
            >
              <span class="line-num">{{ match.line }}</span>
              <span class="line-content" v-html="highlightMatch(match.content)"></span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showReplace" class="replace-area">
        <div class="replace-row">
          <span class="replace-label">替换为：</span>
          <input v-model="replaceText" class="replace-input" placeholder="输入替换内容..." />
          <el-button size="small" type="warning" @click="replaceAll">全部替换</el-button>
          <el-button size="small" @click="replaceOne">逐个替换</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { useEditorStore } from '@/stores/editor'
import { replaceAllMatches, countTotalMatches } from '@/services/searchService'
import { readFile } from '@/services/fileService'
import { getFileName } from '@/utils/pathHelper'

const props = defineProps({
  visible: { type: Boolean, default: false },
  results: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  searched: { type: Boolean, default: false },
  keyword: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const projectStore = useProjectStore()
const editorStore = useEditorStore()

const expandedFiles = ref([])
const showReplace = ref(false)
const replaceText = ref('')

const totalMatches = computed(() => countTotalMatches(props.results))

const toggleFile = (path) => {
  const idx = expandedFiles.value.indexOf(path)
  if (idx > -1) {
    expandedFiles.value.splice(idx, 1)
  } else {
    expandedFiles.value.push(path)
  }
}

const openFile = async (filePath, line) => {
  try {
    const content = await readFile(filePath)
    editorStore.openFile(filePath, content)
    if (editorStore.jumpToLine) {
      editorStore.jumpToLine(line, line)
    }
    emit('close')
  } catch (error) {
    console.error('打开文件失败:', error)
    ElMessage.error('打开文件失败')
  }
}

const highlightMatch = (content) => {
  if (!props.keyword) return content
  const regex = new RegExp(props.keyword, 'gi')
  return content.replace(regex, (match) => `<span class="highlight">${match}</span>`)
}

const replaceAll = async () => {
  if (!replaceText.value) {
    ElMessage.warning('请输入替换内容')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要将所有 "${props.keyword}" 替换为 "${replaceText.value}" 吗？共 ${totalMatches.value} 处`,
      '确认全部替换',
      { type: 'warning' }
    )

    const { replacedCount, failedCount } = await replaceAllMatches(
      props.results,
      props.keyword,
      replaceText.value
    )

    if (failedCount > 0) {
      ElMessage.warning(`已替换 ${replacedCount} 处，${failedCount} 个文件替换失败`)
    } else {
      ElMessage.success(`已替换 ${replacedCount} 处`)
    }

    await projectStore.scanDirectory()
    emit('close')
  } catch {
    // 取消
  }
}

const replaceOne = () => {
  ElMessage.info('逐个替换功能开发中...')
}
</script>

<style scoped>
.search-results-container {
  background: var(--surface-window);
  border-left: 1px solid var(--border-default);
  border-right: 1px solid var(--border-default);
  border-bottom: 1px solid var(--border-default);
  border-radius: 0 0 12px 12px;
  width: fit-content;
  min-width: 500px;
  max-height: 400px;
  overflow-y: auto;
  box-shadow: 0 8px 32px var(--shadow-drop);
  margin-top: -1px; /* scale-exempt: border-collapse 边框贴合 */
}

.search-divider {
  height: 1px;
  background: var(--surface-raised);
}

.search-body {
  overflow-y: auto;
  max-height: 400px;
}

.search-status {
  padding: var(--space-20) var(--space-12);
  text-align: center;
  color: var(--text-subtle);
  font-size: 14px;
}

.search-results {
  overflow-y: auto;
  padding: 6px 0;
}

.search-results::-webkit-scrollbar {
  width: 4px;
}
.search-results::-webkit-scrollbar-thumb {
  background: var(--surface-raised);
  border-radius: 4px;
}
.search-results::-webkit-scrollbar-thumb:hover {
  background: var(--surface-panel-3);
}

.result-file {
  border-bottom: 1px solid var(--surface-panel-2);
}

.result-file-header {
  display: flex;
  justify-content: space-between;
  padding: var(--space-8) var(--space-12);
  cursor: pointer;
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s;
}

.result-file-header:hover {
  background: var(--surface-panel-2);
}

.result-count {
  font-size: 12px;
  color: var(--text-subtle);
  font-weight: 400;
}

.result-lines {
  padding: var(--space-2) 0 var(--space-8) var(--space-12);
}

.result-line {
  display: flex;
  padding: var(--space-2) var(--space-8) var(--space-2) 0;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.15s;
  font-size: 13px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  color: var(--text-primary);
}

.result-line:hover {
  background: var(--surface-panel-2);
}

.line-num {
  color: var(--text-muted);
  min-width: 40px;
  text-align: right;
  padding-right: 12px;
  font-size: 12px;
  flex-shrink: 0;
}

.line-content {
  white-space: pre-wrap;
  word-break: break-all;
}

.line-content :deep(.highlight) {
  background: var(--status-warn-strong);
  color: var(--surface-window);
  padding: 0 2px;
  border-radius: 2px;
  font-weight: 600;
}

.replace-area {
  border-top: 1px solid var(--border-default);
  padding: var(--space-8) var(--space-12);
  flex-shrink: 0;
  background: var(--surface-panel-1);
}

.replace-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.replace-label {
  font-size: 13px;
  color: var(--text-primary);
}

.replace-input {
  flex: 1;
  background: var(--surface-window);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--text-strong);
  font-size: 13px;
  outline: none;
  height: 32px;
}

.replace-input:focus {
  border-color: var(--info);
}

.replace-area .el-button {
  font-size: 12px;
  padding: 4px 12px;
}
</style>