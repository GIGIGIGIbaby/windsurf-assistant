// Probe LS for working chat methods · find which RPCs actually return data
"use strict";

const http = require("node:http");
const path = require("node:path");

const LS_PORT = 16780;
const LS_CSRF = process.env.LS_CSRF || "11111111-2222-3333-4444-555555555555";
const SVC = "/exa.language_server_pb.LanguageServerService";

// Use the bridge module from 040 to get apiKey + csrf
const bridgePath = path.resolve(
  __dirname,
  "..",
  "070-插件_Plugins",
  "040-道反代_LanProxy",
  "dao-lan-proxy",
  "ls-bridge.js",
);
const codecPath = path.resolve(
  __dirname,
  "..",
  "070-插件_Plugins",
  "040-道反代_LanProxy",
  "dao-lan-proxy",
  "proto-codec.js",
);

const lsBridge = require(bridgePath);
const codec = require(codecPath);

async function callLs(method, body, csrf, ct = "application/json") {
  return new Promise((resolve) => {
    const buf = ct.includes("json") ? Buffer.from(body, "utf8") : body;
    const req = http.request(
      {
        host: "127.0.0.1",
        port: LS_PORT,
        path: `${SVC}/${method}`,
        method: "POST",
        headers: {
          "content-type": ct,
          "connect-protocol-version": "1",
          "x-codeium-csrf-token": csrf,
          "content-length": buf.length,
        },
        timeout: 30000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            ct: res.headers["content-type"],
            body,
            text: body.toString("utf8").substring(0, 400),
          });
        });
        res.on("error", (e) => resolve({ err: e.message }));
      },
    );
    req.on("error", (e) => resolve({ err: e.message }));
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
      resolve({ err: "timeout" });
    });
    req.write(buf);
    req.end();
  });
}

async function main() {
  console.log("[1] Discover LS...");
  const ls = lsBridge.discoverLS(true);
  if (!ls.ok) {
    console.log("LS discovery failed:", ls.error);
    return;
  }
  console.log(
    `   pid=${ls.pid} port=${ls.port} csrf=${ls.csrf.slice(0, 8)}... candidates=[${ls.candidates}]`,
  );

  console.log("[2] Extract apiKey from vscdb...");
  const ak = lsBridge.extractApiKey(true);
  console.log(
    `   ok=${ak.ok} count=${ak.count} preview=${ak.apiKey.slice(0, 22)}...`,
  );

  // Use port from discovery (override module constant)
  const PORT = ls.port;
  const CSRF = ls.csrf;
  const APIKEY = ak.apiKey;

  console.log(`\n[3] Probe each chat method on LS (port=${PORT})\n`);

  const messages = [{ role: "user", content: "ping" }];
  const modelUid = "claude-sonnet-4-6";

  // Method A: GetChatMessage (deprecated)
  {
    const reqBuf = codec.buildChatRequest(APIKEY, modelUid, messages);
    const framed = codec.wrapConnectFrame(reqBuf);
    const r = await new Promise((resolve) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: PORT,
          path: `${SVC}/GetChatMessage`,
          method: "POST",
          headers: {
            "content-type": "application/connect+proto",
            "connect-protocol-version": "1",
            "x-codeium-csrf-token": CSRF,
            "content-length": framed.length,
          },
          timeout: 15000,
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
      req.write(framed);
      req.end();
    });
    console.log(`A. GetChatMessage:           status=${r.status} bytes=${r.body?.length || 0} ct=${r.ct}`);
    if (r.body) {
      // try parse first frame
      const parser = new codec.ConnectFrameParser();
      const frames = parser.push(r.body);
      for (const f of frames) {
        if (f.flags === 0x02) {
          console.log(`   trailer: ${f.payload.toString("utf8").slice(0, 200)}`);
        } else {
          console.log(`   data ${f.payload.length}b`);
        }
      }
    }
    if (r.err) console.log(`   ERR: ${r.err}`);
  }

  // Method B: RawGetChatMessage (same proto, modern)
  {
    const reqBuf = codec.buildChatRequest(APIKEY, modelUid, messages);
    const framed = codec.wrapConnectFrame(reqBuf);
    const r = await new Promise((resolve) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: PORT,
          path: `${SVC}/RawGetChatMessage`,
          method: "POST",
          headers: {
            "content-type": "application/connect+proto",
            "connect-protocol-version": "1",
            "x-codeium-csrf-token": CSRF,
            "content-length": framed.length,
          },
          timeout: 15000,
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
      req.write(framed);
      req.end();
    });
    console.log(`B. RawGetChatMessage:        status=${r.status} bytes=${r.body?.length || 0} ct=${r.ct}`);
    if (r.body && r.body.length) {
      const parser = new codec.ConnectFrameParser();
      const frames = parser.push(r.body);
      let combined = "";
      for (const f of frames) {
        if (f.flags === 0x02) {
          console.log(`   trailer: ${f.payload.toString("utf8").slice(0, 200)}`);
        } else {
          const parsed = codec.parseChatFrame(f.payload);
          if (parsed.text) combined += parsed.text;
        }
      }
      if (combined) console.log(`   text: "${combined.slice(0, 80)}..."`);
    }
    if (r.err) console.log(`   ERR: ${r.err}`);
  }

  // Method C: StartCascade + SendUserCascadeMessage
  console.log("\nC. StartCascade -> SendUserCascadeMessage flow:");

  // C.1 StartCascade (JSON path)
  const meta = {
    ideName: "windsurf",
    extensionVersion: "1.48.2",
    apiKey: APIKEY,
    locale: "en-US",
    ideVersion: "2.0.44",
    extensionName: "windsurf",
  };
  const startReq = JSON.stringify({ metadata: meta });
  const r1 = await callLs("StartCascade", startReq, CSRF);
  console.log(`   StartCascade:             status=${r1.status} bytes=${r1.body?.length || 0}`);
  console.log(`   body: ${r1.text}`);

  // Try parse cascadeId
  let cascadeId = null;
  try {
    const j = JSON.parse(r1.body.toString("utf8"));
    cascadeId = j.cascadeId || j.cascade_id;
    console.log(`   cascadeId=${cascadeId}`);
  } catch (e) {
    console.log(`   parse err: ${e.message}`);
  }
}

main().catch((e) => console.error("FATAL:", e));
