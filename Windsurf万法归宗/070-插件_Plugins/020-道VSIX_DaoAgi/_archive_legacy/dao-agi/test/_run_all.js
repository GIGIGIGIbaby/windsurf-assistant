#!/usr/bin/env node
// _run_all.js · 一键全测 · 底层向上 · 反者道之动
// 道末步乃 vsix · 此前所有底层模块均独立验毕
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const TESTS = [
  // 一 · 协议层 (proxy core)
  { tier: "L0_PROTO", file: "v1766.spec.js", desc: "summary-agent SP 识别" },
  {
    tier: "L0_PROTO",
    file: "v17_76.spec.js",
    desc: "主辅分槽 + SSE + observeSPFromBody",
  },
  {
    tier: "L0_PROTO",
    file: "v17_78.spec.js",
    desc: "v18.5 + trajectory + HTTP",
  },
  // 二 · 进程内化 (in-process)
  {
    tier: "L1_INPROC",
    file: "v18_inproc.spec.js",
    desc: "v18 进程内化 require/start",
  },
  // 三 · 多账号隔离 (multi-account)
  {
    tier: "L2_ISOLATION",
    file: "v17_86_isolation.spec.js",
    desc: "多账号隔离",
  },
  // 四 · 三道防线 (three lines of defense)
  { tier: "L3_DEFENSE", file: "v17_87_three_lines.spec.js", desc: "三道防线" },
  { tier: "L3_DEFENSE", file: "v17_87_2_l5.spec.js", desc: "L5 防线" },
  { tier: "L3_DEFENSE", file: "_test_uninstall_sentinel.js", desc: "卸载守" },
  // 五 · 水之四德 (water virtues)
  { tier: "L4_WATER", file: "water_hot_reload.spec.js", desc: "水德热重载" },
  {
    tier: "L4_WATER",
    file: "water_elect_pidalive.spec.js",
    desc: "水德选举 pidAlive",
  },
  // 六 · 观照层 (watcher)
  { tier: "L5_WATCH", file: "watcher.spec.js", desc: "五层事件驱动" },
  // 七 · E2E 后端
  {
    tier: "L6_E2E",
    file: "v18_1_1_e2e_backend.spec.js",
    desc: "v18.1.1 E2E 后端",
  },
  // 八 · 反者道之动 · 自下而上 · 九层直连验 (canonical)
  {
    tier: "L7_BOTTOM_UP",
    file: "dao_bottom_up.spec.js",
    desc: "九层直连 · 自下而上 · L1源.js→L9 extension.js",
  },
  // 九 · 主壳 activate (admin 场景)
  {
    tier: "L8_ADMIN",
    file: "admin_layer5_activate.spec.js",
    desc: "Admin 场景 activate · L5 安装/卸载链",
  },
  // 十 · 道末步 · VSIX 装态全链路 (大归宗)
  {
    tier: "L9_VSIX",
    file: "dao_l10_vsix.spec.js",
    desc: "大归宗 · 道末步 · VSIX 装态 = 源态 byte-for-byte",
  },
];

let totalPass = 0,
  totalFail = 0;
const results = [];
const t0 = Date.now();

console.log("═══ 道Agent 一键全测 · 底层向上 · 反者道之动 ═══");
console.log(`ROOT = ${ROOT}\n`);

for (const t of TESTS) {
  const tStart = Date.now();
  const file = path.join("test", t.file);
  if (!fs.existsSync(path.join(ROOT, file))) {
    console.log(`[SKIP] ${t.tier} · ${t.file} (missing)`);
    results.push({ ...t, status: "SKIP", pass: 0, fail: 0, ms: 0 });
    continue;
  }
  process.stdout.write(
    `[RUN ] ${t.tier.padEnd(14)} · ${t.file.padEnd(36)} ... `,
  );
  const r = spawnSync(process.execPath, [file], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 90000,
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  const out = (r.stdout || "") + (r.stderr || "");
  // 抽 PASS/FAIL 数
  let pass = 0,
    fail = 0;
  const m1 = out.match(/pass[=:\s]+(\d+)[\s\S]{0,30}?fail[=:\s]+(\d+)/i);
  const m2 = out.match(/PASS[=:\s]+(\d+)[\s\S]{0,40}?FAIL[=:\s]+(\d+)/);
  const m3 = out.match(/✓[\s\S]+?\n\n/g);
  if (m1) {
    pass = +m1[1];
    fail = +m1[2];
  } else if (m2) {
    pass = +m2[1];
    fail = +m2[2];
  } else if (m3) {
    pass = (out.match(/^\s*✓\s+/gm) || []).length;
  }
  const ok = r.status === 0 && fail === 0;
  totalPass += pass;
  totalFail += fail + (ok ? 0 : fail === 0 && r.status !== 0 ? 1 : 0);
  const ms = Date.now() - tStart;
  process.stdout.write(
    `${ok ? "PASS" : "FAIL"}  pass=${pass} fail=${fail}  (${ms}ms)\n`,
  );
  if (!ok) {
    const tail = out.split("\n").slice(-15).join("\n");
    console.log(
      "  ─ 末 15 行 ─\n" +
        tail
          .split("\n")
          .map((l) => "  " + l)
          .join("\n"),
    );
  }
  results.push({
    ...t,
    status: ok ? "PASS" : "FAIL",
    pass,
    fail,
    ms,
    code: r.status,
  });
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log("\n═══ 总 ═══");
console.log(`PASS=${totalPass}  FAIL=${totalFail}  耗 ${elapsed}s\n`);

console.log("分层:");
const byTier = {};
for (const r of results) {
  byTier[r.tier] = byTier[r.tier] || { pass: 0, fail: 0, count: 0 };
  byTier[r.tier].pass += r.pass;
  byTier[r.tier].fail += r.fail;
  byTier[r.tier].count++;
}
for (const [k, v] of Object.entries(byTier)) {
  console.log(
    `  ${k.padEnd(16)} suites=${v.count}  pass=${v.pass}  fail=${v.fail}`,
  );
}

const outFile = path.join(ROOT, "test", "_run_all_result.json");
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      ts: new Date().toISOString(),
      totalPass,
      totalFail,
      elapsed: +elapsed,
      results,
    },
    null,
    2,
  ),
);
console.log(`\n→ 写 ${outFile}`);

process.exit(totalFail > 0 ? 1 : 0);
