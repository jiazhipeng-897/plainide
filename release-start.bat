@echo off
title My Code IDE Launcher
cd /d "%~dp0"

echo ========================================
echo   My Code IDE - One-click Launcher
echo   (auto-installs dependencies on first run)
echo ========================================
echo.

rem ---- 1. Check Node.js ----
node -v >nul 2>nul
if errorlevel 1 goto no_node

rem ---- 2. Find Python 3.11 ----
set "PY="
py -3.11 -c "import sys; print(sys.executable)" >nul 2>nul
if not errorlevel 1 goto py_launcher
if exist "D:\Program Files\Python311\python.exe" goto py_d
if exist "C:\Python311\python.exe" goto py_c
if exist "C:\Program Files\Python311\python.exe" goto py_cp
where python >nul 2>nul
if errorlevel 1 goto no_python
for /f "delims=" %%i in ('where python ^| findstr /v /i "WindowsApps"') do if not defined PY set "PY=%%i"
goto py_ok

:py_launcher
for /f "delims=" %%i in ('py -3.11 -c "import sys; print(sys.executable)"') do set "PY=%%i"
goto py_ok

:py_d
set "PY=D:\Program Files\Python311\python.exe"
goto py_ok

:py_c
set "PY=C:\Python311\python.exe"
goto py_ok

:py_cp
set "PY=C:\Program Files\Python311\python.exe"

:py_ok
if not defined PY goto no_python
"%PY%" -c "import sys; assert sys.version_info[:2]==(3,11), sys.version" >nul 2>nul
if errorlevel 1 goto bad_version
echo [1/3] Python found: %PY%

rem ---- 3. Python dependencies ----
echo.
echo [2/3] Checking Python dependencies...
"%PY%" -c "import fastapi, uvicorn, yaml, tree_sitter, debugpy" >nul 2>nul
if not errorlevel 1 goto py_deps_ok
echo   First run: installing Python dependencies (1-2 min)...
"%PY%" -m pip install -r python\requirements.txt
if errorlevel 1 goto pip_fail
:py_deps_ok
echo   Dependencies ready.

rem ---- 4. Frontend dependencies ----
echo.
echo [3/3] Checking frontend dependencies...
if not exist node_modules goto npm_install
if exist node_modules\@vitejs\plugin-vue\dist\index.mjs goto electron_check
:npm_install
echo   First run: installing frontend dependencies (Electron download may take a few minutes)...
call npm install --no-audit --no-fund
if errorlevel 1 goto npm_fail
:electron_check
if exist node_modules\electron\dist\electron.exe goto deps_ok
echo   Electron binary missing, downloading via mirror...
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
node node_modules\electron\install.js
if errorlevel 1 goto npm_fail
:deps_ok
echo   Dependencies ready.

rem ---- 5. Launch ----
echo.
echo ========================================
echo   Launching My Code IDE ...
echo ========================================
set NODE_ENV=development
set ELECTRON_OVERRIDE_DIST_PATH=%cd%\node_modules\electron\dist
call npx electron .
pause
exit /b 0

:no_node
echo.
echo [ERROR] Node.js not found. Please install Node.js 18 or later:
echo   https://nodejs.org/
echo Make sure "Add to PATH" is checked during install.
pause
exit /b 1

:no_python
echo.
echo [ERROR] Python not found. Please install Python 3.11:
echo   https://www.python.org/downloads/release/python-3119/
echo Make sure "Add python.exe to PATH" is checked during install.
pause
exit /b 1

:bad_version
echo.
echo [ERROR] Core module requires Python 3.11, but found:
"%PY%" --version
echo Please install Python 3.11: https://www.python.org/downloads/release/python-3119/
pause
exit /b 1

:pip_fail
echo.
echo [ERROR] Python dependency install failed. Check your network and retry.
pause
exit /b 1

:npm_fail
echo.
echo [ERROR] Frontend dependency install failed. Check your network and retry.
pause
exit /b 1
