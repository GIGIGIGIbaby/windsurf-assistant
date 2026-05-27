// ls-gate-patcher.js — v17.86 · 民至老死不相往来 · 默认 per-user 隔离
// ═══════════════════════════════════════════════════════════════════════
//
// 道之本源: 审视一切, 层层究至理 ——
//
// 病象: 反代五层锚全绿, 但 /origin/lastinject has_inject=false (万请求零捕).
// 病因: language_server_windows_x64.exe 启动参数固为
//         --inference_api_server_url https://inference.codeium.com
//       即锚下而 LS 命令行固化官方 URL, 一切 inference 流绕反代直飞云端.
//
// 本源: windsurf extension (dao-agi.windsurf-dao / codeium.windsurf) 之
//       dist/extension.js 内置一 u() 配置读取函数, 其首道门禁为:
//
//         if (!(t !== CODEIUM_DEV_EXT && t !== CODEIUM_EXT || h() || isDev()))
//           return d(A);   // 直还默认
//
//       t === "codeium" 时, 第一子句 (t!==DEV && t!==EXT) = (true && false) = false.
//       h() = 验 Codeium.codeium-dev 扩装否 · 生产 = false.
//       isDev() = VSCODE_DEV 环境变量 · 生产 = false.
//       整式: !(false||false||false) = !false = true → return d(A) 默认.
//
//       故: codeium.* 键于生产 恒 不 读 workspace 配置 · settings.json 之
//       codeium.inferenceApiServerUrl 永不生效 · LS 永启以硬编码官方 URL.
//
// 解法 (外科精准 · 弱者道之用 · 利而不害): 仅对 inferenceApiServerUrl 与
//   apiServerUrl 两键解除 dev-gate, 其他 codeium.* 键保持原行为. 令锚定生效.
//
// ─── v17.86 · 道并行而不相悖 · 鸡犬相闻 民至老死不相往来 ─────────────
//
// 病 (v17.85 之前): findCandidates 默认扫两越界范围:
//   一. C:\Users\* 各账号 .windsurf/extensions/  (跨用户文件)
//   二. <Windsurf-Install>/resources/app/extensions/ (全机共享 builtin)
//
// 用户 A 手动调 dao.lsGate.apply 时, patch 同时落于:
//   - 用户 B 之扩展副本 (越界改他户文件)
//   - 系统 builtin (改全机共享态 · 用户 C/D/E 全受影响)
// 此为 141 事故 (2026-04-25) 之深层根因. 即使 autoApply=false 治急疾,
// 手动路径仍可重蹈覆辙.
//
// 修 (反者道之动 · 弱者道之用):
//   默认 per-user only (仅 os.homedir() 单一户) · 不扫 builtin (零全机副作用)
//   opt-in via opts.includeOtherUsers / opts.includeBuiltin (或同名 env)
//   即: 用户明示授权 + 知晓后果 → 方可越界
//
// 道与官 各居其职 · 用户与用户 各居其户 · 道法自然.
//
// 用法:
//   const gp = require("./ls-gate-patcher");
//   const r = gp.apply();        // 默认仅当前户 · 不动 builtin
//   const r = gp.apply({ includeBuiltin: true });        // 含全机 builtin
//   const r = gp.apply({ includeOtherUsers: true });     // 含其他户 (慎)
//   const r = gp.status({ includeBuiltin: true });       // status 同 opts
//   const r = gp.revert({ includeBuiltin: true });       // revert 同 opts
//
// CLI (独立运行验证):
//   node ls-gate-patcher.js status
//   node ls-gate-patcher.js apply
//   node ls-gate-patcher.js revert
//   node ls-gate-patcher.js status --include-builtin     # 显式扫 builtin
//   node ls-gate-patcher.js apply --include-other-users  # 显式扫他户

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// ───────────────────────────────────────────────────────────────────────
// 特征: u() 函数的 dev-mode gate · 逐字符精确匹配 (避免误伤)
// 见 dao-agi.windsurf-dao-0.2.0/dist/extension.js :2556447 左右
// ───────────────────────────────────────────────────────────────────────
const GATE_SIGNATURE =
  "if(!(t!==e.CODEIUM_DEV_EXT&&t!==e.CODEIUM_EXT||h()||(0,a.isDevelopment)()))return d(A);";

// 新门禁: 对 inferenceApiServerUrl / apiServerUrl 放行 · 其他保留原行为
// 注: /*dao:v17.68*/ 为幂等识别标记 · 检到此串即视为已打过补丁
const GATE_REPLACEMENT =
  "/*dao:v17.68*/" +
  'if(!("apiServerUrl"===i||"inferenceApiServerUrl"===i)&&' +
  "!(t!==e.CODEIUM_DEV_EXT&&t!==e.CODEIUM_EXT||h()||(0,a.isDevelopment)()))return d(A);";

// 识别标记 · 见之即知已补丁
const PATCH_MARKER = "/*dao:v17.68*/";

// ───────────────────────────────────────────────────────────────────────
// 定位所有候选 dist/extension.js
// ───────────────────────────────────────────────────────────────────────

// 解 opts.includeXxx · 优先级: opts > env > 默认 (默认 false · 民至老死不相往来)
function _truthyEnv(name) {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] || ""));
}
function _resolveOpts(opts) {
  opts = opts || {};
  const includeOtherUsers =
    opts.includeOtherUsers === true ||
    (opts.includeOtherUsers === undefined &&
      _truthyEnv("DAO_LSGATE_INCLUDE_OTHER_USERS"));
  const includeBuiltin =
    opts.includeBuiltin === true ||
    (opts.includeBuiltin === undefined &&
      _truthyEnv("DAO_LSGATE_INCLUDE_BUILTIN"));
  return { includeOtherUsers, includeBuiltin };
}

// 默认 Windsurf extensions dir · 可覆: env WINDSURF_EXT_DIR
//
// v17.86 · 默认 per-user only (仅 os.homedir() / USERPROFILE / HOME 单户).
//          opts.includeOtherUsers=true (或 env DAO_LSGATE_INCLUDE_OTHER_USERS=1)
//          才扫 C:\Users\* (运维场景 · 用户明示授权).
//          WINDSURF_EXT_DIR env 仍优先 (单值, 完全用户控制).
function getExtDirs(opts) {
  const envDir = process.env.WINDSURF_EXT_DIR;
  if (envDir && fs.existsSync(envDir)) return [envDir];
  const { includeOtherUsers } = _resolveOpts(opts);
  const homes = new Set();
  homes.add(os.homedir());
  if (process.env.USERPROFILE) homes.add(process.env.USERPROFILE);
  if (process.env.HOME) homes.add(process.env.HOME);
  // v17.86 · 仅 includeOtherUsers=true 才扫他户 · 默认民至老死不相往来
  if (includeOtherUsers && process.platform === "win32") {
    const usersRoot = "C:\\Users";
    try {
      if (fs.existsSync(usersRoot)) {
        for (const u of fs.readdirSync(usersRoot)) {
          if (/^(public|default|all users|defaultuser)/i.test(u)) continue;
          const p = path.join(usersRoot, u);
          try {
            if (fs.statSync(p).isDirectory()) homes.add(p);
          } catch {}
        }
      }
    } catch {}
  }
  const candidates = [];
  for (const h of homes) {
    candidates.push(path.join(h, ".windsurf", "extensions"));
    candidates.push(path.join(h, ".windsurf-next", "extensions"));
    candidates.push(path.join(h, ".windsurf-insiders", "extensions"));
  }
  return candidates.filter((p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  });
}

// v17.81+ · 至关重要 : 扫 Windsurf 安装目录的 builtin extensions
//
// 病象: codeium.windsurf 主扩展 (含 u() 配置门禁) 实为 builtin extension,
//   位 <Windsurf-Install>/resources/app/extensions/windsurf/dist/extension.js,
//   而 getExtDirs() 仅扫 ~/.windsurf/extensions/ · 故 LS Gate 永不施补,
//   反代任修而万请求零捕 · 此为 dao v17.68 ~ 17.80 隐疾.
//
// 修: 同时扫 builtin · env WINDSURF_INSTALL_DIR 可覆 · 否则猜常见路径.
//
// v17.86 · 默认禁 builtin 扫 (全机共享 · patch 必致跨账号污染 · 141 事故根因).
//          opts.includeBuiltin=true (或 env DAO_LSGATE_INCLUDE_BUILTIN=1)
//          才放行 · 即"用户明示授权全机改写副作用".
//          自动路径 (autoLsGateGuard) 永传 false (已默认禁 autoApply, 双保险).
function getBuiltinExtDirs(opts) {
  const { includeBuiltin } = _resolveOpts(opts);
  if (!includeBuiltin) return []; // 默认零全机副作用 · 民至老死不相往来
  const envInstall = process.env.WINDSURF_INSTALL_DIR;
  const out = [];
  if (envInstall && fs.existsSync(envInstall)) {
    const p = path.join(envInstall, "resources", "app", "extensions");
    if (fs.existsSync(p)) out.push(p);
  }
  // 常见安装路径猜
  const guesses = [];
  if (process.platform === "win32") {
    // 盘符循环
    for (const drive of ["C:", "D:", "E:", "F:", "G:"]) {
      guesses.push(`${drive}\\Windsurf\\resources\\app\\extensions`);
    }
    guesses.push("C:\\Program Files\\Windsurf\\resources\\app\\extensions");
    guesses.push(
      "C:\\Program Files (x86)\\Windsurf\\resources\\app\\extensions",
    );
    if (process.env.LOCALAPPDATA) {
      guesses.push(
        path.join(
          process.env.LOCALAPPDATA,
          "Programs",
          "Windsurf",
          "resources",
          "app",
          "extensions",
        ),
      );
    }
    // 用户家目录下的 Programs
    if (process.env.USERPROFILE) {
      guesses.push(
        path.join(
          process.env.USERPROFILE,
          "AppData",
          "Local",
          "Programs",
          "Windsurf",
          "resources",
          "app",
          "extensions",
        ),
      );
    }
  } else if (process.platform === "darwin") {
    guesses.push(
      "/Applications/Windsurf.app/Contents/Resources/app/extensions",
    );
  } else {
    guesses.push("/usr/share/windsurf/resources/app/extensions");
    guesses.push("/opt/Windsurf/resources/app/extensions");
    if (process.env.HOME) {
      guesses.push(
        path.join(
          process.env.HOME,
          ".local",
          "share",
          "windsurf",
          "resources",
          "app",
          "extensions",
        ),
      );
    }
  }
  for (const g of guesses) {
    try {
      if (fs.existsSync(g) && fs.statSync(g).isDirectory()) {
        if (out.indexOf(g) < 0) out.push(g);
      }
    } catch {}
  }
  return out;
}

// 扫出所有 windsurf 系 extension 之 dist/extension.js
// 条件: 包含 CODEIUM_DEV_EXT&&t!==e.CODEIUM_EXT 特征 (即是含 u() 函数的 bundled extension)
//
// 双源扫: ~/.windsurf/extensions/  (用户装的)
//        + <install>/resources/app/extensions/ (builtin · 含主体 windsurf/9MB)
//
// v17.86 · opts.includeBuiltin / includeOtherUsers 透传至 getExtDirs/getBuiltinExtDirs.
//          默认: 仅当前户 + 不动 builtin (per-user 完全隔离).
function findCandidates(opts) {
  const out = [];
  // [A] 用户扩展 · 目录命名为 publisher.name-version
  for (const dir of getExtDirs(opts)) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      // 过滤: 仅取含 "windsurf" / "codeium" 子串的扩展目录 (速筛)
      const name = e.name.toLowerCase();
      if (!/windsurf|codeium/.test(name)) continue;
      const distExt = path.join(dir, e.name, "dist", "extension.js");
      if (!fs.existsSync(distExt)) continue;
      try {
        const st = fs.statSync(distExt);
        // 防呆: 文件 > 50KB (windsurf extension.js 往往 ~8MB · 小的多非主干)
        if (st.size < 50 * 1024) continue;
      } catch {
        continue;
      }
      out.push(distExt);
    }
  }
  // [B] Builtin 扩展 · 目录命名直为 name (无 publisher 前缀)
  //     v17.86 · 默认空 · 仅 opts.includeBuiltin=true 时方有候选
  for (const dir of getBuiltinExtDirs(opts)) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const name = e.name.toLowerCase();
      if (!/windsurf|codeium/.test(name)) continue;
      const distExt = path.join(dir, e.name, "dist", "extension.js");
      if (!fs.existsSync(distExt)) continue;
      try {
        const st = fs.statSync(distExt);
        if (st.size < 50 * 1024) continue;
      } catch {
        continue;
      }
      out.push(distExt);
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// 单文件检查 + 补丁 + 还原
// ───────────────────────────────────────────────────────────────────────

// 检一个 extension.js 的补丁状态
//   未发现特征 → {hasSignature:false, patched:false}  (不是目标文件或结构变异)
//   有特征未打 → {hasSignature:true, patched:false}
//   已打补丁  → {hasSignature:true, patched:true}  (遇 PATCH_MARKER 即真)
function inspectFile(fp) {
  let data;
  try {
    data = fs.readFileSync(fp, "utf8");
  } catch (e) {
    return { file: fp, ok: false, error: `read: ${e.message}` };
  }
  const patched = data.indexOf(PATCH_MARKER) >= 0;
  const hasSignature = data.indexOf(GATE_SIGNATURE) >= 0;
  const size = data.length;
  return {
    file: fp,
    ok: true,
    size,
    patched,
    hasSignature,
  };
}

// 打补丁 (幂等)
//   幂等: 已有 PATCH_MARKER → 返 skipped
//   必须: 原串恰好一处 · 多于一则返 error (拒绝模糊替换)
//   备份: .bak.pre_dao_v17_68 · 已存则不覆盖 (保留首次备份)
function patchFile(fp) {
  let data;
  try {
    data = fs.readFileSync(fp, "utf8");
  } catch (e) {
    return { file: fp, ok: false, error: `read: ${e.message}` };
  }
  if (data.indexOf(PATCH_MARKER) >= 0) {
    return { file: fp, ok: true, skipped: true, reason: "already_patched" };
  }
  const idx = data.indexOf(GATE_SIGNATURE);
  if (idx < 0) {
    // 非目标文件 (如 pyright 等仅名匹的扩展 · 不含 u() 函数) · 跳过而非错
    return { file: fp, ok: true, skipped: true, reason: "no_signature" };
  }
  // 防呆: 特征必须唯一
  const next = data.indexOf(GATE_SIGNATURE, idx + GATE_SIGNATURE.length);
  if (next >= 0) {
    return {
      file: fp,
      ok: false,
      error: "signature_not_unique (多处特征串 · 拒绝自动补丁)",
    };
  }
  const patched =
    data.slice(0, idx) +
    GATE_REPLACEMENT +
    data.slice(idx + GATE_SIGNATURE.length);
  // 备份 (仅首次 · 不覆盖已存 .bak)
  const bak = fp + ".bak.pre_dao_v17_68";
  try {
    if (!fs.existsSync(bak)) {
      fs.copyFileSync(fp, bak);
    }
  } catch (e) {
    return { file: fp, ok: false, error: `backup: ${e.message}` };
  }
  // 写入 (原子 · 先写 .tmp 再 rename)
  const tmp = fp + ".tmp.dao_v17_68";
  try {
    fs.writeFileSync(tmp, patched, "utf8");
    fs.renameSync(tmp, fp);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {}
    return { file: fp, ok: false, error: `write: ${e.message}` };
  }
  return {
    file: fp,
    ok: true,
    applied: true,
    backup: bak,
    delta_chars: patched.length - data.length,
  };
}

// 还原补丁 (幂等)
//   首选: 从 .bak 文件还原 (最高保真)
//   备选: 字符串替换 (无 .bak 时)
function revertFile(fp) {
  const bak = fp + ".bak.pre_dao_v17_68";
  if (fs.existsSync(bak)) {
    try {
      const raw = fs.readFileSync(bak);
      fs.writeFileSync(fp, raw);
      // .bak 保留 (不删 · 令下次 apply 仍可幂等识)
      return { file: fp, ok: true, reverted: true, from_backup: true };
    } catch (e) {
      return { file: fp, ok: false, error: `restore_from_bak: ${e.message}` };
    }
  }
  // 无 .bak: 尝试字符串反补
  let data;
  try {
    data = fs.readFileSync(fp, "utf8");
  } catch (e) {
    return { file: fp, ok: false, error: `read: ${e.message}` };
  }
  if (data.indexOf(PATCH_MARKER) < 0) {
    return { file: fp, ok: true, skipped: true, reason: "not_patched" };
  }
  const idx = data.indexOf(GATE_REPLACEMENT);
  if (idx < 0) {
    return {
      file: fp,
      ok: false,
      error: "patch_variant_unknown (replacement 串不精准 · 请手动检查)",
    };
  }
  const reverted =
    data.slice(0, idx) +
    GATE_SIGNATURE +
    data.slice(idx + GATE_REPLACEMENT.length);
  const tmp = fp + ".tmp.dao_v17_68_revert";
  try {
    fs.writeFileSync(tmp, reverted, "utf8");
    fs.renameSync(tmp, fp);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {}
    return { file: fp, ok: false, error: `write: ${e.message}` };
  }
  return { file: fp, ok: true, reverted: true, from_backup: false };
}

// ───────────────────────────────────────────────────────────────────────
// 公开 API
// ───────────────────────────────────────────────────────────────────────

// v17.86 · opts 透传 includeBuiltin/includeOtherUsers 至 findCandidates.
//          opts.files 仍优先 (调者已自筛) · 否则按 opts 算候选.
//          返回时回传 scope 元数据 · 供调者审计本次扫描范围.
function _scopeMeta(opts) {
  const r = _resolveOpts(opts);
  return {
    includeOtherUsers: r.includeOtherUsers,
    includeBuiltin: r.includeBuiltin,
    scope:
      !r.includeOtherUsers && !r.includeBuiltin
        ? "current-user-only"
        : r.includeBuiltin && !r.includeOtherUsers
          ? "current-user+builtin"
          : !r.includeBuiltin && r.includeOtherUsers
            ? "all-users"
            : "all-users+builtin",
  };
}

function apply(opts) {
  opts = opts || {};
  const files = opts.files || findCandidates(opts);
  const results = files.map(patchFile);
  return {
    ok: results.every((r) => r.ok),
    applied: results.filter((r) => r.applied).length,
    skipped: results.filter((r) => r.skipped).length,
    errors: results.filter((r) => !r.ok),
    files: results,
    ..._scopeMeta(opts),
  };
}

function status(opts) {
  opts = opts || {};
  const files = opts.files || findCandidates(opts);
  const results = files.map(inspectFile);
  return {
    ok: results.every((r) => r.ok),
    total: results.length,
    patched_count: results.filter((r) => r.patched).length,
    signature_count: results.filter((r) => r.hasSignature).length,
    files: results,
    ..._scopeMeta(opts),
  };
}

function revert(opts) {
  opts = opts || {};
  const files = opts.files || findCandidates(opts);
  const results = files.map(revertFile);
  return {
    ok: results.every((r) => r.ok),
    reverted: results.filter((r) => r.reverted).length,
    skipped: results.filter((r) => r.skipped).length,
    errors: results.filter((r) => !r.ok),
    files: results,
    ..._scopeMeta(opts),
  };
}

// ───────────────────────────────────────────────────────────────────────
// CLI
// ───────────────────────────────────────────────────────────────────────
function _fmtResult(label, r) {
  const lines = [`[${label}]`];
  for (const f of r.files) {
    const tag = f.applied
      ? "✓ applied"
      : f.reverted
        ? "✓ reverted"
        : f.skipped
          ? `- skipped (${f.reason})`
          : f.patched
            ? "· patched"
            : f.hasSignature
              ? "· unpatched"
              : f.ok
                ? "· no-signature"
                : `✗ ${f.error || "err"}`;
    lines.push(`  ${tag}  ${f.file}`);
  }
  lines.push(
    `  → total=${r.total ?? r.files.length} applied=${r.applied ?? "-"} reverted=${r.reverted ?? "-"} skipped=${r.skipped ?? "-"} patched=${r.patched_count ?? "-"}`,
  );
  return lines.join("\n");
}

if (require.main === module) {
  // v17.86 · CLI flag --include-builtin / --include-other-users 显式开越界
  const args = process.argv.slice(2);
  const cmd = (args.find((a) => !a.startsWith("-")) || "status").toLowerCase();
  const cliOpts = {
    includeBuiltin: args.includes("--include-builtin"),
    includeOtherUsers: args.includes("--include-other-users"),
  };
  let r;
  if (cmd === "apply") r = apply(cliOpts);
  else if (cmd === "revert") r = revert(cliOpts);
  else r = status(cliOpts);
  process.stdout.write(`[scope=${r.scope}] ` + _fmtResult(cmd, r) + "\n");
  process.exit(r.ok ? 0 : 2);
}

module.exports = {
  apply,
  status,
  revert,
  findCandidates,
  getExtDirs,
  getBuiltinExtDirs,
  // v17.86 · 暴露 helpers 供测试与外部审计
  _resolveOpts,
  _scopeMeta,
  GATE_SIGNATURE,
  GATE_REPLACEMENT,
  PATCH_MARKER,
};
