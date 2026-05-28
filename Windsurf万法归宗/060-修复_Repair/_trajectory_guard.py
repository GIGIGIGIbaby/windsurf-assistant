#!/usr/bin/env python3
"""
_trajectory_guard.py — Trajectory缓存膨胀守护 v1.0
===================================================
根因: codeium.windsurf状态无限膨胀 → 13153次/session写入state.vscdb
      → I/O风暴 → TCP端口耗尽 → Windsurf"封停"

本脚本:
  - 检测codeium.windsurf状态大小
  - 超过阈值时自动清理过期trajectory缓存
  - WAL checkpoint压缩
  - 可作为启动脚本或定时任务运行

Usage:
  python _trajectory_guard.py              # 检查+按需清理
  python _trajectory_guard.py --force      # 强制清理所有过期缓存
  python _trajectory_guard.py --status     # 仅报告状态
  python _trajectory_guard.py --daemon     # 后台守护(每5分钟检查一次)
"""

import sqlite3, json, os, sys, shutil, time
from pathlib import Path
from datetime import datetime, timezone, timedelta

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except: pass

VERSION = '1.0.0'
CST = timezone(timedelta(hours=8))

# === Config ===
SIZE_THRESHOLD_KB = 512     # Trigger cleanup when codeium.windsurf > 512KB
KEEP_HOURS = 6              # Keep workspace trajectory data from last 6 hours
WAL_THRESHOLD_MB = 3        # Trigger WAL checkpoint when WAL > 3MB
DAEMON_INTERVAL = 300       # Check every 5 minutes in daemon mode

WS_APPDATA = Path(os.environ.get('APPDATA', '')) / 'Windsurf'
DB_PATH = str(WS_APPDATA / 'User' / 'globalStorage' / 'state.vscdb')

def ts():
    return datetime.now(CST).strftime('%Y-%m-%d %H:%M:%S')

def log(tag, msg):
    print(f'[{ts()}] [{tag}] {msg}')

def get_state_size():
    """Read codeium.windsurf state size without modifying"""
    tmp = DB_PATH + '.tg_tmp'
    try:
        shutil.copy2(DB_PATH, tmp)
        for ext in ['-wal', '-shm']:
            s = DB_PATH + ext
            if os.path.exists(s): shutil.copy2(s, tmp + ext)
        conn = sqlite3.connect(tmp, timeout=3)
        row = conn.execute("SELECT length(value) FROM ItemTable WHERE key='codeium.windsurf'").fetchone()
        size = row[0] if row else 0
        conn.close()
        return size
    except:
        return -1
    finally:
        for f in [tmp, tmp+'-wal', tmp+'-shm']:
            try: os.remove(f)
            except: pass

def get_wal_size():
    wal = DB_PATH + '-wal'
    return os.path.getsize(wal) if os.path.exists(wal) else 0

def cleanup_trajectories(force=False):
    """Clean stale trajectory caches from codeium.windsurf state"""
    tmp = DB_PATH + '.tg_tmp'
    try:
        shutil.copy2(DB_PATH, tmp)
        for ext in ['-wal', '-shm']:
            s = DB_PATH + ext
            if os.path.exists(s): shutil.copy2(s, tmp + ext)
        conn = sqlite3.connect(tmp, timeout=3)
        row = conn.execute("SELECT value FROM ItemTable WHERE key='codeium.windsurf'").fetchone()
        if not row:
            conn.close()
            return 0
        
        original_size = len(row[0])
        data = json.loads(row[0])
        now = datetime.now(CST)
        
        keys_removed = 0
        new_data = {}
        for k, v in data.items():
            remove = False
            
            # Remove old trajectory summaries
            if k.startswith('windsurf.state.cachedTrajectorySummaries:'):
                ws_id = k.split(':', 1)[1]
                try:
                    ts_val = int(ws_id)
                    dt = datetime.fromtimestamp(ts_val / 1000, tz=CST)
                    age_hours = (now - dt).total_seconds() / 3600
                    if age_hours > KEEP_HOURS:
                        remove = True
                except:
                    pass  # Hash-based workspace, keep
            
            # Remove old workspace info for removed workspaces
            elif k.startswith('windsurf.state.cachedWorkspaceInfosResponse:'):
                ws_id = k.split(':', 1)[1]
                traj_key = f'windsurf.state.cachedTrajectorySummaries:{ws_id}'
                # If the corresponding trajectory was removed, remove this too
                try:
                    ts_val = int(ws_id)
                    dt = datetime.fromtimestamp(ts_val / 1000, tz=CST)
                    age_hours = (now - dt).total_seconds() / 3600
                    if age_hours > KEEP_HOURS:
                        remove = True
                except:
                    pass
            
            # Clear active trajectory if force (will be re-fetched)
            elif force and k.startswith('windsurf.state.cachedActiveTrajectory:'):
                remove = True
            
            # Clear oversized cachedUserStatus if force (will be re-fetched)
            elif force and k == 'windsurf.state.cachedUserStatus':
                if isinstance(v, str) and len(v) > 10000:
                    remove = True
            
            if remove:
                keys_removed += 1
            else:
                new_data[k] = v
        
        conn.close()
        
        if keys_removed == 0:
            log('GUARD', 'No stale entries found')
            return 0
        
        new_json = json.dumps(new_data, ensure_ascii=False)
        new_size = len(new_json)
        freed = original_size - new_size
        
        log('GUARD', f'Cleaning {keys_removed} entries: {original_size/1024:.0f}KB → {new_size/1024:.0f}KB (freed {freed/1024:.0f}KB)')
        
        # Write back
        wconn = sqlite3.connect(DB_PATH, timeout=10)
        wconn.execute("UPDATE ItemTable SET value=? WHERE key='codeium.windsurf'", (new_json,))
        wconn.commit()
        wconn.close()
        
        return freed
    except Exception as e:
        log('ERROR', f'Cleanup failed: {e}')
        return -1
    finally:
        for f in [tmp, tmp+'-wal', tmp+'-shm']:
            try: os.remove(f)
            except: pass

def wal_checkpoint():
    """Run WAL checkpoint to compact database"""
    try:
        wal_size = get_wal_size()
        if wal_size < WAL_THRESHOLD_MB * 1024 * 1024:
            return
        log('WAL', f'WAL={wal_size/1024/1024:.1f}MB > {WAL_THRESHOLD_MB}MB, checkpointing...')
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.close()
        new_wal = get_wal_size()
        log('WAL', f'Checkpoint done: {wal_size/1024/1024:.1f}MB → {new_wal/1024/1024:.1f}MB')
    except Exception as e:
        log('WAL', f'Checkpoint failed (DB locked?): {e}')

def check_and_fix():
    """Main check: if state too large, clean it"""
    state_size = get_state_size()
    wal_size = get_wal_size()
    
    state_kb = state_size / 1024 if state_size > 0 else 0
    wal_mb = wal_size / 1024 / 1024
    
    status = 'OK' if state_kb < SIZE_THRESHOLD_KB else 'BLOATED'
    log('CHECK', f'codeium.windsurf={state_kb:.0f}KB (threshold={SIZE_THRESHOLD_KB}KB) [{status}] | WAL={wal_mb:.1f}MB')
    
    if state_kb >= SIZE_THRESHOLD_KB:
        log('CHECK', f'State exceeds threshold, triggering cleanup...')
        freed = cleanup_trajectories(force=state_kb > SIZE_THRESHOLD_KB * 2)
        if freed > 0:
            log('CHECK', f'Freed {freed/1024:.0f}KB')
    
    if wal_mb >= WAL_THRESHOLD_MB:
        wal_checkpoint()
    
    return state_kb < SIZE_THRESHOLD_KB

def status_report():
    """Print status without modifying"""
    state_size = get_state_size()
    wal_size = get_wal_size()
    db_size = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0
    
    print(f'\n  Trajectory Guard v{VERSION}')
    print(f'  codeium.windsurf: {state_size/1024:.0f}KB (threshold: {SIZE_THRESHOLD_KB}KB)')
    print(f'  WAL: {wal_size/1024/1024:.1f}MB (threshold: {WAL_THRESHOLD_MB}MB)')
    print(f'  DB: {db_size/1024/1024:.1f}MB')
    
    status = '✅ HEALTHY' if state_size/1024 < SIZE_THRESHOLD_KB else '⚠ NEEDS CLEANUP'
    print(f'  Status: {status}\n')

def daemon_loop():
    """Run as background daemon"""
    log('DAEMON', f'Trajectory Guard v{VERSION} daemon started (interval={DAEMON_INTERVAL}s)')
    while True:
        try:
            check_and_fix()
        except Exception as e:
            log('DAEMON', f'Error: {e}')
        time.sleep(DAEMON_INTERVAL)

if __name__ == '__main__':
    if '--status' in sys.argv:
        status_report()
    elif '--daemon' in sys.argv:
        daemon_loop()
    elif '--force' in sys.argv:
        cleanup_trajectories(force=True)
        wal_checkpoint()
    else:
        check_and_fix()
