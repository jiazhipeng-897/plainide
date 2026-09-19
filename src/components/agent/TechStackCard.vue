<!-- src/components/agent/TechStackCard.vue -->
<!-- 技术栈确认卡片：dev 任务缺技术栈时由 agent.vue 渲染，用户拍板后触发开发 -->
<template>
  <div class="tech-stack-card card-enter">
    <div class="ts-title">⚙️ 技术栈确认</div>
    <div class="ts-hint">根据你的需求，可选技术栈如下：</div>
    <div class="ts-options">
      <button
        v-for="opt in options"
        :key="opt.id"
        class="ts-option"
        :class="{ selected: selectedId === opt.id }"
        @click="selectedId = opt.id"
      >
        <span class="ts-radio">{{ selectedId === opt.id ? '◉' : '○' }}</span>
        <span class="ts-name">{{ opt.name }}</span>
        <span class="ts-desc">{{ opt.desc }}</span>
      </button>
    </div>
    <div class="ts-actions">
      <button class="ts-btn ts-btn-primary" @click="confirm">就用这个，开始开发</button>
      <button class="ts-btn ts-btn-plain" @click="confirmRecommended" title="使用推荐项直接开始">你决定</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  options: { type: Array, default: () => [] },
  recommended: { type: Object, default: null },
})

const emit = defineEmits(['confirm'])

const selectedId = ref(props.recommended?.id || props.options[0]?.id || '')

// 转纯对象：props 来自响应式数据（Vue proxy），透传给 Electron IPC 前必须脱代理
const toPlain = (o) => (o ? { id: o.id, name: o.name, desc: o.desc, form: o.form } : null)

const selected = () =>
  props.options.find((o) => o.id === selectedId.value) || props.recommended || props.options[0] || null

const confirm = () => {
  const s = selected()
  if (s) emit('confirm', toPlain(s))
}
const confirmRecommended = () => {
  const s = props.recommended || props.options[0] || null
  if (s) emit('confirm', toPlain(s))
}
</script>

<style scoped>
@keyframes card-in {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}
.tech-stack-card {
  animation: card-in 0.28s ease-out;
  background: var(--surface-panel-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-8);
  padding: var(--space-8) var(--space-12);
  margin: 2px 0;
transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
}
.tech-stack-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px var(--shadow-soft);
  border-color: var(--border-mid);
}


.ts-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.ts-hint {
  font-size: 12px;
  color: var(--text-subtle);
  margin: 4px 0 8px;
}

.ts-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ts-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: var(--space-8) var(--space-8);
  background: var(--surface-window);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-8);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  font-family: inherit;
}

.ts-option:hover {
  border-color: var(--info);
}

.ts-option.selected {
  border-color: var(--info);
  background: var(--info-soft);
}

.ts-radio {
  font-size: 12px;
  color: var(--info);
  flex-shrink: 0;
}

.ts-name {
  font-weight: 500;
  flex-shrink: 0;
}

.ts-desc {
  font-size: 11px;
  color: var(--text-quiet);
  margin-left: auto;
  text-align: right;
}

.ts-actions {
  display: flex;
  gap: 8px;
  margin-top: var(--space-8);
}

.ts-btn {
  flex: 1;
  padding: var(--space-8) 0;
  border-radius: 6px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
  font-family: inherit;
}

.ts-btn-primary {
  background: var(--info);
  color: var(--text-inverse);
  font-weight: 500;
}

.ts-btn-primary:hover {
  background: var(--info-hover-2);
}

.ts-btn-plain {
  background: var(--surface-raised);
  color: var(--text-subtle);
}

.ts-btn-plain:hover {
  background: var(--surface-tag);
  color: var(--text-primary);
}
</style>
