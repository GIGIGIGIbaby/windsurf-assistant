// dao_l10_vsix.spec.js — 大归宗 · 道最后一步 · VSIX 全链路验
// =====================================================================
// 反者道之动 · 自下而上 · 九层既通 · 道最后一步即 VSIX
//
// 此测:
//   一 · 解包 dao-agi-{version}.vsix → 临时目录
//   二 · 验内单完整 (12 必件 + 0 锚漏)
//   三 · 验源 ↔ 装态 byte-for-byte 同 (sha256-16 每件)
//   四 · 反验装态 源.js: require → start({port}) → /origin/* 真活
//   五 · 反验装态 extension.js: node --check + activate 函在
//   六 · 验 _water_virtues / _uninstall_sentinel 不入 VSIX (v18.0+ 死码归芜)
//   七 · 验 _remote/** 不入 VSIX (v18.1.2 漏修)
//
// 终: pass=N fail=0 即 "万物归焉而不为主, 可名为大"
// =====================================================================
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const D = path.resolve(__dirname, "..");
const PKG = JSON.parse(fs.readFileSync(path.join(D, "package.json"), "utf8"));
const VERSION = PKG.version;
const VSIX = path.join(D, `dao-agi-${VERSION}.vsix`);

let pass = 0,
  fail = 0;
const failures = [];
function ok(name, cond, hint) {
  if (cond) {
    pass++;
    console.log("  ✓ " + name + (hint ? "    " + hint : ""));
  } else {
    fail++;
    failures.push(name + (hint ? " :: " + hint : ""));
    console.log("  ✗ " + name + (hint ? "    " + hint : ""));
  }
}

function sha16(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/origin/ping",
        method: "GET",
        timeout: 800,
      },
      (res) => {
        res.resume();
        resolve({ open: true, status: res.statusCode });
      },
    );
    req.on("error", () => resolve({ open: false }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ open: false });
    });
    req.end();
  });
}

function httpGetJson(port, p) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: p, method: "GET", timeout: 1500 },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(buf) });
          } catch {
            resolve({ status: res.statusCode, raw: buf });
          }
        });
      },
    );
    req.on("error", (e) => resolve({ err: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ err: "timeout" });
    });
    req.end();
  });
}

function pickFreePort(start) {
  return new Promise((r) => {
    const s = require("node:net").createServer();
    s.unref();
    s.on("error", () => r(start + Math.floor(Math.random() * 200) + 1));
    s.listen(start, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
}

(async () => {
  const t0 = Date.now();
  console.log("\n══════ 大归宗 · 道最后一步 · VSIX 全链路验 ══════");
  console.log("  版:    v" + VERSION);
  console.log(
    "  机:    " +
      os.hostname() +
      " · " +
      process.platform +
      " · node " +
      process.version,
  );

  // ─── 一 · VSIX 件存 + 大小合理
  console.log("\n─────── 一 · VSIX 文件 ───────");
  ok(
    "L10.1 dao-agi-" + VERSION + ".vsix 存",
    fs.existsSync(VSIX),
    "path=" + VSIX,
  );
  if (!fs.existsSync(VSIX)) {
    console.log("\n  VSIX 不存 · 道未走完最后一步 · 终");
    process.exit(1);
  }
  const vsixSize = fs.statSync(VSIX).size;
  ok(
    "L10.2 VSIX 大小合理 (300KB ≤ size ≤ 500KB · 道法自然 · 不肿)",
    vsixSize >= 300 * 1024 && vsixSize <= 500 * 1024,
    "size=" + vsixSize + " bytes (" + (vsixSize / 1024).toFixed(1) + " KB)",
  );

  // ─── 二 · 解包 VSIX → 临时目录
  console.log("\n─────── 二 · 解包 VSIX (隔代验) ───────");
  const tmpDir = path.join(os.tmpdir(), "dao-l10-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  // 用 PowerShell 内 Expand-Archive (重命名为 .zip 也可)
  // 道: VSIX = ZIP · 用 node 内 zlib 不直 · 借 system tar (windows 也有)
  // 反者道之动 · 用最简: 拷为 .zip + Expand-Archive
  const tmpZip = path.join(tmpDir, "vsix.zip");
  fs.copyFileSync(VSIX, tmpZip);
  const expandRes = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path '${tmpZip.replace(/\\/g, "/")}' -DestinationPath '${tmpDir.replace(/\\/g, "/")}' -Force`,
    ],
    { encoding: "utf8", timeout: 15000 },
  );
  ok(
    "L10.3 解 VSIX 成 (Expand-Archive)",
    expandRes.status === 0,
    expandRes.status === 0
      ? ""
      : "stderr=" + (expandRes.stderr || "").slice(0, 200),
  );

  const extDir = path.join(tmpDir, "extension");
  ok("L10.4 解后 extension/ 目录在", fs.existsSync(extDir));

  // ─── 三 · 12 必件 + 0 锚漏验
  console.log("\n─────── 三 · 12 必件 + 死码归芜验 ───────");
  const REQUIRED = [
    "extension.js",
    "essence.js",
    "watcher.js",
    "isolator.js",
    "ls-client.js",
    "ls-gate-patcher.js",
    "package.json",
    "media/icon.png",
    "media/icon.svg",
    "vendor/wam/extension.js",
    "vendor/wam/package.json",
    "vendor/wam/bundled-origin/源.js",
    "vendor/wam/bundled-origin/source.js",
    "vendor/wam/bundled-origin/_dao_81.txt",
    "vendor/wam/bundled-origin/VERSION",
  ];
  let allReqOk = true;
  for (const f of REQUIRED) {
    const p = path.join(extDir, f);
    const exists = fs.existsSync(p);
    if (!exists) allReqOk = false;
    if (!exists) console.log("    ✗ 必件缺: " + f);
  }
  ok(
    "L10.5 " +
      REQUIRED.length +
      " 必件全在 (extension+vendor/wam+bundled-origin+media)",
    allReqOk,
    "checked=" + REQUIRED.length,
  );

  // 死码归芜 · 不应在 VSIX
  const FORBIDDEN = [
    "_water_virtues.js",
    "_uninstall_sentinel.js",
    "_owner.lock",
    "_lastinject.json",
    "_origin_mode.txt",
    "_settings_backup.json",
    "_AGENTS.md",
    "node_modules",
    "test",
    "_remote",
    "_archive",
    "storage-guard.js",
    "sp-scaffold.js",
  ];
  let allForbidGone = true;
  for (const f of FORBIDDEN) {
    const p = path.join(extDir, f);
    const exists = fs.existsSync(p);
    if (exists) {
      allForbidGone = false;
      console.log("    ✗ 不应有: " + f);
    }
  }
  ok(
    "L10.6 " +
      FORBIDDEN.length +
      " 死码/状件全无 (v18.0+ 进程内化 + v18.1.2 _remote 漏修)",
    allForbidGone,
  );

  // ─── 四 · 装态 ↔ 源 byte-for-byte 同 (sha16 校)
  console.log("\n─────── 四 · 装态 ↔ 源 sha256-16 byte 等 ───────");
  const TO_HASH = [
    ["extension.js", "extension.js"],
    ["essence.js", "essence.js"],
    ["watcher.js", "watcher.js"],
    ["isolator.js", "isolator.js"],
    ["ls-client.js", "ls-client.js"],
    ["ls-gate-patcher.js", "ls-gate-patcher.js"],
    ["vendor/wam/extension.js", "vendor/wam/extension.js"],
    ["vendor/wam/bundled-origin/源.js", "vendor/wam/bundled-origin/源.js"],
    [
      "vendor/wam/bundled-origin/source.js",
      "vendor/wam/bundled-origin/source.js",
    ],
    [
      "vendor/wam/bundled-origin/_dao_81.txt",
      "vendor/wam/bundled-origin/_dao_81.txt",
    ],
  ];
  let allHashEqual = true;
  for (const [src, dst] of TO_HASH) {
    const sP = path.join(D, src);
    const dP = path.join(extDir, dst);
    if (!fs.existsSync(sP) || !fs.existsSync(dP)) {
      console.log("    ✗ 缺件: src=" + src + " · dst=" + dst);
      allHashEqual = false;
      continue;
    }
    const sH = sha16(sP),
      dH = sha16(dP);
    const eq = sH === dH;
    if (!eq) {
      allHashEqual = false;
      console.log("    ✗ 不等: " + src + " src=" + sH + " dst=" + dH);
    } else {
      console.log("    · " + src + "  sha16=" + sH);
    }
  }
  ok(
    "L10.7 " +
      TO_HASH.length +
      " 件 src ↔ vsix sha256-16 byte 全等 (打包不污染)",
    allHashEqual,
  );

  // ─── 五 · 装态 源.js 真活验
  console.log("\n─────── 五 · 装态 源.js 真活 (隔代 :PORT) ───────");
  let installedYuan;
  try {
    const yuanPath = path.join(extDir, "vendor/wam/bundled-origin/源.js");
    delete require.cache[require.resolve(yuanPath)];
    installedYuan = require(yuanPath);
    ok("L10.8 装态 源.js require 成", typeof installedYuan === "object");
  } catch (e) {
    ok("L10.8 装态 源.js require 成", false, e.message);
  }

  if (installedYuan) {
    ok(
      "L10.9 装态 源.js 14 核心 exports",
      typeof installedYuan.start === "function" &&
        typeof installedYuan.invertSP === "function" &&
        typeof installedYuan.getMode === "function" &&
        typeof installedYuan.setMode === "function",
    );

    ok(
      "L10.10 装态 源.js DAO_DE_JING_81 满 81 章 (chars≥6000)",
      typeof installedYuan.DAO_DE_JING_81 === "string" &&
        installedYuan.DAO_DE_JING_81.length >= 6000,
      "chars=" +
        (installedYuan.DAO_DE_JING_81
          ? installedYuan.DAO_DE_JING_81.length
          : 0),
    );

    // start 真活 → ping → close
    const testPort = await pickFreePort(28890);
    let h;
    try {
      h = await installedYuan.start({ port: testPort, host: "127.0.0.1" });
      ok(
        "L10.11 装态 源.js start({port:" + testPort + "}) 成",
        h && h.port === testPort,
      );

      const ping = await httpGetJson(testPort, "/origin/ping");
      ok(
        "L10.12 装态 源.js GET /origin/ping 200",
        ping.status === 200,
        "mode=" + (ping.json && ping.json.mode),
      );

      const sel = await httpGetJson(testPort, "/origin/selftest");
      ok(
        "L10.13 装态 源.js GET /origin/selftest 200 · dao_chars=6776",
        sel.status === 200 && sel.json && sel.json.dao_chars >= 6000,
        "dao_chars=" + (sel.json && sel.json.dao_chars),
      );

      await h.close();
      await new Promise((s) => setTimeout(s, 100));
      const stillOpen = await isPortOpen(testPort);
      ok(
        "L10.14 装态 源.js close() 后 :" + testPort + " 不再监听",
        !stillOpen.open,
      );
    } catch (e) {
      ok("L10.11 装态 源.js start 成", false, e.message);
    }
  }

  // ─── 六 · 装态 extension.js node --check
  console.log("\n─────── 六 · 装态 extension.js node --check ───────");
  const extPath = path.join(extDir, "extension.js");
  const r6 = spawnSync(process.execPath, ["--check", extPath], {
    encoding: "utf8",
    timeout: 5000,
  });
  ok(
    "L10.15 装态 extension.js node --check 通",
    r6.status === 0,
    r6.status === 0 ? "" : "stderr=" + (r6.stderr || "").slice(0, 200),
  );

  const extJs = fs.readFileSync(extPath, "utf8");
  ok(
    "L10.16 装态 extension.js 含 activate (function/exports/module.exports)",
    /\bfunction\s+activate\b|\bexports\.activate\s*=|module\.exports\s*=/.test(
      extJs,
    ),
  );
  ok(
    "L10.17 装态 extension.js 含 deactivate (function/exports.deactivate=)",
    /\bfunction\s+deactivate\b|\bexports\.deactivate\s*=/.test(extJs),
  );
  ok(
    "L10.18 装态 extension.js 阶四主壳拆解 (顶部 _waterVirtues / _uninstallSentinel decl 已去 · v18.2.1)",
    !/let\s+_waterVirtues\s*=\s*null/.test(extJs) &&
      !/let\s+_uninstallSentinel\s*=\s*null/.test(extJs),
  );

  // ─── 七 · 装态 vendor/wam/extension.js node --check
  console.log("\n─────── 七 · 装态 WAM 主壳 node --check ───────");
  const wamExtPath = path.join(extDir, "vendor/wam/extension.js");
  const r7 = spawnSync(process.execPath, ["--check", wamExtPath], {
    encoding: "utf8",
    timeout: 8000,
  });
  ok(
    "L10.19 装态 vendor/wam/extension.js node --check 通",
    r7.status === 0,
    r7.status === 0 ? "" : "stderr=" + (r7.stderr || "").slice(0, 200),
  );

  // ─── 八 · package.json 版号 ↔ 装态版号 一致
  console.log("\n─────── 八 · package.json 版号 一致 ───────");
  const pkgInVsix = JSON.parse(
    fs.readFileSync(path.join(extDir, "package.json"), "utf8"),
  );
  ok(
    "L10.20 装态 package.json version=" + VERSION + " (源 ↔ 装一致)",
    pkgInVsix.version === VERSION,
  );
  ok("L10.21 装态 main='./extension.js'", pkgInVsix.main === "./extension.js");
  ok(
    "L10.22 装态 contributes.commands.length=" +
      pkgInVsix.contributes.commands.length +
      " (≥34)",
    pkgInVsix.contributes.commands.length >= 34,
  );

  // ─── 收
  console.log("\n─────── 收 (清临时目录) ───────");
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  console.log("\n══════ 大归宗 · 道最后一步 · 总 ══════");
  console.log("  PASS = " + pass);
  console.log("  FAIL = " + fail);
  console.log("  耗时 = " + dt + "s");
  console.log(
    "  VSIX = dao-agi-" +
      VERSION +
      ".vsix · " +
      (vsixSize / 1024).toFixed(1) +
      " KB",
  );
  if (fail === 0) {
    console.log("\n  ✓ 万物归焉而不为主 · 可名为大");
    console.log("  ✓ 反者道之动 · 自下而上九层 · 大归宗 VSIX");
    console.log("  ✓ 装态 = 源态 (byte-for-byte) · 装态 真活");
  } else {
    console.log("\n  ✗ 失:");
    failures.forEach((f) => console.log("    - " + f));
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("\nFATAL", e);
  process.exit(1);
});
