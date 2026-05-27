#Requires -RunAsAdministrator
# Full Windsurf Repair for zhou1 user profile
# Targets: C:\Users\zhou1
$ErrorActionPreference = 'Continue'

$zhou1 = 'C:\Users\zhou1'
$wsData = "$zhou1\AppData\Roaming\Windsurf"
$codeium = "$zhou1\.codeium\windsurf"
$userExt = "$zhou1\.windsurf\extensions"

Write-Host "`n=== Phase 0: Kill zhou1 Windsurf processes ===" -ForegroundColor Cyan
# Only kill processes owned by zhou1 (or zhou which may be the same account)
$wsProcs = Get-Process -Name 'Windsurf' -IncludeUserName -ErrorAction SilentlyContinue | 
    Where-Object { $_.UserName -match 'zhou1' }
if ($wsProcs) {
    $wsProcs | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep 3
    Write-Host "  Killed $($wsProcs.Count) processes" -ForegroundColor Green
} else {
    Write-Host "  No zhou1 Windsurf processes running" -ForegroundColor Yellow
}

Write-Host "`n=== Phase 1: Fix CORRUPT settings.json ===" -ForegroundColor Cyan
$settingsPath = "$wsData\User\settings.json"
$settingsDir = Split-Path $settingsPath
if (-not (Test-Path $settingsDir)) {
    New-Item -Path $settingsDir -ItemType Directory -Force | Out-Null
}

# Reference: zhou user has a healthy settings.json, use similar but with proxy OFF for safety
$newSettings = @{
    'http.proxySupport' = 'off'
    'http.proxy' = ''
    'http.proxyStrictSSL' = $true
    'http.systemCertificates' = $true
    'git.decorations.enabled' = $false
    'git.autoFetch' = $false
    'terminal.integrated.defaultProfile.windows' = 'PowerShell'
    'terminal.integrated.shellIntegration.enabled' = $true
    'telemetry.telemetryLevel' = 'off'
}

# Backup old corrupt file
if (Test-Path $settingsPath) {
    $bak = "$settingsPath.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item $settingsPath $bak -Force
    Write-Host "  Backed up corrupt settings to $bak" -ForegroundColor Yellow
}

$newSettings | ConvertTo-Json -Depth 5 | Set-Content $settingsPath -Encoding UTF8 -Force
Write-Host "  settings.json FIXED (valid JSON, proxy OFF)" -ForegroundColor Green

Write-Host "`n=== Phase 2: Clean ALL caches ===" -ForegroundColor Cyan
$cacheDirs = @(
    'Cache', 'Code Cache', 'GPUCache', 'Network', 
    'Session Storage', 'blob_storage', 'Service Worker',
    'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
    'SharedStorage', 'DIPS', 'Local Storage'
)
foreach ($dir in $cacheDirs) {
    $p = Join-Path $wsData $dir
    if (Test-Path $p) {
        Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Cleaned: $dir" -ForegroundColor Green
    }
}
# Also clean cache files at root level
foreach ($f in @('SharedStorage-wal','DIPS-wal','Cookies','Cookies-journal','TransportSecurity','Preferences')) {
    $fp = Join-Path $wsData $f
    if (Test-Path $fp) {
        Remove-Item $fp -Force -ErrorAction SilentlyContinue
        Write-Host "  Removed: $f" -ForegroundColor Green
    }
}

Write-Host "`n=== Phase 3: Clean auth residue ===" -ForegroundColor Cyan
$authFiles = @(
    "$codeium\user_settings.pb",
    "$codeium\config.json"
)
foreach ($f in $authFiles) {
    if (Test-Path $f) {
        Remove-Item $f -Force -ErrorAction SilentlyContinue
        Write-Host "  Removed: $(Split-Path $f -Leaf)" -ForegroundColor Green
    }
}

Write-Host "`n=== Phase 4: Reset extension system ===" -ForegroundColor Cyan
# Clean the Roaming extensions state (not the .windsurf user extensions)
$extStateDir = "$wsData\extensions"
if (Test-Path $extStateDir) {
    Remove-Item $extStateDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Cleaned Roaming extensions state" -ForegroundColor Green
}

# Clean extension host state
$extGlobalStorage = "$wsData\User\globalStorage"
if (Test-Path $extGlobalStorage) {
    # Keep storage.json but clean extension-specific caches
    Get-ChildItem $extGlobalStorage -Directory -ErrorAction SilentlyContinue | 
        Where-Object { $_.Name -ne 'backupWorkspaces' } |
        ForEach-Object {
            Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  Cleaned extension storage: $($_.Name)" -ForegroundColor Green
        }
}

# Clean workspace storage (per-workspace caches)
$wsStorage = "$wsData\User\workspaceStorage"
if (Test-Path $wsStorage) {
    Remove-Item $wsStorage -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Cleaned workspace storage" -ForegroundColor Green
}

Write-Host "`n=== Phase 5: Reset telemetry IDs ===" -ForegroundColor Cyan
$storagePath = "$wsData\User\globalStorage\storage.json"
if (Test-Path $storagePath) {
    try {
        $storage = Get-Content $storagePath -Raw | ConvertFrom-Json
        # Generate new IDs
        $newMachineId = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
        $newMacMachineId = [guid]::NewGuid().ToString()
        $newDevDeviceId = [guid]::NewGuid().ToString()
        $newSqmId = '{' + [guid]::NewGuid().ToString().ToUpper() + '}'
        $newServiceMachineId = [guid]::NewGuid().ToString()
        
        $storage | Add-Member -NotePropertyName 'telemetry.machineId' -NotePropertyValue $newMachineId -Force
        $storage | Add-Member -NotePropertyName 'telemetry.macMachineId' -NotePropertyValue $newMacMachineId -Force
        $storage | Add-Member -NotePropertyName 'telemetry.devDeviceId' -NotePropertyValue $newDevDeviceId -Force
        $storage | Add-Member -NotePropertyName 'telemetry.sqmId' -NotePropertyValue $newSqmId -Force
        $storage | Add-Member -NotePropertyName 'storage.serviceMachineId' -NotePropertyValue $newServiceMachineId -Force
        
        $storage | ConvertTo-Json -Depth 10 | Set-Content $storagePath -Encoding UTF8 -Force
        Write-Host "  Telemetry IDs reset to new values" -ForegroundColor Green
    } catch {
        Write-Host "  Failed to reset telemetry: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "  storage.json not found, will be created on first launch" -ForegroundColor Yellow
}

Write-Host "`n=== Phase 6: Clean Crashpad ===" -ForegroundColor Cyan
$crashDir = "$wsData\Crashpad"
if (Test-Path $crashDir) {
    Remove-Item $crashDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Cleaned Crashpad" -ForegroundColor Green
}

Write-Host "`n=== Phase 7: Clean IndexedDB ===" -ForegroundColor Cyan  
$idbDir = "$wsData\IndexedDB"
if (Test-Path $idbDir) {
    Remove-Item $idbDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Cleaned IndexedDB" -ForegroundColor Green
}

Write-Host "`n=== Phase 8: Clean logs ===" -ForegroundColor Cyan
$logsDir = "$wsData\logs"
if (Test-Path $logsDir) {
    # Keep the structure but clean old logs
    Get-ChildItem $logsDir -Directory -ErrorAction SilentlyContinue | 
        Sort-Object Name -Descending | Select-Object -Skip 1 |
        ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
    Write-Host "  Cleaned old logs" -ForegroundColor Green
}

Write-Host "`n=== Phase 9: Flush DNS ===" -ForegroundColor Cyan
ipconfig /flushdns 2>&1 | Out-Null
Write-Host "  DNS flushed" -ForegroundColor Green

Write-Host "`n=== Phase 10: Verify network connectivity ===" -ForegroundColor Cyan
foreach ($url in @('server.codeium.com','register.windsurf.com','marketplace.windsurf.com')) {
    try {
        $r = Invoke-WebRequest -Uri "https://$url" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        Write-Host "  $url => $($r.StatusCode)" -ForegroundColor Green
    } catch {
        $msg = $_.Exception.Message
        if ($msg -match '404|403|405|301|302') { 
            Write-Host "  $url => server responds (redirected/denied, normal)" -ForegroundColor Green 
        } else { 
            Write-Host "  $url => $msg" -ForegroundColor Yellow 
        }
    }
}

Write-Host "`n=== Phase 11: Copy extensions from zhou (healthy profile) ===" -ForegroundColor Cyan
$zhouExt = 'C:\Users\zhou\.windsurf\extensions'
$zhou1Ext = "$zhou1\.windsurf\extensions"
if ((Test-Path $zhouExt) -and (Test-Path "$zhou1\.windsurf")) {
    $zhouExts = Get-ChildItem $zhouExt -Directory -ErrorAction SilentlyContinue
    $zhou1Exts = Get-ChildItem $zhou1Ext -Directory -ErrorAction SilentlyContinue
    $missing = $zhouExts | Where-Object { $_.Name -notin $zhou1Exts.Name }
    if ($missing) {
        foreach ($ext in $missing) {
            $dest = Join-Path $zhou1Ext $ext.Name
            try {
                Copy-Item $ext.FullName $dest -Recurse -Force -ErrorAction Stop
                Write-Host "  Copied: $($ext.Name)" -ForegroundColor Green
            } catch {
                Write-Host "  Failed to copy $($ext.Name): $_" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "  No missing extensions to copy" -ForegroundColor Yellow
    }
} else {
    Write-Host "  Cannot copy (zhou extensions or zhou1 .windsurf dir not found)" -ForegroundColor Yellow
}

Write-Host "`n=== Phase 12: Final verification ===" -ForegroundColor Cyan
# Check settings.json is valid JSON
try {
    $null = Get-Content $settingsPath -Raw | ConvertFrom-Json
    Write-Host "  settings.json: VALID JSON" -ForegroundColor Green
} catch {
    Write-Host "  settings.json: STILL INVALID!" -ForegroundColor Red
}

# Check extensions count
$finalExts = @(Get-ChildItem $zhou1Ext -Directory -ErrorAction SilentlyContinue)
Write-Host "  Extensions count: $($finalExts.Count)" -ForegroundColor $(if($finalExts.Count -ge 10){'Green'}else{'Yellow'})

# Check auth was cleaned
if (Test-Path "$codeium\user_settings.pb") {
    Write-Host "  Auth: still present (unexpected)" -ForegroundColor Yellow
} else {
    Write-Host "  Auth: cleaned (user must re-login)" -ForegroundColor Green
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  REPAIR COMPLETE" -ForegroundColor Green
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "  1. Start Windsurf in zhou1 session" -ForegroundColor White
Write-Host "  2. Sign in with your account" -ForegroundColor White
Write-Host "  3. Ctrl+Shift+P -> Developer: Reload Window" -ForegroundColor White
Write-Host "  4. If 'corrupt installation' warning appears, click Don't Show Again" -ForegroundColor White
Write-Host "========================================`n" -ForegroundColor Cyan
