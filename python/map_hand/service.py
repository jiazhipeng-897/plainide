# -*- coding: utf-8 -*-
"""
共绘蓝图模式（Map-Hand Mode）核心逻辑（独立通道，不耦合 orchestrator 流水线业务文件）。
- map_hand_chat：构思对话，架构师只读角色，只讨论设计不写代码；
- map_hand_finalize：把构思对话总结成设计文档（含 file_plan 最终文件清单），
  写入项目 .mycode/design.json，由 orchestrator 架构师阶段直接采用。
仅复用 orchestrator 的 LLM 客户端（多厂商配置/Token 记账）与清单解析函数。
"""
import json
import os
import re

from orchestrator.llm import LLMClient
from orchestrator.tools import parse_architect_output

from .prompts import MAP_HAND_SYSTEM_PROMPT, MAP_HAND_FINALIZE_PROMPT

# Mock 设计文档：mock 模式（无 key / ORCHESTRATOR_MOCK=1）下产出，保证链路可调试
_MOCK_DESIGN = {
    "title": "示例项目（Mock）",
    "summary": "mock 模式生成的示例设计文档",
    "tech_selection": {"final": {"frontend": "Vue 3", "backend": "Python", "database": "无"}},
    "architecture": {"style": "layered", "modules": ["ui", "core"]},
    "ui_interaction": "单一主界面，用户点击交互",
    "core_business": ["核心功能 A", "核心功能 B"],
    "file_plan": {
        "files": [
            {"path": "main.py", "purpose": "程序入口", "role": "backend", "depends_on": []},
            {"path": "index.html", "purpose": "主界面", "role": "frontend", "depends_on": ["main.py"]},
            {"path": "core/logic.py", "purpose": "核心逻辑", "role": "backend", "depends_on": ["main.py"]},
        ],
        "test_command": "python main.py",
    },
}


def _extract_json(text: str) -> dict:
    """宽容提取 JSON：完整 JSON 优先，其次剥 ```json 围栏，最后正则截取首尾大括号。"""
    if not text:
        return {}
    candidates = [text.strip()]
    candidates.extend(b.strip() for b in re.findall(r"```(?:json)?\s*([\s\S]*?)```", text))
    for cand in candidates:
        try:
            data = json.loads(cand)
            if isinstance(data, dict):
                return data
        except (json.JSONDecodeError, TypeError):
            continue
    # 兜底：截取最外层 {}（忽略可能的围栏/前后缀文字）
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            data = json.loads(m.group(0))
            if isinstance(data, dict):
                return data
        except (json.JSONDecodeError, TypeError):
            pass
    return {}


async def map_hand_chat(message: str, history: list, project_path: str = "") -> str:
    """构思对话：架构师只读角色回复一条消息（不写代码、不落盘）。

    history: 之前的对话 [{role: 'user'|'assistant', content}]，不含本次 message。
    返回架构师回复全文（前端打字机渲染为流式效果）。
    """
    lines = [f"（当前项目目录：{project_path}）" if project_path else ""]
    for h in history[-12:]:
        role = "用户" if h.get('role') == 'user' else "架构师"
        lines.append(f"{role}：{str(h.get('content', ''))[:2000]}")
    user = "\n\n".join([l for l in lines if l]) + f"\n\n用户：{message}"
    client = LLMClient()
    return await client.chat(MAP_HAND_SYSTEM_PROMPT, user, temperature=0.7,
                             max_tokens=2048, timeout=90)


async def map_hand_finalize(requirement: str, messages: list, project_path: str,
                            scale: str = "standard") -> dict:
    """完成构思：LLM 把全部对话总结成设计文档，写入 <项目>/.mycode/design.json。

    返回设计文档 dict（含 file_plan / tech_selection / architecture 等），
    engine 架构师阶段读取 design.json 后直接 parse_architect_output，清单即构思产物。
    """
    if not project_path:
        raise ValueError("projectPath 不能为空：请先选择项目文件夹再完成构思")
    if not requirement and not messages:
        raise ValueError("需求与构思对话不能同时为空")

    # 对话上下文（含最初需求）：长度受限，超出截断保尾（最新讨论优先）
    conv_parts = [f"用户最初需求：{requirement}"] if requirement else []
    for h in messages[-30:]:
        role = "用户" if h.get('role') == 'user' else "架构师"
        conv_parts.append(f"{role}：{str(h.get('content', ''))[:800]}")
    user = "\n".join(conv_parts)[-16000:]

    client = LLMClient()
    if client.is_mock:
        import copy
        design = copy.deepcopy(_MOCK_DESIGN)
    else:
        raw = await client.chat(MAP_HAND_FINALIZE_PROMPT, user, temperature=0.2,
                                max_tokens=8192, timeout=150)
        design = _extract_json(raw)
        if not design:
            raise RuntimeError("设计文档生成失败：LLM 未返回可解析的 JSON")

    # 规范化：确保 file_plan 结构存在（parse_architect_output 依赖）
    design.setdefault("file_plan", {})
    if not isinstance(design["file_plan"], dict):
        design["file_plan"] = {}
    design["file_plan"].setdefault("files", [])
    design["file_plan"].setdefault("test_command", "")
    # 规模档位提示并入设计文档（engine 侧仍会做硬约束校验）
    design["scale"] = scale

    # 用 parse_architect_output 校验清单结构（无效项剔除/role 兜底），保证下游可解析
    parsed = parse_architect_output(json.dumps(design, ensure_ascii=False))
    design["file_plan"]["files"] = parsed["files"]
    if not parsed["test_command"]:
        design["file_plan"]["test_command"] = parsed["test_command"]

    # 落盘 .mycode/design.json（orchestrator 架构师阶段的注入点）
    mycode_dir = os.path.join(project_path, ".mycode")
    os.makedirs(mycode_dir, exist_ok=True)
    from orchestrator.utils import mark_hidden_dir
    mark_hidden_dir(mycode_dir)
    with open(os.path.join(mycode_dir, "design.json"), "w", encoding="utf-8") as f:
        json.dump(design, f, ensure_ascii=False, indent=2)

    return design
