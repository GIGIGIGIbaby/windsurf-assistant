#!/usr/bin/env python3
"""ZROLIU remote diagnostic — check WAM state, proxy, extension."""
import urllib.request, json, time, sys
sys.stdout.reconfigure(line_buffering=True)

S = 'http://127.0.0.1:9910'
T = 'dao-ps-agent-2026'
AID = 'ZROLIU_c6aeb86a'

def api(m, p, b=None):
    d = json.dumps(b).encode() if b is not None else None
    req = urllib.request.Request(S + p, data=d, method=m)
    req.add_header('Authorization', 'Bearer ' + T)
    req.add_header('Content-Type', 'application/json')
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

def run(cmd, timeout=25):
    r = api('POST', '/api/exec', {'agent_id': AID, 'type': 'shell', 'payload': {'command': cmd}})
    cid = r['cmd_id']
    for _ in range(timeout):
        time.sleep(1)
        o = api('GET', f'/api/agent/{AID}/output/{cid}')
        if o.get('status') == 'completed':
            return o.get('result', {})
    return {'error': 'TIMEOUT'}

def show(label, cmd, timeout=25):
    print(f'\n=== {label} ===')
    res = run(cmd, timeout)
    if res.get('error'):
        print(f'ERROR: {res["error"]}')
    else:
        print(res.get('stdout', '')[:10000])
        if res.get('stderr'):
            print('STDERR:', res['stderr'][:2000])

# 1. WAM log tail
show('WAM_LOG', '$log="C:\\Users\\zro\\.wam-hot\\wam.log"; if(Test-Path $log){ Get-Content $log -Tail 60 } else { Write-Output "NO_WAM_LOG" }')

# 2. Extension file status
show('EXT_FILE', '$p="C:\\Users\\zro\\.windsurf\\extensions\\local.wam-10.0.1\\extension.js"; if(Test-Path $p){ Write-Output ("SIZE=" + (Get-Item $p).Length); Write-Output ("HASH=" + (Get-FileHash $p -Algorithm SHA256).Hash.Substring(0,16)); Get-Content $p -TotalCount 1 } else { Write-Output "NOT_FOUND" }')

# 3. Windsurf process
show('PROC', 'Get-Process -Name Windsurf -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime | Format-Table -AutoSize')

# 4. Proxy connectivity test
show('PROXY_SCAN', '''$ports = @(7890,7897,7891,10808,10809,20808,20809,1080,1081,8118,8889,2080)
foreach($p in $ports){
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $result = $tcp.BeginConnect("127.0.0.1", $p, $null, $null)
        $ok = $result.AsyncWaitHandle.WaitOne(500)
        if($ok -and $tcp.Connected){ Write-Output "OPEN: $p" } else { Write-Output "CLOSED: $p" }
    } catch { Write-Output "FAIL: $p" }
    finally { $tcp.Close() }
}''')

# 5. System proxy + env
show('SYS_PROXY', '''$ie = Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" -ErrorAction SilentlyContinue
Write-Output ("ProxyEnable=" + $ie.ProxyEnable)
Write-Output ("ProxyServer=" + $ie.ProxyServer)
$env_vars = @("HTTP_PROXY","HTTPS_PROXY","ALL_PROXY","http_proxy","https_proxy","all_proxy")
foreach($v in $env_vars){ $val = [Environment]::GetEnvironmentVariable($v); if($val){ Write-Output "$v=$val" } }''')

# 6. Real Firebase login test with ALL proxy ports
show('FIREBASE_TEST', '''[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$store = "C:\\Users\\zro\\AppData\\Roaming\\Windsurf\\User\\globalStorage\\windsurf-login-accounts.json"
if(-not (Test-Path $store)){ Write-Output "NO_ACCOUNT_STORE"; exit }
$data = Get-Content $store -Raw -Encoding UTF8 | ConvertFrom-Json
if ($data -is [System.Collections.IEnumerable] -and -not ($data -is [pscustomobject])) {
  $acc = $data | Where-Object { $_.password } | Select-Object -First 1
} else {
  $acc = $data.PSObject.Properties.Value | Where-Object { $_.password } | Select-Object -First 1
}
if (-not $acc) { Write-Output "NO_ACCOUNT_WITH_PASSWORD"; exit }
Write-Output ("ACCOUNT=" + $acc.email)
$ports = @(7890,7897,7891,10808,10809,20808,20809,1080,1081,8118,8889,2080)
$keys = @("AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY","AIzaSyDKm6GGxMJfCbNf-k0kPytiGLaqFJpeSac")
$body = @{ email = $acc.email; password = $acc.password; returnSecureToken = $true } | ConvertTo-Json -Compress
$ok = $false
foreach ($port in $ports) {
  foreach ($key in $keys) {
    try {
      $url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$key"
      $proxy = "http://127.0.0.1:$port"
      $resp = Invoke-RestMethod -Method Post -Uri $url -Body $body -ContentType "application/json" -Proxy $proxy -TimeoutSec 15
      if ($resp.idToken) {
        Write-Output ("PROXY_OK=" + $port)
        Write-Output ("KEY_OK=*" + $key.Substring($key.Length-4))
        Write-Output ("TOKEN_LEN=" + $resp.idToken.Length)
        $ok = $true
        break
      }
    } catch {
      $msg = $_.Exception.Message
      if ($msg.Length -gt 100) { $msg = $msg.Substring(0,100) }
    }
  }
  if ($ok) { break }
}
if (-not $ok) {
  Write-Output "ALL_PROXY_CHANNELS_FAILED"
  Write-Output "Trying direct (no proxy)..."
  foreach ($key in $keys) {
    try {
      $url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$key"
      $resp = Invoke-RestMethod -Method Post -Uri $url -Body $body -ContentType "application/json" -TimeoutSec 15
      if ($resp.idToken) {
        Write-Output ("DIRECT_OK=key*" + $key.Substring($key.Length-4))
        Write-Output ("TOKEN_LEN=" + $resp.idToken.Length)
        $ok = $true
        break
      }
    } catch {
      $msg = $_.Exception.Message
      if ($msg.Length -gt 100) { $msg = $msg.Substring(0,100) }
      Write-Output ("DIRECT_FAIL=key*" + $key.Substring($key.Length-4) + " :: " + $msg)
    }
  }
}''')

# 7. Windsurf extension host log (latest)
show('EXTHOST', '''$root="$env:APPDATA\\Windsurf\\logs"
$latest=Get-ChildItem $root -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Desc | Select-Object -First 1
if($latest){
    $f=Get-ChildItem $latest.FullName -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match "exthost\\\\exthost\\.log$" } | Select-Object -First 1
    if($f){
        Write-Output ("FILE=" + $f.FullName)
        Select-String -Path $f.FullName -Pattern "local.wam|wam|Activat|ERROR|SyntaxError|Cannot find" -CaseSensitive:$false -ErrorAction SilentlyContinue | Select-Object -Last 20 | ForEach-Object { $_.Line }
    } else { Write-Output "NO_EXTHOST_LOG" }
} else { Write-Output "NO_LOG_DIR" }''')

print('\n=== DIAGNOSTIC COMPLETE ===')
