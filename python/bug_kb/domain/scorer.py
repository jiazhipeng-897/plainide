# -*- coding: utf-8 -*-
"""领域层：召回评分（相似度 + 全局/项目权重）。

优先级（从高到低）：
1. 精确指纹（exception_type + symbol 全匹配）
2. 同异常类型 + 符号部分相似
3. 同异常类型（降权）

权重：项目库 +0.1（更贴近当前项目）；全局库基线 0。
"""
from __future__ import annotations

from difflib import SequenceMatcher

from .schema import BugRecord


def score_record(record: BugRecord, fingerprint: str, exception_type: str,
                 symbol: str, project_hit: bool) -> float:
    """计算一条记录对当前报错的匹配分（0~1.1）。"""
    score = 0.0
    if fingerprint and record.fingerprint == fingerprint:
        score = 1.0
    elif record.exception_type == exception_type:
        if symbol and record.symbol and symbol != record.symbol:
            # 同类型不同符号：按符号相似度降权（NameError: foo vs NameError: bar）
            sim = SequenceMatcher(None, symbol, record.symbol).ratio()
            score = 0.45 + 0.25 * sim
        elif symbol and record.symbol:
            score = 0.7
        else:
            score = 0.5
    if project_hit and score > 0:
        # 项目权重只在已匹配时叠加；完全不匹配（score=0）不得被抬过阈值
        score += 0.1
    return min(score, 1.1)


def pick_best(records, fingerprint: str, exception_type: str, symbol: str,
              top_n: int = 3):
    """对候选集（已标来源）评分排序，返回 [(record, score, source), ...]。
    records: iterable of (record, source) 或 record（默认 source=project）。"""
    scored = []
    for item in records:
        if isinstance(item, tuple):
            rec, src = item
        else:
            rec, src = item, "project"
        sc = score_record(rec, fingerprint, exception_type, symbol,
                          project_hit=(src == "project"))
        if sc > 0:
            scored.append((rec, round(sc, 2), src))
    scored.sort(key=lambda x: (-x[1], 0 if x[2] == "project" else 1))
    return scored[:top_n]
