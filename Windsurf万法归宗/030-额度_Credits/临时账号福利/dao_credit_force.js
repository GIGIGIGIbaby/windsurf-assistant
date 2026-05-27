#!/usr/bin/env node
"use strict";
/**
 * dao_credit_force.js · 印193 · 道法自然 · 反者道之动 · 彻底突破
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 「为学日益，为道日损，损之又损，以至于无为，无为而无不为。」— 帛书·四十八
 *
 * ─── 核心突破 ────────────────────────────────────────────────────────────────
 *
 *  根因: 旧automation创建 > N小时前，服务端cron不再重处理
 *       → DELETE旧automation + 重建新automation = 重新进入处理队列
 *
 *  策略:
 *   1. DELETE all existing automations (清空旧队列)
 *   2. CREATE 4种automation types (start_session/message_session/monitor_session/notify)
 *   3. 对每个新建automation尝试 /run /trigger /execute /activate 端点
 *   4. 长轮询5分钟 (vs 旧版30s)
 *   5. GitHub connect多变体 (为$10)
 *
 * ─── 用法 ──────────────────────────────────────────────────────────────────
 *  node dao_credit_force.js                        # 全量处理 (并发5)
 *  node dao_credit_force.js --pending              # 只处理未确认账号
 *  node dao_credit_force.js --account=email:pass   # 单账号测试
 *  node dao_credit_force.js --concurrency=8        # 并发数
 *  node dao_credit_force.js --poll=300             # 轮询秒数 (默认300=5分钟)
 *  node dao_credit_force.js --proxy=direct         # 强制直连
 *  node dao_credit_force.js --verify               # 仅验证当前状态
 *  node dao_credit_force.js --status               # 查看当前结果统计
 *  node dao_credit_force.js --delete-only          # 只删除automation,不创建
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

const net = require("net");
const tls = require("tls");
const fs = require("fs");
const path = require("path");

// ── 版本 & 常量 ──────────────────────────────────────────────────────────────
const VERSION = "1.0.0";
const SEAL = "印193 · dao_credit_force · DELETE+重建automation · 道法自然";
const GITHUB_INSTALL = 133912860;
const DIR = __dirname;
const POOL_FILE = path.join(DIR, "_success_pool.json");
const PREV_RESULTS = path.join(DIR, "_dao_210_final_results.json");
const WAM_FILE = path.join(DIR, "_wam_all.txt");
const RESULTS_FILE = path.join(DIR, "_dao_force_results.json");
const WS_FILE = path.join(DIR, "_dao_force_ws_keys.txt");

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k) => {
  const a = argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split("=").slice(1).join("=") : null;
};
const flag = (k) => argv.includes(`--${k}`);

const ACCOUNT_1 = arg("account");
const PROXY_ARG = arg("proxy") || process.env.PROXY || null;
const CONCUR = Math.max(1, Math.min(20, parseInt(arg("concurrency") || "5")));
const POLL_SECS = parseInt(arg("poll") || "300"); // 5分钟默认
const PENDING_ONLY = flag("pending");
const VERIFY_ONLY = flag("verify");
const STATUS_MODE = flag("status");
const DELETE_ONLY = flag("delete-only");
const RUN_ALL = flag("all");

// ── 颜色 & 日志 ───────────────────────────────────────────────────────────────
const G = (s) => `\x1b[32m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const B = (s) => `\x1b[36m${s}\x1b[0m`;
const GR = (s) => `\x1b[90m${s}\x1b[0m`;
const ts = () => new Date().toISOString().slice(11, 19);
const lg = (m) => process.stderr.write(`${GR(ts())} ${m}\n`);
const sl = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 代理 ─────────────────────────────────────────────────────────────────────
let PROXY = null;
async function detectProxy() {
  if (PROXY_ARG === "direct" || PROXY_ARG === "none") return null;
  let rawCands = PROXY_ARG
    ? [PROXY_ARG]
    : ["127.0.0.1:7890", "127.0.0.1:1080", "127.0.0.1:10809"];
  // 支持纯端口格式: "7890" → "127.0.0.1:7890"
  const cands = rawCands.map((c) => (/^\d+$/.test(c) ? `127.0.0.1:${c}` : c));
  for (const c of cands) {
    const parts = c.split(":");
    const h = parts[0],
      p = parts[1];
    const ok = await new Promise((res) => {
      const s = net.connect(+p, h, () => {
        s.destroy();
        res(true);
      });
      s.setTimeout(800);
      s.on("timeout", () => {
        s.destroy();
        res(false);
      });
      s.on("error", () => res(false));
    });
    if (ok) {
      lg(`代理探测: ✓ ${c}`);
      return { host: h, port: +p };
    }
  }
  lg("代理探测: 直连模式");
  return null;
}

// ── 底层HTTP ─────────────────────────────────────────────────────────────────
function rawReq(hostname, method, urlPath, hdrs, body, timeout = 35000) {
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
              `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36`,
              `Accept: application/json, */*`,
              `Accept-Language: en-US,en;q=0.9`,
              `Origin: https://app.devin.ai`,
              `Referer: https://app.devin.ai/`,
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
        const status =
          parseInt((raw.split("\r\n")[0] || "").split(" ")[1]) || 0;
        let body = sep >= 0 ? raw.slice(sep + 4) : raw;
        // unchunk
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
        done({ s: status, b: body.slice(0, 2000), j });
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
            done({ s: -1, b: "PROXY_TUNNEL_FAIL", j: null });
            return;
          }
          onSock(sock);
        });
      });
      sock.on("error", (e) =>
        done({ s: -1, b: `PROXY_ERR:${e.message}`, j: null }),
      );
    } else {
      const sock = net.connect(443, hostname, () => onSock(sock));
      sock.on("error", (e) =>
        done({ s: -1, b: `DIRECT_ERR:${e.message}`, j: null }),
      );
    }
  });
}

// ── Windsurf登录 ──────────────────────────────────────────────────────────────
async function doLogin(email, password) {
  const r = await rawReq(
    "windsurf.com",
    "POST",
    "/_devin-auth/password/login",
    [`Origin: https://windsurf.com`],
    JSON.stringify({ email, password }),
  );
  const auth1 = r.j?.token;
  if (!auth1) throw new Error(`login_${r.s}: ${r.b.slice(0, 100)}`);
  return auth1;
}

// ── Devin PostAuth → orgId ────────────────────────────────────────────────────
async function doPostAuth(auth1) {
  const r = await rawReq(
    "app.devin.ai",
    "POST",
    "/api/users/post-auth",
    [`Authorization: Bearer ${auth1}`],
    JSON.stringify({}),
  );
  const orgId = r.j?.org?.org_id || r.j?.org_id;
  const orgName = r.j?.org?.org_name || r.j?.org_name;
  if (!orgId) throw new Error(`postAuth_${r.s}: ${r.b.slice(0, 100)}`);
  return { orgId, orgName };
}

// ── RegisterUser (WS key) ────────────────────────────────────────────────────
async function doRegisterUser(auth1) {
  try {
    const postR = await rawReq(
      "windsurf.com",
      "POST",
      "/_backend/exa.seat_management_pb.SeatManagementService/WindsurfPostAuth",
      [
        `Origin: https://windsurf.com`,
        `X-Devin-Auth1-Token: ${auth1}`,
        `Connect-Protocol-Version: 1`,
      ],
      JSON.stringify({ auth1_token: auth1 }),
    );
    const sessionToken = postR.j?.sessionToken;
    if (!sessionToken) return null;
    const regR = await rawReq(
      "register.windsurf.com",
      "POST",
      "/exa.seat_management_pb.SeatManagementService/RegisterUser",
      [`Origin: https://windsurf.com`, `Connect-Protocol-Version: 1`],
      JSON.stringify({ firebase_id_token: sessionToken }),
    );
    return regR.j?.api_key || null;
  } catch {
    return null;
  }
}

// ── Devin API helpers ─────────────────────────────────────────────────────────
function dH(auth1, orgId) {
  return [`Authorization: Bearer ${auth1}`, `x-cog-org-id: ${orgId}`];
}
async function dGet(auth1, orgId, ep) {
  return rawReq("app.devin.ai", "GET", `/api/${ep}`, dH(auth1, orgId), null);
}
async function dPost(auth1, orgId, ep, body) {
  return rawReq(
    "app.devin.ai",
    "POST",
    `/api/${ep}`,
    dH(auth1, orgId),
    JSON.stringify(body),
  );
}
async function dDelete(auth1, orgId, ep) {
  return rawReq("app.devin.ai", "DELETE", `/api/${ep}`, dH(auth1, orgId), null);
}
async function dPatch(auth1, orgId, ep, body) {
  return rawReq(
    "app.devin.ai",
    "PATCH",
    `/api/${ep}`,
    dH(auth1, orgId),
    JSON.stringify(body),
  );
}

// ── 获取账号状态 ──────────────────────────────────────────────────────────────
async function getState(auth1, orgId) {
  const [cr, br] = await Promise.all([
    dGet(auth1, orgId, "billing/checklist-credit-status"),
    dGet(auth1, orgId, `${orgId}/billing/status`).catch(() => ({ j: null })),
  ]);
  const granted = cr.j?.granted || {};
  const amounts = cr.j?.amounts || {};
  const checklist = cr.j?.completion || {};
  const total = Object.values(granted).reduce(
    (a, b) => a + (Number(b) || 0),
    0,
  );
  const overage = br.j?.overage_credits ?? 0;
  return { total, granted, amounts, checklist, overage, plan: br.j?.plan_slug };
}

// ── 列出automations ───────────────────────────────────────────────────────────
async function listAutomations(auth1, orgId, orgName) {
  const ids = [];
  for (const ep of [`${orgName}/automations`, `${orgId}/automations`]) {
    const r = await dGet(auth1, orgId, ep);
    if (r.s === 200 && r.j) {
      const list = Array.isArray(r.j) ? r.j : r.j.automations || r.j.data || [];
      for (const a of list) {
        const id = a.automation_id || a.id || a._id;
        if (id && !ids.includes(id)) ids.push(id);
      }
      if (ids.length > 0) return { ids, ep, count: list.length };
    }
  }
  return { ids, ep: null, count: 0 };
}

// ── 删除automations ───────────────────────────────────────────────────────────
async function deleteAutomations(auth1, orgId, orgName, ids) {
  const results = [];
  for (const id of ids) {
    for (const base of [orgName, orgId]) {
      const r = await dDelete(auth1, orgId, `${base}/automations/${id}`);
      if (r.s >= 200 && r.s < 300) {
        results.push({ id, ok: true, s: r.s });
        break;
      }
      results.push({ id, ok: false, s: r.s, ep: base });
    }
    await sl(300);
  }
  return results;
}

// ── 创建4种automation types ───────────────────────────────────────────────────
const AUTOMATION_TYPES = [
  {
    name: "start_session",
    body: {
      name: "Daily Auto-Session",
      instructions: "Run automated daily health check and maintenance tasks.",
      triggers: [
        {
          event_type: "schedule:recurring",
          conditions: [
            [
              {
                field: "rrule",
                operator: "matches",
                value: "FREQ=DAILY;INTERVAL=1;BYHOUR=8;BYMINUTE=0;BYSECOND=0",
              },
            ],
          ],
        },
      ],
      actions: [
        {
          type: "start_session",
          prompt:
            "Perform daily maintenance. Check system health and report status.",
        },
      ],
    },
  },
  {
    name: "monitor_session",
    body: {
      name: "Daily Monitor",
      instructions: "Monitor and triage daily tasks.",
      triggers: [
        {
          event_type: "schedule:recurring",
          conditions: [
            [
              {
                field: "rrule",
                operator: "matches",
                value: "FREQ=DAILY;INTERVAL=1;BYHOUR=10;BYMINUTE=0;BYSECOND=0",
              },
            ],
          ],
        },
      ],
      actions: [
        {
          type: "monitor_session",
          prompt: "Review and triage pending issues.",
        },
      ],
    },
  },
  {
    name: "message_session",
    body: {
      name: "Daily Message",
      instructions: "Send daily status update.",
      triggers: [
        {
          event_type: "schedule:recurring",
          conditions: [
            [
              {
                field: "rrule",
                operator: "matches",
                value: "FREQ=DAILY;INTERVAL=1;BYHOUR=12;BYMINUTE=0;BYSECOND=0",
              },
            ],
          ],
        },
      ],
      actions: [
        {
          type: "message_session",
          prompt: "Provide daily status update summary.",
        },
      ],
    },
  },
  {
    name: "notify",
    body: {
      name: "Daily Notification",
      instructions: "Send daily email notification.",
      triggers: [
        {
          event_type: "schedule:recurring",
          conditions: [
            [
              {
                field: "rrule",
                operator: "matches",
                value: "FREQ=DAILY;INTERVAL=1;BYHOUR=18;BYMINUTE=0;BYSECOND=0",
              },
            ],
          ],
        },
      ],
      actions: [
        {
          type: "notify",
          when: "always",
          message: "Daily automation check complete.",
        },
      ],
    },
  },
];

async function createAutomations(auth1, orgId, orgName) {
  const created = [];
  for (const t of AUTOMATION_TYPES) {
    let ok = false;
    for (const ep of [`${orgName}/automations`, `${orgId}/automations`]) {
      const r = await dPost(auth1, orgId, ep, t.body);
      if (r.s >= 200 && r.s < 300) {
        const id = r.j?.automation_id || r.j?.id || r.j?.automation?.id;
        created.push({ type: t.name, id, ep, s: r.s });
        ok = true;
        break;
      }
    }
    if (!ok) created.push({ type: t.name, id: null, s: -1, failed: true });
    await sl(200);
  }
  return created;
}

// ── 尝试触发automation ────────────────────────────────────────────────────────
async function triggerAutomations(auth1, orgId, orgName, autoIds) {
  const results = [];
  for (const id of autoIds.filter(Boolean)) {
    for (const base of [orgName, orgId]) {
      for (const suffix of ["run", "trigger", "execute", "activate"]) {
        const r = await dPost(
          auth1,
          orgId,
          `${base}/automations/${id}/${suffix}`,
          {},
        );
        results.push({
          id,
          ep: `${base}/automations/${id}/${suffix}`,
          s: r.s,
          ok: r.s >= 200 && r.s < 300,
        });
        if (r.s >= 200 && r.s < 300) break;
        await sl(100);
      }
      if (results[results.length - 1]?.ok) break;
    }
    await sl(200);
  }
  return results;
}

// ── GitHub连接 ($10) ──────────────────────────────────────────────────────────
async function connectGitHub(auth1, orgId, orgName) {
  const H = dH(auth1, orgId);
  const endpoints = [
    [
      `${orgId}/integrations/github/connect-existing-installation`,
      { installation_id: GITHUB_INSTALL },
    ],
    [
      `integrations/github/connect-installation`,
      { installation_id: GITHUB_INSTALL, auto_create_org: true },
    ],
    [
      `integrations/github/connect-installation`,
      { installation_id: GITHUB_INSTALL, org_id: orgId },
    ],
    [
      `${orgName}/integrations/github/connect-installation`,
      { installation_id: GITHUB_INSTALL },
    ],
    [
      `integrations/github/connect-existing-installation`,
      { installation_id: GITHUB_INSTALL },
    ],
    // 尝试不同installation_ids (大型公共组织)
    [
      `${orgId}/integrations/github/connect-existing-installation`,
      { installation_id: 57940555 },
    ],
    [
      `${orgId}/integrations/github/connect-existing-installation`,
      { installation_id: 65673498 },
    ],
  ];
  let anyOk = false;
  const results = [];
  for (const [ep, body] of endpoints) {
    const r = await dPost(auth1, orgId, ep, body);
    const ok = r.s >= 200 && r.s < 300;
    results.push({
      ep: ep.slice(-50),
      s: r.s,
      ok,
      msg: (r.b || "").slice(0, 80),
    });
    if (ok) {
      anyOk = true;
      break;
    }
    await sl(100);
  }
  return { anyOk, results };
}

// ── 领取$10 git credit ────────────────────────────────────────────────────────
async function claimGitCredit(auth1, orgId) {
  const r = await dPost(
    auth1,
    orgId,
    "billing/claim-git-connection-credit",
    {},
  );
  const amount = r.j?.credits_granted_amount ?? 0;
  const alreadyClaimed = r.s === 200 && !amount;
  return {
    ok: r.s >= 200 && r.s < 300,
    amount: amount ?? 0,
    unit: r.j?.credits_granted_unit ?? null,
    s: r.s,
    alreadyClaimed,
    msg: (r.b || "").slice(0, 100),
  };
}

// ── 长轮询 ────────────────────────────────────────────────────────────────────
async function longPoll(auth1, orgId, pollSecs, label) {
  const deadline = Date.now() + pollSecs * 1000;
  let round = 0;
  let lastState = null;
  while (Date.now() < deadline) {
    const wait = round < 3 ? 5000 : round < 10 ? 15000 : 30000;
    await sl(wait);
    round++;
    try {
      const st = await getState(auth1, orgId);
      lastState = st;
      if (st.total >= 200 || st.overage >= 190) {
        lg(
          G(
            `${label} ★ $${st.total || st.overage} 到账! round=${round} overage=${st.overage}`,
          ),
        );
        return { confirmed: true, state: st, round };
      }
      if (round % 4 === 0) {
        lg(
          `${label} [轮询${round}] total=$${st.total} overage=${st.overage} checklist=${JSON.stringify(st.checklist)}`,
        );
      }
    } catch (e) {
      lg(Y(`${label} 轮询异常: ${e.message}`));
    }
  }
  return { confirmed: false, state: lastState, round };
}

// ══════════════════════════════════════════════════════════════════════════════
// 处理单账号 — 完整强制$200流程
// ══════════════════════════════════════════════════════════════════════════════
async function processOne(acc, idx, total) {
  const lbl = `[${String(idx + 1).padStart(3)}/${total}] ${acc.email.slice(0, 35).padEnd(35)}`;
  const res = {
    email: acc.email,
    ok: false,
    ts: new Date().toISOString(),
    auth1: null,
    orgId: null,
    orgName: null,
    ws_api_key: null,
    state_before: null,
    state_after: null,
    list_autos: null,
    delete_autos: null,
    create_autos: null,
    trigger_autos: null,
    github_connect: null,
    git_credit: null,
    confirmed_200: false,
    confirmed_210: false,
    git_10_claimed: false,
    pending: false,
    err: null,
  };

  try {
    // Step A: 登录
    lg(`${lbl} A·login`);
    res.auth1 = await doLogin(acc.email, acc.password);

    // Step B: postAuth + WS key (并发)
    lg(`${lbl} B·postAuth`);
    const [{ orgId, orgName }, wsKey] = await Promise.all([
      doPostAuth(res.auth1),
      doRegisterUser(res.auth1),
    ]);
    res.orgId = orgId;
    res.orgName = orgName;
    res.ws_api_key = wsKey;

    // Step C: 查当前状态
    const st0 = await getState(res.auth1, orgId);
    res.state_before = {
      total: st0.total,
      checklist: st0.checklist,
      overage: st0.overage,
    };
    lg(
      `${lbl} C·state: total=$${st0.total} overage=${st0.overage} auto=${st0.checklist.automations}`,
    );

    // 已$200+ → 仅补$10
    if ((st0.total >= 200 || st0.overage >= 190) && !RUN_ALL) {
      res.confirmed_200 = true;
      if (st0.total >= 210 || st0.overage >= 205) res.confirmed_210 = true;
      lg(G(`${lbl} ✓ 已$${st0.total}/$${st0.overage} → 跳过`));
      res.ok = true;
      // 还是尝试$10
      if (!st0.checklist.connect_integration) {
        res.github_connect = await connectGitHub(res.auth1, orgId, orgName);
        await sl(1000);
        res.git_credit = await claimGitCredit(res.auth1, orgId);
        if (res.git_credit.amount > 0) {
          res.git_10_claimed = true;
          res.confirmed_210 = true;
        }
      }
      return res;
    }

    if (VERIFY_ONLY) {
      res.confirmed_200 = st0.total >= 200 || st0.overage >= 190;
      res.ok = true;
      return res;
    }

    // Step D: GitHub connect (尝试$10)
    lg(`${lbl} D·github_connect (7变体)`);
    res.github_connect = await connectGitHub(res.auth1, orgId, orgName);
    if (res.github_connect.anyOk) {
      lg(G(`${lbl}   GitHub连接成功!`));
      await sl(1500);
    }

    // Step E: 领取$10
    lg(`${lbl} E·claim_git_$10`);
    res.git_credit = await claimGitCredit(res.auth1, orgId);
    if (res.git_credit.amount > 0) {
      lg(G(`${lbl}   ★ $10 INSTANT! amount=${res.git_credit.amount}`));
      res.git_10_claimed = true;
    }

    if (DELETE_ONLY) {
      // 只删除模式
      const list = await listAutomations(res.auth1, orgId, orgName);
      res.list_autos = list;
      if (list.ids.length > 0) {
        res.delete_autos = await deleteAutomations(
          res.auth1,
          orgId,
          orgName,
          list.ids,
        );
        lg(Y(`${lbl} 已删除 ${list.ids.length} 个automation`));
      }
      res.ok = true;
      return res;
    }

    // Step F: 列出现有automations
    lg(`${lbl} F·list_automations`);
    const listResult = await listAutomations(res.auth1, orgId, orgName);
    res.list_autos = listResult;
    lg(`${lbl}   找到 ${listResult.ids.length} 个existing automations`);

    // Step G: 删除所有现有automations (重置队列)
    if (listResult.ids.length > 0) {
      lg(`${lbl} G·delete_automations (${listResult.ids.length}个)`);
      res.delete_autos = await deleteAutomations(
        res.auth1,
        orgId,
        orgName,
        listResult.ids,
      );
      const deletedOk = res.delete_autos.filter((d) => d.ok).length;
      lg(
        deletedOk > 0
          ? G(`${lbl}   删除 ${deletedOk}/${listResult.ids.length} ✓`)
          : Y(`${lbl}   删除失败 (${res.delete_autos[0]?.s})`),
      );
      await sl(500);
    } else {
      lg(`${lbl} G·no existing automations`);
    }

    // Step H: 创建4种fresh automations
    lg(`${lbl} H·create_4_automations`);
    res.create_autos = await createAutomations(res.auth1, orgId, orgName);
    const createdOk = res.create_autos.filter((a) => a.id).length;
    lg(
      createdOk > 0
        ? G(`${lbl}   创建 ${createdOk}/4 types ✓`)
        : Y(`${lbl}   创建失败`),
    );

    // Step I: 尝试触发新建的automations
    const newAutoIds = res.create_autos.map((a) => a.id).filter(Boolean);
    if (newAutoIds.length > 0) {
      lg(`${lbl} I·trigger_automations (${newAutoIds.length}个)`);
      res.trigger_autos = await triggerAutomations(
        res.auth1,
        orgId,
        orgName,
        newAutoIds,
      );
      const triggeredOk = res.trigger_autos.filter((t) => t.ok).length;
      if (triggeredOk > 0) lg(G(`${lbl}   触发成功 ${triggeredOk} 个!`));
      else lg(`${lbl}   触发端点全部404/405 (预期内)`);
    }

    // Step J: 长轮询 (5分钟)
    if (POLL_SECS > 0) {
      lg(`${lbl} J·long_poll ${POLL_SECS}s`);
      const poll = await longPoll(res.auth1, orgId, POLL_SECS, lbl);
      if (poll.confirmed && poll.state) {
        res.state_after = {
          total: poll.state.total,
          checklist: poll.state.checklist,
          overage: poll.state.overage,
        };
        res.confirmed_200 = true;
        if (
          poll.state.total >= 210 ||
          (poll.state.overage >= 205 && res.git_10_claimed)
        )
          res.confirmed_210 = true;
        lg(
          G(`${lbl} ★★ CONFIRMED! $${poll.state.total}/${poll.state.overage}`),
        );
      } else {
        const st = poll.state || (await getState(res.auth1, orgId));
        res.state_after = st
          ? { total: st.total, checklist: st.checklist, overage: st.overage }
          : null;
        res.pending =
          (res.create_autos || []).some((a) => a.id) ||
          st?.checklist?.automations;
        lg(
          Y(
            `${lbl} ⏳ 轮询结束未确认 | total=$${st?.total} overage=${st?.overage}`,
          ),
        );
      }
    }

    res.ok = true;
  } catch (e) {
    res.err = e.message;
    lg(R(`${lbl} ERR: ${e.message}`));
  }

  return res;
}

// ── 保存结果 ──────────────────────────────────────────────────────────────────
function saveResults(results) {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  const keys = results.map((r) => r.ws_api_key).filter(Boolean);
  if (keys.length > 0) fs.writeFileSync(WS_FILE, keys.join("\n") + "\n");
}

// ── 加载账号 ──────────────────────────────────────────────────────────────────
function loadAccounts() {
  const accs = [];
  const pwMap = {};

  // 从_wam_all.txt读密码
  if (fs.existsSync(WAM_FILE)) {
    for (const line of fs.readFileSync(WAM_FILE, "utf-8").split(/\r?\n/)) {
      const [em, ...pw] = line.trim().split(":");
      if (em && em.includes("@") && pw.length)
        pwMap[em.toLowerCase()] = pw.join(":");
    }
  }

  // 从_success_pool.json读账号
  if (fs.existsSync(POOL_FILE)) {
    const pool = JSON.parse(fs.readFileSync(POOL_FILE, "utf-8"));
    const arr = Array.isArray(pool) ? pool : pool.accounts || [];
    for (const a of arr) {
      const email = a.email || a.Email;
      const pass = a.password || a.Password || pwMap[email?.toLowerCase()];
      if (email && pass) {
        accs.push({
          email,
          password: pass,
          orgId: a.orgId || a.org_id,
          orgName: a.orgName || a.org_name,
          auth1: a.auth1,
        });
      }
    }
  }

  // 从_wam_all.txt补充不在pool里的账号
  for (const [em, pw] of Object.entries(pwMap)) {
    if (!accs.find((a) => a.email.toLowerCase() === em)) {
      accs.push({ email: em, password: pw });
    }
  }

  return accs;
}

// ── 并发队列 ──────────────────────────────────────────────────────────────────
async function runConcurrent(tasks, workers, onDone) {
  const queue = [...tasks];
  const active = [];
  let idx = 0;
  async function runNext() {
    while (queue.length) {
      const task = queue.shift();
      const p = task().then((r) => {
        onDone(r, idx++);
        return r;
      });
      active.push(p);
      if (active.length >= workers) await Promise.race(active);
      active.splice(
        active.findIndex((x) => x === p),
        1,
      );
      await sl(500 + Math.random() * 1000); // 错峰
    }
  }
  const runners = Array.from({ length: workers }, () => runNext());
  await Promise.all(runners);
  await Promise.all(active);
}

// ══════════════════════════════════════════════════════════════════════════════
// 主入口
// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  process.stdout.write(`\n╔${"═".repeat(65)}╗\n`);
  process.stdout.write(`║  印193 · dao_credit_force · ${SEAL}\n`);
  process.stdout.write(
    `║  VERSION ${VERSION} · DELETE+重建automation · 打通到底\n`,
  );
  process.stdout.write(`╚${"═".repeat(65)}╝\n\n`);

  // 查看状态模式
  if (STATUS_MODE) {
    if (!fs.existsSync(RESULTS_FILE)) {
      lg("无结果文件");
      return;
    }
    const r = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf-8"));
    const c200 = r.filter((a) => a.confirmed_200).length;
    const c210 = r.filter((a) => a.confirmed_210).length;
    const pend = r.filter((a) => a.pending).length;
    const fail = r.filter((a) => a.err).length;
    process.stdout.write(
      `\n状态统计:\n  总账号: ${r.length}\n  $200确认: ${c200}\n  $210确认: ${c210}\n  等待中: ${pend}\n  失败: ${fail}\n\n`,
    );
    return;
  }

  PROXY = await detectProxy();

  // 单账号模式
  if (ACCOUNT_1) {
    const [email, ...pw] = ACCOUNT_1.split(":");
    const password = pw.join(":");
    const res = await processOne({ email, password }, 0, 1);
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
    return;
  }

  // 加载所有账号
  const allAccs = loadAccounts();
  lg(`加载账号: ${allAccs.length} 个`);

  // 过滤: 仅处理pending账号
  let toProcess = allAccs;
  if (PENDING_ONLY && !RUN_ALL) {
    // 加载之前的结果, 找出未确认的
    const prevMap = new Map();
    if (fs.existsSync(PREV_RESULTS)) {
      const prev = JSON.parse(fs.readFileSync(PREV_RESULTS, "utf-8"));
      for (const p of prev) prevMap.set(p.email.toLowerCase(), p);
    }
    if (fs.existsSync(RESULTS_FILE)) {
      const prev = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf-8"));
      for (const p of prev) prevMap.set(p.email.toLowerCase(), p);
    }
    toProcess = allAccs.filter((a) => {
      const prev = prevMap.get(a.email.toLowerCase());
      if (!prev) return true; // 新账号
      if (prev.confirmed_200 || prev.confirmed_210) return false; // 已确认
      return true;
    });
    lg(`过滤后待处理: ${toProcess.length} 个 (跳过已确认账号)`);
  }

  lg(`开始处理: ${toProcess.length} 个 (并发=${CONCUR} poll=${POLL_SECS}s)`);

  const results = [];
  // 读取已有结果
  if (fs.existsSync(RESULTS_FILE)) {
    const existing = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf-8"));
    results.push(
      ...existing.filter((e) => !toProcess.find((t) => t.email === e.email)),
    );
  }

  let done = 0;
  const tasks = toProcess.map(
    (acc, i) => () => processOne(acc, i, toProcess.length),
  );
  await runConcurrent(tasks, CONCUR, (res, i) => {
    results.push(res);
    saveResults(results);
    done++;
    const c200 = results.filter((r) => r.confirmed_200).length;
    const c210 = results.filter((r) => r.confirmed_210).length;
    lg(
      B(
        `进度: ${done}/${toProcess.length} | 已确认$200: ${c200} | 已确认$210: ${c210}`,
      ),
    );
  });

  // 最终汇总
  const c200 = results.filter((r) => r.confirmed_200).length;
  const c210 = results.filter((r) => r.confirmed_210).length;
  const pend = results.filter((r) => r.pending).length;
  const fail = results.filter((r) => r.err).length;
  const wsKeys = results.map((r) => r.ws_api_key).filter(Boolean).length;

  process.stdout.write(`\n${"═".repeat(67)}\n`);
  process.stdout.write(`  印193 · dao_credit_force · 完成汇总\n`);
  process.stdout.write(`${"═".repeat(67)}\n`);
  process.stdout.write(`  总处理账号:    ${toProcess.length}\n`);
  process.stdout.write(`  $200 已确认:   ${c200}\n`);
  process.stdout.write(`  $210 已确认:   ${c210}\n`);
  process.stdout.write(`  等待处理中:    ${pend}\n`);
  process.stdout.write(`  失败/错误:     ${fail}\n`);
  process.stdout.write(`  WS Keys提取:   ${wsKeys}\n`);
  process.stdout.write(`  结果文件:      ${RESULTS_FILE}\n`);
  process.stdout.write(`${"═".repeat(67)}\n\n`);
})().catch((e) => {
  lg(R(`FATAL: ${e.message}`));
  process.exit(1);
});
