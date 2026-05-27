// v18.0 · 进程内化测 · ext-host 直 require + start({port,host}) → handle
//
// 反者道之动. 损 spawn detached 之根 · 进程内 server · 共生死.
// 此测验:
//   1. require 不副作用 (顶层无 listen)
//   2. start({port}) 返 handle · listen 真起
//   3. handle.close() 真停 · port 释
//   4. setMode/getMode 闭环
//   5. 二次 start 复用 server (同 instance)
//   6. require.cache delete 后 re-require · listen 不双
//
// 道法自然 · 验之 · 不假设

"use strict";
const path = require("node:path");
const http = require("node:http");

const D = path.resolve(__dirname, "..");
const YUAN_PATH = path.join(D, "vendor/wam/bundled-origin/源.js");

let pass = 0,
  fail = 0;
function ok(name, cond, hint) {
  if (cond) {
    pass++;
    console.log("  ✓ " + name + (hint ? "    " + hint : ""));
  } else {
    fail++;
    console.log("  ✗ " + name + (hint ? "    " + hint : ""));
  }
}

function isPortOpen(port, host) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: host || "127.0.0.1",
        port,
        path: "/origin/ping",
        method: "GET",
        timeout: 800,
      },
      (res) => {
        res.resume();
        resolve(true);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

(async () => {
  console.log("\n═══ v18.0 · 进程内化 · ext-host 共生死 ═══\n");

  // 一 · require 不副作用 · 写临时 .js 文件后 spawnSync · 避 PowerShell escape
  // v18.1.1 · 道法自然 · 不夺天工: 本机或活 dao-agi 占 8889 时, 验"require 不改既存态"
  //          (require 前 open=A · require 后 open=B · 等 ↔ 子进程 require 未触端口)
  console.log("一 · require 不副作用 (顶层 server.listen 已 gate · 不夺既生)");
  const fs = require("node:fs");
  const os = require("node:os");
  const { spawnSync } = require("node:child_process");
  // 1.0 · 父进程先观 :8889 既存态 (有人已 listen 即"既生"·不动)
  const wasOpenBefore = await isPortOpen(8889);
  const tmpJs = path.join(os.tmpdir(), `dao-v18-probe-${Date.now()}.js`);
  const probeBody = [
    "const yuan = require(" + JSON.stringify(YUAN_PATH) + ");",
    "const http = require('node:http');",
    "const probe = (port) => new Promise((r) => {",
    "  const req = http.request({port, path:'/origin/ping', timeout:300}, (res)=>{res.resume();r(true)});",
    "  req.on('error', ()=>r(false));",
    "  req.on('timeout', ()=>{req.destroy();r(false)});",
    "  req.end();",
    "});",
    "probe(8889).then(open => {",
    "  console.log(JSON.stringify({",
    "    hasStart: typeof yuan.start === 'function',",
    "    hasStop: typeof yuan.stop === 'function',",
    "    hasGetMode: typeof yuan.getMode === 'function',",
    "    portOpen: open",
    "  }));",
    "  process.exit(0);",
    "});",
  ].join("\n");
  fs.writeFileSync(tmpJs, probeBody);
  const r = spawnSync("node", [tmpJs], {
    cwd: D,
    encoding: "utf8",
    timeout: 5000,
  });
  try {
    fs.unlinkSync(tmpJs);
  } catch {}
  let probe = {};
  try {
    const lastLine = (r.stdout || "").trim().split(/\r?\n/).pop();
    probe = JSON.parse(lastLine);
  } catch (e) {
    console.log("    probe stdout=" + (r.stdout || "").slice(0, 200));
    console.log("    probe stderr=" + (r.stderr || "").slice(0, 200));
  }
  ok("1.1 require 之 yuan.start 是 function", probe.hasStart === true);
  ok("1.2 require 之 yuan.stop 是 function", probe.hasStop === true);
  ok("1.3 require 之 yuan.getMode 是 function", probe.hasGetMode === true);
  // 1.4 · 反者道之动 · 不破既生: 只验 require 不改 :8889 既存态
  //   既存 free → require 后仍 free (子 require 未起 server)
  //   既存 busy (本机活 windsurf proxy) → require 后仍 busy (子 require 不夺亦不破)
  ok(
    "1.4 require 不改 :8889 既存态 (顶层无副作用 · 不夺天工)",
    probe.portOpen === wasOpenBefore,
    `before=${wasOpenBefore} after=${probe.portOpen}`,
  );

  // 二 · start({port}) 返 handle · listen 起
  console.log("\n二 · start({port}) 真起 · :PORT 监听");
  // 清 require cache 防与上面 child 共
  try {
    delete require.cache[require.resolve(YUAN_PATH)];
  } catch {}
  const yuan = require(YUAN_PATH);
  // 选随机 port 防与本机活 windsurf proxy 撞
  const TEST_PORT = 18889 + Math.floor(Math.random() * 1000);

  let handle;
  try {
    handle = await yuan.start({ port: TEST_PORT, host: "127.0.0.1" });
  } catch (e) {
    fail++;
    console.log("  ✗ 2.x start() 抛: " + e.message);
    process.exit(1);
  }
  ok(
    "2.1 start() resolve 之 handle 含 server",
    handle && handle.server && typeof handle.server.address === "function",
  );
  ok("2.2 handle.port = " + TEST_PORT, handle && handle.port === TEST_PORT);
  ok(
    "2.3 handle.close 是 function",
    handle && typeof handle.close === "function",
  );
  ok(
    "2.4 handle.getMode 是 function",
    handle && typeof handle.getMode === "function",
  );
  ok(
    "2.5 handle.setMode 是 function",
    handle && typeof handle.setMode === "function",
  );

  const isOpen = await isPortOpen(TEST_PORT);
  ok("2.6 :" + TEST_PORT + " 真监听 (HTTP 应), GET /origin/ping ok", isOpen);

  // 三 · setMode/getMode 闭环
  console.log("\n三 · 模式闭环 · setMode/getMode");
  const m0 = handle.getMode();
  ok(
    "3.1 初始 mode 合法 (invert|passthrough)",
    m0 === "invert" || m0 === "passthrough",
    "mode=" + m0,
  );
  const okSet = handle.setMode("passthrough");
  ok("3.2 setMode('passthrough') 返 true", okSet === true);
  ok("3.3 getMode 后即 passthrough", handle.getMode() === "passthrough");
  const okSet2 = handle.setMode("INVALID_MODE");
  ok("3.4 setMode('INVALID') 返 false (拒非法)", okSet2 === false);
  handle.setMode(m0); // 还原

  // 四 · close() 真停 · port 释
  console.log("\n四 · close() 真停 · port 释");
  await handle.close();
  await new Promise((r) => setTimeout(r, 200));
  const stillOpen = await isPortOpen(TEST_PORT);
  ok(
    "4.1 close() 后 :" + TEST_PORT + " 不再监听",
    stillOpen === false,
    "stillOpen=" + stillOpen,
  );

  // 五 · 二次 start 复用 (clear cache 后 re-require 才能再 listen · 否则 server 已 close)
  console.log("\n五 · re-require + start 重立");
  try {
    delete require.cache[require.resolve(YUAN_PATH)];
  } catch {}
  const yuan2 = require(YUAN_PATH);
  const TEST_PORT2 = TEST_PORT + 1;
  const handle2 = await yuan2.start({ port: TEST_PORT2, host: "127.0.0.1" });
  ok(
    "5.1 re-require 后 start :" + TEST_PORT2 + " 成功",
    handle2 && handle2.port === TEST_PORT2,
  );
  const open2 = await isPortOpen(TEST_PORT2);
  ok("5.2 :" + TEST_PORT2 + " 监听ok", open2);
  await handle2.close();
  await new Promise((r) => setTimeout(r, 200));

  // 六 · 五个 process.on hooks 不应被 require 副作用注册
  console.log("\n六 · process.on hooks 隔离 (require 不污染父进程)");
  const beforeListeners = {
    exit: process.listenerCount("exit"),
    SIGTERM: process.listenerCount("SIGTERM"),
    SIGINT: process.listenerCount("SIGINT"),
    uncaughtException: process.listenerCount("uncaughtException"),
    unhandledRejection: process.listenerCount("unhandledRejection"),
  };
  try {
    delete require.cache[require.resolve(YUAN_PATH)];
  } catch {}
  require(YUAN_PATH);
  const afterListeners = {
    exit: process.listenerCount("exit"),
    SIGTERM: process.listenerCount("SIGTERM"),
    SIGINT: process.listenerCount("SIGINT"),
    uncaughtException: process.listenerCount("uncaughtException"),
    unhandledRejection: process.listenerCount("unhandledRejection"),
  };
  for (const k of Object.keys(beforeListeners)) {
    ok(
      "6." + k + " require 后 listener 数不增 (CLI 隔离)",
      afterListeners[k] === beforeListeners[k],
      "before=" + beforeListeners[k] + " after=" + afterListeners[k],
    );
  }

  console.log(`\n═══ v18.0 进程内化 总: PASS=${pass} FAIL=${fail} ═══`);
  if (fail === 0)
    console.log("✓ 全通 · ext-host 共生死 · 损 spawn detached 之根 · 道法自然");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
