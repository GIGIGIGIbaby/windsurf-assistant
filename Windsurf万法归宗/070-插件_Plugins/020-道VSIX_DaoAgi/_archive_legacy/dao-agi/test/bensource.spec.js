// bensource.spec.js — v18.2 · 本源直采 · 单元 + 活验
// 致虚极, 守静笃. 万物并作, 吾以观复.
//
// 验三事:
//   一、模块结构 (exports / 默认值 / 安全降级)
//   二、过滤逻辑纯函数 (_isMainSP / pickBestSP / trimSP) 必非崩
//   三、活验 (LS 进程在时 · 真扫一次)
"use strict";

const path = require("node:path");
const fs = require("node:fs");

const D = path.join(__dirname, "..");
const ben = require(path.join(D, "bensource.js"));

let pass = 0, fail = 0;
function ok(name, cond, hint) {
  if (cond) { pass++; console.log("[PASS] " + name); }
  else { fail++; console.log("[FAIL] " + name + (hint ? " · " + hint : "")); }
}
function eq(a, b) { return a === b; }

console.log("═══════ bensource.js · 本源直采 · v18.2 ═══════");

// 一、Module exports
const expected = [
  "extract",
  "clearCache",
  "_discoverLsPid",
  "_discoverLsPorts",
  "_readCascadeAuth",
  "_readLsCsrf",
  "scanProcessMemory",
  "pickBestSP",
  "trimSP",
  "_isMainSP",
  "_countMemories",
  "_walkForSP",
];
ok("S1 · exports completeness", expected.every((k) => k in ben),
   "missing: " + expected.filter((k) => !(k in ben)).join(","));

ok("S2 · extract is async function", typeof ben.extract === "function");
ok("S3 · clearCache is function", typeof ben.clearCache === "function");

// 二、纯函数验
// _isMainSP
ok("F1 · _isMainSP rejects empty", !ben._isMainSP(""));
ok("F2 · _isMainSP rejects null", !ben._isMainSP(null));
ok("F3 · _isMainSP rejects too-short", !ben._isMainSP("a".repeat(100)));
ok("F4 · _isMainSP rejects no-cascade", !ben._isMainSP("Hello world".repeat(2000)));

// 真 SP 头之样 (10KB+ · 真换行 · 真起句)
const realSPSample =
  "You are Cascade, a powerful agentic AI coding assistant.\n" +
  "The USER is interacting with you through a chat panel in their IDE and will send you requests to solve a coding task.\n" +
  Array(800).fill("Some real content with normal sentence structure here.\n").join("");
ok("F5 · _isMainSP accepts real SP shape", ben._isMainSP(realSPSample),
   "len=" + realSPSample.length);

// 假 SP (源码引用 · 字面 \\n)
const fakeSPSrc =
  "You are Cascade, a powerful agentic AI coding assistant.\\n" +
  "The USER is interacting with you\\n" +
  Array(500).fill("// some comment\\n").join("");
ok("F6 · _isMainSP rejects source-ref (literal \\n)", !ben._isMainSP(fakeSPSrc));

// 子 Agent SP (senior pair programmer · codebase intelligence)
const subAgentSP =
  "You are Cascade, a powerful agentic AI coding assistant acting as a senior pair programmer.\n" +
  "The USER is interacting with you\n" +
  Array(500).fill("Other content.\n").join("");
ok("F7 · _isMainSP rejects sub-agent (senior pair)", !ben._isMainSP(subAgentSP));

// pickBestSP
ok("P1 · pickBestSP empty array → null", ben.pickBestSP([]) === null);
ok("P2 · pickBestSP null → null", ben.pickBestSP(null) === null);
const hits = [
  { addr: "1", len: 100, snippet: "fake short" },
  { addr: "2", len: realSPSample.length, snippet: realSPSample },
];
const best = ben.pickBestSP(hits);
ok("P3 · pickBestSP picks valid SP", best && best.snippet === realSPSample);

// trimSP
ok("T1 · trimSP empty → empty", ben.trimSP("") === "");
ok("T2 · trimSP null → empty", ben.trimSP(null) === "");
const trimmed = ben.trimSP(realSPSample);
ok("T3 · trimSP preserves real SP", trimmed === realSPSample,
   "in=" + realSPSample.length + " out=" + trimmed.length);

// 三、活验 (有 LS 进程则验真扫)
console.log("\n═══════ 活验 (本机 LS 在则真扫) ═══════");
const lsPid = ben._discoverLsPid();
console.log("LS PID: " + (lsPid || "(none · skip live)"));

if (lsPid) {
  ok("L1 · _discoverLsPid 返数字", typeof lsPid === "number" && lsPid > 0);

  const ports = ben._discoverLsPorts();
  ok("L2 · _discoverLsPorts 返数组", Array.isArray(ports));
  console.log("    LS Ports: [" + ports.join(",") + "]");

  const auth = ben._readCascadeAuth();
  ok("L3 · _readCascadeAuth 返对象", auth && typeof auth === "object");
  console.log("    auth.email: " + (auth.email || "(none)"));

  const csrf = ben._readLsCsrf(lsPid);
  ok("L4 · _readLsCsrf 取 CSRF", typeof csrf === "string");
  console.log("    csrf head: " + (csrf ? csrf.slice(0, 12) + "..." : "(none)"));

  // 真扫 (耗时 ~10s · 验非崩 + 出 SP)
  const t0 = Date.now();
  ben.clearCache();
  return ben.extract({ force: true }).then((r) => {
    const elapsed = Date.now() - t0;
    console.log("    extract totalMs=" + (r.totalMs || elapsed) + " source=" + r.source + " chars=" + r.chars);
    ok("L5 · extract 不崩 (返对象)", r && typeof r === "object");
    ok("L6 · extract 给 attempts", Array.isArray(r.attempts) && r.attempts.length >= 1);
    if (r.systemPrompt) {
      ok("L7 · extract 出 SP (chars > 2000)", r.chars >= 2000);
      // 真 SP 应有 真换行
      const lf = (r.systemPrompt.match(/\n/g) || []).length;
      ok("L8 · SP 含真换行 ≥ 5", lf >= 5, "lf=" + lf);
      // 头部 SP 起句
      const head = r.systemPrompt.slice(0, 500);
      ok("L9 · 头含 'You are Cascade, a powerful'", head.includes("You are Cascade, a powerful"));
      ok("L10 · 头含 'The USER is interacting'", head.includes("The USER is interacting"));
    } else {
      console.log("    NOTE: extract 无 SP · LS 进程或未载主 SP · 非崩即过");
    }

    console.log("\n═══════ 总: PASS=" + pass + " FAIL=" + fail + " ═══════");
    process.exit(fail ? 1 : 0);
  }).catch((e) => {
    console.error("extract throw: " + e.message);
    process.exit(2);
  });
} else {
  console.log("    本机无 LS · skip 真验 (合 · 模块不依 LS 即过)");
  console.log("\n═══════ 总: PASS=" + pass + " FAIL=" + fail + " ═══════");
  process.exit(fail ? 1 : 0);
}
