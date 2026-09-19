<!-- AgentTab.vue -->
<template>
  <div class="tab-content agent-content">
    <div class="agent-container">
      <div class="agent-header">
        <h3>🤖 代码翻译官</h3>
        <p class="desc">将代码翻译成大白话结构化 JSON，流式渲染</p>
      </div>

      <div class="agent-body">
        <!-- 当前配置信息 -->
        <div class="config-info">
          <span class="label">当前厂商：</span>
          <span class="value">{{ providerLabel }}</span>
        </div>

        <!-- 翻译按钮 -->
        <el-button
          class="translate-btn"
          type="primary"
          size="large"
          :loading="loading"
          :disabled="!hasFile || loading"
          @click="handleTranslate"
        >
          {{ loading ? '翻译中...' : '🚀 开始翻译' }}
        </el-button>

        <!-- 文件信息 -->
        <div class="info-tips">
          <div class="tip-item">
            <span class="icon">📄</span>
            <span>当前文件：{{ fileName || '未打开文件' }}</span>
          </div>
          <div class="tip-item">
            <span class="icon">📁</span>
            <span>项目：{{ projectName || '未打开项目' }}</span>
          </div>
          <div class="tip-item">
            <span class="icon">💡</span>
            <span>翻译结果流式显示在「翻译内容」面板</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { useProjectStore } from '@/stores/project'
import { useAgentStore } from '@/stores/agent'

const emit = defineEmits(['translate'])

const editorStore = useEditorStore()
const projectStore = useProjectStore()
const agentStore = useAgentStore()

const loading = computed(() => agentStore.isTranslating)

const fileName = computed(() => {
  const file = editorStore.activeFile
  if (!file) return ''
  return file.split('/').pop() || file.split('\\').pop() || file
})

const projectName = computed(() => {
  const path = projectStore.projectPath
  if (!path) return ''
  return path.split('/').pop() || path.split('\\').pop() || path
})

const hasFile = computed(() => !!editorStore.activeFile)

const providerLabel = computed(() => {
  const map = {
    deepseek: 'DeepSeek',
    volcengine: '火山引擎（豆包）',
    qwen: '通义千问',
    tencent: '腾讯混元',
    baidu: '百度文心',
    minimax: 'MiniMax',
    kimi: 'Kimi',
    openai: 'OpenAI',
    mock: '模拟模式',
  }
  return map[agentStore.provider] || agentStore.provider
})

// 挂载时从已保存配置同步当前厂商（跟随设置里的切换）
onMounted(() => {
  agentStore.syncProviderFromConfig()
})

const handleTranslate = () => {
  emit('translate')
}
</script>

<style scoped>
.tab-content {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.tab-content::-webkit-scrollbar {
  width: 6px;
}
.tab-content::-webkit-scrollbar-thumb {
  background: var(--surface-raised);
  border-radius: var(--radius-4);
}

.agent-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
}

.agent-header {
  text-align: center;
  margin-bottom: 24px;
}

.agent-header h3 {
  color: var(--text-primary);
  font-size: 18px;
  margin-bottom: 6px;
}

.agent-header .desc {
  color: var(--text-subtle);
  font-size: 13px;
}

.agent-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 420px;
}

.config-info {
  font-size: 13px;
  color: var(--text-subtle);
  background: var(--surface-panel-1);
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--border-default);
}

.config-info .value {
  color: var(--status-warn);
  font-weight: 500;
}

.translate-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  background: var(--status-warn-badge);
  border: 1px solid var(--status-warn-badge-border);
  color: var(--status-warn);
  border-radius: 8px;
  transition: all 0.3s;
}

.translate-btn:hover:not(:disabled) {
  background: var(--status-warn-badge-2);
  border-color: var(--status-warn-badge-border-2);
  transform: translateY(-2px);
}

.translate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.info-tips {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: var(--space-12) var(--space-16);
  background: var(--surface-panel-1);
  border: 1px solid var(--border-default);
  border-radius: 8px;
}

.tip-item {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-subtle);
  font-size: 13px;
}

.tip-item .icon {
  font-size: 16px;
  width: 24px;
  text-align: center;
}
</style>