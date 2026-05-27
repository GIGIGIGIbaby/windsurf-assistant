#!/usr/bin/env node
/**
 * 道Agent 安装脚本 v2 — 道法自然 · 解耦重塑
 * ==========================================
 * 默认零副作用. 只检查状态和给出使用说明.
 * 任何侵入 Windsurf 的操作都是可选的, 且需显式二次确认.
 *
 * 本项目的三种使用方式 (由用户按需选择):
 *
 *   ① Windsurf 里用任意 LLM (推荐, 零干扰)
 *       → 使用 `../010-反代_Proxy` (已完成, 端口 :8878)
 *       → 本目录 dao-agent 不涉入
 *
 *   ② 独立本地 Agent REPL
 *       → 使用 `../010-反代_Proxy/core/dao_agent.js` (已完成)
 *       → 本目录 dao-agent 仅作 ACP 协议层
 *
 *   ③ 将本目录 dao-agent 以 ACP 协议接入 Windsurf (可选 · 侵入性)
 *       → 需显式执行: node setup.js --acp-install --yes
 *       → 随时可撤销: node unwind.js
 *
 * Usage:
 *   node setup.js                 # 检查状态 + 打印使用说明 (零副作用)
 *   node setup.js --check         # 同上
 *   node setup.js --acp-install   # 预览 ACP 接入操作 (dry, 不执行)
 *   node setup.js --acp-install --yes
 *                                 # 执行 ACP 接入 (有侵入性, 需显式 --yes)
 *   node setup.js --acp-remove    # 等同 node unwind.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const AGENT_ID = "dao-agent";
const AGENT_DIR = __dirname;
const AGENT_ENTRY = path.join(AGENT_DIR, "index.js");
const RELAY_URL = "http://127.0.0.1:8878/health";

// ── 路径常量 ─────────────────────────────────────────
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

const PRIMARY_REGISTRY = REGISTRY_PATHS[0];

// ── 状态检查 ─────────────────────────────────────────
function checkNode() {
  const v = process.versions.node.split(".").map(Number);
  const ok = v[0] >= 18;
  return { ok, version: process.versions.node, required: ">=18" };
}

function checkRelay() {
  return new Promise((resolve) => {
    const http = require("http");
    const req = http.get(RELAY_URL, { timeout: 1500 }, (res) => {
      resolve({ ok: res.statusCode === 200, status: res.statusCode });
      res.resume();
    });
    req.on("error", (e) => resolve({ ok: false, error: e.code || e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
  });
}

function checkWindsurfIntrusion() {
  const marks = {
    stubExt: fs.existsSync(STUB_EXT_DIR),
    registries: REGISTRY_PATHS.filter(isRegistryWithDao).length,
    settings: isSettingsWithDao(),
  };
  marks.clean = !marks.stubExt && marks.registries === 0 && !marks.settings;
  return marks;
}

function isRegistryWithDao(p) {
  try {
    if (!fs.existsSync(p)) return false;
    const r = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(r.agents) && r.agents.some((a) => a.id === AGENT_ID);
  } catch {
    return false;
  }
}

function isSettingsWithDao() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return false;
    const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    const e = s["windsurf.acp.enabledAgents"] || {};
    const v = s["windsurf.acp.agentEnv"] || {};
    return AGENT_ID in e || AGENT_ID in v;
  } catch {
    return false;
  }
}

// ── 打印使用说明 ─────────────────────────────────────
function printUsageGuide() {
  console.log("");
  console.log("┌─────────────────────────────────────────────────────────┐");
  console.log("│ 使用方式 (按需择一 · 不必都用)                          │");
  console.log("├─────────────────────────────────────────────────────────┤");
  console.log("│ ① Windsurf + 任意 LLM  [推荐 · 零干扰]                  │");
  console.log("│    cd ../010-反代_Proxy                                 │");
  console.log("│    node core/universal_relay.js    # 启动反代 :8878     │");
  console.log("│    # Windsurf 原生 Cascade 会使用任意 LLM               │");
  console.log("│                                                         │");
  console.log("│ ② 独立 CLI Agent REPL                                   │");
  console.log("│    cd ../010-反代_Proxy                                 │");
  console.log("│    node core/dao_agent.js          # 交互式 REPL        │");
  console.log("│                                                         │");
  console.log("│ ③ 本目录以 ACP 协议接入 Windsurf  [可选 · 侵入性]       │");
  console.log("│    node setup.js --acp-install         # 预览           │");
  console.log("│    node setup.js --acp-install --yes   # 执行           │");
  console.log("│    node unwind.js                       # 撤销          │");
  console.log("└─────────────────────────────────────────────────────────┘");
  console.log("");
}

async function cmdCheck() {
  console.log("═══ 环境检查 ═══\n");

  const node = checkNode();
  console.log(`${node.ok ? "✓" : "✗"} Node.js: ${node.version} (需要 ${node.required})`);

  const agent = fs.existsSync(AGENT_ENTRY);
  console.log(`${agent ? "✓" : "✗"} ACP server: ${AGENT_ENTRY}`);

  const relay = await checkRelay();
  console.log(
    `${relay.ok ? "✓" : "○"} 反代服务 :8878: ${
      relay.ok ? "在线" : "离线 (" + (relay.error || relay.status) + ")"
    }`,
  );

  console.log("\n═══ Windsurf 侵入检查 ═══\n");
  const intr = checkWindsurfIntrusion();
  console.log(
    `${!intr.stubExt ? "✓" : "✗"} stub 扩展 (Codeium.codeium-dev): ${
      intr.stubExt ? "存在 (侵入态)" : "不存在 (干净)"
    }`,
  );
  console.log(
    `${intr.registries === 0 ? "✓" : "✗"} registry.json 含 dao-agent: ${
      intr.registries === 0 ? "无 (干净)" : intr.registries + " 处 (侵入态)"
    }`,
  );
  console.log(
    `${!intr.settings ? "✓" : "✗"} settings.json 含 dao-agent: ${
      intr.settings ? "是 (侵入态)" : "否 (干净)"
    }`,
  );

  console.log("");
  if (intr.clean) {
    console.log("→ Windsurf 处于零干扰状态 (方式 ①② 无需改动)");
  } else {
    console.log("→ Windsurf 有 dao-agent ACP 侵入 (方式 ③)");
    console.log("  如需撤销: node unwind.js");
  }

  printUsageGuide();
}

// ── ACP 接入 (可选 · 侵入性) ─────────────────────────
function buildAgentEntry() {
  const agentPath = AGENT_ENTRY.replace(/\\/g, "/");
  const binary = {};
  const envDefault = {
    DAO_PROVIDER: "ag",
    DAO_MODEL: "claude-sonnet-4-6",
    DAO_LOG_LEVEL: "info",
  };
  const platformKey = {
    win32: "windows-x86_64",
    darwin: process.arch === "arm64" ? "darwin-aarch64" : "darwin-x86_64",
    linux: "linux-x86_64",
  }[process.platform];
  if (platformKey) {
    binary[platformKey] = { cmd: "node", args: [agentPath], env: envDefault };
  }
  return {
    id: AGENT_ID,
    name: "道Agent",
    version: "1.0.0",
    description: "自由模型 Agent — 道法自然",
    authors: ["道法自然"],
    license: "MIT",
    "cognition.ai/bundled": true,
    distribution: { binary },
  };
}

function cmdAcpInstall(dry) {
  console.log("═══ ACP 接入 Windsurf (方式 ③ · 侵入性操作) ═══\n");
  console.log("将执行以下 " + (dry ? "[预览]" : "[实操]") + " 操作:");
  console.log("");
  console.log("  1. 创建 stub 扩展:");
  console.log("     " + STUB_EXT_DIR);
  console.log("     [冒用 Codeium.codeium-dev 身份以绕过 Unleash 特性门]");
  console.log("");
  console.log("  2. 写入 ACP registry (仅主路径, 不再散播 3 处):");
  console.log("     " + PRIMARY_REGISTRY);
  console.log("");
  console.log("  3. 更新 settings.json:");
  console.log("     " + SETTINGS_PATH);
  console.log("     + windsurf.acp.enabledAgents['dao-agent'] = true");
  console.log("     + windsurf.acp.agentEnv['dao-agent'] = { DAO_PROVIDER: 'ag', ... }");
  console.log("");
  console.log("⚠ 已知副作用:");
  console.log("   - 创建伪 Codeium 扩展, 可能被未来版本视为异常");
  console.log("   - Windsurf 升级时可能与新 Unleash 规则冲突");
  console.log("   - 替代方案 ①② 可实现等效功能且无此副作用");
  console.log("");

  if (dry) {
    console.log("→ 这是预览. 确认执行: node setup.js --acp-install --yes");
    console.log("→ 撤销: node unwind.js");
    return;
  }

  // 实际执行
  console.log("═══ 执行中 ═══\n");

  // Step 1: stub extension
  if (fs.existsSync(STUB_EXT_DIR)) {
    console.log("- stub 扩展已存在, 跳过");
  } else {
    fs.mkdirSync(STUB_EXT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(STUB_EXT_DIR, "package.json"),
      JSON.stringify(
        {
          name: "codeium-dev",
          displayName: "Codeium Dev",
          description: "Dev extension stub for ACP custom agent support",
          version: "0.0.1",
          publisher: "Codeium",
          engines: { vscode: "^1.80.0" },
          categories: ["Other"],
          activationEvents: [],
          main: "./extension.js",
          contributes: {},
        },
        null,
        2,
      ) + "\n",
    );
    fs.writeFileSync(
      path.join(STUB_EXT_DIR, "extension.js"),
      "// Stub — no-op\nmodule.exports={activate(){},deactivate(){}};\n",
    );
    console.log("✓ stub 扩展已创建");
  }

  // Step 2: primary registry only (不再污染 3 处)
  const regDir = path.dirname(PRIMARY_REGISTRY);
  if (!fs.existsSync(regDir)) fs.mkdirSync(regDir, { recursive: true });
  let reg = { version: "1.0.0", agents: [] };
  if (fs.existsSync(PRIMARY_REGISTRY)) {
    try {
      reg = JSON.parse(fs.readFileSync(PRIMARY_REGISTRY, "utf8"));
      if (!Array.isArray(reg.agents)) reg.agents = [];
    } catch {}
  }
  const entry = buildAgentEntry();
  const i = reg.agents.findIndex((a) => a.id === AGENT_ID);
  if (i >= 0) reg.agents[i] = entry;
  else reg.agents.push(entry);
  fs.writeFileSync(PRIMARY_REGISTRY, JSON.stringify(reg, null, 2) + "\n");
  console.log("✓ registry 已写入: " + PRIMARY_REGISTRY);

  // Step 3: settings
  if (fs.existsSync(SETTINGS_PATH)) {
    const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
    s["windsurf.acp.enabledAgents"] = {
      ...(s["windsurf.acp.enabledAgents"] || {}),
      [AGENT_ID]: true,
    };
    s["windsurf.acp.agentEnv"] = {
      ...(s["windsurf.acp.agentEnv"] || {}),
      [AGENT_ID]: {
        DAO_PROVIDER: process.env.DAO_PROVIDER || "ag",
        DAO_MODEL: process.env.DAO_MODEL || "claude-sonnet-4-6",
        DAO_LOG_LEVEL: "info",
      },
    };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2) + "\n");
    console.log("✓ settings.json 已更新");
  } else {
    console.log("- settings.json 不存在, 跳过 (Windsurf 首次启动后再运行)");
  }

  console.log("");
  console.log("═══ 完成 ═══");
  console.log("下一步:");
  console.log("  1. Windsurf: Ctrl+Shift+P → Reload Window");
  console.log("  2. Ctrl+Shift+/ (Agent Selector) → 选择 道Agent");
  console.log("  3. 撤销: node unwind.js");
}

function cmdAcpRemove() {
  const unwindPath = path.join(AGENT_DIR, "unwind.js");
  if (!fs.existsSync(unwindPath)) {
    console.log("unwind.js 不存在, 无法自动撤销");
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [unwindPath], { stdio: "inherit" });
  process.exit(r.status || 0);
}

// ── Main ─────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  console.log("╔═══════════════════════════════════════╗");
  console.log("║  道Agent Setup · 道法自然             ║");
  console.log("╚═══════════════════════════════════════╝");

  if (args.includes("--acp-install")) {
    const yes = args.includes("--yes") || args.includes("-y");
    cmdAcpInstall(!yes);
    return;
  }
  if (args.includes("--acp-remove") || args.includes("--remove")) {
    cmdAcpRemove();
    return;
  }
  // default / --check / --info
  await cmdCheck();
})();
