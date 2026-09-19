# ========================================
# Plain IDE 一键打包脚本
# 功能：编译核心为 bin + 复制到 release 目录
# ========================================

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "`n=== [1/4] 编译核心编排为 core.bin ===" -ForegroundColor Cyan
& "D:\Program Files\Python311\python.exe" build_core_bin.py
if ($LASTEXITCODE -ne 0) { Write-Host "core.bin 编译失败" -ForegroundColor Red; exit 1 }

Write-Host "`n=== [2/4] 打包 Agent 资产为 core_assets.bin ===" -ForegroundColor Cyan
& "D:\Program Files\Python311\python.exe" build_core_assets.py
if ($LASTEXITCODE -ne 0) { Write-Host "core_assets.bin 打包失败" -ForegroundColor Red; exit 1 }

Write-Host "`n=== [3/4] 复制开放源码到 release ===" -ForegroundColor Cyan
& "D:\Program Files\Python311\python.exe" build_release.py
if ($LASTEXITCODE -ne 0) { Write-Host "release 复制失败" -ForegroundColor Red; exit 1 }

Write-Host "`n=== [4/4] 完成 ===" -ForegroundColor Green
Write-Host "core.bin 大小: $((Get-Item python/core.bin).Length / 1KB) KB"
Write-Host "core_assets.bin 大小: $((Get-Item python/agents/codeagent/core_assets.bin).Length / 1KB) KB"
Write-Host "release 目录已更新"
