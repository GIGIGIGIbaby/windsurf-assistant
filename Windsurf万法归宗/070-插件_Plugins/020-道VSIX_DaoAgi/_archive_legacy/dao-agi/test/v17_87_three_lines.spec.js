// v17.87 · 三道防线归本源 · 圣人之道为而不争 · 反者道之动
//
// 测点:
//   L1 · 默 passthrough (首装无副作用)
//     一. package.json dao.origin.defaultMode default = "passthrough"
//     二. extension.js autoRestoreOrigin 第一次 saved 默 cfg().defaultMode (非硬编 invert)
//     三. version 17.87.0
//
//   L2 · 死锚自愈 (activate 早期检 + 异步 anchorRestore)
//     四. extension.js 含 _detectAndHealDeadAnchor 函数
//     五. 函数内含 isPortListening + anchorRestore 调用
//     六. activate 早期 (在 loadWamCore 之前) 调 _detectAndHealDeadAnchor
//
//   L3 · deactivate 同步 sentinel _cleanSettingsJson 物理兜底
//     七. deactivate 调 _uninstallSentinel._cleanSettingsJson
//     八. _cleanSettingsJson 处理 codeium.{api,inference}ApiServerUrl 二锁
//     九. _uninstallSentinel 模块导出 _cleanSettingsJson
//
//   联调:
//     十. _isStaleStateFile 仍守 (v17.86.4 不退)
//     十一. node -c extension.js / _uninstall_sentinel.js 语法

"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PKG = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
);
const EXT = fs.readFileSync(path.join(ROOT, "extension.js"), "utf8");
const SENT = fs.readFileSync(path.join(ROOT, "_uninstall_sentinel.js"), "utf8");

let pass = 0;
let fail = 0;
const ok = (label, cond, detail) => {
  const s = cond ? "\u2713" : "\u2717";
  if (cond) pass++;
  else fail++;
  console.log(`  ${s} ${label.padEnd(60)} ${detail || ""}`);
};

console.log(
  "\u2550\u2550\u2550 v17.87 \u00b7 \u4e09\u9053\u9632\u7ebf\u5f52\u672c\u6e90 \u00b7 \u9053\u6cd5\u81ea\u7136 \u2550\u2550\u2550",
);

// ─── L1 · 默 passthrough · 首装无副作用 ───
console.log(
  "\n\u4e00 \u00b7 L1 \u9ed8 passthrough \u00b7 \u9996\u88c5\u65e0\u526f\u4f5c\u7528",
);

ok(
  "L1.1 package.json version >= 17.87.2 (v17.88+/v18+ 兼)",
  /^(17\.(8[7-9]|9\d|\d{3,})\.|1[89]\.|[2-9]\d\.)/.test(PKG.version),
  `got=${PKG.version}`,
);

ok(
  "L1.2 dao.origin.defaultMode default = passthrough",
  PKG.contributes.configuration.properties["dao.origin.defaultMode"].default ===
    "passthrough",
  `got=${PKG.contributes.configuration.properties["dao.origin.defaultMode"].default}`,
);

// 描述应含 v17.87 关键信息 (兼容 17.87.x)
const dm = PKG.contributes.configuration.properties["dao.origin.defaultMode"];
ok(
  "L1.3 dao.origin.defaultMode description 含 v17.87",
  /v17\.87/.test(dm.description),
);
ok(
  "L1.4 description 含 \u9996\u88c5\u65e0\u526f\u4f5c\u7528 / \u4e0d\u4e89",
  /\u9996\u88c5\u65e0\u526f\u4f5c\u7528|\u4e0d\u4e89/.test(dm.description),
);

// extension.js autoRestoreOrigin 应读 cfg().defaultMode (非硬编 invert)
ok(
  "L1.5 autoRestoreOrigin saved \u9ed8 \u8bfb cfg().defaultMode",
  /saved\s*=\s*cfg\(\)\.defaultMode/.test(EXT),
);
ok(
  "L1.6 autoRestoreOrigin 含 v17.87 / \u53cd\u8005\u9053\u4e4b\u52a8 \u6807\u8bb0",
  /v17\.87.*\u53cd\u8005\u9053\u4e4b\u52a8|\u9996\u88c5\u9ed8\s*cfg/.test(EXT),
);

// description 含三/四/五道防线关键 (v17.87.2 升至五道 · v18.1+ 描述转为"九层直连验")
ok(
  "L1.7 description 含 三|四|五道防线 或 九层直连 (v18.1+)",
  /三道防线|四道防线|五道防线|九层直连|九层[一-鿿]{0,2}验/.test(
    PKG.description,
  ),
);

// ─── L2 · 死锚自愈 ───
console.log(
  "\n\u4e8c \u00b7 L2 \u6b7b\u951a\u81ea\u6108 \u00b7 activate \u65e9\u671f\u68c0",
);

ok(
  "L2.1 _detectAndHealDeadAnchor 函数定义存在",
  /function\s+_detectAndHealDeadAnchor\s*\(/.test(EXT),
);

ok(
  "L2.2 函数内调 isPortListening (\u63a2 N \u662f\u5426\u76d1\u542c)",
  /_detectAndHealDeadAnchor[\s\S]{0,3000}isPortListening/.test(EXT),
);

ok(
  "L2.3 函数内异步 anchorRestore() (\u516d\u5c42\u5f52\u4e91)",
  /_detectAndHealDeadAnchor[\s\S]{0,3000}anchorRestore\(\)/.test(EXT),
);

ok(
  "L2.4 \u68c0 codeium.apiServerUrl + codeium.inferenceApiServerUrl \u4e8c\u9501",
  /codeium\.apiServerUrl[\s\S]{0,200}codeium\.inferenceApiServerUrl/.test(EXT),
);

ok(
  "L2.5 IS_WIN \u5206\u8def · settings.json \u8de8\u5e73\u53f0",
  /_detectAndHealDeadAnchor[\s\S]{0,2000}IS_WIN/.test(EXT),
);

// activate 早期调 _detectAndHealDeadAnchor (在 loadWamCore 之前)
const idxDetect = EXT.indexOf("_detectAndHealDeadAnchor()");
const idxLoadWam = EXT.indexOf("loadWamCore(ctx)");
ok(
  "L2.6 activate \u8c03 _detectAndHealDeadAnchor \u4e8e loadWamCore \u4e4b\u524d",
  idxDetect > 0 && idxLoadWam > idxDetect,
  `detect@${idxDetect} loadWam@${idxLoadWam}`,
);

ok(
  "L2.7 activate \u4e2d\u542b L2 \u6b7b\u951a\u81ea\u6108 \u6ce8\u91ca",
  /L2 \u6b7b\u951a\u81ea\u6108|L2 \u00b7 \u6b7b\u951a/.test(EXT),
);

// 正则验 127.0.0.1:N 匹配
ok(
  "L2.8 \u63d0\u53d6 127\\.0\\.0\\.1:(\\d+) port \u6b63\u5219",
  /\/\^https\?:\\\/\\\/127\\\.0\\\.0\\\.1:\(\\d\+\)/.test(EXT) ||
    /127\\\.0\\\.0\\\.1:\(\\d\+\)/.test(EXT),
);

// ─── L3 · deactivate 同步 sentinel 物理兜底 ───
console.log(
  "\n\u4e09 \u00b7 L3 deactivate \u540c\u6b65 sentinel \u7269\u7406\u517c\u5e95",
);

// v18.1.1 · L3.1 改: 兼容 _uninstallSentinel._cleanSettingsJson (v17.87) 与
// 内联 codeium.apiServerUrl/inferenceApiServerUrl 直清 (v18.1.1 · 损 _uninstallSentinel 之引)
ok(
  "L3.1 deactivate \u8c03 settings codeium \u9530\u6e05 (sentinel \u6216\u5185\u8054)",
  /deactivate[\s\S]{0,3000}_uninstallSentinel\._cleanSettingsJson/.test(EXT) ||
    /deactivate[\s\S]{0,4000}codeium\.apiServerUrl[\s\S]{0,1500}delete\s+obj\[/.test(
      EXT,
    ),
);

ok(
  "L3.2 deactivate \u4e2d\u542b L3 \u7269\u7406\u515c\u5e95 \u6ce8\u91ca",
  /L3 \u7269\u7406\u515c\u5e95|L3 \u00b7 \u7269\u7406|L3 \u515c\u5e95/.test(
    EXT,
  ),
);

ok(
  "L3.3 _cleanSettingsJson \u6e05 codeium.apiServerUrl",
  /targetKeys\s*=\s*\[\s*"codeium\.inferenceApiServerUrl"\s*,\s*"codeium\.apiServerUrl"\s*\]|targetKeys\s*=\s*\[\s*"codeium\.apiServerUrl"/.test(
    SENT,
  ),
);

// _uninstall_sentinel exports
const sentinel = require(path.join(ROOT, "_uninstall_sentinel.js"));
ok(
  "L3.4 _uninstall_sentinel \u5bfc\u51fa _cleanSettingsJson",
  typeof sentinel._cleanSettingsJson === "function",
);
ok(
  "L3.5 _uninstall_sentinel \u5bfc\u51fa _cleanStateVscdb",
  typeof sentinel._cleanStateVscdb === "function",
);
ok(
  "L3.6 _uninstall_sentinel \u5bfc\u51fa _killProxy",
  typeof sentinel._killProxy === "function",
);
ok(
  "L3.7 _uninstall_sentinel \u5bfc\u51fa runCleanup",
  typeof sentinel.runCleanup === "function",
);

// _cleanSettingsJson 实测 (不破真 settings.json · 用 tmp)
console.log(
  "\n\u4e09b \u00b7 _cleanSettingsJson \u5b9e\u6d4b (tmp settings.json)",
);

const os = require("os");
const tmpDir = path.join(os.tmpdir(), `dao-test-v17_87-${Date.now()}`);
fs.mkdirSync(tmpDir, { recursive: true });

try {
  // 写 tmp settings.json with anchored keys
  const tmpStg = path.join(tmpDir, "settings.json");
  const orig = {
    "editor.fontSize": 14,
    "codeium.apiServerUrl": "http://127.0.0.1:8889",
    "codeium.inferenceApiServerUrl": "http://127.0.0.1:8889",
    "other.key": "preserve me",
  };
  fs.writeFileSync(tmpStg, JSON.stringify(orig, null, 2), "utf8");

  const r = sentinel._cleanSettingsJson(
    [tmpStg],
    () => {}, // silent log
  );
  ok(
    "L3.8 _cleanSettingsJson \u8fd4 cleaned=1",
    r.cleaned === 1,
    `got cleaned=${r.cleaned}`,
  );

  const after = JSON.parse(fs.readFileSync(tmpStg, "utf8"));
  ok(
    "L3.9 \u6e05\u540e\u4e0d\u5b58 codeium.apiServerUrl",
    !("codeium.apiServerUrl" in after),
  );
  ok(
    "L3.10 \u6e05\u540e\u4e0d\u5b58 codeium.inferenceApiServerUrl",
    !("codeium.inferenceApiServerUrl" in after),
  );
  ok(
    "L3.11 \u4ed6\u952e \u4fdd\u7559 (other.key)",
    after["other.key"] === "preserve me",
  );
  ok("L3.12 editor.fontSize 保留", after["editor.fontSize"] === 14);
} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

// ─── L4 · 默禁 autoUpdate (v17.87.1 · 圣人之道为而不争) ───
console.log(
  "\n\u56db \u00b7 L4 \u9ed8\u7981 autoUpdate \u00b7 \u4e0d\u590d\u6d3b\u8001 vendor",
);

const auCfg =
  PKG.contributes.configuration.properties["wam.autoUpdate.enabled"];
ok(
  "L4.1 wam.autoUpdate.enabled default = false",
  auCfg.default === false,
  `got=${auCfg.default}`,
);
ok(
  "L4.2 wam.autoUpdate.enabled \u542b v17.87 \u63cf\u8ff0",
  /v17\.87/.test(auCfg.description || ""),
);
ok(
  "L4.3 wam.autoUpdate.enabled \u542b L4 \u6216 \u4e0d\u4e89 \u6807\u8bb0",
  /L4|\u4e0d\u4e89|\u4e0d\u593a/.test(auCfg.description || ""),
);
ok(
  "L4.4 description 含 四|五道防线 或 九层直连 (v18.1+)",
  /四道防线|五道防线|九层直连|九层[一-鿿]{0,2}验/.test(PKG.description),
);
ok(
  "L4.5 wam.autoUpdate.enabled \u914d\u7f6e\u4ed8\u9519 default=false (v17.88 \u63a5)",
  PKG.contributes.configuration.properties["wam.autoUpdate.enabled"].default ===
    false,
  `got=${PKG.contributes.configuration.properties["wam.autoUpdate.enabled"].default}`,
);

// ─── 联调 · 守 v17.86.4 + node -c ───
console.log(
  "\n\u4e94 \u00b7 \u8054\u8c03 \u00b7 \u5b88 v17.86.4 + \u8bed\u6cd5\u6821",
);

ok(
  "C.1 _isStaleStateFile (v17.86.4 \u4e0d\u9000)",
  /_isStaleStateFile/.test(EXT),
);
ok(
  "C.2 stale \u81ea\u6e05 (vendor + hot \u53cc\u626b)",
  /vendorDir\(\)\s*,\s*hotDir\(\)/.test(EXT) ||
    /\[vendorDir\(\),\s*hotDir\(\)\]/.test(EXT),
);

// node syntax check via require
let syntaxOk = true;
try {
  // Cannot truly require extension.js (depends on vscode), but can parse
  // Only sentinel is fully requireable (already done above)
  // Using new Function to parse extension.js (won't execute but checks syntax)
  // — Note: VS Code 'require' calls will throw if executed
  new Function(EXT);
  syntaxOk = true;
} catch (e) {
  syntaxOk = false;
  console.log(`  parse err: ${e.message}`);
}
ok("C.3 extension.js 语法 (new Function 解析)", syntaxOk);

// sentinel was successfully required above
ok("C.4 _uninstall_sentinel.js 可 require", typeof sentinel === "object");

console.log(`\n=== \u603b: PASS=${pass} FAIL=${fail} ===`);
if (fail > 0) process.exit(1);
