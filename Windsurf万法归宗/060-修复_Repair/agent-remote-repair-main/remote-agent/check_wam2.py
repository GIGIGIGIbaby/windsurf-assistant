import json, os, time

GS = r"C:\Users\Administrator\AppData\Roaming\Windsurf\User\globalStorage"
EXT_GS = os.path.join(GS, "undefined_publisher.windsurf-login-helper")

tc = os.path.join(EXT_GS, "wam-token-cache.json")
if os.path.exists(tc):
    sz = os.path.getsize(tc)
    age = int(time.time() - os.path.getmtime(tc))
    print(f"token-cache: {sz}B, modified {age}s ago")
else:
    print("token-cache: NOT FOUND at", tc)

ac = os.path.join(EXT_GS, "windsurf-login-accounts.json")
if os.path.exists(ac):
    with open(ac, "r", encoding="utf-8") as f:
        a = json.load(f)
    print(f"accounts: {len(a)}")
    for i, acc in enumerate(a[:3]):
        print(f"  [{i}] {acc.get('email','?')} pw={'Y' if acc.get('password') else 'N'}")
else:
    print("accounts: NOT FOUND at", ac)

# Check auth files
for fn in ["windsurf-auth.json", "cascade-auth.json"]:
    fp = os.path.join(GS, fn)
    if os.path.exists(fp):
        sz = os.path.getsize(fp)
        print(f"{fn}: {sz}B")
    else:
        print(f"{fn}: NOT FOUND")
