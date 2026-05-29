"use strict";
/**
 * dao_router.js · 道路由 v2.0 · 透明模型替换 · 反者道之动
 * ════════════════════════════════════════════════════════════════
 *
 *   《帛书·四十章》: "反也者，道之动也；弱也者，道之用也"
 *   《阴符经》: "天之至私，用之至公 · 禽之制在炁"
 *
 *   本源架构 v2.0:
 *     小模型 → cascadeRelay(道直连器:7861) → Cascade官方云端(账号池)
 *     fallback → github备用(Azure/GitHub Models)
 *     大模型(Claude4.6/4.7/GPT-5) → 不路由 → 直接透传官方
 *
 *   多提供商支持:
 *     cascadeRelay: noProviderPrefix=true → 直接调 http://127.0.0.1:7861/v1/chat/completions
 *     github: noProviderPrefix=true → 直接调 https://models.inference.ai.azure.com/chat/completions
 *     其他: gateway::model 格式 → 070网关 → 对应provider
 *
 *   内建退化:
 *     target.fallback → { provider, model } 主路由失败时自动尝试
 *     若两者均失败 → return false → MITM回落官方上游
 *
 *   配置 (配置.json):
 *     daoRoutes.routes["MODEL_UID"] = {
 *       provider, model, fallback: { provider, model },
 *       maxOutputTokens, _label
 *     }
 *     providers["providerName"] = {
 *       baseUrl, noProviderPrefix, completionPath, apiKey, enabled
 *     }
 */

const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");

// ── 状态 ──────────────────────────────────────────────────────
let _cfg = null;
let _routes = {}; // modelUid → { provider, model, fallback?, maxOutputTokens }
let _providers = {}; // providerName → { baseUrl, noProviderPrefix, completionPath, apiKey, enabled }
let _gatewayUrl = "";
let _log = () => {};
let _ready = false;
let _substituteEnabled = false; // 全局开关: substitute模式默认关闭(需用户有目标模型权限)
let _wire = null; // cascade_wire.js (lazy load)

// ── 道直连器健康缓存 (避免每次都探测) ──────────────────────────
const _healthCache = {}; // providerName → { alive: bool, ts: timestamp }
const HEALTH_TTL = 30000; // 30秒缓存

// ── 统计 ──────────────────────────────────────────────────────
const _stats = {
  total: 0, // 总路由判断次数
  routed: 0, // 成功路由到cascadeRelay
  fallbackRouted: 0, // 成功路由到fallback provider
  passthru: 0, // 回落官方 (不在路由表)
  errorFallback: 0, // 主路由失败→fallback
  errors: 0, // 致命错误
};

// ── lazy load cascade_wire ──────────────────────────────────
function wire() {
  if (!_wire) {
    try {
      _wire = require(path.join(__dirname, "cascade_wire.js"));
    } catch (e) {
      _log(`[dao-router] cascade_wire load fail: ${e.message}`);
    }
  }
  return _wire;
}

// ════════════════════════════════════════════════════════════════
// §1  公开 API
// ════════════════════════════════════════════════════════════════

/**
 * 初始化 · 加载 daoRoutes 配置
 * @param {{ log: Function, configPath: string }} opts
 * @returns {{ ready: boolean, count?: number, gateway?: string, error?: string }}
 */
function init({ log, configPath }) {
  _log = log || (() => {});
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    _cfg = JSON.parse(raw);
    const dr = _cfg.daoRoutes || {};

    if (dr.enabled === false) {
      _ready = false;
      _log("[dao-router] daoRoutes.enabled=false · 透明路由已禁用");
      return { ready: false, reason: "disabled" };
    }

    // 加载路由表 (过滤掉 _注 等注释键)
    const rawRoutes = dr.routes || {};
    _routes = {};
    for (const [uid, t] of Object.entries(rawRoutes)) {
      if (uid.startsWith("_") || typeof t !== "object" || !t.provider) continue;
      _routes[uid] = t;
    }

    // 加载 providers
    _providers = _cfg.providers || {};

    // 全局 substitute 开关
    _substituteEnabled = dr.substituteEnabled === true;
    if (!_substituteEnabled) {
      _log("[dao-router]   substitute模式: 关闭 (substituteEnabled=false)");
    }

    const gw = _cfg.gateway || {};
    _gatewayUrl = `http://${gw.host || "127.0.0.1"}:${gw.port || 11435}`;
    const count = Object.keys(_routes).length;
    _ready = count > 0;

    if (_ready) {
      _log("[dao-router] ══════════════════════════════════════════");
      _log(`[dao-router] 道路由 v2.0 就绪 · routes=${count}`);
      const provCounts = {};
      for (const t of Object.values(_routes)) {
        provCounts[t.provider] = (provCounts[t.provider] || 0) + 1;
      }
      for (const [p, n] of Object.entries(provCounts)) {
        const pCfg = _providers[p] || {};
        _log(
          `[dao-router]   ${p}: ${n}条 · url=${pCfg.baseUrl || _gatewayUrl}`,
        );
      }
      let i = 0;
      for (const [uid, t] of Object.entries(_routes)) {
        if (i++ >= 8) {
          _log(`[dao-router]   ... +${count - 8}条`);
          break;
        }
        _log(
          `[dao-router]   ${uid} → ${t.provider}/${t.model}` +
            (t.fallback
              ? ` [备:${t.fallback.provider}/${t.fallback.model}]`
              : ""),
        );
      }
      _log("[dao-router] ══════════════════════════════════════════");
    } else {
      _log("[dao-router] 无路由配置");
    }

    wire();
    return {
      ready: _ready,
      count,
      gateway: _gatewayUrl,
      providers: Object.keys(_providers),
    };
  } catch (e) {
    _log(`[dao-router] init 失败: ${e.message}`);
    _ready = false;
    return { ready: false, error: e.message };
  }
}

/** 是否就绪 */
function isReady() {
  return _ready;
}

/**
 * 从 GetChatMessage 原始 body 快速提取 modelUid
 * 用于 MITM 早期路由决策
 */
function extractModelUid(rawBody, isJSON) {
  try {
    const w = wire();
    if (!w) return null;
    const parsed = w.parseGetChatMessageRequest(rawBody, !!isJSON);
    return (parsed && parsed.modelUid) || null;
  } catch {
    return null;
  }
}

/**
 * 判断是否应路由此 modelUid
 */
function shouldRoute(modelUid) {
  if (!_ready || typeof modelUid !== "string") return false;
  const r = _routes[modelUid];
  if (!r) return false;
  // 路由条目 enabled:false → 不路由 (substitute默认关闭)
  if (r.enabled === false) return false;
  // substitute模式需要全局开关
  if (r.provider === "substitute" && !_substituteEnabled) return false;
  return true;
}

/**
 * 路由执行: GetChatMessage → 第三方API
 *
 * @param {http.IncomingMessage}  req      - 原始请求 (用于 close 监听)
 * @param {http.ServerResponse}   res      - HTTP 响应
 * @param {Buffer}                rawBody  - GetChatMessageRequest 原始 body
 * @param {boolean}               isJSON   - content-type 含 'json' 则 true
 * @param {string}                modelUid - 模型 UID
 * @returns {Promise<boolean>} true=路由成功已响应 / false=应回落到官方
 */
async function route(req, res, rawBody, isJSON, modelUid) {
  const target = _routes[modelUid];
  if (!target) return false;

  _stats.total++;
  const w = wire();
  if (!w) {
    _log(`[dao-router] [SKIP] cascade_wire 不可用 · ${modelUid}`);
    _stats.errorFallback++;
    return false;
  }

  // ── 解析 GetChatMessageRequest ──
  let parsed;
  try {
    parsed = w.parseGetChatMessageRequest(rawBody, !!isJSON);
    if (!parsed) throw new Error("parse returned null");
  } catch (e) {
    _log(`[dao-router] [SKIP] parse 失败: ${e.message} · ${modelUid}`);
    _stats.errorFallback++;
    return false;
  }

  const messages = _buildOAMessages(parsed);
  const callOpts = {
    messages,
    tools: parsed.tools,
    toolChoice: parsed.toolChoice,
    maxOutputTokens: target.maxOutputTokens || 32768,
  };

  // ── 检查 provider 是否存在且启用 ──
  const provCfg = _providers[target.provider];
  if (!provCfg || provCfg.enabled === false) {
    _log(
      `[dao-router] [SKIP] provider=${target.provider} 不存在或已禁用 · ${modelUid}`,
    );
    _stats.errorFallback++;
    // 直接尝试 fallback
    if (target.fallback && target.fallback.provider) {
      const fbTarget = {
        ...target.fallback,
        maxOutputTokens: target.maxOutputTokens,
      };
      const fbProvCfg = _providers[fbTarget.provider];
      if (fbProvCfg && fbProvCfg.enabled !== false) {
        _log(
          `[dao-router] [FB→] ${modelUid} → ${fbTarget.provider}/${fbTarget.model}`,
        );
        try {
          const fbOk = await _tryRoute({
            target: fbTarget,
            callOpts,
            res,
            isJSON,
            modelUid,
            isPrimary: true,
            w,
          });
          if (fbOk) {
            _stats.fallbackRouted++;
            return true;
          }
        } catch (e) {
          _log(`[dao-router] [FB✗] ${modelUid}: ${e.message}`);
        }
      }
    }
    _stats.errors++;
    return false;
  }

  // ── 尝试主路由 ──
  const primaryOk = await _tryRoute({
    target,
    callOpts,
    res,
    isJSON,
    modelUid,
    isPrimary: true,
    w,
  });
  if (primaryOk) {
    _stats.routed++;
    return true;
  }

  // ── 主路由失败 → 尝试 fallback ──
  if (target.fallback && target.fallback.provider) {
    _stats.errorFallback++;
    const fbTarget = {
      ...target.fallback,
      maxOutputTokens: target.maxOutputTokens,
    };
    const fbProvCfg = _providers[fbTarget.provider];
    if (!fbProvCfg || fbProvCfg.enabled === false) {
      _log(
        `[dao-router] [FB✗] fallback provider=${fbTarget.provider} 不存在或已禁用`,
      );
    } else {
      _log(
        `[dao-router] [FB→] ${modelUid} → ${fbTarget.provider}/${fbTarget.model}`,
      );
      try {
        const fbOk = await _tryRoute({
          target: fbTarget,
          callOpts,
          res,
          isJSON,
          modelUid,
          isPrimary: false,
          w,
        });
        if (fbOk) {
          _stats.fallbackRouted++;
          return true;
        }
      } catch (e) {
        _log(`[dao-router] [FB✗] ${modelUid}: ${e.message}`);
      }
    }
  }

  // ── 全部失败 → 回落官方 ──
  _stats.errors++;
  _log(`[dao-router] [→官方] ${modelUid} 所有路由失败`);
  return false;
}

/** 尝试单条路由 */
async function _tryRoute({
  target,
  callOpts,
  res,
  isJSON,
  modelUid,
  isPrimary,
  w,
}) {
  const provCfg = _providers[target.provider] || {};
  const tag = isPrimary ? "" : "[备]";

  // 快速健康检查 (cascadeRelay 有 healthCheck)
  if (isPrimary && provCfg.healthCheck) {
    const alive = await _checkHealth(target.provider, provCfg.healthCheck);
    if (!alive) {
      _log(
        `[dao-router] ${tag}[SKIP] ${target.provider} 健康检查失败 · ${modelUid}`,
      );
      return false;
    }
  }

  _log(
    `[dao-router] ${tag}[→] ${modelUid} → ${target.provider}/${target.model}`,
  );
  try {
    const agRes = await _callProvider(
      provCfg,
      target.provider,
      target.model,
      callOpts.messages,
      callOpts.tools,
      callOpts.toolChoice,
      callOpts.maxOutputTokens,
    );

    if (agRes.statusCode !== 200) {
      const errBody = await _readAll(agRes);
      _log(
        `[dao-router] ${tag}[✗] HTTP ${agRes.statusCode}: ${errBody.slice(0, 180)}`,
      );
      if (isPrimary && agRes.statusCode >= 500) {
        _healthCache[target.provider] = { alive: false, ts: Date.now() };
      }
      return false;
    }

    if (!res.headersSent) {
      res.writeHead(200, {
        "content-type": isJSON
          ? "application/connect+json"
          : "application/connect+proto",
        trailers: "grpc-status, grpc-message",
      });
    }
    await _streamOaToCascade(agRes, res, w);
    _log(
      `[dao-router] ${tag}[✓] ${modelUid} → ${target.provider}/${target.model}`,
    );
    return true;
  } catch (e) {
    _log(`[dao-router] ${tag}[✗] ${target.provider} 异常: ${e.message}`);
    if (isPrimary && e.message.includes("ECONNREFUSED")) {
      _healthCache[target.provider] = { alive: false, ts: Date.now() };
    }
    return false;
  }
}

/**
 * 状态快照 · 供 MITM /health 端点使用
 */
function status() {
  const provHealth = {};
  for (const [name, h] of Object.entries(_healthCache)) {
    provHealth[name] = { alive: h.alive, ageMs: Date.now() - h.ts };
  }
  return {
    ready: _ready,
    count: Object.keys(_routes).length,
    uids: Object.keys(_routes),
    gateway: _gatewayUrl,
    stats: { ..._stats },
    providers: Object.keys(_providers),
    provHealth,
  };
}

// ════════════════════════════════════════════════════════════════
// §2  私有辅助
// ════════════════════════════════════════════════════════════════

/**
 * 将 Cascade 消息格式 → OpenAI messages 数组
 */
function _buildOAMessages(parsed) {
  const messages = [];
  if (parsed.system) messages.push({ role: "system", content: parsed.system });
  for (const m of parsed.messages || []) {
    const out = { role: m.role === "tool" ? "tool" : m.role || "user" };
    const hasImages = Array.isArray(m.images) && m.images.length > 0;

    if (
      m.role === "assistant" &&
      Array.isArray(m.tool_calls) &&
      m.tool_calls.length
    ) {
      // assistant + tool_calls
      out.content = hasImages
        ? [{ type: "text", text: m.content || "" }, ...m.images]
        : m.content || null;
      out.tool_calls = m.tool_calls.map((tc) => ({
        id: tc.id || "",
        type: "function",
        function: {
          name: tc.name || "",
          arguments: tc.argumentsJson || "{}",
        },
      }));
    } else if (m.role === "tool") {
      // tool result
      out.content =
        (m.tool_result_is_error ? "[ERROR] " : "") + (m.content || "");
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
    } else {
      // user / system
      out.content = hasImages
        ? [{ type: "text", text: m.content || "" }, ...m.images]
        : m.content || "";
    }
    messages.push(out);
  }
  return messages;
}

/** 快速健康检查 (带缓存) */
function _checkHealth(name, healthUrl) {
  const cache = _healthCache[name];
  if (cache && Date.now() - cache.ts < HEALTH_TTL)
    return Promise.resolve(cache.alive);
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(healthUrl);
    } catch {
      return resolve(false);
    }
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        hostname: u.hostname,
        port: parseInt(u.port || (u.protocol === "https:" ? "443" : "80")),
        path: u.pathname,
        method: "GET",
        timeout: 2000,
      },
      (res) => {
        res.resume();
        const alive = res.statusCode >= 200 && res.statusCode < 400;
        _healthCache[name] = { alive, ts: Date.now() };
        resolve(alive);
      },
    );
    req.on("error", () => {
      _healthCache[name] = { alive: false, ts: Date.now() };
      resolve(false);
    });
    req.on("timeout", () => {
      req.destroy();
      _healthCache[name] = { alive: false, ts: Date.now() };
      resolve(false);
    });
    req.end();
  });
}

/**
 * 自动探活 provider baseUrl (支持 baseUrlFallbackPorts)
 */
function _resolveBaseUrl(provCfg) {
  const primary = provCfg.baseUrl;
  const fallbackPorts = provCfg.baseUrlFallbackPorts || [];
  if (!fallbackPorts.length) return Promise.resolve(primary);
  // 尝试主端口
  return new Promise(async (resolve) => {
    const primaryUrl = new URL(primary);
    for (const testUrl of [
      primary,
      ...fallbackPorts.map((p) => primary.replace(/:?\d+$/, ":" + p)),
    ]) {
      try {
        const u = new URL(testUrl);
        const alive = await _checkHealth(
          "_resolve_" + u.port,
          testUrl.replace(/\/v.*$/, "") + "/health",
        );
        if (alive) {
          resolve(testUrl.replace(/\/v.*$/, ""));
          return;
        }
      } catch {}
    }
    resolve(primary); // 全部失败默认用主端口
  });
}

/**
 * 调用 provider 端点
 * noProviderPrefix=true  → model 原名直发（github/Azure）
 * modelPrefix=xxx        → xxx/model 发到 baseUrl（cascadeRelay/windsurfRelay 通过070网关）
 * 其他              → gatewayUrl + providerName::model
 */
async function _callProvider(
  provCfg,
  providerName,
  model,
  messages,
  tools,
  toolChoice,
  maxOutputTokens,
) {
  // 预先解析 baseUrl（可能含 await）— 包裹为单次 HTTP 请求
  return new Promise(async (resolve, reject) => {
    let toolsField;
    if (Array.isArray(tools) && tools.length > 0) {
      toolsField = tools.map((t) => ({
        type: "function",
        function: {
          name: t.name || "",
          description: t.description || "",
          parameters: t.inputSchema || t.parameters || {},
        },
      }));
    }

    const bodyObj = { messages, stream: true };
    if (toolsField) {
      bodyObj.tools = toolsField;
      bodyObj.tool_choice = toolChoice || "auto";
    }
    if (maxOutputTokens) bodyObj.max_tokens = maxOutputTokens;

    let targetUrl,
      extraHeaders = {};

    if (provCfg.baseUrl && provCfg.noProviderPrefix) {
      // ── 直连模式: github→Azure (model原名直发) ──
      bodyObj.model = model;
      const completionPath = provCfg.completionPath || "/v1/chat/completions";
      const resolvedBase = await _resolveBaseUrl(provCfg);
      targetUrl = new URL(resolvedBase.replace(/\/$/, "") + completionPath);
      if (provCfg.apiKey)
        extraHeaders["Authorization"] = `Bearer ${provCfg.apiKey}`;
    } else if (provCfg.baseUrl && provCfg.modelPrefix) {
      // ── 070网关前缀模式: cascadeRelay/gpt-5-4-low → 070网关 ──
      bodyObj.model = `${provCfg.modelPrefix}/${model}`;
      const completionPath = provCfg.completionPath || "/v1/chat/completions";
      const resolvedBase = await _resolveBaseUrl(provCfg);
      targetUrl = new URL(resolvedBase.replace(/\/$/, "") + completionPath);
      if (provCfg.apiKey)
        extraHeaders["Authorization"] = `Bearer ${provCfg.apiKey}`;
    } else {
      // ── 兜底网关模式: providerName::model → _gatewayUrl ──
      bodyObj.model = `${providerName}::${model}`;
      targetUrl = new URL(_gatewayUrl + "/v1/chat/completions");
    }

    const body = JSON.stringify(bodyObj);
    const isHttps = targetUrl.protocol === "https:";
    const mod = isHttps ? https : http;
    const opts = {
      hostname: targetUrl.hostname,
      port: parseInt(targetUrl.port || (isHttps ? "443" : "80")),
      path: targetUrl.pathname + (targetUrl.search || ""),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Accept: "text/event-stream",
        ...extraHeaders,
      },
      rejectUnauthorized: false,
    };

    const req = mod.request(opts, resolve);
    req.on("error", reject);
    req.setTimeout(120000, () => req.destroy(new Error("provider timeout")));
    req.write(body);
    req.end();
  });
}

/** 读取全部响应体 (用于错误日志) */
function _readAll(agRes) {
  return new Promise((resolve) => {
    let d = "";
    agRes.on("data", (c) => (d += c));
    agRes.on("end", () => resolve(d));
    agRes.on("error", () => resolve(d));
  });
}

/**
 * OpenAI SSE 流 → Cascade Connect-RPC wire 帧
 * 支持: text / thinking / tool_calls / stop_reason / end
 */
function _streamOaToCascade(agRes, res, w) {
  const toolBuf = new Map(); // index → { id, name, argsBuf }
  let buf = "";
  let stopReason = null;
  let textBytes = 0,
    thinkBytes = 0,
    toolCount = 0;

  const _flushTools = () => {
    if (toolBuf.size === 0) return;
    const calls = [];
    Array.from(toolBuf.keys())
      .sort((a, b) => a - b)
      .forEach((k) => {
        const r = toolBuf.get(k);
        if (r && r.name) {
          calls.push({
            id: r.id || `tc_${k}`,
            name: r.name,
            argumentsJson: r.argsBuf || "{}",
          });
        }
      });
    toolBuf.clear();
    if (calls.length > 0 && w.buildToolCallsFrame) {
      const fr = w.buildToolCallsFrame(calls);
      if (fr && fr.length) {
        res.write(fr);
        toolCount += calls.length;
      }
    }
  };

  return new Promise((resolve, reject) => {
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

        // 文本增量
        if (typeof delta.content === "string" && delta.content.length > 0) {
          const fr = w.buildTextFrame(delta.content);
          if (fr && fr.length) {
            res.write(fr);
            textBytes += Buffer.byteLength(delta.content);
          }
        }

        // 思考增量 (DeepSeek R1 / Claude 3.7 Thinking)
        const think =
          (typeof delta.reasoning_content === "string" &&
            delta.reasoning_content) ||
          (typeof delta.thinking === "string" && delta.thinking) ||
          (typeof delta.reasoning === "string" && delta.reasoning) ||
          "";
        if (think && w.buildThinkingFrame) {
          const fr = w.buildThinkingFrame(think);
          if (fr && fr.length) {
            res.write(fr);
            thinkBytes += Buffer.byteLength(think);
          }
        }

        // 工具调用 (累进)
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
            if (tc.function && typeof tc.function.arguments === "string")
              rec.argsBuf += tc.function.arguments;
          }
        }

        // 结束信号
        if (choice.finish_reason) {
          _flushTools();
          const fr = choice.finish_reason;
          if (fr === "tool_calls" || fr === "function_call")
            stopReason = w.STOP_TOOL_CALLS;
          else if (fr === "length") stopReason = w.STOP_MAX_TOKENS;
          else if (fr === "content_filter") stopReason = w.STOP_CONTENT_FILTER;
          else stopReason = w.STOP_END;
        }
      }
    });

    agRes.on("end", () => {
      // 兜底: 未发 finish_reason 时冲工具
      _flushTools();
      if (stopReason !== null && w.buildStopReasonFrame) {
        const fr = w.buildStopReasonFrame(stopReason);
        if (fr && fr.length) res.write(fr);
      }
      if (w.buildEndFrame) {
        const fr = w.buildEndFrame(null);
        if (fr && fr.length) res.write(fr);
      }
      // ★ Connect-RPC streaming 必须发送 trailers · 否则客户端报 "unexpected error"
      //   grpc-status: 0 = OK · 道法自然 · 有始有终
      try {
        res.addTrailers({ "grpc-status": "0", "grpc-message": "" });
      } catch {}
      if (!res.writableEnded) res.end();
      _log(
        `[dao-router] stream ✓ text=${textBytes}B think=${thinkBytes}B tools=${toolCount}`,
      );
      resolve();
    });

    agRes.on("error", (e) => {
      _flushTools();
      if (w.buildEndFrame) {
        try {
          res.write(w.buildEndFrame(`道路由上游错误: ${e.message}`));
        } catch {}
      }
      try {
        res.addTrailers({
          "grpc-status": "2",
          "grpc-message": e.message || "upstream error",
        });
      } catch {}
      if (!res.writableEnded) res.end();
      reject(e);
    });
  });
}

/**
 * 获取 substitute 模式的目标 UID (provider="substitute")
 * @returns {string|null} 目标 Cascade model UID，null=不是substitute模式
 */
function getSubstitution(modelUid) {
  const t = _routes[modelUid];
  if (!t || t.provider !== "substitute") return null;
  return t.model || null;
}

/**
 * patchModelUid — 替换 ConnectRPC 帧里 protobuf field 21 (chat_model_uid)
 *
 * 帧格式: [1B flags][4B BE length][protobuf body]
 * field 21, wire type 2: tag=[0xAA, 0x01], length varint, UTF-8 bytes
 *
 * @param {Buffer}  rawBody - ConnectRPC 原始帧 (可能含多帧)
 * @param {boolean} isJSON  - true=JSON格式(非protobuf) → 直接字符串替换
 * @param {string}  oldUid  - 原 modelUid
 * @param {string}  newUid  - 目标 modelUid
 * @returns {Buffer|null} 修改后的 Buffer，失败返回 null
 */
function patchModelUid(rawBody, isJSON, oldUid, newUid) {
  if (!rawBody || !rawBody.length) return null;
  if (oldUid === newUid) return rawBody;

  try {
    if (isJSON) {
      // JSON 格式：直接字符串替换 modelUid 字段
      const s = rawBody.toString("utf8");
      // 精确匹配 "modelUid":"OLD" 或 "model_uid":"OLD"
      const patched = s
        .replace(
          new RegExp(`"modelUid"\\s*:\\s*"${_escRe(oldUid)}"`, "g"),
          `"modelUid":"${newUid}"`,
        )
        .replace(
          new RegExp(`"model_uid"\\s*:\\s*"${_escRe(oldUid)}"`, "g"),
          `"model_uid":"${newUid}"`,
        );
      if (patched === s) return null; // 未找到
      // 更新帧长度（5字节头）
      const newPb = Buffer.from(patched, "utf8");
      const hdr = Buffer.alloc(5);
      hdr[0] = rawBody[0];
      hdr.writeUInt32BE(newPb.length - 5, 1);
      return newPb;
    }

    // Binary protobuf 格式
    // ConnectRPC frame: [1B flags][4B length][protobuf]
    if (rawBody.length < 5) return null;
    const flags = rawBody[0];
    const pbLen = rawBody.readUInt32BE(1);
    if (rawBody.length < 5 + pbLen) return null;
    const rawPb = rawBody.slice(5, 5 + pbLen);

    // flags=1 表示 gzip 压缩，需要解压
    let pb = rawPb;
    let isCompressed = false;
    if (flags === 1) {
      try {
        pb = zlib.gunzipSync(rawPb);
        isCompressed = true;
      } catch {
        return null;
      }
    }

    const oldBytes = Buffer.from(oldUid, "utf8");
    const newBytes = Buffer.from(newUid, "utf8");

    // ── 策略一: 标准 field 21 tag [0xAA, 0x01] 扫描 ─────────────
    // field 21, wire type 2: tag = (21<<3|2) = 170 = [0xAA, 0x01]
    const TAG1 = 0xaa,
      TAG2 = 0x01;
    let pos = 0;
    while (pos < pb.length - 1) {
      if (pb[pos] !== TAG1 || pb[pos + 1] !== TAG2) {
        pos++;
        continue;
      }
      let len = 0,
        shift = 0,
        i = pos + 2;
      while (i < pb.length) {
        const b = pb[i++];
        len |= (b & 0x7f) << shift;
        shift += 7;
        if (!(b & 0x80)) break;
      }
      if (
        i + len <= pb.length &&
        pb.slice(i, i + len).toString("utf8") === oldUid
      ) {
        const lenVarNew = _encodeVarint(newBytes.length);
        const newPb = Buffer.concat([
          pb.slice(0, pos),
          Buffer.from([TAG1, TAG2]),
          lenVarNew,
          newBytes,
          pb.slice(i + len),
        ]);
        return _repackFrame(newPb, isCompressed, flags, rawBody, 5 + pbLen);
      }
      pos++;
    }

    // ── 策略二: 原始字节串搜索 (处理不同的 tag 编码格式) ──────────
    // 找 length_varint + oldUid_bytes，不强求具体 tag
    const lenVar = _encodeVarint(oldBytes.length);
    const pattern = Buffer.concat([lenVar, oldBytes]);
    let idx = pb.indexOf(pattern);
    while (idx >= 0) {
      // 验证这个位置之前有 protobuf tag 字节 (至少1字节)
      if (idx >= 1) {
        const lenVarNew = _encodeVarint(newBytes.length);
        const replacement = Buffer.concat([lenVarNew, newBytes]);
        const newPb = Buffer.concat([
          pb.slice(0, idx),
          replacement,
          pb.slice(idx + pattern.length),
        ]);
        return _repackFrame(newPb, isCompressed, flags, rawBody, 5 + pbLen);
      }
      idx = pb.indexOf(pattern, idx + 1);
    }
    return null; // 未找到 field 21
  } catch {
    return null;
  }
}

/**
 * 重新打包 ConnectRPC 帧：如果原帧是压缩的，重新 gzip 压缩
 * @param {Buffer}  newPb       - patch 后的 (解压) protobuf bytes
 * @param {boolean} isCompressed - 原帧是否压缩
 * @param {number}  flags       - 原 flags 字节
 * @param {Buffer}  rawBody     - 原始完整 body
 * @param {number}  tailStart   - 后续帧起始位置 (5 + pbLen)
 */
function _repackFrame(newPb, isCompressed, flags, rawBody, tailStart) {
  let payload = newPb;
  if (isCompressed) {
    try {
      payload = zlib.gzipSync(newPb);
    } catch {
      return null;
    }
  }
  const newHdr = Buffer.alloc(5);
  newHdr[0] = flags; // 保持原 flags (压缩位)
  newHdr.writeUInt32BE(payload.length, 1);
  return Buffer.concat([newHdr, payload, rawBody.slice(tailStart)]);
}

function _escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function _encodeVarint(n) {
  const parts = [];
  while (n >= 128) {
    parts.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  parts.push(n & 0x7f);
  return Buffer.from(parts);
}

module.exports = {
  init,
  isReady,
  extractModelUid,
  shouldRoute,
  route,
  status,
  getSubstitution,
  patchModelUid,
};
