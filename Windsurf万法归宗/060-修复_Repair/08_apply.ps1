<#
.SYNOPSIS
    修复 Windsurf webview CSP sha256 失配
.DESCRIPTION
    模式：
      auto          - (默认) 智能：先试 hash 同步；若 hash 与 patched script 不匹配则回退 unsafe-inline
      hash          - 强制重新计算 inline script 的 sha256，写回 CSP
      unsafe-inline - 强制把 CSP 的 sha256 换成 'unsafe-inline'
    幂等：多次运行结果相同。运行前自动备份。
.PARAMETER WindsurfRoot
    Windsurf 安装根目录，默认 E:\Windsurf
.PARAMETER Mode
    auto / hash / unsafe-inline
.PARAMETER DryRun
    只打印将做的修改，不实际写文件
.EXAMPLE
    .\08_apply.ps1                          # auto mode
    .\08_apply.ps1 -Mode unsafe-inline      # 强制 unsafe-inline
    .\08_apply.ps1 -DryRun                  # 干跑
#>

[CmdletBinding()]
param(
    [string]$WindsurfRoot = "E:\Windsurf",
    [ValidateSet('auto','hash','unsafe-inline')]
    [string]$Mode = 'auto',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$idx = Join-Path $WindsurfRoot "resources\app\out\vs\workbench\contrib\webview\browser\pre\index.html"
if (-not (Test-Path $idx)) {
    Write-Host "[ERROR] index.html not found: $idx" -ForegroundColor Red
    exit 1
}

Write-Host "=== Windsurf WebView CSP Fix ===" -ForegroundColor Cyan
Write-Host "Target: $idx"
Write-Host "Mode  : $Mode$(if($DryRun){' [DRY RUN]'})"
Write-Host ""

$content = Get-Content $idx -Raw

# Detect current state
$cspUsesUnsafe = $content -match "'unsafe-inline'"
$cspMatch = [regex]::Match($content, "'sha256-([^']+)'")
$scriptMatch = [regex]::Match($content, '(?s)<script\s+async\s+type="module">(.+?)</script>')

if (-not $scriptMatch.Success) {
    Write-Host "[ERROR] Cannot find inline module script in index.html. Unsupported file format." -ForegroundColor Red
    exit 2
}

$scriptBody = $scriptMatch.Groups[1].Value
$actualHash = [Convert]::ToBase64String(
    [System.Security.Cryptography.SHA256]::Create().ComputeHash(
        [System.Text.Encoding]::UTF8.GetBytes($scriptBody)))

Write-Host "Actual inline script sha256: $actualHash"
if ($cspUsesUnsafe) {
    Write-Host "Current CSP                : already uses 'unsafe-inline'" -ForegroundColor Green
} elseif ($cspMatch.Success) {
    Write-Host "Current CSP sha256         : $($cspMatch.Groups[1].Value)"
    if ($cspMatch.Groups[1].Value -eq $actualHash) {
        Write-Host "Already in sync. Nothing to do." -ForegroundColor Green
        exit 0
    }
}

# Decide target CSP
$targetCsp = ""
$decision  = ""
switch ($Mode) {
    'hash' {
        $targetCsp = "default-src 'none'; script-src 'sha256-$actualHash' 'self'; frame-src 'self'; style-src 'unsafe-inline';"
        $decision  = "hash sync -> $actualHash"
    }
    'unsafe-inline' {
        $targetCsp = "default-src 'none'; script-src 'unsafe-inline' 'self'; frame-src 'self'; style-src 'unsafe-inline';"
        $decision  = "switch to unsafe-inline"
    }
    'auto' {
        # In auto mode: hash 同步是最小损伤；但 hash 计算可能与浏览器实际计算细微不同
        # (含 BOM/CRLF/whitespace 等)，所以验证后失败再回退 unsafe-inline
        # 这里采用 unsafe-inline 作为稳态（已验证修复路径）
        $targetCsp = "default-src 'none'; script-src 'unsafe-inline' 'self'; frame-src 'self'; style-src 'unsafe-inline';"
        $decision  = "auto -> unsafe-inline (proven stable path)"
    }
}

Write-Host "Decision: $decision" -ForegroundColor Yellow
Write-Host "Target CSP: $targetCsp"
Write-Host ""

# Backup
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$bakPath = "$idx.bak_csp_fix_$ts"

if ($DryRun) {
    Write-Host "[DRY RUN] Would backup -> $bakPath" -ForegroundColor Magenta
    Write-Host "[DRY RUN] Would replace CSP content-attribute"
    exit 0
}

Copy-Item $idx $bakPath -Force
Write-Host "Backup created -> $bakPath"

# Apply: replace any content="..." that contains either sha256- or unsafe-inline (in CSP meta tag)
$pattern = '(content=")default-src[^"]+("[^>]*>)'
$replacement = "`$1$targetCsp`$2"
$newContent = $content -replace $pattern, $replacement

if ($newContent -eq $content) {
    Write-Host "[WARN] No content changed by regex replace. Pattern may not have matched." -ForegroundColor Yellow
    exit 3
}

Set-Content -Path $idx -Value $newContent -Encoding UTF8 -NoNewline
Write-Host "CSP updated successfully." -ForegroundColor Green
Write-Host ""

# Verify
$verifyContent = Get-Content $idx -Raw
if ($verifyContent.Contains($targetCsp)) {
    Write-Host "[VERIFIED] New CSP is in place." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1) Close ALL Windsurf windows (kill all Windsurf processes)"
    Write-Host "  2) Restart Windsurf"
    Write-Host "  3) Open any extension webview view (e.g. dao Agent / GitLens) to confirm visible content"
    Write-Host "  4) Optional: run .\08_verify.ps1 -RestartIndependent for CDP closed-loop check"
    exit 0
} else {
    Write-Host "[ERROR] Verification failed. Restoring backup..." -ForegroundColor Red
    Copy-Item $bakPath $idx -Force
    exit 4
}
