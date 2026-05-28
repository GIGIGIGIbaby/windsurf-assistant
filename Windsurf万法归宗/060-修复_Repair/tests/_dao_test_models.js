/**
 * 道·模型过滤测试
 * 找出哪个模型能通过Azure内容过滤器处理Cascade system prompt
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const GW_PORT = 11435;
const BYOK_DIR = "C:\\Users\\zhouyoukang\\.codeium\\dao-byok";
const CAPTURE_DIR = "C:\\Users\\zhouyoukang\\dao_chat_capture";

const wire = require(path.join(BYOK_DIR, "core", "cascade_wire.js"));

function httpPost(host, port, urlPath, body, headers = {}, timeout = 90000) {
  return new Promise((resolve) => {
    const data = typeof body === "string" ? Buffer.from(body) : body;
    const req = http.request({ hostname: host, port, path: urlPath, method: "POST",
      headers: { "content-length": data.length, ...headers }, timeout }, (res) => {
      const chunks = []; res.on("data", c => chunks.push(c));
      res.on("end", () => { const raw = Buffer.concat(chunks); resolve({ status: res.statusCode, text: raw.toString("utf8") }); });
    });
    req.on("error", (e) => resolve({ status: 0, error: e.message, text: "" }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, error: "timeout", text: "" }); });
    req.write(data); req.end();
  });
}

function parseSSE(sseText) {
  let fullText = "", stopReason = "";
  for (const line of sseText.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const d = line.slice(5).trim();
    if (!d || d === "[DONE]") continue;
    try {
      const j = JSON.parse(d);
      const c = j.choices?.[0];
      if (!c) continue;
      if (typeof c.delta?.content === "string") fullText += c.delta.content;
      if (c.finish_reason) stopReason = c.finish_reason;
    } catch {}
  }
  return { fullText, stopReason };
}

async function testModel(modelId, messages) {
  const body = JSON.stringify({ model: modelId, messages, max_tokens: 512, stream: true });
  const resp = await httpPost("127.0.0.1", GW_PORT, "/v1/chat/completions", body, {
    "content-type": "application/json", "accept": "text/event-stream"
  });
  const { fullText, stopReason } = parseSSE(resp.text);
  const isFiltered = fullText.includes("content management policy") || fullText.includes("content filtering") || fullText.includes("网关错误 400");
  const isError = resp.status !== 200 || fullText.startsWith("[");
  return { status: resp.status, text: fullText, stopReason, isFiltered, isError, len: fullText.length };
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  道·模型过滤测试 · 找出可用模型");
  console.log("═══════════════════════════════════════════════════\n");

  // Load the real Cascade system prompt from capture
  let cascadeSystemPrompt = "";
  let cascadeMessages = [];
  
  const haikuFile = path.join(CAPTURE_DIR, "gcm_1779772369523_R749_MODEL_CLAUDE_3_5_HAIKU_20241022.bin");
  if (fs.existsSync(haikuFile)) {
    const raw = fs.readFileSync(haikuFile);
    const parsed = wire.parseGetChatMessageRequest(raw, false);
    cascadeSystemPrompt = parsed?.system || "";
    cascadeMessages = (parsed?.messages || []).map(m => ({ role: m.role, content: m.content }));
    console.log(`Loaded real Cascade prompt: sys=${cascadeSystemPrompt.length}B, msgs=${cascadeMessages.length}, tools=${(parsed?.tools||[]).length}`);
  } else {
    cascadeSystemPrompt = "You are Cascade, a powerful agentic AI coding assistant. You help with coding tasks.\n\nIMPORTANT: Respond ONLY with valid JSON:\n{\"response\": \"your response\", \"tool_calls\": []}";
    cascadeMessages = [{ role: "user", content: "Hello, help me with coding." }];
    console.log("Using synthetic Cascade prompt");
  }
  
  const systemTruncated = cascadeSystemPrompt.slice(0, 100) + (cascadeSystemPrompt.length > 100 ? "..." : "");
  console.log(`System prompt (first 100): ${systemTruncated}\n`);

  const MODELS = [
    "github::gpt-4.1-mini",
    "github::gpt-4.1",
    "github::gpt-4o",
    "github::DeepSeek-V3-0324",
  ];

  const messages = [
    ...(cascadeSystemPrompt ? [{ role: "system", content: cascadeSystemPrompt }] : []),
    ...cascadeMessages,
  ];

  console.log("Testing models with real Cascade system prompt...\n");

  for (const model of MODELS) {
    process.stdout.write(`  ${model.padEnd(35)} → `);
    const r = await testModel(model, messages);
    if (r.isFiltered) {
      console.log(`✗ FILTERED (Azure content policy)`);
    } else if (r.isError) {
      console.log(`✗ ERROR: ${r.text.slice(0, 80)}`);
    } else {
      console.log(`✓ OK (${r.len}B stop=${r.stopReason}) "${r.text.slice(0, 60)}"`);
    }
  }

  // Also test with a simpler non-filtered system prompt
  console.log("\n=== Simple prompt test (baseline) ===");
  const simpleMsgs = [{ role: "user", content: "Say OK" }];
  for (const model of MODELS) {
    process.stdout.write(`  ${model.padEnd(35)} → `);
    const r = await testModel(model, simpleMsgs);
    if (r.isError) {
      console.log(`✗ ERROR: ${r.text.slice(0, 80)}`);
    } else {
      console.log(`✓ OK (${r.len}B) "${r.text.slice(0, 40)}"`);
    }
  }

  // Test with truncated system prompt (first 500 chars)
  if (cascadeSystemPrompt.length > 500) {
    console.log("\n=== Truncated system prompt test (first 500 chars) ===");
    const truncMsgs = [
      { role: "system", content: cascadeSystemPrompt.slice(0, 500) },
      ...cascadeMessages,
    ];
    for (const model of ["github::gpt-4.1-mini", "github::DeepSeek-V3-0324"]) {
      process.stdout.write(`  ${model.padEnd(35)} → `);
      const r = await testModel(model, truncMsgs);
      if (r.isFiltered) {
        console.log(`✗ FILTERED`);
      } else if (r.isError) {
        console.log(`✗ ERROR: ${r.text.slice(0, 80)}`);
      } else {
        console.log(`✓ OK (${r.len}B) "${r.text.slice(0, 60)}"`);
      }
    }
  }

  console.log("\n=== 结论 ===");
  console.log("如果DeepSeek-V3-0324不被过滤, 将所有路由改为DeepSeek");
  console.log("如果所有模型都被过滤, 需要添加不经Azure过滤的provider");
}

main().catch(e => { console.error("FATAL:", e.stack || e.message); process.exit(1); });
