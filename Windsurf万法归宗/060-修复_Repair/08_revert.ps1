<#
.SYNOPSIS
    从最近的 .bak 备份回滚 index.html
.DESCRIPTION
    自动选择最新的 *.bak_csp_fix_* 备份恢复。
    可用 -BackupName 指定特定备份。
.PARAMETER WindsurfRoot
    Windsurf 安装根目录，默认 E:\Windsurf
.PARAMETER BackupName
    指定备份文件名（仅文件名，不含路径）。默认取最新的 csp_fix 备份。
.PARAMETER ListOnly
    只列出可用备份，不实际回滚。
.EXAMPLE
    .\08_revert.ps1                 # 回滚到最新的 csp_fix 备份
    .\08_revert.ps1 -ListOnly       # 列出所有备份
    .\08_revert.ps1 -BackupName "index.html.bak_csp_fix_20260527_023550"
#>

[CmdletBinding()]
param(
    [string]$WindsurfRoot = "E:\Windsurf",
    [string]$BackupName = "",
    [switch]$ListOnly
)

$ErrorActionPreference = 'Stop'

$idx = Join-Path $WindsurfRoot "resources\app\out\vs\workbench\contrib\webview\browser\pre\index.html"
$bakDir = Split-Path $idx -Parent

Write-Host "=== Windsurf WebView CSP Revert ===" -ForegroundColor Cyan
Write-Host "Target dir: $bakDir"
Write-Host ""

$allBackups = Get-ChildItem $bakDir -File |
    Where-Object { $_.Name -match '^index\.html\.bak' } |
    Sort-Object LastWriteTime -Descending

if ($allBackups.Count -eq 0) {
    Write-Host "[INFO] No backups found." -ForegroundColor Yellow
    exit 0
}

Write-Host "Available backups ($($allBackups.Count)):"
$i = 0
foreach ($b in $allBackups) {
    $i++
    $marker = if ($b.Name -match 'csp_fix') { " *" } else { "" }
    Write-Host ("  {0,2}. {1} ({2}B, {3}){4}" -f $i, $b.Name, $b.Length, $b.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'), $marker)
}
Write-Host "  (* = created by 08_apply.ps1)"
Write-Host ""

if ($ListOnly) { exit 0 }

# Pick target
if ($BackupName) {
    $target = $allBackups | Where-Object { $_.Name -eq $BackupName } | Select-Object -First 1
    if (-not $target) {
        Write-Host "[ERROR] Backup '$BackupName' not found." -ForegroundColor Red
        exit 1
    }
} else {
    $target = $allBackups | Where-Object { $_.Name -match 'csp_fix' } | Select-Object -First 1
    if (-not $target) {
        Write-Host "[WARN] No csp_fix backup found; falling back to most recent backup." -ForegroundColor Yellow
        $target = $allBackups[0]
    }
}

Write-Host "Will restore: $($target.Name)" -ForegroundColor Yellow

# Save current state as "before-revert" backup so revert is also reversible
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$preRevertBak = "$idx.bak_before_revert_$ts"
Copy-Item $idx $preRevertBak -Force
Write-Host "Current state saved as: $($preRevertBak | Split-Path -Leaf)"

# Restore
Copy-Item $target.FullName $idx -Force
Write-Host "[OK] Restored." -ForegroundColor Green
Write-Host ""
Write-Host "Next: restart Windsurf for change to take effect."
