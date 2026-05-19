#!/usr/bin/env node
/**
 * _yin161_quan.cjs · 印 161 · 全链路 · 一字真验
 *
 * 主公诏: 「全链路闭环 · 测试 gpt5.5 + cloud4.7 · 验证所有模块所有功能」
 *
 * 测口:
 *   ① 本机 :7780  dao_proxy 直 (兜底)
 *   ② 本机 :7790  fleet_master (LB → VM/fallback)
 *   ③ 公网 cf trycloudflare → :7790
 *   ④ VM 直 (omni URL/port/7780 · 走 cf-tunnel + devinapps.com)
 *   ⑤ 本机 :3000  道·智能任务管家 (主公真用件)
 *
 * 测模: claude-sonnet-4-7 · gpt-5-5 (主公诏二模)
 * 测轮: 每口 × 每模 × 1 笔 = 10 笔最低 · 加 SP 七态 + CRUD + parallel = ~15 笔
 */
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const C = {
  G: (s) => `\x1b[32m${s}\x1b[0m`,
  R: (s) => `\x1b[31m${s}\x1b[0m`,
  Y: (s) => `\x1b[33m${s}\x1b[0m`,
  B: (s) => `\x1b[36m${s}\x1b[0m`,
  GR: (s) => `\x1b[90m${s}\x1b[0m`,
  BO: (s) => `\x1b[1m${s}\x1b[0m`,
};

const VM_URL = "https://user:5bfa77b0c522f92fe5c42f2cb4322a45@d5ea8f956122-tunnel-5lxpoyaj.devinapps.com";
const PUB_URL = "https://liable-public-wise-structured.trycloudflare.com";
const AUTH_FILE = path.join(__dirname, "..", "130-道独立体_Standalone", "公网", "packages", "dao-devin-vm", ".dao_auth_token");
const AUTH_TOKEN = fs.existsSync(AUTH_FILE) ? fs.readFileSync(AUTH_FILE, "utf8").trim() : "";

function req(urlStr, opts = {}, body = null) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(urlStr); } catch { return resolve({ ok: false, code: 0, err: "bad url", ms: 0 }); }
    const lib = u.protocol === "https:" ? https : http;
    const t0 = Date.now();
    const reqOpts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method: opts.method || "GET",
      headers: opts.headers || {},
      timeout: opts.timeout || 60000,
      auth: u.username
        ? `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`
        : undefined,
    };
    if (body) reqOpts.headers["Content-Length"] = Buffer.byteLength(body);
    const r = lib.request(reqOpts, (res) => {
      const c = [];
      res.on("data", (d) => c.push(d));
      res.on("end", () => {
        const b = Buffer.concat(c).toString("utf8");
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
    r.on("error", (e) => resolve({ ok: false, code: 0, err: e.message, ms: Date.now() - t0 }));
    r.on("timeout", () => { r.destroy(); resolve({ ok: false, code: 0, err: "timeout", ms: Date.now() - t0 }); });
    if (body) r.write(body);
    r.end();
  });
}

async function chat(baseUrl, model, content, opts = {}) {
  const body = JSON.stringify({
    model,
    messages: [{ role: "user", content }],
    max_tokens: 15,
    stream: false,
  });
  const headers = { "Content-Type": "application/json" };
  if (opts.auth) headers["X-Dao-Auth"] = AUTH_TOKEN;
  const r = await req(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    timeout: opts.timeout || 60000,
  }, body);
  if (!r.ok) return { ok: false, code: r.code, err: r.err || `code=${r.code} body=${(r.body || "").slice(0, 100)}`, ms: r.ms };
  if (!r.json || !r.json.choices) return { ok: false, err: "bad json", raw: (r.body || "").slice(0, 100), ms: r.ms };
  return {
    ok: true,
    content: (r.json.choices[0].message.content || "").replace(/\s+/g, " ").trim(),
    model: r.json.model || model,
    routed: r.headers["x-fleet-routed"] || "(no header)",
    ms: r.ms,
  };
}

(async () => {
  const t0 = Date.now();
  console.log(C.BO(`\n═══ 印 161 · 全链路一字真验 · ${new Date().toISOString()} ═══`));
  console.log(`  AUTH_TOKEN: ${AUTH_TOKEN ? AUTH_TOKEN.slice(0, 12) + "..." : "(无)"}\n`);

  const RESULTS = { passed: 0, failed: 0, details: [] };
  const log = (label, r, extra = "") => {
    const tag = r.ok ? C.G("✓") : C.R("✗");
    const ms = String(r.ms || "?").padStart(6) + "ms";
    const detail = r.ok ? `${(r.content || "").slice(0, 30)} ${extra}` : (r.err || "?");
    console.log(`  ${tag} ${label.padEnd(40)} ${ms} · ${detail}`);
    RESULTS[r.ok ? "passed" : "failed"]++;
    RESULTS.details.push({ label, ok: r.ok, ms: r.ms, content: r.content, err: r.err, routed: r.routed });
  };

  // ─── § 1 · 五口 × 二模 × 1 笔 chat ───
  console.log(C.B("§ 1 · 五口 × 二模 × 1 笔 chat\n"));

  console.log(C.GR("  ── ① 本机 :7780 dao_proxy 直 ──"));
  log("7780 · gpt-5-5", await chat("http://127.0.0.1:7780", "gpt-5-5", "用一字答道"));
  log("7780 · 4.7", await chat("http://127.0.0.1:7780", "claude-sonnet-4-7", "用一字答道"));

  console.log(C.GR("  ── ② 本机 :7790 fleet_master ──"));
  const r2a = await chat("http://127.0.0.1:7790", "gpt-5-5", "用一字答道");
  log("7790 · gpt-5-5", r2a, `routed=${r2a.routed}`);
  const r2b = await chat("http://127.0.0.1:7790", "claude-sonnet-4-7", "用一字答道");
  log("7790 · 4.7", r2b, `routed=${r2b.routed}`);

  console.log(C.GR("  ── ③ 公网 cf trycloudflare → :7790 ──"));
  const r3a = await chat(PUB_URL, "gpt-5-5", "用一字答道");
  log("公网 cf · gpt-5-5", r3a, `routed=${r3a.routed}`);
  const r3b = await chat(PUB_URL, "claude-sonnet-4-7", "用一字答道");
  log("公网 cf · 4.7", r3b, `routed=${r3b.routed}`);

  console.log(C.GR("  ── ④ VM 直 (devinapps.com/port/7780) · 一虚一账号 ──"));
  log("VM 直 · gpt-5-5", await chat(`${VM_URL}/port/7780`, "gpt-5-5", "用一字答道", { auth: true }));
  log("VM 直 · 4.7", await chat(`${VM_URL}/port/7780`, "claude-sonnet-4-7", "用一字答道", { auth: true }));

  console.log(C.GR("  ── ⑤ :3000 任务管家 demo 之 /api/llm/chat ──"));
  const r5a = await req("http://127.0.0.1:3000/api/llm/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    timeout: 60000,
  }, JSON.stringify({ model: "gpt-5-5", message: "用一字答道", maxTokens: 15 }));
  log("3000 · gpt-5-5", r5a.ok && r5a.json ? { ok: true, content: r5a.json.content, ms: r5a.ms, routed: r5a.json.routed } : { ok: false, err: r5a.err || `code=${r5a.code}`, ms: r5a.ms });
  const r5b = await req("http://127.0.0.1:3000/api/llm/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    timeout: 90000,
  }, JSON.stringify({ model: "claude-sonnet-4-7", message: "用一字答道", maxTokens: 15 }));
  log("3000 · 4.7", r5b.ok && r5b.json ? { ok: true, content: r5b.json.content, ms: r5b.ms, routed: r5b.json.routed } : { ok: false, err: r5b.err || `code=${r5b.code}`, ms: r5b.ms });

  // ─── § 2 · CRUD ───
  console.log(C.B("\n§ 2 · :3000 demo CRUD\n"));
  const c1 = await req("http://127.0.0.1:3000/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" } }, JSON.stringify({ title: "印 161 测 1", priority: "high" }));
  log("POST /api/tasks", { ok: c1.ok, ms: c1.ms, content: c1.json ? `id=${c1.json.id}` : "", err: c1.err || `code=${c1.code}` });
  const c2 = await req("http://127.0.0.1:3000/api/tasks");
  log("GET /api/tasks", { ok: c2.ok, ms: c2.ms, content: c2.json ? `count=${c2.json.count || 0}` : "", err: c2.err || `code=${c2.code}` });
  const taskId = c1.json?.id;
  if (taskId) {
    const c3 = await req(`http://127.0.0.1:3000/api/tasks/${taskId}`, { method: "PUT", headers: { "Content-Type": "application/json" } }, JSON.stringify({ done: true }));
    log("PUT /api/tasks/:id", { ok: c3.ok, ms: c3.ms, content: c3.json?.done ? "done=true" : "?", err: c3.err || `code=${c3.code}` });
    const c4 = await req(`http://127.0.0.1:3000/api/tasks/${taskId}`, { method: "DELETE" });
    log("DELETE /api/tasks/:id", { ok: c4.ok, ms: c4.ms, content: c4.json?.ok ? "removed" : "?", err: c4.err || `code=${c4.code}` });
  }

  // ─── § 3 · LLM 真用 (decompose / parallel / sp) ───
  console.log(C.B("\n§ 3 · :3000 demo LLM 真用\n"));
  const dec = await req("http://127.0.0.1:3000/api/llm/decompose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    timeout: 60000,
  }, JSON.stringify({ title: "做一个反代项目" }));
  log("POST /api/llm/decompose (4.7)", {
    ok: dec.ok && dec.json?.ok,
    ms: dec.ms,
    content: dec.json?.subtasks ? `${dec.json.subtasks.length} 子任务` : (dec.json?.raw ? dec.json.raw.slice(0, 30) : ""),
    err: dec.err || `code=${dec.code}`,
  });

  const par = await req("http://127.0.0.1:3000/api/llm/parallel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    timeout: 90000,
  }, JSON.stringify({ prompt: "反者道之动·一句答" }));
  if (par.ok && par.json) {
    const r1 = par.json.results["claude-sonnet-4-7"] || {};
    const r2 = par.json.results["gpt-5-5"] || {};
    log("POST /api/llm/parallel (双模)", {
      ok: par.json.summary.bothOk,
      ms: par.ms,
      content: `4.7=${r1.ok ? "✓" : "✗"} gpt5.5=${r2.ok ? "✓" : "✗"}`,
    });
  } else {
    log("POST /api/llm/parallel (双模)", { ok: false, ms: par.ms, err: par.err || `code=${par.code}` });
  }

  const sp = await req("http://127.0.0.1:3000/api/llm/sp", { timeout: 5000 });
  log("GET /api/llm/sp (现 SP)", {
    ok: sp.ok,
    ms: sp.ms,
    content: sp.json?.strategy ? `strategy=${sp.json.strategy}` : "?",
    err: sp.err || `code=${sp.code}`,
  });

  // ─── § 4 · /v1/models 取 (228 模) ───
  console.log(C.B("\n§ 4 · 模列\n"));
  const mdl = await req("http://127.0.0.1:7790/v1/models", { timeout: 5000 });
  log("GET 7790 /v1/models", {
    ok: mdl.ok,
    ms: mdl.ms,
    content: mdl.json?.data ? `${mdl.json.data.length} 模` : "?",
    err: mdl.err || `code=${mdl.code}`,
  });

  // ─── 总汇 ───
  console.log(C.BO(`\n═══ 总汇 ═══`));
  const total = RESULTS.passed + RESULTS.failed;
  const rate = total ? Math.round((RESULTS.passed / total) * 100) : 0;
  console.log(`  全 ${RESULTS.passed}/${total} = ${rate}% · 耗 ${(Date.now() - t0) / 1000}s`);
  if (RESULTS.failed > 0) {
    console.log(C.Y("  失:"));
    RESULTS.details.filter((r) => !r.ok).forEach((r) => {
      console.log(C.R(`    · ${r.label} · ${r.err || "?"}`));
    });
  }

  // 写 evidence
  const out = path.join(__dirname, "_yin161_evidence.json");
  fs.writeFileSync(out, JSON.stringify({
    timestamp: new Date().toISOString(),
    seal: "印 161 · 全链路一字真验",
    summary: { passed: RESULTS.passed, failed: RESULTS.failed, total, rate },
    details: RESULTS.details,
    elapsedMs: Date.now() - t0,
  }, null, 2));
  console.log(C.GR(`\n  evidence: ${out}`));
})().catch((e) => {
  console.error("✗ FATAL:", e.message);
  process.exit(1);
});
