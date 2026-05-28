"use strict";
const fs = require("fs");
const ext = "C:\\Users\\zhouyoukang\\AppData\\Local\\DaoCascadeBare\\extensions\\dao-agi.windsurf-dao-0.2.0\\dist\\extension.js";
const text = fs.readFileSync(ext, "utf8");

// Find ChatMessage class F
const cmIdx = text.indexOf('typeName="exa.chat_pb.ChatMessage"');
console.log("ChatMessage typeName at:", cmIdx);

// Search backward for "class Z extends i.Message" or any other classes
const window = text.substring(Math.max(0, cmIdx - 50000), cmIdx);

// Scan all "class X extends i.Message ... typeName=..." within window
const re = /class\s+([A-Za-z])\s+extends\s+i\.Message\s*\{[^}]+?\}\s*static\s+runtime[^;]+;\s*static\s+typeName\s*=\s*"(exa\.[^"]+)"/g;
let m;
const map = {};
while ((m = re.exec(window)) !== null) {
  map[m[1]] = m[2];
}
console.log("Classes found in chat_pb area (last", Object.keys(map).length, "):");
for (const [k, v] of Object.entries(map)) {
  console.log("  class " + k + " = " + v);
}

// Specifically look for Z
console.log("\nIs Z found?", "Z" in map);
if ("Z" in map) {
  // Get full proto field defs of Z
  const tnPattern = 'typeName="' + map.Z + '"';
  const idx = text.indexOf(tnPattern);
  if (idx > 0) {
    const flStart = text.indexOf("newFieldList", idx);
    const arrStart = text.indexOf("[", flStart);
    let depth = 0;
    let i = arrStart;
    for (; i < text.length; i++) {
      if (text[i] === "[") depth++;
      else if (text[i] === "]") {
        depth--;
        if (depth === 0) break;
      }
    }
    console.log("Z proto fields:");
    console.log("  " + text.substring(arrStart, i + 1));
  }
}
