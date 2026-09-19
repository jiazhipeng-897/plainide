import { defineStore } from 'pinia'

// ===== 交互式调试器状态 =====
export const useDebugStore = defineStore('debug', {
  state: () => ({
    sid: null,             // 当前会话 ID
    status: 'idle',        // idle | running | paused | stopped | error
    error: '',
    file: '',
    breakpoints: {},       // { [absPath]: [line, ...] }
    currentThreadId: null,
    stackFrames: [],       // [{id, name, line, path}]
    scopes: [],            // [{name, variablesReference}]
    variables: [],         // [{name, value, type, variablesReference}]
    output: [],            // [{category, text}]
    expandedRefs: new Set(), // 已展开的 variablesReference
    polling: null,         // 轮询定时器
    activeTab: 'debug',    // 调试面板内的子 tab: stack | variables | output
  }),

  getters: {
    isDebugging: (s) => !!s.sid,
    paused: (s) => s.status === 'paused',
    bpForActiveFile: (s) => {
      return (filePath) => (filePath ? s.breakpoints[filePath] || [] : [])
    },
  },

  actions: {
    // ---- 断点 ----
    toggleBreakpoint(filePath, line) {
      if (!filePath) return
      if (!this.breakpoints[filePath]) this.breakpoints[filePath] = []
      const list = this.breakpoints[filePath]
      const idx = list.indexOf(line)
      if (idx >= 0) list.splice(idx, 1)
      else list.push(line)
      list.sort((a, b) => a - b)
      if (list.length === 0) delete this.breakpoints[filePath]
      this.syncBreakpoints()
    },

    setBreakpoints(filePath, lines) {
      if (!filePath) return
      this.breakpoints[filePath] = [...new Set(lines)].sort((a, b) => a - b)
      if (this.breakpoints[filePath].length === 0) delete this.breakpoints[filePath]
      this.syncBreakpoints()
    },

    clearBreakpoints(filePath) {
      if (filePath) delete this.breakpoints[filePath]
      else this.breakpoints = {}
      this.syncBreakpoints()
    },

    async syncBreakpoints() {
      if (!this.sid) return
      const file = this.file
      const lines = this.breakpoints[file] || []
      await window.electronAPI?.debugBreakpoints?.({ sid: this.sid, path: file, lines })
    },

    // ---- 会话 ----
    async launch(filePath, breakpoints) {
      this.stopPolling()
      this.reset()
      this.file = filePath
      if (breakpoints) this.breakpoints = JSON.parse(JSON.stringify(breakpoints))
      const res = await window.electronAPI?.debugLaunch?.({
        file: filePath,
        breakpoints: this.breakpoints,
      })
      if (res && res.success) {
        this.sid = res.sid
        this.status = 'running'
        this.startPolling()
        return { ok: true }
      }
      this.error = res?.error || '启动调试失败'
      this.status = 'error'
      return { ok: false, error: this.error }
    },

    async resume() {
      if (!this.sid) return
      await window.electronAPI?.debugContinue?.(this.sid)
      this.status = 'running'
    },

    async pause() {
      if (!this.sid) return
      await window.electronAPI?.debugPause?.(this.sid)
    },

    async step(kind) {
      if (!this.sid) return
      await window.electronAPI?.debugStep?.({ sid: this.sid, kind })
      this.status = 'running'
    },

    async evaluate(expression) {
      if (!this.sid) return
      const res = await window.electronAPI?.debugEvaluate?.({ sid: this.sid, expression })
      return res && res.success ? res.result : null
    },

    async terminate() {
      if (!this.sid) return
      await window.electronAPI?.debugTerminate?.(this.sid)
      this.stopPolling()
      this.sid = null
      this.status = 'idle'
      this.error = ''
      this.stackFrames = []
      this.variables = []
      this.scopes = []
      this.output = []
    },

    // ---- 轮询 ----
    startPolling() {
      this.stopPolling()
      this.polling = setInterval(() => this.refresh(), 600)
    },

    stopPolling() {
      if (this.polling) {
        clearInterval(this.polling)
        this.polling = null
      }
    },

    async refresh() {
      if (!this.sid) return
      const res = await window.electronAPI?.debugState?.({
        sid: this.sid,
        variables_ref: undefined,
      })
      if (!res || !res.success) {
        // 会话没了
        if (res && !res.success && this.status !== 'idle') {
          this.status = 'stopped'
        }
        return
      }
      this.status = res.status || this.status
      this.error = res.error || ''
      this.currentThreadId = res.currentThreadId
      if (res.stackFrames && res.stackFrames.length) this.stackFrames = res.stackFrames
      if (res.scopes) this.scopes = res.scopes
      if (res.variables && res.variables.length) this.variables = res.variables
      if (res.output && res.output.length) this.output = res.output
    },

    async fetchVariables(ref) {
      const res = await window.electronAPI?.debugState?.({ sid: this.sid, variables_ref: ref })
      return res && res.success ? res.variables || [] : []
    },

    toggleExpand(ref) {
      if (this.expandedRefs.has(ref)) this.expandedRefs.delete(ref)
      else this.expandedRefs.add(ref)
    },

    reset() {
      this.sid = null
      this.status = 'idle'
      this.error = ''
      this.file = ''
      this.breakpoints = {}
      this.stackFrames = []
      this.scopes = []
      this.variables = []
      this.output = []
      this.expandedRefs = new Set()
    },
  },
})
