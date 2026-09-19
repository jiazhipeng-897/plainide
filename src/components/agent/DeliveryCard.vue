<template>
  <div class="dc-card card-enter">
    <div class="dc-title">📦 项目已完成，选择交付方式</div>
    <div class="dc-sub">不选则保持源码开发模式，随时可再打包</div>
    <div class="dc-actions">
      <button class="dc-btn dc-btn-primary" @click="$emit('package')">
        打包成单独 EXE
      </button>
      <button class="dc-btn dc-btn-plain" @click="$emit('keep')">
        源码开发模式（当前项目文件）
      </button>
    </div>
  </div>
</template>

<script setup>
defineEmits(['package', 'keep'])
</script>

<style scoped>
@keyframes card-in {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}
.dc-card {
  animation: card-in 0.28s ease-out;
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: var(--space-12) var(--space-12);
  font-size: 12px;
  line-height: 1.6;
  max-width: 520px;
transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
}
.dc-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px var(--shadow-soft);
  border-color: var(--border-mid);
}

.dc-title {
  color: var(--text-soft);
  font-weight: 600;
  font-size: 13px;
}
.dc-sub {
  color: var(--text-desc);
  font-size: 11px;
  margin-top: 2px;
}
.dc-actions {
  display: flex;
  gap: 8px;
  margin-top: var(--space-8);
  flex-wrap: wrap;
}
.dc-btn {
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-soft);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.dc-btn:hover {
  border-color: var(--info);
  color: var(--info);
}
.dc-btn-primary {
  border-color: var(--info);
  color: var(--info);
}
.dc-btn-primary:hover {
  background: var(--info-subtle);
}
.dc-btn-plain:hover {
  border-color: var(--text-desc);
  color: var(--text-desc);
}
</style>
