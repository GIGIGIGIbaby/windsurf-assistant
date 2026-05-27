// v17.78.0 · 去芜存菁 · 验证测试一切 · 道法自然
//
// 覆盖:
//   一 · v18.5 自定义 SP 注入 (invertSP + deepStrip + hasSideChannels + 持久化 roundtrip)
//   二 · ls-client trajectory 归一 (_normalizeTrajectoryList / _pickTrajTs / _pickTrajTitle / _pickTrajId)
//   三 · HTTP 控制面 /origin/custom_sp GET/POST/DELETE 生命周期 (起本地 proxy 子进程 · 活链路)
//
// 执 · 纯 Node · 无 vscode 依赖 · 无活 LS 依赖 (HTTP 测试起独立 proxy 在 9xxx 随机口)

"use strict";
process.argv.push("--test"); // 供源.js 识别"测试模式" (不自启 listen)

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const { spawn, execSync } = require("node:child_process");
const { URL } = require("node:url");
const crypto = require("node:crypto");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "..");
const SRC_PATH = path.join(ROOT, "vendor", "wam", "bundled-origin", "源.js");
const LS = require(path.join(ROOT, "ls-client.js"));

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  const s = cond ? "\u2713" : "\u2717";
  if (cond) pass++; else fail++;
  console.log("  " + s + " " + String(label).padEnd(62) + (detail ? " " + detail : ""));
};
const section = (t) => console.log("\n\u2500\u2500\u2500 " + t + " \u2500\u2500\u2500");

console.log("\u2550\u2550\u2550 v17.78.0 \u00b7 \u53bb\u829c\u5b58\u83c1 \u00b7 \u9a8c\u8bc1\u4e00\u5207 \u2550\u2550\u2550");
console.log("  \u65f6\u95f4: " + new Date().toISOString());
console.log("  \u6e90: " + SRC_PATH);

// ═══════════════════════════════════════════════════════
// 加载 源.js — require 时 process.argv.includes('--test') 令其不 listen
// ═══════════════════════════════════════════════════════
const src = require(SRC_PATH);

// ═══════════════════════════════════════════════════════
// 一 · v18.5 自定义 SP 注入
// ═══════════════════════════════════════════════════════
section("\u4e00 \u00b7 v18.5 \u81ea\u5b9a\u4e49SP \u6ce8\u5165");

// (1) 导出验
ok("_saveCustomSP exported", typeof src._saveCustomSP === "function");
ok("_loadCustomSP exported", typeof src._loadCustomSP === "function");
ok("_clearCustomSP exported", typeof src._clearCustomSP === "function");

// (2) 无自定义 SP · 走道德经默认
// 构造一个"官方 SP"样本 (含强 marker · 过长度门槛)
const FAKE_OFFICIAL_SP =
  "You are Cascade, a powerful agentic AI coding assistant.\n" +
  "<user_rules>be good</user_rules>\n" +
  "<MEMORY[a]>mem a</MEMORY[a]>\n" +
  "<workspace_information>ws</workspace_information>\n" +
  "<memory_system>ms</memory_system>\n" +
  "<tool_calling>tc</tool_calling>\n" +
  "<running_commands>rc</running_commands>\n" +
  "<mcp_servers>ms</mcp_servers>\n" +
  "<calling_external_apis>ce</calling_external_apis>\n" +
  "<citation_guidelines>cg</citation_guidelines>\n" +
  "<user_information>ui</user_information>\n" +
  "<additional_metadata>am</additional_metadata>\n" +
  "x".repeat(2500);

// 清已有自定义 (若测试残留)
src._clearCustomSP();

const inverted = src.invertSP(FAKE_OFFICIAL_SP);
ok("invertSP 无自定义 · 非 null", inverted != null);
ok(
  "invertSP 无自定义 · 含道德经",
  typeof inverted === "string" && inverted.indexOf("\u9053\u53ef\u9053") >= 0,
);
ok(
  "invertSP 无自定义 · 保 tool_calling 骨",
  typeof inverted === "string" && inverted.indexOf("<tool_calling>") >= 0,
);
ok(
  "invertSP 无自定义 · 剥 user_rules",
  typeof inverted === "string" && inverted.indexOf("<user_rules>") < 0,
);

// (3) 设自定义 SP (保留必要模块)
const CUSTOM_SP = "You are a helpful test assistant for v17.78 regression.";
const savedKeep = src._saveCustomSP(CUSTOM_SP, { source: "test", keep_blocks: true });
ok("_saveCustomSP 返 ok", savedKeep && savedKeep.sp === CUSTOM_SP);
ok("_saveCustomSP chars", savedKeep && savedKeep.sp.length === CUSTOM_SP.length);

// 重载 · 确认持久化
const reloaded = src._loadCustomSP();
ok("_loadCustomSP 读回", reloaded && reloaded.sp === CUSTOM_SP);
ok("_loadCustomSP keep_blocks=true", reloaded && reloaded.keep_blocks === true);

// (4) 有自定义 SP · invertSP 应用自定义 + 留骨
const inverted2 = src.invertSP(FAKE_OFFICIAL_SP);
ok("invertSP 有自定义 · 非 null", inverted2 != null);
ok(
  "invertSP 有自定义 · 含 [CUSTOM-SP-ACTIVE] 哨兵",
  typeof inverted2 === "string" && inverted2.indexOf("[CUSTOM-SP-ACTIVE]") >= 0,
);
ok(
  "invertSP 有自定义 · 含自定义内容",
  typeof inverted2 === "string" && inverted2.indexOf(CUSTOM_SP) >= 0,
);
ok(
  "invertSP 有自定义 · 保 tool_calling 骨",
  typeof inverted2 === "string" && inverted2.indexOf("<tool_calling>") >= 0,
);
ok(
  "invertSP 有自定义 · 不混道德经",
  typeof inverted2 === "string" && inverted2.indexOf("\u9053\u53ef\u9053") < 0,
);

// (5) hasSideChannels / deepStripSideChannels 哨兵守护
// 注: hasSideChannels 未导出 · 只测 deepStripSideChannels 对哨兵的识别
if (typeof src.deepStripSideChannels === "function") {
  const withSentinel = "[CUSTOM-SP-ACTIVE]\n<user_rules>r</user_rules>";
  const stripped = src.deepStripSideChannels(withSentinel);
  ok(
    "deepStripSideChannels 识哨兵 · 不剥留骨",
    stripped === withSentinel,
    "(in=" + withSentinel.length + " out=" + (stripped || "").length + ")",
  );
}

// (6) 重入幂等 · 已处理的 SP 再 invert 应返 null
const inverted3 = src.invertSP(inverted2);
ok("invertSP 重入幂等 · 返 null", inverted3 === null);

// (7) 设自定义 keep_blocks=false · 纯替换
const savedPure = src._saveCustomSP("PURE", { source: "test", keep_blocks: false });
ok("_saveCustomSP keep_blocks=false", savedPure && savedPure.keep_blocks === false);
const reloadedPure = src._loadCustomSP();
ok(
  "_loadCustomSP keep_blocks=false 读回",
  reloadedPure && reloadedPure.keep_blocks === false,
);

// (8) 清除 · 归道
src._clearCustomSP();
const reloadedNull = src._loadCustomSP();
ok("_clearCustomSP 后读回 null", reloadedNull === null);

// ═══════════════════════════════════════════════════════
// 二 · trajectory 归一
// ═══════════════════════════════════════════════════════
section("\u4e8c \u00b7 trajectory \u7eaf\u51fd\u6570\u5f52\u4e00");

ok("_normalizeTrajectoryList exported", typeof LS._normalizeTrajectoryList === "function");
ok("_pickTrajTs exported", typeof LS._pickTrajTs === "function");
ok("_pickTrajTitle exported", typeof LS._pickTrajTitle === "function");
ok("_pickTrajId exported", typeof LS._pickTrajId === "function");

// (1) 字典 → 数组
const dictRes = { trajectorySummaries: {
  "id-1": { trajectoryId: "id-1", summary: "First", lastModifiedTime: "2026-04-25T00:00:00Z" },
  "id-2": { trajectoryId: "id-2", summary: "Second", lastModifiedTime: "2026-04-26T00:00:00Z" },
} };
const dList = LS._normalizeTrajectoryList(dictRes);
ok("字典 · 归数组", Array.isArray(dList) && dList.length === 2);
ok("字典 · 保留两条", dList[0].trajectoryId && dList[1].trajectoryId);

// (2) 数组 · 原样返
const arrRes = { trajectories: [{ trajectoryId: "id-a" }, { trajectoryId: "id-b" }] };
const aList = LS._normalizeTrajectoryList(arrRes);
ok("数组 · 原样", Array.isArray(aList) && aList.length === 2 && aList[0].trajectoryId === "id-a");

// (3) 兼容其他键位
ok(
  "trajectory_summaries (snake_case)",
  LS._normalizeTrajectoryList({ trajectory_summaries: { x: { trajectoryId: "x" } } }).length === 1,
);
ok(
  "cascadeTrajectories 兼容",
  LS._normalizeTrajectoryList({ cascadeTrajectories: [{ trajectoryId: "c1" }] }).length === 1,
);

// (4) null / 空 / 非对象
ok("null 输入", LS._normalizeTrajectoryList(null) === null);
ok("非对象", LS._normalizeTrajectoryList("string") === null);
ok("无已知键", LS._normalizeTrajectoryList({ foo: "bar" }) === null);

// (5) _pickTrajTs · ISO 8601
const isoMs = LS._pickTrajTs({ lastModifiedTime: "2026-04-25T12:00:00Z" });
ok("pickTs ISO 8601 → ms", isoMs > 0 && isoMs === Date.parse("2026-04-25T12:00:00Z"));

// (6) _pickTrajTs · createdTime 回退
const isoMs2 = LS._pickTrajTs({ createdTime: "2026-04-20T00:00:00Z" });
ok("pickTs createdTime 回退", isoMs2 === Date.parse("2026-04-20T00:00:00Z"));

// (7) _pickTrajTs · lastModifiedTime 优先于 createdTime
const pri = LS._pickTrajTs({
  lastModifiedTime: "2026-04-25T00:00:00Z",
  createdTime: "2026-04-01T00:00:00Z",
});
ok("pickTs lastModifiedTime 优先", pri === Date.parse("2026-04-25T00:00:00Z"));

// (8) _pickTrajTs · number ms
ok("pickTs number ms", LS._pickTrajTs({ lastUpdatedTime: 1700000000000 }) === 1700000000000);

// (9) _pickTrajTs · protobuf Timestamp {seconds, nanos}
const pbMs = LS._pickTrajTs({ createdTime: { seconds: 1700000000, nanos: 500000000 } });
ok("pickTs protobuf Timestamp", pbMs === 1700000000000 + 500);

// (10) _pickTrajTs · 无时间戳 → 0
ok("pickTs 空对象 → 0", LS._pickTrajTs({}) === 0);
ok("pickTs null → 0", LS._pickTrajTs(null) === 0);

// (11) _pickTrajTitle · summary 优先
ok(
  "pickTitle summary 优先",
  LS._pickTrajTitle({ summary: "S", title: "T" }) === "S",
);
ok(
  "pickTitle title 回退",
  LS._pickTrajTitle({ title: "T", name: "N" }) === "T",
);
ok(
  "pickTitle name 回退",
  LS._pickTrajTitle({ name: "N" }) === "N",
);
ok("pickTitle 空 → ''", LS._pickTrajTitle({}) === "");
ok("pickTitle null → ''", LS._pickTrajTitle(null) === "");

// (12) _pickTrajId · 多键位
ok("pickId trajectoryId", LS._pickTrajId({ trajectoryId: "a" }) === "a");
ok("pickId trajectory_id 回退", LS._pickTrajId({ trajectory_id: "b" }) === "b");
ok("pickId id 回退", LS._pickTrajId({ id: "c" }) === "c");
ok("pickId cascadeId 回退", LS._pickTrajId({ cascadeId: "d" }) === "d");
ok("pickId 空 → ''", LS._pickTrajId({}) === "");

// (13) 排序正确性 (集成场景)
const mixed = LS._normalizeTrajectoryList({
  trajectorySummaries: {
    old: { trajectoryId: "old", lastModifiedTime: "2020-01-01T00:00:00Z" },
    mid: { trajectoryId: "mid", lastModifiedTime: "2023-06-15T00:00:00Z" },
    new: { trajectoryId: "new", lastModifiedTime: "2026-04-25T00:00:00Z" },
  },
});
const sorted = mixed.slice().sort((a, b) => LS._pickTrajTs(b) - LS._pickTrajTs(a));
ok("排序 · 最新第一", sorted[0].trajectoryId === "new");
ok("排序 · 最旧最后", sorted[sorted.length - 1].trajectoryId === "old");

// ═══════════════════════════════════════════════════════
// 三 · HTTP 控制面 /origin/custom_sp 生命周期 (活进程)
// ═══════════════════════════════════════════════════════
section("\u4e09 \u00b7 HTTP \u63a7\u5236\u9762 /origin/custom_sp \u751f\u547d\u5468\u671f");

async function httpReq(port, method, path_, body, ms) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: "127.0.0.1", port, path: path_, method,
      timeout: ms || 3000,
      headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {},
    };
    const req = http.request(opts, (res) => {
      let b = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (b += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, data: b, raw: b }); }
      });
    });
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.on("timeout", () => { try { req.destroy(); } catch {} resolve({ status: 0, error: "timeout" }); });
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  // 随机端口 · 避免与已运行 proxy 冲突
  const TEST_PORT = 9000 + Math.floor(Math.random() * 900);

  // spawn 独立 proxy 进程 · cwd 在临时目录 (避免污染真 bundled-origin)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dao-agi-test-proxy-"));
  // 必要文件: 源.js + _dao_81.txt
  fs.copyFileSync(SRC_PATH, path.join(tmpDir, "源.js"));
  fs.copyFileSync(
    path.join(ROOT, "vendor", "wam", "bundled-origin", "_dao_81.txt"),
    path.join(tmpDir, "_dao_81.txt"),
  );

  const proc = spawn(process.execPath, [path.join(tmpDir, "源.js")], {
    cwd: tmpDir,
    // 源.js 读 ORIGIN_PORT (非 DAO_PORT · dao.origin.port 在 extension.js 层映射)
    env: { ...process.env, ORIGIN_PORT: String(TEST_PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let out = ""; let err = "";
  proc.stdout.on("data", (d) => { out += d.toString(); });
  proc.stderr.on("data", (d) => { err += d.toString(); });

  // 等待 ready (最长 6s)
  const ready = await (async () => {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const r = await httpReq(TEST_PORT, "GET", "/origin/ping", null, 1000);
      if (r.status === 200 && r.data && r.data.ok) return true;
    }
    return false;
  })();

  ok("proxy 独立启 · ready", ready, "(port=" + TEST_PORT + ")");
  if (!ready) {
    console.log("    stdout:", out.slice(0, 400));
    console.log("    stderr:", err.slice(0, 400));
  }

  if (ready) {
    // GET · 无自定义
    const g0 = await httpReq(TEST_PORT, "GET", "/origin/custom_sp");
    ok("GET /origin/custom_sp 初态", g0.status === 200 && g0.data && g0.data.has_custom === false);

    // POST · 设自定义
    const testSp = "You are a specialized test assistant. " + crypto.randomBytes(4).toString("hex");
    const p1 = await httpReq(TEST_PORT, "POST", "/origin/custom_sp", {
      sp: testSp, source: "test", keep_blocks: true,
    });
    ok("POST /origin/custom_sp · ok=true", p1.status === 200 && p1.data && p1.data.ok === true);
    ok("POST · chars 一致", p1.data && p1.data.chars === testSp.length);

    // GET · 读回
    const g1 = await httpReq(TEST_PORT, "GET", "/origin/custom_sp");
    ok("GET · has_custom=true", g1.status === 200 && g1.data && g1.data.has_custom === true);
    ok("GET · sp 一致", g1.data && g1.data.sp === testSp);
    ok("GET · source=test", g1.data && g1.data.source === "test");

    // ping · custom_sp 态透出
    const pingAfter = await httpReq(TEST_PORT, "GET", "/origin/ping");
    ok("ping · custom_sp=true", pingAfter.data && pingAfter.data.custom_sp === true);
    ok("ping · custom_sp_chars", pingAfter.data && pingAfter.data.custom_sp_chars === testSp.length);

    // POST · sp 为空串 · 应拒
    const pBad = await httpReq(TEST_PORT, "POST", "/origin/custom_sp", { sp: "" });
    ok("POST 空 sp 拒", pBad.status !== 200 || (pBad.data && pBad.data.ok === false));

    // DELETE · 归道
    const del = await httpReq(TEST_PORT, "DELETE", "/origin/custom_sp");
    ok("DELETE /origin/custom_sp · ok", del.status === 200 && del.data && del.data.ok === true);

    // GET · 空态
    const g2 = await httpReq(TEST_PORT, "GET", "/origin/custom_sp");
    ok("DELETE 后 has_custom=false", g2.status === 200 && g2.data && g2.data.has_custom === false);

    // ping · custom_sp=false
    const pingAfter2 = await httpReq(TEST_PORT, "GET", "/origin/ping");
    ok("ping · custom_sp=false", pingAfter2.data && pingAfter2.data.custom_sp === false);
  }

  // 清理
  try { proc.kill("SIGTERM"); } catch {}
  await new Promise((r) => setTimeout(r, 300));
  try { proc.kill("SIGKILL"); } catch {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  // ═══════════════════════════════════════════════════════
  // 总结
  // ═══════════════════════════════════════════════════════
  console.log("\n" + "\u2550".repeat(60));
  console.log("  PASS=" + pass + "  FAIL=" + fail + "  TOTAL=" + (pass + fail));
  console.log("  " + (fail === 0 ? "\u2713 \u5168\u901a \u00b7 \u9053\u6cd5\u81ea\u7136" : "\u2717 \u5931\u8d25"));
  console.log("\u2550".repeat(60));
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
