<#
.SYNOPSIS
  Windsurf 治本后 · 一键验证终态
.DESCRIPTION
  验 ACP 三 agent 真注 + WAM 真态 + 网真出向 + :8878 真无
.EXAMPLE
  # 本机
  .\verify.ps1
  # 远端
  Invoke-Command -ComputerName 192.168.31.179 -FilePath .\verify.ps1
.NOTES
  无破坏 · 只读 · 治本后跑此可证终态
#>

$ErrorActionPreference = 'SilentlyContinue'

Write-Output ''
Write-Output '═══ Windsurf 治本后 · 终态验 ═══'
Write-Output ''

$ok = 0
$fail = 0

# ============================================================
# 1. extension.js 已还原
# ============================================================
Write-Output '== 1. extension.js 真无 :8878 =='
$extJs = 'E:\Windsurf\resources\app\extensions\windsurf\dist\extension.js'
$content = Get-Content $extJs -Raw
if ($content.IndexOf('127.0.0.1:8878') -ge 0) {
    Write-Output '  ✗ 仍含 :8878'
    $fail++
} else {
    Write-Output '  ✓ 真无 :8878'
    $ok++
}
if ($content.IndexOf('server.codeium.com') -ge 0) {
    Write-Output '  ✓ 真含 server.codeium.com'
    $ok++
} else {
    Write-Output '  ✗ 不含 server.codeium.com'
    $fail++
}

# ============================================================
# 2. ACP 三 agent 真注
# ============================================================
Write-Output ''
Write-Output '== 2. ACP 三 agent 真注 =='
$logDir = 'C:\Users\zhouyoukang\AppData\Roaming\Windsurf\logs'
$newDir = Get-ChildItem $logDir -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$acp = "$($newDir.FullName)\window1\exthost\codeium.windsurf\Windsurf ACP.log"
if (Test-Path $acp) {
    $acpRaw = Get-Content $acp -Raw
    
    if ($acpRaw -match '8878') {
        Write-Output '  ✗ ACP.log 仍含 8878'
        $fail++
    } else {
        Write-Output '  ✓ ACP.log 真无 8878'
        $ok++
    }
    
    foreach ($agent in 'devin-cli', 'devin-cloud', 'summary-agent') {
        if ($acpRaw -match ('Registering agent "' + $agent + '"')) {
            Write-Output ('  ✓ ' + $agent + ' 真注')
            $ok++
        } else {
            Write-Output ('  ✗ ' + $agent + ' 未注')
            $fail++
        }
    }
} else {
    Write-Output '  ✗ ACP.log 不存'
    $fail++
}

# ============================================================
# 3. WAM 真注
# ============================================================
Write-Output ''
Write-Output '== 3. WAM 真注 =='
$wamLog = Get-ChildItem "$($newDir.FullName)\window1\exthost\output_logging_*" -Filter '*WAM.log' -Recurse | Select-Object -First 1
if ($wamLog) {
    $wamRaw = Get-Content $wamLog.FullName -Raw
    if ($wamRaw -match 'planStatus: D(\d+)% W(\d+)%') {
        Write-Output ('  ✓ planStatus: D' + $matches[1] + '% W' + $matches[2] + '%')
        $ok++
    } else {
        Write-Output '  ✗ 无 planStatus'
        $fail++
    }
    if ($wamRaw -match 'registerUser ✓ apiServerUrl=https://server\.self-serve\.windsurf\.com') {
        Write-Output '  ✓ registerUser ✓ self-serve.windsurf.com'
        $ok++
    } else {
        Write-Output '  ✗ registerUser 未通'
        $fail++
    }
} else {
    Write-Output '  ✗ WAM.log 不存'
    $fail++
}

# ============================================================
# 4. 进程态
# ============================================================
Write-Output ''
Write-Output '== 4. 进程态 =='
$wsCnt = (Get-Process -Name Windsurf | Measure-Object).Count
$lsCnt = (Get-Process -Name language_server* | Measure-Object).Count
Write-Output ('  Windsurf       : ' + $wsCnt + ' (期 9-16)')
Write-Output ('  language_server: ' + $lsCnt + ' (期 1-2)')
if ($wsCnt -ge 5) { $ok++ } else { $fail++ }
if ($lsCnt -ge 1) { $ok++ } else { $fail++ }

# ============================================================
# 5. 网真出向 (官方)
# ============================================================
Write-Output ''
Write-Output '== 5. 网真出向 (官方) =='
$conns = Get-NetTCPConnection -State Established | Where-Object {
    $proc = Get-Process -Id $_.OwningProcess -EA SilentlyContinue
    $proc -and ($proc.Name -eq 'Windsurf' -or $proc.Name -like 'language_server*') -and 
    $_.RemoteAddress -notmatch '^(127\.|192\.168\.|10\.|172\.|::1|169\.254|fe80|0\.0\.0\.0)'
}
if ($conns) {
    $totalOfficial = $conns.Count
    Write-Output ('  ✓ 真出向官方 ' + $totalOfficial + ' 路:')
    $conns | Group-Object RemoteAddress, RemotePort | ForEach-Object {
        $first = $_.Group[0]
        $proc = Get-Process -Id $first.OwningProcess -EA SilentlyContinue
        Write-Output ('    ' + $first.RemoteAddress + ':' + $first.RemotePort + ' ← ' + $_.Count + ' · ' + $proc.Name)
    }
    if ($totalOfficial -ge 4) { $ok++ } else { $fail++ }
} else {
    Write-Output '  ✗ 0 出向官方'
    $fail++
}

# :8878 真无
$c8878 = Get-NetTCPConnection -RemotePort 8878
if ($c8878) {
    Write-Output ('  ⚠ 仍有 ' + $c8878.Count + ' 连 :8878')
    $fail++
} else {
    Write-Output '  ✓ 0 出向 :8878 · 反代依赖断'
    $ok++
}

# ============================================================
# 总判
# ============================================================
Write-Output ''
Write-Output '═══ 终判 ═══'
Write-Output ('  ✓ 真态: ' + $ok)
Write-Output ('  ✗ 异态: ' + $fail)
Write-Output ''
if ($fail -eq 0) {
    Write-Output '  ★★★ 全相真态 · 治本完成 ★★★'
    Write-Output '  主公 RDP 内输 Cascade chat 必真响'
} elseif ($fail -le 2) {
    Write-Output '  ⚠ 大体真态·有少异 (启刚不久 / 未触发 chat 等) · 等数分再验'
} else {
    Write-Output '  ✗ 异多 · 须再诊 (跑 diag.ps1) 或重治 (跑 repair.ps1)'
}