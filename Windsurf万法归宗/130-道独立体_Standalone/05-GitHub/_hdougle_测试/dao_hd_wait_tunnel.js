#!/usr/bin/env node
/**
 * dao_hd_wait_tunnel.js · 等待 proxy job 启动并抓 Cloudflare tunnel URL
 * 「执大象，天下往。」「水之胜刚也」
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const m = require("./gh_curl");

const TOKEN = fs
  .readFileSync(path.join(os.homedir(), ".dao", "hdougle", "token"), "utf8")
  .trim();
const OWNER = "hdougle";
const REPO = "windsurf-assistant";

// 从 argv 或 last_run.json 读 RUN_ID · GIST_ID 从 argv 或 自动扫 hdougle 全部 gist 找最新含 dao-pool.json 的
const LAST_RUN_FILE = path.join(
  os.homedir(),
  ".dao",
  "hdougle",
  "last_run.json",
);
let RUN_ID = process.argv[3] || null;
if (!RUN_ID && fs.existsSync(LAST_RUN_FILE)) {
  try {
    const j = JSON.parse(fs.readFileSync(LAST_RUN_FILE, "utf8"));
    RUN_ID = j.runId;
  } catch {}
}
if (!RUN_ID) RUN_ID = "26528636835"; // 老 fallback

let GIST_ID = process.argv[2] || null;
// auto: 如不传 GIST_ID · 后面 main() 会扫全部 gist 找最新
if (!GIST_ID) {
  console.log(
    `[init] GIST_ID 未传 · 后续会扫 hdougle 全部 gist 找最新 dao-pool.json`,
  );
}

const gh = m.make({ token: TOKEN, owner: OWNER, repo: REPO });
const ts = () => new Date().toISOString().slice(11, 19);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readGist() {
  const r = gh.get(`/gists/${GIST_ID}`);
  if (!r.ok || !r.body)
    return {
      ok: false,
      status: r.status,
      error: r.error || r.raw_body?.slice(0, 200),
    };
  const files = r.body.files || {};
  const out = { ok: true, files: {} };
  for (const [name, f] of Object.entries(files)) {
    out.files[name] = { size: f.size, content: f.content };
  }
  return out;
}

async function readJob(jobId) {
  const r = gh.get(`/repos/${OWNER}/${REPO}/actions/jobs/${jobId}`);
  if (!r.ok) return null;
  return r.body;
}

async function readRun(runId) {
  const r = gh.get(`/repos/${OWNER}/${REPO}/actions/runs/${runId}`);
  if (!r.ok) return null;
  return r.body;
}

async function listJobs(runId) {
  const r = gh.get(`/repos/${OWNER}/${REPO}/actions/runs/${runId}/jobs`);
  if (!r.ok) return [];
  return r.body?.jobs || [];
}

async function findLatestDaoGist() {
  const r = gh.get(`/gists?per_page=30`);
  if (!r.ok || !Array.isArray(r.body)) return null;
  const cands = r.body.filter((g) => {
    if (!g.files) return false;
    const names = Object.keys(g.files);
    return (
      names.some((n) => /dao-pool|tunnel|sessionToken/i.test(n)) ||
      /dao|windsurf|hdougle/i.test(g.description || "")
    );
  });
  if (cands.length === 0) return null;
  cands.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  return cands[0].id;
}

async function main() {
  // 自动找 GIST_ID 如果未传
  if (!GIST_ID) {
    console.log(`[${ts()}] 自动扫 hdougle 全部 gist 找最新含 dao-pool ...`);
    for (let i = 0; i < 30; i++) {
      const found = await findLatestDaoGist();
      if (found) {
        GIST_ID = found;
        console.log(`[${ts()}] ✓ 自动选定 GIST_ID=${GIST_ID}`);
        break;
      }
      process.stdout.write(
        `\r[${ts()}]   未找到 dao gist · 等 setup 创建 (${i + 1}/30)`,
      );
      await sleep(5000);
    }
    process.stdout.write("\n");
    if (!GIST_ID) {
      console.log(
        `[${ts()}] ✗ 2.5 分钟未找到 dao gist · setup 可能失败 · 看 https://github.com/${OWNER}/${REPO}/actions/runs/${RUN_ID}`,
      );
      process.exit(1);
    }
  }

  console.log(
    `[${ts()}] ══ 等 ${OWNER}/${REPO} run #${RUN_ID} 的 proxy job 起 + 抓 Cloudflare tunnel URL ══`,
  );
  console.log(`[${ts()}]   gist=${GIST_ID}`);

  // 1) 先读初始 Gist
  console.log(`\n[${ts()}] [初始] 读 gist ...`);
  const initGist = await readGist();
  if (initGist.ok) {
    for (const [name, f] of Object.entries(initGist.files)) {
      console.log(`[${ts()}]   gist 文件: ${name} (${f.size}B)`);
      const head = (f.content || "").slice(0, 200).replace(/\n/g, " | ");
      console.log(`[${ts()}]     head: ${head}`);
    }
  } else {
    console.log(
      `[${ts()}]   读 gist 失败: ${JSON.stringify(initGist).slice(0, 200)}`,
    );
  }

  // 2) 轮询直到 gist 中出现 tunnel URL (https://*.trycloudflare.com)
  console.log(`\n[${ts()}] [轮询] 等 cloudflared tunnel URL ...`);
  const startAt = Date.now();
  let lastJobStatus = "";
  let lastFiles = "";

  for (let i = 0; i < 60; i++) {
    // 最多 5 分钟
    await sleep(5000);

    // 看 jobs 状态
    const jobs = await listJobs(RUN_ID);
    const proxyJob = jobs.find((j) => /Step2|proxy|代理/.test(j.name));
    if (proxyJob) {
      const status = `${proxyJob.status}/${proxyJob.conclusion || "-"}`;
      if (status !== lastJobStatus) {
        console.log(
          `\n[${ts()}]   proxy job: ${status} · steps=${(proxyJob.steps || []).length}`,
        );
        for (const s of proxyJob.steps || []) {
          console.log(
            `[${ts()}]     · ${s.name} ${s.status}/${s.conclusion || "-"}`,
          );
        }
        lastJobStatus = status;
      }
    }

    // 读 gist 看 tunnel URL
    const gd = await readGist();
    if (gd.ok) {
      const filesStr = Object.keys(gd.files).join(",");
      if (filesStr !== lastFiles) {
        console.log(`\n[${ts()}]   gist 文件: ${filesStr || "(空)"}`);
        lastFiles = filesStr;
      }

      for (const [name, f] of Object.entries(gd.files)) {
        const c = f.content || "";
        // tunnel URL 检测
        const m1 = c.match(/https?:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        const m2 = c.match(/https?:\/\/[a-z0-9-]+\.cfargotunnel\.com/i);
        if (m1 || m2) {
          const url = (m1 || m2)[0];
          console.log(`\n[${ts()}] ✓ Tunnel URL 找到: ${url}`);
          console.log(`[${ts()}]   来源 gist 文件: ${name}`);

          // 打印完整 gist 内容供参考
          console.log(`\n══ Gist 文件全貌 ══`);
          for (const [n, ff] of Object.entries(gd.files)) {
            console.log(`\n--- ${n} (${ff.size}B) ---`);
            console.log((ff.content || "").slice(0, 1500));
          }

          // 立刻验证 tunnel
          console.log(`\n[${ts()}] [验证] /health ...`);
          await sleep(2000);
          const { execFileSync } = require("child_process");
          try {
            const r = execFileSync(
              "curl",
              [
                "-sS",
                "-x",
                "http://127.0.0.1:7890",
                "--ssl-no-revoke",
                "--http1.1",
                "--max-time",
                "30",
                "-w",
                "\nSTATUS:%{http_code}",
                `${url}/health`,
              ],
              { encoding: "utf8" },
            );
            console.log(`[${ts()}]   /health response: ${r.slice(0, 1000)}`);
          } catch (e) {
            console.log(`[${ts()}]   /health 失败: ${e.message}`);
          }
          return { ok: true, url, gist: gd.files };
        }
      }
    }

    const elapsed = Math.round((Date.now() - startAt) / 1000);
    process.stdout.write(`\r[${ts()}]   waiting ... (${elapsed}s)    `);
  }

  console.log(
    `\n[${ts()}] ✗ 5 分钟未抓到 tunnel URL · 看 https://github.com/${OWNER}/${REPO}/actions/runs/${RUN_ID}`,
  );
  return { ok: false };
}

main()
  .then((r) => {
    console.log("\n══ 结果 ══");
    if (r.ok) {
      console.log(`tunnel: ${r.url}`);
    }
    process.exit(r.ok ? 0 : 1);
  })
  .catch((e) => {
    console.error("✗ " + e.stack);
    process.exit(1);
  });
