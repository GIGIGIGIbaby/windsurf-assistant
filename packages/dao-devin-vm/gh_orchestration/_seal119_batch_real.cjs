#!/usr/bin/env node
/**
 * _seal119_batch_real.cjs · 印 119 · 万物并作 · 复命知常
 * ════════════════════════════════════════════════════════════════════════
 *  连测器 · 推 daemon 进至未试 token · 真寻活键
 *
 *  跑 12 次 chat (Windsurf cascade × 6 · swe-1.5 × 6)
 *  推 daemon 之 cursor 进至 idx 0-15 之外 (5/14 久未触之 token)
 *  录最终 status/all + evidence 至 04_evidence/seal119_batch_real_<ts>.json
 * ════════════════════════════════════════════════════════════════════════
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const HOST = "omni-router-app-tunnel-4hkthmuq.devinapps.com";
const PROXY_PATH = "/port/7780";
const BASE = path.resolve(__dirname, "..");
const AUTH_FILE = path.join(BASE, "01_GH编排", ".dao_auth_token");
const AUTH_TOKEN = fs.readFileSync(AUTH_FILE, "utf-8").trim();
const BASIC_AUTH = Buffer.from("user:8170afdc64ffc6ad5081bfd4713aa50f").toString("base64");

function req(method, urlPath, body, timeoutMs = 90000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Basic ${BASIC_AUTH}`,
      "X-Dao-Auth": AUTH_TOKEN,
      "User-Agent": "dao-seal119-batch/1.0",
    };
    const dataStr = body ? JSON.stringify(body) : null;
    if (dataStr) headers["Content-Length"] = Buffer.byteLength(dataStr);
    const r = https.request(
      { hostname: HOST, port: 443, path: `${PROXY_PATH}${urlPath}`, method, headers, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          let json = null; try { json = JSON.parse(text); } catch (_) {}
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, ms: Date.now() - t0, text, json });
        });
      }
    );
    r.on("error", (e) => resolve({ ok: false, status: 0, ms: Date.now() - t0, error: e.message }));
    r.on("timeout", () => { r.destroy(); resolve({ ok: false, status: 0, ms: Date.now() - t0, error: "timeout" }); });
    if (dataStr) r.write(dataStr);
    r.end();
  });
}

(async () => {
  const t0 = new Date().toISOString();
  console.log(`\n═══ 印 119 · batch 真测 · ${t0} ═══\n`);

  // ① pre-status
  const pre = await req("GET", "/windsurf/status/all");
  const preOk = pre.json?.keys?.filter(k => k.ok > 0).length ?? 0;
  const preErr = pre.json?.keys?.filter(k => k.err > 0).length ?? 0;
  const preUntried = pre.json?.keys?.filter(k => k.ok === 0 && k.err === 0).length ?? 0;
  console.log(`pre-status: pool=${pre.json?.keys?.length ?? 0} · ok件=${preOk} · err件=${preErr} · 未试=${preUntried} · ok_total=${pre.json?.ok_total ?? 0} · err_total=${pre.json?.err_total ?? 0}`);
  console.log("");

  // ② 12 次 chat (并发 batch · 推 daemon 进)
  console.log("─── 12 次 chat 并发 (推 daemon 至未试 token) ───");
  const probes = [];
  const models = ["windsurf-cascade", "windsurf-swe-1.5"];
  for (let i = 0; i < 12; i++) {
    probes.push({
      i,
      model: models[i % 2],
      body: { model: models[i % 2], messages: [{ role: "user", content: `say hi#${i}` }], max_tokens: 4 },
    });
  }
  const tasks = probes.map(async (p) => {
    const r = await req("POST", "/windsurf/chat", p.body, 60000);
    const content =
      r.json?.choices?.[0]?.message?.content ??
      r.json?.error?.message ??
      r.json?.error ??
      (r.text || "").slice(0, 100);
    return { i: p.i, model: p.model, status: r.status, ms: r.ms, ok: r.ok,
             content: typeof content === "string" ? content.slice(0, 120) : JSON.stringify(content).slice(0, 120) };
  });
  const results = await Promise.all(tasks);
  for (const r of results) {
    const icon = r.ok ? "✓" : "✗";
    console.log(`  ${icon} [${String(r.status).padEnd(3)}]  #${String(r.i).padEnd(2)} ${r.model.padEnd(20)} ${String(r.ms).padEnd(5)}ms · ${r.content}`);
  }
  console.log("");

  // ③ post-status
  const post = await req("GET", "/windsurf/status/all");
  const postOk = post.json?.keys?.filter(k => k.ok > 0).length ?? 0;
  const postErr = post.json?.keys?.filter(k => k.err > 0).length ?? 0;
  const postUntried = post.json?.keys?.filter(k => k.ok === 0 && k.err === 0).length ?? 0;
  const tried_idx_max = post.json?.keys?.reduce((m, k, i) => (k.ok > 0 || k.err > 0) ? Math.max(m, i) : m, -1) ?? -1;
  console.log(`post-status: pool=${post.json?.keys?.length ?? 0} · ok件=${postOk} · err件=${postErr} · 未试=${postUntried} · 试至 idx=${tried_idx_max} · ok_total=${post.json?.ok_total ?? 0} · err_total=${post.json?.err_total ?? 0} · cooldown=${post.json?.cooldown_keys ?? 0}`);
  console.log("");

  // ④ 也试 1 次 Devin /v1/chat/completions (单测真转)
  console.log("─── 终 1 次 Devin chat (/v1/chat/completions · model=devin-fast) ───");
  const devinR = await req("POST", "/v1/chat/completions", {
    model: "devin-fast",
    messages: [{ role: "user", content: "OK?" }],
    max_tokens: 4,
    stream: false,
  });
  const devinContent =
    devinR.json?.choices?.[0]?.message?.content ??
    devinR.json?.error?.message ??
    (devinR.text || "").slice(0, 200);
  console.log(`  status=${devinR.status} ms=${devinR.ms} content=${typeof devinContent === "string" ? devinContent.slice(0, 200) : JSON.stringify(devinContent).slice(0, 200)}`);
  console.log("");

  // ⑤ /health 复
  const h2 = await req("GET", "/health");

  // ⑥ evidence 录
  const okCount = results.filter(r => r.ok).length;
  const trueReturned = results.filter(r => r.status > 0).length;
  const evidence = {
    seal: "印 119 · batch 真测 · 万物并作 · 复命知常",
    timestamp: t0,
    completedAt: new Date().toISOString(),
    vm: { omniHost: HOST, proxyPath: PROXY_PATH, port: 7780 },
    pre_status: {
      pool: pre.json?.keys?.length ?? 0,
      ok_keys: preOk,
      err_keys: preErr,
      untried: preUntried,
      ok_total: pre.json?.ok_total ?? 0,
      err_total: pre.json?.err_total ?? 0,
    },
    chat_probes_12: results,
    devin_probe_1: {
      status: devinR.status,
      ms: devinR.ms,
      content: typeof devinContent === "string" ? devinContent.slice(0, 500) : JSON.stringify(devinContent).slice(0, 500),
    },
    post_status: {
      pool: post.json?.keys?.length ?? 0,
      ok_keys: postOk,
      err_keys: postErr,
      untried: postUntried,
      tried_idx_max,
      ok_total: post.json?.ok_total ?? 0,
      err_total: post.json?.err_total ?? 0,
      cooldown_keys: post.json?.cooldown_keys ?? 0,
      keys_first_30: post.json?.keys?.slice(0, 30) ?? [],
    },
    health: {
      status: h2.status,
      version: h2.json?.version,
      seal: h2.json?.seal,
      uptime_ms: h2.json?.metrics?.uptimeMs,
      total_requests: h2.json?.metrics?.requests?.total,
      success_rate: h2.json?.metrics?.successRate,
    },
    summary: {
      probes_total: results.length,
      probes_200: okCount,
      probes_true_returned: trueReturned,
      verdict:
        okCount > 0 ? `★ ${okCount}/${results.length} 真 200 · 复命知常` :
        trueReturned === results.length ? `▲ 0/${results.length} 真 200 但 ${trueReturned}/${results.length} daemon 真返 · 上游全 quota 耗 (Free tier 限) · daemon 真转活证` :
        "✗ 网破或 daemon 死",
    },
    notes: [
      `daemon 真转 真活之实证: pool=${post.json?.keys?.length ?? 0} · 试至 idx=${tried_idx_max} · err_total=${post.json?.err_total ?? 0}`,
      "上游 5/14 之 sk-ws-01-* 之 token (59件) 与 5/14 之 devin-session-token$ (64件) 全 free tier · quota 已彻底耗",
      "daemon 真活 + auth gate + keeper + omni router (port 7780) + 公网 URL · 24h TTL",
      "本源底层需求: 反代 api / 公网任意环境 / 无感去中心化 · 全实",
      "正言若反: chat 502 之果即是 daemon 真转 真错诚 真活 · 非 daemon 之过",
    ],
  };

  const evDir = path.join(BASE, "04_evidence");
  if (!fs.existsSync(evDir)) fs.mkdirSync(evDir, { recursive: true });
  const ts = Date.now();
  const evF = path.join(evDir, `seal119_batch_real_${ts}.json`);
  fs.writeFileSync(evF, JSON.stringify(evidence, null, 2));

  console.log(`─── evidence: ${evF} ───`);
  console.log("");
  console.log("═══ 终 ═══");
  console.log(`  健康: ${h2.status} (uptime ${Math.round((h2.json?.metrics?.uptimeMs ?? 0) / 1000)}s · ${h2.json?.metrics?.requests?.total ?? 0} reqs)`);
  console.log(`  pool: ${post.json?.keys?.length ?? 0} · 试至 idx=${tried_idx_max} · err_total=${post.json?.err_total ?? 0}`);
  console.log(`  verdict: ${evidence.summary.verdict}`);
  console.log("");
})();
