<#
.SYNOPSIS
    诊断 Windsurf webview CSP sha256 失配问题
.DESCRIPTION
    检查 E:\Windsurf\resources\app\out\vs\workbench\contrib\webview\browser\pre\index.html
    1) 是否被 dao-fix patch
    2) CSP 声明的 sha256 是否与实际 inline script 匹配
    3) Service Worker JS 是否被 patch
    输出诊断报告，不修改任何文件。
.PARAMETER WindsurfRoot
    Windsurf 安装根目录，默认 E:\Windsurf
.EXAMPLE
    .\08_diagnose.ps1
    .\08_diagnose.ps1 -WindsurfRoot "C:\Program Files\Windsurf"
#>

[CmdletBinding()]
param(
    [string]$WindsurfRoot = "E:\Windsurf"
)

$ErrorActionPreference = 'Stop'

$idx = Join-Path $WindsurfRoot "resources\app\out\vs\workbench\contrib\webview\browser\pre\index.html"
$sw  = Join-Path $WindsurfRoot "resources\app\out\vs\workbench\contrib\webview\browser\pre\service-worker.js"

if (-not (Test-Path $idx)) {
    Write-Host "[ERROR] index.html not found at: $idx" -ForegroundColor Red
    Write-Host "        Check -WindsurfRoot parameter." -ForegroundColor Yellow
    exit 1
}

Write-Host "=== Windsurf WebView CSP Diagnose ===" -ForegroundColor Cyan
Write-Host "Target: $idx"
Write-Host ""

$content = Get-Content $idx -Raw

# === Test 1: dao-fix patch markers ===
$daoMarkers = ([regex]::Matches($content, "dao-fix\d?")).Count
$hasDaoMarker = $daoMarkers -gt 0
Write-Host "[T1] dao-fix markers in index.html : " -NoNewline
if ($hasDaoMarker) { Write-Host "$daoMarkers occurrences  (file PATCHED)" -ForegroundColor Yellow }
else { Write-Host "0  (original)" -ForegroundColor Green }

# === Test 2: CSP sha256 vs actual inline script hash ===
$cspMatch = [regex]::Match($content, "'sha256-([^']+)'")
$cspUsesUnsafeInline = $content -match "'unsafe-inline'"
$scriptMatch = [regex]::Match($content, '(?s)<script\s+async\s+type="module">(.+?)</script>')

if ($cspUsesUnsafeInline) {
    Write-Host "[T2] CSP mode                       : 'unsafe-inline' (already softened)" -ForegroundColor Green
    $cspOk = $true
} elseif (-not $cspMatch.Success) {
    Write-Host "[T2] CSP mode                       : NO sha256 / NO unsafe-inline (??)" -ForegroundColor Red
    $cspOk = $false
} elseif (-not $scriptMatch.Success) {
    Write-Host "[T2] CSP sha256 found but no inline module script matched (regex issue)" -ForegroundColor Yellow
    $cspOk = $null
} else {
    $cspHash = $cspMatch.Groups[1].Value
    $scriptBody = $scriptMatch.Groups[1].Value
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($scriptBody)
    $actualHash = [Convert]::ToBase64String(
        [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes))
    $match = ($cspHash -eq $actualHash)
    Write-Host "[T2] CSP declared sha256            : $cspHash"
    Write-Host "     Actual inline script sha256   : $actualHash"
    Write-Host "     Match                         : " -NoNewline
    if ($match) { Write-Host "YES" -ForegroundColor Green; $cspOk = $true }
    else { Write-Host "NO  (THIS IS THE BUG)" -ForegroundColor Red; $cspOk = $false }
}

# === Test 3: service-worker.js patch ===
if (Test-Path $sw) {
    $swContent = Get-Content $sw -Raw
    $swDaoMarkers = ([regex]::Matches($swContent, "dao-fix\d?")).Count
    Write-Host "[T3] dao-fix markers in service-worker.js : " -NoNewline
    if ($swDaoMarkers -gt 0) { Write-Host "$swDaoMarkers (PATCHED)" -ForegroundColor Yellow }
    else { Write-Host "0 (original)" -ForegroundColor Green }
} else {
    Write-Host "[T3] service-worker.js               : NOT FOUND" -ForegroundColor Red
}

# === Test 4: existing backups ===
$bakDir = Split-Path $idx -Parent
$backups = Get-ChildItem $bakDir -File | Where-Object { $_.Name -match '^index\.html\.bak' } | Sort-Object LastWriteTime -Descending
Write-Host "[T4] Available index.html backups   : $($backups.Count)"
foreach ($b in $backups | Select-Object -First 3) {
    Write-Host "     - $($b.Name) ($($b.Length)B, $($b.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')))"
}

# === Verdict ===
Write-Host ""
Write-Host "=== Verdict ===" -ForegroundColor Cyan
if ($cspOk -eq $true) {
    Write-Host "STATUS: HEALTHY -- webview should render correctly." -ForegroundColor Green
    Write-Host "Action: none."
    exit 0
} elseif ($cspOk -eq $false) {
    Write-Host "STATUS: DAMAGED -- CSP hash failure will cause webview blackout." -ForegroundColor Red
    Write-Host "Action: run .\08_apply.ps1 to fix."
    exit 2
} else {
    Write-Host "STATUS: UNKNOWN -- could not parse CSP/script. Manual review needed." -ForegroundColor Yellow
    exit 3
}
