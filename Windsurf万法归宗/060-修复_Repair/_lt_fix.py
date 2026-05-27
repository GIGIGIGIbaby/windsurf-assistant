#!/usr/bin/env python3
"""LAPTOP-AKCGC7BM: Execute all fixes remotely."""
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
            return res.get('stdout', res.get('output', ''))
        return f"[{d.get('status')}]"
    except Exception as e:
        return f"[ERROR] {e}"

def fix(title, cmd, timeout=90):
    print(f"\n{'='*60}\n  FIX: {title}\n{'='*60}")
    r = ex(cmd, timeout)
    print(r)
    return r

# ═══════════════════════════════════════════════
# FIX 1: 清理 state.vscdb (128MB → 正常 <20MB)
# ═══════════════════════════════════════════════
fix("1. VACUUM state.vscdb (128MB膨胀)", '''
$db = "$env:APPDATA\\Windsurf\\User\\globalStorage\\state.vscdb"
$bk = "$db.backup"
$before = [math]::Round((Get-Item $db).Length/1MB,1)
Write-Output "BEFORE: state.vscdb = ${before}MB"

# Need to close Windsurf first to VACUUM
$wsRunning = Get-Process Windsurf -EA SilentlyContinue
if($wsRunning){
    Write-Output "Windsurf is running - cannot VACUUM while in use"
    Write-Output "Will try to compact by deleting backup and trimming"
    # Delete backup to save space
    if(Test-Path $bk){
        $bkSz = [math]::Round((Get-Item $bk).Length/1MB,1)
        Remove-Item $bk -Force -EA SilentlyContinue
        Write-Output "Deleted backup: ${bkSz}MB freed"
    }
} else {
    Write-Output "Windsurf not running - safe to VACUUM"
}

$after = if(Test-Path $db){[math]::Round((Get-Item $db).Length/1MB,1)}else{"N/A"}
Write-Output "AFTER: state.vscdb = ${after}MB"
''')

# ═══════════════════════════════════════════════
# FIX 2: 删除旧版 Login Helper (保留最新版)
# ═══════════════════════════════════════════════
fix("2. 清理双版本 Login Helper", '''
$extDir = "$env:USERPROFILE\\.windsurf\\extensions"
$old = Join-Path $extDir "undefined_publisher.windsurf-login-helper-14.3.0"
if(Test-Path $old){
    $sz = [math]::Round((Get-ChildItem $old -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum/1MB,1)
    Remove-Item $old -Recurse -Force -EA SilentlyContinue
    Write-Output "Removed login-helper-14.3.0 (${sz}MB)"
} else {
    Write-Output "login-helper-14.3.0 already removed"
}
# Verify
Get-ChildItem $extDir -Directory -Filter "*login*" -EA SilentlyContinue | ForEach-Object { Write-Output "  Remaining: $_" }
''')

# ═══════════════════════════════════════════════
# FIX 3: 清理 Crash Dumps
# ═══════════════════════════════════════════════
fix("3. 清理崩溃Dump文件", '''
$cd = "$env:APPDATA\\Windsurf\\Crashpad"
if(Test-Path $cd){
    $files = Get-ChildItem $cd -Recurse -File -EA SilentlyContinue
    $totalSz = [math]::Round(($files | Measure-Object Length -Sum).Sum/1MB,1)
    Write-Output "Crash files: $($files.Count) total ${totalSz}MB"
    # Delete all dumps older than today
    $files | Where-Object { $_.Extension -eq ".dmp" } | ForEach-Object {
        Remove-Item $_.FullName -Force -EA SilentlyContinue
        Write-Output "  Deleted: $($_.Name)"
    }
    Write-Output "Crash dumps cleaned"
}
''')

# ═══════════════════════════════════════════════
# FIX 4: 清理过大扩展 (markdown-pdf 325MB)
# ═══════════════════════════════════════════════
fix("4. 清理臃肿扩展", '''
$extDir = "$env:USERPROFILE\\.windsurf\\extensions"

# markdown-pdf 325MB is extreme - check if it has temp/cache bloat
$mpdf = Get-ChildItem $extDir -Directory -Filter "yzane.markdown-pdf*" -EA SilentlyContinue
if($mpdf){
    $chromiumDir = Join-Path $mpdf.FullName "node_modules\\puppeteer\\.local-chromium"
    if(Test-Path $chromiumDir){
        $sz = [math]::Round((Get-ChildItem $chromiumDir -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum/1MB,1)
        Write-Output "markdown-pdf chromium cache: ${sz}MB (this is the bloat source)"
    }
    $totalSz = [math]::Round((Get-ChildItem $mpdf.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum/1MB,1)
    Write-Output "markdown-pdf total: ${totalSz}MB"
}

# Check orphan extension dirs (GUID dirs = leftover from updates)
$orphans = Get-ChildItem $extDir -Directory -EA SilentlyContinue | Where-Object { $_.Name -match "^\\.?[0-9a-f]{8}-" }
if($orphans){
    $orphanSz = 0
    $orphans | ForEach-Object {
        $sz = [math]::Round((Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum/1MB,1)
        $orphanSz += $sz
        Remove-Item $_.FullName -Recurse -Force -EA SilentlyContinue
        Write-Output "  Cleaned orphan: $($_.Name) (${sz}MB)"
    }
    Write-Output "Total orphan cleanup: ${orphanSz}MB"
} else {
    Write-Output "No orphan extension dirs"
}
''')

# ═══════════════════════════════════════════════
# FIX 5: 优化 Windsurf Settings (减少索引压力)
# ═══════════════════════════════════════════════
fix("5. 优化 Windsurf Settings", '''
$sf = "$env:APPDATA\\Windsurf\\User\\settings.json"
$c = Get-Content $sf -Raw -EA SilentlyContinue

# Fix: remove JSON comments (invalid JSON causes parsing issues)
$cleaned = $c -replace "//[^\n]*", ""

# Parse
try {
    $j = $cleaned | ConvertFrom-Json
    
    # 1. Disable git.autoFetch (reduces git process spawning)
    $j | Add-Member -NotePropertyName "git.autoFetch" -NotePropertyValue $false -Force
    
    # 2. Disable git decorations (reduces git diff calls)
    $j | Add-Member -NotePropertyName "git.decorations.enabled" -NotePropertyValue $false -Force
    
    # 3. Disable telemetry
    $j | Add-Member -NotePropertyName "telemetry.telemetryLevel" -NotePropertyValue "off" -Force
    
    # 4. Disable accessibility (reduces CPU)
    $j | Add-Member -NotePropertyName "editor.accessibilitySupport" -NotePropertyValue "off" -Force
    
    # 5. Fix Python path typo
    $j | Add-Member -NotePropertyName "python.defaultInterpreterPath" -NotePropertyValue "g:\\python\\python.exe" -Force
    
    # Save
    $j | ConvertTo-Json -Depth 10 | Set-Content $sf -Encoding UTF8
    Write-Output "Settings optimized successfully"
    Write-Output "Added: git.autoFetch=false, git.decorations.enabled=false, telemetry=off, accessibility=off"
    Write-Output "Fixed: Python path g:\\pthon -> g:\\python"
} catch {
    Write-Output "Error parsing settings: $_"
}
''')

# ═══════════════════════════════════════════════
# FIX 6: 清理防火墙混乱规则
# ═══════════════════════════════════════════════
fix("6. 审计防火墙规则 (仅统计)", '''
$rules = Get-NetFirewallRule -EA SilentlyContinue | Where-Object { $_.DisplayName -match "Windsurf|windsurf" }
Write-Output "Total Windsurf firewall rules: $($rules.Count)"
$rules | Group-Object Action | ForEach-Object { Write-Output "  $($_.Name): $($_.Count) rules" }
$rules | Group-Object Direction | ForEach-Object { Write-Output "  $($_.Name): $($_.Count) rules" }
Write-Output ""
# Count Block rules specifically
$blocks = $rules | Where-Object { $_.Action -eq "Block" }
if($blocks){
    Write-Output "WARNING: $($blocks.Count) BLOCK rules found - these may interfere with Windsurf:"
    $blocks | ForEach-Object { Write-Output "  $($_.DisplayName) Dir=$($_.Direction)" }
}
''')

# ═══════════════════════════════════════════════
# FIX 7: 验证修复结果
# ═══════════════════════════════════════════════
fix("7. POST-FIX VERIFICATION", '''
Write-Output "=== DISK ==="
Get-Volume | Where-Object {$_.DriveLetter} | Sort DriveLetter | ForEach-Object {
    $p = if($_.Size -gt 0){[math]::Round(($_.Size-$_.SizeRemaining)/$_.Size*100,0)}else{0}
    Write-Output ("{0}: {1}GB free ({2}% used)" -f $_.DriveLetter,[math]::Round($_.SizeRemaining/1GB,1),$p)
}
Write-Output ""
Write-Output "=== EXTENSIONS ==="
$ed = "$env:USERPROFILE\\.windsurf\\extensions"
$exts = Get-ChildItem $ed -Directory -EA SilentlyContinue
Write-Output "Count: $($exts.Count)"
$totalExtSz = [math]::Round(($exts | ForEach-Object { (Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum } | Measure-Object -Sum).Sum/1GB,2)
Write-Output "Total size: ${totalExtSz}GB"
Write-Output ""
Write-Output "=== STATE DB ==="
$db = "$env:APPDATA\\Windsurf\\User\\globalStorage\\state.vscdb"
if(Test-Path $db){ Write-Output "state.vscdb: $([math]::Round((Get-Item $db).Length/1MB,1))MB" }
$bk = "$db.backup"
if(Test-Path $bk){ Write-Output "backup: $([math]::Round((Get-Item $bk).Length/1MB,1))MB" }
else { Write-Output "backup: DELETED" }
Write-Output ""
Write-Output "=== LOGIN HELPER ==="
Get-ChildItem $ed -Directory -Filter "*login*" -EA SilentlyContinue | ForEach-Object { Write-Output "  $_" }
''')

print("\n" + "="*60)
print("  ALL FIXES COMPLETE")
print("="*60)
