#!/usr/bin/env pwsh
<#
.SYNOPSIS
  印 119 · GH PR-ready patch 之生成器 · 一劳永逸 · 主公一字便起

.DESCRIPTION
  从此家最新之真本源 (00_本源/ + 01_GH编排/) 自动生成 _PR_PATCH/ 之 GH repo 子目录结构
  · 不冗余 cp 至顶层 · 0 hardcoded path · 总与真本源同步
  · 主公一字便起 · 永逸

  「为大于其细 · 图难于其易」(《老子》六十三)
  「合抱之木 · 生于毫末 · 九层之台 · 起于累土」(《老子》六十四)

.PARAMETER Target
  目标 GH repo 之 root path. 默 ".\_PR_PATCH" (本目录下立子目录预览)
  指真 GH repo (e.g. "e:\windsurf-assistant\") 即直 cp 至 repo

.PARAMETER PreviewOnly
  仅 list 待 cp 之件 · 不真 cp

.PARAMETER GitCommit
  cp 后自动 git add + commit (需在真 repo 内)

.EXAMPLE
  # 预览此次 patch 待 cp 之件 (默)
  pwsh _APPLY_GH_PR.ps1

.EXAMPLE
  # 生成 _PR_PATCH/ 子目录预览 (不入 repo)
  pwsh _APPLY_GH_PR.ps1 -Target ".\_PR_PATCH"

.EXAMPLE
  # 真 cp 至 windsurf-assistant repo (主公审 后一字)
  pwsh _APPLY_GH_PR.ps1 -Target "e:\path\to\windsurf-assistant" -GitCommit
#>

[CmdletBinding()]
param(
  # 印 121 · 新拓扑 · 主 git working clone 已迁至 130-道独立体_Standalone\公网
  # 默 → _PR_PATCH 子目录预览 · 主公一字真 cp 即指 130/公网
  [string]$Target = ".\_PR_PATCH",
  [switch]$PreviewOnly,
  [switch]$GitCommit
)

# ─── 路径 ───
$ErrorActionPreference = 'Stop'
$BASE = Resolve-Path "$PSScriptRoot\.."  # 虚拟机反代/
$BENYUAN = Join-Path $BASE "00_本源"
$GH = Join-Path $BASE "01_GH编排"

# 印 121 · 新拓扑之真 git working clone (主公记忆 update · ws-deploy 已废)
$GIT_CLONE_NEW = "e:\道\道生一\一生二\Windsurf万法归宗\130-道独立体_Standalone\公网"

# ─── 件清单 (源 → repo 内之路) ───
$MAP = @(
  # ── packages/dao-devin-vm/ · npm 子包 ──
  @{src="$BENYUAN\dao_proxy.js";        dst="packages/dao-devin-vm/dao_proxy.js"}
  @{src="$BENYUAN\vm_omni.js";          dst="packages/dao-devin-vm/vm_omni.js"}
  @{src="$BENYUAN\vm_proxy_deploy.js";  dst="packages/dao-devin-vm/vm_proxy_deploy.js"}
  @{src="$BENYUAN\meta_router.cjs";     dst="packages/dao-devin-vm/meta_router.cjs"}        # 印 120 · 三池打通
  @{src="$BENYUAN\vm_meta_deploy.js";   dst="packages/dao-devin-vm/vm_meta_deploy.js"}      # 印 120 · 装 meta_router
  @{src="$BENYUAN\sp_observe_patch.js"; dst="packages/dao-devin-vm/sp_observe_patch.js"}    # 印 122 · 主公 sp_observe 软接入 · dao_proxy require
  @{src="$BENYUAN\vm_pool_watchdog.js"; dst="packages/dao-devin-vm/vm_pool_watchdog.js"}    # 印 122 · 自启换之 · 5min poll · tunnel rotation
  @{src="$BENYUAN\silk\_silk_dao.txt";  dst="packages/dao-devin-vm/silk/_silk_dao.txt"}
  @{src="$BENYUAN\silk\_silk_de.txt";   dst="packages/dao-devin-vm/silk/_silk_de.txt"}
  @{src="$GH\deployer.js";              dst="packages/dao-devin-vm/deployer.js"}
  @{src="$GH\package.json";             dst="packages/dao-devin-vm/package.json"}
  @{src="$GH\_pkg_README.md";           dst="packages/dao-devin-vm/README.md"}
  # ── .github/workflows/ · GH Actions ──
  @{src="$GH\workflow\dao-fleet-devin-cloud.yml";  dst=".github/workflows/dao-fleet-devin-cloud.yml"}
  # ── tests/ · 守门 ──
  @{src="$GH\_seal115_smoke.cjs";        dst="tests/_seal115_smoke.cjs"}
  @{src="$GH\_seal122_watchdog_smoke.cjs"; dst="tests/_seal122_watchdog_smoke.cjs"}  # 印 122 · watchdog 守门
  # ── 顶 (PR description) ──
  @{src="$GH\INDEX_GUIZONG.md";         dst="INDEX_GUIZONG.md"}
)

# ─── 校 ───
Write-Host ""
Write-Host "═══ 印 119 · GH PR-ready patch 生成器 ═══" -Fore Cyan
Write-Host ""
Write-Host "BASE:    $BASE"
Write-Host "Target:  $Target"
if ($PreviewOnly) { Write-Host "Mode:    PREVIEW (仅展)" -Fore Yellow } else { Write-Host "Mode:    APPLY (真 cp)" -Fore Green }
Write-Host ""

# 验源齐
$missing = @()
foreach ($m in $MAP) {
  if (-not (Test-Path $m.src)) { $missing += $m.src }
}
if ($missing.Count -gt 0) {
  Write-Host "✗ 源缺 $($missing.Count) 件:" -Fore Red
  $missing | ForEach-Object { Write-Host "  · $_" -Fore Red }
  exit 1
}
Write-Host "✓ 源齐 · $($MAP.Count) 件" -Fore Green
Write-Host ""

if ($PreviewOnly) {
  Write-Host "─── 待 cp 件 ───" -Fore Yellow
  foreach ($m in $MAP) {
    $size = [Math]::Round((Get-Item $m.src).Length / 1KB, 1)
    Write-Host ("  {0,8}KB  {1,-50} → {2}" -f $size, ($m.src.Substring($BASE.Path.Length+1)), $m.dst)
  }
  Write-Host ""
  Write-Host "─── 命 ───" -Fore Yellow
  Write-Host "  pwsh _APPLY_GH_PR.ps1                                 # 默至 .\_PR_PATCH 预览"
  Write-Host "  pwsh _APPLY_GH_PR.ps1 -Target 'e:\windsurf-assistant' # 真至 GH repo"
  exit 0
}

# 立目标目录 (相对路 · 转绝对)
if (-not [System.IO.Path]::IsPathRooted($Target)) {
  $Target = Join-Path $BASE $Target
}
if (-not (Test-Path $Target)) {
  New-Item -Path $Target -ItemType Directory -Force | Out-Null
  Write-Host "✓ 立 Target: $Target" -Fore Green
}

# ─── 真 cp ───
$copied = 0
$skipped = 0
foreach ($m in $MAP) {
  $dstFull = Join-Path $Target $m.dst
  $dstDir = Split-Path $dstFull -Parent
  if (-not (Test-Path $dstDir)) {
    New-Item -Path $dstDir -ItemType Directory -Force | Out-Null
  }

  $srcKB = [Math]::Round((Get-Item $m.src).Length / 1KB, 1)

  # 内容 hash 比 · 同则 skip
  if (Test-Path $dstFull) {
    $srcH = (Get-FileHash $m.src -Algorithm MD5).Hash
    $dstH = (Get-FileHash $dstFull -Algorithm MD5).Hash
    if ($srcH -eq $dstH) {
      Write-Host ("  - skip (同 hash) {0,-50} {1}KB" -f $m.dst, $srcKB) -Fore DarkGray
      $skipped++
      continue
    }
  }

  Copy-Item $m.src $dstFull -Force
  Write-Host ("  ✓ cp           {0,-50} {1}KB" -f $m.dst, $srcKB) -Fore Green
  $copied++
}

Write-Host ""
Write-Host "═══ 总: $copied cp · $skipped skip · $($MAP.Count) 件 ═══" -Fore Cyan
Write-Host ""

# ─── 印 121 · 新拓扑提示 ───
if (Test-Path $GIT_CLONE_NEW) {
  Write-Host "─── 印 121 · 新拓扑 (主公记忆 update) ───" -Fore Cyan
  Write-Host "  真 git working clone: $GIT_CLONE_NEW"
  Write-Host "  branch:               yin119-dao-proxy-real-usage (主公 e751088)"
  Write-Host "  remote:               https://github.com/zhouyoukang/windsurf-assistant.git"
  Write-Host ""
  Write-Host "  ─ 主公一字 真 cp 至 130/公网 ─"
  Write-Host "    pwsh $PSCommandPath -Target '$GIT_CLONE_NEW' -GitCommit"
  Write-Host ""
}

# ─── 后续命提示 ───
$smokeRel = "tests/_seal115_smoke.cjs"
$smokeAbs = Join-Path $Target $smokeRel
if (Test-Path $smokeAbs) {
  Write-Host "─── 跑守门 ───" -Fore Yellow
  Write-Host "  cd $Target"
  Write-Host "  node $smokeRel"
  Write-Host ""
}

# ─── git commit 选 ───
if ($GitCommit) {
  if (-not (Test-Path "$Target\.git")) {
    Write-Host "⚠ Target 非 git repo · 跳 git commit" -Fore Yellow
  } else {
    Write-Host "─── git commit ───" -Fore Yellow
    Push-Location $Target
    try {
      git add packages/dao-devin-vm/ .github/workflows/dao-fleet-devin-cloud.yml tests/_seal115_smoke.cjs INDEX_GUIZONG.md
      git status --short
      Write-Host ""
      Write-Host "─── 真 commit (主公一字) ───"
      Write-Host "  git commit -m '印 121 · 去彼取此 · meta_router v0.6.0 (streaming + Bearer + OpenAI-spec)'"
      Write-Host "  git push origin yin119-dao-proxy-real-usage  # 或新 branch"
      Write-Host "  gh pr create --title '印 121 · 去彼取此' --body-file INDEX_GUIZONG.md"
    } finally {
      Pop-Location
    }
  }
}

Write-Host ""
Write-Host "✓ 印 121 · GH PR patch 已生 · 去彼取此 · 道法自然" -Fore Green
