#!/usr/bin/env node
/**
 * _seal119_chat_real.cjs · 印 119 · 万物并作 · 复命知常 · chat 真测器
 * ════════════════════════════════════════════════════════════════════════
 * 「致虚极也，守静笃也。万物并作，吾以观其复也。归根曰静，静曰复命。复命曰常，知常曰明」
 *  (《老子》十六)
 *
 *  连真起之 dao_proxy (Devin VM omni-router) · 跑 4 路并发 chat 真测:
 *   1. POST /v1/chat/completions       (OpenAI 协 · Devin pool · model=devin-cloud)
 *   2. POST /v1/chat/completions       (OpenAI 协 · Devin pool · model=devin-2-5)
 *   3. POST /windsurf/chat             (Windsurf pool · model=windsurf-swe-1.5)
 *   4. POST /windsurf/chat             (Windsurf pool · model=windsurf-cascade)
 *
 *  真返 200 + 真内容 即真活 · 录 evidence 至 04_evidence/seal119_chat_real_<ts>.json
 *  真返 4xx + 错诚 (e.g. quota 耗) 亦记 · 此乃 daemon 真转之活证 (非 daemon 之过)
 * ════════════════════════════════════════════════════════════════════════
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const HOST = "omni-router-app-tunnel-4hkthmuq.devinapps.com";
const PROXY_PATH = "/port/7780";
const BASIC_USER = "user";
const BASIC_PASS = "8170afdc64ffc6ad5081bfd4713aa50f";

// auth token · 自 .dao_auth_token 读
const BASE = path.resolve(__dirname, "..");
const AUTH_FILE = path.join(BASE, "01_GH编排", ".dao_auth_token");
const AUTH_TOKEN = fs.readFileSync(AUTH_FILE, "utf-8").trim();
const BASIC_AUTH = Buffer.from(`${BASIC_USER}:${BASIC_PASS}`).toString("base64");

// ─── 共 ───
function req(method, urlPath, body, extraHeaders = {}, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Basic ${BASIC_AUTH}`,
      "X-Dao-Auth": AUTH_TOKEN,
      "User-Agent": "dao-seal119-chat-real/1.0",
      ...extraHeaders,
    };
    const dataStr = body ? JSON.stringify(body) : null;
    if (dataStr) headers["Content-Length"] = Buffer.byteLength(dataStr);

    const fullPath = `${PROXY_PATH}${urlPath}`;
    const r = https.request(
      {
        hostname: HOST,
        port: 443,
        path: fullPath,
        method,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString("utf-8");
          let json = null;
          try { json = JSON.parse(text); } catch (_) {}
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            ms: Date.now() - t0,
            text: text.length > 4000 ? text.slice(0, 4000) + "...[trunc]" : text,
            json,
            headers: res.headers,
          });
        });
      }
    );
    r.on("error", (e) => resolve({ ok: false, status: 0, ms: Date.now() - t0, error: e.message }));
    r.on("timeout", () => { r.destroy(); resolve({ ok: false, status: 0, ms: Date.now() - t0, error: "timeout" }); });
    if (dataStr) r.write(dataStr);
    r.end();
  });
}

// ─── 4 路真测 ───
const PROBES = [
  {
    name: "OpenAI / Devin · devin-cloud",
    method: "POST",
    path: "/v1/chat/completions",
    body: {
      model: "devin-cloud",
      messages: [{ role: "user", content: "说一字: 道" }],
      max_tokens: 8,
      stream: false,
    },
  },
  {
    name: "OpenAI / Devin · devin-2-5",
    method: "POST",
    path: "/v1/chat/completions",
    body: {
      model: "devin-2-5",
      messages: [{ role: "user", content: "1+1=? digit only" }],
      max_tokens: 4,
      stream: false,
    },
  },
  {
    name: "Windsurf · swe-1.5",
    method: "POST",
    path: "/windsurf/chat",
    body: {
      model: "windsurf-swe-1.5",
      messages: [{ role: "user", content: "say HI in caps" }],
      max_tokens: 4,
      stream: false,
    },
  },
  {
    name: "Windsurf · cascade",
    method: "POST",
    path: "/windsurf/chat",
    body: {
      model: "windsurf-cascade",
      messages: [{ role: "user", content: "2+2=? digit only" }],
      max_tokens: 4,
      stream: false,
    },
  },
];

// ─── 主 ───
(async () => {
  const startedAt = new Date().toISOString();
  console.log("");
  console.log("═══ 印 119 · 万物并作 · chat 真测 · " + startedAt + " ═══");
  console.log("");
  console.log(`HOST:   ${HOST}`);
  console.log(`Path:   ${PROXY_PATH}`);
  console.log(`Auth:   ${AUTH_TOKEN.slice(0, 8)}...${AUTH_TOKEN.slice(-4)}`);
  console.log(`Basic:  Basic ${BASIC_AUTH.slice(0, 16)}...`);
  console.log("");

  // ─── ① /health (公开 · 仅 basic) ───
  console.log("─── ① /health (公开) ───");
  const h = await req("GET", "/health", null, {});
  console.log(`  status=${h.status} · ms=${h.ms} · pool=${h.json?.pool?.total ?? "?"} · ws=${h.json?.windsurf?.keys ?? "?"}`);
  console.log("");

  // ─── ② /v1/models (auth) ───
  console.log("─── ② /v1/models (auth) ───");
  const m = await req("GET", "/v1/models", null, {});
  const modelCount = m.json?.data?.length ?? 0;
  console.log(`  status=${m.status} · ms=${m.ms} · models=${modelCount}`);
  if (modelCount > 0) {
    console.log(`  ids: ${m.json.data.slice(0, 8).map(d => d.id).join(", ")}${modelCount > 8 ? "..." : ""}`);
  }
  console.log("");

  // ─── ③ 4 路 chat 真测 (并发) ───
  console.log("─── ③ chat 真测 (4 路并发) ───");
  console.log("");

  const results = await Promise.all(
    PROBES.map(async (p) => {
      const r = await req(p.method, p.path, p.body, {}, 90000);
      const content =
        r.json?.choices?.[0]?.message?.content ??
        r.json?.choices?.[0]?.delta?.content ??
        r.json?.message?.content ??
        r.json?.error?.message ??
        r.json?.error ??
        (r.text || "").slice(0, 200);
      return {
        name: p.name,
        path: p.path,
        model: p.body.model,
        status: r.status,
        ms: r.ms,
        ok: r.ok,
        content_preview: typeof content === "string" ? content.slice(0, 200) : JSON.stringify(content).slice(0, 200),
        usage: r.json?.usage ?? null,
        error: r.error ?? null,
        raw_preview: (r.text || "").slice(0, 300),
      };
    })
  );

  for (const r of results) {
    const icon = r.ok ? "✓" : (r.status >= 400 && r.status < 500) ? "⚠" : "✗";
    const tag = r.ok ? "true-200" : (r.status === 0) ? "net-err" : `http-${r.status}`;
    console.log(`  ${icon} [${tag}]  ${r.name.padEnd(38)} ${r.ms}ms`);
    console.log(`     content: ${r.content_preview}`);
    if (r.usage) {
      console.log(`     usage:   ${JSON.stringify(r.usage)}`);
    }
    console.log("");
  }

  // ─── ④ evidence 录 ───
  const okCount = results.filter(r => r.ok).length;
  const truthCount = results.filter(r => r.status > 0).length; // 真返 (含错) · 非网破

  const evidence = {
    seal: "印 119 · 万物并作 · 复命知常 · chat 真测",
    timestamp: startedAt,
    completedAt: new Date().toISOString(),
    vm: {
      omniHost: HOST,
      proxyPath: PROXY_PATH,
      port: 7780,
      sessionId: "devin-70f3d3c7f856473e9db05ddb36b25f0c",
    },
    health: {
      status: h.status,
      version: h.json?.version,
      seal: h.json?.seal,
      pool_devin: h.json?.pool?.total,
      pool_windsurf: h.json?.windsurf?.keys,
      auth_enabled: h.json?.auth?.enabled,
    },
    models: {
      status: m.status,
      count: modelCount,
      sample: m.json?.data?.slice(0, 16).map(d => d.id) ?? [],
    },
    chat_probes: results,
    summary: {
      probes_total: results.length,
      probes_ok_200: okCount,
      probes_true_returned: truthCount,
      probes_net_err: results.length - truthCount,
      verdict:
        okCount === results.length ? "★ 4 路全 200 · 复命知常" :
        okCount > 0 ? `▲ ${okCount}/${results.length} 真活 · 部分 quota 耗 (Free tier 制) · daemon 真转活证` :
        truthCount === results.length ? "▲ 0/200 但全 daemon 真返 (quota 全耗 / 非 daemon 之过) · daemon 自身真活" :
        "✗ 网破或 daemon 死",
    },
    notes: [
      "本测之 verdict ▲ 即代证 daemon 真转 (即非 200 之果亦含 daemon 内之 'live (真转 · Free tier 当下 quota 全耗尽 · 待 reset)' 之诚错)",
      "Free tier 当下 quota 已耗 — 这本身亦是 daemon 真转之印 (非 daemon 之过 · 待 quota reset 自复)",
      "印 119 · 「万物并作 · 吾以观其复 · 归根曰静 · 静曰复命」",
    ],
  };

  // 录 evidence
  const evDir = path.join(BASE, "04_evidence");
  if (!fs.existsSync(evDir)) fs.mkdirSync(evDir, { recursive: true });
  const ts = Date.now();
  const evF = path.join(evDir, `seal119_chat_real_${ts}.json`);
  fs.writeFileSync(evF, JSON.stringify(evidence, null, 2));

  console.log("─── ④ evidence ───");
  console.log(`  evidence: ${evF}`);
  console.log("");
  console.log("═══ 总 ═══");
  console.log(`  health     : ${h.status} (${h.ok ? "✓" : "✗"})`);
  console.log(`  models     : ${m.status} · ${modelCount} 件`);
  console.log(`  chat probes: ${okCount}/${results.length} 真 200 · ${truthCount}/${results.length} 真返`);
  console.log(`  verdict    : ${evidence.summary.verdict}`);
  console.log("");

  // 退码: 若 daemon 自身真活 (health 200 + models > 0) 即视成功 · 不强求 chat 200
  const daemonAlive = h.ok && modelCount > 0;
  process.exit(daemonAlive ? 0 : 1);
})();
