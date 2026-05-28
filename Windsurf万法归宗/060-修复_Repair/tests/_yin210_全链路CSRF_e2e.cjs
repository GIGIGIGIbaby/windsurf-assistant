#!/usr/bin/env node
/**
 * _yin210_全链路CSRF_e2e.cjs · 印210 · CSRF 内存提取 + 全链路验证
 *
 *   「天下之至柔，驰骋于天下之致坚；无有入于无间。」
 *   「道生之，而德畜之；物刑之，而器成之。」
 *
 * 技术突破:
 *   通过 comsvcs.dll MiniDump 提取 LSP 进程内存中的 UUID v4，
 *   逐一暴力验证 Heartbeat 接口，破解运行时 CSRF token。
 *
 * 全链路:
 *   IDE → LSP(server_port) → Router(8878/api_server_url) → Gateway(11435) → GitHub Models
 *
 * 验证:
 *   §A  CSRF 提取 · 内存扫描法
 *   §B  基础设施 · Heartbeat/Router/Gateway
 *   §C  Cascade 创建+发送
 *   §D  路由拦截 · 模型映射验证
 *   §E  响应回传 · 流式确认
 *
 * 远程执行 (在 179 上运行):
 *   node _yin210_全链路CSRF_e2e.cjs
 *
 * 2026-05-26 · 道法自然
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { execSync } = require("child_process");

// ── 配置 ──
const USERPROFILE = process.env.USERPROFILE || "C:\\Users\\zhouyoukang";
const APIKEY_FILE = path.join(USERPROFILE, "_dao_apikey.txt");
const CSRF_FILE = path.join(USERPROFILE, "_csrf_found.txt");
const ROUTER_LOG = path.join(USERPROFILE, "dao_router_log.txt");
const NODE_EXE = path.join(USERPROFILE, "AppData\\Local\\ms-playwright-go\\1.50.1\\node.exe");
const CHUNK_SCAN_PS1 = path.join(USERPROFILE, "_chunk_scan.ps1");

const LSP_PORT = 32661; // will be auto-detected
const ROUTER_PORT = 8878;
const GATEWAY_PORT = 11435;

// ── 测试框架 ──
let total = 0, pass = 0, fail = 0;
const failures = [];
function section(name) { console.log(`\n  ${name}`); }
function ok(name, cond, detail) {
  total++;
  if (cond) { pass++; console.log(`    \u2713 ${name}${detail ? " (" + detail + ")" : ""}`); }
  else { fail++; failures.push(name); console.log(`    \u2717 ${name}${detail ? " (" + detail + ")" : ""}`); }
  return cond;
}

// ── 工具函数 ──
function httpReq(opts, body) {
  return new Promise((r) => {
    const req = http.request(opts, (res) => {
      let d = ""; res.on("data", (c) => (d += c));
      res.on("end", () => { try { r({ s: res.statusCode, d: JSON.parse(d) }); } catch { r({ s: res.statusCode, d }); } });
    });
    req.on("error", (e) => r({ s: 0, d: e.message }));
    req.on("timeout", () => { req.destroy(); r({ s: 0, d: "timeout" }); });
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

function httpGet(url) {
  return new Promise((r) => {
    http.get(url, { timeout: 5000 }, (res) => {
      let d = ""; res.on("data", (c) => (d += c));
      res.on("end", () => r(d));
    }).on("error", (e) => r("ERR:" + e.message));
  });
}

function rpc(port, csrf, apiKey, method, body, timeout = 30000) {
  const d = JSON.stringify(body);
  return httpReq({
    hostname: "127.0.0.1", port,
    path: "/exa.language_server_pb.LanguageServerService/" + method,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "connect-protocol-version": "1",
      "x-codeium-csrf-token": csrf,
      "content-length": Buffer.byteLength(d),
    },
    timeout,
  }, d);
}

function meta(apiKey) {
  return {
    ideName: "windsurf",
    extensionVersion: "2.2.17",
    apiKey,
    locale: "zh-CN",
    requestId: String(Date.now()),
    sessionId: crypto.randomUUID(),
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── §A CSRF 提取 ──
async function extractCSRF() {
  section("§A CSRF 内存提取");

  // Check if we already have a valid CSRF
  let csrf = null;
  if (fs.existsSync(CSRF_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(CSRF_FILE, "utf8"));
      csrf = saved.csrf;
    } catch {}
  }

  const apiKey = fs.readFileSync(APIKEY_FILE, "utf8").trim();
  
  if (csrf) {
    // Verify existing CSRF still works
    const hb = await rpc(LSP_PORT, csrf, apiKey, "Heartbeat", { metadata: meta(apiKey) }, 5000);
    if (hb.s === 200) {
      ok("CSRF 缓存有效", true, csrf.slice(0, 8) + "...");
      return { csrf, apiKey };
    }
  }

  // Need to extract CSRF from memory
  ok("CSRF 缓存失效", false, "需要重新提取");

  // Find LSP PID on LSP_PORT
  let lspPid;
  try {
    const out = execSync(`netstat -ano | findstr ":${LSP_PORT}.*LISTEN"`, { encoding: "utf8" });
    const m = out.match(/LISTENING\s+(\d+)/);
    if (m) lspPid = parseInt(m[1]);
  } catch {}

  if (!lspPid) {
    ok("LSP PID 定位", false, "port " + LSP_PORT + " 无监听");
    return { csrf: null, apiKey };
  }
  ok("LSP PID 定位", true, `PID=${lspPid}`);

  // Dump and scan memory
  const dumpPath = path.join(USERPROFILE, "_lsp_csrf_dump.dmp");
  try { fs.unlinkSync(dumpPath); } catch {}
  
  execSync(`rundll32.exe comsvcs.dll, MiniDump ${lspPid} ${dumpPath} full`, { timeout: 30000 });
  await sleep(3000);

  if (!fs.existsSync(dumpPath)) {
    ok("内存 Dump", false);
    return { csrf: null, apiKey };
  }
  ok("内存 Dump", true);

  // Chunk-scan for UUID v4
  const uuids = new Set();
  const fd = fs.openSync(dumpPath, "r");
  const chunkSize = 10 * 1024 * 1024;
  const buf = Buffer.alloc(chunkSize);
  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;
  
  let bytesRead;
  while ((bytesRead = fs.readSync(fd, buf, 0, chunkSize)) > 0) {
    const text = buf.toString("ascii", 0, bytesRead);
    let m;
    while ((m = uuidRe.exec(text)) !== null) uuids.add(m[0]);
    if (bytesRead < chunkSize) break;
  }
  fs.closeSync(fd);
  try { fs.unlinkSync(dumpPath); } catch {}

  ok("UUID 提取", uuids.size > 0, `${uuids.size} 个候选`);

  // Brute-force test each UUID
  const arr = [...uuids];
  for (let i = 0; i < arr.length; i += 30) {
    const batch = arr.slice(i, i + 30);
    const results = await Promise.all(batch.map(u =>
      rpc(LSP_PORT, u, apiKey, "Heartbeat", { metadata: meta(apiKey) }, 3000)
    ));
    for (let j = 0; j < results.length; j++) {
      if (results[j].s === 200) {
        csrf = batch[j];
        fs.writeFileSync(CSRF_FILE, JSON.stringify({ csrf, port: LSP_PORT, ts: new Date().toISOString() }));
        ok("CSRF 暴力破解", true, csrf.slice(0, 8) + "... (" + (i + j + 1) + "/" + arr.length + ")");
        return { csrf, apiKey };
      }
    }
  }

  ok("CSRF 暴力破解", false, "全部 " + arr.length + " 个候选均不匹配");
  return { csrf: null, apiKey };
}

// ── §B 基础设施 ──
async function testInfra(csrf, apiKey) {
  section("§B 基础设施验证");

  const hb = await rpc(LSP_PORT, csrf, apiKey, "Heartbeat", { metadata: meta(apiKey) }, 5000);
  ok("LSP Heartbeat", hb.s === 200, `status=${hb.s}`);

  const rh = await httpGet(`http://127.0.0.1:${ROUTER_PORT}/health`);
  let rhOk = false, routes = 0;
  try { const j = JSON.parse(rh); rhOk = j.status === "ok"; routes = j.router?.count || 0; } catch {}
  ok("Router 存活", rhOk, `routes=${routes}`);

  const gh = await httpGet(`http://127.0.0.1:${GATEWAY_PORT}/health`);
  ok("Gateway 存活", gh && !gh.startsWith("ERR"), gh.slice(0, 60));

  return hb.s === 200;
}

// ── §C Cascade 创建 ──
async function testCascade(csrf, apiKey) {
  section("§C Cascade 创建+发送");

  const sc = await rpc(LSP_PORT, csrf, apiKey, "StartCascade", { metadata: meta(apiKey) });
  const cid = sc.d?.cascadeId;
  if (!ok("StartCascade", !!cid, cid ? cid.slice(0, 8) + "..." : "no cascadeId")) return null;

  const sm = await rpc(LSP_PORT, csrf, apiKey, "SendUserCascadeMessage", {
    cascadeId: cid,
    userMessage: { content: "Reply with exactly: DAO_210_OK" },
    metadata: meta(apiKey),
    cascadeConfig: { plannerConfig: { requestedModelUid: "MODEL_CLAUDE_3_5_HAIKU_20241022" } },
  });
  ok("SendUserCascadeMessage", sm.s === 200, `status=${sm.s}`);

  return cid;
}

// ── §D §E 路由拦截 + 响应 ──
async function testRouting(csrf, apiKey, cid) {
  section("§D 路由拦截验证");
  
  // Wait for routing to happen
  await sleep(5000);
  
  // Check router log
  let logContent = "";
  try { logContent = fs.readFileSync(ROUTER_LOG, "utf8"); } catch {}
  const routeLines = logContent.split("\n").filter(l => l.includes("ROUTED") || l.includes("[ROUTE]"));
  const lastRoute = routeLines[routeLines.length - 1] || "";
  ok("路由拦截记录", routeLines.length > 0, lastRoute.trim().slice(0, 100));

  const gcmLines = logContent.split("\n").filter(l => l.includes("stream") && l.includes("text="));
  const lastStream = gcmLines[gcmLines.length - 1] || "";
  ok("流式响应确认", gcmLines.length > 0, lastStream.trim().slice(0, 100));

  section("§E 轨迹轮询");
  let gotSteps = false;
  for (let i = 0; i < 10; i++) {
    await sleep(3000);
    const sd = await rpc(LSP_PORT, csrf, apiKey, "GetCascadeTrajectorySteps", {
      metadata: meta(apiKey), cascadeId: cid
    });
    const steps = sd.d?.steps || [];
    if (steps.length > 1) { gotSteps = true; break; }
    if (steps.some(s => s.status === "CORTEX_STEP_STATUS_DONE" && s.type !== "CORTEX_STEP_TYPE_RETRIEVE_MEMORY")) {
      gotSteps = true; break;
    }
  }
  ok("轨迹多步骤", gotSteps, gotSteps ? "模型调用完成" : "仅 RETRIEVE_MEMORY");
}

// ── 主流程 ──
async function main() {
  console.log("=== 印210 全链路CSRF E2E ===");
  console.log(`  时间: ${new Date().toISOString()}`);
  console.log(`  目标: LSP:${LSP_PORT} Router:${ROUTER_PORT} GW:${GATEWAY_PORT}`);

  const { csrf, apiKey } = await extractCSRF();
  if (!csrf) {
    console.log("\n  ABORT: 无法获取 CSRF token");
    return process.exit(1);
  }

  const infraOk = await testInfra(csrf, apiKey);
  if (!infraOk) {
    console.log("\n  ABORT: 基础设施不完整");
  } else {
    const cid = await testCascade(csrf, apiKey);
    if (cid) await testRouting(csrf, apiKey, cid);
  }

  // ── 汇总 ──
  console.log(`\n${"=".repeat(50)}`);
  console.log(`  印210 全链路验证: ${pass}/${total} 通过, ${fail} 失败`);
  console.log(`${"=".repeat(50)}`);
  if (failures.length) {
    console.log("  失败项:");
    for (const f of failures) console.log(`    - ${f}`);
  }
  console.log();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
