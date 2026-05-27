"""
官方模式回归 · 道法自然 · 回归本源
===================================

用途:
    把 Windsurf 从"反代/切号/WAM 注入"回归为"纯官方直连"状态.
    三步治理 (diag → fix → verify):
        1. 诊断: settings.json / state.vscdb / 官方端点可达性
        2. 修复: 移除 http.proxy + 清理 DB 死注入
        3. 验证: 直连 server.codeium.com / inference.codeium.com 返回 404(正常)

何时使用:
    - 想从"天卡/WAM 切号模式"回到"官方账号直连"
    - 本地反代(:8878)已失效且不打算恢复
    - 排查 "Cascade 无法发送消息" 类问题

使用:
    python 官方模式回归.py diag                 # 只诊断,不改
    python 官方模式回归.py fix --confirm        # 备份并修复 (需 --confirm)
    python 官方模式回归.py verify               # 改完后验证

注入点说明 (三路):
    [1] ItemTable.codeium.windsurf JSON 键内 "apiServerUrl"
    [2] ItemTable secret 键 windsurf_auth.apiServerUrl (DPAPI v10)
    [3] settings.json "windsurf.apiServerUrl"
    本工具针对三路全面清理.

注: 本工具不动 Clash / TUN / 系统代理, 只改 Windsurf settings 与 DB.
    Clash 继续服务其它软件, Windsurf 单独直连官方.
"""
from __future__ import annotations
import sys, os, json, shutil, time, sqlite3, argparse, subprocess, platform

# Windows 默认 GBK 环境下也能输出 Unicode (✓/✗/═) - 保证远程 PSSession/cmd 可用
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# ─── Windsurf 路径 ───────────────────────────────────────────
def ws_paths() -> dict:
    if platform.system() != 'Windows':
        raise RuntimeError("仅支持 Windows")
    appdata = os.environ['APPDATA']
    user_dir = os.path.join(appdata, 'Windsurf', 'User')
    return {
        'user_dir': user_dir,
        'settings': os.path.join(user_dir, 'settings.json'),
        'state_db': os.path.join(user_dir, 'globalStorage', 'state.vscdb'),
    }


SECRET_API_KEY = 'secret://{"extensionId":"codeium.windsurf","key":"windsurf_auth.apiServerUrl"}'
ITEM_AUTH_REF = 'codeium.windsurf-windsurf_auth'


# ─── DIAG ──────────────────────────────────────────────────
def cmd_diag(_: argparse.Namespace) -> int:
    p = ws_paths()
    print("═══ 官方模式回归 · 诊断 ═══")
    print(f"settings: {p['settings']} {'EXISTS' if os.path.exists(p['settings']) else 'MISSING'}")
    print(f"state_db: {p['state_db']} {'EXISTS' if os.path.exists(p['state_db']) else 'MISSING'}")

    # settings
    print("\n[1] settings.json http.* keys:")
    if os.path.exists(p['settings']):
        with open(p['settings'], 'r', encoding='utf-8') as f:
            s = json.load(f)
        for k in ('http.proxy', 'http.proxySupport', 'http.proxyStrictSSL', 'http.systemCertificates'):
            v = s.get(k, '(not set)')
            print(f"    {k} = {v}")

    # state.vscdb
    print("\n[2] state.vscdb injection check:")
    if os.path.exists(p['state_db']):
        db = sqlite3.connect(f"file:{p['state_db']}?mode=ro", uri=True)
        c = db.cursor()
        # Item-level apiServerUrl in codeium.windsurf JSON
        r = c.execute("SELECT value FROM ItemTable WHERE key='codeium.windsurf'").fetchone()
        item_inj = '(no codeium.windsurf row)'
        if r and 'apiServerUrl' in str(r[0]):
            import re as _re
            m = _re.search(r'"apiServerUrl"\s*:\s*"([^"]+)"', str(r[0]))
            item_inj = m.group(1) if m else '(has apiServerUrl key, but no value match)'
        elif r:
            item_inj = '(codeium.windsurf present, no apiServerUrl injection)'
        print(f"    ItemTable.codeium.windsurf.apiServerUrl = {item_inj}")

        # Secret DPAPI
        r = c.execute("SELECT length(value) FROM ItemTable WHERE key=?", (SECRET_API_KEY,)).fetchone()
        print(f"    secret.windsurf_auth.apiServerUrl = {'present (' + str(r[0]) + 'B DPAPI)' if r else '(not set)'}")

        # Orphan ref
        r = c.execute("SELECT length(value) FROM ItemTable WHERE key=?", (ITEM_AUTH_REF,)).fetchone()
        print(f"    orphan ref codeium.windsurf-windsurf_auth = {'present (' + str(r[0]) + 'B)' if r else '(not set)'}")

        # Orphan virtual accounts (small)
        r = c.execute("""
            SELECT COUNT(*) FROM ItemTable
            WHERE key LIKE 'windsurf_auth-%'
              AND key NOT LIKE '%-usages'
              AND length(value) < 50
        """).fetchone()
        print(f"    orphan virtual accounts (<50B) = {r[0] if r else 0}")

        db.close()

    # Network probes
    print("\n[3] Network (direct, no proxy):")
    for dom in ('server.codeium.com', 'inference.codeium.com', 'codeium.com'):
        rc = _curl_direct(f'https://{dom}/', 6)
        print(f"    https://{dom}/ -> HTTP {rc}")

    return 0


def _curl_direct(url: str, timeout: int = 6) -> str:
    try:
        r = subprocess.run(
            ['curl.exe', '--noproxy', '*', '-sS', '-o', 'NUL', '-w', '%{http_code}', '-m', str(timeout), url],
            capture_output=True, text=True, timeout=timeout + 3
        )
        return (r.stdout or r.stderr or '?').strip().splitlines()[-1] if (r.stdout or r.stderr) else '?'
    except Exception as e:
        return f'ERR:{e}'


# ─── FIX ───────────────────────────────────────────────────
def cmd_fix(args: argparse.Namespace) -> int:
    if not args.confirm:
        print("需要 --confirm 才会真正改动 (安全防线).")
        return 2

    p = ws_paths()
    ts = time.strftime('%Y%m%d_%H%M%S')
    bak_dir = os.path.join(os.path.dirname(__file__), '_backups', f'origin_{ts}')
    os.makedirs(bak_dir, exist_ok=True)

    # backup
    shutil.copy2(p['settings'], os.path.join(bak_dir, 'settings.json'))
    if os.path.exists(p['state_db']):
        src = sqlite3.connect(f"file:{p['state_db']}?mode=ro", uri=True)
        dst = sqlite3.connect(os.path.join(bak_dir, 'state.vscdb'))
        src.backup(dst); dst.close(); src.close()
    print(f"[BACKUP] {bak_dir}")

    # settings.json
    with open(p['settings'], 'r', encoding='utf-8') as f:
        s = json.load(f)
    removed = []
    if 'http.proxy' in s:
        removed.append(f"http.proxy={s.pop('http.proxy')}")
    if 'http.proxyStrictSSL' in s:
        removed.append(f"http.proxyStrictSSL={s.pop('http.proxyStrictSSL')}")
    if s.get('http.proxySupport') != 'off':
        removed.append(f"http.proxySupport: {s.get('http.proxySupport')!r} -> 'off'")
    s['http.proxySupport'] = 'off'
    with open(p['settings'], 'w', encoding='utf-8') as f:
        json.dump(s, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print("[SETTINGS]")
    for r in removed or ['(no changes needed)']:
        print(f"    {r}")

    # DB cleanup
    if os.path.exists(p['state_db']):
        conn = sqlite3.connect(p['state_db'], timeout=5.0)
        c = conn.cursor()
        total = 0
        for k in (SECRET_API_KEY, ITEM_AUTH_REF):
            c.execute("DELETE FROM ItemTable WHERE key=?", (k,))
            total += c.rowcount
        # orphans
        c.execute("""
            DELETE FROM ItemTable
            WHERE key LIKE 'windsurf_auth-%'
              AND key NOT LIKE '%-usages'
              AND length(value) < 50
        """)
        orphans = c.rowcount
        total += orphans
        # Also strip apiServerUrl from codeium.windsurf JSON (if any)
        r = c.execute("SELECT value FROM ItemTable WHERE key='codeium.windsurf'").fetchone()
        if r and 'apiServerUrl' in str(r[0]):
            try:
                j = json.loads(r[0])
                if isinstance(j, dict) and 'apiServerUrl' in j:
                    del j['apiServerUrl']
                    c.execute("UPDATE ItemTable SET value=? WHERE key='codeium.windsurf'", (json.dumps(j),))
                    total += c.rowcount
            except json.JSONDecodeError:
                pass
        conn.commit()
        conn.close()
        print(f"[DB] removed {total} row(s) ({orphans} orphan accounts)")

    print("\n完成. 请 Ctrl+Shift+P → 'Reload Window' 让 Windsurf 读取新配置.")
    return 0


# ─── VERIFY ────────────────────────────────────────────────
def cmd_verify(_: argparse.Namespace) -> int:
    p = ws_paths()
    print("═══ 官方模式回归 · 验证 ═══")

    ok = True

    # settings check
    with open(p['settings'], 'r', encoding='utf-8') as f:
        s = json.load(f)
    expect = {'http.proxy': None, 'http.proxySupport': 'off'}
    for k, v in expect.items():
        actual = s.get(k)
        pass_ = (actual == v) if v is not None else (k not in s)
        mark = '✓' if pass_ else '✗'
        print(f"  [{mark}] settings.{k} = {actual!r}  (expect {'absent' if v is None else repr(v)})")
        ok = ok and pass_

    # DB check
    db = sqlite3.connect(f"file:{p['state_db']}?mode=ro", uri=True)
    c = db.cursor()
    for k in (SECRET_API_KEY, ITEM_AUTH_REF):
        r = c.execute("SELECT 1 FROM ItemTable WHERE key=?", (k,)).fetchone()
        mark = '✓' if not r else '✗'
        print(f"  [{mark}] DB no [{k[:60]}...] row")
        ok = ok and not r
    db.close()

    # Net check
    print("  Network:")
    for dom in ('server.codeium.com', 'inference.codeium.com'):
        rc = _curl_direct(f'https://{dom}/', 6)
        pass_ = rc.startswith('4') or rc.startswith('2') or rc.startswith('3')
        mark = '✓' if pass_ else '✗'
        print(f"    [{mark}] https://{dom}/ -> HTTP {rc}")
        ok = ok and pass_

    print(f"\n{'═'*40}")
    print('道法自然 · 回归本源' if ok else '仍有偏差, 请查看上方标 ✗ 项')
    return 0 if ok else 1


# ─── main ──────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(prog='官方模式回归', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='action', required=True)
    sub.add_parser('diag', help='诊断当前 Windsurf 状态')
    fix_p = sub.add_parser('fix', help='修复为官方直连模式 (备份+清理)')
    fix_p.add_argument('--confirm', action='store_true', help='确认执行修改')
    sub.add_parser('verify', help='验证修复后的状态')

    args = ap.parse_args()
    return {'diag': cmd_diag, 'fix': cmd_fix, 'verify': cmd_verify}[args.action](args)


if __name__ == '__main__':
    sys.exit(main())
