@echo off
chcp 65001 >nul
title 印193·额度突破·dao_credit_force
cd /d "%~dp0"

set ACTION=%1
if "%ACTION%"=="" set ACTION=force

if "%ACTION%"=="force" (
  echo.
  echo ╔═══════════════════════════════════════════════════════════╗
  echo ║  印193 · 额度突破 · DELETE+重建automation · 触发批处理
  echo ║  策略: 删除旧automation → 创建4种新 → 触发 → 长轮询
  echo ╚═══════════════════════════════════════════════════════════╝
  echo.
  node dao_credit_force.js --pending --concurrency=6 --poll=120 --proxy=7890
  goto done
)

if "%ACTION%"=="force-all" (
  echo 全量强制处理 (包含已确认账号)...
  node dao_credit_force.js --all --concurrency=6 --poll=120 --proxy=7890
  goto done
)

if "%ACTION%"=="check" (
  echo.
  echo 快速扫描当前$200到账状态...
  node dao_credit_check.js --proxy=7890 --concurrency=15
  goto done
)

if "%ACTION%"=="status" (
  node dao_credit_force.js --status
  goto done
)

if "%ACTION%"=="single" (
  if "%2"=="" ( echo 用法: %~n0 single email:password & goto done )
  node dao_credit_force.js "--account=%2" --poll=300 --proxy=7890
  goto done
)

if "%ACTION%"=="verify" (
  echo 仅验证当前状态 (不触发任何操作)...
  node dao_credit_force.js --verify --pending --proxy=7890
  goto done
)

if "%ACTION%"=="delete-only" (
  echo 仅删除所有旧automation (不重建)...
  node dao_credit_force.js --pending --delete-only --proxy=7890
  goto done
)

echo.
echo 用法: %~n0 [force^|force-all^|check^|status^|single^|verify^|delete-only]
echo.
echo  force      → 对所有未确认账号: DELETE+重建automation+触发 (默认)
echo  force-all  → 对所有账号强制重跑
echo  check      → 快速扫描当前到账状态
echo  status     → 查看force结果统计
echo  single     → 处理单账号: single email:pass
echo  verify     → 仅验证不操作
echo  delete-only → 只删automation
echo.

:done
pause
