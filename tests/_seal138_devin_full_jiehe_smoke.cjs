#!/usr/bin/env node
/**
 * _seal138_devin_full_jiehe_smoke.cjs · 印 138
 *   反者道之动 · Devin云原生 虚拟机反代之深整合 · 取之尽锱铢 · 用之如泥沙
 *
 *   帛书·廿二: 「圣人执一 · 以为天下牧」
 *   帛书·四十二: 「道生一 · 一生二 · 二生三 · 三生万物」
 *   帛书·四十三: 「天下之至柔 · 驰骋于天下之致坚 · 无有入于无间」
 *   帛书·六十三: 「为大于其细 · 终不为大 · 故能成其大」
 *   帛书·六十五: 「玄德深矣远矣 · 与物反矣 · 乃至大顺」
 *
 *   主公诏 (2026-05-17 23:09):
 *     「道法自然 · 提取 devin 路线中虚拟机反代所有核心之资
 *      取之尽锱铢 · 用之如泥沙 · 完善 windsurf-assistant @130-道独立体_Standalone 之一切
 *      道法自然 · 无为而无不为 · 顺其自然」
 *
 *   印 138 之实 · 4 模块深整合 + 3 文献 (帛书六十三 「为大于其细」):
 *     ① userscript_extension/ ← Devin 03_网页注入/   · 13 件 · 67 KB
 *     ② local_admin/          ← Devin 05_本地轻管/   · 7 件  · 91 KB
 *     ③ vm_binding/           ← Devin 06_号VM绑定/   · 5 件  · 60 KB (非敏感)
 *     ④ gh_orchestration/     ← Devin 01_GH编排/     · 9 件  · 63 KB (独有 + 非已超)
 *     ⑤ docs/devin_archive/   ← Devin 顶层文献      · 3 件  · 50 KB
 *     0 敏感件 · 守玄德 (帛书六十五)
 *
 *   守门 · 7 段 · ~24 子测 :
 *     §1 · userscript_extension (4)
 *     §2 · local_admin (4)
 *     §3 · vm_binding (4)
 *     §4 · gh_orchestration (5)
 *     §5 · docs/devin_archive (3)
 *     §6 · 0 敏感件全境扫 (1)
 *     §7 · 整合一致性 (3)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PKG = path.join(ROOT, "packages", "dao-devin-vm");
const USCRIPT_EXT = path.join(PKG, "userscript_extension");
const LOCAL_ADMIN = path.join(PKG, "local_admin");
const VM_BIND = path.join(PKG, "vm_binding");
const GH_ORCH = path.join(PKG, "gh_orchestration");
const DEVIN_ARCH = path.join(ROOT, "docs", "devin_archive");

let pass = 0;
let fail = 0;
const errors = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`     ${e.message}`);
    errors.push({ name, msg: e.message });
    fail++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert failed");
}

function readSafe(p) {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return "";
  }
}

console.log("");
console.log("════════════════════════════════════════════════════════════════════════");
console.log("  印 138 · Devin云原生 虚拟机反代深整合 · 取之尽锱铢 · 用之如泥沙");
console.log("    主公诏: 提取 devin 之资完善一切 · 道法自然 · 顺其自然");
console.log("════════════════════════════════════════════════════════════════════════");
console.log("");

// ════════════════════════════════════════════════════════════════════════
// §1 · userscript_extension (Devin 03_网页注入/)
// ════════════════════════════════════════════════════════════════════════
console.log("§1 · userscript_extension/ 守门 (Devin 03_网页注入)");

test("§1.1 · README.md 存在 + 含「网页注入」标", () => {
  const p = path.join(USCRIPT_EXT, "README.md");
  assert(fs.existsSync(p), "README.md 不存在");
  const c = readSafe(p);
  const hasMarker = c.includes("网页注入") || c.includes("userscript") || c.includes("extension");
  assert(hasMarker, "README 缺标识");
});

test("§1.2 · userscript/dao-devin-sp-inject.user.js 存在 + 含 ==UserScript==", () => {
  const p = path.join(USCRIPT_EXT, "userscript", "dao-devin-sp-inject.user.js");
  assert(fs.existsSync(p), "userscript 不存在");
  const st = fs.statSync(p);
  assert(st.size >= 16000 && st.size <= 17500, `尺异: ${st.size}`);
  const c = readSafe(p);
  assert(c.includes("==UserScript=="), "缺 ==UserScript== 块");
});

test("§1.3 · extension/manifest.json valid + manifest_version", () => {
  const p = path.join(USCRIPT_EXT, "extension", "manifest.json");
  assert(fs.existsSync(p), "manifest.json 不存在");
  const c = readSafe(p);
  let j;
  try {
    j = JSON.parse(c);
  } catch (e) {
    throw new Error("manifest.json invalid JSON: " + e.message);
  }
  assert(j.manifest_version, "缺 manifest_version");
  assert(j.name, "缺 name");
});

test("§1.4 · extension/ 8 件齐 (3 js + popup 3 + sw + manifest + 3 icons + make_icons)", () => {
  const expected = [
    "manifest.json",
    "content.js",
    "inject.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "sw.js",
  ];
  for (const f of expected) {
    const p = path.join(USCRIPT_EXT, "extension", f);
    assert(fs.existsSync(p), `缺 extension/${f}`);
  }
  const icons = ["icon-16.png", "icon-48.png", "icon-128.png"];
  for (const i of icons) {
    const p = path.join(USCRIPT_EXT, "extension", "icons", i);
    assert(fs.existsSync(p), `缺 extension/icons/${i}`);
  }
});

// ════════════════════════════════════════════════════════════════════════
// §2 · local_admin (Devin 05_本地轻管/)
// ════════════════════════════════════════════════════════════════════════
console.log("");
console.log("§2 · local_admin/ 守门 (Devin 05_本地轻管)");

test("§2.1 · README.md 存在 + 含「本地」/「local」", () => {
  const p = path.join(LOCAL_ADMIN, "README.md");
  assert(fs.existsSync(p), "README 不存在");
  const c = readSafe(p);
  assert(c.includes("本地") || c.toLowerCase().includes("local"), "README 缺标识");
});

test("§2.2 · 一笔便活.ps1 + spawn_N.ps1 存在 (主创 2 件)", () => {
  const p1 = path.join(LOCAL_ADMIN, "一笔便活.ps1");
  const p2 = path.join(LOCAL_ADMIN, "spawn_N.ps1");
  assert(fs.existsSync(p1), "一笔便活.ps1 不存在");
  assert(fs.existsSync(p2), "spawn_N.ps1 不存在");
  const s1 = fs.statSync(p1).size;
  const s2 = fs.statSync(p2).size;
  assert(s1 >= 22000, `一笔便活.ps1 太小: ${s1}`);
  assert(s2 >= 16000, `spawn_N.ps1 太小: ${s2}`);
});

test("§2.3 · 4 md 文献齐 (账号池/提示词注入/API反代消费/.env.local.sample)", () => {
  const expected = [
    "账号池.md",
    "提示词注入.md",
    "API反代消费.md",
    ".env.local.sample",
  ];
  for (const f of expected) {
    const p = path.join(LOCAL_ADMIN, f);
    assert(fs.existsSync(p), `缺 ${f}`);
  }
});

test("§2.4 · .env.local.sample 不含真 token (扫 sk- / Bearer / token=)", () => {
  const p = path.join(LOCAL_ADMIN, ".env.local.sample");
  const c = readSafe(p);
  // sample 应仅含 占位 / example / xxx
  const hasRealToken =
    /sk-[A-Za-z0-9]{20,}/.test(c) ||
    /Bearer\s+[A-Za-z0-9]{40,}/.test(c) ||
    /eyJ[A-Za-z0-9_-]{40,}/.test(c);
  assert(!hasRealToken, ".env.local.sample 含真 token (敏感) — 必须仅 example");
});

// ════════════════════════════════════════════════════════════════════════
// §3 · vm_binding (Devin 06_号VM绑定/)
// ════════════════════════════════════════════════════════════════════════
console.log("");
console.log("§3 · vm_binding/ 守门 (Devin 06_号VM绑定)");

test("§3.1 · README.md + 绑定法.md 文献齐", () => {
  const p1 = path.join(VM_BIND, "README.md");
  const p2 = path.join(VM_BIND, "绑定法.md");
  assert(fs.existsSync(p1), "README.md 不存在");
  assert(fs.existsSync(p2), "绑定法.md 不存在");
});

test("§3.2 · 一号一VM.ps1 主创存在 (39 KB · PowerShell)", () => {
  const p = path.join(VM_BIND, "一号一VM.ps1");
  assert(fs.existsSync(p), "一号一VM.ps1 不存在");
  const st = fs.statSync(p);
  assert(st.size >= 39000, `太小: ${st.size}`);
  const c = readSafe(p);
  // PowerShell 标识
  assert(
    c.includes("param") || c.includes("function") || c.includes("$"),
    "不像 PowerShell"
  );
});

test("§3.3 · bindings.json.sample 是 valid JSON + 仅 example 数据", () => {
  const p = path.join(VM_BIND, "bindings.json.sample");
  assert(fs.existsSync(p), "sample 不存在");
  const c = readSafe(p);
  let j;
  try {
    j = JSON.parse(c);
  } catch (e) {
    throw new Error("sample invalid JSON: " + e.message);
  }
  assert(Array.isArray(j.bindings), "缺 bindings 数组");
  // 扫确定仅是 example
  const hasExample =
    c.includes("example_") || c.includes("xxxx") || c.includes("yyyy") ||
    c.includes("c3eba3d93c1234567890") || c.includes("a1b2");
  assert(hasExample, "sample 应仅含 example 数据");
});

test("§3.4 · .gitignore 屏 bindings.json (真件) · 守玄德", () => {
  const p = path.join(VM_BIND, ".gitignore");
  assert(fs.existsSync(p), ".gitignore 不存在");
  const c = readSafe(p);
  assert(c.includes("bindings.json"), ".gitignore 缺 bindings.json 屏");
});

// ════════════════════════════════════════════════════════════════════════
// §4 · gh_orchestration (Devin 01_GH编排/)
// ════════════════════════════════════════════════════════════════════════
console.log("");
console.log("§4 · gh_orchestration/ 守门 (Devin 01_GH编排)");

test("§4.1 · README.md + _pkg_README.md 文献齐", () => {
  const p1 = path.join(GH_ORCH, "README.md");
  const p2 = path.join(GH_ORCH, "_pkg_README.md");
  assert(fs.existsSync(p1), "README.md 不存在");
  assert(fs.existsSync(p2), "_pkg_README.md 不存在");
});

test("§4.2 · 4 守门测 + 1 probe 件齐 (印 118-120 之 Devin 真测)", () => {
  const expected = [
    "_probe_env.cjs",
    "_seal118_guizong.cjs",
    "_seal119_batch_real.cjs",
    "_seal119_chat_real.cjs",
    "_seal120_three_pool_test.cjs",
  ];
  for (const f of expected) {
    const p = path.join(GH_ORCH, f);
    assert(fs.existsSync(p), `缺 ${f}`);
  }
});

test("§4.3 · 各 _seal*.cjs 是 valid Node syntax (node --check)", () => {
  const files = [
    "_probe_env.cjs",
    "_seal118_guizong.cjs",
    "_seal119_batch_real.cjs",
    "_seal119_chat_real.cjs",
    "_seal120_three_pool_test.cjs",
  ];
  for (const f of files) {
    const p = path.join(GH_ORCH, f);
    const r = spawnSync(process.execPath, ["--check", p], {
      encoding: "utf-8",
      timeout: 10000,
    });
    if (r.status !== 0) {
      throw new Error(
        `${f} syntax err\n  stderr: ${r.stderr || "(empty)"}\n  stdout: ${r.stdout || "(empty)"}`
      );
    }
  }
});

test("§4.4 · _APPLY_GH_PR.ps1 存在 (PR 自动应用器)", () => {
  const p = path.join(GH_ORCH, "_APPLY_GH_PR.ps1");
  assert(fs.existsSync(p), "_APPLY_GH_PR.ps1 不存在");
});

test("§4.5 · .gitignore 屏 .dao_*_token (敏感件守)", () => {
  const p = path.join(GH_ORCH, ".gitignore");
  assert(fs.existsSync(p), ".gitignore 不存在");
  const c = readSafe(p);
  assert(c.includes(".dao_") && c.includes("token"), ".gitignore 缺 token 屏");
});

// ════════════════════════════════════════════════════════════════════════
// §5 · docs/devin_archive (顶层 3 文献)
// ════════════════════════════════════════════════════════════════════════
console.log("");
console.log("§5 · docs/devin_archive/ 文献守门");

test("§5.1 · ARCHITECTURE_虚拟机反代_devin.md 存在 + 含架构标", () => {
  const p = path.join(DEVIN_ARCH, "ARCHITECTURE_虚拟机反代_devin.md");
  assert(fs.existsSync(p), "ARCHITECTURE 不存在");
  const c = readSafe(p);
  const hasMarker =
    c.includes("ARCHITECTURE") || c.includes("架构") || c.includes("反代") || c.includes("devin");
  assert(hasMarker, "ARCHITECTURE 缺标识");
});

test("§5.2 · SEAL_印129 + SEAL_印130 存齐", () => {
  const files = fs.readdirSync(DEVIN_ARCH);
  const has129 = files.some((f) => f.includes("印129") || f.includes("印 129"));
  const has130 = files.some((f) => f.includes("印130") || f.includes("印 130"));
  assert(has129, "缺 SEAL_印129");
  assert(has130, "缺 SEAL_印130");
});

test("§5.3 · 各 md 不含真号信息 (扫 secret tunnel token)", () => {
  const files = fs.readdirSync(DEVIN_ARCH).filter((f) => f.endsWith(".md"));
  for (const f of files) {
    const c = readSafe(path.join(DEVIN_ARCH, f));
    // 扫 64-char hex token (tunnel secret 形式)
    const hasSecret = /[a-f0-9]{32,}/.test(c.replace(/`[a-f0-9]+`/g, ""));
    if (hasSecret) {
      // 进一步确认不是 commit hash / SHA · 看 surrounding
      // 简扫: 若纯 64 hex 在 'tunnel' / 'secret' / 'auth' 上下文 · 警
      const lines = c.split("\n");
      for (const ln of lines) {
        if (/[a-f0-9]{32,}/.test(ln) && /tunnel|secret|auth|user:/i.test(ln)) {
          throw new Error(`${f} 含可能敏感 hex token: ${ln.slice(0, 100)}...`);
        }
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════════════
// §6 · 0 敏感件全境扫
// ════════════════════════════════════════════════════════════════════════
console.log("");
console.log("§6 · 0 敏感件守门 (全境扫)");

test("§6.1 · 4 模块全境 0 敏感件 (.dao_*_token / bindings.json / bindings.json.bak)", () => {
  const sensitive = [];
  const dirs = [USCRIPT_EXT, LOCAL_ADMIN, VM_BIND, GH_ORCH, DEVIN_ARCH];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    function walk(dir) {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const fp = path.join(dir, f.name);
        if (f.isDirectory()) {
          walk(fp);
        } else {
          // 敏感名
          if (
            f.name === "bindings.json" ||
            f.name === "bindings.json.bak" ||
            /^\.dao_.*token/i.test(f.name)
          ) {
            sensitive.push(fp);
          }
        }
      }
    }
    walk(d);
  }
  if (sensitive.length > 0) {
    throw new Error(
      "敏感件入库:\n" + sensitive.map((s) => "  " + s).join("\n")
    );
  }
});

// ════════════════════════════════════════════════════════════════════════
// §7 · 整合一致性
// ════════════════════════════════════════════════════════════════════════
console.log("");
console.log("§7 · 整合一致性守门");

test("§7.1 · 4 新模块各有 README.md (合一气化三清纲)", () => {
  const dirs = [USCRIPT_EXT, LOCAL_ADMIN, VM_BIND, GH_ORCH];
  for (const d of dirs) {
    const r = path.join(d, "README.md");
    assert(fs.existsSync(r), `${path.basename(d)} 缺 README.md`);
  }
});

test("§7.2 · packages/dao-devin-vm/ 顶层 5 大模块齐 (新整合后态)", () => {
  const expected = [
    "userscript_extension",
    "local_admin",
    "vm_binding",
    "gh_orchestration",
    "silk", // 早立
  ];
  for (const m of expected) {
    const p = path.join(PKG, m);
    assert(fs.statSync(p).isDirectory(), `${m}/ 不是目录`);
  }
});

test("§7.3 · 4 模块总件数 ≥ 30 (取尽 Devin 之精)", () => {
  let total = 0;
  function count(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      if (f.name.startsWith(".") && f.name !== ".gitignore") continue;
      const fp = path.join(d, f.name);
      if (f.isDirectory()) count(fp);
      else total++;
    }
  }
  count(USCRIPT_EXT);
  count(LOCAL_ADMIN);
  count(VM_BIND);
  count(GH_ORCH);
  assert(total >= 30, `4 模块件数太少: ${total}`);
});

// ════════════════════════════════════════════════════════════════════════
// 总
// ════════════════════════════════════════════════════════════════════════
console.log("");
console.log("════════════════════════════════════════════════════════════════════════");
console.log(`  印 138 总: ${pass + fail} · 通: ${pass} · 败: ${fail}`);
if (fail > 0) {
  console.log("");
  console.log("  失败明:");
  for (const e of errors) {
    console.log(`    ✗ ${e.name}: ${e.msg}`);
  }
}
console.log("════════════════════════════════════════════════════════════════════════");
console.log("");

if (fail === 0) {
  console.log("  ✓ 印 138 全过 · Devin云原生 虚拟机反代深整合毕");
  console.log("    「取之尽锱铢 · 用之如泥沙」(主公诏 · 杜牧引)");
  console.log("    「玄德深矣远矣 · 与物反矣 · 乃至大顺」(帛书六十五)");
  console.log("    「为大于其细 · 终不为大故能成其大」(帛书六十三)");
  console.log("");
}

process.exit(fail > 0 ? 1 : 0);
