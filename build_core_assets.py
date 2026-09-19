# -*- coding: utf-8 -*-
"""把 codeagent/ 目录打包成 core_assets.bin（zip 格式）"""
import zipfile
from pathlib import Path

python_root = Path(__file__).parent / "python"
codeagent_dir = python_root / "agents" / "codeagent"
out_path = codeagent_dir / "core_assets.bin"

# 收集所有文件
files = []
for f in codeagent_dir.rglob("*"):
    if f.is_file() and f.name != "core_assets.bin":
        rel = f.relative_to(codeagent_dir)
        files.append((f, str(rel).replace("\\", "/")))

# 打包成 zip（存成 .bin 后缀）
with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for filepath, arcname in files:
        zf.write(filepath, arcname)

print(f"✅ core_assets.bin 已生成: {out_path}")
print(f"   大小: {out_path.stat().st_size} bytes")
print(f"   文件数: {len(files)}")
