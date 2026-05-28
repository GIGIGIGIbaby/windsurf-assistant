# Full Fix for 141 Desktop Windsurf - all issues
# Root cause: D:\Windsurf corrupted remnant + E:\Windsurf healthy but auth missing
param([string]$RemoteIP = '192.168.31.141')

$secretsFile = Join-Path $PSScriptRoot '..\secrets.env'
$secrets = @{}
Get-Content $secretsFile -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([^#=]+?)\s*=\s*(.+)$') {
        $secrets[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}
$user = $secrets['DESKTOP_USER']
$pass = $secrets['DESKTOP_PASSWORD']
$cred = New-Object PSCredential($user, (ConvertTo-SecureString $pass -AsPlainText -Force))

Write-Host "`n=== 141 Full Windsurf Repair ===" -ForegroundColor Cyan

$result = Invoke-Command -ComputerName $RemoteIP -Credential $cred -ScriptBlock {
    $out = @()
    $fixed = @()
    $errors = @()

    # ============================================================
    # Phase 1: Kill all Windsurf processes
    # ============================================================
    $out += "[Phase 1] Stop Windsurf processes"
    $procs = Get-Process -Name 'Windsurf' -ErrorAction SilentlyContinue
    if ($procs) {
        $procs | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep 3
        $remaining = Get-Process -Name 'Windsurf' -ErrorAction SilentlyContinue
        if ($remaining) { $remaining | Stop-Process -Force; Start-Sleep 2 }
        $fixed += "Killed $($procs.Count) Windsurf processes"
        $out += "  [FIX] Killed $($procs.Count) processes"
    } else {
        $out += "  [OK] No Windsurf processes running"
    }

    # ============================================================
    # Phase 2: Neutralize corrupted D:\Windsurf
    # ============================================================
    $out += "[Phase 2] Neutralize corrupted D:\Windsurf"
    $dWindsurf = 'D:\Windsurf'
    $dExe = 'D:\Windsurf\Windsurf.exe'
    if (Test-Path $dExe) {
        # Rename exe to prevent detection
        $backupName = 'D:\Windsurf\Windsurf.exe.broken_backup'
        try {
            Rename-Item $dExe $backupName -Force -ErrorAction Stop
            $fixed += "Renamed D:\Windsurf\Windsurf.exe -> .broken_backup"
            $out += "  [FIX] Renamed D:\Windsurf\Windsurf.exe -> .broken_backup"
        } catch {
            $out += "  [WARN] Could not rename D:\Windsurf.exe: $_"
        }
    } else {
        $out += "  [OK] D:\Windsurf\Windsurf.exe already absent"
    }

    # Clean D:\Windsurf slide PNGs (junk)
    $pngs = Get-ChildItem 'D:\Windsurf\*.png' -ErrorAction SilentlyContinue
    if ($pngs) {
        $pngs | Remove-Item -Force -ErrorAction SilentlyContinue
        $out += "  [FIX] Cleaned $($pngs.Count) stray PNG files from D:\Windsurf"
    }

    # ============================================================
    # Phase 3: Clean Windsurf caches (for E:\Windsurf)
    # ============================================================
    $out += "[Phase 3] Clean Windsurf caches"
    $wsData = "$env:APPDATA\Windsurf"
    $cleaned = 0
    foreach ($dir in @('Network','Cache','Code Cache','GPUCache','Service Worker','blob_storage','Session Storage','WebStorage','DawnGraphiteCache','DawnWebGPUCache','Shared Dictionary')) {
        $p = Join-Path $wsData $dir
        if (Test-Path $p) {
            Get-ChildItem $p -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
            Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
            $cleaned++
        }
    }
    if ($cleaned -gt 0) {
        $fixed += "Cleaned $cleaned cache directories"
        $out += "  [FIX] Cleaned $cleaned cache directories"
    } else {
        $out += "  [OK] Caches already clean"
    }

    # Also clean CachedData and CachedExtensionVSIXs
    foreach ($dir in @('CachedData','CachedExtensionVSIXs','CachedConfigurations','CachedProfilesData')) {
        $p = Join-Path $wsData $dir
        if (Test-Path $p) {
            Get-ChildItem $p -Force -Recurse -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
            Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
            $out += "  [FIX] Cleaned $dir"
        }
    }

    # Clean Crashpad
    $crashpad = Join-Path $wsData 'Crashpad'
    if (Test-Path $crashpad) {
        Get-ChildItem $crashpad -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        $out += "  [FIX] Cleaned Crashpad"
    }

    # Clean logs
    $logsDir = Join-Path $wsData 'logs'
    if (Test-Path $logsDir) {
        Get-ChildItem $logsDir -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        $out += "  [FIX] Cleaned logs"
    }

    # ============================================================
    # Phase 4: Fix settings.json
    # ============================================================
    $out += "[Phase 4] Fix settings.json"
    $settingsPath = Join-Path $wsData 'User\settings.json'
    $settingsDir = Split-Path $settingsPath
    if (-not (Test-Path $settingsDir)) {
        New-Item $settingsDir -ItemType Directory -Force | Out-Null
    }
    
    $settings = @{}
    if (Test-Path $settingsPath) {
        try {
            $existing = Get-Content $settingsPath -Raw | ConvertFrom-Json
            $existing.PSObject.Properties | ForEach-Object { $settings[$_.Name] = $_.Value }
        } catch {}
    }
    
    # Ensure critical settings
    $settings['http.proxySupport'] = 'off'
    $settings['http.proxy'] = ''
    $settings['http.proxyStrictSSL'] = $true
    $settings['explorer.confirmDragAndDrop'] = $false
    
    $settingsJson = $settings | ConvertTo-Json -Depth 10
    Set-Content $settingsPath -Value $settingsJson -Encoding UTF8 -Force
    $out += "  [FIX] Settings: proxySupport=off"

    # ============================================================
    # Phase 5: Clean auth residue (force re-login)
    # ============================================================
    $out += "[Phase 5] Clean auth residue"
    $codeiumDir = "$env:USERPROFILE\.codeium\windsurf"
    $authFiles = @(
        "$codeiumDir\user_settings.pb",
        "$wsData\SharedStorage",
        "$wsData\SharedStorage-wal",
        "$wsData\SharedStorage-journal",
        "$wsData\DIPS",
        "$wsData\DIPS-wal",
        "$wsData\DIPS-journal"
    )
    $authCleaned = 0
    foreach ($f in $authFiles) {
        if (Test-Path $f) {
            Remove-Item $f -Force -ErrorAction SilentlyContinue
            $authCleaned++
            $out += "  [FIX] Removed $(Split-Path $f -Leaf)"
        }
    }
    if ($authCleaned -eq 0) { $out += "  [OK] Auth files already clean" }

    # ============================================================
    # Phase 6: Hosts cleanup + DNS flush
    # ============================================================
    $out += "[Phase 6] Hosts + DNS"
    $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
    $hostsContent = Get-Content $hostsPath -ErrorAction SilentlyContinue
    $dirty = $hostsContent | Where-Object { $_ -match 'windsurf|codeium|exafunction' -and $_ -notmatch '^\s*#' }
    if ($dirty) {
        $clean = $hostsContent | Where-Object { $_ -notmatch 'windsurf|codeium|exafunction' -or $_ -match '^\s*#' }
        $clean | Set-Content $hostsPath -Encoding ASCII -Force
        $fixed += "Cleaned $($dirty.Count) hosts entries"
        $out += "  [FIX] Cleaned $($dirty.Count) hosts entries"
    } else {
        $out += "  [OK] Hosts clean"
    }
    ipconfig /flushdns 2>&1 | Out-Null
    $out += "  [FIX] DNS flushed"

    # ============================================================
    # Phase 7: Reset telemetry IDs in storage.json
    # ============================================================
    $out += "[Phase 7] Reset telemetry"
    $storageFile = "$wsData\User\globalStorage\storage.json"
    if (Test-Path $storageFile) {
        try {
            $storage = Get-Content $storageFile -Raw | ConvertFrom-Json
            $changed = $false
            
            # Generate new random IDs
            $newMachineId = -join ((0..63) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
            $newDeviceId = [guid]::NewGuid().ToString()
            
            if ($storage.'telemetry.machineId') {
                $storage.'telemetry.machineId' = $newMachineId
                $changed = $true
            }
            if ($storage.'telemetry.devDeviceId') {
                $storage.'telemetry.devDeviceId' = $newDeviceId
                $changed = $true
            }
            if ($storage.'telemetry.macMachineId') {
                $storage.'telemetry.macMachineId' = $newMachineId
                $changed = $true
            }
            
            if ($changed) {
                $storage | ConvertTo-Json -Depth 10 | Set-Content $storageFile -Encoding UTF8 -Force
                $fixed += "Reset telemetry IDs"
                $out += "  [FIX] Telemetry IDs reset (machineId=$($newMachineId.Substring(0,12))...)"
            } else {
                $out += "  [OK] No telemetry IDs to reset"
            }
        } catch {
            $out += "  [WARN] Could not parse storage.json: $_"
        }
    } else {
        $out += "  [WARN] storage.json not found"
    }

    # ============================================================
    # Phase 8: Verify E:\Windsurf integrity
    # ============================================================
    $out += "[Phase 8] Verify E:\Windsurf integrity"
    $eExe = 'E:\Windsurf\Windsurf.exe'
    $ePkg = 'E:\Windsurf\resources\app\package.json'
    $eExtDir = 'E:\Windsurf\resources\app\extensions'
    
    if (Test-Path $eExe) { $out += "  [OK] Windsurf.exe exists" }
    else { $errors += "E:\Windsurf\Windsurf.exe missing!"; $out += "  [ERROR] Windsurf.exe MISSING" }
    
    if (Test-Path $ePkg) {
        $pkg = Get-Content $ePkg -Raw | ConvertFrom-Json
        $out += "  [OK] Version: $($pkg.version)"
    } else { $errors += "package.json missing"; $out += "  [ERROR] package.json MISSING" }
    
    $extCount = (Get-ChildItem $eExtDir -Directory -ErrorAction SilentlyContinue).Count
    $out += "  [OK] Builtin extensions: $extCount"
    
    $userExtDir = "$env:USERPROFILE\.windsurf\extensions"
    $userExtCount = (Get-ChildItem $userExtDir -Directory -ErrorAction SilentlyContinue).Count
    $out += "  [OK] User extensions: $userExtCount"

    # ============================================================
    # Phase 9: Verify network connectivity
    # ============================================================
    $out += "[Phase 9] Network verification"
    foreach ($url in @('server.codeium.com','register.windsurf.com','marketplace.windsurf.com')) {
        try {
            $r = Invoke-WebRequest -Uri "https://$url" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
            $out += "  [OK] $url => $($r.StatusCode)"
        } catch {
            $msg = $_.Exception.Message
            if ($msg -match '404|403|405|301|302') {
                $out += "  [OK] $url => server responds"
            } else {
                $out += "  [WARN] $url => $msg"
            }
        }
    }

    # ============================================================
    # Phase 10: Verify autostart points to E:\Windsurf
    # ============================================================
    $out += "[Phase 10] Autostart verification"
    $regRun = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
    $wsRun = $regRun.PSObject.Properties | Where-Object { $_.Name -match 'Windsurf' }
    if ($wsRun) {
        $runValue = $wsRun.Value
        if ($runValue -match 'E:\\Windsurf') {
            $out += "  [OK] Autostart: $runValue"
        } elseif ($runValue -match 'D:\\Windsurf') {
            # Fix autostart to point to E:\Windsurf
            Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'Windsurf' -Value '"E:\Windsurf\Windsurf.exe"'
            $fixed += "Fixed autostart D: -> E:"
            $out += "  [FIX] Changed autostart from D: to E:\Windsurf"
        } else {
            $out += "  [INFO] Autostart: $runValue"
        }
    } else {
        $out += "  [WARN] No Windsurf autostart entry"
    }

    # ============================================================
    # Summary
    # ============================================================
    $out += ""
    $out += "=== REPAIR SUMMARY ==="
    $out += "Fixed: $($fixed.Count) items"
    foreach ($f in $fixed) { $out += "  + $f" }
    if ($errors.Count -gt 0) {
        $out += "Errors: $($errors.Count)"
        foreach ($e in $errors) { $out += "  ! $e" }
    }
    $out += ""
    $out += "NEXT: Start Windsurf (E:\Windsurf\Windsurf.exe) -> Sign In -> Ctrl+Shift+P -> Reload Window"

    $out -join "`n"
}

Write-Host $result
