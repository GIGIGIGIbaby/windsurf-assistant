#!/usr/bin/env python3
"""Laptop fixes round 2 - settings, firewall, state.vscdb prep."""
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
    try:
        r = urllib.request.urlopen(req, timeout=timeout+15, context=CTX)
        d = json.loads(r.read())
        if d.get('status') == 'completed':
            res = d['result']
            return res.get('stdout', res.get('output', ''))
        return f"[{d.get('status')}]"
    except Exception as e:
        return f"[ERROR] {e}"

def fix(title, cmd, timeout=90):
    print(f"\n{'='*60}\n  {title}\n{'='*60}")
    print(ex(cmd, timeout))

# ═══════════════════════════════════════
# FIX: Settings (strip comments then parse)
# ═══════════════════════════════════════
fix("FIX SETTINGS (strip comments, add optimizations)", r'''
$sf = "$env:APPDATA\Windsurf\User\settings.json"
$raw = Get-Content $sf -Raw

# Strip single-line comments
$lines = $raw -split "`n"
$cleanLines = @()
foreach($line in $lines){
    $trimmed = $line.TrimStart()
    if(-not $trimmed.StartsWith("//")){
        $cleanLines += $line
    }
}
$cleaned = $cleanLines -join "`n"

# Remove trailing commas before } or ]
$cleaned = $cleaned -replace ',\s*\}', '}'
$cleaned = $cleaned -replace ',\s*\]', ']'

try {
    $j = $cleaned | ConvertFrom-Json

    # Optimizations
    $j | Add-Member -NotePropertyName "git.autoFetch" -NotePropertyValue $false -Force
    $j | Add-Member -NotePropertyName "git.decorations.enabled" -NotePropertyValue $false -Force
    $j | Add-Member -NotePropertyName "telemetry.telemetryLevel" -NotePropertyValue "off" -Force
    $j | Add-Member -NotePropertyName "editor.accessibilitySupport" -NotePropertyValue "off" -Force
    $j | Add-Member -NotePropertyName "kotlin.languageServer.enabled" -NotePropertyValue $false -Force
    $j | Add-Member -NotePropertyName "kotlin.debugAdapter.enabled" -NotePropertyValue $false -Force
    
    # Backup then save
    Copy-Item $sf "$sf.bak" -Force
    $j | ConvertTo-Json -Depth 10 | Set-Content $sf -Encoding UTF8
    Write-Output "Settings optimized and saved"
    Write-Output "Added: git.autoFetch=false, git.decorations=false, telemetry=off, accessibility=off, kotlin=off"
} catch {
    Write-Output "Parse error: $_"
    Write-Output "Cleaned content first 500 chars:"
    Write-Output $cleaned.Substring(0, [math]::Min($cleaned.Length, 500))
}
''')

# ═══════════════════════════════════════
# FIX: Check Python path
# ═══════════════════════════════════════
fix("CHECK PYTHON PATHS", r'''
Write-Output "=== Checking Python paths ==="
$paths = @("g:\pthon\python.exe", "g:\python\python.exe", "g:\Python\python.exe", "g:\Python311\python.exe")
foreach($p in $paths){
    if(Test-Path $p){ Write-Output "  EXISTS: $p" }
    else { Write-Output "  MISSING: $p" }
}
Write-Output ""
# Find actual Python
$pyExe = Get-Command python -EA SilentlyContinue
if($pyExe){ Write-Output "  System python: $($pyExe.Source)" }
$pyExe2 = Get-Command python3 -EA SilentlyContinue
if($pyExe2){ Write-Output "  System python3: $($pyExe2.Source)" }
# Check G: drive for python dirs
Get-ChildItem "G:\" -Directory -Filter "*python*" -EA SilentlyContinue | ForEach-Object { Write-Output "  G: dir: $($_.FullName)" }
Get-ChildItem "G:\" -Directory -Filter "*pthon*" -EA SilentlyContinue | ForEach-Object { Write-Output "  G: dir: $($_.FullName)" }
''')

# ═══════════════════════════════════════
# FIX: Remove BLOCK firewall rules
# ═══════════════════════════════════════
fix("REMOVE WINDSURF BLOCK FIREWALL RULES", r'''
$blocks = Get-NetFirewallRule -EA SilentlyContinue | Where-Object { $_.DisplayName -match "Windsurf|windsurf" -and $_.Action -eq "Block" }
Write-Output "Found $($blocks.Count) BLOCK rules"
foreach($r in $blocks){
    Write-Output "  Removing: $($r.DisplayName) ($($r.Name))"
    Remove-NetFirewallRule -Name $r.Name -EA SilentlyContinue
}
Write-Output ""
# Verify
$remaining = Get-NetFirewallRule -EA SilentlyContinue | Where-Object { $_.DisplayName -match "Windsurf|windsurf" }
Write-Output "Remaining rules: $($remaining.Count)"
$remaining | Group-Object Action | ForEach-Object { Write-Output "  $($_.Name): $($_.Count)" }
''')

# ═══════════════════════════════════════
# Create state.vscdb VACUUM script for user to run after closing Windsurf
# ═══════════════════════════════════════
fix("DEPLOY STATE.VSCDB VACUUM SCRIPT", r'''
$script = @"
# state.vscdb VACUUM Script
# Run AFTER closing Windsurf!
`$db = "`$env:APPDATA\Windsurf\User\globalStorage\state.vscdb"
`$before = [math]::Round((Get-Item `$db).Length/1MB,1)
Write-Host "BEFORE: `${before}MB"

# Use sqlite3 if available, otherwise just delete and let Windsurf rebuild
`$sqlite = Get-Command sqlite3 -EA SilentlyContinue
if(`$sqlite){
    & sqlite3 `$db "VACUUM;"
    `$after = [math]::Round((Get-Item `$db).Length/1MB,1)
    Write-Host "AFTER VACUUM: `${after}MB"
} else {
    # Alternative: rename old, Windsurf will create fresh
    `$ts = Get-Date -Format "yyyyMMdd_HHmmss"
    Rename-Item `$db "`$db.old_`$ts" -Force
    Write-Host "Renamed to state.vscdb.old_`$ts - Windsurf will create fresh on next start"
}
"@

$scriptPath = "$env:USERPROFILE\Desktop\fix_windsurf_statedb.ps1"
$script | Set-Content $scriptPath -Encoding UTF8
Write-Output "VACUUM script saved to: $scriptPath"
Write-Output "Run it AFTER closing Windsurf to fix the 128MB state.vscdb issue"
''')

# ═══════════════════════════════════════
# Final verification
# ═══════════════════════════════════════
fix("FINAL STATE", r'''
Write-Output "=== DISK ==="
Get-Volume | Where-Object {$_.DriveLetter} | Sort DriveLetter | ForEach-Object {
    $p = if($_.Size -gt 0){[math]::Round(($_.Size-$_.SizeRemaining)/$_.Size*100,0)}else{0}
    Write-Output ("{0}: {1}GB free ({2}% used)" -f $_.DriveLetter,[math]::Round($_.SizeRemaining/1GB,1),$p)
}
Write-Output ""
Write-Output "=== WINDSURF PROCS ==="
$ws = Get-Process Windsurf*,language_server* -EA SilentlyContinue
$t = [math]::Round(($ws|Measure-Object -Property WorkingSet64 -Sum).Sum/1GB,2)
Write-Output "Windsurf: $($ws.Count) procs, ${t}GB total"
Write-Output ""
Write-Output "=== EXTENSIONS ==="
$exts = Get-ChildItem "$env:USERPROFILE\.windsurf\extensions" -Directory -EA SilentlyContinue
Write-Output "Count: $($exts.Count)"
Write-Output ""
Write-Output "=== SETTINGS ==="
$sf = "$env:APPDATA\Windsurf\User\settings.json"
if(Test-Path $sf){ Write-Output "Settings: $([math]::Round((Get-Item $sf).Length/1KB,1))KB" }
Write-Output ""
Write-Output "=== FIREWALL ==="
$fw = Get-NetFirewallRule -EA SilentlyContinue | Where-Object { $_.DisplayName -match "Windsurf|windsurf" }
Write-Output "Rules: $($fw.Count) (Block: $($($fw|Where-Object{$_.Action -eq 'Block'}).Count))"
''')

print("\n" + "="*60)
print("  ALL ROUND 2 FIXES COMPLETE")
print("="*60)
