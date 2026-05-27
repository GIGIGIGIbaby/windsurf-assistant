<#
.SYNOPSIS
    Windsurf Agent - Unified Remote Repair Hub v1.0
    
.DESCRIPTION
    Integrates: windsurf-repair + dual-pc-interconnect + agent-remote-repair
    Agent-native, local/remote dual-mode, machine-aware, secrets.env integrated
    
    Actions:
      status  - Process/auth/patch/connectivity full check
      fix     - Full repair (login fix + telemetry reset + patch + hosts)
      patch   - Continue bypass + rate limit bypass + workbench patch
      guard   - System security diagnostics + hosts guard
      deploy  - Push toolkit to remote machine
      remote  - Execute any Action on remote machine
    
    Every Action can run on remote via -Remote flag (WinRM)
    
.PARAMETER Action
    Action to perform: status, fix, patch, guard, deploy, remote

.PARAMETER Remote
    Execute on remote machine (auto-detect IP + credentials)

.PARAMETER Target
    Override remote IP (default: auto-detect peer)

.PARAMETER Json
    Output JSON format (for Agent parsing)

.PARAMETER Quiet
    Quiet mode (errors only)

.EXAMPLE
    .\windsurf-agent.ps1 status
    .\windsurf-agent.ps1 status -Remote
    .\windsurf-agent.ps1 fix
    .\windsurf-agent.ps1 fix -Remote
    .\windsurf-agent.ps1 patch
    .\windsurf-agent.ps1 guard
    .\windsurf-agent.ps1 deploy
    .\windsurf-agent.ps1 remote -ScriptBlock { hostname }
#>
param(
    [ValidateSet('status','fix','patch','guard','deploy','remote')]
    [string]$Action = 'status',
    [switch]$Remote,
    [string]$Target,
    [switch]$Json,
    [switch]$Quiet,
    [scriptblock]$ScriptBlock
)

$ErrorActionPreference = 'Continue'
$script:Report = [ordered]@{
    timestamp = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')
    hostname  = $env:COMPUTERNAME
    action    = $Action
    remote    = $Remote.IsPresent
    results   = @()
    errors    = @()
    fixed     = @()
}

# ============================================================
# Machine Detection (from drive_map_guard.ps1)
# ============================================================
function Get-MachineRole {
    $hn = $env:COMPUTERNAME.ToUpper()
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^192\.168\.' } | Select-Object -First 1).IPAddress
    if ($hn -match 'DESKTOP|141' -or $localIP -eq '192.168.31.141') {
        return @{ Role='desktop'; Hostname=$hn; LocalIP='192.168.31.141'; RemoteIP='192.168.31.179'; LocalName='Desktop-141'; RemoteName='Laptop-179' }
    } else {
        return @{ Role='laptop'; Hostname=$hn; LocalIP='192.168.31.179'; RemoteIP='192.168.31.141'; LocalName='Laptop-179'; RemoteName='Desktop-141' }
    }
}

# ============================================================
# Logging
# ============================================================
function Log($msg, $level) {
    if (-not $level) { $level = 'INFO' }
    $ts = Get-Date -Format 'HH:mm:ss'
    $entry = "[$ts][$level] $msg"
    $script:Report.results += $entry
    if ($level -eq 'ERROR') { $script:Report.errors += $msg }
    if ($level -eq 'FIX')   { $script:Report.fixed += $msg }
    if (-not $Quiet) {
        $color = switch ($level) { 'ERROR' {'Red'} 'WARN' {'Yellow'} 'FIX' {'Green'} 'OK' {'Green'} 'INFO' {'Cyan'} default {'White'} }
        Write-Host "  [$level] " -NoNewline -ForegroundColor $color
        Write-Host $msg -ForegroundColor White
    }
}

# ============================================================
# Secrets Loading
# ============================================================
function Load-Secrets {
    $paths = @(
        (Join-Path $PSScriptRoot 'secrets.env'),
        (Join-Path $PSScriptRoot '..\secrets.env'),
        (Join-Path $PSScriptRoot '..\3-servers\secrets.env')
    )
    # Add absolute paths
    foreach ($drive in @('E','D','C')) {
        $paths += "${drive}:\secrets.env"
        $paths += (Join-Path "${drive}:" '道\道生一\一生二\secrets.env')
    }
    $secrets = @{}
    foreach ($p in $paths) {
        if (Test-Path $p) {
            Get-Content $p -Encoding UTF8 -ErrorAction SilentlyContinue | ForEach-Object {
                if ($_ -match '^\s*([^#=]+?)\s*=\s*(.+)$') {
                    $k = $Matches[1].Trim(); $v = $Matches[2].Trim()
                    if (-not $secrets.ContainsKey($k) -or $v.Length -gt 0) { $secrets[$k] = $v }
                }
            }
            if ($secrets['DESKTOP_PASSWORD'] -and $secrets['LAPTOP_MAIN_PASSWORD']) { break }
        }
    }
    return $secrets
}

function Get-RemoteCredential {
    $me = Get-MachineRole
    $secrets = Load-Secrets
    $remoteIP = if ($Target) { $Target } else { $me.RemoteIP }
    $user = if ($me.Role -eq 'desktop') { $secrets['LAPTOP_MAIN_USER'] } else { $secrets['DESKTOP_USER'] }
    $pass = if ($me.Role -eq 'desktop') { $secrets['LAPTOP_MAIN_PASSWORD'] } else { $secrets['DESKTOP_PASSWORD'] }
    if (-not $user -or -not $pass) {
        Log "Remote credentials not found in secrets.env" 'ERROR'
        return $null
    }
    $secPass = ConvertTo-SecureString $pass -AsPlainText -Force
    return @{
        IP   = $remoteIP
        Cred = New-Object PSCredential($user, $secPass)
    }
}

# ============================================================
# Windsurf Path Detection
# ============================================================
function Find-WindsurfPaths {
    $exe = $null
    $data = "$env:APPDATA\Windsurf"
    $codeium = "$env:USERPROFILE\.codeium\windsurf"
    # E: first (primary), then others. Prefer installations with package.json (integrity check).
    $candidates = @('E:\Windsurf','D:\Windsurf',"$env:LOCALAPPDATA\Programs\Windsurf",'C:\Program Files\Windsurf')
    foreach ($p in $candidates) {
        if ((Test-Path "$p\Windsurf.exe") -and (Test-Path "$p\resources\app\package.json")) {
            $exe = "$p\Windsurf.exe"; break
        }
    }
    # Fallback: accept exe-only if no healthy install found
    if (-not $exe) {
        foreach ($p in $candidates) {
            if (Test-Path "$p\Windsurf.exe") { $exe = "$p\Windsurf.exe"; break }
        }
    }
    $resources = if ($exe) { Join-Path (Split-Path $exe) 'resources\app' } else { $null }
    return @{
        Exe       = $exe
        Data      = $data
        Codeium   = $codeium
        Resources = $resources
        Installed = ($null -ne $exe)
    }
}

# ============================================================
# ACTION: STATUS
# ============================================================
function Invoke-Status {
    Log "=== Windsurf Status ===" 'INFO'
    $me = Get-MachineRole
    Log "Machine: $($me.Hostname) ($($me.LocalIP)) [$($me.Role)]" 'INFO'
    
    $ws = Find-WindsurfPaths
    
    # 1. Installation
    if ($ws.Installed) { Log "Installed: $($ws.Exe)" 'OK' }
    else { Log "Windsurf NOT installed" 'ERROR'; return }
    
    # 2. Process
    $procs = Get-Process -Name 'Windsurf' -ErrorAction SilentlyContinue
    if ($procs) {
        $mainCount = ($procs | Where-Object { $_.MainWindowTitle }).Count
        $totalMB = [math]::Round(($procs | Measure-Object WorkingSet64 -Sum).Sum / 1MB)
        Log "Running: $($procs.Count) processes (${totalMB}MB), $mainCount windows" 'OK'
    } else {
        Log "Windsurf NOT running" 'WARN'
    }
    
    # 3. Auth
    $authFile = "$($ws.Codeium)\user_settings.pb"
    if (Test-Path $authFile) {
        $authSize = (Get-Item $authFile).Length
        $authAge = [math]::Round(((Get-Date) - (Get-Item $authFile).LastWriteTime).TotalHours, 1)
        Log "Auth: user_settings.pb (${authSize}B, ${authAge}h ago)" 'OK'
    } else {
        Log "Auth: user_settings.pb MISSING (not logged in)" 'WARN'
    }
    
    # 4. Telemetry IDs
    $storageFile = "$($ws.Data)\User\globalStorage\storage.json"
    if (Test-Path $storageFile) {
        try {
            $storage = Get-Content $storageFile -Raw | ConvertFrom-Json
            $machineId = $storage.'telemetry.machineId'
            if ($machineId) { Log "MachineId: $($machineId.Substring(0,12))..." 'INFO' }
        } catch { Log "Storage.json parse error" 'WARN' }
    }
    
    # 5. Patch status (check for known patch signatures)
    $extJs = Get-ChildItem "$($ws.Resources)\extensions\windsurf*\dist\extension.js" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($extJs) {
        $content = Get-Content $extJs.FullName -Raw -ErrorAction SilentlyContinue
        $maxGenPatched = $content -match 'maxGen.*9999|9999.*maxGen'
        Log "Patch P1-P3 (maxGen=9999): $(if($maxGenPatched){'APPLIED'}else{'not applied'})" $(if($maxGenPatched){'OK'}else{'INFO'})
    }
    
    $workbenchJs = Get-ChildItem "$($ws.Resources)\out\vs\workbench\workbench.desktop.main.js" -ErrorAction SilentlyContinue
    if ($workbenchJs) {
        $wbContent = Get-Content $workbenchJs.FullName -Raw -ErrorAction SilentlyContinue
        $rateLimitPatched = $wbContent -match '!1.*hasCapacity|hasCapacity.*!1'
        Log "Patch P6-P10 (rateLimit): $(if($rateLimitPatched){'APPLIED'}else{'not applied'})" $(if($rateLimitPatched){'OK'}else{'INFO'})
    }
    
    # 6. Network connectivity
    Log "--- Network ---" 'INFO'
    foreach ($url in @('server.codeium.com','register.windsurf.com')) {
        $result = Test-NetConnection $url -Port 443 -WarningAction SilentlyContinue -InformationLevel Quiet -ErrorAction SilentlyContinue
        Log "$url`:443 -> $(if($result){'OK'}else{'FAIL'})" $(if($result){'OK'}else{'ERROR'})
    }
    
    # 7. Hosts file check
    $hostsHijack = Get-Content "$env:SystemRoot\System32\drivers\etc\hosts" -ErrorAction SilentlyContinue | Where-Object { $_ -match 'windsurf|codeium|exafunction' -and $_ -notmatch '^\s*#' }
    if ($hostsHijack) {
        Log "HOSTS HIJACK: $($hostsHijack.Count) blocking entries!" 'ERROR'
    } else {
        Log "Hosts file: clean" 'OK'
    }
    
    # 8. System proxy
    $proxyEnabled = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue).ProxyEnable
    Log "System proxy: $(if($proxyEnabled -eq 0){'OFF (good)'}else{'ON (may interfere)'})" $(if($proxyEnabled -eq 0){'OK'}else{'WARN'})
    
    # 9. Disk space
    $wsExeDrive = if ($ws.Exe) { $ws.Exe.Substring(0,1) } else { 'C' }
    $vol = Get-Volume -DriveLetter $wsExeDrive -ErrorAction SilentlyContinue
    if ($vol) {
        $freeGB = [math]::Round($vol.SizeRemaining / 1GB, 1)
        Log "Disk $wsExeDrive`: ${freeGB}GB free" $(if($freeGB -gt 10){'OK'}else{'WARN'})
    }
}

# ============================================================
# ACTION: FIX (integrated from fix_windsurf_login.ps1 + telemetry_reset + patches)
# ============================================================
function Invoke-Fix {
    Log "=== Windsurf Full Repair ===" 'INFO'
    $ws = Find-WindsurfPaths
    if (-not $ws.Installed) { Log "Windsurf not installed" 'ERROR'; return }
    
    # Phase 1: Kill Windsurf
    Log "--- Phase 1: Stop Windsurf ---" 'INFO'
    $killed = @(Get-Process -Name 'Windsurf' -ErrorAction SilentlyContinue)
    if ($killed) {
        $killed | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep 3
        $remaining = Get-Process -Name 'Windsurf' -ErrorAction SilentlyContinue
        if ($remaining) { $remaining | Stop-Process -Force; Start-Sleep 2 }
        Log "Stopped $($killed.Count) Windsurf processes" 'FIX'
    } else { Log "Windsurf not running" 'OK' }
    
    # Phase 2: Clean caches (login fix)
    Log "--- Phase 2: Clean Caches ---" 'INFO'
    $wsData = $ws.Data
    foreach ($dir in @('Network','Cache','Code Cache','GPUCache','Service Worker','blob_storage','Session Storage')) {
        $p = Join-Path $wsData $dir
        if (Test-Path $p) {
            Get-ChildItem $p -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
            Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
            Log "Cleaned: $dir" 'FIX'
        }
    }
    
    # Phase 3: Fix settings.json
    Log "--- Phase 3: Fix Settings ---" 'INFO'
    $settingsPath = Join-Path $wsData 'User\settings.json'
    if (Test-Path $settingsPath) {
        $settings = Get-Content $settingsPath -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
        if (-not $settings) { $settings = [pscustomobject]@{} }
    } else {
        New-Item -Path (Split-Path $settingsPath) -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null
        $settings = [pscustomobject]@{}
    }
    $settings | Add-Member -NotePropertyName 'http.proxySupport' -NotePropertyValue 'off' -Force
    $settings | Add-Member -NotePropertyName 'http.proxy' -NotePropertyValue '' -Force
    $settings | Add-Member -NotePropertyName 'http.proxyStrictSSL' -NotePropertyValue $true -Force
    $settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath -Encoding UTF8
    Log "Settings: proxySupport=off" 'FIX'
    
    # Phase 4: Clean auth residue
    Log "--- Phase 4: Clean Auth Residue ---" 'INFO'
    foreach ($f in @("$($ws.Codeium)\user_settings.pb","$wsData\SharedStorage","$wsData\SharedStorage-wal","$wsData\DIPS","$wsData\DIPS-wal")) {
        if (Test-Path $f) {
            Remove-Item $f -Force -ErrorAction SilentlyContinue
            Log "Removed: $(Split-Path $f -Leaf)" 'FIX'
        }
    }
    
    # Phase 5: Hosts cleanup
    Log "--- Phase 5: Hosts Cleanup ---" 'INFO'
    $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
    $hostsContent = Get-Content $hostsPath -ErrorAction SilentlyContinue
    $dirty = $hostsContent | Where-Object { $_ -match 'windsurf|codeium|exafunction' -and $_ -notmatch '^\s*#' }
    if ($dirty) {
        $clean = $hostsContent | Where-Object { $_ -notmatch 'windsurf|codeium|exafunction' -or $_ -match '^\s*#' }
        $clean | Set-Content $hostsPath -Encoding ASCII -Force
        ipconfig /flushdns 2>&1 | Out-Null
        Log "Cleaned $($dirty.Count) hosts entries + flushed DNS" 'FIX'
    } else { Log "Hosts file clean" 'OK' }
    
    # Phase 6: Telemetry reset (Python, optional)
    Log "--- Phase 6: Telemetry Reset ---" 'INFO'
    $telemetryScript = Join-Path $PSScriptRoot 'telemetry_reset.py'
    if (Test-Path $telemetryScript) {
        $null = python $telemetryScript --cache 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0) { Log "Telemetry IDs reset" 'FIX' }
        else { Log "Telemetry reset failed (Python error)" 'WARN' }
    } else { Log "telemetry_reset.py not found, skip" 'WARN' }
    
    # Phase 7: Apply patches (Python, optional)
    Log "--- Phase 7: Apply Patches ---" 'INFO'
    Invoke-Patch
    
    # Phase 8: Connectivity check
    Log "--- Phase 8: Verify Connectivity ---" 'INFO'
    foreach ($url in @('server.codeium.com','register.windsurf.com','marketplace.windsurf.com')) {
        try {
            $r = Invoke-WebRequest -Uri "https://$url" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
            Log "$url => $($r.StatusCode)" 'OK'
        } catch {
            $msg = $_.Exception.Message
            if ($msg -match '404|403|405') { Log "$url => server responds" 'OK' }
            else { Log "$url => $msg" 'WARN' }
        }
    }
    
    Log "=== Repair Complete ===" 'OK'
    Log "Next: Start Windsurf -> Sign In -> Ctrl+Shift+P -> Reload Window" 'INFO'
}

# ============================================================
# ACTION: PATCH (Continue + RateLimit + Workbench)
# ============================================================
function Invoke-Patch {
    $scripts = @(
        @{ Name='Continue bypass'; File='patch_continue_bypass.py'; Args='' },
        @{ Name='Rate limit bypass'; File='patch_rate_limit_bypass.py'; Args='apply' },
        @{ Name='Workbench patch'; File='ws_repatch.py'; Args='' }
    )
    foreach ($s in $scripts) {
        $path = Join-Path $PSScriptRoot $s.File
        if (Test-Path $path) {
            $cmd = "python `"$path`" $($s.Args)"
            $null = Invoke-Expression $cmd 2>&1 | Out-String
            if ($LASTEXITCODE -eq 0) { Log "$($s.Name): applied" 'FIX' }
            else { Log "$($s.Name): failed (exit=$LASTEXITCODE)" 'WARN' }
        } else {
            Log "$($s.Name): $($s.File) not found" 'WARN'
        }
    }
}

# ============================================================
# ACTION: GUARD (System security diagnostics from desktop_guardian.ps1)
# ============================================================
function Invoke-Guard {
    Log "=== System Security Guard ===" 'INFO'
    $me = Get-MachineRole
    Log "Machine: $($me.Hostname) ($($me.LocalIP)) [$($me.Role)]" 'INFO'
    
    # Hosts guard
    $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
    $dirty = Get-Content $hostsPath -ErrorAction SilentlyContinue | Where-Object { $_ -match 'windsurf|codeium|exafunction' -and $_ -notmatch '^\s*#' }
    if ($dirty) {
        $clean = Get-Content $hostsPath -ErrorAction SilentlyContinue | Where-Object { $_ -notmatch 'windsurf|codeium|exafunction' -or $_ -match '^\s*#' }
        $clean | Set-Content $hostsPath -Encoding ASCII -Force
        ipconfig /flushdns 2>&1 | Out-Null
        Log "Cleaned $($dirty.Count) windsurf/codeium hosts entries" 'FIX'
    } else { Log "Hosts: clean" 'OK' }
    
    # Firewall
    $fwOff = @(Get-NetFirewallProfile | Where-Object { -not $_.Enabled }).Count
    $huorong = Get-Service HipsDaemon -ErrorAction SilentlyContinue
    if ($fwOff -gt 0) {
        if ($huorong -and $huorong.Status -eq 'Running') {
            Log "Windows Firewall OFF ($fwOff/3) - Huorong active" 'WARN'
        } else {
            Log "Windows Firewall OFF AND no alternative!" 'ERROR'
        }
    } else { Log "Windows Firewall: all profiles ON" 'OK' }
    
    # Windsurf firewall rules
    $fwRules = @(Get-NetFirewallRule | Where-Object { $_.DisplayName -match 'Windsurf' -and $_.Action -eq 'Allow' })
    Log "Windsurf firewall rules: $($fwRules.Count)" $(if($fwRules.Count -ge 2){'OK'}else{'WARN'})
    
    # Port 443 check (windsurf-LG or similar)
    $p443 = netstat -ano 2>$null | Select-String ':443\s.*LISTEN'
    if ($p443) { Log "Port 443 LISTENING (auth proxy active)" 'OK' }
    else { Log "Port 443 not listening" 'INFO' }
    
    # portproxy rules
    $pp = netsh interface portproxy show v4tov4 2>$null
    if ($pp -and $pp -match '\d+\.\d+\.\d+\.\d+') {
        Log "portproxy rules exist (may conflict)" 'WARN'
    } else { Log "portproxy: clean" 'OK' }
    
    # Process count + RAM
    $procStats = Get-Process | Measure-Object WorkingSet64 -Sum
    $procGB = [math]::Round($procStats.Sum / 1GB, 1)
    Log "Processes: $($procStats.Count) (${procGB}GB RAM)" $(if($procStats.Count -lt 400){'OK'}else{'WARN'})
    
    # C: disk
    $cVol = Get-Volume -DriveLetter C -ErrorAction SilentlyContinue
    if ($cVol) {
        $cFreeGB = [math]::Round($cVol.SizeRemaining / 1GB, 1)
        Log "C: ${cFreeGB}GB free" $(if($cFreeGB -gt 20){'OK'}else{'WARN'})
    }
    
    # SMB shares exposure
    $shares = @(Get-SmbShare | Where-Object { $_.Name -match 'Full' })
    if ($shares.Count -gt 0) {
        Log "SMB: $($shares.Count) full-disk shares active" 'WARN'
    }
    
    # WinRM status
    $winrm = Get-Service WinRM -ErrorAction SilentlyContinue
    Log "WinRM: $($winrm.Status)" $(if($winrm.Status -eq 'Running'){'OK'}else{'WARN'})
    
    # Remote connectivity
    $me = Get-MachineRole
    $ping = Test-Connection $me.RemoteIP -Count 1 -Quiet -ErrorAction SilentlyContinue
    Log "Ping $($me.RemoteName)($($me.RemoteIP)): $(if($ping){'OK'}else{'FAIL'})" $(if($ping){'OK'}else{'ERROR'})
    
    # Remote agent
    try {
        $health = Invoke-WebRequest -Uri "http://$($me.RemoteIP):9903/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Log "Remote agent: $($health.StatusCode)" 'OK'
    } catch {
        Log "Remote agent(:9903): unreachable" 'INFO'
    }
}

# ============================================================
# ACTION: DEPLOY (push toolkit to remote)
# ============================================================
function Invoke-Deploy {
    Log "=== Deploy Toolkit to Remote ===" 'INFO'
    $rc = Get-RemoteCredential
    if (-not $rc) { return }
    
    $me = Get-MachineRole
    Log "Deploying to $($me.RemoteName) ($($rc.IP))..." 'INFO'
    
    # Collect local files to push
    $toolkitDir = $PSScriptRoot
    $filesToDeploy = @(
        'windsurf-agent.ps1',
        'fix_windsurf_login.ps1',
        'telemetry_reset.py',
        'patch_continue_bypass.py',
        'patch_rate_limit_bypass.py',
        'ws_repatch.py',
        'credit_toolkit.py',
        'restore_windsurf.py',
        'zhenDuan.py'
    )
    
    $remoteDir = 'C:\Tools\WindsurfAgent'
    
    Invoke-Command -ComputerName $rc.IP -Credential $rc.Cred -ScriptBlock {
        param($dir)
        New-Item -Path $dir -ItemType Directory -Force | Out-Null
    } -ArgumentList $remoteDir -ErrorAction Stop
    
    foreach ($f in $filesToDeploy) {
        $localPath = Join-Path $toolkitDir $f
        if (Test-Path $localPath) {
            $content = Get-Content $localPath -Raw -Encoding UTF8
            Invoke-Command -ComputerName $rc.IP -Credential $rc.Cred -ScriptBlock {
                param($dir, $name, $data)
                Set-Content (Join-Path $dir $name) -Value $data -Encoding UTF8 -Force
            } -ArgumentList $remoteDir, $f, $content -ErrorAction SilentlyContinue
            Log "Deployed: $f" 'OK'
        }
    }
    
    # Also push secrets.env
    $secrets = Load-Secrets
    if ($secrets.Count -gt 0) {
        $secretsPath = $null
        foreach ($p in @(
            (Join-Path $PSScriptRoot 'secrets.env'),
            (Join-Path $PSScriptRoot '..\secrets.env'),
            (Join-Path 'E:' '道\道生一\一生二\secrets.env'),
            (Join-Path 'D:' '道\道生一\一生二\secrets.env')
        )) {
            if (Test-Path $p) { $secretsPath = $p; break }
        }
        if ($secretsPath) {
            $secretsContent = Get-Content $secretsPath -Raw -Encoding UTF8
            Invoke-Command -ComputerName $rc.IP -Credential $rc.Cred -ScriptBlock {
                param($dir, $data)
                Set-Content (Join-Path $dir 'secrets.env') -Value $data -Encoding UTF8 -Force
            } -ArgumentList $remoteDir, $secretsContent -ErrorAction SilentlyContinue
            Log "Deployed: secrets.env" 'OK'
        }
    }
    
    Log "Toolkit deployed to $remoteDir on $($me.RemoteName)" 'OK'
}

# ============================================================
# REMOTE EXECUTION WRAPPER
# ============================================================
function Invoke-Remote {
    param([string]$RemoteAction, [scriptblock]$CustomBlock)
    
    $rc = Get-RemoteCredential
    if (-not $rc) { return }
    
    $me = Get-MachineRole
    Log "=== Remote Execution on $($me.RemoteName) ($($rc.IP)) ===" 'INFO'
    
    if ($CustomBlock) {
        $result = Invoke-Command -ComputerName $rc.IP -Credential $rc.Cred -ScriptBlock $CustomBlock -ErrorAction Stop
        Log "Remote result: $result" 'OK'
        return $result
    }
    
    # Execute windsurf-agent.ps1 on remote
    $remoteScript = 'C:\Tools\WindsurfAgent\windsurf-agent.ps1'
    $result = Invoke-Command -ComputerName $rc.IP -Credential $rc.Cred -ScriptBlock {
        param($script, $act)
        if (Test-Path $script) {
            $out = powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '$script' -Action $act -Json" 2>&1
            $out -join "`n"
        } else {
            "ERROR: windsurf-agent.ps1 not found at $script. Run 'deploy' first."
        }
    } -ArgumentList $remoteScript, $RemoteAction -ErrorAction Stop
    
    if ($result) { Write-Host $result }
}

# ============================================================
# ENTRY POINT
# ============================================================
$me = Get-MachineRole
if (-not $Quiet) {
    Write-Host ""
    Write-Host "  Windsurf Agent v1.0 - $($me.LocalName)($($me.Hostname))" -ForegroundColor Cyan
    Write-Host "  Action: $Action$(if($Remote){' [REMOTE -> '+$me.RemoteName+']'})" -ForegroundColor Cyan
    Write-Host ""
}

if ($Remote) {
    if ($Action -eq 'deploy') {
        Invoke-Deploy
    } elseif ($Action -eq 'remote' -and $ScriptBlock) {
        Invoke-Remote -CustomBlock $ScriptBlock
    } else {
        # First ensure toolkit is deployed, then execute remotely
        $rc = Get-RemoteCredential
        if ($rc) {
            $remoteExists = Invoke-Command -ComputerName $rc.IP -Credential $rc.Cred -ScriptBlock {
                Test-Path 'C:\Tools\WindsurfAgent\windsurf-agent.ps1'
            } -ErrorAction SilentlyContinue
            if (-not $remoteExists) {
                Log "Toolkit not on remote, deploying first..." 'INFO'
                Invoke-Deploy
            }
            Invoke-Remote -RemoteAction $Action
        }
    }
} else {
    switch ($Action) {
        'status'  { Invoke-Status }
        'fix'     { Invoke-Fix }
        'patch'   { Invoke-Patch }
        'guard'   { Invoke-Guard }
        'deploy'  { Invoke-Deploy }
        'remote'  { 
            if ($ScriptBlock) { Invoke-Remote -CustomBlock $ScriptBlock }
            else { Log "Usage: -Action remote -ScriptBlock { ... }" 'ERROR' }
        }
    }
}

# Output JSON if requested
if ($Json) {
    $script:Report | ConvertTo-Json -Depth 5
}

# Return exit code
$exitCode = if ($script:Report.errors.Count -gt 0) { 1 } else { 0 }
exit $exitCode
