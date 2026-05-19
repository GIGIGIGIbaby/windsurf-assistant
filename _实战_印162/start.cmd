@echo off
chcp 65001 > nul
setlocal

rem ══════════════════════════════════════════════════════════════
rem  道·一气化三清 dashboard · 印 162 · 一笔起步
rem  「反者道之动也 · 大曰逝逝曰远远曰反」(帛书四十/二十五)
rem ══════════════════════════════════════════════════════════════

set "BASE=%~dp0"
set "PORT=3001"

echo.
echo ═══ 道·一气化三清 dashboard · 印 162 ═══
echo.

rem § 0 · 检反代基底 (印 161 留)
echo [§0] 检反代基底...
curl -s -o nul -w "  :7780 dao_proxy   http=%%{http_code}\n" http://127.0.0.1:7780/health -m 3
curl -s -o nul -w "  :7790 fleet_master http=%%{http_code}\n" http://127.0.0.1:7790/health -m 3
echo.

rem § 1 · 起 server :3001
echo [§1] 起 server :%PORT%...
cd /d "%BASE%"
start "" /B node server.js
timeout /t 2 /nobreak > nul

rem § 2 · 验
echo [§2] 验 /api/health...
curl -s http://127.0.0.1:%PORT%/api/health
echo.
echo.

rem § 3 · 开浏览器
echo [§3] 开 http://localhost:%PORT%
start "" http://localhost:%PORT%

echo.
echo ═══ 立 · 道·一气化三清 真活 ═══
echo   关此窗 server 仍跑 (Start-Process /B) · 关 node 用: taskkill /F /IM node.exe
echo.
endlocal
