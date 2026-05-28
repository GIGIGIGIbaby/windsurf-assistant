# _sync_wam_core.ps1 — 兼容薄壳 · forward to 010/_dao_link.ps1
# v17.61 · 大制不割 · 圣人抱一 · 为而不争
#
# 单源: 010-WAM本源_Origin/_dao_link.ps1 统管 4 条 link
# 旧参数保留兼容: -Watch / -DryRun / -Force
#
# 用法:
#   powershell -File _sync_wam_core.ps1           # -Fix (建链)
#   powershell -File _sync_wam_core.ps1 -Watch    # -Watch (监听)
#   powershell -File _sync_wam_core.ps1 -DryRun   # -Verify (仅查)
#
param(
    [switch]$Watch,
    [switch]$DryRun,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# 定位单源 _dao_link.ps1
$link010 = $null
try {
    $p = Resolve-Path (Join-Path $PSScriptRoot '..\010-*_Origin\_dao_link.ps1') -ErrorAction Stop
    $link010 = $p.Path
} catch {
    throw "010 _dao_link.ps1 未找到 · 万法不归宗"
}

if ($Watch) {
    & $link010 -Watch
} elseif ($DryRun) {
    & $link010 -Verify
} elseif ($Force) {
    & $link010 -Fix -Force
} else {
    & $link010 -Fix
}
exit $LASTEXITCODE

# ========= 以下为历史逻辑 · 已不执行 · 保留仅便 diff =========

$ErrorActionPreference = 'Stop'

# ═══ 路径常量 ═══
$SCRIPT_DIR  = $PSScriptRoot
$ROOT_010    = Join-Path $SCRIPT_DIR '..\010-WAM本源_Origin\_github_src\packages\wam'
$ROOT_010    = (Resolve-Path $ROOT_010).Path

# 目标: 020/dao-agi/vendor/wam/
$TARGET_020  = Join-Path $SCRIPT_DIR 'dao-agi\vendor\wam'

# 同步清单: 源 → 目标
$SYNC_FILES = @(
    @{ Src = 'extension.js';  Desc = 'WAM 核心引擎' },
    @{ Src = 'package.json';  Desc = 'WAM 元数据' }
)

# ═══ 工具函数 ═══

function L { param($m) $t = Get-Date -Format 'HH:mm:ss.fff'; Write-Host "[$t] $m" }
function Hash16 { param($p) (Get-FileHash $p -Algorithm SHA256).Hash.Substring(0, 16) }

function Get-WamVersion {
    param($FilePath)
    $c = Get-Content $FilePath -Raw
    if ($c -match 'const WAM_VERSION\s*=\s*"([^"]+)"') { return $matches[1] }
    return '?'
}

# ═══ 同步核心 ═══

function Sync-WamCore {
    param([switch]$Dry)

    L "═══ WAM 本源同步 · 010→020 ═══"
    L "  源: $ROOT_010"
    L "  目标: $TARGET_020"

    if (-not (Test-Path $ROOT_010)) { throw "010 WAM 本源不存在: $ROOT_010" }
    if (-not (Test-Path $TARGET_020)) {
        if ($Dry) { L "  [DRY] 目标目录不存在, 需创建: $TARGET_020"; return }
        New-Item -ItemType Directory -Force -Path $TARGET_020 | Out-Null
        L "  创建目标目录: $TARGET_020"
    }

    $srcVer = Get-WamVersion (Join-Path $ROOT_010 'extension.js')
    $dstExt = Join-Path $TARGET_020 'extension.js'
    $dstVer = if (Test-Path $dstExt) { Get-WamVersion $dstExt } else { '(无)' }

    L "  010 WAM_VERSION = $srcVer"
    L "  020 WAM_VERSION = $dstVer"

    $changed = 0
    $skipped = 0

    foreach ($item in $SYNC_FILES) {
        $srcPath = Join-Path $ROOT_010 $item.Src
        $dstPath = Join-Path $TARGET_020 $item.Src

        if (-not (Test-Path $srcPath)) {
            L "  [SKIP] $($item.Src) — 源文件不存在"
            $skipped++
            continue
        }

        $srcHash = Hash16 $srcPath
        $srcSize = (Get-Item $srcPath).Length

        if (Test-Path $dstPath) {
            $dstHash = Hash16 $dstPath
            $dstSize = (Get-Item $dstPath).Length
            if ($srcHash -eq $dstHash) {
                L "  [OK] $($item.Src) — 已同步 ($srcSize B · sha:16 $srcHash)"
                $skipped++
                continue
            }
            L "  [DIFF] $($item.Src): src=$srcSize B sha=$srcHash / dst=$dstSize B sha=$dstHash"
        } else {
            L "  [NEW] $($item.Src): $srcSize B sha=$srcHash"
        }

        if ($Dry) {
            L "  [DRY] 将复制: $($item.Src) ($($item.Desc))"
            $changed++
            continue
        }

        Copy-Item -Force $srcPath $dstPath
        $verifyHash = Hash16 $dstPath
        if ($verifyHash -ne $srcHash) { throw "复制后校验失败: $($item.Src)" }
        L "  [SYNC] $($item.Src) ✓ ($srcSize B · $($item.Desc))"
        $changed++
    }

    # bundled-origin 同步 (如果存在)
    $srcBundled = Join-Path $ROOT_010 '..' 'wam-dao' 'vendor' 'wam' 'bundled-origin'
    $dstBundled = Join-Path $TARGET_020 'bundled-origin'
    if (Test-Path $srcBundled) {
        if (-not (Test-Path $dstBundled)) {
            if (-not $Dry) { New-Item -ItemType Directory -Force -Path $dstBundled | Out-Null }
        }
        foreach ($f in Get-ChildItem $srcBundled -File -ErrorAction SilentlyContinue) {
            $dstF = Join-Path $dstBundled $f.Name
            $srcH = Hash16 $f.FullName
            if ((Test-Path $dstF) -and (Hash16 $dstF) -eq $srcH) {
                $skipped++
                continue
            }
            if ($Dry) { L "  [DRY] bundled-origin/$($f.Name)"; $changed++; continue }
            Copy-Item -Force $f.FullName $dstF
            L "  [SYNC] bundled-origin/$($f.Name) ✓"
            $changed++
        }
    }

    $newVer = if (Test-Path $dstExt) { Get-WamVersion $dstExt } else { '?' }
    L "═══ 同步完成: changed=$changed skipped=$skipped · WAM $dstVer → $newVer ═══"
    return @{ Changed = $changed; Skipped = $skipped; SrcVer = $srcVer; DstVer = $newVer }
}

# ═══ 监听模式 ═══

function Watch-WamCore {
    L "═══ WAM 实时监听启动 · Ctrl+C 退出 ═══"
    L "  监听: $ROOT_010"

    # 先做一次完整同步
    Sync-WamCore

    $watcher = New-Object System.IO.FileSystemWatcher
    $watcher.Path = $ROOT_010
    $watcher.Filter = '*.js'
    $watcher.IncludeSubdirectories = $false
    $watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::Size
    $watcher.EnableRaisingEvents = $true

    Register-ObjectEvent $watcher Changed -Action {
        $name = $Event.SourceEventArgs.Name
        $time = Get-Date -Format 'HH:mm:ss'
        if ($name -eq 'extension.js') {
            Write-Host "[$time] 检测到 WAM core 变更 — 触发同步..."
            Start-Sleep -Milliseconds 500
            try {
                $src = Join-Path $Event.MessageData.Root010 'extension.js'
                $dst = Join-Path $Event.MessageData.Target020 'extension.js'
                Copy-Item -Force $src $dst
                $h = (Get-FileHash $dst -Algorithm SHA256).Hash.Substring(0, 16)
                $c = Get-Content $dst -Raw
                $v = if ($c -match 'const WAM_VERSION\s*=\s*"([^"]+)"') { $matches[1] } else { '?' }
                Write-Host "[$time] 实时同步完成: WAM $v · sha:16 $h · $((Get-Item $dst).Length) B"
            } catch {
                Write-Host "[$time] 实时同步失败: $_"
            }
        }
    } -MessageData @{ Root010 = $ROOT_010; Target020 = $TARGET_020 } | Out-Null

    L "监听中... (修改 010/extension.js 将自动同步到 020)"
    try {
        while ($true) { Start-Sleep -Seconds 1 }
    } finally {
        $watcher.Dispose()
        L "监听已停止"
    }
}

# ═══ 主入口 ═══

if ($Watch) {
    Watch-WamCore
} else {
    $result = Sync-WamCore -Dry:$DryRun
    if ($result.Changed -eq 0 -and -not $DryRun) {
        L "WAM 已是最新 · 无需操作 · 道法自然"
    }
}
