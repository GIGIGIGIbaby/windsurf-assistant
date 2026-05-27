// _test_v3112_stability.cjs · 反者道之动 · 三疾根治回归
//
// 目标: 确保以下三个修复在 packages/wam 权威源中真实生效
//   修1 · 多选持久化 (Bug: 多选 6 个后几秒被自动弹回)
//        根因: _broadcastUI() 全量 webview.html = buildHtml() 重建 DOM
//              checkbox/.sel 寄生 DOM · 重建即清
//        治法: vscode.getState/setState 持久化选中 email 集合
//              重建后 IIFE 调 _restoreSel() 按 data-email 复位
//   修2 · 对话计数稳定化 (Bug: 顶部"对话 0 流式 0"反复抖动)
//        根因: _visibleStreamingList 是过滤掉无可读 title 的子集
//              cascade 刚建对话还没填 title 时计数为 0
//              title 填上又变 1 · 0↔1 弹来弹去
//        治法: 计数用原始 hub.streamingList.length (不被过滤抖动)
//              title 失败时按 短UUID 兜底显示「对话 #abcd1234」
//   修3 · 引擎单实例闸门 (Bug: 多窗口 conv 区数据互相覆盖)
//        根因: 每个 Windsurf 窗口的扩展激活时都 spawn dao_stuck.js
//              N 进程并发 read-modify-write _hub.json
//        治法: main() 开头探活 PID_FILE · 上家活则当前进程 exit 0
//              退出时清理 PID_FILE · 让接班者立即上位
//
// 道: 反者道之动 · 弱者道之用 · 守一减二 · 不与多窗口竞写
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const EXT = path.join(ROOT, "_github_src/packages/wam/extension.js");
const STUCK = path.join(ROOT, "_github_src/packages/wam/dao_stuck.js");
const PKG = path.join(ROOT, "_github_src/packages/wam/package.json");

function readFile(p) {
  return fs.readFileSync(p, "utf8");
}

let pass = 0;
let fail = 0;
const results = [];

function ok(name) {
  pass++;
  results.push("  \u2713 " + name);
}
function bad(name, reason) {
  fail++;
  results.push("  \u2717 " + name + (reason ? " | " + reason : ""));
}
function expect(cond, name, reason) {
  cond ? ok(name) : bad(name, reason);
}

console.log("");
console.log("\u2550\u2550\u2550 v3.11.2 \u00b7 \u9053\u6cd5\u81ea\u7136 \u4e09\u75be\u6839\u6cbb\u56de\u5f52 \u2550\u2550\u2550");
console.log("");

// ═══ 0. 版本对齐 ═══
console.log("[0] 版本号对齐");
{
  const ext = readFile(EXT);
  const pkg = JSON.parse(readFile(PKG));
  expect(/const VERSION = "3\.11\.2"/.test(ext), 'extension.js VERSION = "3.11.2"');
  expect(pkg.version === "3.11.2", 'package.json version = "3.11.2"');
}

// ═══ 1. 多选持久化 ═══
console.log("");
console.log("[1] 多选持久化 \u00b7 \u5168\u91cf\u91cd\u5efa\u4e0d\u593a\u9009\u62e9");
{
  const ext = readFile(EXT);
  expect(/function _persistSel\(\)/.test(ext), "前端 _persistSel() 函数已定义");
  expect(/function _restoreSel\(\)/.test(ext), "前端 _restoreSel() 函数已定义");
  expect(/selEmails/.test(ext), "持久化 key 使用 selEmails (基于 email 而非 index)");
  expect(/vscode\.setState\(\{[^}]*selEmails/.test(ext), "_persistSel 调用 vscode.setState({...selEmails})");
  expect(/vscode\.getState\(\)[\s\S]{0,50}selEmails/.test(ext), "_restoreSel 从 vscode.getState() 读 selEmails");
  expect(/dataset\.email/.test(ext), "复位时按 row.dataset.email 锚定");
  // 关键入口都接 _persistSel
  expect(/updateBatchBar\(\)[\s\S]{0,200}_persistSel\(\)/.test(ext), "updateBatchBar() 末尾调 _persistSel()");
  // IIFE 启动复位
  expect(/_restoreSel\(\);[\s\S]{0,80}updateBatchBar\(\)/.test(ext), "IIFE 启动后 _restoreSel + updateBatchBar 复位");
  // clearSelection 同步清 .sel
  expect(/clearSelection\(\)\{[\s\S]{0,200}classList\.remove\('sel'\)/.test(ext), "clearSelection() 同步清除 .sel 高亮");
  // TTL 防长期残留
  expect(/selTs/.test(ext), "持久化带 selTs 时间戳 (10min TTL 防残留)");
  // row 含 data-email
  expect(/data-email="\$\{_esc\(a\.email\.toLowerCase\(\)\)\}"/.test(ext), "row 模板含 data-email (复位锚)");
}

// ═══ 2. 对话计数稳定化 ═══
console.log("");
console.log("[2] \u5bf9\u8bdd\u8ba1\u6570\u7a33\u5b9a\u5316 \u00b7 \u4e0d\u88ab title \u8fc7\u6ee4\u6296\u52a8");
{
  const ext = readFile(EXT);
  expect(/_rawStreamingList\s*=\s*hub\.streamingList\s*\|\|\s*\[\]/.test(ext), "_rawStreamingList 取自原始 hub.streamingList");
  expect(/_visibleConversationCount\s*=\s*_rawStreamingList\.length/.test(ext), "_visibleConversationCount 用 _rawStreamingList.length (不被 title 过滤抖动)");
  expect(/_visibleFlowCount\s*=\s*_rawStreamingList\.filter/.test(ext), "_visibleFlowCount 也基于 _rawStreamingList");
  expect(/对话 #/.test(ext), "title 失败有「对话 #短UUID」兜底显示");
  expect(/replace\(\/-\/g,\s*""\)\.slice\(0,\s*8\)/.test(ext), "兜底用前 8 位短 uuid (去连字符)");
}

// ═══ 3. 引擎 single-instance 闸门 ═══
console.log("");
console.log("[3] \u5f15\u64ce\u5355\u5b9e\u4f8b \u00b7 \u591a\u7a97\u53e3\u4e0d\u4e89");
{
  const stuck = readFile(STUCK);
  expect(/\[single-instance\]/.test(stuck), "main() 含 [single-instance] 让位日志");
  expect(/process\.kill\(_oldPid,\s*0\)/.test(stuck), "用 process.kill(pid, 0) 探活上家 PID");
  expect(/PID_FILE/.test(stuck) && /existsSync\(PID_FILE\)/.test(stuck), "main 开头检测 PID_FILE 存在性");
  expect(/let _alive\s*=\s*false/.test(stuck), "PID 活性判定变量 _alive 已声明");
  // 90s 老化窗口
  expect(/90000/.test(stuck) && /_ageMs/.test(stuck), "PID_FILE mtime 90s 老化窗口防 PID 回收误判");
  // PID 心跳 30s
  expect(/setInterval\(\(\)\s*=>\s*\{[\s\S]{0,120}writeFileSync\(PID_FILE/.test(stuck), "30s 心跳 touch PID_FILE 让 mtime 持续刷新");
  // 退出清理
  expect(/_cleanupPid/.test(stuck), "_cleanupPid 函数已定义");
  expect(/process\.on\("exit",\s*_cleanupPid\)/.test(stuck), "exit 事件清 PID_FILE · 让接班者立即上位");
  expect(/process\.on\("SIGINT",\s*_cleanupPid\)/.test(stuck), "SIGINT 也清 PID_FILE");
  expect(/process\.on\("SIGTERM",\s*_cleanupPid\)/.test(stuck), "SIGTERM 也清 PID_FILE");
}

// ═══ 4. 单实例语义 · 让位是 exit 0 (非异常退出) ═══
console.log("");
console.log("[4] \u8ba9\u4f4d\u8bed\u4e49 \u00b7 exit 0 \u4e0d\u89e6\u53d1 extension \u91cd\u542f");
{
  const stuck = readFile(STUCK);
  // 让位必须是 process.exit(0)，否则 extension.js 的 child.on('exit') 会看到 code != 0 自动重启
  // 验证: [single-instance] 日志块后跟 process.exit(0)
  const m = stuck.match(/\[single-instance\][\s\S]{0,400}/);
  expect(m && /process\.exit\(0\)/.test(m[0]), "让位语义为 process.exit(0) (extension 不会自动重启 · 接班顺其自然)");
}

// ═══ 5. 旧 batch 操作契约不破坏 ═══
console.log("");
console.log("[5] \u591a\u9009\u6279\u91cf\u5957\u4ef6\u5947\u516c\u4fdd\u7559");
{
  const ext = readFile(EXT);
  expect(/function _selIx\(\)/.test(ext), "_selIx 仍存在");
  expect(/function _selectedFor\(/.test(ext), "_selectedFor 仍存在");
  expect(/function _applyRange\(/.test(ext), "_applyRange 仍存在");
  expect(/case "setSkipBatch"/.test(ext), "setSkipBatch case 仍存在");
  expect(/case "copyAccounts"/.test(ext), "copyAccounts case 仍存在");
  expect(/case "removeBatch"/.test(ext), "removeBatch case 仍存在");
}

// 输出
console.log("");
for (const r of results) console.log(r);
console.log("");
console.log("\u2550\u2550\u2550 \u7ed3\u679c: " + pass + " \u8fc7 / " + fail + " \u8d25 \u2550\u2550\u2550");
process.exit(fail === 0 ? 0 : 1);
