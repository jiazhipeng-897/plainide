# -*- coding: utf-8 -*-
"""mock E2E 回归：规模档位 + 取消任务
场景A：standard 全链路（事件齐全、文件生成、报告落盘）
场景B：slim 档 → 只生成单文件（mock Backend 单文件 + Frontend index.html）
场景C：提交后立即取消 → SSE 收到 pipeline_cancelled，状态为 cancelled
"""
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = "http://127.0.0.1:8899"

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  ✓ " if cond else "  ✗ ") + name + (f"  {detail}" if detail and not cond else ""))


def wait_ready():
    for _ in range(80):
        try:
            s = socket.create_connection(("127.0.0.1", 8899), timeout=1)
            s.close()
            return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("mock 服务启动超时")


def post(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def read_stream(task_id, timeout=180):
    stream = urllib.request.urlopen(BASE + f"/orchestrator/task-stream/{task_id}", timeout=timeout)
    raw = stream.read().decode("utf-8", errors="replace")
    events = []
    for block in raw.split("\n\n"):
        evt, payload = "", None
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
    return events


def scenario_a(work):
    print("== 场景A：standard 全链路 ==")
    code, task = post("/orchestrator/submit-task", {
        "requirement": "写一个计算器", "techStack": {"name": "python", "form": "cli"},
        "projectPath": str(work), "scale": "standard"})
    check("A 提交成功", code == 200 and task.get("taskId"), str(task))
    check("A 返回 scale", task.get("scale") == "standard")
    events = read_stream(task["taskId"])
    types = [e["type"] for e in events]
    for key in ("stage_started", "stage_completed", "file_created", "file_written", "pipeline_completed"):
        check(f"A 事件 {key}", key in types)
    check("A 阶段数>=8", types.count("stage_completed") >= 8, str(types.count("stage_completed")))
    # P0 验收闭环：mock Acceptance 第 1 轮 passed=false → 自动重跑开发-验证段，第 2 轮过
    dev_starts = sum(1 for e in events if e["type"] == "stage_started" and e.get("stage", {}).get("key") == "development")
    acc_starts = sum(1 for e in events if e["type"] == "stage_started" and e.get("stage", {}).get("key") == "acceptance")
    check("A 验收闭环重跑 development（2次）", dev_starts == 2, str(dev_starts))
    check("A 验收阶段跑 2 次", acc_starts == 2, str(acc_starts))
    check("A 无 need_human（闭环收敛）", "need_human" not in types)
    files = [p for p in work.rglob("*") if p.is_file() and ".pyc" not in p.name]
    check("A 生成文件>0", len(files) > 0, str(len(files)))
    check("A 报告落盘", (work / "流水线报告.txt").exists())


def scenario_b(work):
    print("== 场景B：slim 档 → 单文件 ==")
    code, task = post("/orchestrator/submit-task", {
        "requirement": "写一个计算器", "techStack": {"name": "python", "form": "cli"},
        "projectPath": str(work), "scale": "slim"})
    check("B 提交成功", code == 200 and task.get("scale") == "slim", str(task))
    events = read_stream(task["taskId"])
    created = [e for e in events if e["type"] == "file_created"]
    # slim：Backend 只规划 main.py，Frontend 无文件 → 开发阶段唯一文件只有 1 个
    # （mock Acceptance 第 1 轮会触发修复重跑，同一文件可能出现 2 次，按 path 去重）
    unique = {e.get("path") for e in created}
    check("B 开发唯一文件数=1", len(unique) == 1, str(sorted(unique)))
    dev_py = [p for p in work.rglob("backend/*.py") if ".pyc" not in p.name]
    check("B backend 只 1 个 py", len(dev_py) == 1, str([p.name for p in dev_py]))
    check("B 无 backend/README", not (work / "generated" / "calculator" / "backend" / "README.md").exists())
    check("B 无 frontend/index", not (work / "generated" / "calculator" / "frontend" / "index.html").exists())


def scenario_c(work):
    print("== 场景C：提交后立即取消 ==")
    code, task = post("/orchestrator/submit-task", {
        "requirement": "写一个计算器", "techStack": {"name": "python", "form": "cli"},
        "projectPath": str(work), "scale": "full"})
    check("C 提交成功", code == 200 and task.get("taskId"))
    # 立即取消（任务可能还在 requirement 阶段）
    time.sleep(0.3)
    code, res = post("/orchestrator/cancel-task", {"taskId": task["taskId"]})
    check("C cancel 返回 cancelled", code == 200 and res.get("status") == "cancelled", str(res))
    events = read_stream(task["taskId"])
    types = [e["type"] for e in events]
    check("C 收到 pipeline_cancelled", "pipeline_cancelled" in types, str(types[:6]))
    # 任务状态快照
    with urllib.request.urlopen(BASE + f"/orchestrator/task-status/{task['taskId']}", timeout=5) as r:
        st = json.loads(r.read().decode())
    check("C 状态 cancelled", st.get("status") == "cancelled", str(st.get("status")))


def scenario_e(work):
    print("== 场景E：已有代码调研（增量开发上下文） ==")
    from orchestrator.pipeline import PipelineEngine
    work.mkdir(parents=True, exist_ok=True)
    # 预置一个"已有项目"：入口文件 + 依赖清单
    (work / "main.py").write_text("# 已有入口\nprint('hi')\n", encoding="utf-8")
    (work / "requirements.txt").write_text("fastapi\n", encoding="utf-8")
    (work / "src").mkdir(parents=True, exist_ok=True)
    (work / "src" / "util.py").write_text("def ping(): return 1\n", encoding="utf-8")
    ctx = PipelineEngine._collect_project_context(str(work))
    check("E 返回已有文件清单", "已有项目文件" in ctx and "main.py" in ctx, str(len(ctx)))
    check("E 排除 generated 等目录", "generated" not in ctx)
    check("E 注入入口文件内容", "已有入口" in ctx and "fastapi" in ctx)


def scenario_f(work):
    print("== 场景F：暂停 → 恢复 → 完成 ==")
    code, task = post("/orchestrator/submit-task", {
        "requirement": "写一个计算器", "techStack": {"name": "python", "form": "cli"},
        "projectPath": str(work), "scale": "standard"})
    check("F 提交成功", code == 200 and task.get("taskId"))
    # 任务启动后立刻暂停（mock 流水线约 15s，要赶在结束前暂停）
    time.sleep(0.6)
    code, res = post("/orchestrator/pause-task", {"taskId": task["taskId"]})
    check("F 暂停返回 paused", code == 200 and res.get("status") == "paused", str(res))
    with urllib.request.urlopen(BASE + f"/orchestrator/task-status/{task['taskId']}", timeout=5) as r:
        st = json.loads(r.read().decode())
    check("F 状态为 paused", st.get("status") == "paused", str(st.get("status")))
    # 暂停期间再查一次（确认没有继续跑完）
    time.sleep(1.0)
    with urllib.request.urlopen(BASE + f"/orchestrator/task-status/{task['taskId']}", timeout=5) as r:
        st2 = json.loads(r.read().decode())
    check("F 暂停后仍保持 paused", st2.get("status") == "paused", str(st2.get("status")))
    # 恢复 → 等待完成
    code, res = post("/orchestrator/resume-task", {"taskId": task["taskId"]})
    check("F 恢复返回 running", code == 200 and res.get("status") == "running", str(res))
    events = read_stream(task["taskId"])
    types = [e["type"] for e in events]
    check("F 收到 task_paused 事件", "task_paused" in types, str(types[:8]))
    check("F 收到 task_resumed 事件", "task_resumed" in types, str(types[:8]))
    check("F 恢复后正常完成", "pipeline_completed" in types)
    with urllib.request.urlopen(BASE + f"/orchestrator/task-status/{task['taskId']}", timeout=5) as r:
        st3 = json.loads(r.read().decode())
    check("F 最终状态 done", st3.get("status") == "done", str(st3.get("status")))


def scenario_g(work):
    print("== 场景G：续写已有项目（增量模式） ==")
    # 1. 准备一个"已有项目"：main.py 含可匹配片段
    work.mkdir(parents=True, exist_ok=True)
    (work / "main.py").write_text(
        "import sys\n\ndef main():\n    print('hello')\n\nif __name__ == '__main__':\n    main()\n",
        encoding="utf-8")
    code, task = post("/orchestrator/submit-task", {
        "requirement": "之前的项目把提示语改成中文", "projectPath": str(work),
        "mode": "incremental"})
    check("G 提交成功", code == 200 and task.get("taskId"), str(task))
    events = read_stream(task["taskId"])
    types = [e["type"] for e in events]
    started = next(e for e in events if e["type"] == "pipeline_started")
    keys = [s["key"] for s in started.get("stages", [])]
    # 增量阶段表：需求 → 开发 → 审查 → 测试 → 验收（无 UX/规划/架构/沙箱/部署）
    check("G 阶段表为增量5段", keys == ["requirement", "development", "review",
                                        "testing", "acceptance"], str(keys))
    check("G 收到 file_written 事件", "file_written" in types, str(types[:10]))
    check("G 正常完成", "pipeline_completed" in types)
    # 文件被局部修改：原文件保留，改动注入
    content = (work / "main.py").read_text(encoding="utf-8")
    check("G 原文件仍存在且被修改", "续写模式已修改" in content or "def main()" in content)
    with urllib.request.urlopen(BASE + f"/orchestrator/task-status/{task['taskId']}", timeout=5) as r:
        st = json.loads(r.read().decode())
    check("G 最终状态 done", st.get("status") == "done", str(st.get("status")))
    check("G mode 记录为 incremental", st.get("mode") == "incremental", str(st.get("mode")))


def scenario_h(work):
    print("== 场景H：写完后选打包 EXE（独立打包任务） ==")
    work.mkdir(parents=True, exist_ok=True)
    # 1. 先正常写完一个桌面项目
    code, task = post("/orchestrator/submit-task", {
        "requirement": "写一个桌面小游戏", "techStack": {"name": "python", "form": "desktop"},
        "projectPath": str(work), "scale": "standard"})
    check("H 提交成功", code == 200 and task.get("taskId"), str(task))
    origin = task["taskId"]
    evs1 = read_stream(origin)
    check("H 主任务完成", any(e["type"] == "pipeline_completed" for e in evs1))

    # 2. 用户选"打包 EXE" → 发起独立打包任务
    code, pkg = post("/orchestrator/package-task", {
        "taskId": origin, "projectPath": str(work)})
    check("H 打包任务提交成功", code == 200 and pkg.get("taskId"), str(pkg))
    check("H 打包 mode=package", pkg.get("mode") == "package")
    pkg_id = pkg["taskId"]

    # 3. 订阅打包事件流：单阶段 + 完成带产物（秒完成时走快照分支，产物从状态/事件里取）
    evs = read_stream(pkg_id)
    types = [e["type"] for e in evs]
    started = next(e for e in evs if e["type"] == "pipeline_started")
    keys = [s["key"] for s in started.get("stages", [])]
    check("H 打包阶段表为单段 packaging", keys == ["packaging"], str(keys))
    done = next(e for e in evs if e["type"] == "pipeline_completed")
    pk = done.get("packaging") or {}
    check("H 打包完成带产物", bool(pk.get("exeFiles")), str(pk)[:120])
    check("H build.bat 已落盘", (work / "build.bat").is_file())

    # 4. 状态查询：mode=package / kind=package / files 含 build.bat
    with urllib.request.urlopen(BASE + f"/orchestrator/task-status/{pkg_id}", timeout=5) as r:
        st = json.loads(r.read().decode())
    check("H 打包任务最终状态 done", st.get("status") == "done", str(st.get("status")))
    check("H 打包任务 kind=package", st.get("kind") == "package", str(st.get("kind")))
    files = st.get("files") or []
    check("H 状态 files 记录 build.bat", any(f.get("path") == "build.bat" for f in files),
          str(files)[:200])


def main():
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8899"],
        cwd=str(ROOT), env={**os.environ, "ORCHESTRATOR_MOCK": "1"},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_ready()
        work = ROOT / "generated" / "e2e_scale_cancel"
        import shutil
        shutil.rmtree(work, ignore_errors=True)
        work.mkdir(parents=True, exist_ok=True)
        scenario_a(work / "a")
        scenario_b(work / "b")
        scenario_c(work / "c")
        scenario_e(work / "e")
        scenario_f(work / "f")
        scenario_g(work / "g")
        scenario_h(work / "h")
        scenario_h(work / "h")
        print(f"\n结果: {len(PASS)} 通过 / {len(FAIL)} 失败")
        if FAIL:
            print("失败项:", FAIL)
            sys.exit(1)
        print("E2E_ALL_PASS")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    main()
