@echo off
chcp 65001 >nul
title My Code IDE

echo ========================================
echo   启动 My Code IDE
echo ========================================
echo.

cd /d "%~dp0"

echo 启动 Electron (内部会自动拉起 Vite 与 Python 后端)...
set NODE_ENV=development
set ELECTRON_OVERRIDE_DIST_PATH=%cd%\node_modules\electron\dist
npx electron .

pause
