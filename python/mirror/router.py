# -*- coding: utf-8 -*-
"""构思核心（MirrorDoc）路由 —— 独立通道 /mirror/*，不耦合 orchestrator 主流水线。

接口：
- POST /mirror/translate  阶段①：翻译当前文件 → 大白话
- POST /mirror/evaluate   阶段②：评估用户意见 → 新大白话 + 补丁
- POST /mirror/apply      阶段③：语法门禁 + 落盘 + 反向更新大白话
"""
import time

from fastapi import APIRouter, Request

from .service import mirror_translate, mirror_evaluate, mirror_apply

router = APIRouter(prefix="/mirror", tags=["mirror-doc"])


def _ts() -> str:
    return time.strftime("%H:%M:%S", time.localtime())


def _project_path(data: dict) -> str:
    p = str(data.get("project_path") or data.get("projectPath") or "").strip()
    if not p:
        raise ValueError("缺少 project_path")
    return p


@router.post("/translate")
async def translate_endpoint(request: Request):
    """阶段①：读当前文件 → 翻译成大白话 → 存 .mycode/mirror.json。"""
    try:
        data = await request.json()
        project_path = _project_path(data)
        file_path = str(data.get("file_path") or data.get("filePath") or "").strip()
        if not file_path:
            return {"success": False, "error": "缺少 file_path"}
        print(f"[mirror][{_ts()}] /mirror/translate {file_path}", flush=True)
        result = await mirror_translate(project_path, file_path)
        print(f"[mirror][{_ts()}] translate 完成 success={result.get('success')}", flush=True)
        return result
    except Exception as exc:
        return {"success": False, "error": f"翻译失败：{exc}", "plain_text": ""}


@router.post("/evaluate")
async def evaluate_endpoint(request: Request):
    """阶段②：用户意见 + 原大白话 + 当前代码 → 评估 → 新大白话 + 补丁。"""
    try:
        data = await request.json()
        project_path = _project_path(data)
        file_path = str(data.get("file_path") or data.get("filePath") or "").strip()
        user_request = str(data.get("user_request") or data.get("request") or "").strip()
        if not file_path:
            return {"success": False, "error": "缺少 file_path", "verdict": "unclear"}
        print(f"[mirror][{_ts()}] /mirror/evaluate {file_path} 意见长度={len(user_request)}", flush=True)
        result = await mirror_evaluate(project_path, file_path, user_request)
        print(f"[mirror][{_ts()}] evaluate 完成 verdict={result.get('verdict')}", flush=True)
        return result
    except Exception as exc:
        return {"success": False, "error": f"评估失败：{exc}", "verdict": "unclear"}


@router.post("/apply")
async def apply_endpoint(request: Request):
    """阶段③：语法门禁 → apply_patches（内含快照）→ 反向更新大白话 → changelog。"""
    try:
        data = await request.json()
        project_path = _project_path(data)
        file_path = str(data.get("file_path") or data.get("filePath") or "").strip()
        patches = data.get("patches") or []
        updated_plain = data.get("updated_plain") or {}
        if not file_path:
            return {"success": False, "error": "缺少 file_path", "applied": []}
        print(f"[mirror][{_ts()}] /mirror/apply {file_path} 补丁数={len(patches)}", flush=True)
        result = mirror_apply(project_path, file_path, patches, updated_plain)
        print(f"[mirror][{_ts()}] apply 完成 success={result.get('success')} 应用={len(result.get('applied', []))}", flush=True)
        return result
    except Exception as exc:
        return {"success": False, "error": f"应用失败：{exc}", "applied": []}
