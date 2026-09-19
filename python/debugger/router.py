# -*- coding: utf-8 -*-
"""调试会话注册表 + FastAPI 路由（/debug/*）"""
import threading

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .dap_client import DapError
from .session import DebugSession

router = APIRouter(prefix="/debug", tags=["debug"])

_sessions: dict = {}
_lock = threading.Lock()
_sid_counter = [0]


def _new_sid() -> str:
    with _lock:
        _sid_counter[0] += 1
        return f"dbg_{_sid_counter[0]:03d}"


def _get_session(sid: str):
    with _lock:
        s = _sessions.get(sid)
    if not s:
        return None, JSONResponse({"success": False, "error": "会话不存在"}, status_code=404)
    return s, None


async def _read_json(request: Request):
    try:
        return await request.json()
    except Exception:
        raise ValueError("请求体不是合法 JSON")


# ---------- 会话管理 ----------
@router.post("/launch")
async def debug_launch(request: Request):
    """启动调试：{file, args?, pythonPath?, port?} -> {sid}"""
    try:
        data = await _read_json(request)
    except ValueError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)
    file = str(data.get("file") or "").strip()
    if not file:
        return JSONResponse({"success": False, "error": "file 不能为空"}, status_code=400)
    if not file.lower().endswith(".py"):
        return JSONResponse({"success": False, "error": "仅支持调试 .py 文件"}, status_code=400)

    sid = _new_sid()
    sess = DebugSession(sid)
    with _lock:
        _sessions[sid] = sess
    try:
        sess.launch(
            file,
            args=data.get("args") or [],
            python_path=data.get("pythonPath") or None,
            port=data.get("port"),
            breakpoints=data.get("breakpoints"),
        )
    except DapError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)
    return {"success": True, "sid": sid}


@router.post("/{sid}/terminate")
async def debug_terminate(sid: str):
    sess, err = _get_session(sid)
    if err:
        return err
    sess.terminate()
    with _lock:
        _sessions.pop(sid, None)
    return {"success": True}


@router.get("/sessions")
async def debug_sessions():
    return {"sessions": [{"sid": s.sid, "status": s.status, "file": s.file} for s in _sessions.values()]}


# ---------- 断点 ----------
@router.post("/{sid}/breakpoints")
async def debug_breakpoints(sid: str, request: Request):
    """{path, lines:[...]}"""
    sess, err = _get_session(sid)
    if err:
        return err
    try:
        data = await _read_json(request)
    except ValueError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)
    path = str(data.get("path") or "").strip()
    lines = [int(x) for x in (data.get("lines") or []) if str(x).isdigit()]
    if not path:
        return JSONResponse({"success": False, "error": "path 不能为空"}, status_code=400)
    sess.set_breakpoints(path, lines)
    return {"success": True, "breakpoints": sess.breakpoints}


# ---------- 控制 ----------
@router.post("/{sid}/continue")
async def debug_continue(sid: str):
    sess, err = _get_session(sid)
    if err:
        return err
    sess.resume()
    return {"success": True, "status": sess.status}


@router.post("/{sid}/pause")
async def debug_pause(sid: str):
    sess, err = _get_session(sid)
    if err:
        return err
    sess.pause()
    return {"success": True}


@router.post("/{sid}/step")
async def debug_step(sid: str, request: Request):
    """{kind: next|step-in|step-out}"""
    sess, err = _get_session(sid)
    if err:
        return err
    try:
        data = await _read_json(request)
    except ValueError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)
    sess.step(str(data.get("kind") or "next"))
    return {"success": True, "status": sess.status}


# ---------- 数据 ----------
@router.get("/{sid}/state")
async def debug_state(sid: str, variables_ref: int = 0):
    sess, err = _get_session(sid)
    if err:
        return err
    try:
        snap = sess.snapshot(variables_ref=variables_ref or None)
    except DapError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)
    return {"success": True, **snap}


@router.post("/{sid}/evaluate")
async def debug_evaluate(sid: str, request: Request):
    """{expression, frameId?}"""
    sess, err = _get_session(sid)
    if err:
        return err
    try:
        data = await _read_json(request)
    except ValueError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)
    expr = str(data.get("expression") or "").strip()
    if not expr:
        return JSONResponse({"success": False, "error": "expression 不能为空"}, status_code=400)
    try:
        body = sess.evaluate(expr, data.get("frameId"))
    except DapError as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)
    return {"success": True, "result": body.get("result", ""), "type": body.get("type", "")}
