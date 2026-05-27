import json, os, time, sqlite3, shutil

GS = r"C:\Users\Administrator\AppData\Roaming\Windsurf\User\globalStorage"
DB = os.path.join(GS, "state.vscdb")

# Read current session from state.vscdb
tmp = DB + ".fix_tmp"
shutil.copy2(DB, tmp)
c = sqlite3.connect(tmp)
r = c.execute("SELECT value FROM ItemTable WHERE key=?",
              ("codeium.windsurf-windsurf_auth",)).fetchone()
r2 = c.execute("SELECT value FROM ItemTable WHERE key LIKE ?",
               ("%windsurf_auth.sessions%",)).fetchone()
c.close()
os.unlink(tmp)

display = r[0] if r else "NONE"
blob_len = len(r2[0]) if r2 else 0
print(f"Session display: {display}")
print(f"Session blob: {blob_len} bytes")

# Try to extract idToken from the session blob (for auth files)
# The session blob is encrypted, so we can't easily extract the token
# Instead, do a fresh Firebase login using the active account's credentials

accts_path = os.path.join(GS, "undefined_publisher.windsurf-login-helper",
                          "windsurf-login-accounts.json")
if os.path.exists(accts_path):
    with open(accts_path, "r", encoding="utf-8") as f:
        accts = json.load(f)
    print(f"Accounts loaded: {len(accts)}")
    
    # Find a good account (high credits, has password)
    best = None
    best_score = -1
    for a in accts:
        if not a.get("password"):
            continue
        credits = a.get("credits", 0) or 0
        usage = a.get("usage") or {}
        weekly = usage.get("weekly") or {}
        wr = weekly.get("remaining", 0) or 0
        score = credits * 10 + wr
        if score > best_score:
            best_score = score
            best = a
    
    if best:
        email = best.get("email", "?")
        print(f"Best account: {email} (score={best_score})")
        
        # Firebase login
        import urllib.request
        FIREBASE_KEY = "AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY"
        proxy = urllib.request.ProxyHandler({
            "https": "http://127.0.0.1:7890",
            "http": "http://127.0.0.1:7890"
        })
        opener = urllib.request.build_opener(proxy)
        url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_KEY}"
        payload = json.dumps({
            "email": email,
            "password": best["password"],
            "returnSecureToken": True
        }).encode()
        req = urllib.request.Request(url, data=payload,
                                    headers={"Content-Type": "application/json"})
        try:
            with opener.open(req, timeout=30) as resp:
                d = json.loads(resp.read())
            id_token = d.get("idToken", "")
            display_name = d.get("displayName", email.split("@")[0])
            print(f"Firebase OK: {display_name}")
            
            # Write auth files
            auth = {
                "authToken": id_token,
                "token": id_token,
                "api_key": id_token,
                "timestamp": int(time.time() * 1000)
            }
            for fn in ["windsurf-auth.json", "cascade-auth.json"]:
                fp = os.path.join(GS, fn)
                with open(fp, "w") as f:
                    json.dump(auth, f, indent=2)
            print("Auth files written OK")
        except Exception as e:
            print(f"Firebase FAIL: {e}")
    else:
        print("No usable account found")
else:
    print("Accounts file not found")
