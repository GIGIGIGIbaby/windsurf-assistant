#!/usr/bin/env python3
"""
_proxy_split.py — 双机代理IP分离
=================================
台式机: 香港节点 (当前)
笔记本: 日本/新加坡节点 (需切换)

确保两台机器出口IP不同，打断服务端IP级聚合限流。

用法:
  python _proxy_split.py status              # 查看当前出口
  python _proxy_split.py set-jp              # 切到日本节点 (笔记本用)
  python _proxy_split.py set-sg              # 切到新加坡节点 (笔记本用)
  python _proxy_split.py set-hk              # 切回香港节点 (台式机用)
  python _proxy_split.py set <node_name>     # 切到指定节点
  python _proxy_split.py verify              # 验证双机IP不同
"""

import json, sys, urllib.request, subprocess
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except: pass

API = 'http://127.0.0.1:39798'

# 推荐节点 (低延迟IEPL优先)
PRESETS = {
    'hk': ['🇭🇰|香港-进阶IEPL 01', '🇭🇰|香港-IEPL 01', '🇭🇰|香港家宽-IEPL 03'],
    'jp': ['🇯🇵|日本-IEPL 01', '🇯🇵|日本原生-IEPL 01', '🇯🇵|日本-IEPL 02'],
    'sg': ['🇸🇬|新加坡-进阶IEPL 04', '🇸🇬|新加坡-IEPL 03', '🇸🇬|新加坡-进阶IEPL 01'],
}

def api_get(path):
    try:
        r = urllib.request.urlopen(f'{API}{path}', timeout=5)
        return json.loads(r.read())
    except:
        return None

def api_put(path, data=None):
    req = urllib.request.Request(f'{API}{path}', method='PUT',
        data=json.dumps(data).encode() if data else b'',
        headers={'Content-Type': 'application/json'})
    try:
        r = urllib.request.urlopen(req, timeout=5)
        return r.status == 204 or r.status == 200
    except Exception as e:
        print(f"  API error: {e}")
        return False

def get_exit_ip():
    try:
        r = subprocess.run(['curl.exe', '-s', '--max-time', '5', '--proxy', 'http://127.0.0.1:7890',
                            'https://api.ipify.org'], capture_output=True, text=True, timeout=8)
        return r.stdout.strip() if r.returncode == 0 else '?'
    except: return '?'

def get_current_node():
    d = api_get('/proxies')
    if not d: return '?', '?'
    proxies = d.get('proxies', {})
    # Follow GLOBAL chain
    g = proxies.get('GLOBAL', {})
    chain = g.get('now', '?')
    node = chain
    depth = 0
    while node in proxies and depth < 5:
        info = proxies[node]
        if info.get('type', '') in ('Selector', 'URLTest', 'Fallback', 'LoadBalance'):
            node = info.get('now', '?')
        else:
            break
        depth += 1
    return chain, node

def set_node(target_name):
    """Switch '节点选择' (Selector) to the target node."""
    d = api_get('/proxies')
    if not d:
        print("  ❌ API不可达")
        return False
    proxies = d.get('proxies', {})

    # Check node exists and is alive
    node_info = proxies.get(target_name)
    if not node_info:
        print(f"  ❌ 节点不存在: {target_name}")
        return False
    if not node_info.get('alive', False):
        print(f"  ⚠️  节点离线: {target_name}")

    # Set on '节点选择' selector
    ok = api_put(f'/proxies/节点选择', {'name': target_name})
    if ok:
        print(f"  ✅ 节点选择 → {target_name}")
    else:
        print(f"  ❌ 设置失败")
        return False

    # Also set GLOBAL to '节点选择'
    api_put(f'/proxies/GLOBAL', {'name': '节点选择'})

    # Verify
    import time; time.sleep(1)
    ip = get_exit_ip()
    print(f"  出口IP: {ip}")
    return True


def cmd_status():
    chain, node = get_current_node()
    ip = get_exit_ip()
    print(f"\n  当前链路: GLOBAL → {chain} → {node}")
    print(f"  出口IP:   {ip}")
    print(f"\n  推荐分离方案:")
    print(f"    台式机: HK节点 (保持)")
    print(f"    笔记本: JP节点 (python _proxy_split.py set-jp)")
    print()


def cmd_set_preset(region):
    print(f"\n  切换到 {region.upper()} 节点...")
    candidates = PRESETS.get(region, [])
    d = api_get('/proxies')
    if not d:
        print("  ❌ API不可达")
        return

    proxies = d.get('proxies', {})
    for name in candidates:
        if name in proxies and proxies[name].get('alive', False):
            set_node(name)
            return

    print(f"  ❌ 无可用{region.upper()}节点")


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args[0] == 'status':
        cmd_status()
    elif args[0] == 'set-hk':
        cmd_set_preset('hk')
    elif args[0] == 'set-jp':
        cmd_set_preset('jp')
    elif args[0] == 'set-sg':
        cmd_set_preset('sg')
    elif args[0] == 'set' and len(args) > 1:
        set_node(' '.join(args[1:]))
    elif args[0] == 'verify':
        print(f"\n  本机出口: {get_exit_ip()}")
        print(f"  请在笔记本运行: python _proxy_split.py status")
        print(f"  两个IP必须不同!")
    else:
        print(__doc__)
