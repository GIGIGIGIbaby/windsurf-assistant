param(
    [string]$HostName = 'administrator@192.168.31.141',
    [string]$RemoteNodeScript = 'C:/Temp/origin-synth-chat.js',
    [string]$LocalNodeScript = $(Join-Path $PSScriptRoot 'origin-synth-chat.js')
)

$ErrorActionPreference = 'Stop'

function Run-RemotePowerShell([string]$Script) {
    $bytes = [System.Text.Encoding]::Unicode.GetBytes($Script)
    $encoded = [Convert]::ToBase64String($bytes)
    & ssh $HostName "powershell -NoProfile -EncodedCommand $encoded"
}

Write-Output "== origin remote verify =="
Write-Output "host=$HostName"
Write-Output "local_script=$LocalNodeScript"
Write-Output "remote_script=$RemoteNodeScript"

if (-not (Test-Path $LocalNodeScript)) {
    throw "local script not found: $LocalNodeScript"
}

& scp -q $LocalNodeScript ($HostName + ':' + $RemoteNodeScript)

Write-Output "`n== 1. proxy ping / mode / rpc_trace summary =="
Run-RemotePowerShell @'
$base = 'http://127.0.0.1:8889'
$ping = Invoke-WebRequest -Uri "$base/origin/ping" -UseBasicParsing -TimeoutSec 5 | Select-Object -ExpandProperty Content | ConvertFrom-Json
Write-Output ("ping ok=" + $ping.ok + " mode=" + $ping.mode + " pid=" + $ping.pid + " req=" + $ping.req_total + " custom_sp=" + $ping.custom_sp + " custom_sp_chars=" + $ping.custom_sp_chars)
$trace = Invoke-WebRequest -Uri "$base/origin/rpc_trace?limit=20" -UseBasicParsing -TimeoutSec 5 | Select-Object -ExpandProperty Content | ConvertFrom-Json
Write-Output ("trace total=" + $trace.total_traced + " kinds=" + ($trace.kinds | ConvertTo-Json -Compress))
'@

Write-Output "`n== 2. synthetic CHAT_PROTO e2e =="
& ssh $HostName "node $RemoteNodeScript"

Write-Output "`n== 3. lastinject content proof =="
Run-RemotePowerShell @'
$base = 'http://127.0.0.1:8889'
$j = Invoke-WebRequest -Uri "$base/origin/lastinject?full=1" -UseBasicParsing -TimeoutSec 8 | Select-Object -ExpandProperty Content | ConvertFrom-Json
Write-Output ("has_inject=" + $j.has_inject + " agent=" + $j.agent_class + " kind=" + $j.kind + " variant=" + $j.variant)
Write-Output ("before_chars=" + $j.before_chars + " after_chars=" + $j.after_chars)
if ($j.after) {
    Write-Output ("has_dao_open=" + $j.after.Contains('道可道，非常道'))
    Write-Output ("has_dao_close=" + $j.after.Contains('为而不争'))
    Write-Output ("has_custom_sp_marker=" + $j.after.Contains('[CUSTOM-SP-ACTIVE]'))
}
if ($j.before) {
    Write-Output ("has_synth_marker=" + $j.before.Contains('道德经测试 · synth-chat · v17.79'))
}
'@

Write-Output "`n== origin remote verify PASS =="
