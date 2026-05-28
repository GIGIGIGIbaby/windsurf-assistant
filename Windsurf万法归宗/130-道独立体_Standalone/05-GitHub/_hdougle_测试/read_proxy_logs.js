const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const TOKEN = fs
  .readFileSync(path.join(os.homedir(), ".dao", "hdougle", "token"), "utf8")
  .trim();

const RUN_ID = process.argv[2] || "26532250935";
const OWNER = "hdougle";
const REPO = "windsurf-assistant";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ghLog(jobId) {
  for (let i = 0; i < 6; i++) {
    try {
      const out = execFileSync(
        "curl",
        [
          "-sS",
          "--ssl-no-revoke",
          "--http1.1",
          "-x",
          "http://127.0.0.1:7890",
          "-H",
          `Authorization: Bearer ${TOKEN}`,
          "-H",
          "User-Agent: dao-hdougle/1.0",
          "-H",
          "Accept: application/vnd.github+json",
          "-L",
          `https://api.github.com/repos/${OWNER}/${REPO}/actions/jobs/${jobId}/logs`,
        ],
        { maxBuffer: 50 * 1024 * 1024 },
      ).toString("utf8");
      return out;
    } catch (e) {
      console.log(`  curl 失败 i=${i}: ${e.message.split("\n")[0]}`);
      await sleep(1000 + i * 800);
    }
  }
  throw new Error("ghLog 6 retries failed");
}

(async () => {
  const proxyJobId = process.argv[3] || "78151802297";
  const log = await ghLog(proxyJobId);
  console.log("total chars:", log.length);
  console.log("\n=== last 120 lines ===");
  const lines = log.split(/\r?\n/);
  // 看含 PROXY/CHAT/ERROR/AUTH/error 之关键行 + 最末 30 行
  const keys = lines.filter((l) =>
    /PROXY|CHAT|ERROR|AUTH|GIST|tunnel|trycloudflare|resource_exhausted|api\.|model|statusCode|trace_id|✓|✗|warn|fail/i.test(
      l,
    ),
  );
  console.log("关键行 ", keys.length);
  console.log(keys.slice(-100).join("\n"));
})().catch((e) => {
  console.error("✗", e.message);
});
