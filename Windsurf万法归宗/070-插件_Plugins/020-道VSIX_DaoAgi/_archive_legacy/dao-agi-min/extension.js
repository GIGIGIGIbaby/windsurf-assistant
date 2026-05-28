// extension.js · dao-agi-min v20.0 · 万法归宗 · 道法自然 · 无为而无不为
//
// 道德经 · 第四十八章: "为学日益, 为道日损. 损之又损, 以至于无为. 无为而无不为."
// 道德经 · 第十一章:   "三十辐共一毂, 当其无, 有车之用. 故有之以为利, 无之以为用."
// 道德经 · 第六十四章: "为者败之, 执者失之. 圣人无为故无败, 无执故无失."
//
// ═══════════════════════════════════════════════════════════════════
// 二核归一 (用户严令 · 其数一也):
//   一、WAM 010 本体 · vendor/wam/extension.js · 直引 · 不改一字 (切号 19 命令 + 切号面板)
//   二、道/官 模式热切 · 进程内 require 源.js + start() · invert (道德经 SP) ⇄ passthrough
//
// 二态互斥 · 无第三态 (无 off):
//   invert      — 道Agent · 反代 + 道德经 SP 替换 + 锚 settings → 127.0.0.1
//   passthrough — 官方Agent · 反代停 + 锚还原云端 · LS 直飞 server.codeium.com
//
// ═══════════════════════════════════════════════════════════════════
// 此插件源 dao-agi v18.3.1 (~195KB · 12物 · 33命) 之 **大归本源**:
//
//   砍 (彻底规避所有问题 · 用户严令):
//     ✗ bensource.js / essence-view.js / assembler.js (实时 SP 提取 · LS 卡 IDE)
//     ✗ ls-gate-patcher.js   (动 windsurf-dao u() · 141 全机瘫风险)
//     ✗ isolator.js          (workspace 6套隔离选项 · 着相)
//     ✗ watcher.js           (五层事件守 · 多余)
//     ✗ _water_virtues.js    (选举/降频/熔断 · v18.0 进程内化后无须)
//     ✗ _uninstall_sentinel  (vscdb 物理清 · 卸载后扫尾)
//     ✗ DPAPI / vscdb 二进制扫描 / Python 锚.py (v18.1 已弃)
//     ✗ 死锚自愈 / orphan proxy / sibling 账号迁移 / autoLsGate guard (复杂自愈链)
//     ✗ 自动更新 (jsdelivr fetch · L4 防线)
//     ✗ 自定义 SP 编辑 / 实时观照面板
//
//   留 (二核 · 仅必要):
//     ✓ vendor/wam/extension.js   (WAM 010 · 444KB · 切号本体 · 不改)
//     ✓ vendor/wam/bundled-origin/源.js + source.js + _dao_81.txt + VERSION (反代 + 道德经)
//     ✓ extension.js (本壳 · 薄如蝉翼) · 进程内 require 启停 + settings.json 单一锚
//     ✓ webview 切换面板 (道 ⇄ 官 二钮 · 即点即切)
//
//   防回归 (取自 dao-agi v18.x 痛史):
//     · 进程内 require + start()    (v18.0+ · 损 spawn detached 之根 · 共生死)
//     · settings.json 单一锚         (v18.1+ · 损 锚.py 与 vscdb 二进制扫之根)
//     · onView 触发                  (v18.3.1+ · 不点即不动 · 首装零侵入)
//     · default = passthrough        (v17.87+ · 首装无副作用 · 圣人之道为而不争)
//     · 二态归一 · 无 off            (v17.82+ · 损第三态之过)
//     · per-user 端口哈希            (v18.8+ · 多账号自然隔离 · 不抢)
"use strict";

const vscode = require("vscode");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execSync } = require("node:child_process");

// ═══════════════════════ 版本归一 · 唯 package.json ═══════════════════════
let PKG_VERSION = "0.0.0";
try { PKG_VERSION = require("./package.json").version || "0.0.0"; } catch {}

// ═══════════════════════ 常量 · 道法自然 · 三级软适配 ═══════════════════════
// env > vscode config > default
const PORT_BASE = 8889;
const PORT_RANGE_SPAN = 100; // 8889..8988
const HOT_DIRNAME = process.env.DAO_HOT_DIRNAME || ".wam-hot";
const VENDOR_SUBPATH = (process.env.DAO_VENDOR_SUBPATH || "wam/bundled-origin")
  .split(/[\\/]/).filter(Boolean);
const IS_WIN = process.platform === "win32";

// v18.8 · 多账号隔离 · per-user 端口 (FNV-1a 32-bit · 跨平台稳定)
function _fnv1a32(s) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
function _userScopedDefaultPort() {
  try {
    const username = (process.env.USERNAME || (os.userInfo && os.userInfo().username) || "")
      .toString().toLowerCase().trim();
    if (!username) return PORT_BASE;
    return PORT_BASE + (_fnv1a32(username) % PORT_RANGE_SPAN);
  } catch { return PORT_BASE; }
}
const DEFAULT_PORT = (() => {
  const env = parseInt(process.env.DAO_PORT || "", 10);
  if (Number.isFinite(env) && env > 0 && env < 65536) return env;
  return _userScopedDefaultPort();
})();

const DAO_QUOTES = [
  "道可道,非常道。", "反者道之动,弱者道之用。",
  "上善若水。水善利万物而不争。", "为无为,事无事,味无味。",
  "致虚极,守静笃。万物并作,吾以观复。", "信言不美,美言不信。",
  "天之道,利而不害。圣人之道,为而不争。", "大制不割。道法自然。",
];
function randomQuote() { return DAO_QUOTES[Math.floor(Math.random() * DAO_QUOTES.length)]; }

// ═══════════════════════ 日志 ═══════════════════════
let _channel = null;
function initLogger() {
  if (!_channel) _channel = vscode.window.createOutputChannel("道·AGI 极简");
  return _channel;
}
function _stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
function _emit(level, tag, msg) {
  initLogger().appendLine(`[${_stamp()}] [${level.toUpperCase()}] [${tag}] ${msg}`);
}
const log = {
  info: (tag, msg) => _emit("info", tag, msg),
  warn: (tag, msg) => _emit("warn", tag, msg),
  error: (tag, msg) => _emit("error", tag, msg),
  show: () => _channel && _channel.show(true),
  dispose: () => { if (_channel) { _channel.dispose(); _channel = null; } },
};

// ═══════════════════════ 配置 ═══════════════════════
function cfg() {
  const c = vscode.workspace.getConfiguration();
  // v18.8 · port: 用户主动设 → 取值; 否则 per-user hash
  const portInspect = c.inspect("dao.origin.port");
  const userPortValue = portInspect && (
    portInspect.globalValue !== undefined ? portInspect.globalValue :
    portInspect.workspaceValue !== undefined ? portInspect.workspaceValue :
    portInspect.workspaceFolderValue
  );
  return {
    port: typeof userPortValue === "number" && userPortValue > 0 ? userPortValue : DEFAULT_PORT,
    // v17.87+ · 默 passthrough · 首装无副作用 · 用户明示方启 invert
    defaultMode: c.get("dao.origin.defaultMode", "passthrough"),
    banner: c.get("dao.origin.banner", true),
  };
}

// ═══════════════════════ 路径 · vendor + hot ═══════════════════════
function extensionRoot() { return path.resolve(__dirname); }
function vendorDir() {
  const p = path.join(extensionRoot(), "vendor", ...VENDOR_SUBPATH);
  return fs.existsSync(p) ? p : null;
}
function hotDir() { return path.join(os.homedir(), HOT_DIRNAME, "origin"); }

/** 首激 · 复 vendor → ~/.wam-hot/origin (size 幂等 · 跳脏 state file) */
function ensureHot() {
  const vdir = vendorDir();
  const hdir = hotDir();
  if (!vdir) {
    log.warn("hot", "vendor/wam/bundled-origin 未发现");
    return { copied: 0, skipped: 0, dir: hdir };
  }
  fs.mkdirSync(hdir, { recursive: true });
  let copied = 0, skipped = 0;
  for (const name of fs.readdirSync(vdir)) {
    const src = path.join(vdir, name);
    const dst = path.join(hdir, name);
    try {
      const st = fs.statSync(src);
      if (!st.isFile()) continue;
      if (fs.existsSync(dst) && fs.statSync(dst).size === st.size) { skipped++; continue; }
      fs.copyFileSync(src, dst);
      copied++;
    } catch (e) { log.warn("hot", `复 ${name} 失: ${e && e.message}`); }
  }
  log.info("hot", `ready · copied=${copied} skipped=${skipped} dir=${hdir}`);
  return { copied, skipped, dir: hdir };
}

function isPortListening(port) {
  try {
    const cmd = IS_WIN
      ? `netstat -ano 2>nul | findstr ":${port} " | findstr "LISTENING"`
      : `lsof -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null`;
    const out = execSync(cmd, { timeout: 2000, encoding: "utf8", windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"], shell: true });
    return String(out).trim().length > 0;
  } catch { return false; }
}
function _findFreePort(startPort, maxTries) {
  const max = maxTries || 50;
  for (let p = startPort; p < startPort + max && p < 65535; p++) {
    if (!isPortListening(p)) return p;
  }
  return null;
}

// ═══════════════════════ 反代 · 进程内 require + start() (v18.0+) ═══════════════════════
//
// "为者败之, 执者失之. 圣人无为故无败, 无执故无失." (六十四章)
//   v17.x: spawn detached → 多 ext-host 共争 proxy → 须选举/守护 → zombie 风险
//   v18.0+: 进程内化 → 一 ext-host 一 in-process server → 自然 leader · 共生死
//   v20 (本): 不再继承水之四德/sentinel · 仅留进程内 + 在 ensureHot 之上
let _proxyHandle = null; // start() 返 · {server, port, host, close, getMode, setMode}

/** vendor 优先 · hot fallback (jsdelivr 自更兼容) */
function _resolveYuanJsPath() {
  const vdir = vendorDir();
  if (vdir) {
    for (const n of ["源.js", "source.js"]) {
      const fp = path.join(vdir, n);
      if (fs.existsSync(fp)) return fp;
    }
  }
  const hdir = hotDir();
  for (const n of ["源.js", "source.js"]) {
    const fp = path.join(hdir, n);
    if (fs.existsSync(fp)) return fp;
  }
  return null;
}

async function hijackStart(port) {
  port = port || DEFAULT_PORT;
  if (_proxyHandle && _proxyHandle.server && _proxyHandle.server.listening) {
    log.info("hijack", `源.js 已在进程内 :${_proxyHandle.port} · 复用`);
    return hijackStatus(port);
  }
  // 端口被外部占 → 找备用 (per-user hash 之后唯一冲突源)
  if (isPortListening(port)) {
    const free = _findFreePort(port + 1, 50);
    if (!free) {
      log.warn("hijack", `端口 :${port} 被外部占 + 无备 → 启代理放弃`);
      return hijackStatus(port);
    }
    log.warn("hijack", `端口 :${port} 被外部占 → 切备用 :${free}`);
    port = free;
  }
  ensureHot();
  const yuanPath = _resolveYuanJsPath();
  if (!yuanPath) throw new Error("源.js 未找到 (vendor + hot 皆无)");
  process.env.DAO_OWNER_NAME = process.env.USERNAME || "";
  // 清 require cache · 防热更失效 (deactivate→activate 路径需重载)
  try { delete require.cache[require.resolve(yuanPath)]; } catch {}
  log.info("hijack", `进程内 require ${yuanPath} on :${port}`);
  const yuan = require(yuanPath);
  if (typeof yuan.start !== "function") {
    throw new Error("源.js 缺 start() · 须 v18.0+ 库版");
  }
  _proxyHandle = await yuan.start({ port, host: "127.0.0.1" });
  log.info("hijack", `源.js 进程内启 · :${_proxyHandle.port} · pid=${process.pid}`);
  return hijackStatus(port);
}

async function hijackStop() {
  if (!_proxyHandle) return;
  log.info("hijack", "停 源.js (进程内 close)");
  try { await _proxyHandle.close(); } catch (e) { log.warn("hijack", `close: ${e && e.message}`); }
  _proxyHandle = null;
  try {
    const yuanPath = _resolveYuanJsPath();
    if (yuanPath) delete require.cache[require.resolve(yuanPath)];
  } catch {}
}

/** 切模式 · 进程内直调优先 · fallback HTTP */
async function hijackSetMode(mode, port) {
  if (_proxyHandle && typeof _proxyHandle.setMode === "function") {
    const prev = _proxyHandle.getMode();
    const ok = _proxyHandle.setMode(mode);
    return ok ? { ok: true, mode, prev } : { ok: false, error: `invalid mode: ${mode}` };
  }
  port = port || DEFAULT_PORT;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/origin/mode`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ mode }),
      signal: AbortSignal.timeout(8000),
    });
    const raw = (await resp.text()).slice(0, 2000);
    if (!resp.ok) return { ok: false, status: resp.status, raw };
    let parsed = null; try { parsed = JSON.parse(raw); } catch {}
    if (parsed && parsed.ok && parsed.mode === mode) {
      return { ok: true, mode: parsed.mode, prev: parsed.previous };
    }
    return { ok: false, raw, parsed };
  } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
}

async function hijackPingMode(port) {
  if (_proxyHandle && typeof _proxyHandle.getMode === "function") return _proxyHandle.getMode();
  port = port || DEFAULT_PORT;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/origin/mode`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) return "unknown";
    const t = (await r.text()).trim().toLowerCase();
    if (t.includes("invert")) return "invert";
    if (t.includes("passthrough")) return "passthrough";
    return "unknown";
  } catch { return "unknown"; }
}

/** 清自定义 SP · 防再切 invert 残留 */
async function hijackClearCustomSP(port) {
  port = port || DEFAULT_PORT;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/origin/custom_sp`, {
      method: "DELETE", headers: { connection: "close" },
      signal: AbortSignal.timeout(3000),
    });
    return (await resp.text()).slice(0, 500);
  } catch (e) { return `ERROR: ${e && e.message}`; }
}

function hijackStatus(port) {
  port = port || (_proxyHandle && _proxyHandle.port) || DEFAULT_PORT;
  const handleAlive = !!(_proxyHandle && _proxyHandle.server && _proxyHandle.server.listening);
  return {
    ready: !!vendorDir(),
    hotDir: hotDir(),
    vendorDir: vendorDir(),
    running: handleAlive || isPortListening(port),
    pid: handleAlive ? process.pid : undefined,
    port: handleAlive ? _proxyHandle.port : port,
    endpoint: `http://127.0.0.1:${handleAlive ? _proxyHandle.port : port}`,
  };
}

// ═══════════════════════ 锚 · settings.json 单一锚 (v18.1+ · BOM 兼容) ═══════════════════════
//
// 为学日益, 为道日损. 损之又损, 以至于无为, 无为而无不为. (四十八章)
//   旧 (v17.x): 锚.py 六层 (secret + ItemTable + globalState×N + settings)
//   今 (v18.1+): settings.json 单 (codeium.apiServerUrl + codeium.inferenceApiServerUrl)
//   理: 进程内化后 proxy 与 ext-host 共生死 · L1 race 已无 · settings 一锚足
function _settingsJsonPath() {
  const home = os.homedir();
  if (IS_WIN)
    return path.join(home, "AppData", "Roaming", "Windsurf", "User", "settings.json");
  if (process.platform === "darwin")
    return path.join(home, "Library", "Application Support", "Windsurf", "User", "settings.json");
  return path.join(home, ".config", "Windsurf", "User", "settings.json");
}

function _readSettingsJson(sp) {
  if (!fs.existsSync(sp)) return null;
  try {
    let txt = fs.readFileSync(sp, "utf8");
    if (txt.length > 0 && txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1); // BOM
    if (!txt.trim()) return {};
    const json = JSON.parse(txt);
    return (!json || typeof json !== "object" || Array.isArray(json)) ? {} : json;
  } catch (e) {
    log.warn("settings", `read: ${e && e.message}`);
    return null;
  }
}

function readApiServerUrl() {
  const json = _readSettingsJson(_settingsJsonPath());
  if (!json) return null;
  return json["codeium.apiServerUrl"] || json["codeium.inferenceApiServerUrl"] || null;
}

async function anchor(url) {
  const sp = _settingsJsonPath();
  const json = _readSettingsJson(sp);
  if (json === null) return { ok: false, output: "settings.json 解析失" };
  if (!fs.existsSync(sp)) return { ok: false, output: "settings.json 未发现" };
  const before1 = json["codeium.apiServerUrl"] || "(未设)";
  const before2 = json["codeium.inferenceApiServerUrl"] || "(未设)";
  json["codeium.apiServerUrl"] = url;
  json["codeium.inferenceApiServerUrl"] = url;
  try {
    fs.writeFileSync(sp, JSON.stringify(json, null, 2), "utf8");
    return { ok: true, output: `[settings.json 单一锚] api: ${before1} → ${url} · inf: ${before2} → ${url}` };
  } catch (e) { return { ok: false, output: `写: ${e && e.message}` }; }
}

async function anchorRestore() {
  const sp = _settingsJsonPath();
  if (!fs.existsSync(sp)) return { ok: true, output: "settings.json 未发现 · 无须还原" };
  const json = _readSettingsJson(sp);
  if (json === null) return { ok: false, output: "settings.json 解析失" };
  let changed = false;
  if (json["codeium.apiServerUrl"] != null) { delete json["codeium.apiServerUrl"]; changed = true; }
  if (json["codeium.inferenceApiServerUrl"] != null) { delete json["codeium.inferenceApiServerUrl"]; changed = true; }
  if (!changed) return { ok: true, output: "[已是官方默认 · 无须还原]" };
  try {
    fs.writeFileSync(sp, JSON.stringify(json, null, 2), "utf8");
    return { ok: true, output: "[settings.json 还原] codeium.{api,inference}ServerUrl 二键已删" };
  } catch (e) { return { ok: false, output: `写: ${e && e.message}` }; }
}

async function anchorStatus() {
  const url = readApiServerUrl();
  if (!url) return { ok: true, local: false, output: "无 codeium 锚 · 用官方默认" };
  const isLocal = url.includes("127.0.0.1") || url.includes("localhost");
  return { ok: true, local: isLocal, url, output: `${isLocal ? "已锚反代" : "指云端"}: ${url}` };
}

// ═══════════════════════ Agent 模式同步 (~/.wam-hot/agent_mode.json) ═══════════════════════
function syncAgentMode(mode) {
  try {
    const wamDir = path.join(os.homedir(), HOT_DIRNAME);
    fs.mkdirSync(wamDir, { recursive: true });
    fs.writeFileSync(path.join(wamDir, "agent_mode.json"),
      JSON.stringify({ agentMode: mode, ts: Date.now() }));
  } catch {}
}

// ═══════════════════════ 模式状态 (label) ═══════════════════════
async function getModeLabel(ctx) {
  const saved = ctx.globalState.get("wam.origin") || cfg().defaultMode || "passthrough";
  const port = ctx.globalState.get("wam.originPort") || cfg().port;
  if (saved === "passthrough") {
    try {
      const st = hijackStatus(port);
      return st.running ? `官方Agent · 反代待停 :${port}` : `官方Agent · 直连云端`;
    } catch { return `官方Agent · 直连云端`; }
  }
  try {
    const st = hijackStatus(port);
    if (!st.running) return `道Agent · 反代待启 :${port}`;
    const mode = await hijackPingMode(port);
    if (mode === "passthrough") return `道Agent · 反代待归道 :${port}`;
    return `道Agent 运行中 :${port}`;
  } catch { return `道Agent · 反代待启`; }
}

// ═══════════════════════ Webview · 道/官 二钮热切 (太上不知有之) ═══════════════════════
function daoToggleHtml(nonce, cspSource) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  :root { color-scheme: light dark; }
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: transparent; margin: 0; padding: 10px 8px; font-size: 12px; }
  .banner { text-align: center; font-style: italic; font-size: 10px; opacity: 0.6; margin-bottom: 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .btn { padding: 10px 4px; border: 1px solid transparent; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); cursor: pointer; font-size: 12px; border-radius: 2px; transition: background-color .12s, transform .08s; text-align: center; font-family: inherit; }
  .btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
  .btn:active { transform: scale(0.97); }
  .btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); font-weight: 600; }
  .row { display: flex; gap: 4px; margin-top: 6px; }
  .row .btn { flex: 1; font-size: 10px; padding: 4px 2px; }
  .status { text-align: center; margin-top: 8px; font-size: 10px; opacity: 0.65; min-height: 14px; line-height: 1.4; }
  .quote { text-align: center; margin-top: 4px; font-size: 10px; opacity: 0.4; font-style: italic; }
</style>
</head>
<body>
  <div class="banner">道法自然 · 无为而无不为</div>
  <div class="grid">
    <button class="btn dao" data-mode="invert" title="道Agent · 道德经 SP · 反代净化">🌊 道Agent</button>
    <button class="btn official" data-mode="passthrough" title="官方Agent · 锚归云 · 直连原味">☁️ 官方Agent</button>
  </div>
  <div class="row">
    <button class="btn" data-action="status" title="自检反代 + 锚定状态">🔬 自检</button>
    <button class="btn" data-action="logs" title="开输出通道">📜 日志</button>
  </div>
  <div class="status" id="status">加载中…</div>
  <div class="quote" id="quote"></div>
<script nonce="${nonce}">
(function(){
  const vscode = acquireVsCodeApi();
  const btns = document.querySelectorAll('.btn');
  const status = document.getElementById('status');
  const quote = document.getElementById('quote');
  function setActive(mode) {
    btns.forEach(function(b){
      const d = b.dataset.mode;
      if (!d) return;
      b.classList.toggle('active', d === mode);
    });
  }
  btns.forEach(function(b){
    b.addEventListener('click', function(){
      const m = b.dataset.mode;
      const a = b.dataset.action;
      if (m) {
        status.textContent = '切换中…';
        vscode.postMessage({ command: 'setMode', mode: m });
      } else if (a) {
        vscode.postMessage({ command: a });
      }
    });
  });
  window.addEventListener('message', function(e){
    const msg = e.data;
    if (msg.type === 'state') {
      setActive(msg.mode);
      status.textContent = msg.label || '';
      if (msg.quote) quote.textContent = msg.quote;
    }
  });
  vscode.postMessage({ command: 'requestState' });
})();
</script>
</body>
</html>`;
}

class DaoToggleProvider {
  constructor(ctx) { this._ctx = ctx; this._view = null; }
  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    const nonce = crypto.randomBytes(16).toString("base64");
    const cspSource = webviewView.webview.cspSource;
    webviewView.webview.html = daoToggleHtml(nonce, cspSource);
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (!msg) return;
      try {
        if (msg.command === "setMode") {
          const target = msg.mode === "invert" ? "wam.originInvert" : "wam.originPassthrough";
          await vscode.commands.executeCommand(target);
          setTimeout(() => this.refresh(), 500);
        } else if (msg.command === "status") {
          await vscode.commands.executeCommand("wam.verifyEndToEnd");
        } else if (msg.command === "logs") {
          log.show();
        } else if (msg.command === "requestState") {
          this.refresh();
        }
      } catch (e) { log.warn("toggle", `msg: ${e && e.message}`); }
    });
    this.refresh();
  }
  async refresh() {
    if (!this._view) return;
    const saved = this._ctx.globalState.get("wam.origin") || cfg().defaultMode || "passthrough";
    const label = await getModeLabel(this._ctx);
    this._view.webview.postMessage({ type: "state", mode: saved, label, quote: randomQuote() });
  }
  forceRefresh() { return this.refresh(); }
}

// ═══════════════════════ Origin 命令 (核心二命 + toggle/preview/E2E) ═══════════════════════
function registerOriginCommands(ctx, toggleProvider) {
  const refresh = () => toggleProvider && toggleProvider.refresh();

  ctx.subscriptions.push(
    // 道Agent · 启反代 + 锚 local + 模式 invert
    vscode.commands.registerCommand("wam.originInvert", async () => {
      try {
        const port = ctx.globalState.get("wam.originPort") || cfg().port;
        const st = hijackStatus(port);
        if (!st.running) {
          const s = await hijackStart(port);
          if (!s.running) {
            vscode.window.showErrorMessage("道Agent: 源.js 启动失败");
            return;
          }
        }
        const setRes = await hijackSetMode("invert", port);
        if (!setRes.ok) {
          log.warn("origin", `invert POST 失: ${setRes.error || setRes.status}`);
          vscode.window.showWarningMessage(`道Agent: 切模式失 · ${setRes.error || "proxy 返非 ok"}`);
          return;
        }
        const ar = await anchor(`http://127.0.0.1:${port}`);
        await ctx.globalState.update("wam.origin", "invert");
        await ctx.globalState.update("wam.originPort", port);
        syncAgentMode("dao");
        log.info("origin", `invert · port=${port} prev=${setRes.prev || "?"} anchor=${ar.ok}`);
        if (!ar.ok) log.warn("origin", `锚定失: ${ar.output.slice(0, 200)}`);
        refresh();
        vscode.window.showInformationMessage(`道Agent · 已启 (invert · 道德经 SP) · ${randomQuote()}`);
      } catch (e) {
        vscode.window.showErrorMessage(`道Agent: ${e && e.message}`);
      }
    }),

    // 官方Agent · 锚归云 + 反代停 (graceful · 道官分而治)
    vscode.commands.registerCommand("wam.originPassthrough", async () => {
      try {
        const port = ctx.globalState.get("wam.originPort") || cfg().port;
        const st = hijackStatus(port);
        // 一、若代理仍跑 · 先 graceful 转 passthrough · 让进行中请求纯转发 + 清 customSP
        if (st.running) {
          try {
            const setRes = await hijackSetMode("passthrough", port);
            if (!setRes.ok) {
              log.warn("origin", `passthrough graceful 失 (无伤 · 续锚还原+停): ${setRes.error || setRes.status}`);
            }
          } catch (e) { log.warn("origin", `passthrough graceful 异: ${e && e.message}`); }
          try {
            const clrResp = await hijackClearCustomSP(port);
            log.info("origin", `clear_customSP: ${clrResp.slice(0, 100)}`);
          } catch {}
        }
        // 二、还原锚 · 二键归官方云 · LS 下次请求即直飞
        let anchorOk = false, anchorOutput = "";
        try {
          const ar = await anchorRestore();
          anchorOk = !!ar.ok;
          anchorOutput = (ar.output || "").slice(0, 200);
          log.info("origin", `passthrough · anchorRestore ok=${anchorOk}`);
        } catch (e) { log.warn("origin", `anchorRestore 异: ${e && e.message}`); }
        // 三、停代理 · 物理消音 · 端口让出 (若仍跑)
        if (st.running) {
          try {
            await hijackStop();
            log.info("origin", `passthrough · 反代已停 · 锚已归官 · LS 直飞云`);
          } catch (e) { log.warn("origin", `停代理异: ${e && e.message}`); }
        }
        // 四、状态同步
        await ctx.globalState.update("wam.origin", "passthrough");
        await ctx.globalState.update("wam.originPort", port);
        syncAgentMode("official");
        log.info("origin", `passthrough 完毕 · port=${port} anchor=${anchorOk} · 道官分而治之`);
        refresh();
        if (anchorOk) vscode.window.showInformationMessage(`官方Agent · 已启 (锚归云 · 反代停)`);
        else vscode.window.showWarningMessage(`官方Agent · 已启但锚还原失: ${anchorOutput}`);
      } catch (e) {
        vscode.window.showWarningMessage(`官方Agent: ${e && e.message}`);
      }
    }),

    // 二态轮转 · 道 ⇄ 官方 (无 off · v17.82+)
    vscode.commands.registerCommand("dao.toggleMode", async () => {
      const current = ctx.globalState.get("wam.origin") || cfg().defaultMode || "passthrough";
      const next = current === "invert" ? "wam.originPassthrough" : "wam.originInvert";
      await vscode.commands.executeCommand(next);
    }),

    // 浏览器开 /origin/preview (观真 SP)
    vscode.commands.registerCommand("dao.openPreview", async () => {
      const port = ctx.globalState.get("wam.originPort") || cfg().port;
      const url = `http://127.0.0.1:${port}/origin/preview`;
      try { await vscode.env.openExternal(vscode.Uri.parse(url)); }
      catch (e) {
        vscode.window.showWarningMessage(`无法开浏览器: ${e && e.message} · 手动 ${url}`);
      }
    }),

    // E2E 自检 (反代 + 锚定 + 道德经 + 模式)
    vscode.commands.registerCommand("wam.verifyEndToEnd", async () => {
      const ch = vscode.window.createOutputChannel("道Agent · E2E 自检");
      ch.show(true);
      ch.appendLine(`═══ 道Agent v${PKG_VERSION} (极简版) E2E · ${new Date().toISOString()} ═══\n`);
      const port = ctx.globalState.get("wam.originPort") || cfg().port;
      const savedMode = ctx.globalState.get("wam.origin") || "passthrough";
      const r = (ok, label, detail) =>
        ch.appendLine(`  ${ok ? "✓" : "✗"} ${String(label).padEnd(28)} ${detail}`);
      const vdir = vendorDir();
      r(!!vdir, "vendor/wam/bundled-origin", vdir || "未发现");
      r(true, "hot dir", hotDir());
      const st = hijackStatus(port);
      r(st.running, "源.js (in-process)", st.running ? `:${port}` : `未运行 (saved=${savedMode})`);
      if (st.running) {
        const mode = await hijackPingMode(port);
        r(true, "运行模式", `${mode} (saved=${savedMode})`);
      }
      const anSt = await anchorStatus();
      r(anSt.ok, "锚定状态", anSt.output);
      ch.appendLine("\n═══ 完毕 ═══");
    }),
  );
}

// ═══════════════════════ Origin 自动恢复 ═══════════════════════
//
// "致虚极, 守静笃. 万物并作, 吾以观复." (十六章) · 复其旧态 · 不夺用户既意
//
// passthrough (官方Agent): 不启代理 · 锚归云 · 顺手停旧 (lockfile 残留)
// invert      (道Agent):   启代理 · 锚 local · 设 invert (代理可能 passthrough 残留 → 强归道)
function autoRestoreOrigin(ctx) {
  try {
    let saved = ctx.globalState.get("wam.origin");
    if (!saved || saved === "off") {
      // off 历史残留 · 归 default (passthrough · 圣人之道为而不争)
      saved = cfg().defaultMode || "passthrough";
      ctx.globalState.update("wam.origin", saved);
    }
    // v18.8 · 多账号迁移 · 旧 globalState 端口与 per-user hash 不一致 → 取新
    const effectivePort = cfg().port;
    const oldSavedPort = ctx.globalState.get("wam.originPort");
    if (oldSavedPort && oldSavedPort !== effectivePort) {
      log.info("origin", `多户迁: globalState=${oldSavedPort} → ${effectivePort} (per-user)`);
      ctx.globalState.update("wam.originPort", effectivePort);
    }
    const savedPort = effectivePort;

    if (saved === "passthrough") {
      // 官方Agent · 异步还原锚 + 顺手停旧代理
      anchorRestore()
        .then((ar) => log.info("origin", `passthrough 自启 · anchorRestore ok=${ar.ok}`))
        .catch((e) => log.warn("origin", `自启 anchorRestore 异: ${e && e.message}`));
      const stCheck = hijackStatus(savedPort);
      if (stCheck.running) {
        hijackStop()
          .then(() => log.info("origin", `passthrough · 旧代理 :${savedPort} 已停`))
          .catch(() => {});
      }
      log.info("origin", `passthrough 自启 · 不启代理 · 道官分而治之`);
      return;
    }

    if (saved === "invert") {
      // 道Agent · 启代理 (若需) + setMode invert + 锚 local
      const st = hijackStatus(savedPort);
      if (st.running) {
        hijackPingMode(savedPort).then(async (mode) => {
          if (mode !== "invert") {
            log.info("origin", `运行 mode=${mode} ≠ invert · 强 setMode`);
            await hijackSetMode("invert", savedPort);
          }
          const ar = await anchor(`http://127.0.0.1:${savedPort}`);
          log.info("origin", `热重载锚验: ok=${ar.ok}`);
        }).catch(() => {});
      } else {
        hijackStart(savedPort).then(async (s) => {
          if (s.running) {
            await hijackSetMode("invert", s.port);
            const ar = await anchor(`http://127.0.0.1:${s.port}`);
            log.info("origin", `冷恢: port=${s.port} mode=invert anchor=${ar.ok}`);
          } else {
            log.warn("origin", `冷恢失: 启动失 · 还原锚保 LS 不失联`);
            try {
              const ar = await anchorRestore();
              log.info("origin", `冷恢防御: anchorRestore ok=${ar.ok}`);
            } catch (e) { log.warn("origin", `冷恢防御异: ${e && e.message}`); }
          }
        }).catch((e) => log.warn("origin", `冷恢失: ${e && e.message}`));
      }
    }
  } catch (e) { log.warn("origin", `自恢异: ${e && e.message}`); }
}

// ═══════════════════════ WAM 010 加载 · 拦截 stub 命令 ═══════════════════════
//
// WAM 010 内留 origin 占位 stub (wam.originInvert/Passthrough/verifyEndToEnd · 仅提示).
// 我们要接管这些命令注入真实现 · 必须让 WAM 占位 stub 不注册 (否则 VS Code 抛重复).
// 法: 临时 hook vscode.commands.registerCommand · WAM 注此三命时静默放行.
// 不改 WAM 原片 · 不碰其他命令 · 不露痕迹 (太上不知有之 · 利而不害 · 为而不争)
const WAM_STUB_COMMANDS = new Set([
  "wam.originInvert",
  "wam.originPassthrough",
  "wam.verifyEndToEnd",
]);

let _wam = null;
function loadWamCore(ctx) {
  const wamPath = path.join(ctx.extensionPath, "vendor", "wam", "extension.js");
  if (!fs.existsSync(wamPath)) throw new Error(`WAM 010 未找: ${wamPath}`);
  const origRegister = vscode.commands.registerCommand;
  let skipped = 0;
  vscode.commands.registerCommand = function (cmd, callback, thisArg) {
    if (WAM_STUB_COMMANDS.has(cmd)) {
      skipped++;
      log.info("wam-hook", `skip WAM stub: ${cmd}`);
      return { dispose: function () {} };
    }
    return origRegister.apply(vscode.commands, arguments);
  };
  try {
    _wam = require(wamPath);
    if (typeof _wam.activate === "function") _wam.activate(ctx);
  } finally {
    vscode.commands.registerCommand = origRegister;
  }
  log.info("boot", `WAM 010 激活 · 道生一 · skipped=${skipped} stubs`);
}

// ═══════════════════════ activate / deactivate ═══════════════════════
exports.activate = async function (ctx) {
  initLogger();
  log.info("boot", `道Agent v${PKG_VERSION} · 极简 · WAM + 反代二态热切 · 道法自然`);
  log.info("boot", `extensionPath=${ctx.extensionPath} vscode=${vscode.version}`);

  // 一 · WAM 010 激活 (道生一)
  try {
    loadWamCore(ctx);
  } catch (e) {
    log.error("boot", `WAM 激活失: ${e && e.message}`);
    if (e && e.stack) log.error("boot", String(e.stack).split("\n").slice(0, 5).join("\n"));
    vscode.window.showErrorMessage(`WAM 010 激活失: ${e && e.message}`);
    return;
  }

  // 二 · ensureHot · vendor → ~/.wam-hot/origin (一生二)
  try {
    const h = ensureHot();
    log.info("boot", `origin hot: copied=${h.copied} skipped=${h.skipped} @ ${h.dir}`);
  } catch (e) { log.warn("boot", `ensureHot: ${e && e.message}`); }

  // 三 · Webview 切换面板 (二生三 · 道/官 二钮)
  const toggleProvider = new DaoToggleProvider(ctx);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider("dao.toggle", toggleProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // 四 · Origin 命令 (三生万物)
  registerOriginCommands(ctx, toggleProvider);

  // 五 · 自动恢复 (复其旧态 · 不夺既意)
  autoRestoreOrigin(ctx);

  // 横幅 (太上不知有之 · 可关)
  if (cfg().banner) {
    try {
      vscode.window.showInformationMessage(`道Agent v${PKG_VERSION} (极简) · ${randomQuote()}`);
    } catch {}
  }
  log.info("boot", `激活完毕 · v${PKG_VERSION} · 二核归一 · 道法自然`);
};

exports.deactivate = async function () {
  // v18.7.2 · 卸载/reload 双安: 先脱代理 + 锚还原, 再停代理
  // 卸载场景: deactivate 后 ext-host 死 · 须先 anchorRestore (settings 指云端) 再 hijackStop
  // reload 场景: deactivate 后 activate 立即又 anchor 回代理 · 仅微秒级浪费
  try {
    const port = (_proxyHandle && _proxyHandle.port) || DEFAULT_PORT;
    // 1. 清 customSP · 防再启 invert 残留
    try { if (_proxyHandle) await hijackClearCustomSP(port); } catch {}
    // 2. anchorRestore (settings.json 二键归云)
    try {
      const ar = await anchorRestore();
      log.info("deactivate", `anchorRestore: ok=${ar.ok}`);
    } catch (e) { log.warn("deactivate", `anchorRestore: ${e && e.message}`); }
    // 3. WAM deactivate
    try { if (_wam && typeof _wam.deactivate === "function") await _wam.deactivate(); } catch {}
    // 4. 停反代 (进程内 close · 共生死)
    try { await hijackStop(); } catch {}
  } catch (e) {
    try { log.warn("deactivate", `异常: ${e && e.message}`); } catch {}
  }
  try { log.dispose(); } catch {}
};
