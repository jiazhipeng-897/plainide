<template>
  <div class="debug-panel">
    <!-- ===== 顶部控制栏 ===== -->
    <div class="debug-toolbar">
      <span class="dbg-status" :class="statusClass">{{ statusText }}</span>

      <template v-if="debugStore.isDebugging">
        <button class="dbg-btn" :disabled="!debugStore.paused" title="继续 (F5)" @click="resume">
          ▶ 继续
        </button>
        <button class="dbg-btn" :disabled="!debugStore.running" title="暂停" @click="debugStore.pause()">
          ⏸ 暂停
        </button>
        <button class="dbg-btn" :disabled="!debugStore.paused" title="单步跳过" @click="step('next')">
          ⤵ 单步
        </button>
        <button class="dbg-btn" :disabled="!debugStore.paused" title="单步进入" @click="step('step-in')">
          ⬇ 进入
        </button>
        <button class="dbg-btn" :disabled="!debugStore.paused" title="单步退出" @click="step('step-out')">
          ⬆ 退出
        </button>
        <button class="dbg-btn danger" title="终止调试" @click="stop">■ 终止</button>
      </template>

      <template v-else>
        <button class="dbg-btn primary" :disabled="!canLaunch" title="使用当前文件 + 断点启动" @click="launch">
          ▶ 启动调试
        </button>
      </template>

      <span v-if="debugStore.error" class="dbg-error">{{ debugStore.error }}</span>
    </div>

    <!-- ===== 内容区 ===== -->
    <div v-if="debugStore.isDebugging" class="debug-body">
      <!-- 调用栈 -->
      <div class="dbg-col">
        <div class="dbg-col-head">调用栈</div>
        <div class="dbg-col-body">
          <div
            v-for="(f, i) in debugStore.stackFrames"
            :key="f.id"
            class="dbg-frame"
            :class="{ current: i === 0 }"
            @click="jumpToFrame(f)"
          >
            <span class="frame-name">{{ f.name }}</span>
            <span class="frame-loc">{{ fileName(f.path) }}:{{ f.line }}</span>
          </div>
          <div v-if="!debugStore.stackFrames.length" class="dbg-empty">—</div>
        </div>
      </div>

      <!-- 变量 -->
      <div class="dbg-col">
        <div class="dbg-col-head">变量</div>
        <div class="dbg-col-body">
          <VarNode
            v-for="(v, i) in debugStore.variables"
            :key="i"
            :variable="v"
            :depth="0"
          />
          <div v-if="!debugStore.variables.length" class="dbg-empty">—</div>
        </div>
      </div>

      <!-- 输出 -->
      <div class="dbg-col">
        <div class="dbg-col-head">输出</div>
        <div class="dbg-col-body dbg-output">
          <div v-for="(o, i) in debugStore.output" :key="i" class="dbg-out-line">
            <span v-if="o.category === 'stderr'" class="out-err">{{ o.text }}</span>
            <span v-else>{{ o.text }}</span>
          </div>
          <div v-if="!debugStore.output.length" class="dbg-empty">—</div>
        </div>
      </div>
    </div>

    <div v-else class="debug-body dbg-idle">
      <div class="dbg-idle-tip">
        <p>在编辑器左侧行号处点击可设置/取消断点（红点）。</p>
        <p>启动调试后会在此显示调用栈、变量与程序输出。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useDebugStore } from '@/stores/debug'
import { useEditorStore } from '@/stores/editor'
import { ElMessage } from 'element-plus'
import { EVENT_EDITOR_JUMP } from '@/constants/eventNames'
import VarNode from './DebugVarNode.vue'

const debugStore = useDebugStore()
const editorStore = useEditorStore()

const canLaunch = computed(() => !!editorStore.activeFile)

const statusText = computed(() => {
  const map = { idle: '未调试', running: '运行中', paused: '已暂停', stopped: '已结束', error: '错误' }
  return map[debugStore.status] || debugStore.status
})
const statusClass = computed(() => 'st-' + debugStore.status)

const fileName = (p) => {
  if (!p) return ''
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1]
}

const launch = async () => {
  const res = await debugStore.launch(editorStore.activeFile, debugStore.breakpoints)
  if (res.ok) ElMessage.success('调试已启动')
  else ElMessage.error(res.error || '启动失败')
}

const resume = () => debugStore.resume()
const stop = () => debugStore.terminate()
const step = (kind) => debugStore.step(kind)

const jumpToFrame = (f) => {
  if (!f.path || !f.line) return
  window.dispatchEvent(
    new CustomEvent(EVENT_EDITOR_JUMP, { detail: { startLine: f.line, endLine: f.line } })
  )
}

// 快捷键：F5 继续
const onKey = (e) => {
  if (e.key === 'F5' && debugStore.isDebugging) {
    e.preventDefault()
    if (debugStore.paused) debugStore.resume()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  debugStore.stopPolling()
})
</script>

<style scoped>
.debug-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-window);
}
.debug-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-panel-1);
  flex-shrink: 0;
}
.dbg-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.05);
  margin-right: 4px;
}
.st-running { color: #52C41A; }
.st-paused { color: #FAAD14; }
.st-stopped { color: var(--text-muted); }
.st-error { color: #E5484D; }
.dbg-btn {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent;
  color: var(--text-status);
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.dbg-btn:hover:not(:disabled) {
  border-color: rgba(78, 201, 176, 0.5);
  color: #4EC9B0;
}
.dbg-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.dbg-btn.primary { background: rgba(78, 201, 176, 0.14); border-color: rgba(78, 201, 176, 0.4); color: #4EC9B0; }
.dbg-btn.danger:hover:not(:disabled) { border-color: rgba(229, 72, 77, 0.6); color: #E5484D; }
.dbg-error {
  font-size: 11px;
  color: #E5484D;
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.debug-body {
  flex: 1;
  display: flex;
  gap: 0;
  overflow: hidden;
  min-height: 0;
}
.dbg-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-default);
  overflow: hidden;
}
.dbg-col:last-child { border-right: none; }
.dbg-col-head {
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-panel-1);
  flex-shrink: 0;
}
.dbg-col-body {
  flex: 1;
  overflow: auto;
  padding: 4px 0;
  font-size: 12px;
}
.dbg-frame {
  display: flex;
  gap: 8px;
  padding: 3px 10px;
  cursor: pointer;
  color: var(--text-status);
}
.dbg-frame:hover { background: rgba(78, 201, 176, 0.08); }
.dbg-frame.current { background: rgba(78, 201, 176, 0.14); }
.frame-name { color: #4EC9B0; }
.frame-loc { color: var(--text-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dbg-output { font-family: 'Consolas', 'Courier New', monospace; padding: 4px 10px; }
.dbg-out-line { white-space: pre-wrap; word-break: break-all; color: var(--text-status); }
.out-err { color: #E5484D; }
.dbg-empty { color: var(--text-muted); text-align: center; padding: 12px 0; }
.dbg-idle { display: flex; align-items: center; justify-content: center; }
.dbg-idle-tip { text-align: center; color: var(--text-muted); font-size: 12.5px; line-height: 1.9; }
</style>
