$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Windsurf version
$pj = Get-Content 'E:\Windsurf\resources\app\product.json' -Raw | ConvertFrom-Json
Write-Host "version: $($pj.version)"
Write-Host "commit: $($pj.commit)"

# extension.js
$ej = 'E:\Windsurf\resources\app\extensions\windsurf\dist\extension.js'
$item = Get-Item $ej -EA SilentlyContinue
if ($item) {
    Write-Host "ext.size: $($item.Length)"
    Write-Host "ext.modified: $($item.LastWriteTime)"
    Write-Host "ext.hash: $((Get-FileHash $ej -Algorithm MD5).Hash)"
    $has8880 = Select-String $ej -Pattern 'return"http://127.0.0.1:8880"' -SimpleMatch -Quiet
    Write-Host "ext.patched: $has8880"
}

# All extension.js files
Write-Host "`nBACKUPS:"
Get-ChildItem 'E:\Windsurf\resources\app\extensions\windsurf\dist\extension.js*' | ForEach-Object {
    Write-Host "  $($_.Name)  $($_.Length)  $($_.LastWriteTime)"
}

# Scheduled tasks that might re-patch
Write-Host "`nSCHEDULED TASKS:"
$tasks = Get-ScheduledTask -EA SilentlyContinue | Where-Object {
    $_.TaskName -match 'dao|patch|windsurf|intercept|inject' -or
    ($_.Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments }) -match 'extension\.js|inject|intercept|patch.*windsurf'
}
if ($tasks) { $tasks | ForEach-Object { Write-Host "  $($_.TaskName): $($_.State)" } }
else { Write-Host "  NONE" }

# Startup registry
Write-Host "`nSTARTUP REG:"
$reg = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -EA SilentlyContinue
$reg.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
    Write-Host "  $($_.Name) = $($_.Value)"
}

# Windsurf extensions dir
Write-Host "`nWS EXTENSIONS:"
$extDir = "$env:USERPROFILE\.windsurf\extensions"
if (Test-Path $extDir) {
    Get-ChildItem $extDir -Directory | ForEach-Object { Write-Host "  $($_.Name)" }
} else { Write-Host "  NOT FOUND" }

# LS process
Write-Host "`nLS:"
$ls = Get-Process -Name 'language_server_windows_x64' -EA SilentlyContinue
if ($ls) {
    foreach ($p in $ls) {
        $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)" -EA SilentlyContinue).CommandLine
        if ($cmd -match '--api_server_url\s+(\S+)') { Write-Host "  PID=$($p.Id) -> $($Matches[1])" }
        else { Write-Host "  PID=$($p.Id)" }
    }
} else { Write-Host "  NOT RUNNING" }

# Windsurf process
Write-Host "`nWINDSURF:"
$ws = Get-Process -Name 'Windsurf' -EA SilentlyContinue
if ($ws) { Write-Host "  $($ws.Count) procs" } else { Write-Host "  NOT RUNNING" }
