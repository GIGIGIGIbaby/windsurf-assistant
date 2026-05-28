#!/usr/bin/env python3
"""
Windsurf 一键切号脚本 v1.0
用法:
  python switch_account.py <email> <password>
  python switch_account.py --list          # 列出所有可用账号
  python switch_account.py --best          # 自动选择最佳账号并切换

流程: Firebase登录 → 获取idToken/refreshToken → 关闭Windsurf → 注入state.vscdb → 更新auth JSON → 启动Windsurf
"""
import sys, os, json, time, subprocess, sqlite3, shutil, ctypes, ctypes.wintypes, base64, uuid

# ═══ 配置 ═══
FIREBASE_KEY = 'AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY'
PROXY_ADDR = 'http://127.0.0.1:7890'
WINDSURF_EXE = r'E:\Windsurf\Windsurf.exe'
ACCOUNTS_FILE = os.path.join(os.environ.get('APPDATA', ''), 'Windsurf', 'User', 'globalStorage', 'windsurf-login-accounts.json')
GS_PATH = os.path.join(os.environ.get('APPDATA', ''), 'Windsurf', 'User', 'globalStorage')
SESSION_KEY = 'secret://{"extensionId":"codeium.windsurf","key":"windsurf_auth.sessions"}'
ACTIVE_KEY = 'codeium.windsurf-windsurf_auth'

# ═══ DPAPI ═══
class _BLOB(ctypes.Structure):
    _fields_ = [('cbData', ctypes.wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_char))]

def dpapi_encrypt(data):
    buf = ctypes.create_string_buffer(data)
    b_in, b_out = _BLOB(len(data), buf), _BLOB()
    if not ctypes.windll.crypt32.CryptProtectData(ctypes.byref(b_in), None, None, None, None, 0, ctypes.byref(b_out)):
        raise OSError('CryptProtectData failed')
    result = bytes(b_out.pbData[:b_out.cbData])
    ctypes.windll.kernel32.LocalFree(b_out.pbData)
    return result

# ═══ Chromium v10 ═══
def get_chromium_key(local_state_path):
    try:
        with open(local_state_path, 'r', encoding='utf-8') as f:
            ls = json.load(f)
        enc_b64 = ls.get('os_crypt', {}).get('encrypted_key', '')
        if not enc_b64: return None
        enc = base64.b64decode(enc_b64)
        if enc[:5] == b'DPAPI': enc = enc[5:]
        buf = ctypes.create_string_buffer(enc)
        b_in, b_out = _BLOB(len(enc), buf), _BLOB()
        if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(b_in), None, None, None, None, 0, ctypes.byref(b_out)):
            return None
        key = bytes(b_out.pbData[:b_out.cbData])
        ctypes.windll.kernel32.LocalFree(b_out.pbData)
        return key
    except: return None

def v10_encrypt(plaintext, key):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    nonce = os.urandom(12)
    return b'v10' + nonce + AESGCM(key).encrypt(nonce, plaintext, None)

def bytes_to_buf(data):
    return json.dumps({'type': 'Buffer', 'data': list(data)})

# ═══ Firebase登录 ═══
def firebase_login(email, password):
    import urllib.request
    proxy = urllib.request.ProxyHandler({'https': PROXY_ADDR, 'http': PROXY_ADDR})
    opener = urllib.request.build_opener(proxy)
    url = f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_KEY}'
    payload = json.dumps({'email': email, 'password': password, 'returnSecureToken': True}).encode()
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    try:
        with opener.open(req, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f'  Firebase登录失败: {e}')
        return None

# ═══ 关闭Windsurf ═══
def stop_windsurf():
    subprocess.run(['taskkill', '/F', '/IM', 'Windsurf.exe'], capture_output=True)
    subprocess.run(['taskkill', '/F', '/IM', 'language_server_windows_x64.exe'], capture_output=True)
    time.sleep(3)
    r = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq Windsurf.exe'], capture_output=True)
    out = (r.stdout or b'').decode('gbk', errors='replace')
    return 'Windsurf.exe' not in out

# ═══ 注入Session ═══
def inject_session(display_name, email, uid, id_token, refresh_token):
    db_path = os.path.join(GS_PATH, 'state.vscdb')
    ls_path = os.path.join(os.environ.get('APPDATA', ''), 'Windsurf', 'Local State')
    if not os.path.exists(db_path):
        print(f'  state.vscdb不存在: {db_path}')
        return False

    # 构建session
    session = [{
        'id': str(uuid.uuid4()),
        'accessToken': '',
        'account': {'label': display_name, 'id': email},
        'scopes': [],
        'refreshToken': refresh_token,
        'uid': uid,
        'email': email,
        'idToken': id_token,
    }]
    plain = json.dumps(session).encode('utf-8')

    # 加密
    encrypted = None
    key = get_chromium_key(ls_path) if os.path.exists(ls_path) else None
    if key:
        try:
            encrypted = v10_encrypt(plain, key)
            print('  加密: Chromium v10 AES-GCM')
        except Exception as e:
            print(f'  v10加密失败({e}), 降级DPAPI')
    if not encrypted:
        encrypted = dpapi_encrypt(plain)
        print('  加密: DPAPI')

    # 写入DB
    conn = sqlite3.connect(db_path, timeout=5)
    cur = conn.cursor()
    cur.execute('INSERT OR REPLACE INTO ItemTable(key,value) VALUES(?,?)', (SESSION_KEY, bytes_to_buf(encrypted)))
    cur.execute('INSERT OR REPLACE INTO ItemTable(key,value) VALUES(?,?)', (ACTIVE_KEY, display_name))
    # 清理ghost session usages
    cur.execute("DELETE FROM ItemTable WHERE key LIKE 'windsurf_auth-%'")
    usages_val = json.dumps([{'extensionId': 'codeium.windsurf', 'extensionName': 'Windsurf', 'scopes': [], 'lastUsed': int(time.time() * 1000)}])
    cur.execute('INSERT OR REPLACE INTO ItemTable(key,value) VALUES(?,?)', (f'windsurf_auth-{display_name}-usages', usages_val))
    conn.commit()
    conn.close()

    # 更新auth JSON
    auth = {'authToken': id_token, 'token': id_token, 'api_key': id_token, 'timestamp': int(time.time() * 1000)}
    for fn in ['windsurf-auth.json', 'cascade-auth.json']:
        fp = os.path.join(GS_PATH, fn)
        with open(fp, 'w') as f:
            json.dump(auth, f, indent=2)

    print(f'  Session注入完成: {display_name} ({email})')
    return True

# ═══ 启动Windsurf ═══
def start_windsurf():
    subprocess.Popen([WINDSURF_EXE], shell=False)
    print('  Windsurf已启动')

# ═══ 账号列表 ═══
def load_accounts():
    # 优先读取WAM扩展的账号文件
    wam_file = os.path.join(GS_PATH, 'zhouyoukang.windsurf-assistant', 'windsurf-login-accounts.json')
    target = wam_file if os.path.exists(wam_file) else ACCOUNTS_FILE
    if not os.path.exists(target):
        # 尝试顶层globalStorage
        target = os.path.join(GS_PATH, 'windsurf-login-accounts.json')
    if not os.path.exists(target):
        print(f'账号文件不存在'); return []
    with open(target, 'r', encoding='utf-8') as f:
        return json.load(f)

def list_accounts():
    accounts = load_accounts()
    print(f'共 {len(accounts)} 个账号:\n')
    for i, a in enumerate(accounts):
        email = a.get('email', '?')
        credits = a.get('credits', '?')
        wr = a.get('usage', {}).get('weekly', {}).get('remaining', '?')
        plan = a.get('usage', {}).get('plan', '?')
        pw = '✓' if a.get('password') else '✗'
        print(f'  [{i+1:3d}] {email:<40s} credits={credits:<5} weekly_rem={wr:<5} plan={plan} pw={pw}')

def find_best_account():
    accounts = load_accounts()
    best_idx, best_score = -1, -1
    for i, a in enumerate(accounts):
        if not a.get('password'): continue
        credits = a.get('credits', 0) or 0
        usage = a.get('usage') or {}
        weekly = usage.get('weekly') or {}
        wr = weekly.get('remaining', 0) or 0
        score = credits * 10 + wr
        if score > best_score:
            best_score, best_idx = score, i
    return best_idx if best_idx >= 0 else None

# ═══ 主流程 ═══
def switch_to(email, password):
    print(f'\n═══ Windsurf 一键切号 ═══')
    print(f'目标: {email}\n')

    # Step 1: Firebase登录
    print('[1/4] Firebase登录...')
    auth = firebase_login(email, password)
    if not auth:
        print('  ✗ 登录失败'); return False
    uid = auth.get('localId', '')
    display = auth.get('displayName', email.split('@')[0])
    print(f'  ✓ 登录成功: {display} (uid: {uid[:12]}...)')

    # Step 2: 关闭Windsurf
    print('[2/4] 关闭Windsurf...')
    if stop_windsurf():
        print('  ✓ Windsurf已关闭')
    else:
        print('  ⚠ Windsurf可能未完全关闭')

    # Step 3: 注入Session
    print('[3/4] 注入Session...')
    ok = inject_session(display, email, uid, auth.get('idToken', ''), auth.get('refreshToken', ''))
    if not ok:
        print('  ✗ 注入失败'); return False
    print('  ✓ 注入成功')

    # Step 4: 启动Windsurf
    print('[4/4] 启动Windsurf...')
    start_windsurf()

    print(f'\n═══ 切号完成: {display} ({email}) ═══\n')
    return True

if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(0)
    if args[0] == '--list':
        list_accounts(); sys.exit(0)
    if args[0] == '--best':
        idx = find_best_account()
        if idx is None:
            print('未找到可用账号'); sys.exit(1)
        accounts = load_accounts()
        a = accounts[idx]
        print(f'最佳账号: #{idx+1} {a["email"]} (credits={a.get("credits",0)})')
        switch_to(a['email'], a['password'])
        sys.exit(0)
    if len(args) >= 2:
        switch_to(args[0], args[1])
    else:
        print('用法: python switch_account.py <email> <password>')
