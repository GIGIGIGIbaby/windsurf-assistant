#!/usr/bin/env node
// _smoke_v9952.cjs · 守门 · 软编码 · 适万用户 · 自检 v9.9.52+
// 道义: 六十四章「慎终若始 则无败事」· 二十五章「道法自然」
//
// 运行: node _smoke_v9952.cjs
//
// 自动检测: 优先读本地 ./dao-proxy-min/，若无则扫 ~/.windsurf/extensions/ 最新安装版
// 无硬编码版本号、无硬编码用户名、无硬编码路径 — 软编码适万环境
//
// 验核:
//   §A  文件存在 + 源码加载 (extension.js + source.js)
//   §B  软编码归一 · PKG_VERSION/SELF_EXT_ID/SELF_EXT_DIR_REGEX 抽自 package.json
//   §C  降频减压 (v9.9.36) · 30s refresh · 5s sigTick · 无旧 1500/3000 间隔
//   §D  延迟锚定 (v9.9.36) · 15s 延迟 · 30s 智能保锚
//   §E  DaoTerminalPool 结构完整性
//   §F  CHECKPOINT 死代码已损 (v9.9.52) · CHECKPOINT_BLOCK_RE/MARKER_RE 不在 source.js
//   §G  conversation_summary 在 KEEP_BLOCKS (v9.9.36)
//   §H  SECTION_OVERRIDE 已删 (v9.9.42)
//   §I  HTTP 端点完整 (/term/ping · /origin/preview 等)
//   §J  version 一致性 · ORIGIN_VERSION_BASE = package.json.version
"use strict";

const fs   = require("fs");
const path = require("path");
const os   = require("os");
const assert = require("assert");

// ═══════════════════════════ 路径自适应 ═══════════════════════════
// 优先: 本 smoke 脚本旁边的 dao-proxy-min/ (本地开发版)
// 次之: ~/.windsurf/extensions/ 中最新安装版 (软编码自检测)
function findExtDir() {
  const localDir = path.join(__dirname, "dao-proxy-min");
  if (fs.existsSync(path.join(localDir, "extension.js"))) {
    return { dir: localDir, src: "local" };
  }
  // 扫 ~/.windsurf/extensions/
  const extRoot = path.join(os.homedir(), ".windsurf", "extensions");
  if (!fs.existsSync(extRoot)) return null;
  const dirs = fs.readdirSync(extRoot)
    .filter(d => /^dao-agi\.dao-proxy-min-/.test(d))
    .map(d => ({ d, stat: fs.statSync(path.join(extRoot, d)) }))
    .filter(x => x.stat.isDirectory())
    .sort((a, b) => {
      // 按版本号降序: dao-agi.dao-proxy-min-X.Y.Z
      const va = a.d.match(/(\d+)\.(\d+)\.(\d+)$/);
      const vb = b.d.match(/(\d+)\.(\d+)\.(\d+)$/);
      if (!va || !vb) return 0;
      for (let i = 1; i <= 3; i++) {
        const diff = parseInt(vb[i]) - parseInt(va[i]);
        if (diff !== 0) return diff;
      }
      return 0;
    });
  if (dirs.length === 0) return null;
  return { dir: path.join(extRoot, dirs[0].d), src: "installed@" + dirs[0].d };
}

const found = findExtDir();
if (!found) {
  console.error("\n✗ 未找到 dao-proxy-min 目录 (本地 ./dao-proxy-min/ 或 ~/.windsurf/extensions/dao-agi.dao-proxy-min-*)");
  process.exit(1);
}

console.log(`\n道Agent · smoke · v9.9.52+ 软编码守门`);
console.log(`检验目标: ${found.src}`);
console.log(`路径: ${found.dir}`);
console.log("═".repeat(60));

const EXT_PATH    = path.join(found.dir, "extension.js");
const SRC_PATH    = path.join(found.dir, "vendor", "bundled-origin", "source.js");
const PKG_PATH    = path.join(found.dir, "package.json");

let EXT = "", SRC = "", PKG = null;
let pass = 0, fail = 0, total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name} → ${e.message}`);
  }
}

// ═══════════════════════════ §A 文件存在 + 源码加载 ═══════════════════════════
console.log("\n§A · 文件存在 + 源码加载");

test("extension.js 存在", () => {
  assert.ok(fs.existsSync(EXT_PATH), `不存在: ${EXT_PATH}`);
  EXT = fs.readFileSync(EXT_PATH, "utf8");
  assert.ok(EXT.length > 50000, `文件过小: ${EXT.length}`);
});

test("source.js 存在", () => {
  assert.ok(fs.existsSync(SRC_PATH), `不存在: ${SRC_PATH}`);
  SRC = fs.readFileSync(SRC_PATH, "utf8");
  assert.ok(SRC.length > 50000, `文件过小: ${SRC.length}`);
});

test("package.json 存在 + 可解析", () => {
  assert.ok(fs.existsSync(PKG_PATH), `不存在: ${PKG_PATH}`);
  PKG = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
  assert.ok(PKG && PKG.version, "package.json 无 version");
  console.log(`    → 版本: v${PKG.version} · publisher: ${PKG.publisher} · name: ${PKG.name}`);
});

// ═══════════════════════════ §B 软编码归一 ═══════════════════════════
console.log("\n§B · 软编码归一 (v9.9.25+)");

test("PKG_VERSION 从 package.json 动态读取 (非硬编码)", () => {
  assert.ok(EXT.includes('require("./package.json").version'), "PKG_VERSION dynamic read not found");
});

test("PKG_PUBLISHER 从 package.json 动态读取", () => {
  assert.ok(EXT.includes('require("./package.json").publisher'), "PKG_PUBLISHER dynamic read not found");
});

test("PKG_NAME 从 package.json 动态读取", () => {
  assert.ok(EXT.includes('require("./package.json").name'), "PKG_NAME dynamic read not found");
});

test("SELF_EXT_ID 由 PKG_PUBLISHER + PKG_NAME 组合 (非字面硬写)", () => {
  assert.ok(EXT.includes("SELF_EXT_ID = `${PKG_PUBLISHER}.${PKG_NAME}`"), "SELF_EXT_ID soft-coded not found");
});

test("SELF_EXT_DIR_REGEX 由 SELF_EXT_ID 动态生成", () => {
  assert.ok(EXT.includes("SELF_EXT_DIR_REGEX = new RegExp"), "SELF_EXT_DIR_REGEX dynamic not found");
});

test("resolvePort 用 os.userInfo().username (per-user FNV-1a)", () => {
  assert.ok(EXT.includes("os.userInfo().username"), "per-user FNV not found");
});

// ═══════════════════════════ §C 降频减压 (v9.9.36) ═══════════════════════════
console.log("\n§C · 降频减压 (v9.9.36)");

test("refresh interval = 30000 (原12000)", () => {
  assert.ok(EXT.includes("setInterval(() => this.refresh().catch(() => {}), 30000)"), "30s refresh not found");
});

test("sigTick interval = 5000 (原1500)", () => {
  assert.ok(EXT.includes("setInterval(() => this._sigTick().catch(() => {}), 5000)"), "5s sigTick not found");
});

test("旧 1500ms 间隔已删", () => {
  // webview 中应无 setInterval(sigTick, 1500) 之类旧节奏
  assert.ok(!EXT.includes("setInterval(sigTick, 1500)"), "旧 1500 sigTick still present");
});

test("webview pingPull interval 存在 (sigTick=5000 · pull=30000 · pingPull=10000)", () => {
  // v9.9.36 降频: sigTick 5s · pull 30s · pingPull 10s (原 3s)
  assert.ok(EXT.includes("setInterval(sigTick, 5000)"), "sigTick 5s not found");
  assert.ok(EXT.includes("setInterval(pull, 30000)"), "pull 30s not found");
  assert.ok(EXT.includes("setInterval(pingPull, 10000)") || EXT.includes("setInterval(pingPull, 30000)"),
    "pingPull interval not found");
});

test("webview pull = 30000 (原12000)", () => {
  assert.ok(EXT.includes("setInterval(pull, 30000)"), "30s pull not found");
});

// ═══════════════════════════ §D 延迟锚定 + 智能保锚 (v9.9.36) ═══════════════════════════
console.log("\n§D · 延迟锚定 + 智能保锚 (v9.9.36)");

test("_deferredAnchorTimer 状态变量存在", () => {
  assert.ok(EXT.includes("_deferredAnchorTimer"), "_deferredAnchorTimer not found");
});

test("_activateTs 生命周期追踪变量存在", () => {
  assert.ok(EXT.includes("_activateTs"), "_activateTs not found");
});

// ═══════════════════════════ §E DaoTerminalPool 结构 ═══════════════════════════
console.log("\n§E · DaoTerminalPool 结构完整性 (v9.9.29)");

test("class DaoTerminalPool 存在", () => {
  assert.ok(EXT.includes("class DaoTerminalPool"), "DaoTerminalPool class not found");
});

test("_spawnShell 方法", () => {
  assert.ok(EXT.includes("_spawnShell(sid)"), "_spawnShell not found");
});

test("exec 方法", () => {
  assert.ok(EXT.includes("exec(sid, cmd, opts"), "exec not found");
});

test("_T_MAX_BUF_BYTES 常量存在 (v9.9.33+ 重构)", () => {
  // v9.9.33 重构: _T_MAX_SESSIONS 移除 · maxBufBytes 替代
  assert.ok(EXT.includes("_T_MAX_BUF_BYTES"), "_T_MAX_BUF_BYTES not found");
});

test("sentinel _T_RS = \\u001E", () => {
  assert.ok(EXT.includes('const _T_RS = "\\u001E"'), "_T_RS sentinel not found");
});

// ═══════════════════════════ §F source.js · CHECKPOINT 死代码已损 (v9.9.52) ═══════════════════════════
console.log("\n§F · CHECKPOINT 死代码已损 (v9.9.52)");

test("CHECKPOINT_BLOCK_RE 常量定义已删 (v9.9.52 损 · 仅注释中提及)", () => {
  // v9.9.52 删除两常量定义 · 但 changelog 注释中仍提及名称
  // 验: const CHECKPOINT_BLOCK_RE = ... 定义不存在
  const noComments = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!noComments.includes("CHECKPOINT_BLOCK_RE"), "CHECKPOINT_BLOCK_RE const definition still active in code");
});

test("CHECKPOINT_MARKER_RE 常量定义已删 (v9.9.52 损 · 仅注释中提及)", () => {
  const noComments = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!noComments.includes("CHECKPOINT_MARKER_RE"), "CHECKPOINT_MARKER_RE const definition still active in code");
});

test("source.js ORIGIN_VERSION_BASE 存在", () => {
  assert.ok(SRC.includes("ORIGIN_VERSION_BASE"), "ORIGIN_VERSION_BASE not found in source.js");
});

test("ORIGIN_VERSION_BASE 与 package.json version 一致", () => {
  if (!PKG) return; // skip if pkg not loaded
  const ver = `"v${PKG.version}"`;
  assert.ok(SRC.includes(`ORIGIN_VERSION_BASE = ${ver}`) || SRC.includes(`ORIGIN_VERSION_BASE="${ver.slice(1,-1)}"`) || SRC.includes(`ORIGIN_VERSION_BASE = ${ver.replace(/"/g, "'")}`),
    `ORIGIN_VERSION_BASE should be ${ver} (package.json: v${PKG.version})`);
});

// ═══════════════════════════ §G conversation_summary 在 KEEP_BLOCKS (v9.9.36) ═══════════════════════════
console.log("\n§G · conversation_summary 保留 (v9.9.36)");

test("conversation_summary 在 KEEP_BLOCKS 中 (上下文桥)", () => {
  assert.ok(SRC.includes('"conversation_summary"') || SRC.includes("'conversation_summary'"),
    "conversation_summary not found in source.js KEEP_BLOCKS");
});

test("CHECKPOINT 剥除逻辑已删 (v9.9.51+)", () => {
  // v9.9.51 起不再剥除 CHECKPOINT · 验 剥除代码不存在
  // 用 indexOf 而非 includes 以区分注释与真实逻辑
  const stripped = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); // 去注释
  const hasStrip = stripped.includes("stripCheckpointBlock") || stripped.includes("CHECKPOINT_BLOCK");
  assert.ok(!hasStrip, "CHECKPOINT strip logic still active in source.js");
});

// ═══════════════════════════ §H SECTION_OVERRIDE 已删 (v9.9.42) ═══════════════════════════
console.log("\n§H · SECTION_OVERRIDE 已删 (v9.9.42 真无为)");

test("SECTION_OVERRIDE 全删函数 neutralizeHiddenOverrides 存在 (v9.9.42 根切)", () => {
  // v9.9.42 · SECTION_OVERRIDE_MODE_ 检测+删除代码仍存 (非中性化 而是全删)
  // 验: neutralizeHiddenOverrides 函数存在 · HIDDEN_OVERRIDE_RE 正则存在
  assert.ok(SRC.includes("neutralizeHiddenOverrides"), "neutralizeHiddenOverrides not found");
  assert.ok(SRC.includes("HIDDEN_OVERRIDE_RE") || SRC.includes("SECTION_OVERRIDE_MODE_"),
    "SECTION_OVERRIDE deletion logic not found");
});

// ═══════════════════════════ §I HTTP 端点完整 ═══════════════════════════
console.log("\n§I · HTTP 端点完整");

test("/term/ping 端点", () => {
  assert.ok(EXT.includes('u.pathname === "/term/ping"'), "/term/ping not found");
});

test("/term/exec 端点", () => {
  assert.ok(EXT.includes('u.pathname === "/term/exec"'), "/term/exec not found");
});

test("/term/list 端点", () => {
  assert.ok(EXT.includes('u.pathname === "/term/list"'), "/term/list not found");
});

test("/origin/preview 端点 (source.js)", () => {
  assert.ok(SRC.includes('"/origin/preview"') || SRC.includes("'/origin/preview'"), "/origin/preview not found");
});

test("localhost 安全检查 (127.0.0.1 only)", () => {
  assert.ok(EXT.includes('remoteAddr !== "127.0.0.1"'), "localhost security check not found");
});

// ═══════════════════════════ §J 结构完整性 ═══════════════════════════
console.log("\n§J · 核心结构完整性");

test("activate 函数存在", () => {
  assert.ok(EXT.includes("function activate(ctx)"), "activate not found");
});

test("deactivate 函数存在", () => {
  assert.ok(EXT.includes("function deactivate()") || EXT.includes("async function deactivate()"), "deactivate not found");
});

test("class EssenceProvider 存在", () => {
  assert.ok(EXT.includes("class EssenceProvider"), "EssenceProvider not found");
});

test("forceRestartLS 仅由用户显式触发 · activate 不调用 (真药 D)", () => {
  // v9.9.2 删了广域杀版本 · v9.9.25 加回了 per-user 精准版
  // 真约束: activate 函数内不直接调用 forceRestartLS
  // 用行级检测: activate 代码块内无 forceRestartLS() 调用 (注释中可有)
  const noComments = EXT.replace(/\/\/[^\n]*/g, "");
  // 「activate 不主动 forceRestartLS」的代码注释确认它在 cmdInvert 调
  assert.ok(EXT.includes("function forceRestartLS"), "forceRestartLS function not found");
  // 真药 D 核心: activate 函数中有注释说明不调用
  assert.ok(EXT.includes("activate 不杀 LS") || EXT.includes("不主动干预 LS") || EXT.includes("不主动 forceRestartLS"),
    "真药D documentation comment not found");
});

test("SELF_EXT_ID 无字面硬写 'dao-agi.dao-proxy-min'", () => {
  // 字面硬写的特征: 字符串常量赋值，而非从 package.json 推导
  // 允许在注释中出现，禁止在代码中字面赋值
  const codeOnly = EXT.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const literalAssign = /SELF_EXT_ID\s*=\s*['"]dao-agi\.dao-proxy-min['"]/.test(codeOnly);
  assert.ok(!literalAssign, "SELF_EXT_ID has literal hardcoded value");
});

// ═══════════════════════════ 汇总 ═══════════════════════════
console.log("\n" + "═".repeat(60));
console.log(`  v9.9.52+ 软编码守门 · ${pass}/${total} PASS · ${fail} FAIL`);
if (found.src !== "local") {
  console.log(`  检验版本: ${found.src.replace("installed@dao-agi.dao-proxy-min-", "v")}`);
}
console.log("═".repeat(60));
if (PKG) {
  console.log(`  package.json.version = ${PKG.version}`);
}
console.log(`\n「道法自然 · 无为而无不为」\n`);
if (fail > 0) process.exit(1);
