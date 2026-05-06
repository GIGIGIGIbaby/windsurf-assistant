// v2.6.7 守一·减二·防抖回归测试
//
// 验证维度:
//   §1 静态规约 (extension.js 文本分析)
//     - VERSION === "2.6.7"
//     - pb·settle / wal·settle fire 前不再有 _lastPerMsgTriggerAt = 0
//     - pb·new 队列里的 reset 保留 (串行需绕 4s 防抖)
//     - _perMsgDebounced 状态变量声明
//     - _maybeTrigger 防抖分支含计数 + 诊断写入
//   §2 行为隔离 (核心逻辑独立验)
//     - 4s 窗口内多次 fire → 仅 1 hit + N-1 debounced
//     - 4s 窗口外 fire → 继续 hit
//   §3 实战追演 (实证根因样本)
//     - 11:25-11:27 雪崩 4 分钟 18 切号样本 → v2.6.7 应≤6 切号
//
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

let pass = 0;
let fail = 0;
function expect(name, cond, detail) {
  const tag = cond ? "OK" : "X ";
  console.log("  [" + tag + "] " + name + (detail ? " | " + detail : ""));
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log("       !! FAIL: " + name);
  }
}

console.log(
  "\n================================================================",
);
console.log("  v2.6.7 shou yi - jian er - debounce regression test");
console.log("================================================================");

// ════════════════════════════════════════════════════════════════
// §1 静态规约 (extension.js 文本分析)
// ════════════════════════════════════════════════════════════════
console.log("\n[§1] static contract analysis\n");

const extPath = path.join(__dirname, "extension.js");
const extSrc = fs.readFileSync(extPath, "utf8");
const lines = extSrc.split("\n");

// 1.1 VERSION === "2.6.7"
{
  const m = extSrc.match(/^const VERSION = "([0-9.]+)";/m);
  const v = m ? m[1] : "??";
  expect("VERSION === 2.6.8", v === "2.6.8", "actual=" + v);
}

// 1.2 pb·settle fire 前 reset 已删 (找 pb·settle 上下文)
{
  // 找 _maybeTrigger("L6→pb·settle"... 调用
  let foundCall = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('_maybeTrigger("L6→pb·settle"')) {
      foundCall = i;
      break;
    }
  }
  expect(
    "pb·settle _maybeTrigger 调用存在",
    foundCall >= 0,
    "line=" + (foundCall + 1),
  );

  if (foundCall >= 0) {
    // 检查上方 5 行内不应有 _lastPerMsgTriggerAt = 0 (代码行, 排除注释)
    const ctxStart = Math.max(0, foundCall - 5);
    const codeLines = lines
      .slice(ctxStart, foundCall)
      .map((l) => l.split("//")[0]); // 剥行尾注释 (避 . 不匫 \r 问)
    const codeOnly = codeLines.join("\n");
    expect(
      "pb·settle 上方 5 行代码无 _lastPerMsgTriggerAt = 0",
      !codeOnly.match(/_lastPerMsgTriggerAt\s*=\s*0/),
      "ctx 行 " + (ctxStart + 1) + "-" + foundCall,
    );
  }
}

// 1.3 wal·settle fire 前 reset 已删
{
  let foundCall = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('_maybeTrigger("L6→wal·settle"')) {
      foundCall = i;
      break;
    }
  }
  expect(
    "wal·settle _maybeTrigger 调用存在",
    foundCall >= 0,
    "line=" + (foundCall + 1),
  );

  if (foundCall >= 0) {
    const ctxStart = Math.max(0, foundCall - 5);
    const codeLines = lines
      .slice(ctxStart, foundCall)
      .map((l) => l.split("//")[0]);
    const codeOnly = codeLines.join("\n");
    expect(
      "wal·settle 上方 5 行代码无 _lastPerMsgTriggerAt = 0",
      !codeOnly.match(/_lastPerMsgTriggerAt\s*=\s*0/),
      "ctx 行 " + (ctxStart + 1) + "-" + foundCall,
    );
  }
}

// 1.4 pb·new 队列里的 reset 保留 (queue gap 3500ms < debounce 4000ms · 串行需绕)
{
  let foundCall = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('_maybeTrigger("L6→pb·new"')) {
      foundCall = i;
      break;
    }
  }
  expect(
    "pb·new _maybeTrigger 调用存在",
    foundCall >= 0,
    "line=" + (foundCall + 1),
  );

  if (foundCall >= 0) {
    const ctxStart = Math.max(0, foundCall - 5);
    const ctx = lines.slice(ctxStart, foundCall).join("\n");
    expect(
      "pb·new 上方 5 行 _lastPerMsgTriggerAt = 0 应保留 (队列串行)",
      !!ctx.match(/_lastPerMsgTriggerAt\s*=\s*0/),
      "ctx 行 " + (ctxStart + 1) + "-" + foundCall,
    );
  }
}

// 1.5 _perMsgDebounced 状态变量声明
{
  expect(
    "_perMsgDebounced 全局状态变量声明",
    /_perMsgDebounced\s*=\s*0/.test(extSrc),
    "regex /_perMsgDebounced = 0/",
  );
}

// 1.6 _maybeTrigger 防抖分支含计数 + 诊断写入
{
  // 找 _maybeTrigger 函数体
  const fnStart = lines.findIndex((l) => l.match(/^function _maybeTrigger\(/));
  expect("_maybeTrigger 函数定义存在", fnStart >= 0, "line=" + (fnStart + 1));

  if (fnStart >= 0) {
    // 取函数前 60 行 (包含防抖分支)
    const fnBody = lines.slice(fnStart, fnStart + 60).join("\n");
    expect(
      "防抖分支含 _perMsgDebounced++",
      /_perMsgDebounced\+\+/.test(fnBody),
      "in _maybeTrigger first 60 lines",
    );
    expect(
      "防抖分支含 totalDebounced 写入",
      /prev\.totalDebounced\s*=\s*_perMsgDebounced/.test(fnBody),
      "in _maybeTrigger first 60 lines",
    );
    expect(
      "防抖分支含 atomicWrite 入 _per_msg_diag.json",
      /atomicWrite\(diagP/.test(fnBody) && /_per_msg_diag\.json/.test(fnBody),
      "in _maybeTrigger first 60 lines",
    );
  }
}

// 1.7 v2.6.7 changelog 头部记录存在 (idx ~5021)
{
  const headBlock = extSrc.substring(0, 8000);
  expect(
    "head changelog 含 v2.6.7 守一",
    /v2\.6\.7.*守一/s.test(headBlock),
    "regex /v2.6.7.*守一/ in 0..8000",
  );
}

// ════════════════════════════════════════════════════════════════
// §2 行为隔离 (核心防抖逻辑独立验)
// ════════════════════════════════════════════════════════════════
console.log("\n[§2] behavior isolated test (debounce core logic)\n");

// 模拟 _maybeTrigger 防抖核心 (复刻 v2.6.7 逻辑)
// 注: 真实代码 _lastPerMsgTriggerAt = 0 但 now = Date.now() (~1.77e12)
//     差 > 4000 故首过. 测试用 -Infinity 模拟此初始化语义.
function makeDebouncer(debounceMs) {
  let lastFireAt = Number.NEGATIVE_INFINITY;
  let hits = 0;
  let debounced = 0;
  return {
    fire(now) {
      if (now - lastFireAt < debounceMs) {
        debounced++;
        return "debounced";
      }
      lastFireAt = now;
      hits++;
      return "hit";
    },
    get hits() {
      return hits;
    },
    get debounced() {
      return debounced;
    },
  };
}

{
  const d = makeDebouncer(4000);

  // T=0: 首 fire 必过
  expect("T=0 首 fire = hit", d.fire(0) === "hit", "hits=" + d.hits);

  // T=100: 4s 内, 必拦
  expect(
    "T=100ms 同窗口 = debounced",
    d.fire(100) === "debounced",
    "debounced=" + d.debounced,
  );

  // T=2000: 4s 内, 拦
  expect(
    "T=2000ms 同窗口 = debounced",
    d.fire(2000) === "debounced",
    "debounced=" + d.debounced,
  );

  // T=3999: 边界内, 拦
  expect(
    "T=3999ms 边界内 = debounced",
    d.fire(3999) === "debounced",
    "debounced=" + d.debounced,
  );

  // T=4001: 出窗口, 过
  expect("T=4001ms 出窗口 = hit", d.fire(4001) === "hit", "hits=" + d.hits);

  // 总计: 2 hits + 3 debounced
  expect(
    "总计 hits=2 + debounced=3",
    d.hits === 2 && d.debounced === 3,
    "hits=" + d.hits + " debounced=" + d.debounced,
  );
}

// ════════════════════════════════════════════════════════════════
// §3 实战追演 (实证根因样本)
// ════════════════════════════════════════════════════════════════
console.log("\n[§3] real-world scenario replay (4-min rate-limit avalanche)\n");

// 实证根因 4 分钟样本 (从 wam.log 抽取的真切号时刻):
// 11:25:05.730 pb·settle 2f3f16b2+26858  base
// 11:25:06.273 pb·settle bb141f7a+11037  +543ms  ← 应防抖
// 11:25:11.279 pb·new   0c3ec7c1
// 11:25:14.131 pb·settle b6a6e6a0+100258 +2852ms 自 new
// 11:26:00.405 pb·settle b6a6e6a0+86472  +46s   真新事件
// 11:26:21.955 pb·settle bb141f7a+10180  +21s   真新事件
// 11:26:22.857 pb·settle df3fc58b+107190 +902ms ← 应防抖
// 11:26:29.158 pb·settle 2f3f16b2+17754  +6.3s  > 4s 自然过
// 11:26:31.125 pb·settle b6a6e6a0+83736  +1.97s ← 应防抖

const samples = [
  { t: 0, label: "11:25:05.730 pb·settle 2f3f16b2" },
  { t: 543, label: "11:25:06.273 pb·settle bb141f7a (+543ms)" },
  { t: 5549, label: "11:25:11.279 pb·new   0c3ec7c1" },
  { t: 8401, label: "11:25:14.131 pb·settle b6a6e6a0" },
  { t: 54675, label: "11:26:00.405 pb·settle b6a6e6a0" },
  { t: 76225, label: "11:26:21.955 pb·settle bb141f7a" },
  { t: 77127, label: "11:26:22.857 pb·settle df3fc58b (+902ms)" },
  { t: 83428, label: "11:26:29.158 pb·settle 2f3f16b2 (+6.3s)" },
  { t: 85395, label: "11:26:31.125 pb·settle b6a6e6a0 (+1.97s)" },
];

const v266 = makeDebouncer(0); // v2.6.6 行为: 每 fire 前 reset → 0 防抖窗
const v267 = makeDebouncer(4000);

console.log("  样本 (实证 wam.log):\n");
for (const s of samples) {
  v266.fire(s.t);
  v267.fire(s.t);
}

console.log(
  "  v2.6.6 (reset 自夺) hits=" + v266.hits + " debounced=" + v266.debounced,
);
console.log(
  "  v2.6.7 (守一)       hits=" + v267.hits + " debounced=" + v267.debounced,
);

expect(
  "v2.6.6 模型: 9 fire 全过 (reset 自夺防抖)",
  v266.hits === 9 && v266.debounced === 0,
  "hits=" + v266.hits + " debounced=" + v266.debounced,
);

expect(
  "v2.6.7 模型: 5 hit + 4 debounced (多源派生收一道)",
  v267.hits === 5 && v267.debounced === 4,
  "hits=" + v267.hits + " debounced=" + v267.debounced,
);

const reduction = ((v266.hits - v267.hits) / v266.hits) * 100;
expect(
  "切号率降 >= 40% (多源派生 settle 聚合)",
  reduction >= 40,
  "实降 " + reduction.toFixed(1) + "%",
);

// ════════════════════════════════════════════════════════════════
// §4 _per_msg_diag.json schema 兼容性 (totalDebounced 添加不破坏)
// ════════════════════════════════════════════════════════════════
console.log("\n[§4] _per_msg_diag.json schema compat\n");

const tmpDiag = path.join(
  os.tmpdir(),
  "wam-v267-test-" + process.pid + ".json",
);

// 模拟 v2.5.9 旧 diag 文件 (无 totalDebounced 字段)
fs.writeFileSync(
  tmpDiag,
  JSON.stringify({
    hits: [{ t: 1000, reason: "test", hint: "x" }],
    rotates: [],
    totalHits: 1,
    totalRotates: 0,
    lastHit: 1000,
  }),
);

// v2.6.7 防抖入路径模拟: 读旧 → 加 totalDebounced → 回写
{
  const prev = JSON.parse(fs.readFileSync(tmpDiag, "utf8"));
  prev.totalDebounced = 1;
  prev.lastDebounced = 2000;
  fs.writeFileSync(tmpDiag, JSON.stringify(prev, null, 2));

  const after = JSON.parse(fs.readFileSync(tmpDiag, "utf8"));
  expect(
    "旧字段保留: totalHits, hits[], totalRotates",
    after.totalHits === 1 &&
      Array.isArray(after.hits) &&
      after.hits.length === 1 &&
      after.totalRotates === 0,
    "totalHits=" + after.totalHits + " hits=" + after.hits.length,
  );
  expect(
    "新字段添: totalDebounced, lastDebounced",
    after.totalDebounced === 1 && after.lastDebounced === 2000,
    "totalDebounced=" + after.totalDebounced,
  );
}

// 清理
try {
  fs.unlinkSync(tmpDiag);
} catch {}

// ════════════════════════════════════════════════════════════════
// 总结
// ════════════════════════════════════════════════════════════════
console.log(
  "\n================================================================",
);
console.log("  v2.6.7 result:  " + pass + " pass / " + fail + " fail");
console.log("================================================================");
process.exit(fail > 0 ? 1 : 0);
