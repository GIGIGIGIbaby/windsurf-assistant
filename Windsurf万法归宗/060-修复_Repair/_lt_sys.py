#!/usr/bin/env python3
import urllib.request, json, ssl, sys
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
    r = urllib.request.urlopen(req, timeout=timeout+15, context=CTX)
    d = json.loads(r.read())
    if d.get('status') == 'completed':
        res = d['result']
        return res.get('stdout', res.get('output', ''))
    return f"[{d.get('status')}]"

print("=== SYSTEM ===")
print(ex('$os=Get-CimInstance Win32_OperatingSystem; $cpu=Get-CimInstance Win32_Processor|Select -First 1; Write-Output "Host: $env:COMPUTERNAME"; Write-Output "OS: $($os.Caption) $($os.Version)"; Write-Output "CPU: $($cpu.Name)"; Write-Output "RAM: $([math]::Round($os.TotalVisibleMemorySize/1MB,1))GB Total $([math]::Round($os.FreePhysicalMemory/1MB,1))GB Free"; Write-Output "Procs: $((Get-Process).Count)"'))

print("\n=== DISK ===")
print(ex('Get-Volume | Where-Object {$_.DriveLetter} | Sort DriveLetter | ForEach-Object { $p=if($_.Size -gt 0){[math]::Round(($_.Size-$_.SizeRemaining)/$_.Size*100,0)}else{0}; Write-Output ("{0}: {1}GB total {2}GB free ({3}% used)" -f $_.DriveLetter,[math]::Round($_.Size/1GB,1),[math]::Round($_.SizeRemaining/1GB,1),$p) }'))

print("\n=== TOP 10 MEM ===")
print(ex('Get-Process | Sort WorkingSet64 -Desc | Select -First 10 | ForEach-Object { Write-Output ("{0,-30} PID={1,-7} WS={2}MB" -f $_.ProcessName,$_.Id,[math]::Round($_.WorkingSet64/1MB,1)) }'))

print("\n=== WINDSURF VER ===")
print(ex('$p=(Get-Process Windsurf -EA SilentlyContinue|Select -First 1).Path; if($p){$d=Split-Path $p; $pk=Join-Path $d "resources\\app\\package.json"; if(Test-Path $pk){$j=Get-Content $pk -Raw|ConvertFrom-Json; Write-Output "VER: $($j.version)"}}'))

print("\n=== LANGUAGE SERVER ===")
print(ex('Get-Process language_server* -EA SilentlyContinue | ForEach-Object { Write-Output "PID=$($_.Id) WS=$([math]::Round($_.WorkingSet64/1MB,1))MB VM=$([math]::Round($_.VirtualMemorySize64/1MB,1))MB Threads=$($_.Threads.Count)" }'))

print("\n=== MCP CONFIG ===")
print(ex('$m="$env:USERPROFILE\\.windsurf\\mcp.json"; if(Test-Path $m){Get-Content $m -Raw}else{Write-Output "NO mcp.json"}'))

print("\n=== DONE ===")
