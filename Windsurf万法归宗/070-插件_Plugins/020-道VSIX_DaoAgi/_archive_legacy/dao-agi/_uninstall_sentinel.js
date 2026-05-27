// _uninstall_sentinel.js — v17.85 · 卸载即归无 · 水过而无痕
// ═══════════════════════════════════════════════════════════════════════
//
// 道之本源:
//   "天之道, 利而不害. 圣人之道, 为而不争." — 道德经 第八十一章
//   "百姓皆谓我自然." — 道德经 第十七章 (太上不知有之)
//   "上善若水. 水善利万物而不争." — 道德经 第八章
//   "为而不有, 功成而弗居. 夫唯弗居, 是以不去." — 道德经 第二章
//
// 病象:
//   VS Code/Windsurf 卸载扩展时仅删扩展目录, 不调任何 hook 清扫所留痕.
//   dao-agi 之痕 (五事):
//     一. 系统主 ext.js 之 lsGate 补丁 (E:\Windsurf\...\extension.js)
//     二. settings.json codeium.inferenceApiServerUrl / codeium.apiServerUrl 锚
//     三. ~/.wam-hot/ 之 fingerprint/lockfile/log/origin 解压副本
//     四. 自家 proxy 子进程 (detached, 父退仍存)
//     五. sentinel 自身 (脱壳后死)
//
// 解 (反者道之动 · 弱者道之用):
//   函数化设计 · 双途共用 · 失败一律降级 log · 不影响系统稳定性:
//     · 异步守护途 (deactivate 调起): spawn detached, 5s 后探 reload/uninstall
//     · 同步主动途 (dao.uninstall 命令): 直 require + runCleanup, 立即清扫
//
// 不灭 (留与用户 · 道法自然 · 利而不害):
//   · globalStorage/dao-agi.dao-agi/ — 含 windsurf-login-accounts.json + _wam_backups/
//     此为用户实物 · 重装即续 · 不灭其根
//   · state.vscdb 之 codeium.apiServerUrl — deactivate 已调 anchorRestore 还官方默认

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");

const IS_WIN = process.platform === "win32";

// ─── 默认日志器 (no-op) · 调用方可注入 ───────────────────────────────
function _defaultLog(_level, _msg) {}

// ─── 探察插件是否真已删 ─────────────────────────────────────────────
function _isExtensionGone(extDir) {
  try {
    if (!extDir) return false;
    return !fs.existsSync(path.join(extDir, "package.json"));
  } catch {
    return false;
  }
}

// ─── PID 探活 ───────────────────────────────────────────────────────
function _isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === "EPERM";
  }
}

// ─── 一. 还原系统 ext.js (从 .bak 直拷 · 原子) ──────────────────────
function _revertSystemExtJs(baks, log) {
  log = log || _defaultLog;
  const result = { reverted: 0, skipped: 0, errors: 0, files: [] };
  if (!Array.isArray(baks) || !baks.length) return result;
  for (const item of baks) {
    if (!item || !item.file || !item.bak) {
      result.skipped++;
      continue;
    }
    try {
      if (!fs.existsSync(item.bak)) {
        log("INFO", `lsGate: bak missing, skip · ${item.file}`);
        result.skipped++;
        result.files.push({
          file: item.file,
          ok: true,
          skipped: true,
          reason: "bak_missing",
        });
        continue;
      }
      if (!fs.existsSync(item.file)) {
        log("INFO", `lsGate: target missing, skip · ${item.file}`);
        result.skipped++;
        result.files.push({
          file: item.file,
          ok: true,
          skipped: true,
          reason: "target_missing",
        });
        continue;
      }
      // 原子还原: 先拷到 tmp, 再 rename 替换
      const tmp = item.file + ".tmp.dao_uninstall_revert";
      const raw = fs.readFileSync(item.bak);
      fs.writeFileSync(tmp, raw);
      fs.renameSync(tmp, item.file);
      log("INFO", `lsGate: reverted · ${item.file} <- ${item.bak}`);
      result.reverted++;
      result.files.push({ file: item.file, ok: true, reverted: true });
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      log("WARN", `lsGate: revert err · ${item.file} : ${msg}`);
      result.errors++;
      result.files.push({ file: item.file, ok: false, error: msg });
    }
  }
  return result;
}

// ─── 二. 清 settings.json codeium 锚 ────────────────────────────────
function _cleanSettingsJson(settingsPaths, log) {
  log = log || _defaultLog;
  const result = { cleaned: 0, skipped: 0, errors: 0, files: [] };
  if (!Array.isArray(settingsPaths) || !settingsPaths.length) return result;
  const targetKeys = ["codeium.inferenceApiServerUrl", "codeium.apiServerUrl"];
  for (const sp of settingsPaths) {
    if (!sp || !fs.existsSync(sp)) {
      result.skipped++;
      continue;
    }
    try {
      let raw = fs.readFileSync(sp, "utf8");
      const hadBom = raw.length > 0 && raw.charCodeAt(0) === 0xfeff;
      if (hadBom) raw = raw.slice(1);
      if (!raw.trim()) {
        result.skipped++;
        continue;
      }
      // 容忍纯 JSON · jsonc(含注释)失败时跳留与用户(不冒险破坏)
      let obj;
      try {
        obj = JSON.parse(raw);
      } catch {
        log("WARN", `settings: jsonc/parse err, skip · ${sp}`);
        result.skipped++;
        result.files.push({
          file: sp,
          ok: true,
          skipped: true,
          reason: "parse_err",
        });
        continue;
      }
      if (!obj || typeof obj !== "object") {
        result.skipped++;
        continue;
      }
      const removed = [];
      for (const k of targetKeys) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          delete obj[k];
          removed.push(k);
        }
      }
      if (!removed.length) {
        result.skipped++;
        result.files.push({
          file: sp,
          ok: true,
          skipped: true,
          reason: "no_anchor",
        });
        continue;
      }
      const newJson = JSON.stringify(obj, null, 2) + "\n";
      const final = hadBom ? "\ufeff" + newJson : newJson;
      const tmp = sp + ".tmp.dao_uninstall_clean";
      fs.writeFileSync(tmp, final, "utf8");
      fs.renameSync(tmp, sp);
      log("INFO", `settings: removed [${removed.join(",")}] · ${sp}`);
      result.cleaned++;
      result.files.push({ file: sp, ok: true, cleaned: true, removed });
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      log("WARN", `settings: clean err · ${sp} : ${msg}`);
      result.errors++;
      result.files.push({ file: sp, ok: false, error: msg });
    }
  }
  return result;
}

// ─── 二·b · 清 state.vscdb codeium.windsurf 锚 + secret ─────────────
//
// v17.86 增 · 179 事故根治 (sentinel 第二事完整化 · 不留 vscdb 残锚)
// 仅清两键: codeium.windsurf.{api|inference}ApiServerUrl + secret://*apiServerUrl
// 用 sqlite3 命令行 (Windsurf 的 Node 不带 better-sqlite3 · 但 sqlite3.exe 跨平台)
// 找不到 sqlite3.exe 则降为 Python (anchorPy 路径已传入)
// 所有失败仅 log · 不抛错 · 不阻其他清扫
function _cleanStateVscdb(anchorPy, log) {
  log = log || _defaultLog;
  const result = { cleaned: 0, skipped: 0, errors: 0, files: [] };
  if (!anchorPy || !fs.existsSync(anchorPy)) {
    log("INFO", `vscdb: anchorPy missing · skip · ${anchorPy || "(empty)"}`);
    return Object.assign(result, { skipped: 1, reason: "no_anchor_py" });
  }
  // 枚举所有用户 state.vscdb (主用户 + Win 多用户)
  const targets = [];
  try {
    const homedir = os.homedir();
    if (IS_WIN) {
      const usersRoot = "C:\\Users";
      if (fs.existsSync(usersRoot)) {
        for (const u of fs.readdirSync(usersRoot)) {
          if (/^(public|default|all users|defaultuser)/i.test(u)) continue;
          const db = path.join(
            usersRoot,
            u,
            "AppData",
            "Roaming",
            "Windsurf",
            "User",
            "globalStorage",
            "state.vscdb",
          );
          if (fs.existsSync(db)) targets.push({ user: u, db });
        }
      }
    } else if (process.platform === "darwin") {
      const db = path.join(
        homedir,
        "Library",
        "Application Support",
        "Windsurf",
        "User",
        "globalStorage",
        "state.vscdb",
      );
      if (fs.existsSync(db)) targets.push({ user: "self", db });
    } else {
      const db = path.join(
        homedir,
        ".config",
        "Windsurf",
        "User",
        "globalStorage",
        "state.vscdb",
      );
      if (fs.existsSync(db)) targets.push({ user: "self", db });
    }
  } catch (e) {
    log("WARN", `vscdb: enumerate err · ${e && e.message}`);
  }
  if (!targets.length) {
    log("INFO", `vscdb: no state.vscdb found`);
    return result;
  }
  // 调 anchor.py restore-all-globalstate · 净 codeium.* api 锚
  for (const t of targets) {
    try {
      // anchor.py 用 --db 参数指定目标 db
      const out = cp.execFileSync(
        process.platform === "win32" ? "python" : "python3",
        [anchorPy, "--db", t.db, "restore-all-globalstate"],
        { timeout: 10000, encoding: "utf8", windowsHide: true },
      );
      log("INFO", `vscdb: ${t.user} restored · ${(out || "").split("\n")[0]}`);
      result.cleaned++;
      result.files.push({ user: t.user, db: t.db, ok: true });
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      // execFileSync 抛错时 e.stderr 含 python 输出
      const stderr = e && e.stderr ? String(e.stderr).split("\n")[0] : "";
      log("WARN", `vscdb: ${t.user} err · ${msg} ${stderr}`);
      result.errors++;
      result.files.push({ user: t.user, db: t.db, ok: false, error: msg });
    }
  }
  return result;
}

// ─── 三. kill 自家 proxy ────────────────────────────────────────────
function _killProxy(pid, ownerName, log) {
  log = log || _defaultLog;
  if (!pid || pid <= 0) return { killed: false, reason: "no_pid" };
  if (!_isPidAlive(pid)) return { killed: false, reason: "already_dead" };
  try {
    if (IS_WIN) {
      cp.execSync(`taskkill /PID ${pid} /F /T 2>nul`, {
        timeout: 3000,
        windowsHide: true,
        shell: true,
      });
    } else {
      process.kill(pid, "SIGKILL");
    }
    log("INFO", `proxy: killed pid=${pid} owner=${ownerName || "?"}`);
    return { killed: true, pid };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    log("WARN", `proxy: kill err pid=${pid} : ${msg}`);
    return { killed: false, reason: "kill_err", error: msg };
  }
}

// ─── 四. 清 ~/.wam-hot/ 整目录 (含 sentinel 自身) ───────────────────
function _cleanWamHot(wamHot, log) {
  log = log || _defaultLog;
  if (!wamHot) return { removed: false, reason: "no_path" };
  if (!fs.existsSync(wamHot)) return { removed: false, reason: "not_exist" };
  try {
    if (typeof fs.rmSync === "function") {
      fs.rmSync(wamHot, { recursive: true, force: true, maxRetries: 3 });
    } else {
      fs.rmdirSync(wamHot, { recursive: true });
    }
    log("INFO", `wam-hot: removed · ${wamHot}`);
    return { removed: true, path: wamHot };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    log("WARN", `wam-hot: rm err · ${msg}`);
    return { removed: false, reason: "rm_err", error: msg };
  }
}

// ─── 五. 自删 sentinel 兜底 (WAM_HOT 清未尽时) ──────────────────────
function _selfDelete(selfPath, log) {
  log = log || _defaultLog;
  try {
    if (selfPath && fs.existsSync(selfPath)) {
      fs.unlinkSync(selfPath);
      log("INFO", `self: deleted · ${selfPath}`);
      return { deleted: true };
    }
  } catch {}
  return { deleted: false };
}

// ─── 同步主流程 (dao.uninstall 命令直调 · 不延迟) ───────────────────
//
// 入参 opts:
//   extDir         插件目录 (探 package.json 是否仍在 · 若 forceUninstall=true 跳过此探)
//   wamHot         ~/.wam-hot 路径
//   baks           [{file, bak}, ...] lsGate 还原清单
//   settings       [path, ...] settings.json 路径
//   proxyPid       自家 proxy PID (0=无)
//   ownerName      owner username (验主)
//   selfPath       sentinel 自身路径 (自删兜底)
//   log            (level, msg) => void
//   forceUninstall 强制走 uninstall 路径 (跳过 _isExtensionGone 探察 · 主动调用时用)
//   skipWamHot     true 时不删 wam-hot (sync 路径下用 · 因调者可能仍要写 log)
//
// 出参:
//   {action: "reload" | "uninstall", lsGate, settings, proxy, wamHot, self}
function runCleanup(opts) {
  opts = opts || {};
  const log = typeof opts.log === "function" ? opts.log : _defaultLog;
  // 先探察 (除非 forceUninstall)
  if (!opts.forceUninstall) {
    if (!_isExtensionGone(opts.extDir)) {
      log("INFO", `plugin still present · reload/upgrade · sentinel exits`);
      const sd = _selfDelete(opts.selfPath, log);
      return { action: "reload", self: sd };
    }
  }
  log(
    "INFO",
    `begin soft cleanup · forceUninstall=${!!opts.forceUninstall} · ext=${opts.extDir}`,
  );
  const r1 = _revertSystemExtJs(opts.baks, log);
  log(
    "INFO",
    `step1 lsGate: reverted=${r1.reverted} skipped=${r1.skipped} errors=${r1.errors}`,
  );
  const r2 = _cleanSettingsJson(opts.settings, log);
  log(
    "INFO",
    `step2 settings: cleaned=${r2.cleaned} skipped=${r2.skipped} errors=${r2.errors}`,
  );
  // v17.86 · 二·b · 清 state.vscdb codeium api 锚 + secret
  const r2b = _cleanStateVscdb(opts.anchorPy, log);
  log(
    "INFO",
    `step2b vscdb: cleaned=${r2b.cleaned} skipped=${r2b.skipped} errors=${r2b.errors}`,
  );
  const r3 = _killProxy(opts.proxyPid, opts.ownerName, log);
  log("INFO", `step3 proxy: killed=${!!r3.killed} reason=${r3.reason || "-"}`);
  let r4 = { removed: false, reason: "skipped" };
  if (!opts.skipWamHot) {
    r4 = _cleanWamHot(opts.wamHot, log);
    log(
      "INFO",
      `step4 wam-hot: removed=${!!r4.removed} reason=${r4.reason || "-"}`,
    );
  }
  // 兜底自删 (若 wam-hot 未清干净 · sentinel 仍在)
  let r5 = { deleted: false };
  if (!r4.removed) {
    r5 = _selfDelete(opts.selfPath, log);
  }
  log("INFO", `cleanup done · five virtues completed`);
  return {
    action: "uninstall",
    lsGate: r1,
    settings: r2,
    vscdb: r2b,
    proxy: r3,
    wamHot: r4,
    self: r5,
  };
}

// ─── 异步守护流程 (spawn detached 后 setTimeout · 探 reload/uninstall) ───
function startSentinel(opts) {
  opts = opts || {};
  const delay = Math.max(500, parseInt(opts.delayMs || 5000, 10));
  const log = typeof opts.log === "function" ? opts.log : _defaultLog;
  log(
    "INFO",
    `sentinel start · ext=${opts.extDir} hot=${opts.wamHot} delay=${delay} pid=${process.pid}`,
  );
  setTimeout(() => {
    try {
      runCleanup(opts);
    } catch (e) {
      log("ERROR", `sentinel fatal: ${e && e.stack ? e.stack : e}`);
    }
    process.exit(0);
  }, delay);
}

// ─── 从 env 读 opts (作脚本启动时用) ────────────────────────────────
function _optsFromEnv() {
  const logPath = process.env.DAO_SENTINEL_LOG || "";
  const fileLog = logPath
    ? (level, msg) => {
        try {
          fs.appendFileSync(
            logPath,
            `[${new Date().toISOString()}] [${level}] ${msg}\n`,
          );
        } catch {}
      }
    : _defaultLog;
  let baks = [];
  try {
    baks = JSON.parse(process.env.DAO_SENTINEL_LSGATE_BAKS || "[]");
    if (!Array.isArray(baks)) baks = [];
  } catch {
    baks = [];
  }
  let settings = [];
  try {
    settings = JSON.parse(process.env.DAO_SENTINEL_USER_SETTINGS || "[]");
    if (!Array.isArray(settings)) settings = [];
  } catch {
    settings = [];
  }
  return {
    extDir: process.env.DAO_SENTINEL_EXT_DIR || "",
    wamHot:
      process.env.DAO_SENTINEL_WAM_HOT || path.join(os.homedir(), ".wam-hot"),
    delayMs: parseInt(process.env.DAO_SENTINEL_DELAY_MS || "5000", 10),
    baks,
    settings,
    proxyPid: parseInt(process.env.DAO_SENTINEL_PROXY_PID || "0", 10),
    ownerName: process.env.DAO_SENTINEL_OWNER_NAME || "",
    selfPath: process.env.DAO_SENTINEL_SELF || __filename,
    anchorPy: process.env.DAO_SENTINEL_ANCHOR_PY || "",
    log: fileLog,
  };
}

// ─── 入口 ───────────────────────────────────────────────────────────
if (require.main === module) {
  // 作脚本启动 (deactivate spawn 调起)
  startSentinel(_optsFromEnv());
}

module.exports = {
  // 同步 API (dao.uninstall 命令直调)
  runCleanup,
  startSentinel,
  // 单步 API (测试用)
  _isExtensionGone,
  _isPidAlive,
  _cleanStateVscdb,
  _revertSystemExtJs,
  _cleanSettingsJson,
  _killProxy,
  _cleanWamHot,
  _selfDelete,
  _optsFromEnv,
};
