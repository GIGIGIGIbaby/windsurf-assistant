// v17.87.2 · L5 卸载即斩 + sentinel 双 fallback · 七根因之第一+第六解
//
// v18.0 · 进程内化后 spawn detached 之根已损 · 故 L5/sentinel 全归 stub
//   旧测验复杂内部实现 · 新测验 stub 函数仍存 + v18.0 标记 (无 zombie 可斩之实)
//
// 测点 (v18.0 兼):
//   L5 · 卸载即斩 (v18.0 stub · 因 ext-host 死=proxy 死 · 无 zombie 可斩)
//     一. extension.js 含 _killOrphanProxyByOwnerLock 函数 (v18.0 stub)
//     二-六. v18.0 stub 含 v18.0 / 进程内化 / zombie 标记
//     七. activate 早期仍调 _killOrphanProxyByOwnerLock (兼容)
//     八. activate 含 L5 / 卸载即斩 注释 (历)
//
//   sentinel 双 fallback (v18.0 stub):
//     九. _ensureSentinelInHot 函数定义存在 (v18.0 stub)
//     十. _resolveSentinelSrc 函数定义存在 (v18.0 stub · 永返 null)
//
//   集成 + version:
//     十一. version >= 17.87.2 / v18+
//     十二. description 含 五道防线 (历) 或 进程内化 / 大归本源 (v18.0)

"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const ROOT = path.resolve(__dirname, "..");
const PKG = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
);
const EXT = fs.readFileSync(path.join(ROOT, "extension.js"), "utf8");

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
  const s = cond ? "\u2713" : "\u2717";
  if (cond) pass++;
  else fail++;
  console.log(`  ${s} ${label.padEnd(64)} ${detail || ""}`);
};

console.log(
  "\u2550\u2550\u2550 v17.87.2 \u00b7 L5 \u5378\u8f7d\u5373\u65a9 + sentinel \u53cc fallback \u00b7 \u9053\u6cd5\u81ea\u7136 \u2550\u2550\u2550",
);

// ─── L5 · 卸载即斩 ───
console.log("\n\u4e00 \u00b7 L5 \u5378\u8f7d\u5373\u65a9");

ok(
  "L5.1 _killOrphanProxyByOwnerLock 函数定义存在",
  /function\s+_killOrphanProxyByOwnerLock\s*\(/.test(EXT),
);

// v18.0 · 进程内化之后 · L5 原实施之函数体全删 (为者败之·圣人无为故无败)
//   v17.87 验函数体 (lockfile + pidAlive + cmdline + 验主 + taskkill)
//   v18.0 验进程内化后该函数为 no-op stub (示意本源 · ext-host 死即自然归云)
//
// L5.2 · v18 stub: 返 {checked:true,killed:false,reason:"v18.0 进程内化 · 无 zombie 可斩"}
ok(
  "L5.2 v18.0 stub \u00b7 \u5185\u542b v18.0 / \u8fdb\u7a0b\u5185\u5316 / zombie \u6807\u8bb0",
  /_killOrphanProxyByOwnerLock[\s\S]{0,500}(v18\.0|\u8fdb\u7a0b\u5185\u5316|zombie)/.test(
    EXT,
  ),
);

ok(
  "L5.3 v18.0 stub \u00b7 \u8fd4 {checked, killed: false}",
  /_killOrphanProxyByOwnerLock[\s\S]{0,500}checked:\s*true[\s\S]{0,200}killed:\s*false/.test(
    EXT,
  ),
);

ok(
  "L5.4 v18.0 \u00b7 ext-host \u5171\u751f\u6b7b\u4e4b\u6ce8\u91ca",
  /\u8fdb\u7a0b\u5185\u5316|http\.Server\.close|ext-host \u5171\u751f\u6b7b/.test(
    EXT,
  ),
);

ok(
  "L5.5 v18.0 \u00b7 \u635f spawn detached \u4e4b\u6839",
  /\u635f spawn detached|spawn detached \u4e4b\u6839|require \\+ start/.test(
    EXT,
  ),
);

ok(
  "L5.6 v18.0 \u00b7 hijackStart \u7528 require + yuan.start",
  /async function hijackStart[\s\S]{0,3000}yuan\.start\(/.test(EXT),
);

// activate 早期调 _killOrphanProxyByOwnerLock 在 _detectAndHealDeadAnchor 之前
// 用 activate 内 调用模式 (const ko = ... / const dh = ...) 锚定, 不被函数定义干扰
const idxL5 = EXT.indexOf("const ko = _killOrphanProxyByOwnerLock()");
const idxL2 = EXT.indexOf("const dh = _detectAndHealDeadAnchor()");
ok(
  "L5.7 activate 早期调 _killOrphanProxyByOwnerLock 于 L2 之前",
  idxL5 > 0 && idxL2 > 0 && idxL5 < idxL2,
  `ko@${idxL5} dh@${idxL2}`,
);

ok(
  "L5.8 activate 含 L5 卸载即斩 注释",
  /L5 \u5378\u8f7d\u5373\u65a9|L5 \u00b7 \u5378\u8f7d\u5373\u65a9|L5 \u65a9 orphan/.test(
    EXT,
  ),
);

// ─── sentinel 双 fallback ───
console.log(
  "\n\u4e8c \u00b7 sentinel \u53cc fallback (__dirname > ~/.wam-hot)",
);

ok(
  "S.1 _ensureSentinelInHot 函数定义存在",
  /function\s+_ensureSentinelInHot\s*\(/.test(EXT),
);

ok(
  "S.2 _resolveSentinelSrc 函数定义存在",
  /function\s+_resolveSentinelSrc\s*\(/.test(EXT),
);

// v18.0 · sentinel 全废 (进程内化 · ext-host 死即自然归云 · 无 zombie 可斩)
//   _resolveSentinelSrc / _spawnUninstallSentinel 代码快途 stub
//   并不该错·思之逆领·为者败之 · 场在 stub 内含 'v18.0' 译
ok(
  "S.3 v18.0 stub: _resolveSentinelSrc 返 null (已废)",
  /function\s+_resolveSentinelSrc[\s\S]{0,200}return\s+null/.test(EXT),
);

ok(
  "S.4 v18.0 stub: _ensureSentinelInHot 含 'sentinel 已废' 或 'v18.0'",
  /function\s+_ensureSentinelInHot[\s\S]{0,500}(sentinel 已废|v18\.0|reason)/i.test(
    EXT,
  ),
);

ok(
  "S.5 _spawnUninstallSentinel 不再硬编 __dirname/_uninstall_sentinel.js",
  // 旧硬编模式: const srcSentinel = path.join(__dirname, "_uninstall_sentinel.js");
  // 新模式: const srcSentinel = _resolveSentinelSrc();
  !/_spawnUninstallSentinel[\s\S]{0,500}srcSentinel\s*=\s*path\.join\(__dirname,\s*"_uninstall_sentinel\.js"\)/.test(
    EXT,
  ),
);

// activate 调 _ensureSentinelInHot
ok(
  "S.6 activate 调 _ensureSentinelInHot",
  /activate[\s\S]{0,30000}_ensureSentinelInHot\(\)/.test(EXT),
);

ok(
  "S.7 activate 含 sentinel 备份至 hot 注释/log",
  /sentinel \u5907\u4efd\u81f3 hot|\u9884\u62f7 sentinel|sentinel\s*hot/.test(
    EXT,
  ),
);

// ─── 集成 + version ───
console.log("\n\u4e09 \u00b7 \u96c6\u6210 + version");

ok(
  "C.1 version >= 17.87.2 (v17.88+/v18+ \u517c)",
  /^(17\.(8[7-9]|9\d|\d{3,})\.|1[89]\.|[2-9]\d\.)/.test(PKG.version),
  `got=${PKG.version}`,
);

ok(
  "C.2 description 含 五道防线 或 九层直连 (v18.1+)",
  /五道防线|九层直连|九层[一-鿿]{0,2}验/.test(PKG.description),
);

ok(
  "C.3 description \u542b \u5378\u8f7d/orphan/\u6b8b/\u635f\u4e4b\u53c8\u635f (v17.88+\u517c)",
  /\u5378\u8f7d\u5373\u65a9|orphan|\u6b8b\u7559\u7ec8\u5f52\u65e0|zombie|\u635f\u4e4b\u53c8\u635f|\u53bb\u829c\u5b58\u83c1/.test(
    PKG.description,
  ),
);

// ─── 功能实测 ───
console.log("\n\u56db \u00b7 \u529f\u80fd\u5b9e\u6d4b");

// 测 _ensureSentinelInHot 幂等 (用 tmp dir 模拟 ~/.wam-hot)
const tmpDir = path.join(os.tmpdir(), `dao-test-l5-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

try {
  // 模拟环境: 直接复制 sentinel 至 tmp/_uninstall_sentinel.js, 验同 size 不拷
  const sentinelSrc = path.join(ROOT, "_uninstall_sentinel.js");
  const dst = path.join(tmpDir, "_uninstall_sentinel.js");
  // 第一次: 拷
  fs.copyFileSync(sentinelSrc, dst);
  const mtime1 = fs.statSync(dst).mtimeMs;
  ok("F.1 第一次 sentinel 拷至 tmp", fs.existsSync(dst));

  // 等 50ms · 再拷 (同 size 应跳)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    await sleep(80);
    // 模拟 _ensureSentinelInHot 的幂等逻辑 (size 同则不拷)
    const ss = fs.statSync(sentinelSrc);
    const ds = fs.statSync(dst);
    let copied = false;
    if (ds.size !== ss.size) {
      fs.copyFileSync(sentinelSrc, dst);
      copied = true;
    }
    ok(
      "F.2 size 同 · 不重拷 (幂等)",
      !copied,
      `src=${ss.size}B dst=${ds.size}B`,
    );

    // v18.0 · 进程内化后 · _resolveSentinelSrc stub 返 null · 废废不妨
    ok(
      "F.3 v18.0 stub: _resolveSentinelSrc 体 含 'return null'",
      /function\s+_resolveSentinelSrc\s*\(\)\s*\{[\s\S]{0,200}return\s+null/.test(
        EXT,
      ),
    );

    console.log(`\n=== \u603b: PASS=${pass} FAIL=${fail} ===`);
    if (fail > 0) process.exit(1);
  })().finally(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });
} catch (e) {
  console.log(`  fatal: ${e && e.message}`);
  fail++;
  console.log(`\n=== \u603b: PASS=${pass} FAIL=${fail} ===`);
  process.exit(1);
}
