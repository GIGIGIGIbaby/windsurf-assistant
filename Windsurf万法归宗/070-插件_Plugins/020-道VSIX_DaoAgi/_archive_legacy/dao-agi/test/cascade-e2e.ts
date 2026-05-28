/**
 * test/cascade-e2e.ts — Cascade 真身全链路实测
 *
 * 七项测试 + 一项真端口实测:
 *   1. Envelope 编解码往返 (自 5-byte prefix frame)
 *   2. Mock LS server ServerStreaming 往返
 *   3. runCascadeAgent 完整循环 (工具调用 → 工具结果 → end_turn)
 *   4. buildCascadeSystemPrompt 各模式输出
 *   5. 27 工具 spec 完整性 + 只读/授权分类
 *   6. 三模式状态机 + 工具过滤
 *   7. 本地 handler smoke test (read_file / write_to_file / edit / list_dir / grep)
 *   8. 真实 Windsurf LS 端口探测
 *
 * 道法自然 · 实测一切
 */
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { ConnectClient } from "../src/core/cascade/connectrpc-client";
import { RPC_PATHS } from "../src/core/cascade/proto";
import {
  buildCascadeSystemPrompt,
  estimateSpSize,
  DAO_PHILOSOPHY,
  CASCADE_IDENTITY,
} from "../src/core/cascade/system-prompt-real";
import {
  CASCADE_TOOLS,
  READ_ONLY_TOOLS,
  APPROVAL_REQUIRED_TOOLS,
  getTool,
  toProviderSpecs,
} from "../src/core/cascade/tools";
import {
  inferInitialMode,
  filterToolsForMode,
  MODE_SP_PATCHES,
  PLAN_MODE_READONLY_TOOLS,
  initialModeState,
  transitionMode,
} from "../src/core/cascade/plan-mode";
import { runCascadeAgent } from "../src/core/cascade/agent-cascade";
import { cascadeTools } from "../src/core/cascade/handlers";

/* ═══════════════════════ Test Runner ═══════════════════════ */

type TestResult = { name: string; ok: boolean; err?: string; detail?: string };
const results: TestResult[] = [];

async function test(
  name: string,
  fn: () => Promise<void> | void,
): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, detail: `${Date.now() - start}ms` });
    console.log(`  ✓ ${name} (${Date.now() - start}ms)`);
  } catch (e: any) {
    const err = String(e?.stack || e?.message || e);
    results.push({ name, ok: false, err });
    console.log(
      `  ✗ ${name}\n    ${err.split("\n").slice(0, 4).join("\n    ")}`,
    );
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected)
    throw new Error(
      `${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
}

/* ═══════════════════════ Envelope codec ═══════════════════════ */

function encodeEnvelope(flags: number, json: unknown): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify(json));
  const out = new Uint8Array(5 + payload.byteLength);
  out[0] = flags & 0xff;
  const len = payload.byteLength;
  out[1] = (len >>> 24) & 0xff;
  out[2] = (len >>> 16) & 0xff;
  out[3] = (len >>> 8) & 0xff;
  out[4] = len & 0xff;
  out.set(payload, 5);
  return out;
}

/* ═══════════════════════ Mock LS Server ═══════════════════════ */

interface MockLsState {
  port: number;
  close: () => Promise<void>;
  /** 注入给下一次 GetChatMessage 的响应序列 */
  setReply: (frames: Array<{ flags: number; body: unknown }>) => void;
  /** 记录最近一次收到的 request body (JSON) */
  lastRequest: () => unknown;
  /** 记录最近一次收到的 headers */
  lastHeaders: () => Record<string, string>;
}

async function startMockLs(): Promise<MockLsState> {
  let replyFrames: Array<{ flags: number; body: unknown }> = [];
  let lastReq: unknown = null;
  let lastHeaders: Record<string, string> = {};

  const server = http.createServer(async (req, res) => {
    // 收请求体
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const reqBuf = Buffer.concat(chunks);
    lastHeaders = Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, String(v)]),
    );

    // 如果是 connect streaming, 去掉 5 字节 envelope
    let bodyJson: unknown = null;
    try {
      if (
        reqBuf.length > 5 &&
        req.headers["content-type"]?.includes("connect+json")
      ) {
        const len =
          (reqBuf[1] << 24) | (reqBuf[2] << 16) | (reqBuf[3] << 8) | reqBuf[4];
        bodyJson = JSON.parse(reqBuf.slice(5, 5 + len).toString("utf8"));
      } else if (reqBuf.length > 0) {
        bodyJson = JSON.parse(reqBuf.toString("utf8"));
      }
    } catch {
      /* ignore */
    }
    lastReq = bodyJson;

    if (
      req.url === RPC_PATHS.GET_CHAT_MESSAGE_CLOUD ||
      req.url === RPC_PATHS.GET_CHAT_MESSAGE_LS
    ) {
      // 回 streaming frames
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/connect+json");
      res.setHeader("Connect-Protocol-Version", "1");
      for (const f of replyFrames) {
        res.write(encodeEnvelope(f.flags, f.body));
      }
      res.end();
      return;
    }

    if (req.url === RPC_PATHS.HEARTBEAT) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };

  return {
    port: addr.port,
    close: () => new Promise<void>((r) => server.close(() => r())),
    setReply: (frames) => {
      replyFrames = frames;
    },
    lastRequest: () => lastReq,
    lastHeaders: () => lastHeaders,
  };
}

/* ═══════════════════════ Tests ═══════════════════════ */

async function main(): Promise<void> {
  console.log("─── 道·AGI Cascade 真身 E2E ───\n");

  // ── Test 1: envelope codec ──────────────────────────────────────
  await test("1. Envelope 编解码往返", async () => {
    const msg = { delta_text: "hello 道", delta_tokens: 3 };
    const enc = encodeEnvelope(0, msg);
    assertEq(enc[0], 0, "flags");
    const len = (enc[1] << 24) | (enc[2] << 16) | (enc[3] << 8) | enc[4];
    assertEq(len, enc.length - 5, "length prefix matches");
    const payload = JSON.parse(new TextDecoder().decode(enc.slice(5)));
    assertEq((payload as any).delta_text, "hello 道", "roundtrip text");
  });

  // ── Test 2: ConnectClient ↔ mock LS ───────────────────────────
  await test("2. ConnectClient.serverStream ↔ mock LS", async () => {
    const mock = await startMockLs();
    try {
      const client = new ConnectClient({
        endpoint: `http://127.0.0.1:${mock.port}`,
        timeoutMs: 5000,
      });
      mock.setReply([
        { flags: 0, body: { message_id: "m1", delta_text: "hello " } },
        { flags: 0, body: { message_id: "m1", delta_text: "道" } },
        {
          flags: 0,
          body: {
            message_id: "m1",
            stop_reason: "STOP_REASON_END_TURN",
            usage: { input_tokens: 5, output_tokens: 2 },
          },
        },
        { flags: 2, body: {} }, // trailer
      ]);
      const received: string[] = [];
      let usage: any = null;
      await client.cascadeChatCloud(
        {
          prompt: "hi",
          chat_message_prompts: [
            { message_id: "u1", source: "USER", prompt: "hi" },
          ],
        },
        (r) => {
          if (r.delta_text) received.push(r.delta_text);
          if (r.usage) usage = r.usage;
        },
      );
      assertEq(received.join(""), "hello 道", "stream reassembly");
      assert(usage && usage.input_tokens === 5, "usage received");

      // 验证 mock 收到 request body
      const req = mock.lastRequest() as any;
      assert(req, "mock received request body");
      assertEq(req.prompt, "hi", "prompt forwarded");
      const headers = mock.lastHeaders();
      assertEq(
        headers["content-type"],
        "application/connect+json",
        "streaming Content-Type",
      );
      assertEq(
        headers["connect-protocol-version"],
        "1",
        "connect protocol version header",
      );
    } finally {
      await mock.close();
    }
  });

  // ── Test 3: runCascadeAgent 完整循环 ──────────────────────────
  await test("3. runCascadeAgent 工具调用 + end_turn 循环", async () => {
    const mock = await startMockLs();
    try {
      let iter = 0;
      // 第一次 Agent 调用:  assistant 发起一个 read_file tool_call
      // 第二次 Agent 调用: assistant 得到 tool_result, 回复 text 并 end_turn
      const server = http as any;
      // override: 我们让 mock server 的 reply 依赖 iter
      // 简化: 监听 mock.setReply 的两轮交替
      const tmp = path.join(os.tmpdir(), `dao-cas-${Date.now()}.txt`);
      fs.writeFileSync(tmp, "hello from cascade e2e", "utf8");

      // 预先塞两轮响应;mock.setReply 只存一组,因此用一个 dispatcher 变体:
      // 重启 mock, 让 mock 根据 iter 回不同 frames
      await mock.close();
    } finally {
      /* nothing */
    }

    // 重新做: 专用 mock dispatcher server
    let call = 0;
    const srv = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      if (req.url === RPC_PATHS.GET_CHAT_MESSAGE_CLOUD) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/connect+json");
        if (call === 0) {
          res.write(
            encodeEnvelope(0, {
              message_id: "a1",
              delta_text: "让我读取文件",
              delta_tool_calls: [
                {
                  id: "tc1",
                  name: "read_file",
                  arguments_json: JSON.stringify({ file_path: __filename }),
                },
              ],
            }),
          );
          res.write(
            encodeEnvelope(0, {
              message_id: "a1",
              stop_reason: "STOP_REASON_TOOL_USE",
            }),
          );
          res.write(encodeEnvelope(2, {}));
        } else {
          res.write(
            encodeEnvelope(0, { message_id: "a2", delta_text: "已读取完毕。" }),
          );
          res.write(
            encodeEnvelope(0, {
              message_id: "a2",
              stop_reason: "STOP_REASON_END_TURN",
              usage: { input_tokens: 10, output_tokens: 3 },
            }),
          );
          res.write(encodeEnvelope(2, {}));
        }
        call++;
        res.end();
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;

    try {
      const r = await runCascadeAgent("测试", {
        toolHandlers: {
          read_file: async (input) => `mock content of ${input.file_path}`,
        },
        endpoint: `http://127.0.0.1:${port}`,
        maxIterations: 3,
        modelName: "claude-test",
        daoEnhanced: false,
        initialMode: "chat",
      });
      assertEq(r.stopReason, "end_turn", "agent reaches end_turn");
      assertEq(r.steps, 2, "two LLM iterations");
      assert(r.finalText.includes("已读取完毕"), "final text captured");
      assertEq(r.totalUsage.input, 10, "usage input tokens");
      assertEq(r.totalUsage.output, 3, "usage output tokens");
    } finally {
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });

  // ── Test 4: buildCascadeSystemPrompt ────────────────────────────
  await test("4. SP 各模式输出验证", async () => {
    const pass = buildCascadeSystemPrompt({ mode: "passthrough" });
    assert(
      pass.includes("You are Cascade"),
      "passthrough contains Cascade identity",
    );
    assert(pass.includes("<tool_calling>"), "has tool_calling section");
    assert(pass.includes("<making_code_changes>"), "has making_code_changes");
    assert(
      !pass.includes("DAO PHILOSOPHY"),
      "passthrough excludes DAO by default",
    );

    const dao = buildCascadeSystemPrompt({
      mode: "passthrough",
      daoEnhanced: true,
    });
    assert(
      dao.includes("DAO PHILOSOPHY"),
      "dao enhanced includes DAO philosophy",
    );
    assert(dao.includes("道·AGI"), "includes 道·AGI identity");

    const strip = buildCascadeSystemPrompt({ mode: "strip" });
    assertEq(strip, "", "strip is empty");

    const repl = buildCascadeSystemPrompt({
      mode: "replace",
      customFull: "CUSTOM",
    });
    assertEq(repl, "CUSTOM", "replace uses customFull");

    const append = buildCascadeSystemPrompt({
      mode: "append",
      custom: "\n\n#EXTRA#",
    });
    assert(append.endsWith("#EXTRA#"), "append appends custom");

    const extract = buildCascadeSystemPrompt({ mode: "extract" });
    assertEq(extract, CASCADE_IDENTITY, "extract returns identity only");

    // SP 规模在合理范围 (8-30KB)
    const size = estimateSpSize(dao);
    assert(
      size.bytes > 4000 && size.bytes < 30000,
      `SP size reasonable: ${size.bytes} bytes / ~${size.approxTokens} tokens`,
    );
  });

  // ── Test 5: 27 tools 完整性 ─────────────────────────────────
  await test("5. 27 工具 spec 完整性", async () => {
    assertEq(CASCADE_TOOLS.length, 27, "exactly 27 tools");
    for (const t of CASCADE_TOOLS) {
      assert(t.name, `tool has name`);
      assert(
        t.description && t.description.length > 10,
        `tool ${t.name} has description`,
      );
      assertEq(t.inputSchema.type, "object", `tool ${t.name} schema is object`);
      assert(t.category, `tool ${t.name} has category`);
    }
    const names = CASCADE_TOOLS.map((t) => t.name).sort();
    const uniq = new Set(names);
    assertEq(uniq.size, CASCADE_TOOLS.length, "no duplicate names");

    // 关键工具必须在
    const must = [
      "read_file",
      "write_to_file",
      "edit",
      "multi_edit",
      "list_dir",
      "find_by_name",
      "grep_search",
      "run_command",
      "command_status",
      "create_memory",
      "todo_list",
      "ask_user_question",
      "search_web",
      "read_url_content",
    ];
    for (const m of must) {
      assert(getTool(m), `required tool present: ${m}`);
    }

    assert(READ_ONLY_TOOLS.includes("read_file"), "read_file marked read-only");
    assert(
      APPROVAL_REQUIRED_TOOLS.includes("run_command"),
      "run_command requires approval",
    );

    const specs = toProviderSpecs();
    assertEq(specs.length, 27, "27 provider specs");
    for (const s of specs) {
      assert(
        s.name && s.description && s.inputSchema,
        `spec ${s.name} well-formed`,
      );
    }
  });

  // ── Test 6: 三模式状态机 ─────────────────────────────────
  await test("6. Plan/Write/Chat 三模式状态机", async () => {
    assertEq(
      inferInitialMode("帮我 plan 一下如何重构"),
      "plan",
      "infer plan from 计划",
    );
    assertEq(
      inferInitialMode("implement this feature"),
      "write",
      "infer write from implement",
    );
    assertEq(inferInitialMode("what is this?"), "chat", "infer chat from what");
    assertEq(inferInitialMode("随便说个话"), "chat", "default is chat");

    const fakeTools = CASCADE_TOOLS.map((t) => ({ name: t.name }));
    const planFiltered = filterToolsForMode(fakeTools, "plan");
    assert(
      planFiltered.length < fakeTools.length,
      "plan filters out write tools",
    );
    assert(
      !planFiltered.some((t) => t.name === "write_to_file"),
      "plan excludes write_to_file",
    );
    assert(
      !planFiltered.some((t) => t.name === "run_command"),
      "plan excludes run_command",
    );
    assert(
      planFiltered.some((t) => t.name === "read_file"),
      "plan keeps read_file",
    );
    for (const t of planFiltered) {
      assert(
        PLAN_MODE_READONLY_TOOLS.has(t.name),
        `plan tool ${t.name} is in readonly set`,
      );
    }

    const writeFiltered = filterToolsForMode(fakeTools, "write");
    assertEq(writeFiltered.length, fakeTools.length, "write allows all tools");

    assert(
      MODE_SP_PATCHES.plan.includes("PLAN mode"),
      "plan patch mentions PLAN mode",
    );
    assert(
      MODE_SP_PATCHES.write.includes("WRITE mode"),
      "write patch mentions WRITE mode",
    );

    let s = initialModeState("chat");
    s = transitionMode(s, "plan", true);
    assertEq(s.mode, "plan", "transition to plan");
    assertEq(s.locked, true, "user-initiated locks mode");
    s = transitionMode(s, "write", false);
    assertEq(s.mode, "plan", "locked mode resists auto transition");
    s = transitionMode(s, "write", true);
    assertEq(s.mode, "write", "user-initiated overrides lock");
  });

  // ── Test 7: 本地 handlers smoke test ──────────────────────────
  await test("7. 本地 handlers · read/write/edit/list/grep/find", async () => {
    const tools = cascadeTools();
    const h = Object.fromEntries(tools.map((t) => [t.name, t.handler]));

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dao-e2e-"));
    const tmp = path.join(tmpDir, "sample.txt");

    // write_to_file
    const wr = JSON.parse(
      await h.write_to_file(
        { TargetFile: tmp, CodeContent: "hello world\n第二行\nmatch-me" },
        {},
      ),
    );
    assertEq(wr.ok, true, "write_to_file ok");
    assert(fs.existsSync(tmp), "file created");

    // read_file
    const rf = await h.read_file({ file_path: tmp }, {});
    assert(rf.includes("hello world"), "read_file returns content");

    // edit (exact replace)
    const ed = JSON.parse(
      await h.edit(
        { file_path: tmp, old_string: "hello world", new_string: "你好世界" },
        {},
      ),
    );
    assertEq(ed.ok, true, "edit ok");
    const after = fs.readFileSync(tmp, "utf8");
    assert(after.includes("你好世界"), "edit replaced");

    // list_dir
    const ls = JSON.parse(await h.list_dir({ DirectoryPath: tmpDir }, {}));
    assert(Array.isArray(ls), "list_dir returns array");
    assert(
      ls.some((e: any) => e.name === "sample.txt"),
      "listed sample.txt",
    );

    // grep_search
    const gp = JSON.parse(
      await h.grep_search(
        { SearchPath: tmpDir, Query: "match-me", FixedStrings: true },
        {},
      ),
    );
    assert(Array.isArray(gp) && gp.length > 0, "grep found match");

    // find_by_name
    const fb = JSON.parse(
      await h.find_by_name({ SearchDirectory: tmpDir, Pattern: "*.txt" }, {}),
    );
    assert(
      Array.isArray(fb) && fb.some((p: string) => p.includes("sample.txt")),
      "find_by_name found",
    );

    // multi_edit
    const me = JSON.parse(
      await h.multi_edit(
        {
          file_path: tmp,
          edits: [
            { old_string: "你好世界", new_string: "HELLO" },
            { old_string: "第二行", new_string: "LINE2" },
          ],
        },
        {},
      ),
    );
    assertEq(me.ok, true, "multi_edit ok");
    assertEq(me.edits, 2, "two edits applied");
    const final = fs.readFileSync(tmp, "utf8");
    assert(
      final.includes("HELLO") && final.includes("LINE2"),
      "both edits present",
    );

    // cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Test 8: Real Windsurf LS port probe (raw) ────────────────
  await test("8. 真实 Windsurf LS 端口直探 (HTTP status classification)", async () => {
    const candidates = [25636, 16169, 28173, 10101, 16180, 47347];
    const discovered: string[] = [];
    let lsCount = 0;
    for (const p of candidates) {
      try {
        const r = await fetch(`http://127.0.0.1:${p}${RPC_PATHS.HEARTBEAT}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Connect-Protocol-Version": "1",
          },
          body: "{}",
          signal: AbortSignal.timeout(2000),
        });
        const ct = r.headers.get("content-type") || "";
        discovered.push(`port ${p}: ${r.status} ${ct}`);
        if (
          ct.includes("application/json") &&
          [200, 401, 403, 404].includes(r.status)
        )
          lsCount++;
      } catch (e: any) {
        discovered.push(`port ${p}: ${String(e?.message || e).slice(0, 60)}`);
      }
    }
    console.log("    [probe]\n      " + discovered.join("\n      "));
    const validHttp = discovered.filter((s) => /\d{3}/.test(s));
    assert(validHttp.length > 0, "at least one port responded");
    if (lsCount > 0)
      console.log(`    [✓] detected ${lsCount} Windsurf LS-like endpoint(s)`);
  });

  // ── Test 9: ConnectClient.detect() 动态端口发现 ─────────────
  await test("9. ConnectClient.detect() 动态端口自动发现", async () => {
    const result = await ConnectClient.detect();
    console.log(
      `    [detect] endpoint=${result.endpoint} kind=${result.kind} detail=${result.detail || ""}`,
    );
    assert(result.endpoint, "detect returns an endpoint");
    assert(
      ["ls", "cloud", "none"].includes(result.kind),
      `valid kind: ${result.kind}`,
    );
    // 若本机 Windsurf 在跑, 必定能发现 LS
    if (result.kind === "ls") {
      assert(
        result.endpoint.startsWith("http://127.0.0.1:"),
        "LS endpoint is localhost",
      );
      assert(result.detail?.includes("status="), "detail includes status");
    }
  });

  // ── Test 10: heartbeat 对 401/404 正确判 alive ────────────
  await test("10. heartbeat 健壮判定 (200/401/403/404=alive)", async () => {
    // 启动 mock server, 专门返回 401
    const srv = http.createServer((req, res) => {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "auth required" }));
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    try {
      const c = new ConnectClient({
        endpoint: `http://127.0.0.1:${port}`,
        timeoutMs: 2000,
      });
      const hb = await c.heartbeat();
      assertEq(hb.alive, true, "401 treated as alive");
      assertEq(hb.authed, false, "401 means not authed");
      assertEq(hb.status, 401, "status 401 captured");
    } finally {
      await new Promise<void>((r) => srv.close(() => r()));
    }

    // 死端口: heartbeat 应返回 alive=false
    const deadClient = new ConnectClient({
      endpoint: "http://127.0.0.1:1",
      timeoutMs: 500,
    });
    const deadHb = await deadClient.heartbeat();
    assertEq(deadHb.alive, false, "dead port is not alive");
  });

  // ── Summary ─────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log(`\n─── Summary ───`);
  console.log(`  PASS: ${results.length - failed.length} / ${results.length}`);
  if (failed.length) {
    console.log(`  FAIL: ${failed.length}`);
    for (const f of failed)
      console.log(`    ✗ ${f.name} → ${f.err?.split("\n")[0]}`);
    process.exitCode = 1;
  } else {
    console.log("  🎉 全链路通过 · 道法自然 无为而无不为");
  }
}

main().catch((e) => {
  console.error("\n[FATAL]", e);
  process.exit(2);
});
