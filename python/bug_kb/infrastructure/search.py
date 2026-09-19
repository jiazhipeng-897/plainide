# -*- coding: utf-8 -*-
"""基础设施层：召回检索（标签/指纹匹配 + 评分排序）。

不做向量库：bug 案例量级小（单库上限 500），指纹 + 异常类型 + 符号相似
足以在毫秒级完成；保持零额外依赖。
"""
from __future__ import annotations

from typing import List, Tuple

from ..domain.fingerprint import extract_fingerprint
from ..domain.scorer import pick_best
from ..domain.schema import BugRecord
from .store import load_global, load_project

# 项目私有库不跨项目召回：project 库只读当前项目的
# 全局库可跨项目召回：通用异常（NameError/ImportError/依赖）放全局


def recall(project_path: str, error_text: str, top_n: int = 3):
    """召回候选：(record, score, source) 列表（已评分排序）。
    项目库优先、全局库兜底；无命中返回 []。"""
    if not error_text:
        return []
    exc_type, symbol, fingerprint = extract_fingerprint(error_text)
    if not fingerprint:
        return []
    candidates: List[Tuple[BugRecord, str]] = []
    try:
        candidates.extend((r, "project") for r in load_project(project_path))
    except Exception:
        pass
    try:
        candidates.extend((r, "global") for r in load_global())
    except Exception:
        pass
    if not candidates:
        return []
    return pick_best(candidates, fingerprint, exc_type, symbol, top_n=top_n)
