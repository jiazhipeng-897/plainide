<!-- FuncToolbar.vue -->
<template>
  <div class="func-row-1">
    <div
      class="row-1-btn left-btn"
      :class="{ loading: formatLoading }"
      @click="$emit('format')"
    >
      <span v-if="!formatLoading">⚙️ 格式化</span>
      <span v-else>格式化中...</span>
    </div>
    <div
      class="row-1-btn right-btn"
      :class="{ loading: doctorLoading }"
      @click="$emit('doctor')"
    >
      <span v-if="!doctorLoading">🛠️ 代码医生</span>
      <span v-else>AI处理中...</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  formatLoading: Boolean,
  doctorLoading: Boolean,
})
defineEmits(['format', 'doctor'])
</script>

<style scoped>
.func-row-1 {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.row-1-btn {
  flex: 1;
  height: 32px;
  border-radius: 6px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;
  user-select: none;
}
.left-btn {
  background: var(--surface-toolbar);
  color: var(--text-soft);
  border: 1px solid var(--border-toolbar);
}
.left-btn:hover {
  background: var(--surface-toolbar-hover);
}
.right-btn {
  background: var(--status-warn-badge);
  color: var(--status-warn);
  border: 1px solid var(--status-warn-badge-border);
}
.right-btn:hover {
  background: var(--status-warn-badge-2);
}
.row-1-btn.loading {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>