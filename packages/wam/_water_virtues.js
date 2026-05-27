// _water_virtues.js — 道法自然 · 水之四德 · 不破不夺
//
//   上善若水。水善利万物而不争, 处众人之所恶, 故几于道。
//   居善地, 心善渊, 与善仁, 言善信, 政善治, 事善能, 动善时。
//   夫唯不争, 故无尤。
//
// 此模块为既有 WAM/dao-agi 插件的"轻量增益层", 不替换任何原代码,
// 仅在 require 时 monkey-patch 三个全局接口, 注入"四德":
//
//   一德 · 选举 (Leader Election)        多实例并立时, 仅 leader 跑切号引擎
//   二德 · 降频 (Idle / Follower Throttle) follower / idle 期间所有定时器自然减速
//   三德 · 滚切 (Log Rotation)            日志文件 > 阈值即 rename → .old, 不增不损
//   四德 · 熔断 (Circuit Breaker)         host 连续失败累计 → 短暂歇息, 不强求
//
// 接入方式 (任一处 try{require}, 失败也不影响主插件):
//   try { require(require('path').join(require('os').homedir(), '.wam-hot', '_water_virtues.js')); } catch {}
//
// 卸载方式: 删此文件即解除全部补丁 (无副作用残留)
//
// 暴露接口 (供 dao-agi extension.js 内化使用):
//   - state() / snapshot()       状态快照
//   - markActivity()             外部事件标记 (可不调, 已自动 hook vscode)
//   - assertLeader() => boolean  当前是否 leader (供 follower 让出守护)
//   - setLogger(fn)              注入外部日志器 (dao-agi 之 log channel)
//   - release()                  释放 leader lock (供 deactivate)
//   - disable()                  完全停用 monkey-patch (恢复原 setInterval/appendFile/request)
//   - dispose()                  ctx.subscriptions 标准接口 = release + disable
//
// env DAO_WATER_ENABLED=0 可在加载前预先停用本模块.
//
// 道之华? 不也, 道之朴。
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

// ── 状态(单例) ──────────────────────────────────────────────────────────
const G = global;
const KEY = "__dao_water_virtues__";
if (G[KEY] && G[KEY].activated) {
  module.exports = G[KEY].api;
  return;
}

// env 早期停用 (整模块 noop, 主插件感知不到)
const _ENABLED = !/^(0|false|no|off)$/i.test(
  String(process.env.DAO_WATER_ENABLED || ""),
);
if (!_ENABLED) {
  const noop = () => {};
  const noopApi = {
    state: () => ({
      activated: false,
      disabled: true,
      reason: "DAO_WATER_ENABLED=0",
    }),
    snapshot: () => ({ activated: false, disabled: true }),
    markActivity: noop,
    assertLeader: () => true, // 禁用时视己为 leader (不让出任何守护)
    setLogger: noop,
    release: noop,
    disable: noop,
    dispose: noop,
    STATE: { activated: false, disabled: true, isLeader: true },
    CFG: {},
  };
  G[KEY] = { activated: false, api: noopApi };
  module.exports = noopApi;
  return;
}

const STATE = {
  activated: false,
  disabled: false,
  pid: process.pid,
  startedAt: Date.now(),
  isLeader: true, // 默认乐观: 只要不发现冲突即视己为 leader
  electionTs: 0,
  electionLogged: false,
  cb: Object.create(null), // host -> { fail, openedAt }
  rotChecked: Object.create(null), // logPath -> last check ts
  intervalCount: 0,
  intervalThrottled: 0,
  startBlocked: 0, // 熔断态拒绝的请求数
  WAM_DIR: path.join(os.homedir(), ".wam-hot"),
};
let _extLogger = null; // dao-agi 注入之外部日志器, fn(line:string)
let _heartbeatTimer = null; // 心跳定时器句柄, 供 dispose 释放
G[KEY] = { activated: false }; // 占位, 末尾 activate 后再装 api

// ── 配置(可被 env 覆盖, 不需 vscode) ──────────────────────────────────────
const CFG = {
  ELECTION_TTL_MS:
    parseInt(process.env.DAO_WATER_ELECTION_TTL_MS || "", 10) || 90000, // 90s 锁过期
  ELECTION_HEART_MS:
    parseInt(process.env.DAO_WATER_ELECTION_HEART_MS || "", 10) || 60000, // 60s 心跳
  FOLLOWER_SLOWDOWN:
    parseFloat(process.env.DAO_WATER_FOLLOWER_SLOWDOWN || "") || 3.0, // follower 定时器 ×3
  IDLE_AFTER_MS:
    parseInt(process.env.DAO_WATER_IDLE_AFTER_MS || "", 10) || 600000, // 10min 无活动视为 idle
  IDLE_SLOWDOWN: parseFloat(process.env.DAO_WATER_IDLE_SLOWDOWN || "") || 4.0, // idle 时定时器 ×4
  LOG_MAX_BYTES:
    parseInt(process.env.DAO_WATER_LOG_MAX_BYTES || "", 10) || 5 * 1024 * 1024, // 5MB 滚切
  LOG_CHECK_MIN_MS: 30000, // 同一文件至多每 30s 才检查一次大小
  CB_FAIL_THRESHOLD:
    parseInt(process.env.DAO_WATER_CB_FAIL_THRESHOLD || "", 10) || 10, // 同 host 累计 10 次失败
  CB_FAIL_WINDOW_MS:
    parseInt(process.env.DAO_WATER_CB_FAIL_WINDOW_MS || "", 10) || 60000, // 1min 窗口
  CB_OPEN_MS: parseInt(process.env.DAO_WATER_CB_OPEN_MS || "", 10) || 5 * 60000, // 熔断 5 分钟
  WATER_LOG:
    process.env.DAO_WATER_LOG ||
    path.join(os.homedir(), ".wam-hot", "water.log"),
  // host 白名单: 不熔断 (e.g. 本地反代/Cloudflare relay)
  CB_BYPASS: ["127.0.0.1", "localhost", "::1"],
};

// ── 便捷工具 ─────────────────────────────────────────────────────────────
function _now() {
  return Date.now();
}
function _safeWrite(line) {
  try {
    const dir = path.dirname(CFG.WATER_LOG);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
    fs.appendFileSync(CFG.WATER_LOG, line);
  } catch {}
}
function wlog(tag, msg) {
  const line = `[${new Date().toISOString()}] [${tag}] ${msg}\n`;
  _safeWrite(line);
  if (_extLogger) {
    try {
      _extLogger(`[water:${tag}] ${msg}`);
    } catch {}
  }
}

// ── 一德 · 选举 ──────────────────────────────────────────────────────────
const LOCK_FILE = path.join(STATE.WAM_DIR, ".water_leader.lock");

function _readLock() {
  try {
    return JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
  } catch {
    return null;
  }
}
function _writeLock(payload) {
  try {
    fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
    fs.writeFileSync(LOCK_FILE, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
function _pidAlive(pid) {
  if (!pid || pid === STATE.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function _elect() {
  const cur = _readLock();
  const now = _now();
  if (cur && cur.pid && cur.pid !== STATE.pid) {
    const fresh = now - (cur.ts || 0) < CFG.ELECTION_TTL_MS;
    if (fresh && _pidAlive(cur.pid)) {
      STATE.isLeader = false;
      if (!STATE.electionLogged) {
        wlog(
          "election",
          `follower · leader=pid${cur.pid} (locked ${Math.round((now - cur.ts) / 1000)}s ago)`,
        );
        STATE.electionLogged = true;
      }
      return false;
    }
  }
  // 取得 leader (无人 / 锁过期 / 旧 leader 已死)
  if (_writeLock({ pid: STATE.pid, ts: now })) {
    if (!STATE.isLeader || !STATE.electionLogged) {
      wlog(
        "election",
        `leader · pid=${STATE.pid}` +
          (cur ? ` (took over from pid${cur.pid})` : ""),
      );
      STATE.electionLogged = true;
    }
    STATE.isLeader = true;
    STATE.electionTs = now;
    return true;
  }
  return false;
}

// ── 二德 · 降频 (follower 慢一档 · idle 再慢一档) ──────────────────────
let _lastUserActivity = _now();
function _markActivity() {
  _lastUserActivity = _now();
}
function _isIdle() {
  return _now() - _lastUserActivity > CFG.IDLE_AFTER_MS;
}

function _adaptInterval(ms) {
  if (typeof ms !== "number" || ms < 1000) return ms; // < 1s 的不动
  let factor = 1;
  if (!STATE.isLeader) factor *= CFG.FOLLOWER_SLOWDOWN;
  if (_isIdle()) factor *= CFG.IDLE_SLOWDOWN;
  if (factor > 1) STATE.intervalThrottled++;
  return Math.min(Math.round(ms * factor), 5 * 60 * 1000); // 上限 5 分钟避免完全冻结
}

const _origSetInterval = G.setInterval;
G.setInterval = function patchedSetInterval(fn, ms, ...rest) {
  if (STATE.disabled) return _origSetInterval.call(G, fn, ms, ...rest);
  STATE.intervalCount++;
  const eff = _adaptInterval(ms);
  return _origSetInterval.call(G, fn, eff, ...rest);
};

// ── 三德 · 滚切 ──────────────────────────────────────────────────────────
function _maybeRotate(p) {
  if (typeof p !== "string") return;
  if (!/\.log$/i.test(p)) return;
  const last = STATE.rotChecked[p] || 0;
  const now = _now();
  if (now - last < CFG.LOG_CHECK_MIN_MS) return;
  STATE.rotChecked[p] = now;
  try {
    const st = fs.statSync(p);
    if (st.size > CFG.LOG_MAX_BYTES) {
      const old = p + ".old";
      try {
        fs.unlinkSync(old);
      } catch {}
      try {
        fs.renameSync(p, old);
        wlog(
          "rotate",
          `${path.basename(p)} (${(st.size / 1024 / 1024).toFixed(1)}MB) → .old`,
        );
      } catch {}
    }
  } catch {}
}

const _origAppendFileSync = fs.appendFileSync;
fs.appendFileSync = function patchedAppendFileSync(p, data, opts) {
  if (!STATE.disabled) {
    try {
      _maybeRotate(
        typeof p === "string" ? p : p && p.toString ? p.toString() : "",
      );
    } catch {}
  }
  return _origAppendFileSync.call(fs, p, data, opts);
};

const _origAppendFile = fs.appendFile;
fs.appendFile = function patchedAppendFile(p, data, opts, cb) {
  if (!STATE.disabled) {
    try {
      _maybeRotate(
        typeof p === "string" ? p : p && p.toString ? p.toString() : "",
      );
    } catch {}
  }
  return _origAppendFile.call(fs, p, data, opts, cb);
};

// ── 四德 · 熔断 ──────────────────────────────────────────────────────────
function _hostOf(opts) {
  if (typeof opts === "string") {
    try {
      return new URL(opts).hostname || "";
    } catch {
      return "";
    }
  }
  return (opts && (opts.hostname || opts.host)) || "";
}

function _cbBypass(host) {
  if (!host) return true;
  for (const h of CFG.CB_BYPASS)
    if (host === h || host.endsWith("." + h)) return true;
  return false;
}

function _cbCheck(host) {
  const r = STATE.cb[host];
  if (!r) return true;
  if (r.openedAt && _now() - r.openedAt < CFG.CB_OPEN_MS) {
    STATE.startBlocked++;
    return false;
  }
  if (r.openedAt) {
    // 半开探试 — 重置
    delete STATE.cb[host];
  }
  return true;
}

function _cbFail(host) {
  if (!host || _cbBypass(host)) return;
  const r =
    STATE.cb[host] ||
    (STATE.cb[host] = { fail: 0, since: _now(), openedAt: 0 });
  // 窗口外 → 重置计数
  if (_now() - r.since > CFG.CB_FAIL_WINDOW_MS) {
    r.fail = 0;
    r.since = _now();
  }
  r.fail++;
  if (r.fail >= CFG.CB_FAIL_THRESHOLD && !r.openedAt) {
    r.openedAt = _now();
    wlog(
      "circuit",
      `OPEN ${host} for ${CFG.CB_OPEN_MS / 60000}min (fail=${r.fail} in ${CFG.CB_FAIL_WINDOW_MS / 1000}s)`,
    );
  }
}

function _cbOk(host) {
  if (!host) return;
  if (STATE.cb[host]) STATE.cb[host].fail = 0;
}

function _wrapRequest(mod, name) {
  const orig = mod[name];
  if (!orig || typeof orig !== "function" || orig.__dao_wrapped) return;
  const wrapper = function (...args) {
    if (STATE.disabled) return orig.apply(this, args); // disable 后直走原路径
    const opts = args[0];
    const host = _hostOf(opts);
    if (!_cbBypass(host) && !_cbCheck(host)) {
      // 熔断中 — 返回一个会立即报错的"假 req"
      const EE = require("events").EventEmitter;
      const fakeReq = new EE();
      fakeReq.write = () => true;
      fakeReq.end = () => {
        process.nextTick(() =>
          fakeReq.emit("error", new Error("water_circuit_open:" + host)),
        );
      };
      fakeReq.destroy = () => fakeReq.emit("close");
      fakeReq.setTimeout = () => fakeReq;
      fakeReq.setHeader = () => {};
      fakeReq.getHeader = () => undefined;
      return fakeReq;
    }
    let req;
    try {
      req = orig.apply(this, args);
    } catch (e) {
      _cbFail(host);
      throw e;
    }
    if (req && typeof req.on === "function") {
      req.on("error", () => _cbFail(host));
      req.on("timeout", () => _cbFail(host));
      req.on("response", (res) => {
        const code = res && res.statusCode;
        if (code && code >= 500) _cbFail(host);
        else _cbOk(host);
      });
    }
    return req;
  };
  wrapper.__dao_wrapped = true;
  mod[name] = wrapper;
}

try {
  const https = require("https");
  const http = require("http");
  _wrapRequest(https, "request");
  _wrapRequest(https, "get");
  _wrapRequest(http, "request");
  _wrapRequest(http, "get");
} catch (e) {
  wlog("init", "wrapRequest failed: " + e.message);
}

// ── 周期性: 选举心跳 + 选举重检 ───────────────────────────────────────
// 用 _origSetInterval (绕过自身 monkey-patch, 心跳节奏不受 follower/idle 减速影响)
_heartbeatTimer = _origSetInterval.call(
  G,
  () => {
    if (STATE.disabled) return;
    try {
      _elect();
    } catch {}
  },
  CFG.ELECTION_HEART_MS,
);
if (_heartbeatTimer && typeof _heartbeatTimer.unref === "function") {
  try {
    _heartbeatTimer.unref();
  } catch {}
}

// 暴露给 vscode 端 (若有) 标记用户活动 — 用法:
//   const wv = require('./_water_virtues.js'); vscode.workspace.onDidChangeTextDocument(wv.markActivity);
function markActivity() {
  _markActivity();
}

// 探测 vscode 是否已加载, 若是则自动绑活动监听 (轻安装, 失败也无妨)
try {
  const vscode = require("vscode");
  if (vscode && vscode.workspace) {
    vscode.workspace.onDidChangeTextDocument(_markActivity);
    if (vscode.window) {
      vscode.window.onDidChangeWindowState((s) => {
        if (s.focused) _markActivity();
      });
      vscode.window.onDidChangeActiveTextEditor(_markActivity);
    }
  }
} catch {}

// ── 启动 ──────────────────────────────────────────────────────────────────
_elect();
STATE.activated = true;
wlog(
  "boot",
  `water_virtues active · pid=${STATE.pid} role=${STATE.isLeader ? "LEADER" : "FOLLOWER"} · ` +
    `cfg=election:${CFG.ELECTION_TTL_MS / 1000}s/heart:${CFG.ELECTION_HEART_MS / 1000}s · ` +
    `slowdown:F${CFG.FOLLOWER_SLOWDOWN}/I${CFG.IDLE_SLOWDOWN} · ` +
    `log:${CFG.LOG_MAX_BYTES / 1024 / 1024}MB · cb:${CFG.CB_FAIL_THRESHOLD}/${CFG.CB_OPEN_MS / 60000}min`,
);

// ── 状态查询 ──────────────────────────────────────────────────────────────
function snapshot() {
  return {
    activated: STATE.activated,
    pid: STATE.pid,
    role: STATE.isLeader ? "LEADER" : "FOLLOWER",
    upMs: _now() - STATE.startedAt,
    idle: _isIdle(),
    intervalCount: STATE.intervalCount,
    intervalThrottled: STATE.intervalThrottled,
    cbHosts: Object.keys(STATE.cb).length,
    cbBlocked: STATE.startBlocked,
    rotChecked: Object.keys(STATE.rotChecked).length,
    cfg: CFG,
  };
}

// ── 五接口 · 供 dao-agi 内化对话 ───────────────────────────────────────

/** 注入外部日志器 (dao-agi 之 log channel) */
function setLogger(fn) {
  if (typeof fn === "function") _extLogger = fn;
  else _extLogger = null;
}

/** 是否 leader, 供 follower 让出守护 */
function assertLeader() {
  return !STATE.disabled && !!STATE.isLeader;
}

/** 释放 leader lock (deactivate / 急切换实例时) */
function release() {
  try {
    if (STATE.isLeader) {
      const cur = _readLock();
      if (cur && cur.pid === STATE.pid) {
        try {
          fs.unlinkSync(LOCK_FILE);
        } catch {}
        wlog("election", `released leader lock · pid=${STATE.pid}`);
      }
    }
  } catch {}
}

/** 完全停用 monkey-patch · 恢复原 API · 不可逆于本进程内 */
function disable() {
  if (STATE.disabled) return;
  STATE.disabled = true;
  try {
    G.setInterval = _origSetInterval;
  } catch {}
  try {
    fs.appendFileSync = _origAppendFileSync;
  } catch {}
  try {
    fs.appendFile = _origAppendFile;
  } catch {}
  // https/http.request 还原: wrapper.__dao_wrapped 之前已包了原函数, 但我们没存原引用
  // 这里改为 "标记 disabled", wrapper 会通过 STATE.disabled 直接走原路径 (见下面 wrapRequest 逻辑)
  wlog("boot", `water_virtues DISABLED · pid=${STATE.pid}`);
}

/** 标准 dispose · 用于 ctx.subscriptions.push */
function dispose() {
  try {
    if (_heartbeatTimer) {
      clearInterval(_heartbeatTimer);
      _heartbeatTimer = null;
    }
  } catch {}
  release();
  // 注: monkey-patch 不还原 (其他模块可能仍在用), 仅释放 lock + 停心跳
}

const _api = {
  state: snapshot,
  snapshot,
  markActivity,
  assertLeader,
  setLogger,
  release,
  disable,
  dispose,
  STATE,
  CFG,
};
G[KEY] = { activated: true, api: _api };
module.exports = _api;
