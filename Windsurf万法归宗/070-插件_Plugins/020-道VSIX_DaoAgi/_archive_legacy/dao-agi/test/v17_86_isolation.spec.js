// v17.86 · 多账号分而治之 · 跨户隔离回归测
// 道并行而不相悖 · 鸡犬相闻 民至老死不相往来 · 道法自然
//
// 测点:
//   一. ls-gate-patcher 默认 per-user only · 不动 builtin · 不扫他户
//   二. opts.includeBuiltin / includeOtherUsers 显式开越界
//   三. env DAO_LSGATE_INCLUDE_BUILTIN=1 同效
//   四. apply/status/revert 返回 scope 元
//   五. _resolveOpts 优先级: opts > env > false
//   六. CLI flag --include-builtin 解析
//   七. findCandidates(opts) 透传至 getExtDirs/getBuiltinExtDirs
//
// 确保 141 事故不重蹈覆辙 (一户手动 apply 不动他户/全机共享)

"use strict";
const path = require("node:path");

const lsGate = require(path.resolve(__dirname, "..", "ls-gate-patcher.js"));

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
  const s = cond ? "\u2713" : "\u2717";
  if (cond) pass++;
  else fail++;
  console.log(`  ${s} ${label.padEnd(58)} ${detail || ""}`);
};

console.log(
  "\u2550\u2550\u2550 v17.86 \u00b7 \u591a\u8d26\u53f7\u5206\u800c\u6cbb\u4e4b \u00b7 \u8de8\u6237\u9694\u79bb\u56de\u5f52\u6d4b \u2550\u2550\u2550",
);

// ───────────── 一 · 默认 per-user only · 民至老死不相往来 ─────────────
console.log(
  "\n\u4e00 \u00b7 \u9ed8\u8ba4 per-user only \u00b7 \u4e0d\u52a8\u4ed6\u6237 \u4e0d\u52a8 builtin",
);

// 清 env 干扰
delete process.env.DAO_LSGATE_INCLUDE_BUILTIN;
delete process.env.DAO_LSGATE_INCLUDE_OTHER_USERS;

// _resolveOpts 默认两皆 false
const r0 = lsGate._resolveOpts();
ok(
  "_resolveOpts() 默认 includeBuiltin=false",
  r0.includeBuiltin === false,
  `got ${r0.includeBuiltin}`,
);
ok(
  "_resolveOpts() 默认 includeOtherUsers=false",
  r0.includeOtherUsers === false,
  `got ${r0.includeOtherUsers}`,
);

// _resolveOpts({}) 同 (空 opts)
const r0b = lsGate._resolveOpts({});
ok(
  "_resolveOpts({}) 默认 includeBuiltin=false",
  r0b.includeBuiltin === false,
  `got ${r0b.includeBuiltin}`,
);

// getBuiltinExtDirs() 默认空 (零全机副作用)
const builtins0 = lsGate.getBuiltinExtDirs();
ok(
  "getBuiltinExtDirs() 默认空数组 (不动全机)",
  Array.isArray(builtins0) && builtins0.length === 0,
  `len=${builtins0.length}`,
);

// getExtDirs() 默认仅当前户 (homedir)
const homeExtDirs = lsGate.getExtDirs();
ok(
  "getExtDirs() 默认仅当前户",
  Array.isArray(homeExtDirs),
  `dirs=${homeExtDirs.length}`,
);
// 不应含他户 (C:\Users\<other> 但非 homedir)
const os = require("os");
const home = os.homedir();
const hasForeign = homeExtDirs.some(
  (d) =>
    !d.startsWith(home) &&
    !(process.env.USERPROFILE && d.startsWith(process.env.USERPROFILE)) &&
    !(process.env.HOME && d.startsWith(process.env.HOME)) &&
    !d.startsWith(process.env.WINDSURF_EXT_DIR || "\u0000"),
);
ok(
  "getExtDirs() 不含他户路径 (homedir 外)",
  !hasForeign,
  hasForeign ? "found foreign path" : "all under home",
);

// findCandidates() 默认 scope=current-user-only
const c0 = lsGate.findCandidates();
ok(
  "findCandidates() 默认无 builtin 路径",
  !c0.some((p) => /resources[\\/]+app[\\/]+extensions/.test(p)),
  `${c0.length} candidates`,
);

// ───────────── 二 · opts.includeBuiltin=true 显式开 ─────────────
console.log(
  "\n\u4e8c \u00b7 opts.includeBuiltin=true \u00b7 \u660e\u793a\u6388\u6743\u8d8a\u754c",
);

const r1 = lsGate._resolveOpts({ includeBuiltin: true });
ok(
  "_resolveOpts({includeBuiltin:true}) 解为 true",
  r1.includeBuiltin === true,
  `got ${r1.includeBuiltin}`,
);
ok(
  "_resolveOpts({includeBuiltin:true}) includeOtherUsers 仍 false",
  r1.includeOtherUsers === false,
  `got ${r1.includeOtherUsers}`,
);

// opts.includeOtherUsers=true 同
const r2 = lsGate._resolveOpts({ includeOtherUsers: true });
ok(
  "_resolveOpts({includeOtherUsers:true}) 解为 true",
  r2.includeOtherUsers === true,
  `got ${r2.includeOtherUsers}`,
);

// 二者皆 true
const r3 = lsGate._resolveOpts({
  includeBuiltin: true,
  includeOtherUsers: true,
});
ok(
  "_resolveOpts({both:true}) 二配皆 true",
  r3.includeBuiltin === true && r3.includeOtherUsers === true,
);

// ───────────── 三 · env DAO_LSGATE_INCLUDE_BUILTIN=1 同效 ─────────────
console.log(
  "\n\u4e09 \u00b7 env \u53d8\u91cf opt-in (\u8fd0\u7ef4\u573a\u666f)",
);

process.env.DAO_LSGATE_INCLUDE_BUILTIN = "1";
const rEnv1 = lsGate._resolveOpts();
ok(
  "env DAO_LSGATE_INCLUDE_BUILTIN=1 → true",
  rEnv1.includeBuiltin === true,
  `got ${rEnv1.includeBuiltin}`,
);

// opts={} 时 env 应生效 (undefined 走 env)
const rEnv2 = lsGate._resolveOpts({});
ok(
  "opts={} 不覆 env (undefined → 走 env)",
  rEnv2.includeBuiltin === true,
  `got ${rEnv2.includeBuiltin}`,
);

// opts.includeBuiltin=false 显式覆 env
const rEnv3 = lsGate._resolveOpts({ includeBuiltin: false });
ok(
  "opts.includeBuiltin=false 显式覆 env=1 · 仍 false?",
  rEnv3.includeBuiltin === false,
  `got ${rEnv3.includeBuiltin} (注: opts !== undefined → 走 opts)`,
);

// 各种 truthy env (1/true/yes/on)
delete process.env.DAO_LSGATE_INCLUDE_BUILTIN;
process.env.DAO_LSGATE_INCLUDE_BUILTIN = "true";
ok("env=true → true", lsGate._resolveOpts().includeBuiltin === true);
process.env.DAO_LSGATE_INCLUDE_BUILTIN = "yes";
ok("env=yes → true", lsGate._resolveOpts().includeBuiltin === true);
process.env.DAO_LSGATE_INCLUDE_BUILTIN = "0";
ok("env=0 → false", lsGate._resolveOpts().includeBuiltin === false);
process.env.DAO_LSGATE_INCLUDE_BUILTIN = "no";
ok("env=no → false", lsGate._resolveOpts().includeBuiltin === false);
delete process.env.DAO_LSGATE_INCLUDE_BUILTIN;

// ───────────── 四 · apply/status/revert 返回 scope 元 ─────────────
console.log(
  "\n\u56db \u00b7 apply/status/revert \u8fd4 scope \u5143\u6570\u636e",
);

// 用 opts.files=[] 跳真扫 · 仅验返回结构
const apEmpty = lsGate.apply({ files: [] });
ok(
  "apply 含 scope",
  typeof apEmpty.scope === "string",
  `scope=${apEmpty.scope}`,
);
ok(
  "apply 默认 scope=current-user-only",
  apEmpty.scope === "current-user-only",
  `got ${apEmpty.scope}`,
);
ok("apply 含 includeBuiltin", apEmpty.includeBuiltin === false);
ok("apply 含 includeOtherUsers", apEmpty.includeOtherUsers === false);

const stBuiltin = lsGate.status({ files: [], includeBuiltin: true });
ok(
  "status({includeBuiltin:true}) scope=current-user+builtin",
  stBuiltin.scope === "current-user+builtin",
  `got ${stBuiltin.scope}`,
);

const rvAll = lsGate.revert({
  files: [],
  includeBuiltin: true,
  includeOtherUsers: true,
});
ok(
  "revert({both:true}) scope=all-users+builtin",
  rvAll.scope === "all-users+builtin",
  `got ${rvAll.scope}`,
);

const stOther = lsGate.status({ files: [], includeOtherUsers: true });
ok(
  "status({includeOtherUsers:true}) scope=all-users",
  stOther.scope === "all-users",
  `got ${stOther.scope}`,
);

// ───────────── 五 · findCandidates 透传 opts ─────────────
console.log("\n\u4e94 \u00b7 findCandidates(opts) \u900f\u4f20");

// includeBuiltin 透 getBuiltinExtDirs
const builtinsTrue = lsGate.getBuiltinExtDirs({ includeBuiltin: true });
ok(
  "getBuiltinExtDirs({includeBuiltin:true}) 可返非空 (若装路存在)",
  Array.isArray(builtinsTrue),
  `len=${builtinsTrue.length}`,
);

// findCandidates 默认 vs includeBuiltin=true
const cDefault = lsGate.findCandidates();
const cBuiltin = lsGate.findCandidates({ includeBuiltin: true });
ok(
  "findCandidates({includeBuiltin:true}) ≥ default count",
  cBuiltin.length >= cDefault.length,
  `default=${cDefault.length} builtin=${cBuiltin.length}`,
);

// ───────────── 六 · 模块导出完整性 ─────────────
console.log("\n\u516d \u00b7 \u6a21\u5757\u5bfc\u51fa\u5b8c\u6574\u6027");

ok("apply exported", typeof lsGate.apply === "function");
ok("status exported", typeof lsGate.status === "function");
ok("revert exported", typeof lsGate.revert === "function");
ok("findCandidates exported", typeof lsGate.findCandidates === "function");
ok("getExtDirs exported", typeof lsGate.getExtDirs === "function");
ok(
  "getBuiltinExtDirs exported",
  typeof lsGate.getBuiltinExtDirs === "function",
);
ok("_resolveOpts exported (新)", typeof lsGate._resolveOpts === "function");
ok("_scopeMeta exported (新)", typeof lsGate._scopeMeta === "function");
ok("GATE_SIGNATURE 仍在", typeof lsGate.GATE_SIGNATURE === "string");
ok("PATCH_MARKER 仍在", typeof lsGate.PATCH_MARKER === "string");

// ───────────── 七 · package.json 新配存在 ─────────────
console.log("\n\u4e03 \u00b7 package.json \u65b0\u914d\u5b58\u5728\u9a8c");

const pkg = require(path.resolve(__dirname, "..", "package.json"));
const cfg = pkg.contributes && pkg.contributes.configuration;
const props = (cfg && cfg.properties) || {};
ok(
  "dao-agi.lsGate.includeBuiltin 配存在",
  !!props["dao-agi.lsGate.includeBuiltin"],
);
ok(
  "dao-agi.lsGate.includeBuiltin 默认 false",
  props["dao-agi.lsGate.includeBuiltin"] &&
    props["dao-agi.lsGate.includeBuiltin"].default === false,
);
ok(
  "dao-agi.lsGate.includeOtherUsers 配存在",
  !!props["dao-agi.lsGate.includeOtherUsers"],
);
ok(
  "dao-agi.lsGate.includeOtherUsers 默认 false",
  props["dao-agi.lsGate.includeOtherUsers"] &&
    props["dao-agi.lsGate.includeOtherUsers"].default === false,
);
// v17.87.0 起 OK · 17.86.x / 17.87+/18.x 等向后兼容皆可 · 不卡死本测于一版
ok(
  "version 至 17.86+ (17.86.x / 17.87.x / 18.x)",
  /^(17\.(8[6-9]|9\d)|1[89]\.|[2-9]\d)/.test(pkg.version),
  `got ${pkg.version}`,
);

// ───────────── 八 · 141 事故回归点 (auto-guard 永不越界) ─────────────
console.log(
  "\n\u516b \u00b7 141 \u4e8b\u6545\u56de\u5f52\u70b9 (auto-guard \u6c38\u4e0d\u8d8a\u754c)",
);

// 模拟 _autoLsGateGuard 调 status({includeBuiltin:false}) → 不返 builtin 候选
const guardSt = lsGate.status({
  includeBuiltin: false,
  includeOtherUsers: false,
});
ok(
  "auto-guard scope=current-user-only (零全机副作用)",
  guardSt.scope === "current-user-only",
  `got ${guardSt.scope}`,
);
ok(
  "auto-guard 候选无 builtin",
  !guardSt.files.some((f) =>
    /resources[\\/]+app[\\/]+extensions/.test(f.file || ""),
  ),
  `${guardSt.files.length} files scanned`,
);

// 即使 env DAO_LSGATE_INCLUDE_BUILTIN=1 误启 · auto-guard 显式 false 优先
process.env.DAO_LSGATE_INCLUDE_BUILTIN = "1";
const guardStEnv = lsGate.status({
  includeBuiltin: false, // 显式 false
  includeOtherUsers: false,
});
ok(
  "auto-guard 即使 env 误启, opts.includeBuiltin=false 仍 win",
  guardStEnv.scope === "current-user-only",
  `got ${guardStEnv.scope}`,
);
delete process.env.DAO_LSGATE_INCLUDE_BUILTIN;

// ───────────── 总结 ─────────────
console.log(
  `\n\u2550\u2550\u2550 \u603b: ${pass} \u00b7 \u4f1a: ${fail} \u00b7 \u8d8a\u754c\u5305: ${pass + fail} \u2550\u2550\u2550`,
);
console.log(
  fail === 0
    ? "  \u9053\u5e76\u884c\u800c\u4e0d\u76f8\u6096 \u00b7 \u9e21\u72ac\u76f8\u95fb \u6c11\u81f3\u8001\u6b7b\u4e0d\u76f8\u5f80\u6765"
    : "  \u00d7 \u6709\u4f1a\u9879 \u00b7 \u671b\u67e5",
);
process.exit(fail === 0 ? 0 : 1);
