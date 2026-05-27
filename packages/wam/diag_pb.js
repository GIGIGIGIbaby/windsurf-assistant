// diag_pb.js · 实证 Windsurf PB proto 字段结构 · v1.0
// 用法: node diag_pb.js [path-to.pb]
// 目的: 发现 AI 响应字段编号 · 确认完整对话结构
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ─── 解密 ───────────────────────────────────────────────────────────────────
const KEY_CACHE = path.join(os.homedir(), ".wam", "_cascade_key.json");
function loadKey() {
  try {
    const c = JSON.parse(fs.readFileSync(KEY_CACHE, "utf8"));
    if (c.key && c.key.length === 32) return Buffer.from(c.key, "ascii");
  } catch {}
  return null;
}
function decrypt(ct, key) {
  const nonce = ct.slice(0, 12);
  const ctTag = ct.slice(12);
  const tag = ctTag.slice(ctTag.length - 16);
  const body = ctTag.slice(0, ctTag.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]);
}

// ─── Varint ──────────────────────────────────────────────────────────────────
function readVarint(buf, pos) {
  let v = 0, s = 0;
  while (pos < buf.length) {
    const b = buf[pos++];
    v += (b & 0x7f) * Math.pow(2, s);
    if (!(b & 0x80)) break;
    s += 7;
    if (s > 49) break;
  }
  return { v: Math.floor(v), pos };
}

// ─── 文本清洗 ────────────────────────────────────────────────────────────────
function cleanText(raw) {
  return raw.replace(/[^\x20-\x7e\u4e00-\u9fff\u3000-\u30ff\uff00-\uffef\u2000-\u206f\n\t]/g, "").trim();
}

// ─── 从 proto 子消息提取最长字符串字段 ──────────────────────────────────────
function extractBestString(buf) {
  let best = "";
  let pos = 0;
  while (pos < buf.length - 1) {
    const ts = pos;
    try {
      const t = readVarint(buf, pos);
      if (t.v === 0) { pos++; continue; }
      pos = t.pos;
      const wt = t.v & 7;
      if (wt === 0) { const r = readVarint(buf, pos); pos = r.pos; }
      else if (wt === 1) { pos += 8; }
      else if (wt === 2) {
        const lr = readVarint(buf, pos); pos = lr.pos;
        const len = lr.v;
        if (len < 0 || pos + len > buf.length) { pos = ts + 1; continue; }
        const data = buf.slice(pos, pos + len); pos += len;
        if (len >= 5) {
          const s = data.toString("utf8");
          const c = cleanText(s);
          const ratio = c.length / Math.max(s.length, 1);
          if (ratio > 0.4 && c.length > best.length) best = c;
        }
      } else if (wt === 5) { pos += 4; }
      else { pos = ts + 1; }
    } catch { pos = ts + 1; }
  }
  return best;
}

// ─── 递归 proto 字段扫描 + 打印结构 ─────────────────────────────────────────
const SEEN = new Set(); // 去重相同内容的大字段
function dumpFields(buf, depth, maxDepth, baseOffset) {
  if (depth > maxDepth) return;
  const ind = "  ".repeat(depth);
  let pos = 0;
  while (pos < buf.length - 1) {
    const ts = pos;
    const absOff = baseOffset + pos;
    try {
      const t = readVarint(buf, pos);
      if (t.v === 0) { pos++; continue; }
      pos = t.pos;
      const wt = t.v & 7, fn = t.v >>> 3;
      if (wt === 0) {
        const r = readVarint(buf, pos);
        console.log(`${ind}[d${depth}|fn${fn}|varint] = ${r.v}  @${absOff}`);
        pos = r.pos;
      } else if (wt === 1) {
        console.log(`${ind}[d${depth}|fn${fn}|64bit]  @${absOff}`);
        pos += 8;
      } else if (wt === 2) {
        const lr = readVarint(buf, pos); pos = lr.pos;
        const len = lr.v;
        if (len < 0 || pos + len > buf.length) { pos = ts + 1; continue; }
        const data = buf.slice(pos, pos + len);
        const dataOff = baseOffset + pos; pos += len;

        // 分析内容类型
        const raw = data.toString("utf8");
        const clean = cleanText(raw);
        const ratio = clean.length / Math.max(raw.length, 1);
        const isText = ratio > 0.4 && clean.length >= 10;
        const preview = clean.substring(0, 100).replace(/\n/g, "↵");
        const tag = isText ? "TEXT" : "BIN ";

        // 从子消息中提取最好的文本（用于BIN类型）
        const subStr = !isText && len >= 4 ? extractBestString(data) : "";
        const subPreview = subStr ? ` → "${subStr.substring(0, 80).replace(/\n/g, "↵")}"` : "";

        // 打印当前字段
        if (!SEEN.has(clean.substring(0, 50)) || len < 200) {
          console.log(`${ind}[d${depth}|fn${fn}|LD|len=${len}] ${tag} @${dataOff}  "${preview}"${subPreview}`);
          if (isText && clean.length > 10) SEEN.add(clean.substring(0, 50));
        }

        // 递归
        if (len >= 4 && depth < maxDepth) {
          dumpFields(data, depth + 1, maxDepth, dataOff);
        }
      } else if (wt === 5) {
        console.log(`${ind}[d${depth}|fn${fn}|32bit]  @${absOff}`);
        pos += 4;
      } else { pos = ts + 1; }
    } catch { pos = ts + 1; }
  }
}

// ─── 主程序 ──────────────────────────────────────────────────────────────────
const pbPath = process.argv[2];
if (!pbPath) {
  console.error("用法: node diag_pb.js <path-to.pb>");
  process.exit(1);
}
const key = loadKey();
if (!key) { console.error("无解密密钥"); process.exit(1); }

const ct = fs.readFileSync(pbPath);
console.log(`PB: ${pbPath}`);
console.log(`加密大小: ${ct.length} B  (${(ct.length/1024).toFixed(1)} KB)`);
const pt = decrypt(ct, key);
console.log(`解密大小: ${pt.length} B  (${(pt.length/1024).toFixed(1)} KB)`);
console.log("=".repeat(90));
console.log("扫描前 400KB 以找出对话结构...\n");

// 只扫前 400KB (对话内容在开头)
const scanBuf = pt.slice(0, Math.min(pt.length, 400 * 1024));
dumpFields(scanBuf, 0, 3, 0);
