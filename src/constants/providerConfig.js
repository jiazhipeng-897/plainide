/**
 * API 服务商默认配置
 * 各服务商默认 base_url + 默认模型映射表
 * 模型名以各家官方 2026-09 最新稳定版本为准：
 *   DeepSeek V4（旧名 deepseek-chat 已弃用） / 豆包 Seed-Evolving / Qwen3.8 / 混元 / ERNIE 4.5 / MiniMax-M3 / Kimi K3
 */
export const PROVIDER_DEFAULTS = {
  deepseek: {
    label: 'DeepSeek',
    base_url: 'https://api.deepseek.com/v1',
    default_model: 'deepseek-v4-flash', // V4.1 非思考模式（deepseek-chat 的官方替代）
  },
  volcengine: {
    label: '火山引擎（豆包）',
    base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    default_model: 'doubao-seed-evolving', // 统一模型 ID，Agent/Coding 场景（已实测可用）
  },
  qwen: {
    label: '通义千问',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    default_model: 'qwen3.8-max',
  },
  tencent: {
    label: '腾讯混元',
    base_url: 'https://api.hunyuan.cloud.tencent.com/v1',
    default_model: 'hunyuan-turbos-latest',
  },
  baidu: {
    label: '百度文心',
    base_url: 'https://qianfan.baidubce.com/v2', // 千帆 ModelBuilder OpenAI 兼容端点
    default_model: 'ernie-4.5-turbo-128k',
  },
  minimax: {
    label: 'MiniMax',
    base_url: 'https://api.minimax.cn/v1',
    default_model: 'MiniMax-M3',
  },
  kimi: {
    label: 'Kimi（月之暗面）',
    base_url: 'https://api.moonshot.cn/v1',
    default_model: 'kimi-k3',
  },
  openai: {
    label: 'OpenAI',
    base_url: 'https://api.openai.com/v1',
    default_model: 'gpt-4o',
  },
}

/**
 * 获取指定服务商的默认 base_url
 */
export function getDefaultBaseUrl(provider) {
  return PROVIDER_DEFAULTS[provider]?.base_url || ''
}

/**
 * 获取指定服务商的默认模型
 */
export function getDefaultModel(provider) {
  return PROVIDER_DEFAULTS[provider]?.default_model || ''
}
