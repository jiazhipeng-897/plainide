<!-- src/components/agent/agent.vue -->
<template>
  <div class="agent-panel" :style="{ width: width + 'px' }" ref="panelRef">
    <div class="agent-header">
      <div class="agent-title-group">
        <img class="agent-avatar" :src="agentAvatar" alt="Agent" />
        <div class="agent-title-box">
          <span class="agent-title">Agent</span>
          <span class="agent-model">{{ currentModel }}</span>
        </div>
      </div>
      <div class="agent-header-right">
        <div class="agent-status">
          <span class="status-dot" :class="{ online: isOnline }"></span>
          <span class="status-text">{{ isOnline ? '在线' : '离线' }}</span>
        </div>
        <button class="agent-clear" title="清空会话" @click="onClearHistory">🗑️</button>
      </div>
    </div>

    <div class="agent-messages" ref="messagesRef" @scroll.passive="onNavScroll">
      <!-- 对话进度导航：每个小横线 = 一条消息，点击跳到对应位置 -->
      <div v-if="messages.length > 2" class="msg-nav">
        <button
          v-for="(msg, i) in messages"
          :key="'nav' + msg.id"
          class="msg-nav-mark"
          :class="{ active: i === activeNavIndex }"
          :title="'跳到第 ' + (i + 1) + ' 条消息'"
          @click="scrollToMsg(i)"
        >-</button>
      </div>
      <div v-if="messages.length === 0" class="empty-state">
        <img class="empty-avatar" :src="agentAvatar" alt="Agent" />
        <div class="empty-text">开始与 Agent 对话</div>
        <div class="empty-hint">说个需求，Agent 链路自动编排：需求 → 设计 → 开发 → 审查 → 测试 → 交付</div>
        <div class="empty-suggest">
          <button v-for="s in suggestions" :key="s" class="suggest-chip" @click="quickSend(s)">{{ s }}</button>
        </div>
      </div>
      <TransitionGroup name="msg">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="message"
        :class="msg.role"
      >
        <div class="message-avatar" :class="msg.role">
          <img v-if="msg.role === 'assistant'" :src="agentAvatar" alt="Agent" />
          <span v-else>我</span>
        </div>
        <div class="message-content">
          <PipelineView
            v-if="msg.pipeline"
            :pipeline="msg.pipeline"
            :snapshots="msg.pipeline.snapshots || []"
            @cancel="onCancelTask(msg.pipeline)"
            @pause="onPauseTask(msg.pipeline)"
            @resume="onResumeTask(msg.pipeline)"
            @restore-step="onRestoreStep(msg.pipeline, $event)"
            @clear-snapshots="onClearSnapshots(msg.pipeline)"
          />
          <TechStackCard
            v-if="msg.techStackCard && !msg.techStackChosen"
            :options="msg.techStackCard.options"
            :recommended="msg.techStackCard.recommended"
            @confirm="onTechStackConfirm(msg, $event)"
          />
          <ProjectPlanCard
            v-if="msg.planCard"
            :plan="msg.planCard"
            @confirm="onPlanConfirm($event)"
          />
          <ProjectContextCard
            v-if="msg.projectCtxCard"
            :ctx="msg.projectCtxCard"
          />
          <DeliveryCard
            v-if="msg.deliveryCard && !msg.deliveryChosen"
            @package="onDeliveryPackage(msg)"
            @keep="onDeliveryKeep(msg)"
          />
          <div v-if="msg.onboardCard" class="onboard-card">
            <div class="onboard-title">📖 项目入门分析（已读入 AI 上下文）</div>
            <div class="onboard-row"><b>目的：</b>{{ msg.onboardCard.purpose }}</div>
            <div class="onboard-row"><b>技术栈：</b>{{ (msg.onboardCard.tech_stack || []).join('、') }}</div>
            <div class="onboard-row"><b>目录结构：</b>{{ msg.onboardCard.structure }}</div>
            <div class="onboard-row"><b>入口：</b>{{ msg.onboardCard.entry_point }}　·　<b>启动：</b>{{ msg.onboardCard.test_command }}</div>
            <div class="onboard-row" v-if="msg.onboardCard.warnings && msg.onboardCard.warnings.length"><b>注意：</b>{{ msg.onboardCard.warnings.join('；') }}</div>
          </div>
          <div v-if="msg.role === 'assistant' && msg.text" class="msg-meta">
            <span class="msg-label">Agent · {{ currentModel }}</span>
            <button class="msg-copy" @click="copyText(msg.text)">复制</button>
          </div>
          <div v-if="msg.thinking" class="thinking-indicator">
            <span class="thinking-dots"><i></i><i></i><i></i></span>
            <span class="thinking-label">正在思考…</span>
          </div>
          <div
            v-if="msg.text"
            class="message-text"
            :data-mid="msg.id"
            :class="{ 'msg-text-plain': !msg.pipeline, 'msg-collapsed': msg.overflow && !msg.expanded }"
          >{{ msg.text }}</div>
          <button
            v-if="msg.overflow"
            class="msg-fold"
            @click="toggleFold(msg)"
          >{{ msg.expanded ? '∧ 收起' : '∨ 展开' }}</button>
          <div v-if="msg.image" class="msg-image">
            <img :src="msg.image.dataUrl" alt="生成的图片" />
            <div class="msg-image-actions">
              <span v-if="msg.image.saved" class="img-saved">✓ 已保存 assets/{{ msg.image.savedName }}</span>
              <button v-else class="save-img-btn" @click="saveGenImage(msg)">💾 保存到项目</button>
            </div>
          </div>
          <div v-if="msg.retryPayload" class="retry-row">
            <button class="retry-btn" @click="onRetryTask(msg)">🔄 重试</button>
          </div>
          <div class="message-time">{{ msg.time }}</div>
        </div>
      </div>
      </TransitionGroup>
    </div>

    <div class="agent-input-area">
      <div class="agent-toolbar">
        <button class="toolbar-btn quote-btn" :class="{ active: !!editorStore.selectedText }" title="引用当前选区代码" @click="quoteSelection">引用</button>
        <button class="toolbar-btn mirror-btn" :class="{ active: showMirror }" title="构思核心：把代码翻译成大白话，改大白话反写代码" @click="showMirror = !showMirror">构思核心</button>
        <button class="toolbar-btn" title="上传文件">📎</button>
        <button class="toolbar-btn" title="选择模型">
          <span class="model-selector">{{ currentModel }}</span>
          <span class="model-arrow">▼</span>
        </button>
      </div>
      <div class="input-row">
        <textarea
          v-model="inputText"
          ref="inputRef"
          class="agent-input"
          placeholder="输入你的问题…"
          rows="1"
          @input="autoResizeInput"
          @keydown.enter.exact.prevent="sendMessage"
          @keydown.shift.enter.prevent="insertNewline"
        ></textarea>
        <button class="send-btn" @click="sendMessage" :disabled="!inputText.trim()">
          <svg class="send-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M22 2 11 13"></path>
            <path d="M22 2 15 22l-4-9-9-4 20-7z"></path>
          </svg>
        </button>
      </div>
      <div class="input-hint">Enter 发送 · Shift+Enter 换行</div>
    </div>

    <!-- 共绘蓝图模式（Map-Hand）构思面板：独立新通道，覆盖在 Agent 面板内 -->
    <MapHandPanel
      v-if="showMapHand"
      :requirement="mapHandRequirement"
      class="map-hand-overlay"
      @close="showMapHand = false"
      @started="onMapHandStarted"
    />
    <!-- 构思核心（MirrorDoc）面板：大白话 ↔ 代码双向桥，独立浮层 -->
    <MirrorPanel :visible="showMirror" @close="showMirror = false" />
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, watch, onBeforeUnmount } from 'vue'
import agentAvatar from '@/assets/agent-avatar.png'
import { ElMessage, ElMessageBox } from 'element-plus'
import PipelineView from './PipelineView.vue'
import TechStackCard from './TechStackCard.vue'
import ProjectPlanCard from './ProjectPlanCard.vue'
import ProjectContextCard from './ProjectContextCard.vue'
import DeliveryCard from './DeliveryCard.vue'
import MapHandPanel from '@/components/map-hand/MapHandPanel.vue'
import MirrorPanel from '@/components/mirror/MirrorPanel.vue'
import { useProjectStore } from '@/stores/project'
import { useEditorStore } from '@/stores/editor'
import { useAgentStore } from '@/stores/agent'
import { useTaskBusStore } from '@/stores/taskBus'
import { getDefaultModel } from '@/constants/providerConfig'
import { sfx } from '@/utils/sound'
import { startTypewriter } from '@/utils/typewriter'
import {
  createPipelineState,
  reducePipelineEvent,
  subscribeAgentEvents,
  startPipeline,
  submitTask,
  getTechStack,
  getPlanPreview,
  getProjectContext,
  packageTask,
  subscribeTaskEvents,
  startTaskStream,
  cancelTask,
  pauseTask,
  resumeTask,
  formatPipelineSummary,
} from '@/composables/usePipelineStream'

defineProps({
  width: {
    type: Number,
    default: 300
  }
})

const isOnline = ref(true)
const currentModel = ref('deepseek-v4-flash')
const agentStore = useAgentStore()

// 当前厂商变化时同步模型选择器（跟随设置里的切换，自动带出该厂商已保存/默认模型）
watch(
  () => agentStore.provider,
  async (val) => {
    try {
      const saved = await window.electronAPI?.getApiConfig?.()
      const savedModel = saved?.providers?.[val]?.model
      currentModel.value = savedModel || getDefaultModel(val) || currentModel.value
    } catch (e) {}
  },
  { immediate: true }
)
const inputText = ref('')
const inputRef = ref(null)
// 共绘蓝图模式（Map-Hand）：构思面板状态（独立新通道，覆盖在 Agent 面板内）
const showMapHand = ref(false)
const showMirror = ref(false)
const mapHandRequirement = ref('')
// 空态建议问题：点一下直接发送（Cursor/TRAE 式冷启动引导）
const suggestions = ['帮我写一个计算器', '帮我审查这段代码', '解释一下项目结构', '生成一张壁纸']
const quickSend = (s) => {
  inputText.value = s
  sendMessage()
}
// 复制 AI 回复
const copyText = async (t) => {
  try {
    await navigator.clipboard.writeText(t)
    ElMessage.success('已复制')
  } catch (e) {
    ElMessage.warning('复制失败')
  }
}
// 输入框自适应高度（最多 6 行，超出滚动）
const autoResizeInput = () => {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 132) + 'px'
}
// Shift+Enter 插入换行（Enter 已在模板里拦截为发送）
const insertNewline = () => {
  const el = inputRef.value
  if (!el) return
  const s = el.selectionStart ?? inputText.value.length
  const e = el.selectionEnd ?? s
  inputText.value = inputText.value.slice(0, s) + '\n' + inputText.value.slice(e)
  nextTick(autoResizeInput)
}
const messagesRef = ref(null)
const panelRef = ref(null)

const projectStore = useProjectStore()
const taskBus = useTaskBusStore()

// quote current editor selection into input
const quoteSelection = () => {
  const text = editorStore.selectedText
  if (!text || !text.trim()) {
    ElMessage.warning('please select code in editor first')
    return
  }
  const file = editorStore.activeFile
  const lang = editorStore.currentLanguage || 'text'
  const block = (file ? 'current file: ' + file + '\n' : '') + '```' + lang + '\n' + text + '\n```\n'
  inputText.value = inputText.value ? inputText.value + '\n' + block : block
  nextTick(() => inputRef.value?.focus())
  autoResizeInput()
}
const editorStore = useEditorStore()

const messages = ref([])

// ===== 项目入门分析：打开陌生项目自动跑一次，读关键文件+LLM生成大纲 =====
async function ensureOnboard(projectPath) {
  if (!projectPath) return
  try {
    const st = await window.electronAPI?.callPythonAPI?.('/onboard/status', { project_path: projectPath })
    if (st?.has_onboard) return
    const res = await window.electronAPI?.callPythonAPI?.('/onboard/inspect', { project_path: projectPath })
    if (res?.ok && res?.onboard) {
      messages.value.push({
        id: 'onboard-' + Date.now(),
        role: 'system',
        onboardCard: res.onboard,
        text: '',
      })
      scrollToBottom()
    }
  } catch (e) {
    console.warn('[onboard] 自动分析失败:', e)
  }
}
watch(
  () => projectStore.projectPath,
  (newPath) => { ensureOnboard(newPath) },
  { immediate: true }
)
// 活动打字机集合：组件卸载时统一中断，防止定时器泄漏
const activeTypers = new Set()
onBeforeUnmount(() => { activeTypers.forEach((c) => c()) })

// ===== 项目聊天记录（按项目持久化到 <项目>/.myide/chat-history.json） =====
// 规则：
//   - 有项目：聊天跟随项目走（打开旧项目恢复记录，切换项目先存旧再载新）
//   - 无项目：聊天只在内存，不落盘（没让 AI 做过项目 → 关软件即销毁本次对话）
//   - 用户清空 → 删除该项目聊天文件，之后打开项目记录不再回来
const HISTORY_LIMIT = 100
// 会话锁定：AI 任务自动打开项目（executeTask 内 openProject）时，
// 不应触发"项目切换→重置对话"，否则当前对话会被当成历史清空（对话被杀）
let sessionSwitching = false

const saveChatToProject = async () => {
  const projectPath = projectStore.projectPath
  if (!projectPath) return // 无项目：临时聊天，不保存
  try {
    await window.electronAPI?.saveChatHistory?.({ projectPath, messages: messages.value })
  } catch (e) {
    /* 保存失败静默，不影响聊天 */
  }
}

const loadChatFromProject = async (projectPath) => {
  if (!projectPath) {
    messages.value = []
    return
  }
  try {
    const arr = await window.electronAPI?.loadChatHistory?.({ projectPath })
    messages.value = (Array.isArray(arr) ? arr : []).slice(-HISTORY_LIMIT)
    if (messages.value.length) {
      scrollToBottom()
      nextTick(() => { messages.value.forEach((m) => measureOverflow(m)) })
    }
  } catch (e) {
    messages.value = []
  }
}

// 消息变化后节流落盘到当前项目（600ms 合并：任务事件流期间不频繁写）
let _saveTimer = null
watch(
  messages,
  () => {
    clearTimeout(_saveTimer)
    _saveTimer = setTimeout(saveChatToProject, 600)
  },
  { deep: true }
)

// 项目切换：先保存旧项目聊天，再加载新项目聊天（防止切换时丢记录）
watch(
  () => projectStore.projectPath,
  (newPath, oldPath) => {
    if (sessionSwitching) return // AI 任务切项目：保留当前对话（随新项目保存）
    if (oldPath && oldPath !== newPath) {
      clearTimeout(_saveTimer)
      window.electronAPI?.saveChatHistory?.({ projectPath: oldPath, messages: messages.value })
    }
    loadChatFromProject(newPath)
  }
)

const onClearHistory = () => {
  ElMessageBox.confirm('确定清空当前会话吗？此操作不可恢复。', '清空会话', {
    confirmButtonText: '清空',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      messages.value = []
      const projectPath = projectStore.projectPath
      if (projectPath) {
        try {
          await window.electronAPI?.clearChatHistory?.({ projectPath })
        } catch (e) {
          /* 忽略 */
        }
      }
    })
    .catch(() => {})
}

const getTime = () => {
  const now = new Date()
  return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0')
}

// 滚动到底（节流 120ms + trailing）：双链并行写文件时 file 事件风暴会高频触发，
// 每次都 nextTick 滚动会造成 UI 卡顿/闪烁；合并为窗口内最多滚一次，末次保证滚到。
let _scrollLast = 0
let _scrollTimer = null
const doScroll = () => {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}
const scrollToBottom = () => {
  const now = Date.now()
  const wait = 120
  if (now - _scrollLast >= wait) {
    _scrollLast = now
    doScroll()
  } else {
    clearTimeout(_scrollTimer)
    _scrollTimer = setTimeout(() => {
      _scrollLast = Date.now()
      doScroll()
    }, wait - (now - _scrollLast))
  }
}

// ===== AI 消息折叠（5 行 + ∨ 展开 / ∧ 收起）：长回复默认只露 5 行，避免刷屏 =====
const _FOLD_LINE_H = 20 // 单行高度（含行距），5 行 ≈ 100px（含上下 padding 补偿）
const measureOverflow = (msg) => {
  if (!msg || msg.role !== 'assistant' || !msg.text) return
  nextTick(() => {
    const el = messagesRef.value?.querySelector(`.message-text[data-mid="${msg.id}"]`)
    if (!el) return
    // 临时去掉折叠态测真实高度（若已折叠会量出 5 行高度，误判为不溢出）
    const wasCollapsed = el.classList.contains('msg-collapsed')
    if (wasCollapsed) el.classList.remove('msg-collapsed')
    const overflow = el.scrollHeight > _FOLD_LINE_H * 5 + 16
    if (wasCollapsed) el.classList.add('msg-collapsed')
    if (overflow !== !!msg.overflow) msg.overflow = overflow
    if (!overflow && msg.expanded) msg.expanded = false
  })
}
const toggleFold = (msg) => {
  msg.expanded = !msg.expanded
}

// ===== 对话进度导航：侧边 "-" 标记 = 每条消息，点击跳到对应位置 =====
const activeNavIndex = ref(-1)
let _navLast = 0
const onNavScroll = () => {
  const now = Date.now()
  if (now - _navLast < 120) return
  _navLast = now
  const el = messagesRef.value
  if (!el) return
  const items = el.querySelectorAll('.message')
  if (!items.length) {
    activeNavIndex.value = -1
    return
  }
  const probe = el.scrollTop + el.clientHeight * 0.35
  let idx = -1
  for (let i = 0; i < items.length; i++) {
    if (items[i].offsetTop <= probe) idx = i
    else break
  }
  if (idx < 0) idx = 0
  activeNavIndex.value = idx
}
const scrollToMsg = (i) => {
  const el = messagesRef.value
  if (!el) return
  const items = el.querySelectorAll('.message')
  if (items[i]) el.scrollTop = Math.max(0, items[i].offsetTop - 8)
}

// 组装历史（排除刚插入的助手消息，避免循环引用）
const historyExcept = (excludeId) => messages.value
  .filter((m) => m.id !== excludeId && m.role !== 'assistant')
  .map((m) => ({ role: m.role, content: m.text }))

// 空泛开发请求检测（chatAI 传声筒第一道闸）：
// "帮我写个项目/做个东西"这类没具体内容的请求，先追问"想写什么"，不触发后端。
// 规则：去掉开发动作词和虚词后，剩余部分为空或只含空泛名词 → 空泛。
const VAGUE_WORDS = ['项目', '东西', '工具', '应用', '程序', '软件', '功能', '网站',
  '网页', '一个', '个', '一点', '点', '什么', '吗', '吧', '呢', '一下', '那个', '这个']
const DEV_ACTION_WORDS = ['帮我写', '帮我做', '帮我开发', '帮我创建', '帮我设计', '帮我弄',
  '我想写', '我想做', '我想要', '我要', '请帮我', '麻烦',
  '写一个', '写个', '做一个', '做个', '开发一个', '开发个', '创建一个', '建一个',
  '弄一个', '弄个', '搞一个', '搞个', '整个', '设计一个', '设计个',
  '帮我', '想写', '想做', '想开发', '写', '做', '开发', '创建', '弄', '搞', '整', '设计']

const isVagueDevRequest = (text) => {
  let rest = text || ''
  for (const w of DEV_ACTION_WORDS) {
    rest = rest.split(w).join('')
  }
  rest = rest.replace(/[，。？！,.!?\s]/g, '')
  if (!rest) return true
  // 去掉空泛名词后仍非空 → 有具体内容（"个计算器"→"计算器"→具体；"个项目"→""→空泛）
  for (const v of VAGUE_WORDS) {
    rest = rest.split(v).join('')
  }
  return rest.trim() === ''
}

// ===== AI 生图（Seedream 3.0 最便宜档） =====
// 本地正则判定生图意图，不走 LLM 分类（省一次调用）：
// "画一个xxx图标 / 生成一张xxx背景图 / 设计个xxx插画" → 生图；以开发动作词开头的一律不算生图
const isImageGenRequest = (text) => {
  const t = (text || '').trim()
  if (!t) return false
  if (DEV_ACTION_WORDS.some((w) => t.startsWith(w))) return false
  return /(画|生成|设计|做)(一个|一张|个|张|幅)?(图标|logo|Logo|背景图|壁纸|插画|图片|图|头像|封面|海报|banner|Banner)/.test(t)
}

const handleImageGen = async (text, slotMsg) => {
  const prompt = (text || '').replace(/^(帮我|请)?(画|生成|设计|做)(一个|一张|个|张|幅)?/, '').trim() || text
  const assistantMsg = slotMsg || reactive({
    id: Date.now() + 1,
    role: 'assistant',
    text: '正在生成图片，请稍等…（Seedream 3.0）',
    image: null,
    time: getTime(),
  })
  assistantMsg.thinking = false
  assistantMsg.text = '正在生成图片，请稍等…（Seedream 3.0）'
  if (!slotMsg) {
    messages.value.push(assistantMsg)
    scrollToBottom()
  }
  sfx.taskStart?.()
  try {
    const res = await window.electronAPI.callPythonAPI('/image/generate', {
      prompt,
      size: '1024x1024',
      count: 1,
    })
    if (res?.ok && res.images?.length) {
      const img = res.images[0]
      assistantMsg.text = ''
      assistantMsg.image = {
        dataUrl: img.b64 ? 'data:image/png;base64,' + img.b64 : img.url || '',
        b64: img.b64 || '',
        prompt,
        model: res.model,
      }
      sfx.taskSuccess?.()
    } else {
      assistantMsg.text = '生图失败：' + (res?.error || '未知错误')
      sfx.taskFail?.()
    }
  } catch (e) {
    assistantMsg.text = '生图失败：' + (e.message || '未知错误')
    sfx.taskFail?.()
  }
  scrollToBottom()
}

// 保存生成图片到当前项目 assets/ 目录
const saveGenImage = async (msg) => {
  if (!projectStore.projectPath) {
    ElMessage.warning('请先打开一个项目，才能保存图片')
    return
  }
  if (!msg.image?.b64) {
    ElMessage.warning('当前图片无法保存（缺少图片数据）')
    return
  }
  try {
    const assetsDir = projectStore.projectPath.replace(/\\/g, '/').replace(/\/$/, '') + '/assets'
    await window.electronAPI.ensureDir(assetsDir)
    const name = 'img_' + Date.now() + '.png'
    const target = assetsDir + '/' + name
    const res = await window.electronAPI.writeImageFile(target, msg.image.b64)
    if (res?.success) {
      ElMessage.success('已保存：assets/' + name)
      msg.image.saved = true
      msg.image.savedName = name
      await projectStore.scanDirectory()
    } else {
      ElMessage.error(res?.error || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败：' + e.message)
  }
}

// 意图分流：dev → 后台任务（不等待）；chat/plan → 流式对话
const sendMessage = async () => {
  const text = inputText.value.trim()
  if (!text) return

  const time = getTime()
  messages.value.push({ id: Date.now(), role: 'user', text: text, time })
  inputText.value = ''
  nextTick(() => { if (inputRef.value) inputRef.value.style.height = 'auto' })
  scrollToBottom()

  // 即时占位：分类/响应期间先显示"正在思考"，避免"发消息没反应"
  const thinkingMsg = reactive({
    id: Date.now() + 1,
    role: 'assistant',
    text: '',
    thinking: true,
    time: getTime(),
  })
  messages.value.push(thinkingMsg)
  scrollToBottom()

  const dropThinking = () => {
    const idx = messages.value.findIndex((m) => m.id === thinkingMsg.id)
    if (idx >= 0) messages.value.splice(idx, 1)
  }

  // 计划确认闸（前置，不依赖意图分类）：
  // 计划卡片挂起时，"行/可以/OK" = 确认开工；其他话正常聊天，任务保持等待
  if (pendingTask.value && pendingTask.value.stage === 'plan') {
    if (isConfirmReply(text)) {
      dropThinking()
      onPlanConfirm()
    } else {
      handleChat(text, thinkingMsg)
    }
    return
  }

  // 续写确认闸：项目上下文卡片挂起时，用户的下一条输入 = 修改内容 → 直接提交增量任务
  if (pendingTask.value && pendingTask.value.stage === 'continue') {
    dropThinking()
    onContinueModify(text)
    return
  }

  // 生图闸（本地判定，不走 LLM）："画/生成 xxx 图" 直接走生图，不触发开发链路
  if (isImageGenRequest(text)) {
    handleImageGen(text, thinkingMsg)
    return
  }

  let intent = 'chat'
  try {
    let hasRecentProject = false
    try {
      const recent = localStorage.getItem('myide_last_project')
      if (recent) hasRecentProject = await window.electronAPI.pathExists({ path: recent })
    } catch (e) { /* 最近项目不可用则不带上下文 */ }
    const res = await window.electronAPI.agentClassify({ message: text, hasRecentProject })
    if (res?.success) intent = res.intent || 'chat'
  } catch (e) {
    // 分类失败按普通对话处理
  }

  if (intent === 'map_hand') {
    // 用户明确表达"先构思/先规划"（共绘蓝图）：意图已经很明确，直接打开构思面板，
    // 不再弹窗重复问"是否进入共绘蓝图模式"
    dropThinking()
    mapHandRequirement.value = text
    showMapHand.value = true
    return
  }

  if (intent === 'continue') {
    // 续写已有项目：选项目文件夹 → 项目上下文卡片 → 等用户说改什么
    handleContinue(text, thinkingMsg)
  } else if (intent === 'dev') {
    // 需求澄清层：开发意图但没具体内容 → 先追问，不触发后端（传声筒只传话，不接空单）
    if (isVagueDevRequest(text)) {
      thinkingMsg.text = '想写什么项目？说具体一点，比如"写个计算器"、"做个解压小游戏"，我就开工。'
      thinkingMsg.thinking = false
      scrollToBottom()
      return
    }

    // 共绘蓝图模式（Map-Hand）入口：dev 意图先弹模式选择——
    // 是 → 打开构思面板（用户替代总调度官，与架构师直接构思）；
    // 否 → 现有开发流程照常
    if (await askMapHandMode()) {
      dropThinking()
      mapHandRequirement.value = text
      showMapHand.value = true
      return
    }
    handleTask(text, thinkingMsg)
  } else {
    handleChat(text, thinkingMsg)
  }
}

// 共绘蓝图模式：构思确认开工 → 关闭构思面板，回到主界面走完整开发链路
// （executeTask 会自动打开项目、挂载链路导航、文件树实时刷新；engine 架构阶段读取
//  构思产出的 .mycode/design.json，采用用户与架构师敲定的设计）
const onMapHandStarted = (info) => {
  showMapHand.value = false
  if (!info?.projectPath) return
  const assistantMsg = reactive({
    id: Date.now() + 1,
    role: 'assistant',
    text: '🚀 构思已确认，正在按设计文档开发…',
    pipeline: null,
    time: getTime(),
  })
  messages.value.push(assistantMsg)
  scrollToBottom()
  // 与普通开发同一条链路：确认技术栈已由构思阶段敲定，直接进入开发
  executeTask(info.requirement, assistantMsg, null, info.projectPath, info.scale || 'standard', 'full')
}

// 共绘蓝图模式入口确认：是否先与架构师一起构思（是 → 构思面板；否 → 直接开发）
const askMapHandMode = async () => {
  try {
    await ElMessageBox.confirm(
      '可以先和架构师一起把界面交互、核心业务、软件架构聊清楚，再由代码写手按清单执行。',
      '是否进入「共绘蓝图」模式？',
      {
        confirmButtonText: '是，先构思',
        cancelButtonText: '否，直接开发',
        type: 'info',
        distinguishCancelAndClose: true,
        closeOnClickModal: false,
        customClass: 'mh-confirm', // 统一成软件深色主题，去掉 element 默认白框
      },
    )
    return true
  } catch (e) {
    // 用户点"否"或关闭：都走现有开发流程
    return false
  }
}

// ---- 续写已有项目：选文件夹 → 项目上下文卡片 → 等用户说改什么 ----
const handleContinue = async (text, slotMsg) => {
  const assistantMsg = slotMsg || reactive({
    id: Date.now() + 1,
    role: 'assistant',
    text: '好的，请选择要续写的项目文件夹…',
    pipeline: null,
    time: getTime(),
  })
  assistantMsg.thinking = false
  assistantMsg.text = '好的，请选择要续写的项目文件夹…'
  if (!slotMsg) {
    messages.value.push(assistantMsg)
    scrollToBottom()
  }

  // 第一步：目标项目——本会话刚写过（最近项目）→ 直达；没有 → 弹选文件夹（取消则中止）
  let targetPath = ''
  let fromRecent = false
  try {
    const recent = localStorage.getItem('myide_last_project')
    if (recent && await window.electronAPI.pathExists({ path: recent })) {
      targetPath = recent
      fromRecent = true
    }
  } catch (e) { /* 最近项目不可用则走选文件夹 */ }
  if (!targetPath) {
    try {
      targetPath = await window.electronAPI.selectFolder()
    } catch (e) {
      console.warn('[agent] 选择文件夹失败:', e)
    }
  }
  if (!targetPath) {
    assistantMsg.text = '未选择项目文件夹，续写已取消'
    scrollToBottom()
    return
  }
  const dirName = String(targetPath).split(/[\\/]/).filter(Boolean).pop() || targetPath

  // 第二步：读取项目上下文（记忆 + 文件数 + 技术栈 + 上次任务）
  assistantMsg.text = `正在加载「${dirName}」的项目上下文…`
  scrollToBottom()
  let ctx = null
  try {
    const res = await getProjectContext({ projectPath: targetPath })
    if (res?.projectName) ctx = res
  } catch (e) {
    console.warn('[agent] 项目上下文读取失败:', e)
  }

  // 第三步：展示项目上下文卡片，挂起任务等用户说"改什么"
  assistantMsg.text = ctx
    ? (fromRecent
      ? `检测到最近项目「${dirName}」，是继续修改它吗？告诉我想改什么（比如"把按钮改成红色"）；不是的话回复"换一个项目"。`
      : `已加载「${dirName}」，告诉我想改什么（比如"把按钮改成红色"）：`)
    : (fromRecent
      ? `检测到最近项目「${dirName}」，是继续修改它吗？不是的话回复"换一个项目"。`
      : `已选择「${dirName}」，告诉我想改什么：`)
  assistantMsg.projectCtxCard = ctx || { projectName: dirName, fileCount: 0, memoryLoaded: false }
  pendingTask.value = { text, assistantMsg, projectPath: targetPath, stage: 'continue', fromRecent }
  scrollToBottom()
}

// 用户在项目上下文卡片后回复修改内容 → 直接提交增量任务（不重跑全量流水线）
const onContinueModify = async (modifyText) => {
  const task = pendingTask.value
  pendingTask.value = null
  if (!task) return
  const { assistantMsg, projectPath } = task
  // 直达最近项目但用户想改别的项目 → 清掉最近项目，重新走选文件夹
  if (/换一个项目|不是这个|另一个项目|别的项目|选别的|换一个/.test(modifyText)) {
    try { localStorage.removeItem('myide_last_project') } catch (e) {}
    handleContinue(modifyText, assistantMsg)
    return
  }
  const requirement = `${task.text}：${modifyText}`
  assistantMsg.text = '收到，正在按你的要求修改项目…'
  scrollToBottom()
  await executeTask(requirement, assistantMsg, null, projectPath, 'standard', 'incremental')
}

// ---- 交付方式选择：写完后卡片。不选 = 源码开发模式（现状不动）；选"打包 EXE"才触发 ----
const onDeliveryKeep = (msg) => {
  msg.deliveryChosen = true
  msg.deliveryCard = null
}

const onDeliveryPackage = async (msg) => {
  if (msg.deliveryChosen) return
  msg.deliveryChosen = true
  const dc = msg.deliveryCard
  msg.deliveryCard = null
  if (!dc?.taskId || !dc?.projectPath) {
    msg.text = '⚠️ 打包信息缺失，无法发起打包'
    scrollToBottom()
    return
  }
  msg.text = `📦 正在把「${dc.dirName || '项目'}」打包成 EXE…`
  // 复用链路面板渲染打包进度（单阶段：打包 EXE）
  const pState = createPipelineState()
  pState.projectPath = dc.projectPath  // P2：打包任务同样可回滚
  msg.pipeline = pState
  scrollToBottom()

  let settled = false
  const unsub = subscribeTaskEvents((evt) => {
    reducePipelineEvent(pState, evt)
    if (evt?.event === 'pipeline_completed') {
      settled = true
      sfx.taskSuccess()
      const pk = evt.data?.packaging
      if (pk?.exeFiles?.length) {
        msg.text = `✅ 打包完成：${pk.exeFiles.join('、')}`
      } else if (pk?.error) {
        msg.text = `⚠️ ${pk.error}`
      } else {
        msg.text = '✅ 打包任务完成'
      }
      projectStore.scanDirectory()
      scrollToBottom()
      if (typeof unsub === 'function') unsub()
    } else if (evt?.event === 'pipeline_failed' || evt?.event === 'error') {
      settled = true
      sfx.taskFail()
      msg.text = '❌ 打包失败：' + (evt.data?.error || '未知错误')
      scrollToBottom()
      if (typeof unsub === 'function') unsub()
    }
  })

  try {
    const res = await packageTask({ taskId: dc.taskId, projectPath: dc.projectPath })
    if (res?.taskId) {
      sfx.taskStart()
      pState.task_id = res.taskId
      startTaskStream(res.taskId).catch((err) => {
        if (settled) return
        msg.text = '⚠️ 打包已提交，但进度推送连接失败：' + err.message
        scrollToBottom()
      })
    } else {
      throw new Error(res?.error || '打包任务提交失败')
    }
  } catch (err) {
    pState.status = 'failed'
    pState.error = err.message
    msg.text = '❌ 打包任务提交失败：' + err.message
    scrollToBottom()
  }
}

// ---- 流式对话（chat 闲聊 / plan 架构讨论）：不阻塞，事件回调收尾 ----
const handleChat = (text, slotMsg) => {
  const pipelineState = createPipelineState()
  // 复用 sendMessage 的"正在思考"占位（slotMsg），避免重复气泡；否则自建
  const assistantMsg = slotMsg || reactive({
    id: Date.now() + 1,
    role: 'assistant',
    text: '',
    pipeline: pipelineState,
    time: getTime(),
  })
  const assistantMsgId = assistantMsg.id
  assistantMsg.thinking = false
  assistantMsg.text = ''
  assistantMsg.pipeline = pipelineState
  if (!slotMsg) {
    messages.value.push(assistantMsg)
    scrollToBottom()
  }

  const unsubscribe = subscribeAgentEvents((evt) => {
    reducePipelineEvent(pipelineState, evt)
    taskBus.setStatus(pipelineState.status)
    if (evt?.event === 'pipeline_completed') {
      if (evt.data?.mode === 'chat' || evt.data?.mode === 'plan') {
        const reply = evt.data.chat_reply || '（无回复）'
        assistantMsg.text = ''
        scrollToBottom()
        activeTypers.add(startTypewriter(assistantMsg, reply, { onTick: scrollToBottom, onDone: () => measureOverflow(assistantMsg) }))
      } else {
        assistantMsg.text = formatPipelineSummary(pipelineState.stage_summaries)
        measureOverflow(assistantMsg)
      }
      scrollToBottom()
      // 事件全部收完才解除监听（invoke 的 resolve 可能先于事件到达，提前解除会丢事件）
      if (typeof unsubscribe === 'function') unsubscribe()
    } else if (evt?.event === 'pipeline_failed' || evt?.event === 'error') {
      assistantMsg.text = '❌ 链路执行失败：' + (evt.data?.error || '未知错误')
      scrollToBottom()
      measureOverflow(assistantMsg)
      if (typeof unsubscribe === 'function') unsubscribe()
    } else if (evt?.event === 'file_written') {
      // 文件写入完成：黄点消失，编辑器解除流式标记（后续用户编辑按正常保存逻辑）
      if (evt.data?.path) {
        projectStore.unmarkWriting(evt.data.path)
        editorStore.unmarkStreaming(evt.data.path)
      }
      // 双链进度显示：开发中… Backend 2/3 · Frontend 1/2（不滚动，避免跳动）
      const role = evt.data?.role
      const prog = evt.data?.progress
      if (role && prog && typeof prog.done === 'number' && typeof prog.total === 'number') {
        writeProgress[role] = { done: prog.done, total: prog.total }
        const parts = Object.entries(writeProgress).map(([r, p]) => `${r} ${p.done}/${p.total}`)
        if (parts.length) assistantMsg.text = `🛠️ 开发中… ${parts.join(' · ')}`
      }
    } else if (evt?.event === 'artifacts_written') {
      projectStore.scanDirectory()
    }
  })

  // fire-and-forget：不等待流结束，事件经 onAgentEvent 回流
  startPipeline({
    message: text,
    messages: historyExcept(assistantMsgId),
    projectPath: projectStore.projectPath || '',
  }).then((result) => {
    if (result && result.success === false) {
      pipelineState.status = 'failed'
      pipelineState.error = result.error || '请求失败'
      assistantMsg.text = '❌ 请求失败：' + (result.error || '未知错误')
      measureOverflow(assistantMsg)
      if (typeof unsubscribe === 'function') unsubscribe()
    }
    // 成功时不在这里解除：等待 pipeline_completed 事件处理完再解除，防止事件丢失
    scrollToBottom()
  }).catch((err) => {
    pipelineState.status = 'failed'
    pipelineState.error = err.message
    assistantMsg.text = '❌ 请求失败：' + err.message
    measureOverflow(assistantMsg)
    if (typeof unsubscribe === 'function') unsubscribe()
    scrollToBottom()
  })
  // 防泄漏兜底：30 秒后若仍未收到完成事件（如事件丢失），强制解除监听
  setTimeout(() => {
    if (typeof unsubscribe === 'function') unsubscribe()
  }, 30000)
}

// ---- 异步任务（dev 开发需求）：先确认技术栈（缺则弹卡片）→ 选文件夹 → 后台执行 ----
const pendingTask = ref(null)   // 等待用户确认技术栈的 dev 任务 { text, assistantMsg }

const handleTask = async (text, slotMsg) => {
  // 第一步：即时反馈"好的请稍等"，同时查询技术栈
  const assistantMsg = slotMsg || reactive({
    id: Date.now() + 1,
    role: 'assistant',
    text: '好的，请稍等…',
    pipeline: null,
    time: getTime(),
  })
  assistantMsg.thinking = false
  assistantMsg.text = '好的，请稍等…'
  if (!slotMsg) {
    messages.value.push(assistantMsg)
    scrollToBottom()
  }

  let tsData = null
  try {
    const res = await getTechStack({ message: text })
    if (res?.need_confirm && Array.isArray(res.options) && res.options.length) {
      tsData = { options: res.options, recommended: res.recommended }
    }
  } catch (e) {
    console.warn('[agent] 技术栈查询失败:', e)
  }

  // 需求缺明确技术栈 → 弹确认卡片，等用户拍板（不再开盲盒）
  if (tsData) {
    assistantMsg.text = '好的，请稍等，先确认一下技术栈：'
    assistantMsg.techStackCard = tsData
    assistantMsg.techStackChosen = false
    pendingTask.value = { text, assistantMsg }
    scrollToBottom()
    return
  }

  // 需求已明确技术栈（或查询失败兜底）→ 直接进入开发流程
  await startTaskFlow(text, assistantMsg, null)
}

// 用户在技术栈确认卡片上点选后：收起卡片，继续开发流程
const onTechStackConfirm = async (msg, stack) => {
  const task = pendingTask.value
  pendingTask.value = null
  if (!task || !stack) return
  msg.techStackCard = null
  msg.techStackChosen = true
  // 关键：stack 来自响应式 props（Vue proxy），Electron IPC 无法克隆 proxy，
  // 必须先转成纯对象再提交（否则报 "An object could not be cloned"）
  const plainStack = {
    id: String(stack.id || ''),
    name: String(stack.name || ''),
    form: String(stack.form || ''),
  }
  msg.text = `技术栈已确认：${plainStack.name}，正在准备…`
  scrollToBottom()
  await startTaskFlow(task.text, msg, plainStack)
}

// 计划确认语（对计划卡片说"行/好/可以/OK/开始/没问题"即通过；带疑问不触发）
const CONFIRM_WORDS = ['行', '好', '可以', 'ok', 'OK', 'Ok', '开始', '开工', '确认',
  '没问题', '就这个', '搞', '来', '是的', '嗯', '好嘞', '走', '弄', '生成', '就它', '就你了']
const isConfirmReply = (text) => {
  const t = (text || '').trim()
  if (!t || /[？?]/.test(t)) return false
  if (/^(什么|怎么|为什|哪|如何|几|啥|谁|为什么)/.test(t)) return false
  if (CONFIRM_WORDS.includes(t)) return true
  return t.length <= 6 && CONFIRM_WORDS.some((w) => t.includes(w))
}

// 开发流程主体（前半段）：选文件夹 → 计划预览 → 展示可折叠计划卡片 → 等用户确认。
// 用户没说"行"，后端绝不执行（技术栈 + 文件夹 + 计划报告三重控制后，确认才提交）。
const startTaskFlow = async (text, assistantMsg, techStack) => {
  // 第一步：弹窗让用户选择项目要写到的文件夹（取消则中止任务）
  let targetPath = ''
  try {
    targetPath = await window.electronAPI.selectFolder()
  } catch (e) {
    console.warn('[agent] 选择文件夹失败:', e)
  }
  if (!targetPath) {
    assistantMsg.text = '未选择项目文件夹，任务已取消'
    scrollToBottom()
    return
  }
  const dirName = String(targetPath).split(/[\\/]/).filter(Boolean).pop() || targetPath

  // 第二步：一次性 LLM 生成项目计划预览（快，几秒；失败回退内置模板）
  assistantMsg.text = `正在生成「${dirName}」的项目计划…`
  scrollToBottom()
  let plan = null
  try {
    const res = await getPlanPreview({ message: text, techStack: techStack || {} })
    if (res?.plan) plan = res.plan
  } catch (e) {
    console.warn('[agent] 计划预览失败:', e)
  }

  // 第三步：小需求快车道 —— LLM 判定 1-3 个文件即完成：不弹卡片，直接开工
  // （链路：需求 → 架构师简单转述 → 开发单文件 → 测试 → 找 BUG 修）
  if (plan?.small_task) {
    assistantMsg.text = `收到，「${dirName}」需求较小，正在直接生成单文件…`
    assistantMsg.planCard = null
    pendingTask.value = null
    await executeTask(text, assistantMsg, techStack, targetPath, 'slim', 'small')
    return
  }

  // 大需求：展示计划报告卡片（可折叠），挂起任务等用户拍板
  assistantMsg.text = plan
    ? `「${dirName}」的项目计划如下，确认后开工：`
    : `「${dirName}」的项目计划生成失败，确认后仍会按技术栈开工：`
  assistantMsg.planCard = plan
  pendingTask.value = { text, assistantMsg, techStack, projectPath: targetPath, stage: 'plan' }
  scrollToBottom()
}

// 用户在计划卡片上点"确认生成"或回复"行/可以"：才提交后端任务（带规模档位）
const onPlanConfirm = async (scale) => {
  const task = pendingTask.value
  pendingTask.value = null
  if (!task) return
  const { text, assistantMsg, techStack, projectPath } = task
  // 档位来源：按钮事件优先；回复"行"时取卡片当前选中（默认 standard）
  const selected = scale || assistantMsg.planCard?.selectedScale || 'standard'
  assistantMsg.planCard = null
  await executeTask(text, assistantMsg, techStack, projectPath, selected)
}

// 开发流程主体（后半段）：打开项目 → 提交任务（带技术栈+规模档位+模式）→ 订阅链路事件
const executeTask = async (text, assistantMsg, techStack, targetPath, scale = 'standard', mode = 'full') => {
  const dirName = String(targetPath).split(/[\\/]/).filter(Boolean).pop() || targetPath
  // 记录"最近项目"：用户写完说"改一下"时，续写直达该项目，不再重复弹选文件夹
  try { localStorage.setItem('myide_last_project', targetPath) } catch (e) {}

  // 挂载链路状态（技术栈确认阶段没有，此时才创建）
  const pipelineState = createPipelineState()
  pipelineState.projectPath = targetPath  // P2：快照恢复/清理需要项目路径
  assistantMsg.pipeline = pipelineState
  assistantMsg.text = mode === 'incremental'
    ? `🔄 任务已提交，正在修改「${dirName}」中的文件…`
    : mode === 'small'
      ? `⚡ 任务已提交，正在「${dirName}」直接生成单文件…`
      : `🔄 任务已提交，正在「${dirName}」目录生成项目…`
  scrollToBottom()

  // 第二步：自动用软件打开该项目，落盘后文件树实时可见
  // （AI 自动切项目不重置对话：会话锁定，提交任务后解锁）
  sessionSwitching = true
  try {
    await projectStore.openProject(targetPath)
  } catch (e) {
    console.warn('[agent] 打开项目失败:', e)
  } finally {
    sessionSwitching = false
  }

  let unsubscribeTask = null
  let taskSettled = false   // 任务终态保护：已完成/失败后，进度推送错误不得覆盖结果提示
  const writeProgress = {}  // 双链进度：{ Backend: {done,total}, Frontend: {done,total} }
  let lastEventAt = Date.now()   // 本地看门狗：上次收到事件时间
  let stallShown = false
  const stallTimer = setInterval(() => {
    // 任务 running 但连续 5 分钟无任何事件 → 提示用户（后端 LLM 慢/卡住的兜底提示）
    if (taskSettled || stallShown) return
    if (pipelineState.status === 'running' && Date.now() - lastEventAt > 5 * 60 * 1000) {
      stallShown = true
      assistantMsg.text = '⏳ 任务已 5 分钟无进展（LLM 响应慢或卡住），可点上方「取消」终止，或继续等待'
      scrollToBottom()
    }
  }, 30000)
  const stopStallTimer = () => clearInterval(stallTimer)
  unsubscribeTask = subscribeTaskEvents((evt) => {
    lastEventAt = Date.now()
    if (evt?.event === 'pipeline_completed' || evt?.event === 'pipeline_failed' || evt?.event === 'error' || evt?.event === 'pipeline_cancelled') {
      stopStallTimer()
    }
    reducePipelineEvent(pipelineState, evt)
    taskBus.setStatus(pipelineState.status)
    if (evt?.event === 'pipeline_completed') {
      taskSettled = true
      sfx.taskSuccess()
      // P2：终态拉取快照列表（供回滚 UI）
      fetchSnapshots(targetPath, pipelineState)
      // 详细报告已由后端写入项目目录「流水线报告.txt」，聊天里只给简短结果
      const fileCount = Array.isArray(pipelineState.artifacts) ? pipelineState.artifacts.length : 0
      assistantMsg.text = fileCount
        ? (mode === 'incremental'
          ? `✅ 修改完成：改动 ${fileCount} 个文件，打开项目测试一下`
          : `✅ 任务完成：生成 ${fileCount} 个文件，交付报告已写入项目文件夹`)
        : (mode === 'incremental' ? '✅ 修改完成，打开项目测试一下' : '✅ 任务完成')
      // 交付方式选择：不选就保持源码开发模式（现状不动），选"打包 EXE"才触发打包任务
      if (pipelineState.task_id && targetPath) {
        assistantMsg.deliveryCard = {
          taskId: pipelineState.task_id,
          projectPath: targetPath,
          dirName: String(targetPath).split(/[\\/]/).filter(Boolean).pop() || targetPath,
        }
      }
      scrollToBottom()
      // 任务终态：此时才退订（不能在每条事件都退订，否则后续事件全部丢失）
      if (typeof unsubscribeTask === 'function') unsubscribeTask()
    } else if (evt?.event === 'pipeline_failed' || evt?.event === 'error') {
      taskSettled = true
      sfx.taskFail()
      assistantMsg.text = '❌ 任务执行失败：' + (evt.data?.error || '未知错误')
      // F3（A 方案）：失败终止后挂重试参数，用户可一键重新提交（复用原需求/技术栈/目录/规模）
      assistantMsg.retryPayload = { text, techStack, targetPath, scale, mode }
      scrollToBottom()
      if (typeof unsubscribeTask === 'function') unsubscribeTask()
    } else if (evt?.event === 'pipeline_cancelled') {
      // 用户点击"取消"：终止流水线，已生成文件保留在项目目录
      taskSettled = true
      const fileCount = Array.isArray(pipelineState.artifacts) ? pipelineState.artifacts.length : 0
      assistantMsg.text = fileCount
        ? `⏹️ 已取消：已生成 ${fileCount} 个文件，保留在项目文件夹`
        : '⏹️ 任务已取消'
      scrollToBottom()
      if (typeof unsubscribeTask === 'function') unsubscribeTask()
    } else if (evt?.event === 'need_human') {
      // 熔断：Debugger 3 轮未修好，提示用户介入（任务继续跑，不退订）
      sfx.taskFail()
      const reason = evt.data?.reason || '自动修复未通过'
      const detail = evt.data?.detail || ''
      assistantMsg.text = `⚠️ ${reason}，需要你介入处理${detail ? `：${detail}` : ''}`
      scrollToBottom()
    } else if (evt?.event === 'file_writing') {
      // 流式写代码：文件树黄点闪烁 + 已打开该文件则编辑器实时增量渲染
      if (evt.data?.path) {
        projectStore.markWriting(evt.data.path)
        editorStore.markStreaming(evt.data.path)
        if (evt.data.chunk) editorStore.appendStreamChunk(evt.data.path, evt.data.chunk)
        // 内容变化时扫描一次（文件大小/时间戳刷新），黄点由 writingFiles 驱动不依赖扫描
        projectStore.scanDirectory()
      }
    } else if (evt?.event === 'file_created') {
      // 空文件创建：立即标记"正在写入"（黄点提前出现）+ 文件树即时刷新
      if (evt.data?.path) {
        projectStore.markWriting(evt.data.path)
        editorStore.markStreaming(evt.data.path)
      }
      projectStore.scanDirectory()
      // 双链进度显示：开发中… Backend 2/3 · Frontend 1/2（不滚动，避免跳动）
      const role = evt.data?.role
      const prog = evt.data?.progress
      if (role && prog && typeof prog.done === 'number' && typeof prog.total === 'number') {
        writeProgress[role] = { done: prog.done, total: prog.total }
        const parts = Object.entries(writeProgress).map(([r, p]) => `${r} ${p.done}/${p.total}`)
        if (parts.length) assistantMsg.text = `🛠️ 开发中… ${parts.join(' · ')}`
      }
    } else if (evt?.event === 'file_written') {
      // 文件写入完成：黄点消失，编辑器解除流式标记（后续用户编辑按正常保存逻辑）
      if (evt.data?.path) {
        projectStore.unmarkWriting(evt.data.path)
        editorStore.unmarkStreaming(evt.data.path)
      }
      // 双链进度显示：开发中… Backend 2/3 · Frontend 1/2（不滚动，避免跳动）
      const role = evt.data?.role
      const prog = evt.data?.progress
      if (role && prog && typeof prog.done === 'number' && typeof prog.total === 'number') {
        writeProgress[role] = { done: prog.done, total: prog.total }
        const parts = Object.entries(writeProgress).map(([r, p]) => `${r} ${p.done}/${p.total}`)
        if (parts.length) assistantMsg.text = `🛠️ 开发中… ${parts.join(' · ')}`
      }
    } else if (evt?.event === 'artifacts_written') {
      // 落盘完成：先让用户看到产出，不必等审查/测试全部跑完
      projectStore.scanDirectory()
      const files = evt.data?.files
      if (Array.isArray(files) && files.length) {
        assistantMsg.text = `📦 已生成 ${files.length} 个文件，正在审查与测试…`
        scrollToBottom()
      }
    }
  })

  try {
    const res = await submitTask({
      requirement: text,
      projectPath: targetPath,
      messages: historyExcept(assistantMsg.id),
      techStack: techStack || undefined,
      scale: scale || 'standard',
      mode: mode || 'full',
    })
    if (res?.taskId) {
      sfx.taskStart()
      pipelineState.task_id = res.taskId
      pipelineState.tier = res.tier || ''
      taskBus.start(res.taskId, targetPath)
      // 开启任务事件流（fire-and-forget：不等待任务完成）
      startTaskStream(res.taskId).catch((err) => {
        // 任务已出终态（完成/失败）时，推送断开是误报，不覆盖结果提示
        if (taskSettled) return
        // 仅提示进度推送断开，任务仍在后台执行
        assistantMsg.text = '⚠️ 任务已提交，但进度推送连接失败：' + err.message
        ElMessage.warning('任务已在后台执行，进度推送断开')
        scrollToBottom()
      })
    } else {
      throw new Error(res?.error || '任务提交失败')
    }
  } catch (err) {
    pipelineState.status = 'failed'
    pipelineState.error = err.message
    assistantMsg.text = '❌ 任务提交失败：' + err.message
    assistantMsg.retryPayload = { text, techStack, targetPath, scale, mode }
    if (typeof unsubscribeTask === 'function') unsubscribeTask()
    stopStallTimer()
    ElMessage.error('任务提交失败：' + err.message)
    scrollToBottom()
  }
}

// F3（A 方案）：链路失败终止后，用户点击"重试"→ 复用原参数重新提交（不重新走技术栈/文件夹确认）
const onRetryTask = async (msg) => {
  const p = msg.retryPayload
  if (!p) return
  msg.retryPayload = null          // 防止重复点击
  msg.pipeline = null              // 清掉旧失败链路状态
  msg.deliveryCard = null
  msg.planCard = null
  // 重新执行任务（executeTask 内部会新建链路状态并重新提交）
  await executeTask(p.text, msg, p.techStack, p.targetPath, p.scale, p.mode)
}

// 用户点击链路面板的"取消"：终止后台流水线，已生成文件保留
const onCancelTask = async (pipeline) => {
  if (!pipeline?.task_id) {
    ElMessage.warning('任务尚未开始，无法取消')
    return
  }
  try {
    await cancelTask(pipeline.task_id)
    // 取消结果通过 pipeline_cancelled 事件回流更新 UI（文件数、提示语）
  } catch (e) {
    ElMessage.error('取消失败：' + e.message)
  }
}

// P2 快照：任务终态拉取快照列表（可回滚步骤）
const fetchSnapshots = async (projectPath, pState) => {
  if (!projectPath) return
  try {
    const res = await window.electronAPI?.callPythonAPI?.('/orchestrator/snapshots', { projectPath })
    if (res?.steps && pState) pState.snapshots = res.steps
  } catch (e) {
    console.error('拉取快照失败', e)
  }
}

// P2 恢复快照步骤：先确认；后端恢复前会先做"恢复前保护"快照，恢复操作本身可撤销
const onRestoreStep = async (pipeline, step) => {
  const projectPath = pipeline?.projectPath
  if (!projectPath) return ElMessage.warning('缺少项目路径')
  try {
    await ElMessageBox.confirm(
      `将文件恢复到步骤 #${step} 写盘前的状态（已自动生成"恢复前"快照，可撤销）。确定吗？`,
      '恢复快照',
      { type: 'warning', confirmButtonText: '恢复', cancelButtonText: '取消' }
    )
  } catch (e) { return }
  try {
    const res = await window.electronAPI?.callPythonAPI?.('/orchestrator/restore-step', { projectPath, stepId: String(step) })
    if (res?.error) return ElMessage.error('恢复失败：' + res.error)
    ElMessage.success(res?.message || `已恢复 ${(res?.restored || []).length} 个文件`)
    fetchSnapshots(projectPath, pipeline)
  } catch (e) {
    ElMessage.error('恢复失败：' + e.message)
  }
}

// P2 清理全部快照：任务确认交付后可释放磁盘
const onClearSnapshots = async (pipeline) => {
  const projectPath = pipeline?.projectPath
  if (!projectPath) return ElMessage.warning('缺少项目路径')
  try {
    await ElMessageBox.confirm(
      '清空后无法再回滚到任意快照步骤。确定清空全部快照吗？',
      '清理快照',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' }
    )
  } catch (e) { return }
  try {
    const res = await window.electronAPI?.callPythonAPI?.('/orchestrator/snapshots/clear', { projectPath })
    if (res?.error) return ElMessage.error('清理失败：' + res.error)
    ElMessage.success(res?.message || '已清空快照')
    if (pipeline) pipeline.snapshots = []
  } catch (e) {
    ElMessage.error('清理失败：' + e.message)
  }
}

// 用户点击"暂停"：流水线挂起（驱动在事件边界阻塞，不结束）
const onPauseTask = async (pipeline) => {
  if (!pipeline?.task_id) {
    ElMessage.warning('任务尚未开始，无法暂停')
    return
  }
  try {
    await pauseTask(pipeline.task_id)
    // 状态通过 task_paused 事件回流更新
  } catch (e) {
    ElMessage.error('暂停失败：' + e.message)
  }
}

// 用户点击"继续"：从挂起点恢复执行
const onResumeTask = async (pipeline) => {
  if (!pipeline?.task_id) {
    ElMessage.warning('任务尚未开始，无法恢复')
    return
  }
  try {
    await resumeTask(pipeline.task_id)
    // 状态通过 task_resumed 事件回流更新
  } catch (e) {
    ElMessage.error('恢复失败：' + e.message)
  }
}
</script>

<style scoped>
.agent-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-panel-2);
  border-left: 1px solid var(--border-default);
  border-right: 1px solid var(--border-default);
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
}

/* 共绘蓝图模式（Map-Hand）构思面板：覆盖整个 Agent 面板 */
.map-hand-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
}

.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-8) var(--space-12);
  background: var(--surface-panel-1);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.agent-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.agent-clear {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  opacity: 0.55;
  transition: opacity 0.15s ease;
}

.agent-clear:hover {
  opacity: 1;
  background: var(--bg-hover, rgba(255, 255, 255, 0.06));
}

.agent-avatar {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-6);
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 0 8px var(--status-ok-glow);
}

.agent-title-box {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.agent-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.agent-model {
  font-size: 10px;
  color: var(--text-quiet);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-header-right {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.agent-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-idle);
}

.status-dot.online {
  background: var(--status-ok);
  box-shadow: 0 0 6px var(--status-ok-glow);
}

.status-text {
  font-size: 12px;
  color: var(--text-subtle);
}

.agent-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-8) var(--space-12);
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--surface-window);
  min-height: 0;
  position: relative;
  scroll-behavior: smooth;
}

/* 对话进度导航：侧边 "-" 标记列，点击跳到对应消息 */
.msg-nav {
  position: sticky;
  top: 8px;
  z-index: 3;
  align-self: flex-end;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 4px;
  margin-top: -4px;
  margin-right: -6px;
  background: color-mix(in srgb, var(--surface-window) 85%, transparent);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  pointer-events: none;
}
.msg-nav-mark {
  pointer-events: auto;
  width: 14px;
  height: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-quiet);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  border-radius: 3px;
  transition: color 0.15s, background 0.15s, width 0.15s;
}
.msg-nav-mark:hover {
  color: var(--text-strong);
  background: var(--surface-raised);
  width: 18px;
}
.msg-nav-mark.active {
  color: var(--accent, #3b82f6);
  font-weight: 700;
  width: 18px;
  background: color-mix(in srgb, var(--accent, #3b82f6) 15%, transparent);
}

.agent-messages::-webkit-scrollbar {
  width: 4px;
}

.agent-messages::-webkit-scrollbar-thumb {
  background: var(--surface-raised);
  border-radius: 2px;
}

.agent-messages::-webkit-scrollbar-track {
  background: transparent;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-quiet);
  text-align: center;
  padding: 20px;
}

.empty-avatar {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-12);
  object-fit: cover;
  margin-bottom: var(--space-12);
  box-shadow: 0 0 16px var(--status-ok-glow);
}

.empty-suggest {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-6);
  margin-top: var(--space-12);
  max-width: 220px;
}

.suggest-chip {
  border: 1px solid var(--border-default);
  background: var(--surface-panel-2);
  color: var(--text-subtle);
  font-size: 12px;
  padding: var(--space-4) var(--space-8);
  border-radius: 999px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.suggest-chip:hover {
  border-color: var(--info);
  color: var(--info);
  background: var(--info-subtle);
}

.empty-text {
  font-size: 14px;
  color: var(--text-subtle);
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-quiet);
  max-width: 200px;
}

.msg-enter-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.msg-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.msg-leave-active {
  transition: opacity 0.12s ease;
}

.msg-leave-to {
  opacity: 0;
}

.msg-move {
  transition: transform 0.2s ease;
}

.message {
  display: flex;
  gap: 8px;
  max-width: 100%;
  flex-shrink: 0;
}

.message.user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message.assistant {
  align-self: flex-start;
  width: calc(100% - 34px);
}

.message-avatar {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-6);
  background: var(--surface-panel-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-subtle);
  flex-shrink: 0;
  overflow: hidden;
}

.message-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.message.user .message-avatar {
  background: var(--surface-raised);
}

.message-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: 0 var(--space-4);
}

.msg-label {
  font-size: 10px;
  color: var(--text-quiet);
}

.msg-copy {
  border: none;
  background: transparent;
  color: var(--text-quiet);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-4);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.message-content:hover .msg-copy {
  opacity: 1;
}

.msg-copy:hover {
  color: var(--info);
  background: var(--info-subtle);
}

.message-text {
  padding: var(--space-8) var(--space-12);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--surface-panel-1);
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
  white-space: pre-wrap;
}

/* AI 长消息折叠：默认只露 5 行，多余收进 ∨ 展开 */
.message-text.msg-collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.msg-fold {
  display: block;
  margin: 2px auto 0;
  padding: 1px 10px;
  border: none;
  background: transparent;
  color: var(--text-quiet);
  font-size: 11px;
  cursor: pointer;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}
.msg-fold:hover {
  color: var(--text-strong);
  background: var(--surface-raised);
}

.message.user .message-text {
  background: var(--surface-raised);
  color: var(--text-strong);
}

/* 链路消息下方的最终总结文字：与 PipelineView 同底色，独立成块 */
.message.assistant .msg-text-plain {
  background: var(--surface-panel-1);
  border: 1px solid var(--border-default);
}

.message-time {
  font-size: 10px;
  color: var(--text-quiet);
  padding: 0 4px;
}

/* F3（A 方案）：任务失败后的"重试"按钮 */
.msg-image {
  margin: 8px 0 4px;
  max-width: 320px;
}

.msg-image img {
  width: 100%;
  max-height: 280px;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid var(--border-default);
  background: var(--surface-panel-1);
  display: block;
}

.msg-image-actions {
  margin-top: 6px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.save-img-btn {
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-subtle);
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.save-img-btn:hover {
  color: var(--info);
  border-color: var(--info);
  background: var(--info-subtle);
}

.img-saved {
  font-size: 12px;
  color: var(--status-ok);
}

.retry-row {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.retry-btn {
  background: var(--surface-field);
  color: var(--text-strong);
  border: 1px solid var(--border-field);
  border-radius: 6px;
  font-size: 12px;
  padding: 4px 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.retry-btn:hover {
  background: var(--surface-raised);
}

.retry-btn:active {
  background: var(--surface-inset);
}

.message.user .message-time {
  text-align: right;
}

.agent-input-area {
  flex-shrink: 0;
  background: var(--surface-panel-1);
  border-top: 1px solid var(--border-default);
  padding: 8px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-btn {
  background: transparent;
  border: none;
  color: var(--text-subtle);
  padding: var(--space-4) var(--space-4);
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
}

.mirror-btn {
    color: var(--accent, #2E7D8C);
    border: 1px solid var(--accent, #2E7D8C);
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 12px;
    background: rgba(46, 125, 140, 0.08);
  }
  .mirror-btn:hover:not(:disabled) {
    background: rgba(46, 125, 140, 0.18);
    color: var(--accent-strong, #4aa3b5);
  }
  .mirror-btn.active {
    background: var(--accent, #2E7D8C);
    color: #fff;
  }

.toolbar-btn:hover {
  background: var(--surface-raised);
  color: var(--text-primary);
}
.quote-btn {
  border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 4px; padding: 2px 8px;
  font-size: 11px; color: #8AA0A6; background: transparent; cursor: pointer; transition: all .15s;
}
.quote-btn:hover { color: #4EC9B0; border-color: rgba(78, 201, 176, 0.35); }
.quote-btn.active { color: #4EC9B0; border-color: rgba(78, 201, 176, 0.4); background: rgba(78, 201, 176, 0.08); }

.model-selector {
  font-size: 12px;
  color: var(--text-subtle);
}

.model-arrow {
  font-size: 10px;
  margin-left: 2px;
  color: var(--text-quiet);
}

.input-hint {
  font-size: 10px;
  color: var(--text-quiet);
  text-align: right;
  padding-right: var(--space-4);
  user-select: none;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.agent-input {
  flex: 1;
  padding: var(--space-8) var(--space-8);
  background: var(--surface-window);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.45;
  outline: none;
  resize: none;
  min-height: 30px;
  max-height: 132px;
  font-family: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
  min-width: 0;
}

.agent-input::placeholder {
  color: var(--text-quiet);
}

.agent-input:focus {
  border-color: var(--info);
  box-shadow: 0 0 0 3px var(--info-ring);
}

.send-btn {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: none;
  background: var(--info);
  color: var(--text-inverse);
  font-size: var(--fs-16);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, opacity 0.2s;
  flex-shrink: 0;
}

.send-btn:active:not(:disabled) {
  transform: scale(0.94);
}

.send-btn:hover:not(:disabled) {
  background: var(--info-hover-2);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.send-btn .send-icon {
  transition: transform 0.18s ease;
}
.send-btn:hover:not(:disabled) .send-icon {
  transform: translate(1px, -1px);
}

.spinner {
  animation: spin 1s linear infinite;
  display: inline-block;
  font-size: 16px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.onboard-card {
  margin: 8px 0;
  padding: 10px 12px;
  border: 1px solid var(--border-default, #333);
  border-left: 3px solid #8BC8EA;
  border-radius: 8px;
  background: rgba(139, 200, 234, 0.06);
  font-size: 12px;
  color: var(--text-bright, #ddd);
  line-height: 1.6;
}
.onboard-title {
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-bright, #fff);
}
.onboard-row { margin-bottom: 3px; }
.onboard-row b { color: var(--text-subtle, #999); font-weight: 500; }

.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 12.5px;
  padding: 6px 0 2px;
}
.thinking-dots {
  display: inline-flex;
  gap: 3px;
}
.thinking-dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--info);
  display: inline-block;
  animation: thinking-bounce 1.2s infinite ease-in-out;
}
.thinking-dots i:nth-child(2) { animation-delay: 0.15s; }
.thinking-dots i:nth-child(3) { animation-delay: 0.3s; }
@keyframes thinking-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.45; }
  30% { transform: translateY(-3px); opacity: 1; }
}
</style>

<!-- 共绘蓝图模式确认框：统一成软件深色主题（Element MessageBox 挂 body，需全局样式） -->
<style>
.mh-confirm.el-message-box {
  background: var(--surface-panel-1, #0E1518);
  border: 1px solid var(--border-mid, #2A3A42);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.mh-confirm .el-message-box__title {
  color: var(--text-bright, #fff);
}
.mh-confirm .el-message-box__message {
  color: var(--text-primary, #D8E0E4);
}
.mh-confirm .el-message-box__btns .el-button {
  background: var(--surface-raised, #1E2A30);
  border: 1px solid var(--border-mid, #2A3A42);
  color: var(--text-primary, #D8E0E4);
}
.mh-confirm .el-message-box__btns .el-button--primary {
  background: var(--accent, #2E7D8C);
  border-color: var(--accent, #2E7D8C);
  color: #fff;
}
.mh-confirm .el-message-box__headerbtn .el-message-box__close {
  color: var(--text-muted, #8A9AA0);
}
</style>
