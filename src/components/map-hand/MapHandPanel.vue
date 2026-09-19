<template>
  <div class="mh-panel">
    <!-- ===== 头部：模式标识 + 关闭 ===== -->
    <div class="mh-header">
      <div class="mh-title">
        <span class="mh-badge">共绘蓝图</span>
        <span class="mh-sub">Map-Hand Mode · 与架构师一起构思，不写代码</span>
      </div>
      <button class="mh-close" title="关闭面板" @click="emit('close')">✕</button>
    </div>

    <!-- ===== 构思对话流 ===== -->
    <div ref="msgBox" class="mh-messages">
      <div v-if="!messages.length" class="mh-empty">
        和架构师聊聊你的想法：界面交互、核心业务、技术栈、文件结构…<br />
        聊得差不多了点「完成构思」，架构师会把讨论整理成设计文档。
      </div>
      <div v-for="(m, i) in messages" :key="i" :class="['mh-msg', m.role]">
        <div class="mh-avatar">{{ m.role === 'user' ? '我' : '🏗' }}</div>
        <div class="mh-bubble">{{ m.text }}</div>
      </div>

      <!-- 思考缓冲动画：架构师正在分析/回复时显示，避免"死等无反馈" -->
      <div v-if="thinking" class="mh-msg assistant">
        <div class="mh-avatar">🏗</div>
        <div class="mh-bubble mh-think-bubble">
          <span class="mh-dots"><i></i><i></i><i></i></span>
          <span class="mh-think-label">架构师正在思考…</span>
        </div>
      </div>

      <!-- 完成构思后的设计文档展示 -->
      <div v-if="design" class="mh-design">
        <div class="mh-design-title">📋 设计文档（构思总结）</div>
        <div class="mh-design-row"><b>{{ design.title || '未命名项目' }}</b></div>
        <div v-if="design.summary" class="mh-design-row">{{ design.summary }}</div>
        <div v-if="techText" class="mh-design-row">技术栈：{{ techText }}</div>
        <div v-if="design.ui_interaction" class="mh-design-row">
          <div class="mh-row-label">界面与交互</div>{{ design.ui_interaction }}
        </div>
        <div v-if="businessList.length" class="mh-design-row">
          <div class="mh-row-label">核心业务</div>
          <div v-for="(b, bi) in businessList" :key="bi" class="mh-dot">· {{ b }}</div>
        </div>
        <div class="mh-design-row">
          <div class="mh-row-label">预计文件（{{ fileCount }} 个）</div>
          <div v-for="(f, fi) in files" :key="fi" class="mh-file">{{ f.path }} <span class="mh-role">{{ f.role }}</span></div>
        </div>

        <!-- 规模档位 + 确认开工 -->
        <div class="mh-scale-row">
          <span class="mh-row-label">规模</span>
          <label v-for="opt in scaleOptions" :key="opt.value" class="mh-scale-opt">
            <input type="radio" :value="opt.value" v-model="scale" />
            {{ opt.label }}<span class="mh-scale-hint">{{ opt.hint }}</span>
          </label>
        </div>
        <div class="mh-start-row">
          <span class="mh-path" :title="projectPath">📁 {{ dirName || '未选择文件夹' }}</span>
          <button class="mh-btn mh-btn-primary" :disabled="!projectPath" @click="confirmStart">
            🚀 确认并开始开发
          </button>
          <span class="mh-hint">提交后回到主界面跟踪完整开发链路</span>
        </div>
      </div>
    </div>

    <!-- ===== 输入区 ===== -->
    <div class="mh-inputbar">
      <button v-if="!design && !finalizing" class="mh-btn" :disabled="thinking" @click="finishIdeation">
        {{ finalizing ? '正在总结设计…' : '✅ 完成构思' }}
      </button>
      <input
        v-model="input"
        class="mh-input"
        :placeholder="design ? '开发已开始，构思结束' : '和架构师继续聊…（Enter 发送）'"
        :disabled="!!design || thinking || finalizing"
        @keyup.enter="send"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { startTypewriter } from '@/utils/typewriter'

const props = defineProps({
  requirement: { type: String, default: '' },
})
const emit = defineEmits(['close', 'started'])

const projectStore = useProjectStore()
const messages = ref([])
const input = ref('')
const thinking = ref(false)
const finalizing = ref(false)
const design = ref(null)
const projectPath = ref('')
const scale = ref('standard')
const msgBox = ref(null)

const scaleOptions = [
  { value: 'slim', label: '精简', hint: '1-3 文件' },
  { value: 'standard', label: '标准', hint: '5-10 文件' },
  { value: 'full', label: '完整', hint: '不限' },
]

const techText = computed(() => {
  const t = design.value?.tech_selection?.final || {}
  return [t.frontend, t.backend, t.database].filter(Boolean).join(' / ') || ''
})
const businessList = computed(() => Array.isArray(design.value?.core_business) ? design.value.core_business : [])
const files = computed(() => Array.isArray(design.value?.file_plan?.files) ? design.value.file_plan.files : [])
const fileCount = computed(() => files.value.length)
const dirName = computed(() => String(projectPath.value).split(/[\\/]/).filter(Boolean).pop() || '')

const scrollToBottom = () => {
  nextTick(() => {
    if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight
  })
}

// 打字机：把架构师回复逐字渲染（流式观感）
const typeInto = (msg, text) => {
  startTypewriter(msg, text, { onTick: scrollToBottom })
}

// ===== 发送构思消息 =====
let camUnsub = null
// 当前等待回复的气泡指针：SSE 回调只注册一次，每次 send 更新此指针，
// 保证回复永远写入「本条对话自己的气泡」，不覆盖上一条（闭包陷阱修复）
let activeBot = null

const send = async () => {
  const text = input.value.trim()
  if (!text || thinking.value || design.value) return
  input.value = ''
  messages.value.push({ role: 'user', text })
  scrollToBottom()

  const botMsg = reactive({ role: 'assistant', text: '' })
  messages.value.push(botMsg)
  activeBot = botMsg
  thinking.value = true
  scrollToBottom()

  if (!camUnsub) {
    camUnsub = window.electronAPI.onMapHandEvent((evt) => {
      const bot = activeBot
      if (evt?.event === 'chat_reply') {
        thinking.value = false
        if (bot) {
          bot.text = ''
          typeInto(bot, evt.data?.content || '（无回复）')
        }
        scrollToBottom()
      } else if (evt?.event === 'error') {
        thinking.value = false
        if (bot) bot.text = '❌ ' + (evt.data?.error || '构思对话失败')
        scrollToBottom()
      }
    })
  }

  try {
    await window.electronAPI.mapHandChatStream({
      message: text,
      messages: messages.value.slice(0, -1).map((m) => ({ role: m.role, content: m.text })),
      projectPath: projectPath.value,
    })
  } catch (e) {
    thinking.value = false
    if (activeBot) activeBot.text = '❌ 构思对话失败：' + e.message
    scrollToBottom()
  }
}

// ===== 完成构思：选文件夹 → 总结设计文档 =====
const finishIdeation = async () => {
  if (finalizing.value || thinking.value) return
  // 第一步：选项目文件夹（构思成果最终落在这里）
  if (!projectPath.value) {
    try {
      projectPath.value = await window.electronAPI.selectFolder()
    } catch (e) {
      console.warn('[map-hand] 选择文件夹失败:', e)
    }
    if (!projectPath.value) {
      ElMessage.warning('未选择项目文件夹，构思成果没有去处，已取消总结')
      return
    }
  }
  finalizing.value = true
  const doneMsg = messages.value[messages.value.length - 1]
  const tail = reactive({ role: 'assistant', text: '正在把构思整理成设计文档…' })
  messages.value.push(tail)
  scrollToBottom()
  try {
    const res = await window.electronAPI.mapHandFinalize({
      requirement: props.requirement,
      messages: messages.value.map((m) => ({ role: m.role, content: m.text })),
      projectPath: projectPath.value,
      scale: scale.value,
    })
    if (res?.success && res.design) {
      design.value = res.design
      tail.text = `构思总结完成，共 ${res.file_count || 0} 个文件。看看下面的设计文档，确认后开工：`
    } else {
      tail.text = '❌ 设计文档生成失败：' + (res?.error || '未知错误')
    }
  } catch (e) {
    tail.text = '❌ 设计文档生成失败：' + e.message
  } finally {
    finalizing.value = false
    scrollToBottom()
  }
}

// ===== 确认开工：交给主界面 executeTask（自动打开项目 + 完整链路 + 文件树实时刷新）=====
const confirmStart = async () => {
  if (!projectPath.value || !design.value) return
  emit('started', {
    requirement: props.requirement,
    projectPath: projectPath.value,
    scale: scale.value,
    design: design.value,
    dirName: dirName.value,
  })
}

onMounted(async () => {
  // 进入即把用户需求发给架构师，开始构思
  if (props.requirement) {
    input.value = props.requirement
    await send()
  }
})

onBeforeUnmount(() => {
  if (typeof camUnsub === 'function') camUnsub()
})
</script>

<style scoped>
.mh-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-window, #0E1518);
  color: var(--text-primary, #D8E0E4);
  font-size: 13px;
}
.mh-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-default, #1E2A30);
  background: var(--surface-menu, #11181C);
  flex-shrink: 0;
}
.mh-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.mh-badge {
  background: var(--accent, #2E7D8C);
  color: #fff;
  padding: 3px 10px;
  border-radius: 10px;
  font-weight: 600;
  white-space: nowrap;
}
.mh-sub { color: var(--text-muted, #8A9AA0); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mh-close {
  background: none;
  border: none;
  color: var(--text-muted, #8A9AA0);
  font-size: 15px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}
.mh-close:hover { background: var(--surface-hover, #1E2A30); color: var(--text-bright, #fff); }
.mh-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mh-empty { color: var(--text-muted, #8A9AA0); text-align: center; margin-top: 60px; line-height: 1.8; }
.mh-msg { display: flex; gap: 8px; max-width: 92%; }
.mh-msg.user { align-self: flex-end; flex-direction: row-reverse; }
.mh-avatar {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-tag, #1E2A30);
  font-size: 12px;
  flex-shrink: 0;
}
.mh-msg.user .mh-avatar { background: var(--surface-selected-soft, rgba(255,255,255,0.06)); font-size: 11px; }
.mh-bubble {
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--surface-card, rgba(20,28,33,0.9));
  border: 1px solid var(--border-default, #1E2A30);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.mh-msg.user .mh-bubble { background: var(--surface-raised, #1E2A30); }
.mh-design {
  background: var(--surface-card, rgba(20,28,33,0.9));
  border: 1px solid var(--border-mid, #2A3A42);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mh-design-title { font-weight: 600; color: var(--text-bright, #fff); margin-bottom: 2px; }
.mh-design-row { line-height: 1.6; color: var(--text-primary, #D8E0E4); }
.mh-row-label { color: var(--accent, #4FA3B8); font-weight: 600; margin-bottom: 2px; }
.mh-dot { padding-left: 4px; }
.mh-file { display: flex; align-items: center; gap: 8px; padding: 2px 0; font-family: Consolas, monospace; font-size: 12px; }
.mh-role { font-size: 10px; color: var(--text-muted, #8A9AA0); background: var(--surface-tag, #1E2A30); padding: 1px 6px; border-radius: 6px; }
.mh-scale-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
.mh-scale-opt { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
.mh-scale-hint { color: var(--text-muted, #8A9AA0); font-size: 11px; }
.mh-start-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
.mh-path { color: var(--text-muted, #8A9AA0); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mh-btn {
  background: var(--surface-raised, #1E2A30);
  color: var(--text-primary, #D8E0E4);
  border: 1px solid var(--border-mid, #2A3A42);
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
}
.mh-btn:hover:not(:disabled) { background: var(--surface-hover, #2A3A42); }
.mh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mh-btn-primary { background: var(--accent, #2E7D8C); border-color: var(--accent, #2E7D8C); color: #fff; }
.mh-done { color: var(--accent, #4FA3B8); text-align: center; padding: 8px 0; font-weight: 600; }
/* 思考缓冲动画：三个跳动的点 + 文案，告诉用户 AI 正在做事 */
.mh-think-bubble {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  min-width: 120px;
}
.mh-dots { display: inline-flex; gap: 4px; }
.mh-dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent, #4FA3B8);
  animation: mh-blink 1.2s infinite ease-in-out;
}
.mh-dots i:nth-child(2) { animation-delay: 0.2s; }
.mh-dots i:nth-child(3) { animation-delay: 0.4s; }
@keyframes mh-blink {
  0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-3px); }
}
.mh-think-label { color: var(--text-muted, #8A9AA0); font-size: 12px; }
.mh-hint { color: var(--text-muted, #8A9AA0); font-size: 11px; width: 100%; text-align: right; }
.mh-inputbar {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border-default, #1E2A30);
  background: var(--surface-menu, #11181C);
  flex-shrink: 0;
}
.mh-input {
  flex: 1;
  background: var(--surface-input-active, #1E2A30);
  color: var(--text-primary, #D8E0E4);
  border: 1px solid var(--border-field, #2A3A42);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  outline: none;
}
.mh-input:focus { border-color: var(--accent, #4FA3B8); }
.mh-input:disabled { opacity: 0.5; }
</style>
