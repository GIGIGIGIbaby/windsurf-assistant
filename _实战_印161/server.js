#!/usr/bin/env node
/**
 * _实战_印161/server.js · 道·智能任务管家 · 全链路验证项目
 *
 * 主公诏 (印 161 · 2026-05-19):
 *   「锚定本源底层需求 · 继续推进到底 · 实践到底 · 无限制并发使用虚拟机一切资源
 *    一虚拟机 一账号 · 虚拟机全链路运行反代
 *    同时反代 windsurf cascade 和 devin cloud 所有模型并统一管理隔离替换提示词
 *    同时构建公网传输通道 · 虚拟机反向提供 api · 任意环境任意设备无感调用使用一切
 *    全链路闭环 · 测试使用 gpt5.5 和 cloud4.7 模型 · 开发具体项目验证所有模块所有功能」
 *
 * 道:
 *   「修之天下 · 其德乃博」(帛书五十四)
 *   「合抱之木 · 生于毫末 · 九成之台 · 作于累土」(帛书六十四)
 *   「天下之至柔 · 驰骋于天下之致坚 · 无有入于无间」(帛书四十三)
 *
 * 此件之意 · 一具体项目验证全链路:
 *   1. CRUD API 任务管家 (Express :3000) — 主公真用之件
 *   2. AI 路由调 dao 反代 :7790 (fleet_master) → 自动调 N VM 或 fallback :7780
 *   3. 双模并发: 4.7 推理 (拆任务/优先级建议) + gpt5.5 创意 (补描述/总结)
 *   4. 公网入: cf tunnel :7790 让任设备无感访本管家
 *   5. SP 隔离: /v1/system/prompt 替换实证
 *
 * 端点 (CRUD):
 *   GET    /api/tasks        · 列所有
 *   POST   /api/tasks        · 加新 (含 AI 自动补描述+优先级)
 *   PUT    /api/tasks/:id    · 改/toggle done
 *   DELETE /api/tasks/:id    · 删
 *   GET    /api/stats        · 统计
 *
 * 端点 (AI 真用):
 *   POST   /api/llm/chat       · 通用对话 (主公选模)
 *   POST   /api/llm/decompose  · 拆任务 (4.7 推理 · 给子任务列表)
 *   POST   /api/llm/creative   · 创意补 (gpt5.5 · 补描述/总结)
 *   POST   /api/llm/parallel   · 双模并发 (4.7+gpt5.5 同问 · 比较)
 *   GET    /api/llm/models     · 列可用模 (从 :7790 透取)
 *   GET    /api/llm/health     · 反代链路健康
 *   GET    /api/llm/sp         · 现 SP 态
 *   POST   /api/llm/sp         · 替换 SP (隔离实证)
 *
 * 用:
 *   npm i               # 装 express
 *   node server.js      # 默 :3000
 *   PORT=3001 node server.js
 *   DAO_BASE=http://127.0.0.1:7790 node server.js   # 显指反代
 */
"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = parseInt(process.env.PORT || "3000", 10);
const DAO_BASE = process.env.DAO_BASE || "http://127.0.0.1:7790";
const DATA_FILE = path.join(__dirname, "_state", "tasks.json");
const STATS_FILE = path.join(__dirname, "_state", "stats.json");

// ─── 真朴 state (帛书廿八 · 朴散则为器) ───
let tasks = [];
let nextId = 1;
const stats = {
  startedAt: Date.now(),
  llmCalls: 0,
  llmErrors: 0,
  llmTotalMs: 0,
  routeCount: { vm: 0, fallback: 0, error: 0 },
  byModel: {},
};

// ─── 资料持化 ───
function saveTasks() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ tasks, nextId }, null, 2));
  } catch (e) {
    console.error(`✗ saveTasks: ${e.message}`);
  }
}

function loadTasks() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const j = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      tasks = j.tasks || [];
      nextId = j.nextId || 1;
      console.log(`✓ loaded ${tasks.length} tasks (nextId=${nextId})`);
    }
  } catch (e) {
    console.error(`⚠ loadTasks: ${e.message}`);
  }
}

function saveStats() {
  try {
    fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch {}
}

// ─── HTTP helper · 0 deps · 反代到 :7790 ───
function httpReq(urlStr, opts = {}, body = null) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch {
      return resolve({ ok: false, code: 0, err: "bad url" });
    }
    const lib = u.protocol === "https:" ? https : http;
    const t0 = Date.now();
    const reqOpts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method: opts.method || "GET",
      headers: opts.headers || {},
      timeout: opts.timeout || 90000,
    };
    if (body) reqOpts.headers["Content-Length"] = Buffer.byteLength(body);
    const req = lib.request(reqOpts, (res) => {
      const c = [];
      res.on("data", (d) => c.push(d));
      res.on("end", () => {
        const b = Buffer.concat(c).toString("utf8");
        let j = null;
        try {
          j = JSON.parse(b);
        } catch {}
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          code: res.statusCode,
          headers: res.headers,
          body: b,
          json: j,
          ms: Date.now() - t0,
        });
      });
    });
    req.on("error", (e) =>
      resolve({ ok: false, code: 0, err: e.message, ms: Date.now() - t0 }),
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, code: 0, err: "timeout", ms: Date.now() - t0 });
    });
    if (body) req.write(body);
    req.end();
  });
}

// ─── LLM 反代 helper (走 :7790 fleet_master) ───
async function callLLM(model, messages, opts = {}) {
  stats.llmCalls++;
  const body = JSON.stringify({
    model,
    messages,
    max_tokens: opts.maxTokens || 200,
    temperature: opts.temperature !== undefined ? opts.temperature : 0.7,
    stream: false,
  });
  const t0 = Date.now();
  const r = await httpReq(
    `${DAO_BASE}/v1/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      timeout: opts.timeout || 90000,
    },
    body,
  );
  stats.llmTotalMs += Date.now() - t0;
  // 统计路由 (X-Fleet-Routed header)
  const routed = (r.headers && r.headers["x-fleet-routed"]) || "?";
  if (routed.startsWith("VM")) stats.routeCount.vm++;
  else if (routed.startsWith("fallback")) stats.routeCount.fallback++;
  else if (!r.ok) stats.routeCount.error++;
  // 统计模
  stats.byModel[model] = (stats.byModel[model] || 0) + 1;

  if (!r.ok) {
    stats.llmErrors++;
    return {
      ok: false,
      error: r.err || `code=${r.code}`,
      raw: r.body,
      routed,
      ms: r.ms,
    };
  }
  if (r.json && r.json.choices && r.json.choices[0]) {
    return {
      ok: true,
      content: r.json.choices[0].message.content || "",
      model: r.json.model || model,
      routed,
      ms: r.ms,
      usage: r.json.usage || null,
    };
  }
  return { ok: false, error: "bad response", raw: r.body, routed, ms: r.ms };
}

// ─── 路由 ───
function readBody(req) {
  return new Promise((resolve) => {
    const c = [];
    req.on("data", (d) => c.push(d));
    req.on("end", () => resolve(Buffer.concat(c).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

function sendJson(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(obj, null, 2));
}

function sendHtml(res, html) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

const HANDLERS = {
  "OPTIONS *": (req, res) => {
    sendJson(res, 204, {});
  },

  // ─── 静 ───
  "GET /": (req, res) => {
    try {
      const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
      sendHtml(res, html);
    } catch {
      sendJson(res, 404, { error: "index.html not found" });
    }
  },

  // ─── CRUD ───
  "GET /api/tasks": (req, res) =>
    sendJson(res, 200, { tasks, nextId, count: tasks.length }),

  "POST /api/tasks": async (req, res) => {
    let parsed = {};
    try {
      parsed = JSON.parse((await readBody(req)) || "{}");
    } catch {}
    if (!parsed.title) return sendJson(res, 400, { error: "title required" });

    const task = {
      id: nextId++,
      title: parsed.title,
      desc: parsed.desc || "",
      priority: parsed.priority || "mid",
      done: !!parsed.done,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      aiHints: null,
    };
    // 印 161 · 选填: AI 自动补
    if (parsed.autoAi) {
      const r = await callLLM(
        parsed.aiModel || "claude-sonnet-4-7",
        [
          {
            role: "user",
            content: `任务标题: ${parsed.title}\n请用中文 30 字内给该任务加描述并建议优先级 (low/mid/high)，JSON 格式: {"desc":"...", "priority":"..."}`,
          },
        ],
        { maxTokens: 100, temperature: 0.5 },
      );
      if (r.ok) {
        try {
          const aiJson = JSON.parse(
            r.content.match(/\{[\s\S]*\}/)?.[0] || "{}",
          );
          if (aiJson.desc) task.desc = task.desc || aiJson.desc;
          if (aiJson.priority) task.priority = aiJson.priority;
          task.aiHints = { model: r.model, ms: r.ms, routed: r.routed };
        } catch {}
      }
    }
    tasks.push(task);
    saveTasks();
    sendJson(res, 201, task);
  },

  "PUT /api/tasks/:id": async (req, res, _, params) => {
    const id = parseInt(params.id, 10);
    const task = tasks.find((t) => t.id === id);
    if (!task) return sendJson(res, 404, { error: "task not found" });
    let parsed = {};
    try {
      parsed = JSON.parse((await readBody(req)) || "{}");
    } catch {}
    if ("title" in parsed) task.title = parsed.title;
    if ("desc" in parsed) task.desc = parsed.desc;
    if ("priority" in parsed) task.priority = parsed.priority;
    if ("done" in parsed) task.done = !!parsed.done;
    task.updatedAt = Date.now();
    saveTasks();
    sendJson(res, 200, task);
  },

  "DELETE /api/tasks/:id": (req, res, _, params) => {
    const id = parseInt(params.id, 10);
    const i = tasks.findIndex((t) => t.id === id);
    if (i < 0) return sendJson(res, 404, { error: "task not found" });
    const removed = tasks.splice(i, 1)[0];
    saveTasks();
    sendJson(res, 200, { ok: true, removed });
  },

  "GET /api/stats": (req, res) => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.done).length;
    sendJson(res, 200, {
      tasks: {
        total,
        done,
        pending: total - done,
        rate: total ? Math.round((done / total) * 100) : 0,
      },
      llm: {
        calls: stats.llmCalls,
        errors: stats.llmErrors,
        avgMs: stats.llmCalls
          ? Math.round(stats.llmTotalMs / stats.llmCalls)
          : 0,
        routes: stats.routeCount,
        byModel: stats.byModel,
      },
      uptime: Math.round((Date.now() - stats.startedAt) / 1000),
      daoBase: DAO_BASE,
    });
  },

  // ─── LLM (AI 真用) ───
  "POST /api/llm/chat": async (req, res) => {
    let parsed = {};
    try {
      parsed = JSON.parse((await readBody(req)) || "{}");
    } catch {}
    if (!parsed.message)
      return sendJson(res, 400, { error: "message required" });
    const model = parsed.model || "claude-sonnet-4-7";
    const messages = parsed.history || [];
    messages.push({ role: "user", content: parsed.message });
    const r = await callLLM(model, messages, {
      maxTokens: parsed.maxTokens || 300,
      temperature: parsed.temperature,
      timeout: parsed.timeout || 90000,
    });
    sendJson(res, r.ok ? 200 : 502, r);
  },

  // 拆任务 (4.7 推理)
  "POST /api/llm/decompose": async (req, res) => {
    let parsed = {};
    try {
      parsed = JSON.parse((await readBody(req)) || "{}");
    } catch {}
    if (!parsed.title) return sendJson(res, 400, { error: "title required" });
    const r = await callLLM(
      "claude-sonnet-4-7",
      [
        {
          role: "system",
          content:
            '你是任务拆解专家。把大任务拆为 3-5 个具体可执行子任务。返回 JSON 数组: [{"title":"...","priority":"mid"}, ...]，无其他解释。',
        },
        {
          role: "user",
          content: `请拆解此任务: ${parsed.title}\n${parsed.desc ? "描述: " + parsed.desc : ""}`,
        },
      ],
      { maxTokens: 400, temperature: 0.3 },
    );
    if (!r.ok) return sendJson(res, 502, r);
    let subtasks = [];
    try {
      const m = r.content.match(/\[[\s\S]*\]/);
      if (m) subtasks = JSON.parse(m[0]);
    } catch (e) {
      return sendJson(res, 200, {
        ok: true,
        raw: r.content,
        subtasks: [],
        parseError: e.message,
        model: r.model,
        ms: r.ms,
        routed: r.routed,
      });
    }
    sendJson(res, 200, {
      ok: true,
      subtasks,
      raw: r.content,
      model: r.model,
      ms: r.ms,
      routed: r.routed,
    });
  },

  // 创意补 (gpt5.5)
  "POST /api/llm/creative": async (req, res) => {
    let parsed = {};
    try {
      parsed = JSON.parse((await readBody(req)) || "{}");
    } catch {}
    if (!parsed.prompt) return sendJson(res, 400, { error: "prompt required" });
    const r = await callLLM(
      "gpt-5-5",
      [
        {
          role: "system",
          content: "你是创意写作助手。给生动有趣的描述/总结/灵感。简洁有力。",
        },
        { role: "user", content: parsed.prompt },
      ],
      { maxTokens: parsed.maxTokens || 200, temperature: 0.9 },
    );
    sendJson(res, r.ok ? 200 : 502, r);
  },

  // 双模并发 (4.7 + gpt5.5 同问)
  "POST /api/llm/parallel": async (req, res) => {
    let parsed = {};
    try {
      parsed = JSON.parse((await readBody(req)) || "{}");
    } catch {}
    if (!parsed.prompt) return sendJson(res, 400, { error: "prompt required" });
    const messages = [{ role: "user", content: parsed.prompt }];
    const [r1, r2] = await Promise.all([
      callLLM("claude-sonnet-4-7", messages, {
        maxTokens: 150,
        temperature: 0.5,
        timeout: 60000,
      }),
      callLLM("gpt-5-5", messages, {
        maxTokens: 150,
        temperature: 0.7,
        timeout: 60000,
      }),
    ]);
    sendJson(res, 200, {
      ok: true,
      results: {
        "claude-sonnet-4-7": r1,
        "gpt-5-5": r2,
      },
      summary: {
        bothOk: r1.ok && r2.ok,
        anyOk: r1.ok || r2.ok,
        avgMs: Math.round(((r1.ms || 0) + (r2.ms || 0)) / 2),
      },
    });
  },

  // 列模 (透传 :7790 → :7780)
  "GET /api/llm/models": async (req, res) => {
    const r = await httpReq(`${DAO_BASE}/v1/models`, { timeout: 10000 });
    if (!r.ok) return sendJson(res, 502, { error: r.err || `code=${r.code}` });
    sendJson(res, 200, r.json || { error: "bad response", raw: r.body });
  },

  // 反代链路健康
  "GET /api/llm/health": async (req, res) => {
    const [hFleet, hProxy] = await Promise.all([
      httpReq(`${DAO_BASE}/health`, { timeout: 5000 }),
      httpReq(`http://127.0.0.1:7780/health`, { timeout: 5000 }),
    ]);
    sendJson(res, 200, {
      fleet_master: hFleet.ok
        ? hFleet.json
        : { error: hFleet.err || `code=${hFleet.code}` },
      dao_proxy: hProxy.ok
        ? {
            ok: hProxy.json?.ok,
            version: hProxy.json?.version,
            pool: hProxy.json?.pool?.total,
          }
        : { error: hProxy.err || `code=${hProxy.code}` },
      daoBase: DAO_BASE,
    });
  },

  // SP 七态 · 印 161 fix · 直走 :7780 (因 SP 是 :7780 全局状态 · fleet :7790 不透此路由)
  "GET /api/llm/sp": async (req, res) => {
    const r = await httpReq(`http://127.0.0.1:7780/v1/system/prompt`, {
      timeout: 5000,
    });
    if (!r.ok)
      return sendJson(res, 502, {
        error: r.err || `code=${r.code}`,
        raw: r.body,
      });
    sendJson(res, 200, r.json || { error: "bad response", raw: r.body });
  },

  "POST /api/llm/sp": async (req, res) => {
    const body = await readBody(req);
    const r = await httpReq(
      `http://127.0.0.1:7780/v1/system/prompt`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      },
      body,
    );
    sendJson(
      res,
      r.code || 502,
      r.json || { error: r.err || "no response", raw: r.body },
    );
  },

  "GET /api/llm/sp/observe": async (req, res) => {
    const r = await httpReq(`http://127.0.0.1:7780/v1/system/prompt/observe`, {
      timeout: 5000,
    });
    if (!r.ok)
      return sendJson(res, 502, {
        error: r.err || `code=${r.code}`,
        raw: r.body,
      });
    sendJson(res, 200, r.json || { error: "bad response", raw: r.body });
  },
};

// ─── 路由分发 (含 :id 路径参数) ───
function matchRoute(method, urlPath) {
  const k0 = `${method} ${urlPath}`;
  if (HANDLERS[k0]) return { handler: HANDLERS[k0], params: {} };
  // 试 :id 风
  const m = urlPath.match(/^\/api\/tasks\/(\d+)$/);
  if (m) {
    const k = `${method} /api/tasks/:id`;
    if (HANDLERS[k]) return { handler: HANDLERS[k], params: { id: m[1] } };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  try {
    const u = new URL(req.url, `http://${req.headers.host || "x"}`);
    const route = matchRoute(req.method, u.pathname);
    if (!route) {
      // OPTIONS pre-flight
      if (req.method === "OPTIONS") return HANDLERS["OPTIONS *"](req, res);
      return sendJson(res, 404, {
        error: `${req.method} ${u.pathname} not found`,
        hint: "GET / · GET /api/tasks · POST /api/llm/chat",
      });
    }
    await route.handler(req, res, null, route.params);
  } catch (e) {
    console.error(`✗ ${req.method} ${req.url}: ${e.message}\n${e.stack}`);
    sendJson(res, 500, { error: e.message });
  } finally {
    const ms = Date.now() - t0;
    if (req.url !== "/api/stats" && req.url !== "/api/llm/health") {
      console.log(`  ${req.method} ${req.url} · ${ms}ms`);
    }
  }
});

// ─── 起 ───
loadTasks();
// 每 30s 自存 stats
setInterval(saveStats, 30000);

server.listen(PORT, () => {
  console.log(
    "\x1b[1m═══ 道·智能任务管家 · 印 161 · 端到端验证项目 ═══\x1b[0m",
  );
  console.log(`  port:     \x1b[32mhttp://localhost:${PORT}\x1b[0m`);
  console.log(
    `  daoBase:  \x1b[36m${DAO_BASE}\x1b[0m  (fleet_master · 智能 LB → N VM / fallback)`,
  );
  console.log(`  tasks:    ${tasks.length} · nextId=${nextId}`);
  console.log("");
  console.log(
    "  端点 (CRUD):     /api/tasks (GET/POST) · /api/tasks/:id (PUT/DELETE) · /api/stats",
  );
  console.log(
    "  端点 (AI 真用):  /api/llm/{chat,decompose,creative,parallel,models,health,sp}",
  );
  console.log("");
  console.log("  「合抱之木 · 生于毫末 · 九成之台 · 作于累土」(帛书六十四)");
  console.log("");
});

process.on("SIGINT", () => {
  console.log("\n  · 收尾 · 存 tasks ...");
  saveTasks();
  saveStats();
  process.exit(0);
});
