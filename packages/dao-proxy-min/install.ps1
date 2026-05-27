# ═══════════════════════════════════════════════════════════════════════════
# install.ps1 · dao-proxy-min v9.9.52 · Windows 自适装毕脚本
# ═══════════════════════════════════════════════════════════════════════════
# 道法自然 · 适万用户 · 适万机 · 零配置 · 一键装毕
# 「为道日损. 损之又损, 以至于无为, 无为而无不为」 — 四十八章
#
# 用法:
#   .\install.ps1                     # 装毕 当前用户 当前 vsix (自动检测)
#   .\install.ps1 -VsixPath xxx.vsix  # 显式指定 vsix
#   .\install.ps1 -Uninstall          # 卸 dao-proxy-min 全版
#   .\install.ps1 -DryRun             # 演 不真装
#
# 自动检测:
#   ① 当前用户名         (从 $env:USERNAME 或 [Environment]::UserName)
#   ② Windsurf 扩展目录   ($env:USERPROFILE\.windsurf\extensions)
#   ③ 现版 dao-proxy-min   (扫目录 + 读 extensions.json)
#   ④ 端口自映           (FNV-1a hash · 8889..8988 per user)
# ═══════════════════════════════════════════════════════════════════════════

[CmdletBinding()]
param(
    [string]$VsixPath = '',
    [switch]$Uninstall,
    [switch]$DryRun,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$script:LOG = @()

function Write-DaoLog {
    param([string]$Msg, [string]$Color = 'White')
    $script:LOG += $Msg
    if (-not $Quiet) {
        Write-Host $Msg -ForegroundColor $Color
    }
}

function Get-DaoPortByDiscovery {
    # 装毕后扫 8889..8988 找活 proxy · 真态非预测 · 上善若水
    foreach ($p in 8889..8988) {
        try {
            $r = Invoke-RestMethod "http://127.0.0.1:$p/origin/ping" -TimeoutSec 1 -ErrorAction Stop
            if ($r.ok) { return $p }
        } catch {}
    }
    return $null
}

# ═══════════════ 1. 自适应检测当前环境 ═══════════════
Write-DaoLog "═══ 反者道之动 · 第九回 · 软编码 · 适万环境装毕 ═══" "Cyan"
Write-DaoLog ""

$CUR_USER = $env:USERNAME
if ([string]::IsNullOrWhiteSpace($CUR_USER)) { $CUR_USER = [Environment]::UserName }
$CUR_HOME = $env:USERPROFILE
if ([string]::IsNullOrWhiteSpace($CUR_HOME)) { $CUR_HOME = [Environment]::GetFolderPath('UserProfile') }
$EXT_DIR = Join-Path $CUR_HOME '.windsurf\extensions'


Write-DaoLog "【自适应检测】" "Yellow"
Write-DaoLog "  当前用户   : $CUR_USER"
Write-DaoLog "  用户目录   : $CUR_HOME"
Write-DaoLog "  扩展目录   : $EXT_DIR"
Write-DaoLog "  端口范围   : 8889..8988 (per-user FNV-1a · 装毕后看 webview 知真值)"
Write-DaoLog ""

if (-not (Test-Path $EXT_DIR)) {
    Write-DaoLog "  ⚠ 扩展目录不存 · 创建中..." "Yellow"
    if (-not $DryRun) {
        New-Item -ItemType Directory -Path $EXT_DIR -Force | Out-Null
    }
}

# ═══════════════ 2. 解析 / 检测 VSIX ═══════════════
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

if ([string]::IsNullOrWhiteSpace($VsixPath)) {
    # 自动找最新 vsix
    $vsixCandidates = Get-ChildItem -Path $scriptDir -Filter 'dao-proxy-min-*.vsix' -ErrorAction SilentlyContinue |
                      Sort-Object Name -Descending
    if ($vsixCandidates) {
        $VsixPath = $vsixCandidates[0].FullName
        Write-DaoLog "【vsix 自动检测】" "Yellow"
        Write-DaoLog "  $VsixPath"
    } else {
        Write-DaoLog "  ✗ 未找到 dao-proxy-min-*.vsix · 请显式指定 -VsixPath" "Red"
        exit 1
    }
} else {
    if (-not (Test-Path $VsixPath)) {
        Write-DaoLog "  ✗ vsix 不存: $VsixPath" "Red"
        exit 1
    }
    Write-DaoLog "【vsix 显式指定】" "Yellow"
    Write-DaoLog "  $VsixPath"
}

# 提 vsix 之版本 (从文件名)
$vsixName = Split-Path -Leaf $VsixPath
if ($vsixName -match 'dao-proxy-min-(\d+\.\d+\.\d+)\.vsix') {
    $VER = $Matches[1]
} else {
    Write-DaoLog "  ✗ vsix 文件名不合格 (期 dao-proxy-min-X.Y.Z.vsix): $vsixName" "Red"
    exit 1
}
Write-DaoLog "  目标版本   : v$VER"
Write-DaoLog ""

# ═══════════════ 3. 卸载分支 ═══════════════
if ($Uninstall) {
    Write-DaoLog "═══ 卸载模式 · 清 dao-proxy-min 全版 ═══" "Magenta"
    $oldDirs = Get-ChildItem -Path $EXT_DIR -Directory -Filter 'dao-agi.dao-proxy-min*' -ErrorAction SilentlyContinue
    foreach ($d in $oldDirs) {
        Write-DaoLog "  ─ 删 $($d.Name)" "Gray"
        if (-not $DryRun) {
            Remove-Item -LiteralPath $d.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    # 净化 extensions.json
    $extJson = Join-Path $EXT_DIR 'extensions.json'
    if (Test-Path $extJson) {
        try {
            $arr = Get-Content $extJson -Raw -Encoding UTF8 | ConvertFrom-Json
            $filtered = @($arr | Where-Object { $_.identifier.id -ne 'dao-agi.dao-proxy-min' })
            if (-not $DryRun) {
                ($filtered | ConvertTo-Json -Depth 20 -Compress) | Set-Content $extJson -Encoding UTF8 -NoNewline
            }
            Write-DaoLog "  ─ extensions.json: 移除 dao-proxy-min 注册"
        } catch {
            Write-DaoLog "  ⚠ extensions.json 净化失败: $_" "Yellow"
        }
    }
    Write-DaoLog ""
    Write-DaoLog "✓ 卸载毕 · 主公须 reload Windsurf 窗以完成净化" "Green"
    exit 0
}

# ═══════════════ 4. 旧版备份 + 入 .obsolete ═══════════════
Write-DaoLog "═══ 装毕主链路 ═══" "Cyan"

$tgtDir = Join-Path $EXT_DIR "dao-agi.dao-proxy-min-$VER"
$oldDirs = Get-ChildItem -Path $EXT_DIR -Directory -Filter 'dao-agi.dao-proxy-min-*' -ErrorAction SilentlyContinue |
           Where-Object { $_.Name -ne "dao-agi.dao-proxy-min-$VER" }

if ($oldDirs) {
    Write-DaoLog "【旧版处理 · 入 .obsolete + 不删 (主公自决)】" "Yellow"
    $obsoletePath = Join-Path $EXT_DIR '.obsolete'
    $obsObj = @{}
    if (Test-Path $obsoletePath) {
        try {
            $existing = Get-Content $obsoletePath -Raw -Encoding UTF8 | ConvertFrom-Json
            $existing.PSObject.Properties | ForEach-Object { $obsObj[$_.Name] = $_.Value }
        } catch {}
    }
    foreach ($d in $oldDirs) {
        $obsObj[$d.Name] = $true
        Write-DaoLog "  ─ $($d.Name) → .obsolete"
    }
    if (-not $DryRun) {
        ($obsObj | ConvertTo-Json -Compress) | Set-Content $obsoletePath -Encoding UTF8 -NoNewline
    }
    Write-DaoLog ""
}

# 若目标版已装 · 备份
if (Test-Path $tgtDir) {
    $bakDir = "$tgtDir.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Write-DaoLog "【已存目标版 · 备份】" "Yellow"
    Write-DaoLog "  $tgtDir → $bakDir"
    if (-not $DryRun) {
        Move-Item -LiteralPath $tgtDir -Destination $bakDir -Force
    }
    Write-DaoLog ""
}

# ═══════════════ 5. 解 vsix · 装毕 ═══════════════
Write-DaoLog "【解 vsix · 装毕】" "Yellow"
$tmpDir = Join-Path $env:TEMP "dao-proxy-min-install-$(Get-Date -Format 'yyyyMMddHHmmss')"
if (-not $DryRun) {
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
    # Expand-Archive 仅认 .zip · vsix 直解须 .NET ZipFile API
    Add-Type -AssemblyName System.IO.Compression.FileSystem -EA 0
    [System.IO.Compression.ZipFile]::ExtractToDirectory($VsixPath, $tmpDir)
    if (-not (Test-Path "$tmpDir\extension")) {
        Write-DaoLog "  ✗ vsix 解后无 extension/ 目录 · 文件损坏" "Red"
        exit 1
    }
    Copy-Item -Path "$tmpDir\extension" -Destination $tgtDir -Recurse -Force
    Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
Write-DaoLog "  ✓ $VsixPath → $tgtDir"
Write-DaoLog ""

# ═══════════════ 6. 注册 extensions.json (反者道之动 · 个个 JSON + 手砌 array 框) ═══════════════
Write-DaoLog "【注册 extensions.json】" "Yellow"
$extJson = Join-Path $EXT_DIR 'extensions.json'

# 读现内容
$arrRaw = $null
if (Test-Path $extJson) {
    try {
        $raw = Get-Content $extJson -Raw -Encoding UTF8
        if ($raw -and $raw.Trim().Length -gt 0) {
            $arrRaw = $raw | ConvertFrom-Json
        }
    } catch {
        Write-DaoLog "  ⚠ extensions.json 解析失败 · 重建" "Yellow"
    }
}

# 递归扁平化: 处置 [Array,...] + {value,Count} 两种 corrupt 形
# 注: $Input 是 PS 内置 · 必避之 · 用 $Obj
function Get-FlattenedExtItems {
    param([Parameter(Position=0)][object]$Obj)
    $out = New-Object 'System.Collections.Generic.List[object]'
    if ($null -eq $Obj) { return $out.ToArray() }
    if ($Obj -is [System.Array] -or $Obj -is [System.Collections.IList]) {
        foreach ($it in $Obj) {
            $sub = Get-FlattenedExtItems $it
            foreach ($s in @($sub)) { $out.Add($s) }
        }
        return $out.ToArray()
    }
    if ($Obj.PSObject -and $Obj.PSObject.Properties) {
        $hasValue = $null -ne $Obj.PSObject.Properties['value']
        $hasCount = $null -ne $Obj.PSObject.Properties['Count']
        $hasIdentifier = $null -ne $Obj.PSObject.Properties['identifier']
        if ($hasValue -and $hasCount -and -not $hasIdentifier) {
            Write-DaoLog "  ⚠ 探 corrupt 包: 展开 value (Count=$($Obj.Count))" "Yellow"
            $sub = Get-FlattenedExtItems $Obj.value
            foreach ($s in @($sub)) { $out.Add($s) }
            return $out.ToArray()
        }
        if ($hasIdentifier) {
            $out.Add($Obj)
            return $out.ToArray()
        }
    }
    return $out.ToArray()
}

$flat = @(Get-FlattenedExtItems $arrRaw)
Write-DaoLog "  ─ 扁平化后条目数: $(@($flat).Count)"

# 加新条目
$pkgPath = Join-Path $tgtDir 'package.json'
if (-not $DryRun -and (Test-Path $pkgPath)) {
    $pkgObj = Get-Content $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json

    $newEntry = [pscustomobject]@{
        identifier = [pscustomobject]@{ id = 'dao-agi.dao-proxy-min' }
        version = $pkgObj.version
        location = [pscustomobject]@{
            '$mid' = 1
            fsPath = $tgtDir
            path = "/$($tgtDir -replace '\\', '/')"
            scheme = 'file'
        }
        relativeLocation = "dao-agi.dao-proxy-min-$VER"
        metadata = [pscustomobject]@{
            installedTimestamp = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
            source = 'vsix'
        }
    }

    # 个个 JSON · 手砌 array 框
    $jsonParts = @()
    foreach ($it in @($flat)) {
        if ($null -eq $it -or $null -eq $it.identifier) { continue }
        if ($it.identifier.id -eq 'dao-agi.dao-proxy-min') { continue }
        $jsonParts += ConvertTo-Json -InputObject $it -Depth 20 -Compress
    }
    $jsonParts += ConvertTo-Json -InputObject $newEntry -Depth 20 -Compress

    $newJson = '[' + ($jsonParts -join ',') + ']'
    [System.IO.File]::WriteAllText($extJson, $newJson, [System.Text.UTF8Encoding]::new($false))
    Write-DaoLog "  ✓ dao-agi.dao-proxy-min v$VER 注册 ($($jsonParts.Count) 项 · $($newJson.Length) B)"
} else {
    Write-DaoLog "  ✓ dao-agi.dao-proxy-min v$VER 注册 (DryRun · 无真写)"
}
Write-DaoLog ""

# ═══════════════ 7. 端口探发现 (装毕前/后真态) ═══════════════
# 装毕仅 copy 件 · proxy 须 Windsurf 重启后才启
# 故: 装毕前扫一次 (看旧版有否活) · 装毕后扫一次 (若 Windsurf 未关 · 旧 ext host 仍在)
$portBefore = Get-DaoPortByDiscovery
$portInfo = if ($portBefore) {
    "$portBefore (装前活 · 旧版/未重启之 ext host)"
} else {
    '未启 (重启 Windsurf 后扫 8889..8988 自得)'
}

# ═══════════════ 8. 终结报告 ═══════════════
Write-DaoLog "═══ 装毕毕 · 三事须主公 ═══" "Green"
Write-DaoLog "  1. 关 Windsurf 全窗 · 重开 (或 Ctrl+Shift+P → Reload Window)"
Write-DaoLog "  2. 主公新发 chat · proxy 自启 (per-user 自映端口 8889..8988)"
Write-DaoLog "  3. 看 webview 之「道Agent · 本源观照」面板 · 三事自验:"
Write-DaoLog "     a. webview 显完整 SP 字段 (撤真药 Q 之效)"
Write-DaoLog "     b. 「道」按钮 active = 帛书《老子》注入"
Write-DaoLog "     c. 「官」按钮 active = 透传不改 SP"
Write-DaoLog ""
Write-DaoLog "─── 状态摘要 ───" "Cyan"
Write-DaoLog "  用户        : $CUR_USER"
Write-DaoLog "  端口        : $portInfo"
Write-DaoLog "  扩展        : dao-agi.dao-proxy-min v$VER"
Write-DaoLog "  位置        : $tgtDir"
Write-DaoLog "  extensions.json: $extJson"
Write-DaoLog ""
if ($DryRun) {
    Write-DaoLog "  ⚠ DryRun 模式 · 无真装" "Yellow"
}
Write-DaoLog "「道法自然 · 无为而无不为」" "Cyan"
exit 0
