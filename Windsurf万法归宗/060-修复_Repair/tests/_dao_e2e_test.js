#!/usr/bin/env node
/**
 * 道·E2E全链路诊断 · 一次性定位断裂点
 * 
 * 测试链路:
 *   T1: Gateway直连 (验证GW本身)
 *   T2: MITM路由 (模拟LS请求→MITM→GW)
 *   T3: 真实Cascade E2E (通过LS的gRPC API)
 */
"use strict";
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const GW_PORT = 11435;
const MITM_PORT = 8878;
const LS_PORT = (() => {
  // 自动发现LS端口 - 从Windsurf进程
  try {
    const { execSync } = require("child_process");
    const out = execSync('netstat -ano | findstr LISTEN', { encoding: 'utf8', timeout: 5000 });
    const lines = out.split('\n');
    const lsPorts = [];
    for (const line of lines) {
      const m = line.match(/127\.0\.0\.1:(\d+)\s+.*LISTEN\s+(\d+)/);
      if (m) {
        const port = parseInt(m[1]);
        if (port > 30000 && port < 40000) lsPorts.push(port);
      }
    }
    return lsPorts[0] || 32661;
  } catch { return 32661; }
})();

// CSRF token — 从Windsurf状态数据库自动获取
let CSRF_TOKEN = "";
let API_KEY = "";
try {
  const { execSync } = require("child_process");
  API_KEY = execSync(`sqlite3 "${process.env.APPDATA}\\Windsurf\\User\\globalStorage\\state.vscdb" "SELECT value FROM ItemTable WHERE key='codeium.apiKey'"`, { encoding: 'utf8', timeout: 5000 }).trim();
  CSRF_TOKEN = execSync(`sqlite3 "${process.env.APPDATA}\\Windsurf\\User\\globalStorage\\state.vscdb" "SELECT value FROM ItemTable WHERE key='codeium.csrfToken'"`, { encoding: 'utf8', timeout: 5000 }).trim();
} catch {}

if (!CSRF_TOKEN) {
  // Fallback: 扫描进程参数获取CSRF
  try {
    const { execSync } = require("child_process");
    const out = execSync('wmic process where "name=\'language_server_windows_x64.exe\'" get CommandLine /format:list', { encoding: 'utf8', timeout: 5000 });
    const m = out.match(/--csrf_token\s+([a-f0-9-]+)/i);
    if (m) CSRF_TOKEN = m[1];
    // 也提取server_port
    const mp = out.match(/--server_port\s+(\d+)/i);
    if (mp) {
      // LS_PORT already set, but we can verify
    }
  } catch {}
}

const SVC = "/exa.language_server_pb.LanguageServerService";
const APISVC = "/exa.api_server_pb.ApiServerService";

function httpPost(host, port, urlPath, body, headers = {}, timeout = 30000) {
  return new Promise((resolve) => {
    const data = typeof body === "string" ? Buffer.from(body) : body;
    const reqHeaders = {
      "content-length": data.length,
      ...headers,
    };
    const req = http.request({
      hostname: host,
      port,
      path: urlPath,
      method: "POST",
      headers: reqHeaders,
      timeout,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, raw, text: raw.toString("utf8") });
      });
      res.on("error", () => resolve({ status: res.statusCode, headers: res.headers, raw: Buffer.alloc(0), text: "" }));
    });
    req.on("error", (e) => resolve({ status: 0, error: e.message, raw: Buffer.alloc(0), text: "" }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, error: "timeout", raw: Buffer.alloc(0), text: "" }); });
    req.write(data);
    req.end();
  });
}

function httpGet(host, port, urlPath, timeout = 5000) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: host, port, path: urlPath, timeout }, (res) => {
      let d = "";
      res.on("data", (c) => d += c);
      res.on("end", () => resolve({ status: res.statusCode, text: d }));
    });
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, error: "timeout" }); });
  });
}

// ═══════════════════════════════════════════════════════════════
// T1: Gateway 直连测试
// ═══════════════════════════════════════════════════════════════
async function testGateway() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  T1: Gateway 直连测试 (:11435)       ║");
  console.log("╚══════════════════════════════════════╝");

  // Health check
  const health = await httpGet("127.0.0.1", GW_PORT, "/health");
  console.log(`  Health: ${health.status} ${health.status === 200 ? "✓" : "✗"}`);
  if (health.status !== 200) {
    console.log("  FATAL: Gateway down");
    return false;
  }

  // Non-streaming chat test
  const chatBody = JSON.stringify({
    model: "github::gpt-4.1-mini",
    messages: [{ role: "user", content: "Say OK" }],
    max_tokens: 10,
    stream: false,
  });
  const chat = await httpPost("127.0.0.1", GW_PORT, "/v1/chat/completions", chatBody, {
    "content-type": "application/json",
  });
  console.log(`  Chat: status=${chat.status} len=${chat.raw.length}`);
  if (chat.status === 200) {
    try {
      const j = JSON.parse(chat.text);
      const content = j.choices?.[0]?.message?.content || "";
      console.log(`  Reply: "${content.slice(0, 100)}" ✓`);
    } catch {
      console.log(`  Raw: ${chat.text.slice(0, 200)}`);
    }
  } else {
    console.log(`  ERROR: ${chat.text.slice(0, 300)}`);
    return false;
  }

  // Streaming chat test (SSE)
  const streamBody = JSON.stringify({
    model: "github::gpt-4.1-mini",
    messages: [{ role: "user", content: "Say OK" }],
    max_tokens: 10,
    stream: true,
  });
  const stream = await httpPost("127.0.0.1", GW_PORT, "/v1/chat/completions", streamBody, {
    "content-type": "application/json",
    "accept": "text/event-stream",
  });
  console.log(`  Stream: status=${stream.status} len=${stream.raw.length}`);
  if (stream.status === 200) {
    // Count SSE chunks
    const lines = stream.text.split("\n").filter(l => l.startsWith("data:"));
    const dataChunks = lines.filter(l => !l.includes("[DONE]"));
    let fullText = "";
    for (const l of dataChunks) {
      try {
        const j = JSON.parse(l.slice(5).trim());
        const delta = j.choices?.[0]?.delta?.content || "";
        fullText += delta;
      } catch {}
    }
    console.log(`  SSE chunks: ${dataChunks.length}, text: "${fullText}" ✓`);
  } else {
    console.log(`  SSE ERROR: ${stream.text.slice(0, 200)}`);
    return false;
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════
// T2: MITM路由测试 — 模拟LS发送GetChatMessage
// ═══════════════════════════════════════════════════════════════

// Protobuf helpers
function encVI(v) { const b = []; while (v > 127) { b.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); } b.push(v & 0x7f); return Buffer.from(b); }
function encStr(fn, s) { if (!s) return Buffer.alloc(0); const b = Buffer.from(s, "utf8"); return Buffer.concat([encVI((fn << 3) | 2), encVI(b.length), b]); }
function encMsg(fn, buf) { if (!buf || !buf.length) return Buffer.alloc(0); return Buffer.concat([encVI((fn << 3) | 2), encVI(buf.length), buf]); }
function encUint(fn, v) { return Buffer.concat([encVI((fn << 3) | 0), encVI(v)]); }

function buildConnectFrame(flags, payload) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const h = Buffer.alloc(5);
  h[0] = flags & 0xff;
  h.writeUInt32BE(buf.length, 1);
  return Buffer.concat([h, buf]);
}

// Parse Connect-RPC frames from raw response
function parseConnectFrames(raw) {
  const frames = [];
  let pos = 0;
  while (pos + 5 <= raw.length) {
    const flags = raw[pos];
    const len = raw.readUInt32BE(pos + 1);
    pos += 5;
    if (pos + len > raw.length) break;
    const payload = raw.slice(pos, pos + len);
    frames.push({ flags, len, payload });
    pos += len;
  }
  return frames;
}

// Parse protobuf fields
function parseProto(buf) {
  const fields = {};
  let pos = 0;
  while (pos < buf.length) {
    const t = decodeVI(buf, pos);
    pos = t.pos;
    const fn = t.value >> 3;
    const wt = t.value & 7;
    if (!fields[fn]) fields[fn] = [];
    if (wt === 0) {
      const v = decodeVI(buf, pos);
      fields[fn].push({ w: 0, v: v.value });
      pos = v.pos;
    } else if (wt === 2) {
      const len = decodeVI(buf, pos);
      pos = len.pos;
      if (pos + len.value > buf.length) break;
      fields[fn].push({ w: 2, b: buf.slice(pos, pos + len.value) });
      pos += len.value;
    } else if (wt === 1) {
      if (pos + 8 > buf.length) break;
      fields[fn].push({ w: 1, b: buf.slice(pos, pos + 8) });
      pos += 8;
    } else if (wt === 5) {
      if (pos + 4 > buf.length) break;
      fields[fn].push({ w: 5, b: buf.slice(pos, pos + 4) });
      pos += 4;
    } else break;
  }
  return fields;
}
function decodeVI(buf, pos) {
  let result = 0, shift = 0;
  while (pos < buf.length) {
    const b = buf[pos++];
    result += (b & 0x7f) * Math.pow(2, shift);
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result, pos };
}

/**
 * 构建 GetChatMessageRequest protobuf
 * 关键字段号 (来自cascade_wire.js):
 *   field 2 = chatMessages (repeated ChatMessagePrompt)
 *   field 21 = chatModelUid (string)
 *   field 4 = metadata
 *
 * ChatMessagePrompt:
 *   field 1 = messageId
 *   field 2 = source enum (0=SYSTEM, 1=USER, 2=ASSISTANT, 3=TOOL)
 *   field 3 = prompt (text content)
 */
function buildGetChatMessageRequest(userText, modelUid) {
  // 构建一条 user message
  const msg = Buffer.concat([
    encStr(1, crypto.randomUUID()),   // message_id
    encUint(2, 1),                    // source = USER
    encStr(3, userText),              // prompt text
  ]);

  // 构建一条 system message
  const sysMsg = Buffer.concat([
    encStr(1, crypto.randomUUID()),
    encUint(2, 0),                    // source = SYSTEM
    encStr(3, "You are a helpful assistant. Reply concisely."),
  ]);

  // 元数据 (metadata)
  const meta = Buffer.concat([
    encStr(1, "windsurf"),           // ide_name
    encStr(2, "2.2.17"),             // extension_version
    encStr(3, API_KEY),              // api_key
    encStr(4, "zh-CN"),              // locale
    encStr(5, "windows"),            // os
  ]);

  // 完整 request
  const reqBody = Buffer.concat([
    encMsg(2, sysMsg),                // chatMessages[0] = system
    encMsg(2, msg),                   // chatMessages[1] = user
    encMsg(4, meta),                  // metadata
    encStr(21, modelUid),             // chatModelUid
  ]);

  return buildConnectFrame(0, reqBody);
}

async function testMITMRoute() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  T2: MITM 路由测试 (:8878)           ║");
  console.log("╚══════════════════════════════════════╝");

  // Build GetChatMessage request (protobuf)
  const reqBody = buildGetChatMessageRequest("What is 2+2? Reply with just the number.", "MODEL_GPT_4O_MINI");

  console.log(`  Request: ${reqBody.length} bytes, model=MODEL_GPT_4O_MINI`);

  const resp = await httpPost("127.0.0.1", MITM_PORT,
    "/exa.api_server_pb.ApiServerService/GetChatMessage",
    reqBody, {
      "content-type": "application/connect+proto",
      "connect-protocol-version": "1",
    }, 60000);

  console.log(`  Response: status=${resp.status} len=${resp.raw.length} ct=${resp.headers?.["content-type"] || "?"}`);

  if (resp.status !== 200) {
    console.log(`  ERROR: ${resp.text.slice(0, 300)}`);
    return false;
  }

  // Parse Connect-RPC frames
  const frames = parseConnectFrames(resp.raw);
  console.log(`  Frames: ${frames.length}`);

  let totalText = "";
  let hasStop = false;
  let hasEnd = false;

  for (let i = 0; i < frames.length; i++) {
    const fr = frames[i];
    if (fr.flags === 2) {
      // End/trailer frame
      hasEnd = true;
      const trailerStr = fr.payload.toString("utf8");
      console.log(`  Frame[${i}] END: ${trailerStr.slice(0, 200)}`);
      continue;
    }

    // Data frame — parse protobuf
    const fields = parseProto(fr.payload);

    // field 1 = deltaText, field 2 = deltaThinking, field 3 = stopReason, etc.
    // Actually check the RSP field numbers from cascade_wire.js
    // RSP.DELTA_TEXT, RSP.DELTA_THINKING, RSP.STOP_REASON, etc.
    // Let me dump all fields
    const fieldNums = Object.keys(fields).map(Number).sort((a, b) => a - b);

    for (const fn of fieldNums) {
      for (const entry of fields[fn]) {
        if (entry.w === 2) {
          const text = entry.b.toString("utf8");
          if (text.length > 0 && text.length < 1000) {
            if (fn <= 3) totalText += text;
            console.log(`  Frame[${i}] f${fn}: "${text.slice(0, 100)}"`);
          } else {
            console.log(`  Frame[${i}] f${fn}: <${entry.b.length}B binary>`);
          }
        } else if (entry.w === 0) {
          console.log(`  Frame[${i}] f${fn}: varint=${entry.v}`);
          if (fn === 5 || fn === 6) hasStop = true; // likely stop_reason field
        }
      }
    }
  }

  console.log(`  Total text extracted: "${totalText}"`);
  console.log(`  HasStop: ${hasStop}, HasEnd: ${hasEnd}`);

  if (frames.length > 0 && totalText.length > 0) {
    console.log("  ✓ MITM route produced valid response");
    return true;
  } else {
    console.log("  ✗ MITM route produced empty/invalid response");

    // Dump raw bytes for debugging
    const hexDump = resp.raw.slice(0, Math.min(500, resp.raw.length)).toString("hex").match(/.{1,2}/g)?.join(" ");
    console.log(`  Raw hex (first 500B): ${hexDump}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// T3: 真实 Cascade E2E (通过LS)
// ═══════════════════════════════════════════════════════════════
function rpc(method, body) {
  const data = JSON.stringify(body);
  return new Promise((resolve) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: LS_PORT,
      path: SVC + "/" + method,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "connect-protocol-version": "1",
        "x-codeium-csrf-token": CSRF_TOKEN,
        "content-length": Buffer.byteLength(data),
      },
      timeout: 30000,
    }, (res) => {
      let b = "";
      res.on("data", (c) => b += c);
      res.on("end", () => {
        let j;
        try { j = JSON.parse(b); } catch { j = { raw: b }; }
        resolve({ s: res.statusCode, d: j });
      });
    });
    req.on("error", (e) => resolve({ s: 0, d: { err: e.message } }));
    req.on("timeout", () => { req.destroy(); resolve({ s: 0, d: { err: "timeout" } }); });
    req.write(data);
    req.end();
  });
}

async function testCascadeE2E() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  T3: Cascade E2E (via LS :" + LS_PORT + ")    ║");
  console.log("╚══════════════════════════════════════╝");

  if (!CSRF_TOKEN) {
    console.log("  SKIP: No CSRF token found");
    return false;
  }
  if (!API_KEY) {
    console.log("  SKIP: No API key found");
    return false;
  }

  console.log(`  CSRF: ${CSRF_TOKEN.slice(0, 12)}...`);
  console.log(`  Key: ${API_KEY.slice(0, 30)}...`);
  console.log(`  LS Port: ${LS_PORT}`);

  const meta = () => ({
    ideName: "windsurf",
    extensionVersion: "2.2.17",
    apiKey: API_KEY,
    locale: "zh-CN",
    os: "windows",
    ideVersion: "2.2.17",
    hardware: "x86_64",
    requestId: String(Date.now()),
    sessionId: crypto.randomUUID(),
    extensionName: "codeium.windsurf",
  });

  // Test with a model that should be routed (MODEL_GPT_4O_MINI → gpt-4.1-mini)
  const model = "MODEL_GPT_4O_MINI";
  console.log(`  Model: ${model} (should route to gpt-4.1-mini)`);

  // Start Cascade
  const sc = await rpc("StartCascade", { metadata: meta() });
  const cid = sc.d.cascadeId;
  console.log(`  StartCascade: ${sc.s} cid=${cid || "NONE"}`);
  if (!cid) {
    console.log("  FATAL: No cascadeId");
    return false;
  }

  // Send message
  const sm = await rpc("SendUserCascadeMessage", {
    cascadeId: cid,
    userMessage: { content: "What is 2+2? Reply with just the number, nothing else." },
    metadata: meta(),
    cascadeConfig: { plannerConfig: { requestedModelUid: model } },
  });
  console.log(`  SendMessage: ${sm.s}`);

  // Poll for response
  for (let i = 1; i <= 15; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const sd = await rpc("GetCascadeTrajectorySteps", { metadata: meta(), cascadeId: cid });
    const steps = sd.d.steps || [];
    const types = steps.map((s) => s.type);
    console.log(`  poll${i}: steps=${steps.length} types=${types.join(",")}`);

    for (const st of steps) {
      if (st.plannerResponse) {
        console.log(`  >>> PLANNER: "${(st.plannerResponse.response || "").slice(0, 200)}"`);
        console.log(`  >>> THINKING: "${(st.plannerResponse.thinking || "").slice(0, 200)}"`);
      }
      if (st.type === "CORTEX_STEP_TYPE_ERROR_MESSAGE") {
        console.log(`  >>> ERROR: ${(st.errorMessage?.error?.userErrorMessage || JSON.stringify(st.errorMessage)).slice(0, 200)}`);
      }
    }

    // Check for completion
    const hasPlanner = steps.some((s) => s.type === "CORTEX_STEP_TYPE_PLANNER_RESPONSE");
    const hasError = steps.some((s) => s.type === "CORTEX_STEP_TYPE_ERROR_MESSAGE");
    const allDone = steps.length >= 2 && steps.every((s) => s.status === "CORTEX_STEP_STATUS_DONE");

    if (hasPlanner) {
      console.log("  ✓ Got PLANNER_RESPONSE — Cascade E2E WORKS!");
      return true;
    }
    if (hasError) {
      console.log("  ✗ Got ERROR — Cascade E2E FAILED");
      return false;
    }
    if (allDone && !hasPlanner) {
      console.log("  ✗ All done but no planner response");
      return false;
    }
  }

  console.log("  ✗ Timeout — stuck (likely at RETRIEVE_MEMORY)");
  return false;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  道·E2E全链路诊断 · 反者道之动 · 一击贯通");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log(`  GW: :${GW_PORT}, MITM: :${MITM_PORT}, LS: :${LS_PORT}`);
  console.log(`  CSRF: ${CSRF_TOKEN ? CSRF_TOKEN.slice(0, 12) + "..." : "NONE"}`);
  console.log(`  Key: ${API_KEY ? API_KEY.slice(0, 30) + "..." : "NONE"}`);

  const results = {};

  // T1: Gateway
  results.gateway = await testGateway();

  // T2: MITM Route
  results.mitm = await testMITMRoute();

  // T3: Cascade E2E
  results.cascade = await testCascadeE2E();

  // Summary
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  SUMMARY                             ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`  T1 Gateway:  ${results.gateway ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`  T2 MITM:     ${results.mitm ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`  T3 Cascade:  ${results.cascade ? "✓ PASS" : "✗ FAIL"}`);

  if (results.gateway && results.mitm && results.cascade) {
    console.log("\n  ═══ 道法自然 · 全链路贯通 ═══");
  } else {
    console.log("\n  断裂点:");
    if (!results.gateway) console.log("    → Gateway (:11435) — 修复 GW 本身");
    if (results.gateway && !results.mitm) console.log("    → MITM→GW链路 — 检查 cascade_wire.js 响应格式");
    if (results.gateway && results.mitm && !results.cascade) console.log("    → Cascade→MITM链路 — 检查LS如何处理MITM响应");
  }

  // Save MITM log tail
  console.log("\n=== MITM Log (last 20 lines) ===");
  try {
    const log = fs.readFileSync("C:\\Users\\zhouyoukang\\dao_router_log.txt", "utf8");
    const lines = log.split("\n");
    console.log(lines.slice(-20).join("\n"));
  } catch { console.log("  (cannot read log)"); }

  process.exit(results.cascade ? 0 : 1);
}

main().catch((e) => { console.error("FATAL:", e.stack || e.message); process.exit(2); });
