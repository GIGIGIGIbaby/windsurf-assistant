#!/usr/bin/env node
/**
 * _实战_印162/server.js · 道·一气化三清 dashboard · 反者道之动
 *
 * 主公诏 (印 162 · 2026-05-19):
 *   「反者道之动也·大曰逝逝曰远远曰反·回归本源需求·实现不依赖本电脑之一切
 *    所有核心模块均运行于云端虚拟机·虚拟机反向公网提供 api·本地轻量化接受 api
 *    一气化三清: 左云端 api+SP 管理·中 wam rtflow 切号·右类 devin.ai chat
 *    实践出发·测试所有模块·gpt5.5+cloud4.7 一切功能·原汤化原食·三者闭环」
 *
 * 本机角色 (印 162 之轻):
 *   · 端口: 3001 (避开 印 161 之 :3000)
 *   · 仅静资源服务 + api gateway (透 :7790 + dao_proxy /admin/wam/local)
 *   · 不跑反代逻辑 · 不存模型 key · 不持化 LLM 状态
 *   · 关之即停 · 反代基底 (VM 内 dao_proxy + fleet_master) 仍真活
 *
 * 端点:
 *   GET  /                 · index.html 三栏 UI
 *   GET  /api/state        · 一汇总: fleet + dao_proxy + sp + wam · 真活全态
 *   GET  /api/wam/list     · 透 dao_proxy GET /admin/wam/local · 179 件 token
 *   POST /api/wam/use      · 透 dao_proxy POST /admin/wam/use · 切 active
 *   GET  /api/sp           · 现 SP 七态
 *   POST /api/sp           · 切 strategy / 设 customSp
 *   GET  /api/sp/observe   · SP 注入观察 (近 16 笔)
 *   GET  /api/models       · 228 模列
 *   POST /api/chat         · 普 chat (一笔答)
 *   POST /api/chat/stream  · SSE 流式 chat (右栏用)
 *   POST /api/vm/run       · 原汤化原食: 透 omni /_/run · LLM 调 VM shell
 *
 * 反者道之动:
 *   - 印 161 server.js 跑业务 (CRUD + LLM 真用 endpoint)
 *   - 印 162 server.js 仅 gateway · 业务全在 VM 内
 *   - 「大曰逝逝曰远远曰反」── 远即返 · 不依赖本机即本机价值最大
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3001);
const DAO_BASE = process.env.DAO_BASE || "http://127.0.0.1:7790"; // fleet_master
const PROXY_BASE = process.env.PROXY_BASE || "http://127.0.0.1:7780"; // dao_proxy (admin)

// 印 162 · 原汤化原食 · VM omni URL 与 auth (从 _state/vm_pool.json + .dao_auth_token 读)
const VM_POOL_FILE = path.join(__dirname, "..", "130-道独立体_Standalone", "公网", "packages", "dao-devin-vm", "_state", "vm_pool.json");
const AUTH_FILE = path.join(__dirname, "..", "130-道独立体_Standalone", "公网", "packages", "dao-devin-vm", ".dao_auth_token");

function readAuth() {
  try { return fs.readFileSync(AUTH_FILE, "utf8").trim(); } catch { return ""; }
}

function readVmOmni() {
  try {
    const arr = JSON.parse(fs.readFileSync(VM_POOL_FILE, "utf8"));
    if (!Array.isArray(arr) || !arr.length) return null;
    const vm = arr[0];
    const omniPort = vm.ports?.find((p) => (p.service || "").toLowerCase().includes("omni"));
    return omniPort ? { sid: vm.sessionId, url: omniPort.url } : null;
  } catch { return null; }
}

// ════════════════════════════════════════════════════════════════════════
// § 0 · 工具
// ════════════════════════════════════════════════════════════════════════

function httpReq(urlStr, opts = {}, body = null, onChunk = null) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(urlStr); } catch { return resolve({ ok: false, err: "bad url" }); }
    const lib = u.protocol === "https:" ? require("https") : http;
    const t0 = Date.now();
    const reqOpts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method: opts.method || "GET",
      headers: opts.headers || {},
      timeout: opts.timeout || 60000,
      auth: u.username ? `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}` : undefined,
    };
    if (body) reqOpts.headers["Content-Length"] = Buffer.byteLength(body);
    const r = lib.request(reqOpts, (res) => {
      const chunks = [];
      res.on("data", (d) => {
        if (onChunk) onChunk(d);
        chunks.push(d);
      });
      res.on("end", () => {
        const b = Buffer.concat(chunks).toString("utf8");
        let j = null;
        try { j = JSON.parse(b); } catch {}
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          code: res.statusCode,
          headers: res.headers,
          body: b,
          json: j,
          ms: Date.now() - t0,
        });
      });
    });
    r.on("error", (e) => resolve({ ok: false, err: e.message, ms: Date.now() - t0 }));
    r.on("timeout", () => { r.destroy(); resolve({ ok: false, err: "timeout", ms: Date.now() - t0 }); });
    if (body) r.write(body);
    r.end();
  });
}

function sendJson(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function staticFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const ctype = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
  }[ext] || "application/octet-stream";
  try {
    const buf = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": ctype, "Cache-Control": "no-cache" });
    res.end(buf);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
}

// ════════════════════════════════════════════════════════════════════════
// § 1 · 路由
// ════════════════════════════════════════════════════════════════════════

const HANDLERS = {
  // ─── 一汇总 ───
  "GET /api/state": async (req, res) => {
    const [hFleet, hProxy, sp, vmList] = await Promise.all([
      httpReq(`${DAO_BASE}/health`, { timeout: 5000 }),
      httpReq(`${PROXY_BASE}/health`, { timeout: 5000 }),
      httpReq(`${PROXY_BASE}/v1/system/prompt`, { timeout: 5000 }),
      httpReq(`${DAO_BASE}/fleet/list`, { timeout: 5000 }),
    ]);
    sendJson(res, 200, {
      ok: true,
      timestamp: new Date().toISOString(),
      fleet: hFleet.json || { error: hFleet.err || `code=${hFleet.code}` },
      proxy: hProxy.json || { error: hProxy.err || `code=${hProxy.code}` },
      sp: sp.json || { error: sp.err || `code=${sp.code}` },
      fleet_list: vmList.json || { error: vmList.err || `code=${vmList.code}` },
      vm_omni: readVmOmni(),
      bench: {
        port: PORT,
        daoBase: DAO_BASE,
        proxyBase: PROXY_BASE,
        seal: "印 162 · 一气化三清 · 反者道之动",
      },
    });
  },

  // ─── WAM 切号 (透 dao_proxy /admin/wam/local) ───
  "GET /api/wam/list": async (req, res) => {
    const auth = readAuth();
    const headers = auth ? { "X-Dao-Auth": auth } : {};
    const r = await httpReq(`${PROXY_BASE}/admin/wam/local`, { headers, timeout: 8000 });
    if (!r.ok) return sendJson(res, 502, { error: r.err || `code=${r.code}`, raw: r.body });
    sendJson(res, 200, r.json || { error: "bad response" });
  },

  "POST /api/wam/use": async (req, res) => {
    const body = await readBody(req);
    const auth = readAuth();
    const headers = { "Content-Type": "application/json" };
    if (auth) headers["X-Dao-Auth"] = auth;
    const r = await httpReq(`${PROXY_BASE}/admin/wam/use`, { method: "POST", headers, timeout: 30000 }, body);
    sendJson(res, r.code || 502, r.json || { error: r.err || "no response", raw: r.body });
  },

  // ─── SP 七态 ───
  "GET /api/sp": async (req, res) => {
    const r = await httpReq(`${PROXY_BASE}/v1/system/prompt`, { timeout: 5000 });
    if (!r.ok) return sendJson(res, 502, { error: r.err || `code=${r.code}` });
    sendJson(res, 200, r.json);
  },

  "POST /api/sp": async (req, res) => {
    const body = await readBody(req);
    const r = await httpReq(`${PROXY_BASE}/v1/system/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    }, body);
    sendJson(res, r.code || 502, r.json || { error: r.err || "no response", raw: r.body });
  },

  "GET /api/sp/observe": async (req, res) => {
    const r = await httpReq(`${PROXY_BASE}/v1/system/prompt/observe`, { timeout: 5000 });
    if (!r.ok) return sendJson(res, 502, { error: r.err || `code=${r.code}` });
    sendJson(res, 200, r.json);
  },

  // ─── 228 模列 ───
  "GET /api/models": async (req, res) => {
    const r = await httpReq(`${DAO_BASE}/v1/models`, { timeout: 5000 });
    if (!r.ok) return sendJson(res, 502, { error: r.err || `code=${r.code}` });
    sendJson(res, 200, r.json);
  },

  // ─── 普 chat (一笔答 · 印 161 已有 · 此印保留以供旧客) ───
  "POST /api/chat": async (req, res) => {
    const raw = await readBody(req);
    let body;
    try { body = JSON.parse(raw); } catch { return sendJson(res, 400, { error: "bad json" }); }
    const { messages, model = "gpt-5-5", max_tokens = 1024 } = body;
    if (!messages || !Array.isArray(messages)) return sendJson(res, 400, { error: "messages required" });
    const r = await httpReq(`${DAO_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 90000,
    }, JSON.stringify({ model, messages, max_tokens, stream: false }));
    if (!r.ok || !r.json) return sendJson(res, 502, { error: r.err || `code=${r.code}`, raw: r.body });
    const choice = r.json.choices?.[0];
    sendJson(res, 200, {
      ok: true,
      content: choice?.message?.content || "",
      model: r.json.model || model,
      usage: r.json.usage,
      routed: r.headers["x-fleet-routed"] || "(no header)",
      ms: r.ms,
    });
  },

  // ─── 印 162 · SSE 流式 chat (右栏 devin.ai 级 · 反者道之动) ───
  "POST /api/chat/stream": async (req, res) => {
    const raw = await readBody(req);
    let body;
    try { body = JSON.parse(raw); } catch { return sendJson(res, 400, { error: "bad json" }); }
    const { messages, model = "gpt-5-5", max_tokens = 2048 } = body;
    if (!messages || !Array.isArray(messages)) return sendJson(res, 400, { error: "messages required" });

    // SSE head
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    });
    const writeEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // 印 162 · 因 dao_proxy stream 实现复杂 · 本印用 fake-stream: 后端非流式 · 前端逐字渲染
    // 真本源: dao_proxy v0.4.3 stream 模式 wss 转 sse 待印 163 真治 (反者道之动 · 渐)
    writeEvent("status", { phase: "thinking", model, ts: Date.now() });

    const t0 = Date.now();
    const r = await httpReq(`${DAO_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: 90000,
    }, JSON.stringify({ model, messages, max_tokens, stream: false }));

    if (!r.ok || !r.json) {
      writeEvent("error", { error: r.err || `code=${r.code}`, raw: (r.body || "").slice(0, 200), ms: Date.now() - t0 });
      res.end();
      return;
    }
    const content = r.json.choices?.[0]?.message?.content || "";
    const routed = r.headers["x-fleet-routed"] || "(no header)";

    // 逐字 (按汉字粒度 · 每 25ms · 模 devin 体验)
    writeEvent("meta", { model: r.json.model || model, routed, totalChars: content.length, ms: Date.now() - t0 });
    const step = 4; // 每帧 4 字
    let i = 0;
    const tick = () => {
      if (i >= content.length) {
        writeEvent("done", { totalChars: content.length, totalMs: Date.now() - t0, usage: r.json.usage });
        res.end();
        return;
      }
      const piece = content.slice(i, i + step);
      i += step;
      writeEvent("delta", { piece });
      setTimeout(tick, 25);
    };
    tick();

    // 客退则停 (省 LLM 调 · 帛书六十七 · 俭故能广)
    req.on("close", () => { i = content.length + 1; });
  },

  // ─── 原汤化原食 · LLM 调 VM 工具 (run code / read file) ───
  "POST /api/vm/run": async (req, res) => {
    const raw = await readBody(req);
    let body;
    try { body = JSON.parse(raw); } catch { return sendJson(res, 400, { error: "bad json" }); }
    const { cmd, timeout = 30000 } = body;
    if (!cmd) return sendJson(res, 400, { error: "cmd required" });

    const vm = readVmOmni();
    if (!vm) return sendJson(res, 503, { error: "no alive VM in pool" });

    const r = await httpReq(`${vm.url}/_/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: timeout + 5000,
    }, JSON.stringify({ cmd, timeout, cwd: "/home/ubuntu", shell: "/bin/bash" }));

    sendJson(res, r.code || 502, {
      ok: r.ok,
      vm_sid: vm.sid,
      result: r.json,
      raw: r.json ? undefined : r.body?.slice(0, 500),
      err: r.err,
      ms: r.ms,
    });
  },

  // ─── health ───
  "GET /api/health": async (req, res) => {
    const [hF, hP] = await Promise.all([
      httpReq(`${DAO_BASE}/health`, { timeout: 3000 }),
      httpReq(`${PROXY_BASE}/health`, { timeout: 3000 }),
    ]);
    sendJson(res, 200, {
      ok: hF.ok && hP.ok,
      fleet: hF.ok ? { v: hF.json?.version, alive: hF.json?.fleet?.alive, total: hF.json?.fleet?.total } : { err: hF.err || `code=${hF.code}` },
      proxy: hP.ok ? { v: hP.json?.version, pool: hP.json?.pool?.total } : { err: hP.err || `code=${hP.code}` },
      vm_omni: readVmOmni() ? "present" : "absent",
      port: PORT,
    });
  },
};

// ════════════════════════════════════════════════════════════════════════
// § 2 · server
// ════════════════════════════════════════════════════════════════════════

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    const method = req.method.toUpperCase();
    const p = u.pathname;

    // CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    // 静资源
    if (method === "GET") {
      if (p === "/" || p === "/index.html") {
        return staticFile(path.join(__dirname, "index.html"), res);
      }
      if (p === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (/^\/[\w\-]+\.(css|js|svg|png|json)$/.test(p)) {
        return staticFile(path.join(__dirname, p.slice(1)), res);
      }
    }

    // API 路由
    const handler = HANDLERS[`${method} ${p}`];
    if (handler) return await handler(req, res);

    sendJson(res, 404, { error: "not found", path: p });
  } catch (e) {
    sendJson(res, 500, { error: e.message, stack: e.stack?.split("\n").slice(0, 3) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log(`═══ 道·一气化三清 dashboard · 印 162 · 反者道之动 ═══`);
  console.log(`  port:       http://localhost:${PORT}`);
  console.log(`  daoBase:    ${DAO_BASE}  (fleet_master · LB → VM/fallback)`);
  console.log(`  proxyBase:  ${PROXY_BASE}  (dao_proxy · 直 · admin/wam · sp)`);
  const vm = readVmOmni();
  console.log(`  vm_omni:    ${vm ? `${vm.sid.slice(0, 25)}...` : "(无 alive VM)"}`);
  console.log(`  auth:       ${readAuth() ? readAuth().slice(0, 12) + "..." : "(无 .dao_auth_token)"}`);
  console.log("");
  console.log(`  端点:`);
  console.log(`    GET  /                 · 一气化三清 三栏 UI`);
  console.log(`    GET  /api/state        · 全态汇总 (fleet+proxy+sp+vm)`);
  console.log(`    GET  /api/wam/list     · 主公 ~/.wam 179 件 token`);
  console.log(`    POST /api/wam/use      · 切 active`);
  console.log(`    GET  /api/sp           · 现 SP 七态`);
  console.log(`    POST /api/sp           · 切 strategy/customSp`);
  console.log(`    GET  /api/sp/observe   · 注入观察 16 笔`);
  console.log(`    GET  /api/models       · 228 模`);
  console.log(`    POST /api/chat         · 普 chat`);
  console.log(`    POST /api/chat/stream  · SSE 流式 chat (右栏)`);
  console.log(`    POST /api/vm/run       · 原汤化原食: VM shell`);
  console.log("");
  console.log(`  「反者道之动也 · 大曰逝逝曰远远曰反」(帛书四十/二十五)`);
  console.log("");
});
