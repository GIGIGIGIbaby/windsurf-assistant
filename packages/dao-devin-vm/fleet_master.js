#!/usr/bin/env node
/**
 * fleet_master.js · 印 159 · 一账号一虚拟机 · 本地轻管理 · N VM 重反代
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 主公诏 (印 159 · 2026-05-19):
 *   「彻底打通 · 一账号一虚拟机 · 同时反代 windsurf cascade 和 devin cloud 一百多个模型
 *    并公网反代传输 · 任意环境下无感使用 · 本地统一轻管理
 *    本地轻管理加虚拟机重反代一切」
 *
 * 道:
 *   「邻邦相望 · 鸡狗之声相闻 · 民至老死不相往来」(帛书八十)
 *   「江海所以能为百谷王者 · 以其善下之」(帛书六十六)
 *   「上善若水 · 水善利万物而不静」(帛书八)
 *
 * 角色:
 *   ◎ 本地轻管理 = fleet_master :7790 (此件 · 不跑 LLM · 仅调度 · 真朴)
 *   ◎ 重反代 = N × Devin VM (每件跑 dao_proxy · 一账号一 VM · 出口 IP 各异)
 *   ◎ 公网入 = cloudflared tunnel · 包 fleet :7790 · 任地无感
 *
 * 真朴 (帛书廿八):
 *   ─ 单文件 · 0 deps · Node 22+
 *   ─ 不动 :7780 (dao_proxy 兜底真用 · 24/7)
 *   ─ 即起即停 · 不占资源 (无 LLM 调用 · 仅 HTTP 调度)
 *
 * 端点:
 *   GET  /              · index (info + 路指南)
 *   GET  /health        · 健康
 *   GET  /fleet/list    · 列所有现 VM (vm_pool.json + 实活验)
 *   GET  /fleet/probe   · 真活探测 (并发 HEAD 每件 VM)
 *   POST /fleet/spawn   · 起 N 件新 VM (调 deployer.js --wam-all)
 *   POST /fleet/use     · 切某 VM 为 active (后续 chat 优先用)
 *   GET  /v1/models     · 透传 :7780 或选 VM (统一 endpoint)
 *   POST /v1/chat/completions · 智能 LB · alive VM 轮转 · fallback :7780
 *   POST /v1/messages   · Anthropic 兼容
 *
 * 用:
 *   node fleet_master.js                  # 默 :7790
 *   PORT=7791 node fleet_master.js        # 自定端
 *   DEFAULT_FALLBACK=http://127.0.0.1:7780 node fleet_master.js  # 兜底
 */
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { spawn } = require("child_process");

const BASE = __dirname;
const VERSION = "0.1.0";
const SEAL =
  "印 159 · 一账号一虚拟机 · 本地轻管理 · N VM 重反代 · 反者道之动";

const CFG = {
  port: parseInt(process.env.PORT || "7790", 10),
  bind: process.env.BIND || "127.0.0.1",
  fallback: process.env.DEFAULT_FALLBACK || "http://127.0.0.1:7780",
  poolFile:
    process.env.DAO_POOL_JSON ||
    path.join(BASE, "_state", "vm_pool.json"),
  wamPoolFile: path.join(BASE, "_state", "wam_token_pool.json"),
  authFile: path.join(BASE, ".dao_auth_token"),
  probeTimeout: 5000,
};

const C = {
  G: (s) => `\x1b[32m${s}\x1b[0m`,
  R: (s) => `\x1b[31m${s}\x1b[0m`,
  Y: (s) => `\x1b[33m${s}\x1b[0m`,
  B: (s) => `\x1b[36m${s}\x1b[0m`,
  GR: (s) => `\x1b[90m${s}\x1b[0m`,
  BO: (s) => `\x1b[1m${s}\x1b[0m`,
};

const ts = () => new Date().toISOString().slice(11, 23);
const log = (msg) => console.log(`${C.GR(ts())} ${msg}`);

// ─── 全状态 (真朴) ───
const FLEET = {
  vms: [], // [{idx, sid, baseUrl, auth, status, lastProbe, ok, err, ms}]
  cursor: 0,
  startedAt: Date.now(),
  metrics: {
    requests: 0,
    routedToVM: 0,
    routedToFallback: 0,
    errors: 0,
  },
};

// ─── 资料读 ───
function readPool() {
  try {
    if (!fs.existsSync(CFG.poolFile)) return [];
    const j = JSON.parse(fs.readFileSync(CFG.poolFile, "utf8"));
    return Array.isArray(j) ? j : [];
  } catch (e) {
    log(C.Y(`  ⚠ readPool: ${e.message}`));
    return [];
  }
}

function readAuth() {
  try {
    if (fs.existsSync(CFG.authFile)) {
      return fs.readFileSync(CFG.authFile, "utf8").trim();
    }
  } catch {}
  return null;
}

function readWamPool() {
  try {
    if (!fs.existsSync(CFG.wamPoolFile)) return [];
    return JSON.parse(fs.readFileSync(CFG.wamPoolFile, "utf8"));
  } catch (e) {
    log(C.Y(`  ⚠ readWamPool: ${e.message}`));
    return [];
  }
}

function vmBaseFromPoolEntry(p) {
  if (!p) return null;
  if (p.omni && p.omni.base_url) return p.omni.base_url;
  if (Array.isArray(p.urls) && p.urls[0]) return p.urls[0];
  if (p.url) return p.url;
  return null;
}

// ─── HTTP 请求 helper ───
function httpReq(urlStr, opts = {}, body = null) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return resolve({ ok: false, code: 0, body: "", err: "bad url" });
    }
    const lib = u.protocol === "https:" ? https : http;
    const t0 = Date.now();
    const reqOpts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method: opts.method || "GET",
      headers: opts.headers || {},
      timeout: opts.timeout || CFG.probeTimeout,
      auth: u.username
        ? `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`
        : undefined,
    };
    if (body) {
      reqOpts.headers["Content-Length"] = Buffer.byteLength(body);
    }
    const req = lib.request(reqOpts, (res) => {
      const c = [];
      res.on("data", (d) => c.push(d));
      res.on("end", () => {
        const b = Buffer.concat(c).toString("utf8");
        let j = null;
        try {
          j = JSON.parse(b);
        } catch {}
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          code: res.statusCode,
          body: b,
          json: j,
          ms: Date.now() - t0,
        });
      });
    });
    req.on("error", (e) =>
      resolve({ ok: false, code: 0, body: "", err: e.message, ms: Date.now() - t0 }),
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, code: 0, body: "", err: "timeout", ms: Date.now() - t0 });
    });
    if (body) req.write(body);
    req.end();
  });
}

// ─── 加载 vm_pool · 实活探测 ───
async function refreshFleet() {
  const pool = readPool();
  const auth = readAuth();
  log(`  · refreshFleet · 池 ${pool.length} 件`);
  const newVMs = [];
  const probes = [];
  pool.forEach((p, i) => {
    const base = vmBaseFromPoolEntry(p);
    if (!base) return;
    const sid = p.sessionId || p.sid || `idx-${i}`;
    const vm = {
      idx: i,
      sid: String(sid).slice(0, 40),
      baseUrl: base,
      auth,
      status: "pending",
      lastProbe: 0,
      ok: false,
      err: null,
      ms: 0,
      seal: null,
      modelsCount: 0,
      poolTotal: 0,
    };
    newVMs.push(vm);
    // health probe via base + /port/7780/health
    const healthUrl = base.replace(/\/$/, "") + "/port/7780/health";
    probes.push(
      httpReq(healthUrl, { timeout: CFG.probeTimeout }).then((r) => {
        vm.lastProbe = Date.now();
        vm.ms = r.ms || 0;
        if (r.ok && r.json && r.json.ok) {
          vm.status = "alive";
          vm.ok = true;
          vm.seal = r.json.seal || null;
          vm.poolTotal = r.json.pool ? r.json.pool.total : 0;
        } else {
          vm.status = "dead";
          vm.err = r.err || `code=${r.code}`;
        }
      }),
    );
  });
  await Promise.all(probes);
  FLEET.vms = newVMs;
  const alive = newVMs.filter((v) => v.ok).length;
  log(C.G(`  ✓ refreshFleet · alive=${alive}/${newVMs.length}`));
  return FLEET.vms;
}

// ─── 起 N VM (调 deployer.js --wam-all) ───
function spawnVMs(n, dryGist = true) {
  return new Promise((resolve) => {
    log(`  ▶ spawnVMs n=${n} dryGist=${dryGist}`);
    const args = [path.join(BASE, "deployer.js"), "--wam-all", "--n", String(n)];
    if (dryGist) args.push("--dry-gist");
    const child = spawn("node", args, {
      cwd: BASE,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => {
      resolve({
        code,
        outTail: out.slice(-2000),
        errTail: err.slice(-500),
        spawned:
          (out.match(/(\d+)\s*\/\s*(\d+)\s+件 spawn 成/) || [])[1] || "?",
        verified:
          (out.match(/(\d+)\s*\/\s*(\d+)\s+件 真活/) || [])[1] || "?",
      });
    });
    child.on("error", (e) =>
      resolve({ code: -1, outTail: "", errTail: e.message, err: e.message }),
    );
  });
}

// ─── 选 VM (round-robin · 仅 alive) ───
function pickVM() {
  const alive = FLEET.vms.filter((v) => v.ok);
  if (alive.length === 0) return null;
  FLEET.cursor = (FLEET.cursor + 1) % alive.length;
  return alive[FLEET.cursor];
}

// ─── 反代到 VM 或 fallback (帛书六十六 · 江海下流) ───
async function proxyChat(req, res, body) {
  FLEET.metrics.requests++;
  const vm = pickVM();
  let target = null;
  let routedKind = "";
  if (vm) {
    target = vm.baseUrl.replace(/\/$/, "") + "/port/7780" + req.url;
    routedKind = `VM[${vm.idx}/${vm.sid.slice(0, 12)}]`;
    FLEET.metrics.routedToVM++;
  } else {
    target = CFG.fallback.replace(/\/$/, "") + req.url;
    routedKind = `fallback ${CFG.fallback}`;
    FLEET.metrics.routedToFallback++;
  }
  log(`  · ${req.method} ${req.url} → ${routedKind}`);

  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  if (vm && vm.auth) headers["X-Dao-Auth"] = vm.auth;

  const r = await httpReq(target, {
    method: req.method,
    headers,
    timeout: 90000,
  }, body);

  if (!r.ok) {
    FLEET.metrics.errors++;
    if (vm) {
      vm.err = r.err || `code=${r.code}`;
      vm.ok = false;
    }
  }

  res.statusCode = r.code || 502;
  // 尽量保持 content-type
  if (r.json) {
    res.setHeader("content-type", "application/json");
  } else {
    res.setHeader("content-type", "application/octet-stream");
  }
  res.setHeader("X-Fleet-Routed", routedKind);
  res.end(r.body || "");
}

// ─── HTTP 路由 ───
function readReqBody(req) {
  return new Promise((resolve) => {
    const c = [];
    req.on("data", (d) => c.push(d));
    req.on("end", () => resolve(Buffer.concat(c).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

const HANDLERS = {
  "GET /": (req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Fleet Master · 印 159</title>
<style>body{font:14px/1.6 -apple-system,Segoe UI,sans-serif;max-width:780px;margin:30px auto;padding:0 16px;color:#222}h1{margin:0 0 6px;font-size:22px}h2{margin:24px 0 8px;font-size:15px;color:#06c}code{background:#f3f3f3;padding:2px 6px;border-radius:3px;font:13px Consolas,monospace}.cl{color:#666}.g{color:#080}</style>
</head><body>
<h1>Fleet Master · 印 159 · 一账号一虚拟机</h1>
<p class="cl">「邻邦相望 · 鸡狗之声相闻 · 民至老死不相往来」(帛书八十) · 本地轻管理 · N VM 重反代</p>
<h2>状态</h2>
<pre>version: ${VERSION}
seal:    ${SEAL}
bind:    ${CFG.bind}:${CFG.port}
fallback: ${CFG.fallback}
uptime:  ${((Date.now() - FLEET.startedAt) / 1000).toFixed(0)}s
fleet:   ${FLEET.vms.length} VMs (alive: ${FLEET.vms.filter((v) => v.ok).length})
metrics: total=${FLEET.metrics.requests} vm=${FLEET.metrics.routedToVM} fallback=${FLEET.metrics.routedToFallback} err=${FLEET.metrics.errors}</pre>
<h2>端点</h2>
<ul>
<li><code>GET /health</code> · 健康 JSON</li>
<li><code>GET /fleet/list</code> · 列所有 VM (含真活态)</li>
<li><code>GET /fleet/probe</code> · 强制刷新 VM 真活</li>
<li><code>POST /fleet/spawn</code> · 起 N 件新 VM (<code>{ "n": 2 }</code>)</li>
<li><code>GET /dashboard</code> · web dashboard 一目全</li>
<li><code>POST /v1/chat/completions</code> · OpenAI 兼容 · 智能 LB</li>
<li><code>POST /v1/messages</code> · Anthropic 兼容 · 智能 LB</li>
<li><code>GET /v1/models</code> · 透传</li>
</ul>
<h2>道</h2>
<p>「上善若水 · 水善利万物而不静 · 居众之所恶 · 故几于道矣」(帛书八)</p>
</body></html>`);
  },
  "GET /health": async (req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify(
        {
          ok: true,
          version: VERSION,
          seal: SEAL,
          bind: `${CFG.bind}:${CFG.port}`,
          uptimeMs: Date.now() - FLEET.startedAt,
          fleet: {
            total: FLEET.vms.length,
            alive: FLEET.vms.filter((v) => v.ok).length,
            cursor: FLEET.cursor,
          },
          metrics: FLEET.metrics,
          fallback: CFG.fallback,
        },
        null,
        2,
      ),
    );
  },
  "GET /fleet/list": (req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify(
        {
          count: FLEET.vms.length,
          alive: FLEET.vms.filter((v) => v.ok).length,
          vms: FLEET.vms.map((v) => ({
            idx: v.idx,
            sid: v.sid,
            baseUrl: v.baseUrl,
            status: v.status,
            ok: v.ok,
            err: v.err,
            lastProbe: v.lastProbe,
            ms: v.ms,
            seal: v.seal,
            poolTotal: v.poolTotal,
          })),
          wam_token_pool_count: readWamPool().length,
        },
        null,
        2,
      ),
    );
  },
  "GET /fleet/probe": async (req, res) => {
    await refreshFleet();
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify(
        {
          ok: true,
          alive: FLEET.vms.filter((v) => v.ok).length,
          total: FLEET.vms.length,
        },
        null,
        2,
      ),
    );
  },
  "POST /fleet/spawn": async (req, res, body) => {
    let parsed = {};
    try {
      parsed = JSON.parse(body || "{}");
    } catch {}
    const n = parseInt(parsed.n || "1", 10);
    const dryGist = parsed.dryGist !== false;
    if (n < 1 || n > 16) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "n must be 1..16" }));
      return;
    }
    // 异步 spawn · 立即返
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        accepted: true,
        n,
        note: "spawn started · poll GET /fleet/list 看进度 (3-15min)",
      }),
    );
    spawnVMs(n, dryGist).then(async (r) => {
      log(C.G(`  ✓ spawn done · spawned=${r.spawned} verified=${r.verified}`));
      await refreshFleet();
    });
  },
  "GET /dashboard": (req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(DASHBOARD_HTML);
  },
};

// ─── dashboard HTML (内嵌 · 0 deps · 真朴) ───
const DASHBOARD_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Fleet Dashboard · 印 159</title>
<style>
body{font:14px/1.5 -apple-system,Segoe UI,sans-serif;max-width:1080px;margin:20px auto;padding:0 16px;color:#222;background:#f8f9fb}
h1{margin:0;font-size:20px}
.cl{color:#666;font-size:13px}
.card{background:#fff;border-radius:8px;padding:16px;margin:16px 0;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.row{display:flex;gap:12px;flex-wrap:wrap}
.kv{flex:1;min-width:140px}.kv b{display:block;font-size:11px;color:#999;text-transform:uppercase}
.kv span{font-size:18px;font-weight:600}
.g{color:#080}.r{color:#c00}.y{color:#a60}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:8px 10px;border-bottom:1px solid #eee;text-align:left}
th{background:#fafbfc;color:#666;font-weight:500;font-size:12px}
code{font:12px Consolas,monospace;background:#f3f3f3;padding:2px 6px;border-radius:3px}
button{padding:6px 12px;font:13px inherit;background:#06c;color:#fff;border:0;border-radius:4px;cursor:pointer;margin:0 4px}
button:hover{background:#048}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.dot.alive{background:#0c0}.dot.dead{background:#c00}.dot.pending{background:#aaa}
</style></head><body>
<h1>Fleet Master · 印 159</h1>
<p class="cl">一账号一虚拟机 · 本地轻管理 · N VM 重反代 · 「邻邦相望 · 民至老死不相往来」</p>

<div class="card">
  <div class="row">
    <div class="kv"><b>fleet alive</b><span class="g" id="kAlive">-</span></div>
    <div class="kv"><b>fleet total</b><span id="kTotal">-</span></div>
    <div class="kv"><b>wam tokens</b><span id="kWam">-</span></div>
    <div class="kv"><b>req total</b><span id="kReq">-</span></div>
    <div class="kv"><b>via VM</b><span class="g" id="kVM">-</span></div>
    <div class="kv"><b>fallback</b><span class="y" id="kFB">-</span></div>
  </div>
</div>

<div class="card">
  <button onclick="refresh()">↻ refresh</button>
  <button onclick="probe()">⚇ probe (强测每件)</button>
  <button onclick="spawn(1)">+ 起 1 VM</button>
  <button onclick="spawn(2)">+ 起 2 VM</button>
  <button onclick="spawn(4)">+ 起 4 VM</button>
  <button onclick="spawn(8)">+ 起 8 VM</button>
  <span id="msg" class="cl"></span>
</div>

<div class="card">
  <h3 style="margin:0 0 12px">VM 表</h3>
  <table id="vmt"><thead><tr><th>idx</th><th>状</th><th>sid</th><th>baseUrl</th><th>pool</th><th>err</th><th>ms</th></tr></thead><tbody></tbody></table>
</div>

<script>
async function fetchJson(p, opts) {
  const r = await fetch(p, opts);
  return await r.json();
}
async function refresh() {
  try {
    const h = await fetchJson('/health');
    const l = await fetchJson('/fleet/list');
    document.getElementById('kAlive').textContent = h.fleet.alive;
    document.getElementById('kTotal').textContent = h.fleet.total;
    document.getElementById('kWam').textContent = l.wam_token_pool_count || 0;
    document.getElementById('kReq').textContent = h.metrics.requests;
    document.getElementById('kVM').textContent = h.metrics.routedToVM;
    document.getElementById('kFB').textContent = h.metrics.routedToFallback;
    const tbody = document.querySelector('#vmt tbody');
    tbody.innerHTML = '';
    for (const v of l.vms) {
      const tr = document.createElement('tr');
      const dotCls = v.ok ? 'alive' : (v.status === 'pending' ? 'pending' : 'dead');
      tr.innerHTML = '<td>' + v.idx + '</td>' +
        '<td><span class="dot ' + dotCls + '"></span>' + v.status + '</td>' +
        '<td><code>' + (v.sid || '?').slice(0, 24) + '</code></td>' +
        '<td><code style="font-size:11px">' + (v.baseUrl || '').slice(0, 50) + '</code></td>' +
        '<td>' + (v.poolTotal || 0) + '</td>' +
        '<td>' + (v.err || '') + '</td>' +
        '<td>' + (v.ms || 0) + 'ms</td>';
      tbody.appendChild(tr);
    }
  } catch (e) {
    document.getElementById('msg').textContent = '✗ ' + e.message;
  }
}
async function probe() {
  document.getElementById('msg').textContent = '… 探测中 ' + new Date().toLocaleTimeString();
  await fetchJson('/fleet/probe');
  document.getElementById('msg').textContent = '✓ probe 完 ' + new Date().toLocaleTimeString();
  refresh();
}
async function spawn(n) {
  if (!confirm('确认起 ' + n + ' 件 VM? (耗 ' + n + ' ACU · 3-15min)')) return;
  document.getElementById('msg').textContent = '… spawn n=' + n + ' (异步 3-15min) ' + new Date().toLocaleTimeString();
  const r = await fetchJson('/fleet/spawn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ n: n, dryGist: true })
  });
  document.getElementById('msg').textContent = '✓ 起 ' + n + ' VM · 进度: /fleet/list';
  setTimeout(refresh, 3000);
  setTimeout(refresh, 30000);
  setTimeout(refresh, 90000);
}
refresh();
setInterval(refresh, 15000);
</script>
</body></html>`;

// ─── 主请求路由 ───
async function handle(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host || "x"}`);
  const route = `${req.method} ${reqUrl.pathname}`;

  // 长链路 LLM 请求 (透 to VM 或 fallback)
  if (
    reqUrl.pathname === "/v1/chat/completions" ||
    reqUrl.pathname === "/v1/messages" ||
    reqUrl.pathname === "/v1/models" ||
    reqUrl.pathname.startsWith("/v1beta/") ||
    reqUrl.pathname.startsWith("/windsurf/") ||
    reqUrl.pathname.startsWith("/dc/")
  ) {
    const body = req.method === "POST" ? await readReqBody(req) : null;
    return proxyChat(req, res, body);
  }

  const handler = HANDLERS[route];
  if (handler) {
    const body =
      req.method === "POST" || req.method === "PUT"
        ? await readReqBody(req)
        : null;
    try {
      await handler(req, res, body);
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  res.statusCode = 404;
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      error: "not found",
      route,
      hint: "GET /, /health, /fleet/list, /dashboard",
    }),
  );
}

// ─── 启 ───
const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    log(C.R(`✗ handle: ${e.stack || e.message}`));
    try {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e.message }));
    } catch {}
  });
});

server.listen(CFG.port, CFG.bind, () => {
  console.log(C.BO(`═══ Fleet Master · 印 159 · v${VERSION} ═══`));
  console.log(`  bind:     ${CFG.bind}:${CFG.port}`);
  console.log(`  fallback: ${CFG.fallback}`);
  console.log(`  poolFile: ${CFG.poolFile}`);
  console.log(`  wamPool:  ${CFG.wamPoolFile}`);
  console.log("");
  console.log(C.G(`  → http://${CFG.bind}:${CFG.port}/`));
  console.log(C.G(`  → http://${CFG.bind}:${CFG.port}/dashboard`));
  console.log("");
  console.log(C.GR(`  「邻邦相望 · 鸡狗之声相闻 · 民至老死不相往来」`));
  // 启时即 refresh
  refreshFleet().catch((e) => log(C.R(`✗ initial refresh: ${e.message}`)));
  // 定时 60s refresh
  setInterval(() => {
    refreshFleet().catch(() => {});
  }, 60000);
});

process.on("SIGINT", () => {
  log(C.Y("· SIGINT · 退"));
  process.exit(0);
});
