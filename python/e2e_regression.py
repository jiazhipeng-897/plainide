# -*- coding: utf-8 -*-
"""mock 全链路回归：启动 ORCHESTRATOR_MOCK uvicorn(8899) → 提交任务 → SSE 收流 →
校验关键事件 + 生成文件 + 报告落盘。验证 Debugger 工具集改动未破坏主流水线。"""
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WORK = ROOT / "generated" / "e2e_regression"
BASE = "http://127.0.0.1:8899"

WORK.mkdir(parents=True, exist_ok=True)

# 1. 启动 mock 服务
env = dict(os.environ)
env["ORCHESTRATOR_MOCK"] = "1"
proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8899"],
    cwd=str(ROOT), env=env,
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
try:
    # 2. 等待就绪（socket 探测端口）
    for _ in range(80):
        try:
            s = socket.create_connection(("127.0.0.1", 8899), timeout=1)
            s.close()
            break
        except Exception:
            time.sleep(0.5)
    else:
        raise RuntimeError("mock 服务启动超时")

    # 3. 提交任务
    body = json.dumps({
        "requirement": "写一个计算器",
        "techStack": {"name": "python", "form": "cli"},
        "projectPath": str(WORK),
    }).encode()
    req = urllib.request.Request(BASE + "/orchestrator/submit-task", data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        task = json.loads(r.read().decode())
    task_id = task.get("taskId")
    if not task_id:
        raise RuntimeError(f"submit-task 未返回 taskId: {task}")

    # 4. SSE 收流（任务完成时流关闭；块读一次取完）
    stream = urllib.request.urlopen(BASE + f"/orchestrator/task-stream/{task_id}", timeout=180)
    raw = stream.read().decode("utf-8", errors="replace")
    events = []
    for block in raw.split("\n\n"):
        evt = ""
        payload = None
        for line in block.splitlines():
            if line.startswith("event:"):
                evt = line[6:].strip()
            elif line.startswith("data:"):
                try:
                    payload = json.loads(line[5:].strip())
                except Exception:
                    pass
        if payload is not None:
            events.append({"type": evt, **payload})

    # 5. 断言（事件类型在 event: 行，data 是载荷）
    types = [e.get("type") for e in events]
    ok = True
    checks = []
    for key in ["stage_started", "stage_completed", "file_created", "file_written", "pipeline_completed"]:
        hit = key in types
        checks.append((f"事件 {key}", hit))
        ok = ok and hit
    # 分诊后小项目档（T1/T2）只跑 2~4 个阶段；完整档才 8+。断言 >= 2 即可
    stage_count = types.count("stage_completed")
    checks.append((f"阶段数 {stage_count} >= 2", stage_count >= 2))
    ok = ok and stage_count >= 2
    files = sorted(p for p in WORK.rglob("*") if p.is_file() and ".pyc" not in p.name)
    checks.append(("生成文件 > 0", len(files) > 0))
    ok = ok and len(files) > 0
    report = WORK / "流水线报告.txt"
    checks.append(("流水线报告.txt 落盘", report.exists()))
    ok = ok and report.exists()

    for name, passed in checks:
        print(("  ✓ " if passed else "  ✗ ") + name)
    if not ok:
        print("实际事件:", sorted(set(types)))
    print("E2E_RESULT:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)
finally:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except Exception:
        proc.kill()
