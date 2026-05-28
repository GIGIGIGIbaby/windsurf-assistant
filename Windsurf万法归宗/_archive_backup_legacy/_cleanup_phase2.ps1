# ═══════════════════════════════════════════════════════════════════════════
# 道法自然 · 补遗 · 短路径补 23 失手 + 110/logs 重试
# ═══════════════════════════════════════════════════════════════════════════
$ErrorActionPreference = 'Continue'
$ROOT = 'e:\道\道生一\一生二\Windsurf万法归宗'
$ARCHIVE = Join-Path $ROOT '_archive\_cleanup_20260423\bak_dedup'
New-Item -ItemType Directory -Path $ARCHIVE -Force | Out-Null

$stat = [pscustomobject]@{ moved = 0; mb = 0.0; err = 0 }

# 重试 110/logs
$traceLogs = Join-Path $ROOT '110-对话追踪_Trace\logs'
if (Test-Path $traceLogs) {
    try {
        $sz = (Get-ChildItem $traceLogs -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
        Move-Item $traceLogs (Join-Path $ROOT '_archive\_cleanup_20260423\110-对话追踪_Trace__logs') -Force -ErrorAction Stop
        $stat.moved++
        $stat.mb += ($sz / 1MB)
        Write-Host ("  MOVE {0:F2} MB · 110-对话追踪_Trace\logs" -f ($sz / 1MB))
    } catch {
        Write-Warning "  110/logs still locked: $_"
        $stat.err++
    }
}

# 用短哈希名补 bak dedup
$bakGroups = Get-ChildItem $ROOT -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        $_.FullName -notmatch '\\110-对话追踪_Trace\\永存\\' -and
        $_.FullName -notmatch '\\\.git\\' -and
        $_.FullName -notmatch '\\_archive\\' -and
        ($_.Name -match '\.bak(_\d|_\w|\.\d)' -or $_.Name -match '\.bak$' -or $_.Name -match '\.old$' -or $_.Name -match '\.broken' -or $_.Name -match '\.corrupted' -or $_.Name -match '\.orig$')
    } |
    Group-Object { Split-Path $_.FullName -Parent }

foreach ($g in $bakGroups) {
    $members = $g.Group | Sort-Object LastWriteTime -Descending
    if ($members.Count -le 2) { continue }
    $discard = $members[2..($members.Count - 1)]
    foreach ($m in $discard) {
        try {
            $sz = $m.Length
            # 短哈希子目录, 避 Windows MAX_PATH
            $h = [System.BitConverter]::ToString([System.Security.Cryptography.SHA1]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($m.DirectoryName))).Replace('-','').Substring(0,10)
            $dstDir = Join-Path $ARCHIVE $h
            if (-not (Test-Path $dstDir)) {
                New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
                # 留位图记号 (便 revert)
                "原: $($m.DirectoryName)" | Out-File (Join-Path $dstDir '_origin.txt') -Encoding UTF8
            }
            Move-Item $m.FullName (Join-Path $dstDir $m.Name) -Force -ErrorAction Stop
            $stat.moved++
            $stat.mb += ($sz / 1MB)
        } catch {
            $stat.err++
            Write-Warning "  FAIL: $($m.Name) :: $($_.Exception.Message.Substring(0,[Math]::Min(80,$_.Exception.Message.Length)))"
        }
    }
}

Write-Host ""
Write-Host ("补遗: 移 {0} 件 · {1:F2} MB · 错 {2}" -f $stat.moved, $stat.mb, $stat.err)
