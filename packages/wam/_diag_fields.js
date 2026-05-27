// _diag_fields.js · v3.9.2 · 全字段深度诊断
// 目标: 找出每个 step 里 depth=1/2 所有含可读文本的字段
// 不预设 fn 号 · 穷举一切 · 道法自然

"use strict";
const crypto = require("crypto"), fs = require("fs"), path = require("path"), os = require("os");
const PB_DIR = path.join(os.homedir(), ".codeium", "windsurf", "cascade");
const KEY_FILE = path.join(os.homedir(), ".wam", "_cascade_key.json");

// ── 基础工具 ──────────────────────────────────────────────────────────────────
function loadKey() {
  const c = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
  return Buffer.from(c.key, "ascii");
}
function decrypt(ct, key) {
  const n = ct.slice(0, 12), t = ct.slice(ct.length - 16), b = ct.slice(12, ct.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", key, n); d.setAuthTag(t);
  return Buffer.concat([d.update(b), d.final()]);
}
function readVarint(buf, pos) {
  let v = 0, s = 0;
  while (pos < buf.length) { const b = buf[pos++]; v += (b & 0x7f) * Math.pow(2, s); if (!(b & 0x80)) break; s += 7; if (s > 49) break; }
  return { v: Math.floor(v), pos };
}
// 单层扫描 · 零拷贝 · 返回 {fn, wt, len, off}
function scanFlat(buf, base, end) {
  const r = []; let pos = base;
  while (pos < end - 1) {
    const ts = pos;
    try {
      const t = readVarint(buf, pos); if (t.v === 0) { pos++; continue; } pos = t.pos;
      const wt = t.v & 7, fn = t.v >>> 3;
      if (wt === 0) { const x = readVarint(buf, pos); r.push({ fn, wt, len: 0, off: pos }); pos = x.pos; }
      else if (wt === 1) { r.push({ fn, wt, len: 8, off: pos }); pos += 8; }
      else if (wt === 2) {
        const lr = readVarint(buf, pos); pos = lr.pos; const len = lr.v;
        if (len < 0 || pos + len > end) { pos = ts + 1; continue; }
        r.push({ fn, wt, len, off: pos }); pos += len;
      } else if (wt === 5) { r.push({ fn, wt, len: 4, off: pos }); pos += 4; }
      else { pos = ts + 1; }
    } catch { pos = ts + 1; }
  }
  return r;
}
// 文本质量评分 0-100
function textScore(buf) {
  if (!buf || buf.length < 4) return 0;
  try {
    const s = buf.toString("utf8");
    // 统计可见字符
    let vis = 0, cjk = 0, ctrl = 0;
    for (let i = 0; i < Math.min(s.length, 2000); i++) {
      const c = s.charCodeAt(i);
      if (c >= 0x20 && c <= 0x7e) vis++;
      else if (c >= 0x4e00 && c <= 0x9fff) { vis++; cjk++; }
      else if (c === 9 || c === 10 || c === 13) vis++;
      else ctrl++;
    }
    const total = Math.min(s.length, 2000);
    const density = vis / total;
    if (density < 0.5) return 0;
    // 检查是否是纯 base64/hex
    const sample = s.substring(0, 200);
    if (/^[A-Za-z0-9+\/=\r\n]{100,}$/.test(sample)) return 5;
    // 有空格 + 词汇 = 真实文本
    const hasWords = /\b\w{3,}\b/.test(sample);
    const hasSpaces = (sample.match(/ /g) || []).length > 5;
    if (!hasWords && !hasSpaces && cjk === 0) return 10;
    return Math.round(Math.min(100, density * 80 + (hasWords ? 10 : 0) + (cjk > 0 ? 10 : 0)));
  } catch { return 0; }
}
function cleanText(buf, maxLen = 500) {
  try {
    return buf.toString("utf8")
      .replace(/[^\x20-\x7e\u4e00-\u9fff\u3000-\u30ff\uff00-\uffef\u2000-\u206f\n\t]/g, "")
      .replace(/\s{3,}/g, "  ")
      .trim()
      .substring(0, maxLen);
  } catch { return ""; }
}
function kb(n) { return (n / 1024).toFixed(1) + "KB"; }

// ── 主诊断 ────────────────────────────────────────────────────────────────────
const key = loadKey();
const files = fs.readdirSync(PB_DIR).filter(f => f.endsWith(".pb"))
  .map(f => ({ n: f, sz: fs.statSync(path.join(PB_DIR, f)).size }))
  .sort((a, b) => b.sz - a.sz);

// 选一个中型文件做深度分析 (~5-8MB)
const target = files.find(f => f.sz > 3e6 && f.sz < 8e6) || files[2];
console.log("═".repeat(70));
console.log("  全字段深度诊断 · " + target.n.substring(0, 8) + "... (" + kb(target.sz) + ")");
console.log("═".repeat(70));

const ct = fs.readFileSync(path.join(PB_DIR, target.n));
const pt = decrypt(ct, key);

// L0: 找所有 step (fn=2)
const d0 = scanFlat(pt, 0, pt.length);
const steps = d0.filter(x => x.fn === 2 && x.len > 50);
console.log("L0字段统计:");
const l0map = {};
for (const f of d0) { l0map[f.fn] = (l0map[f.fn] || 0) + 1; }
console.log("  " + Object.entries(l0map).sort((a,b)=>a[0]-b[0]).map(([k,v])=>`fn${k}×${v}`).join("  "));
console.log("  步骤数(fn=2>50B): " + steps.length);
console.log();

// 取第1、中间、最后3个step深度分析
const sampleSteps = [steps[0], steps[Math.floor(steps.length / 2)], steps[steps.length - 1]].filter(Boolean);

// 全局字段文本统计 (跨所有step)
const fnStats = {}; // fn => { count, totalLen, textLen, sample }

console.log("─".repeat(70));
console.log("  全量扫描所有 " + steps.length + " 个step · 统计各fn文本含量");
console.log("─".repeat(70));

let scanned = 0;
for (const step of steps) {
  const d1 = scanFlat(pt, step.off, step.off + step.len);
  for (const f of d1) {
    if (f.wt !== 2 || f.len < 4) continue;
    if (!fnStats[f.fn]) fnStats[f.fn] = { count: 0, totalLen: 0, textLen: 0, samples: [], scoreSum: 0 };
    const st = fnStats[f.fn];
    st.count++;
    st.totalLen += f.len;
    const score = textScore(pt.slice(f.off, Math.min(f.off + 500, f.off + f.len)));
    st.scoreSum += score;
    if (score >= 40 && f.len >= 20) {
      const txt = cleanText(pt.slice(f.off, f.off + f.len), 120);
      st.textLen += txt.length;
      if (st.samples.length < 2 && txt.length > 20) st.samples.push(txt);
    }
  }
  // depth=2: 深入 fn=2 内部的子消息
  for (const f of d1) {
    if (f.wt !== 2 || f.len < 20 || f.len > 200000) continue;
    const d2 = scanFlat(pt, f.off, f.off + f.len);
    for (const f2 of d2) {
      if (f2.wt !== 2 || f2.len < 4) continue;
      const key2 = `${f.fn}.${f2.fn}`;
      if (!fnStats[key2]) fnStats[key2] = { count: 0, totalLen: 0, textLen: 0, samples: [], scoreSum: 0, depth: 2 };
      const st = fnStats[key2];
      st.count++;
      st.totalLen += f2.len;
      const score = textScore(pt.slice(f2.off, Math.min(f2.off + 500, f2.off + f2.len)));
      st.scoreSum += score;
      if (score >= 50 && f2.len >= 20) {
        const txt = cleanText(pt.slice(f2.off, f2.off + f2.len), 120);
        st.textLen += txt.length;
        if (st.samples.length < 1 && txt.length > 20) st.samples.push(txt);
      }
    }
  }
  scanned++;
}

// 输出统计 · 按文本含量降序
console.log("\n字段文本含量排名 (textLen>0, 按总文本量降序):");
console.log("  fn         count  totalSize  textLen  avgScore  样本");
console.log("  " + "─".repeat(66));
const sorted = Object.entries(fnStats)
  .filter(([, v]) => v.textLen > 0 || v.scoreSum / v.count > 30)
  .sort((a, b) => b[1].textLen - a[1].textLen);

for (const [fn, st] of sorted) {
  const avgScore = Math.round(st.scoreSum / st.count);
  const sample = st.samples[0] ? st.samples[0].replace(/\n/g, "↵").substring(0, 60) : "-";
  console.log(`  fn=${fn.padEnd(6)} ×${String(st.count).padStart(5)}  ${kb(st.totalLen).padStart(9)}  ${kb(st.textLen).padStart(7)}  score=${avgScore.toString().padStart(3)}  "${sample}"`);
}

console.log("\n\n═".repeat(70));
console.log("  深度样本分析 · 前3个step · 所有字段内容");
console.log("═".repeat(70));

for (let si = 0; si < sampleSteps.length; si++) {
  const step = sampleSteps[si];
  console.log(`\n[Step样本 ${si+1}] off=${step.off} len=${kb(step.len)}`);
  const d1 = scanFlat(pt, step.off, step.off + step.len);
  const byFn = {};
  for (const f of d1) {
    if (f.wt !== 2) continue;
    if (!byFn[f.fn]) byFn[f.fn] = [];
    byFn[f.fn].push(f);
  }
  for (const [fn, fields] of Object.entries(byFn).sort((a,b) => a[0]-b[0])) {
    const totalLen = fields.reduce((s,f) => s+f.len, 0);
    const bestScore = Math.max(...fields.map(f => textScore(pt.slice(f.off, Math.min(f.off+500, f.off+f.len)))));
    if (bestScore < 30 && totalLen < 1000) continue;
    const bestField = fields.reduce((best, f) => {
      const s = textScore(pt.slice(f.off, Math.min(f.off+500, f.off+f.len)));
      return s > (best.score||0) ? {...f, score:s} : best;
    }, {score:0});
    const sample = bestScore >= 30 ? '"' + cleanText(pt.slice(bestField.off, bestField.off+bestField.len), 150).replace(/\n/g,"↵") + '"' : "(binary)";
    console.log(`  fn=${fn.padEnd(4)} ×${fields.length} ${kb(totalLen).padStart(8)}  score=${bestScore}  ${sample.substring(0,120)}`);
  }
}

console.log("\n\n═".repeat(70));
console.log("  L0 所有字段摘要 (fn=2以外)");
console.log("═".repeat(70));
const nonStepFields = d0.filter(f => f.fn !== 2 && f.wt === 2 && f.len >= 10);
const nsfMap = {};
for (const f of nonStepFields) {
  if (!nsfMap[f.fn]) nsfMap[f.fn] = [];
  nsfMap[f.fn].push(f);
}
for (const [fn, fields] of Object.entries(nsfMap).sort((a,b)=>a[0]-b[0])) {
  const totalLen = fields.reduce((s,f)=>s+f.len,0);
  const best = fields.reduce((b,f)=>{const s=textScore(pt.slice(f.off,Math.min(f.off+500,f.off+f.len)));return s>b.score?{...f,score:s}:b},{score:0});
  const sample = best.score >= 30 ? '"'+cleanText(pt.slice(best.off,best.off+best.len),100).replace(/\n/g,"↵")+'"' : "(binary/proto)";
  console.log(`  fn=${fn.padEnd(4)} ×${fields.length} ${kb(totalLen).padStart(9)}  score=${best.score}  ${sample.substring(0,100)}`);
}

console.log("\n诊断完成");
