#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const VENDOR =
  "e:\\道\\道生一\\一生二\\Windsurf万法归宗\\070-插件_Plugins\\020-道VSIX_DaoAgi\\dao-agi\\vendor\\wam\\bundled-origin";
const VERSION_LINE = "17.80.0";
const FILES = ["源.js", "锚.py", "anchor.py", "source.js", "_dao_81.txt"];

const out = [VERSION_LINE];
for (const f of FILES) {
  const fp = path.join(VENDOR, f);
  const buf = fs.readFileSync(fp);
  const h = crypto
    .createHash("sha256")
    .update(buf)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
  out.push(`${f}\tsha256-16=${h}  size=${buf.length}`);
}
const txt = out.join("\n") + "\n";
fs.writeFileSync(path.join(VENDOR, "VERSION"), txt);
console.log("─ VERSION ─");
console.log(txt);
