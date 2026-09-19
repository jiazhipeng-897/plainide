<template>
  <div class="tree-node">
    <div
      class="tree-item"
      :class="{
        hovered,
        selected: isSelected,
        'is-file': !isDirectory,
        'is-folder': isDirectory,
      }"
      @click="handleClick"
      @dblclick="handleDblClick"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
    >
      <!-- VS Code 风格展开/折叠符号 -->
      <span
        v-if="isDirectory"
        class="toggle-icon"
        :class="{ expanded }"
        @click.stop="toggleExpand"
      >
        {{ expanded ? '∨' : '>' }}
      </span>
      <span v-else class="toggle-icon-placeholder"></span>

      <!-- 文件名（无图标） -->
      <span class="file-name">{{ node.name }}</span>
      <span v-if="isWriting" class="write-dot" title="Agent 正在写入此文件"></span>
      <span v-if="gitStatus" class="git-badge" :class="'git-' + gitStatus" :title="gitStatus === 'U' ? '未跟踪' : '有改动'">{{ gitStatus }}</span>

      <!-- 翻译 -->
      <span v-if="getTranslation" class="translation-tag">
        <span
          v-if="editing === node.name"
          class="translation-edit"
        >
          <input
            ref="editInput"
            v-model="editValue"
            @blur="saveTranslation(node.name)"
            @keydown.enter="saveTranslation(node.name)"
            @keydown.esc="cancelEdit"
            class="translation-input"
          />
        </span>
        <span
          v-else
          class="translation-label"
          @dblclick="startEdit(node.name, $event)"
          title="双击修改翻译"
        >
          # {{ getTranslation }}
        </span>
      </span>

      <!-- 修改标记 -->
      <span v-if="isModified" class="modified-dot">●</span>

      <!-- 悬停操作按钮 -->
      <div v-if="!isDirectory && hovered" class="actions">
        <span class="action-btn" @click.stop="handleClear" title="清空内容">🗑</span>
        <span class="action-btn" @click.stop="handlePaste" title="粘贴剪贴板">📋</span>
      </div>
    </div>

    <!-- 子节点 -->
    <div v-if="isDirectory && expanded && hasChildren" class="children">
      <FileTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        @file-delete="$emit('file-delete', $event)"
        @file-clear="$emit('file-clear', $event)"
        @file-paste="$emit('file-paste', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useTranslationStore } from '@/stores/translation'
import { useProjectStore } from '@/stores/project'
import { useGitStore } from '@/stores/git'
import { EVENT_TRANSLATION_UPDATED } from '@/constants/eventNames'
import { readFile } from '@/services/fileService'

const props = defineProps({
  node: { type: Object, required: true },
})

const emit = defineEmits(['file-delete', 'file-clear', 'file-paste'])

const editorStore = useEditorStore()
const translationStore = useTranslationStore()
const projectStore = useProjectStore()
const gitStore = useGitStore()

const expanded = ref(false)
const hovered = ref(false)
const editing = ref(null)
const editValue = ref('')
const editInput = ref(null)
const renderKey = ref(0)
const clickTimer = ref(null)

const isDirectory = computed(() => props.node.isDirectory)
const hasChildren = computed(() => props.node.children && props.node.children.length > 0)

const isSelected = computed(() => {
  return projectStore.selectedPath === props.node.path
})

const isWriting = computed(() => {
  return !!projectStore.writingFiles?.[props.node.path]
})

const isModified = computed(() => {
  return editorStore.getFileModified?.(props.node.path) || false
})

// Git 状态角标（M/A/U/D/R，查文件状态映射；无状态返回空）
const gitStatus = computed(() => {
  if (!gitStore.isRepo || isDirectory.value) return ''
  // fileStatusMap 的 key 是正斜杠绝对路径；树节点 path 是 Windows 反斜杠格式，归一化后再查
  const key = props.node.path.replace(/\\/g, '/')
  return gitStore.fileStatusMap[key] || ''
})

const getTranslation = computed(() => {
  renderKey.value
  const baseName = props.node.name.replace(/\.[^.]+$/, '')
  return translationStore.getTranslation(baseName)
})

const toggleExpand = () => {
  expanded.value = !expanded.value
}

const getParentPath = (filePath) => {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (lastSlash > 0) {
    return filePath.substring(0, lastSlash)
  }
  return null
}

const openFileWithMode = async (mode) => {
  if (isDirectory.value) return
  try {
    const content = await readFile(props.node.path)
    if (content !== null) {
      editorStore.openFile(props.node.path, content, mode)
    }
  } catch (error) {
    console.error('打开文件失败:', error)
  }
}

const handleClick = () => {
  if (isDirectory.value) {
    expanded.value = !expanded.value
    projectStore.setSelectedPath(props.node.path)
    return
  }

  const parentPath = getParentPath(props.node.path)
  if (parentPath) {
    projectStore.setSelectedPath(parentPath)
  }

  clearTimeout(clickTimer.value)
  clickTimer.value = setTimeout(() => {
    openFileWithMode('click')
  }, 200)
}

const handleDblClick = () => {
  clearTimeout(clickTimer.value)
  openFileWithMode('dblclick')
}

const handleClear = (e) => {
  e.stopPropagation()
  emit('file-clear', props.node.path)
}

const handlePaste = (e) => {
  e.stopPropagation()
  emit('file-paste', props.node.path)
}

const startEdit = (name, e) => {
  e.stopPropagation()
  const baseName = name.replace(/\.[^.]+$/, '')
  editing.value = name
  editValue.value = translationStore.getTranslation(baseName) || ''
  nextTick(() => {
    if (editInput.value) {
      editInput.value.focus()
      editInput.value.select()
    }
  })
}

const saveTranslation = (name) => {
  if (editing.value) {
    const baseName = name.replace(/\.[^.]+$/, '')
    translationStore.setTranslation(baseName, editValue.value)
    editing.value = null
    renderKey.value++
  }
}

const cancelEdit = () => {
  editing.value = null
}

const handleTranslationUpdate = () => {
  renderKey.value++
}

onMounted(() => {
  window.addEventListener(EVENT_TRANSLATION_UPDATED, handleTranslationUpdate)
})

onBeforeUnmount(() => {
  clearTimeout(clickTimer.value)
  window.removeEventListener(EVENT_TRANSLATION_UPDATED, handleTranslationUpdate)
})
</script>

<style scoped>
.tree-node {
  font-size: 13px;
  user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* --- 树节点行 --- */
.tree-item {
  display: flex;
  align-items: center;
  padding: var(--space-2) var(--space-8) var(--space-2) var(--space-6);
  height: 26px;
  min-height: 26px;
  gap: 2px;
  cursor: pointer;
  position: relative;
  border-radius: 2px;
  transition: background 0.08s ease;
}

.tree-item:hover {
  background: var(--surface-panel-2);
}

.tree-item.hovered {
  background: var(--surface-panel-2);
}

/* VS Code 选中状态 */
/* 选中态左侧指示条（VS Code 风格，不改背景色） */
.tree-item.selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 2px;
  bottom: 2px;
  width: 2px;
  border-radius: var(--radius-2);
  background: var(--info);
}

.tree-item.selected {
  background: var(--surface-selection) !important;
}

.tree-item.selected .file-name {
  color: var(--text-inverse) !important;
}

/* --- 展开/折叠符号 (亮白色，大一号) --- */
.toggle-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--text-inverse);
  font-size: var(--fs-14);
  font-weight: 300;
  cursor: pointer;
  transition: color 0.15s;
  border-radius: 2px;
}

.toggle-icon:hover {
  color: var(--text-inverse);
  opacity: 0.8;
}

.toggle-icon-placeholder {
  display: inline-flex;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* --- 文件名 --- */
.file-name {
  flex: 1;
  color: var(--text-primary);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  padding: 0 2px;
}

.tree-item.selected .file-name {
  color: var(--text-inverse);
}

/* --- 子节点缩进 --- */
.children {
  padding-left: 8px;
}

/* --- 修改标记 --- */
.git-badge {
  font-size: 10px;
  font-weight: 700;
  margin-left: 4px;
  padding: 0 3px;
  border-radius: 3px;
  line-height: 1.4;
  flex-shrink: 0;
  font-family: Consolas, 'Courier New', monospace;
}

.git-M {
  color: var(--status-warn, #e6a23c);
  background: var(--status-warn-soft, rgba(230, 162, 60, 0.12));
}

.git-A {
  color: var(--status-ok, #67c23a);
  background: var(--status-ok-soft, rgba(103, 194, 58, 0.12));
}

.git-D {
  color: var(--status-err, #f56c6c);
  background: var(--status-err-soft, rgba(245, 108, 108, 0.12));
}

.git-U {
  color: var(--text-muted);
  background: var(--surface-selected-soft);
}

.git-R {
  color: var(--info, #409eff);
  background: var(--info-soft, rgba(64, 158, 255, 0.12));
}

/* --- Agent 写入中黄点（闪烁） --- */
.write-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f7b500;
  box-shadow: 0 0 6px rgba(247, 181, 0, 0.8);
  flex-shrink: 0;
  margin-left: 4px;
  animation: write-blink 0.9s ease-in-out infinite;
}

@keyframes write-blink {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.25;
    transform: scale(0.7);
  }
}

.modified-dot {
  color: var(--status-warn);
  font-size: var(--fs-10);
  flex-shrink: 0;
  margin-left: 2px;
  animation: pulse 1.8s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
}

/* --- VS Code 风格翻译标签 --- */
.translation-tag {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: 6px;
}

.translation-label {
  font-size: 11px;
  color: var(--status-err);
  background: var(--status-err-soft);
  padding: 0 6px;
  border-radius: var(--radius-4);
  cursor: pointer;
  font-weight: 400;
  letter-spacing: 0.3px;
  transition: background 0.15s;
  line-height: 18px;
}

.translation-label:hover {
  background: var(--status-err-strong-bg);
}

.translation-edit {
  display: inline-flex;
  align-items: center;
}

.translation-input {
  background: var(--surface-tree-active);
  border: 1px solid var(--info-ring);
  color: var(--status-err);
  font-size: 11px;
  padding: 0 6px;
  border-radius: var(--radius-4);
  outline: none;
  font-family: inherit;
  min-width: 40px;
  height: 20px;
  line-height: 20px;
  box-shadow: 0 0 0 3px var(--info-ring-soft);
}

.translation-input:focus {
  border-color: var(--info-ring);
}

/* --- 悬停操作按钮 --- */
.actions {
  display: flex;
  gap: 1px;
  flex-shrink: 0;
  margin-left: 4px;
}

.action-btn {
  font-size: 12px;
  padding: 0 var(--space-4);
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.15s;
  line-height: 20px;
  color: var(--text-muted-2);
}

.action-btn:hover {
  opacity: 1;
  color: var(--text-strong-2);
}
</style>