# -*- coding: utf-8 -*-
"""
调试会话：管理一个被调试的 Python 进程（debugpy 子进程 + DAP 会话）。
职责：启动 / 断点 / 继续 / 暂停 / 单步 / 栈帧 / 变量 / 求值 / 终止。
"""
import os
import random
import subprocess
import sys
import threading
import time

from .dap_client import DapClient, DapError


class DebugSession:
    def __init__(self, sid: str):
        self.sid = sid
        self.status = "idle"          # idle | launching | running | paused | stopped | error
        self.error = ""
        self.file = ""
        self.cwd = ""
        self.port = 0
        self.process: subprocess.Popen = None
        self.client: DapClient = None
        self.breakpoints: dict = {}   # {abs_path: [line,...]}
        self.threads: dict = {}       # {id: name}
        self.current_thread_id = None
        self.stack_frames: list = []  # [{id,name,line,path}]
        self.current_frame_id = None
        self.scopes: list = []        # [{name,variablesReference}]
        self.top_variables: list = [] # [{name,value,type,variablesReference}]
        self.output: list = []        # [{category,text}] 最近 200 条
        self._lock = threading.Lock()
        self._msg_ev = threading.Event()

    # ---------- 生命周期 ----------
    def launch(self, file: str, args=None, python_path=None, port=None, breakpoints=None):
        args = args or []
        if breakpoints:
            self.breakpoints = {os.path.abspath(k): sorted(set(v)) for k, v in breakpoints.items()}
        self.file = os.path.abspath(file)
        self.cwd = os.path.dirname(self.file)
        if not os.path.isfile(self.file):
            raise DapError(f"文件不存在: {self.file}")
        self.port = port or random.randint(56780, 56850)
        py = python_path or sys.executable
        cmd = [py, "-Xfrozen_modules=off", "-m", "debugpy", "--listen", f"127.0.0.1:{self.port}",
               "--wait-for-client", self.file] + list(args)
        try:
            self.process = subprocess.Popen(
                cmd, cwd=self.cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except OSError as e:
            raise DapError(f"启动调试进程失败: {e}")

        self.status = "launching"
        self.client = DapClient(on_event=self._on_event)
        try:
            self.client.connect("127.0.0.1", self.port, timeout=12.0)
        except DapError as e:
            self._kill()
            self.status = "error"
            self.error = str(e)
            raise

        # DAP 握手：initialize → attach → 等 initialized → breakpoints → configurationDone
        # 注1：`python -m debugpy --listen <script>` 是已绑定 server 的 adapter，必须 attach（launch 报 '"attach" expected'）
        # 注2：attach 是 start 请求（响应延迟到 configurationDone），处理完成时 debugpy 发 initialized 事件，
        #      收到后才可设置断点；attach 本身用异步发送不等待
        self.client.send("initialize", {
            "adapterID": "python",
            "clientID": "my-code-ide",
            "supportsVariableType": True,
        })
        self.client.send_async("attach", {
            "type": "python",
            "request": "attach",
            "justMyCode": False,
        })
        self._msg_ev.clear()
        if not self._msg_ev.wait(10.0):
            self._kill()
            self.status = "error"
            self.error = "等待 initialized（attach 就绪）超时"
            raise DapError(self.error)
        if self.breakpoints:
            self._apply_breakpoints()
        self.client.send("configurationDone")
        self.status = "running"
        self._spawn_output_pump()

    def terminate(self):
        try:
            if self.client:
                try:
                    self.client.send("terminate", {}, timeout=3.0)
                except DapError:
                    pass
                try:
                    self.client.send("disconnect", {}, timeout=3.0)
                except DapError:
                    pass
        except Exception:
            pass
        self._kill()
        self.status = "stopped"

    def _kill(self):
        if self.process:
            try:
                self.process.terminate()
            except Exception:
                pass
            try:
                self.process.kill()
            except Exception:
                pass
            self.process = None
        if self.client:
            try:
                self.client.close()
            except Exception:
                pass

    # ---------- 断点 ----------
    def set_breakpoints(self, path: str, lines: list):
        self.breakpoints[os.path.abspath(path)] = sorted(set(lines))
        if self.client and self.status in ("running", "paused"):
            self._apply_breakpoints()

    def _apply_breakpoints(self):
        try:
            self.client.send("setBreakpoints", {
                "source": {"path": self.file},
                "breakpoints": [{"line": ln} for ln in self.breakpoints.get(self.file, [])],
            })
        except DapError:
            pass

    # ---------- 控制 ----------
    def resume(self):
        if self.status != "paused":
            return
        tid = self.current_thread_id
        if tid:
            self.client.send("continue", {"threadId": tid})
        self.status = "running"

    def pause(self):
        if self.status != "running":
            return
        tids = list(self.threads.keys())
        if tids:
            self.client.send("pause", {"threadId": tids[0]})

    def step(self, kind: str):
        if self.status != "paused":
            return
        tid = self.current_thread_id
        if not tid:
            return
        cmd = {"next": "next", "step-in": "stepIn", "step-out": "stepOut"}.get(kind)
        if not cmd:
            return
        self.client.send(cmd, {"threadId": tid})
        self.status = "running"

    # ---------- 数据 ----------
    def fetch_stack(self, thread_id):
        body = self.client.send("stackTrace", {"threadId": thread_id, "levels": 50})
        frames = []
        for f in body.get("stackFrames", []):
            src = f.get("source") or {}
            frames.append({
                "id": f.get("id"),
                "name": f.get("name"),
                "line": f.get("line"),
                "path": src.get("path") or "",
            })
        self.stack_frames = frames
        if frames:
            self.current_frame_id = frames[0]["id"]
            self._fetch_scopes(frames[0]["id"])

    def _fetch_scopes(self, frame_id):
        body = self.client.send("scopes", {"frameId": frame_id})
        scopes = []
        for s in body.get("scopes", []):
            scopes.append({"name": s.get("name"), "variablesReference": s.get("variablesReference")})
        self.scopes = scopes
        self.top_variables = []
        for s in scopes:
            ref = s.get("variablesReference")
            if ref:
                self.top_variables.extend(self.fetch_variables(ref))

    def fetch_variables(self, variables_reference):
        body = self.client.send("variables", {"variablesReference": variables_reference})
        out = []
        for v in body.get("variables", []):
            out.append({
                "name": v.get("name"),
                "value": v.get("value"),
                "type": v.get("type", ""),
                "variablesReference": v.get("variablesReference", 0),
            })
        return out

    def evaluate(self, expression, frame_id=None):
        fid = frame_id or self.current_frame_id
        if not fid:
            raise DapError("无可用栈帧")
        return self.client.send("evaluate", {"expression": expression, "frameId": fid, "context": "repl"})

    # ---------- 事件 ----------
    def _on_event(self, name, body):
        if name == "initialized":
            self._msg_ev.set()
        elif name == "thread":
            tid = body.get("threadId")
            if body.get("reason") == "started" and tid:
                self.threads[tid] = body.get("threadId", tid)
                if self.current_thread_id is None:
                    self.current_thread_id = tid
        elif name == "stopped":
            # 注意：此处只记录状态，不能同步 send() 拉栈（read_loop 线程会被自己阻塞死锁）；
            # 栈帧由 /state 接口在 API 线程按需拉取
            self.current_thread_id = body.get("threadId") or self.current_thread_id
            if self.current_thread_id:
                self.threads.setdefault(self.current_thread_id, self.current_thread_id)
            self.status = "paused"
        elif name == "continued":
            self.status = "running"
        elif name == "output":
            cat = body.get("category", "console")
            out = body.get("output", "")
            with self._lock:
                self.output.append({"category": cat, "text": out})
                if len(self.output) > 200:
                    self.output = self.output[-200:]
        elif name in ("exited", "terminated", "process"):
            if name in ("exited", "terminated"):
                self.status = "stopped"

    # ---------- 输出泵 ----------
    def _spawn_output_pump(self):
        def pump():
            while self.process and self.process.poll() is None:
                line = self.process.stdout.readline()
                if not line:
                    break
                with self._lock:
                    self.output.append({"category": "stdout", "text": line.decode("utf-8", "ignore")})
                    if len(self.output) > 200:
                        self.output = self.output[-200:]
            # 进程退出
            if self.status == "running":
                self.status = "stopped"

        threading.Thread(target=pump, daemon=True).start()

    # ---------- 状态快照 ----------
    def snapshot(self, variables_ref=None):
        with self._lock:
            out = list(self.output)
        # paused 但还没拉栈时，在 API 线程补拉（不能在 read_loop 事件回调里拉）
        if self.status == "paused" and not self.stack_frames and self.current_thread_id:
            try:
                self.fetch_stack(self.current_thread_id)
            except DapError:
                pass
        if variables_ref:
            try:
                vars_ = self.fetch_variables(variables_ref)
            except DapError:
                vars_ = []
        else:
            vars_ = self.top_variables
        return {
            "sid": self.sid,
            "status": self.status,
            "error": self.error,
            "file": self.file,
            "threads": [{"id": tid, "name": str(name)} for tid, name in self.threads.items()],
            "currentThreadId": self.current_thread_id,
            "stackFrames": self.stack_frames[:20],
            "currentFrameId": self.current_frame_id,
            "scopes": self.scopes,
            "variables": vars_,
            "breakpoints": {k: v for k, v in self.breakpoints.items()},
            "output": out[-50:],
        }
