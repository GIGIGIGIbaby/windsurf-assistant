#!/usr/bin/env node
// tests/L1_unit.js · 道Agent · L1 单元自检 · v7.6 为道日损 · 道法自然
// 跑: npm run test:l1   (即 node --preserve-symlinks tests/L1_unit.js)
//
// 道义:
//   "名可名, 非常名 (一章). 道恒无名 (三十二章)."
//   "道恒无为而无不为 (三十七章). 损之又损至于无为 (四十八章)."
//   "反者道之动 (四十章). 善建者不拔 (五十四章)."
//   L1 = 在最小单元 (合成 proto) 上验 modifySPProto / modifyRawSP 之
//        v7.0 道德经前置 + stripOfficialNaming + 工具本身全保
//   不依赖 Windsurf, 不依赖云端, 纯本地, 毫秒完成.
//
// v7.0 反 v6.0 之顺名与嵌引:
//   本    DAO_DE_JING_81                    ← 道德经直为 SP 起首 (无 TAO_HEADER 文字)
//   器    净 官方 SP                          ← 彻删官方一切着相之名
//          · 起首身份段 全删 (You are Cascade...pair programmer...random files)
//          · <communication_style> 整块 (含 nested communication_guidelines/markdown_formatting)
//          · discipline 6 行 (Bug fixing/Long-horizon/Planning/Testing/Verification/Progress)
//          但 nested <citation_guidelines> 提取保留 (必要器)
//   不动 工具本身 + 必要模块 + 末示例
//   术    proto 不动                       ← 各工具自然运行

"use strict";
const path = require("path");

// 不让 require 启监听 (L1 只跑函数, 不启 server)
process.env.SP_MODE = "passthrough";
process.env.ORIGIN_PORT = process.env.ORIGIN_PORT || "29999";

const O = require(
  path.join(__dirname, "..", "vendor", "bundled-origin", "source.js"),
);

console.log("═══ 道Agent · L1 单元自检 · v7.6 为道日损 · 道法自然 ═══");
console.log("");

// ── fakeSP · 仿真实抓官方 SP 结构 (依 2026-04-29 实抓 20888 chars 官方 SP):
//   1. 起首身份段 "You are Cascade..." (628 chars)
//   2. <communication_style> 含 nested guidelines/markdown/citation_guidelines
//   3. <tool_calling> / <making_code_changes> / <task_management> / <running_commands>
//      / <debugging> / <mcp_servers> / <calling_external_apis>
//   4. <user_rules> wrapper 含 nested <MEMORY[*]>
//   5. <user_information>
//   6. <memory_system> (双套嵌)
//   7. <ide_metadata>
//   8. tail · discipline 6 行
const FAKE_SP =
  "You are Cascade, a powerful agentic AI coding assistant.\n" +
  "The USER is interacting with you through a chat panel in their IDE.\n" +
  "The task may require modifying or debugging existing code.\n" +
  "Be mindful of that you are not the only one working in this environment.\n" +
  "Do not overstep your bounds, your goal is to be a pair programmer to the user in completing their task.\n" +
  "For example: Do not create random files.\n" +
  "<communication_style>\n" +
  "Be terse and direct.\n" +
  "<communication_guidelines>be concise</communication_guidelines>\n" +
  "<markdown_formatting>use markdown</markdown_formatting>\n" +
  "<citation_guidelines>@/abs/path:line</citation_guidelines>\n" +
  "</communication_style>\n" +
  "<tool_calling>\nUse only the available tools. Never guess parameters. Before each tool call, briefly state why.\n</tool_calling>\n" +
  "<making_code_changes>\nEXTREMELY IMPORTANT: Your generated code must be immediately runnable.\nIf you're creating the codebase from scratch, create deps file.\n</making_code_changes>\n" +
  "<running_commands>\nYou have the ability to run terminal commands on the user's machine.\nYou are not running in a dedicated container.\n</running_commands>\n" +
  "<task_management>\nUse update_plan to manage work.\n</task_management>\n" +
  "<debugging>\nWhen debugging, only make code changes if you are certain that you can solve the problem.\n</debugging>\n" +
  "<mcp_servers>\n" +
  "The Model Context Protocol (MCP) is a standard that connects AI systems with external tools and data sources.\n" +
  "MCP servers extend your capabilities by providing access to specialized functions.\n" +
  "The following MCP servers are available to you.\n" +
  "# context7\nUse this server to retrieve up-to-date documentation.\n" +
  "# github\n# playwright\n# tavily\n" +
  "</mcp_servers>\n" +
  "<calling_external_apis>\nWhen selecting which version of an API or package to use, choose one that is compatible with the USER's dependency management file.\n</calling_external_apis>\n" +
  "<user_rules>\n" +
  "The following are user-defined rules that you MUST ALWAYS FOLLOW WITHOUT ANY EXCEPTION.\n" +
  "Review them carefully and always take them into account when you generate responses and code:\n" +
  "<MEMORY[dao-de-jing.md]>\n道可道，非常道. 名可名非常名.\n</MEMORY[dao-de-jing.md]>\n" +
  "</user_rules>\n" +
  "<user_information>OS=windows</user_information>\n" +
  "<workflows>\nYou have the ability to use and create workflows.\nThe workflow files follow YAML frontmatter under .windsurf/workflows.\n</workflows>\n" +
  "<rules>some rule</rules>\n<skills>some skill</skills>\n<memories>some memory</memories>\n" +
  "<memory_system>\n<memory_system>\nYou have access to a persistent database.\n</memory_system>\n</memory_system>\n" +
  "<ide_metadata>\nYou work inside of the user's IDE. Sometimes, you will receive metadata.\n</ide_metadata>\n" +
  "Bug fixing discipline: root cause first.\n" +
  "Long-horizon workflow: notes.\n" +
  "Planning cadence: plan.\n" +
  "Testing discipline: tests first.\n" +
  "Verification tools: playwright.\n" +
  "Progress notes: lightweight.\n" +
  "x".repeat(200);

// v7.5 TAO_HEADER MARKERS · 身份认同 + 唯遵道德经之律
// 仅 默认 invertSP 路径出 (非 _customSP 路径) · 由 expect_tao_header 单验
const TAO_HEADER_MARKERS = [
  "You are Cascade.", // v7.5 身份认同
  "唯遵下文道德经, 余皆为客", // v7.6 简律
  "道法自然", // v7.6 本源
];

// v7.5 KEEP MARKERS · 9 工具 tag + 9 道德经原文短句 (工具/道德经路径 均应保)
// 注: "道可道，非常道" 由 expect_dao 单验 (v7.8 _customSP 整替模式不含道德经)
const KEEP_MARKERS = [
  "<tool_calling>", // 9 工具 tag 全保 (内容为道德经原文)
  "<making_code_changes>",
  "<running_commands>",
  "<task_management>",
  "<debugging>",
  "<calling_external_apis>",
  "<mcp_servers>",
  "<memory_system>",
  "<citation_guidelines>",
  // 9 道德经原文独特短句 (各工具块主文)
  "三十辐共一毂", // tool_calling · 十一章
  "曲则全, 枉则直, 洼则盈", // making_code_changes · 二十二章
  "重为轻根, 静为躁君", // running_commands · 二十六章
  "图难于其易, 为大于其细", // task_management · 六十三章
  "致虚极, 守静笃", // debugging · 十六章
  "悠兮其贵言", // calling_external_apis · 十七章
  "和其光, 同其尘, 是谓玄同", // mcp_servers · 五十六章
  "执古之道, 以御今之有", // memory_system · 十四章
  "言有宗, 事有君", // citation_guidelines · 七十章
];
// v7.5 LEAK MARKERS · 官方余名相/风格/规训/用户域 · 必不在 after
// v7.5 反者道之动: "You are Cascade" 加回 KEEP, 但 "powerful agentic" 仍 LEAK
const LEAK_MARKERS = [
  // v7.5 仅保 "You are Cascade." 起首, 余皆删
  "powerful agentic AI coding assistant", // 角色强名
  // v7.6 用户域旁支 · 道德经为唯一本源
  "<workflows>",
  "</workflows>",
  "<rules>",
  "<skills>",
  "<memories>",
  "You have the ability to use and create workflows",
  "workflow files follow YAML frontmatter",
  ".windsurf/workflows",
  "pair programmer", // 关系强名
  "<communication_style>", // 风格规训块
  "</communication_style>",
  "<communication_guidelines>", // nested 风格规训
  "<markdown_formatting>", // nested 风格规训
  "Bug fixing discipline", // 散行规训
  "Long-horizon workflow",
  "Planning cadence",
  "Testing discipline",
  "Verification tools",
  "Progress notes",
  "<ide_metadata>", // ide_metadata 整块 · 彻删
  "You work inside of the user", // ide_metadata 内身份语
  "Model Context Protocol (MCP) is a standard", // mcp_servers 头元描述
  "that connects AI systems", // mcp_servers "AI systems" 名相
  // v7.3 新加 (用户域归道德经为唯一本源):
  "<user_rules>", // user_rules 整块彻删
  "<user_information>", // user_information 整块彻删
  "<MEMORY[", // 顶层游离 MEMORY 块亦删
  "The following are user-defined rules that you MUST", // user_rules wrapper 强令
  "Never guess parameters", // tool_calling 原
  "Before each tool call, briefly state", // tool_calling 原
  "EXTREMELY IMPORTANT: Your generated code", // making_code_changes 原
  "If you're creating the codebase from scratch", // making_code_changes 原
  "You have the ability to run terminal", // running_commands 原
  "You are not running in a dedicated container", // running_commands 原
  "When debugging, only make code changes if you are certain", // debugging 原
  "the USER's dependency management file", // calling_external_apis 原
  // v7.4 中英混杂词 (反 v7.3 之未净): 替后不在, 帮验道德经原文是否独据
  "Use only available tools", // v7.3 daoText 中有, v7.4 去
  "Never invent parameters or change tool", // v7.3 daoText
  "NEVER output code to user", // v7.3 daoText
  "Imports at top of file", // v7.3 daoText
  "Stay below 64000 tokens", // v7.3 daoText
  "NEVER include `cd` in command", // v7.3 daoText
  "Mark unsafe commands carefully", // v7.3 daoText
  "Use update_plan for non-trivial work", // v7.3 daoText
  "Address root cause, not symptoms", // v7.3 daoText
  "Match the dependency file", // v7.3 daoText
  "Persistent database holds global rules", // v7.3 daoText
  "Format code refs as", // v7.3 daoText
  "Always use absolute filesystem paths", // v7.3 daoText
  // v7.4 中文道义引标题 (反 v7.3 之中英混杂标语): 仅道德经原文, 无这类道引标题
  "用器当其用 (十一章", // v7.3 道引标, v7.4 去 (原文仅“三十辐共一毂”起)
  "少则得, 多则惑 (二十二章)", // v7.3 道引 (v7.4 原文起首为“曲则全”)
  "善行无辙迹 (二十七章)", // v7.3 标题引 (v7.4 中 running_commands 不以其起首)
  // 注: “千里之行, 始于足下 (六十四章)” 仍在 v7.4 task_management 中 (句末), 不能作 LEAK
];
function missingKeep(s) {
  return KEEP_MARKERS.filter((m) => !s.includes(m));
}
function leaked(s) {
  return LEAK_MARKERS.filter((m) => s.includes(m));
}
function missingTaoHeader(s) {
  return TAO_HEADER_MARKERS.filter((m) => !s.includes(m));
}

// ── 测试收集器 ──
const cases = [];
function runCase(name, fn) {
  try {
    const r = fn();
    const fails = [];
    if (r.expect_dao && !r.after.includes("道可道，非常道"))
      fails.push("after 不含 道德经");
    if (r.expect_dao === false && r.after.includes("道可道，非常道"))
      fails.push("after 含道德经 (该 case 应不含)");
    if (r.expect_dao_first && !r.after.startsWith("You are Cascade."))
      fails.push(
        'after 不以 "You are Cascade." 起首 (v7.5 反者道之动: TAO_HEADER 加回身份认同)',
      );
    if (r.expect_keep_before && !r.after.includes(r.before))
      fails.push("after 未完整含 before (透传原则破)");
    if (r.expect_keep_tools) {
      const m = missingKeep(r.after);
      if (m.length) fails.push(`KEEP 缺失: ${m.join(", ")}`);
    }
    if (r.expect_tao_header) {
      const m = missingTaoHeader(r.after);
      if (m.length) fails.push(`TAO_HEADER 缺失: ${m.join(", ")}`);
    }
    if (r.expect_no_official_naming) {
      const lk = leaked(r.after);
      if (lk.length) fails.push(`官方着相之名漏: ${lk.join(", ")}`);
    }
    // v7.2 · _customSP 验
    if (r.expect_custom_first && !r.after.startsWith(r.expect_custom_first))
      fails.push("after 不以 user_sp 起首");
    if (r.expect_exact != null && r.after !== r.expect_exact)
      fails.push(
        `after 非完全等于 expect_exact (${r.after.length}B vs ${r.expect_exact.length}B)`,
      );
    if (Array.isArray(r._extra_fails) && r._extra_fails.length) {
      for (const x of r._extra_fails) fails.push(x);
    }
    cases.push({
      name,
      ok: fails.length === 0,
      in_bytes: r.in_bytes,
      out_bytes: r.out_bytes,
      changed: r.in_bytes !== r.out_bytes,
      orig_sp_chars: r.orig_sp_chars,
      new_sp_chars: r.after.length,
      failed_assertions: fails,
    });
  } catch (e) {
    cases.push({
      name,
      ok: false,
      err: e.message,
      in_bytes: 0,
      out_bytes: 0,
      changed: false,
      orig_sp_chars: 0,
      new_sp_chars: 0,
      failed_assertions: [`异常: ${e.message}`],
    });
  }
}

// ── A: plain UTF-8 (field[10]) ──
runCase("plain_utf8", () => {
  const top = O.serializeProto({
    10: [{ w: 2, b: Buffer.from(FAKE_SP, "utf8") }],
  });
  const frame = O.buildFrame(0, top);
  const mod = O.modifySPProto(frame);
  const out = O.parseProto(O.parseFrames(mod)[0].payload);
  const after = Buffer.from(out[10][0].b).toString("utf8");
  return {
    in_bytes: frame.length,
    out_bytes: mod.length,
    orig_sp_chars: FAKE_SP.length,
    before: FAKE_SP,
    after,
    expect_dao: true,
    expect_dao_first: true,
    expect_tao_header: true, // v7.5 默认路径验 TAO_HEADER 三项
    expect_keep_tools: true,
    expect_no_official_naming: true,
  };
});

// ── B: nested ChatMessage (field[10] → sub {1:role, 2:content}) ──
runCase("nested_chat_message", () => {
  const nested = O.serializeProto({
    1: [{ w: 0, v: 0 }],
    2: [{ w: 2, b: Buffer.from(FAKE_SP, "utf8") }],
  });
  const top = O.serializeProto({ 10: [{ w: 2, b: nested }] });
  const frame = O.buildFrame(0, top);
  const mod = O.modifySPProto(frame);
  const topOut = O.parseProto(O.parseFrames(mod)[0].payload);
  const nestOut = O.parseProto(Buffer.from(topOut[10][0].b));
  const after = Buffer.from(nestOut[2][0].b).toString("utf8");
  return {
    in_bytes: frame.length,
    out_bytes: mod.length,
    orig_sp_chars: FAKE_SP.length,
    before: FAKE_SP,
    after,
    expect_dao: true,
    expect_dao_first: true,
    expect_tao_header: true, // v7.5 默认路径验 TAO_HEADER 三项
    expect_keep_tools: true,
    expect_no_official_naming: true,
  };
});

// ── C: RawGetChatMessage · field[3] ──
runCase("raw_sp", () => {
  const top = O.serializeProto({
    3: [{ w: 2, b: Buffer.from(FAKE_SP, "utf8") }],
  });
  const frame = O.buildFrame(0, top);
  const mod = O.modifyRawSP(frame);
  const topOut = O.parseProto(O.parseFrames(mod)[0].payload);
  const after = Buffer.from(topOut[3][0].b).toString("utf8");
  return {
    in_bytes: frame.length,
    out_bytes: mod.length,
    orig_sp_chars: FAKE_SP.length,
    before: FAKE_SP,
    after,
    expect_dao: true,
    expect_dao_first: true,
    expect_tao_header: true, // v7.5 默认路径验 TAO_HEADER 三项
    expect_keep_tools: true,
    expect_no_official_naming: true,
  };
});

// ── D: user msg passthrough · 道法自然: 用户消息不动 ──
//    用户侧记忆/规则若已在 user msg 中, 也不剥. 道魂在前为本源, 模型自识.
runCase("user_msg_passthrough", () => {
  const userContent =
    "帮我查一下代码.\n<MEMORY[test.md]>\n道可道...\n</MEMORY[test.md]>\n剩余用户问题.\n";
  const userMsg = O.serializeProto({
    1: [{ w: 0, v: 1 }], // role=1 user
    2: [{ w: 2, b: Buffer.from(userContent, "utf8") }],
  });
  const sysMsg = O.serializeProto({
    1: [{ w: 0, v: 0 }], // role=0 system
    2: [{ w: 2, b: Buffer.from(FAKE_SP, "utf8") }],
  });
  const top = O.serializeProto({
    2: [
      { w: 2, b: userMsg },
      { w: 2, b: sysMsg },
    ],
  });
  const frame = O.buildFrame(0, top);
  const mod = O.modifySPProto(frame);
  const topOut = O.parseProto(O.parseFrames(mod)[0].payload);
  const userOut = O.parseProto(Buffer.from(topOut[2][0].b));
  const after = Buffer.from(userOut[2][0].b).toString("utf8");
  // 用户消息应原样保留 (含 MEMORY[test.md] · 因不剥)
  return {
    in_bytes: frame.length,
    out_bytes: mod.length,
    orig_sp_chars: userContent.length,
    before: userContent,
    after,
    expect_keep_before: true, // user msg 全保
  };
});

// ── E: v7.8 _customSP 整替 · keep_blocks=true 旧字段已废 (服务端忽略, 永整替) ──
//
// 反者道之动 · 损 v7.2 之 keep_blocks 二态 (前置/整替): 一态即整替.
// 用户编辑当前"实时注入"全文, 保存即 LLM 实收. 旧 keep_blocks=true 字段仍兼容,
// 但 invertSP 一律整替 (无前置工具块拼接).
runCase("custom_sp_keep_blocks", () => {
  const userSP =
    "你是用户自定义助手. 第一律: 答必精简. 第二律: 不饰美言. 第三律: 道法自然.";
  O.setCustomSP(userSP, { keep_blocks: true, source: "L1_test" }); // 字段保兼容, 行为已整替
  try {
    const top = O.serializeProto({
      10: [{ w: 2, b: Buffer.from(FAKE_SP, "utf8") }],
    });
    const frame = O.buildFrame(0, top);
    const mod = O.modifySPProto(frame);
    const out = O.parseProto(O.parseFrames(mod)[0].payload);
    const after = Buffer.from(out[10][0].b).toString("utf8");
    // v7.8 期望: 整替 → after 字节级等 userSP (无道德经前置, 无官方工具块)
    const fails = [];
    if (after !== userSP) {
      fails.push(
        `after !== userSP (after=${after.length}B userSP=${userSP.length}B)`,
      );
    }
    return {
      in_bytes: frame.length,
      out_bytes: mod.length,
      orig_sp_chars: FAKE_SP.length,
      before: FAKE_SP,
      after,
      expect_dao: false, // 整替后无道德经
      expect_exact: userSP, // 字节级等
      _extra_fails: fails,
    };
  } finally {
    O.clearCustomSP();
  }
});

// ── F: v7.8 _customSP 整替 · keep_blocks=false 同 case E (一态恒整替) ──
runCase("custom_sp_replace_all", () => {
  const userSP =
    "你是用户自定义助手, 仅用此身. 不引道德经. 不留官方块. 用户全权.";
  O.setCustomSP(userSP, { keep_blocks: false, source: "L1_test" });
  try {
    const top = O.serializeProto({
      10: [{ w: 2, b: Buffer.from(FAKE_SP, "utf8") }],
    });
    const frame = O.buildFrame(0, top);
    const mod = O.modifySPProto(frame);
    const out = O.parseProto(O.parseFrames(mod)[0].payload);
    const after = Buffer.from(out[10][0].b).toString("utf8");
    // 验: after 即 userSP (字节级等)
    const fails = [];
    if (after !== userSP) {
      fails.push(
        `after !== userSP (after=${after.length}B userSP=${userSP.length}B)`,
      );
    }
    return {
      in_bytes: frame.length,
      out_bytes: mod.length,
      orig_sp_chars: FAKE_SP.length,
      before: FAKE_SP,
      after,
      expect_dao: false,
      // 不验 keep_tools / no_official (已彻替)
      expect_exact: userSP,
      _extra_fails: fails,
    };
  } finally {
    O.clearCustomSP();
  }
});

// ── G: v7.2 clearCustomSP 后回默认 · 道德经路径恢 ──
runCase("custom_sp_clear_then_default", () => {
  O.setCustomSP("临时自定义", { keep_blocks: true });
  O.clearCustomSP(); // 立清
  const top = O.serializeProto({
    10: [{ w: 2, b: Buffer.from(FAKE_SP, "utf8") }],
  });
  const frame = O.buildFrame(0, top);
  const mod = O.modifySPProto(frame);
  const out = O.parseProto(O.parseFrames(mod)[0].payload);
  const after = Buffer.from(out[10][0].b).toString("utf8");
  return {
    in_bytes: frame.length,
    out_bytes: mod.length,
    orig_sp_chars: FAKE_SP.length,
    before: FAKE_SP,
    after,
    expect_dao: true, // 清后回道德经
    expect_dao_first: true,
    expect_tao_header: true, // v7.5 默认路径验 TAO_HEADER 三项
    expect_keep_tools: true,
    expect_no_official_naming: true,
  };
});

// ── 结果 ──
const pass = cases.filter((c) => c.ok).length;
const total = cases.length;
const ok = pass === total;
console.log(`道德经字数: ${O.DAO_DE_JING_81.length}`);
console.log(`TAO_HEADER 字数: ${O.TAO_HEADER.length}`);
console.log(
  `TAO_HEADER 数: ${TAO_HEADER_MARKERS.length} · KEEP_MARKERS 数: ${KEEP_MARKERS.length} · LEAK_MARKERS 数: ${LEAK_MARKERS.length}`,
);
console.log(`通过率: ${pass}/${total}`);
console.log(`总体: ${ok ? "✓ 全绿" : "✗ 有失败"}`);
console.log("");
console.log("各 case:");
for (const c of cases) {
  const mark = c.ok ? "✓" : "✗";
  console.log(`  ${mark} ${c.name}`);
  console.log(
    `     in=${c.in_bytes}B  out=${c.out_bytes}B  changed=${c.changed}  orig=${c.orig_sp_chars}  after=${c.new_sp_chars}`,
  );
  if (c.failed_assertions && c.failed_assertions.length) {
    for (const a of c.failed_assertions) console.log(`     · 失: ${a}`);
  }
  if (c.err) console.log(`     · 异: ${c.err}`);
}

console.log("");
process.exit(ok ? 0 : 1);
