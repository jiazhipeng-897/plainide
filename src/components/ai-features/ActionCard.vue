<!-- ActionCard.vue -->
<template>
  <div class="action-card" :class="{ active }" @click="$emit('click')">
    <div class="card-icon">{{ icon }}</div>
    <div class="card-text">{{ label }}</div>
  </div>
</template>

<script setup>
defineProps({
  icon: String,
  label: String,
  active: Boolean,
})
defineEmits(['click'])
</script>

<style scoped>
.action-card {
  flex: 1;
  height: 52px;
  background: var(--surface-panel-1);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
}
.action-card:hover:not(.active) {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px var(--shadow-soft);
  border-color: var(--border-mid);
}

.action-card:hover {
  background: var(--surface-panel-2);
  border-color: var(--surface-debug);
}
.action-card.active {
  background: var(--surface-panel-2);
  border-color: var(--info);
  box-shadow: 0 0 0 1px var(--info);
}
.card-icon {
  font-size: 16px;
  margin-bottom: 2px;
}
.card-text {
  font-size: 11px;
  color: var(--text-subtle);
}
.action-card.active .card-text {
  color: var(--text-strong);
}
</style>