#!/usr/bin/env node
/**
 * _wam_pool_build.js · 印 148 · 反者道之动 · 一账号一 VM 之 token 池建器
 *   末改 · 2026-05-18
 *
 *   「道生一 · 一生二 · 二生三 · 三生万物」(帛书四十二)
 *   一 = ~/.wam (主公一身)
 *   二 = wam-state.json (active) + backups/*.json (历切号)
 *   三 = 去重 · 排序 · 验态
 *   万 = N 件 devin-session-token · 真『一账号一 VM』
 *
 *   「圣人无积 · 既以为人己愈有 · 既以予人己愈多」(帛书八十一)
 *   主公 1 件 activeApiKey + 17 件 backups → 去重 16 件 → N=16 VM 并行
 *
 * 用:
 *   node _wam_pool_build.js              # 建池 · 写 _state/wam_token_pool.json
 *   node _wam_pool_build.js --max 8      # 限 8 件 (节 ACU)
 *   node _wam_pool_build.js --show       # 仅显当下池态 · 不重建
 *
 * 出:
 *   _state/wam_token_pool.json · [{token, email, src, savedAt, isActive}, ...]
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const WAM_DIR = path.join(os.homedir(), ".wam");
const WAM_STATE = path.join(WAM_DIR, "wam-state.json");
const WAM_BACKUPS = path.join(WAM_DIR, "backups");
const STATE_DIR = path.join(__dirname, "_state");
const POOL_FILE = path.join(STATE_DIR, "wam_token_pool.json");
const TOKEN_PREFIX = "devin-session-token$";

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return def;
};
const MAX = parseInt(getArg("max", "0"), 10);
const SHOW_ONLY = args.includes("--show");

const C = {
  G: (s) => `\x1b[32m${s}\x1b[0m`,
  Y: (s) => `\x1b[33m${s}\x1b[0m`,
  R: (s) => `\x1b[31m${s}\x1b[0m`,
  B: (s) => `\x1b[36m${s}\x1b[0m`,
  GR: (s) => `\x1b[90m${s}\x1b[0m`,
  BO: (s) => `\x1b[1m${s}\x1b[0m`,
};

function showOnly() {
  if (!fs.existsSync(POOL_FILE)) {
    console.log(C.Y(`✗ 池不存 · 请先 node _wam_pool_build.js`));
    process.exit(0);
  }
  const pool = JSON.parse(fs.readFileSync(POOL_FILE, "utf8"));
  console.log(C.BO(`═══ wam_token_pool.json · ${pool.length} 件 token ═══\n`));
  pool.forEach((p, i) => {
    const flag = p.isActive ? C.G("★ active") : C.GR("· backup");
    const dt = p.savedAt ? new Date(p.savedAt).toISOString().slice(0, 10) : "?";
    const tail = p.token ? p.token.slice(-8) : "";
    console.log(
      `  ${String(i + 1).padStart(2)}. ${flag} · ${p.email || "?"} · ${dt} · ${C.GR(`...${tail}`)} · ${C.GR(`src=${p.src}`)}`,
    );
  });
}

function build() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });

  const tokens = new Map();

  // 1) active (wam-state.json)
  if (fs.existsSync(WAM_STATE)) {
    try {
      const cur = JSON.parse(fs.readFileSync(WAM_STATE, "utf8"));
      if (cur.activeApiKey && cur.activeApiKey.startsWith(TOKEN_PREFIX)) {
        tokens.set(cur.activeApiKey, {
          email: cur.activeEmail || "?",
          src: "wam-state.json",
          savedAt: cur.savedAt || Date.now(),
          isActive: true,
        });
      }
    } catch (e) {
      console.error(C.R(`  ✗ wam-state.json 解析失: ${e.message}`));
    }
  }

  // 2) backups
  let bkCount = 0;
  let bkValid = 0;
  if (fs.existsSync(WAM_BACKUPS)) {
    const files = fs
      .readdirSync(WAM_BACKUPS)
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.join(WAM_BACKUPS, f));
    bkCount = files.length;
    for (const f of files) {
      try {
        const j = JSON.parse(fs.readFileSync(f, "utf8"));
        if (
          j.activeApiKey &&
          j.activeApiKey.startsWith(TOKEN_PREFIX) &&
          !tokens.has(j.activeApiKey)
        ) {
          tokens.set(j.activeApiKey, {
            email: j.activeEmail || "?",
            src: path.basename(f),
            savedAt: j.savedAt || 0,
            isActive: false,
          });
          bkValid++;
        }
      } catch {}
    }
  }

  // 3) 排序 · 排活账号在前 · 然后 savedAt 倒序
  let pool = [...tokens.entries()].map(([token, meta]) => ({
    token,
    ...meta,
  }));
  pool.sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    return (b.savedAt || 0) - (a.savedAt || 0);
  });

  // 4) MAX 限
  if (MAX > 0 && pool.length > MAX) {
    console.log(C.Y(`  ⚠ --max ${MAX} · 切 ${pool.length} → ${MAX} 件`));
    pool = pool.slice(0, MAX);
  }

  // 5) 写
  fs.writeFileSync(POOL_FILE, JSON.stringify(pool, null, 2));

  console.log(C.BO(`═══ wam_token_pool.json 建毕 ═══`));
  console.log(`  · active   : ${tokens.has([...tokens.keys()][0]) ? 1 : 0} 件`);
  console.log(`  · backups  : ${bkValid} / ${bkCount} 件 (去重后)`);
  console.log(`  · ${C.G("总")}    : ${C.BO(C.G(pool.length))} 件 token (N VM 上限)`);
  console.log(`  · 写至     : ${POOL_FILE}`);
  console.log("");
  console.log(C.GR(`  「圣人无积 · 既以为人己愈有」(帛书八十一)`));
  console.log(C.GR(`  主公 ${pool.length} 件 token → ${pool.length} 件 VM 并行 → 任设备无感`));
  console.log("");
  if (pool.length >= 2) {
    console.log(C.B(`  下一步:`));
    console.log(`    node deployer.js --wam-all --dry-gist           # 起全 ${pool.length} 件 VM 并行 (耗 ${pool.length} ACU · ~3-15 min)`);
    console.log(`    node deployer.js --wam-all --n 4 --dry-gist     # 起前 4 件 VM (耗 4 ACU)`);
    console.log(`    node _wam_pool_build.js --show                  # 仅显当下池态`);
  }
}

if (SHOW_ONLY) {
  showOnly();
} else {
  build();
}
