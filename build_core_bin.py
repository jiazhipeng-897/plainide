# -*- coding: utf-8 -*-
"""打包核心模块成 core.bin（闭源黑盒）"""
import compileall
import marshal
import zlib
from pathlib import Path
import os

# 闭源模块列表（这些模块编译进 core.bin）
SHIELD_MODULES = [
    # orchestrator 核心
    "orchestrator",
    "orchestrator.engine",
    "orchestrator.development",
    "orchestrator.verification",
    "orchestrator.tools",
    "orchestrator.triage",
    "orchestrator.router",
    "orchestrator.task_manager",
    "orchestrator.snapshot",
    "orchestrator.changelog",
    "orchestrator.syntax_gate",
    "orchestrator.context",
    "orchestrator.llm",
    "orchestrator.agent_skills",
    "orchestrator.code_context",
    "orchestrator.intent",
    "orchestrator.usage_tracker",
    "orchestrator.tech_stack",
    "orchestrator.web_search",
    "orchestrator.pipeline",
    "orchestrator.stages",
    "orchestrator.events",
    "orchestrator.explorer",
    "orchestrator.tail_phases",
    "orchestrator.design_phases",
    "orchestrator.plan_preview",
    "orchestrator.rag_index_worker",
    "orchestrator.security",
    "orchestrator.config",
    "orchestrator.utils",
    "orchestrator.__init__",
    # code_rag 核心
    "code_rag",
    "code_rag.application",
    "code_rag.application.index_service",
    "code_rag.application.lsp_service",
    "code_rag.application.parent_context",
    "code_rag.application.repo_map",
    "code_rag.domain",
    "code_rag.domain.bm25",
    "code_rag.domain.chunker",
    "code_rag.domain.embedder",
    "code_rag.domain.models",
    "code_rag.domain.tokenizer",
    "code_rag.infrastructure",
    "code_rag.infrastructure.parser",
    "code_rag.infrastructure.symbol_parser",
    "code_rag.infrastructure.vector_store",
    "code_rag.interface",
    "code_rag.interface.cli",
    "code_rag.__init__",
    # agents 核心
    "agents",
    "agents.base",
    "agents.loader",
    "agents.coordinator_agent",
    "agents.chat_facade_agent",
    "agents.mock_agent",
    "agents.deepseek",
    "agents.volcengine",
    "agents.baidu",
    "agents.tencent",
    "agents.__init__",
]

# 包列表（这些是包，需要 __init__.py）
PACKAGES = [
    "orchestrator",
    "code_rag",
    "code_rag.application",
    "code_rag.domain",
    "code_rag.infrastructure",
    "code_rag.interface",
    "agents",
]

# XOR key（和 core_shield.py 里的 _key() 一致）
KEY = b"plainshield-v1"


def xor(data: bytes, key: bytes) -> bytes:
    klen = len(key)
    return bytes(b ^ key[i % klen] for i, b in enumerate(data))


def compile_module(module_name: str, python_root: Path) -> bytes:
    """编译一个模块成 code object 的 marshal 字节"""
    # 模块名 → 文件路径
    rel = module_name.replace(".", "/") + ".py"
    filepath = python_root / rel
    if not filepath.exists():
        print(f"  跳过（不存在）: {module_name}")
        return None
    src = filepath.read_text(encoding="utf-8")
    code = compile(src, str(filepath), "exec")
    return marshal.dumps(code)


def main():
    python_root = Path(__file__).parent / "python"
    print(f"Python root: {python_root}")

    result = {}
    packages = set()

    for mod in SHIELD_MODULES:
        print(f"编译: {mod}")
        blob = compile_module(mod, python_root)
        if blob is not None:
            result[mod] = blob

    # 标记包
    for pkg in PACKAGES:
        if pkg in result:
            packages.add(pkg)

    result["__packages__"] = list(packages)

    # 序列化 + 压缩 + 加密
    data = marshal.dumps(result)
    compressed = zlib.compress(data, level=9)
    encrypted = xor(compressed, KEY)

    out_path = python_root / "core.bin"
    out_path.write_bytes(encrypted)
    print(f"\n✅ core.bin 已生成: {out_path}")
    print(f"   大小: {len(encrypted)} bytes")
    print(f"   模块数: {len(result) - 1}")


if __name__ == "__main__":
    main()
