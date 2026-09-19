<template>
  <div class="bottom-panel" :style="{ height: height + 'px' }">
    
    <!-- ===== 左侧区域 ===== -->
    <div class="bottom-left">
      <!-- 顶部切换按钮 -->
      <div class="panel-switcher">
        <div 
          class="switch-btn" 
          :class="{ active: currentView === 'terminal' }"
          @click="currentView = 'terminal'"
        >
          终端
        </div>
        <div 
          class="switch-btn" 
          :class="{ active: currentView === 'errors' }"
          @click="currentView = 'errors'"
        >
          报错
        </div>
        <!-- ===== 新增：终端设置入口 ===== -->
        <div 
          class="switch-btn" 
          :class="{ active: currentView === 'debug' }"
          @click="currentView = 'debug'"
        >
          调试
        </div>
        <div 
          class="switch-btn terminal-settings" 
          @click="openTerminalSettings" 
          title="终端设置"
        >
          ⚙️
        </div>
      </div>

      <!-- 内容区域 -->
      <div class="panel-content">
        <div v-show="currentView === 'terminal'" class="full-page">
          <Terminal ref="terminalRef" />
        </div>
        <div v-show="currentView === 'errors'" class="full-page">
          <ErrorsPanel ref="errorsRef" />
        </div>
        <div v-show="currentView === 'debug'" class="full-page">
          <DebugPanel />
        </div>
      </div>
    </div>

    <!-- ===== 中间分割线 ===== -->
    <div class="vertical-divider"></div>

    <!-- ===== 右侧区域：AST树 ===== -->
    <div class="bottom-right">
      <ASTTree />
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Terminal } from '@/components/terminal'
import { ErrorsPanel } from '@/components/diagnostics'
import { ASTTree } from '@/components/ai-features'
import DebugPanel from './DebugPanel.vue'

const props = defineProps({
  height: { type: Number, default: 200 },
})

const currentView = ref('terminal')
const terminalRef = ref(null)
const errorsRef = ref(null)

// ===== 新增：打开终端设置 =====
const openTerminalSettings = () => {
  terminalRef.value?.forceOpenSelector?.()
}

defineExpose({
  clearTerminal: () => terminalRef.value?.clear?.(),
  clearErrors: () => errorsRef.value?.clearErrors?.(),
})
</script>

<style scoped>
.bottom-panel {
  display: flex;
  flex-direction: row;
  border-top: 1px solid var(--border-default);
  flex-shrink: 0;
  background: var(--surface-window);
  overflow: hidden;
}

/* ===== 左侧区域 ===== */
.bottom-left {
  flex: 1;
  min-width: 0;
  background: var(--surface-window);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 
  修正：
  1. 高度 30px，和右边 AST 对齐。
  2. 背景 var(--surface-panel-1)，和右边 AST 对齐。
  3. 底部加一条 border-bottom 线，就是你红箭头指的地方！
*/
.panel-switcher {
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 30px;
  background: var(--surface-panel-1);
  border-bottom: 1px solid var(--border-default); /* 👈 线在这里加上了 */
  flex-shrink: 0;
}

.switch-btn {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 0 12px;
  height: 100%;
  display: flex;
  align-items: center;
  transition: color 0.2s;
  user-select: none;
}
.switch-btn:hover {
  color: var(--text-status);
}
.switch-btn.active {
  color: var(--info);
}

/* ===== 新增：终端设置按钮样式 ===== */
.switch-btn.terminal-settings {
  margin-left: auto;
  font-size: 14px;
  padding: 0 8px;
  opacity: 0.6;
}

.switch-btn.terminal-settings:hover {
  opacity: 1;
  color: var(--text-bright);
}

.panel-content {
  flex: 1;
  overflow: hidden;
  position: relative;
  background: var(--surface-window);
}
.full-page {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

/* ===== 中间分隔白线 ===== */
.vertical-divider {
  width: 1px;
  background-color: var(--surface-raised);
  flex-shrink: 0;
}

/* ===== 右侧区域：AST树 ===== */
.bottom-right {
  width: 40%;
  min-width: 150px;
  background: var(--surface-window);
  overflow: hidden;
}
</style>