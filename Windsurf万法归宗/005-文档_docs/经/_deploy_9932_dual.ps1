# ═══════════════════════════════════════════════════════════════
# _deploy_9932_dual.ps1 · 印164 · 大道至简 · 双账号静默部署
# ═══════════════════════════════════════════════════════════════
# 目标: dao-proxy-min-9.9.32.vsix → Administrator + zhou
# 原则: 不触发当前 Windsurf 窗口 · 下次重启生效
# ═══════════════════════════════════════════════════════════════
$ErrorActionPreference = 'Stop'

$VSIX  = "e:\道\道生一\一生二\Windsurf万法归宗\070-插件_Plugins\020-道VSIX_DaoAgi\dao-proxy-min-9.1.x-改良\dao-proxy-min-9.9.32.vsix"
$VER   = "9.9.32"
$EXTID = "dao-agi.dao-proxy-min"
$EXTDN = "dao-agi.dao-proxy-min-$VER"

# 目标账号列表
$TARGETS = @(
    @{ User="Administrator"; UHome="C:\Users\Administrator" },
    @{ User="zhou";          UHome="C:\Users\zhou" }
)

# ── 帮助函数 ──────────────────────────────────────────────────
function Flatten-ExtJson {
    param([object]$Obj)
    $out = [System.Collections.Generic.List[object]]::new()
    if ($null -eq $Obj) { return $out.ToArray() }
    if ($Obj -is [array] -or $Obj -is [System.Collections.IList]) {
        foreach ($it in $Obj) { foreach ($s in @(Flatten-ExtJson $it)) { $out.Add($s) } }
        return $out.ToArray()
    }
    if ($Obj.PSObject -and $Obj.PSObject.Properties) {
        $hasVal = $null -ne $Obj.PSObject.Properties['value']
        $hasCnt = $null -ne $Obj.PSObject.Properties['Count']
        $hasId  = $null -ne $Obj.PSObject.Properties['identifier']
        if ($hasVal -and $hasCnt -and -not $hasId) {
            foreach ($s in @(Flatten-ExtJson $Obj.value)) { $out.Add($s) }
            return $out.ToArray()
        }
        if ($hasId) { $out.Add($Obj); return $out.ToArray() }
    }
    return $out.ToArray()
}

# ── 验证 VSIX ─────────────────────────────────────────────────
Write-Host "═══ 印164 · 大道至简 · 双账号静默部署 ═══" -ForegroundColor Cyan
Write-Host "  VSIX : $VSIX"
Write-Host "  版本 : v$VER"
if (-not (Test-Path $VSIX)) { Write-Host "  [ERR] VSIX 不存!" -ForegroundColor Red; exit 1 }
Write-Host "  大小 : $([math]::Round((Get-Item $VSIX).Length/1KB,1)) KB"
Write-Host ""

# ── 解 VSIX 到临时目录 ─────────────────────────────────────────
$TMP = Join-Path $env:TEMP "dao9932-$(Get-Date -Format 'HHmmss')"
Write-Host "【解包 VSIX → $TMP】"
New-Item -ItemType Directory -Path $TMP -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem -EA 0
[System.IO.Compression.ZipFile]::ExtractToDirectory($VSIX, $TMP)
$SRC = Join-Path $TMP "extension"
if (-not (Test-Path $SRC)) { Write-Host "  [ERR] vsix 解包失败: 无 extension/ 目录" -ForegroundColor Red; exit 1 }
Write-Host "  ✓ 解包完成 · 源: $SRC"
Write-Host ""

# ── 逐账号部署 ────────────────────────────────────────────────
foreach ($t in $TARGETS) {
    $user   = $t.User
    $uHome  = $t.UHome
    $extDir = Join-Path $uHome ".windsurf\extensions"
    $tgtDir = Join-Path $extDir $EXTDN

    Write-Host "【$user → $extDir】" -ForegroundColor Yellow

    # 确保目录存在
    if (-not (Test-Path $extDir)) {
        Write-Host "  ⚠ 扩展目录不存($extDir) · 跳过 $user" -ForegroundColor DarkYellow
        Write-Host ""
        continue
    }

    # 1. 旧版入 .obsolete
    $oldDirs = Get-ChildItem $extDir -Directory -ErrorAction SilentlyContinue |
               Where-Object { $_.Name -match "^dao-agi\.dao-proxy-min-" -and $_.Name -ne $EXTDN }
    if ($oldDirs) {
        $obsPath = Join-Path $extDir ".obsolete"
        $obsObj  = @{}
        if (Test-Path $obsPath) {
            try { (Get-Content $obsPath -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties |
                  ForEach-Object { $obsObj[$_.Name] = $_.Value } } catch {}
        }
        foreach ($d in $oldDirs) {
            $obsObj[$d.Name] = $true
            Write-Host "  ─ 旧版入.obsolete: $($d.Name)"
        }
        ($obsObj | ConvertTo-Json -Compress) | Set-Content $obsPath -Encoding UTF8 -NoNewline
        Write-Host "  ✓ .obsolete 已更新"
    }

    # 2. 若目标版已存 → 备份
    if (Test-Path $tgtDir) {
        $bak = "$tgtDir.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        Move-Item -LiteralPath $tgtDir -Destination $bak -Force
        Write-Host "  ─ 已存版本备份: $([System.IO.Path]::GetFileName($bak))"
    }

    # 3. 拷贝文件
    Copy-Item -Path $SRC -Destination $tgtDir -Recurse -Force
    $fileCount = (Get-ChildItem $tgtDir -Recurse -File).Count
    Write-Host "  ✓ 文件拷入: $fileCount 件 → $tgtDir"

    # 4. 更新 extensions.json
    $extJson = Join-Path $extDir "extensions.json"
    $flat = @()
    if (Test-Path $extJson) {
        try {
            $raw = Get-Content $extJson -Raw -Encoding UTF8
            if ($raw -and $raw.Trim().Length -gt 0) {
                $flat = @(Flatten-ExtJson ($raw | ConvertFrom-Json))
            }
        } catch { Write-Host "  ⚠ extensions.json 解析失败 · 重建" -ForegroundColor DarkYellow }
    }

    $pkgObj  = Get-Content (Join-Path $tgtDir "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $newEntry = [pscustomobject]@{
        identifier       = [pscustomobject]@{ id = $EXTID }
        version          = $pkgObj.version
        location         = [pscustomobject]@{
            '$mid'   = 1
            fsPath   = $tgtDir
            path     = "/$($tgtDir -replace '\\','/')"
            scheme   = 'file'
        }
        relativeLocation = $EXTDN
        metadata         = [pscustomobject]@{
            installedTimestamp = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
            source             = 'vsix'
        }
    }

    $parts = [System.Collections.Generic.List[string]]::new()
    foreach ($it in $flat) {
        if ($null -eq $it -or $null -eq $it.identifier) { continue }
        if ($it.identifier.id -eq $EXTID) { continue }   # 替换旧注册
        $parts.Add((ConvertTo-Json -InputObject $it -Depth 20 -Compress))
    }
    $parts.Add((ConvertTo-Json -InputObject $newEntry -Depth 20 -Compress))
    $newJson = '[' + ($parts -join ',') + ']'
    [System.IO.File]::WriteAllText($extJson, $newJson, [System.Text.UTF8Encoding]::new($false))
    Write-Host "  ✓ extensions.json 已更新 · $($parts.Count) 项"
    Write-Host ""
}

# ── 清理临时目录 ─────────────────────────────────────────────
Remove-Item -LiteralPath $TMP -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "【清理临时目录】✓" -ForegroundColor DarkGray
Write-Host ""

# ── 终结摘要 ─────────────────────────────────────────────────
Write-Host "═══ 部署完毕 · 下次重启生效 ═══" -ForegroundColor Green
foreach ($t in $TARGETS) {
    $d = Join-Path $t.UHome ".windsurf\extensions\$EXTDN"
    if (Test-Path $d) {
        Write-Host "  ✓ $($t.User) → $d" -ForegroundColor Green
    } else {
        Write-Host "  - $($t.User) → 跳过" -ForegroundColor DarkGray
    }
}
Write-Host ""
Write-Host "  当前 Windsurf 窗口未受影响 · 下次重启后自动加载 v$VER" -ForegroundColor Cyan
Write-Host "「道恒无名，朴唯小，而天下弗敢臣，侯王若能守之，万物将自宾。」" -ForegroundColor DarkCyan
