// src/composables/usePipelineStream.js
// 多 Agent 工作链路事件流（独立于 agent.vue，供消息层组装）
// 职责：创建流水线状态 / SSE 事件归约 / 订阅与发起请求
import { reactive } from 'vue'

export const STAGE_PENDING = 'pending'
export const STAGE_RUNNING = 'running'
export const STAGE_DONE = 'done'
export const STAGE_FAILED = 'failed'

// 创建一条独立的流水线状态（每条链路消息一个实例，互不污染）
export function createPipelineState() {
  return reactive({
    pipeline_id: '',
    status: 'pending',       // pending / running / paused / done / failed / cancelled
    message: '',
    total_ms: 0,
    stages: [],
    stage_summaries: [],
    artifacts: [],            // 已落盘文件 [{path, size}]
    changes: [],              // P1 变更日志：本次任务写盘文件 [{path, event, size}]
    toolExecs: [],            // 终端命令执行 [{cmd, status, exit_code, output, duration_ms}]
    mode: 'pipeline',         // 'pipeline' 开发链路 / 'chat' 闲聊直答
    chatReply: '',            // chat 模式的直接回复文本
    token_usage: null,        // P0 token 记账：{prompt_tokens, completion_tokens, total_tokens, calls, estimated}
    tier: '',                 // 前置分诊结果：t1 快捷 / t2 轻量 / t3 标准 / t4 完整
    error: '',
    // 动作可视（Cursor/Trae 风格）：当前正在读/写哪个文件 + 阶段内子任务进度
    actions: [],              // [{path, ts}] 动作流：最近正在写入的文件（限 4 条）
    stageProgress: {},        // {stageKey: {done, total}} 阶段内子任务进度
    // question 工具：agent 执行中向用户提问（Debugger 等）→ 前端弹问题卡片 → 回答回传
    pendingQuestion: null,    // {question_id, question, options} 或 null
  })
}

// P1 变更日志：写文件事件收集到 state.changes（前端折叠区展示，按 path 去重）
function upsertChange(state, data, event) {
  if (!data || !data.path) return
  const idx = state.changes.findIndex((c) => c.path === data.path)
  if (idx >= 0) {
    state.changes[idx].event = event
    if (data.size) state.changes[idx].size = data.size
    if (data.line_count != null) state.changes[idx].line_count = data.line_count
  } else {
    state.changes.push({ path: data.path, event, size: data.size || 0, line_count: data.line_count || 0 })
  }
}

// SSE 事件归约：把后端事件合并进流水线状态（纯函数式，无副作用外泄）
export function reducePipelineEvent(state, evt) {
  if (!evt || typeof evt !== 'object') return
  const { event, data } = evt
  if (!data) return

  // 非本流水线的事件（同一事件通道可能有多条流水线）忽略
  if (state.pipeline_id && data.pipeline_id && state.pipeline_id !== data.pipeline_id) return

  const setStage = (key, patch) => {
    const stage = state.stages.find((s) => s.key === key)
    if (stage) Object.assign(stage, patch)
  }

  switch (event) {
    case 'pipeline_started':
      state.pipeline_id = data.pipeline_id || ''
      state.status = 'running'
      state.message = data.message || ''
      state.error = ''
      state.total_ms = 0
      state.stages = (data.stages || []).map((s) => ({
        key: s.key,
        label: s.label,
        status: STAGE_PENDING,
        agent: '',
        duration_ms: 0,
        summary: '',
        error: '',
      }))
      state.stage_summaries = []
      state.artifacts = []
      state.changes = []
      state.toolExecs = []
      state.actions = []
      state.stageProgress = {}
      break

    case 'file_created':
      // 开发阶段：文件已创建（空文件），加入 artifacts 供文件树即时刷新
      if (data.progress) state.stageProgress.development = data.progress
      if (data.path) {
        const idx = state.artifacts.findIndex((a) => a.path === data.path)
        if (idx >= 0) {
          state.artifacts[idx].size = 0
        } else {
          state.artifacts.push({ path: data.path, size: 0 })
        }
      }
      upsertChange(state, data, 'file_created')
      break

    case 'file_writing':
      // 动作可视：文件内容正在分块写入（文件树黄点 + 动作流小字）
      if (data.path) {
        const last = state.actions[state.actions.length - 1]
        if (last && last.path === data.path) {
          last.ts = Date.now()
        } else {
          state.actions.push({ path: data.path, ts: Date.now() })
          if (state.actions.length > 4) state.actions.splice(0, state.actions.length - 4)
        }
      }
      break

    case 'file_written':
      // 开发阶段：单个文件写入完成，更新 artifacts 对应项
      if (data.progress) state.stageProgress.development = data.progress
      if (data.path) {
        const idx = state.artifacts.findIndex((a) => a.path === data.path)
        if (idx >= 0) {
          state.artifacts[idx].size = data.size || 0
          state.artifacts[idx].complete = data.complete !== false
          if (data.line_count != null) state.artifacts[idx].line_count = data.line_count
        } else {
          state.artifacts.push({ path: data.path, size: data.size || 0, complete: data.complete !== false, line_count: data.line_count || 0 })
        }
      }
      upsertChange(state, data, 'file_written')
      break

    case 'artifacts_written':
      state.artifacts = Array.isArray(data.files) ? data.files : []
      break

    case 'tool_exec_started':
      state.toolExecs = [{
        cmd: data.cmd || '',
        status: 'running',
        exit_code: null,
        output: '',
        duration_ms: 0,
      }]
      break

    case 'tool_exec_completed':
      state.toolExecs = [{
        cmd: data.cmd || '',
        status: 'done',
        exit_code: data.exit_code,
        output: data.output || '',
        duration_ms: data.duration_ms || 0,
      }]
      break

    case 'need_human':
      // 熔断：自动修复 N 轮未通过，请求人类介入
      state.need_human = {
        reason: data.reason || '',
        stage: data.stage?.label || '',
        detail: data.detail || '',
      }
      break

    case 'ask_user':
      // question 工具：agent 在等用户回答，弹问题卡片（选项按钮 + 自由输入）
      state.pendingQuestion = {
        question_id: data.question_id || '',
        question: data.question || '',
        options: Array.isArray(data.options) ? data.options : [],
      }
      break

    case 'question_answered':
      // 用户已回答，卡片关闭
      state.pendingQuestion = null
      break

    case 'pipeline_cancelled':
      state.status = 'cancelled'
      state.error = ''
      state.pendingQuestion = null
      break

    case 'task_paused':
      // 用户点击"暂停"：流水线挂起（驱动在事件边界阻塞，不结束）
      state.status = 'paused'
      break

    case 'task_resumed':
      // 用户点击"继续"：从挂起点恢复执行
      state.status = 'running'
      break

    case 'stage_started':
      setStage(data.stage?.key, { status: STAGE_RUNNING, agent: data.agent || '' })
      break

    case 'stage_completed':
      setStage(data.stage?.key, {
        status: STAGE_DONE,
        agent: data.agent || '',
        duration_ms: data.duration_ms || 0,
        summary: data.summary || '',
      })
      break

    case 'stage_failed':
      setStage(data.stage?.key, { status: STAGE_FAILED, error: data.error || '' })
      break

    case 'pipeline_completed':
      state.status = 'done'
      state.actions = []
      state.total_ms = data.duration_ms || 0
      state.stage_summaries = Array.isArray(data.stage_summaries) ? data.stage_summaries : []
      if (data.token_usage) state.token_usage = data.token_usage
      break

    case 'token_usage':
      // P0 token 记账：后端在阶段完成时推送增量
      state.token_usage = data.usage || null
      break

    case 'pipeline_failed':
      state.status = 'failed'
      state.error = data.error || ''
      break

    case 'error':
      state.status = 'failed'
      state.error = data.error || '未知错误'
      break
  }
}

// 订阅链路事件（返回退订函数）
export function subscribeAgentEvents(callback) {
  return window.electronAPI?.onAgentEvent?.(callback)
}

// 发起流水线流式请求（事件经 onAgentEvent 通道回流）
export function startPipeline(params) {
  return window.electronAPI.agentChatStream(toPlain(params))
}

// ==================== 异步任务模式（TRAE 风格：Chat 只触发，不等待） ====================

// IPC 参数脱代理（确定性修复 "An object could not be cloned."）：
// Vue reactive/proxy 无法被 Electron structured-clone 序列化，一旦混入参数就报错。
// 所有传给主进程的对象统一 JSON 深拷贝成纯对象（reactive proxy 可被 JSON 正常序列化）。
const toPlain = (value) => {
  if (value === null || value === undefined) return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (e) {
    return value
  }
}

// 提交后台任务：立即返回 {taskId}，不等待执行完
export async function submitTask(params) {
  const result = await window.electronAPI.agentSubmitTask(toPlain(params))
  if (!result || result.success === false) {
    throw new Error(result?.error || '任务提交失败')
  }
  return result
}

// 技术栈建议（dev 缺技术栈时调用）：{need_confirm, form, recommended, options}
export async function getTechStack(params) {
  const result = await window.electronAPI.agentTechStack(toPlain(params))
  if (!result || result.success === false) {
    throw new Error(result?.error || '技术栈查询失败')
  }
  return result
}

// 项目计划预览（选完文件夹后调用）：{plan: {tech_stack, project_type, core_features, file_structure}}
export async function getPlanPreview(params) {
  const result = await window.electronAPI.agentPlanPreview(toPlain(params))
  if (!result || result.success === false) {
    throw new Error(result?.error || '项目计划生成失败')
  }
  return result
}

// 项目上下文（续写模式：选定已有项目后调用）：{projectName, fileCount, memoryLoaded, techStack, lastTask, overview}
export async function getProjectContext(params) {
  const result = await window.electronAPI.agentProjectContext(toPlain(params))
  if (!result || result.success === false) {
    throw new Error(result?.error || '项目上下文读取失败')
  }
  return result
}

// 打包任务：写完项目后用户选"打包成 EXE"，发起独立打包任务，返回 {taskId}
export async function packageTask(params) {
  const result = await window.electronAPI.agentPackageTask(toPlain(params))
  if (!result || result.success === false) {
    throw new Error(result?.error || '打包任务提交失败')
  }
  return result
}

// 订阅任务事件流（返回退订函数）：callback({event, data, taskId})
export function subscribeTaskEvents(callback) {
  return window.electronAPI?.onTaskEvent?.(callback)
}

// 开启任务 SSE 流（fire-and-forget：事件经 onTaskEvent 通道回流，不阻塞调用方）
export function startTaskStream(taskId) {
  return window.electronAPI.agentTaskStream({ taskId })
}

// 查询任务状态（重连/兜底）
export function getTaskStatus(taskId) {
  return window.electronAPI.agentTaskStatus({ taskId })
}

// 取消执行中的任务（后端终止流水线，已生成文件保留）
export async function cancelTask(taskId) {
  const result = await window.electronAPI.agentCancelTask({ taskId })
  if (!result || result.success === false) {
    throw new Error(result?.error || '取消失败')
  }
  return result
}

// 暂停执行中的任务（挂起不结束，可恢复）
export async function pauseTask(taskId) {
  const result = await window.electronAPI.agentPauseTask({ taskId })
  if (!result || result.success === false) {
    throw new Error(result?.error || '暂停失败')
  }
  return result
}

// 恢复已暂停的任务（从挂起点继续）
export async function resumeTask(taskId) {
  const result = await window.electronAPI.agentResumeTask({ taskId })
  if (!result || result.success === false) {
    throw new Error(result?.error || '恢复失败')
  }
  return result
}

// question 工具：回答 agent 执行中的提问（taskId + questionId + 回答内容）
export async function answerQuestion(taskId, questionId, answer) {
  const result = await window.electronAPI.agentAnswerQuestion({ taskId, questionId, answer })
  if (!result || result.success === false) {
    throw new Error(result?.error || '回答提交失败')
  }
  return result
}

// 把各阶段摘要拼成最终文字（链路完成后展示）
export function formatPipelineSummary(stageSummaries) {
  if (!Array.isArray(stageSummaries) || stageSummaries.length === 0) return '✅ 流水线执行完成'
  const lines = stageSummaries.map((s) => `• ${s.label}（${(s.duration_ms / 1000).toFixed(1)}s）：${s.summary || '完成'}`)
  return `✅ 流水线执行完成\n${lines.join('\n')}`
}
