@echo off
chcp 65001 > nul
REM setup-vsix-only.cmd · 道法自然 · 双击启动器
REM 不装 Windsurf, 仅 VS Code + 030 (Cascade 自含) + 040 (LAN 反代)

cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\setup-vsix-only.ps1" %*
pause
