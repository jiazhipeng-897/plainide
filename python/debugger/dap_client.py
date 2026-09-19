# -*- coding: utf-8 -*-
"""
DAP (Debug Adapter Protocol) 客户端 —— 极简实现
负责与 debugpy 的 DAP 端口通信：请求/响应 + 事件分发。
"""
import json
import socket
import threading
import time
from typing import Callable, Dict, Optional

FRAME_BUF = 65536


class DapError(Exception):
    pass


class DapClient:
    """同步 DAP 客户端：send() 阻塞等响应；事件在独立线程回调。"""

    def __init__(self, on_event: Optional[Callable[[str, dict], None]] = None):
        self._sock: Optional[socket.socket] = None
        self._seq = 0
        self._lock = threading.Lock()
        self._pending: Dict[int, "threading.Event"] = {}
        self._responses: Dict[int, dict] = {}
        self._read_thread: Optional[threading.Thread] = None
        self._closed = False
        self.on_event = on_event

    # ---------- 连接 ----------
    def connect(self, host: str, port: int, timeout: float = 10.0) -> None:
        deadline = time.time() + timeout
        last_err = None
        while time.time() < deadline:
            try:
                s = socket.create_connection((host, port), timeout=2.0)
                # 关键：create_connection 的 timeout 是 socket 级超时，会让后续 recv 阻塞超时退出；
                # 必须切回阻塞模式，read_loop 靠 close() 中断
                s.settimeout(None)
                self._sock = s
                self._closed = False
                self._read_thread = threading.Thread(target=self._read_loop, daemon=True)
                self._read_thread.start()
                return
            except OSError as e:
                last_err = e
                time.sleep(0.3)
        raise DapError(f"无法连接 DAP 端口 {host}:{port}: {last_err}")

    # ---------- 发送 ----------
    def send(self, command: str, args: Optional[dict] = None, timeout: float = 15.0) -> dict:
        if not self._sock or self._closed:
            raise DapError("DAP 连接未建立或已关闭")
        seq = self._write_request(command, args)
        ev = threading.Event()
        self._pending[seq] = ev
        if not ev.wait(timeout):
            self._pending.pop(seq, None)
            raise DapError(f"请求 {command} 超时")
        resp = self._responses.pop(seq, {})
        if resp.get("success") is False:
            raise DapError(resp.get("message") or f"命令 {command} 失败: {resp.get('body')}")
        return resp.get("body") or {}

    def send_async(self, command: str, args: Optional[dict] = None) -> None:
        """只发送不等待响应（用于 start 类请求：响应延迟到 configurationDone 才返回）"""
        if not self._sock or self._closed:
            raise DapError("DAP 连接未建立或已关闭")
        self._write_request(command, args)

    def _write_request(self, command: str, args: Optional[dict] = None) -> int:
        with self._lock:
            self._seq += 1
            seq = self._seq
            msg = {"seq": seq, "type": "request", "command": command}
            if args:
                msg["arguments"] = args
            payload = json.dumps(msg, ensure_ascii=False)
            frame = f"Content-Length: {len(payload.encode('utf-8'))}\r\n\r\n{payload}"
            try:
                self._sock.sendall(frame.encode("utf-8"))
            except OSError as e:
                raise DapError(f"发送失败: {e}")
        return seq

    def close(self) -> None:
        self._closed = True
        try:
            if self._sock:
                self._sock.close()
        except OSError:
            pass

    # ---------- 读取循环 ----------
    def _read_loop(self) -> None:
        buf = b""
        try:
            while not self._closed:
                try:
                    chunk = self._sock.recv(FRAME_BUF)
                except socket.timeout:
                    continue
                if not chunk:
                    break
                buf += chunk
                while True:
                    head_end = buf.find(b"\r\n\r\n")
                    if head_end == -1:
                        break
                    head = buf[:head_end].decode("utf-8", "ignore")
                    length = 0
                    for line in head.split("\r\n"):
                        if line.lower().startswith("content-length:"):
                            length = int(line.split(":", 1)[1].strip())
                    body_start = head_end + 4
                    if len(buf) < body_start + length:
                        break
                    body = buf[body_start:body_start + length].decode("utf-8", "ignore")
                    buf = buf[body_start + length:]
                    self._dispatch(body)
        except OSError:
            pass
        finally:
            self._closed = True

    def _dispatch(self, body: str) -> None:
        try:
            msg = json.loads(body)
        except Exception:
            return
        if msg.get("type") == "response":
            seq = msg.get("request_seq")
            self._responses[seq] = msg
            ev = self._pending.pop(seq, None)
            if ev:
                ev.set()
        elif msg.get("type") == "event":
            name = msg.get("event", "")
            args = msg.get("body") or {}
            if self.on_event:
                try:
                    self.on_event(name, args)
                except Exception:
                    pass
