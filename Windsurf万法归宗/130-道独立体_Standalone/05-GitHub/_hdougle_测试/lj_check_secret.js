// 用 hdougle PAT 列 hdougle/windsurf-assistant 之 secrets · 验 ACCOUNTS 存
const fs = require("fs");
const path = require("path");
const os = require("os");
const gh_curl = require("./gh_curl");

const TOKEN = fs
  .readFileSync(path.join(os.homedir(), ".dao", "hdougle", "token"), "utf8")
  .trim();

const gh = gh_curl.make({
  token: TOKEN,
  owner: "hdougle",
  repo: "windsurf-assistant",
});

const r = gh.get("/repos/hdougle/windsurf-assistant/actions/secrets");
console.log("status =", r.status);
if (r.body && Array.isArray(r.body.secrets)) {
  console.log("total  =", r.body.total_count);
  for (const s of r.body.secrets) {
    console.log(`  · ${s.name.padEnd(20)} updated=${s.updated_at}`);
  }
} else {
  console.log("body =", JSON.stringify(r.body || r.raw_body || "").slice(0, 500));
}
