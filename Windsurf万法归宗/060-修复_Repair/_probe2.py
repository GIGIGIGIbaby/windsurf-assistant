#!/usr/bin/env python3
"""精准探测: LS二进制 + WAM + telemetry"""
import os, sys, json, sqlite3, hashlib
from pathlib import Path
from datetime import datetime

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except: pass

def sep(t):
    print(f'\n{"="*60}\n  {t}\n{"="*60}')

# ═══════ L1: LS 二进制对比 ═══════
sep('L1: LS 二进制 — 当前 vs 备份')

codeium = Path(r'C:\Users\Administrator\.codeium\windsurf')
current_ls = None
if codeium.exists():
    for d in sorted(codeium.iterdir(), reverse=True):
        if d.is_dir() and 'language_server' in d.name:
            exe = d / 'language_server_windows_x64.exe'
            if exe.exists():
                current_ls = exe
                break

backup_ls = Path(r'e:\道\道生一\一生二\Windsurf万法归宗\060-修复_Repair\_fingerprint_backups\ls_51fa5589031727e8.exe.bak')

if current_ls:
    cur_sz = current_ls.stat().st_size
    cur_mt = datetime.fromtimestamp(current_ls.stat().st_mtime).strftime('%Y-%m-%d %H:%M')
    cur_sha = hashlib.sha256(current_ls.read_bytes()).hexdigest()
    print(f'  当前LS: {current_ls}')
    print(f'    size={cur_sz:,}B  mtime={cur_mt}')
    print(f'    sha256={cur_sha}')
    
    # 检查篡改标记
    data = current_ls.read_bytes()
    
    # L1: 注册表路径
    orig = b'CentralProcessor\\0'
    tampered = b'CentralProcessor\\9'
    has_orig = orig in data
    has_tampered = tampered in data
    print(f'    CentralProcessor\\0 (原始): {"found" if has_orig else "NOT found"}')
    print(f'    CentralProcessor\\9 (篡改): {"found !!!" if has_tampered else "NOT found"}')
    
    if has_orig and not has_tampered:
        print(f'    >>> L1: 二进制未篡改 (原始)')
    elif has_tampered:
        print(f'    >>> L1: 二进制已篡改!!!')
    elif not has_orig and not has_tampered:
        print(f'    >>> L1: 无法确定 (两者都未找到)')
else:
    print(f'  当前LS: NOT FOUND')

if backup_ls.exists():
    bak_sz = backup_ls.stat().st_size
    bak_sha = hashlib.sha256(backup_ls.read_bytes()).hexdigest()
    print(f'\n  备份LS: {backup_ls.name}')
    print(f'    size={bak_sz:,}B')
    print(f'    sha256={bak_sha}')
    
    if current_ls:
        if cur_sha == bak_sha:
            print(f'    >>> 当前 == 备份 (相同)')
        else:
            print(f'    >>> 当前 != 备份 (不同!!!)')
            print(f'    size diff: {cur_sz - bak_sz:+,}B')
else:
    print(f'\n  备份LS: NOT FOUND')

# ═══════ L3: Telemetry IDs ═══════
sep('L3: Telemetry IDs')

db = Path(r'C:\Users\Administrator\AppData\Roaming\Windsurf\User\globalStorage\state.vscdb')
if db.exists():
    conn = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
    for key in ['telemetry.machineId', 'telemetry.devDeviceId', 'telemetry.sqmId', 'storage.serviceMachineId']:
        row = conn.execute("SELECT value FROM ItemTable WHERE key=?", (key,)).fetchone()
        val = row[0][:60] if row and row[0] else 'NOT SET'
        print(f'  {key}: {val}')
    conn.close()

# ═══════ L5: WAM 扩展位置 ═══════
sep('L5: WAM 扩展安装位置')

# Windsurf extensions 可能在多个位置
ext_locations = [
    Path(r'C:\Users\Administrator\.windsurf\extensions'),
    Path(r'E:\Windsurf\data\extensions'),
    Path(r'C:\Users\Administrator\AppData\Roaming\Windsurf\extensions'),
]

for loc in ext_locations:
    if loc.exists():
        print(f'  检查: {loc}')
        for d in loc.iterdir():
            if 'wam' in d.name.lower() or 'account' in d.name.lower() or 'switch' in d.name.lower() or 'login' in d.name.lower() or 'assistant' in d.name.lower():
                print(f'    !!! {d.name}')
                pj = d / 'package.json'
                if pj.exists():
                    data = json.loads(pj.read_text(encoding='utf-8'))
                    print(f'        name={data.get("name")} ver={data.get("version")} publisher={data.get("publisher")}')
            else:
                print(f'    {d.name}')
    else:
        print(f'  不存在: {loc}')

# 也检查 E:\Windsurf\data\user-data 路径
for p in [Path(r'E:\Windsurf\data'), Path(r'E:\Windsurf\resources\app\extensions')]:
    if p.exists():
        print(f'\n  检查: {p}')
        for d in p.iterdir():
            if d.is_dir() and ('wam' in d.name.lower() or 'login-helper' in d.name.lower() or 'assistant' in d.name.lower()):
                print(f'    !!! {d.name}')

# ═══════ L9: .codeium 完整结构 ═══════
sep('L9: .codeium/windsurf 结构')

if codeium.exists():
    for item in sorted(codeium.iterdir()):
        if item.is_dir():
            count = sum(1 for _ in item.rglob('*') if _.is_file())
            print(f'  [DIR] {item.name}/  ({count} files)')
        else:
            print(f'  [FIL] {item.name}  ({item.stat().st_size:,}B)')

# installation_id
sep('L2: installation_id')
for f in codeium.rglob('*'):
    if 'install' in f.name.lower() and f.is_file():
        print(f'  {f.relative_to(codeium)}  ({f.stat().st_size:,}B)')
        if f.stat().st_size < 1000:
            print(f'    content: {f.read_text(errors="replace").strip()[:100]}')

# implicit pb 文件 (可能包含 installation_id)
for f in codeium.glob('implicit/*.pb'):
    print(f'  implicit/{f.name}: {f.stat().st_size:,}B')

# user_settings.pb
usp = codeium / 'user_settings.pb'
if usp.exists():
    data = usp.read_bytes()
    print(f'\n  user_settings.pb: {len(data):,}B')
    # 搜索可疑字符串
    for marker in [b'installation_id', b'machine_id', b'device_id', b'fingerprint']:
        idx = data.find(marker)
        if idx >= 0:
            ctx = data[max(0,idx-10):idx+80]
            print(f'    found "{marker.decode()}" at offset {idx}')

print('\n  完成')
