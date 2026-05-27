"""
Windsurf Proxy Guard - 防止HTTPS_PROXY被恢复
作为计划任务每5分钟运行一次
"""
import os, subprocess, json, time

FORBIDDEN_PROXIES = ['127.0.0.1:19444', 'localhost:19444']
LOG = r'C:\Temp\proxy_guard.log'

def log(msg):
    ts = time.strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line)
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except: pass

def check_and_clean():
    cleaned = False
    for scope in ['User', 'Machine']:
        for var in ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']:
            try:
                val = subprocess.run(
                    ['powershell', '-Command',
                     f"[System.Environment]::GetEnvironmentVariable('{var}','{scope}')"],
                    capture_output=True, text=True, timeout=5
                ).stdout.strip()
                if val and any(fp in val for fp in FORBIDDEN_PROXIES):
                    subprocess.run(
                        ['powershell', '-Command',
                         f"[System.Environment]::SetEnvironmentVariable('{var}','','{scope}')"],
                        capture_output=True, timeout=5
                    )
                    log(f'CLEANED {var}={val} from {scope}')
                    cleaned = True
            except: pass
    if not cleaned:
        log('OK - no forbidden proxy found')
    return cleaned

if __name__ == '__main__':
    check_and_clean()
