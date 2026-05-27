#!/usr/bin/env python3
import urllib.request, json, ssl, sys
sys.stdout.reconfigure(line_buffering=True)
BASE = 'https://aiotvr.xyz/ps-agent'
CTX = ssl.create_default_context()

cmd = r'''
$s = '$db="$env:APPDATA\Windsurf\User\globalStorage\state.vscdb"; $b=[math]::Round((Get-Item $db).Length/1MB,1); Write-Host "BEFORE: ${b}MB"; $t=Get-Date -Format yyyyMMdd_HHmmss; Rename-Item $db "$db.old_$t" -Force; Write-Host "Done - restart Windsurf"'
Set-Content "$env:USERPROFILE\Desktop\fix_statedb.ps1" -Value $s -Encoding UTF8
Write-Output "Saved to Desktop\fix_statedb.ps1"
'''

body = json.dumps({'agent_id': 'LAPTOP-AKCGC7BM', 'cmd': cmd, 'timeout': 30}).encode()
req = urllib.request.Request(f'{BASE}/api/exec-sync', data=body, method='POST')
req.add_header('Authorization', 'Bearer dao-ps-agent-2026')
req.add_header('Content-Type', 'application/json')
r = urllib.request.urlopen(req, timeout=45, context=CTX)
d = json.loads(r.read())
print(d.get('result', {}).get('stdout', d.get('status', 'NONE')))
