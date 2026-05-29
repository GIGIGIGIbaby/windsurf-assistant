#!/usr/bin/env node
"use strict";
/**
 * _五感.js · 道·外接api · 五感接入实证 · 单进程零依赖
 * ═══════════════════════════════════════════════════════════════
 *
 * 道法自然 · 物无非彼物无非是 · 不试用感觉, 要发真实请求
 *
 * 五维:
 *   视 (sight)   · image_url 透传 · Cascade → 070 桥 → 上游
 *   听 (hearing) · 流式 SSE → Cascade Connect 帧 · 累 6 chunks 全收
 *   言 (speech)  · 文本输出 · field 3 delta_text
 *   触 (touch)   · 工具调用 · field 6 delta_tool_calls + field 5 stop_reason=TOOL_CALLS
 *   思 (thought) · 推理思考 · field 9 delta_thinking · DeepSeek R1 reasoning_content 风
 *
 * 链路:
 *   cascade_wire 拼真 GetChatMessageRequest proto wire
 *      ↓
 *   mock 010-反代 (PassThrough req/res)
 *      ↓
 *   inject_010_bridge.proxyChatRaw (070 桥 · 真代码)
 *      ↓
 *   mock 070 网关 (Node http server · 模拟 OpenAI /v1/chat/completions SSE)
 *      ↓ stream back
 *   收 Cascade Connect 帧 · cascade_wire.parseFrames + parseProto 反解
 *      ↓
 *   5 维 assertions
 *
 * 用法:
 *   node _五感.js                     # 五感全测
 *   node _五感.js --only=视,听        # 仅测部分
 *   node _五感.js --json              # CI 模式
 *
 * 退出码 0 = 五感全通, 浑然一体.
 */

const http = require("http");
const path = require("path");
const { PassThrough } = require("stream");

const W = require(path.join(__dirname, "inject", "cascade_wire.js"));
const Bridge = require(path.join(__dirname, "inject", "inject_010_bridge.js"));

// ── args ─────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      return [k, v === undefined ? true : v];
    }
    return [a, true];
  }),
);
const ONLY = String(args.only || "").trim();
const JSON_OUT = !!args.json;
const senses = ONLY
  ? new Set(
      ONLY.split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : new Set(["视", "听", "言", "触", "思"]);

// ── ANSI ─────────────────────────────────────────────────────────
const isTTY = process.stdout.isTTY && !JSON_OUT;
const C = {
  r: isTTY ? "\x1b[0m" : "",
  G: isTTY ? "\x1b[32m" : "",
  R: isTTY ? "\x1b[31m" : "",
  Y: isTTY ? "\x1b[33m" : "",
  c: isTTY ? "\x1b[36m" : "",
  d: isTTY ? "\x1b[90m" : "",
  b: isTTY ? "\x1b[1m" : "",
};
const log = (...a) => {
  if (!JSON_OUT) console.log(...a);
};

// ── 5 维 stats ───────────────────────────────────────────────────
const results = {};
let pass = 0,
  fail = 0;
function assert(senseKey, name, cond, detail = "") {
  if (!results[senseKey]) results[senseKey] = { pass: 0, fail: 0, items: [] };
  const r = results[senseKey];
  if (cond) {
    pass++;
    r.pass++;
    r.items.push({ name, ok: true });
    log(`  ${C.G}✓${C.r} ${name}${detail ? " " + C.d + detail + C.r : ""}`);
  } else {
    fail++;
    r.fail++;
    r.items.push({ name, ok: false, detail });
    log(`  ${C.R}✗${C.r} ${name}${detail ? " " + C.d + detail + C.r : ""}`);
  }
}

// ════════════════════════════════════════════════════════════════
// mock 070 网关 · 监听 :0 (随机端口) · 模拟 OpenAI SSE 上游
// ════════════════════════════════════════════════════════════════
//
// 收到的 OpenAI 请求中:
//   · 含 image_url      → 5 chunks SSE: "I see " + "a " + "cat " + "in " + "image."
//   · 含 reasoning hint → reasoning_content "Let me think..." + content "答: 道"
//   · 含 tool 定义      → tool_calls [{name:'read_file', args:{path:'a.txt'}}] + stop=tool_calls
//   · 默认              → 6 chunks SSE: "1" "2" "3" "4" "5" "6" + finish_reason=stop

function mockUpstream() {
  const lastReq = { body: null };
  const server = http.createServer((req, res) => {
    let chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let body = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {}
      lastReq.body = body;

      // 检测请求类型
      const messages = body.messages || [];
      const hasImage = messages.some(
        (m) =>
          Array.isArray(m.content) &&
          m.content.some((p) => p.type === "image_url"),
      );
      const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
      const wantsReasoning = messages.some(
        (m) =>
          typeof m.content === "string" && /reason|think|思/i.test(m.content),
      );

      // SSE
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const send = (delta, finish) => {
        const payload = {
          id: "chatcmpl-mock",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: delta, finish_reason: finish || null }],
        };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      // 异步 emit chunks
      let i = 0;
      let chunksOut;
      let finalFinish = "stop";

      if (hasTools) {
        // 工具调用回路
        chunksOut = [
          {
            tool_calls: [
              { index: 0, id: "tc_1", function: { name: "read_file" } },
            ],
          },
          { tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] },
          { tool_calls: [{ index: 0, function: { arguments: '"a.txt"}' } }] },
        ];
        finalFinish = "tool_calls";
      } else if (wantsReasoning) {
        chunksOut = [
          { reasoning_content: "Let me think..." },
          { content: "答" },
          { content: ": " },
          { content: "道" },
        ];
      } else if (hasImage) {
        chunksOut = [
          { content: "I see " },
          { content: "a " },
          { content: "cat " },
          { content: "in " },
          { content: "image." },
        ];
      } else {
        chunksOut = [
          { content: "1" },
          { content: "2" },
          { content: "3" },
          { content: "4" },
          { content: "5" },
          { content: "6" },
        ];
      }

      const tick = () => {
        if (i < chunksOut.length) {
          send(chunksOut[i], null);
          i++;
          setTimeout(tick, 5);
        } else {
          send({}, finalFinish);
          res.write("data: [DONE]\n\n");
          res.end();
        }
      };
      tick();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ server, port, lastReq });
    });
  });
}

// ════════════════════════════════════════════════════════════════
// 单次实战 · 拼请求 + 调桥 + 收帧 + 反解
// ════════════════════════════════════════════════════════════════

// 构造一帧 GetChatMessageRequest (proto · 070 桥识别的 wire)
function buildRequestFrame({ messages, modelUid, tools }) {
  const parts = [];
  for (const m of messages) {
    const inner = [];
    inner.push(W.encodeUint(W.MSG.SOURCE, m.source));
    if (m.prompt) inner.push(W.encodeString(W.MSG.PROMPT, m.prompt));
    if (Array.isArray(m.images)) {
      for (const img of m.images) {
        inner.push(W.encodeMessage(W.MSG.IMAGES, W.encodeImageData(img)));
      }
    }
    if (m.tool_call_id)
      inner.push(W.encodeString(W.MSG.TOOL_CALL_ID, m.tool_call_id));
    if (m.tool_result_is_error)
      inner.push(W.encodeUint(W.MSG.TOOL_RESULT_IS_ERROR, 1));
    parts.push(W.encodeMessage(W.REQ.CHAT_MESSAGES, Buffer.concat(inner)));
  }
  if (Array.isArray(tools)) {
    for (const t of tools) {
      const inner = [
        W.encodeString(W.TD.NAME, t.name),
        W.encodeString(W.TD.DESCRIPTION, t.description || ""),
        W.encodeString(
          W.TD.JSON_SCHEMA_STRING,
          JSON.stringify(t.parameters || { type: "object", properties: {} }),
        ),
      ];
      parts.push(W.encodeMessage(W.REQ.TOOLS, Buffer.concat(inner)));
    }
  }
  parts.push(W.encodeString(W.REQ.CHAT_MODEL_UID, modelUid));
  return W.buildFrame(0, Buffer.concat(parts));
}

// 调用 070 桥 proxyChatRaw, 收回流帧
async function runProbe(
  { messages, modelUid = "dao-byok-test", tools },
  gatewayPort,
) {
  const reqFrame = buildRequestFrame({ messages, modelUid, tools });

  // mock req: 简单对象, 070 桥 proxyChatRaw 仅看 headers 决定 content-type
  const { EventEmitter } = require("events");
  const mockReq = new EventEmitter();
  mockReq.headers = { "content-type": "application/connect+proto" };
  mockReq.url = "/api/exa.api_server_pb.LanguageServerService/GetChatMessage";
  mockReq.method = "POST";

  // mock res: 自定义对象, 收所有 write(buf), 收到 end() 时 resolve
  const collected = [];
  let ended = false;
  const mockRes = new EventEmitter();
  mockRes.writableEnded = false;
  mockRes.writeHead = function () {};
  mockRes.write = function (buf) {
    if (Buffer.isBuffer(buf)) collected.push(buf);
    else if (typeof buf === "string") collected.push(Buffer.from(buf, "utf8"));
    return true;
  };
  mockRes.end = function () {
    ended = true;
    mockRes.writableEnded = true;
    mockRes.emit("close");
  };

  const target = {
    gatewayUrl: `http://127.0.0.1:${gatewayPort}`,
    chatPath: "/v1/chat/completions",
    routingModel: "test::mock-model",
    maxOutputTokens: 0,
    modelUid,
  };

  // 调真桥
  Bridge.proxyChatRaw(mockReq, mockRes, reqFrame, false, target);

  // 等 res.end (最多 5s)
  await new Promise((resolve, reject) => {
    const tm = setTimeout(() => reject(new Error("probe timeout 5s")), 5000);
    const check = () => {
      if (ended) {
        clearTimeout(tm);
        resolve();
      } else {
        setTimeout(check, 10);
      }
    };
    check();
  });

  // 反解所有 Cascade Connect 帧
  const all = Buffer.concat(collected);
  const frames = W.parseFrames(all);
  const decoded = {
    deltaText: "",
    deltaThinking: "",
    toolCalls: [],
    stopReason: null,
    endError: null,
    rawFrameCount: frames.length,
  };
  for (const fr of frames) {
    if (fr.flags === 2) {
      // end frame
      try {
        const j = JSON.parse(fr.payload.toString("utf8"));
        if (j.error) decoded.endError = j.error;
      } catch {}
      continue;
    }
    const f = W.parseProto(fr.payload);
    if (f[W.RSP.DELTA_TEXT]) {
      for (const e of f[W.RSP.DELTA_TEXT]) {
        if (e.w === 2) decoded.deltaText += Buffer.from(e.b).toString("utf8");
      }
    }
    if (f[W.RSP.DELTA_THINKING]) {
      for (const e of f[W.RSP.DELTA_THINKING]) {
        if (e.w === 2)
          decoded.deltaThinking += Buffer.from(e.b).toString("utf8");
      }
    }
    if (f[W.RSP.DELTA_TOOL_CALLS]) {
      for (const e of f[W.RSP.DELTA_TOOL_CALLS]) {
        if (e.w !== 2) continue;
        const tcF = W.parseProto(Buffer.from(e.b));
        decoded.toolCalls.push({
          id: tcF[W.TC.ID]?.[0]?.b
            ? Buffer.from(tcF[W.TC.ID][0].b).toString("utf8")
            : "",
          name: tcF[W.TC.NAME]?.[0]?.b
            ? Buffer.from(tcF[W.TC.NAME][0].b).toString("utf8")
            : "",
          argumentsJson: tcF[W.TC.ARGUMENTS_JSON]?.[0]?.b
            ? Buffer.from(tcF[W.TC.ARGUMENTS_JSON][0].b).toString("utf8")
            : "",
        });
      }
    }
    if (f[W.RSP.STOP_REASON]) {
      decoded.stopReason = f[W.RSP.STOP_REASON][0]?.v ?? null;
    }
  }
  return decoded;
}

// ════════════════════════════════════════════════════════════════
// 五维测试
// ════════════════════════════════════════════════════════════════

async function 测_视(port, lastReq) {
  log(`\n${C.c}${C.b}── 视 (sight) · 多模态 image_url 透传 ──${C.r}`);
  const r = await runProbe(
    {
      modelUid: "dao-byok-vision",
      messages: [
        {
          source: W.SOURCE_USER,
          prompt: "What is in this image?",
          images: [
            {
              mediaType: "image/png",
              url: "https://example.com/cat.png",
              detail: "high",
            },
          ],
        },
      ],
    },
    port,
  );
  // mock 上游应收到 multimodal content
  const upMsg = lastReq.body?.messages?.[0];
  assert("视", "上游收到 user 消息", !!upMsg);
  assert(
    "视",
    "上游 content 是 OpenAI 多模态数组",
    Array.isArray(upMsg?.content),
  );
  const imgPart = (upMsg?.content || []).find((p) => p.type === "image_url");
  assert("视", "数组中含 image_url part", !!imgPart);
  assert(
    "视",
    "image_url.url 透传无丢",
    imgPart?.image_url?.url === "https://example.com/cat.png",
  );
  assert("视", "detail=high 透传", imgPart?.image_url?.detail === "high");
  // 上游 mock 看到图就回 "I see a cat in image." (5 chunks)
  assert(
    "视",
    "070 桥透出文本 (上游确认收图)",
    r.deltaText.includes("cat") || r.deltaText.length >= 5,
    `text="${r.deltaText.slice(0, 40)}"`,
  );
}

async function 测_听(port, lastReq) {
  log(`\n${C.c}${C.b}── 听 (hearing) · 流式 SSE → Cascade Connect 帧 ──${C.r}`);
  const r = await runProbe(
    {
      modelUid: "dao-byok-stream",
      messages: [{ source: W.SOURCE_USER, prompt: "数到 6" }],
    },
    port,
  );
  // 上游回 6 chunks "1" "2" ... "6", 070 桥应一一透出 6 个 text 帧
  assert(
    "听",
    "delta_text 拼接累完整 (听到 6 chunks)",
    r.deltaText === "123456",
    `got="${r.deltaText}"`,
  );
  // 至少 6 个文本帧 + 1 个 stop_reason 帧 + 1 个 end 帧
  assert(
    "听",
    "Cascade 帧数 >= 7 (含 stop + end)",
    r.rawFrameCount >= 7,
    `frames=${r.rawFrameCount}`,
  );
  assert("听", "上游正常结束 (无 endError)", !r.endError);
  assert(
    "听",
    "stop_reason = STOP_END (1)",
    r.stopReason === W.STOP_END,
    `stop=${r.stopReason}`,
  );
}

async function 测_言(port, lastReq) {
  log(`\n${C.c}${C.b}── 言 (speech) · 文本输出 · field 3 delta_text ──${C.r}`);
  const r = await runProbe(
    {
      modelUid: "dao-byok-speak",
      messages: [{ source: W.SOURCE_USER, prompt: "say one" }],
    },
    port,
  );
  assert("言", "070 桥透出文本 (delta_text 非空)", r.deltaText.length > 0);
  // 验证字段编号正确 (cascade_wire 编 field 3)
  assert(
    "言",
    "上游收到正确的 user prompt",
    lastReq.body?.messages?.[0]?.content === "say one",
  );
  assert(
    "言",
    "上游 model = test::mock-model (070 路由)",
    lastReq.body?.model === "test::mock-model",
  );
}

async function 测_触(port, lastReq) {
  log(
    `\n${C.c}${C.b}── 触 (touch) · 工具调用 · field 6 delta_tool_calls ──${C.r}`,
  );
  const r = await runProbe(
    {
      modelUid: "dao-byok-tool",
      messages: [{ source: W.SOURCE_USER, prompt: "read a.txt" }],
      tools: [
        {
          name: "read_file",
          description: "Read a file from disk",
          parameters: {
            type: "object",
            properties: { path: { type: "string" } },
          },
        },
      ],
    },
    port,
  );
  // 上游收到 tools 定义
  assert(
    "触",
    "上游收到 tools.length=1",
    Array.isArray(lastReq.body?.tools) && lastReq.body.tools.length === 1,
  );
  assert(
    "触",
    "tools[0].function.name=read_file",
    lastReq.body?.tools?.[0]?.function?.name === "read_file",
  );
  // 070 桥透出 1 个 ChatToolCall, 累完整 args
  assert(
    "触",
    "070 桥透出 1 个 ChatToolCall",
    r.toolCalls.length === 1,
    `toolCalls=${r.toolCalls.length}`,
  );
  assert("触", "tool.name=read_file", r.toolCalls[0]?.name === "read_file");
  assert(
    "触",
    'tool.arguments_json 累完整 ({"path":"a.txt"})',
    r.toolCalls[0]?.argumentsJson === '{"path":"a.txt"}',
    `args=${r.toolCalls[0]?.argumentsJson}`,
  );
  assert(
    "触",
    "stop_reason = STOP_TOOL_CALLS (3)",
    r.stopReason === W.STOP_TOOL_CALLS,
    `stop=${r.stopReason}`,
  );

  // ── 触·副 · tool_result_is_error 透上游为 [ERROR] 前缀 ──
  // 协议本源: OpenAI 无 is_error 字段, 070 用 content 前缀让上游模型识 ·
  // Cascade 调内置 Claude 时此语义在 tool_result block 内闭环, 070 须等价
  await runProbe(
    {
      modelUid: "dao-byok-tool-err",
      messages: [
        { source: W.SOURCE_USER, prompt: "read missing.txt" },
        {
          source: W.SOURCE_TOOL,
          prompt: "ENOENT: file not found",
          tool_call_id: "tc_err_1",
          tool_result_is_error: true,
        },
      ],
    },
    port,
  );
  const toolMsg = (lastReq.body?.messages || []).find((m) => m.role === "tool");
  assert("触", "tool 消息透到上游", !!toolMsg);
  assert("触", "tool_call_id 透传无丢", toolMsg?.tool_call_id === "tc_err_1");
  assert(
    "触",
    "tool_result_is_error → [ERROR] 前缀 (协议保真)",
    typeof toolMsg?.content === "string" &&
      toolMsg.content.startsWith("[ERROR] "),
    `content="${(toolMsg?.content || "").slice(0, 40)}"`,
  );
  assert(
    "触",
    "tool_result_is_error · 原内容保留 (前缀+原文)",
    typeof toolMsg?.content === "string" && toolMsg.content.includes("ENOENT"),
  );
}

async function 测_思(port, lastReq) {
  log(`\n${C.c}${C.b}── 思 (thought) · 推理 · field 9 delta_thinking ──${C.r}`);
  const r = await runProbe(
    {
      modelUid: "dao-byok-r1",
      messages: [
        {
          source: W.SOURCE_USER,
          prompt: "Please think step by step before answering: what is 道?",
        },
      ],
    },
    port,
  );
  // 上游回 reasoning_content + content, 070 桥应分别透到 field 9 和 field 3
  assert(
    "思",
    "070 桥透出思考帧 (delta_thinking 非空)",
    r.deltaThinking.length > 0,
    `thinking="${r.deltaThinking.slice(0, 40)}"`,
  );
  assert("思", "思考内容含 'think'", /think|Let me/i.test(r.deltaThinking));
  assert(
    "思",
    "070 桥同时透出文本 (delta_text 非空)",
    r.deltaText.length > 0,
    `text="${r.deltaText}"`,
  );
  assert("思", "正常结束", r.stopReason === W.STOP_END);
}

// ════════════════════════════════════════════════════════════════
// main
// ════════════════════════════════════════════════════════════════

async function main() {
  log(
    `${C.c}${C.b}╔════════════════════════════════════════════════════════════╗${C.r}`,
  );
  log(
    `${C.c}${C.b}║   道·外接api · 五感接入实证 · 浑然一体之验                 ║${C.r}`,
  );
  log(
    `${C.c}${C.b}║   视 / 听 / 言 / 触 / 思  · 五维并行 · 道法自然            ║${C.r}`,
  );
  log(
    `${C.c}${C.b}╚════════════════════════════════════════════════════════════╝${C.r}`,
  );

  // 1. 启 mock 上游
  const { server, port, lastReq } = await mockUpstream();
  log(`\n${C.d}mock 上游 :${port} 已启${C.r}`);

  // 2. attach 070 桥 (无配置, 让桥进入 ready=true 状态以接受 routeFor=null 默认行为)
  // 实际我们绕过 attach, 直接用 proxyChatRaw + 自定义 target — 桥的 wire 在 require 时已 lazy load
  // 但 proxyChatRaw 内部会引用 _wire (只在 attach 后才 set). 先 attach 一次空配置避其退化:
  // 给一个 dev mock cfg
  const fakeCfg = {
    gateway: { host: "127.0.0.1", port },
    cascadeInjection: { enabled: true, injectModels: [] },
  };
  // 直接 attach 一份内存 cfg · 不依赖磁盘
  // 用 require.cache 注入 inject.js 的 load · 最安全方式: 暂改 inject.load
  const Inj = require(path.join(__dirname, "inject", "inject.js"));
  const origLoad = Inj.load;
  Inj.load = () => fakeCfg;
  try {
    Bridge.attach({
      INJECT_MODELS: [],
      INJECT_UIDS_SET: new Set(),
      log: () => {},
    });
  } finally {
    Inj.load = origLoad;
  }

  // 3. 五维测试
  try {
    if (senses.has("视")) await 测_视(port, lastReq);
    if (senses.has("听")) await 测_听(port, lastReq);
    if (senses.has("言")) await 测_言(port, lastReq);
    if (senses.has("触")) await 测_触(port, lastReq);
    if (senses.has("思")) await 测_思(port, lastReq);
  } catch (e) {
    log(`${C.R}测试异常: ${e.message}${C.r}`);
    fail++;
  }

  // 4. 关 mock 上游
  server.close();

  // 5. 总评
  if (JSON_OUT) {
    console.log(JSON.stringify({ pass, fail, results }, null, 2));
  } else {
    log(`\n${C.c}${C.b}── 五感总评 ──${C.r}`);
    for (const k of ["视", "听", "言", "触", "思"]) {
      const r = results[k];
      if (!r) continue;
      const c = r.fail === 0 ? C.G : C.R;
      log(`  ${c}${k}${C.r}  ${r.pass} pass · ${r.fail} fail`);
    }
    log(`\n  ${C.b}总: ${pass} passed · ${fail} failed${C.r}`);
    if (fail === 0) {
      log(`\n  ${C.G}${C.b}✓ 五感全通 · 浑然一体${C.r}`);
      log(`  ${C.d}功成事遂 · 百姓皆谓我自然${C.r}\n`);
    } else {
      log(`\n  ${C.R}${C.b}✗ 五感未全 · 待补${C.r}\n`);
    }
  }

  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(C.R + "fatal: " + e.stack + C.r);
  process.exit(2);
});
