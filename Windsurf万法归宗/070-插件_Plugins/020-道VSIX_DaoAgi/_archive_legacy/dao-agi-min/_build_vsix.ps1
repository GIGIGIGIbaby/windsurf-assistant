# _build_vsix.ps1 · v20.0 · dao-agi-min 装包 (WAM + Proxy 反代替换)
# 道法自然 · 无为而无不为 · 反者道之动
#
# 用法:
#   .\_build_vsix.ps1                 # 校验 + 打包
#   .\_build_vsix.ps1 -SyncWam        # 先同步 010 → vendor/wam · 再打包
#   .\_build_vsix.ps1 -SyncOrigin     # 先同步 dao-agi 活源 → vendor/wam/bundled-origin · 再打包
#   .\_build_vsix.ps1 -SyncAll        # 双同步
#   .\_build_vsix.ps1 -DryRun         # 仅校验
#   .\_build_vsix.ps1 -InstallLocal   # 打 + 装本机

[CmdletBinding()]
param(
  [switch]$SyncWam,
  [switch]$SyncOrigin,
  [switch]$SyncAll,
  [switch]$DryRun,
  [switch]$InstallLocal
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pkgPath = Join-Path $root 'package.json'

if ($SyncAll) { $SyncWam = $true; $SyncOrigin = $true }

Write-Host '』 dao-agi-min v20.0 · 装包 (WAM + Proxy 反代替换)' -ForegroundColor Cyan
Write-Host ('  根: ' + $root) -ForegroundColor DarkGray

# ── 一 · 校验本源齐 (settings.json 单一锚 · 无 锚.py) ──
$mustHave = @(
  'package.json',
  'extension.js',
  'media\icon.png',
  'media\icon.svg',
  'vendor\wam\extension.js',
  'vendor\wam\package.json',
  'vendor\wam\bundled-origin\源.js',
  'vendor\wam\bundled-origin\_dao_81.txt'
)
$missing = @()
foreach ($f in $mustHave) {
  $p = Join-Path $root $f
  if (-not (Test-Path $p)) { $missing += $f }
}
if ($missing.Count -gt 0) {
  Write-Host '  ✗ 缺件:' -ForegroundColor Red
  foreach ($m in $missing) { Write-Host ('    ' + $m) -ForegroundColor Red }
  exit 1
}
Write-Host '  ✓ 八本源齐 (extension/package/2icon/wam:2/bundled-origin:2 · settings单锚 · 无锚.py)' -ForegroundColor Green

# ── 二 · 取版本 ──
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$ver = $pkg.version
Write-Host ('  版本 v' + $ver) -ForegroundColor Yellow

# ── 三 · WAM 同步 (可选) ──
if ($SyncWam) {
  $wamSrc = Resolve-Path (Join-Path $root '..\..\010-WAM本源_Origin\_github_src\packages\wam')
  $wamDst = Join-Path $root 'vendor\wam'
  Write-Host '  同步 WAM 010 → vendor/wam' -ForegroundColor Yellow
  Copy-Item (Join-Path $wamSrc 'extension.js') (Join-Path $wamDst 'extension.js') -Force
  Copy-Item (Join-Path $wamSrc 'package.json') (Join-Path $wamDst 'package.json') -Force
  Write-Host '  ✓ WAM 同步' -ForegroundColor Green
}

# ── 三.一 · 反代源同步 (可选 · 从活 dao-agi 同步 v18.0+ start API 版) ──
if ($SyncOrigin) {
  $oriSrc = Resolve-Path (Join-Path $root '..\dao-agi\vendor\wam\bundled-origin')
  $oriDst = Join-Path $root 'vendor\wam\bundled-origin'
  Write-Host '  同步反代 dao-agi → vendor/wam/bundled-origin' -ForegroundColor Yellow
  if (-not (Test-Path $oriDst)) { New-Item -ItemType Directory -Path $oriDst -Force | Out-Null }
  Copy-Item (Join-Path $oriSrc '*') $oriDst -Force -Recurse
  Write-Host '  ✓ 反代源同步 (含 start API · 道德经 · mode 持盘)' -ForegroundColor Green
}

# ── 四 · DryRun 即止 ──
if ($DryRun) {
  Write-Host '  -DryRun · 校验完毕 · 不打包' -ForegroundColor Yellow
  exit 0
}

# ── 五 · vsce package ──
$vsixOut = Join-Path $root ("dao-agi-min-" + $ver + ".vsix")
if (Test-Path $vsixOut) { Remove-Item $vsixOut -Force }
Write-Host '  vsce package …' -ForegroundColor Yellow
Push-Location $root
try {
  npx --yes @vscode/vsce@latest package --no-dependencies --allow-missing-repository -o $vsixOut
  if ($LASTEXITCODE -ne 0) {
    throw 'vsce package 失 (exitCode=' + $LASTEXITCODE + ')'
  }
} finally {
  Pop-Location
}
if (-not (Test-Path $vsixOut)) {
  throw 'vsix 未生成: ' + $vsixOut
}
$sizeKB = [math]::Round((Get-Item $vsixOut).Length / 1KB, 1)
Write-Host ('  ✓ ' + (Split-Path $vsixOut -Leaf) + ' (' + $sizeKB + ' KB)') -ForegroundColor Green

# ── 六 · 装本机 (可选) ──
if ($InstallLocal) {
  $windsurfExe = Get-Command windsurf -EA SilentlyContinue
  if ($windsurfExe) {
    Write-Host '  装本机 …' -ForegroundColor Yellow
    & windsurf --install-extension $vsixOut
    Write-Host '  ✓ 装毕 · 请 Reload Window' -ForegroundColor Green
  } else {
    Write-Host '  ⚠ 未发现 windsurf 命令 · 跳过装' -ForegroundColor DarkYellow
  }
}

Write-Host ''
Write-Host '» 完: ' -NoNewline -ForegroundColor Cyan
Write-Host $vsixOut
Write-Host '  装: windsurf --install-extension "' -NoNewline -ForegroundColor DarkGray
Write-Host $vsixOut -NoNewline
Write-Host '"' -ForegroundColor DarkGray
Write-Host '  Ctrl+Shift+P → Reload Window' -ForegroundColor DarkGray
