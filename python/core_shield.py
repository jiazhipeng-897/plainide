# -*- coding: utf-8 -*-
"""
core_shield.py — 核心黑盒加载器（上架版）
========================================
将 core.bin（加密的核心字节码）在运行时解密并注入 import 系统。
本文件随发布版分发，但只包含加载框架，不含任何业务逻辑；
核心源码全部在 core.bin 的加密字节码中，不可直接阅读。

用法（main.py 开头，sys.path 注入后立即）：
    import core_shield
    core_shield.install()
"""
import importlib.abc
import importlib.util
import marshal
import sys
import types
import zlib
from pathlib import Path

_CORE_BIN = "core.bin"

_MODULES = {}    # 模块名 -> code object
_PACKAGES = set()


def _key() -> bytes:
    # "plainshield-v1" 字符码拼接（避免明文直现）
    _codes = (112, 108, 97, 105, 110, 115, 104, 105, 101, 108,
              100, 45, 118, 49)
    return "".join(chr(c) for c in _codes).encode("utf-8")


def _xor(data: bytes, key: bytes) -> bytes:
    klen = len(key)
    return bytes(b ^ key[i % klen] for i, b in enumerate(data))


def _load_core() -> dict:
    """解密 core.bin -> {模块名: code object, '__packages__': [包名]}"""
    bin_path = Path(__file__).resolve().parent / _CORE_BIN
    if not bin_path.exists():
        raise RuntimeError(f"缺少核心黑盒文件: {bin_path}")
    raw = _xor(bin_path.read_bytes(), _key())
    data = marshal.loads(zlib.decompress(raw))
    return data


class _ShieldImporter(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    """仅接管 core.bin 中存在的模块；其余模块走正常 import"""

    def find_spec(self, fullname, path=None, target=None):
        if fullname not in _MODULES:
            return None
        is_pkg = fullname in _PACKAGES
        return importlib.util.spec_from_loader(fullname, self, is_package=is_pkg)

    def create_module(self, spec):
        return None  # 使用默认 module

    def exec_module(self, module):
        code = _MODULES[module.__name__]
        # 提供合理的 __file__（用于 Path(__file__).parent 定位同级资产）
        module.__file__ = str(_CORE_DIR / (module.__name__.replace(".", "/") + ".py"))
        exec(code, module.__dict__)


_installed = False
_CORE_DIR = Path(__file__).resolve().parent


def install():
    """安装核心黑盒加载器（幂等）"""
    global _MODULES, _PACKAGES, _installed
    if _installed:
        return
    data = _load_core()
    _PACKAGES = set(data.get("__packages__", []))
    for name, blob in data.items():
        if name == "__packages__":
            continue
        _MODULES[name] = marshal.loads(blob)
    sys.meta_path.insert(0, _ShieldImporter())
    _installed = True
