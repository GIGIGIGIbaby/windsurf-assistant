// Probe LS for working chat methods
"use strict";

const http = require("node:http");

const ROOT = "V:\\道\\道生一\\一生二\\Windsurf万法归宗\\070-插件_Plugins\\040-道反代_LanProxy\\dao-lan-proxy";
const lsBridge = require(ROOT + "\\ls-bridge.js");
const codec = require(ROOT + "\\proto-codec.js");

const SVC = "/exa.language_server_pb.LanguageServerService";

function rpcCall(port, csrf, method, body, ct = "application/json") {
  return new Promise((resolve) => {
    const buf =
      typeof body === "string" ? Buffer.from(body, "utf8") : body;
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
        timeout: 30000,
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
  console.log("[1] Discover LS...");
  const ls = lsBridge.discoverLS(true);
  if (!ls.ok) {
    console.log("LS discovery failed:", ls.error);
    return;
  }
  console.log(
    `   pid=${ls.pid} port=${ls.port} csrf=${ls.csrf.slice(0, 8)}...`,
  );

  console.log("[2] Extract apiKey...");
  const ak = lsBridge.extractApiKey(true);
  console.log(
    `   ok=${ak.ok} count=${ak.count} preview=${ak.apiKey.slice(0, 30)}...`,
  );

  const PORT = ls.port;
  const CSRF = ls.csrf;
  const APIKEY = ak.apiKey;

  console.log("\n[3] Test methods\n");

  const messages = [{ role: "user", content: "ping" }];
  const modelUid = "claude-sonnet-4-6";

  // ── A. GetChatMessage (deprecated?) ──
  {
    const reqBuf = codec.buildChatRequest(APIKEY, modelUid, messages);
    const framed = codec.wrapConnectFrame(reqBuf);
    const r = await rpcCall(
      PORT,
      CSRF,
      "GetChatMessage",
      framed,
      "application/connect+proto",
    );
    console.log(
      `A. GetChatMessage:     status=${r.status} bytes=${r.body?.length || 0}`,
    );
    if (r.body?.length) {
      const parser = new codec.ConnectFrameParser();
      const frames = parser.push(r.body);
      for (const f of frames) {
        if (f.flags === 0x02) {
          console.log(`   trailer: ${f.payload.toString("utf8").slice(0, 200)}`);
        } else {
          const p = codec.parseChatFrame(f.payload);
          if (p.text) console.log(`   text: "${p.text.slice(0, 60)}"`);
        }
      }
    }
    if (r.err) console.log(`   ERR: ${r.err}`);
  }

  // ── B. RawGetChatMessage ──
  {
    const reqBuf = codec.buildChatRequest(APIKEY, modelUid, messages);
    const framed = codec.wrapConnectFrame(reqBuf);
    const r = await rpcCall(
      PORT,
      CSRF,
      "RawGetChatMessage",
      framed,
      "application/connect+proto",
    );
    console.log(
      `B. RawGetChatMessage:  status=${r.status} bytes=${r.body?.length || 0}`,
    );
    if (r.body?.length) {
      const parser = new codec.ConnectFrameParser();
      const frames = parser.push(r.body);
      for (const f of frames) {
        if (f.flags === 0x02) {
          console.log(`   trailer: ${f.payload.toString("utf8").slice(0, 200)}`);
        } else {
          const p = codec.parseChatFrame(f.payload);
          if (p.text) console.log(`   text: "${p.text.slice(0, 60)}"`);
        }
      }
    }
    if (r.err) console.log(`   ERR: ${r.err}`);
  }

  // ── C. StartCascade ──
  console.log("\nC. StartCascade -> SendUserCascadeMessage flow:");
  const meta = {
    ideName: "windsurf",
    extensionVersion: "1.48.2",
    apiKey: APIKEY,
    locale: "en-US",
    ideVersion: "2.0.44",
    extensionName: "windsurf",
  };
  const startReq = JSON.stringify({ metadata: meta });
  const r1 = await rpcCall(PORT, CSRF, "StartCascade", startReq);
  console.log(
    `   StartCascade:        status=${r1.status} bytes=${r1.body?.length || 0}`,
  );
  if (r1.body?.length) {
    const t = r1.body.toString("utf8");
    console.log(`   body: ${t.slice(0, 300)}`);
    try {
      const j = JSON.parse(t);
      const cascadeId = j.cascadeId || j.cascade_id;
      console.log(`   cascadeId=${cascadeId || "N/A"}`);
      console.log(`   keys: ${Object.keys(j).join(",")}`);
    } catch {}
  }

  // ── D. GetUserStatus (sanity check, known-working) ──
  const r2 = await rpcCall(
    PORT,
    CSRF,
    "GetUserStatus",
    JSON.stringify({ metadata: meta }),
  );
  console.log(
    `\nD. GetUserStatus (sanity): status=${r2.status} bytes=${r2.body?.length || 0}`,
  );
  if (r2.body?.length) {
    const t = r2.body.toString("utf8");
    try {
      const j = JSON.parse(t);
      console.log(
        `   email=${j.userStatus?.email} plan=${j.userStatus?.planStatus?.planName}`,
      );
    } catch {
      console.log(`   raw: ${t.slice(0, 200)}`);
    }
  }
}

main().catch((e) => console.error("FATAL:", e));
