# -*- coding: utf-8 -*-
"""领域层：报错指纹（异常类型 + 关键符号）。

指纹设计目标：同一报错第二次出现时能稳定命中。
- 异常类型是主键（NameError / ImportError ...）
- 符号是次键：name 'foo' is not defined → foo；cannot import name 'X' → X；
  No module named 'X' → X；'X' object has no attribute 'Y' → X.Y
- 指纹 = f"{exception_type}:{symbol}"；symbol 为空时仅异常类型。
"""
from __future__ import annotations

import re

from .schema import _EXC_RE

# 各类异常里的符号提取规则
_SYMBOL_RULES = [
    # NameError: name 'foo' is not defined / UnboundLocalError 同
    re.compile(r"name ['\"]([^'\"]+)['\"] is not defined"),
    # ImportError: cannot import name 'X' from 'Y'
    re.compile(r"cannot import name ['\"]([^'\"]+)['\"]", re.IGNORECASE),
    # ModuleNotFoundError: No module named 'X'
    re.compile(r"no module named ['\"]([^'\"]+)['\"]", re.IGNORECASE),
    # AttributeError: 'X' object has no attribute 'Y'
    re.compile(r"'([^']+)' object has no attribute ['\"]([^'\"]+)['\"]"),
    # AttributeError 简化：module 'X' has no attribute 'Y'
    re.compile(r"module ['\"]([^'\"]+)['\"] has no attribute ['\"]([^'\"]+)['\"]"),
    # KeyError: 'X'
    re.compile(r"KeyError:\s*['\"]([^'\"]+)['\"]"),
    # FileNotFoundError: [Errno 2] No such file or directory: 'X'
    re.compile(r"no such file or directory: ['\"]([^'\"]+)['\"]"),
    # TS/前端：Cannot find name 'X'
    re.compile(r"cannot find name ['\"]([^'\"]+)['\"]"),
    # TS：Property 'X' does not exist
    re.compile(r"property ['\"]([^'\"]+)['\"] does not exist"),
]


def extract_fingerprint(error_text: str):
    """从错误文本提取 (exception_type, symbol, fingerprint)。
    symbol 提取失败时返回 ('', '', '')；异常类型未识别返回 ('other', '', 'other')。
    """
    if not error_text:
        return "", "", ""
    m = _EXC_RE.search(error_text)
    exc_type = m.group("exc") if m else "other"
    symbol = ""
    for rule in _SYMBOL_RULES:
        mm = rule.search(error_text)
        if mm:
            symbol = ".".join(g for g in mm.groups() if g)
            break
    if not symbol:
        # 兜底：追踪首行报错的标识符（NameError: 之后的第一段）
        mm = re.search(r"\b([A-Za-z_][A-Za-z0-9_]*)\b", error_text[-400:])
        if mm and exc_type != "other":
            symbol = mm.group(1)
    fingerprint = f"{exc_type}:{symbol}" if symbol else exc_type
    return exc_type, symbol, fingerprint
