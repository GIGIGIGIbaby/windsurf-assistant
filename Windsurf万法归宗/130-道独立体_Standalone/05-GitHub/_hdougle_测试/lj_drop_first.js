// 反审一击 · 删 ACCOUNTS 中的 LJ#1 vpena (chat 502) · 让 setup 重试 LJ#2
const fs = require("fs");
const path = require("path");
const os = require("os");

const ACCOUNTS_FILE = path.join(os.homedir(), ".wam", "accounts.md");
const raw = fs.readFileSync(ACCOUNTS_FILE, "utf8");
const lj = [];
raw.split(/\r?\n/).forEach((line) => {
  const t = line.trim();
  if (!t || !t.includes("@") || !t.includes(" ")) return;
  const [mail, pw] = t.split(/\s+/);
  if (!mail || !pw || !pw.startsWith("LJ")) return;
  lj.push(`${mail}:${pw}`);
});

console.log("LJ 总数:", lj.length);
console.log("LJ#1 (待删):", lj[0].split(":")[0]);

// 方法 1: 不删账号文件 · 只换 ACCOUNTS secret · 跳过 dropEmail (默 vpena065913)
const dropEmail = process.argv[2] || "vpena065913@gmail.com";
const filtered = lj.filter((p) => !p.startsWith(dropEmail + ":"));
console.log(`过滤掉 ${dropEmail} → ${filtered.length} 个`);

const newAccountsValue = filtered.join(",");

// 用 set_secret_api · putSecret 直接写
const sodium = require(path.join(__dirname, "..", "node_modules", "libsodium-wrappers"));
const gh_curl = require("./gh_curl");

const TOKEN = fs.readFileSync(path.join(os.homedir(), ".dao", "hdougle", "token"), "utf8").trim();
const gh = gh_curl.make({ token: TOKEN, owner: "hdougle", repo: "windsurf-assistant" });

(async () => {
  const r1 = gh.get("/repos/hdougle/windsurf-assistant/actions/secrets/public-key");
  await sodium.ready;
  const pubBytes = sodium.from_base64(r1.body.key, sodium.base64_variants.ORIGINAL);
  const valueBytes = sodium.from_string(newAccountsValue);
  const enc = sodium.crypto_box_seal(valueBytes, pubBytes);
  const encStr = sodium.to_base64(enc, sodium.base64_variants.ORIGINAL);
  const r2 = gh.put("/repos/hdougle/windsurf-assistant/actions/secrets/ACCOUNTS", {
    encrypted_value: encStr,
    key_id: r1.body.key_id,
  });
  console.log(`PUT ACCOUNTS status=${r2.status}`);
  if (r2.status === 204) console.log(`✓ ACCOUNTS 已更新 · 现 ${filtered.length} 个`);

  // 删 DAO_JWT 让 setup 强重做认证
  const d1 = gh.delete("/repos/hdougle/windsurf-assistant/actions/secrets/DAO_JWT");
  console.log(`DELETE DAO_JWT status=${d1.status}`);
})();
