#!/usr/bin/env node
/**
 * _seal120_three_pool_test.cjs · 印 120 · 三池真测
 * ════════════════════════════════════════════════════════════════════════
 *  meta_router (port 8081) 之 chat fallback + 强 backend 路 + /v1/models 合并
 *  录 evidence 至 04_evidence/seal120_three_pool_chat_<ts>.json
 * ════════════════════════════════════════════════════════════════════════
 */
"use strict";
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const BASE_DIR = path.resolve(__dirname, "..");
const META_AUTH = fs.readFileSync(path.join(BASE_DIR, "01_GH编排", ".dao_meta_auth_token"), "utf-8").trim();
const POOL = JSON.parse(fs.readFileSync(path.join(BASE_DIR, "00_本源", "_state", "vm_pool.json"), "utf-8"));
const omniUrl = POOL[0].omni.base_url;
const u = new URL(omniUrl);
const auth = `${u.username}:${decodeURIComponent(u.password)}`;
const evidenceDir = path.join(BASE_DIR, "04_evidence");
if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

function call(p, method, body, includeAuth = true) {
  return new Promise((rs) => {
    const t1 = Date.now();
    const headers = { "Content-Type": "application/json" };
    if (includeAuth) headers["X-Dao-Auth"] = META_AUTH;
    if (body) headers["Content-Length"] = Buffer.byteLength(body);
    const r = https.request({
      hostname: u.hostname, port: 443, path: p, method,
      auth, headers, timeout: 60000,
    }, (res) => {
      const c = [];
      res.on("data", (d) => c.push(d));
      res.on("end", () => {
        const t = Buffer.concat(c).toString("utf-8");
        let parsed = null;
        try { parsed = JSON.parse(t); } catch (_) {}
        rs({
          status: res.statusCode,
          ms: Date.now() - t1,
          headers: { "x-meta-backend": res.headers["x-meta-backend"], "x-meta-tries": res.headers["x-meta-tries"] },
          parsed,
          raw: t.slice(0, 600),
        });
      });
    });
    r.on("error", (e) => rs({ status: 0, ms: Date.now() - t1, error: e.message }));
    r.on("timeout", () => { r.destroy(); rs({ status: 0, ms: Date.now() - t1, error: "timeout" }); });
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  const t0 = Date.now();
  const seal = "印 120 · 三池真测 · 道法自然 · 多账号并行";
  console.log(`\n═══ ${seal} ═══`);
  console.log(`omni:    ${u.hostname}`);
  console.log(`meta auth: ${META_AUTH.slice(0, 8)}...${META_AUTH.slice(-4)}`);
  console.log(`session:  ${POOL[0].sessionId}\n`);

  const probes = [];

  // ─── 探 1: /health (公开) ───
  console.log("─ ① /port/8081/health (公开)");
  let r = await call("/port/8081/health", "GET", null, false);
  console.log(`  [${r.status}] ${r.ms}ms · ${r.parsed ? `v=${r.parsed.version} dao.hasAuth=${r.parsed.backends?.dao?.hasAuth} gh.hasKey=${r.parsed.backends?.github?.hasKey}` : r.raw.slice(0, 100)}`);
  probes.push({ probe: "health", ...r });

  // ─── 探 2: /backends/status ───
  console.log("─ ② /port/8081/backends/status");
  r = await call("/port/8081/backends/status", "GET", null, false);
  console.log(`  [${r.status}] ${r.ms}ms`);
  if (r.parsed?.backends) for (const b of r.parsed.backends) console.log(`    · ${b.backend}: ${b.status} (${b.ms}ms · ${b.ok ? "OK" : "FAIL"})`);
  probes.push({ probe: "backends_status", ...r });

  // ─── 探 3: /v1/models 合 ───
  console.log("─ ③ /port/8081/v1/models (合 dao + github)");
  r = await call("/port/8081/v1/models", "GET", null);
  console.log(`  [${r.status}] ${r.ms}ms · data.len=${r.parsed?.data?.length ?? "-"}`);
  if (r.parsed?.meta?.backends) {
    console.log(`    · dao: ${r.parsed.meta.backends.dao.count} 件 (status=${r.parsed.meta.backends.dao.status})`);
    console.log(`    · github: ${r.parsed.meta.backends.github.count} 件 (hasKey=${r.parsed.meta.backends.github.hasKey})`);
  }
  probes.push({ probe: "v1_models", ...r, data_count: r.parsed?.data?.length, sample_ids: r.parsed?.data?.slice(0, 5).map(m => m.id) });

  // ─── 探 4: /v1/chat/completions (默 fallback 链 · dao → github) ───
  console.log("─ ④ /v1/chat/completions (默 fallback dao→github · model=devin)");
  const chatBody = JSON.stringify({ model: "devin", messages: [{ role: "user", content: "知者不博·一字便明" }], max_tokens: 30 });
  r = await call("/port/8081/v1/chat/completions", "POST", chatBody);
  console.log(`  [${r.status}] ${r.ms}ms · backend=${r.headers?.["x-meta-backend"] || "-"} · tries=${r.headers?.["x-meta-tries"] || "-"}`);
  console.log(`    body: ${r.raw.slice(0, 200)}`);
  probes.push({ probe: "chat_default_fallback", model: "devin", ...r });

  // ─── 探 5: 强 dao 路 /devin/v1/chat/completions ───
  console.log("─ ⑤ /devin/v1/chat/completions (强 dao 路)");
  const devinBody = JSON.stringify({ model: "devin", messages: [{ role: "user", content: "道生一" }], max_tokens: 20 });
  r = await call("/port/8081/devin/v1/chat/completions", "POST", devinBody);
  console.log(`  [${r.status}] ${r.ms}ms · ${r.raw.slice(0, 150)}`);
  probes.push({ probe: "chat_force_dao", model: "devin", ...r });

  // ─── 探 6: 强 github 路 /github/v1/chat/completions ───
  console.log("─ ⑥ /github/v1/chat/completions (强 github 路 · model=openai/gpt-4o-mini)");
  const ghBody = JSON.stringify({ model: "openai/gpt-4o-mini", messages: [{ role: "user", content: "道法自然" }], max_tokens: 20 });
  r = await call("/port/8081/github/v1/chat/completions", "POST", ghBody);
  console.log(`  [${r.status}] ${r.ms}ms · ${r.raw.slice(0, 200)}`);
  probes.push({ probe: "chat_force_github", model: "openai/gpt-4o-mini", ...r });

  // ─── 探 7: 启发路 model=github/openai/gpt-4o-mini ───
  console.log("─ ⑦ /v1/chat/completions (启发路 · model=github/openai/gpt-4o-mini)");
  const heuristicBody = JSON.stringify({ model: "github/openai/gpt-4o-mini", messages: [{ role: "user", content: "上善若水" }], max_tokens: 20 });
  r = await call("/port/8081/v1/chat/completions", "POST", heuristicBody);
  console.log(`  [${r.status}] ${r.ms}ms · ${r.raw.slice(0, 200)}`);
  probes.push({ probe: "chat_heuristic_github", model: "github/openai/gpt-4o-mini", ...r });

  // ─── 探 8: auth gate 守 (无 X-Dao-Auth) ───
  console.log("─ ⑧ /v1/chat/completions (无 X-Dao-Auth · 期 401)");
  r = await call("/port/8081/v1/chat/completions", "POST", chatBody, false);
  console.log(`  [${r.status}] ${r.ms}ms · ${r.raw.slice(0, 100)}`);
  probes.push({ probe: "auth_gate", ...r });

  // ─── evidence ───
  const evidence = {
    seal,
    timestamp: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    elapsed_ms: Date.now() - t0,
    vm: {
      sessionId: POOL[0].sessionId,
      omniHost: u.hostname,
      proxyPath: "/port/7780/",
      metaPath: "/port/8081/",
      port: { dao: 7780, meta: 8081 },
    },
    auth: { meta_token_len: META_AUTH.length },
    probes,
    summary: {
      total: probes.length,
      ok_count: probes.filter(p => p.status >= 200 && p.status < 300).length,
      meta_alive: probes[0]?.status === 200,
      backends_status_alive: probes[1]?.status === 200,
      models_count: probes[2]?.data_count,
      chat_default: probes[3]?.status,
      chat_force_dao: probes[4]?.status,
      chat_force_github: probes[5]?.status,
      chat_heuristic_gh: probes[6]?.status,
      auth_gate_works: probes[7]?.status === 401,
      verdict: probes[0]?.status === 200 && probes[2]?.parsed?.data?.length > 0
        ? (probes[5]?.status === 200 || probes[3]?.status === 200 || probes[4]?.status === 200
            ? "★ 三池打通 · chat 真返"
            : "▲ meta-router 真活 · 但所有上游 quota 耗 / GITHUB_TOKEN 缺")
        : "✗ meta-router 失",
    },
    notes: [
      "印 120 · meta_router 立于 dao_proxy 之上 · port 8081",
      "三池: (1) dao_proxy:7780 (windsurf 59 + devin 64) · (2) GitHub Models BYOK 35 模 · (3) reserved",
      "fallback 链: [dao, github] · 默 chat 优先 dao · 失则 github",
      "强路: /devin/* → dao_proxy · /github/* → GitHub BYOK",
      "启发路: model=github/* 自动剥前缀走 github",
      "GITHUB_TOKEN 主公一字便注: GITHUB_TOKEN=ghp_xxx node vm_meta_deploy.js --restart",
    ],
  };

  const tsFile = Date.now();
  const outPath = path.join(evidenceDir, `seal120_three_pool_chat_${tsFile}.json`);
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  console.log(`\n${"═".repeat(55)}`);
  console.log(`★ 印 120 evidence 录: ${outPath}`);
  console.log(`  verdict: ${evidence.summary.verdict}`);
  console.log(`  ok_count: ${evidence.summary.ok_count}/${evidence.summary.total}`);
})();
