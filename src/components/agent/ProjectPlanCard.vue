<!-- src/components/agent/ProjectPlanCard.vue -->
<!-- 项目计划报告卡片：可折叠（默认展开可收起），展示技术栈/类型/核心功能/预计文件，
     含规模档位选择（精简/标准/完整），用户选档后点"确认生成"或回复"行/可以"才提交后端任务 -->
<template>
  <div class="plan-card card-enter">
    <div class="plan-head">
      <span class="plan-title">📋 项目计划报告</span>
      <span v-if="justArrived" class="plan-badge">已生成</span>
      <button class="plan-toggle" @click="collapsed = !collapsed">
        {{ collapsed ? '展开' : '收起' }}
      </button>
    </div>

    <div v-show="!collapsed" class="plan-body">
      <div class="plan-row">
        <span class="plan-k">技术栈</span>
        <span class="plan-v">{{ plan.tech_stack || '—' }}</span>
      </div>
      <div class="plan-row">
        <span class="plan-k">项目类型</span>
        <span class="plan-v">{{ plan.project_type || '—' }}</span>
      </div>

      <div class="plan-sec">核心功能</div>
      <ul class="plan-list">
        <li v-for="(f, i) in features" :key="'f' + i"
            class="reveal-item" :style="{ animationDelay: (240 + i * 70) + 'ms' }">
          {{ f }}</li>
      </ul>

      <!-- 规模档位选择：切换时显示对应文件清单 -->
      <div class="plan-sec">规模选择</div>
      <div class="plan-scales">
        <button
          v-for="opt in scaleOptions"
          :key="opt.key"
          class="plan-scale"
          :class="{ active: selectedScale === opt.key }"
          @click="selectedScale = opt.key"
        >
          {{ opt.label }}
        </button>
      </div>

      <div class="plan-sec">预计文件（{{ scaleLabel }}）</div>
      <ul class="plan-files">
        <li v-for="(f, i) in files" :key="'p' + i"
            class="reveal-item" :style="{ animationDelay: (540 + i * 70) + 'ms' }">
          <code>{{ f.path }}</code>
          <span class="plan-fd">{{ f.desc }}</span>
        </li>
        <li v-if="files.length === 0" class="plan-none">（该档位暂无文件清单）</li>
      </ul>

      <div class="plan-actions">
        <button class="plan-go" @click="emit('confirm', selectedScale)">确认生成</button>
        <span class="plan-tip">或回复"行 / 可以"</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps({
  plan: { type: Object, default: null },
})

const emit = defineEmits(['confirm'])

const collapsed = ref(false)
const selectedScale = ref('standard')
// 入场"已生成"徽标：动画播完即隐藏（证明内容此刻生成，非贴模板）
const justArrived = ref(true)
onMounted(() => {
  setTimeout(() => { justArrived.value = false }, 1600)
})

const scaleOptions = [
  { key: 'slim', label: '精简（1-3 文件）' },
  { key: 'standard', label: '标准（5-10 文件）' },
  { key: 'full', label: '完整（全工程）' },
]

const features = computed(() =>
  Array.isArray(props.plan?.core_features) ? props.plan.core_features : [])

// 三档文件清单：优先 scale_plans[选中档]，兼容旧数据结构 file_structure
const files = computed(() => {
  const plans = props.plan?.scale_plans
  if (plans && typeof plans === 'object' && Array.isArray(plans[selectedScale.value])) {
    return plans[selectedScale.value]
  }
  if (Array.isArray(props.plan?.file_structure)) return props.plan.file_structure
  return []
})

const scaleLabel = computed(() => {
  const opt = scaleOptions.find((o) => o.key === selectedScale.value)
  return opt ? opt.label : ''
})

// 把当前选中档同步到 plan 对象（用户回复"行/可以"时拿默认档或此处记录档）
watch(selectedScale, (v) => {
  if (props.plan && typeof props.plan === 'object') props.plan.selectedScale = v
}, { immediate: true })
</script>

<style scoped>
@keyframes card-in {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}
@keyframes reveal-up {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}
.plan-card {
  background: var(--surface-panel-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-8);
  padding: var(--space-8) var(--space-12);
  margin: 2px 0;
transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
  animation: card-in 0.28s ease-out;
}
.plan-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px var(--shadow-soft);
  border-color: var(--border-mid);
}


.plan-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.plan-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.plan-toggle {
  background: var(--surface-raised);
  border: none;
  border-radius: var(--radius-4);
  color: var(--text-subtle);
  font-size: 12px;
  padding: var(--space-4) var(--space-8);
  cursor: pointer;
  font-family: inherit;
}

.plan-toggle:hover {
  color: var(--text-primary);
  background: var(--surface-tag);
}

.plan-body > * {
  animation: reveal-up 0.32s ease-out both;
}
.plan-body > :nth-child(1) { animation-delay: 60ms }
.plan-body > :nth-child(2) { animation-delay: 120ms }
.plan-body > :nth-child(3) { animation-delay: 180ms }
.plan-body > :nth-child(4) { animation-delay: 300ms }
.plan-body > :nth-child(5) { animation-delay: 360ms }
.plan-body > :nth-child(6) { animation-delay: 420ms }
.plan-body > :nth-child(7) { animation-delay: 480ms }
.plan-body > :nth-child(8) { animation-delay: 540ms }
.plan-body > :nth-child(9) { animation-delay: 700ms }
.reveal-item {
  animation: reveal-up 0.32s ease-out both;
}
.plan-badge {
  font-size: 10px;
  color: var(--success, #52c41a);
  background: color-mix(in srgb, var(--success, #52c41a) 12%, transparent);
  border-radius: 4px;
  padding: 1px 6px;
  animation: reveal-up 0.3s ease-out 0.15s both;
}
.plan-body {
  margin-top: 8px;
  min-width: 0;
}

.plan-row {
  display: flex;
  gap: 8px;
  font-size: 12px;
  margin: var(--space-4) 0;
  min-width: 0;
}

.plan-k {
  color: var(--text-quiet);
  flex-shrink: 0;
  width: 52px;
}

.plan-v {
  color: var(--text-primary);
  min-width: 0;
  overflow-wrap: break-word;
  word-break: break-all;
}

.plan-sec {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-subtle);
  margin: 8px 0 4px;
}

.plan-list {
  margin: 0;
  padding-left: var(--space-16);
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.7;
}

/* 规模档位选择 */
.plan-scales {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.plan-scale {
  background: var(--surface-window);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-subtle);
  font-size: var(--fs-12);
  padding: var(--space-4) var(--space-8);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.12s;
}

.plan-scale:hover {
  border-color: var(--info);
  color: var(--text-primary);
}

.plan-scale.active {
  background: var(--info-subtle);
  border-color: var(--info);
  color: var(--info);
  font-weight: 500;
}

.plan-files {
  margin: 0;
  padding-left: var(--space-16);
  list-style: none;
}

.plan-files li {
  font-size: 12px;
  line-height: 1.8;
  display: flex;
  gap: 8px;
  align-items: baseline;
  min-width: 0;
}

.plan-files code {
  color: var(--info);
  background: var(--surface-window);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 0 var(--space-4);
  font-size: 11px;
  min-width: 0;
  max-width: 100%;
  flex-shrink: 1;
  overflow-wrap: anywhere;
  word-break: break-all;
}

.plan-fd {
  color: var(--text-quiet);
  font-size: 11px;
  min-width: 0;
  overflow-wrap: break-word;
}

.plan-none {
  color: var(--text-quiet);
  font-size: var(--fs-12);
}

.plan-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: var(--space-8);
}

.plan-go {
  background: var(--info);
  border: none;
  border-radius: 6px;
  color: var(--text-inverse);
  font-size: 13px;
  font-weight: 500;
  padding: var(--space-8) var(--space-16);
  cursor: pointer;
  font-family: inherit;
}

.plan-go:hover {
  background: var(--info-hover-2);
}

.plan-tip {
  font-size: 11px;
  color: var(--text-quiet);
}
</style>
