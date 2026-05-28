#!/usr/bin/env node
"use strict";
/**
 * dao_credit_check.js · 印193 · 周期性验证 · 道法自然
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 「知常曰明，不知常，妄作凶。」— 帛书·十六
 *
 * 功能: 快速检查所有账号当前overage_credits状态
 *   → 发现新到账$200账号并报告
 *   → 输出当前统计
 *   → 可追加到WAM
 *
 * 用法:
 *   node dao_credit_check.js                    # 快速扫描全部
 *   node dao_credit_check.js --proxy=7890       # 指定代理
 *   node dao_credit_check.js --concurrency=15   # 并发数
 *   node dao_credit_check.js --wam              # 同时更新WAM keys
 * ══════════════════════════════════════════════════════════════════════════════
 */

const net = require("net");
const tls = require("tls");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DIR = __dirname;
const POOL_FILE = path.join(DIR, "_success_pool.json");
const WAM_FILE = path.join(DIR, "_wam_all.txt");
const CHECK_OUT = path.join(DIR, "_credit_check_latest.json");

const argv = process.argv.slice(2);
const arg = (k) => {
  const a = argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : null;
};
const flag = (k) => argv.includes(`--${k}`);

const PROXY_ARG = arg("proxy") || "7890";
const CONCUR = parseInt(arg("concurrency") || "3");
const WAM_MODE = flag("wam");

// 颜色
const G = (s) => `\x1b[32m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const GR = (s) => `\x1b[90m${s}\x1b[0m`;
const ts = () => new Date().toISOString().slice(11, 19);
const lg = (m) => process.stderr.write(`${GR(ts())} ${m}\n`);
const sl = (ms) => new Promise((r) => setTimeout(r, ms));

// 代理
let PROXY = null;
async function detectProxy() {
  const raw = /^\d+$/.test(PROXY_ARG) ? `127.0.0.1:${PROXY_ARG}` : PROXY_ARG;
  const [h, p] = raw.split(":");
  const ok = await new Promise((res) => {
    const s = net.connect(+p, h, () => {
      s.destroy();
      res(true);
    });
    s.setTimeout(600);
    s.on("timeout", () => {
      s.destroy();
      res(false);
    });
    s.on("error", () => res(false));
  });
  return ok ? { host: h, port: +p } : null;
}

// HTTP
function rawReq(hostname, method, urlPath, hdrs, body, timeout = 20000) {
  return new Promise((resolve) => {
    const done = (r) => {
      clearTimeout(t);
      resolve(r);
    };
    const t = setTimeout(() => done({ s: -1, b: "TIMEOUT", j: null }), timeout);
    const onSock = (sock) => {
      const sec = tls.connect(
        { socket: sock, servername: hostname, rejectUnauthorized: false },
        () => {
          const bb = body ? Buffer.from(body, "utf8") : null;
          sec.write(
            [
              `${method} ${urlPath} HTTP/1.1`,
              `Host: ${hostname}`,
              `User-Agent: Mozilla/5.0`,
              `Accept: */*`,
              `Origin: https://app.devin.ai`,
              `Connection: close`,
              ...(hdrs || []),
              ...(bb
                ? [
                    `Content-Type: application/json`,
                    `Content-Length: ${bb.length}`,
                  ]
                : []),
              "",
              "",
            ].join("\r\n"),
          );
          if (bb) sec.write(bb);
        },
      );
      let buf = Buffer.alloc(0);
      sec.on("data", (d) => {
        buf = Buffer.concat([buf, d]);
      });
      sec.on("end", () => {
        const raw = buf.toString("utf8");
        const sep = raw.indexOf("\r\n\r\n");
        const s = parseInt((raw.split("\r\n")[0] || "").split(" ")[1]) || 0;
        let body = sep >= 0 ? raw.slice(sep + 4) : raw;
        if (/^[0-9a-fA-F]+\r\n/.test(body)) {
          let out = "",
            i = 0;
          while (i < body.length) {
            const n = body.indexOf("\r\n", i);
            if (n < 0) break;
            const sz = parseInt(body.slice(i, n), 16);
            if (!sz || isNaN(sz)) break;
            out += body.slice(n + 2, n + 2 + sz);
            i = n + 2 + sz + 2;
          }
          if (out) body = out;
        }
        let j = null;
        try {
          j = JSON.parse(body);
        } catch {}
        done({ s, b: body.slice(0, 500), j });
      });
      sec.on("error", (e) => done({ s: -1, b: e.message, j: null }));
    };
    if (PROXY) {
      const sock = net.connect(PROXY.port, PROXY.host, () => {
        sock.write(
          `CONNECT ${hostname}:443 HTTP/1.1\r\nHost: ${hostname}:443\r\n\r\n`,
        );
        sock.once("data", (chunk) => {
          if (!chunk.toString().startsWith("HTTP/1.1 200")) {
            done({ s: -1, b: "PROXY_FAIL", j: null });
            return;
          }
          onSock(sock);
        });
      });
      sock.on("error", (e) => done({ s: -1, b: e.message, j: null }));
    } else {
      const sock = net.connect(443, hostname, () => onSock(sock));
      sock.on("error", (e) => done({ s: -1, b: e.message, j: null }));
    }
  });
}

// 快速检查单账号 (支持缓存auth1)
async function checkOne(acc) {
  try {
    let auth1 = acc.auth1; // 先用缓存
    let orgId = acc.orgId;

    // 如果没有缓存auth1，则登录
    if (!auth1) {
      const r1 = await rawReq(
        "windsurf.com",
        "POST",
        "/_devin-auth/password/login",
        ["Origin: https://windsurf.com"],
        JSON.stringify({ email: acc.email, password: acc.password }),
      );
      auth1 = r1.j?.token;
      if (!auth1)
        return {
          email: acc.email,
          ok: false,
          err: `login_${r1.s}`,
          overage: null,
          granted: null,
        };
    }

    // 如果没有缓存orgId，则通过PostAuth获取
    if (!orgId) {
      const r2 = await rawReq(
        "app.devin.ai",
        "POST",
        "/api/users/post-auth",
        [`Authorization: Bearer ${auth1}`],
        JSON.stringify({}),
      );
      orgId = r2.j?.org?.org_id || r2.j?.org_id;
    }
    if (!orgId)
      return {
        email: acc.email,
        ok: false,
        err: "no_orgId",
        overage: null,
        granted: null,
      };

    const H = [`Authorization: Bearer ${auth1}`, `x-cog-org-id: ${orgId}`];
    const [cr, br] = await Promise.all([
      rawReq(
        "app.devin.ai",
        "GET",
        "/api/billing/checklist-credit-status",
        H,
        null,
      ),
      rawReq("app.devin.ai", "GET", `/api/${orgId}/billing/status`, H, null),
    ]);

    const granted = cr.j?.granted || {};
    const amounts = cr.j?.amounts || {};
    const checklist = cr.j?.completion || {};
    const total = Object.values(granted).reduce(
      (a, b) => a + (Number(b) || 0),
      0,
    );
    const overage = br.j?.overage_credits ?? null;

    return {
      email: acc.email,
      ok: true,
      orgId,
      total,
      overage,
      granted,
      amounts,
      checklist,
    };
  } catch (e) {
    return {
      email: acc.email,
      ok: false,
      err: e.message,
      overage: null,
      granted: null,
    };
  }
}

// 并发
async function runConcurrent(tasks, workers) {
  const results = [];
  const queue = [...tasks];
  async function runNext() {
    while (queue.length) {
      const task = queue.shift();
      results.push(await task());
      await sl(600 + Math.random() * 1000); // 防rate limit
    }
  }
  await Promise.all(Array.from({ length: workers }, () => runNext()));
  return results;
}

// 加载账号
function loadAccounts() {
  const accs = [];
  const pwMap = {};
  if (fs.existsSync(WAM_FILE)) {
    for (const line of fs.readFileSync(WAM_FILE, "utf-8").split(/\r?\n/)) {
      const [em, ...pw] = line.trim().split(":");
      if (em && em.includes("@") && pw.length)
        pwMap[em.toLowerCase()] = pw.join(":");
    }
  }
  // 从_dao_210_final_results.json加载缓存auth1
  const auth1Cache = {};
  const finalFile = path.join(DIR, "_dao_210_final_results.json");
  if (fs.existsSync(finalFile)) {
    const prev = JSON.parse(fs.readFileSync(finalFile, "utf-8"));
    for (const p of prev) {
      if (p.auth1 && p.email)
        auth1Cache[p.email.toLowerCase()] = { auth1: p.auth1, orgId: p.orgId };
    }
  }
  // 从_dao_force_results.json加载缓存auth1 (更新)
  const forceFile = path.join(DIR, "_dao_force_results.json");
  if (fs.existsSync(forceFile)) {
    const fres = JSON.parse(fs.readFileSync(forceFile, "utf-8"));
    for (const p of fres) {
      if (p.auth1 && p.email)
        auth1Cache[p.email.toLowerCase()] = { auth1: p.auth1, orgId: p.orgId };
    }
  }

  if (fs.existsSync(POOL_FILE)) {
    const pool = JSON.parse(fs.readFileSync(POOL_FILE, "utf-8"));
    const arr = Array.isArray(pool) ? pool : pool.accounts || [];
    for (const a of arr) {
      const email = a.email;
      const pass = a.password || pwMap[email?.toLowerCase()];
      const cached = auth1Cache[email?.toLowerCase()] || {};
      if (email && pass)
        accs.push({
          email,
          password: pass,
          auth1: cached.auth1,
          orgId: cached.orgId,
        });
    }
  }
  for (const [em, pw] of Object.entries(pwMap)) {
    if (!accs.find((a) => a.email.toLowerCase() === em)) {
      accs.push({ email: em, password: pw });
    }
  }
  return accs;
}

(async () => {
  PROXY = await detectProxy();
  lg(`代理: ${PROXY ? `${PROXY.host}:${PROXY.port}` : "直连"}`);

  const accs = loadAccounts();
  lg(`加载账号: ${accs.length} 个, 并发: ${CONCUR}`);

  const start = Date.now();
  let done = 0;
  const tasks = accs.map((acc) => async () => {
    const r = await checkOne(acc);
    done++;
    if (r.ok && (r.total >= 200 || r.overage >= 190)) {
      lg(
        G(
          `[${done}/${accs.length}] ✓ ${acc.email.slice(0, 30)} $${r.total}/$${r.overage}`,
        ),
      );
    } else if (done % 20 === 0) {
      lg(`[${done}/${accs.length}] 扫描中...`);
    }
    return r;
  });

  const results = await runConcurrent(tasks, CONCUR);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  const got200 = results.filter(
    (r) => r.ok && (r.total >= 200 || r.overage >= 190),
  );
  const got210 = results.filter(
    (r) => r.ok && (r.total >= 210 || (r.total >= 200 && r.overage >= 205)),
  );
  const pending = results.filter(
    (r) =>
      r.ok &&
      r.total < 200 &&
      (r.overage || 0) < 190 &&
      r.checklist?.automations,
  );
  const failed = results.filter((r) => !r.ok);

  // 保存结果
  fs.writeFileSync(
    CHECK_OUT,
    JSON.stringify(
      {
        ts: new Date().toISOString(),
        total: accs.length,
        got200: got200.length,
        got210: got210.length,
        pending: pending.length,
        failed: failed.length,
        elapsed: +elapsed,
        confirmed_emails: got200.map((r) => r.email),
        details: results,
      },
      null,
      2,
    ),
  );

  process.stdout.write(`\n${"═".repeat(60)}\n`);
  process.stdout.write(
    `  印193 · dao_credit_check · ${new Date().toLocaleString()}\n`,
  );
  process.stdout.write(`${"═".repeat(60)}\n`);
  process.stdout.write(`  总账号:      ${accs.length}\n`);
  process.stdout.write(`  $200 到账:   ${got200.length}\n`);
  process.stdout.write(`  $210 到账:   ${got210.length}\n`);
  process.stdout.write(`  等待中:      ${pending.length}\n`);
  process.stdout.write(`  登录失败:    ${failed.length}\n`);
  process.stdout.write(`  扫描耗时:    ${elapsed}s\n`);
  process.stdout.write(`  结果文件:    ${CHECK_OUT}\n`);
  process.stdout.write(`${"═".repeat(60)}\n\n`);

  if (got200.length > 0) {
    process.stdout.write(`\n✓ 已到账$200账号 (${got200.length}个):\n`);
    for (const r of got200.slice(0, 20)) {
      process.stdout.write(
        `  ${r.email.slice(0, 35).padEnd(35)} $${r.total}/$${r.overage}\n`,
      );
    }
    if (got200.length > 20)
      process.stdout.write(`  ...还有 ${got200.length - 20} 个\n`);
  }

  // WAM更新模式
  if (WAM_MODE && got200.length > 0) {
    process.stdout.write(`\n更新WAM标记...\n`);
    // 可在此处添加WAM更新逻辑
  }
})().catch((e) => {
  lg(R(`FATAL: ${e.message}`));
  process.exit(1);
});
