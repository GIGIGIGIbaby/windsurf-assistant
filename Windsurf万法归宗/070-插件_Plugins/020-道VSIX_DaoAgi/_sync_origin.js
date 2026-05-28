#!/usr/bin/env node
// _sync_origin.js — 同步 vendor/bundled-origin → installed-ext + hot-dir
//
// v17.80 · 损之又损 · 全档归一 · 不止 源.js
// vendor 内对偶: 源.js↔source.js, 锚.py↔anchor.py (中文名+ASCII 别名 · VSIX 编码兜底)
// 然后 vendor → installed-ext + hot-dir (Administrator 之地; 它用户由其各自 ext 之 ensureHot 自治)
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const VENDOR =
  "e:\\道\\道生一\\一生二\\Windsurf万法归宗\\070-插件_Plugins\\020-道VSIX_DaoAgi\\dao-agi\\vendor\\wam\\bundled-origin";
const HOT = path.join(os.homedir(), ".wam-hot", "origin");

// vendor 内对偶副本 (主名 → 别名)
// VSIX 打包时若文件名 UTF-8 不被某些工具支持, ASCII 别名可备
const PAIRS = [
  ["源.js", "source.js"],
  ["锚.py", "anchor.py"],
];

// 全部需同步之档 (vendor → 各 target)
const SYNC_FILES = ["源.js", "source.js", "锚.py", "anchor.py", "_dao_81.txt"];

// 自动发现 installed-ext 路径 (版本号会自动升级 · 17.78 → 17.80 等)
function findInstalledExt() {
  const extRoot = path.join(os.homedir(), ".windsurf", "extensions");
  if (!fs.existsSync(extRoot)) return [];
  return fs
    .readdirSync(extRoot)
    .filter((d) => d.startsWith("dao-agi.dao-agi-"))
    .map((d) => path.join(extRoot, d, "vendor", "wam", "bundled-origin"))
    .filter((p) => fs.existsSync(p));
}

// 1. vendor 内对偶
for (const [primary, alias] of PAIRS) {
  const src = path.join(VENDOR, primary);
  if (!fs.existsSync(src)) continue;
  const buf = fs.readFileSync(src);
  fs.writeFileSync(path.join(VENDOR, alias), buf);
  console.log(`vendor 内同步: ${primary} → ${alias} (${buf.length}B)`);
}

// 2. vendor → installed + hot
const INSTALLED_DIRS = findInstalledExt();
const TARGETS = [HOT, ...INSTALLED_DIRS];
let written = 0;
for (const t of TARGETS) {
  try {
    fs.mkdirSync(t, { recursive: true });
  } catch {}
  for (const f of SYNC_FILES) {
    const src = path.join(VENDOR, f);
    if (!fs.existsSync(src)) continue;
    try {
      const buf = fs.readFileSync(src);
      fs.writeFileSync(path.join(t, f), buf);
      written++;
    } catch (e) {
      console.log(`  ✗ ${t}\\${f} (${e.code || e.message})`);
    }
  }
}

// 3. 验证
console.log("─ 同步态:");
for (const t of [VENDOR, ...TARGETS]) {
  const sizes = {};
  for (const f of SYNC_FILES) {
    const fp = path.join(t, f);
    try {
      sizes[f] = fs.statSync(fp).size;
    } catch {
      sizes[f] = null;
    }
  }
  const ref = sizes["源.js"];
  const allSrc = sizes["源.js"] === sizes["source.js"] && ref;
  const allAnchor = sizes["锚.py"] === sizes["anchor.py"] && sizes["锚.py"];
  const tag = allSrc && allAnchor ? "✓" : "✗";
  console.log(
    `  ${tag} ${t}  src=${sizes["源.js"]}/${sizes["source.js"]}B  anchor=${sizes["锚.py"]}/${sizes["anchor.py"]}B  dao=${sizes["_dao_81.txt"]}B`,
  );
}
console.log(
  `─ wrote ${written} files · found ${INSTALLED_DIRS.length} installed-ext path(s)`,
);
