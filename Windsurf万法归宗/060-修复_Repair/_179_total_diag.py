#!/usr/bin/env python3
"""
179笔记本 Windsurf 全面深度诊断 — 道法自然·解构一切
=====================================================
六层诊断:
  L0: 系统基础 (连通性/hostname/用户/版本)
  L1: 网络基础 (hosts/DNS/代理/防火墙/路由/端口)
  L2: Windsurf配置 (settings/state.vscdb/auth/补丁)
  L3: 进程与日志 (进程树/错误日志/gRPC/TCP连接)
  L4: 指纹与身份 (installation_id/fingerprint/salt/Go patch)
  L5: 登录与账号 (Firebase/token/切号/注入)
"""
import urllib.request, json, ssl, sys, time, traceback
sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)

BASE = 'https://aiotvr.xyz/ps-agent'
TOKEN = 'dao-ps-agent-2026'
AGENT = 'LAPTOP-AKCGC7BM'
CTX = ssl.create_default_context()

results = {}

def exec_sync(cmd, timeout=60):
    """Execute PowerShell command on laptop via ps-agent relay."""
    body = json.dumps({'agent_id': AGENT, 'cmd': cmd, 'timeout': timeout}).encode()
    req = urllib.request.Request(f'{BASE}/api/exec-sync', data=body, method='POST')
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Content-Type', 'application/json')
    try:
        r = urllib.request.urlopen(req, timeout=timeout+15, context=CTX)
        d = json.loads(r.read())
        if d.get('status') == 'completed':
            res = d['result']
            return res.get('stdout', res.get('output', json.dumps(res)))
        return f"[TIMEOUT/PENDING] {json.dumps(d)}"
    except Exception as e:
        return f"[ERROR] {e}"

def section(title, level=0):
    if level == 0:
        print(f"\n{'#'*70}")
        print(f"##  {title}")
        print(f"{'#'*70}")
    else:
        print(f"\n--- {title} ---")

def run_diag(name, cmd, timeout=60):
    """Run a diagnostic command and store result."""
    print(f"  [{name}] ... ", end='', flush=True)
    t0 = time.time()
    result = exec_sync(cmd, timeout)
    ms = int((time.time() - t0) * 1000)
    results[name] = result
    lines = result.strip().split('\n') if result else []
    preview = lines[0][:100] if lines else '(empty)'
    print(f"OK ({ms}ms, {len(lines)} lines) | {preview}")
    return result

# ═══════════════════════════════════════════════════════════════
# L0: 连通性验证
# ═══════════════════════════════════════════════════════════════
section("L0: 连通性验证 — 确认179笔记本在线")

result = run_diag("heartbeat", '''
Write-Host "ALIVE|$env:COMPUTERNAME|$env:USERNAME|$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$os = Get-CimInstance Win32_OperatingSystem
Write-Host "OS|$($os.Caption)|$($os.Version)"
Write-Host "RAM|$([math]::Round($os.TotalVisibleMemorySize/1MB,1))GB|Free=$([math]::Round($os.FreePhysicalMemory/1MB,1))GB"
Write-Host "BOOT|$($os.LastBootUpTime)"
''', 15)

if "[ERROR]" in result or "[TIMEOUT" in result:
    print(f"\n!!! 179笔记本不在线或ps-agent不可达 !!!")
    print(f"结果: {result}")
    sys.exit(1)

print(f"\n>>> 179笔记本在线, 开始全面诊断 <<<\n")

# ═══════════════════════════════════════════════════════════════
# L1: 网络基础层
# ═══════════════════════════════════════════════════════════════
section("L1: 网络基础层诊断")

section("L1.1: Hosts文件 (历史上最常见的根因)", 1)
run_diag("hosts", '''
$h = Get-Content "$env:SystemRoot\\System32\\drivers\\etc\\hosts" -EA SilentlyContinue
Write-Host "=== HOSTS FILE ==="
$h | Where-Object { $_ -and $_ -notmatch "^\\s*#" -and $_.Trim() } | ForEach-Object { Write-Host $_ }
Write-Host ""
Write-Host "=== CODEIUM/WINDSURF ENTRIES ==="
$bad = $h | Where-Object { $_ -match "codeium|windsurf" -and $_ -notmatch "^\\s*#" }
if($bad){ $bad | ForEach-Object { Write-Host "!!! POISONED: $_" }; Write-Host "VERDICT: POISONED" }
else { Write-Host "VERDICT: CLEAN" }
''', 15)

section("L1.2: DNS解析 (所有关键域名)", 1)
run_diag("dns", '''
$domains = @(
    "server.codeium.com",
    "inference.codeium.com",
    "unleash.codeium.com",
    "register.windsurf.com",
    "server.self-serve.windsurf.com",
    "web-backend.windsurf.com",
    "api.codeium.com",
    "register.codeium.com",
    "identitytoolkit.googleapis.com",
    "securetoken.googleapis.com",
    "www.googleapis.com"
)
foreach($d in $domains){
    try {
        $ips = [System.Net.Dns]::GetHostAddresses($d) | ForEach-Object { $_.IPAddressToString }
        $ipStr = $ips -join ", "
        $is127 = $ips | Where-Object { $_ -eq "127.0.0.1" -or $_ -eq "0.0.0.0" }
        if($is127){ Write-Host "!!! BLOCKED: $d -> $ipStr" }
        else { Write-Host "OK: $d -> $ipStr" }
    } catch {
        Write-Host "!!! FAIL: $d -> $($_.Exception.Message)"
    }
}
''', 30)

section("L1.3: 代理环境", 1)
run_diag("proxy", '''
Write-Host "=== ENV PROXY ==="
Write-Host "HTTP_PROXY: $env:HTTP_PROXY"
Write-Host "HTTPS_PROXY: $env:HTTPS_PROXY"
Write-Host "NO_PROXY: $env:NO_PROXY"
Write-Host "ALL_PROXY: $env:ALL_PROXY"
Write-Host ""
Write-Host "=== SYSTEM PROXY (Registry) ==="
$ie = Get-ItemProperty "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" -EA SilentlyContinue
Write-Host "ProxyEnable: $($ie.ProxyEnable)"
Write-Host "ProxyServer: $($ie.ProxyServer)"
Write-Host "ProxyOverride: $($ie.ProxyOverride)"
Write-Host ""
Write-Host "=== CLASH/PROXY PROCESSES ==="
Get-Process clash*,mihomo*,v2ray*,xray*,sing-box*,SakuraCat*,Clash*,Mihomo*,V2Ray*,trojan*,hysteria* -EA SilentlyContinue | ForEach-Object {
    Write-Host "  $($_.ProcessName) PID=$($_.Id) WS=$([math]::Round($_.WorkingSet64/1MB,1))MB"
}
Write-Host ""
Write-Host "=== PROXY PORT TEST ==="
$ports = @(7890, 7891, 7897, 10808, 1080, 10801, 10809, 2080)
foreach($p in $ports){
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.ConnectAsync("127.0.0.1", $p).Wait(500) | Out-Null
        if($tcp.Connected){ Write-Host "OPEN: 127.0.0.1:$p"; $tcp.Close() }
        else { $tcp.Dispose() }
    } catch {}
}
''', 20)

section("L1.4: 网络连通性 (直连+代理)", 1)
run_diag("connectivity", '''
Write-Host "=== DIRECT CONNECTIVITY ==="
$targets = @(
    @{ url="https://server.codeium.com"; name="server.codeium.com" },
    @{ url="https://api.codeium.com"; name="api.codeium.com" },
    @{ url="https://register.windsurf.com"; name="register.windsurf.com" },
    @{ url="https://web-backend.windsurf.com"; name="web-backend.windsurf.com" },
    @{ url="https://identitytoolkit.googleapis.com"; name="Google Identity (Firebase)" },
    @{ url="https://www.google.com"; name="google.com (GFW test)" }
)
foreach($t in $targets){
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "WindsurfDiag/1.0")
        $wc.DownloadString($t.url) | Out-Null
        Write-Host "OK-DIRECT: $($t.name)"
    } catch {
        $code = ""
        if($_.Exception.InnerException -and $_.Exception.InnerException -is [System.Net.WebException]){
            $resp = $_.Exception.InnerException.Response
            if($resp){ $code = " HTTP=$([int]$resp.StatusCode)" }
        }
        $msg = $_.Exception.Message
        if($msg.Length -gt 120){ $msg = $msg.Substring(0,120) }
        Write-Host "FAIL-DIRECT: $($t.name)$code | $msg"
    }
}
Write-Host ""
Write-Host "=== PROXY CONNECTIVITY (通过本地代理) ==="
$proxyPorts = @(7890, 7897)
foreach($pp in $proxyPorts){
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.ConnectAsync("127.0.0.1", $pp).Wait(500) | Out-Null
        if(-not $tcp.Connected){ $tcp.Dispose(); continue }
        $tcp.Close()
    } catch { continue }
    Write-Host "  Testing via proxy 127.0.0.1:$pp ..."
    foreach($t in $targets){
        try {
            $wc = New-Object System.Net.WebClient
            $wc.Proxy = New-Object System.Net.WebProxy("http://127.0.0.1:$pp")
            $wc.Headers.Add("User-Agent", "WindsurfDiag/1.0")
            $wc.DownloadString($t.url) | Out-Null
            Write-Host "  OK-PROXY($pp): $($t.name)"
        } catch {
            $msg = $_.Exception.Message
            if($msg.Length -gt 100){ $msg = $msg.Substring(0,100) }
            Write-Host "  FAIL-PROXY($pp): $($t.name) | $msg"
        }
    }
}
''', 45)

section("L1.5: 防火墙/portproxy/网卡", 1)
run_diag("firewall", '''
Write-Host "=== FIREWALL WINDSURF RULES ==="
Get-NetFirewallRule -EA SilentlyContinue | Where-Object { $_.DisplayName -match "Windsurf|windsurf|codeium|Codeium" } | ForEach-Object {
    Write-Host "  $($_.DisplayName) | Action=$($_.Action) | Dir=$($_.Direction) | Enabled=$($_.Enabled) | Profile=$($_.Profile)"
}
Write-Host ""
Write-Host "=== PORTPROXY ==="
$pp = netsh interface portproxy show all 2>&1
Write-Host $pp
Write-Host ""
Write-Host "=== NETWORK ADAPTERS ==="
Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | ForEach-Object {
    Write-Host "  $($_.Name) | $($_.InterfaceDescription) | Speed=$($_.LinkSpeed) | MAC=$($_.MacAddress)"
}
Write-Host ""
Write-Host "=== IP CONFIG ==="
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -ne "127.0.0.1" } | ForEach-Object {
    Write-Host "  $($_.InterfaceAlias): $($_.IPAddress)/$($_.PrefixLength)"
}
Write-Host ""
Write-Host "=== DNS SERVERS ==="
Get-DnsClientServerAddress | Where-Object { $_.ServerAddresses } | ForEach-Object {
    Write-Host "  $($_.InterfaceAlias): $($_.ServerAddresses -join ', ')"
}
''', 20)

# ═══════════════════════════════════════════════════════════════
# L2: Windsurf配置层
# ═══════════════════════════════════════════════════════════════
section("L2: Windsurf配置层诊断")

section("L2.1: Windsurf安装 + 版本 + settings.json", 1)
run_diag("ws_config", '''
Write-Host "=== WINDSURF INSTALL ==="
$wsExe = Get-Command windsurf -EA SilentlyContinue
if($wsExe){ Write-Host "windsurf.exe: $($wsExe.Source)" }

# 查找所有可能的安装路径
$paths = @("E:\\Windsurf","C:\\Program Files\\Windsurf","$env:LOCALAPPDATA\\Programs\\Windsurf","$env:LOCALAPPDATA\\Windsurf")
foreach($p in $paths){
    if(Test-Path "$p\\Windsurf.exe"){
        Write-Host "INSTALL: $p"
        $pkg = "$p\\resources\\app\\package.json"
        if(Test-Path $pkg){ $j = Get-Content $pkg -Raw | ConvertFrom-Json; Write-Host "  VERSION: $($j.version)" }
        $prod = "$p\\resources\\app\\product.json"
        if(Test-Path $prod){
            $pj = Get-Content $prod -Raw | ConvertFrom-Json
            Write-Host "  commit: $($pj.commit)"
            Write-Host "  date: $($pj.date)"
            # Check checksums integrity
            if($pj.checksums){
                Write-Host "  checksums: present ($(($pj.checksums | Get-Member -MemberType NoteProperty).Count) entries)"
            }
        }
    }
}
Write-Host ""
Write-Host "=== SETTINGS.JSON (ALL USERS) ==="
$users = Get-ChildItem "C:\\Users" -Directory -EA SilentlyContinue | Where-Object { $_.Name -notmatch "Public|Default|All Users|Default User" }
foreach($u in $users){
    $sf = Join-Path $u.FullName "AppData\\Roaming\\Windsurf\\User\\settings.json"
    if(Test-Path $sf){
        Write-Host "[$($u.Name)] $sf"
        $content = Get-Content $sf -Raw -EA SilentlyContinue
        # Extract key settings
        try {
            $s = $content | ConvertFrom-Json
            Write-Host "  http.proxy: $($s.'http.proxy')"
            Write-Host "  http.proxySupport: $($s.'http.proxySupport')"
            Write-Host "  http.proxyStrictSSL: $($s.'http.proxyStrictSSL')"
            Write-Host "  windsurf.enableFirewall: $($s.'windsurf.enableFirewall')"
        } catch {
            Write-Host "  (parse error: $($_.Exception.Message))"
            Write-Host "  RAW(first 500): $($content.Substring(0,[math]::Min($content.Length,500)))"
        }
    }
}
''', 30)

section("L2.2: state.vscdb 健康状态 (所有用户)", 1)
run_diag("state_db", '''
$users = Get-ChildItem "C:\\Users" -Directory -EA SilentlyContinue | Where-Object { $_.Name -notmatch "Public|Default|All Users|Default User" }
foreach($u in $users){
    $db = Join-Path $u.FullName "AppData\\Roaming\\Windsurf\\User\\globalStorage\\state.vscdb"
    if(Test-Path $db){
        Write-Host "[$($u.Name)] state.vscdb"
        Write-Host "  Size: $([math]::Round((Get-Item $db).Length/1MB,2))MB"
        Write-Host "  Modified: $((Get-Item $db).LastWriteTime)"
        # Check WAL
        $wal = "${db}-wal"
        if(Test-Path $wal){ Write-Host "  WAL: $([math]::Round((Get-Item $wal).Length/1KB,1))KB" }
        # Check key tables and auth status via sqlite3
        try {
            Add-Type -Path "$env:USERPROFILE\\.windsurf\\extensions\\nicedoc.windsurf-login-helper-*\\sqlite3.dll" -EA Stop
        } catch {}
        # Use PowerShell to read SQLite
        $pyCmd = @"
import sqlite3, json, sys
db = sqlite3.connect(r'$db')
try:
    cur = db.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cur.fetchall()]
    print(f"  Tables: {tables}")
    if 'ItemTable' in tables:
        # Auth status
        cur = db.execute("SELECT value FROM ItemTable WHERE key='windsurfAuthStatus'")
        row = cur.fetchone()
        if row:
            val = row[0]
            if isinstance(val, bytes): val = val.decode('utf-8','replace')
            try:
                d = json.loads(val)
                email = d.get('email','?')
                plan = d.get('plan','?')
                apiKey = (d.get('apiKey','') or '')[:25]
                proto = d.get('userStatusProtoBinaryBase64','')[:30]
                print(f"  AUTH: email={email} plan={plan} apiKey={apiKey}... proto={proto}...")
            except:
                print(f"  AUTH: (raw, {len(val)} chars)")
        else:
            print("  AUTH: NO windsurfAuthStatus")
        # apiServerUrl
        cur = db.execute("SELECT value FROM ItemTable WHERE key='apiServerUrl'")
        row = cur.fetchone()
        if row:
            val = row[0]
            if isinstance(val, bytes): val = val.decode('utf-8','replace')
            print(f"  apiServerUrl: {val[:100]}")
        else:
            print("  apiServerUrl: MISSING")
        # Count auth usage records
        cur = db.execute("SELECT COUNT(*) FROM ItemTable WHERE key LIKE 'windsurf_auth%usages'")
        cnt = cur.fetchone()[0]
        print(f"  auth-usages records: {cnt}")
        # sessions
        cur = db.execute("SELECT COUNT(*) FROM ItemTable WHERE key LIKE '%session%'")
        scnt = cur.fetchone()[0]
        print(f"  session records: {scnt}")
    else:
        print("  !!! ItemTable NOT FOUND — DB CORRUPTED")
except Exception as e:
    print(f"  DB ERROR: {e}")
finally:
    db.close()
"@
        python3 -c $pyCmd 2>&1 | ForEach-Object { Write-Host $_ }
        if(-not $?){ python -c $pyCmd 2>&1 | ForEach-Object { Write-Host $_ } }
        Write-Host ""
    }
}
''', 45)

section("L2.3: 补丁状态 (extension.js / workbench.js)", 1)
run_diag("patches", '''
# Find Windsurf install
$wsDir = $null
$paths = @("E:\\Windsurf","C:\\Program Files\\Windsurf","$env:LOCALAPPDATA\\Programs\\Windsurf","$env:LOCALAPPDATA\\Windsurf")
foreach($p in $paths){ if(Test-Path "$p\\Windsurf.exe"){ $wsDir = $p; break } }
if(-not $wsDir){ Write-Host "!!! NO WINDSURF INSTALL FOUND"; exit }
Write-Host "Install: $wsDir"

$extJs = "$wsDir\\resources\\app\\extensions\\windsurf\\dist\\extension.js"
$wbJs = "$wsDir\\resources\\app\\out\\vs\\workbench\\workbench.desktop.main.js"

Write-Host ""
Write-Host "=== extension.js ==="
if(Test-Path $extJs){
    $sz = [math]::Round((Get-Item $extJs).Length/1MB,2)
    Write-Host "  Size: ${sz}MB  Modified: $((Get-Item $extJs).LastWriteTime)"
    $content = Get-Content $extJs -Raw -EA SilentlyContinue
    # Check known patches
    $patches = @(
        @{ name="POOL_HOT_PATCH_V1"; pattern="_pool_apikey" },
        @{ name="FP_ROTATE_V1"; pattern="_fp_salt" },
        @{ name="randomBytes_fallback"; pattern="crypto.randomBytes" },
        @{ name="WAM_MARKER"; pattern="__wam" }
    )
    foreach($patch in $patches){
        if($content -match [regex]::Escape($patch.pattern)){ Write-Host "  PATCH $($patch.name): ACTIVE" }
        else { Write-Host "  PATCH $($patch.name): NOT FOUND" }
    }
    # Check backups
    $baks = Get-ChildItem (Split-Path $extJs) -Filter "extension.js.backup*" -EA SilentlyContinue
    Write-Host "  Backups: $($baks.Count)"
    $baks | ForEach-Object { Write-Host "    $($_.Name) $([math]::Round($_.Length/1MB,2))MB $($_.LastWriteTime)" }
} else { Write-Host "  NOT FOUND at $extJs" }

Write-Host ""
Write-Host "=== workbench.desktop.main.js ==="
if(Test-Path $wbJs){
    $sz = [math]::Round((Get-Item $wbJs).Length/1MB,2)
    Write-Host "  Size: ${sz}MB  Modified: $((Get-Item $wbJs).LastWriteTime)"
    $content = [System.IO.File]::ReadAllText($wbJs)
    $patches = @(
        @{ name="GBe_RateLimit_Silent"; pattern="__wamRateLimit" },
        @{ name="P1_hasCapacity_bypass"; pattern="!1&&!tu.hasCapacity" },
        @{ name="P2_hasCapacity_bypass"; pattern="!1&&!Ru.hasCapacity" },
        @{ name="FP2_fingerprint_obfuscate"; pattern="__h*33^fp" },
        @{ name="MODEL_SWE_1_6"; pattern="MODEL_SWE_1_6" }
    )
    foreach($patch in $patches){
        if($content.Contains($patch.pattern)){ Write-Host "  PATCH $($patch.name): ACTIVE" }
        else { Write-Host "  PATCH $($patch.name): NOT FOUND" }
    }
    $baks = Get-ChildItem (Split-Path $wbJs) -Filter "workbench.desktop.main.js.bak*" -EA SilentlyContinue
    Write-Host "  Backups: $($baks.Count)"
    $baks | ForEach-Object { Write-Host "    $($_.Name) $([math]::Round($_.Length/1MB,2))MB $($_.LastWriteTime)" }
} else { Write-Host "  NOT FOUND at $wbJs" }

Write-Host ""
Write-Host "=== product.json integrity ==="
$prodJson = "$wsDir\\resources\\app\\product.json"
if(Test-Path $prodJson){
    $pj = Get-Content $prodJson -Raw | ConvertFrom-Json
    Write-Host "  commit: $($pj.commit)"
    Write-Host "  date: $($pj.date)"
    Write-Host "  checksums entries: $(if($pj.checksums){($pj.checksums | Get-Member -MemberType NoteProperty).Count}else{'NONE'})"
}
''', 45)

# ═══════════════════════════════════════════════════════════════
# L3: 进程与日志层
# ═══════════════════════════════════════════════════════════════
section("L3: 进程与日志层诊断")

section("L3.1: Windsurf进程树 + TCP连接", 1)
run_diag("processes", '''
Write-Host "=== WINDSURF PROCESSES ==="
$wsProcs = Get-Process Windsurf*,language_server* -EA SilentlyContinue
if($wsProcs){
    $wsProcs | Sort WorkingSet64 -Desc | ForEach-Object {
        Write-Host ("  {0,-40} PID={1,-7} WS={2}MB CPU={3}s" -f $_.ProcessName,$_.Id,[math]::Round($_.WorkingSet64/1MB,1),[math]::Round($_.TotalProcessorTime.TotalSeconds,1))
    }
    Write-Host "  TOTAL: $([math]::Round(($wsProcs | Measure-Object -Property WorkingSet64 -Sum).Sum/1GB,2))GB ($($wsProcs.Count) processes)"
    Write-Host ""
    Write-Host "=== ACTIVE TCP CONNECTIONS (Windsurf) ==="
    $wsPids = $wsProcs.Id
    $conns = Get-NetTCPConnection -OwningProcess $wsPids -EA SilentlyContinue | Where-Object { $_.RemotePort -ne 0 }
    $conns | Group-Object { "$($_.RemoteAddress):$($_.RemotePort)" } | Sort Count -Desc | Select -First 20 | ForEach-Object {
        $sample = $_.Group[0]
        Write-Host "  $($_.Name) x$($_.Count) State=$($sample.State)"
    }
    Write-Host ""
    Write-Host "=== TCP STATES SUMMARY ==="
    $conns | Group-Object State | ForEach-Object { Write-Host "  $($_.Name): $($_.Count)" }
    Write-Host ""
    Write-Host "=== CONNECTIONS TO 127.0.0.1 (proxy traffic) ==="
    $localConns = $conns | Where-Object { $_.RemoteAddress -eq "127.0.0.1" }
    $localConns | Group-Object RemotePort | Sort Count -Desc | Select -First 5 | ForEach-Object {
        Write-Host "  127.0.0.1:$($_.Name) x$($_.Count)"
    }
} else {
    Write-Host "  !!! NO WINDSURF PROCESSES RUNNING"
}
''', 20)

section("L3.2: 最新日志错误", 1)
run_diag("logs", '''
$logDir = "$env:APPDATA\\Windsurf\\logs"
$latest = Get-ChildItem $logDir -Directory -EA SilentlyContinue | Sort Name -Desc | Select -First 1
if(-not $latest){ Write-Host "NO LOG DIR"; exit }
Write-Host "Latest session: $($latest.Name)"

# Main log
$mainLog = Get-ChildItem $latest.FullName -Recurse -Filter "Windsurf.log" -EA SilentlyContinue | Select -First 1
if($mainLog){
    Write-Host ""
    Write-Host "=== MAIN LOG (last 100 lines with errors) ==="
    $content = Get-Content $mainLog.FullName -Tail 300 -EA SilentlyContinue
    $errors = $content | Where-Object { $_ -match "\\[error\\]|ERR_|timeout|ECONNREF|ECONNRESET|ENOTFOUND|socket hang up|rate.limit|rate_limit|quota|unauthorized|403|401|aborted" }
    Write-Host "Error lines: $($errors.Count) / 300"
    $errors | Select -Last 30 | ForEach-Object { Write-Host $_.Substring(0, [math]::Min($_.Length, 250)) }
}

# exthost log
$exthostLog = Get-ChildItem $latest.FullName -Recurse -Filter "exthost.log" -EA SilentlyContinue | Select -First 1
if($exthostLog){
    Write-Host ""
    Write-Host "=== EXTHOST LOG (last errors) ==="
    $content = Get-Content $exthostLog.FullName -Tail 200 -EA SilentlyContinue
    $errors = $content | Where-Object { $_ -match "error|Error|ERR|ConnectError|ECONN|socket hang up|rate.limit|aborted|unauthorized|timeout" }
    Write-Host "Error lines: $($errors.Count) / 200"
    $errors | Select -Last 20 | ForEach-Object { Write-Host $_.Substring(0, [math]::Min($_.Length, 250)) }
}

# renderer log
$rendererLog = Get-ChildItem $latest.FullName -Recurse -Filter "renderer*.log" -EA SilentlyContinue | Sort Length -Desc | Select -First 1
if($rendererLog){
    Write-Host ""
    Write-Host "=== RENDERER LOG (last errors) ==="
    $content = Get-Content $rendererLog.FullName -Tail 200 -EA SilentlyContinue
    $errors = $content | Where-Object { $_ -match "error|Error|ERR|ConnectError|ECONN|socket hang up|rate.limit|aborted|unauthorized|timeout|127\\.0\\.0\\.1" }
    Write-Host "Error lines: $($errors.Count) / 200"
    $errors | Select -Last 20 | ForEach-Object { Write-Host $_.Substring(0, [math]::Min($_.Length, 250)) }
}
''', 30)

# ═══════════════════════════════════════════════════════════════
# L4: 指纹与身份层
# ═══════════════════════════════════════════════════════════════
section("L4: 指纹与身份层诊断")

section("L4.1: Installation ID / Fingerprint salt / Telemetry", 1)
run_diag("identity", '''
Write-Host "=== INSTALLATION ID ==="
$instId = "$env:USERPROFILE\\.codeium\\windsurf\\installation_id"
if(Test-Path $instId){ Write-Host "  FILE: $(Get-Content $instId -Raw)" }
else { Write-Host "  NOT FOUND (default behavior)" }

Write-Host ""
Write-Host "=== FP SALT ==="
$fpSalt = "$env:APPDATA\\Windsurf\\_fp_salt.txt"
if(Test-Path $fpSalt){
    $salt = Get-Content $fpSalt -Raw
    Write-Host "  SALT: $($salt.Trim()) (len=$($salt.Trim().Length))"
    Write-Host "  Modified: $((Get-Item $fpSalt).LastWriteTime)"
} else { Write-Host "  NOT FOUND (no salt rotation)" }

Write-Host ""
Write-Host "=== POOL APIKEY ==="
$poolKey = "$env:APPDATA\\Windsurf\\_pool_apikey.txt"
if(Test-Path $poolKey){
    $key = Get-Content $poolKey -Raw
    Write-Host "  KEY: $($key.Trim().Substring(0,[math]::Min($key.Trim().Length,30)))..."
} else { Write-Host "  NOT FOUND" }

Write-Host ""
Write-Host "=== STORAGE.JSON (telemetry IDs) ==="
$sj = "$env:APPDATA\\Windsurf\\User\\globalStorage\\storage.json"
if(Test-Path $sj){
    try {
        $s = Get-Content $sj -Raw | ConvertFrom-Json
        Write-Host "  telemetry.machineId: $($s.'telemetry.machineId')"
        Write-Host "  telemetry.macMachineId: $($s.'telemetry.macMachineId')"
        Write-Host "  telemetry.sqmId: $($s.'telemetry.sqmId')"
        Write-Host "  telemetry.devDeviceId: $($s.'telemetry.devDeviceId')"
    } catch { Write-Host "  (parse error)" }
} else { Write-Host "  NOT FOUND" }

Write-Host ""
Write-Host "=== ACTIVE ACCOUNT MARKER ==="
$marker = "$env:APPDATA\\Windsurf\\_active_account.txt"
if(Test-Path $marker){ Write-Host "  $(Get-Content $marker -Raw)" }
else { Write-Host "  NOT FOUND" }

Write-Host ""
Write-Host "=== ACCOUNT FINGERPRINTS ==="
$afp = "$env:APPDATA\\Windsurf\\_account_fingerprints.json"
if(-not (Test-Path $afp)){ $afp = Get-ChildItem "$env:USERPROFILE" -Recurse -Filter "_account_fingerprints.json" -Depth 3 -EA SilentlyContinue | Select -First 1 }
if($afp -and (Test-Path $afp)){
    $content = Get-Content $afp -Raw
    Write-Host "  $($content.Substring(0,[math]::Min($content.Length,500)))"
} else { Write-Host "  NOT FOUND" }
''', 30)

section("L4.2: Go Binary (language_server) patch状态", 1)
run_diag("go_binary", '''
$wsDir = $null
$paths = @("E:\\Windsurf","C:\\Program Files\\Windsurf","$env:LOCALAPPDATA\\Programs\\Windsurf","$env:LOCALAPPDATA\\Windsurf")
foreach($p in $paths){ if(Test-Path "$p\\Windsurf.exe"){ $wsDir = $p; break } }
if(-not $wsDir){ Write-Host "!!! NO WINDSURF"; exit }

$goBin = "$wsDir\\resources\\app\\extensions\\windsurf\\bin\\language_server_windows_x64.exe"
if(-not (Test-Path $goBin)){ Write-Host "!!! GO BINARY NOT FOUND"; exit }

$sz = [math]::Round((Get-Item $goBin).Length/1MB,1)
Write-Host "Go binary: $goBin"
Write-Host "  Size: ${sz}MB  Modified: $((Get-Item $goBin).LastWriteTime)"

# Check binary patches
$bytes = [System.IO.File]::ReadAllBytes($goBin)
$text = [System.Text.Encoding]::ASCII.GetString($bytes)

$checks = @(
    @{ name="HARDWARE_PATCH (CentralProcessor\\9)"; pattern="CentralProcessor\\9"; patched=$true },
    @{ name="HARDWARE_ORIG (CentralProcessor\\0)"; pattern="CentralProcessor\\0"; patched=$false },
    @{ name="SOURCE_ADDR_PATCH (bytes,99,opt,name=source_address)"; pattern="bytes,99,opt,name=source_address"; patched=$true },
    @{ name="SOURCE_ADDR_ORIG (bytes,11,opt,name=source_address)"; pattern="bytes,11,opt,name=source_address"; patched=$false },
    @{ name="FP_ANALYTICS_PATCH (bytes,98,opt,name=device_fingerprint)"; pattern="bytes,98,opt,name=device_fingerprint"; patched=$true },
    @{ name="FP_ANALYTICS_ORIG (bytes,24,opt,name=device_fingerprint)"; pattern="bytes,24,opt,name=device_fingerprint"; patched=$false },
    @{ name="FP_METADATA_PATCH (bytes,97,opt,name=device_fingerprint)"; pattern="bytes,97,opt,name=device_fingerprint"; patched=$true },
    @{ name="FP_METADATA_ORIG (bytes,12,opt,name=device_fingerprint)"; pattern="bytes,12,opt,name=device_fingerprint"; patched=$false }
)
foreach($c in $checks){
    if($text.Contains($c.pattern)){
        $label = if($c.patched){"PATCHED"}else{"ORIGINAL"}
        Write-Host "  $($c.name): FOUND [$label]"
    }
}

# Check backup
$baks = Get-ChildItem (Split-Path $goBin) -Filter "*.bak*" -EA SilentlyContinue
Write-Host "  Backups: $($baks.Count)"
$baks | ForEach-Object { Write-Host "    $($_.Name) $([math]::Round($_.Length/1MB,1))MB" }
''', 45)

# ═══════════════════════════════════════════════════════════════
# L5: 登录与账号层
# ═══════════════════════════════════════════════════════════════
section("L5: 登录与账号层诊断")

section("L5.1: WAM扩展状态", 1)
run_diag("wam", '''
Write-Host "=== WAM EXTENSION ==="
$wamDir = "$env:USERPROFILE\\.windsurf\\extensions"
$wams = Get-ChildItem $wamDir -Directory -Filter "*login-helper*" -EA SilentlyContinue
$wams | ForEach-Object {
    Write-Host "  $($_.Name) $([math]::Round((Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum/1MB,1))MB"
}
Write-Host ""
Write-Host "=== WAM DATA FILES ==="
$wamData = "$env:APPDATA\\Windsurf\\_wam"
if(Test-Path $wamData){
    Get-ChildItem $wamData -File -EA SilentlyContinue | ForEach-Object {
        Write-Host "  $($_.Name) $([math]::Round($_.Length/1KB,1))KB $($_.LastWriteTime)"
    }
    # accounts count
    $accFile = "$wamData\\accounts.json"
    if(Test-Path $accFile){
        try {
            $accs = Get-Content $accFile -Raw | ConvertFrom-Json
            $count = if($accs.accounts){ $accs.accounts.Count }else{ 0 }
            Write-Host "  ACCOUNTS: $count"
            if($accs.activeIndex -ne $null){ Write-Host "  activeIndex: $($accs.activeIndex)" }
        } catch { Write-Host "  (accounts parse error)" }
    }
    # mode
    $modeFile = "$wamData\\wam_mode.json"
    if(Test-Path $modeFile){
        $mode = Get-Content $modeFile -Raw
        Write-Host "  MODE: $mode"
    }
    # result
    $resFile = "$wamData\\switch_result.json"
    if(Test-Path $resFile){
        $res = Get-Content $resFile -Raw
        Write-Host "  LAST SWITCH: $($res.Substring(0,[math]::Min($res.Length,200)))"
    }
    # token cache
    $tcFile = "$wamData\\_token_cache.json"
    if(Test-Path $tcFile){
        $tc = Get-Content $tcFile -Raw | ConvertFrom-Json -EA SilentlyContinue
        if($tc){
            $valid = 0; $expired = 0; $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            $tc.PSObject.Properties | ForEach-Object {
                $exp = $_.Value.expiresAt
                if($exp -gt $now){ $valid++ }else{ $expired++ }
            }
            Write-Host "  TOKEN CACHE: $valid valid, $expired expired, $($valid+$expired) total"
        }
    }
} else { Write-Host "  WAM DATA DIR NOT FOUND" }
''', 30)

section("L5.2: Firebase 直接连通性测试", 1)
run_diag("firebase", '''
Write-Host "=== FIREBASE AUTH ENDPOINTS ==="
$endpoints = @(
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyB2dUNlGxmqqfi2nPLBAdFCEnk7JH-3jOY",
    "https://securetoken.googleapis.com/v1/token?key=AIzaSyB2dUNlGxmqqfi2nPLBAdFCEnk7JH-3jOY"
)
foreach($ep in $endpoints){
    try {
        $uri = [System.Uri]$ep
        Write-Host "Testing $($uri.Host)$($uri.AbsolutePath) ..."
        # Just do a GET to see if reachable (will get 400 but that means reachable)
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "WindsurfDiag/1.0")
        try { $wc.DownloadString($ep) } catch {
            $inner = $_.Exception.InnerException
            if($inner -is [System.Net.WebException]){
                $resp = $inner.Response
                if($resp){
                    $code = [int]$resp.StatusCode
                    Write-Host "  HTTP $code (reachable!)"
                } else {
                    Write-Host "  NETWORK ERROR: $($inner.Message)"
                }
            } else {
                Write-Host "  ERROR: $($_.Exception.Message)"
            }
        }
    } catch { Write-Host "  EXCEPTION: $($_.Exception.Message)" }
}

Write-Host ""
Write-Host "=== CODEIUM gRPC ENDPOINTS ==="
$grpcEndpoints = @(
    @{ host="server.codeium.com"; port=443 },
    @{ host="inference.codeium.com"; port=443 },
    @{ host="api.codeium.com"; port=443 },
    @{ host="register.windsurf.com"; port=443 }
)
foreach($ep in $grpcEndpoints){
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $task = $tcp.ConnectAsync($ep.host, $ep.port)
        if($task.Wait(5000)){
            if($tcp.Connected){ Write-Host "  TCP OK: $($ep.host):$($ep.port)"; $tcp.Close() }
            else { Write-Host "  TCP FAIL: $($ep.host):$($ep.port) (not connected)" }
        } else {
            Write-Host "  TCP TIMEOUT: $($ep.host):$($ep.port) (5s)"
            $tcp.Dispose()
        }
    } catch {
        Write-Host "  TCP ERROR: $($ep.host):$($ep.port) $($_.Exception.Message)"
    }
}
''', 30)

# ═══════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════
section("DIAGNOSIS SUMMARY")
print(f"\nTotal diagnostics run: {len(results)}")
print(f"Failed diagnostics: {sum(1 for v in results.values() if '[ERROR]' in v or '[TIMEOUT' in v)}")
print("\n=== KEY FINDINGS ===")

# Auto-analyze key results
for name, result in results.items():
    if "[ERROR]" in result:
        print(f"  !!! {name}: COMMUNICATION ERROR")
    elif "POISONED" in result:
        print(f"  !!! {name}: HOSTS FILE POISONED")
    elif "BLOCKED" in result:
        print(f"  !!! {name}: DNS BLOCKED")
    elif "CORRUPTED" in result:
        print(f"  !!! {name}: DATABASE CORRUPTED")
    elif "NOT FOUND" in result and name in ("ws_config",):
        print(f"  !!! {name}: WINDSURF NOT FOUND")
    elif "FAIL-DIRECT" in result and "google.com" in result:
        print(f"  ??? {name}: DIRECT CONNECTION ISSUES (GFW?)")

print("\n" + "="*70)
print("  FULL DIAGNOSIS COMPLETE — 道法自然")
print("="*70)
