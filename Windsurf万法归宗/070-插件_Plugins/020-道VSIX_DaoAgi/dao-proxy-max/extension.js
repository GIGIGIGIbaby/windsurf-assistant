"use strict";
/**
 * dao-omni · 道·BYOK 大极 · v1.2.0
 * ═══════════════════════════════════════════════════════════════════
 * 大曰逝, 逝曰远, 远曰反.
 *   既已远矣 (cascade-grand v1.0.0 之字串替换 fork · vendor 引用 0 次)
 *   今当反归本源 — 从根本底层重立 · 真融合 · 装即活 · 无感万源.
 *
 * 一身浑然 · 四力合一:
 *   ① 反代核 (vendor/bundled-origin/source.js · spawn 真起 · 字节级 SP 保 + BYOK_DAO 38 模)
 *   ② 070 网关 (vendor/gateway/server.js · spawn 真起 · 14 provider 真转)
 *   ③ vscode.lm 真注 (registerLanguageModelChatProvider · 3rd party 现身 Cascade 选单)
 *   ④ webview 控制面板 (UI 加/管/测 API key · 7 panel)
 *
 * 真药 OPMRE 五全:
 *   O · v1.0.5 全术: spawn-hook (cp.spawn/spawnSync/exec/execFile monkey-patch) 重写 LSP --api_server_url/--inference_api_server_url + forceRestartLS · anchorSettings=true 默 锁双键
 *       真凶是: language_server_windows_x64.exe 指令行参数写死官方 url · settings.json 不被读 · 唯 spawn-hook 拦被 spawn 时重写可入 · 后 forceRestartLS 让 codeium 扩展重 spawn LSP · 新 LSP 接到反代 url
 *   P+· uninstall race 3s → settings 锚未清. 治: omni.purge 调度 15s 给 LS 充足释放
 *   M · deactivate 杀 LS → 打断 Cascade. 治: deactivate 仅清锚, 不杀 proxy/gateway 子进程, 留下次复用
 *   R · SP 替换字节级不准 → 协议层泄. 治: 反代核字节级保 (source.js 自带 invertSP/modifySPProto/modifyRawSP)
 *   E · activate/deactivate 抢资源. 治: 全程不动 LS · 不抢官方端口 · 不写官方盘 · per-user FNV-1a hash
 *
 * 与 dao-proxy-min v11.1.0 / cascade-grand v1.0.0 五层不撞 (publisher/name/命令/配置/端口/网关).
 *
 * 道义: 道恒无名 · 侯王若能守之 · 万物将自化 · 无为而无不为.
 */

const vscode = require("vscode");
const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const os = require("os");
const cp = require("child_process");

// ═══════════════════════════════════════════════════════════════
// v1.0.5 · spawn-hook (调 dao-proxy-min v11.1.0 之理)
// LSP 启动参数 --api_server_url/--inference_api_server_url 写死官方 url
// 唯 monkey-patch child_process spawn 时拦 args 重写 · settings.json 不被 LSP 读 (仅为 UI 显记)
// ═══════════════════════════════════════════════════════════════
const _origSpawn = cp.spawn;
const _origSpawnSync = cp.spawnSync;
const _origExec = cp.exec;
const _origExecFile = cp.execFile;
let _spawnHooked = false;
let _hookedProxyUrl = null; // hook 拦时需之 url (同步 proxyUrl)

function _isLsCmd(command) {
  if (!command || typeof command !== "string") return false;
  return /language_server_(windows|macos|linux)/i.test(command);
}

function maybeRewriteLsArgs(command, args) {
  if (!_isLsCmd(command)) return false;
  if (!args || !Array.isArray(args)) return false;
  if (!_hookedProxyUrl) return false;
  let rewrote = 0;
  for (const flag of ["--api_server_url", "--inference_api_server_url"]) {
    const idx = args.indexOf(flag);
    if (
      idx >= 0 &&
      idx + 1 < args.length &&
      args[idx + 1] !== _hookedProxyUrl
    ) {
      log(
        "[spawn-hook] " + flag + ": " + args[idx + 1] + " → " + _hookedProxyUrl,
      );
      args[idx + 1] = _hookedProxyUrl;
      rewrote++;
    }
  }
  return rewrote > 0;
}

function installSpawnHook() {
  if (_spawnHooked) return;
  _spawnHooked = true;
  cp.spawn = function (cmd, a) {
    try {
      maybeRewriteLsArgs(cmd, a);
    } catch {}
    return _origSpawn.apply(this, arguments);
  };
  cp.spawnSync = function (cmd, a) {
    try {
      maybeRewriteLsArgs(cmd, a);
    } catch {}
    return _origSpawnSync.apply(this, arguments);
  };
  cp.execFile = function (cmd, a) {
    try {
      maybeRewriteLsArgs(cmd, a);
    } catch {}
    return _origExecFile.apply(this, arguments);
  };
  cp.exec = function (cmdline) {
    try {
      if (
        typeof cmdline === "string" &&
        /language_server_(windows|macos|linux)/i.test(cmdline) &&
        _hookedProxyUrl
      ) {
        const orig = cmdline;
        cmdline = cmdline.replace(
          /(--(?:inference_)?api_server_url(?:=|\s+))(\S+)/g,
          function (m, p1) {
            return p1 + _hookedProxyUrl;
          },
        );
        if (cmdline !== orig) {
          log("[spawn-hook] exec rewrite");
          arguments[0] = cmdline;
        }
      }
    } catch {}
    return _origExec.apply(this, arguments);
  };
  log("[spawn-hook] 装 (spawn/spawnSync/execFile/exec)");
}

function removeSpawnHook() {
  if (!_spawnHooked) return;
  cp.spawn = _origSpawn;
  cp.spawnSync = _origSpawnSync;
  cp.exec = _origExec;
  cp.execFile = _origExecFile;
  _spawnHooked = false;
  _hookedProxyUrl = null;
  log("[spawn-hook] 卸");
}

// v1.0.5 · 探 LSP 命令行 · 若仍含官方 url 则需 restart
// Windows: wmic / Get-CimInstance · POSIX: ps aux + grep
function _needRestartLS() {
  return new Promise(function (resolve) {
    if (!_hookedProxyUrl) return resolve(false);
    const plat = process.platform;
    let cmd, args;
    if (plat === "win32") {
      // wmic process where "name like 'language_server%'" get CommandLine /format:list
      cmd = "wmic";
      args = [
        "process",
        "where",
        "name like 'language_server%'",
        "get",
        "CommandLine",
        "/format:list",
      ];
    } else {
      cmd = "ps";
      args = ["aux"];
    }
    try {
      const proc = _origSpawn(cmd, args, { stdio: "pipe" });
      let out = "";
      if (proc.stdout)
        proc.stdout.on("data", function (d) {
          out += d;
        });
      let done = false;
      const finish = function () {
        if (done) return;
        done = true;
        // 判: 输出中是否有 language_server* + (server.codeium.com OR server.self-serve OR inference.codeium.com)
        const hasLs = /language_server_/i.test(out);
        const hasOfficial =
          /(server\.codeium\.com|server\.self-serve\.windsurf\.com|inference\.codeium\.com)/i.test(
            out,
          );
        const hasProxy = out.indexOf(_hookedProxyUrl) >= 0;
        log(
          "[_needRestartLS] hasLs=" +
            hasLs +
            " hasOfficial=" +
            hasOfficial +
            " hasProxy=" +
            hasProxy,
        );
        // 需重启: LSP 在跑 + 仍含官方 url + 未含反代 url
        resolve(hasLs && hasOfficial && !hasProxy);
      };
      proc.on("close", finish);
      proc.on("error", function (e) {
        log("[_needRestartLS] err: " + e.message);
        done = true;
        resolve(false);
      });
      // safety timeout 5s
      setTimeout(finish, 5000);
    } catch (e) {
      log("[_needRestartLS] catch: " + e.message);
      resolve(false);
    }
  });
}

function forceRestartLS() {
  return new Promise(function (resolve) {
    const userName = os.userInfo().username;
    const plat = process.platform;
    let cmd, args;
    if (plat === "win32") {
      cmd = "taskkill";
      args = [
        "/F",
        "/FI",
        "IMAGENAME eq language_server_windows_x64.exe",
        "/FI",
        "USERNAME eq " + userName,
      ];
    } else {
      const binName =
        plat === "darwin"
          ? "language_server_macos_arm"
          : "language_server_linux_x64";
      cmd = "pkill";
      args = ["-f", binName];
      try {
        const uid = String(os.userInfo().uid);
        if (uid && uid !== "-1") args.unshift("-u", uid);
      } catch {}
    }
    const proc = _origSpawn(cmd, args, { stdio: "pipe" });
    let out = "";
    if (proc.stdout)
      proc.stdout.on("data", function (d) {
        out += d;
      });
    if (proc.stderr)
      proc.stderr.on("data", function (d) {
        out += d;
      });
    proc.on("close", function (code) {
      log(
        "[forceRestartLS] " +
          plat +
          " " +
          cmd +
          " exit=" +
          code +
          " " +
          out.trim().slice(0, 200),
      );
      resolve(code === 0 || code === 128 || (plat !== "win32" && code === 1));
    });
    proc.on("error", function (e) {
      log("[forceRestartLS] err: " + e.message);
      resolve(false);
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// 全局态
// ═══════════════════════════════════════════════════════════════

let output = null;
let extContext = null;
let proxyProc = null;
let gatewayProc = null;
let proxyUrl = null;
let gatewayUrl = null;
let registrations = [];
let registeredProviders = [];
let statusBar = null;
let healthTimer = null;
let panel = null;
let settingsAnchored = false;
let originalApiServerUrl = null; // 锚前备份 codeium.apiServerUrl · purge 时还
let originalInferenceUrl = null; // v1.0.4 · 锚前备份 codeium.inferenceApiServerUrl · 双键

const EXT_ID = "dao-agi.dao-proxy-max";
const VERSION = "1.2.0";
const PROXY_PORT_BASE = 10889;
const PROXY_PORT_RANGE = 100;
const GATEWAY_PORT_BASE = 11635;
const GATEWAY_PORT_RANGE = 100;

// 道德经横幅 (banner)
const BANNER = [
  "═══════════════════════════════════════════════════════════════════",
  "  道·BYOK 大极 (dao-proxy-max) · v" + VERSION + " · 万法归宗",
  "═══════════════════════════════════════════════════════════════════",
  "  道恒无名, 侯王若能守之, 万物将自化.            《三十七章》",
  "  无为而无不为.                                   《四十八章》",
  "  大曰逝, 逝曰远, 远曰反.                         《二十五章》",
  "═══════════════════════════════════════════════════════════════════",
  "",
  "  ① 反代核    (vendor/bundled-origin/source.js · 字节级 SP 保)",
  "  ② 070 网关  (vendor/gateway/server.js · 14 provider 真转)",
  "  ③ vscode.lm 真注 (3rd party 模型现身 Cascade 选单)",
  "  ④ webview   控制面板 (UI 加/管/测 API key · 9 panel)",
  "  ★ 核心 API 统管 · 38 BYOK_DAO + 官方 4 BYOK 劫 + Provider 活态",
  "  ★ 外接api模型路由 · 朴散则为器 · substitute/devinCloud/cascadeRelay",
  "  ★ dao_devindao 自动spawn · Devin Cloud 接入",
  "",
  "  真药 OPMRE 五全 · 与 dao-* 五层不撞 · 道并行而不相悖.",
  "",
];

// ═══════════════════════════════════════════════════════════════
// 工具
// ═══════════════════════════════════════════════════════════════

function log(...args) {
  if (!output)
    output = vscode.window.createOutputChannel("道·BYOK 大极 (dao-proxy-max)");
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  output.appendLine(
    "[" +
      ts +
      "] " +
      args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" "),
  );
}

function getConfig() {
  return vscode.workspace.getConfiguration("omni");
}

// FNV-1a 32-bit · 算 per-user 端口 (不同主公自不同端口)
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function hashPort(base, range) {
  const user =
    (os.userInfo().username || "anon") +
    ":" +
    (process.env.USERPROFILE || process.env.HOME || os.homedir() || "");
  return base + (fnv1a(user) % range);
}

function resolveProxyPort() {
  const cfg = getConfig();
  const p = cfg.get("proxy.port") || 0;
  return p > 0 ? p : hashPort(PROXY_PORT_BASE, PROXY_PORT_RANGE);
}

function resolveGatewayPort() {
  const cfg = getConfig();
  const p = cfg.get("gateway.port") || 0;
  return p > 0 ? p : hashPort(GATEWAY_PORT_BASE, GATEWAY_PORT_RANGE);
}

function resolveGatewayUrl() {
  const cfg = getConfig();
  const ext = (cfg.get("gateway.url") || "").replace(/\/+$/, "");
  if (ext) return ext;
  return "http://127.0.0.1:" + resolveGatewayPort();
}

function resolveProxyUrl() {
  return "http://127.0.0.1:" + resolveProxyPort();
}

// ═══════════════════════════════════════════════════════════════
// HTTP 工具
// ═══════════════════════════════════════════════════════════════

function httpJSON(method, url, headers, body, timeout) {
  if (timeout === undefined) timeout = 15000;
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return reject(e);
    }
    const mod = u.protocol === "https:" ? https : http;
    const payload = body
      ? typeof body === "string"
        ? body
        : JSON.stringify(body)
      : null;
    const opts = {
      method: method,
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      headers: Object.assign(
        { "Content-Type": "application/json", Accept: "application/json" },
        headers || {},
      ),
      timeout: timeout,
    };
    if (payload) opts.headers["Content-Length"] = Buffer.byteLength(payload);
    const req = mod.request(opts, (res) => {
      let buf = "";
      res.on("data", (c) => {
        buf += c;
      });
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode,
            data: buf ? JSON.parse(buf) : null,
            raw: buf,
          });
        } catch {
          resolve({ status: res.statusCode, data: null, raw: buf });
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (payload) req.write(payload);
    req.end();
  });
}

function httpStream(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return reject(e);
    }
    const mod = u.protocol === "https:" ? https : http;
    const payload = body
      ? typeof body === "string"
        ? body
        : JSON.stringify(body)
      : null;
    const opts = {
      method: method,
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      headers: Object.assign(
        { "Content-Type": "application/json", Accept: "text/event-stream" },
        headers || {},
      ),
      timeout: 600000,
    };
    if (payload) opts.headers["Content-Length"] = Buffer.byteLength(payload);
    const req = mod.request(opts, (res) => {
      if (res.statusCode >= 400) {
        let buf = "";
        res.on("data", (c) => {
          buf += c;
        });
        res.on("end", () =>
          reject(
            new Error("HTTP " + res.statusCode + ": " + buf.slice(0, 300)),
          ),
        );
        return;
      }
      resolve(res);
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// 反代核生命周期
// ═══════════════════════════════════════════════════════════════

async function pingProxy(url, ms) {
  if (ms === undefined) ms = 1000;
  try {
    const r = await httpJSON("GET", url + "/origin/ping", null, null, ms);
    return r.status === 200;
  } catch {
    return false;
  }
}

function locateBundledSource() {
  const candidates = [
    path.resolve(__dirname, "vendor", "bundled-origin", "source.js"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

async function ensureProxy() {
  const cfg = getConfig();
  if (!cfg.get("proxy.enabled", true)) {
    log("反代已禁 (omni.proxy.enabled=false)");
    return null;
  }
  const url = resolveProxyUrl();
  if (await pingProxy(url, 800)) {
    log("反代已在线: " + url);
    proxyUrl = url;
    return url;
  }
  const script = locateBundledSource();
  if (!script) {
    log("✗ vendor/bundled-origin/source.js 未找到 (vsix 损?)");
    return null;
  }
  const port = resolveProxyPort();
  const mode = cfg.get("proxy.defaultMode") || "passthrough";
  log("启反代核: " + script);
  log("  port=" + port + "  mode=" + mode);
  try {
    proxyProc = cp.spawn(process.execPath, [script], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: Object.assign({}, process.env, {
        ORIGIN_PORT: String(port),
        ORIGIN_MODE: mode,
        DAO_FILE: path.join(
          __dirname,
          "vendor",
          "bundled-origin",
          "_dao_81.txt",
        ),
      }),
      cwd: path.dirname(script),
    });
    proxyProc.stdout.on("data", (d) => {
      const t = d.toString().trimEnd();
      if (t)
        log("[proxy] " + t.split("\n").slice(0, 2).join(" / ").slice(0, 220));
    });
    proxyProc.stderr.on("data", (d) => {
      const t = d.toString().trimEnd();
      if (t)
        log("[proxy!] " + t.split("\n").slice(0, 2).join(" / ").slice(0, 220));
    });
    proxyProc.on("exit", (code) => {
      log("[proxy] 退出 code=" + code);
      proxyProc = null;
    });
    proxyProc.unref();
    // 等就绪 · 至多 ~7.5s
    const target = "http://127.0.0.1:" + port;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await pingProxy(target, 500)) {
        proxyUrl = target;
        log("✓ 反代就绪: " + target);
        return target;
      }
    }
    log("✗ 反代启动超时 (7.5s)");
  } catch (e) {
    log("✗ 反代启动失败: " + e.message);
  }
  return null;
}

function stopProxyProc() {
  if (proxyProc) {
    try {
      proxyProc.kill();
    } catch {}
    proxyProc = null;
    log("反代进程已停 (本会话所启)");
  } else {
    log("反代进程非本会话所启 · 跳过 (真药 M)");
  }
  proxyUrl = null;
}

// ═══════════════════════════════════════════════════════════════
// 070 网关生命周期
// ═══════════════════════════════════════════════════════════════

async function pingGateway(url, ms) {
  if (ms === undefined) ms = 1000;
  try {
    const r = await httpJSON("GET", url + "/health", null, null, ms);
    return r.status === 200 && r.data && r.data.status === "ok";
  } catch {
    return false;
  }
}

function locateBundledGateway() {
  const candidates = [
    path.resolve(__dirname, "vendor", "gateway", "server.js"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

async function ensureGateway() {
  const cfg = getConfig();
  if (!cfg.get("gateway.enabled", true)) {
    log("网关已禁 (omni.gateway.enabled=false)");
    return null;
  }
  const ext = (cfg.get("gateway.url") || "").trim();
  if (ext) {
    if (await pingGateway(ext)) {
      log("外部网关在跑: " + ext);
      gatewayUrl = ext;
      return ext;
    }
    log("外部网关不可达: " + ext + " · 回退内嵌");
  }
  const url = "http://127.0.0.1:" + resolveGatewayPort();
  if (await pingGateway(url, 800)) {
    log("网关已在线: " + url);
    gatewayUrl = url;
    return url;
  }
  const script = locateBundledGateway();
  if (!script) {
    log("✗ vendor/gateway/server.js 未找到");
    return null;
  }
  const port = resolveGatewayPort();
  const cfgPath = (cfg.get("gateway.configPath") || "").trim();
  log("启 070 网关: " + script);
  log("  port=" + port + (cfgPath ? "  config=" + cfgPath : ""));
  try {
    const args = [script, "--port=" + port];
    if (cfgPath) args.push("--config=" + cfgPath);
    gatewayProc = cp.spawn(process.execPath, args, {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      cwd: path.dirname(script),
    });
    gatewayProc.stdout.on("data", (d) => {
      const t = d.toString().trimEnd();
      if (t) log("[gw] " + t.split("\n").slice(0, 2).join(" / ").slice(0, 220));
    });
    gatewayProc.stderr.on("data", (d) => {
      const t = d.toString().trimEnd();
      if (t)
        log("[gw!] " + t.split("\n").slice(0, 2).join(" / ").slice(0, 220));
    });
    gatewayProc.on("exit", (code) => {
      log("[gw] 退出 code=" + code);
      gatewayProc = null;
    });
    gatewayProc.unref();
    const target = "http://127.0.0.1:" + port;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await pingGateway(target, 500)) {
        gatewayUrl = target;
        log("✓ 网关就绪: " + target);
        return target;
      }
    }
    log("✗ 网关启动超时 (7.5s)");
  } catch (e) {
    log("✗ 网关启动失败: " + e.message);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// vscode.lm 消息翻译 (复用 dao-byok-vsix 之思路)
// ═══════════════════════════════════════════════════════════════

function toOpenAIMessages(vscodeMessages) {
  const out = [];
  for (const m of vscodeMessages) {
    let role = "user";
    if (
      (m.role === vscode.LanguageModelChatMessageRole &&
        vscode.LanguageModelChatMessageRole.System) ||
      m.role === 0 ||
      m.role === "system"
    )
      role = "system";
    else if (
      m.role ===
        (vscode.LanguageModelChatMessageRole &&
          vscode.LanguageModelChatMessageRole.Assistant) ||
      m.role === 2 ||
      m.role === "assistant"
    )
      role = "assistant";
    else role = "user";

    const parts = Array.isArray(m.content) ? m.content : [m.content];
    const texts = [];
    const toolCalls = [];
    const toolResults = [];

    for (const p of parts) {
      if (typeof p === "string") {
        texts.push(p);
        continue;
      }
      if (!p) continue;
      if (p.value !== undefined && typeof p.value === "string") {
        texts.push(p.value);
        continue;
      }
      if (p.text !== undefined && typeof p.text === "string") {
        texts.push(p.text);
        continue;
      }
      if (p.callId && p.name) {
        toolCalls.push({
          id: p.callId,
          type: "function",
          function: {
            name: p.name,
            arguments: JSON.stringify(p.input || p.parameters || {}),
          },
        });
        continue;
      }
      if (p.callId && p.content !== undefined) {
        let content;
        if (Array.isArray(p.content)) {
          content = p.content
            .map((c) =>
              c && c.value !== undefined
                ? c.value
                : c && c.text !== undefined
                  ? c.text
                  : typeof c === "string"
                    ? c
                    : JSON.stringify(c),
            )
            .join("");
        } else {
          content =
            typeof p.content === "string"
              ? p.content
              : JSON.stringify(p.content);
        }
        toolResults.push({
          role: "tool",
          tool_call_id: p.callId,
          content: content,
        });
        continue;
      }
      try {
        texts.push(JSON.stringify(p));
      } catch {
        texts.push(String(p));
      }
    }

    for (const tr of toolResults) out.push(tr);

    const msg = { role: role };
    const joinedText = texts.join("");
    if (role === "assistant") {
      if (joinedText) msg.content = joinedText;
      if (toolCalls.length) msg.tool_calls = toolCalls;
      if (!msg.content && !msg.tool_calls) msg.content = "";
      out.push(msg);
    } else {
      if (joinedText) {
        msg.content = joinedText;
        out.push(msg);
      } else if (!toolResults.length) {
        msg.content = "";
        out.push(msg);
      }
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// vscode.lm Provider
// ═══════════════════════════════════════════════════════════════

function makeProvider(vendor, provider, gwUrl) {
  const cfg = getConfig();
  const authKey = cfg.get("gateway.authKey") || "";
  const maxIn = cfg.get("lm.maxInputTokens") || 200000;
  const maxOut = cfg.get("lm.maxOutputTokens") || 8192;

  const makeModelInfo = (model) => ({
    id: vendor + "/" + model,
    name: model,
    vendor: vendor,
    family: provider.name || vendor,
    version: model,
    maxInputTokens: maxIn,
    maxOutputTokens: maxOut,
  });

  return {
    async provideLanguageModelChatInformation() {
      return provider.models.filter((m) => m !== "auto").map(makeModelInfo);
    },
    provideLanguageModelChatModels() {
      return provider.models.filter((m) => m !== "auto").map(makeModelInfo);
    },
    async *provideLanguageModelChatResponse(
      model,
      messages,
      options,
      progress,
      token,
    ) {
      const modelName =
        typeof model === "string"
          ? model
          : (model && model.version) ||
            (model && model.name) ||
            (model && model.id && model.id.split("/").slice(1).join("/")) ||
            provider.models[0];
      const body = {
        model: vendor + "/" + modelName,
        messages: toOpenAIMessages(messages),
        stream: true,
        max_tokens: (options && options.maxTokens) || maxOut,
      };
      if (options && options.temperature !== undefined)
        body.temperature = options.temperature;
      if (options && options.stopSequences) body.stop = options.stopSequences;
      if (options && Array.isArray(options.tools) && options.tools.length) {
        body.tools = options.tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema ||
              t.parameters || { type: "object", properties: {} },
          },
        }));
      }
      log(
        "→ " +
          vendor +
          "/" +
          modelName +
          "  messages=" +
          body.messages.length +
          "  tools=" +
          ((body.tools && body.tools.length) || 0),
      );

      const headers = {};
      if (authKey) headers["Authorization"] = "Bearer " + authKey;
      const res = await httpStream(
        "POST",
        gwUrl + "/v1/chat/completions",
        headers,
        body,
      );

      let buf = "";
      const toolBuf = new Map();
      res.on("data", () => {});

      for await (const chunk of res) {
        buf += chunk.toString();
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of block.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (raw === "[DONE]") continue;
            let data;
            try {
              data = JSON.parse(raw);
            } catch {
              continue;
            }
            const choice = data.choices && data.choices[0];
            const delta = (choice && choice.delta) || {};
            if (typeof delta.content === "string" && delta.content.length) {
              if (vscode.LanguageModelTextPart) {
                yield new vscode.LanguageModelTextPart(delta.content);
              } else {
                yield delta.content;
              }
            }
            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const key = tc.index !== undefined ? tc.index : tc.id || 0;
                let rec = toolBuf.get(key);
                if (!rec) {
                  rec = { id: tc.id, name: "", args: "" };
                  toolBuf.set(key, rec);
                }
                if (tc.id) rec.id = tc.id;
                if (tc.function && tc.function.name)
                  rec.name += tc.function.name;
                if (tc.function && tc.function.arguments)
                  rec.args += tc.function.arguments;
              }
            }
            if (
              choice &&
              (choice.finish_reason === "tool_calls" ||
                choice.finish_reason === "stop")
            ) {
              for (const rec of toolBuf.values()) {
                if (!rec.name) continue;
                let input = {};
                try {
                  input = JSON.parse(rec.args || "{}");
                } catch {}
                if (vscode.LanguageModelToolCallPart) {
                  yield new vscode.LanguageModelToolCallPart(
                    rec.id,
                    rec.name,
                    input,
                  );
                }
              }
              toolBuf.clear();
            }
          }
        }
        if (token && token.isCancellationRequested) {
          try {
            res.destroy();
          } catch {}
          return;
        }
      }
    },
    async provideTokenCount(model, text) {
      const s = typeof text === "string" ? text : JSON.stringify(text);
      return Math.ceil(s.length / 4);
    },
  };
}

async function registerProviders(gwUrl) {
  const cfg = getConfig();
  if (!cfg.get("lm.enabled", true)) {
    log("vscode.lm 注册已禁 (omni.lm.enabled=false)");
    return;
  }
  // 清旧注
  for (const r of registrations) {
    try {
      r.dispose();
    } catch {}
  }
  registrations = [];
  registeredProviders = [];

  let providers = [];
  try {
    const r = await httpJSON("GET", gwUrl + "/__dao/providers");
    if (r.status === 200 && r.data && r.data.providers)
      providers = r.data.providers;
  } catch (e) {
    log("获取 providers 失败: " + e.message);
    return;
  }

  const vendorPrefix = cfg.get("lm.vendorPrefix");
  const prefix = vendorPrefix === undefined ? "dao-" : vendorPrefix;

  for (const p of providers) {
    if (!p.models || p.models.length === 0) continue;
    const vendor = prefix + p.name.toLowerCase();
    try {
      const provider = makeProvider(vendor, p, gwUrl);
      const api =
        vscode.lm.registerLanguageModelChatProvider ||
        vscode.lm.registerChatModelProvider ||
        vscode.lm.registerLanguageModelProvider;
      if (!api) {
        log(
          "vscode.lm.registerLanguageModelChatProvider 不存在 · 此环境 LM API 缺",
        );
        return;
      }
      let disposable;
      try {
        disposable = api.call(vscode.lm, vendor, provider, {
          vendor: vendor,
          name: p.label || p.name,
          family: p.name,
          version: VERSION,
          maxInputTokens: 200000,
          maxOutputTokens: 8192,
        });
      } catch (e1) {
        try {
          disposable = api.call(vscode.lm, vendor, provider);
        } catch (e2) {
          log("注册 " + vendor + " 失败: " + e1.message + " / " + e2.message);
          continue;
        }
      }
      registrations.push(disposable);
      registeredProviders.push({
        vendor: vendor,
        provider: p.name,
        models: p.models,
        label: p.label,
      });
      log("✓ 注 " + vendor + "  (" + p.models.length + " 模)");
    } catch (e) {
      log("✗ " + vendor + ": " + e.message);
    }
  }
  const total = registeredProviders.reduce((n, x) => n + x.models.length, 0);
  log(
    "vscode.lm 目录就绪: " +
      registeredProviders.length +
      " providers · " +
      total +
      " 模",
  );
  updateStatusBar();
}

// ═══════════════════════════════════════════════════════════════
// settings.json 锚 (条件性 · 真药 O)
// ═══════════════════════════════════════════════════════════════

// v1.0.4 · settings.json 文件路径 (调 dao-proxy-min v11.1.0 之理 · VSCode API 失败时为兜底)
function _settingsJsonPath() {
  // Windsurf User settings.json: %APPDATA%/Windsurf/User/settings.json (Win) | ~/Library/Application Support/Windsurf/User/settings.json (mac) | ~/.config/Windsurf/User/settings.json (Linux)
  const home = process.env.USERPROFILE || process.env.HOME || "";
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(home, "AppData", "Roaming"),
      "Windsurf",
      "User",
      "settings.json",
    );
  } else if (process.platform === "darwin") {
    return path.join(
      home,
      "Library",
      "Application Support",
      "Windsurf",
      "User",
      "settings.json",
    );
  } else {
    return path.join(home, ".config", "Windsurf", "User", "settings.json");
  }
}

function _readSettingsJson(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch (e) {
    log("_readSettingsJson 失败: " + e.message);
    return null;
  }
}

function _writeSettingsJson(fp, json) {
  try {
    fs.writeFileSync(fp, JSON.stringify(json, null, 2), "utf8");
    return true;
  } catch (e) {
    log("_writeSettingsJson 失败: " + e.message);
    return false;
  }
}

async function anchorSettings(targetUrl) {
  const cfg = getConfig();
  // v1.0.4 · 默 true (原默 false · 反置 · BYOK 劫持本源底层需)
  if (!cfg.get("proxy.anchorSettings", true)) return;
  if (cfg.get("proxy.defaultMode") !== "invert") {
    log(
      "anchorSettings 跳过 (mode=passthrough · 真药 O · 仅 invert+主公请始锚)",
    );
    return;
  }
  if (!targetUrl) return;
  try {
    const codeium = vscode.workspace.getConfiguration("codeium");
    // 备 原值 (双键)
    const curApi = codeium.get("apiServerUrl");
    const curInfer = codeium.get("inferenceApiServerUrl");
    if (curApi !== targetUrl) originalApiServerUrl = curApi || "";
    if (curInfer !== targetUrl) originalInferenceUrl = curInfer || "";

    // 方法 1 · VS Code API (内存即时生效) · 双键各 try
    let apiUpdated = false;
    let inferUpdated = false;
    try {
      await codeium.update(
        "apiServerUrl",
        targetUrl,
        vscode.ConfigurationTarget.Global,
      );
      apiUpdated = true;
    } catch (e) {
      log("  API set apiServerUrl 失: " + e.message);
    }
    try {
      await codeium.update(
        "inferenceApiServerUrl",
        targetUrl,
        vscode.ConfigurationTarget.Global,
      );
      inferUpdated = true;
    } catch (e) {
      log("  API set inferenceApiServerUrl 失: " + e.message);
    }

    // 方法 2 · 直写 settings.json (磁盘持久 · 兜底 · 防 VS Code API race)
    let fileSet = false;
    try {
      const sp = _settingsJsonPath();
      const json = _readSettingsJson(sp) || {};
      json["codeium.apiServerUrl"] = targetUrl;
      json["codeium.inferenceApiServerUrl"] = targetUrl;
      if (_writeSettingsJson(sp, json)) {
        fileSet = true;
        log("✓ settings.json 文件双键写 → " + sp);
      }
    } catch (e) {
      log("  文件写 settings.json 失: " + e.message);
    }

    settingsAnchored = apiUpdated || inferUpdated || fileSet;
    // v1.0.5 · 同步 hook 之 url · 为下次 LSP spawn 拦作准
    _hookedProxyUrl = targetUrl;
    log(
      "✓ anchorSettings: api=" +
        targetUrl +
        " (api=" +
        (apiUpdated ? "✓" : "✗") +
        " infer=" +
        (inferUpdated ? "✓" : "✗") +
        " file=" +
        (fileSet ? "✓" : "✗") +
        ') 备前: api="' +
        (originalApiServerUrl || "") +
        '" infer="' +
        (originalInferenceUrl || "") +
        '"',
    );
  } catch (e) {
    log("✗ anchorSettings 失败: " + e.message);
  }
}

async function unanchorSettings() {
  if (!settingsAnchored) return;
  try {
    const codeium = vscode.workspace.getConfiguration("codeium");
    // 方法 1 · VS Code API 清双键 (还原或 undefined)
    try {
      await codeium.update(
        "apiServerUrl",
        originalApiServerUrl || undefined,
        vscode.ConfigurationTarget.Global,
      );
    } catch {}
    try {
      await codeium.update(
        "inferenceApiServerUrl",
        originalInferenceUrl || undefined,
        vscode.ConfigurationTarget.Global,
      );
    } catch {}
    // 方法 2 · 文件清双键 (兜底)
    try {
      const sp = _settingsJsonPath();
      const json = _readSettingsJson(sp);
      if (json) {
        let changed = false;
        if (originalApiServerUrl) {
          json["codeium.apiServerUrl"] = originalApiServerUrl;
          changed = true;
        } else if ("codeium.apiServerUrl" in json) {
          delete json["codeium.apiServerUrl"];
          changed = true;
        }
        if (originalInferenceUrl) {
          json["codeium.inferenceApiServerUrl"] = originalInferenceUrl;
          changed = true;
        } else if ("codeium.inferenceApiServerUrl" in json) {
          delete json["codeium.inferenceApiServerUrl"];
          changed = true;
        }
        if (changed) _writeSettingsJson(sp, json);
      }
    } catch (e) {
      log("  unanchor 文件失: " + e.message);
    }
    log(
      '✓ settings.json 清锚 · 还原 api="' +
        (originalApiServerUrl || "(空)") +
        '" infer="' +
        (originalInferenceUrl || "(空)") +
        '"',
    );
    settingsAnchored = false;
    originalApiServerUrl = null;
    originalInferenceUrl = null;
    // v1.0.5 · 同步清 hook 之 url
    _hookedProxyUrl = null;
  } catch (e) {
    log("✗ unanchorSettings 失败: " + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// 状态栏化身
// ═══════════════════════════════════════════════════════════════

function ensureStatusBar() {
  if (!getConfig().get("statusBar", true)) {
    if (statusBar) statusBar.hide();
    return null;
  }
  if (!statusBar) {
    statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    statusBar.command = "omni.openPanel";
    statusBar.tooltip = "道·BYOK 大极 · 点击打开控制面板";
  }
  statusBar.show();
  return statusBar;
}

function updateStatusBar(extra) {
  const sb = ensureStatusBar();
  if (!sb) return;
  const cfg = getConfig();
  const proxyEnabled = cfg.get("proxy.enabled", true);
  const gatewayEnabled = cfg.get("gateway.enabled", true);
  const lmEnabled = cfg.get("lm.enabled", true);
  const totalModels = registeredProviders.reduce(
    (n, x) => n + x.models.length,
    0,
  );

  if (extra === "starting") {
    sb.text = "$(loading~spin) 道Omni · 启动中";
    sb.tooltip = "道·BYOK 大极 · 启动中";
    return;
  }
  if (extra === "manual") {
    sb.text = "$(circle-outline) 道Omni · 手控";
    sb.tooltip =
      "道·BYOK 大极 · autoStart=false · 主公手按 omni.startProxy / omni.startGateway 始活";
    return;
  }
  if (extra === "down") {
    sb.text = "$(circle-slash) 道Omni · 失联";
    sb.tooltip = "道·BYOK 大极 · 反代/网关 失联 · 点击修复";
    return;
  }
  const proxyOk = proxyEnabled && proxyUrl;
  const gwOk = gatewayEnabled && gatewayUrl;
  if (!proxyOk && !gwOk && !lmEnabled) {
    sb.text = "$(warning) 道Omni 0";
    sb.tooltip = "道·BYOK 大极 · 三力皆禁 · 点击打开控制面板";
    return;
  }
  const parts = [];
  if (proxyOk) parts.push("反代✓");
  else if (proxyEnabled) parts.push("反代✗");
  if (gwOk) parts.push("网关✓");
  else if (gatewayEnabled) parts.push("网关✗");
  if (registeredProviders.length > 0)
    parts.push(registeredProviders.length + "p·" + totalModels + "m");
  sb.text = "$(sparkle) 道Omni · " + parts.join(" · ");
  sb.tooltip =
    "道·BYOK 大极 · " +
    parts.join(" · ") +
    (proxyUrl ? "\n反代: " + proxyUrl : "") +
    (gatewayUrl ? "\n网关: " + gatewayUrl : "") +
    "\n点击打开控制面板";
}

// ═══════════════════════════════════════════════════════════════
// 命令实现
// ═══════════════════════════════════════════════════════════════

async function cmdStatus() {
  const pUrl = proxyUrl || resolveProxyUrl();
  const gUrl = gatewayUrl || resolveGatewayUrl();
  const pAlive = await pingProxy(pUrl, 1500);
  const gAlive = await pingGateway(gUrl, 1500);
  const detail =
    registeredProviders
      .map((p) => "  · " + p.vendor + " (" + p.models.length + ")")
      .join("\n") || "  (无 · 网关未起或网关 0 provider 配)";
  const lines = [
    "道·BYOK 大极 (dao-proxy-max) · v" + VERSION,
    "反代: " + pUrl + "  " + (pAlive ? "✓ 在跑" : "✗ 失联"),
    "网关: " + gUrl + "  " + (gAlive ? "✓ 在跑" : "✗ 失联"),
    "settings 锚: " + (settingsAnchored ? "已锚 → " + pUrl : "未锚"),
    "已注册 " + registeredProviders.length + " providers:",
    detail,
  ];
  const choice = await vscode.window.showInformationMessage(
    lines.join("\n"),
    { modal: true },
    "打开控制面板",
    "端到端探针",
    "刷新模型目录",
    "净卸",
  );
  if (choice === "打开控制面板") return cmdOpenPanel();
  if (choice === "端到端探针") return cmdProbe();
  if (choice === "刷新模型目录") return cmdRefresh();
  if (choice === "净卸") return cmdPurge();
}

async function cmdShowOutput() {
  if (!output)
    output = vscode.window.createOutputChannel("道·BYOK 大极 (dao-proxy-max)");
  output.show(true);
}

async function cmdRefresh() {
  const gw = await ensureGateway();
  if (gw) await registerProviders(gw);
}

async function cmdStartProxy() {
  const u = await ensureProxy();
  if (u) {
    vscode.window.showInformationMessage("道·BYOK 大极 反代: " + u);
    if (
      getConfig().get("proxy.anchorSettings", true) &&
      getConfig().get("proxy.defaultMode") === "invert"
    ) {
      await anchorSettings(u);
    }
    updateStatusBar();
  } else {
    vscode.window.showErrorMessage("道·BYOK 大极 反代启动失败 · 查输出面板");
  }
}

async function cmdStopProxy() {
  await unanchorSettings();
  stopProxyProc();
  updateStatusBar();
  vscode.window.showInformationMessage("道·BYOK 大极 反代已停 · settings 清锚");
}

async function cmdStartGateway() {
  const u = await ensureGateway();
  if (u) {
    vscode.window.showInformationMessage("道·BYOK 大极 网关: " + u);
    await registerProviders(u);
    updateStatusBar();
  } else {
    vscode.window.showErrorMessage("道·BYOK 大极 网关启动失败");
  }
}

async function cmdToggleMode() {
  const cfg = getConfig();
  const cur = cfg.get("proxy.defaultMode") || "passthrough";
  const next = cur === "invert" ? "passthrough" : "invert";
  await cfg.update(
    "proxy.defaultMode",
    next,
    vscode.ConfigurationTarget.Global,
  );
  // 重启反代生效
  if (proxyUrl) {
    log("切换反代模 " + cur + " → " + next + " · 重启反代以生效");
    stopProxyProc();
    await new Promise((r) => setTimeout(r, 600));
    await ensureProxy();
  }
  vscode.window.showInformationMessage(
    "道·BYOK 大极 反代模: " + cur + " → " + next,
  );
  updateStatusBar();
}

async function cmdProbe() {
  const url = await ensureGateway();
  if (!url) {
    vscode.window.showErrorMessage("探针失败: 网关不可达");
    return;
  }
  const ch =
    output ||
    (output = vscode.window.createOutputChannel(
      "道·BYOK 大极 (dao-proxy-max)",
    ));
  ch.show(true);
  ch.appendLine("");
  ch.appendLine("═══ 端到端探针 · 道·BYOK 大极 ═══");
  ch.appendLine("gateway: " + url);
  let okN = 0,
    total = 0,
    upN = 0;
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "道·浑然 探针中",
      cancellable: false,
    },
    async (progress) => {
      for (const p of registeredProviders) {
        const m = p.models[0];
        if (!m || m === "auto") continue;
        total++;
        progress.report({ message: p.vendor + "/" + m });
        const t0 = Date.now();
        try {
          const r = await httpJSON(
            "POST",
            url + "/v1/chat/completions",
            null,
            {
              model: (p.provider || p.vendor.replace(/^dao-/, "")) + "::" + m,
              messages: [{ role: "user", content: "回一字: 道" }],
              max_tokens: 16,
              stream: false,
            },
            30000,
          );
          const ms = Date.now() - t0;
          if (
            r.status === 200 &&
            r.data &&
            r.data.choices &&
            r.data.choices[0] &&
            r.data.choices[0].message &&
            r.data.choices[0].message.content
          ) {
            const text = r.data.choices[0].message.content
              .slice(0, 30)
              .replace(/\s+/g, " ");
            ch.appendLine(
              "  ✓ " + p.vendor + "/" + m + "  " + ms + "ms  → " + text,
            );
            okN++;
          } else if (r.status === 429 || (r.status >= 500 && r.status <= 599)) {
            ch.appendLine(
              "  ! " +
                p.vendor +
                "/" +
                m +
                "  HTTP " +
                r.status +
                "  (上游限速/5xx · 非 bug)",
            );
            upN++;
          } else {
            const err =
              (r.data && r.data.error && r.data.error.message) ||
              r.raw ||
              "HTTP " + r.status;
            ch.appendLine(
              "  ✗ " +
                p.vendor +
                "/" +
                m +
                "  " +
                ms +
                "ms  " +
                String(err).slice(0, 80),
            );
          }
        } catch (e) {
          ch.appendLine("  ✗ " + p.vendor + "/" + m + "  err: " + e.message);
        }
      }
    },
  );
  ch.appendLine(
    "\n总: " +
      okN +
      "/" +
      total +
      " 通过" +
      (upN ? " (+" + upN + " 上游问题)" : "") +
      "\n",
  );
  if (okN === total) {
    vscode.window.showInformationMessage(
      "道·浑然 探针全通 (" + okN + "/" + total + ") · 道法自然",
    );
  } else if (okN + upN === total) {
    vscode.window.showWarningMessage(
      "道·浑然 " + okN + "/" + total + " 通 · " + upN + " 上游问题 · 可重试",
    );
  } else {
    vscode.window.showErrorMessage(
      "道·浑然 " + okN + "/" + total + " 通 · 查输出面板",
    );
  }
}

async function cmdOpenConfig() {
  const cfg = getConfig();
  const custom = (cfg.get("gateway.configPath") || "").trim();
  const userDir = path.join(os.homedir(), ".codeium", "dao-byok");
  const candidates = [];
  if (custom) candidates.push(custom);
  candidates.push(
    path.join(userDir, "配置.json"),
    path.join(userDir, "config.json"),
    path.resolve(__dirname, "vendor", "配置.example.json"),
    path.resolve(__dirname, "vendor", "byok", "配置.example.json"),
  );
  let target = null;
  for (const c of candidates)
    if (fs.existsSync(c)) {
      target = c;
      break;
    }
  if (!target) {
    const example = path.resolve(
      __dirname,
      "vendor",
      "byok",
      "配置.example.json",
    );
    target = path.join(userDir, "配置.json");
    try {
      if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
      if (fs.existsSync(example)) {
        fs.copyFileSync(example, target);
        log("已从 example 生成: " + target);
      } else {
        fs.writeFileSync(
          target,
          JSON.stringify(
            {
              providers: {},
              aliases: {},
              cascade_inject: { enabled: false, models: [] },
            },
            null,
            2,
          ),
          "utf8",
        );
        log("已生成空白 配置.json: " + target);
      }
    } catch (e) {
      vscode.window.showErrorMessage("生成 配置.json 失败: " + e.message);
      return;
    }
  }
  try {
    const doc = await vscode.workspace.openTextDocument(target);
    await vscode.window.showTextDocument(doc);
  } catch (e) {
    vscode.window.showErrorMessage("打开 配置.json 失败: " + e.message);
  }
}

async function cmdPurge() {
  log("═══ 净卸 (真药 P+ · 15s race) ═══");
  // 1. 清锚 settings
  await unanchorSettings();
  // 2. dispose lm registrations
  for (const r of registrations) {
    try {
      r.dispose();
    } catch {}
  }
  registrations = [];
  registeredProviders = [];
  // 3. 关 panel
  if (panel) {
    try {
      panel.dispose();
    } catch {}
    panel = null;
  }
  // 4. 停反代 + 网关 (本会话所启 · 真药 M: 别会话所启不动)
  stopProxyProc();
  if (gatewayProc) {
    try {
      gatewayProc.kill();
    } catch {}
    gatewayProc = null;
    log("网关进程已停 (本会话所启)");
  }
  gatewayUrl = null;
  updateStatusBar();
  log("等 15s 给 LS 充足释放 (真药 P+) ...");
  vscode.window.showInformationMessage("道·BYOK 大极 净卸中 (15s race) ...");
  await new Promise((r) => setTimeout(r, 15000));
  log("✓ 净卸完毕 · 归本源");
  vscode.window.showInformationMessage(
    "道·BYOK 大极 已归本源 · 主公可放心卸载",
  );
}

// ═══════════════════════════════════════════════════════════════
// webview 控制面板 (复用 dao-byok-vsix 之 webview 三件)
// ═══════════════════════════════════════════════════════════════

async function cmdOpenPanel() {
  if (panel) {
    try {
      panel.reveal(vscode.ViewColumn.Active);
      return;
    } catch {}
  }
  const gw = await ensureGateway();
  const cfg = getConfig();
  const authKey = cfg.get("gateway.authKey") || "";
  const webviewDir = path.join(__dirname, "webview");

  panel = vscode.window.createWebviewPanel(
    "omniPanel",
    "道·BYOK 大极 控制面板",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(webviewDir)],
    },
  );
  panel.onDidDispose(
    () => {
      panel = null;
    },
    null,
    extContext ? extContext.subscriptions : [],
  );
  panel.webview.onDidReceiveMessage(
    (m) => onPanelMessage(m),
    null,
    extContext ? extContext.subscriptions : [],
  );
  panel.webview.html = renderPanelHtml(panel.webview, webviewDir, gw, authKey);
  log("控制面板已开");
}

function renderPanelHtml(webview, webviewDir, gwUrl, authKey) {
  const htmlPath = path.join(webviewDir, "index.html");
  let html;
  try {
    html = fs.readFileSync(htmlPath, "utf8");
  } catch (e) {
    return (
      "<!DOCTYPE html><html><body><h3>控制面板加载失败</h3><pre>" +
      String(e.message).replace(/</g, "&lt;") +
      "</pre></body></html>"
    );
  }
  const styleUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(webviewDir, "style.css")),
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(webviewDir, "app.js")),
  );
  const cspSource = webview.cspSource;
  const initJson = JSON.stringify({
    gatewayUrl: gwUrl || "",
    gatewayAuthKey: authKey,
  }).replace(/</g, "\\u003c");

  html = html.replace(
    /<script\s+src="\{\{scriptUri\}\}"\s*>\s*<\/script>/,
    "<script>window.__DAO_INIT__=" +
      initJson +
      ';</script>\n<script src="{{scriptUri}}"></script>',
  );
  html = html
    .replace(/{{styleUri}}/g, String(styleUri))
    .replace(/{{scriptUri}}/g, String(scriptUri))
    .replace(/{{cspSource}}/g, cspSource);
  return html;
}

// dao-proxy-max v1.0.0 · 反代核 BYOK 控制 helper
//   走 source.js 的 /origin/byok/{status,refresh} 端点
function _proxyHttpJson(method, urlPath, body) {
  return new Promise((resolve) => {
    if (!proxyUrl) return resolve({ ok: false, error: "反代未启" });
    try {
      const u = new URL(urlPath, proxyUrl);
      const opts = {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + (u.search || ""),
        method,
        headers: { "Content-Type": "application/json" },
      };
      const req = http.request(opts, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const txt = Buffer.concat(chunks).toString("utf8");
          let data;
          try {
            data = JSON.parse(txt);
          } catch {
            data = { ok: false, error: "非 JSON: " + txt.slice(0, 200) };
          }
          resolve(data || { ok: false });
        });
        res.on("error", (e) => resolve({ ok: false, error: e.message }));
      });
      req.on("error", (e) => resolve({ ok: false, error: e.message }));
      req.setTimeout(3500, () => {
        try {
          req.destroy();
        } catch {}
        resolve({ ok: false, error: "超时" });
      });
      if (body) req.write(JSON.stringify(body));
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

async function proxyByokStatus() {
  return _proxyHttpJson("GET", "/origin/byok/status");
}

async function proxyByokRefresh() {
  return _proxyHttpJson("POST", "/origin/byok/refresh", {});
}

// ★ 外接api路由 helper · 朴散则为器 · 万法归宗
async function proxyEaStatus() {
  return _proxyHttpJson("GET", "/origin/ea_status");
}
async function proxyEaLog() {
  return _proxyHttpJson("GET", "/origin/ea_log");
}
async function proxyEaTest() {
  return _proxyHttpJson("GET", "/origin/ea_test");
}

// ★ dao_devindao 进程管理 · 反者道之动
let devindaoProc = null;
function locateDevindao() {
  const candidates = [
    path.resolve(__dirname, "vendor", "外接api", "dao_devindao.js"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}
async function ensureDevindao() {
  if (devindaoProc) return true;
  const script = locateDevindao();
  if (!script) {
    log("[devindao] dao_devindao.js 未找到 · 跳过");
    return false;
  }
  try {
    devindaoProc = cp.spawn(process.execPath, [script], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      cwd: path.dirname(script),
    });
    devindaoProc.stdout.on("data", (d) => {
      const t = d.toString().trimEnd();
      if (t)
        log(
          "[devindao] " + t.split("\n").slice(0, 2).join(" / ").slice(0, 220),
        );
    });
    devindaoProc.stderr.on("data", (d) => {
      const t = d.toString().trimEnd();
      if (t)
        log(
          "[devindao!] " + t.split("\n").slice(0, 2).join(" / ").slice(0, 220),
        );
    });
    devindaoProc.on("exit", (code) => {
      log("[devindao] 退出 code=" + code);
      devindaoProc = null;
    });
    devindaoProc.unref();
    log("[devindao] ✓ 已启动: " + script);
    return true;
  } catch (e) {
    log("[devindao] ✗ 启动失败: " + e.message);
    return false;
  }
}

async function onPanelMessage(m) {
  if (!m || typeof m !== "object") return;
  try {
    switch (m.type) {
      case "openOutput":
        return cmdShowOutput();
      case "openConfigFile":
        return cmdOpenConfig();
      case "startGateway": {
        const u = await ensureGateway();
        panel &&
          panel.webview.postMessage({
            type: "toast",
            message: "网关: " + (u || "失"),
            kind: u ? "info" : "err",
          });
        return;
      }
      case "startProxy": {
        const u = await ensureProxy();
        panel &&
          panel.webview.postMessage({
            type: "toast",
            message: "反代: " + (u || "失"),
            kind: u ? "info" : "err",
          });
        return;
      }
      case "refreshProviders": {
        const gw = await ensureGateway();
        if (gw) await registerProviders(gw);
        panel &&
          panel.webview.postMessage({
            type: "toast",
            message: "已重注: " + registeredProviders.length + " providers",
            kind: "ok",
          });
        return;
      }
      case "probe":
        return cmdProbe();
      case "log":
        log("[panel] " + (m.level || "info") + ": " + (m.message || ""));
        return;
      // dao-proxy-max v1.0.0 · 官方 4 BYOK 透明劫
      case "refreshByok": {
        const r = await proxyByokRefresh();
        if (r && r.ok) {
          panel &&
            panel.webview.postMessage({
              type: "toast",
              message: "反代核 BYOK 已热更 · 即生效",
              kind: "ok",
            });
        } else {
          panel &&
            panel.webview.postMessage({
              type: "toast",
              message:
                "反代核 BYOK 热更失: " + (r && r.error ? r.error : "未知"),
              kind: "err",
            });
        }
        // 顺带推一发状态
        const st = await proxyByokStatus();
        if (st && panel)
          panel.webview.postMessage({ type: "byokStatus", status: st });
        return;
      }
      case "queryByokStatus": {
        const st = await proxyByokStatus();
        if (panel)
          panel.webview.postMessage({
            type: "byokStatus",
            status: st || { ready: false, reason: "反代核未启" },
          });
        return;
      }
      // ★ 外接api路由状态 · 朴散则为器
      case "queryEaStatus": {
        const st = await proxyEaStatus();
        if (panel)
          panel.webview.postMessage({
            type: "eaStatus",
            status: st || { ready: false, reason: "反代核未启" },
          });
        return;
      }
      case "queryEaLog": {
        const lg = await proxyEaLog();
        if (panel)
          panel.webview.postMessage({
            type: "eaLog",
            log: lg || { count: 0, logs: [] },
          });
        return;
      }
      case "queryEaTest": {
        const ts = await proxyEaTest();
        if (panel)
          panel.webview.postMessage({
            type: "eaTest",
            test: ts || { ea_loaded: false },
          });
        return;
      }
      default:
        log("未知面板消息: " + m.type);
    }
  } catch (e) {
    log("面板消息处理异常: " + e.message);
    panel &&
      panel.webview.postMessage({
        type: "toast",
        message: e.message,
        kind: "err",
      });
  }
}

// ═══════════════════════════════════════════════════════════════
// activate / deactivate
// ═══════════════════════════════════════════════════════════════

async function activate(context) {
  extContext = context;
  output = vscode.window.createOutputChannel("道·BYOK 大极 (dao-proxy-max)");
  if (getConfig().get("banner", true)) {
    for (const line of BANNER) output.appendLine(line);
  } else {
    log("dao-proxy-max v" + VERSION + " · BYOK 大极 · 道法自然 (banner 已关)");
  }
  // v1.0.5 · 极早装 spawn hook (拦让 Codeium 扩展 spawn LSP 之参数)
  // 注: 如 Codeium 扩展已在我们之前激活 + spawn LSP, 拦不到 · 须 forceRestartLS 后才生效
  if (getConfig().get("proxy.anchorSettings", true)) {
    installSpawnHook();
  }
  ensureStatusBar();
  updateStatusBar("starting");

  // 注 11 命令
  const cmds = [
    ["omni.openPanel", cmdOpenPanel],
    ["omni.status", cmdStatus],
    ["omni.refresh", cmdRefresh],
    ["omni.startProxy", cmdStartProxy],
    ["omni.stopProxy", cmdStopProxy],
    ["omni.startGateway", cmdStartGateway],
    ["omni.toggleMode", cmdToggleMode],
    ["omni.probe", cmdProbe],
    ["omni.showOutput", cmdShowOutput],
    ["omni.openConfig", cmdOpenConfig],
    ["omni.purge", cmdPurge],
  ];
  for (const [id, fn] of cmds) {
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  }
  if (statusBar) context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("omni")) {
        log("配置变更 · 重置状态栏 + 重注 providers");
        ensureStatusBar();
        const gw = await ensureGateway();
        if (gw) await registerProviders(gw);
      }
    }),
  );

  // ★ 真药 O · autoStart=true 默 · 装即活 · 无感
  const cfg = getConfig();
  if (cfg.get("autoStart", true)) {
    log("autoStart=true · 装即活 · 无感万源");
    // 延 800ms · 不阻塞激活 · 不弹通知 (真药 O: 不扰主公他工作)
    setTimeout(async () => {
      try {
        // ① 反代核
        let pUrl = null;
        if (cfg.get("proxy.enabled", true)) {
          pUrl = await ensureProxy();
          if (pUrl && cfg.get("proxy.anchorSettings", true)) {
            await anchorSettings(pUrl);
          }
        }
        // ② 070 网关
        let gw = null;
        if (cfg.get("gateway.enabled", true)) {
          gw = await ensureGateway();
        }
        // ③ vscode.lm 注册
        if (gw && cfg.get("lm.enabled", true)) {
          await registerProviders(gw);
        }
        // ④ 外接api dao_devindao · 朴散则为器
        await ensureDevindao();
        // ⑤ v1.0.5 真药 · 换装 LSP · 让新 LSP 被 spawn-hook 拦 · 接到反代 url
        //   仅首运行 (settings 刚被锁) 需 · 以后反代装跟 LSP 起有同 url 不需重启
        if (
          pUrl &&
          cfg.get("proxy.anchorSettings", true) &&
          cfg.get("proxy.defaultMode") === "invert" &&
          _spawnHooked
        ) {
          // 检 LSP 是否已在走反代 · 若 LSP 指令行仔含官方 url 则需 forceRestartLS
          //   (简化判: 首运行 · LSP 启时未是被拦 · 源 url 必官方 · 重启重 spawn 被拦)
          const needRestart = await _needRestartLS();
          if (needRestart) {
            log(
              "[activate] 首运行 spawn-hook 装后 LSP 未被拦 · forceRestartLS · 让 LSP 重 spawn 接反代 url",
            );
            await forceRestartLS();
            log("[activate] LSP 重启· 新 LSP 将接 " + pUrl);
          } else {
            log("[activate] LSP 已走反代 url · 无需重启");
          }
        }
        updateStatusBar();
      } catch (e) {
        log("激活异常: " + e.message);
        updateStatusBar("down");
      }
    }, 800);
  } else {
    log("autoStart=false · 主公手按 omni.startProxy / omni.startGateway 始活");
    updateStatusBar("manual");
  }

  // 周期探活 · 状态栏跟
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = setInterval(async () => {
    try {
      const cfg2 = getConfig();
      const pAlive =
        cfg2.get("proxy.enabled", true) && proxyUrl
          ? await pingProxy(proxyUrl, 1500)
          : false;
      const gAlive =
        cfg2.get("gateway.enabled", true) && gatewayUrl
          ? await pingGateway(gatewayUrl, 1500)
          : false;
      const pNeeded = cfg2.get("proxy.enabled", true);
      const gNeeded = cfg2.get("gateway.enabled", true);
      // 若需要却 down · 标 down · 否则正常
      if (
        (pNeeded && !pAlive && proxyUrl) ||
        (gNeeded && !gAlive && gatewayUrl)
      ) {
        updateStatusBar("down");
      } else {
        updateStatusBar();
      }
    } catch {
      updateStatusBar("down");
    }
  }, 30000);

  log(
    "══════ activate 毕 · 主公可见状态栏化身 · 一念 Ctrl+Shift+P · omni.openPanel ══════",
  );
}

function deactivate() {
  // 真药 M: 仅 dispose registrations + 清 timers · 不杀子进程
  for (const r of registrations) {
    try {
      r.dispose();
    } catch {}
  }
  registrations = [];
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  // 不杀 proxyProc / gatewayProc · 留下次复用 (主公手 omni.purge 始尽)
  // 不 unanchor settings (留 LS 朝反代发 · 反代仍活)
  if (output) {
    try {
      output.appendLine(
        "[deactivate] 仅清 LM 注 + timers · 子进程留活 (真药 M)",
      );
    } catch {}
  }
}

module.exports = { activate, deactivate };
