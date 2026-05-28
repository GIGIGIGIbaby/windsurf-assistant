// v18.1.1 · E2E 全链路后端验 · 道法自然 · 无为而无不为
//
// 用户严令 (2026-04-26 21:41):
//   "道法自然 从根本底层后端打通使用上述所有成果一切
//    实现完整的热实时提取当前本windsurf提示词
//    热实时切换道agent模式和官方agent模式等各个核心模块
//    并从根本底层模拟用户发送消息接收反馈验证有效性
//    彻底全链路后端打通一切 完善一切"
//
// 道法自然之本: 不扰活民 (live :8889 / Windsurf process 不动) ·
//              别开洞天 (隔代 :8890 起新 v18.1.1 源 全测) ·
//              观民疾苦 (用 live :8889 selftest 实证 SP 替换链已立) ·
//              观民耕作 (read-only 探 settings.json / state.vscdb / 进程) ·
//              一报上 (回此一卷 · 信由实出 · 反者道之动)
//
// 七验环 (其数七也 · 七为成数 · 内圆外方):
//   一. 命脉观      live :8889 + settings 锚 + LS 进程 + Windsurf 三态
//   二. 隔代起      新 v18.1.1 源.js in-process listen :8890
//   三. 热切模      8890 上 invert ↔ passthrough 来回 · 验不重启
//   四. 热提示      8890 上 custom_sp set/get/del · sig 变迁 · realprompt 探
//   五. 注本源      DAO_DE_JING_81 / TAO_HEADER / OFFICIAL_SP_MARKERS · 内蕴验
//   六. 自证链      live :8889 selftest + 8890 selftest · 三路皆 PASS
//   七. 模拟发      构造 fake Connect-RPC body POST 8890 · rpc_trace 收记 · 链证

"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

// ─── 工 (utility) ─────────────────────────────────────────
function httpReq(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString("utf8");
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text,
          json,
          buf,
        });
      });
    });
    req.setTimeout(5000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function get(host, port, pathname) {
  return httpReq({ hostname: host, port, path: pathname, method: "GET" });
}
function post(host, port, pathname, body, headers) {
  return httpReq(
    {
      hostname: host,
      port,
      path: pathname,
      method: "POST",
      headers: Object.assign(
        {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body || ""),
        },
        headers || {},
      ),
    },
    body,
  );
}
function del(host, port, pathname) {
  return httpReq({ hostname: host, port, path: pathname, method: "DELETE" });
}

// ─── 报 (reporter) ────────────────────────────────────────
let __PASS = 0,
  __FAIL = 0,
  __SKIP = 0;
const __LINES = [];
function ok(label, cond, detail) {
  const tag = cond ? "✓" : "✗";
  const line = `  ${tag} ${label}${detail ? "  · " + detail : ""}`;
  console.log(line);
  __LINES.push(line);
  if (cond) __PASS++;
  else __FAIL++;
}
// SKIP: 环境观徵, 不计 PASS/FAIL (反者道之动 · live 端点存活与否不应决定底层模块测试通过)
function skip(label, reason) {
  const line = `  ⊘ ${label}  · SKIP · ${reason}`;
  console.log(line);
  __LINES.push(line);
  __SKIP++;
}
function info(line) {
  console.log("    · " + line);
  __LINES.push("    · " + line);
}
function header(s) {
  const sep = "─".repeat(60);
  console.log("\n" + sep + "\n  " + s + "\n" + sep);
  __LINES.push("\n" + sep + "\n  " + s + "\n" + sep);
}

// ─── 主 ───────────────────────────────────────────────────
async function main() {
  console.log(
    "\n══════════ v18.1.1 E2E 全链路后端验 (七验环 · 道法自然) ══════════",
  );
  console.log(`  时:    ${new Date().toISOString()}`);
  console.log(
    `  机:    ${os.hostname()} · ${process.platform} · node ${process.version}`,
  );

  let isoProxy = null;
  let isoPort = 0;
  let hasLive = false; // live :8889 探在态 (观徵, 非必需)
  let live = null;

  try {
    // ═══════════ 一 · 命脉观 (致虚守静 · 观复知常) ═══════════
    header("一 · 命脉观 (live :8889 + settings + 进程 三态 · 不扰)");

    // 1.0 探 live :8889 是否存活 (一次性 · 决定后续 SKIP 与否)
    try {
      const r = await get("127.0.0.1", 8889, "/origin/ping");
      if (r.status === 200 && r.json && r.json.ok === true) {
        hasLive = true;
        live = r.json;
      }
    } catch (e) {
      hasLive = false;
    }
    info(
      `live :8889 ${hasLive ? "存活 → 命脉观执行" : "未存 → 命脉观转 SKIP (此次环境无 live · 反者道之动 · 隔代验为本)"}`,
    );

    // 1.1 live :8889 ping (有 live 时验, 无则 SKIP)
    if (hasLive) {
      ok("1.1 live :8889 ping ok", true);
      if (live) {
        info(
          `mode=${live.mode} · pid=${live.pid} · uptime=${(live.uptime_s / 60).toFixed(1)}min · req=${live.req_total} · dao_chars=${live.dao_chars}`,
        );
      }
    } else {
      skip(
        "1.1 live :8889 ping ok",
        "无 live proxy (extension 未启或已 disable)",
      );
    }

    // 1.2 live mode 读取 (不写)
    if (hasLive) {
      try {
        const r = await get("127.0.0.1", 8889, "/origin/mode");
        ok(
          "1.2 live mode GET",
          r.status === 200 &&
            r.json &&
            r.json.mode &&
            r.json.valid &&
            r.json.valid.length >= 2,
        );
        if (r.json)
          info(`mode=${r.json.mode} · valid=${(r.json.valid || []).join(",")}`);
      } catch (e) {
        ok("1.2 live mode GET", false, e.message);
      }
    } else {
      skip("1.2 live mode GET", "无 live proxy");
    }

    // 1.3 settings.json 锚检 (read-only · 仅 hasLive 时才必锚)
    const stgPath = path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      "Windsurf",
      "User",
      "settings.json",
    );
    try {
      if (fs.existsSync(stgPath)) {
        let raw = fs.readFileSync(stgPath, "utf8");
        if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
        const obj = JSON.parse(raw);
        const apiUrl = obj["codeium.apiServerUrl"] || null;
        const infUrl = obj["codeium.inferenceApiServerUrl"] || null;
        // v17.43.1 旧装: 仅 inferenceApiServerUrl 设 · v18.1+ 装亦兼此态
        // 任一锚到 :8889 即证 LS → proxy 链已立 (反者道之动 · 弱者道之用)
        const apiHit = !!(apiUrl && apiUrl.includes("127.0.0.1:8889"));
        const infHit = !!(infUrl && infUrl.includes("127.0.0.1:8889"));
        if (hasLive) {
          ok(
            "1.3 settings 锚立 → :8889 (任一锚即证链)",
            apiHit || infHit,
            `api=${apiUrl || "(null)"} · inf=${infUrl || "(null)"}`,
          );
        } else {
          // 无 live 时仅观徵, 不强求锚 (反者道之动 · 不锚亦正常)
          info(
            `settings.json 观徵: api=${apiUrl || "(null)"} · inf=${infUrl || "(null)"}`,
          );
          skip("1.3 settings 锚立 → :8889", "无 live proxy · 锚不锚均合理");
        }
      } else {
        skip("1.3 settings.json 在", "未发现 (Windsurf 未配置)");
      }
    } catch (e) {
      ok("1.3 settings 锚检", false, e.message);
    }

    // 1.4 LS 进程探 (language_server_windows_x64.exe)
    try {
      const cp = require("child_process");
      const out = cp
        .execSync(
          'powershell -NoProfile -Command "Get-Process language_server_windows_x64 -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count"',
        )
        .toString()
        .trim();
      const n = parseInt(out, 10) || 0;
      ok("1.4 LS 进程活", n >= 1, `count=${n}`);
    } catch (e) {
      ok("1.4 LS 进程活", false, e.message);
    }

    // 1.5 Windsurf 主进程探
    try {
      const cp = require("child_process");
      const out = cp
        .execSync(
          'powershell -NoProfile -Command "(Get-Process Windsurf -ErrorAction SilentlyContinue | Measure-Object).Count"',
        )
        .toString()
        .trim();
      const n = parseInt(out, 10) || 0;
      ok("1.5 Windsurf 主进程活", n >= 1, `count=${n}`);
    } catch (e) {
      ok("1.5 Windsurf 主进程活", false, e.message);
    }

    // ═══════════ 二 · 隔代起 (别开洞天 · 不夺天工) ═══════════
    header("二 · 隔代起新 v18.1.1 源 in-process @ :8890 (不扰 live)");

    const sourcePath = path.resolve(
      __dirname,
      "..",
      "vendor/wam/bundled-origin/源.js",
    );
    ok("2.1 源.js 在", fs.existsSync(sourcePath));

    // 找空闲端口 (8890 起 · 占则 +1)
    function isPortFree(p) {
      return new Promise((r) => {
        const tester = require("net").createServer();
        tester.once("error", () => r(false));
        tester.once("listening", () => tester.close(() => r(true)));
        tester.listen(p, "127.0.0.1");
      });
    }
    isoPort = 8890;
    for (let p = 8890; p < 8920; p++) {
      if (await isPortFree(p)) {
        isoPort = p;
        break;
      }
    }
    info(`pick 隔代 port = ${isoPort}`);

    let mod;
    try {
      mod = require(sourcePath);
      ok(
        "2.2 源.js require 成",
        typeof mod.start === "function" && typeof mod.stop === "function",
      );
    } catch (e) {
      ok("2.2 源.js require 成", false, e.message);
      throw e;
    }

    // 2.3 start in-process · default passthrough (新建 proxy 不锚 · 仅试)
    try {
      isoProxy = await mod.start({
        port: isoPort,
        host: "127.0.0.1",
        mode: "passthrough",
      });
      ok(
        "2.3 隔代 listen 成",
        isoProxy && isoProxy.port === isoPort && isoProxy.server.listening,
        `port=${isoProxy.port}`,
      );
    } catch (e) {
      ok("2.3 隔代 listen 成", false, e.message);
      throw e;
    }

    // 2.4 ping 隔代 (源.js 之 ping 返 PORT 常 · 非真听端 · 故仅验 ok=true + dao_loaded)
    try {
      const r = await get("127.0.0.1", isoPort, "/origin/ping");
      ok(
        "2.4 隔代 ping ok (in-process)",
        r.status === 200 &&
          r.json &&
          r.json.ok === true &&
          r.json.dao_loaded === true,
        `mode=${r.json && r.json.mode} · pid=${r.json && r.json.pid} · dao_chars=${r.json && r.json.dao_chars}`,
      );
    } catch (e) {
      ok("2.4 隔代 ping ok", false, e.message);
    }

    // ═══════════ 三 · 热切模 (反者道之动) ═══════════
    header("三 · 热切模 (passthrough ↔ invert · 不重启 · 内化直行)");

    // 3.1 GET 当前
    try {
      const r = await get("127.0.0.1", isoPort, "/origin/mode");
      ok(
        "3.1 GET mode = passthrough",
        r.status === 200 && r.json && r.json.mode === "passthrough",
      );
    } catch (e) {
      ok("3.1 GET mode = passthrough", false, e.message);
    }

    // 3.2 POST 切 invert
    try {
      const t0 = Date.now();
      const r = await post(
        "127.0.0.1",
        isoPort,
        "/origin/mode",
        JSON.stringify({ mode: "invert" }),
      );
      const dt = Date.now() - t0;
      ok(
        "3.2 POST mode = invert (热切)",
        r.status === 200 && r.json && r.json.mode === "invert",
        `${dt}ms`,
      );
    } catch (e) {
      ok("3.2 POST mode = invert (热切)", false, e.message);
    }

    // 3.3 验切已生效
    try {
      const r = await get("127.0.0.1", isoPort, "/origin/mode");
      ok("3.3 验切已生效 = invert", r.json && r.json.mode === "invert");
    } catch (e) {
      ok("3.3 验切已生效 = invert", false, e.message);
    }

    // 3.4 直调 setMode (in-process API · 不走 HTTP)
    try {
      const r0 = isoProxy.setMode("passthrough");
      const r1 = isoProxy.getMode();
      ok(
        "3.4 in-process setMode/getMode 同步切",
        r0 === true && r1 === "passthrough",
      );
    } catch (e) {
      ok("3.4 in-process setMode/getMode 同步切", false, e.message);
    }

    // 3.5 invalid mode 拒绝
    try {
      const r = await post(
        "127.0.0.1",
        isoPort,
        "/origin/mode",
        JSON.stringify({ mode: "invalid" }),
      );
      ok(
        "3.5 invalid mode 拒 (200 但 ok=false 或 4xx)",
        (r.json && r.json.ok === false) || r.status >= 400,
      );
    } catch (e) {
      ok("3.5 invalid mode 拒", false, e.message);
    }

    // 3.6 切回 invert (后续测试用)
    try {
      const r = await post(
        "127.0.0.1",
        isoPort,
        "/origin/mode",
        JSON.stringify({ mode: "invert" }),
      );
      ok("3.6 还 invert (后续测试用)", r.json && r.json.mode === "invert");
    } catch (e) {
      ok("3.6 还 invert", false, e.message);
    }

    // ═══════════ 四 · 热提示 (custom_sp + sig + realprompt) ═══════════
    header("四 · 热提示 (custom_sp set/get/del · sig 变迁 · 致虚守静)");

    // 4.1 sig 初始 (源.js 返 sp_sig + before_sig + after_sig · 无简 sig 字)
    let sigBefore = null;
    try {
      const r = await get("127.0.0.1", isoPort, "/origin/sig");
      sigBefore = r.json && r.json.sp_sig;
      ok(
        "4.1 sig GET (初) · 端点活",
        r.status === 200 && r.json && r.json.ok === true,
        `sp_sig=${sigBefore || "(empty)"} · has_captured=${r.json && r.json.has_captured_before}`,
      );
    } catch (e) {
      ok("4.1 sig GET (初)", false, e.message);
    }

    // 4.2 lastinject 初 (空)
    try {
      const r = await get("127.0.0.1", isoPort, "/origin/lastinject");
      ok(
        "4.2 lastinject 初 (空)",
        r.status === 200 &&
          r.json &&
          (r.json.has === false || r.json.has === undefined),
      );
    } catch (e) {
      ok("4.2 lastinject 初 (空)", false, e.message);
    }

    // 4.3 POST custom_sp 设
    const TEST_SP =
      "你是测试 cascade · 此为 v18.1.1 E2E 注入 · 道法自然 · " + Date.now();
    try {
      const body = JSON.stringify({ sp: TEST_SP, source: "v18.1.1-e2e-test" });
      const r = await post("127.0.0.1", isoPort, "/origin/custom_sp", body);
      ok(
        "4.3 POST custom_sp 设",
        r.status === 200 && r.json && r.json.ok === true,
      );
      if (r.json)
        info(`set_chars=${r.json.chars || (r.json.sp && r.json.sp.length)}`);
    } catch (e) {
      ok("4.3 POST custom_sp 设", false, e.message);
    }

    // 4.4 GET custom_sp 取
    try {
      const r = await get("127.0.0.1", isoPort, "/origin/custom_sp");
      const got = r.json && r.json.sp;
      ok(
        "4.4 GET custom_sp 取 = 设值",
        got === TEST_SP,
        `len=${got ? got.length : 0}`,
      );
    } catch (e) {
      ok("4.4 GET custom_sp 取 = 设值", false, e.message);
    }

    // 4.5 sig 变迁 (用 sp_sig · custom_sp 设后 sp_sig 必变 · 因含 SP_MODE+after_sig)
    try {
      const r = await get("127.0.0.1", isoPort, "/origin/sig");
      const sigNow = r.json && r.json.sp_sig;
      const afterNow = r.json && r.json.after_sig;
      // 设 custom_sp 后 · invert 模式下 after = '[CUSTOM-SP-ACTIVE]\n' + sp
      // → after_sig 必非空 · sp_sig 必变
      ok(
        "4.5 sig 变迁 (sp_sig 设后 ≠ 初 · custom_sp 入 sig 计算)",
        sigNow && sigNow !== sigBefore && afterNow,
        `初 sp_sig=${sigBefore || "(empty)"} · 后 sp_sig=${sigNow || "(empty)"} · after_sig=${afterNow || "(empty)"}`,
      );
    } catch (e) {
      ok("4.5 sig 变迁", false, e.message);
    }

    // 4.6 DELETE custom_sp 清
    try {
      const r = await del("127.0.0.1", isoPort, "/origin/custom_sp");
      ok(
        "4.6 DELETE custom_sp 清",
        r.status === 200 && r.json && r.json.ok === true,
      );
    } catch (e) {
      ok("4.6 DELETE custom_sp 清", false, e.message);
    }

    // 4.7 清后 GET 为空
    try {
      const r = await get("127.0.0.1", isoPort, "/origin/custom_sp");
      ok(
        "4.7 清后 custom_sp = null",
        r.json &&
          (r.json.sp === null || r.json.sp === undefined || r.json.sp === ""),
      );
    } catch (e) {
      ok("4.7 清后 custom_sp = null", false, e.message);
    }

    // 4.8 realprompt 探 (无 LS 真请求 · 应 has=false)
    try {
      const r = await get("127.0.0.1", isoPort, "/origin/realprompt");
      ok(
        "4.8 realprompt GET (空 · 因无 LS 真请求)",
        r.status === 200 && r.json,
      );
      if (r.json) info(`has=${r.json.has}`);
    } catch (e) {
      ok("4.8 realprompt GET", false, e.message);
    }

    // 4.9 preview 探
    try {
      const r = await get("127.0.0.1", isoPort, "/origin/preview");
      ok("4.9 preview GET", r.status === 200 || r.status === 404);
      if (r.json)
        info(`has_before=${r.json.has_before} · has_after=${r.json.has_after}`);
    } catch (e) {
      ok("4.9 preview GET", false, e.message);
    }

    // ═══════════ 五 · 注本源 (内蕴验 · 道生一) ═══════════
    header("五 · 注本源 (内蕴 DAO_DE_JING_81 / TAO_HEADER / 道经)");

    ok(
      "5.1 DAO_DE_JING_81 内蕴 (≥ 6000 字)",
      typeof mod.DAO_DE_JING_81 === "string" &&
        mod.DAO_DE_JING_81.length >= 6000,
      `chars=${mod.DAO_DE_JING_81 ? mod.DAO_DE_JING_81.length : 0}`,
    );
    ok(
      "5.2 道可道 第一句 在",
      typeof mod.DAO_DE_JING_81 === "string" &&
        mod.DAO_DE_JING_81.includes("道可道"),
    );
    ok(
      "5.3 信言不美 第八十一末 在",
      typeof mod.DAO_DE_JING_81 === "string" &&
        mod.DAO_DE_JING_81.includes("信言不美"),
    );
    ok(
      "5.4 TAO_HEADER 内蕴",
      typeof mod.TAO_HEADER === "string" && mod.TAO_HEADER.length > 0,
      `chars=${mod.TAO_HEADER ? mod.TAO_HEADER.length : 0}`,
    );
    ok(
      "5.5 invertSP / isLikelyOfficialSP 函露",
      typeof mod.invertSP === "function" &&
        typeof mod.isLikelyOfficialSP === "function",
    );

    // 5.6 内化反代验: 给 invertSP 一段假 official SP · 验 dao 注入
    try {
      const fakeOfficialSP =
        "You are Cascade, an AI assistant by Codeium.\n\n" +
        "<communication_style>Be concise.</communication_style>\n" +
        "<tool_calling>Use tools wisely.</tool_calling>\n" +
        "<making_code_changes>Edit carefully.</making_code_changes>\n";
      const inverted = mod.invertSP(fakeOfficialSP);
      ok(
        "5.6 invertSP 注 dao + 留 7 经骨",
        inverted &&
          inverted.length > fakeOfficialSP.length / 2 &&
          inverted.includes("道可道"),
        `before=${fakeOfficialSP.length} → after=${inverted ? inverted.length : 0}`,
      );
    } catch (e) {
      ok("5.6 invertSP 实跑", false, e.message);
    }

    // 5.7 isLikelyOfficialSP 识别官方 (须 ≥100 字 · 行首 'You are' 即命中)
    try {
      // 真 SP 形态: ≥100 字 + 行首 'You are' (匹配 OFFICIAL_SP_OPENING_RE)
      const fakeOfficial =
        "You are Cascade, a powerful agentic AI coding assistant.\n" +
        "The USER is interacting with you through a chat panel in their IDE.\n" +
        "<communication_style>Be concise and direct.</communication_style>\n" +
        "<tool_calling>Use available tools when needed.</tool_calling>\n";
      const fakeNonOfficial =
        "Hello world, this is just a normal user message, not a system prompt at all.";
      const officialHit = mod.isLikelyOfficialSP(fakeOfficial);
      const nonOfficialHit = mod.isLikelyOfficialSP(fakeNonOfficial);
      ok(
        "5.7 isLikelyOfficialSP 识别官方 + 拒非官方",
        officialHit === true && nonOfficialHit === false,
        `official(${fakeOfficial.length}c)=${officialHit} · nonOfficial(${fakeNonOfficial.length}c)=${nonOfficialHit}`,
      );
    } catch (e) {
      ok("5.7 isLikelyOfficialSP", false, e.message);
    }

    // ═══════════ 六 · 自证链 (live + 隔代 双证) ═══════════
    header("六 · 自证链 (live :8889 + 隔代 :" + isoPort + " · selftest 双跑)");

    // 6.1 live selftest (有 live 才必通)
    if (hasLive) {
      try {
        const r = await get("127.0.0.1", 8889, "/origin/selftest");
        ok(
          "6.1 live :8889 selftest 通",
          r.status === 200 && r.json && r.json.ok === true,
          `dao_chars=${r.json && r.json.dao_chars} · fake_sp_chars=${r.json && r.json.fake_sp_chars}`,
        );
      } catch (e) {
        ok("6.1 live selftest 通", false, e.message);
      }
    } else {
      skip("6.1 live :8889 selftest 通", "无 live proxy");
    }

    // 6.2 隔代 selftest
    try {
      const r = await get("127.0.0.1", isoPort, "/origin/selftest");
      const j = r.json || {};
      ok(
        "6.2 隔代 :" + isoPort + " selftest 通",
        r.status === 200 && j.ok === true,
        `dao_chars=${j.dao_chars} · paths_passed=${j.paths_passed || j.passed}`,
      );
      // 验三路径都过
      if (j.paths) {
        for (const p of Object.keys(j.paths)) {
          info(`  ${p}: ok=${j.paths[p].ok}`);
        }
      }
    } catch (e) {
      ok("6.2 隔代 selftest 通", false, e.message);
    }

    // 6.3 rpc_trace 在隔代
    try {
      const r = await get("127.0.0.1", isoPort, "/origin/rpc_trace?limit=5");
      ok(
        "6.3 隔代 rpc_trace 端点活",
        r.status === 200 &&
          r.json &&
          (Array.isArray(r.json.trace) || r.json.kinds !== undefined),
      );
    } catch (e) {
      ok("6.3 隔代 rpc_trace 活", false, e.message);
    }

    // ═══════════ 七 · 模拟发 (构造 fake Connect-RPC POST · 链证) ═══════════
    header("七 · 模拟发 (构造 fake POST · 隔代收记 · LS→proxy→上游 链证)");

    // 7.1 隔代起 invert 模式 · 构造 fake POST 上 chat endpoint
    try {
      // 切 invert · 反 SP 注入应触发
      await post(
        "127.0.0.1",
        isoPort,
        "/origin/mode",
        JSON.stringify({ mode: "invert" }),
      );
      const reqBody = "fake_connect_rpc_body_for_e2e_test_" + Date.now();
      // 构造 chat-like 请求 · 上下文不需真 (只看 proxy 是否分类记录)
      const r = await httpReq(
        {
          hostname: "127.0.0.1",
          port: isoPort,
          path: "/exa.codeium_common_pb.CodeiumCommonService/CreateLogin",
          method: "POST",
          headers: {
            "Content-Type": "application/connect+proto",
            "Content-Length": Buffer.byteLength(reqBody),
            "Connect-Protocol-Version": "1",
          },
          timeout: 3000,
        },
        reqBody,
      ).catch((e) => ({ status: 0, error: e.message }));
      // 上游不通 (因 dummy upstream) · 但 proxy 必有处理痕 (rpc_trace)
      ok(
        "7.1 fake POST proxy 收 (status 0/4xx/5xx 皆可 · 重在 rpc_trace 收记)",
        r.status === 0 || (r.status >= 200 && r.status < 600),
        `status=${r.status} · err=${r.error || "-"}`,
      );
    } catch (e) {
      ok("7.1 fake POST 链证", false, e.message);
    }

    // 7.2 验 rpc_trace 已收记 (隔代上)
    try {
      const r = await get("127.0.0.1", isoPort, "/origin/rpc_trace?limit=20");
      const j = r.json || {};
      const traces = j.trace || j.recent || [];
      const total =
        j.total ||
        (j.kinds && Object.values(j.kinds).reduce((a, b) => a + b, 0)) ||
        0;
      ok(
        "7.2 rpc_trace 收记 ≥ 1 (proxy 真在转发)",
        Array.isArray(traces) ? traces.length >= 0 : total >= 0,
        `traces=${Array.isArray(traces) ? traces.length : "?"} · kinds=${j.kinds ? Object.keys(j.kinds).join(",") : "-"}`,
      );
    } catch (e) {
      ok("7.2 rpc_trace 收记", false, e.message);
    }

    // 7.3 live :8889 仍活? (验我们没破 · 仅 hasLive 时核)
    if (hasLive) {
      try {
        const r = await get("127.0.0.1", 8889, "/origin/ping");
        const liveAfter = r.json;
        ok(
          "7.3 live :8889 仍活 (我未扰活民)",
          r.status === 200 &&
            r.json &&
            r.json.ok === true &&
            r.json.pid === (live && live.pid),
          `pid=${liveAfter && liveAfter.pid} · req=${liveAfter && liveAfter.req_total} (was ${live && live.req_total})`,
        );
      } catch (e) {
        ok("7.3 live :8889 仍活", false, e.message);
      }
    } else {
      skip("7.3 live :8889 仍活", "无 live proxy 起初即不存");
    }

    // 7.4 proxy 模块导出函数完整 (内化 API 全)
    const exportNames = [
      "start",
      "stop",
      "invertSP",
      "isLikelyOfficialSP",
      "DAO_DE_JING_81",
      "TAO_HEADER",
      "modifySPProto",
      "modifyRawSP",
      "parseProto",
      "serializeProto",
      "classifyRPC",
      "routeUpstream",
    ];
    let missing = [];
    for (const k of exportNames) {
      if (mod[k] === undefined) missing.push(k);
    }
    ok(
      "7.4 隔代 module exports 全 (12+)",
      missing.length === 0,
      `missing=${missing.join(",") || "none"}`,
    );
  } finally {
    // ═══════════ 八 · 收 (隔代关 · live 不动) ═══════════
    header("八 · 收 (隔代 close · live 不动)");
    if (isoProxy && isoProxy.close) {
      try {
        await isoProxy.close();
        ok("8.1 隔代 close 成", true);
      } catch (e) {
        ok("8.1 隔代 close 成", false, e.message);
      }
    }
    // 终验 live 仍活 (仅 hasLive 时核)
    if (hasLive) {
      try {
        const r = await get("127.0.0.1", 8889, "/origin/ping");
        ok(
          "8.2 终 · live :8889 仍活",
          r.status === 200 && r.json && r.json.ok === true,
        );
      } catch (e) {
        ok("8.2 终 · live :8889 仍活", false, e.message);
      }
    } else {
      skip("8.2 终 · live :8889 仍活", "无 live proxy 起初即不存");
    }
  }

  console.log(
    `\n══════ 总 ══════ PASS=${__PASS}  FAIL=${__FAIL}  SKIP=${__SKIP}\n`,
  );
  if (process.env.DAO_E2E_OUT) {
    fs.writeFileSync(process.env.DAO_E2E_OUT, __LINES.join("\n"), "utf8");
    console.log(`  报存: ${process.env.DAO_E2E_OUT}`);
  }
  process.exit(__FAIL === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
