#!/usr/bin/env python3
"""Quick targeted laptop diagnosis for missing sections."""
import urllib.request, json, ssl, sys, time
sys.stdout.reconfigure(line_buffering=True)

BASE = 'https://aiotvr.xyz/ps-agent'
TOKEN = 'dao-ps-agent-2026'
AGENT = 'LAPTOP-AKCGC7BM'
CTX = ssl.create_default_context()

def ex(cmd, timeout=90):
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
        return f"[TIMEOUT]"
    except Exception as e:
        return f"[ERROR] {e}"

def run(t, c, to=90):
    print(f"\n{'='*60}\n  {t}\n{'='*60}")
    print(ex(c, to))

# 1
run("SYSTEM", '$os=Get-CimInstance Win32_OperatingSystem; $cpu=Get-CimInstance Win32_Processor|Select -First 1; $u=[math]::Round(($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)/$os.TotalVisibleMemorySize*100,1); Write-Output "Host: $env:COMPUTERNAME | User: $env:USERNAME"; Write-Output "OS: $($os.Caption) $($os.Version)"; Write-Output "CPU: $($cpu.Name) Load=$($cpu.LoadPercentage)%"; Write-Output "RAM: $([math]::Round($os.TotalVisibleMemorySize/1MB,1))GB Total $([math]::Round($os.FreePhysicalMemory/1MB,1))GB Free ${u}% Used"; Write-Output "Boot: $($os.LastBootUpTime)"; Write-Output "Procs: $((Get-Process).Count)"')

# 2
run("DISK", 'Get-Volume | Where-Object {$_.DriveLetter} | Sort DriveLetter | ForEach-Object { $p=if($_.Size -gt 0){[math]::Round(($_.Size-$_.SizeRemaining)/$_.Size*100,0)}else{0}; Write-Output ("{0}: {1}GB total {2}GB free ({3}% used)" -f $_.DriveLetter,[math]::Round($_.Size/1GB,1),[math]::Round($_.SizeRemaining/1GB,1),$p) }')

# 3
run("TOP PROCESSES", 'Get-Process | Sort WorkingSet64 -Desc | Select -First 20 | ForEach-Object { Write-Output ("{0,-35} PID={1,-7} WS={2}MB" -f $_.ProcessName,$_.Id,[math]::Round($_.WorkingSet64/1MB,1)) }')

# 4
run("WINDSURF PROCS", '$ws=Get-Process Windsurf*,language_server* -EA SilentlyContinue; $ws | Sort WorkingSet64 -Desc | ForEach-Object { Write-Output ("{0,-40} PID={1,-7} WS={2}MB H={3}" -f $_.ProcessName,$_.Id,[math]::Round($_.WorkingSet64/1MB,1),$_.HandleCount) }; $t=[math]::Round(($ws|Measure-Object -Property WorkingSet64 -Sum).Sum/1GB,2); Write-Output "TOTAL: ${t}GB ($($ws.Count) procs)"')

# 5
run("WINDSURF VERSION + LS", '$p=(Get-Process Windsurf -EA SilentlyContinue|Select -First 1).Path; if($p){Write-Output "EXE: $p"; $d=Split-Path $p; $pk=Join-Path $d "resources\\app\\package.json"; if(Test-Path $pk){$j=Get-Content $pk -Raw|ConvertFrom-Json; Write-Output "VER: $($j.version)"}; $pr=Join-Path $d "resources\\app\\product.json"; if(Test-Path $pr){$pd=Get-Content $pr -Raw|ConvertFrom-Json; Write-Output "commit: $($pd.commit) date: $($pd.date)"}}; Get-Process language_server* -EA SilentlyContinue | ForEach-Object { Write-Output "LS PID=$($_.Id) WS=$([math]::Round($_.WorkingSet64/1MB,1))MB VM=$([math]::Round($_.VirtualMemorySize64/1MB,1))MB" }')

# 6
run("STATE DB + CRASHES", '$db="$env:APPDATA\\Windsurf\\User\\globalStorage\\state.vscdb"; if(Test-Path $db){Write-Output "state.vscdb: $([math]::Round((Get-Item $db).Length/1MB,1))MB LastWrite=$((Get-Item $db).LastWriteTime)"}; $bk="$env:APPDATA\\Windsurf\\User\\globalStorage\\state.vscdb.backup"; if(Test-Path $bk){Write-Output "backup: $([math]::Round((Get-Item $bk).Length/1MB,1))MB"}; Write-Output ""; $cd="$env:APPDATA\\Windsurf\\Crashpad"; if(Test-Path $cd){ Get-ChildItem $cd -Recurse -File -EA SilentlyContinue | Sort LastWriteTime -Desc | Select -First 5 | ForEach-Object { Write-Output "  $($_.Name) $([math]::Round($_.Length/1MB,1))MB $($_.LastWriteTime)" }; Write-Output "Total crash files: $((Get-ChildItem $cd -Recurse -File -EA SilentlyContinue).Count)" }')

# 7
run("LOG ERRORS", '$ld="$env:APPDATA\\Windsurf\\logs"; $lt=Get-ChildItem $ld -Directory -EA SilentlyContinue|Sort LastWriteTime -Desc|Select -First 1; if($lt){ Write-Output "Session: $($lt.Name)"; $lf=Get-ChildItem $lt.FullName -File -Filter "Windsurf.log" -Recurse|Sort Length -Desc|Select -First 1; if($lf){ Write-Output "Log: $([math]::Round($lf.Length/1KB,1))KB"; $c=Get-Content $lf.FullName -Tail 300 -EA SilentlyContinue; $e=$c|Where-Object{$_ -match "\\[error\\]|OOM|heap|memory|throttl|ERR_|timeout|crash|freeze|hang|slow"}; Write-Output "Errors: $($e.Count)"; $e|Select -Last 10|ForEach-Object{Write-Output $_.Substring(0,[math]::Min($_.Length,250))} } }')

# 8 - C: user dirs
run("USER DIR SIZES", 'Get-ChildItem "$env:USERPROFILE" -Directory -EA SilentlyContinue | ForEach-Object { $sz=(Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue|Measure-Object Length -Sum).Sum; if($sz -gt 100MB){ Write-Output ("{0,-40} {1}GB" -f $_.Name,[math]::Round($sz/1GB,2)) } }', 120)

print("\n=== DONE ===")
