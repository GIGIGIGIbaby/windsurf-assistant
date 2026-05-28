<#
.SYNOPSIS
  Windsurf 二进制反代血印 · 本机多 user 之精治
.DESCRIPTION
  与 repair.ps1 (远端整机治) 之别：仅 kill 目标 user/session 之 Windsurf·不影响主公自己跑的·1:1 还原 ext.js·schtasks 在目标 session 起 Windsurf。
  适用：本机多 Windows 账号·部分账号 (如 zhou) 复现 :8878 反代血印之治。
.EXAMPLE
  # 本机·治 zhou 账号 (session id 自动嗅)
  .\repair_user.ps1 -User zhou
  # 指定 session id (若多 session 同 user 时)
  .\repair_user.ps1 -User zhou -SessionId 3
  # 指定 schtask name (若已有现成代起 task)
  .\repair_user.ps1 -User zhou -TaskName '\DaoZhouLaunch'
.NOTES
  - 治本之径与 06-zhou账号_本机复现录.md / 07-zhou治本验证_闭环全相.md 之过程一致
  - 须 Administrator 权 (kill 别 user 之 process / schtasks 改启用)
  - 治本前应先跑 diag.ps1 或本目下手察确认有 :8878 血印
#>

param(
    [Parameter(Mandatory)] [string]$User,
    [int]$SessionId = 0,
    [string]$TaskName = '\DaoZhouLaunch',
    [string]$ExtPath  = 'E:\Windsurf\resources\app\extensions\windsurf\dist\extension.js',
    [string]$BakPattern = 'extension.js.bak_predao_*',
    [int]$WaitSec = 60
)

$ErrorActionPreference = 'Stop'
$ts = (Get-Date).ToString('yyyyMMdd_HHmmss')

Write-Output '═══ Windsurf · 本机别 user 反代血印 · 精治 ═══'
Write-Output ('User=' + $User + '   SessionId=' + ($(if($SessionId -gt 0){$SessionId}else{'auto'})) + '   TaskName=' + $TaskName)
Write-Output ''

# ============================================================
# Pre-check · 文件 + bak
# ============================================================
if (-not (Test-Path -LiteralPath $ExtPath)) {
    Write-Output ('✗ extension.js 不存: ' + $ExtPath); return
}
$bakDir = Split-Path -LiteralPath $ExtPath
$bak = Get-ChildItem -LiteralPath $bakDir -Filter $BakPattern -EA SilentlyContinue |
       Sort-Object LastWriteTime | Select-Object -First 1
if (-not $bak) {
    Write-Output ('✗ 干净 bak 不存于 ' + $bakDir + ' 之 ' + $BakPattern + '·中止')
    return
}
Write-Output ('  干净 bak: ' + $bak.Name + '  ' + $bak.Length + 'B  ' + $bak.LastWriteTime)

# ============================================================
# Pre-check · 验现 ext.js 真有 :8878 血印
# ============================================================
$cur = [IO.File]::ReadAllText($ExtPath)
$has8878 = $cur.Contains('127.0.0.1:8878')
$curSize = (Get-Item -LiteralPath $ExtPath).Length
Write-Output ('  现 ext.js: ' + $curSize + 'B  含:8878=' + $has8878)
if (-not $has8878) {
    Write-Output '  无 :8878 血印·已是干净状·治本不需进行·中止'
    return
}

# ============================================================
# Auto-discover SessionId (若未给定)
# ============================================================
if ($SessionId -le 0) {
    $sids = (Get-Process -IncludeUserName -EA SilentlyContinue |
             Where-Object { $_.UserName -match "\\$User$" -and $_.Name -eq 'Windsurf' } |
             Select-Object -ExpandProperty SessionId -Unique)
    if ($sids -and $sids.Count -ge 1) {
        $SessionId = $sids[0]
        Write-Output ('  auto-discovered SessionId = ' + $SessionId)
    } else {
        Write-Output ('  user ' + $User + ' 当下无 Windsurf 进程·SessionId=auto·尝试用 quser 嗅')
        $qs = (quser 2>$null | Select-String -Pattern "^\s*$User\s") -replace '\s+',' '
        if ($qs) {
            $SessionId = ($qs -split ' ')[3] -as [int]
            Write-Output ('  quser 嗅得 SessionId = ' + $SessionId)
        } else {
            Write-Output ('  ! 无法定位 ' + $User + ' 之 SessionId·将不 kill·直走还原 (用户重启 Windsurf 即载新 ext.js)')
        }
    }
}

# ============================================================
# Step 1 · 仅 kill 目标 user/session 之 Windsurf+ls
# ============================================================
Write-Output ''
Write-Output '=== Step 1 · 仅 kill 目标 user/session 之 Windsurf+ls ==='
$targets = Get-Process -IncludeUserName -EA SilentlyContinue | Where-Object {
    ($_.Name -eq 'Windsurf' -or $_.Name -like 'language_server*') -and
    $_.UserName -match "\\$User$" -and
    ($SessionId -le 0 -or $_.SessionId -eq $SessionId)
}
Write-Output ('  目标进程: ' + $targets.Count)
foreach ($p in $targets) {
    try { Stop-Process -Id $p.Id -Force -EA Stop; Write-Output ('    killed PID=' + $p.Id + ' ' + $p.Name) }
    catch { Write-Output ('    fail PID=' + $p.Id + ' : ' + $_.Exception.Message) }
}
Start-Sleep -Seconds 4
$still = (Get-Process -IncludeUserName -EA SilentlyContinue | Where-Object {
    ($_.Name -eq 'Windsurf' -or $_.Name -like 'language_server*') -and
    $_.UserName -match "\\$User$" -and
    ($SessionId -le 0 -or $_.SessionId -eq $SessionId)
}).Count
Write-Output ('  关后残留: ' + $still + ' (期待 0)')

# ============================================================
# Step 2 · 备改前·还原 bak
# ============================================================
Write-Output ''
Write-Output '=== Step 2 · 备改前 + 1:1 还原 bak ==='
$keep = $ExtPath + '.bak_patched_' + $ts
Move-Item -LiteralPath $ExtPath -Destination $keep -Force
Write-Output ('  患 ext.js 改前 → ' + (Split-Path -Leaf $keep) + ' (留作病历)')
Copy-Item -LiteralPath $bak.FullName -Destination $ExtPath -Force
Write-Output ('  bak ' + $bak.Name + ' → ext.js')

$new = Get-Item -LiteralPath $ExtPath
$nc = [IO.File]::ReadAllText($ExtPath)
$ok = ($new.Length -eq $bak.Length) -and (-not $nc.Contains('127.0.0.1:8878')) -and $nc.Contains('server.codeium.com')
Write-Output ('  验:  size=' + $new.Length + 'B  :8878=' + $nc.Contains('127.0.0.1:8878') + '  codeium=' + $nc.Contains('server.codeium.com'))
if (-not $ok) {
    Write-Output '  ✗ 还原后验失·中止'; return
}
Write-Output '  ✓ 1:1 还原成'

# ============================================================
# Step 3 · 在目标 session 起 Windsurf
# ============================================================
Write-Output ''
Write-Output '=== Step 3 · schtasks 起 Windsurf 于目标 session ==='
$taskExist = $false
try {
    schtasks /query /tn $TaskName /fo csv 2>$null | Out-Null
    $taskExist = ($LASTEXITCODE -eq 0)
} catch { }

if ($taskExist) {
    Write-Output ('  task ' + $TaskName + ' 存·启用 + 起')
    schtasks /change /tn $TaskName /enable | Out-Null
    schtasks /run    /tn $TaskName | Out-Null
    Write-Output ('  起后 ' + $WaitSec + 's 等 + 验')
    Start-Sleep -Seconds $WaitSec
    schtasks /change /tn $TaskName /disable | Out-Null
    Write-Output ('  task 复 disabled (本然)')
} else {
    Write-Output ('  task ' + $TaskName + ' 不存·跳过自起·' + $User + ' 需手动重启 Windsurf 加载新 ext.js')
}

# ============================================================
# Step 4 · 验
# ============================================================
Write-Output ''
Write-Output '=== Step 4 · 终验 ==='
$nowProcs = Get-Process -IncludeUserName -EA SilentlyContinue | Where-Object {
    $_.Name -eq 'Windsurf' -and
    $_.UserName -match "\\$User$" -and
    ($SessionId -le 0 -or $_.SessionId -eq $SessionId)
}
Write-Output ('  user=' + $User + '·session=' + $SessionId + ' 之 Windsurf 进程: ' + $nowProcs.Count)

$logsRoot = "C:\Users\$User\AppData\Roaming\Windsurf\logs"
$latest = Get-ChildItem -LiteralPath $logsRoot -Directory -EA SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latest) {
    Write-Output ('  最新 logs: ' + $latest.Name + '  mtime=' + $latest.LastWriteTime)
    $wsLog = Join-Path $latest.FullName 'window1\exthost\codeium.windsurf\Windsurf.log'
    if (Test-Path -LiteralPath $wsLog) {
        $sz = (Get-Item -LiteralPath $wsLog).Length
        Write-Output ('  Windsurf.log size = ' + $sz + 'B  ' + ($(if($sz -gt 0){'(写入·活了)'}else{'(0B·尚未启或仍死)'})))
    }
}

$out8878 = (Get-NetTCPConnection -RemotePort 8878 -EA SilentlyContinue | Measure-Object).Count
Write-Output ('  outbound :8878 = ' + $out8878 + ($(if($out8878 -eq 0){'  ✓'}else{'  ✗'})))

Write-Output ''
Write-Output '═══ 治本毕 ═══'
Write-Output ('  患 ext.js 备: ' + $keep)
Write-Output ('  原 bak 留:    ' + $bak.FullName)
Write-Output ('  道·一动还原·万物自归')
