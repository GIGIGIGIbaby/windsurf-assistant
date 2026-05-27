#!/usr/bin/env node
/**
 * lj_to_hdougle.js · 反者道之动 · LJ 40 → hdougle ACCOUNTS · 一气呵成
 * ════════════════════════════════════════════════════════════════════════
 *
 * 「无为而无不为」「江海以善下故能为百谷王」
 *
 * 流程:
 *   1. 读 ~/.wam/accounts.md 取 LJ 批 40 (无视活死 · 让 GitHub runner 自己挑)
 *   2. 拼成 ACCOUNTS = "e1:p1,e2:p2,...,e40:p40"
 *   3. 调 setSecret 写入 hdougle/windsurf-assistant 的 ACCOUNTS
 *   4. 调 dao_hd_dispatch 触发 dao-boot.yml
 *   5. 调 dao_hd_wait_tunnel 等 tunnel URL
 *   6. 调 dao_hd_verify 全链路验证 (重点 /v1/chat/completions)
 *
 * 用法:
 *   node lj_to_hdougle.js                     # 全流程
 *   node lj_to_hdougle.js --skip-secret       # 跳过 secret 设置 (已设过)
 *   node lj_to_hdougle.js --secret-only       # 只设 secret
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, spawnSync } = require("child_process");

const ACCOUNTS_FILE = path.join(os.homedir(), ".wam", "accounts.md");

// ─── 1. 读 LJ 40 ───────────────────────────────────────────────────────
function loadLJAccounts() {
  const raw = fs.readFileSync(ACCOUNTS_FILE, "utf8");
  const out = [];
  raw.split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t || !t.includes("@") || !t.includes(" ")) return;
    const [mail, pw] = t.split(/\s+/);
    if (!mail || !pw) return;
    if (!pw.startsWith("LJ")) return;
    out.push({ email: mail, password: pw });
  });
  return out;
}

const args = process.argv.slice(2);
const skipSecret = args.includes("--skip-secret");
const secretOnly = args.includes("--secret-only");

(async () => {
  const ljs = loadLJAccounts();
  console.log(`═══ lj_to_hdougle · 反者道之动 ═══`);
  console.log(`LJ 40 全员 (无视活死): ${ljs.length}`);

  const accountsValue = ljs.map((a) => `${a.email}:${a.password}`).join(",");
  console.log(`ACCOUNTS value 长度  : ${accountsValue.length} 字符`);
  console.log(`首3:                  ${accountsValue.split(",").slice(0, 3).join(", ")}`);
  console.log(``);

  // ─── step 1: setSecret ───────────────────────────────────────────────
  if (!skipSecret) {
    console.log(`[1/4] setSecret ACCOUNTS ...`);
    const { setSecret } = require("./dao_hd_set_secret.js");
    const r = await setSecret("ACCOUNTS", accountsValue, { headless: false });
    if (!r || !r.ok) {
      console.log(`  ⚠ setSecret 返回 ${JSON.stringify(r)}, 但可能成功 (UI 检测有时假阴)`);
    } else {
      console.log(`  ✓ ACCOUNTS 已设`);
    }
    console.log(``);
  } else {
    console.log(`[1/4] 跳过 setSecret (--skip-secret)`);
  }

  if (secretOnly) {
    console.log(`= secret-only 模式 · 退 =`);
    return;
  }

  // ─── step 2: dispatch ────────────────────────────────────────────────
  console.log(`[2/4] dispatch dao-boot.yml ...`);
  const dispatchOut = spawnSync(
    "node",
    [path.join(__dirname, "dao_hd_dispatch.js")],
    { encoding: "utf8", stdio: "inherit" },
  );
  if (dispatchOut.status !== 0) {
    console.log(`  ✗ dispatch 失 (exit=${dispatchOut.status})`);
    process.exit(1);
  }
  console.log(``);

  // ─── step 3: wait tunnel ─────────────────────────────────────────────
  console.log(`[3/4] wait tunnel URL ...`);
  const waitOut = spawnSync(
    "node",
    [path.join(__dirname, "dao_hd_wait_tunnel.js")],
    { encoding: "utf8", stdio: "inherit" },
  );
  if (waitOut.status !== 0) {
    console.log(`  ✗ wait_tunnel 失 (exit=${waitOut.status})`);
    process.exit(1);
  }
  console.log(``);

  // ─── step 4: verify ──────────────────────────────────────────────────
  console.log(`[4/4] verify (full chain · /v1/chat/completions) ...`);
  // 读 wait_tunnel 落盘的 URL · 期 ~/.dao/hdougle/tunnel.json 或类似
  const tunnelFile = path.join(os.homedir(), ".dao", "hdougle", "tunnel.json");
  if (fs.existsSync(tunnelFile)) {
    const t = JSON.parse(fs.readFileSync(tunnelFile, "utf8"));
    console.log(`  tunnel: ${t.url || t.tunnelUrl || JSON.stringify(t)}`);
  }
  const verifyOut = spawnSync(
    "node",
    [path.join(__dirname, "dao_hd_verify.js")],
    { encoding: "utf8", stdio: "inherit" },
  );
  if (verifyOut.status !== 0) {
    console.log(`  ⚠ verify 退码非零 (exit=${verifyOut.status}) · 看上面输出`);
  }
  console.log(``);
  console.log(`═══ lj_to_hdougle 末 ═══`);
})();
