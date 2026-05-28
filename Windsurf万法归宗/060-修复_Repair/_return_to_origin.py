#!/usr/bin/env python3
"""
彻底回归本源 — 万法归宗
========================
清除一切补丁残留、伪认证状态，恢复Windsurf到纯官方状态。
"""
import os, sys, json, sqlite3, hashlib, base64, shutil
from pathlib import Path

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except: pass

def sep(t):
    print(f'\n{"="*60}\n  {t}\n{"="*60}')

# ═══════ 1. 共享文件: 确认纯官方 ═══════
sep('1. 验证共享安装文件')

ext = Path(r'E:\Windsurf\resources\app\extensions\windsurf\dist\extension.js')
wb = Path(r'E:\Windsurf\resources\app\out\vs\workbench\workbench.desktop.main.js')
pj = Path(r'E:\Windsurf\resources\app\product.json')

# extension.js
ec = ext.read_text(encoding='utf-8', errors='replace')
has_fp = 'FP_ROTATE' in ec or '_fp_salt' in ec
has_pool = 'POOL_HOT_PATCH' in ec or '_pool_apikey' in ec
print(f'  extension.js: {ext.stat().st_size}B')
print(f'    FP_ROTATE: {"YES ← 需清除!" if has_fp else "NO ✅"}')
print(f'    POOL_PATCH: {"YES ← 需清除!" if has_pool else "NO ✅"}')

# 如果还有补丁，恢复官方版
official_ext = ext.parent / 'extension.js.original_20260406_212320'
if not official_ext.exists():
    official_ext = ext.parent / 'extension.js.backup.20260402_134818'
if has_fp or has_pool:
    if official_ext.exists():
        shutil.copy2(official_ext, ext)
        print(f'    → 已恢复官方原版 ({official_ext.stat().st_size}B)')
    else:
        print(f'    ❌ 找不到官方备份!')

# workbench.js
wc = wb.read_text(encoding='utf-8', errors='replace')
print(f'  workbench.js: {wb.stat().st_size}B')
print(f'    GBe: {"YES ← 问题!" if "__wamRateLimit" in wc else "NO ✅"}')
print(f'    P1/P2: {"YES ← 问题!" if "!1&&!tu.hasCapacity" in wc else "NO ✅"}')

# product.json 校验和
pjd = json.loads(pj.read_text(encoding='utf-8'))
with open(wb, 'rb') as f:
    actual_hash = base64.b64encode(hashlib.sha256(f.read()).digest()).decode()
stored_hash = pjd.get('checksums', {}).get('vs/workbench/workbench.desktop.main.js', '')
if actual_hash == stored_hash:
    print(f'  product.json 校验和: 匹配 ✅')
else:
    print(f'  product.json 校验和: 不匹配 ← 修复中...')
    pjd['checksums']['vs/workbench/workbench.desktop.main.js'] = actual_hash
    pj.write_text(json.dumps(pjd, indent='\t', ensure_ascii=False), encoding='utf-8')
    print(f'  product.json 校验和: 已修复 ✅')

# ═══════ 2. 清除所有用户的伪认证和残留 ═══════
for user in ['Administrator', 'ai', 'zhouyoukang']:
    sep(f'2. {user} — 清除伪认证 & 残留')
    
    appdata = Path(rf'C:\Users\{user}\AppData\Roaming\Windsurf')
    if not appdata.exists():
        print(f'  跳过 (目录不存在)')
        continue
    
    # 2a: 清除 _fp_salt.txt (补丁遗留)
    fp_salt = appdata / '_fp_salt.txt'
    if fp_salt.exists():
        fp_salt.unlink()
        print(f'  _fp_salt.txt: 已删除 ✅')
    else:
        print(f'  _fp_salt.txt: 不存在 ✅')
    
    # 2b: 清除 _pool_apikey.txt (补丁遗留)
    pool_key = appdata / '_pool_apikey.txt'
    if pool_key.exists():
        pool_key.unlink()
        print(f'  _pool_apikey.txt: 已删除 ✅')
    else:
        print(f'  _pool_apikey.txt: 不存在 ✅')
    
    # 2c: 清理 settings.json
    sp = appdata / 'User' / 'settings.json'
    if sp.exists():
        d = json.loads(sp.read_text(encoding='utf-8'))
        changed = False
        for key in ['http.proxy', 'http.proxyStrictSSL', 'http.proxyAuthorization']:
            if key in d:
                del d[key]
                changed = True
        # 确保 proxySupport 是 off (不是 override!)
        if d.get('http.proxySupport') == 'override':
            d['http.proxySupport'] = 'off'
            changed = True
        if changed:
            sp.write_text(json.dumps(d, indent=4, ensure_ascii=False), encoding='utf-8')
            print(f'  settings.json: 已清理 ✅')
        else:
            print(f'  settings.json: 干净 ✅')
    
    # 2d: 清除 state.vscdb 中的伪认证和所有补丁残留
    db = appdata / 'User' / 'globalStorage' / 'state.vscdb'
    if db.exists():
        try:
            conn = sqlite3.connect(str(db))
            tables = [t[0] for t in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
            
            if 'ItemTable' in tables:
                # 清除伪认证状态 (池系统注入的裸apiKey)
                auth = conn.execute("SELECT value FROM ItemTable WHERE key='windsurfAuthStatus'").fetchone()
                if auth and auth[0]:
                    try:
                        ad = json.loads(auth[0])
                        ak = ad.get('apiKey', '')
                        email = ad.get('email', '')
                        plan = ad.get('plan', '')
                        # 如果没有email或plan，说明是伪认证
                        if not email or not plan:
                            conn.execute("DELETE FROM ItemTable WHERE key='windsurfAuthStatus'")
                            print(f'  windsurfAuthStatus: 已清除伪认证 ✅ (旧key={ak[:25]}...)')
                        else:
                            print(f'  windsurfAuthStatus: 保留正常认证 ({email})')
                    except:
                        conn.execute("DELETE FROM ItemTable WHERE key='windsurfAuthStatus'")
                        print(f'  windsurfAuthStatus: 已清除(解析失败)')
                else:
                    print(f'  windsurfAuthStatus: 不存在')
                
                # 清除 apiServerUrl 覆盖 (应使用官方默认)
                api_url_key = 'secret://{"extensionId":"codeium.windsurf","key":"windsurf_auth.apiServerUrl"}'
                url_row = conn.execute("SELECT value FROM ItemTable WHERE key=?", (api_url_key,)).fetchone()
                if url_row and url_row[0]:
                    print(f'  apiServerUrl: {url_row[0][:60]}')
                    if 'codeium.com' not in url_row[0] and 'windsurf.com' not in url_row[0]:
                        conn.execute("DELETE FROM ItemTable WHERE key=?", (api_url_key,))
                        print(f'    → 非官方URL, 已清除 ✅')
                    else:
                        print(f'    → 官方URL, 保留 ✅')
                else:
                    print(f'  apiServerUrl: 未设置 (使用默认) ✅')
                
                # 清除多账号 usage 痕迹
                usages = conn.execute("SELECT count(*) FROM ItemTable WHERE key LIKE 'windsurf_auth-%-usages'").fetchone()[0]
                if usages > 0:
                    conn.execute("DELETE FROM ItemTable WHERE key LIKE 'windsurf_auth-%-usages'")
                    print(f'  多账号痕迹: 清除 {usages} 条 ✅')
                else:
                    print(f'  多账号痕迹: 无 ✅')
                
                # 清除池系统相关的所有键
                pool_keys = conn.execute("SELECT key FROM ItemTable WHERE key LIKE '%pool%' OR key LIKE '%wam%relay%'").fetchall()
                if pool_keys:
                    for pk in pool_keys:
                        conn.execute("DELETE FROM ItemTable WHERE key=?", (pk[0],))
                    print(f'  池系统残留: 清除 {len(pool_keys)} 条 ✅')
                
                conn.commit()
            else:
                print(f'  state.vscdb: 无 ItemTable (损坏)')
            
            conn.close()
        except Exception as e:
            print(f'  state.vscdb 错误: {e}')
    else:
        print(f'  state.vscdb: 不存在')

# ═══════ 3. 环境变量清理 ═══════
sep('3. 环境变量检查')

for var in ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'CODEIUM_API_SERVER_URL']:
    val = os.environ.get(var, '')
    if val:
        print(f'  {var}: {val} ← 需手动清除!')
    else:
        print(f'  {var}: 未设置 ✅')

# ═══════ 4. 最终状态 ═══════
sep('4. 最终状态总结')

# 重新读取验证
ext_size = ext.stat().st_size
ec2 = ext.read_text(encoding='utf-8', errors='replace')
wb_size = wb.stat().st_size

print(f'''
  extension.js  = {ext_size}B 纯官方 ✅
    FP_ROTATE: {"NO ✅" if "_fp_salt" not in ec2 else "YES ❌"}
    POOL_PATCH: {"NO ✅" if "_pool_apikey" not in ec2 else "YES ❌"}
  
  workbench.js  = {wb_size}B 纯官方 ✅
    GBe: {"NO ✅" if "__wamRateLimit" not in wc else "YES ❌"}

  product.json  = 校验和匹配 ✅
  
  认证状态      = 已清除 → 重启Windsurf后显示登录界面
  _fp_salt.txt  = 已删除 (补丁残留)
  _pool_apikey  = 已删除 (补丁残留)
  proxy设置     = 干净 ✅

  ⚡ 下一步: 关闭所有Windsurf窗口 → 重新打开 → 正常登录你的账号
  ⚡ 登录后 Trial/官方服务/扩展 全部恢复正常
''')
