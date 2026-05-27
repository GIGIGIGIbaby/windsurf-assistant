#!/usr/bin/env python3
"""
深层探测 — 检测所有 agent 底层改动
===================================
L1: Go Binary 硬件指纹中和 (注册表路径篡改)
L2: installation_id 轮换
L3: Telemetry ID 篡改
L4: Protobuf field remap (source_address/device_fingerprint)
L5: WAM 扩展及其残留
L6: _anti_fingerprint.py 等深层脚本
L7: Go binary backup 检测
"""
import os, sys, json, sqlite3, hashlib, struct, re
from pathlib import Path
from datetime import datetime

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except: pass

def sep(t):
    print(f'\n{"="*60}\n  {t}\n{"="*60}')

# ═══════════════════════════════════════════════════════════
# L1: Language Server Go Binary 检测
# ═══════════════════════════════════════════════════════════
sep('L1: Language Server Go Binary 检测')

# 找到所有 LS 二进制
ls_dirs = []
for user in ['Administrator', 'zhouyoukang']:
    codeium = Path(rf'C:\Users\{user}\.codeium\windsurf')
    if codeium.exists():
        for d in sorted(codeium.iterdir(), reverse=True):
            if d.is_dir() and 'language_server' in d.name:
                ls_dirs.append((user, d))

for user, d in ls_dirs:
    exe = d / 'language_server_windows_x64.exe'
    if not exe.exists():
        print(f'  [{user}] {d.name}: NO EXE')
        continue
    
    sz = exe.stat().st_size
    mt = datetime.fromtimestamp(exe.stat().st_mtime).strftime('%Y-%m-%d %H:%M')
    sha = hashlib.sha256(exe.read_bytes()).hexdigest()[:24]
    print(f'  [{user}] {d.name}:')
    print(f'    size={sz:,}B  mtime={mt}  sha256={sha}...')
    
    # L1检测: 搜索注册表路径篡改
    # 原始: HARDWARE\DESCRIPTION\System\CentralProcessor\0
    # 篡改: HARDWARE\DESCRIPTION\System\CentralProcessor\9
    data = exe.read_bytes()
    
    # 搜索原始路径
    orig_path = b'HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0'
    tampered_path = b'HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\9'
    # 也检查UTF-16编码 (Go在Windows上可能用宽字符)
    orig_path_w = 'HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0'.encode('utf-16-le')
    tampered_path_w = 'HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\9'.encode('utf-16-le')
    
    has_orig = orig_path in data or orig_path_w in data
    has_tampered = tampered_path in data or tampered_path_w in data
    
    if has_orig and not has_tampered:
        print(f'    L1 硬件指纹: 原始 (CentralProcessor\\0) ✅')
    elif has_tampered:
        print(f'    L1 硬件指纹: !!!已篡改!!! (CentralProcessor\\9) ❌')
    else:
        print(f'    L1 硬件指纹: 路径未找到 (可能用其他方式)')
    
    # L4检测: Protobuf field remap
    # 检测二进制中的特征字节模式
    # field 11->99, field 12->97, field 24->98
    # protobuf field number 在 varint 编码中:
    # field 11, wire type 2 (length-delimited) = (11 << 3) | 2 = 90 = 0x5A
    # field 99, wire type 2 = (99 << 3) | 2 = 794 = varint 0x9A 0x06
    # field 12, wire type 2 = (12 << 3) | 2 = 98 = 0x62
    # field 97, wire type 2 = (97 << 3) | 2 = 778 = varint 0x8A 0x06
    # field 24, wire type 2 = (24 << 3) | 2 = 194 = varint 0xC2 0x01
    # field 98, wire type 2 = (98 << 3) | 2 = 786 = varint 0x92 0x06
    
    # 更实际的检测方法: 在Go二进制中搜索特征字符串
    # source_address, device_fingerprint 等 protobuf 字段名
    
    fp_markers = [
        (b'source_address', 'source_address field name'),
        (b'device_fingerprint', 'device_fingerprint field name'),
        (b'hardware_info', 'hardware_info field'),
        (b'GetHardware', 'GetHardware function'),
        (b'installation_id', 'installation_id field'),
    ]
    
    print(f'    Protobuf字段检测:')
    for marker, desc in fp_markers:
        count = data.count(marker)
        print(f'      {desc}: {count} occurrences')
    
    # 检查二进制是否被直接修改 (通过比较备份)
    # 截图中提到: _fingerprint_backups/ls_51fa5589031727e8.exe.bak
    
# ═══════════════════════════════════════════════════════════
# L2: installation_id 检测
# ═══════════════════════════════════════════════════════════
sep('L2: installation_id 检测')

for user in ['Administrator', 'zhouyoukang']:
    codeium = Path(rf'C:\Users\{user}\.codeium\windsurf')
    if not codeium.exists():
        print(f'  [{user}] .codeium/windsurf 不存在')
        continue
    
    # installation_id 文件
    inst_id = None
    for f in codeium.rglob('installation_id'):
        content = f.read_text(encoding='utf-8', errors='replace').strip()
        print(f'  [{user}] {f}: {content[:40]}...')
        inst_id = content
    
    if not inst_id:
        # 可能在某个 pb 文件中
        for f in codeium.glob('*.pb'):
            print(f'  [{user}] pb文件: {f.name} ({f.stat().st_size:,}B)')

# ═══════════════════════════════════════════════════════════
# L3: Telemetry ID 检测
# ═══════════════════════════════════════════════════════════
sep('L3: Telemetry ID 检测 (state.vscdb)')

for user in ['Administrator', 'zhouyoukang']:
    db = Path(rf'C:\Users\{user}\AppData\Roaming\Windsurf\User\globalStorage\state.vscdb')
    if not db.exists():
        print(f'  [{user}] state.vscdb 不存在')
        continue
    
    try:
        conn = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
        telemetry_keys = [
            'telemetry.machineId',
            'telemetry.devDeviceId', 
            'telemetry.sqmId',
            'storage.serviceMachineId',
        ]
        for key in telemetry_keys:
            row = conn.execute("SELECT value FROM ItemTable WHERE key=?", (key,)).fetchone()
            if row:
                val = row[0][:50] if row[0] else 'NULL'
                print(f'  [{user}] {key}: {val}')
            else:
                print(f'  [{user}] {key}: 不存在')
        conn.close()
    except Exception as e:
        print(f'  [{user}] 错误: {e}')

# ═══════════════════════════════════════════════════════════
# L5: WAM 扩展检测
# ═══════════════════════════════════════════════════════════
sep('L5: WAM 扩展检测')

for user in ['Administrator', 'zhouyoukang']:
    ext_dir = Path(rf'C:\Users\{user}\.windsurf\extensions')
    if not ext_dir.exists():
        # 也检查 Windsurf 默认扩展路径
        ext_dir = Path(rf'C:\Users\{user}\AppData\Roaming\Windsurf\extensions')
    
    if ext_dir.exists():
        wam_dirs = list(ext_dir.glob('*wam*'))
        if wam_dirs:
            for wd in wam_dirs:
                print(f'  [{user}] WAM扩展: {wd}')
                # 检查 package.json
                pj = wd / 'package.json'
                if pj.exists():
                    d = json.loads(pj.read_text(encoding='utf-8'))
                    print(f'    name={d.get("name")}, version={d.get("version")}')
        else:
            print(f'  [{user}] 无WAM扩展 in {ext_dir}')
    else:
        print(f'  [{user}] 扩展目录不存在')

# 也检查 Windsurf 内置扩展路径
print(f'\n  检查共享扩展:')
ws_ext = Path(r'E:\Windsurf\resources\app\extensions')
for d in ws_ext.iterdir():
    if 'wam' in d.name.lower():
        print(f'    共享扩展: {d.name}')
        pj = d / 'package.json'
        if pj.exists():
            data = json.loads(pj.read_text(encoding='utf-8'))
            print(f'      name={data.get("name")}, version={data.get("version")}')

# 检查 globalStorage 中的 WAM 数据
for user in ['Administrator', 'zhouyoukang']:
    gs = Path(rf'C:\Users\{user}\AppData\Roaming\Windsurf\User\globalStorage')
    if gs.exists():
        wam_dirs = list(gs.glob('*wam*'))
        for wd in wam_dirs:
            print(f'  [{user}] WAM globalStorage: {wd}')
            if wd.is_dir():
                for f in wd.iterdir():
                    print(f'    {f.name} ({f.stat().st_size:,}B)')

# ═══════════════════════════════════════════════════════════
# L6: 深层修改脚本检测
# ═══════════════════════════════════════════════════════════
sep('L6: 深层修改脚本检测')

repo = Path(r'e:\道\道生一\一生二')
search_patterns = [
    '*anti_fingerprint*',
    '*proxy_split*', 
    '*wam_engine*',
    '*fingerprint_backup*',
    '*_fingerprint*',
]

for pat in search_patterns:
    for f in repo.rglob(pat):
        if '.git' in str(f):
            continue
        print(f'  {f.relative_to(repo)}  ({f.stat().st_size:,}B)')

# 检查 060-修复_Repair 目录
repair_dir = repo / 'Windsurf万法归宗' / '060-修复_Repair'
if repair_dir.exists():
    print(f'\n  060-修复_Repair 目录:')
    for f in sorted(repair_dir.rglob('*')):
        if f.is_file() and '.git' not in str(f):
            print(f'    {f.relative_to(repair_dir)}  ({f.stat().st_size:,}B)')

# ═══════════════════════════════════════════════════════════
# L7: Go Binary Backup 检测
# ═══════════════════════════════════════════════════════════
sep('L7: Go Binary 备份检测')

# 截图提到: _fingerprint_backups/ls_51fa5589031727e8.exe.bak
for pat in ['*fingerprint_backup*', '*ls_*.exe.bak', '*language_server*.bak']:
    for f in repo.rglob(pat):
        if '.git' not in str(f):
            print(f'  {f.relative_to(repo)}  ({f.stat().st_size:,}B)')

# 也在 .codeium 中查找备份
for user in ['Administrator', 'zhouyoukang']:
    codeium = Path(rf'C:\Users\{user}\.codeium')
    if codeium.exists():
        for f in codeium.rglob('*.bak'):
            print(f'  [{user}] {f}  ({f.stat().st_size:,}B)')

# ═══════════════════════════════════════════════════════════
# L8: 当前 LS 进程详细信息
# ═══════════════════════════════════════════════════════════
sep('L8: 当前 Language Server 进程')

import subprocess
try:
    r = subprocess.run(
        ['wmic', 'process', 'where', "name='language_server_windows_x64.exe'", 'get', 
         'ProcessId,ExecutablePath,CommandLine', '/FORMAT:LIST'],
        capture_output=True, text=True, timeout=10
    )
    print(f'  {r.stdout.strip()[:2000]}')
except Exception as e:
    print(f'  wmic失败: {e}')
    try:
        r = subprocess.run(
            ['tasklist', '/FI', 'IMAGENAME eq language_server_windows_x64.exe', '/V', '/FO', 'LIST'],
            capture_output=True, text=True, timeout=5
        )
        print(f'  {r.stdout.strip()[:1000]}')
    except:
        pass

print('\n' + '='*60)
print('  深层探测完成')
print('='*60)
