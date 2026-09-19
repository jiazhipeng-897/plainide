# -*- coding: utf-8 -*-
"""dns_fallback.py — 系统 DNS 解析失败时的软件内置兜底。

背景：部分用户网络环境解析 api.deepseek.com / ark.cn-beijing.volces.com 失败
（getaddrinfo failed），导致 Agent 链路 LLM 调用全部失败。
本模块在启动时探测关键 LLM 域名：仅当解析失败时才在本进程内注入直连 IP 映射
（socket.getaddrinfo + asyncio.BaseEventLoop.getaddrinfo 双层，httpx/anyio 全覆盖）。
只影响本进程，不改系统配置；网络正常时完全不生效、无感。
"""
import asyncio
import socket

# 域名 -> 首选 IP（实测值；仅作兜底，网络正常时不会用到）
_FALLBACK_IPS = {
    "api.deepseek.com": "36.150.244.216",
    "ark.cn-beijing.volces.com": "180.184.156.95",
    "api.openai.com": "104.18.32.87",
}

_installed = False


def _resolve(host):
    if isinstance(host, bytes):
        try:
            host = host.decode("ascii")
        except Exception:
            return host
    if isinstance(host, str):
        ip = _FALLBACK_IPS.get(host.lower())
        if ip:
            return ip
    return host


def _install():
    global _installed
    if _installed:
        return
    # 1) socket 层
    _orig_socket_gai = socket.getaddrinfo

    def _patched_socket_gai(host, port, family=0, type=0, proto=0, flags=0):
        return _orig_socket_gai(_resolve(host), port, family, type, proto, flags)

    socket.getaddrinfo = _patched_socket_gai
    # 2) asyncio 事件循环层（httpx/anyio 走 loop.getaddrinfo，绕开 socket 层）
    _orig_loop_gai = asyncio.BaseEventLoop.getaddrinfo

    def _patched_loop_gai(self, host, port, *args, **kwargs):
        return _orig_loop_gai(self, _resolve(host), port, *args, **kwargs)

    asyncio.BaseEventLoop.getaddrinfo = _patched_loop_gai
    _installed = True
    print("[dns_fallback] 已注入 DNS 直连映射（仅对解析失败的域名生效）:", list(_FALLBACK_IPS.keys()), flush=True)


def install_if_needed():
    """启动时调用：探测关键 LLM 域名，全部解析失败才注入兜底；网络正常则完全不动。"""
    import sys
    if sys.platform != "win32":
        return  # 非 Windows 一般无此问题
    failed = 0
    for host in _FALLBACK_IPS:
        try:
            socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM)
            return  # 任一域名解析成功即认为 DNS 正常，不注入
        except Exception:
            failed += 1
    if failed == len(_FALLBACK_IPS):
        try:
            _install()
        except Exception as e:
            print(f"[dns_fallback] 注入失败（忽略，继续启动）: {e}", flush=True)
