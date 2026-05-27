#!/usr/bin/env python3
"""
Windsurf session manager — must run as Administrator (same user as Windsurf).
Usage:
  session_helper.py diag                    → show current sessions info
  session_helper.py switch <display_name> <email> <refresh_token> <uid>
                                             → switch active session
Output: JSON to stdout + C:\Temp\session_helper_out.json
"""
import sys, os, json, base64, sqlite3, ctypes, ctypes.wintypes, time, shutil

OUT_FILE  = r'C:\Temp\session_helper_out.json'
IN_FILE   = r'C:\Temp\session_helper_in.json'

def out(data):
    os.makedirs(r'C:\Temp', exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(json.dumps(data, ensure_ascii=False))

# ─── DPAPI ───────────────────────────────────────────────────────────────────
class _BLOB(ctypes.Structure):
    _fields_ = [('cbData', ctypes.wintypes.DWORD),
                ('pbData', ctypes.POINTER(ctypes.c_char))]

def dpapi_decrypt(data: bytes) -> bytes:
    buf = ctypes.create_string_buffer(data)
    b_in = _BLOB(len(data), buf)
    b_out = _BLOB()
    ok = ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(b_in), None, None, None, None, 0, ctypes.byref(b_out))
    if not ok:
        raise OSError(f'CryptUnprotectData failed: {ctypes.GetLastError()}')
    result = bytes(b_out.pbData[:b_out.cbData])
    ctypes.windll.kernel32.LocalFree(b_out.pbData)
    return result

def dpapi_encrypt(data: bytes) -> bytes:
    buf = ctypes.create_string_buffer(data)
    b_in = _BLOB(len(data), buf)
    b_out = _BLOB()
    ok = ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(b_in), None, None, None, None, 0, ctypes.byref(b_out))
    if not ok:
        raise OSError(f'CryptProtectData failed: {ctypes.GetLastError()}')
    result = bytes(b_out.pbData[:b_out.cbData])
    ctypes.windll.kernel32.LocalFree(b_out.pbData)
    return result

# ─── Chromium v10 AES-GCM ────────────────────────────────────────────────────
def get_chromium_key(local_state_path: str) -> bytes | None:
    try:
        with open(local_state_path, 'r', encoding='utf-8') as f:
            ls = json.load(f)
        enc_b64 = ls.get('os_crypt', {}).get('encrypted_key', '')
        if not enc_b64:
            return None
        enc = base64.b64decode(enc_b64)
        if enc[:5] == b'DPAPI':
            enc = enc[5:]
        return dpapi_decrypt(enc)
    except Exception:
        return None

def v10_decrypt(data: bytes, key: bytes) -> bytes:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    # "v10" (3) + nonce (12) + ciphertext
    assert data[:3] == b'v10', "not v10"
    nonce = data[3:15]
    ct    = data[15:]
    return AESGCM(key).decrypt(nonce, ct, None)

def v10_encrypt(plaintext: bytes, key: bytes) -> bytes:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    nonce = os.urandom(12)
    ct = AESGCM(key).encrypt(nonce, plaintext, None)
    return b'v10' + nonce + ct

# ─── Paths ───────────────────────────────────────────────────────────────────
SESSION_KEY = 'secret://{"extensionId":"codeium.windsurf","key":"windsurf_auth.sessions"}'
ACTIVE_KEY  = 'codeium.windsurf-windsurf_auth'

def find_files():
    candidates = []
    try:
        users = os.listdir(r'C:\Users')
    except:
        users = ['Administrator']
    ordered = ['Administrator'] + [u for u in users if u != 'Administrator']
    for user in ordered:
        db = rf'C:\Users\{user}\AppData\Roaming\Windsurf\User\globalStorage\state.vscdb'
        ls = rf'C:\Users\{user}\AppData\Roaming\Windsurf\Local State'
        if os.path.exists(db):
            candidates.append({'db': db, 'ls': ls if os.path.exists(ls) else None, 'user': user})
    return candidates

def read_db_key(db_path, key):
    tmp = db_path + f'.tmp_{os.getpid()}'
    shutil.copy2(db_path, tmp)
    try:
        conn = sqlite3.connect(tmp, timeout=3)
        cur  = conn.cursor()
        cur.execute('SELECT value FROM ItemTable WHERE key=?', (key,))
        row = cur.fetchone()
        conn.close()
        return row[0] if row else None
    finally:
        try: os.unlink(tmp)
        except: pass

def write_db_key(db_path, key, value):
    conn = sqlite3.connect(db_path, timeout=5)
    cur  = conn.cursor()
    cur.execute('INSERT OR REPLACE INTO ItemTable(key,value) VALUES(?,?)', (key, value))
    conn.commit()
    conn.close()

# ─── Decode the Buffer blob ───────────────────────────────────────────────────
def buf_to_bytes(raw_value: str) -> bytes:
    obj = json.loads(raw_value)
    if isinstance(obj, dict) and obj.get('type') == 'Buffer':
        return bytes(obj['data'])
    return raw_value.encode()  # fallback plain string

def bytes_to_buf(data: bytes) -> str:
    return json.dumps({'type': 'Buffer', 'data': list(data)})

# ─── Try all decrypt methods ──────────────────────────────────────────────────
def try_decrypt(raw_bytes: bytes, local_state: str | None):
    methods = {}

    # 1) Chromium v10 (needs Local State AES key)
    if local_state and raw_bytes[:3] == b'v10':
        try:
            key = get_chromium_key(local_state)
            if key:
                dec = v10_decrypt(raw_bytes, key)
                methods['chromium_v10'] = {'ok': True, 'key_len': len(key),
                                           'preview': dec[:400].decode(errors='replace')}
            else:
                methods['chromium_v10'] = {'ok': False, 'error': 'no encrypted_key in Local State'}
        except Exception as e:
            methods['chromium_v10'] = {'ok': False, 'error': str(e)}

    # 2) Pure DPAPI on raw blob
    try:
        dec = dpapi_decrypt(raw_bytes)
        methods['dpapi_raw'] = {'ok': True, 'preview': dec[:400].decode(errors='replace')}
    except Exception as e:
        methods['dpapi_raw'] = {'ok': False, 'error': str(e)}

    # 3) Pure DPAPI after stripping "v10:" prefix (4 bytes)
    if raw_bytes[:4] == b'v10:':
        try:
            dec = dpapi_decrypt(raw_bytes[4:])
            methods['dpapi_skip4'] = {'ok': True, 'preview': dec[:400].decode(errors='replace')}
        except Exception as e:
            methods['dpapi_skip4'] = {'ok': False, 'error': str(e)}

    # 4) Pure DPAPI after stripping "v10" prefix (3 bytes)
    if raw_bytes[:3] == b'v10':
        try:
            dec = dpapi_decrypt(raw_bytes[3:])
            methods['dpapi_skip3'] = {'ok': True, 'preview': dec[:400].decode(errors='replace')}
        except Exception as e:
            methods['dpapi_skip3'] = {'ok': False, 'error': str(e)}

    return methods

# ─── Determine working decrypt/encrypt pair ───────────────────────────────────
def get_crypto_ctx(raw_bytes: bytes, local_state: str | None):
    """Returns (decrypt_fn, encrypt_fn) that work for this blob."""
    # Try Chromium v10
    if local_state and raw_bytes[:3] == b'v10':
        try:
            key = get_chromium_key(local_state)
            if key:
                v10_decrypt(raw_bytes, key)  # test
                dec_fn = lambda b: v10_decrypt(b, key)
                enc_fn = lambda p: v10_encrypt(p, key)
                return dec_fn, enc_fn, 'chromium_v10'
        except:
            pass

    # Try DPAPI on raw blob
    try:
        dpapi_decrypt(raw_bytes)
        return dpapi_decrypt, dpapi_encrypt, 'dpapi_raw'
    except:
        pass

    # Try DPAPI skip 4 bytes
    if raw_bytes[:4] == b'v10:':
        try:
            dpapi_decrypt(raw_bytes[4:])
            prefix = raw_bytes[:4]
            dec_fn = lambda b: dpapi_decrypt(b[4:])
            enc_fn = lambda p: prefix + dpapi_encrypt(p)
            return dec_fn, enc_fn, 'dpapi_skip4'
        except:
            pass

    return None, None, None

# ─── CMD: diag ───────────────────────────────────────────────────────────────
def cmd_diag():
    result = {'ts': int(time.time()), 'cmd': 'diag'}
    files = find_files()
    result['files'] = [{'user': f['user'], 'db': f['db'], 'ls': f['ls']} for f in files]

    if not files:
        result['error'] = 'No state.vscdb found'
        out(result)
        return

    f = files[0]
    db, ls = f['db'], f['ls']

    # Active key
    active = read_db_key(db, ACTIVE_KEY)
    result['active_display_name'] = active

    # Sessions
    raw_val = read_db_key(db, SESSION_KEY)
    if not raw_val:
        result['sessions_error'] = 'sessions key not in DB'
        out(result)
        return

    raw_bytes = buf_to_bytes(raw_val)
    result['sessions_blob_len'] = len(raw_bytes)
    result['sessions_prefix'] = raw_bytes[:8].hex()
    result['local_state'] = ls

    # Try decryption methods
    methods = try_decrypt(raw_bytes, ls)
    result['decrypt_attempts'] = methods

    # Find which method worked
    working = {k: v for k, v in methods.items() if v.get('ok')}
    result['working_methods'] = list(working.keys())

    if working:
        # Get full sessions with the first working method
        method_name = list(working.keys())[0]
        dec_fn, enc_fn, _ = get_crypto_ctx(raw_bytes, ls)
        if dec_fn:
            try:
                plain = dec_fn(raw_bytes)
                sessions_obj = json.loads(plain)
                result['sessions_type'] = type(sessions_obj).__name__
                if isinstance(sessions_obj, list):
                    result['sessions_count'] = len(sessions_obj)
                    result['sessions_summary'] = [
                        {k: v for k, v in (s if isinstance(s, dict) else {}).items()
                         if k in ('email', 'displayName', 'uid', 'isActive', 'id')}
                        for s in sessions_obj[:10]
                    ]
                elif isinstance(sessions_obj, dict):
                    result['sessions_keys'] = list(sessions_obj.keys())[:20]
                    result['sessions_preview'] = str(sessions_obj)[:600]
            except Exception as e:
                result['parse_error'] = str(e)
                result['plain_preview'] = plain[:400].decode(errors='replace')

    out(result)

# ─── CMD: switch ─────────────────────────────────────────────────────────────
def cmd_switch(display_name, email, refresh_token, uid, api_key='', id_token=''):
    result = {'ts': int(time.time()), 'cmd': 'switch',
              'target': {'displayName': display_name, 'email': email, 'uid': uid}}
    files = find_files()
    if not files:
        result['error'] = 'No state.vscdb found'
        out(result); return

    f = files[0]
    db, ls = f['db'], f['ls']

    raw_val = read_db_key(db, SESSION_KEY)
    if not raw_val:
        result['error'] = 'sessions key not in DB'
        out(result); return

    raw_bytes = buf_to_bytes(raw_val)
    dec_fn, enc_fn, method = get_crypto_ctx(raw_bytes, ls)
    if not dec_fn:
        result['error'] = 'no working decryption method found'
        out(result); return

    result['crypto_method'] = method

    try:
        plain = dec_fn(raw_bytes)
        sessions = json.loads(plain)
    except Exception as e:
        result['error'] = f'decrypt/parse failed: {e}'
        out(result); return

    result['sessions_type'] = type(sessions).__name__
    result['sessions_before_count'] = len(sessions) if isinstance(sessions, list) else 1

    # ── Build the new session entry (VSCode AuthSession format) ──
    # accessToken = apiKey (sk-ws-01-...)
    # account.label = display name shown in UI
    # account.id   = email (VSCode convention) or displayName
    import uuid as _uuid
    new_session = {
        'id': str(_uuid.uuid4()),
        'accessToken': api_key,
        'account': {
            'label': display_name,
            'id': email if email else display_name,
        },
        'scopes': [],
    }
    # Include Firebase credentials so Windsurf auth provider can refresh the session
    # Without these, Windsurf falls back to device-level re-auth → restores old account
    if refresh_token:
        new_session['refreshToken'] = refresh_token
    if uid:
        new_session['uid'] = uid
    if email:
        new_session['email'] = email
    if id_token:
        new_session['idToken'] = id_token

    if isinstance(sessions, list):
        # REPLACE entire sessions list with ONLY the new session.
        # Keeping other accounts' sessions (with their refreshTokens) allows Windsurf
        # to refresh those sessions on startup and overwrite windsurfAuthStatus.
        result['sessions_removed'] = len(sessions)
        sessions = [new_session]
        result['sessions_after_count'] = len(sessions)
        modified_plain = json.dumps(sessions).encode('utf-8')

    elif isinstance(sessions, dict):
        # Some versions store as single object with nested currentUser
        # Try to wrap into known format
        if 'currentUser' in sessions or 'user' in sessions:
            # Replace the user
            key = 'currentUser' if 'currentUser' in sessions else 'user'
            sessions[key] = new_session
            modified_plain = json.dumps(sessions).encode('utf-8')
        else:
            # Unknown format - replace entirely
            modified_plain = json.dumps([new_session]).encode('utf-8')
        result['sessions_after_count'] = 1
    else:
        result['error'] = f'Unknown sessions type: {type(sessions)}'
        out(result); return

    # Re-encrypt
    try:
        new_encrypted = enc_fn(modified_plain)
    except Exception as e:
        result['error'] = f're-encrypt failed: {e}'
        out(result); return

    # Write back to DB
    new_val = bytes_to_buf(new_encrypted)
    write_db_key(db, SESSION_KEY, new_val)
    # Also update the active display name
    write_db_key(db, ACTIVE_KEY, display_name)

    # ── Clean up windsurf_auth-*-usages keys (ghost session prevention) ──
    # VSCode auth framework stores "<providerId>-<accountId>-usages" keys.
    # Leaving old usages keys causes Windsurf to restore ghost sessions on startup.
    # Fix: delete ALL old windsurf_auth-* keys, write only the new account's usages key.
    _usages_val = json.dumps([{
        'extensionId': 'codeium.windsurf',
        'extensionName': 'Windsurf',
        'scopes': [],
        'lastUsed': int(time.time() * 1000),
    }])
    _new_usages_key = f'windsurf_auth-{display_name}-usages'
    try:
        _conn2 = sqlite3.connect(db, timeout=5)
        _cur2  = _conn2.cursor()
        _cur2.execute("DELETE FROM ItemTable WHERE key LIKE 'windsurf_auth-%'")
        _deleted = _cur2.rowcount
        _cur2.execute('INSERT OR REPLACE INTO ItemTable(key,value) VALUES(?,?)',
                     (_new_usages_key, _usages_val))
        _conn2.commit()
        _conn2.close()
        result['usages_deleted'] = _deleted
        result['usages_written'] = _new_usages_key
    except Exception as _e:
        result['usages_cleanup_error'] = str(_e)

    result['ok'] = True
    result['wrote_bytes'] = len(new_encrypted)
    out(result)

# ─── Main ────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args[0] == 'diag':
        cmd_diag()
    elif args[0] == 'switch':
        # Read params from IN_FILE (avoids schtasks 261-char TR limit)
        if os.path.exists(IN_FILE):
            try:
                with open(IN_FILE, 'r', encoding='utf-8') as f:
                    p = json.load(f)
                cmd_switch(
                    display_name=p.get('displayName', ''),
                    email=p.get('email', ''),
                    refresh_token=p.get('refreshToken', ''),
                    uid=p.get('uid', ''),
                    api_key=p.get('apiKey', ''),
                    id_token=p.get('idToken', ''),
                )
            except Exception as e:
                out({'error': f'in_file parse error: {e}'})
        elif len(args) >= 5:
            # Fallback: command-line args (short tokens only)
            cmd_switch(
                display_name=args[1],
                email=args[2],
                refresh_token=args[3],
                uid=args[4],
                api_key=args[5] if len(args) > 5 else '',
                id_token=args[6] if len(args) > 6 else '',
            )
        else:
            out({'error': 'switch: missing IN_FILE and insufficient args'})
    else:
        out({'error': f'unknown args: {args}'})
