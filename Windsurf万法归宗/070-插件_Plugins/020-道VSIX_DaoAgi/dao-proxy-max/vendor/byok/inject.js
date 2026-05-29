"use strict";
/**
 * inject.js · Cascade 模型目录注入器 · v2.0 浑然一体版
 * ════════════════════════════════════════════════════════════════
 * 反者道之动 · 物无非彼, 物无非是; 自彼则不见, 自是则知之 · 道法自然
 *
 * v2.0 之核心 (相比 v1.x):
 *   1. 字段 100% 对齐 Windsurf 真 BYOK 标准 (modelOrAlias / modelCostTier
 *      / supportsLegacy / modelInfo 子树 / 真 provider 枚举)
 *   2. modelUid 仿 BYOK 命名: MODEL_<DESC>_<VIA>_BYOK_DAO
 *      _DAO 后缀仅供 010 路由识别 · UI 显示用 label · 用户视感与官方一致
 *   3. 单一真源 buildBYOKModelConfig(entry, uid) · UI / Configs / Status 共用
 *   4. provider 真名映射 _resolveModelProvider(provider, model)
 *   5. 向后兼容: 仍识别旧 "dao-byok-*" UID 路由 (老配置不溃)
 *
 * 真 BYOK 字段范本 (从 020-逆向_Reverse/_model_configs_full.json L3349 实证):
 *   {
 *     label: "Claude Sonnet 4 BYOK",
 *     modelOrAlias: { model: "MODEL_CLAUDE_4_SONNET_BYOK" },
 *     modelUid: "MODEL_CLAUDE_4_SONNET_BYOK",
 *     pricingType: "MODEL_PRICING_TYPE_BYOK",
 *     supportsImages: true,
 *     supportsLegacy: true,                              ← 与官方 BYOK 同
 *     provider: "MODEL_PROVIDER_ANTHROPIC",              ← 真 provider 而非 UNSPECIFIED
 *     maxTokens: 200000,
 *     modelInfo: {
 *       modelId, modelUid, modelType: "MODEL_TYPE_CHAT",
 *       maxTokens, tokenizerType: "LLAMA_WITH_SPECIAL",
 *       modelFeatures: { zeroShotCapable, supportsImages, supportsToolCalls,
 *                        supportsParallelToolCalls, [supportsThinking] },
 *       maxOutputTokens, inferenceServerUrl: "https://server.codeium.com"
 *     },
 *     modelCostTier: "MODEL_COST_TIER_FREE"              ← BYOK 默 FREE (绕 quota)
 *   }
 *
 * 作用机制:
 *   Cascade 启动调 GetCascadeModelConfigs → server.codeium.com
 *   010 反代 :8878 拦响应, 把我们 buildBYOKModelConfig 生成的条目并入 modelConfigs[]
 *   用户在选择器看到 "GPT-4.1 mini · GitHub" 等 (UI 与官方 BYOK 一致)
 *   选中 → Cascade 发 GetChatMessage(modelUid=MODEL_GPT_4_1_MINI_GITHUB_BYOK_DAO)
 *   010 反代识别 _BYOK_DAO 后缀 → 070 桥 → 070 网关 :11435 → 真上游
 */

const fs = require("fs");
const path = require("path");

const PREFIX_LEGACY = "dao-byok-"; // v1.x 旧 UID 前缀 (仍兼容)
const SUFFIX_DAO = "_BYOK_DAO"; // v2.0 新 UID 后缀 (仿官方 _BYOK · 加 _DAO 标记便路由)
const INFERENCE_SERVER = "https://server.codeium.com"; // 官方 BYOK 同 url (实际被 010 反代拦)

let _cfg = null;
let _map = new Map(); // uid → { provider, model, driver, label, ... }
let _legacyMap = new Map(); // 旧式 dao-byok-* uid → 同 entry (向后兼容)

function load(configPath) {
  if (!configPath) {
    configPath = path.join(__dirname, "..", "配置.json");
    if (!fs.existsSync(configPath)) {
      configPath = path.join(__dirname, "..", "配置.example.json");
    }
  }
  if (!fs.existsSync(configPath)) {
    _cfg = {};
    _map.clear();
    _legacyMap.clear();
    return null;
  }
  _cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  _map.clear();
  _legacyMap.clear();
  const inj = _cfg.cascadeInjection || {};
  if (!inj.enabled || !Array.isArray(inj.injectModels)) return _cfg;
  for (const m of inj.injectModels) {
    const uid = makeUid(m.provider, m.model); // 新式 BYOK 风
    const legacyUid = _makeLegacyUid(m.provider, m.model); // 旧式兼容
    const entry = {
      provider: m.provider,
      model: m.model,
      label: m.label || `${m.provider} · ${m.model}`,
      supportsImages: !!m.supportsImages,
      supportsToolCalls: m.supportsToolCalls !== false, // 默认 true
      supportsThinking: !!m.supportsThinking, // 默认 false · 仅 R1/o1 等开
      maxTokens: m.maxTokens || 131072,
      maxOutputTokens: m.maxOutputTokens || 8192,
      creditMultiplier: m.creditMultiplier || 1,
      tier: m.tier || "MODEL_COST_TIER_FREE", // BYOK 默 FREE
    };
    _map.set(uid, entry);
    _legacyMap.set(legacyUid, entry); // 旧 UID 仍可路由 (向后兼容)
  }
  return _cfg;
}

// ── 真 provider 映射 (反 v1.x UNSPECIFIED 之误) ────────────────
// 看 (provider, model) 推断 MODEL_PROVIDER_* 真名 (聚合 provider 看 model 子前缀)
function _resolveModelProvider(provider, model) {
  const m = (model || "").toLowerCase();
  // model 内含子 provider (聚合 provider 如 github/openai/* · openrouter/anthropic/*)
  if (/anthropic\/|claude/.test(m)) return "MODEL_PROVIDER_ANTHROPIC";
  if (/openai\/|gpt-|^o[1-9]/.test(m)) return "MODEL_PROVIDER_OPENAI";
  if (/meta\/|llama/.test(m)) return "MODEL_PROVIDER_META";
  if (/deepseek/.test(m)) return "MODEL_PROVIDER_DEEPSEEK";
  if (/kimi|moonshot/.test(m)) return "MODEL_PROVIDER_MOONSHOT";
  if (/qwen|tongyi/.test(m)) return "MODEL_PROVIDER_QWEN";
  if (/gemini|google\//.test(m)) return "MODEL_PROVIDER_GOOGLE";
  if (/grok|xai\//.test(m)) return "MODEL_PROVIDER_XAI";
  if (/mistral|codestral|ministral/.test(m)) return "MODEL_PROVIDER_MISTRAL";
  if (/cohere/.test(m)) return "MODEL_PROVIDER_COHERE";
  if (/microsoft\/|^phi-|\/phi-/.test(m)) return "MODEL_PROVIDER_MICROSOFT";
  // fallback 顶层 provider 名
  switch ((provider || "").toLowerCase()) {
    case "anthropic":
      return "MODEL_PROVIDER_ANTHROPIC";
    case "openai":
      return "MODEL_PROVIDER_OPENAI";
    case "google":
    case "gemini":
      return "MODEL_PROVIDER_GOOGLE";
    case "deepseek":
      return "MODEL_PROVIDER_DEEPSEEK";
    case "kimi":
    case "moonshot":
      return "MODEL_PROVIDER_MOONSHOT";
    case "xai":
    case "grok":
      return "MODEL_PROVIDER_XAI";
    case "qwen":
    case "tongyi":
      return "MODEL_PROVIDER_QWEN";
    case "mistral":
      return "MODEL_PROVIDER_MISTRAL";
    case "cohere":
      return "MODEL_PROVIDER_COHERE";
    case "groq":
      return "MODEL_PROVIDER_GROQ";
    case "github":
      return "MODEL_PROVIDER_OPENAI"; // GitHub Models 默 OpenAI 风格 (除非 model 字段另指)
    case "openrouter":
      return "MODEL_PROVIDER_OPENAI"; // 同
    case "lgcode":
      return "MODEL_PROVIDER_OPENAI"; // LG-Code 默 OpenAI 兼容 (除非 model 字段另指 claude/gemini 等)
    case "lgcodeanthropic":
    case "lgcodea":
      return "MODEL_PROVIDER_ANTHROPIC"; // 同站 /v1/messages 入口 · 仅 Claude
    case "ollama":
    case "local":
      return "MODEL_PROVIDER_UNSPECIFIED";
    default:
      return "MODEL_PROVIDER_UNSPECIFIED";
  }
}

// ── modelUid 生成 (BYOK 风) ────────────────────────────────────
// 旧 v1.x: "dao-byok-github-openai-gpt-4-1-mini" (暴露插件)
// 新 v2.0: "MODEL_GPT_4_1_MINI_GITHUB_BYOK_DAO" (仿官方 _BYOK · _DAO 仅供路由)
function makeUid(provider, model) {
  const lastSeg = (model || "").split("/").pop() || model || "";
  const desc = lastSeg
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const via = (provider || "VIA")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `MODEL_${desc}_${via}${SUFFIX_DAO}`;
}

// 旧式 UID (向后兼容 · 老 030-额度 / 040-切号 等可能仍引)
function _makeLegacyUid(provider, model) {
  const safe = (provider + "-" + model)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 72);
  return PREFIX_LEGACY + safe;
}

function isInjectedModelUid(uid) {
  if (typeof uid !== "string") return false;
  // 新式: MODEL_*_BYOK_DAO
  if (uid.endsWith(SUFFIX_DAO) && _map.has(uid)) return true;
  // 旧式 (向后兼容): dao-byok-*
  if (uid.startsWith(PREFIX_LEGACY) && _legacyMap.has(uid)) return true;
  return false;
}

function resolveInjectedModelUid(uid) {
  if (typeof uid !== "string") return null;
  return _map.get(uid) || _legacyMap.get(uid) || null;
}

function getAllInjections() {
  return Array.from(_map.entries()).map(([uid, v]) => ({
    modelUid: uid,
    ...v,
  }));
}

// ── 单一真源 · 构造 BYOK 配置 (UI/Configs/Status 共用 · 100% 对齐真本源) ───
// 此函数为 v2.0 核心 · 取代 v1.x 中 makeCascadeModelConfig 与 getCascadeUiEntries
// 两份字段不一致之相 (前者 STATIC_CREDIT, 后者 BYOK · 自相矛盾).
function buildBYOKModelConfig(entry, uid) {
  const realProvider = _resolveModelProvider(entry.provider, entry.model);
  const tier = entry.tier || "MODEL_COST_TIER_FREE";
  const supportsToolCalls = entry.supportsToolCalls !== false;
  const features = {
    zeroShotCapable: true,
    supportsImages: !!entry.supportsImages,
    supportsToolCalls,
    supportsParallelToolCalls: supportsToolCalls,
  };
  if (entry.supportsThinking) features.supportsThinking = true;

  return {
    label: entry.label,
    modelOrAlias: { model: uid }, // ← 与真 BYOK 一致
    modelUid: uid,
    pricingType: "MODEL_PRICING_TYPE_BYOK", // ← 真 BYOK
    supportsImages: !!entry.supportsImages,
    supportsLegacy: true, // ← 与真 BYOK 一致
    provider: realProvider, // ← 真 provider 枚举
    maxTokens: entry.maxTokens || 131072,
    modelInfo: {
      modelId: uid,
      modelUid: uid,
      modelType: "MODEL_TYPE_CHAT",
      maxTokens: entry.maxTokens || 131072,
      tokenizerType: "LLAMA_WITH_SPECIAL",
      modelFeatures: features,
      maxOutputTokens: entry.maxOutputTokens || 8192,
      inferenceServerUrl: INFERENCE_SERVER, // ← 与真 BYOK 同 url (010 反代拦)
    },
    modelCostTier: tier, // ← FREE (BYOK 标志 · 绕 quota)
  };
}

/**
 * 生成 Cascade modelConfig 条目 (JSON 形式 · 与官方 BYOK 100% 同构)
 * v2.0: 走单一真源 buildBYOKModelConfig · 不再有 v1.x 字段不一致之误
 */
function makeCascadeModelConfig(entry) {
  const uid = makeUid(entry.provider, entry.model);
  return buildBYOKModelConfig(entry, uid);
}

/**
 * 将注入条目追加到 GetCascadeModelConfigsResponse
 * 原 proto: { modelConfigs: [...] }
 */
function applyToCascadeModelConfigs(responseObj) {
  if (!responseObj || typeof responseObj !== "object") return responseObj;
  if (!_map.size) return responseObj;
  const arr = responseObj.modelConfigs || responseObj.configs || [];
  for (const [, entry] of _map) {
    arr.push(makeCascadeModelConfig(entry));
  }
  responseObj.modelConfigs = arr;
  return responseObj;
}

/**
 * 请求劫持: 检测请求里是否使用了我们的 modelUid, 给出转发指令
 * 返回: null (非 dao-byok) 或 { gatewayUrl, model, provider }
 */
function hijackRequest(reqBodyObj) {
  if (!reqBodyObj || typeof reqBodyObj !== "object") return null;
  const uid = extractModelUid(reqBodyObj);
  if (!uid || !isInjectedModelUid(uid)) return null;
  const meta = resolveInjectedModelUid(uid);
  return {
    gatewayUrl: _cfg?.gateway?.host
      ? `http://${_cfg.gateway.host}:${_cfg.gateway.port || 11435}`
      : "http://127.0.0.1:11435",
    provider: meta.provider,
    model: meta.model,
    qualifiedModel: `${meta.provider}/${meta.model}`,
  };
}

function extractModelUid(obj) {
  if (!obj) return null;
  // 递归找 modelUid / requestedModelUid 字段
  if (typeof obj !== "object") return null;
  if (obj.modelUid && typeof obj.modelUid === "string") return obj.modelUid;
  if (obj.requestedModelUid && typeof obj.requestedModelUid === "string")
    return obj.requestedModelUid;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === "object") {
      const found = extractModelUid(v);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 010-兼容接口 · getCascadeUiEntries
 * ────────────────────────────────────────────────────────────────
 * 返回与 010 universal_relay.js 中 INJECT_MODELS 完全同构的条目数组.
 * v2.0: 走单一真源 buildBYOKModelConfig + 摊扁平字段 + 加 010 内部辅助标志.
 *
 * 字段语义 (与官方 BYOK 100% 同构 · 唯加 __dao_byok / __target 内部辅助):
 *   label, modelOrAlias, modelUid, pricingType=BYOK, supportsImages,
 *   supportsLegacy=true, provider=MODEL_PROVIDER_<真>, maxTokens,
 *   modelInfo {modelId,modelUid,modelType,maxTokens,tokenizerType,
 *              modelFeatures {zeroShotCapable,supportsImages,supportsToolCalls,
 *                             supportsParallelToolCalls,[supportsThinking]},
 *              maxOutputTokens, inferenceServerUrl},
 *   modelCostTier=FREE, isNew=true,
 *   __dao_byok=true (010 内部辅助 · UI 不见), __target (路由元 · 010 内部辅助)
 */
function getCascadeUiEntries() {
  return Array.from(_map.entries()).map(([uid, v]) => {
    const cfg = buildBYOKModelConfig(v, uid);
    return {
      ...cfg,
      // 010 内部辅助 (前缀 __ 的字段 Cascade UI 不识别 · 仅给反代用)
      isNew: true,
      // 摊平字段 · 兼容 010 旧 INJECT_MODELS 数组结构
      supportsToolCalls: !!v.supportsToolCalls,
      supportsThinking: !!v.supportsThinking,
      maxOutputTokens: v.maxOutputTokens || 8192,
      creditMultiplier: v.creditMultiplier || 1,
      __dao_byok: true,
      __target: {
        provider: v.provider,
        model: v.model,
        qualifiedModel: `${v.provider}/${v.model}`,
      },
    };
  });
}

/**
 * 010-兼容接口 · getRoutingTargetForQualifiedModel
 * ───────────────────────────────────────────────
 * 以 "provider/model" (如 "github/openai/gpt-4.1-mini") 查路由目标.
 * 供 handleChatCompletions(/v1/chat/completions) 识别 github/* 等非 dao-byok-UID 模型.
 */
function getRoutingTargetForQualifiedModel(qualifiedModel) {
  const host = (_cfg && _cfg.gateway && _cfg.gateway.host) || "127.0.0.1";
  const port = (_cfg && _cfg.gateway && _cfg.gateway.port) || 11435;
  for (const [uid, meta] of _map.entries()) {
    if (`${meta.provider}/${meta.model}` === qualifiedModel) {
      return {
        gatewayUrl: `http://${host}:${port}`,
        chatPath: "/v1/chat/completions",
        messagesPath: "/v1/messages",
        provider: meta.provider,
        model: meta.model,
        qualifiedModel,
        routingModel: `${meta.provider}::${meta.model}`,
        supportsImages: !!meta.supportsImages,
        supportsToolCalls: !!meta.supportsToolCalls,
        supportsThinking: !!meta.supportsThinking,
        maxTokens: meta.maxTokens || 131072,
        maxOutputTokens: meta.maxOutputTokens || 8192,
      };
    }
  }
  return null;
}

/**
 * 010-兼容接口 · getRoutingTargetForUid
 * ───────────────────────────────────────────────
 * 010 在 handleWindsurfChat 里调此方法; 命中则知 uid 应转发到 070 网关 :11435
 * 而非 loop back 010 自家. 未命中则返回 null, 010 走原路.
 * v2.0: 同时识别新 (MODEL_*_BYOK_DAO) 与旧 (dao-byok-*) UID.
 */
function getRoutingTargetForUid(uid) {
  if (!isInjectedModelUid(uid)) return null;
  const meta = _map.get(uid) || _legacyMap.get(uid);
  if (!meta) return null;
  const host = (_cfg && _cfg.gateway && _cfg.gateway.host) || "127.0.0.1";
  const port = (_cfg && _cfg.gateway && _cfg.gateway.port) || 11435;
  return {
    gatewayUrl: `http://${host}:${port}`,
    chatPath: "/v1/chat/completions",
    messagesPath: "/v1/messages",
    provider: meta.provider,
    model: meta.model,
    qualifiedModel: `${meta.provider}/${meta.model}`,
    routingModel: `${meta.provider}::${meta.model}`,
    supportsImages: !!meta.supportsImages,
    supportsToolCalls: !!meta.supportsToolCalls,
    supportsThinking: !!meta.supportsThinking,
    maxTokens: meta.maxTokens || 131072,
    maxOutputTokens: meta.maxOutputTokens || 8192,
  };
}

/** 已加载条目数 · 用于 010 启动时打印 */
function size() {
  return _map.size;
}

module.exports = {
  load,
  makeUid,
  buildBYOKModelConfig, // v2.0 单一真源 · 公露给单元测试与外部消费
  isInjectedModelUid,
  resolveInjectedModelUid,
  getAllInjections,
  makeCascadeModelConfig,
  applyToCascadeModelConfigs,
  hijackRequest,
  getCascadeUiEntries,
  getRoutingTargetForQualifiedModel,
  getRoutingTargetForUid,
  size,
  PREFIX_LEGACY, // v1.x 旧前缀 (向后兼容引用)
  SUFFIX_DAO, // v2.0 新后缀 (路由识别)
  // 旧名 PREFIX 仍露 · 指向旧前缀 (避免外部老 require 溃)
  PREFIX: PREFIX_LEGACY,
};

// ── 自检 · BYOK schema 真本源对拍 ─────────────────────────────
// 用法: node inject.js --test
// 验证: buildBYOKModelConfig 生成字段集与 _model_configs_full.json L3349
//       的真 BYOK 样本 (Claude Sonnet 4 BYOK) 完全同构.
if (require.main === module && process.argv.includes("--test")) {
  const tests = [];
  const expect = (name, cond, info) => {
    tests.push({ name, ok: !!cond, info });
  };

  // ── T1 · 字段集对拍 (生成 vs 真本源) ────────────────────
  const sample = buildBYOKModelConfig(
    {
      provider: "github",
      model: "openai/gpt-4.1-mini",
      label: "GPT-4.1 mini (免费 · GitHub)",
      supportsImages: true,
      supportsToolCalls: true,
      supportsThinking: false,
      maxTokens: 128000,
      maxOutputTokens: 8192,
    },
    "MODEL_GPT_4_1_MINI_GITHUB_BYOK_DAO",
  );
  // 顶层字段
  for (const k of [
    "label",
    "modelOrAlias",
    "modelUid",
    "pricingType",
    "supportsImages",
    "supportsLegacy",
    "provider",
    "maxTokens",
    "modelInfo",
    "modelCostTier",
  ]) {
    expect(`top field: ${k}`, k in sample, JSON.stringify(sample[k]));
  }
  expect("pricingType=BYOK", sample.pricingType === "MODEL_PRICING_TYPE_BYOK");
  expect("supportsLegacy=true", sample.supportsLegacy === true);
  expect("modelCostTier=FREE", sample.modelCostTier === "MODEL_COST_TIER_FREE");
  expect(
    "provider=OPENAI (github/openai/* → 真 OpenAI)",
    sample.provider === "MODEL_PROVIDER_OPENAI",
    sample.provider,
  );
  expect(
    "modelOrAlias.model=uid",
    sample.modelOrAlias && sample.modelOrAlias.model === sample.modelUid,
  );

  // modelInfo 子树
  const mi = sample.modelInfo;
  for (const k of [
    "modelId",
    "modelUid",
    "modelType",
    "maxTokens",
    "tokenizerType",
    "modelFeatures",
    "maxOutputTokens",
    "inferenceServerUrl",
  ]) {
    expect(`modelInfo.${k}`, k in mi, JSON.stringify(mi[k]));
  }
  expect("modelInfo.modelType=CHAT", mi.modelType === "MODEL_TYPE_CHAT");
  expect(
    "modelInfo.tokenizerType=LLAMA_WITH_SPECIAL",
    mi.tokenizerType === "LLAMA_WITH_SPECIAL",
  );
  expect(
    "modelInfo.inferenceServerUrl=server.codeium.com",
    mi.inferenceServerUrl === INFERENCE_SERVER,
    mi.inferenceServerUrl,
  );

  // modelFeatures 子树
  const mf = mi.modelFeatures;
  for (const k of [
    "zeroShotCapable",
    "supportsImages",
    "supportsToolCalls",
    "supportsParallelToolCalls",
  ]) {
    expect(`modelFeatures.${k}`, k in mf);
  }
  expect("modelFeatures.zeroShotCapable=true", mf.zeroShotCapable === true);
  expect(
    "modelFeatures.supportsImages=true (来自 entry)",
    mf.supportsImages === true,
  );
  expect(
    "modelFeatures.supportsToolCalls=true (来自 entry)",
    mf.supportsToolCalls === true,
  );
  // thinking=false → 字段不出现 (与官方 v1.110 BYOK 范本一致 · 仅 thinking 模型才有)
  expect(
    "modelFeatures.supportsThinking 缺 (entry false)",
    !("supportsThinking" in mf),
  );

  // ── T2 · 真 provider 映射 ────────────────────────────────
  const cases = [
    [{ provider: "github", model: "openai/gpt-4o" }, "MODEL_PROVIDER_OPENAI"],
    [
      { provider: "github", model: "anthropic/claude-3-5-sonnet" },
      "MODEL_PROVIDER_ANTHROPIC",
    ],
    [
      { provider: "github", model: "meta/llama-3-70b-instruct" },
      "MODEL_PROVIDER_META",
    ],
    [
      { provider: "github", model: "deepseek/deepseek-v3" },
      "MODEL_PROVIDER_DEEPSEEK",
    ],
    [{ provider: "openai", model: "gpt-4.1" }, "MODEL_PROVIDER_OPENAI"],
    [{ provider: "openai", model: "o1-mini" }, "MODEL_PROVIDER_OPENAI"],
    [
      { provider: "anthropic", model: "claude-3-5-sonnet" },
      "MODEL_PROVIDER_ANTHROPIC",
    ],
    [
      { provider: "deepseek", model: "deepseek-chat" },
      "MODEL_PROVIDER_DEEPSEEK",
    ],
    [
      { provider: "kimi", model: "moonshot-v1-128k" },
      "MODEL_PROVIDER_MOONSHOT",
    ],
    [{ provider: "google", model: "gemini-2.5-pro" }, "MODEL_PROVIDER_GOOGLE"],
    [{ provider: "xai", model: "grok-3" }, "MODEL_PROVIDER_XAI"],
    [{ provider: "qwen", model: "qwen-max" }, "MODEL_PROVIDER_QWEN"],
    [{ provider: "ollama", model: "llama3" }, "MODEL_PROVIDER_META"], // model 内含 llama → META
  ];
  for (const [c, want] of cases) {
    const got = _resolveModelProvider(c.provider, c.model);
    expect(
      `provider(${c.provider}/${c.model})=${want}`,
      got === want,
      `got=${got}`,
    );
  }

  // ── T3 · UID 生成 ─────────────────────────────────────────
  const uidCases = [
    [["github", "openai/gpt-4.1-mini"], "MODEL_GPT_4_1_MINI_GITHUB_BYOK_DAO"],
    [
      ["github", "meta/llama-3.3-70b-instruct"],
      "MODEL_LLAMA_3_3_70B_INSTRUCT_GITHUB_BYOK_DAO",
    ],
    [["openai", "gpt-4o"], "MODEL_GPT_4O_OPENAI_BYOK_DAO"],
    [
      ["anthropic", "claude-3-5-sonnet"],
      "MODEL_CLAUDE_3_5_SONNET_ANTHROPIC_BYOK_DAO",
    ],
  ];
  for (const [args, want] of uidCases) {
    const got = makeUid(args[0], args[1]);
    expect(`makeUid(${args[0]}/${args[1]})`, got === want, `got=${got}`);
  }

  // ── T4 · 路由识别 (新旧 UID 都识别) ──────────────────────
  // 模拟 load 配置
  _map.set("MODEL_GPT_4_1_MINI_GITHUB_BYOK_DAO", {
    provider: "github",
    model: "openai/gpt-4.1-mini",
  });
  _legacyMap.set("dao-byok-github-openai-gpt-4-1-mini", {
    provider: "github",
    model: "openai/gpt-4.1-mini",
  });
  expect(
    "isInjectedModelUid 新式",
    isInjectedModelUid("MODEL_GPT_4_1_MINI_GITHUB_BYOK_DAO"),
  );
  expect(
    "isInjectedModelUid 旧式 (向后兼容)",
    isInjectedModelUid("dao-byok-github-openai-gpt-4-1-mini"),
  );
  expect(
    "isInjectedModelUid 非我家 (官方 BYOK)",
    !isInjectedModelUid("MODEL_CLAUDE_4_SONNET_BYOK"),
  );
  expect("isInjectedModelUid 非我家 (随便)", !isInjectedModelUid("gpt-4o"));
  _map.clear();
  _legacyMap.clear();

  // ── 报告 ──
  let pass = 0,
    fail = 0;
  for (const t of tests) {
    if (t.ok) pass++;
    else fail++;
    console.log(
      `  [${t.ok ? "PASS" : "FAIL"}] ${t.name}${t.info && !t.ok ? " · " + t.info : ""}`,
    );
  }
  console.log(`\n  inject.js v2.0 自检: ${pass} passed · ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
