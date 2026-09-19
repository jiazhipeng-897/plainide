// src/utils/typewriter.js
// 打字机流式渲染：把完整文本按节奏逐字写入 target.text（模拟 AI 流式输出）
// 用法：
//   const cancel = startTypewriter(msg, '完整文本', { onTick: scrollToBottom })
//   cancel()  // 中断（组件卸载/消息被替换时调用）
// 说明：
//   - 文本越长每 tick 字符数越多，总时长控制在 2~5 秒，不拖沓
//   - 若 target.text 被外部逻辑改写（不再是本打字机的上一次输出），自动中断，
//     避免覆盖用户看到的新内容
export function startTypewriter(target, fullText, options = {}) {
  const { intervalMs = 18, onTick, onDone } = options
  const len = fullText ? String(fullText).length : 0
  if (!len) {
    if (onDone) onDone()
    return () => {}
  }
  // 按长度自适应提速
  let cpt = 1
  if (len > 1200) cpt = 6
  else if (len > 600) cpt = 3
  else if (len > 250) cpt = 2
  const interval = Math.max(12, intervalMs)
  let cursor = 0
  let lastWritten = ''
  let cancelled = false
  let timer = null

  const tick = () => {
    if (cancelled) return
    // 外部覆盖检测：若 text 已不是本打字机上次写入的内容，放弃接管
    if (cursor > 0 && target.text !== lastWritten) {
      cancelled = true
      if (onDone) onDone()
      return
    }
    cursor = Math.min(len, cursor + cpt)
    lastWritten = fullText.slice(0, cursor)
    target.text = lastWritten
    if (onTick) onTick()
    if (cursor >= len) {
      if (onDone) onDone()
      return
    }
    timer = setTimeout(tick, interval)
  }
  tick() // 立即写第一段，避免延迟感

  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
  }
}
