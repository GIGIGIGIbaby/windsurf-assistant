// v17.66 · 新 SP 识别回归测
// 针对 179 实采 summary-agent SP (479 字 · 不含强 marker) · 验证修复有效
"use strict";
process.argv.push("--test");
const path = require("node:path");
const src = path.resolve(__dirname, "..", "vendor", "wam", "bundled-origin", "源.js");
const mod = require(src);

let fail = 0;
const ok = (label, cond, detail) => {
  const s = cond ? "✓" : "✗";
  if (!cond) fail++;
  console.log(`  ${s} ${label.padEnd(50)} ${detail || ""}`);
};

console.log("═══ v17.66 · summary-agent SP 识别回归 ═══");

// 一、实采 summary-agent SP (179 · _lastinject.json 2026-04-23 · 479 字)
const realSummary =
  "You are an expert AI coding assistant with extreme attention to detail. " +
  "You are pair programming with a USER to solve a coding task.\n" +
  "You provide clear, detailed, and accurate summaries of conversations. When asked, you focus on outlining the USER's main goals\n" +
  "and listing key information and context discussed. Your response should be well-organized and reflect the essence of the dialog.\n" +
  "NEVER lie or make things up. Your summaries should always be grounded in the conversation.";
ok("summary SP 长度 ≥100", realSummary.length >= 100, `(${realSummary.length} 字)`);
ok("summary SP 识为官方", mod.isLikelyOfficialSP(realSummary) === true);
const inv = mod.invertSP(realSummary);
ok("summary SP 被 invert", inv !== null, inv ? `(${inv.length} 字)` : "");
ok("inverted 含道可道", inv && inv.includes("道可道") === true);
ok("inverted 以 TAO_HEADER 开首", inv && inv.startsWith("You are Cascade. 你的唯一本源"));

// 二、Cascade 主 agent SP (v17.65 已识 · 回归不失)
const cascadeMain =
  "You are Cascade, a powerful agentic AI coding assistant.\n" +
  "<user_rules>\n" +
  "user pref A\n" +
  "</user_rules>\n" +
  "x".repeat(300);
ok("Cascade 主 SP 仍识", mod.isLikelyOfficialSP(cascadeMain) === true);
ok("Cascade 主 SP 仍 invert", mod.invertSP(cascadeMain) !== null);

// 三、短 prompt (<100 字) 应过
const tinyPrompt = "hi there";
ok("极短 prompt 不误伤", mod.isLikelyOfficialSP(tinyPrompt) === false);

// 四、用户消息 (role=1 走不同路径 · 但此 heuristic 仅用于 role=0 · 此是双保)
// role=1 的 user msg 永不调 invertSP · 即使 isLikelyOfficialSP 命中也无害
const userPaste = "How do I parse protobuf in node?\n" + "x".repeat(200);
ok(
  "用户消息不以 You are 开首 · 不命中",
  mod.isLikelyOfficialSP(userPaste) === false,
);

// 五、devin-cloud agent SP 假设态 (Windsurf 族 agent 开首共性)
const devinCloudSP = "You are a powerful agentic AI coding agent running in the cloud.\n" + "x".repeat(300);
ok("devin-cloud agent SP 识", mod.isLikelyOfficialSP(devinCloudSP) === true);

// 六、plain_utf8 端到端: 构 proto → invertSP 后 contain 道德经
const fakeSP = realSummary + "\n" + "x".repeat(150); // 确保 > 200
const payload = mod.serializeProto({
  10: [{ w: 2, b: Buffer.from(fakeSP, "utf8") }],
});
const frame = mod.buildFrame(0, payload);
const out = mod.modifySPProto(frame);
const outFields = mod.parseProto(mod.parseFrames(out)[0].payload);
const after = Buffer.from(outFields[10][0].b).toString("utf8");
ok("plain_utf8 SP 整段 invert", after.includes("道可道") === true);
ok("plain_utf8 SP 原文尽除", after.includes("expert AI coding") === false);

console.log("");
console.log(fail === 0 ? "═══ PASS · 全通 ═══" : `═══ FAIL · ${fail} 处 ═══`);
process.exit(fail === 0 ? 0 : 1);
