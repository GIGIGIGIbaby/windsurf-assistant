#!/usr/bin/env python3
"""
179笔记本 Windsurf 精准修复 — 道法自然
=======================================
FIX #1: settings.json 代理 192.168.31.141:17890 → 127.0.0.1:7890
FIX #2: state.vscdb 清理89条多账号记录 + null auth
FIX #3: Administrator.zhoumac extensions.json 修复
"""
import os, json, sys, sqlite3, shutil
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
appdata = os.environ.get('APPDATA', os.path.join(os.environ['USERPROFILE'], 'AppData', 'Roaming'))
now = datetime.now().strftime('%Y%m%d_%H%M%S')

print(f"=== 179 Windsurf Repair — {now} ===\n")

# ═══════════════════════════════════════
# FIX #1: settings.json
# ═══════════════════════════════════════
print("=== FIX #1: settings.json proxy ===")
sf = os.path.join(appdata, 'Windsurf', 'User', 'settings.json')
if os.path.exists(sf):
    # Backup
    bak = sf + f'.bak_{now}'
    shutil.copy2(sf, bak)
    print(f"  Backup: {bak}")
    
    raw = open(sf, 'r', encoding='utf-8').read()
    try:
        settings = json.loads(raw)
        old_proxy = settings.get('http.proxy', '')
        old_support = settings.get('http.proxySupport', '')
        print(f"  OLD proxy: {old_proxy}")
        print(f"  OLD proxySupport: {old_support}")
        
        # Fix: point to local working proxy
        settings['http.proxy'] = 'http://127.0.0.1:7890'
        settings['http.proxySupport'] = 'fallback'
        settings['http.proxyStrictSSL'] = False
        
        with open(sf, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
        
        print(f"  NEW proxy: http://127.0.0.1:7890")
        print(f"  NEW proxySupport: fallback")
        print(f"  FIX #1: DONE")
    except Exception as e:
        print(f"  ERROR: {e}")
else:
    print(f"  NOT FOUND: {sf}")

# ═══════════════════════════════════════
# FIX #2: state.vscdb cleanup
# ═══════════════════════════════════════
print("\n=== FIX #2: state.vscdb cleanup ===")
db_path = os.path.join(appdata, 'Windsurf', 'User', 'globalStorage', 'state.vscdb')
if os.path.exists(db_path):
    # Backup
    bak = db_path + f'.bak_{now}'
    shutil.copy2(db_path, bak)
    print(f"  Backup: {bak}")
    
    # Also backup WAL if exists
    wal = db_path + '-wal'
    if os.path.exists(wal):
        shutil.copy2(wal, wal + f'.bak_{now}')
    
    db = sqlite3.connect(db_path)
    try:
        # Count before
        cur = db.execute("SELECT COUNT(*) FROM ItemTable WHERE key LIKE 'windsurf_auth%usages'")
        before = cur.fetchone()[0]
        print(f"  Auth-usages records BEFORE: {before}")
        
        # Delete all auth-usages records
        db.execute("DELETE FROM ItemTable WHERE key LIKE 'windsurf_auth%usages'")
        
        # Delete stale auth session records (non-secret)
        cur = db.execute("SELECT key FROM ItemTable WHERE key LIKE 'windsurf_auth-%' AND key NOT LIKE '%usages' AND key NOT LIKE 'secret://%'")
        stale_keys = [r[0] for r in cur.fetchall()]
        for k in stale_keys:
            db.execute("DELETE FROM ItemTable WHERE key=?", (k,))
            print(f"  Deleted stale: {k}")
        
        # Clear null windsurfAuthStatus (let Windsurf recreate on login)
        cur = db.execute("SELECT value FROM ItemTable WHERE key='windsurfAuthStatus'")
        row = cur.fetchone()
        if row:
            val = row[0]
            if isinstance(val, bytes): val = val.decode('utf-8','replace')
            if val.strip() in ('null', '""', ''):
                db.execute("DELETE FROM ItemTable WHERE key='windsurfAuthStatus'")
                print(f"  Deleted null windsurfAuthStatus")
            else:
                print(f"  windsurfAuthStatus has real data, keeping")
        
        # Clear cachedPlanInfo (stale)
        db.execute("DELETE FROM ItemTable WHERE key='windsurf.settings.cachedPlanInfo'")
        print(f"  Cleared cachedPlanInfo")
        
        db.commit()
        
        # Count after
        cur = db.execute("SELECT COUNT(*) FROM ItemTable WHERE key LIKE 'windsurf_auth%usages'")
        after = cur.fetchone()[0]
        print(f"  Auth-usages records AFTER: {after}")
        
        # VACUUM to reclaim space
        cur = db.execute("SELECT COUNT(*) FROM ItemTable")
        total = cur.fetchone()[0]
        print(f"  Total rows remaining: {total}")
        
        db.execute("VACUUM")
        print(f"  VACUUM done")
        print(f"  FIX #2: DONE — deleted {before} usages + {len(stale_keys)} stale records")
        
    except Exception as e:
        print(f"  DB ERROR: {e}")
    finally:
        db.close()
else:
    print(f"  NOT FOUND: {db_path}")

# ═══════════════════════════════════════
# FIX #3: Administrator.zhoumac extensions.json
# ═══════════════════════════════════════
print("\n=== FIX #3: Administrator.zhoumac extensions.json ===")
admin_ext = r'C:\Users\Administrator.zhoumac\.windsurf\extensions\extensions.json'
if os.path.exists(admin_ext):
    raw = open(admin_ext, 'r', encoding='utf-8', errors='replace').read()
    try:
        data = json.loads(raw)
        print(f"  Already valid JSON ({len(data)} entries)")
    except json.JSONDecodeError as e:
        print(f"  INVALID JSON: {e}")
        # Backup
        bak = admin_ext + f'.bak_{now}'
        shutil.copy2(admin_ext, bak)
        # Create minimal valid extensions.json
        with open(admin_ext, 'w', encoding='utf-8') as f:
            json.dump([], f)
        print(f"  Replaced with empty array")
        print(f"  FIX #3: DONE")
else:
    print(f"  NOT FOUND (no fix needed)")

# ═══════════════════════════════════════
# Verification
# ═══════════════════════════════════════
print("\n=== VERIFICATION ===")

# Re-read settings.json
if os.path.exists(sf):
    s = json.load(open(sf))
    proxy = s.get('http.proxy', '')
    support = s.get('http.proxySupport', '')
    print(f"  settings.json proxy: {proxy}")
    print(f"  settings.json proxySupport: {support}")
    if proxy == 'http://127.0.0.1:7890' and support == 'fallback':
        print(f"  ✓ Proxy config CORRECT")
    else:
        print(f"  ✗ Proxy config WRONG")

# Re-check state.vscdb
if os.path.exists(db_path):
    db = sqlite3.connect(db_path)
    cur = db.execute("SELECT COUNT(*) FROM ItemTable WHERE key LIKE 'windsurf_auth%usages'")
    cnt = cur.fetchone()[0]
    cur2 = db.execute("SELECT value FROM ItemTable WHERE key='windsurfAuthStatus'")
    auth = cur2.fetchone()
    print(f"  state.vscdb auth-usages: {cnt}")
    print(f"  state.vscdb authStatus: {'CLEAN' if not auth else auth[0]}")
    if cnt == 0 and not auth:
        print(f"  ✓ Database CLEAN")
    else:
        print(f"  ✗ Database still has issues")
    db.close()

# Test proxy connectivity
print("\n=== PROXY CONNECTIVITY ===")
import urllib.request
tests = [
    ("https://identitytoolkit.googleapis.com", "Firebase Auth"),
    ("https://server.codeium.com", "Codeium Server"),
]
for url, name in tests:
    try:
        proxy_handler = urllib.request.ProxyHandler({
            'https': 'http://127.0.0.1:7890',
            'http': 'http://127.0.0.1:7890'
        })
        opener = urllib.request.build_opener(proxy_handler)
        req = urllib.request.Request(url, headers={'User-Agent': 'Diag/1.0'})
        r = opener.open(req, timeout=8)
        print(f"  ✓ {name}: HTTP {r.status}")
    except urllib.error.HTTPError as e:
        print(f"  ✓ {name}: HTTP {e.code} (reachable)")
    except Exception as e:
        print(f"  ✗ {name}: {str(e)[:80]}")

print(f"\n=== REPAIR COMPLETE ===")
print(f"请在179笔记本上重启Windsurf, 然后重新登录账号")
print(f"Windsurf现在将通过本地 com.vortex.helper (127.0.0.1:7890) 代理访问Firebase")
