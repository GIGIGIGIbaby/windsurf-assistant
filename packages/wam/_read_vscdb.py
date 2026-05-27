#!/usr/bin/env python3
# vscdb 读取诊断 — 道法自然
import sqlite3, json, os, sys

APPDATA = os.environ.get('APPDATA', os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming'))
VSCDB   = os.path.join(APPDATA, 'Windsurf', 'User', 'globalStorage', 'state.vscdb')
OUT_FILE = os.path.join(os.path.expanduser('~'), '.wam', '_conv_titles.json')

print(f'VSCDB: {VSCDB}')
print(f'Exists: {os.path.exists(VSCDB)}, size={os.path.getsize(VSCDB) if os.path.exists(VSCDB) else 0}')

try:
    uri = 'file:///' + VSCDB.replace('\\', '/') + '?mode=ro'
    con = sqlite3.connect(uri, uri=True, check_same_thread=False)
    con.row_factory = sqlite3.Row

    # 读取 metadataCache
    row = con.execute("SELECT value FROM ItemTable WHERE key='windsurf.acp.metadataCache'").fetchone()
    if not row:
        print('ERROR: key windsurf.acp.metadataCache not found')
        # 列出所有 key 帮助诊断
        keys = con.execute("SELECT key FROM ItemTable LIMIT 20").fetchall()
        print('Available keys (first 20):')
        for k in keys: print('  ' + k[0])
        con.close(); sys.exit(1)

    data     = json.loads(row[0])
    sessions = data.get('sessions', [])
    titled   = [s for s in sessions if s.get('title')]
    active   = [s for s in sessions if s.get('status') == 'active']
    print(f'\nOK sessions={len(sessions)} titled={len(titled)} active={len(active)}')

    print('\n最近8条会话:')
    for s in sessions[:8]:
        uid    = (s.get('sessionId') or '')[:8]
        status = s.get('status', '?')
        title  = (s.get('title') or '(无标题)')[:60]
        print(f'  {uid} [{status:10}] {title}')

    # 构建 uuid→title 映射并写入外部标题文件
    title_map = {}
    for s in sessions:
        uid = s.get('sessionId')
        t   = s.get('title')
        if uid and t: title_map[uid] = t

    # 合并已有备份标题 (不覆盖)
    if os.path.exists(OUT_FILE):
        try:
            existing = json.loads(open(OUT_FILE).read())
            for k, v in existing.items():
                if k not in title_map: title_map[k] = v
        except: pass

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(title_map, f, ensure_ascii=False)
    print(f'\n写入 _conv_titles.json: {len(title_map)} 条')

    # 显示当前活跃 .pb 对话的标题匹配情况
    import time
    PB_DIR = os.path.join(os.path.expanduser('~'), '.codeium', 'windsurf', 'cascade')
    if os.path.exists(PB_DIR):
        pb_files = [f for f in os.listdir(PB_DIR) if f.endswith('.pb')]
        now = time.time()
        recent = []
        for f in pb_files:
            fp = os.path.join(PB_DIR, f)
            st = os.stat(fp)
            if now - st.st_mtime < 3600:
                recent.append({'uuid': f[:-3], 'size': st.st_size, 'age': int(now - st.st_mtime)})
        recent.sort(key=lambda x: x['age'])
        print(f'\n活跃对话 (1h内): {len(recent)} 个')
        print('\nuuid        size(KB)  age(s)  title')
        print('-' * 70)
        for p in recent[:10]:
            uid   = p['uuid']
            short = uid.replace('-','')[:8]
            t     = title_map.get(uid, '(无标题)')[:45]
            has   = uid in title_map
            mark  = '✓' if has else '✗'
            print(f'  {short}  {p["size"]//1024:6}KB  {p["age"]:5}s  [{mark}] {t}')

    con.close()
    print('\n=== 全部完成 ===')

except Exception as e:
    import traceback
    print(f'EXCEPTION: {e}')
    traceback.print_exc()
