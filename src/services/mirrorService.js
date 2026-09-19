// src/services/mirrorService.js
/**
 * 构思核心（MirrorDoc）服务
 * 大白话 ↔ 代码双向桥。独立通道，调用 Python /mirror/* 接口。
 * 链路：翻译 → 评估 → 应用，全程单文件、固定 1 个 AI。
 */

async function call(endpoint, data) {
  const res = await window.electronAPI.callPythonApi({ endpoint, data })
  if (!res || res.success === false && !res.verdict) {
    // callPythonApi 层失败（白名单/路径/网络/超时）
    if (res && res.error) {
      const err = new Error(res.error)
      err.isIpcError = true
      throw err
    }
  }
  return res
}

/** 阶段①：翻译当前文件 → 大白话（返回 { success, plain_text, file }） */
export async function mirrorTranslate(projectPath, filePath) {
  return call('/mirror/translate', { projectPath, filePath })
}

/** 阶段②：评估用户修改意见（返回 { success, verdict, question, risk, updated_plain, patches }） */
export async function mirrorEvaluate(projectPath, filePath, userRequest) {
  return call('/mirror/evaluate', { projectPath, filePath, user_request: userRequest })
}

/** 阶段③：应用补丁 + 反向更新大白话（返回 { success, applied, failed, plain_text }） */
export async function mirrorApply(projectPath, filePath, patches, updatedPlain) {
  return call('/mirror/apply', { projectPath, filePath, patches, updated_plain: updatedPlain })
}
