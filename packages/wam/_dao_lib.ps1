# _dao_lib.ps1 - shared helpers - dot-source from any deploy/verify script
#
# 道法自然 · 单一信源 · 无为而无不为
#
# Usage:
#   . (Join-Path $PSScriptRoot '_dao_lib.ps1')
#
# Exposes:
#   Get-DaoEnv                       -> hashtable from _dao_env.psd1
#   Get-WamSourceVersion             -> read 'const VERSION = "x.y.z"' from extension.js
#   Get-WamSourcePackageVersion      -> read .version from package.json
#   Resolve-DevaidLocation -ExtRoot  -> read extensions.json, locate ext dir
#   Resolve-Target -Target           -> turn target dict into { extRoot, log, label }
#   Get-Targets [-Filter] [-LocalOnly] -> list of resolved targets
#   Get-WamSourceShortSha            -> 16-char sha256 of extension.js

$script:DaoLibDir = $PSScriptRoot

function Get-DaoEnv {
    param([string]$EnvFile = (Join-Path $script:DaoLibDir '_dao_env.psd1'))
    if (-not (Test-Path $EnvFile)) {
        return @{
            extensionId = 'devaid.rt-flow'
            wamHomeDir  = '.wam'
            extDirHint  = '.windsurf\extensions'
            targets     = @(@{ name = 'local'; kind = 'local' })
        }
    }
    $h = Import-PowerShellDataFile -Path $EnvFile
    if (-not $h.extensionId) { $h.extensionId = 'devaid.rt-flow' }
    if (-not $h.wamHomeDir)  { $h.wamHomeDir  = '.wam' }
    if (-not $h.extDirHint)  { $h.extDirHint  = '.windsurf\extensions' }
    if (-not $h.targets)     { $h.targets     = @(@{ name = 'local'; kind = 'local' }) }

    # env override: WAM_TARGETS_JSON
    if ($env:WAM_TARGETS_JSON) {
        try {
            $arr = $env:WAM_TARGETS_JSON | ConvertFrom-Json
            $h.targets = @($arr | ForEach-Object { @{} + $_.PSObject.Properties.Where({$true}).ForEach({@{$_.Name=$_.Value}}) })
        } catch {
            Write-Warning ('WAM_TARGETS_JSON parse fail: ' + $_.Exception.Message)
        }
    }
    return $h
}

function Get-WamSourceVersion {
    param([string]$ExtensionJs = (Join-Path $script:DaoLibDir 'extension.js'))
    if (-not (Test-Path $ExtensionJs)) { return $null }
    $head = Get-Content $ExtensionJs -TotalCount 200 -ErrorAction SilentlyContinue
    $verLine = ($head | Select-String 'const VERSION\s*=\s*"' | Select-Object -First 1)
    if (-not $verLine) { return $null }
    return ($verLine.Line -replace '.*"([0-9]+\.[0-9]+\.[0-9]+)".*', '$1')
}

function Get-WamSourcePackageVersion {
    param([string]$PackageJson = (Join-Path $script:DaoLibDir 'package.json'))
    if (-not (Test-Path $PackageJson)) { return $null }
    try {
        $j = Get-Content $PackageJson -Raw -Encoding utf8 | ConvertFrom-Json
        return $j.version
    } catch { return $null }
}

function Get-WamSourceShortSha {
    param(
        [string]$ExtensionJs = (Join-Path $script:DaoLibDir 'extension.js'),
        [int]$Length = 16
    )
    if (-not (Test-Path $ExtensionJs)) { return '' }
    return (Get-FileHash $ExtensionJs -Algorithm SHA256).Hash.Substring(0, $Length).ToLower()
}

function Resolve-DevaidLocation {
    param(
        [Parameter(Mandatory)] [string]$ExtRoot,
        [string]$ExtensionId = 'devaid.rt-flow'
    )
    $xj = Join-Path $ExtRoot 'extensions.json'
    if (-not (Test-Path $xj)) {
        return [pscustomobject]@{ ok=$false; reason='extensions.json 404'; path=''; relPath=''; xj=$xj }
    }
    try {
        $arr = Get-Content $xj -Raw -Encoding utf8 | ConvertFrom-Json
    } catch {
        return [pscustomobject]@{ ok=$false; reason="json parse: $($_.Exception.Message)"; path=''; relPath=''; xj=$xj }
    }
    $rec = $arr | Where-Object { $_.identifier.id -eq $ExtensionId } | Select-Object -First 1
    if (-not $rec) {
        return [pscustomobject]@{ ok=$false; reason="no $ExtensionId record"; path=''; relPath=''; xj=$xj }
    }
    $relLoc = $rec.relativeLocation
    if (-not $relLoc) {
        if ($rec.location -and $rec.location.path) {
            $rp = $rec.location.path -replace '^/', ''
            $relLoc = Split-Path $rp -Leaf
        } else {
            return [pscustomobject]@{ ok=$false; reason='neither relativeLocation nor location.path'; path=''; relPath=''; xj=$xj }
        }
    }
    return [pscustomobject]@{
        ok=$true; reason=''; path=(Join-Path $ExtRoot $relLoc); relPath=$relLoc; xj=$xj; record=$rec
    }
}

function Resolve-Target {
    param(
        [Parameter(Mandatory)] $Target,
        [Parameter(Mandatory)] $Env
    )
    $kind = "$($Target.kind)".ToLower()
    $name = $Target.name
    if (-not $name) { $name = $kind }

    switch ($kind) {
        'local' {
            $userProf = $env:USERPROFILE
            return [pscustomobject]@{
                name    = $name
                kind    = 'local'
                ok      = $true
                extRoot = Join-Path $userProf $Env.extDirHint
                log     = Join-Path (Join-Path $userProf $Env.wamHomeDir) 'wam.log'
                label   = "local ($userProf)"
            }
        }
        'smb' {
            $h    = $Target.host
            $u    = $Target.user
            $d    = $Target.drive; if (-not $d) { $d = 'C' }
            if (-not $h -or -not $u) {
                return [pscustomobject]@{ name=$name; kind='smb'; ok=$false; reason='smb target missing host/user' }
            }
            $userHome = "\\$h\$d`$\Users\$u"
            return [pscustomobject]@{
                name    = $name
                kind    = 'smb'
                ok      = $true
                host    = $h
                user    = $u
                drive   = $d
                extRoot = Join-Path $userHome $Env.extDirHint
                log     = Join-Path (Join-Path $userHome $Env.wamHomeDir) 'wam.log'
                label   = "smb ($u@$h)"
            }
        }
        default {
            return [pscustomobject]@{ name=$name; kind=$kind; ok=$false; reason="unknown kind: $kind" }
        }
    }
}

function Get-Targets {
    param(
        [string[]]$Filter = @(),
        [switch]$LocalOnly,
        $Env = $null
    )
    if (-not $Env) { $Env = Get-DaoEnv }
    $out = @()
    foreach ($t in $Env.targets) {
        $r = Resolve-Target -Target $t -Env $Env
        if ($LocalOnly -and $r.kind -ne 'local') { continue }
        if ($Filter.Count -gt 0 -and ($Filter -notcontains $r.name)) { continue }
        $out += $r
    }
    return $out
}
