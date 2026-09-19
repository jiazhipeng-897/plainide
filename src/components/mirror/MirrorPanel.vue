<!-- src/components/mirror/MirrorPanel.vue -->
<template>
  <div v-if="visible" class="mirror-panel">
    <div class="mirror-header">
      <span class="mirror-title">构思核心</span>
      <span class="mirror-file">{{ fileShort }}</span>
      <button class="mirror-close" title="关闭" @click="$emit('close')">✕</button>
    </div>

    <div class="mirror-body">
      <!-- 上框：只读大白话 -->
      <div class="mirror-section">
        <div class="mirror-section-label">
          大白话（只读）
          <button class="mirror-retranslate" :disabled="translating" @click="onTranslate">
            {{ translating ? '翻译中…' : '重新翻译' }}
          </button>
        </div>
        <pre class="mirror-plain" v-html="displayText"></pre>
      </div>

      <!-- 下框：用户修改意见 -->
      <div class="mirror-section">
        <div class="mirror-section-label">你的修改意见</div>
        <textarea
          v-model="userRequest"
          class="mirror-input"
          placeholder="想改成什么样？说大白话就行，比如：把登录校验的返回值改成字典格式，加上超时提示……"
          :disabled="evaluating || playing || !!evalResult"
        ></textarea>
        <div class="mirror-actions">
          <button
            class="mirror-btn mirror-btn-primary"
            :disabled="evaluating || playing || !userRequest.trim() || !!evalResult"
            @click="onSubmit"
          >
            {{ evaluating ? '评估中…' : '提交修改意见' }}
          </button>
        </div>
      </div>

      <!-- 评估结果：确认区 -->
      <div v-if="evalResult" class="mirror-eval">
        <div class="mirror-eval-risk" :class="'risk-' + (evalResult.risk || 'mid')">
          风险：{{ riskText }}
        </div>
        <div class="mirror-eval-question">{{ evalResult.question }}</div>
        <div v-if="evalResult.verdict !== 'ok'" class="mirror-eval-warn">
          未执行修改，请根据提示调整后再提交。
        </div>
        <div v-if="evalResult.verdict === 'ok'" class="mirror-eval-btns">
          <button class="mirror-btn" :disabled="playing" @click="evalResult = null">取消</button>
          <button class="mirror-btn mirror-btn-primary" :disabled="playing" @click="onConfirm">
            {{ playing ? '正在写入…' : '确认执行' }}
          </button>
        </div>
      </div>
    </div>

    <div class="mirror-footer">
      <span class="mirror-hint">{{ footerHint }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { useEditorStore } from '@/stores/editor'
import { useProjectStore } from '@/stores/project'
import { mirrorTranslate, mirrorEvaluate, mirrorApply } from '@/services/mirrorService'
import { usePatchPlayer } from '@/composables/usePatchPlayer'

const props = defineProps({
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const editorStore = useEditorStore()
const projectStore = useProjectStore()

const plainText = ref('')
const displayText = ref('')
const userRequest = ref('')
const translating = ref(false)
const evaluating = ref(false)
const playing = ref(false)
const evalResult = ref(null)

let typewriterTimer = null
let typewriterSeq = 0

const { playPatches } = usePatchPlayer()

const filePath = computed(() => editorStore.activeFile)
const projectPath = computed(() => projectStore.projectPath || '')
const fileShort = computed(() => {
  const p = filePath.value || ''
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || '未打开文件'
})
const riskText = computed(() => ({ low: '低', mid: '中', high: '高' })[evalResult.value?.risk] || '中')
const footerHint = computed(() => {
  if (playing) return '正在把修改写进代码（可看到删除/写入过程）…'
  if (evaluating) return '评估中：AI 正在对比你的意见和当前代码…'
  if (translating) return '翻译中：AI 正在把代码讲成大白话…'
  if (!filePath.value) return '请先在编辑器中打开一个代码文件'
  return '大白话 ↔ 代码双向桥 · 单文件 · 点对点修改'
})

// 流式打字（表演层：整段拿到后逐字显示）
function typewriter(text) {
  const seq = ++typewriterSeq
  displayText.value = ''
  let i = 0
  const step = () => {
    if (seq !== typewriterSeq) return
    if (i <= text.length) {
      displayText.value = text.slice(0, i)
      i += 3
      typewriterTimer = setTimeout(step, 12)
    }
  }
  step()
}

async function onTranslate() {
  if (!filePath.value) {
    ElMessage.warning('请先在编辑器中打开一个代码文件')
    return
  }
  if (!projectPath.value) {
    ElMessage.warning('请先打开项目')
    return
  }
  translating.value = true
  evalResult.value = null
  try {
    const res = await mirrorTranslate(projectPath.value, filePath.value)
    if (res?.success && res.plain_text) {
      plainText.value = res.plain_text
      typewriter(res.plain_text)
      ElMessage.success('翻译完成')
    } else {
      ElMessage.error(res?.error || '翻译失败')
    }
  } catch (err) {
    ElMessage.error(err?.message || '翻译失败')
  } finally {
    translating.value = false
  }
}

async function onSubmit() {
  if (!filePath.value || !projectPath.value) return
  evaluating.value = true
  evalResult.value = null
  try {
    const res = await mirrorEvaluate(projectPath.value, filePath.value, userRequest.value)
    if (!res?.success) {
      ElMessage.error(res?.error || '评估失败')
      return
    }
    evalResult.value = res
    if (res.verdict === 'unclear' || res.verdict === 'conflict') {
      ElMessage.warning(res.question || '评估未通过')
    }
  } catch (err) {
    ElMessage.error(err?.message || '评估失败')
  } finally {
    evaluating.value = false
  }
}

async function onConfirm() {
  const editor = editorStore.monacoInstance
  if (!editor) {
    ElMessage.warning('编辑器实例不可用，请重试')
    return
  }
  const patches = evalResult.value?.patches || []
  if (!patches.length) {
    ElMessage.warning('没有可执行的补丁')
    return
  }
  playing.value = true
  try {
    // 1. 播放：Monaco 内先标红删除、再逐段写入（磁盘未动）
    const results = await playPatches(patches, { editor }, { deleteDelay: 500, charDelay: 14 })
    const failed = results.filter((r) => !r.ok)
    if (failed.length) {
      ElMessage.warning(`有 ${failed.length} 处未定位到目标片段，未写入磁盘`)
    }
    // 2. 落盘：语法门禁 + apply_patches（内含快照）+ 反向更新大白话
    const res = await mirrorApply(
      projectPath.value,
      filePath.value,
      patches,
      evalResult.value?.updated_plain || {},
    )
    if (res?.success) {
      if (res.plain_text) {
        plainText.value = res.plain_text
        displayText.value = res.plain_text
      }
      ElMessage.success('修改已写入')
      // 通知编辑器刷新（文件已落盘）
      window.dispatchEvent(new CustomEvent('editor-refresh'))
    } else {
      ElMessage.error(res?.error || '写入失败')
    }
    evalResult.value = null
    userRequest.value = ''
  } catch (err) {
    ElMessage.error(err?.message || '执行失败')
  } finally {
    playing.value = false
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      // 打开时：如果还没翻译过且已有文件，自动翻译
      if (filePath.value && projectPath.value && !plainText.value && !translating.value) {
        onTranslate()
      }
    }
  },
)

watch(filePath, () => {
  // 切换文件：清空面板状态，等用户点翻译（或自动翻译由 visible watch 处理）
  plainText.value = ''
  displayText.value = ''
  userRequest.value = ''
  evalResult.value = null
  typewriterSeq++
})

onBeforeUnmount(() => {
  typewriterSeq++
  if (typewriterTimer) clearTimeout(typewriterTimer)
})
</script>

<style scoped>
.mirror-panel {
  position: fixed;
  top: 64px;
  right: 16px;
  width: 440px;
  max-width: calc(100vw - 32px);
  height: calc(100vh - 128px);
  display: flex;
  flex-direction: column;
  background: var(--surface-panel-1, #1a2229);
  border: 1px solid var(--border-default, #2a3a42);
  border-radius: var(--radius-8, 8px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  z-index: 1000;
  overflow: hidden;
}
.mirror-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--surface-raised, #1e2a30);
  border-bottom: 1px solid var(--border-default, #2a3a42);
}
.mirror-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--accent, #2e7d8c);
}
.mirror-file {
  flex: 1;
  font-size: 12px;
  color: var(--text-subtle, #8b9aa5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mirror-close {
  background: transparent;
  border: none;
  color: var(--text-subtle, #8b9aa5);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 6px;
}
.mirror-close:hover { color: var(--text-primary, #e6edf3); }
.mirror-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.mirror-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mirror-section-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-subtle, #8b9aa5);
}
.mirror-retranslate {
  background: transparent;
  border: 1px solid var(--border-default, #2a3a42);
  color: var(--accent, #2e7d8c);
  border-radius: 4px;
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
}
.mirror-retranslate:disabled { opacity: 0.5; cursor: not-allowed; }
.mirror-plain {
  margin: 0;
  min-height: 120px;
  max-height: 220px;
  overflow-y: auto;
  background: var(--surface-inset, #141b21);
  border: 1px solid var(--border-default, #2a3a42);
  border-radius: var(--radius-6, 6px);
  padding: 10px 12px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary, #e6edf3);
  white-space: pre-wrap;
  word-break: break-word;
}
.mirror-input {
  min-height: 84px;
  resize: vertical;
  background: var(--surface-inset, #141b21);
  border: 1px solid var(--border-default, #2a3a42);
  border-radius: var(--radius-6, 6px);
  padding: 10px 12px;
  color: var(--text-primary, #e6edf3);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
}
.mirror-input:focus { outline: none; border-color: var(--accent, #2e7d8c); }
.mirror-actions { display: flex; justify-content: flex-end; }
.mirror-btn {
  background: transparent;
  border: 1px solid var(--border-mid, #2a3a42);
  color: var(--text-primary, #e6edf3);
  border-radius: var(--radius-6, 6px);
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
}
.mirror-btn:hover:not(:disabled) { background: var(--surface-raised, #1e2a30); }
.mirror-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.mirror-btn-primary {
  background: var(--accent, #2e7d8c);
  border-color: var(--accent, #2e7d8c);
  color: #fff;
}
.mirror-btn-primary:hover:not(:disabled) { background: var(--accent-strong, #25697a); }
.mirror-eval {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--surface-raised, #1e2a30);
  border: 1px solid var(--border-mid, #2a3a42);
  border-radius: var(--radius-6, 6px);
  padding: 10px 12px;
}
.mirror-eval-risk {
  font-size: 12px;
  color: var(--text-subtle, #8b9aa5);
}
.mirror-eval-risk.risk-low { color: #52c41a; }
.mirror-eval-risk.risk-mid { color: #d9a441; }
.mirror-eval-risk.risk-high { color: #ff6b6b; }
.mirror-eval-question {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary, #e6edf3);
}
.mirror-eval-warn {
  font-size: 12px;
  color: #ff8a8a;
}
.mirror-eval-btns {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.mirror-footer {
  padding: 8px 14px;
  border-top: 1px solid var(--border-default, #2a3a42);
}
.mirror-hint {
  font-size: 11px;
  color: var(--text-subtle, #8b9aa5);
}
</style>
