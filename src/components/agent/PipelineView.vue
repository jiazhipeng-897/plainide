<!-- PipelineView.vue —— Agent 工作链路渲染（VSCode 风格纵向时间线） -->
<template>
  <div class="pv">
    <div class="pv-header" @click="collapsed = !collapsed">
      <span class="pv-arrow">{{ collapsed ? '▸' : '▾' }}</span>
      <span class="pv-title">
        <span class="pv-title-text">{{ modeTitle }}</span>
        <span v-if="tierBadge" class="pv-tier-badge" :class="tierBadge.cls">{{ tierBadge.text }}</span>
      </span>
      <span v-if="pipeline.status" class="pv-status" :class="pipeline.status">{{ statusText }}</span>
      <span v-if="pipeline.total_ms" class="pv-time">{{ fmtMs(pipeline.total_ms) }}</span>
      <button
        v-if="pipeline.status === 'running' && pipeline.task_id"
        class="pv-pause"
        title="暂停流水线（可随时继续）"
        @click.stop="emit('pause')"
      >⏸ 暂停</button>
      <button
        v-if="pipeline.status === 'paused' && pipeline.task_id"
        class="pv-resume"
        title="从挂起点继续执行"
        @click.stop="emit('resume')"
      >▶ 继续</button>
      <button
        v-if="(pipeline.status === 'running' || pipeline.status === 'paused') && pipeline.task_id"
        class="pv-cancel"
        title="终止流水线（已生成文件保留）"
        @click.stop="emit('cancel')"
      >⏹ 取消</button>
    </div>

    <template v-if="!collapsed">
    <div v-if="pipeline.mode === 'chat'" class="pv-chat-note">💬 普通对话模式，未触发 Agent 工作链路</div>

    <!-- question 工具：agent 执行中提问（Debugger 等），等用户回答 -->
    <div v-if="pipeline.pendingQuestion" class="pv-question-card">
      <div class="pv-question-title">
        <span class="pv-question-badge">❓</span>
        <span class="pv-question-label">Agent 需要你确认</span>
      </div>
      <div class="pv-question-text">{{ pipeline.pendingQuestion.question }}</div>
      <div v-if="pipeline.pendingQuestion.options && pipeline.pendingQuestion.options.length" class="pv-question-options">
        <button
          v-for="opt in pipeline.pendingQuestion.options"
          :key="opt"
          class="pv-question-opt"
          @click="submitAnswer(opt)"
        >{{ opt }}</button>
      </div>
      <div class="pv-question-input-row">
        <input
          v-model="answerDraft"
          class="pv-question-input"
          placeholder="输入你的回答…"
          @keyup.enter="submitAnswer(answerDraft)"
        />
        <button class="pv-question-submit" :disabled="sendingAnswer" @click="submitAnswer(answerDraft)">
          {{ sendingAnswer ? '提交中…' : '提交' }}
        </button>
      </div>
    </div>

    <div v-if="pipeline.status === 'running' && currentAction" class="pv-action-flow">
      <span class="pv-action-spin">⟳</span>
      <span class="pv-action-text">正在写入 <b class="pv-action-path">{{ displayPath(currentAction.path) }}</b></span>
      <span class="pv-action-cursor"></span>
    </div>

    <div class="pv-stages">
      <div
        v-for="(stage, index) in pipeline.stages"
        :key="stage.key"
        class="pv-stage"
        :class="stage.status"
      >
        <div class="pv-line">
          <span class="pv-dot">{{ dotIcon(stage.status) }}</span>
          <span v-if="index < pipeline.stages.length - 1" class="pv-connector"></span>
        </div>
        <div class="pv-body" :class="{ 'pv-body-closed': canCollapse(stage) && !isStageExpanded(stage) }" @click="toggleStage(stage)">
          <div class="pv-name-row">
            <span class="pv-label">{{ stage.label }}</span>
            <span v-if="stage.agent" class="pv-agent">{{ stage.agent }}</span>
            <span v-if="stageProgress[stage.key]" class="pv-progress">{{ stageProgress[stage.key].done }}/{{ stageProgress[stage.key].total }}</span>
            <span v-if="stage.duration_ms" class="pv-dur">{{ fmtMs(stage.duration_ms) }}</span>
            <span v-if="canCollapse(stage)" class="pv-expand-hint">{{ isStageExpanded(stage) ? '收起 ▴' : '展开 ▾' }}</span>
          </div>
          <template v-if="isStageExpanded(stage)">
            <div v-if="stage.summary" class="pv-summary">{{ stage.summary }}</div>
            <div v-if="stage.error" class="pv-error">{{ stage.error }}</div>
          </template>
          <div v-else class="pv-summary pv-summary-clamp">{{ stage.summary || stage.error }}</div>
        </div>
      </div>
    </div>

    <div v-if="pipeline.artifacts.length" class="pv-artifacts">
      <div class="pv-artifacts-title">📦 已生成 {{ pipeline.artifacts.length }} 个文件（项目内）</div>
      <div
        v-for="(file, index) in pipeline.artifacts.slice(0, 6)"
        :key="index"
        class="pv-artifact"
        :title="file.path"
      >
        <span class="pv-artifact-icon">📄</span>
        <span class="pv-artifact-path">{{ displayPath(file.path) }}</span>
        <span v-if="file.line_count" class="pv-lines">+{{ file.line_count }} 行</span>
        <span class="pv-artifact-size">{{ fmtSize(file.size) }}</span>
      </div>
      <div v-if="pipeline.artifacts.length > 6" class="pv-artifacts-more">
        … 还有 {{ pipeline.artifacts.length - 6 }} 个文件
      </div>
    </div>
    <div v-if="pipeline.changes.length" class="pv-changes">
      <div class="pv-artifacts-title">📝 变更文件（{{ pipeline.changes.length }}）</div>
      <div
        v-for="(ch, index) in pipeline.changes.slice(0, 8)"
        :key="'ch-' + index"
        class="pv-change"
        :title="ch.path"
      >
        <span class="pv-change-icon">{{ ch.event === 'file_created' ? '🆕' : '✏️' }}</span>
        <span class="pv-change-path">{{ displayPath(ch.path) }}</span>
        <span v-if="ch.line_count" class="pv-lines">+{{ ch.line_count }} 行</span>
        <span class="pv-artifact-size">{{ fmtSize(ch.size) }}</span>
      </div>
      <div v-if="pipeline.changes.length > 8" class="pv-artifacts-more">
        … 还有 {{ pipeline.changes.length - 8 }} 个文件
      </div>
    </div>

    <div v-if="snapshots.length" class="pv-snaps">
      <div class="pv-artifacts-title">🕘 快照（可回滚 · {{ snapshots.length }}）</div>
      <div v-for="(s, index) in snapshots.slice(0, 5)" :key="'snap-' + index" class="pv-snap" :title="(s.files || []).join(', ')">
        <span class="pv-snap-kind">{{ s.kind === 'pre-restore' ? '↩️' : '📸' }}</span>
        <span class="pv-snap-info">#{{ s.step }} · {{ (s.files || []).length }} 文件 · {{ fmtSize(s.size_bytes) }} · {{ s.ts }}</span>
        <button class="pv-snap-btn" @click="$emit('restore-step', s.step)">恢复</button>
      </div>
      <div class="pv-snaps-actions">
        <span v-if="snapshots.length > 5" class="pv-artifacts-more">… 还有 {{ snapshots.length - 5 }} 个</span>
        <button class="pv-snap-btn pv-snap-btn-danger" @click="$emit('clear-snapshots')">清理全部快照</button>
      </div>
    </div>

    <div v-if="pipeline.token_usage && pipeline.token_usage.total_tokens > 0" class="pv-token">
      🧾 Token：{{ fmtTokens(pipeline.token_usage.total_tokens) }}
      <span v-if="pipeline.token_usage.estimated" class="pv-token-est">（估算）</span>
      <span class="pv-token-sub">· {{ pipeline.token_usage.calls }} 次调用</span>
    </div>

    <div
      v-for="(exec, index) in pipeline.toolExecs"
      :key="index"
      class="pv-tool"
    >
      <div class="pv-tool-title">
        🔧 终端执行
        <span v-if="exec.status === 'running'" class="pv-tool-status running">运行中</span>
        <span v-else-if="exec.exit_code === 0" class="pv-tool-status ok">exit 0</span>
        <span v-else class="pv-tool-status fail">exit {{ exec.exit_code }}</span>
        <span v-if="exec.duration_ms" class="pv-tool-dur">{{ fmtMs(exec.duration_ms) }}</span>
      </div>
      <div class="pv-tool-cmd" :class="{ running: exec.status === 'running' }">$ {{ exec.cmd }}</div>
      <div v-if="exec.output" class="pv-tool-output">{{ exec.output }}</div>
    </div>

    <div v-if="pipeline.error && pipeline.status === 'failed'" class="pv-fail">
      ❌ {{ pipeline.error }}
    </div>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'

const props = defineProps({
  pipeline: {
    type: Object,
    required: true,
  },
  snapshots: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['cancel', 'pause', 'resume', 'restore-step', 'clear-snapshots'])

// question 工具：回答 agent 执行中的提问（经 IPC → POST /orchestrator/answer）
const answerDraft = ref('')
const sendingAnswer = ref(false)
async function submitAnswer(answer) {
  const text = String(answer ?? '').trim()
  if (!text || sendingAnswer.value) return
  const pq = props.pipeline.pendingQuestion
  if (!pq) return
  sendingAnswer.value = true
  try {
    await window.electronAPI.agentAnswerQuestion({
      taskId: props.pipeline.task_id,
      questionId: pq.question_id,
      answer: text,
    })
    props.pipeline.pendingQuestion = null
    answerDraft.value = ''
  } catch (e) {
    console.error('[PipelineView] 回答提交失败:', e)
  } finally {
    sendingAnswer.value = false
  }
}

// 折叠状态：默认折叠，点击头部展开（用户想看时再点开，不强制显示）
const collapsed = ref(true)

// 逐节点折叠（Trae 风格）：已完成/失败节点默认折叠成一行摘要，点击展开看详情
const expandedStages = reactive(new Set())
const canCollapse = (stage) => stage.status === 'done' || stage.status === 'failed'
const isStageExpanded = (stage) =>
  expandedStages.has(stage.key) || !canCollapse(stage)
const toggleStage = (stage) => {
  if (!canCollapse(stage)) return
  if (expandedStages.has(stage.key)) expandedStages.delete(stage.key)
  else expandedStages.add(stage.key)
}

// 阶段内子任务进度（开发阶段文件级 done/total）
const stageProgress = computed(() => props.pipeline.stageProgress || {})
// 当前动作：正在写入哪个文件（动作流小字）
const currentAction = computed(() => {
  const acts = props.pipeline.actions || []
  return acts.length ? acts[acts.length - 1] : null
})

const modeTitle = computed(() => {
  if (props.pipeline.mode === 'chat') return '💬 聊天'
  if (props.pipeline.mode === 'plan') return '🏗 架构规划'
  return '🤖 Agent 工作链路'
})

// 前置分诊徽标：t1 快捷链路 / t2 轻量 / t3 标准 / t4 完整
const tierBadge = computed(() => {
  const map = {
    t1: { text: '⚡ T1 快捷链路', cls: 'pv-tier-t1' },
    t2: { text: '🚀 T2 轻量链路', cls: 'pv-tier-t2' },
    t3: { text: '🔧 T3 标准链路', cls: 'pv-tier-t3' },
    t4: { text: '🏗 T4 完整链路', cls: 'pv-tier-t4' },
  }
  return map[props.pipeline.tier] || null
})

const statusText = computed(() => {
  const map = { running: '⏳ 执行中', paused: '⏸️ 已暂停', done: '✅ 已完成', failed: '❌ 失败', cancelled: '⏹️ 已取消' }
  return map[props.pipeline.status] || ''
})

const dotIcon = (status) => {
  if (status === 'running') return '⟳'
  if (status === 'done') return '✓'
  if (status === 'failed') return '✗'
  return ''
}

const fmtMs = (ms) => {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// P0 token 显示：千位转 K（如 12345 -> 12.3K）
const fmtTokens = (n) => {
  if (!n) return '0'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

// 路径只显示项目根之后的部分
const displayPath = (fullPath) => {
  if (!fullPath) return ''
  const normalized = String(fullPath).replace(/\\/g, '/')
  const parts = normalized.split('/')
  if (parts.length <= 3) return normalized
  return parts.slice(-3).join('/')
}

const fmtSize = (size) => {
  if (!size && size !== 0) return ''
  if (size < 1024) return `${size}B`
  return `${(size / 1024).toFixed(1)}KB`
}
</script>

<style scoped>
.pv {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-8);
  background: var(--surface-panel-1);
  overflow: hidden;
}

.pv-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: var(--surface-panel-4);
  border-bottom: 1px solid var(--border-default);
  font-size: var(--fs-13);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.pv-header:hover {
  background: var(--surface-panel-5);
}

.pv-arrow {
  font-size: 15px;
  line-height: 1;
  color: var(--text-secondary);
  font-weight: 700;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  transition: transform 0.15s, color 0.15s;
}
.pv-header:hover .pv-arrow {
  color: var(--info);
}

.pv-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-primary);
  font-weight: 600;
}
.pv-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}
.pv-title .pv-tier-badge {
  flex-shrink: 0;
  white-space: nowrap;
}

.pv-status {
  font-size: 11px;
  padding: var(--space-2) var(--space-8);
  border-radius: 8px;
  background: var(--surface-window);
  border: 1px solid var(--border-default);
}

.pv-status.running { color: var(--info); border-color: var(--pv-running-border); }
.pv-status.paused  { color: var(--status-paused); border-color: var(--pv-paused-border); }
.pv-status.done    { color: var(--code-sym-var); border-color: var(--pv-done-border); }
.pv-status.failed  { color: var(--status-failed); border-color: var(--pv-failed-border); }
.pv-status.cancelled { color: var(--status-paused); border-color: var(--pv-paused-border); }

.pv-pause,
.pv-resume {
  margin-left: 4px;
  background: var(--info-soft);
  border: 1px solid var(--pv-running-border);
  border-radius: 6px;
  color: var(--info);
  font-size: 11px;
  padding: var(--space-2) var(--space-8);
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
  transition: background 0.12s;
}

.pv-pause:hover,
.pv-resume:hover {
  background: var(--pv-running-soft-2);
}

.pv-cancel {
  margin-left: 4px;
  background: var(--pv-failed-soft);
  border: 1px solid var(--pv-failed-border);
  border-radius: 6px;
  color: var(--status-failed);
  font-size: 11px;
  padding: var(--space-2) var(--space-8);
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
  transition: background 0.12s;
}

.pv-cancel:hover {
  background: var(--pv-failed-soft-3);
}

.pv-time {
  margin-left: auto;
  white-space: nowrap;
  color: var(--text-faint);
  font-size: 11px;
  font-family: 'Consolas', monospace;
}

/* 前置分诊徽标 */
.pv-tier-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 18px;
  font-weight: 500;
  vertical-align: 2px;
}
.pv-tier-t1 { color: #2f9e44; background: rgba(47, 158, 68, 0.12); border: 1px solid rgba(47, 158, 68, 0.35); }
.pv-tier-t2 { color: #1971c2; background: rgba(25, 113, 194, 0.12); border: 1px solid rgba(25, 113, 194, 0.35); }
.pv-tier-t3 { color: #e8590c; background: rgba(232, 89, 12, 0.12); border: 1px solid rgba(232, 89, 12, 0.35); }
.pv-tier-t4 { color: #862e9c; background: rgba(134, 46, 156, 0.12); border: 1px solid rgba(134, 46, 156, 0.35); }
.pv-stages {
  padding: 8px 0;
  max-height: 360px;
  overflow-y: auto;
}

.pv-stages::-webkit-scrollbar { width: 4px; }
.pv-stages::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 2px; }

.pv-stage {
  display: flex;
  gap: 0;
  padding: 0 12px;
}

/* 阶段状态切换过渡：pending → running → done/failed 平滑过渡，避免事件风暴闪烁 */
.pv-stage .pv-dot,
.pv-stage .pv-label,
.pv-stage .pv-connector {
  transition: border-color 0.25s ease, color 0.25s ease, background 0.25s ease, transform 0.2s ease;
}

.pv-line {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
  flex-shrink: 0;
  position: relative;
}

.pv-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  background: var(--surface-window);
  border: 1.5px solid var(--border-default);
  color: var(--text-quiet);
  flex-shrink: 0;
  z-index: 1;
}

.pv-connector {
  position: absolute;
  top: 20px;
  bottom: -4px;
  width: 1.5px;
  background: var(--surface-raised);
}

/* 状态 */
.pv-stage.running .pv-dot {
  border-color: var(--info);
  color: var(--info);
  animation: pv-spin 1s linear infinite;
}

.pv-stage.done .pv-dot {
  border-color: var(--code-sym-var);
  color: var(--code-sym-var);
  background: var(--pv-done-soft);
}

.pv-stage.failed .pv-dot {
  border-color: var(--status-failed);
  color: var(--status-failed);
  background: var(--pv-failed-soft-2);
}

.pv-stage.running .pv-connector,
.pv-stage.running ~ .pv-stage .pv-connector {
  background: var(--pv-running-soft-3);
}

@keyframes pv-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 节点内容 */
.pv-body {
  flex: 1;
  min-width: 0;
  padding: 0 0 var(--space-8) var(--space-8);
}

.pv-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
  line-height: 18px;
}

.pv-label {
  font-size: 13px;
  color: var(--text-strong);
  font-weight: 500;
}

.pv-stage.running .pv-label { color: var(--info); }
.pv-stage.done .pv-label    { color: var(--code-sym-var); }
.pv-stage.failed .pv-label  { color: var(--status-failed); }

.pv-agent {
  font-size: 10px;
  color: var(--text-subtle);
  background: var(--surface-window);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-4);
  padding: 0 4px;
  font-family: 'Consolas', monospace;
}

.pv-dur {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-faint);
  font-family: 'Consolas', monospace;
}

.pv-summary {
  margin-top: var(--space-4);
  font-size: var(--fs-12);
  color: var(--text-subtle);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pv-error {
  margin-top: var(--space-4);
  font-size: var(--fs-12);
  color: var(--status-failed);
  word-break: break-all;
}

.pv-fail {
  margin: 0 var(--space-12) var(--space-8);
  padding: var(--space-8) var(--space-8);
  border-radius: 6px;
  background: var(--pv-failed-soft-2);
  border: 1px solid var(--pv-failed-border-2);
  color: var(--status-failed);
  font-size: 12px;
  word-break: break-all;
}

/* 聊天模式提示 */
.pv-chat-note {
  margin: 0 var(--space-12) var(--space-8);
  padding: var(--space-8) var(--space-8);
  border-radius: 6px;
  background: var(--pv-pending-soft);
  border: 1px dashed var(--pv-pending-border);
  color: var(--status-pending);
  font-size: var(--fs-12);
}

/* P1 变更日志折叠区 */
.pv-changes {
  margin: 0 var(--space-12) var(--space-8);
  padding: var(--space-8) var(--space-8);
  border-radius: 8px;
  background: var(--pv-done-soft-2);
  border: 1px solid var(--pv-done-border-2);
}
.pv-change {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-12);
  line-height: 20px;
  min-width: 0;
}
.pv-change-icon {
  flex: 0 0 auto;
}
.pv-change-path {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--code-sym-var);
}

/* P2 快照回滚折叠区 */
.pv-snaps {
  margin: 0 var(--space-12) var(--space-8);
  padding: var(--space-8) var(--space-8);
  border-radius: 8px;
  background: var(--pv-done-soft-2);
  border: 1px solid var(--pv-done-border-2);
}
.pv-snap {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-12);
  line-height: 22px;
  min-width: 0;
}
.pv-snap-kind {
  flex: 0 0 auto;
}
.pv-snap-info {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--code-sym-var);
}
.pv-snap-btn {
  flex: 0 0 auto;
  font-size: var(--fs-12);
  line-height: 1;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--pv-done-border-2);
  background: var(--pv-done-soft-2);
  color: var(--code-sym-var);
  cursor: pointer;
}
.pv-snap-btn:hover {
  border-color: var(--code-sym-fn);
}
.pv-snap-btn-danger {
  color: #d9534f;
  border-color: rgba(217, 83, 79, 0.4);
}
.pv-snaps-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}
/* P0 token 记账显示 */
.pv-token {
  margin: 0 var(--space-12) var(--space-8);
  padding: var(--space-6) var(--space-8);
  border-radius: 6px;
  background: var(--pv-done-soft-2);
  border: 1px dashed var(--pv-done-border-2);
  font-size: var(--fs-12);
  color: var(--code-sym-var);
  display: flex;
  align-items: center;
  gap: 4px;
}
.pv-token-est {
  color: var(--text-secondary, #8a94a6);
  font-size: 11px;
}
.pv-token-sub {
  color: var(--text-secondary, #8a94a6);
  font-size: 11px;
}

/* 落盘文件列表 */
.pv-artifacts {
  margin: 0 var(--space-12) var(--space-8);
  padding: var(--space-8) var(--space-8);
  border-radius: 8px;
  background: var(--pv-done-soft-2);
  border: 1px solid var(--pv-done-border-2);
}

.pv-artifacts-title {
  font-size: 12px;
  color: var(--code-sym-var);
  font-weight: 600;
  margin-bottom: 6px;
}

.pv-artifact {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-12);
  line-height: 20px;
  min-width: 0;
}

.pv-artifact-icon {
  flex-shrink: 0;
  font-size: 11px;
}

.pv-artifact-path {
  color: var(--text-primary);
  font-family: 'Consolas', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pv-artifact-size {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--text-faint);
  font-family: 'Consolas', monospace;
  font-size: 10px;
}

.pv-artifacts-more {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-faint);
}

/* 终端执行块 */
.pv-tool {
  margin: 0 var(--space-12) var(--space-8);
  padding: var(--space-8) var(--space-8);
  border-radius: 8px;
  background: var(--surface-window);
  border: 1px solid var(--border-default);
}

.pv-tool-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 600;
  margin-bottom: 6px;
}

.pv-tool-status {
  font-size: 10px;
  padding: 0 6px;
  border-radius: 6px;
  border: 1px solid;
}

.pv-tool-status.running { color: var(--info); border-color: var(--pv-running-border); animation: pv-blink 1s ease-in-out infinite; }
.pv-tool-status.ok   { color: var(--code-sym-var); border-color: var(--pv-done-border); }
.pv-tool-status.fail { color: var(--status-failed); border-color: var(--pv-failed-border); }

.pv-tool-dur {
  margin-left: auto;
  color: var(--text-faint);
  font-size: 10px;
  font-family: 'Consolas', monospace;
}

.pv-tool-cmd {
  font-size: var(--fs-12);
  color: var(--code-sym-func);
  font-family: 'Consolas', monospace;
  word-break: break-all;
  margin-bottom: 4px;
}

.pv-tool-cmd.running::after {
  content: '▋';
  animation: pv-blink 0.8s step-end infinite;
  margin-left: 2px;
}

.pv-tool-output {
  font-size: var(--fs-10);
  color: var(--text-subtle);
  font-family: 'Consolas', monospace;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 60px;
  overflow-y: auto;
  border-top: 1px dashed var(--border-default);
  padding-top: 4px;
}

@keyframes pv-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

/* 动作流：正在写入哪个文件（Cursor 风格） */
.pv-action-flow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 var(--space-12) var(--space-8);
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--surface-window);
  border: 1px solid var(--pv-running-border);
  font-size: var(--fs-12);
  color: var(--text-subtle);
}
.pv-action-spin {
  flex-shrink: 0;
  color: var(--info);
  animation: pv-spin 1s linear infinite;
}
.pv-action-path {
  color: var(--text-primary);
  font-family: 'Consolas', monospace;
  font-weight: 600;
}
.pv-action-cursor {
  width: 6px;
  height: 12px;
  border-radius: 1px;
  background: var(--info);
  animation: pv-blink 0.8s step-end infinite;
  flex-shrink: 0;
}

/* 逐节点折叠：已完成节点可点击展开 */
.pv-body-closed {
  cursor: pointer;
  border-radius: 6px;
  padding-right: 4px;
  transition: background 0.15s;
}
.pv-body-closed:hover {
  background: var(--surface-panel-4);
}
.pv-summary-clamp {
  -webkit-line-clamp: 1;
}
.pv-expand-hint {
  margin-left: 4px;
  font-size: 12px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 6px;
  color: var(--text-secondary);
  font-weight: 600;
  background: var(--surface-window);
  border: 1px solid var(--border-default);
  flex-shrink: 0;
  user-select: none;
  transition: color 0.15s, border-color 0.15s;
}
.pv-body-closed:hover .pv-expand-hint {
  color: var(--info);
  border-color: var(--pv-running-border);
}

/* 阶段内进度与行数 */
.pv-progress {
  font-size: 10px;
  line-height: 16px;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--pv-done-soft);
  border: 1px solid var(--pv-done-border);
  color: var(--code-sym-var);
  font-family: 'Consolas', monospace;
  flex-shrink: 0;
}
.pv-lines {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--code-sym-var);
  font-family: 'Consolas', monospace;
}
.pv-question-card {
  margin: 10px 0 12px;
  padding: 12px 14px;
  border: 1px solid rgba(250, 204, 21, 0.35);
  border-radius: 10px;
  background: rgba(250, 204, 21, 0.06);
}
.pv-question-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.pv-question-badge { font-size: 14px; }
.pv-question-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent, #facc15);
}
.pv-question-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-1, #e5e7eb);
  margin-bottom: 10px;
  white-space: pre-wrap;
  word-break: break-word;
}
.pv-question-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.pv-question-opt {
  padding: 5px 12px;
  font-size: 12px;
  border: 1px solid rgba(250, 204, 21, 0.4);
  border-radius: 6px;
  background: transparent;
  color: var(--text-1, #e5e7eb);
  cursor: pointer;
  transition: background 0.15s;
}
.pv-question-opt:hover {
  background: rgba(250, 204, 21, 0.15);
}
.pv-question-input-row {
  display: flex;
  gap: 8px;
}
.pv-question-input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  font-size: 12px;
  border: 1px solid var(--border-2, rgba(255, 255, 255, 0.15));
  border-radius: 6px;
  background: var(--bg-2, rgba(255, 255, 255, 0.04));
  color: var(--text-1, #e5e7eb);
  outline: none;
}
.pv-question-input:focus {
  border-color: rgba(250, 204, 21, 0.5);
}
.pv-question-submit {
  padding: 6px 14px;
  font-size: 12px;
  border: none;
  border-radius: 6px;
  background: var(--accent, #facc15);
  color: #1a1a1a;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.pv-question-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
