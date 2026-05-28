# Step 3: Fix settings.json
$sp = "$env:APPDATA\Windsurf\User\settings.json"
if (-not (Test-Path $sp)) { Write-Host "NOT FOUND: $sp"; exit 1 }

$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
Copy-Item $sp "$sp.bak_$ts" -Force
$s = Get-Content $sp -Raw | ConvertFrom-Json

$mod = $false
# Fix proxySupport
if ($s.'http.proxySupport' -eq 'override') {
    $s.'http.proxySupport' = 'fallback'
    $mod = $true
    Write-Host "FIX: proxySupport override -> fallback"
}
# Remove poisoned apiServerUrl
foreach ($key in @('codeium.apiServerUrl','codeium.inferenceApiServerUrl')) {
    $val = $s.$key
    if ($val -and $val -match '127\.0\.0\.1') {
        $s.PSObject.Properties.Remove($key)
        $mod = $true
        Write-Host "FIX: removed $key = $val"
    }
}
# Remove ACP injection
$acp = $s.'windsurf.acp.agentEnv'
if ($acp -and $acp.'claude-code' -and $acp.'claude-code'.'ANTHROPIC_BASE_URL' -match '127\.0\.0\.1') {
    $s.PSObject.Properties.Remove('windsurf.acp.agentEnv')
    $mod = $true
    Write-Host "FIX: removed ACP injection"
}

if ($mod) {
    $s | ConvertTo-Json -Depth 20 | Set-Content $sp -Encoding UTF8
    Write-Host "Saved settings.json"
} else {
    Write-Host "No changes needed"
}
# Show current state
$s2 = Get-Content $sp -Raw | ConvertFrom-Json
Write-Host "proxySupport: $(if($s2.'http.proxySupport'){$s2.'http.proxySupport'}else{'(not set)'})"
Write-Host "http.proxy: $(if($s2.'http.proxy'){$s2.'http.proxy'}else{'(not set)'})"
Write-Host "codeium.apiServerUrl: $(if($s2.'codeium.apiServerUrl'){$s2.'codeium.apiServerUrl'}else{'(not set)'})"
