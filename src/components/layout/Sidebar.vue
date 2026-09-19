<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-tabs">
        <button class="tab-btn" :class="{ active: currentTab === 'files' }" @click="currentTab = 'files'" title="文件树">📁 项目</button>
        <button class="tab-btn" :class="{ active: currentTab === 'git' }" @click="currentTab = 'git'" title="Git 源码管理">⎇ Git</button>
      </div>
      <div class="header-actions" v-if="projectStore.projectPath && currentTab === 'files'">
        <el-button size="small" text class="btn-close" @click="closeProject">
          ✕ 关闭
        </el-button>
        <el-button size="small" text class="btn-switch" @click="switchProject">
          🔄 切换
        </el-button>
      </div>
    </div>
    <div v-show="currentTab === 'files'" class="sidebar-tree">
      <!-- 最近项目列表：单机单 AI，可切换多个已打开项目 -->
      <div v-if="recentList.length" class="recent-projects">
        <div class="recent-title">最近项目</div>
        <div
          v-for="item in recentList"
          :key="item.path"
          class="recent-item"
          :class="{ active: item.path === projectStore.projectPath }"
          :title="item.path"
          @click="handlePickProject(item.path)"
        >
          <span class="recent-icon">📁</span>
          <span class="recent-name">{{ item.name }}</span>
        </div>
      </div>
      <FileTree
        ref="fileTreeRef"
        @file-delete="onFileDelete"
        @file-clear="onFileClear"
        @file-paste="onFilePaste"
      />
    </div>
    <div v-show="currentTab === 'git'" class="sidebar-tree">
      <GitPanel />
    </div>
    <div class="sidebar-footer" v-if="currentTab === 'files'">
      <el-button size="small" class="btn-delete" @click="deleteCurrentFile">
        🗑️ 删除
      </el-button>
      <el-button size="small" class="btn-create" @click="createNewFile">
        📋 新建
      </el-button>
      <span class="current-file">{{ currentFileName }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useEditorStore } from '@/stores/editor'
import { useTranslationStore } from '@/stores/translation'
import { useTaskBusStore } from '@/stores/taskBus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { FileTree } from '@/components/file-system'
import GitPanel from '@/components/git/GitPanel.vue'
import { getFileName } from '@/utils/pathHelper'
import { readFile, writeFile, deleteFile, ensureDir } from '@/services/fileService'
import { selectFolder } from '@/services/projectService'
import {
  listRecentProjects,
  rememberProject,
  forgetProject,
} from '@/services/recentProjectsService'
import { cancelTask } from '@/composables/usePipelineStream'

const projectStore = useProjectStore()
const taskBus = useTaskBusStore()
const currentTab = ref('files')
const editorStore = useEditorStore()
const translationStore = useTranslationStore()
const fileTreeRef = ref(null)
const recentList = ref([])

// 挂载时加载最近项目列表
onMounted(async () => {
  recentList.value = await listRecentProjects()
})

const currentFileName = computed(() => {
  if (editorStore.activeFile) {
    return getFileName(editorStore.activeFile)
  }
  return '未选择'
})

// ===== 删除文件 =====
const onFileDelete = async (filePath) => {
  try {
    await ElMessageBox.confirm(`确定要删除文件 "${getFileName(filePath)}" 吗？`, '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    const success = await deleteFile(filePath)
    if (success) {
      ElMessage.success('文件已删除')
      await projectStore.scanDirectory()
      if (editorStore.activeFile === filePath) {
        editorStore.closeFile(filePath)
      }
    } else {
      ElMessage.error('删除失败')
    }
  } catch {
    // 取消
  }
}

// ===== 清空文件 =====
const onFileClear = async (filePath) => {
  try {
    await ElMessageBox.confirm(`确定要清空文件 "${getFileName(filePath)}" 的内容吗？`, '确认清空', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    const success = await writeFile(filePath, '')
    if (success) {
      ElMessage.success('文件已清空')
      if (editorStore.activeFile === filePath) {
        editorStore.openFile(filePath, '// 📄 此文件为空，开始编写代码吧...', 'edit')
      }
      await projectStore.scanDirectory()
    } else {
      ElMessage.error('清空失败')
    }
  } catch {
    // 取消
  }
}

// ===== 粘贴到文件 =====
const onFilePaste = async (filePath) => {
  try {
    const text = await navigator.clipboard.readText()
    if (!text) {
      ElMessage.warning('剪贴板为空')
      return
    }
    const success = await writeFile(filePath, text)
    if (success) {
      ElMessage.success('内容已粘贴到文件')
      if (editorStore.activeFile === filePath) {
        editorStore.openFile(filePath, text, 'edit')
      }
      await projectStore.scanDirectory()
    } else {
      ElMessage.error('写入失败')
    }
  } catch {
    ElMessage.error('无法读取剪贴板')
  }
}

// ===== 删除当前文件 =====
const deleteCurrentFile = async () => {
  const target = editorStore.activeFile
  if (!target) {
    ElMessage.warning('请先选择一个文件')
    return
  }
  await onFileDelete(target)
}

// ===== 新建文件 =====
const createNewFile = async () => {
  if (!projectStore.projectPath) {
    ElMessage.warning('请先打开项目')
    return
  }
  try {
    const { value } = await ElMessageBox.prompt('请输入文件名', '新建文件', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPlaceholder: '例如: new_file.py',
    })
    if (value) {
      // 🔑 使用 projectStore.createFile 在选中目录创建
      const filePath = await projectStore.createFile(value)
      if (filePath) {
        ElMessage.success(`文件已创建: ${getFileName(filePath)}`)
        // 自动打开新创建的文件
        const content = await readFile(filePath)
        if (content !== null) {
          editorStore.openFile(filePath, content || '// 📄 此文件为空，开始编写代码吧...', 'edit')
        }
      } else {
        ElMessage.error('创建失败')
      }
    }
  } catch {
    // 取消
  }
}

// ===== 关闭项目 =====
const closeProject = async () => {
  try {
    await ElMessageBox.confirm('确定要关闭当前项目吗？', '确认关闭', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    projectStore.closeProject()
    ElMessage.success('项目已关闭')
  } catch {
    // 取消
  }
}

// ===== 切换项目（选目录） =====
const switchProject = async () => {
  try {
    const result = await selectFolder()
    if (result) {
      await handlePickProject(result)
    }
  } catch (error) {
    console.error('切换项目失败:', error)
    ElMessage.error('切换项目失败：' + (error?.message || error))
  }
}

// ===== 统一的"切到某项目"入口（最近项目列表 + 选目录都走这里） =====
const handlePickProject = async (path) => {
  if (!path) return
  // 1. 点当前项目本身 → 无操作
  if (path === projectStore.projectPath) return

  // 2. AI 任务正在跑/挂起 → 打断确认
  if (taskBus.isBusy() && taskBus.taskId) {
    const curName = taskBus.projectPath
      ? String(taskBus.projectPath).split(/[\\/]/).filter(Boolean).pop()
      : '当前项目'
    try {
      await ElMessageBox.confirm(
        `是否等待项目"${curName}"结束？打断此项目会丢失，请认真考虑`,
        '打断当前任务',
        { confirmButtonText: '是，打断并切换', cancelButtonText: '否，留在当前', type: 'warning' }
      )
    } catch {
      return // 用户选否
    }
    // 用户选是：取消旧任务 + 写 interrupted 标记（下次打开旧项目 AI 认得这是半成品）
    try {
      await cancelTask(taskBus.taskId)
      await writeInterruptedMark(taskBus.projectPath)
    } catch (e) {
      console.warn('取消旧任务失败:', e)
    }
  }

  // 3. 执行切换
  await switchToProject(path)
}

// 实际切换：openProject → 登记最近列表 → 检查 interrupted 标记
const switchToProject = async (path) => {
  try {
    await projectStore.openProject(path)
    translationStore.setProjectPath(path)
    await rememberProject(path)
    recentList.value = await listRecentProjects()
    await showInterruptedHint(path)
    ElMessage.success(`已切换到项目: ${getFileName(path)}`)
  } catch (e) {
    console.error('打开项目失败:', e)
    await forgetProject(path)
    recentList.value = await listRecentProjects()
    ElMessage.error('目录不存在或不可读，已从最近项目移除')
  }
}

// 打断后写 .mycode/interrupted.json：让 AI 下次打开知道"这是上次做到一半的自己人项目"
const writeInterruptedMark = async (projectPath) => {
  if (!projectPath) return
  try {
    const markDir = projectPath.replace(/[\\/]+$/, '') + '/.mycode'
    await ensureDir(markDir)
    const payload = {
      task_id: taskBus.taskId,
      cancelled_at: new Date().toISOString(),
      reason: 'user_switched_project',
      note: '上次此项目被用户中途打断，存在半成品文件；Shadow 快照保留，可一键回滚',
    }
    await writeFile(markDir + '/interrupted.json', JSON.stringify(payload, null, 2))
  } catch (e) {
    console.warn('写入 interrupted 标记失败:', e)
  }
}

// 打开项目后检查 interrupted.json：存在就提示用户（标记保留给 AI 后端识别）
const showInterruptedHint = async (path) => {
  try {
    const raw = await readFile(path.replace(/[\\/]+$/, '') + '/.mycode/interrupted.json')
    if (raw) {
      ElMessage.info('⚠️ 上次此项目中途终止，半成品文件保留在目录中，Shadow 快照可一键回滚')
    }
  } catch (e) { /* 文件不存在即正常 */ }
}
</script>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--surface-window);
  border-right: 1px solid var(--border-default);
  min-width: 160px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 34px;
  background: var(--surface-panel-1);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.sidebar-tabs {
  display: flex;
  gap: 2px;
  align-items: center;
}

.tab-btn {
  border: none;
  background: transparent;
  color: var(--text-subtle);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  color: var(--text-bright);
  background: var(--surface-selected-soft);
}

.tab-btn.active {
  color: var(--text-bright);
  background: var(--surface-selected-soft);
  font-weight: 600;
}

.sidebar-header .title {
  font-weight: 600;
  color: var(--text-bright);
  font-size: 13px;
  letter-spacing: 0.3px;
}

.header-actions {
  display: flex;
  gap: 2px;
}

.header-actions .el-button {
  color: var(--text-subtle) !important;
  font-size: 12px !important;
  padding: 2px 8px !important;
  border-radius: 4px !important;
}

.header-actions .el-button:hover {
  color: var(--text-bright) !important;
  background: var(--surface-selected-soft) !important;
}

.header-actions .btn-close:hover {
  color: var(--status-err) !important;
  background: var(--status-err-soft) !important;
}

.header-actions .btn-switch:hover {
  color: var(--info) !important;
  background: var(--info-soft) !important;
}

.sidebar-tree {
  flex: 1;
  overflow: auto;
  padding: 4px 0;
}

/* 最近项目列表 */
.recent-projects {
  padding: 6px 10px 8px;
  border-bottom: 1px solid var(--border-default);
  margin-bottom: 4px;
  flex-shrink: 0;
}

.recent-title {
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-subtle);
  white-space: nowrap;
  overflow: hidden;
}

.recent-item:hover {
  background: var(--surface-selected-soft);
  color: var(--text-bright);
}

.recent-item.active {
  background: var(--surface-selected-soft);
  color: var(--text-bright);
  font-weight: 600;
}

.recent-icon {
  flex-shrink: 0;
  font-size: 11px;
}

.recent-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-tree::-webkit-scrollbar {
  width: 4px;
}

.sidebar-tree::-webkit-scrollbar-thumb {
  background: var(--surface-raised);
  border-radius: 4px;
}

.sidebar-tree::-webkit-scrollbar-thumb:hover {
  background: var(--surface-panel-3);
}

.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: var(--space-4) var(--space-8);
  border-top: 1px solid var(--border-default);
  flex-shrink: 0;
  background: var(--surface-window);
}

.btn-delete {
  background: transparent !important;
  color: var(--text-subtle) !important;
  border: 1px solid var(--border-default) !important;
  border-radius: 6px !important;
  font-size: 12px !important;
  padding: var(--space-4) var(--space-8) !important;
  transition: all 0.2s ease !important;
}

.btn-delete:hover {
  background: var(--status-err-subtle) !important;
  color: var(--status-err) !important;
  border-color: var(--status-err) !important;
}

.btn-create {
  background: transparent !important;
  color: var(--text-subtle) !important;
  border: 1px solid var(--border-default) !important;
  border-radius: 6px !important;
  font-size: 12px !important;
  padding: var(--space-4) var(--space-8) !important;
  transition: all 0.2s ease !important;
}

.btn-create:hover {
  background: var(--info-subtle) !important;
  color: var(--info) !important;
  border-color: var(--info) !important;
}

.current-file {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}
</style>