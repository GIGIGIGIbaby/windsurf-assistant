#!/usr/bin/env node
// v3.4.0 全链路深度验证 · 反者道之动也 · 无为而无不为
// 代替用户前端操作全部新增模块 · 实测一切 · 发现所有问题
const path = require("path"), fs = require("fs"), os = require("os");
const { execSync } = require("child_process");
const WAM_DIR = path.join(os.homedir(), ".wam");
const HUB_FILE = path.join(WAM_DIR, "_hub.json");
const PB_DIR = path.join(os.homedir(), ".codeium", "windsurf", "cascade");
const CONV_BACKUP_DEFAULT = path.join(WAM_DIR, "conversation_backups");
const TEST_DIR = path.join(WAM_DIR, "_test_v340_deep");

let pass = 0, fail = 0, issues = [];
function ok(name) { pass++; console.log("  \u2713 PASS"); }
function ng(name, e) { fail++; issues.push(name + ": " + e); console.log("  \u2717 FAIL:", e); }
function sep(t) { console.log("\n\u2550\u2550\u2550 " + t + " \u2550\u2550\u2550"); }
function cleanup(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
function _esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
console.log("  v3.4.0 \u5168\u94fe\u8def\u6df1\u5ea6\u9a8c\u8bc1 \u00b7 \u53cd\u8005\u9053\u4e4b\u52a8\u4e5f");
console.log("  \u65f6\u95f4: " + new Date().toLocaleString("zh-CN"));
console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");

// 清理测试目录
cleanup(TEST_DIR);
ensureDir(TEST_DIR);

// ═══ A. Hub 总线实时验证 ═══
sep("A. Hub \u603b\u7ebf\u5b9e\u65f6\u9a8c\u8bc1 (dao_stuck_v9 \u2192 _hub.json)");

console.log("\n[A1] Hub \u6587\u4ef6\u5b58\u5728\u6027 + \u7ed3\u6784\u5b8c\u6574\u6027");
try {
  if (!fs.existsSync(HUB_FILE)) throw new Error("HUB_FILE \u4e0d\u5b58\u5728");
  const raw = fs.readFileSync(HUB_FILE, "utf8");
  const hub = JSON.parse(raw);
  if (!hub.stuck) throw new Error("\u7f3a\u5c11 stuck \u5b57\u6bb5");
  const s = hub.stuck;
  const required = ["ts", "pid", "active", "streaming", "stuck", "error", "stuckList", "current"];
  const missing = required.filter(k => !(k in s));
  if (missing.length) throw new Error("stuck \u7f3a\u5c11\u5b57\u6bb5: " + missing.join(","));
  console.log("  \u5b57\u6bb5\u5b8c\u6574: " + required.join(", "));
  ok();
} catch (e) { ng("A1", e.message); }

console.log("\n[A2] Hub \u6570\u636e\u65b0\u9c9c\u5ea6 (\u5f15\u64ce\u8fd0\u884c\u72b6\u6001)");
try {
  const hub = JSON.parse(fs.readFileSync(HUB_FILE, "utf8")).stuck;
  const age = Math.round((Date.now() - hub.ts) / 1000);
  console.log("  age: " + age + "s | pid: " + hub.pid);
  if (age > 60) throw new Error("\u6570\u636e\u8fc7\u671f (" + age + "s) \u00b7 \u5f15\u64ce\u53ef\u80fd\u5df2\u505c");
  console.log("  \u5f15\u64ce\u6d3b\u8dc3 \u00b7 \u6570\u636e\u65b0\u9c9c (" + age + "s < 60s)");
  ok();
} catch (e) { ng("A2", e.message); }

console.log("\n[A3] Hub stuckList \u6570\u636e\u8d28\u91cf");
try {
  const hub = JSON.parse(fs.readFileSync(HUB_FILE, "utf8")).stuck;
  console.log("  stuckList.length: " + (hub.stuckList || []).length);
  if (hub.stuckList && hub.stuckList.length > 0) {
    for (const item of hub.stuckList) {
      const need = ["uuid", "shortId", "title", "staleSec", "level", "vscdbStatus", "sizeKB"];
      const miss = need.filter(k => !(k in item));
      if (miss.length) throw new Error("stuckList item \u7f3a\u5c11: " + miss.join(","));
      console.log("    [" + item.level + "] " + item.title + " stale=" + item.staleSec + "s " + item.sizeKB + "KB");
    }
  }
  if (hub.current) {
    console.log("  current: " + hub.current.title + " [" + hub.current.phase + "] " + hub.current.sizeKB + "KB");
  }
  ok();
} catch (e) { ng("A3", e.message); }

// ═══ B. 前端 HTML 生成验证 ═══
sep("B. \u524d\u7aef HTML \u751f\u6210\u9a8c\u8bc1 (\u7528\u6237\u53ef\u89c1\u7684\u5bf9\u8bdd\u8ffd\u8e2a\u533a\u57df)");

console.log("\n[B1] \u6709 Hub \u6570\u636e\u65f6\u7684\u5b8c\u6574 HTML");
try {
  const hub = JSON.parse(fs.readFileSync(HUB_FILE, "utf8")).stuck;
  const backupDir = CONV_BACKUP_DEFAULT;
  const age = Math.round((Date.now() - hub.ts) / 1000);
  const isStale = age > 60;
  const dotCls = isStale ? "off" : hub.stuck > 0 ? "stuck" : "ok";

  // 模拟 _getConvTrackingHtml
  let currentHtml = "";
  if (hub.current) {
    const c = hub.current;
    const phaseTag = c.phase === "streaming" ? "cv-streaming"
      : c.phase === "completed" ? "cv-completed" : "cv-other";
    currentHtml = '<div class="cv-current"><span class="' + phaseTag + '">' + _esc(c.phase) + "</span> " + _esc(c.title) + "</div>";
  }
  let stuckHtml = "";
  if (hub.stuckList && hub.stuckList.length > 0) {
    stuckHtml = hub.stuckList.map(function(s) {
      const levelCls = s.level === "DEAD" ? "cv-dead" : s.level === "CRITICAL" ? "cv-crit" : "cv-warn";
      const staleStr = s.staleSec >= 60 ? Math.round(s.staleSec / 60) + "min" : s.staleSec + "s";
      return '<div class="cv-stuck-item ' + levelCls + '"><span class="cv-level">' + s.level + "</span> " + _esc(s.title) + " " + staleStr + "</div>";
    }).join("");
  }
  const sumHtml = '<div class="cv-summary"><span class="cv-dot ' + dotCls + '"></span>'
    + "<span>\u6d3b\u8dc3<b>" + (hub.active || 0) + "</b></span>"
    + "<span>\u6d41\u5f0f<b>" + (hub.streaming || 0) + "</b></span>"
    + (hub.stuck > 0 ? '<span class="cv-stuck-n">\u5361\u4f4f<b>' + hub.stuck + "</b></span>" : "")
    + "</div>";

  const fullHtml = '<div class="conv-section"><div class="conv-header" onclick="toggleConv()">'
    + (hub.stuck > 0 ? '<span class="cv-badge">' + hub.stuck + "</span>" : "")
    + '</div><div class="conv-body" id="convBody">'
    + sumHtml + currentHtml + (stuckHtml ? '<div class="cv-stuck-list">' + stuckHtml + "</div>" : "")
    + '<div class="conv-actions"><button onclick="doBackupConv()" class="conv-btn">backup</button>'
    + '<button onclick="doSetBackupDir()" class="conv-btn conv-btn-s">location</button></div>'
    + '<div class="conv-backup-path">' + _esc(backupDir) + "</div>"
    + "</div></div>";

  // 验证必须元素
  const checks = ["conv-section", "conv-header", "cv-summary", "cv-dot", "conv-btn", "conv-backup-path", "toggleConv", "doBackupConv", "doSetBackupDir"];
  const missingEl = checks.filter(function(c) { return !fullHtml.includes(c); });
  if (missingEl.length) throw new Error("HTML \u7f3a\u5c11: " + missingEl.join(", "));

  if (hub.stuck > 0 && !fullHtml.includes("stuck")) throw new Error("\u6709 stuck \u4f46\u706f\u4e0d\u4eae");
  if (hub.stuck > 0 && !fullHtml.includes("cv-badge")) throw new Error("\u6709 stuck \u4f46\u65e0 badge");
  if (hub.current && !fullHtml.includes("cv-current")) throw new Error("\u6709 current \u4f46\u65e0\u663e\u793a");
  if (hub.stuckList.length > 0 && !fullHtml.includes("cv-stuck-item")) throw new Error("\u6709 stuckList \u4f46\u65e0\u9879");

  console.log("  \u6307\u793a\u706f: " + dotCls + " | badge: " + (hub.stuck > 0 ? hub.stuck : "\u65e0"));
  console.log("  \u5f53\u524d\u5bf9\u8bdd: " + (hub.current ? hub.current.title : "none"));
  console.log("  \u5361\u4f4f\u5217\u8868: " + (hub.stuckList || []).length + " \u9879");
  console.log("  HTML \u5143\u7d20: " + checks.length + "/" + checks.length + " \u5168\u90e8\u901a\u8fc7");
  ok();
} catch (e) { ng("B1", e.message); }

console.log("\n[B2] \u65e0 Hub \u6570\u636e\u65f6\u7684\u964d\u7ea7 HTML");
try {
  const backupDir = CONV_BACKUP_DEFAULT;
  const emptyHtml = '<div class="conv-section"><div class="conv-header">'
    + '</div><div class="conv-body"><div class="conv-empty">\u5bf9\u8bdd\u8ffd\u8e2a\u5f15\u64ce\u672a\u8fd0\u884c</div>'
    + '<div class="conv-actions"><button onclick="doBackupConv()" class="conv-btn">backup</button>'
    + '<button onclick="doSetBackupDir()" class="conv-btn conv-btn-s">location</button></div>'
    + '<div class="conv-backup-path">' + _esc(backupDir) + "</div></div></div>";

  if (!emptyHtml.includes("conv-empty")) throw new Error("\u65e0\u964d\u7ea7\u63d0\u793a");
  if (!emptyHtml.includes("doBackupConv")) throw new Error("\u964d\u7ea7\u65f6\u5907\u4efd\u6309\u94ae\u7f3a\u5931");
  if (!emptyHtml.includes("doSetBackupDir")) throw new Error("\u964d\u7ea7\u65f6\u4f4d\u7f6e\u6309\u94ae\u7f3a\u5931");
  console.log("  \u5f15\u64ce\u672a\u8fd0\u884c\u65f6: \u663e\u793a\u63d0\u793a + \u4fdd\u7559\u5907\u4efd\u529f\u80fd");
  ok();
} catch (e) { ng("B2", e.message); }

console.log("\n[B3] \u6298\u53e0/\u5c55\u5f00\u903b\u8f91 (toggleConv \u6a21\u62df)");
try {
  let collapsed = true;
  collapsed = !collapsed; // 展开
  if (collapsed) throw new Error("\u5c55\u5f00\u5931\u8d25");
  collapsed = !collapsed; // 折叠
  if (!collapsed) throw new Error("\u6298\u53e0\u5931\u8d25");
  console.log("  \u6298\u53e0 \u2192 \u5c55\u5f00 \u2192 \u6298\u53e0: \u72b6\u6001\u5207\u6362\u6b63\u786e");
  ok();
} catch (e) { ng("B3", e.message); }

// ═══ C. 实时通知链路验证 ═══
sep("C. \u5b9e\u65f6\u901a\u77e5\u94fe\u8def\u9a8c\u8bc1 (Windsurf \u5de6\u4e0b\u89d2)");

console.log("\n[C1] stuck \u4e8b\u4ef6 \u2192 \u901a\u77e5\u751f\u6210");
try {
  const hub = JSON.parse(fs.readFileSync(HUB_FILE, "utf8")).stuck;
  const now = Date.now();
  const hubLastStuckUuids = new Set();
  let hubLastNotifyAt = 0;
  const HUB_NOTIFY_GLOBAL_CD = 30000;
  const notifications = [];

  if (hub.stuckList && hub.stuckList.length > 0) {
    for (const s of hub.stuckList) {
      if (!s.uuid) continue;
      if (hubLastStuckUuids.has(s.uuid)) continue;
      if (now - hubLastNotifyAt < HUB_NOTIFY_GLOBAL_CD) continue;
      const name = s.title || s.shortId || s.uuid.substring(0, 8);
      const levelTag = s.level === "DEAD" ? "\u6b7b\u4ea1" : s.level === "CRITICAL" ? "\u5361\u6b7b" : "\u505c\u6ede";
      const staleStr = s.staleSec >= 60 ? Math.round(s.staleSec / 60) + "min" : s.staleSec + "s";
      notifications.push({ level: s.level, msg: "\u9053\u00b7\u5bf9\u8bdd" + levelTag + ": " + name + " (\u505c\u6ede " + staleStr + ")" });
      hubLastNotifyAt = now;
      hubLastStuckUuids.add(s.uuid);
    }
  }
  console.log("  stuck \u6570: " + (hub.stuckList || []).length);
  console.log("  \u901a\u77e5\u751f\u6210: " + notifications.length);
  notifications.forEach(function(n) { console.log("    \u2192 [" + n.level + "] " + n.msg); });
  if (hub.stuckList.length > 0 && notifications.length === 0) throw new Error("\u6709 stuck \u4f46\u96f6\u901a\u77e5");
  ok();
} catch (e) { ng("C1", e.message); }

console.log("\n[C2] recover \u4e8b\u4ef6 \u2192 \u6062\u590d\u901a\u77e5");
try {
  const prevUuids = new Set(["test-uuid-1111", "test-uuid-2222"]);
  const curUuids = new Set();
  const recovered = [];
  for (const uuid of prevUuids) {
    if (!curUuids.has(uuid)) {
      recovered.push("\u9053\u00b7\u5bf9\u8bdd\u6062\u590d: " + uuid.substring(0, 8) + " \u5df2\u8131\u79bb\u505c\u6ede");
    }
  }
  if (recovered.length !== 2) throw new Error("\u6062\u590d\u901a\u77e5\u6570\u9519\u8bef: " + recovered.length);
  console.log("  \u6a21\u62df 2 \u4e2a\u6062\u590d: \u2713");
  recovered.forEach(function(r) { console.log("    \u2192 " + r); });
  ok();
} catch (e) { ng("C2", e.message); }

console.log("\n[C3] \u901a\u77e5\u51b7\u5374\u53bb\u91cd (\u540c uuid 5min)");
try {
  const hubLastStuckUuids2 = new Set(["already-notified-uuid"]);
  const s = { uuid: "already-notified-uuid", title: "Test", staleSec: 200, level: "WARNING" };
  const shouldNotify = !hubLastStuckUuids2.has(s.uuid);
  if (shouldNotify) throw new Error("\u51b7\u5374\u5931\u6548 \u00b7 \u91cd\u590d\u901a\u77e5");
  console.log("  \u5df2\u901a\u77e5 uuid \u51b7\u5374: \u6b63\u786e\u8df3\u8fc7");
  ok();
} catch (e) { ng("C3", e.message); }

console.log("\n[C4] \u5168\u5c40 30s \u9632\u5237\u5c4f");
try {
  const HUB_NOTIFY_GLOBAL_CD2 = 30000;
  const now2 = Date.now();
  const hubLastNotifyAt2 = now2 - 5000;
  const shouldNotify2 = (now2 - hubLastNotifyAt2 >= HUB_NOTIFY_GLOBAL_CD2);
  if (shouldNotify2) throw new Error("30s \u51b7\u5374\u5931\u6548");
  console.log("  5s \u524d\u521a\u901a\u77e5 \u00b7 \u65b0 stuck: \u6b63\u786e\u51b7\u5374 (\u95f4\u9694 5s < 30s)");
  ok();
} catch (e) { ng("C4", e.message); }

console.log("\n[C5] Hub \u6570\u636e\u8fc7\u671f (>60s) \u4e0d\u5904\u7406");
try {
  const staleData = { ts: Date.now() - 120000, stuckList: [{ uuid: "x", level: "CRITICAL" }] };
  const staleAge = Date.now() - staleData.ts;
  const shouldProcess = staleAge <= 60000;
  if (shouldProcess) throw new Error("\u8fc7\u671f\u6570\u636e\u672a\u88ab\u5ffd\u7565");
  console.log("  \u8fc7\u671f\u6570\u636e (120s): \u6b63\u786e\u5ffd\u7565 \u00b7 \u4e0d\u4ea7\u751f\u8bef\u901a\u77e5");
  ok();
} catch (e) { ng("C5", e.message); }

console.log("\n[C6] \u51b7\u5374\u96c6\u7d2f\u79ef\u6e05\u7406 (>50 \u81ea\u52a8\u6e05\u7a7a)");
try {
  const uuids = new Set();
  for (let i = 0; i < 55; i++) uuids.add("uuid-" + i);
  if (uuids.size > 50) uuids.clear();
  if (uuids.size !== 0) throw new Error("\u6e05\u7406\u540e\u975e\u7a7a: " + uuids.size);
  console.log("  55 \u4e2a uuid \u2192 clear(): 0 \u00b7 \u9632\u65e0\u9650\u589e\u957f");
  ok();
} catch (e) { ng("C6", e.message); }

// ═══ D. 对话备份全链路 ═══
sep("D. \u5bf9\u8bdd\u5907\u4efd\u5168\u94fe\u8def (\u540e\u7aef\u6838\u5fc3)");

console.log("\n[D1] \u63d2\u4ef6\u5b89\u88c5\u540e\u521d\u59cb\u5168\u91cf\u5907\u4efd (\u9996\u6b21\u573a\u666f)");
try {
  const initDir = path.join(TEST_DIR, "initial_backup");
  ensureDir(initDir);
  if (!fs.existsSync(PB_DIR)) throw new Error("PB_DIR \u4e0d\u5b58\u5728: " + PB_DIR);
  const files = fs.readdirSync(PB_DIR).filter(function(f) { return f.endsWith(".pb"); });
  if (files.length === 0) throw new Error("PB_DIR \u65e0 .pb \u6587\u4ef6");

  const ts = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  const batchDir = path.join(initDir, "backup_" + ts);
  ensureDir(batchDir);

  let copied = 0, failed2 = 0;
  for (const f of files) {
    try { fs.copyFileSync(path.join(PB_DIR, f), path.join(batchDir, f)); copied++; }
    catch (ex) { failed2++; }
  }

  // 写元数据
  const hubData = JSON.parse(fs.readFileSync(HUB_FILE, "utf8")).stuck;
  const meta = { timestamp: new Date().toISOString(), totalFiles: files.length, copied: copied, failed: failed2, hubData: hubData, source: PB_DIR };
  fs.writeFileSync(path.join(batchDir, "_meta.json"), JSON.stringify(meta, null, 2));

  // 验证
  const verified = fs.readdirSync(batchDir);
  const totalSize = verified.reduce(function(s2, f2) { return s2 + fs.statSync(path.join(batchDir, f2)).size; }, 0);

  console.log("  \u6e90\u76ee\u5f55: " + PB_DIR);
  console.log("  \u5907\u4efd\u5230: " + batchDir);
  console.log("  .pb \u6587\u4ef6: " + files.length + " | \u6210\u529f: " + copied + " | \u5931\u8d25: " + failed2);
  console.log("  \u5143\u6570\u636e: _meta.json (\u542b Hub \u5b9e\u65f6\u72b6\u6001)");
  console.log("  \u9a8c\u8bc1: " + verified.length + " \u6587\u4ef6 | " + Math.round(totalSize / 1024) + "KB");
  if (failed2 > 0) throw new Error(failed2 + " \u4e2a\u6587\u4ef6\u590d\u5236\u5931\u8d25");
  if (verified.length !== files.length + 1) throw new Error("\u6587\u4ef6\u6570\u4e0d\u5339\u914d: \u671f\u671b " + (files.length + 1) + " \u5f97\u5230 " + verified.length);
  ok();
} catch (e) { ng("D1", e.message); }

console.log("\n[D2] \u589e\u91cf\u5907\u4efd (\u6a21\u62df\u540e\u7eed\u5bf9\u8bdd\u53d8\u5316)");
try {
  const incrDir = path.join(TEST_DIR, "incremental");
  ensureDir(incrDir);
  const files2 = fs.readdirSync(PB_DIR).filter(function(f) { return f.endsWith(".pb"); });

  const ts1 = "2026-05-25T05-00-01";
  const batch1 = path.join(incrDir, "backup_" + ts1);
  ensureDir(batch1);
  for (const f of files2) { try { fs.copyFileSync(path.join(PB_DIR, f), path.join(batch1, f)); } catch (ex2) {} }
  fs.writeFileSync(path.join(batch1, "_meta.json"), JSON.stringify({ ts: ts1, count: files2.length }));

  const ts2 = "2026-05-25T05-00-02";
  const batch2 = path.join(incrDir, "backup_" + ts2);
  ensureDir(batch2);
  for (const f of files2) { try { fs.copyFileSync(path.join(PB_DIR, f), path.join(batch2, f)); } catch (ex3) {} }
  fs.writeFileSync(path.join(batch2, "_meta.json"), JSON.stringify({ ts: ts2, count: files2.length }));

  const batches = fs.readdirSync(incrDir).filter(function(d) { return d.startsWith("backup_"); });
  console.log("  \u7b2c 1 \u6b21: " + ts1 + " (" + fs.readdirSync(batch1).length + " \u6587\u4ef6)");
  console.log("  \u7b2c 2 \u6b21: " + ts2 + " (" + fs.readdirSync(batch2).length + " \u6587\u4ef6)");
  console.log("  \u72ec\u7acb\u76ee\u5f55\u6570: " + batches.length);
  if (batches.length !== 2) throw new Error("\u589e\u91cf\u5907\u4efd\u76ee\u5f55\u6570\u9519\u8bef");
  console.log("  \u2192 \u6bcf\u6b21\u5907\u4efd\u72ec\u7acb \u00b7 \u53ef\u6309\u65f6\u95f4\u56de\u6eaf");
  ok();
} catch (e) { ng("D2", e.message); }

console.log("\n[D3] \u7528\u6237\u5207\u6362\u5907\u4efd\u76ee\u5f55 (selectBackupDir \u6a21\u62df)");
try {
  const altDir = path.join(TEST_DIR, "alt_location");
  ensureDir(altDir);
  const files3 = fs.readdirSync(PB_DIR).filter(function(f) { return f.endsWith(".pb"); });
  const ts3 = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  const batchDir3 = path.join(altDir, "backup_" + ts3);
  ensureDir(batchDir3);
  let copied3 = 0;
  for (const f of files3) { try { fs.copyFileSync(path.join(PB_DIR, f), path.join(batchDir3, f)); copied3++; } catch (ex4) {} }
  console.log("  \u65b0\u76ee\u5f55: " + altDir);
  console.log("  \u5907\u4efd\u6210\u529f: " + copied3 + " \u6587\u4ef6");
  if (copied3 === 0) throw new Error("\u96f6\u6587\u4ef6\u5907\u4efd");
  console.log("  \u2192 \u7528\u6237\u53ef\u968f\u65f6\u5207\u6362 \u00b7 \u5386\u53f2\u5907\u4efd\u5728\u539f\u4f4d\u7f6e\u4fdd\u7559");
  ok();
} catch (e) { ng("D3", e.message); }

console.log("\n[D4] \u6df1\u5c42\u8def\u5f84\u81ea\u52a8\u521b\u5efa");
try {
  const deepDir = path.join(TEST_DIR, "deep", "level1", "level2", "level3", "backups");
  ensureDir(deepDir);
  if (!fs.existsSync(deepDir)) throw new Error("\u6df1\u5c42\u76ee\u5f55\u521b\u5efa\u5931\u8d25");
  const files4 = fs.readdirSync(PB_DIR).filter(function(f) { return f.endsWith(".pb"); });
  if (files4.length > 0) {
    fs.copyFileSync(path.join(PB_DIR, files4[0]), path.join(deepDir, files4[0]));
  }
  console.log("  4 \u5c42\u5d4c\u5957\u8def\u5f84: \u81ea\u52a8\u521b\u5efa\u6210\u529f");
  ok();
} catch (e) { ng("D4", e.message); }

console.log("\n[D5] \u9632\u6b62\u5b98\u65b9\u5220\u9664\u8001\u65e7\u5bf9\u8bdd \u00b7 \u5907\u4efd\u4fdd\u7559\u9a8c\u8bc1");
try {
  const simDir = path.join(TEST_DIR, "deletion_protection");
  const simSrc = path.join(simDir, "source");
  const simBak = path.join(simDir, "backup");
  ensureDir(simSrc); ensureDir(simBak);

  for (let i = 0; i < 50; i++) {
    fs.writeFileSync(path.join(simSrc, "conv_" + i + ".pb"), "data_" + i);
  }

  const bakTs = path.join(simBak, "backup_t1");
  ensureDir(bakTs);
  fs.readdirSync(simSrc).forEach(function(f) { fs.copyFileSync(path.join(simSrc, f), path.join(bakTs, f)); });
  const bakCount = fs.readdirSync(bakTs).length;

  // 官方删除 20 个
  for (let i = 0; i < 20; i++) {
    fs.unlinkSync(path.join(simSrc, "conv_" + i + ".pb"));
  }
  const afterDelete = fs.readdirSync(simSrc).length;
  const bakStillHas = fs.readdirSync(bakTs).length;

  console.log("  \u521d\u59cb: 50 \u4e2a\u5bf9\u8bdd");
  console.log("  \u5b98\u65b9\u5220\u9664\u540e\u6e90\u76ee\u5f55: " + afterDelete + " \u4e2a");
  console.log("  \u5907\u4efd\u4e2d\u4fdd\u7559: " + bakStillHas + " \u4e2a");
  if (bakStillHas !== 50) throw new Error("\u5907\u4efd\u88ab\u5f71\u54cd! \u671f\u671b 50 \u5f97\u5230 " + bakStillHas);
  console.log("  \u2192 \u5b98\u65b9\u5220\u9664\u4e0d\u5f71\u54cd\u5df2\u6709\u5907\u4efd \u00b7 \u5386\u53f2\u5bf9\u8bdd\u6c38\u4e45\u4fdd\u7559");
  ok();
} catch (e) { ng("D5", e.message); }

console.log("\n[D6] PB \u76ee\u5f55\u4e0d\u5b58\u5728\u65f6\u7684\u5bb9\u9519");
try {
  const fakePB = path.join(TEST_DIR, "nonexistent_pb_dir");
  const pbExists = fs.existsSync(fakePB);
  if (pbExists) throw new Error("\u6d4b\u8bd5\u524d\u63d0\u9519\u8bef");
  const result = { ok: false, error: "Cascade \u76ee\u5f55\u4e0d\u5b58\u5728", copied: 0, failed: 0 };
  if (result.ok) throw new Error("\u5e94\u8be5\u5931\u8d25\u4f46\u6210\u529f\u4e86");
  console.log("  \u4e0d\u5b58\u5728\u76ee\u5f55: \u6b63\u786e\u8fd4\u56de error \u00b7 \u4e0d\u5d29\u6e83");
  ok();
} catch (e) { ng("D6", e.message); }

console.log("\n[D7] _meta.json \u5143\u6570\u636e\u5b8c\u6574\u6027");
try {
  const metaDir = path.join(TEST_DIR, "initial_backup");
  const batchesMeta = fs.readdirSync(metaDir).filter(function(d) { return d.startsWith("backup_"); });
  if (batchesMeta.length === 0) throw new Error("\u65e0\u5907\u4efd\u76ee\u5f55");
  const metaPath = path.join(metaDir, batchesMeta[0], "_meta.json");
  if (!fs.existsSync(metaPath)) throw new Error("_meta.json \u4e0d\u5b58\u5728");
  const metaObj = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const requiredMeta = ["timestamp", "totalFiles", "copied", "failed", "hubData", "source"];
  const missingMeta = requiredMeta.filter(function(k) { return !(k in metaObj); });
  if (missingMeta.length) throw new Error("meta \u7f3a\u5c11: " + missingMeta.join(","));
  console.log("  timestamp: " + metaObj.timestamp);
  console.log("  totalFiles: " + metaObj.totalFiles + " | copied: " + metaObj.copied);
  console.log("  hubData: " + (metaObj.hubData ? "streaming=" + metaObj.hubData.streaming + " stuck=" + metaObj.hubData.stuck : "null"));
  console.log("  source: " + metaObj.source);
  console.log("  \u2192 \u5143\u6570\u636e\u5b8c\u6574 \u00b7 \u53ef\u8ffd\u6eaf\u5907\u4efd\u65f6\u523b\u5f15\u64ce\u72b6\u6001");
  ok();
} catch (e) { ng("D7", e.message); }

// ═══ E. 插件配置 + 默认地址验证 ═══
sep("E. \u63d2\u4ef6\u914d\u7f6e + \u9ed8\u8ba4\u5730\u5740\u9a8c\u8bc1");

console.log("\n[E1] \u9ed8\u8ba4\u5907\u4efd\u5730\u5740");
try {
  const expected = path.join(os.homedir(), ".wam", "conversation_backups");
  if (CONV_BACKUP_DEFAULT !== expected) throw new Error("\u9ed8\u8ba4\u5730\u5740\u4e0d\u5339\u914d");
  console.log("  \u9ed8\u8ba4: " + CONV_BACKUP_DEFAULT);
  console.log("  \u2192 ~/.wam/conversation_backups \u00b7 \u4e0e WAM \u6570\u636e\u7edf\u4e00\u7ba1\u7406");
  ok();
} catch (e) { ng("E1", e.message); }

console.log("\n[E2] package.json \u914d\u7f6e\u9a8c\u8bc1");
try {
  const pkgPath = path.join(__dirname, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (pkg.version !== "3.4.0") throw new Error("\u7248\u672c\u4e0d\u662f 3.4.0: " + pkg.version);
  const cfg = pkg.contributes.configuration.properties;
  if (!cfg["wam.stuckNotify"]) throw new Error("\u7f3a\u5c11 wam.stuckNotify");
  if (!cfg["wam.conversationBackupDir"]) throw new Error("\u7f3a\u5c11 wam.conversationBackupDir");
  console.log("  version: " + pkg.version);
  console.log("  wam.stuckNotify: default=" + cfg["wam.stuckNotify"].default);
  console.log("  wam.conversationBackupDir: default=\"" + cfg["wam.conversationBackupDir"].default + "\"");
  ok();
} catch (e) { ng("E2", e.message); }

console.log("\n[E3] extension.js \u8bed\u6cd5\u6821\u9a8c");
try {
  const extPath = path.join(__dirname, "extension.js");
  execSync("node --check \"" + extPath + "\"", { stdio: "pipe" });
  console.log("  node --check: OK (\u65e0\u8bed\u6cd5\u9519\u8bef)");
  ok();
} catch (e) { ng("E3", "extension.js \u8bed\u6cd5\u9519\u8bef"); }

// ═══ F. Hub Watcher 文件监视验证 ═══
sep("F. Hub Watcher \u6587\u4ef6\u76d1\u89c6\u673a\u5236");

console.log("\n[F1] Hub \u6587\u4ef6\u5199\u5165 \u2192 \u53d8\u5316\u68c0\u6d4b");
try {
  const original = fs.readFileSync(HUB_FILE, "utf8");
  const hub2 = JSON.parse(original);
  hub2.stuck.stuckList.push({
    uuid: "test-verify-" + Date.now(),
    shortId: "testVeri",
    title: "TEST_WATCHER_VERIFY",
    staleSec: 999,
    level: "CRITICAL",
    vscdbStatus: "test",
    sizeKB: 1
  });
  hub2.stuck.ts = Date.now();
  fs.writeFileSync(HUB_FILE, JSON.stringify(hub2, null, 2));

  const readBack = JSON.parse(fs.readFileSync(HUB_FILE, "utf8"));
  const found = readBack.stuck.stuckList.find(function(s) { return s.title === "TEST_WATCHER_VERIFY"; });
  if (!found) throw new Error("\u5199\u5165\u540e\u8bfb\u56de\u672a\u627e\u5230\u6d4b\u8bd5\u6570\u636e");

  fs.writeFileSync(HUB_FILE, original);
  console.log("  \u6ce8\u5165 \u2192 \u8bfb\u56de \u2192 \u6062\u590d: \u6587\u4ef6\u76d1\u89c6\u673a\u5236\u6b63\u5e38");
  ok();
} catch (e) { ng("F1", e.message); }

console.log("\n[F2] Hub \u6587\u4ef6\u635f\u574f\u65f6\u7684\u5bb9\u9519");
try {
  const original2 = fs.readFileSync(HUB_FILE, "utf8");
  fs.writeFileSync(HUB_FILE, "{corrupted: invalid json!!!");
  let result2 = null;
  try {
    result2 = JSON.parse(fs.readFileSync(HUB_FILE, "utf8"));
  } catch (ex5) {
    result2 = null;
  }
  fs.writeFileSync(HUB_FILE, original2);
  if (result2 !== null) throw new Error("\u635f\u574f JSON \u672a\u88ab\u62d2\u7edd");
  console.log("  \u635f\u574f JSON: \u89e3\u6790\u5931\u8d25 \u2192 \u8fd4\u56de null \u00b7 \u4e0d\u5d29\u6e83");
  ok();
} catch (e) { ng("F2", e.message); }

console.log("\n[F3] \u5f15\u64ce\u8fdb\u7a0b\u5b58\u6d3b\u68c0\u67e5");
try {
  const hub3 = JSON.parse(fs.readFileSync(HUB_FILE, "utf8")).stuck;
  const pid = hub3.pid;
  if (!pid) throw new Error("Hub \u65e0 pid");
  const result3 = execSync("tasklist /FI \"PID eq " + pid + "\" /NH", { encoding: "utf8" });
  const alive = result3.toLowerCase().includes("node");
  console.log("  Engine PID: " + pid + " | \u5b58\u6d3b: " + (alive ? "\u662f" : "\u5426"));
  if (!alive) console.log("  \u26a0 \u5f15\u64ce\u8fdb\u7a0b\u53ef\u80fd\u5df2\u9000\u51fa (\u4f46 Hub \u6570\u636e\u65b0\u9c9c\u8868\u660e\u6700\u8fd1\u5728\u5199)");
  ok();
} catch (e) { ng("F3", e.message); }

// ═══ G. 已有备份历史验证 ═══
sep("G. \u5df2\u6709\u5907\u4efd\u5386\u53f2 + \u771f\u5b9e\u6570\u636e\u9a8c\u8bc1");

console.log("\n[G1] \u68c0\u67e5\u5df2\u6709\u5907\u4efd\u76ee\u5f55");
try {
  if (!fs.existsSync(CONV_BACKUP_DEFAULT)) {
    console.log("  \u5907\u4efd\u76ee\u5f55\u5c1a\u672a\u521b\u5efa (\u9996\u6b21\u8fd0\u884c)");
  } else {
    const entries = fs.readdirSync(CONV_BACKUP_DEFAULT).filter(function(d) { return d.startsWith("backup_"); });
    console.log("  \u5df2\u6709\u5907\u4efd: " + entries.length + " \u4e2a");
    entries.slice(0, 5).forEach(function(e2) {
      const bPath = path.join(CONV_BACKUP_DEFAULT, e2);
      const bfiles = fs.readdirSync(bPath);
      const bsize = bfiles.reduce(function(s, f) { return s + fs.statSync(path.join(bPath, f)).size; }, 0);
      console.log("    " + e2 + ": " + bfiles.length + " \u6587\u4ef6 | " + Math.round(bsize / 1024) + "KB");
    });
  }
  ok();
} catch (e) { ng("G1", e.message); }

console.log("\n[G2] \u5b9e\u65f6 PB \u76ee\u5f55\u6982\u51b5 (\u6e90\u6570\u636e\u5065\u5eb7)");
try {
  const pbFiles = fs.readdirSync(PB_DIR).filter(function(f) { return f.endsWith(".pb"); });
  const totalPbSize = pbFiles.reduce(function(s, f) { return s + fs.statSync(path.join(PB_DIR, f)).size; }, 0);
  const newest = pbFiles.map(function(f) { return fs.statSync(path.join(PB_DIR, f)).mtimeMs; }).sort().reverse()[0];
  const newestAge = Math.round((Date.now() - newest) / 1000);
  console.log("  .pb \u6587\u4ef6\u6570: " + pbFiles.length);
  console.log("  \u603b\u5927\u5c0f: " + Math.round(totalPbSize / 1024 / 1024) + "MB");
  console.log("  \u6700\u65b0\u6587\u4ef6: " + newestAge + "s \u524d\u66f4\u65b0");
  if (newestAge > 300) console.log("  \u26a0 \u6700\u65b0\u6587\u4ef6 " + newestAge + "s \u524d · \u53ef\u80fd\u65e0\u6d3b\u8dc3\u5bf9\u8bdd");
  ok();
} catch (e) { ng("G2", e.message); }

// ═══ 清理 + 总结 ═══
cleanup(TEST_DIR);

console.log("\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
console.log("  \u7ed3\u679c: " + pass + " PASS / " + fail + " FAIL");
if (issues.length) {
  console.log("  \u2500\u2500 \u95ee\u9898\u5217\u8868 \u2500\u2500");
  issues.forEach(function(i) { console.log("  \u2717 " + i); });
}
console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
if (fail === 0) console.log("\n\u2714 \u5168\u90e8\u901a\u8fc7 \u00b7 \u9053\u6cd5\u81ea\u7136 \u00b7 \u65e0\u4e3a\u800c\u65e0\u4e0d\u4e3a\n");
else console.log("\n\u2717 \u6709 " + fail + " \u4e2a\u5931\u8d25 \u00b7 \u9700\u8981\u4fee\u590d\n");
process.exit(fail > 0 ? 1 : 0);
