#!/usr/bin/env node
/**
 * _seal137_devin_yunsheng_integration_smoke.cjs · 印 137
 *   反者道之动 · 整合 Devin 云原生 印 122 之三件附庸
 *
 *   帛书·六十三: 「图难于其易 · 为大于其细 · 终不为大 · 故能成其大」
 *   帛书·六十四: 「为之于其未有 · 治之于其未乱」「慎终若始 · 则无败事」
 *   帛书·三十二: 「侯王若能守之 · 万物将自宾」
 *
 *   主公诏 (2026-05-17 22:51):
 *     「道法自然 · 审视当前 https://github.com/zhouyoukang/windsurf-assistant
 *      整合当前最新相关之成果 E:\道\道生一\一生二\Devin云原生
 *      完善一切核心模块 · 道法自然 · 无为而无不为」
 *
 *   印 137 之实 · 件级整合 (路 B · 不动 145 KB 主器):
 *     ① 复 Devin云原生/虚拟机反代/00_本源/playbook_helper.js (425 行 · 0 改)
 *        → packages/dao-devin-vm/playbook_helper.js
 *        Cognition Playbook 自动化框架 · 0 必需 deps (puppeteer 选)
 *     ② 复 Devin云原生/虚拟机反代/00_本源/usernote_strategy.test.js (285 行 · 0 改)
 *        → packages/dao-devin-vm/usernote_strategy.test.js
 *        8 个单元测 · 验 SP §3.17 之 user note > system note 槽
 *     ③ sp_observe inline test (代 jsonl 真据测) · 此守门内合一
 *
 *   守门:
 *     T1 · 件存在 · 3 件
 *     T2 · playbook_helper require · 9 exports + render dry-run 真出 md
 *     T3 · playbook render md 含 §3.17 引 (SP 真本源标识)
 *     T4 · usernote_strategy.test.js spawn 真 8/8 通 (exit 0 + stdout 含 "通: 8")
 *     T5 · sp_observe_patch inline · 喂合成 frame · 验 totalFrames > 0
 *     T6 · dao_proxy.js 之 usernote 真注入码守门 (16 行 · L486-501 区块)
 *     T7 · dao_proxy.js 之 SP_STATE.strategy 含 "usernote"
 *     T8 · windsurf-assistant 与 Devin云原生 之 dao_proxy.js usernote 注入逻辑同
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PKG = path.join(ROOT, "packages", "dao-devin-vm");
const DAO_PROXY = path.join(PKG, "dao_proxy.js");
const PLAYBOOK = path.join(PKG, "playbook_helper.js");
const USERNOTE_TEST = path.join(PKG, "usernote_strategy.test.js");
const SP_OBSERVE = path.join(PKG, "sp_observe_patch.js");

let pass = 0;
let fail = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`     ${e.message}`);
    errors.push({ name, msg: e.message });
    fail++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

console.log("");
console.log("════════════════════════════════════════════════════════════════════════");
console.log("  印 137 · Devin云原生 整合 · 反者道之动 · 慎终若始");
console.log("    主公诏: 整合最新成果 · 完善核心模块 · 道法自然无为而无不为");
console.log("════════════════════════════════════════════════════════════════════════");
console.log("");

// ─────────────────────────────────────────────────────────────────────────
// T1 · 件存在守门 (3 件)
// ─────────────────────────────────────────────────────────────────────────
console.log("§ T1 · 件存在守门");

test("T1.1 · playbook_helper.js 存在 (15700 B · Devin 印 122 独有件)", () => {
  assert(fs.existsSync(PLAYBOOK), `件不存在: ${PLAYBOOK}`);
  const st = fs.statSync(PLAYBOOK);
  assert(st.size >= 15000 && st.size <= 16000, `尺异: ${st.size} (期 15500±500)`);
});

test("T1.2 · usernote_strategy.test.js 存在 (10244 B · Devin 印 122 单元测)", () => {
  assert(fs.existsSync(USERNOTE_TEST), `件不存在: ${USERNOTE_TEST}`);
  const st = fs.statSync(USERNOTE_TEST);
  assert(st.size >= 10000 && st.size <= 10500, `尺异: ${st.size} (期 10244±256)`);
});

test("T1.3 · sp_observe_patch.js 存在 (8828 B · 已早立)", () => {
  assert(fs.existsSync(SP_OBSERVE), `件不存在: ${SP_OBSERVE}`);
  const st = fs.statSync(SP_OBSERVE);
  assert(st.size >= 8000 && st.size <= 9500, `尺异: ${st.size}`);
});

// ─────────────────────────────────────────────────────────────────────────
// T2-T3 · playbook_helper require + render
// ─────────────────────────────────────────────────────────────────────────
console.log("");
console.log("§ T2-T3 · playbook_helper 真行守门");

let ph;
test("T2.1 · playbook_helper require 真活 · 9 exports", () => {
  ph = require(PLAYBOOK);
  const expected = [
    "VERSION",
    "SEAL",
    "PLAYBOOK_URL",
    "renderPlaybook",
    "extractAllFromProxy",
    "uploadPlaybook",
    "loadState",
    "saveState",
    "markUploaded",
  ];
  const got = Object.keys(ph);
  for (const k of expected) {
    assert(got.includes(k), `缺 export: ${k}`);
  }
});

test("T2.2 · VERSION + SEAL 合 印 122 烙印", () => {
  assert(typeof ph.VERSION === "string" && ph.VERSION.length > 0, "VERSION 缺");
  assert(typeof ph.SEAL === "string" && ph.SEAL.includes("印 122"), "SEAL 不含「印 122」: " + ph.SEAL);
  assert(ph.SEAL.includes("Playbook"), "SEAL 不含「Playbook」");
});

test("T3.1 · renderPlaybook dry-run · 真出 md", () => {
  const md = ph.renderPlaybook({ name: "印137-test", body: "守道德经为本 · 反者道之动" });
  assert(typeof md === "string" && md.length > 100, `md 太短: ${md.length}`);
  assert(md.includes("# 印137-test"), "md 不含标题");
  assert(md.includes("守道德经为本"), "md 不含 body");
});

test("T3.2 · render md 含 §3.17 引 (SP 真本源标识)", () => {
  const md = ph.renderPlaybook({ name: "dao", body: "test" });
  const hasSp317 = md.includes("§3.17") || md.includes("user notes take precedence");
  assert(hasSp317, "md 不含 §3.17 标识");
});

test("T3.3 · render 空 body 抛错 (合道义守)", () => {
  let threw = false;
  try {
    ph.renderPlaybook({ name: "x" });
  } catch (e) {
    threw = e.message.includes("body 不可空");
  }
  assert(threw, "空 body 应抛错");
});

// ─────────────────────────────────────────────────────────────────────────
// T4 · usernote_strategy.test.js spawn 真过守门 (8/8)
// ─────────────────────────────────────────────────────────────────────────
console.log("");
console.log("§ T4 · usernote_strategy.test.js 真测守门 (Devin 印 122 · 8 单元测)");

test("T4.1 · spawn usernote_strategy.test.js · exit 0 + 8/8 通", () => {
  // 印 131 · 中文路径子进程承双旗
  const DUAL_FLAGS = ["--preserve-symlinks", "--preserve-symlinks-main"];
  const childEnv = { ...process.env };
  const existing = (childEnv.NODE_OPTIONS || "").trim();
  const missing = DUAL_FLAGS.filter((f) => !existing.includes(f));
  if (missing.length) {
    childEnv.NODE_OPTIONS = [existing, ...missing].filter(Boolean).join(" ");
  }
  const childArgv = Array.isArray(process.execArgv) ? [...process.execArgv] : [];
  for (const f of DUAL_FLAGS) {
    if (!childArgv.includes(f)) childArgv.push(f);
  }

  const r = spawnSync(process.execPath, [...childArgv, USERNOTE_TEST], {
    cwd: PKG,
    env: childEnv,
    encoding: "utf-8",
    timeout: 30000,
  });

  assert(r.status === 0, `usernote_strategy.test exit=${r.status}\n  stdout: ${r.stdout || ""}\n  stderr: ${r.stderr || ""}`);
  const out = (r.stdout || "") + (r.stderr || "");
  assert(out.includes("通: 8"), `stdout 不含「通: 8」 · 实: ${out.slice(-300)}`);
  assert(out.includes("败: 0"), "stdout 不含「败: 0」");
});

// ─────────────────────────────────────────────────────────────────────────
// T5 · sp_observe inline test (代 jsonl 真据测 · 0 deps)
// ─────────────────────────────────────────────────────────────────────────
console.log("");
console.log("§ T5 · sp_observe_patch inline 真据守门");

test("T5.1 · sp_observe capture · 喂合成 frame · totalFrames 增", () => {
  // 清 require cache · 求独立 STATE
  delete require.cache[require.resolve(SP_OBSERVE)];
  const obs = require(SP_OBSERVE);
  assert(typeof obs.capture === "function", "缺 capture");
  assert(obs._state && obs._state.agg, "缺 _state.agg");

  const before = obs._state.agg.totalFrames;

  // 喂合成 ACP frame · 含 initialize 响应 + session/update + cognition.ai meta
  obs.capture({
    id: 1,
    result: {
      agentInfo: { name: "devin-cloud", version: "test" },
      agentCapabilities: { _meta: { "cognition.ai/agent-id": "devin-cloud" } },
      configOptions: [{ name: "model", type: "string" }],
    },
  });
  obs.capture({
    method: "session/update",
    params: {
      update: {
        sessionUpdate: "agent_message_chunk",
        availableCommands: [{ name: "help", description: "help", _meta: { "cognition.ai/replacementText": "Show help" } }],
      },
    },
  });
  obs.capture({
    method: "initialize",
    params: { _meta: { "cognition.ai/protocol-version": "0.1" } },
  });

  const after = obs._state.agg.totalFrames;
  assert(after >= before + 3, `totalFrames: ${before} → ${after} (期 +3+)`);
  assert(obs._state.agg.agentInfo, "agentInfo 未采集");
  assert(obs._state.agg.availableCommands.length > 0, "availableCommands 空");
  const cogKeys = Object.keys(obs._state.agg.cogMetaKeys);
  assert(cogKeys.length > 0, "cognition.ai/* meta 0 采");
});

test("T5.2 · sp_observe makeHttpHandlers · 三 endpoint", () => {
  const obs = require(SP_OBSERVE);
  const h = obs.makeHttpHandlers();
  assert(typeof h["GET /v1/system/wss-observe"] === "function", "GET 缺");
  assert(typeof h["GET /v1/system/wss-observe/full"] === "function", "GET /full 缺");
  assert(typeof h["POST /v1/system/wss-observe/reset"] === "function", "POST /reset 缺");
});

// ─────────────────────────────────────────────────────────────────────────
// T6-T7 · dao_proxy.js 主器整合守门
// ─────────────────────────────────────────────────────────────────────────
console.log("");
console.log("§ T6-T7 · dao_proxy.js 主器 usernote 真注入守门");

let proxySrc = "";
test("T6.1 · dao_proxy.js 含 usernote 真注入码 (印 122 L486-501 区块)", () => {
  proxySrc = fs.readFileSync(DAO_PROXY, "utf-8");
  const markers = [
    "印 122 · usernote 注入",
    "SP §3.17",
    "let usernoteInjected = 0",
    'strategy === "usernote"',
    'note name="dao-priority"',
    'author="user"',
    "usernoteInjected = noteBlock.length",
  ];
  for (const m of markers) {
    assert(proxySrc.includes(m), `dao_proxy.js 缺 marker: "${m}"`);
  }
});

test("T7.1 · SP_STATE.strategy 七态含 'usernote'", () => {
  // 看 [...].includes(CFG.spStrategy) 之列表
  const idx = proxySrc.indexOf("const SP_STATE = {");
  assert(idx > 0, "SP_STATE 块未找到");
  const block = proxySrc.slice(idx, idx + 600);
  const sevenStates = ["bypass", "override", "prepend", "append", "dao", "custom", "usernote"];
  for (const s of sevenStates) {
    assert(block.includes(`"${s}"`), `SP_STATE.strategy 缺 "${s}"`);
  }
});

test("T7.2 · processMessages 含 usernote case 真 inject", () => {
  // case "usernote": finalSp = clientSp; ... 之后须有真注入
  const caseIdx = proxySrc.indexOf('case "usernote":');
  assert(caseIdx > 0, "case usernote 未找到");
  const injectIdx = proxySrc.indexOf("印 122 · usernote 注入");
  assert(injectIdx > caseIdx, `inject 块应在 case usernote 之后 · case@${caseIdx} inject@${injectIdx}`);
});

test("T7.3 · meta.usernoteInjected 字段暴露", () => {
  assert(proxySrc.includes("usernoteInjected,"), "meta 块未含 usernoteInjected");
});

// ─────────────────────────────────────────────────────────────────────────
// T8 · 整合一致性守门 (windsurf-assistant 与 Devin云原生 同源)
// ─────────────────────────────────────────────────────────────────────────
console.log("");
console.log("§ T8 · 整合一致性守门 (windsurf-assistant 与 Devin云原生 同源)");

test("T8.1 · playbook_helper.js 之 SEAL 烙印 = Devin 印 122 之 SEAL", () => {
  const phSrc = fs.readFileSync(PLAYBOOK, "utf-8");
  assert(phSrc.includes("印 122 · Cognition Playbook 自动化"), "playbook 缺印 122 烙");
  assert(phSrc.includes("图难于其易"), "playbook 缺帛书六十三引");
});

test("T8.2 · usernote_strategy.test.js 之 8 个测谱齐 (T1-T8)", () => {
  const testSrc = fs.readFileSync(USERNOTE_TEST, "utf-8");
  for (let i = 1; i <= 8; i++) {
    assert(testSrc.includes(`T${i} ·`), `usernote test 缺 T${i}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 总
// ─────────────────────────────────────────────────────────────────────────
console.log("");
console.log("════════════════════════════════════════════════════════════════════════");
console.log(`  印 137 总: ${pass + fail} · 通: ${pass} · 败: ${fail}`);
if (fail > 0) {
  console.log("");
  console.log("  失败明:");
  for (const e of errors) {
    console.log(`    ✗ ${e.name}: ${e.msg}`);
  }
}
console.log("════════════════════════════════════════════════════════════════════════");
console.log("");

if (fail === 0) {
  console.log("  ✓ 印 137 全过 · Devin云原生 整合毕");
  console.log("    「侯王若能守之 · 万物将自宾」(帛书三十二)");
  console.log("    「圣人终不为大 · 故能成其大」(帛书六十四)");
  console.log("");
}

process.exit(fail > 0 ? 1 : 0);
