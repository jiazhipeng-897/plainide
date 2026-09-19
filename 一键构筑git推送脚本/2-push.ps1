# ========================================
# Plain IDE 增量 Git 推送脚本
# 功能：只推改动的文件 + 记录快照
# ========================================

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "`n=== [1/3] 检查改动 ===" -ForegroundColor Cyan

# 获取改动文件列表
$changedFiles = git diff --name-only HEAD 2>$null
$stagedFiles = git diff --cached --name-only 2>$null
$allChanged = @($changedFiles) + @($stagedFiles) | Sort-Object -Unique

if ($allChanged.Count -eq 0) {
    Write-Host "没有改动，无需推送" -ForegroundColor Yellow
    exit 0
}

Write-Host "发现 $($allChanged.Count) 个改动文件：" -ForegroundColor Green
$allChanged | ForEach-Object { Write-Host "  $_" }

Write-Host "`n=== [2/3] 生成快照 ===" -ForegroundColor Cyan
$snapshotDir = "一键构筑git推送脚本\快照"
New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$snapshotFile = "$snapshotDir\$timestamp.md"

$content = @"
# 快照 $timestamp

## 改动文件（$($allChanged.Count) 个）

`````
$($allChanged -join "`n")
`````

## 说明

- 本快照记录本次推送的改动
- 下次推送只更新这些文件
"@

Set-Content -Path $snapshotFile -Value $content -Encoding UTF8
Write-Host "快照已保存: $snapshotFile" -ForegroundColor Green

Write-Host "`n=== [3/3] Git 推送 ===" -ForegroundColor Cyan
git add .
git commit -m "更新: $timestamp"
git push origin main

Write-Host "`n=== 完成 ===" -ForegroundColor Green
Write-Host "已推送 $($allChanged.Count) 个文件到 GitHub"
