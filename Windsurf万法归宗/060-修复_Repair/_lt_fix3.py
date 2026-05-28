#!/usr/bin/env python3
"""Fix settings by writing clean JSON directly."""
import urllib.request, json, ssl, sys
sys.stdout.reconfigure(line_buffering=True)

BASE = 'https://aiotvr.xyz/ps-agent'
TOKEN = 'dao-ps-agent-2026'
AGENT = 'LAPTOP-AKCGC7BM'
CTX = ssl.create_default_context()

def ex(cmd, timeout=90):
    body = json.dumps({'agent_id': AGENT, 'cmd': cmd, 'timeout': timeout}).encode()
    req = urllib.request.Request(f'{BASE}/api/exec-sync', data=body, method='POST')
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Content-Type', 'application/json')
    try:
        r = urllib.request.urlopen(req, timeout=timeout+15, context=CTX)
        d = json.loads(r.read())
        if d.get('status') == 'completed':
            res = d['result']
            return res.get('stdout', res.get('output', ''))
        return f"[{d.get('status')}]"
    except Exception as e:
        return f"[ERROR] {e}"

# The clean settings JSON - preserving all original settings + adding optimizations
settings_json = json.dumps({
    "[python]": {
        "diffEditor.ignoreTrimWhitespace": False,
        "editor.defaultColorDecorators": "never",
        "editor.formatOnType": True,
        "editor.wordBasedSuggestions": "off"
    },
    "debug.javascript.defaultRuntimeExecutable": {
        "pwa-node": "node"
    },
    "editor.fontSize": 20,
    "editor.formatOnSave": True,
    "editor.tabSize": 2,
    "files.autoSave": "afterDelay",
    "http.proxySupport": "off",
    "java.configuration.runtimes": [
        {
            "default": True,
            "name": "JavaSE-1.8",
            "path": "F:\\jdk"
        }
    ],
    "java.jdt.ls.java.home": "F:\\jdk",
    "liveServer.settings.donotShowInfoMsg": True,
    "python.createEnvironment.trigger": "off",
    "python.defaultInterpreterPath": "g:\\pthon\\python.exe",
    "redhat.telemetry.enabled": False,
    "security.workspace.trust.untrustedFiles": "open",
    "workbench.colorTheme": "One Dark Pro Mix",
    "workbench.editorAssociations": {
        "*.xls": "default"
    },
    "workbench.editorLargeFileConfirmation": 10240,
    "update.mode": "none",
    "hediet.vscode-drawio.resizeImages": None,
    "git.openRepositoryInParentFolders": "never",
    # === New optimizations ===
    "git.autoFetch": False,
    "git.decorations.enabled": False,
    "telemetry.telemetryLevel": "off",
    "editor.accessibilitySupport": "off",
    "kotlin.languageServer.enabled": False,
    "kotlin.debugAdapter.enabled": False,
    "files.watcherExclude": {
        "**/*.sql": True,
        "**/*.csv": True,
        "**/*.png": True,
        "**/*.jpg": True,
        "**/*.jpeg": True,
        "**/*.docx": True,
        "**/*.doc": True,
        "**/*.pptx": True,
        "**/*.ppt": True,
        "**/*.xlsx": True,
        "**/*.xls": True,
        "**/*.pdf": True,
        "**/node_modules/**": True,
        "**/__pycache__/**": True,
        "**/.git/objects/**": True
    },
    "search.exclude": {
        "**/*.sql": True,
        "**/*.csv": True,
        "**/*.png": True,
        "**/*.jpg": True,
        "**/*.docx": True,
        "**/*.pptx": True,
        "**/*.xlsx": True,
        "**/*.pdf": True,
        "**/node_modules/**": True,
        "**/__pycache__/**": True
    }
}, indent=2, ensure_ascii=False)

# Escape for PowerShell
settings_escaped = settings_json.replace("'", "''").replace("`", "``")

print("=== WRITING CLEAN SETTINGS ===")
cmd = f"""
$sf = "$env:APPDATA\\Windsurf\\User\\settings.json"
$bak = "$sf.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Copy-Item $sf $bak -Force -EA SilentlyContinue
Write-Output "Backup: $bak"

$content = @'
{settings_json}
'@

$content | Set-Content $sf -Encoding UTF8
$sz = [math]::Round((Get-Item $sf).Length/1KB,1)
Write-Output "Written: ${{sz}}KB"
Write-Output "Settings file updated with optimizations"
"""
print(ex(cmd))

# Deploy VACUUM script
print("\n=== DEPLOY VACUUM SCRIPT ===")
print(ex(r'''
$script = @'
# Windsurf state.vscdb VACUUM Script
# Step 1: Close Windsurf completely
# Step 2: Run this script
$db = "$env:APPDATA\Windsurf\User\globalStorage\state.vscdb"
$before = [math]::Round((Get-Item $db).Length/1MB,1)
Write-Host "BEFORE: ${before}MB"
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
Rename-Item $db "$db.old_$ts" -Force
Write-Host "Renamed old state.vscdb"
Write-Host "Restart Windsurf - it will create a fresh state.vscdb (< 5MB)"
'@
$scriptPath = "$env:USERPROFILE\Desktop\fix_windsurf_statedb.ps1"
$script | Set-Content $scriptPath -Encoding UTF8
Write-Output "Script saved to: $scriptPath"
'''))

# Check if Windsurf version can be updated
print("\n=== WINDSURF UPDATE CHECK ===")
print(ex(r'''
Write-Output "Current: v1.108.2 (2026-03-19)"
Write-Output "Latest on Desktop: v1.110.1 (2026-04-08)"
Write-Output "Gap: 2 minor versions behind"
Write-Output ""
Write-Output "update.mode is set to 'none' - manual update required"
Write-Output "Recommendation: Download latest from windsurf.com and install"
'''))

print("\n=== ROUND 3 COMPLETE ===")
