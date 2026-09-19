# -*- coding: utf-8 -*-
"""
项目入门分析器（onboarder）
================================
接手一个陌生本地项目时：
  1. 扫描关键文件（README / package.json / main 入口等）
  2. 一次 LLM 调用生成项目大纲（目的/技术栈/目录/入口/测试命令/约定/风险）
  3. 落盘 .mycode/onboard.json
  4. 后续 Agent 修改时先读这份大纲，不用重新翻全仓库

只跑一次；.mycode/onboard.json 已存在就直接返回缓存。
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from orchestrator.llm import LLMClient

router = APIRouter(prefix="/onboard", tags=["onboard"])

# 关键文件候选：按优先级，命中即读
KEY_FILE_GLOBS = [
    "README.md", "README.MD", "readme.md",
    "package.json", "pyproject.toml", "requirements.txt",
    "go.mod", "Cargo.toml", "pom.xml",
    "main.py", "index.html", "app.py", "server.js", "index.js",
    "src/main.py", "src/index.ts", "src/App.vue", "vite.config.ts",
]

# 单文件读入上限（字符），防止巨型 package-lock / 打包产物
_MAX_FILE_CHARS = 4000
# 总内容上限（喂给 LLM 的字符预算）
_TOTAL_CHAR_BUDGET = 9000


class OnboardReq(BaseModel):
    project_path: str


def _mycode_dir(project_path: str) -> Path:
    p = Path(project_path) / ".mycode"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _onboard_file(project_path: str) -> Path:
    return _mycode_dir(project_path) / "onboard.json"


def _collect_key_files(project_path: str) -> list[dict[str, Any]]:
    """扫描关键文件，返回 [{path, content}]，控制总大小"""
    root = Path(project_path)
    if not root.exists():
        return []

    collected: list[dict[str, Any]] = []
    used = 0

    # 先按候选名精确找
    for name in KEY_FILE_GLOBS:
        fp = root / name
        if fp.is_file() and used < _TOTAL_CHAR_BUDGET:
            try:
                text = fp.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            if not text.strip():
                continue
            text = text[:_MAX_FILE_CHARS]
            collected.append({
                "path": str(fp.relative_to(root)).replace("\\", "/"),
                "content": text,
            })
            used += len(text)

    # 再补一层：列一下根目录直接子文件/目录，让 LLM 知道项目骨架
    try:
        children = []
        for child in sorted(root.iterdir()):
            if child.name.startswith("."):
                continue
            if child.name in ("node_modules", "__pycache__", "dist", "build"):
                continue
            tag = "DIR" if child.is_dir() else "FILE"
            children.append(f"{tag}  {child.name}")
        if children:
            skeleton = "# 根目录骨架\n" + "\n".join(children[:40])
            collected.insert(0, {"path": "__skeleton__", "content": skeleton})
    except Exception:
        pass

    return collected


_SYSTEM_PROMPT = """你是一名资深工程师，刚接手一个陌生的本地代码仓库。
你的任务：只读不写，快速读懂这个项目，输出一份结构化大纲，供后续 AI Agent 修改时参考。
严格输出 JSON，不要任何额外文字，字段如下：
{
  "purpose": "一句话说清这个项目是干什么的",
  "tech_stack": ["识别到的技术栈/框架/语言"],
  "structure": "几句话说清目录是怎么组织的",
  "entry_point": "主入口文件路径（不知道就填 unknown）",
  "test_command": "怎么跑测试或启动（不知道就填 unknown）",
  "conventions": ["项目里能看出来的代码约定/命名/风格"],
  "warnings": ["接手时要小心的地方：坑、未完成、硬编码、外部依赖等"],
  "confidence": "high/medium/low，你对这份大纲有多大把握"
}"""


def _build_user_prompt(files: list[dict[str, Any]]) -> str:
    parts = ["# 以下是仓库里挑出来的关键文件内容：\n"]
    for f in files:
        parts.append(f"===== {f['path']} =====")
        parts.append(f["content"])
        parts.append("")
    parts.append("\n请按 system 要求输出 JSON 大纲。")
    return "\n".join(parts)[:_TOTAL_CHAR_BUDGET * 2]


def _safe_parse_json(raw: str) -> dict | None:
    """LLM 可能带 markdown 围栏，剥一下再 parse"""
    if not raw:
        return None
    raw = raw.strip()
    if raw.startswith("```"):
        # 去掉 ```json ... ```
        lines = raw.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        raw = "\n".join(lines)
    try:
        return json.loads(raw)
    except Exception:
        return None


@router.post("/status")
async def onboard_status(req: OnboardReq):
    """前端打开项目时先查：有没有已缓存的大纲"""
    project_path = req.project_path
    fp = _onboard_file(project_path)
    if not fp.exists():
        return {"has_onboard": False}
    try:
        data = json.loads(fp.read_text(encoding="utf-8"))
        return {"has_onboard": True, "onboard": data}
    except Exception:
        return {"has_onboard": False}


@router.post("/inspect")
async def onboard_inspect(req: OnboardReq):
    """真正跑一遍：扫描 → 读关键文件 → LLM 生成大纲 → 落盘"""
    project_path = req.project_path
    if not project_path or not os.path.isdir(project_path):
        return {"ok": False, "error": "项目路径不存在"}

    # 1. 已有缓存直接返回
    cached = _onboard_file(project_path)
    if cached.exists():
        try:
            data = json.loads(cached.read_text(encoding="utf-8"))
            return {"ok": True, "cached": True, "onboard": data}
        except Exception:
            pass

    # 2. 收集关键文件
    files = _collect_key_files(project_path)
    if not files:
        return {"ok": False, "error": "目录为空或无可读文件"}

    # 3. 调 LLM（用默认配置，低成本档）
    t0 = time.time()
    client = LLMClient()
    raw = await client.chat(
        system=_SYSTEM_PROMPT,
        user=_build_user_prompt(files),
        temperature=0.2,
    )
    elapsed = int((time.time() - t0) * 1000)
    print(f"[onboard] LLM 大纲生成耗时 {elapsed}ms, 文件数={len(files)}", flush=True)

    outline = _safe_parse_json(raw)
    if not outline:
        return {"ok": False, "error": "LLM 输出不是合法 JSON", "raw": raw[:500]}

    # 4. 落盘
    payload = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "source_files": [f["path"] for f in files],
        "outline": outline,
    }
    try:
        _onboard_file(project_path).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as e:
        print(f"[onboard] 落盘失败: {e}", flush=True)

    return {"ok": True, "cached": False, "onboard": outline}
