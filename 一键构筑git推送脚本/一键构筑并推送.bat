# ========================================
# Plain IDE 一键构筑 + Git 推送
# 双击运行：先编译打包，再增量推送
# ========================================

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n╔════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Plain IDE 一键构筑 + Git 推送   ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host "`n>> 第一步：编译打包" -ForegroundColor Yellow
& "$root\1-build.ps1"
if ($LASTEXITCODE -ne 0) { Write-Host "编译失败，停止" -ForegroundColor Red; pause; exit 1 }

Write-Host "`n>> 第二步：增量推送" -ForegroundColor Yellow
& "$root\2-push.ps1"
if ($LASTEXITCODE -ne 0) { Write-Host "推送失败" -ForegroundColor Red; pause; exit 1 }

Write-Host "`n✅ 全部完成！" -ForegroundColor Green
pause
