@echo off
REM ═══════════════════════════════════════════════════════════════════
REM 印 161 · 道·智能任务管家 · 一笔起
REM
REM 主公诏 (印 161 · 2026-05-19):
REM   「全链路闭环 · 测试 gpt5.5 + cloud4.7 · 开发具体项目验证所有模块」
REM
REM 起本管家:
REM   1. 检 dao_proxy :7780 (兜底 LLM 反代)
REM   2. 检 fleet_master :7790 (本地轻管理)
REM   3. 起 server.js :3000 (主公真用之件 · 0 deps · 内置 http 模块)
REM ═══════════════════════════════════════════════════════════════════
setlocal
chcp 65001 >nul
set BASE=%~dp0
cd /d "%BASE%"

echo.
echo ═══ 印 161 · 道·智能任务管家 · 一笔起 ═══
echo.

REM ─── 1) 检 :7780 ───
echo [1/3] 检 dao_proxy :7780 ...
curl -sS -m 3 http://127.0.0.1:7780/health >nul 2>&1
if errorlevel 1 (
    echo   ✗ :7780 未活 · 请先起: e:\道\道生一\一生二\Windsurf万法归宗\130-道独立体_Standalone\公网\packages\dao-devin-vm\dao_proxy.js
    echo   或: 用 node ../130-道独立体_Standalone/公网/packages/dao-devin-vm/dao_proxy.js
    goto :err
) else (
    echo   ✓ :7780 dao_proxy 真活
)

REM ─── 2) 检 :7790 ───
echo [2/3] 检 fleet_master :7790 ...
curl -sS -m 3 http://127.0.0.1:7790/health >nul 2>&1
if errorlevel 1 (
    echo   ⚠ :7790 未活 (任务管家可不依赖 :7790 · 直走 :7780 · 但失 LB 智能)
    set DAO_BASE=http://127.0.0.1:7780
) else (
    echo   ✓ :7790 fleet_master 真活
    set DAO_BASE=http://127.0.0.1:7790
)

REM ─── 3) 起 server :3000 ───
echo [3/3] 起 server.js :3000 ...
echo   DAO_BASE=%DAO_BASE%
echo.
echo ═══ 任务管家已就 · 浏览器开 http://localhost:3000 ═══
echo.

node server.js
goto :end

:err
echo.
echo 起失 · 请先起本源反代
exit /b 1

:end
endlocal
