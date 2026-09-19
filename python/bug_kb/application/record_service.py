# -*- coding: utf-8 -*-
"""应用层：修复成功后入库（record_service）。

硬边界：
- 只有 verified: true 且 bug 确认修复的案例才入库，失败不入库
- 通用异常（NameError/ImportError/依赖版本冲突）→ 全局库
- 业务逻辑 bug → 项目私有库
- 只存提炼摘要 + patch，不存网页原文
"""
from __future__ import annotations

from typing import List, Optional

from ..domain.fingerprint import extract_fingerprint
from ..domain.schema import BugRecord, classify_scope
from ..infrastructure.store import add_record


def record_bug(project_path: Optional[str], error_text: str,
               root_cause: str = "", patches: Optional[List[dict]] = None,
               scope: Optional[str] = None, tags: Optional[List[str]] = None,
               file_hint: str = "", verified: bool = True) -> dict:
    """修复成功后入库。返回 {"saved": bool, "scope": str, "fingerprint": str, "reason": str}。
    verified=False 一律拒绝入库（失败经验不入库）。"""
    if not verified:
        return {"saved": False, "scope": "", "fingerprint": "",
                "reason": "verified=false，失败经验不入库"}
    if not error_text:
        return {"saved": False, "scope": "", "fingerprint": "",
                "reason": "缺少错误文本，无法入库"}
    exc_type, symbol, fingerprint = extract_fingerprint(error_text)
    if scope is None:
        scope = classify_scope(exc_type, error_text)
    record = BugRecord(
        fingerprint=fingerprint,
        exception_type=exc_type,
        symbol=symbol,
        error_snippet=(error_text or "")[:600],
        root_cause=(root_cause or "（未提供根因分析）")[:2000],
        patches=[p for p in (patches or []) if isinstance(p, dict)][:10],
        scope=scope,
        tags=[str(t) for t in (tags or [])][:8],
        file_hint=file_hint,
        verified=True,
    )
    saved = add_record(project_path, record, scope=scope)
    return {"saved": saved, "scope": scope, "fingerprint": fingerprint,
            "reason": "" if saved else "同指纹案例已存在，跳过（避免重复堆积）"}
