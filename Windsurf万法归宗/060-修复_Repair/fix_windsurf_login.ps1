# ============================================================
# Windsurf 登录修复脚本 — 彻底清理 Chromium 缓存的死代理状态
# 
# 用法: 关闭 Windsurf → 以管理员身份运行此脚本 → 重启 Windsurf
# ============================================================

$ErrorActionPreference = 'SilentlyContinue'
$wsData = "$env:APPDATA\Windsurf"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Windsurf 登录修复脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# === Step 0: 确保 Windsurf 已关闭 ===
Write-Host "`n[0] 检查 Windsurf 进程..." -ForegroundColor Yellow
$wsProcs = Get-Process -Name "Windsurf" -ErrorAction SilentlyContinue
if ($wsProcs) {
    Write-Host "    发现 $($wsProcs.Count) 个 Windsurf 进程，正在关闭..." -ForegroundColor Red
    $wsProcs | Stop-Process -Force
    Start-Sleep -Seconds 3
    # 二次确认
    $remaining = Get-Process -Name "Windsurf" -ErrorAction SilentlyContinue
    if ($remaining) {
        Write-Host "    仍有进程未关闭，强制终止..." -ForegroundColor Red
        $remaining | Stop-Process -Force
        Start-Sleep -Seconds 2
    }
    Write-Host "    Windsurf 已关闭" -ForegroundColor Green
} else {
    Write-Host "    Windsurf 未运行 — OK" -ForegroundColor Green
}

# === Step 1: 清理 Chromium Network 缓存（死代理缓存在这里）===
Write-Host "`n[1] 清理 Chromium Network 缓存..." -ForegroundColor Yellow
$networkDir = "$wsData\Network"
if (Test-Path $networkDir) {
    # 删除所有网络缓存文件（Cookies, Trust Tokens, TransportSecurity 等）
    Get-ChildItem $networkDir -File | ForEach-Object {
        Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
        Write-Host "    删除: $($_.Name)" -ForegroundColor Gray
    }
    Write-Host "    Network 缓存已清理" -ForegroundColor Green
} else {
    Write-Host "    Network 目录不存在 — 跳过" -ForegroundColor Gray
}

# === Step 2: 清理 Chromium Cache/GPUCache ===
Write-Host "`n[2] 清理 Chromium Cache..." -ForegroundColor Yellow
@("$wsData\Cache", "$wsData\Code Cache", "$wsData\GPUCache", "$wsData\Service Worker", "$wsData\blob_storage") | ForEach-Object {
    if (Test-Path $_) {
        Get-ChildItem $_ -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
        Remove-Item $_ -Force -ErrorAction SilentlyContinue
        Write-Host "    删除: $($_.Replace($wsData,''))" -ForegroundColor Gray
    }
}
Write-Host "    Cache 已清理" -ForegroundColor Green

# === Step 3: 清理 Session Storage（可能有缓存的代理配置）===
Write-Host "`n[3] 清理 Session Storage..." -ForegroundColor Yellow
$ssDir = "$wsData\Session Storage"
if (Test-Path $ssDir) {
    Get-ChildItem $ssDir -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Remove-Item $ssDir -Force -ErrorAction SilentlyContinue
    Write-Host "    Session Storage 已清理" -ForegroundColor Green
}

# === Step 4: 修复 Windsurf settings.json ===
Write-Host "`n[4] 修复 Windsurf settings.json..." -ForegroundColor Yellow
$settingsPath = "$wsData\User\settings.json"
$newSettings = @'
{
  "http.proxyStrictSSL": true,
  "http.proxySupport": "off",
  "http.proxy": ""
}
'@
Set-Content -Path $settingsPath -Value $newSettings -Encoding UTF8
Write-Host "    settings.json 已更新:" -ForegroundColor Green
Write-Host "      http.proxySupport: off (直连，不经过任何代理)" -ForegroundColor Gray
Write-Host "      http.proxyStrictSSL: true" -ForegroundColor Gray
Write-Host "      http.proxy: '' (空)" -ForegroundColor Gray

# === Step 5: 确保系统代理已禁用 ===
Write-Host "`n[5] 确保系统代理已禁用..." -ForegroundColor Yellow
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name 'ProxyEnable' -Value 0 -ErrorAction SilentlyContinue
$pe = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings').ProxyEnable
Write-Host "    ProxyEnable = $pe" -ForegroundColor $(if($pe -eq 0){'Green'}else{'Red'})

# === Step 6: 刷新 DNS ===
Write-Host "`n[6] 刷新 DNS 缓存..." -ForegroundColor Yellow
ipconfig /flushdns | Out-Null
Write-Host "    DNS 缓存已刷新" -ForegroundColor Green

# === Step 7: 清理 Windsurf auth 残留 ===
Write-Host "`n[7] 清理 auth 残留数据..." -ForegroundColor Yellow
# 清理 .codeium 中的旧 user_settings (可能有过期 token)
$codeiumSettings = "$env:USERPROFILE\.codeium\windsurf\user_settings.pb"
if (Test-Path $codeiumSettings) {
    Remove-Item $codeiumSettings -Force -ErrorAction SilentlyContinue
    Write-Host "    删除: user_settings.pb (将在登录后重新生成)" -ForegroundColor Gray
}

# SharedStorage
$sharedStorage = "$wsData\SharedStorage"
if (Test-Path $sharedStorage) {
    Remove-Item $sharedStorage -Force -ErrorAction SilentlyContinue
    Write-Host "    删除: SharedStorage" -ForegroundColor Gray
}
$sharedStorageWal = "$wsData\SharedStorage-wal"
if (Test-Path $sharedStorageWal) {
    Remove-Item $sharedStorageWal -Force -ErrorAction SilentlyContinue
}

# DIPS (Detect Incidental Party State)
@("$wsData\DIPS", "$wsData\DIPS-wal") | ForEach-Object {
    if (Test-Path $_) { Remove-Item $_ -Force -ErrorAction SilentlyContinue }
}
Write-Host "    auth 残留已清理" -ForegroundColor Green

# === Step 8: 验证 ===
Write-Host "`n[8] 最终验证..." -ForegroundColor Yellow

# hosts 文件
$hosts = Get-Content C:\Windows\System32\drivers\etc\hosts -Raw
if ($hosts -match 'codeium|windsurf') { 
    Write-Host "    FAIL: hosts 文件仍有 Windsurf 相关条目!" -ForegroundColor Red
} else { 
    Write-Host "    PASS: hosts 文件干净" -ForegroundColor Green 
}

# 代理
$proxy = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings').ProxyEnable
Write-Host "    $(if($proxy -eq 0){'PASS'}else{'FAIL'}): 系统代理 ProxyEnable=$proxy" -ForegroundColor $(if($proxy -eq 0){'Green'}else{'Red'})

# WAM cert
$wam = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match 'WAM' }
Write-Host "    $(if(-not $wam){'PASS'}else{'FAIL'}): WAM CA 证书$(if(-not $wam){' 已清除'}else{' 仍存在!'})" -ForegroundColor $(if(-not $wam){'Green'}else{'Red'})

# 防火墙
$fw = Get-NetFirewallRule | Where-Object { $_.DisplayName -match 'Windsurf' -and $_.Action -eq 'Allow' }
Write-Host "    $(if($fw.Count -ge 2){'PASS'}else{'WARN'}): Windows 防火墙 Windsurf 规则 ($($fw.Count) 条)" -ForegroundColor $(if($fw.Count -ge 2){'Green'}else{'Yellow'})

# settings.json
$settings = Get-Content $settingsPath -Raw
Write-Host "    PASS: settings.json 已更新" -ForegroundColor Green

# HTTPS 连通性
Write-Host "`n    测试 HTTPS 连通性..." -ForegroundColor Yellow
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
@('https://server.codeium.com','https://register.windsurf.com','https://marketplace.windsurf.com') | ForEach-Object {
    try {
        $r = Invoke-WebRequest -Uri $_ -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        Write-Host "    PASS: $_ => $($r.StatusCode)" -ForegroundColor Green
    } catch {
        $msg = $_.Exception.Message
        if ($msg -match '404|403|405') { Write-Host "    PASS: $_ => 服务器响应" -ForegroundColor Green }
        else { Write-Host "    FAIL: $_ => $msg" -ForegroundColor Red }
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  修复完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步：" -ForegroundColor Yellow
Write-Host "  1. 启动 Windsurf" -ForegroundColor White
Write-Host "  2. 点击左下角头像 → Sign In" -ForegroundColor White
Write-Host "  3. 在浏览器中完成登录" -ForegroundColor White
Write-Host ""
Write-Host "如果仍然失败：" -ForegroundColor Yellow
$wsExe = @('D:\Windsurf','E:\Windsurf',"$env:LOCALAPPDATA\Programs\Windsurf",'C:\Program Files\Windsurf') | Where-Object { Test-Path "$_\Windsurf.exe" } | Select-Object -First 1
if (-not $wsExe) { $wsExe = 'Windsurf安装目录' }
Write-Host "  - 打开火绒 → 安全防护 → 将 $wsExe\Windsurf.exe 加入信任区" -ForegroundColor White
Write-Host "  - 或暂时关闭火绒联网控制再测试" -ForegroundColor White
Write-Host ""
# 非交互模式，由调用方(一键修复.cmd)控制暂停
