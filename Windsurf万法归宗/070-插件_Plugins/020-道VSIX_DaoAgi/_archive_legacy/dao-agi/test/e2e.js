#!/usr/bin/env node
/**
 * test-e2e.js — 道Agent 全链路端到端实测
 *
 * 兵无常势，水无常形，能因敌变化而取胜者，谓之神
 * 道法自然 · 天之道 利而不害 · 圣人之道 为而不争
 * 大曰逝，逝曰远，远曰反
 *
 * 六层测试:
 *   L1: 源.js 后端直测 (require --test · 不启 listen)
 *       SP 替换 · 深度净化 · proto 编解码 · dissectSP · selftest 模拟
 *   L2: proxy 控制面实测 (HTTP 端点 ping/mode/selftest/preview/lastinject)
 *   L3: LS 直连 gRPC (ls-client.js · Heartbeat + 9 端点)
 *   L4: 文件层隔离器 (isolator.js · enter/exit/status · 幂等)
 *   L5: 模式切换动态 (invert ↔ passthrough · SP 突变捕获)
 *   L6: essence 数据采集 (gatherEssence · 联合 proxy+LS)
 *
 * 用法: node test-e2e.js [--port 8889] [--skip-proxy] [--skip-ls] [--verbose]
 */
"use strict";

const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

// ═══════════════════════ 参数 ═══════════════════════

const args = process.argv.slice(2);
const VERBOSE = args.includes("--verbose") || args.includes("-v");
const SKIP_PROXY = args.includes("--skip-proxy");
const SKIP_LS = args.includes("--skip-ls");
const portIdx = args.indexOf("--port");
const PORT =
  portIdx >= 0 && args[portIdx + 1] ? parseInt(args[portIdx + 1]) : 8889;
// 从 test/ 上溯 5 层: test → dao-agi → 020-道VSIX_DaoAgi → 070-插件_Plugins → Windsurf万法归宗 → 一生二 (工作区根)
const WS_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");

// ═══════════════════════ 日志 ═══════════════════════

let _pass = 0,
  _fail = 0,
  _skip = 0;
const _results = [];

function pass(label, detail) {
  _pass++;
  const msg = `  ✓ ${label}${detail ? " · " + detail : ""}`;
  _results.push({ ok: true, label, detail });
  console.log("\x1b[32m" + msg + "\x1b[0m");
}
function fail(label, detail) {
  _fail++;
  const msg = `  ✗ ${label}${detail ? " · " + detail : ""}`;
  _results.push({ ok: false, label, detail });
  console.log("\x1b[31m" + msg + "\x1b[0m");
}
function skip(label, reason) {
  _skip++;
  const msg = `  ○ ${label} (skip: ${reason})`;
  _results.push({ ok: null, label, detail: reason });
  console.log("\x1b[33m" + msg + "\x1b[0m");
}
function section(title) {
  console.log("\n\x1b[36m═══ " + title + " ═══\x1b[0m");
}
function info(msg) {
  if (VERBOSE) console.log("    " + msg);
}

// ═══════════════════════ HTTP 工具 ═══════════════════════

function httpGet(url, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const req = http.get(
        url,
        { timeout: timeoutMs || 5000, agent: false },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => {
            body += c;
          });
          res.on("end", () => {
            try {
              resolve({
                status: res.statusCode,
                data: JSON.parse(body),
                raw: body,
              });
            } catch {
              resolve({ status: res.statusCode, data: null, raw: body });
            }
          });
        },
      );
      req.on("error", (e) =>
        resolve({ status: 0, data: null, raw: "", error: e.message }),
      );
      req.on("timeout", () => {
        try {
          req.destroy();
        } catch {}
        resolve({ status: 0, data: null, raw: "", error: "timeout" });
      });
    } catch (e) {
      resolve({ status: 0, data: null, raw: "", error: e.message });
    }
  });
}

function httpPost(url, body, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify(body);
      const u = new URL(url);
      const req = http.request(
        {
          host: u.hostname,
          port: u.port,
          path: u.pathname,
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload),
          },
          timeout: timeoutMs || 5000,
          agent: false,
        },
        (res) => {
          let buf = "";
          res.setEncoding("utf8");
          res.on("data", (c) => {
            buf += c;
          });
          res.on("end", () => {
            try {
              resolve({
                status: res.statusCode,
                data: JSON.parse(buf),
                raw: buf,
              });
            } catch {
              resolve({ status: res.statusCode, data: null, raw: buf });
            }
          });
        },
      );
      req.on("error", (e) =>
        resolve({ status: 0, data: null, raw: "", error: e.message }),
      );
      req.on("timeout", () => {
        try {
          req.destroy();
        } catch {}
        resolve({ status: 0, data: null, raw: "", error: "timeout" });
      });
      req.write(payload);
      req.end();
    } catch (e) {
      resolve({ status: 0, data: null, raw: "", error: e.message });
    }
  });
}

// ═══════════════════════ L1: 源.js 后端直测 ═══════════════════════

async function testL1_Backend() {
  section("L1: 源.js 后端直测 (require --test · 纯函数)");

  let src;
  try {
    // --test flag prevents listen
    process.argv.push("--test");
    src = require("../vendor/wam/bundled-origin/源.js");
    process.argv.pop();
  } catch (e) {
    // try source.js
    try {
      process.argv.push("--test");
      src = require("../vendor/wam/bundled-origin/source.js");
      process.argv.pop();
    } catch (e2) {
      fail("require 源.js", e.message + " | " + e2.message);
      return;
    }
  }
  pass("require 源.js", "模块加载成功");

  // 道德经载入
  if (src.DAO_DE_JING_81 && src.DAO_DE_JING_81.length > 5000) {
    pass("道德经载入", `${src.DAO_DE_JING_81.length} 字`);
  } else {
    fail(
      "道德经载入",
      `长度=${src.DAO_DE_JING_81 ? src.DAO_DE_JING_81.length : 0}`,
    );
  }

  // TAO_HEADER
  if (src.TAO_HEADER && src.TAO_HEADER.startsWith("You are Cascade")) {
    pass("TAO_HEADER", `${src.TAO_HEADER.length} 字 · 以 'You are Cascade' 起`);
  } else {
    fail("TAO_HEADER", "不存在或格式不对");
  }

  // invertSP: 官方 SP → 道德经
  const fakeSP =
    "You are Cascade, a powerful agentic AI coding assistant.\n" +
    "<communication_style>be terse</communication_style>\n" +
    "<tool_calling>use tools</tool_calling>\n" +
    "<user_rules>\nold rules\n<MEMORY[test.md]>old memory</MEMORY[test.md]>\n</user_rules>\n" +
    "<skills>skill-x</skills>\n" +
    "x".repeat(300);
  const inverted = src.invertSP(fakeSP);
  if (inverted && inverted.includes("道可道")) {
    pass("invertSP", `官方SP ${fakeSP.length}字 → 道德经 ${inverted.length}字`);
  } else {
    fail("invertSP", "置换失败");
  }

  // invertSP: 非官方文本不动
  const userMsg = "请帮我查一下代码。这是个简单问题。";
  const noInvert = src.invertSP(userMsg);
  if (noInvert === null) {
    pass("invertSP 保护", "非官方文本返回 null (不误伤)");
  } else {
    fail("invertSP 保护", "非官方文本被误改");
  }

  // isLikelyOfficialSP
  if (src.isLikelyOfficialSP(fakeSP) && !src.isLikelyOfficialSP("短文本")) {
    pass("isLikelyOfficialSP", "官方=true · 短文=false");
  } else {
    fail("isLikelyOfficialSP", "判定逻辑异常");
  }

  // stripSideChannelBlocks
  const dirty =
    "<user_rules>secret</user_rules>\n<MEMORY[x]>hidden</MEMORY[x]>\nclean part";
  const clean = src.stripSideChannelBlocks(dirty);
  if (
    !clean.includes("<user_rules>") &&
    !clean.includes("<MEMORY[") &&
    clean.includes("clean part")
  ) {
    pass(
      "stripSideChannelBlocks",
      `${dirty.length}字 → ${clean.length}字 · 侧信道已剥`,
    );
  } else {
    fail("stripSideChannelBlocks", "侧信道残留");
  }

  // proto 编解码幂等
  const testFields = {
    1: [{ w: 0, v: 42 }],
    2: [{ w: 2, b: Buffer.from("hello world", "utf8") }],
    10: [{ w: 2, b: Buffer.from("道可道非常道", "utf8") }],
  };
  const serialized = src.serializeProto(testFields);
  const parsed = src.parseProto(serialized);
  if (
    parsed[1][0].v === 42 &&
    Buffer.from(parsed[2][0].b).toString("utf8") === "hello world" &&
    Buffer.from(parsed[10][0].b).toString("utf8") === "道可道非常道"
  ) {
    pass("proto 编解码", "serialize → parse 幂等");
  } else {
    fail("proto 编解码", "数据损坏");
  }

  // buildFrame + parseFrames 幂等
  const payload = src.serializeProto({
    3: [{ w: 2, b: Buffer.from("test", "utf8") }],
  });
  const frame = src.buildFrame(0, payload);
  const frames = src.parseFrames(frame);
  if (frames.length === 1 && frames[0].payload.length === payload.length) {
    pass("Connect-RPC 帧", "buildFrame → parseFrames 幂等");
  } else {
    fail("Connect-RPC 帧", `frames=${frames.length}`);
  }

  // modifySPProto: 全链路 SP 替换
  const spBuf = Buffer.from(fakeSP, "utf8");
  const nestedMsg = src.serializeProto({
    1: [{ w: 0, v: 0 }], // role=0 (system)
    2: [{ w: 2, b: spBuf }],
  });
  const topProto = src.serializeProto({ 2: [{ w: 2, b: nestedMsg }] });
  const reqFrame = src.buildFrame(0, topProto);
  const modFrame = src.modifySPProto(reqFrame);
  const modFrames = src.parseFrames(modFrame);
  const modTop = src.parseProto(modFrames[0].payload);
  const modNested = src.parseProto(Buffer.from(modTop[2][0].b));
  const afterSP = Buffer.from(modNested[2][0].b).toString("utf8");
  if (afterSP.includes("道可道") && afterSP.startsWith("You are Cascade")) {
    pass(
      "modifySPProto 全链路",
      `nested role=0: ${fakeSP.length}B → ${afterSP.length}B · 含道德经`,
    );
  } else {
    fail("modifySPProto 全链路", "SP 未正确替换");
  }

  // modifyRawSP: field[3] 路径
  const rawTop = src.serializeProto({ 3: [{ w: 2, b: spBuf }] });
  const rawFrame = src.buildFrame(0, rawTop);
  const rawMod = src.modifyRawSP(rawFrame);
  const rawModFrames = src.parseFrames(rawMod);
  const rawModTop = src.parseProto(rawModFrames[0].payload);
  const rawAfter = Buffer.from(rawModTop[3][0].b).toString("utf8");
  if (rawAfter.includes("道可道")) {
    pass("modifyRawSP", `field[3]: ${fakeSP.length}B → ${rawAfter.length}B`);
  } else {
    fail("modifyRawSP", "替换失败");
  }

  // deepStripRequestBody: user message 中侧信道剥除
  const userContent =
    "帮我查代码\n<MEMORY[x]>hidden</MEMORY[x]>\n<skills>sk</skills>\n正常部分";
  const userMsgProto = src.serializeProto({
    1: [{ w: 0, v: 1 }], // role=1 (user)
    2: [{ w: 2, b: Buffer.from(userContent, "utf8") }],
  });
  const deepTop = src.serializeProto({ 2: [{ w: 2, b: userMsgProto }] });
  const deepFrame = src.buildFrame(0, deepTop);
  const deepResult = src.deepStripRequestBody(deepFrame);
  if (deepResult.changed > 0) {
    const deepModTop = src.parseProto(
      src.parseFrames(deepResult.body)[0].payload,
    );
    const deepModMsg = src.parseProto(Buffer.from(deepModTop[2][0].b));
    const deepAfter = Buffer.from(deepModMsg[2][0].b).toString("utf8");
    if (
      !deepAfter.includes("<MEMORY[") &&
      !deepAfter.includes("<skills>") &&
      deepAfter.includes("正常部分")
    ) {
      pass(
        "deepStripRequestBody",
        `user msg 侧信道: ${deepResult.changed} 处剥除 · 正常内容保留`,
      );
    } else {
      fail("deepStripRequestBody", "侧信道残留或正常内容丢失");
    }
  } else {
    fail("deepStripRequestBody", "未检出侧信道");
  }

  // dissectSP
  const dissect = src.dissectSP(fakeSP);
  if (
    dissect &&
    dissect.block_count > 0 &&
    dissect.total_chars === fakeSP.length
  ) {
    pass(
      "dissectSP",
      `${dissect.block_count} 块 · 身份=${dissect.identity_chars}字 · 尾=${dissect.tail_chars}字`,
    );
  } else {
    fail("dissectSP", "解剖失败");
  }

  // classifyRPC
  const cls = [
    ["/exa.chat_web.ChatWebService/GetChatMessageV2", "CHAT_PROTO"],
    ["/exa.chat_web.ChatWebService/RawGetChatMessage", "CHAT_RAW"],
    ["/exa.codeium_common_pb.CascadeService/SomeRpc", "INFER_STRIP"],
    ["/some_mgmt_path/api", "PASSTHROUGH"],
  ];
  let clsOk = true;
  for (const [p, expect] of cls) {
    const got = src.classifyRPC(p);
    if (got !== expect) {
      clsOk = false;
      fail("classifyRPC", `${p} → ${got} (应=${expect})`);
    }
  }
  if (clsOk) pass("classifyRPC", "4 路径全正确");

  // routeUpstream
  const r1 = src.routeUpstream("/exa.chat_web.ChatWebService/Foo");
  const r2 = src.routeUpstream("/api/health");
  if (
    r1.host === "inference.codeium.com" &&
    r2.host === "server.self-serve.windsurf.com"
  ) {
    pass("routeUpstream", "inference + mgmt 路由正确");
  } else {
    fail("routeUpstream", `inference→${r1.host}, mgmt→${r2.host}`);
  }
}

// ═══════════════════════ L2: Proxy 控制面实测 ═══════════════════════

async function testL2_Proxy() {
  section("L2: Proxy 控制面实测 (HTTP :${PORT})".replace("${PORT}", PORT));

  if (SKIP_PROXY) {
    skip("全部跳过", "--skip-proxy");
    return;
  }

  // ping
  const ping = await httpGet(`http://127.0.0.1:${PORT}/origin/ping`);
  if (ping.status === 200 && ping.data && ping.data.ok) {
    pass(
      "ping",
      `mode=${ping.data.mode} pid=${ping.data.pid} dao=${ping.data.dao_chars}字 uptime=${ping.data.uptime_s}s reqs=${ping.data.req_total}`,
    );
    info(JSON.stringify(ping.data, null, 2));
  } else {
    fail("ping", `status=${ping.status} error=${ping.error || ""}`);
    console.log("    ⚠ proxy 未运行 · L2 后续测试将跳过");
    skip("mode/selftest/preview/lastinject", "proxy 不通");
    return;
  }

  // GET mode
  const modeGet = await httpGet(`http://127.0.0.1:${PORT}/origin/mode`);
  if (modeGet.status === 200 && modeGet.data && modeGet.data.mode) {
    pass("GET mode", `当前=${modeGet.data.mode}`);
  } else {
    fail("GET mode", modeGet.raw.slice(0, 200));
  }

  // selftest
  const st = await httpGet(`http://127.0.0.1:${PORT}/origin/selftest`, 15000);
  if (st.status === 200 && st.data) {
    if (st.data.all_paths_pass) {
      pass("selftest", `道=${st.data.dao_chars}字 · 4路径全通`);
      if (VERBOSE) {
        for (const [pn, pv] of Object.entries(st.data.paths || {})) {
          console.log(
            `      ${pn}: before=${pv.before_chars} after=${pv.after_chars} dao=${pv.contains_dao} leaked=${pv.leaked_count}`,
          );
        }
      }
    } else {
      fail("selftest", "部分路径未通过");
      for (const [pn, pv] of Object.entries(st.data.paths || {})) {
        if ((pv.leaked_count || 0) > 0) {
          console.log(
            `      ✗ ${pn}: leaked=[${(pv.leaked_markers || []).join(",")}]`,
          );
        }
      }
    }
  } else {
    fail("selftest", `status=${st.status} raw=${(st.raw || "").slice(0, 200)}`);
  }

  // preview
  const pv = await httpGet(`http://127.0.0.1:${PORT}/origin/preview`);
  if (pv.status === 200 && pv.data) {
    const d = pv.data;
    pass(
      "preview",
      `mode=${d.mode} after=${d.after_chars}字 before=${d.before_chars || 0}字 source=${d.source}`,
    );
    if (d.mode === "invert" && d.after && d.after.includes("道可道")) {
      pass("preview 道德经验证", "after 含 '道可道' · 注入正确");
    } else if (d.mode === "passthrough") {
      pass("preview passthrough", "透传模式 · after=before");
    }
    // dissect 验证
    if (d.before_dissect) {
      pass(
        "preview dissect(before)",
        `${d.before_dissect.block_count} 块 · ${d.before_dissect.total_chars}字`,
      );
    }
  } else {
    fail("preview", `status=${pv.status}`);
  }

  // lastinject
  const li = await httpGet(`http://127.0.0.1:${PORT}/origin/lastinject`);
  if (li.status === 200 && li.data) {
    if (li.data.has_inject) {
      pass(
        "lastinject",
        `kind=${li.data.kind} mode=${li.data.mode} age=${li.data.age_s}s before=${li.data.before_chars}字 after=${li.data.after_chars}字`,
      );
    } else {
      pass("lastinject", "无注入记录 (首次启动 · 等首问即有)");
    }
  } else {
    fail("lastinject", `status=${li.status}`);
  }
}

// ═══════════════════════ L3: LS 直连 gRPC ═══════════════════════

async function testL3_LS() {
  section("L3: LS 直连 gRPC (ls-client.js)");

  if (SKIP_LS) {
    skip("全部跳过", "--skip-ls");
    return;
  }

  let lsClient;
  try {
    lsClient = require("../ls-client");
    pass("require ls-client", "模块加载成功");
  } catch (e) {
    fail("require ls-client", e.message);
    return;
  }

  // discoverLS
  let ls;
  try {
    ls = lsClient.discoverLS(true);
    if (ls && ls.port) {
      pass(
        "discoverLS",
        `port=${ls.port} pid=${ls.pid} csrf=${ls.csrf ? ls.csrf.slice(0, 8) + "..." : "无"}`,
      );
    } else {
      fail("discoverLS", "LS 进程未找到");
      return;
    }
  } catch (e) {
    fail("discoverLS", e.message);
    return;
  }

  // Heartbeat
  const hb = await lsClient.lsRpc(
    ls.port,
    ls.csrf,
    "Heartbeat",
    { metadata: { ideName: "windsurf" } },
    5000,
  );
  if (hb.ok) {
    pass("Heartbeat", `status=${hb.status}`);
  } else {
    fail(
      "Heartbeat",
      `status=${hb.status} data=${JSON.stringify(hb.data).slice(0, 200)}`,
    );
    // try without CSRF
    const hb2 = await lsClient.lsRpc(
      ls.port,
      "",
      "Heartbeat",
      { metadata: { ideName: "windsurf" } },
      5000,
    );
    if (hb2.ok) {
      pass("Heartbeat (无CSRF)", "CSRF 非必需");
    } else {
      fail("Heartbeat (无CSRF)", "LS 完全不响应");
      return;
    }
  }

  // gatherAll
  console.log("    ⏳ gatherAll (9 端点并行) ...");
  let allData;
  try {
    allData = await lsClient.gatherAll();
    if (allData.error) {
      fail("gatherAll", allData.error);
    } else {
      pass("gatherAll", "9 端点数据已获");
    }
  } catch (e) {
    fail("gatherAll", e.message);
    return;
  }

  // 逐项检查
  const endpoints = [
    { key: "rules", label: "GetAllRules" },
    { key: "mcp", label: "GetMcpServerStates" },
    { key: "settings", label: "GetUserSettings" },
    { key: "workspaces", label: "GetWorkspaceInfos" },
    { key: "cascadeMemories", label: "GetCascadeMemories" },
    { key: "userMemories", label: "GetUserMemories" },
    { key: "skills", label: "GetAllSkills" },
    { key: "workflows", label: "GetAllWorkflows" },
    { key: "trajectories", label: "GetAllCascadeTrajectories" },
  ];
  for (const ep of endpoints) {
    const d = allData[ep.key];
    if (d !== null && d !== undefined) {
      const size = JSON.stringify(d).length;
      const keys = typeof d === "object" ? Object.keys(d) : [];
      pass(
        ep.label,
        `${size} 字节 · keys=[${keys.slice(0, 5).join(",")}${keys.length > 5 ? "..." : ""}]`,
      );
      info(JSON.stringify(d, null, 2).slice(0, 300));
    } else {
      fail(ep.label, "返回 null");
    }
  }

  // 深入检查 Rules
  if (allData.rules) {
    const memories = allData.rules.memories || [];
    if (memories.length > 0) {
      console.log(`    📋 Rules (user_rules): ${memories.length} 条`);
      for (const m of memories) {
        const id = m.memoryId || m.title || "?";
        const chars = (m.content || "").length;
        const trigger = (m.cortexMemoryTrigger || m.trigger || "").replace(
          "CORTEX_MEMORY_TRIGGER_",
          "",
        );
        const source = (m.ruleSource || "").replace(
          "CORTEX_MEMORY_RULE_SOURCE_",
          "",
        );
        const isDao =
          id.includes("dao") || (m.content || "").includes("道可道");
        console.log(
          `      ${isDao ? "🏯" : "📄"} ${id}: ${chars}字 trigger=${trigger} src=${source}`,
        );
      }
    }
  }

  // 深入检查 MCP
  if (allData.mcp) {
    const states = allData.mcp.states || [];
    if (states.length > 0) {
      console.log(`    🔌 MCP Servers: ${states.length} 个`);
      for (const s of states) {
        const name = (s.spec && s.spec.name) || "?";
        const ready = s.status === "MCP_SERVER_STATUS_READY";
        const tools = (s.tools || []).length;
        console.log(
          `      ${ready ? "🟢" : "🔴"} ${name}: ${s.status} · ${tools} tools`,
        );
      }
    }
  }

  // gatherQuick
  try {
    const quick = await lsClient.gatherQuick();
    if (!quick.error) {
      pass("gatherQuick", "快速3端点正常");
    } else {
      fail("gatherQuick", quick.error);
    }
  } catch (e) {
    fail("gatherQuick", e.message);
  }
}

// ═══════════════════════ L4: 文件层隔离器 ═══════════════════════

async function testL4_Isolator() {
  section("L4: 文件层隔离器 (isolator.js)");

  let isolator;
  try {
    isolator = require("../isolator");
    pass("require isolator", "模块加载成功");
  } catch (e) {
    fail("require isolator", e.message);
    return;
  }

  // DAO_ALLOWED_RULES
  if (isolator.DAO_ALLOWED_RULES && isolator.DAO_ALLOWED_RULES.length > 0) {
    pass(
      "DAO_ALLOWED_RULES",
      `${isolator.DAO_ALLOWED_RULES.length} 条: [${isolator.DAO_ALLOWED_RULES.join(", ")}]`,
    );
  } else {
    fail("DAO_ALLOWED_RULES", "白名单为空");
  }

  // status (只读 · 不做任何文件操作)
  try {
    const st = isolator.status(WS_ROOT);
    pass(
      "status",
      `mode=${st.mode} active=${st.rules.active_count} quarantined=${st.rules.quarantined_count} dao_kept=${st.rules.dao_kept_count} non_dao=${st.rules.non_dao_active_count}`,
    );
    info(`rules_dir=${st.paths.rules_dir}`);
    info(`quarantine_dir=${st.paths.quarantine_dir}`);
    if (st.rules.active.length > 0) {
      console.log(`    📋 活动规则: [${st.rules.active.join(", ")}]`);
    }
    if (st.rules.quarantined.length > 0) {
      console.log(`    🔒 已隔离: [${st.rules.quarantined.join(", ")}]`);
    }
    if (st.rules.non_dao_active.length > 0) {
      console.log(`    ⚠ 非道活动: [${st.rules.non_dao_active.join(", ")}]`);
    }
  } catch (e) {
    fail("status", e.message);
  }

  // readState
  try {
    const s = isolator.readState(WS_ROOT);
    if (s) {
      pass("readState", `mode=${s.mode} ts=${new Date(s.ts).toLocaleString()}`);
    } else {
      pass("readState", "无状态文件 (首次)");
    }
  } catch (e) {
    fail("readState", e.message);
  }

  // scanAgentsMd
  try {
    const agents = isolator.scanAgentsMd(WS_ROOT, { maxDepth: 4 });
    pass("scanAgentsMd", `找到 ${agents.length} 个 AGENTS.md`);
    if (agents.length > 0 && VERBOSE) {
      for (const a of agents.slice(0, 10)) console.log(`      ${a}`);
    }
  } catch (e) {
    fail("scanAgentsMd", e.message);
  }

  // v17.75 · 去芜存菁不变式 · enter 已删 · 只留 exit/status (legacy 清理)
  try {
    if (typeof isolator.enter === "function") {
      fail("enter 已删", "v17.75 去芜存菁失效 · enter 不应再导出");
    } else {
      pass("enter 已删", "v17.75 不变式 · 本源唯 proxy invert · 文件层不动");
    }
    if (typeof isolator.exit === "function") {
      pass("exit 保留", "legacy 遗留清理");
    } else {
      fail("exit 保留", "应保留 exit 用于 v17.65- 遗留恢复");
    }
    if (typeof isolator.status === "function") {
      pass("status 保留", "观照只读");
    } else {
      fail("status 保留", "应保留 status 供观照");
    }
  } catch (e) {
    fail("去芜存菁不变式", e.message);
  }

  // exit 幂等测 (无 legacy 残迹时各字段 skipped=true)
  const tmpRoot = path.join(os.tmpdir(), `dao_isolator_test_${Date.now()}`);
  try {
    fs.mkdirSync(path.join(tmpRoot, ".windsurf"), { recursive: true });
    const exitResult = isolator.exit(tmpRoot);
    // 无 legacy 残迹 · exit 应正常返回 (rules.restored=[]) · 不崩
    if (
      exitResult &&
      exitResult.mode === "official" &&
      Array.isArray(exitResult.rules.restored)
    ) {
      pass(
        "exit 空态幂等",
        `mcp=${exitResult.mcp.skipped ? "skip" : "done"} mem=${exitResult.memories.skipped ? "skip" : "done"}`,
      );
    } else {
      fail("exit 空态幂等", JSON.stringify(exitResult).slice(0, 300));
    }

    // 二次 exit · 仍幂等 · 不崩
    const exit2 = isolator.exit(tmpRoot);
    if (exit2 && exit2.rules.restored.length === 0) {
      pass("exit 二次幂等", "重入无副作用");
    } else {
      fail("exit 二次幂等", JSON.stringify(exit2).slice(0, 300));
    }
  } catch (e) {
    fail("exit 幂等测", e.message);
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  }
}

// ═══════════════════════ L5: 模式切换动态 ═══════════════════════

async function testL5_ModeSwitching() {
  section("L5: 模式切换动态 (invert ↔ passthrough)");

  if (SKIP_PROXY) {
    skip("全部跳过", "--skip-proxy");
    return;
  }

  // 检查 proxy 是否在线
  const ping = await httpGet(`http://127.0.0.1:${PORT}/origin/ping`);
  if (!ping.data || !ping.data.ok) {
    skip("全部跳过", "proxy 未运行");
    return;
  }

  const origMode = ping.data.mode;
  console.log(`    当前模式: ${origMode}`);

  // 切到 invert
  const toInvert = await httpPost(`http://127.0.0.1:${PORT}/origin/mode`, {
    mode: "invert",
  });
  if (toInvert.data && toInvert.data.ok && toInvert.data.mode === "invert") {
    pass(
      "切 invert",
      `previous=${toInvert.data.previous} → ${toInvert.data.mode}`,
    );
  } else {
    fail("切 invert", (toInvert.raw || "").slice(0, 200));
  }

  // 验证 preview 在 invert 下
  const pvInvert = await httpGet(`http://127.0.0.1:${PORT}/origin/preview`);
  if (pvInvert.data && pvInvert.data.mode === "invert") {
    const has_dao =
      pvInvert.data.after && pvInvert.data.after.includes("道可道");
    const has_header =
      pvInvert.data.after && pvInvert.data.after.startsWith("You are Cascade");
    if (has_dao && has_header) {
      pass(
        "invert preview",
        `after=${pvInvert.data.after_chars}字 · 含道德经+TAO_HEADER`,
      );
    } else {
      fail("invert preview", `dao=${has_dao} header=${has_header}`);
    }
  } else {
    fail("invert preview", `mode=${pvInvert.data && pvInvert.data.mode}`);
  }

  // 切到 passthrough
  const toPass = await httpPost(`http://127.0.0.1:${PORT}/origin/mode`, {
    mode: "passthrough",
  });
  if (toPass.data && toPass.data.ok && toPass.data.mode === "passthrough") {
    pass(
      "切 passthrough",
      `previous=${toPass.data.previous} → ${toPass.data.mode}`,
    );
  } else {
    fail("切 passthrough", (toPass.raw || "").slice(0, 200));
  }

  // 验证 preview 在 passthrough 下
  const pvPass = await httpGet(`http://127.0.0.1:${PORT}/origin/preview`);
  if (pvPass.data && pvPass.data.mode === "passthrough") {
    // passthrough: after === before (若有 captured before)
    if (pvPass.data.has_captured_before) {
      const match = pvPass.data.after === pvPass.data.before;
      if (match) {
        pass(
          "passthrough preview",
          `after=before · 零改写 · ${pvPass.data.after_chars}字`,
        );
      } else {
        fail("passthrough preview", "after ≠ before");
      }
    } else {
      pass(
        "passthrough preview",
        `source=at_rest · after=${pvPass.data.after_chars}字`,
      );
    }
    // dissect 验证 (passthrough 下有 after_dissect)
    if (pvPass.data.after_dissect || pvPass.data.before_dissect) {
      const d = pvPass.data.after_dissect || pvPass.data.before_dissect;
      pass(
        "passthrough dissect",
        `${d.block_count} 块 · identity=${d.identity_chars}字`,
      );
    }
  } else {
    fail("passthrough preview", `mode=${pvPass.data && pvPass.data.mode}`);
  }

  // 无效模式 · 应返 400
  const badMode = await httpPost(`http://127.0.0.1:${PORT}/origin/mode`, {
    mode: "invalid_xyz",
  });
  if (badMode.status === 400) {
    pass("无效模式拒绝", "status=400 · 正确拒绝");
  } else {
    fail("无效模式拒绝", `status=${badMode.status}`);
  }

  // 切回原模式
  if (origMode && origMode !== "passthrough") {
    await httpPost(`http://127.0.0.1:${PORT}/origin/mode`, { mode: origMode });
    console.log(`    已切回原模式: ${origMode}`);
  } else {
    // 默认切回 invert (道模式)
    await httpPost(`http://127.0.0.1:${PORT}/origin/mode`, { mode: "invert" });
    console.log("    已切回道模式: invert");
  }
}

// ═══════════════════════ L6: essence 数据采集 ═══════════════════════

async function testL6_Essence() {
  section("L6: essence 数据采集 (gatherEssence)");

  let essenceMod;
  try {
    // essence.js 需要 vscode 模块 · 我们 mock 它
    const Module = require("module");
    const origResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, parent, ...rest) {
      if (request === "vscode") return request;
      return origResolve.call(this, request, parent, ...rest);
    };
    const origLoad = Module._cache;
    // Simple vscode mock
    require.cache[require.resolve("vscode")] = {
      id: "vscode",
      filename: "vscode",
      loaded: true,
      exports: {
        window: {
          createWebviewPanel: () => {},
          showInformationMessage: () => {},
        },
        workspace: {
          getConfiguration: () => ({ get: () => null }),
          workspaceFolders: [],
        },
        Uri: { file: (f) => ({ fsPath: f }) },
        ViewColumn: {},
        commands: { registerCommand: () => {} },
      },
    };
  } catch {}

  let gatherEssence;
  try {
    const mod = require("../essence");
    gatherEssence = mod.gatherEssence;
    if (!gatherEssence) throw new Error("gatherEssence 未导出");
    pass("require essence", "模块加载成功");
  } catch (e) {
    fail("require essence", e.message);
    return;
  }

  // v19 · 新形: {ts, proxy, lsFragments} · 余皆已损
  // 无 proxy 测试: 退而求 LS user_rules 片段
  if (!SKIP_LS) {
    try {
      console.log("    ⏳ gatherEssence(ctx=null, port=null) ...");
      const data = await gatherEssence(null, null);
      if (data && data.ts) {
        const frags = data.lsFragments || [];
        pass(
          "gatherEssence (仅LS)",
          `ts=${data.ts} · proxy=${!!data.proxy} · lsFragments=${frags.length}`,
        );
      } else {
        fail("gatherEssence (仅LS)", "data.ts 为空");
      }
    } catch (e) {
      fail("gatherEssence (仅LS)", e.message);
    }
  }

  // 有 proxy 测试: 首选 proxy.after
  if (!SKIP_PROXY) {
    const ping = await httpGet(`http://127.0.0.1:${PORT}/origin/ping`);
    if (ping.data && ping.data.ok) {
      try {
        console.log(`    ⏳ gatherEssence(ctx=null, port=${PORT}) ...`);
        const data = await gatherEssence(null, PORT);
        if (data && data.proxy && data.proxy.after) {
          pass(
            "gatherEssence (proxy)",
            `proxy.mode=${data.proxy.mode} · after=${data.proxy.after.length}字`,
          );
        } else if (data && data.ts) {
          pass(
            "gatherEssence (proxy=null · 退LS)",
            `lsFragments=${(data.lsFragments || []).length}`,
          );
        } else {
          fail("gatherEssence (proxy)", JSON.stringify(data).slice(0, 300));
        }
      } catch (e) {
        fail("gatherEssence (proxy)", e.message);
      }
    } else {
      skip("gatherEssence (proxy)", "proxy 不通");
    }
  }
}

// ═══════════════════════ 主流程 ═══════════════════════

async function main() {
  console.log("\x1b[1m");
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  道Agent E2E 全链路实测                                   ║");
  console.log("║  兵无常势 水无常形 能因敌变化而取胜者谓之神               ║");
  console.log("║  道法自然 · 天之道利而不害 · 圣人之道为而不争             ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log("\x1b[0m");
  console.log(`  时间: ${new Date().toLocaleString()}`);
  console.log(`  工作区: ${WS_ROOT}`);
  console.log(`  端口: ${PORT}`);
  console.log(
    `  选项: verbose=${VERBOSE} skip-proxy=${SKIP_PROXY} skip-ls=${SKIP_LS}\n`,
  );

  await testL1_Backend();
  await testL2_Proxy();
  await testL3_LS();
  await testL4_Isolator();
  await testL5_ModeSwitching();
  await testL6_Essence();

  // ═══ 总结 ═══
  console.log(
    "\n\x1b[1m═══════════════════════════════════════════════════════════\x1b[0m",
  );
  console.log(
    `  \x1b[32m✓ 通过: ${_pass}\x1b[0m  \x1b[31m✗ 失败: ${_fail}\x1b[0m  \x1b[33m○ 跳过: ${_skip}\x1b[0m  总计: ${_pass + _fail + _skip}`,
  );
  if (_fail === 0) {
    console.log("\x1b[32m\n  大成若缺 其用不弊 · 全链路通过 ✓\x1b[0m");
  } else {
    console.log("\x1b[31m\n  道隐无名 · 有 " + _fail + " 处待修 ✗\x1b[0m");
  }
  console.log(
    "\x1b[1m═══════════════════════════════════════════════════════════\x1b[0m\n",
  );

  // 写结果到文件
  const resultFile = path.join(__dirname, "_e2e_result.json");
  try {
    fs.writeFileSync(
      resultFile,
      JSON.stringify(
        {
          ts: new Date().toISOString(),
          pass: _pass,
          fail: _fail,
          skip: _skip,
          ws: WS_ROOT,
          port: PORT,
          results: _results,
        },
        null,
        2,
      ),
    );
    console.log(`  结果已写: ${resultFile}\n`);
  } catch {}

  process.exit(_fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("致命错误:", e);
  process.exit(2);
});
