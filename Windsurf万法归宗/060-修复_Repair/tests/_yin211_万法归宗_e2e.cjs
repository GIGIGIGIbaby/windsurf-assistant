#!/usr/bin/env node
/**
 * _yin211_万法归宗_e2e.cjs · 印211守门 · dao_master.cjs 全量验证
 *
 *   「道生一，一生二，二生三，三生万物。」
 *   「无为而无不为。损之又损，以至于无为。」
 *   「天下之至柔，驰骋于天下之致坚；无有入于无间。」
 *
 * 验证 dao_master.cjs 的所有能力:
 *   §A  模块加载与导出完整性 (25项API)
 *   §B  工具函数 (httpGet/httpPost/lspRpc/sleep)
 *   §C  Windsurf 自动发现 (discoverLSP/extractApiKey)
 *   §D  基础设施健康检查 (Router/Bridge/Gateway)
 *   §E  CSRF 缓存读取与验证
 *   §F  Cascade API (StartCascade/Send/Poll)
 *   §G  路由配置管理 (loadRouteConfig/setRoute/listRoutes)
 *   §H  远程脚本构建器 (4个构建函数)
 *   §I  HTTP API 服务器 (启动+端点验证)
 *   §J  全链路集成 (chat → response)
 *   §K  CLI 子命令兼容性
 *
 * 2026-05-26 · 道法自然
 * v211.1.0 升级: routes object格式、activeRouterPort、stall检测
 * v211.3.0 升级: directGatewayChat、GATEWAY_MODEL_MAP
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const http = require("http");

const MASTER_PATH = path.join(__dirname, "..", "dao_master.cjs");

// ── 测试框架 ──
let total = 0, pass = 0, fail = 0;
const failures = [];
function section(name) {
  console.log(`\n  ${name}`);
}
function ok(name, cond, detail) {
  total++;
  const icon = cond ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  const det  = detail ? ` \x1b[90m(${detail})\x1b[0m` : "";
  if (cond) { pass++; console.log(`    ${icon} ${name}${det}`); }
  else { fail++; failures.push(name); console.log(`    ${icon} ${name}${det}`); }
  return cond;
}
function skip(name) {
  console.log(`    \x1b[90m⊘ ${name} (skip)\x1b[0m`);
}

// ── HTTP 工具 ──
function httpGet(port, urlPath, timeout = 3000) {
  return new Promise(r => {
    http.get({ hostname: "127.0.0.1", port, path: urlPath, timeout }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { r({ ok: res.statusCode < 400, s: res.statusCode, j: JSON.parse(d) }); }
        catch { r({ ok: res.statusCode < 400, s: res.statusCode, b: d }); }
      });
    }).on("error", e => r({ ok: false, err: e.message }));
    setTimeout(() => r({ ok: false, err: "timeout" }), timeout);
  });
}

function httpPost(port, urlPath, body, timeout = 5000) {
  return new Promise(r => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1", port, path: urlPath, method: "POST", timeout,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { r({ ok: res.statusCode < 400, s: res.statusCode, j: JSON.parse(d) }); }
        catch { r({ ok: res.statusCode < 400, s: res.statusCode, b: d }); }
      });
    });
    req.on("error", e => r({ ok: false, err: e.message }));
    req.write(payload);
    req.end();
    setTimeout(() => r({ ok: false, err: "timeout" }), timeout);
  });
}

// ══════════════════════════════════════════════════════════════════════
// 主测试函数
// ══════════════════════════════════════════════════════════════════════

async function main() {
  console.log("\n\x1b[1m═══ 印211守门 · dao_master.cjs 全量验证 ═══\x1b[0m");
  console.log(`  时间: ${new Date().toISOString()}`);

  // ── §A 模块加载 ──
  section("§A 模块加载与API完整性");

  ok("dao_master.cjs 文件存在", fs.existsSync(MASTER_PATH), MASTER_PATH);

  let master;
  try {
    master = require(MASTER_PATH);
    ok("模块 require 成功", true);
  } catch (e) {
    ok("模块 require 成功", false, e.message);
    console.log("\n  ABORT: 模块加载失败，无法继续\n");
    process.exit(1);
  }

  // 检查导出完整性
  const requiredExports = [
    "discoverLSP", "extractApiKey", "extractCSRF", "metaObj",
    "ensureAll", "ensureRouter", "ensureBridge", "ensureGateway",
    "restartRouter", "restartGateway",
    "healthCheck", "activeRouterPort", "readWindsurfApiPort",
    "cascadeStart", "cascadeSend", "cascadePoll",
    "directGatewayChat", "GATEWAY_MODEL_MAP",
    "chat", "extractText",
    "getStatus", "printStatus", "monitorLoop",
    "loadRouteConfig", "setRoute", "listRoutes",
    "remoteExec",
    "buildRemoteStatusScript", "buildRemoteEnsureScript",
    "buildRemoteCSRFScript", "buildRemoteChatScript",
    "startApiServer",
    "httpGet", "httpPost", "lspRpc", "sleep",
    "PORTS", "PATHS", "VERSION",
  ];

  let exportCount = 0;
  for (const exp of requiredExports) {
    if (ok(`导出: ${exp}`, exp in master)) exportCount++;
  }
  ok(`导出完整性 (${exportCount}/${requiredExports.length})`,
    exportCount === requiredExports.length);

  // ── §B 工具函数 ──
  section("§B 工具函数");

  ok("VERSION 字符串 (211.3.0+)",
    typeof master.VERSION === "string" && master.VERSION >= "211.3.0",
    master.VERSION);
  ok("PORTS 对象", typeof master.PORTS === "object" &&
    master.PORTS.router > 0 && master.PORTS.bridge > 0 && master.PORTS.gateway > 0,
    JSON.stringify(master.PORTS));
  ok("PATHS 对象", typeof master.PATHS === "object" && master.PATHS.stateDb,
    "stateDb=" + master.PATHS.stateDb.slice(-30));
  ok("sleep 是函数", typeof master.sleep === "function");
  ok("sleep 返回 Promise", master.sleep(1) instanceof Promise);
  ok("httpGet 是函数", typeof master.httpGet === "function");
  ok("httpPost 是函数", typeof master.httpPost === "function");
  ok("lspRpc 是函数", typeof master.lspRpc === "function");

  // ── §C Windsurf 自动发现 ──
  section("§C Windsurf 自动发现");

  let lspInfo;
  try {
    lspInfo = await master.discoverLSP();
    ok("discoverLSP 返回对象", typeof lspInfo === "object" && lspInfo.port > 0,
      `port=${lspInfo.port} pid=${lspInfo.pid || "?"}`);
  } catch (e) {
    ok("discoverLSP 无异常", false, e.message);
    lspInfo = { port: 32661, pid: null };
  }

  const apiKey = master.extractApiKey();
  ok("extractApiKey 返回字符串", typeof apiKey === "string" && apiKey.length > 50,
    apiKey ? `len=${apiKey.length}` : "null");

  const meta = master.metaObj(apiKey || "test_key");
  ok("metaObj 结构正确",
    meta.ideName === "windsurf" && meta.extensionVersion && meta.apiKey,
    `ideName=${meta.ideName}`);

  // ── §D 基础设施健康检查 ──
  section("§D 基础设施健康检查");

  const [rh, bh, gh] = await Promise.all([
    master.healthCheck(master.PORTS.router, 2000),
    master.healthCheck(master.PORTS.bridge, 2000),
    master.healthCheck(master.PORTS.gateway, 2000),
  ]);

  ok(`Router :${master.PORTS.router}`, rh.alive,
    rh.alive ? `routes=${rh.router?.count || "?"}` : "offline");
  ok(`Bridge :${master.PORTS.bridge}`, bh.alive,
    bh.alive ? "online" : "offline");
  ok(`Gateway :${master.PORTS.gateway}`, gh.alive,
    gh.alive ? "online" : "offline");

  const allInfra = rh.alive && bh.alive && gh.alive;

  // ── §E CSRF 缓存 ──
  section("§E CSRF 缓存与验证");

  let csrfFromCache = null;
  try {
    const cached = JSON.parse(fs.readFileSync(master.PATHS.csrfCache, "utf8"));
    csrfFromCache = cached.csrf;
    ok("CSRF 缓存文件存在", true, cached.csrf.slice(0, 8) + "...");
    ok("CSRF 格式正确 (UUID v4)",
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(cached.csrf));
    ok("CSRF 端口记录", cached.port > 0, `port=${cached.port}`);
  } catch {
    ok("CSRF 缓存文件存在", false, "需要先运行 csrf 命令");
    skip("CSRF 格式正确 (UUID v4)");
    skip("CSRF 端口记录");
  }

  // 如果有 CSRF 和 LSP，验证 Heartbeat
  if (csrfFromCache && apiKey && lspInfo.port > 0) {
    try {
      const hb = await master.lspRpc(
        lspInfo.port, csrfFromCache, apiKey,
        "Heartbeat", { metadata: master.metaObj(apiKey) }, 5000
      );
      ok("CSRF Heartbeat 验证", hb.s === 200, `status=${hb.s}`);
    } catch (e) {
      ok("CSRF Heartbeat 验证", false, e.message);
    }
  } else {
    skip("CSRF Heartbeat 验证 (无缓存或无LSP)");
  }

  // ── §F Cascade API ──
  section("§F Cascade API");

  ok("cascadeStart 是函数", typeof master.cascadeStart === "function");
  ok("cascadeSend 是函数", typeof master.cascadeSend === "function");
  ok("cascadePoll 是函数", typeof master.cascadePoll === "function");
  ok("chat 是函数", typeof master.chat === "function");
  ok("extractText 是函数", typeof master.extractText === "function");

  // 测试 extractText
  const testSteps = [
    { plannerResponse: { response: "Hello from test" } },
  ];
  const extracted = master.extractText(testSteps);
  ok("extractText 从 plannerResponse 提取文本",
    extracted === "Hello from test", extracted || "null");

  // 如果基础设施在线，测试完整 Cascade
  if (allInfra && csrfFromCache && apiKey) {
    try {
      const cascadeId = await master.cascadeStart(lspInfo.port, csrfFromCache, apiKey);
      ok("cascadeStart 返回 cascadeId", !!cascadeId,
        cascadeId ? cascadeId.slice(0, 8) + "..." : "null");

      if (cascadeId) {
        const sendR = await master.cascadeSend(
          lspInfo.port, csrfFromCache, apiKey, cascadeId,
          "Reply with exactly one word: YES",
          "MODEL_GOOGLE_GEMINI_3_0_FLASH_LOW"
        );
        ok("cascadeSend 返回 200", sendR.s === 200, `status=${sendR.s}`);
      } else {
        skip("cascadeSend (无 cascadeId)");
      }
    } catch (e) {
      ok("cascadeStart", false, e.message);
      skip("cascadeSend");
    }
  } else {
    skip("cascadeStart (基础设施离线或无CSRF)");
    skip("cascadeSend");
  }

  // ── §G 路由配置 ──
  section("§G 路由配置管理");

  const cfg = master.loadRouteConfig();
  ok("loadRouteConfig 返回对象", typeof cfg === "object", "keys=" + Object.keys(cfg).join(","));

  // 测试 setRoute (写入临时条目)
  try {
    // v211.1.0: setRoute 使用 provider::model 格式
    master.setRoute("MODEL_TEST_yin211", "github::gpt-4.1-mini");
    const cfg2 = master.loadRouteConfig();
    // 兼容 object 格式
    const routes = cfg2.daoRoutes?.routes || {};
    const found = Array.isArray(routes)
      ? routes.some(r => r.modelUid === "MODEL_TEST_yin211")
      : "MODEL_TEST_yin211" in routes;
    ok("setRoute 写入成功 (object 格式)", found,
      "MODEL_TEST_yin211 → github::gpt-4.1-mini");
    // 检查导入的 object 格式是否正确
    if (!Array.isArray(routes)) {
      ok("routes 为 object 格式",
        routes["MODEL_TEST_yin211"]?.provider === "github" &&
        routes["MODEL_TEST_yin211"]?.model === "gpt-4.1-mini",
        JSON.stringify(routes["MODEL_TEST_yin211"]));
    } else { skip("routes object 格式检查"); }
    // 清理测试条目
    const routes2 = cfg2.daoRoutes?.routes;
    if (routes2 && !Array.isArray(routes2)) delete routes2["MODEL_TEST_yin211"];
    else if (Array.isArray(routes2)) cfg2.daoRoutes.routes = routes2.filter(r => r.modelUid !== "MODEL_TEST_yin211");
    fs.writeFileSync(master.PATHS.configJson, JSON.stringify(cfg2, null, 2));
  } catch (e) {
    ok("setRoute", false, e.message);
  }

  ok("listRoutes 是函数", typeof master.listRoutes === "function");
  ok("activeRouterPort 是函数", typeof master.activeRouterPort === "function");
  const arp = master.activeRouterPort();
  ok("activeRouterPort 返回有效端口",
    typeof arp === "number" && arp > 0 && arp < 65536, `port=${arp}`);
  ok("restartGateway 是函数", typeof master.restartGateway === "function");
  ok("directGatewayChat 是函数", typeof master.directGatewayChat === "function");
  ok("GATEWAY_MODEL_MAP 是对象", typeof master.GATEWAY_MODEL_MAP === "object" &&
    "MODEL_GOOGLE_GEMINI_3_0_FLASH_LOW" in master.GATEWAY_MODEL_MAP,
    `map keys=${Object.keys(master.GATEWAY_MODEL_MAP).length}`);

  // ── §H 远程脚本构建器 ──
  section("§H 远程脚本构建器");

  const statusScript = master.buildRemoteStatusScript();
  ok("buildRemoteStatusScript 返回非空字符串",
    typeof statusScript === "string" && statusScript.length > 100,
    `len=${statusScript.length}`);
  ok("status脚本包含 netstat",
    statusScript.includes("netstat"), "netstat 扫描端口");
  ok("status脚本包含 healthCheck逻辑",
    statusScript.includes("http.get"), "http.get 健康检查");

  const ensureScript = master.buildRemoteEnsureScript();
  ok("buildRemoteEnsureScript 返回非空字符串",
    typeof ensureScript === "string" && ensureScript.length > 100,
    `len=${ensureScript.length}`);
  ok("ensure脚本包含 spawn 启动逻辑",
    ensureScript.includes("spawn"), "spawn 进程启动");

  const csrfScript = master.buildRemoteCSRFScript();
  ok("buildRemoteCSRFScript 返回非空字符串",
    typeof csrfScript === "string" && csrfScript.length > 100,
    `len=${csrfScript.length}`);
  ok("csrf脚本包含 MiniDump",
    csrfScript.includes("MiniDump"), "comsvcs.dll MiniDump");
  ok("csrf脚本包含 UUID 正则",
    csrfScript.includes("4[0-9a-f]{3}"), "UUID v4 正则");

  const chatScript = master.buildRemoteChatScript("测试消息", "MODEL_TEST");
  ok("buildRemoteChatScript 返回非空字符串",
    typeof chatScript === "string" && chatScript.length > 100,
    `len=${chatScript.length}`);
  ok("chat脚本包含消息内容",
    chatScript.includes("测试消息"), "消息注入正确");
  ok("chat脚本包含模型 UID",
    chatScript.includes("MODEL_TEST"), "模型UID注入正确");

  // ── §I HTTP API 服务器 ──
  section("§I HTTP API 服务器");

  const TEST_PORT = 17211;
  let server;
  try {
    // 临时启动测试服务器
    server = await master.startApiServer(TEST_PORT);
    await master.sleep(500);

    const healthR = await httpGet(TEST_PORT, "/health");
    ok("GET /health 返回 200", healthR.ok, `status=${healthR.s}`);
    ok("/health 含 version", healthR.j?.version === master.VERSION,
      `version=${healthR.j?.version}`);

    const statusR = await httpGet(TEST_PORT, "/status");
    ok("GET /status 返回 200", statusR.ok, `status=${statusR.s}`);
    ok("/status 含 lsp 字段", statusR.j?.lsp !== undefined);

    const csrfR = await httpGet(TEST_PORT, "/csrf");
    ok("GET /csrf 有响应", csrfR.s > 0, `status=${csrfR.s}`);

    const ensureR = await httpPost(TEST_PORT, "/ensure", {});
    ok("POST /ensure 有响应", ensureR.s > 0, `status=${ensureR.s}`);

    // 测试 404
    const notFound = await httpGet(TEST_PORT, "/nonexistent");
    ok("GET /nonexistent 返回 404", notFound.s === 404);

  } catch (e) {
    ok("HTTP API 服务器启动", false, e.message);
    skip("GET /health");
    skip("GET /status");
    skip("GET /csrf");
    skip("POST /ensure");
    skip("GET /nonexistent → 404");
  } finally {
    if (server) {
      server.close();
    }
  }

  // ── §J getStatus 全链路 ──
  section("§J getStatus 全链路");

  try {
    const s = await master.getStatus();
    ok("getStatus 返回对象", typeof s === "object");
    ok("getStatus.lsp 存在", typeof s.lsp === "object", `port=${s.lsp?.port}`);
    ok("getStatus.router 存在", typeof s.router === "object",
      `alive=${s.router?.alive} routes=${s.router?.routes}`);
    ok("getStatus.bridge 存在", typeof s.bridge === "object",
      `alive=${s.bridge?.alive}`);
    ok("getStatus.gateway 存在", typeof s.gateway === "object",
      `alive=${s.gateway?.alive}`);
    ok("getStatus.ts 时间戳", typeof s.ts === "string" && s.ts.includes("T"));
  } catch (e) {
    ok("getStatus", false, e.message);
  }

  // ── §K CLI 兼容性 ──
  section("§K CLI 兼容性");

  // 检查所有 CLI 命令都有对应处理逻辑（通过读取源文件检查）
  const masterSrc = fs.readFileSync(MASTER_PATH, "utf8");
  const cliCmds = ["status", "ensure", "csrf", "chat", "monitor", "server", "route", "restart", "remote", "help"];
  for (const cmd of cliCmds) {
    ok(`CLI 命令 '${cmd}' 已实现`,
      masterSrc.includes(`cmd === "${cmd}"`),
      `if (cmd === "${cmd}")`);
  }
  // v211.1.0 新增要素
  ok("activeRouterPort 已实现", masterSrc.includes("function activeRouterPort"));
  ok("readWindsurfApiPort 已实现", masterSrc.includes("readWindsurfApiPort"));
  ok("restartGateway 已实现", masterSrc.includes("async function restartGateway"));
  ok("stallCount 停滞检测已实现", masterSrc.includes("stallCount"));
  ok("routes object 格式兼容", masterSrc.includes("Array.isArray(routes)"));
  ok("directGatewayChat 已实现", masterSrc.includes("async function directGatewayChat"));
  ok("GATEWAY_MODEL_MAP 已实现", masterSrc.includes("GATEWAY_MODEL_MAP"));
  ok("_forceCascade 开关已实现", masterSrc.includes("_forceCascade"));

  // ── 汇总 ──
  console.log(`\n${"═".repeat(60)}`);
  const passColor = pass === total ? "\x1b[32m" : "\x1b[33m";
  console.log(`  印211守门: ${passColor}${pass}/${total} 通过\x1b[0m` +
    (fail > 0 ? ` · \x1b[31m${fail} 失败\x1b[0m` : " · \x1b[32m全部通过\x1b[0m"));
  console.log(`${"═".repeat(60)}`);
  if (failures.length > 0) {
    console.log("  失败项:");
    for (const f of failures) console.log(`    \x1b[31m✗\x1b[0m ${f}`);
  }
  console.log();

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("\x1b[31mFATAL:\x1b[0m", e.message);
  process.exit(1);
});
