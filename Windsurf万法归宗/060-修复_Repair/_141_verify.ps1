# Final verification
Start-Sleep 5
Write-Host "=== FINAL VERIFICATION ===" -ForegroundColor Cyan

# 1. Hosts
$resolved = [System.Net.Dns]::GetHostAddresses('server.self-serve.windsurf.com')[0].IPAddressToString
if ($resolved -eq '127.0.0.1') { Write-Host "[FAIL] DNS -> 127.0.0.1" -ForegroundColor Red }
else { Write-Host "[OK] DNS -> $resolved" -ForegroundColor Green }

# 2. Certs
$certs = Get-ChildItem "Cert:\LocalMachine\Root" -EA SilentlyContinue | Where-Object {
    $_.Subject -match 'self-serve\.windsurf|Dao' -or $_.FriendlyName -match 'Dao'
}
if ($certs) { Write-Host "[FAIL] Dao certs still present" -ForegroundColor Red }
else { Write-Host "[OK] No Dao certs" -ForegroundColor Green }

# 3. settings.json
$sp = "$env:APPDATA\Windsurf\User\settings.json"
$s = Get-Content $sp -Raw | ConvertFrom-Json -EA SilentlyContinue
$ps = if($s.'http.proxySupport'){$s.'http.proxySupport'}else{'default'}
$hp = if($s.'http.proxy'){$s.'http.proxy'}else{'(not set)'}
$ca = if($s.'codeium.apiServerUrl'){$s.'codeium.apiServerUrl'}else{'(not set)'}
if ($ps -eq 'override') { Write-Host "[FAIL] proxySupport=override" -ForegroundColor Red }
else { Write-Host "[OK] proxySupport=$ps" -ForegroundColor Green }
Write-Host "[OK] http.proxy=$hp" -ForegroundColor Green
if ($ca -match '127\.0\.0\.1') { Write-Host "[FAIL] codeium.apiServerUrl=$ca" -ForegroundColor Red }
else { Write-Host "[OK] codeium.apiServerUrl=$ca" -ForegroundColor Green }

# 4. extension.js
$extJs = 'E:\Windsurf\resources\app\extensions\windsurf\dist\extension.js'
$sz = (Get-Item $extJs -EA SilentlyContinue).Length
if ($sz -lt 100000) { Write-Host "[FAIL] extension.js too small: $sz bytes" -ForegroundColor Red }
else {
    $has = Select-String $extJs -Pattern 'return"http://127.0.0.1:8880"' -SimpleMatch -Quiet
    if ($has) { Write-Host "[FAIL] extension.js still patched" -ForegroundColor Red }
    else { Write-Host "[OK] extension.js clean ($sz bytes)" -ForegroundColor Green }
}

# 5. LS process
$lsProcs = Get-Process -Name 'language_server_windows_x64' -EA SilentlyContinue
if ($lsProcs) {
    foreach ($ls in $lsProcs) {
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($ls.Id)" -EA Stop).CommandLine
            if ($cmd -match '--api_server_url\s+(\S+)') {
                $url = $Matches[1]
                if ($url -match 'self-serve\.windsurf\.com') {
                    Write-Host "[OK] LS PID=$($ls.Id) -> $url" -ForegroundColor Green
                } elseif ($url -match '127\.0\.0\.1') {
                    Write-Host "[FAIL] LS PID=$($ls.Id) -> $url" -ForegroundColor Red
                } else {
                    Write-Host "[?] LS PID=$($ls.Id) -> $url" -ForegroundColor Yellow
                }
            }
        } catch {
            Write-Host "[?] LS PID=$($ls.Id) (CIM unavailable)" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "[WARN] No LS running - open Windsurf and Reload Window" -ForegroundColor Yellow
}

# 6. Clash
$clash = Get-NetTCPConnection -LocalPort 7890 -State Listen -EA SilentlyContinue
if ($clash) { Write-Host "[OK] Clash :7890 running" -ForegroundColor Green }
else { Write-Host "[WARN] Clash :7890 not running" -ForegroundColor Yellow }

Write-Host "`n=== DONE ===" -ForegroundColor Cyan
