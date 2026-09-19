<template>
  <span class="translation-plugin">
    <el-button size="small" class="menu-btn" @click="handleTranslateAll" :loading="store.isTranslating">
      🔤 翻译名称
    </el-button>
    <el-button size="small" class="menu-btn" @click="handleClearAll">
      ❌ 去除名称
    </el-button>
    <el-button size="small" class="menu-btn" @click="handleRefresh">
      🔄 刷新
    </el-button>
  </span>
</template>

<script setup>
import { useTranslationStore } from '@/stores/translation'
import { useProjectStore } from '@/stores/project'
import { ElMessage, ElMessageBox } from 'element-plus'
import { watch } from 'vue'
import { EVENT_TRANSLATION_UPDATED } from '@/constants/eventNames'

const store = useTranslationStore()
const projectStore = useProjectStore()

// ===== 翻译（只翻译，不渲染） =====
const handleTranslateAll = async () => {
  if (!projectStore.projectPath) {
    ElMessage.warning('请先打开项目')
    return
  }

  const fileTree = projectStore.fileTree
  if (!fileTree || fileTree.length === 0) {
    ElMessage.warning('项目中没有文件')
    return
  }

  // 同步文件树变化到两个 JSON
  store.syncFromFileTree(fileTree)

  const toTranslate = store.fileList.filter(name => !(name in store.cache))

  if (toTranslate.length === 0) {
    ElMessage.info('所有文件已翻译，无需重复翻译')
    return
  }

  ElMessage.info(`正在翻译 ${toTranslate.length} 个文件...`)

  try {
    await store.translateAll()
    const totalCount = Object.keys(store.cache).length
    ElMessage.success(`翻译完成！共 ${totalCount} 个文件已翻译`)
    // 只派发事件，不管渲染
    window.dispatchEvent(new CustomEvent(EVENT_TRANSLATION_UPDATED))
  } catch (e) {
    ElMessage.error('翻译失败: ' + e.message)
  }
}

// ===== 清除（只清除数据，不渲染） =====
const handleClearAll = async () => {
  const count = Object.keys(store.cache).length
  if (count === 0) {
    ElMessage.info('没有翻译记录')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要清除所有 ${count} 个文件的翻译吗？`,
      '确认清除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    store.clearAll()
    ElMessage.success('已清除所有翻译')
    // 只派发事件，不管渲染
    window.dispatchEvent(new CustomEvent(EVENT_TRANSLATION_UPDATED))
  } catch {
    // 取消
  }
}

// ===== 刷新按钮：只负责触发渲染刷新 =====
const handleRefresh = () => {
  window.dispatchEvent(new CustomEvent(EVENT_TRANSLATION_UPDATED))
  ElMessage.success('已刷新')
}

// ===== 打开项目时加载缓存 =====
watch(() => projectStore.projectPath, (path) => {
  if (path) {
    store.setProjectPath(path)
  }
}, { immediate: true })
</script>

<style scoped>
.translation-plugin {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.translation-plugin .menu-btn {
  background: transparent !important;
  color: var(--text-status) !important;
  border: none !important;
  border-radius: 6px !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  padding: 4px 12px !important;
  transition: all 0.2s ease !important;
}

.translation-plugin .menu-btn:hover {
  background: var(--surface-inset-2) !important;
  color: var(--text-hero) !important;
}
</style>
