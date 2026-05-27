#!/usr/bin/env python3
# _vscdb_helper.py — WAM vscdb 标题读取助手 · 道法自然
# 由 dao_stuck.js / extension.js 调用 · 输出 sessions JSON 到 stdout
# 无外部依赖 · Python 3 内置 sqlite3 · 支持 WAL 模式并发读
import sqlite3, json, os, sys

APPDATA = os.environ.get('APPDATA', os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming'))
VSCDB   = os.path.join(APPDATA, 'Windsurf', 'User', 'globalStorage', 'state.vscdb')

try:
    # mode=ro: 只读 · 不触发 WAL checkpoint · 安全并发
    uri = 'file:///' + VSCDB.replace('\\', '/') + '?mode=ro'
    con = sqlite3.connect(uri, uri=True, check_same_thread=False, timeout=5)
    row = con.execute(
        "SELECT value FROM ItemTable WHERE key='windsurf.acp.metadataCache'"
    ).fetchone()
    if row:
        data     = json.loads(row[0])
        sessions = data.get('sessions', [])
        sys.stdout.write(json.dumps(sessions, ensure_ascii=False))
    else:
        sys.stdout.write('[]')
    con.close()
except Exception as e:
    sys.stderr.write(str(e) + '\n')
    sys.stdout.write('[]')
