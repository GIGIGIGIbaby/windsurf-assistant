"use strict";
/**
 * byok_handler.js · dao-proxy-min vNEXT BYOK 拦截聚合层
 * ═══════════════════════════════════════════════════════════════
 *
 * 道义:
 *   "道并行而不相悖, 万物并育而不相害" (中庸·三十)
 *   "道法自然 · 无为而无不为" (二十五 / 三十七章)
 *
 * 职能:
 *   在 dao-proxy-min v11+ 反代核 (源.js _mainHandler) 中, 拦 3 个 RPC:
 *     1. GetCascadeModelConfigs  → 上游 JSON · 注入 26 BYOK 条目 · 返 LSP
 *     2. GetUserStatus           → 上游 JSON · 注入 modelUids + cascadeModelConfigData · 返
 *     3. GetChatMessage          → 解 modelUid · BYOK 后缀 → 070 桥 :11435 (proxyChatRaw)
 *                                  非 BYOK → 返 false 让源.js 走原 modifySPProto + transparent
 *
 * 设计原则 (反 010 重装备 · 道法自然):
 *   · 失败安全: init 异常不抛, 三 handle* 失败返 false, 源.js 走原路 (利而不害)
 *   · 不抢道: 不动源.js 既有 modifySPProto / spawn hook / SSE / EssenceProvider
 *   · 浑然: 用 application/connect+json trick 让 server.codeium.com 回 JSON, JSON 层操作
 *   · 自包含: 依赖 inject.js + cascade_wire.js + inject_010_bridge.js 同目录 (vendor/byok)
 *
 * 接口:
 *   init({ log, configPath? })  - 启动时调一次 · 返 { ready, count, gateway, config }
 *   isReady()
 *   status()                     - 给 /origin/byok_status 用
 *   handleGetCascadeModelConfigs(req, res, reqBody)  - async · 返 true 已处理 / false 不归我管
 *   handleGetUserStatus(req, res, reqBody)
 *   handleGetChatMessage(req, res, rawBody, isJSON)   - rawBody 为 LSP 原始请求帧
 */

const path = require("path");
const fs = require("fs");
const https = require("https");
const dns = require("dns");

let _bridge = null; // inject_010_bridge.js (070 桥代理)
let _inject = null; // inject.js (BYOK 模型构造)
let _wire = null; // cascade_wire.js (Connect-RPC wire 层)
let _injectModels = []; // BYOK 条目数组 (in-place attach)
let _injectUidsSet = new Set();
let _ready = false;
let _log = () => {};
let _gateway = "";
let _configPath = "";

// ── 上游 host (官方 Cascade RPC 真上游) ──
const UPSTREAM_MGMT = "server.self-serve.windsurf.com";
const UPSTREAM_INFER = "server.codeium.com";
// GetCascadeModelConfigs / GetUserStatus 走 server.codeium.com (010 实证 · 旧 universal_relay 用此)

// ── DNS 缓存 ──
const _dnsCache = {};
function _resolveHost(hostname) {
  if (_dnsCache[hostname]) return Promise.resolve(_dnsCache[hostname]);
  return new Promise((resolve, reject) => {
    const r = new dns.Resolver();
    try {
      r.setServers(["8.8.8.8", "1.1.1.1"]);
    } catch {}
    r.resolve4(hostname, (err, addrs) => {
      if (!err && addrs && addrs.length) {
        _dnsCache[hostname] = addrs[0];
        return resolve(addrs[0]);
      }
      dns.resolve4(hostname, (e2, a2) => {
        if (e2 || !a2 || !a2.length)
          return reject(new Error(`DNS: ${hostname}`));
        _dnsCache[hostname] = a2[0];
        resolve(a2[0]);
      });
    });
  });
}

// ── Connect-RPC 帧 (5 字节 header + payload) ──
function _buildFrame(flags, payload) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const head = Buffer.alloc(5);
  head[0] = flags & 0xff;
  head.writeUInt32BE(buf.length, 1);
  return Buffer.concat([head, buf]);
}

function _parseFrames(buf) {
  const frames = [];
  let pos = 0;
  while (pos + 5 <= buf.length) {
    const flags = buf[pos];
    const len =
      (buf[pos + 1] << 24) |
      (buf[pos + 2] << 16) |
      (buf[pos + 3] << 8) |
      buf[pos + 4];
    if (len < 0 || pos + 5 + len > buf.length) break;
    frames.push({ flags, payload: buf.slice(pos + 5, pos + 5 + len) });
    pos += 5 + len;
  }
  return frames;
}

// ════════════════════════════════════════════════════════════
// init · 启动时调 · 失败安全
// ════════════════════════════════════════════════════════════
function init(opts = {}) {
  // ★ vNEXT v1.0.3 · 防重复 init
  //   CLI (_runCli spawn) + lib (start) 双跑模式均会调 init · 故须自防
  //   重复跑只是相同 attach · 结果一致 · 但避日志噪声
  if (_ready) {
    return {
      ready: true,
      count: _injectModels.length,
      gateway: _gateway,
      config: _configPath,
    };
  }
  _log = typeof opts.log === "function" ? opts.log : () => {};

  // ★ 优先用同目录 配置.json (vsix 内自包含 · 不覆盖用户已设)
  //   inject_010_bridge.js 默认 ROOT = __dirname/.. = vendor/, 找不到我们 vendor/byok/配置.json
  //   故用环境变量 DAO_BYOK_CONFIG 显式指定 · 用户 ~/.codeium/dao-byok/配置.json 仍优先
  if (!process.env.DAO_BYOK_CONFIG) {
    const HOME = process.env.USERPROFILE || process.env.HOME || "";
    const userCfg = HOME
      ? path.join(HOME, ".codeium", "dao-byok", "配置.json")
      : "";
    if (userCfg && fs.existsSync(userCfg)) {
      // 用户已设 · 不动 (让 inject_010_bridge.js 自查)
    } else {
      const cfgInVsix = path.join(__dirname, "配置.json");
      if (fs.existsSync(cfgInVsix)) {
        process.env.DAO_BYOK_CONFIG = cfgInVsix;
        _log(`[byok] use vsix-bundled config: ${cfgInVsix}`);
      }
    }
  }

  try {
    _inject = require("./inject.js");
  } catch (e) {
    _log(`[byok] inject.js load fail · ${e.message} · BYOK disabled`);
    return { ready: false, count: 0, error: e.message };
  }
  try {
    _wire = require("./cascade_wire.js");
  } catch (e) {
    _log(`[byok] cascade_wire.js load fail · ${e.message} · 退化文字回路`);
    _wire = null;
  }
  try {
    _bridge = require("./inject_010_bridge.js");
  } catch (e) {
    _log(
      `[byok] inject_010_bridge.js load fail · ${e.message} · BYOK disabled`,
    );
    return { ready: false, count: 0, error: e.message };
  }

  // attach: 让桥把 BYOK 条目装入 _injectModels in-place
  _injectModels = [];
  _injectUidsSet = new Set();
  let attachResult = null;
  try {
    attachResult = _bridge.attach({
      INJECT_MODELS: _injectModels,
      INJECT_UIDS_SET: _injectUidsSet,
      log: _log,
    });
  } catch (e) {
    _log(`[byok] bridge.attach fail · ${e.message} · BYOK disabled`);
    return { ready: false, count: 0, error: e.message };
  }
  if (!attachResult || !attachResult.loaded) {
    _log(`[byok] bridge not loaded (config missing?) · BYOK disabled`);
    return {
      ready: false,
      count: 0,
      error:
        attachResult && attachResult.error ? attachResult.error : "no config",
    };
  }
  _ready = true;
  _gateway = attachResult.gateway || "";
  _configPath = attachResult.config || "";
  _log(
    `[byok] ✓ ready · ${_injectModels.length} models · gateway=${_gateway} · config=${_configPath} · wire=${_wire ? "on" : "off"}`,
  );
  return {
    ready: true,
    count: _injectModels.length,
    gateway: _gateway,
    config: _configPath,
  };
}

function isReady() {
  return _ready;
}

function status() {
  let official = { enabled: false, count: 0, uids: [] };
  try {
    if (_bridge && typeof _bridge.statusOfficial === "function") {
      official = _bridge.statusOfficial();
    }
  } catch {}
  return {
    ready: _ready,
    count: _injectModels.length,
    gateway: _gateway,
    config: _configPath,
    uids: _injectModels
      .filter((m) => m && typeof m.modelUid === "string")
      .map((m) => m.modelUid),
    wire: !!_wire,
    official,
  };
}

// ════════════════════════════════════════════════════════════
// 上游 fetch (强制 application/connect+json) · 用于 GetCascadeModelConfigs / GetUserStatus
// ════════════════════════════════════════════════════════════
async function _upstreamJSON(req, urlPath) {
  const ip = await _resolveHost(UPSTREAM_INFER);
  const jsonReqFrame = _buildFrame(0, Buffer.from("{}", "utf8"));
  // 复用 LSP 请求 headers (含 auth / metadata) · 但强制 content-type/accept 为 connect+json
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (k.startsWith(":")) continue;
    if (
      k === "content-type" ||
      k === "accept" ||
      k === "content-length" ||
      k === "host"
    )
      continue;
    headers[k] = v;
  }
  headers["host"] = UPSTREAM_INFER;
  headers["content-type"] = "application/connect+json";
  headers["accept"] = "application/connect+json";
  headers["content-length"] = jsonReqFrame.length;

  const upChunks = [];
  let upStatus = 200;
  let upHeaders = {};
  await new Promise((resolve, reject) => {
    const ur = https.request(
      {
        host: ip,
        port: 443,
        path: urlPath,
        method: "POST",
        servername: UPSTREAM_INFER,
        rejectUnauthorized: false,
        headers,
      },
      (upRes) => {
        upStatus = upRes.statusCode;
        upHeaders = { ...upRes.headers };
        delete upHeaders["content-length"];
        delete upHeaders["transfer-encoding"];
        upRes.on("data", (c) => upChunks.push(c));
        upRes.on("end", resolve);
        upRes.on("error", reject);
      },
    );
    ur.on("error", reject);
    ur.write(jsonReqFrame);
    ur.end();
  });
  return {
    status: upStatus,
    headers: upHeaders,
    body: Buffer.concat(upChunks),
  };
}

// ════════════════════════════════════════════════════════════
// GetCascadeModelConfigs · JSON 注入
// ════════════════════════════════════════════════════════════
function _injectCascadeModelConfigs(bodyStr) {
  try {
    const obj = JSON.parse(bodyStr);
    let cfgArr = null,
      cfgKey = null,
      parent = null;
    const KEYS = [
      "clientModelConfigs",
      "client_model_configs",
      "modelConfigs",
      "model_configs",
    ];
    // 顶层
    for (const k of KEYS) {
      if (Array.isArray(obj[k])) {
        cfgArr = obj[k];
        cfgKey = k;
        parent = obj;
        break;
      }
    }
    // 一层包裹
    if (!cfgArr) {
      for (const wk of Object.keys(obj)) {
        const w = obj[wk];
        if (w && typeof w === "object" && !Array.isArray(w)) {
          for (const k of KEYS) {
            if (Array.isArray(w[k])) {
              cfgArr = w[k];
              cfgKey = k;
              parent = w;
              break;
            }
          }
          if (cfgArr) break;
        }
      }
    }
    // BYOK entries (剥 __ 内部辅助字段)
    const byokEntries = _injectModels.map(_stripInternal);
    if (!cfgArr) {
      // 上游响应中无 modelConfigs[] · 全以我们为准
      obj.clientModelConfigs = byokEntries;
      return JSON.stringify(obj);
    }
    const existing = new Set(cfgArr.map((m) => m.modelUid || m.model_uid));
    const toAdd = byokEntries.filter(
      (m) => m && m.modelUid && !existing.has(m.modelUid),
    );
    if (toAdd.length === 0) return bodyStr;
    parent[cfgKey] = [...toAdd, ...cfgArr];
    // sort 字段 (clientModelSorts) 也加
    const SORT_KEYS = ["clientModelSorts", "client_model_sorts"];
    for (const sk of SORT_KEYS) {
      if (Array.isArray(parent[sk])) {
        const existS = new Set(
          parent[sk].map((s) => s.modelUid || s.model_uid),
        );
        parent[sk] = [
          ...toAdd
            .filter((m) => !existS.has(m.modelUid))
            .map((m) => ({ modelUid: m.modelUid })),
          ...parent[sk],
        ];
        break;
      }
    }
    return JSON.stringify(obj);
  } catch (e) {
    _log(`[byok] injectCascadeModelConfigs error: ${e.message}`);
    return bodyStr;
  }
}

function _stripInternal(m) {
  if (!m || typeof m !== "object") return m;
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    if (k.startsWith("__")) continue; // 剥 __dao_byok / __target 等内部辅助
    out[k] = v;
  }
  return out;
}

async function handleGetCascadeModelConfigs(req, res, reqBody) {
  if (!_ready) return false;
  try {
    const urlPath = req.url || "";
    const up = await _upstreamJSON(req, urlPath);
    if (up.status >= 400) {
      _log(
        `[byok] GetCascadeModelConfigs upstream HTTP ${up.status} · synthetic fallback`,
      );
      return _writeSyntheticModelConfigs(res);
    }
    let upBuf = up.body;
    const respFrames = _parseFrames(upBuf);
    if (respFrames.length > 0 && respFrames[0].flags === 0) {
      const injected = _injectCascadeModelConfigs(
        respFrames[0].payload.toString("utf8"),
      );
      upBuf = Buffer.concat([
        _buildFrame(0, Buffer.from(injected, "utf8")),
        ...respFrames.slice(1).map((f) => _buildFrame(f.flags, f.payload)),
      ]);
    } else {
      upBuf = Buffer.from(
        _injectCascadeModelConfigs(upBuf.toString("utf8")),
        "utf8",
      );
    }
    const hdrs = { ...up.headers };
    hdrs["content-type"] = "application/connect+json";
    hdrs["content-length"] = upBuf.length;
    res.writeHead(up.status, hdrs);
    res.end(upBuf);
    _log(
      `[byok] GetCascadeModelConfigs: injected ${_injectModels.length} BYOK models`,
    );
    return true;
  } catch (e) {
    _log(`[byok] GetCascadeModelConfigs upstream error: ${e.message}`);
    return _writeSyntheticModelConfigs(res);
  }
}

function _writeSyntheticModelConfigs(res) {
  try {
    const obj = {
      clientModelConfigs: _injectModels.map(_stripInternal),
      clientModelSorts: _injectModels.map((m) => ({ modelUid: m.modelUid })),
    };
    const buf = Buffer.concat([
      _buildFrame(0, Buffer.from(JSON.stringify(obj), "utf8")),
      _buildFrame(2, Buffer.from("{}", "utf8")),
    ]);
    res.writeHead(200, {
      "content-type": "application/connect+json",
      "content-length": buf.length,
    });
    res.end(buf);
    return true;
  } catch (e) {
    _log(`[byok] synthetic ModelConfigs fail: ${e.message}`);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end(
        JSON.stringify({ error: "byok synthetic fail", message: e.message }),
      );
    }
    return true;
  }
}

// ════════════════════════════════════════════════════════════
// GetUserStatus · JSON 注入
// ════════════════════════════════════════════════════════════
function _injectGetUserStatusJSON(bodyStr) {
  try {
    const obj = JSON.parse(bodyStr);
    const us = obj.userStatus || obj.user_status;
    if (!us) return bodyStr;
    const cmdKey =
      us.cascadeModelConfigData !== undefined
        ? "cascadeModelConfigData"
        : "cascade_model_config_data";
    let cmd = us[cmdKey];
    if (!cmd) {
      cmd = {};
      us[cmdKey] = cmd;
    }
    const cfgArrKey =
      cmd.clientModelConfigs !== undefined
        ? "clientModelConfigs"
        : "client_model_configs";
    const cfgArr = cmd[cfgArrKey] || [];
    const existingCfg = new Set(cfgArr.map((m) => m.modelUid || m.model_uid));
    const byokEntries = _injectModels.map(_stripInternal);
    const toAdd = byokEntries.filter(
      (m) => m && m.modelUid && !existingCfg.has(m.modelUid),
    );
    if (toAdd.length > 0) {
      cmd[cfgArrKey] = [...toAdd, ...cfgArr];
      const sortsKey =
        cmd.clientModelSorts !== undefined
          ? "clientModelSorts"
          : "client_model_sorts";
      const sortsArr = cmd[sortsKey] || [];
      const existS = new Set(sortsArr.map((s) => s.modelUid || s.model_uid));
      cmd[sortsKey] = [
        ...toAdd
          .filter((m) => !existS.has(m.modelUid))
          .map((m) => ({ modelUid: m.modelUid })),
        ...sortsArr,
      ];
    }
    // modelUids (顶层 uid 数组)
    const muKey = us.modelUids !== undefined ? "modelUids" : "model_uids";
    const muArr = us[muKey] || [];
    const muSet = new Set(muArr);
    for (const m of byokEntries) {
      if (m.modelUid && !muSet.has(m.modelUid)) muArr.push(m.modelUid);
    }
    us[muKey] = muArr;
    return JSON.stringify(obj);
  } catch (e) {
    _log(`[byok] injectGetUserStatusJSON error: ${e.message}`);
    return bodyStr;
  }
}

async function handleGetUserStatus(req, res, reqBody) {
  if (!_ready) return false;
  try {
    const urlPath = req.url || "";
    const up = await _upstreamJSON(req, urlPath);
    if (up.status >= 400) {
      _log(
        `[byok] GetUserStatus upstream HTTP ${up.status} · pass-through fail`,
      );
      return false; // 让源.js 走原透传
    }
    let upBuf = up.body;
    const respFrames = _parseFrames(upBuf);
    if (respFrames.length > 0 && respFrames[0].flags === 0) {
      const injected = _injectGetUserStatusJSON(
        respFrames[0].payload.toString("utf8"),
      );
      upBuf = Buffer.concat([
        _buildFrame(0, Buffer.from(injected, "utf8")),
        ...respFrames.slice(1).map((f) => _buildFrame(f.flags, f.payload)),
      ]);
    } else {
      upBuf = Buffer.from(
        _injectGetUserStatusJSON(upBuf.toString("utf8")),
        "utf8",
      );
    }
    const hdrs = { ...up.headers };
    hdrs["content-type"] = "application/connect+json";
    hdrs["content-length"] = upBuf.length;
    res.writeHead(up.status, hdrs);
    res.end(upBuf);
    _log(
      `[byok] GetUserStatus: injected ${_injectModels.length} BYOK models into modelUids + cascadeModelConfigData`,
    );
    return true;
  } catch (e) {
    _log(`[byok] GetUserStatus upstream error: ${e.message}`);
    return false;
  }
}

// ════════════════════════════════════════════════════════════
// GetChatMessage · 解 modelUid · BYOK 后缀 → 070 桥
// ════════════════════════════════════════════════════════════
function _extractModelUidFromBody(rawBody) {
  if (!_wire) return null;
  try {
    // 试 binary proto
    const parsed = _wire.parseGetChatMessageRequest(rawBody, false);
    if (parsed && parsed.modelUid) return parsed.modelUid;
  } catch {}
  // 兜: utf8 中扫
  try {
    const txt = rawBody.toString("utf8");
    // 1. dao 自家新 UID: MODEL_*_BYOK_DAO
    const m = /MODEL_[A-Z0-9_]+_BYOK_DAO/.exec(txt);
    if (m) return m[0];
    // 2. dao 自家旧 UID: dao-byok-*
    const m2 = /dao-byok-[A-Za-z0-9-]+/.exec(txt);
    if (m2) return m2[0];
    // 3. dao-proxy-max v1.0.0 · 官方 4 BYOK UID: MODEL_*_BYOK (不含 _DAO 后缀)
    //    例: MODEL_CLAUDE_4_OPUS_BYOK / MODEL_CLAUDE_4_SONNET_THINKING_BYOK
    //    关键: 用 negative lookahead (?!_DAO) 排除 _BYOK_DAO 之相
    const m3 = /MODEL_[A-Z0-9_]+_BYOK(?!_DAO)/.exec(txt);
    if (m3) return m3[0];
  } catch {}
  return null;
}

async function handleGetChatMessage(req, res, rawBody, isJSON) {
  if (!_ready || !_bridge) return false;
  try {
    const modelUid = _extractModelUidFromBody(rawBody);
    if (!modelUid) return false; // 无法解 · 让源.js 走原 modifySPProto
    // ── 1. 先试 dao 自家注入 (38 模 · MODEL_*_BYOK_DAO / dao-byok-*) ──
    let target = _bridge.routeFor(modelUid);
    let isOfficial = false;
    // ── 2. 否则试 dao-proxy-max 官方 4 BYOK 透明劫 ──
    //   (UID 以 _BYOK 结尾且非 _BYOK_DAO · 且配置 officialByokOverrides.enabled=true · 且 map[uid] 有真目标)
    if (!target && typeof _bridge.routeForOfficial === "function") {
      target = _bridge.routeForOfficial(modelUid);
      if (target) isOfficial = true;
    }
    if (!target) return false; // 非 BYOK 之任 · 让源.js 走原路
    if (typeof _bridge.proxyChatRaw !== "function") {
      _log(`[byok] bridge.proxyChatRaw 不存在 · 退化让源.js 走原路`);
      return false;
    }
    if (isOfficial) {
      _log(
        `[byok] ★ 官方 BYOK 劫 · uid=${modelUid} → 070 桥 ${target.gatewayUrl} · ${target.qualifiedModel}`,
      );
    } else {
      _log(
        `[byok] GetChatMessage BYOK uid=${modelUid} → 070 桥 ${target.gatewayUrl}`,
      );
    }
    _bridge.proxyChatRaw(req, res, rawBody, !!isJSON, target);
    return true;
  } catch (e) {
    _log(`[byok] handleGetChatMessage err: ${e.message} · 退化让源.js 走原路`);
    return false;
  }
}

// ════════════════════════════════════════════════════════════
// refresh · 配置热更 (用户改 配置.json 不需重启 LSP)
// ════════════════════════════════════════════════════════════
function refresh() {
  if (!_bridge || typeof _bridge.refresh !== "function") {
    return { ok: false, error: "bridge not loaded" };
  }
  try {
    return _bridge.refresh();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  init,
  isReady,
  status,
  refresh,
  handleGetCascadeModelConfigs,
  handleGetUserStatus,
  handleGetChatMessage,
  // 露给 source.js 调试用
  _internal: {
    injectCascadeModelConfigs: _injectCascadeModelConfigs,
    injectGetUserStatusJSON: _injectGetUserStatusJSON,
    extractModelUidFromBody: _extractModelUidFromBody,
    buildFrame: _buildFrame,
    parseFrames: _parseFrames,
  },
};
