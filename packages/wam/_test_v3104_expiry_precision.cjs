// v3.10.4 · 到期时间秒级精度回归
//   根因: Math.round(diff/天) 使剩余 <12h 的有效号被误判为已过期；tooltip 只显日期丢时分秒
"use strict";

const Module = require("node:module");
const path = require("node:path");

let pass = 0;
let fail = 0;
function expect(desc, cond) {
  if (cond) {
    console.log("  ✓ " + desc);
    pass++;
  } else {
    console.log("  ✗ " + desc);
    fail++;
  }
}

const vs = {
  workspace: {
    getConfiguration: () => ({ get: (k, def) => def }),
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
    workspaceFolders: [],
  },
  window: {
    createOutputChannel: () => ({
      appendLine: () => {},
      show: () => {},
      dispose: () => {},
    }),
    createStatusBarItem: () => ({
      show: () => {},
      hide: () => {},
      dispose: () => {},
    }),
    showInformationMessage: () => {},
    showWarningMessage: () => {},
    showErrorMessage: () => {},
    registerWebviewViewProvider: () => ({ dispose: () => {} }),
  },
  commands: { registerCommand: () => ({ dispose: () => {} }) },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ConfigurationTarget: { Global: 1 },
  Uri: { file: (p) => ({ fsPath: p }) },
  EventEmitter: class {
    constructor() {
      this.event = () => ({ dispose: () => {} });
    }
    fire() {}
    dispose() {}
  },
};
const origLoad = Module._load;
Module._load = function (r, parent, ...rest) {
  if (r === "vscode") return vs;
  return origLoad.call(this, r, parent, ...rest);
};

const ext = require(path.join(__dirname, "extension.js"));
const {
  _buildExpTag,
  _parsePlanStatusJson,
  _parseTimeMs,
  _calcDaysLeft,
  _formatExpiryTime,
} = ext._internals || {};

for (const [name, fn] of Object.entries({
  _buildExpTag,
  _parsePlanStatusJson,
  _parseTimeMs,
  _calcDaysLeft,
  _formatExpiryTime,
})) {
  if (typeof fn !== "function") {
    console.error("× _internals." + name + " 未导出");
    process.exit(1);
  }
}

const now = Date.now();
console.log("[A] 剩 <12 小时仍有效 · 不再误判已过期");
{
  const planEnd = now + 65 * 60 * 1000; // 只剩 65 分钟
  const tag = _buildExpTag({ checked: true, planEnd, daysLeft: 0, plan: "Trial" });
  expect("显示 1天 (ceil，未到期至少 1天)", tag.includes("1天"));
  expect("不显示已过期", !tag.includes("已过期"));
  expect("tooltip 含秒级到期前缀", tag.includes("到期:"));
  expect("tooltip 含 HH:mm:ss", /\d{1,2}\/\d{1,2} \d{2}:\d{2}:\d{2}/.test(tag));
  expect("tooltip 含分钟秒级剩余", /\d+分\d{2}秒/.test(tag) || /\d+时\d{2}分\d{2}秒/.test(tag));
}

console.log("[B] 真过期只按 planEnd<=now 判定");
{
  const tag = _buildExpTag({ checked: true, planEnd: now - 1000, daysLeft: 99, plan: "Trial" });
  expect("planEnd 过去即过期，即便 daysLeft 脏值为 99", tag.includes("已过期"));
  expect("过期 tooltip 仍含秒级时间", /\d{1,2}\/\d{1,2} \d{2}:\d{2}:\d{2}/.test(tag));
}

console.log("[C] _calcDaysLeft 改用 ceil，保住当日未到期号");
{
  expect("1 秒后 => 1 天", _calcDaysLeft(now + 1000, now) === 1);
  expect("11 小时后 => 1 天", _calcDaysLeft(now + 11 * 3600000, now) === 1);
  expect("25 小时后 => 2 天", _calcDaysLeft(now + 25 * 3600000, now) === 2);
  expect("已过期 => 0 天", _calcDaysLeft(now - 1, now) === 0);
}

console.log("[D] 后端 planEnd 秒级解析兼容 ISO / proto / unix 秒毫秒");
{
  const iso = "2026-05-27T10:27:13Z";
  const ms = Date.parse(iso);
  expect("ISO 保留秒", _parseTimeMs(iso) === ms);
  expect("proto seconds+nanos 保留到毫秒", _parseTimeMs({ seconds: Math.floor(ms / 1000), nanos: 456000000 }) % 1000 === 456);
  expect("unix seconds 转毫秒", _parseTimeMs(Math.floor(ms / 1000)) === Math.floor(ms / 1000) * 1000);
  expect("unix ms 原样", _parseTimeMs(ms) === ms);
  const parsed = _parsePlanStatusJson({
    userStatus: {
      planStatus: {
        planEnd: iso,
        weeklyQuotaRemainingPercent: 93,
        dailyQuotaRemainingPercent: 100,
        dailyResetAt: Math.floor((now + 3600000) / 1000),
        weeklyResetAt: Math.floor((now + 86400000) / 1000),
      },
      planInfo: { planName: "Trial" },
    },
  });
  expect("parsePlan.planEnd 精确到秒", parsed.planEnd === ms);
  expect("parsePlan.daysLeft 用 ceil 非 round", parsed.daysLeft === _calcDaysLeft(ms));
}

console.log("[E] formatter 输出 5/27 18:27:13 形态（本地时区）");
{
  const d = new Date(now + 3600000);
  const s = _formatExpiryTime(d.getTime());
  expect("含日期+时分秒", /^\d{1,4}\/\d{1,2}\/\d{1,2} \d{2}:\d{2}:\d{2}$|^\d{1,2}\/\d{1,2} \d{2}:\d{2}:\d{2}$/.test(s));
}

console.log(`\n═══ 结果: ${pass} 过 / ${fail} 败 ═══`);
process.exit(fail > 0 ? 1 : 0);
