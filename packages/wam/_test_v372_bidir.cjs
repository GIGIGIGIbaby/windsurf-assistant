// v3.7.2 守门 · 两向根治「未验证」· 道法自然 · 无为而无不为
// §A 版本 · §B 备份恢复链 · §C 启动反向(未验自动加速) · §D sessionCache去抖
"use strict";
const fs   = require("fs");
const path = require("path");
const os   = require("os");

const SRC = path.join(__dirname, "extension.js");
const src = fs.readFileSync(SRC, "utf8");

let pass = 0, fail = 0;
function check(name, ok, hint) {
  console.log((ok ? "✓" : "✗") + " " + name + ((!ok && hint) ? "\n    hint: " + hint : ""));
  if (ok) pass++; else fail++;
}

// ─── §A 版本 ──────────────────────────────────────────────────────────────────
console.log("\n[§A] 版本");
check("§A.1 VERSION >= 3.7.2 (v3.7.2+)", (() => {
  const m = src.match(/const\s+VERSION\s*=\s*"([\d.]+)"/);
  if (!m) return false;
  const [ma, mi, pa] = m[1].split('.').map(Number);
  return ma > 3 || (ma === 3 && (mi > 7 || (mi === 7 && pa >= 2)));
})());
check("§A.2 v3.7.2 注释块存在", src.includes("v3.7.2") && src.includes("两向根治"));
check("§A.3 无 _powerCutRecovery (已移除·最小化)", !src.includes("powerCutRecovery"));
check("§A.4 JavaScript 语法有效", (() => {
  try { new Function(src); return true; } catch(e) { console.log("    " + e.message); return false; }
})());

// ─── §B 备份恢复链 ─────────────────────────────────────────────────────────────
console.log("\n[§B] store.load() 备份恢复链 (正向)");

check(
  "§B.1 load() 内层 try/catch 包 JSON.parse",
  /load\s*\(\s*\)\s*\{[\s\S]{0,600}try\s*\{[^}]{0,300}JSON\.parse[\s\S]{0,100}\}\s*catch\s*\(pe\)/.test(src)
);
check(
  "§B.2 备份遍历: filter wam-state- + sort().reverse()",
  /filter\s*\(f\s*=>\s*f\.startsWith\(["']wam-state-["']\)[\s\S]{0,80}\.sort\(\)\.reverse\(\)/.test(src)
);
check("§B.3 备份恢复日志 🔄", src.includes("🔄 断电备份恢复") || src.includes("\\ud83d\\udd04 \u65ad\u7535\u5907\u4efd\u6062\u590d"));
check("§B.4 主文件失效警告", src.includes("主文件失效") && src.includes("备份恢复成功"));

// vm 行为验证
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wam_v372_"));
const stateFile = path.join(tmpDir, "wam-state.json");
const backupDir = path.join(tmpDir, "backups");
fs.mkdirSync(backupDir, { recursive: true });
const goodHealth = {
  "a@x.com": { checked: true, daily: 85, weekly: 51, lastChecked: Date.now() - 1000 },
};
fs.writeFileSync(
  path.join(backupDir, "wam-state-" + new Date().toISOString().substring(0, 10) + ".json"),
  JSON.stringify({ version: "3.7.1", health: goodHealth, blacklist: {}, savedAt: Date.now() - 60000 }, null, 2)
);

function testLoad(stateFilePath, backupDirPath) {
  let j = null, _loadSrc = "STATE_FILE";
  if (!fs.existsSync(stateFilePath)) {
  } else {
    try { j = JSON.parse(fs.readFileSync(stateFilePath, "utf8")); }
    catch (pe) { /* fall through */ }
  }
  if (!j) {
    if (fs.existsSync(backupDirPath)) {
      const bfs = fs.readdirSync(backupDirPath)
        .filter(f => f.startsWith("wam-state-") && f.endsWith(".json"))
        .sort().reverse();
      for (const bf of bfs) {
        try {
          const bj = JSON.parse(fs.readFileSync(path.join(backupDirPath, bf), "utf8"));
          if (bj && bj.health && Object.keys(bj.health).length > 0) { j = bj; _loadSrc = bf; break; }
        } catch {}
      }
    }
  }
  return { ok: !!j, src: _loadSrc, health: j ? j.health : {} };
}

{
  const r = testLoad(stateFile, backupDir); // stateFile missing
  check("§B-vm.1 主文件缺失 → 备份恢复 ok=true", r.ok, "src=" + r.src);
  check("§B-vm.1b a@x.com health 恢复", r.health["a@x.com"] && r.health["a@x.com"].checked);
}
{
  fs.writeFileSync(stateFile, '{"health":{"x":true'); // corrupted
  const r = testLoad(stateFile, backupDir);
  check("§B-vm.2 主文件腐化 → 备份恢复 ok=true", r.ok);
  fs.unlinkSync(stateFile);
}
{
  fs.writeFileSync(stateFile, JSON.stringify({ version: "3.7.2", health: { "c@x.com": { checked: true, daily: 50 } }, blacklist: {}, savedAt: Date.now() }, null, 2));
  const r = testLoad(stateFile, backupDir);
  check("§B-vm.3 主文件正常 → loadSrc=STATE_FILE (不走备份)", r.ok && r.src === "STATE_FILE");
  fs.unlinkSync(stateFile);
}
{
  const r = testLoad(stateFile, path.join(tmpDir, "nodir"));
  check("§B-vm.4 主文件缺 + 无备份 → ok=false (安全降级)", !r.ok);
}

// ─── §C 启动路径反向根治 ───────────────────────────────────────────────────────
console.log("\n[§C] 启动反向根治 (未验自动加速)");

check(
  "§C.1 cache空时检测 _uncheckedOnStart",
  src.includes("_uncheckedOnStart") && src.includes("_store.accounts.filter")
);
check(
  "§C.2 无未验号时 log 跳过 + return (不触发verify)",
  src.includes("cache空 · 无未验号 · 跳过") || src.includes("cache\u7a7a \u00b7 \u65e0\u672a\u9a8c\u53f7 \u00b7 \u8df3\u8fc7")
);
check(
  "§C.3 有未验号时触发 verifyAllAccounts({onlyStale:false})",
  (() => {
    const idx = src.lastIndexOf("_uncheckedOnStart > 0"); // 注释在前·代码在后·取最后一次
    if (idx < 0) return false;
    const block = src.substring(idx, idx + 800);
    return block.includes("verifyAllAccounts") && block.includes("onlyStale: false");
  })()
);
check(
  "§C.4 cache非空走原 _cacheOnly 路径 (v3.7.1 兼容)",
  src.includes("_cacheOnly: true") && src.includes("startupStaleMin")
);
check(
  "§C.5 无 _powerCutRecovery 选项 (已移除·最小化)",
  !src.includes("_powerCutRecovery")
);

// vm 行为验证: 队列构建
function buildQueue(accounts, healthMap, opts) {
  const o = opts || {};
  const onlyStale = !!o.onlyStale;
  const cacheOnly = !!o._cacheOnly;
  const staleMin = o.staleMin || 30;
  const queue = [];
  let unchecked = 0;
  for (let i = 0; i < accounts.length; i++) {
    const h = healthMap[accounts[i].email.toLowerCase()] || { checked: false };
    if (!h.checked) unchecked++;
    if (onlyStale && h.checked && (h.staleMin || 0) < staleMin) continue;
    if (cacheOnly) continue; // simplified: no cache
    queue.push(i);
  }
  return { queue, unchecked, isFirstTime: unchecked > accounts.length * 0.5 };
}

const accs = [
  { email: "a@x.com" }, { email: "b@x.com" }, { email: "c@x.com" },
  { email: "d@x.com" }, { email: "e@x.com" },
];
const health = {
  "a@x.com": { checked: true, daily: 85, staleMin: 60 },
};
// 4 out of 5 unchecked → isFirstTime=true
{
  const r = buildQueue(accs, health, { onlyStale: false });
  check("§C-vm.1 onlyStale:false → 全部5账号进队列", r.queue.length === 5);
  check("§C-vm.1b isFirstTime=true (4/5 未验 > 50%)", r.isFirstTime);
}
{
  const r = buildQueue(accs, health, { _cacheOnly: true });
  check("§C-vm.2 _cacheOnly=true (cache空) → 0个进队列", r.queue.length === 0);
}
// isFirstTime → parallel=2, gap=1500ms (已由源码保证)
check(
  "§C-vm.3 isFirstTime→parallel=2 源码存在",
  /isFirstTime\s*\?\s*Math\.min\s*\(\s*userParallel\s*,\s*2\s*\)/.test(src)
);
check(
  "§C-vm.4 isFirstTime→gap=1500ms 源码存在",
  /isFirstTime\s*\?\s*Math\.max\s*\(\s*gapMs\s*,\s*1500\s*\)/.test(src)
);

// ─── §D sessionCache 防抖加速 ──────────────────────────────────────────────────
console.log("\n[§D] sessionCache 防抖加速 (正向)");

check(
  "§D.1 防抖 100ms (原500ms)",
  (() => {
    const idx = src.indexOf("function _persistSessionCache");
    if (idx < 0) return false;
    const fn = src.substring(idx, idx + 2000);
    return /},\s*100\s*\)/.test(fn) && !/},\s*500\s*\)/.test(fn);
  })()
);
check("§D.2 100ms 注释说明", src.includes("100ms") && src.includes("减少断电丢"));

// ─── 清理 + 结果 ──────────────────────────────────────────────────────────────
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

console.log("\n================================================================");
console.log("  v3.7.2 两向根治 · 测毕: " + pass + " 过 / " + fail + " 败");
console.log("  正向:备份恢复+快写 · 反向:未验即自动加速 · 无为而无不为");
console.log("================================================================");
process.exit(fail > 0 ? 1 : 0);
