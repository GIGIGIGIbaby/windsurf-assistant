# Start Windsurf on 141 - interactive session approach
$secretsFile = Join-Path $PSScriptRoot '..\secrets.env'
$secrets = @{}
Get-Content $secretsFile -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([^#=]+?)\s*=\s*(.+)$') {
        $secrets[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}
$cred = New-Object PSCredential($secrets['DESKTOP_USER'], (ConvertTo-SecureString $secrets['DESKTOP_PASSWORD'] -AsPlainText -Force))

Write-Host "Starting Windsurf on 141..." -ForegroundColor Cyan

# Check if there's an active interactive session first
$sessions = Invoke-Command -ComputerName 192.168.31.141 -Credential $cred -ScriptBlock {
    $out = @()
    
    # Check logged-in sessions
    $quser = quser 2>&1
    $out += "=== Sessions ==="
    $out += ($quser | Out-String)
    
    # Try multiple launch methods
    $exe = 'E:\Windsurf\Windsurf.exe'
    
    # Method 1: schtasks with /IT (interactive)
    $taskName = "LaunchWindsurf_$(Get-Random)"
    schtasks /Create /TN $taskName /TR "`"$exe`"" /SC ONCE /ST 00:00 /F /RL HIGHEST 2>&1 | Out-Null
    schtasks /Run /TN $taskName 2>&1 | Out-Null
    Start-Sleep 3
    schtasks /Delete /TN $taskName /F 2>&1 | Out-Null
    
    # Method 2: If schtasks doesn't work, try explorer shell
    Start-Sleep 2
    $procs = Get-Process -Name 'Windsurf' -ErrorAction SilentlyContinue
    if (-not $procs) {
        # Try via cmd /c start
        $bat = "$env:TEMP\_start_ws.bat"
        Set-Content $bat -Value "@start `"`" `"$exe`"" -Encoding ASCII -Force
        
        $taskName2 = "LaunchWS2_$(Get-Random)"
        schtasks /Create /TN $taskName2 /TR "cmd /c `"$bat`"" /SC ONCE /ST 00:00 /F /RL HIGHEST 2>&1 | Out-Null
        schtasks /Run /TN $taskName2 2>&1 | Out-Null
        Start-Sleep 5
        schtasks /Delete /TN $taskName2 /F 2>&1 | Out-Null
    }
    
    # Method 3: WMI process create (runs in user session if logged in)
    $procs = Get-Process -Name 'Windsurf' -ErrorAction SilentlyContinue
    if (-not $procs) {
        $out += "Trying WMI method..."
        ([wmiclass]"\\.\root\cimv2:Win32_Process").Create($exe) | Out-Null
        Start-Sleep 8
    }
    
    # Final check
    Start-Sleep 5
    $procs = Get-Process -Name 'Windsurf' -ErrorAction SilentlyContinue
    if ($procs) {
        $totalMB = [math]::Round(($procs | Measure-Object WorkingSet64 -Sum).Sum / 1MB)
        $out += "OK: $($procs.Count) processes, ${totalMB}MB"
    } else {
        $out += "STILL NO PROCESSES"
        # Check if exe even exists and runs
        $out += "Exe exists: $(Test-Path $exe)"
        $out += "Exe size: $((Get-Item $exe -ErrorAction SilentlyContinue).Length)"
        # Check debug.log
        $debugLog = 'E:\Windsurf\debug.log'
        if (Test-Path $debugLog) {
            $lastLines = Get-Content $debugLog -Tail 20 -ErrorAction SilentlyContinue
            $out += "=== debug.log (last 20 lines) ==="
            $out += ($lastLines -join "`n")
        }
        # Check event log for crash
        $crashes = Get-WinEvent -FilterHashtable @{LogName='Application'; Level=2; StartTime=(Get-Date).AddMinutes(-5)} -MaxEvents 5 -ErrorAction SilentlyContinue
        if ($crashes) {
            $out += "=== Recent App Errors ==="
            $crashes | ForEach-Object { $out += "  $($_.TimeCreated): $($_.Message.Substring(0, [math]::Min(200, $_.Message.Length)))" }
        }
    }
    
    $out -join "`n"
}

Write-Host $sessions
