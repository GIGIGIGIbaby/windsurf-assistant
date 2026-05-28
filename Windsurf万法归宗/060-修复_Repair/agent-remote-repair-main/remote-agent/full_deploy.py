"""
Complete deployment for zhouyoukang user on DESKTOP-MASTER (141)
1. Register extension in extensions.json
2. Deploy globalStorage data (accounts + token-cache)
3. Inject session into state.vscdb via Firebase login
4. Write auth JSON files
5. Clean .obsolete
"""
import json, os, time, sqlite3, shutil, uuid, base64, ctypes, ctypes.wintypes

USER_HOME = r"C:\Users\zhouyoukang"
EXT_DIR = os.path.join(USER_HOME, ".windsurf", "extensions")
GS_DIR = os.path.join(USER_HOME, "AppData", "Roaming", "Windsurf", "User", "globalStorage")
LS_PATH = os.path.join(USER_HOME, "AppData", "Roaming", "Windsurf", "Local State")
DB_PATH = os.path.join(GS_DIR, "state.vscdb")
EXT_NAME = "undefined_publisher.windsurf-login-helper-9.0.0"
FIREBASE_KEY = "AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY"
SESSION_KEY = 'secret://{"extensionId":"codeium.windsurf","key":"windsurf_auth.sessions"}'
ACTIVE_KEY = "codeium.windsurf-windsurf_auth"

# DPAPI
class _BLOB(ctypes.Structure):
    _fields_ = [("cbData", ctypes.wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

def get_chromium_key():
    try:
        with open(LS_PATH, "r", encoding="utf-8") as f:
            ls = json.load(f)
        enc_b64 = ls.get("os_crypt", {}).get("encrypted_key", "")
        if not enc_b64: return None
        enc = base64.b64decode(enc_b64)
        if enc[:5] == b"DPAPI": enc = enc[5:]
        buf = ctypes.create_string_buffer(enc)
        b_in, b_out = _BLOB(len(enc), buf), _BLOB()
        if not ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(b_in), None, None, None, None, 0, ctypes.byref(b_out)):
            return None
        key = bytes(b_out.pbData[:b_out.cbData])
        ctypes.windll.kernel32.LocalFree(b_out.pbData)
        return key
    except:
        return None

def v10_encrypt(plaintext, key):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    nonce = os.urandom(12)
    return b"v10" + nonce + AESGCM(key).encrypt(nonce, plaintext, None)

def dpapi_encrypt(data):
    buf = ctypes.create_string_buffer(data)
    b_in, b_out = _BLOB(len(data), buf), _BLOB()
    if not ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(b_in), None, None, None, None, 0, ctypes.byref(b_out)):
        raise OSError("CryptProtectData failed")
    result = bytes(b_out.pbData[:b_out.cbData])
    ctypes.windll.kernel32.LocalFree(b_out.pbData)
    return result

print("=" * 50)
print("FULL DEPLOY for zhouyoukang@DESKTOP-MASTER")
print("=" * 50)

# ── Step 1: Register extension in extensions.json ──
print("\n[1/5] Register extension in extensions.json...")
ext_json_path = os.path.join(EXT_DIR, "extensions.json")
with open(ext_json_path, "r", encoding="utf-8") as f:
    exts = json.load(f)

# Remove old entries
exts = [e for e in exts if "windsurf-assistant" not in e.get("identifier", {}).get("id", "")
        and "windsurf-login-helper" not in e.get("identifier", {}).get("id", "")]

new_entry = {
    "identifier": {"id": "undefined_publisher.windsurf-login-helper"},
    "version": "9.0.0",
    "location": {
        "$mid": 1,
        "fsPath": os.path.join(EXT_DIR, EXT_NAME),
        "_sep": 1,
        "path": "/c:/Users/zhouyoukang/.windsurf/extensions/" + EXT_NAME,
        "scheme": "file"
    },
    "relativeLocation": EXT_NAME,
    "metadata": {
        "isApplicationScoped": False,
        "isMachineScoped": False,
        "isBuiltin": False,
        "installedTimestamp": int(time.time() * 1000),
        "pinned": True,
        "source": "vsix"
    }
}
exts.append(new_entry)
with open(ext_json_path, "w", encoding="utf-8") as f:
    json.dump(exts, f, ensure_ascii=False)
print(f"  OK: {len(exts)} extensions registered")

# ── Step 2: Deploy globalStorage data ──
print("\n[2/5] Deploy globalStorage data...")
ext_gs = os.path.join(GS_DIR, "undefined_publisher.windsurf-login-helper")
os.makedirs(ext_gs, exist_ok=True)
src_gs = r"C:\Temp\wam_deploy2\globalStorage\undefined_publisher.windsurf-login-helper"
if os.path.isdir(src_gs):
    for fn in os.listdir(src_gs):
        src = os.path.join(src_gs, fn)
        dst = os.path.join(ext_gs, fn)
        if os.path.isfile(src):
            shutil.copy2(src, dst)
            print(f"  Copied: {fn}")
        elif os.path.isdir(src):
            # Handle nested dir from ZIP
            for fn2 in os.listdir(src):
                shutil.copy2(os.path.join(src, fn2), os.path.join(ext_gs, fn2))
                print(f"  Copied (nested): {fn2}")
else:
    # Try Admin path fallback
    admin_gs = r"C:\Users\Administrator\AppData\Roaming\Windsurf\User\globalStorage\undefined_publisher.windsurf-login-helper"
    if os.path.isdir(admin_gs):
        for fn in os.listdir(admin_gs):
            shutil.copy2(os.path.join(admin_gs, fn), os.path.join(ext_gs, fn))
            print(f"  Copied from Admin: {fn}")
    else:
        print("  WARN: No source globalStorage found")

# Verify accounts
accts_path = os.path.join(ext_gs, "windsurf-login-accounts.json")
if os.path.exists(accts_path):
    with open(accts_path, "r", encoding="utf-8") as f:
        accts = json.load(f)
    print(f"  Accounts loaded: {len(accts)}")
else:
    print("  ERROR: accounts file missing")
    accts = []

# ── Step 3: Firebase login ──
print("\n[3/5] Firebase login...")
best = None
for a in accts:
    if not a.get("password"): continue
    c = a.get("credits", 0) or 0
    u = a.get("usage") or {}
    w = (u.get("weekly") or {}).get("remaining", 0) or 0
    score = c * 10 + w
    if best is None or score > best[1]:
        best = (a, score)

if best:
    acct = best[0]
    email = acct["email"]
    password = acct["password"]
    print(f"  Best: {email} (score={best[1]})")

    import urllib.request
    proxy = urllib.request.ProxyHandler({"https": "http://127.0.0.1:7890", "http": "http://127.0.0.1:7890"})
    opener = urllib.request.build_opener(proxy)
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_KEY}"
    payload = json.dumps({"email": email, "password": password, "returnSecureToken": True}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    try:
        with opener.open(req, timeout=30) as resp:
            d = json.loads(resp.read())
        id_token = d.get("idToken", "")
        refresh_token = d.get("refreshToken", "")
        uid = d.get("localId", "")
        display_name = d.get("displayName", email.split("@")[0])
        print(f"  OK: {display_name} (uid={uid[:12]}...)")
    except Exception as e:
        print(f"  FAIL: {e}")
        id_token = refresh_token = uid = display_name = ""
else:
    print("  No usable account")
    id_token = refresh_token = uid = display_name = email = ""

# ── Step 4: Inject session into state.vscdb ──
if id_token and os.path.exists(DB_PATH):
    print("\n[4/5] Inject session into state.vscdb...")
    session = [{
        "id": str(uuid.uuid4()),
        "accessToken": "",
        "account": {"label": display_name, "id": email},
        "scopes": [],
        "refreshToken": refresh_token,
        "uid": uid,
        "email": email,
        "idToken": id_token,
    }]
    plain = json.dumps(session).encode("utf-8")

    key = get_chromium_key()
    encrypted = None
    if key:
        try:
            encrypted = v10_encrypt(plain, key)
            print("  Crypto: Chromium v10 AES-GCM")
        except Exception as e:
            print(f"  v10 failed ({e}), falling back to DPAPI")
    if not encrypted:
        try:
            encrypted = dpapi_encrypt(plain)
            print("  Crypto: DPAPI")
        except Exception as e:
            print(f"  DPAPI failed: {e}")
            encrypted = None

    if encrypted:
        buf_json = json.dumps({"type": "Buffer", "data": list(encrypted)})
        conn = sqlite3.connect(DB_PATH, timeout=5)
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO ItemTable(key,value) VALUES(?,?)", (SESSION_KEY, buf_json))
        cur.execute("INSERT OR REPLACE INTO ItemTable(key,value) VALUES(?,?)", (ACTIVE_KEY, display_name))
        cur.execute("DELETE FROM ItemTable WHERE key LIKE 'windsurf_auth-%'")
        usages = json.dumps([{"extensionId": "codeium.windsurf", "extensionName": "Windsurf",
                              "scopes": [], "lastUsed": int(time.time() * 1000)}])
        cur.execute("INSERT OR REPLACE INTO ItemTable(key,value) VALUES(?,?)",
                    (f"windsurf_auth-{display_name}-usages", usages))
        conn.commit()
        conn.close()
        print(f"  Session injected: {display_name} ({email})")
    else:
        print("  SKIP: encryption failed")
else:
    print("\n[4/5] SKIP: no token or no DB")

# ── Step 5: Write auth JSON files ──
if id_token:
    print("\n[5/5] Write auth JSON files...")
    auth = {"authToken": id_token, "token": id_token, "api_key": id_token,
            "timestamp": int(time.time() * 1000)}
    for fn in ["windsurf-auth.json", "cascade-auth.json"]:
        fp = os.path.join(GS_DIR, fn)
        with open(fp, "w") as f:
            json.dump(auth, f, indent=2)
    print("  Auth files written")
else:
    print("\n[5/5] SKIP: no token")

# ── Clean .obsolete ──
obs_path = os.path.join(EXT_DIR, ".obsolete")
if os.path.exists(obs_path):
    with open(obs_path, "r") as f:
        obs = json.load(f)
    for k in list(obs.keys()):
        if "windsurf-login-helper" in k or "windsurf-assistant" in k:
            del obs[k]
    with open(obs_path, "w") as f:
        json.dump(obs, f)
    print(f"\n.obsolete cleaned: {len(obs)} entries remain")

print("\n" + "=" * 50)
print("DEPLOY COMPLETE")
print("=" * 50)
