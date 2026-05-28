@echo off
chcp 65001 >nul
title 道藏采经 · 道法自然
echo.
echo   ══════════════════════════════════
echo   道藏采经引擎 · 一念启动
echo   道法自然 · 损之又损 · 无为而无不为
echo   ══════════════════════════════════
echo.

cd /d "%~dp0"

if "%1"=="" (
    node dao_acquire.js
) else (
    node dao_acquire.js %*
)

echo.
pause
