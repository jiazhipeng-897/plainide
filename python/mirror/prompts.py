# -*- coding: utf-8 -*-
"""构思核心（MirrorDoc）提示词 —— 独立通道，不耦合 orchestrator 流水线业务文件。

单一事实源：完整 prompt 放在 agents/codeagent/构思核心/ 目录下
- translate.md：阶段① 代码 → 大白话（按符号粒度）
- evaluate.md：阶段② 用户意见 + 原白话 + 代码 → 新白话 + 点对点补丁
本模块只负责加载，便于 service 引用；用户可直接编辑 .md 文件调整话术。
"""
from pathlib import Path

_AGENT_DIR = Path(__file__).resolve().parent.parent / "agents" / "codeagent" / "构思核心"


def _load(name: str) -> str:
    """优先读明文目录（开发模式）；release 模式明文目录被删，
    从 core_assets.bin（加密资产）解密读取 extra_md。"""
    try:
        if (_AGENT_DIR / name).exists():
            return (_AGENT_DIR / name).read_text(encoding="utf-8").strip()
    except Exception:
        pass
    try:
        from agents.loader import _AGENT_ASSET_NAME, _decrypt_asset
        asset_path = _AGENT_DIR.parent / _AGENT_ASSET_NAME
        if asset_path.exists():
            data = _decrypt_asset(asset_path.read_bytes())
            cfg = (data or {}).get("构思核心") or {}
            extra = cfg.get("extra_md", {}) or {}
            text = extra.get(name, "")
            if text and text.strip():
                return text.strip()
    except Exception:
        pass
    return f"（缺少 {name} prompt 文件）"


MIRROR_TRANSLATE_SYSTEM = _load("translate.md")
MIRROR_EVALUATE_SYSTEM = _load("evaluate.md")


def build_symbols_text(symbols) -> str:
    """把 parse_file_symbols 结果转成给 LLM 看的精简清单。"""
    if not symbols:
        return "（无符号信息）"
    lines = []
    for s in symbols:
        name = getattr(s, "name", "") or ""
        sig = getattr(s, "signature", "") or ""
        start = getattr(s, "start_line", 0) or 0
        end = getattr(s, "end_line", 0) or 0
        lines.append(f"- {name} | {sig} | 行 {start}-{end}")
    return "\n".join(lines)
