#!/usr/bin/env python3
# _vscdb_helper.py — WAM vscdb 标题读取助手 · 道法自然
# 由 dao_stuck.js / extension.js 调用 · 输出 sessions JSON 到 stdout
# 无外部依赖 · Python 3 内置 sqlite3 · 支持 WAL 模式并发读
import sqlite3, json, os, sys

# v3.12.0 · 编码三重保险 · 道法自然
# 根因: Windows 中文系统 stdout 默认 CP936 · Node.js spawnSync encoding:'utf8'
#       → ensure_ascii=False 输出中文原文被 CP936 编码 → Node 以 UTF-8 解 → 菱形乱码
# 修复层 1: sys.stdout 强制 UTF-8 (Python 3.7+)
# 修复层 2: ensure_ascii=True → 非 ASCII 字符输出 \uXXXX 转义 (纯 ASCII · 编码无关)
# 修复层 3: 调用方设 PYTHONIOENCODING=utf-8 环境变量
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
elif sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

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
        sys.stdout.write(json.dumps(sessions, ensure_ascii=True))
    else:
        sys.stdout.write('[]')
    con.close()
except Exception as e:
    sys.stderr.write(str(e) + '\n')
    sys.stdout.write('[]')
