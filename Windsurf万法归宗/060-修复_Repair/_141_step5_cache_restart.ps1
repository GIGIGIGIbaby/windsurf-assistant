# Step 5: Clear V8 cache + restart Windsurf
$wsData = "$env:APPDATA\Windsurf"
$cleared = 0
foreach ($dir in @('CachedData','Code Cache','GPUCache','blob_storage','Cache','Network',
                   'Service Worker','DawnGraphiteCache','DawnWebGPUCache')) {
    $p = Join-Path $wsData $dir
    if (Test-Path $p) { Remove-Item $p -Recurse -Force -EA SilentlyContinue; $cleared++ }
}
Write-Host "Cleared $cleared cache dirs"

# Start Windsurf
$exe = 'E:\Windsurf\Windsurf.exe'
if (Test-Path $exe) {
    Start-Process $exe
    Write-Host "Windsurf started. Waiting 20s..."
    Start-Sleep 20
    $ls = Get-Process -Name 'language_server_windows_x64' -EA SilentlyContinue | Select-Object -First 1
    if ($ls) {
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($ls.Id)" -EA Stop).CommandLine
            if ($cmd -match '--api_server_url\s+(\S+)') {
                Write-Host "LS -> $($Matches[1])"
            } else {
                Write-Host "LS PID=$($ls.Id) running (url not in cmdline)"
            }
        } catch {
            Write-Host "LS PID=$($ls.Id) running (CIM timeout)"
        }
    } else {
        Write-Host "LS not started yet - Reload Window in Windsurf"
    }
} else {
    Write-Host "Windsurf.exe not found"
}
