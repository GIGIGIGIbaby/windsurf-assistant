// v17.86.3 · water-virtues _elect 仅靠 _pidAlive
// 验: leader pid 仍活时, follower 让位 (即使 ts 已过 TTL)
//     leader pid 死时, follower 接管 (即使 ts 仍 fresh)
// "反者道之动 · 弱者道之用" — 道德经 第四十章
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync, spawn } = require("node:child_process");

let pass = 0,
  fail = 0;
const ok = (name, cond, detail) => {
  const s = cond ? "\u2713" : "\u2717";
  if (cond) pass++;
  else fail++;
  console.log(`  ${s} ${name.padEnd(60)} ${detail || ""}`);
};

console.log("=== v17.86.3 · water-virtues _elect 仅靠 _pidAlive spec ===\n");

const KEY = "__dao_water_virtues__";
const modPath = path.resolve(__dirname, "..", "_water_virtues.js");

// 用 env 隔离 lock + log, 不污染 ~/.wam-hot (v17.86.3 · DAO_WATER_LOCK_FILE)
const TEST_WAM = path.join(os.tmpdir(), "_dao_water_test_" + process.pid);
try {
  fs.mkdirSync(TEST_WAM, { recursive: true });
} catch {}
const TEST_LOG = path.join(TEST_WAM, "water.log");
const TEST_LOCK = path.join(TEST_WAM, ".water_leader.lock");
process.env.DAO_WATER_LOG = TEST_LOG;
process.env.DAO_WATER_LOCK_FILE = TEST_LOCK;

// 启 child node 做 long-lived alive pid (sleep 30s)
const child = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 30000)"], {
  stdio: "ignore",
  detached: false,
});
const ALIVE_PID = child.pid;

function freshLoad() {
  delete global[KEY];
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function writeLock(pid, ts) {
  fs.writeFileSync(TEST_LOCK, JSON.stringify({ pid, ts }));
  return TEST_LOCK;
}

function readLock() {
  try {
    return JSON.parse(fs.readFileSync(TEST_LOCK, "utf8"));
  } catch {
    return null;
  }
}

try {
  // === 一 · leader pid 真活 + ts 老 (远超 TTL) → 让位 (新行为 · v17.86.3 之核) ===
  console.log("\u4e00 · leader pid 活 + ts 老 → 让位");
  const oldTs = Date.now() - 600000; // 10min ago (远超 90s TTL)
  writeLock(ALIVE_PID, oldTs);
  const wv1 = freshLoad();
  const s1 = wv1.snapshot();
  ok(
    "leader pid 活 + ts 老 → follower",
    s1.role === "FOLLOWER",
    `role=${s1.role} (期 FOLLOWER)`,
  );
  const lock1 = readLock();
  ok(
    "lock 仍持原 leader pid (未被夺)",
    lock1 && lock1.pid === ALIVE_PID,
    `lock.pid=${lock1 && lock1.pid} (期 ${ALIVE_PID})`,
  );
  wv1.dispose();

  // === 二 · leader pid 死 + ts fresh (内 TTL) → 让位 (软提示 · 给面子) ===
  console.log("\n\u4e8c · leader pid 死 + ts fresh → 让位 (尊老锁)");
  const deadPid = 999999; // 一极不可能存的 pid
  const freshTs = Date.now() - 5000; // 5s ago (远内 90s TTL)
  writeLock(deadPid, freshTs);
  const wv2 = freshLoad();
  const s2 = wv2.snapshot();
  ok(
    "leader pid 死 + ts fresh → follower (软 OR · 给老锁面子)",
    s2.role === "FOLLOWER",
    `role=${s2.role}`,
  );
  wv2.dispose();

  // === 三 · leader pid 死 + ts 老 → 接管 (双失则争) ===
  console.log("\n\u4e09 · leader pid 死 + ts 老 → 接管");
  writeLock(deadPid, oldTs);
  const wv3 = freshLoad();
  const s3 = wv3.snapshot();
  ok(
    "leader pid 死 + ts 老 → leader (接管)",
    s3.role === "LEADER",
    `role=${s3.role}`,
  );
  const lock3 = readLock();
  ok(
    "lock 已被夺 (pid 改为 self)",
    lock3 && lock3.pid === process.pid,
    `lock.pid=${lock3 && lock3.pid} (期 self=${process.pid})`,
  );
  wv3.dispose();

  // === 四 · 无锁 → 接管 ===
  console.log("\n\u56db · 无锁 → 接管");
  try {
    fs.unlinkSync(path.join(os.homedir(), ".wam-hot", ".water_leader.lock"));
  } catch {}
  const wv4 = freshLoad();
  const s4 = wv4.snapshot();
  ok("无锁 → leader (接管)", s4.role === "LEADER", `role=${s4.role}`);
  wv4.dispose();

  // === 五 · cur.pid === self.pid (重 init 自己持锁) → 仍 leader ===
  console.log("\n\u4e94 · cur.pid === self.pid → 仍 leader");
  writeLock(process.pid, Date.now() - 100);
  const wv5 = freshLoad();
  const s5 = wv5.snapshot();
  ok(
    "cur.pid===self → leader (无人争)",
    s5.role === "LEADER",
    `role=${s5.role}`,
  );
  wv5.dispose();
} finally {
  // 清: kill child + 删 test wam
  try {
    child.kill();
  } catch {}
  try {
    fs.unlinkSync(TEST_LOCK);
  } catch {}
  try {
    fs.rmSync(TEST_WAM, { recursive: true, force: true });
  } catch {}
}

console.log(`\n=== 总: PASS=${pass} FAIL=${fail} ===`);
if (fail > 0) process.exit(1);
