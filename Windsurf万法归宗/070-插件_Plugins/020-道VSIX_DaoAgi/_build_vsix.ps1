# _build_vsix.ps1 -- 020 unified build: verify + package + deploy
#
# Usage:
#   powershell -File _build_vsix.ps1                    # full build
#   powershell -File _build_vsix.ps1 -Deploy179         # build + deploy to 179
#   powershell -File _build_vsix.ps1 -DeployLocal       # build + local deploy
#   powershell -File _build_vsix.ps1 -DryRun            # verify only, no package
#
param(
    [switch]$Deploy179,
    [switch]$DeployLocal,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$SCRIPT_DIR = $PSScriptRoot

# === Paths (wildcard for CJK encoding safety) ===
$WAM_CORE_010   = Resolve-Path (Join-Path $SCRIPT_DIR '..\010-WAM*_Origin\_github_src\packages\wam')
$DAO_AGI_020    = Join-Path $SCRIPT_DIR 'dao-agi'
$VENDOR_WAM_020 = Join-Path $DAO_AGI_020 'vendor\wam'
$E2E_JS         = Join-Path $WAM_CORE_010 '_wam_e2e.js'

function L { param([string]$m, [string]$c = 'White') Write-Host "  $m" -ForegroundColor $c }
function Header { param([string]$m) Write-Host ("`n==== " + $m + " ====") -ForegroundColor Cyan }
function Hash16 { param($p) (Get-FileHash $p -Algorithm SHA256).Hash.Substring(0, 16) }

function Get-WamVersion {
    param($FilePath)
    $c = Get-Content $FilePath -Raw -ErrorAction SilentlyContinue
    if ($c -match 'const WAM_VERSION\s*=\s*"([^"]+)"') { return $matches[1] }
    return '?'
}

function Test-IsSymlink {
    param($p)
    return (Get-Item $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint
}

# === Main ===
Write-Host ''
Write-Host '  020 VSIX Build Pipeline' -ForegroundColor Cyan
Write-Host ''

# --- Step 1: WAM Core link check (委 010/_dao_link.ps1 · 单源统管) ---
Header "1/4 WAM Core (010 -> 020 · via _dao_link.ps1)"

$link010 = Resolve-Path (Join-Path $SCRIPT_DIR '..\010-WAM*_Origin\_dao_link.ps1')
if (-not $link010) { throw "010 _dao_link.ps1 未找到 · 万法不归宗" }

# 先 -Verify · 失败则自动 -Fix · 再次 -Verify 仍败即抛
& $link010 -Verify -Quiet
if ($LASTEXITCODE -ne 0) {
    L "[AUTO-FIX] 链路需修复 · 调 _dao_link.ps1 -Fix" Yellow
    & $link010 -Fix -Quiet
    & $link010 -Verify -Quiet
    if ($LASTEXITCODE -ne 0) {
        throw "WAM 链路修复失败 · 手动跑: _dao_link.ps1 -Fix -Force"
    }
}

$vendorExt = Join-Path $VENDOR_WAM_020 'extension.js'
$sourceExt = Join-Path $WAM_CORE_010 'extension.js'
$srcVer = Get-WamVersion $sourceExt
$dstVer = Get-WamVersion $vendorExt
$isLinked = Test-IsSymlink $vendorExt
if ($isLinked) {
    L "[SYMLINK] extension.js -> 010 (v$srcVer · live)" Green
} else {
    L "[COPY] extension.js v$dstVer (non-symlink · 拷贝模式)" Yellow
}

# bundled-origin check (020-owned proxy assets · 不经 _dao_link.ps1)
$boDir = Join-Path $VENDOR_WAM_020 'bundled-origin'
if (Test-Path $boDir) {
    $boCount = (Get-ChildItem $boDir -File).Count
    L "[OK] bundled-origin/ ($boCount files · 020 端自有)" Green
} else {
    L "[WARN] bundled-origin/ missing (proxy hot-deploy disabled)" Yellow
}

# --- Step 2: WAM E2E ---
Header "2/4 WAM E2E"

if (Test-Path $E2E_JS) {
    $e2eResult = & node $E2E_JS $WAM_CORE_010 2>&1
    $e2eText = $e2eResult -join "`n"
    if ($e2eText -match '(\d+)\s*pass.*?(\d+)\s*fail') {
        $p = $matches[1]; $f = $matches[2]
        if ([int]$f -eq 0) {
            L "E2E: $p pass / $f fail" Green
        } else {
            L "E2E: $p pass / $f fail" Red
            Write-Host $e2eText
            throw "E2E failed: $f failures"
        }
    } else {
        L "E2E output (non-standard):" Yellow
        $e2eText.Split("`n") | Select-Object -Last 5 | ForEach-Object { L "  $_" DarkGray }
    }
} else {
    L "E2E test not found (skip)" DarkGray
}

# --- Step 3: Syntax check + vsce package ---
Header "3/4 Syntax + Package"

$mainJs = Join-Path $DAO_AGI_020 'extension.js'
if (Test-Path $mainJs) {
    & node --check $mainJs
    if ($LASTEXITCODE -ne 0) { throw "extension.js syntax error" }
    L "extension.js syntax OK" Green
}

$pkgJson = Get-Content (Join-Path $DAO_AGI_020 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$ver = $pkgJson.version
$wamVer = Get-WamVersion $vendorExt
L "VSIX v$ver / WAM v$wamVer" Cyan

# Ensure main points to pure JS entry
$mainField = $pkgJson.main
if ($mainField -ne './extension.js') {
    L "Fix package.json main: $mainField -> ./extension.js" Yellow
    $pkgRaw = Get-Content (Join-Path $DAO_AGI_020 'package.json') -Raw -Encoding UTF8
    $pkgRaw = $pkgRaw -replace '"main"\s*:\s*"[^"]*"', '"main": "./extension.js"'
    [System.IO.File]::WriteAllText((Join-Path $DAO_AGI_020 'package.json'), $pkgRaw, [System.Text.UTF8Encoding]::new($false))
}

if ($DryRun) {
    L "[DRY] would package dao-agi v$ver" Yellow
} else {
    $vsixName = "dao-agi-$ver.vsix"
    $vsixPath = Join-Path $DAO_AGI_020 $vsixName
    if (Test-Path $vsixPath) { Remove-Item $vsixPath -Force }

    Push-Location $DAO_AGI_020
    try {
        & npx --yes '@vscode/vsce' package --no-dependencies --allow-missing-repository --allow-star-activation -o $vsixName 2>&1 | ForEach-Object { L "  $_" DarkGray }
        if ($LASTEXITCODE -ne 0) { throw "vsce package failed" }
    } finally {
        Pop-Location
    }

    if (-not (Test-Path $vsixPath)) { throw "VSIX not found: $vsixPath" }
    $sz = [math]::Round((Get-Item $vsixPath).Length / 1KB, 1)
    L "VSIX: $vsixName ($sz KB)" Green

    # Archive to 020 root
    $archivePath = Join-Path $SCRIPT_DIR $vsixName
    Copy-Item -Force $vsixPath $archivePath
    L "Archived: $archivePath" Green
}

# --- Step 4: Deploy (optional) ---
Header "4/4 Deploy"

if ($Deploy179) {
    $deployScript = Join-Path $SCRIPT_DIR 'deploy-dao-agi-179.ps1'
    if (Test-Path $deployScript) {
        L "Deploying to 179..." Yellow
        & powershell -NoProfile -ExecutionPolicy Bypass -File $deployScript -VsixPath $vsixPath -Force -Restart
    } else {
        L "Deploy script not found: $deployScript" Red
    }
} elseif ($DeployLocal) {
    $deployScript = Join-Path $SCRIPT_DIR 'deploy-dao-agi-local.ps1'
    if (Test-Path $deployScript) {
        L "Local deploy..." Yellow
        & powershell -NoProfile -ExecutionPolicy Bypass -File $deployScript -VsixPath $vsixPath
    } else {
        L "Deploy script not found: $deployScript" Red
    }
} else {
    L "No deploy flag (-Deploy179 or -DeployLocal)" DarkGray
}

# === Done ===
Write-Host ''
Write-Host "  Build complete: v$ver / WAM v$wamVer" -ForegroundColor Green
Write-Host ''
