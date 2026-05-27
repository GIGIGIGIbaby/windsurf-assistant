// Test RawGetChatMessage with CORRECTED proto schema
"use strict";

const http = require("node:http");
const crypto = require("node:crypto");

const ROOT = "V:\\道\\道生一\\一生二\\Windsurf万法归宗\\070-插件_Plugins\\040-道反代_LanProxy\\dao-lan-proxy";
const lsBridge = require(ROOT + "\\ls-bridge.js");
const codec = require(ROOT + "\\proto-codec.js");

const SVC = "/exa.language_server_pb.LanguageServerService";

// Build RawGetChatMessageRequest with CORRECT field numbers
function buildRawChatRequest(apiKey, modelUid, messages) {
  // Metadata (same fields as before)
  const meta = codec.encodeMessage(1, [
    codec.encodeString(1, "windsurf"),       // ide_name
    codec.encodeString(2, "1.48.2"),         // extension_version
    codec.encodeString(3, apiKey),           // api_key
    codec.encodeString(4, "en-US"),          // locale
    codec.encodeString(7, "2.0.44"),         // ide_version
    codec.encodeString(12, "windsurf"),      // extension_name
  ]);

  const SOURCE_USER = 1;

  // chat_messages: field 2 (was 3 for GetChatMessage)
  const msgBufs = (messages || []).map((m) => {
    const mid = crypto.randomUUID();
    const prompt = codec.encodeMessage(10, [
      codec.encodeString(1, mid),
      codec.encodeVarintField(2, SOURCE_USER),
      codec.encodeString(3, m.content || ""),
    ]);
    return codec.encodeMessage(2, [   // ← FIELD 2 (RawGetChat)
      codec.encodeString(1, mid),
      codec.encodeVarintField(2, SOURCE_USER),
      prompt,
    ]);
  });

  // chat_model_name: field 5 (was 14 for GetChatMessage)
  const model = codec.encodeString(5, modelUid);

  return Buffer.concat([meta, ...msgBufs, model]);
}

function rpcCall(port, csrf, method, body, ct) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: `${SVC}/${method}`,
        method: "POST",
        headers: {
          "content-type": ct || "application/json",
          "connect-protocol-version": "1",
          "x-codeium-csrf-token": csrf,
          "content-length": body.length,
        },
        timeout: 60000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            ct: res.headers["content-type"],
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", (e) => resolve({ err: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ err: "timeout" });
    });
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log("[1] Discover LS...");
  const ls = lsBridge.discoverLS(true);
  console.log(`   pid=${ls.pid} port=${ls.port}`);

  console.log("[2] Extract apiKey...");
  const ak = lsBridge.extractApiKey(true);
  console.log(`   ok=${ak.ok} preview=${ak.apiKey.slice(0, 30)}...`);

  if (!ls.ok || !ak.ok) {
    console.log("Pre-reqs failed");
    return;
  }

  const messages = [{ role: "user", content: "Reply with single word: ping" }];
  const models = ["claude-sonnet-4-6", "MODEL_CASCADE_BASE", "MODEL_SWE_1_5"];

  for (const modelUid of models) {
    console.log(`\n[3] Testing model: ${modelUid}`);
    const reqBuf = buildRawChatRequest(ak.apiKey, modelUid, messages);
    const framed = codec.wrapConnectFrame(reqBuf);
    console.log(`   request: ${reqBuf.length} bytes proto, ${framed.length} bytes framed`);

    const r = await rpcCall(
      ls.port,
      ls.csrf,
      "RawGetChatMessage",
      framed,
      "application/connect+proto",
    );
    console.log(`   status=${r.status} bytes=${r.body?.length || 0}`);
    if (r.err) console.log(`   ERR: ${r.err}`);
    if (r.body?.length) {
      const parser = new codec.ConnectFrameParser();
      const frames = parser.push(r.body);
      let combined = "";
      for (const f of frames) {
        if (f.flags === 0x02) {
          const t = f.payload.toString("utf8");
          console.log(`   trailer: ${t.slice(0, 250)}`);
        } else {
          const p = codec.parseChatFrame(f.payload);
          if (p.text) combined += p.text;
          if (p.tokens || p.quotaCostBp) {
            console.log(`   meta: tokens=${p.tokens} cost_bp=${p.quotaCostBp}`);
          }
        }
      }
      if (combined) console.log(`   ✓ TEXT: "${combined.slice(0, 120)}"`);
    }
  }
}

main().catch((e) => console.error("FATAL:", e));
