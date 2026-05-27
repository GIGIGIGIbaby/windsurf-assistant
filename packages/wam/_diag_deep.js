// _diag_deep.js · Deep PB structure analysis for comprehensive text extraction
"use strict";
const crypto = require("crypto"), fs = require("fs"), path = require("path"), os = require("os");
const KEY_CACHE = path.join(os.homedir(), ".wam", "_cascade_key.json");

function loadKey() {
  try { const c = JSON.parse(fs.readFileSync(KEY_CACHE, "utf8")); if (c.key && c.key.length === 32) return Buffer.from(c.key, "ascii"); } catch {} return null;
}
function decrypt(ct, key) {
  const nonce = ct.slice(0, 12), ctTag = ct.slice(12), tag = ctTag.slice(ctTag.length - 16), body = ctTag.slice(0, ctTag.length - 16);
  const d = crypto.createDecipheriv("aes-256-gcm", key, nonce); d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]);
}
function readVarint(buf, pos) {
  let v = 0, s = 0;
  while (pos < buf.length) { const b = buf[pos++]; v += (b & 0x7f) * Math.pow(2, s); if (!(b & 0x80)) break; s += 7; if (s > 49) break; }
  return { v: Math.floor(v), pos };
}
function scanLD(buf) {
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
        res.push({ fn, len, off: pos, data: buf.slice(pos, pos + len) }); pos += len;
      } else if (wt === 5) { pos += 4; } else { pos = ts + 1; }
    } catch { pos = ts + 1; }
  }
  return res;
}

const key = loadKey();
if (!key) { console.error("No key"); process.exit(1); }
const pbDir = path.join(os.homedir(), ".codeium", "windsurf", "cascade");
const files = fs.readdirSync(pbDir).filter(f => f.endsWith(".pb")).map(f => ({ name: f, size: fs.statSync(path.join(pbDir, f)).size })).sort((a, b) => b.size - a.size);
const ct = fs.readFileSync(path.join(pbDir, files[0].name));
const pt = decrypt(ct, key);
console.log("File:", files[0].name, Math.round(ct.length / 1024), "KB");

// Search for "The user wants" in the buffer
const searchStr = "The user wants";
const searchBuf = Buffer.from(searchStr, "utf8");
let foundAt = -1;
for (let i = 0; i < Math.min(pt.length, 500000) - searchBuf.length; i++) {
  if (pt.slice(i, i + searchBuf.length).equals(searchBuf)) {
    foundAt = i; break;
  }
}
console.log('"The user wants" found at offset:', foundAt);
if (foundAt >= 0) {
  // Read 1000 chars from that position
  const text = pt.slice(foundAt, foundAt + 2000).toString("utf8");
  const clean = text.replace(/[^\x20-\x7e\u4e00-\u9fff\u3000-\u30ff\uff00-\uffef\u2000-\u206f\n\t]/g, "");
  console.log("Text (500 chars):", clean.substring(0, 500));
  console.log("\n...\n");
}

// Now: search for a Chinese text pattern from user message
const searchCN = Buffer.from("道法自然", "utf8");
let cnFound = [];
for (let i = 0; i < Math.min(pt.length, 2000000); i++) {
  if (pt.slice(i, i + searchCN.length).equals(searchCN)) {
    cnFound.push(i);
    if (cnFound.length >= 3) break;
  }
}
console.log('"道法自然" found at offsets:', cnFound);
if (cnFound.length > 0) {
  // Read context around first occurrence
  const start = Math.max(0, cnFound[0] - 50);
  const text = pt.slice(start, cnFound[0] + 500).toString("utf8");
  const clean = text.replace(/[^\x20-\x7e\u4e00-\u9fff\u3000-\u30ff\uff00-\uffef\u2000-\u206f\n\t]/g, "");
  console.log("Context:", clean.substring(0, 400));
}

// KEY INSIGHT: Test extracting fn=20 by getting the STEP OFFSET correctly
// The field at d=0 fn=2 contains the step. Inside, fn=20 is the AI thinking.
// Let's get fn=20 from the global _protoFields scan (matching the extension.js approach)
function protoFields(buf, depth, maxDepth) {
  if (depth > maxDepth || buf.length < 2) return [];
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
        const data = buf.slice(pos, pos + len); pos += len;
        if (len >= 4) {
          res.push({ fn, depth, len, data, byteOffset: pos - len });
          const nested = protoFields(data, depth + 1, maxDepth);
          nested.forEach(n => res.push({ ...n, parentFn: fn }));
        }
      } else if (wt === 5) { pos += 4; } else { pos = ts + 1; }
    } catch { pos = ts + 1; }
  }
  return res;
}

// Scan first 100KB to understand fn=20 structure
console.log("\n\n=== Scanning with protoFields (depth 4) - first 100KB ===");
const scanBuf = pt.slice(0, 100 * 1024);
const fields = protoFields(scanBuf, 0, 4);
const fn20fields = fields.filter(f => f.fn === 20 && f.depth === 1);
console.log("fn=20@depth=1 entries:", fn20fields.length);
for (let i = 0; i < Math.min(fn20fields.length, 3); i++) {
  const f = fn20fields[i];
  const str = f.data.toString("utf8");
  const clean = str.replace(/[^\x20-\x7e\u4e00-\u9fff\u3000-\u30ff\uff00-\uffef\u2000-\u206f\n\t]/g, "");
  console.log("\nfn20[" + i + "] len=" + f.len + " cleanLen=" + clean.length + " ratio=" + (clean.length / str.length).toFixed(2));
  console.log("  Text:", clean.substring(0, 300));
}

// Check fn=19@depth=1 (user messages) 
const fn19fields = fields.filter(f => f.fn === 19 && f.depth === 1);
console.log("\n\nfn=19@depth=1 entries:", fn19fields.length);
for (const f of fn19fields.slice(0, 2)) {
  const str = f.data.toString("utf8");
  const clean = str.replace(/[^\x20-\x7e\u4e00-\u9fff\u3000-\u30ff\uff00-\uffef\u2000-\u206f\n\t]/g, "");
  console.log("  fn19 len=" + f.len + " cleanLen=" + clean.length + " ratio=" + (clean.length / str.length).toFixed(2));
  console.log("  Text:", clean.substring(0, 200));
}
