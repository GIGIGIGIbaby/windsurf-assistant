###############################################################################
# _179_ssh_diag.ps1 — 179笔记本 Windsurf 全面诊断 (via PSSession)
# 道法自然·解构一切
###############################################################################
$ErrorActionPreference = 'Continue'
$TARGET = '192.168.31.179'

Write-Host "`n###### 179 Windsurf Total Diagnosis ######" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray

# Connect
$sess = New-PSSession -ComputerName $TARGET -ErrorAction Stop
Write-Host "Connected to $TARGET via PSSession" -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════
# L1: Network Layer
# ═══════════════════════════════════════════════════════════════
Write-Host "`n====== L1: NETWORK LAYER ======" -ForegroundColor Yellow

Invoke-Command -Session $sess -ScriptBlock {
    Write-Host "`n--- L1.1: DNS Resolution ---"
    $domains = @(
        "server.codeium.com","inference.codeium.com","unleash.codeium.com",
        "register.windsurf.com","server.self-serve.windsurf.com","web-backend.windsurf.com",
        "api.codeium.com","register.codeium.com",
        "identitytoolkit.googleapis.com","securetoken.googleapis.com","www.googleapis.com"
    )
    foreach($d in $domains){
        try {
            $ips = [System.Net.Dns]::GetHostAddresses($d) | %{ $_.IPAddressToString }
            $ipStr = $ips -join ", "
            $is127 = $ips | Where-Object { $_ -eq "127.0.0.1" -or $_ -eq "0.0.0.0" }
            if($is127){ Write-Host "  !BLOCKED: $d -> $ipStr" -ForegroundColor Red }
            else { Write-Host "  OK: $d -> $ipStr" -ForegroundColor Green }
        } catch { Write-Host "  !FAIL: $d -> $($_.Exception.Message)" -ForegroundColor Red }
    }

    Write-Host "`n--- L1.2: Proxy Environment ---"
    Write-Host "  HTTP_PROXY: $env:HTTP_PROXY"
    Write-Host "  HTTPS_PROXY: $env:HTTPS_PROXY"
    Write-Host "  ALL_PROXY: $env:ALL_PROXY"
    $ie = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -EA SilentlyContinue
    Write-Host "  Registry ProxyEnable: $($ie.ProxyEnable)"
    Write-Host "  Registry ProxyServer: $($ie.ProxyServer)"

    Write-Host "`n--- L1.3: Proxy/VPN Processes ---"
    $proxyProcs = Get-Process clash*,mihomo*,v2ray*,xray*,SakuraCat*,trojan*,hysteria*,sing-box*,Clash*,Mihomo* -EA SilentlyContinue
    if($proxyProcs){
        $proxyProcs | %{ Write-Host "  $($_.ProcessName) PID=$($_.Id) WS=$([math]::Round($_.WorkingSet64/1MB,1))MB" }
    } else { Write-Host "  NO proxy processes found" -ForegroundColor Red }

    Write-Host "`n--- L1.4: Proxy Port Scan ---"
    $ports = @(7890, 7891, 7897, 10808, 1080, 10801)
    $openPorts = @()
    foreach($p in $ports){
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $r = $tcp.ConnectAsync("127.0.0.1", $p).Wait(800)
            if($tcp.Connected){ Write-Host "  OPEN: 127.0.0.1:$p" -ForegroundColor Green; $openPorts += $p; $tcp.Close() }
            else { $tcp.Dispose() }
        } catch {}
    }
    if($openPorts.Count -eq 0){ Write-Host "  NO proxy ports open!" -ForegroundColor Red }

    Write-Host "`n--- L1.5: Direct Connectivity ---"
    $targets = @(
        @{url="https://server.codeium.com";name="server.codeium.com"},
        @{url="https://api.codeium.com";name="api.codeium.com"},
        @{url="https://register.windsurf.com";name="register.windsurf.com"},
        @{url="https://identitytoolkit.googleapis.com";name="Firebase Auth"},
        @{url="https://www.google.com";name="google.com (GFW)"}
    )
    foreach($t in $targets){
        try {
            [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
            $wc = New-Object System.Net.WebClient
            $wc.Headers.Add("User-Agent","Diag/1.0")
            $wc.DownloadString($t.url) | Out-Null
            Write-Host "  DIRECT-OK: $($t.name)" -ForegroundColor Green
        } catch {
            $msg = $_.Exception.Message
            if($msg.Length -gt 120){ $msg = $msg.Substring(0,120) }
            # Check if we got an HTTP response (meaning reachable but error)
            $inner = $_.Exception.InnerException
            if($inner -is [System.Net.WebException] -and $inner.Response){
                $code = [int]$inner.Response.StatusCode
                Write-Host "  DIRECT-REACH: $($t.name) HTTP=$code (reachable)" -ForegroundColor DarkYellow
            } else {
                Write-Host "  DIRECT-FAIL: $($t.name) | $msg" -ForegroundColor Red
            }
        }
    }

    # Proxy connectivity
    if($openPorts.Count -gt 0){
        Write-Host "`n--- L1.6: Proxy Connectivity ---"
        $pp = $openPorts[0]
        foreach($t in $targets){
            try {
                $wc = New-Object System.Net.WebClient
                $wc.Proxy = New-Object System.Net.WebProxy("http://127.0.0.1:$pp")
                $wc.Headers.Add("User-Agent","Diag/1.0")
                $wc.DownloadString($t.url) | Out-Null
                Write-Host "  PROXY($pp)-OK: $($t.name)" -ForegroundColor Green
            } catch {
                $inner = $_.Exception.InnerException
                if($inner -is [System.Net.WebException] -and $inner.Response){
                    $code = [int]$inner.Response.StatusCode
                    Write-Host "  PROXY($pp)-REACH: $($t.name) HTTP=$code" -ForegroundColor DarkYellow
                } else {
                    $msg = $_.Exception.Message
                    if($msg.Length -gt 100){ $msg = $msg.Substring(0,100) }
                    Write-Host "  PROXY($pp)-FAIL: $($t.name) | $msg" -ForegroundColor Red
                }
            }
        }
    }

    Write-Host "`n--- L1.7: Firewall Rules ---"
    Get-NetFirewallRule -EA SilentlyContinue | Where-Object { $_.DisplayName -match "Windsurf|windsurf|codeium" } | %{
        Write-Host "  $($_.DisplayName) | Action=$($_.Action) | Dir=$($_.Direction) | Enabled=$($_.Enabled)"
    }
    Write-Host "`n--- L1.8: Network Adapters ---"
    Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | %{
        Write-Host "  $($_.Name) | $($_.InterfaceDescription) | $($_.LinkSpeed)"
    }
    Get-DnsClientServerAddress | Where-Object { $_.ServerAddresses } | Select -First 4 | %{
        Write-Host "  DNS[$($_.InterfaceAlias)]: $($_.ServerAddresses -join ', ')"
    }
}

# ═══════════════════════════════════════════════════════════════
# L2: Windsurf Config Layer
# ═══════════════════════════════════════════════════════════════
Write-Host "`n====== L2: WINDSURF CONFIG LAYER ======" -ForegroundColor Yellow

Invoke-Command -Session $sess -ScriptBlock {
    Write-Host "`n--- L2.1: Windsurf Install ---"
    $wsDir = $null
    $paths = @("E:\Windsurf","C:\Program Files\Windsurf","$env:LOCALAPPDATA\Programs\Windsurf","$env:LOCALAPPDATA\Windsurf")
    foreach($p in $paths){ if(Test-Path "$p\Windsurf.exe"){ $wsDir = $p; break } }
    if($wsDir){
        Write-Host "  INSTALL: $wsDir"
        $pkg = "$wsDir\resources\app\package.json"
        if(Test-Path $pkg){ $j = Get-Content $pkg -Raw | ConvertFrom-Json; Write-Host "  VERSION: $($j.version)" }
        $prod = "$wsDir\resources\app\product.json"
        if(Test-Path $prod){
            $pj = Get-Content $prod -Raw | ConvertFrom-Json
            Write-Host "  commit: $($pj.commit)"
            Write-Host "  date: $($pj.date)"
        }
    } else { Write-Host "  !!! NO WINDSURF INSTALL FOUND" -ForegroundColor Red }

    Write-Host "`n--- L2.2: settings.json ---"
    $sf = "$env:APPDATA\Windsurf\User\settings.json"
    if(Test-Path $sf){
        Write-Host "  File: $sf ($([math]::Round((Get-Item $sf).Length/1KB,1))KB)"
        try {
            $s = Get-Content $sf -Raw | ConvertFrom-Json
            Write-Host "  http.proxy: $($s.'http.proxy')"
            Write-Host "  http.proxySupport: $($s.'http.proxySupport')"
            Write-Host "  http.proxyStrictSSL: $($s.'http.proxyStrictSSL')"
        } catch { Write-Host "  (parse error)" }
        # Also dump raw for inspection
        $raw = Get-Content $sf -Raw
        Write-Host "  RAW (first 1000 chars):"
        Write-Host $raw.Substring(0, [math]::Min($raw.Length, 1000))
    } else { Write-Host "  NOT FOUND" }

    Write-Host "`n--- L2.3: state.vscdb ---"
    $db = "$env:APPDATA\Windsurf\User\globalStorage\state.vscdb"
    if(Test-Path $db){
        Write-Host "  Size: $([math]::Round((Get-Item $db).Length/1MB,2))MB  Modified: $((Get-Item $db).LastWriteTime)"
        $wal = "${db}-wal"
        if(Test-Path $wal){ Write-Host "  WAL: $([math]::Round((Get-Item $wal).Length/1KB,1))KB" }
    } else { Write-Host "  NOT FOUND" -ForegroundColor Red }

    Write-Host "`n--- L2.4: state.vscdb Content (Python) ---"
    $pyCmd = @'
import sqlite3, json, sys, base64, re
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import os
db_path = os.path.join(os.environ['APPDATA'], 'Windsurf', 'User', 'globalStorage', 'state.vscdb')
if not os.path.exists(db_path):
    print("  DB NOT FOUND")
    sys.exit(0)
db = sqlite3.connect(db_path)
try:
    cur = db.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cur.fetchall()]
    print(f"  Tables: {tables}")
    if 'ItemTable' not in tables:
        print("  !!! ItemTable NOT FOUND — DB CORRUPTED")
        sys.exit(1)
    # windsurfAuthStatus
    cur = db.execute("SELECT value FROM ItemTable WHERE key='windsurfAuthStatus'")
    row = cur.fetchone()
    if row:
        val = row[0]
        if isinstance(val, bytes): val = val.decode('utf-8','replace')
        try:
            d = json.loads(val)
            email = d.get('email','?')
            plan = d.get('plan','?')
            ak = (d.get('apiKey','') or '')[:30]
            status = d.get('status','?')
            proto = d.get('userStatusProtoBinaryBase64','')
            print(f"  AUTH: email={email} plan={plan} status={status}")
            print(f"  apiKey: {ak}...")
            if proto:
                try:
                    raw = base64.b64decode(proto)
                    emails_found = re.findall(rb'[\w.-]+@[\w.-]+\.\w+', raw[:500])
                    print(f"  proto emails: {[e.decode() for e in emails_found]}")
                    print(f"  proto len: {len(raw)} bytes")
                except: print("  proto: (decode error)")
        except:
            print(f"  AUTH: raw ({len(val)} chars)")
    else:
        print("  AUTH: NO windsurfAuthStatus !!")
    # apiServerUrl
    cur = db.execute("SELECT value FROM ItemTable WHERE key='apiServerUrl'")
    row = cur.fetchone()
    if row:
        val = row[0]
        if isinstance(val, bytes): val = val.decode('utf-8','replace')
        print(f"  apiServerUrl: {val[:120]}")
    else:
        print("  apiServerUrl: MISSING !!")
    # auth usage records
    cur = db.execute("SELECT key FROM ItemTable WHERE key LIKE 'windsurf_auth%usages'")
    rows = cur.fetchall()
    print(f"  auth-usages records: {len(rows)}")
    for r in rows[:5]:
        print(f"    {r[0]}")
    if len(rows) > 5:
        print(f"    ... and {len(rows)-5} more")
    # account switch markers
    cur = db.execute("SELECT key, length(value) FROM ItemTable WHERE key LIKE '%switch%' OR key LIKE '%wam%' OR key LIKE '%account%'")
    for r in cur.fetchall():
        print(f"  [{r[0]}]: {r[1]} bytes")
except Exception as e:
    print(f"  DB ERROR: {e}")
finally:
    db.close()
'@
    & "python" -c $pyCmd 2>&1 | ForEach-Object { Write-Host $_ }

    Write-Host "`n--- L2.5: Patches ---"
    if($wsDir){
        $extJs = "$wsDir\resources\app\extensions\windsurf\dist\extension.js"
        if(Test-Path $extJs){
            $sz = [math]::Round((Get-Item $extJs).Length/1MB,2)
            Write-Host "  extension.js: ${sz}MB  Modified: $((Get-Item $extJs).LastWriteTime)"
            $c = Get-Content $extJs -Raw
            @("_pool_apikey","_fp_salt","__wam","POOL_HOT_PATCH","FP_ROTATE") | %{
                if($c -match [regex]::Escape($_)){ Write-Host "    PATCH [$_]: ACTIVE" -ForegroundColor DarkYellow }
                else { Write-Host "    PATCH [$_]: not found" }
            }
        }
        $wbJs = "$wsDir\resources\app\out\vs\workbench\workbench.desktop.main.js"
        if(Test-Path $wbJs){
            $sz = [math]::Round((Get-Item $wbJs).Length/1MB,2)
            Write-Host "  workbench.js: ${sz}MB  Modified: $((Get-Item $wbJs).LastWriteTime)"
            $c = [IO.File]::ReadAllText($wbJs)
            @("__wamRateLimit","!1&&!tu.hasCapacity","!1&&!Ru.hasCapacity","MODEL_SWE_1_6") | %{
                if($c.Contains($_)){ Write-Host "    PATCH [$_]: ACTIVE" -ForegroundColor DarkYellow }
                else { Write-Host "    PATCH [$_]: not found" }
            }
        }
    }
}

# ═══════════════════════════════════════════════════════════════
# L3: Process & Log Layer
# ═══════════════════════════════════════════════════════════════
Write-Host "`n====== L3: PROCESS & LOG LAYER ======" -ForegroundColor Yellow

Invoke-Command -Session $sess -ScriptBlock {
    Write-Host "`n--- L3.1: Windsurf Processes ---"
    $wsProcs = Get-Process Windsurf*,language_server* -EA SilentlyContinue
    if($wsProcs){
        $wsProcs | Sort WorkingSet64 -Desc | %{
            Write-Host ("  {0,-40} PID={1,-7} WS={2}MB" -f $_.ProcessName,$_.Id,[math]::Round($_.WorkingSet64/1MB,1))
        }
        Write-Host "  TOTAL: $([math]::Round(($wsProcs | Measure-Object -Property WorkingSet64 -Sum).Sum/1GB,2))GB ($($wsProcs.Count) procs)"

        Write-Host "`n--- L3.2: TCP Connections ---"
        $conns = Get-NetTCPConnection -OwningProcess ($wsProcs.Id) -EA SilentlyContinue | Where-Object { $_.RemotePort -ne 0 }
        if($conns){
            $conns | Group-Object State | %{ Write-Host "  $($_.Name): $($_.Count)" }
            Write-Host "  Top remotes:"
            $conns | Group-Object { "$($_.RemoteAddress):$($_.RemotePort)" } | Sort Count -Desc | Select -First 10 | %{
                Write-Host "    $($_.Name) x$($_.Count)"
            }
        } else { Write-Host "  No TCP connections" }
    } else {
        Write-Host "  !!! NO WINDSURF PROCESSES" -ForegroundColor Red
    }

    Write-Host "`n--- L3.3: Recent Errors (last log session) ---"
    $logDir = "$env:APPDATA\Windsurf\logs"
    $latest = Get-ChildItem $logDir -Directory -EA SilentlyContinue | Sort Name -Desc | Select -First 1
    if($latest){
        Write-Host "  Session: $($latest.Name)"

        # exthost
        $f = Get-ChildItem $latest.FullName -Recurse -Filter "exthost.log" -EA SilentlyContinue | Select -First 1
        if($f){
            $lines = Get-Content $f.FullName -Tail 300 -EA SilentlyContinue
            $errs = $lines | Where-Object { $_ -match "error|Error|ERR|ConnectError|ECONN|socket hang|rate.limit|aborted|unauthorized|timeout|all_channels" }
            Write-Host "  exthost errors: $($errs.Count)/300"
            $errs | Select -Last 15 | %{ Write-Host ("    " + $_.Substring(0,[math]::Min($_.Length,200))) }
        }
        # renderer
        $f = Get-ChildItem $latest.FullName -Recurse -Filter "renderer*.log" -EA SilentlyContinue | Sort Length -Desc | Select -First 1
        if($f){
            $lines = Get-Content $f.FullName -Tail 300 -EA SilentlyContinue
            $errs = $lines | Where-Object { $_ -match "error|Error|ERR|ConnectError|ECONN|socket hang|rate.limit|aborted|unauthorized|timeout|127\.0\.0\.1" }
            Write-Host "  renderer errors: $($errs.Count)/300"
            $errs | Select -Last 10 | %{ Write-Host ("    " + $_.Substring(0,[math]::Min($_.Length,200))) }
        }
    } else { Write-Host "  No log directory" }
}

# ═══════════════════════════════════════════════════════════════
# L4: Identity Layer
# ═══════════════════════════════════════════════════════════════
Write-Host "`n====== L4: IDENTITY LAYER ======" -ForegroundColor Yellow

Invoke-Command -Session $sess -ScriptBlock {
    Write-Host "`n--- L4.1: Installation ID ---"
    $f = "$env:USERPROFILE\.codeium\windsurf\installation_id"
    if(Test-Path $f){ Write-Host "  $(Get-Content $f -Raw)" } else { Write-Host "  NOT FOUND" }

    Write-Host "`n--- L4.2: FP Salt ---"
    $f = "$env:APPDATA\Windsurf\_fp_salt.txt"
    if(Test-Path $f){
        $salt = (Get-Content $f -Raw).Trim()
        Write-Host "  SALT: $salt (len=$($salt.Length))"
        Write-Host "  Modified: $((Get-Item $f).LastWriteTime)"
    } else { Write-Host "  NOT FOUND" }

    Write-Host "`n--- L4.3: Active Account ---"
    $f = "$env:APPDATA\Windsurf\_active_account.txt"
    if(Test-Path $f){ Write-Host "  $(Get-Content $f -Raw)" } else { Write-Host "  NOT FOUND" }

    Write-Host "`n--- L4.4: Pool API Key ---"
    $f = "$env:APPDATA\Windsurf\_pool_apikey.txt"
    if(Test-Path $f){
        $key = (Get-Content $f -Raw).Trim()
        Write-Host "  KEY: $($key.Substring(0,[math]::Min($key.Length,30)))... (len=$($key.Length))"
    } else { Write-Host "  NOT FOUND" }

    Write-Host "`n--- L4.5: Storage.json (Telemetry IDs) ---"
    $f = "$env:APPDATA\Windsurf\User\globalStorage\storage.json"
    if(Test-Path $f){
        try {
            $s = Get-Content $f -Raw | ConvertFrom-Json
            Write-Host "  machineId: $($s.'telemetry.machineId')"
            Write-Host "  macMachineId: $($s.'telemetry.macMachineId')"
            Write-Host "  sqmId: $($s.'telemetry.sqmId')"
            Write-Host "  devDeviceId: $($s.'telemetry.devDeviceId')"
        } catch { Write-Host "  (parse error)" }
    } else { Write-Host "  NOT FOUND" }

    Write-Host "`n--- L4.6: WAM Data ---"
    $wamDir = "$env:APPDATA\Windsurf\_wam"
    if(Test-Path $wamDir){
        Get-ChildItem $wamDir -File -EA SilentlyContinue | %{
            Write-Host "  $($_.Name) $([math]::Round($_.Length/1KB,1))KB $($_.LastWriteTime)"
        }
        $accFile = "$wamDir\accounts.json"
        if(Test-Path $accFile){
            try {
                $a = Get-Content $accFile -Raw | ConvertFrom-Json
                $cnt = if($a.accounts){ $a.accounts.Count }else{ 0 }
                Write-Host "  ACCOUNTS: $cnt  activeIndex: $($a.activeIndex)"
            } catch {}
        }
        $modeFile = "$wamDir\wam_mode.json"
        if(Test-Path $modeFile){ Write-Host "  MODE: $(Get-Content $modeFile -Raw)" }
    } else { Write-Host "  WAM dir NOT FOUND" }

    Write-Host "`n--- L4.7: Go Binary Patch ---"
    $wsDir = $null
    $paths = @("E:\Windsurf","C:\Program Files\Windsurf","$env:LOCALAPPDATA\Programs\Windsurf","$env:LOCALAPPDATA\Windsurf")
    foreach($p in $paths){ if(Test-Path "$p\Windsurf.exe"){ $wsDir = $p; break } }
    if($wsDir){
        $goBin = "$wsDir\resources\app\extensions\windsurf\bin\language_server_windows_x64.exe"
        if(Test-Path $goBin){
            $sz = [math]::Round((Get-Item $goBin).Length/1MB,1)
            Write-Host "  Go binary: ${sz}MB  Modified: $((Get-Item $goBin).LastWriteTime)"
            $bytes = [IO.File]::ReadAllBytes($goBin)
            $text = [Text.Encoding]::ASCII.GetString($bytes)
            @(
                @{n="HW_PATCHED";p="CentralProcessor\9"},
                @{n="HW_ORIG";p="CentralProcessor\0"},
                @{n="SRC_ADDR_PATCHED";p="bytes,99,opt,name=source_address"},
                @{n="SRC_ADDR_ORIG";p="bytes,11,opt,name=source_address"},
                @{n="FP_META_PATCHED";p="bytes,97,opt,name=device_fingerprint"},
                @{n="FP_META_ORIG";p="bytes,12,opt,name=device_fingerprint"}
            ) | %{
                if($text.Contains($_.p)){ Write-Host "    $($_.n): FOUND" }
            }
        } else { Write-Host "  Go binary NOT FOUND" }
    }
}

# ═══════════════════════════════════════════════════════════════
# L5: Login/Auth Test
# ═══════════════════════════════════════════════════════════════
Write-Host "`n====== L5: AUTH & LOGIN LAYER ======" -ForegroundColor Yellow

Invoke-Command -Session $sess -ScriptBlock {
    Write-Host "`n--- L5.1: Login Helper Extension ---"
    $exts = Get-ChildItem "$env:USERPROFILE\.windsurf\extensions" -Directory -Filter "*login-helper*" -EA SilentlyContinue
    $exts | %{ Write-Host "  $($_.Name)" }
    if($exts.Count -eq 0){ Write-Host "  NO login-helper extension found" }

    Write-Host "`n--- L5.2: Windsurf Auth Cookie/Token Files ---"
    $authDir = "$env:APPDATA\Windsurf"
    Get-ChildItem $authDir -File -Filter "*auth*" -EA SilentlyContinue | %{
        Write-Host "  $($_.Name) $([math]::Round($_.Length/1KB,1))KB $($_.LastWriteTime)"
    }
    Get-ChildItem $authDir -File -Filter "*token*" -EA SilentlyContinue | %{
        Write-Host "  $($_.Name) $([math]::Round($_.Length/1KB,1))KB $($_.LastWriteTime)"
    }

    Write-Host "`n--- L5.3: Extension WAM Logs ---"
    # Check WAM output channel logs
    $logDir = "$env:APPDATA\Windsurf\logs"
    $latest = Get-ChildItem $logDir -Directory -EA SilentlyContinue | Sort Name -Desc | Select -First 1
    if($latest){
        $outputLogs = Get-ChildItem $latest.FullName -Recurse -Filter "*.log" -EA SilentlyContinue
        $outputLogs | Where-Object { $_.Name -match "output|exthost" } | Sort Length -Desc | Select -First 3 | %{
            Write-Host "  $($_.Name) $([math]::Round($_.Length/1KB,1))KB"
            $content = Get-Content $_.FullName -Tail 50 -EA SilentlyContinue
            $wamLines = $content | Where-Object { $_ -match "WAM|wam|login.helper|switch|Firebase|firebase|all_channels|channel|inject|token" }
            if($wamLines){
                Write-Host "  WAM-related lines:"
                $wamLines | Select -Last 10 | %{ Write-Host ("    " + $_.Substring(0,[math]::Min($_.Length,200))) }
            }
        }
    }

    Write-Host "`n--- L5.4: Windsurf Window Count ---"
    $mainProcs = Get-Process Windsurf -EA SilentlyContinue | Where-Object { $_.MainWindowTitle }
    Write-Host "  Windows with title: $($mainProcs.Count)"
    $mainProcs | %{ Write-Host "  PID=$($_.Id): $($_.MainWindowTitle)" }
}

# Cleanup
Remove-PSSession $sess
Write-Host "`n###### DIAGNOSIS COMPLETE ######" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray
