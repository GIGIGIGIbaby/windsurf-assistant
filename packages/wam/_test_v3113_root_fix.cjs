/**
 * _test_v3113_root_fix.cjs
 * v3.11.3 根治回归测试 · 道法自然
 *
 * 验证三大根治:
 *   §A 止跳法 — _recentConvs / streamingList / _buildHubCurrent 不再依赖 title 过滤
 *   §B broadcastUI 防抖软编码 — 默认 200ms · _cfg 读取
 *   §C 单例闸门 + 心跳全套软编码 — 4参数透传 dao_stuck
 *   §D package.json 版本 + 新配置项声明
 */
"use strict";

const fs = require("fs");
const path = require("path");

const BASE = path.resolve(__dirname);
const EXT_SRC = fs.readFileSync(path.join(BASE, "extension.js"), "utf8");
const DAO_SRC = fs.readFileSync(path.join(BASE, "dao_stuck.js"), "utf8");
const PKG = JSON.parse(
  fs.readFileSync(path.join(BASE, "package.json"), "utf8"),
);

let pass = 0;
let fail = 0;

function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.error(`  ✗ ${msg}`);
  }
}

// ═══════════════════════════════════════════════════
// §A 止跳法 — dao_stuck.js
// ═══════════════════════════════════════════════════
console.log("\n[§A] 止跳法 · dao_stuck.js");

// A1: _recentConvs 不再含 _displayTitleFor 作为 filter 条件
ok(
  !/_recentConvs[\s\S]{0,500}\.filter\([\s\S]{0,300}_displayTitleFor/.test(
    DAO_SRC,
  ),
  "A1: _recentConvs filter 不含 _displayTitleFor",
);

// A2: _recentConvs 使用 .map 加兜底 title
ok(
  /_recentConvs[\s\S]{0,800}\.map\(/.test(DAO_SRC),
  "A2: _recentConvs 使用 .map() 加工标题",
);

// A3: streamingList 条件不再含 _curTitle
ok(
  /streamingList[\s\S]{0,200}_curConv(?!\s*&&\s*_curTitle)/.test(DAO_SRC),
  "A3: streamingList 条件仅 _curConv (不绑 _curTitle)",
);

// A4: _buildHubCurrent 不再以 _displayTitleFor 过滤
ok(
  !/_buildHubCurrent[\s\S]{0,800}\.filter\([\s\S]{0,300}_displayTitleFor/.test(
    DAO_SRC,
  ),
  "A4: _buildHubCurrent filter 不含 _displayTitleFor",
);

// A5: 兜底短UUID标题 (uuid.slice(0,8) 或类似)
ok(
  /uuid\.slice\(0,\s*8\)|uuid\.substring\(0,\s*8\)|shortId/.test(DAO_SRC),
  "A5: 存在兜底短UUID标题逻辑",
);

// A6: parseArgs 含 --singleton-age-ms
ok(/--singleton-age-ms/.test(DAO_SRC), "A6: parseArgs 支持 --singleton-age-ms");

// A7: parseArgs 含 --heartbeat-ms
ok(/--heartbeat-ms/.test(DAO_SRC), "A7: parseArgs 支持 --heartbeat-ms");

// A8: parseArgs 含 --recent-window-ms
ok(/--recent-window-ms/.test(DAO_SRC), "A8: parseArgs 支持 --recent-window-ms");

// A9: parseArgs 含 --stream-fresh-ms
ok(/--stream-fresh-ms/.test(DAO_SRC), "A9: parseArgs 支持 --stream-fresh-ms");

// A10: 心跳间隔来自 CFG.heartbeatMs (非硬编码 30000)
ok(
  /CFG\.heartbeatMs/.test(DAO_SRC) &&
    /setInterval\([\s\S]{0,200}_heartbeatMs/.test(DAO_SRC),
  "A10: 心跳 setInterval 使用 CFG.heartbeatMs 派生值",
);

// ═══════════════════════════════════════════════════
// §B broadcastUI 防抖软编码 — extension.js
// ═══════════════════════════════════════════════════
console.log("\n[§B] broadcastUI 防抖软编码 · extension.js");

// B1: VERSION = "3.11.3"
ok(/VERSION\s*=\s*"3\.11\.3"/.test(EXT_SRC), 'B1: VERSION = "3.11.3"');

// B2: _broadcastUI 使用 _cfg("broadcastDebounceMs"
ok(
  /_broadcastUI[\s\S]{0,300}broadcastDebounceMs/.test(EXT_SRC),
  'B2: _broadcastUI 读 _cfg("broadcastDebounceMs")',
);

// B3: 默认值 200
ok(
  /broadcastDebounceMs["'],\s*200/.test(EXT_SRC),
  "B3: broadcastDebounceMs 默认 200",
);

// B4: Math.max(30, 保底
ok(
  /Math\.max\(30/.test(EXT_SRC),
  "B4: broadcastDebounceMs 有 Math.max(30 保底",
);

// ═══════════════════════════════════════════════════
// §C spawn args 透传 — extension.js
// ═══════════════════════════════════════════════════
console.log("\n[§C] spawn args 透传 · extension.js");

// C1: spawn args 含 --singleton-age-ms
ok(/--singleton-age-ms/.test(EXT_SRC), "C1: spawn args 含 --singleton-age-ms");

// C2: spawn args 含 --heartbeat-ms
ok(/--heartbeat-ms/.test(EXT_SRC), "C2: spawn args 含 --heartbeat-ms");

// C3: spawn args 含 --recent-window-ms
ok(/--recent-window-ms/.test(EXT_SRC), "C3: spawn args 含 --recent-window-ms");

// C4: spawn args 含 --stream-fresh-ms
ok(/--stream-fresh-ms/.test(EXT_SRC), "C4: spawn args 含 --stream-fresh-ms");

// C5: engineSingletonAgeMs 配置读取
ok(/engineSingletonAgeMs/.test(EXT_SRC), "C5: 读取 engineSingletonAgeMs 配置");

// C6: engineHeartbeatMs 配置读取
ok(/engineHeartbeatMs/.test(EXT_SRC), "C6: 读取 engineHeartbeatMs 配置");

// C7: recentConvWindowMs 配置读取
ok(/recentConvWindowMs/.test(EXT_SRC), "C7: 读取 recentConvWindowMs 配置");

// C8: streamingFreshMs 配置读取
ok(/streamingFreshMs/.test(EXT_SRC), "C8: 读取 streamingFreshMs 配置");

// ═══════════════════════════════════════════════════
// §D package.json 版本 + 新配置项
// ═══════════════════════════════════════════════════
console.log("\n[§D] package.json 版本 + 配置声明");

// D1: version 3.11.3
ok(PKG.version === "3.11.3", "D1: package.json version === 3.11.3");

const props = PKG.contributes?.configuration?.properties || {};

// D2: wam.broadcastDebounceMs 已声明
ok("wam.broadcastDebounceMs" in props, "D2: wam.broadcastDebounceMs 已声明");

// D3: wam.engineSingletonAgeMs 已声明
ok("wam.engineSingletonAgeMs" in props, "D3: wam.engineSingletonAgeMs 已声明");

// D4: wam.engineHeartbeatMs 已声明
ok("wam.engineHeartbeatMs" in props, "D4: wam.engineHeartbeatMs 已声明");

// D5: wam.recentConvWindowMs 已声明
ok("wam.recentConvWindowMs" in props, "D5: wam.recentConvWindowMs 已声明");

// D6: wam.streamingFreshMs 已声明
ok("wam.streamingFreshMs" in props, "D6: wam.streamingFreshMs 已声明");

// D7: broadcastDebounceMs default = 200
ok(
  props["wam.broadcastDebounceMs"]?.default === 200,
  "D7: wam.broadcastDebounceMs default === 200",
);

// D8: engineSingletonAgeMs default = 90000
ok(
  props["wam.engineSingletonAgeMs"]?.default === 90000,
  "D8: wam.engineSingletonAgeMs default === 90000",
);

// D9: engineHeartbeatMs default = 30000
ok(
  props["wam.engineHeartbeatMs"]?.default === 30000,
  "D9: wam.engineHeartbeatMs default === 30000",
);

// D10: recentConvWindowMs default = 300000
ok(
  props["wam.recentConvWindowMs"]?.default === 300000,
  "D10: wam.recentConvWindowMs default === 300000",
);

// D11: streamingFreshMs default = 60000
ok(
  props["wam.streamingFreshMs"]?.default === 60000,
  "D11: wam.streamingFreshMs default === 60000",
);

// ═══════════════════════════════════════════════════
// 汇总
// ═══════════════════════════════════════════════════
console.log(`\n${"═".repeat(50)}`);
console.log(`  v3.11.3 根治回归: ${pass} 过 / ${fail} 败`);
console.log(`${"═".repeat(50)}\n`);
process.exitCode = fail > 0 ? 1 : 0;
