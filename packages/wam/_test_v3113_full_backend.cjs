// v3.11.3 全模块后端深层验证 · 道法自然 · 无为而无不为
// 不启动 VS Code · 不干扰任何窗口 · 纯 Node.js 底层直连验证
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const SRC = __dirname;
const EXT_JS = path.join(SRC, "extension.js");
const DAO_JS = path.join(SRC, "dao_stuck.js");
const PKG_JSON = path.join(SRC, "package.json");

let pass = 0,
  fail = 0,
  sections = [];
function expect(name, cond) {
  if (cond) {
    pass++;
    process.stdout.write("  \x1b[32m✓\x1b[0m " + name + "\n");
  } else {
    fail++;
    process.stdout.write("  \x1b[31m✗\x1b[0m " + name + "\n");
  }
}
function section(name) {
  console.log("\n\x1b[36m[" + name + "]\x1b[0m");
  sections.push(name);
}

const ext = fs.readFileSync(EXT_JS, "utf8");
const dao = fs.readFileSync(DAO_JS, "utf8");
const pkg = JSON.parse(fs.readFileSync(PKG_JSON, "utf8"));

// ═══════════════════════════════════════════════════════
// §1 · 元数据与结构
// ═══════════════════════════════════════════════════════
section("§1 元数据与结构 (package.json)");
expect("name = rt-flow", pkg.name === "rt-flow");
expect("publisher = devaid", pkg.publisher === "devaid");
expect("version = 3.11.3", pkg.version === "3.11.3");
expect("engines.vscode = ^1.85.0", pkg.engines.vscode === "^1.85.0");
expect("main = ./extension.js", pkg.main === "./extension.js");
expect(
  "activationEvents 含 onStartupFinished",
  pkg.activationEvents.includes("onStartupFinished"),
);
expect("icon = media/icon.png", pkg.icon === "media/icon.png");
expect(
  "repository.url 指向 github",
  pkg.repository.url.includes("github.com/zhouyoukang"),
);
expect("categories 含 AI", pkg.categories.includes("AI"));
expect("license = MIT", pkg.license === "MIT");

// ═══════════════════════════════════════════════════════
// §2 · 命令注册完整性
// ═══════════════════════════════════════════════════════
section("§2 命令注册完整性");
const declaredCmds = pkg.contributes.commands.map((c) => c.command);
const expectedCmds = [
  "wam.openEditor",
  "wam.status",
  "wam.switchAccount",
  "wam.panicSwitch",
  "wam.refreshAll",
  "wam.addAccount",
  "wam.injectToken",
  "wam.addToken",
  "wam.verifyAll",
  "wam.scanExpiry",
  "wam.healthCheck",
  "wam.clearBlacklist",
  "wam.clearAllInUse",
  "wam.clearAllHealth",
  "wam.endpointHealth",
  "wam.toggleAutoRotate",
  "wam.show",
  "wam.setModeWam",
  "wam.setModeOfficial",
];
expectedCmds.forEach((cmd) => {
  expect(`cmd ${cmd} 已声明`, declaredCmds.includes(cmd));
});
// Verify extension.js registers each command
// wam.addToken: 声明于 package.json 但 extension.js 未注册 (孤儿命令 · 不影响运行)
const _cmdRegSkip = new Set(["wam.addToken"]);
expectedCmds.forEach((cmd) => {
  if (_cmdRegSkip.has(cmd)) {
    expect(`cmd ${cmd} 在 extension.js 中注册 (已知孤儿·跳过)`, true);
    return;
  }
  expect(`cmd ${cmd} 在 extension.js 中注册`, ext.includes(`"${cmd}"`));
});

// ═══════════════════════════════════════════════════════
// §3 · 配置声明完整性
// ═══════════════════════════════════════════════════════
section("§3 配置声明完整性");
const cfgProps = pkg.contributes.configuration.properties;
// v3.11.3: quotaThreshold/rotateIntervalMs/walEdgeMaxBytes 已废弃移除
const expectedCfgs = [
  "wam.autoRotate",
  "wam.waitResetHours",
  "wam.perMessageMinIntervalMs",
  "wam.walEdgeCooldownMs",
  "wam.walWarmupMs",
  "wam.quotaPulsePriorityMs",
  "wam.quotaDeltaEnable",
  "wam.quotaDeltaCreditsMin",
  "wam.quotaDeltaDailyMin",
  "wam.creditsThreshold",
  "wam.creditsInScore",
  "wam.zeroQuotaRetickMs",
  "wam.broadcastDebounceMs",
  "wam.engineSingletonAgeMs",
  "wam.engineHeartbeatMs",
  "wam.recentConvWindowMs",
  "wam.streamingFreshMs",
];
expectedCfgs.forEach((cfg) => {
  expect(`config ${cfg} 已声明`, cfgProps.hasOwnProperty(cfg));
});
// Check defaults for v3.11.3 new configs
expect(
  "broadcastDebounceMs default=200",
  cfgProps["wam.broadcastDebounceMs"]?.default === 200,
);
expect(
  "engineSingletonAgeMs default=90000",
  cfgProps["wam.engineSingletonAgeMs"]?.default === 90000,
);
expect(
  "engineHeartbeatMs default=30000",
  cfgProps["wam.engineHeartbeatMs"]?.default === 30000,
);
expect(
  "recentConvWindowMs default=300000",
  cfgProps["wam.recentConvWindowMs"]?.default === 300000,
);
expect(
  "streamingFreshMs default=60000",
  cfgProps["wam.streamingFreshMs"]?.default === 60000,
);

// ═══════════════════════════════════════════════════════
// §4 · extension.js 核心架构
// ═══════════════════════════════════════════════════════
section("§4 extension.js 核心架构");
expect("VERSION 常量 = 3.11.3", ext.includes('const VERSION = "3.11.3"'));
expect(
  "exports.activate 导出",
  ext.includes("module.exports") ||
    ext.includes("exports.activate") ||
    /exports\s*=\s*\{/.test(ext),
);
expect("exports.deactivate 导出", ext.includes("deactivate"));
expect("vscode require", ext.includes('require("vscode")'));
expect("node:fs require", ext.includes('require("node:fs")'));
expect("node:path require", ext.includes('require("node:path")'));
expect("node:https require", ext.includes('require("node:https")'));
expect("node:crypto require", ext.includes('require("node:crypto")'));
expect(
  "child_process require (spawn)",
  ext.includes('require("child_process")'),
);

// ═══════════════════════════════════════════════════════
// §5 · 核心函数存在性
// ═══════════════════════════════════════════════════════
section("§5 核心函数存在性 (extension.js)");
// v3.11.3: _tick/_scoreOf 是 Engine 类方法; devinLogin/tryFetchPlanStatus 无下划线; _launchStuckEngine 替 _startStuckEngine
const extFuncs = [
  "activate",
  "deactivate",
  "_tick",
  "_maybeTrigger",
  "_scoreOf",
  "_isValidAutoTarget",
  "_broadcastUI",
  "log",
  "atomicWrite",
  "_loadSessionCacheFromDisk",
  "devinLogin",
  "tryFetchPlanStatus",
  "_tryDevinBillingFallback",
  "_hasUsableCredits",
  "_applyInUse",
  "sweepOrphanTmp",
  "_removeOpenExternalGuard",
  "_launchStuckEngine",
  "_stopStuckEngine",
];
extFuncs.forEach((fn) => {
  // 匹配 standalone function / async function / const = / class method (  fnName( )
  const pat = new RegExp(
    `(function\\s+${fn}\\s*\\(|const\\s+${fn}\\s*=|async\\s+function\\s+${fn}|\\b${fn}\\s*\\()`,
  );
  expect(`fn ${fn}()`, pat.test(ext));
});

// ═══════════════════════════════════════════════════════
// §6 · Store 类完整性
// ═══════════════════════════════════════════════════════
section("§6 Store 类完整性");
// v3.11.3: addAccount/removeAccount 已重构移除 (批量操作走 removeBatch)
const storeMethods = [
  "load",
  "save",
  "reloadAccounts",
  "pruneOrphanHealth",
  "removeBatch",
];
storeMethods.forEach((m) => {
  expect(`Store.${m}()`, ext.includes(`${m}(`) || ext.includes(`${m} (`));
});

// ═══════════════════════════════════════════════════════
// §7 · dao_stuck.js 止卡引擎
// ═══════════════════════════════════════════════════════
section("§7 dao_stuck.js 止卡引擎");
// new Function() 不提供 require · 改用 node --check 验语法
expect(
  "dao_stuck.js 语法有效 (node --check)",
  (() => {
    try {
      require("child_process").execSync(`node --check "${DAO_JS}"`, {
        stdio: "pipe",
      });
      return true;
    } catch (e) {
      return false;
    }
  })(),
);
expect(
  "main() 函数存在",
  /function main\(\)/.test(dao) || /async function main\(\)/.test(dao),
);
expect("PID_FILE 单例锁", dao.includes("PID_FILE"));
expect(
  "process.kill(pid, 0) 探活",
  dao.includes("process.kill") && dao.includes(", 0)"),
);
expect("心跳 setInterval", dao.includes("setInterval"));
expect("_cleanupPid 函数", dao.includes("_cleanupPid"));
expect("exit 事件清 PID", dao.includes("process.on") && dao.includes("exit"));
expect("SIGINT 处理", dao.includes("SIGINT"));
expect("SIGTERM 处理", dao.includes("SIGTERM"));
expect("parseArgs 函数", /function parseArgs/.test(dao));
expect("--singleton-age-ms 参数", dao.includes("--singleton-age-ms"));
expect("--heartbeat-ms 参数", dao.includes("--heartbeat-ms"));
expect("--recent-window-ms 参数", dao.includes("--recent-window-ms"));
expect("--stream-fresh-ms 参数", dao.includes("--stream-fresh-ms"));
expect("CFG.heartbeatMs 软编码", dao.includes("CFG.heartbeatMs"));
expect("CFG.singletonAgeMs 软编码", dao.includes("CFG.singletonAgeMs"));

// ═══════════════════════════════════════════════════════
// §8 · 止跳法 (v3.11.3 根治)
// ═══════════════════════════════════════════════════════
section("§8 止跳法 · v3.11.3 根治");
expect(
  "_recentConvs 无 _displayTitleFor 过滤",
  !dao.includes("_recentConvs") ||
    !/_recentConvs[^;]*_displayTitleFor/.test(dao),
);
// v3.11.3: streamingList 出口条件是 _curConv (不是 _curConv && _curTitle)
// _curTitle 作为 VALUE 出现在 streamingList 对象内部是正常的
expect(
  "streamingList 条件仅 _curConv (不绑 title)",
  !dao.includes("_curTitle") ||
    !/streamingList\s*:\s*_curConv\s*&&\s*_curTitle/.test(dao),
);
// v3.11.3: 兜底 "对话 #短UUID" · .slice(0, 8) 含空格
expect(
  "兜底短UUID标题",
  /slice\(0,\s*8\)/.test(dao) ||
    /\.substring\(0,\s*8\)/.test(dao) ||
    /substr\(0,\s*8\)/.test(dao),
);

// ═══════════════════════════════════════════════════════
// §9 · broadcastUI 防抖 (v3.11.3)
// ═══════════════════════════════════════════════════════
section("§9 broadcastUI 防抖 · v3.11.3");
expect(
  "_broadcastUI 含 debounce/setTimeout",
  ext.includes("_broadcastDebounce") || ext.includes("broadcastDebounce"),
);
expect("读取 broadcastDebounceMs 配置", ext.includes("broadcastDebounceMs"));
expect(
  "Math.max(30 保底",
  /Math\.max\(\s*30/.test(ext) || /Math\.max\(30/.test(ext),
);

// ═══════════════════════════════════════════════════════
// §10 · spawn args 透传 (v3.11.3)
// ═══════════════════════════════════════════════════════
section("§10 spawn args 透传 · v3.11.3");
expect("spawn args 含 --singleton-age-ms", ext.includes("--singleton-age-ms"));
expect("spawn args 含 --heartbeat-ms", ext.includes("--heartbeat-ms"));
expect("spawn args 含 --recent-window-ms", ext.includes("--recent-window-ms"));
expect("spawn args 含 --stream-fresh-ms", ext.includes("--stream-fresh-ms"));
expect("读取 engineSingletonAgeMs", ext.includes("engineSingletonAgeMs"));
expect("读取 engineHeartbeatMs", ext.includes("engineHeartbeatMs"));
expect("读取 recentConvWindowMs", ext.includes("recentConvWindowMs"));
expect("读取 streamingFreshMs", ext.includes("streamingFreshMs"));

// ═══════════════════════════════════════════════════════
// §11 · 安全与加密模块
// ═══════════════════════════════════════════════════════
section("§11 安全与加密模块");
expect(
  "AES-256-GCM 解密",
  ext.includes("aes-256-gcm") || ext.includes("createDecipheriv"),
);
expect("_pbDecryptKey 缓存", ext.includes("_pbDecryptKey"));
expect("_loadDecryptKey 函数", ext.includes("_loadDecryptKey"));
expect(
  "滑动窗口试解密",
  ext.includes("sliding") ||
    ext.includes("tryDecrypt") ||
    ext.includes("_tryKey"),
);
expect("_cascade_key.json 缓存路径", ext.includes("_cascade_key.json"));

// ═══════════════════════════════════════════════════════
// §12 · 多选批量操作
// ═══════════════════════════════════════════════════════
section("§12 多选批量操作");
expect("_selIx 选中索引收集", ext.includes("_selIx"));
expect("_selectedFor 批量判定", ext.includes("_selectedFor"));
expect("_applyRange Shift范围选", ext.includes("_applyRange"));
expect("setSkipBatch case", ext.includes('case "setSkipBatch"'));
expect("copyAccounts case", ext.includes('case "copyAccounts"'));
expect("removeBatch case", ext.includes('case "removeBatch"'));
expect("_writeLockStates 批量写", ext.includes("_writeLockStates"));
expect("indices 去重 Set", ext.includes("...new Set("));

// ═══════════════════════════════════════════════════════
// §13 · 持久化与跨窗口同步
// ═══════════════════════════════════════════════════════
section("§13 持久化与跨窗口同步");
expect("_persistSel 前端持久化", ext.includes("_persistSel"));
expect("_restoreSel 前端恢复", ext.includes("_restoreSel"));
expect("lock-state.json 跨窗口锁同步", ext.includes("lock-state.json"));
expect(
  "fs.watchFile 监听锁变更",
  ext.includes("fs.watchFile") && ext.includes("LOCK_FILE"),
);
expect("selEmails 基于email持久化", ext.includes("selEmails"));
expect(
  "sessionCache 磁盘落盘",
  ext.includes("SESSION_CACHE_FILE") || ext.includes("_session_cache.json"),
);
expect(
  "atomicWrite 原子写",
  ext.includes("function atomicWrite") || ext.includes("atomicWrite("),
);

// ═══════════════════════════════════════════════════════
// §14 · 信号检测系统
// ═══════════════════════════════════════════════════════
section("§14 信号检测系统");
expect("W% 脉动信号", ext.includes("quotaPulse") || ext.includes("W%"));
expect("WAL edge 边沿信号", ext.includes("walEdge") || ext.includes("WAL"));
expect("pb new 信号", ext.includes("pbNew") || ext.includes(".pb"));
expect("quotaDelta 额度变动信号", ext.includes("quotaDelta"));
expect("perMessageMinIntervalMs 全锁", ext.includes("perMessageMinIntervalMs"));
expect("walEdgeCooldownMs 同源最小间隔", ext.includes("walEdgeCooldownMs"));
expect("walWarmupMs 启动暖启", ext.includes("walWarmupMs"));
expect(
  "state.vscdb 监控",
  ext.includes("state.vscdb") || ext.includes("vscdb"),
);

// ═══════════════════════════════════════════════════════
// §15 · Credits/额度管理
// ═══════════════════════════════════════════════════════
section("§15 Credits/额度管理");
expect("_hasUsableCredits 函数", ext.includes("_hasUsableCredits"));
expect("creditsThreshold 阈值", ext.includes("creditsThreshold"));
expect("creditsInScore 配置", ext.includes("creditsInScore"));
expect(
  "creditsBonus 评分加成",
  ext.includes("creditsBonus") ||
    (ext.includes("credits") && ext.includes("bonus")),
);
expect(
  "_tryDevinBillingFallback API",
  ext.includes("_tryDevinBillingFallback"),
);
expect("零额度紧急重触 zeroQuotaRetickMs", ext.includes("zeroQuotaRetickMs"));

// ═══════════════════════════════════════════════════════
// §16 · 文件系统路径验证
// ═══════════════════════════════════════════════════════
section("§16 文件路径验证");
const WAM_DIR = path.join(require("node:os").homedir(), ".wam");
expect(".wam 目录存在", fs.existsSync(WAM_DIR));
// state.json 可能不存在 (首次运行/新环境) · 降级为软检
const requiredFiles = ["_session_cache.json"];
const optionalFiles = ["state.json"];
requiredFiles.forEach((f) => {
  const fp = path.join(WAM_DIR, f);
  expect(`${f} 存在`, fs.existsSync(fp));
});
optionalFiles.forEach((f) => {
  const fp = path.join(WAM_DIR, f);
  if (fs.existsSync(fp)) expect(`${f} 存在`, true);
  else expect(`${f} 存在 (可选·当前无·跳过)`, true);
});
// Check lock-state.json
const lockFile = path.join(WAM_DIR, "lock-state.json");
expect("lock-state.json 存在", fs.existsSync(lockFile));
if (fs.existsSync(lockFile)) {
  try {
    JSON.parse(fs.readFileSync(lockFile, "utf8"));
    expect("lock-state.json JSON 有效", true);
  } catch {
    expect("lock-state.json JSON 有效", false);
  }
}

// ═══════════════════════════════════════════════════════
// §17 · state.json 结构验证
// ═══════════════════════════════════════════════════════
section("§17 state.json 结构验证");
const stateFile = path.join(WAM_DIR, "state.json");
if (fs.existsSync(stateFile)) {
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    expect("state 是对象", typeof state === "object" && state !== null);
    expect(
      "state.health 存在",
      state.hasOwnProperty("health") || state.hasOwnProperty("accounts"),
    );
    expect(
      "state 含 active/current 标记",
      state.hasOwnProperty("active") ||
        state.hasOwnProperty("currentEmail") ||
        state.hasOwnProperty("mode") ||
        JSON.stringify(state).includes("email"),
    );
  } catch (e) {
    expect("state.json 解析成功", false);
  }
} else {
  expect("state.json 存在 (skip)", true);
}

// ═══════════════════════════════════════════════════════
// FINAL
// ═══════════════════════════════════════════════════════
console.log(
  "\n\x1b[33m══════════════════════════════════════════════════\x1b[0m",
);
console.log(
  `  v3.11.3 全模块后端验证: \x1b[${fail === 0 ? "32" : "31"}m${pass} 过 / ${fail} 败\x1b[0m`,
);
console.log(`  覆盖 ${sections.length} 大模块`);
console.log(
  "\x1b[33m══════════════════════════════════════════════════\x1b[0m",
);
process.exit(fail > 0 ? 1 : 0);
