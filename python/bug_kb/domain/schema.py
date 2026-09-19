# -*- coding: utf-8 -*-
"""领域层：Bug 记录字段定义（schema）。

记录字段：异常类型 / 原始堆栈（摘要） / 关联代码片段 / 根因分析 / 最终 patch /
标签 / 适用范围（global 全局 or project 项目私有）。
只存提炼摘要 + patch，不存网页原文。
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import List, Optional


@dataclass
class BugRecord:
    """一条已验证修复的 Bug 案例。"""

    fingerprint: str            # 报错指纹（异常类型:符号），用于精确召回
    exception_type: str         # NameError / ImportError / SyntaxError ...
    symbol: str                 # 报错符号名（name 'foo' is not defined → foo），可能为空
    error_snippet: str          # 原始堆栈摘要（前 600 字符）
    root_cause: str             # 根因分析（提炼，非原文堆砌）
    patches: List[dict]         # 最终修复补丁 [{file, old_code?, new_code?, content?}]
    scope: str                  # 'global' | 'project'
    tags: List[str] = field(default_factory=list)
    file_hint: str = ''         # 关联代码文件（相对路径，供参考）
    verified: bool = True       # 入库前提：verified: true 且确认修复
    created_at: float = field(default_factory=time.time)
    record_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict) -> "BugRecord":
        return BugRecord(**{k: v for k, v in d.items() if k in BugRecord.__dataclass_fields__})


# 通用异常集合：属于"通用异常 → 全局库"（跨项目复用价值高）；
# 不在集合内视为业务逻辑 bug → 项目私有库（ValueError/KeyError/IndexError 等
# 常承载业务校验语义，宁可项目私有，避免经验跨项目误套）
GENERIC_EXCEPTIONS = {
    "NameError", "UnboundLocalError", "ImportError", "ModuleNotFoundError",
    "AttributeError", "SyntaxError", "IndentationError", "TabError",
    "TypeError", "FileNotFoundError", "OSError", "RecursionError",
    "StopIteration", "ZeroDivisionError",
}

# 依赖/环境类信号（无异常类型但属于依赖问题 → 全局库）
DEPENDENCY_SIGNALS = (
    "no module named", "cannot import", "pip install", "could not be resolved",
    "not found", "no matching distribution", "package.json", "requirements.txt",
    "version conflict", "dependency",
)

# 错误文本中提取异常类型的正则（python 主 + 常见前端/编译错误）
_EXC_RE = re_compiled = __import__("re").compile(
    r"(?:^|\n|:)\s*(?P<exc>"
    r"NameError|ImportError|ModuleNotFoundError|AttributeError|TypeError|SyntaxError|"
    r"IndentationError|ValueError|KeyError|IndexError|FileNotFoundError|"
    r"ZeroDivisionError|StopIteration|OSError|RuntimeError|AssertionError|TabError|"
    r"UnboundLocalError|RecursionError|OverflowError|PermissionError|"
    r"NotImplementedError|TS\d+|ESLint|TypeScript error|Vue warn|ReferenceError|"
    r"RangeError|URIError|EACCES|EPERM|ENOENT"
    r")\b"
)


def classify_scope(exception_type: str, error_text: str) -> str:
    """适用范围判定：通用异常/依赖问题 → 'global'；业务逻辑 bug → 'project'。"""
    low = (error_text or "").lower()
    if exception_type in GENERIC_EXCEPTIONS:
        return "global"
    if any(sig in low for sig in DEPENDENCY_SIGNALS):
        return "global"
    return "project"
