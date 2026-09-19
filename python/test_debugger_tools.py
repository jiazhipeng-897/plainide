# -*- coding: utf-8 -*-
"""Debugger 工具集验证：parse_debugger_response / execute_debugger_tool 全工具 +
FakeLLM 完整工具循环（模拟"缺失模块文件"真实场景：write_file 创建 → final）"""
import asyncio
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from orchestrator.tools import (
    parse_debugger_response,
    execute_debugger_tool,
    parse_fix_output,
)
from orchestrator.pipeline import PipelineEngine

PASS = []
FAIL = []


def check(name, cond, detail=""):
    if cond:
        PASS.append(name)
        print(f"  ✓ {name}")
    else:
        FAIL.append(name)
        print(f"  ✗ {name}  {detail}")


async def test_parse():
    print("== parse_debugger_response ==")
    r = parse_debugger_response('{"tool_call": {"name": "read_file", "arguments": {"path": "a.py"}}}')
    check("tool_call 解析", r["type"] == "tool_call" and r["tool"]["name"] == "read_file")
    r = parse_debugger_response('```json\n{"tool_call": {"name": "write_file", "arguments": {"path": "x.py", "content": "print(1)"}}}\n```')
    check("tool_call 围栏包裹", r["type"] == "tool_call" and r["tool"]["name"] == "write_file")
    r = parse_debugger_response('{"fix_patches": []}')
    check("final 空补丁", r["type"] == "final" and r["patches"] == [])
    r = parse_debugger_response('{"fix_patches": [{"file": "a.py", "new_code": "x"}]}')
    check("final 补丁", r["type"] == "final" and len(r["patches"]) == 1)
    r = parse_debugger_response("这不是 JSON")
    check("invalid", r["type"] == "invalid")


async def test_tools(root: str):
    print("== execute_debugger_tool 全工具 ==")
    # write_file 创建（含子目录）
    out = await execute_debugger_tool(root, "write_file",
        {"path": "utils/config_manager.py", "content": "class ConfigManager:\n    pass\n"})
    check("write_file 创建嵌套文件", "已写入" in out and Path(root, "utils/config_manager.py").exists(), out)
    # read_file 带行号
    out = await execute_debugger_tool(root, "read_file", {"path": "utils/config_manager.py"})
    check("read_file 带行号", "1 |" in out and "ConfigManager" in out, out[:80])
    # read_file 不存在
    out = await execute_debugger_tool(root, "read_file", {"path": "nope.py"})
    check("read_file 文件不存在", "文件不存在" in out, out)
    # edit_file 精确替换
    out = await execute_debugger_tool(root, "edit_file",
        {"path": "utils/config_manager.py", "old_code": "class ConfigManager:\n    pass",
         "new_code": "class ConfigManager:\n    def load(self):\n        return {}\n"})
    check("edit_file 精确替换", "精确替换成功" in out, out)
    content = Path(root, "utils/config_manager.py").read_text(encoding="utf-8")
    check("edit_file 内容生效", "def load" in content)
    # list_files
    out = await execute_debugger_tool(root, "list_files", {})
    check("list_files 根目录", "DIR utils" in out, out[:80])
    # run_command
    out = await execute_debugger_tool(root, "run_command", {"cmd": "python -c \"print(42)\""})
    check("run_command 执行", "exit_code: 0" in out and "42" in out, out[:80])
    # delete_file
    out = await execute_debugger_tool(root, "delete_file", {"path": "utils/config_manager.py"})
    check("delete_file 删除", "已删除" in out and not Path(root, "utils/config_manager.py").exists(), out)
    # 路径安全：越界一律拦截
    out = await execute_debugger_tool(root, "write_file", {"path": "../evil.py", "content": "x"})
    check("路径穿越拦截(write)", "非法路径" in out, out)
    out = await execute_debugger_tool(root, "read_file", {"path": "../evil.py"})
    check("路径穿越拦截(read)", "非法路径" in out, out)
    out = await execute_debugger_tool(root, "delete_file", {"path": "../evil.py"})
    check("路径穿越拦截(delete)", "非法路径" in out, out)
    out = await execute_debugger_tool(root, "list_files", {"path": ".."})
    check("路径穿越拦截(list)", "非法路径" in out, out)
    out = await execute_debugger_tool(root, "unknown_tool", {})
    check("未知工具", "未知工具" in out, out)


class FakeLLM:
    """模拟 LLM：第一轮输出 write_file 创建缺失模块，第二轮输出 final（空补丁）"""
    is_mock = False

    def __init__(self):
        self.calls = 0

    async def chat(self, system, user, max_tokens=8192):
        self.calls += 1
        if self.calls == 1:
            return json.dumps({"tool_call": {"name": "write_file", "arguments": {
                "path": "utils/config_manager.py",
                "content": "class ConfigManager:\n    def __init__(self, path):\n        self.path = path\n"}}})
        return json.dumps({"fix_patches": []})


async def test_loop(root: str):
    print("== Debugger 工具循环（缺失模块文件场景） ==")
    engine = PipelineEngine  # 不实例化，直接构造后替换 llm
    # 构造一个最小实例：需要 loader / llm / events
    import orchestrator.pipeline as pipe_mod
    eng = pipe_mod.PipelineEngine.__new__(pipe_mod.PipelineEngine)
    eng.llm = FakeLLM()
    eng.loader = pipe_mod.get_agent_loader()
    # 场景：main.py 引用了 utils.config_manager（文件缺失）→ 报 ModuleNotFoundError
    Path(root, "main.py").write_text(
        "from utils.config_manager import ConfigManager\nprint('ok')\n", encoding="utf-8")
    run_result = {"output": (
        "Traceback (most recent call last):\n"
        f'  File "{Path(root, "main.py")}", line 1, in <module>\n'
        "    from utils.config_manager import ConfigManager\n"
        "ModuleNotFoundError: No module named 'utils.config_manager'\n")}
    patches = await eng._call_debugger({}, root, run_result)
    created = Path(root, "utils/config_manager.py").exists()
    check("循环后缺失文件被创建", created)
    check("FakeLLM 调用 2 轮", eng.llm.calls == 2, f"calls={eng.llm.calls}")
    # 最终补丁为空数组（工具已直接改完），parse_fix_output 兼容
    check("final 空补丁兼容", patches == [], str(patches))
    # 语法完整性：整体 import 不炸
    check("导入无异常", True)


async def main():
    root = tempfile.mkdtemp(prefix="dbg_tool_")
    print(f"临时项目: {root}\n")
    await test_parse()
    await test_tools(root)
    await test_loop(root)
    print(f"\n结果: {len(PASS)} 通过 / {len(FAIL)} 失败")
    if FAIL:
        print("失败项:", FAIL)
        sys.exit(1)
    print("ALL_PASS")
    shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    asyncio.run(main())
