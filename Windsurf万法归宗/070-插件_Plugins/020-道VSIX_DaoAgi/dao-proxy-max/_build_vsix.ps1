# _build_vsix.ps1 · dao-proxy-max · 道·BYOK 大极
# ═══════════════════════════════════════════════════════════════
# 用法:
#   .\_build_vsix.ps1                # 打包 + 自动移至 ../dist/
#   .\_build_vsix.ps1 -RunL1          # 打前 L1 自检 (语法)
#   .\_build_vsix.ps1 -InstallLocal   # 打 + 装本机 Windsurf
#   .\_build_vsix.ps1 -Clean          # 清旧 vsix 后再打
# ═══════════════════════════════════════════════════════════════

param(
    [switch]$RunL1,
    [switch]$InstallLocal,
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'

# ── 0 · 路径 ──
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DistDir = Join-Path $ScriptDir '..\dist'
$PkgJson = Join-Path $ScriptDir 'package.json'

Set-Location $ScriptDir

# ── 1 · 读 package.json 取版本 ──
$pkg = Get-Content $PkgJson -Raw -Encoding UTF8 | ConvertFrom-Json
$Name = $pkg.name
$Ver = $pkg.version
$VsixName = "$Name-$Ver.vsix"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -Fore Cyan
Write-Host "  dao-proxy-max · BYOK 大极 v$Ver · 立 vsix · 道法自然" -Fore Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -Fore Cyan
Write-Host ""

# ── 2 · 清 ──
if ($Clean) {
    Write-Host "[CLEAN] 删 $ScriptDir\*.vsix" -Fore Yellow
    Get-ChildItem $ScriptDir -Filter "*.vsix" -ErrorAction SilentlyContinue | Remove-Item -Force
}

# ── 3 · L1 自检 (语法) ──
if ($RunL1) {
    Write-Host "[L1] 语法自检 extension.js + vendor/*.js" -Fore Yellow
    $jsFiles = @(
        'extension.js',
        'vendor/bundled-origin/source.js',
        'vendor/gateway/server.js',
        'vendor/byok/byok_handler.js',
        'vendor/外接api/core/dao_router.js',
        'vendor/外接api/core/cascade_wire.js',
        'vendor/外接api/dao_devindao.js'
    )
    foreach ($f in $jsFiles) {
        $fp = Join-Path $ScriptDir $f
        if (Test-Path $fp) {
            $null = & node --check $fp 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ $f" -Fore Green
            } else {
                Write-Host "  ✗ $f (语法错)" -Fore Red
                exit 1
            }
        }
    }
    Write-Host ""
}

# ── 4 · vsce 打包 ──
Write-Host "[PACK] vsce package --no-dependencies --allow-missing-repository" -Fore Yellow

# 优先用 npx vsce, 回退 npm exec vsce
$vsceCmd = Get-Command vsce -ErrorAction SilentlyContinue
if ($null -eq $vsceCmd) {
    Write-Host "  vsce 不在 PATH · 用 npx" -Fore DarkGray
    & npx --yes @vscode/vsce package --no-dependencies --allow-missing-repository --out . 2>&1 | Tee-Object -Variable vsceOut
} else {
    & vsce package --no-dependencies --allow-missing-repository --out . 2>&1 | Tee-Object -Variable vsceOut
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ vsce package 失败 (exit $LASTEXITCODE)" -Fore Red
    exit $LASTEXITCODE
}

$vsixFile = Join-Path $ScriptDir $VsixName
if (-not (Test-Path $vsixFile)) {
    Write-Host "  ✗ 期望 vsix 未生成: $VsixName" -Fore Red
    exit 1
}

$vsixSize = (Get-Item $vsixFile).Length
Write-Host ""
Write-Host "  ✓ $VsixName  ($vsixSize bytes · $([Math]::Round($vsixSize/1024,2)) KB)" -Fore Green

# ── 5 · 移至 dist/ ──
if (-not (Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir | Out-Null
}
$dstVsix = Join-Path $DistDir $VsixName
if (Test-Path $dstVsix) { Remove-Item $dstVsix -Force }
Move-Item $vsixFile $dstVsix -Force
Write-Host "  ✓ 移至 dist/: $dstVsix" -Fore Green

# ── 6 · 装本机 (可选) ──
if ($InstallLocal) {
    Write-Host ""
    Write-Host "[INSTALL] 装本机 Windsurf" -Fore Yellow
    $wsCmd = Get-Command windsurf -ErrorAction SilentlyContinue
    if ($null -eq $wsCmd) {
        $wsExe = "E:\Windsurf\bin\windsurf"
        if (Test-Path "$wsExe.cmd") { $wsCmd = "$wsExe.cmd" }
        elseif (Test-Path "$wsExe.exe") { $wsCmd = "$wsExe.exe" }
    } else {
        $wsCmd = $wsCmd.Source
    }
    if ($null -eq $wsCmd) {
        Write-Host "  ✗ windsurf 不在 PATH · 手装:" -Fore Red
        Write-Host "    windsurf --install-extension "$dstVsix" --force" -Fore DarkGray
    } else {
        & $wsCmd --install-extension $dstVsix --force 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ 装毕 · 主公请 Ctrl+Shift+P → Developer: Reload Window" -Fore Green
        } else {
            Write-Host "  ✗ 装失败 (exit $LASTEXITCODE)" -Fore Red
        }
    }
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -Fore Cyan
Write-Host "  立成 · $VsixName · $([Math]::Round($vsixSize/1024,2)) KB" -Fore Cyan
Write-Host "  位: $dstVsix" -Fore Cyan
Write-Host "  无为而无不为 · 道法自然" -Fore Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -Fore Cyan
