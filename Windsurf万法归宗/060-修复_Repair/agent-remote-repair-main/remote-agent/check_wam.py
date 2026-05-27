import json, os, time

tc = os.path.join(os.environ["APPDATA"], "Windsurf", "User", "globalStorage",
                  "undefined_publisher.windsurf-login-helper", "wam-token-cache.json")
if os.path.exists(tc):
    sz = os.path.getsize(tc)
    mt = os.path.getmtime(tc)
    age = int(time.time() - mt)
    print(f"token-cache: {sz}B, modified {age}s ago")
    with open(tc, "r") as f:
        d = json.load(f)
    if isinstance(d, dict):
        print(f"keys: {list(d.keys())[:5]}")
        print(f"entries: {len(d)}")
    elif isinstance(d, list):
        print(f"entries: {len(d)}")
else:
    print("token-cache: NOT FOUND")

ac = os.path.join(os.environ["APPDATA"], "Windsurf", "User", "globalStorage",
                  "undefined_publisher.windsurf-login-helper", "windsurf-login-accounts.json")
if os.path.exists(ac):
    with open(ac, "r") as f:
        a = json.load(f)
    print(f"accounts: {len(a)}")
    for i, acc in enumerate(a[:3]):
        print(f"  [{i}] {acc.get('email','?')}")
else:
    print("accounts: NOT FOUND")
