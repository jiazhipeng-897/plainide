<!-- AgentTranslator.vue-->
<template>
  <div class="agent-panel-container">
    <!-- 第一排：功能按钮（占位） -->
    <FuncToolbar
      @format="handleFormat"
      @doctor="handleDoctor"
      :format-loading="formatLoading"
      :doctor-loading="doctorLoading"
    />

    <!-- 第二排：三功能卡片 -->
    <div class="func-row-2">
      <ActionCard
        v-for="tab in tabs"
        :key="tab.key"
        :icon="tab.icon"
        :label="tab.label"
        :active="activeTab === tab.key"
        @click="activeTab = tab.key"
      />
    </div>

    <!-- 第三排：内容展示区 -->
    <div class="content-display-area">
      <!-- 翻译内容：只读 + 流式渲染 -->
      <TranslateTab
        v-show="activeTab === 'code'"
        :content="translationContent"
        :is-translating="isTranslating"
      />

      <!-- 项目翻译：可编辑 + 保存按钮 -->
      <ProjectTab
        v-show="activeTab === 'project'"
        v-model="editableContent"
        :saved="projectSaved"
        @save="handleSaveTranslation"
      />

      <!-- Agent：开始翻译按钮 -->
      <AgentTab
        v-show="activeTab === 'agent'"
        @translate="handleStartTranslate"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useProjectStore } from '@/stores/project'
import { useAgentStore } from '@/stores/agent'
import { ElMessage } from 'element-plus'
import { ensureDir, readFile, writeFile } from '@/services/fileService'
import path from 'path'
import { saveTranslation } from '@/services/agentService'

import FuncToolbar from './FuncToolbar.vue'
import ActionCard from './ActionCard.vue'
import TranslateTab from './TranslateTab.vue'
import ProjectTab from './ProjectTab.vue'
import AgentTab from './AgentTab.vue'

// ===== Stores =====
const editorStore = useEditorStore()
const projectStore = useProjectStore()
const agentStore = useAgentStore()

// ===== UI 状态 =====
const activeTab = ref('code')
const tabs = [
  { key: 'code', icon: '📝', label: '翻译内容' },
  { key: 'project', icon: '📂', label: '项目翻译' },
  { key: 'agent', icon: '🤖', label: 'AGENT' },
]

// ===== 本地状态 =====
const editableContent = ref('')      // 项目翻译可编辑内容
const projectSaved = ref(false)

// ===== 格式化 & 代码医生（占位） =====
const formatLoading = ref(false)
const doctorLoading = ref(false)

// ===== 计算属性：从 store 获取翻译内容 =====
const translationContent = computed(() => agentStore.translationContent)
const isTranslating = computed(() => agentStore.isTranslating)

// ===== 工具函数：获取映射文件路径 =====
const getMappingPath = (projectPath) => {
  return path.join(projectPath, '.myide', 'translations', 'mapping.json')
}

// ===== 工具函数：获取相对路径 =====
const getRelativePath = (filePath, projectPath) => {
  return path.relative(projectPath, filePath)
}

// ===== 加载翻译映射 =====
const loadTranslationMap = async () => {
  const projectPath = projectStore.projectPath
  const activeFile = editorStore.activeFile

  if (!projectPath || !activeFile) {
    editableContent.value = ''
    return
  }

  const mappingPath = getMappingPath(projectPath)
  const relativePath = getRelativePath(activeFile, projectPath)

  try {
    const content = await readFile(mappingPath)
    if (content) {
      const map = JSON.parse(content)
      const translated = map[relativePath]
      if (translated) {
        editableContent.value = translated
        // 如果有翻译内容，也同步到 store 的 translationContent
        agentStore.setTranslation(translated)
        return
      }
    }
    editableContent.value = ''
  } catch (error) {
    // 文件不存在或解析失败
    editableContent.value = ''
  }
}

// ===== 保存翻译映射（旧方法，保留兼容） =====
const saveTranslationMap = async (content) => {
  const projectPath = projectStore.projectPath
  const activeFile = editorStore.activeFile

  if (!projectPath || !activeFile) {
    ElMessage.warning('请先打开项目和文件')
    return false
  }

  const mappingPath = getMappingPath(projectPath)
  const relativePath = getRelativePath(activeFile, projectPath)

  try {
    // 确保目录存在
    await ensureDir(path.dirname(mappingPath))

    // 读取现有映射
    let map = {}
    try {
      const existing = await readFile(mappingPath)
      if (existing) {
        map = JSON.parse(existing)
      }
    } catch (e) {
      // 文件不存在
    }

    // 更新映射
    map[relativePath] = content

    // 写入
    await writeFile(mappingPath, JSON.stringify(map, null, 2))
    return true
  } catch (error) {
    ElMessage.error('保存失败: ' + error.message)
    return false
  }
}

// ===== 开始翻译 =====
const handleStartTranslate = async () => {
  const code = editorStore.currentContent
  const filePath = editorStore.activeFile
  const projectPath = projectStore.projectPath
  const language = editorStore.currentLanguage || ''

  if (!code) {
    ElMessage.warning('请先打开代码文件')
    return
  }

  if (!projectPath) {
    ElMessage.warning('请先打开项目')
    return
  }

  // 调用 store 的翻译方法
  await agentStore.startTranslate({
    code,
    filePath,
    projectPath,
    language,
  })
}

// ===== 保存翻译（手动点击保存按钮）- 修复版 =====
const handleSaveTranslation = async () => {
  const content = editableContent.value
  const projectPath = projectStore.projectPath
  const filePath = editorStore.activeFile

  // 即使 content 为空也允许保存（清空）
  if (!projectPath || !filePath) {
    ElMessage.warning('请先打开项目和文件')
    return
  }

  const success = await saveTranslation(projectPath, filePath, content)
  if (success) {
    // 关键：同步更新 translationContent，让 TranslateTab 也刷新
    agentStore.setTranslation(content)
    projectSaved.value = true
    setTimeout(() => {
      projectSaved.value = false
    }, 2000)
    ElMessage.success('保存成功')
  } else {
    ElMessage.error('保存失败')
  }
}

// ===== 格式化（占位） =====
const handleFormat = async () => {
  formatLoading.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 1000))
    ElMessage.info('格式化功能开发中...')
  } finally {
    formatLoading.value = false
  }
}

// ===== 代码医生（占位） =====
const handleDoctor = async () => {
  doctorLoading.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 1000))
    ElMessage.info('代码医生功能开发中...')
  } finally {
    doctorLoading.value = false
  }
}

// ==========================================
// 监听：翻译内容变化，同步到可编辑区域
// ==========================================
watch(
  () => agentStore.translationContent,
  (newContent) => {
    if (newContent) {
      editableContent.value = newContent
    }
  },
  { immediate: true }
)

// ==========================================
// 监听：切换文件时通过 store 加载对应翻译
// ==========================================
watch(
  () => [projectStore.projectPath, editorStore.activeFile],
  async ([projectPath, filePath]) => {
    if (projectPath && filePath) {
      await agentStore.loadTranslationForFile(projectPath, filePath)
      // 同步到可编辑区域
      editableContent.value = agentStore.translationContent
    } else {
      agentStore.clearTranslation()
      editableContent.value = ''
    }
  },
  { immediate: true }
)

// ==========================================
// 监听：翻译完成时自动保存到 mapping.json
// ==========================================
watch(
  () => agentStore.isTranslating,
  async (newVal, oldVal) => {
    // 翻译从 true 变为 false，且内容不为空
    if (oldVal === true && newVal === false && agentStore.translationContent) {
      const content = agentStore.translationContent
      if (content) {
        const success = await saveTranslationMap(content)
        if (success) {
          // 同步到可编辑区域
          editableContent.value = content
          projectSaved.value = true
          setTimeout(() => {
            projectSaved.value = false
          }, 2000)
        }
      }
    }
  }
)

onMounted(() => {
  loadTranslationMap()
})
</script>

<style scoped>
.agent-panel-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-window);
  padding: 12px;
  box-sizing: border-box;
  overflow: hidden;
}

.func-row-2 {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.content-display-area {
  flex: 1;
  background: var(--surface-panel-1);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>