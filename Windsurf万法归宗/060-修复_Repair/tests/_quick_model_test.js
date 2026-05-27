// Quick: test which models pass Azure content filter with Cascade system prompt
const http = require("http");
const fs = require("fs");
const path = require("path");
const BYOK = "C:\\Users\\zhouyoukang\\.codeium\\dao-byok";
const CAPTURE = "C:\\Users\\zhouyoukang\\dao_chat_capture";
const wire = require(path.join(BYOK, "core", "cascade_wire.js"));

function post(body, timeout = 60000) {
  return new Promise((resolve) => {
    const b = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const req = http.request({ hostname: "127.0.0.1", port: 11435, path: "/v1/chat/completions",
      method: "POST", headers: { "content-type": "application/json", "content-length": b.length }, timeout },
      (res) => {
        let d = ""; res.on("data", c => d += c); res.on("end", () => resolve({ s: res.statusCode, t: d }));
      });
    req.on("error", e => resolve({ s: 0, t: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ s: 0, t: "TIMEOUT" }); });
    req.write(b); req.end();
  });
}

function parseSSEText(sseText) {
  let t = "";
  for (const l of sseText.split("\n")) {
    if (!l.startsWith("data:")) continue;
    const d = l.slice(5).trim();
    if (!d || d === "[DONE]") continue;
    try { const j = JSON.parse(d); t += (j.choices?.[0]?.delta?.content || ""); } catch {}
  }
  return t;
}

async function testModel(model, sys, userMsg) {
  const msgs = [];
  if (sys) msgs.push({ role: "system", content: sys });
  msgs.push({ role: "user", content: userMsg });
  const r = await post({ model, messages: msgs, max_tokens: 200, stream: true });
  const text = parseSSEText(r.t);
  if (text.includes("content management policy") || text.includes("网关错误 400")) return { ok: false, reason: "AZURE_FILTERED", text: text.slice(0, 100) };
  if (r.s !== 200 || text.startsWith("[") || text.includes("error")) return { ok: false, reason: "ERROR", text: text.slice(0, 100) };
  return { ok: true, text: text.slice(0, 80) };
}

async function main() {
  // Load real system prompt
  let sys = "";
  try {
    const files = fs.readdirSync(CAPTURE).filter(f => f.includes("HAIKU")).sort().reverse();
    if (files[0]) {
      const p = wire.parseGetChatMessageRequest(fs.readFileSync(path.join(CAPTURE, files[0])), false);
      sys = p?.system || "";
    }
  } catch {}
  console.log("sys=" + sys.length + "B");

  const MODELS = ["github::gpt-4.1-mini", "github::gpt-4.1", "github::gpt-4o", "github::DeepSeek-V3-0324"];
  
  for (const m of MODELS) {
    try {
      const r = await testModel(m, sys, "Say OK");
      console.log(`${m}: ${r.ok ? "✓ OK: " + r.text : "✗ " + r.reason + ": " + r.text}`);
    } catch (e) {
      console.log(`${m}: ✗ EXCEPTION: ${e.message}`);
    }
  }
  
  // Also test without system prompt
  console.log("\n--- no sys prompt ---");
  for (const m of ["github::gpt-4.1-mini", "github::DeepSeek-V3-0324"]) {
    try {
      const r = await testModel(m, "", "Say OK");
      console.log(`${m} (no sys): ${r.ok ? "✓ OK: " + r.text : "✗ " + r.reason + ": " + r.text}`);
    } catch (e) {
      console.log(`${m} (no sys): ✗ EXCEPTION: ${e.message}`);
    }
  }
}
main().catch(e => console.error("FATAL:", e.message));
