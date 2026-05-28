#!/usr/bin/env node
/**
 * dao_master.cjs · 道·万法归宗·总控制器 · 印215 · CDP五器圆满
 * ══════════════════════════════════════════════════════════════════════
 *
 *  「道生一，一生二，二生三，三生万物。」
 *  「天下之至柔，驰骋于天下之致坚；无有入于无间。」
 *  「无为而无不为。取天下，恒无事；及其有事也，不足以取天下。」
 *
 *  本文件是 Windsurf 底层全链路总控制器。
 *  在任意装有 Windsurf 的机器上，无需任何前端操作，
 *  可自动完成：
 *    · 发现 Windsurf LSP 实例（本地 / 远程）
 *    · 从进程内存提取 CSRF token（MiniDump + 暴力验证）
 *    · 管理全链路基础设施（Router/Bridge/Gateway 启停）
 *    · 以编程方式驱动 Cascade 对话（创建/发送/轮询/流式）
 *    · 实时监控全链路状态
 *    · 路由模型到任意第三方后端
 *    · 远程操作任意机器（WinRM）
 *    · 暴露 HTTP API 供外部集成
 *
 *  用法:
 *    node dao_master.cjs status                  - 全链路状态
 *    node dao_master.cjs ensure                  - 确保基础设施启动
 *    node dao_master.cjs csrf                    - 提取/刷新 CSRF token
 *    node dao_master.cjs chat "你好"              - 单次对话
 *    node dao_master.cjs chat "问题" --model gpt-4.1
 *    node dao_master.cjs monitor                 - 实时监控（持续）
 *    node dao_master.cjs server [port]           - HTTP API 服务器模式
 *    node dao_master.cjs cdprun "任务"             - CDP提交+等待+回收响应
 *    node dao_master.cjs cdp "任务" --wait         - cdprun 的别名（等待模式）
 *    node dao_master.cjs cdptabs                  - 列出所有Windsurf可调试tab
 *    node dao_master.cjs cdpquota                 - 检测配额耗尽状态
 *    node dao_master.cjs cdpkill                  - 中断当前正在生成的任务
 *    node dao_master.cjs cdpstream "任务"          - 发送+实时流式回收响应
 *    node dao_master.cjs remote 192.168.31.179 status
 *    node dao_master.cjs remote 192.168.31.179 chat "你好"
 *    node dao_master.cjs remote 192.168.31.179 ensure
 *    node dao_master.cjs route list              - 查看路由配置
 *    node dao_master.cjs route set MODEL_GPT_4O_MINI gpt-4.1-mini
 *
 *  零外部依赖 · Node 18+ · Windows/Linux
 *  2026-05-27 · 道法自然 · 五器圆满 → 万法归宗
 *
 *  v216 万法归宗（在v215基础上）：
 *    · cdpSession      → 通用持久 CDP WebSocket 会话（任意命令）
 *    · cdpProbe        → 深度探测 renderer 上下文（globals/AMD/React）
 *    · cdpScreenshot   → Page.captureScreenshot，截取 Windsurf 窗口
 *    · cdpVSCommand    → 执行任意 VS Code 命令（AMD服务 + 键盘降级）
 *    · cdpNetworkCapture → 监听 CDP Network 域，捕获全部请求
 *    · cdpGetEditorState → 读取编辑器状态（开启文件/tab/状态栏）
 *    · cdpTerminalRun  → 在集成终端执行命令，回收输出（全系统控制）
 *    · cdpOpenFile     → 在编辑器中打开任意文件
 *    · cdpConsoleCapture → 捕获渲染器 console 输出
 *    · 新增 HTTP 端点：/cdp/probe /cdp/screenshot /cdp/vscommand
 *                      /cdp/terminal /cdp/network /cdp/editor /cdp/console
 *    · 无为而无不为 · 道法自然实现一切 · 取之尽锱铢，用之如泥沙
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const net  = require("net");
const crypto = require("crypto");
const os   = require("os");
const { execSync, spawn, exec } = require("child_process");

// ══════════════════════════════════════════════════════════════════════
// §0  常量与配置
// ══════════════════════════════════════════════════════════════════════

const VERSION  = "216.0.0";
const IS_WIN   = process.platform === "win32";
const HOME     = process.env.USERPROFILE || process.env.HOME || os.homedir();
const APPDATA  = process.env.APPDATA || path.join(HOME, "AppData", "Roaming");
const BYOK_DIR = path.join(HOME, ".codeium", "dao-byok");

const PATHS = {
  stateDb      : path.join(APPDATA, "Windsurf", "User", "globalStorage", "state.vscdb"),
  csrfCache    : path.join(HOME, "_csrf_found.txt"),
  apikeyCache  : path.join(HOME, "_dao_apikey.txt"),
  routerLog    : path.join(HOME, "dao_router_log.txt"),
  routerJs     : path.join(HOME, "dao_h2c_router.js"),
  bridgeJs     : path.join(HOME, "dao_8878_bridge.js"),
  gatewayJs    : path.join(BYOK_DIR, "gateway", "server.js"),
  configJson   : path.join(BYOK_DIR, "配置.json"),
  cascadeSession: path.join(HOME, "_dao_cascade_session.json"),  // 持久化 cascade 会话
  node         : path.join(HOME, "AppData", "Local", "ms-playwright-go", "1.50.1", "node.exe"),
};

const PORTS = { router: 8879, bridge: 8878, gateway: 11435 };
const WINDSURF_EXT_VERSION = "2.2.17";  // 统一常量 · 避免多处硬编码
const LSP_PORT_RANGE = [30000, 40000];
const SVC = "/exa.language_server_pb.LanguageServerService";

// ── 配额耗尽关键词（取插件实战词典之精华，精简多语言核心）──
//   用于 cdpQuotaCheck 在 banner / step 元素中文本兜底匹配
const EXHAUST_KEYWORDS = [
  "your included usage quota is exhausted",
  "your usage quota is exhausted",
  "quota is exhausted",
  "usage quota",
  "you've reached your usage limit",
  "you have reached your usage limit",
  "rate limit exceeded",
  "you have been rate limited",
  "credit limit",
  "out of credits",
  "monthly limit",
  "请求过于频繁",
  "配额已用完",
  "配额已耗尽",
  "已达到使用上限",
  "本月额度",
];

// 从 Windsurf settings.json 动态读取真实 apiServerUrl 端口
function readWindsurfApiPort() {
  try {
    const settingsPath = path.join(APPDATA, "Windsurf", "User", "settings.json");
    const s = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const url = s["codeium.apiServerUrl"] || "";
    const m = url.match(/:([0-9]{4,5})/);
    if (m) return parseInt(m[1]);
  } catch {}
  return PORTS.bridge; // 默认回退到 8878
}

// 懒加载真实路由器端口（Windsurf 实际使用的端口）
let _activeRouterPort = 0;
function activeRouterPort() {
  if (!_activeRouterPort) _activeRouterPort = readWindsurfApiPort();
  return _activeRouterPort;
}

// ══════════════════════════════════════════════════════════════════════
// §1  彩色日志
// ══════════════════════════════════════════════════════════════════════

const C = {
  r: s => `\x1b[31m${s}\x1b[0m`, g: s => `\x1b[32m${s}\x1b[0m`,
  y: s => `\x1b[33m${s}\x1b[0m`, b: s => `\x1b[36m${s}\x1b[0m`,
  w: s => `\x1b[1m${s}\x1b[0m`,  d: s => `\x1b[90m${s}\x1b[0m`,
  m: s => `\x1b[35m${s}\x1b[0m`,
};
const ts  = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`${C.d(ts())} ${a.join(" ")}`);
const ok  = (...a) => console.log(`${C.d(ts())} ${C.g("✓")} ${a.join(" ")}`);
const err = (...a) => console.log(`${C.d(ts())} ${C.r("✗")} ${a.join(" ")}`);
const inf = (...a) => console.log(`${C.d(ts())} ${C.b("·")} ${a.join(" ")}`);
const sep = (t="") => console.log(C.d("─".repeat(60)) + (t ? " "+C.w(t) : ""));

// ══════════════════════════════════════════════════════════════════════
// §2  HTTP 工具
// ══════════════════════════════════════════════════════════════════════

function httpGet(url, timeout = 5000) {
  return new Promise(r => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, { timeout }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => r({ s: res.statusCode, b: d }));
    }).on("error", e => r({ s: 0, b: e.message }))
      .on("timeout", function(){ this.destroy(); r({ s: 0, b: "timeout" }); });
  });
}

function httpPost(host, port, urlPath, body, headers = {}, timeout = 60000) {
  return new Promise(r => {
    const buf = typeof body === "string" ? Buffer.from(body) : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const opts = { hostname: host, port, path: urlPath, method: "POST", timeout,
      headers: { "content-length": buf.length, ...headers } };
    const req = http.request(opts, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(raw.toString()); } catch {}
        r({ s: res.statusCode, b: raw.toString(), j: json });
      });
    });
    req.on("error", e => r({ s: 0, b: e.message, j: null }));
    req.on("timeout", () => { req.destroy(); r({ s: 0, b: "timeout", j: null }); });
    req.write(buf);
    req.end();
  });
}

function lspRpc(port, csrf, apiKey, method, body, timeout = 60000) {
  const d = JSON.stringify(body);
  return httpPost("127.0.0.1", port, SVC + "/" + method, d, {
    "content-type": "application/json",
    "connect-protocol-version": "1",
    "x-codeium-csrf-token": csrf,
  }, timeout);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ══════════════════════════════════════════════════════════════════════
// §3  Windsurf 自动发现
// ══════════════════════════════════════════════════════════════════════

async function discoverLSP() {
  // 1. netstat 扫描 30000-40000 找 LISTEN 端口
  try {
    const out = execSync("netstat -ano", { encoding: "utf8", timeout: 5000 });
    const ports = [];
    for (const line of out.split("\n")) {
      const m = line.match(/127\.0\.0\.1:(\d{5})\s+.*LISTEN\s+(\d+)/);
      if (m) {
        const p = parseInt(m[1]);
        if (p >= LSP_PORT_RANGE[0] && p <= LSP_PORT_RANGE[1]) {
          ports.push({ port: p, pid: parseInt(m[2]) });
        }
      }
    }
    // 验证哪个是 LSP
    for (const { port, pid } of ports) {
      try {
        const cmd = execSync(
          `wmic process where "ProcessId=${pid}" get CommandLine /value`,
          { encoding: "utf8", timeout: 3000 }
        );
        if (cmd.includes("language_server")) return { port, pid };
      } catch {}
    }
    if (ports.length > 0) return ports[0];
  } catch {}
  return { port: 32661, pid: null };
}

function extractApiKey() {
  // 优先读缓存
  try {
    const k = fs.readFileSync(PATHS.apikeyCache, "utf8").trim();
    if (k && k.length > 50) return k;
  } catch {}
  // 从 state.vscdb 提取
  try {
    const buf = fs.readFileSync(PATHS.stateDb).toString("binary");
    const m = buf.match(/devin-session-token\$[a-zA-Z0-9._-]{100,500}/g);
    if (m && m.length > 0) {
      const k = m[m.length - 1];
      try { fs.writeFileSync(PATHS.apikeyCache, k); } catch {}
      return k;
    }
  } catch {}
  // sqlite3 fallback
  try {
    const k = execSync(
      `sqlite3 "${PATHS.stateDb}" "SELECT value FROM ItemTable WHERE key='codeium.apiKey'"`,
      { encoding: "utf8", timeout: 5000 }
    ).trim();
    if (k) return k;
  } catch {}
  return null;
}

function metaObj(apiKey) {
  return {
    ideName: "windsurf",
    extensionVersion: WINDSURF_EXT_VERSION,
    apiKey,
    locale: "zh-CN",
    ideVersion: WINDSURF_EXT_VERSION,
    requestId: String(Date.now()),
    sessionId: crypto.randomUUID(),
  };
}

// ══════════════════════════════════════════════════════════════════════
// §4  CSRF 内存提取
// ══════════════════════════════════════════════════════════════════════

async function extractCSRF(lspPort, apiKey) {
  // 1. 检查缓存
  try {
    const saved = JSON.parse(fs.readFileSync(PATHS.csrfCache, "utf8"));
    if (saved.csrf && saved.port === lspPort) {
      const hb = await lspRpc(lspPort, saved.csrf, apiKey, "Heartbeat",
        { metadata: metaObj(apiKey) }, 5000);
      if (hb.s === 200) {
        inf(`CSRF 缓存有效 ${C.d(saved.csrf.slice(0,8)+"...")}`);
        return saved.csrf;
      }
    }
  } catch {}

  inf("CSRF 缓存失效，启动内存提取...");

  // 2. 找 LSP PID
  let lspPid;
  try {
    const out = execSync(
      `netstat -ano | findstr ":${lspPort}.*LISTEN"`,
      { encoding: "utf8", shell: "cmd.exe" }
    );
    const m = out.match(/LISTENING\s+(\d+)/);
    if (m) lspPid = parseInt(m[1]);
  } catch {}

  if (!lspPid) {
    // 通过 wmic/PowerShell 找 language_server 进程
    try {
      let out;
      try {
        out = execSync(
          `wmic process where "name='language_server_windows_x64.exe'" get ProcessId /value`,
          { encoding: "utf8", shell: "cmd.exe" }
        );
      } catch {}
      if (!out || out.includes("is not recognized")) {
        out = execSync(
          `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'language_server_windows_x64.exe'} | Select-Object -ExpandProperty ProcessId"`,
          { encoding: "utf8" }
        );
        out = out.trim().split("\n").map(l => l.trim()).filter(l => /^\d+$/.test(l))
          .map(p => `ProcessId=${p}`).join("\n");
      }
      const m = out.match(/ProcessId=(\d+)/);
      if (m) lspPid = parseInt(m[1]);
    } catch {}
  }

  if (!lspPid) { err("无法找到 LSP 进程 PID"); return null; }
  inf(`LSP PID=${lspPid}`);

  // 3. MiniDump
  const dumpPath = path.join(HOME, `_lsp_csrf_${lspPid}.dmp`);
  try { fs.unlinkSync(dumpPath); } catch {}

  try {
    execSync(
      `rundll32.exe comsvcs.dll, MiniDump ${lspPid} "${dumpPath}" full`,
      { timeout: 30000, shell: true }
    );
    await sleep(2000);
  } catch (e) {
    // PowerShell 提权
    try {
      execSync(
        `powershell -NoProfile -Command "& {rundll32.exe comsvcs.dll, MiniDump ${lspPid} '${dumpPath}' full}"`,
        { timeout: 30000 }
      );
      await sleep(2000);
    } catch {}
  }

  if (!fs.existsSync(dumpPath)) {
    err("MiniDump 失败（需要管理员权限）");
    // 尝试 PowerShell Task Scheduler 提权方式
    return await extractCSRFviaPowerShell(lspPid, lspPort, apiKey);
  }

  // 4. 分块扫描 UUID v4
  const uuids = new Set();
  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;
  const CHUNK = 10 * 1024 * 1024;
  const fd = fs.openSync(dumpPath, "r");
  const buf = Buffer.alloc(CHUNK);
  let bytes;
  while ((bytes = fs.readSync(fd, buf, 0, CHUNK)) > 0) {
    const text = buf.toString("ascii", 0, bytes);
    let m;
    while ((m = uuidRe.exec(text)) !== null) uuids.add(m[0]);
    if (bytes < CHUNK) break;
  }
  fs.closeSync(fd);
  try { fs.unlinkSync(dumpPath); } catch {}

  inf(`UUID 候选: ${uuids.size} 个`);

  // 5. 批量暴力验证
  const arr = [...uuids];
  for (let i = 0; i < arr.length; i += 30) {
    const batch = arr.slice(i, i + 30);
    const results = await Promise.all(
      batch.map(u => lspRpc(lspPort, u, apiKey, "Heartbeat",
        { metadata: metaObj(apiKey) }, 3000))
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].s === 200) {
        const csrf = batch[j];
        fs.writeFileSync(PATHS.csrfCache,
          JSON.stringify({ csrf, port: lspPort, ts: new Date().toISOString() }));
        ok(`CSRF 提取成功: ${C.y(csrf.slice(0,8)+"...")} (${i+j+1}/${arr.length})`);
        return csrf;
      }
    }
    if (i % 150 === 0 && i > 0) process.stdout.write(".");
  }
  process.stdout.write("\n");

  err(`CSRF 提取失败 (${arr.length} 个候选全部无效)`);
  return null;
}

async function extractCSRFviaPowerShell(lspPid, lspPort, apiKey) {
  // 通过计划任务以 SYSTEM 权限执行 dump
  inf("尝试通过 PowerShell 计划任务提权 dump...");
  const dumpPath = path.join(HOME, `_lsp_csrf_sys.dmp`);
  const psScript = `
    $job = Register-ScheduledTask -TaskName "_dao_dump_${lspPid}" -Action (
      New-ScheduledTaskAction -Execute "rundll32.exe" -Argument "comsvcs.dll, MiniDump ${lspPid} \\"${dumpPath.replace(/\\/g, "\\\\")}\\" full"
    ) -RunLevel Highest -Force
    Start-ScheduledTask -TaskName "_dao_dump_${lspPid}"
    Start-Sleep 5
    Unregister-ScheduledTask -TaskName "_dao_dump_${lspPid}" -Confirm:$false
  `.trim();
  try {
    execSync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`,
      { timeout: 30000 });
    await sleep(3000);
  } catch {}

  if (!fs.existsSync(dumpPath)) {
    err("提权 dump 也失败");
    return null;
  }

  const uuids = new Set();
  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;
  const CHUNK = 10 * 1024 * 1024;
  const fd = fs.openSync(dumpPath, "r");
  const buf = Buffer.alloc(CHUNK);
  let bytes;
  while ((bytes = fs.readSync(fd, buf, 0, CHUNK)) > 0) {
    const text = buf.toString("ascii", 0, bytes);
    let m;
    while ((m = uuidRe.exec(text)) !== null) uuids.add(m[0]);
    if (bytes < CHUNK) break;
  }
  fs.closeSync(fd);
  try { fs.unlinkSync(dumpPath); } catch {}

  const arr = [...uuids];
  for (let i = 0; i < arr.length; i += 30) {
    const batch = arr.slice(i, i + 30);
    const results = await Promise.all(
      batch.map(u => lspRpc(lspPort, u, apiKey, "Heartbeat",
        { metadata: metaObj(apiKey) }, 3000))
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].s === 200) {
        const csrf = batch[j];
        fs.writeFileSync(PATHS.csrfCache,
          JSON.stringify({ csrf, port: lspPort, ts: new Date().toISOString() }));
        ok(`CSRF 提权提取成功: ${C.y(csrf.slice(0,8)+"...")} (${i+j+1}/${arr.length})`);
        return csrf;
      }
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// §5  基础设施管理
// ══════════════════════════════════════════════════════════════════════

async function healthCheck(port, timeout = 3000) {
  const r = await httpGet(`http://127.0.0.1:${port}/health`, timeout);
  if (r.s !== 200) return { alive: false };
  try { return { alive: true, ...JSON.parse(r.b) }; }
  catch { return { alive: true }; }
}

function getNodeExe() {
  if (fs.existsSync(PATHS.node)) return PATHS.node;
  return process.execPath;
}

function spawnDetached(script, cwd, args = []) {
  const node = getNodeExe();
  const p = spawn(node, [script, ...args], {
    cwd: cwd || path.dirname(script),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  p.unref();
  return p.pid;
}

function wmicOrPS(query) {
  // wmic 在新版 Windows 已弃用，优先 PowerShell 回退
  try {
    const out = execSync(query, { encoding: "utf8", timeout: 5000, shell: "cmd.exe" });
    if (out && !out.includes("is not recognized")) return out;
  } catch {}
  // PowerShell 回退（将 wmic 查询转为 Get-CimInstance）
  try {
    const psQuery = query
      .replace(/wmic process where .CommandLine like '([^']+)'. get ProcessId \/value/i,
        (_, pat) => `Get-CimInstance Win32_Process | Where-Object {$_.CommandLine -like '*${pat.replace(/%/g,'')}*'} | Select-Object -ExpandProperty ProcessId`);
    const out2 = execSync(`powershell -NoProfile -Command "${psQuery}"`,
      { encoding: "utf8", timeout: 5000 });
    // 标准化为 ProcessId=NNN 格式
    return out2.split("\n").map(l => l.trim()).filter(l => /^\d+$/.test(l))
      .map(p => `ProcessId=${p}`).join("\n");
  } catch {}
  return "";
}

function killByScript(pattern) {
  try {
    // 尝试 wmic，失败则 PowerShell
    let out;
    try {
      out = execSync(
        `wmic process where "CommandLine like '%${pattern}%'" get ProcessId /value`,
        { encoding: "utf8", timeout: 5000, shell: "cmd.exe" }
      );
    } catch {}
    if (!out || out.includes("is not recognized")) {
      out = execSync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object {$_.CommandLine -like '*${pattern}*'} | Select-Object -ExpandProperty ProcessId"`,
        { encoding: "utf8", timeout: 5000 }
      );
      out = out.split("\n").map(l => l.trim()).filter(l => /^\d+$/.test(l))
        .map(p => `ProcessId=${p}`).join("\n");
    }
    const pids = (out.match(/ProcessId=(\d+)/g) || [])
      .map(x => parseInt(x.split("=")[1])).filter(Boolean);
    for (const pid of pids) {
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
    return pids;
  } catch { return []; }
}

async function ensureRouter() {
  // 优先检查 Windsurf 实际使用的路由器端口
  const ap = activeRouterPort();
  const ha = await healthCheck(ap);
  if (ha.alive) {
    return { started: false, port: ap, routes: ha.router?.count || "?" };
  }
  // 再检查备用端口 8879
  if (ap !== PORTS.router) {
    const h2 = await healthCheck(PORTS.router);
    if (h2.alive) {
      return { started: false, port: PORTS.router, routes: h2.router?.count || "?" };
    }
  }
  // 两个端口都不可用，启动新路由器
  if (!fs.existsSync(PATHS.routerJs)) {
    err(`Router 脚本不存在: ${PATHS.routerJs}`);
    return { started: false, error: "missing" };
  }
  spawnDetached(PATHS.routerJs, HOME);
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    const h3 = await healthCheck(ap);
    if (h3.alive) {
      ok(`Router :${ap} 已启动 (routes=${h3.router?.count || "?"})`);
      return { started: true, port: ap };
    }
    const h4 = await healthCheck(PORTS.router);
    if (h4.alive) {
      ok(`Router :${PORTS.router} 已启动 (routes=${h4.router?.count || "?"})`);
      return { started: true, port: PORTS.router };
    }
  }
  err("Router 启动超时");
  return { started: false, error: "timeout" };
}

async function ensureBridge() {
  const h = await healthCheck(PORTS.bridge);
  if (h.alive) return { started: false };
  if (!fs.existsSync(PATHS.bridgeJs)) {
    err(`Bridge 脚本不存在: ${PATHS.bridgeJs}`);
    return { started: false, error: "missing" };
  }
  spawnDetached(PATHS.bridgeJs, HOME);
  for (let i = 0; i < 10; i++) {
    await sleep(2000);
    const h2 = await healthCheck(PORTS.bridge);
    if (h2.alive) { ok(`Bridge :${PORTS.bridge} 已启动`); return { started: true }; }
  }
  err("Bridge 启动超时");
  return { started: false, error: "timeout" };
}

async function ensureGateway() {
  const h = await healthCheck(PORTS.gateway);
  if (h.alive) return { started: false };
  if (!fs.existsSync(PATHS.gatewayJs)) {
    err(`Gateway 脚本不存在: ${PATHS.gatewayJs}`);
    return { started: false, error: "missing" };
  }
  spawnDetached(PATHS.gatewayJs, path.dirname(PATHS.gatewayJs));
  for (let i = 0; i < 10; i++) {
    await sleep(2000);
    const h2 = await healthCheck(PORTS.gateway);
    if (h2.alive) { ok(`Gateway :${PORTS.gateway} 已启动`); return { started: true }; }
  }
  err("Gateway 启动超时");
  return { started: false, error: "timeout" };
}

async function ensureAll() {
  sep("确保基础设施全部在线");
  const [r, b, g] = await Promise.all([
    ensureRouter(), ensureBridge(), ensureGateway()
  ]);
  // 使用真实活跃端口检查
  const ap = activeRouterPort();
  const [rha, rh0, bh, gh] = await Promise.all([
    healthCheck(ap),
    healthCheck(PORTS.router),
    healthCheck(PORTS.bridge),
    healthCheck(PORTS.gateway),
  ]);
  const rh = rha.alive ? rha : rh0;
  if (rh.alive)  ok(`Router :${ap} routes=${rh.router?.count || "?"}`);
  else           err(`Router 异常: :${ap} 和 :${PORTS.router} 均不可用`);
  if (bh.alive)  ok(`Bridge :${PORTS.bridge}`);
  else           err(`Bridge :${PORTS.bridge} 异常`);
  if (gh.alive)  ok(`Gateway :${PORTS.gateway}`);
  else           err(`Gateway :${PORTS.gateway} 异常 — 已尝试重启`);
  return {
    router  : { alive: rh.alive, routes: rh.router?.count },
    bridge  : { alive: bh.alive },
    gateway : { alive: gh.alive },
    ok: (rha.alive || rh0.alive) && bh.alive && gh.alive,
  };
}

async function restartRouter() {
  inf("重启 Router...");
  killByScript("dao_h2c_router");
  await sleep(5000); // TIME_WAIT
  return ensureRouter();
}

async function restartGateway() {
  inf("重启 Gateway...");
  killByScript("gateway/server");
  await sleep(2000);
  return ensureGateway();
}

// ══════════════════════════════════════════════════════════════════════
// §6  Cascade API
// ══════════════════════════════════════════════════════════════════════

async function cascadeStart(lspPort, csrf, apiKey) {
  const r = await lspRpc(lspPort, csrf, apiKey, "StartCascade", {
    metadata: metaObj(apiKey),
    ideAction: { openedFile: { relativePath: "dao_master.js" } },
  });
  if (r.s !== 200) return null;
  try { return r.j?.cascadeId || null; }
  catch { return null; }
}

/**
 * 持久化 cascade session 管理：必要时才创建新会话（避免积压）
 * Windsurf UI 模式：整个对话就用一个 cascadeId
 */
async function cascadeGetOrCreate(lspPort, csrf, apiKey, forceNew = false) {
  // 尝试读取缓存的 session
  if (!forceNew) {
    try {
      const saved = JSON.parse(fs.readFileSync(PATHS.cascadeSession, "utf8"));
      if (saved.cascadeId && saved.lspPort === lspPort) {
        // 验证 session 是否仍然有效
        const probe = await lspRpc(lspPort, csrf, apiKey, "GetCascadeTrajectory",
          { metadata: metaObj(apiKey), cascadeId: saved.cascadeId });
        if (probe.s === 200) {
          inf(`复用已有 cascade session: ${C.d(saved.cascadeId)}`);
          return { cascadeId: saved.cascadeId, stepOffset: saved.stepCount || 0, fresh: false };
        }
      }
    } catch {}
  }
  // 创建新 session
  const cascadeId = await cascadeStart(lspPort, csrf, apiKey);
  if (!cascadeId) return null;
  try {
    fs.writeFileSync(PATHS.cascadeSession, JSON.stringify({ cascadeId, lspPort, stepCount: 0, ts: Date.now() }));
  } catch {}
  return { cascadeId, stepOffset: 0, fresh: true };
}

/**
 * 更新持久化 session 的当前步骤数
 */
function cascadeUpdateSession(cascadeId, stepCount) {
  try {
    const saved = JSON.parse(fs.readFileSync(PATHS.cascadeSession, "utf8"));
    if (saved.cascadeId === cascadeId) {
      saved.stepCount = stepCount;
      fs.writeFileSync(PATHS.cascadeSession, JSON.stringify(saved));
    }
  } catch {}
}

async function cascadeSend(lspPort, csrf, apiKey, cascadeId, message, modelUid, mode = "conversational") {
  const body = {
    metadata: metaObj(apiKey),
    cascadeId,
    items: [{ chunk: { case: "text", value: message } }],
    cascadeConfig: {
      plannerConfig: {
        plannerTypeConfig: { case: mode },
        requestedModelUid: modelUid || "MODEL_GOOGLE_GEMINI_3_0_FLASH_LOW",
      },
    },
  };
  return lspRpc(lspPort, csrf, apiKey, "SendUserCascadeMessage", body);
}

async function cascadePoll(lspPort, csrf, apiKey, cascadeId, opts = {}) {
  const {
    maxWait = 360000,  // 默认 6分钟（LS 内存检索可能需要 2-3 分钟）
    interval = 3000,
    onStep,
    fromStep = 0,      // 只处理从该索引开始的新步骤（持久化会话时使用）
  } = opts;
  const deadline = Date.now() + maxWait;
  let lastStepCount = fromStep;

  let stallCount = 0;
  let lastStepSig = "";

  while (Date.now() < deadline) {
    await sleep(interval);
    const r = await lspRpc(lspPort, csrf, apiKey, "GetCascadeTrajectory",
      { metadata: metaObj(apiKey), cascadeId });
    if (r.s !== 200) continue;

    const steps = r.j?.trajectory?.steps || [];
    // 只关注 fromStep 之后的新步骤
    const newSteps = steps.slice(fromStep);
    if (steps.length > lastStepCount && onStep) {
      for (const s of steps.slice(lastStepCount)) onStep(s);
      lastStepCount = steps.length;
    }

    // 停滞检测：只看新步骤（fromStep 之后）
    const stepSig = newSteps.map(s => (s.type || "") + (s.status || "")).join("|");
    if (stepSig === lastStepSig) {
      stallCount++;
      const types = newSteps.map(s => (s.type || "").replace("CORTEX_STEP_TYPE_", ""));
      const stalled = types.every(t => t === "RETRIEVE_MEMORY" || t === "USER_INPUT" || t === "");
      // 连续 20 轮（60s）无变化且 gateway 离线，才判定为停滞
      if (stalled && stallCount >= 20) {
        const gh = await healthCheck(PORTS.gateway, 2000);
        if (!gh.alive) return { done: false, stalled: true, steps };
        inf(C.y(`  等待模型响应... (已 ${Math.round((Date.now() - (deadline - maxWait))/1000)}s, gateway online)`));
        stallCount = 0;
      }
    } else {
      stallCount = 0;
      lastStepSig = stepSig;
    }

    // 判断完成（只看新步骤）
    const done = newSteps.some(s =>
      s.status === "CORTEX_STEP_STATUS_DONE" &&
      (s.type?.includes("PLANNER") || s.type?.includes("WRITE") || s.type?.includes("CHECKPOINT"))
    );
    if (done) return { done: true, steps };

    // 判断错误（只看新步骤）
    const errored = newSteps.some(s =>
      s.type?.includes("ERROR") && s.status?.includes("DONE")
    );
    if (errored && newSteps.length > 1) return { done: false, error: true, steps };
  }

  return { done: false, timeout: true, steps: [] };
}

function extractText(steps) {
  for (const s of steps) {
    if (s.plannerResponse?.response) return s.plannerResponse.response;
    if (s.plannerResponse?.modifiedResponse) return s.plannerResponse.modifiedResponse;
    if (s.writeText?.text) return s.writeText.text;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// §6.5  Direct Gateway Chat — 绕过 cascade 队列，直接调 gateway
// ══════════════════════════════════════════════════════════════════════

/** Windsurf model UID → gateway 可用模型名映射 */
const GATEWAY_MODEL_MAP = {
  "MODEL_GOOGLE_GEMINI_3_0_FLASH_LOW":   "gpt-4o",
  "MODEL_GOOGLE_GEMINI_2_5_FLASH":       "gpt-4o",
  "MODEL_GOOGLE_GEMINI_2_5_PRO":         "gpt-4o",
  "MODEL_GPT_4O":                        "gpt-4o",
  "MODEL_GPT_4O_MINI":                   "github/gpt-4.1-mini",
  "MODEL_CLAUDE_4_SONNET":               "github/gpt-4.1",
  "MODEL_CLAUDE_3_5_SONNET_20241022":    "github/gpt-4.1",
  "MODEL_SWE_1_5":                       "github/gpt-4.1-mini",
};

/**
 * 直接调用 gateway /v1/chat/completions（无需 LSP/Cascade）
 * 已验证： gpt-4o 在道外接api网关 v1.0.0 上正常返回
 */
async function directGatewayChat(message, opts = {}) {
  const {
    model    = "MODEL_GOOGLE_GEMINI_3_0_FLASH_LOW",
    gwPort   = PORTS.gateway,
    maxTokens = 1000,
    system,
  } = opts;

  const gwModel = GATEWAY_MODEL_MAP[model] || "gpt-4o";
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: message });

  const body = JSON.stringify({ model: gwModel, messages, max_tokens: maxTokens });
  const r = await httpPost("127.0.0.1", gwPort, "/v1/chat/completions", body, {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(body)),
  }, 30000);

  if (r.s === 404) {
    // 尝试 fallback 模型
    const fallbackModel = gwModel.startsWith("github/") ? gwModel.replace("github/","") : `github/${gwModel}`;
    const body2 = JSON.stringify({ model: fallbackModel, messages, max_tokens: maxTokens });
    const r2 = await httpPost("127.0.0.1", gwPort, "/v1/chat/completions", body2, {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body2)),
    }, 30000);
    if (r2.s === 200) {
      const j = typeof r2.j === "object" ? r2.j : JSON.parse(r2.raw || "{}");
      const text = j.choices?.[0]?.message?.content || "";
      return { response: text, model: fallbackModel, gwPort, direct: true };
    }
  }

  if (r.s !== 200) throw new Error(`Gateway 对话失败: ${r.s} ${JSON.stringify(r.j || r.raw || "").slice(0, 120)}`);

  const j = typeof r.j === "object" ? r.j : JSON.parse(r.raw || "{}");
  const text = j.choices?.[0]?.message?.content || j.choices?.[0]?.delta?.content || "";
  if (!text) throw new Error(`Gateway 响应无文本: ${JSON.stringify(j).slice(0, 120)}`);
  inf(C.g(`  直达响应 (${gwModel}): `) + text.slice(0, 120));
  return { response: text, model: gwModel, gwPort, direct: true };
}

// ══════════════════════════════════════════════════════════════════════
// §6.6  Agentic Cascade — 真正 agentic 模式 (写文件/执行终端/工具链)
// ══════════════════════════════════════════════════════════════════════

/**
 * 真正的 agentic 模式 (plannerTypeConfig = "agentic")
 * 触发完整工具链：write_file · run_terminal · search_files · read_file
 * 强制 fresh session（不复用，避免 RETRIEVE_MEMORY 积压）
 * 这是代替用户前端一切操作的核心路径
 */
async function agenticCascade(task, opts = {}) {
  const {
    model    = "MODEL_CLAUDE_3_5_SONNET_20241022",
    maxWait  = 600000,
    openFile = "dao_master.cjs",
    lspPort  : lspP,
    csrf     : csrfT,
    apiKey   : apiK,
  } = opts;

  const { port: lspPort } = lspP ? { port: lspP } : await discoverLSP();
  const apiKey = apiK || extractApiKey();
  if (!apiKey) throw new Error("无法获取 API Key");

  const csrf = csrfT || await extractCSRF(lspPort, apiKey);
  if (!csrf) throw new Error("无法获取 CSRF token — 请先运行: node dao_master.cjs csrf");

  inf(`Agentic 模式 → ${C.b(model)} | LSP :${lspPort}`);

  // 强制 fresh session（清除缓存，避免积压导致的 GetChatMessage 不触发）
  try { fs.unlinkSync(PATHS.cascadeSession); } catch {}
  const meta = { ...metaObj(apiKey), requestId: String(Date.now()), sessionId: crypto.randomUUID() };

  const scR = await lspRpc(lspPort, csrf, apiKey, "StartCascade", {
    metadata: meta,
    ideAction: { openedFile: { relativePath: openFile } },
  });
  const cascadeId = scR.j?.cascadeId;
  if (!cascadeId) throw new Error(`StartCascade 失败 (${scR.s}) ${JSON.stringify(scR.j).slice(0,80)}`);
  inf(`CascadeId: ${C.d(cascadeId)} [fresh · agentic]`);

  // 基准步骤数
  const t0 = await lspRpc(lspPort, csrf, apiKey, "GetCascadeTrajectory",
    { metadata: meta, cascadeId });
  const baseSteps = (t0.j?.trajectory?.steps || []).length;

  // 发送 agentic 任务 (mode = "agentic")
  const sm = await cascadeSend(lspPort, csrf, apiKey, cascadeId, task, model, "agentic");
  if (sm.s !== 200) throw new Error(`SendMessage 失败: ${sm.s} ${JSON.stringify(sm.j).slice(0,80)}`);
  ok(`Agentic 任务已提交: "${task.slice(0, 80)}"`);

  // 轮询 (agentic 任务时间更长)
  const result = await cascadePoll(lspPort, csrf, apiKey, cascadeId, {
    maxWait,
    fromStep: baseSteps,
    interval: 4000,
    onStep: s => {
      const type   = (s.type   || "").replace("CORTEX_STEP_TYPE_",   "");
      const status = (s.status || "").replace("CORTEX_STEP_STATUS_", "");
      const toolName = s.toolCall?.toolName || s.toolUse?.name || "";
      const txt = s.plannerResponse?.response || s.writeText?.text || "";
      if (type !== "RETRIEVE_MEMORY" && type !== "USER_INPUT") {
        inf(`  [agentic] ${C.b(type)}/${status}` +
          (toolName ? ` tool=${toolName}` : "") +
          (txt ? ` → ${txt.slice(0, 100)}` : ""));
      }
    },
  });

  const response = extractText(result.steps.slice(baseSteps)) || "(agentic 任务已执行)";
  return { cascadeId, response, steps: result.steps, done: result.done, mode: "agentic" };
}

// ══════════════════════════════════════════════════════════════════════
// §6.7  agenticExec — 可靠的 agentic 执行（LLM生成脚本 + 本地直接执行）
// ══════════════════════════════════════════════════════════════════════

/**
 * 真正可靠的 agentic 执行路径:
 *   1. directGatewayChat → LLM 生成 PowerShell/Node.js 脚本
 *   2. 提取脚本内容
 *   3. 本地 execSync 执行（在目标机器上直接运行）
 *   4. 返回执行结果
 *
 * 优势: 不依赖 LSP agentic 模式 · 立即执行 · 100% 可靠
 * 场景: 写文件 · 运行命令 · 测试模块 · 操控 OS 一切
 */
async function agenticExec(task, opts = {}) {
  const {
    model      = "MODEL_GOOGLE_GEMINI_3_0_FLASH_LOW",
    shell      = IS_WIN ? "powershell" : "bash",
    maxTokens  = 2000,
    cwd        = HOME,
    timeout    = 60000,
    dryRun     = false,
  } = opts;

  inf(`AgenticExec → ${C.b(shell)} | task: ${task.slice(0, 80)}`);

  // §1 LLM 生成执行脚本
  const systemPrompt = IS_WIN
    ? `你是一个 Windows PowerShell 专家。用户给你一个任务，你只输出完成该任务的 PowerShell 脚本（无需解释，只输出代码块）。
脚本必须: 1) 完整可运行 2) 将结果写入标准输出 3) 用 # EXEC_RESULT: 标记关键结果行。
格式: \`\`\`powershell\n...脚本...\n\`\`\``
    : `你是一个 Linux Bash 专家。用户给你一个任务，你只输出完成该任务的 Bash 脚本（无需解释，只输出代码块）。
脚本必须: 1) 完整可运行 2) 将结果写入标准输出 3) 用 # EXEC_RESULT: 标记关键结果行。
格式: \`\`\`bash\n...脚本...\n\`\`\``;

  let scriptContent;
  try {
    const r = await directGatewayChat(task, { model, maxTokens, system: systemPrompt });
    // 提取代码块
    const codeMatch = r.response.match(/```(?:powershell|bash|sh|cmd)?\n([\s\S]+?)```/);
    scriptContent = codeMatch ? codeMatch[1].trim() : r.response.trim();
    inf(`  脚本生成 (${scriptContent.length}B): ${scriptContent.slice(0, 100)}...`);
  } catch (e) {
    throw new Error(`LLM 脚本生成失败: ${e.message}`);
  }

  if (dryRun) {
    return { script: scriptContent, stdout: "", stderr: "", exitCode: -1, dryRun: true };
  }

  // §2 执行脚本
  let stdout = "", stderr = "", exitCode = 0;
  try {
    if (IS_WIN && shell === "powershell") {
      // 写到临时文件执行（避免引号转义问题）
      const tmpFile = path.join(HOME, `_dao_exec_${Date.now()}.ps1`);
      fs.writeFileSync(tmpFile, scriptContent, "utf8");
      try {
        stdout = execSync(
          `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`,
          { encoding: "utf8", timeout, cwd, maxBuffer: 10 * 1024 * 1024 }
        );
      } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
      }
    } else {
      const tmpFile = path.join(HOME || "/tmp", `_dao_exec_${Date.now()}.sh`);
      fs.writeFileSync(tmpFile, scriptContent, "utf8");
      try {
        stdout = execSync(`bash "${tmpFile}"`, { encoding: "utf8", timeout, cwd, maxBuffer: 10 * 1024 * 1024 });
      } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
      }
    }
    ok(`AgenticExec 完成: ${stdout.slice(0, 200)}`);
  } catch (e) {
    stderr = e.stderr || e.message;
    exitCode = e.status || 1;
    err(`AgenticExec 错误: ${stderr.slice(0, 200)}`);
  }

  return { script: scriptContent, stdout, stderr, exitCode, shell, task };
}

// 高层对话接口：一句话完成完整对话
async function chat(message, opts = {}) {
  const {
    model     = "MODEL_GOOGLE_GEMINI_3_0_FLASH_LOW",
    maxWait   = 360000,  // 6分钟（适应 LS 内存检索的长时间）
    lspPort   : lspP,
    csrf      : csrfT,
    apiKey    : apiK,
  } = opts;

  // ① 优先直接调用 Gateway（没有 cascade 队列，一般在 5-15s 内有响应）
  if (!opts._forceCascade) {
    const gh = await healthCheck(PORTS.gateway, 3000);
    if (gh.alive) {
      try {
        inf(C.b(`直接模式`) + ` → Gateway :${PORTS.gateway}`);
        return await directGatewayChat(message, opts);
      } catch (e) {
        inf(C.y(`  Gateway 直接模式失败: ${e.message.slice(0,80)}，切换 Cascade...`));
      }
    }
  }

  // ② Cascade 回退路（Gateway 不可用时）
  const { port: lspPort } = lspP ? { port: lspP } : await discoverLSP();
  const apiKey = apiK || extractApiKey();
  if (!apiKey) throw new Error("无法获取 API Key");

  const csrf = csrfT || await extractCSRF(lspPort, apiKey);
  if (!csrf) throw new Error("无法获取 CSRF token");

  inf(`Cascade 模式 → ${C.b(model)} | LSP :${lspPort}`);

  // 复用已有 session，避免积压 LS 队列
  const sess = await cascadeGetOrCreate(lspPort, csrf, apiKey);
  if (!sess) throw new Error("StartCascade 失败");
  const { cascadeId, stepOffset: sessOffset } = sess;
  inf(`CascadeId: ${C.d(cascadeId)} (${sess.fresh ? "新建" : "复用"})`);

  // 发送前先获得当前最新步骤数（作为 offset）
  let stepOffset = sessOffset;
  try {
    const t0 = await lspRpc(lspPort, csrf, apiKey, "GetCascadeTrajectory",
      { metadata: metaObj(apiKey), cascadeId });
    stepOffset = (t0.j?.trajectory?.steps || []).length;
  } catch {}

  const sendR = await cascadeSend(lspPort, csrf, apiKey, cascadeId, message, model);
  if (sendR.s !== 200) throw new Error(`SendMessage 失败: ${sendR.s}`);

  let responseText = "";
  const result = await cascadePoll(lspPort, csrf, apiKey, cascadeId, {
    maxWait,
    fromStep: stepOffset,
    onStep: s => {
      const t = (s.type || "").replace("CORTEX_STEP_TYPE_", "");
      if (t !== "RETRIEVE_MEMORY" && t !== "USER_INPUT") {
        const txt = s.plannerResponse?.response || s.plannerResponse?.modifiedResponse || s.writeText?.text;
        if (txt) process.stdout.write(C.g("  » ") + txt.slice(0, 200) + "\n");
        else inf(`  Step: ${t} (${(s.status||"").replace("CORTEX_STEP_STATUS_","")})`);
      }
    }
  });

  if (result.stalled) {
    // Cascade 停滞：模型调用失败（最常见原因： Gateway 崩溃）
    const gh = await healthCheck(PORTS.gateway);
    if (!gh.alive) {
      err("Gateway 已崩溃，正在自动重启...");
      await restartGateway();
      await sleep(2000);
      // 重试一次
      const cascadeId2 = await cascadeStart(lspPort, csrf, apiKey);
      if (cascadeId2) {
        const sendR2 = await cascadeSend(lspPort, csrf, apiKey, cascadeId2, message, model);
        if (sendR2.s === 200) {
          inf("已重启 Gateway，重试对话...");
          const result2 = await cascadePoll(lspPort, csrf, apiKey, cascadeId2, { maxWait });
          const txt2 = extractText(result2.steps);
          if (txt2) return { cascadeId: cascadeId2, response: txt2, steps: result2.steps, done: result2.done, retried: true };
        }
      }
    }
    throw new Error(`Cascade 停滞：模型调用无响应。Gateway=${gh.alive?"online":"offline"}`);
  }
  // 保存最新步骤数
  cascadeUpdateSession(cascadeId, result.steps.length);

  responseText = extractText(result.steps.slice(stepOffset)) || "(无文本响应)";
  return { cascadeId, response: responseText, steps: result.steps, done: result.done };
}

// ══════════════════════════════════════════════════════════════════════
// §7  状态监控
// ══════════════════════════════════════════════════════════════════════

async function getStatus() {
  const { port: lspPort, pid: lspPid } = await discoverLSP();
  // 检查所有可能的路由器端口
  const ap = activeRouterPort();
  const ports = ap !== PORTS.router ? [ap, PORTS.router] : [PORTS.router];
  const [rh0, rh1, bh, gh] = await Promise.all([
    healthCheck(ports[0], 3000),
    ports[1] ? healthCheck(ports[1], 3000) : Promise.resolve({ alive: false }),
    healthCheck(PORTS.bridge, 3000),
    healthCheck(PORTS.gateway, 3000),
  ]);
  // 取存活的路由器
  const rh = rh0.alive ? { ...rh0, _port: ports[0] }
           : rh1.alive ? { ...rh1, _port: ports[1] }
           : { alive: false, _port: ports[0] };

  // 读路由日志最后5行
  let recentRoutes = [];
  try {
    const lines = fs.readFileSync(PATHS.routerLog, "utf8").split("\n");
    recentRoutes = lines.filter(l => l.includes("GCM") || l.includes("ROUTE") || l.includes("stream"))
      .slice(-5);
  } catch {}

  return {
    lsp     : { port: lspPort, pid: lspPid, alive: lspPort > 0 },
    router  : { port: rh._port || PORTS.router, alive: rh.alive,
                routes: rh.router?.count, routed: rh.router?.stats?.routed },
    bridge  : { port: PORTS.bridge, alive: bh.alive },
    gateway : { port: PORTS.gateway, alive: gh.alive },
    recentRoutes,
    ts: new Date().toISOString(),
  };
}

function printStatus(s) {
  sep("全链路状态");
  const icon = b => b ? C.g("●") : C.r("○");
  console.log(`  ${icon(s.lsp.alive)}  LSP           :${s.lsp.port}  PID=${s.lsp.pid || "?"}`);
  console.log(`  ${icon(s.bridge.alive)}  Bridge        :${s.bridge.port}`);
  console.log(`  ${icon(s.router.alive)}  Router(active):${s.router.port}  routes=${s.router.routes || "?"}  routed=${s.router.routed || 0}`);
  console.log(`  ${icon(s.gateway.alive)}  Gateway       :${s.gateway.port}`);
  if (s.recentRoutes.length > 0) {
    console.log(`\n  ${C.d("最近路由:")}`);
    for (const l of s.recentRoutes) console.log(`    ${C.d(l.trim().slice(0, 100))}`);
  }
  console.log();
}

async function monitorLoop(interval = 5000) {
  sep("实时监控 · Ctrl+C 退出");
  while (true) {
    const s = await getStatus();
    process.stdout.write("\x1B[2J\x1B[0f"); // clear
    printStatus(s);
    // 读最新路由日志
    try {
      const lines = fs.readFileSync(PATHS.routerLog, "utf8").split("\n");
      const recent = lines.slice(-20).filter(l => l.trim());
      console.log(C.d("  ─── 路由日志 (最近20行) ───"));
      for (const l of recent) console.log(`  ${C.d(l.slice(0, 120))}`);
    } catch {}
    await sleep(interval);
  }
}

// ══════════════════════════════════════════════════════════════════════
// §7.5  CSRF 守护进程 & 基础设施守护
// ══════════════════════════════════════════════════════════════════════

/** CSRF 守护：自动监控 LSP 端口变化，重新提取 CSRF，永不过期 */
async function csrfDaemon(opts = {}) {
  const { interval = 30000, onUpdate } = opts;
  let lastLspPort = 0;
  let running = true;
  ok(`CSRF 守护进程启动 (每${interval / 1000}s 检查)`);

  const check = async () => {
    try {
      const { port: lspPort } = await discoverLSP();
      if (!lspPort) return;
      const apiKey = extractApiKey();
      if (!apiKey) return;

      if (lspPort !== lastLspPort && lastLspPort !== 0) {
        inf(`CSRF守护: LSP 端口 ${lastLspPort} → ${lspPort}，重新提取...`);
        lastLspPort = lspPort;
        const newCsrf = await extractCSRF(lspPort, apiKey);
        if (newCsrf && onUpdate) onUpdate(newCsrf, lspPort);
        return;
      }
      lastLspPort = lspPort;

      if (fs.existsSync(PATHS.csrfCache)) {
        const cached = JSON.parse(fs.readFileSync(PATHS.csrfCache, "utf8"));
        if (cached.port !== lspPort) {
          inf(`CSRF守护: 端口不匹配 cached=${cached.port} current=${lspPort}，重新提取...`);
          const newCsrf = await extractCSRF(lspPort, apiKey);
          if (newCsrf && onUpdate) onUpdate(newCsrf, lspPort);
          return;
        }
        const hb = await lspRpc(lspPort, cached.csrf, apiKey, "Heartbeat",
          { metadata: metaObj(apiKey) }, 3000);
        if (hb.s !== 200) {
          inf("CSRF守护: CSRF 已失效，重新提取...");
          const newCsrf = await extractCSRF(lspPort, apiKey);
          if (newCsrf && onUpdate) onUpdate(newCsrf, lspPort);
        }
      } else {
        inf("CSRF守护: 无缓存，提取 CSRF...");
        await extractCSRF(lspPort, apiKey);
      }
    } catch (e) {
      inf(C.y(`CSRF守护: ${e.message.slice(0, 60)}`));
    }
  };

  await check();
  const timer = setInterval(async () => { if (running) await check(); }, interval);
  return { stop: () => { running = false; clearInterval(timer); ok("CSRF守护已停止"); }, check };
}

/** 基础设施守护：持续监控并自动重启 Router/Bridge/Gateway */
async function infraDaemon(opts = {}) {
  const { interval = 15000 } = opts;
  let running = true;
  ok(`基础设施守护进程启动 (每${interval / 1000}s 检查)`);

  const check = async () => {
    try {
      const [rh, bh, gh] = await Promise.all([
        healthCheck(activeRouterPort(), 3000),
        healthCheck(PORTS.bridge, 3000),
        healthCheck(PORTS.gateway, 3000),
      ]);
      if (!rh.alive) { inf("infraDaemon: Router 离线，重启..."); await ensureRouter(); }
      if (!bh.alive) { inf("infraDaemon: Bridge 离线，重启..."); await ensureBridge(); }
      if (!gh.alive) { inf("infraDaemon: Gateway 离线，重启..."); await ensureGateway(); }
    } catch (e) {
      inf(C.y(`infraDaemon: ${e.message.slice(0, 60)}`));
    }
  };

  await check();
  const timer = setInterval(async () => { if (running) await check(); }, interval);
  return { stop: () => { running = false; clearInterval(timer); ok("infraDaemon已停止"); }, check };
}

// ══════════════════════════════════════════════════════════════════════
// §7.8  CDP 直控 Windsurf 前端（真正的前端代替）
// ══════════════════════════════════════════════════════════════════════

/**
 * cdpCascadeSend — 通过 Chrome DevTools Protocol 直接控制 Windsurf IDE 前端
 *
 * 原理：
 *   1. 连接 Windsurf 开放的 CDP WebSocket (默认 :9222)
 *   2. 枚举 tabs，找到含 cascade 输入框的工作区窗口
 *   3. 通过 Runtime.evaluate 注入文字到 contenteditable div
 *   4. 遍历 React fiber 找到 onEnter 处理器 (uSs 组件)
 *   5. 构造完整 React SyntheticEvent 调用 onEnter → Cascade 提交
 *   6. 等待并返回执行状态
 *
 * @param {string} task   - 发给 Cascade 的任务文本
 * @param {object} opts   - { cdpHost, cdpPort, waitMs, tabHint }
 * @returns {Promise<{ok,tabId,submitted,inputEmpty,thinkingEls}>}
 */
async function cdpCascadeSend(task, opts = {}) {
  const {
    cdpHost  = "127.0.0.1",
    cdpPort  = 9222,
    waitMs   = 500,
    tabHint  = "",      // 空 = 自动选 workbench 主窗口
  } = opts;

  // ── §1 枚举 tabs ──────────────────────────────────────────────────
  const tabsRaw = await httpGet(`http://${cdpHost}:${cdpPort}/json`, 5000);
  if (tabsRaw.s !== 200) throw new Error(`CDP /json 失败: ${tabsRaw.s} ${(tabsRaw.b||"").substring(0,60)}`);
  const tabs = JSON.parse(tabsRaw.b).filter(t => t.type === "page" && t.webSocketDebuggerUrl);
  if (!tabs.length) throw new Error("CDP: 未找到可调试页面");

  // 优先级: tabHint匹配 → workbench主窗口 → 第一个page tab
  const target = (tabHint && tabs.find(t => (t.title || "").includes(tabHint)))
              || tabs.find(t => /workbench\.html/.test(t.url || ""))
              || tabs[0];
  const tabId  = target.id;

  // ── §2 CDP WebSocket 连接 + 单次 Runtime.evaluate ─────────────────
  const wsPath = `/devtools/page/${tabId}`;

  function cdpRawEval(expr) {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString("base64");
      let buf = Buffer.alloc(0), upgraded = false;
      const pending = {};
      const T = setTimeout(() => { s.destroy(); reject(new Error("CDP timeout")); }, 20000);
      const s = net.createConnection({ host: cdpHost, port: cdpPort });

      // 发送 masked WS 帧
      function wsSend(payload) {
        if (s.destroyed) return;
        const p  = Buffer.from(payload, "utf8");
        const mk = crypto.randomBytes(4);
        let h;
        if      (p.length < 126)   { h = Buffer.alloc(6);  h[0]=0x81; h[1]=0x80|p.length; mk.copy(h,2); }
        else if (p.length < 65536) { h = Buffer.alloc(8);  h[0]=0x81; h[1]=0xFE; h.writeUInt16BE(p.length,2); mk.copy(h,4); }
        else                       { h = Buffer.alloc(14); h[0]=0x81; h[1]=0xFF; h.writeBigUInt64BE(BigInt(p.length),2); mk.copy(h,10); }
        const mp = Buffer.alloc(p.length);
        for (let i=0; i<p.length; i++) mp[i] = p[i] ^ mk[i%4];
        s.write(Buffer.concat([h, mp]));
      }

      s.on("connect", () => {
        s.write([
          `GET ${wsPath} HTTP/1.1`, `Host: ${cdpHost}:${cdpPort}`,
          "Upgrade: websocket", "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`, "Sec-WebSocket-Version: 13", "", "",
        ].join("\r\n"));
      });

      s.on("data", d => {
        buf = Buffer.concat([buf, d]);
        if (!upgraded) {
          const hi = buf.indexOf("\r\n\r\n");
          if (hi < 0) return;
          if (!buf.slice(0, hi).toString().includes("101")) { s.destroy(); return reject(new Error("CDP: no 101")); }
          upgraded = true;
          buf = buf.slice(hi + 4);
          // 连接成功后立即发 eval 请求
          const msg = JSON.stringify({ id:1, method:"Runtime.evaluate",
            params:{ expression:expr, returnByValue:true, awaitPromise:true } });
          wsSend(msg);
        }
        // 解析 WS 帧
        while (buf.length >= 2) {
          const op  = buf[0] & 0x0f;
          let   pl  = buf[1] & 0x7f, off = 2;
          if (pl === 126) { if (buf.length < 4) break; pl = buf.readUInt16BE(2); off = 4; }
          else if (pl === 127) { if (buf.length < 10) break; pl = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + pl) break;
          const payload = buf.slice(off, off + pl);
          buf = buf.slice(off + pl);
          if (op === 8) { clearTimeout(T); s.destroy(); return; }
          if (op !== 1 && op !== 2) continue;
          let m; try { m = JSON.parse(payload.toString()); } catch { continue; }
          if (m.id === 1) {
            clearTimeout(T);
            s.destroy();
            resolve(m);
          }
        }
      });
      s.on("error", e => { clearTimeout(T); reject(e); });
    });
  }

  // ── §3 注入文本 + 调用 React onEnter（v215：Lexical适配 + 写入验证 + 重试3次） ─
  const js = `(async()=>{
    // 1. 找输入框：优先 Lexical 编辑器，再 contenteditable，再 role=textbox
    const el = document.querySelector('[data-lexical-editor="true"]')
            || document.querySelector('[contenteditable=true]')
            || document.querySelector('[role=textbox]');
    if (!el) return JSON.stringify({err:'NO_EL'});

    const isLexical = el.getAttribute('data-lexical-editor') === 'true';
    const taskText  = ${JSON.stringify(task)};
    const verifyKey = taskText.replace(/\\s/g,'').slice(0, Math.min(20, taskText.replace(/\\s/g,'').length));

    // 2. 鲁棒写入：清空 → insertText → 验证 → 失败重试3次
    let writeOk = false, writeAttempts = 0, writeErrors = [];
    for (let attempt = 1; attempt <= 3 && !writeOk; attempt++) {
      writeAttempts = attempt;
      try {
        el.focus();
        // 清空（兼容 Lexical 的 ZeroWidthSpace）
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        // beforeinput 事件（Lexical 必需）
        if (isLexical) {
          el.dispatchEvent(new InputEvent('beforeinput', {
            inputType:'insertText', data:taskText, bubbles:true, cancelable:true
          }));
        }
        document.execCommand('insertText', false, taskText);
        // dispatch input event（让 Lexical 状态更新）
        el.dispatchEvent(new InputEvent('input', { inputType:'insertText', data:taskText, bubbles:true }));
        await new Promise(r=>setTimeout(r, ${waitMs}));
        // 验证：实际 textContent 是否包含写入的关键字
        const after = (el.textContent || el.innerText || '').replace(/\\s/g,'');
        if (verifyKey && after.includes(verifyKey)) { writeOk = true; break; }
        if (!verifyKey && after.length > 0)         { writeOk = true; break; }
        writeErrors.push('attempt'+attempt+':got='+after.slice(0,30));
        // 失败：等150ms再试
        await new Promise(r=>setTimeout(r, 150));
      } catch(we) {
        writeErrors.push('attempt'+attempt+':'+we.message.slice(0,40));
      }
    }
    if (!writeOk) {
      return JSON.stringify({err:'WRITE_FAIL', writeAttempts, writeErrors,
        val:(el.textContent||'').substring(0,40), isLexical});
    }

    // 3. 遍历 React fiber 找 onEnter（Cascade 输入框的发送处理器）
    const fk = Object.keys(el).find(k => k.startsWith('__reactFiber'));
    if (!fk) return JSON.stringify({err:'NO_FIBER', writeAttempts, val:(el.textContent||'').substring(0,30), isLexical});
    let fiber = el[fk], called = [];
    while (fiber) {
      const p = fiber.memoizedProps || {};
      if (typeof p.onEnter === 'function') {
        const evt = {
          key:'Enter', code:'Enter', keyCode:13, which:13,
          shiftKey:false, ctrlKey:false, metaKey:false, altKey:false,
          bubbles:true, cancelable:true,
          preventDefault:()=>{}, stopPropagation:()=>{},
          nativeEvent:{ key:'Enter', keyCode:13, shiftKey:false, ctrlKey:false, metaKey:false, altKey:false },
          target:el, currentTarget:el, persist:()=>{}
        };
        try   { p.onEnter(evt); called.push('OK@' + String(fiber.type?.name||fiber.type).substring(0,15)); }
        catch (e2) { called.push('ERR:' + e2.message.substring(0,40)); }
        break;
      }
      fiber = fiber.return;
    }
    await new Promise(r=>setTimeout(r, 350));

    // 4. 状态采集（v215：使用插件实战 selector 而非脆弱 regex）
    const vAfter = (el.textContent||'').trim();
    let hasSquare = false, hasArrowUp = false;
    const submitBtns = document.querySelectorAll('button[type="submit"]');
    for (const btn of submitBtns) {
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (btn.querySelector('svg.lucide-square'))   hasSquare  = true;
      if (btn.querySelector('svg.lucide-arrow-up')) hasArrowUp = true;
    }
    const stepCount = document.querySelectorAll('[data-step-index]').length;
    // 兼容旧版本：如果新 selector 全失效，降级到 regex
    const thinkingLegacy = (hasSquare || hasArrowUp) ? 0 :
      [...document.querySelectorAll('*')].filter(e =>
        e.offsetParent && (e.className||'').match(/think|load|spin|generating/i)).length;

    return JSON.stringify({
      called, writeAttempts, isLexical,
      inputEmpty:!vAfter, val:vAfter.substring(0,40),
      hasSquare, hasArrowUp, stepCount, thinking:thinkingLegacy,
    });
  })()`;

  const result = await cdpRawEval(js);
  const val    = result?.result?.result?.value || result?.result?.value || "";
  let parsed   = {};
  try { parsed = JSON.parse(val); } catch {}

  if (parsed.err) {
    const detail = parsed.writeErrors ? ` [${parsed.writeErrors.join("; ")}]` : "";
    const extra = parsed.isLexical !== undefined ? ` lexical=${parsed.isLexical}` : "";
    throw new Error(`CDP cascade error: ${parsed.err}${detail}${extra} val=${(parsed.val || "").slice(0, 40)}`);
  }

  return {
    ok            : parsed.called?.some(c => c.startsWith("OK")),
    tabId,
    tabTitle      : target.title,
    submitted     : !!parsed.inputEmpty,
    inputEmpty    : !!parsed.inputEmpty,
    thinkingEls   : parsed.thinking || 0,
    called        : parsed.called || [],
    val           : parsed.val || "",
    // v215 新增字段
    writeAttempts : parsed.writeAttempts || 0,
    isLexical     : !!parsed.isLexical,
    hasSquare     : !!parsed.hasSquare,    // 提交后 stop 按钮是否出现 → 真正在生成
    hasArrowUp    : !!parsed.hasArrowUp,
    stepCount     : parsed.stepCount || 0,
  };
}

// ══════════════════════════════════════════════════════════════════════
// §7.9  CDP 公共工具（cdpEval / cdpCascadeWait / cdpCascadeRun）
// ══════════════════════════════════════════════════════════════════════

/**
 * cdpEval — 顶层 CDP Runtime.evaluate 执行器（纯 Node.js raw socket）
 * @param {string} host
 * @param {number} port
 * @param {string} tabId
 * @param {string} expr   - JS 表达式（awaitPromise=true）
 * @param {number} timeout
 * @returns {Promise<object>}  CDP 原始响应
 */
function cdpEval(host, port, tabId, expr, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const key    = crypto.randomBytes(16).toString("base64");
    const wsPath = `/devtools/page/${tabId}`;
    let buf = Buffer.alloc(0), upgraded = false;
    const T = setTimeout(() => { s.destroy(); reject(new Error("cdpEval timeout")); }, timeout);
    const s = net.createConnection({ host, port });

    function wsSend(payload) {
      if (s.destroyed) return;
      const p  = Buffer.from(payload, "utf8");
      const mk = crypto.randomBytes(4);
      let h;
      if      (p.length < 126)   { h = Buffer.alloc(6);  h[0]=0x81; h[1]=0x80|p.length; mk.copy(h,2); }
      else if (p.length < 65536) { h = Buffer.alloc(8);  h[0]=0x81; h[1]=0xFE; h.writeUInt16BE(p.length,2); mk.copy(h,4); }
      else                       { h = Buffer.alloc(14); h[0]=0x81; h[1]=0xFF; h.writeBigUInt64BE(BigInt(p.length),2); mk.copy(h,10); }
      const mp = Buffer.alloc(p.length);
      for (let i=0; i<p.length; i++) mp[i] = p[i] ^ mk[i%4];
      s.write(Buffer.concat([h, mp]));
    }

    s.on("connect", () => {
      s.write([
        `GET ${wsPath} HTTP/1.1`, `Host: ${host}:${port}`,
        "Upgrade: websocket", "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`, "Sec-WebSocket-Version: 13", "", "",
      ].join("\r\n"));
    });

    s.on("data", d => {
      buf = Buffer.concat([buf, d]);
      if (!upgraded) {
        const hi = buf.indexOf("\r\n\r\n");
        if (hi < 0) return;
        if (!buf.slice(0, hi).toString().includes("101")) {
          s.destroy(); return reject(new Error("cdpEval: no 101"));
        }
        upgraded = true;
        buf = buf.slice(hi + 4);
        wsSend(JSON.stringify({
          id: 1, method: "Runtime.evaluate",
          params: { expression: expr, returnByValue: true, awaitPromise: true },
        }));
      }
      while (buf.length >= 2) {
        const op = buf[0] & 0x0f;
        let   pl = buf[1] & 0x7f, off = 2;
        if (pl === 126) { if (buf.length < 4) break; pl = buf.readUInt16BE(2);  off = 4; }
        else if (pl === 127) { if (buf.length < 10) break; pl = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + pl) break;
        const payload = buf.slice(off, off + pl);
        buf = buf.slice(off + pl);
        if (op === 8) { clearTimeout(T); s.destroy(); return; }
        if (op !== 1 && op !== 2) continue;
        let m; try { m = JSON.parse(payload.toString()); } catch { continue; }
        if (m.id === 1) { clearTimeout(T); s.destroy(); resolve(m); }
      }
    });
    s.on("error", e => { clearTimeout(T); reject(e); });
  });
}

/**
 * cdpCascadeWait — 等待 Cascade 模型完成推理并回收响应文本（v215 五器圆满版）
 *
 * 原理（取插件实战 selector 之精华）：
 *   1) 提交按钮 svg.lucide-square    存在 → AI 正在生成
 *   2) 提交按钮 svg.lucide-arrow-up  存在 → AI 空闲（已完成）
 *   3) [data-step-index] 数量增加    → 有新消息步骤
 *   4) [data-step-index] 内 .prose   → AI 响应文本精确定位
 *   5) EXHAUST_KEYWORDS 命中         → 配额耗尽兜底
 *
 * 完成判定（任一）：
 *   A) 见过 square 且当前 arrowUp（生成→完成）
 *   B) 初始就 arrowUp（无thinking态），且抓到响应文本，再确认一轮
 *   C) 旧版 Windsurf 兼容：thinking regex 从有→无
 *
 * @param {string} tabId
 * @param {object} opts  { cdpHost, cdpPort, timeoutMs, pollMs, initialStepCount, onStream }
 * @returns {Promise<{completed, response, elapsedMs, quotaExhausted, stepCount, finalState}>}
 */
async function cdpCascadeWait(tabId, opts = {}) {
  const {
    cdpHost          = "127.0.0.1",
    cdpPort          = 9222,
    timeoutMs        = 90000,
    pollMs           = 2500,
    initialStepCount = 0,         // 提交前的 step 数（用于检测新增）
    onStream         = null,      // (text) => void  实时流回调
    quotaKeywords    = EXHAUST_KEYWORDS,
  } = opts;

  const QK_JSON = JSON.stringify(quotaKeywords);

  const stateExpr = `(()=>{
    // ── 1. 提交按钮状态（插件实战核心 selector）──
    let hasSquare = false, hasArrowUp = false;
    const submitBtns = document.querySelectorAll('button[type="submit"]');
    for (const btn of submitBtns) {
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (btn.querySelector('svg.lucide-square'))   hasSquare  = true;
      if (btn.querySelector('svg.lucide-arrow-up')) hasArrowUp = true;
    }
    // ── 2. step 计数 + 最新 prose 文本 ──
    const steps = document.querySelectorAll('[data-step-index]');
    let lastResponse = '';
    if (steps.length > 0) {
      // 取最后一个 step 内最长的 prose 文本块（AI 回复一般在最后step的 prose 中）
      const lastStep = steps[steps.length - 1];
      const proses   = lastStep.querySelectorAll('.prose, [class*=prose]');
      let best = '';
      for (const p of proses) {
        const t = (p.innerText || p.textContent || '').trim();
        if (t.length > best.length) best = t;
      }
      lastResponse = best;
    }
    // 兜底：若 prose 抓不到，退到广义消息选择器
    if (!lastResponse) {
      const msgs = [...document.querySelectorAll(
        '[class*=message],[class*=Message],[class*=response],[class*=Response],[class*=assistant]'
      )].map(el => (el.innerText||el.textContent||'').trim())
        .filter(t => t.length > 15);
      lastResponse = msgs[msgs.length - 1] || '';
    }
    // ── 3. 配额耗尽兜底检测 ──
    const KW = ${QK_JSON};
    let quotaExhausted = false, quotaText = '';
    // 扫描 step 元素和 banner 元素的可见文本
    const scanZones = [...steps, ...document.querySelectorAll(
      '[class*=banner],[class*=Banner],[class*=alert],[class*=Alert],[role=alert]'
    )];
    for (const z of scanZones) {
      const t = ((z.innerText || z.textContent || '') + '').toLowerCase();
      for (const kw of KW) {
        if (t.includes(kw.toLowerCase())) { quotaExhausted = true; quotaText = kw; break; }
      }
      if (quotaExhausted) break;
    }
    // ── 4. 兼容旧版 thinking regex（fallback only） ──
    const thinkingLegacy = (hasSquare || hasArrowUp) ? 0 :
      [...document.querySelectorAll('*')].filter(e =>
        e.offsetParent && (e.className||'').match(/think|load|spin|generat/i)).length;
    return JSON.stringify({
      hasSquare, hasArrowUp, stepCount: steps.length,
      lastResponse: lastResponse.slice(0, 4000),
      quotaExhausted, quotaText, thinkingLegacy,
    });
  })()`;

  const startedAt = Date.now();
  let lastResponse = "";
  let sawSquare    = false;
  let lastStream   = "";
  let prevThinking = -1;
  let prevStepCount= initialStepCount;
  let final = {};

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const r = await cdpEval(cdpHost, cdpPort, tabId, stateExpr, 8000);
      const v = r?.result?.result?.value || r?.result?.value || "{}";
      const state = JSON.parse(v);
      final = state;

      if (state.lastResponse) {
        lastResponse = state.lastResponse;
        // 实时流回调（每次内容有变化时）
        if (onStream && lastResponse !== lastStream) {
          try { onStream(lastResponse); } catch {}
          lastStream = lastResponse;
        }
      }

      // 配额耗尽 → 立即返回（避免无意义等待）
      if (state.quotaExhausted) {
        return {
          completed     : false,
          quotaExhausted: true,
          quotaKeyword  : state.quotaText,
          response      : lastResponse,
          elapsedMs     : Date.now() - startedAt,
          stepCount     : state.stepCount,
          finalState    : state,
        };
      }

      if (state.hasSquare) sawSquare = true;

      // 路径 A：见过 square (生成中)，现在 arrowUp 出现 → 完成
      if (sawSquare && state.hasArrowUp && !state.hasSquare) {
        // 再等一轮，让最后一段 prose 文本稳定
        await sleep(800);
        const r2 = await cdpEval(cdpHost, cdpPort, tabId, stateExpr, 5000);
        const s2 = JSON.parse(r2?.result?.result?.value || "{}");
        if (s2.lastResponse) lastResponse = s2.lastResponse;
        return {
          completed: true, response: lastResponse,
          elapsedMs: Date.now() - startedAt,
          stepCount: s2.stepCount || state.stepCount,
          finalState: s2,
        };
      }

      // 路径 B：初始 arrowUp + 有新增step + 有响应文本 → 大概率已完成
      if (!sawSquare && state.hasArrowUp &&
          state.stepCount > prevStepCount &&
          lastResponse.length > 15 && Date.now() - startedAt > pollMs * 2) {
        await sleep(pollMs);
        const r2 = await cdpEval(cdpHost, cdpPort, tabId, stateExpr, 5000);
        const s2 = JSON.parse(r2?.result?.result?.value || "{}");
        if (s2.lastResponse) lastResponse = s2.lastResponse;
        if (s2.hasArrowUp && !s2.hasSquare) {
          return {
            completed: true, response: lastResponse,
            elapsedMs: Date.now() - startedAt,
            stepCount: s2.stepCount || state.stepCount,
            finalState: s2,
          };
        }
      }

      // 路径 C：旧版 Windsurf 兼容（无 lucide selector）
      if (!state.hasSquare && !state.hasArrowUp) {
        if (prevThinking > 0 && state.thinkingLegacy === 0) {
          return {
            completed: true, response: lastResponse,
            elapsedMs: Date.now() - startedAt,
            stepCount: state.stepCount, finalState: state,
            mode: "legacyRegex",
          };
        }
        prevThinking = state.thinkingLegacy ?? prevThinking;
      }

      prevStepCount = Math.max(prevStepCount, state.stepCount || 0);
    } catch { /* CDP 临时失败，继续重试 */ }
    await sleep(pollMs);
  }

  return {
    completed     : false,
    response      : lastResponse,
    elapsedMs     : Date.now() - startedAt,
    stepCount     : final.stepCount || prevStepCount,
    finalState    : final,
    timedOut      : true,
  };
}

/**
 * cdpCascadeRun — CDP 高层 API：提交任务 + 等待完成 + 回收响应（一体化 v215）
 *
 * @param {string} task
 * @param {object} opts  { cdpHost, cdpPort, tabHint, waitMs, timeoutMs, onStream, pollMs }
 * @returns {Promise<{ok, submitted, completed, response, tabTitle, elapsedMs, quotaExhausted, stepCount}>}
 */
async function cdpCascadeRun(task, opts = {}) {
  const { cdpHost = "127.0.0.1", cdpPort = 9222, tabHint = "",
          waitMs = 500, timeoutMs = 90000, onStream = null, pollMs = 2500 } = opts;

  const sendResult = await cdpCascadeSend(task, { cdpHost, cdpPort, tabHint, waitMs });
  if (!sendResult.ok) return { ok: false, ...sendResult };

  const waitResult = await cdpCascadeWait(sendResult.tabId, {
    cdpHost, cdpPort, timeoutMs, pollMs, onStream,
    initialStepCount: sendResult.stepCount || 0,
  });
  return {
    ok            : true,
    submitted     : sendResult.submitted,
    completed     : waitResult.completed,
    response      : waitResult.response,
    tabTitle      : sendResult.tabTitle,
    tabId         : sendResult.tabId,
    elapsedMs     : waitResult.elapsedMs,
    called        : sendResult.called,
    // v215 新增字段
    writeAttempts : sendResult.writeAttempts,
    isLexical     : sendResult.isLexical,
    quotaExhausted: !!waitResult.quotaExhausted,
    quotaKeyword  : waitResult.quotaKeyword,
    stepCount     : waitResult.stepCount,
    timedOut      : !!waitResult.timedOut,
  };
}

// ══════════════════════════════════════════════════════════════════════
// §7.10  CDP 五器圆满（v215 新增四器：列举/查配额/中断/流式）
// ══════════════════════════════════════════════════════════════════════

/**
 * cdpEnumTabs — 列出所有 Windsurf 可调试 tab（含 workbench 标记）
 * @param {object} opts { cdpHost, cdpPort }
 * @returns {Promise<Array<{id,title,url,type,isWorkbench}>>}
 */
async function cdpEnumTabs(opts = {}) {
  const { cdpHost = "127.0.0.1", cdpPort = 9222 } = opts;
  const r = await httpGet(`http://${cdpHost}:${cdpPort}/json`, 5000);
  if (r.s !== 200) throw new Error(`CDP /json 失败: ${r.s}`);
  const all = JSON.parse(r.b);
  return all
    .filter(t => t.type === "page" && t.webSocketDebuggerUrl)
    .map(t => ({
      id          : t.id,
      title       : t.title || "",
      url         : t.url   || "",
      type        : t.type,
      isWorkbench : /workbench\.html/.test(t.url || ""),
    }));
}

/**
 * cdpQuotaCheck — 检测当前 Windsurf 是否配额耗尽
 * @param {object} opts { cdpHost, cdpPort, tabHint, keywords }
 * @returns {Promise<{quotaExhausted, quotaKeyword, tabTitle, scanned}>}
 */
async function cdpQuotaCheck(opts = {}) {
  const { cdpHost = "127.0.0.1", cdpPort = 9222, tabHint = "",
          keywords = EXHAUST_KEYWORDS } = opts;
  const tabs = await cdpEnumTabs({ cdpHost, cdpPort });
  if (!tabs.length) throw new Error("CDP: 无可调试 tab");
  const target = (tabHint && tabs.find(t => t.title.includes(tabHint)))
              || tabs.find(t => t.isWorkbench)
              || tabs[0];

  const KW_JSON = JSON.stringify(keywords);
  const expr = `(()=>{
    const KW = ${KW_JSON};
    const zones = [
      ...document.querySelectorAll('[data-step-index]'),
      ...document.querySelectorAll('[class*=banner],[class*=Banner],[class*=alert],[class*=Alert],[role=alert]'),
    ];
    let hit = '', scanned = 0;
    for (const z of zones) {
      scanned++;
      const t = ((z.innerText || z.textContent || '') + '').toLowerCase();
      for (const kw of KW) { if (t.includes(kw.toLowerCase())) { hit = kw; break; } }
      if (hit) break;
    }
    return JSON.stringify({ hit, scanned });
  })()`;

  const r = await cdpEval(cdpHost, cdpPort, target.id, expr, 8000);
  const v = r?.result?.result?.value || "{}";
  const s = JSON.parse(v);
  return {
    quotaExhausted: !!s.hit,
    quotaKeyword  : s.hit || null,
    tabTitle      : target.title,
    tabId         : target.id,
    scanned       : s.scanned || 0,
  };
}

/**
 * cdpInterrupt — 强制中断当前生成（点击 stop=lucide-square 按钮）
 * @param {object} opts { cdpHost, cdpPort, tabHint }
 * @returns {Promise<{stopped, hadSquare, tabTitle}>}
 */
async function cdpInterrupt(opts = {}) {
  const { cdpHost = "127.0.0.1", cdpPort = 9222, tabHint = "" } = opts;
  const tabs = await cdpEnumTabs({ cdpHost, cdpPort });
  if (!tabs.length) throw new Error("CDP: 无可调试 tab");
  const target = (tabHint && tabs.find(t => t.title.includes(tabHint)))
              || tabs.find(t => t.isWorkbench)
              || tabs[0];

  const expr = `(()=>{
    const btns = document.querySelectorAll('button[type="submit"]');
    let stoppedAny = false, hadSquare = false;
    for (const btn of btns) {
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (btn.querySelector('svg.lucide-square')) {
        hadSquare = true;
        try { btn.click(); stoppedAny = true; } catch {}
      }
    }
    return JSON.stringify({ stoppedAny, hadSquare });
  })()`;
  const r = await cdpEval(cdpHost, cdpPort, target.id, expr, 8000);
  const v = r?.result?.result?.value || "{}";
  const s = JSON.parse(v);
  return {
    stopped  : !!s.stoppedAny,
    hadSquare: !!s.hadSquare,
    tabTitle : target.title,
    tabId    : target.id,
  };
}

/**
 * cdpCascadeStream — 提交任务 + 实时流式回调最新响应文本
 *
 * 不同于 cdpCascadeRun：每次轮询若 lastResponse 有变化即触发 onChunk。
 * 适合"流式"展示场景（如本机 Cascade 监控 179 上的生成过程）。
 *
 * @param {string} task
 * @param {function} onChunk  (text, meta) => void
 * @param {object}   opts     { cdpHost, cdpPort, tabHint, timeoutMs, pollMs }
 * @returns {Promise<{ok, completed, response, elapsedMs, stepCount, quotaExhausted}>}
 */
async function cdpCascadeStream(task, onChunk, opts = {}) {
  if (typeof onChunk !== "function") throw new Error("onChunk 必须是函数");
  return cdpCascadeRun(task, { ...opts, onStream: onChunk });
}

// ══════════════════════════════════════════════════════════════════════
// §7.12  CDP v216 万法归宗 — 通用 Session + 深层全控
// ══════════════════════════════════════════════════════════════════════

/**
 * cdpSession — 通用持久 CDP WebSocket 会话
 * 打开一次 WS，可发任意 CDP 命令（Runtime/Page/Network/Input/DOM...）
 * resolve: { send, on, eval, close, tabId, tabTitle }
 */
async function cdpSession(opts = {}) {
  const { cdpHost = "127.0.0.1", cdpPort = 9222, tabHint = "", timeoutMs = 30000 } = opts;

  const tabsRaw = await httpGet(`http://${cdpHost}:${cdpPort}/json`, 5000);
  if (tabsRaw.s !== 200) throw new Error(`CDP /json 失败: ${tabsRaw.s}`);
  const tabs = JSON.parse(tabsRaw.b).filter(t => t.type === "page" && t.webSocketDebuggerUrl);
  if (!tabs.length) throw new Error("CDP: 无可调试 tab");
  const target = (tabHint && tabs.find(t => (t.title || "").includes(tabHint)))
              || tabs.find(t => /workbench\.html/.test(t.url || ""))
              || tabs[0];

  return new Promise((resolve, reject) => {
    const wsKey = crypto.randomBytes(16).toString("base64");
    let buf = Buffer.alloc(0), upgraded = false, msgId = 100;
    const pending = new Map(), handlers = new Map();
    const s = net.createConnection({ host: cdpHost, port: cdpPort });

    function wsSend(payload) {
      if (s.destroyed) return;
      const p = Buffer.from(payload, "utf8"), mk = crypto.randomBytes(4);
      let h;
      if      (p.length < 126)   { h = Buffer.alloc(6);  h[0]=0x81; h[1]=0x80|p.length; mk.copy(h,2); }
      else if (p.length < 65536) { h = Buffer.alloc(8);  h[0]=0x81; h[1]=0xFE; h.writeUInt16BE(p.length,2); mk.copy(h,4); }
      else                       { h = Buffer.alloc(14); h[0]=0x81; h[1]=0xFF; h.writeBigUInt64BE(BigInt(p.length),2); mk.copy(h,10); }
      const mp = Buffer.alloc(p.length);
      for (let i = 0; i < p.length; i++) mp[i] = p[i] ^ mk[i % 4];
      s.write(Buffer.concat([h, mp]));
    }

    function send(method, params = {}) {
      const id = msgId++;
      wsSend(JSON.stringify({ id, method, params }));
      return new Promise((res, rej) => {
        const t = setTimeout(() => { pending.delete(id); rej(new Error(`CDP timeout: ${method}`)); }, timeoutMs);
        pending.set(id, { res, rej, t });
      });
    }

    function onEvent(event, handler) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(handler);
    }

    function close() { s.destroy(); }

    async function evalJs(expr, awaitPromise = true) {
      const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise });
      return r?.result?.value;
    }

    s.on("connect", () => {
      s.write([
        `GET /devtools/page/${target.id} HTTP/1.1`, `Host: ${cdpHost}:${cdpPort}`,
        "Upgrade: websocket", "Connection: Upgrade",
        `Sec-WebSocket-Key: ${wsKey}`, "Sec-WebSocket-Version: 13", "", "",
      ].join("\r\n"));
    });

    s.on("data", d => {
      buf = Buffer.concat([buf, d]);
      if (!upgraded) {
        const hi = buf.indexOf("\r\n\r\n");
        if (hi < 0) return;
        if (!buf.slice(0, hi).toString().includes("101")) { s.destroy(); return reject(new Error("CDP WS upgrade failed")); }
        upgraded = true; buf = buf.slice(hi + 4);
        resolve({ send, on: onEvent, close, eval: evalJs, tabId: target.id, tabTitle: target.title });
        return;
      }
      while (buf.length >= 2) {
        const op = buf[0] & 0x0f; let pl = buf[1] & 0x7f, off = 2;
        if      (pl === 126) { if (buf.length < 4)  break; pl = buf.readUInt16BE(2); off = 4; }
        else if (pl === 127) { if (buf.length < 10) break; pl = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + pl) break;
        const frame = buf.slice(off, off + pl); buf = buf.slice(off + pl);
        if (op === 8) { s.destroy(); return; }
        if (op !== 1 && op !== 2) continue;
        let m; try { m = JSON.parse(frame.toString()); } catch { continue; }
        if (m.id !== undefined) {
          const p = pending.get(m.id);
          if (p) { clearTimeout(p.t); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message || JSON.stringify(m.error))) : p.res(m.result); }
        } else if (m.method) {
          (handlers.get(m.method) || []).forEach(h => { try { h(m.params); } catch {} });
          (handlers.get("*")       || []).forEach(h => { try { h(m.method, m.params); } catch {} });
        }
      }
    });
    s.on("error", e => reject(e));
  });
}

/** cdpProbe — 全面探测 Windsurf renderer 上下文（globals/AMD/React/editor状态）*/
async function cdpProbe(opts = {}) {
  const sess = await cdpSession(opts);
  try {
    const raw = await sess.eval(`(()=>{
      const r = {};
      r.hasNodeRequire   = typeof require === 'function' && typeof require.resolve === 'function';
      r.hasWindowRequire = typeof window.require === 'function';
      r.hasProcess       = typeof process !== 'undefined';
      r.nodeVersion      = typeof process !== 'undefined' ? process.version : null;
      r.hasDirname       = typeof __dirname !== 'undefined';
      r.requireType      = typeof window.require === 'function'
        ? (window.require.config ? 'AMD/VSCode' : window.require.toString().slice(0,80)) : 'none';
      r.vsCodeGlobals = Object.keys(window).filter(k =>
        ['workbench','vscode','codeium','monaco','cascade','infra','_work','__work']
          .some(p => k.toLowerCase().includes(p.toLowerCase()))).slice(0,40);
      r.hasMonaco = typeof window.MonacoEnvironment !== 'undefined';
      r.amdModuleCount = 0;
      if (typeof window.define === 'function' && window.define._modules)
        r.amdModuleCount = Object.keys(window.define._modules).length;
      if (r.amdModuleCount > 0)
        r.amdModulesSample = Object.keys(window.define._modules)
          .filter(k => k.includes('command')||k.includes('workbench')||k.includes('terminal')).slice(0,20);
      r.reactRoots      = document.querySelectorAll('[data-reactroot]').length;
      r.lexicalEditors  = document.querySelectorAll('[data-lexical-editor]').length;
      r.xtermPresent    = !!document.querySelector('.xterm');
      r.terminalRows    = document.querySelectorAll('.xterm-rows').length;
      r.openTabCount    = document.querySelectorAll('.tab').length;
      r.activeTabTitle  = document.querySelector('.tab.active')?.textContent?.trim() || null;
      r.statusBarItems  = [...document.querySelectorAll('.statusbar-item')]
        .map(s => s.textContent?.trim()).filter(Boolean).slice(0,10);
      r.cascadeVisible  = !!document.querySelector('[data-lexical-editor="true"]');
      r.stepCount       = document.querySelectorAll('[data-step-index]').length;
      r.pageTitle       = document.title;
      try { r.vscodeProduct = JSON.stringify(window.vscodeProduct||{}).slice(0,200); } catch {}
      return JSON.stringify(r);
    })()`);
    let p = {}; try { p = JSON.parse(raw); } catch {}
    return { ok: true, tabId: sess.tabId, tabTitle: sess.tabTitle, ...p };
  } finally { sess.close(); }
}

/** cdpScreenshot — Page.captureScreenshot，截取 Windsurf 当前窗口 */
async function cdpScreenshot(opts = {}) {
  const { saveDir = null, ...rest } = opts;
  const sess = await cdpSession(rest);
  try {
    const r = await sess.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    let file = null;
    if (saveDir) {
      try {
        if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
        file = path.join(saveDir, `screenshot_${Date.now()}.png`);
        fs.writeFileSync(file, Buffer.from(r.data, "base64"));
      } catch {}
    }
    return { ok: true, data: r.data, file, tabId: sess.tabId, tabTitle: sess.tabTitle };
  } finally { sess.close(); }
}

/** cdpVSCommand — 执行任意 VS Code 命令（路径A: commandService; 路径B: 键盘模拟）*/
async function cdpVSCommand(command, args = [], opts = {}) {
  const sess = await cdpSession(opts);
  try {
    const argsJson = JSON.stringify(args || []);
    const rawA = await sess.eval(`(async()=>{
      const cmd = ${JSON.stringify(command)}, cmdArgs = ${argsJson};
      const candidates = [
        window._workbench, window.workbenchAccessor, window.__workbenchAccessor,
        window._workbenchServices, window.__workbenchServices,
      ].filter(Boolean);
      for (const wb of candidates) {
        const cs = wb?.commandService || wb?._commandService
                || (typeof wb?.get === 'function' ? wb.get('ICommandService') : null);
        if (cs?.executeCommand) {
          try {
            const r = await cs.executeCommand(cmd, ...cmdArgs);
            return JSON.stringify({ method:'commandService', ok:true, result: r !== undefined ? String(r) : 'done' });
          } catch(e) { return JSON.stringify({ method:'commandService', ok:false, error:e.message.slice(0,100) }); }
        }
      }
      return JSON.stringify({ method:'none' });
    })()`);
    let pa = {}; try { pa = JSON.parse(rawA); } catch {}
    if (pa.method === "commandService") {
      return { ok: pa.ok, method: "commandService", result: pa.result, error: pa.error,
               tabId: sess.tabId, tabTitle: sess.tabTitle };
    }
    // 路径 B: 键盘模拟 Ctrl+Shift+P
    await sess.send("Page.bringToFront", {});
    await sleep(150);
    for (const type of ["keyDown", "keyUp"]) {
      await sess.send("Input.dispatchKeyEvent", { type, key: "P", code: "KeyP", windowsVirtualKeyCode: 80, modifiers: 6 });
    }
    await sleep(400);
    await sess.send("Input.insertText", { text: `>${command}` });
    await sleep(350);
    for (const type of ["keyDown", "keyUp"]) {
      await sess.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    }
    return { ok: true, method: "keyboard", command, tabId: sess.tabId, tabTitle: sess.tabTitle };
  } finally { sess.close(); }
}

/** cdpNetworkCapture — 监听 CDP Network 域，捕获指定时长内所有 HTTP 请求（API/推理调用监控）*/
async function cdpNetworkCapture(duration = 5000, opts = {}) {
  const sess = await cdpSession(opts);
  const requests = [], responses = {};
  try {
    sess.on("Network.requestWillBeSent", p => {
      requests.push({ id: p.requestId, url: (p.request?.url||"").slice(0,300),
                      method: p.request?.method||"GET", ts: p.timestamp, type: p.type||"" });
    });
    sess.on("Network.responseReceived", p => { responses[p.requestId] = p.response?.status; });
    await sess.send("Network.enable", { maxTotalBufferSize: 0, maxResourceBufferSize: 0 });
    await sleep(duration);
    for (const req of requests) { if (responses[req.id] !== undefined) req.status = responses[req.id]; }
  } finally { sess.close(); }
  return { ok: true, requests, count: requests.length, duration };
}

/** cdpGetEditorState — 读取 Windsurf 编辑器完整状态（tab/文件/代码行/状态栏/终端）*/
async function cdpGetEditorState(opts = {}) {
  const sess = await cdpSession(opts);
  try {
    const raw = await sess.eval(`(()=>{
      const r = {};
      r.activeTabs   = [...document.querySelectorAll('.tab.active')]
        .map(t => t.getAttribute('aria-label')||t.textContent?.trim()||'').filter(Boolean);
      r.openTabs     = [...document.querySelectorAll('.tab')]
        .map(t => t.getAttribute('aria-label')||t.textContent?.trim()||'').filter(Boolean).slice(0,40);
      r.visibleLines = [...document.querySelectorAll('.view-line')]
        .map(l => l.textContent).filter(Boolean).slice(0,8).map(l => l.slice(0,120));
      r.breadcrumb   = [...document.querySelectorAll('.breadcrumb-item')]
        .map(b => b.textContent?.trim()).filter(Boolean).slice(0,6);
      r.statusBar    = [...document.querySelectorAll('.statusbar-item')]
        .map(s => s.textContent?.trim()).filter(Boolean).slice(0,15);
      r.terminalCount = document.querySelectorAll('.xterm,.terminal-wrapper').length;
      r.terminalLines = [...document.querySelectorAll('.xterm-rows .xterm-row')]
        .slice(-10).map(r => r.textContent||'').filter(Boolean);
      r.cascadeVisible = !!document.querySelector('[data-lexical-editor="true"]');
      r.stepCount    = document.querySelectorAll('[data-step-index]').length;
      r.notifications = [...document.querySelectorAll('.notification-toast,[class*=notification-list-item]')]
        .map(n => n.textContent?.trim().slice(0,80)).filter(Boolean).slice(0,5);
      return JSON.stringify(r);
    })()`);
    let p = {}; try { p = JSON.parse(raw); } catch {}
    return { ok: true, tabId: sess.tabId, tabTitle: sess.tabTitle, ...p };
  } finally { sess.close(); }
}

/**
 * cdpTerminalRun — 在 Windsurf 集成终端执行命令并回收输出
 * Ctrl+` 打开终端 → insertText 写命令 → 等待 → 从 xterm DOM 读取输出
 * 这是最底层的全系统控制：可执行任何 shell/PowerShell 命令
 */
async function cdpTerminalRun(cmd, opts = {}) {
  const { waitMs = 4000, ...rest } = opts;
  const sess = await cdpSession(rest);
  try {
    const marker = `__DAOMARK_${Date.now()}__`, markerEnd = `__DAOEND_${Date.now()}__`;
    await sess.send("Page.bringToFront", {});
    await sleep(200);
    // Ctrl+` 打开/聚焦终端
    for (const type of ["keyDown", "keyUp"]) {
      await sess.send("Input.dispatchKeyEvent", { type, key: "`", code: "Backquote", windowsVirtualKeyCode: 192, modifiers: 2 });
    }
    await sleep(700);
    // 写命令 + 回车
    const fullCmd = `echo ${marker} & ${cmd} & echo ${markerEnd}`;
    await sess.send("Input.insertText", { text: fullCmd });
    await sleep(150);
    for (const type of ["keyDown", "keyUp"]) {
      await sess.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    }
    await sleep(waitMs);
    // 读 xterm DOM（支持 DOM renderer 多种结构）
    const raw = await sess.eval(`(()=>{
      const mk = ${JSON.stringify(marker)}, mkEnd = ${JSON.stringify(markerEnd)};
      // xterm.js DOM renderer: .xterm-rows 的子 div 无类名
      const selectors = ['.xterm-rows > div', '.xterm-rows div', '.xterm-rows span',
                         '.terminal-wrapper', '.xterm-viewport'];
      let allText = '';
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) { allText = [...els].map(r => r.textContent||'').join('\\n'); break; }
      }
      // 也尝试直接读 .xterm-rows 容器的完整 textContent
      if (!allText) {
        const cont = document.querySelector('.xterm-rows');
        if (cont) allText = cont.textContent || '';
      }
      // 结构信息（调试用）
      const xtermInfo = {
        rowsChildCount: document.querySelector('.xterm-rows')?.childElementCount || 0,
        xtermScreenText: (document.querySelector('.xterm-screen')?.textContent||'').slice(0,200),
        canvasCount: document.querySelectorAll('.xterm canvas').length,
      };
      const start = allText.indexOf(mk), end = allText.indexOf(mkEnd, start > 0 ? start : 0);
      if (start < 0) return JSON.stringify({ found:false, raw: allText.slice(-2000), xtermInfo });
      return JSON.stringify({ found:true, output: allText.slice(start+mk.length, end>=0?end:undefined).trim().slice(0,8000), xtermInfo });
    })()`);
    let p = {}; try { p = JSON.parse(raw); } catch {}
    return { ok: !!p.found, output: p.found ? p.output : (p.raw||""), found: !!p.found,
             xtermInfo: p.xtermInfo, tabId: sess.tabId };
  } finally { sess.close(); }
}

/** cdpOpenFile — 在 Windsurf 编辑器打开任意文件 */
async function cdpOpenFile(filePath, opts = {}) {
  return cdpVSCommand("vscode.open", [filePath], opts);
}

/**
 * cdpEvalRaw — 在 Windsurf 渲染器中执行任意 JavaScript，返回结果
 * 这是最底层的能力：可执行任何 JS，访问任何 DOM/window 属性
 * @param {string} expr  JS 表达式（需要 return 或 直接为表达式）
 * @param {object} opts  { cdpHost, cdpPort, tabHint, awaitPromise }
 * @returns {Promise<{ok, value, type, tabId, tabTitle}>}
 */
async function cdpEvalRaw(expr, opts = {}) {
  const { awaitPromise = true, ...rest } = opts;
  const sess = await cdpSession(rest);
  try {
    const r = await sess.send("Runtime.evaluate", {
      expression: expr, returnByValue: false, awaitPromise,
      generatePreview: true,
    });
    const res = r?.result;
    return {
      ok      : !r?.exceptionDetails,
      value   : res?.value,
      type    : res?.type,
      preview : res?.preview,
      error   : r?.exceptionDetails?.exception?.description?.slice(0,200),
      tabId   : sess.tabId,
      tabTitle: sess.tabTitle,
    };
  } finally { sess.close(); }
}

/** cdpConsoleCapture — 捕获渲染器 console 输出（Runtime.consoleAPICalled + Log.entryAdded）*/
async function cdpConsoleCapture(duration = 5000, opts = {}) {
  const sess = await cdpSession(opts);
  const messages = [];
  try {
    await sess.send("Runtime.enable", {});
    await sess.send("Log.enable", {}).catch(() => {});
    sess.on("Runtime.consoleAPICalled", p => {
      messages.push({ type: p.type,
        text: (p.args||[]).map(a => a.value !== undefined ? String(a.value) : (a.description||"")).join(" ").slice(0,500),
        ts: p.timestamp });
    });
    sess.on("Log.entryAdded", p => {
      if (p.entry) messages.push({ type: p.entry.level, text: (p.entry.text||"").slice(0,500), source: p.entry.source, ts: Date.now() });
    });
    await sleep(duration);
  } finally { sess.close(); }
  return { ok: true, messages, count: messages.length, duration };
}

// ══════════════════════════════════════════════════════════════════════
// §8  路由配置管理
// ══════════════════════════════════════════════════════════════════════

function loadRouteConfig() {
  try { return JSON.parse(fs.readFileSync(PATHS.configJson, "utf8")); }
  catch { return { daoRoutes: { enabled: true, routes: {} } }; }
}

function saveRouteConfig(cfg) {
  fs.writeFileSync(PATHS.configJson, JSON.stringify(cfg, null, 2));
}

function listRoutes() {
  const cfg = loadRouteConfig();
  sep("路由配置");
  const routes = cfg.daoRoutes?.routes || {};
  // 兼容 object 和 array 两种格式
  const entries = Array.isArray(routes)
    ? routes.map(r => [r.modelUid || r.uid, r])
    : Object.entries(routes);
  if (entries.length === 0) { inf("无路由配置"); return; }
  for (const [uid, r] of entries) {
    const target = typeof r === "string" ? r
                 : r.target || r.backend || `${r.provider}::${r.model}` || "?";
    console.log(`  ${C.b(uid)} → ${C.g(target)}`);
  }
}

function setRoute(modelUid, target, extra = {}) {
  const cfg = loadRouteConfig();
  if (!cfg.daoRoutes) cfg.daoRoutes = { enabled: true, routes: {} };
  if (!cfg.daoRoutes.routes) cfg.daoRoutes.routes = {};
  // 统一使用 object 格式（与 dao_router.js 兼容）
  if (Array.isArray(cfg.daoRoutes.routes)) {
    // 将旧 array 格式迁移为 object 格式
    const obj = {};
    for (const r of cfg.daoRoutes.routes) {
      const k = r.modelUid || r.uid;
      if (k) obj[k] = r;
    }
    cfg.daoRoutes.routes = obj;
  }
  // target 格式: "provider::model" 或 "provider/model"
  const m = target.match(/^([a-z]+)::(.+)$/) || target.match(/^([a-z]+)\/(.+)$/);
  if (m) {
    cfg.daoRoutes.routes[modelUid] = { provider: m[1], model: m[2], ...extra };
  } else {
    cfg.daoRoutes.routes[modelUid] = { provider: "github", model: target, ...extra };
  }
  saveRouteConfig(cfg);
  ok(`路由设置: ${modelUid} → ${target}`);
}

// ══════════════════════════════════════════════════════════════════════
// §9  远程操作（WinRM）
// ══════════════════════════════════════════════════════════════════════

async function remoteExec(host, script, timeout = 120000) {
  return new Promise((resolve) => {
    // 将 Node.js 脚本序列化为单行并通过 WinRM 执行
    const scriptB64 = Buffer.from(script, "utf8").toString("base64");
    // 远程侧多候选 Node.exe 路径动态探测（不绑定特定用户名）
    const psCmd = [
      `Invoke-Command -ComputerName ${host} -ScriptBlock {`,
      `  $cands=@(`,
      `    (Join-Path $env:USERPROFILE 'AppData\\Local\\ms-playwright-go\\1.50.1\\node.exe'),`,
      `    (Join-Path $env:USERPROFILE 'AppData\\Local\\ms-playwright-go\\node.exe'),`,
      `    (Join-Path $env:ProgramFiles 'nodejs\\node.exe'),`,
      `    'C:\\Program Files (x86)\\nodejs\\node.exe'`,
      `  )`,
      `  $NODE=$cands|Where-Object{Test-Path $_}|Select-Object -First 1`,
      `  if(-not $NODE){$gc=Get-Command node -EA 0; if($gc){$NODE=$gc.Source}}`,
      `  if(-not $NODE){Write-Error '[remoteExec] no node.exe found'; exit 1}`,
      `  $script=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${scriptB64}'))`,
      `  $tmp=[System.IO.Path]::GetTempFileName()+'.cjs'`,
      `  [System.IO.File]::WriteAllText($tmp,$script,(New-Object System.Text.UTF8Encoding($false)))`,
      `  & $NODE $tmp 2>&1`,
      `  Remove-Item $tmp -EA SilentlyContinue`,
      `}`,
    ].join("\n");

    const proc = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", psCmd], {
      timeout,
      windowsHide: true,
    });
    let out = "", errOut = "";
    proc.stdout.on("data", d => { out += d; });
    proc.stderr.on("data", d => { errOut += d; });
    proc.on("close", code => resolve({ code, out: out.trim(), err: errOut.trim() }));
    proc.on("error", e => resolve({ code: -1, out: "", err: e.message }));
    setTimeout(() => { proc.kill(); resolve({ code: -1, out, err: "timeout" }); }, timeout);
  });
}

// 生成可在远程执行的 dao_master 自适应脚本片段
function makeRemoteSnippet(cmd, args = []) {
  // 将完整的 dao_master.cjs 部署到远端并执行（动态 USERPROFILE，不绑定特定用户名）
  const selfPath = __filename;
  try {
    const selfContent = fs.readFileSync(selfPath, "utf8");
    return `
const fs=require('fs'),path=require('path'),os=require('os');
const HOME=process.env.USERPROFILE||process.env.HOME||os.homedir();
const masterPath=path.join(HOME,'dao_master.cjs');
fs.writeFileSync(masterPath,${JSON.stringify(selfContent)},'utf8');
const {execSync}=require('child_process');
const node=process.execPath;
const result=execSync(node+' "'+masterPath+'" ${cmd} ${args.join(" ")}',{encoding:'utf8',timeout:120000});
console.log(result);
    `.trim();
  } catch {
    return `console.log("remote snippet error: cannot read self");`;
  }
}

// ══════════════════════════════════════════════════════════════════════
// §10  HTTP API 服务器
// ══════════════════════════════════════════════════════════════════════

async function startApiServer(port = 7211) {
  let _lspPort = null, _csrf = null, _apiKey = null;

  async function init() {
    const { port: lp } = await discoverLSP();
    _lspPort = lp;
    _apiKey = extractApiKey();
    if (_apiKey) _csrf = await extractCSRF(_lspPort, _apiKey);
  }

  await init();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const pathname = url.pathname;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");

    if (req.method === "OPTIONS") { res.writeHead(200); return res.end(); }

    // GET /health
    if (req.method === "GET" && pathname === "/health") {
      const s = await getStatus();
      res.writeHead(200);
      return res.end(JSON.stringify({ ok: true, version: VERSION, status: s }));
    }

    // GET /status
    if (req.method === "GET" && pathname === "/status") {
      const s = await getStatus();
      res.writeHead(200);
      return res.end(JSON.stringify(s));
    }

    // GET /csrf
    if (req.method === "GET" && pathname === "/csrf") {
      if (!_csrf) await init();
      res.writeHead(_csrf ? 200 : 503);
      return res.end(JSON.stringify({ csrf: _csrf, port: _lspPort }));
    }

    // POST /ensure
    if (req.method === "POST" && pathname === "/ensure") {
      const r = await ensureAll();
      res.writeHead(r.ok ? 200 : 503);
      return res.end(JSON.stringify(r));
    }

    // POST /chat
    if (req.method === "POST" && pathname === "/chat") {
      let body = "";
      req.on("data", c => body += c);
      await new Promise(r => req.on("end", r));
      try {
        const { message, model, maxWait } = JSON.parse(body);
        if (!message) { res.writeHead(400); return res.end(JSON.stringify({ error: "message required" })); }

        // 如果 CSRF 失效，重新提取
        if (!_csrf || !_apiKey) await init();

        const result = await chat(message, {
          model: model || "MODEL_GOOGLE_GEMINI_3_0_FLASH_LOW",
          maxWait: maxWait || 120000,
          lspPort: _lspPort,
          csrf: _csrf,
          apiKey: _apiKey,
        });

        // 刷新 CSRF
        _csrf = null;
        try { _csrf = JSON.parse(fs.readFileSync(PATHS.csrfCache, "utf8")).csrf; } catch {}

        res.writeHead(200);
        return res.end(JSON.stringify({
          ok: true,
          cascadeId: result.cascadeId,
          response: result.response,
          stepsCount: result.steps.length,
        }));
      } catch (e) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    // POST /exec  (agenticExec: LLM生成脚本 + 本地直接执行)
    if (req.method === "POST" && pathname === "/exec") {
      let body = "";
      req.on("data", c => body += c);
      await new Promise(r => req.on("end", r));
      try {
        const { task, shell, dryRun, timeout } = JSON.parse(body);
        if (!task) { res.writeHead(400); return res.end(JSON.stringify({ error: "task required" })); }
        const result = await agenticExec(task, { shell, dryRun: !!dryRun, timeout: timeout || 60000 });
        res.writeHead(result.exitCode === 0 ? 200 : 207);
        return res.end(JSON.stringify({
          ok: result.exitCode === 0, script: result.script,
          stdout: result.stdout?.slice(0, 10000), stderr: result.stderr?.slice(0, 2000),
          exitCode: result.exitCode, shell: result.shell,
        }));
      } catch (e) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    // POST /agentic
    if (req.method === "POST" && pathname === "/agentic") {
      let body = "";
      req.on("data", c => body += c);
      await new Promise(r => req.on("end", r));
      try {
        const { task, model, maxWait, openFile } = JSON.parse(body);
        if (!task) { res.writeHead(400); return res.end(JSON.stringify({ error: "task required" })); }
        if (!_csrf || !_apiKey) await init();
        const result = await agenticCascade(task, {
          model: model || "MODEL_CLAUDE_3_5_SONNET_20241022",
          maxWait: maxWait || 600000,
          openFile: openFile || "dao_master.cjs",
          lspPort: _lspPort, csrf: _csrf, apiKey: _apiKey,
        });
        _csrf = null;
        try { _csrf = JSON.parse(fs.readFileSync(PATHS.csrfCache, "utf8")).csrf; } catch {}
        res.writeHead(200);
        return res.end(JSON.stringify({
          ok: true, cascadeId: result.cascadeId, response: result.response,
          stepsCount: result.steps.length, done: result.done, mode: result.mode,
        }));
      } catch (e) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    // POST /cdp  (CDP直控Windsurf前端 cascade)
    if (req.method === "POST" && pathname === "/cdp") {
      let body = "";
      req.on("data", c => body += c);
      await new Promise(r => req.on("end", r));
      try {
        const { task, cdpPort, tabHint, waitMs } = JSON.parse(body);
        if (!task) { res.writeHead(400); return res.end(JSON.stringify({ error: "task required" })); }
        const result = await cdpCascadeSend(task, {
          cdpPort: cdpPort || 9222,
          tabHint: tabHint || "",
          waitMs: waitMs || 500,
        });
        // 可选：等待 Cascade 完成并回收响应（wait=true 启用）
        const { wait, waitTimeoutMs } = (() => { try { return JSON.parse(body); } catch { return {}; } })();
        if (wait && result.ok) {
          try {
            const wr = await cdpCascadeWait(result.tabId, {
              cdpPort: cdpPort || 9222,
              timeoutMs: waitTimeoutMs || 90000,
            });
            result.completed = wr.completed;
            result.response  = wr.response;
            result.elapsedMs = wr.elapsedMs;
          } catch (we) { result.waitError = we.message; }
        }
        res.writeHead(result.ok ? 200 : 207);
        return res.end(JSON.stringify({ ok: result.ok, ...result }));
      } catch (e) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    // GET /cdp/tabs  (v215 五器之一)
    if (req.method === "GET" && pathname === "/cdp/tabs") {
      try {
        const cdpPort = parseInt(url.searchParams.get("cdpPort")) || 9222;
        const tabs = await cdpEnumTabs({ cdpPort });
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, tabs, count: tabs.length }));
      } catch (e) {
        res.writeHead(500);
        return res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    }

    // GET /cdp/quota  (v215 五器之二)
    if (req.method === "GET" && pathname === "/cdp/quota") {
      try {
        const cdpPort = parseInt(url.searchParams.get("cdpPort")) || 9222;
        const tabHint = url.searchParams.get("tabHint") || "";
        const result = await cdpQuotaCheck({ cdpPort, tabHint });
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, ...result }));
      } catch (e) {
        res.writeHead(500);
        return res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    }

    // POST /cdp/interrupt  (v215 五器之三)
    if (req.method === "POST" && pathname === "/cdp/interrupt") {
      let body = "";
      req.on("data", c => body += c);
      await new Promise(r => req.on("end", r));
      try {
        const { cdpPort, tabHint } = (() => { try { return JSON.parse(body || "{}"); } catch { return {}; } })();
        const result = await cdpInterrupt({ cdpPort: cdpPort || 9222, tabHint: tabHint || "" });
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, ...result }));
      } catch (e) {
        res.writeHead(500);
        return res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    }

    // POST /cdp/stream  (v215 五器之四 · SSE 实时流)
    if (req.method === "POST" && pathname === "/cdp/stream") {
      let body = "";
      req.on("data", c => body += c);
      await new Promise(r => req.on("end", r));
      try {
        const { task, cdpPort, tabHint, timeoutMs, pollMs } =
          (() => { try { return JSON.parse(body || "{}"); } catch { return {}; } })();
        if (!task) { res.writeHead(400); return res.end(JSON.stringify({ error: "task required" })); }

        // 切换为 SSE 头
        res.writeHead(200, {
          "Content-Type"     : "text/event-stream",
          "Cache-Control"    : "no-cache",
          "Connection"       : "keep-alive",
          "X-Accel-Buffering": "no",
        });
        const sseSend = (event, data) => {
          res.write(`event: ${event}\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        };
        sseSend("start", { task: task.slice(0, 80), at: new Date().toISOString() });

        try {
          const result = await cdpCascadeStream(task, (text) => {
            sseSend("chunk", { text: text.slice(-2000), len: text.length });
          }, {
            cdpPort  : cdpPort || 9222,
            tabHint  : tabHint || "",
            timeoutMs: timeoutMs || 90000,
            pollMs   : pollMs    || 2500,
          });
          sseSend("done", result);
        } catch (e) {
          sseSend("error", { message: e.message });
        }
        return res.end();
      } catch (e) {
        if (!res.headersSent) {
          res.writeHead(500);
          return res.end(JSON.stringify({ error: e.message }));
        }
        return res.end();
      }
    }

    // POST /route
    if (req.method === "POST" && pathname === "/route") {
      let body = "";
      req.on("data", c => body += c);
      await new Promise(r => req.on("end", r));
      try {
        const { modelUid, target } = JSON.parse(body);
        setRoute(modelUid, target);
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    // POST /remote
    if (req.method === "POST" && pathname === "/remote") {
      let body = "";
      req.on("data", c => body += c);
      await new Promise(r => req.on("end", r));
      try {
        const { host, command, args } = JSON.parse(body);
        const snippet = makeRemoteSnippet(command, args || []);
        const result = await remoteExec(host, snippet);
        res.writeHead(200);
        return res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    // ── v216 万法归宗 新端点 ────────────────────────────────────────────

    // GET /cdp/probe  — 探测 renderer 上下文
    if (req.method === "GET" && pathname === "/cdp/probe") {
      try {
        const cdpPort = parseInt(url.searchParams.get("cdpPort")) || 9222;
        const tabHint = url.searchParams.get("tabHint") || "";
        const r = await cdpProbe({ cdpPort, tabHint });
        res.writeHead(r.ok ? 200 : 500);
        return res.end(JSON.stringify(r));
      } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ error: e.message })); }
    }

    // GET /cdp/screenshot  — 截图（返回 base64 PNG）
    if (req.method === "GET" && pathname === "/cdp/screenshot") {
      try {
        const cdpPort = parseInt(url.searchParams.get("cdpPort")) || 9222;
        const tabHint = url.searchParams.get("tabHint") || "";
        const r = await cdpScreenshot({ cdpPort, tabHint });
        if (url.searchParams.get("format") === "binary" && r.data) {
          res.writeHead(200, { "Content-Type": "image/png" });
          return res.end(Buffer.from(r.data, "base64"));
        }
        res.writeHead(r.ok ? 200 : 500);
        return res.end(JSON.stringify({ ok: r.ok, tabTitle: r.tabTitle,
          dataLen: r.data?.length || 0, data: r.data?.slice(0, 100) + "..." }));
      } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ error: e.message })); }
    }

    // POST /cdp/vscommand  — 执行任意 VS Code 命令
    if (req.method === "POST" && pathname === "/cdp/vscommand") {
      let body = ""; req.on("data", c => body += c); await new Promise(r => req.on("end", r));
      try {
        const { command, args, cdpPort, tabHint } = JSON.parse(body);
        if (!command) { res.writeHead(400); return res.end(JSON.stringify({ error: "command required" })); }
        const r = await cdpVSCommand(command, args || [], { cdpPort: cdpPort || 9222, tabHint: tabHint || "" });
        res.writeHead(r.ok ? 200 : 207); return res.end(JSON.stringify(r));
      } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ error: e.message })); }
    }

    // POST /cdp/terminal  — 在集成终端执行命令
    if (req.method === "POST" && pathname === "/cdp/terminal") {
      let body = ""; req.on("data", c => body += c); await new Promise(r => req.on("end", r));
      try {
        const { cmd, waitMs, cdpPort, tabHint } = JSON.parse(body);
        if (!cmd) { res.writeHead(400); return res.end(JSON.stringify({ error: "cmd required" })); }
        const r = await cdpTerminalRun(cmd, { cdpPort: cdpPort || 9222, tabHint: tabHint || "", waitMs: waitMs || 4000 });
        res.writeHead(r.ok ? 200 : 207); return res.end(JSON.stringify(r));
      } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ error: e.message })); }
    }

    // GET /cdp/network  — 捕获 N 秒网络流量
    if (req.method === "GET" && pathname === "/cdp/network") {
      try {
        const cdpPort = parseInt(url.searchParams.get("cdpPort")) || 9222;
        const duration = parseInt(url.searchParams.get("duration")) || 5000;
        const tabHint  = url.searchParams.get("tabHint") || "";
        const r = await cdpNetworkCapture(duration, { cdpPort, tabHint });
        res.writeHead(200); return res.end(JSON.stringify(r));
      } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ error: e.message })); }
    }

    // GET /cdp/editor  — 读取编辑器状态
    if (req.method === "GET" && pathname === "/cdp/editor") {
      try {
        const cdpPort = parseInt(url.searchParams.get("cdpPort")) || 9222;
        const tabHint  = url.searchParams.get("tabHint") || "";
        const r = await cdpGetEditorState({ cdpPort, tabHint });
        res.writeHead(r.ok ? 200 : 500); return res.end(JSON.stringify(r));
      } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ error: e.message })); }
    }

    // POST /shell  — 在本机（179）直接执行 shell/PowerShell 命令（最底层全控）
    if (req.method === "POST" && pathname === "/shell") {
      let body = ""; req.on("data", c => body += c); await new Promise(r => req.on("end", r));
      try {
        const { cmd, timeout, cwd, shell: sh } = JSON.parse(body || "{}");
        if (!cmd) { res.writeHead(400); return res.end(JSON.stringify({ error: "cmd required" })); }
        let output = "", error = "", exitCode = 0;
        try {
          output = execSync(cmd, {
            encoding: "utf8",
            timeout : timeout || 30000,
            cwd     : cwd || HOME,
            shell   : sh || (IS_WIN ? "powershell.exe" : "/bin/sh"),
            maxBuffer: 5 * 1024 * 1024,
          });
        } catch (e) {
          output = e.stdout || ""; error = e.stderr || e.message || "";
          exitCode = e.status || 1;
        }
        res.writeHead(exitCode === 0 ? 200 : 207);
        return res.end(JSON.stringify({ ok: exitCode === 0, output: output.slice(0, 50000), error: error.slice(0, 2000), exitCode }));
      } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ error: e.message })); }
    }

    // POST /cdp/ipc  — 通过 Electron ipcRenderer 探测/调用频道
    if (req.method === "POST" && pathname === "/cdp/ipc") {
      let body = ""; req.on("data", c => body += c); await new Promise(r => req.on("end", r));
      try {
        const { channel, args, tabHint, cdpPort, method: ipcMethod } = JSON.parse(body || "{}");
        if (!channel) { res.writeHead(400); return res.end(JSON.stringify({ error: "channel required" })); }
        const argsJson = JSON.stringify(args || []);
        const m = ipcMethod === "send" ? "send" : "invoke";
        const expr = `(async()=>{
          const ipc = window.vscode?.ipcRenderer;
          if (!ipc) return JSON.stringify({ error: 'NO_IPC' });
          try {
            const r = await ipc.${m}(${JSON.stringify(channel)}, ...${argsJson});
            return JSON.stringify({ ok:true, result: r !== undefined ? JSON.stringify(r).slice(0,500) : null });
          } catch(e) { return JSON.stringify({ ok:false, error:e.message.slice(0,200) }); }
        })()`;
        const r = await cdpEvalRaw(expr, { cdpPort: cdpPort || 9222, tabHint: tabHint || "" });
        let parsed = {}; try { parsed = JSON.parse(r.value || "{}"); } catch {}
        res.writeHead(200); return res.end(JSON.stringify({ ...parsed, tabId: r.tabId }));
      } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ error: e.message })); }
    }

    // POST /cdp/eval  — 在渲染器中执行任意 JavaScript（最底层能力）
    if (req.method === "POST" && pathname === "/cdp/eval") {
      let body = ""; req.on("data", c => body += c); await new Promise(r => req.on("end", r));
      try {
        const { expr, expression, cdpPort, tabHint, awaitPromise } = JSON.parse(body || "{}");
        const code = expr || expression;
        if (!code) { res.writeHead(400); return res.end(JSON.stringify({ error: "expr required" })); }
        const r = await cdpEvalRaw(code, { cdpPort: cdpPort || 9222, tabHint: tabHint || "", awaitPromise: awaitPromise !== false });
        res.writeHead(r.ok ? 200 : 207); return res.end(JSON.stringify(r));
      } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ error: e.message })); }
    }

    // POST /cdp/console  — 捕获 console 输出
    if (req.method === "POST" && pathname === "/cdp/console") {
      let body = ""; req.on("data", c => body += c); await new Promise(r => req.on("end", r));
      try {
        const { duration, cdpPort, tabHint } = JSON.parse(body || "{}");
        const r = await cdpConsoleCapture(duration || 5000, { cdpPort: cdpPort || 9222, tabHint: tabHint || "" });
        res.writeHead(200); return res.end(JSON.stringify(r));
      } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ error: e.message })); }
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "not found", path: pathname }));
  });

  server.listen(port, "0.0.0.0", () => {
    sep("HTTP API 服务器");
    ok(`监听 :${port}`);
    inf("端点:");
    inf(`  GET  http://localhost:${port}/health`);
    inf(`  GET  http://localhost:${port}/status`);
    inf(`  GET  http://localhost:${port}/csrf`);
    inf(`  POST http://localhost:${port}/ensure`);
    inf(`  POST http://localhost:${port}/chat    { message, model?, maxWait? }`);
    inf(`  POST http://localhost:${port}/route   { modelUid, target }`);
    inf(`  POST http://localhost:${port}/remote  { host, command, args? }`);
    inf(`  POST http://localhost:${port}/agentic { task, model?, maxWait?, openFile? }`);
    inf(`  POST http://localhost:${port}/cdp     { task, cdpPort?, tabHint?, wait?, waitTimeoutMs? }`);
    inf(`  POST http://localhost:${port}/exec    { task, shell?, dryRun? }`);
    inf(C.m(`  ── v215 CDP 五器 ──`));
    inf(`  GET  http://localhost:${port}/cdp/tabs            列出所有 tab`);
    inf(`  GET  http://localhost:${port}/cdp/quota           检测配额耗尽`);
    inf(`  POST http://localhost:${port}/cdp/interrupt       { cdpPort?, tabHint? }`);
    inf(`  POST http://localhost:${port}/cdp/stream          { task, ... } SSE 实时流`);
    inf(C.m(`  ── v216 万法归宗 深层全控 ──`));
    inf(`  GET  http://localhost:${port}/cdp/probe           探测 renderer 上下文`);
    inf(`  GET  http://localhost:${port}/cdp/screenshot      截图 (PNG base64 / ?format=binary)`);
    inf(`  POST http://localhost:${port}/cdp/vscommand       { command, args? } 执行 VS Code 命令`);
    inf(`  POST http://localhost:${port}/cdp/terminal        { cmd, waitMs? } 集成终端执行`);
    inf(`  GET  http://localhost:${port}/cdp/network         ?duration=5000 捕获网络请求`);
    inf(`  GET  http://localhost:${port}/cdp/editor          读取编辑器状态`);
    inf(`  POST http://localhost:${port}/cdp/console         { duration? } 捕获 console 输出`);
    console.log();
  });

  return server;
}

// ══════════════════════════════════════════════════════════════════════
// §11  CLI 入口
// ══════════════════════════════════════════════════════════════════════

function printBanner() {
  console.log();
  console.log(C.b("  ╔══════════════════════════════════════════════════════╗"));
  console.log(C.b("  ║") + C.w("  道·万法归宗·总控制器  v" + VERSION + "  · 印215·五器圆满 ") + C.b("       ║"));
  console.log(C.b("  ║") + C.d("  「无为而无不为。至柔驰坚，无有入于无间」          ") + C.b(" ║"));
  console.log(C.b("  ╚══════════════════════════════════════════════════════╝"));
  console.log();
}

function printHelp() {
  printBanner();
  console.log(`  ${C.w("用法:")} node dao_master.cjs <命令> [参数...]\n`);
  const cmds = [
    ["status",                    "全链路状态快照"],
    ["ensure",                    "确保 Router/Bridge/Gateway 全部在线"],
    ["csrf",                      "提取/刷新 CSRF token (内存提取法)"],
    ["chat <消息>",                "发起单次 Cascade 对话"],
    ["chat <消息> --model <uid>",  "指定模型对话"],
    ["monitor [interval_ms]",     "实时全链路监控 (持续刷新)"],
    ["server [port]",             "启动 HTTP API 服务器 (默认 :7211)"],
    ["route list",                "查看当前路由配置"],
    ["route set <modelUid> <target>", "设置模型路由"],
    ["restart router",            "重启 Router (热重载配置)"],
    ["remote <host> <cmd>",       "在远程机器执行命令 (via WinRM)"],
    ["remote <host> chat <消息>", "在远程机器发起对话"],
    ["remote <host> status",      "获取远程机器链路状态"],
    ["remote <host> ensure",      "确保远程机器基础设施在线"],
    ["cdp \"任务描述\"",               "CDP模式：直控Windsurf前端 cascade（最可靠）"],
    ["cdprun \"任务\"",               "CDP一体化：提交+等待+回收响应"],
    ["cdptabs",                     "v215 五器·列出所有 Windsurf 可调试 tab"],
    ["cdpquota",                    "v215 五器·检测配额耗尽（30+关键词）"],
    ["cdpkill",                     "v215 五器·中断当前正在生成的任务"],
    ["cdpstream \"任务\"",            "v215 五器·提交+实时流式回收响应"],
    ["agentic \"任务描述\"",          "Agentic 模式：写文件/执行终端/完整工具链"],
    ["agentic \"任务\" --model <uid>", "指定模型执行 agentic 任务"],
    ["daemon",                     "启动 CSRF+基础设施守护进程（永续后台）"],
  ];
  for (const [c, d] of cmds) {
    console.log(`  ${C.b(c.padEnd(38))} ${C.d(d)}`);
  }
  console.log();
  console.log(`  ${C.d("示例:")}`);
  console.log(`  ${C.d("  node dao_master.cjs chat \"写一个快速排序\"")} `);
  console.log(`  ${C.d("  node dao_master.cjs remote 192.168.31.179 status")}`);
  console.log(`  ${C.d("  node dao_master.cjs server 7211")}`);
  console.log();
}

async function runCLI() {
  const args = process.argv.slice(2);
  const cmd  = args[0] || "help";

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  printBanner();

  // ── status ──
  if (cmd === "status") {
    const s = await getStatus();
    printStatus(s);
    return;
  }

  // ── ensure ──
  if (cmd === "ensure") {
    const r = await ensureAll();
    if (r.ok) ok("全部基础设施在线");
    else err("部分基础设施离线", JSON.stringify(r));
    return;
  }

  // ── csrf ──
  if (cmd === "csrf") {
    sep("CSRF 内存提取");
    const { port: lspPort } = await discoverLSP();
    const apiKey = extractApiKey();
    if (!apiKey) { err("无法获取 API Key"); return; }
    // 强制重新提取
    try { fs.unlinkSync(PATHS.csrfCache); } catch {}
    const csrf = await extractCSRF(lspPort, apiKey);
    if (csrf) {
      ok(`CSRF: ${C.y(csrf)}`);
      ok(`Port: ${lspPort}`);
    } else {
      err("CSRF 提取失败");
    }
    return;
  }

  // ── chat ──
  if (cmd === "chat") {
    const msgIdx = args.findIndex((a, i) => i > 0 && !a.startsWith("--"));
    const message = args[msgIdx] || args[1];
    if (!message) { err("缺少消息参数: node dao_master.cjs chat <消息>"); return; }

    const modelIdx = args.indexOf("--model");
    const model = modelIdx >= 0 ? args[modelIdx + 1] : "MODEL_GOOGLE_GEMINI_3_0_FLASH_LOW";

    sep(`对话: "${message.slice(0, 60)}${message.length > 60 ? "..." : ""}"`);

    // 确保基础设施
    const infra = await ensureAll();
    if (!infra.ok) { err("基础设施不完整，尝试继续..."); }

    try {
      const result = await chat(message, { model });
      sep("响应");
      console.log(C.g(result.response));
      console.log();
      inf(`CascadeId: ${C.d(result.cascadeId)}`);
      inf(`Steps: ${result.steps.length}`);
    } catch (e) {
      err("对话失败:", e.message);
    }
    return;
  }

  // ── agentic ──
  if (cmd === "agentic") {
    const task = args[1];
    if (!task) { err("缺少任务参数: node dao_master.cjs agentic \"任务描述\"\n  或: node dao_master.cjs exec \"任务描述\""); return; }
    const modelIdx = args.indexOf("--model");
    const model = modelIdx >= 0 ? args[modelIdx + 1] : "MODEL_CLAUDE_3_5_SONNET_20241022";
    const fileIdx = args.indexOf("--file");
    const openFile = fileIdx >= 0 ? args[fileIdx + 1] : "dao_master.cjs";
    sep(`Agentic 任务: "${task.slice(0, 60)}${task.length > 60 ? "..." : ""}"`);
    const infra = await ensureAll();
    if (!infra.ok) err("基础设施不完整，尝试继续...");
    try {
      const result = await agenticCascade(task, { model, openFile });
      sep("执行结果");
      console.log(C.g(result.response));
      console.log();
      inf(`CascadeId: ${C.d(result.cascadeId)}`);
      inf(`Steps: ${result.steps.length}  done=${result.done}`);
    } catch (e) { err("Agentic 任务失败:", e.message); }
    return;
  }

  // ── cdp (CDP直控Windsurf前端) ──
  if (cmd === "cdp") {
    const task = args[1];
    if (!task) { err("缺少任务参数: node dao_master.cjs cdp \"任务描述\""); return; }
    const portIdx  = args.indexOf("--port");
    const cdpPort  = portIdx >= 0 ? parseInt(args[portIdx + 1]) : 9222;
    const hintIdx  = args.indexOf("--tab");
    const tabHint  = hintIdx >= 0 ? args[hintIdx + 1] : "";
    const wantWait = args.includes("--wait");
    const waitIdx  = args.indexOf("--wait-timeout");
    const waitMs   = waitIdx >= 0 ? parseInt(args[waitIdx + 1]) : 90000;
    sep(`CDP直控Cascade: "${task.slice(0, 60)}${task.length > 60 ? "..." : ""}"`);
    try {
      const result = await cdpCascadeSend(task, { cdpPort, tabHint });
      if (result.ok) {
        ok(`★ Cascade 已提交！`);
        inf(`  Tab: ${result.tabTitle}`);
        inf(`  inputEmpty: ${result.inputEmpty}  thinkingEls: ${result.thinkingEls}`);
        inf(`  called: ${result.called.join(", ")}`);
        if (wantWait) {
          inf(`  等待 Cascade 完成 (最长 ${waitMs}ms)...`);
          const wr = await cdpCascadeWait(result.tabId, { cdpPort, timeoutMs: waitMs });
          if (wr.completed) ok(`★ 已完成 ${wr.elapsedMs}ms`);
          else inf(`  超时 ${wr.elapsedMs}ms (thinking 残留)`);
          if (wr.response) {
            sep("Cascade 响应");
            console.log(C.g(wr.response.slice(0, 1500)));
          }
        }
      } else {
        err(`CDP提交失败: called=${JSON.stringify(result.called)} val=${result.val}`);
      }
    } catch (e) { err("CDP失败:", e.message); }
    return;
  }

  // ── cdprun (CDP提交+等待+回收响应 · 一体化) ──
  if (cmd === "cdprun") {
    const task = args[1];
    if (!task) { err("缺少任务参数: node dao_master.cjs cdprun \"任务描述\""); return; }
    const portIdx   = args.indexOf("--port");
    const cdpPort   = portIdx >= 0 ? parseInt(args[portIdx + 1]) : 9222;
    const hintIdx   = args.indexOf("--tab");
    const tabHint   = hintIdx >= 0 ? args[hintIdx + 1] : "";
    const toutIdx   = args.indexOf("--timeout");
    const timeoutMs = toutIdx >= 0 ? parseInt(args[toutIdx + 1]) : 90000;
    sep(`cdpCascadeRun: "${task.slice(0, 60)}${task.length > 60 ? "..." : ""}" [等待完成]`);
    try {
      const result = await cdpCascadeRun(task, { cdpPort, tabHint, timeoutMs });
      if (result.ok) {
        ok(`★ 提交+完成！Tab: ${result.tabTitle}  耗时: ${result.elapsedMs}ms`);
        inf(`  submitted=${result.submitted}  completed=${result.completed}  called=${result.called?.join(", ")}`);
        if (result.response) {
          sep("Cascade 响应");
          console.log(C.g(result.response.slice(0, 2000)));
        } else {
          inf("  (无响应文本，请检查 thinking selector 是否匹配当前 Windsurf 版本)");
        }
      } else {
        err(`提交失败: ${JSON.stringify(result.called)}`);
      }
    } catch (e) { err("cdprun 失败:", e.message); }
    return;
  }

  // ── cdptabs (v215 五器之一) ──
  if (cmd === "cdptabs") {
    const portIdx = args.indexOf("--port");
    const cdpPort = portIdx >= 0 ? parseInt(args[portIdx + 1]) : 9222;
    sep(`CDP 可调试 Tab 列表 (port ${cdpPort})`);
    try {
      const tabs = await cdpEnumTabs({ cdpPort });
      if (!tabs.length) { inf("(无可调试 tab)"); return; }
      tabs.forEach((t, i) => {
        const mark = t.isWorkbench ? C.g("★workbench") : C.d("       ");
        console.log(`  ${C.b(String(i+1).padStart(2))}. ${mark}  ${C.w(t.title.slice(0, 40).padEnd(40))}  ${C.d(t.url.slice(0, 60))}`);
      });
      inf(`共 ${tabs.length} 个 tab，其中 ${tabs.filter(t=>t.isWorkbench).length} 个 workbench`);
    } catch (e) { err("cdptabs 失败:", e.message); }
    return;
  }

  // ── cdpquota (v215 五器之二) ──
  if (cmd === "cdpquota") {
    const portIdx = args.indexOf("--port");
    const cdpPort = portIdx >= 0 ? parseInt(args[portIdx + 1]) : 9222;
    const hintIdx = args.indexOf("--tab");
    const tabHint = hintIdx >= 0 ? args[hintIdx + 1] : "";
    sep(`CDP 配额耗尽检测 (port ${cdpPort})`);
    try {
      const r = await cdpQuotaCheck({ cdpPort, tabHint });
      if (r.quotaExhausted) {
        err(`★ 配额已耗尽！命中关键词: "${r.quotaKeyword}"  (Tab: ${r.tabTitle})`);
      } else {
        ok(`配额正常 (扫描 ${r.scanned} 区域，未命中)  Tab: ${r.tabTitle}`);
      }
    } catch (e) { err("cdpquota 失败:", e.message); }
    return;
  }

  // ── cdpkill (v215 五器之三 · 中断当前生成) ──
  if (cmd === "cdpkill") {
    const portIdx = args.indexOf("--port");
    const cdpPort = portIdx >= 0 ? parseInt(args[portIdx + 1]) : 9222;
    const hintIdx = args.indexOf("--tab");
    const tabHint = hintIdx >= 0 ? args[hintIdx + 1] : "";
    sep(`CDP 中断当前生成`);
    try {
      const r = await cdpInterrupt({ cdpPort, tabHint });
      if (r.stopped) ok(`★ 已点击 stop 按钮 (Tab: ${r.tabTitle})`);
      else if (r.hadSquare) inf(`找到 stop 按钮但点击未生效 (Tab: ${r.tabTitle})`);
      else inf(`无 stop 按钮 → AI 当前未在生成 (Tab: ${r.tabTitle})`);
    } catch (e) { err("cdpkill 失败:", e.message); }
    return;
  }

  // ── cdpstream (v215 五器之四 · 实时流式) ──
  if (cmd === "cdpstream") {
    const task = args[1];
    if (!task) { err("缺少任务参数: node dao_master.cjs cdpstream \"任务\""); return; }
    const portIdx = args.indexOf("--port");
    const cdpPort = portIdx >= 0 ? parseInt(args[portIdx + 1]) : 9222;
    const hintIdx = args.indexOf("--tab");
    const tabHint = hintIdx >= 0 ? args[hintIdx + 1] : "";
    const toIdx   = args.indexOf("--timeout");
    const timeoutMs = toIdx >= 0 ? parseInt(args[toIdx + 1]) : 90000;
    sep(`cdpCascadeStream: "${task.slice(0, 60)}${task.length > 60 ? "..." : ""}"`);
    let lastLen = 0;
    try {
      const r = await cdpCascadeStream(task, (text) => {
        if (text.length > lastLen) {
          process.stdout.write(C.d(`  [${text.length}b] `) + C.g(text.slice(lastLen, lastLen + 200)));
          lastLen = text.length;
        }
      }, { cdpPort, tabHint, timeoutMs });
      console.log("\n");
      if (r.quotaExhausted) err(`★ 配额已耗尽: ${r.quotaKeyword}`);
      else if (r.completed) ok(`★ 完成 ${r.elapsedMs}ms  steps=${r.stepCount}`);
      else if (r.timedOut)  inf(`超时 ${r.elapsedMs}ms`);
      sep("最终响应");
      console.log(C.g((r.response || "").slice(0, 2000)));
    } catch (e) { err("cdpstream 失败:", e.message); }
    return;
  }

  // ── exec (agenticExec: LLM生成脚本+本地直接执行) ──
  if (cmd === "exec") {
    const task = args[1];
    if (!task) { err("缺少任务参数: node dao_master.cjs exec \"任务描述\""); return; }
    const shellIdx = args.indexOf("--shell");
    const shell = shellIdx >= 0 ? args[shellIdx + 1] : (IS_WIN ? "powershell" : "bash");
    const dryRun = args.includes("--dry");
    sep(`AgenticExec: "${task.slice(0, 60)}${task.length > 60 ? "..." : ""}" [${shell}]${dryRun?" DRY_RUN":""}`);
    await ensureAll();
    try {
      const result = await agenticExec(task, { shell, dryRun });
      sep("生成脚本");
      console.log(C.d(result.script));
      if (!dryRun) {
        sep("执行输出");
        console.log(result.exitCode === 0 ? C.g(result.stdout) : C.r(result.stderr));
        inf(`ExitCode: ${result.exitCode}`);
      }
    } catch (e) { err("AgenticExec 失败:", e.message); }
    return;
  }

  // ── daemon ──
  if (cmd === "daemon") {
    sep("守护进程模式 · Ctrl+C 退出");
    await ensureAll();
    const cd = await csrfDaemon({ interval: 30000 });
    const id = await infraDaemon({ interval: 15000 });
    ok("所有守护进程已启动");
    inf("  CSRF 守护: 每30s 验证并自动刷新");
    inf("  基础设施守护: 每15s 检查 Router/Bridge/Gateway");
    process.stdin.resume();
    process.on("SIGINT", () => { cd.stop(); id.stop(); process.exit(0); });
    return;
  }

  // ── monitor ──
  if (cmd === "monitor") {
    const interval = parseInt(args[1]) || 5000;
    await monitorLoop(interval);
    return;
  }

  // ── server ──
  if (cmd === "server") {
    const port = parseInt(args[1]) || 7211;
    // 确保基础设施
    await ensureAll();
    await startApiServer(port);
    // keep alive
    process.stdin.resume();
    return;
  }

  // ── route ──
  if (cmd === "route") {
    const sub = args[1];
    if (!sub || sub === "list") { listRoutes(); return; }
    if (sub === "set") {
      const modelUid = args[2], target = args[3];
      if (!modelUid || !target) { err("用法: route set <modelUid> <target>"); return; }
      setRoute(modelUid, target);
      return;
    }
    err(`未知子命令: ${sub}`);
    return;
  }

  // ── restart ──
  if (cmd === "restart") {
    const what = args[1] || "router";
    if (what === "router") await restartRouter();
    else err(`未知组件: ${what}`);
    return;
  }

  // ── remote ──
  if (cmd === "remote") {
    const host = args[1];
    const remoteCmd = args[2];
    if (!host || !remoteCmd) {
      err("用法: remote <host> <命令> [参数...]");
      return;
    }

    sep(`远程操作: ${host} → ${remoteCmd}`);

    // 构建在远端运行的 Node.js 脚本
    let remoteScript;

    if (remoteCmd === "status") {
      remoteScript = buildRemoteStatusScript();
    } else if (remoteCmd === "ensure") {
      remoteScript = buildRemoteEnsureScript();
    } else if (remoteCmd === "csrf") {
      remoteScript = buildRemoteCSRFScript();
    } else if (remoteCmd === "chat") {
      const message = args[3] || "你好";
      const model = args[args.indexOf("--model") >= 0 ? args.indexOf("--model") + 1 : -1]
        || "MODEL_GOOGLE_GEMINI_3_0_FLASH_LOW";
      remoteScript = buildRemoteChatScript(message, model);
    } else {
      err(`未知远程命令: ${remoteCmd}`);
      return;
    }

    inf(`执行中 (可能需要60s)...`);
    const r = await remoteExec(host, remoteScript, 180000);
    if (r.code === 0 || r.out) {
      console.log(r.out || "(无输出)");
    } else {
      err(`远程执行失败 (code=${r.code}): ${r.err.slice(0, 200)}`);
    }
    return;
  }

  err(`未知命令: ${cmd}`);
  printHelp();
}

// ══════════════════════════════════════════════════════════════════════
// §12  远程脚本构建器（完全自包含，无外部依赖）
// ══════════════════════════════════════════════════════════════════════

function buildRemoteStatusScript() {
  return `
"use strict";
const http=require("http"),fs=require("fs"),{execSync}=require("child_process");
const PORTS={router:8879,bridge:8878,gateway:11435};
function hc(port){return new Promise(r=>{http.get("http://127.0.0.1:"+port+"/health",{timeout:3000},res=>{let d="";res.on("data",c=>d+=c);res.on("end",()=>{try{r({s:res.statusCode,j:JSON.parse(d)})}catch{r({s:res.statusCode,j:{}})}})}).on("error",()=>r({s:0,j:{}}))})}
(async()=>{
  // LSP 发现
  let lspPort=32661,lspPid="?";
  try{const out=execSync("netstat -ano",{encoding:"utf8"});for(const l of out.split("\\n")){const m=l.match(/127\\.0\\.0\\.1:(\\d{5})\\s+.*LISTEN\\s+(\\d+)/);if(m){const p=parseInt(m[1]);if(p>=30000&&p<=40000){lspPort=p;lspPid=m[2];break;}}}}catch{}
  // 读 API key
  let apiKey="?";
  try{const buf=fs.readFileSync(require("path").join(process.env.APPDATA,"Windsurf","User","globalStorage","state.vscdb")).toString("binary");const m=buf.match(/devin-session-token\\$[a-zA-Z0-9._-]{100,500}/g);if(m)apiKey=m[m.length-1].slice(0,30)+"...";}catch{}
  // CSRF 缓存
  let csrf="?";
  try{csrf=JSON.parse(fs.readFileSync(require("path").join(process.env.USERPROFILE,"_csrf_found.txt"),"utf8")).csrf.slice(0,8)+"...";}catch{}
  // 服务健康
  const [r,b,g]=await Promise.all([hc(PORTS.router),hc(PORTS.bridge),hc(PORTS.gateway)]);
  // 路由日志
  let lastRoutes=[];
  try{const lines=fs.readFileSync(require("path").join(process.env.USERPROFILE,"dao_router_log.txt"),"utf8").split("\\n");lastRoutes=lines.filter(l=>l.includes("GCM")||l.includes("ROUTE")||l.includes("stream")).slice(-3);}catch{}
  
  console.log("═══ REMOTE STATUS (" + require("os").hostname() + ") ═══");
  console.log("LSP     :"+lspPort+" PID="+lspPid);
  console.log("APIKey  :"+apiKey);
  console.log("CSRF    :"+csrf);
  console.log("Router  :"+PORTS.router+" alive="+(r.s===200)+" routes="+(r.j.router?.count||"?")+" routed="+(r.j.router?.stats?.routed||0));
  console.log("Bridge  :"+PORTS.bridge+" alive="+(b.s===200));
  console.log("Gateway :"+PORTS.gateway+" alive="+(g.s===200));
  if(lastRoutes.length>0){console.log("Routes:");lastRoutes.forEach(l=>console.log("  "+l.trim().slice(0,120)));}
  process.exit(0);
})();
`.trim();
}

function buildRemoteEnsureScript() {
  return `
"use strict";
const http=require("http"),fs=require("fs"),path=require("path"),os=require("os"),{spawn,execSync}=require("child_process");
const HOME=process.env.USERPROFILE||process.env.HOME||os.homedir();
const BYOK=path.join(HOME,".codeium","dao-byok");
const NODE_CANDS=[path.join(HOME,"AppData","Local","ms-playwright-go","1.50.1","node.exe"),path.join(HOME,"AppData","Local","ms-playwright-go","node.exe"),"C:\\\\Program Files\\\\nodejs\\\\node.exe","C:\\\\Program Files (x86)\\\\nodejs\\\\node.exe"];const NODE=NODE_CANDS.find(p=>fs.existsSync(p))||"node";
const PORTS={router:8879,bridge:8878,gateway:11435};
const SCRIPTS={router:path.join(HOME,"dao_h2c_router.js"),bridge:path.join(HOME,"dao_8878_bridge.js"),gateway:path.join(BYOK,"gateway","server.js")};
function hc(port){return new Promise(r=>{http.get("http://127.0.0.1:"+port+"/health",{timeout:3000},res=>{let d="";res.on("data",c=>d+=c);res.on("end",()=>{try{r({s:res.statusCode})}catch{r({s:res.statusCode})}})}).on("error",()=>r({s:0}))})}
function start(script,cwd){const p=spawn(NODE,[script],{cwd:cwd||HOME,detached:true,stdio:"ignore",windowsHide:true});p.unref();return p.pid;}
async function ensureSvc(name,port,script,cwd){let h=await hc(port);if(h.s===200){console.log(name+" :"+port+" already alive");return;}if(!fs.existsSync(script)){console.log(name+" script not found: "+script);return;}start(script,cwd);for(let i=0;i<15;i++){await new Promise(r=>setTimeout(r,3000));h=await hc(port);if(h.s===200){console.log(name+" :"+port+" started");return;}}console.log(name+" :"+port+" start TIMEOUT");}
(async()=>{
  await ensureSvc("Router",PORTS.router,SCRIPTS.router,HOME);
  await ensureSvc("Bridge",PORTS.bridge,SCRIPTS.bridge,HOME);
  await ensureSvc("Gateway",PORTS.gateway,SCRIPTS.gateway,path.dirname(SCRIPTS.gateway));
  await new Promise(r=>setTimeout(r,3000));
  const [r,b,g]=await Promise.all([hc(PORTS.router),hc(PORTS.bridge),hc(PORTS.gateway)]);
  console.log("FINAL: Router="+(r.s===200)+" Bridge="+(b.s===200)+" Gateway="+(g.s===200));
  process.exit(r.s===200&&b.s===200&&g.s===200?0:1);
})();
`.trim();
}

function buildRemoteCSRFScript() {
  return `
"use strict";
const http=require("http"),fs=require("fs"),path=require("path"),os=require("os"),{execSync}=require("child_process");
const HOME=process.env.USERPROFILE||process.env.HOME||os.homedir();
const APPDATA=process.env.APPDATA||path.join(HOME,"AppData","Roaming");
(async()=>{
  // 找 LSP Port
  let lspPort=32661,lspPid=null;
  try{const out=execSync("netstat -ano",{encoding:"utf8"});for(const l of out.split("\\n")){const m=l.match(/127\\.0\\.0\\.1:(\\d{5})\\s+.*LISTEN\\s+(\\d+)/);if(m){const p=parseInt(m[1]);if(p>=30000&&p<=40000){lspPort=p;const wm=execSync('wmic process where "ProcessId='+m[2]+'" get CommandLine /value',{encoding:"utf8"});if(wm.includes("language_server")){lspPid=parseInt(m[2]);break;}}}}}catch{}
  if(!lspPid){const wm=execSync('wmic process where "name=\'language_server_windows_x64.exe\'" get ProcessId /value',{encoding:"utf8"});const mm=wm.match(/ProcessId=(\\d+)/);if(mm)lspPid=parseInt(mm[1]);}
  // API Key
  const buf=fs.readFileSync(path.join(APPDATA,"Windsurf","User","globalStorage","state.vscdb")).toString("binary");
  const km=buf.match(/devin-session-token\\$[a-zA-Z0-9._-]{100,500}/g);
  const apiKey=km?km[km.length-1]:null;
  if(!apiKey){console.log("NO_APIKEY");process.exit(1);}
  // MiniDump
  const dumpPath=path.join(HOME,"_csrf_dump.dmp");
  try{fs.unlinkSync(dumpPath);}catch{}
  console.log("Dumping PID="+lspPid+"...");
  try{execSync('rundll32.exe comsvcs.dll, MiniDump '+lspPid+' "'+dumpPath+'" full',{timeout:30000,shell:true});}catch(e){console.log("DUMP_ERR:"+e.message);}
  await new Promise(r=>setTimeout(r,3000));
  if(!fs.existsSync(dumpPath)){console.log("DUMP_FAIL");process.exit(1);}
  // 扫 UUID
  const uuids=new Set();const uuidRe=/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;
  const CHUNK=10*1024*1024;const fd=fs.openSync(dumpPath,"r");const buf2=Buffer.alloc(CHUNK);let bytes;
  while((bytes=fs.readSync(fd,buf2,0,CHUNK))>0){const text=buf2.toString("ascii",0,bytes);let m;while((m=uuidRe.exec(text))!==null)uuids.add(m[0]);if(bytes<CHUNK)break;}
  fs.closeSync(fd);try{fs.unlinkSync(dumpPath);}catch{}
  console.log("UUIDs: "+uuids.size);
  // 暴力验证
  const META={ideName:"windsurf",extensionVersion:"${WINDSURF_EXT_VERSION}",ideVersion:"${WINDSURF_EXT_VERSION}",apiKey};
  function tryCSRF(csrf){return new Promise(r=>{const body=JSON.stringify({metadata:META});const req=http.request({hostname:"127.0.0.1",port:lspPort,path:"/exa.language_server_pb.LanguageServerService/Heartbeat",method:"POST",headers:{"content-type":"application/json","connect-protocol-version":"1","x-codeium-csrf-token":csrf,"content-length":Buffer.byteLength(body)},timeout:3000},res=>{r(res.statusCode===200)});req.on("error",()=>r(false));req.on("timeout",()=>{req.destroy();r(false)});req.write(body);req.end();});}
  const arr=[...uuids];
  for(let i=0;i<arr.length;i+=30){
    const batch=arr.slice(i,i+30);
    const results=await Promise.all(batch.map(tryCSRF));
    for(let j=0;j<results.length;j++){if(results[j]){const csrf=batch[j];fs.writeFileSync(path.join(HOME,"_csrf_found.txt"),JSON.stringify({csrf,port:lspPort,ts:new Date().toISOString()}));console.log("CSRF_FOUND:"+csrf);process.exit(0);}}
  }
  console.log("CSRF_NOT_FOUND");process.exit(1);
})();
`.trim();
}

function buildRemoteChatScript(message, model) {
  return `
"use strict";
const http=require("http"),fs=require("fs"),path=require("path"),os=require("os"),crypto=require("crypto");
const HOME=process.env.USERPROFILE||process.env.HOME||os.homedir();
const APPDATA=process.env.APPDATA||path.join(HOME,"AppData","Roaming");
(async()=>{
  const buf=fs.readFileSync(path.join(APPDATA,"Windsurf","User","globalStorage","state.vscdb")).toString("binary");
  const km=buf.match(/devin-session-token\\$[a-zA-Z0-9._-]{100,500}/g);
  const apiKey=km?km[km.length-1]:null;
  if(!apiKey){console.log("NO_APIKEY");process.exit(1);}
  const csrf=JSON.parse(fs.readFileSync(path.join(HOME,"_csrf_found.txt"),"utf8")).csrf;
  const lspPort=parseInt(JSON.parse(fs.readFileSync(path.join(HOME,"_csrf_found.txt"),"utf8")).port||32661);
  function rpc(method,body){const d=JSON.stringify(body);return new Promise(r=>{const req=http.request({hostname:"127.0.0.1",port:lspPort,path:"/exa.language_server_pb.LanguageServerService/"+method,method:"POST",headers:{"content-type":"application/json","connect-protocol-version":"1","x-codeium-csrf-token":csrf,"content-length":Buffer.byteLength(d)},timeout:60000},res=>{let s="";res.on("data",c=>s+=c);res.on("end",()=>{try{r({s:res.statusCode,j:JSON.parse(s)})}catch{r({s:res.statusCode,j:{}})}})});req.on("error",e=>r({s:0,j:{err:e.message}}));req.write(d);req.end();});}
  const meta={ideName:"windsurf",extensionVersion:"${WINDSURF_EXT_VERSION}",ideVersion:"${WINDSURF_EXT_VERSION}",apiKey,locale:"zh-CN",requestId:String(Date.now()),sessionId:crypto.randomUUID()};
  const sc=await rpc("StartCascade",{metadata:meta});
  const cid=sc.j.cascadeId;if(!cid){console.log("NO_CASCADE");process.exit(1);}
  console.log("CID="+cid);
  const sm=await rpc("SendUserCascadeMessage",{metadata:meta,cascadeId:cid,items:[{chunk:{case:"text",value:${JSON.stringify(message)}}}],cascadeConfig:{plannerConfig:{plannerTypeConfig:{case:"conversational"},requestedModelUid:${JSON.stringify(model)}}}});
  console.log("SEND="+sm.s);
  for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,3000));
    const t=await rpc("GetCascadeTrajectory",{metadata:meta,cascadeId:cid});
    const steps=t.j.trajectory?.steps||[];
    const types=steps.map(s=>(s.type||"").replace("CORTEX_STEP_TYPE_",""));
    process.stdout.write(".");
    for(const s of steps){const txt=s.plannerResponse?.response||s.plannerResponse?.modifiedResponse||s.writeText?.text;if(txt){console.log("\\nRESPONSE: "+txt.slice(0,1000));process.exit(0);}}
    if(steps.some(s=>s.type?.includes("ERROR")&&s.status?.includes("DONE"))&&i>=3){console.log("\\nERROR_DONE");process.exit(1);}
  }
  console.log("\\nTIMEOUT");process.exit(1);
})();
`.trim();
}

// ══════════════════════════════════════════════════════════════════════
// §13  模块导出（供其他脚本 require 使用）
// ══════════════════════════════════════════════════════════════════════

module.exports = {
  // core
  discoverLSP, extractApiKey, extractCSRF, metaObj,
  // infra
  ensureAll, ensureRouter, ensureBridge, ensureGateway, restartRouter, restartGateway,
  healthCheck, activeRouterPort, readWindsurfApiPort,
  // cascade
  cascadeStart, cascadeSend, cascadePoll, cascadeGetOrCreate, cascadeUpdateSession,
  directGatewayChat, GATEWAY_MODEL_MAP,
  agenticCascade, agenticExec,
  cdpEval, cdpCascadeSend, cdpCascadeWait, cdpCascadeRun,
  // v215 五器圆满
  cdpEnumTabs, cdpQuotaCheck, cdpInterrupt, cdpCascadeStream,
  // v216 万法归宗
  cdpSession, cdpProbe, cdpScreenshot, cdpVSCommand,
  cdpNetworkCapture, cdpGetEditorState, cdpTerminalRun, cdpOpenFile, cdpConsoleCapture,
  cdpEvalRaw,
  EXHAUST_KEYWORDS,
  csrfDaemon, infraDaemon,
  chat, extractText,
  // monitor
  getStatus, printStatus, monitorLoop,
  // route
  loadRouteConfig, setRoute, listRoutes,
  // remote
  remoteExec,
  buildRemoteStatusScript, buildRemoteEnsureScript,
  buildRemoteCSRFScript, buildRemoteChatScript,
  makeRemoteSnippet,
  // server
  startApiServer,
  // utils
  httpGet, httpPost, lspRpc, sleep, log, ok, err, inf, C,
  // constants
  PORTS, PATHS, VERSION,
};

// ══════════════════════════════════════════════════════════════════════
// §14  主程序入口
// ══════════════════════════════════════════════════════════════════════

if (require.main === module) {
  runCLI().catch(e => {
    console.error(C.r("FATAL: ") + e.message);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  });
}
