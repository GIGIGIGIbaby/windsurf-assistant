#!/usr/bin/env python3
"""Quick DB + settings diagnosis for 179."""
import sqlite3, json, sys, os, base64, re
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

appdata = os.environ.get('APPDATA', os.path.join(os.environ['USERPROFILE'], 'AppData', 'Roaming'))

# settings.json
print("=== settings.json ===")
sf = os.path.join(appdata, 'Windsurf', 'User', 'settings.json')
if os.path.exists(sf):
    raw = open(sf, 'r', encoding='utf-8', errors='replace').read()
    print(raw[:2000])
else:
    print("NOT FOUND")

# state.vscdb
print("\n=== state.vscdb ===")
db_path = os.path.join(appdata, 'Windsurf', 'User', 'globalStorage', 'state.vscdb')
if not os.path.exists(db_path):
    print("DB NOT FOUND")
    sys.exit(0)

sz = os.path.getsize(db_path) / 1024 / 1024
print(f"Size: {sz:.2f}MB")

db = sqlite3.connect(db_path)
try:
    cur = db.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cur.fetchall()]
    print(f"Tables: {tables}")
    if 'ItemTable' not in tables:
        print("!!! ItemTable NOT FOUND — DB CORRUPTED")
        sys.exit(1)
    
    # windsurfAuthStatus
    cur = db.execute("SELECT value FROM ItemTable WHERE key='windsurfAuthStatus'")
    row = cur.fetchone()
    if row:
        val = row[0]
        if isinstance(val, bytes): val = val.decode('utf-8', 'replace')
        try:
            d = json.loads(val)
            print(f"AUTH email: {d.get('email','?')}")
            print(f"AUTH plan: {d.get('plan','?')}")
            print(f"AUTH status: {d.get('status','?')}")
            ak = (d.get('apiKey','') or '')[:35]
            print(f"AUTH apiKey: {ak}...")
            proto = d.get('userStatusProtoBinaryBase64','')
            if proto:
                try:
                    raw = base64.b64decode(proto)
                    emails_found = re.findall(rb'[\w.-]+@[\w.-]+\.\w+', raw[:500])
                    print(f"AUTH proto emails: {[e.decode() for e in emails_found]}")
                    print(f"AUTH proto len: {len(raw)} bytes")
                except: print("AUTH proto: decode error")
            # Print full auth JSON for analysis (redact apiKey)
            safe = dict(d)
            if 'apiKey' in safe: safe['apiKey'] = safe['apiKey'][:30] + '...'
            if 'userStatusProtoBinaryBase64' in safe: safe['userStatusProtoBinaryBase64'] = safe['userStatusProtoBinaryBase64'][:50] + '...'
            print(f"AUTH full: {json.dumps(safe, indent=2)}")
        except:
            print(f"AUTH: raw ({len(val)} chars) {val[:200]}")
    else:
        print("AUTH: NO windsurfAuthStatus !!")
    
    # apiServerUrl
    cur = db.execute("SELECT value FROM ItemTable WHERE key='apiServerUrl'")
    row = cur.fetchone()
    if row:
        val = row[0]
        if isinstance(val, bytes): val = val.decode('utf-8','replace')
        print(f"apiServerUrl: {val[:200]}")
    else:
        print("apiServerUrl: MISSING !!")
    
    # Auth usage records
    cur = db.execute("SELECT key FROM ItemTable WHERE key LIKE 'windsurf_auth%usages'")
    rows = cur.fetchall()
    print(f"auth-usages records: {len(rows)}")
    for r in rows[:10]:
        print(f"  {r[0]}")
    
    # Windsurf-related keys count
    cur = db.execute("SELECT COUNT(*) FROM ItemTable")
    total = cur.fetchone()[0]
    print(f"Total ItemTable rows: {total}")
    
    # Key windsurf keys
    cur = db.execute("SELECT key, length(value) FROM ItemTable WHERE key LIKE '%windsurf%' OR key LIKE '%codeium%' OR key LIKE '%auth%'")
    for r in cur.fetchall():
        print(f"  [{r[0]}]: {r[1]} bytes")

except Exception as e:
    print(f"DB ERROR: {e}")
finally:
    db.close()

# Login helper extension check
print("\n=== Login Helper ===")
ext_dir = os.path.join(os.environ['USERPROFILE'], '.windsurf', 'extensions')
if os.path.isdir(ext_dir):
    for d in os.listdir(ext_dir):
        if 'login' in d.lower() or 'helper' in d.lower():
            print(f"  {d}")

# extensions.json check
print("\n=== extensions.json ===")
ext_json = os.path.join(os.environ['USERPROFILE'], '.windsurf', 'extensions', 'extensions.json')
if os.path.exists(ext_json):
    raw = open(ext_json, 'r', encoding='utf-8', errors='replace').read()
    print(f"Size: {len(raw)} bytes")
    try:
        data = json.loads(raw)
        print(f"Valid JSON, {len(data)} entries")
    except json.JSONDecodeError as e:
        print(f"!!! INVALID JSON: {e}")
        print(f"First 500 chars: {raw[:500]}")
else:
    print("NOT FOUND")

# Also check Administrator.zhoumac profile since errors reference it
print("\n=== Administrator.zhoumac extensions.json ===")
admin_ext = r'C:\Users\Administrator.zhoumac\.windsurf\extensions\extensions.json'
if os.path.exists(admin_ext):
    raw = open(admin_ext, 'r', encoding='utf-8', errors='replace').read()
    print(f"Size: {len(raw)} bytes")
    try:
        data = json.loads(raw)
        print(f"Valid JSON, {len(data)} entries")
    except json.JSONDecodeError as e:
        print(f"!!! INVALID JSON: {e}")
        print(f"First 500 chars: {raw[:500]}")
else:
    print("NOT FOUND")
