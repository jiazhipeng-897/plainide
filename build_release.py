# -*- coding: utf-8 -*-
"""
build_release.py — My Code IDE 上架版构建脚本（Open Core）
========================================================
职责：把核心包（orchestrator / code_rag / agents / map_hand）打成黑盒，
     组装 release/ 上架目录（开源壳 + 黑盒核心）。

用法：
    python build_release.py        # 全量构建到 ./release

黑盒手段：
    核心源码编译为字节码 -> zlib 压缩 -> XOR 加密 -> 打包为 python/core.bin；
    运行时由 python/core_shield.py 解密注入 import 系统。
    agents 文本资产（prompt.md / agent.yaml / skills）打包为
    agents/codeagent/core_assets.bin（json+zlib+xor，密钥在被加密的
    agents/loader.py 内）。核心包明文不进入 release/。

构建产物：
    release/
    ├── LICENSE / LICENSE.core / README.md / .gitignore
    ├── package.json / start.bat / electron/ / src/    # 开源壳
    └── python/
        ├── main.py / config.py / requirements.txt     # 开源入口
        ├── routers/ utils/ core/ debugger/ doctors/   # 开源辅助
        ├── core_shield.py                             # 黑盒加载器（框架）
        ├── core.bin                                   # ★ 加密核心（黑盒）
        └── agents/codeagent/core_assets.bin           # ★ 加密资产（黑盒）
"""
import json
import marshal
import shutil
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PY = ROOT / "python"
OUT = ROOT / "release"
TMP = ROOT / ".release-tmp"

# 黑盒包（源码 -> 加密字节码）
CORE_PACKAGES = ["orchestrator", "code_rag", "agents", "map_hand", "mirror"]
# 开源拷贝（python 下，排除核心与运行时产物）
PY_OPEN_DIRS = ["routers", "utils", "core", "debugger", "doctors", "tests"]
PY_OPEN_FILES = ["main.py", "config.py", "requirements.txt", "core_shield.py", "dns_fallback.py"]
# 根目录开源拷贝
ROOT_OPEN = ["electron", "src", "package.json", "start.bat", "index.html", "vite.config.js", "error-window.html"]
# 上架版 start.bat 使用独立的纯 ASCII 一键版（根目录 start.bat 是开发版，含中文，会破坏 cmd 解析）
RELEASE_START_BAT = ROOT / "release-start.bat"
# 拷贝时排除
EXCLUDE_NAMES = {"node_modules", "dist", ".git", ".vite", ".pytest_cache", "__pycache__",
                 ".code_rag", ".memory", ".mycode", ".preview", "cache", "temp"}
EXCLUDE_SUFFIX = {".log"}

# ---- agents 资产密钥（与 agents/loader.py 一致） ----
_AGENT_ASSET_NAME = "core_assets.bin"

# ---- core.bin 密钥（与 python/core_shield.py 一致） ----
_CORE_BIN_NAME = "core.bin"


def _shield_key() -> bytes:
    # "plainshield-v1"
    _codes = (112, 108, 97, 105, 110, 115, 104, 105, 101, 108,
              100, 45, 118, 49)
    return "".join(chr(c) for c in _codes).encode("utf-8")


def _agent_key() -> bytes:
    # "mycodeide-agents-v1"
    _codes = (109, 121, 99, 111, 100, 101, 105, 100, 101, 45,
              97, 103, 101, 110, 116, 115, 45, 118, 49)
    return "".join(chr(c) for c in _codes).encode("utf-8")


def _xor_bytes(data: bytes, key: bytes) -> bytes:
    klen = len(key)
    return bytes(b ^ key[i % klen] for i, b in enumerate(data))


# ==================== 1. agents 资产 ====================
def _read_agent_asset(agent_dir: Path):
    yaml_path = agent_dir / "agent.yaml"
    if not yaml_path.exists():
        return None
    import yaml
    with open(yaml_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)
    prompt_path = agent_dir / "prompt.md"
    config["prompt"] = open(prompt_path, "r", encoding="utf-8").read() if prompt_path.exists() else ""
    routing_dir = agent_dir / "routing"
    if routing_dir.exists():
        for rf in sorted(routing_dir.glob("*.md")) + sorted(routing_dir.glob("*.yaml")):
            config["routing"] = open(rf, "r", encoding="utf-8").read()
            break
    skills_dir = agent_dir / "skills"
    if skills_dir.exists():
        skills, seen = [], set()
        for skill_file in sorted(skills_dir.rglob("*.md")):
            parts = skill_file.relative_to(skills_dir).parts
            if len(parts) == 1:
                name = skill_file.stem
            else:
                if parts[-1] != "SKILL.md":
                    continue
                name = parts[0]
            if name in seen:
                continue
            seen.add(name)
            skills.append({"name": name, "content": open(skill_file, "r", encoding="utf-8").read()})
        config["skills"] = skills
    # 顶层非 prompt.md 文档（translate.md / evaluate.md 等）：release 下明文目录被删，
    # mirror/prompts.py 需从加密资产读取，必须一并打包，否则翻译官拿到占位 prompt（黑盒缺陷）。
    extra_md = {}
    for md_file in sorted(agent_dir.glob("*.md")):
        if md_file.name != "prompt.md":
            extra_md[md_file.name] = open(md_file, "r", encoding="utf-8").read()
    if extra_md:
        config["extra_md"] = extra_md
    return config


def build_agents_asset() -> Path:
    """遍历 agents/codeagent/ 生成 core_assets.bin"""
    codeagent = PY / "agents" / "codeagent"
    data = {}
    for agent_dir in sorted(codeagent.iterdir()):
        if not agent_dir.is_dir():
            continue
        cfg = _read_agent_asset(agent_dir)
        if cfg:
            data[agent_dir.name] = cfg
    raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
    enc = _xor_bytes(zlib.compress(raw, 9), _agent_key())
    asset_dir = TMP / "assets"
    asset_dir.mkdir(parents=True, exist_ok=True)
    asset_path = asset_dir / _AGENT_ASSET_NAME
    asset_path.write_bytes(enc)
    print(f"[build] agents 资产已加密: {len(data)} 个 agent -> {asset_path.name} ({len(enc)} 字节)")
    return asset_path


# ==================== 2. 核心字节码黑盒 ====================
def build_core_bin() -> Path:
    """核心包源码 -> 字节码 -> zlib -> XOR -> core.bin"""
    data, packages = {}, []
    for pkg in CORE_PACKAGES:
        pkg_dir = PY / pkg
        if not pkg_dir.exists():
            print(f"[build] 警告: 缺少 {pkg_dir}")
            continue
        for py in sorted(pkg_dir.rglob("*.py")):
            src = py.read_text(encoding="utf-8")
            code = compile(src, str(py), "exec")
            if py.name == "__init__.py":
                modname = ".".join(py.relative_to(PY).parts[:-1]) or pkg
                if modname:
                    packages.append(modname)
            else:
                rel = py.relative_to(PY)
                modname = ".".join(list(rel.parts[:-1]) + [rel.stem])
            data[modname] = marshal.dumps(code)
    data["__packages__"] = sorted(set(packages))
    blob = zlib.compress(marshal.dumps(data), 9)
    enc = _xor_bytes(blob, _shield_key())
    out = TMP / _CORE_BIN_NAME
    out.write_bytes(enc)
    print(f"[build] 核心黑盒已生成: {len(data)-1} 个模块 -> {out.name} ({len(enc)/1024:.0f} KB)")
    return out


# ==================== 3. 组装 ====================
def _copy_tree(src: Path, dst: Path):
    for item in src.rglob("*"):
        if item.name in EXCLUDE_NAMES or item.suffix in EXCLUDE_SUFFIX:
            continue
        rel = item.relative_to(src)
        target = dst / rel
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)


def _clean_dir(path: Path):
    """清空目录内容但保留目录本身（避免外部进程占用目录句柄导致 rmtree 失败）。"""
    if not path.exists():
        return
    for item in path.iterdir():
        try:
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            else:
                item.unlink(missing_ok=True)
        except OSError:
            pass


def assemble(core_bin: Path, asset_path: Path):
    _clean_dir(OUT)
    OUT.mkdir(parents=True, exist_ok=True)

    # python/ 开源部分（_clean_dir 只清内容不清目录，目录可能残留，exist_ok=True 兼容）
    py_out = OUT / "python"
    py_out.mkdir(parents=True, exist_ok=True)
    for f in PY_OPEN_FILES:
        if (PY / f).exists():
            shutil.copy2(PY / f, py_out / f)
    for d in PY_OPEN_DIRS:
        if (PY / d).exists():
            _copy_tree(PY / d, py_out / d)

    # 黑盒：core.bin 替换 4 个核心包明文
    for pkg in CORE_PACKAGES:
        p = py_out / pkg
        if p.exists():
            shutil.rmtree(p, ignore_errors=True)
    shutil.copy2(core_bin, py_out / _CORE_BIN_NAME)
    print(f"[build] 黑盒: python/{_CORE_BIN_NAME}（核心包明文已移除）")

    # agents 加密资产
    ca = py_out / "agents" / "codeagent"
    ca.mkdir(parents=True, exist_ok=True)
    shutil.copy2(asset_path, ca / _AGENT_ASSET_NAME)
    print(f"[build] 黑盒: python/agents/codeagent/ -> {_AGENT_ASSET_NAME}")

    # 根目录开源壳
    for item in ROOT_OPEN:
        p = ROOT / item
        if p.exists():
            if p.is_dir():
                _copy_tree(p, OUT / item)
            else:
                shutil.copy2(p, OUT / item)
    # 上架版 start.bat：优先用纯 ASCII 一键版
    if RELEASE_START_BAT.exists():
        (OUT / "start.bat").write_bytes(RELEASE_START_BAT.read_bytes())

    # 文档与许可
    (OUT / "LICENSE").write_text(MIT_LICENSE, encoding="utf-8")
    (OUT / "LICENSE.core").write_text(CORE_LICENSE, encoding="utf-8")
    (OUT / "README.md").write_text(read_release_readme(), encoding="utf-8")
    (OUT / ".gitignore").write_text(GITIGNORE, encoding="utf-8")


def summarize():
    total = 0
    print("\n===== release/ 产物清单 =====")
    for root, _dirs, files in os_walk(OUT):
        for f in sorted(files):
            p = Path(root) / f
            rel = p.relative_to(OUT)
            sz = p.stat().st_size
            total += sz
            if f in (_CORE_BIN_NAME, _AGENT_ASSET_NAME):
                print(f"  [黑盒] {rel}  ({sz:,}B)")
    print(f"\n[build] 总大小: {total/1024/1024:.1f} MB")


def os_walk(base):
    import os
    for root, dirs, files in os.walk(base):
        yield root, dirs, files


# ==================== 文档模板 ====================
MIT_LICENSE = """MIT License

Copyright (c) 2026 My Code IDE Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

CORE_LICENSE = """My Code IDE 核心模块闭源声明（Core License）
==========================================

本仓库遵循 Open Core 模式：

- 开源部分（MIT License）：src/ 前端、electron/ 壳、python/ 下非核心辅助模块
  （routers/ utils/ core/ debugger/ doctors/ tests/ main.py config.py
  core_shield.py 等）。
- 闭源部分：python/orchestrator/、python/code_rag/、python/map_hand/、
  python/mirror/、python/agents/。核心逻辑以加密字节码 python/core.bin 与加密资产
  python/agents/codeagent/core_assets.bin 分发，源码不开放。

禁止：
1. 对 core.bin / core_assets.bin 进行反编译、逆向、还原或提取其中逻辑；
2. 将闭源部分用于二次分发、转售或任何商业用途；
3. 移除或篡改本声明。

如需商用授权或源码许可，请联系作者。
"""

def read_release_readme() -> str:
    """上架版 README 从根目录 release-readme.md 读取（单源维护，防构建覆盖）"""
    p = ROOT / "release-readme.md"
    if p.exists():
        return p.read_text(encoding="utf-8")
    return "# My Code IDE\n\n上架版 README 模板缺失：请将 release-readme.md 放回项目根目录。\n"

GITIGNORE = """# 依赖与构建
node_modules/
dist/
*.log

# Python 缓存
__pycache__/
*.pyc

# 软件内部数据（自动生成，含本地敏感信息）
.code_rag/
.memory/
.mycode/
python/cache/
python/temp/
python/generated/
python/.pytest_cache/

# 本地配置
%APPDATA%/my-ide/
config.json
server_config.json

# 系统
.DS_Store
Thumbs.db
"""

if __name__ == "__main__":
    print("===== My Code IDE 上架版构建开始 =====")
    TMP.mkdir(parents=True, exist_ok=True)
    asset = build_agents_asset()
    core = build_core_bin()
    assemble(core, asset)
    summarize()
    print("\n===== 构建完成: release/ =====")
