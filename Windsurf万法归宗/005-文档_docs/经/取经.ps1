# 取经.ps1 — 道法自然 · 无为而无不为
# 取之尽锱铢，用之如泥沙 — 直接爬取，零手写
# 用法: .\取经.ps1 [-Id <id>] [-All]

param(
    [string]$Id = "",
    [switch]$All,
    [switch]$Status,
    [switch]$Index
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$CANON = Join-Path $DIR "dao_canon.json"

# ══ HTTP 直取 ══════════════════════════════════════════════════
function Get-Page {
    param([string]$Url, [int]$TimeoutSec = 30)
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing `
            -TimeoutSec $TimeoutSec `
            -Headers @{
                "User-Agent" = "Mozilla/5.0 (compatible; DaoCanon/1.0; classical text research)"
                "Accept" = "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
                "Accept-Language" = "zh-TW,zh;q=0.9,en;q=0.8"
            }
        return $r.Content
    } catch {
        Write-Warning "  HTTP失败: $Url — $($_.Exception.Message)"
        return $null
    }
}

function Get-WikisourceText {
    param([string]$Title, [string]$Lang = "zh")
    $api = "https://$Lang.wikisource.org/w/api.php"
    $url = "$api`?action=query&titles=$([uri]::EscapeDataString($Title))&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2"
    Write-Host "  ↳ Wikisource[$Lang]: $Title"
    $raw = Get-Page $url
    if (-not $raw) { return $null }
    try {
        $json = $raw | ConvertFrom-Json
        $page = $json.query.pages[0]
        if ($page.missing) { Write-Warning "  页面不存在: $Title"; return $null }
        return $page.revisions[0].slots.main.content
    } catch {
        Write-Warning "  解析失败: $_"
        return $null
    }
}

function Get-CtextPage {
    param([string]$Path)
    $url = "https://ctext.org$Path/zh"
    Write-Host "  ↳ ctext.org: $Path"
    $raw = Get-Page $url
    if (-not $raw) { return $null }
    # 提取 ctext 正文块
    $blocks = [regex]::Matches($raw, '<td[^>]*class="ctext"[^>]*>(.*?)</td>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if ($blocks.Count -gt 0) {
        $texts = $blocks | ForEach-Object { 
            $_.Groups[1].Value -replace '<[^>]+>', '' -replace '&amp;','&' -replace '&lt;','<' -replace '&gt;','>' -replace '&#\d+;','' 
        } | Where-Object { $_.Trim() -ne '' }
        return ($texts -join "`n`n").Trim()
    }
    return $null
}

function Get-GutenbergText {
    param([string]$Id)
    $url = "https://www.gutenberg.org/cache/epub/$Id/pg$Id.txt"
    Write-Host "  ↳ Gutenberg #$Id"
    $raw = Get-Page $url
    if (-not $raw) { return $null }
    # 去除页眉页脚
    if ($raw -match '\*\*\* START OF') {
        $start = $raw.IndexOf('*** START OF')
        $raw = $raw.Substring($raw.IndexOf("`n", $start) + 1)
    }
    if ($raw -match '\*\*\* END OF') {
        $end = $raw.IndexOf('*** END OF')
        $raw = $raw.Substring(0, $end)
    }
    return $raw.Trim()
}

function Get-SacredTextsPage {
    param([string]$Path)
    $url = "https://www.sacred-texts.com$Path"
    Write-Host "  ↳ sacred-texts: $Path"
    $raw = Get-Page $url
    if (-not $raw) { return $null }
    $text = $raw `
        -replace '(?s)<script[^>]*>.*?</script>', '' `
        -replace '(?s)<style[^>]*>.*?</style>', '' `
        -replace '<br\s*/?>', "`n" `
        -replace '</p>', "`n`n" `
        -replace '</div>', "`n" `
        -replace '<[^>]+>', '' `
        -replace '&amp;', '&' `
        -replace '&lt;', '<' `
        -replace '&gt;', '>' `
        -replace '&quot;', '"' `
        -replace '&#\d+;', '' `
        -replace '&nbsp;', ' ' `
        -replace '\n{3,}', "`n`n"
    return $text.Trim()
}

# ══ Wiki标记清洗 ══════════════════════════════════════════════
function Clean-Wikitext {
    param([string]$Raw)
    $t = $Raw
    $t = $t -replace '\{\{[^}]*\}\}', ''
    $t = $t -replace '\[\[Category:[^\]]*\]\]', ''
    $t = $t -replace '\[\[分類:[^\]]*\]\]', ''
    $t = $t -replace '(?s)<ref[^>]*>.*?</ref>', ''
    $t = $t -replace '<ref[^>]*/>', ''
    $t = $t -replace '<[^>]+>', ''
    $t = $t -replace '\[\[([^\]|]*\|)?([^\]]*)\]\]', '$2'
    $t = $t -replace "'{2,3}", ''
    $t = $t -replace '\n{3,}', "`n`n"
    return $t.Trim()
}

# ══ 文件头格式 ══════════════════════════════════════════════════
function Format-Header {
    param($Entry, [string]$Source)
    $border = "═" * 50
    return @"
$($Entry.name)
名: $($Entry.name_en)
底本: $Source
時代: $($Entry.era)
傳統: $($Entry.tradition)
採集: $(Get-Date -Format 'yyyy-MM-dd')

$border

"@
}

# ══ 单经采集 ══════════════════════════════════════════════════
function Acquire-One {
    param($Entry)
    $filename = if ($Entry.PSObject.Properties['file'] -and $Entry.file) { $Entry.file } else { "_$($Entry.id).txt" }
    $filepath = Join-Path $DIR $filename

    if ($Entry.status -eq 'acquired' -and (Test-Path $filepath)) {
        Write-Host "  ✓ 已存: $($Entry.name) ($filename)" -ForegroundColor Green
        return $true
    }

    Write-Host "`n◈ 采集: $($Entry.name) ($($Entry.name_en))" -ForegroundColor Cyan

    foreach ($src in $Entry.sources) {
        $raw = $null
        $sourceLabel = $src.type

        try {
            switch ($src.type) {
                'wikisource_zh' {
                    $raw = Get-WikisourceText -Title $src.title -Lang 'zh'
                    if ($raw) { $raw = Clean-Wikitext $raw }
                }
                'wikisource_en' {
                    $raw = Get-WikisourceText -Title $src.title -Lang 'en'
                    if ($raw) { $raw = Clean-Wikitext $raw }
                }
                'ctext' {
                    $raw = Get-CtextPage -Path $src.path
                }
                'gutenberg' {
                    $raw = Get-GutenbergText -Id $src.id
                }
                'sacred_texts' {
                    $raw = Get-SacredTextsPage -Path $src.path
                }
                default {
                    Write-Warning "  未知源: $($src.type)"
                    continue
                }
            }
        } catch {
            Write-Warning "  ✗ $($src.type) 异常: $_"
            continue
        }

        if ($raw -and $raw.Length -gt 200) {
            $header = Format-Header -Entry $Entry -Source $sourceLabel
            $full = $header + $raw
            [System.IO.File]::WriteAllText($filepath, $full, [System.Text.Encoding]::UTF8)
            $size = (Get-Item $filepath).Length
            Write-Host "  ✓ 落盘: $filename ($size bytes / $($raw.Length) chars)" -ForegroundColor Green
            return $true
        } else {
            Write-Warning "  ⚠ 内容不足 ($($raw ? $raw.Length : 0) chars), 试下一源..."
        }
    }

    Write-Warning "  ✗ 所有源失败: $($Entry.name)"
    return $false
}

# ══ 主流程 ══════════════════════════════════════════════════════
Write-Host ""
Write-Host "  道藏取经 v2.0 · 直取本源" -ForegroundColor Yellow
Write-Host "  取之尽锱铢，用之如泥沙 · 无为而无不为" -ForegroundColor DarkYellow
Write-Host ""

$canon = Get-Content $CANON -Raw -Encoding UTF8 | ConvertFrom-Json

if ($Status) {
    $acq = $canon.canon | Where-Object { $_.status -eq 'acquired' }
    $pend = $canon.canon | Where-Object { $_.status -eq 'pending' }
    Write-Host "已收: $($acq.Count) 经" -ForegroundColor Green
    $acq | ForEach-Object { Write-Host "  ✓ $($_.name)" }
    Write-Host "待采: $($pend.Count) 经" -ForegroundColor Yellow
    $pend | ForEach-Object { Write-Host "  ○ $($_.name) [P$($_.priority)] — $($_.note)" }
    exit 0
}

if ($Index) {
    # 仅重建索引，不采集
    $targets = @()
} elseif ($Id) {
    $targets = $canon.canon | Where-Object { $_.id -eq $Id }
    if (-not $targets) {
        Write-Error "未找到: $Id"
        exit 1
    }
} elseif ($All) {
    $targets = $canon.canon | Where-Object { $_.status -ne 'acquired' }
} else {
    $targets = $canon.canon | Where-Object { $_.status -eq 'pending' }
}

if ($targets.Count -eq 0 -and -not $Index) {
    Write-Host "道成。全部 pending 经典已处理。" -ForegroundColor Green
} else {
    Write-Host "═══ 待取: $($targets.Count) 经 ═══" -ForegroundColor Cyan
    $ok = 0; $fail = 0; $skip = 0
    foreach ($entry in $targets) {
        $result = Acquire-One -Entry $entry
        if ($entry.status -eq 'acquired' -and `
            (Test-Path (Join-Path $DIR ($entry.file ?? "_$($entry.id).txt")))) {
            $skip++
        } elseif ($result) {
            $entry.status = 'acquired'
            if (-not ($entry.PSObject.Properties['file'])) {
                $entry | Add-Member -NotePropertyName 'file' -NotePropertyValue "_$($entry.id).txt" -Force
            }
            $ok++
        } else {
            $fail++
        }
        Start-Sleep -Milliseconds 1500
    }
    # 保存注册表
    $canon | ConvertTo-Json -Depth 10 | Set-Content $CANON -Encoding UTF8
    Write-Host "`n═══ 采经完毕: 成功 $ok · 跳过 $skip · 失败 $fail ═══" -ForegroundColor Cyan
}

# ══ 重建 INDEX.md ══════════════════════════════════════════════
Write-Host "`n重建 INDEX.md..." -ForegroundColor DarkCyan

$acq = $canon.canon | Where-Object { $_.status -eq 'acquired' } | Sort-Object era
$pend = $canon.canon | Where-Object { $_.status -ne 'acquired' }

$totalBytes = 0; $totalChars = 0
foreach ($e in $acq) {
    $fn = if ($e.PSObject.Properties['file'] -and $e.file) { $e.file } else { "_$($e.id).txt" }
    $fp = Join-Path $DIR $fn
    if (Test-Path $fp) {
        $fi = Get-Item $fp
        $e | Add-Member -NotePropertyName 'bytes' -NotePropertyValue $fi.Length -Force
        $content = [System.IO.File]::ReadAllText($fp, [System.Text.Encoding]::UTF8)
        $e | Add-Member -NotePropertyName 'chars' -NotePropertyValue $content.Length -Force
        $totalBytes += $fi.Length
        $totalChars += $content.Length
    }
}

$lines = @(
    "# 道藏经典 · 万法归宗",
    "",
    "> 道生一，一生二，二生三，三生万物。",
    "> 取之尽锱铢，用之如泥沙。无为而无不为。",
    "",
    "## 已收 ($($acq.Count) 经 · $([math]::Round($totalBytes/1024,1))KB · $("{0:N0}" -f $totalChars) chars)",
    "",
    "| # | 经 | 文件 | 传统 | 时代 | KB | chars |",
    "|---|---|---|---|---|---|---|"
)
$i = 1
foreach ($e in $acq) {
    $fn = if ($e.PSObject.Properties['file'] -and $e.file) { $e.file } else { "_$($e.id).txt" }
    $kb = if ($e.PSObject.Properties['bytes']) { [math]::Round($e.bytes/1024,1) } else { "?" }
    $ch = if ($e.PSObject.Properties['chars']) { "{0:N0}" -f $e.chars } else { "?" }
    $lines += "| $i | **$($e.name)** | ``$fn`` | $($e.tradition) | $($e.era) | $kb | $ch |"
    $i++
}

if ($pend.Count -gt 0) {
    $lines += @(
        "",
        "## 待采 ($($pend.Count) 经)",
        "",
        "| # | 经 | 传统 | 时代 | 优先 | 备注 |",
        "|---|---|---|---|---|---|"
    )
    $j = 1
    foreach ($e in ($pend | Sort-Object priority)) {
        $lines += "| $j | **$($e.name)** ($($e.name_en)) | $($e.tradition) | $($e.era) | P$($e.priority) | $($e.note) |"
        $j++
    }
}

$lines += @(
    "",
    "## 取经管道",
    "",
    '```powershell',
    "# 采集全部待取",
    ".\取经.ps1",
    "",
    "# 采集单经",
    ".\取经.ps1 -Id yijing",
    "",
    "# 强制重采所有（包含已收）",
    ".\取经.ps1 -All",
    "",
    "# 仅重建索引",
    ".\取经.ps1 -Index",
    "",
    "# 查看状态",
    ".\取经.ps1 -Status",
    '```',
    "",
    "## 源注册表",
    "",
    "``dao_canon.json`` — 定义所有目标经典、源URL、状态",
    "",
    "---",
    "",
    "> 天下之物生于有，有生于无。",
    "> 更新: $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
    ""
)

$lines -join "`n" | Set-Content (Join-Path $DIR "INDEX.md") -Encoding UTF8
Write-Host "✓ INDEX.md 已重建" -ForegroundColor Green

Write-Host ""
