<template>
  <div class="change-group">
    <div class="change-group-title">
      {{ title }}
      <span class="change-count">{{ items.length }}</span>
    </div>
    <div class="change-list">
      <div v-for="item in items" :key="item.path" class="change-item">
        <span class="change-status" :style="{ color: statusColor(item.status) }">{{ item.status }}</span>
        <span class="change-path" :title="item.path">{{ item.path }}</span>
        <div class="change-ops">
          <button
            class="op-btn"
            :title="untracked ? '暂存' : staged ? '取消暂存' : '暂存'"
            @click="emit('stage', item)"
          >
            {{ staged ? '－' : '＋' }}
          </button>
          <button v-if="!untracked" class="op-btn" title="查看改动" @click="emit('diff', item)">
            ⌕
          </button>
          <button
            v-if="!staged && !untracked"
            class="op-btn discard"
            title="丢弃改动"
            @click="emit('discard', item)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  title: String,
  items: Array,
  staged: Boolean,
  untracked: Boolean,
})

const emit = defineEmits(['stage', 'diff', 'discard'])

const statusColor = (s) =>
  ({ M: 'var(--status-warn)', A: 'var(--status-ok)', D: 'var(--status-err)', U: 'var(--text-muted)', R: 'var(--info)' }[s] || 'var(--text-muted)')
</script>

<style scoped>
.change-group-title {
  font-size: 11px;
  color: var(--text-muted);
  padding: 6px 12px 2px;
  font-weight: 600;
}

.change-count {
  color: var(--text-subtle);
}

.change-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  cursor: default;
}

.change-item:hover {
  background: var(--surface-selected-soft);
}

.change-status {
  font-weight: 700;
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.change-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.change-ops {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.change-item:hover .change-ops {
  opacity: 1;
}

.op-btn {
  border: none;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  font-size: 12px;
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1;
}

.op-btn:hover {
  color: var(--info);
  background: var(--info-subtle);
}

.op-btn.discard:hover {
  color: var(--status-err);
  background: var(--status-err-subtle);
}
</style>
