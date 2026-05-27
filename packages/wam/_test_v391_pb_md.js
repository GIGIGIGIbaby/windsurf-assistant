#!/usr/bin/env node
// v3.9.1 PB→MD 完整性验证 · 反者道之动也 · 无为而无不为
// 验证: fn=20 (AI思考) 提取后 MD 大小与 PB 比率大幅提升
"use strict";
const crypto = require("crypto"), fs = require("fs"), path = require("path"), os = require("os");
const WAM_DIR = path.join(os.homedir(), ".wam");
const PB_DIR = path.join(os.homedir(), ".codeium", "windsurf", "cascade");
const KEY_CACHE = path.join(WAM_DIR, "_cascade_key.json");
const BACKUP_DIR = path.join(WAM_DIR, "conversation_backups");

let pass = 0, fail = 0, issues = [];
function ok(msg) { pass++; console.log("  \u2713 " + (msg || "PASS")); }
function ng(name, e) { fail++; issues.push(name + ": " + e); console.log("  \u2717 FAIL:", e); }
function sep(t) { console.log("\n\u2550\u2550\u2550 " + t + " \u2550\u2550\u2550"); }

// ─── 核心函数 (从 extension.js 提取用于测试) ─────────────────────────────────
function loadKey() {
  try { const c = JSON.parse(fs.readFileSync(KEY_CACHE, "utf8")); if (c.key && c.key.length === 32) return Buffer.from(c.key, "ascii"); } catch {} return null;
}
function decryptPb(ct, key) {
  const nonce = ct.slice(0, 12), ctTag = ct.slice(12);
  const tag = ctTag.slice(ctTag.length - 16), body = ctTag.slice(0, ctTag.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", key, nonce); d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]);
}
function readVarint(buf, pos) {
  let v = 0, s = 0;
  while (pos < buf.length) { const b = buf[pos++]; v += (b & 0x7f) * Math.pow(2, s); if (!(b & 0x80)) break; s += 7; if (s > 49) break; }
  return { v: Math.floor(v), pos };
}
function scanFlat(buf) {
  const res = []; let pos = 0;
  while (pos < buf.length - 1) {
    const ts = pos;
    try {
      const t = readVarint(buf, pos); if (t.v === 0) { pos++; continue; } pos = t.pos;
      const wt = t.v & 7, fn = t.v >>> 3;
      if (wt === 0) { const r = readVarint(buf, pos); pos = r.pos; }
      else if (wt === 1) { pos += 8; }
      else if (wt === 2) {
        const lr = readVarint(buf, pos); pos = lr.pos; const len = lr.v;
        if (len < 0 || pos + len > buf.length) { pos = ts + 1; continue; }
        if (len >= 4) res.push({ fn, len, data: buf.slice(pos, pos + len), byteOffset: pos });
        pos += len;
      } else if (wt === 5) { pos += 4; } else { pos = ts + 1; }
    } catch { pos = ts + 1; }
  }
  return res;
}
function cleanPbText(raw) {
  return raw.replace(/[^\x20-\x7e\u4e00-\u9fff\u3000-\u30ff\uff00-\uffef\u2000-\u206f\n\t]/g, "").trim();
}
function extractBestStringFromMsg(buf) {
  let best = "";
  let pos = 0;
  while (pos < buf.length - 1) {
    const ts = pos;
    try {
      const t = readVarint(buf, pos); if (t.v === 0) { pos++; continue; } pos = t.pos;
      const wt = t.v & 7;
      if (wt === 0) { const r = readVarint(buf, pos); pos = r.pos; }
      else if (wt === 1) { pos += 8; }
      else if (wt === 2) {
        const lr = readVarint(buf, pos); pos = lr.pos; const len = lr.v;
        if (len < 0 || pos + len > buf.length) { pos = ts + 1; continue; }
        const data = buf.slice(pos, pos + len); pos += len;
        if (len >= 15) {
          const s = data.toString("utf8");
          const c = cleanPbText(s);
          if (c.length / Math.max(s.length, 1) < 0.35) continue;
          const urlEncCount = (c.match(/%[0-9A-Fa-f]{2}/g) || []).length;
          if ((urlEncCount * 3) / Math.max(c.length, 1) > 0.08) continue;
          if (c.length > best.length) best = c;
        }
      } else if (wt === 5) { pos += 4; } else { pos = ts + 1; }
    } catch { pos = ts + 1; }
  }
  return best.trim();
}
function extractAiThinkingText(buf) {
  try {
    const str = buf.toString("utf8");
    const cleaned = str.replace(/[^\x20-\x7e\u4e00-\u9fff\u3000-\u30ff\uff00-\uffef\u2000-\u206f\n\t]/g, "");
    const trimmed = cleaned.replace(/[A-Za-z0-9+/=]{60,}$/gm, "").trim();
    if (trimmed.length < 30) return "";
    if (!/[\s\u4e00-\u9fff]/.test(trimmed)) return "";
    return trimmed;
  } catch { return ""; }
}
function extractAiResponseFromTrajectory(buf) {
  try {
    const raw = buf.toString("utf8");
    const re = /CORTEX_STEP_TYPE_PLANNER_RESPONSE\)[):\n\r ]{0,6}([\s\S]+?)(?=\nStep \d+\s*\(|\s*$)/g;
    const parts = []; let m;
    while ((m = re.exec(raw)) !== null) {
      const txt = cleanPbText(m[1]).trim();
      if (txt.length > 30 && !parts.some(p => p.includes(txt.substring(0, 40)))) parts.push(txt);
    }
    return parts.length > 0 ? parts[parts.length - 1] : "";
  } catch { return ""; }
}

// v3.9.1 完整解析函数 (镜像 extension.js · 两层扁平扫描)
function parsePbConversation(pt) {
  const d0 = scanFlat(pt);
  const stepFields = d0.filter(x => x.fn === 2 && x.len > 50);
  const userMsgs = [], aiThinkMsgs = [], aiTrajMsgs = [], models = new Set();
  for (const step of stepFields) {
    const d1 = scanFlat(step.data);
    for (const f of d1) {
      const absOff = step.byteOffset + f.byteOffset;
      if (f.fn === 19 && f.len >= 10) {
        try {
          const text = extractBestStringFromMsg(f.data);
          const meaningful = text.replace(/继续[\s↵]*|^@\[.*?\]\s*/g, "").trim();
          if (text.length >= 5 && meaningful.length >= 5) userMsgs.push({ role: "user", byteOffset: absOff, text });
        } catch {}
      } else if (f.fn === 20 && f.len >= 30) {
        try {
          const text = extractAiThinkingText(f.data);
          if (text.length >= 30) aiThinkMsgs.push({ role: "ai", byteOffset: absOff, text });
        } catch {}
      } else if (f.fn === 72 && f.len >= 100) {
        try {
          const aiText = extractAiResponseFromTrajectory(f.data);
          if (aiText.length > 20) aiTrajMsgs.push({ role: "ai", byteOffset: absOff, text: aiText });
        } catch {}
      }
      if (f.len > 15 && f.len < 5000) {
        try {
          const s = f.data.toString("utf8");
          const ms = s.matchAll(/Model((?:Claude|Gemini|GPT|DeepSeek|Sonnet|Opus|Haiku|Flash)[\s\S]{2,50}?)(?:\x00|\x08|\x12|\x1a|$)/g);
          for (const m of ms) { const cl = cleanPbText(m[1]).trim(); if (cl.length > 3 && cl.length < 60) models.add(cl); }
        } catch {}
      }
    }
  }
  const steps = stepFields.length;
  const allTurns = [...userMsgs, ...aiThinkMsgs, ...aiTrajMsgs].sort((a, b) => a.byteOffset - b.byteOffset);
  const deduped = [];
  for (const turn of allTurns) {
    if (deduped.length > 0) {
      const prev = deduped[deduped.length - 1];
      if (prev.role === turn.role) {
        const short = turn.text.length < prev.text.length ? turn.text : prev.text;
        const long  = turn.text.length < prev.text.length ? prev.text : turn.text;
        if (short.length > 10 && long.includes(short.substring(0, Math.floor(short.length * 0.7)))) {
          deduped[deduped.length - 1] = { ...prev, text: long }; continue;
        }
      }
    }
    deduped.push(turn);
  }
  const userMsgsFinal = deduped.filter(x => x.role === "user");
  return { userMsgs: userMsgsFinal, turns: deduped, models: [...models], steps };
}

function pbToMd(pbPath, meta) {
  const key = loadKey(); if (!key) return null;
  try {
    const ct = fs.readFileSync(pbPath);
    if (ct.length < 29) return null;
    const pt = decryptPb(ct, key);
    const conv = parsePbConversation(pt);
    const uuid = path.basename(pbPath, ".pb");
    const _rawTitle = (meta && meta.title) || "";
    const title = _rawTitle || (conv.userMsgs[0] ? conv.userMsgs[0].text.replace(/[\n\r]+/g, " ").trim().substring(0, 60) : "") || uuid.substring(0, 8);
    const sizeKB = Math.round(ct.length / 1024);
    const ts = (meta && meta.backedUpAt) || new Date().toISOString();
    const turns = (conv.turns && conv.turns.length > 0) ? conv.turns : conv.userMsgs.map(m => ({ ...m, role: "user" }));
    const aiCount = turns.filter(x => x.role === "ai").length;
    const totalTextKB = Math.round(turns.reduce((s, t) => s + t.text.length, 0) / 1024);
    let md = "# " + title.replace(/[#[\]]/g, "") + "\n\n";
    md += "> **UUID**: `" + uuid + "`  \n";
    md += "> **大小**: " + sizeKB + " KB  \n";
    md += "> **时间**: " + ts.substring(0, 19).replace("T", " ") + "  \n";
    if (conv.models.length > 0) md += "> **模型**: " + conv.models.join(" · ") + "  \n";
    md += "> **步骤**: " + conv.steps + " 轮  \n";
    md += "> **用户消息**: " + conv.userMsgs.length + " 条";
    if (aiCount > 0) md += "　**AI响应**: " + aiCount + " 条";
    md += "　**内容**: " + totalTextKB + " KB  \n";
    md += "\n---\n\n";
    if (turns.length === 0) {
      md += "_（未提取到对话内容 — 密钥不匹配或格式变更）_\n";
    } else {
      let uIdx = 0, aIdx = 0;
      turns.forEach((turn, i) => {
        if (turn.role === "user") { uIdx++; md += "## \u{1F464} 用户 " + uIdx + "\n\n"; }
        else { aIdx++; md += "## \u{1F916} AI " + aIdx + "\n\n"; }
        md += turn.text.trim() + "\n\n";
        if (i < turns.length - 1) md += "---\n\n";
      });
    }
    return { md, conv, sizeKB, totalTextKB };
  } catch (e) { return null; }
}

// ═══ 开始测试 ═══════════════════════════════════════════════════════════════
console.log("═══════════════════════════════════════════════════════════════════");
console.log("  v3.9.1 PB→MD 完整性验证 · 反者道之动 · 弱者道之用");
console.log("  时间: " + new Date().toLocaleString("zh-CN"));
console.log("═══════════════════════════════════════════════════════════════════");

const key = loadKey();
if (!key) { console.error("  ✗ 无解密密钥 · 中止测试"); process.exit(1); }
console.log("  ✓ 密钥已加载\n");

// ═══ A. 单文件深度验证 ═══
sep("A. 单文件深度验证 (最大文件)");
const pbFiles = fs.readdirSync(PB_DIR).filter(f => f.endsWith(".pb")).map(f => ({
  name: f, size: fs.statSync(path.join(PB_DIR, f)).size
})).sort((a, b) => b.size - a.size);

console.log("\n[A1] 最大文件解析");
try {
  const big = pbFiles[0];
  console.log("  文件: " + big.name.substring(0, 8) + "... (" + Math.round(big.size / 1024) + " KB)");
  const result = pbToMd(path.join(PB_DIR, big.name), {});
  if (!result) throw new Error("解析返回null");
  console.log("  MD大小: " + Math.round(result.md.length / 1024) + " KB");
  console.log("  文本内容: " + result.totalTextKB + " KB");
  console.log("  用户消息: " + result.conv.userMsgs.length + " 条");
  console.log("  AI响应: " + result.conv.turns.filter(x => x.role === "ai").length + " 条");
  console.log("  步骤: " + result.conv.steps + " 轮");
  console.log("  模型: " + result.conv.models.join(", "));
  const ratio = (result.md.length / big.size * 100).toFixed(2);
  console.log("  提取率: " + ratio + "% (目标 >5%)");
  if (result.md.length < big.size * 0.02) throw new Error("提取率过低: " + ratio + "%");
  ok("大文件解析成功 · 提取率 " + ratio + "%");
} catch (e) { ng("A1", e.message); }

console.log("\n[A2] 中等文件解析");
try {
  const mid = pbFiles[Math.floor(pbFiles.length / 3)];
  const result = pbToMd(path.join(PB_DIR, mid.name), {});
  if (!result) throw new Error("解析返回null");
  const ratio = (result.md.length / mid.size * 100).toFixed(2);
  console.log("  文件: " + mid.name.substring(0, 8) + "... (" + Math.round(mid.size / 1024) + " KB) → MD " + Math.round(result.md.length / 1024) + " KB (" + ratio + "%)");
  ok();
} catch (e) { ng("A2", e.message); }

console.log("\n[A3] 小文件解析");
try {
  const small = pbFiles[pbFiles.length - 2];
  const result = pbToMd(path.join(PB_DIR, small.name), {});
  if (!result) throw new Error("解析返回null");
  console.log("  文件: " + small.name.substring(0, 8) + "... (" + Math.round(small.size / 1024) + " KB) → MD " + Math.round(result.md.length / 1024) + " KB");
  ok();
} catch (e) { ng("A3", e.message); }

// ═══ B. 全量文件扫描 + 对比旧版 ═══
sep("B. 全量文件扫描 (新版 vs 旧版 对比)");
console.log("\n[B1] 全部 " + pbFiles.length + " 个 PB 文件扫描");
let totalPbKB = 0, totalMdKB_new = 0, totalMdKB_old = 0;
let successCount = 0, failCount = 0;
let improvements = [];

for (const pf of pbFiles) {
  try {
    const pbPath = path.join(PB_DIR, pf.name);
    const result = pbToMd(pbPath, {});
    const pbKB = Math.round(pf.size / 1024);
    totalPbKB += pbKB;
    
    if (result) {
      successCount++;
      const mdKB = Math.round(result.md.length / 1024);
      totalMdKB_new += mdKB;
      
      // Check if old MD exists in backup dir
      const latestBackup = fs.readdirSync(BACKUP_DIR).filter(d => d.startsWith("backup_")).sort().reverse()[0];
      if (latestBackup) {
        const oldMdPath = path.join(BACKUP_DIR, latestBackup, pf.name.replace(".pb", ".md"));
        if (fs.existsSync(oldMdPath)) {
          const oldMdKB = Math.round(fs.statSync(oldMdPath).size / 1024);
          totalMdKB_old += oldMdKB;
          if (mdKB > oldMdKB * 1.5) { // >50% improvement
            improvements.push({ name: pf.name.substring(0, 8), oldKB: oldMdKB, newKB: mdKB, ratio: (mdKB / Math.max(oldMdKB, 1)).toFixed(1) });
          }
        }
      }
    } else {
      failCount++;
    }
  } catch { failCount++; }
}

console.log("  成功: " + successCount + " / " + pbFiles.length + " (失败: " + failCount + ")");
console.log("  PB总量: " + Math.round(totalPbKB / 1024) + " MB");
console.log("  新版MD: " + Math.round(totalMdKB_new / 1024) + " MB");
if (totalMdKB_old > 0) {
  console.log("  旧版MD: " + Math.round(totalMdKB_old / 1024) + " MB");
  console.log("  提升: " + (totalMdKB_new / Math.max(totalMdKB_old, 1)).toFixed(1) + "x");
}
console.log("  提取率: " + (totalMdKB_new / totalPbKB * 100).toFixed(2) + "% (旧: " + (totalMdKB_old / totalPbKB * 100).toFixed(2) + "%)");

if (improvements.length > 0) {
  console.log("\n  显著提升的文件 (新/旧 >1.5x):");
  improvements.sort((a, b) => b.newKB - a.newKB).slice(0, 10).forEach(imp => {
    console.log("    " + imp.name + "...: " + imp.oldKB + "KB → " + imp.newKB + "KB (" + imp.ratio + "x)");
  });
}

if (successCount === pbFiles.length) ok("全部文件解析成功");
else if (successCount > pbFiles.length * 0.9) ok("90%+ 文件解析成功");
else ng("B1", "成功率过低: " + successCount + "/" + pbFiles.length);

// ═══ C. 内容质量验证 ═══
sep("C. 内容质量验证 (文本可读性)");

console.log("\n[C1] AI 思考文本质量");
try {
  const testFile = pbFiles.find(f => f.size > 1000000) || pbFiles[0];
  const ct = fs.readFileSync(path.join(PB_DIR, testFile.name));
  const pt = decryptPb(ct, key);
  const d0 = scanFlat(pt);
  const steps = d0.filter(x => x.fn === 2 && x.len > 50);
  const fn20 = [];
  for (const step of steps) {
    const d1 = scanFlat(step.data);
    for (const f of d1) { if (f.fn === 20 && f.len >= 30) fn20.push(f); }
  }
  
  let qualityPass = 0, qualityTotal = fn20.length;
  for (const f of fn20) {
    const text = extractAiThinkingText(f.data);
    if (text.length >= 30) {
      // Quality check: text should contain spaces, not be pure code/hex
      const hasSpaces = (text.match(/ /g) || []).length > text.length * 0.05;
      const hasSentences = /[.!?。！？]/.test(text);
      if (hasSpaces || hasSentences) qualityPass++;
    }
  }
  console.log("  fn=20 fields: " + qualityTotal + " | 高质量: " + qualityPass + " (" + (qualityPass / Math.max(qualityTotal, 1) * 100).toFixed(0) + "%)");
  if (qualityPass / Math.max(qualityTotal, 1) > 0.7) ok("AI思考文本质量良好");
  else ng("C1", "质量不达标: " + qualityPass + "/" + qualityTotal);
} catch (e) { ng("C1", e.message); }

console.log("\n[C2] 用户消息完整性");
try {
  const testFile = pbFiles.find(f => f.size > 500000) || pbFiles[0];
  const result = pbToMd(path.join(PB_DIR, testFile.name), {});
  if (!result) throw new Error("解析失败");
  const userCount = result.conv.userMsgs.length;
  const aiCount = result.conv.turns.filter(x => x.role === "ai").length;
  console.log("  用户消息: " + userCount + " 条");
  console.log("  AI响应: " + aiCount + " 条");
  if (aiCount === 0 && result.conv.steps > 3) throw new Error("有步骤但无AI响应 · fn=20提取可能失败");
  ok("对话结构完整");
} catch (e) { ng("C2", e.message); }

console.log("\n[C3] MD 格式验证");
try {
  const result = pbToMd(path.join(PB_DIR, pbFiles[0].name), { title: "Test Title" });
  if (!result) throw new Error("解析失败");
  const md = result.md;
  const checks = ["# Test Title", "**UUID**", "**大小**", "**步骤**", "**用户消息**", "**AI响应**", "**内容**", "## \u{1F464} 用户", "## \u{1F916} AI"];
  const missing = checks.filter(c => !md.includes(c));
  if (missing.length > 0) throw new Error("MD格式缺失: " + missing.join(", "));
  console.log("  所有格式标记完整 (" + checks.length + "/" + checks.length + ")");
  ok();
} catch (e) { ng("C3", e.message); }

// ═══ D. 导出验证 (实际写入并回读) ═══
sep("D. 导出验证 (实际写入并回读)");

console.log("\n[D1] 写入 + 回读 验证");
const testOutDir = path.join(WAM_DIR, "_test_v391_output");
try {
  fs.mkdirSync(testOutDir, { recursive: true });
  const testPb = pbFiles.find(f => f.size > 100000) || pbFiles[0];
  const outPath = path.join(testOutDir, testPb.name.replace(".pb", ".md"));
  const result = pbToMd(path.join(PB_DIR, testPb.name), {});
  if (!result) throw new Error("解析失败");
  fs.writeFileSync(outPath, result.md, "utf8");
  
  // 回读验证
  const readBack = fs.readFileSync(outPath, "utf8");
  if (readBack.length !== result.md.length) throw new Error("写入/回读长度不一致");
  if (!readBack.includes("# ")) throw new Error("回读内容无标题");
  if (!readBack.includes("## \u{1F464} 用户")) throw new Error("回读内容无用户消息");
  
  const outKB = Math.round(readBack.length / 1024);
  const pbKB = Math.round(testPb.size / 1024);
  console.log("  " + testPb.name.substring(0, 8) + "... PB:" + pbKB + "KB → MD:" + outKB + "KB");
  console.log("  写入+回读: 一致 ✓");
  ok();
} catch (e) { ng("D1", e.message); }

// 清理测试目录
try { fs.rmSync(testOutDir, { recursive: true, force: true }); } catch {}

// ═══ E. 性能测试 ═══
sep("E. 性能测试 (处理速度)");

console.log("\n[E1] 大文件处理时间");
try {
  const bigFile = pbFiles[0];
  const startMs = Date.now();
  const result = pbToMd(path.join(PB_DIR, bigFile.name), {});
  const elapsed = Date.now() - startMs;
  if (!result) throw new Error("解析失败");
  const mbSize = (bigFile.size / 1024 / 1024).toFixed(1);
  console.log("  " + mbSize + " MB → " + elapsed + " ms");
  console.log("  速率: " + (bigFile.size / 1024 / 1024 / (elapsed / 1000)).toFixed(1) + " MB/s");
  if (elapsed > 30000) throw new Error("处理超时 (>30s)");
  ok("处理时间可接受");
} catch (e) { ng("E1", e.message); }

console.log("\n[E2] 批量处理 (10个文件)");
try {
  const batch = pbFiles.slice(0, 10);
  const startMs = Date.now();
  let batchSuccess = 0;
  for (const f of batch) {
    const r = pbToMd(path.join(PB_DIR, f.name), {});
    if (r) batchSuccess++;
  }
  const elapsed = Date.now() - startMs;
  console.log("  10个文件: " + elapsed + " ms (" + batchSuccess + "/10 成功)");
  console.log("  平均: " + (elapsed / 10).toFixed(0) + " ms/文件");
  ok();
} catch (e) { ng("E2", e.message); }

// ═══ 总结 ═══
console.log("\n═══════════════════════════════════════════════════════════════════");
console.log("  结果: " + pass + " PASS / " + fail + " FAIL");
if (issues.length) {
  console.log("  ── 问题列表 ──");
  issues.forEach(i => console.log("  ✗ " + i));
}
console.log("═══════════════════════════════════════════════════════════════════");
if (fail === 0) console.log("\n✔ 全部通过 · 道法自然 · 无为而无不为\n");
else console.log("\n✗ 有 " + fail + " 个失败 · 需要修复\n");
process.exit(fail > 0 ? 1 : 0);
