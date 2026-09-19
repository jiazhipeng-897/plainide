<template>
  <div class="var-node">
    <div
      class="var-row"
      :class="{ expandable: hasChildren }"
      @click="hasChildren && toggle()"
    >
      <span class="var-caret" :class="{ open: expanded && hasChildren }">
        {{ hasChildren ? (expanded ? '▾' : '▸') : '' }}
      </span>
      <span class="var-name">{{ variable.name }}</span>
      <span class="var-eq">=</span>
      <span class="var-value" :class="{ 'v-hint': variable.variablesReference }">
        {{ shortValue }}
      </span>
      <span v-if="variable.type && variable.type !== variable.name" class="var-type">
        {{ variable.type }}
      </span>
    </div>
    <div v-if="expanded && children !== null" class="var-children">
      <template v-if="children.length">
        <VarNode
          v-for="(c, i) in children"
          :key="c.variablesReference + '-' + c.name + '-' + i"
          :variable="c"
          :depth="depth + 1"
        />
      </template>
      <div v-else class="var-empty">（空）</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useDebugStore } from '@/stores/debug'

const props = defineProps({
  variable: { type: Object, required: true },
  depth: { type: Number, default: 0 },
})

const debugStore = useDebugStore()
const expanded = ref(false)
const children = ref(null)
const loading = ref(false)

const hasChildren = computed(() => !!props.variable.variablesReference)
const shortValue = computed(() => {
  const v = props.variable.value
  if (v === undefined || v === null) return ''
  const s = String(v)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
})

const toggle = async () => {
  if (expanded.value) {
    expanded.value = false
    return
  }
  expanded.value = true
  if (children.value === null && !loading.value) {
    loading.value = true
    try {
      children.value = await debugStore.fetchVariables(props.variable.variablesReference)
    } finally {
      loading.value = false
    }
  }
}

watch(
  () => props.variable.variablesReference,
  () => {
    expanded.value = false
    children.value = null
  }
)
</script>

<style scoped>
.var-node { font-size: 12px; }
.var-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 1px 8px 1px 0;
  color: var(--text-status);
  white-space: nowrap;
  overflow: hidden;
}
.var-row.expandable { cursor: pointer; }
.var-row.expandable:hover { background: rgba(78, 201, 176, 0.07); }
.var-caret {
  width: 14px;
  text-align: center;
  color: var(--text-muted);
  font-size: 10px;
  flex-shrink: 0;
  transition: transform 0.12s;
}
.var-caret.open { transform: rotate(0deg); }
.var-name { color: #9CDCFE; flex-shrink: 0; }
.var-eq { color: var(--text-muted); flex-shrink: 0; }
.var-value {
  color: #CE9178;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.var-value.v-hint { color: #B5CEA8; }
.var-type { color: var(--text-muted); font-size: 11px; flex-shrink: 0; }
.var-children { padding-left: 14px; }
.var-empty { color: var(--text-muted); padding: 1px 8px; font-size: 11px; }
</style>
