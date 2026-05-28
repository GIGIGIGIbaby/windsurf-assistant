#!/usr/bin/env python3
"""
万法归宗 · 深层最终修复
========================
1. 恢复 LS 二进制原版 (从备份)
2. 卸载 WAM 扩展
3. 清理 user_settings.pb 残留
4. 清理临时脚本
5. 端到端验证
"""
import os, sys, json, hashlib, shutil, subprocess, time
from pathlib import Path
from datetime import datetime

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except: pass

ACTIONS = []
def sep(t):
    print(f'\n{"="*60}\n  {t}\n{"="*60}')

def act(msg):
    ACTIONS.append(msg)
    print(f'  -> {msg}')

def ok(msg):
    print(f'  OK {msg}')

BACKUP_SHA = '51fa5589031727e87173db62b2e9c889952e3787613cbb972ddea6b528fd3d8e'

# ═══════════════════════════════════════════════════════════
# 0: 预检 — 对比所有 LS 版本
# ═══════════════════════════════════════════════════════════
sep('0: 预检 — LS 二进制版本对比')

current_ls = Path(r'E:\Windsurf\resources\app\extensions\windsurf\bin\language_server_windows_x64.exe')
old_ls = Path(r'E:\Windsurf\resources\app\extensions\windsurf\bin\language_server_windows_x64.exe.old')
backup_ls = Path(r'e:\道\道生一\一生二\Windsurf万法归宗\060-修复_Repair\_fingerprint_backups\ls_51fa5589031727e8.exe.bak')

files = {
    'current': current_ls,
    '.old': old_ls,
    'backup': backup_ls,
}

shas = {}
for name, path in files.items():
    if path.exists():
        sha = hashlib.sha256(path.read_bytes()).hexdigest()
        shas[name] = sha
        data = path.read_bytes()
        tampered = b'CentralProcessor\\9' in data
        original = b'CentralProcessor\\0' in data
        status = 'TAMPERED' if tampered else ('ORIGINAL' if original else 'UNKNOWN')
        print(f'  {name}: sha={sha[:24]}... [{status}] {path.stat().st_size:,}B')
    else:
        print(f'  {name}: NOT FOUND')

# 判断恢复源
restore_source = None
if shas.get('.old') == BACKUP_SHA:
    restore_source = old_ls
    print(f'\n  >>> .old 文件 == 备份原版, 用 .old 恢复')
elif shas.get('backup') == BACKUP_SHA:
    restore_source = backup_ls
    print(f'\n  >>> 用仓库备份恢复')
else:
    # .old 可能也是原版但hash不同 (不同版本)
    # 检查 .old 是否至少是未篡改的
    if old_ls.exists():
        data = old_ls.read_bytes()
        if b'CentralProcessor\\0' in data and b'CentralProcessor\\9' not in data:
            restore_source = old_ls
            print(f'\n  >>> .old 未篡改 (但hash与备份不同), 用 .old 恢复')
    if not restore_source and backup_ls.exists():
        restore_source = backup_ls
        print(f'\n  >>> .old 也被篡改或不存在, 用仓库备份恢复')

if not restore_source:
    print(f'\n  !!! 无可用恢复源! 退出')
    sys.exit(1)

# 验证恢复源未篡改
src_data = restore_source.read_bytes()
if b'CentralProcessor\\9' in src_data:
    print(f'  !!! 恢复源也被篡改! 退出')
    sys.exit(1)

print(f'  恢复源: {restore_source}')
print(f'  恢复源SHA: {hashlib.sha256(src_data).hexdigest()[:24]}...')

# ═══════════════════════════════════════════════════════════
# 1: 恢复 LS 二进制
# ═══════════════════════════════════════════════════════════
sep('1: 恢复 LS 二进制')

# 需要先关闭 LS 进程 (Windsurf 会自动重启它)
print('  关闭 LS 进程...')
try:
    r = subprocess.run(
        ['taskkill', '/F', '/IM', 'language_server_windows_x64.exe'],
        capture_output=True, text=True, timeout=10
    )
    print(f'  {r.stdout.strip()}')
    time.sleep(2)
except Exception as e:
    print(f'  taskkill 错误: {e}')

# 替换二进制
try:
    # 先备份当前被篡改的版本 (以防万一)
    tampered_bak = current_ls.with_suffix('.exe.tampered_bak')
    if not tampered_bak.exists():
        shutil.copy2(current_ls, tampered_bak)
        act(f'备份篡改版本 -> {tampered_bak.name}')
    
    # 用原版替换
    shutil.copy2(restore_source, current_ls)
    act(f'恢复 LS 二进制 <- {restore_source.name}')
    
    # 验证
    new_sha = hashlib.sha256(current_ls.read_bytes()).hexdigest()
    new_data = current_ls.read_bytes()
    has_orig = b'CentralProcessor\\0' in new_data
    has_tampered = b'CentralProcessor\\9' in new_data
    
    if has_orig and not has_tampered:
        ok(f'LS 二进制已恢复原版 (sha={new_sha[:24]}...)')
    else:
        print(f'  !!! 恢复后仍有问题!')
    
    # 清理 .old 文件
    if old_ls.exists():
        old_ls.unlink()
        act('删除 .old 文件')
    
    # 清理 .tampered_bak (不再需要,仓库备份已有)
    if tampered_bak.exists():
        tampered_bak.unlink()
        act('删除 .tampered_bak')
        
except Exception as e:
    print(f'  !!! 替换失败: {e}')

# ═══════════════════════════════════════════════════════════
# 2: 卸载 WAM 扩展
# ═══════════════════════════════════════════════════════════
sep('2: 卸载 WAM 扩展')

ext_dir = Path(r'C:\Users\Administrator\.windsurf\extensions')

# 删除 WAM 目录
for wam in list(ext_dir.glob('*wam*')):
    if wam.is_dir():
        shutil.rmtree(wam)
        act(f'删除 WAM 扩展: {wam.name}')

# 更新 extensions.json — 移除 WAM
ej = ext_dir / 'extensions.json'
if ej.exists():
    data = json.loads(ej.read_text(encoding='utf-8'))
    original_count = len(data)
    data = [e for e in data if 'wam' not in e.get('identifier', {}).get('id', '').lower()]
    if len(data) < original_count:
        ej.write_text(json.dumps(data, indent='\t'), encoding='utf-8')
        act(f'extensions.json: 移除 {original_count - len(data)} 个 WAM 条目')
    else:
        ok('extensions.json: 无 WAM 条目')

# 清理 extensions.json 备份
for bak in ext_dir.glob('extensions.json.*'):
    bak.unlink()
    act(f'删除 {bak.name}')

# 清理 WAM globalStorage
gs_wam = Path(r'C:\Users\Administrator\AppData\Roaming\Windsurf\User\globalStorage\local.wam')
if gs_wam.exists():
    shutil.rmtree(gs_wam)
    act('删除 WAM globalStorage')

# ═══════════════════════════════════════════════════════════
# 3: 清理 user_settings.pb 残留
# ═══════════════════════════════════════════════════════════
sep('3: 清理 user_settings.pb 残留')

codeium = Path(r'C:\Users\Administrator\.codeium\windsurf')
for f in codeium.glob('user_settings.pb.*'):
    f.unlink()
    act(f'删除 {f.name}')

# 清理 mcp_config 备份
for f in codeium.glob('mcp_config.json.bak*'):
    f.unlink()
    act(f'删除 {f.name}')

# ═══════════════════════════════════════════════════════════
# 4: 验证
# ═══════════════════════════════════════════════════════════
sep('4: 最终验证')

# LS 二进制
if current_ls.exists():
    data = current_ls.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    has_orig = b'CentralProcessor\\0' in data
    has_tampered = b'CentralProcessor\\9' in data
    print(f'  [{"PASS" if has_orig and not has_tampered else "FAIL"}] LS 二进制: {"原版" if has_orig and not has_tampered else "篡改"}')
    print(f'    sha256={sha[:24]}...')

# WAM
wam_remaining = list(ext_dir.glob('*wam*'))
wam_remaining = [w for w in wam_remaining if w.is_dir()]
print(f'  [{"PASS" if not wam_remaining else "FAIL"}] WAM 扩展: {"已清除" if not wam_remaining else f"仍有 {len(wam_remaining)} 个"}')

# user_settings.pb backups
pb_baks = list(codeium.glob('user_settings.pb.*'))
print(f'  [{"PASS" if not pb_baks else "INFO"}] user_settings.pb 备份: {len(pb_baks)} 个')

# JS files (前次已验证)
import base64
wb = Path(r'E:\Windsurf\resources\app\out\vs\workbench\workbench.desktop.main.js')
pj = Path(r'E:\Windsurf\resources\app\product.json')
if wb.exists() and pj.exists():
    with open(wb, 'rb') as f:
        wb_hash = base64.b64encode(hashlib.sha256(f.read()).digest()).decode()
    pjd = json.loads(pj.read_text(encoding='utf-8'))
    stored = pjd.get('checksums', {}).get('vs/workbench/workbench.desktop.main.js', '')
    print(f'  [{"PASS" if wb_hash == stored else "FAIL"}] product.json 校验和')

# extensions.json
if ej.exists():
    data = json.loads(ej.read_text(encoding='utf-8'))
    wam_in_json = [e for e in data if 'wam' in json.dumps(e).lower()]
    print(f'  [{"PASS" if not wam_in_json else "FAIL"}] extensions.json 无 WAM')

# ═══════════════════════════════════════════════════════════
# 总结
# ═══════════════════════════════════════════════════════════
sep('万法归宗 · 深层修复总结')
print(f'  执行了 {len(ACTIONS)} 项操作:')
for i, a in enumerate(ACTIONS, 1):
    print(f'    {i}. {a}')

print(f'\n  !! 需要重启 Windsurf 使 LS 二进制生效')
print(f'  !! 重启后 Windsurf 将自动启动原版 Language Server')
print(f'  !! Telemetry IDs 将在重启后自动重新生成')
