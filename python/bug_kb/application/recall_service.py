# -*- coding: utf-8 -*-
"""应用层：报错时召回（recall_service）。

接入点：Debugger 入口先查 KB → 命中则把历史 patch + 根因注入上下文。
召回权重低于当前项目源码 RAG：注入文本明确标注"历史经验，仅参考，
以当前真实代码为准"，不强行套用。
"""
from __future__ import annotations

from ..infrastructure.search import recall


def recall_bug(project_path: str, error_text: str, top_n: int = 3) -> str:
    """报错时召回历史案例，返回格式化注入文本；未命中返回 ''。"""
    hits = recall(project_path, error_text, top_n=top_n)
    if not hits:
        return ""
    parts = ["【Bug 知识库历史命中（仅供参考，以当前真实代码为准，不强行套用）】"]
    for rec, score, source in hits:
        head = (f"[{source}库] {rec.exception_type}"
                + (f" · {rec.symbol}" if rec.symbol else "")
                + f" · 匹配度 {score:.2f}")
        body = [head]
        if rec.root_cause:
            body.append(f"· 根因：{rec.root_cause[:400]}")
        if rec.patches:
            body.append("· 历史修复 patch：")
            for p in rec.patches[:3]:
                fp = str(p.get("file", ""))
                if "content" in p:
                    body.append(f"  - {fp}（整文件重写）: {str(p.get('content', ''))[:200]}")
                else:
                    body.append(f"  - {fp}: old={str(p.get('old_code', ''))[:120]!r} → "
                                f"new={str(p.get('new_code', ''))[:120]!r}")
        parts.append("\n".join(body))
    return "\n\n".join(parts)
