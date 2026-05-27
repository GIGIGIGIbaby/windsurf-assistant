// _regen_all_md.js · v3.9.2 · 全量MD重生成
// 道法自然 · 反者道之动 · 强制替换所有旧MD
// 提取: fn=19(用户) + fn=20(AI) + fn=28(工具) + fn=24(错误) + fn=13(代码)
"use strict";
const crypto = require("crypto"), fs = require("fs"), path = require("path"), os = require("os");

const PB_DIR  = path.join(os.homedir(), ".codeium", "windsurf", "cascade");
const KEY_FILE = path.join(os.homedir(), ".wam", "_cascade_key.json");
const BK_ROOT  = path.join(os.homedir(), ".wam", "conversation_backups");
const OUT_LOG  = path.join(os.homedir(), "_regen_md_log.txt");

// ── 解密 ──────────────────────────────────────────────────────────────────────
function loadKey() {
  const c = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
  return Buffer.from(c.key, "ascii");
}
function decrypt(ct, key) {
  const n=ct.slice(0,12), t=ct.slice(ct.length-16), b=ct.slice(12,ct.length-16);
  const d=crypto.createDecipheriv("aes-256-gcm",key,n); d.setAuthTag(t);
  return Buffer.concat([d.update(b),d.final()]);
}

// ── 零拷贝扫描 ────────────────────────────────────────────────────────────────
function rv(buf, pos) {
  let v=0, s=0;
  while(pos<buf.length){const b=buf[pos++]; v+=(b&0x7f)*Math.pow(2,s); if(!(b&0x80))break; s+=7; if(s>49)break;}
  return {v:Math.floor(v), pos};
}
function sf(buf, base, end) {
  const r=[]; let pos=base;
  while(pos<end-1){const ts=pos; try{
    const t=rv(buf,pos); if(t.v===0){pos++;continue;} pos=t.pos;
    const wt=t.v&7, fn=t.v>>>3;
    if(wt===0){const x=rv(buf,pos);pos=x.pos;}
    else if(wt===1){pos+=8;}
    else if(wt===2){const lr=rv(buf,pos);pos=lr.pos;const len=lr.v;
      if(len<0||pos+len>end){pos=ts+1;continue;}
      if(len>=4)r.push({fn,wt,len,off:pos}); pos+=len;
    } else if(wt===5){pos+=4;} else{pos=ts+1;}
  }catch{pos=ts+1;}}
  return r;
}

// ── 文本工具 ──────────────────────────────────────────────────────────────────
function clean(raw) {
  return raw.replace(/[^\x20-\x7e\u4e00-\u9fff\u3000-\u30ff\uff00-\uffef\u2000-\u206f\n\t]/g,"").trim();
}
function bestStr(buf) {
  let best="", pos=0;
  while(pos<buf.length-1){const ts=pos;try{
    const t=rv(buf,pos); if(t.v===0){pos++;continue;} pos=t.pos;
    const wt=t.v&7;
    if(wt===0){const x=rv(buf,pos);pos=x.pos;}
    else if(wt===1){pos+=8;}
    else if(wt===2){const lr=rv(buf,pos);pos=lr.pos;const len=lr.v;
      if(len<0||pos+len>buf.length){pos=ts+1;continue;}
      const data=buf.slice(pos,pos+len);pos+=len;
      if(len>=15){const s=data.toString("utf8");const c=clean(s);
        if(c.length/Math.max(s.length,1)<0.35)continue;
        const uc=(c.match(/%[0-9A-Fa-f]{2}/g)||[]).length;
        if((uc*3)/Math.max(c.length,1)>0.08)continue;
        if(c.length>best.length)best=c;
      }
    } else if(wt===5){pos+=4;} else{pos=ts+1;}
  }catch{pos=ts+1;}}
  return best.trim();
}
function aiThink(buf) {
  try{
    const c=buf.toString("utf8").replace(/[^\x20-\x7e\u4e00-\u9fff\u3000-\u30ff\uff00-\uffef\u2000-\u206f\n\t]/g,"");
    const t=c.replace(/[A-Za-z0-9+\/=]{80,}/g," ").replace(/[A-Za-z0-9+\/=]{40,}$/gm,"").replace(/\s{3,}/g,"\n").trim();
    if(t.length<30||!/[\s\u4e00-\u9fff]/.test(t))return"";
    return t;
  }catch{return"";}
}
function toolBlock(buf, base, f) {
  try{
    const d2=sf(buf,f.off,f.off+f.len);
    let cmd="", outs=[], res="";
    for(const s of d2){
      if(s.wt!==2||s.len<4)continue;
      const cap=Math.min(s.len,50000);
      const txt=clean(buf.slice(s.off,s.off+cap).toString("utf8"));
      if(txt.length<4)continue;
      if(s.fn===23&&txt.length<1000)cmd=txt;
      else if((s.fn===24||s.fn===25)&&txt.length>20)outs.push(txt.substring(0,8000));
      else if(s.fn===21&&txt.length>res.length)res=txt.substring(0,8000);
    }
    const p=[];
    if(cmd)p.push("`$ "+cmd+"`");
    for(const o of outs)p.push(o);
    if(res&&!outs.length&&!cmd)p.push(res);
    return p.join("\n").trim();
  }catch{return"";}
}
function codeCtx(buf, f) {
  try{
    const d2=sf(buf,f.off,f.off+f.len);
    let best="";
    for(const s of d2){
      if(s.wt!==2||s.len<20)continue;
      const txt=clean(buf.slice(s.off,s.off+Math.min(s.len,20000)).toString("utf8"));
      if(txt.length>best.length&&/[\s\n]/.test(txt))best=txt.substring(0,5000);
    }
    return best;
  }catch{return"";}
}
function aiTraj(buf) {
  try{
    const raw=buf.toString("utf8");
    const re=/CORTEX_STEP_TYPE_PLANNER_RESPONSE\)[):\n\r ]{0,6}([\s\S]+?)(?=\nStep \d+\s*\(|\s*$)/g;
    const parts=[]; let m;
    while((m=re.exec(raw))!==null){const t=clean(m[1]).trim();if(t.length>30&&!parts.some(p=>p.includes(t.substring(0,40))))parts.push(t);}
    return parts.length>0?parts[parts.length-1]:"";
  }catch{return"";}
}

// ── 主解析 ────────────────────────────────────────────────────────────────────
function parsePb(pt) {
  const d0=sf(pt,0,pt.length);
  const steps=d0.filter(x=>x.fn===2&&x.len>50);
  const turns=[], models=new Set(), seen=new Set();
  function add(role,off,text){
    if(!text||text.length<10)return;
    const fp=text.substring(0,80).replace(/\s+/g," ");
    if(seen.has(fp))return; seen.add(fp);
    turns.push({role,byteOffset:off,text});
  }
  for(const step of steps){
    const d1=sf(pt,step.off,step.off+step.len);
    for(const f of d1){
      if(f.fn===19&&f.len>=10){try{const t=bestStr(pt.slice(f.off,f.off+f.len));const m=t.replace(/继续[\s↵]*|^@\[.*?\]\s*/g,"").trim();if(t.length>=5&&m.length>=5)add("user",f.off,t);}catch{}}
      else if(f.fn===20&&f.len>=30){try{const t=aiThink(pt.slice(f.off,f.off+f.len));if(t.length>=30)add("ai",f.off,t);}catch{}}
      else if(f.fn===28&&f.len>=20){try{const t=toolBlock(pt,step.off,f);if(t.length>=20)add("tool",f.off,t);}catch{}}
      else if(f.fn===24&&f.len>=20){try{const t=clean(pt.slice(f.off,f.off+Math.min(f.len,2000)).toString("utf8"));if(t.length>=20)add("error",f.off,t);}catch{}}
      else if(f.fn===13&&f.len>=50&&f.len<100000){try{const t=codeCtx(pt,f);if(t.length>=50)add("context",f.off,t);}catch{}}
      else if(f.fn===72&&f.len>=100){try{const t=aiTraj(pt.slice(f.off,f.off+f.len));if(t.length>20)add("ai",f.off,t);}catch{}}
      if(f.len>15&&f.len<5000){try{const s=pt.slice(f.off,f.off+f.len).toString("utf8");for(const m of s.matchAll(/Model((?:Claude|Gemini|GPT|DeepSeek|Sonnet|Opus|Haiku|Flash)[\s\S]{2,50}?)(?:\x00|\x08|\x12|\x1a|$)/g)){const c=clean(m[1]).trim();if(c.length>3&&c.length<60)models.add(c);}}catch{}}
    }
  }
  turns.sort((a,b)=>a.byteOffset-b.byteOffset);
  const deduped=[];
  for(const t of turns){
    if(deduped.length>0){const p=deduped[deduped.length-1];if(p.role===t.role){const sh=t.text.length<p.text.length?t.text:p.text;const lo=t.text.length<p.text.length?p.text:t.text;if(sh.length>10&&lo.includes(sh.substring(0,Math.floor(sh.length*0.7)))){deduped[deduped.length-1]={...p,text:lo};continue;}}}
    deduped.push(t);
  }
  return {turns:deduped, userMsgs:deduped.filter(x=>x.role==="user"), models:[...models], steps:steps.length};
}

function makeMd(pbPath, ct, conv, uuid) {
  const sizeKB=Math.round(ct.length/1024);
  const turns=conv.turns;
  const aiCount=turns.filter(x=>x.role==="ai").length;
  const toolCount=turns.filter(x=>x.role==="tool").length;
  const totalKB=Math.round(turns.reduce((s,t)=>s+t.text.length,0)/1024);
  const title=(conv.userMsgs[0]?conv.userMsgs[0].text.replace(/[\n\r]+/g," ").trim().substring(0,60):"")||uuid.substring(0,8);
  let md="# "+title.replace(/[#[\]]/g,"")+"\n\n";
  md+="> **UUID**: `"+uuid+"`  \n";
  md+="> **大小**: "+sizeKB+" KB  \n";
  md+="> **生成**: "+new Date().toISOString().substring(0,19).replace("T"," ")+"  \n";
  if(conv.models.length>0)md+="> **模型**: "+conv.models.join(" · ")+"  \n";
  md+="> **步骤**: "+conv.steps+" 轮  \n";
  md+="> **用户**: "+conv.userMsgs.length+" 条  **AI**: "+aiCount+" 条  **操作**: "+toolCount+" 条  **内容**: "+totalKB+" KB  \n";
  md+="\n---\n\n";
  if(turns.length===0){md+="_（未提取到内容）_\n";return md;}
  let uI=0,aI=0,tI=0,eI=0,cI=0;
  turns.forEach((turn,i)=>{
    const r=turn.role||"ai";
    if(r==="user"){uI++;md+="## 👤 用户 "+uI+"\n\n";}
    else if(r==="ai"){aI++;md+="## 🤖 AI "+aI+"\n\n";}
    else if(r==="tool"){tI++;md+="## 🔧 操作 "+tI+"\n\n";}
    else if(r==="error"){eI++;md+="## ⚠️ 错误 "+eI+"\n\n";}
    else{cI++;md+="## 📄 上下文 "+cI+"\n\n";}
    md+=turn.text.trim()+"\n\n";
    if(i<turns.length-1)md+="---\n\n";
  });
  return md;
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
const key = loadKey();
const logs = [];
function log(s){process.stdout.write(s+"\n");logs.push(s);}

log("═".repeat(68));
log("  v3.9.2 全量MD重生成 · 道法自然 · "+new Date().toLocaleString());
log("═".repeat(68));

// 找所有 backup 目录中的 PB 文件
let gen=0, skip=0, fail=0, totalOldKB=0, totalNewKB=0;

if(!fs.existsSync(BK_ROOT)){
  log("❌ 备份目录不存在: "+BK_ROOT);
  process.exit(1);
}

const batches = fs.readdirSync(BK_ROOT).filter(d=>d.startsWith("backup_")).sort();
log("备份批次: "+batches.length+" 个");

for(const batch of batches){
  const batchDir=path.join(BK_ROOT,batch);
  try{
    const pbFiles=fs.readdirSync(batchDir).filter(f=>f.endsWith(".pb")).sort();
    if(pbFiles.length===0)continue;
    log("\n["+batch+"] "+pbFiles.length+" 个PB文件");
    for(const pb of pbFiles){
      const pbPath=path.join(batchDir,pb);
      const mdPath=pbPath.replace(/\.pb$/,".md");
      const uuid=pb.replace(/\.pb$/,"");
      let ct=null;
      try{
        const t0=Date.now();
        ct=fs.readFileSync(pbPath);
        if(!ct||ct.length<29){log("  ⚠ 跳过(太小): "+pb);skip++;continue;}
        const szKB=Math.round(ct.length/1024);
        process.stdout.write("  处理: "+uuid.substring(0,8)+"... "+szKB+"KB\r");
        const pt=decrypt(ct,key);
        const conv=parsePb(pt);
        const md=makeMd(pbPath,ct,conv,uuid);
        const oldKB=fs.existsSync(mdPath)?Math.round(fs.statSync(mdPath).size/1024):0;
        fs.writeFileSync(mdPath,md,"utf8");
        const newKB=Math.round(md.length/1024);
        totalOldKB+=oldKB;totalNewKB+=newKB;gen++;
        const ms=Date.now()-t0;
        const arrow=oldKB>0?(newKB>oldKB?"⬆":"⬇"):"✨";
        log(`  ${arrow} ${uuid.substring(0,8)}... PB:${szKB}KB  旧MD:${oldKB}KB → 新MD:${newKB}KB  u:${conv.userMsgs.length} ai:${conv.turns.filter(x=>x.role==="ai").length} tool:${conv.turns.filter(x=>x.role==="tool").length}  ${ms}ms`);
        ct=null; // GC 提示
      }catch(e){
        const ek=e.stack||e.message||String(e);
        log("  ✗ "+pb+": "+ek.split("\n")[0]);
        fail++;
        ct=null;
      }
    }
  }catch(e){log("  批次错误 "+batch+": "+(e.stack||e.message));}
}

log("\n"+"═".repeat(68));
log("  完成: ✓"+gen+" 个  跳过:"+skip+" 个  失败:"+fail+" 个");
log("  旧MD总量: "+totalOldKB+"KB  新MD总量: "+totalNewKB+"KB  提升: "+(totalOldKB>0?((totalNewKB/totalOldKB-1)*100).toFixed(0)+"%":"∞"));
log("═".repeat(68));

try { fs.writeFileSync(OUT_LOG, logs.join("\n"), "utf8"); log("日志已写入: "+OUT_LOG); } catch(we) { log("日志写入失败: "+we.message); }
