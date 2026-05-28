"use strict";
/**
 * server.js  v2.1.0
 * 印196 · VM云反代全体系 · 道法自然 · 无为而无不为
 * 扩展自 dao_vm_engine.js v2.0.0 (印191)
 * 新增: WS直连池(Pool B·无需LS) + LOCAL_MASTER自注册 + /admin/ws/*
 *
 * 核心突破：
 *   在VM上直接运行 language_server_linux_x64 二进制文件
 *   该二进制文件在内部处理所有attestation token → 彻底脱离本机依赖
 *
 * 架构：
 *   VM: dao_vm_engine.js (:3003)
 *     ├── LanguageServer (language_server_linux_x64, gRPC :42100)
 *     │     └── 自动生成attestation → 上行Windsurf Cloud → 返回Cascade响应
 *     ├── AccountPool   (多账号轮转 · 健康检查 · 自动冷却)
 *     ├── CascadeChat   (via LS gRPC · RawGetChatMessage)
 *     ├── DevinProxy    (cognition.ai session API透传)
 *     ├── OpenAI API    (/v1/chat/completions · stream/sync)
 *     ├── SP注入        (全局/per-request系统提示词替换)
 *     ├── Admin API     (/admin/* 远程管理)
 *     └── cloudflare    (自动建立公网URL)
 *
 *   本地: dao_local_v2.js
 *     ├── 账号推送  → POST /admin/accounts/add-bulk
 *     ├── VM注册    → vms.json
 *     ├── 健康监控  → /health
 *     └── 请求路由  → 最优VM
 *
 * 部署 (VM上一键):
 *   curl -fsSL https://raw.githubusercontent.com/zhouyoukang/windsurf-assistant/main/010-%E5%8F%8D%E4%BB%A3_Proxy/dao_seed.sh | bash
 *
 * 用法:
 *   node dao_vm_engine.js [--port N] [--no-tunnel] [--verbose] [--test]
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const http2 = require("http2");
const https = require("https");
const crypto = require("crypto");
const os = require("os");
const { spawn, spawnSync, execSync } = require("child_process");

// ═══════════════════════════════════════════════════════════════
// §0 · 版本 & 配置
// ═══════════════════════════════════════════════════════════════

const VERSION = "2.5.1"; // 印200 · HTTPS_PROXY支持 (本机走代理消费Devin Cloud · 道法自然)
const BRAND = "dao_vm_engine";
const SEAL196 =
  "印196·VM云反代全体系·Cascade+Devin全模型·LOCAL_MASTER自注册·道法自然";
const SEAL197 =
  "印197·取之尽锱铢·DAO_DEVIN_TOKEN自注册·RegisterUser→PoolB·道法自然";
const LOCAL_MASTER =
  process.env.LOCAL_MASTER || process.env.CF_URL_MASTER || ""; // e.g. https://xxx.trycloudflare.com
const VM_RELAY_MODE = !!(LOCAL_MASTER && process.env.VM_RELAY === "1"); // 印199: VM纯中继模式
const VM_NAME = process.env.VM_NAME || require("os").hostname();
const START_TIME = Date.now();

const PORT = parseInt(process.env.PORT || "3003");
const LS_PORT = parseInt(process.env.LS_PORT || "42100");
const BIND = process.env.BIND || "0.0.0.0";
// 印199: 同时支持 --no-tunnel 参数 和 NO_TUNNEL=1 环境变量
const NO_TUNNEL =
  process.argv.includes("--no-tunnel") || process.env.NO_TUNNEL === "1";
const VERBOSE = process.argv.includes("--verbose");
// 印199: 由 seeder 注入的 Phase1 CF URL (NO_TUNNEL模式下直接使用)
const CF_URL_INJECTED = process.env.CF_URL || "";

// LS Binary — auto-detect by platform/arch
const _arch = process.arch === "arm64" ? "arm" : "x64";
const LS_BINARY_DEFAULT =
  process.platform === "linux"
    ? `/opt/windsurf/language_server_linux_${_arch}`
    : path.join(os.homedir(), `.windsurf/language_server_macos_${_arch}`);
const LS_BINARY_PATH = process.env.LS_BINARY_PATH || LS_BINARY_DEFAULT;
const LS_DATA_DIR =
  process.env.LS_DATA_DIR || path.join(os.homedir(), ".dao/ls-data");
const LS_CSRF = "windsurf-api-csrf-fixed-token";
const LS_API_URL =
  process.env.LS_API_URL || "https://server.self-serve.windsurf.com";
const LS_REG_URL = "https://api.codeium.com/register_user/";

// LS binary download sources (fallback chain)
const LS_SOURCES = [
  `https://github.com/dwgx/WindsurfAPI/releases/latest/download/language_server_linux_${_arch}`,
  `https://github.com/CaiJingLong/windsurf-linux-server-release/releases/latest/download/language_server_linux_${_arch}`,
];

// Paths
const DAO_HOME = path.join(os.homedir(), ".dao");
const ACCOUNTS_FILE =
  process.env.ACCOUNTS_FILE || path.join(DAO_HOME, "vm_accounts.json");
const DEVIN_FILE = path.join(DAO_HOME, "vm_devin.json");
const SP_FILE = path.join(DAO_HOME, "vm_sp.txt");
const CFURL_FILE = path.join(DAO_HOME, "vm_cf.url");

let REQ_COUNT = 0;
let lsProc = null;
let lsReady = false;
let cfProc = null;
let cfUrl = null;
let globalSP = "";

// ═══════════════════════════════════════════════════════════════
// §1 · 日志
// ═══════════════════════════════════════════════════════════════

const _ts = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const log = (tag, msg) => console.log(`[${_ts()}][${tag}] ${msg}`);
const dbg = (tag, msg) => {
  if (VERBOSE) console.log(`[${_ts()}][DBG:${tag}] ${msg}`);
};
const lerr = (tag, msg) => console.error(`[${_ts()}][ERR:${tag}] ${msg}`);

// ═══════════════════════════════════════════════════════════════
// §2 · Proto编码 (纯手工，零外部依赖)
// ═══════════════════════════════════════════════════════════════

function encVI(n) {
  // Varint encode (supports up to 53-bit JS safe integers)
  const b = [];
  while (n > 127) {
    b.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  b.push(n & 0x7f);
  return Buffer.from(b);
}
const encTag = (f, w) => encVI((f << 3) | w);
const encStr = (f, s) => {
  if (s == null || s === "") return Buffer.alloc(0);
  const b = Buffer.from(String(s), "utf8");
  return Buffer.concat([encTag(f, 2), encVI(b.length), b]);
};
const encMsg = (f, buf) => {
  if (!buf || !buf.length) return Buffer.alloc(0);
  return Buffer.concat([encTag(f, 2), encVI(buf.length), buf]);
};
const encInt = (f, v) => Buffer.concat([encTag(f, 0), encVI(v)]);
const encBool = (f, v) => encInt(f, v ? 1 : 0);

// gRPC frame: 1 byte (0=no compression) + 4 bytes BE length + payload
function grpcFrame(buf) {
  const frame = Buffer.alloc(5 + buf.length);
  frame[0] = 0;
  frame.writeUInt32BE(buf.length, 1);
  buf.copy(frame, 5);
  return frame;
}

// Minimal proto parser (handles wire types 0, 2 only)
function parseProto(buf) {
  const fields = {};
  let pos = 0;
  while (pos < buf.length) {
    let tag = 0,
      shift = 0;
    while (pos < buf.length) {
      const b = buf[pos++];
      tag |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    const fn = tag >> 3,
      wt = tag & 0x7;
    if (wt === 0) {
      let v = 0,
        sh = 0;
      while (pos < buf.length) {
        const b = buf[pos++];
        v |= (b & 0x7f) << sh;
        if (!(b & 0x80)) break;
        sh += 7;
      }
      if (!fields[fn]) fields[fn] = [];
      fields[fn].push({ wt: 0, v });
    } else if (wt === 2) {
      let len = 0,
        sh = 0;
      while (pos < buf.length) {
        const b = buf[pos++];
        len |= (b & 0x7f) << sh;
        if (!(b & 0x80)) break;
        sh += 7;
      }
      const data = buf.slice(pos, pos + len);
      pos += len;
      if (!fields[fn]) fields[fn] = [];
      fields[fn].push({ wt: 2, v: data });
    } else if (wt === 5) {
      pos += 4;
    } else if (wt === 1) {
      pos += 8;
    } else {
      break;
    }
  }
  return fields;
}
const pStr = (fields, f) =>
  fields[f] && fields[f][0] && fields[f][0].wt === 2
    ? fields[f][0].v.toString("utf8")
    : "";
const pInt = (fields, f) =>
  fields[f] && fields[f][0] && fields[f][0].wt === 0 ? fields[f][0].v : 0;

// ═══════════════════════════════════════════════════════════════
// §3 · Proto消息构建 (LanguageServerService格式·已验证)
// ═══════════════════════════════════════════════════════════════

const SRC = { USER: 1, SYSTEM: 2, ASSISTANT: 3 };

function buildTimestamp() {
  const now = Date.now();
  return Buffer.concat([
    encInt(1, Math.floor(now / 1000)),
    encInt(2, (now % 1000) * 1_000_000),
  ]);
}

function buildMetadata(apiKey, sessionId) {
  const ver = "1.9600.41"; // Extension version (matches LS expectations)
  return Buffer.concat([
    encStr(1, "windsurf"), // ide_name
    encStr(2, ver), // extension_version
    encStr(3, apiKey), // api_key
    encStr(4, "en"), // locale
    encStr(5, "linux"), // os
    encStr(7, ver), // ide_version
    encStr(8, "x86_64"), // hardware
    encInt(9, Date.now()), // request_id
    encStr(10, sessionId || crypto.randomUUID()), // session_id
    encStr(12, "windsurf"), // extension_name
  ]);
}

function buildChatMsg(content, source, convId) {
  const parts = [
    encStr(1, crypto.randomUUID()), // message_id
    encInt(2, source), // source enum
    encMsg(3, buildTimestamp()), // timestamp
    encStr(4, convId), // conversation_id
  ];
  if (source === SRC.ASSISTANT) {
    parts.push(encStr(5, content)); // assistant: plain text in field 5
  } else {
    // user/system: ChatMessageIntent { IntentGeneric { text(f1) } }
    parts.push(encMsg(5, encMsg(1, encStr(1, content))));
  }
  return Buffer.concat(parts);
}

/**
 * Build RawGetChatMessageRequest
 * Field 1: Metadata
 * Field 2: repeated ChatMessage
 * Field 3: system_prompt_override
 * Field 4: model enum (0 = use name)
 * Field 5: chat_model_name
 */
function buildRawGetChatReq(apiKey, messages, modelName, sessionId) {
  const convId = crypto.randomUUID();
  const parts = [encMsg(1, buildMetadata(apiKey, sessionId))];
  let sysPmt = "";

  for (const msg of messages) {
    if (msg.role === "system") {
      sysPmt +=
        (sysPmt ? "\n" : "") +
        (typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content));
      continue;
    }
    const src = msg.role === "assistant" ? SRC.ASSISTANT : SRC.USER;
    const text =
      typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content
              .filter((c) => c.type === "text")
              .map((c) => c.text)
              .join("\n")
          : JSON.stringify(msg.content);
    parts.push(encMsg(2, buildChatMsg(text, src, convId)));
  }

  if (sysPmt) parts.push(encStr(3, sysPmt)); // system_prompt_override
  parts.push(encInt(4, 0)); // model enum = 0 (use name)
  if (modelName) parts.push(encStr(5, modelName));

  return Buffer.concat(parts);
}

// ═══════════════════════════════════════════════════════════════
// §4 · gRPC Stream Client (HTTP/2 to LS, pure http2 builtin)
// ═══════════════════════════════════════════════════════════════

function grpcStream(
  lsPort,
  svcPath,
  frameBody,
  { onData, onEnd, onError, timeout = 180000 },
) {
  let done = false;
  const client = http2.connect(`http://127.0.0.1:${lsPort}`);
  client.on("error", (e) => {
    if (!done) {
      done = true;
      onError(e);
    }
    try {
      client.close();
    } catch {}
  });

  const req = client.request({
    ":method": "POST",
    ":path": svcPath,
    ":scheme": "http",
    "content-type": "application/grpc",
    "x-csrf-token": LS_CSRF,
    te: "trailers",
  });

  const timer = setTimeout(() => {
    if (!done) {
      done = true;
      req.destroy();
      try {
        client.close();
      } catch {}
      onError(new Error("gRPC timeout"));
    }
  }, timeout);

  let buf = Buffer.alloc(0);

  req.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    // Parse complete gRPC frames from accumulated buffer
    while (buf.length >= 5) {
      const frameLen = buf.readUInt32BE(1);
      if (buf.length < 5 + frameLen) break;
      const compFlag = buf[0];
      const payload = buf.slice(5, 5 + frameLen);
      buf = buf.slice(5 + frameLen);
      if (compFlag === 0 && frameLen > 0) onData(payload);
    }
  });

  req.on("end", () => {
    clearTimeout(timer);
    try {
      client.close();
    } catch {}
    if (!done) {
      done = true;
      onEnd();
    }
  });

  req.on("error", (e) => {
    clearTimeout(timer);
    try {
      client.close();
    } catch {}
    if (!done) {
      done = true;
      onError(e);
    }
  });

  req.write(frameBody);
  req.end();
}

// ═══════════════════════════════════════════════════════════════
// §4.5 · HTTPS helper (RegisterUser · Devin API)
// ═══════════════════════════════════════════════════════════════

function httpsPost(hostname, pathname, bodyBuf, extraHeaders, timeout) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname,
        port: 443,
        path: pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/proto",
          "Connect-Protocol-Version": "1",
          "Content-Length": bodyBuf.length,
          ...(extraHeaders || {}),
        },
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.setTimeout(timeout || 20000, () => {
      req.destroy();
      resolve({ status: 0, body: Buffer.alloc(0) });
    });
    req.on("error", () => resolve({ status: 0, body: Buffer.alloc(0) }));
    req.write(bodyBuf);
    req.end();
  });
}

/**
 * registerUser — devin-session-token → sk-ws-01-... API key
 * SeatManagementService/RegisterUser (Connect-RPC over HTTPS)
 * Non-Trial账号返回 sk-ws-01-... | Trial账号返回 devin-session-token$ 本身
 */
async function registerUser(sessionToken) {
  const body = encStr(1, sessionToken);
  const hosts = ["register.windsurf.com", "server.codeium.com"];
  for (const host of hosts) {
    try {
      const r = await httpsPost(
        host,
        "/exa.seat_management_pb.SeatManagementService/RegisterUser",
        body,
      );
      if (r.status === 200 && r.body.length > 5) {
        const f = parseProto(r.body);
        const ak = pStr(f, 1);
        if (
          ak &&
          (ak.startsWith("sk-ws-") || ak.startsWith("devin-session-token$"))
        )
          return ak;
      }
    } catch {}
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// §5 · Account Pool (账号池·轮转·健康管理)
// ═══════════════════════════════════════════════════════════════

class AccountPool {
  constructor() {
    this._accs = [];
    this._idx = 0;
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(ACCOUNTS_FILE)) {
        const raw = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
        const arr = Array.isArray(raw) ? raw : raw.accounts || [];
        // Normalize: ensure all required fields have defaults
        this._accs = arr
          .filter((a) => a.apiKey)
          .map((a) => ({
            id: a.id || crypto.randomUUID(),
            email: a.email || "",
            apiKey: a.apiKey,
            source: a.source || "loaded",
            status: a.status || "active", // CRITICAL: default active
            errors: a.errors || 0,
            lastUsed: a.lastUsed || 0,
            cooldownUntil: a.cooldownUntil || 0,
            sessionId: a.sessionId || crypto.randomUUID(),
          }));
        log(
          "POOL",
          `Loaded ${this._accs.length} accounts from ${ACCOUNTS_FILE}`,
        );
      }
    } catch (e) {
      log("POOL", `Load error: ${e.message}`);
    }
  }

  _save() {
    try {
      fs.mkdirSync(DAO_HOME, { recursive: true });
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(this._accs, null, 2));
    } catch (e) {
      log("POOL", `Save error: ${e.message}`);
    }
  }

  // Add or update account
  add(email, apiKey, source = "manual") {
    if (!apiKey) return false;
    const ex = this._accs.find(
      (a) => a.apiKey === apiKey || (email && a.email === email),
    );
    if (ex) {
      ex.apiKey = apiKey;
      ex.status = "active";
      ex.errors = 0;
      ex.cooldownUntil = 0;
      this._save();
      return false; // updated
    }
    this._accs.push({
      id: crypto.randomUUID(),
      email: email || `acc_${Date.now()}`,
      apiKey,
      source,
      status: "active",
      errors: 0,
      lastUsed: 0,
      cooldownUntil: 0,
      sessionId: crypto.randomUUID(),
    });
    this._save();
    return true; // added
  }

  remove(emailOrId) {
    const n = this._accs.length;
    this._accs = this._accs.filter(
      (a) => a.email !== emailOrId && a.id !== emailOrId,
    );
    if (this._accs.length < n) {
      this._save();
      return true;
    }
    return false;
  }

  // Round-robin pick of available account
  pick() {
    const now = Date.now();
    const active = this._accs.filter(
      (a) =>
        a.status === "active" &&
        a.apiKey &&
        (!a.cooldownUntil || a.cooldownUntil < now),
    );
    if (!active.length) return null;
    const acc = active[this._idx % active.length];
    this._idx = (this._idx + 1) % active.length;
    acc.lastUsed = now;
    return acc;
  }

  markError(id, isAuth = false) {
    const a = this._accs.find((x) => x.id === id);
    if (!a) return;
    a.errors = (a.errors || 0) + 1;
    if (isAuth || a.errors >= 5) {
      a.status = "disabled";
      log("POOL", `Account ${a.email} disabled (errors=${a.errors})`);
    } else {
      a.cooldownUntil = Date.now() + 60_000; // 1 min cooling
    }
    this._save();
  }

  markCooldown(id, ms = 60_000) {
    const a = this._accs.find((x) => x.id === id);
    if (!a) return;
    a.cooldownUntil = Date.now() + ms;
    this._save();
  }

  resetCooldowns() {
    this._accs.forEach((a) => {
      a.cooldownUntil = 0;
      a.errors = 0;
    });
    this._save();
    log("POOL", `Reset cooldowns for ${this._accs.length} accounts`);
  }

  get total() {
    return this._accs.length;
  }
  get available() {
    const now = Date.now();
    return this._accs.filter(
      (a) =>
        a.status === "active" && (!a.cooldownUntil || a.cooldownUntil < now),
    ).length;
  }
  get list() {
    return this._accs;
  }
}

const pool = new AccountPool();

// ═══════════════════════════════════════════════════════════════
// §6 · Language Server 管理
// ═══════════════════════════════════════════════════════════════

async function downloadLSBinary() {
  log("LS", `Binary not found at: ${LS_BINARY_PATH}`);
  log("LS", "Attempting auto-download...");
  const dir = path.dirname(LS_BINARY_PATH);
  fs.mkdirSync(dir, { recursive: true });

  // 1. Try direct download from known releases
  for (const url of LS_SOURCES) {
    log("LS", `Trying: ${url}`);
    try {
      await new Promise((resolve, reject) => {
        const tmp = LS_BINARY_PATH + ".download";
        const follow = (u, depth = 0) => {
          if (depth > 8) return reject(new Error("Too many redirects"));
          const pu = new URL(u);
          const mod = pu.protocol === "https:" ? https : http;
          const req = mod.get(
            u,
            { headers: { "User-Agent": "dao-vm-engine/1.0" } },
            (res) => {
              if ([301, 302, 307, 308].includes(res.statusCode))
                return follow(res.headers.location, depth + 1);
              if (res.statusCode !== 200)
                return reject(new Error(`HTTP ${res.statusCode}`));
              const out = fs.createWriteStream(tmp);
              res.pipe(out);
              out.on("finish", () => {
                out.close();
                resolve();
              });
              out.on("error", reject);
            },
          );
          req.on("error", reject);
          req.setTimeout(120_000, () => {
            req.destroy();
            reject(new Error("Download timeout"));
          });
        };
        follow(url);
      });
      // Verify file is not HTML (error page)
      const stat = fs.statSync(LS_BINARY_PATH + ".download");
      if (stat.size < 1_000_000)
        throw new Error(
          `File too small (${stat.size} bytes) — likely an error page`,
        );
      fs.renameSync(LS_BINARY_PATH + ".download", LS_BINARY_PATH);
      fs.chmodSync(LS_BINARY_PATH, 0o755);
      log(
        "LS",
        `Downloaded: ${LS_BINARY_PATH} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`,
      );
      return true;
    } catch (e) {
      log("LS", `  Failed: ${e.message}`);
      try {
        fs.unlinkSync(LS_BINARY_PATH + ".download");
      } catch {}
    }
  }

  // 2. Fallback: apt install windsurf
  if (process.platform === "linux") {
    log("LS", "Trying apt install windsurf...");
    try {
      execSync(
        [
          "curl -fsSL https://windsurf-stable.codeiumdata.com/wVxQEIWkwPUEAGf3/windsurf.gpg",
          "| sudo gpg --dearmor -o /usr/share/keyrings/windsurf-stable-archive-keyring.gpg 2>/dev/null",
        ].join(" "),
        { timeout: 30_000, stdio: "pipe" },
      );
      execSync(
        'echo "deb [signed-by=/usr/share/keyrings/windsurf-stable-archive-keyring.gpg arch=amd64] ' +
          'https://windsurf-stable.codeiumdata.com/wVxQEIWkwPUEAGf3/apt stable main" ' +
          "| sudo tee /etc/apt/sources.list.d/windsurf.list > /dev/null",
        { timeout: 10_000, stdio: "pipe" },
      );
      execSync(
        "sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq && sudo apt-get install -y windsurf",
        {
          timeout: 180_000,
          stdio: "inherit",
        },
      );
      const aptBin = `/opt/windsurf/language_server_linux_${_arch}`;
      if (fs.existsSync(aptBin)) {
        if (LS_BINARY_PATH !== aptBin) {
          fs.mkdirSync(path.dirname(LS_BINARY_PATH), { recursive: true });
          fs.copyFileSync(aptBin, LS_BINARY_PATH);
          fs.chmodSync(LS_BINARY_PATH, 0o755);
        }
        log("LS", `Installed via apt windsurf: ${LS_BINARY_PATH}`);
        return true;
      }
    } catch (e) {
      log("LS", `apt install failed: ${e.message.slice(0, 120)}`);
    }
  }

  lerr("LS", "=== Cannot obtain language server binary ===");
  lerr("LS", `Manual install options:`);
  lerr("LS", `  1. sudo apt-get install windsurf`);
  lerr("LS", `  2. Download from: ${LS_SOURCES[0]}`);
  lerr(
    "LS",
    `     cp language_server_linux_x64 ${LS_BINARY_PATH} && chmod +x ${LS_BINARY_PATH}`,
  );
  return false;
}

async function startLS() {
  // NO_LS=1 → skip entirely (fast startup, Cascade Pool B unavailable)
  if (process.env.NO_LS === "1") {
    log(
      "LS",
      "Skipped (NO_LS=1) — Cascade Pool B unavailable, Pool A/C still active",
    );
    return false;
  }
  // Ensure LS binary exists
  if (!fs.existsSync(LS_BINARY_PATH)) {
    const ok = await downloadLSBinary();
    if (!ok) return false;
  }

  // Prepare data dirs
  fs.mkdirSync(path.join(LS_DATA_DIR, "db"), { recursive: true });
  try {
    fs.mkdirSync("/tmp/windsurf-workspace", { recursive: true });
  } catch {}

  const args = [
    `--api_server_url=${LS_API_URL}`,
    `--server_port=${LS_PORT}`,
    `--csrf_token=${LS_CSRF}`,
    `--register_user_url=${LS_REG_URL}`,
    `--codeium_dir=${LS_DATA_DIR}`,
    `--database_dir=${path.join(LS_DATA_DIR, "db")}`,
    "--enable_local_search=false",
    "--enable_index_service=false",
    "--enable_lsp=false",
    "--detect_proxy=false",
  ];

  log("LS", `Spawning: ${LS_BINARY_PATH}`);
  log("LS", `Args: ${args.slice(0, 4).join(" ")} ...`);

  lsProc = spawn(LS_BINARY_PATH, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, HOME: process.env.HOME || "/root" },
  });

  lsProc.stdout.on("data", (d) => dbg("LS", d.toString().trim().slice(0, 200)));
  lsProc.stderr.on("data", (d) => dbg("LS", d.toString().trim().slice(0, 200)));
  lsProc.on("exit", (code, sig) => {
    log("LS", `Exited code=${code} sig=${sig} — restarting in 5s`);
    lsReady = false;
    lsProc = null;
    setTimeout(startLS, 5_000);
  });
  lsProc.on("error", (e) => {
    lerr("LS", `Spawn error: ${e.message}`);
    lsReady = false;
  });

  // Poll until HTTP/2 port responds
  log("LS", `Waiting for LS on port ${LS_PORT}...`);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const ready = await new Promise((resolve) => {
      const client = http2.connect(`http://127.0.0.1:${LS_PORT}`);
      client.on("connect", () => {
        try {
          client.close();
        } catch {}
        resolve(true);
      });
      client.on("error", () => {
        try {
          client.close();
        } catch {}
        resolve(false);
      });
      setTimeout(() => {
        try {
          client.close();
        } catch {}
        resolve(false);
      }, 1500);
    });
    if (ready) {
      lsReady = true;
      log(
        "LS",
        `✓ Language Server ready on port ${LS_PORT} (PID=${lsProc?.pid})`,
      );
      return true;
    }
  }

  lerr("LS", "Language Server did not start within 40s");
  return false;
}

// ═══════════════════════════════════════════════════════════════
// §7 · Cascade Chat (via LS · RawGetChatMessage)
// ═══════════════════════════════════════════════════════════════

/**
 * cascadeChat — 主推理函数
 *
 * 策略: 账号轮转 → LS gRPC RawGetChatMessage
 * 错误处理:
 *   rate_limit/resource_exhausted → 60s冷却 → 继续轮转
 *   unauthenticated/auth_fail     → 账号禁用 → 继续轮转
 *   empty/network                 → 30s冷却 → 继续轮转
 *
 * @param {Array}    messages  OpenAI-format messages
 * @param {string}   modelName  Model name string
 * @param {Function} onDelta   Streaming callback (optional)
 * @param {number}   timeout   Timeout in ms
 */
function cascadeChat(messages, modelName, onDelta, timeout = 180_000) {
  return new Promise((resolve) => {
    if (!lsReady)
      return resolve({ ok: false, error: "Language Server not ready" });

    const tried = new Set();
    const maxTries = Math.min(Math.max(pool.total, 1), 10);

    const attempt = () => {
      const acc = pool.pick();
      if (!acc)
        return resolve({
          ok: false,
          error:
            tried.size === 0
              ? "no accounts configured"
              : "all accounts cooling",
        });
      if (tried.has(acc.id) && tried.size >= pool.available) {
        return resolve({ ok: false, error: "all accounts cooling" });
      }
      tried.add(acc.id);

      const reqBuf = buildRawGetChatReq(
        acc.apiKey,
        messages,
        modelName,
        acc.sessionId,
      );
      const body = grpcFrame(reqBuf);

      let text = "";
      let streamErr = null;

      grpcStream(
        LS_PORT,
        "/exa.language_server_pb.LanguageServerService/RawGetChatMessage",
        body,
        {
          timeout,
          onData: (payload) => {
            // Parse RawGetChatMessageResponse { RawChatMessage delta_message = 1 }
            // RawChatMessage { string text=5, bool is_error=7 }
            const outer = parseProto(payload);
            const dmBuf = outer[1] && outer[1][0] ? outer[1][0].v : null;
            if (!dmBuf) return;
            const dm = parseProto(dmBuf);
            if (pInt(dm, 7) === 1) {
              // is_error
              streamErr = pStr(dm, 5) || "stream error";
              return;
            }
            const chunk = pStr(dm, 5);
            if (chunk) {
              text += chunk;
              if (onDelta) onDelta(chunk);
            }
          },
          onEnd: () => {
            if (streamErr && !text) {
              const isAuth =
                /unauthenticated|permission_denied|invalid.api.key/i.test(
                  streamErr,
                );
              const isQuota = /resource_exhausted|rate.?limit/i.test(streamErr);
              if (isAuth) pool.markError(acc.id, true);
              else pool.markCooldown(acc.id, isQuota ? 60_000 : 30_000);
              log("POOL", `${acc.email} → ${streamErr.slice(0, 80)}`);
              if (tried.size < maxTries) return attempt();
              return resolve({ ok: false, error: streamErr });
            }
            if (text) {
              acc.errors = 0; // reset error count on success
              return resolve({ ok: true, text, email: acc.email });
            }
            pool.markCooldown(acc.id, 30_000);
            if (tried.size < maxTries) return attempt();
            resolve({ ok: false, error: "empty response" });
          },
          onError: (e) => {
            pool.markCooldown(acc.id, 30_000);
            log("POOL", `${acc.email} network error: ${e.message}`);
            if (tried.size < maxTries) return attempt();
            resolve({ ok: false, error: e.message });
          },
        },
      );
    };

    attempt();
  });
}

// ═══════════════════════════════════════════════════════════════
// §8 · Devin Cloud Pool & Proxy
// ═══════════════════════════════════════════════════════════════

class DevinPool {
  constructor() {
    this._tokens = [];
    this._idx = 0;
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(DEVIN_FILE)) {
        this._tokens = JSON.parse(fs.readFileSync(DEVIN_FILE, "utf8"));
        log("DEVIN", `Loaded ${this._tokens.length} tokens`);
      }
    } catch {}
  }

  _save() {
    try {
      fs.mkdirSync(DAO_HOME, { recursive: true });
      fs.writeFileSync(DEVIN_FILE, JSON.stringify(this._tokens, null, 2));
    } catch {}
  }

  add(token, name = "") {
    if (this._tokens.find((t) => t.token === token)) return false;
    this._tokens.push({ token, name, addedAt: Date.now(), errors: 0 });
    this._save();
    return true;
  }

  remove(token) {
    const n = this._tokens.length;
    this._tokens = this._tokens.filter((t) => t.token !== token);
    if (this._tokens.length < n) {
      this._save();
      return true;
    }
    return false;
  }

  pick() {
    const active = this._tokens.filter((t) => (t.errors || 0) < 5);
    if (!active.length) return null;
    const t = active[this._idx % active.length];
    this._idx = (this._idx + 1) % active.length;
    return t;
  }

  get total() {
    return this._tokens.length;
  }
  get list() {
    return this._tokens;
  }
}

const devinPool = new DevinPool();

// 印200 · HTTPS_PROXY 支持 (本机环境 api.cognition.ai DNS不可达时走代理)
// 优先尝试 https-proxy-agent (如可用), 兜底用原生 net.connect+CONNECT 隧道
let _DEVIN_PROXY_AGENT = null;
let _DEVIN_PROXY_TRIED = false;
function _getDevinProxyAgent() {
  if (_DEVIN_PROXY_TRIED) return _DEVIN_PROXY_AGENT;
  _DEVIN_PROXY_TRIED = true;
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (!proxy) return null;
  try {
    const { HttpsProxyAgent } = require("https-proxy-agent");
    _DEVIN_PROXY_AGENT = new HttpsProxyAgent(proxy);
    log("DEVIN", `proxy enabled via https-proxy-agent: ${proxy}`);
  } catch {
    // fallback: 原生 CONNECT 隧道 (无依赖)
    const net = require("net");
    const tls = require("tls");
    const pu = new (require("url").URL)(proxy);
    _DEVIN_PROXY_AGENT = new https.Agent({
      keepAlive: false,
      createConnection(opts, cb) {
        const sock = net.connect(
          { host: pu.hostname, port: parseInt(pu.port) || 80 },
          () => {
            sock.write(
              `CONNECT ${opts.host}:${opts.port} HTTP/1.1\r\nHost: ${opts.host}:${opts.port}\r\n\r\n`,
            );
          },
        );
        let buf = "";
        const onData = (chunk) => {
          buf += chunk.toString("binary");
          if (buf.includes("\r\n\r\n")) {
            sock.removeListener("data", onData);
            if (/^HTTP\/1\.[01] 200/.test(buf)) {
              const tlsSock = tls.connect({
                socket: sock,
                servername: opts.host,
                ALPNProtocols: ["http/1.1"],
              });
              cb(null, tlsSock);
            } else {
              cb(new Error("proxy CONNECT failed: " + buf.split("\r\n")[0]));
            }
          }
        };
        sock.on("data", onData);
        sock.on("error", cb);
      },
    });
    log("DEVIN", `proxy enabled via native CONNECT tunnel: ${proxy}`);
  }
  return _DEVIN_PROXY_AGENT;
}

function devinReq(method, endpoint, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: "api.cognition.ai",
      port: 443,
      path: endpoint,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };
    if (data) opts.headers["Content-Length"] = Buffer.byteLength(data);
    const ag = _getDevinProxyAgent();
    if (ag) opts.agent = ag;
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(30_000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (data) req.write(data);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// §8.7 · WS Direct Pool (印196 · Pool B · ConnectRPC直连无需LS)
// ═══════════════════════════════════════════════════════════════

// WS直连池: sk-ws tokens 直连 server.codeium.com (ConnectRPC HTTP/2)
// NO_LS=1 时作为 Cascade 主路; LS就绪时作为备用
const WS_DIRECT_HOST = process.env.WS_DIRECT_HOST || "server.codeium.com";
const WS_DIRECT_PATH = "/exa.api_server_pb.ApiServerService/GetChatMessage";

const wsPool = {
  tokens: [], // [{apiKey, cooldownUntil, errors, usageCount, label}]
  cursor: 0,
  metrics: { requests: 0, ok: 0, fail: 0 },
};

function wsPoolLoad() {
  // 印197: Also accept devin-session-token$ in wsPool (try server.codeium.com)
  const files = [
    process.env.WS_TOKENS_FILE,
    path.join(os.homedir(), "app", "tokens_ws.txt"),
    path.join(DAO_HOME, "tokens_ws.txt"),
    path.join(DAO_HOME, "wam_tokens.txt"),
  ].filter(Boolean);
  const seen = new Set();
  for (const f of files) {
    try {
      if (!fs.existsSync(f)) continue;
      const lines = fs
        .readFileSync(f, "utf8")
        .split(/\r?\n/)
        .map(function (l) {
          return l.trim();
        })
        .filter(function (l) {
          return l && !l.startsWith("#");
        });
      for (const line of lines) {
        // 印197: devin-session-token$ tokens try both pools - keep in wsPool as fallback
        // (some endpoints accept this format via new register.windsurf.com)
        if (seen.has(line)) continue;
        seen.add(line);
        wsPool.tokens.push({
          apiKey: line,
          cooldownUntil: 0,
          errors: 0,
          usageCount: 0,
          label: line.slice(0, 20) + "...",
        });
      }
    } catch (_e) {
      /* ignore */
    }
  }
  if (wsPool.tokens.length)
    log("WS", "Pool B: " + wsPool.tokens.length + " sk-ws tokens loaded");
  // Also absorb accounts already in pool (sk-ws keys)
  for (const acc of pool.list) {
    if (acc.apiKey && acc.apiKey.startsWith("sk-ws") && !seen.has(acc.apiKey)) {
      seen.add(acc.apiKey);
      wsPool.tokens.push({
        apiKey: acc.apiKey,
        cooldownUntil: 0,
        errors: 0,
        usageCount: 0,
        label: acc.apiKey.slice(0, 20) + "...",
      });
    }
  }
}

function pickWsToken() {
  const now = Date.now();
  const alive = wsPool.tokens.filter(function (t) {
    return t.cooldownUntil <= now && t.errors < 5;
  });
  if (!alive.length) return null;
  const t = alive[wsPool.cursor % alive.length];
  wsPool.cursor = (wsPool.cursor + 1) % alive.length;
  return t;
}

function wsCooldown(tok, ms) {
  tok.cooldownUntil = Date.now() + (ms || 60000);
  tok.errors = (tok.errors || 0) + 1;
}

function wsDirectChat(messages, modelName, onDelta, timeout) {
  timeout = timeout || 120000;
  return new Promise(function (resolve) {
    const tok = pickWsToken();
    if (!tok)
      return resolve({ ok: false, error: "WS pool empty or all cooling" });
    const reqBuf = buildRawGetChatReq(
      tok.apiKey,
      messages,
      modelName || "claude-sonnet-4-6",
      crypto.randomUUID(),
    );
    const body = grpcFrame(reqBuf);
    wsPool.metrics.requests++;
    let text = "",
      streamErr = null,
      done = false;
    const timer = setTimeout(function () {
      if (!done) {
        done = true;
        wsCooldown(tok, 30000);
        wsPool.metrics.fail++;
        resolve({ ok: false, error: "WS timeout" });
      }
    }, timeout);
    let client;
    try {
      client = http2.connect("https://" + WS_DIRECT_HOST);
    } catch (e) {
      clearTimeout(timer);
      wsPool.metrics.fail++;
      return resolve({ ok: false, error: e.message });
    }
    client.on("error", function (e) {
      if (!done) {
        done = true;
        clearTimeout(timer);
        wsCooldown(tok, 15000);
        wsPool.metrics.fail++;
        resolve({ ok: false, error: e.message });
      }
      try {
        client.close();
      } catch (_e) {}
    });
    const req = client.request({
      ":method": "POST",
      ":path": WS_DIRECT_PATH,
      ":scheme": "https",
      "content-type": "application/grpc",
      authorization: "Bearer " + tok.apiKey,
      "connect-protocol-version": "1",
      te: "trailers",
    });
    let buf = Buffer.alloc(0);
    req.on("data", function (chunk) {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 5) {
        const fl = buf.readUInt32BE(1);
        if (buf.length < 5 + fl) break;
        const payload = buf.slice(5, 5 + fl);
        buf = buf.slice(5 + fl);
        if (fl > 0) {
          const outer = parseProto(payload);
          const dmBuf = outer[1] && outer[1][0] ? outer[1][0].v : null;
          if (!dmBuf) continue;
          const dm = parseProto(dmBuf);
          if (pInt(dm, 7) === 1) {
            streamErr = pStr(dm, 5) || "stream error";
            continue;
          }
          const ch = pStr(dm, 5);
          if (ch) {
            text += ch;
            if (onDelta) onDelta(ch);
          }
        }
      }
    });
    req.on("end", function () {
      clearTimeout(timer);
      try {
        client.close();
      } catch (_e) {}
      if (done) return;
      done = true;
      if (streamErr && !text) {
        const isAuth =
          /unauthenticated|permission_denied|invalid.api.key/i.test(streamErr);
        wsCooldown(tok, isAuth ? 86400000 : 60000);
        if (isAuth) tok.errors = 10;
        wsPool.metrics.fail++;
        return resolve({ ok: false, error: streamErr });
      }
      if (text) {
        wsPool.metrics.ok++;
        tok.errors = 0;
        tok.usageCount++;
        return resolve({ ok: true, text: text, pool: "ws" });
      }
      wsCooldown(tok, 30000);
      wsPool.metrics.fail++;
      resolve({ ok: false, error: "empty response" });
    });
    req.on("error", function (e) {
      clearTimeout(timer);
      try {
        client.close();
      } catch (_e) {}
      if (!done) {
        done = true;
        wsCooldown(tok, 15000);
        wsPool.metrics.fail++;
        resolve({ ok: false, error: e.message });
      }
    });
    req.write(body);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// §8.5 · External BYOK Pool (Anthropic / OpenAI / DeepSeek)
// ═══════════════════════════════════════════════════════════════

const EXT_FILE = path.join(DAO_HOME, "vm_external.json");
const EXT_PROVIDERS = {
  anthropic: {
    base: "api.anthropic.com",
    path: "/v1/messages",
    defaultModel: "claude-opus-4-5",
    models: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
    mkHeaders: (k) => ({ "x-api-key": k, "anthropic-version": "2023-06-01" }),
    mkBody: (msgs, model, stream) => ({
      model,
      max_tokens: 8192,
      stream,
      system: msgs.find((m) => m.role === "system")?.content,
      messages: msgs
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role,
          content:
            typeof m.content === "string"
              ? m.content
              : JSON.stringify(m.content),
        })),
    }),
    parseDelta: (d) => {
      try {
        return JSON.parse(d).delta?.text || null;
      } catch {
        return null;
      }
    },
  },
  openai: {
    base: "api.openai.com",
    path: "/v1/chat/completions",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4.1", "gpt-4o-mini", "o3", "o4-mini"],
    mkHeaders: (k) => ({ Authorization: `Bearer ${k}` }),
    mkBody: (msgs, model, stream) => ({ model, messages: msgs, stream }),
    parseDelta: (d) => {
      try {
        return JSON.parse(d).choices?.[0]?.delta?.content || null;
      } catch {
        return null;
      }
    },
  },
  deepseek: {
    base: "api.deepseek.com",
    path: "/v1/chat/completions",
    defaultModel: "deepseek-reasoner",
    models: ["deepseek-reasoner", "deepseek-chat"],
    mkHeaders: (k) => ({ Authorization: `Bearer ${k}` }),
    mkBody: (msgs, model, stream) => ({ model, messages: msgs, stream }),
    parseDelta: (d) => {
      try {
        return JSON.parse(d).choices?.[0]?.delta?.content || null;
      } catch {
        return null;
      }
    },
  },
};

class ExtPool {
  constructor() {
    this._keys = {};
    this._pos = {};
    this._load();
  }
  _load() {
    if (process.env.ANTHROPIC_API_KEY)
      this._keys.anthropic = [process.env.ANTHROPIC_API_KEY];
    if (process.env.OPENAI_API_KEY)
      this._keys.openai = [process.env.OPENAI_API_KEY];
    if (process.env.DEEPSEEK_API_KEY)
      this._keys.deepseek = [process.env.DEEPSEEK_API_KEY];
    try {
      if (fs.existsSync(EXT_FILE)) {
        const saved = JSON.parse(fs.readFileSync(EXT_FILE, "utf8"));
        for (const [p, keys] of Object.entries(saved)) {
          if (!this._keys[p]) this._keys[p] = [];
          this._keys[p].push(
            ...keys.filter((k) => !(this._keys[p] || []).includes(k)),
          );
        }
      }
    } catch {}
    const total = Object.values(this._keys).flat().length;
    if (total)
      log("EXT", `Loaded ${total} keys (${Object.keys(this._keys).join("/")})`);
  }
  _save() {
    try {
      const toSave = {};
      for (const [p, keys] of Object.entries(this._keys)) {
        const envKey = process.env[p.toUpperCase() + "_API_KEY"];
        toSave[p] = keys.filter((k) => k !== envKey);
      }
      fs.writeFileSync(EXT_FILE, JSON.stringify(toSave, null, 2));
    } catch {}
  }
  add(provider, key) {
    if (!this._keys[provider]) this._keys[provider] = [];
    if (this._keys[provider].includes(key)) return false;
    this._keys[provider].push(key);
    this._save();
    return true;
  }
  getKey(provider) {
    const arr = this._keys[provider];
    if (!arr?.length) return null;
    const i = (this._pos[provider] || 0) % arr.length;
    this._pos[provider] = i + 1;
    return arr[i];
  }
  listModels() {
    const result = [];
    for (const [p, keys] of Object.entries(this._keys)) {
      if (!keys?.length) continue;
      const def = EXT_PROVIDERS[p];
      if (!def) continue;
      for (const m of def.models)
        result.push({
          id: `${p}/${m}`,
          object: "model",
          owned_by: p,
          pool: "external",
        });
    }
    return result;
  }
  get total() {
    return Object.values(this._keys).flat().length;
  }
}

const extPool = new ExtPool();

async function extChat(provider, modelId, messages, onDelta, timeout) {
  const key = extPool.getKey(provider);
  if (!key) return { ok: false, error: `no ${provider} key` };
  const def = EXT_PROVIDERS[provider];
  if (!def) return { ok: false, error: `unknown provider: ${provider}` };
  return new Promise((resolve) => {
    const bodyObj = def.mkBody(messages, modelId || def.defaultModel, true);
    const data = Buffer.from(JSON.stringify(bodyObj));
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": String(data.length),
      ...def.mkHeaders(key),
    };
    const req = https.request(
      {
        hostname: def.base,
        port: 443,
        path: def.path,
        method: "POST",
        headers,
        rejectUnauthorized: false,
      },
      (res) => {
        let text = "",
          lineBuf = "";
        res.on("data", (chunk) => {
          lineBuf += chunk.toString();
          const lines = lineBuf.split("\n");
          lineBuf = lines.pop() || "";
          for (const line of lines) {
            const t = line.trim();
            if (!t || t === "data: [DONE]") continue;
            const d = t.startsWith("data: ") ? t.slice(6) : t;
            if (d === "[DONE]") continue;
            const delta = def.parseDelta(d);
            if (delta) {
              text += delta;
              if (onDelta) onDelta(delta);
            }
          }
        });
        res.on("end", () =>
          resolve({
            ok: !!text || res.statusCode === 200,
            text,
            provider,
            pool: "external",
          }),
        );
      },
    );
    req.setTimeout(timeout || 120000, () => {
      req.destroy();
      resolve({ ok: false, error: "timeout", provider });
    });
    req.on("error", (e) => resolve({ ok: false, error: e.message, provider }));
    req.write(data);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// §9 · Model Registry
// ═══════════════════════════════════════════════════════════════

const CASCADE_MODELS = [
  // —— Claude (Cascade直达) ——
  "claude-sonnet-4-6",
  "claude-sonnet-4-6-thinking",
  "claude-sonnet-4-6-thinking-1m",
  "claude-opus-4-6",
  "claude-opus-4-7-max",
  "claude-haiku-4-5",
  "claude-4-5-sonnet-thinking",
  "claude-opus-4-5",
  "claude-sonnet-4-5", // 常用别名
  // —— GPT ——
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-5-5",
  "o3",
  "o4-mini",
  "o1",
  // —— Gemini ——
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  // —— SWE (Windsurf专属) ——
  "swe-1.5",
  "swe-1.5-thinking",
  "swe-1.6-fast",
  "swe-1",
  // —— DeepSeek ——
  "deepseek-v3",
  "deepseek-r1",
  "deepseek-r2",
  // —— 其他 ——
  "grok-3",
  "grok-3-mini",
  "kimi-k2",
  "kimi-k2.5",
  "qwen-3",
  "qwen-3-coder",
  "arena-fast",
  "arena-smart",
  "llama-3.1-405b",
  "mistral-large",
].map((id) => ({ id, object: "model", owned_by: "cascade", pool: "cascade" }));

// —— Devin Cloud模型 (devin/model-name 格式) ——
const DEVIN_MODELS = [
  "devin", // 默认: Devin自选模型
  "devin/claude-opus-4-5",
  "devin/claude-sonnet-4-5",
  "devin/gpt-4o",
  "devin/o1",
  "devin/o3",
  "devin/deepseek-r1",
  "devin/deepseek-v3",
  "devin/gemini-2.5-pro",
  "devin/gemini-2.0-flash",
  "devin/grok-3",
].map((id) => ({
  id,
  object: "model",
  owned_by: "devin-cloud",
  pool: "devin",
}));

// ═══════════════════════════════════════════════════════════════
// §9.5 · LOCAL_MASTER 自注册 (印196)
// ═══════════════════════════════════════════════════════════════

function registerWithMaster(vmUrl, retry) {
  retry = retry || 0;
  if (!LOCAL_MASTER || !vmUrl) return;
  const now = Date.now();
  const payload = JSON.stringify({
    url: vmUrl,
    name: VM_NAME,
    version: VERSION,
    seal: SEAL196,
    cascade: { total: pool.total, available: pool.available },
    devin: { total: devinPool.total },
    wsPool: {
      total: wsPool.tokens.length,
      alive: wsPool.tokens.filter(function (t) {
        return t.cooldownUntil <= now;
      }).length,
    },
    ls: { ready: lsReady },
  });
  const body = Buffer.from(payload);
  let u;
  try {
    u = new URL("/vms/add", LOCAL_MASTER);
  } catch (e) {
    return;
  }
  const lib = u.protocol === "https:" ? https : http;
  const req = lib.request(
    {
      hostname: u.hostname,
      port: parseInt(u.port) || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body.length,
      },
      rejectUnauthorized: false,
    },
    function (res) {
      let d = "";
      res.on("data", function (c) {
        d += c;
      });
      res.on("end", function () {
        log(
          "MASTER",
          "Registered " + vmUrl + " → " + res.statusCode + " " + d.slice(0, 60),
        );
      });
    },
  );
  req.setTimeout(8000, function () {
    req.destroy();
  });
  req.on("error", function (e) {
    if (retry < 3)
      setTimeout(
        function () {
          registerWithMaster(vmUrl, retry + 1);
        },
        15000 * (retry + 1),
      );
    else log("MASTER", "Register failed: " + e.message);
  });
  req.write(body);
  req.end();
}

// ═══════════════════════════════════════════════════════════════
// §10 · cloudflare Tunnel
// ═══════════════════════════════════════════════════════════════

function detectCF() {
  const candidates = [
    "cloudflared",
    "/usr/local/bin/cloudflared",
    "/usr/bin/cloudflared",
    path.join(DAO_HOME, "cloudflared"),
  ];
  for (const c of candidates) {
    try {
      spawnSync(c, ["version"], { stdio: "pipe", timeout: 3_000 });
      return c;
    } catch {}
  }
  return null;
}

async function installCF() {
  if (process.platform !== "linux") return null;
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
  const dest = path.join(DAO_HOME, "cloudflared");
  log("CF", `Downloading cloudflared (${arch})...`);
  await new Promise((resolve, reject) => {
    const follow = (u, d = 0) => {
      if (d > 8) return reject(new Error("redirect loop"));
      https
        .get(u, { headers: { "User-Agent": "dao-vm-engine" } }, (res) => {
          if ([301, 302, 307].includes(res.statusCode))
            return follow(res.headers.location, d + 1);
          if (res.statusCode !== 200)
            return reject(new Error(`HTTP ${res.statusCode}`));
          const out = fs.createWriteStream(dest);
          res.pipe(out);
          out.on("finish", () => {
            out.close();
            resolve();
          });
          out.on("error", reject);
        })
        .on("error", reject);
    };
    follow(url);
  });
  fs.chmodSync(dest, 0o755);
  log("CF", `cloudflared installed: ${dest}`);
  return dest;
}

async function startTunnel() {
  if (NO_TUNNEL) {
    log("CF", "Tunnel disabled (--no-tunnel)");
    return;
  }
  let bin = detectCF();
  if (!bin) {
    try {
      bin = await installCF();
    } catch (e) {
      log("CF", `Install failed: ${e.message}`);
    }
  }
  if (!bin) {
    log("CF", "cloudflared not available — skipping tunnel");
    return;
  }

  log("CF", `Starting tunnel → http://localhost:${PORT}`);
  cfProc = spawn(
    bin,
    ["tunnel", "--url", `http://localhost:${PORT}`, "--no-autoupdate"],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const handleLine = (line) => {
    dbg("CF", line.trim());
    if (!cfUrl) {
      const m = line.match(/https?:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        cfUrl = m[0];
        log("CF", `🌐 Public URL: ${cfUrl}`);
        registerWithMaster(cfUrl);
        try {
          fs.mkdirSync(DAO_HOME, { recursive: true });
          fs.writeFileSync(CFURL_FILE, cfUrl);
        } catch {}
      }
    }
  };

  cfProc.stdout.on("data", (d) => d.toString().split("\n").forEach(handleLine));
  cfProc.stderr.on("data", (d) => d.toString().split("\n").forEach(handleLine));
  cfProc.on("exit", (code) => {
    log("CF", `Tunnel exited (${code}) — retry in 10s`);
    cfUrl = null;
    cfProc = null;
    if (!NO_TUNNEL) setTimeout(startTunnel, 10_000);
  });
}

// ═══════════════════════════════════════════════════════════════
// §11 · HTTP Server (OpenAI-compatible + Admin API)
// ═══════════════════════════════════════════════════════════════

const jsonRes = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data, null, 2));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => {
      b += c;
      if (b.length > 20e6) {
        req.destroy();
        reject(new Error("body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(b ? JSON.parse(b) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });

const sseWrite = (res, id, ts, model, content, role = null) => {
  if (res.destroyed) return;
  const delta = role ? { role, content: "" } : { content };
  res.write(
    `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: ts, model, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`,
  );
};
const sseDone = (res, id, ts, model) => {
  if (res.destroyed) return;
  res.write(
    `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: ts, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
  );
  res.write("data: [DONE]\n\n");
  res.end();
};

// 印198: devinChat — 将OpenAI消息转换为Devin任务, 等待完成并返回结果
async function devinChat(messages, model, onDelta) {
  const tk = devinPool.pick();
  if (!tk) return { ok: false, error: "no Devin tokens available" };
  // 构建任务提示词
  const sys = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n");
  const conv = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
  const prompt = sys ? `${sys}\n\n${conv}` : conv;
  const actualModel = model ? model.replace(/^devin\//, "") : undefined;
  try {
    const body = { prompt };
    if (actualModel && actualModel !== "devin") body.model = actualModel;
    const r = await devinReq("POST", "/v1/sessions", body, tk.token);
    if (r.status !== 200 && r.status !== 201) {
      tk.errors = (tk.errors || 0) + 1;
      return {
        ok: false,
        error: `Devin session ${r.status}: ${JSON.stringify(r.data).slice(0, 80)}`,
      };
    }
    const sid = r.data.session_id;
    if (!sid) return { ok: false, error: "no session_id" };
    // 轮询完成 (最多120秒)
    for (let i = 0; i < 24; i++) {
      await new Promise((ok) => setTimeout(ok, 5_000));
      const st = await devinReq("GET", `/v1/sessions/${sid}`, null, tk.token);
      if (st.status !== 200) continue;
      const stat = st.data.status;
      if (
        stat === "stopped" ||
        stat === "finished" ||
        stat === "failed" ||
        stat === "error"
      ) {
        const msgs =
          st.data.messages || st.data.structured_output?.messages || [];
        const last = [...msgs]
          .reverse()
          .find((m) => m.role === "assistant" || m.type === "assistant");
        const text =
          last?.content ||
          last?.message ||
          last?.text ||
          `Devin session ${stat}.`;
        if (onDelta) onDelta(text);
        return {
          ok: true,
          text,
          model: model || "devin",
          email: "devin-session",
        };
      }
    }
    return { ok: false, error: "Devin session timeout (120s)" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Route model to appropriate pool (cascade | external | devin)
function routeModel(model) {
  if (!model) return { pool: "cascade", modelId: "claude-sonnet-4-6" };
  const slash = model.indexOf("/");
  if (slash > 0) {
    const prov = model.slice(0, slash);
    if (EXT_PROVIDERS[prov])
      return {
        pool: "external",
        provider: prov,
        modelId: model.slice(slash + 1),
      };
    if (prov === "devin") return { pool: "devin", modelId: model };
  }
  if (model === "devin") return { pool: "devin", modelId: "devin" };
  // 印199: devin-* 系列模型路由到 devinPool
  if (model.startsWith("devin-")) return { pool: "devin", modelId: model };
  return { pool: "cascade", modelId: model };
}

// Inject SP into messages
function injectSP(messages, sp) {
  if (!sp) return messages;
  const msgs = [...messages];
  const sysIdx = msgs.findIndex((m) => m.role === "system");
  if (sysIdx >= 0) {
    msgs[sysIdx] = {
      ...msgs[sysIdx],
      content: sp + "\n\n" + msgs[sysIdx].content,
    };
  } else {
    msgs.unshift({ role: "system", content: sp });
  }
  return msgs;
}

async function handleChat(req, res) {
  const body = await readBody(req);
  const { model = "claude-sonnet-4-6", messages = [], stream = false } = body;
  const id = `chatcmpl-${Date.now()}`;
  const ts = Math.floor(Date.now() / 1000);
  REQ_COUNT++;
  log(
    "REQ",
    `#${REQ_COUNT} model=${model} stream=${stream} msgs=${messages.length}`,
  );

  // Build final message list with SP injection
  let finalMsgs = messages;
  const sp =
    globalSP ||
    (fs.existsSync(SP_FILE) ? fs.readFileSync(SP_FILE, "utf8").trim() : "");
  if (sp) finalMsgs = injectSP(finalMsgs, sp);
  // Per-request SP override via header
  const headerSP = req.headers["x-dao-sp"];
  if (headerSP)
    finalMsgs = injectSP(
      finalMsgs.filter((m) => m.role !== "system"),
      headerSP,
    );

  const _route = routeModel(model);

  // 印199: LOCAL_MASTER上游代理函数
  const _upstreamProxy = async (onDelta) => {
    if (!LOCAL_MASTER) return { ok: false, error: "no LOCAL_MASTER" };
    const upUrl = LOCAL_MASTER.replace(/\/$/, "") + "/v1/chat/completions";
    const bodyStr = JSON.stringify({
      model,
      messages: finalMsgs,
      stream: false,
    });
    try {
      const upResp = await new Promise((resolve, reject) => {
        const u = new URL(upUrl);
        const lib =
          u.protocol === "https:" ? require("https") : require("http");
        const opts = {
          hostname: u.hostname,
          port: parseInt(u.port) || (u.protocol === "https:" ? 443 : 80),
          path: u.pathname,
          method: "POST",
          rejectUnauthorized: false,
          timeout: 180_000,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(bodyStr),
            "User-Agent": "dao-vm-relay/199",
          },
        };
        const req2 = lib.request(opts, (res2) => {
          let d = "";
          res2.on("data", (c) => (d += c));
          res2.on("end", () => {
            try {
              resolve({ status: res2.statusCode, body: JSON.parse(d) });
            } catch {
              resolve({
                status: res2.statusCode,
                body: { error: { message: d.slice(0, 100) } },
              });
            }
          });
        });
        req2.on("error", reject);
        req2.on("timeout", () => {
          req2.destroy();
          reject(new Error("upstream timeout 180s"));
        });
        req2.write(bodyStr);
        req2.end();
      });
      const text = upResp.body?.choices?.[0]?.message?.content || "";
      if (text) {
        if (onDelta) onDelta(text);
        return { ok: true, text, model, email: "upstream-relay" };
      }
      return {
        ok: false,
        error: "upstream: " + (upResp.body?.error?.message || "empty"),
      };
    } catch (e) {
      return { ok: false, error: "upstream: " + e.message };
    }
  };

  // VM中继模式: 直接代理到LOCAL_MASTER
  if (VM_RELAY_MODE) {
    log("REQ", `#${REQ_COUNT} 中继模式代理 → ${LOCAL_MASTER}`);
  }

  // 带LOCAL_MASTER回退的执行函数
  const _execChat = async (onDelta) => {
    if (VM_RELAY_MODE) return _upstreamProxy(onDelta);
    if (_route.pool === "external")
      return extChat(_route.provider, _route.modelId, finalMsgs, onDelta);
    if (_route.pool === "devin") {
      const dr = await devinChat(finalMsgs, _route.modelId, onDelta);
      if (dr.ok) return dr;
      log("REQ", `devin失败(${dr.error}), 尝试上游LOCAL_MASTER`);
      return _upstreamProxy(onDelta);
    }
    const r = lsReady
      ? await cascadeChat(finalMsgs, _route.modelId, onDelta, 180_000)
      : await wsDirectChat(finalMsgs, _route.modelId, onDelta, 120_000);
    if (r.ok) return r;
    // 印199: wsDirectChat失败 → 尝试 devinPool fallback
    if (!r.ok && devinPool.total > 0) {
      log("REQ", `wsPool失败(${r.error}), fallback→devinPool`);
      const dr = await devinChat(finalMsgs, _route.modelId, onDelta);
      if (dr.ok) return dr;
      log("REQ", `devinPool也失败(${dr.error})`);
    }
    // 印199: 本地池全失败 → 回退LOCAL_MASTER
    if (LOCAL_MASTER && !r.ok) {
      log("REQ", `本地池全失败(${r.error}), 回退LOCAL_MASTER`);
      return _upstreamProxy(onDelta);
    }
    return r;
  };

  if (stream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    sseWrite(res, id, ts, model, "", "assistant");

    const r = await _execChat((delta) => sseWrite(res, id, ts, model, delta));

    if (r.ok) {
      sseDone(res, id, ts, model);
      log("REQ", `#${REQ_COUNT} ✓ ${r.text.length} chars (${r.email})`);
    } else {
      if (!res.destroyed) {
        res.write(`data: ${JSON.stringify({ error: r.error })}\n\n`);
        res.end();
      }
      log("REQ", `#${REQ_COUNT} ✗ ${r.error}`);
    }
  } else {
    const r = await _execChat(null);
    if (r.ok) {
      log("REQ", `#${REQ_COUNT} ✓ ${r.text.length} chars`);
      jsonRes(res, 200, {
        id,
        object: "chat.completion",
        created: ts,
        model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: r.text },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    } else {
      log("REQ", `#${REQ_COUNT} ✗ ${r.error}`);
      jsonRes(res, 503, {
        error: { message: r.error, type: "service_unavailable" },
      });
    }
  }
}

// Devin session create (POST /v1/devin/sessions)
async function handleDevinSession(req, res) {
  const body = await readBody(req);
  const token = devinPool.pick();
  if (!token) return jsonRes(res, 503, { error: "no Devin tokens available" });
  try {
    const r = await devinReq("POST", "/v1/sessions", body, token.token);
    jsonRes(res, r.status, r.data);
  } catch (e) {
    jsonRes(res, 500, { error: e.message });
  }
}

function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlObj = new URL(req.url || "/", `http://localhost:${PORT}`);
    const p = urlObj.pathname;

    try {
      // ─── Health ──────────────────────────────────────────
      if (p === "/health" || p === "/") {
        return jsonRes(res, 200, {
          ok: true,
          version: VERSION,
          engine: BRAND,
          uptime: Math.round((Date.now() - START_TIME) / 1000),
          requests: REQ_COUNT,
          ls: { ready: lsReady, port: LS_PORT, pid: lsProc?.pid || null },
          cascade: { total: pool.total, available: pool.available },
          devin: { total: devinPool.total },
          wsPool: {
            total: wsPool.tokens.length,
            alive: wsPool.tokens.filter(function (t) {
              return t.cooldownUntil <= Date.now();
            }).length,
            metrics: wsPool.metrics,
          },
          external: { total: extPool.total },
          tunnel: { url: cfUrl, active: !!cfUrl },
          sp: {
            active: !!(
              globalSP ||
              (fs.existsSync(SP_FILE)
                ? fs.readFileSync(SP_FILE, "utf8").trim()
                : "")
            ),
          },
        });
      }

      // ─── Models ──────────────────────────────────────────
      if (p === "/v1/models") {
        const devinModels = devinPool.total > 0 ? DEVIN_MODELS : [];
        return jsonRes(res, 200, {
          object: "list",
          data: [...CASCADE_MODELS, ...devinModels, ...extPool.listModels()],
          pools: {
            cascade: {
              total: pool.total,
              available: pool.available,
              ls: lsReady,
            },
            devin: { total: devinPool.total },
            ws: { total: wsPool.tokens.length },
            external: { total: extPool.total },
          },
        });
      }

      // ─── Chat Completions ─────────────────────────────────
      if (p === "/v1/chat/completions" && req.method === "POST") {
        return await handleChat(req, res);
      }

      // ─── Devin Sessions ──────────────────────────────────
      if (p === "/v1/devin/sessions" && req.method === "POST") {
        return await handleDevinSession(req, res);
      }

      // ─── /x-dao-sync 同步端点 (印199) ─────────────────────
      // 热更新引擎: 直接推送新版本无需重新spawn
      if (p === "/x-dao-sync" && req.method === "POST") {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", async () => {
          const body = Buffer.concat(chunks);
          if (body.length < 10000) {
            return jsonRes(res, 400, {
              error: "engine too small: " + body.length,
            });
          }
          const ENGINE = path.join(os.homedir(), "app/engine.js");
          const ENGINE_NEW = ENGINE + ".new";
          try {
            fs.mkdirSync(path.dirname(ENGINE), { recursive: true });
            fs.writeFileSync(ENGINE_NEW, body);
            // 应用请求头中的env覆盖
            const h = req.headers;
            const envPatch = {};
            if (h["x-local-master"])
              envPatch.LOCAL_MASTER = h["x-local-master"];
            if (h["x-dao-devin-token"])
              envPatch.DAO_DEVIN_TOKEN = h["x-dao-devin-token"];
            if (h["x-vm-name"]) envPatch.VM_NAME = h["x-vm-name"];
            if (h["x-vm-relay"]) envPatch.VM_RELAY = h["x-vm-relay"];
            // 先用测试端口验证
            const testPort = PORT + 10;
            const testEnv = {
              ...process.env,
              ...envPatch,
              PORT: String(testPort),
              NO_TUNNEL: "1",
            };
            const testProc = require("child_process").spawn(
              "node",
              [ENGINE_NEW],
              {
                env: testEnv,
                detached: true,
                stdio: "ignore",
              },
            );
            testProc.unref();
            // 等待测试进程启动
            await new Promise((r) => setTimeout(r, 8000));
            // 验证测试进程健康
            const testOk = await new Promise((resolve) => {
              require("http")
                .get(
                  {
                    hostname: "127.0.0.1",
                    port: testPort,
                    path: "/health",
                    timeout: 5000,
                  },
                  (r2) => {
                    let d = "";
                    r2.on("data", (c) => (d += c));
                    r2.on("end", () => {
                      try {
                        resolve(JSON.parse(d).ok === true);
                      } catch {
                        resolve(false);
                      }
                    });
                  },
                )
                .on("error", () => resolve(false))
                .on("timeout", function () {
                  this.destroy();
                  resolve(false);
                });
            });
            // 无论测试结果，都替换engine并重启（测试只是额外验证）
            try {
              testProc.kill();
            } catch (_) {}
            fs.renameSync(ENGINE_NEW, ENGINE);
            jsonRes(res, 200, {
              ok: true,
              size: body.length,
              engine: ENGINE,
              testOk,
              version: "2.5.0",
            });
            log(
              "UPGRADE",
              `engine updated ${body.length}B LOCAL_MASTER=${envPatch.LOCAL_MASTER || "(unchanged)"} testOk=${testOk}`,
            );
            // 延迟3s后用新引擎重启（当前请求已响应）
            setTimeout(() => {
              const newEnv = {
                ...process.env,
                ...envPatch,
                PORT: String(PORT),
                NO_TUNNEL: "1",
              };
              const newProc = require("child_process").spawn("node", [ENGINE], {
                env: newEnv,
                detached: true,
                stdio: "ignore",
              });
              newProc.unref();
              log("UPGRADE", "new engine started, exiting old...");
              setTimeout(() => process.exit(0), 2000);
            }, 3000);
          } catch (e) {
            try {
              fs.unlinkSync(ENGINE_NEW);
            } catch (_) {}
            jsonRes(res, 500, { error: e.message });
          }
        });
        return;
      }

      // ─── System Prompt (SP) ──────────────────────────────
      if (p === "/admin/sp") {
        if (req.method === "GET") {
          const sp =
            globalSP ||
            (fs.existsSync(SP_FILE)
              ? fs.readFileSync(SP_FILE, "utf8").trim()
              : "");
          return jsonRes(res, 200, { sp, active: !!sp });
        }
        if (req.method === "POST") {
          const b = await readBody(req);
          globalSP = b.sp || "";
          try {
            fs.mkdirSync(DAO_HOME, { recursive: true });
            fs.writeFileSync(SP_FILE, globalSP);
          } catch {}
          return jsonRes(res, 200, { ok: true, sp: globalSP });
        }
        if (req.method === "DELETE") {
          globalSP = "";
          try {
            fs.unlinkSync(SP_FILE);
          } catch {}
          return jsonRes(res, 200, { ok: true, cleared: true });
        }
      }

      // ─── Account Management ───────────────────────────────
      if (p === "/admin/accounts/list") {
        return jsonRes(res, 200, {
          total: pool.total,
          available: pool.available,
          accounts: pool.list.map((a) => ({
            id: a.id,
            email: a.email,
            source: a.source,
            status: a.status,
            errors: a.errors || 0,
            keyPrefix: a.apiKey ? a.apiKey.slice(0, 24) + "..." : null,
          })),
        });
      }

      if (p === "/admin/accounts/add" && req.method === "POST") {
        const b = await readBody(req);
        if (!b.apiKey) return jsonRes(res, 400, { error: "apiKey required" });
        const added = pool.add(b.email || "", b.apiKey, b.source || "api");
        return jsonRes(res, 200, {
          ok: true,
          added,
          total: pool.total,
          available: pool.available,
        });
      }

      if (p === "/admin/accounts/add-bulk" && req.method === "POST") {
        const b = await readBody(req);
        const items = Array.isArray(b) ? b : b.accounts || [];
        let added = 0,
          updated = 0;
        for (const item of items) {
          if (!item.apiKey) continue;
          pool.add(item.email || "", item.apiKey, item.source || "bulk")
            ? added++
            : updated++;
        }
        return jsonRes(res, 200, {
          ok: true,
          added,
          updated,
          total: pool.total,
        });
      }

      if (p === "/admin/accounts/remove" && req.method === "POST") {
        const b = await readBody(req);
        const ok = pool.remove(b.email || b.id || "");
        return jsonRes(res, 200, { ok, total: pool.total });
      }

      if (p === "/admin/accounts/reset" && req.method === "POST") {
        pool.resetCooldowns();
        return jsonRes(res, 200, {
          ok: true,
          total: pool.total,
          available: pool.available,
        });
      }

      if (p === "/admin/ws/add" && req.method === "POST") {
        const b = await readBody(req);
        const keys = Array.isArray(b.keys) ? b.keys : b.key ? [b.key] : [];
        let added = 0;
        for (const k of keys) {
          if (!k || typeof k !== "string") continue;
          const clean = k.trim();
          if (
            !clean ||
            wsPool.tokens.find(function (t) {
              return t.apiKey === clean;
            })
          )
            continue;
          wsPool.tokens.push({
            apiKey: clean,
            cooldownUntil: 0,
            errors: 0,
            usageCount: 0,
            label: clean.slice(0, 20) + "...",
          });
          added++;
        }
        return jsonRes(res, 200, {
          ok: true,
          added,
          total: wsPool.tokens.length,
        });
      }

      if (p === "/admin/ws/list") {
        const now = Date.now();
        return jsonRes(res, 200, {
          total: wsPool.tokens.length,
          alive: wsPool.tokens.filter(function (t) {
            return t.cooldownUntil <= now;
          }).length,
          metrics: wsPool.metrics,
          tokens: wsPool.tokens.map(function (t) {
            return {
              label: t.label,
              errors: t.errors,
              usageCount: t.usageCount,
              cooling: t.cooldownUntil > now,
            };
          }),
        });
      }

      if (p === "/admin/ws/reset" && req.method === "POST") {
        wsPool.tokens.forEach(function (t) {
          t.cooldownUntil = 0;
          t.errors = 0;
        });
        return jsonRes(res, 200, { ok: true, total: wsPool.tokens.length });
      }

      // ─── Devin Token Management ───────────────────────────
      if (p === "/admin/devin/list") {
        return jsonRes(res, 200, {
          total: devinPool.total,
          tokens: devinPool.list.map((t) => ({
            name: t.name,
            addedAt: t.addedAt,
            errors: t.errors,
            tokenPrefix: t.token.slice(0, 20) + "...",
          })),
        });
      }

      if (p === "/admin/devin/add" && req.method === "POST") {
        const b = await readBody(req);
        if (!b.token) return jsonRes(res, 400, { error: "token required" });
        const added = devinPool.add(b.token, b.name || "");
        return jsonRes(res, 200, { ok: true, added, total: devinPool.total });
      }

      if (p === "/admin/devin/remove" && req.method === "POST") {
        const b = await readBody(req);
        const ok = devinPool.remove(b.token);
        return jsonRes(res, 200, { ok, total: devinPool.total });
      }

      // ─── LS Management ────────────────────────────────────
      if (p === "/admin/ls/status") {
        return jsonRes(res, 200, {
          ready: lsReady,
          port: LS_PORT,
          binaryPath: LS_BINARY_PATH,
          binaryExists: fs.existsSync(LS_BINARY_PATH),
          pid: lsProc?.pid || null,
        });
      }

      if (p === "/admin/ls/restart" && req.method === "POST") {
        if (lsProc) {
          try {
            lsProc.kill("SIGTERM");
          } catch {}
        }
        lsReady = false;
        setTimeout(startLS, 1_000);
        return jsonRes(res, 200, { ok: true, message: "LS restarting in 1s" });
      }

      // ─── External BYOK ────────────────────────────────────
      if (p === "/admin/external/list") {
        return jsonRes(res, 200, {
          total: extPool.total,
          providers: Object.fromEntries(
            Object.entries(extPool._keys).map(([pr, k]) => [pr, k.length]),
          ),
          models: extPool.listModels().length,
        });
      }
      if (p === "/admin/external/add" && req.method === "POST") {
        const b = await readBody(req);
        if (!b.provider || !b.key)
          return jsonRes(res, 400, { error: "provider and key required" });
        const added = extPool.add(b.provider, b.key);
        return jsonRes(res, 200, { ok: true, added, total: extPool.total });
      }
      // ─── Convert Devin Sessions → sk-ws ───────────────────
      if (p === "/admin/accounts/convert-devin" && req.method === "POST") {
        const tokens = devinPool.list.map((t) => t.token);
        let converted = 0,
          failed = 0;
        for (const token of tokens) {
          try {
            const ak = await registerUser(token);
            if (ak && ak.startsWith("sk-ws-")) {
              pool.add("", ak, "converted");
              converted++;
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
        }
        return jsonRes(res, 200, {
          ok: true,
          total: tokens.length,
          converted,
          failed,
          cascade: { total: pool.total, available: pool.available },
        });
      }
      // ─── CF URL ──────────────────────────────────────────
      if (p === "/admin/cfurl") {
        return jsonRes(res, 200, { url: cfUrl, active: !!cfUrl });
      }

      // ─── Status summary ───────────────────────────────────
      if (p === "/admin/status") {
        return jsonRes(res, 200, {
          version: VERSION,
          uptime: Math.round((Date.now() - START_TIME) / 1000),
          requests: REQ_COUNT,
          ls: { ready: lsReady, pid: lsProc?.pid },
          cascade: { total: pool.total, available: pool.available },
          devin: { total: devinPool.total },
          external: { total: extPool.total },
          tunnel: { url: cfUrl },
        });
      }

      jsonRes(res, 404, { error: "not found", path: p });
    } catch (e) {
      lerr("HTTP", `${p}: ${e.message}`);
      jsonRes(res, 500, { error: e.message });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// §12 · CLI: --test
// ═══════════════════════════════════════════════════════════════

async function cmdTest() {
  log("TEST", `=== dao_vm_engine v${VERSION} 自测 ===`);
  log(
    "TEST",
    `LS binary: ${LS_BINARY_PATH} → ${fs.existsSync(LS_BINARY_PATH) ? "✓ exists" : "✗ NOT FOUND"}`,
  );

  // Start LS
  const lsOk = await startLS();
  log("TEST", `LS start: ${lsOk ? "✓ ready" : "✗ failed"}`);
  if (!lsOk) {
    process.exit(1);
  }

  // Check accounts
  log("TEST", `Accounts: ${pool.total} total / ${pool.available} available`);
  if (!pool.available) {
    log(
      "TEST",
      'No accounts. Add via: POST /admin/accounts/add {"email":"...","apiKey":"..."}',
    );
    log("TEST", "Or via env: DAO_ACCOUNTS_B64 (base64 JSON array)");
    process.exit(0);
  }

  // Test chat
  log("TEST", "Testing Cascade chat (RawGetChatMessage via LS)...");
  const t0 = Date.now();
  const r = await cascadeChat(
    [{ role: "user", content: "Reply with exactly: DAO_VM_OK" }],
    "swe-1.5",
    null,
    60_000,
  );
  const ms = Date.now() - t0;
  if (r.ok) {
    const pass = r.text.includes("DAO_VM_OK")
      ? "✓ PASS"
      : "⚠ WARN (unexpected reply)";
    log("TEST", `${pass} ${ms}ms "${r.text.slice(0, 80)}" (${r.email})`);
  } else {
    log("TEST", `✗ FAIL ${ms}ms: ${r.error}`);
    process.exit(1);
  }

  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════
// §13 · 主入口
// ═══════════════════════════════════════════════════════════════

async function main() {
  // Check for --test flag
  if (process.argv.includes("--test")) return cmdTest();

  // Ensure home dir
  fs.mkdirSync(DAO_HOME, { recursive: true });

  // Load accounts from env (for first-run seed)
  if (process.env.DAO_ACCOUNTS_B64) {
    try {
      const items = JSON.parse(
        Buffer.from(process.env.DAO_ACCOUNTS_B64, "base64").toString(),
      );
      let addedCascade = 0,
        addedDevin = 0;
      for (const item of Array.isArray(items) ? items : []) {
        if (!item.apiKey) continue;
        if (item.apiKey.startsWith("devin-session-token$")) {
          // devin-session-token → DevinPool (Devin Cloud API)
          devinPool.add(item.apiKey, item.email || "");
          addedDevin++;
        } else if (item.apiKey.startsWith("sk-ws-")) {
          // sk-ws-01-... → AccountPool → LS gRPC → Cascade
          pool.add(item.email || "", item.apiKey, "env");
          addedCascade++;
        }
      }
      if (addedCascade || addedDevin)
        log(
          "INIT",
          `Loaded: ${addedCascade} cascade(sk-ws) + ${addedDevin} devin-session from env`,
        );
    } catch (e) {
      log("INIT", `DAO_ACCOUNTS_B64 parse error: ${e.message}`);
    }
  }

  wsPoolLoad(); // 印196 · WS直连池初始化

  // ─── 印197 · DAO_DEVIN_TOKEN 自注册 ───────────────────────
  if (process.env.DAO_DEVIN_TOKEN) {
    const rawTok = process.env.DAO_DEVIN_TOKEN.trim();
    if (rawTok.length > 20) {
      const fullTok = rawTok.startsWith("devin-session-token$")
        ? rawTok
        : rawTok.split(".").length === 3
          ? "devin-session-token$" + rawTok
          : null;
      if (fullTok) {
        devinPool.add(fullTok, "vm-self");
        pool.add("self@vm", fullTok, "vm-self");
        wsPool.tokens.push({
          apiKey: fullTok,
          cooldownUntil: 0,
          errors: 0,
          usageCount: 0,
          label: "self:" + fullTok.slice(20, 34) + "...",
        });
        log(
          "INIT",
          "DAO_DEVIN_TOKEN → DevinPool + AccountPool + WsPool(try) ✓",
        );
        // Background: RegisterUser → sk-ws key for Pool B (server.codeium.com)
        setTimeout(async () => {
          try {
            const sk = await registerUser(fullTok);
            if (sk && sk.startsWith("sk-ws-")) {
              wsPool.tokens.push({
                apiKey: sk,
                cooldownUntil: 0,
                errors: 0,
                usageCount: 0,
                label: "reg:" + sk.slice(0, 18) + "...",
              });
              log("INIT", "RegisterUser → sk-ws-01 → Pool B ✓");
            } else if (
              sk &&
              sk.startsWith("devin-session-token$") &&
              sk !== fullTok
            ) {
              wsPool.tokens.push({
                apiKey: sk,
                cooldownUntil: 0,
                errors: 0,
                usageCount: 0,
                label: "reg:" + sk.slice(20, 34) + "...",
              });
              log("INIT", "RegisterUser → new devin-session → Pool B(try) ✓");
            } else {
              log(
                "INIT",
                "RegisterUser → no new key (trial or same). Pool B uses self token.",
              );
            }
          } catch (e) {
            log("INIT", "RegisterUser bg error: " + e.message);
          }
        }, 5_000);
      }
    }
  }
  // ─────────────────────────────────────────────────────────

  log("START", `${BRAND} v${VERSION}`);
  log(
    "START",
    `Cascade(sk-ws): ${pool.total} | Devin sessions: ${devinPool.total} | BYOK keys: ${extPool.total}`,
  );

  // Start Language Server
  const lsOk = await startLS();
  if (!lsOk)
    log("WARN", "LS failed — Cascade unavailable (will retry automatically)");

  // Start HTTP server (印199: 端口重试10次, 每次500ms, 防止stub未完全释放)
  const server = createServer();
  await new Promise((ok) => {
    let tries = 0;
    const tryBind = () => {
      server.listen(PORT, BIND, () => {
        log("START", `HTTP :${PORT} (${BIND}) ✓`);
        log("START", `Chat:   POST /v1/chat/completions`);
        log("START", `Models: GET  /v1/models`);
        log(
          "START",
          `Admin:  /admin/accounts/* | /admin/devin/* | /admin/sp | /admin/ws/*`,
        );
        ok();
      });
      server.on("error", (e) => {
        if (e.code === "EADDRINUSE" && ++tries < 12) {
          log("START", `Port ${PORT} busy, retry ${tries}/12 in 500ms...`);
          setTimeout(tryBind, 500);
        } else {
          log("ERR", `Cannot bind :${PORT}: ${e.message}`);
          ok(); // continue anyway
        }
      });
    };
    tryBind();
  });
  // 印199: NO_TUNNEL + CF_URL → 直接注册到 LOCAL_MASTER (不等待 CF 隧道)
  if (CF_URL_INJECTED) {
    cfUrl = CF_URL_INJECTED;
    log("CF", `Injected CF URL: ${cfUrl}`);
    setTimeout(() => registerWithMaster(cfUrl), 3000);
  }

  // 印198: 写watchdog.sh并后台启动 (自持久化)
  try {
    const wdPath = path.join(os.homedir(), "app/watchdog.sh");
    const wdSrc = `#!/bin/bash
# DAO VM watchdog v${VERSION} - auto restart engine
APP="$HOME/app/engine.js"
LOG="$HOME/app/watchdog.log"
LOCK="/tmp/dao_watchdog.lock"
[ -f "$LOCK" ] && kill -0 $(cat "$LOCK") 2>/dev/null && exit 0
echo $$ > "$LOCK"
while true; do
  if ! curl -sf http://localhost:${PORT}/health >/dev/null 2>&1; then
    echo "$(date) restart" >> "$LOG"
    PORT=${PORT} DAO_DEVIN_TOKEN="$DAO_DEVIN_TOKEN" LOCAL_MASTER="$LOCAL_MASTER" \\
      nohup node "$APP" >> "$HOME/app/svc.log" 2>&1 &
    sleep 30
  fi
  sleep 15
done
`;
    fs.mkdirSync(path.dirname(wdPath), { recursive: true });
    fs.writeFileSync(wdPath, wdSrc, { mode: 0o755 });
    require("child_process")
      .spawn("bash", [wdPath], { detached: true, stdio: "ignore" })
      .unref();
    log("START", `watchdog: ${wdPath}`);
  } catch (e) {
    log("WARN", `watchdog skip: ${e.message}`);
  }

  // Start cloudflare tunnel (印199: NO_TUNNEL=1时始终跳过，由外部bash管理隧道)
  if (!NO_TUNNEL) await startTunnel();

  // Graceful shutdown
  const shutdown = (sig) => {
    log("STOP", `${sig} received — shutting down`);
    if (lsProc) {
      try {
        lsProc.kill("SIGTERM");
      } catch {}
    }
    if (cfProc) {
      try {
        cfProc.kill("SIGTERM");
      } catch {}
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });

module.exports = { pool, devinPool, cascadeChat, VERSION };
