<template>
  <div class="api-settings">
    <!-- 通用设置（与 API 配置无关的全局选项） -->
    <div class="general-block">
      <div class="general-label">通用</div>
      <div class="general-row">
        <span class="general-text">界面音效</span>
        <el-switch v-model="soundOn" @change="onSoundChange" size="small" />
      </div>
      <el-divider class="general-divider" />
      <div class="general-row">
        <span class="general-text">AI 代码补全</span>
        <el-switch v-model="aiCompletionOn" @change="onAiCompletionChange" size="small" />
      </div>
      <el-divider class="general-divider" />
      <div class="general-row">
        <span class="general-text">AI 联网搜索</span>
        <el-switch v-model="config.webSearch" size="small" />
        <span class="general-hint">开启后 AI 可联网查资料（仅豆包/OpenAI/百度支持，DeepSeek 等自动不生效）</span>
      </div>
      <el-divider class="general-divider" />
      <div class="general-row">
        <span class="general-text">快照存储位置</span>
        <div class="snapshot-dir-wrap">
          <el-input
            v-model="snapshotDir"
            class="snapshot-dir-input"
            placeholder="留空 = 项目内 .mycode/shadow"
            clearable
            size="small"
          />
          <el-button size="small" @click="pickSnapshotDir">选择</el-button>
        </div>
      </div>
      <el-divider class="general-divider" />
    </div>

    <el-form label-width="100px" size="default">
      <el-form-item label="服务商">
        <el-select v-model="config.provider" placeholder="选择大模型服务商" @change="onProviderChange">
          <el-option
            v-for="(meta, key) in PROVIDER_DEFAULTS"
            :key="key"
            :label="meta.label"
            :value="key"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="API Key">
        <el-input
          v-model="config.api_key"
          type="password"
          :placeholder="config.api_key ? '已保存，如需更换请直接输入' : `请输入 ${currentLabel} 的 API Key`"
          show-password
        />
      </el-form-item>

      <el-form-item label="模型">
        <el-input
          v-model="config.model"
          :placeholder="`模型名称，如 ${getDefaultModel(config.provider)}`"
        />
      </el-form-item>

      <el-form-item label="API地址">
        <el-input
          v-model="config.base_url"
          placeholder="API地址，留空使用默认"
        />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="saveConfig" :loading="saving">
          保存配置
        </el-button>
        <el-button @click="testConnection" :loading="testing">
          测试连接
        </el-button>
      </el-form-item>
    </el-form>

    <div v-if="testResult" class="test-result" :class="testResult.success ? 'success' : 'error'">
      <span>{{ testResult.message }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  PROVIDER_DEFAULTS,
  getDefaultBaseUrl,
  getDefaultModel,
} from '../../constants/providerConfig'
import { useAgentStore } from '@/stores/agent'
import { isSoundEnabled, setSoundEnabled, sfx } from '@/utils/sound'
import { isAiCompletionEnabled } from '@/services/aiCompletionService'

const agentStore = useAgentStore()

// 音效开关（独立于 API 配置，localStorage 持久化）
const soundOn = ref(isSoundEnabled())
const onSoundChange = (v) => {
  setSoundEnabled(v)
  if (v) sfx.click() // 开启时给一声即时反馈
}

// AI 代码补全开关（localStorage 持久化，默认开）
const aiCompletionOn = ref(isAiCompletionEnabled())
const onAiCompletionChange = (v) => {
  try {
    localStorage.setItem('ai-completion-enabled', v ? 'true' : 'false')
  } catch (e) {}
}

// 快照存储位置（随 API 配置一起落盘 api-config.json；留空 = 项目内 .mycode/shadow）
const snapshotDir = ref('')

// 弹系统目录选择器，选取后填入输入框（复用 select-folder，标题定制为快照目录）
const pickSnapshotDir = async () => {
  try {
    const dir = await window.electronAPI.selectFolder({ title: '选择快照存储目录' })
    if (dir) snapshotDir.value = dir
  } catch (err) {
    console.error('选择快照目录失败:', err)
  }
}

const config = reactive({
  provider: 'deepseek',
  api_key: '',
  model: '',
  base_url: '',
  webSearch: false,
})

// 全厂商配置表（仅内存态，点保存才落盘）
const allProviders = reactive({})

const saving = ref(false)
const testing = ref(false)
const testResult = ref(null)

const currentLabel = computed(() => PROVIDER_DEFAULTS[config.provider]?.label || config.provider)

// 从配置表取某厂商已保存值（无则空白），model/base_url 无保存时给默认值
const applyProviderConfig = (provider) => {
  const saved = allProviders[provider] || {}
  config.api_key = saved.api_key || ''
  config.model = saved.model || getDefaultModel(provider)
  config.base_url = saved.base_url || getDefaultBaseUrl(provider)
}

onMounted(async () => {
  // 加载已保存的配置（新结构 { current, providers }，兼容旧扁平结构）
  try {
    const saved = await window.electronAPI.getApiConfig()
    if (saved) {
      snapshotDir.value = typeof saved.snapshot_dir === 'string' ? saved.snapshot_dir : ''
      config.webSearch = typeof saved.web_search === 'boolean' ? saved.web_search : false
      if (saved.providers && typeof saved.providers === 'object') {
        Object.assign(allProviders, saved.providers)
        config.provider = saved.current || 'deepseek'
      } else {
        // 旧扁平结构
        config.provider = saved.provider || 'deepseek'
        allProviders[config.provider] = {
          api_key: saved.api_key || '',
          model: saved.model || '',
          base_url: saved.base_url || '',
        }
      }
    }
    applyProviderConfig(config.provider)
  } catch (err) {
    console.error('加载配置失败:', err)
    applyProviderConfig(config.provider)
  }
})

const onProviderChange = () => {
  applyProviderConfig(config.provider)
  // 切换厂商时清空测试结果
  testResult.value = null
}

const buildFullConfig = () => {
  // 把当前编辑值写回该厂商，返回完整存储结构
  allProviders[config.provider] = {
    api_key: config.api_key || '',
    model: config.model || '',
    base_url: config.base_url || '',
  }
  return {
    current: config.provider,
    providers: JSON.parse(JSON.stringify(allProviders)),
    snapshot_dir: snapshotDir.value.trim(),
    web_search: !!config.webSearch,
  }
}

const saveConfig = async () => {
  if (!config.api_key) {
    ElMessage.warning('请输入 API Key')
    return
  }

  // DeepSeek 旧模型名自动升级（deepseek-chat / deepseek-reasoner 官方已弃用）
  if (config.provider === 'deepseek' && ['deepseek-chat', 'deepseek-reasoner'].includes(config.model.trim())) {
    config.model = getDefaultModel('deepseek')
    ElMessage.info('DeepSeek 旧模型名已自动升级为 ' + config.model)
  }

  saving.value = true
  try {
    await window.electronAPI.saveApiConfig(buildFullConfig())
    // 保存后立即同步 Agent 面板的当前厂商标签
    agentStore.setProvider(config.provider)
    await agentStore.syncProviderFromConfig()
    ElMessage.success('配置保存成功')
  } catch (err) {
    ElMessage.error('保存失败: ' + err.message)
  } finally {
    saving.value = false
  }
}

const testConnection = async () => {
  if (!config.api_key) {
    ElMessage.warning('请先保存 API Key')
    return
  }

  testing.value = true
  testResult.value = null

  try {
    // 先保存配置再测试
    await window.electronAPI.saveApiConfig(buildFullConfig())

    const result = await window.electronAPI.callPythonAPI('/test-connection', {
      provider: config.provider,
    })

    if (result.success) {
      testResult.value = { success: true, message: '✅ 连接成功！' }
      ElMessage.success('连接成功')
    } else {
      testResult.value = { success: false, message: '❌ 连接失败: ' + (result.error || '未知错误') }
      ElMessage.error('连接失败')
    }
  } catch (err) {
    testResult.value = { success: false, message: '❌ 请求失败: ' + err.message }
    ElMessage.error('请求失败')
  } finally {
    testing.value = false
  }
}
</script>

<style scoped>
.api-settings {
  padding: var(--space-8) 0;
}

.api-settings :deep(.el-form-item) {
  margin-bottom: var(--space-16);
}

.general-block {
  margin-bottom: var(--space-16);
}
.general-label {
  font-size: 12px;
  color: var(--text-tertiary, #6A7A82);
  letter-spacing: 1px;
  margin-bottom: var(--space-8);
}
.general-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) 0;
}
.general-text {
  font-size: 13px;
  color: var(--text-primary, #E6EDF3);
}
.general-hint {
  font-size: 12px;
  color: #888;
  margin-left: 8px;
  opacity: 0.8;
}
.general-divider {
  margin: var(--space-12) 0;
}
.snapshot-dir-input {
  width: 220px;
  --el-input-bg-color: var(--bg-elevated, #161B22);
  --el-input-border-color: var(--border-color, #30363D);
  --el-input-text-color: var(--text-primary, #E6EDF3);
  --el-input-placeholder-color: var(--text-tertiary, #6A7A82);
}
.snapshot-dir-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}
.test-result {
  margin-top: 12px;
  padding: var(--space-8) var(--space-12);
  border-radius: 6px;
  font-size: 13px;
}
.test-result.success {
  background: var(--status-ok-badge);
  color: var(--status-ok);
  border: 1px solid var(--status-ok-badge-border);
}
.test-result.error {
  background: var(--status-err-badge-soft);
  color: var(--status-err);
  border: 1px solid var(--status-err-badge-border-soft);
}
</style>
