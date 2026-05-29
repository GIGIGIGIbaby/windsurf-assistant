"use strict";
/**
 * inject_010_bridge.js · 070 → 010 单向桥 · 道法自然 · 利而不害
 * ═══════════════════════════════════════════════════════════════
 * 010-反代_Proxy/core/universal_relay.js 启动时仅一行 require 即接入:
 *
 *     const dao070 = require('../../070-插件_Plugins/外接api/inject/inject_010_bridge.js');
 *     const cfg = dao070.attach({
 *       INJECT_MODELS,                  // 010 既有数组 · in-place 追加
 *       INJECT_UIDS_SET,                // 010 既有 Set · in-place 追加 UID
 *       log: console.log,
 *     });
 *
 *     // 后续在 handleWindsurfChat 里 (旧式 · 仅文字回路):
 *     const target = dao070.routeFor(modelUid);
 *     if (target) return dao070.proxyChat(req, res, modelUid, messages, target);
 *
 *     // 新式 · 完整工具链 (推荐 · 需 010 把 rawBody+isJSON 透下来):
 *     if (target) return dao070.proxyChatRaw(req, res, rawBody, isJSON, target);
 *
 * 设计原则:
 *   1. 失败安全 · attach 异常不抛, 返回空对象, 010 不受影响 (利而不害)
 *   2. 零侵入   · 不改 010 既有数组语义 · 仅 push 新条目 · UID 前缀不冲突
 *   3. 表里一  · UID v2.0: MODEL_*_BYOK_DAO (仿官方 BYOK) · v1.x: dao-byok-* (兼容)
 *               路由永远到 070 网关 :11435
 *   4. 唯变所适 · 网关掉线 / 070 配置缺失 / inject.js 缺失 → 全部静默降级
 *   5. 工具浑然 · 070 自家 cascade_wire.js 主导帧编 (字段 3/5/6/9 · 反 010 旧
 *                 buildTextFrame 的 field 1 误); 思考/工具/停止理由全透出
 */

// ── 识别本桥拥有权的 UID (新 v2.0 · 旧 v1.x 两种) ─────────────────
function _isBridgeUid(uid) {
  if (typeof uid !== "string") return false;
  // v2.0 新式: 仿官方 BYOK 风格 (MODEL_*_BYOK_DAO)
  if (uid.endsWith("_BYOK_DAO")) return true;
  // v1.x 旧式 (向后兼容): dao-byok-*
  if (uid.startsWith("dao-byok-")) return true;
  return false;
}

const path = require("path");
const http = require("http");

let _inject = null;
let _wire = null;
let _cfg = null;
let _cfgPath = null;
let _ready = false;
let _log = () => {};
// in-place 引用 · 保留 attach 时灌进来的数组/集合, 给 refresh() 用
let _attachedModels = null;
let _attachedSet = null;
let _gatewayUrl = "";

const ROOT = path.resolve(__dirname, "..");
const INJECT_PATH = path.join(__dirname, "inject.js");
const WIRE_PATH = path.join(__dirname, "cascade_wire.js");
const CONFIG_USER = (() => {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return path.join(home, ".codeium", "dao-byok", "配置.json");
})();
const CONFIG_DEV = path.join(ROOT, "配置.json");
const CONFIG_EXAMPLE = path.join(ROOT, "配置.example.json");

function _resolveConfigPath() {
  const fs = require("fs");
  if (
    process.env.DAO_BYOK_CONFIG &&
    fs.existsSync(process.env.DAO_BYOK_CONFIG)
  ) {
    return process.env.DAO_BYOK_CONFIG;
  }
  if (fs.existsSync(CONFIG_USER)) return CONFIG_USER;
  if (fs.existsSync(CONFIG_DEV)) return CONFIG_DEV;
  if (fs.existsSync(CONFIG_EXAMPLE)) return CONFIG_EXAMPLE;
  return null;
}

/**
 * 桥接入口 · 失败安全
 * @param {Object} opts
 * @param {Array}  opts.INJECT_MODELS    010 既有数组 (in-place push)
 * @param {Set}    opts.INJECT_UIDS_SET  010 既有 Set     (in-place add)
 * @param {Function} [opts.log]          日志函数 · 默认 noop
 * @returns {{loaded: boolean, count: number, uids: string[], gateway: string}}
 */
function attach(opts = {}) {
  _log = typeof opts.log === "function" ? opts.log : () => {};
  const arr = opts.INJECT_MODELS;
  const set = opts.INJECT_UIDS_SET;

  try {
    _inject = require(INJECT_PATH);
  } catch (e) {
    _log(`[070-bridge] inject.js load fail · ${e.message} · skip`);
    return { loaded: false, count: 0, uids: [], gateway: "" };
  }

  // wire 是工具/思考/停止理由帧的本源, load 失败则桥退化为旧文字回路
  try {
    _wire = require(WIRE_PATH);
  } catch (e) {
    _log(
      `[070-bridge] cascade_wire.js load fail · ${e.message} · 退化为文字回路`,
    );
    _wire = null;
  }

  const cfgPath = _resolveConfigPath();
  if (!cfgPath) {
    _log("[070-bridge] no 配置.json found · skip");
    return { loaded: false, count: 0, uids: [], gateway: "" };
  }

  try {
    _cfg = _inject.load(cfgPath);
  } catch (e) {
    _log(`[070-bridge] config load fail · ${e.message} · skip`);
    return { loaded: false, count: 0, uids: [], gateway: "" };
  }

  if (!_cfg) {
    _log(`[070-bridge] config empty at ${cfgPath} · skip`);
    return { loaded: false, count: 0, uids: [], gateway: "" };
  }

  const cascadeOn =
    _cfg && _cfg.cascadeInjection && _cfg.cascadeInjection.enabled;
  if (!cascadeOn) {
    _log(
      `[070-bridge] cascadeInjection.enabled=false · 070 disabled · ${cfgPath}`,
    );
    return { loaded: true, count: 0, uids: [], gateway: "", config: cfgPath };
  }

  const entries = _inject.getCascadeUiEntries();
  if (!Array.isArray(entries) || entries.length === 0) {
    _log("[070-bridge] no cascade entries · skip");
    return { loaded: true, count: 0, uids: [], gateway: "", config: cfgPath };
  }

  // in-place 追加 · 不取代 010 既有 (利而不害)
  let added = 0;
  if (Array.isArray(arr)) {
    for (const e of entries) {
      // 已存在 (UID 撞) 则跳过 · 010 既有优先
      const dup = arr.some((x) => x.modelUid === e.modelUid);
      if (!dup) {
        arr.push(e);
        added++;
        if (set && typeof set.add === "function") set.add(e.modelUid);
      }
    }
  }

  const host = (_cfg.gateway && _cfg.gateway.host) || "127.0.0.1";
  const port = (_cfg.gateway && _cfg.gateway.port) || 11435;
  const gateway = `http://${host}:${port}`;

  // 保留引用 · 让 refresh() 后续可同步同样的 in-place 数组/集合
  _attachedModels = arr || null;
  _attachedSet = set || null;
  _cfgPath = cfgPath;
  _gatewayUrl = gateway;
  _ready = true;
  _log(
    `[070-bridge] ✓ attached · ${added} models · gateway=${gateway} · cfg=${cfgPath} · wire=${_wire ? "on" : "off"}`,
  );
  return {
    loaded: true,
    count: added,
    uids: entries.map((e) => e.modelUid),
    gateway,
    config: cfgPath,
    wire: !!_wire,
  };
}

/**
 * 配置热更 · 不需重启 010 即可让新 entries 出现在 INJECT_MODELS / INJECT_UIDS_SET.
 *
 * 行为:
 *   · 重读 070 配置 (相同优先级: $DAO_BYOK_CONFIG → 用户 → dev → example)
 *   · 计算 add (新增) / remove (已删除的 dao-byok-* uid)
 *   · in-place 同步到 attach 时灌入的 INJECT_MODELS 数组与 INJECT_UIDS_SET
 *   · 不动 010 既有的非 dao-byok-* 条目 (利而不害)
 *
 * @returns {{ok: boolean, added: number, removed: number, count: number, error?: string}}
 */
function refresh() {
  if (!_inject || !_attachedModels) {
    return { ok: false, added: 0, removed: 0, count: 0, error: "not attached" };
  }
  try {
    const cfgPath = _resolveConfigPath();
    if (!cfgPath)
      return { ok: false, added: 0, removed: 0, count: 0, error: "no config" };
    _cfg = _inject.load(cfgPath);
    _cfgPath = cfgPath;
  } catch (e) {
    return {
      ok: false,
      added: 0,
      removed: 0,
      count: 0,
      error: `reload: ${e.message}`,
    };
  }
  if (!_cfg || !_cfg.cascadeInjection || !_cfg.cascadeInjection.enabled) {
    // 关掉 cascadeInjection: 撤回桥已加的 dao-byok-*
    return _purgeBridgeEntries();
  }
  const entries = _inject.getCascadeUiEntries();
  if (!Array.isArray(entries)) {
    return { ok: false, added: 0, removed: 0, count: 0, error: "no entries" };
  }
  const newUids = new Set(entries.map((e) => e.modelUid));
  // 1. remove: 本桥之条目 (新 MODEL_*_BYOK_DAO 或旧 dao-byok-*) 在数组里但已不在新 entries
  let removed = 0;
  for (let i = _attachedModels.length - 1; i >= 0; i--) {
    const m = _attachedModels[i];
    const uid = m && m.modelUid;
    if (uid && _isBridgeUid(uid) && !newUids.has(uid)) {
      _attachedModels.splice(i, 1);
      if (_attachedSet && typeof _attachedSet.delete === "function")
        _attachedSet.delete(uid);
      removed++;
    }
  }
  // 2. add: 新 entries 中数组里没有的 (UID 撞 010 既有则跳过)
  let added = 0;
  for (const e of entries) {
    if (_attachedModels.some((x) => x.modelUid === e.modelUid)) continue;
    _attachedModels.push(e);
    if (_attachedSet && typeof _attachedSet.add === "function")
      _attachedSet.add(e.modelUid);
    added++;
  }
  // 3. 更新已存在条目的扩展字段 (字段值变了, UID 没变)
  for (const e of entries) {
    const idx = _attachedModels.findIndex((x) => x.modelUid === e.modelUid);
    if (idx >= 0 && _attachedModels[idx] !== e) {
      // 仅更新已知扩展字段, 不动 modelUid 等核心
      const cur = _attachedModels[idx];
      cur.label = e.label;
      cur.supportsImages = e.supportsImages;
      cur.supportsToolCalls = e.supportsToolCalls;
      cur.supportsThinking = e.supportsThinking;
      cur.maxTokens = e.maxTokens;
      cur.maxOutputTokens = e.maxOutputTokens;
    }
  }
  _log(
    `[070-bridge] refresh · +${added} -${removed} · total dao-byok=${entries.length}`,
  );
  return { ok: true, added, removed, count: entries.length };
}

// 内部: cascadeInjection.enabled=false 或配置缺时撤桥已加条目 (新旧两种 UID 都扫)
function _purgeBridgeEntries() {
  if (!_attachedModels) return { ok: true, added: 0, removed: 0, count: 0 };
  let removed = 0;
  for (let i = _attachedModels.length - 1; i >= 0; i--) {
    const uid = _attachedModels[i] && _attachedModels[i].modelUid;
    if (uid && _isBridgeUid(uid)) {
      _attachedModels.splice(i, 1);
      if (_attachedSet && typeof _attachedSet.delete === "function")
        _attachedSet.delete(uid);
      removed++;
    }
  }
  _log(`[070-bridge] purge · -${removed} (cascadeInjection disabled)`);
  return { ok: true, added: 0, removed, count: 0 };
}

/** 桥状态快照 · 给 010 /health 用 */
function status() {
  return {
    loaded: !!_inject,
    ready: _ready,
    wire: !!_wire,
    config: _cfgPath || "",
    gateway: _gatewayUrl || "",
    count: _inject && _inject.size ? _inject.size() : 0,
    uids:
      _inject && _inject.size && _attachedModels
        ? _attachedModels
            .filter((m) => m.modelUid && _isBridgeUid(m.modelUid))
            .map((m) => m.modelUid)
        : [],
  };
}

/** 给定 modelUid · 若属 070 注入则返路目标 · 否则 null */
function routeFor(uid) {
  // 1. 先试 inject 自家 BYOK_DAO uid (需 _ready = cascadeInjection.enabled)
  if (_ready && _inject) {
    const target = _inject.getRoutingTargetForUid(uid);
    if (target) return target;
  }
  // 2. 试 daoRoutes (只需 _cfg · 不依赖 cascadeInjection · 万法归宗)
  return _routeForDaoRoutes(uid);
}

/** daoRoutes 查找 · 配置.json 中 daoRoutes[uid] → gateway 路由目标 */
function _routeForDaoRoutes(uid) {
  if (!_cfg || !_cfg.daoRoutes) return null;
  // daoRoutes 结构: { enabled, routes: { uid: {provider,model,...} } }
  const routes = _cfg.daoRoutes.routes || _cfg.daoRoutes;
  if (!routes || typeof routes !== "object") return null;
  const route = routes[uid];
  if (!route || !route.provider || !route.model) return null;
  const h = (_cfg.gateway && _cfg.gateway.host) || "127.0.0.1";
  const p = (_cfg.gateway && _cfg.gateway.port) || 11435;
  _log(
    "[070-bridge] daoRoute hit: " +
      uid +
      " -> " +
      route.provider +
      "/" +
      route.model,
  );
  return {
    gatewayUrl: "http://" + h + ":" + p,
    chatPath: "/v1/chat/completions",
    messagesPath: "/v1/messages",
    provider: route.provider,
    model: route.model,
    qualifiedModel: route.provider + "/" + route.model,
    routingModel: route.provider + "::" + route.model,
    supportsImages: route.supportsImages !== false,
    supportsToolCalls: route.supportsToolCalls !== false,
    supportsThinking: !!route.supportsThinking,
    maxTokens: route.maxTokens || 200000,
    maxOutputTokens: route.maxOutputTokens || 32768,
    __daoRoute: true,
    __daoRouteUid: uid,
  };
}

// dao-proxy-max v1.0.0 官方 4 BYOK 透明劫态报
function statusOfficial() {
  if (!_ready || !_cfg) return { enabled: false, count: 0, uids: [] };
  const ov = _cfg.officialByokOverrides;
  if (!ov || ov.enabled !== true) return { enabled: false, count: 0, uids: [] };
  const map = ov.map || {};
  const uids = Object.keys(map).filter((k) => {
    const t = map[k];
    return t && t.provider && t.model && t.enabled !== false;
  });
  return { enabled: true, count: uids.length, uids, map };
}

// dao-proxy-max v1.0.0 官方 4 BYOK 透明劫 反者道之动
function routeForOfficial(uid) {
  if (!_ready || !_cfg) return null;
  if (typeof uid !== "string") return null;
  if (!uid.endsWith("_BYOK")) return null;
  if (uid.endsWith("_BYOK_DAO")) return null;
  const ov = _cfg.officialByokOverrides;
  if (!ov || ov.enabled !== true) return null;
  const t = (ov.map || {})[uid];
  if (!t || !t.provider || !t.model) return null;
  if (t.enabled === false) return null;
  const h = (_cfg.gateway && _cfg.gateway.host) || "127.0.0.1";
  const p = (_cfg.gateway && _cfg.gateway.port) || 11435;
  return {
    gatewayUrl: `http://${h}:${p}`,
    chatPath: "/v1/chat/completions",
    messagesPath: "/v1/messages",
    provider: t.provider,
    model: t.model,
    qualifiedModel: `${t.provider}/${t.model}`,
    routingModel: `${t.provider}::${t.model}`,
    supportsImages: t.supportsImages !== false,
    supportsToolCalls: t.supportsToolCalls !== false,
    supportsThinking: !!t.supportsThinking,
    maxTokens: t.maxTokens || 200000,
    maxOutputTokens: t.maxOutputTokens || 8192,
    __official: true,
    __officialUid: uid,
  };
}

/** 给定 qualifiedModel (如 github/openai/gpt-4.1-mini) → 路由目标 · 否则 null
 *  供 handleChatCompletions (/v1/chat/completions) 识别 github/* 等非 dao-byok-UID 模型直走 070
 */
function routeForModel(qualifiedModel) {
  if (!_ready || !_inject) return null;
  return _inject.getRoutingTargetForQualifiedModel(qualifiedModel);
}

function isReady() {
  return _ready;
}

// ── 私有: 把 OpenAI SSE 流转写成 Cascade Connect-RPC 帧 ──
//   读 OpenAI 流: choices[0].delta.{content, reasoning_content, tool_calls}, finish_reason
//   写 Cascade 帧:
//     · delta.content              → buildTextFrame (field 3 delta_text)
//     · delta.reasoning_content    → buildThinkingFrame (field 9 delta_thinking)
//       (兼容: thinking / reasoning / delta.message?.thinking)
//     · delta.tool_calls (累进)    → buildToolCallsFrame (field 6 delta_tool_calls)
//                                    OpenAI 把 arguments 切片送, 070 累成 ChatToolCall
//                                    在 finish_reason 或换 index 时一次冲出
//     · finish_reason              → buildStopReasonFrame (field 5 stop_reason enum)
//                                    + buildEndFrame (Connect end-of-stream)
function _streamOAToCascade(agRes, res, builders) {
  const { textFrame, thinkFrame, toolFrame, stopFrame, endFrame, log } =
    builders;
  const toolBuf = new Map(); // index → { id, name, argsBuf }
  let buf = "";
  let stopReason = null; // 由最后一条 finish_reason 决定
  let agentDone = false;
  let textBytes = 0,
    thinkBytes = 0,
    toolCount = 0;

  const _flushTools = () => {
    if (toolBuf.size === 0) return;
    const calls = [];
    // 按 index 升序输出, 保证 Cascade 看到的工具顺序与上游一致
    const keys = Array.from(toolBuf.keys()).sort((a, b) => a - b);
    for (const k of keys) {
      const r = toolBuf.get(k);
      if (!r || !r.name) continue;
      calls.push({
        id: r.id || `tc_${k}`,
        name: r.name,
        argumentsJson: r.argsBuf || "{}",
      });
    }
    toolBuf.clear();
    if (calls.length > 0 && typeof toolFrame === "function") {
      const fr = toolFrame(calls);
      if (fr && fr.length) {
        res.write(fr);
        toolCount += calls.length;
      }
    }
  };

  agRes.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      let obj;
      try {
        obj = JSON.parse(d);
      } catch {
        continue;
      }

      const choice = obj.choices && obj.choices[0];
      if (!choice) continue;
      const delta = choice.delta || {};

      // ── 文本增量 ──
      if (typeof delta.content === "string" && delta.content.length > 0) {
        const fr = textFrame(delta.content);
        if (fr && fr.length) {
          res.write(fr);
          textBytes += Buffer.byteLength(delta.content, "utf8");
        }
      }

      // ── 思考增量 (DeepSeek R1: reasoning_content · 通用: thinking) ──
      const think =
        (typeof delta.reasoning_content === "string" &&
          delta.reasoning_content) ||
        (typeof delta.thinking === "string" && delta.thinking) ||
        (typeof delta.reasoning === "string" && delta.reasoning) ||
        "";
      if (think && typeof thinkFrame === "function") {
        const fr = thinkFrame(think);
        if (fr && fr.length) {
          res.write(fr);
          thinkBytes += Buffer.byteLength(think, "utf8");
        }
      }

      // ── 工具调用增量 (累进式) ──
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = typeof tc.index === "number" ? tc.index : 0;
          let rec = toolBuf.get(idx);
          if (!rec) {
            rec = { id: "", name: "", argsBuf: "" };
            toolBuf.set(idx, rec);
          }
          if (tc.id) rec.id = tc.id;
          if (tc.function && tc.function.name) rec.name = tc.function.name;
          if (tc.function && typeof tc.function.arguments === "string") {
            rec.argsBuf += tc.function.arguments;
          }
        }
      }

      // ── 结束信号 ──
      if (choice.finish_reason) {
        // 工具一次性冲出 (确保 args 完整)
        _flushTools();
        // 停止理由映射 · 用模块级 _wire (attach 时已 load)
        const fr = choice.finish_reason;
        if (_wire) {
          if (fr === "tool_calls" || fr === "function_call")
            stopReason = _wire.STOP_TOOL_CALLS;
          else if (fr === "length") stopReason = _wire.STOP_MAX_TOKENS;
          else if (fr === "content_filter")
            stopReason = _wire.STOP_CONTENT_FILTER;
          else stopReason = _wire.STOP_END;
        }
        agentDone = true;
      }
    }
  });

  agRes.on("end", () => {
    // 兜底: 上游忘 finish_reason 也要冲走未完工具
    if (!agentDone) _flushTools();
    if (stopReason !== null && typeof stopFrame === "function") {
      const fr = stopFrame(stopReason);
      if (fr && fr.length) res.write(fr);
    }
    if (typeof endFrame === "function") {
      const fr = endFrame(null);
      if (fr && fr.length) res.write(fr);
    }
    if (!res.writableEnded) res.end();
    if (typeof log === "function") {
      log(
        `[070-bridge] ✓ stream done · text=${textBytes}B think=${thinkBytes}B tools=${toolCount}`,
      );
    }
  });

  agRes.on("error", (e) => {
    if (typeof endFrame === "function") {
      try {
        res.write(endFrame(`070 upstream: ${e.message}`));
      } catch {}
    }
    if (!res.writableEnded) res.end();
  });
}

// ── 私有: 选定帧构造器 (070 自家优先 · 010 旧版兜底) ──
function _selectBuilders(legacyTextFrame, legacyEndFrame) {
  if (_wire) {
    // 070 自家 · 字段 3/5/6/9 全规范 · 工具 / 思考 / 停止理由全可携
    return {
      textFrame: _wire.buildTextFrame,
      thinkFrame: _wire.buildThinkingFrame,
      toolFrame: _wire.buildToolCallsFrame,
      stopFrame: _wire.buildStopReasonFrame,
      endFrame: _wire.buildEndFrame,
      log: _log,
    };
  }
  // wire 缺失 (极端情况) · 退化为 010 旧式 · 仅文字
  return {
    textFrame: legacyTextFrame || ((s) => Buffer.from(String(s), "utf8")),
    thinkFrame: null,
    toolFrame: null,
    stopFrame: null,
    endFrame: legacyEndFrame || (() => Buffer.alloc(0)),
    log: _log,
  };
}

/**
 * proxyChat (旧式入口 · 文字回路) · 与 010 现接口对齐 · 不改 010 既有调用点
 *
 * 与上一版相比新增能力:
 *   · OpenAI 上游若返 tool_calls / reasoning_content, 070 仍以正确字段透回 Cascade
 *     (即便 010 的 buildTextFrame 是 field 1 旧式, 070 会改用 cascade_wire 的 field 3)
 *   · 上游 finish_reason 转译为 stop_reason 帧
 *
 * 局限: 此入口拿不到原 GetChatMessageRequest 的 tools 字段, 故上游 LLM 无从知
 *      "可用什么工具", 也就不会主动喷 tool_calls. 要解此绑, 走 proxyChatRaw.
 */
function proxyChat(
  req,
  res,
  modelUid,
  messages,
  target,
  buildTextFrame,
  buildEndFrame,
) {
  return _doProxy(
    req,
    res,
    modelUid,
    {
      messages: messages || [],
      tools: undefined,
      system: undefined,
      toolChoice: undefined,
    },
    target,
    buildTextFrame,
    buildEndFrame,
  );
}

/**
 * proxyChatRaw (新式入口 · 完整工具链) · 010 透过 rawBody 即可一通到底
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse}  res
 * @param {Buffer} rawBody    · 010 收到的原始 GetChatMessageRequest body
 * @param {boolean} isJSON    · content-type 含 'json' 即 true
 * @param {Object} target     · routeFor(uid) 返回值
 * @param {Function} [legacyTextFrame]  · 010 旧 builder · 仅 wire 加载失败时用
 * @param {Function} [legacyEndFrame]
 */
function proxyChatRaw(
  req,
  res,
  rawBody,
  isJSON,
  target,
  legacyTextFrame,
  legacyEndFrame,
) {
  if (!_wire) {
    // wire 不可用 · 退化到 proxyChat (但 messages 抽不出, 给空)
    return proxyChat(
      req,
      res,
      target.modelUid || "",
      [],
      target,
      legacyTextFrame,
      legacyEndFrame,
    );
  }
  let parsed;
  try {
    parsed = _wire.parseGetChatMessageRequest(rawBody, !!isJSON);
  } catch (e) {
    _log(
      `[070-bridge] parseGetChatMessageRequest 失败 · ${e.message} · 退化文字回路`,
    );
    return proxyChat(req, res, "", [], target, legacyTextFrame, legacyEndFrame);
  }
  // 把 cascade 消息形态 → OpenAI messages
  // ★ 视感 · 若 m.images 非空, 把 content 转为 OpenAI 多模态数组:
  //    [{type:'text', text:'...'}, {type:'image_url', image_url:{url:'...'}}]
  const messages = [];
  if (parsed.system) messages.push({ role: "system", content: parsed.system });
  for (const m of parsed.messages) {
    const out = { role: m.role === "tool" ? "tool" : m.role || "user" };
    const hasImages = Array.isArray(m.images) && m.images.length > 0;

    if (
      m.role === "assistant" &&
      Array.isArray(m.tool_calls) &&
      m.tool_calls.length
    ) {
      // assistant 带 tool_calls (assistant 通常不带图, 但兜底支持)
      if (hasImages) {
        const parts = [];
        if (m.content) parts.push({ type: "text", text: m.content });
        for (const img of m.images) parts.push(img);
        out.content = parts;
      } else if (m.content) out.content = m.content;
      else out.content = null;
      out.tool_calls = m.tool_calls.map((tc) => ({
        id: tc.id || "",
        type: "function",
        function: { name: tc.name || "", arguments: tc.argumentsJson || "{}" },
      }));
    } else if (m.role === "tool") {
      // tool 角色: OpenAI 不允许图像在 tool 消息, 直接降级文本
      // ★ tool_result_is_error 透出 · OpenAI 协议本无 is_error 字段
      //   070 以 [ERROR] 前缀让上游模型识别 · Cascade 调内置时此语义在协议内闭环
      const errPrefix = m.tool_result_is_error ? "[ERROR] " : "";
      out.content = errPrefix + (m.content || "");
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
    } else {
      // user / system: 视感主战场
      if (hasImages) {
        const parts = [];
        if (m.content) parts.push({ type: "text", text: m.content });
        for (const img of m.images) parts.push(img);
        out.content = parts;
      } else {
        out.content = m.content || "";
      }
    }
    messages.push(out);
  }
  return _doProxy(
    req,
    res,
    parsed.modelUid,
    {
      messages,
      tools: parsed.tools,
      toolChoice: parsed.toolChoice,
      disableParallelToolCalls: parsed.disableParallelToolCalls,
    },
    target,
    legacyTextFrame,
    legacyEndFrame,
  );
}

// 私有 · 实际转发 + 流处理
// 反者道之动 · 反向审视并损之: 去 max_tokens 硬截 16000 · 加 req.close / 上游 timeout 监听
function _doProxy(
  req,
  res,
  modelUid,
  payload,
  target,
  legacyTextFrame,
  legacyEndFrame,
) {
  const builders = _selectBuilders(legacyTextFrame, legacyEndFrame);

  // 构造 070 网关请求 (OpenAI 形态) · 070 内会再翻译到具体 provider
  // max_tokens: 只在 target.maxOutputTokens 有值时传, 无值则让上游自决 (避免硬上限截)
  const sendBody = {
    model: target.routingModel,
    messages: payload.messages || [],
    stream: true,
  };
  const outCap =
    target.maxOutputTokens && target.maxOutputTokens > 0
      ? target.maxOutputTokens
      : 0;
  if (outCap > 0) sendBody.max_tokens = outCap;
  if (Array.isArray(payload.tools) && payload.tools.length) {
    sendBody.tools = payload.tools;
    if (payload.toolChoice !== undefined)
      sendBody.tool_choice = payload.toolChoice;
    if (payload.disableParallelToolCalls) sendBody.parallel_tool_calls = false;
  }
  const reqBody = JSON.stringify(sendBody);

  // Cascade 请求 content-type: connect+proto 或 connect+json;
  // 070 桥帧始终是 proto wire (cascade_wire 的 buildFrame 编 protobuf).
  // Cascade LSP 宽容: 即便 content-type 标 json, body 只要是合法 Connect frames 就能解.
  // 故此处 respCT 与 reqCT 对齐, 给 LSP 最接近原状的提示.
  const ct = (req.headers && req.headers["content-type"]) || "";
  const respCT = ct.includes("json")
    ? "application/connect+json"
    : "application/connect+proto";
  res.writeHead(200, {
    "Content-Type": respCT,
    "Transfer-Encoding": "chunked",
  });

  const u = new URL(target.gatewayUrl);
  const port = u.port ? parseInt(u.port, 10) : 80;

  const agReq = http.request(
    {
      hostname: u.hostname,
      port,
      path: target.chatPath || "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(reqBody),
      },
    },
    (agRes) => {
      // 上游错误透传为 endFrame(error)
      if (agRes.statusCode && agRes.statusCode >= 400) {
        let errBuf = "";
        agRes.on("data", (c) => {
          errBuf += c.toString("utf8");
        });
        agRes.on("end", () => {
          if (typeof builders.endFrame === "function") {
            res.write(
              builders.endFrame(
                `070 upstream ${agRes.statusCode}: ${errBuf.slice(0, 400)}`,
              ),
            );
          }
          if (!res.writableEnded) res.end();
        });
        return;
      }
      _streamOAToCascade(agRes, res, builders);
    },
  );

  // 上游连接级错误
  agReq.on("error", (e) => {
    if (!res.writableEnded) {
      if (typeof builders.endFrame === "function") {
        res.write(builders.endFrame(`070 connect: ${e.message}`));
      }
      res.end();
    }
  });

  // 上游超时 · 120s · 防上游 hang
  agReq.setTimeout(120000, () => {
    try {
      agReq.destroy(new Error("upstream timeout (120s)"));
    } catch {}
  });

  // 客户端断流 (Cascade ESC) · 取消上游避免泄漏
  // 反者道之动: Node 16+ req.on('close') 在 body 接收完即触发 (与 connection 无关),
  // 故改用 res.on('close') · 仅在 res 尚未结束时视为客户端真断流.
  const onClientAbort = () => {
    if (!res.writableEnded && !agReq.destroyed) {
      try {
        agReq.destroy();
      } catch {}
    }
  };
  res.once("close", onClientAbort);

  agReq.write(reqBody);
  agReq.end();

  const tcount = (payload.tools || []).length;
  _log(
    `[070-bridge] → ${target.gatewayUrl} model=${target.routingModel} (uid=${modelUid}) msgs=${(payload.messages || []).length} tools=${tcount} maxOut=${outCap || "-"}`,
  );
}

module.exports = {
  attach,
  refresh, // 配置热更 · 010 不重启即可吃新配置
  status, // 桥状态快照 · 给 /health 用
  routeFor,
  routeForOfficial, // dao-proxy-max v1.0.0 · 官方 4 BYOK 透明劫
  statusOfficial, // dao-proxy-max v1.0.0 · 官方 4 BYOK 劫态
  routeForModel, // 按 qualifiedModel 查路由 · 给 /v1/chat/completions 用
  isReady,
  proxyChat, // 旧式 (向后兼容 010 当前调用点)
  proxyChatRaw, // 新式 (推荐 010 改用此 · 全工具)
  // 露 wire 给 010, 让其可直接复用 070 的帧编 (避免 010 自家 buildTextFrame 编错字段)
  get wire() {
    return _wire;
  },
};
