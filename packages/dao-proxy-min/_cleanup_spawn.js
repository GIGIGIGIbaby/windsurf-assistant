#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// v9.9.28 真治 · detached cleanup spawn · 根本底层卸自身本体
// ═══════════════════════════════════════════════════════════════════
// 主公诏 5/19 2:36:
//   「无在乎一切路径 必须从根本底层首要解决点击卸载后能无论如何都能卸载插件本体」
//
// 真本源诊 (印 158·v9.9.27 实测漏):
//   v9.9.27 watchdog 仅触 reloadWindow · 依 Windsurf 启动协议清 .obsolete
//   但 Windsurf 1.110.1 fork 启动协议**不可信**:
//     · zhou 实测 .obsolete 标了 9.9.22/23/24 → 启动协议未清物理目录 ✗
//     · extensions.json 中 self 条目: fork uninstall API 漏删 ✗
//     · :8981 utility 子进程: deactivate 时未 kill · 成孤儿反代 ✗
//   3 病合 → 主公视为「最底层根本没卸载插件本体」
//
// 真治 (反者道之动 · 自治):
//   ★ spawn detached child_process · 脱 ext-host/Windsurf 主父子链 ★
//   · ext-host 死了它仍活
//   · 跟 Windsurf 主进程也无父子链
//   · 完全独立 Node 进程 · 自己做完所有清理 · self exit
//   · 不依赖 Windsurf 任何 API · 不依赖 deactivate 正常完成
//
// 道义:
//   四十「反者，道之动；弱者，道之用」(反 fork API 不可信 · 独立 spawn 自治)
//   六十四「为之于其未乱也」(spawn 先 · 后 reloadWindow · 治未乱)
//   八十「小邦寡民」(独立小进程 · 不与争 · 唯做己事)
//   七十六「天下莫柔弱于水 · 而攻坚强者莫之能胜」(以独立 detached 之柔 · 攻 fork API 不可信之坚)
//
// 参数 (process.argv):
//   [2] = extensions dir (e.g. C:\Users\zhou\.windsurf\extensions)
//   [3] = self ext id (e.g. dao-agi.dao-proxy-min)
//   [4] = log dir (optional · for debug)
//   [5] = reason (e.g. watchdog | deactivate | cmdPurge)
//
// 时序:
//   1. ext-host 调 spawn detached → 立即 unref → ext-host 死了它仍活
//   2. 本进程 sleep 2s (等 ext-host 真死 + Windows 文件 lock 释放)
//   3. 扫 EXT_DIR/dao-agi.dao-proxy-min-* → fs.rmSync (含 self 物理目录)
//   4. patch extensions.json → 删 dao-agi.dao-proxy-min 条目 (兜底 fork uninstall 漏写)
//   5. patch .obsolete → 删 dao-agi.dao-proxy-min-* 死标 (清死标)
//   6. 扫端口 :8889..:8988 → 找 utility 子进程 (按 cmd line 验) → kill
//   7. self exit · 真水过无痕

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const os = require("os");

// ── 解析参数 ──
const EXT_DIR = process.argv[2];
const SELF_ID = process.argv[3];
const LOG_DIR = process.argv[4] || os.tmpdir();
const REASON = process.argv[5] || "unknown";

if (!EXT_DIR || !SELF_ID) {
  console.error(
    "usage: node _cleanup_spawn.js <ext-dir> <self-id> [log-dir] [reason]",
  );
  process.exit(2);
}

const SELF_PREFIX = SELF_ID + "-"; // e.g. "dao-agi.dao-proxy-min-"
const LOG = path.join(
  LOG_DIR,
  `dao_cleanup_${new Date().toISOString().replace(/[:.]/g, "-")}_${process.pid}.log`,
);

function log(msg) {
  try {
    fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
  // 同时尝试输出到 stdout (虽然 detached 通常无 stdout · 但偶尔有)
  try {
    process.stdout.write(`[cleanup] ${msg}\n`);
  } catch {}
}

log(`★★★ v9.9.28 detached cleanup spawn 启 ★★★`);
log(`  PID=${process.pid}  PPID=${process.ppid}`);
log(`  EXT_DIR=${EXT_DIR}`);
log(`  SELF_ID=${SELF_ID}`);
log(`  REASON=${REASON}`);
log(`  LOG=${LOG}`);

// ────────────────────────────────────────────────────────────
// 招 1: sleep 2s · 等 ext-host 真死 + Windows 文件 lock 释放
// ────────────────────────────────────────────────────────────
async function step1_sleep() {
  log(`招 1: sleep 2000 ms ...`);
  await new Promise((r) => setTimeout(r, 2000));
}

// ────────────────────────────────────────────────────────────
// 招 2: 扫 EXT_DIR/dao-agi.dao-proxy-min-* → fs.rmSync 物理目录
// ────────────────────────────────────────────────────────────
function step2_rmPhysicalDirs() {
  log(`招 2: 扫物理目录 ${EXT_DIR}`);
  let removed = 0;
  let failed = 0;
  try {
    if (!fs.existsSync(EXT_DIR)) {
      log(`  ✗ EXT_DIR 不存在`);
      return;
    }
    const entries = fs.readdirSync(EXT_DIR);
    for (const e of entries) {
      if (e.startsWith(SELF_PREFIX)) {
        const full = path.join(EXT_DIR, e);
        // Windows 文件锁可能仍存 · 多次重试 (maxRetries=10 · retryDelay=500ms · 总 5s)
        let ok = false;
        for (let attempt = 1; attempt <= 10; attempt++) {
          try {
            fs.rmSync(full, {
              recursive: true,
              force: true,
              maxRetries: 5,
              retryDelay: 200,
            });
            ok = true;
            log(`  ✓ rm: ${e} (attempt ${attempt})`);
            removed++;
            break;
          } catch (err) {
            if (attempt === 10) {
              log(`  ✗ rm ${e} failed after 10 attempts: ${err.message}`);
              failed++;
            } else {
              // 一些文件锁着 · 等 500ms 重试
              try {
                require("child_process").execSync(
                  `timeout /t 1 /nobreak >nul 2>&1`,
                  {
                    windowsHide: true,
                  },
                );
              } catch {}
            }
          }
        }
      }
    }
    log(`  total: removed=${removed} failed=${failed}`);
  } catch (err) {
    log(`  扫目录失: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────
// 招 3: patch extensions.json · 删 dao-agi.dao-proxy-min 条目
// ────────────────────────────────────────────────────────────
function step3_patchExtensionsJson() {
  log(`招 3: patch extensions.json`);
  try {
    const ejPath = path.join(EXT_DIR, "extensions.json");
    if (!fs.existsSync(ejPath)) {
      log(`  - extensions.json 不存在 · 跳`);
      return;
    }
    const raw = fs.readFileSync(ejPath, "utf8");
    let arr;
    try {
      arr = JSON.parse(raw);
    } catch (e) {
      log(`  ✗ extensions.json 解析失: ${e.message}`);
      return;
    }
    if (!Array.isArray(arr)) {
      log(`  ✗ extensions.json 非 array`);
      return;
    }
    const before = arr.length;
    const filtered = arr.filter(
      (e) => e && e.identifier && e.identifier.id !== SELF_ID,
    );
    const after = filtered.length;
    if (after < before) {
      // 写之前备份
      try {
        fs.copyFileSync(ejPath, ejPath + ".bak_cleanup_" + Date.now());
      } catch {}
      fs.writeFileSync(ejPath, JSON.stringify(filtered), "utf8");
      log(`  ✓ ext.json: ${before} → ${after} (删 ${before - after} 条 self)`);
    } else {
      log(`  - ext.json 无 self 条目 (count=${before})`);
    }
  } catch (err) {
    log(`  patch ext.json 失: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────
// 招 4: patch .obsolete · 删 dao-agi.dao-proxy-min-* 死标
// ────────────────────────────────────────────────────────────
function step4_patchObsolete() {
  log(`招 4: patch .obsolete`);
  try {
    const obsPath = path.join(EXT_DIR, ".obsolete");
    if (!fs.existsSync(obsPath)) {
      log(`  - .obsolete 不存在 · 跳`);
      return;
    }
    const raw = fs.readFileSync(obsPath, "utf8");
    let obs;
    try {
      obs = JSON.parse(raw);
    } catch (e) {
      log(`  ✗ .obsolete 解析失: ${e.message}`);
      return;
    }
    if (typeof obs !== "object" || obs === null) {
      log(`  ✗ .obsolete 非 object`);
      return;
    }
    let removed = 0;
    for (const k of Object.keys(obs)) {
      if (k.startsWith(SELF_PREFIX)) {
        delete obs[k];
        removed++;
        log(`    - drop: ${k}`);
      }
    }
    if (removed > 0) {
      fs.writeFileSync(obsPath, JSON.stringify(obs), "utf8");
      log(`  ✓ .obsolete: 删 ${removed} 死标`);
    } else {
      log(`  - .obsolete 无 self 死标`);
    }
  } catch (err) {
    log(`  patch .obsolete 失: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────
// 招 5: 扫端口 :8889~:8988 · 杀 utility 孤儿反代
// ────────────────────────────────────────────────────────────
// 真本源: Win11 wmic 已 deprecated · 优先 PowerShell Get-CimInstance
//         若三招皆失 · 直 taskkill (因 :8889~:8988 端口范围内 listening 必是反代)
function _getPidCmdline(pid) {
  // 法 1: Get-CimInstance (Win10+/Win11 通用)
  try {
    const ps = cp.execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' -EA 0).CommandLine"`,
      { encoding: "utf8", windowsHide: true, timeout: 3000 },
    );
    if (ps && ps.trim()) return ps.trim();
  } catch {}
  // 法 2: wmic (旧 Win)
  try {
    const wmic = cp.execSync(
      `wmic process where ProcessId=${pid} get CommandLine /format:list 2>nul`,
      { encoding: "utf8", windowsHide: true, timeout: 3000 },
    );
    if (wmic && wmic.trim()) return wmic.trim();
  } catch {}
  // 法 3: 直接查进程名 (兜底 · 简单可靠)
  try {
    const tasklist = cp.execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
      encoding: "utf8",
      windowsHide: true,
      timeout: 3000,
    });
    if (tasklist && tasklist.trim()) return tasklist.trim();
  } catch {}
  return "";
}

function step5_killOrphanProxies() {
  log(`招 5: 扫端口 8889~8988 杀孤儿反代`);
  if (process.platform !== "win32") {
    log(`  - 非 win · 跳 (TODO: linux/mac 实现)`);
    return;
  }
  try {
    const netstatOut = cp.execSync("netstat -ano", {
      encoding: "utf8",
      windowsHide: true,
    });
    const lines = netstatOut.split("\n");
    const portToPid = new Map();
    for (let port = 8889; port <= 8988; port++) {
      const portStr = `:${port} `;
      for (const line of lines) {
        if (line.includes(portStr) && line.includes("LISTENING")) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0") {
            portToPid.set(port, pid);
          }
        }
      }
    }
    log(`  找到 ${portToPid.size} 个 listening 端口 (8889~8988)`);
    const killedPids = new Set();
    for (const [port, pid] of portToPid) {
      if (killedPids.has(pid)) continue;
      const cmdline = _getPidCmdline(pid);
      // 真验: utility/NodeService (Windsurf 反代) OR Windsurf.exe (兜底)
      // :8889~:8988 端口范围内 listening 的 Windsurf.exe 必是 dao 反代 utility 子进程
      const isDaoProxy =
        /utility-sub-type=node\.mojom\.NodeService/i.test(cmdline) ||
        /Windsurf\.exe/i.test(cmdline);
      if (!cmdline) {
        // 三招查 cmd 全失 (跨 SID admin 测试场景) · 仍兜底直 kill
        // (因 :8889~:8988 范围内 listening 必为反代 · 不会误伤别 ext)
        log(`  - :${port} PID=${pid} 查 cmd 失 · 兜底直 kill`);
      } else if (!isDaoProxy) {
        log(`  - :${port} PID=${pid} 非 dao 反代 · 跳`);
        continue;
      }
      try {
        cp.execSync(`taskkill /F /PID ${pid}`, {
          stdio: "ignore",
          windowsHide: true,
        });
        log(`  ✓ kill :${port} PID=${pid}`);
        killedPids.add(pid);
      } catch (e) {
        log(`  ✗ kill :${port} PID=${pid} 失: ${e.message}`);
      }
    }
    log(`  total killed: ${killedPids.size}`);
  } catch (err) {
    log(`  扫端口失: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────
// main
// ────────────────────────────────────────────────────────────
async function main() {
  try {
    await step1_sleep();
    step2_rmPhysicalDirs();
    step3_patchExtensionsJson();
    step4_patchObsolete();
    step5_killOrphanProxies();
    log(`★★★ cleanup 毕 · self exit · 真水过无痕 ★★★`);
    process.exit(0);
  } catch (err) {
    log(`FATAL: ${err.stack || err.message}`);
    process.exit(1);
  }
}

main();
