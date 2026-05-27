// Try JSON encoding (Connect-RPC supports it)
"use strict";

const http = require("node:http");
const crypto = require("node:crypto");

const ROOT = "V:\\道\\道生一\\一生二\\Windsurf万法归宗\\070-插件_Plugins\\040-道反代_LanProxy\\dao-lan-proxy";
const lsBridge = require(ROOT + "\\ls-bridge.js");
const codec = require(ROOT + "\\proto-codec.js");

const SVC = "/exa.language_server_pb.LanguageServerService";

function rpcCall(port, csrf, method, body, ct = "application/json") {
  return new Promise((resolve) => {
    const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: `${SVC}/${method}`,
        method: "POST",
        headers: {
          "content-type": ct,
          "connect-protocol-version": "1",
          "x-codeium-csrf-token": csrf,
          "content-length": buf.length,
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
    req.write(buf);
    req.end();
  });
}

async function main() {
  const ls = lsBridge.discoverLS(true);
  const ak = lsBridge.extractApiKey(true);
  console.log(`LS pid=${ls.pid} port=${ls.port}, apiKey ok=${ak.ok}`);

  const meta = {
    ideName: "windsurf",
    extensionVersion: "1.48.2",
    apiKey: ak.apiKey,
    locale: "en-US",
    ideVersion: "2.0.44",
    extensionName: "windsurf",
  };

  const mid = crypto.randomUUID();
  const ts = new Date().toISOString();

  // RawGetChatMessageRequest as JSON
  // Step 1: StartCascade to get a valid session
  const startReq = JSON.stringify({ metadata: meta });
  const startRes = await rpcCall(ls.port, ls.csrf, "StartCascade", startReq);
  console.log(`[StartCascade] status=${startRes.status} body=${startRes.body?.toString("utf8").slice(0, 200)}`);
  let cascadeId = null;
  try {
    cascadeId = JSON.parse(startRes.body.toString("utf8")).cascadeId;
  } catch {}
  console.log(`   cascadeId=${cascadeId}`);

  // Use cascadeId as conversationId
  const convId = cascadeId || crypto.randomUUID();

  // Try with intent.generic carrying the prompt
  const reqJson = {
    metadata: meta,
    chatMessages: [
      {
        messageId: mid,
        source: "CHAT_MESSAGE_SOURCE_USER",
        timestamp: ts,
        conversationId: convId,
        intent: {
          // ChatMessageIntent is a oneof container; per its name, IntentGeneric = pure text
          generic: { text: "say hi" },
        },
      },
    ],
    chatModelName: "claude-sonnet-4-6",
  };

  // ─── A: connect+json with framing ───
  const jsonStr = JSON.stringify(reqJson);
  const jsonBuf = Buffer.from(jsonStr, "utf8");
  const framedJson = codec.wrapConnectFrame(jsonBuf);

  for (const method of ["RawGetChatMessage", "GetChatMessage"]) {
    console.log(`\n[${method}] connect+json framed:`);
    const r = await rpcCall(ls.port, ls.csrf, method, framedJson, "application/connect+json");
    console.log(`   status=${r.status} ct=${r.ct} bytes=${r.body?.length || 0}`);
    if (r.body?.length) {
      // Parse frames
      const parser = new codec.ConnectFrameParser();
      const frames = parser.push(r.body);
      console.log(`   frames=${frames.length}`);
      for (const f of frames) {
        if (f.flags === 0x02) {
          console.log(`   trailer: ${f.payload.toString("utf8")}`);
        } else {
          console.log(`   data ${f.payload.length}b: ${f.payload.toString("utf8")}`);
        }
      }
    }
  }
}

main().catch((e) => console.error("FATAL:", e));
