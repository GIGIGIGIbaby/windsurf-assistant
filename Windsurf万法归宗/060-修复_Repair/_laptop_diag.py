#!/usr/bin/env python3
"""Laptop LAPTOP-AKCGC7BM deep diagnosis via ps-agent relay."""
import urllib.request, json, ssl, sys, time
sys.stdout.reconfigure(line_buffering=True)

BASE = 'https://aiotvr.xyz/ps-agent'
TOKEN = 'dao-ps-agent-2026'
AGENT = 'LAPTOP-AKCGC7BM'
CTX = ssl.create_default_context()

def exec_sync(cmd, timeout=60):
    """Execute PowerShell command on laptop, wait for result."""
    body = json.dumps({'agent_id': AGENT, 'cmd': cmd, 'timeout': timeout}).encode()
    req = urllib.request.Request(f'{BASE}/api/exec-sync', data=body, method='POST')
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Content-Type', 'application/json')
    try:
        r = urllib.request.urlopen(req, timeout=timeout+10, context=CTX)
        d = json.loads(r.read())
        if d.get('status') == 'completed':
            res = d['result']
            return res.get('stdout', res.get('output', json.dumps(res)))
        return f"[TIMEOUT/PENDING] {json.dumps(d)}"
    except Exception as e:
        return f"[ERROR] {e}"

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

# ═══════════════════════════════════════
# 1. 系统全景
# ═══════════════════════════════════════
section("1. 系统全景 (CPU/RAM/磁盘/启动时间)")
print(exec_sync('''
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select -First 1
$usedPct = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize * 100, 1)
Write-Host "=== SYSTEM ==="
Write-Host "Hostname: $env:COMPUTERNAME"
Write-Host "User: $env:USERNAME"
Write-Host "OS: $($os.Caption) $($os.Version)"
Write-Host "CPU: $($cpu.Name) Cores=$($cpu.NumberOfCores) Threads=$($cpu.NumberOfLogicalProcessors) Load=$($cpu.LoadPercentage)%"
Write-Host "RAM: $([math]::Round($os.TotalVisibleMemorySize/1MB,1))GB Total, $([math]::Round($os.FreePhysicalMemory/1MB,1))GB Free, ${usedPct}% Used"
Write-Host "Boot: $($os.LastBootUpTime)"
Write-Host "Uptime: $((Get-Date)-$os.LastBootUpTime)"
Write-Host "Processes: $((Get-Process).Count)"
Write-Host ""
Write-Host "=== DISK ==="
Get-Volume | Where-Object {$_.DriveLetter} | Sort DriveLetter | %{
    $pct = if($_.Size -gt 0){ [math]::Round(($_.Size-$_.SizeRemaining)/$_.Size*100,0) } else { 0 }
    Write-Host ("  {0}: {1}GB total, {2}GB free ({3}% used)" -f $_.DriveLetter,[math]::Round($_.Size/1GB,1),[math]::Round($_.SizeRemaining/1GB,1),$pct)
}
Write-Host ""
Write-Host "=== TOP 20 PROCESSES by MEM ==="
Get-Process | Sort WorkingSet64 -Desc | Select -First 20 | %{
    Write-Host ("  {0,-35} PID={1,-7} WS={2}MB CPU={3}s" -f $_.ProcessName,$_.Id,[math]::Round($_.WorkingSet64/1MB,1),[math]::Round($_.TotalProcessorTime.TotalSeconds,1))
}
''', 30))

# ═══════════════════════════════════════
# 2. Windsurf 进程详细
# ═══════════════════════════════════════
section("2. Windsurf 进程详细审计")
print(exec_sync('''
Write-Host "=== WINDSURF PROCESSES ==="
$wsProcs = Get-Process Windsurf*,language_server* -EA SilentlyContinue
$wsProcs | Sort WorkingSet64 -Desc | %{
    Write-Host ("  {0,-40} PID={1,-7} WS={2}MB CPU={3}s Handles={4} Threads={5}" -f $_.ProcessName,$_.Id,[math]::Round($_.WorkingSet64/1MB,1),[math]::Round($_.TotalProcessorTime.TotalSeconds,1),$_.HandleCount,$_.Threads.Count)
}
$totalMem = [math]::Round(($wsProcs | Measure-Object -Property WorkingSet64 -Sum).Sum/1GB,2)
Write-Host "---TOTAL: ${totalMem}GB ($($wsProcs.Count) processes)---"
Write-Host ""
Write-Host "=== WINDSURF VERSION ==="
$pj = (Get-Process Windsurf -EA SilentlyContinue | Select -First 1).Path
if($pj){
    Write-Host "EXE: $pj"
    $dir = Split-Path $pj
    $pkg = Join-Path $dir "resources\\app\\package.json"
    if(Test-Path $pkg){ $j = Get-Content $pkg -Raw | ConvertFrom-Json; Write-Host "VERSION: $($j.version)" }
    $prod = Join-Path $dir "resources\\app\\product.json"
    if(Test-Path $prod){ $p = Get-Content $prod -Raw | ConvertFrom-Json; Write-Host "commit: $($p.commit)"; Write-Host "date: $($p.date)" }
}
Write-Host ""
Write-Host "=== LANGUAGE SERVER CMDLINE ==="
Get-Process language_server* -EA SilentlyContinue | %{
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -EA SilentlyContinue).CommandLine
    Write-Host "PID=$($_.Id) WS=$([math]::Round($_.WorkingSet64/1MB,1))MB VM=$([math]::Round($_.VirtualMemorySize64/1MB,1))MB"
    if($cmd){ Write-Host "  CMD: $($cmd.Substring(0,[math]::Min($cmd.Length,300)))" }
}
''', 30))

# ═══════════════════════════════════════
# 3. state.vscdb / 崩溃 / 日志
# ═══════════════════════════════════════
section("3. state.vscdb / 崩溃记录 / 日志错误")
print(exec_sync('''
Write-Host "=== STATE DB ==="
$stateDb = "$env:APPDATA\\Windsurf\\User\\globalStorage\\state.vscdb"
if(Test-Path $stateDb){ Write-Host "state.vscdb: $([math]::Round((Get-Item $stateDb).Length/1MB,1))MB  LastWrite: $((Get-Item $stateDb).LastWriteTime)" }
$bk = "$env:APPDATA\\Windsurf\\User\\globalStorage\\state.vscdb.backup"
if(Test-Path $bk){ Write-Host "backup: $([math]::Round((Get-Item $bk).Length/1MB,1))MB" }
Write-Host ""
Write-Host "=== CRASH DUMPS ==="
$crashDir = "$env:APPDATA\\Windsurf\\Crashpad"
if(Test-Path $crashDir){
    $dumps = Get-ChildItem $crashDir -Recurse -File -EA SilentlyContinue | Sort LastWriteTime -Desc | Select -First 10
    $dumps | %{ Write-Host "  $($_.Name) $([math]::Round($_.Length/1MB,1))MB $($_.LastWriteTime)" }
    Write-Host "Total dumps: $((Get-ChildItem $crashDir -Recurse -File -EA SilentlyContinue).Count)"
}
Write-Host ""
Write-Host "=== RECENT LOG ERRORS ==="
$logDir = "$env:APPDATA\\Windsurf\\logs"
$latest = Get-ChildItem $logDir -Directory -EA SilentlyContinue | Sort LastWriteTime -Desc | Select -First 1
if($latest){
    Write-Host "Latest session: $($latest.Name)"
    $mainLogs = Get-ChildItem $latest.FullName -File -Filter "Windsurf.log" -Recurse | Sort Length -Desc
    if($mainLogs.Count -gt 0){
        $content = Get-Content $mainLogs[0].FullName -Tail 200 -EA SilentlyContinue
        $errors = $content | Where-Object { $_ -match "\\[error\\]|ENOSPC|OOM|heap|memory.pressure|ENOMEM|throttl|rate.limit|ERR_|timeout|slow.query|crash|SIGTERM|SIGKILL|out.of.memory" }
        Write-Host "Error lines: $($errors.Count)"
        $errors | Select -Last 10 | %{ Write-Host $_.Substring(0, [math]::Min($_.Length, 200)) }
    }
}
''', 30))

# ═══════════════════════════════════════
# 4. 扩展 / Login Helper / MCP
# ═══════════════════════════════════════
section("4. 扩展 / Login Helper / MCP配置")
print(exec_sync('''
Write-Host "=== EXTENSIONS ==="
$extDir = "$env:USERPROFILE\\.windsurf\\extensions"
if(Test-Path $extDir){
    $exts = Get-ChildItem $extDir -Directory
    Write-Host "Count: $($exts.Count)"
    $exts | Sort { (Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum } -Desc | Select -First 15 | %{
        $sz = [math]::Round((Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum/1MB,1)
        Write-Host "  $($_.Name) ${sz}MB"
    }
}
Write-Host ""
Write-Host "=== LOGIN HELPER VERSIONS ==="
Get-ChildItem $extDir -Directory -Filter "*login-helper*" -EA SilentlyContinue | %{ Write-Host "  $($_.Name)" }
Write-Host ""
Write-Host "=== MCP CONFIG ==="
$mcp = "$env:USERPROFILE\\.windsurf\\mcp.json"
if(Test-Path $mcp){ Write-Host "mcp.json exists: $([math]::Round((Get-Item $mcp).Length/1KB,1))KB"; Get-Content $mcp -Raw | Select -First 1 | %{ Write-Host $_.Substring(0,[math]::Min($_.Length,500)) } }
else { Write-Host "NO mcp.json" }
''', 30))

# ═══════════════════════════════════════
# 5. .windsurf / worktrees / Git
# ═══════════════════════════════════════
section("5. .windsurf空间 / worktrees / Git仓库")
print(exec_sync('''
Write-Host "=== .windsurf SIZE ==="
$wsDir = "$env:USERPROFILE\\.windsurf"
Get-ChildItem $wsDir -Directory -EA SilentlyContinue | %{
    $sz = (Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum
    if($sz -gt 1MB){ Write-Host ("  {0,-50} {1}GB" -f $_.Name, [math]::Round($sz/1GB,2)) }
}
Write-Host ""
Write-Host "=== C: LARGEST USER DIRS ==="
Get-ChildItem "$env:USERPROFILE" -Directory -EA SilentlyContinue | %{
    $sz = (Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum
    if($sz -gt 100MB){ Write-Host ("  {0,-40} {1}GB" -f $_.Name, [math]::Round($sz/1GB,2)) }
}
Write-Host ""
Write-Host "=== WORKSPACE STORAGE ==="
$wsStorage = "$env:APPDATA\\Windsurf\\User\\workspaceStorage"
if(Test-Path $wsStorage){
    $wsDirs = Get-ChildItem $wsStorage -Directory -EA SilentlyContinue
    Write-Host "Workspace storage folders: $($wsDirs.Count)"
    $totalWs = 0
    $wsDirs | %{ $s = (Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum; $totalWs += $s; if($s -gt 10MB){ Write-Host ("  {0} {1}MB" -f $_.Name, [math]::Round($s/1MB,1)) } }
    Write-Host "Total workspace storage: $([math]::Round($totalWs/1MB,1))MB"
}
''', 60))

# ═══════════════════════════════════════
# 6. Windsurf Settings
# ═══════════════════════════════════════
section("6. Windsurf Settings / 网络 / 代理")
print(exec_sync('''
Write-Host "=== WINDSURF SETTINGS ==="
$sf = "$env:APPDATA\\Windsurf\\User\\settings.json"
if(Test-Path $sf){ Get-Content $sf -Raw }
Write-Host ""
Write-Host "=== PROXY ==="
Write-Host "HTTP_PROXY: $env:HTTP_PROXY"
Write-Host "HTTPS_PROXY: $env:HTTPS_PROXY"
Write-Host "NO_PROXY: $env:NO_PROXY"
Write-Host ""
Write-Host "=== FIREWALL WINDSURF RULES ==="
Get-NetFirewallRule -EA SilentlyContinue | Where-Object { $_.DisplayName -match "Windsurf|windsurf" } | %{
    Write-Host "  $($_.DisplayName) | Action=$($_.Action) | Direction=$($_.Direction) | Enabled=$($_.Enabled)"
} 
Write-Host ""
Write-Host "=== ACTIVE TCP (Windsurf) ==="
$wsPids = (Get-Process Windsurf -EA SilentlyContinue).Id
if($wsPids){
    Get-NetTCPConnection -OwningProcess $wsPids -EA SilentlyContinue | Where-Object { $_.RemotePort -ne 0 } | Group-Object RemotePort | Sort Count -Desc | Select -First 10 | %{
        Write-Host "  Port $($_.Name): $($_.Count) connections"
    }
}
''', 30))

# ═══════════════════════════════════════
# 7. Git进程 / 温度 / 电池
# ═══════════════════════════════════════
section("7. Git进程 / Pagefile / 电池")
print(exec_sync('''
Write-Host "=== GIT PROCESSES ==="
Get-Process git -EA SilentlyContinue | %{
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -EA SilentlyContinue).CommandLine
    Write-Host ("  PID={0} WS={1}MB CPU={2}s" -f $_.Id,[math]::Round($_.WorkingSet64/1MB,1),[math]::Round($_.TotalProcessorTime.TotalSeconds,1))
    if($cmd){ Write-Host "    CMD: $($cmd.Substring(0,[math]::Min($cmd.Length,200)))" }
}
Write-Host ""
Write-Host "=== PAGEFILE ==="
Get-CimInstance Win32_PageFileUsage -EA SilentlyContinue | %{
    Write-Host "  $($_.Name) Alloc=$($_.AllocatedBaseSize)MB Current=$($_.CurrentUsage)MB Peak=$($_.PeakUsage)MB"
}
Write-Host ""
Write-Host "=== BATTERY ==="
$bat = Get-CimInstance Win32_Battery -EA SilentlyContinue
if($bat){ Write-Host "  Charge: $($bat.EstimatedChargeRemaining)% Status: $($bat.BatteryStatus)" }
else { Write-Host "  No battery / AC power" }
Write-Host ""
Write-Host "=== STARTUP APPS (Windsurf related) ==="
Get-CimInstance Win32_StartupCommand -EA SilentlyContinue | Where-Object { $_.Name -match "Windsurf|windsurf|WAM|wam" } | %{
    Write-Host "  $($_.Name): $($_.Command)"
}
''', 30))

print("\n" + "="*60)
print("  DIAGNOSIS COMPLETE")
print("="*60)
