// Full Cascade flow: StartCascade -> SendUserCascadeMessage -> StreamReactiveUpdates
"use strict";

const http = require("node:http");
const crypto = require("node:crypto");

const ROOT = "V:\\道\\道生一\\一生二\\Windsurf万法归宗\\070-插件_Plugins\\040-道反代_LanProxy\\dao-lan-proxy";
const lsBridge = require(ROOT + "\\ls-bridge.js");
const codec = require(ROOT + "\\proto-codec.js");

const SVC = "/exa.language_server_pb.LanguageServerService";

function rpcUnary(port, csrf, method, jsonObj, ct = "application/json") {
  return new Promise((resolve) => {
    let buf;
    if (ct === "application/connect+json") {
      const json = JSON.stringify(jsonObj);
      buf = codec.wrapConnectFrame(Buffer.from(json, "utf8"));
    } else {
      buf = Buffer.from(JSON.stringify(jsonObj), "utf8");
    }
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

// Stream RPC reading frames (server-streaming uses connect+json with framed envelope)
function rpcStream(port, csrf, method, jsonObj, onFrame, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(jsonObj);
    const framed = codec.wrapConnectFrame(Buffer.from(json, "utf8"));
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: `${SVC}/${method}`,
        method: "POST",
        headers: {
          "content-type": "application/connect+json",
          "connect-protocol-version": "1",
          "connect-content-encoding": "identity",
          "x-codeium-csrf-token": csrf,
          "content-length": framed.length,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const parser = new codec.ConnectFrameParser();
        let trailer = null;
        res.on("data", (c) => {
          for (const f of parser.push(c)) {
            try { onFrame(f); } catch {}
            if (f.flags === 0x02) {
              try { trailer = JSON.parse(f.payload.toString("utf8")); } catch {}
            }
          }
        });
        res.on("end", () => resolve({ status: res.statusCode, trailer }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.write(framed);
    req.end();
  });
}

async function main() {
  console.log("[1] Discover LS + apiKey...");
  const ls = lsBridge.discoverLS(true);
  const ak = lsBridge.extractApiKey(true);
  console.log(`   pid=${ls.pid} port=${ls.port}, apiKey=${ak.apiKey.slice(0, 30)}...`);
  if (!ls.ok || !ak.ok) return;

  const meta = {
    ideName: "windsurf",
    extensionVersion: "1.48.2",
    apiKey: ak.apiKey,
    locale: "en-US",
    ideVersion: "2.0.44",
    extensionName: "windsurf",
  };

  // ─── Step A: StartCascade ───
  console.log("\n[2] StartCascade...");
  const r1 = await rpcUnary(ls.port, ls.csrf, "StartCascade", { metadata: meta });
  console.log(`   status=${r1.status} body=${r1.body?.toString("utf8").slice(0, 200)}`);
  let cascadeId;
  try {
    cascadeId = JSON.parse(r1.body.toString("utf8")).cascadeId;
  } catch (e) {
    console.log(`   parse err: ${e.message}`);
    return;
  }
  console.log(`   cascadeId=${cascadeId}`);

  // ─── Step B: SendUserCascadeMessage ───
  console.log("\n[3] SendUserCascadeMessage...");
  const modelUid = process.env.MODEL || "claude-sonnet-4-6";
  const sendReq = {
    metadata: meta,
    cascadeId,
    items: [
      { text: "Reply with single word: ping" },
    ],
    cascadeConfig: {
      plannerConfig: {
        conversational: {},  // planner_type_config oneof
        requestedModelUid: modelUid,
        planModelUid: modelUid,
      },
    },
    blocking: false,  // fire-and-forget; reactive updates carry the response
  };
  const r2 = await rpcUnary(ls.port, ls.csrf, "SendUserCascadeMessage", sendReq);
  console.log(`   status=${r2.status} body=${r2.body?.toString("utf8").slice(0, 400)}`);

  // ─── Step C: StreamCascadeReactiveUpdates ───
  // Note: request shape is reactive_component_pb.StreamReactiveUpdatesRequest
  // = { protocolVersion: 1, id: cascadeId } — NOT metadata-based!
  console.log("\n[4] StreamCascadeReactiveUpdates...");
  const streamReq = { protocolVersion: 1, id: cascadeId };
  let frameCount = 0;
  let textCollected = "";
  try {
    const r3 = await rpcStream(
      ls.port,
      ls.csrf,
      "StreamCascadeReactiveUpdates",
      streamReq,
      (f) => {
        frameCount++;
        if (f.flags === 0x02) {
          console.log(`   [trailer] ${f.payload.toString("utf8")}`);
        } else {
          const txt = f.payload.toString("utf8");
          // Show first 200 chars, then look for content
          if (frameCount <= 3 || frameCount % 10 === 0) {
            console.log(`   [frame ${frameCount}, ${f.payload.length}b] ${txt.slice(0, 200)}`);
          }
          // Extract any text content from delta
          try {
            const j = JSON.parse(txt);
            // Cascade reactive updates have various shapes — look for content
            if (j.deltaUpdate || j.update) {
              // Walk to find prompt text
            }
          } catch {}
        }
      },
      30000,
    );
    console.log(`\n[5] Stream ended: ${frameCount} frames, status=${r3.status}`);
    if (r3.trailer) console.log(`   trailer: ${JSON.stringify(r3.trailer)}`);
  } catch (e) {
    console.log(`   stream err: ${e.message}`);
  }
}

main().catch((e) => console.error("FATAL:", e));
