#!/usr/bin/env python3
"""Laptop deep diagnosis - short commands via ps-agent."""
import urllib.request, json, ssl, sys, time
sys.stdout.reconfigure(line_buffering=True)

BASE = 'https://aiotvr.xyz/ps-agent'
TOKEN = 'dao-ps-agent-2026'
AGENT = 'LAPTOP-AKCGC7BM'
CTX = ssl.create_default_context()

def exec_cmd(cmd, timeout=90):
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
        return f"[TIMEOUT] {d.get('status')}"
    except Exception as e:
        return f"[ERROR] {e}"

def run(title, cmd, timeout=90):
    print(f"\n{'='*60}\n  {title}\n{'='*60}")
    print(exec_cmd(cmd, timeout))

# ─── 1. System overview ───
run("1. SYSTEM OVERVIEW", '''
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select -First 1
$usedPct = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize * 100, 1)
"Hostname: $env:COMPUTERNAME"
"User: $env:USERNAME"
"OS: $($os.Caption) $($os.Version)"
"CPU: $($cpu.Name) Load=$($cpu.LoadPercentage)%"
"RAM: $([math]::Round($os.TotalVisibleMemorySize/1MB,1))GB Total, $([math]::Round($os.FreePhysicalMemory/1MB,1))GB Free, ${usedPct}% Used"
"Boot: $($os.LastBootUpTime)"
"Uptime: $((Get-Date)-$os.LastBootUpTime)"
"Processes: $((Get-Process).Count)"
''')

# ─── 2. Disk ───
run("2. DISK", '''
Get-Volume | Where-Object {$_.DriveLetter} | Sort DriveLetter | %{
    $pct = if($_.Size -gt 0){ [math]::Round(($_.Size-$_.SizeRemaining)/$_.Size*100,0) } else { 0 }
    "{0}: {1}GB total, {2}GB free ({3}% used)" -f $_.DriveLetter,[math]::Round($_.Size/1GB,1),[math]::Round($_.SizeRemaining/1GB,1),$pct
}
''')

# ─── 3. Top processes ───
run("3. TOP 20 PROCESSES by RAM", '''
Get-Process | Sort WorkingSet64 -Desc | Select -First 20 | %{
    "{0,-35} PID={1,-7} WS={2}MB CPU={3}s" -f $_.ProcessName,$_.Id,[math]::Round($_.WorkingSet64/1MB,1),[math]::Round($_.TotalProcessorTime.TotalSeconds,1)
}
''')

# ─── 4. Windsurf processes ───
run("4. WINDSURF PROCESSES", '''
$wsProcs = Get-Process Windsurf*,language_server* -EA SilentlyContinue
$wsProcs | Sort WorkingSet64 -Desc | %{
    "{0,-40} PID={1,-7} WS={2}MB CPU={3}s H={4}" -f $_.ProcessName,$_.Id,[math]::Round($_.WorkingSet64/1MB,1),[math]::Round($_.TotalProcessorTime.TotalSeconds,1),$_.HandleCount
}
$t = [math]::Round(($wsProcs | Measure-Object -Property WorkingSet64 -Sum).Sum/1GB,2)
"---TOTAL: ${t}GB ($($wsProcs.Count) processes)---"
''')

# ─── 5. Windsurf version ───
run("5. WINDSURF VERSION", '''
$p = (Get-Process Windsurf -EA SilentlyContinue | Select -First 1).Path
if($p){
    "EXE: $p"
    $dir = Split-Path $p
    $pkg = Join-Path $dir "resources\\app\\package.json"
    if(Test-Path $pkg){ $j = Get-Content $pkg -Raw | ConvertFrom-Json; "VERSION: $($j.version)" }
    $prod = Join-Path $dir "resources\\app\\product.json"
    if(Test-Path $prod){ $pd = Get-Content $prod -Raw | ConvertFrom-Json; "commit: $($pd.commit)"; "date: $($pd.date)" }
}
''')

# ─── 6. state.vscdb ───
run("6. STATE DB & CRASHES", '''
$db = "$env:APPDATA\\Windsurf\\User\\globalStorage\\state.vscdb"
if(Test-Path $db){ "state.vscdb: $([math]::Round((Get-Item $db).Length/1MB,1))MB LastWrite=$((Get-Item $db).LastWriteTime)" }
$bk = "$env:APPDATA\\Windsurf\\User\\globalStorage\\state.vscdb.backup"
if(Test-Path $bk){ "backup: $([math]::Round((Get-Item $bk).Length/1MB,1))MB" }
""
"=== CRASH DUMPS ==="
$cd = "$env:APPDATA\\Windsurf\\Crashpad"
if(Test-Path $cd){
    Get-ChildItem $cd -Recurse -File -EA SilentlyContinue | Sort LastWriteTime -Desc | Select -First 5 | %{
        "  $($_.Name) $([math]::Round($_.Length/1MB,1))MB $($_.LastWriteTime)"
    }
    "Total crash files: $((Get-ChildItem $cd -Recurse -File -EA SilentlyContinue).Count)"
}
''')

# ─── 7. Log errors ───
run("7. WINDSURF LOG ERRORS (latest session)", '''
$logDir = "$env:APPDATA\\Windsurf\\logs"
$latest = Get-ChildItem $logDir -Directory -EA SilentlyContinue | Sort LastWriteTime -Desc | Select -First 1
if($latest){
    "Session: $($latest.Name)"
    $lf = Get-ChildItem $latest.FullName -File -Filter "Windsurf.log" -Recurse | Sort Length -Desc | Select -First 1
    if($lf){
        "Log size: $([math]::Round($lf.Length/1KB,1))KB"
        $c = Get-Content $lf.FullName -Tail 300 -EA SilentlyContinue
        $e = $c | Where-Object { $_ -match "\\[error\\]|OOM|heap|memory|ENOMEM|throttl|rate.limit|ERR_|timeout|crash|SIGTERM|freeze|hang|slow" }
        "Error lines: $($e.Count)"
        $e | Select -Last 15 | %{ $_.Substring(0, [math]::Min($_.Length, 250)) }
    }
}
''')

# ─── 8. Extensions ───
run("8. EXTENSIONS (top 15 by size)", '''
$ed = "$env:USERPROFILE\\.windsurf\\extensions"
if(Test-Path $ed){
    $exts = Get-ChildItem $ed -Directory
    "Count: $($exts.Count)"
    $exts | Sort { (Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum } -Desc | Select -First 15 | %{
        $sz = [math]::Round((Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum/1MB,1)
        "  $($_.Name) ${sz}MB"
    }
    ""
    "=== LOGIN HELPER ==="
    Get-ChildItem $ed -Directory -Filter "*login*" -EA SilentlyContinue | %{ "  $_" }
}
''')

# ─── 9. .windsurf size ───
run("9. .WINDSURF DIR BREAKDOWN", '''
$wd = "$env:USERPROFILE\\.windsurf"
Get-ChildItem $wd -Directory -EA SilentlyContinue | %{
    $sz = (Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum
    if($sz -gt 1MB){ "{0,-50} {1}GB" -f $_.Name, [math]::Round($sz/1GB,2) }
}
""
"=== WORKTREES ==="
$wt = "$env:USERPROFILE\\.windsurf\\worktrees"
if(Test-Path $wt){
    Get-ChildItem $wt -Directory -EA SilentlyContinue | %{
        $sz = (Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum
        "  {0}: {1}GB" -f $_.Name, [math]::Round($sz/1GB,2)
    }
} else { "  No worktrees dir" }
''', 120)

# ─── 10. Settings & proxy ───
run("10. WINDSURF SETTINGS", '''
$sf = "$env:APPDATA\\Windsurf\\User\\settings.json"
if(Test-Path $sf){ Get-Content $sf -Raw }
''')

# ─── 11. Network ───
run("11. PROXY & NETWORK", '''
"HTTP_PROXY: $env:HTTP_PROXY"
"HTTPS_PROXY: $env:HTTPS_PROXY"
""
"=== FIREWALL WINDSURF ==="
Get-NetFirewallRule -EA SilentlyContinue | Where-Object { $_.DisplayName -match "Windsurf|windsurf" } | Select -First 10 | %{
    "  $($_.DisplayName) Action=$($_.Action) Dir=$($_.Direction)"
}
""
"=== GIT PROCESSES ==="
Get-Process git -EA SilentlyContinue | %{
    "  PID=$($_.Id) WS=$([math]::Round($_.WorkingSet64/1MB,1))MB"
}
if(-not (Get-Process git -EA SilentlyContinue)){ "  No git processes" }
""
"=== PAGEFILE ==="
Get-CimInstance Win32_PageFileUsage -EA SilentlyContinue | %{
    "  $($_.Name) Alloc=$($_.AllocatedBaseSize)MB Current=$($_.CurrentUsage)MB"
}
''')

# ─── 12. MCP ───
run("12. MCP CONFIG", '''
$mcp = "$env:USERPROFILE\\.windsurf\\mcp.json"
if(Test-Path $mcp){ "mcp.json: $([math]::Round((Get-Item $mcp).Length/1KB,1))KB"; Get-Content $mcp -Raw }
else { "NO mcp.json found" }
''')

print("\n\n" + "="*60)
print("  ALL DIAGNOSIS COMPLETE")
print("="*60)
