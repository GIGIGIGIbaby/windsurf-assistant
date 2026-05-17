#!/usr/bin/env node
/**
 * _seal118_guizong.cjs · 印 118 守门 · 万法归一 · 件齐 + 结构 + syntax
 *
 *   「图难于其易 · 为大于其细」(六十三)
 *   「合抱之木 · 生于毫末」(六十四)
 *
 * 跑: node 01_GH编排/_seal118_guizong.cjs
 *
 * 验 (此家归宗后之态):
 *   1. 顶层 6 + 1 目录齐 (00_本源/ + 01_GH编排/ + 02_逆向真据/ + 03_网页注入/ + 04_evidence/ + _archive/ + README.md)
 *   2. 00_本源/ · 真本源四件齐 + silk 二文 · 大小合理
 *   3. 01_GH编排/ · deployer + workflow + smoke + INDEX 齐
 *   4. JS syntax (node --check) 全 pass: dao_proxy + vm_omni + vm_proxy_deploy + deployer
 *   5. dao_proxy.js 含关键 endpoint (/v1/chat/completions + /v1/models + /health + wss)
 *   6. dao_proxy.js 含双池关键字 (DEVIN_TOKEN + WS_TOKENS_FILE + wam-state)
 *   7. dao_proxy.js 含 SP 6 策略关键字 (bypass / override / prepend / append / dao / custom)
 *   8. 04_evidence/ · 七件 seal JSON 齐 (印 111 + 112 + 113 + 116 + 117)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

let pass = 0;
let fail = 0;
const failures = [];

function ok(name) {
  console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  pass++;
}
function ng(name, why) {
  console.log(`  \x1b[31m✗\x1b[0m ${name} · ${why}`);
  fail++;
  failures.push(`${name}: ${why}`);
}

console.log("═══ 印 118 守门 · 万法归一 · 此家归宗后真态 ═══");
console.log("  root: " + ROOT);
console.log("");

// ─── 1. 顶层 6 目 + 1 文 ───
console.log("[1] 顶层 6 目 + README.md");
const topDirs = [
  "00_本源",
  "01_GH编排",
  "02_逆向真据",
  "03_网页注入",
  "04_evidence",
  "_archive",
];
for (const d of topDirs) {
  const fp = path.join(ROOT, d);
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) {
    ok(`${d}/`);
  } else {
    ng(d, "缺");
  }
}
{
  const fp = path.join(ROOT, "README.md");
  if (fs.existsSync(fp)) ok("README.md · " + (fs.statSync(fp).size / 1024).toFixed(1) + "KB");
  else ng("README.md", "缺");
}

// ─── 2. 00_本源/ 真本源四件 + silk 二文 ───
console.log("");
console.log("[2] 00_本源/ 真本源四件");
const ben = [
  { p: "00_本源/dao_proxy.js", min: 50, max: 200 },
  { p: "00_本源/vm_omni.js", min: 30, max: 80 },
  { p: "00_本源/vm_proxy_deploy.js", min: 10, max: 40 },
  { p: "00_本源/silk/_silk_dao.txt", min: 5, max: 20 },
  { p: "00_本源/silk/_silk_de.txt", min: 5, max: 20 },
  { p: "00_本源/README.md", min: 3, max: 20 },
];
for (const f of ben) {
  const fp = path.join(ROOT, f.p);
  if (!fs.existsSync(fp)) {
    ng(f.p, "缺");
    continue;
  }
  const kb = fs.statSync(fp).size / 1024;
  if (kb < f.min || kb > f.max) {
    ng(f.p, `size=${kb.toFixed(1)}KB · 期 [${f.min}, ${f.max}]`);
    continue;
  }
  ok(`${f.p} · ${kb.toFixed(1)}KB`);
}

// ─── 3. 01_GH编排/ deployer + workflow + smoke ───
console.log("");
console.log("[3] 01_GH编排/ GH 反者");
const gh = [
  { p: "01_GH编排/deployer.js", min: 8, max: 30 },
  { p: "01_GH编排/workflow/dao-fleet-devin-cloud.yml", min: 5, max: 15 },
  { p: "01_GH编排/_seal115_smoke.cjs", min: 3, max: 10 },
  { p: "01_GH编排/INDEX_GUIZONG.md", min: 10, max: 50 },
  { p: "01_GH编排/package.json", min: 0.5, max: 5 },
  { p: "01_GH编排/README.md", min: 3, max: 20 },
];
for (const f of gh) {
  const fp = path.join(ROOT, f.p);
  if (!fs.existsSync(fp)) {
    ng(f.p, "缺");
    continue;
  }
  const kb = fs.statSync(fp).size / 1024;
  if (kb < f.min || kb > f.max) {
    ng(f.p, `size=${kb.toFixed(1)}KB · 期 [${f.min}, ${f.max}]`);
    continue;
  }
  ok(`${f.p} · ${kb.toFixed(1)}KB`);
}

// ─── 4. JS syntax · node --check ───
console.log("");
console.log("[4] JS syntax · node --check");
for (const js of [
  "00_本源/dao_proxy.js",
  "00_本源/vm_omni.js",
  "00_本源/vm_proxy_deploy.js",
  "01_GH编排/deployer.js",
]) {
  const fp = path.join(ROOT, js);
  if (!fs.existsSync(fp)) {
    ng(js, "缺 (跳)");
    continue;
  }
  const r = spawnSync(process.execPath, ["--check", fp], { encoding: "utf8" });
  if (r.status === 0) ok(`${js} · syntax OK`);
  else ng(js, `node --check 失: ${(r.stderr || "").slice(0, 200)}`);
}

// ─── 5. dao_proxy.js 含 endpoint ───
console.log("");
console.log("[5] dao_proxy.js 含关键 endpoint");
const proxyFp = path.join(ROOT, "00_本源/dao_proxy.js");
if (fs.existsSync(proxyFp)) {
  const p = fs.readFileSync(proxyFp, "utf8");
  for (const ep of [
    "/v1/chat/completions",
    "/v1/messages",
    "/v1/models",
    "/v1beta",
    "/health",
    "wss://app.devin.ai",
  ]) {
    if (p.includes(ep)) ok(`endpoint 含 "${ep}"`);
    else ng("dao_proxy", `缺 endpoint "${ep}"`);
  }
}

// ─── 6. dao_proxy.js 双池关键字 ───
console.log("");
console.log("[6] dao_proxy.js 双池 · Devin + Windsurf");
if (fs.existsSync(proxyFp)) {
  const p = fs.readFileSync(proxyFp, "utf8");
  for (const k of [
    "DEVIN_TOKEN",
    "DEVIN_TOKENS",
    "DAO_TOKENS_FILE",
    "wam-state.json",
    "WS_TOKENS_FILE",
    "server.codeium.com",
  ]) {
    if (p.includes(k)) ok(`双池含 "${k}"`);
    else ng("dao_proxy", `缺 "${k}"`);
  }
}

// ─── 7. dao_proxy.js SP 6 策略 ───
console.log("");
console.log("[7] dao_proxy.js SP 6 策略");
if (fs.existsSync(proxyFp)) {
  const p = fs.readFileSync(proxyFp, "utf8");
  for (const s of [
    '"bypass"',
    '"override"',
    '"prepend"',
    '"append"',
    '"dao"',
    '"custom"',
  ]) {
    if (p.includes(s)) ok(`SP 策略含 ${s}`);
    else ng("dao_proxy", `缺策略 ${s}`);
  }
}

// ─── 8. 04_evidence/ 七件齐 ───
console.log("");
console.log("[8] 04_evidence/ 七件 seal JSON");
const evDir = path.join(ROOT, "04_evidence");
const expectedSeals = [
  "seal111_chat_4vm_8of16.json",
  "seal111_full_chain_16model.json",
  "seal111_parallel_AF_7vm.json",
  "seal112_mesh_",
  "seal113_deployer_",
  "seal116_chat_mesh_",
  "seal117_full_probe_",
];
if (fs.existsSync(evDir)) {
  const all = fs.readdirSync(evDir);
  for (const prefix of expectedSeals) {
    const found = all.find((f) => f.startsWith(prefix));
    if (found) ok(`evidence "${prefix}*" · ${found}`);
    else ng("evidence", `缺 "${prefix}*"`);
  }
} else {
  ng("04_evidence/", "缺目录");
}

// ─── 总结 ───
console.log("");
console.log(
  `═══ 总: \x1b[32m${pass} 过\x1b[0m / \x1b[31m${fail} 失\x1b[0m ═══`,
);
if (fail > 0) {
  console.log("");
  console.log("\x1b[31m失项:\x1b[0m");
  failures.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
} else {
  console.log("");
  console.log("\x1b[32m✓ 万法归一 · 印 118 真守 · 道法自然\x1b[0m");
  process.exit(0);
}
