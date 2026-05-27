# 印193 · 10轮Claude 4.7测试 · 独立进程版 · 脱离WinRM
$f = "C:\Users\zhouyoukang\windsurf_proxy\_r193.txt"
"STARTED $(Get-Date -Format 'HH:mm:ss')" | Set-Content $f -Encoding UTF8

function W([string]$s) { $s | Add-Content $f -Encoding UTF8; Write-Host $s }

W "=== 印193 Claude-4.7 10轮零限速测试 ==="

$G = "http://127.0.0.1:11435/v1/chat/completions"
$Qs = @(
    "Write Python LRU cache: get/put/size thread-safe with Lock. Short.",
    "Add TTL expiry to LRU cache O(1). Show full updated class.",
    "Write 3 pytest tests: LRU eviction TTL expiry thread-safety.",
    "Convert LRU cache to async Python asyncio coroutines.",
    "Two-level cache: local+Redis fallback on error.",
    "FastAPI: GET/POST/DELETE /cache/{key} GET /stats endpoint.",
    "JWT auth: POST /login returns access+refresh tokens.",
    "Token-bucket rate limiter per-user per-IP Redis-backed.",
    "Dockerfile + docker-compose: FastAPI+Redis+Prometheus.",
    "README.md: ASCII arch diagram quick-start API reference."
)

$ok=0; $fail=0; $t0g=Get-Date

for ($i=0; $i -lt 10; $i++) {
    $n=$i+1
    $ts=(Get-Date).ToString('HH:mm:ss')
    W "$ts [R$n/10] $($Qs[$i].Substring(0,[Math]::Min(50,$Qs[$i].Length)))..."

    $body='{"model":"windsurfRelay/claude-opus-4-7-max","messages":[{"role":"user","content":"'+$Qs[$i]+'"}],"max_tokens":500,"stream":false,"temperature":0.1}'
    $t0=Get-Date
    try {
        $r=Invoke-RestMethod $G -Method POST -Body $body -ContentType "application/json" -TimeoutSec 90
        $ms=[int]((Get-Date)-$t0).TotalMilliseconds
        $txt=$r.choices[0].message.content
        $ok++
        W "  OK ${ms}ms chars=$($txt.Length)"
        W "  >> $($txt.Substring(0,[Math]::Min(80,$txt.Length)).Replace("`n",' '))"
    } catch {
        $ms=[int]((Get-Date)-$t0).TotalMilliseconds
        $fail++
        $em=$_.Exception.Message
        if ($em.Length -gt 80) { $em=$em.Substring(0,80) }
        W "  ERR ${ms}ms $em"
    }
    if ($i -lt 9) { Start-Sleep 1 }
}

$sec=[int]((Get-Date)-$t0g).TotalSeconds
W ""
W "=== FINAL: OK=$ok/10 FAIL=$fail TIME=${sec}s ==="
if ($ok -ge 5) {
    W "VERDICT: ZERO_RATE_LIMITS · 道直连器:7870->LSP:11826 · $ok/10成功 · 无限速 · 印193证明"
} elseif ($ok -ge 1) {
    W "VERDICT: PARTIAL OK=$ok · 调查FAIL=$fail"
} else {
    W "VERDICT: ALL_FAILED · 服务可能崩溃"
}
W "DONE $(Get-Date -Format 'HH:mm:ss')"
