#!/usr/bin/env node
"use strict";
const h=require("http"),os=require("os"),fs=require("fs"),{exec}=require("child_process"),crypto=require("crypto");
const PORT=8181,TOKEN=crypto.randomBytes(16).toString("hex");
try{fs.writeFileSync("/tmp/.dao_token",TOKEN);}catch{}
console.log("[nano] port="+PORT+" token="+TOKEN);
function run(cmd,t){return new Promise(r=>{exec(cmd,{timeout:t||60000,maxBuffer:4*1024*1024,shell:"/bin/bash"},(e,o,s)=>r({stdout:String(o||""),stderr:String(s||""),exit:e?e.code||1:0}));});}
const srv=h.createServer(async(req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  if(req.method==="OPTIONS"){res.writeHead(204);res.end();return;}
  const u=new URL(req.url,"http://x");
  if(u.pathname==="/_/health"||u.pathname==="/health"||u.pathname==="/"){
    res.writeHead(200,{"Content-Type":"application/json"});
    res.end(JSON.stringify({ok:true,seal:"dao-nano",host:os.hostname(),up:Math.floor(process.uptime()),ts:Date.now()}));
    return;
  }
  const auth=req.headers["authorization"]||"";
  if(auth!=="Bearer "+TOKEN){res.writeHead(401);res.end(JSON.stringify({error:"unauth",file:"/tmp/.dao_token"}));return;}
  if((u.pathname==="/_/run"||u.pathname==="/run")&&req.method==="POST"){
    const chunks=[];req.on("data",d=>chunks.push(d));req.on("end",async()=>{
      let p={};try{p=JSON.parse(Buffer.concat(chunks).toString());}catch{}
      const r=await run(p.cmd||"echo ok",p.timeout||60000);
      res.writeHead(200,{"Content-Type":"application/json"});
      res.end(JSON.stringify(r));
    });return;
  }
  res.writeHead(404);res.end(JSON.stringify({error:"not found"}));
});
srv.listen(PORT,"0.0.0.0",()=>{
  console.log("[nano] READY port="+PORT);
  exec("which cloudflared 2>/dev/null||(curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cf && chmod +x /tmp/cf)",{timeout:90000},(e,o)=>{
    const cf=(o||"").trim()||"/tmp/cf";
    const cfbin=cf.includes("/")?cf:"/tmp/cf";
    exec(cfbin+" tunnel --url localhost:"+PORT+" 2>/tmp/dao_cf.log &",{timeout:3000},()=>console.log("[nano] tunnel starting"));
    setTimeout(()=>{try{const log=fs.readFileSync("/tmp/dao_cf.log","utf8");const m=log.match(/https?:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(m)console.log("[nano] TUNNEL:",m[0]);}catch{}},25000);
  });
});
process.on("uncaughtException",e=>console.error("[nano] ERR:",e.message));
