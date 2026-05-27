$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=== NETWORK DIAG ==="

# 1. All clash-like processes
Write-Host "`n[PROCESSES]"
$procs = Get-Process -EA SilentlyContinue | Where-Object { $_.Name -match 'clash|mihomo|verge|sing-box|tun2socks|hysteria|xray|v2ray|trojan' }
if ($procs) { $procs | ForEach-Object { Write-Host "  $($_.Name) PID=$($_.Id)" } }
else { Write-Host "  No proxy processes found" }

# 2. Network adapters (TUN)
Write-Host "`n[TUN ADAPTERS]"
Get-NetAdapter -EA SilentlyContinue | Where-Object { $_.InterfaceDescription -match 'Wintun|WireGuard|TAP|TUN|Clash|mihomo' -or $_.Name -match 'Clash|mihomo|tun' } | ForEach-Object {
    Write-Host "  $($_.Name): $($_.Status) ($($_.InterfaceDescription))"
}

# 3. DNS config
Write-Host "`n[DNS CONFIG]"
$dns = Get-DnsClientServerAddress -AddressFamily IPv4 -EA SilentlyContinue | Where-Object { $_.ServerAddresses.Count -gt 0 } | Select-Object InterfaceAlias, ServerAddresses -First 5
foreach ($d in $dns) { Write-Host "  $($d.InterfaceAlias): $($d.ServerAddresses -join ', ')" }

# 4. Flush DNS and re-resolve
Write-Host "`n[DNS FLUSH + RESOLVE]"
ipconfig /flushdns | Out-Null
Start-Sleep 1
try {
    $r = [System.Net.Dns]::GetHostAddresses('server.self-serve.windsurf.com')[0].IPAddressToString
    Write-Host "  server.self-serve.windsurf.com -> $r"
} catch { Write-Host "  RESOLVE FAILED: $($_.Exception.Message)" }

# 5. Test connectivity to API server
Write-Host "`n[CONNECTIVITY]"
try {
    $resp = Invoke-WebRequest -Uri 'https://server.self-serve.windsurf.com' -TimeoutSec 10 -UseBasicParsing -EA Stop
    Write-Host "  Direct: HTTP $($resp.StatusCode)"
} catch {
    Write-Host "  Direct: FAILED ($($_.Exception.Message))"
}

# 6. Test via proxy
Write-Host "`n[PROXY TEST]"
try {
    $resp2 = Invoke-WebRequest -Uri 'https://server.self-serve.windsurf.com' -Proxy 'http://127.0.0.1:7890' -TimeoutSec 10 -UseBasicParsing -EA Stop
    Write-Host "  Via :7890: HTTP $($resp2.StatusCode)"
} catch {
    Write-Host "  Via :7890: FAILED ($($_.Exception.Message))"
}

# 7. Key listening ports
Write-Host "`n[LISTENING PORTS]"
foreach ($port in @(7890,7891,7892,7893,9090,1080,8880,8878,8877,53)) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -EA SilentlyContinue
    if ($conn) {
        $procId2 = $conn[0].OwningProcess
        $pname = (Get-Process -Id $procId2 -EA SilentlyContinue).Name
        Write-Host "  :$port -> $pname (PID=$procId2)"
    }
}
# Check UDP 53
$udp53 = Get-NetUDPEndpoint -LocalPort 53 -EA SilentlyContinue
if ($udp53) {
    $procId3 = $udp53[0].OwningProcess
    $pname3 = (Get-Process -Id $procId3 -EA SilentlyContinue).Name
    Write-Host "  :53/UDP -> $pname3 (PID=$procId3)"
}

# 8. Clash service
Write-Host "`n[SERVICES]"
$svcs = Get-Service -EA SilentlyContinue | Where-Object { $_.Name -match 'clash|mihomo|nyanpasu' -or $_.DisplayName -match 'clash|mihomo|Nyanpasu' }
if ($svcs) { $svcs | ForEach-Object { Write-Host "  $($_.Name): $($_.Status) ($($_.DisplayName))" } }
else { Write-Host "  No Clash/mihomo services" }

# 9. Startup items for clash
Write-Host "`n[AUTOSTART]"
$startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
Get-ChildItem $startupDir -EA SilentlyContinue | Where-Object { $_.Name -match 'clash|mihomo|verge|nyanpasu' } | ForEach-Object { Write-Host "  $($_.Name)" }
$regRun = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -EA SilentlyContinue
$regRun.PSObject.Properties | Where-Object { $_.Value -match 'clash|mihomo|verge|nyanpasu' } | ForEach-Object { Write-Host "  REG: $($_.Name) = $($_.Value)" }

Write-Host "`n=== DONE ==="
