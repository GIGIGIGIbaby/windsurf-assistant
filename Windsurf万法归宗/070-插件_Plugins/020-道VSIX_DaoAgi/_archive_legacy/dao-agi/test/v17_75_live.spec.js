// v17.75 · SSE + /origin/turns + /origin/turn 活端点测
// 启一个临时 源.js · 等端口 · 通 HTTP + SSE 实测 · 结束即杀
"use strict";
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const SRC = path.resolve(
  __dirname,
  "..",
  "vendor",
  "wam",
  "bundled-origin",
  "源.js",
);

// 用随机端口免冲突
const PORT = 18000 + Math.floor(Math.random() * 1000);

let pass = 0,
  fail = 0;
const ok = (l, c, d) => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "\u2713" : "\u2717"} ${l.padEnd(60)} ${d || ""}`);
};

function httpGet(url, ms) {
  return new Promise((r) => {
    const q = http.get(url, { timeout: ms || 2000, agent: false }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return r(null);
      }
      let b = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (b += c));
      res.on("end", () => {
        try {
          r(JSON.parse(b));
        } catch {
          r(null);
        }
      });
    });
    q.on("error", () => r(null));
    q.on("timeout", () => {
      try {
        q.destroy();
      } catch {}
      r(null);
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitListening(port, maxMs) {
  const deadline = Date.now() + maxMs;
  return new Promise(async (resolve) => {
    while (Date.now() < deadline) {
      const ping = await httpGet(`http://127.0.0.1:${port}/origin/ping`, 500);
      if (ping && ping.ok) return resolve(true);
      await sleep(200);
    }
    resolve(false);
  });
}

async function main() {
  console.log(
    "\u2550\u2550\u2550 v17.75 SSE + turns live \u2550\u2550\u2550  port=" +
      PORT,
  );
  const child = spawn("node", [SRC], {
    env: {
      ...process.env,
      ORIGIN_PORT: String(PORT),
      ORIGIN_BIND_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});

  try {
    const up = await waitListening(PORT, 8000);
    ok("proxy listening", up, `port=${PORT}`);
    if (!up) throw new Error("proxy failed to start");

    // 1. /origin/ping · 含 turn 字段
    const ping = await httpGet(`http://127.0.0.1:${PORT}/origin/ping`, 1500);
    ok("ping ok", ping && ping.ok === true);
    ok("ping has turn_count", ping && typeof ping.turn_count === "number");
    ok(
      "ping has turn_capture feature",
      ping && ping.features && ping.features.turn_capture === true,
    );
    ok(
      "ping has sse_stream feature",
      ping && ping.features && ping.features.sse_stream === true,
    );
    ok("ping.sse_clients initially 0", ping && ping.sse_clients === 0);

    // 2. /origin/turns · 空时也应 ok
    const turns = await httpGet(
      `http://127.0.0.1:${PORT}/origin/turns?limit=8`,
      1500,
    );
    ok("turns endpoint ok", turns && turns.ok === true);
    ok("turns empty initially", turns && turns.count === 0);
    ok("turns.turns is array", turns && Array.isArray(turns.turns));
    ok("turns.next_turn_id >= 1", turns && turns.next_turn_id >= 1);

    // 3. /origin/turn · 空时 found=false
    const turn = await httpGet(`http://127.0.0.1:${PORT}/origin/turn`, 1500);
    ok("turn endpoint ok", turn && turn.ok === true);
    ok("turn found=false when empty", turn && turn.found === false);

    // 4. SSE /origin/stream 连接 · 应即收 hello
    const sseEvents = [];
    const sseReq = http.get(
      `http://127.0.0.1:${PORT}/origin/stream?replay=0`,
      { headers: { accept: "text/event-stream" }, agent: false },
      (res) => {
        ok("sse status 200", res.statusCode === 200);
        ok(
          "sse content-type event-stream",
          res.headers["content-type"] &&
            res.headers["content-type"].includes("text/event-stream"),
        );
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          buf += c;
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const raw = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            let evType = "";
            let dataStr = "";
            for (const line of raw.split("\n")) {
              if (line.startsWith("event:")) evType = line.slice(6).trim();
              else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
            }
            let data = null;
            try {
              data = JSON.parse(dataStr);
            } catch {}
            sseEvents.push({ type: evType, data });
          }
        });
      },
    );
    sseReq.on("error", () => {});

    // 5. 等 hello
    await sleep(400);
    ok(
      "sse hello received",
      sseEvents.some((e) => e.type === "hello"),
    );
    const hello = sseEvents.find((e) => e.type === "hello");
    ok("hello has pid", hello && hello.data && hello.data.pid > 0);
    ok("hello mode string", hello && typeof hello.data.mode === "string");

    // 6. ping 应见 sse_clients=1 now
    const ping2 = await httpGet(`http://127.0.0.1:${PORT}/origin/ping`, 1500);
    ok("ping.sse_clients = 1 after connect", ping2 && ping2.sse_clients === 1);

    // 7. POST /origin/mode · 应触发 SSE mode 事件
    await new Promise((resolve) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: PORT,
          path: "/origin/mode",
          method: "POST",
          headers: { "content-type": "application/json" },
        },
        (res) => {
          res.resume();
          res.on("end", resolve);
          res.on("error", resolve);
        },
      );
      req.on("error", resolve);
      req.write(JSON.stringify({ mode: "passthrough" }));
      req.end();
    });
    await sleep(300);
    const modeEv = sseEvents.find((e) => e.type === "mode");
    ok("sse mode event received", !!modeEv);
    ok(
      "mode event has mode=passthrough",
      modeEv && modeEv.data && modeEv.data.mode === "passthrough",
    );

    // 清场 · 还原模式为 invert (道默认) · 防污染 _origin_mode.txt
    await new Promise((resolve) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: PORT,
          path: "/origin/mode",
          method: "POST",
          headers: { "content-type": "application/json" },
        },
        (res) => {
          res.resume();
          res.on("end", resolve);
          res.on("error", resolve);
        },
      );
      req.on("error", resolve);
      req.write(JSON.stringify({ mode: "invert" }));
      req.end();
    });
    sseReq.destroy();
    await sleep(200);
  } finally {
    child.kill("SIGTERM");
    await sleep(300);
    try {
      child.kill("SIGKILL");
    } catch {}
  }

  console.log(
    "\n  PASS=" + pass + "  FAIL=" + fail + "  TOTAL=" + (pass + fail),
  );
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
