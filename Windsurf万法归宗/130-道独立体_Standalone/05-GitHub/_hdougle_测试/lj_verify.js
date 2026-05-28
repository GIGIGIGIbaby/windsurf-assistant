#!/usr/bin/env node
/**
 * lj_verify.js · 反者道之动 · LJ 40 账号批量验证 (经 :7890)
 * ════════════════════════════════════════════════════════════════════════
 *
 * 「夫唯不争，故莫能与之争」「江海以善下故能为百谷王」
 *
 * 目的:
 *   过 :7890 代理 CONNECT 到 windsurf.com / app.devin.ai
 *   对 ~/.wam/accounts.md 之 LJ 批 40 账号 (line 94-133)
 *   依次试 windsurf.com/_devin-auth/password/login
 *   产出 ~/.wam/lj_alive.json: 活号清单 (含 auth1_token)
 *
 * 输出:
 *   ~/.wam/lj_alive.json    : 活号清单
 *   ~/.wam/lj_dead.json     : 死号清单
 *   stdout                  : 进度 + 摘要
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const net = require("net");
const tls = require("tls");

const ACCOUNTS_FILE = path.join(os.homedir(), ".wam", "accounts.md");
const ALIVE_OUT = path.join(os.homedir(), ".wam", "lj_alive.json");
const DEAD_OUT = path.join(os.homedir(), ".wam", "lj_dead.json");

const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 7890;
const CONCURRENCY = 4; // 别太大避 rate-limit

// ─── 1. 解析 accounts.md · 仅 LJ 批 ──────────────────────────────────────
function loadLJAccounts() {
  const raw = fs.readFileSync(ACCOUNTS_FILE, "utf8");
  const out = [];
  raw.split(/\r?\n/).forEach((line, idx) => {
    const t = line.trim();
    if (!t || !t.includes("@") || !t.includes(" ")) return;
    const [mail, pw] = t.split(/\s+/);
    if (!mail || !pw) return;
    if (!pw.startsWith("LJ")) return; // 只挑 LJ 批
    out.push({ idx: idx + 1, email: mail, password: pw });
  });
  return out;
}

// ─── 2. CONNECT-over-:7890 → TLS → POST · 单次 ──────────────────────────
function postViaProxy(host, urlPath, bodyStr, headers = {}, timeoutMs = 18000) {
  return new Promise((resolve) => {
    const sock = net.connect(PROXY_PORT, PROXY_HOST);
    sock.setTimeout(timeoutMs);
    let phase = "connect";
    let connectBuf = Buffer.alloc(0);

    sock.on("connect", () => {
      sock.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`);
    });

    sock.on("data", (chunk) => {
      if (phase !== "connect") return;
      connectBuf = Buffer.concat([connectBuf, chunk]);
      const sepIdx = connectBuf.indexOf("\r\n\r\n");
      if (sepIdx < 0) return;
      const head = connectBuf.slice(0, sepIdx).toString("utf8");
      if (!head.startsWith("HTTP/1.1 200")) {
        sock.destroy();
        return resolve({ ok: false, error: "CONNECT_failed", head });
      }
      sock.removeAllListeners("data");
      phase = "tls";
      const t = tls.connect(
        { socket: sock, servername: host, rejectUnauthorized: false },
        () => {
          const lines = [
            `POST ${urlPath} HTTP/1.1`,
            `Host: ${host}`,
            `Content-Type: application/json`,
            `Content-Length: ${Buffer.byteLength(bodyStr)}`,
            `User-Agent: WindsurfIDE/1.99.0`,
            `Accept: application/json`,
            `Connection: close`,
          ];
          for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
          lines.push("");
          lines.push(bodyStr);
          t.write(lines.join("\r\n"));
        },
      );
      t.setTimeout(timeoutMs);
      const bufs = [];
      t.on("data", (c) => bufs.push(c));
      t.on("end", () => {
        const raw = Buffer.concat(bufs).toString("utf8");
        const i = raw.indexOf("\r\n\r\n");
        if (i < 0) return resolve({ ok: false, error: "no_body_sep" });
        const headStr = raw.slice(0, i);
        let body = raw.slice(i + 4);
        const m = headStr.match(/^HTTP\/1\.1 (\d+)/);
        const status = m ? parseInt(m[1], 10) : 0;
        // chunked
        if (/transfer-encoding:\s*chunked/i.test(headStr)) {
          const parts = [];
          let p = 0;
          while (p < body.length) {
            const nl = body.indexOf("\r\n", p);
            if (nl < 0) break;
            const sz = parseInt(body.slice(p, nl), 16);
            if (!sz) break;
            parts.push(body.slice(nl + 2, nl + 2 + sz));
            p = nl + 2 + sz + 2;
          }
          body = parts.join("");
        }
        let j = null;
        try {
          j = JSON.parse(body);
        } catch {}
        resolve({ ok: true, status, body: j, raw_body: body });
      });
      t.on("error", (e) => resolve({ ok: false, error: "tls_" + e.message }));
      t.on("timeout", () => {
        t.destroy();
        resolve({ ok: false, error: "tls_timeout" });
      });
    });

    sock.on("error", (e) => resolve({ ok: false, error: "sock_" + e.message }));
    sock.on("timeout", () => {
      sock.destroy();
      resolve({ ok: false, error: "sock_timeout" });
    });
  });
}

// ─── 3. 验单一账号 ──────────────────────────────────────────────────────
async function verifyOne(acc) {
  const body = JSON.stringify({ email: acc.email, password: acc.password });
  const r = await postViaProxy(
    "windsurf.com",
    "/_devin-auth/password/login",
    body,
  );
  if (!r.ok) {
    return { acc, ok: false, err: r.error, stage: "transport" };
  }
  if (r.status !== 200) {
    return {
      acc,
      ok: false,
      err: `http_${r.status}`,
      stage: "http",
      bodySample: r.raw_body?.slice(0, 200),
    };
  }
  const tok = r.body?.token;
  if (!tok) {
    return {
      acc,
      ok: false,
      err: "no_token",
      stage: "payload",
      bodySample: r.raw_body?.slice(0, 200),
    };
  }
  return { acc, ok: true, auth1Token: tok };
}

// ─── 4. 并发池 ──────────────────────────────────────────────────────────
async function runPool(items, fn, concurrency) {
  const results = [];
  let idx = 0;
  let done = 0;
  const total = items.length;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      const r = await fn(items[i], i);
      results[i] = r;
      done++;
      const tag = r.ok ? "✓" : "✗";
      const reason = r.ok ? "auth1=" + r.auth1Token.slice(0, 16) + "..." : r.err;
      console.log(
        `  [${String(done).padStart(2, "0")}/${total}] ${tag} ${r.acc.email.padEnd(40)} ${reason}`,
      );
    }
  }
  const ws = [];
  for (let k = 0; k < concurrency; k++) ws.push(worker());
  await Promise.all(ws);
  return results;
}

// ─── 5. 主流 ───────────────────────────────────────────────────────────
(async () => {
  const t0 = Date.now();
  const ljs = loadLJAccounts();
  console.log(`═══ lj_verify · 反者道之动 ═══`);
  console.log(`accounts file: ${ACCOUNTS_FILE}`);
  console.log(`LJ 批数量    : ${ljs.length}`);
  console.log(`代理         : ${PROXY_HOST}:${PROXY_PORT}`);
  console.log(`并发         : ${CONCURRENCY}\n`);

  if (ljs.length === 0) {
    console.error("no LJ accounts — abort");
    process.exit(1);
  }

  const results = await runPool(ljs, verifyOne, CONCURRENCY);

  const alive = results.filter((r) => r.ok);
  const dead = results.filter((r) => !r.ok);

  // 写出
  fs.writeFileSync(
    ALIVE_OUT,
    JSON.stringify(
      alive.map((r) => ({
        email: r.acc.email,
        password: r.acc.password,
        auth1Token: r.auth1Token,
        verifiedAt: new Date().toISOString(),
      })),
      null,
      2,
    ),
  );
  fs.writeFileSync(
    DEAD_OUT,
    JSON.stringify(
      dead.map((r) => ({
        email: r.acc.email,
        err: r.err,
        stage: r.stage,
        bodySample: r.bodySample,
      })),
      null,
      2,
    ),
  );

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n═══ 结 ═══`);
  console.log(`  alive : ${alive.length}/${results.length}`);
  console.log(`  dead  : ${dead.length}/${results.length}`);
  console.log(`  耗时  : ${elapsed}s`);
  console.log(`  ALIVE 写: ${ALIVE_OUT}`);
  console.log(`  DEAD  写: ${DEAD_OUT}`);

  // 死因分布
  if (dead.length) {
    const errCounts = {};
    dead.forEach((d) => {
      errCounts[d.err] = (errCounts[d.err] || 0) + 1;
    });
    console.log(`\n=== 死因分布 ===`);
    Object.entries(errCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  }

  if (alive.length === 0) {
    console.log(`\n✗ 0 活号 · 检查代理 + 账号有效性`);
    process.exit(2);
  }
  console.log(`\n✓ 活号 ${alive.length} · 可入下一步: 写 hdougle ACCOUNTS secret`);
})();
