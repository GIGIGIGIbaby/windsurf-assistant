// Probe with minimal proto to isolate issue
"use strict";

const http = require("node:http");
const crypto = require("node:crypto");

const ROOT = "V:\\道\\道生一\\一生二\\Windsurf万法归宗\\070-插件_Plugins\\040-道反代_LanProxy\\dao-lan-proxy";
const lsBridge = require(ROOT + "\\ls-bridge.js");
const codec = require(ROOT + "\\proto-codec.js");

const SVC = "/exa.language_server_pb.LanguageServerService";

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
        timeout: 10000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
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
  const ls = lsBridge.discoverLS(true);
  const ak = lsBridge.extractApiKey(true);
  console.log(`LS pid=${ls.pid} port=${ls.port}, apiKey ok=${ak.ok}`);

  // ─── Test 1: Empty body (no metadata) ───
  {
    const empty = Buffer.alloc(0);
    const framed = codec.wrapConnectFrame(empty);
    const r = await rpcCall(ls.port, ls.csrf, "RawGetChatMessage", framed, "application/connect+proto");
    console.log(`[1 empty] status=${r.status} ${r.body?.toString("utf8").slice(0, 200)}`);
  }

  // ─── Test 2: Metadata only ───
  {
    const meta = codec.encodeMessage(1, [
      codec.encodeString(1, "windsurf"),
      codec.encodeString(2, "1.48.2"),
      codec.encodeString(3, ak.apiKey),
      codec.encodeString(4, "en-US"),
      codec.encodeString(7, "2.0.44"),
      codec.encodeString(12, "windsurf"),
    ]);
    const framed = codec.wrapConnectFrame(meta);
    const r = await rpcCall(ls.port, ls.csrf, "RawGetChatMessage", framed, "application/connect+proto");
    console.log(`[2 meta-only] status=${r.status} ${r.body?.toString("utf8").slice(0, 250)}`);
  }

  // ─── Test 3: Metadata + chat_model_name only ───
  {
    const meta = codec.encodeMessage(1, [
      codec.encodeString(1, "windsurf"),
      codec.encodeString(2, "1.48.2"),
      codec.encodeString(3, ak.apiKey),
      codec.encodeString(7, "2.0.44"),
      codec.encodeString(12, "windsurf"),
    ]);
    const model = codec.encodeString(5, "claude-sonnet-4-6");
    const body = Buffer.concat([meta, model]);
    const framed = codec.wrapConnectFrame(body);
    const r = await rpcCall(ls.port, ls.csrf, "RawGetChatMessage", framed, "application/connect+proto");
    console.log(`[3 meta+model] status=${r.status} ${r.body?.toString("utf8").slice(0, 250)}`);
  }

  // ─── Test 4: Add minimal chat_messages (just message_id at F1 + source at F2, no request body) ───
  {
    const mid = crypto.randomUUID();
    const chatMsg = codec.encodeMessage(2, [   // F2 chat_messages
      codec.encodeString(1, mid),
      codec.encodeVarintField(2, 1),    // source=USER
    ]);
    const meta = codec.encodeMessage(1, [
      codec.encodeString(1, "windsurf"),
      codec.encodeString(2, "1.48.2"),
      codec.encodeString(3, ak.apiKey),
      codec.encodeString(7, "2.0.44"),
      codec.encodeString(12, "windsurf"),
    ]);
    const model = codec.encodeString(5, "claude-sonnet-4-6");
    const body = Buffer.concat([meta, chatMsg, model]);
    const framed = codec.wrapConnectFrame(body);
    console.log(`[4 minimal-msg] body=${body.length}b hex=${body.toString("hex").slice(0, 100)}...`);
    const r = await rpcCall(ls.port, ls.csrf, "RawGetChatMessage", framed, "application/connect+proto");
    console.log(`[4 minimal-msg] status=${r.status} ${r.body?.toString("utf8").slice(0, 300)}`);
  }

  // ─── Test 5: Add full ChatMessagePrompt (F10 = request) ───
  {
    const mid = crypto.randomUUID();
    const prompt = codec.encodeMessage(10, [
      codec.encodeString(1, mid),
      codec.encodeVarintField(2, 1),
      codec.encodeString(3, "say hi"),
    ]);
    const chatMsg = codec.encodeMessage(2, [   // F2 chat_messages
      codec.encodeString(1, mid),
      codec.encodeVarintField(2, 1),
      prompt,
    ]);
    const meta = codec.encodeMessage(1, [
      codec.encodeString(1, "windsurf"),
      codec.encodeString(2, "1.48.2"),
      codec.encodeString(3, ak.apiKey),
      codec.encodeString(7, "2.0.44"),
      codec.encodeString(12, "windsurf"),
    ]);
    const model = codec.encodeString(5, "claude-sonnet-4-6");
    const body = Buffer.concat([meta, chatMsg, model]);
    const framed = codec.wrapConnectFrame(body);
    console.log(`[5 with-prompt] body=${body.length}b`);
    const r = await rpcCall(ls.port, ls.csrf, "RawGetChatMessage", framed, "application/connect+proto");
    console.log(`[5 with-prompt] status=${r.status} ${r.body?.toString("utf8").slice(0, 300)}`);
    if (r.body && r.body.length > 200) {
      // Try parse frames
      const parser = new codec.ConnectFrameParser();
      const frames = parser.push(r.body);
      console.log(`  parsed ${frames.length} frames`);
      for (const f of frames) {
        console.log(`  flag=${f.flags} len=${f.payload.length}`);
        if (f.flags === 0) {
          const p = codec.parseChatFrame(f.payload);
          if (p.text) console.log(`  text="${p.text.slice(0, 80)}"`);
        } else if (f.flags === 0x02) {
          console.log(`  trailer=${f.payload.toString("utf8").slice(0, 200)}`);
        }
      }
    }
  }
}

main().catch((e) => console.error("FATAL:", e));
