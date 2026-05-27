<#
.SYNOPSIS
  Windsurf 二进制反代血印 · 一键治本
.DESCRIPTION
  彻杀 Windsurf+language_server·备份当前被改 ext.js·1:1 还原 bak_predao·schtasks 主公 session 净启
.EXAMPLE
  # 本机
  .\repair.ps1
  # 远端
  Invoke-Command -ComputerName 192.168.31.179 -FilePath .\repair.ps1
.NOTES
  - 须主公本机 (192.168.31.179) 上跑·或 Invoke-Command 远调
  - User=zhouyoukang 之 RDP session 须存
  - 治本前先跑 diag.ps1 确认有 :8878 血印
#>

param(
    [string]$User = 'zhouyoukang',
    [int]$WaitSec = 90
)

$ErrorActionPreference = 'Stop'

$ts = (Get-Date).ToString('yyyyMMdd_HHmmss')
$extJs = 'E:\Windsurf\resources\app\extensions\windsurf\dist\extension.js'
$bak = 'E:\Windsurf\resources\app\extensions\windsurf\dist\extension.js.bak_predao_1778654701851'

Write-Output '═══ Windsurf 二进制反代血印 · 治本 ═══'
Write-Output ''

# ============================================================
# Pre-check
# ============================================================
if (-not (Test-Path $extJs)) {
    Write-Output ('✗ extension.js 不存: ' + $extJs)
    return
}
if (-not (Test-Path $bak)) {
    Write-Output ('✗ bak_predao 不存: ' + $bak)
    Write-Output '  此机或非主公电脑·或 bak 件被删·治本中止'
    return
}

# ============================================================
# Step 1 · 彻杀全 (含 ghost)
# ============================================================
Write-Output '=== Step 1 · 彻杀全 Windsurf + language_server ==='
$before = Get-Process -Name Windsurf, language_server* -EA SilentlyContinue
Write-Output ('  关前: ' + $before.Count + ' 进程')
$before | ForEach-Object { try { Stop-Process -Id $_.Id -Force -EA Stop } catch {} }
Start-Sleep 4

# 二次硬杀残 ghost
$stragglers = Get-Process -Name Windsurf, language_server* -EA SilentlyContinue
if ($stragglers) {
    Write-Output ('  ⚠ 残 ' + $stragglers.Count + ' · 二次硬杀')
    $stragglers | ForEach-Object { try { Stop-Process -Id $_.Id -Force -EA Stop } catch {} }
    Start-Sleep 3
}
$after = (Get-Process -Name Windsurf, language_server* -EA SilentlyContinue | Measure-Object).Count
Write-Output ('  关后: ' + $after + ' 进程')
if ($after -gt 0) {
    Write-Output '  ✗ 仍残·治本中止·须排查 ghost'
    return
}

# ============================================================
# Step 2 · 备份当前被改 ext.js (回滚保险)
# ============================================================
Write-Output ''
Write-Output '=== Step 2 · 备份当前被改 ext.js ==='
$bakCur = $extJs + '.bak_8878hack_' + $ts
try {
    Copy-Item $extJs $bakCur -Force
    Write-Output ('  ✓ 备 → ' + $bakCur)
} catch {
    Write-Output ('  ✗ 备失: ' + $_.Exception.Message)
    return
}

# ============================================================
# Step 3 · 1:1 还原 bak_predao
# ============================================================
Write-Output ''
Write-Output '=== Step 3 · 1:1 还原 bak_predao → extension.js ==='
try {
    Copy-Item $bak $extJs -Force
    $newInfo = Get-Item $extJs
    Write-Output ('  ✓ 还原 size=' + $newInfo.Length + ' mtime=' + $newInfo.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))
} catch {
    Write-Output ('  ✗ 还原失: ' + $_.Exception.Message)
    return
}

# ============================================================
# Step 4 · 验新 ext.js
# ============================================================
Write-Output ''
Write-Output '=== Step 4 · 验 · 新 ext.js 真无 :8878 ==='
$newRaw = Get-Content $extJs -Raw
if ($newRaw.IndexOf('127.0.0.1:8878') -ge 0) {
    Write-Output '  ⚠ 仍含 :8878 · bak 也被污染过·须深查'
    return
}
Write-Output '  ✓ 真无 :8878'
if ($newRaw.IndexOf('server.codeium.com') -ge 0) {
    Write-Output '  ✓ 真含 server.codeium.com (官方真 URL)'
}

# ============================================================
# Step 5 · schtasks 主公 session 净启
# ============================================================
Write-Output ''
Write-Output '=== Step 5 · schtasks 主公 session 净启 Windsurf ==='
$tn = 'WSReviveRestored'
schtasks /Delete /TN $tn /F 2>$null | Out-Null
$ft = (Get-Date).AddSeconds(20).ToString('HH:mm')
$createOut = schtasks /Create /TN $tn /TR '"E:\Windsurf\Windsurf.exe"' /SC ONCE /ST $ft /RU $User /IT /F 2>&1
Write-Output ('  Create: ' + $createOut)
$runOut = schtasks /Run /TN $tn 2>&1
Write-Output ('  Run:    ' + $runOut)

# ============================================================
# Step 6 · 等启完
# ============================================================
Write-Output ''
Write-Output ('=== Step 6 · 等 ' + $WaitSec + 's · WAM 自注 + ACP fetch + LS 启 ===')
Start-Sleep $WaitSec

$w = (Get-Process -Name Windsurf -EA SilentlyContinue | Measure-Object).Count
$l = (Get-Process -Name language_server* -EA SilentlyContinue | Measure-Object).Count
Write-Output ('  最终: Windsurf=' + $w + ' language_server=' + $l)

schtasks /Delete /TN $tn /F 2>$null | Out-Null

# ============================================================
# Step 7 · 后验 (跑 verify.ps1 之核心)
# ============================================================
Write-Output ''
Write-Output '=== Step 7 · 后验 ==='
$logDir = 'C:\Users\zhouyoukang\AppData\Roaming\Windsurf\logs'
if (Test-Path $logDir) {
    $newDir = Get-ChildItem $logDir -Directory -EA SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Write-Output ('  最新 log dir: ' + $newDir.Name)
    
    $acp = "$($newDir.FullName)\window1\exthost\codeium.windsurf\Windsurf ACP.log"
    if (Test-Path $acp) {
        $acpRaw = Get-Content $acp -Raw -EA SilentlyContinue
        if ($acpRaw -match '8878') {
            Write-Output '  ⚠ ACP.log 仍含 8878 · 治本未成'
        } else {
            Write-Output '  ★★★ ACP.log 真无 8878 · 治本成 ★★★'
        }
        $hasDevinCloud = $acpRaw -match 'Registering agent "devin-cloud"'
        if ($hasDevinCloud) {
            Write-Output '  ✓ devin-cloud agent 真注 · Cascade chat 真路打通'
        }
    }
}

Write-Output ''
Write-Output '═══ 治本完成 · 主公 RDP 内输 chat 验最终 ═══'