# Start Windsurf on 141 and verify
$secretsFile = Join-Path $PSScriptRoot '..\secrets.env'
$secrets = @{}
Get-Content $secretsFile -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([^#=]+?)\s*=\s*(.+)$') {
        $secrets[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}
$cred = New-Object PSCredential($secrets['DESKTOP_USER'], (ConvertTo-SecureString $secrets['DESKTOP_PASSWORD'] -AsPlainText -Force))

Write-Host "Starting Windsurf on 141..." -ForegroundColor Cyan

# Start Windsurf via scheduled task (WinRM session can't show GUI directly)
$result = Invoke-Command -ComputerName 192.168.31.141 -Credential $cred -ScriptBlock {
    # Method: use explorer.exe to launch (shows on desktop)
    $exe = 'E:\Windsurf\Windsurf.exe'
    
    # Create a temp VBS to launch with GUI
    $vbs = "$env:TEMP\_launch_windsurf.vbs"
    @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """$exe""", 1, False
"@ | Set-Content $vbs -Encoding ASCII -Force
    
    # Use schtasks for reliable GUI launch
    schtasks /Create /TN "LaunchWindsurf" /TR "wscript.exe `"$vbs`"" /SC ONCE /ST 00:00 /F 2>&1 | Out-Null
    schtasks /Run /TN "LaunchWindsurf" 2>&1 | Out-Null
    Start-Sleep 2
    schtasks /Delete /TN "LaunchWindsurf" /F 2>&1 | Out-Null
    
    Start-Sleep 10
    
    $procs = Get-Process -Name 'Windsurf' -ErrorAction SilentlyContinue
    if ($procs) {
        $totalMB = [math]::Round(($procs | Measure-Object WorkingSet64 -Sum).Sum / 1MB)
        $mainWin = ($procs | Where-Object { $_.MainWindowTitle }).Count
        "OK: $($procs.Count) processes, ${totalMB}MB RAM, $mainWin windows"
    } else {
        "FAIL: No Windsurf processes after 10s"
    }
}

Write-Host "Result: $result" -ForegroundColor $(if ($result -match '^OK') { 'Green' } else { 'Red' })
