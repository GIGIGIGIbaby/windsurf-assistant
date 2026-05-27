#!/usr/bin/env node
"use strict";
/**
 * _yin194_helper.js - 印194 道直连器状态查询 + 端到端验证
 * 道法自然 · 无为而无不为
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, spawn } = require("child_process");

const KERNEL = path.join(__dirname, "130-道独立体_Standalone", "_kernel");
const DAO_PORT = parseInt(process.env.DAO_PORT || "7861");
const CMD = process.argv[2] || "status";

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => {
        try { resolve({ code: r.statusCode, json: JSON.parse(d) }); }
        catch { resolve({ code: r.statusCode, raw: d }); }
      });
    }).on("error", reject);
  });
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const b = JSON.stringify(body);
    const opts = {
      method: "POST",
      host: "127.0.0.1",
      port: DAO_PORT,
      path: new URL(url).pathname,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(b) },
    };
    const req = http.request(opts, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => {
        try { resolve({ code: r.statusCode, json: JSON.parse(d) }); }
        catch { resolve({ code: r.statusCode, raw: d }); }
      });
    });
    req.on("error", reject);
    req.setTimeout(120000, () => req.destroy(new Error("TIMEOUT")));
    req.write(b);
    req.end();
  });
}

async function getStatus() {
  console.log("\n=== 道直连器 状态 ===");
  try {
    const { json } = await get(`http://127.0.0.1:${DAO_PORT}/health`);
    console.log("  route    :", json.route);
    console.log("  lsp_port :", json.lsp?.port || "N/A");
    console.log("  lsp_csrf :", json.lsp?.csrf || "N/A");
    console.log("  active   :", json.apiKey?.account || "unknown");
    console.log("  accounts :", (json.daoAccounts?.total || 0), "total /", (json.daoAccounts?.alive || 0), "alive");
    console.log("  models   :", json.models?.count || 0);
    console.log("  version  :", json.version);
    console.log("  [UP] LSP路径激活 - 绕过全局Trial限速桶");
  } catch (e) {
    console.log("  [DOWN]", e.message);
    console.log("  启动: node 道直连器.js (在 _kernel 目录)");
  }

  console.log("\n=== WAM v2.9.0 状态 ===");
  try {
    const wam = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".wam", "wam-state.json"), "utf8"));
    console.log("  version  :", wam.version);
    console.log("  active   :", wam.activeEmail || "none");
    console.log("  token    :", wam.activeTokenShort || "none");
    console.log("  verified :", Object.keys(wam.health || {}).length, "账号");
  } catch (e) { console.log("  WAM:", e.message); }

  console.log("\n=== dao账号池 状态 ===");
  try {
    const dao = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".dao", "accounts.json"), "utf8"));
    console.log("  active   :", dao.active || "none");
    console.log("  total    :", dao.accounts?.length || 0);
    console.log("  byType   :", JSON.stringify(dao.accounts?.reduce((acc, a) => {
      acc[a.type || "unknown"] = (acc[a.type || "unknown"] || 0) + 1; return acc;
    }, {})));
  } catch (e) { console.log("  dao:", e.message); }
  console.log("");
}

async function runTest() {
  console.log("\n=== 印194 LSP路径Trial账号限速突破测试 ===\n");
  let health;
  try {
    const r = await get(`http://127.0.0.1:${DAO_PORT}/health`);
    health = r.json;
    console.log("[道直连器] route=" + health.route + " lsp_port=" + health.lsp?.port);
    console.log("[ACCOUNT] " + (health.apiKey?.account || "unknown"));
  } catch (e) {
    console.log("[FATAL] 道直连器不可达:", e.message);
    process.exit(1);
  }

  // 读WAM账号信息
  let overageActive = false, planInfo = "";
  try {
    const wam = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".wam", "wam-state.json"), "utf8"));
    const h = (wam.health || {})[health.apiKey?.account] || {};
    overageActive = !!h.overageActive;
    planInfo = "plan=" + h.plan + " weekly=" + h.weekly + " daily=" + h.daily;
  } catch {}
  console.log("[PLAN] overageActive=" + overageActive + " " + planInfo);
  console.log("[NOTE] Trial账号通过LSP路径 - 验证是否绕过全局trial限速桶");
  console.log("");

  const rounds = [
    "Respond with exactly one Chinese character: 道",
    "Respond with exactly one Chinese character: 天",
    "Respond with exactly one Chinese character: 地",
    "Respond with exactly one Chinese character: 人",
  ];
  let okCount = 0, rateHits = 0, results = [];

  for (let i = 0; i < rounds.length; i++) {
    const msg = rounds[i];
    console.log(`R${i+1} [claude-sonnet-4-6] ${msg.slice(0, 40)}...`);
    const t0 = Date.now();
    try {
      const r = await post(`http://127.0.0.1:${DAO_PORT}/v1/chat/completions`, {
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: msg }],
        max_tokens: 20,
        stream: false,
      });
      const ms = Date.now() - t0;
      const txt = r.json?.choices?.[0]?.message?.content || r.json?.error?.message || JSON.stringify(r.json).slice(0, 100);
      const isRate = /rate.limit|resource_exhausted|global.*trial|Reached.*limit/i.test(txt) || r.code === 429;
      if (isRate) rateHits++; else if (r.code === 200) okCount++;
      results.push({ i: i + 1, ok: r.code === 200, ms, text: txt.slice(0, 80), isRate });
      console.log(`  ${isRate ? "[RATE]" : r.code === 200 ? "[OK]" : "[FAIL]"} ${ms}ms HTTP${r.code} >> ${txt.slice(0, 60)}`);
    } catch (e) {
      const ms = Date.now() - t0;
      results.push({ i: i + 1, ok: false, ms, text: "ERR:" + e.message, isRate: false });
      console.log(`  [ERR] ${ms}ms ${e.message.slice(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log("");
  console.log("=== FINAL VERDICT ===");
  console.log(`OK=${okCount} RATE=${rateHits} TOTAL=${rounds.length}`);
  if (rateHits === 0 && okCount > 0) {
    console.log("★★★ ZERO_RATE_LIMITS ★★★");
    console.log("Trial账号(overageActive=" + overageActive + ")通过LSP路径 - 零全局限速");
    console.log("证明: LSP路径绕过全局trial限速桶 - 道法自然");
  } else if (okCount === 0) {
    console.log("✗ 所有请求失败 - LSP可能超时或账号耗尽");
    console.log("建议: 检查道直连器日志 + 确认LSP端口活跃");
  } else {
    console.log("✗ RATE_HITS=" + rateHits + " - 可能是per-account quota耗尽(非全局桶)");
    console.log("建议: 道直连器会自动rotate到下一账号重试");
  }
}

async function importWam() {
  console.log("\n=== WAM账号池 → dao账号池 同步 ===");
  try {
    const wam = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".wam", "wam-state.json"), "utf8"));
    const daoFile = path.join(os.homedir(), ".dao", "accounts.json");

    let db;
    try {
      db = JSON.parse(fs.readFileSync(daoFile, "utf8"));
    } catch {
      db = { version: 2, accounts: [], active: null, rotateMode: "round-robin", lastRotateAt: 0, rotateCount: 0 };
    }
    if (!Array.isArray(db.accounts)) db.accounts = [];

    const health = wam.health || {};
    let added = 0, updated = 0;

    for (const [email, h] of Object.entries(health)) {
      if (!email || !h) continue;
      const apiKey = h.apiKey || wam.activeApiKey;
      if (!apiKey) continue;
      const idx = db.accounts.findIndex(a => a?.email?.toLowerCase() === email.toLowerCase());
      if (idx >= 0) {
        if (apiKey !== db.accounts[idx].apiKey) {
          db.accounts[idx].apiKey = apiKey;
          db.accounts[idx].lastUsed = new Date().toISOString();
          updated++;
        }
      } else {
        db.accounts.push({
          email, apiKey,
          type: apiKey.startsWith("devin-session-token$") ? "devin" : "sk-ws",
          added: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
          useCount: 0,
          apiServerUrl: "https://server.self-serve.windsurf.com",
        });
        added++;
      }
    }

    // 设置active
    if (wam.activeEmail) db.active = wam.activeEmail;

    fs.mkdirSync(path.dirname(daoFile), { recursive: true });
    fs.writeFileSync(daoFile, JSON.stringify(db, null, 2), "utf8");
    console.log(`  添加 ${added} 个新账号, 更新 ${updated} 个账号`);
    console.log(`  dao账号池总计: ${db.accounts.length}`);
    console.log(`  active: ${db.active}`);
  } catch (e) {
    console.log("  FAIL:", e.message);
  }
}

// 主入口
(async () => {
  if (CMD === "status" || CMD === "s") {
    await getStatus();
  } else if (CMD === "test" || CMD === "t") {
    await runTest();
  } else if (CMD === "import" || CMD === "i") {
    await importWam();
  } else {
    console.log("用法: node _yin194_helper.js [status|test|import]");
  }
})().catch(e => { console.error("[FATAL]", e.message); process.exit(1); });
