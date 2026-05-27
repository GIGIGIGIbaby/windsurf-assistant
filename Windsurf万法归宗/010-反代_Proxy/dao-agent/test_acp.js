#!/usr/bin/env node
/**
 * 道Agent ACP 协议测试工具
 * 模拟 Windsurf IDE 发送 ACP 请求,验证 dao-agent 响应
 */
"use strict";

const { spawn } = require("child_process");
const path = require("path");
const readline = require("readline");

const AGENT_PATH = path.join(__dirname, "index.js");
let requestId = 1;
const pendingRequests = new Map();

// ── 启动 dao-agent 子进程 ────────────────────────────
console.log("╔═══════════════════════════════════════╗");
console.log("║  道Agent ACP Protocol Test Harness    ║");
console.log("╚═══════════════════════════════════════╝");
console.log(`Starting: node ${AGENT_PATH}`);
console.log("");

const agent = spawn("node", [AGENT_PATH], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    DAO_LOG_LEVEL: "debug",
    DAO_PROVIDER: process.env.DAO_PROVIDER || "ag",
  },
});

// ── stderr → console (agent 日志) ────────────────────
agent.stderr.on("data", (data) => {
  process.stderr.write(`  [agent] ${data}`);
});

// ── stdout → ndjson parser ───────────────────────────
let buffer = "";
agent.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      handleAgentMessage(msg);
    } catch (e) {
      console.error("Parse error:", e.message, "line:", trimmed.slice(0, 100));
    }
  }
});

agent.on("exit", (code) => {
  console.log(`\nAgent exited with code ${code}`);
  process.exit(code || 0);
});

// ── 消息处理 ─────────────────────────────────────────
function handleAgentMessage(msg) {
  // 响应我们的请求
  if (msg.id != null && (msg.result !== undefined || msg.error !== undefined)) {
    const pending = pendingRequests.get(msg.id);
    if (pending) {
      pendingRequests.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.error) {
        console.log(`✗ Response #${msg.id} ERROR:`, JSON.stringify(msg.error));
        pending.reject(new Error(msg.error.message));
      } else {
        console.log(
          `✓ Response #${msg.id}:`,
          JSON.stringify(msg.result).slice(0, 300),
        );
        pending.resolve(msg.result);
      }
    }
    return;
  }

  // Agent 向 IDE 发起请求 (tool calls)
  if (msg.method && msg.id != null) {
    console.log(
      `⚡ Agent request #${msg.id}: ${msg.method}`,
      JSON.stringify(msg.params || {}).slice(0, 200),
    );
    handleAgentRequest(msg);
    return;
  }

  // 通知
  if (msg.method) {
    const content = msg.params?.message?.content;
    const text = content?.[0]?.text || "";
    const eventType =
      msg.params?.message?._meta?.["cognition.ai/eventType"] || "";
    if (eventType === "complete") {
      console.log("━━━ [COMPLETE] ━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    } else if (eventType === "thinking") {
      console.log(`💭 ${text.slice(0, 200)}`);
    } else if (text) {
      console.log(`📝 ${text.slice(0, 500)}`);
    }
  }
}

// ── 模拟 IDE 执行 Agent 的工具请求 ───────────────────
function handleAgentRequest(msg) {
  const { method, params, id } = msg;

  switch (method) {
    case "fs/read_text_file": {
      const filePath = params?.path;
      const fs = require("fs");
      try {
        const content = fs.readFileSync(filePath, "utf8");
        sendToAgent({ jsonrpc: "2.0", id, result: { content } });
        console.log(`  → read ${filePath} (${content.length} chars)`);
      } catch (e) {
        sendToAgent({
          jsonrpc: "2.0",
          id,
          error: { code: -1, message: e.message },
        });
      }
      break;
    }

    case "fs/write_text_file": {
      const filePath = params?.path;
      const content = params?.content || "";
      const fs = require("fs");
      try {
        fs.writeFileSync(filePath, content, "utf8");
        sendToAgent({ jsonrpc: "2.0", id, result: { success: true } });
        console.log(`  → wrote ${filePath} (${content.length} chars)`);
      } catch (e) {
        sendToAgent({
          jsonrpc: "2.0",
          id,
          error: { code: -1, message: e.message },
        });
      }
      break;
    }

    case "terminal/create": {
      const cmd = params?.command;
      console.log(`  → exec: ${cmd}`);
      const { execSync } = require("child_process");
      try {
        const output = execSync(cmd, {
          cwd: params?.cwd || process.cwd(),
          timeout: 30000,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        sendToAgent({
          jsonrpc: "2.0",
          id,
          result: { output: output.toString() },
        });
      } catch (e) {
        sendToAgent({
          jsonrpc: "2.0",
          id,
          result: {
            output: e.stdout?.toString() || "",
            error: e.stderr?.toString() || e.message,
          },
        });
      }
      break;
    }

    default:
      console.log(`  → Unknown method: ${method}, returning empty`);
      sendToAgent({ jsonrpc: "2.0", id, result: {} });
  }
}

// ── 发送消息给 Agent ─────────────────────────────────
function sendToAgent(msg) {
  agent.stdin.write(JSON.stringify(msg) + "\n");
}

function sendRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = requestId++;
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request ${method} timed out`));
    }, 120000);
    pendingRequests.set(id, { resolve, reject, timer });
    console.log(`→ Sending #${id}: ${method}`);
    sendToAgent({ jsonrpc: "2.0", id, method, params });
  });
}

// ── 测试序列 ─────────────────────────────────────────
async function runTests() {
  // 等待 agent 启动
  await sleep(500);

  console.log("\n═══ Test 1: initialize ═══");
  const initResult = await sendRequest("initialize", {
    protocolVersion: 1,
    clientCapabilities: {
      elicitation: { form: {} },
      _meta: {
        "cognition.ai/subagentSupport": true,
        "cognition.ai/multiRootWorkspace": true,
        "cognition.ai/partialContent": true,
        "cognition.ai/messageGrouping": true,
      },
    },
  });
  console.log("  Agent name:", initResult.serverInfo?.name);
  console.log("  Protocol:", initResult.protocolVersion);

  console.log("\n═══ Test 2: session/new ═══");
  const sessionResult = await sendRequest("session/new", {
    sessionId: "test-session-001",
  });
  console.log("  Session ID:", sessionResult.sessionId);

  // 只有在 API_KEY 可用时才测试 LLM 调用
  const apiKey =
    process.env.DAO_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY;

  if (apiKey) {
    console.log("\n═══ Test 3: session/prompt (with LLM) ═══");
    console.log("  Sending prompt: 'What is 2+2? Answer briefly.'");
    const promptResult = await sendRequest("session/prompt", {
      sessionId: "test-session-001",
      prompt: [{ type: "text", text: "What is 2+2? Answer in one word." }],
    });
    console.log("  Prompt completed.");

    console.log("\n═══ Test 4: session/prompt (with tool call) ═══");
    console.log("  Sending prompt to read a file...");
    const toolResult = await sendRequest("session/prompt", {
      sessionId: "test-session-001",
      prompt: [
        {
          type: "text",
          text: `Read the file at ${path.join(__dirname, "package.json")} and tell me the version.`,
        },
      ],
    });
    console.log("  Tool prompt completed.");
  } else {
    console.log("\n⚠ Skipping LLM tests (no API key set)");
    console.log(
      "  Set DAO_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY to test LLM calls",
    );
  }

  console.log("\n═══ All tests passed ═══");
  console.log("dao-agent ACP protocol is working correctly.\n");

  // 清理
  agent.kill();
  process.exit(0);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

runTests().catch((err) => {
  console.error("Test failed:", err.message);
  agent.kill();
  process.exit(1);
});
