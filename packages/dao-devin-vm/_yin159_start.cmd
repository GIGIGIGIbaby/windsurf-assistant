@echo off
REM ═══════════════════════════════════════════════════════════════════
REM 印 159 · 一笔起 · 一账号一虚拟机 · 本地轻管理 + 公网无感
REM
REM 主公诏 (2026-05-19):
REM   「彻底打通 · 一账号一虚拟机 · 同时反代 cascade + devin cloud 一百多个模型
REM    并公网反代传输 · 任意环境下无感使用 · 本地统一轻管理
REM    本地轻管理加虚拟机重反代一切」
REM
REM 此件起:
REM   1. dao_proxy.js  :7780  · LLM 重反代主体 (228 模 · 三协议)
REM   2. fleet_master.js :7790 · 本地轻管理 (调度 N VM · 兜底 :7780)
REM   3. cloudflared :7780 → 公网 URL A
REM   4. cloudflared :7790 → 公网 URL B (推荐)
REM ═══════════════════════════════════════════════════════════════════
setlocal
chcp 65001 >nul
set BASE=%~dp0
cd /d "%BASE%"

echo.
echo ═══ 印 159 · 一账号一虚拟机 · 一笔起 ═══
echo.

REM ─── 1) 重建 wam token 池 ───
echo [1/4] 重建 wam_token_pool.json (从 ~/.wam 全态)...
node "%BASE%_wam_pool_build.js" --show 2>nul | findstr /R /C:"件 token" /C:"active" /C:"backups"
if errorlevel 1 (
    echo   首次建池...
    node "%BASE%_wam_pool_build.js"
)
echo.

REM ─── 2) 检查 :7780 dao_proxy 是否已活 ───
echo [2/4] 检 :7780 dao_proxy (LLM 重反代)...
curl -sS -m 3 http://127.0.0.1:7780/health >nul 2>&1
if errorlevel 1 (
    echo   :7780 未活 · 启 dao_proxy.js ...
    start "" /b cmd /c "node ""%BASE%dao_proxy.js"" > ""%BASE%_logs\dao_proxy_159.log"" 2> ""%BASE%_logs\dao_proxy_159.err"""
    timeout /t 5 /nobreak >nul
) else (
    echo   ✓ :7780 已活
)
echo.

REM ─── 3) 检查 :7790 fleet_master 是否已活 ───
echo [3/4] 检 :7790 fleet_master (本地轻管理)...
curl -sS -m 3 http://127.0.0.1:7790/health >nul 2>&1
if errorlevel 1 (
    echo   :7790 未活 · 启 fleet_master.js ...
    start "" /b cmd /c "node ""%BASE%fleet_master.js"" > ""%BASE%_fleet_master.log"" 2> ""%BASE%_fleet_master.err"""
    timeout /t 4 /nobreak >nul
) else (
    echo   ✓ :7790 已活
)
echo.

REM ─── 4) 检查 cloudflared :7790 公网 URL ───
echo [4/4] 检 cloudflared :7790 (公网入)...
if exist "%BASE%_cf_7790.url" (
    set /p PUBURL=<"%BASE%_cf_7790.url"
    echo   ✓ 公网入 (现存): %PUBURL%
) else (
    echo   公网未起 · 启 cloudflared :7790 ...
    set CFEXE=C:\Users\Administrator\AppData\Roaming\npm\node_modules\cloudflared\bin\cloudflared.exe
    if exist "%CFEXE%" (
        start "" /b "%CFEXE%" tunnel --no-autoupdate --url http://127.0.0.1:7790 > "%BASE%_cf_7790.log" 2> "%BASE%_cf_7790.err"
        timeout /t 8 /nobreak >nul
        for /f "tokens=*" %%i in ('findstr /R /C:"https://.*trycloudflare.com" "%BASE%_cf_7790.err"') do (
            for /f "tokens=2 delims= " %%j in ("%%i") do (
                echo %%j > "%BASE%_cf_7790.url"
                echo   ✓ 公网入 (新建): %%j
            )
        )
    ) else (
        echo   ⚠ 缺 cloudflared.exe · 请装: npm i -g cloudflared
    )
)
echo.

echo ═══ 一笔起 毕 ═══
echo.
echo 本地:
echo   · :7780  dao_proxy   http://127.0.0.1:7780/
echo   · :7790  fleet_master http://127.0.0.1:7790/
echo   · :7790  dashboard   http://127.0.0.1:7790/dashboard
echo.
echo 公网入 (任设备无感):
if exist "%BASE%_cf_7790.url" (
    set /p PUBURL=<"%BASE%_cf_7790.url"
    echo   · 公网 :7790  %PUBURL%
)
echo.
echo 一笔验:
echo   curl http://127.0.0.1:7790/health
echo   curl http://127.0.0.1:7790/fleet/list
echo.
echo 起 N 件 VM (一账号一 VM):
echo   curl -X POST http://127.0.0.1:7790/fleet/spawn -d "{\"n\":2}"
echo   或 浏览器 http://127.0.0.1:7790/dashboard 一键
echo.
echo 「邻邦相望 · 鸡狗之声相闻 · 民至老死不相往来」 -- 帛书八十
echo.
endlocal
