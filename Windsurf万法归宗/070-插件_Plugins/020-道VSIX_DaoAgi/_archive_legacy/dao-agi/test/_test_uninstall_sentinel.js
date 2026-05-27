// _test_uninstall_sentinel.js — v17.85 sentinel 集成验
// ═════════════════════════════════════════════════════════════════════
// 沙箱测两路径:
//   一. reload 路径: EXT_DIR/package.json 仍在 → action=reload, 一切未动
//   二. uninstall 路径: EXT_DIR/package.json 已删 → 五事毕
// 沙箱在 os.tmpdir() · 不动用户真实环境 · 不 kill 真 proxy
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sentinel = require("../_uninstall_sentinel");

let _passed = 0;
let _failed = 0;
function assert(ok, label, detail) {
  if (ok) {
    console.log(`  ✓ ${label}`);
    _passed++;
  } else {
    console.log(`  ✗ ${label} · ${detail || ""}`);
    _failed++;
  }
}

function _setupSandbox(name) {
  const root = path.join(
    os.tmpdir(),
    `dao-test-${name}-${Date.now()}-${process.pid}`,
  );
  fs.mkdirSync(root, { recursive: true });
  // 假 EXT_DIR
  const extDir = path.join(root, "ext-fake");
  fs.mkdirSync(extDir, { recursive: true });
  fs.writeFileSync(
    path.join(extDir, "package.json"),
    JSON.stringify({ name: "fake-dao-agi", version: "17.85.0" }, null, 2),
  );
  // 假 wam-hot
  const wamHot = path.join(root, "wam-hot-fake");
  fs.mkdirSync(wamHot, { recursive: true });
  fs.writeFileSync(path.join(wamHot, "_dummy_lockfile.json"), "{}");
  fs.writeFileSync(path.join(wamHot, "wam.log"), "fake log\n");
  fs.mkdirSync(path.join(wamHot, "origin"), { recursive: true });
  fs.writeFileSync(path.join(wamHot, "origin", "fake_proxy.js"), "// fake");
  // 假 settings.json (含 codeium 锚)
  const settingsDir = path.join(root, "settings-fake");
  fs.mkdirSync(settingsDir, { recursive: true });
  const settingsPath = path.join(settingsDir, "settings.json");
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        "editor.fontSize": 14,
        "codeium.apiServerUrl": "http://127.0.0.1:8889",
        "codeium.inferenceApiServerUrl": "http://127.0.0.1:8889",
        "other.setting": true,
      },
      null,
      2,
    ),
  );
  // 假 lsGate target + bak
  const lsGateDir = path.join(root, "lsgate-fake");
  fs.mkdirSync(lsGateDir, { recursive: true });
  const targetFile = path.join(lsGateDir, "extension.js");
  const bakFile = targetFile + ".bak.pre_dao_v17_68";
  fs.writeFileSync(targetFile, "/*dao:v17.68*/PATCHED VERSION OF EXT_JS");
  fs.writeFileSync(bakFile, "ORIGINAL UNPATCHED EXT_JS CONTENT");
  // 假 sentinel selfPath (仅探索, 不真删)
  const selfPath = path.join(wamHot, "_uninstall_sentinel.js");
  fs.writeFileSync(selfPath, "// fake sentinel copy");
  return {
    root,
    extDir,
    wamHot,
    settingsPath,
    targetFile,
    bakFile,
    selfPath,
  };
}

function _cleanupSandbox(root) {
  try {
    if (typeof fs.rmSync === "function") {
      fs.rmSync(root, { recursive: true, force: true });
    } else {
      fs.rmdirSync(root, { recursive: true });
    }
  } catch {}
}

// ─── 测一: reload 路径 (package.json 仍在) ──────────────────────────
function test_reload_path() {
  console.log("[test 1] reload 路径 · EXT_DIR/package.json 仍在");
  const sb = _setupSandbox("reload");
  try {
    const result = sentinel.runCleanup({
      extDir: sb.extDir,
      wamHot: sb.wamHot,
      baks: [{ file: sb.targetFile, bak: sb.bakFile }],
      settings: [sb.settingsPath],
      proxyPid: 0,
      ownerName: "test",
      selfPath: sb.selfPath,
      forceUninstall: false,
      skipWamHot: false,
    });
    assert(result.action === "reload", "action=reload", `got ${result.action}`);
    assert(
      fs.existsSync(sb.targetFile),
      "target ext.js 仍在 (未还原)",
      `should be untouched`,
    );
    // 验未动: 内容仍是 patched
    const c = fs.readFileSync(sb.targetFile, "utf8");
    assert(
      c.indexOf("/*dao:v17.68*/") >= 0,
      "target ext.js 仍是 patched (未动)",
      "should still be patched",
    );
    // settings.json 仍含 codeium 锚
    const s = JSON.parse(fs.readFileSync(sb.settingsPath, "utf8"));
    assert(
      typeof s["codeium.apiServerUrl"] === "string",
      "settings codeium 锚仍在 (未清)",
      "should still have anchor",
    );
    // wam-hot 仍在
    assert(
      fs.existsSync(sb.wamHot),
      "wam-hot 仍在 (未删)",
      "should still exist",
    );
    // sentinel selfPath 已删 (reload 路径下兜底自删)
    assert(
      !fs.existsSync(sb.selfPath),
      "sentinel self 已删 (reload 兜底)",
      "self should be cleaned",
    );
  } finally {
    _cleanupSandbox(sb.root);
  }
}

// ─── 测二: uninstall 路径 (package.json 已删) ───────────────────────
function test_uninstall_path() {
  console.log("\n[test 2] uninstall 路径 · EXT_DIR/package.json 已删");
  const sb = _setupSandbox("uninstall");
  try {
    // 真删 package.json (模拟 vscode 卸载已删扩展目录)
    fs.rmSync(sb.extDir, { recursive: true, force: true });
    const result = sentinel.runCleanup({
      extDir: sb.extDir,
      wamHot: sb.wamHot,
      baks: [{ file: sb.targetFile, bak: sb.bakFile }],
      settings: [sb.settingsPath],
      proxyPid: 0,
      ownerName: "test",
      selfPath: sb.selfPath,
      forceUninstall: false,
      skipWamHot: false,
    });
    assert(
      result.action === "uninstall",
      "action=uninstall",
      `got ${result.action}`,
    );
    // 一. lsGate 还原
    assert(
      result.lsGate.reverted === 1,
      "lsGate reverted=1",
      `got ${result.lsGate.reverted}`,
    );
    const c = fs.readFileSync(sb.targetFile, "utf8");
    assert(
      c === "ORIGINAL UNPATCHED EXT_JS CONTENT",
      "target ext.js 已还原 (内容 == bak)",
      `got ${c.slice(0, 50)}`,
    );
    // 二. settings 清
    assert(
      result.settings.cleaned === 1,
      "settings cleaned=1",
      `got ${result.settings.cleaned}`,
    );
    const s = JSON.parse(fs.readFileSync(sb.settingsPath, "utf8"));
    assert(
      !("codeium.apiServerUrl" in s),
      "settings codeium.apiServerUrl 已清",
      "should be removed",
    );
    assert(
      !("codeium.inferenceApiServerUrl" in s),
      "settings codeium.inferenceApiServerUrl 已清",
      "should be removed",
    );
    assert(
      s["editor.fontSize"] === 14,
      "settings 其他键保留 (editor.fontSize=14)",
      `got ${s["editor.fontSize"]}`,
    );
    assert(
      s["other.setting"] === true,
      "settings 其他键保留 (other.setting=true)",
      `got ${s["other.setting"]}`,
    );
    // 四. wam-hot 清
    assert(
      result.wamHot.removed === true,
      "wam-hot removed=true",
      `reason ${result.wamHot.reason}`,
    );
    assert(
      !fs.existsSync(sb.wamHot),
      "wam-hot 整目录已删",
      "should not exist",
    );
  } finally {
    _cleanupSandbox(sb.root);
  }
}

// ─── 测三: BOM + 空 codeium 锚的 settings (容忍验) ──────────────────
function test_settings_bom_and_no_anchor() {
  console.log("\n[test 3] settings 容忍 · BOM + 无 codeium 锚");
  const sb = _setupSandbox("settings-bom");
  try {
    // 重写 settings.json 加 BOM + 不含 codeium 锚
    fs.writeFileSync(
      sb.settingsPath,
      "\ufeff" +
        JSON.stringify({ "editor.fontSize": 16, "no.codeium": true }, null, 2),
      "utf8",
    );
    fs.rmSync(sb.extDir, { recursive: true, force: true });
    const result = sentinel.runCleanup({
      extDir: sb.extDir,
      wamHot: sb.wamHot,
      baks: [],
      settings: [sb.settingsPath],
      proxyPid: 0,
      ownerName: "test",
      selfPath: sb.selfPath,
      forceUninstall: false,
      skipWamHot: true, // 留 wam-hot 让自删 sentinel
    });
    assert(
      result.action === "uninstall",
      "action=uninstall (无 codeium 锚也走 cleanup)",
      `got ${result.action}`,
    );
    assert(
      result.settings.cleaned === 0,
      "settings cleaned=0 (无锚可清)",
      `got ${result.settings.cleaned}`,
    );
    assert(
      result.settings.skipped === 1,
      "settings skipped=1 (无锚跳)",
      `got ${result.settings.skipped}`,
    );
    // 验 BOM 仍在 (未动)
    const raw = fs.readFileSync(sb.settingsPath, "utf8");
    assert(
      raw.charCodeAt(0) === 0xfeff,
      "settings BOM 保留 (未动文件)",
      "BOM should remain",
    );
  } finally {
    _cleanupSandbox(sb.root);
  }
}

// ─── 测四: forceUninstall 跳探察 ────────────────────────────────────
function test_force_uninstall() {
  console.log("\n[test 4] forceUninstall=true 跳探察 · 即使 EXT_DIR 在");
  const sb = _setupSandbox("force");
  try {
    // EXT_DIR/package.json 仍在, 但 forceUninstall=true 应走 uninstall 路径
    const result = sentinel.runCleanup({
      extDir: sb.extDir,
      wamHot: sb.wamHot,
      baks: [{ file: sb.targetFile, bak: sb.bakFile }],
      settings: [sb.settingsPath],
      proxyPid: 0,
      ownerName: "test",
      selfPath: sb.selfPath,
      forceUninstall: true,
      skipWamHot: false,
    });
    assert(
      result.action === "uninstall",
      "action=uninstall (force 跳探察)",
      `got ${result.action}`,
    );
    assert(
      result.lsGate.reverted === 1,
      "lsGate reverted=1 (force 路径仍清扫)",
      `got ${result.lsGate.reverted}`,
    );
  } finally {
    _cleanupSandbox(sb.root);
  }
}

// ─── 测五: bak 缺失时 lsGate 跳过 (不破坏) ──────────────────────────
function test_lsgate_no_bak() {
  console.log("\n[test 5] lsGate · bak 不存在时跳过 (不破坏 target)");
  const sb = _setupSandbox("nobak");
  try {
    fs.rmSync(sb.bakFile);
    fs.rmSync(sb.extDir, { recursive: true, force: true });
    const result = sentinel.runCleanup({
      extDir: sb.extDir,
      wamHot: sb.wamHot,
      baks: [{ file: sb.targetFile, bak: sb.bakFile }],
      settings: [sb.settingsPath],
      proxyPid: 0,
      ownerName: "test",
      selfPath: sb.selfPath,
      forceUninstall: false,
      skipWamHot: false,
    });
    assert(
      result.lsGate.reverted === 0,
      "lsGate reverted=0 (bak 缺)",
      `got ${result.lsGate.reverted}`,
    );
    assert(
      result.lsGate.skipped === 1,
      "lsGate skipped=1 (bak 缺正确跳)",
      `got ${result.lsGate.skipped}`,
    );
    // 验 target 未动 (仍是 patched)
    const c = fs.readFileSync(sb.targetFile, "utf8");
    assert(
      c.indexOf("/*dao:v17.68*/") >= 0,
      "target 未动 (bak 缺时不破坏)",
      `got ${c.slice(0, 50)}`,
    );
  } finally {
    _cleanupSandbox(sb.root);
  }
}

// ─── 主 ──────────────────────────────────────────────────────────────
console.log("═══ v17.85 卸载即归无 sentinel 集成验 ═══\n");
test_reload_path();
test_uninstall_path();
test_settings_bom_and_no_anchor();
test_force_uninstall();
test_lsgate_no_bak();

console.log(`\n═══ 验毕: ${_passed} pass / ${_failed} fail ═══`);
process.exit(_failed > 0 ? 2 : 0);
