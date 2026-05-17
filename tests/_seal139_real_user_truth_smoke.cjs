#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// 印 139 · 真用户实证 · 守门
//   主公诏 (2026-05-17 22:44):
//     "代替我之一切 测试使用我私有仓 作为用户使用一切
//      C:\Users\Administrator\.wam\accounts.md 上传各个账号
//      验证所有成果 测试使用一切 发现所有问题 解决一切
//      完善所有缺陷 道法自然 无为而无不为"
//
//   真用户实证发现三真本源缺陷 (dao_proxy.js):
//     ① CFG.promptTimeoutMs default 300_000ms (5min) 太长 · 上游不响应时占资源过久
//     ② chatViaWssRetry maxTries default 5 太多 · 连续打死上游
//     ③ 不 watch wam-state.json · 主公 IDE 切号后 dao_proxy 池 token stale
//
//   印 139 治:
//     ① 300_000 → 120_000 (2min) · 帛书六十四「慎终若始」
//     ② maxTries 5 → 3 · 帛书四十八「损之又损」
//     ③ 立 _yin139_watchWamState() · fs.watchFile + 自 reload · 帛书五十七「民莫之令而自均」
//
//   附实证 (本印之外 · 真用户 trajectory · 见 docs/印137_*.md):
//     ✓ /admin/wam/local · 179 件全识 (166 emailPw + 13 emailToken · auth1 prefix)
//     ✓ /admin/wam/use {index, mode:'token-direct'} · 13 件入 WS_POOL ✓
//     ✓ openai → windsurf 路 · 路由 ✓
//     ✗ 真转: 上游 server.codeium.com / app.devin.ai HTTPS 应用层 timeout
//       (TCP 443 可达 · HTTPS 5s 不返 · 即本机网络阻 · 非 dao_proxy 之责)
// ════════════════════════════════════════════════════════════════════════
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const VM = path.join(ROOT, "packages", "dao-devin-vm", "dao_proxy.js");
const DOCS = path.join(ROOT, "docs");

let pass = 0,
  fail = 0;
function ok(m) {
  console.log("  \x1b[32m✓\x1b[0m " + m);
  pass++;
}
function ng(g, m) {
  console.log("  \x1b[31m✗\x1b[0m " + g + ": " + m);
  fail++;
}

console.log("\n\x1b[1m印 139 · 真用户实证 · 三真本源治本守门\x1b[0m");

// ════════════════════════════════════════════════════════════════════════
// §1 · 真断 ① 治: PROMPT_TIMEOUT_MS default 300000 → 120000
// ════════════════════════════════════════════════════════════════════════
console.log(
  "\n\x1b[1m§1 · 治 ① · CFG.promptTimeoutMs default (5min → 2min)\x1b[0m",
);
const src = fs.readFileSync(VM, "utf8");

if (/PROMPT_TIMEOUT_MS\s*\|\|\s*['"]120000['"]/.test(src)) {
  ok("CFG.promptTimeoutMs default = 120_000 (印 139 治 · 帛书六十四)");
} else if (/PROMPT_TIMEOUT_MS\s*\|\|\s*['"]300000['"]/.test(src)) {
  ng("PROMPT_TIMEOUT", "仍是 300_000 (5min · 旧值 · 印 139 未治)");
} else {
  ng("PROMPT_TIMEOUT", "default 异 (期 120000)");
}

if (/印 139.*5min.*→.*2min|印 139.*120000|印 139 · 5min/.test(src)) {
  ok("注释含「印 139 · 5min → 2min」承续");
} else {
  ng("注释", "缺印 139 之注承续");
}

// ════════════════════════════════════════════════════════════════════════
// §2 · 真断 ② 治: chatViaWssRetry maxTries default 5 → 3
// ════════════════════════════════════════════════════════════════════════
console.log(
  "\n\x1b[1m§2 · 治 ② · chatViaWssRetry maxTries default (5 → 3)\x1b[0m",
);

if (/maxTries\s*=\s*3\s*\}\s*=\s*\{\}/.test(src)) {
  ok("chatViaWssRetry maxTries default = 3 (印 139 治 · 帛书四十八)");
} else if (/maxTries\s*=\s*5\s*\}\s*=\s*\{\}/.test(src)) {
  ng("maxTries", "仍是 5 · 旧值 · 印 139 未治");
} else {
  ng("maxTries", "default 异 (期 3)");
}

if (
  /印 139.*maxTries.*5.*→.*3|损之又损.*帛书四十八|印 139 · maxTries/.test(src)
) {
  ok("注释含「印 139 · maxTries 5 → 3」承续");
} else {
  ng("注释", "缺印 139 之 maxTries 注承续");
}

// ════════════════════════════════════════════════════════════════════════
// §3 · 真断 ③ 治: _yin139_watchWamState · 立 wam-state.json watch
// ════════════════════════════════════════════════════════════════════════
console.log(
  "\n\x1b[1m§3 · 治 ③ · wam-state.json watcher (主公切号 → 自 reload)\x1b[0m",
);

if (/function\s+_yin139_watchWamState\s*\(/.test(src)) {
  ok("_yin139_watchWamState 函数定立");
} else {
  ng("watcher def", "缺 _yin139_watchWamState 函数");
}

if (/_yin139_watchWamState\s*\(\s*\)\s*;/.test(src)) {
  ok("_yin139_watchWamState() 启时被调 (立 watch)");
} else {
  ng("watcher call", "缺启时之 _yin139_watchWamState() 调");
}

if (/fs\.watchFile\s*\(\s*CFG\.wamFile/.test(src)) {
  ok("fs.watchFile(CFG.wamFile, ...) 之实立");
} else {
  ng("fs.watchFile", "fs.watchFile(CFG.wamFile) 缺");
}

if (/印 139 · wam reload/.test(src)) {
  ok("watcher reload log 含「印 139 · wam reload」");
} else {
  ng("reload log", "缺 reload 之 logI");
}

if (
  /POOL_STATE\.pool\.findIndex.*source\s*===\s*['"]wam:activeApiKey['"]/.test(
    src,
  ) ||
  /findIndex[\s\S]{0,80}wam:activeApiKey/.test(src)
) {
  ok("watcher 之 reload 替换 source='wam:activeApiKey' 之池件");
} else {
  ng("替换", "watcher 之 reload 未替 wam:activeApiKey 件");
}

if (/帛书五十七|民莫之令而自均|我无为也.*而民自化/.test(src)) {
  ok("watcher 注引帛书五十七「我无为也而民自化」");
} else {
  ng("帛书", "watcher 缺帛书五十七引");
}

// ════════════════════════════════════════════════════════════════════════
// §4 · 印 139 docs 真存
// ════════════════════════════════════════════════════════════════════════
console.log("\n\x1b[1m§4 · 印 139 docs · 真用户实证书\x1b[0m");
const docs137 = fs.existsSync(DOCS)
  ? fs.readdirSync(DOCS).filter((f) => /印\s*139/.test(f) || /yin139/i.test(f))
  : [];
if (docs137.length > 0) {
  ok(`docs/印 139*.md 真存 (${docs137.length} 件)`);
} else {
  ng("印 139 docs", "缺真用户实证书 · 待立");
}

// ════════════════════════════════════════════════════════════════════════
// 总
// ════════════════════════════════════════════════════════════════════════
console.log(
  `\n═══ 印 139 总: \x1b[32m${pass} 过\x1b[0m / \x1b[31m${fail} 失\x1b[0m ═══\n`,
);

if (fail > 0) {
  console.log("\x1b[31m✗ 印 139 守门失 · 真本源 bug 未尽治\x1b[0m\n");
  process.exit(1);
}
console.log(
  "\x1b[32m✓ 印 139 真用户实证 · 三真本源治本通\x1b[0m · 道法自然 · 无为而无不为\n",
);
