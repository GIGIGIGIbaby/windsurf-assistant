#!/usr/bin/env python3
"""
_anti_fingerprint.py — 四层反指纹根本修复
==========================================
根因: Codeium服务端通过IP+设备指纹+installation_id+source_addresses
     跨账号聚合限流, 导致双电脑所有窗口同步封停。

四层修复:
  L1: Go binary hardware路径中和 — 阻断硬件指纹关联
  L2: installation_id per-account轮换 — 每个账号独立身份
  L3: Telemetry ID轮换 — storage.json/state.vscdb标识符隔离
  L4: source_addresses中和 — Go binary网络接口枚举patch

用法:
  python _anti_fingerprint.py status       # 查看当前指纹状态
  python _anti_fingerprint.py patch        # 执行Go binary patch (L1+L4)
  python _anti_fingerprint.py rotate       # 轮换installation_id+telemetry (L2+L3)
  python _anti_fingerprint.py full         # 全部执行
  python _anti_fingerprint.py rotate-for <email>  # 为指定账号轮换
"""

import os, sys, json, uuid, hashlib, struct, shutil, sqlite3, subprocess, re
from pathlib import Path
from datetime import datetime, timezone, timedelta

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except: pass

CST = timezone(timedelta(hours=8))

# ═══════════════════════════════════════
# 路径定义
# ═══════════════════════════════════════
WS_INSTALL = Path(r'E:\Windsurf')
GO_BIN = WS_INSTALL / 'resources' / 'app' / 'extensions' / 'windsurf' / 'bin' / 'language_server_windows_x64.exe'
WS_APPDATA = Path(os.environ.get('APPDATA', '')) / 'Windsurf'
STATE_DB = WS_APPDATA / 'User' / 'globalStorage' / 'state.vscdb'
STORAGE_JSON = WS_APPDATA / 'User' / 'globalStorage' / 'storage.json'
CODEIUM_DIR = Path(os.path.expanduser('~')) / '.codeium'
INSTALL_ID_FILE = CODEIUM_DIR / 'windsurf' / 'installation_id'
SCRIPT_DIR = Path(__file__).parent

# Backup directory
BACKUP_DIR = SCRIPT_DIR / '_fingerprint_backups'
BACKUP_DIR.mkdir(exist_ok=True)

# Per-account ID store
ACCOUNT_IDS_FILE = SCRIPT_DIR / '_account_fingerprints.json'

# ═══════════════════════════════════════
# Go Binary Patch Targets
# ═══════════════════════════════════════

# L1: Hardware registry path — 读取CPU信息用于hardware字段和device_fingerprint
HARDWARE_PATCH = {
    'description': 'Neutralize hardware registry read (CPU fingerprint)',
    'old': b'HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0',
    'new': b'HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\9',  # Non-existent key → empty
}

# L4: source_address protobuf field — 在Metadata构建时跳过
# 策略: 将protobuf tag注释中的field number篡改，使server忽略
# 实际上更安全的做法: 找到net.Interfaces调用点并NOP
# 但Go编译后难以精确NOP，所以我们用更安全的方法：
# 修改protobuf结构体tag中的field number (11→99)，使序列化时field number变化
# 服务端按field number 11解析，收到99则忽略
SOURCE_ADDR_PATCH = {
    'description': 'Remap source_address protobuf field 11→99 (server ignores unknown fields)',
    # Go struct tag: protobuf:"bytes,11,opt,name=source_address
    'old': b'protobuf:"bytes,11,opt,name=source_address',
    'new': b'protobuf:"bytes,99,opt,name=source_address',
}

# 额外: device_fingerprint field在RecordAnalyticsEventRequest中
# field 24 → 98 (analytics里的fingerprint)
FINGERPRINT_ANALYTICS_PATCH = {
    'description': 'Remap device_fingerprint in analytics event field 24→98',
    'old': b'protobuf:"bytes,24,opt,name=device_fingerprint',
    'new': b'protobuf:"bytes,98,opt,name=device_fingerprint',
}

# Metadata中的device_fingerprint field 12 → 97
FINGERPRINT_METADATA_PATCH = {
    'description': 'Remap device_fingerprint in Metadata field 12→97',
    'old': b'protobuf:"bytes,12,opt,name=device_fingerprint',
    'new': b'protobuf:"bytes,97,opt,name=device_fingerprint',
}

ALL_BINARY_PATCHES = [
    HARDWARE_PATCH,
    SOURCE_ADDR_PATCH,
    FINGERPRINT_ANALYTICS_PATCH,
    FINGERPRINT_METADATA_PATCH,
]


def now_str():
    return datetime.now(CST).strftime('%Y-%m-%d %H:%M:%S')


# ═══════════════════════════════════════
# STATUS — 查看当前指纹状态
# ═══════════════════════════════════════
def cmd_status():
    print(f"\n{'='*60}")
    print(f"  反指纹状态  {now_str()}")
    print(f"{'='*60}")

    # 1. Go binary patch status
    print(f"\n## L1/L4: Go Binary Patch")
    if GO_BIN.exists():
        data = GO_BIN.read_bytes()
        for p in ALL_BINARY_PATCHES:
            old_found = data.find(p['old']) >= 0
            new_found = data.find(p['new']) >= 0
            if new_found:
                print(f"  ✅ {p['description']}: PATCHED")
            elif old_found:
                print(f"  ❌ {p['description']}: UNPATCHED")
            else:
                print(f"  ⚠️  {p['description']}: UNKNOWN (target not found)")
    else:
        print(f"  ❌ Go binary not found: {GO_BIN}")

    # 2. installation_id
    print(f"\n## L2: installation_id")
    if INSTALL_ID_FILE.exists():
        iid = INSTALL_ID_FILE.read_text(encoding='utf-8').strip()
        print(f"  当前: {iid}")
    else:
        print(f"  ❌ File not found: {INSTALL_ID_FILE}")

    # 3. Telemetry IDs
    print(f"\n## L3: Telemetry IDs")
    if STORAGE_JSON.exists():
        s = json.loads(STORAGE_JSON.read_text(encoding='utf-8'))
        for k in ['telemetry.machineId', 'telemetry.devDeviceId', 'telemetry.sqmId']:
            print(f"  {k}: {s.get(k, 'N/A')}")
    if STATE_DB.exists():
        tmp = str(STATE_DB) + '.af_tmp'
        shutil.copy2(str(STATE_DB), tmp)
        for ext in ['-wal', '-shm']:
            sp = str(STATE_DB) + ext
            if os.path.exists(sp): shutil.copy2(sp, tmp + ext)
        conn = sqlite3.connect(tmp, timeout=3)
        row = conn.execute("SELECT value FROM ItemTable WHERE key='storage.serviceMachineId'").fetchone()
        if row: print(f"  storage.serviceMachineId: {row[0]}")
        row = conn.execute("SELECT value FROM ItemTable WHERE key='codeium.windsurf'").fetchone()
        if row:
            d = json.loads(row[0])
            iid = d.get('codeium.installationId', 'N/A')
            print(f"  codeium.installationId: {iid}")
        conn.close()
        for f in [tmp, tmp+'-wal', tmp+'-shm']:
            try: os.remove(f)
            except: pass

    # 4. Exit IP
    print(f"\n## 出口IP")
    try:
        r = subprocess.run(['curl.exe', '-s', '--max-time', '5', '--proxy', 'http://127.0.0.1:7890',
                            'https://api.ipify.org'], capture_output=True, text=True, timeout=8)
        if r.returncode == 0:
            print(f"  代理出口: {r.stdout.strip()}")
    except: print("  ⚠️  无法检测")

    # 5. Per-account store
    print(f"\n## 账号指纹库")
    if ACCOUNT_IDS_FILE.exists():
        store = json.loads(ACCOUNT_IDS_FILE.read_text(encoding='utf-8'))
        for email, info in store.items():
            print(f"  {email}: install={info.get('installation_id','?')[:8]}... machine={info.get('machineId','?')[:12]}...")
    else:
        print(f"  (未创建)")

    print()


# ═══════════════════════════════════════
# L1+L4: Go Binary Patch
# ═══════════════════════════════════════
def cmd_patch():
    print(f"\n{'='*60}")
    print(f"  L1+L4: Go Binary Patch  {now_str()}")
    print(f"{'='*60}")

    if not GO_BIN.exists():
        print(f"  ❌ Go binary not found: {GO_BIN}")
        return False

    # Check if Windsurf is running
    try:
        r = subprocess.run(['powershell', '-NoProfile', '-Command',
            '(Get-Process -Name language_server_windows_x64 -ErrorAction SilentlyContinue).Count'],
            capture_output=True, text=True, timeout=5)
        count = int(r.stdout.strip() or '0')
        if count > 0:
            print(f"  ⚠️  language_server 正在运行 ({count}个进程)")
            print(f"  需要关闭Windsurf后再patch binary")
            print(f"  或者: 先patch, 然后重启Windsurf使patch生效")
    except: pass

    data = bytearray(GO_BIN.read_bytes())
    original_hash = hashlib.sha256(bytes(data)).hexdigest()[:16]

    # Backup
    backup_path = BACKUP_DIR / f'language_server_{original_hash}.exe.bak'
    if not backup_path.exists():
        print(f"  备份原始binary → {backup_path.name}")
        shutil.copy2(str(GO_BIN), str(backup_path))

    patched = 0
    for p in ALL_BINARY_PATCHES:
        old_idx = data.find(p['old'])
        new_idx = data.find(p['new'])

        if new_idx >= 0:
            print(f"  ✅ 已patch: {p['description']}")
            continue

        if old_idx < 0:
            print(f"  ⚠️  目标未找到: {p['description']}")
            continue

        if len(p['old']) != len(p['new']):
            print(f"  ❌ 长度不匹配: {p['description']} ({len(p['old'])} vs {len(p['new'])})")
            continue

        data[old_idx:old_idx+len(p['old'])] = p['new']
        print(f"  🔧 Patched @0x{old_idx:08X}: {p['description']}")
        patched += 1

    if patched > 0:
        GO_BIN.write_bytes(bytes(data))
        new_hash = hashlib.sha256(bytes(data)).hexdigest()[:16]
        print(f"\n  ✅ 写入 {patched} 个patch")
        print(f"  SHA256: {original_hash} → {new_hash}")
    else:
        print(f"\n  无需patch (已全部应用或目标缺失)")

    return True


# ═══════════════════════════════════════
# L2+L3: ID轮换 — per-account
# ═══════════════════════════════════════
def _load_account_store():
    if ACCOUNT_IDS_FILE.exists():
        return json.loads(ACCOUNT_IDS_FILE.read_text(encoding='utf-8'))
    return {}

def _save_account_store(store):
    ACCOUNT_IDS_FILE.write_text(json.dumps(store, indent=2, ensure_ascii=False), encoding='utf-8')

def _generate_ids_for_account(email):
    """为每个账号生成固定但唯一的标识符集"""
    seed = hashlib.sha256(f"windsurf-anti-fp-{email}".encode()).hexdigest()
    return {
        'installation_id': str(uuid.UUID(seed[:32])),
        'machineId': hashlib.sha256(f"machine-{email}-{seed}".encode()).hexdigest(),
        'devDeviceId': str(uuid.UUID(hashlib.md5(f"dev-{email}-{seed}".encode()).hexdigest())),
        'sqmId': '{' + str(uuid.UUID(hashlib.md5(f"sqm-{email}-{seed}".encode()).hexdigest())).upper() + '}',
        'serviceMachineId': str(uuid.UUID(hashlib.md5(f"svc-{email}-{seed}".encode()).hexdigest())),
        'created': now_str(),
    }

def cmd_rotate(email=None):
    """轮换所有标识符。如果指定email，使用该账号的固定ID集"""
    print(f"\n{'='*60}")
    print(f"  L2+L3: ID轮换  {now_str()}")
    print(f"{'='*60}")

    store = _load_account_store()

    if email:
        # Per-account deterministic IDs
        if email not in store:
            store[email] = _generate_ids_for_account(email)
            _save_account_store(store)
            print(f"  新建账号指纹: {email}")
        ids = store[email]
        print(f"  使用账号 [{email}] 的固定指纹")
    else:
        # Random rotation
        ids = {
            'installation_id': str(uuid.uuid4()),
            'machineId': hashlib.sha256(os.urandom(32)).hexdigest(),
            'devDeviceId': str(uuid.uuid4()),
            'sqmId': '{' + str(uuid.uuid4()).upper() + '}',
            'serviceMachineId': str(uuid.uuid4()),
        }
        print(f"  随机轮换模式")

    # L2: Write installation_id
    print(f"\n  ## L2: installation_id")
    if INSTALL_ID_FILE.exists():
        old_iid = INSTALL_ID_FILE.read_text(encoding='utf-8').strip()
        print(f"  旧: {old_iid}")
    INSTALL_ID_FILE.write_text(ids['installation_id'], encoding='utf-8')
    print(f"  新: {ids['installation_id']}")

    # L3a: Update storage.json
    print(f"\n  ## L3a: storage.json")
    if STORAGE_JSON.exists():
        s = json.loads(STORAGE_JSON.read_text(encoding='utf-8'))
        old_mid = s.get('telemetry.machineId', 'N/A')[:16]
        s['telemetry.machineId'] = ids['machineId']
        s['telemetry.devDeviceId'] = ids['devDeviceId']
        s['telemetry.sqmId'] = ids['sqmId']
        STORAGE_JSON.write_text(json.dumps(s, indent=2, ensure_ascii=False), encoding='utf-8')
        print(f"  machineId: {old_mid}... → {ids['machineId'][:16]}...")
        print(f"  devDeviceId: → {ids['devDeviceId']}")
        print(f"  sqmId: → {ids['sqmId']}")
    else:
        print(f"  ⚠️  storage.json not found")

    # L3b: Update state.vscdb
    print(f"\n  ## L3b: state.vscdb")
    if STATE_DB.exists():
        db = str(STATE_DB)
        conn = sqlite3.connect(db, timeout=5)
        try:
            # serviceMachineId
            conn.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
                        ('storage.serviceMachineId', ids['serviceMachineId']))

            # codeium.windsurf内的installationId
            row = conn.execute("SELECT value FROM ItemTable WHERE key='codeium.windsurf'").fetchone()
            if row:
                d = json.loads(row[0])
                old_cid = d.get('codeium.installationId', 'N/A')
                d['codeium.installationId'] = ids['installation_id']
                conn.execute("UPDATE ItemTable SET value=? WHERE key='codeium.windsurf'",
                           (json.dumps(d, ensure_ascii=False),))
                print(f"  codeium.installationId: {old_cid[:12]}... → {ids['installation_id'][:12]}...")

            conn.commit()
            print(f"  serviceMachineId: → {ids['serviceMachineId']}")
        except Exception as e:
            print(f"  ❌ DB error: {e}")
        finally:
            conn.close()

    print(f"\n  ✅ 轮换完成")
    return True


# ═══════════════════════════════════════
# FULL — 全部执行
# ═══════════════════════════════════════
def cmd_full():
    print(f"\n{'='*60}")
    print(f"  全层级反指纹修复  {now_str()}")
    print(f"{'='*60}")

    print(f"\n{'─'*60}")
    print(f"  Step 1/3: Go Binary Patch (L1+L4)")
    print(f"{'─'*60}")
    cmd_patch()

    print(f"\n{'─'*60}")
    print(f"  Step 2/3: ID轮换 (L2+L3)")
    print(f"{'─'*60}")
    cmd_rotate()

    print(f"\n{'─'*60}")
    print(f"  Step 3/3: 验证")
    print(f"{'─'*60}")
    cmd_status()

    print(f"\n{'='*60}")
    print(f"  📋 后续操作:")
    print(f"  1. 重启 Windsurf 使binary patch和ID轮换生效")
    print(f"  2. 笔记本电脑需要:")
    print(f"     a. 复制此脚本执行 python _anti_fingerprint.py full")
    print(f"     b. 使用不同的代理出口节点 (台式HK→笔记本JP/SG)")
    print(f"  3. WAM切号时调用: python _anti_fingerprint.py rotate-for <email>")
    print(f"{'='*60}")


# ═══════════════════════════════════════
# RESTORE — 恢复原始binary
# ═══════════════════════════════════════
def cmd_restore():
    print(f"\n{'='*60}")
    print(f"  恢复原始Go Binary  {now_str()}")
    print(f"{'='*60}")

    backups = sorted(BACKUP_DIR.glob('language_server_*.exe.bak'))
    if not backups:
        print(f"  ❌ 无备份文件")
        return False

    latest = backups[-1]
    print(f"  恢复: {latest.name} → {GO_BIN.name}")
    shutil.copy2(str(latest), str(GO_BIN))
    print(f"  ✅ 已恢复")
    return True


# ═══════════════════════════════════════
# MAIN
# ═══════════════════════════════════════
if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args[0] == 'status':
        cmd_status()
    elif args[0] == 'patch':
        cmd_patch()
    elif args[0] == 'rotate':
        cmd_rotate()
    elif args[0] == 'rotate-for' and len(args) > 1:
        cmd_rotate(email=args[1])
    elif args[0] == 'full':
        cmd_full()
    elif args[0] == 'restore':
        cmd_restore()
    else:
        print(__doc__)
