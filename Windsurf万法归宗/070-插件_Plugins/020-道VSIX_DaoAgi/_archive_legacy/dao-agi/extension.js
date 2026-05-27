// extension.js — 道Agent · 无感切号 · 主壳 · 道法自然
//
// 道可道,非常道。名可名,非常名。 致虚守静 · 观复知常。
// 反者道之动, 弱者道之用。 为学日益, 为道日损, 损之又损, 以至于无为。
// 天之道, 利而不害 · 圣人之道, 为而不争 · 夫唯不争, 故天下莫能与之争。
// 内固其本, 外彰其形, 表里相依, 浑然一统。 圣人总而用之, 其数一也。
//
// 三核归一 (用户明示之本源 · 其数一也):
//   一、WAM 本体        · vendor/wam/extension.js (symlink → 010) · 直接复用 · 不动一字
//   二、实时 SP 提取    · sp-scaffold.js (静骨架) + essence._buildReconstructedSP (动注入)
//                        四源并举: L1 LS 直取 > L3 proxy 捕获 > L2 trajectory > L4 rebuild
//   三、道/官 模式热切  · proxy invert (道德经 SP) ⇄ passthrough (官方原味) · 二态归一
//
// 锚定层 (反代真生效之根):
//   L1 safeStorage(secret) · L2 ItemTable · L3/L4 globalState (multi-publisher)
//   L5 settings.json codeium.inferenceApiServerUrl (内联补全)
//   L6 settings.json codeium.apiServerUrl  · v17.80 · chat-flow auth 之根 · 唯一治本
//
// 三层根因修复 (推进到底 · 道法自然):
//   L1 系统层 · ls-gate-patcher.js  · 解 windsurf-dao u() 函数 dev-mode 门禁
//   L2 账户层 · 锚.py anchor-all-globalstate · 全用户 state.vscdb 锚定
//   L3 协议层 · 源.js classifyRPC · query string 剥离 · CHAT_PROTO 不再误归 PASSTHROUGH
//
// 自定义 SP 热替换 (v18.5 · 真本源直注):
//   POST /origin/custom_sp { sp, keep_blocks, source } · 哨兵 [CUSTOM-SP-ACTIVE] 不破道
//   命令: dao.sp.set / dao.sp.get / dao.sp.reset · webview 编辑 / agent 直调
//
// 版本号唯一本源: package.json.version · 此处不再硬编码
"use strict";

// ── v18.2.1 · 阶四主壳拆解 · 水之四德 + sentinel 之引尽去 ──
//
// 道: "为者败之, 执者失之. 圣人无为故无败, 无执故无失." (六十四章)
//   v17.x: spawn detached proxy → 多 ext-host 共争一 proxy → 须选举/守护
//   v18.0:  进程内化 → 一 ext-host 一 in-process server → 自然 leader · 共生死
//   v18.2.1: 6 处 if (_waterVirtues) 死支并去 · 顶部 null ref 亦清 · 至于无为
// (workspace 留 _water_virtues.js / _uninstall_sentinel.js 供 spec 单测 · 不入 VSIX)

const vscode = require("vscode");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, execSync } = require("node:child_process");
const { EssenceProvider } = require("./essence");
const isolator = require("./isolator");
const { DaoWatcher } = require("./watcher");
// v17.88 · storage-guard 死引去 (extension.js 0 调用 · 移出 VSIX · 仅命令式留独立 CLI)
// LS gate lift 补丁器 · 反者道之动 · 解 dev-mode 门禁
// 令 settings.json 之 codeium.inferenceApiServerUrl 真生效 · LS 真锚
const lsGatePatcher = require("./ls-gate-patcher");

// 版本归一 · 唯 package.json 一本源 · 损之又损
let PKG_VERSION = "0.0.0";
try {
  PKG_VERSION = require("./package.json").version || "0.0.0";
} catch {}

// ═══════════════════════ 常量 · 道法自然 · 三级软适配 ═══════════════════════
// 其数一也: env > vscode config > default · 每一常量皆可软盖 · 适配一切环境
//
// 覆盖方式:
//   (a) 环境变量 (进程启前可设)  · DAO_PORT / DAO_HOT_DIRNAME / DAO_VENDOR_SUBPATH
//   (b) VS Code 设置 (用户可改)  · dao.origin.port / dao.hotDirname / dao.vendorSubpath
//   (c) 默认值 (兜底)            · 8889 / ".wam-hot" / "wam/bundled-origin"

// v18.8 · 多账号隔离 · 端口按 USERNAME hash 算 · 8889 + offset(0..99)
//        不同 Windows 账号自动落不同端口, 互不抢占, 互不干扰.
//        env DAO_PORT 仍优先 (用户可手动覆盖, 如运维场景).
//        FNV-1a 32-bit 哈希: 跨平台稳定 · 无需密码学
const PORT_BASE = 8889;
const PORT_RANGE_SPAN = 100; // 8889..8988

function _fnv1a32(s) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function _userScopedDefaultPort() {
  try {
    const username = (
      process.env.USERNAME ||
      (os.userInfo && os.userInfo().username) ||
      ""
    )
      .toString()
      .toLowerCase()
      .trim();
    if (!username) return PORT_BASE;
    const offset = _fnv1a32(username) % PORT_RANGE_SPAN;
    return PORT_BASE + offset;
  } catch {
    return PORT_BASE;
  }
}

const DEFAULT_PORT = (() => {
  const env = parseInt(process.env.DAO_PORT || "", 10);
  if (Number.isFinite(env) && env > 0 && env < 65536) return env;
  return _userScopedDefaultPort();
})();
const HOT_DIRNAME = process.env.DAO_HOT_DIRNAME || ".wam-hot";
const VENDOR_SUBPATH = (process.env.DAO_VENDOR_SUBPATH || "wam/bundled-origin")
  .split(/[\\/]/)
  .filter(Boolean);
const IS_WIN = process.platform === "win32";

const DAO_QUOTES = [
  "道可道,非常道。名可名,非常名。",
  "天下万物生于有,有生于无。",
  "反者道之动,弱者道之用。",
  "道生一,一生二,二生三,三生万物。",
  "上善若水。水善利万物而不争。",
  "为无为,事无事,味无味。",
  "大方无隅,大器晚成,大音希声,大象无形。",
  "致虚极,守静笃。万物并作,吾以观复。",
  "知人者智,自知者明。胜人者有力,自胜者强。",
  "圣人无常心,以百姓心为心。",
  "千里之行,始于足下。",
  "祸兮福之所倚,福兮祸之所伏。",
  "大直若屈,大巧若拙,大辩若讷。",
  "信言不美,美言不信。善者不辩,辩者不善。",
  "天之道,利而不害。圣人之道,为而不争。",
  "大制不割。道法自然。",
];

function randomQuote() {
  return DAO_QUOTES[Math.floor(Math.random() * DAO_QUOTES.length)];
}

// ═══════════════════════ 日志 ═══════════════════════

let _channel = null;
function initLogger() {
  if (!_channel)
    _channel = vscode.window.createOutputChannel("道·AGI 万法归宗");
  return _channel;
}
function _stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
function _emit(level, tag, msg) {
  const ch = initLogger();
  ch.appendLine(`[${_stamp()}] [${level.toUpperCase()}] [${tag}] ${msg}`);
}
const log = {
  info: (tag, msg) => _emit("info", tag, msg),
  warn: (tag, msg) => _emit("warn", tag, msg),
  error: (tag, msg) => _emit("error", tag, msg),
  debug: (tag, msg) => _emit("debug", tag, msg),
  show: () => _channel && _channel.show(true),
  dispose: () => {
    if (_channel) {
      _channel.dispose();
      _channel = null;
    }
  },
};

// ═══════════════════════ 配置 ═══════════════════════

function cfg() {
  const c = vscode.workspace.getConfiguration();
  // v18.8 · 多账号隔离: dao.origin.port 用户没主动设 → 用 per-user DEFAULT_PORT
  //        package.json schema default=8889, 但若用户没主动改, 走 per-user 算法
  //        c.inspect 区分 "用户主动设" vs "schema 默认"
  const portInspect = c.inspect("dao.origin.port");
  const userPortValue =
    (portInspect &&
      (portInspect.globalValue !== undefined
        ? portInspect.globalValue
        : portInspect.workspaceValue !== undefined
          ? portInspect.workspaceValue
          : portInspect.workspaceFolderValue)) ||
    null;
  return {
    port:
      typeof userPortValue === "number" && userPortValue > 0
        ? userPortValue
        : DEFAULT_PORT,
    // v18.1.3 · 兜底归 passthrough · 与 package.json default 对齐 · 首装无副作用
    //   package.json 已声 default="passthrough" · 此 2 参兜底仅 schema 未注时启
    //   旧 "invert" 兜底 → 极端态致首装即起反代 · 反 "圣人之道为而不争" 之义
    defaultMode: c.get("dao.origin.defaultMode", "passthrough"),
    banner: c.get("dao-agi.dao.banner", true),
    // v17.83 · 水之四德 · 显式禁用通道 (默认开)
    waterEnabled: c.get("dao-agi.water.enabled", true),
    // v17.84.3 · LS Gate 自施守 · 默认 *关* · 不妄为 不着相 (回归本真)
    //   141 事故 (2026-04-25) 后改默认 false:
    //   多用户共享 Windsurf 装路时, 一用户自动 patch 致全机 Cascade 瘫痪
    //   设 true 仅手动 dao.lsGate.apply 行 (用户明示授权方动系统)
    lsGateAutoApply: c.get("dao-agi.lsGate.autoApply", false),
    // v17.86 · LS Gate 作用范围 · 默认 per-user only (民至老死不相往来)
    //   includeBuiltin     : true 方改全机共享 builtin (Windsurf 安装路)
    //                        141 事故根因 · 改之必跨账号污染
    //   includeOtherUsers  : true 方扫 C:\Users\* 他户 .windsurf/extensions/
    //                        (运维场景 · 用户明示授权 · 应谨慎)
    //   二者后加入于 v17.86 · autoApply 路径永不越界 (双保险)
    //   手动 dao.lsGate.apply 路径读本二配 · includeBuiltin=true 时弹 modal 警
    lsGateIncludeBuiltin: c.get("dao-agi.lsGate.includeBuiltin", false),
    lsGateIncludeOtherUsers: c.get("dao-agi.lsGate.includeOtherUsers", false),
    // v17.75 · 着相已去 · SP 净化唯一本源 = proxy 源.js invert
    //   6 套隔离选项均已移除 · enter 无作 · exit 恢复无条件
  };
}

// v17.86 · 集中 _lsGate调用默认 opts · 民至老死不相往来
// auto-guard 路径永传 false (双保险 · 141 事故不重蹈覆辙)
// 手动 dao.lsGate.* 路径读 cfg() · 用户明示启才越界
function _lsGateOpts(forManual) {
  if (!forManual) {
    // 自动路径 · 永不动 builtin / 他户 (即使用户误启也不越界)
    return { includeBuiltin: false, includeOtherUsers: false };
  }
  // 手动路径 · 读用户配 (modal 警后调)
  const c = cfg();
  return {
    includeBuiltin: !!c.lsGateIncludeBuiltin,
    includeOtherUsers: !!c.lsGateIncludeOtherUsers,
  };
}

// v17.60 · 取当前工作区根 · 多工作区取第一 · 无则 null
function getWorkspaceRoot() {
  try {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length) return folders[0].uri.fsPath;
  } catch {}
  return null;
}

// v17.82 · 道法自然 · 损之又损
//   _isolateEnter (v17.75 删) / _isolateExit (v17.82 删) · 着相已尽
//   SP 净化 = proxy 源.js invert 唯一本源 · 文件层不动一指 · 无为而无不为
//   v17.65- 遗留态复归: isolator.exit() 仍在 · 留作 wam.verifyEndToEnd 内联触达

// ═══════════════════════ LS Gate Lift · v17.68 · 至理一击 ═══════════════════════
//
// 道本源: 审视一切, 层层究至理 ——
//   五层锚全绿, 但 /origin/lastinject has_inject=false (万请求零捕).
//   LS 启参固为 --inference_api_server_url https://inference.codeium.com,
//   锚下而 LS 命令行固化官方 URL · 一切 inference 流绕代直飞云端.
//
//   根因: windsurf-dao/codeium.windsurf 扩之 dist/extension.js 内置
//   u() 配置读函数, 首道门禁拦所有 codeium.* 键于生产 · 直还默认.
//
//   解: 仅对 apiServerUrl / inferenceApiServerUrl 两键解 dev-gate · 其他保持.
//   令 settings.json 锚真生效 · 复以 原有 五 层 锚 · 一 网 尽 .
//
// 注: 补丁改磁盘, Extension Host 已载之码不变 · 须 Reload Window 方生效.
//     新 LS 方以新参启 · 经反代之门.
// v17.86 · 参数 forManual 传递作用范围: 手动路径读 cfg 越界配, 自动路径永 false
function _lsGateApply(forManual) {
  try {
    const opts = _lsGateOpts(forManual);
    const r = lsGatePatcher.apply(opts);
    // 分类计数
    const applied = r.applied || 0;
    const skipped = r.skipped || 0;
    const errors = (r.errors && r.errors.length) || 0;
    log.info(
      "ls-gate",
      `apply[scope=${r.scope}]: applied=${applied} skipped=${skipped} errors=${errors} total=${r.files.length}`,
    );
    for (const f of r.files) {
      if (f.applied) {
        log.info("ls-gate", `✓ 已补: ${f.file} (+${f.delta_chars || 0}c)`);
      } else if (!f.ok) {
        log.warn("ls-gate", `✗ ${f.error} — ${f.file}`);
      }
    }
    return r;
  } catch (e) {
    log.warn("ls-gate", `apply 异常: ${e && e.message}`);
    return {
      ok: false,
      applied: 0,
      skipped: 0,
      errors: [],
      files: [],
      scope: "err",
    };
  }
}

function _lsGateStatus(forManual) {
  try {
    return lsGatePatcher.status(_lsGateOpts(forManual));
  } catch (e) {
    log.warn("ls-gate", `status 异常: ${e && e.message}`);
    return null;
  }
}

function _lsGateRevert(forManual) {
  try {
    const opts = _lsGateOpts(forManual);
    const r = lsGatePatcher.revert(opts);
    log.info(
      "ls-gate",
      `revert[scope=${r.scope}]: reverted=${r.reverted} skipped=${r.skipped} errors=${(r.errors || []).length}`,
    );
    return r;
  } catch (e) {
    log.warn("ls-gate", `revert 异常: ${e && e.message}`);
    return {
      ok: false,
      reverted: 0,
      skipped: 0,
      errors: [],
      files: [],
      scope: "err",
    };
  }
}

// ─── v17.84.2 · 账号自迁移 · 反者道之动 · 多代 WAM 演进无丢账号 ───
//
// 病: WAM PRODUCT_NAME=windsurf, AccountStore 仅 2 路扫:
//       primary: globalStorage/dao-agi.dao-agi/windsurf-login-accounts.json
//       shared:  globalStorage/windsurf-login-accounts.json
//     L3 灾难恢复仅扫 primary/_wam_backups, 不扫兄弟 ext (e.g. zhouyoukang.windsurf-assistant/).
//     若主存储被 null-wipe (写 [] · 何时何故难溯) 且兄弟 ext 仍存历史账号 →
//     WAM 报 0 账号 · UI 显 "未选择活跃账号" · 切号/锚定/agent 全失效.
//     根因: 多代 WAM 演进 (zhouyoukang.wam → .windsurf-assistant → dao-agi.dao-agi)
//           账号文件落于旧目录, 新主存储与备份均未 inherit.
//
// 解 (反者道之动 · 弱者道之用):
//   activate 入口 (WAM 加载前) 自检主+shared 是否非空, 若皆空:
//     · 扫 globalStorage 兄弟子目录 (跳 self)
//     · 收集每子目录 windsurf-login-accounts.json + _wam_backups/accounts_*.json
//     · 取 entries 数最多 (优先) · 同等取 mtime 最新 · 复制到 primary + shared
//   不抛错 · 不阻 boot · 仅 log
//
// 副作用: 主存储非空时彻底无为 (天下莫能与之争).
function _migrateAccountsFromSiblings(ctx) {
  const reasons = [];
  try {
    const PRODUCT = "windsurf"; // WAM PRODUCT_NAME.toLowerCase()
    const accountFile = `${PRODUCT}-login-accounts.json`;
    const myDir =
      (ctx.globalStorageUri && ctx.globalStorageUri.fsPath) ||
      ctx.globalStoragePath ||
      "";
    if (!myDir) {
      reasons.push("globalStoragePath 解析失败 · 跳");
      return { migrated: false, reasons };
    }
    const myPath = path.join(myDir, accountFile);
    const sharedPath = path.join(myDir, "..", accountFile);

    const isEmpty = (p) => {
      try {
        if (!fs.existsSync(p)) return true;
        const txt = fs.readFileSync(p, "utf8").trim();
        if (!txt || txt === "[]" || txt === "{}") return true;
        const arr = JSON.parse(txt);
        return !Array.isArray(arr) || arr.length === 0;
      } catch {
        return true;
      }
    };

    if (!isEmpty(myPath) || !isEmpty(sharedPath)) {
      reasons.push("primary 或 shared 非空 · 无需迁移 · 无为");
      return { migrated: false, reasons };
    }

    // 扫兄弟 globalStorage 子目录
    const parentDir = path.join(myDir, "..");
    let entries = [];
    try {
      entries = fs.readdirSync(parentDir, { withFileTypes: true });
    } catch (e) {
      reasons.push(`readdir 失败: ${e && e.message}`);
      return { migrated: false, reasons };
    }

    const myBase = path.basename(myDir).toLowerCase();
    let bestSrc = null;
    let bestCount = 0;
    let bestMtime = 0;
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ent.name.toLowerCase() === myBase) continue; // 跳自己
      const sibling = path.join(parentDir, ent.name);
      const candidates = [];
      // 直接 accounts 文件
      const direct = path.join(sibling, accountFile);
      if (fs.existsSync(direct)) {
        try {
          candidates.push({ p: direct, mtime: fs.statSync(direct).mtimeMs });
        } catch {}
      }
      // _wam_backups 内累计备份
      const backupDir = path.join(sibling, "_wam_backups");
      try {
        if (fs.existsSync(backupDir)) {
          for (const f of fs.readdirSync(backupDir)) {
            if (/^accounts_\d+\.json$/.test(f)) {
              const fp = path.join(backupDir, f);
              try {
                candidates.push({ p: fp, mtime: fs.statSync(fp).mtimeMs });
              } catch {}
            }
          }
        }
      } catch {}
      // 验证 + 选优 (count > bestCount, 同等比 mtime)
      for (const cand of candidates) {
        try {
          const data = JSON.parse(fs.readFileSync(cand.p, "utf8"));
          if (!Array.isArray(data) || data.length === 0) continue;
          if (
            data.length > bestCount ||
            (data.length === bestCount && cand.mtime > bestMtime)
          ) {
            bestSrc = cand.p;
            bestCount = data.length;
            bestMtime = cand.mtime;
          }
        } catch {}
      }
    }

    if (!bestSrc) {
      reasons.push(`无可迁源 · 扫 ${entries.length} 兄弟目录无果`);
      return { migrated: false, reasons };
    }

    // 复制到 primary + shared (双路 · L1 写盘)
    try {
      fs.mkdirSync(myDir, { recursive: true });
    } catch {}
    fs.copyFileSync(bestSrc, myPath);
    fs.copyFileSync(bestSrc, sharedPath);
    // 备份目录也带过来 (L3 灾难回退未来可用)
    try {
      const srcBkDir = path.join(path.dirname(bestSrc));
      const myBkDir = path.join(myDir, "_wam_backups");
      if (
        path.basename(srcBkDir) === "_wam_backups" &&
        !fs.existsSync(myBkDir)
      ) {
        fs.mkdirSync(myBkDir, { recursive: true });
        for (const f of fs.readdirSync(srcBkDir)) {
          if (/^accounts_\d+\.json$/.test(f)) {
            try {
              fs.copyFileSync(path.join(srcBkDir, f), path.join(myBkDir, f));
            } catch {}
          }
        }
      }
    } catch {}
    reasons.push(`迁 ${bestCount} 账号 · src=${bestSrc}`);
    return {
      migrated: true,
      count: bestCount,
      src: bestSrc,
      myPath,
      sharedPath,
      reasons,
    };
  } catch (e) {
    reasons.push(`异常: ${e && e.message}`);
    return { migrated: false, reasons };
  }
}

// ─── v17.84.3 · LS Gate 自施守 · *默认禁* · 不妄为 (141 事故根治) ───
//
// 历史:
//   v17.84.0 引入 _autoLsGateGuard, 默认开 (autoApply=true), 5s 后自动 patch.
//   141 事故 (2026-04-25 23:35): 多 Windows 账号共享 E:\Windsurf, zhou 用户 v17.84.2
//   启动 5s 后 patch 全机系统 ext.js, 路由 codeium 到 127.0.0.1:8889+hash,
//   但所有用户 dao-agi proxy 全未启 → 全机 Cascade ConnectError + 23 僵尸进程.
//   即使禁用插件目录 (.disabled_*), 系统 ext.js 仍是 patched 态, 一切瘫痪.
//
// 修源 (反者道之动 · 弱者道之用):
//   v17.84.3 改 cfg() default: lsGateAutoApply: true → false.
//   用户须显式开 (settings.json) 或手动 dao.lsGate.apply 才动系统级文件.
//   "不妄为 不着相 不禁止 不添加 不执 回归本真" — 函数仍在, 不删 (不禁止),
//   不加新限 (不添加), 仅默认零副作用 (不妄为).
//
// 指纹: ~/.wam-hot/_lsgate_fingerprint.json — Windsurf 版本 + 文件 sha + ts
//       下次启动若指纹漂移即知升级覆盖 · 自动重施 (仅当 autoApply=true)
function _autoLsGateGuard(reason) {
  try {
    const c = cfg();
    // v18.3.2 · 损 v17.86 重构残留 bug · 反者道之动
    //   旧: 此函数下半截 568/591 行直引 `autoApply` 但无声明 · 触 ReferenceError
    //       (cfg 字段重构 autoApply → lsGateAutoApply 时遗 2 处旧名)
    //   修: 顶层补单行 alias · 不动其余 · 大制不割
    const autoApply = !!(c && c.lsGateAutoApply);
    if (c && c.lsGateAutoApply === false) {
      log.info(
        "ls-gate",
        `auto-guard 跳 · 用户配 dao-agi.lsGate.autoApply=false`,
      );
      return;
    }
    // v17.86 · auto-guard 永传 includeBuiltin/includeOtherUsers = false
    //          即: 自动路径不动全机共享文件 · 不动他户文件
    //          (双保险 · 即使 autoApply 被误启, 141 事故不重蹈覆辙)
    const guardOpts = { includeBuiltin: false, includeOtherUsers: false };
    const st = lsGatePatcher.status(guardOpts);
    // status() 语义订正 (v17.84.1):
    //   signature_count = 仍含 GATE_SIGNATURE 的文件数 (即 *待* patch 数)
    //   patched_count   = 已被 patch (含 PATCH_MARKER) 的文件数
    //   total           = candidates 文件总数 (含无关 ext.js)
    if (!st || (st.signature_count === 0 && st.patched_count === 0)) {
      // 真无目标 — 本户 .windsurf/extensions/ 下无 windsurf-dao 类扩
      // (v17.86 默认不扫 builtin · 故本户未装伸展则真无目标)
      log.info(
        "ls-gate",
        `auto-guard · 未发现目标 (sig=0 patched=0 scope=${st && st.scope} · ${reason || "boot"}) · 无为`,
      );
      return;
    }
    // ─── v17.86 · stale-patch 自愈 (179/141 事故根治 · 第一道防线) ────
    //
    // 病象: 上版 (v17.84.x autoApply=true) 自施 patch · 之后版本 default=false
    //       但系统/扩展 ext.js 仍 patched · 形成 "卡死中间态":
    //         LS 路由 127.0.0.1:8889 · 但 proxy 未启 → ConnectError + Cascade 瘫
    //
    // 治: 检指纹 _lsgate_fingerprint.json
    //     若 fingerprint.dao_version ≠ 当前 PKG_VERSION (或无指纹但有 PATCH_MARKER)
    //     → 判为 "异版残留 patch" · 自动 revert (反者道之动)
    //     若 autoApply=true · revert 后顺势 re-apply (本版自施)
    //     若 autoApply=false · 仅 revert · 归官方默认行为 (用户意决)
    //
    // 哲: "为者败之, 执者失之. 是以圣人无为故无败." — 上版 patch 不属本版,
    //     须先归零再图新 (致虚极, 守静笃) · 不留中间态.
    if (st.patched_count > 0) {
      let lastFp = null;
      try {
        const fpFile = path.join(
          os.homedir(),
          ".wam-hot",
          "_lsgate_fingerprint.json",
        );
        if (fs.existsSync(fpFile)) {
          lastFp = JSON.parse(fs.readFileSync(fpFile, "utf8"));
        }
      } catch {}
      const fpVer = lastFp && lastFp.dao_version;
      const isStale = !fpVer || fpVer !== PKG_VERSION;
      if (isStale) {
        log.warn(
          "ls-gate",
          `stale-patch 检 · fp.dao_version=${fpVer || "(无)"} ≠ 当前 v${PKG_VERSION} · 自愈 revert (${st.patched_count} 文件 · scope=${st.scope})`,
        );
        try {
          const rv = lsGatePatcher.revert(guardOpts);
          log.info(
            "ls-gate",
            `stale revert · reverted=${rv.reverted || 0} skipped=${rv.skipped || 0} errors=${(rv.errors || []).length}`,
          );
          for (const f of rv.files || []) {
            if (f.reverted) log.info("ls-gate", `✓ stale revert: ${f.file}`);
            else if (!f.ok) log.warn("ls-gate", `✗ ${f.error} — ${f.file}`);
          }
          _writeLsGateFingerprint(rv, "stale-revert");
        } catch (e) {
          log.warn("ls-gate", `stale revert 异常 (无害): ${e && e.message}`);
        }
        // revert 后状态 · 若用户 autoApply=true · 顺势 re-apply 本版
        if (autoApply) {
          try {
            const st2 = lsGatePatcher.status(guardOpts);
            if (st2 && st2.signature_count > 0) {
              log.info(
                "ls-gate",
                `stale revert 后 sig=${st2.signature_count} · autoApply=true · re-apply 本版`,
              );
              const ra = lsGatePatcher.apply(guardOpts);
              log.info(
                "ls-gate",
                `re-apply · applied=${ra.applied} skipped=${ra.skipped}`,
              );
              _writeLsGateFingerprint(ra, "stale-then-applied");
            }
          } catch (e) {
            log.warn("ls-gate", `re-apply 异常: ${e && e.message}`);
          }
        }
        return;
      }
    }
    // ─── 第二道: 用户显式禁 autoApply 即跳 (尊用户意 · 不妄为) ────────
    if (!autoApply) {
      log.info(
        "ls-gate",
        `auto-guard 跳 · 用户配 dao-agi.lsGate.autoApply=false (默认 · 道法自然)`,
      );
      return;
    }
    const need = st.signature_count; // 仍含 SIGNATURE = 待 patch
    if (need === 0) {
      // 全 patched (signature 已替换为 marker)
      log.info(
        "ls-gate",
        `auto-guard · ${st.patched_count} 已 patch · 无为 (${reason || "boot"})`,
      );
      _writeLsGateFingerprint(st, "noop");
      return;
    }
    // 待 patch (Windsurf 升级覆盖 / 首次启动 / 主程序换装 / 多 candidates 部分待 patch)
    log.info(
      "ls-gate",
      `auto-guard · 检 ${need} 文件待 patch (已 patched=${st.patched_count} · ${reason || "boot"} · scope=${st.scope}) · 自施`,
    );
    const r = lsGatePatcher.apply(guardOpts);
    log.info(
      "ls-gate",
      `auto-guard · 施毕 applied=${r.applied} skipped=${r.skipped} errors=${(r.errors || []).length}`,
    );
    for (const f of r.files || []) {
      if (f.applied)
        log.info("ls-gate", `✓ 自施: ${f.file} (+${f.delta_chars || 0}c)`);
      else if (!f.ok) log.warn("ls-gate", `✗ ${f.error} — ${f.file}`);
    }
    _writeLsGateFingerprint(r, "applied");
  } catch (e) {
    // 主插件保护 · 任何失败仅 log · 不抛错 · 不弹通知 · 不阻 activate
    log.warn(
      "ls-gate",
      `auto-guard 异常 (无害 · 主插件不受影响): ${e && e.message}`,
    );
  }
}

// 指纹文件 · 记 patch 时刻 + Windsurf 版本 + 各目标文件 (size+mtime)
// 下次启动若文件 size/mtime 漂可知升级 · 触发重检
function _writeLsGateFingerprint(payload, kind) {
  try {
    const fp = {
      ts: new Date().toISOString(),
      kind: kind, // "applied" | "noop"
      dao_version: PKG_VERSION,
      windsurf_version: vscode.version || "?",
      files: [],
    };
    const list = (payload && payload.files) || [];
    for (const f of list) {
      if (!f.file) continue;
      try {
        const stat = fs.statSync(f.file);
        fp.files.push({
          file: f.file,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          patched: !!f.applied || !!f.patched,
          delta: f.delta_chars || 0,
        });
      } catch {}
    }
    const fpFile = path.join(
      os.homedir(),
      ".wam-hot",
      "_lsgate_fingerprint.json",
    );
    fs.mkdirSync(path.dirname(fpFile), { recursive: true });
    fs.writeFileSync(fpFile, JSON.stringify(fp, null, 2), "utf8");
  } catch {}
}

// ═══════════════════════ v17.85 · 卸载即归无 · 水过而无痕 ═══════════════════════
//
// 道之本源 (道德经第八十一章 终章 · 收束法则):
//   "天之道, 利而不害. 圣人之道, 为而不争."
//   "百姓皆谓我自然." (第十七章)
//   "上善若水, 水善利万物而不争." (第八章)
//   "为而不有, 功成而弗居. 夫唯弗居, 是以不去." (第二章)
//
// 病: VS Code/Windsurf 卸载扩展时仅删扩展目录, 不调任何 hook 清扫所留之痕.
//     dao-agi 之痕 (五事):
//       一. 系统主 ext.js 之 lsGate 补丁 (E:\Windsurf\...\extension.js)
//       二. settings.json codeium.inferenceApiServerUrl / codeium.apiServerUrl 二锚
//       三. ~/.wam-hot/ 之 fingerprint/lockfile/log/origin 解压副本
//       四. 自家 proxy 子进程 (detached, 父退仍存)
//       五. sentinel 自身 (脱壳后死)
//
// 解 (反者道之动 · 弱者道之用):
//   双途共用 _uninstall_sentinel.js 模块:
//     · 异步守护途 (deactivate 调起): spawn detached, 5s 后探 reload/uninstall
//     · 同步主动途 (dao.uninstall 命令): 直 require + runCleanup, 立即清扫
//
// 不灭 (留与用户 · 道法自然):
//   · globalStorage/dao-agi.dao-agi/ — 含 windsurf-login-accounts.json + _wam_backups/
//     此为用户实物 · 重装即续 · 不灭其根

// 收 lsGate 还原清单: [{file, bak}, ...] · 仅 .bak 真存的对
//
// v17.86 · 接 opts 透传 includeBuiltin/includeOtherUsers · 卸载场景:
//   只还原本插件实际 patch 过的文件. 即用户曾用 includeBuiltin=true 调
//   apply, 卸载时也应能还原 builtin .bak. 故此处读 cfg().lsGateInclude*
//   (与手动 apply 用同套配 · 对称收集).
function _collectLsGateBakManifest() {
  const out = [];
  try {
    const c = cfg();
    const collectOpts = {
      includeBuiltin: !!c.lsGateIncludeBuiltin,
      includeOtherUsers: !!c.lsGateIncludeOtherUsers,
    };
    const candidates = lsGatePatcher.findCandidates(collectOpts);
    for (const fp of candidates) {
      const bak = fp + ".bak.pre_dao_v17_68";
      if (fs.existsSync(bak)) out.push({ file: fp, bak });
    }
  } catch (e) {
    log.warn("uninstall", `collectBaks err: ${e && e.message}`);
  }
  return out;
}

// 收 settings.json 路径
//
// v17.86 · 默认仅当前户 (民至老死不相往来 · 不动他户 settings).
//          opts.includeOtherUsers=true 方扫 C:\Users\* 他户 settings.json
//          (运维场景 · 与 lsGate.includeOtherUsers 对称).
//          卸载场景调时读 cfg().lsGateIncludeOtherUsers.
function _collectUserSettingsPaths(opts) {
  opts = opts || {};
  const includeOtherUsers = !!opts.includeOtherUsers;
  const out = new Set();
  try {
    const homedir = os.homedir();
    if (IS_WIN) {
      const p = path.join(
        homedir,
        "AppData",
        "Roaming",
        "Windsurf",
        "User",
        "settings.json",
      );
      if (fs.existsSync(p)) out.add(p);
      // v17.86 · 默认不扫他户 · opts.includeOtherUsers=true 方扫
      // (用户 A 卸载不应清理用户 B/C/D 之 settings · 民至老死不相往来)
      if (includeOtherUsers) {
        const usersRoot = "C:\\Users";
        try {
          if (fs.existsSync(usersRoot)) {
            for (const u of fs.readdirSync(usersRoot)) {
              if (/^(public|default|all users|defaultuser)/i.test(u)) continue;
              const p2 = path.join(
                usersRoot,
                u,
                "AppData",
                "Roaming",
                "Windsurf",
                "User",
                "settings.json",
              );
              if (fs.existsSync(p2)) out.add(p2);
            }
          }
        } catch {}
      }
    } else if (process.platform === "darwin") {
      const p = path.join(
        homedir,
        "Library",
        "Application Support",
        "Windsurf",
        "User",
        "settings.json",
      );
      if (fs.existsSync(p)) out.add(p);
    } else {
      const p = path.join(
        homedir,
        ".config",
        "Windsurf",
        "User",
        "settings.json",
      );
      if (fs.existsSync(p)) out.add(p);
    }
  } catch (e) {
    log.warn("uninstall", `collectSettings err: ${e && e.message}`);
  }
  return Array.from(out);
}

// ─── v18.0 · sentinel 三函数归芜 (~160 行) · 进程内化后无 zombie 可斩 ───
//
// 道: "为者败之, 执者失之. 圣人无为故无败, 无执故无失." (第六十四章)
//   旧: spawn detached sentinel · 5s 后探 reload/uninstall · 守 spawn 子进程之死
//   今: ext-host 与 proxy 共生死 · http.Server.close() 自然归云 · 无 zombie 可守
//
//   _buildSentinelOpts / _spawnUninstallSentinel / _doSoftCleanupSync 全归 no-op
//   外部调用方多已 try/catch 包 · 返 {ok:false, reason} 不破坏

function _buildSentinelOpts(reason) {
  // v18.0 · 进程内化后无 sentinel 路径 · 仅留兼容入参
  const wamHot = path.join(os.homedir(), HOT_DIRNAME);
  return {
    reason,
    wamHot,
    extDir: __dirname,
    baks: _collectLsGateBakManifest(),
    settings: _collectUserSettingsPaths({}),
    proxyPid: 0,
    ownerName: process.env.USERNAME || "",
    logFile: "",
  };
}

function _spawnUninstallSentinel(_reason, _opts) {
  // v18.0 · sentinel 不再 spawn · 进程内化后 ext-host 死 = proxy 死 · 无须守
  return {
    ok: false,
    reason: "v18.0 进程内化 · sentinel 路径已废",
  };
}

// v18.1.1 · dao.uninstall 直行五事 (进程内化·无 sentinel·无 spawn)
//   一. lsGate revert       · 还原系统 ext.js 之 dev-mode 门禁
//   二. settings.json 锚清  · 删 codeium.{api,inference}ApiServerUrl
//   三. proxy stop         · in-process http.Server.close
//   四. ~/.wam-hot/ 删     · 解压副本归芜 (留 globalStorage)
//   不灭: globalStorage/dao-agi.dao-agi/ 含账号库 · 重装即续
async function _doDirectCleanup(reason, opts) {
  opts = opts || {};
  const result = {
    ok: true,
    reason,
    lsGate: { reverted: 0, skipped: 0, errors: 0 },
    settings: { cleaned: 0, skipped: 0, errors: 0, output: "" },
    proxy: { killed: false, reason: "" },
    wamHot: { removed: false, reason: "" },
  };
  // 一 · lsGate revert (用户 includeBuiltin/includeOtherUsers 显式开方扫越)
  try {
    const lgOpts = _lsGateOpts(true);
    const lgRes = lsGatePatcher.revert(lgOpts);
    result.lsGate = {
      reverted: lgRes.reverted || 0,
      skipped: lgRes.skipped || 0,
      errors: Array.isArray(lgRes.errors) ? lgRes.errors.length : 0,
      scope: lgRes.scope,
    };
  } catch (e) {
    result.lsGate.errors = 1;
    result.lsGate.error = e && e.message;
  }
  // 二 · settings.json codeium 锚清 (anchorRestore 已直行)
  try {
    const ar = await anchorRestore();
    result.settings = ar.ok
      ? { cleaned: 1, skipped: 0, errors: 0, output: ar.output }
      : { cleaned: 0, skipped: 0, errors: 1, output: ar.output };
  } catch (e) {
    result.settings.errors = 1;
    result.settings.error = e && e.message;
  }
  // 三 · proxy 停 (in-process · ext-host 共生死)
  try {
    if (_proxyHandle) {
      await hijackStop();
      result.proxy = { killed: true, reason: "in-process server.close" };
    } else {
      result.proxy = {
        killed: false,
        reason: "v18.0 进程内化 · proxy 与 ext-host 共生 (deactivate 自归云)",
      };
    }
  } catch (e) {
    result.proxy = { killed: false, error: e && e.message };
  }
  // 四 · ~/.wam-hot/ 整目录删 (除非 opts.skipWamHot)
  if (opts.skipWamHot) {
    result.wamHot = { removed: false, reason: "skipWamHot=true" };
  } else {
    try {
      const wamHot = path.join(os.homedir(), HOT_DIRNAME);
      if (fs.existsSync(wamHot)) {
        fs.rmSync(wamHot, { recursive: true, force: true });
        result.wamHot = { removed: true, path: wamHot };
      } else {
        result.wamHot = { removed: false, reason: "目录不存在 (已是归无态)" };
      }
    } catch (e) {
      result.wamHot = { removed: false, error: e && e.message };
    }
  }
  return { ok: true, result };
}

// v18.1.1 · 旧 _doSoftCleanupSync 调用方 → 改走 _doDirectCleanup (Promise)
//   保留同名 stub · dao.uninstall 已直调 _doDirectCleanup · 不再走此
function _doSoftCleanupSync(_reason, _opts) {
  return {
    ok: false,
    reason: "v18.1.1 · 改走 _doDirectCleanup (async) · 此 stub 仅留兼容",
  };
}

// ═══════════════════════ Hijack · 反代 (v18.0 进程内化) ═══════════════════════
//
// v18.0 · 损 spawn detached 之根 · 反者道之动
//   旧: spawn detached("node 源.js") + lockfile + 多账号验主 + sentinel 反 root
//   新: require + start({port}) · ext-host 共生死 · 一进程唯一拥
//   减: ~330 行 (lockfile/multi-account/spawn/proxyProc/pid alive 全去)
//   留: hijackStart/Stop/Status/SetMode 等 API 名 · 外部调用兼容
//
// "为者败之, 执者失之. 圣人无为故无败, 无执故无失." (第六十四章)
// ext-host 死 → http.Server.close() 自然归云 · 无 zombie · 无 sentinel · 无 lockfile

let _proxyHandle = null; // start() 返回 · {server, port, host, close, getMode, setMode}

// ─── v18.0 兼容 stub · 让 sentinel + orphan kill 路径仍可调 (阶二四一并删) ───
const _proxyProc = null; // 历: spawn 子进程引用 · 进程内化后永 null
function _readOwnerLock() {
  return null;
}
function _writeOwnerLock() {
  return null;
}
function _clearOwnerLock() {}
function _ownerLockPath() {
  return path.join(hotDir(), "_owner.lock");
}
function _isPidAlive() {
  return false;
}
function _isPortOwnedByCurrent() {
  return false;
}
function _currentOwnerInfo() {
  return {
    username: process.env.USERNAME || "",
    sid: "",
  };
}

function extensionRoot() {
  return path.resolve(__dirname);
}
function vendorDir() {
  const p = path.join(extensionRoot(), "vendor", ...VENDOR_SUBPATH);
  return fs.existsSync(p) ? p : null;
}
function hotDir() {
  return path.join(os.homedir(), HOT_DIRNAME, "origin");
}

// v17.86.4 · vendor 跳脏 (历) · v18.0 进程内化后 hot dir 仅 jsdelivr 自更承接
const _STALE_STATE_NAMES = new Set([
  "_settings_backup.json",
  "_settings_apiserver_backup.json",
  "_anchor_backup.json",
  "_multistore_backup.json",
  "_owner.lock",
]);
const _STALE_STATE_PATTERNS = [
  /^_settings_backup_\d{8}T\d{6}Z\.json$/i,
  /^_settings_apiserver_backup_\d{8}T\d{6}Z\.json$/i,
  /^_settings_backup_restored_\d{8}T\d{6}Z\.json$/i,
  /^_settings_apiserver_backup_restored_\d{8}T\d{6}Z\.json$/i,
  /^_anchor_backup_\d{8}_\d{6}\.json$/i,
  /^_multistore_backup_restored_\d{8}T\d{6}Z\.json$/i,
];
function _isStaleStateFile(fn) {
  if (!fn || typeof fn !== "string") return false;
  if (_STALE_STATE_NAMES.has(fn)) return true;
  return _STALE_STATE_PATTERNS.some((re) => re.test(fn));
}

/** 首次激活 · 自解压 vendor → ~/.wam-hot/origin/ (v18.0 仅 jsdelivr 自更承接 + 兼容 hot fallback) */
function ensureHot() {
  const vdir = vendorDir();
  const hdir = hotDir();
  if (!vdir) {
    log.warn("hijack", "vendor/wam/bundled-origin 未找到");
    return { copied: 0, skipped: 0, dir: hdir };
  }
  fs.mkdirSync(hdir, { recursive: true });
  let copied = 0,
    skipped = 0;
  for (const name of fs.readdirSync(vdir)) {
    if (_isStaleStateFile(name)) {
      skipped++;
      continue;
    }
    const src = path.join(vdir, name);
    const dst = path.join(hdir, name);
    try {
      const st = fs.statSync(src);
      if (!st.isFile()) continue;
      if (fs.existsSync(dst) && fs.statSync(dst).size === st.size) {
        skipped++;
        continue;
      }
      fs.copyFileSync(src, dst);
      copied++;
    } catch (e) {
      log.warn("hijack", `复制 ${name} 失败: ${e && e.message}`);
    }
  }
  log.info(
    "hijack",
    `hot ready: copied=${copied} skipped=${skipped} dir=${hdir}`,
  );
  return { copied, skipped, dir: hdir };
}

function isPortListening(port) {
  try {
    const cmd = IS_WIN
      ? `netstat -ano 2>nul | findstr ":${port} " | findstr "LISTENING"`
      : `lsof -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null`;
    const out = execSync(cmd, {
      timeout: 2000,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
      shell: true,
    });
    return String(out).trim().length > 0;
  } catch {
    return false;
  }
}

/** 寻找下一个空闲端口 · 备用端口 fallback (端口被外部占时) */
function _findFreePort(startPort, maxTries) {
  const max = maxTries || 50;
  for (let p = startPort; p < startPort + max && p < 65535; p++) {
    if (!isPortListening(p)) return p;
  }
  return null;
}

/** v18.0 · resolve 源.js 路径 · vendor 优先 (进程内化) + hot fallback (jsdelivr 自更兼容) */
function _resolveYuanJsPath() {
  const vdir = vendorDir();
  if (vdir) {
    for (const n of ["源.js", "source.js"]) {
      const fp = path.join(vdir, n);
      if (fs.existsSync(fp)) return fp;
    }
  }
  // hot fallback (jsdelivr 自更后的版本)
  const hdir = hotDir();
  for (const n of ["源.js", "source.js"]) {
    const fp = path.join(hdir, n);
    if (fs.existsSync(fp)) return fp;
  }
  return null;
}

/** v18.0 启动 源.js 反代 · 进程内 require + start · 损 spawn detached 之根 */
async function hijackStart(port) {
  port = port || DEFAULT_PORT;
  if (_proxyHandle && _proxyHandle.server && _proxyHandle.server.listening) {
    log.info("hijack", `源.js 已在进程内启 :${_proxyHandle.port} · 复用`);
    return hijackStatus(port);
  }

  // 端口已被外部占 → 找备用 (进程内化后唯一冲突源 = 别 ext-host / 别程序)
  if (isPortListening(port)) {
    const free = _findFreePort(port + 1, 50);
    if (!free) {
      log.warn("hijack", `端口 :${port} 被外部占 + 无可用备用 → 启代理放弃`);
      return hijackStatus(port);
    }
    log.warn("hijack", `端口 :${port} 被外部占 → 切备用端口 :${free}`);
    port = free;
  }

  ensureHot(); // jsdelivr 自更兼容 (v18.0 已不必但留)

  const yuanPath = _resolveYuanJsPath();
  if (!yuanPath) throw new Error(`源.js 未找到 (vendor + hot 皆无)`);

  // 透传身份 (源.js banner 读 · 兼容)
  process.env.DAO_OWNER_NAME = process.env.USERNAME || "";

  // 清 require cache · 防热更失效 (deactivate→activate 路径需重新加载)
  try {
    delete require.cache[require.resolve(yuanPath)];
  } catch {}

  log.info("hijack", `进程内 require ${yuanPath} on :${port}`);
  const yuan = require(yuanPath);
  if (typeof yuan.start !== "function") {
    throw new Error(
      `源.js 缺 start() 库接口 · 须 v18.0+ 版 (当前 vendor 旧版?)`,
    );
  }

  _proxyHandle = await yuan.start({ port, host: "127.0.0.1" });
  log.info(
    "hijack",
    `源.js 进程内启成功 · :${_proxyHandle.port} · pid=${process.pid} (ext-host)`,
  );
  return hijackStatus(port);
}

async function hijackStop() {
  if (!_proxyHandle) return;
  log.info("hijack", `停止 源.js (进程内 close)`);
  try {
    await _proxyHandle.close();
  } catch (e) {
    log.warn("hijack", `close err: ${e && e.message}`);
  }
  _proxyHandle = null;
  // 清 require cache · 下次 hijackStart 可重 require (热更新代码)
  try {
    const yuanPath = _resolveYuanJsPath();
    if (yuanPath) delete require.cache[require.resolve(yuanPath)];
  } catch {}
}

/** 切模式 · v18.0 进程内直调优先 (synchronous) · fallback HTTP */
async function hijackSetMode(mode, port) {
  // v18.0 进程内直调 (同步 · 即时一致)
  if (_proxyHandle && typeof _proxyHandle.setMode === "function") {
    const prev = _proxyHandle.getMode();
    const ok = _proxyHandle.setMode(mode);
    return ok
      ? { ok: true, mode, prev }
      : { ok: false, error: `invalid mode: ${mode}` };
  }
  // fallback HTTP (兼容外部代理 / 测试)
  port = port || DEFAULT_PORT;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/origin/mode`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ mode }),
      signal: AbortSignal.timeout(8000),
    });
    const raw = (await resp.text()).slice(0, 2000);
    if (!resp.ok) return { ok: false, status: resp.status, raw };
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {}
    if (parsed && parsed.ok && parsed.mode === mode) {
      return { ok: true, mode: parsed.mode, prev: parsed.previous, raw };
    }
    return { ok: false, raw, parsed };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/** ping 当前模式 · v18.0 进程内直调优先 */
async function hijackPingMode(port) {
  if (_proxyHandle && typeof _proxyHandle.getMode === "function") {
    return _proxyHandle.getMode();
  }
  port = port || DEFAULT_PORT;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/origin/mode`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) return "unknown";
    const t = (await r.text()).trim().toLowerCase();
    if (t.includes("invert")) return "invert";
    if (t.includes("passthrough")) return "passthrough";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** v18.7.2 · 清自定义 SP · 内存+持久化双清 · 防一键回退后残留 */
async function hijackClearCustomSP(port) {
  port = port || DEFAULT_PORT;
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/origin/custom_sp`, {
      method: "DELETE",
      headers: { connection: "close" },
      signal: AbortSignal.timeout(3000),
    });
    return (await resp.text()).slice(0, 500);
  } catch (e) {
    return `ERROR: ${e && e.message}`;
  }
}

/** v17.44 · 取 /origin/ping 全信息 (含 self_size 用于版本漂移检测) */
async function hijackPingInfo(port) {
  port = port || DEFAULT_PORT;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/origin/ping`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) return null;
    return JSON.parse(await r.text());
  } catch {
    return null;
  }
}

/** v17.44 · hot_dir 里 源.js 的实际大小 (用作版本指纹) */
function hotSourceSize() {
  const hot = hotDir();
  for (const n of ["源.js", "source.js"]) {
    const fp = path.join(hot, n);
    try {
      if (fs.existsSync(fp)) return fs.statSync(fp).size;
    } catch {}
  }
  return 0;
}

/** 强制重启 · v18.0 进程内 close + start (无 kill 进程 · 无 taskkill 端口) */
async function hijackForceRestart(port) {
  port = port || DEFAULT_PORT;
  log.info("hijack", "强制重启 源.js (进程内 close + start)");
  await hijackStop();
  await new Promise((r) => setTimeout(r, 200));
  return hijackStart(port);
}

function hijackStatus(port) {
  port = port || (_proxyHandle && _proxyHandle.port) || DEFAULT_PORT;
  const vdir = vendorDir();
  const hdir = hotDir();
  const handleAlive = !!(
    _proxyHandle &&
    _proxyHandle.server &&
    _proxyHandle.server.listening
  );
  // 进程内 handle 优先 · fallback 端口探活 (兼容外部代理 / 调试)
  const running = handleAlive || isPortListening(port);
  return {
    ready: !!vdir,
    hotDir: hdir,
    vendorDir: vdir,
    running,
    // v18.0 · pid = ext-host (proxy 与 ext-host 共生死)
    pid: handleAlive ? process.pid : undefined,
    port: handleAlive ? _proxyHandle.port : port,
    endpoint: `http://127.0.0.1:${handleAlive ? _proxyHandle.port : port}`,
  };
}

// ═══════════════════════ State · settings.json 单一锚 (v18.1) ═══════════════════════
//
// v18.1 · 大归本源 · 阶三 · 锚.py + 六层全归一 (~225 行死路归芜)
//
// 旧 (v17.x): 锚.py 六层锚 (L1 secret + L2 ItemTable + L3+L4 globalStates
//             + L5 settings.inference + L6 settings.apiserver)
// 今 (v18.1): settings.json 单一锚 (codeium.apiServerUrl + codeium.inferenceApiServerUrl)
//   理由: ① 进程内化后 proxy 与 ext-host 共生死 · L1 race-condition 已无
//         ② settings.json 是 Windsurf 主程序与 LS 子进程共读之处 · 一锚足矣
//         ③ ls-gate-patcher.js (L3) 仍留 · 解 dev-mode 门禁 · 让 setting 真生效
//   净: -76 KB Python (锚.py + anchor.py 双副本) · -39 KB · ~225 行 JS 死码归芜
//
// "为学日益, 为道日损. 损之又损, 以至于无为, 无为而无不为." — 第四十八章

/** settings.json 路径 (跨平台) · v18.1 唯一锚位 */
function _settingsJsonPath() {
  const home = os.homedir();
  if (IS_WIN)
    return path.join(
      home,
      "AppData",
      "Roaming",
      "Windsurf",
      "User",
      "settings.json",
    );
  if (process.platform === "darwin")
    return path.join(
      home,
      "Library",
      "Application Support",
      "Windsurf",
      "User",
      "settings.json",
    );
  return path.join(home, ".config", "Windsurf", "User", "settings.json");
}

/** 历: state.vscdb 路径检测 · v18.1 仅留作迁移脚本兜底 */
function _findStateDb() {
  const candidates = [
    path.join(
      os.homedir(),
      "AppData",
      "Roaming",
      "Windsurf",
      "User",
      "globalStorage",
      "state.vscdb",
    ),
    path.join(
      os.homedir(),
      ".config",
      "Windsurf",
      "User",
      "globalStorage",
      "state.vscdb",
    ),
    path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Windsurf",
      "User",
      "globalStorage",
      "state.vscdb",
    ),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

// ─── v18.1 · 锚.py + Python 检测全归 stub (无须再调外部进程) ───
function _hasPython() {
  return false;
}
function _pyCmd() {
  return "python";
}
function _hasCryptography() {
  return false;
}
function _findAnchorPy() {
  return null;
}
function _runAnchorPy() {
  return { ok: false, output: "v18.1 锚.py 已废 · settings.json 单一锚" };
}
function readSecretApiUrl() {
  return readApiServerUrl();
}

/** 读 settings.json 中的 codeium 锚 · v18.1 替代 vscdb 二进制扫描 · v18.2.2 BOM 兼容 */
function readApiServerUrl() {
  const sp = _settingsJsonPath();
  if (!fs.existsSync(sp)) return null;
  try {
    let txt = fs.readFileSync(sp, "utf8");
    if (txt.length > 0 && txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
    if (!txt.trim()) return null;
    const json = JSON.parse(txt);
    return (
      json["codeium.apiServerUrl"] ||
      json["codeium.inferenceApiServerUrl"] ||
      null
    );
  } catch (e) {
    log.warn("settings", `读 settings.json 失败: ${e && e.message}`);
    return null;
  }
}

/** 锚定 · v18.1 · settings.json 单一锚 (codeium.apiServerUrl + inferenceApiServerUrl) */
//
// v18.2.2 · BOM 兼容 (Set-Content -Encoding UTF8 / 用户编辑器可能加 BOM)
//   旧: 直 JSON.parse(txt) · BOM 致 SyntaxError · ok=false · 锚不立
//   修: 读时去 BOM (与 deactivate L3 + _detectAndHealDeadAnchor 同源)
async function anchor(url) {
  const sp = _settingsJsonPath();
  if (!fs.existsSync(sp)) {
    return { ok: false, output: "settings.json 未发现 (Windsurf 未启过?)" };
  }
  try {
    let txt = fs.readFileSync(sp, "utf8");
    if (txt.length > 0 && txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
    if (!txt.trim()) txt = "{}"; // 空文件兜底 · Windsurf 自会再充
    let json;
    try {
      json = JSON.parse(txt);
    } catch (e) {
      return {
        ok: false,
        output: `settings.json JSON 解析失败: ${e && e.message}`,
      };
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) json = {};
    const before1 = json["codeium.apiServerUrl"] || "(未设)";
    const before2 = json["codeium.inferenceApiServerUrl"] || "(未设)";
    json["codeium.apiServerUrl"] = url;
    json["codeium.inferenceApiServerUrl"] = url;
    fs.writeFileSync(sp, JSON.stringify(json, null, 2), "utf8");
    const lines = [
      `[settings.json 单一锚 · v18.1]`,
      `  § codeium.apiServerUrl:          ${before1} → ${url}`,
      `  § codeium.inferenceApiServerUrl: ${before2} → ${url}`,
    ];
    return { ok: true, output: lines.join("\n") };
  } catch (e) {
    return { ok: false, output: `写 settings.json 失败: ${e && e.message}` };
  }
}

/** 还原 · v18.1 · 删 settings.json 之 codeium 二锚 (回归官方默认) */
//
// v18.2.2 · BOM 兼容 · 同 anchor() · 防 SyntaxError 致 ok=false
async function anchorRestore() {
  const sp = _settingsJsonPath();
  if (!fs.existsSync(sp)) {
    return { ok: true, output: "settings.json 未发现 · 无须还原" };
  }
  try {
    let txt = fs.readFileSync(sp, "utf8");
    if (txt.length > 0 && txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
    if (!txt.trim()) txt = "{}";
    let json;
    try {
      json = JSON.parse(txt);
    } catch (e) {
      return {
        ok: false,
        output: `settings.json JSON 解析失败: ${e && e.message}`,
      };
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) json = {};
    const lines = ["[settings.json 还原 · v18.1]"];
    const before1 = json["codeium.apiServerUrl"];
    const before2 = json["codeium.inferenceApiServerUrl"];
    let changed = false;
    if (before1 != null) {
      delete json["codeium.apiServerUrl"];
      lines.push(`  § codeium.apiServerUrl:          ${before1} → (删)`);
      changed = true;
    }
    if (before2 != null) {
      delete json["codeium.inferenceApiServerUrl"];
      lines.push(`  § codeium.inferenceApiServerUrl: ${before2} → (删)`);
      changed = true;
    }
    if (!changed) {
      lines.push("  (无 codeium 锚 · 已是官方默认 · 无须还原)");
    } else {
      fs.writeFileSync(sp, JSON.stringify(json, null, 2), "utf8");
    }
    return { ok: true, output: lines.join("\n") };
  } catch (e) {
    return { ok: false, output: `写 settings.json 失败: ${e && e.message}` };
  }
}

/** 锚定状态 · v18.1 · 读 settings.json */
async function anchorStatus() {
  const url = readApiServerUrl();
  if (!url) {
    return {
      ok: true,
      output: "settings.json 无 codeium 锚 · 用官方默认",
    };
  }
  const isLocal = url.includes("127.0.0.1") || url.includes("localhost");
  return {
    ok: true,
    output: `${isLocal ? "已锚定本源反代" : "指向云"}: ${url}\n锚定: ${isLocal ? "是" : "否"}`,
  };
}

// ═══════════════════════ v17.87 · 死锚自愈 ═══════════════════════
//
// 道之本源:
//   "万物并作, 吾以观复. 夫物芸芸, 各复归其根." — 道德经 第十六章
//   "反者道之动, 弱者道之用." — 道德经 第四十章
//
// 病象 (179 / zhouyoukang 户实证 · 多版迭代仍现):
//   上次 deactivate 失败 / Windsurf 崩 / 用户 disable 插件 / VS Code 卸载未调钩,
//   settings.json 残锚 codeium.{api,inference}ServerUrl = http://127.0.0.1:N,
//   但 N 已无 proxy 监听 → LS 路由本地死端 → ECONNREFUSED → Cascade 全瘫.
//   即使重启 Windsurf 亦不自复 (settings 锚不动 · proxy 不在).
//
// 解 (反者道之动 · 弱者道之用):
//   activate 早期 (loadWamCore 之前) 检 settings.json 之 codeium 锚:
//     · 若锚 127.0.0.1:N 且 N 未监听 → 立 anchorRestore (六层归云)
//     · 若锚 127.0.0.1:N 且 N 已监听 → 不动 (正常运行)
//     · 若锚云端或无锚 → 不动 (无副作用)
//   纯 JS 直读 settings.json + TCP 探活 · 不依 anchor.py · 不依 proxy
//   主插件不依此 · 失败 silent log · 不抛 · 不阻 activate
//
//   返 {checked, healed, port?, key?, error?}
function _detectAndHealDeadAnchor() {
  try {
    // settings.json 路径 (跨平台 · 仅本户)
    let stg;
    if (IS_WIN) {
      stg = path.join(
        process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
        "Windsurf",
        "User",
        "settings.json",
      );
    } else if (process.platform === "darwin") {
      stg = path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Windsurf",
        "User",
        "settings.json",
      );
    } else {
      stg = path.join(
        os.homedir(),
        ".config",
        "Windsurf",
        "User",
        "settings.json",
      );
    }
    if (!fs.existsSync(stg)) return { checked: false, reason: "no-settings" };
    let raw = fs.readFileSync(stg, "utf8");
    if (raw.length > 0 && raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    if (!raw.trim()) return { checked: false, reason: "empty-settings" };
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      return { checked: false, reason: "jsonc-or-parse-err" };
    }
    if (!obj || typeof obj !== "object")
      return { checked: false, reason: "bad-obj" };
    const targetKeys = [
      "codeium.apiServerUrl",
      "codeium.inferenceApiServerUrl",
    ];
    let deadPort = null;
    let deadKey = null;
    for (const k of targetKeys) {
      const v = obj[k];
      if (typeof v !== "string") continue;
      const m = /^https?:\/\/127\.0\.0\.1:(\d+)/.exec(v);
      if (!m) continue;
      const p = parseInt(m[1], 10);
      if (!p) continue;
      if (!isPortListening(p)) {
        deadPort = p;
        deadKey = k;
        break;
      }
    }
    if (deadPort === null) return { checked: true, healed: false };
    log.warn(
      "dead-anchor",
      `检 settings ${deadKey}=127.0.0.1:${deadPort} 但 NOLISTEN · 启 anchorRestore 六层归云救`,
    );
    // 异步触发 anchorRestore · 不阻 activate · 失败 silent log
    anchorRestore()
      .then((ar) =>
        log.info(
          "dead-anchor",
          `死锚自愈完: anchorRestore ok=${ar.ok} · port=${deadPort} · settings 已归云`,
        ),
      )
      .catch((e) => log.warn("dead-anchor", `死锚自愈异常: ${e && e.message}`));
    return { checked: true, healed: true, port: deadPort, key: deadKey };
  } catch (e) {
    return {
      checked: false,
      reason: "exception",
      error: e && e.message ? e.message : String(e),
    };
  }
}

// ─── v18.0 · L5 卸载即斩 + sentinel 双 fallback 全归芜 (~200 行) ───
//
// 道: "为者败之, 执者失之. 圣人无为故无败, 无执故无失." (第六十四章)
//
// 病根 (v17.87.x 时代): spawn detached + unref · 父亡子不死 → 需 L5 卸载即斩
// 治根 (v18.0 进程内化): ext-host 死 → http.Server.close() 自然归云 · 无 zombie 可斩
//   _killOrphanProxyByOwnerLock / _ensureSentinelInHot / _resolveSentinelSrc 全 no-op

function _killOrphanProxyByOwnerLock() {
  return {
    checked: true,
    killed: false,
    reason: "v18.0 进程内化 · 无 zombie 可斩",
  };
}

function _ensureSentinelInHot() {
  return { ok: false, reason: "v18.0 进程内化 · sentinel 已废" };
}

function _resolveSentinelSrc() {
  return null;
}

// ═══════════════════════ 道 Agent 模式同步 ═══════════════════════

/** 同步 agentMode 给 WAM 核心 (agent_mode.json) */
function syncAgentMode(mode) {
  try {
    const wamDir = path.join(os.homedir(), HOT_DIRNAME);
    fs.mkdirSync(wamDir, { recursive: true });
    fs.writeFileSync(
      path.join(wamDir, "agent_mode.json"),
      JSON.stringify({ agentMode: mode, ts: Date.now() }),
    );
  } catch {}
}

// ═══════════════════════ 归一 (v17.69) · 模式状态探测 ═══════════════════════
// 合 DaoToggleProvider 职于本函 · 不再独立 webview · 归入 EssenceProvider 顶 bar.
// getModeLabel: 取当前 proxy 运行模式的人读文本 · 供 EssenceProvider 渲 tooltip.
// onModeChange: proxy 切换触发 · 映射 "dao"/"official"/"off" 至 wam.originInvert 等命令.

// v17.74 · 无off · 默认道
// v17.85.2 · saved 为先 · 运行态为辅 · UI 不闪不漂 · 道官分而治之
//   病: saved=passthrough 时反代正态停 · 旧码返 "道Agent 待启 (保存=passthrough)"
//      → webview 识 "未启动" → setModeUI('invert') → UI 闪漂回道
//   修: saved 即用户意 · 优先于运行客观态 · saved=passthrough 即官方Agent
//      锚已归云 · LS 直飞 · 反代不应跑 (跑则 autoRestoreOrigin 顺手停)
async function getModeLabel(ctx) {
  // v18.1.3 · 缺态兜 cfg().defaultMode (=passthrough) · 不再硬编 invert
  //   旧码: 首装 wam.origin 未写时返 "道Agent · 反代待启" → UI 闪显 道 高亮
  //   修: 缺态即取 package.json default=passthrough · 与 autoRestoreOrigin 一致
  //   反者道之动 · 弱者道之用 · 用户未明示 → 一律官方原味
  const saved =
    ctx.globalState.get("wam.origin") || cfg().defaultMode || "passthrough";
  const port = ctx.globalState.get("wam.originPort") || cfg().port;
  // ═══ 官方Agent (saved=passthrough) ═══ 锚归云 · 不依赖反代
  if (saved === "passthrough") {
    try {
      const st = hijackStatus(port);
      // 反代意外仍跑 (e.g. 别窗口残留) — saved 仍为先 · autoRestoreOrigin 会停
      return st.running
        ? `官方Agent · 直连云端 :${port} (反代待停)`
        : `官方Agent · 直连云端 (反代已停)`;
    } catch {
      return `官方Agent · 直连云端`;
    }
  }
  // ═══ 道Agent (saved=invert · 默认) ═══ 反代+道德经SP
  try {
    const st = hijackStatus(port);
    if (st.running) {
      const mode = await hijackPingMode(port);
      // 运行态 mode 与 saved 背离 (e.g. 旧 passthrough 残留) — saved 仍为先
      if (mode === "passthrough") return `道Agent · 反代待归道 :${port}`;
      return `道Agent 运行中 :${port}`;
    }
    return `道Agent · 反代待启 :${port}`;
  } catch {
    return `道Agent · 反代待启`;
  }
}

// v17.74 · 二态互斥 · 无off
async function onModeChange(mode) {
  const target =
    mode === "official" ? "wam.originPassthrough" : "wam.originInvert";
  try {
    await vscode.commands.executeCommand(target);
  } catch (e) {
    log.warn("dao-mode", `切换 ${mode} 异常: ${e && e.message}`);
  }
}

// ═══════════════════════ Origin 命令 ═══════════════════════

function registerOriginCommands(ctx, essenceProvider) {
  const refresh = () => {
    essenceProvider && essenceProvider.forceRefresh();
  };

  ctx.subscriptions.push(
    vscode.commands.registerCommand("wam.originInvert", async () => {
      try {
        // v18.3.1 · vendor WAM 已在 activate 加载 (onView 即表意) · 不再 lazy load
        const port = ctx.globalState.get("wam.originPort") || cfg().port;
        const st = hijackStatus(port);
        if (!st.running) {
          const s = await hijackStart(port);
          if (!s.running) {
            vscode.window.showErrorMessage("道Agent: 源.js 启动失败");
            return;
          }
        }
        // v18.9 · 原子化 · 仅 POST OK 后之同步 agent_mode.json · 防双源漂移
        const setRes = await hijackSetMode("invert", port);
        if (!setRes.ok) {
          log.warn(
            "origin",
            `invert POST 失: ${setRes.error || setRes.status || (setRes.raw && setRes.raw.slice(0, 200))}`,
          );
          vscode.window.showWarningMessage(
            `道Agent: 切模式失败 · ${setRes.error || "proxy 返非 ok"} · 不同步 agent_mode.json (防漂)`,
          );
          return;
        }
        const ar = await anchor(`http://127.0.0.1:${port}`);
        await ctx.globalState.update("wam.origin", "invert");
        await ctx.globalState.update("wam.originPort", port);
        syncAgentMode("dao");
        log.info(
          "origin",
          `invert: port=${port} prev=${setRes.prev || "?"} anchor=${ar.ok}`,
        );
        refresh();
        if (!ar.ok) {
          log.warn("origin", `invert 锚定失败: ${ar.output.slice(0, 200)}`);
        }
      } catch (e) {
        vscode.window.showErrorMessage(`道Agent: ${e && e.message}`);
      }
    }),

    // v17.85.1 · 官方Agent · 真回本源 · 鸡犬相闻 民至老死不相往来
    //
    // 病根 (v17.85.0 及之前): passthrough 仍 hijackStart + anchor(local) ·
    //   代理在跑 + 锚仍在 local · 名为"官方"实仍走代理 · 仅 SP 不替而已 ·
    //   既未"停反代" · 亦未"回归官方真本源" · 用户期与实背 · 道官未分而治 ·
    //   "鸡犬相争" 不相闻.
    //
    // 修源 (用户 2026-04-26 严令 · 反者道之动 · 弱者道之用):
    //   官方模式 = 完全回归官方:
    //     ① anchorRestore (六层锚回 server.codeium.com · LS 下次请求即直飞云)
    //     ② hijackStop (停反代 · 物理消音 · 端口让出)
    //     ③ 清 customSP (旧道德经/自定义 SP 全清 · 防再启 invert 残留)
    //   道与官 分而治之 · 道并行而不相悖 · 致虚守静 观复知常.
    //
    // 无感热切 (用户体验):
    //   - 切换瞬: anchorRestore 先行 · LS 下次请求即知新去向
    //   - 代理仍在跑的进行中请求 · 由 hijackSetMode passthrough 转纯转发 · 不损
    //   - 然后 hijackStop · 进行中无活态时方静默退场
    vscode.commands.registerCommand("wam.originPassthrough", async () => {
      try {
        // v18.3.1 · vendor WAM 已在 activate 加载 (onView 即表意) · 不再 lazy load
        const port = ctx.globalState.get("wam.originPort") || cfg().port;
        const st = hijackStatus(port);

        // 一、若代理仍在跑: 先 graceful 转 passthrough · 让进行中请求纯转发
        //    然后清 customSP · 防再切 invert 时残留旧 sp
        if (st.running) {
          try {
            const setRes = await hijackSetMode("passthrough", port);
            if (!setRes.ok) {
              log.warn(
                "origin",
                `passthrough graceful POST 失 (无伤 · 仍续锚还原+停代理): ${setRes.error || setRes.status}`,
              );
            }
          } catch (e) {
            log.warn("origin", `passthrough graceful 异常: ${e && e.message}`);
          }
          try {
            const clrResp = await hijackClearCustomSP(port);
            log.info("origin", `clear_customSP: ${clrResp.slice(0, 100)}`);
          } catch {}
        }

        // 二、还原锚 · 六层全归官方云 · LS 下次请求即直飞 · 此为"真回本源"
        //    即使代理仍在跑也无碍 · 锚归云 LS 不路由经它 · 民至老死不相往来
        let anchorOk = false;
        let anchorOutput = "";
        try {
          const ar = await anchorRestore();
          anchorOk = !!ar.ok;
          anchorOutput = (ar.output || "").slice(0, 200);
          log.info("origin", `passthrough: anchorRestore ok=${anchorOk}`);
        } catch (e) {
          log.warn(
            "origin",
            `passthrough anchorRestore 异常: ${e && e.message}`,
          );
        }

        // 三、停代理 · 物理消音 · 端口让出 · 反者道之动
        //    锚已归云 · 停之即真"停反代等相关内容"
        if (st.running) {
          try {
            await hijackStop();
            log.info(
              "origin",
              `passthrough: 反代已停 · 锚已归官 · LS 直飞云端`,
            );
          } catch (e) {
            log.warn("origin", `passthrough 停代理异常: ${e && e.message}`);
          }
        }

        // 四、状态同步 · 写 globalState + agent_mode.json
        await ctx.globalState.update("wam.origin", "passthrough");
        await ctx.globalState.update("wam.originPort", port);
        syncAgentMode("official");
        log.info(
          "origin",
          `passthrough 完毕 · port=${port} anchor=${anchorOk} · 道官分而治之`,
        );
        refresh();
        if (!anchorOk) {
          log.warn("origin", `passthrough anchorRestore 警: ${anchorOutput}`);
        }
      } catch (e) {
        log.warn("origin", `passthrough 异常: ${e && e.message}`);
      }
    }),

    // v17.82 · wam.originOff 已删 · 无第三态 · 用户径调 wam.originInvert / dao.toggleMode

    // v17.74 · 二态轮转 · 道 ⇄ 官方 · 无off
    vscode.commands.registerCommand("dao.toggleMode", async () => {
      // v18.1.3 · 缺态兜 cfg().defaultMode (=passthrough) · 与首装初态对齐
      const current =
        ctx.globalState.get("wam.origin") || cfg().defaultMode || "passthrough";
      const next =
        current === "invert" ? "wam.originPassthrough" : "wam.originInvert";
      await vscode.commands.executeCommand(next);
    }),

    // v17.68 · LS Gate Lift 三命 · 人面 API
    // v17.86 · 手动调用读 cfg().lsGateInclude* · includeBuiltin=true 时弹 modal 警
    //          (用户明示授权方动全机共享 / 他户文件 · 防 141 事故重蹈覆辙)
    vscode.commands.registerCommand("dao.lsGate.apply", async () => {
      const c = cfg();
      // v17.86 · 越界开则先弹 modal 警 · 用户二次确认后方动 (防误启)
      if (c.lsGateIncludeBuiltin || c.lsGateIncludeOtherUsers) {
        const detail = [
          "你已启用 LS Gate 越界配置:",
          c.lsGateIncludeBuiltin
            ? "  · includeBuiltin=true → 改全机共享 ext.js (Windsurf 安装路)"
            : "",
          c.lsGateIncludeOtherUsers
            ? "  · includeOtherUsers=true → 扫 C:\\Users\\* 他户 .windsurf/extensions/"
            : "",
          "",
          "副作用:",
          "  · 同电脑其他 Windows 账号下 Cascade 行为将受影响",
          "  · 141 事故 (2026-04-25) 即此越界 · 全机 23 进程瘫痪根因",
          "",
          "若仅为本户授权 LS Gate, 请先关此二配 (settings.json):",
          '  "dao-agi.lsGate.includeBuiltin": false',
          '  "dao-agi.lsGate.includeOtherUsers": false',
          "",
          "确认越界 patch?",
        ]
          .filter(Boolean)
          .join("\n");
        const pick = await vscode.window.showWarningMessage(
          "⚠ LS Gate 越界 patch · 影响其他 Windows 账号",
          { modal: true, detail },
          "明示授权 · 越界 patch",
          "取消",
        );
        if (pick !== "明示授权 · 越界 patch") {
          vscode.window.showInformationMessage(
            "LS Gate apply · 已取消 (民至老死不相往来 · 不动他户)",
          );
          return;
        }
      }
      const r = _lsGateApply(true);
      const msg = `LS Gate[${r.scope}]: applied=${r.applied} skipped=${r.skipped} errors=${(r.errors || []).length}`;
      if (r.applied > 0) {
        const pick = await vscode.window.showInformationMessage(
          `${msg} · Reload Window 生效`,
          "Reload",
        );
        if (pick === "Reload")
          vscode.commands.executeCommand("workbench.action.reloadWindow");
      } else {
        vscode.window.showInformationMessage(msg);
      }
    }),
    vscode.commands.registerCommand("dao.lsGate.status", async () => {
      const r = _lsGateStatus(true);
      if (!r) {
        vscode.window.showErrorMessage("LS Gate: status 失败");
        return;
      }
      const ch = vscode.window.createOutputChannel("道Agent · LS Gate 状态");
      ch.show(true);
      ch.appendLine(`═══ LS Gate 状态 · ${new Date().toISOString()} ═══`);
      ch.appendLine(`scope=${r.scope}`);
      ch.appendLine(
        `total=${r.total} patched=${r.patched_count} hasSignature=${r.signature_count}`,
      );
      for (const f of r.files) {
        const tag = f.patched
          ? "PATCHED"
          : f.hasSignature
            ? "UNPATCHED"
            : "N/A";
        ch.appendLine(`  [${tag}] ${f.file}`);
      }
    }),
    vscode.commands.registerCommand("dao.lsGate.revert", async () => {
      const c = cfg();
      // v17.86 · revert 越界亦警 (与 apply 对称)
      const detail =
        c.lsGateIncludeBuiltin || c.lsGateIncludeOtherUsers
          ? `LS Gate Revert · scope=${c.lsGateIncludeBuiltin ? "含 builtin " : ""}${c.lsGateIncludeOtherUsers ? "含他户" : ""}\n` +
            "将影响其他 Windows 账号. codeium.inferenceApiServerUrl 将再被 dev-gate 吞."
          : "LS Gate Revert: 仅还原本户 · codeium.inferenceApiServerUrl 将再被 dev-gate 吞 · 继续?";
      const pick = await vscode.window.showWarningMessage(
        detail,
        { modal: !!(c.lsGateIncludeBuiltin || c.lsGateIncludeOtherUsers) },
        "Revert",
        "Cancel",
      );
      if (pick !== "Revert") return;
      const r = _lsGateRevert(true);
      const msg = `LS Gate[${r.scope}]: reverted=${r.reverted} skipped=${r.skipped} errors=${(r.errors || []).length}`;
      if (r.reverted > 0) {
        const p2 = await vscode.window.showInformationMessage(
          `${msg} · Reload Window 生效`,
          "Reload",
        );
        if (p2 === "Reload")
          vscode.commands.executeCommand("workbench.action.reloadWindow");
      } else {
        vscode.window.showInformationMessage(msg);
      }
    }),

    // v17.85 · 卸载即归无 · 用户主动调 · 二次确认 · 同步清扫 · 弹通知
    // 道法自然 · 水过而无痕 · 五事毕: lsGate revert + settings 锚清 + proxy kill + ~/.wam-hot/ 清
    // 不动 globalStorage/dao-agi.dao-agi/ (账号库 · 重装即续)
    vscode.commands.registerCommand("dao.uninstall", async () => {
      const detail = [
        "卸载即归无 · 一切回归本源:",
        "  ① 还原 系统主 ext.js 之 lsGate 补丁 (从 .bak)",
        "  ② 清除 settings.json 之 codeium.inferenceApiServerUrl / apiServerUrl",
        "  ③ 终止 自家 proxy 子进程",
        "  ④ 删除 ~/.wam-hot/ 整目录",
        "",
        "留 (重装即续 · 不灭其根):",
        "  · globalStorage/dao-agi.dao-agi/ (含 WAM 账号库)",
        "",
        "清扫毕方可从 Extensions 面板 卸载 道Agent.",
      ].join("\n");
      const pick = await vscode.window.showWarningMessage(
        "道Agent 卸载即归无 · 水过而无痕",
        { modal: true, detail },
        "归无",
        "取消",
      );
      if (pick !== "归无") return;
      const ch = vscode.window.createOutputChannel("道Agent · 卸载归无");
      ch.show(true);
      ch.appendLine(
        `═══ 卸载归无 · v${PKG_VERSION} · ${new Date().toISOString()} ═══\n`,
      );
      // v18.1.1 · 进程内直行五事 · 损 spawn 之根 · 无 sentinel 死循
      const r = await _doDirectCleanup("uninstall-cmd", {
        skipWamHot: false,
      });
      if (!r.ok) {
        ch.appendLine(`✗ 归无失败: ${r.reason || r.error}`);
        vscode.window.showErrorMessage(`卸载归无失败: ${r.reason || r.error}`);
        return;
      }
      const res = r.result || {};
      const lg = res.lsGate || {};
      const st = res.settings || {};
      const px = res.proxy || {};
      const wh = res.wamHot || {};
      ch.appendLine(
        `① 系统 ext.js     reverted=${lg.reverted || 0} skipped=${lg.skipped || 0} errors=${lg.errors || 0}`,
      );
      ch.appendLine(
        `② settings.json  cleaned=${st.cleaned || 0} skipped=${st.skipped || 0} errors=${st.errors || 0}`,
      );
      ch.appendLine(
        `③ proxy           killed=${!!px.killed} reason=${px.reason || "-"}`,
      );
      ch.appendLine(
        `④ ~/.wam-hot/    removed=${!!wh.removed} reason=${wh.reason || "-"}`,
      );
      ch.appendLine(
        `\n═══ 五事毕 · 现可放心从 Extensions 面板 卸载 道Agent ═══`,
      );
      const totalErr =
        (lg.errors || 0) + (st.errors || 0) + (wh.removed ? 0 : 1);
      const summary =
        totalErr === 0
          ? `卸载归无 · 五事毕 · 水过无痕 · 现可从 Extensions 面板 卸载`
          : `卸载归无 · 部分失败 (${totalErr} err · 详见 输出面板) · 仍可卸载`;
      const p2 = await vscode.window.showInformationMessage(
        summary,
        "打开 Extensions",
        "完成",
      );
      if (p2 === "打开 Extensions") {
        try {
          await vscode.commands.executeCommand("workbench.view.extensions");
        } catch {}
      }
    }),

    vscode.commands.registerCommand("wam.verifyEndToEnd", async () => {
      const ch = vscode.window.createOutputChannel("道Agent · E2E 自检");
      ch.show(true);
      ch.appendLine(
        `═══ 道Agent v${PKG_VERSION} E2E · ${new Date().toISOString()} ═══\n`,
      );
      const port = ctx.globalState.get("wam.originPort") || cfg().port;
      // v18.1.3 · 诊断时缺态显 cfg().defaultMode (与 autoRestoreOrigin 一致)
      const savedMode =
        ctx.globalState.get("wam.origin") || cfg().defaultMode || "passthrough";
      const r = (ok, label, detail) =>
        ch.appendLine(`  ${ok ? "✓" : "✗"} ${label.padEnd(30)} ${detail}`);

      const vdir = vendorDir();
      r(!!vdir, "bundled-origin", vdir || "未找到");
      const hdir = hotDir();
      r(true, "hot dir", hdir);
      const st = hijackStatus(port);
      r(st.running, "源.js", st.running ? `:${port}` : "未运行");
      if (st.running) {
        const mode = await hijackPingMode(port);
        r(true, "模式", `${mode} (保存=${savedMode})`);
      } else {
        r(false, "模式", `未运行 (保存=${savedMode})`);
      }
      const anSt = await anchorStatus();
      r(anSt.ok, "锚定状态", anSt.output.slice(0, 200));
      // v17.68 · LS Gate Lift 补丁状态 (无此补丁则 inference 永绕代直飞云)
      // v17.86 · 透 forManual=true 以读用户实际配置 (含越界配) · 报告 scope
      try {
        const lg = _lsGateStatus(true);
        if (lg && lg.signature_count > 0) {
          const fullyPatched = lg.patched_count === lg.signature_count;
          r(
            fullyPatched,
            "LS Gate Lift",
            `patched=${lg.patched_count}/${lg.signature_count} scope=${lg.scope} (总扫 ${lg.total} 扩)`,
          );
          if (!fullyPatched) {
            r(
              false,
              "⚠ 后果",
              "inference 将绕代直飞云 · 反代捕不到 SP · 命 dao.lsGate.apply",
            );
          }
        } else if (lg) {
          // v17.86 · 默认 scope=current-user-only · 本户未装 windsurf-dao 即真无目标
          //          若用户欲 patch 全机 builtin · 须开 dao-agi.lsGate.includeBuiltin
          r(
            false,
            "LS Gate Lift",
            `未发现目标 (scope=${lg.scope}) · 若 windsurf 系 builtin 已装, 开 dao-agi.lsGate.includeBuiltin=true`,
          );
        } else {
          r(false, "LS Gate Lift", "status 失败 (lsGatePatcher 异常)");
        }
      } catch (e) {
        r(false, "LS Gate Lift", String(e && e.message));
      }
      // v17.60 · 文件层隔离自检
      try {
        const ws = getWorkspaceRoot();
        if (ws) {
          const iso = isolator.status(ws);
          r(true, "隔离模式", iso.mode || "unknown");
          r(
            true,
            "活动规则",
            `${iso.rules.active_count} (道=${iso.rules.dao_kept_count} 非道=${iso.rules.non_dao_active_count})`,
          );
          r(
            iso.rules.quarantined_count >= 0,
            "隔离区规则",
            `${iso.rules.quarantined_count}`,
          );
          // v17.75 · v17.68 起 enter() 无作 · 非道规则活动属正常态
          // SP 净化由 proxy 层 invert 承担 · 文件层不动
          if (iso.rules.non_dao_active_count > 0 && savedMode === "invert") {
            r(
              true,
              "隔离一致性",
              `道模式 · 非道规则 ${iso.rules.non_dao_active_count} 条活动 (正常 · SP净化归proxy层)`,
            );
          } else {
            r(true, "隔离一致性", "✓");
          }
        } else {
          r(false, "隔离", "无工作区");
        }
      } catch (e) {
        r(false, "隔离", String(e && e.message));
      }
      // v18.2.1 · 水之四德 自检项已去 (v18.0 进程内化后无 leader 可选举)
      ch.appendLine("\n═══ 完成 ═══");
    }),
  );
}

// ═══════════════════════ Origin 自动恢复 ═══════════════════════

// v17.85.1 · 道与官 分而治之 · 鸡犬相闻 民至老死不相往来 · 道并行而不相悖
//
// 病根 (v17.85.0 及之前): saved=passthrough 时仍 hijackStart + anchor(local) +
//   锚守 3 波 + 自愈守 30s · 代理在跑+锚仍在 local · 此非"官方真本源" · 道官浑.
//
// 修源:
//   passthrough 模式 (官方Agent):
//     · 不启代理
//     · anchorRestore (六层归云 · LS 直飞)
//     · 顺手停旧实例代理 (lockfile 残留 / 别窗口未停)
//     · 不挂锚守 · 不挂自愈守 (官方与道彻底分轨)
//   invert 模式 (道Agent):
//     · 启代理 (若未启)
//     · anchor(local) (LS 路由经反代)
//     · 设 mode=invert (代理可能在 passthrough 残留 · 强制归道)
//     · 挂 3 波锚守 (运行时再核 mode=invert)
//     · 挂 30s 自愈守 (运行时再核 mode=invert)
function autoRestoreOrigin(ctx) {
  try {
    let saved = ctx.globalState.get("wam.origin");
    // v17.87 · 反者道之动 · 首装默 cfg().defaultMode (default=passthrough)
    //   不再硬编 invert · 圣人之道为而不争 · 首装无副作用
    //   旧用户 globalState 已有 saved=invert 者保持不动 (向后兼容 · 不夺其意)
    //   off/null/undefined → 走 cfg().defaultMode (新装走 passthrough)
    if (!saved || saved === "off") {
      saved = cfg().defaultMode || "passthrough";
      ctx.globalState.update("wam.origin", saved);
    }
    // v18.8 · 多账号隔离迁移: 优先用 cfg().port (per-user), 旧 globalState 端口仅参考
    const effectivePort = cfg().port;
    const oldSavedPort = ctx.globalState.get("wam.originPort");
    if (oldSavedPort && oldSavedPort !== effectivePort) {
      log.info(
        "origin",
        `多账号隔离迁移: globalState=${oldSavedPort} → effectivePort=${effectivePort} (per-user hash)`,
      );
      ctx.globalState.update("wam.originPort", effectivePort);
    }
    const savedPort = effectivePort;

    // ════════════════════ passthrough 道 (官方Agent) ════════════════════
    // 不启代理 · 锚归云 · LS 直飞 · 不挂任何守护 (民至老死不相往来)
    if (saved === "passthrough") {
      // 异步还原锚 · 六层归官方云
      anchorRestore()
        .then((ar) =>
          log.info(
            "origin",
            `passthrough 自启: anchorRestore ok=${ar.ok} · LS 直飞云端`,
          ),
        )
        .catch((e) =>
          log.warn(
            "origin",
            `passthrough 自启 anchorRestore 异常: ${e && e.message}`,
          ),
        );
      // 顺手停旧实例代理 (若有 lockfile 残留 / 别窗口未关)
      const stCheck = hijackStatus(savedPort);
      if (stCheck.running) {
        hijackStop()
          .then(() =>
            log.info("origin", `passthrough 自启: 旧代理 :${savedPort} 已停`),
          )
          .catch(() => {});
      }
      log.info(
        "origin",
        `passthrough mode 自启 · 不启代理 · 不挂锚守/自愈 · 道官分而治之`,
      );
      return; // 早返 · 不挂锚守/自愈守
    }

    // ════════════════════ invert 道 (道Agent) ════════════════════
    // 启代理 · 锚 local · 设 invert 模式 · 挂锚守 + 自愈守
    if (saved === "invert") {
      const st = hijackStatus(savedPort);
      if (st.running) {
        hijackPingMode(savedPort)
          .then(async (mode) => {
            // v17.44 · 版本漂移检测: hot_dir 源.js 大小 vs 代理进程 self_size
            // 不一致 → 代理在跑旧代码, 强制重启拉新码
            const hotSize = hotSourceSize();
            const info = await hijackPingInfo(savedPort);
            const runningSize = (info && info.self_size) || 0;
            const drift =
              hotSize > 0 && runningSize > 0 && hotSize !== runningSize;
            if (mode === "unknown") {
              log.warn("origin", "代理端口活但 ping 不通 — 强制重启");
              const ns = await hijackForceRestart(savedPort);
              if (ns.running) await hijackSetMode("invert", savedPort);
            } else if (drift) {
              log.warn(
                "origin",
                `版本漂移: running=${runningSize}B hot=${hotSize}B — 强制重启拉新码`,
              );
              const ns = await hijackForceRestart(savedPort);
              if (ns.running) await hijackSetMode("invert", savedPort);
            } else {
              log.info(
                "origin",
                `代理已运行: :${savedPort} mode=${mode} saved=invert size=${runningSize}B`,
              );
              // v17.85.1 · 代理可能在 passthrough 残留 (上次切官未关之留) · 强制归道
              if (mode !== "invert") {
                log.info(
                  "origin",
                  `运行时代理 mode=${mode} ≠ saved=invert · 强制 setMode invert`,
                );
                await hijackSetMode("invert", savedPort);
              }
            }
            const ar = await anchor(`http://127.0.0.1:${savedPort}`);
            log.info("origin", `热重载锚验证: ok=${ar.ok}`);
          })
          .catch(() => {});
      } else {
        hijackStart(savedPort)
          .then(async (s) => {
            if (s.running) {
              await hijackSetMode("invert", s.port);
              const ar = await anchor(`http://127.0.0.1:${s.port}`);
              log.info(
                "origin",
                `冷恢复: running=true port=${s.port} mode=invert anchor=${ar.ok}`,
              );
            } else {
              // v17.85.1 · 防御: 代理启动失败 → 设置可能仍指 local · 还原锚保 LS 可达
              log.warn(
                "origin",
                `冷恢复: 启动失败 port=${s.port} · 还原锚保 LS 不失联`,
              );
              try {
                const ar = await anchorRestore();
                log.info("origin", `冷恢复防御: anchorRestore ok=${ar.ok}`);
              } catch (e) {
                log.warn("origin", `冷恢复防御异常: ${e && e.message}`);
              }
            }
          })
          .catch((e) => log.warn("origin", `冷恢复失败: ${e && e.message}`));
      }
    }

    // v17.66 · 锚守 · 损之又损 · 10 波 → 3 波
    // v17.85.1 · 仅 invert 模式挂锚守 (passthrough 已早返)
    //            运行时再核 mode === "invert" · 切官时让出 · 民至老死不相往来
    // v18.2.1 · _isFollower 死支去 · 进程内化后即 leader · 直走
    if (saved === "invert") {
      const _guardWaves = [10, 60, 180];
      let _guardReAnchors = 0;
      for (const delaySec of _guardWaves) {
        setTimeout(async () => {
          try {
            const curMode = ctx.globalState.get("wam.origin") || "invert";
            // v17.75 · 无off · 历史残留归一
            if (curMode === "off") {
              ctx.globalState.update("wam.origin", "invert");
              return;
            }
            // v17.85.1 · 切官时让出 · 不重锚 local
            if (curMode !== "invert") {
              log.info(
                "origin",
                `锚守[${delaySec}s] 让出: curMode=${curMode} ≠ invert · 道官分而治之`,
              );
              return;
            }
            // v17.66 · 非主 workspace 让行 (避免多 ext host SQLite 争锁)
            if (!getWorkspaceRoot()) return;
            const p = ctx.globalState.get("wam.originPort") || cfg().port;
            const proxyUrl = `http://127.0.0.1:${p}`;
            // 读 secret 层真值 (LS 真正读此) · 非二进制扫描
            const cur = readSecretApiUrl();
            if (cur && cur.includes("127.0.0.1")) return; // 锚在 · 无需重锚
            _guardReAnchors++;
            const ar = await anchor(proxyUrl);
            log.info(
              "origin",
              `锚守[${delaySec}s] 第${_guardReAnchors}次重锚: ok=${ar.ok} port=${p}`,
            );
          } catch {}
        }, delaySec * 1000);
      }
    }

    // v17.75 · proxy 自愈守护 · 30s 间隔 · 代理死则自启
    // v17.85.1 · 仅 invert 模式自愈 · passthrough 时不自愈代理 · 道官彻底分轨
    // v18.2.1 · leader 检死支去 · 进程内化后单实例即 leader
    if (saved === "invert" && getWorkspaceRoot()) {
      const _healInterval = setInterval(async () => {
        try {
          const curMode = ctx.globalState.get("wam.origin") || "invert";
          // v17.85.1 · 切官时让出 · 不自愈代理 (代理已停 · 不应被守复活)
          if (curMode !== "invert") return;
          const p = ctx.globalState.get("wam.originPort") || cfg().port;
          const st = hijackStatus(p);
          if (st.running) return; // 活 · 无需
          log.warn("heal", `proxy 死检 · 自启 :${p} mode=invert`);
          const s = await hijackStart(p);
          if (s.running) {
            await hijackSetMode("invert", p);
            const ar = await anchor(`http://127.0.0.1:${p}`);
            log.info("heal", `自愈成功: port=${p} anchor=${ar.ok}`);
          } else {
            log.warn("heal", `自愈失败: port=${p}`);
          }
        } catch (e) {
          log.warn("heal", `自愈异常: ${e && e.message}`);
        }
      }, 30000);
      ctx.subscriptions.push({ dispose: () => clearInterval(_healInterval) });
    }
  } catch (e) {
    log.warn("origin", `自动恢复异常: ${e && e.message}`);
  }
}

// ═══════════════════════ WAM 核心加载 · 以神遇而不以目视 ═══════════════════════
//
// WAM v17.36 起为切号纯本位, 但源码中仍留 origin 占位 stub (wam.originInvert/
// Passthrough/verifyEndToEnd), 其 handler 仅提示 "已移至 020-道VSIX_DaoAgi"。
// 我们要接管这些命令注入真实实现, 必须让 WAM 的占位 stub 不注册 (否则 VS Code
// 抛 "command already exists")。方法: 临时 hook vscode.commands.registerCommand,
// WAM 注册此三命令时静默放行 (返回 no-op disposable)。
// 不改 WAM 原片 (利而不害) · 不碰其他命令 (为而不争) · 不露痕迹 (太上不知有之)

const WAM_STUB_COMMANDS = new Set([
  "wam.originInvert",
  "wam.originPassthrough",
  "wam.originOff",
  "wam.verifyEndToEnd",
]);

let _wam = null;
function loadWamCore(ctx) {
  const wamPath = path.join(ctx.extensionPath, "vendor", "wam", "extension.js");
  if (!fs.existsSync(wamPath)) throw new Error(`WAM 核心未找到: ${wamPath}`);

  const origRegister = vscode.commands.registerCommand;
  let skipped = 0;
  vscode.commands.registerCommand = function (cmd, callback, thisArg) {
    if (WAM_STUB_COMMANDS.has(cmd)) {
      skipped++;
      log.info("wam-hook", `skip WAM stub: ${cmd} (override with dao-agi)`);
      return { dispose: function () {} };
    }
    return origRegister.apply(vscode.commands, arguments);
  };
  try {
    _wam = require(wamPath);
    _wam.activate(ctx);
  } finally {
    vscode.commands.registerCommand = origRegister;
  }
  log.info("boot", `本源 WAM 激活完成 · 道生一 · skipped=${skipped} stubs`);
}

// ═══════════════════════ v18.3.1 · 道法自然 · 真无为 · 损 v18.3.0 之过 ═══════════════════════
//
// 道: "为学日益, 为道日损. 损之又损, 以至于无为. 无为而无不为." (第四十八章)
//
// 病根 (v18.2.x · 首装即破 · 用户实证):
//   activationEvents=["*"] · activate 无条件运行 (用户未点亦激活)
//   loadWamCore 无条件 require 444KB vendor WAM (即装即扰全局 fetch)
//   ↳ ext-host 后端崩 / Cascade 前端瘫 — "夺其意" "为之者败"
//
// v18.3.0 之过 (修过则正 · 损 v18.3.0 之过):
//   加 _isUserOptedIn 闸 · 强制双重明示 (sidebar 点开 + 命令再点) → 切号面板与 SP 提取皆空
//   "用户点 sidebar" 已是明示意 · 不应再加 opt-in 闸 · v18.3.0 即"为者败之"
//
// 修源 (v18.3.1 · 真道法自然):
//   ① activationEvents 仍 onView (保 v18.3.0 之首装零侵入 · 用户不点即不动)
//   ② 删 _isUserOptedIn 闸 · 删所有 if (_optedIn) 闸 · onView 触发即全功能
//   ③ deactivate 仅留 _wam===null 防御快返 (实不应触发 · 因 onView 必加载 WAM)
//
// 落道:
//   首装/升级 · 用户不点 sidebar → activate 不 fire · Windsurf 一字不动 ✓
//   用户点 sidebar → activate · loadWamCore · 起 proxy · 锚 settings · 切号面板有内容 · SP 提取实时 ✓
//   用户卸载 → deactivate · anchorRestore · hijackStop · 清干净 ✓
//
// 哲: "无为而无不为" — 不强行作为 · 但用户表意时全力以赴 · onView 即用户表意

// ═══════════════════════ activate / deactivate ═══════════════════════

exports.activate = async function (ctx) {
  // v17.77 · 去芜存菁 · 专注本源SP隔离与回复
  // 不操作文件层 · 不操作MCP · 不操作记忆 · 不操作storage · 不自动patch ls-gate
  // 水善利万物而不争 · 夫唯不争 · 则天下莫能与之争
  // v17.88 · storage-guard 移出 VSIX · lsGatePatcher 手动命令仍保留 · 用户可自择调用
  //
  // breadcrumb: 写面包屑到独立文件 · 证 activate 已被调用 · 不依 vscode
  const _crumbFile = path.join(
    os.homedir(),
    ".wam-hot",
    "dao-activate-crumbs.log",
  );
  const _crumb = (tag) => {
    try {
      fs.appendFileSync(_crumbFile, `[${new Date().toISOString()}] ${tag}\n`);
    } catch {}
  };
  try {
    fs.mkdirSync(path.dirname(_crumbFile), { recursive: true });
  } catch {}
  _crumb(`activate-entry v${PKG_VERSION}`);

  // v17.77 · 去芜存菁 · 不自动操作 storage/ls-gate/文件层
  // v17.88 · storage-guard 已移出 VSIX (0 调用 · 独立 CLI 留 _archive/)
  // lsGatePatcher 手动命令仍在 · 用户可自择调用
  // 水善利万物而不争 · 夫唯不争 · 则天下莫能与之争
  _crumb("before-initLogger");

  initLogger();
  _crumb("after-initLogger");
  log.info(
    "boot",
    `道Agent v${PKG_VERSION} · 三层根因修复 · query剥离 · rpc_trace 诊断 · 道法自然`,
  );
  log.info(
    "boot",
    `extensionPath=${ctx.extensionPath} vscode=${vscode.version}`,
  );

  // ─── v18.3.1 · 道法自然 · 真无为 · onView 触发即用户表意 · 全功能直起 ───
  //
  // 道: "为学日益, 为道日损. 损之又损, 以至于无为. 无为而无不为." (第四十八章)
  //
  // v18.3.0 之过: 加 _isUserOptedIn 闸要求双重明示 (sidebar + 命令)
  //               → 切号面板与 SP 提取皆空 · "为者败之"
  // v18.3.1 修过: 删 opt-in 闸 · onView 即明示 · 下面诸事皆直运
  //               (跨户清 · L5 orphan kill · sentinel 备份 · L2 死锚自愈 ·
  //                LS gate · 账号迁 · loadWamCore · ensureHot · autoRestoreOrigin)
  log.info(
    "boot",
    `v18.3.1 · onView 触发 · 全功能直起 · 道法自然 (为道日损 · 损 v18.3.0 之过)`,
  );

  // ─── v17.86.4 · 跨户污染自清 · 致虚极 守静笃 (179 事故根治) ───
  //
  // 病根 (179 v17.86.3 事故):
  //   VSIX 历史误打 Administrator 户测试残留状态文件:
  //     vendor/wam/bundled-origin/_settings_backup.json  (original=8889 + Adm户路)
  //     vendor/wam/bundled-origin/_anchor_backup*.json   (旧 secret blob)
  //     vendor/wam/bundled-origin/_multistore_backup.json (Adm 户 state.vscdb)
  //     vendor/wam/bundled-origin/_owner.lock             (TEST SID + 假端口)
  //   zhouyoukang 户安装继承 → deactivate 触 anchorRestore →
  //   restore-inference 复 original=8889 → settings 锚 8889 但 proxy 在 8926 →
  //   Cascade 全瘫 (端口背离, settings/secret/state.vscdb 三处错位).
  //
  // 修源 (三保险):
  //   ① v17.86.4 .vscodeignore 加严 · 新 VSIX 不再打入 (源头治)
  //   ② 此处 activate 早期清 · 双扫 vendor + ~/.wam-hot/origin/ (旧 VSIX 残留治)
  //   ③ ensureHot 内 _isStaleStateFile 跳脏 · 防 vendor 残留再渗 hot (传输治)
  //
  // 哲: "致虚极, 守静笃 · 万物并作 · 吾以观复" (第十六章) —
  //      涤旧染归虚 · 然后乃可见万物之常.
  try {
    let _cleaned = 0;
    const dirs = [vendorDir(), hotDir()].filter((d) => d && fs.existsSync(d));
    for (const d of dirs) {
      for (const fn of fs.readdirSync(d)) {
        if (!_isStaleStateFile(fn)) continue;
        const fp = path.join(d, fn);
        try {
          if (!fs.statSync(fp).isFile()) continue;
        } catch {
          continue;
        }
        try {
          fs.unlinkSync(fp);
          _cleaned++;
          log.info(
            "clean",
            `涤跨户残留: ${path.relative(os.homedir(), fp) || fn}`,
          );
        } catch (e) {
          log.warn("clean", `清残留失败 (无害): ${fn} · ${e && e.message}`);
        }
      }
    }
    if (_cleaned > 0) {
      log.info(
        "clean",
        `清完毕 · ${_cleaned} 残留文件 · 致虚极守静笃 · 涤跨户污染归本真`,
      );
    }
  } catch (e) {
    log.warn("clean", `自清异常 (无害, 不阻 boot): ${e && e.message}`);
  }

  // ─── v17.87.2 · L5 卸载即斩 (orphan proxy zombie 主动收伏) ───
  //
  // 道: "为者败之, 执者失之. 圣人无为故无败, 无执故无失." (第六十四章)
  //   上次 ext host 崩 / Windsurf 强关 / 用户先 rm 插件再关 Windsurf
  //   均会留 detached proxy 子进程永生 (七根因·第一+第六).
  //   此处于 activate 最早 · 在 死锚自愈 + ensureHot + hijackStart 之前 ·
  //   按 owner.lock 验主 + cmdline 双确认强斩老 zombie.
  //   斩之 · 让出端口 · 让 hijackStart 重新 spawn 新 proxy · 一气贯通.
  try {
    const ko = _killOrphanProxyByOwnerLock();
    if (ko.killed) {
      log.warn(
        "boot",
        `L5 斩 orphan proxy: pid=${ko.pid} port=${ko.port} owner=${ko.owner} · 损有馈以补不足`,
      );
    } else if (ko.checked) {
      log.info(
        "boot",
        `L5 orphan proxy 检 · 无残 (${ko.reason || "ok"})${ko.pid ? ` pid=${ko.pid}` : ""}`,
      );
    } else {
      log.info("boot", `L5 orphan proxy 跳 (${ko.reason})`);
    }
  } catch (e) {
    log.warn(
      "boot",
      `L5 orphan proxy 异常 (无害, 不阻 boot): ${e && e.message}`,
    );
  }

  // ─── v17.87.2 · 预拷 sentinel 至 ~/.wam-hot/ (解死锁 · 七根因·第六) ───
  //
  // 道: "图难于其易, 为大于其细" (第六十三章)
  //   activate 时 (一切正常态) 顺手把 _uninstall_sentinel.js 拷到 hot 备份.
  //   即使用户后续先 rm 插件再关 Windsurf, deactivate 调 spawn sentinel
  //   仍能从 hot 副本 arm. 异步守护途不再死锁.
  try {
    const es = _ensureSentinelInHot();
    if (es.ok && es.copied) {
      log.info("boot", `sentinel 备份至 hot · ${es.dst}`);
    } else if (!es.ok) {
      log.warn("boot", `sentinel 备份失败 (无害): ${es.reason || es.error}`);
    }
  } catch (e) {
    log.warn("boot", `sentinel 备份异常 (无害): ${e && e.message}`);
  }

  // ─── v17.87 · 死锚自愈 (L2) · 万物并作 吾以观复 ───
  //
  // activate 早期 · 在 loadWamCore 之前 · 防 settings.json 残锚卡 Cascade.
  // 上次 deactivate 失败 / Windsurf 崩 / VS Code 卸载未调钩 之残痕,
  // 即此活复 · 即便插件主体启失败亦先救 settings.
  // 异步触发 anchorRestore · 不阻 activate · 主插件不依此 · 失败 silent log.
  try {
    const dh = _detectAndHealDeadAnchor();
    if (dh.healed) {
      log.warn(
        "boot",
        `L2 死锚自愈触发 · 127.0.0.1:${dh.port} (${dh.key}) NOLISTEN · 异步 anchorRestore 中`,
      );
    } else if (dh.checked) {
      log.info("boot", `L2 settings 锚检 · 健康 (无死锚)`);
    } else {
      log.info("boot", `L2 settings 锚检 · 跳 (${dh.reason})`);
    }
  } catch (e) {
    log.warn("boot", `L2 死锚检异常 (无害, 不阻 boot): ${e && e.message}`);
  }

  // v17.84.3 · LS Gate 自施守 · *默认禁* · 不妄为 不着相 (141 事故根治)
  //   141 事故 (2026-04-25): 多用户共享 Windsurf 装路 (E:\Windsurf\...),
  //   zhou 用户的 v17.84.2 启 5s 后自动 patch 系统主 ext.js (PATCH_MARKER),
  //   令所有用户 Windsurf 路由 inferenceApi → 127.0.0.1:8889+hash, 但 proxy 全未启,
  //   → 23 进程僵尸 + 全机 Cascade ConnectError 瘫痪.
  //
  //   修法 (反者道之动): cfg.lsGateAutoApply 默认 false → guard 函数早 return,
  //   无副作用. 用户须显式设 true (settings.json) 或手动调 dao.lsGate.apply
  //   (明示授权 · 用户负其果).
  //
  //   仍注册 setTimeout 但 guard 函数体在 cfg() false 时立即 return (零副作用).
  setTimeout(() => _autoLsGateGuard("activate-boot"), 5000);

  // v17.84.2 · 账号自迁移 (反者道之动 · 多代 WAM 演进无丢账号)
  //   主+shared 皆空时, 扫兄弟 globalStorage 子目录恢复账号至 primary+shared
  //   WAM 加载前完成 · 同步执行 (账号文件就绪后再 load)
  //   不抛错 · 不阻 boot · 仅 log
  try {
    const mr = _migrateAccountsFromSiblings(ctx);
    if (mr.migrated) {
      log.info(
        "migrate",
        `账号自迁移 · ${mr.count} 账号 · src=${mr.src} · ${mr.reasons.join("; ")}`,
      );
    } else {
      log.info("migrate", `账号自迁移 · 跳 · ${mr.reasons.join("; ")}`);
    }
  } catch (e) {
    log.warn("migrate", `账号自迁移异常 (无害): ${e && e.message}`);
  }

  // 一、本源 WAM 激活 (道生一)
  // WAM 切号为辅 · 其败不阻道Agent核心 · 天地不仁 以万物为狍狗
  // v18.3.1 · 直加载 vendor WAM (不再闸于 opt-in)
  try {
    loadWamCore(ctx);
  } catch (e) {
    log.error(
      "boot",
      `WAM 激活失败 (切号不可用 · 道Agent核心继续): ${e && e.message}`,
    );
    if (e && e.stack)
      log.error("boot", String(e.stack).split("\n").slice(0, 5).join("\n"));
    vscode.window.showWarningMessage(
      `切号模块未加载 (${e && e.message}) · 道Agent 核心正常运行`,
    );
  }

  // 二、Origin 自解压 (一生二)
  try {
    const h = ensureHot();
    log.info(
      "boot",
      `origin hot: copied=${h.copied} skipped=${h.skipped} @ ${h.dir}`,
    );
  } catch (e) {
    log.warn("boot", `ensureHot: ${e && e.message}`);
  }

  // 三、实时观照 watcher (v17.61 · 事件驱动 · 兵无常势水无常形)
  //   L1 文件监视 · L2 配置变更 · L3 编辑器状态 · L4 自适应轮询 · L5 工作区变更
  //   一切变化即发 change · essence 即刷 · 无事慢轮 · 有事快感
  const watcher = new DaoWatcher();
  try {
    watcher.start();
    log.info("watcher", "DaoWatcher 启 · 五层观 · 事件驱动");
  } catch (e) {
    log.warn("watcher", `start 失败: ${e && e.message}`);
  }
  ctx.subscriptions.push({
    dispose: () => {
      try {
        watcher.stop();
      } catch {}
    },
  });

  // 四、本源 WebView (v17.69 归一 · 一屏一幕 · 本源+模式浑然一统)
  //     顶 bar: 道/官/关 + 4 状态点 + 视图/刷新/复制 · 下方: SP 全文
  //     onModeChange: 按钮点 → 触发 wam.originInvert/Passthrough/Off
  //     getModeLabel: 心跳返文 "道Agent 运行中 :8889" 供 tooltip + webview 态显
  const essenceProvider = new EssenceProvider(ctx, {
    getPort: () => ctx.globalState.get("wam.originPort") || cfg().port,
    getIsolation: () => {
      const ws = getWorkspaceRoot();
      return ws ? isolator.status(ws) : null;
    },
    onModeChange: (mode) => onModeChange(mode),
    getModeLabel: () => getModeLabel(ctx),
    watcher, // v17.61 · 注入 watcher · 事件驱动刷新
    pollMs: 8000,
  });
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider("dao.essence", essenceProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    { dispose: () => essenceProvider.dispose && essenceProvider.dispose() },
    vscode.commands.registerCommand("wam.showEssence", async () => {
      try {
        await vscode.commands.executeCommand(
          "workbench.view.extension.wam-container",
        );
        await vscode.commands.executeCommand("dao.essence.focus");
        essenceProvider.reveal();
      } catch (e) {
        log.warn("essence", `showEssence: ${e && e.message}`);
      }
    }),
  );

  // 五、Origin 命令 (v17.69 · 不再传 toggleProvider · essenceProvider 一力承)
  registerOriginCommands(ctx, essenceProvider);

  // v18.5 · 自定义 SP 注入命令 · agent / 用户可直接热改动
  ctx.subscriptions.push(
    vscode.commands.registerCommand("dao.sp.set", async (spText) => {
      if (!spText) {
        spText = await vscode.window.showInputBox({
          prompt: "输入自定义提示词 (将替换道德经注入)",
          placeHolder: "You are a helpful assistant...",
        });
      }
      if (!spText || !spText.trim()) return;
      try {
        const r = await essenceProvider.setCustomSP(spText.trim());
        if (r && r.ok) {
          vscode.window.showInformationMessage(
            `自定义SP已注入 · ${r.chars}字 · 下次对话生效`,
          );
        } else {
          vscode.window.showErrorMessage(
            `SP注入失败: ${(r && r.error) || "代理无响应"}`,
          );
        }
      } catch (e) {
        vscode.window.showErrorMessage(`SP注入异常: ${e.message}`);
      }
    }),
    vscode.commands.registerCommand("dao.sp.get", async () => {
      try {
        const r = await essenceProvider.getCustomSP();
        if (r && r.has_custom) {
          const ch = vscode.window.createOutputChannel("道Agent · 自定义SP");
          ch.clear();
          ch.appendLine(`自定义SP · ${r.chars}字 · 源: ${r.source}`);
          ch.appendLine("─".repeat(60));
          ch.appendLine(r.sp);
          ch.show(true);
        } else {
          vscode.window.showInformationMessage(
            "当前无自定义SP · 使用道德经默认注入",
          );
        }
      } catch (e) {
        vscode.window.showErrorMessage(`获取SP异常: ${e.message}`);
      }
    }),
    vscode.commands.registerCommand("dao.sp.reset", async () => {
      const pick = await vscode.window.showWarningMessage(
        "清除自定义SP · 归道 · 恢复道德经注入?",
        "归道",
        "取消",
      );
      if (pick !== "归道") return;
      try {
        const r = await essenceProvider.resetCustomSP();
        if (r && r.ok) {
          vscode.window.showInformationMessage("自定义SP已清除 · 归道");
        } else {
          vscode.window.showErrorMessage("清除失败 · 代理无响应");
        }
      } catch (e) {
        vscode.window.showErrorMessage(`清除异常: ${e.message}`);
      }
    }),
  );

  // v17.83 · 水之四德命令 · status / reset / test / config
  // v18.0 · 进程内化后水德归芜 (无须选举/降频/滚切/熔断 · ext-host 自有 in-process proxy)
  // v18.1.1 · 命令仍注册 · 调即活报"已归芜"·不再报错·不破用户习惯 (太上不知有之)
  // 道: "为者败之, 执者失之. 圣人无为故无败, 无执故无失." (第六十四章)
  const _waterStubInfo = (sub) => {
    const ch = vscode.window.createOutputChannel(`道Agent · 水德 · ${sub}`);
    ch.show(true);
    ch.appendLine(`═══ 水之四德 · ${sub} · ${new Date().toISOString()} ═══\n`);
    ch.appendLine("◉ v18.0+ 进程内化后, 水之四德已归芜 (太上不知有之):");
    ch.appendLine(
      "  · 选举 (一德): 每 ext-host 自有 in-process proxy · 即 leader",
    );
    ch.appendLine("  · 降频 (二德): 单实例无须降频 · setInterval 直行");
    ch.appendLine("  · 滚切 (三德): proxy 共生死 · 日志归 ext-host channel");
    ch.appendLine("  · 熔断 (四德): 单 ext-host 单 client · 自然有界");
    ch.appendLine("\n◉ 损 spawn detached 之根 (v18.0):");
    ch.appendLine("  旧: spawn proxy 子进程 → 多 ext-host 共争 → 须水德分治");
    ch.appendLine(
      "  今: require + start({port}) → ext-host 死=proxy 死 → 自然归云",
    );
    ch.appendLine("\n◉ 当前 proxy 状态:");
    try {
      const port = ctx.globalState.get("wam.originPort") || cfg().port;
      const st = hijackStatus(port);
      ch.appendLine(`  · running: ${st.running}`);
      ch.appendLine(`  · port: ${st.port}`);
      ch.appendLine(`  · pid: ${st.pid || "(无 in-process handle)"}`);
      ch.appendLine(`  · endpoint: ${st.endpoint}`);
    } catch (e) {
      ch.appendLine(`  · 状态查询异常: ${e && e.message}`);
    }
    ch.appendLine("\n═══ 完 (无为而无不为) ═══");
  };
  ctx.subscriptions.push(
    vscode.commands.registerCommand("dao.water.status", async () => {
      _waterStubInfo("状态");
    }),
    vscode.commands.registerCommand("dao.water.reset", async () => {
      vscode.window.showInformationMessage(
        "水德已于 v18.0 归芜 (进程内化 · 无 leader lock 可释 · 无熔断历史可清)",
      );
      _waterStubInfo("重置");
    }),
    vscode.commands.registerCommand("dao.water.test", async () => {
      _waterStubInfo("自检");
    }),
    vscode.commands.registerCommand("dao.water.config", async () => {
      _waterStubInfo("配置");
    }),
  );

  // 六、Origin 自动恢复
  // v18.3.1 · onView 即用户表意 · 直调 autoRestoreOrigin (起 proxy + 锡 settings)
  autoRestoreOrigin(ctx);

  // 启动横幅 (太上不知有之 · 可配置隐藏)
  if (cfg().banner) {
    vscode.window.showInformationMessage(
      `道Agent v${PKG_VERSION} · ${randomQuote()}`,
    );
  }
  log.info(
    "boot",
    `激活完成 · v${PKG_VERSION} · 三层根因修复 · LS gate + anchor + rpc_trace · 道法自然`,
  );

  // v18.1.3 · persistent activation marker · 不在 wamhot · 不为 dao.uninstall 所灭
  //   ~/.dao-agi-meta/activation-history.jsonl (JSON Lines · 末 100 行限)
  //   存: ts/version/pid/user/extensionPath/mode/port
  //   用: 部署后验 activate 真行 · 跨户审计 · 不依登录态/vscdb
  //   道: "万物并作, 吾以观复" (第十六章) — 留客观留痕 · 守静观复
  try {
    const metaDir = path.join(os.homedir(), ".dao-agi-meta");
    fs.mkdirSync(metaDir, { recursive: true });
    const histLog = path.join(metaDir, "activation-history.jsonl");
    const savedMode =
      ctx.globalState.get("wam.origin") || cfg().defaultMode || "passthrough";
    const port = ctx.globalState.get("wam.originPort") || cfg().port;
    const entry = {
      ts: new Date().toISOString(),
      v: PKG_VERSION,
      pid: process.pid,
      user: os.userInfo().username,
      extensionPath: ctx.extensionPath,
      mode: savedMode,
      port: port,
    };
    fs.appendFileSync(histLog, JSON.stringify(entry) + "\n");
    // 限大小: 末 100 行 (~50KB) · 防累积无界
    try {
      const lines = fs
        .readFileSync(histLog, "utf8")
        .split("\n")
        .filter(Boolean);
      if (lines.length > 100) {
        fs.writeFileSync(histLog, lines.slice(-100).join("\n") + "\n");
      }
    } catch {}
    log.info("boot", `activation-marker 留 · ${histLog}`);
  } catch (e) {
    log.warn("boot", `activation-marker 异常 (无害): ${e && e.message}`);
  }
};

exports.deactivate = async function () {
  // v18.7.2 · 卸载/reload 双安: 先彻底脱代理 · 再 hijackStop
  // 道: 卸载场景下 settings 仍锚 127.0.0.1:8889 → windsurf 拒服失联.
  //     须先 anchorRestore (settings 指 server.codeium.com),
  //     再 hijackStop (停代理).
  // reload 场景: deactivate 后 activate 立即又 anchor 回代理, 仅微秒级浪费.
  // v17.87 · L3 兜底: 即使 anchorRestore 失败, sentinel 直清 settings 锚 (物理 fs)
  //
  // v18.3.0 · passive 模式快返 (无 WAM 加载 · 无 proxy · 无锚 · 无须清理)
  //   _wam===null 即未 lazy load · 此 ext-host 全程 passive · settings 净 · 直返
  //   "为者败之, 执者失之. 圣人无为故无败, 无执故无失." (第六十四章)
  if (_wam === null) {
    try {
      log.info("deactivate", `passive · 未加载 WAM · 无须清理 · 道法自然`);
    } catch {}
    return;
  }
  try {
    const port = DEFAULT_PORT;
    // 1. 清 _customSP (代理可能仍能响应)
    try {
      await hijackClearCustomSP(port);
    } catch {}
    // 2. anchorRestore (Settings + state.vscdb 六层归官方)
    try {
      const ar = await anchorRestore();
      log.info("deactivate", `anchorRestore: ok=${ar.ok}`);
    } catch (e) {
      log.warn("deactivate", `anchorRestore 异常: ${e && e.message}`);
    }
    // 3. v18.1.1 · L3 物理兜底 · 内联 settings codeium 锚清 (双保险)
    //    病: anchorRestore 异常 / settings.json JSON 解析败 / 文件锁
    //    解: 内联纯 JS · 不依 _uninstallSentinel (v18.0+ 该模块已不入 VSIX) ·
    //        anchorRestore 已直行此事 · 此层为"反者道之动 · 弱者道之用"双保
    //    历: v17.87 调 _uninstallSentinel._cleanSettingsJson · v18.0 该 ref=null 致死码
    //        v18.1.1 内联归本 · 损 _uninstallSentinel 之引 · 道法自然
    try {
      const stgPath = IS_WIN
        ? path.join(
            process.env.APPDATA ||
              path.join(os.homedir(), "AppData", "Roaming"),
            "Windsurf",
            "User",
            "settings.json",
          )
        : process.platform === "darwin"
          ? path.join(
              os.homedir(),
              "Library",
              "Application Support",
              "Windsurf",
              "User",
              "settings.json",
            )
          : path.join(
              os.homedir(),
              ".config",
              "Windsurf",
              "User",
              "settings.json",
            );
      let cleaned = 0,
        skipped = 0,
        errors = 0;
      if (!fs.existsSync(stgPath)) {
        skipped = 1;
      } else {
        try {
          let raw = fs.readFileSync(stgPath, "utf8");
          if (raw.length > 0 && raw.charCodeAt(0) === 0xfeff)
            raw = raw.slice(1);
          if (!raw.trim()) {
            skipped = 1;
          } else {
            const obj = JSON.parse(raw);
            // v18.1.1 · 二锚 codeium.{api,inference}ApiServerUrl 全清
            const targetKeys = [
              "codeium.apiServerUrl",
              "codeium.inferenceApiServerUrl",
            ];
            let changed = false;
            for (const k of targetKeys) {
              if (k in obj) {
                delete obj[k];
                changed = true;
              }
            }
            if (changed) {
              fs.writeFileSync(stgPath, JSON.stringify(obj, null, 2), "utf8");
              cleaned = 1;
            } else {
              skipped = 1;
            }
          }
        } catch (e) {
          errors = 1;
          log.warn("deactivate-l3", `settings 解析/写异常: ${e && e.message}`);
        }
      }
      log.info(
        "deactivate",
        `L3 物理兜底 (内联): cleaned=${cleaned} skipped=${skipped} errors=${errors}`,
      );
    } catch (e) {
      log.warn("deactivate", `L3 物理兜底异常 (无害): ${e && e.message}`);
    }
  } catch (e) {
    log.warn("deactivate", `回退异常: ${e && e.message}`);
  }
  try {
    _wam && _wam.deactivate && _wam.deactivate();
  } catch (e) {
    log.warn("deactivate", `WAM deactivate: ${e && e.message}`);
  }
  try {
    await hijackStop();
  } catch {}
  // v17.85 · 卸载即归无 · spawn 独立守护脉 (detached · 脱 vscode 命周)
  //   sentinel 延 5s 后探 EXT_DIR/package.json:
  //     · 仍在 → reload/upgrade · 静默退 · 不动一指
  //     · 已删 → 真卸载 · 启 软归无 · 五事毕 · 水过而无痕
  //   主插件不依此运转 · 失败一律降级 log · 不抛错 · 不影响 reload 路径
  try {
    const sr = _spawnUninstallSentinel("deactivate");
    if (sr.ok) {
      log.info(
        "deactivate",
        `uninstall sentinel armed · pid=${sr.pid} log=${sr.logFile}`,
      );
    } else {
      log.warn(
        "deactivate",
        `uninstall sentinel arm failed: ${sr.error || sr.reason}`,
      );
    }
  } catch (e) {
    log.warn("deactivate", `spawn sentinel exception: ${e && e.message}`);
  }
  log.dispose();
};
