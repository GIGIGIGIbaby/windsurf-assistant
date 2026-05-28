// v17.76 · 回归本源 · 去芜存菁 · 单元回归测
// 太上不知有之 · 为学日益 为道日损 · 只需实时获取最终实时完整提示词便可
//
// 测点 (仅):
//   · _sseClients / _sseBroadcast 纯函数 (死连自清)
//   · classifyAgentSP 分类 (main/aux)
//   · _recordInject 内嵌 SSE 广播 (捕即发)
//   · observeSPFromBody 唯一观照路径 (旧接口不坏)
//   · 无 observeTurn / _recordTurn / _turnHistory / _makeMsgRecord / _roleLabel (皆已移)
"use strict";
process.argv.push("--test");
const path = require("node:path");
const srcPath = path.resolve(
  __dirname,
  "..",
  "vendor",
  "wam",
  "bundled-origin",
  "源.js",
);
const mod = require(srcPath);

let pass = 0,
  fail = 0;
const ok = (label, cond, detail) => {
  const s = cond ? "\u2713" : "\u2717";
  if (cond) pass++;
  else fail++;
  console.log(`  ${s} ${label.padEnd(60)} ${detail || ""}`);
};

console.log(
  "\u2550\u2550\u2550 v17.76 \u00b7 \u56de\u5f52\u672c\u6e90 \u00b7 \u53bb\u82dc\u5b58\u83c1 \u00b7 \u56de\u5f52\u6d4b \u2550\u2550\u2550",
);

// ───────────── 一、本源留 · 导出验 ─────────────
console.log("\n\u4e00 \u00b7 \u672c\u6e90\u7559 (\u5bfc\u51fa)");
ok("observeSPFromBody exported", typeof mod.observeSPFromBody === "function");
ok("classifyAgentSP exported", typeof mod.classifyAgentSP === "function");
ok("_sseBroadcast exported", typeof mod._sseBroadcast === "function");
ok("_sseClients exported", mod._sseClients instanceof Set);
ok("invertSP exported", typeof mod.invertSP === "function");
ok("modifySPProto exported", typeof mod.modifySPProto === "function");
ok("modifyRawSP exported", typeof mod.modifyRawSP === "function");

// ───────────── 二、太上不知有之 · turn 基建内藏 · 不暴露 ─────────────
// 道法自然: observeTurn/_turnHistory 等内部留存 · 但不导出 · 太上不知有之
// 主 handler 仅用 observeSPFromBody · 只需实时获取最终实时完整提示词便可
console.log(
  "\n\u4e8c \u00b7 \u592a\u4e0a\u4e0d\u77e5\u6709\u4e4b (turn \u5185\u85cf)",
);
ok("observeTurn 不暴露", typeof mod.observeTurn === "undefined");
ok("_recordTurn 不暴露", typeof mod._recordTurn === "undefined");
ok("_summarizeTurn 不暴露", typeof mod._summarizeTurn === "undefined");
ok("_makeMsgRecord 不暴露", typeof mod._makeMsgRecord === "undefined");
ok("_roleLabel 不暴露", typeof mod._roleLabel === "undefined");
ok("ROLE_LABELS 不暴露", typeof mod.ROLE_LABELS === "undefined");
ok("TURN_HISTORY_MAX 不暴露", typeof mod.TURN_HISTORY_MAX === "undefined");
ok("_turnHistory 不暴露", typeof mod._turnHistory === "undefined");

// ───────────── 三、classifyAgentSP 主辅分槽 (前作保留) ─────────────
console.log("\n\u4e09 \u00b7 classifyAgentSP");
// 主 Cascade SP: 长 + 含 ≥2 强 marker
const mainSP =
  "You are Cascade, a powerful agentic AI coding assistant.\n" +
  "<user_rules>user rules here</user_rules>\n" +
  "<MEMORY[global]>memory content</MEMORY[global]>\n" +
  "<workspace_information>ws info</workspace_information>\n" +
  "x".repeat(2200);
ok("mainSP → main", mod.classifyAgentSP(mainSP) === "main");
// summary-agent 短 SP: 无强 marker · 短
const summarySP =
  "You are an expert AI coding assistant. Provide summaries." + "x".repeat(400);
ok("summarySP → aux (长<2000)", mod.classifyAgentSP(summarySP) === "aux");
// 空 → unknown
ok("empty → unknown", mod.classifyAgentSP("") === "unknown");
ok("null → unknown", mod.classifyAgentSP(null) === "unknown");

// ───────────── 四、_sseBroadcast 无客户端静 + 死连自清 ─────────────
console.log("\n\u56db \u00b7 _sseBroadcast \u884c\u4e3a");
// 无客户端
const sz0 = mod._sseClients.size;
mod._sseBroadcast("sp", { test: true });
ok(
  "no crash on empty clients",
  mod._sseClients.size === sz0,
  "size=" + mod._sseClients.size,
);
// 死连 · 加好客户端 + 死客户端 · 广播后死客户端移
const goodClient = {
  writes: [],
  write(s) {
    this.writes.push(s);
  },
};
const deadClient = {
  write() {
    throw new Error("EPIPE");
  },
};
mod._sseClients.add(goodClient);
mod._sseClients.add(deadClient);
mod._sseBroadcast("sp", { hello: "world" });
ok("good client received", goodClient.writes.length === 1);
ok("good write event: sp", goodClient.writes[0].startsWith("event: sp"));
ok("good write contains data:", goodClient.writes[0].indexOf("data: ") > 0);
ok("dead client removed", !mod._sseClients.has(deadClient));
ok("good client kept", mod._sseClients.has(goodClient));
// 清场
mod._sseClients.delete(goodClient);

// ───────────── 五、observeSPFromBody 唯一观照 ─────────────
console.log("\n\u4e94 \u00b7 observeSPFromBody (\u552f\u4e00\u89c2\u7167)");
const fakeSP =
  "You are Cascade, a powerful agentic AI coding assistant.\n" +
  "<user_rules>rule A</user_rules>\n" +
  "x".repeat(300);
// CHAT_PROTO · nested ChatMessage 路径
const nested = mod.serializeProto({
  1: [{ w: 0, v: 0 }],
  2: [{ w: 2, b: Buffer.from(fakeSP, "utf8") }],
});
const top = mod.serializeProto({ 2: [{ w: 2, b: nested }] });
const frame = mod.buildFrame(0, top);
const obs = mod.observeSPFromBody(frame, "CHAT_PROTO");
ok("obs non-null", !!obs);
ok("obs.role=0", obs && obs.role === 0);
ok("obs.before starts with You are", obs && obs.before.startsWith("You are"));
ok(
  "obs.variant = nested_chat_message",
  obs && obs.variant === "nested_chat_message",
);
// CHAT_RAW · field 3
const rawTop = mod.serializeProto({
  3: [{ w: 2, b: Buffer.from(fakeSP, "utf8") }],
});
const rawObs = mod.observeSPFromBody(mod.buildFrame(0, rawTop), "CHAT_RAW");
ok("raw obs non-null", !!rawObs);
ok("raw obs.variant = raw_sp", rawObs && rawObs.variant === "raw_sp");

// ───────────── 六、invertSP 道化不坏 ─────────────
console.log(
  "\n\u516d \u00b7 invertSP \u9053\u5316\u4e0d\u574f (\u5e96\u4e01\u89e3\u725b)",
);
const inv = mod.invertSP(fakeSP);
ok("invertSP non-null", inv !== null);
ok("invert contains 道可道", inv && inv.indexOf("\u9053\u53ef\u9053") >= 0);
ok("invert strips <user_rules>", inv && inv.indexOf("<user_rules>") < 0);
ok(
  "invert keeps TAO_HEADER",
  inv &&
    inv.startsWith("You are Cascade. \u4f60\u7684\u552f\u4e00\u672c\u6e90"),
);

// ═════════════════ 总 ═════════════════
console.log(
  "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
);
console.log("  PASS=" + pass + "  FAIL=" + fail + "  TOTAL=" + (pass + fail));
console.log(
  fail === 0
    ? "  \u2713 \u5168\u901a \u00b7 \u56de\u5f52\u672c\u6e90 \u00b7 \u9053\u6cd5\u81ea\u7136"
    : "  \u2717 " + fail + " \u5904 FAIL",
);
console.log(
  "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
);
process.exit(fail === 0 ? 0 : 1);
