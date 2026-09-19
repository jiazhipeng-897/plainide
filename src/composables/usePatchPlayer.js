// src/composables/usePatchPlayer.js
/**
 * 构思核心（MirrorDoc）流式播放器
 * 在 Monaco 编辑器内可视化"删除旧代码 → 逐段写入新代码"的过程。
 * 播放是表演层：真实落盘由后端 apply 完成，本模块只做视觉渲染。
 *
 * 用法：
 *   const { playPatches } = usePatchPlayer()
 *   await playPatches(patches, { editor, monaco })
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 把新代码拆成小段（按行优先，超长行再按字符拆），模拟打字节奏
 */
function splitChunks(text, maxChunk = 24) {
  if (!text) return ['']
  const lines = text.split('\n')
  const chunks = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 保留换行结构：非末行带 \n
    const withNl = i < lines.length - 1
    if (line.length <= maxChunk) {
      chunks.push(line + (withNl ? '\n' : ''))
    } else {
      for (let j = 0; j < line.length; j += maxChunk) {
        chunks.push(line.slice(j, j + maxChunk) + (withNl && j + maxChunk >= line.length ? '\n' : ''))
      }
    }
  }
  return chunks
}

export function usePatchPlayer() {
  /**
   * 播放一组补丁
   * @param {Array} patches [{ old_code, new_code, file, reason }]
   * @param {Object} ctx { editor, monaco }  — editor 为 Monaco 实例
   * @param {Object} opts { deleteDelay, charDelay }  — 删除停留 ms / 每段间隔 ms
   * @returns {Promise<Array>} 每个补丁的播放结果 [{ ok, reason }]
   */
  async function playPatches(patches, ctx, opts = {}) {
    const editor = ctx?.editor
    if (!editor) return patches.map(() => ({ ok: false, reason: '编辑器不可用' }))
    // monaco 命名空间：优先调用方传入，否则动态加载兜底
    let monaco = ctx?.monaco
    if (!monaco) {
      try { monaco = await import('monaco-editor') } catch (e) { /* ignore */ }
    }
    if (!monaco) return patches.map(() => ({ ok: false, reason: 'monaco 不可用' }))

    const model = editor.getModel()
    if (!model) return patches.map(() => ({ ok: false, reason: '无活动模型' }))
    const deleteDelay = opts.deleteDelay ?? 600
    const charDelay = opts.charDelay ?? 18

    const results = []
    let decoIds = []

    for (const patch of patches || []) {
      const oldCode = String(patch.old_code || '').trim()
      const newCode = String(patch.new_code || '')
      if (!oldCode || !newCode) {
        results.push({ ok: false, reason: '补丁片段为空' })
        continue
      }

      try {
        // 1. 精确定位 old_code（大小写敏感，取第一处）
        const matches = model.findMatches(oldCode, true, false, true, null, true)
        if (!matches || matches.length === 0) {
          results.push({ ok: false, reason: '未找到目标片段（代码可能已被修改）' })
          continue
        }
        const targetRange = matches[0].range

        // 2. 标红删除（视觉：删除线 + 红色背景）
        editor.revealRangeInCenter(targetRange)
        decoIds = editor.deltaDecorations(decoIds, [{
          range: targetRange,
          options: {
            inlineClassName: 'mirror-delete-inline',
            linesDecorationsClassName: 'mirror-delete-line',
            overviewRuler: { color: '#ff5555', position: 1 },
          },
        }])
        await sleep(deleteDelay)

        // 3. 删除旧代码（替换为空，同时把光标留在原起点）
        const startPos = targetRange.getStartPosition()
        editor.executeEdits('mirror-doc', [{ range: targetRange, text: '', forceMoveMarkers: true }])

        // 4. 新代码逐段打字写入
        const chunks = splitChunks(newCode)
        let insertPos = startPos
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i]
          if (!chunk) continue
          const range = new monaco.Range(insertPos.lineNumber, insertPos.column, insertPos.lineNumber, insertPos.column)
          editor.executeEdits('mirror-doc', [{ range, text: chunk, forceMoveMarkers: true }])
          // 更新插入位置：chunk 内的换行会影响行列
          const nl = (chunk.match(/\n/g) || []).length
          if (nl > 0) {
            const lastNl = chunk.lastIndexOf('\n')
            insertPos = new monaco.Position(
              insertPos.lineNumber + nl,
              lastNl >= 0 ? chunk.length - lastNl : insertPos.column + chunk.length,
            )
          } else {
            insertPos = new monaco.Position(insertPos.lineNumber, insertPos.column + chunk.length)
          }
          await sleep(charDelay + (i % 3 === 0 ? 6 : 0)) // 轻微节奏变化
        }

        // 5. 收起装饰
        decoIds = editor.deltaDecorations(decoIds, [])
        results.push({ ok: true })
      } catch (err) {
        results.push({ ok: false, reason: err?.message || '播放失败' })
      }
    }

    // 兜底清理装饰
    try { editor.deltaDecorations(decoIds, []) } catch (e) { /* ignore */ }
    return results
  }

  return { playPatches }
}
