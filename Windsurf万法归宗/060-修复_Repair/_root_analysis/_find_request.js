"use strict";
const fs = require("fs");
const ext = "C:\\Users\\zhouyoukang\\AppData\\Local\\DaoCascadeBare\\extensions\\dao-agi.windsurf-dao-0.2.0\\dist\\extension.js";
const text = fs.readFileSync(ext, "utf8");

// Find all "exa.chat_pb.*" typeName declarations
const re = /typeName="(exa\.chat_pb\.[A-Za-z_]+)"/g;
let m;
const types = new Set();
while ((m = re.exec(text)) !== null) {
  types.add(m[1]);
}
console.log("All exa.chat_pb.* types found:");
for (const t of [...types].sort()) {
  console.log("  " + t);
}

// We're looking for a type that has 'metadata' as a required field
// Likely candidates: ChatMessageRequest, Request, RawChatMessage
console.log("\n");
for (const tn of [...types]) {
  const idx = text.indexOf('typeName="' + tn + '"');
  if (idx < 0) continue;
  const flStart = text.indexOf("newFieldList", idx);
  if (flStart < 0 || flStart - idx > 1500) continue;
  const arrStart = text.indexOf("[", flStart);
  let depth = 0; let i = arrStart;
  for (; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") { depth--; if (depth === 0) break; }
  }
  const fields = text.substring(arrStart, i+1);
  if (fields.includes('"metadata"')) {
    console.log("HAS metadata: " + tn);
    console.log("  " + fields);
    console.log("");
  }
}
