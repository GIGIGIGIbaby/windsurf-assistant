@echo off
REM tests/run_all.cmd · 印 131 · 中文路径友好 wrapper · 道法自然
REM   帛书廿二: 圣人执一 · 以为天下牧
REM   Node v24 + Windows + 中文路径 + Junction: realpathSync → ENOENT
REM   双旗经 NODE_OPTIONS 透父→子→孙 · 一旗到底
REM
REM 用:
REM   cd 公网
REM   tests\run_all.cmd
chcp 65001 >nul 2>&1
setlocal
if not defined NODE_OPTIONS (
  set "NODE_OPTIONS=--preserve-symlinks --preserve-symlinks-main"
) else (
  echo %NODE_OPTIONS% | findstr /C:"--preserve-symlinks-main" >nul || set "NODE_OPTIONS=%NODE_OPTIONS% --preserve-symlinks-main"
  echo %NODE_OPTIONS% | findstr /C:"--preserve-symlinks " >nul || echo %NODE_OPTIONS% | findstr /E /C:"--preserve-symlinks" >nul || set "NODE_OPTIONS=%NODE_OPTIONS% --preserve-symlinks"
)
node "%~dp0run_all.cjs" %*
exit /b %ERRORLEVEL%
