@echo off
chcp 65001 >nul 2>&1
title Dao Canon Fetcher
echo.
echo   ==========================================
echo   Dao Canon Fetcher v3
echo   wu wei er wu bu wei
echo   ==========================================
echo.
cd /d "%~dp0"
if "%1"=="" (
    echo Fetching all pending texts...
    powershell -NoProfile -ExecutionPolicy Bypass -File "fetch-canon.ps1"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "fetch-canon.ps1" %*
)
echo.
pause
