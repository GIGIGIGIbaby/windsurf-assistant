<#
.SYNOPSIS
  Windsurf 二进制反代血印 · 一键诊断
.DESCRIPTION
  探 ext.js 是否被改 + ACP fetchRegistry 真态 + WAM 真态 + 网真出向
.EXAMPLE
  # 本机
  .\diag.ps1
  # 远端 (PowerShell Remoting)
  Invoke-Command -ComputerName 192.168.31.179 -FilePath .\diag.ps1
.NOTES
  无破坏 · 只读 · 安全可重复运行
#>

$ErrorActionPreference = 'SilentlyContinue'

Write-Output ''
Write-Output '═══ Windsurf 二进制反代血印 · 诊断 ═══'
Write-Output ''

# ============================================================
# A. extension.js 真态
# ============================================================
Write-Output '== A. extension.js 真态 =='
$extJs = 'E:\Windsurf\resources\app\extensions\windsurf\dist\extension.js'
if (-not (Test-Path $extJs)) {
    Write-Output '  ✗ extension.js 不存 · Windsurf 装异常'
    return
}
$info = Get-Item $extJs
Write-Output ('  size=' + $info.Length + ' B mtime=' + $info.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))

# 探 :8878 / 反代字样
$content = Get-Content $extJs -Raw
$has8878 = $content.IndexOf('127.0.0.1:8878') -ge 0
$has8957 = $content.IndexOf('127.0.0.1:8957') -ge 0
$has11435 = $content.IndexOf('127.0.0.1:11435') -ge 0
$hasOfficial = $content.IndexOf('server.codeium.com') -ge 0

if ($has8878) {
    Write-Output '  ⚠ 含 127.0.0.1:8878  ← 二进制反代血印'
}
if ($has8957) { Write-Output '  ⚠ 含 127.0.0.1:8957' }
if ($has11435) { Write-Output '  ⚠ 含 127.0.0.1:11435' }
if (-not $has8878 -and -not $has8957 -and -not $has11435) {
    Write-Output '  ✓ 真无 :8878 / :8957 / :11435 反代字样'
}
if ($hasOfficial) {
    Write-Output '  ✓ 真含 server.codeium.com (官方真 URL)'
}

# 同目下 .bak 件
Write-Output ''
Write-Output '  -- 同目下 .bak 件 --'
$dir = Split-Path $extJs
Get-ChildItem $dir -Filter 'extension.js.bak*' | Sort-Object Name | ForEach-Object {
    Write-Output ('    ' + $_.Name + '  ' + $_.Length + ' B  ' + $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))
}

# ============================================================
# B. ACP.log 真态 (本机用 zhouyoukang user)
# ============================================================
Write-Output ''
Write-Output '== B. ACP.log 真态 (最新 log dir) =='
$logDir = 'C:\Users\zhouyoukang\AppData\Roaming\Windsurf\logs'
if (Test-Path $logDir) {
    $newDir = Get-ChildItem $logDir -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Write-Output ('  最新 log dir: ' + $newDir.Name)
    
    $acp = "$($newDir.FullName)\window1\exthost\codeium.windsurf\Windsurf ACP.log"
    if (Test-Path $acp) {
        $acpRaw = Get-Content $acp -Raw
        if ($acpRaw -match '8878') {
            Write-Output '  ⚠ ACP.log 含 8878 · 死循环未治'
            $matches = ([regex]::Matches($acpRaw, '8878'))
            Write-Output ('     匹配次数: ' + $matches.Count)
        } else {
            Write-Output '  ✓ ACP.log 真无 8878'
        }
        
        $hasDevinCli = $acpRaw -match 'Registering agent "devin-cli"'
        $hasDevinCloud = $acpRaw -match 'Registering agent "devin-cloud"'
        $hasSummary = $acpRaw -match 'Registering agent "summary-agent"'
        Write-Output ('  devin-cli      ' + $(if ($hasDevinCli) { '✓' } else { '✗' }))
        Write-Output ('  devin-cloud    ' + $(if ($hasDevinCloud) { '✓' } else { '✗' }) + '  (Cascade chat 主用)')
        Write-Output ('  summary-agent  ' + $(if ($hasSummary) { '✓' } else { '✗' }))
    } else {
        Write-Output '  ✗ ACP.log 不存 · Windsurf 未启或刚启'
    }
}

# ============================================================
# C. WAM 真态
# ============================================================
Write-Output ''
Write-Output '== C. WAM 真态 =='
if (Test-Path $logDir) {
    $newDir = Get-ChildItem $logDir -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $wamLog = Get-ChildItem "$($newDir.FullName)\window1\exthost\output_logging_*" -Filter '*WAM.log' -Recurse | Select-Object -First 1
    if ($wamLog) {
        $wamRaw = Get-Content $wamLog.FullName -Raw
        if ($wamRaw -match 'planStatus: D(\d+)% W(\d+)%') {
            Write-Output ('  ✓ WAM planStatus: D' + $matches[1] + '% W' + $matches[2] + '%')
        }
        if ($wamRaw -match 'registerUser ✓') { Write-Output '  ✓ WAM registerUser ✓' }
        if ($wamRaw -match 'inject 跑 provideAuthTokenToAuthProvider') {
            $injectCnt = ([regex]::Matches($wamRaw, 'inject 跑 provideAuthTokenToAuthProvider')).Count
            Write-Output ('  ✓ WAM 注入次数: ' + $injectCnt)
        }
    } else {
        Write-Output '  ✗ WAM.log 不存 · WAM ext 未激活'
    }
}

# ============================================================
# D. 进程态
# ============================================================
Write-Output ''
Write-Output '== D. 进程态 =='
$wsCnt = (Get-Process -Name Windsurf | Measure-Object).Count
$lsCnt = (Get-Process -Name language_server* | Measure-Object).Count
Write-Output ('  Windsurf       : ' + $wsCnt)
Write-Output ('  language_server: ' + $lsCnt)

# ============================================================
# E. 网真出向
# ============================================================
Write-Output ''
Write-Output '== E. 网真出向 (官方) =='
$conns = Get-NetTCPConnection -State Established | Where-Object {
    $proc = Get-Process -Id $_.OwningProcess -EA SilentlyContinue
    $proc -and ($proc.Name -eq 'Windsurf' -or $proc.Name -like 'language_server*') -and 
    $_.RemoteAddress -notmatch '^(127\.|192\.168\.|10\.|172\.|::1|169\.254|fe80|0\.0\.0\.0)'
}
if ($conns) {
    $conns | Group-Object RemoteAddress, RemotePort | ForEach-Object {
        $first = $_.Group[0]
        $proc = Get-Process -Id $first.OwningProcess -EA SilentlyContinue
        Write-Output ('  ' + $first.RemoteAddress + ':' + $first.RemotePort + ' ← ' + $_.Count + ' · ' + $proc.Name)
    }
} else {
    Write-Output '  ✗ 0 出向官方 · 网络异'
}

# :8878 出向
$c8878 = Get-NetTCPConnection -RemotePort 8878
if ($c8878) {
    Write-Output ('  ⚠ 仍有 ' + $c8878.Count + ' 连 :8878')
} else {
    Write-Output '  ✓ 0 出向 :8878 · 反代依赖断'
}

# ============================================================
# 总判
# ============================================================
Write-Output ''
Write-Output '═══ 诊断总判 ═══'
if ($has8878) {
    Write-Output '  ⚠ 二进制反代血印 · 须 1:1 还原 bak (运行 repair.ps1)'
} elseif ($wsCnt -eq 0) {
    Write-Output '  ⚠ Windsurf 未启 · 启之后再诊'
} else {
    Write-Output '  ✓ 二进制层无血印 · 一切真态'
}