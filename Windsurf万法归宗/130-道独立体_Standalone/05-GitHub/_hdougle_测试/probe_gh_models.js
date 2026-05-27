// probe_gh_models.js · 反者道之动 · 实证 GitHub Models API
//
//「天下之至柔，驰骋于天下之致坚；无有入于无间。」
//
// 旧道: dao_proxy → windsurf trial accounts → 502 resource_exhausted (133 全 frozen)
// 反道: dao_proxy → GitHub Models API → GITHUB_TOKEN 即用 (永久免费)
//
// 此器先实证 hdougle PAT 是否可直调 GH Models /chat/completions
// 端点: https://models.github.ai/inference/chat/completions  (新)
//   或: https://models.inference.ai.azure.com/chat/completions  (旧)
//
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const TOKEN = fs
  .readFileSync(path.join(os.homedir(), ".dao", "hdougle", "token"), "utf8")
  .trim();

const PROXY = process.env.DAO_PROXY_URL || "http://127.0.0.1:7890";

function curl(method, url, { body, extra = [], hdrs = {} } = {}) {
  const args = [
    "-sS",
    "-x",
    PROXY,
    "-X",
    method,
    "--max-time",
    "60",
    "--ssl-no-revoke",
    "--http1.1",
    "-w",
    "\n###CURL_STATUS:%{http_code}",
    "-H",
    `Authorization: Bearer ${TOKEN}`,
    "-H",
    `User-Agent: dao-probe/1.0`,
  ];
  for (const [k, v] of Object.entries(hdrs)) args.push("-H", `${k}: ${v}`);
  let tmp = null;
  if (body !== undefined) {
    args.push("-H", "Content-Type: application/json");
    tmp = path.join(
      os.tmpdir(),
      `probe_body_${Date.now()}_${Math.random().toString(36).slice(2)}.json`,
    );
    fs.writeFileSync(tmp, typeof body === "string" ? body : JSON.stringify(body));
    args.push("--data-binary", "@" + tmp);
  }
  args.push(...extra, url);
  try {
    const r = spawnSync("curl", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    const out = r.stdout || "";
    const m = out.match(/\n###CURL_STATUS:(\d+)\s*$/);
    const status = m ? parseInt(m[1], 10) : 0;
    const respBody = m ? out.slice(0, m.index) : out;
    let j = null;
    try {
      j = JSON.parse(respBody);
    } catch {}
    return { status, body: j, raw: respBody, stderr: r.stderr };
  } finally {
    if (tmp) try { fs.unlinkSync(tmp); } catch {}
  }
}

const TESTS = [
  // ── 1) 新端点 · 列模型
  {
    label: "GET https://models.github.ai/catalog/models",
    fn: () => curl("GET", "https://models.github.ai/catalog/models"),
  },
  // ── 2) 老 Azure 兼容端点 · 列模型
  {
    label: "GET https://models.inference.ai.azure.com/models",
    fn: () => curl("GET", "https://models.inference.ai.azure.com/models"),
  },
  // ── 3) 新端点 · OpenAI 风格 chat (gpt-4o-mini)
  {
    label: "POST https://models.github.ai/inference/chat/completions (openai/gpt-4o-mini)",
    fn: () =>
      curl("POST", "https://models.github.ai/inference/chat/completions", {
        body: {
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "Reply only: dao 1" }],
          max_tokens: 16,
          temperature: 0.1,
        },
      }),
  },
  // ── 4) 老 Azure 端点 · OpenAI 风格 chat
  {
    label: "POST https://models.inference.ai.azure.com/chat/completions (gpt-4o-mini)",
    fn: () =>
      curl("POST", "https://models.inference.ai.azure.com/chat/completions", {
        body: {
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "Reply only: dao 2" }],
          max_tokens: 16,
          temperature: 0.1,
        },
      }),
  },
  // ── 5) 新端点 · meta llama (公开免费)
  {
    label: "POST https://models.github.ai/inference/chat/completions (meta/Llama-3.3-70B)",
    fn: () =>
      curl("POST", "https://models.github.ai/inference/chat/completions", {
        body: {
          model: "meta/Llama-3.3-70B-Instruct",
          messages: [{ role: "user", content: "Reply only: dao 3" }],
          max_tokens: 16,
          temperature: 0.1,
        },
      }),
  },
  // ── 6) 新端点 · DeepSeek
  {
    label: "POST https://models.github.ai/inference/chat/completions (deepseek/DeepSeek-V3-0324)",
    fn: () =>
      curl("POST", "https://models.github.ai/inference/chat/completions", {
        body: {
          model: "deepseek/DeepSeek-V3-0324",
          messages: [{ role: "user", content: "Reply only: dao 4" }],
          max_tokens: 16,
          temperature: 0.1,
        },
      }),
  },
];

(function main() {
  console.log("══ 反者道之动 · GitHub Models API 实证 ══");
  console.log(`  token: ${TOKEN.slice(0, 10)}...${TOKEN.slice(-4)}`);
  console.log(`  proxy: ${PROXY}\n`);

  const results = [];
  for (const t of TESTS) {
    process.stdout.write(`▸ ${t.label}\n`);
    try {
      const r = t.fn();
      console.log(`    status=${r.status}`);
      if (r.body) {
        if (r.status >= 200 && r.status < 300) {
          // 成功
          if (Array.isArray(r.body)) {
            console.log(`    ✓ models list · count=${r.body.length}`);
            console.log(`      first 5:`);
            r.body.slice(0, 5).forEach((m) => {
              const id = m.id || m.name || m.publisher;
              console.log(`        ${id}`);
            });
          } else if (r.body.data && Array.isArray(r.body.data)) {
            console.log(`    ✓ models · count=${r.body.data.length}`);
          } else if (r.body.choices) {
            const c = r.body.choices?.[0]?.message?.content || JSON.stringify(r.body).slice(0, 200);
            console.log(`    ✓ AI 真答: "${c}"`);
          } else {
            console.log(`    ✓ body: ${JSON.stringify(r.body).slice(0, 300)}`);
          }
        } else {
          console.log(`    ✗ body: ${JSON.stringify(r.body).slice(0, 300)}`);
        }
      } else if (r.raw) {
        console.log(`    raw: ${r.raw.slice(0, 250)}`);
      }
      results.push({ label: t.label, status: r.status, ok: r.status >= 200 && r.status < 300 });
    } catch (e) {
      console.log(`    err: ${e.message}`);
      results.push({ label: t.label, error: e.message, ok: false });
    }
    console.log();
  }

  console.log("══ 总结 ══");
  results.forEach((r) =>
    console.log(`  ${r.ok ? "✓" : "✗"}  [${r.status || "ERR"}]  ${r.label}`),
  );

  const useful = results.filter((r) => r.ok);
  console.log(`\n  可用端点: ${useful.length}/${results.length}`);
})();
