#!/usr/bin/env node
// 印 140 · 真用户实证治本 · 损之又损 · 守门测
// ════════════════════════════════════════════════════════════════════════
// 帛书四十八「为学者日益 · 闻道者日损 · 损之又损 · 以至于无为 · 无为而无不为」
// 帛书六十四「慎终若始 · 则无败事矣」
//
// 守门 6 章:
//   §1 · windsurf chat 之 maxTries cap = 3 (与印 139 devin maxTries 一致)
//   §2 · METRICS 含 inflight: { total: 0 } 字段
//   §3 · recReq / recOk / recErr 皆操作 METRICS.inflight.total
//   §4 · snapMetrics 返 inflight 字段
//   §5 · 注释含「印 140」之锚
//   §6 · docs/印140_*.md 存 + 引帛书四十八 + 六十四
// ════════════════════════════════════════════════════════════════════════
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PROXY = path.join(ROOT, "packages", "dao-devin-vm", "dao_proxy.js");

const tests = [];
function test(name, fn) {
  try {
    fn();
    tests.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    tests.push({ name, ok: false, err: e.message });
    console.log(`  ✗ ${name} · ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log("");
console.log("═══ 印 140 · 真用户实证治本 · 损之又损 · 守门测 ═══");
console.log("");

const src = fs.readFileSync(PROXY, "utf-8");

// ────────────────────────────────────────────────────────────────
// §1 · windsurf maxTries cap = 3 (印 140 治 ①)
// ────────────────────────────────────────────────────────────────
console.log("§1 · windsurf maxTries cap = 3");

test("dao_proxy.js · windsurf maxTries 已改为 3", () => {
  // 须有 `Math.min(WS_POOL_STATE.keys.length, 3)`
  assert(
    /Math\.min\(WS_POOL_STATE\.keys\.length,\s*3\)/.test(src),
    "未见 Math.min(WS_POOL_STATE.keys.length, 3)",
  );
});

test("dao_proxy.js · 旧 maxTries=8 已不存", () => {
  // 不应再有 `Math.min(WS_POOL_STATE.keys.length, 8)`
  assert(
    !/Math\.min\(WS_POOL_STATE\.keys\.length,\s*8\)/.test(src),
    "ws-chat maxTries 仍为 8 · 印 140 治 ① 未完",
  );
});

test("dao_proxy.js · 印 140 治 ① 之注释存", () => {
  assert(
    /印 140.*max 8.*3|max 8.*3.*印 140/.test(src),
    "印 140 之 ① 之注释未现",
  );
});

// ────────────────────────────────────────────────────────────────
// §2 · METRICS 含 inflight 字段 (印 140 治 ②)
// ────────────────────────────────────────────────────────────────
console.log("");
console.log("§2 · METRICS 含 inflight 字段");

test("dao_proxy.js · METRICS 含 inflight: { total: 0 }", () => {
  assert(
    /inflight:\s*\{\s*total:\s*0\s*\}/.test(src),
    "METRICS 不含 inflight 字段",
  );
});

test("dao_proxy.js · 印 140 治 ② 之注释存 (帛书六十四)", () => {
  assert(
    /印 140.*inflight|inflight.*印 140|加 inflight 计数/.test(src),
    "印 140 之 ② 之注释未现",
  );
});

// ────────────────────────────────────────────────────────────────
// §3 · recReq / recOk / recErr 皆操作 inflight
// ────────────────────────────────────────────────────────────────
console.log("");
console.log("§3 · recReq / recOk / recErr 操作 inflight");

test("recReq 增 inflight.total", () => {
  // recReq 函数内须有 METRICS.inflight.total++
  const m = src.match(/function\s+recReq[\s\S]+?^}/m);
  assert(m, "未找到 recReq 函数");
  assert(
    /METRICS\.inflight\.total\+\+/.test(m[0]),
    "recReq 未增 inflight.total",
  );
});

test("recOk 减 inflight.total", () => {
  const m = src.match(/function\s+recOk[\s\S]+?^}/m);
  assert(m, "未找到 recOk 函数");
  assert(
    /METRICS\.inflight\.total\s*=\s*Math\.max\(0,\s*METRICS\.inflight\.total\s*-\s*1\)/.test(
      m[0],
    ),
    "recOk 未减 inflight.total",
  );
});

test("recErr 减 inflight.total", () => {
  const m = src.match(/function\s+recErr[\s\S]+?^}/m);
  assert(m, "未找到 recErr 函数");
  assert(
    /METRICS\.inflight\.total\s*=\s*Math\.max\(0,\s*METRICS\.inflight\.total\s*-\s*1\)/.test(
      m[0],
    ),
    "recErr 未减 inflight.total",
  );
});

// ────────────────────────────────────────────────────────────────
// §4 · snapMetrics 返 inflight 字段
// ────────────────────────────────────────────────────────────────
console.log("");
console.log("§4 · snapMetrics 返 inflight 字段");

test("snapMetrics 返 inflight: METRICS.inflight", () => {
  const m = src.match(/function\s+snapMetrics[\s\S]+?^}/m);
  assert(m, "未找到 snapMetrics 函数");
  assert(
    /inflight:\s*METRICS\.inflight/.test(m[0]),
    "snapMetrics 未返 inflight 字段",
  );
});

// ────────────────────────────────────────────────────────────────
// §5 · 印 140 烙印
// ────────────────────────────────────────────────────────────────
console.log("");
console.log("§5 · 印 140 烙印 (源)");

test("dao_proxy.js · 印 140 注释 ≥ 2 处", () => {
  const matches = src.match(/印 140/g) || [];
  assert(matches.length >= 2, `印 140 烙印仅 ${matches.length} 处 · 期望 ≥ 2`);
});

test("dao_proxy.js · 帛书四十八 引用存", () => {
  assert(
    /帛书四十八.*损之又损|损之又损.*帛书四十八/.test(src),
    "帛书四十八「损之又损」 引用缺",
  );
});

// ────────────────────────────────────────────────────────────────
// §6 · 文献守 · docs/印140_*.md
// ────────────────────────────────────────────────────────────────
console.log("");
console.log("§6 · 文献守 · docs/印140_*.md");

test("docs/印140_*.md 存", () => {
  const docs = fs.readdirSync(path.join(ROOT, "docs"));
  const found = docs.find((f) => /^印140[_\u00b7\s]/.test(f));
  assert(found, "docs/印140_*.md 不存");
});

test("印 140 文献含帛书四十八", () => {
  const docs = fs.readdirSync(path.join(ROOT, "docs"));
  const file = docs.find((f) => /^印140[_\u00b7\s]/.test(f));
  const content = fs.readFileSync(path.join(ROOT, "docs", file), "utf-8");
  assert(
    /帛书四十八.*损之又损|损之又损.*帛书四十八/.test(content),
    "印 140 文献缺帛书四十八",
  );
});

test("印 140 文献含帛书六十四", () => {
  const docs = fs.readdirSync(path.join(ROOT, "docs"));
  const file = docs.find((f) => /^印140[_\u00b7\s]/.test(f));
  const content = fs.readFileSync(path.join(ROOT, "docs", file), "utf-8");
  assert(
    /帛书六十四.*慎终若始|慎终若始.*帛书六十四/.test(content),
    "印 140 文献缺帛书六十四",
  );
});

test("印 140 文献含两治真证之实", () => {
  const docs = fs.readdirSync(path.join(ROOT, "docs"));
  const file = docs.find((f) => /^印140[_\u00b7\s]/.test(f));
  const content = fs.readFileSync(path.join(ROOT, "docs", file), "utf-8");
  assert(
    /tries=3.*pool=13|印 140 治 ① 生效/.test(content),
    "印 140 文献缺治 ① 真证",
  );
  assert(
    /inflight.*自洽|ok\+err\+inflight/.test(content),
    "印 140 文献缺治 ② 真证",
  );
});

// ────────────────────────────────────────────────────────────────
// 总结
// ────────────────────────────────────────────────────────────────
console.log("");
const ok = tests.filter((t) => t.ok).length;
const fail = tests.length - ok;

if (fail === 0) {
  console.log(`✓ 印 140 真用户实证治本 · 损之又损 · ${ok}/${tests.length} 通`);
  console.log("  道法自然 · 无为而无不为");
  console.log("");
  process.exit(0);
} else {
  console.log(`✗ 印 140 守门 · ${fail} 败 / ${tests.length}`);
  tests.filter((t) => !t.ok).forEach((t) => console.log(`  · ${t.name}: ${t.err}`));
  process.exit(1);
}
