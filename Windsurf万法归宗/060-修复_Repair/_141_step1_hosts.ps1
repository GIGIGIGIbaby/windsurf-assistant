# Step 1: Hosts cleanup + DNS flush
$hostsFile = "$env:SystemRoot\System32\drivers\etc\hosts"
$h = Get-Content $hostsFile
$before = $h.Count
$clean = $h | Where-Object { $_ -notmatch 'server\.self-serve\.windsurf\.com' -and $_ -notmatch 'TLS' }
Set-Content $hostsFile -Value $clean -Encoding ASCII -Force
Write-Host "Hosts: $before -> $($clean.Count) lines"
ipconfig /flushdns 2>&1 | Out-Null
Write-Host "DNS flushed"
# Verify
$check = [System.Net.Dns]::GetHostAddresses('server.self-serve.windsurf.com')[0].IPAddressToString
Write-Host "DNS resolve: server.self-serve.windsurf.com -> $check"
if ($check -eq '127.0.0.1') { Write-Host "FAIL: still 127.0.0.1!" -ForegroundColor Red }
else { Write-Host "OK: not localhost" -ForegroundColor Green }
