#!/usr/bin/env node
/**
 * 道Agent 反向解耦脚本 (反者道之动)
 * ==================================
 * 撤销之前对 Windsurf 的 5 层侵入, 恢复零干扰状态.
 *
 * 撤销目标:
 *   1. 删除冒名的 ~/.windsurf/extensions/codeium.codeium-dev-0.0.1/
 *   2. 从 3 处 registry.json 移除 dao-agent 条目 (空文件删除)
 *   3. 从 settings.json 清理 enabledAgents[dao-agent] + agentEnv[dao-agent]
 *
 * 保留:
 *   - dao-agent 源码 (index.js / test_acp.js / package.json) 不动
 *   - settings.json 其它配置不动
 *   - registry.json 内其它 agent 条目不动
 *
 * Usage:
 *   node unwind.js          # 执行撤销
 *   node unwind.js --dry    # 干跑, 只显示将做什么
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const AGENT_ID = "dao-agent";
const DRY = process.argv.includes("--dry");

const STUB_EXT_DIR = path.join(
  os.homedir(),
  ".windsurf",
  "extensions",
  "codeium.codeium-dev-0.0.1",
);

const REGISTRY_PATHS = [
  path.join(os.homedir(), ".windsurf", "acp", "registry.json"),
  path.join(
    process.env.APPDATA || "",
    "Windsurf",
    "User",
    "acp",
    "registry.json",
  ),
  path.join(
    os.homedir(),
    "AppData",
    "Roaming",
    "Code",
    "User",
    "acp",
    "registry.json",
  ),
];

const SETTINGS_PATH = path.join(
  process.env.APPDATA || "",
  "Windsurf",
  "User",
  "settings.json",
);

function log(msg) {
  console.log((DRY ? "[DRY] " : "") + msg);
}

function step1_removeStubExtension() {
  console.log("\n【1/3】移除冒名的 Codeium.codeium-dev stub 扩展");
  if (!fs.existsSync(STUB_EXT_DIR)) {
    console.log("  - 不存在, 已是干净状态");
    return;
  }
  log(`  将删除: ${STUB_EXT_DIR}`);
  if (!DRY) {
    fs.rmSync(STUB_EXT_DIR, { recursive: true, force: true });
    console.log("  ✓ 已删除");
  }
}

function step2_cleanRegistries() {
  console.log("\n【2/3】从 3 处 registry.json 移除 dao-agent");
  for (const rp of REGISTRY_PATHS) {
    if (!fs.existsSync(rp)) {
      console.log(`  - 不存在: ${rp}`);
      continue;
    }
    try {
      const raw = fs.readFileSync(rp, "utf8");
      const r = JSON.parse(raw);
      if (!Array.isArray(r.agents)) {
        console.log(`  - 非标准格式, 跳过: ${rp}`);
        continue;
      }
      const before = r.agents.length;
      r.agents = r.agents.filter((a) => a.id !== AGENT_ID);
      const removed = before - r.agents.length;
      if (removed === 0) {
        console.log(`  - 无 dao-agent 条目: ${rp}`);
        continue;
      }
      if (r.agents.length === 0) {
        // 空数组 → 删除文件, 完全还原
        log(`  将删除空 registry: ${rp} (移除 ${removed} 条)`);
        if (!DRY) fs.unlinkSync(rp);
      } else {
        log(`  将改写 registry: ${rp} (移除 ${removed} 条, 保留 ${r.agents.length} 条)`);
        if (!DRY) fs.writeFileSync(rp, JSON.stringify(r, null, 2) + "\n");
      }
      if (!DRY) console.log("  ✓ 完成");
    } catch (e) {
      console.log(`  !! 解析失败 ${rp}: ${e.message}`);
    }
  }
}

function step3_cleanSettings() {
  console.log("\n【3/3】从 settings.json 清理 dao-agent 残留 (保留其它)");
  if (!fs.existsSync(SETTINGS_PATH)) {
    console.log("  - settings.json 不存在");
    return;
  }
  const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
  const s = JSON.parse(raw);
  let changed = false;

  if (
    s["windsurf.acp.enabledAgents"] &&
    AGENT_ID in s["windsurf.acp.enabledAgents"]
  ) {
    log(`  将删除 windsurf.acp.enabledAgents["${AGENT_ID}"]`);
    if (!DRY) delete s["windsurf.acp.enabledAgents"][AGENT_ID];
    changed = true;
  }

  if (s["windsurf.acp.agentEnv"] && s["windsurf.acp.agentEnv"][AGENT_ID]) {
    log(`  将删除 windsurf.acp.agentEnv["${AGENT_ID}"]`);
    if (!DRY) {
      delete s["windsurf.acp.agentEnv"][AGENT_ID];
      if (Object.keys(s["windsurf.acp.agentEnv"]).length === 0) {
        delete s["windsurf.acp.agentEnv"];
        console.log("    (agentEnv 已空, 整体删除)");
      }
    }
    changed = true;
  }

  if (!changed) {
    console.log("  - 无残留");
    return;
  }
  if (!DRY) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2) + "\n");
    console.log("  ✓ settings.json 已保存");
  }
}

function verify() {
  console.log("\n═══ 验证 ═══");
  const checks = [
    ["stub 扩展目录", STUB_EXT_DIR, false],
    ...REGISTRY_PATHS.map((p) => [`registry: ${p.split(/[\\/]/).slice(-3).join("/")}`, p, null]),
    ["settings.json", SETTINGS_PATH, null],
  ];
  for (const [label, p, expectExist] of checks) {
    const exists = fs.existsSync(p);
    if (expectExist === false) {
      console.log(`  ${!exists ? "✓" : "✗"} ${label}: ${!exists ? "已移除" : "仍存在"}`);
    } else if (p.endsWith("registry.json")) {
      if (!exists) {
        console.log(`  ✓ ${label}: 不存在 (已还原)`);
      } else {
        try {
          const r = JSON.parse(fs.readFileSync(p, "utf8"));
          const hasDao = (r.agents || []).some((a) => a.id === AGENT_ID);
          console.log(`  ${hasDao ? "✗" : "✓"} ${label}: ${hasDao ? "仍含 dao-agent" : "已清理 (剩 " + (r.agents||[]).length + " agents)"}`);
        } catch {
          console.log(`  - ${label}: 解析失败`);
        }
      }
    } else if (p === SETTINGS_PATH && exists) {
      const s = JSON.parse(fs.readFileSync(p, "utf8"));
      const inEnabled =
        s["windsurf.acp.enabledAgents"] &&
        AGENT_ID in s["windsurf.acp.enabledAgents"];
      const inEnv =
        s["windsurf.acp.agentEnv"] && s["windsurf.acp.agentEnv"][AGENT_ID];
      console.log(
        `  ${!inEnabled && !inEnv ? "✓" : "✗"} ${label}: ${
          !inEnabled && !inEnv ? "已清理" : "残留"
        }`,
      );
    }
  }
}

// ── Main ─────────────────────────────────────────────
console.log("╔═══════════════════════════════════════╗");
console.log("║  道Agent 反向解耦 · 反者道之动        ║");
console.log("║  撤销 Windsurf 侵入, 恢复零干扰       ║");
console.log("╚═══════════════════════════════════════╝");
if (DRY) console.log("\n[DRY RUN — 不会实际修改]");

step1_removeStubExtension();
step2_cleanRegistries();
step3_cleanSettings();
verify();

console.log("\n═══ 完成 ═══");
console.log("Windsurf 已恢复到 dao-agent 侵入前的状态.");
console.log("反代方案 (010-反代_Proxy, 端口 :8878) 不受影响, 继续工作.");
