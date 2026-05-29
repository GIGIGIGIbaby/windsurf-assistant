# 全 38 模真活扫 (闭环底层 chat 实证)
# 「为之于其未有也, 治之于其未乱也」—— 帛书《六十四》

$r = Invoke-RestMethod 'http://127.0.0.1:11713/v1/models' -TimeoutSec 4
$models = $r.data | ForEach-Object { $_.id }
Write-Output "total models: $($models.Count)"
Write-Output ""

$ok = 0
$err = 0
$results = @()
foreach ($m in $models) {
    $bo = @{
        model = $m
        messages = @(@{role='user'; content='Reply ok'})
        max_tokens = 10
        stream = $false
    } | ConvertTo-Json -Depth 10 -Compress
    $tag = ''
    $msg = ''
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $res = Invoke-RestMethod 'http://127.0.0.1:11713/v1/chat/completions' `
            -Method POST -ContentType 'application/json' -Body $bo -TimeoutSec 30
        $sw.Stop()
        $ok++
        $reply = $res.choices[0].message.content
        if ($null -eq $reply) { $reply = '' }
        if ($reply.Length -gt 28) { $reply = $reply.Substring(0,28) + '...' }
        $tag = 'OK '
        $ms = $sw.ElapsedMilliseconds
        $msg = "$($res.model) ${ms}ms · $reply"
    } catch {
        $sw.Stop()
        $err++
        $tag = 'ERR'
        $e = $_
        $em = $e.Exception.Message
        $code = '?'
        if ($em -match '\((\d+)\)') { $code = $matches[1] }
        $body = ''
        if ($e.ErrorDetails -and $e.ErrorDetails.Message) {
            try {
                $bd = $e.ErrorDetails.Message | ConvertFrom-Json
                if ($bd.error.message) { $body = $bd.error.message }
                elseif ($bd.error.code) { $body = $bd.error.code }
            } catch {
                $emsg = $e.ErrorDetails.Message
                $body = $emsg.Substring(0, [Math]::Min(60, $emsg.Length))
            }
        }
        if ($body.Length -gt 80) { $body = $body.Substring(0,80) }
        $msg = "HTTP $code · $body"
    }
    $line = "$tag $($m.PadRight(56)) $msg"
    Write-Output $line
    $results += $line
    Start-Sleep -Milliseconds 200
}

Write-Output ""
Write-Output "==================================="
Write-Output "TOTAL: ok=$ok err=$err / $($models.Count)"
Write-Output "==================================="
