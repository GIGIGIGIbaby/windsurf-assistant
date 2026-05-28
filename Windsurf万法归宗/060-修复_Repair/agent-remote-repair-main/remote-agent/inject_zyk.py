"""
Inject session into zhouyoukang's state.vscdb on DESKTOP-MASTER (141)
Try Firebase login with multiple proxy strategies, then inject session.
"""
import json, os, time, sqlite3, uuid, base64, ctypes, ctypes.wintypes

USER_HOME = r"C:\Users\zhouyoukang"
GS_DIR = os.path.join(USER_HOME, "AppData", "Roaming", "Windsurf", "User", "globalStorage")
LS_PATH = os.path.join(USER_HOME, "AppData", "Roaming", "Windsurf", "Local State")
DB_PATH = os.path.join(GS_DIR, "state.vscdb")
FIREBASE_KEY = "AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY"
SESSION_KEY = 'secret://{"extensionId":"codeium.windsurf","key":"windsurf_auth.sessions"}'
ACTIVE_KEY = "codeium.windsurf-windsurf_auth"

# Read accounts
accts_path = os.path.join(GS_DIR, "undefined_publisher.windsurf-login-helper", "windsurf-login-accounts.json")
with open(accts_path, "r", encoding="utf-8") as f:
    accts = json.load(f)

# Find best account
best = None
for a in accts:
    if not a.get("password"): continue
    c = a.get("credits", 0) or 0
    u = a.get("usage") or {}
    w = (u.get("weekly") or {}).get("remaining", 0) or 0
    score = c * 10 + w
    if best is None or score > best[1]:
        best = (a, score)

email = best[0]["email"]
password = best[0]["password"]
print(f"Account: {email} (score={best[1]})")

# Try Firebase login with multiple strategies
import urllib.request, ssl
id_token = refresh_token = uid = display_name = ""
url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_KEY}"
payload = json.dumps({"email": email, "password": password, "returnSecureToken": True}).encode()

strategies = [
    ("direct", None),
    ("7890", {"https": "http://127.0.0.1:7890", "http": "http://127.0.0.1:7890"}),
    ("7897", {"https": "http://127.0.0.1:7897", "http": "http://127.0.0.1:7897"}),
    ("sys_proxy", None),  # use system proxy
]

for name, proxy_dict in strategies:
    try:
        handlers = []
        if proxy_dict:
            handlers.append(urllib.request.ProxyHandler(proxy_dict))
        elif name == "direct":
            handlers.append(urllib.request.ProxyHandler({}))  # no proxy
        # else: use default system proxy
        
        ctx = ssl.create_default_context()
        handlers.append(urllib.request.HTTPSHandler(context=ctx))
        opener = urllib.request.build_opener(*handlers)
        
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with opener.open(req, timeout=15) as resp:
            d = json.loads(resp.read())
        id_token = d.get("idToken", "")
        refresh_token = d.get("refreshToken", "")
        uid = d.get("localId", "")
        display_name = d.get("displayName", email.split("@")[0])
        print(f"Firebase OK via {name}: {display_name} (uid={uid[:12]}...)")
        break
    except Exception as e:
        print(f"  {name}: FAIL ({e})")

if not id_token:
    print("All Firebase strategies failed. Exiting.")
    exit(1)

# Get Chromium encryption key
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
    except Exception as e:
        print(f"  Chromium key error: {e}")
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

# Build session
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

# Encrypt
key = get_chromium_key()
encrypted = None
if key:
    try:
        encrypted = v10_encrypt(plain, key)
        print("Crypto: Chromium v10 AES-GCM")
    except Exception as e:
        print(f"v10 failed: {e}")

if not encrypted:
    try:
        encrypted = dpapi_encrypt(plain)
        print("Crypto: DPAPI")
    except Exception as e:
        print(f"DPAPI failed: {e}")

if not encrypted:
    print("ERROR: All encryption methods failed")
    exit(1)

# Inject into state.vscdb
print(f"\nInjecting into {DB_PATH}...")
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

# Write auth files
auth = {"authToken": id_token, "token": id_token, "api_key": id_token,
        "timestamp": int(time.time() * 1000)}
for fn in ["windsurf-auth.json", "cascade-auth.json"]:
    fp = os.path.join(GS_DIR, fn)
    with open(fp, "w") as f:
        json.dump(auth, f, indent=2)

print(f"\n=== SUCCESS: {display_name} ({email}) ===")
print(f"Session injected + auth files written")
print(f"Please restart Windsurf to apply")
