// src/stores/taskBus.js
// 全局任务总线：Sidebar/侧边栏等组件需要知道"当前是否有 AI 任务在跑"，
// pipelineState 原本挂在 agent.vue 组件内部，外部读不到，所以用这个 store 同步。
// 架构铺垫：当前只有一条任务线；未来多端口多任务时，扩展为 task_id → {projectPath, status} 的映射。
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useTaskBusStore = defineStore('taskBus', () => {
  const taskId = ref('')
  const status = ref('idle')   // idle / running / paused / done / failed / cancelled
  const projectPath = ref('')

  const start = (id, path) => {
    taskId.value = id || ''
    projectPath.value = path || ''
    status.value = 'running'
  }

  const setStatus = (s) => {
    if (!s) return
    status.value = s
    // 终态清空任务句柄（保留 projectPath 供最近列表登记）
    if (['done', 'failed', 'cancelled'].includes(s)) {
      taskId.value = ''
    }
  }

  const idle = () => {
    taskId.value = ''
    status.value = 'idle'
  }

  // 是否正在忙碌（切换项目时需要打断确认）
  const isBusy = () => status.value === 'running' || status.value === 'paused'

  return {
    taskId,
    status,
    projectPath,
    start,
    setStatus,
    idle,
    isBusy,
  }
})
