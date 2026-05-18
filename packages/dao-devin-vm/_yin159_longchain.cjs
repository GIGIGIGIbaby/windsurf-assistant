#!/usr/bin/env node
/**
 * _yin159_longchain.cjs · 印 159 · 一账号一 VM · 闭环长链路测
 *
 * 主公诏 (印 159 · 2026-05-19):
 *   「彻底打通 · 一账号一虚拟机 · 模型专注 4.7 + gpt5.5 长链路测试」
 *
 * 此件: 现 :7780 真本源 + 公网 URL 真本源 · 双口长链路 · 4 模 × 3 轮 = 12 笔
 *
 * 用:
 *   node _yin159_longchain.cjs
 *   node _yin159_longchain.cjs --rounds 5
 *   node _yin159_longchain.cjs --base http://127.0.0.1:7780
 *   node _yin159_longchain.cjs --base https://xxx.trycloudflare.com
 */
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const getArg = (n, def) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const ROUNDS = parseInt(getArg("rounds", "3"), 10);
const BASES = [
  { name: "本机 :7780", url: "http://127.0.0.1:7780" },
  {
    name: "公网 cf",
    url: "https://conditions-beaches-analyzed-compromise.trycloudflare.com",
  },
];
const overrideBase = getArg("base", null);
if (overrideBase) {
  BASES.length = 0;
  BASES.push({ name: "override", url: overrideBase });
}
const MODELS = ["claude-sonnet-4-7", "gpt-5-5"];
const TIMEOUT_MS = 90000;
const OUT = path.join(__dirname, "_yin159_result.json");

const C = {
  G: (s) => `\x1b[32m${s}\x1b[0m`,
  R: (s) => `\x1b[31m${s}\x1b[0m`,
  Y: (s) => `\x1b[33m${s}\x1b[0m`,
  B: (s) => `\x1b[36m${s}\x1b[0m`,
  GR: (s) => `\x1b[90m${s}\x1b[0m`,
  BO: (s) => `\x1b[1m${s}\x1b[0m`,
};

function ask(baseUrl, model, prompt) {
  return new Promise((resolve) => {
    const u = new URL(baseUrl + "/v1/chat/completions");
    const body = JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 80,
      stream: false,
    });
    const lib = u.protocol === "https:" ? https : http;
    const t0 = Date.now();
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const c = [];
        res.on("data", (d) => c.push(d));
        res.on("end", () => {
          const b = Buffer.concat(c).toString("utf8");
          const t = Date.now() - t0;
          let txt = "";
          let ok = false;
          try {
            const j = JSON.parse(b);
            if (j.choices && j.choices[0] && j.choices[0].message) {
              txt = (j.choices[0].message.content || "").replace(/\s+/g, " ");
              ok = true;
            } else if (j.error) {
              txt =
                "ERR " +
                (typeof j.error === "string"
                  ? j.error
                  : JSON.stringify(j.error).slice(0, 150));
            }
          } catch {
            txt = b.slice(0, 200);
          }
          resolve({ code: res.statusCode, ms: t, ok, txt });
        });
      },
    );
    req.on("error", (e) =>
      resolve({ code: 0, ms: Date.now() - t0, ok: false, txt: "NETERR " + e.message }),
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ code: 0, ms: Date.now() - t0, ok: false, txt: "TIMEOUT" });
    });
    req.write(body);
    req.end();
  });
}

const PROMPTS = [
  "用一字答道, 答曰?",
  "续上轮·解'反者道之动'之意, 限30字内",
  "终轮·总结此长链路要点, 限40字内",
  "再续·言'弱者道之用'之实, 限30字内",
  "末·一字封此链路",
];

(async () => {
  console.log(C.BO(`═══ 印 159 · 闭环长链路测 · ${new Date().toISOString()} ═══`));
  console.log(`  rounds=${ROUNDS} · models=${MODELS.join(", ")}`);
  console.log("");
  const allResults = [];
  for (const base of BASES) {
    console.log(C.B(`── ${base.name} · ${base.url} ──`));
    for (const m of MODELS) {
      console.log(C.GR(`  · 模 ${m}`));
      let okC = 0;
      let tSum = 0;
      const roundResults = [];
      for (let i = 0; i < ROUNDS; i++) {
        const prompt = PROMPTS[i % PROMPTS.length];
        const r = await ask(base.url, m, prompt);
        if (r.ok) {
          okC++;
          tSum += r.ms;
          const tShort = r.txt.slice(0, 60);
          console.log(
            C.G(`    R${i + 1} OK ${String(r.ms).padStart(6)}ms · ${tShort}`),
          );
        } else {
          console.log(
            C.R(`    R${i + 1} XX ${String(r.ms).padStart(6)}ms · code=${r.code} · ${r.txt.slice(0, 80)}`),
          );
        }
        roundResults.push({
          round: i + 1,
          model: m,
          base: base.name,
          ms: r.ms,
          code: r.code,
          ok: r.ok,
          textPreview: r.txt.slice(0, 200),
        });
      }
      const avg = okC > 0 ? Math.round(tSum / okC) : 0;
      console.log(`    汇 ${C.Y(`${okC}/${ROUNDS}`)} · 平均 ${avg}ms`);
      allResults.push(...roundResults);
    }
    console.log("");
  }

  // 总汇
  const total = allResults.length;
  const success = allResults.filter((r) => r.ok).length;
  const failPerBase = {};
  for (const b of BASES) failPerBase[b.name] = 0;
  for (const r of allResults)
    if (!r.ok) failPerBase[r.base] = (failPerBase[r.base] || 0) + 1;

  console.log(C.BO("═══ 总汇 ═══"));
  console.log(
    `  全 ${success}/${total} · 成率 ${((success / total) * 100).toFixed(1)}%`,
  );
  for (const k of Object.keys(failPerBase)) {
    console.log(`    ${k}: 失 ${failPerBase[k]}`);
  }

  const seal = {
    印: 159,
    title: "闭环长链路测 · 4.7 + 5.5 · 现 :7780 + 公网 cf",
    ts: new Date().toISOString(),
    rounds: ROUNDS,
    models: MODELS,
    bases: BASES.map((b) => b.name),
    total,
    success,
    successRate: ((success / total) * 100).toFixed(1),
    results: allResults,
  };
  fs.writeFileSync(OUT, JSON.stringify(seal, null, 2));
  console.log(C.G(`✓ evidence: ${OUT}`));
})();
