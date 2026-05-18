#!/usr/bin/env node
/**
 * _yin159_pubtest.cjs · 公网 :7790 真测 (短 prompt · timeout 150s)
 */
"use strict";
const https = require("https");
const PUB = "https://liable-public-wise-structured.trycloudflare.com";
const TIMEOUT = 150000;

function ask(path, body, headers = {}) {
  return new Promise((resolve) => {
    const u = new URL(PUB + path);
    const t0 = Date.now();
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json", ...headers },
        timeout: TIMEOUT,
      },
      (res) => {
        const c = [];
        res.on("data", (d) => c.push(d));
        res.on("end", () =>
          resolve({
            code: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(c).toString("utf8"),
            ms: Date.now() - t0,
          }),
        );
      },
    );
    req.on("error", (e) =>
      resolve({ code: 0, err: e.message, ms: Date.now() - t0 }),
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ code: 0, err: "timeout", ms: Date.now() - t0 });
    });
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  console.log("═══ 公网 :7790 fleet master 真测 ═══");
  console.log("URL:", PUB);
  console.log("");

  const h = await ask("/health");
  console.log("【1】GET /health · ms=" + h.ms + " · code=" + h.code);
  if (h.body) console.log("  " + h.body.slice(0, 250));
  console.log("");

  const fl = await ask("/fleet/list");
  console.log("【2】GET /fleet/list · ms=" + fl.ms + " · code=" + fl.code);
  if (fl.body) {
    try {
      const j = JSON.parse(fl.body);
      console.log(
        "  count=" + j.count + " alive=" + j.alive + " wam=" + j.wam_token_pool_count,
      );
    } catch {}
  }
  console.log("");

  const models = ["claude-sonnet-4-7", "gpt-5-5"];
  for (const m of models) {
    const body = JSON.stringify({
      model: m,
      messages: [{ role: "user", content: "答道一字" }],
      max_tokens: 30,
      stream: false,
    });
    const r = await ask("/v1/chat/completions", body);
    const ok = r.code === 200;
    const routed = r.headers && r.headers["x-fleet-routed"];
    console.log(
      "【3.${m}】" + (ok ? "✓" : "✗") + " /v1/chat · " + m + " · " + r.ms + "ms · code=" + r.code + " · routed=" + routed,
    );
    if (r.body) {
      try {
        const j = JSON.parse(r.body);
        if (j.choices && j.choices[0]) {
          console.log(
            "  ans: " +
              (j.choices[0].message.content || "").replace(/\s+/g, " "),
          );
        } else if (j.error) {
          console.log("  err: " + JSON.stringify(j.error).slice(0, 150));
        }
      } catch {
        console.log("  raw: " + r.body.slice(0, 100));
      }
    } else if (r.err) {
      console.log("  err: " + r.err);
    }
    console.log("");
  }
})();
