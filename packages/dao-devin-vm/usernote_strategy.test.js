/**
 * usernote_strategy.test.js · 印 122 · 反者道之动 · 弱者道之用
 *
 * 测 dao_proxy.js 之 usernote 策略 (SP §3.17 之 user notes > system notes 合法槽)
 * 不动主公已立 · 单元测 processMessages 之纯函数行为.
 *
 * 用法: node usernote_strategy.test.js
 * 0 deps · Node 内置 child_process 启动 dao_proxy 内部函数
 */

"use strict";

const path = require("path");
const fs = require("fs");

// 直接 require dao_proxy.js 不行 (会启 HTTP server) · 改用 eval-sandbox 提 processMessages
// 道法自然: 单独的纯函数测 · 不启服 · 不消 ACU
const srcPath = path.join(__dirname, "dao_proxy.js");
let src = fs.readFileSync(srcPath, "utf-8");

// sanbox 中 fake 必要 globals · 避免运行至 server 创建
const sandbox = {
  console: { log: () => {}, error: () => {}, warn: () => {} },
  process: { env: {}, exit: () => {}, on: () => {}, platform: process.platform },
  require: require,
  __dirname: __dirname,
  __filename: srcPath,
  Buffer,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  module: { exports: {} },
  exports: {},
  global: {},
};

// 只 evaluate 到 processMessages 之结束位置 (避后续 HTTP server.listen 等副作用)
// 真道 · 截取到 "function processMessages 完毕之 } 行" 即可
const MARKER_START = "function processMessages(messages, ctx)";
const startIdx = src.indexOf(MARKER_START);
if (startIdx < 0) {
  console.error("✗ 找不到 processMessages 函数·dao_proxy 已变");
  process.exit(1);
}

// 找全函数结束 (匹配大括号深度)
let depth = 0;
let endIdx = startIdx;
let inFn = false;
for (let i = startIdx; i < src.length; i++) {
  const c = src[i];
  if (c === "{") {
    depth++;
    inFn = true;
  } else if (c === "}") {
    depth--;
    if (inFn && depth === 0) {
      endIdx = i + 1;
      break;
    }
  }
}

// 提取从顶 (constants) 到 processMessages 结束之代码片段
const codeToEval = src.slice(0, endIdx);

// 注入: 让 process.env 之 SP_STRATEGY 可设 + 暴露 SP_STATE/processMessages
const inject = `
;
const __DAO_TEST_EXPORTS = {
  processMessages,
  SP_STATE,
  stripSide,
  stripMem,
  neutralize,
};
module.exports = __DAO_TEST_EXPORTS;
`;

// 写到临时 tmpfile · require 之
const tmpFile = path.join(__dirname, "._usernote_test_tmp.js");
fs.writeFileSync(tmpFile, codeToEval + inject, "utf-8");

let dao;
try {
  dao = require(tmpFile);
} catch (e) {
  console.error("✗ 加载 dao_proxy 失败:", e.message);
  fs.unlinkSync(tmpFile);
  process.exit(2);
}
fs.unlinkSync(tmpFile);

const { processMessages, SP_STATE } = dao;

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    pass++;
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`   ${e.message}`);
    fail++;
  }
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || "assertEq"}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertContains(haystack, needle, msg) {
  if (!String(haystack).includes(needle)) {
    throw new Error(`${msg || "assertContains"}: "${haystack.slice(0, 200)}" does NOT contain "${needle}"`);
  }
}

function assertNotContains(haystack, needle, msg) {
  if (String(haystack).includes(needle)) {
    throw new Error(`${msg || "assertNotContains"}: "${haystack.slice(0, 200)}" SHOULD NOT contain "${needle}"`);
  }
}

console.log("════════════════════════════════════════════════════════════");
console.log("  印 122 · usernote 策略测 · 反者道之动 · 弱者道之用");
console.log("════════════════════════════════════════════════════════════");
console.log("");

// ─── T1 · 基础: bypass 策略不动消息 ───
test("T1 · bypass 策略保留客户端 SP 不动", () => {
  SP_STATE.strategy = "bypass";
  SP_STATE.globalSp = "";
  const r = processMessages(
    [
      { role: "system", content: "你是 Cline" },
      { role: "user", content: "hi" },
    ],
    {},
  );
  assertEq(r.messages.length, 2, "should keep 2 messages");
  assertEq(r.messages[0].role, "system");
  assertEq(r.messages[0].content, "你是 Cline");
  assertEq(r.messages[1].content, "hi");
  assertEq(r.meta.strategy, "bypass");
  assertEq(r.meta.usernoteInjected, 0);
});

// ─── T2 · usernote 之 daemonSp 为空时不注入 ───
test("T2 · usernote · daemonSp 为空时退化为 bypass 行为 (不注入)", () => {
  SP_STATE.strategy = "usernote";
  SP_STATE.globalSp = "";
  SP_STATE.perAccount = {};
  SP_STATE.perModel = {};
  const r = processMessages(
    [
      { role: "system", content: "你是 Devin" },
      { role: "user", content: "hi" },
    ],
    {},
  );
  assertEq(r.messages.length, 2);
  assertEq(r.messages[0].role, "system");
  assertEq(r.messages[0].content, "你是 Devin"); // 客端 SP 不动
  assertEq(r.messages[1].content, "hi"); // user 不被注入
  assertEq(r.meta.usernoteInjected, 0);
  assertEq(r.meta.daemonSource, "none");
});

// ─── T3 · usernote 之 globalSp 注入最后一笔 user ───
test("T3 · usernote · globalSp 注入到最后一笔 user message (前置)", () => {
  SP_STATE.strategy = "usernote";
  SP_STATE.globalSp = "守道德经为本";
  SP_STATE.perAccount = {};
  SP_STATE.perModel = {};
  const r = processMessages(
    [
      { role: "system", content: "你是 Devin" },
      { role: "user", content: "原始用户问题" },
    ],
    {},
  );
  assertEq(r.messages.length, 2);
  assertEq(r.messages[0].content, "你是 Devin", "system SP 原状·不被改 (★ 不抗 persona)");
  assertContains(r.messages[1].content, "<note", "user message 含 <note");
  assertContains(r.messages[1].content, 'author="user"', "走 user 权威");
  assertContains(r.messages[1].content, "守道德经为本", "daemonSp 真注入");
  assertContains(r.messages[1].content, "原始用户问题", "原 user 内容保留");
  if (r.meta.usernoteInjected <= 0) throw new Error("usernoteInjected 应 > 0");
  assertEq(r.meta.daemonSource, "globalSp");
});

// ─── T4 · usernote 之多 user · 注入只走最后一笔 ───
test("T4 · usernote · 多 user 时只注入到最后一笔", () => {
  SP_STATE.strategy = "usernote";
  SP_STATE.globalSp = "DAO";
  const r = processMessages(
    [
      { role: "system", content: "你是 Devin" },
      { role: "user", content: "第一笔" },
      { role: "assistant", content: "回答" },
      { role: "user", content: "第二笔" },
    ],
    {},
  );
  assertEq(r.messages.length, 4);
  assertEq(r.messages[1].content, "第一笔", "第一笔 user 不被注入");
  assertNotContains(r.messages[1].content, "<note", "第一笔不含 note");
  assertContains(r.messages[3].content, "<note", "第二笔 (最后) 含 note");
  assertContains(r.messages[3].content, "DAO");
  assertContains(r.messages[3].content, "第二笔");
});

// ─── T5 · usernote 之 perAccount 优先于 globalSp ───
test("T5 · usernote · perAccount 优先于 globalSp (三层优先链守)", () => {
  SP_STATE.strategy = "usernote";
  SP_STATE.globalSp = "全局";
  SP_STATE.perAccount = { user_alpha: "alpha 专属" };
  const r = processMessages(
    [{ role: "user", content: "ping" }],
    { account: "user_alpha" },
  );
  assertContains(r.messages[0].content, "alpha 专属", "走 perAccount");
  assertNotContains(r.messages[0].content, "全局", "globalSp 被覆盖");
  assertEq(r.meta.daemonSource, "perAccount");
});

// ─── T6 · usernote 之 strip 不污注入 (`<note>` 不在 SIDE_CHANNEL_TAGS) ───
test("T6 · usernote 注入安全·strip 不误删 <note> 块", () => {
  SP_STATE.strategy = "usernote";
  SP_STATE.globalSp = "TEST_PAYLOAD";
  SP_STATE.opts.stripSideChannels = true;
  SP_STATE.opts.stripMemoryBlocks = true;
  SP_STATE.opts.neutralizeOverrides = true;
  const r = processMessages(
    [{ role: "user", content: "<flows>flow content</flows> 原话" }],
    {},
  );
  // strip 应清掉 <flows> 但保 <note>
  assertContains(r.messages[0].content, "<note", "note 块未被 strip");
  assertContains(r.messages[0].content, "TEST_PAYLOAD", "payload 保");
  assertNotContains(r.messages[0].content, "<flows>", "flows 被清");
  assertContains(r.messages[0].content, "原话", "原内容保");
  // 重置
  SP_STATE.opts.stripSideChannels = false;
  SP_STATE.opts.stripMemoryBlocks = false;
  SP_STATE.opts.neutralizeOverrides = false;
});

// ─── T7 · usernote 之无 user message · 不出错 ───
test("T7 · usernote · 无 user message 时 graceful (不抛错)", () => {
  SP_STATE.strategy = "usernote";
  SP_STATE.globalSp = "X";
  const r = processMessages(
    [{ role: "system", content: "sys" }, { role: "assistant", content: "asst" }],
    {},
  );
  assertEq(r.messages.length, 2);
  assertEq(r.meta.usernoteInjected, 0, "无 user 时 0 注入");
});

// ─── T8 · prepend 仍正常工作 (回归保护) ───
test("T8 · 回归·prepend 策略不被新 usernote 干扰", () => {
  SP_STATE.strategy = "prepend";
  SP_STATE.globalSp = "前置道";
  const r = processMessages(
    [{ role: "system", content: "原 SP" }, { role: "user", content: "hi" }],
    {},
  );
  assertEq(r.messages[0].role, "system");
  assertContains(r.messages[0].content, "前置道", "daemonSp 前置");
  assertContains(r.messages[0].content, "原 SP", "原 SP 保");
  assertEq(r.messages[1].content, "hi", "user 不被改");
  assertEq(r.meta.usernoteInjected, 0, "非 usernote 时 0 注入");
});

console.log("");
console.log("════════════════════════════════════════════════════════════");
console.log(`  总: ${pass + fail} · 通: ${pass} · 败: ${fail}`);
console.log("════════════════════════════════════════════════════════════");
process.exit(fail > 0 ? 1 : 0);
