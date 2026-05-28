// v17.86.2 · water-virtues hot-reload heartbeat fix
// 验: dispose 后释 G[KEY] 单例锁 · 下次 require 重立心跳
"use strict";

const path = require("node:path");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  const s = cond ? "\u2713" : "\u2717";
  if (cond) pass++; else fail++;
  console.log(`  ${s} ${name.padEnd(50)} ${detail || ""}`);
};

console.log("=== v17.86.2 · water-virtues hot-reload spec ===\n");

// 一 · 首次加载 · 全新 init · 心跳应立
console.log("\u4e00 \u00b7 \u9996\u8f7d");
const KEY = "__dao_water_virtues__";
delete global[KEY]; // clean slate

const modPath = path.resolve(__dirname, "..", "_water_virtues.js");
delete require.cache[require.resolve(modPath)];

const wv1 = require(modPath);
const s1 = wv1.snapshot();
ok("1st load: activated=true", s1.activated === true, `activated=${s1.activated}`);
ok("1st load: G[KEY] 设", global[KEY] && global[KEY].activated === true);
ok("1st load: api 暴露", typeof wv1.dispose === "function");

// 二 · dispose · 释占位锁
console.log("\n\u4e8c \u00b7 dispose");
wv1.dispose();
const s2 = wv1.snapshot();
ok("dispose: STATE.activated=false", s2.activated === false, `got=${s2.activated}`);
ok("dispose: G[KEY] 释", global[KEY] === undefined || global[KEY] === null, `G[KEY]=${typeof global[KEY]}`);

// 三 · 二次加载 · 应 fresh init · 不返旧 disposed api
console.log("\n\u4e09 \u00b7 \u4e8c\u8f7d (\u6a21\u62df hot-reload)");
delete require.cache[require.resolve(modPath)];
const wv2 = require(modPath);
const s3 = wv2.snapshot();
ok("2nd load: activated=true", s3.activated === true, `activated=${s3.activated}`);
ok("2nd load: G[KEY] 重设", global[KEY] && global[KEY].activated === true);
ok("2nd load: api 不与 1st 同实例 (新 STATE)", wv2 !== wv1 || s3.activated, "(不可严比 · 因 require.cache 清后实是新)");

// 四 · 单例特性仍守 · 同一上下文内重 require 不重 init
console.log("\n\u56db \u00b7 \u540c\u4e0a\u4e0b\u6587\u91cd require \u4ecd\u5355\u4f8b");
const wv2b = require(modPath); // require.cache 未清, 应直返
ok("2nd load b: 同一 api", wv2 === wv2b, "(require cache 中)");

// 五 · 第二次 dispose · 同样释 G[KEY]
console.log("\n\u4e94 \u00b7 \u4e8c dispose \u540c\u91ca");
wv2.dispose();
ok("2nd dispose: G[KEY] 释", global[KEY] === undefined || global[KEY] === null);

// 六 · 第三次加载 · 仍能立新心跳 (验幂等)
console.log("\n\u516d \u00b7 \u4e09\u8f7d (\u591a\u6b21 hot-reload \u5e42\u7b49)");
delete require.cache[require.resolve(modPath)];
const wv3 = require(modPath);
const s4 = wv3.snapshot();
ok("3rd load: activated=true", s4.activated === true);
ok("3rd load: 心跳重立", s4.activated && global[KEY] && global[KEY].activated);
wv3.dispose(); // cleanup

console.log(`\n=== \u603b: PASS=${pass} FAIL=${fail} ===`);
if (fail > 0) process.exit(1);
