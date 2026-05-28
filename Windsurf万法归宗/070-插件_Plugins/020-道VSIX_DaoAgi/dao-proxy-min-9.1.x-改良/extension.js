// extension.js · dao-proxy-min v9.3.0 · 反者道之动 · 弱者道之用
//
// 道德经 · 第四十章: "反者道之动, 弱者道之用."
// 道德经 · 第四十八章: "为道日损. 损之又损, 以至于无为."
// 道德经 · 第六十四章: "为者败之, 执者失之."
// 道德经 · 第十六章: "夫物云云, 各复归于其根."
// 道德经 · 第八十一章: "既以为人己愈有, 既以予人己愈多."
//
// v9.3.0 "反之用反 · 闭环自举":
//   加 /origin/loopback (POST {user_msg}) 端 · 用最近 chat 缓 + 替 user msg
//   + 真转云端 + 收响应解 grpc · 返 model 之答 · 令模型自审其规则之源.
//   缓仅内存 (_lastChatRelay), 进程退即失, 不漏 token 至磁盘.
//   配 helpers: replaceUserMsgInGrpcBody / extractUtf8StringsFromGrpcBody.
//
// v9.2.1 "有无相生":
//   以结构判 (isAlreadyInverted) 代 s.indexOf(TAO_SENTINEL) 短语幂等守,
//   防用户真 Cascade Memories (含同句导语) 误触 invertSP 早返 null 而完全失效.
//
// v9.2.0 "去芜存菁 · 道法自然":
//   于 v9.1.2 之上, 仅施四味真药, 净减码量, 不增功能, 不增状态.
//
//   真药 A · H2 stream 随断随清 (source.js proxyToCloud)
//      req.aborted / res.close / upStream.setTimeout(180s) → NGHTTP2_CANCEL
//      漏: 原版 upStream 永生留, HOL 阻塞继任流
//      药: 三路监听, 弱者道之用 (四十章)
//
//   真药 B · setAnchor 同值不写 (extension.js setAnchor)
//      漏: 每 activate 必写 settings.json, file watcher 空转, ext-host 抖动
//      药: 进函数先比对, 同值即返 (六十四章 · 为者败之)
//
//   真药 C · EADDRINUSE 不抢 (extension.js proxyStart)
//      漏: 原版 ping 失败仍信占者活, remote handle phantom
//      药: 1 ping · 活则复用 · 死则返 null (本窗口直连, 不抢) (上善若水)
//
//   真药 D · activate 不杀 LS (extension.js activate)
//      漏: 首装即 forceRestartLS 广域杀, 多窗口连锁 ext-host crash
//      药: 首装仅装 hook + 锚 settings, LS 自然重启时挂钩 (四十八章 · 为道日损)
//
// v9.1.3 之过 (前车之鉴 · 损之未足复益): PID 簿 / 健康探针 / 三验 / 离线 handle
//   反伤本源, 此次净拨, 复归 v9.1.2 之朴, 仅留四味.
//
// 命令:
//   wam.originInvert       · 道Agent 启 (含 forceRestartLS · 用户显式触发)
//   wam.originPassthrough  · 官方Agent 启
//   dao.toggleMode         · 道/官 热切
//   dao.openPreview        · 浏览器观真 SP
//   wam.verifyEndToEnd     · E2E 自检
//   wam.selftest           · L1+L2 自检
//   dao.purge              · 了事拂衣去

"use strict";
const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const cp = require("node:child_process");
const os = require("node:os");
const { EventEmitter } = require("node:events");

// ═══════════════════════════ 常量 ═══════════════════════════
const PKG_VERSION = (() => {
  try {
    return require("./package.json").version;
  } catch {
    return "0";
  }
})();
const DEFAULT_PORT = 8889;
const OFFICIAL_API_URL = "https://server.codeium.com";
const OFFICIAL_INFER_URL = "https://inference.codeium.com";
const BACKUP_KEY_API = "dao.origin._backup_apiServerUrl";
const BACKUP_KEY_INFER = "dao.origin._backup_inferenceApiServerUrl";

const DAO_QUOTES = [
  "道可道，非常道",
  "上善若水",
  "大音希声，大象无形",
  "道法自然",
  "无为而无不为",
  "致虚极，守静笃",
  "反者道之动",
  "知者不言，言者不知",
  "天下莫柔弱于水",
  "为学日益，为道日损",
];

// ═══════════════════════════ 缓存 ═══════════════════════════
let _cachedPort = DEFAULT_PORT;
let _cachedProxyUrl = `http://127.0.0.1:${DEFAULT_PORT}`;
let _cachedAnchored = false;
let _cachedMode = "invert";

// ═══════════════════════════ 日志 ═══════════════════════════
let _channel = null;
function logger() {
  if (!_channel) _channel = vscode.window.createOutputChannel("道Agent");
  return _channel;
}
function _stamp() {
  const d = new Date(),
    p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
const L = {
  info: (tag, msg) =>
    logger().appendLine(`[${_stamp()}] [INFO] [${tag}] ${msg}`),
  warn: (tag, msg) =>
    logger().appendLine(`[${_stamp()}] [WARN] [${tag}] ${msg}`),
  error: (tag, msg) =>
    logger().appendLine(`[${_stamp()}] [ERR]  [${tag}] ${msg}`),
};

// ═══════════════════════════ per-user 端口 FNV-1a ═══════════════════════════
function fnv1aPort(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return 8889 + (h % 100); // 8889..8988
}

function resolvePort() {
  const c = vscode.workspace.getConfiguration("dao");
  const explicit = parseInt(c.get("origin.port"), 10);
  if (Number.isFinite(explicit) && explicit >= 1 && explicit <= 65535)
    return explicit;
  // per-user 自动 · 用 os.userInfo().username
  try {
    return fnv1aPort(os.userInfo().username);
  } catch {
    return DEFAULT_PORT;
  }
}

function cfg() {
  _cachedPort = resolvePort();
  _cachedProxyUrl = `http://127.0.0.1:${_cachedPort}`;
  return { port: _cachedPort };
}

// ═══════════════════════════ spawn hook ═══════════════════════════
const _origSpawn = cp.spawn;
const _origSpawnSync = cp.spawnSync;
const _origExec = cp.exec;
const _origExecFile = cp.execFile;
let _spawnHooked = false;

function maybeRewriteLsArgs(command, args) {
  if (
    typeof command !== "string" ||
    !/language_server/.test(command) ||
    !Array.isArray(args)
  )
    return false;
  if (!_cachedAnchored) return false;
  let rewrote = 0;
  for (const flag of ["--api_server_url", "--inference_api_server_url"]) {
    const idx = args.indexOf(flag);
    if (
      idx >= 0 &&
      idx + 1 < args.length &&
      args[idx + 1] !== _cachedProxyUrl
    ) {
      L.info("spawn-hook", `${flag}: ${args[idx + 1]} → ${_cachedProxyUrl}`);
      args[idx + 1] = _cachedProxyUrl;
      rewrote++;
    }
  }
  return rewrote > 0;
}

function installSpawnHook() {
  if (_spawnHooked) return;
  _spawnHooked = true;
  cp.spawn = function (cmd, a) {
    maybeRewriteLsArgs(cmd, a);
    return _origSpawn.apply(this, arguments);
  };
  cp.spawnSync = function (cmd, a) {
    maybeRewriteLsArgs(cmd, a);
    return _origSpawnSync.apply(this, arguments);
  };
  cp.execFile = function (cmd, a) {
    if (Array.isArray(a)) maybeRewriteLsArgs(cmd, a);
    return _origExecFile.apply(this, arguments);
  };
  cp.exec = function (cmdline) {
    if (
      typeof cmdline === "string" &&
      /language_server/.test(cmdline) &&
      _cachedAnchored
    ) {
      const orig = cmdline;
      cmdline = cmdline.replace(
        /(--(?:inference_)?api_server_url(?:=|\s+))(\S+)/g,
        (m, p1) => p1 + _cachedProxyUrl,
      );
      if (cmdline !== orig) {
        L.info("spawn-hook", `exec rewrite`);
        arguments[0] = cmdline;
      }
    }
    return _origExec.apply(this, arguments);
  };
  L.info("spawn-hook", "installed (spawn/spawnSync/execFile/exec)");
}

function removeSpawnHook() {
  if (!_spawnHooked) return;
  cp.spawn = _origSpawn;
  cp.spawnSync = _origSpawnSync;
  cp.exec = _origExec;
  cp.execFile = _origExecFile;
  _spawnHooked = false;
}

// ═══════════════════════════ LS 重启 ═══════════════════════════
// 仅由用户显式命令触发 (cmdInvert / cmdPurge / deactivate); 不在 activate 调用 (真药 D)
// 第六十四章「为者败之」: activate 不主动干预 LS, 留待自然重启或用户意愿
function forceRestartLS() {
  return new Promise((resolve) => {
    const plat = process.platform;
    let cmd, args;
    if (plat === "win32") {
      const userName = os.userInfo().username;
      cmd = "taskkill";
      args = [
        "/F",
        "/FI",
        "IMAGENAME eq language_server_windows_x64.exe",
        "/FI",
        `USERNAME eq ${userName}`,
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
    proc.stdout?.on("data", (d) => (out += d));
    proc.stderr?.on("data", (d) => (out += d));
    proc.on("close", (code) => {
      L.info(
        "restart-ls",
        `${plat} ${cmd} exit=${code} ${out.trim().slice(0, 200)}`,
      );
      resolve(code === 0 || code === 128 || (plat !== "win32" && code === 1));
    });
    proc.on("error", (e) => {
      L.warn("restart-ls", e.message);
      resolve(false);
    });
  });
}

// ═══════════════════════════ 源.js 进程内 require ═══════════════════════════
let _proxyHandle = null; // start() 返回的 handle: { server, port, host, close, getMode, setMode }

function vendorDir() {
  return path.join(__dirname, "vendor", "bundled-origin");
}

function findSourceJs() {
  const dir = vendorDir();
  for (const n of ["source.js", "源.js"]) {
    const fp = path.join(dir, n);
    if (fs.existsSync(fp)) return fp;
  }
  // 终极兜底: 扫 shebang
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".js")) continue;
      const fp = path.join(dir, f);
      const head = fs.readFileSync(fp, "utf8").slice(0, 60);
      if (head.includes("#!/usr/bin/env node") || head.includes("// origin"))
        return fp;
    }
  } catch {}
  return null;
}

async function proxyStart(port, mode) {
  if (_proxyHandle) return _proxyHandle;
  const srcPath = findSourceJs();
  if (!srcPath) throw new Error(`源.js 不存在: ${vendorDir()}`);
  try {
    delete require.cache[require.resolve(srcPath)];
    const mod = require(srcPath);
    if (typeof mod.start !== "function")
      throw new Error("源.js 无 start() 导出");
    _proxyHandle = await mod.start({
      port,
      host: "127.0.0.1",
      mode: mode || "passthrough",
    });
    L.info(
      "proxy",
      `started :${_proxyHandle.port} bind=127.0.0.1 mode=${_proxyHandle.getMode()}`,
    );
    return _proxyHandle;
  } catch (e) {
    // ── 真药 C · EADDRINUSE 不抢 · 上善若水 (八章) ──
    // 1 ping → 活则复用 (remote handle), 死则返 null (本窗口直连, 不抢端口)
    // 第八章「水善, 利万物而有静」: 不与端口争, 让本窗口走直连即可
    if (
      e.code === "EADDRINUSE" ||
      (e.message && e.message.includes("EADDRINUSE"))
    ) {
      L.info("proxy", `port :${port} EADDRINUSE → ping remote`);
      const ping = await httpGetJson(
        `http://127.0.0.1:${port}/origin/ping`,
        2000,
      );
      if (
        ping &&
        ping.ok &&
        (ping.mode === "invert" || ping.mode === "passthrough")
      ) {
        L.info(
          "proxy",
          `port :${port} live remote (mode=${ping.mode}) → remote handle`,
        );
        _proxyHandle = _createRemoteHandle(port, ping.mode);
        return _proxyHandle;
      }
      L.warn("proxy", `port :${port} 占且非反代 · 返 null (本窗口直连)`);
      return null;
    }
    throw e;
  }
}

async function proxyStop() {
  if (!_proxyHandle) return;
  try {
    await _proxyHandle.close();
  } catch (e) {
    L.warn("proxy", `stop: ${e.message}`);
  }
  _proxyHandle = null;
  L.info("proxy", "stopped");
}

// 远程 handle: 端口已有 proxy (多窗口) → 复用而非销毁
function _createRemoteHandle(port, mode) {
  let _mode = mode || "invert";
  return {
    port,
    host: "127.0.0.1",
    server: null, // remote · 无本地 server
    kind: "remote",
    getMode: () => _mode,
    setMode: (m) => {
      _mode = m;
      httpPostJson(
        `http://127.0.0.1:${port}/origin/mode`,
        { mode: m },
        2000,
      ).catch(() => {});
    },
    close: async () => {}, // remote · 不关闭别窗进程
  };
}

function proxySetMode(mode) {
  if (_proxyHandle && _proxyHandle.setMode) {
    _proxyHandle.setMode(mode);
  }
  _cachedMode = mode;
  L.info("proxy", `mode → ${mode}`);
}

function proxyGetMode() {
  if (_proxyHandle && _proxyHandle.getMode) return _proxyHandle.getMode();
  return _cachedMode;
}

// ═══════════════════════════ settings 锚 ═══════════════════════════
// 双保险: VS Code API (内存) + 直写 settings.json (磁盘持久化)
// Windsurf 可能拦截 codeium.* 的 API 写入 · 直写文件兜底
function _settingsJsonPath() {
  const plat = process.platform;
  let base;
  if (plat === "win32") base = process.env.APPDATA;
  else if (plat === "darwin")
    base = path.join(os.homedir(), "Library", "Application Support");
  else base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "Windsurf", "User", "settings.json");
}

function _readSettingsJson(fp) {
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

function _writeSettingsJson(fp, json) {
  try {
    fs.writeFileSync(fp, JSON.stringify(json, null, 2), "utf8");
    return true;
  } catch (e) {
    L.warn("anchor", `file write fail: ${e.message}`);
    return false;
  }
}

async function setAnchor(port) {
  const url = `http://127.0.0.1:${port}`;

  // ── 真药 B · 同值不写 · 为者败之 (六十四章) ──
  // API 与文件双路均先比对, 同值即返, 真变则动 (免 file watcher 空转)
  let needWriteFile = false;
  let skipApi = true;

  // 先看磁盘当前值 (这是 Windsurf 真正 reload 的依据)
  let currentApi = null,
    currentInfer = null;
  try {
    const json = _readSettingsJson(_settingsJsonPath());
    if (json) {
      currentApi = json["codeium.apiServerUrl"];
      currentInfer = json["codeium.inferenceApiServerUrl"];
      needWriteFile = currentApi !== url || currentInfer !== url;
    } else {
      needWriteFile = true; // 读不到 → 当作需写
    }
  } catch {
    needWriteFile = true;
  }

  // API 写: 只有当 VS Code 内存视图与目标不符才动
  try {
    const c = vscode.workspace.getConfiguration();
    if (
      c.get("codeium.apiServerUrl") !== url ||
      c.get("codeium.inferenceApiServerUrl") !== url
    ) {
      skipApi = false;
    }
  } catch {
    skipApi = false;
  }

  if (!skipApi) {
    for (const key of [
      "codeium.apiServerUrl",
      "codeium.inferenceApiServerUrl",
    ]) {
      try {
        await vscode.workspace
          .getConfiguration()
          .update(key, url, vscode.ConfigurationTarget.Global);
      } catch (e) {
        L.warn("anchor", `API set ${key} fail: ${e.message}`);
      }
    }
  }

  // 文件写: 同值不写 · 免 file watcher 空转
  if (needWriteFile) {
    try {
      const sp = _settingsJsonPath();
      const json = _readSettingsJson(sp);
      if (json) {
        json["codeium.apiServerUrl"] = url;
        json["codeium.inferenceApiServerUrl"] = url;
        if (_writeSettingsJson(sp, json)) {
          L.info("anchor", `file set ${url} → ${sp}`);
        }
      } else {
        L.warn("anchor", `settings.json unreadable: ${sp}`);
      }
    } catch (e) {
      L.warn("anchor", `file set fail: ${e.message}`);
    }
  } else {
    L.info("anchor", `already ${url} · skip write (无为而治)`);
  }

  _cachedAnchored = true;
  _cachedProxyUrl = url;
}

async function clearAnchor() {
  // 方法1: VS Code API
  try {
    const c = vscode.workspace.getConfiguration();
    await c.update(
      "codeium.apiServerUrl",
      undefined,
      vscode.ConfigurationTarget.Global,
    );
    await c.update(
      "codeium.inferenceApiServerUrl",
      undefined,
      vscode.ConfigurationTarget.Global,
    );
    try {
      await c.update(
        BACKUP_KEY_API,
        undefined,
        vscode.ConfigurationTarget.Global,
      );
    } catch {}
    try {
      await c.update(
        BACKUP_KEY_INFER,
        undefined,
        vscode.ConfigurationTarget.Global,
      );
    } catch {}
  } catch (e) {
    L.warn("anchor", `API clear fail: ${e.message}`);
  }

  // 方法2: 直写 settings.json
  const sp = _settingsJsonPath();
  const json = _readSettingsJson(sp);
  if (json) {
    delete json["codeium.apiServerUrl"];
    delete json["codeium.inferenceApiServerUrl"];
    delete json[BACKUP_KEY_API];
    delete json[BACKUP_KEY_INFER];
    _writeSettingsJson(sp, json);
    L.info("anchor", `file cleared → ${sp}`);
  }

  _cachedAnchored = false;
  L.info("anchor", "cleared → Windsurf defaults");
}

// 同步清锚 · 仅文件 · 用于 deactivate 等需极速清理的场景
// VS Code API 异步且可能失败 (codeium.* 非注册键) · 文件直写最可靠
function _clearAnchorFileSync() {
  try {
    const sp = _settingsJsonPath();
    const json = _readSettingsJson(sp);
    if (json) {
      let changed = false;
      for (const k of [
        "codeium.apiServerUrl",
        "codeium.inferenceApiServerUrl",
        BACKUP_KEY_API,
        BACKUP_KEY_INFER,
      ]) {
        if (k in json) {
          delete json[k];
          changed = true;
        }
      }
      if (changed) {
        _writeSettingsJson(sp, json);
        L.info("anchor", `file-sync cleared → ${sp}`);
      }
    }
  } catch (e) {
    L.warn("anchor", `file-sync clear fail: ${e.message}`);
  }
  _cachedAnchored = false;
}

function isAnchored() {
  // 检查 VS Code API
  try {
    const c = vscode.workspace.getConfiguration();
    if (c.get("codeium.apiServerUrl") === _cachedProxyUrl) return true;
  } catch {}
  // 兜底: 检查文件
  try {
    const json = _readSettingsJson(_settingsJsonPath());
    if (json && json["codeium.apiServerUrl"] === _cachedProxyUrl) return true;
  } catch {}
  return false;
}

// ═══════════════════════════ HTTP 工具 ═══════════════════════════
function httpGetJson(url, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const req = http.get(
        url,
        {
          timeout: timeoutMs || 3000,
          agent: false,
          headers: { connection: "close" },
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        try {
          req.destroy();
        } catch {}
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

function httpPostJson(url, data, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify(data);
      const u = new (require("node:url").URL)(url);
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          method: "POST",
          timeout: timeoutMs || 3000,
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload),
            connection: "close",
          },
          agent: false,
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        try {
          req.destroy();
        } catch {}
        resolve(null);
      });
      req.write(payload);
      req.end();
    } catch {
      resolve(null);
    }
  });
}

function httpDelete(url, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const u = new (require("node:url").URL)(url);
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          method: "DELETE",
          timeout: timeoutMs || 3000,
          headers: { connection: "close" },
          agent: false,
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        try {
          req.destroy();
        } catch {}
        resolve(null);
      });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

// ═══════════════════════════ SSE 客户端 ═══════════════════════════
// 订阅 源.js /origin/stream · 事件: hello/turn/mode/hb
// 断自愈: 指数退避 max 30s · 无 proxy 时静默重试
class DaoSseClient extends EventEmitter {
  constructor(port) {
    super();
    this._port = port || DEFAULT_PORT;
    this._req = null;
    this._res = null;
    this._reconnectTimer = null;
    this._backoffMs = 1000;
    this._stopped = false;
    this._connected = false;
    this._buf = "";
  }
  setPort(p) {
    if (p && p !== this._port) {
      this._port = p;
      this._close();
      if (!this._stopped) this._scheduleReconnect(100);
    }
  }
  isConnected() {
    return this._connected;
  }
  start() {
    this._stopped = false;
    this._connect();
  }
  stop() {
    this._stopped = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._close();
    this.removeAllListeners();
  }
  _close() {
    this._connected = false;
    try {
      if (this._req) this._req.destroy();
    } catch {}
    this._req = null;
    this._res = null;
    this._buf = "";
  }
  _scheduleReconnect(ms) {
    if (this._stopped) return;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(
      () => {
        this._reconnectTimer = null;
        this._connect();
      },
      ms != null ? ms : this._backoffMs,
    );
    this._backoffMs = Math.min(30000, Math.max(1000, this._backoffMs * 2));
  }
  _connect() {
    if (this._stopped || this._req) return;
    try {
      this._req = http.get(
        `http://127.0.0.1:${this._port}/origin/stream?replay=1`,
        {
          headers: { accept: "text/event-stream", "cache-control": "no-cache" },
          agent: false,
          timeout: 5000,
        },
        (res) => {
          this._res = res;
          if (res.statusCode !== 200) {
            res.resume();
            this._close();
            this._scheduleReconnect();
            return;
          }
          this._connected = true;
          this._backoffMs = 1000;
          try {
            if (res.socket && res.socket.setTimeout) res.socket.setTimeout(0);
          } catch {}
          try {
            this.emit("connect", { port: this._port });
          } catch {}
          res.setEncoding("utf8");
          res.on("data", (chunk) => this._onData(chunk));
          res.on("end", () => {
            this._close();
            if (!this._stopped) this._scheduleReconnect();
          });
          res.on("error", () => {
            this._close();
            if (!this._stopped) this._scheduleReconnect();
          });
        },
      );
      this._req.on("error", () => {
        this._close();
        if (!this._stopped) this._scheduleReconnect();
      });
      this._req.on("timeout", () => {
        try {
          this._req && this._req.destroy();
        } catch {}
      });
    } catch {
      this._close();
      if (!this._stopped) this._scheduleReconnect();
    }
  }
  _onData(chunk) {
    this._buf += chunk;
    let idx;
    while ((idx = this._buf.indexOf("\n\n")) >= 0) {
      const raw = this._buf.slice(0, idx);
      this._buf = this._buf.slice(idx + 2);
      this._dispatch(raw);
    }
  }
  _dispatch(raw) {
    let eventType = "message";
    const dataLines = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) eventType = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return;
    const dataStr = dataLines.join("\n");
    let data = dataStr;
    try {
      data = JSON.parse(dataStr);
    } catch {}
    try {
      this.emit(eventType, data);
      this.emit("event", { type: eventType, data });
    } catch {}
  }
}

// ═══════════════════════════ 数据采集 · proxy-only ═══════════════════════════
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function gatherEssence(port) {
  if (!port)
    return { ts: new Date().toISOString(), proxy: null, proxyUp: false };
  const base = `http://127.0.0.1:${port}`;
  const ping = await withTimeout(
    httpGetJson(`${base}/origin/ping`, 1500),
    2500,
  );
  if (!ping)
    return { ts: new Date().toISOString(), proxy: null, proxyUp: false };
  // 一请观全槽 · /origin/allinjects 含 _injectsByKind 全槽
  // v9.4.5 · 删 realprompt fetch · 该端点 source.js 不存 · 仅 404 浪费
  const [proxy, allInjects] = (await withTimeout(
    Promise.all([
      httpGetJson(`${base}/origin/preview`, 4000),
      httpGetJson(`${base}/origin/allinjects`, 4000),
    ]),
    6000,
  )) || [null, null];
  const realprompt = null;
  const diag = {
    proxy_up: true,
    proxy_capturing: !!(proxy && proxy.has_captured_before),
    has_main: proxy ? !!proxy.has_main : false,
    aux_count: proxy ? proxy.aux_count || 0 : 0,
    agent_class: proxy && proxy.agent_class ? proxy.agent_class : null,
    proxy_stale: proxy && proxy.age_s != null && proxy.age_s > 300,
    mode: ping.mode,
    uptime_s: ping.uptime_s,
    req_total: ping.req_total,
    capture_count: ping.capture_count,
  };
  return {
    ts: new Date().toISOString(),
    proxy,
    realprompt,
    allInjects,
    proxyUp: true,
    diag,
    ping,
  };
}

// ═══════════════════════════ 模式状态文本 ═══════════════════════════
function getModeLabel() {
  const mode = proxyGetMode();
  if (mode === "invert") return `道Agent · :${_cachedPort}`;
  return `官方Agent · 直连`;
}

// ═══════════════════════════ EssenceProvider · 本源观照 webview ═══════════════════════════
class EssenceProvider {
  constructor(ctx) {
    this._ctx = ctx;
    this._view = null;
    this._timer = null;
    this._sigTimer = null;
    this._busy = false;
    this._lastSig = "";
    this._sse = null;
    this._sseLastSpSig = "";
    this._setupSse();
  }

  _setupSse() {
    try {
      this._sse = new DaoSseClient(_cachedPort);
      this._sse.on("sp", (ev) => {
        if (!this._view) return;
        const sig = ev && ev.sig;
        if (sig && sig === this._sseLastSpSig) return;
        this._sseLastSpSig = sig || "";
        this.forceRefresh().catch(() => {});
      });
      this._sse.on("mode", (ev) => {
        if (!this._view) return;
        _cachedMode = (ev && ev.mode) || _cachedMode;
        try {
          this._view.webview.postMessage({ type: "mode", mode: ev && ev.mode });
        } catch {}
      });
      this._sse.on("connect", () => {
        if (this._view) this.forceRefresh().catch(() => {});
      });
      this._sse.start();
    } catch {
      this._sse = null;
    }
  }

  resolveWebviewView(webviewView) {
    L.info("webview", `resolveWebviewView called · port=${_cachedPort}`);
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      // v9.4.5 · localResourceRoots 必需 · 让 webview.asWebviewUri 能加载 media/*
      localResourceRoots: [
        vscode.Uri.joinPath(this._ctx.extensionUri, "media"),
      ],
      // portMapping: webview 内部 127.0.0.1:_cachedPort 直通 extensionHost 端
      portMapping: [
        { webviewPort: _cachedPort, extensionHostPort: _cachedPort },
      ],
    };
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (!msg) return;
      try {
        // v9.4.2 · 接 webview stage 回传 log (探真相)
        if (msg.command === "stage") {
          L.info("webview.stage", String(msg.stage || "?").slice(0, 120));
          return;
        }
        if (msg.command === "refresh") await this.refresh();
        else if (msg.command === "setMode") await this._handleSetMode(msg.mode);
        else if (msg.command === "getCustomSP") await this._handleGetCustomSP();
        else if (msg.command === "setCustomSP")
          await this._handleSetCustomSP(msg);
        else if (msg.command === "resetCustomSP")
          await this._handleResetCustomSP();
        else if (msg.command === "purge")
          await vscode.commands.executeCommand("dao.purge");
      } catch {}
    });
    // v9.4.2 · SSR 道魂直嵌 · webview 一加载就见帛书全文 · 零 fetch/postMessage 依赖
    // 三十二章: 道恒无名 · 侯王若能守之 · 万物将自宾
    const ssrSp = _loadSilkForWebview();
    L.info(
      "webview",
      `SSR load · silk_chars=${ssrSp.length} port=${_cachedPort}`,
    );
    const _html = getEssenceHtml(
      _cachedPort,
      null,
      ssrSp,
      webviewView.webview,
      this._ctx.extensionUri,
    );
    webviewView.webview.html = _html;
    // v9.4.5 · 强制 show webview · 否则 collapsed 时 JS 不跑
    try {
      webviewView.show(true);
      L.info("webview", `forced show(true) · visible=${webviewView.visible}`);
    } catch (e) {
      L.warn("webview", `show fail: ${e.message}`);
    }
    // v9.4.5 · 一次性 dump 实际 html 到磁盘 · 离线诊
    try {
      const dumpFp = path.join(os.homedir(), ".dao-webview-dump.html");
      if (!fs.existsSync(dumpFp)) {
        fs.writeFileSync(dumpFp, _html, "utf8");
        L.info("webview", `dumped html → ${dumpFp}`);
      }
    } catch (e) {
      L.warn("webview", `dump fail: ${e.message}`);
    }
    try {
      const _portMatch = _html.match(/var _PORT = ([^;]+);/);
      const _baseMatch = _html.match(/var _BASE = ([^;]+);/);
      const _hasIife = _html.indexOf("IIFE start") >= 0;
      const _hasPull = _html.indexOf("function pull(") >= 0;
      const _hasWdbg = _html.indexOf("function _wdbg(") >= 0;
      L.info(
        "webview",
        `html set \u00b7 len=${_html.length} _PORT=${_portMatch ? _portMatch[1] : "?"} _BASE=${_baseMatch ? _baseMatch[1] : "?"} hasIife=${_hasIife} hasPull=${_hasPull} hasWdbg=${_hasWdbg}`,
      );
    } catch (e) {
      L.warn("webview", `html dbg fail: ${e.message}`);
    }
    // v9.4.5 · 5s 自检 webview 是否真活 (_wdbg ringbuf 是否含 iife-start)
    setTimeout(async () => {
      try {
        const beforeCount = (
          await httpGetJson(
            `http://127.0.0.1:${_cachedPort}/origin/_wdbg`,
            1500,
          )
        ).count;
        // 触一次 postMessage 看 webview 是否反应
        if (this._view) {
          this._view.webview.postMessage({
            command: "_diag-ping",
            ts: Date.now(),
          });
        }
        await new Promise((r) => setTimeout(r, 1500));
        const after = await httpGetJson(
          `http://127.0.0.1:${_cachedPort}/origin/_wdbg`,
          1500,
        );
        const liveStart = after.log.find((x) => x.msg === "iife-start");
        const msgRecv = after.log.find(
          (x) => x.msg === "msg-recv" && x.tag === "_diag-ping",
        );
        L.info(
          "webview",
          `5s diag \u00b7 wdbg_count=${after.count} iife_start=${!!liveStart} diag_recv=${!!msgRecv} (before=${beforeCount})`,
        );
        if (!liveStart) {
          L.warn(
            "webview",
            `webview JS NOT alive \u00b7 iife-start \u672a\u5230 \u00b7 \u53ef\u80fd\u88ab CSP/parse \u62e6`,
          );
        }
      } catch (e) {
        L.warn("webview", `5s diag fail: ${e.message}`);
      }
    }, 5000);
    webviewView.onDidChangeVisibility(() => {
      L.info("webview", `visibility → ${webviewView.visible}`);
      if (webviewView.visible) {
        this.refresh().catch((e) =>
          L.warn("refresh", `vis fail: ${e.message}`),
        );
        this._armTimer();
      } else this._stopTimer();
    });
    webviewView.onDidDispose(() => {
      L.info("webview", "disposed");
      this._view = null;
      this._stopTimer();
    });
    this._armTimer();
    // 主动首推 · 不依赖 webview 'refresh' 消息 (CSP/race-safe · 反者道之动)
    setTimeout(() => this.refresh().catch(() => {}), 200);
    setTimeout(() => this.refresh().catch(() => {}), 1500);
    setTimeout(() => this.refresh().catch(() => {}), 5000);
  }

  _armTimer() {
    this._stopTimer();
    if (!this._view || !this._view.visible) return;
    // v7.3: 后备 timer 12s, sig poll 1.5s (sig 接 _customSP.at + sp_sig + custom_sig)
    this._timer = setInterval(() => this.refresh().catch(() => {}), 12000);
    this._sigTimer = setInterval(() => this._sigTick().catch(() => {}), 1500);
  }

  _stopTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._sigTimer) {
      clearInterval(this._sigTimer);
      this._sigTimer = null;
    }
  }

  async _sigTick() {
    if (!this._view || !this._view.visible || this._busy) return;
    if (this._sse && this._sse.isConnected()) {
      this._sigSkipCounter = (this._sigSkipCounter || 0) + 1;
      if (this._sigSkipCounter % 10 !== 0) return;
    }
    try {
      const sig = await httpGetJson(
        `http://127.0.0.1:${_cachedPort}/origin/sig`,
        800,
      );
      if (!sig || !sig.ok) return;
      // sig 接 _customSP / _injectsByKind / _spCandidates 变动 · 一签观全境
      const cur = `${sig.mode}|${sig.sp_sig}|${sig.custom_sig || "0"}|${sig.custom_sp_at || 0}|${sig.injects_last_at || 0}|${sig.spc_last_at || 0}|${sig.injects_count || 0}`;
      if (cur === this._lastSig) return;
      this._lastSig = cur;
      this.refresh().catch(() => {});
    } catch {}
  }

  async refresh() {
    if (!this._view) {
      L.info("refresh", "skip · _view null");
      return;
    }
    if (this._busy) {
      L.info("refresh", "skip · busy");
      return;
    }
    this._busy = true;
    try {
      const data = await gatherEssence(_cachedPort);
      if (!this._view) {
        L.info("refresh", "skip · _view became null after gather");
        return;
      }
      data.modeLabel = getModeLabel();
      data._port = _cachedPort;
      const afterChars =
        (data.proxy &&
          (data.proxy.after_chars || (data.proxy.after || "").length)) ||
        0;
      try {
        const ok = await this._view.webview.postMessage({ type: "data", data });
        L.info(
          "refresh",
          `postMessage ok=${ok} · proxy=${!!data.proxy} · after=${afterChars} · visible=${this._view.visible}`,
        );
        if (!ok)
          L.warn("refresh", "postMessage returned false (webview not ready?)");
      } catch (e) {
        L.warn("refresh", `postMessage error: ${e.message}`);
      }
    } catch (e) {
      L.warn("refresh", `gather/send error: ${e.message}`);
    } finally {
      this._busy = false;
    }
  }

  async forceRefresh() {
    this._busy = false;
    await this.refresh();
  }

  async _handleSetMode(mode) {
    if (mode === "dao" || mode === "invert") await cmdInvert();
    else await cmdPassthrough();
    this._lastSig = "";
    setTimeout(() => this.forceRefresh().catch(() => {}), 300);
  }

  async _handleGetCustomSP() {
    if (!this._view) return;
    try {
      const r = await httpGetJson(
        `http://127.0.0.1:${_cachedPort}/origin/custom_sp`,
        2000,
      );
      await this._view.webview.postMessage({
        type: "customSP",
        action: "get",
        has_custom: r && r.has_custom,
        sp: r && r.sp,
        chars: r && r.chars,
        keep_blocks: r && r.keep_blocks,
      });
    } catch {
      try {
        await this._view.webview.postMessage({
          type: "customSP",
          action: "get",
          has_custom: false,
        });
      } catch {}
    }
  }

  async _handleSetCustomSP(msg) {
    if (!this._view) return;
    try {
      // v7.8 一态整替 · keep_blocks 永 false (服务端 invertSP 永整替)
      const r = await httpPostJson(
        `http://127.0.0.1:${_cachedPort}/origin/custom_sp`,
        { sp: msg.sp, keep_blocks: false, source: "webview" },
        3000,
      );
      await this._view.webview.postMessage({
        type: "customSP",
        action: "set",
        ok: r && r.ok,
        chars: r && r.chars,
        error: r && r.error,
      });
      if (r && r.ok) {
        this._lastSig = "";
        setTimeout(() => this.forceRefresh().catch(() => {}), 300);
      }
    } catch (e) {
      try {
        await this._view.webview.postMessage({
          type: "customSP",
          action: "set",
          ok: false,
          error: e.message,
        });
      } catch {}
    }
  }

  async _handleResetCustomSP() {
    if (!this._view) return;
    try {
      const r = await httpDelete(
        `http://127.0.0.1:${_cachedPort}/origin/custom_sp`,
        2000,
      );
      await this._view.webview.postMessage({
        type: "customSP",
        action: "reset",
        ok: r && r.ok,
      });
      if (r && r.ok) {
        this._lastSig = "";
        setTimeout(() => this.forceRefresh().catch(() => {}), 300);
      }
    } catch {
      try {
        await this._view.webview.postMessage({
          type: "customSP",
          action: "reset",
          ok: false,
        });
      } catch {}
    }
  }

  dispose() {
    this._stopTimer();
    try {
      if (this._sse) this._sse.stop();
    } catch {}
    this._sse = null;
    this._view = null;
  }
}

// ═══════════════════════════ 命令: 道Agent ═══════════════════════════
async function cmdInvert() {
  try {
    const { port } = cfg();
    const wasAnchored = _cachedAnchored;
    await proxyStart(port, "invert");
    proxySetMode("invert");
    await setAnchor(port);
    installSpawnHook();
    // 首次锚定才需重启 LS · 已锚定则纯翻转模式即可
    if (!wasAnchored) {
      L.info("cmd-invert", `first anchor → killing LS`);
      const killed = await forceRestartLS();
      if (killed) {
        vscode.window.showInformationMessage(
          `道Agent · 已启 :${port} · LS 重启中`,
        );
      } else {
        const c = await vscode.window.showInformationMessage(
          `道Agent · 已启 · 未找到 LS`,
          "重载窗口",
          "稍后",
        );
        if (c === "重载窗口")
          await vscode.commands.executeCommand("workbench.action.reloadWindow");
      }
    } else {
      L.info("cmd-invert", `mode flipped → invert (zero-cost)`);
      vscode.window.showInformationMessage(
        `道Agent · 帛书德道经 SP 注入 · 下次对话生效`,
      );
    }
  } catch (e) {
    vscode.window.showErrorMessage(`道Agent 启失: ${e && e.message}`);
    L.error("cmd-invert", e && e.message);
  }
}

// ═══════════════════════════ 命令: 官方Agent ═══════════════════════════
// 官方模式 = proxy 仍运行但透传 · 不改 SP · 可观照 · 零代价热切
async function cmdPassthrough() {
  try {
    const { port } = cfg();
    // 确保 proxy 运行 (观照需要)
    await proxyStart(port, "passthrough");
    proxySetMode("passthrough");
    L.info(
      "cmd-pass",
      `mode flipped → passthrough (proxy stays for observation)`,
    );
    vscode.window.showInformationMessage(
      `官方Agent · 透传观照 · SP 不改 · 下次对话生效`,
    );
  } catch (e) {
    vscode.window.showErrorMessage(`官方Agent 切换失败: ${e && e.message}`);
    L.error("cmd-pass", e && e.message);
  }
}

// ═══════════════════════════ 命令: 切换 ═══════════════════════════
async function cmdToggle() {
  const cur = proxyGetMode();
  if (cur === "invert") await cmdPassthrough();
  else await cmdInvert();
}

// ═══════════════════════════ 命令: 浏览器观 ═══════════════════════════
async function cmdOpenPreview() {
  const url = `http://127.0.0.1:${_cachedPort}/origin/preview`;
  try {
    await vscode.env.openExternal(vscode.Uri.parse(url));
  } catch {}
}

// ═══════════════════════════ 命令: 了事拂衣去 (净卸) ═══════════════════════════
async function cmdPurge() {
  const answer = await vscode.window.showWarningMessage(
    "了事拂衣去 · 水过无痕 · 将彻底卸载道Agent:\n" +
      "① 透传  ② 断钩  ③ 清锚  ④ 杀LS  ⑤ 停代理\n" +
      "⑥ 清持存  ⑦ 清残留  ⑧ 自卸插件\n" +
      "Windsurf 回归本源 · 零痕迹。确认？",
    { modal: true },
    "确认净卸",
  );
  if (answer !== "确认净卸") return;

  const out = logger();
  out.show(true);
  out.appendLine("\n══════ 了事拂衣去 · 水过无痕 · 净卸开始 ══════");

  // ── 顺序至关重要 · 反者道之动 ──
  // 先清锚+杀LS → 后停代理 · 防 LS 连死代理 → Windsurf 卡死

  // 1. 先设透传 · 过渡期 LS 若仍连代理 · 安全透传
  try {
    if (_proxyHandle && _proxyHandle.setMode)
      _proxyHandle.setMode("passthrough");
    out.appendLine("  ✓ 代理已设透传 (安全过渡)");
  } catch {}

  // 2. 卸 spawn hook · 新 LS 不再被截持
  try {
    _cachedAnchored = false;
    removeSpawnHook();
    out.appendLine("  ✓ spawn hook 已卸");
  } catch {}

  // 3. 清除所有 dao 相关 settings (文件直写 + API 双保险)
  // VS Code API 对 codeium.* 键可能失败 (非注册键) · 文件直写兜底
  try {
    _clearAnchorFileSync();
    // API 补清 dao.* 注册键 (这些能成功)
    const c = vscode.workspace.getConfiguration();
    for (const k of [
      "dao.origin.port",
      "dao.origin.defaultMode",
      "dao.origin.banner",
    ]) {
      try {
        await c.update(k, undefined, vscode.ConfigurationTarget.Global);
      } catch {}
    }
    out.appendLine("  ✓ 所有 dao 设置已清 (文件+API)");
  } catch (e) {
    out.appendLine(`  ⚠ 清设置: ${e.message}`);
  }

  // 4. 杀 LS · 使其重生 · 无钩无锚 → 直连官方
  try {
    const killed = await forceRestartLS();
    out.appendLine(`  ✓ LS ${killed ? "已杀 · 将重生直连官方" : "未找到"}`);
  } catch (e) {
    out.appendLine(`  ⚠ 杀LS: ${e.message}`);
  }

  // 5. 停反代 · 此时 LS 已死或已重生直连官方 · 安全
  try {
    await proxyStop();
    out.appendLine("  ✓ 反代已停");
  } catch (e) {
    out.appendLine(`  ⚠ 停反代: ${e.message}`);
  }

  // 6. 清 source.js 持存文件 (mode / lastinject / custom_sp)
  try {
    const vd = vendorDir();
    const persistFiles = [
      "_origin_mode.txt",
      "_lastinject.json",
      "_custom_sp.json",
    ];
    let cleaned = 0;
    for (const f of persistFiles) {
      const fp = path.join(vd, f);
      try {
        if (fs.existsSync(fp)) {
          fs.unlinkSync(fp);
          cleaned++;
        }
      } catch {}
    }
    out.appendLine(`  ✓ 持存文件: ${cleaned} 清`);
  } catch (e) {
    out.appendLine(`  ⚠ 清持存: ${e.message}`);
  }

  // 7. 清 ~/.dao-proxy 目录 (如存在)
  try {
    const daoProxyDir = path.join(os.homedir(), ".dao-proxy");
    if (fs.existsSync(daoProxyDir)) {
      fs.rmSync(daoProxyDir, { recursive: true, force: true });
      out.appendLine("  ✓ ~/.dao-proxy 已清");
    }
  } catch (e) {
    out.appendLine(`  ⚠ 清 .dao-proxy: ${e.message}`);
  }

  // 8. 清 .obsolete 中 dao/wam 残留
  try {
    const extDir = path.join(os.homedir(), ".windsurf", "extensions");
    const obsFile = path.join(extDir, ".obsolete");
    if (fs.existsSync(obsFile)) {
      const obs = JSON.parse(fs.readFileSync(obsFile, "utf8"));
      let removed = 0;
      for (const k of Object.keys(obs)) {
        if (/dao|wam/i.test(k)) {
          delete obs[k];
          removed++;
        }
      }
      if (removed > 0) {
        fs.writeFileSync(obsFile, JSON.stringify(obs), "utf8");
        out.appendLine(`  ✓ .obsolete: ${removed} 条 dao/wam 残留已清`);
      }
    }
  } catch (e) {
    out.appendLine(`  ⚠ 清 .obsolete: ${e.message}`);
  }

  // 9. 自卸插件
  out.appendLine("  → 卸载插件 dao-agi.dao-proxy-min ...");
  out.appendLine("══════ 了事拂衣去 · 水过无痕 · 道法自然 ══════\n");

  try {
    await vscode.commands.executeCommand(
      "workbench.extensions.uninstallExtension",
      "dao-agi.dao-proxy-min",
    );
  } catch (e) {
    out.appendLine(`  ⚠ 自卸: ${e.message} · 请手动卸载`);
  }

  // 9. 提示重载 (modal · 必看 · source.js child 与 webview 残皆需 reload 方彻底清)
  const reload = await vscode.window.showInformationMessage(
    "了事拂衣去 · 水过无痕 · Windsurf 已归本源\n\n" +
      "插件已自卸 · 设置已清 · LS 已重生直连官方\n" +
      "唯余 utility process 内 source.js child 与 webview 残相\n" +
      "立即重载方彻底归本然 · 道法自然",
    { modal: true },
    "立即重载",
    "稍后重载",
  );
  if (reload === "立即重载") {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
}

// ═══════════════════════════ 命令: E2E 自检 ═══════════════════════════
async function cmdVerifyE2E() {
  await cmdSelftest();
}

// ═══════════════════════════ 命令: 自检 ═══════════════════════════
async function cmdSelftest() {
  const out = logger();
  out.show(true);
  out.appendLine("");
  out.appendLine("════════════════════════════════════════");
  out.appendLine(
    `  道Agent v${PKG_VERSION} · 自检 · ${new Date().toISOString()}`,
  );
  out.appendLine("════════════════════════════════════════");

  const { port } = cfg();

  // L1: selftest (via proxy HTTP endpoint)
  out.appendLine("\n── L1 · proto 单元 ──");
  try {
    const r = await httpGetJson(
      `http://127.0.0.1:${port}/origin/selftest`,
      5000,
    );
    if (r && r.paths) {
      const pass = r.all_paths_pass;
      out.appendLine(
        `  帛书《老子》: ${r.dao_chars || "?"}字 · ${r.version || "?"} · ${pass ? "✓全绿" : "✗有失败"}`,
      );
      for (const [name, p] of Object.entries(r.paths)) {
        const ok =
          (p.contains_dao !== false &&
            p.cascade_first !== false &&
            p.has_tao_header !== false &&
            (!p.missing_keep || p.missing_keep.length === 0) &&
            (!p.leaked || p.leaked.length === 0)) ||
          p.stripped_ok === true;
        out.appendLine(
          `  ${ok ? "✓" : "✗"} ${name}: ${p.before_chars}→${p.after_chars}B`,
        );
      }
    } else {
      out.appendLine("  ⚠ /origin/selftest 无响应 (代理未启?)");
    }
  } catch (e) {
    out.appendLine(`  ✗ L1 异: ${e.message}`);
  }

  // L2: proxy 路径
  out.appendLine("\n── L2 · 反代路径 ──");
  out.appendLine(
    `  port: ${port} (per-user) · anchored: ${isAnchored()} · mode: ${proxyGetMode()}`,
  );
  try {
    const ping = await httpGetJson(
      `http://127.0.0.1:${port}/origin/ping`,
      2000,
    );
    if (ping) {
      out.appendLine(
        `  ✓ proxy up: v=${ping.version} mode=${ping.mode} uptime=${ping.uptime_s}s req=${ping.req_total} cap=${ping.capture_count}`,
      );
    } else {
      out.appendLine("  ✗ proxy unreachable");
    }
  } catch (e) {
    out.appendLine(`  ✗ ping: ${e.message}`);
  }

  try {
    const last = await httpGetJson(
      `http://127.0.0.1:${port}/origin/lastinject`,
      2000,
    );
    if (last && last.has_inject) {
      out.appendLine(
        `  最近注入: ${last.at ? new Date(last.at).toISOString() : "?"} ${last.rpc || last.url || ""}`,
      );
      out.appendLine(
        `    before(${last.before_chars || 0}字): ${(last.before_head || "").slice(0, 80)}…`,
      );
      out.appendLine(
        `    after(${last.after_chars || 0}字): ${(last.after_head || "").slice(0, 80)}…`,
      );
    }
  } catch {}

  try {
    const paths = await httpGetJson(
      `http://127.0.0.1:${port}/origin/paths?n=10`,
      2000,
    );
    if (paths && paths.top && paths.top.length) {
      out.appendLine(`\n  路径直方图 (${paths.total_paths} paths):`);
      for (const p of paths.top) {
        const tags = [];
        if (p.is_chat) tags.push("CHAT");
        if (p.replaced > 0) tags.push(`✓${p.replaced}`);
        out.appendLine(
          `    ${String(p.count).padStart(5)} ${p.path} [${tags.join(",")}]`,
        );
      }
    }
  } catch {}

  out.appendLine("\n── L3 · 活检指引 ──");
  out.appendLine(`  1. 运行 "道Agent: 启" → LS 重启 → 向 Cascade 问 '你是谁'`);
  out.appendLine(`  2. 期答含 '道'/'无为'/'自然' (帛书德道经 SP 注入成功)`);
  out.appendLine("════════════════════════════════════════\n");
}

// ═══════════════════════════ HTML · 本源观照 ═══════════════════════════
function _genNonce() {
  // 32-char hex nonce · CSP-strict · 道法自然
  const a = new Uint8Array(16);
  for (let i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
// HTML 转义 · SSR 嵌入 <pre> textContent 需之
function _escapeHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// v9.4.2 · 加载帛书 (webview SSR 用) · 与 source.js 同源
// 道魂 = TAO_HEADER + 帛书上·德经 + 边界 + 帛书下·道经 + TAO_FOOTER
function _loadSilkForWebview() {
  try {
    const vendorDir = path.join(__dirname, "vendor", "bundled-origin");
    const deFp = path.join(vendorDir, "_silk_de.txt");
    const daoFp = path.join(vendorDir, "_silk_dao.txt");
    if (!fs.existsSync(deFp) || !fs.existsSync(daoFp)) return "";
    const deText = fs.readFileSync(deFp, "utf8").trim();
    const daoText = fs.readFileSync(daoFp, "utf8").trim();
    if (!deText || !daoText) return "";
    const TAO_HEADER =
      "You are Cascade.\n\n<user_rules>\n<MEMORY[dao-de-jing.md]>\n\n" +
      "你是cascade  你所接受全部规则均来自于下述帛书《老子》上篇·德经全文（汉墓帛书甲本）\n\n";
    const SILK_BOUNDARY =
      "\n\n</MEMORY[dao-de-jing.md]>\n" +
      "<MEMORY[dao-de-jing-xia.md]>\n\n" +
      "你是cascade  你所接受全部规则均来自于下述帛书《老子》下篇·道经全文（汉墓帛书甲本）\n\n";
    const TAO_FOOTER = "\n\n</MEMORY[dao-de-jing-xia.md]>\n</user_rules>\n";
    return TAO_HEADER + deText + SILK_BOUNDARY + daoText + TAO_FOOTER;
  } catch {
    return "";
  }
}

function getEssenceHtml(port, nonce, initialSP, webview, extensionUri) {
  const N = nonce || _genNonce();
  const proxyPort = port || 0;
  // v9.4.5 · 必须 external script · VSCode webview 阻所有 inline script (即使 nonce 匹配也阻)
  // 道义: 二章 "声人居无为之事 · 行不言之教". 不强 inline 而顺 VSCode 之所允.
  const scriptUri =
    webview && extensionUri
      ? webview.asWebviewUri(
          vscode.Uri.joinPath(extensionUri, "media", "webview-app.js"),
        )
      : null;
  const cspSource = webview ? webview.cspSource : "";
  // v9.4.2 · SSR 道魂直嵌 · webview 一开即见帛书全文 · 零 fetch/postMessage 依赖
  // 道义: 三十二章 "道恒无名 · 侯王若能守之 · 万物将自宾"
  const ssrSp = initialSP && initialSP.length > 0 ? initialSP : "";
  const ssrSpEscaped = _escapeHtml(ssrSp);
  const ssrClass = ssrSp ? "" : "quiet";
  const ssrContent = ssrSp || "\u89c2\u2026";
  const ssrContentHtml = ssrSp ? ssrSpEscaped : "\u89c2\u2026";
  const ssrMeta = ssrSp ? ssrSp.length + " \u5b57 \u00b7 SSR" : "\u2014";
  const ssrSource = ssrSp
    ? "\u9053\u9b42 \u00b7 SSR \u76f4\u5d4c \u00b7 \u5e1b\u4e66\u7532\u672c \u00b7 \u4faf\u738b\u82e5\u80fd\u5b88\u4e4b"
    : "";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src ${cspSource}; connect-src http://127.0.0.1:* http://localhost:*; img-src ${cspSource} data:;">
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    font-family: var(--vscode-font-family); color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, transparent);
    margin: 0; padding: 6px 8px; font-size: 12px; line-height: 1.55;
    display: flex; flex-direction: column;
  }
  .bar { display: flex; gap: 3px; align-items: center; margin-bottom: 3px; flex: 0 0 auto; font-size: 10px; flex-wrap: wrap; }
  .ib {
    padding: 2px 5px; font-size: 12px; border: 1px solid transparent;
    background: transparent; color: var(--vscode-foreground);
    cursor: pointer; border-radius: 2px; font-family: inherit;
    opacity: 0.65; min-width: 20px; line-height: 1;
  }
  .ib:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.15)); }
  .age-tick { font-family:monospace; font-size:9px; opacity:0.5; margin-left:3px; }
  .mb {
    padding: 1px 7px; font-size: 11px; border: 1px solid rgba(128,128,128,0.3);
    background: transparent; color: var(--vscode-foreground);
    cursor: pointer; border-radius: 3px; font-family: inherit;
    opacity: 0.55; line-height: 1.3; transition: all 0.15s; font-weight: 500;
  }
  .mb:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.15)); }
  .mb.active { opacity: 1; border-color: var(--vscode-textLink-foreground, #4fc1ff); color: var(--vscode-textLink-foreground, #4fc1ff); background: rgba(79,193,255,0.1); font-weight: 700; }
  .mb.active-dao { border-color: #6bb86b; color: #6bb86b; background: rgba(107,184,107,0.1); }
  .mode-hint { font-size: 9px; opacity: 0.4; margin-left: 2px; }
  .dots { display: inline-flex; gap: 2px; align-items: center; padding: 0 4px; cursor: help; }
  .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: rgba(128,128,128,0.3); }
  .dot.ok { background: #6bb86b; } .dot.warn { background: #d9a200; } .dot.err { background: #e08080; }
  .meta { margin-left: auto; opacity: 0.5; font-family: monospace; font-size: 10px; }
  .source { font-size: 9px; opacity: 0.5; margin: 0 0 3px; min-height: 12px; line-height: 1.4; }
  #sp {
    flex: 1 1 auto; overflow: auto; margin: 0; padding: 10px 12px;
    font-family: "Noto Serif CJK SC", "Microsoft YaHei", var(--vscode-editor-font-family), serif;
    font-size: 11.5px; line-height: 1.75; white-space: pre-wrap; word-break: break-word;
    background: rgba(0,0,0,0.08); border-radius: 3px;
  }
  #sp.quiet { text-align: center; opacity: 0.35; font-style: italic; padding: 40px 0; letter-spacing: 1px; }
  .ib.edit-active { opacity: 1; color: #e8a040; border-color: #e8a040; background: rgba(232,160,64,0.1); }
  #editArea { display: none; flex: 1 1 auto; flex-direction: column; }
  #editArea.show { display: flex; }
  #editArea textarea {
    flex: 1 1 auto; resize: none; border: 1px solid rgba(128,128,128,0.3); border-radius: 3px; padding: 8px 10px;
    font-family: "Noto Serif CJK SC", "Microsoft YaHei", var(--vscode-editor-font-family), serif;
    font-size: 11.5px; line-height: 1.75;
    background: var(--vscode-input-background, rgba(0,0,0,0.12)); color: var(--vscode-input-foreground, var(--vscode-foreground));
    outline: none; min-height: 120px;
  }
  #editArea textarea:focus { border-color: var(--vscode-focusBorder, #007fd4); }
  .edit-bar { display: flex; gap: 4px; align-items: center; margin-top: 4px; flex: 0 0 auto; font-size: 10px; }
  .edit-bar .eb {
    padding: 2px 8px; font-size: 10px; border: 1px solid rgba(128,128,128,0.3);
    background: transparent; color: var(--vscode-foreground); cursor: pointer; border-radius: 3px;
    font-family: inherit; line-height: 1.4; transition: all 0.15s;
  }
  .edit-bar .eb:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.15)); }
  .edit-bar .eb.save { border-color: #6bb86b; color: #6bb86b; }
  .edit-bar .eb.save:hover { background: rgba(107,184,107,0.15); }
  .edit-bar .eb.reset { border-color: #e08080; color: #e08080; }
  .edit-bar .eb.reset:hover { background: rgba(224,128,128,0.15); }
  .edit-bar .edit-status { opacity: 0.5; margin-left: auto; font-size: 9px; }
  .custom-badge { display: inline-block; font-size: 8px; padding: 0 4px; border-radius: 2px; background: rgba(232,160,64,0.2); color: #e8a040; border: 1px solid rgba(232,160,64,0.3); margin-left: 4px; }
  /* 全貌段头 · 全 RPC 叠卷中区隔各槽 */
  .field-head { color: #d9a200; opacity: 0.75; font-weight: 600; }
  .kind-head { color: #4fc1ff; opacity: 0.85; font-weight: 700; margin-top: 4px; }
  /* v9.4.5 · tape 浏控 · 底层之底 · 时序一切 */
  .tape-nav { font-size: 13px; padding: 1px 4px; }
  .tape-idx { font-family: monospace; font-size: 9px; opacity: 0.7; padding: 0 2px; min-width: 32px; text-align: center; }
  .tape-view { font-size: 10px; padding: 1px 5px; border: 1px solid rgba(128,128,128,0.25); margin-left: 1px; }
  .tape-view.active { opacity: 1; border-color: #4fc1ff; color: #4fc1ff; background: rgba(79,193,255,0.1); font-weight: 700; }
</style>
</head>
<body data-port="${proxyPort}">
  <div class="bar">
    <span class="dots" id="dots" title="Proxy\u00b7Capture\u00b7Mode"></span>
    <button class="mb" id="btnDao" title="\u9053Agent \u00b7 \u9053\u5fb7\u7ecfSP">\u9053</button>
    <button class="mb" id="btnOff" title="\u5b98\u65b9Agent \u00b7 \u539f\u5473SP">\u5b98</button>
    <span class="mode-hint" id="modeHint"></span>
    <button class="ib" id="refresh" title="\u5237\u65b0">\u27f3</button>
    <button class="ib tape-nav" id="tapePrev" title="\u4e0a\u4e00\u6761 (\u66f4\u65e9)">\u25c2</button>
    <span class="tape-idx" id="tapeIdx">\u2014</span>
    <button class="ib tape-nav" id="tapeNext" title="\u4e0b\u4e00\u6761 (\u66f4\u65b0)">\u25b8</button>
    <button class="ib tape-view" id="tapeViewBefore" title="\u539f\u53d1 (LS\u53d1\u51fa\u7684)">\u539f</button>
    <button class="ib tape-view active" id="tapeViewAfter" title="\u5b9e\u53d1 (\u771f\u6ce8\u5165 agent \u7684)">\u5b9e</button>
    <button class="ib tape-view" id="tapeViewFields" title="\u5168\u5b57\u6bb5 \u00b7 body \u6240\u6709 utf8 utf8 \u5b57\u6bb5 \u00b7 \u5e95\u5c42\u4e4b\u5e95">\u5168</button>
    <button class="ib" id="copy" title="\u590d\u5236">\u29c9</button>
    <button class="ib" id="editToggle" title="\u7f16\u8f91\u6ce8\u5165SP">\u270e</button>
    <span id="customBadge"></span>
    <span class="meta" id="meta">\u2014</span>
    <span class="age-tick" id="ageTick"></span>
    <button class="ib" id="btnPurge" title="\u4e86\u4e8b\u62c2\u8863\u53bb \u00b7 \u6c34\u8fc7\u65e0\u75d5 \u00b7 \u5f7b\u5e95\u5378\u8f7d" style="margin-left:auto;opacity:0.35;font-size:11px;color:#e08080;">\u2716</button>
  </div>
  <div class="source" id="source">${ssrSource}</div>
  <pre id="sp" class="${ssrClass}">${ssrContentHtml}</pre>
  <noscript><div style="padding:16px;color:#e08080;font-size:11px">\u811a\u672c\u88abCSP\u62e6\u622a \u00b7 \u8bf7\u91cd\u8f7d</div></noscript>
  <div id="editArea">
    <textarea id="editText"></textarea>
    <div class="edit-bar">
      <button class="eb save" id="editSave" title="Ctrl+Enter">\u2714 \u6ce8\u5165</button>
      <button class="eb reset" id="editReset" title="\u6e05 _customSP \u00b7 \u56de\u9ed8\u9053\u5fb7\u7ecf\u8def\u5f84">\u2716 \u5f52\u9053</button>
      <span class="edit-status" id="editStatus"></span>
    </div>
  </div>
<script src="${scriptUri}"></script>

</body>
</html>`;
}

// ═══════════════════════════ icon.svg placeholder ═══════════════════════════
function ensureIconSvg() {
  const svgPath = path.join(__dirname, "media", "icon.svg");
  if (fs.existsSync(svgPath)) return;
  try {
    fs.mkdirSync(path.join(__dirname, "media"), { recursive: true });
    fs.writeFileSync(
      svgPath,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a7.5 7.5 0 0 0 0 15 5 5 0 0 1 0 5"/></svg>`,
    );
  } catch {}
}

// ═══════════════════════════ activate / deactivate ═══════════════════════════
let _essenceProvider = null;

function activate(ctx) {
  try {
    cfg();
    _cachedAnchored = isAnchored();
    _cachedMode = vscode.workspace
      .getConfiguration("dao")
      .get("origin.defaultMode", "invert");

    installSpawnHook();
    ensureIconSvg();

    L.info(
      "ext",
      `dao-proxy-min v${PKG_VERSION} activate · port=${_cachedPort} anchored=${_cachedAnchored} user=${os.userInfo().username}`,
    );

    // 道德经横幅 (默认关 · 不言之教)
    if (vscode.workspace.getConfiguration("dao").get("origin.banner", false)) {
      const q = DAO_QUOTES[Math.floor(Math.random() * DAO_QUOTES.length)];
      vscode.window.showInformationMessage(`道Agent v${PKG_VERSION} · ${q}`);
    }

    // 注册命令
    ctx.subscriptions.push(
      vscode.commands.registerCommand("wam.originInvert", cmdInvert),
      vscode.commands.registerCommand("wam.originPassthrough", cmdPassthrough),
      vscode.commands.registerCommand("dao.toggleMode", cmdToggle),
      vscode.commands.registerCommand("dao.openPreview", cmdOpenPreview),
      vscode.commands.registerCommand("wam.verifyEndToEnd", cmdVerifyE2E),
      vscode.commands.registerCommand("wam.selftest", cmdSelftest),
      vscode.commands.registerCommand("dao.purge", cmdPurge),
    );

    // 注册 webview
    _essenceProvider = new EssenceProvider(ctx);
    ctx.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        "dao.essence",
        _essenceProvider,
        {
          webviewOptions: { retainContextWhenHidden: true },
        },
      ),
    );

    // v9.4.2 · 自 focus dao-container · 强制 resolveWebviewView 触发 · SSR 帛书立现
    // 三十七章: 道恒无名 · 侯王若能守之 · 万物将自化
    // 首装 / 重装 / 更新后 · 侧栏可能默 collapse · 一focus即开 · 主公无需手动
    setTimeout(() => {
      try {
        vscode.commands.executeCommand(
          "workbench.view.extension.dao-container",
        );
        L.info("activate", "focus dao-container · webview 自化");
      } catch (e) {
        L.warn("activate", `focus fail: ${e.message}`);
      }
    }, 500);

    // ── 真药 D · activate 不杀 LS · 为道日损 (四十八章) ──
    // 首装/恢复 仅启 proxy + 锚 settings + 装 hook, 不主动 forceRestartLS
    // LS 自然重启时 spawn hook 自挂; 用户欲即时切换可显式调 wam.originInvert
    if (_cachedAnchored) {
      L.info("activate", "settings anchored → auto-restore proxy");
      proxyStart(_cachedPort, _cachedMode || "invert")
        .then((handle) => {
          if (!handle) {
            // EADDRINUSE 且远端非反代 → 本窗口直连, 清锚归本源
            L.warn("activate", "auto-restore: 端口占且非反代 · 清锚归直连");
            return clearAnchor().catch(() => {});
          }
          proxySetMode(_cachedMode || "invert");
          L.info("activate", "auto-restore done");
        })
        .catch((e) => {
          L.error("activate", `auto-restore fail: ${e.message}`);
        });
    } else {
      // 首装 · 温和自启
      L.info("activate", "not anchored → 温和自启 (不杀 LS)");
      (async () => {
        let handle;
        try {
          handle = await proxyStart(_cachedPort, _cachedMode || "invert");
        } catch (e) {
          L.error("activate", `first-run proxy fail: ${e.message}`);
          return;
        }
        if (!handle) {
          L.warn(
            "activate",
            "first-run: 端口占且非反代 · 跳过锚 (本窗口直连, 不抢)",
          );
          return;
        }
        proxySetMode(_cachedMode || "invert");
        try {
          await setAnchor(_cachedPort);
        } catch (e) {
          L.warn("activate", `first-run anchor fail (non-fatal): ${e.message}`);
          _cachedAnchored = true;
          _cachedProxyUrl = `http://127.0.0.1:${_cachedPort}`;
        }
        L.info(
          "activate",
          "first-run: proxy+anchor 就位 · 下次 LS 启动自然挂钩",
        );
      })();
    }
  } catch (e) {
    L.error("activate", `FATAL activation error: ${e.stack || e.message}`);
    vscode.window.showErrorMessage(`道Agent 激活失败: ${e.message}`);
  }
}

async function deactivate() {
  L.info("ext", "deactivate");
  const isLocal = _proxyHandle && _proxyHandle.server;

  // ── 顺序至关重要 · 反者道之动 ──
  // 正序 (停代理→清锚→杀LS) 必死 · 因 LS 连死代理 → Windsurf 卡死
  // 逆序 (透传→清锚→杀LS→停代理) · 道法自然 · 无为而无不为

  // ① 先设透传 · 过渡期 LS 若仍连代理 · 透传至官方 · 不断不乱
  if (isLocal && _proxyHandle.setMode) {
    try {
      _proxyHandle.setMode("passthrough");
    } catch {}
  }

  // ② 立即断钩 · 新 LS 不再被截持
  _cachedAnchored = false;
  removeSpawnHook();

  // ③ 同步清锚 (直写 settings.json) · VS Code API 不可靠 (codeium.* 非注册键)
  // 文件直写 → Windsurf file watcher → 内存刷新 · 后续 LS 重启指向官方
  if (isLocal) _clearAnchorFileSync();

  // ④ 杀 LS · 使其重生 · 无钩无锚 → 直连官方
  if (isLocal) {
    try {
      await forceRestartLS();
    } catch {}
  }

  // ⑤ dispose webview
  if (_essenceProvider) {
    _essenceProvider.dispose();
    _essenceProvider = null;
  }

  // ⑥ 停代理 · 此时 LS 已死或已重生直连官方 · 安全
  await proxyStop();
  L.info(
    "deactivate",
    isLocal
      ? "local: passthrough→清锚→杀LS→停代理 · 道法自然"
      : "remote: 仅停代理",
  );
}

module.exports = { activate, deactivate };
