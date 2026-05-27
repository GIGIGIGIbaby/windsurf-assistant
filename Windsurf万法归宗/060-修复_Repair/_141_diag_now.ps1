$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=== DIAG $(Get-Date -Format 'HH:mm:ss') ==="

# 1 Hosts
Write-Host "`n[HOSTS]"
$h = Select-String -Path "$env:SystemRoot\System32\drivers\etc\hosts" -Pattern 'windsurf','codeium','self-serve' -SimpleMatch -EA SilentlyContinue
if ($h) { $h | ForEach-Object { Write-Host "  POISON: $($_.Line)" } } else { Write-Host "  CLEAN" }

# 2 Certs
Write-Host "`n[CERTS]"
$certs = Get-ChildItem "Cert:\LocalMachine\Root" -EA SilentlyContinue | Where-Object { $_.Subject -match 'self-serve|Dao' -or $_.FriendlyName -match 'Dao' }
if ($certs) { $certs | ForEach-Object { Write-Host "  BAD: $($_.Subject)" } } else { Write-Host "  CLEAN" }

# 3 Settings
Write-Host "`n[SETTINGS]"
$sp = Join-Path $env:APPDATA 'Windsurf\User\settings.json'
if (Test-Path $sp) {
    $s = Get-Content $sp -Raw | ConvertFrom-Json -EA SilentlyContinue
    $val = @('codeium.apiServerUrl','codeium.inferenceApiServerUrl','http.proxySupport','http.proxy')
    foreach ($k in $val) {
        $v = $s.$k
        if (-not $v) { $v = '(not set)' }
        Write-Host "  ${k}: $v"
    }
} else { Write-Host "  NOT FOUND" }

# 4 state.vscdb
Write-Host "`n[STATE.VSCDB]"
$db = Join-Path $env:APPDATA 'Windsurf\User\globalStorage\state.vscdb'
if (Test-Path $db) {
    $pyCode = @"
import sqlite3,json,sys
db=sys.argv[1]
conn=sqlite3.connect(db,timeout=5)
row=conn.execute("SELECT value FROM ItemTable WHERE key='codeium.windsurf'").fetchone()
if row:
    d=json.loads(row[0])
    print('blob.apiServerUrl:',d.get('apiServerUrl','(not set)'))
    print('blob.inferenceApiServerUrl:',d.get('inferenceApiServerUrl','(not set)'))
else:
    print('blob: NOT FOUND')
r1=conn.execute("SELECT value FROM ItemTable WHERE key='apiServerUrl'").fetchone()
print('gs.apiServerUrl:',r1[0] if r1 else '(not set)')
conn.close()
"@
    $pyFile = "$env:TEMP\_diag_db.py"
    Set-Content $pyFile -Value $pyCode -Encoding UTF8
    & python $pyFile $db 2>&1 | ForEach-Object { Write-Host "  $_" }
    Remove-Item $pyFile -Force -EA SilentlyContinue
} else { Write-Host "  NOT FOUND" }

# 5 extension.js
Write-Host "`n[EXTENSION.JS]"
$ej = 'E:\Windsurf\resources\app\extensions\windsurf\dist\extension.js'
if (Test-Path $ej) {
    $sz = (Get-Item $ej).Length
    Write-Host "  size: $sz"
    $h8880 = Select-String $ej -Pattern 'return"http://127.0.0.1:8880"' -SimpleMatch -Quiet
    $h8878 = Select-String $ej -Pattern 'return"http://127.0.0.1:8878"' -SimpleMatch -Quiet
    Write-Host "  patched8880: $h8880"
    Write-Host "  patched8878: $h8878"
    if ($sz -lt 100000) { Write-Host "  WARNING: file too small!" }
} else { Write-Host "  NOT FOUND" }

# 6 LS process
Write-Host "`n[LS PROCESS]"
$ls = Get-Process -Name 'language_server_windows_x64' -EA SilentlyContinue
if ($ls) {
    foreach ($p in $ls) {
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)" -EA Stop).CommandLine
            if ($cmd -match '--api_server_url\s+(\S+)') { Write-Host "  PID=$($p.Id) -> $($Matches[1])" }
            else { Write-Host "  PID=$($p.Id) -> (no url in cmd)" }
        } catch { Write-Host "  PID=$($p.Id) -> (cim error)" }
    }
} else { Write-Host "  NO LS RUNNING" }

# 7 Windsurf process
Write-Host "`n[WINDSURF PROC]"
$ws = Get-Process -Name 'Windsurf' -EA SilentlyContinue
if ($ws) { Write-Host "  $($ws.Count) processes running" } else { Write-Host "  NOT RUNNING" }

# 8 Clash
Write-Host "`n[CLASH]"
$cl = Get-NetTCPConnection -LocalPort 7890 -State Listen -EA SilentlyContinue
if ($cl) { Write-Host "  :7890 RUNNING" } else { Write-Host "  :7890 NOT RUNNING" }

# 9 DNS
Write-Host "`n[DNS]"
try {
    $r = [System.Net.Dns]::GetHostAddresses('server.self-serve.windsurf.com')[0].IPAddressToString
    Write-Host "  server.self-serve.windsurf.com -> $r"
} catch { Write-Host "  ERROR: $($_.Exception.Message)" }

# 10 Interceptors
Write-Host "`n[INTERCEPTORS]"
$found = $false
foreach ($port in @(8877,8878,8880)) {
    $svc = Get-NetTCPConnection -LocalPort $port -State Listen -EA SilentlyContinue
    if ($svc) {
        $procId = $svc.OwningProcess
        $pname = (Get-Process -Id $procId -EA SilentlyContinue).Name
        Write-Host "  :$port -> PID=$procId ($pname)"
        $found = $true
    }
}
if (-not $found) { Write-Host "  CLEAN (no interceptors)" }

Write-Host "`n=== DONE ==="
