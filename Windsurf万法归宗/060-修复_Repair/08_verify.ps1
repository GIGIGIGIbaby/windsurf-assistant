<#
.SYNOPSIS
    启动独立 Windsurf 实例 + CDP 闭环验证 webview 渲染是否健康
.DESCRIPTION
    步骤：
      1) 启动新独立 Windsurf 实例（临时 user-data-dir，不干扰其他窗口）
      2) 等待 30s 让扩展激活
      3) CDP 探测：列 target / 检查 SW controller / 检查 inner iframe / 截屏
      4) 输出健康报告 + 保存截图
.PARAMETER WindsurfExe
    Windsurf.exe 路径，默认 E:\Windsurf\Windsurf.exe
.PARAMETER OutDir
    报告与截图输出目录，默认 C:\Temp\windsurf_verify_<ts>
.PARAMETER CdpPort
    远程调试端口，默认 9333
.PARAMETER KeepInstance
    验证完毕保留实例（不停止进程），用户可手动观察
.EXAMPLE
    .\08_verify.ps1
    .\08_verify.ps1 -KeepInstance
#>

[CmdletBinding()]
param(
    [string]$WindsurfExe = "E:\Windsurf\Windsurf.exe",
    [string]$OutDir = "",
    [int]$CdpPort = 9333,
    [switch]$KeepInstance
)

$ErrorActionPreference = 'Stop'

$ts = Get-Date -Format "yyyyMMdd_HHmmss"
if (-not $OutDir) { $OutDir = "C:\Temp\windsurf_verify_$ts" }

$udd = Join-Path $OutDir "user-data"
$ws  = Join-Path $OutDir "workspace"
New-Item -ItemType Directory -Path $udd, $ws -Force | Out-Null

# Pre-trust + skip welcome
$userSettings = @{
    "security.workspace.trust.enabled" = $false
    "telemetry.telemetryLevel"         = "off"
    "extensions.autoCheckUpdates"      = $false
    "update.mode"                      = "none"
} | ConvertTo-Json
$userDir = Join-Path $udd "User"
New-Item -ItemType Directory -Path $userDir -Force | Out-Null
Set-Content "$userDir\settings.json" $userSettings -Encoding UTF8

Set-Content "$ws\README.md" "# Verify ts=$ts" -Encoding UTF8

Write-Host "=== Windsurf WebView Verify ===" -ForegroundColor Cyan
Write-Host "OutDir: $OutDir"
Write-Host "Port  : $CdpPort"
Write-Host ""

# Launch
Write-Host "Launching independent instance..."
Start-Process -FilePath $WindsurfExe -ArgumentList @(
    "--user-data-dir","$udd",
    "--new-window",
    "--remote-debugging-port=$CdpPort",
    "--disable-workspace-trust",
    $ws
) -WindowStyle Normal | Out-Null

Write-Host "Waiting 30s for extension activation..."
Start-Sleep -Seconds 30

# --- CDP helpers ---
function Send-CdpInline {
    param($Ws, $Method, $Params, [ref]$IdCounter, [int]$TimeoutMs = 8000)
    $IdCounter.Value++
    $localId = $IdCounter.Value
    $cmd = @{ id = $localId; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 10
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($cmd)
    $ct = [System.Threading.CancellationToken]::None
    $Ws.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
    $deadline = [DateTime]::Now.AddMilliseconds($TimeoutMs)
    while ([DateTime]::Now -lt $deadline) {
        $sb = New-Object System.Text.StringBuilder
        do {
            $buf = New-Object byte[] 131072
            $rs = $Ws.ReceiveAsync([System.ArraySegment[byte]]::new($buf), $ct); $rs.Wait()
            $r = $rs.Result
            $sb.Append([System.Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)) | Out-Null
            if ($r.EndOfMessage) { break }
        } while ($true)
        $msg = $sb.ToString()
        if ($msg.Contains("`"id`":$localId,") -or $msg.Contains("`"id`":$localId}")) { return $msg }
    }
    return $null
}

# --- 1. Check CDP targets ---
$cdpBaseUrl = "http://127.0.0.1:$CdpPort"
try {
    $targets = Invoke-RestMethod -Uri "$cdpBaseUrl/json/list" -ErrorAction Stop
} catch {
    Write-Host "[FAIL] Cannot reach CDP on $cdpBaseUrl" -ForegroundColor Red
    exit 1
}

$page         = $targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
$webviewFrm   = $targets | Where-Object { $_.type -eq 'iframe' -and $_.url -match 'vscode-webview' }
$serviceWker  = $targets | Where-Object { $_.type -eq 'service_worker' -and $_.url -match 'vscode-webview' }

Write-Host "=== CDP Target Summary ===" -ForegroundColor Cyan
Write-Host "page count          : $(@($page).Count)"
Write-Host "webview iframes     : $(@($webviewFrm).Count)"
Write-Host "service_worker      : $(@($serviceWker).Count)"

# --- 2. Probe webview iframe for SW controller + inner iframe ---
$resultSummary = @{
    timestamp = $ts
    targets = @{
        page = @($page).Count
        webviewIframes = @($webviewFrm).Count
        serviceWorkers = @($serviceWker).Count
    }
    iframes = @()
    swControllerAll = $true
    innerIframeAll = $true
}

foreach ($f in $webviewFrm) {
    $extId = if ($f.url -match 'extensionId=([^&]+)') {$matches[1]} else {'?'}
    $purpose = if ($f.url -match 'purpose=([^&]+)') {$matches[1]} else {'?'}
    Write-Host "`n[Probe] ext=$extId purpose=$purpose"

    $ws2 = New-Object System.Net.WebSockets.ClientWebSocket
    try {
        $ws2.ConnectAsync([Uri]$f.webSocketDebuggerUrl, [System.Threading.CancellationToken]::None).Wait()
    } catch {
        Write-Host "  Connect failed: $_" -ForegroundColor Red
        continue
    }
    $idc2 = [ref]0
    Send-CdpInline $ws2 'Runtime.enable' @{} $idc2 3000 | Out-Null

    $r = Send-CdpInline $ws2 'Runtime.evaluate' @{
        expression = @"
(()=>{
  return JSON.stringify({
    swController: !!navigator.serviceWorker.controller,
    bodyChildren: document.body?.children.length || 0,
    innerIframeCount: document.querySelectorAll('iframe').length,
    innerIframeSrc: (document.querySelector('iframe')?.src||'').substring(0,150)
  });
})()
"@
        returnByValue = $true
    } $idc2 5000

    if ($r) {
        $parsed = (($r | ConvertFrom-Json).result.result.value) | ConvertFrom-Json
        Write-Host "  swController     : $($parsed.swController)"
        Write-Host "  bodyChildren     : $($parsed.bodyChildren)"
        Write-Host "  innerIframeCount : $($parsed.innerIframeCount)"
        if ($parsed.innerIframeCount -gt 0) {
            Write-Host "  innerIframeSrc   : $($parsed.innerIframeSrc)"
        }
        $resultSummary.iframes += [PSCustomObject]@{
            extensionId = $extId
            purpose = $purpose
            swController = [bool]$parsed.swController
            innerIframeCount = [int]$parsed.innerIframeCount
        }
        if (-not $parsed.swController) { $resultSummary.swControllerAll = $false }
        if ($parsed.innerIframeCount -eq 0) { $resultSummary.innerIframeAll = $false }
    }
    $ws2.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [System.Threading.CancellationToken]::None).Wait()
}

# --- 3. Screenshot ---
if ($page) {
    Write-Host "`n=== Screenshot ===" -ForegroundColor Cyan
    $ws3 = New-Object System.Net.WebSockets.ClientWebSocket
    $ws3.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [System.Threading.CancellationToken]::None).Wait()
    $idc3 = [ref]0
    # Remove onboarding overlay
    Send-CdpInline $ws3 'Runtime.evaluate' @{
        expression = "document.querySelectorAll('[class*=onboarding],[class*=portal-overlay]').forEach(e=>e.remove())"
        returnByValue = $true
    } $idc3 3000 | Out-Null
    Start-Sleep -Milliseconds 500
    # Take screenshot
    $shot = Send-CdpInline $ws3 'Page.captureScreenshot' @{ format='png'; captureBeyondViewport=$false } $idc3 12000
    if ($shot) {
        $bytes = [Convert]::FromBase64String((($shot | ConvertFrom-Json).result.data))
        $shotPath = Join-Path $OutDir "verify_screenshot.png"
        [IO.File]::WriteAllBytes($shotPath, $bytes)
        Write-Host "Saved -> $shotPath ($([Math]::Round($bytes.Length/1KB,1)) KB)"
    }
    $ws3.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [System.Threading.CancellationToken]::None).Wait()
}

# --- 4. Save JSON report ---
$reportPath = Join-Path $OutDir "verify_report.json"
$resultSummary | ConvertTo-Json -Depth 10 | Set-Content $reportPath -Encoding UTF8
Write-Host "Report -> $reportPath"

# --- 5. Final verdict ---
Write-Host ""
Write-Host "=== Final Verdict ===" -ForegroundColor Cyan
if (@($webviewFrm).Count -eq 0) {
    Write-Host "WARN: No webview iframe was created. Possibly no extension auto-opens a webview." -ForegroundColor Yellow
    Write-Host "      This is not a failure; webview may only be created on user click."
    Write-Host "      To force-create one, install/activate an extension with auto-open webview (e.g. dao-proxy-min)."
    $exitCode = 0
} elseif ($resultSummary.swControllerAll -and $resultSummary.innerIframeAll) {
    Write-Host "PASS: All webview iframes have SW controller + inner iframe." -ForegroundColor Green
    Write-Host "      WebView rendering is healthy." 
    $exitCode = 0
} else {
    Write-Host "FAIL: At least one webview iframe is broken." -ForegroundColor Red
    Write-Host "      swControllerAll = $($resultSummary.swControllerAll)"
    Write-Host "      innerIframeAll  = $($resultSummary.innerIframeAll)"
    Write-Host "      → Run .\08_diagnose.ps1 for root cause"
    $exitCode = 2
}

# --- 6. Cleanup or keep ---
if (-not $KeepInstance) {
    Write-Host ""
    Write-Host "Stopping verifier instance..."
    Get-Process Windsurf -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle -match 'workspace' -and $_.StartTime -gt (Get-Date).AddMinutes(-5) } |
        ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
} else {
    Write-Host ""
    Write-Host "Verifier instance left running (use -KeepInstance:`$false to auto-stop)" -ForegroundColor Yellow
    Write-Host "CDP URL: $cdpBaseUrl"
}

exit $exitCode
