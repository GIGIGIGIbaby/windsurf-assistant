#!/usr/bin/env node
/**
 * dao_proxy.js · 道 · 万法归宗 · 独立代理服务器
 * ══════════════════════════════════════════════════════════════════════
 *
 *   「反也者，道之动也；弱也者，道之用也。」── 帛书四十
 *   「损之又损，以至于无为，无为而无不为。」── 帛书四十八
 *   「天下之至柔，驰骋于天下之致坚；无有入于无间。」── 帛书四十三
 *
 * ── 底层目标 ───────────────────────────────────────────────────────────
 *
 *   用户输入 Windsurf 账号 → 全自动 → 获得 OpenAI 兼容 API
 *   GitHub Actions 即是云端 VM · 无需任何中心化服务器
 *
 * ── 运行模式 ───────────────────────────────────────────────────────────
 *
 *   node dao_proxy.js setup    → Step1: 认证 + 写入 Gist (GitHub Actions)
 *   node dao_proxy.js proxy    → Step2: 启动代理 + Cloudflare 隧道 (长期运行)
 *   node dao_proxy.js local    → 本地模式: 直接启动 (需 DAO_JWT 或 DAO_ACCOUNTS)
 *   node dao_proxy.js status   → 查看当前 Gist 状态
 *
 * ── 环境变量 ───────────────────────────────────────────────────────────
 *
 *   DAO_ACCOUNTS     "email:password" 或 "e1:p1,e2:p2"
 *   DAO_JWT          sk-ws-01-... (已有则跳过认证)
 *   DAO_API_SERVER   https://server.self-serve.windsurf.com (可选)
 *   GITHUB_TOKEN     GitHub token (写 Gist/Secrets 用)
 *   DAO_GIST_ID      Gist ID (状态存储)
 *   GITHUB_REPOSITORY  owner/repo (Actions 自动提供)
 *   HUB_PORT         代理端口 (默认 7799)
 *
 * ══════════════════════════════════════════════════════════════════════
 */
"use strict";

const https = require("https");
const http = require("http");
const tls = require("tls");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { URL } = require("url");
const { execSync, spawn } = require("child_process");

const VERSION = "4.0.0";
const SEAL =
  "道 · 万法归宗 · 三背反代 · Windsurf + GH Models + Devin Cloud · 永久免费";

// ══════════════════════════════════════════════════════════════════════
// §0 · 终端着色工具
// ══════════════════════════════════════════════════════════════════════

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};
const ts = () => new Date().toISOString().slice(11, 19);
const log = (tag, msg) =>
  console.log(`${C.dim}[${ts()}]${C.reset} ${C.cyan}[${tag}]${C.reset} ${msg}`);
const ok = (tag, msg) =>
  console.log(
    `${C.dim}[${ts()}]${C.reset} ${C.green}[✓${tag}]${C.reset} ${msg}`,
  );
const fail = (tag, msg) =>
  console.log(`${C.dim}[${ts()}]${C.reset} ${C.red}[✗${tag}]${C.reset} ${msg}`);
const warn = (tag, msg) =>
  console.log(
    `${C.dim}[${ts()}]${C.reset} ${C.yellow}[!${tag}]${C.reset} ${msg}`,
  );
const mask = (s) =>
  !s || s.length < 12 ? "***" : s.slice(0, 8) + "..." + s.slice(-4);

// ══════════════════════════════════════════════════════════════════════
// §1 · HTTP 工具 (零外部依赖)
// ══════════════════════════════════════════════════════════════════════

function httpReq(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === "https:" ? https : http;
    const body = opts.body
      ? typeof opts.body === "string"
        ? opts.body
        : JSON.stringify(opts.body)
      : null;
    const hdrs = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0",
      ...(opts.headers || {}),
    };
    if (body && !hdrs["Content-Type"])
      hdrs["Content-Type"] = "application/json";
    if (body) hdrs["Content-Length"] = Buffer.byteLength(body);

    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + (u.search || ""),
        method: opts.method || (body ? "POST" : "GET"),
        headers: hdrs,
        timeout: opts.timeout || 25000,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const data = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, data, json });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`timeout: ${urlStr}`));
    });
    if (body) req.write(body);
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════════════
// §2 · Protobuf 编解码 (零依赖 · 精简版 · 已验证)
// ══════════════════════════════════════════════════════════════════════

function encVarint(v) {
  const b = [];
  let n = v < 0 ? 0 : v;
  do {
    b.push((n & 0x7f) | (n > 127 ? 0x80 : 0));
    n >>>= 7;
  } while (n > 0);
  return Buffer.from(b);
}
function encStr(fn, s) {
  const b = Buffer.from(s, "utf8");
  return Buffer.concat([encVarint((fn << 3) | 2), encVarint(b.length), b]);
}
function encMsg(fn, parts) {
  const inner = Buffer.concat(parts);
  return Buffer.concat([
    encVarint((fn << 3) | 2),
    encVarint(inner.length),
    inner,
  ]);
}
function encVarField(fn, v) {
  return Buffer.concat([encVarint((fn << 3) | 0), encVarint(v)]);
}

// Connect-RPC 帧封装 (server-streaming RPC 请求需要 envelope framing)
function connectFrame(protobufBody, flags = 0x00) {
  const header = Buffer.alloc(5);
  header[0] = flags;
  header.writeUInt32BE(protobufBody.length, 1);
  return Buffer.concat([header, protobufBody]);
}

// Connect-RPC 帧解析器 (流式输入 → 解析后的帧)
class ConnectFrameParser {
  constructor() {
    this.buf = Buffer.alloc(0);
  }
  push(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    const frames = [];
    while (this.buf.length >= 5) {
      const flags = this.buf[0];
      const len = this.buf.readUInt32BE(1);
      if (this.buf.length < 5 + len) break;
      frames.push({ flags, payload: this.buf.slice(5, 5 + len) });
      this.buf = this.buf.slice(5 + len);
    }
    return frames;
  }
}

// 解析 protobuf 消息为字段映射 (完整版，支持多值)
function parseProto(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const fields = {};
  let pos = 0;
  while (pos < bytes.length) {
    let r = 0,
      s = 0,
      p = pos;
    while (p < bytes.length) {
      const b = bytes[p++];
      r |= (b & 0x7f) << s;
      s += 7;
      if (!(b & 0x80)) break;
    }
    if (p === pos || r === 0) break;
    pos = p;
    const fn = r >>> 3,
      wt = r & 7;
    if (!fn || fn > 5000) break;
    if (!fields[fn]) fields[fn] = [];
    if (wt === 0) {
      r = 0;
      s = 0;
      while (pos < bytes.length) {
        const b = bytes[pos++];
        r |= (b & 0x7f) << s;
        s += 7;
        if (!(b & 0x80)) break;
      }
      fields[fn].push({ wire: 0, value: r });
    } else if (wt === 2) {
      r = 0;
      s = 0;
      p = pos;
      while (p < bytes.length) {
        const b = bytes[p++];
        r |= (b & 0x7f) << s;
        s += 7;
        if (!(b & 0x80)) break;
      }
      pos = p;
      if (r >= 0 && pos + r <= bytes.length) {
        fields[fn].push({ wire: 2, bytes: bytes.slice(pos, pos + r), len: r });
        pos += r;
      } else break;
    } else if (wt === 1) {
      if (pos + 8 <= bytes.length) {
        fields[fn].push({ wire: 1, bytes: bytes.slice(pos, pos + 8) });
        pos += 8;
      } else break;
    } else if (wt === 5) {
      if (pos + 4 <= bytes.length) {
        fields[fn].push({ wire: 5, bytes: bytes.slice(pos, pos + 4) });
        pos += 4;
      } else break;
    } else break;
  }
  return fields;
}

function connectRPC(host, rpcPath, body, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect(
      { host, port: 443, servername: host, rejectUnauthorized: false },
      () => {
        const req = [
          `POST ${rpcPath} HTTP/1.1`,
          `Host: ${host}`,
          `Content-Type: application/proto`,
          `connect-protocol-version: 1`,
          `Content-Length: ${body.length}`,
          `Connection: close`,
          "",
          "",
        ].join("\r\n");
        sock.write(req);
        sock.write(body);
      },
    );
    const chunks = [];
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error("rpc timeout"));
    }, timeout);
    sock.on("data", (c) => chunks.push(c));
    sock.on("end", () => {
      clearTimeout(timer);
      const raw = Buffer.concat(chunks);
      const idx = raw.indexOf("\r\n\r\n");
      if (idx < 0) return reject(new Error("no HTTP header"));
      const hdr = raw.slice(0, idx).toString();
      let b = raw.slice(idx + 4);
      if (/transfer-encoding:\s*chunked/i.test(hdr)) {
        const parts = [];
        let pp = 0;
        while (pp < b.length) {
          const le = b.indexOf(Buffer.from("\r\n"), pp);
          if (le < 0) break;
          const sz = parseInt(b.slice(pp, le).toString().trim(), 16);
          if (isNaN(sz) || sz === 0) break;
          pp = le + 2;
          parts.push(b.slice(pp, pp + sz));
          pp += sz + 2;
        }
        b = Buffer.concat(parts);
      }
      const m = hdr.match(/HTTP\/\S+ (\d+)/);
      resolve({ status: parseInt((m || [])[1] || "0"), body: b });
    });
    sock.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function parseProtoStr(buf, fieldNum) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let pos = 0;
  while (pos < bytes.length) {
    let r = 0,
      s = 0,
      p = pos;
    while (p < bytes.length) {
      const byte = bytes[p++];
      r |= (byte & 0x7f) << s;
      s += 7;
      if (!(byte & 0x80)) break;
    }
    if (p === pos || r === 0) break;
    pos = p;
    const fn = r >>> 3,
      wt = r & 7;
    if (!fn || fn > 2000) break;
    if (wt === 0) {
      r = 0;
      s = 0;
      while (pos < bytes.length) {
        const byte = bytes[pos++];
        r |= (byte & 0x7f) << s;
        s += 7;
        if (!(byte & 0x80)) break;
      }
    } else if (wt === 2) {
      r = 0;
      s = 0;
      p = pos;
      while (p < bytes.length) {
        const byte = bytes[p++];
        r |= (byte & 0x7f) << s;
        s += 7;
        if (!(byte & 0x80)) break;
      }
      pos = p;
      if (fn === fieldNum && r > 0 && pos + r <= bytes.length) {
        return Buffer.from(bytes.slice(pos, pos + r)).toString("utf8");
      }
      pos += r;
    } else if (wt === 1) {
      pos += 8;
    } else if (wt === 5) {
      pos += 4;
    } else break;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// §3 · Windsurf 四步链认证 (印215 · 已验证 · 毫秒级)
// ══════════════════════════════════════════════════════════════════════

const WS_BASE = "https://windsurf.com";
const URL_LOGIN = WS_BASE + "/_devin-auth/password/login";
const URL_POST =
  WS_BASE +
  "/_backend/exa.seat_management_pb.SeatManagementService/WindsurfPostAuth";
const SVC_SEAT = "/exa.seat_management_pb.SeatManagementService";
const API_SERVER = "server.self-serve.windsurf.com";

// ── chat/推理 (实证 2026-05-14 · 印105) ──────────────────────────────
const WS_CHAT_PATH = "/exa.api_server_pb.ApiServerService/GetChatMessage";
const WS_CHAT_HOSTS = [
  "server.codeium.com",
  "server.self-serve.windsurf.com",
  "web-backend.windsurf.com",
];

async function windsurfAuth(email, password) {
  const t0 = Date.now();
  log("AUTH", `Step 1/4 Login ${mask(email)} ...`);
  const r1 = await httpReq(URL_LOGIN, {
    body: { email, password },
    headers: { Origin: WS_BASE, Referer: WS_BASE + "/account/login" },
  });
  if (!r1.json?.token)
    throw new Error(
      `Auth Step1 failed (${r1.status}): ${(r1.data || "").slice(0, 200)}`,
    );
  const auth1Token = r1.json.token;
  ok("AUTH", `Step 1 OK (${Date.now() - t0}ms) auth1=${mask(auth1Token)}`);

  log("AUTH", "Step 2/4 PostAuth → session token ...");
  const r2 = await httpReq(URL_POST, {
    headers: {
      "X-Devin-Auth1-Token": auth1Token,
      Origin: WS_BASE,
      Referer: WS_BASE + "/profile",
    },
    body: { auth1_token: auth1Token },
  });
  const sessionToken = r2.json?.sessionToken;
  if (!sessionToken?.startsWith("devin-session-token$"))
    throw new Error(
      `Auth Step2 failed (${r2.status}): ${(r2.data || "").slice(0, 200)}`,
    );
  ok("AUTH", `Step 2 OK session=${mask(sessionToken)}`);

  log("AUTH", "Step 3/4 RegisterUser → sk-ws- ...");
  let apiKey = sessionToken;
  let apiServerUrl = `https://${API_SERVER}`;
  const regBody = encStr(1, sessionToken);
  for (const host of ["register.windsurf.com", "server.codeium.com"]) {
    try {
      const r3 = await connectRPC(host, `${SVC_SEAT}/RegisterUser`, regBody);
      if (r3.status === 200 && r3.body?.length > 10) {
        const ak = parseProtoStr(r3.body, 1);
        if (
          ak?.startsWith("sk-ws-") ||
          ak?.startsWith("devin-session-token$")
        ) {
          apiKey = ak;
          apiServerUrl = `https://${host === "register.windsurf.com" ? API_SERVER : host}`;
          ok("AUTH", `Step 3 OK key=${mask(ak)} via ${host}`);
          break;
        }
      }
    } catch (e) {
      warn("AUTH", `Step3 ${host}: ${e.message}`);
    }
  }

  log("AUTH", "Step 4/4 GetPlanStatusList ...");
  try {
    const r4 = await connectRPC(
      API_SERVER,
      `${SVC_SEAT}/GetPlanStatusList`,
      encStr(1, apiKey),
    );
    if (r4.status === 200) ok("AUTH", "Step 4 OK quota fetched");
  } catch (e) {
    warn("AUTH", `Step4: ${e.message}`);
  }

  ok("AUTH", `完成 · 共 ${Date.now() - t0}ms · key=${mask(apiKey)}`);
  return { apiKey, sessionToken, apiServerUrl, email };
}

async function resolveAuth() {
  // 优先已有 JWT
  if (process.env.DAO_JWT?.startsWith("sk-ws-")) {
    return {
      apiKey: process.env.DAO_JWT,
      apiServerUrl: process.env.DAO_API_SERVER || `https://${API_SERVER}`,
      source: "env:DAO_JWT",
    };
  }
  if (process.env.DAO_JWT?.startsWith("devin-session-token$")) {
    return {
      apiKey: process.env.DAO_JWT,
      sessionToken: process.env.DAO_JWT,
      apiServerUrl: `https://${API_SERVER}`,
      source: "env:session",
    };
  }
  // 从 DAO_ACCOUNTS 认证
  const accounts = process.env.DAO_ACCOUNTS;
  if (!accounts) throw new Error("需要 DAO_JWT 或 DAO_ACCOUNTS");
  const pairs = accounts
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  let lastErr = null;
  for (const pair of pairs) {
    const [email, ...rest] = pair.split(":");
    const password = rest.join(":");
    if (!email || !password) continue;
    try {
      const cred = await windsurfAuth(email, password);
      return { ...cred, source: "auth:windsurf" };
    } catch (e) {
      lastErr = e;
      warn("AUTH", `账号 ${mask(email)} 失败: ${e.message}`);
    }
  }
  throw lastErr || new Error("所有账号认证失败");
}

// ══════════════════════════════════════════════════════════════════════
// §4 · GitHub API (Gist + Secrets 持久化)
// ══════════════════════════════════════════════════════════════════════

const GH_API = "https://api.github.com";
const GH_HDR = (tok) => ({
  Authorization: `Bearer ${tok}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "dao-proxy/2.0",
});

async function ghApi(tok, method, apiPath, body) {
  return httpReq(GH_API + apiPath, {
    method,
    headers: GH_HDR(tok),
    body: body || undefined,
    timeout: 15000,
  });
}

async function gistRead(gistId, tok) {
  const r = await ghApi(tok, "GET", `/gists/${gistId}`);
  if (r.status !== 200) throw new Error(`gistRead ${r.status}`);
  const files = r.json?.files || {};
  const content = Object.values(files)[0]?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function gistWrite(gistId, tok, data, filename = "dao_state.json") {
  const r = await ghApi(tok, "PATCH", `/gists/${gistId}`, {
    files: { [filename]: { content: JSON.stringify(data, null, 2) } },
  });
  if (r.status !== 200) throw new Error(`gistWrite ${r.status}`);
  return r.json;
}

async function gistCreate(tok, data, filename = "dao_state.json") {
  const r = await ghApi(tok, "POST", "/gists", {
    public: false,
    description: "dao · windsurf proxy state · 道独立体",
    files: { [filename]: { content: JSON.stringify(data, null, 2) } },
  });
  if (r.status !== 201) throw new Error(`gistCreate ${r.status}`);
  ok("GIST", `创建成功: ${r.json.id}`);
  return r.json;
}

async function ensureGist(tok, initData) {
  // 查找已有 Gist
  const listR = await ghApi(tok, "GET", "/gists?per_page=100");
  if (listR.status === 200) {
    for (const g of listR.json || []) {
      if (
        g.description?.includes("dao · windsurf proxy") &&
        g.files?.["dao_state.json"]
      ) {
        return { id: g.id, created: false };
      }
    }
  }
  const g = await gistCreate(
    tok,
    initData || { initialized: true, createdAt: new Date().toISOString() },
  );
  return { id: g.id, created: true };
}

async function secretSet(repoFull, tok, name, value) {
  // GitHub Actions secret 需要用仓库公钥加密 (libsodium sealed box)
  // 此处使用 gh CLI (在 Actions 环境中可用)
  try {
    const cmd = `echo ${JSON.stringify(value)} | gh secret set ${name} --repo ${repoFull}`;
    execSync(cmd, { env: { ...process.env, GH_TOKEN: tok }, stdio: "pipe" });
    ok("SECRET", `${name} 已存储`);
  } catch {
    // 回退：base64 编码存储 (临时方案，Actions 内 gh CLI 通常可用)
    warn("SECRET", `${name} 存储失败 · 跳过`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// §5 · Windsurf Cascade 代理 (OpenAI 兼容 → Windsurf API)
// ══════════════════════════════════════════════════════════════════════
//
// 印 271 反审升级: multi-account chat fallback (无为而无不为)
// ══════════════════════════════════════════════════════════════════════
//   单账号 chat 502 resource_exhausted → 自动从 ACCOUNTS 拉下一个 windsurfAuth → retry
//   全 frozen 才返 502 给 client
//
const CRED_BOX = {
  apiKey: null,
  sessionToken: null,
  apiServerUrl: null,
  email: null,
};
const FROZEN_EMAILS = new Set();
let ACCOUNTS_LIST = []; // [{ email, password }]
let CRED_IDX = -1;

function parseAccountsEnv() {
  const raw = process.env.DAO_ACCOUNTS || "";
  const list = [];
  for (const pair of raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [email, ...rest] = pair.split(":");
    const password = rest.join(":");
    if (email && password) list.push({ email, password });
  }
  return list;
}

async function rotateCred() {
  if (CRED_BOX.email) FROZEN_EMAILS.add(CRED_BOX.email);
  if (ACCOUNTS_LIST.length === 0) {
    ACCOUNTS_LIST = parseAccountsEnv();
    if (ACCOUNTS_LIST.length === 0) {
      warn("ROTATE", "DAO_ACCOUNTS 空 · 无法 rotate");
      return false;
    }
    log(
      "ROTATE",
      `初载 ACCOUNTS · ${ACCOUNTS_LIST.length} 个账号 · frozen=${FROZEN_EMAILS.size}`,
    );
  }
  for (let i = 0; i < ACCOUNTS_LIST.length; i++) {
    const idx = (CRED_IDX + 1 + i) % ACCOUNTS_LIST.length;
    const acc = ACCOUNTS_LIST[idx];
    if (FROZEN_EMAILS.has(acc.email)) continue;
    try {
      log("ROTATE", `试 ${mask(acc.email)} (idx=${idx}) ...`);
      const cred = await windsurfAuth(acc.email, acc.password);
      CRED_BOX.apiKey = cred.apiKey;
      CRED_BOX.sessionToken = cred.sessionToken || null;
      CRED_BOX.apiServerUrl = cred.apiServerUrl;
      CRED_BOX.email = acc.email;
      CRED_IDX = idx;
      ok("ROTATE", `→ ${mask(acc.email)} cred=${mask(cred.apiKey)}`);
      return true;
    } catch (e) {
      warn("ROTATE", `${mask(acc.email)} login fail: ${e.message}`);
      FROZEN_EMAILS.add(acc.email);
    }
  }
  warn(
    "ROTATE",
    `全 frozen · 无法 rotate · frozen=${FROZEN_EMAILS.size}/${ACCOUNTS_LIST.length}`,
  );
  return false;
}

const MODELS = [
  "swe-1.5",
  "swe-1",
  "swe-1-6-fast",
  "claude-sonnet-4-20250514",
  "claude-opus-4-5",
  "claude-haiku-3-5-20241022",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-5",
  "gemini-2-5-pro",
  "gemini-2-0-flash",
  "deepseek-r1",
  "deepseek-v3",
  "deepseek-v3-0324",
  "grok-3",
  "grok-3-mini",
  "o4-mini",
  "o3-mini",
];

// ── 模型名映射 (用户友好名 → Windsurf MODEL_xxx) ──────────────────
const MODEL_MAP = {
  "swe-1.5": "MODEL_SWE_1_5",
  "swe-1": "MODEL_SWE_1",
  "swe-1-6-fast": "MODEL_SWE_1_6_FAST",
  "claude-sonnet-4-20250514": "MODEL_CLAUDE_4_SONNET",
  "claude-opus-4-5": "MODEL_CLAUDE_4_5_OPUS",
  "claude-haiku-3-5-20241022": "MODEL_CLAUDE_3_5_HAIKU_20241022",
  "gpt-4o": "MODEL_CHAT_GPT_4O_2024_08_06",
  "gpt-4o-mini": "MODEL_CHAT_GPT_4O_MINI",
  "gpt-4-5": "MODEL_CHAT_GPT_5",
  "gpt-5": "MODEL_CHAT_GPT_5",
  "gemini-2-5-pro": "MODEL_GOOGLE_GEMINI_2_5_PRO",
  "gemini-2-0-flash": "MODEL_GOOGLE_GEMINI_2_5_FLASH",
  "deepseek-r1": "MODEL_DEEPSEEK_R1",
  "deepseek-v3": "MODEL_DEEPSEEK_V3",
  "deepseek-v3-0324": "MODEL_DEEPSEEK_V3",
  "grok-3": "MODEL_XAI_GROK_3",
  "grok-3-mini": "MODEL_XAI_GROK_3",
  "o4-mini": "MODEL_CHAT_O4_MINI",
  "o3-mini": "MODEL_CHAT_O3_MINI",
  sonnet: "MODEL_CLAUDE_4_SONNET",
  opus: "claude-opus-4-6",
  haiku: "MODEL_PRIVATE_11",
  kimi: "MODEL_KIMI_K2",
  cascade: "MODEL_SWE_1_5",
};
function resolveModel(name) {
  return MODEL_MAP[name] || name || "MODEL_SWE_1_5"; // MODEL_xxx 或 namespaced uid 直透传
}

// ── 构建 Windsurf GetChatMessage JSON 请求体 (实证协议) ──────────────
function buildChatBody(apiKey, modelUid, messages) {
  const crypto = require("crypto");
  const chatMessages = (messages || []).map((m) => {
    const src =
      m.role === "system" || m.role === "user"
        ? "CHAT_MESSAGE_SOURCE_USER"
        : "CHAT_MESSAGE_SOURCE_ASSISTANT";
    const text =
      typeof m.content === "string"
        ? m.content
        : (m.content || []).map((c) => c.text || c.content || "").join("");
    return { source: src, content: { text: String(text) } };
  });
  return JSON.stringify({
    metadata: {
      ideName: "windsurf",
      ideVersion: "1.99.0",
      extensionName: "windsurf",
      extensionVersion: "1.99.0",
      apiKey,
      sessionId: crypto.randomUUID(),
      requestId: "1",
      locale: "en",
      os: process.platform === "win32" ? "windows" : "linux",
    },
    modelUid,
    chatMessages,
  });
}

// 发送 OpenAI 格式的 SSE chunk
function sendChunk(res, model, content, finishReason = null) {
  const chunk = {
    id: `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: finishReason ? {} : { content },
        finish_reason: finishReason,
      },
    ],
  };
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

/**
 * 核心代理: OpenAI /v1/chat/completions → Windsurf GetChatMessage
 * 协议: Connect-RPC · application/connect+json · JSON 帧
 * (实证: 02-Proxy/core/dao_proxy.js 印105 · 2026-05-14)
 */
// ══════════════════════════════════════════════════════════════════════
// 印274 · 道生一一生二二生三 · triple-backend smart router
// ══════════════════════════════════════════════════════════════════════
//
//   策略:
//     - `windsurf/xxx` · `MODEL_xxx`           → windsurf only
//     - `gh/xxx` · `<publisher>/<model>`      → gh only
//     - `devin/xxx` · `devin-cloud` · `devin` → devin only
//     - 其余 (`swe-1.5` · `gpt-4o-mini` 等)   → gh → windsurf → devin fallback
//   「道生一，一生二，二生三，三生万物」: 三背一源
//
async function proxyChat(_unusedApiKey, _unusedApiServerUrl, reqBody, res) {
  const { model: rawModel = "" } = reqBody;
  const explicitWindsurf =
    /^windsurf\//.test(rawModel) || /^MODEL_/.test(rawModel);
  const explicitGH =
    /^gh\//.test(rawModel) ||
    /^(openai|deepseek|meta|mistral-ai|cohere|microsoft|xai)\//.test(rawModel);
  const explicitDevin =
    /^devin\//.test(rawModel) ||
    /^devin-cloud/.test(rawModel) ||
    rawModel === "devin";

  let order;
  if (explicitWindsurf) order = ["windsurf"];
  else if (explicitGH) order = ["gh"];
  else if (explicitDevin) order = ["devin"];
  else order = ["gh", "windsurf", "devin"];

  // 用户可用 ENV 反序: DAO_BACKEND_PRIORITY=devin,gh,windsurf
  const envPrio = (process.env.DAO_BACKEND_PRIORITY || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (envPrio.length && !explicitWindsurf && !explicitGH && !explicitDevin) {
    order = envPrio.filter((b) => ["gh", "windsurf", "devin"].includes(b));
    if (!order.length) order = ["gh", "windsurf", "devin"];
  }

  log("PROXY", `→ model="${rawModel}" · backends=[${order.join(",")}]`);

  let lastErr = null;
  let lastInfo = null;
  for (const backend of order) {
    if (res.headersSent || res.writableEnded) return;
    try {
      if (backend === "gh") {
        const r = await proxyChatGH(reqBody, res);
        if (r.ok || res.headersSent || res.writableEnded) return;
        lastErr = new Error(
          `gh:${r.error || r.status} ${(r.body || "").slice(0, 120)}`,
        );
        lastInfo = { backend: "gh", status: r.status, error: r.error };
        warn("PROXY", `gh fail · ${lastErr.message.slice(0, 140)}`);
      } else if (backend === "windsurf") {
        const r = await proxyChatWindsurf(reqBody, res);
        if (r.ok || res.headersSent || res.writableEnded) return;
        lastErr = new Error(`windsurf:${r.error || "unknown"}`);
        lastInfo = { backend: "windsurf", ...r };
        warn("PROXY", `windsurf fail · ${lastErr.message.slice(0, 140)}`);
      } else if (backend === "devin") {
        const r = await proxyChatDevin(reqBody, res);
        if (r.ok || res.headersSent || res.writableEnded) return;
        lastErr = new Error(`devin:${r.error || "unknown"}`);
        lastInfo = { backend: "devin", ...r };
        warn("PROXY", `devin fail · ${lastErr.message.slice(0, 140)}`);
      }
    } catch (e) {
      lastErr = e;
      warn("PROXY", `${backend} threw: ${e.message}`);
    }
  }

  fail("PROXY", `all backends failed · last: ${lastErr?.message}`);
  if (!res.headersSent && !res.writableEnded) {
    res.writeHead(502, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        error: {
          message: "all_backends_failed",
          type: "upstream_error",
          last_error: lastErr?.message || "unknown",
          last_info: lastInfo,
          tried_backends: order,
        },
      }),
    );
  }
}

// 原 windsurf 逻辑 (印271 multi-account fallback · 失败不写 502 · 让 router 决定)
async function proxyChatWindsurf(reqBody, res) {
  const { model: rawModel = "swe-1.5", messages = [], stream = true } = reqBody;
  const model = rawModel.replace(/^windsurf\//, "");
  const modelUid = resolveModel(model);

  log(
    "WINDSURF",
    `→ ${model} (${modelUid}) · messages: ${messages.length} · stream: ${stream}`,
  );

  const MAX_ROTATIONS = parseInt(process.env.DAO_MAX_ROTATIONS || "8");
  let lastErr = null;

  for (let rotation = 0; rotation <= MAX_ROTATIONS; rotation++) {
    if (res.headersSent || res.writableEnded) return { ok: true };
    if (!CRED_BOX.apiKey) {
      const initOk = await rotateCred();
      if (!initOk) {
        return { ok: false, error: lastErr?.message || "no_cred_no_accounts" };
      }
    }

    const apiKey = CRED_BOX.apiKey;
    const body = buildChatBody(apiKey, modelUid, messages);
    let exhausted = false;

    for (const host of WS_CHAT_HOSTS) {
      try {
        const result = await proxyChatToHost(
          host,
          apiKey,
          body,
          model,
          stream,
          res,
        );
        if (result.text.length > 0 || result.completed) {
          ok(
            "WINDSURF",
            `完成 · ${result.text.length} chars · via ${host} · cred=${mask(CRED_BOX.email || "?")}`,
          );
          return { ok: true };
        }
      } catch (e) {
        lastErr = e;
        if (
          e.message.includes("resource_exhausted") ||
          e.message.includes("unauthenticated")
        ) {
          exhausted = true;
          break;
        }
        warn("WINDSURF", `${host}: ${e.message}`);
      }
    }

    if (exhausted && !res.headersSent && rotation < MAX_ROTATIONS) {
      warn(
        "WINDSURF",
        `cred 死(${mask(CRED_BOX.email || "?")}): ${lastErr?.message?.slice(0, 80)} · rotate ${rotation + 1}/${MAX_ROTATIONS}`,
      );
      const rotated = await rotateCred();
      if (!rotated) {
        warn("WINDSURF", "全 frozen · 退出 rotation");
        break;
      }
      continue;
    }
    break;
  }

  return {
    ok: false,
    error: lastErr?.message || "all_windsurf_failed",
    rotation_info: {
      frozen: FROZEN_EMAILS.size,
      total: ACCOUNTS_LIST.length,
      current_email: CRED_BOX.email ? mask(CRED_BOX.email) : null,
    },
  };
}

// 向单个 host 发起 Connect-RPC JSON 流式请求
function proxyChatToHost(host, apiKey, body, model, stream, res) {
  return new Promise((resolve, reject) => {
    const parser = new ConnectFrameParser();
    let totalText = "";
    let tokens = 0;
    let errorMsg = null;
    let streamHeadersSent = false;

    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error("timeout 120s"));
    }, 120000);

    const req = https.request(
      {
        hostname: host,
        port: 443,
        path: WS_CHAT_PATH,
        method: "POST",
        headers: {
          "Content-Type": "application/connect+json",
          "Connect-Protocol-Version": "1",
          "X-Api-Key": apiKey,
          "Content-Length": Buffer.byteLength(body),
        },
        rejectUnauthorized: false,
        timeout: 120000,
      },
      (upstreamRes) => {
        if (upstreamRes.statusCode >= 400) {
          const chunks = [];
          upstreamRes.on("data", (c) => chunks.push(c));
          upstreamRes.on("end", () => {
            clearTimeout(timer);
            const errBody = Buffer.concat(chunks);
            let msg = `HTTP ${upstreamRes.statusCode}`;
            // 解析 Connect-RPC 错误帧
            try {
              const { frames } = parseConnectFrames(errBody);
              for (const f of frames) {
                if (f.flags === 0x02) {
                  const t = JSON.parse(f.payload.toString("utf8"));
                  if (t.error) msg = `${t.error.code}: ${t.error.message}`;
                }
              }
            } catch {}
            try {
              const j = JSON.parse(errBody.toString("utf8"));
              msg = j.message || j.error?.message || msg;
            } catch {}
            reject(new Error(msg));
          });
          return;
        }

        let buf = Buffer.alloc(0);

        // 流式: 逐 chunk 解析 Connect-RPC JSON 帧
        upstreamRes.on("data", (chunk) => {
          buf = Buffer.concat([buf, chunk]);
          const { frames, rest } = parseConnectFrames(buf);
          buf = rest;

          for (const frame of frames) {
            try {
              const j = JSON.parse(frame.payload.toString("utf8"));
              if (frame.flags === 0x02) {
                // trailer (end-of-stream)
                if (j.error) errorMsg = `${j.error.code}: ${j.error.message}`;
              } else {
                // data frame: deltaMessage.content.text
                const dm = j.deltaMessage || j.delta_message || j.message || j;
                const content = dm.content || dm.contentChunk || {};
                const txt = content.text || dm.text || j.text || "";
                if (txt) {
                  totalText += txt;
                  if (stream) {
                    if (!streamHeadersSent) {
                      res.writeHead(200, {
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache",
                        Connection: "keep-alive",
                        "Access-Control-Allow-Origin": "*",
                      });
                      streamHeadersSent = true;
                    }
                    sendChunk(res, model, txt);
                  }
                }
                if (typeof j.tokens === "number") tokens = j.tokens;
              }
            } catch {} // 非 JSON · 忽略
          }
        });

        upstreamRes.on("end", () => {
          clearTimeout(timer);
          if (errorMsg) {
            reject(new Error(errorMsg));
            return;
          }

          if (stream) {
            if (!streamHeadersSent) {
              res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Access-Control-Allow-Origin": "*",
              });
            }
            if (totalText) sendChunk(res, model, "", "stop");
            res.write("data: [DONE]\n\n");
            res.end();
          } else {
            const resp = {
              id: `chatcmpl-${Date.now()}`,
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: totalText || "(empty response)",
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 0,
                completion_tokens: tokens,
                total_tokens: tokens,
              },
            };
            res.writeHead(200, {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            });
            res.end(JSON.stringify(resp));
          }
          resolve({ text: totalText, tokens, completed: true });
        });

        upstreamRes.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
      },
    );

    req.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.on("timeout", () => {
      req.destroy();
      clearTimeout(timer);
      reject(new Error("timeout"));
    });
    req.write(body);
    req.end();
  });
}

// Connect-RPC 帧解析 (同步版 · 返回已解析帧 + 剩余 buffer)
function parseConnectFrames(buf) {
  const frames = [];
  let off = 0;
  while (off + 5 <= buf.length) {
    const flags = buf[off];
    const len = buf.readUInt32BE(off + 1);
    if (off + 5 + len > buf.length) break;
    frames.push({ flags, payload: buf.slice(off + 5, off + 5 + len) });
    off += 5 + len;
  }
  return { frames, rest: buf.slice(off) };
}

// ══════════════════════════════════════════════════════════════════════
// §5.5 · GitHub Models backend (反者道之动 · 印272 · 永久免费)
// ══════════════════════════════════════════════════════════════════════
//
//   「天下之至柔，驰骋于天下之致坚；无有入于无间。」
//   「损之又损，以至于无为，无为而无不为。」
//
//   ── 底层突破 ──
//   每个 GitHub 账号自带 GitHub Models API
//   GitHub Actions runner 内置 GITHUB_TOKEN (含 models:read perm) 默认即可调
//   无需 trial 账号 · 无 quota=0 困境 · 永久免费 (free-tier rate limit)
//
//   ── 协议 ──
//   端点: https://models.github.ai/inference/chat/completions
//   认证: Bearer <GITHUB_TOKEN | DAO_GH_PAT | GITHUB_MODELS_TOKEN>
//   格式: 100% OpenAI 兼容 (chat/completions)
//   实证: 2026-05-28 hdougle PAT 6/6 端点 status=200 (probe_gh_models.js)
//

const GH_MODELS_BASE = "https://models.github.ai/inference";

// GH Models 提供模型 ID (实证 2026-05-28 · catalog/models 共 43)
const GH_MODELS_LIST = [
  // OpenAI
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "openai/gpt-4.1",
  "openai/gpt-4.1-mini",
  "openai/gpt-4.1-nano",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "openai/o1",
  "openai/o1-mini",
  "openai/o3",
  "openai/o3-mini",
  "openai/o4-mini",
  // Meta
  "meta/Llama-3.3-70B-Instruct",
  "meta/Meta-Llama-3.1-8B-Instruct",
  "meta/Meta-Llama-3.1-70B-Instruct",
  "meta/Meta-Llama-3.1-405B-Instruct",
  // DeepSeek
  "deepseek/DeepSeek-V3-0324",
  "deepseek/DeepSeek-R1",
  "deepseek/DeepSeek-V3",
  "deepseek/DeepSeek-R1-0528",
  // Mistral
  "mistral-ai/Mistral-large-2407",
  "mistral-ai/Mistral-Nemo",
  "mistral-ai/Mistral-small",
  "mistral-ai/Codestral-2501",
  // Cohere
  "cohere/Cohere-command-r-08-2024",
  "cohere/Cohere-command-r-plus-08-2024",
  // Microsoft
  "microsoft/Phi-4",
  "microsoft/Phi-3.5-MoE-instruct",
  // xAI
  "xai/grok-3",
  "xai/grok-3-mini",
];

// 用户友好名 ↔ GH Models 真名 (透明替代)
const GH_MODEL_ALIAS = {
  // Windsurf SWE 系列 → GPT-4o-mini (速度·成本优)
  "swe-1.5": "openai/gpt-4o-mini",
  "swe-1": "openai/gpt-4o-mini",
  "swe-1-6-fast": "openai/gpt-4o-mini",
  cascade: "openai/gpt-4o-mini",
  // Claude → 等强 GPT (GH Models 暂无 Claude)
  "claude-sonnet-4-20250514": "openai/gpt-4o",
  "claude-opus-4-5": "openai/gpt-5",
  "claude-haiku-3-5-20241022": "openai/gpt-4o-mini",
  sonnet: "openai/gpt-4o",
  opus: "openai/gpt-5",
  haiku: "openai/gpt-4o-mini",
  // GPT 直通
  "gpt-4o": "openai/gpt-4o",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gpt-4-5": "openai/gpt-5",
  "gpt-5": "openai/gpt-5",
  "o4-mini": "openai/o4-mini",
  "o3-mini": "openai/o3-mini",
  o1: "openai/o1",
  // Gemini → 等强 OpenAI/GPT (GH Models 暂无 Gemini)
  "gemini-2-5-pro": "openai/gpt-5-mini",
  "gemini-2-0-flash": "openai/gpt-4.1-mini",
  // DeepSeek 直通
  "deepseek-r1": "deepseek/DeepSeek-R1",
  "deepseek-v3": "deepseek/DeepSeek-V3-0324",
  "deepseek-v3-0324": "deepseek/DeepSeek-V3-0324",
  // Grok 直通
  "grok-3": "xai/grok-3",
  "grok-3-mini": "xai/grok-3-mini",
  // Kimi → GPT-4o-mini
  kimi: "openai/gpt-4o-mini",
};

function resolveGhModel(userModel) {
  if (!userModel) return "openai/gpt-4o-mini";
  if (userModel.startsWith("gh/")) return userModel.slice(3);
  if (GH_MODEL_ALIAS[userModel]) return GH_MODEL_ALIAS[userModel];
  if (/^[a-z][a-z-]*\/[A-Za-z0-9._-]+$/.test(userModel)) return userModel;
  return "openai/gpt-4o-mini";
}

function getGhToken() {
  return (
    process.env.GITHUB_MODELS_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.DAO_GH_PAT ||
    null
  );
}

async function proxyChatGH(reqBody, res) {
  const ghToken = getGhToken();
  if (!ghToken) {
    return { ok: false, error: "no_github_token" };
  }
  const {
    model: rawModel = "",
    messages = [],
    stream = false,
    max_tokens,
    temperature,
    top_p,
    frequency_penalty,
    presence_penalty,
  } = reqBody;
  const ghModel = resolveGhModel(rawModel);
  log("GH_MODELS", `→ ${ghModel} (from "${rawModel}") · stream=${stream}`);

  const upstreamBody = JSON.stringify({
    model: ghModel,
    messages,
    ...(max_tokens && { max_tokens }),
    ...(temperature !== undefined && { temperature }),
    ...(top_p !== undefined && { top_p }),
    ...(frequency_penalty !== undefined && { frequency_penalty }),
    ...(presence_penalty !== undefined && { presence_penalty }),
    stream,
  });

  return new Promise((resolve) => {
    const u = new URL(GH_MODELS_BASE + "/chat/completions");
    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ghToken}`,
          Accept: stream ? "text/event-stream" : "application/json",
          "User-Agent": "dao-proxy/3.0",
          "Content-Length": Buffer.byteLength(upstreamBody),
        },
        timeout: 120000,
        rejectUnauthorized: false,
      },
      (upstreamRes) => {
        const sc = upstreamRes.statusCode || 0;
        if (sc !== 200) {
          const bufs = [];
          upstreamRes.on("data", (c) => bufs.push(c));
          upstreamRes.on("end", () => {
            const txt = Buffer.concat(bufs).toString("utf8").slice(0, 600);
            warn("GH_MODELS", `← status=${sc} · body=${txt}`);
            resolve({ ok: false, status: sc, body: txt });
          });
          return;
        }
        log("GH_MODELS", `← status=200 · streaming=${stream}`);
        if (stream) {
          if (!res.headersSent) {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "Access-Control-Allow-Origin": "*",
            });
          }
          upstreamRes.on("data", (c) => {
            if (!res.writableEnded) res.write(c);
          });
          upstreamRes.on("end", () => {
            if (!res.writableEnded) res.end();
            ok("GH_MODELS", `stream end · ${ghModel}`);
            resolve({ ok: true, status: 200, streamed: true });
          });
          upstreamRes.on("error", (e) => {
            warn("GH_MODELS", `stream err: ${e.message}`);
            if (!res.writableEnded) res.end();
            resolve({ ok: false, error: e.message });
          });
        } else {
          const bufs = [];
          upstreamRes.on("data", (c) => bufs.push(c));
          upstreamRes.on("end", () => {
            const txt = Buffer.concat(bufs).toString("utf8");
            if (!res.headersSent) {
              res.writeHead(200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
            }
            res.end(txt);
            ok("GH_MODELS", `完成 · ${txt.length} bytes · ${ghModel}`);
            resolve({ ok: true, status: 200, body: txt });
          });
        }
      },
    );
    req.on("error", (e) => {
      warn("GH_MODELS", `request err: ${e.message}`);
      resolve({ ok: false, error: e.message });
    });
    req.on("timeout", () => {
      req.destroy();
      warn("GH_MODELS", "timeout 120s");
      resolve({ ok: false, error: "timeout" });
    });
    req.write(upstreamBody);
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════════════
// §5.6 · Devin Cloud backend (道生一一生二二生三 · 印274 · D100 三背全开)
// ══════════════════════════════════════════════════════════════════════
//
//   「道生一，一生二，二生三，三生万物。」── 帛书四十二
//   「万物负阴而抱阳，中气以为和。」── 帛书四十二
//
//   ── 底层突破 ──
//   同一组账号 (accounts.md) 同时拥有:
//     · Windsurf Cascade 额度 (W100) → sk-ws-* key → GetChatMessage RPC
//     · Devin Cloud 额度 (D100) → devin-session-token$JWT → ACP WebSocket
//     · GitHub Models → GITHUB_TOKEN → REST API
//   三背一源 · 无为而无不为
//
//   ── 协议 ──
//   端点: wss://app.devin.ai/api/acp/live?token=<JWT>
//   协议: ACP (Agent Communication Protocol) · JSON-RPC 2.0 over WebSocket
//   流程: initialize → session/new → session/prompt → session/update* (streaming)
//   依赖: Node 22+ 内置 WebSocket (globalThis.WebSocket)
//   实证: devin_cloud_engine.js 印80 · wss handshake + chat 全路贯通
//

const DEVIN_WSS_BASE = "wss://app.devin.ai/api/acp/live";
const DEVIN_TOKEN_PREFIX = "devin-session-token$";
const DEVIN_HAS_WS = typeof globalThis.WebSocket === "function";

const DEVIN_MODELS_LIST = ["devin-cloud", "devin-cloud-claude", "devin-agent"];

const DEVIN_MODEL_ALIAS = {
  devin: "devin-cloud",
  "devin-cloud": "devin-cloud",
  "devin-agent": "devin-agent",
  "devin-claude": "devin-cloud-claude",
  "devin-cloud-claude": "devin-cloud-claude",
};

function resolveDevinModel(userModel) {
  if (!userModel) return "devin-cloud";
  const m = userModel.replace(/^devin\//, "");
  return DEVIN_MODEL_ALIAS[m] || "devin-cloud";
}

function getDevinSessionToken() {
  if (CRED_BOX.sessionToken?.startsWith(DEVIN_TOKEN_PREFIX))
    return CRED_BOX.sessionToken;
  if (process.env.DAO_DEVIN_TOKEN?.startsWith(DEVIN_TOKEN_PREFIX))
    return process.env.DAO_DEVIN_TOKEN;
  if (CRED_BOX.apiKey?.startsWith(DEVIN_TOKEN_PREFIX)) return CRED_BOX.apiKey;
  return null;
}

// OpenAI messages → ACP prompt format
// 「上士闻道, 堇而行之」— 让 Devin Agent 当裸 LLM 用
function messagesToDevinPrompt(messages) {
  if (!Array.isArray(messages) || messages.length === 0)
    return [{ type: "text", text: "ok" }];
  const systems = messages
    .filter((m) => m && m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean);
  const turns = [];
  for (const m of messages) {
    if (!m || m.role === "system") continue;
    const content = typeof m.content === "string" ? m.content : "";
    if (!content) continue;
    if (m.role === "user") turns.push(`User: ${content}`);
    else if (m.role === "assistant") turns.push(`Assistant: ${content}`);
    else turns.push(content);
  }
  let text = "";
  if (systems.length > 0) text += systems.join("\n\n") + "\n\n";
  if (turns.length > 0) text += turns.join("\n\n");
  if (!text) text = "ok";
  return [{ type: "text", text }];
}

// session/update → text delta (agent_message_chunk only)
function extractDevinDelta(update) {
  if (!update || typeof update !== "object") return null;
  const upType = update.sessionUpdate || update.type;
  if (upType !== "agent_message_chunk") return null;
  const content = update.content;
  if (!content) return null;
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .filter((c) => c && c.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("");
  if (
    typeof content === "object" &&
    content.type === "text" &&
    typeof content.text === "string"
  )
    return content.text;
  return null;
}

async function proxyChatDevin(reqBody, res) {
  if (!DEVIN_HAS_WS) {
    return {
      ok: false,
      error: `devin_needs_node22_websocket (current: ${process.version})`,
    };
  }
  const token = getDevinSessionToken();
  if (!token) {
    return { ok: false, error: "no_devin_session_token" };
  }
  const { model: rawModel = "", messages = [], stream = true } = reqBody;
  const devinModel = resolveDevinModel(rawModel);
  log(
    "DEVIN",
    `→ ${devinModel} (from "${rawModel}") · msgs=${messages.length} · stream=${stream}`,
  );

  const jwt = token.startsWith(DEVIN_TOKEN_PREFIX)
    ? token.slice(DEVIN_TOKEN_PREFIX.length)
    : token;
  const wssUrl = `${DEVIN_WSS_BASE}?token=${encodeURIComponent(jwt)}`;

  return new Promise((resolve) => {
    let ws;
    try {
      ws = new WebSocket(wssUrl);
    } catch (e) {
      warn("DEVIN", `wss 创建失败: ${e.message}`);
      return resolve({ ok: false, error: `wss_create: ${e.message}` });
    }

    let sessionId = null;
    let collectedText = "";
    let streamStarted = false;
    let _resolved = false;
    let _closed = false;

    const done = (result) => {
      if (_resolved) return;
      _resolved = true;
      clearTimeout(timer);
      if (!_closed) {
        try {
          ws.close(1000, "chat done");
        } catch {}
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      warn(
        "DEVIN",
        `超时 120s · sid=${sessionId || "?"} · text=${collectedText.length}chars`,
      );
      if (collectedText && streamStarted) {
        if (!res.writableEnded) {
          sendChunk(res, devinModel, "", "stop");
          res.write("data: [DONE]\n\n");
          res.end();
        }
        done({ ok: true, partial: true });
      } else {
        done({ ok: false, error: "devin_timeout_120s" });
      }
    }, 120000);

    ws.onopen = () => {
      log("DEVIN", "wss connected → initialize");
      try {
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: 1,
              clientCapabilities: {
                fs: { readTextFile: true, writeTextFile: true },
                elicitation: { form: {} },
                _meta: {
                  "cognition.ai/subagentSupport": false,
                  "cognition.ai/multiRootWorkspace": false,
                },
              },
            },
          }),
        );
      } catch (e) {
        done({ ok: false, error: `send_init: ${e.message}` });
      }
    };

    ws.onerror = (ev) => {
      const msg = ev?.message || ev?.error?.message || "(unknown)";
      warn("DEVIN", `wss error: ${msg}`);
      done({ ok: false, error: `wss_error: ${msg}` });
    };

    ws.onclose = (ev) => {
      _closed = true;
      if (_resolved) return;
      if (collectedText && streamStarted && !res.writableEnded) {
        sendChunk(res, devinModel, "", "stop");
        res.write("data: [DONE]\n\n");
        res.end();
        done({ ok: true });
      } else {
        const reason = (ev?.reason || "").slice(0, 200);
        done({
          ok: false,
          error: `wss_closed: code=${ev?.code} ${reason}`,
        });
      }
    };

    ws.onmessage = (ev) => {
      let raw = ev.data;
      if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString("utf8");
      if (Buffer.isBuffer(raw)) raw = raw.toString("utf8");
      if (typeof raw !== "string") return;
      const lines = raw.split("\n").filter((x) => x.trim());
      for (const line of lines) {
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        handleMsg(msg);
      }
    };

    function handleMsg(msg) {
      // ── session/update notifications (streaming chat content) ──
      if (msg.method === "session/update") {
        const update = msg.params?.update;
        const delta = extractDevinDelta(update);
        if (delta) {
          collectedText += delta;
          if (stream && !res.writableEnded) {
            if (!streamStarted && !res.headersSent) {
              res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
                "Access-Control-Allow-Origin": "*",
              });
              streamStarted = true;
            }
            sendChunk(res, devinModel, delta);
          }
        }
        return;
      }

      // ── initialize response (id=1) ──
      if (msg.id === 1) {
        if (msg.error) {
          warn(
            "DEVIN",
            `initialize fail: [${msg.error.code}] ${msg.error.message}`,
          );
          done({ ok: false, error: `init: ${msg.error.message}` });
          return;
        }
        log("DEVIN", "initialize ok → session/new");
        const authMethods = msg.result?.authMethods?.map((a) => a.id) || [];
        if (authMethods.length > 0) {
          // wss URL token 已前置 → 直 session/new (authMethods=[])
          // 万一需要 authenticate (stdio chisel 路)
          try {
            ws.send(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 2,
                method: "authenticate",
                params: {
                  methodId: "windsurf-api-key",
                  _meta: {
                    api_key: token,
                    api_server_url:
                      CRED_BOX.apiServerUrl || `https://${API_SERVER}`,
                  },
                },
              }),
            );
          } catch (e) {
            done({ ok: false, error: `send_auth: ${e.message}` });
          }
        } else {
          sendSessionNew();
        }
        return;
      }

      // ── authenticate response (id=2 · 反向兼容) ──
      if (msg.id === 2) {
        if (msg.error) {
          warn(
            "DEVIN",
            `authenticate fail: [${msg.error.code}] ${msg.error.message}`,
          );
          done({
            ok: false,
            error: `auth: ${msg.error.message}`,
            isQuota: /quota|billing/i.test(msg.error.message || ""),
          });
          return;
        }
        sendSessionNew();
        return;
      }

      // ── session/new response (id=3) ──
      if (msg.id === 3) {
        if (msg.error) {
          const errMsg = msg.error.message || "";
          warn("DEVIN", `session/new fail: [${msg.error.code}] ${errMsg}`);
          done({
            ok: false,
            error: `session_new: ${errMsg}`,
            isQuota: /quota|limit|billing|rate/i.test(errMsg),
          });
          return;
        }
        sessionId = msg.result?.sessionId;
        if (!sessionId) {
          done({ ok: false, error: "no_session_id_returned" });
          return;
        }
        log("DEVIN", `session/new ok · sid=${sessionId} → prompt`);
        const prompt = messagesToDevinPrompt(messages);
        try {
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 4,
              method: "session/prompt",
              params: { sessionId, prompt },
            }),
          );
        } catch (e) {
          done({ ok: false, error: `send_prompt: ${e.message}` });
        }
        return;
      }

      // ── session/prompt response (id=4 · completion) ──
      if (msg.id === 4) {
        if (msg.error) {
          const errMsg = msg.error.message || "";
          warn("DEVIN", `session/prompt fail: [${msg.error.code}] ${errMsg}`);
          done({ ok: false, error: `prompt: ${errMsg}` });
          return;
        }
        ok("DEVIN", `完成 · ${collectedText.length} chars · sid=${sessionId}`);
        if (stream) {
          if (!streamStarted && !res.headersSent) {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Access-Control-Allow-Origin": "*",
            });
          }
          if (!res.writableEnded) {
            if (collectedText) sendChunk(res, devinModel, "", "stop");
            res.write("data: [DONE]\n\n");
            res.end();
          }
        } else {
          if (!res.headersSent) {
            const resp = {
              id: `chatcmpl-devin-${Date.now()}`,
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model: devinModel,
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: collectedText || "(empty response)",
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
              },
            };
            res.writeHead(200, {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            });
            res.end(JSON.stringify(resp));
          }
        }
        done({ ok: true });
        return;
      }
    }

    function sendSessionNew() {
      try {
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "session/new",
            params: { cwd: process.cwd(), mcpServers: [] },
          }),
        );
      } catch (e) {
        done({ ok: false, error: `send_new: ${e.message}` });
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════════════
// §6 · HTTP 服务器 (OpenAI 兼容 API)
// ══════════════════════════════════════════════════════════════════════

function startProxyServer(apiKey, apiServerUrl, port = 7799) {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, `http://localhost:${port}`);

    // CORS 预检
    if (req.method === "OPTIONS") {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    // ── GET /health / /status ──────────────────────────────────────
    if (
      req.method === "GET" &&
      (u.pathname === "/health" || u.pathname === "/status")
    ) {
      const ghTok = getGhToken();
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(
        JSON.stringify({
          ok: true,
          version: VERSION,
          model: "triple-backend (windsurf + gh-models + devin-cloud)",
          backends: {
            windsurf: {
              available: !!CRED_BOX.apiKey,
              apiKey: mask(CRED_BOX.apiKey || apiKey || ""),
              email: CRED_BOX.email ? mask(CRED_BOX.email) : null,
              accounts: ACCOUNTS_LIST.length,
              frozen: FROZEN_EMAILS.size,
            },
            gh_models: {
              available: !!ghTok,
              token_source: process.env.GITHUB_MODELS_TOKEN
                ? "GITHUB_MODELS_TOKEN"
                : process.env.GITHUB_TOKEN
                  ? "GITHUB_TOKEN"
                  : process.env.DAO_GH_PAT
                    ? "DAO_GH_PAT"
                    : null,
              models: GH_MODELS_LIST.length,
            },
            devin_cloud: {
              available: DEVIN_HAS_WS && !!getDevinSessionToken(),
              websocket: DEVIN_HAS_WS,
              node_version: process.version,
              token: getDevinSessionToken()
                ? mask(getDevinSessionToken())
                : null,
              models: DEVIN_MODELS_LIST.length,
            },
          },
          priority:
            process.env.DAO_BACKEND_PRIORITY || "gh,windsurf,devin (default)",
        }),
      );
      return;
    }

    // ── GET /v1/models ─────────────────────────────────────────────
    if (req.method === "GET" && u.pathname === "/v1/models") {
      const data = [
        ...MODELS.map((id) => ({
          id,
          object: "model",
          created: 1700000000,
          owned_by: "windsurf",
        })),
        ...GH_MODELS_LIST.map((id) => ({
          id,
          object: "model",
          created: 1700000000,
          owned_by: id.split("/")[0],
        })),
        ...DEVIN_MODELS_LIST.map((id) => ({
          id,
          object: "model",
          created: 1700000000,
          owned_by: "devin",
        })),
      ];
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ object: "list", data }));
      return;
    }

    // ── POST /v1/chat/completions ──────────────────────────────────
    if (req.method === "POST" && u.pathname === "/v1/chat/completions") {
      const body = await new Promise((resolve, reject) => {
        let d = "";
        req.on("data", (c) => {
          d += c;
        });
        req.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch {
            reject(new Error("invalid JSON"));
          }
        });
        req.on("error", reject);
      }).catch((e) => {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: { message: e.message, type: "invalid_request_error" },
          }),
        );
        return null;
      });
      if (!body) return;
      await proxyChat(apiKey, apiServerUrl, body, res);
      return;
    }

    // ── 404 ───────────────────────────────────────────────────────
    res.writeHead(404, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({ error: { message: "Not found", path: u.pathname } }),
    );
  });

  server.listen(port, "0.0.0.0", () => {
    ok("SERVER", `OpenAI 兼容 API 已启动 · http://0.0.0.0:${port}`);
    ok("SERVER", `  POST /v1/chat/completions`);
    ok("SERVER", `  GET  /v1/models`);
  });

  return server;
}

// ══════════════════════════════════════════════════════════════════════
// §7 · Cloudflare Tunnel (GitHub Actions 公网穿透)
// ══════════════════════════════════════════════════════════════════════

async function installCloudflared() {
  try {
    execSync("cloudflared --version", { stdio: "pipe" });
    ok("TUNNEL", "cloudflared 已存在");
    return;
  } catch {}
  log("TUNNEL", "安装 cloudflared ...");
  const isLinux = process.platform === "linux";
  const isArm = process.arch === "arm64";
  const arch = isArm ? "arm64" : "amd64";
  const url = isLinux
    ? `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}.deb`
    : `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${process.platform}-${arch}`;

  try {
    if (isLinux) {
      execSync(
        `curl -fsSL "${url}" -o /tmp/cloudflared.deb && sudo dpkg -i /tmp/cloudflared.deb`,
        { stdio: "inherit" },
      );
    } else {
      execSync(
        `curl -fsSL "${url}" -o /tmp/cloudflared && chmod +x /tmp/cloudflared && sudo mv /tmp/cloudflared /usr/local/bin/`,
        { stdio: "inherit" },
      );
    }
    ok("TUNNEL", "cloudflared 安装完成");
  } catch (e) {
    warn("TUNNEL", `cloudflared 安装失败: ${e.message} · 将使用 URL 回退`);
  }
}

async function startTunnel(port) {
  await installCloudflared();
  return new Promise((resolve) => {
    const logFile = "/tmp/dao_cf.log";
    const proc = spawn(
      "cloudflared",
      [
        "tunnel",
        "--url",
        `http://localhost:${port}`,
        "--no-autoupdate",
        "--logfile",
        logFile,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let urlFound = false;
    const tryExtract = (data) => {
      const text = data.toString();
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !urlFound) {
        urlFound = true;
        ok("TUNNEL", `公网 URL: ${m[0]}`);
        resolve({ url: m[0], proc });
      }
    };

    proc.stdout.on("data", tryExtract);
    proc.stderr.on("data", tryExtract);

    // 超时后尝试从日志文件读取
    setTimeout(() => {
      if (!urlFound) {
        try {
          const log = fs.readFileSync(logFile, "utf8");
          const m = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
          if (m) {
            urlFound = true;
            ok("TUNNEL", `URL (from log): ${m[0]}`);
            resolve({ url: m[0], proc });
            return;
          }
        } catch {}
        warn("TUNNEL", "未能获取隧道 URL · 使用本地地址");
        resolve({ url: `http://localhost:${port}`, proc });
      }
    }, 30000);

    proc.on("error", (e) => {
      warn("TUNNEL", `cloudflared 错误: ${e.message}`);
      if (!urlFound) resolve({ url: `http://localhost:${port}`, proc: null });
    });
  });
}

// ══════════════════════════════════════════════════════════════════════
// §8 · 工作流自续期 (5.5h 触发下一轮)
// ══════════════════════════════════════════════════════════════════════

async function scheduleSelfRenewal(gistId, tok) {
  const repoFull = process.env.GITHUB_REPOSITORY;
  if (!repoFull || !tok) {
    warn("RENEW", "无法自续期 · 缺少 GITHUB_REPOSITORY 或 token");
    return;
  }

  const FIVE_HALF_HOURS = 5.5 * 60 * 60 * 1000;
  setTimeout(async () => {
    log("RENEW", "5.5h 到达 · 触发下一轮工作流 ...");
    try {
      const [owner, repo] = repoFull.split("/");
      const r = await ghApi(
        tok,
        "POST",
        `/repos/${owner}/${repo}/actions/workflows/dao-boot.yml/dispatches`,
        {
          ref: "main",
          inputs: { mode: "proxy", gist_id: gistId },
        },
      );
      if (r.status === 204) ok("RENEW", "下一轮已触发 ✓");
      else warn("RENEW", `触发失败: ${r.status}`);
    } catch (e) {
      warn("RENEW", `续期触发错误: ${e.message}`);
    }
    // 给下一轮 30 秒启动时间后优雅退出
    setTimeout(() => {
      log("RENEW", "交棒完成 · 退出");
      process.exit(0);
    }, 30000);
  }, FIVE_HALF_HOURS);
}

// ══════════════════════════════════════════════════════════════════════
// §9 · 模式: setup (Step1 · 认证 + 初始化 Gist)
// ══════════════════════════════════════════════════════════════════════

async function modeSetup() {
  log("SETUP", "══ Step1: 认证 + 初始化 Gist ══");

  // 认证 (允许失败 · 包 gh-only setup)
  let cred = { apiKey: "", apiServerUrl: "", source: "none" };
  try {
    cred = await resolveAuth();
    ok("SETUP", `windsurf cred OK · ${mask(cred.apiKey)}`);
  } catch (e) {
    warn(
      "SETUP",
      `windsurf auth fail: ${e.message.slice(0, 100)} · gh-only setup中`,
    );
  }

  if (!cred.apiKey && !getGhToken()) {
    fail("SETUP", "无 windsurf cred 且无 GITHUB_TOKEN/DAO_GH_PAT · setup 拒绝");
    process.exit(1);
  }

  // GitHub token 和 Gist
  const tok = process.env.GITHUB_TOKEN;
  let gistId = process.env.DAO_GIST_ID;

  if (tok) {
    if (!gistId) {
      const g = await ensureGist(tok, {
        initialized: true,
        createdAt: new Date().toISOString(),
        status: "setup",
        apiKey: mask(cred.apiKey),
        apiServerUrl: cred.apiServerUrl,
      });
      gistId = g.id;
      // 写入 GITHUB_OUTPUT 供后续 step 使用
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `GIST_ID=${gistId}\n`);
      }
    } else {
      try {
        await gistWrite(gistId, tok, {
          initialized: true,
          updatedAt: new Date().toISOString(),
          status: "setup",
          apiKey: mask(cred.apiKey),
          apiServerUrl: cred.apiServerUrl,
        });
      } catch {}
    }

    // 存储 JWT 到 Actions Secret (供后续 proxy step 使用)
    const repoFull = process.env.GITHUB_REPOSITORY;
    if (repoFull) {
      await secretSet(repoFull, tok, "DAO_JWT", cred.apiKey);
      if (gistId) await secretSet(repoFull, tok, "DAO_GIST_ID", gistId);
    }
  }

  // 输出供下一步使用
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `DAO_JWT=${cred.apiKey}\nDAO_API_SERVER=${cred.apiServerUrl}\n`,
    );
  }
  // 写入环境文件
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(
      process.env.GITHUB_ENV,
      `DAO_JWT=${cred.apiKey}\nDAO_API_SERVER=${cred.apiServerUrl}\nDAO_GIST_ID=${gistId || ""}\n`,
    );
  }

  console.log(
    "\n" +
      JSON.stringify({
        ok: true,
        apiKey: mask(cred.apiKey),
        gistId: gistId || "(none)",
      }),
  );
  ok("SETUP", "Step1 完成 · JWT 已存储");
}

// ══════════════════════════════════════════════════════════════════════
// §10 · 模式: proxy (Step2 · 启动代理 + 隧道 · 长期运行)
// ══════════════════════════════════════════════════════════════════════

async function modeProxy() {
  log("PROXY", "══ Step2: 启动代理服务器 ══");

  // 获取 windsurf 认证 (允许失败 → 降级 gh-only mode)
  let cred = { apiKey: null, apiServerUrl: null, source: "none" };
  try {
    cred = await resolveAuth();
    ok("PROXY", `windsurf cred OK · ${mask(cred.apiKey)}`);
  } catch (e) {
    warn(
      "PROXY",
      `windsurf auth fail: ${e.message.slice(0, 100)} · 限 gh-only mode运行中`,
    );
  }

  // 检查: 至少一个 backend 可用
  if (!cred.apiKey && !getGhToken()) {
    fail(
      "PROXY",
      "无 windsurf cred 且无 GITHUB_TOKEN/DAO_GH_PAT · 拒绝启动 (至少设一个)",
    );
    process.exit(1);
  }

  const port = parseInt(process.env.HUB_PORT || "7799");

  // 印 271 反审升级: 初始化 CRED_BOX (支 multi-account fallback)
  CRED_BOX.apiKey = cred.apiKey;
  CRED_BOX.sessionToken = cred.sessionToken || null;
  CRED_BOX.apiServerUrl = cred.apiServerUrl;
  CRED_BOX.email =
    cred.email ||
    (cred.source === "auth:windsurf"
      ? ((process.env.DAO_ACCOUNTS || "").split(",")[0] || "").split(":")[0]
      : null);
  ACCOUNTS_LIST = parseAccountsEnv();
  if (CRED_BOX.email) {
    const idx = ACCOUNTS_LIST.findIndex((a) => a.email === CRED_BOX.email);
    if (idx >= 0) CRED_IDX = idx;
  }
  ok(
    "PROXY",
    `CRED_BOX 初载 · email=${mask(CRED_BOX.email || "?")} · ACCOUNTS=${ACCOUNTS_LIST.length} · gh=${getGhToken() ? "✓" : "✗"} · devin=${getDevinSessionToken() ? "✓" : "✗"}`,
  );
  ok(
    "PROXY",
    `三背状态 · windsurf=${CRED_BOX.apiKey ? "✓" : "✗"} · gh_models=${getGhToken() ? "✓" : "✗"} · devin_cloud=${DEVIN_HAS_WS && getDevinSessionToken() ? "✓" : "✗"} (node ${process.version})`,
  );

  // 启动 HTTP 服务器
  startProxyServer(cred.apiKey, cred.apiServerUrl, port);

  // 等待服务器就绪
  await new Promise((r) => setTimeout(r, 1000));

  // 启动 Cloudflare 隧道
  log("TUNNEL", "建立 Cloudflare 隧道 ...");
  const { url: tunnelUrl, proc: tunnelProc } = await startTunnel(port);

  // 写入 Gist (供前端轮询)
  const tok = process.env.GITHUB_TOKEN;
  const gistId = process.env.DAO_GIST_ID;
  if (tok && gistId) {
    try {
      let state = {};
      try {
        state = await gistRead(gistId, tok);
      } catch {}
      Object.assign(state, {
        status: "ready",
        tunnelUrl,
        apiUrl: tunnelUrl + "/v1/chat/completions",
        modelsUrl: tunnelUrl + "/v1/models",
        healthUrl: tunnelUrl + "/health",
        apiKey: mask(cred.apiKey),
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: VERSION,
      });
      await gistWrite(gistId, tok, state);
      ok("GIST", `状态已写入 · gistId: ${gistId}`);
    } catch (e) {
      warn("GIST", `写入失败: ${e.message}`);
    }
  }

  // 打印就绪信息
  console.log("\n" + "═".repeat(60));
  console.log(`  ${C.bold}${C.green}道 · 代理服务器就绪${C.reset}`);
  console.log(
    `  API 端点: ${C.cyan}${tunnelUrl}/v1/chat/completions${C.reset}`,
  );
  console.log(`  模型列表: ${C.cyan}${tunnelUrl}/v1/models${C.reset}`);
  console.log("═".repeat(60));
  console.log(`\n  curl ${tunnelUrl}/v1/chat/completions \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(
    `    -d '{"model":"swe-1.5","messages":[{"role":"user","content":"Hello"}],"stream":true}'\n`,
  );

  // 写入 GitHub Actions Step Summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        "## 道 · 代理服务器就绪\n",
        `**API 端点**: \`${tunnelUrl}/v1/chat/completions\`\n`,
        `**模型列表**: \`${tunnelUrl}/v1/models\`\n`,
        "```bash",
        `curl ${tunnelUrl}/v1/chat/completions \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '{"model":"swe-1.5","messages":[{"role":"user","content":"Hello"}],"stream":true}'`,
        "```\n",
      ].join("\n"),
    );
  }

  // 设置自续期 (5.5h 后触发下一轮)
  await scheduleSelfRenewal(gistId, tok);

  // 心跳 (每 5 分钟更新 Gist)
  if (tok && gistId) {
    setInterval(
      async () => {
        try {
          let state = {};
          try {
            state = await gistRead(gistId, tok);
          } catch {}
          state.updatedAt = new Date().toISOString();
          state.status = "alive";
          await gistWrite(gistId, tok, state);
          log("HEARTBEAT", `OK · ${new Date().toISOString().slice(11, 19)}`);
        } catch (e) {
          warn("HEARTBEAT", e.message);
        }
      },
      5 * 60 * 1000,
    );
  }

  // 保持进程活跃
  process.on("SIGTERM", () => {
    log("SIG", "SIGTERM 收到 · 优雅退出");
    process.exit(0);
  });
  process.on("SIGINT", () => {
    log("SIG", "SIGINT 收到 · 优雅退出");
    process.exit(0);
  });
  await new Promise(() => {}); // 永久等待
}

// ══════════════════════════════════════════════════════════════════════
// §11 · 模式: local (本地直接运行)
// ══════════════════════════════════════════════════════════════════════

async function modeLocal() {
  log("LOCAL", "══ 本地模式 ══");

  // 允许 windsurf 认证失败 → gh-only 模式仍可启 (反者道之动)
  let cred = { apiKey: null, apiServerUrl: null, source: "none" };
  try {
    cred = await resolveAuth();
    CRED_BOX.apiKey = cred.apiKey;
    CRED_BOX.sessionToken = cred.sessionToken || null;
    CRED_BOX.apiServerUrl = cred.apiServerUrl;
    CRED_BOX.email =
      cred.email ||
      (cred.source === "auth:windsurf"
        ? ((process.env.DAO_ACCOUNTS || "").split(",")[0] || "").split(":")[0]
        : null);
    ACCOUNTS_LIST = parseAccountsEnv();
    ok("LOCAL", `windsurf cred OK · ${mask(cred.apiKey)}`);
  } catch (e) {
    warn(
      "LOCAL",
      `windsurf auth fail: ${e.message.slice(0, 100)} · gh-only mode运行中`,
    );
  }

  if (!cred.apiKey && !getGhToken()) {
    fail("LOCAL", "无 windsurf cred 且无 GITHUB_TOKEN/DAO_GH_PAT · 拒绝启动");
    process.exit(1);
  }

  const port = parseInt(process.env.HUB_PORT || "7799");
  startProxyServer(cred.apiKey, cred.apiServerUrl, port);
  ok("LOCAL", `API 就绪 · http://localhost:${port}/v1/chat/completions`);
  ok("LOCAL", `模型列表 · http://localhost:${port}/v1/models`);
  ok(
    "LOCAL",
    `backends: windsurf=${cred.apiKey ? "✓" : "✗"} · gh=${getGhToken() ? "✓" : "✗"} · devin=${DEVIN_HAS_WS && getDevinSessionToken() ? "✓" : "✗"} (node ${process.version})`,
  );
  await new Promise(() => {});
}

// ══════════════════════════════════════════════════════════════════════
// §12 · 模式: status
// ══════════════════════════════════════════════════════════════════════

async function modeStatus() {
  const tok = process.env.GITHUB_TOKEN;
  const gistId = process.env.DAO_GIST_ID;
  if (!tok || !gistId) {
    fail("STATUS", "需要 GITHUB_TOKEN + DAO_GIST_ID");
    return;
  }
  const state = await gistRead(gistId, tok);
  console.log(JSON.stringify(state, null, 2));
}

// ══════════════════════════════════════════════════════════════════════
// §13 · 主入口
// ══════════════════════════════════════════════════════════════════════

async function main() {
  console.log(
    `\n${C.bold}${C.cyan}  ══════════════════════════════════════════════════${C.reset}`,
  );
  console.log(
    `${C.bold}  ║  dao_proxy.js  v${VERSION}                         ║${C.reset}`,
  );
  console.log(
    `${C.bold}  ║  ${C.dim}${SEAL.slice(0, 44)}${C.reset}${C.bold}  ║${C.reset}`,
  );
  console.log(
    `${C.bold}${C.cyan}  ══════════════════════════════════════════════════${C.reset}\n`,
  );

  const mode = process.env.DAO_MODE || process.argv[2] || "local";
  log("MAIN", `模式: ${C.bold}${mode}${C.reset}`);

  switch (mode) {
    case "setup":
      await modeSetup();
      break;
    case "proxy":
      await modeProxy();
      break;
    case "local":
      await modeLocal();
      break;
    case "status":
      await modeStatus();
      break;
    default:
      fail("MAIN", `未知模式: ${mode} · 可用: setup | proxy | local | status`);
      process.exit(1);
  }
}

main().catch((e) => {
  fail("FATAL", e.message);
  if (process.env.DAO_DEBUG) console.error(e.stack);
  process.exit(1);
});
