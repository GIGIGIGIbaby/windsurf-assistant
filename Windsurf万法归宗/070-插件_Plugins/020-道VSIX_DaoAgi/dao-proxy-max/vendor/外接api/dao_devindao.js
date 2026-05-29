#!/usr/bin/env node
/**
 * dao_devindao.js · 道·Devin道 · 全链路反代 · 无为而无不为
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   帛书·四十八: 「为道者日损，损之又损，以至于无为，无为而无不为。」
 *   帛书·四十:   「反也者，道之动也；弱也者，道之用也。」
 *   阴符经·上:   「观天之道，执天之行，尽矣。」
 *
 *   道义:
 *     全链路: ~/.wam/accounts.md → 批量Windsurf授权 → Devin session-token池
 *            → OpenAI兼容代理 → Devin Cloud wss ACP → 底层模型
 *
 *     一行启动: node dao_devindao.js
 *     一切自动: 读账号 → 登录 → 换票 → 建池 → 监听 → 轮转 → 重授权
 *
 *   架构:
 *     ┌──────────────────────────────────────────────────────────────┐
 *     │  任意 OpenAI 客户端 (curl / IDE / SDK)                      │
 *     │    ↓ POST /v1/chat/completions                              │
 *     │  dao_devindao.js :7788                                      │
 *     │    ↓ Token池轮转 (164账号 × devin-session-token$JWT)        │
 *     │    ↓ wss://app.devin.ai/api/acp/live?token=JWT              │
 *     │  Devin Cloud (Claude Opus 4.7 / GPT-5.5 / Devin 2.5 ...)   │
 *     └──────────────────────────────────────────────────────────────┘
 *
 *   授权链 (逆向自 WAM extension.js v2.7.6):
 *     Step1: POST windsurf.com/_devin-auth/password/login → auth1
 *     Step2: POST windsurf.com/_backend/.../WindsurfPostAuth → sessionToken
 *     Step3: POST register.windsurf.com/.../RegisterUser → apiKey (可选)
 *
 *   ACP协议 (Devin Cloud wss):
 *     initialize → session/new → session/set_config_option → session/prompt
 *               → session/update (agent_message_chunk) → stopReason
 *
 *   零外部依赖 · Node 22+ (内置WebSocket) · Node 18+ (需 npm ws)
 *
 *   CLI:
 *     node dao_devindao.js                          # 全量启动
 *     node dao_devindao.js --port 7788              # 指定端口
 *     node dao_devindao.js --accounts /path/to/md   # 指定账号文件
 *     node dao_devindao.js --concurrency 5          # 授权并发数
 *     node dao_devindao.js --dry-run                # 仅展账号不真登
 *     node dao_devindao.js --no-auth                # 跳过授权(用已有token)
 *     node dao_devindao.js --reauth-min 30          # 重授权间隔(分)
 *
 *   端点:
 *     POST /v1/chat/completions   OpenAI兼容 (stream/non-stream)
 *     GET  /v1/models             模型列表
 *     GET  /admin/health          健康检查
 *     GET  /admin/pool            Token池状态
 *     POST /admin/reauth          强制重授权
 *     GET  /admin/metrics         请求指标
 */
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

// ════════════════════════════════════════════════════════════════════════════
// §1  常量 & 配置
// ════════════════════════════════════════════════════════════════════════════

const WSS_BASE = "wss://app.devin.ai/api/acp/live";
const TOKEN_PREFIX = "devin-session-token$";
const WINDSURF = "https://windsurf.com";
const REGISTER_BASE = "https://register.windsurf.com";
const URL_DEVIN_LOGIN = WINDSURF + "/_devin-auth/password/login";
const URL_POSTAUTH =
  WINDSURF +
  "/_backend/exa.seat_management_pb.SeatManagementService/WindsurfPostAuth";
const URL_REGISTER_USER =
  REGISTER_BASE + "/exa.seat_management_pb.SeatManagementService/RegisterUser";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";
const HTTP_TIMEOUT_MS = 15000;

// 模型路由映射 · Devin Cloud session/set_config_option 之 devin_version
const MODEL_ROUTE_MAP = {
  // ── Opus 4.8 系列 (最新 · 2026-05-29 确认可用) ──
  "devin-opus-4-8": "devin-opus-4-8",
  "claude-opus-4-8": "devin-opus-4-8",
  "opus-4-8": "devin-opus-4-8",
  "opus-48": "devin-opus-4-8",

  // ── Opus 4.7 系列 ──
  "devin-cloud": "devin-opus-4-8", // default 升级到 4.8
  devin: "devin-opus-4-8", // default 升级到 4.8
  "devin-cloud-claude": "devin-opus-4-8", // Claude 路线升级到 4.8
  "devin-cloud-agent": "devin-opus-4-8", // Agent 路线升级到 4.8
  "claude-opus-4-7": "devin-opus-4-7",
  "claude-opus-4": "devin-opus-4-7",
  "devin-opus-4-7": "devin-opus-4-7",

  // ── GPT 系列 ──
  "devin-cloud-gpt": "devin-gpt-5-5",
  "gpt-5-5": "devin-gpt-5-5",
  "gpt-5": "devin-gpt-5-5",
  "devin-gpt-5-5": "devin-gpt-5-5",

  // ── Fast / Agent 系列 ──
  "devin-fast": "devin-fast-opus",
  "devin-fast-opus": "devin-fast-opus",
  "devin-2-5": "devin-2-5",
};
const DEFAULT_DEVIN_VERSION = "devin-opus-4-8";

// /v1/models 暴露的模型列表
const MODEL_CATALOG = [
  // ── Opus 4.8 系列 (最新 · 2026-05-29 确认) ──
  {
    id: "devin-opus-4-8",
    name: "Claude Opus 4.8 (Devin) ★LATEST",
    vendor: "anthropic",
  },
  { id: "claude-opus-4-8", name: "Claude Opus 4.8", vendor: "anthropic" },
  { id: "opus-4-8", name: "Opus 4.8 (alias)", vendor: "anthropic" },

  // ── Opus 4.7 系列 ──
  {
    id: "devin-opus-4-7",
    name: "Claude Opus 4.7 (Devin)",
    vendor: "anthropic",
  },
  { id: "claude-opus-4-7", name: "Claude Opus 4.7", vendor: "anthropic" },

  // ── GPT 系列 ──
  { id: "devin-gpt-5-5", name: "GPT-5.5 (Devin)", vendor: "openai" },
  { id: "gpt-5-5", name: "GPT-5.5", vendor: "openai" },

  // ── Fast / Agent 系列 ──
  { id: "devin-fast-opus", name: "Fast Opus (Devin)", vendor: "anthropic" },
  { id: "devin-2-5", name: "Devin 2.5 Agent", vendor: "cognition" },

  // ── 别名 (default → Opus 4.8) ──
  {
    id: "devin-cloud",
    name: "Devin Cloud (default → Opus 4.8)",
    vendor: "cognition",
  },
  {
    id: "devin-cloud-claude",
    name: "Devin Cloud → Claude (Opus 4.8)",
    vendor: "anthropic",
  },
  { id: "devin-cloud-gpt", name: "Devin Cloud → GPT", vendor: "openai" },
  {
    id: "devin-cloud-agent",
    name: "Devin Cloud Agent (Opus 4.8)",
    vendor: "cognition",
  },
];

// CLI 参数
const _args = process.argv.slice(2);
function getArg(name, def) {
  const i = _args.indexOf("--" + name);
  if (i >= 0 && _args[i + 1]) return _args[i + 1];
  const eq = _args.find((a) => a.startsWith("--" + name + "="));
  return eq ? eq.split("=").slice(1).join("=") : def;
}
const PORT = parseInt(getArg("port", "7788"), 10);
const ACCOUNTS_FILE =
  getArg("accounts", "") || path.join(os.homedir(), ".wam", "accounts.md");
const CONCURRENCY = parseInt(getArg("concurrency", "3"), 10);
const DRY_RUN = _args.includes("--dry-run");
const NO_AUTH = _args.includes("--no-auth");
const REAUTH_MIN = parseInt(getArg("reauth-min", "30"), 10);
const STAGGER_MS = parseInt(getArg("stagger-ms", "400"), 10);
const CHAT_TIMEOUT_MS = parseInt(getArg("timeout", "120000"), 10);
const MAX_RETRIES = parseInt(getArg("retries", "8"), 10);
const DEBUG = _args.includes("--debug") || process.env.DAO_DEBUG === "1";

// WebSocket (Node 22+ 内置 / npm ws 回退)
let WS = null;
try {
  if (typeof globalThis.WebSocket === "function") {
    WS = globalThis.WebSocket;
  }
} catch {}
if (!WS) {
  try {
    WS = require("ws");
  } catch {}
}
if (!WS) {
  console.error("[dao] ✗ 无 WebSocket · 须 Node 22+ 或 npm install ws");
  process.exit(1);
}

// ════════════════════════════════════════════════════════════════════════════
// §2  工具函数
// ════════════════════════════════════════════════════════════════════════════

function ts() {
  return new Date().toISOString().slice(11, 23);
}
function log(...a) {
  process.stderr.write(`[dao ${ts()}] ${a.join(" ")}\n`);
}
function dbg(...a) {
  if (DEBUG) log("DBG", ...a);
}

function mask(t) {
  if (typeof t !== "string" || !t) return "(none)";
  if (t.length <= 24) return t.slice(0, 6) + "...";
  return t.slice(0, 14) + "..." + t.slice(-8);
}
function maskEmail(e) {
  if (typeof e !== "string" || !e) return "(?)";
  return e.replace(/^([^@]{1,3}).*?(@.*)$/, "$1***$2");
}

/** 极简 JSON POST */
function jsonPost(targetUrl, headers, body, opts = {}) {
  const timeout = opts.timeoutMs || HTTP_TIMEOUT_MS;
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(targetUrl);
    } catch (e) {
      return resolve({ status: 0, json: null, text: "bad url: " + e.message });
    }
    const data = Buffer.from(JSON.stringify(body || {}), "utf8");
    const reqHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      "User-Agent": UA,
      "Content-Length": data.length,
      ...(headers || {}),
    };
    const req = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: reqHeaders,
        timeout,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let j = null;
          try {
            j = text ? JSON.parse(text) : null;
          } catch {}
          resolve({ status: res.statusCode || 0, json: j, text });
        });
      },
    );
    req.on("error", (e) =>
      resolve({ status: 0, json: null, text: "err: " + e.message }),
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, json: null, text: "timeout" });
    });
    req.write(data);
    req.end();
  });
}

/** 读请求体 */
function readBody(req) {
  return new Promise((resolve) => {
    const c = [];
    req.on("data", (d) => c.push(d));
    req.on("end", () => resolve(Buffer.concat(c)));
    req.on("error", () => resolve(Buffer.alloc(0)));
  });
}

/** SSE 写入 */
function sseWrite(res, data) {
  try {
    res.write("data: " + JSON.stringify(data) + "\n\n");
  } catch {}
}
function sseDone(res) {
  try {
    res.write("data: [DONE]\n\n");
  } catch {}
}

/** JSON 响应 */
function jsonRes(res, code, data) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

// ════════════════════════════════════════════════════════════════════════════
// §3  账号解析 · 读 accounts.md → [{email, password}]
// ════════════════════════════════════════════════════════════════════════════

function parseAccounts(filePath) {
  if (!fs.existsSync(filePath)) {
    log("✗ 账号文件不存在:", filePath);
    return [];
  }
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"));

  const accounts = [];
  for (const line of lines) {
    const m = line.match(/^([^\s,;|]+@[^\s,;|]+)[\s,;|]+([^\s,;|]{6,})/);
    if (!m) continue;
    const [, email, password] = m;
    // 判断类型
    let type = "password";
    if (password.startsWith("devin-session-token$")) type = "session";
    else if (/^auth1_[A-Za-z0-9]{40,}$/.test(password)) type = "auth1";
    else if (/^(sk-ws-|auth1_)/.test(password)) type = "ws_key";
    accounts.push({ email, cred: password, type });
  }
  return accounts;
}

// ════════════════════════════════════════════════════════════════════════════
// §4  授权链 · Windsurf 3步 → devin-session-token$JWT
// ════════════════════════════════════════════════════════════════════════════

/**
 * Step1: email+password → auth1 token
 *   POST windsurf.com/_devin-auth/password/login
 *   body: { email, password } → { token, user_id }
 */
async function devinLogin(email, password) {
  const r = await jsonPost(
    URL_DEVIN_LOGIN,
    { Origin: WINDSURF, Referer: WINDSURF + "/account/login" },
    { email, password },
  );
  const j = r.json || {};
  if (j.token && j.user_id) {
    return { ok: true, auth1: j.token, userId: j.user_id };
  }
  const err = j.detail || j.error || j.message || "no_token";
  return { ok: false, status: r.status, error: String(err) };
}

/**
 * Step2: auth1 → devin-session-token$JWT
 *   POST windsurf.com/_backend/.../WindsurfPostAuth
 *   header: X-Devin-Auth1-Token
 *   body: { auth1_token } → { sessionToken }
 */
async function windsurfPostAuth(auth1) {
  const r = await jsonPost(
    URL_POSTAUTH,
    {
      Origin: WINDSURF,
      Referer: WINDSURF + "/profile",
      "Connect-Protocol-Version": "1",
      "X-Devin-Auth1-Token": auth1,
    },
    { auth1_token: auth1 },
  );
  const j = r.json || {};
  const st = j.sessionToken || "";
  if (typeof st === "string" && st.startsWith(TOKEN_PREFIX)) {
    return {
      ok: true,
      sessionToken: st,
      accountId: j.accountId || "",
      primaryOrgId: j.primaryOrgId || "",
    };
  }
  const err = j.error || j.code || j.message || "no_session";
  return { ok: false, status: r.status, error: String(err) };
}

/**
 * Step3 (可选): sessionToken → apiKey (用于WS直连)
 *   POST register.windsurf.com/.../RegisterUser
 *   body: { firebase_id_token: sessionToken } → { api_key }
 */
async function registerUser(sessionToken) {
  const r = await jsonPost(
    URL_REGISTER_USER,
    { "Connect-Protocol-Version": "1" },
    { firebase_id_token: sessionToken },
  );
  const j = r.json || {};
  const apiKey = j.api_key || j.apiKey;
  if (apiKey) {
    return {
      ok: true,
      apiKey,
      apiServerUrl: j.api_server_url || j.apiServerUrl || "",
    };
  }
  return { ok: false, error: j.code || j.message || "no_api_key" };
}

/**
 * 单账号全链路: email+password → sessionToken
 * 帛书·十六: 「知常容，容乃公」
 */
async function authAccount(acc) {
  let auth1 = null;
  let sessionToken = null;

  // 已有 session → 直接可用
  if (acc.type === "session") {
    return {
      ok: true,
      email: acc.email,
      sessionToken: acc.cred,
      type: "session",
    };
  }
  // 已有 WS key → 仅记录
  if (acc.type === "ws_key") {
    return {
      ok: true,
      email: acc.email,
      sessionToken: null,
      wsApiKey: acc.cred,
      type: "ws_key",
    };
  }

  // Step1: login (已有auth1则跳过)
  if (acc.type === "auth1") {
    auth1 = acc.cred;
  } else {
    const r1 = await devinLogin(acc.email, acc.cred);
    if (!r1.ok) {
      return { ok: false, email: acc.email, error: "login:" + r1.error };
    }
    auth1 = r1.auth1;
  }

  // Step2: postAuth → sessionToken
  const r2 = await windsurfPostAuth(auth1);
  if (!r2.ok) {
    return { ok: false, email: acc.email, error: "postauth:" + r2.error };
  }
  sessionToken = r2.sessionToken;

  return { ok: true, email: acc.email, sessionToken, type: acc.type };
}

// ════════════════════════════════════════════════════════════════════════════
// §5  Token池 · 批量授权 · 轮转 · 健康 · 重授权
// ════════════════════════════════════════════════════════════════════════════

const pool = {
  tokens: [], // [{email, sessionToken, status, lastUsed, useCount, exhaustedAt, authedAt}]
  idx: 0, // round-robin 索引
  authedAt: 0, // 上次批量授权时间
  totalAuthed: 0,
  totalFailed: 0,
};

/** 并发执行 */
async function runConcurrent(tasks, concurrency) {
  const results = [];
  const queue = [...tasks];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) {
        const result = await task();
        results.push(result);
        if (queue.length > 0 && STAGGER_MS > 0) {
          await new Promise((r) => setTimeout(r, STAGGER_MS));
        }
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/** 批量授权 · 读 accounts.md → 全量换票 */
async function bulkAuth() {
  log("═══ 批量授权开始 ═══");
  const accounts = parseAccounts(ACCOUNTS_FILE);
  if (accounts.length === 0) {
    log("✗ 无可用账号");
    return;
  }

  const types = { session: 0, auth1: 0, ws_key: 0, password: 0 };
  for (const a of accounts) types[a.type] = (types[a.type] || 0) + 1;
  log(
    `账号: ${accounts.length} 件 · password=${types.password} session=${types.session} auth1=${types.auth1} ws_key=${types.ws_key}`,
  );

  if (DRY_RUN) {
    log("DRY-RUN · 仅展账号 · 不真登");
    accounts
      .slice(0, 20)
      .forEach((a, i) =>
        log(
          `  [${String(i).padStart(3, "0")}] ${a.type.padEnd(8)} ${maskEmail(a.email)}`,
        ),
      );
    if (accounts.length > 20) log(`  ... +${accounts.length - 20} more`);
    return;
  }

  const t0 = Date.now();
  const tasks = accounts.map((acc) => () => authAccount(acc));
  const results = await runConcurrent(tasks, CONCURRENCY);

  const ok = results.filter((r) => r.ok && r.sessionToken);
  const fail = results.filter((r) => !r.ok);
  const dt = Date.now() - t0;

  // 更新池
  const newTokens = ok.map((r) => ({
    email: r.email,
    sessionToken: r.sessionToken,
    status: "healthy", // healthy | exhausted | error
    lastUsed: 0,
    useCount: 0,
    exhaustedAt: 0,
    authedAt: Date.now(),
  }));

  // 合并: 保留未过期的旧token, 加入新token
  const oldHealthy = pool.tokens.filter(
    (t) => t.status === "healthy" && t.sessionToken,
  );
  pool.tokens = [...oldHealthy, ...newTokens];
  pool.authedAt = Date.now();
  pool.totalAuthed += ok.length;
  pool.totalFailed += fail.length;
  pool.idx = 0;

  log(
    `═══ 授权完成 ═══ ${ok.length}✓ ${fail.length}✗ · ${dt}ms · 池=${pool.tokens.length}`,
  );
  if (fail.length > 0 && DEBUG) {
    fail
      .slice(0, 5)
      .forEach((r) => dbg(`  ✗ ${maskEmail(r.email)}: ${r.error}`));
  }
}

/** 选一个健康token · round-robin + 跳过exhausted */
function pickToken() {
  const healthy = pool.tokens.filter(
    (t) => t.status === "healthy" && t.sessionToken,
  );
  if (healthy.length === 0) return null;

  // 优先选 useCount 最低的 (最可能有余量) · 道法自然 · 弱者道之用
  healthy.sort((a, b) => (a.useCount || 0) - (b.useCount || 0));
  const token = healthy[0];

  token.lastUsed = Date.now();
  token.useCount++;
  return token;
}

/** 标记配额耗尽 */
function markExhausted(email) {
  const t = pool.tokens.find((t) => t.email === email);
  if (t) {
    t.status = "exhausted";
    t.exhaustedAt = Date.now();
    log(
      `⚡ 配额耗尽: ${maskEmail(email)} · 健康余=${pool.tokens.filter((t) => t.status === "healthy").length}`,
    );
  }
}

/** 标记错误 (非quota) */
function markError(email) {
  const t = pool.tokens.find((t) => t.email === email);
  if (t) {
    t.status = "error";
    log(`⚠ 请求错误: ${maskEmail(email)}`);
  }
}

/** 池健康概要 */
function poolHealth() {
  const healthy = pool.tokens.filter((t) => t.status === "healthy").length;
  const exhausted = pool.tokens.filter((t) => t.status === "exhausted").length;
  const error = pool.tokens.filter((t) => t.status === "error").length;
  return {
    total: pool.tokens.length,
    healthy,
    exhausted,
    error,
    authedAt: pool.authedAt ? new Date(pool.authedAt).toISOString() : null,
    totalAuthed: pool.totalAuthed,
    totalFailed: pool.totalFailed,
  };
}

/** 自动重授权 · 当健康token < 总数30% 或 距上次授权 > REAUTH_MIN */
async function maybeReauth() {
  const h = poolHealth();
  const needReauth =
    h.healthy < h.total * 0.3 ||
    (pool.authedAt > 0 && Date.now() - pool.authedAt > REAUTH_MIN * 60 * 1000);

  if (needReauth) {
    log("🔄 自动重授权触发 · healthy=" + h.healthy + "/" + h.total);
    await bulkAuth();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// §6  Devin Cloud wss ACP Chat · 完整协议
// ════════════════════════════════════════════════════════════════════════════

/** token → JWT (剥 devin-session-token$ 前缀) */
function tokenToJwt(t) {
  if (!t || typeof t !== "string") return "";
  return t.startsWith(TOKEN_PREFIX) ? t.slice(TOKEN_PREFIX.length) : t;
}

/** 构建 wss URL */
function buildWssUrl(apiKey) {
  const u = new URL(WSS_BASE);
  const jwt = tokenToJwt(apiKey);
  if (jwt) u.searchParams.set("token", jwt);
  return u.toString();
}

/** normalize messages (防 [object Object]) */
function _normalizeContent(c) {
  if (c == null) return "";
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((p) => {
        if (!p || typeof p !== "object") return String(p || "");
        if (p.type === "text" && typeof p.text === "string") return p.text;
        if (p.type === "image_url") return "[image]";
        if (p.type === "input_audio") return "[audio]";
        if (typeof p.text === "string") return p.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof c === "object" && typeof c.text === "string") return c.text;
  return String(c);
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((m) => {
      if (!m || typeof m !== "object") return null;
      return {
        role: typeof m.role === "string" ? m.role : "user",
        content: _normalizeContent(m.content),
      };
    })
    .filter(Boolean);
}

/** OpenAI messages → ACP prompt[] */
function messagesToPrompt(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [{ type: "text", text: "ok" }];
  }
  const normalized = normalizeMessages(messages);
  const systems = normalized
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .filter(Boolean);
  const turns = [];
  for (const m of normalized) {
    if (m.role === "system") continue;
    if (!m.content) continue;
    if (m.role === "user") turns.push("User: " + m.content);
    else if (m.role === "assistant") turns.push("Assistant: " + m.content);
    else turns.push(m.content);
  }
  let text = "";
  if (systems.length > 0) text += systems.join("\n\n") + "\n\n";
  if (turns.length > 0) text += turns.join("\n\n");
  if (!text) text = "ok";
  return [{ type: "text", text }];
}

/** extract delta from session/update */
function _extractUpType(update) {
  if (!update || typeof update !== "object") return null;
  if (typeof update.sessionUpdate === "string") return update.sessionUpdate;
  if (typeof update.type === "string") return update.type;
  for (const k of Object.keys(update)) {
    if (k.endsWith("_chunk") || k.endsWith("_update")) return k;
  }
  return null;
}

function extractDelta(update) {
  if (!update || typeof update !== "object") return null;
  const upType = _extractUpType(update);
  if (upType !== "agent_message_chunk") return null;
  const content = update.content;
  if (!content) return null;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => c && typeof c.text === "string")
      .map((c) => c.text)
      .join("");
  }
  if (typeof content === "object" && typeof content.text === "string")
    return content.text;
  return null;
}

/**
 * Devin Cloud wss 单笔 chat
 * 帛书·四十三: 「天下之至柔，驰骋于天下之致坚」
 *
 * @param {Object} state - { apiKey: devin-session-token$JWT, account: email }
 * @param {string} modelUid - 请求的模型名
 * @param {Array} messages - OpenAI messages
 * @param {Function} onDelta - (text) => void
 * @param {Object} opts - { timeoutMs?, signal? }
 * @returns {Promise<{text, tokens, model, durationMs, stopReason, _engine}>}
 */
async function devinCloudChat(state, modelUid, messages, onDelta, opts = {}) {
  if (!state || !state.apiKey || !state.apiKey.startsWith(TOKEN_PREFIX)) {
    throw new Error("需 devin-session-token$ 型 apiKey");
  }

  const timeoutMs = opts.timeoutMs || CHAT_TIMEOUT_MS;
  const t0 = Date.now();
  const wssUrl = buildWssUrl(state.apiKey);
  const targetVersion =
    MODEL_ROUTE_MAP[modelUid] ||
    (modelUid && /^devin-/.test(modelUid) ? modelUid : DEFAULT_DEVIN_VERSION);

  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WS(wssUrl);
    } catch (e) {
      reject(new Error("wss 建失: " + e.message));
      return;
    }

    let _closed = false;
    let _resolved = false;
    let initOk = false;
    let sessionId = null;
    let stopReason = null;
    let usage = null;
    let collectedText = "";
    let updateCount = 0;
    let firstChunkAt = null;
    let promptStartAt = 0;
    let lastChunkText = "";

    const cleanup = (err, result) => {
      if (_resolved) return;
      _resolved = true;
      if (!_closed) {
        try {
          ws.close(1000, "done");
        } catch {}
      }
      if (err) reject(err);
      else resolve(result);
    };

    const timer = setTimeout(() => {
      cleanup(
        new Error(
          `Devin Cloud 超时 ${timeoutMs}ms · sid=${sessionId || "?"} updates=${updateCount}`,
        ),
      );
    }, timeoutMs);

    if (opts.signal && typeof opts.signal.addEventListener === "function") {
      opts.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        cleanup(new Error("aborted"));
      });
    }

    const send = (obj) => {
      try {
        ws.send(JSON.stringify(obj));
      } catch {}
    };

    ws.onopen = () => {
      dbg("wss open · " + (Date.now() - t0) + "ms");
      send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: 1,
          clientCapabilities: {
            fs: { readTextFile: true, writeTextFile: true },
            terminal: true,
            elicitation: { form: {} },
            _meta: {
              "cognition.ai/subagentSupport": true,
              "cognition.ai/multiRootWorkspace": true,
              "cognition.ai/partialContent": true,
              "cognition.ai/messageGrouping": true,
              "cognition.ai/groupedSessionConfigOptions": true,
              "cognition.ai/revert": true,
              "cognition.ai/mcp": true,
              "cognition.ai/requestDiagnostics": true,
            },
          },
        },
      });
    };

    ws.onerror = (ev) => {
      clearTimeout(timer);
      const errMsg = ev?.message || ev?.error?.message || "(unknown)";
      dbg("wss onerror: " + errMsg);
      cleanup(new Error("wss error: " + errMsg));
    };

    ws.onclose = (ev) => {
      _closed = true;
      clearTimeout(timer);
      if (_resolved) return;
      const code = ev?.code || 0;
      const reason = (ev?.reason || "").slice(0, 200);
      dbg(
        `wss onclose · code=${code} reason="${reason}" updates=${updateCount} text=${collectedText.length}B stopReason=${stopReason || "(none)"}`,
      );
      if (collectedText && stopReason) {
        cleanup(null, {
          text: collectedText,
          tokens: usage?.totalTokens || 0,
          model: modelUid || "devin-cloud",
          durationMs: Date.now() - t0,
          stopReason,
          _engine: "devin-cloud",
        });
      } else {
        // 分类: code=1008 policy violation 通常=quota, 其他是连接问题
        const isQuota =
          code === 1008 ||
          reason.includes("quota") ||
          reason.includes("billing");
        cleanup(
          new Error(
            isQuota
              ? `quota_exceeded: wss closed · code=${code} reason="${reason}"`
              : `closed prematurely · code=${code} reason="${reason}" updates=${updateCount}`,
          ),
        );
      }
    };

    ws.onmessage = (ev) => {
      let raw = ev.data;
      if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString("utf8");
      if (Buffer.isBuffer(raw)) raw = raw.toString("utf8");
      if (typeof raw !== "string") return;
      for (const line of raw.split("\n").filter((x) => x.trim())) {
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        handleMsg(parsed);
      }
    };

    function handleMsg(msg) {
      // session/update notification
      if (msg.method === "session/update") {
        updateCount++;
        const update = msg.params?.update;
        const upType = _extractUpType(update);

        if (upType === "agent_message_chunk") {
          const delta = extractDelta(update);
          if (delta && delta !== lastChunkText) {
            lastChunkText = delta;
            if (!firstChunkAt) firstChunkAt = Date.now() - promptStartAt;
            collectedText += delta;
            try {
              if (typeof onDelta === "function") onDelta(delta);
            } catch {}
          }
        }
        if (update?.stopReason) stopReason = update.stopReason;
        if (update?.usage) usage = update.usage;
        return;
      }

      // Agent 权限请求 → 自动 granted
      if (msg.method === "session/request_permission") {
        if (msg.id !== undefined)
          send({ jsonrpc: "2.0", id: msg.id, result: { granted: true } });
        return;
      }
      if (msg.method === "ext/method") {
        if (msg.id !== undefined)
          send({ jsonrpc: "2.0", id: msg.id, result: {} });
        return;
      }

      const id = msg.id;

      // id=1: initialize 回复
      if (id === 1) {
        if (msg.error) {
          clearTimeout(timer);
          cleanup(new Error("initialize 失: " + msg.error.message));
          return;
        }
        initOk = true;
        const authMethods = msg.result?.authMethods?.map((a) => a.id) || [];
        dbg("initialize ok · authMethods=" + JSON.stringify(authMethods));

        if (authMethods.length > 0) {
          // 需 authenticate (stdio 路径 · 一般不走到)
          send({
            jsonrpc: "2.0",
            id: 2,
            method: "authenticate",
            params: {
              methodId: "windsurf-api-key",
              _meta: {
                api_key: state.apiKey,
                api_server_url: "https://server.self-serve.windsurf.com",
              },
            },
          });
        } else {
          sendSessionNew();
        }
        return;
      }

      // id=2: authenticate 回复
      if (id === 2) {
        if (msg.error) {
          clearTimeout(timer);
          cleanup(new Error("authenticate 失: " + msg.error.message));
          return;
        }
        sendSessionNew();
        return;
      }

      // id=3: session/new 回复
      if (id === 3) {
        if (msg.error) {
          clearTimeout(timer);
          const errMsg = msg.error.message || "";
          // 透传 quota/billing 错误码 · 让外层正确分类
          const code = msg.error.code;
          cleanup(
            new Error(
              errMsg.includes("out_of_quota") || errMsg.includes("billing")
                ? `quota_exceeded: session/new ${errMsg}`
                : `session/new 失 [${code}] ${errMsg}`,
            ),
          );
          return;
        }
        sessionId = msg.result?.sessionId;
        if (!sessionId) {
          clearTimeout(timer);
          cleanup(new Error("session/new 无 sessionId"));
          return;
        }
        dbg("session/new ok · sid=" + sessionId);

        // model routing: set_config_option
        const configOptions = msg.result?.configOptions || [];
        const verOpt = configOptions.find((o) => o.id === "devin_version");
        const currentVer = verOpt?.currentValue;
        if (targetVersion && targetVersion !== currentVer) {
          dbg(
            "model route: " +
              modelUid +
              " → " +
              targetVersion +
              " (was " +
              (currentVer || "?") +
              ")",
          );
          send({
            jsonrpc: "2.0",
            id: 10,
            method: "session/set_config_option",
            params: {
              sessionId,
              configId: "devin_version",
              value: targetVersion,
            },
          });
          return;
        }
        sendSessionPrompt();
        return;
      }

      // id=10: set_config_option 回复
      if (id === 10) {
        if (msg.error)
          dbg("set_config fail: " + msg.error.message + " · 继续默认");
        else dbg("set_config ok · target=" + targetVersion);
        sendSessionPrompt();
        return;
      }

      // id=4: session/prompt 回复
      if (id === 4) {
        if (msg.error) {
          clearTimeout(timer);
          const errMsg = msg.error.message || "";
          const code = msg.error.code;
          // 透传 quota/billing 错误码 · 让外层正确分类
          cleanup(
            new Error(
              errMsg.includes("out_of_quota") || errMsg.includes("billing")
                ? `quota_exceeded: session/prompt ${errMsg}`
                : `session/prompt 失 [${code}] ${errMsg}`,
            ),
          );
          return;
        }
        const result = msg.result || {};
        if (result.stopReason) stopReason = result.stopReason;
        if (result.usage) usage = result.usage;
        clearTimeout(timer);
        cleanup(null, {
          text: collectedText,
          tokens: usage?.totalTokens || 0,
          model: modelUid || "devin-cloud",
          durationMs: Date.now() - t0,
          stopReason,
          _engine: "devin-cloud",
          firstChunkMs: firstChunkAt,
          updateCount,
        });
        return;
      }
    }

    function sendSessionNew() {
      send({
        jsonrpc: "2.0",
        id: 3,
        method: "session/new",
        params: { cwd: process.cwd(), mcpServers: [] },
      });
    }

    function sendSessionPrompt() {
      promptStartAt = Date.now();
      send({
        jsonrpc: "2.0",
        id: 4,
        method: "session/prompt",
        params: { sessionId, prompt: messagesToPrompt(messages) },
      });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// §7  请求指标
// ════════════════════════════════════════════════════════════════════════════

const metrics = {
  startedAt: Date.now(),
  requests: 0,
  successes: 0,
  errors: 0,
  tokensRotated: 0,
  latencies: [], // 最近 200 笔
};

function metricsRecordReq() {
  metrics.requests++;
}
function metricsRecordSuccess(ms) {
  metrics.successes++;
  if (typeof ms === "number" && ms > 0) {
    metrics.latencies.push(ms);
    if (metrics.latencies.length > 200) metrics.latencies.shift();
  }
}
function metricsRecordError() {
  metrics.errors++;
}
function metricsRecordRotate() {
  metrics.tokensRotated++;
}

function metricsSnapshot() {
  const lats = metrics.latencies;
  const avg = lats.length
    ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length)
    : 0;
  const sorted = [...lats].sort((a, b) => a - b);
  const p50 = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0;
  const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
  return {
    uptimeSec: Math.floor((Date.now() - metrics.startedAt) / 1000),
    requests: metrics.requests,
    successes: metrics.successes,
    errors: metrics.errors,
    tokensRotated: metrics.tokensRotated,
    latency: { count: lats.length, avgMs: avg, p50Ms: p50, p95Ms: p95 },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// §8  HTTP 服务器 & 路由
// ════════════════════════════════════════════════════════════════════════════

/**
 * 处理 /v1/chat/completions
 * 帛书·七十八: 「天下莫柔弱于水，而攻坚强者莫之能胜也」
 *
 * 策略:
 *   1. 从池中选健康token
 *   2. 调 devinCloudChat
 *   3. quota耗尽 → markExhausted → 换token重试 (最多 MAX_RETRIES)
 *   4. 全部耗尽 → 触发重授权 → 再试
 */
async function handleChatCompletions(req, res, body) {
  let parsed;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return jsonRes(res, 400, { error: { message: "invalid JSON" } });
  }

  const model = parsed.model || "devin-cloud";
  const messages = parsed.messages || [];
  const stream = parsed.stream === true;

  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonRes(res, 400, { error: { message: "messages required" } });
  }

  metricsRecordReq();

  // 最多重试 MAX_RETRIES 次 (每次换token)
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const token = pickToken();
    if (!token) {
      // 池空 → 尝试重授权
      log("🔄 池空 · 触发重授权");
      await maybeReauth();
      const retryToken = pickToken();
      if (!retryToken) {
        return jsonRes(res, 503, {
          error: {
            message: "no healthy tokens available",
            type: "server_error",
          },
        });
      }
      // 用重授权后的token继续
      return await _doChat(retryToken, model, messages, stream, req, res);
    }

    try {
      return await _doChat(token, model, messages, stream, req, res);
    } catch (e) {
      const msg = e.message || "";
      metricsRecordError();
      dbg(`chat error attempt=${attempt + 1}: ${msg.slice(0, 200)}`);

      // 如果 headers 已发送 (流式响应中途失败), 不能重试, 直接结束
      if (res.headersSent) {
        log(`⚠ headers已发 · 无法重试 · ${msg.slice(0, 80)}`);
        if (!res.writableEnded) {
          try {
            res.end();
          } catch {}
        }
        return;
      }
      // 真配额耗尽 → 短暂冷却 (5min) + 换号
      if (
        msg.includes("out_of_quota") ||
        msg.includes("billing error") ||
        msg.includes("quota_exceeded")
      ) {
        // 冷却5分钟而非永久标记 (配额可能按日/时刷新)
        token.status = "exhausted";
        token.exhaustedAt = Date.now();
        metricsRecordRotate();
        log(`⚡ 配额耗尽 · ${maskEmail(token.email)} → 冷却5min + 换号`);
        continue;
      }

      // rate_limit → 标记exhausted (可能短期恢复)
      if (msg.includes("rate_limit") || msg.includes("429")) {
        markExhausted(token.email);
        metricsRecordRotate();
        log(`⚡ 限流 · ${maskEmail(token.email)} → 换号`);
        continue;
      }

      // wss 连接性错误 → 短暂冷却 + 换号重试
      if (
        msg.includes("closed prematurely") ||
        msg.includes("wss error") ||
        msg.includes("wss 建失") ||
        msg.includes("initialize 失") ||
        msg.includes("session/new 失") ||
        msg.includes("session/prompt 失") ||
        msg.includes("authenticate 失") ||
        msg.includes("timeout") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("ECONNRESET")
      ) {
        // timeout → 冷却2min (防止同一超时token无限重试)
        if (msg.includes("timeout")) {
          token.status = "exhausted";
          token.exhaustedAt = Date.now() - 3 * 60 * 1000; // 冷却2min后恢复 (设为3min前)
          log(`⏱ 超时冷却 · ${maskEmail(token.email)} → 2min后恢复 · 换号`);
        } else {
          token.status = "healthy"; // 其他连接错误可能是临时的
          log(
            `⚠ 连接错误 · ${maskEmail(token.email)} → 换号重试 · ${msg.slice(0, 80)}`,
          );
        }
        metricsRecordRotate();
        continue;
      }

      // 未知错误 → 标记error + 换号
      markError(token.email);
      metricsRecordRotate();
      log(`⚠ 未知错误 · ${maskEmail(token.email)}: ${msg.slice(0, 100)}`);
      if (attempt >= MAX_RETRIES - 1) {
        return jsonRes(res, 502, {
          error: { message: "upstream error: " + msg, type: "upstream_error" },
        });
      }
    }
  }

  // 全部重试失败
  jsonRes(res, 503, {
    error: { message: "all tokens exhausted", type: "server_error" },
  });
}

/** 实际执行 chat (stream 或 non-stream) */
async function _doChat(token, model, messages, stream, req, res) {
  const t0 = Date.now();
  const chatId = "chatcmpl-" + crypto.randomBytes(12).toString("hex");
  const created = Math.floor(Date.now() / 1000);
  dbg(
    `_doChat · email=${maskEmail(token.email)} · hasST=${!!token.sessionToken} · stPrefix=${token.sessionToken?.slice(0, 24)}... · model=${model}`,
  );

  if (stream) {
    // SSE 流式 · 延迟 writeHead (收到首个 delta 才写, 允许 quota 错误时重试)
    let headersWritten = false;
    const _ensureHeaders = () => {
      if (!headersWritten) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "X-Accel-Buffering": "no",
        });
        headersWritten = true;
      }
    };

    let fullText = "";
    let stopReason = "end_turn";

    try {
      const result = await devinCloudChat(
        { apiKey: token.sessionToken, account: token.email },
        model,
        messages,
        (delta) => {
          _ensureHeaders();
          fullText += delta;
          sseWrite(res, {
            id: chatId,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                index: 0,
                delta: { content: delta },
                finish_reason: null,
              },
            ],
          });
        },
        { timeoutMs: CHAT_TIMEOUT_MS },
      );

      // 发 finish chunk
      _ensureHeaders();
      stopReason = _mapStopReason(result.stopReason);
      sseWrite(res, {
        id: chatId,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: stopReason,
          },
        ],
      });
      sseDone(res);
      res.end();

      const dt = Date.now() - t0;
      metricsRecordSuccess(dt);
      log(
        `✓ chat · ${maskEmail(token.email)} · model=${model} · ${fullText.length}B · ${dt}ms`,
      );
    } catch (e) {
      // 如果 headers 未写 (quota 错误在首个 delta 前), 直接抛出让外层重试
      if (!headersWritten) {
        throw e;
      }
      // headers 已写 · 只能 SSE 错误 + 关闭
      try {
        sseWrite(res, {
          id: chatId,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta: {
                content:
                  "\n[ERROR: " + (e.message || "unknown").slice(0, 100) + "]",
              },
              finish_reason: "error",
            },
          ],
        });
        sseDone(res);
      } catch {}
      try {
        res.end();
      } catch {}
      throw e; // 向上抛 · 让外层 retry
    }
  } else {
    // Non-stream
    let fullText = "";
    const result = await devinCloudChat(
      { apiKey: token.sessionToken, account: token.email },
      model,
      messages,
      (delta) => {
        fullText += delta;
      },
      { timeoutMs: CHAT_TIMEOUT_MS },
    );

    const dt = Date.now() - t0;
    metricsRecordSuccess(dt);
    log(
      `✓ chat · ${maskEmail(token.email)} · model=${model} · ${fullText.length}B · ${dt}ms`,
    );

    jsonRes(res, 200, {
      id: chatId,
      object: "chat.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: fullText },
          finish_reason: _mapStopReason(result.stopReason),
        },
      ],
      usage: {
        prompt_tokens: 0,
        completion_tokens: result.tokens || 0,
        total_tokens: result.tokens || 0,
      },
    });
  }
}

function _mapStopReason(fr) {
  switch (fr) {
    case "end_turn":
    case "stop":
      return "stop";
    case "max_tokens":
    case "length":
      return "length";
    case "refusal":
    case "error":
    case "content_filter":
      return "content_filter";
    default:
      return "stop";
  }
}

/** /v1/models */
function handleModels(req, res) {
  const data = MODEL_CATALOG.map((m) => ({
    id: m.id,
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: m.vendor,
  }));
  jsonRes(res, 200, { object: "list", data });
}

/** /admin/health */
function handleHealth(req, res) {
  const h = poolHealth();
  const m = metricsSnapshot();
  jsonRes(res, 200, {
    status: h.healthy > 0 ? "ok" : "degraded",
    pool: h,
    metrics: m,
    node: process.version,
    pid: process.pid,
  });
}

/** /admin/pool */
function handlePool(req, res) {
  const h = poolHealth();
  const tokens = pool.tokens.map((t) => ({
    email: maskEmail(t.email),
    status: t.status,
    useCount: t.useCount,
    stPrefix: t.sessionToken ? t.sessionToken.slice(0, 24) + "..." : "(none)",
    lastUsed: t.lastUsed ? new Date(t.lastUsed).toISOString() : null,
    exhaustedAt: t.exhaustedAt ? new Date(t.exhaustedAt).toISOString() : null,
    authedAt: t.authedAt ? new Date(t.authedAt).toISOString() : null,
  }));
  jsonRes(res, 200, { summary: h, tokens });
}

/** /admin/reauth */
async function handleReauth(req, res) {
  log("🔄 手动触发重授权");
  try {
    await bulkAuth();
    jsonRes(res, 200, { ok: true, pool: poolHealth() });
  } catch (e) {
    jsonRes(res, 500, { ok: false, error: e.message });
  }
}

/** /admin/metrics */
function handleMetrics(req, res) {
  jsonRes(res, 200, metricsSnapshot());
}

/** /admin/selftest — 串行自测所有模型 */
async function handleSelftest(req, res) {
  const testModels = [
    "devin-opus-4-8",
    "devin-opus-4-7",
    "devin-fast-opus",
    "devin-gpt-5-5",
    "devin-2-5",
    "devin-cloud",
    "claude-opus-4-8",
  ];
  const results = [];

  try {
    for (const m of testModels) {
      const t0 = Date.now();
      try {
        const token = pickToken();
        if (!token) {
          results.push({
            model: m,
            status: "skip",
            error: "no_healthy_token",
            ms: Date.now() - t0,
          });
          continue;
        }
        const result = await devinCloudChat(
          { apiKey: token.sessionToken, account: token.email },
          m,
          [{ role: "user", content: "Say OK" }],
          () => {},
          { timeoutMs: 60000 },
        );
        const dt = Date.now() - t0;
        results.push({
          model: m,
          status: "ok",
          content: (result.text || "").slice(0, 80),
          stopReason: result.stopReason,
          ms: dt,
        });
        log(
          `✓ selftest ${m}: ${dt}ms content=${(result.text || "").slice(0, 40)}`,
        );
      } catch (e) {
        const dt = Date.now() - t0;
        const msg = (e.message || "").slice(0, 100);
        results.push({ model: m, status: "fail", error: msg, ms: dt });
        log(`✗ selftest ${m}: ${dt}ms err=${msg.slice(0, 60)}`);
        if (
          msg.includes("out_of_quota") ||
          msg.includes("billing") ||
          msg.includes("quota_exceeded")
        ) {
          const lastToken = pool.tokens.find(
            (t) => t.status === "healthy" && t.useCount > 0,
          );
          if (lastToken) {
            lastToken.status = "exhausted";
            lastToken.exhaustedAt = Date.now();
          }
        }
      }
    }

    const ok = results.filter((r) => r.status === "ok").length;
    const fail = results.filter((r) => r.status === "fail").length;
    const skip = results.filter((r) => r.status === "skip").length;
    jsonRes(res, 200, {
      summary: { total: results.length, ok, fail, skip },
      pool: poolHealth(),
      results,
    });
  } catch (e) {
    log("⚠ selftest 顶层错误: " + (e.message || e));
    if (!res.headersSent) {
      jsonRes(res, 500, { error: e.message, results });
    }
  }
}

/** 主路由 */
async function handleRequest(req, res) {
  const urlObj = new URL(req.url, "http://localhost");
  const pathname = urlObj.pathname;
  const method = req.method;

  // CORS
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }

  // ── 路由分发 ──
  // POST /v1/chat/completions
  // GET / — 前端控制台 (dao_web.html)
  if (
    method === "GET" &&
    (pathname === "/" ||
      pathname === "/index.html" ||
      pathname === "/dao_web.html")
  ) {
    const htmlPath = path.join(__dirname, "dao_web.html");
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, "utf8");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      });
      return res.end(html);
    }
    return jsonRes(res, 404, { error: { message: "dao_web.html not found" } });
  }

  if (method === "POST" && pathname === "/v1/chat/completions") {
    const body = await readBody(req);
    return await handleChatCompletions(req, res, body);
  }

  // GET /v1/models
  if (method === "GET" && pathname === "/v1/models") {
    return handleModels(req, res);
  }

  // GET /admin/health
  if (method === "GET" && pathname === "/admin/health") {
    return handleHealth(req, res);
  }

  // GET /admin/pool
  if (method === "GET" && pathname === "/admin/pool") {
    return handlePool(req, res);
  }

  // POST /admin/reauth
  if (method === "POST" && pathname === "/admin/reauth") {
    return await handleReauth(req, res);
  }

  // GET /admin/metrics
  if (method === "GET" && pathname === "/admin/metrics") {
    return handleMetrics(req, res);
  }

  // GET /admin/selftest — 自测所有模型 (串行·内部调用)
  if (method === "GET" && pathname === "/admin/selftest") {
    return await handleSelftest(req, res);
  }

  // 404
  jsonRes(res, 404, { error: { message: "not found: " + pathname } });
}

// ════════════════════════════════════════════════════════════════════════════
// §9  主入口 · 启动 · 监听 · 定期重授权
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("");
  console.log(
    "\x1b[35m╔══════════════════════════════════════════════════════════════════╗\x1b[0m",
  );
  console.log(
    "\x1b[35m║  dao_devindao.js · 道·Devin道 · 全链路反代 · 无为而无不为        ║\x1b[0m",
  );
  console.log(
    "\x1b[35m╚══════════════════════════════════════════════════════════════════╝\x1b[0m",
  );
  console.log("");
  log("Node " + process.version + " · pid=" + process.pid);
  log("端口: " + PORT + " · 账号: " + ACCOUNTS_FILE);
  log(
    "并发: " +
      CONCURRENCY +
      " · 重授权: " +
      REAUTH_MIN +
      "min · 超时: " +
      CHAT_TIMEOUT_MS +
      "ms",
  );

  // ── Step1: 读账号 ──
  const accounts = parseAccounts(ACCOUNTS_FILE);
  log("账号文件: " + accounts.length + " 件");

  if (accounts.length === 0 && !NO_AUTH) {
    log("✗ 无账号 · 退出");
    process.exit(1);
  }

  // ── Step2: 批量授权 ──
  if (!NO_AUTH) {
    await bulkAuth();
    if (DRY_RUN) process.exit(0);
  } else {
    log("跳过授权 (--no-auth) · 池空 · 须通过 /admin/reauth 触发");
  }

  // ── Step3: 启动 HTTP 服务器 ──
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((e) => {
      log("handleRequest unhandled:", e.message);
      if (!res.headersSent) {
        jsonRes(res, 500, { error: { message: "internal error" } });
      }
    });
  });

  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      log("✗ 端口 " + PORT + " 已占用 · 请先关闭占用进程或换端口 (--port)");
      log("  提示: netstat -ano | findstr :" + PORT);
    } else {
      log("✗ 服务器错误:", e.message);
    }
    process.exit(1);
  });
  server.listen(PORT, "0.0.0.0", () => {
    log("═══ 道·Devin道 已就绪 ═══");
    log("  OpenAI:  http://127.0.0.1:" + PORT + "/v1/chat/completions");
    log("  Models:  http://127.0.0.1:" + PORT + "/v1/models");
    log("  Health:  http://127.0.0.1:" + PORT + "/admin/health");
    log("  Pool:    http://127.0.0.1:" + PORT + "/admin/pool");
    log("  Reauth:  POST http://127.0.0.1:" + PORT + "/admin/reauth");
    log("  Metrics: http://127.0.0.1:" + PORT + "/admin/metrics");
    log("");
    log(
      "  池: " +
        pool.tokens.length +
        " token · " +
        poolHealth().healthy +
        " 健康",
    );
    log("");
    log("  帛书·四十八: 「无为而无不为」");
    log("  阴符经: 「观天之道，执天之行，尽矣」");
    console.log("");
  });

  // ── Step4: 定期重授权 ──
  // 帛书·十六: 「知常曰明 · 不知常 · 亡亡作凶」
  const reauthInterval = setInterval(
    async () => {
      try {
        await maybeReauth();
      } catch (e) {
        log("重授权异常:", e.message);
      }
    },
    REAUTH_MIN * 60 * 1000,
  );

  // ── Step5: 定期恢复 exhausted token (每3分钟检查) ──
  // 帛书·五十八: 「祸，福之所倚；福，祸之所伏」
  const EXHAUSTED_COOLDOWN_MS = 5 * 60 * 1000; // 5分钟冷却后恢复
  const recoverInterval = setInterval(
    () => {
      const now = Date.now();
      let recovered = 0;
      for (const t of pool.tokens) {
        if (
          t.status === "exhausted" &&
          t.exhaustedAt &&
          now - t.exhaustedAt > EXHAUSTED_COOLDOWN_MS
        ) {
          t.status = "healthy";
          t.exhaustedAt = 0;
          recovered++;
        }
      }
      if (recovered > 0) {
        log("🔄 恢复 " + recovered + " 个exhausted token (冷却期过)");
      }
    },
    3 * 60 * 1000,
  );

  // ── 优雅退出 ──
  function shutdown() {
    log("SIGTERM/SIGINT · 优雅退出");
    clearInterval(reauthInterval);
    clearInterval(recoverInterval);
    server.close(() => {
      log("服务器已关闭");
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // 帛书·十六: 「致虚极也 · 守情表也」— 守住不退
  process.on("uncaughtException", (e) => {
    log("⚠ uncaughtException (不退出):", (e && e.message) || e);
    // 不退出 · 道法自然 · 错误是暂时的
  });
  process.on("unhandledRejection", (reason) => {
    log(
      "⚠ unhandledRejection (不退出):",
      reason && reason.message ? reason.message : String(reason).slice(0, 200),
    );
    // 不退出 · 帛书·五十八: 祸福相依
  });
}

// ── 启动 ──
main().catch((e) => {
  log("Fatal:", e.message);
  process.exit(1);
});
