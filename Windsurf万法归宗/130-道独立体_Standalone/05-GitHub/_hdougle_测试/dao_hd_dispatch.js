#!/usr/bin/env node
/**
 * dao_hd_dispatch.js · 触发 hdougle/windsurf-assistant 的 dao-boot.yml
 * + 轮询 run 状态 + 抓 Gist URL
 *
 * 「执大象，天下往。」「天下之至柔，驰骋于天下之致坚。」
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const gh_curl = require("./gh_curl");

const TOKEN = fs
  .readFileSync(path.join(os.homedir(), ".dao", "hdougle", "token"), "utf8")
  .trim();
const OWNER = "hdougle";
const REPO = "windsurf-assistant";
const BRANCH = "main";
const WORKFLOW = "dao-boot.yml";

const gh = gh_curl.make({
  token: TOKEN,
  owner: OWNER,
  repo: REPO,
  branch: BRANCH,
});

const ts = () => new Date().toISOString().slice(11, 19);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`[${ts()}] ══ 触发 ${OWNER}/${REPO}/${WORKFLOW} ══`);

  // 0) 验证仓库 actions 启用
  console.log(`[${ts()}] 探 Actions 状态 ...`);
  const actionsEnabled = gh.get(`/repos/${OWNER}/${REPO}/actions/permissions`);
  console.log(
    `[${ts()}]   status=${actionsEnabled.status} · enabled=${actionsEnabled.body?.enabled} · level=${actionsEnabled.body?.allowed_actions || actionsEnabled.body?.access_level || "?"}`,
  );
  if (actionsEnabled.body && actionsEnabled.body.enabled === false) {
    console.log(`[${ts()}] ⚠ Actions 已禁用 · 启用之 ...`);
    const en = gh.put(`/repos/${OWNER}/${REPO}/actions/permissions`, {
      enabled: true,
      allowed_actions: "all",
    });
    console.log(`[${ts()}]   put status=${en.status}`);
  }

  // 1) 列已有 runs (取最近一次比对)
  console.log(`[${ts()}] 列 dao-boot 历史 runs ...`);
  const oldRuns = gh.get(
    `/repos/${OWNER}/${REPO}/actions/workflows/${encodeURIComponent(WORKFLOW)}/runs?per_page=3`,
  );
  const oldRunIds = new Set();
  if (oldRuns.ok && oldRuns.body && Array.isArray(oldRuns.body.workflow_runs)) {
    for (const r of oldRuns.body.workflow_runs) {
      oldRunIds.add(r.id);
      console.log(
        `[${ts()}]   pre #${r.id} ${r.status}/${r.conclusion} · ${r.created_at} · ${r.html_url}`,
      );
    }
  } else {
    console.log(`[${ts()}]   list status=${oldRuns.status}`);
  }

  // 2) 触发 workflow_dispatch (mode=full)
  console.log(`[${ts()}] POST dispatches (mode=full) ...`);
  const disp = gh.post(
    `/repos/${OWNER}/${REPO}/actions/workflows/${encodeURIComponent(WORKFLOW)}/dispatches`,
    {
      ref: BRANCH,
      inputs: { mode: "full", accounts_override: "", gist_id: "" },
    },
  );
  console.log(`[${ts()}]   dispatch status=${disp.status}`);
  if (!disp.ok) {
    console.log(
      `[${ts()}]   ✗ 触发失败: ${JSON.stringify(disp.body || disp.raw_body || "").slice(0, 400)}`,
    );
    process.exit(1);
  }
  console.log(`[${ts()}]   ✓ dispatch 已发出 (204)`);

  // 3) 等 run 出现
  let newRun = null;
  for (let i = 0; i < 20; i++) {
    await sleep(2500);
    const r = gh.get(
      `/repos/${OWNER}/${REPO}/actions/workflows/${encodeURIComponent(WORKFLOW)}/runs?per_page=5`,
    );
    if (r.ok && Array.isArray(r.body?.workflow_runs)) {
      for (const w of r.body.workflow_runs) {
        if (!oldRunIds.has(w.id)) {
          newRun = w;
          break;
        }
      }
    }
    if (newRun) break;
    process.stdout.write(`\r[${ts()}]   等待新 run 出现 (${i + 1}/20)`);
  }
  process.stdout.write("\n");

  if (!newRun) {
    console.log(
      `[${ts()}] ✗ 等了 50s 没看到新 run · 可能延迟 · 自查 https://github.com/${OWNER}/${REPO}/actions`,
    );
    process.exit(1);
  }
  console.log(`[${ts()}] ✓ 新 run #${newRun.id} 已出现 · ${newRun.html_url}`);

  // 4) 持续轮询直到 setup job 完成 (proxy job 会跑 5h，不等)
  console.log(`[${ts()}] 轮询 run 状态 ...`);
  let lastStatus = "";
  let lastConclusion = "";
  for (let i = 0; i < 120; i++) {
    // 最多等 10 分钟
    await sleep(5000);
    const r = gh.get(`/repos/${OWNER}/${REPO}/actions/runs/${newRun.id}`);
    if (!r.ok || !r.body) {
      process.stdout.write(
        `\r[${ts()}]   probe failed · status=${r.status} (i=${i})`,
      );
      continue;
    }
    const status = r.body.status;
    const conclusion = r.body.conclusion;
    if (status !== lastStatus || conclusion !== lastConclusion) {
      console.log(
        `\n[${ts()}]   #${newRun.id} status=${status} conclusion=${conclusion || "-"}`,
      );
      lastStatus = status;
      lastConclusion = conclusion;
    } else {
      process.stdout.write(
        `\r[${ts()}]   #${newRun.id} status=${status} (${i})    `,
      );
    }

    // 取 jobs 看 setup 是否完成
    const jobs = gh.get(
      `/repos/${OWNER}/${REPO}/actions/runs/${newRun.id}/jobs`,
    );
    if (jobs.ok && Array.isArray(jobs.body?.jobs)) {
      const setupJob = jobs.body.jobs.find((j) =>
        /Step1|setup|认证/.test(j.name),
      );
      const proxyJob = jobs.body.jobs.find((j) =>
        /Step2|proxy|代理/.test(j.name),
      );
      if (setupJob) {
        if (setupJob.status === "completed") {
          console.log(
            `\n[${ts()}]   setup job: ${setupJob.status}/${setupJob.conclusion}`,
          );
          if (setupJob.conclusion === "success") {
            console.log(`[${ts()}] ✓ setup 完成 · 转入抓 Gist 阶段`);
            return {
              runId: newRun.id,
              runUrl: newRun.html_url,
              setupOk: true,
              jobs: jobs.body.jobs,
            };
          } else {
            console.log(`[${ts()}] ✗ setup 失败 · 看日志 ${newRun.html_url}`);
            return {
              runId: newRun.id,
              runUrl: newRun.html_url,
              setupOk: false,
              jobs: jobs.body.jobs,
            };
          }
        }
      }
    }

    if (status === "completed") {
      console.log(`\n[${ts()}]   run completed · conclusion=${conclusion}`);
      return {
        runId: newRun.id,
        runUrl: newRun.html_url,
        completed: true,
        conclusion,
      };
    }
  }

  console.log(
    `\n[${ts()}] ⚠ 10 分钟仍在跑 · 可能 proxy job 正常运行 · 后续手查 ${newRun.html_url}`,
  );
  return { runId: newRun.id, runUrl: newRun.html_url, timeout: true };
}

main()
  .then((r) => {
    console.log("\n══ 结果 ══");
    console.log(JSON.stringify(r, null, 2));
    // 写盘 last_run.json 供 wait_tunnel 读
    if (r && r.runId) {
      const out = path.join(os.homedir(), ".dao", "hdougle", "last_run.json");
      fs.writeFileSync(
        out,
        JSON.stringify(
          {
            runId: r.runId,
            runUrl: r.runUrl,
            setupOk: !!r.setupOk,
            at: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      console.log("  written: " + out);
    }
  })
  .catch((e) => {
    console.error("✗ " + e.stack);
    process.exit(1);
  });
