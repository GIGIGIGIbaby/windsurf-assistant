#!/usr/bin/env python3
"""精准定位: 运行中的LS路径 + 二进制对比"""
import os, sys, subprocess, hashlib, json
from pathlib import Path

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except: pass

def sep(t):
    print(f'\n{"="*60}\n  {t}\n{"="*60}')

# ═══════ 1. 用 PowerShell 找到运行中的 LS 路径 ═══════
sep('1: 运行中的 LS 进程路径')

try:
    r = subprocess.run(
        ['powershell', '-Command', 
         "Get-Process language_server_windows_x64 -ErrorAction SilentlyContinue | Select-Object Id, Path | Format-List"],
        capture_output=True, text=True, timeout=10, encoding='utf-8', errors='replace'
    )
    print(f'  {r.stdout.strip()}')
    if not r.stdout.strip():
        print('  (无进程)')
except Exception as e:
    print(f'  错误: {e}')

# ═══════ 2. 搜索所有 LS 二进制文件 ═══════
sep('2: 搜索所有 LS 二进制文件')

search_roots = [
    Path(r'C:\Users\Administrator\.codeium'),
    Path(r'C:\Users\zhouyoukang\.codeium'),
    Path(r'E:\Windsurf'),
]

backup_sha = '51fa5589031727e87173db62b2e9c889952e3787613cbb972ddea6b528fd3d8e'

for root in search_roots:
    if not root.exists():
        continue
    for f in root.rglob('language_server_windows_x64.exe'):
        sz = f.stat().st_size
        sha = hashlib.sha256(f.read_bytes()).hexdigest()
        match = 'MATCH backup' if sha == backup_sha else 'DIFFERENT from backup'
        print(f'  {f}')
        print(f'    size={sz:,}B  sha256={sha[:24]}...  [{match}]')
        
        # 检查篡改
        data = f.read_bytes()
        orig = b'CentralProcessor\\0'
        tampered = b'CentralProcessor\\9'
        if tampered in data:
            print(f'    !!! L1篡改: CentralProcessor\\9 found')
        elif orig in data:
            print(f'    L1: 原始 (CentralProcessor\\0)')
        else:
            print(f'    L1: 两者都未找到')

# ═══════ 3. .codeium/windsurf 完整目录树 ═══════
sep('3: .codeium/windsurf 完整目录树 (仅目录)')

codeium = Path(r'C:\Users\Administrator\.codeium\windsurf')
if codeium.exists():
    for d in sorted(codeium.rglob('*')):
        if d.is_dir():
            file_count = sum(1 for _ in d.iterdir() if _.is_file())
            print(f'  {d.relative_to(codeium)}/  ({file_count} files)')

# ═══════ 4. E:\Windsurf\bin 检查 ═══════
sep('4: E:\\Windsurf 中的 LS')

ws_bin = Path(r'E:\Windsurf\resources\app\extensions\windsurf\bin')
if ws_bin.exists():
    for f in ws_bin.iterdir():
        print(f'  {f.name}  ({f.stat().st_size:,}B)')

# 也检查 Windsurf 自身是否嵌入了 LS
for f in Path(r'E:\Windsurf\resources\app\extensions\windsurf').rglob('language_server*'):
    print(f'  {f}  ({f.stat().st_size:,}B)')

# ═══════ 5. WAM 扩展详细检查 ═══════
sep('5: WAM 扩展详细')

ext_dir = Path(r'C:\Users\Administrator\.windsurf\extensions')
for wam in ext_dir.glob('*wam*'):
    print(f'  {wam.name}/')
    for f in sorted(wam.rglob('*')):
        if f.is_file():
            print(f'    {f.relative_to(wam)}  ({f.stat().st_size:,}B)')

# ═══════ 6. extensions.json 内容 ═══════
sep('6: extensions.json')
ej = ext_dir / 'extensions.json'
if ej.exists():
    data = json.loads(ej.read_text(encoding='utf-8'))
    for ext in data:
        ident = ext.get('identifier', {}).get('id', '?')
        ver = ext.get('version', '?')
        loc = ext.get('location', {})
        path = loc.get('path', loc) if isinstance(loc, dict) else str(loc)[:80]
        print(f'  {ident} v{ver}  path={str(path)[:80]}')

print('\n  完成')
