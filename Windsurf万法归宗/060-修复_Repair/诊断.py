#!/usr/bin/env python3
"""
Windsurf 全面诊断工具 v1.0
==========================
一键检查 Windsurf 安装状态、patch状态、认证状态、网络连通性、设备指纹等
用于远程排障时快速定位问题根因

用法: python 诊断.py
"""
import os, sys, json, sqlite3, subprocess, platform, hashlib, shutil
from pathlib import Path
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except: pass

def _find_windsurf():
    """Auto-detect Windsurf installation."""
    candidates = [
        Path(r"D:\Windsurf\resources\app"),
        Path(r"E:\Windsurf\resources\app"),
        Path(os.environ.get("LOCALAPPDATA", "") + r"\Programs\Windsurf\resources\app"),
        Path(r"C:\Program Files\Windsurf\resources\app"),
    ]
    for c in candidates:
        if c.exists() and (c / "package.json").exists():
            return c
    return None

def _file_hash(path):
    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()[:16]
    except: return "N/A"

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def ok(msg): print(f"  ✅ {msg}")
def warn(msg): print(f"  ⚠️  {msg}")
def fail(msg): print(f"  ❌ {msg}")
def info(msg): print(f"  ℹ️  {msg}")

def diag_system():
    section("系统环境")
    info(f"OS: {platform.platform()}")
    info(f"Python: {sys.version.split()[0]}")
    info(f"User: {os.environ.get('USERNAME', 'unknown')}")
    info(f"APPDATA: {os.environ.get('APPDATA', 'N/A')}")
    info(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

def diag_windsurf_install():
    section("Windsurf 安装")
    ws = _find_windsurf()
    if not ws:
        fail("未找到 Windsurf 安装")
        return None
    ok(f"安装路径: {ws.parent.parent}")
    
    pkg = ws / "package.json"
    if pkg.exists():
        try:
            ver = json.loads(pkg.read_text(encoding="utf-8")).get("version", "unknown")
            ok(f"版本: {ver}")
        except: warn("无法读取版本")
    
    # 检查关键文件
    files = {
        "workbench": ws / "out" / "vs" / "workbench" / "workbench.desktop.main.js",
        "extension": ws / "extensions" / "windsurf" / "dist" / "extension.js",
        "chat_client": ws / "node_modules" / "@exa" / "chat-client" / "index.js",
        "product.json": ws / "product.json",
    }
    for name, path in files.items():
        if path.exists():
            sz = path.stat().st_size
            h = _file_hash(path)
            ok(f"{name}: {sz:,}B [{h}]")
        else:
            fail(f"{name}: 不存在")
    return ws

def diag_patches(ws):
    section("Patch 状态")
    if not ws: 
        fail("跳过(未找到Windsurf)")
        return
    
    wb = ws / "out" / "vs" / "workbench" / "workbench.desktop.main.js"
    ext = ws / "extensions" / "windsurf" / "dist" / "extension.js"
    
    if wb.exists():
        content = wb.read_text(encoding="utf-8")
        # P1-P4 markers
        if "maxGeneratorInvocations=9999" in content:
            ok("P2 maxGen=9999 (workbench) — APPLIED")
        elif "maxGeneratorInvocations=0" in content:
            warn("P2 maxGen=0 (workbench) — NOT APPLIED")
        else:
            info("P2 maxGen pattern not found (版本可能已更新)")
        
        # P4 AutoContinue
        if "AutoContinueOnMaxGeneratorInvocations.ENABLED" in content:
            if "UNSPECIFIED&&" not in content or "!==AutoContinueOnMaxGeneratorInvocations.ENABLED" in content:
                ok("P4 AutoContinue=ENABLED — APPLIED")
            else:
                warn("P4 AutoContinue — PARTIAL")
        else:
            warn("P4 AutoContinue — NOT APPLIED")
        
        # P6 Rate Limit
        if "if(!1)return np(),cy(void 0),Ts(Q1.message" in content:
            ok("P6 Rate Limit Bypass — APPLIED")
        elif "if(!Q1.hasCapacity)" in content:
            warn("P6 Rate Limit Bypass — NOT APPLIED")
        
        # GBe patch
        if "globalThis.__wamRateLimit" in content:
            ok("GBe Rate Limit Interceptor — APPLIED")
        else:
            info("GBe Rate Limit Interceptor — NOT APPLIED")
    
    if ext.exists():
        ext_content = ext.read_text(encoding="utf-8")
        if "maxGeneratorInvocations=9999" in ext_content:
            ok("P1 maxGen=9999 (extension) — APPLIED")
        elif "maxGeneratorInvocations=0" in ext_content:
            warn("P1 maxGen=0 (extension) — NOT APPLIED")
        
        if "parallelRolloutConfig||" in ext_content:
            ok("P5 ParallelRollout — APPLIED")
        else:
            info("P5 ParallelRollout — NOT APPLIED (experimental)")

def diag_auth():
    section("认证状态")
    appdata = Path(os.environ.get("APPDATA", "")) / "Windsurf"
    
    # state.vscdb
    state_db = appdata / "User" / "globalStorage" / "state.vscdb"
    if state_db.exists():
        ok(f"state.vscdb: {state_db.stat().st_size:,}B")
        try:
            conn = sqlite3.connect(f"file:{state_db}?mode=ro", uri=True)
            cur = conn.cursor()
            
            # Auth status
            cur.execute("SELECT value FROM ItemTable WHERE key='windsurfAuthStatus'")
            row = cur.fetchone()
            if row:
                auth = json.loads(row[0])
                api_key = auth.get("apiKey", "")
                if api_key:
                    ok(f"apiKey: {api_key[:15]}...{api_key[-8:]} ({len(api_key)}chars)")
                else:
                    warn("apiKey: 空 (未登录)")
            else:
                warn("windsurfAuthStatus: 不存在 (未登录)")
            
            # Plan info
            cur.execute("SELECT value FROM ItemTable WHERE key='windsurf.settings.cachedPlanInfo'")
            row = cur.fetchone()
            if row:
                plan = json.loads(row[0])
                plan_name = plan.get("planName", "?")
                usage = plan.get("usage", {})
                used = usage.get("usedMessages", 0)
                total = usage.get("messages", 0)
                remaining = usage.get("remainingMessages", 0)
                ok(f"Plan: {plan_name} | Messages: {used}/{total} (剩余: {remaining})")
                grace = plan.get("gracePeriodStatus", "?")
                info(f"Grace: {grace}")
            else:
                info("cachedPlanInfo: 不存在")
            
            conn.close()
        except Exception as e:
            warn(f"state.vscdb读取失败: {e}")
    else:
        fail(f"state.vscdb不存在: {state_db}")
    
    # storage.json telemetry
    storage = appdata / "User" / "globalStorage" / "storage.json"
    if storage.exists():
        try:
            data = json.loads(storage.read_text(encoding="utf-8"))
            mid = data.get("telemetry.machineId", "N/A")
            info(f"machineId: {mid[:16]}... ({len(mid)}chars)")
            fsd = data.get("telemetry.firstSessionDate", "N/A")
            info(f"firstSession: {fsd}")
        except Exception as e:
            warn(f"storage.json读取失败: {e}")
    else:
        warn("storage.json不存在")
    
    # .codeium
    codeium = Path.home() / ".codeium" / "windsurf"
    if codeium.exists():
        user_settings = codeium / "user_settings.pb"
        if user_settings.exists():
            ok(f".codeium/user_settings.pb: {user_settings.stat().st_size}B")
        else:
            info(".codeium/user_settings.pb: 不存在")
    else:
        info(".codeium/windsurf: 不存在")

def diag_network():
    section("网络连通性")
    import urllib.request, ssl
    
    PROXY = "http://127.0.0.1:7890"
    urls = [
        ("server.codeium.com", "https://server.codeium.com"),
        ("register.windsurf.com", "https://register.windsurf.com"),
        ("marketplace.windsurf.com", "https://marketplace.windsurf.com"),
    ]
    
    ctx = ssl.create_default_context()
    # 先尝试直连，失败后尝试代理
    for name, url in urls:
        connected = False
        for use_proxy in [False, True]:
            try:
                if use_proxy:
                    handler = urllib.request.ProxyHandler({'https': PROXY, 'http': PROXY})
                    opener = urllib.request.build_opener(handler)
                else:
                    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                req = urllib.request.Request(url, method='HEAD')
                resp = opener.open(req, timeout=10)
                tag = "直连" if not use_proxy else f"代理({PROXY})"
                ok(f"{name}: {resp.status} [{tag}]")
                connected = True
                break
            except urllib.error.HTTPError as e:
                if e.code in (404, 403, 405):
                    tag = "直连" if not use_proxy else f"代理"
                    ok(f"{name}: 响应 {e.code} [{tag}]")
                    connected = True
                    break
            except Exception:
                continue
        if not connected:
            fail(f"{name}: 直连+代理均失败")
    
    # Proxy check
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Internet Settings")
        proxy_enable = winreg.QueryValueEx(key, "ProxyEnable")[0]
        if proxy_enable:
            proxy_server = winreg.QueryValueEx(key, "ProxyServer")[0]
            warn(f"系统代理已启用: {proxy_server}")
        else:
            ok("系统代理: 已禁用")
        winreg.CloseKey(key)
    except Exception:
        info("无法检查系统代理设置")

def diag_settings():
    section("Windsurf 设置")
    settings = Path(os.environ.get("APPDATA", "")) / "Windsurf" / "User" / "settings.json"
    if settings.exists():
        try:
            data = json.loads(settings.read_text(encoding="utf-8-sig"))
            proxy = data.get("http.proxy", "")
            proxy_support = data.get("http.proxySupport", "override")
            proxy_ssl = data.get("http.proxyStrictSSL", True)
            info(f"http.proxy: '{proxy}'")
            info(f"http.proxySupport: '{proxy_support}'")
            info(f"http.proxyStrictSSL: {proxy_ssl}")
            if proxy:
                warn("http.proxy 不为空 — 可能导致连接问题")
            elif proxy_support == "off":
                ok("代理已禁用(直连)")
        except Exception as e:
            warn(f"settings.json解析失败: {e}")
    else:
        info("settings.json不存在")

def diag_processes():
    section("进程状态")
    try:
        r = subprocess.run(
            ["powershell", "-Command", 
             "(Get-Process Windsurf* -EA 0 | Select ProcessName,Id,@{N='MemMB';E={[math]::Round($_.WS/1MB)}} | Format-Table -Auto | Out-String).Trim()"],
            capture_output=True, text=True, timeout=10,
            creationflags=0x08000000
        )
        if r.stdout.strip():
            info("Windsurf 进程:")
            for line in r.stdout.strip().split('\n'):
                print(f"    {line}")
        else:
            info("Windsurf 未运行")
    except Exception:
        info("无法检查进程状态")

def diag_firewall():
    section("安全软件")
    # 火绒检查
    huorong = Path(r"C:\Program Files\Huorong\Sysdiag\bin\HipsDaemon.exe")
    if huorong.exists():
        warn("检测到火绒安全 — 确保Windsurf.exe已加入信任区")
    
    # hosts文件
    hosts = Path(r"C:\Windows\System32\drivers\etc\hosts")
    if hosts.exists():
        try:
            content = hosts.read_text(encoding="utf-8", errors="replace").lower()
            if "codeium" in content or "windsurf" in content:
                fail("hosts文件包含windsurf/codeium相关条目 — 可能导致连接失败!")
            else:
                ok("hosts文件干净")
        except:
            info("无法读取hosts文件")

def main():
    print("╔══════════════════════════════════════════════════════╗")
    print("║        Windsurf 全面诊断工具 v1.0                   ║")
    print("╚══════════════════════════════════════════════════════╝")
    
    diag_system()
    ws = diag_windsurf_install()
    diag_patches(ws)
    diag_auth()
    diag_settings()
    diag_network()
    diag_processes()
    diag_firewall()
    
    section("诊断完成")
    print("  将以上输出截图/复制发送给技术支持即可快速定位问题")
    print()

if __name__ == "__main__":
    main()
    if sys.stdin.isatty():
        input("按 Enter 退出...")
