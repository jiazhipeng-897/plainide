<template>
  <div class="tree-node">
    <div
      class="node-row"
      :class="{ 'is-expanded': isExpanded, 'has-children': hasChildren }"
      :style="{ paddingLeft: paddingLeft + 'px' }"
    >
      <span
        class="chevron"
        :class="{ 'is-visible': hasChildren }"
        @click.stop="handleClick"
      >{{ chevron }}</span>
      <span class="node-icon" :class="icon.cls">{{ icon.ch }}</span>
      <span class="node-name" :class="textCls">{{ displayName }}</span>
      <span v-if="params.length" class="node-params">({{ paramsText }})</span>
      <span class="node-line">{{ lineText }}</span>
    </div>
    <div v-if="hasChildren && isExpanded" class="node-children">
      <TreeNode
        v-for="(child, index) in children"
        :key="index"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  node: {
    type: Object,
    required: true,
  },
  depth: {
    type: Number,
    default: 0,
  },
})

const isExpanded = ref(true)

const children = computed(() => props.node.children || [])
const hasChildren = computed(() => children.value.length > 0)
const paddingLeft = computed(() => props.depth * 16 + 8)

const displayName = computed(() => {
  return props.node.name || props.node.type || props.node.nodeType || 'unknown'
})

const params = computed(() => props.node.params || [])
const paramsText = computed(() => params.value.join(', '))

const lineNum = computed(() => {
  return props.node.start?.line || props.node.start_line || props.node.lineno || null
})

const lineText = computed(() => (lineNum.value ? `行 ${lineNum.value}` : ''))

const chevron = computed(() => {
  if (!hasChildren.value) return ''
  return isExpanded.value ? '▾' : '▸'
})

// ========== VSCode 风格图标映射 ==========
const icon = computed(() => {
  const t = (props.node.nodeType || props.node.type || '').toLowerCase()
  if (t.includes('class')) return { ch: 'C', cls: 'icon-class' }
  if (t.includes('interface')) return { ch: 'I', cls: 'icon-interface' }
  if (t.includes('type_alias')) return { ch: 'T', cls: 'icon-type' }
  if (t.includes('import')) return { ch: '⇢', cls: 'icon-import' }
  if (t.includes('method')) return { ch: '◆', cls: 'icon-method' }
  if (t.includes('function')) return { ch: 'ƒ', cls: 'icon-function' }
  if (t.includes('field')) return { ch: '≡', cls: 'icon-field' }
  return { ch: '•', cls: 'icon-statement' }
})

const textCls = computed(() => {
  const t = (props.node.nodeType || props.node.type || '').toLowerCase()
  if (t.includes('class')) return 'text-class'
  if (t.includes('interface') || t.includes('type_alias')) return 'text-interface'
  if (t.includes('import')) return 'text-import'
  if (t.includes('function') || t.includes('method')) return 'text-function'
  if (t.includes('field')) return 'text-field'
  return 'text-default'
})

const handleClick = () => {
  if (hasChildren.value) {
    isExpanded.value = !isExpanded.value
  }
}
</script>

<style scoped>
.tree-node {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
}

/* 单行：VSCode 大纲行高 */
.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  line-height: 22px;
  padding-right: 12px;
  cursor: default;
  color: var(--text-primary);
  white-space: nowrap;
}

.node-row:hover {
  background: var(--surface-tree-hover);
}

/* 展开箭头：VSCode chevron 风格 */
.chevron {
  display: inline-block;
  width: 12px;
  flex-shrink: 0;
  color: var(--text-icon);
  font-size: 10px;
  text-align: center;
  visibility: hidden;
  transition: color 0.1s;
  cursor: pointer;
}

.chevron.is-visible {
  visibility: visible;
}

.node-row:hover .chevron {
  color: var(--text-primary);
}

/* 类型图标 */
.node-icon {
  display: inline-block;
  width: 18px;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  font-style: normal;
}

.icon-class     { color: var(--code-sym-var); }   /* 类：青绿 */
.icon-interface { color: var(--code-sym-interface); }   /* 接口：紫 */
.icon-type      { color: var(--info); }   /* 类型别名：蓝 */
.icon-import    { color: var(--code-sym-import); }   /* 导入：浅蓝 */
.icon-method    { color: var(--code-sym-func); }   /* 方法：黄 */
.icon-function  { color: var(--code-sym-func); }   /* 函数：黄 */
.icon-field     { color: var(--code-sym-field); }   /* 字段：绿 */
.icon-statement { color: var(--text-faint); }   /* 语句：灰 */

/* 名称颜色 */
.text-class     { color: var(--code-sym-var); font-weight: 500; }
.text-interface { color: var(--code-sym-interface); }
.text-import    { color: var(--code-sym-import); }
.text-function  { color: var(--code-sym-func); }
.text-field     { color: var(--code-sym-import); }
.text-default   { color: var(--text-primary); }

.node-name {
  flex-shrink: 0;
  max-width: 70%;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 参数：灰色小字 */
.node-params {
  color: var(--text-subtle);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 行号：右对齐灰色 */
.node-line {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 11px;
}

/* 子层级：VSCode 缩进参考线 */
.node-children {
  border-left: 1px solid var(--border-guide);
  margin-left: 8px;
}
</style>
