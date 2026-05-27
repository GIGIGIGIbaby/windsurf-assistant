#!/usr/bin/env node
/**
 * 道Agent — ACP Server for Windsurf
 * ==================================
 * 道法自然 · 无为而无不为 · 自由模型 · 完整工具调用
 *
 * ACP Protocol: JSON-RPC 2.0 over ndjson (stdin/stdout)
 * Transport: stdio (spawned by Windsurf Extension Host)
 *
 * Lifecycle:
 *   IDE → initialize        → Agent responds with capabilities
 *   IDE → session/prompt     → Agent starts reasoning + tool calls
 *   Agent → fs/read_text_file   → IDE reads file, returns content
 *   Agent → fs/write_text_file  → IDE writes file, returns result
 *   Agent → terminal/create     → IDE creates terminal
 *   Agent → ext/method          → IDE executes extension method
 *   Agent → notifications/message → IDE shows streaming content
 *
 * Model routing: configurable via DAO_PROVIDER env var
 *   anthropic (default) | openai | gemini | deepseek | openrouter | local
 */
"use strict";

const readline = require("readline");
const https = require("https");
const http = require("http");

// ── 日志 (stderr, 不干扰 ndjson stdout) ──────────────────────────
const LOG_LEVEL = process.env.DAO_LOG_LEVEL || "info";
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
function log(level, ...args) {
  if ((LOG_LEVELS[level] ?? 2) <= (LOG_LEVELS[LOG_LEVEL] ?? 2)) {
    process.stderr.write(`[dao-agent][${level}] ${args.join(" ")}\n`);
  }
}

// ── 配置 ─────────────────────────────────────────────────────────
const PROVIDER = process.env.DAO_PROVIDER || "ag";
const MODEL = process.env.DAO_MODEL || getDefaultModel(PROVIDER);
const API_KEY = getApiKey(PROVIDER);
const API_BASE = process.env.DAO_API_BASE || getDefaultBase(PROVIDER);
const MAX_TURNS = parseInt(process.env.DAO_MAX_TURNS || "30");
const TIMEOUT_MS = parseInt(process.env.DAO_TIMEOUT_MS || "120000");

function getDefaultModel(provider) {
  switch (provider) {
    case "anthropic":
      return "claude-sonnet-4-20250514";
    case "openai":
      return "gpt-4.1";
    case "gemini":
      return "gemini-2.5-pro";
    case "deepseek":
      return "deepseek-chat";
    case "openrouter":
      return "anthropic/claude-sonnet-4";
    case "ag":
      return "claude-sonnet-4-6";
    default:
      return "claude-sonnet-4-6";
  }
}

function getApiKey(provider) {
  return (
    process.env.DAO_API_KEY ||
    process.env[`${provider.toUpperCase()}_API_KEY`] ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "dao-agent"
  );
}

function getDefaultBase(provider) {
  switch (provider) {
    case "anthropic":
      return "https://api.anthropic.com";
    case "openai":
      return "https://api.openai.com";
    case "gemini":
      return "https://generativelanguage.googleapis.com";
    case "deepseek":
      return "https://api.deepseek.com";
    case "openrouter":
      return "https://openrouter.ai/api";
    case "ag":
      return "http://127.0.0.1:8877";
    default:
      return "http://127.0.0.1:8877";
  }
}

// ── ndjson 通信层 ────────────────────────────────────────────────
let requestIdCounter = 1;
const pendingResponses = new Map(); // id → { resolve, reject, timer }

function send(msg) {
  const line = JSON.stringify(msg) + "\n";
  process.stdout.write(line);
  log("trace", "→", line.trim().slice(0, 200));
}

function sendResponse(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function sendNotification(method, params) {
  send({ jsonrpc: "2.0", method, params });
}

function sendRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = requestIdCounter++;
    const timer = setTimeout(() => {
      pendingResponses.delete(id);
      reject(new Error(`Request ${method} timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    pendingResponses.set(id, { resolve, reject, timer });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

// ── stdin 消息分发 ───────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  log("trace", "←", trimmed.slice(0, 200));

  try {
    const msg = JSON.parse(trimmed);

    // 响应 (IDE 回复我们的请求)
    if (
      msg.id != null &&
      (msg.result !== undefined || msg.error !== undefined)
    ) {
      const pending = pendingResponses.get(msg.id);
      if (pending) {
        pendingResponses.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.error) {
          pending.reject(
            new Error(msg.error.message || JSON.stringify(msg.error)),
          );
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }

    // 请求 (IDE 向我们发起)
    if (msg.method) {
      handleIdeRequest(msg).catch((err) => {
        log("error", `Error handling ${msg.method}:`, err.message);
        if (msg.id != null) {
          sendError(msg.id, -32603, err.message);
        }
      });
    }
  } catch (e) {
    log("error", "Parse error:", e.message, "line:", trimmed.slice(0, 100));
  }
});

rl.on("close", () => {
  log("info", "stdin closed, exiting");
  process.exit(0);
});

// ── IDE 请求处理器 ───────────────────────────────────────────────
const sessions = new Map(); // sessionId → { messages, turn }

async function handleIdeRequest(msg) {
  const { method, params, id } = msg;
  log("info", `← IDE: ${method}` + (id != null ? ` (id=${id})` : ""));

  switch (method) {
    case "initialize":
      return handleInitialize(id, params);

    case "authenticate":
      return sendResponse(id, {});

    case "session/new":
      return handleSessionNew(id, params);

    case "session/prompt":
      return handleSessionPrompt(id, params);

    case "session/cancel":
      return handleSessionCancel(id, params);

    case "session/load":
      return sendResponse(id, { messages: [] });

    case "session/list":
      return sendResponse(id, { sessions: [] });

    case "session/set_mode":
      return sendResponse(id, {});

    default:
      log("warn", `Unknown method: ${method}`);
      if (id != null) sendResponse(id, {});
  }
}

// ── initialize ───────────────────────────────────────────────────
function handleInitialize(id, params) {
  log(
    "info",
    "Initializing dao-agent",
    `protocol=${params?.protocolVersion}`,
    `provider=${PROVIDER}`,
    `model=${MODEL}`,
  );

  sendResponse(id, {
    protocolVersion: 1,
    agentCapabilities: {
      streaming: true,
    },
    serverInfo: {
      name: "dao-agent",
      version: "1.0.0",
    },
  });
}

// ── session/new ──────────────────────────────────────────────────
function handleSessionNew(id, params) {
  const sessionId = params?.sessionId || `dao-${Date.now()}`;
  sessions.set(sessionId, { messages: [], turn: 0 });
  log("info", `New session: ${sessionId}`);
  sendResponse(id, { sessionId });
}

// ── session/cancel ───────────────────────────────────────────────
function handleSessionCancel(id, params) {
  log("info", `Session cancel: ${params?.sessionId}`);
  if (id != null) sendResponse(id, {});
}

// ── session/prompt — 核心 Agent Loop ─────────────────────────────
async function handleSessionPrompt(id, params) {
  const { sessionId, prompt } = params || {};
  log("info", `Prompt for session ${sessionId}`);

  // 提取用户文本
  const userText = (prompt || [])
    .map((p) => p.text || (p.content ? JSON.stringify(p.content) : ""))
    .filter(Boolean)
    .join("\n");

  if (!userText) {
    sendResponse(id, {});
    return;
  }

  // 获取或创建会话
  let session = sessions.get(sessionId);
  if (!session) {
    session = { messages: [], turn: 0 };
    sessions.set(sessionId, session);
  }

  // 添加用户消息
  session.messages.push({ role: "user", content: userText });

  // Agent Loop
  try {
    await agentLoop(session, sessionId);
  } catch (err) {
    log("error", "Agent loop error:", err.message);
    sendNotification("notifications/message", {
      sessionId,
      message: {
        role: "assistant",
        content: [{ type: "text", text: `Error: ${err.message}` }],
      },
    });
  }

  // 响应原始请求
  sendResponse(id, {});
}

// ── Agent Loop — 持续调用 LLM 直到不再需要工具 ────────────────────
async function agentLoop(session, sessionId) {
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    session.turn = turn;
    log("info", `Agent loop turn ${turn + 1}/${MAX_TURNS}`);

    // 构建 LLM 请求
    const systemPrompt = buildSystemPrompt();
    const tools = buildToolDefinitions();
    const llmMessages = session.messages.map(formatMessageForLLM);

    // 调用 LLM
    const response = await callLLM(systemPrompt, llmMessages, tools);

    if (!response) {
      log("error", "Empty LLM response");
      streamText(
        sessionId,
        "I encountered an error calling the model. Please try again.",
      );
      streamComplete(sessionId);
      return;
    }

    // 处理 LLM 响应
    const { text, toolCalls, thinking } = response;

    // 流式推送思考过程
    if (thinking) {
      streamThinking(sessionId, thinking);
    }

    // 流式推送文本
    if (text) {
      streamText(sessionId, text);
    }

    if (!toolCalls || toolCalls.length === 0) {
      // 无工具调用 — Agent Loop 结束
      streamComplete(sessionId);
      session.messages.push({ role: "assistant", content: text || "" });
      return;
    }

    // 有工具调用 — 执行并继续循环
    log("info", `LLM wants ${toolCalls.length} tool call(s)`);

    // 先记录 assistant 消息 (含 tool_calls)
    session.messages.push({
      role: "assistant",
      content: text || "",
      tool_calls: toolCalls,
    });

    // 逐个执行工具调用
    for (const tc of toolCalls) {
      log("info", `Tool call: ${tc.name} (${tc.id})`);

      // 通知 IDE 我们正在调用工具
      streamToolCall(sessionId, tc);

      try {
        const result = await executeToolViaAcp(tc);
        log(
          "info",
          `Tool result for ${tc.name}: ${JSON.stringify(result).slice(0, 200)}`,
        );

        // 追加工具结果到消息历史
        session.messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: extractToolResultText(result),
        });

        // 通知 IDE 工具执行完成
        streamToolResult(sessionId, tc, result);
      } catch (err) {
        log("error", `Tool ${tc.name} failed:`, err.message);
        session.messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: `Error: ${err.message}`,
        });
      }
    }

    // 继续 Agent Loop (下一轮 LLM 调用)
  }

  // 达到最大轮次
  streamText(
    sessionId,
    `\n\n[dao-agent] Reached maximum ${MAX_TURNS} turns. Stopping.`,
  );
  streamComplete(sessionId);
}

// ── 流式通知 ─────────────────────────────────────────────────────
function streamText(sessionId, text) {
  sendNotification("notifications/message", {
    sessionId,
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
    },
  });
}

function streamThinking(sessionId, text) {
  sendNotification("notifications/message", {
    sessionId,
    message: {
      role: "assistant",
      content: [{ type: "text", text: `<thinking>\n${text}\n</thinking>\n` }],
      _meta: { "cognition.ai/eventType": "thinking" },
    },
  });
}

function streamToolCall(sessionId, tc) {
  sendNotification("notifications/message", {
    sessionId,
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: `Calling tool: ${tc.name}`,
        },
      ],
      _meta: {
        "cognition.ai/eventType": "tool_call",
        "cognition.ai/toolName": tc.name,
      },
    },
  });
}

function streamToolResult(sessionId, tc, result) {
  sendNotification("notifications/message", {
    sessionId,
    message: {
      role: "tool",
      content: [
        {
          type: "text",
          text: extractToolResultText(result),
        },
      ],
      _meta: {
        "cognition.ai/toolCallId": tc.id,
      },
    },
  });
}

function streamComplete(sessionId) {
  sendNotification("notifications/message", {
    sessionId,
    message: {
      role: "assistant",
      content: [{ type: "text", text: "" }],
      _meta: { "cognition.ai/eventType": "complete" },
    },
  });
}

// ── ACP 工具执行 (Agent → IDE) ───────────────────────────────────
async function executeToolViaAcp(tc) {
  const { name, arguments: args } = tc;
  let parsedArgs;
  try {
    parsedArgs = typeof args === "string" ? JSON.parse(args) : args;
  } catch {
    parsedArgs = {};
  }

  // 映射 LLM 工具名 → ACP 方法
  switch (name) {
    case "read_file":
    case "read_text_file":
      return sendRequest("fs/read_text_file", {
        path: parsedArgs.path || parsedArgs.file_path,
      });

    case "write_file":
    case "write_text_file":
      return sendRequest("fs/write_text_file", {
        path: parsedArgs.path || parsedArgs.file_path,
        content: parsedArgs.content,
      });

    case "run_command":
    case "execute_command": {
      // 创建终端 → 执行命令 → 读取输出
      const termResult = await sendRequest("terminal/create", {
        command: parsedArgs.command || parsedArgs.cmd,
        cwd: parsedArgs.cwd,
        waitForExit: true,
      });
      return termResult;
    }

    case "list_directory":
    case "list_dir": {
      // 使用 terminal/create 执行 ls/dir
      const isWin = process.platform === "win32";
      const cmd = isWin
        ? `dir /b "${parsedArgs.path || "."}"`
        : `ls -la "${parsedArgs.path || "."}"`;
      return sendRequest("terminal/create", {
        command: cmd,
        cwd: parsedArgs.path,
        waitForExit: true,
      });
    }

    case "grep_search":
    case "search": {
      const isWin = process.platform === "win32";
      const query = parsedArgs.query || parsedArgs.pattern;
      const searchPath = parsedArgs.path || parsedArgs.search_path || ".";
      const cmd = isWin
        ? `findstr /s /n /i "${query}" "${searchPath}\\*"`
        : `grep -rn "${query}" "${searchPath}"`;
      return sendRequest("terminal/create", {
        command: cmd,
        waitForExit: true,
      });
    }

    default:
      // 尝试通过 ext/method 执行
      return sendRequest("ext/method", {
        method: name,
        params: parsedArgs,
      });
  }
}

function extractToolResultText(result) {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (result.content) {
    if (typeof result.content === "string") return result.content;
    if (Array.isArray(result.content)) {
      return result.content.map((c) => c.text || JSON.stringify(c)).join("\n");
    }
  }
  if (result.text) return result.text;
  if (result.output) return result.output;
  return JSON.stringify(result);
}

// ── 系统提示词 ───────────────────────────────────────────────────
function buildSystemPrompt() {
  return `You are dao-agent, a powerful coding assistant running inside the Windsurf IDE.
You have access to the user's workspace and can perform actions using tools.

Available tools:
- read_file: Read a file from the workspace. Args: {"path": "absolute_or_relative_path"}
- write_file: Write content to a file. Args: {"path": "path", "content": "file_content"}
- run_command: Execute a shell command. Args: {"command": "cmd", "cwd": "optional_working_dir"}
- list_directory: List files in a directory. Args: {"path": "directory_path"}
- grep_search: Search for text patterns in files. Args: {"query": "search_pattern", "path": "search_path"}

Guidelines:
- Always read files before modifying them
- Use absolute paths when possible
- Be concise and direct in responses
- Execute one tool at a time for clarity
- When writing files, include the complete file content`;
}

// ── 工具定义 (传递给 LLM) ────────────────────────────────────────
function buildToolDefinitions() {
  return [
    {
      name: "read_file",
      description: "Read the contents of a file from the workspace",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute or relative path to the file",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description:
        "Write content to a file in the workspace. Creates the file if it doesn't exist.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file" },
          content: {
            type: "string",
            description: "Complete file content to write",
          },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "run_command",
      description: "Execute a shell command in the workspace",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
          cwd: { type: "string", description: "Working directory (optional)" },
        },
        required: ["command"],
      },
    },
    {
      name: "list_directory",
      description: "List files and directories at a given path",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path to list" },
        },
        required: ["path"],
      },
    },
    {
      name: "grep_search",
      description: "Search for text patterns in files recursively",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text pattern to search for" },
          path: { type: "string", description: "Directory to search in" },
        },
        required: ["query"],
      },
    },
  ];
}

// ── LLM 调用层 — 多提供商统一接口 ────────────────────────────────
async function callLLM(systemPrompt, messages, tools) {
  switch (PROVIDER) {
    case "anthropic":
      return callAnthropic(systemPrompt, messages, tools);
    case "openai":
    case "deepseek":
    case "openrouter":
    case "ag":
      return callOpenAI(systemPrompt, messages, tools);
    default:
      return callOpenAI(systemPrompt, messages, tools);
  }
}

// ── Anthropic Messages API ───────────────────────────────────────
async function callAnthropic(systemPrompt, messages, tools) {
  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  // 转换消息格式
  const anthropicMessages = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      anthropicMessages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      const content = [];
      if (msg.content) content.push({ type: "text", text: msg.content });
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input:
              typeof tc.arguments === "string"
                ? JSON.parse(tc.arguments)
                : tc.arguments,
          });
        }
      }
      anthropicMessages.push({ role: "assistant", content });
    } else if (msg.role === "tool") {
      anthropicMessages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.tool_call_id,
            content: msg.content,
          },
        ],
      });
    }
  }

  const body = {
    model: MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: anthropicMessages,
    tools: anthropicTools,
  };

  const data = await httpPost(`${API_BASE}/v1/messages`, body, {
    "x-api-key": API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  });

  // 解析响应
  const text =
    data.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("") || "";

  const toolCalls =
    data.content
      ?.filter((c) => c.type === "tool_use")
      .map((c) => ({
        id: c.id,
        name: c.name,
        arguments: JSON.stringify(c.input),
      })) || [];

  const thinking =
    data.content
      ?.filter((c) => c.type === "thinking")
      .map((c) => c.thinking)
      .join("\n") || "";

  return { text, toolCalls, thinking };
}

// ── OpenAI-Compatible API (GPT, DeepSeek, OpenRouter) ────────────
async function callOpenAI(systemPrompt, messages, tools) {
  const openaiTools = tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const openaiMessages = [{ role: "system", content: systemPrompt }];

  for (const msg of messages) {
    if (msg.role === "user") {
      openaiMessages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      const m = { role: "assistant", content: msg.content || null };
      if (msg.tool_calls) {
        m.tool_calls = msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments:
              typeof tc.arguments === "string"
                ? tc.arguments
                : JSON.stringify(tc.arguments),
          },
        }));
      }
      openaiMessages.push(m);
    } else if (msg.role === "tool") {
      openaiMessages.push({
        role: "tool",
        tool_call_id: msg.tool_call_id,
        content: msg.content,
      });
    }
  }

  const body = {
    model: MODEL,
    messages: openaiMessages,
    tools: openaiTools,
    max_tokens: 8192,
  };

  const endpoint = `${API_BASE}/v1/chat/completions`;

  const data = await httpPost(endpoint, body, {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  });

  const choice = data.choices?.[0];
  if (!choice) return null;

  let text = choice.message?.content || "";
  let toolCalls =
    choice.message?.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })) || [];

  // Fallback: parse XML-format tool calls from content (AG relay compatibility)
  if (toolCalls.length === 0 && text.includes("<tool_call>")) {
    const parsed = parseXmlToolCalls(text);
    if (parsed.length > 0) {
      toolCalls = parsed;
      // Remove tool_call XML from visible text
      text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
      // Also remove any tool_response XML (relay hallucination)
      text = text
        .replace(/<tool_response>[\s\S]*?<\/tool_response>/g, "")
        .trim();
    }
  }

  return { text, toolCalls, thinking: "" };
}

// ── HTTP POST 工具 ───────────────────────────────────────────────
function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const jsonBody = JSON.stringify(body);

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(jsonBody),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            log("error", `HTTP ${res.statusCode}: ${data.slice(0, 500)}`);
            reject(
              new Error(`API error ${res.statusCode}: ${data.slice(0, 200)}`),
            );
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        });
      },
    );

    req.on("error", reject);
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    req.write(jsonBody);
    req.end();
  });
}

// ── XML 工具调用解析器 (AG relay 兼容) ────────────────────────────
let xmlToolCallIdCounter = 1;
function parseXmlToolCalls(text) {
  const calls = [];
  const re = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    try {
      const json = match[1].trim();
      const parsed = JSON.parse(json);
      calls.push({
        id: `tc_${xmlToolCallIdCounter++}`,
        name: parsed.name,
        arguments:
          typeof parsed.arguments === "string"
            ? parsed.arguments
            : JSON.stringify(parsed.arguments || {}),
      });
    } catch (e) {
      log("warn", "Failed to parse XML tool call:", e.message);
    }
  }
  return calls;
}

// ── 消息格式转换 ─────────────────────────────────────────────────
function formatMessageForLLM(msg) {
  // 直接返回,callLLM 内部根据 provider 做格式转换
  return msg;
}

// ── 启动 ─────────────────────────────────────────────────────────
log("info", "═══════════════════════════════════════════════");
log("info", "道Agent ACP Server starting");
log("info", `Provider: ${PROVIDER} | Model: ${MODEL}`);
log("info", `API Base: ${API_BASE}`);
log("info", `API Key: ${API_KEY ? API_KEY.slice(0, 8) + "..." : "NOT SET"}`);
log("info", `Max turns: ${MAX_TURNS} | Timeout: ${TIMEOUT_MS}ms`);
log("info", "═══════════════════════════════════════════════");

// 保持进程活跃
process.stdin.resume();
