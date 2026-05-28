# ═══════════════════════════════════════════════════════════════════════════
# 道法自然 · 去芜存菁 · 2026-04-23
# ═══════════════════════════════════════════════════════════════════════════
# 原则:
#   1. 硬删仅: __pycache__ · *.log · *.out · *.cache · *.tmp · *.pyc (可重生)
#   2. 大块动: 移至 _archive/_cleanup_20260423/ (软删 · 可逆)
#   3. 备份组: 每 "foo.*.bak*" 族只留最新 2 份, 其余移至 _archive/
#   4. 结构: 080-CDP道桥 → 120-CDP道桥 (除同号)
#   5. 留痕: CLEAN_REPORT.md
#
# 道之戒:
#   - 110-对话追踪_Trace/永存/ 绝不碰
#   - .windsurf/ 不碰
#   - .git/ 不碰
#   - *.vsix 不删 (可能在用)
#   - 任何当前文件 (无 .bak/.old/.tmp 后缀) 不删
# ═══════════════════════════════════════════════════════════════════════════

$ErrorActionPreference = 'Continue'
$ROOT = 'e:\道\道生一\一生二\Windsurf万法归宗'
$ARCHIVE = Join-Path $ROOT '_archive\_cleanup_20260423'
$MANIFEST = Join-Path $ARCHIVE '_MANIFEST.md'
$REPORT = Join-Path $ROOT 'CLEAN_REPORT.md'

New-Item -ItemType Directory -Path $ARCHIVE -Force | Out-Null

$stat = @{
    hard_del_count    = 0
    hard_del_bytes    = 0L
    soft_move_count   = 0
    soft_move_bytes   = 0L
    rename_count      = 0
    errors            = 0
}
$logLines = @()
$logLines += "# 清扫明细 · 2026-04-23"
$logLines += ""
$logLines += '| 动 | 源 | 目 | MB |'
$logLines += '| --- | --- | --- | ---:|'

function LogMove($src, $dst, $sizeMB) {
    $script:logLines += "| MOVE | ``$src`` | ``$dst`` | $sizeMB |"
}
function LogDelete($src, $sizeMB) {
    $script:logLines += "| DEL | ``$src`` | — | $sizeMB |"
}
function LogRename($src, $dst) {
    $script:logLines += "| RENAME | ``$src`` | ``$dst`` | — |"
}

function HardDelete {
    param([string]$path, [string]$reason)
    if (-not (Test-Path $path)) { return }
    try {
        $item = Get-Item $path -Force
        $size = if ($item.PSIsContainer) {
            (Get-ChildItem $path -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
        } else {
            $item.Length
        }
        if (-not $size) { $size = 0 }
        Remove-Item $path -Recurse -Force -ErrorAction Stop
        $script:stat.hard_del_count++
        $script:stat.hard_del_bytes += $size
        LogDelete ($path.Replace($ROOT + '\','')) ([math]::Round($size/1MB,2))
        Write-Host "  DEL  $([math]::Round($size/1MB,2)) MB · $($path.Replace($ROOT+'\',''))"
    } catch {
        $script:stat.errors++
        Write-Warning "  DEL FAIL: $path :: $_"
    }
}

function SoftMove {
    param([string]$path, [string]$archiveSub)
    if (-not (Test-Path $path)) { return }
    try {
        $item = Get-Item $path -Force
        $size = if ($item.PSIsContainer) {
            (Get-ChildItem $path -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
        } else {
            $item.Length
        }
        if (-not $size) { $size = 0 }
        $dst = Join-Path $ARCHIVE $archiveSub
        $dstParent = Split-Path $dst -Parent
        if (-not (Test-Path $dstParent)) { New-Item -ItemType Directory -Path $dstParent -Force | Out-Null }
        Move-Item $path $dst -Force -ErrorAction Stop
        $script:stat.soft_move_count++
        $script:stat.soft_move_bytes += $size
        LogMove ($path.Replace($ROOT + '\','')) ("_archive\_cleanup_20260423\$archiveSub") ([math]::Round($size/1MB,2))
        Write-Host "  MOVE $([math]::Round($size/1MB,2)) MB · $($path.Replace($ROOT+'\','')) → _archive\_cleanup_20260423\$archiveSub"
    } catch {
        $script:stat.errors++
        Write-Warning "  MOVE FAIL: $path :: $_"
    }
}

Write-Host ""
Write-Host '═══ 一 · 硬删缓存/日志/pyc (无值可再生) ═══'
Get-ChildItem $ROOT -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\110-对话追踪_Trace\\永存\\' } |
    ForEach-Object { HardDelete $_.FullName 'pycache' }

Get-ChildItem $ROOT -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        $_.FullName -notmatch '\\110-对话追踪_Trace\\永存\\' -and
        $_.FullName -notmatch '\\\.git\\' -and
        $_.FullName -notmatch '\\\.windsurf\\' -and
        $_.FullName -notmatch '\\_archive\\_cleanup_20260423\\' -and
        $_.Name -match '\.(pyc|log|out|cache|tmp)$'
    } |
    ForEach-Object { HardDelete $_.FullName 'log-or-cache' }

Write-Host ""
Write-Host '═══ 二 · 备份组去重 · 每族只留最新 2 份 ═══'
# workbench.desktop.main.js.*.bak 系列
$bakGroups = Get-ChildItem $ROOT -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        $_.FullName -notmatch '\\110-对话追踪_Trace\\永存\\' -and
        $_.FullName -notmatch '\\\.git\\' -and
        $_.FullName -notmatch '\\_archive\\_cleanup_20260423\\' -and
        ($_.Name -match '\.bak(_\d|_\w|\.\d)' -or $_.Name -match '\.bak$' -or $_.Name -match '\.old$' -or $_.Name -match '\.broken' -or $_.Name -match '\.corrupted' -or $_.Name -match '\.orig$')
    } |
    Group-Object { Split-Path $_.FullName -Parent }

foreach ($g in $bakGroups) {
    $members = $g.Group | Sort-Object LastWriteTime -Descending
    if ($members.Count -le 2) { continue }  # 本族已少, 留全
    $keep = $members[0..1]
    $discard = $members[2..($members.Count - 1)]
    foreach ($m in $discard) {
        SoftMove $m.FullName ("bak_dedup\" + ($m.FullName.Replace($ROOT+'\','').Replace('\','__')))
    }
}

Write-Host ""
Write-Host '═══ 三 · 大块软移 · legacy 与巨备份 ═══'

# 060-修复_Repair/_fingerprint_backups → _archive/ (2 份 language_server.exe.bak 各 160 MB)
$fpBak = Join-Path $ROOT '060-修复_Repair\_fingerprint_backups'
if (Test-Path $fpBak) {
    SoftMove $fpBak '060-修复_Repair__fingerprint_backups'
}

# 020-逆向_Reverse/_AIswitch_legacy → _archive/ (1.1 GB legacy)
$legacy = Join-Path $ROOT '020-逆向_Reverse\_AIswitch_legacy'
if (Test-Path $legacy) {
    SoftMove $legacy '020-逆向_Reverse__AIswitch_legacy'
}

# 070-插件_Plugins/030-转制VSIX_Repack/_archive → _archive/ (178 MB 旧 VSIX 构建)
$vsixArch = Join-Path $ROOT '070-插件_Plugins\030-转制VSIX_Repack\_archive'
if (Test-Path $vsixArch) {
    SoftMove $vsixArch '070-插件_Plugins__030-转制VSIX_Repack__archive'
}

# 110-对话追踪_Trace/backup → _archive/ (56 MB)
$traceBak = Join-Path $ROOT '110-对话追踪_Trace\backup'
if (Test-Path $traceBak) {
    SoftMove $traceBak '110-对话追踪_Trace__backup'
}

# 110-对话追踪_Trace/logs → _archive/ (23 MB)
$traceLogs = Join-Path $ROOT '110-对话追踪_Trace\logs'
if (Test-Path $traceLogs) {
    SoftMove $traceLogs '110-对话追踪_Trace__logs'
}

# 000-本源_Origin/archive → _archive/ (34 MB old history)
$originArch = Join-Path $ROOT '000-本源_Origin\archive'
if (Test-Path $originArch) {
    SoftMove $originArch '000-本源_Origin__archive'
}

Write-Host ""
Write-Host '═══ 四 · 解 080 同号冲突 ═══'
$src080 = Join-Path $ROOT '080-CDP道桥_Bridge'
$dst120 = Join-Path $ROOT '120-CDP道桥_Bridge'
if ((Test-Path $src080) -and -not (Test-Path $dst120)) {
    try {
        Rename-Item $src080 $dst120 -Force -ErrorAction Stop
        $script:stat.rename_count++
        LogRename '080-CDP道桥_Bridge' '120-CDP道桥_Bridge'
        Write-Host "  ✓ renamed 080-CDP道桥_Bridge → 120-CDP道桥_Bridge"
    } catch {
        Write-Warning "  × rename failed: $_"
        $script:stat.errors++
    }
}

Write-Host ""
Write-Host '═══ 写 _MANIFEST.md 至 _archive ═══'
$logLines += ""
$logLines += "## 统"
$logLines += ""
$logLines += "- 硬删: $($stat.hard_del_count) 件 · $([math]::Round($stat.hard_del_bytes/1MB,2)) MB"
$logLines += "- 软移: $($stat.soft_move_count) 件 · $([math]::Round($stat.soft_move_bytes/1MB,2)) MB"
$logLines += "- 重命名: $($stat.rename_count)"
$logLines += "- 错误: $($stat.errors)"
$logLines | Out-File -FilePath $MANIFEST -Encoding UTF8 -Force

Write-Host ""
Write-Host '═══ 完毕 ═══'
Write-Host ("  硬删: {0} 件 · {1:F2} MB" -f $stat.hard_del_count, ($stat.hard_del_bytes/1MB))
Write-Host ("  软移: {0} 件 · {1:F2} MB" -f $stat.soft_move_count, ($stat.soft_move_bytes/1MB))
Write-Host ("  重命名: {0}" -f $stat.rename_count)
Write-Host ("  错误: {0}" -f $stat.errors)
Write-Host "  留痕: $MANIFEST"

# 让主报告生成器知统计
$stat | ConvertTo-Json | Out-File (Join-Path $ARCHIVE '_stat.json') -Encoding UTF8 -Force
