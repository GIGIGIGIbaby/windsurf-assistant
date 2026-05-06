# _dao_postreload_verify.ps1 - generic post-reload verifier
#
# 道法自然 · 唯变所适 · 验证之常 · 与版本无关
#
# Examples:
#   .\_dao_postreload_verify.ps1                       # use source VERSION
#   .\_dao_postreload_verify.ps1 -ExpectVersion 2.6.7  # explicit
#   .\_dao_postreload_verify.ps1 -Target 179           # remote (smb log)

[CmdletBinding()]
param(
    [string]$ExpectVersion = '',
    [string]$Target = 'local'
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '_dao_lib.ps1')

if (-not $ExpectVersion) {
    $ExpectVersion = Get-WamSourceVersion
}
if (-not $ExpectVersion) {
    Write-Host '[FATAL] cannot determine ExpectVersion (no source extension.js?)' -ForegroundColor Red
    exit 2
}

$daoEnv = Get-DaoEnv
$tList = Get-Targets -Filter @($Target) -Env $daoEnv
if ($tList.Count -eq 0) {
    Write-Host ('[FATAL] target not found: {0}' -f $Target) -ForegroundColor Red
    exit 2
}
$tgt = $tList[0]
if (-not $tgt.ok) {
    Write-Host ('[FATAL] target unresolved: {0}' -f $tgt.reason) -ForegroundColor Red
    exit 2
}

$logPath = $tgt.log
$src = Join-Path $PSScriptRoot 'extension.js'

Write-Host '============================================================' -ForegroundColor Cyan
Write-Host (' dao verify - expect v{0} on [{1}]' -f $ExpectVersion, $tgt.label) -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan

if (-not (Test-Path $logPath)) {
    Write-Host ('[ERR] wam.log not found: {0}' -f $logPath) -ForegroundColor Red
    exit 2
}
$lines = Get-Content $logPath -Encoding utf8

# locate last DEPLOY MARKER for this version
$markerPat = ('v' + [regex]::Escape($ExpectVersion) + ' DEPLOY MARKER')
$markerIdx = -1
for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i] -match $markerPat) { $markerIdx = $i; break }
}
if ($markerIdx -lt 0) {
    Write-Host ('[?] v{0} DEPLOY MARKER not found - run _dao_deploy.ps1 first' -f $ExpectVersion) -ForegroundColor Yellow
    exit 1
}
$post = $lines[($markerIdx + 1)..($lines.Count - 1)]
Write-Host ('Marker line: {0} - post lines: {1}' -f ($markerIdx + 1), $post.Count) -ForegroundColor Gray

# [1] activate marker
$actPat = ('WAM v' + [regex]::Escape($ExpectVersion) + ' activate')
$act = $post | Where-Object { $_ -match $actPat }
if ($act.Count -gt 0) {
    Write-Host ('[OK 1] process reloaded to v{0}' -f $ExpectVersion) -ForegroundColor Green
    $act | Select-Object -Last 2 | ForEach-Object { Write-Host ('    ' + $_) -ForegroundColor DarkGray }
} else {
    Write-Host ('[?? 1] no v{0} activate seen - did you Reload Window?' -f $ExpectVersion) -ForegroundColor Yellow
    Write-Host '       Ctrl+Shift+P -> Developer: Reload Window' -ForegroundColor Yellow
    exit 1
}

# [2] _per_msg_diag.json (only meaningful for local kind)
if ($tgt.kind -eq 'local') {
    $diagPath = Join-Path (Join-Path $env:USERPROFILE $daoEnv.wamHomeDir) '_per_msg_diag.json'
    if (Test-Path $diagPath) {
        try {
            $diag = Get-Content $diagPath -Raw -Encoding utf8 | ConvertFrom-Json
            $hits      = if ($diag.totalHits)      { $diag.totalHits }      else { 0 }
            $rotates   = if ($diag.totalRotates)   { $diag.totalRotates }   else { 0 }
            $debounced = if ($diag.totalDebounced) { $diag.totalDebounced } else { 0 }
            Write-Host '[OK 2] _per_msg_diag.json:' -ForegroundColor Green
            Write-Host ('   totalHits      = {0}' -f $hits)      -ForegroundColor Cyan
            Write-Host ('   totalRotates   = {0}' -f $rotates)   -ForegroundColor Cyan
            Write-Host ('   totalDebounced = {0}' -f $debounced) -ForegroundColor $(if ($debounced -gt 0) {'Green'} else {'Yellow'})
        } catch {
            Write-Host ('[?? 2] diag json parse fail: {0}' -f $_.Exception.Message) -ForegroundColor Yellow
        }
    } else {
        Write-Host '[?? 2] _per_msg_diag.json not found - send a message first' -ForegroundColor Yellow
    }
}

# [3] log signal counts
$debouncedLog = $post | Where-Object { $_ -match 'per-msg debounced#' }
$hitsLog      = $post | Where-Object { $_ -match 'per-msg hit#' }
$rotateLog    = $post | Where-Object { $_ -match 'per-msg rotate#' }
$pbSettle     = $post | Where-Object { $_ -match 'pb.settle:|pb settle:' }
$pbNew        = $post | Where-Object { $_ -match 'pb.new:|pb new:' }
$walSettle    = $post | Where-Object { $_ -match 'WAL . settle:|WAL settle:' }
Write-Host ''
Write-Host '[OK 3] log signal counts (post-marker):' -ForegroundColor Green
Write-Host ('   per-msg hit#       : {0}' -f $hitsLog.Count) -ForegroundColor Cyan
Write-Host ('   per-msg rotate#    : {0}' -f $rotateLog.Count) -ForegroundColor Cyan
Write-Host ('   per-msg debounced# : {0}' -f $debouncedLog.Count) -ForegroundColor $(if ($debouncedLog.Count -gt 0) {'Green'} else {'Yellow'})
Write-Host ('   pb new             : {0}' -f $pbNew.Count) -ForegroundColor Cyan
Write-Host ('   pb settle          : {0}' -f $pbSettle.Count) -ForegroundColor Cyan
Write-Host ('   wal settle         : {0}' -f $walSettle.Count) -ForegroundColor Cyan

if ($debouncedLog.Count -gt 0) {
    Write-Host ''
    Write-Host '   last 5 debounced events:' -ForegroundColor Gray
    $debouncedLog | Select-Object -Last 5 | ForEach-Object { Write-Host ('   ' + $_) -ForegroundColor DarkGray }
}

# [4] SRC vs DEP sha (only when target.extRoot is reachable)
$loc = Resolve-DevaidLocation -ExtRoot $tgt.extRoot -ExtensionId $daoEnv.extensionId
if ($loc.ok -and (Test-Path (Join-Path $loc.path 'extension.js'))) {
    $srcSha = (Get-FileHash $src -Algorithm SHA256).Hash.Substring(0, 16).ToLower()
    $dstSha = (Get-FileHash (Join-Path $loc.path 'extension.js') -Algorithm SHA256).Hash.Substring(0, 16).ToLower()
    if ($srcSha -eq $dstSha) {
        Write-Host ''
        Write-Host ('[OK 4] SRC sha === DEP sha = {0}' -f $srcSha) -ForegroundColor Green
    } else {
        Write-Host ''
        Write-Host ('[FAIL 4] SRC sha={0} != DEP sha={1}' -f $srcSha, $dstSha) -ForegroundColor Red
    }
}

# [5] state.json (local only by default)
if ($tgt.kind -eq 'local') {
    $ws = Join-Path (Join-Path $env:USERPROFILE $daoEnv.wamHomeDir) 'wam-state.json'
    if (Test-Path $ws) {
        try {
            $j = Get-Content $ws -Raw -Encoding utf8 | ConvertFrom-Json
            Write-Host ''
            Write-Host ('  state active={0} switches={1}' -f $j.activeEmail, $j.switches) -ForegroundColor Cyan
        } catch {}
    }
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' verify done - dao fa zi ran' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
