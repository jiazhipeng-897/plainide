<template>
  <el-dialog
    :model-value="true"
    :title="'改动预览 · ' + fileName"
    width="860px"
    top="6vh"
    destroy-on-close
    class="git-diff-dialog"
    @close="onClose"
  >
    <div class="diff-body">
      <!-- 加载中 -->
      <div v-if="loading" class="diff-state">正在读取改动...</div>

      <!-- 无历史版本可对比 -->
      <div v-else-if="noVersion" class="diff-state">
        {{ noVersionMsg }}
      </div>

      <!-- Diff 编辑器 -->
      <div v-show="ready" ref="diffContainer" class="diff-container"></div>
    </div>

    <template #footer>
      <div class="diff-footer">
        <span v-if="ready" class="diff-hint">左侧：{{ staged ? '暂存区' : '已提交版本' }}　右侧：工作区</span>
        <el-button size="small" @click="onClose">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import { getFileName } from '@/utils/pathHelper'
import { readFile } from '@/services/fileService'

const props = defineProps({
  projectPath: { type: String, required: true },
  filePath: { type: String, required: true },
  staged: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const fileName = computed(() => getFileName(props.filePath))
const loading = ref(true)
const noVersion = ref(false)
const noVersionMsg = ref('')
const ready = ref(false)
const diffContainer = ref(null)
let diffEditor = null

const onClose = () => {
  if (diffEditor) {
    diffEditor.dispose()
    diffEditor = null
  }
  emit('close')
}

onMounted(async () => {
  try {
    // 1. 取历史版本（暂存区 or HEAD）
    const ver = await window.electronAPI.gitShowVersion(
      props.projectPath,
      props.filePath,
      props.staged
    )

    // 2. 读工作区当前内容
    let workContent = ''
    try {
      const wc = await readFile(props.filePath)
      workContent = wc === null ? '' : wc
    } catch (e) {
      workContent = ''
    }

    if (!ver?.ok) {
      // 无历史版本（未跟踪文件 / 首次提交）
      noVersion.value = true
      noVersionMsg.value = ver?.error?.includes('no-version')
        ? '该文件没有可对比的历史版本（未跟踪或首次提交）。暂存后可提交。'
        : '无法读取历史版本：' + (ver?.error || '未知错误')
      loading.value = false
      return
    }

    await nextTick()
    if (!diffContainer.value) return

    diffEditor = monaco.editor.createDiffEditor(diffContainer.value, {
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
      fontSize: 12,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      theme: 'vs-dark',
    })
    diffEditor.setModel({
      original: monaco.editor.createModel(ver.content || '', undefined),
      modified: monaco.editor.createModel(workContent, undefined),
    })
    ready.value = true
  } catch (e) {
    noVersion.value = true
    noVersionMsg.value = 'Diff 读取失败：' + (e.message || '未知错误')
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  if (diffEditor) {
    diffEditor.dispose()
    diffEditor = null
  }
})
</script>

<style scoped>
.diff-body {
  min-height: 320px;
  max-height: 62vh;
  overflow: hidden;
}

.diff-container {
  width: 100%;
  height: 62vh;
}

.diff-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 320px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  padding: 0 24px;
}

.diff-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.diff-hint {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
