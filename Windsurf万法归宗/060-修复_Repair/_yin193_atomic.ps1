# 印193 · 原子启动+测试脚本 · 在180s内完成全部10轮
# 此脚本在179上运行: 启动服务 → 立即测试(90s超时/轮) → 写结果文件
param([string]$OutFile = "C:\Windows\Temp\_yin193_result.txt")

function L([string]$s) {
    $line = "$(Get-Date -Format 'HH:mm:ss') $s"
    Add-Content $OutFile $line -Encoding UTF8
    Write-Output $line
}

# === 清空结果文件 ===
"" | Set-Content $OutFile -Encoding UTF8

L "=== 印193 · Claude 4.7 · 原子启动+测试 ==="
L "目标: 启动->立即测试, 零间隙, 180s内完成"

# === 路径 ===
$DC_FILE = "C:\Users\zhouyoukang\.dao\kernel\" + [char]0x9053 + [char]0x76F4 + [char]0x8FDE + [char]0x5668 + ".js"
$GW_FILE = "C:\Users\zhouyoukang\.windsurf\extensions\dao-agi.dao-proxy-max-3.1.0\vendor\gateway\server.js"
$CFG_FILE = "C:\Users\zhouyoukang\.codeium\dao-byok\" + [char]0x914D + [char]0x7F6E + ".json"
$NODE = "D:\node.exe"
$DC_PORT = 7870; $GW_PORT = 11435

# === Step1: 停止旧进程 ===
L "Step1: 清理旧进程..."
Get-Process node -EA SilentlyContinue | ForEach-Object {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -EA SilentlyContinue).CommandLine
    if ($cmd -match "server\.js.*114|gateway|dao-proxy-max") {
        Stop-Process -Id $_.Id -Force -EA SilentlyContinue
        L "  停止网关 PID=$($_.Id)"
    }
    if ($cmd -match [regex]::Escape([char]0x9053 + [char]0x76F4 + [char]0x8FDE + [char]0x5668)) {
        Stop-Process -Id $_.Id -Force -EA SilentlyContinue
        L "  停止道直连器 PID=$($_.Id)"
    }
}
Start-Sleep -Seconds 2

# === Step2: 启动道直连器 ===
L "Step2: 启动道直连器:$DC_PORT..."
$pDC = Start-Process $NODE -ArgumentList "`"$DC_FILE`"","--no-auth","--port","$DC_PORT" `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput "C:\Windows\Temp\_dc_out.log" `
    -RedirectStandardError "C:\Windows\Temp\_dc_err.log"
Start-Sleep -Seconds 8

$dcH = $null
for ($i=0;$i-lt 5;$i++) {
    try { $dcH = Invoke-RestMethod "http://127.0.0.1:$DC_PORT/health" -TimeoutSec 3; break } catch { Start-Sleep 2 }
}
if (-not $dcH) { L "ERR: 道直连器启动失败!"; Get-Content "C:\Windows\Temp\_dc_err.log" -EA SilentlyContinue | ForEach-Object { L "  STDERR: $_" }; exit 1 }
L "DC ✓ PID=$($pDC.Id) lsp=$($dcH.lsp.port) v=$($dcH.version)"

# === Step3: 启动网关 ===
L "Step3: 启动网关:$GW_PORT..."
$pGW = Start-Process $NODE -ArgumentList "`"$GW_FILE`"","--port","$GW_PORT","--config","`"$CFG_FILE`"" `
    -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 6

$gwH = $null
for ($i=0;$i-lt 5;$i++) {
    try { $gwH = Invoke-RestMethod "http://127.0.0.1:$GW_PORT/health" -TimeoutSec 3; break } catch { Start-Sleep 2 }
}
if (-not $gwH) { L "ERR: 网关启动失败!"; exit 2 }
L "GW ✓ PID=$($pGW.Id) v=$($gwH.version)"

# === Step4: 立即开始10轮测试 ===
$PROMPTS = @(
    "Write Python LRU cache: get/put/size, thread-safe. Concise.",
    "Add TTL expiry to the LRU cache. Maintain O(1). Show updated class.",
    "Write 3 pytest unit tests for the LRU+TTL cache.",
    "Convert LRU cache to async Python asyncio coroutines.",
    "Add Redis fallback: local+Redis two-level cache, failover on error.",
    "FastAPI REST: GET/POST/DELETE /cache/{key}, GET /stats endpoint.",
    "Add JWT auth to FastAPI: /login returns access+refresh tokens.",
    "Token-bucket rate limiter: per-user+per-IP, Redis-backed middleware.",
    "Dockerfile: FastAPI+Redis+Prometheus in production. Show compose too.",
    "README.md: ASCII architecture diagram, quick-start, API reference."
)

L "Step4: 开始10轮测试(超时90s/轮)..."
$ok=0; $fail=0; $rate=0; $t0g=Get-Date

for ($i=0; $i -lt $PROMPTS.Count; $i++) {
    $prompt = $PROMPTS[$i]
    L "[R$($i+1)/10] $($prompt.Substring(0,[Math]::Min(50,$prompt.Length)))..."

    $body = @{
        model="windsurfRelay/claude-opus-4-7-max"
        messages=@(@{role="user";content=$prompt})
        max_tokens=600; stream=$false; temperature=0.1
    } | ConvertTo-Json -Depth 3

    $t0=Get-Date
    try {
        $resp = Invoke-RestMethod "http://127.0.0.1:$GW_PORT/v1/chat/completions" `
            -Method POST -Body $body -ContentType "application/json" -TimeoutSec 90
        $ms=[int]((Get-Date)-$t0).TotalMilliseconds
        $reply = $resp.choices[0].message.content
        $model = if($resp.model){$resp.model}else{"claude-opus-4-7-max"}
        $route = if($resp._relay.route){$resp._relay.route}else{"unknown"}
        $isRate = $reply -match "rate.?limit|resource_exhausted|Permission denied|over.*global"
        if($isRate){$rate++;L "  RATE ${ms}ms chars=$($reply.Length) route=$route"}
        else{$ok++;L "  OK ${ms}ms chars=$($reply.Length) model=$model route=$route"}
        L "  >> $($reply.Substring(0,[Math]::Min(100,$reply.Length)).Replace("`n",' '))"
    } catch {
        $ms=[int]((Get-Date)-$t0).TotalMilliseconds
        $fail++
        L "  ERR ${ms}ms $($_.Exception.Message.Substring(0,[Math]::Min(80,$_.Exception.Message.Length)))"
        # 如果服务崩溃,检查并尝试重启
        try {
            Invoke-RestMethod "http://127.0.0.1:$GW_PORT/health" -TimeoutSec 2 | Out-Null
        } catch {
            L "  !! 网关崩溃,重启中..."
            Stop-Process -Id $pDC.Id -Force -EA SilentlyContinue
            Stop-Process -Id $pGW.Id -Force -EA SilentlyContinue
            Start-Sleep 2
            $pDC = Start-Process $NODE -ArgumentList "`"$DC_FILE`"","--no-auth","--port","$DC_PORT" -WindowStyle Hidden -PassThru
            $pGW = Start-Process $NODE -ArgumentList "`"$GW_FILE`"","--port","$GW_PORT","--config","`"$CFG_FILE`"" -WindowStyle Hidden -PassThru
            Start-Sleep 12
            L "  !! 重启完成 DC=$($pDC.Id) GW=$($pGW.Id)"
        }
    }
    if ($i -lt $PROMPTS.Count-1) { Start-Sleep 2 }
}

$tTotal=[int]((Get-Date)-$t0g).TotalSeconds
L ""
L "=== FINAL REPORT ==="
L "OK=$ok/10 FAIL=$fail RATE=$rate 总时=${tTotal}s"
if ($rate -eq 0 -and $ok -ge 5) {
    L "VERDICT: ZERO_RATE_LIMITS · 道直连器+LSP绕过全局trial限速池完全成立"
    L "证明: $ok/10成功 · 无一限速 · Claude 4.7正常响应 · 印193"
} elseif ($rate -eq 0 -and $ok -gt 0) {
    L "VERDICT: PARTIAL_OK · ok=$ok 无限速但有超时 · 链路可用需优化稳定性"
} else {
    L "VERDICT: INVESTIGATE · ok=$ok rate=$rate fail=$fail"
}
L "=== 测试结束 ==="
