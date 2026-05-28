// Dump the actual content of a captured GetChatMessage request
"use strict";
const fs = require("fs");
const path = require("path");
const BYOK = "C:\\Users\\zhouyoukang\\.codeium\\dao-byok";
const CAPTURE = "C:\\Users\\zhouyoukang\\dao_chat_capture";
const wire = require(path.join(BYOK, "core", "cascade_wire.js"));

// Find the HAIKU capture
const files = fs.readdirSync(CAPTURE).filter(f => f.includes("HAIKU")).sort().reverse();
if (!files[0]) { console.log("No HAIKU file"); process.exit(1); }
const f = path.join(CAPTURE, files[0]);
console.log("File:", files[0], "("+fs.statSync(f).size+"B)");

const raw = fs.readFileSync(f);
const parsed = wire.parseGetChatMessageRequest(raw, false);
console.log("\n=== PARSED ===");
console.log("modelUid:", parsed?.modelUid || "(empty)");
console.log("system (len):", (parsed?.system||"").length);
console.log("messages:", (parsed?.messages||[]).length);
console.log("tools:", (parsed?.tools||[]).length);

console.log("\n=== System Prompt (first 500) ===");
console.log((parsed?.system||"").slice(0, 500));

console.log("\n=== Messages ===");
for (const m of (parsed?.messages||[])) {
  console.log(`\n[${m.role}] content len=${m.content?.length||0}`);
  console.log("Content (first 300):", (m.content||"").slice(0, 300));
  if (m.tool_calls?.length) console.log("tool_calls:", m.tool_calls.length);
  if (m.thinking) console.log("thinking (first 100):", m.thinking.slice(0, 100));
}

console.log("\n=== Tool Definitions ===");
for (const t of (parsed?.tools||[]).slice(0,3)) {
  console.log("  -", t.name, ":", t.description?.slice(0,80)||"");
}
if ((parsed?.tools||[]).length > 3) console.log("  ... +"  + ((parsed?.tools||[]).length-3) + " more");

// Also test directly what the gateway gets
const http = require("http");
const msgs = [];
if (parsed?.system) msgs.push({ role:"system", content: parsed.system });
for (const m of (parsed?.messages||[])) msgs.push({ role: m.role, content: m.content||"" });
console.log("\n=== OpenAI Messages to send ===");
msgs.forEach(m => console.log(`[${m.role}] ${m.content.length}B: "${m.content.slice(0,100)}"`));
