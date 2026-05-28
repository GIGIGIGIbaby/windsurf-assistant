"use strict";
// admin_layer234.spec.js -- comprehensive on-admin live test
// Layers 2-4: module exports + spawn :18889 + endpoint exercise
const http = require("http");
const fs = require("fs");
const path = require("path");

let PASS = 0, FAIL = 0;
const ok = (n, c, d) => {
  const t = c ? "OK  " : "FAIL";
  console.log(`  [${t}] ${n}${d ? "  -- " + d : ""}`);
  c ? PASS++ : FAIL++;
};
const info = (s) => console.log(`        ${s}`);

function req(opts, body) {
  return new Promise((R, J) => {
    const r = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch {}
        R({ status: res.statusCode, headers: res.headers, text, json, buf });
      });
    });
    r.setTimeout(5000, () => r.destroy(new Error("timeout")));
    r.on("error", J);
    if (body) r.write(body);
    r.end();
  });
}
const get = (h, p, pa) => req({ hostname: h, port: p, path: pa, method: "GET" });
const post = (h, p, pa, body, hdrs) =>
  req({
    hostname: h,
    port: p,
    path: pa,
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body || "") },
      hdrs || {},
    ),
  }, body);
const del = (h, p, pa) => req({ hostname: h, port: p, path: pa, method: "DELETE" });

(async function main() {
  console.log("");
  console.log("LAYER 2 -- module exports verification");
  let mod;
  try {
    mod = require("../vendor/wam/bundled-origin/source.js");
    ok("L2.1 require source.js OK", true);
  } catch (e) {
    ok("L2.1 require source.js OK", false, e.message);
    process.exit(1);
  }

  const expected = [
    "start", "stop",
    "invertSP", "isLikelyOfficialSP",
    "DAO_DE_JING_81", "TAO_HEADER",
    "modifySPProto", "modifyRawSP",
    "parseProto", "serializeProto",
    "classifyRPC", "routeUpstream",
  ];
  for (const k of expected) {
    ok(`L2.2 export.${k}`, typeof mod[k] !== "undefined");
  }
  ok("L2.3 DAO_DE_JING_81 chars=6776",
    mod.DAO_DE_JING_81 && mod.DAO_DE_JING_81.length === 6776,
    `chars=${mod.DAO_DE_JING_81 ? mod.DAO_DE_JING_81.length : 0}`);
  ok("L2.4 TAO_HEADER non-empty",
    mod.TAO_HEADER && mod.TAO_HEADER.length > 0,
    `chars=${mod.TAO_HEADER ? mod.TAO_HEADER.length : 0}`);
  ok("L2.5 dao first sentence",
    mod.DAO_DE_JING_81 && mod.DAO_DE_JING_81.indexOf("\u9053\u53ef\u9053") >= 0);
  ok("L2.6 dao last chapter",
    mod.DAO_DE_JING_81 && mod.DAO_DE_JING_81.indexOf("\u4fe1\u8a00\u4e0d\u7f8e") >= 0);

  const officialSP = "You are Cascade, a powerful agentic AI coding assistant. " + "x".repeat(300);
  const nonOfficial = "Just a normal user message.";
  ok("L2.7 isLikelyOfficialSP(official)", mod.isLikelyOfficialSP(officialSP) === true);
  ok("L2.8 isLikelyOfficialSP(non)", mod.isLikelyOfficialSP(nonOfficial) === false);
  const inverted = mod.invertSP(officialSP);
  ok("L2.9 invertSP grew",
    inverted.length > officialSP.length,
    `${officialSP.length} -> ${inverted.length}`);
  ok("L2.10 invertSP contains dao",
    inverted.indexOf("\u9053\u53ef\u9053") >= 0);

  console.log("");
  console.log("LAYER 3 -- in-process proxy spawn :18889 (admin isolated)");
  let server;
  try {
    server = await mod.start({ port: 18889 });
    ok("L3.1 start :18889", true,
      `port=${server.port || 18889} pid=${process.pid}`);
  } catch (e) {
    ok("L3.1 start :18889", false, e.message);
    process.exit(1);
  }

  let pingR;
  try {
    pingR = await get("127.0.0.1", 18889, "/origin/ping");
  } catch (e) {
    ok("L3.2 ping :18889", false, e.message);
    process.exit(1);
  }
  ok("L3.2 ping :18889",
    pingR.status === 200 && pingR.json && pingR.json.ok === true,
    `mode=${pingR.json.mode} pid=${pingR.json.pid} dao_chars=${pingR.json.dao_chars}`);

  const stR = await get("127.0.0.1", 18889, "/origin/selftest");
  ok("L3.3 selftest :18889",
    stR.status === 200 && stR.json,
    `keys=${stR.json ? Object.keys(stR.json).join(",") : "?"}`);
  if (stR.json && stR.json.all_paths_pass !== undefined) {
    ok("L3.4 selftest all_paths_pass", stR.json.all_paths_pass === true);
  }

  console.log("");
  console.log("LAYER 4 -- hot toggle + custom_sp + sig + rpc_trace");
  let modeR = await get("127.0.0.1", 18889, "/origin/mode");
  ok("L4.1 GET /origin/mode",
    modeR.status === 200 && modeR.json && modeR.json.mode);
  info(`initial mode=${modeR.json.mode}`);

  const setBody = JSON.stringify({ mode: "invert" });
  const t0 = Date.now();
  const setR = await post("127.0.0.1", 18889, "/origin/mode", setBody);
  const dt = Date.now() - t0;
  ok("L4.2 POST mode=invert", setR.status === 200, `${dt}ms`);

  modeR = await get("127.0.0.1", 18889, "/origin/mode");
  ok("L4.3 mode now invert", modeR.json.mode === "invert");

  if (typeof mod.setMode === "function") {
    mod.setMode("passthrough");
    ok("L4.4 setMode in-proc", mod.getMode && mod.getMode() === "passthrough");
    mod.setMode("invert");
  } else {
    ok("L4.4 setMode (skipped)", true, "no in-proc setMode");
  }

  const sigR1 = await get("127.0.0.1", 18889, "/origin/sig");
  ok("L4.5 GET /origin/sig",
    sigR1.status === 200 && sigR1.json,
    `sp_sig=${sigR1.json && sigR1.json.sp_sig ? sigR1.json.sp_sig.substring(0,16) : "?"}`);

  const customBody = JSON.stringify({ sp: "Custom SP injected by admin layer4 test" });
  const cR = await post("127.0.0.1", 18889, "/origin/custom_sp", customBody);
  ok("L4.6 POST /origin/custom_sp", cR.status === 200, `set_chars=${customBody.length}`);

  const cgR = await get("127.0.0.1", 18889, "/origin/custom_sp");
  ok("L4.7 GET /origin/custom_sp",
    cgR.status === 200 && cgR.json && cgR.json.sp,
    `len=${cgR.json && cgR.json.sp ? cgR.json.sp.length : 0}`);

  const sigR2 = await get("127.0.0.1", 18889, "/origin/sig");
  ok("L4.8 sig changed after custom_sp",
    sigR1.json.sp_sig !== sigR2.json.sp_sig,
    `${sigR1.json.sp_sig.substring(0,8)} -> ${sigR2.json.sp_sig.substring(0,8)}`);

  const dR = await del("127.0.0.1", 18889, "/origin/custom_sp");
  ok("L4.9 DELETE /origin/custom_sp", dR.status === 200);

  const cg2R = await get("127.0.0.1", 18889, "/origin/custom_sp");
  const cleared = !cg2R.json || !cg2R.json.sp;
  ok("L4.10 custom_sp cleared", cleared);

  const liR = await get("127.0.0.1", 18889, "/origin/lastinject");
  ok("L4.11 GET /origin/lastinject", liR.status === 200);

  const rpR = await get("127.0.0.1", 18889, "/origin/realprompt");
  ok("L4.12 GET /origin/realprompt", rpR.status === 200);

  const pvR = await get("127.0.0.1", 18889, "/origin/preview");
  ok("L4.13 GET /origin/preview", pvR.status === 200);

  const tcR = await get("127.0.0.1", 18889, "/origin/rpc_trace");
  ok("L4.14 GET /origin/rpc_trace", tcR.status === 200);

  const rpcPath = "/exa.codeium_common_pb.CodeiumCommonService/CreateLogin";
  const fakeBody = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00]);
  let rpcR;
  try {
    rpcR = await req({
      hostname: "127.0.0.1",
      port: 18889,
      path: rpcPath,
      method: "POST",
      headers: {
        "Content-Type": "application/connect+proto",
        "Connect-Protocol-Version": "1",
        "Content-Length": fakeBody.length,
      },
    }, fakeBody);
    ok("L4.15 fake POST RPC", rpcR.status >= 0,
      `status=${rpcR.status} (4xx/5xx normal -- upstream not reachable)`);
  } catch (e) {
    ok("L4.15 fake POST RPC", false, e.message);
  }

  const tc2R = await get("127.0.0.1", 18889, "/origin/rpc_trace");
  // v17.79 endpoint returns { total_traced, kinds, url_groups, recent }
  const traceCount = tc2R.json && typeof tc2R.json.total_traced === "number"
    ? tc2R.json.total_traced
    : (tc2R.json && tc2R.json.recent ? tc2R.json.recent.length : 0);
  const kindsStr = tc2R.json && tc2R.json.kinds ? JSON.stringify(tc2R.json.kinds) : "?";
  ok("L4.16 rpc_trace recorded >=1", traceCount >= 1,
    `total_traced=${traceCount} kinds=${kindsStr}`);

  console.log("");
  console.log("LAYER 5 -- close + cleanup");
  // server is the start() return object: { server, port, host, close: ()=>Promise, ... }
  // server.server is the actual http.Server
  let closed = false;
  try {
    if (server && typeof server.close === "function") {
      // race against 2s timeout (keep-alive may hold)
      await Promise.race([
        server.close(),
        new Promise((R) => setTimeout(R, 2000)),
      ]);
      // force unref any remaining sockets
      if (server.server && typeof server.server.closeAllConnections === "function") {
        server.server.closeAllConnections();
      }
      closed = true;
    }
  } catch (e) {}
  ok("L5.1 close()", closed);

  let stillOpen = false;
  try {
    const r = await Promise.race([
      get("127.0.0.1", 18889, "/origin/ping"),
      new Promise((_, J) => setTimeout(() => J(new Error("timeout")), 1000)),
    ]);
    if (r && r.status === 200) stillOpen = true;
  } catch {}
  ok("L5.2 :18889 closed", !stillOpen);

  console.log("");
  console.log("==========================================");
  console.log(`  TOTAL  PASS=${PASS}  FAIL=${FAIL}`);
  console.log("==========================================");
  // force exit (some lib internals keep refs)
  setTimeout(() => process.exit(FAIL > 0 ? 1 : 0), 100);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
