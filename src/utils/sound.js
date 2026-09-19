// ==========================================
// 轻量 Web Audio 合成音效（零资源、零依赖）
// 全部音效用 OscillatorNode 实时合成，不加载任何音频文件
// ==========================================

const STORAGE_KEY = 'my-ide:sound-enabled'

let ctx = null
let enabled = loadEnabled()

function loadEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0'
  } catch (e) {
    return true
  }
}

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
  return ctx
}

/**
 * 合成一个音
 * @param {Object} opt
 * @param {number} opt.freq      起始频率 Hz
 * @param {number} opt.time      延迟（秒），用于琶音
 * @param {number} opt.dur       时长（秒）
 * @param {OscillatorType} opt.type  波形
 * @param {number} opt.vol       音量峰值（0-1）
 * @param {number} opt.slideTo   滑音目标频率（可选）
 */
function tone({ freq, time = 0, dur = 0.08, type = 'sine', vol = 0.05, slideTo }) {
  const ac = ensureCtx()
  if (!ac) return
  const t0 = ac.currentTime + time
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  }
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

// ===== 命名音效 =====
export const sfx = {
  /** 按钮点击：短促高频嗒声 */
  click() {
    if (!enabled) return
    tone({ freq: 2000, dur: 0.035, type: 'triangle', vol: 0.035, slideTo: 1500 })
  },

  /** 任务提交：两段上行短音 */
  taskStart() {
    if (!enabled) return
    tone({ freq: 660, time: 0, dur: 0.08, type: 'sine', vol: 0.05 })
    tone({ freq: 990, time: 0.09, dur: 0.1, type: 'sine', vol: 0.05 })
  },

  /** 任务完成：C-E-G 上行琶音 */
  taskSuccess() {
    if (!enabled) return
    tone({ freq: 523.25, time: 0, dur: 0.11, type: 'sine', vol: 0.055 })
    tone({ freq: 659.25, time: 0.12, dur: 0.11, type: 'sine', vol: 0.055 })
    tone({ freq: 783.99, time: 0.24, dur: 0.2, type: 'sine', vol: 0.06 })
  },

  /** 任务失败：下行滑音警示 */
  taskFail() {
    if (!enabled) return
    tone({ freq: 392, time: 0, dur: 0.16, type: 'triangle', vol: 0.06, slideTo: 311 })
    tone({ freq: 311, time: 0.18, dur: 0.2, type: 'triangle', vol: 0.055, slideTo: 233 })
  },

  /** 新消息：柔和双音 */
  notify() {
    if (!enabled) return
    tone({ freq: 880, time: 0, dur: 0.1, type: 'sine', vol: 0.04 })
    tone({ freq: 1174.66, time: 0.11, dur: 0.14, type: 'sine', vol: 0.035 })
  },
}

export function setSoundEnabled(v) {
  enabled = !!v
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch (e) {
    /* 忽略存储失败 */
  }
  return enabled
}

export function isSoundEnabled() {
  return enabled
}
