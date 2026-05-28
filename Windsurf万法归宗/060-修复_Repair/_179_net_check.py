#!/usr/bin/env python3
"""Network check for 179 - proxy, ports, connectivity."""
import subprocess, sys, socket, urllib.request, ssl
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def run_ps(cmd):
    r = subprocess.run(['powershell', '-NoProfile', '-Command', cmd], capture_output=True, text=True, timeout=30)
    return (r.stdout + r.stderr).strip()

# 1. What's on port 7890?
print("=== Port 7890 Owner ===")
print(run_ps("""
$c = Get-NetTCPConnection -LocalPort 7890 -EA SilentlyContinue
if($c){
    $c | ForEach-Object {
        $p = Get-Process -Id $_.OwningProcess -EA SilentlyContinue
        Write-Host "  PID=$($_.OwningProcess) State=$($_.State) Process=$($p.ProcessName) Path=$($p.Path)"
    }
} else { Write-Host '  Nothing listening on 7890' }
"""))

# 2. Test 141:17890 (settings.json proxy)
print("\n=== 141:17890 Connectivity ===")
try:
    s = socket.create_connection(("192.168.31.141", 17890), timeout=3)
    s.close()
    print("  TCP OPEN: 192.168.31.141:17890")
except Exception as e:
    print(f"  TCP FAIL: 192.168.31.141:17890 -> {e}")

# 3. Test 141:7890 (standard Clash port)
print("\n=== 141:7890 Connectivity ===")
try:
    s = socket.create_connection(("192.168.31.141", 7890), timeout=3)
    s.close()
    print("  TCP OPEN: 192.168.31.141:7890")
except Exception as e:
    print(f"  TCP FAIL: 192.168.31.141:7890 -> {e}")

# 4. Test local 7890 as HTTP proxy
print("\n=== Local Proxy 127.0.0.1:7890 Test ===")
tests = [
    ("https://identitytoolkit.googleapis.com", "Firebase Auth"),
    ("https://www.google.com", "Google (GFW)"),
    ("https://server.codeium.com", "Codeium Server"),
]
for url, name in tests:
    try:
        proxy_handler = urllib.request.ProxyHandler({'https': 'http://127.0.0.1:7890', 'http': 'http://127.0.0.1:7890'})
        opener = urllib.request.build_opener(proxy_handler)
        req = urllib.request.Request(url, headers={'User-Agent': 'Diag/1.0'})
        r = opener.open(req, timeout=8)
        print(f"  PROXY-OK: {name} HTTP {r.status}")
    except urllib.error.HTTPError as e:
        print(f"  PROXY-REACH: {name} HTTP {e.code} (reachable!)")
    except Exception as e:
        msg = str(e)[:100]
        print(f"  PROXY-FAIL: {name} -> {msg}")

# 5. Test 141:17890 as HTTP proxy
print("\n=== Remote Proxy 192.168.31.141:17890 Test ===")
for url, name in tests:
    try:
        proxy_handler = urllib.request.ProxyHandler({'https': 'http://192.168.31.141:17890', 'http': 'http://192.168.31.141:17890'})
        opener = urllib.request.build_opener(proxy_handler)
        req = urllib.request.Request(url, headers={'User-Agent': 'Diag/1.0'})
        r = opener.open(req, timeout=8)
        print(f"  PROXY-OK: {name} HTTP {r.status}")
    except urllib.error.HTTPError as e:
        print(f"  PROXY-REACH: {name} HTTP {e.code} (reachable!)")
    except Exception as e:
        msg = str(e)[:100]
        print(f"  PROXY-FAIL: {name} -> {msg}")

# 6. Windsurf proxySupport behavior analysis
print("\n=== Windsurf Proxy Config Analysis ===")
print("  settings.json:")
print("    http.proxy = http://192.168.31.141:17890")
print("    http.proxySupport = fallback")
print("    http.proxyStrictSSL = false")
print("  Meaning: 'fallback' = use proxy only if direct fails")
print("  For Firebase (GFW blocked): direct fails -> should try 141:17890 proxy")
print("  For Codeium (direct OK): direct succeeds -> no proxy needed")

# 7. Check if Windsurf is connected to Cascade
print("\n=== Windsurf Active Windows ===")
print(run_ps("""
Get-Process Windsurf -EA SilentlyContinue | Where-Object { $_.MainWindowTitle } | ForEach-Object {
    Write-Host "  PID=$($_.Id) Title=$($_.MainWindowTitle)"
}
"""))

# 8. Check Clash subscription/config
print("\n=== Clash/Proxy Config Files ===")
import os, glob
user_home = os.environ['USERPROFILE']
clash_paths = [
    os.path.join(user_home, '.config', 'clash'),
    os.path.join(user_home, '.config', 'mihomo'),
    os.path.join(os.environ.get('APPDATA',''), 'clash'),
    os.path.join(os.environ.get('LOCALAPPDATA',''), 'SakuraCat'),
    os.path.join(os.environ.get('LOCALAPPDATA',''), 'Clash'),
    os.path.join(os.environ.get('LOCALAPPDATA',''), 'clash-verge'),
]
for p in clash_paths:
    if os.path.isdir(p):
        files = os.listdir(p)[:20]
        print(f"  {p}: {files}")

# 9. Windsurf version & install path details
print("\n=== Windsurf Install ===")
ws_paths = [r'E:\Windsurf', r'C:\Program Files\Windsurf', 
            os.path.join(os.environ.get('LOCALAPPDATA',''), 'Programs', 'Windsurf'),
            os.path.join(os.environ.get('LOCALAPPDATA',''), 'Windsurf')]
for p in ws_paths:
    exe = os.path.join(p, 'Windsurf.exe')
    if os.path.exists(exe):
        print(f"  FOUND: {p}")
        pkg = os.path.join(p, 'resources', 'app', 'package.json')
        if os.path.exists(pkg):
            import json
            d = json.load(open(pkg))
            print(f"  Version: {d.get('version','?')}")
