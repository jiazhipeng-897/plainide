<template>
  <div class="file-tree">
    <div v-if="!projectStore.projectPath" class="empty">
      <div class="empty-container">
        <el-button class="btn-open-project" @click="openFolder">
          <span class="icon-folder">📁</span> 打开项目
        </el-button>
        <div class="empty-hint">选择一个文件夹开始工作</div>
      </div>
    </div>
    <div v-else>
      <div v-for="item in treeData" :key="item.path">
        <FileTreeNode
          :node="item"
          @file-delete="onFileDelete"
          @file-clear="onFileClear"
          @file-paste="onFilePaste"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import FileTreeNode from './FileTreeNode.vue'

const projectStore = useProjectStore()
const emit = defineEmits(['file-delete', 'file-clear', 'file-paste'])

const treeData = computed(() => projectStore.fileTree || [])

const openFolder = async () => {
  const path = await window.electronAPI.selectFolder()
  if (path) {
    projectStore.setProjectPath(path)
    await projectStore.scanDirectory()
  }
}

const onFileDelete = (filePath) => emit('file-delete', filePath)
const onFileClear = (filePath) => emit('file-clear', filePath)
const onFilePaste = (filePath) => emit('file-paste', filePath)
</script>

<style scoped>
.file-tree {
  padding: 0 4px;
  height: 100%;
}
.empty {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  height: 100%;
  width: 100%;
}
.empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-top: var(--space-8);
}
.empty-hint {
  color: var(--text-muted);
  font-size: 12px;
  letter-spacing: 0.5px;
}
.btn-open-project {
  background: var(--surface-panel-1) !important;
  border: 1px solid var(--border-default) !important;
  color: var(--text-primary) !important;
  border-radius: 6px !important;
  padding: var(--space-12) var(--space-24) !important;
  font-size: 14px !important;
  transition: all 0.25s ease !important;
}
.btn-open-project:hover {
  background: var(--surface-panel-2) !important;
  border-color: var(--info) !important;
  color: var(--info) !important;
  box-shadow: 0 0 15px var(--info-glow) !important;
}
.icon-folder {
  margin-right: 8px;
  font-size: 16px;
}
</style>