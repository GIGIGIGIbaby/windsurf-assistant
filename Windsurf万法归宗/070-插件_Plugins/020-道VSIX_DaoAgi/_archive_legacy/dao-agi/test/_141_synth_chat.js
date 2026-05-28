"use strict";

if (!process.argv.includes("--test")) process.argv.push("--test");

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "..");
const ZH_SRC = path.join(ROOT, "vendor", "wam", "bundled-origin", "源.js");
const EN_SRC = path.join(ROOT, "vendor", "wam", "bundled-origin", "source.js");
const src = require(ZH_SRC);

let pass = 0;
let fail = 0;

function ok(label, cond, detail) {
  if (cond) pass += 1;
  else fail += 1;
  const mark = cond ? "✓" : "✗";
  console.log("  " + mark + " " + String(label).padEnd(58) + (detail ? " " + detail : ""));
}

function httpGet(port, path_) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: path_, method: "GET", timeout: 3000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body), raw: body }); }
        catch { resolve({ status: res.statusCode, data: null, raw: body }); }
      });
    });
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.on("timeout", () => { try { req.destroy(); } catch {} resolve({ status: 0, error: "timeout" }); });
    req.end();
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => {
    try { server.close(() => resolve()); }
    catch { resolve(); }
  });
}

(async () => {
  console.log("════════ v17.79 · rpc_trace · synthetic e2e ════════");
  console.log("  源: " + ZH_SRC);

  const zhBuf = fs.readFileSync(ZH_SRC);
  const enBuf = fs.readFileSync(EN_SRC);
  ok("源.js/source.js byte equal", Buffer.compare(zhBuf, enBuf) === 0);
  ok("source has v17.79", zhBuf.includes(Buffer.from("v17.79")));
  ok("source has /origin/rpc_trace", zhBuf.includes(Buffer.from("/origin/rpc_trace")));
  ok("source has _traceRPC", zhBuf.includes(Buffer.from("_traceRPC")));

  ok("classifyRPC exported", typeof src.classifyRPC === "function");
  ok("server exported", src.server && typeof src.server.listen === "function");
  ok("_traceRPC exported", typeof src._traceRPC === "function");
  ok("_rpcTrace exported", Array.isArray(src._rpcTrace));

  if (!src.classifyRPC || !src.server || !src._traceRPC || !Array.isArray(src._rpcTrace)) {
    process.exit(1);
  }

  const cases = [
    ["/exa.chat_web.ChatWebService/GetChatMessage", "CHAT_PROTO"],
    ["/exa.chat_web.ChatWebService/GetChatMessageV2?connect=v1", "CHAT_PROTO"],
    ["/exa.chat_web.ChatWebService/RawGetChatMessage", "CHAT_RAW"],
    ["/exa.codeium_common_pb.CascadeService/StartCascade", "INFER_STRIP"],
    ["/api/auth/login?x=1", "PASSTHROUGH"],
  ];

  src._rpcTrace.length = 0;
  for (const [path_, expected] of cases) {
    const kind = src.classifyRPC(path_);
    ok("classify " + path_, kind === expected, "got=" + kind + " expected=" + expected);
    src._traceRPC("POST", path_, kind, 123);
  }

  const port = await listen(src.server);
  try {
    const trace = await httpGet(port, "/origin/rpc_trace?limit=3");
    ok("GET /origin/rpc_trace status=200", trace.status === 200);
    ok("rpc_trace ok=true", trace.data && trace.data.ok === true);
    ok("rpc_trace total_traced=5", trace.data && trace.data.total_traced === 5);
    ok("rpc_trace CHAT_PROTO count=2", trace.data && trace.data.kinds && trace.data.kinds.CHAT_PROTO === 2);
    ok("rpc_trace CHAT_RAW count=1", trace.data && trace.data.kinds && trace.data.kinds.CHAT_RAW === 1);
    ok("rpc_trace INFER_STRIP count=1", trace.data && trace.data.kinds && trace.data.kinds.INFER_STRIP === 1);
    ok("rpc_trace PASSTHROUGH count=1", trace.data && trace.data.kinds && trace.data.kinds.PASSTHROUGH === 1);
    ok("rpc_trace recent limit=3", trace.data && Array.isArray(trace.data.recent) && trace.data.recent.length === 3);
    ok("rpc_trace exposes inference_services", trace.data && Array.isArray(trace.data.inference_services) && trace.data.inference_services.includes("exa.chat_web.ChatWebService"));
    ok("rpc_trace groups GetChatMessageV2 without query", trace.data && Array.isArray(trace.data.url_groups) && trace.data.url_groups.some((g) => g.url === "/exa.chat_web.ChatWebService/GetChatMessageV2"));
  } finally {
    await close(src.server);
  }

  console.log("══════════════════════════════════════════════════════");
  console.log("  PASS=" + pass + "  FAIL=" + fail + "  TOTAL=" + (pass + fail));
  console.log("  " + (fail === 0 ? "✓ 全通 · 慎终如始" : "✗ 失败"));
  console.log("══════════════════════════════════════════════════════");
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("FATAL:", e && e.stack ? e.stack : e);
  process.exit(1);
});
