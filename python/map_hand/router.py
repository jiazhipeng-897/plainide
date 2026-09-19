# -*- coding: utf-8 -*-
"""
共绘蓝图模式（Map-Hand Mode）路由（独立通道 /map-hand，不进入 orchestrator 流水线）。
- POST /map-hand/chat     构思对话：SSE 事件流（pipeline_started / chat_reply / pipeline_completed）
- POST /map-hand/finalize 完成构思：总结设计文档 → 写 .mycode/design.json → 返回设计文档供卡片展示
"""
import json
import time as _t

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from .service import map_hand_chat, map_hand_finalize

router = APIRouter(prefix="/map-hand", tags=["map-hand"])

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


async def _read_json(request: Request) -> dict:
    try:
        data = await request.json()
    except Exception:
        raise ValueError("请求体必须是 JSON")
    if not isinstance(data, dict):
        raise ValueError("请求体必须是 JSON 对象")
    return data


def _sse(event: str, data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


@router.post("/chat")
async def map_hand_chat_endpoint(request: Request):
    """构思对话：架构师只读回复（SSE 事件流，事件与 orchestrator /chat 同构，
    前端可复用现有事件解析逻辑）。"""
    try:
        data = await _read_json(request)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    message = str(data.get("message", "")).strip()
    if not message:
        return JSONResponse({"error": "message 不能为空"}, status_code=400)
    messages = data.get("messages")
    if messages is not None and not isinstance(messages, list):
        return JSONResponse({"error": "messages 必须是数组"}, status_code=400)
    project_path = str(data.get("projectPath") or data.get("project_path") or "").strip()

    _t0 = _t.time()
    print(f"[map-hand][{_t.strftime('%H:%M:%S', _t.localtime())}] /map-hand/chat 收到 消息长度={len(message)}", flush=True)

    async def event_stream():
        try:
            yield _sse("pipeline_started", {"pipeline_id": "map_hand", "stages": [], "message": "构思中"})
            reply = await map_hand_chat(message, messages or [], project_path)
            yield _sse("chat_reply", {"content": reply})
            yield _sse("pipeline_completed", {"mode": "map_hand", "duration_ms": int((_t.time() - _t0) * 1000)})
            print(f"[map-hand][{_t.strftime('%H:%M:%S', _t.localtime())}] /map-hand/chat 完成 总耗时 {int((_t.time()-_t0)*1000)}ms", flush=True)
        except Exception as e:
            print(f"[map-hand][{_t.strftime('%H:%M:%S', _t.localtime())}] /map-hand/chat 失败: {e}", flush=True)
            yield _sse("error", {"error": str(e)})

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=_SSE_HEADERS)


@router.post("/finalize")
async def map_hand_finalize_endpoint(request: Request):
    """完成构思：总结设计文档并写入项目 .mycode/design.json。
    返回 {success, design:{title, summary, tech_selection, architecture,
    ui_interaction, core_business, file_plan}, file_count} 供前端计划卡片展示。"""
    try:
        data = await _read_json(request)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    requirement = str(data.get("requirement", "")).strip()
    messages = data.get("messages")
    if messages is not None and not isinstance(messages, list):
        return JSONResponse({"error": "messages 必须是数组"}, status_code=400)
    project_path = str(data.get("projectPath") or data.get("project_path") or "").strip()
    if not project_path:
        return JSONResponse({"error": "projectPath 不能为空：请先选择项目文件夹"}, status_code=400)
    scale = str(data.get("scale") or "standard").strip()

    print(f"[map-hand][{_t.strftime('%H:%M:%S', _t.localtime())}] /map-hand/finalize 收到 项目={project_path} 对话条数={len(messages or [])}", flush=True)
    try:
        design = await map_hand_finalize(requirement, messages or [], project_path, scale)
        files = design.get("file_plan", {}).get("files", [])
        print(f"[map-hand][{_t.strftime('%H:%M:%S', _t.localtime())}] /map-hand/finalize 完成 文件清单={len(files)} 个", flush=True)
        return {
            "success": True,
            "design": design,
            "file_count": len(files),
        }
    except Exception as e:
        print(f"[map-hand][{_t.strftime('%H:%M:%S', _t.localtime())}] /map-hand/finalize 失败: {e}", flush=True)
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)
