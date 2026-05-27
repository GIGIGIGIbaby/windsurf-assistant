@echo off
chcp 65001 >nul 2>&1
title Windsurf 远程一键修复工具箱
color 0A

echo ╔══════════════════════════════════════════════════════╗
echo ║       Windsurf 远程一键修复工具箱 v1.0              ║
echo ║       道生一·一生二·二生三·三生万物                  ║
echo ╚══════════════════════════════════════════════════════╝
echo.

:menu
echo ┌──────────────────────────────────────────────────────┐
echo │  [1] 登录修复 — 清理缓存/代理/DNS/auth残留          │
echo │  [2] 设备指纹重置 — 重置遥测ID获新Trial             │
echo │  [3] Continue无限续接 — patch maxGen+AutoContinue    │
echo │  [4] 限流绕过 — patch Rate Limit门禁                │
echo │  [5] workbench补丁 — GBe静默+resetAt时间戳          │
echo │  [6] 积分监控 — 查看当前plan/credits状态            │
echo │  [7] 安装登录助手 — windsurf-login-helper.vsix      │
echo │  [8] 恢复原始文件 — 回滚所有patch                   │
echo │  [9] 全自动修复 — 依次执行1+2+3+4+5(推荐)          │
echo │  [D] 全面诊断 — 一键检查所有状态并输出报告          │
echo │  [0] 退出                                           │
echo └──────────────────────────────────────────────────────┘
echo.
set /p choice=请选择 [0-9/D]: 

if "%choice%"=="1" goto login_fix
if "%choice%"=="2" goto telemetry_reset
if "%choice%"=="3" goto continue_bypass
if "%choice%"=="4" goto rate_limit
if "%choice%"=="5" goto ws_repatch
if "%choice%"=="6" goto credit_monitor
if "%choice%"=="7" goto install_vsix
if "%choice%"=="8" goto restore
if "%choice%"=="9" goto full_auto
if "%choice%"=="D" goto diag
if "%choice%"=="d" goto diag
if "%choice%"=="0" exit /b 0
echo 无效选择，请重新输入
goto menu

:login_fix
echo.
echo ═══════════════════════════════════════════════════════
echo  [1/1] 执行登录修复...
echo ═══════════════════════════════════════════════════════
powershell -ExecutionPolicy Bypass -File "%~dp0fix_windsurf_login.ps1"
echo.
pause
goto menu

:telemetry_reset
echo.
echo ═══════════════════════════════════════════════════════
echo  [2] 设备指纹重置...
echo ═══════════════════════════════════════════════════════
python "%~dp0telemetry_reset.py" --cache
echo.
pause
goto menu

:continue_bypass
echo.
echo ═══════════════════════════════════════════════════════
echo  [3] Continue无限续接 patch...
echo ═══════════════════════════════════════════════════════
python "%~dp0patch_continue_bypass.py"
echo.
pause
goto menu

:rate_limit
echo.
echo ═══════════════════════════════════════════════════════
echo  [4] 限流绕过 patch...
echo ═══════════════════════════════════════════════════════
python "%~dp0patch_rate_limit_bypass.py" apply
echo.
pause
goto menu

:ws_repatch
echo.
echo ═══════════════════════════════════════════════════════
echo  [5] workbench补丁 (GBe静默+resetAt)...
echo ═══════════════════════════════════════════════════════
python "%~dp0ws_repatch.py"
echo.
pause
goto menu

:credit_monitor
echo.
echo ═══════════════════════════════════════════════════════
echo  [6] 积分状态查询...
echo ═══════════════════════════════════════════════════════
python "%~dp0credit_toolkit.py" monitor
echo.
pause
goto menu

:install_vsix
echo.
echo ═══════════════════════════════════════════════════════
echo  [7] 安装 windsurf-login-helper 扩展...
echo ═══════════════════════════════════════════════════════
echo 正在查找 Windsurf 安装路径...

:: 尝试多个常见安装路径
set "WS_EXE="
if exist "D:\Windsurf\Windsurf.exe" set "WS_EXE=D:\Windsurf\Windsurf.exe"
if exist "E:\Windsurf\Windsurf.exe" set "WS_EXE=E:\Windsurf\Windsurf.exe"
if exist "C:\Program Files\Windsurf\Windsurf.exe" set "WS_EXE=C:\Program Files\Windsurf\Windsurf.exe"
if exist "%LOCALAPPDATA%\Programs\Windsurf\Windsurf.exe" set "WS_EXE=%LOCALAPPDATA%\Programs\Windsurf\Windsurf.exe"

if "%WS_EXE%"=="" (
    echo [!] 未找到 Windsurf.exe，请手动执行:
    echo     windsurf --install-extension "%~dp0windsurf-login-helper-9.0.0.vsix" --force
) else (
    echo 找到: %WS_EXE%
    "%WS_EXE%" --install-extension "%~dp0windsurf-login-helper-9.0.0.vsix" --force
    echo [OK] 扩展已安装。重启 Windsurf 生效。
)
echo.
pause
goto menu

:restore
echo.
echo ═══════════════════════════════════════════════════════
echo  [8] 恢复原始文件...
echo ═══════════════════════════════════════════════════════
python "%~dp0restore_windsurf.py"
echo.
python "%~dp0patch_continue_bypass.py" --rollback
echo.
pause
goto menu

:diag
echo.
echo ═══════════════════════════════════════════════════════
echo  [D] 全面诊断...
echo ═══════════════════════════════════════════════════════
python "%~dp0诊断.py"
echo.
pause
goto menu

:full_auto
echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║            全自动修复模式 — 推荐                     ║
echo ╚══════════════════════════════════════════════════════╝
echo.

echo ▶ Step 1/5: 登录修复 (清理缓存+代理+DNS)...
echo ────────────────────────────────────────────
powershell -ExecutionPolicy Bypass -File "%~dp0fix_windsurf_login.ps1"
echo.

echo ▶ Step 2/5: 设备指纹重置...
echo ────────────────────────────────────────────
python "%~dp0telemetry_reset.py" --cache
echo.

echo ▶ Step 3/5: Continue无限续接 patch...
echo ────────────────────────────────────────────
python "%~dp0patch_continue_bypass.py"
echo.

echo ▶ Step 4/5: 限流绕过 patch...
echo ────────────────────────────────────────────
python "%~dp0patch_rate_limit_bypass.py" apply
echo.

echo ▶ Step 5/5: workbench补丁 (GBe静默)...
echo ────────────────────────────────────────────
python "%~dp0ws_repatch.py"
echo.

echo ╔══════════════════════════════════════════════════════╗
echo ║  全自动修复完成!                                     ║
echo ║                                                      ║
echo ║  下一步:                                             ║
echo ║    1. 启动 Windsurf                                  ║
echo ║    2. 点击左下角头像 → Sign In                       ║
echo ║    3. 在浏览器中完成登录                             ║
echo ║    4. Ctrl+Shift+P → Reload Window 激活patch         ║
echo ║                                                      ║
echo ║  如果仍然失败:                                       ║
echo ║    - 确保火绒/安全软件已将 Windsurf 加入信任区       ║
echo ║    - 或执行选项7安装登录助手扩展                     ║
echo ╚══════════════════════════════════════════════════════╝
echo.
pause
goto menu
