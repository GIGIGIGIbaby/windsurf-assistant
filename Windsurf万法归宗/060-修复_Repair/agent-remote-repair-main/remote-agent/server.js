const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const PORT = process.env.PORT || 3002;
const PUBLIC_URL = process.env.PUBLIC_URL || (process.env.FRP_MODE === '1' ? 'aiotvr.xyz/repair' : 'localhost:' + PORT);
const SECURE = process.env.SECURE === '1' || /ngrok|\.(app|io|dev|xyz)($|[:/?])/.test(PUBLIC_URL);
const WS_SCHEME = SECURE ? 'wss' : 'ws';
const HTTP_SCHEME = SECURE ? 'https' : 'http';
const STARTUP_TIME = new Date().toISOString();

// ==================== STATE ====================
let senseSocket = null;
// Multi-agent: Map<agentId, {ws, data, pingTimer, hostsGuardTimer}>
const agents = new Map();
let activeAgentId = null; // currently selected agent for commands
let senseData = { connected: false, ua: null, diagnostics: null, lastUpdate: null };
let commandHistory = [];
const pendingCommands = new Map();
let messageQueue = [];

// ==================== MULTI-AGENT HELPERS ====================
function getAgent(id) { return agents.get(id || activeAgentId); }
function getAgentSocket(id) { var a = getAgent(id); return a && a.ws && a.ws.readyState === 1 ? a.ws : null; }
function getActiveAgentSocket() { return getAgentSocket(activeAgentId); }
function agentCount() { return agents.size; }
function allAgentIds() { return Array.from(agents.keys()); }
function agentSummary() { return allAgentIds().map(function (id) { var a = agents.get(id); return { id: id, hostname: a.data.hostname, user: a.data.user, os: a.data.os, isAdmin: a.data.isAdmin, active: id === activeAgentId }; }); }
function setActiveAgent(id) { if (agents.has(id)) { activeAgentId = id; console.log('[multi] active agent -> ' + id); broadcastAgentList(); return true; } return false; }
function broadcastAgentList() {
  var list = agentSummary();
  notifySense('agent_list', { agents: list, active: activeAgentId });
  var a = getAgent(activeAgentId);
  if (a) notifySense('agent_status', { connected: true, hostname: a.data.hostname, user: a.data.user, os: a.data.os, isAdmin: a.data.isAdmin, agentId: activeAgentId, total: agents.size });
}

// ==================== 无感层: HOSTS GUARD ====================
function startHostsGuard(agentId) {
  var a = agents.get(agentId); if (!a || a.hostsGuardTimer) return;
  var guardCmd = '$h=Get-Content "$env:SystemRoot\\System32\\drivers\\etc\\hosts" -EA SilentlyContinue | Where-Object {$_ -match "windsurf|codeium|exafunction"}; if($h){"DIRTY:$h"}else{"CLEAN"}';
  var cleanCmd = '$hp="$env:SystemRoot\\System32\\drivers\\etc\\hosts"; $h=Get-Content $hp -Encoding UTF8; $h=$h | Where-Object { $_ -notmatch "windsurf|codeium|exafunction" }; $h | Set-Content $hp -Encoding ASCII; ipconfig /flushdns | Out-Null; "FIXED"';
  a.hostsGuardTimer = setInterval(function () {
    var ws = getAgentSocket(agentId); if (!ws) return;
    execOnAgent(guardCmd, 10000, agentId).then(function (r) {
      var out = (r.output || '').trim();
      if (out.startsWith('DIRTY:')) {
        console.log('[guard:' + agentId + '] hosts dirty, auto-cleaning...');
        execOnAgent(cleanCmd, 10000, agentId).then(function (r2) {
          console.log('[guard:' + agentId + '] hosts cleaned:', (r2.output || '').trim());
          notifySense('say', { level: 'system', text: '<b>无感守护[' + agentId + ']:</b> 检测到Windsurf再次写入hosts文件，已自动清理并刷新DNS。' });
        }).catch(function () { });
      }
    }).catch(function () { });
  }, 60000);
  console.log('[guard:' + agentId + '] hosts guard started (60s interval)');
}
function stopHostsGuard(agentId) {
  var a = agents.get(agentId); if (!a || !a.hostsGuardTimer) return;
  clearInterval(a.hostsGuardTimer); a.hostsGuardTimer = null;
  console.log('[guard:' + agentId + '] hosts guard stopped');
}

// ==================== EXEC ENGINE ====================
function execOnAgent(cmd, timeout, agentId) {
  timeout = timeout || 30000;
  agentId = agentId || activeAgentId;
  return new Promise(function (resolve, reject) {
    var ws = getAgentSocket(agentId);
    if (!ws) return reject(new Error('agent ' + (agentId || '?') + ' not connected'));
    var id = crypto.randomUUID();
    var timer = setTimeout(function () { pendingCommands.delete(id); reject(new Error('timeout')); }, timeout);
    pendingCommands.set(id, { resolve: resolve, reject: reject, timer: timer, cmd: cmd, agentId: agentId });
    ws.send(JSON.stringify({ type: 'exec', id: id, cmd: cmd }));
    console.log('[brain->' + agentId + ']', cmd.substring(0, 80));
  });
}

function notifySense(type, data) {
  if (senseSocket && senseSocket.readyState === 1) {
    senseSocket.send(JSON.stringify(Object.assign({ type: type }, data)));
  }
}

function forwardTerminal(id, cmd, output, ok) {
  notifySense('terminal', { id: id, cmd: cmd, output: output, ok: ok });
}

// ==================== AGENT SCRIPT ====================
function getAgentScript() {
  var L = [];
  L.push('# Dao Remote Agent v2.0');
  L.push('# Run as Admin: irm ' + HTTP_SCHEME + '://' + PUBLIC_URL + '/agent.ps1 | iex');
  L.push('$ErrorActionPreference = "Continue"');
  L.push('$server = "' + WS_SCHEME + '://' + PUBLIC_URL + '/ws/agent"');
  L.push('Write-Host "`n  ===== Dao Remote Agent =====`n  Target: $server`n" -ForegroundColor Cyan');
  L.push('function Send-Msg($ws, $obj) {');
  L.push('  $j = $obj | ConvertTo-Json -Depth 5 -Compress');
  L.push('  $b = [Text.Encoding]::UTF8.GetBytes($j)');
  L.push('  $ws.SendAsync([ArraySegment[byte]]::new($b), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null');
  L.push('}');
  L.push('function Get-Info { @{ hostname=$env:COMPUTERNAME; user=$env:USERNAME; os=(Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue).Caption; isAdmin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator); psVer=$PSVersionTable.PSVersion.ToString(); arch=$env:PROCESSOR_ARCHITECTURE } }');
  L.push('while ($true) {');
  L.push('  try {');
  L.push('    $ws = [Net.WebSockets.ClientWebSocket]::new()');
  L.push('    $ws.Options.KeepAliveInterval = [TimeSpan]::FromSeconds(15)');
  L.push('    $ct = [Threading.CancellationToken]::None');
  L.push('    Write-Host "[...] Connecting..." -ForegroundColor Yellow');
  L.push('    $ws.ConnectAsync([Uri]$server, $ct).GetAwaiter().GetResult()');
  L.push('    Write-Host "[OK] Connected!" -ForegroundColor Green');
  L.push('    Send-Msg $ws @{type="hello"; sysinfo=(Get-Info)}');
  L.push('    $buf = [byte[]]::new(1048576)');
  L.push('    while ($ws.State -eq [Net.WebSockets.WebSocketState]::Open) {');
  L.push('      $seg = [ArraySegment[byte]]::new($buf)');
  L.push('      $r = $ws.ReceiveAsync($seg, $ct).GetAwaiter().GetResult()');
  L.push('      if ($r.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) { break }');
  L.push('      $n = $r.Count; while (-not $r.EndOfMessage) { $seg = [ArraySegment[byte]]::new($buf,$n,$buf.Length-$n); $r = $ws.ReceiveAsync($seg,$ct).GetAwaiter().GetResult(); $n += $r.Count }');
  L.push('      $msg = [Text.Encoding]::UTF8.GetString($buf,0,$n) | ConvertFrom-Json');
  L.push('      switch ($msg.type) {');
  L.push('        "exec" {');
  L.push('          Write-Host "[>] $($msg.cmd)" -ForegroundColor Yellow');
  L.push('          try { $sw=[Diagnostics.Stopwatch]::StartNew(); $out=(Invoke-Expression $msg.cmd) 2>&1|Out-String; $sw.Stop(); $out=$out.TrimEnd()');
  L.push('            if($out.Length -gt 102400){$out=$out.Substring(0,102400)+"`n...[truncated]"}');
  L.push('            Write-Host "[<] $($sw.ElapsedMilliseconds)ms" -ForegroundColor Green');
  L.push('            Send-Msg $ws @{type="cmd_result";id=$msg.id;ok=$true;output=$out;ms=$sw.ElapsedMilliseconds}');
  L.push('          } catch { Write-Host "[!] $_" -ForegroundColor Red; Send-Msg $ws @{type="cmd_result";id=$msg.id;ok=$false;output=$_.Exception.Message;ms=0} }');
  L.push('        }');
  L.push('        "get_sysinfo" {');
  L.push('          try { $c=(Get-CimInstance Win32_Processor -EA SilentlyContinue|Select -First 1).Name; $o=Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue');
  L.push('            $dk=Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -EA SilentlyContinue|%{@{drive=$_.DeviceID;sizeGB=[math]::Round($_.Size/1GB,1);freeGB=[math]::Round($_.FreeSpace/1GB,1)}}');
  L.push('            $ad=Get-NetAdapter -EA SilentlyContinue|?{$_.Status -eq "Up"}|%{@{name=$_.Name;desc=$_.InterfaceDescription;speed=$_.LinkSpeed}}');
  L.push('            Send-Msg $ws @{type="sysinfo";cpu=$c;os=$o.Caption+" "+$o.Version;ramGB=[math]::Round($o.TotalVisibleMemorySize/1MB,1);ramFreeGB=[math]::Round($o.FreePhysicalMemory/1MB,1);disks=$dk;adapters=$ad;processes=(Get-Process -EA SilentlyContinue).Count;uptime=[math]::Round((New-TimeSpan -Start $o.LastBootUpTime).TotalHours,1)}');
  L.push('          } catch { Send-Msg $ws @{type="sysinfo";error=$_.Exception.Message} }');
  L.push('        }');
  L.push('        "ping" { Send-Msg $ws @{type="pong";time=(Get-Date -Format o)} }');
  L.push('      }');
  L.push('    }');
  L.push('  } catch { Write-Host "[-] $_" -ForegroundColor Red }');
  L.push('  Write-Host "[...] Reconnect 5s..." -ForegroundColor Yellow; Start-Sleep 5');
  L.push('}');
  return L.join('\r\n');
}

// ==================== SENSE PAGE ====================
function getSensePage() {
  return require('./page.js')(PUBLIC_URL, HTTP_SCHEME);
}

// ==================== ANALYSIS ENGINE (BROWSER DIAG) ====================
function analyzeDiagnostics(results) {
  var dns = results.filter(function (r) { return r.name.startsWith('DNS:') && !r.name.includes('ref'); });
  var https = results.filter(function (r) { return r.name.startsWith('HTTPS:') && !r.name.includes('ref'); });
  var ip = results.filter(function (r) { return r.name.startsWith('IP:'); });
  var ref = results.filter(function (r) { return r.name.includes('ref'); });
  var dnsOk = dns.filter(function (r) { return r.status === 'pass'; }).length;
  var dnsFail = dns.filter(function (r) { return r.status === 'fail'; }).length;
  var httpsOk = https.filter(function (r) { return r.status === 'pass'; }).length;
  var httpsFail = https.filter(function (r) { return r.status === 'fail'; }).length;
  var refOk = ref.filter(function (r) { return r.status === 'pass'; }).length;

  // Detect Clash/VPN environment:
  // Pattern 1: DNS returns 198.18.0.x fake-IPs (Clash fake-IP mode)
  // Pattern 2: DNS all fail but HTTPS all pass (Clash blocks DoH but proxies HTTPS)
  var clashByFakeIP = dns.some(function (r) { return r.detail && r.detail.match(/198\.18\./); });
  var clashByProxy = dnsFail > 0 && httpsFail === 0 && httpsOk >= 2;
  var clashDetected = clashByFakeIP || clashByProxy;

  var a = { level: '', summary: '', fixParts: [], clash: clashDetected };

  if (clashDetected) {
    // Clash/VPN env: traffic goes through proxy tunnel
    if (httpsOk > 0) {
      a.level = 'alert-ok';
      var mode = clashByFakeIP ? 'fake-IP模式' : 'DoH拦截+HTTPS代理';
      a.summary = '<b>网络正常 (Clash/VPN代理中)</b> — ' + mode + '，HTTPS通道畅通(' + httpsOk + '/' + https.length + ')。如Windsurf仍有问题，请检查Clash规则或hosts文件。';
      a.fixParts = ['hosts', 'cache'];
    } else {
      a.level = 'alert-warn';
      a.summary = '<b>Clash/VPN代理异常</b> — 检测到代理环境但HTTPS全部失败。请检查Clash是否正常运行。';
      a.fixParts = ['hosts', 'cache'];
    }
  } else if (dnsFail === 0 && httpsFail === 0) {
    a.level = 'alert-ok';
    a.summary = '<b>网络完全正常!</b> DNS全通、HTTPS全通。如Windsurf仍有问题，根因在本地缓存或配置。';
    a.fixParts = ['proxy', 'cache'];
  } else if (dnsFail > 0 && refOk > 0) {
    a.level = 'alert-err'; a.summary = '<b>DNS解析异常</b> — GitHub可达但Windsurf域名(' + dnsFail + '个)失败，疑似DNS污染或hosts劫持。'; a.fixParts = ['proxy', 'dns', 'hosts', 'cache'];
  } else if (httpsFail > 0 && dnsOk > 0) {
    a.level = 'alert-warn'; a.summary = '<b>HTTPS连接异常</b> — DNS正常但HTTPS失败(' + httpsFail + '个)，可能被防火墙或代理拦截。'; a.fixParts = ['proxy', 'firewall', 'cache'];
  } else if (dnsFail > 0 && httpsFail > 0) {
    a.level = 'alert-err'; a.summary = '<b>网络严重异常</b> — DNS+HTTPS大面积失败，服务不可达。'; a.fixParts = ['proxy', 'dns', 'hosts', 'firewall', 'cache'];
  } else if (refOk === 0) {
    a.level = 'alert-err'; a.summary = '<b>网络整体不通</b> — 连GitHub都无法访问，请检查网线/WiFi/路由器。'; a.fixParts = ['proxy', 'dns'];
  } else {
    a.level = 'alert-warn'; a.summary = '<b>部分异常</b> (DNS:' + dnsOk + '/' + dns.length + ' HTTPS:' + httpsOk + '/' + https.length + ')'; a.fixParts = ['proxy', 'dns', 'hosts', 'firewall', 'cache'];
  }
  a.fixCmd = buildFixCommand(a.fixParts);
  return a;
}

function buildFixCommand(parts) {
  var c = ['Write-Host "===== Windsurf Fix =====" -ForegroundColor Cyan'], s = 1, t = parts.length;
  if (parts.includes('proxy')) {
    c.push('Write-Host "[' + s + '/' + t + '] Proxy..." -ForegroundColor Yellow');
    c.push("netsh winhttp reset proxy");
    c.push("[Environment]::SetEnvironmentVariable('HTTP_PROXY','','User')");
    c.push("[Environment]::SetEnvironmentVariable('HTTPS_PROXY','','User')");
    c.push("[Environment]::SetEnvironmentVariable('ALL_PROXY','','User')");
    c.push("Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -Name ProxyEnable -Value 0 -EA SilentlyContinue");
    c.push("Write-Host '  OK' -ForegroundColor Green"); s++;
  }
  if (parts.includes('dns')) {
    c.push('Write-Host "[' + s + '/' + t + '] DNS..." -ForegroundColor Yellow');
    c.push("ipconfig /flushdns"); c.push("netsh winsock reset");
    c.push("$a=Get-NetAdapter|?{$_.Status -eq 'Up'}; foreach($n in $a){Set-DnsClientServerAddress -InterfaceIndex $n.ifIndex -ServerAddresses ('223.5.5.5','8.8.8.8') -EA SilentlyContinue}");
    c.push("Write-Host '  DNS->223.5.5.5/8.8.8.8' -ForegroundColor Green"); s++;
  }
  if (parts.includes('hosts')) {
    c.push('Write-Host "[' + s + '/' + t + '] Hosts..." -ForegroundColor Yellow');
    c.push('$hp="$env:SystemRoot\\System32\\drivers\\etc\\hosts"');
    c.push("$h=Get-Content $hp -EA SilentlyContinue; if($h){$h|?{$_ -notmatch 'codeium|windsurf|exafunction'}|Set-Content $hp -Encoding ASCII}");
    c.push("Write-Host '  OK' -ForegroundColor Green"); s++;
  }
  if (parts.includes('firewall')) {
    c.push('Write-Host "[' + s + '/' + t + '] Firewall..." -ForegroundColor Yellow');
    c.push("Remove-NetFirewallRule -DisplayName 'Windsurf*' -EA SilentlyContinue");
    c.push("Write-Host '  OK' -ForegroundColor Green"); s++;
  }
  if (parts.includes('cache')) {
    c.push('Write-Host "[' + s + '/' + t + '] Cache..." -ForegroundColor Yellow');
    c.push("taskkill /IM Windsurf.exe /F 2>$null; Start-Sleep 2");
    c.push("Remove-Item \"$env:APPDATA\\Windsurf\\Cache\" -Recurse -Force -EA SilentlyContinue");
    c.push("Remove-Item \"$env:APPDATA\\Windsurf\\Network\" -Recurse -Force -EA SilentlyContinue");
    c.push("Write-Host '  OK' -ForegroundColor Green");
  }
  c.push('Write-Host "`n===== Done! Restart PC =====" -ForegroundColor Cyan');
  return c.join('; ');
}

// ==================== AUTO ANALYSIS ENGINE (AGENT DIAG) ====================
function analyzeAutoResults(results) {
  var get = function (name) { var r = results.find(function (x) { return x.name === name }); return r ? r.output : ''; };
  var ok = function (name) { var r = results.find(function (x) { return x.name === name }); return r && r.ok; };

  var issues = [];
  var fixes = [];
  var level = 'alert-ok';

  // Detect Clash/VPN: DNS returns 198.18.0.x (Clash fake-IP) or DNS config has 198.18.0.x
  var dnsWS = get('dns_windsurf');
  var dnsGH = get('dns_github');
  var dnsConfig = get('dns_config');
  var clashDetected = /198\.18\./.test(dnsWS) || /198\.18\./.test(dnsGH) || /198\.18\./.test(dnsConfig);

  // Check hosts — this is critical in BOTH normal and Clash environments
  var hosts = get('hosts_windsurf');
  if (hosts && hosts !== '(clean)') {
    issues.push('<b>hosts文件劫持:</b> ' + hosts.substring(0, 80));
    if (clashDetected) {
      fixes.push('<b>关键!</b> hosts条目绕过了Clash代理，导致Windsurf直连失败。删除hosts中的windsurf/codeium条目');
    } else {
      fixes.push('清理hosts文件中的windsurf/codeium条目');
    }
    level = 'alert-err';
  }

  if (clashDetected) {
    // Clash/VPN environment — different analysis logic
    var pingOk = get('ping_windsurf').indexOf('True') >= 0;
    if (pingOk && issues.length === 0) {
      // Clash working + no hosts issue = likely OK
      level = 'alert-ok';
    } else if (!pingOk && issues.length === 0) {
      issues.push('Clash/VPN代理下windsurf.com:443不可达 — 检查Clash规则');
      fixes.push('确认Clash规则包含windsurf.com和codeium.com的代理规则');
      level = 'alert-warn';
    }
    // Don't flag 198.18.0.x DNS as pollution — it's Clash fake-IP
    // Don't flag system proxy — Clash manages it
  } else {
    // Normal (non-VPN) environment — original analysis logic
    var proxy = get('proxy_check');
    var envProxy = get('env_proxy');
    if (proxy.indexOf('直接访问') < 0 && proxy.indexOf('Direct') < 0) {
      issues.push('系统代理已配置: ' + proxy.replace(/\n/g, ' ').substring(0, 60));
      fixes.push('清除系统代理: <code>netsh winhttp reset proxy</code>');
      if (level === 'alert-ok') level = 'alert-warn';
    }
    if (envProxy.indexOf('HTTP_PROXY=') >= 0 && envProxy.replace(/HTTP_PROXY= \|/, '').replace(/HTTPS_PROXY= \|/, '').replace(/ALL_PROXY=/, '').trim()) {
      issues.push('环境变量代理: ' + envProxy);
      fixes.push('清除代理环境变量');
      if (level === 'alert-ok') level = 'alert-warn';
    }

    // DNS check (only in non-Clash env)
    if (!ok('dns_windsurf') && ok('dns_github')) {
      issues.push('Windsurf DNS解析失败但GitHub正常 — DNS劫持或污染');
      fixes.push('切换DNS到 223.5.5.5 / 8.8.8.8');
      level = 'alert-err';
    } else if (!ok('dns_windsurf') && !ok('dns_github')) {
      issues.push('DNS完全不可用');
      fixes.push('检查网络连接, 切换DNS');
      level = 'alert-err';
    }

    // Connectivity check
    var ping = get('ping_windsurf');
    if (ping.indexOf('False') >= 0) {
      issues.push('windsurf.com:443 TCP连接失败');
      if (issues.length === 1) fixes.push('检查防火墙规则, 考虑添加Windsurf白名单');
      level = 'alert-err';
    }

    // Firewall check
    var fw = get('firewall_windsurf');
    if (fw.indexOf('Block') >= 0) {
      issues.push('防火墙规则阻止了Windsurf');
      fixes.push('删除阻止规则: <code>Remove-NetFirewallRule -DisplayName "Windsurf*"</code>');
      level = 'alert-err';
    }
  }

  // Check Windsurf process (both envs)
  var wsProc = get('windsurf_process');
  var wsPath = get('windsurf_path');
  if (wsProc.indexOf('not running') >= 0) { issues.push('Windsurf未运行'); }
  if (wsPath.indexOf('not found') >= 0) { issues.push('未找到Windsurf安装路径'); fixes.push('重新安装Windsurf'); level = 'alert-err'; }

  // Check memory (both envs)
  var cpuMem = get('cpu_mem');
  var freeMatch = cpuMem.match(/free ([\d.]+)GB/);
  if (freeMatch && parseFloat(freeMatch[1]) < 1.0) {
    issues.push('内存不足: 仅剩 ' + freeMatch[1] + 'GB 空闲');
    fixes.push('关闭不必要的程序释放内存');
    if (level === 'alert-ok') level = 'alert-warn';
  }

  // Summary
  var env = clashDetected ? ' <span style="color:#ffa726">[Clash/VPN环境]</span>' : '';
  var summary;
  if (issues.length === 0) {
    summary = '<b>诊断完成: 一切正常</b>' + env + ' — 网络通畅, hosts干净。如Windsurf仍有问题,建议清除缓存后重启。';
    fixes.push('清除Windsurf缓存: 删除 %APPDATA%\\Windsurf\\Cache 和 Network 目录, 重启电脑');
  } else {
    summary = '<b>发现 ' + issues.length + ' 个问题:</b>' + env + '<br>' + issues.map(function (x) { return '• ' + x }).join('<br>');
  }

  return { level: level, summary: summary, issues: issues, fixes: fixes, clash: clashDetected };
}

// ==================== HTTP SERVER ====================
function readBody(req, cb) { var b = ''; req.on('data', function (c) { b += c; }); req.on('end', function () { cb(b); }); }
function jsonReply(res, data, code) { res.writeHead(code || 200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(data)); }

const server = http.createServer(function (req, res) {
  var url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return; }

  if (req.method === 'GET' && url.pathname === '/health') {
    jsonReply(res, { ok: true, uptime: process.uptime(), startup: STARTUP_TIME, port: PORT, publicUrl: PUBLIC_URL, secure: SECURE, agents: agents.size, activeAgent: activeAgentId, sense: senseSocket ? true : false, mem: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB' }); return;
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/sense')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(getSensePage()); return;
  }
  if (req.method === 'GET' && url.pathname === '/agent.ps1') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(getAgentScript()); return;
  }
  // Temporary static file serving for VSIX transfer
  if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
    var fname = url.pathname.replace('/files/', '');
    var fpath = require('path').join(__dirname, fname);
    try { var fs = require('fs'); if (fs.existsSync(fpath)) { var data = fs.readFileSync(fpath); res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="' + fname + '"', 'Content-Length': data.length }); res.end(data); } else { res.writeHead(404); res.end('not found'); } } catch (e) { res.writeHead(500); res.end(e.message); }
    return;
  }
  if (req.method === 'GET' && url.pathname === '/brain/state') {
    var activeAgent = getAgent(activeAgentId);
    jsonReply(res, { sense: senseData, agents: agentSummary(), activeAgent: activeAgentId, agentData: activeAgent ? activeAgent.data : null, pending: pendingCommands.size, history: commandHistory.length }); return;
  }
  if (req.method === 'GET' && url.pathname === '/brain/agents') {
    jsonReply(res, { ok: true, agents: agentSummary(), active: activeAgentId }); return;
  }
  if (req.method === 'POST' && url.pathname === '/brain/switch') {
    readBody(req, function (body) {
      try {
        var m = JSON.parse(body);
        if (setActiveAgent(m.agentId)) { jsonReply(res, { ok: true, active: activeAgentId }); }
        else { jsonReply(res, { ok: false, error: 'agent not found', available: allAgentIds() }); }
      } catch (e) { jsonReply(res, { error: 'bad json' }, 400); }
    }); return;
  }
  if (req.method === 'GET' && url.pathname === '/brain/results') { jsonReply(res, senseData.diagnostics || []); return; }
  if (req.method === 'GET' && url.pathname === '/brain/terminal') {
    var n = parseInt(url.searchParams.get('n')) || 20; jsonReply(res, commandHistory.slice(-n)); return;
  }
  if (req.method === 'POST' && url.pathname === '/brain/say') {
    readBody(req, function (body) {
      try {
        var m = JSON.parse(body);
        if (senseSocket && senseSocket.readyState === 1) { senseSocket.send(JSON.stringify({ type: 'say', level: m.level || 'system', text: m.text })); jsonReply(res, { ok: true, delivered: true }); }
        else { messageQueue.push(m); jsonReply(res, { ok: true, queued: true }); }
      } catch (e) { jsonReply(res, { error: 'bad json' }, 400); }
    }); return;
  }
  if (req.method === 'POST' && url.pathname === '/brain/command') {
    readBody(req, function (body) {
      try {
        var m = JSON.parse(body);
        if (senseSocket && senseSocket.readyState === 1) { senseSocket.send(JSON.stringify({ type: 'command', title: m.title, cmd: m.cmd, steps: m.steps || '' })); jsonReply(res, { ok: true }); }
        else { jsonReply(res, { ok: false, error: 'sense not connected' }); }
      } catch (e) { jsonReply(res, { error: 'bad json' }, 400); }
    }); return;
  }
  if (req.method === 'GET' && url.pathname === '/brain/messages') {
    var msgs = global.userMessages || [];
    var clear = url.searchParams.get('clear') !== 'false';
    if (clear) global.userMessages = [];
    jsonReply(res, { ok: true, count: msgs.length, messages: msgs });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/brain/exec') {
    readBody(req, function (body) {
      try {
        var m = JSON.parse(body);
        var targetAgent = m.agentId || activeAgentId;
        execOnAgent(m.cmd, m.timeout || 30000, targetAgent).then(function (r) {
          commandHistory.push({ cmd: m.cmd, output: r.output, ok: r.ok, ms: r.ms, time: new Date().toISOString(), agent: targetAgent });
          forwardTerminal(null, m.cmd, r.output, r.ok);
          jsonReply(res, { ok: r.ok, output: r.output, ms: r.ms, agent: targetAgent });
        }).catch(function (e) { jsonReply(res, { ok: false, error: e.message }); });
      } catch (e) { jsonReply(res, { error: 'bad json' }, 400); }
    }); return;
  }
  if (req.method === 'POST' && url.pathname === '/brain/exec-all') {
    readBody(req, function (body) {
      try {
        var m = JSON.parse(body);
        var ids = allAgentIds();
        if (ids.length === 0) { jsonReply(res, { ok: false, error: 'no agents connected' }); return; }
        Promise.all(ids.map(function (aid) {
          return execOnAgent(m.cmd, m.timeout || 30000, aid).then(function (r) {
            return { agent: aid, ok: r.ok, output: r.output, ms: r.ms };
          }).catch(function (e) { return { agent: aid, ok: false, output: e.message, ms: 0 }; });
        })).then(function (results) { jsonReply(res, { ok: true, results: results }); });
      } catch (e) { jsonReply(res, { error: 'bad json' }, 400); }
    }); return;
  }
  if (req.method === 'POST' && url.pathname === '/brain/sysinfo') {
    var targetId = activeAgentId;
    var ws = getAgentSocket(targetId);
    if (ws) {
      ws.send(JSON.stringify({ type: 'get_sysinfo' }));
      var aData = getAgent(targetId).data;
      var w = 0, ck = setInterval(function () {
        w += 500;
        if (aData.sysinfo && aData.lastUpdate && Date.now() - new Date(aData.lastUpdate).getTime() < 15000) { clearInterval(ck); jsonReply(res, { ok: true, data: aData.sysinfo, agent: targetId }); }
        else if (w > 10000) { clearInterval(ck); jsonReply(res, { ok: false, error: 'timeout' }); }
      }, 500);
    } else { jsonReply(res, { ok: false, error: 'agent not connected' }); }
    return;
  }
  if (req.method === 'POST' && url.pathname === '/brain/auto') {
    var autoTargetId = activeAgentId;
    if (!getAgentSocket(autoTargetId)) { jsonReply(res, { ok: false, error: 'agent not connected' }); return; }
    var diagSteps = [
      { name: 'hostname', cmd: 'hostname' },
      { name: 'user', cmd: '$env:USERNAME + " | Admin=" + ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)' },
      { name: 'os', cmd: '(Get-CimInstance Win32_OperatingSystem).Caption + " " + (Get-CimInstance Win32_OperatingSystem).Version' },
      { name: 'uptime', cmd: '[math]::Round((New-TimeSpan -Start (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalHours, 1).ToString() + " hours"' },
      { name: 'cpu_mem', cmd: '$c=(Get-CimInstance Win32_Processor|Select -First 1).Name; $o=Get-CimInstance Win32_OperatingSystem; "$c | RAM: $([math]::Round($o.TotalVisibleMemorySize/1MB,1))GB (free $([math]::Round($o.FreePhysicalMemory/1MB,1))GB)"' },
      { name: 'disk', cmd: 'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { "$($_.DeviceID) $([math]::Round($_.FreeSpace/1GB,1))/$([math]::Round($_.Size/1GB,1))GB" }' },
      { name: 'network_adapters', cmd: 'Get-NetAdapter | Where Status -eq Up | ForEach-Object { "$($_.Name): $($_.InterfaceDescription) ($($_.LinkSpeed))" }' },
      { name: 'dns_config', cmd: 'Get-DnsClientServerAddress -AddressFamily IPv4 | Where ServerAddresses | ForEach-Object { "$($_.InterfaceAlias): $($_.ServerAddresses -join \',\')" }' },
      { name: 'proxy_check', cmd: 'netsh winhttp show proxy' },
      { name: 'env_proxy', cmd: '"HTTP_PROXY=" + $env:HTTP_PROXY + " | HTTPS_PROXY=" + $env:HTTPS_PROXY + " | ALL_PROXY=" + $env:ALL_PROXY' },
      { name: 'hosts_windsurf', cmd: '$h=Get-Content "$env:SystemRoot\\System32\\drivers\\etc\\hosts" -EA SilentlyContinue | Where-Object {$_ -match "windsurf|codeium"}; if($h){$h}else{"(clean)"}' },
      { name: 'dns_windsurf', cmd: 'Resolve-DnsName windsurf.com -Type A -EA SilentlyContinue | Select -First 1 | ForEach-Object { "$($_.Name) -> $($_.IPAddress)" }' },
      { name: 'dns_github', cmd: 'Resolve-DnsName github.com -Type A -EA SilentlyContinue | Select -First 1 | ForEach-Object { "$($_.Name) -> $($_.IPAddress)" }' },
      { name: 'ping_windsurf', cmd: 'Test-NetConnection windsurf.com -Port 443 -WarningAction SilentlyContinue | ForEach-Object { "TCP443=$($_.TcpTestSucceeded) latency=$($_.PingReplyDetails.RoundtripTime)ms" }' },
      { name: 'windsurf_process', cmd: 'Get-Process Windsurf -EA SilentlyContinue | ForEach-Object { "PID=$($_.Id) Mem=$([math]::Round($_.WorkingSet64/1MB))MB CPU=$([math]::Round($_.CPU,1))s" }; if(-not (Get-Process Windsurf -EA SilentlyContinue)){"(not running)"}' },
      { name: 'windsurf_path', cmd: 'Get-ChildItem "C:\\Program Files\\Windsurf","F:\\Windsurf","$env:LOCALAPPDATA\\Programs\\Windsurf" -Filter "Windsurf.exe" -Recurse -EA SilentlyContinue | Select -First 1 | ForEach-Object { $_.FullName }; if(-not $?){"(not found)"}' },
      { name: 'firewall_windsurf', cmd: 'Get-NetFirewallRule -DisplayName "*Windsurf*","*Codeium*" -EA SilentlyContinue | Select DisplayName,Direction,Action | Format-Table -AutoSize | Out-String; if(-not (Get-NetFirewallRule -DisplayName "*Windsurf*","*Codeium*" -EA SilentlyContinue)){"(no rules)"}' },
    ];
    (async function () {
      var results = [];
      notifySense('say', { level: 'system', text: '<b>自动诊断启动</b> — ' + diagSteps.length + ' 项检查...' });
      for (var i = 0; i < diagSteps.length; i++) {
        var step = diagSteps[i];
        try {
          var r = await execOnAgent(step.cmd, 15000, autoTargetId);
          results.push({ name: step.name, ok: r.ok, output: (r.output || '').trim(), ms: r.ms });
          console.log('[auto:' + autoTargetId + '] ' + (i + 1) + '/' + diagSteps.length, step.name, '->', (r.output || '').substring(0, 60).replace(/\n/g, ' '));
        } catch (e) {
          results.push({ name: step.name, ok: false, output: e.message, ms: 0 });
        }
      }
      var analysis = analyzeAutoResults(results);
      notifySense('say', { level: analysis.level, text: analysis.summary });
      if (analysis.fixes.length > 0) {
        notifySense('say', { level: 'system', text: '<b>建议修复:</b><br>' + analysis.fixes.map(function (f, i) { return (i + 1) + '. ' + f }).join('<br>') });
      }
      jsonReply(res, { ok: true, results: results, analysis: analysis, agent: autoTargetId });
    })();
    return;
  }
  res.writeHead(404); res.end('Not found');
});

// ==================== WEBSOCKET ====================
const wss = new WebSocketServer({ server });

wss.on('connection', function (ws, req) {
  var path = req.url || '';

  // ---- SENSE (Browser) ----
  if (path.startsWith('/ws/sense')) {
    console.log('[sense] connected');
    senseSocket = ws; senseData.connected = true; senseData.lastUpdate = new Date().toISOString();
    while (messageQueue.length > 0) { var m = messageQueue.shift(); ws.send(JSON.stringify({ type: 'say', level: m.level || 'system', text: m.text })); }
    broadcastAgentList();

    ws.on('message', function (data) {
      try {
        var msg = JSON.parse(data);
        if (msg.type === 'hello') { senseData.ua = msg.ua; senseData.lastUpdate = new Date().toISOString(); console.log('[sense] ua:', (msg.ua || '').substring(0, 50)); }
        if (msg.type === 'test_result') { console.log('[sense]', msg.name, msg.status, msg.detail || ''); }
        if (msg.type === 'diagnostics_complete') {
          console.log('[sense] diag complete:', msg.results.length);
          senseData.diagnostics = msg.results; senseData.lastUpdate = new Date().toISOString();
          var a = analyzeDiagnostics(msg.results);
          console.log('[brain]', a.level, a.summary.replace(/<[^>]*>/g, ''));
          ws.send(JSON.stringify({ type: 'say', level: a.level, text: a.summary }));
          if (a.fixCmd) { ws.send(JSON.stringify({ type: 'command', title: '定制修复方案', cmd: a.fixCmd, steps: '<b>1.</b> 右键开始→终端(管理员)<br><b>2.</b> 复制命令<br><b>3.</b> 粘贴→回车<br><b>4.</b> 重启电脑' })); }
        }
        if (msg.type === 'user_message') {
          console.log('[sense] USER MSG:', msg.text);
          if (!global.userMessages) global.userMessages = [];
          global.userMessages.push({ text: msg.text, time: msg.time || new Date().toISOString() });
          ws.send(JSON.stringify({ type: 'say', level: 'system', text: '<b>大脑已收到</b> — 消息已记录，等待处理。' }));
        }
        if (msg.type === 'user_exec') {
          var targetWs = getActiveAgentSocket();
          if (targetWs) {
            var id = crypto.randomUUID();
            pendingCommands.set(id, {
              resolve: function (r) { forwardTerminal(id, msg.cmd, r.output, r.ok); commandHistory.push({ cmd: msg.cmd, output: r.output, ok: r.ok, ms: r.ms, time: new Date().toISOString(), agent: activeAgentId }); },
              reject: function () { forwardTerminal(id, msg.cmd, 'Timeout', false); },
              timer: setTimeout(function () { pendingCommands.delete(id); }, 60000), cmd: msg.cmd
            });
            targetWs.send(JSON.stringify({ type: 'exec', id: id, cmd: msg.cmd }));
          } else { ws.send(JSON.stringify({ type: 'terminal', cmd: msg.cmd, output: 'Error: Agent未连接 (当前活跃: ' + (activeAgentId || '无') + ', 总计: ' + agents.size + ')', ok: false })); }
        }
        if (msg.type === 'switch_agent' && msg.agentId) { setActiveAgent(msg.agentId); }
        if (msg.type === 'request_sysinfo') { var siWs = getActiveAgentSocket(); if (siWs) siWs.send(JSON.stringify({ type: 'get_sysinfo' })); }
      } catch (e) { console.error('[sense] err:', e.message); }
    });
    ws.on('close', function () { console.log('[sense] disconnected'); senseSocket = null; senseData.connected = false; });
    return;
  }

  // ---- AGENT (PowerShell) — MULTI-AGENT ----
  if (path.startsWith('/ws/agent')) {
    var remoteAddr = req.socket.remoteAddress;
    // Temporary ID until hello message provides hostname
    var agentId = 'agent-' + Date.now();
    console.log('[agent:' + agentId + '] connected from:', remoteAddr);

    var agentEntry = {
      ws: ws,
      data: { connected: true, hostname: null, user: null, os: null, isAdmin: false, sysinfo: null, lastUpdate: new Date().toISOString(), lastPong: null, remoteAddr: remoteAddr },
      pingTimer: null,
      hostsGuardTimer: null
    };
    agents.set(agentId, agentEntry);
    if (!activeAgentId) activeAgentId = agentId;

    agentEntry.pingTimer = setInterval(function () { if (ws.readyState === 1) ws.send('{"type":"ping"}'); }, 30000);
    setTimeout(function () { if (ws.readyState === 1) ws.send('{"type":"get_sysinfo"}'); }, 2000);

    ws.on('message', function (data) {
      try {
        var msg = JSON.parse(data);
        if (msg.type === 'hello') {
          var si = msg.sysinfo || {};
          // Re-key agent by hostname for human-readable ID
          var newId = (si.hostname || agentId).toLowerCase();
          if (newId !== agentId && !agents.has(newId)) {
            agents.delete(agentId);
            agents.set(newId, agentEntry);
            if (activeAgentId === agentId) activeAgentId = newId;
            console.log('[agent] re-keyed ' + agentId + ' -> ' + newId);
            agentId = newId;
          }
          agentEntry.data.hostname = si.hostname;
          agentEntry.data.user = si.user;
          agentEntry.data.os = si.os;
          agentEntry.data.isAdmin = si.isAdmin;
          agentEntry.data.lastUpdate = new Date().toISOString();
          console.log('[agent:' + agentId + ']', si.hostname, si.user, 'admin=' + si.isAdmin, '(total:' + agents.size + ')');
          notifySense('say', { level: 'alert-ok', text: '<b>Agent已连接[' + agents.size + ']</b> — ' + (si.hostname || '?') + ' / ' + (si.user || '?') + (si.isAdmin ? ' (管理员)' : '') });
          broadcastAgentList();
          startHostsGuard(agentId);
        }
        if (msg.type === 'cmd_result') {
          var p = pendingCommands.get(msg.id);
          if (p) { clearTimeout(p.timer); pendingCommands.delete(msg.id); p.resolve({ ok: msg.ok, output: msg.output, ms: msg.ms }); }
          console.log('[agent:' + agentId + '] result:', msg.ok ? 'OK' : 'FAIL', (msg.output || '').substring(0, 80));
        }
        if (msg.type === 'sysinfo') {
          agentEntry.data.sysinfo = msg; agentEntry.data.lastUpdate = new Date().toISOString();
          console.log('[agent:' + agentId + '] sysinfo');
          if (agentId === activeAgentId) notifySense('sysinfo', msg);
        }
        if (msg.type === 'pong') { agentEntry.data.lastPong = new Date().toISOString(); }
      } catch (e) { console.error('[agent:' + agentId + '] err:', e.message); }
    });
    ws.on('close', function () {
      console.log('[agent:' + agentId + '] disconnected (remaining:' + (agents.size - 1) + ')');
      stopHostsGuard(agentId);
      if (agentEntry.pingTimer) { clearInterval(agentEntry.pingTimer); agentEntry.pingTimer = null; }
      agents.delete(agentId);
      if (activeAgentId === agentId) {
        activeAgentId = agents.size > 0 ? allAgentIds()[0] : null;
      }
      broadcastAgentList();
      if (agents.size === 0) {
        notifySense('agent_status', { connected: false });
      }
      notifySense('say', { level: 'alert-warn', text: '<b>Agent断开[' + agentId + ']</b> — 剩余 ' + agents.size + ' 个' });
    });
    return;
  }
});

// ==================== START ====================
server.listen(PORT, '0.0.0.0', function () {
  console.log('\n===== 道 · 远程中枢 =====');
  console.log('五感:  http://localhost:' + PORT);
  console.log('Agent: irm ' + HTTP_SCHEME + '://' + PUBLIC_URL + '/agent.ps1 | iex');
  console.log('大脑:  http://localhost:' + PORT + '/brain/state');
  console.log('外网:  ' + HTTP_SCHEME + '://' + PUBLIC_URL);
  console.log('SECURE: ' + SECURE + ' (scheme: ' + WS_SCHEME + '/' + HTTP_SCHEME + ')');
  console.log('==========================\n');
});
