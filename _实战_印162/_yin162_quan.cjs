#!/usr/bin/env node
/**
 * _yin162_quan.cjs · 印 162 · 一气化三清 · 全实证
 * 「反者道之动也·大曰逝逝曰远远曰反」(帛书四十/二十五)
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const C = { G:(s)=>`\x1b[32m${s}\x1b[0m`, R:(s)=>`\x1b[31m${s}\x1b[0m`, Y:(s)=>`\x1b[33m${s}\x1b[0m`, B:(s)=>`\x1b[36m${s}\x1b[0m`, GR:(s)=>`\x1b[90m${s}\x1b[0m`, BO:(s)=>`\x1b[1m${s}\x1b[0m` };

function req(urlStr, opts={}, body=null) {
  return new Promise((resolve)=>{
    let u; try { u=new URL(urlStr); } catch { return resolve({ok:false,err:"bad url"}); }
    const lib = u.protocol==="https:"?require("https"):http;
    const t0=Date.now();
    const ro = {
      hostname:u.hostname, port:u.port||(u.protocol==="https:"?443:80),
      path:u.pathname+u.search, method:opts.method||"GET",
      headers:opts.headers||{}, timeout:opts.timeout||60000,
      auth:u.username?`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`:undefined,
    };
    if (body) ro.headers["Content-Length"]=Buffer.byteLength(body);
    const r = lib.request(ro,(res)=>{
      const c=[]; res.on("data",(d)=>c.push(d));
      res.on("end",()=>{
        const b = Buffer.concat(c).toString("utf8");
        let j=null; try { j=JSON.parse(b); } catch {}
        resolve({ok:res.statusCode>=200&&res.statusCode<300,code:res.statusCode,headers:res.headers,body:b,json:j,ms:Date.now()-t0});
      });
    });
    r.on("error",(e)=>resolve({ok:false,err:e.message,ms:Date.now()-t0}));
    r.on("timeout",()=>{ r.destroy(); resolve({ok:false,err:"timeout",ms:Date.now()-t0}); });
    if (body) r.write(body); r.end();
  });
}

function reqStream(urlStr, body, onEvent) {
  return new Promise((resolve)=>{
    const u = new URL(urlStr);
    const t0 = Date.now();
    const r = http.request({
      hostname:u.hostname, port:u.port||80, path:u.pathname,
      method:"POST", headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)},
      timeout:90000,
    },(res)=>{
      let buf=""; let event=""; let deltaCount=0; let acc="";
      const meta = {};
      res.on("data",(d)=>{
        buf += d.toString("utf8");
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          else if (line.startsWith("data: ")) {
            try {
              const obj = JSON.parse(line.slice(6));
              if (event==="delta") { deltaCount++; acc += obj.piece; }
              else if (event==="meta") { Object.assign(meta, obj); if (onEvent) onEvent("meta", obj); }
              else if (event==="done") { meta.done = obj; if (onEvent) onEvent("done", obj); }
              else if (event==="error") { meta.error = obj; if (onEvent) onEvent("error", obj); }
            } catch {}
          }
        }
      });
      res.on("end",()=>resolve({ok:!meta.error,deltaCount,acc,meta,ms:Date.now()-t0,code:res.statusCode}));
    });
    r.on("error",(e)=>resolve({ok:false,err:e.message,ms:Date.now()-t0}));
    r.write(body); r.end();
  });
}

(async ()=>{
  const t0 = Date.now();
  console.log(C.BO(`\n═══ 印 162 · 一气化三清 全实证 · ${new Date().toISOString()} ═══\n`));
  const R = { passed:0, failed:0, details:[] };
  const log = (label, ok, ms, extra="") => {
    const tag = ok ? C.G("✓") : C.R("✗");
    console.log(`  ${tag} ${label.padEnd(38)} ${String(ms||"?").padStart(6)}ms · ${extra}`);
    R[ok?"passed":"failed"]++;
    R.details.push({label,ok,ms,extra});
  };

  // § 1 · health/state
  console.log(C.B("§ 1 · 状态汇总\n"));
  const h = await req("http://127.0.0.1:3001/api/health", {timeout:5000});
  log(":3001 /api/health", h.ok, h.ms, h.json ? `fleet ${h.json.fleet?.alive}/${h.json.fleet?.total} · proxy v${h.json.proxy?.v}` : "");
  const s = await req("http://127.0.0.1:3001/api/state", {timeout:8000});
  log(":3001 /api/state", s.ok, s.ms, s.json ? `sp=${s.json.sp?.strategy} vm_omni=${s.json.vm_omni?"present":"absent"}` : "");

  // § 2 · WAM
  console.log(C.B("\n§ 2 · WAM 切号 (中栏)\n"));
  const w = await req("http://127.0.0.1:3001/api/wam/list", {timeout:8000});
  log(":3001 /api/wam/list", w.ok, w.ms, w.json ? `items=${w.json.items?.length||0} usable=${w.json.items?.filter(i=>i.usable).length||0}` : "");

  // § 3 · 模型
  console.log(C.B("\n§ 3 · 模列\n"));
  const m = await req("http://127.0.0.1:3001/api/models", {timeout:5000});
  log(":3001 /api/models", m.ok, m.ms, m.json?.data ? `${m.json.data.length} 模` : "");

  // § 4 · SP 七态
  console.log(C.B("\n§ 4 · SP 七态\n"));
  const sp1 = await req("http://127.0.0.1:3001/api/sp", {timeout:5000});
  log("GET /api/sp", sp1.ok, sp1.ms, sp1.json?.strategy);
  const sp2 = await req("http://127.0.0.1:3001/api/sp", {method:"POST",headers:{"Content-Type":"application/json"},timeout:5000}, JSON.stringify({strategy:"custom",customSp:"印 162 · 一气化三清"}));
  log("POST /api/sp custom", sp2.ok, sp2.ms, sp2.json?.ok ? `→ ${sp2.json.strategy}` : "");
  const sp3 = await req("http://127.0.0.1:3001/api/sp", {method:"POST",headers:{"Content-Type":"application/json"},timeout:5000}, JSON.stringify({strategy:"bypass"}));
  log("POST /api/sp 还原 bypass", sp3.ok, sp3.ms, sp3.json?.ok ? "✓" : "");
  const sp4 = await req("http://127.0.0.1:3001/api/sp/observe", {timeout:5000});
  log("GET /api/sp/observe", sp4.ok, sp4.ms, Array.isArray(sp4.json) ? `${sp4.json.length} 笔观察` : "");

  // § 5 · 普 chat (一笔答 · 4.7+gpt5.5)
  console.log(C.B("\n§ 5 · 普 chat (4.7 + gpt5.5)\n"));
  for (const model of ["gpt-5-5","claude-sonnet-4-7"]) {
    const c = await req("http://127.0.0.1:3001/api/chat", {method:"POST",headers:{"Content-Type":"application/json"},timeout:60000}, JSON.stringify({messages:[{role:"user",content:"用一字答道"}],model,max_tokens:30}));
    log(`POST /api/chat · ${model}`, c.ok && c.json?.ok, c.ms, c.json?.routed ? `routed=${c.json.routed} · ${(c.json.content||"").replace(/\s+/g," ").slice(0,30)}` : (c.json?.error||""));
  }

  // § 6 · SSE 流式 chat (右栏 · 真本源)
  console.log(C.B("\n§ 6 · SSE 流式 chat (右栏 devin.ai 级)\n"));
  for (const model of ["gpt-5-5","claude-sonnet-4-7"]) {
    const r = await reqStream("http://127.0.0.1:3001/api/chat/stream", JSON.stringify({messages:[{role:"user",content:"用一句答: 帛书道德经第一章首句?"}],model,max_tokens:80}));
    log(`SSE /api/chat/stream · ${model}`, r.ok, r.ms, `delta=${r.deltaCount} · meta.routed=${r.meta?.routed||"?"} · ${r.acc.slice(0,40)}`);
  }

  // § 7 · 公网 cf trycloudflare
  console.log(C.B("\n§ 7 · 公网 cf 入 (任设备无感)\n"));
  const pub = await req("https://liable-public-wise-structured.trycloudflare.com/v1/chat/completions", {method:"POST",headers:{"Content-Type":"application/json"},timeout:60000}, JSON.stringify({model:"gpt-5-5",messages:[{role:"user",content:"印 162 真活验"}],max_tokens:20}));
  log("公网 cf · gpt-5-5", pub.ok && pub.json?.choices, pub.ms, pub.headers?.["x-fleet-routed"] ? `routed=${pub.headers["x-fleet-routed"]}` : "");

  // ─── 总汇 ───
  console.log(C.BO(`\n═══ 总汇 ═══`));
  const total = R.passed + R.failed;
  const rate = total ? Math.round((R.passed/total)*100) : 0;
  console.log(`  全 ${R.passed}/${total} = ${rate}% · 耗 ${(Date.now()-t0)/1000}s`);
  if (R.failed > 0) {
    console.log(C.Y("  失:"));
    R.details.filter(r=>!r.ok).forEach(r=>console.log(C.R(`    · ${r.label} · ${r.extra}`)));
  }

  fs.writeFileSync(path.join(__dirname,"_yin162_evidence.json"), JSON.stringify({
    timestamp:new Date().toISOString(), seal:"印 162 · 一气化三清 全实证",
    summary:{passed:R.passed,failed:R.failed,total,rate},
    details:R.details, elapsedMs:Date.now()-t0,
  }, null, 2));
  console.log(C.GR(`\n  evidence: ${path.join(__dirname,"_yin162_evidence.json")}`));
})().catch((e)=>{ console.error("✗ FATAL:",e.message); process.exit(1); });
