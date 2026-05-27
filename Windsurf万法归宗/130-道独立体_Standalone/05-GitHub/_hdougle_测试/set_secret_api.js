#!/usr/bin/env node
/**
 * set_secret_api.js · 用 hdougle PAT 直走 GitHub Secrets API
 * ════════════════════════════════════════════════════════════════════════
 *
 * 「无有入于无间」「不召而自来」
 *
 * 优于 Playwright UI: 一次 HTTP PUT 直成 · 无 sudo · 无 list 检测假阴
 *
 * 用法:
 *   node set_secret_api.js NAME VALUE
 *   node set_secret_api.js --from-lj            # 拼 LJ 40 → ACCOUNTS
 *   node set_secret_api.js --list               # 列已存
 *
 * 凭借:
 *   PAT scope=repo (hdougle PAT 已含)
 *   libsodium-wrappers (装在 ../node_modules)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const gh_curl = require("./gh_curl");

const OWNER = "hdougle";
const REPO = "windsurf-assistant";

const TOKEN = fs
  .readFileSync(path.join(os.homedir(), ".dao", "hdougle", "token"), "utf8")
  .trim();
const gh = gh_curl.make({ token: TOKEN, owner: OWNER, repo: REPO });

// libsodium 在父级 node_modules
const sodium = require(
  path.join(__dirname, "..", "node_modules", "libsodium-wrappers"),
);

async function getPublicKey() {
  const r = gh.get(`/repos/${OWNER}/${REPO}/actions/secrets/public-key`);
  if (!r.ok)
    throw new Error(
      `public-key fetch failed: status=${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`,
    );
  return { key: r.body.key, keyId: r.body.key_id };
}

async function encrypt(publicKeyBase64, value) {
  await sodium.ready;
  const pubBytes = sodium.from_base64(
    publicKeyBase64,
    sodium.base64_variants.ORIGINAL,
  );
  const valueBytes = sodium.from_string(value);
  const encrypted = sodium.crypto_box_seal(valueBytes, pubBytes);
  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}

async function putSecret(name, value) {
  console.log(`[set_secret_api] PUT ${name} (value len=${value.length})`);
  const { key, keyId } = await getPublicKey();
  console.log(`  key_id=${keyId}`);
  const encrypted = await encrypt(key, value);
  console.log(`  encrypted len=${encrypted.length}`);
  const r = gh.put(`/repos/${OWNER}/${REPO}/actions/secrets/${name}`, {
    encrypted_value: encrypted,
    key_id: keyId,
  });
  console.log(`  PUT status=${r.status}`);
  if (r.status === 201) console.log(`  ✓ ${name} 新建`);
  else if (r.status === 204) console.log(`  ✓ ${name} 已更新`);
  else {
    console.log(
      `  ✗ 失败: ${JSON.stringify(r.body || r.raw_body || "").slice(0, 300)}`,
    );
    return { ok: false, status: r.status };
  }
  return { ok: true, status: r.status };
}

function loadLJAsAccountsValue() {
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
  return { count: lj.length, value: lj.join(",") };
}

function loadAllAsAccountsValue() {
  // 反者道之动 · 拼全 134 行 accounts.md (反审优先非 LJ 批 · 后置 LJ)
  const ACCOUNTS_FILE = path.join(os.homedir(), ".wam", "accounts.md");
  const raw = fs.readFileSync(ACCOUNTS_FILE, "utf8");
  const lj = [];
  const others = [];
  raw.split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t || !t.includes("@") || !t.includes(" ")) return;
    const [mail, pw] = t.split(/\s+/);
    if (!mail || !pw) return;
    if (pw.startsWith("LJ")) lj.push(`${mail}:${pw}`);
    else others.push(`${mail}:${pw}`);
  });
  // 优先非 LJ (前 93 个 · 老账号 · 可能 chat 可用) · 后置 LJ
  const all = [...others, ...lj];
  return {
    count: all.length,
    value: all.join(","),
    others: others.length,
    lj: lj.length,
  };
}

(async () => {
  const args = process.argv.slice(2);

  if (args.includes("--delete")) {
    const idx = args.indexOf("--delete");
    const name = args[idx + 1];
    if (!name) {
      console.log("用法: --delete NAME");
      process.exit(2);
    }
    const r = gh.delete(`/repos/${OWNER}/${REPO}/actions/secrets/${name}`);
    console.log(`DELETE ${name} status=${r.status}`);
    if (r.status === 204) console.log(`  ✓ ${name} 已删`);
    else
      console.log(
        `  ✗ 失败: ${JSON.stringify(r.body || r.raw_body || "").slice(0, 200)}`,
      );
    return;
  }

  if (args.includes("--list")) {
    const r = gh.get(`/repos/${OWNER}/${REPO}/actions/secrets`);
    console.log("status =", r.status);
    if (r.body && Array.isArray(r.body.secrets)) {
      console.log("total  =", r.body.total_count);
      for (const s of r.body.secrets) {
        console.log(`  · ${s.name.padEnd(20)} updated=${s.updated_at}`);
      }
    }
    return;
  }

  if (args.includes("--from-lj")) {
    const lj = loadLJAsAccountsValue();
    console.log(`LJ 批: ${lj.count} 个 · value len=${lj.value.length}`);
    const r = await putSecret("ACCOUNTS", lj.value);
    if (!r.ok) process.exit(1);
    return;
  }

  if (args.includes("--from-all")) {
    const all = loadAllAsAccountsValue();
    console.log(
      `全 accounts.md: ${all.count} 个 (非LJ=${all.others} · LJ=${all.lj}) · value len=${all.value.length}`,
    );
    const r = await putSecret("ACCOUNTS", all.value);
    if (!r.ok) process.exit(1);
    return;
  }

  if (args.length < 2) {
    console.log(
      "用法: node set_secret_api.js NAME VALUE  |  --from-lj  |  --list",
    );
    process.exit(2);
  }

  const [name, value] = args;
  const r = await putSecret(name, value);
  if (!r.ok) process.exit(1);
})().catch((e) => {
  console.error("✗", e.stack);
  process.exit(1);
});
