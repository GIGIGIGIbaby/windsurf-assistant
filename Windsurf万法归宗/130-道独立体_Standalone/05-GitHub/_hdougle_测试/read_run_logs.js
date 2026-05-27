// 读 hdougle/windsurf-assistant run logs (zip)
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");

const TOKEN = fs
  .readFileSync(path.join(os.homedir(), ".dao", "hdougle", "token"), "utf8")
  .trim();

const RUN_ID = process.argv[2] || "26532250935";
const OWNER = "hdougle";
const REPO = "windsurf-assistant";

function ghCurlText(urlPath, follow = true) {
  // 用 curl with proxy (本地环境必须经 :7890)
  const { execFileSync } = require("child_process");
  try {
    const args = [
      "-sS",
      "--ssl-no-revoke",
      "-x",
      "http://127.0.0.1:7890",
      "-H",
      `Authorization: Bearer ${TOKEN}`,
      "-H",
      "User-Agent: dao-hdougle/1.0",
      "-H",
      "Accept: application/vnd.github+json",
    ];
    if (follow) args.push("-L");
    args.push(`https://api.github.com${urlPath}`);
    return execFileSync("curl", args, { maxBuffer: 50 * 1024 * 1024 });
  } catch (e) {
    return null;
  }
}

(async () => {
  console.log(`Fetching jobs for run #${RUN_ID} ...`);
  const jobs = JSON.parse(
    ghCurlText(`/repos/${OWNER}/${REPO}/actions/runs/${RUN_ID}/jobs`).toString(
      "utf8",
    ),
  );
  for (const j of jobs.jobs || []) {
    console.log(`  · ${j.name}: ${j.status}/${j.conclusion} · job=${j.id}`);
  }

  const setupJob = (jobs.jobs || []).find((j) => /Step1|setup|认证/.test(j.name));
  if (!setupJob) {
    console.log("没找 setup job");
    return;
  }
  console.log(`\n=== Setup job logs (${setupJob.id}) ===`);
  const log = ghCurlText(`/repos/${OWNER}/${REPO}/actions/jobs/${setupJob.id}/logs`);
  if (!log) {
    console.log("✗ logs fetch failed");
    return;
  }
  const text = log.toString("utf8");
  // 关键行: 含 AUTH / SETUP / mask 标记
  const interesting = text.split(/\r?\n/).filter((l) =>
    /AUTH|SETUP|GIST|SECRET|cred|apiKey|账号|失败|✓|✗|Step\d+\/\d+/.test(l),
  );
  console.log(`总行数 ${text.split(/\n/).length} · 关键行 ${interesting.length}`);
  console.log("--- last 80 关键行 ---");
  interesting.slice(-80).forEach((l) => console.log(l));
})();
