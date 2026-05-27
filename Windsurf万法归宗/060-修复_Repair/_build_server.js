"use strict";
/**
 * _build_server.js · 印196 · 构建 server.js
 * 基于 dao_vm_engine.js v2.0.0 扩展为 v2.1.0
 */
const fs = require("fs");
const path = require("path");
const SRC = "e:/道/道生一/一生二/Windsurf万法归宗/010-反代_Proxy/dao_vm_engine.js";
const DST = "e:/道/道生一/一生二/Windsurf万法归宗/server.js";

let src = fs.readFileSync(SRC, "utf8");

// ── 1. 版本 & SEAL ──────────────────────────────────────────────
src = src.replace(
  'const VERSION = "2.0.0"; // 印191 · 三池合一 · RegisterUser · ExtPool · 智能路由',
  'const VERSION = "2.1.0"; // 印196 · VM云反代全体系 · WS直连池 · LOCAL_MASTER自注册'
);

// ── 2. 在 BRAND 后插入新常量 ──────────────────────────────────────
src = src.replace(
  'const BRAND = "dao_vm_engine";',
  [
    'const BRAND = "dao_vm_engine";',
    'const SEAL196 = "印196·VM云反代全体系·Cascade+Devin全模型·LOCAL_MASTER自注册·道法自然";',
    'const LOCAL_MASTER = process.env.LOCAL_MASTER || ""; // e.g. http://192.168.1.x:7791',
    'const VM_NAME = process.env.VM_NAME || require("os").hostname();',
  ].join("\n")
);

// ── 3. §9.5 LOCAL_MASTER 注册函数 (插入 §10 CF隧道前) ───────────
const CF_HDR = '// ═══════════════════════════════════════════════════════════════\n// §10 · cloudflare Tunnel';
const REGISTER_CODE = `\
// ═══════════════════════════════════════════════════════════════
// §9.5 · LOCAL_MASTER 自注册 (印196)
// ═══════════════════════════════════════════════════════════════

function registerWithMaster(vmUrl, retry) {
  retry = retry || 0;
  if (!LOCAL_MASTER || !vmUrl) return;
  const now = Date.now();
  const payload = JSON.stringify({
    url: vmUrl, name: VM_NAME, version: VERSION, seal: SEAL196,
    cascade: { total: pool.total, available: pool.available },
    devin: { total: devinPool.total },
    wsPool: { total: wsPool.tokens.length,
              alive: wsPool.tokens.filter(function(t){ return t.cooldownUntil <= now; }).length },
    ls: { ready: lsReady },
  });
  const body = Buffer.from(payload);
  let u;
  try { u = new URL("/vms/add", LOCAL_MASTER); } catch(e) { return; }
  const lib = u.protocol === "https:" ? https : http;
  const req = lib.request({
    hostname: u.hostname,
    port: parseInt(u.port) || (u.protocol === "https:" ? 443 : 80),
    path: u.pathname,
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": body.length },
    rejectUnauthorized: false,
  }, function(res) {
    let d = "";
    res.on("data", function(c){ d += c; });
    res.on("end", function(){ log("MASTER", "Registered " + vmUrl + " → " + res.statusCode + " " + d.slice(0,60)); });
  });
  req.setTimeout(8000, function(){ req.destroy(); });
  req.on("error", function(e) {
    if (retry < 3) setTimeout(function(){ registerWithMaster(vmUrl, retry + 1); }, 15000 * (retry + 1));
    else log("MASTER", "Register failed: " + e.message);
  });
  req.write(body);
  req.end();
}

`;
src = src.replace(CF_HDR, REGISTER_CODE + CF_HDR);

// ── 4. 在 handleLine 中 cfUrl 确认时调用 registerWithMaster ──────
src = src.replace(
  'log("CF", `🌐 Public URL: ${cfUrl}`);',
  'log("CF", `🌐 Public URL: ${cfUrl}`);\n        registerWithMaster(cfUrl);'
);

// ── 5. §8.7 WS直连池 (插入 §8.5 ExtPool 前) ────────────────────
const EXT_HDR = '// ═══════════════════════════════════════════════════════════════\n// §8.5 · External BYOK Pool (Anthropic / OpenAI / DeepSeek)';
const WS_POOL_CODE = `\
// ═══════════════════════════════════════════════════════════════
// §8.7 · WS Direct Pool (印196 · Pool B · ConnectRPC直连无需LS)
// ═══════════════════════════════════════════════════════════════

// WS直连池: sk-ws tokens 直连 server.codeium.com (ConnectRPC HTTP/2)
// NO_LS=1 时作为 Cascade 主路; LS就绪时作为备用
const WS_DIRECT_HOST = process.env.WS_DIRECT_HOST || "server.codeium.com";
const WS_DIRECT_PATH = "/exa.api_server_pb.ApiServerService/GetChatMessage";

const wsPool = {
  tokens: [], // [{apiKey, cooldownUntil, errors, usageCount, label}]
  cursor: 0,
  metrics: { requests: 0, ok: 0, fail: 0 },
};

function wsPoolLoad() {
  const files = [
    process.env.WS_TOKENS_FILE,
    path.join(os.homedir(), "app", "tokens_ws.txt"),
    path.join(DAO_HOME, "tokens_ws.txt"),
    path.join(DAO_HOME, "wam_tokens.txt"),
  ].filter(Boolean);
  const seen = new Set();
  for (const f of files) {
    try {
      if (!fs.existsSync(f)) continue;
      const lines = fs.readFileSync(f, "utf8")
        .split(/\\r?\\n/).map(function(l){ return l.trim(); })
        .filter(function(l){ return l && !l.startsWith("#"); });
      for (const line of lines) {
        if (line.startsWith("devin-session-token$")) continue; // Devin tokens go to devinPool
        if (seen.has(line)) continue;
        seen.add(line);
        wsPool.tokens.push({ apiKey: line, cooldownUntil: 0, errors: 0, usageCount: 0,
                             label: line.slice(0, 20) + "..." });
      }
    } catch (_e) { /* ignore */ }
  }
  if (wsPool.tokens.length)
    log("WS", "Pool B: " + wsPool.tokens.length + " sk-ws tokens loaded");
  // Also absorb accounts already in pool (sk-ws keys)
  for (const acc of pool.list) {
    if (acc.apiKey && acc.apiKey.startsWith("sk-ws") && !seen.has(acc.apiKey)) {
      seen.add(acc.apiKey);
      wsPool.tokens.push({ apiKey: acc.apiKey, cooldownUntil: 0, errors: 0, usageCount: 0,
                           label: acc.apiKey.slice(0, 20) + "..." });
    }
  }
}

function pickWsToken() {
  const now = Date.now();
  const alive = wsPool.tokens.filter(function(t){ return t.cooldownUntil <= now && t.errors < 5; });
  if (!alive.length) return null;
  const t = alive[wsPool.cursor % alive.length];
  wsPool.cursor = (wsPool.cursor + 1) % alive.length;
  return t;
}

function wsCooldown(tok, ms) {
  tok.cooldownUntil = Date.now() + (ms || 60000);
  tok.errors = (tok.errors || 0) + 1;
}

function wsDirectChat(messages, modelName, onDelta, timeout) {
  timeout = timeout || 120000;
  return new Promise(function(resolve) {
    const tok = pickWsToken();
    if (!tok) return resolve({ ok: false, error: "WS pool empty or all cooling" });
    const reqBuf = buildRawGetChatReq(tok.apiKey, messages, modelName || "claude-sonnet-4-6", crypto.randomUUID());
    const body = grpcFrame(reqBuf);
    wsPool.metrics.requests++;
    let text = "", streamErr = null, done = false;
    const timer = setTimeout(function() {
      if (!done) { done = true; wsCooldown(tok, 30000); wsPool.metrics.fail++; resolve({ ok: false, error: "WS timeout" }); }
    }, timeout);
    let client;
    try { client = http2.connect("https://" + WS_DIRECT_HOST); } catch(e) {
      clearTimeout(timer); wsPool.metrics.fail++;
      return resolve({ ok: false, error: e.message });
    }
    client.on("error", function(e) {
      if (!done) { done = true; clearTimeout(timer); wsCooldown(tok, 15000); wsPool.metrics.fail++; resolve({ ok: false, error: e.message }); }
      try { client.close(); } catch(_e) {}
    });
    const req = client.request({
      ":method": "POST", ":path": WS_DIRECT_PATH, ":scheme": "https",
      "content-type": "application/grpc",
      "authorization": "Bearer " + tok.apiKey,
      "connect-protocol-version": "1",
      "te": "trailers",
    });
    let buf = Buffer.alloc(0);
    req.on("data", function(chunk) {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 5) {
        const fl = buf.readUInt32BE(1);
        if (buf.length < 5 + fl) break;
        const payload = buf.slice(5, 5 + fl);
        buf = buf.slice(5 + fl);
        if (fl > 0) {
          const outer = parseProto(payload);
          const dmBuf = outer[1] && outer[1][0] ? outer[1][0].v : null;
          if (!dmBuf) continue;
          const dm = parseProto(dmBuf);
          if (pInt(dm, 7) === 1) { streamErr = pStr(dm, 5) || "stream error"; continue; }
          const ch = pStr(dm, 5);
          if (ch) { text += ch; if (onDelta) onDelta(ch); }
        }
      }
    });
    req.on("end", function() {
      clearTimeout(timer);
      try { client.close(); } catch(_e) {}
      if (done) return;
      done = true;
      if (streamErr && !text) {
        const isAuth = /unauthenticated|permission_denied|invalid.api.key/i.test(streamErr);
        wsCooldown(tok, isAuth ? 86400000 : 60000);
        if (isAuth) tok.errors = 10;
        wsPool.metrics.fail++;
        return resolve({ ok: false, error: streamErr });
      }
      if (text) { wsPool.metrics.ok++; tok.errors = 0; tok.usageCount++; return resolve({ ok: true, text: text, pool: "ws" }); }
      wsCooldown(tok, 30000); wsPool.metrics.fail++;
      resolve({ ok: false, error: "empty response" });
    });
    req.on("error", function(e) {
      clearTimeout(timer);
      try { client.close(); } catch(_e) {}
      if (!done) { done = true; wsCooldown(tok, 15000); wsPool.metrics.fail++; resolve({ ok: false, error: e.message }); }
    });
    req.write(body);
    req.end();
  });
}

`;
src = src.replace(EXT_HDR, WS_POOL_CODE + EXT_HDR);

// ── 6. handleChat: LS未就绪时 fallback 到 wsDirectChat ───────────
src = src.replace(
  ": cascadeChat(finalMsgs, _route.modelId, onDelta, 180_000);",
  ": (lsReady ? cascadeChat(finalMsgs, _route.modelId, onDelta, 180_000) : wsDirectChat(finalMsgs, _route.modelId, onDelta, 120_000));"
);

// ── 7. main() 中调用 wsPoolLoad ───────────────────────────────────
src = src.replace(
  '  log("START", `${BRAND} v${VERSION}`);',
  '  wsPoolLoad(); // 印196 · WS直连池初始化\n  log("START", `${BRAND} v${VERSION}`);'
);

// ── 8. /health 中加入 wsPool 统计 ───────────────────────────────
src = src.replace(
  "          devin: { total: devinPool.total },",
  "          devin: { total: devinPool.total },\n          wsPool: { total: wsPool.tokens.length, alive: wsPool.tokens.filter(function(t){ return t.cooldownUntil <= Date.now(); }).length, metrics: wsPool.metrics },"
);

// ── 9. /admin/ws/* 端点 (在 /admin/accounts/reset 后插入) ─────────
src = src.replace(
  '      // ─── Devin Token Management ───────────────────────────',
  `      if (p === "/admin/ws/add" && req.method === "POST") {
        const b = await readBody(req);
        const keys = Array.isArray(b.keys) ? b.keys : b.key ? [b.key] : [];
        let added = 0;
        for (const k of keys) {
          if (!k || typeof k !== "string") continue;
          const clean = k.trim();
          if (!clean || wsPool.tokens.find(function(t){ return t.apiKey === clean; })) continue;
          wsPool.tokens.push({ apiKey: clean, cooldownUntil: 0, errors: 0, usageCount: 0, label: clean.slice(0, 20) + "..." });
          added++;
        }
        return jsonRes(res, 200, { ok: true, added, total: wsPool.tokens.length });
      }

      if (p === "/admin/ws/list") {
        const now = Date.now();
        return jsonRes(res, 200, {
          total: wsPool.tokens.length,
          alive: wsPool.tokens.filter(function(t){ return t.cooldownUntil <= now; }).length,
          metrics: wsPool.metrics,
          tokens: wsPool.tokens.map(function(t){ return { label: t.label, errors: t.errors, usageCount: t.usageCount, cooling: t.cooldownUntil > now }; }),
        });
      }

      if (p === "/admin/ws/reset" && req.method === "POST") {
        wsPool.tokens.forEach(function(t){ t.cooldownUntil = 0; t.errors = 0; });
        return jsonRes(res, 200, { ok: true, total: wsPool.tokens.length });
      }

      // ─── Devin Token Management ───────────────────────────`
);

// ── 10. 更新文件头注释 ────────────────────────────────────────────
src = src.replace(
  '/**\n * dao_vm_engine.js  v1.0.0\n * 印190 · VM完全自立引擎 · 道法自然 · 无为而无不为',
  '/**\n * server.js  v2.1.0\n * 印196 · VM云反代全体系 · 道法自然 · 无为而无不为\n * 扩展自 dao_vm_engine.js v2.0.0 (印191)\n * 新增: WS直连池(Pool B·无需LS) + LOCAL_MASTER自注册 + /admin/ws/*'
);

fs.writeFileSync(DST, src, "utf8");
const lines = src.split("\n").length;
console.log("✓ server.js written:", lines, "lines,", src.length, "bytes");

// 快速语法检查
try {
  require("vm").Script ? new (require("vm").Script)(src) : null;
  console.log("✓ Syntax check OK");
} catch(e) {
  console.error("✗ Syntax error:", e.message);
  process.exit(1);
}
