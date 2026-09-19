<template>
  <div class="ast-tree">
    <div class="ast-header">
      <span>🌳 AST语法树</span>
      <div class="header-right">
        <span v-if="filePath" class="file-path">{{ filePath }}</span>
        <button class="copy-btn" :class="{ copied }" :disabled="!treeData.length" @click="copyTree">
          {{ copied ? '✓ 已复制' : '复制树' }}
        </button>
      </div>
    </div>
    <div class="ast-body">
      <div v-if="treeData.length > 0" class="tree-view">
        <TreeNode
          v-for="(node, index) in treeData"
          :key="index"
          :node="node"
          :depth="0"
        />
      </div>
      <div v-else class="empty">暂无数据，请打开文件</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useEditorStore } from '@/stores/editor'
import TreeNode from './TreeNode.vue'

const editorStore = useEditorStore()

const astData = computed(() => editorStore.astTree)
const filePath = computed(() => astData.value?.file || '')

// 后端已返回嵌套树（v3），直接渲染 children，不再前端按行号猜层级
const treeData = computed(() => astData.value?.children || [])

// ========== 复制树：序列化为结构化文本 ==========
const copied = ref(false)

const TYPE_LABELS = {
  class_definition: 'class',
  class_declaration: 'class',
  method_definition: 'method',
  function_definition: 'function',
  function_declaration: 'function',
  field_definition: 'field',
  import_statement: 'import',
  interface_declaration: 'interface',
  type_alias_declaration: 'type',
}

function typeLabel(node) {
  const t = node.nodeType || node.type || ''
  return TYPE_LABELS[t] || t.replace(/_/g, ' ')
}

function serializeTree(nodes, depth = 0) {
  const lines = []
  for (const node of nodes) {
    const name = node.name || node.type || 'unknown'
    const params = node.params?.length ? `(${node.params.join(', ')})` : ''
    const line = node.start?.line || node.start_line || node.lineno
    const parts = [`${name}${params}`]
    if (typeLabel(node)) parts.push(`[${typeLabel(node)}]`)
    if (line) parts.push(`[行${line}]`)
    lines.push('  '.repeat(depth) + parts.join(' '))
    if (node.children?.length) {
      lines.push(...serializeTree(node.children, depth + 1))
    }
  }
  return lines.join('\n')
}

async function copyTree() {
  const text = serializeTree(treeData.value)
  try {
    await navigator.clipboard.writeText(text)
  } catch (err) {
    // Electron/无剪贴板权限回退
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<style scoped>
.ast-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-window);
  font-size: 13px;
}

.ast-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-12);
  height: 30px;
  background: var(--surface-panel-1);
  border-bottom: 1px solid var(--border-default);
  color: var(--text-primary);
  font-size: 13px;
  flex-shrink: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.file-path {
  color: var(--info);
  font-size: 12px;
  font-weight: 400;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-btn {
  flex-shrink: 0;
  height: 20px;
  padding: 0 var(--space-8);
  border: 1px solid var(--border-ast);
  border-radius: 4px;
  background: var(--surface-panel-4);
  color: var(--code-sym-import);
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  transition: all 0.15s;
}

.copy-btn:hover:not(:disabled) {
  background: var(--surface-node);
  border-color: var(--info);
}

.copy-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.copy-btn.copied {
  border-color: var(--code-sym-var);
  color: var(--code-sym-var);
}

.ast-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.ast-body::-webkit-scrollbar {
  width: 6px;
}

.ast-body::-webkit-scrollbar-thumb {
  background: var(--surface-raised);
  border-radius: var(--radius-4);
}

.empty {
  color: var(--text-subtle);
  text-align: center;
  padding: 60px 0; /* scale-exempt: layout-outliers */
  font-size: 14px;
}

.tree-view {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  padding: 2px 0;
}
</style>
