# -*- coding: utf-8 -*-
"""构思核心（MirrorDoc）核心逻辑 —— 独立通道，不耦合 orchestrator 流水线业务文件。

链路（固定 1 个 AI，单文件维度，不读整个项目）：
- mirror_translate：读当前文件 → 按符号翻译成大白话 → 存 .mycode/mirror.json
- mirror_evaluate：用户意见 + 原大白话 + 当前代码（精确符号定位）→ 评估 → 新白话 + 点对点补丁
- mirror_apply：语法门禁 → apply_patches 落盘 → 反向更新大白话 → changelog

存储结构（符号粒度，符号名即稳定 ID）：
  .mycode/mirror.json → { "entries": { "<相对路径>": { "<符号名>": { "plain_text": "...", "updated_at": "..." } } } }
  无符号文件用固定键 "__file__" 表示整个文件。

复用：LLMClient（多厂商/Token 记账）、parse_file_symbols（精确符号）、
      syntax_gate（写盘校验）、apply_patches（点对点补丁，内部已含快照）、ChangeLogger。
"""
import json
import os
import re
import time
from pathlib import Path
from typing import Dict, List, Optional

from orchestrator.llm import LLMClient
from orchestrator.tools import apply_patches, is_safe_rel
from orchestrator.syntax_gate import validate_content
from orchestrator.changelog import ChangeLogger

from .prompts import (
    MIRROR_TRANSLATE_SYSTEM,
    MIRROR_EVALUATE_SYSTEM,
    build_symbols_text,
)

_MIRROR_REL = ".mycode/mirror.json"
_FILE_KEY = "__file__"


def _rel_path(project_path: str, file_path: str) -> str:
    """把文件路径归一化为相对项目根的路径（含 ../ 逃逸保护）。"""
    root = Path(project_path).resolve()
    p = Path(file_path).resolve()
    try:
        rel = p.relative_to(root).as_posix()
    except ValueError:
        rel = os.path.relpath(p, root).replace("\\", "/")
    if not is_safe_rel(str(root), rel):
        raise RuntimeError(f"路径越界: {file_path}")
    return rel


def _mirror_path(project_path: str) -> Path:
    return Path(project_path) / _MIRROR_REL


def _load_mirror(project_path: str) -> dict:
    p = _mirror_path(project_path)
    if not p.exists():
        return {"entries": {}}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, dict) and "entries" in data:
            return data
        return {"entries": data if isinstance(data, dict) else {}}
    except Exception:
        return {"entries": {}}


def _save_mirror(project_path: str, data: dict) -> None:
    p = _mirror_path(project_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)


def _extract_json(text: str) -> Optional[dict]:
    """宽容提取 JSON：```json 围栏优先，其次取最后一个平衡 {…}。"""
    if not text:
        return None
    t = text.strip()
    # 优先 ```json 块
    start = t.find("```json")
    if start >= 0:
        end = t.find("```", start + 7)
        if end > start:
            t = t[start + 7:end].strip()
    # 找最后一个平衡 JSON 对象
    depth = 0
    obj_start = -1
    for i, ch in enumerate(t):
        if ch == "{":
            if depth == 0:
                obj_start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and obj_start >= 0:
                candidate = t[obj_start:i + 1]
                try:
                    return json.loads(candidate)
                except Exception:
                    continue
    return None


def _read_file_safe(file_path: str, max_chars: int = 60000) -> str:
    """读文件内容（限量防撑爆上下文；读不到返回空串不抛错）。"""
    try:
        p = Path(file_path)
        if not p.exists() or not p.is_file():
            return ""
        text = p.read_text(encoding="utf-8", errors="replace")
        if len(text) > max_chars:
            text = text[:max_chars] + "\n…(内容过长已截断)"
        return text
    except Exception:
        return ""


def _parse_symbols(file_path: str) -> tuple:
    """精确符号定位：返回 (language, defs 列表)。解析失败返回 (None, [])，不抛错。"""
    try:
        from code_rag.infrastructure.symbol_parser import parse_file_symbols
        lang, defs, _refs = parse_file_symbols(file_path)
        return lang, list(defs or [])
    except Exception:
        return None, []


def _render_plain(entry: dict) -> str:
    """把 {符号: {plain_text}} 渲染成给前端上框展示的文本（markdown 分段）。"""
    if not entry:
        return "（暂无大白话，点击「构思核心」开始翻译）"
    parts = []
    for name, item in (entry or {}).items():
        text = item.get("plain_text", "") if isinstance(item, dict) else str(item)
        if not text:
            continue
        if name == _FILE_KEY:
            parts.append(text)
        else:
            parts.append(f"### {name}\n{text}")
    return "\n\n".join(parts) if parts else "（暂无大白话）"


# ===== 自动摄取（agent 写代码/修改时自带大白话，零额外 LLM 调用）=====
_STALE_SUFFIX = "（⚠️ 可能已过期，以真实代码为准）"


def _norm_rel(project_path: str, p: str) -> str:
    """把 agent 输出的 path 归一化为项目相对路径（兼容绝对路径/反斜杠/./ 前缀）。"""
    rel = str(p).strip().replace("\\", "/")
    root = str(Path(project_path).resolve()).replace("\\", "/")
    if rel.startswith(root + "/"):
        rel = rel[len(root) + 1:]
    while rel.startswith("./"):
        rel = rel[2:]
    return rel


def mirror_ingest(project_path: str, files: List[dict]) -> dict:
    """从写代码/修改 agent 的输出（files 列表）提取 plain_text 大白话，落盘 mirror.json。
    - 条目含 plain_text → 覆盖对应文件/符号的大白话（同步天然一致，无过期窗口）
    - 条目缺 plain_text（agent 忘带）→ 保留旧摘要并追加"可能已过期"标记（不崩，RAG 兜底）
    返回 {"updated": 覆盖数, "stale": 标记数}
    """
    if not files:
        return {"updated": 0, "stale": 0}
    data = _load_mirror(project_path)
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    updated = 0
    stale = 0
    for f in files:
        if not isinstance(f, dict):
            continue
        p = f.get("path") or ""
        if not str(p).strip():
            continue
        rel = _norm_rel(project_path, p)
        if not rel or rel.startswith(".."):
            continue
        pt = f.get("plain_text") or f.get("plain") or ""
        symbol = str(f.get("symbol") or "").strip()
        key = symbol if symbol else _FILE_KEY
        file_entry = data.setdefault("entries", {}).setdefault(rel, {})
        if str(pt).strip():
            file_entry[key] = {"plain_text": str(pt).strip(), "updated_at": now}
            updated += 1
        else:
            old = file_entry.get(key)
            if old and isinstance(old, dict):
                old_text = str(old.get("plain_text", ""))
                if _STALE_SUFFIX not in old_text:
                    old["plain_text"] = old_text + _STALE_SUFFIX
                old["updated_at"] = now
            else:
                file_entry[key] = {"plain_text": "（代码已更新，摘要待补充）", "updated_at": now}
            stale += 1
    if updated or stale:
        _save_mirror(project_path, data)
    return {"updated": updated, "stale": stale}


def mirror_task_context(project_path: str, query: str = "", max_chars: int = 3000,
                        max_files: int = 8) -> str:
    """给 agent 读项目语义大纲：按 query 词相关度取 mirror 条目（限量），无大纲返回空串。
    标记了"可能已过期"的条目原样带上（提示 agent 以真实代码为准）。"""
    data = _load_mirror(project_path)
    entries = data.get("entries") or {}
    if not entries:
        return ""
    words = [w for w in re.split(r"[\s,，。:：;；/\\()（）]+", query or "") if len(w) > 1]
    scored = []
    for rel, file_entry in entries.items():
        if not file_entry:
            continue
        score = 0
        rel_l = rel.lower()
        base = rel_l.split("/")[-1].split(".")[0]
        for w in words:
            wl = w.lower()
            if wl in rel_l:
                score += 3
            elif wl in base:
                score += 2
        scored.append((score, rel, file_entry))
    scored.sort(key=lambda x: (-x[0], x[1]))
    parts = []
    total = 0
    for _score, rel, file_entry in scored[:max_files]:
        text = _render_plain(file_entry)
        if not text or "（暂无大白话" in text:
            continue
        block = f"[{rel}]\n{text}"
        if total + len(block) > max_chars:
            break
        parts.append(block)
        total += len(block)
    if not parts:
        return ""
    return "\n\n".join(parts)


# ===== 阶段① 翻译 =====
async def mirror_translate(project_path: str, file_path: str) -> dict:
    """读当前文件 → 按符号翻译成大白话 → 存 mirror.json → 返回展示文本。"""
    rel = _rel_path(project_path, file_path)
    code = _read_file_safe(file_path)
    if not code:
        return {"success": False, "error": "文件为空或无法读取", "plain_text": ""}

    lang, defs = _parse_symbols(file_path)
    symbols_text = build_symbols_text(defs)

    client = LLMClient()
    if client.is_mock:
        if defs:
            entry = {d.name: f"（Mock 白话）{d.name}：负责……" for d in defs}
        else:
            entry = {_FILE_KEY: f"（Mock 白话）{rel}：这是一个包含 {len(code.splitlines())} 行的代码文件。"}
    else:
        user = (
            f"文件路径：{rel}\n语言：{lang or os.path.splitext(rel)[1] or '未知'}\n\n"
            f"符号清单：\n{symbols_text}\n\n"
            f"代码内容：\n```\n{code}\n```"
        )
        raw = await client.chat(
            MIRROR_TRANSLATE_SYSTEM, user,
            temperature=0.3, max_tokens=4096, timeout=120, think=False,
        )
        parsed = _extract_json(raw) or {}
        # LLM 可能返回 {rel: {...}} 或直接 {符号: 白话}，宽容取
        if isinstance(parsed.get(rel), dict):
            entry = parsed[rel]
        else:
            entry = parsed
        entry = {k: (v if isinstance(v, dict) else {"plain_text": str(v)}) for k, v in entry.items()}
        if not entry:
            return {"success": False, "error": "翻译结果为空", "plain_text": ""}

    data = _load_mirror(project_path)
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    file_entry = data.setdefault("entries", {}).setdefault(rel, {})
    for name, item in entry.items():
        text = item.get("plain_text", "") if isinstance(item, dict) else str(item)
        file_entry[name] = {"plain_text": text, "updated_at": now}
    _save_mirror(project_path, data)

    return {"success": True, "plain_text": _render_plain(file_entry), "file": rel}


# ===== 阶段② 评估 =====
async def mirror_evaluate(project_path: str, file_path: str, user_request: str) -> dict:
    """用户意见 + 原大白话 + 当前代码 → 评估 → 新白话 + 点对点补丁。"""
    rel = _rel_path(project_path, file_path)
    if not (user_request or "").strip():
        return {"success": False, "error": "修改意见为空", "verdict": "unclear"}

    code = _read_file_safe(file_path)
    data = _load_mirror(project_path)
    file_entry = data.get("entries", {}).get(rel, {})
    current_plain = _render_plain(file_entry)

    lang, defs = _parse_symbols(file_path)
    symbols_text = build_symbols_text(defs)

    client = LLMClient()
    if client.is_mock:
        return {
            "success": True,
            "verdict": "ok",
            "question": f"（Mock）已收到你的意见：{user_request[:50]}，确认后执行。",
            "risk": "low",
            "updated_plain": {},
            "patches": [],
        }

    user = (
        f"文件路径：{rel}\n\n"
        f"用户修改意见：\n{user_request}\n\n"
        f"当前大白话：\n{current_plain}\n\n"
        f"文件内符号清单（精确改动点候选）：\n{symbols_text}\n\n"
        f"当前代码：\n```\n{code}\n```"
    )
    raw = await client.chat(
        MIRROR_EVALUATE_SYSTEM, user,
        temperature=0.2, max_tokens=4096, timeout=120, think=False,
    )
    result = _extract_json(raw) or {}
    verdict = str(result.get("verdict", "unclear"))
    if verdict == "ok":
        updated_plain = result.get("updated_plain") or {}
        if isinstance(updated_plain, dict):
            updated_plain = {k: str(v) for k, v in updated_plain.items()}
        else:
            updated_plain = {}
        return {
            "success": True,
            "verdict": "ok",
            "question": result.get("question") or "是否执行以上修改？",
            "risk": str(result.get("risk", "low")),
            "updated_plain": updated_plain,
            "patches": result.get("patches") or [],
        }
    return {
        "success": True,
        "verdict": verdict,
        "question": result.get("question") or (
            "描述还不清晰，请补充具体要改什么。" if verdict == "unclear"
            else "你的要求和当前代码对不上，请核对后再提交。"
        ),
        "risk": str(result.get("risk", "mid")),
        "updated_plain": {},
        "patches": [],
    }


# ===== 阶段③ 应用 =====
def mirror_apply(project_path: str, file_path: str, patches: List[dict],
                 updated_plain: Optional[dict] = None) -> dict:
    """语法门禁 → apply_patches（内部含快照）→ 反向更新大白话 → changelog。"""
    rel = _rel_path(project_path, file_path)
    patches = [p for p in (patches or []) if isinstance(p, dict) and p.get("old_code") and p.get("new_code")]

    if not patches:
        return {"success": False, "error": "没有可应用的补丁", "applied": []}

    # 写盘前语法门禁：把补丁应用到文件副本，再校验完整文件（片段级单独校验会误伤缩进/语句片段）
    blocked = []
    try:
        orig_text = Path(file_path).read_text(encoding="utf-8", errors="replace")
    except Exception:
        orig_text = ""
    for p in patches:
        pfile = str(p.get("file") or rel).strip().replace("\\", "/")
        old_code = str(p.get("old_code") or "")
        new_code = str(p.get("new_code") or "")
        simulated = orig_text
        if old_code in simulated:
            simulated = simulated.replace(old_code, new_code, 1)
        else:
            blocked.append({"file": pfile, "reason": "目标片段不在当前文件中"})
            continue
        gate = validate_content(pfile, simulated)
        if gate.get("ok") is False:
            blocked.append({"file": pfile, "reason": gate.get("errors", [])[:2]})
    if blocked:
        return {"success": False, "error": "语法校验未通过", "blocked": blocked, "applied": []}

    # 点对点落盘（apply_patches 内部已做改前快照）
    results = apply_patches(project_path, patches)

    applied = [r for r in results if r.get("ok")]
    failed = [r for r in results if not r.get("ok")]

    # 反向更新大白话（按符号覆盖）
    new_plain = ""
    if updated_plain and applied:
        data = _load_mirror(project_path)
        file_entry = data.setdefault("entries", {}).setdefault(rel, {})
        now = time.strftime("%Y-%m-%d %H:%M:%S")
        for name, text in updated_plain.items():
            if text:
                file_entry[name] = {"plain_text": str(text), "updated_at": now}
        _save_mirror(project_path, data)
        new_plain = _render_plain(file_entry)

    # changelog 落账
    try:
        logger = ChangeLogger(project_path)
        for r in applied:
            logger.log(
                action="mirror_patch",
                path=str(r.get("file", rel)),
                task_id="mirror-doc",
                role="构思核心",
                extra={"detail": f"点对点修改：{str(r.get('reason') or '')[:200]}"},
            )
    except Exception:
        pass

    return {
        "success": bool(applied),
        "applied": applied,
        "failed": failed,
        "plain_text": new_plain,
    }
