$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=== CLASH DIAG ==="

# 1. Service details
Write-Host "`n[SERVICE]"
$svc = Get-WmiObject Win32_Service -Filter "Name='clash_verge_service'" -EA SilentlyContinue
if ($svc) {
    Write-Host "  Path: $($svc.PathName)"
    Write-Host "  StartMode: $($svc.StartMode)"
    Write-Host "  State: $($svc.State)"
}

# 2. Find Clash Verge / Nyanpasu
Write-Host "`n[INSTALLED APPS]"
$paths = @(
    "$env:LOCALAPPDATA\Clash Verge",
    "$env:LOCALAPPDATA\clash-verge",
    "$env:LOCALAPPDATA\Nyanpasu",
    "$env:ProgramFiles\Clash Verge",
    "D:\Clash Verge",
    "E:\Clash Verge"
)
foreach ($p in $paths) {
    if (Test-Path $p) { Write-Host "  FOUND: $p"; Get-ChildItem $p -Filter '*.exe' -EA SilentlyContinue | ForEach-Object { Write-Host "    $($_.Name) ($($_.Length) bytes)" } }
}

# Check registry for install path
$uninstall = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { $_.DisplayName -match 'Clash|Verge|Nyanpasu|mihomo' }
if ($uninstall) { $uninstall | ForEach-Object { Write-Host "  REG: $($_.DisplayName) @ $($_.InstallLocation)" } }

# 3. Find mihomo binary
Write-Host "`n[MIHOMO]"
$mihomoLoc = @(
    "$env:USERPROFILE\.config\mihomo",
    "$env:APPDATA\io.github.clash-verge-rev.clash-verge-rev",
    "$env:LOCALAPPDATA\clash-verge"
)
foreach ($m in $mihomoLoc) {
    if (Test-Path $m) {
        Write-Host "  DIR: $m"
        Get-ChildItem $m -Recurse -Filter 'mihomo*' -EA SilentlyContinue | Select-Object -First 5 | ForEach-Object { Write-Host "    $($_.FullName)" }
        Get-ChildItem $m -Recurse -Filter 'clash*' -EA SilentlyContinue | Select-Object -First 5 | ForEach-Object { Write-Host "    $($_.FullName)" }
        Get-ChildItem $m -Recurse -Filter 'config.yaml' -EA SilentlyContinue | Select-Object -First 3 | ForEach-Object { Write-Host "    $($_.FullName)" }
    }
}

# 4. Service binary check
Write-Host "`n[SERVICE BINARY]"
if ($svc) {
    $binPath = $svc.PathName -replace '"',''
    if (Test-Path $binPath) {
        Write-Host "  EXISTS: $binPath ($((Get-Item $binPath).Length) bytes)"
    } else {
        Write-Host "  MISSING: $binPath"
    }
}

# 5. Try start Clash Verge GUI
Write-Host "`n[GUI]"
$guiPaths = @(
    "$env:LOCALAPPDATA\Clash Verge\Clash Verge.exe",
    "$env:LOCALAPPDATA\clash-verge\Clash Verge.exe",
    "$env:ProgramFiles\Clash Verge\Clash Verge.exe"
)
foreach ($g in $guiPaths) {
    if (Test-Path $g) { Write-Host "  GUI FOUND: $g" }
}

# Also check desktop shortcuts
Write-Host "`n[SHORTCUTS]"
$desktop = [Environment]::GetFolderPath('Desktop')
Get-ChildItem $desktop -Filter '*.lnk' -EA SilentlyContinue | Where-Object { $_.Name -match 'Clash|Verge|Nyanpasu' } | ForEach-Object { Write-Host "  $($_.Name)" }
$startMenu = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
Get-ChildItem $startMenu -Recurse -Filter '*.lnk' -EA SilentlyContinue | Where-Object { $_.Name -match 'Clash|Verge|Nyanpasu' } | ForEach-Object { Write-Host "  $($_.FullName)" }

Write-Host "`n=== DONE ==="
