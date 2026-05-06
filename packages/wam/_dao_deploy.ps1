# _dao_deploy.ps1 - WAM dao deploy - soft, version-agnostic, target-agnostic
#
# 道法自然 · 唯变所适 · 无为而无不为
#
# Source of truth (per-run, no hardcode):
#   version: const VERSION in extension.js
#   targets: _dao_env.psd1  (or -Targets / WAM_TARGETS_JSON)
#   ext dir: extensions.json relativeLocation per target
#
# Examples:
#   .\_dao_deploy.ps1                       # all targets in _dao_env.psd1
#   .\_dao_deploy.ps1 -LocalOnly             # local only
#   .\_dao_deploy.ps1 -Target local,179      # selected targets
#   .\_dao_deploy.ps1 -DryRun                # plan only, no write
#
# Exit:
#   0 = all OK
#   1 = some fail
#   2 = source missing

[CmdletBinding()]
param(
    [string[]]$Target = @(),
    [switch]$LocalOnly,
    [switch]$DryRun
)

$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot '_dao_lib.ps1')

$VERSION = Get-WamSourceVersion
$pkgVer  = Get-WamSourcePackageVersion
$srcExt  = Join-Path $PSScriptRoot 'extension.js'
$srcPkg  = Join-Path $PSScriptRoot 'package.json'

if (-not $VERSION) {
    Write-Host '[FATAL] cannot read const VERSION from extension.js' -ForegroundColor Red
    exit 2
}
if ($pkgVer -and ($pkgVer -ne $VERSION)) {
    Write-Host ('[WARN] package.json version ({0}) != extension.js VERSION ({1})' -f $pkgVer, $VERSION) -ForegroundColor Yellow
}

$srcSz  = (Get-Item $srcExt).Length
$srcSha = Get-WamSourceShortSha
$ts     = Get-Date -Format 'yyyyMMdd_HHmmss'

Write-Host '============================================================' -ForegroundColor Cyan
Write-Host (' WAM dao deploy - v{0} - dao fa zi ran' -f $VERSION) -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ('source: {0} bytes  sha={1}' -f $srcSz, $srcSha)
Write-Host ('        {0}' -f $srcExt)

$daoEnv  = Get-DaoEnv
$targets = Get-Targets -Filter $Target -LocalOnly:$LocalOnly -Env $daoEnv
if ($targets.Count -eq 0) {
    Write-Host '[FATAL] no targets resolved (check _dao_env.psd1 or -Target / -LocalOnly)' -ForegroundColor Red
    exit 2
}

$results = @()
foreach ($t in $targets) {
    $name = $t.name
    Write-Host ''
    Write-Host ('--- [{0}] {1} ---' -f $name, $t.label) -ForegroundColor Yellow

    if (-not $t.ok) {
        Write-Host ('   [SKIP] target unresolved: {0}' -f $t.reason) -ForegroundColor Red
        $results += [pscustomobject]@{ target=$name; ok=$false; reason=$t.reason; oldVer=''; sha=''; path='' }
        continue
    }

    # 1. resolve ext dir via extensions.json
    $loc = Resolve-DevaidLocation -ExtRoot $t.extRoot -ExtensionId $daoEnv.extensionId
    if (-not $loc.ok) {
        Write-Host ('   [SKIP] resolve fail: {0}' -f $loc.reason) -ForegroundColor Red
        $results += [pscustomobject]@{ target=$name; ok=$false; reason=$loc.reason; oldVer=''; sha=''; path='' }
        continue
    }
    Write-Host ('   relativeLocation: {0}' -f $loc.relPath) -ForegroundColor Cyan
    Write-Host ('   resolved path:    {0}' -f $loc.path) -ForegroundColor Cyan
    if (-not (Test-Path $loc.path)) {
        Write-Host '   [SKIP] resolved path does not exist' -ForegroundColor Red
        $results += [pscustomobject]@{ target=$name; ok=$false; reason='resolved_path_404'; oldVer=''; sha=''; path=$loc.path }
        continue
    }

    $dst    = $loc.path
    $oldExt = Join-Path $dst 'extension.js'
    $oldVer = '?'
    try {
        $head = Get-Content $oldExt -TotalCount 200 -ErrorAction SilentlyContinue
        $verLine = ($head | Select-String 'const VERSION\s*=\s*"' | Select-Object -First 1)
        if ($verLine) { $oldVer = ($verLine.Line -replace '.*"([0-9.]+)".*', '$1') }
    } catch {}
    Write-Host ('   pre: v{0}' -f $oldVer) -ForegroundColor Gray

    if ($DryRun) {
        Write-Host '   [DRY] would backup, copy, patch extensions.json, write marker' -ForegroundColor Magenta
        $results += [pscustomobject]@{ target=$name; ok=$true; reason='dryrun'; oldVer=$oldVer; sha=$srcSha; path=$loc.relPath }
        continue
    }

    # 2. backup
    try {
        Copy-Item $oldExt (Join-Path $dst ("extension.js.bak.v" + $oldVer + "." + $ts)) -Force -ErrorAction Stop
        Copy-Item (Join-Path $dst 'package.json') (Join-Path $dst ("package.json.bak.v" + $oldVer + "." + $ts)) -Force -ErrorAction Stop
        Write-Host '   [1/5] backup OK'
    } catch {
        Write-Host ('   [1/5] backup FAIL: {0}' -f $_.Exception.Message) -ForegroundColor Red
        $results += [pscustomobject]@{ target=$name; ok=$false; reason='backup_fail'; oldVer=$oldVer; sha=''; path=$dst }
        continue
    }

    # 3. copy
    try {
        Copy-Item $srcExt $oldExt -Force -ErrorAction Stop
        Copy-Item $srcPkg (Join-Path $dst 'package.json') -Force -ErrorAction Stop
        Write-Host '   [2/5] copy OK'
    } catch {
        Write-Host ('   [2/5] copy FAIL: {0}' -f $_.Exception.Message) -ForegroundColor Red
        $results += [pscustomobject]@{ target=$name; ok=$false; reason='copy_fail'; oldVer=$oldVer; sha=''; path=$dst }
        continue
    }

    # 4. verify byte equal
    $dstSz  = (Get-Item $oldExt).Length
    $dstSha = (Get-FileHash $oldExt -Algorithm SHA256).Hash.Substring(0, 16).ToLower()
    Write-Host ('   [3/5] dst={0} B  sha={1}' -f $dstSz, $dstSha)
    if ($srcSz -ne $dstSz) {
        Write-Host '         size MISMATCH' -ForegroundColor Red
        $results += [pscustomobject]@{ target=$name; ok=$false; reason='size'; oldVer=$oldVer; sha=$dstSha; path=$dst }
        continue
    }
    if ($srcSha -ne $dstSha) {
        Write-Host '         sha  MISMATCH' -ForegroundColor Red
        $results += [pscustomobject]@{ target=$name; ok=$false; reason='sha'; oldVer=$oldVer; sha=$dstSha; path=$dst }
        continue
    }
    Write-Host '         byte-equal OK' -ForegroundColor Green

    # 5. patch extensions.json (defensive: version + metadata.size)
    if (Test-Path $loc.xj) {
        try {
            $arr = Get-Content $loc.xj -Raw -Encoding utf8 | ConvertFrom-Json
            $hit = 0
            foreach ($e in $arr) {
                if ($e.identifier -and $e.identifier.id -eq $daoEnv.extensionId) {
                    if ($e.metadata) {
                        $e.metadata | Add-Member -NotePropertyName 'size' -NotePropertyValue $dstSz -Force
                    }
                    $e.version = $VERSION
                    $hit++
                }
            }
            $arr | ConvertTo-Json -Depth 99 | Set-Content $loc.xj -Encoding utf8
            Write-Host ('   [4/5] extensions.json patched: {0} record(s)' -f $hit)
        } catch {
            Write-Host ('   [4/5] extensions.json FAIL: {0}' -f $_.Exception.Message) -ForegroundColor Yellow
        }
    } else {
        Write-Host '   [4/5] extensions.json not found - skip'
    }

    # 6. log marker (best-effort)
    try {
        $logDir = Split-Path $t.log
        if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
        $marker = "`n===== v" + $VERSION + " DEPLOY MARKER " + $ts + " sha=" + $dstSha + " (dao fa zi ran) [from v" + $oldVer + " on " + $name + " path=" + $loc.relPath + "] ====="
        Add-Content -Path $t.log -Value $marker -Encoding utf8 -ErrorAction Stop
        Write-Host ('   [5/5] log marker written -> {0}' -f $t.log)
    } catch {
        Write-Host ('   [5/5] marker FAIL: {0}' -f $_.Exception.Message) -ForegroundColor Yellow
    }

    Write-Host ('   [{0}] DEPLOY OK  v{1} -> v{2}  sha={3}  path={4}' -f $name, $oldVer, $VERSION, $dstSha, $loc.relPath) -ForegroundColor Green
    $results += [pscustomobject]@{ target=$name; ok=$true; reason=''; oldVer=$oldVer; sha=$dstSha; path=$loc.relPath }
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' DEPLOY SUMMARY' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
$okN = 0
$totN = $results.Count
foreach ($r in $results) {
    if ($r.ok) {
        $okN++
        Write-Host ('  OK   {0,-8}  v{1} -> v{2}  sha={3}  path={4}' -f $r.target, $r.oldVer, $VERSION, $r.sha, $r.path) -ForegroundColor Green
    } else {
        Write-Host ('  FAIL {0,-8}  {1}' -f $r.target, $r.reason) -ForegroundColor Red
    }
}
$color = 'Yellow'
if ($okN -eq $totN) { $color = 'Green' }
Write-Host ('  total: {0}/{1}' -f $okN, $totN) -ForegroundColor $color

if (-not $DryRun) {
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Yellow
    Write-Host (' Reload Window to load v{0}:' -f $VERSION) -ForegroundColor Yellow
    Write-Host '   Ctrl+Shift+P -> Developer: Reload Window' -ForegroundColor Yellow
    Write-Host (' After reload, wam.log should show: "WAM v{0} activated"' -f $VERSION) -ForegroundColor Gray
    Write-Host '============================================================' -ForegroundColor Yellow
}

if ($okN -lt $totN) { exit 1 } else { exit 0 }
