/**
 * 道·响应捕获诊断
 * 目标：复现真实Cascade路由时GPT-4.1-mini的实际返回内容
 *
 * 步骤：
 * 1. 从MITM捕获目录读取最近一次真实GetChatMessage请求体
 * 2. 解析请求体，提取system prompt + messages + tools
 * 3. 直接发给Gateway，捕获完整SSE响应
 * 4. 验证响应是否符合Cascade planner期望的JSON格式
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const GW_PORT = 11435;
const CAPTURE_DIR = "C:\\Users\\zhouyoukang\\dao_chat_capture";
const LOG_PATH = "C:\\Users\\zhouyoukang\\dao_router_log.txt";

// ── Protobuf helpers (same as cascade_wire.js) ──────────────────
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

function parseProto(buf) {
  const fields = {};
  let pos = 0;
  while (pos < buf.length) {
    try {
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
    } catch { break; }
  }
  return fields;
}

function getString(fields, fn) {
  const e = fields[fn]?.[0];
  if (e?.w === 2) return Buffer.from(e.b).toString("utf8");
  return "";
}
function getAll(fields, fn) {
  return (fields[fn] || []).filter(e => e.w === 2).map(e => Buffer.from(e.b).toString("utf8"));
}
function getUint(fields, fn) {
  return fields[fn]?.[0]?.v ?? 0;
}

// Parse GetChatMessageRequest (api_server_pb wire format)
// REQ: METADATA=1, PROMPT=2(sys), CHAT_MESSAGES=3, TOOLS=10, CHAT_MODEL_UID=21
// MSG: MESSAGE_ID=1, SOURCE=2(0=sys,1=user,2=asst,3=tool), PROMPT=3
function parseRequest(rawBody) {
  // Unwrap Connect-RPC frame (5-byte header)
  let body = rawBody;
  if (rawBody.length >= 5 && rawBody[0] === 0) {
    const payloadLen = rawBody.readUInt32BE(1);
    if (5 + payloadLen <= rawBody.length) {
      body = rawBody.slice(5, 5 + payloadLen);
    }
  }

  const req = parseProto(body);

  // System prompt (field 2 = PROMPT)
  const systemPrompt = getString(req, 2);

  // Chat messages (field 3 = CHAT_MESSAGES, repeated)
  const messages = [];
  for (const e of (req[3] || [])) {
    if (e.w !== 2) continue;
    const msgF = parseProto(Buffer.from(e.b));
    const sourceVal = getUint(msgF, 2);
    const roleMap = { 0: "system", 1: "user", 2: "assistant", 3: "tool" };
    const role = roleMap[sourceVal] || "user";
    const content = getString(msgF, 3);
    messages.push({ role, content });
  }

  // Tools (field 10)
  const tools = [];
  for (const e of (req[10] || [])) {
    if (e.w !== 2) continue;
    const toolF = parseProto(Buffer.from(e.b));
    const name = getString(toolF, 1);
    const desc = getString(toolF, 2);
    const schema = getString(toolF, 3);
    if (name) tools.push({ name, description: desc, schema });
  }

  // Model UID (field 21)
  const modelUid = getString(req, 21);

  // Also try legacy field 3 for modelUid if 21 is empty
  const legacyModelUid = modelUid || getString(req, 3);

  return { systemPrompt, messages, tools, modelUid: modelUid || legacyModelUid };
}

// ── Read last router log entry for a real Cascade request ──────
function findLastCascadeRequest() {
  // Check capture directory for saved request bodies
  try {
    const files = fs.readdirSync(CAPTURE_DIR)
      .filter(f => f.endsWith(".bin"))
      .sort()
      .reverse();
    if (files.length > 0) {
      const latestFile = path.join(CAPTURE_DIR, files[0]);
      console.log(`  Found captured request: ${latestFile}`);
      return fs.readFileSync(latestFile);
    }
  } catch {}

  console.log("  No captured request files found in", CAPTURE_DIR);
  return null;
}

// ── Build a realistic Cascade planner request ──────────────────
function buildRealisticPlannerRequest() {
  // This mimics what Cascade actually sends:
  // - System prompt with JSON response format instructions
  // - A user message asking for a task
  // - 25 tool definitions
  const systemPrompt = `You are Cascade, a powerful agentic AI coding assistant. You must respond in valid JSON format with the following structure:
{
  "response": "string - your response to the user",
  "actions": [] 
}
Only respond with valid JSON. Do not include any text outside the JSON object.`;

  return JSON.stringify({
    model: "github::gpt-4.1-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "What is 2+2?" }
    ],
    max_tokens: 500,
    stream: true,
  });
}

// ── Call Gateway and capture full response ─────────────────────
function callGateway(bodyJson, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const body = typeof bodyJson === "string" ? bodyJson : JSON.stringify(bodyJson);
    const req = http.request({
      hostname: "127.0.0.1",
      port: GW_PORT,
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Accept": "text/event-stream",
      },
      timeout,
    }, (res) => {
      let text = "";
      res.on("data", c => text += c);
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("gateway timeout")); });
    req.write(body);
    req.end();
  });
}

// Parse SSE response to extract full text
function parseSSE(sseText) {
  let fullText = "";
  let stopReason = "";
  const lines = sseText.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const d = line.slice(5).trim();
    if (!d || d === "[DONE]") continue;
    try {
      const j = JSON.parse(d);
      const choice = j.choices?.[0];
      if (!choice) continue;
      if (typeof choice.delta?.content === "string") fullText += choice.delta.content;
      if (choice.finish_reason) stopReason = choice.finish_reason;
    } catch {}
  }
  return { fullText, stopReason };
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  道·响应捕获诊断 · 验证GPT-4.1-mini兼容性");
  console.log("═══════════════════════════════════════════════");

  // ── T1: 检查真实捕获请求 ────────────────────────────────────
  const capturedBody = findLastCascadeRequest();
  if (capturedBody) {
    console.log(`\n── 解析真实捕获请求 (${capturedBody.length}B) ──`);
    const parsed = parseRequest(capturedBody);
    console.log(`  modelUid: ${parsed.modelUid}`);
    console.log(`  systemPrompt (first 200): ${parsed.systemPrompt.slice(0, 200)}`);
    console.log(`  messages: ${parsed.messages.length}`);
    console.log(`  tools: ${parsed.tools.length}`);
    for (const m of parsed.messages) {
      console.log(`  [${m.role}]: ${m.content.slice(0, 100)}`);
    }

    // Replay to gateway
    const gwBody = JSON.stringify({
      model: "github::gpt-4.1-mini",
      messages: [
        ...(parsed.systemPrompt ? [{ role: "system", content: parsed.systemPrompt }] : []),
        ...parsed.messages,
      ],
      max_tokens: 2048,
      stream: true,
    });
    console.log(`\n  Replaying to gateway...`);
    const resp = await callGateway(gwBody);
    const { fullText, stopReason } = parseSSE(resp.text);
    console.log(`  Status: ${resp.status}`);
    console.log(`  Stop: ${stopReason}`);
    console.log(`  Response (${fullText.length}B):\n${fullText.slice(0, 1000)}`);

    // Check if valid JSON
    try {
      const j = JSON.parse(fullText);
      console.log(`  ✓ Valid JSON: keys=${Object.keys(j).join(",")}`);
    } catch {
      console.log(`  ✗ NOT valid JSON — this is why Cascade fails!`);
    }
  }

  // ── T2: 模拟真实Cascade planner请求 ────────────────────────
  console.log(`\n── T2: 真实Cascade Planner格式测试 ──`);

  // Read actual system prompt from MITM log pattern
  const plannerSystemPrompt = `You are Cascade, an AI coding assistant made by Codeium. 

<CASCADE_INFO>
You are currently operating in Windsurf, an AI-enabled IDE made by Codeium. You are helping me with a coding task in my workspace.
</CASCADE_INFO>

**IMPORTANT**: You must respond ONLY with a valid JSON object in this exact format:
{
  "response": "Your helpful response here",
  "tool_calls": []
}

Do not include any text before or after the JSON object.`;

  const t2Body = JSON.stringify({
    model: "github::gpt-4.1-mini",
    messages: [
      { role: "system", content: plannerSystemPrompt },
      { role: "user", content: "Hello, I need help." }
    ],
    max_tokens: 1024,
    stream: true,
  });

  const t2 = await callGateway(t2Body);
  const { fullText: t2Text } = parseSSE(t2.text);
  console.log(`  Status: ${t2.status}, len=${t2Text.length}B`);
  console.log(`  Response: ${t2Text.slice(0, 500)}`);
  try {
    const j = JSON.parse(t2Text);
    console.log(`  ✓ Valid JSON: keys=${Object.keys(j).join(",")}`);
  } catch {
    console.log(`  ✗ Not valid JSON (OK if no JSON required)`);
  }

  // ── T3: 读取最近MITM日志 ────────────────────────────────────
  console.log(`\n── T3: MITM日志中路由记录 ──`);
  try {
    const logLines = fs.readFileSync(LOG_PATH, "utf8").split("\n");
    const routeLines = logLines.filter(l => l.includes("ROUTE") || l.includes("stream") || l.includes("GCM-DIAG"));
    const last30 = routeLines.slice(-30);
    console.log(last30.join("\n"));
  } catch (e) {
    console.log("  Cannot read log: " + e.message);
  }

  // ── T4: 捕获真实Cascade请求体 ──────────────────────────────
  console.log(`\n── T4: 注入请求体捕获钩子 ──`);
  console.log(`  捕获目录: ${CAPTURE_DIR}`);
  try {
    const files = fs.readdirSync(CAPTURE_DIR);
    console.log(`  已有捕获文件: ${files.length}个`);
    files.slice(-5).forEach(f => {
      const stat = fs.statSync(path.join(CAPTURE_DIR, f));
      console.log(`    ${f} (${stat.size}B)`);
    });
  } catch {
    console.log("  目录不存在或为空");
  }
}

main().catch(e => { console.error("FATAL:", e.stack || e.message); process.exit(1); });
