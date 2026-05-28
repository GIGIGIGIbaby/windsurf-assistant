#!/usr/bin/env node
// E2E · /origin/custom_sp 三动词端到端验
// 启 source.js 在临时端口 → POST/GET/DELETE → 验状态机 + invertSP 接入
// 跑: node tests/_e2e_custom_sp.js
"use strict";

const http = require("http");
const path = require("path");

// 用临时端口避撞已运行实例
const PORT = parseInt(process.env.E2E_PORT || "29789", 10);
process.env.ORIGIN_PORT = String(PORT);

const O = require(
  path.join(__dirname, "..", "vendor", "bundled-origin", "source.js"),
);

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: body ? { "content-type": "application/json" } : {},
    };
    const r = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const txt = Buffer.concat(chunks).toString("utf8");
        try {
          resolve({ status: res.statusCode, body: JSON.parse(txt) });
        } catch {
          resolve({ status: res.statusCode, body: txt });
        }
      });
    });
    r.on("error", reject);
    if (body) r.end(JSON.stringify(body));
    else r.end();
  });
}

const checks = [];
function check(name, cond, info) {
  checks.push({ name, ok: !!cond, info });
  console.log(`  ${cond ? "✓" : "✗"} ${name}${info ? " · " + info : ""}`);
}

(async () => {
  console.log("═══ E2E · /origin/custom_sp 端到端 ═══");
  console.log("");
  // 启服务
  const srv = await O.start({ port: PORT, mode: "invert" });
  console.log(`server up @ :${srv.port}`);
  console.log("");

  try {
    // 1. 初始 GET · 应无 custom
    console.log("── 1. 初始 GET (应 has_custom=false) ──");
    let r = await req("GET", "/origin/custom_sp");
    check("GET 初始 200", r.status === 200);
    check("GET 初始 has_custom=false", r.body && r.body.has_custom === false);
    console.log("");

    // 2. POST · 设 custom_sp (keep_blocks=true)
    console.log("── 2. POST {sp, keep_blocks:true} ──");
    const userSP = "你是用户自定义助手. 道法自然, 不饰美言.";
    r = await req("POST", "/origin/custom_sp", {
      sp: userSP,
      keep_blocks: true,
      source: "e2e_test",
    });
    check("POST 200", r.status === 200);
    check("POST ok=true", r.body && r.body.ok === true);
    check("POST chars 对", r.body && r.body.chars === userSP.length);
    console.log("");

    // 3. GET 应见已设
    console.log("── 3. GET 验已设 ──");
    r = await req("GET", "/origin/custom_sp");
    check("GET has_custom=true", r.body && r.body.has_custom === true);
    check("GET sp 等输入", r.body && r.body.sp === userSP);
    check("GET keep_blocks=true", r.body && r.body.keep_blocks === true);
    check("GET source=e2e_test", r.body && r.body.source === "e2e_test");
    console.log("");

    // 4. /origin/ping 应暴 custom_sp
    console.log("── 4. /origin/ping 暴露 custom_sp ──");
    r = await req("GET", "/origin/ping");
    check("ping custom_sp=true", r.body && r.body.custom_sp === true);
    check(
      "ping custom_sp_chars 对",
      r.body && r.body.custom_sp_chars === userSP.length,
    );
    check(
      "ping custom_sp_keep_blocks=true",
      r.body && r.body.custom_sp_keep_blocks === true,
    );
    console.log("");

    // 5. invertSP 接入验 · v7.8 永整替 (无论 keep_blocks 旧值)
    console.log("── 5. invertSP 接入 _customSP (v7.8 永整替) ──");
    const fakeSP =
      "You are Cascade, a powerful agentic AI coding assistant.\n" +
      "<communication_style>be terse</communication_style>\n" +
      "<tool_calling>use tools</tool_calling>\n" +
      "<making_code_changes>edit</making_code_changes>\n" +
      "<user_information>OS=windows</user_information>\n" +
      "<memory_system>persistent</memory_system>\n" +
      "<user_rules>rules</user_rules>\n" +
      "Bug fixing discipline: root cause first.\n" +
      "x".repeat(200);
    const inverted = O.invertSP(fakeSP);
    check("invertSP 非 null", inverted !== null);
    // v7.8 整替: after === userSP (无工具块拼接, 无道德经前置)
    check("invertSP 整替: after === userSP", inverted === userSP);
    console.log("");

    // 6. POST {keep_blocks:false} · 彻替模式
    console.log("── 6. POST {keep_blocks:false} 彻替模式 ──");
    r = await req("POST", "/origin/custom_sp", {
      sp: userSP,
      keep_blocks: false,
      source: "e2e_test",
    });
    check("POST replace 200", r.status === 200);
    check(
      "POST replace keep_blocks=false",
      r.body && r.body.keep_blocks === false,
    );
    const inverted2 = O.invertSP(fakeSP);
    check("invertSP 彻替: after === userSP", inverted2 === userSP);
    console.log("");

    // 7. POST 空 sp · 应 400
    console.log("── 7. POST 空 sp 应 400 ──");
    r = await req("POST", "/origin/custom_sp", { sp: "", keep_blocks: true });
    check("POST 空 400", r.status === 400);
    check("POST 空 ok=false", r.body && r.body.ok === false);
    console.log("");

    // 8. DELETE · 清
    console.log("── 8. DELETE 清 ──");
    r = await req("DELETE", "/origin/custom_sp");
    check("DELETE 200", r.status === 200);
    check("DELETE ok=true", r.body && r.body.ok === true);
    check("DELETE was_set=true", r.body && r.body.was_set === true);
    r = await req("GET", "/origin/custom_sp");
    check("DELETE 后 has_custom=false", r.body && r.body.has_custom === false);
    console.log("");

    // 9. 清后 invertSP 回默认 (TAO_HEADER + 道德经)
    console.log("── 9. 清后 invertSP 回默认 (道德经路径) ──");
    const inverted3 = O.invertSP(fakeSP);
    check("清后 invertSP 非 null", inverted3 !== null);
    check(
      "清后 invertSP 以 'You are Cascade.' 起首 (v7.5 TAO_HEADER)",
      inverted3 && inverted3.startsWith("You are Cascade."),
    );
    check(
      "清后 invertSP 含 道可道",
      inverted3 && inverted3.includes("道可道，非常道"),
    );
    console.log("");

    // 10. /origin/preview 暴 custom_sp 字段
    console.log("── 10. preview 暴 custom_sp 状态 ──");
    r = await req("GET", "/origin/preview");
    check("preview custom_sp=false", r.body && r.body.custom_sp === false);
    console.log("");

    // 11. v7.3 新 · /origin/sig endpoint
    console.log("── 11. /origin/sig 签名接口 (实时同步根) ──");
    r = await req("GET", "/origin/sig");
    check("sig 200", r.status === 200);
    check("sig ok=true", r.body && r.body.ok === true);
    check("sig 含 sp_sig 字段", r.body && typeof r.body.sp_sig === "string");
    check(
      "sig 含 custom_sig 字段",
      r.body && typeof r.body.custom_sig === "string",
    );
    check("sig 含 mode 字段", r.body && typeof r.body.mode === "string");
    const sigEmpty = r.body.custom_sig;
    // 设 customSP 后 sig 应变
    await req("POST", "/origin/custom_sp", {
      sp: "测试道魂",
      keep_blocks: true,
    });
    r = await req("GET", "/origin/sig");
    check(
      "设 customSP 后 custom_sig 异",
      r.body && r.body.custom_sig !== sigEmpty,
    );
    check("设后 custom_sp=true", r.body && r.body.custom_sp === true);
    check("设后 custom_sp_at > 0", r.body && r.body.custom_sp_at > 0);
    await req("DELETE", "/origin/custom_sp");
    console.log("");

    // 12. v7.3 新 · /origin/dao_default endpoint
    console.log("── 12. /origin/dao_default 道德经默认值 ──");
    r = await req("GET", "/origin/dao_default");
    check("dao_default 200", r.status === 200);
    check("dao_default ok=true", r.body && r.body.ok === true);
    check(
      "dao_default 含 dao 文",
      r.body && typeof r.body.dao === "string" && r.body.dao.length > 6000,
    );
    check(
      "dao_default chars=6776",
      r.body && r.body.chars === r.body.dao.length,
    );
    check("dao 起首 道可道", r.body && r.body.dao.startsWith("道可道，非常道"));
    console.log("");

    // 13. v7.3 新 · preview synthesized_from=sample (无 captured 时)
    console.log("── 13. preview synthesized_from=sample (无 captured) ──");
    r = await req("GET", "/origin/preview");
    check(
      "preview synthesized_from=sample (启动初无 capture)",
      r.body && r.body.synthesized_from === "sample",
    );
    check(
      "preview after 起首 'You are Cascade.' (v7.5 TAO_HEADER + 道德经)",
      r.body && r.body.after && r.body.after.startsWith("You are Cascade."),
    );
    check(
      "preview after 含 道可道",
      r.body && r.body.after && r.body.after.includes("道可道，非常道"),
    );
    check(
      "preview after 含 <tool_calling> tag (与 LLM 实收同结构)",
      r.body && r.body.after && r.body.after.includes("<tool_calling>"),
    );
    console.log("");
  } finally {
    await srv.close();
    // 清盘文件
    const fs = require("fs");
    for (const f of [
      path.join(__dirname, "..", "vendor", "bundled-origin", "_custom_sp.json"),
    ]) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  }

  // 总
  const pass = checks.filter((c) => c.ok).length;
  const total = checks.length;
  console.log("");
  console.log(
    `═══ 总 ${pass}/${total} ${pass === total ? "✓ 全绿" : "✗ 有失败"} ═══`,
  );
  process.exit(pass === total ? 0 : 1);
})().catch((e) => {
  console.error("E2E err:", e.stack || e.message);
  process.exit(2);
});
