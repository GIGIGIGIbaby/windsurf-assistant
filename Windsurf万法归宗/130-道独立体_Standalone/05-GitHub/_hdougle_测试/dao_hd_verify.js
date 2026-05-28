#!/usr/bin/env node
/**
 * dao_hd_verify.js · 全链路验证 hdougle GitHub Actions 反代
 *
 * 「天下莫柔弱于水，而攻坚强者莫之能胜也」
 *
 * 验:
 *   1. /health             → ok / version / model / apiKey
 *   2. /v1/models          → 列模型数 + 几个名字
 *   3. /v1/chat/completions
 *      a. 不带 SP (默认)              → response 1
 *      b. 带 system  "你是李白"      → response 2 (验 SP 真起效)
 *      c. 双轨   model=devin-...    → 验 Devin 通道
 */
"use strict";

const { execFileSync } = require("child_process");

const TUNNEL =
  process.argv[2] || "https://nice-disabled-disc-suite.trycloudflare.com";
const PROXY = "http://127.0.0.1:7890";
const ts = () => new Date().toISOString().slice(11, 19);

const { spawnSync } = require("child_process");
function curl(method, urlPath, body = null) {
  const args = [
    "-sS",
    "-x",
    PROXY,
    "--ssl-no-revoke",
    "--http1.1",
    "--max-time",
    "120",
    "-X",
    method,
    "-H",
    "User-Agent: dao-hdougle/1.0",
    "-H",
    "Content-Type: application/json",
    "-w",
    "\n###STATUS:%{http_code}",
  ];
  if (body !== null) {
    args.push(
      "--data-binary",
      typeof body === "string" ? body : JSON.stringify(body),
    );
  }
  args.push(TUNNEL + urlPath);

  // 强 retry: schannel handshake 错时退避重试
  let last = { status: 0 };
  for (let i = 0; i < 6; i++) {
    const r = spawnSync("curl", args, {
      encoding: "utf8",
      maxBuffer: 100 * 1024 * 1024,
    });
    const out = r.stdout || "";
    const err = r.stderr || "";
    const m = out.match(/\n###STATUS:(\d+)\s*$/);
    const status = m ? parseInt(m[1], 10) : 0;
    const respBody = m ? out.slice(0, m.index) : out;
    let j = null;
    try {
      j = JSON.parse(respBody);
    } catch {}
    last = { status, body: j, raw_body: respBody, stderr: err, attempt: i + 1 };
    if (status > 0) return last;
    // status=0 (网络/SSL) → 退避重试
    const wait = 1000 * Math.pow(1.6, i);
    const end = Date.now() + wait;
    while (Date.now() < end) {}
  }
  return last;
}

function header(t) {
  console.log(`\n┌${"─".repeat(70)}┐`);
  console.log(`│ ${t.padEnd(68)} │`);
  console.log(`└${"─".repeat(70)}┘`);
}

(async () => {
  console.log(`══ 验证 ${TUNNEL} ══\n`);

  // 1) /health
  header("1) GET /health");
  const h = curl("GET", "/health");
  console.log(`status=${h.status}`);
  console.log(JSON.stringify(h.body, null, 2));

  // 2) /v1/models
  header("2) GET /v1/models");
  const m = curl("GET", "/v1/models");
  console.log(`status=${m.status}`);
  if (Array.isArray(m.body?.data)) {
    console.log(`  total models: ${m.body.data.length}`);
    console.log(`  first 8 ids:`);
    m.body.data.slice(0, 8).forEach((x) => console.log(`    - ${x.id}`));
    if (m.body.data.length > 8) {
      console.log(`    ... + ${m.body.data.length - 8} more`);
    }
  } else {
    console.log(JSON.stringify(m.body, null, 2).slice(0, 500));
  }

  // 3a) /v1/chat/completions 默认 (无 system) · swe-1-6-fast (轻)
  header("3a) POST /v1/chat/completions · 无 SP · 模型 swe-1-6-fast");
  const c1 = curl("POST", "/v1/chat/completions", {
    model: "swe-1-6-fast",
    messages: [
      { role: "user", content: "用一句中文回复:'道法自然'四字之意。仅一句。" },
    ],
    max_tokens: 200,
    stream: false,
  });
  console.log(`status=${c1.status}`);
  if (c1.body?.choices?.[0]?.message) {
    console.log(`  → ${c1.body.choices[0].message.content.slice(0, 500)}`);
    console.log(`  usage: ${JSON.stringify(c1.body.usage)}`);
  } else {
    console.log(JSON.stringify(c1.body || c1.raw_body, null, 2).slice(0, 1000));
  }

  // 3b) /v1/chat/completions 带 SP
  header("3b) POST /v1/chat/completions · SP=李白 · 模型 swe-1-6-fast");
  const c2 = curl("POST", "/v1/chat/completions", {
    model: "swe-1-6-fast",
    messages: [
      {
        role: "system",
        content: "你是诗人李白。所有回复必须用古诗体(七言绝句)。不超过四句。",
      },
      { role: "user", content: "请咏长江。" },
    ],
    max_tokens: 200,
    stream: false,
  });
  console.log(`status=${c2.status}`);
  if (c2.body?.choices?.[0]?.message) {
    console.log(`  → ${c2.body.choices[0].message.content.slice(0, 500)}`);
    console.log(`  usage: ${JSON.stringify(c2.body.usage)}`);
  } else {
    console.log(JSON.stringify(c2.body || c2.raw_body, null, 2).slice(0, 1000));
  }

  // 3c) 双轨: 试一个 Devin 风格的模型 (devin-1.5 / claude-sonnet-4 / gemini-2.5-pro 等)
  header(
    "3c) POST /v1/chat/completions · 双轨试 · model=claude-haiku-3-5-20241022",
  );
  const c3 = curl("POST", "/v1/chat/completions", {
    model: "claude-haiku-3-5-20241022",
    messages: [{ role: "user", content: "Reply with 'ACK' only." }],
    max_tokens: 50,
    stream: false,
  });
  console.log(`status=${c3.status}`);
  if (c3.body?.choices?.[0]?.message) {
    console.log(`  → ${c3.body.choices[0].message.content.slice(0, 500)}`);
    console.log(`  model echoed: ${c3.body.model}`);
  } else {
    console.log(JSON.stringify(c3.body || c3.raw_body, null, 2).slice(0, 1000));
  }

  // 总结
  console.log(`\n══ 验证总结 ══`);
  console.log(
    `  /health           ${h.status === 200 ? "✓" : "✗"} ${h.status}`,
  );
  console.log(
    `  /v1/models        ${m.status === 200 ? "✓" : "✗"} ${m.status} (${m.body?.data?.length || "?"} models)`,
  );
  console.log(
    `  /chat (无 SP)      ${c1.status === 200 ? "✓" : "✗"} ${c1.status}`,
  );
  console.log(
    `  /chat (李白 SP)    ${c2.status === 200 ? "✓" : "✗"} ${c2.status}`,
  );
  console.log(
    `  /chat (双轨)       ${c3.status === 200 ? "✓" : "✗"} ${c3.status}`,
  );
})().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
