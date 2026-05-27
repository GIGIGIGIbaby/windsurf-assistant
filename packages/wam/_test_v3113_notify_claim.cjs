// v3.11.3 止卡通知 claim/release 专项回归 · 道法自然 · 知止不殆
// 不启动 VS Code · 纯 Node.js 验证通知一次性闸门、标题过滤、常量对齐
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const SRC = __dirname;
const EXT_JS = path.join(SRC, "extension.js");
const DAO_JS = path.join(SRC, "dao_stuck.js");
const ext = fs.readFileSync(EXT_JS, "utf8");
const dao = fs.readFileSync(DAO_JS, "utf8");

let pass = 0, fail = 0;
function expect(name, cond) {
  if (cond) { pass++; process.stdout.write("  \x1b[32m✓\x1b[0m " + name + "\n"); }
  else { fail++; process.stdout.write("  \x1b[31m✗\x1b[0m " + name + "\n"); }
}
function section(name) { console.log("\n\x1b[36m[" + name + "]\x1b[0m"); }

// ═══════════════════════════════════════════════════════
// §A · 通知常量对齐 (extension.js 声明)
// ═══════════════════════════════════════════════════════
section("§A 通知常量对齐");
expect("HUB_NOTIFY_GLOBAL_CD = 5000", ext.includes("HUB_NOTIFY_GLOBAL_CD = 5000"));
expect("STUCK_STALE_MAX = 600", ext.includes("STUCK_STALE_MAX = 600"));
expect("STUCK_NOTIFY_AUTO_DISMISS_MS = 600000", ext.includes("STUCK_NOTIFY_AUTO_DISMISS_MS = 600000"));
expect("CONV_NOTIFY_DIR 路径含 _conv_notify_claims", ext.includes("_conv_notify_claims"));

// ═══════════════════════════════════════════════════════
// §B · _claimConvNotify 结构正确性
// ═══════════════════════════════════════════════════════
section("§B _claimConvNotify 结构");
expect("_claimConvNotify 函数存在", /function _claimConvNotify\s*\(/.test(ext));
expect("使用 fs.openSync(file, \"wx\") 独占创建", ext.includes('openSync(file, "wx")') || ext.includes("openSync(file, 'wx')"));
expect("写入 uuid + ts + pid", ext.includes("uuid") && ext.includes("Date.now()") && ext.includes("process.pid"));
expect("claim 失败返回 false", /return false.*claim|claim.*return false/.test(ext));
expect("claim 成功返回 true (openSync 后)", /return true/.test(ext));

// ═══════════════════════════════════════════════════════
// §C · _releaseConvNotifyClaim 结构正确性
// ═══════════════════════════════════════════════════════
section("§C _releaseConvNotifyClaim 结构");
expect("_releaseConvNotifyClaim 函数存在", /function _releaseConvNotifyClaim\s*\(/.test(ext));
expect("释放时删除文件 (unlinkSync)", ext.includes("unlinkSync") && /releaseConvNotifyClaim[\s\S]{0,200}unlinkSync/.test(ext));

// ═══════════════════════════════════════════════════════
// §D · _sweepConvNotifyClaims 结构正确性
// ═══════════════════════════════════════════════════════
section("§D _sweepConvNotifyClaims 结构");
expect("_sweepConvNotifyClaims 函数存在", /function _sweepConvNotifyClaims\s*\(/.test(ext));
expect("遍历 CONV_NOTIFY_DIR (readdirSync)", /sweepConvNotifyClaims[\s\S]{0,500}readdirSync/.test(ext));
expect("不在 activeUuids 中则删除", /activeSafe\.has\(safe\)/.test(ext) || /activeUuids.*has/.test(ext));

// ═══════════════════════════════════════════════════════
// §E · claim/release 实际文件系统验证 (临时目录)
// ═══════════════════════════════════════════════════════
section("§E claim/release 文件系统实测");
const TMP_DIR = path.join(os.tmpdir(), "_wam_test_notify_" + Date.now());
fs.mkdirSync(TMP_DIR, { recursive: true });

// 复现 _claimConvNotify 核心逻辑
function claimTest(uuid, info) {
  try {
    const safe = String(uuid || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safe) return false;
    const file = path.join(TMP_DIR, safe + ".json");
    const fd = fs.openSync(file, "wx");
    try { fs.writeFileSync(fd, JSON.stringify({ uuid, ts: Date.now(), pid: process.pid, ...info }, null, 2)); }
    finally { try { fs.closeSync(fd); } catch {} }
    return true;
  } catch { return false; }
}
function releaseTest(uuid) {
  try {
    const safe = String(uuid || "").replace(/[^a-zA-Z0-9_-]/g, "");
    const file = path.join(TMP_DIR, safe + ".json");
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}
}
function sweepTest(activeUuids) {
  try {
    const activeSafe = new Set([...(activeUuids || [])].map(u => String(u || "").replace(/[^a-zA-Z0-9_-]/g, "")));
    for (const f of fs.readdirSync(TMP_DIR)) {
      if (!f.endsWith(".json")) continue;
      const safe = f.slice(0, -5);
      if (!activeSafe.has(safe)) { try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch {} }
    }
  } catch {}
}

const UUID1 = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const UUID2 = "deadbeef-1234-5678-9abc-def012345678";

// [E1] 首次 claim 成功
expect("E1: 首次 claim → true", claimTest(UUID1, { level: "STUCK" }) === true);
// [E2] 二次 claim 同一 UUID 失败 (独占)
expect("E2: 二次 claim 同UUID → false (独占)", claimTest(UUID1, { level: "STUCK" }) === false);
// [E3] 不同 UUID 可以独立 claim
expect("E3: 不同 UUID → true", claimTest(UUID2, { level: "DEAD" }) === true);
// [E4] claim 文件内容可解析
const claimFile = path.join(TMP_DIR, UUID1.replace(/[^a-zA-Z0-9_-]/g, "") + ".json");
let claimData = null;
try { claimData = JSON.parse(fs.readFileSync(claimFile, "utf8")); } catch {}
expect("E4: claim 文件 JSON 有效", claimData !== null);
expect("E4b: claim 含 uuid", claimData && claimData.uuid === UUID1);
expect("E4c: claim 含 pid", claimData && typeof claimData.pid === "number");
expect("E4d: claim 含 ts", claimData && typeof claimData.ts === "number");
expect("E4e: claim 含 level", claimData && claimData.level === "STUCK");

// [E5] release 后可重新 claim
releaseTest(UUID1);
expect("E5: release 后文件不存在", !fs.existsSync(claimFile));
expect("E5b: release 后重新 claim → true", claimTest(UUID1, { level: "CRITICAL" }) === true);

// [E6] sweep 清理不活跃的 claim
// UUID1 和 UUID2 都有 claim · sweep 只保留 UUID1
sweepTest([UUID1]);
const uuid2Safe = UUID2.replace(/[^a-zA-Z0-9_-]/g, "");
expect("E6: sweep 删除不活跃 UUID2", !fs.existsSync(path.join(TMP_DIR, uuid2Safe + ".json")));
const uuid1Safe = UUID1.replace(/[^a-zA-Z0-9_-]/g, "");
expect("E6b: sweep 保留活跃 UUID1", fs.existsSync(path.join(TMP_DIR, uuid1Safe + ".json")));

// [E7] 空 UUID 安全
expect("E7: 空 UUID → false", claimTest("", {}) === false);
expect("E7b: null UUID → false", claimTest(null, {}) === false);

// 清理
try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}

// ═══════════════════════════════════════════════════════
// §F · 一次性闸门流程 (源码结构审查)
// ═══════════════════════════════════════════════════════
section("§F 一次性闸门流程 · _processHubStuck");
expect("_hubLastStuckUuids 为 Map", ext.includes("_hubLastStuckUuids = new Map()"));
expect("_stuckFirstNotifyTs 为 Map", ext.includes("_stuckFirstNotifyTs = new Map()"));
// 通知前检查: _hubLastStuckUuids.get → 有则 continue
expect("通知前检查闸门 _hubLastStuckUuids.get", /_hubLastStuckUuids\.get\(s\.uuid\)/.test(ext));
// claim 检查: _claimConvNotify → 失败则 continue
expect("claim 检查后 continue (失败不弹)", /!_claimConvNotify\(s\.uuid/.test(ext));
// 通知后记录: _hubLastStuckUuids.set
expect("通知后记录 _hubLastStuckUuids.set", /_hubLastStuckUuids\.set\(s\.uuid/.test(ext));
// 恢复时释放: _releaseConvNotifyClaim + _hubLastStuckUuids.delete
expect("恢复释放 _hubLastStuckUuids.delete", /_hubLastStuckUuids\.delete\(uuid\)/.test(ext));
expect("恢复释放 _releaseConvNotifyClaim", /_releaseConvNotifyClaim\(uuid\)/.test(ext));
expect("恢复释放 _stuckFirstNotifyTs.delete", /_stuckFirstNotifyTs\.delete\(uuid\)/.test(ext));
// 安全阀: size > 100 则 clear
expect("安全阀 _hubLastStuckUuids.size > 100", /_hubLastStuckUuids\.size > 100/.test(ext));

// ═══════════════════════════════════════════════════════
// §G · 标题显示过滤 · extension.js _convDisplayTitle
// ═══════════════════════════════════════════════════════
section("§G 标题显示过滤 · _convDisplayTitle");
expect("_convDisplayTitle 函数存在", /function _convDisplayTitle\s*\(/.test(ext));
expect("_isConvDisplayTitle 函数存在", /function _isConvDisplayTitle\s*\(/.test(ext));
expect("_cleanConvDisplayTitle 函数存在", /function _cleanConvDisplayTitle\s*\(/.test(ext));
// UUID-only 过滤: /^[0-9a-f]{8,36}$/i
expect("UUID-only 正则过滤", /\^\\?\[0-9a-f\].*\\?\{8,36\}/.test(ext));
// unnamed 过滤
expect("unnamed 过滤", ext.includes('"unnamed"') || ext.includes("'unnamed'"));
// 纯数字过滤
expect("纯数字序号过滤 /^\\d{6,}$/", /\\d\{6,\}/.test(ext));

// ═══════════════════════════════════════════════════════
// §H · 标题显示过滤 · dao_stuck.js _displayTitleFor
// ═══════════════════════════════════════════════════════
section("§H 标题显示过滤 · dao_stuck.js");
expect("_displayTitleFor 函数存在", /function _displayTitleFor\s*\(/.test(dao));
expect("_isReadableDisplayTitle 或 _isReadableTitle 存在",
  /function _isReadable(Display)?Title\s*\(/.test(dao));
expect("_cleanDisplayTitle 函数存在", /function _cleanDisplayTitle\s*\(/.test(dao));
// 前后端一致: UUID-only 过滤
expect("dao UUID-only 正则过滤", /\^\\?\[0-9a-f\].*\\?\{8,36\}/.test(dao));
expect("dao unnamed 过滤", dao.includes('"unnamed"') || dao.includes("'unnamed'"));
expect("dao 纯数字过滤", /\\d\{6,\}/.test(dao));

// ═══════════════════════════════════════════════════════
// §I · Hub 数据 stuckList/streamingList 可见过滤 · dao_stuck.js
// ═══════════════════════════════════════════════════════
section("§I Hub 输出可见过滤 · dao_stuck.js");
expect("_visibleStuckList 过滤逻辑", dao.includes("_visibleStuckList"));
expect("stuckList 用 _displayTitleFor", /_visibleStuckList[\s\S]{0,300}_displayTitleFor/.test(dao));
expect("stuckList .filter(Boolean)", /_visibleStuckList[\s\S]{0,500}\.filter\(Boolean\)/.test(dao));
expect("stuck 计数与可见列表同源", /stuck:\s*_visibleStuckList\.filter/.test(dao));
expect("error 计数与可见列表同源", /error:\s*_visibleStuckList\.filter/.test(dao));
// streamingList 出口条件不绑 title
expect("streamingList 条件仅 _curConv", !/streamingList\s*:\s*_curConv\s*&&\s*_curTitle/.test(dao));
// 兜底短UUID标题
expect("兜底「对话 #短UUID」", dao.includes("对话 #") && /slice\(0,\s*8\)/.test(dao));

// ═══════════════════════════════════════════════════════
// §J · _processHubStuck 过滤链完整性 · extension.js
// ═══════════════════════════════════════════════════════
section("§J 前端 stuck 过滤链");
// stuckList 渲染时过滤 staleSec > STUCK_STALE_MAX
expect("渲染 stuckList 过滤 staleSec>STUCK_STALE_MAX", /staleSec\s*>\s*STUCK_STALE_MAX/.test(ext));
// 通知前过滤 staleSec > STUCK_STALE_MAX
expect("通知 stuckList 过滤 staleSec>STUCK_STALE_MAX",
  (ext.match(/staleSec\s*>\s*STUCK_STALE_MAX/g) || []).length >= 2);
// 渲染时过滤 _convDisplayTitle
expect("渲染 stuckList 过滤 _convDisplayTitle", /_convDisplayTitle\(\s*s\.uuid/.test(ext));
// 通知时过滤 _convDisplayTitle
expect("通知 stuck 过滤 _convDisplayTitle", /_convDisplayTitle\(\s*s\.uuid[\s\S]{0,50}s\.title/.test(ext));
// 10min 自动消失
expect("10min 自动消失 _stuckFirstNotifyTs", /_stuckFirstNotifyTs\.get\(s\.uuid\)/.test(ext));
expect("10min 自动消失与 STUCK_NOTIFY_AUTO_DISMISS_MS 对比", /STUCK_NOTIFY_AUTO_DISMISS_MS/.test(ext));
// sweepConvNotifyClaims 每轮调用
expect("每轮 _sweepConvNotifyClaims", /_sweepConvNotifyClaims\(curStuckUuids\)/.test(ext));

// ═══════════════════════════════════════════════════════
// FINAL
// ═══════════════════════════════════════════════════════
console.log("\n\x1b[33m══════════════════════════════════════════════════\x1b[0m");
console.log(`  v3.11.3 止卡通知 claim/release 专项: \x1b[${fail === 0 ? '32' : '31'}m${pass} 过 / ${fail} 败\x1b[0m`);
console.log("\x1b[33m══════════════════════════════════════════════════\x1b[0m");
process.exit(fail > 0 ? 1 : 0);
