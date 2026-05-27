// 反者道之动 · accounts.md 审视器
// 统计可用 / 不可用 · 分组 · 看后半批量
const fs = require("fs");
const path = require("path");
const os = require("os");

const p = path.join(os.homedir(), ".wam", "accounts.md");
const text = fs.readFileSync(p, "utf8");
const allLines = text.split(/\r?\n/);

const accounts = [];
allLines.forEach((line, idx) => {
  const t = line.trim();
  if (!t || !t.includes("@") || !t.includes(" ")) return;
  const [mail, pw] = t.split(/\s+/);
  if (!mail || !pw) return;
  accounts.push({ idx: idx + 1, mail, pw, pwLen: pw.length });
});

console.log(`=== ${p} ===`);
console.log(`原文行数: ${allLines.length}`);
console.log(`合法账号行: ${accounts.length}`);

// 按密码前缀分组
const groups = {};
accounts.forEach((a) => {
  const prefix = a.pw.slice(0, 2);
  groups[prefix] = (groups[prefix] || 0) + 1;
});
console.log(`\n=== 密码前缀分布 ===`);
Object.entries(groups)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  ${k}* : ${v}`));

const lj = accounts.filter((a) => a.pw.startsWith("LJ"));
const nonLj = accounts.filter((a) => !a.pw.startsWith("LJ"));

console.log(`\n=== 后半 LJ 批 ===`);
console.log(`LJ-prefix 总数: ${lj.length}`);
console.log(`首个 LJ 在原文第几行: ${lj[0]?.idx}`);
console.log(`末个 LJ 在原文第几行: ${lj[lj.length - 1]?.idx}`);

console.log(`\n=== LJ 批 head 5 ===`);
lj.slice(0, 5).forEach((a, i) => {
  console.log(`  ${i + 1}. line=${a.idx} mail=${a.mail.split("@")[0]}@... pwLen=${a.pwLen}`);
});

console.log(`\n=== LJ 批 tail 5 ===`);
lj.slice(-5).forEach((a, i) => {
  const n = lj.length - 4 + i;
  console.log(`  ${n}. line=${a.idx} mail=${a.mail.split("@")[0]}@... pwLen=${a.pwLen}`);
});

// 写一个出口便于后续脚本用
const outPath = path.join(
  os.homedir(),
  ".wam",
  "accounts_audit.json",
);
const audit = {
  source: p,
  totalLines: allLines.length,
  validAccounts: accounts.length,
  prefixGroups: groups,
  ljBatch: {
    count: lj.length,
    firstLine: lj[0]?.idx,
    lastLine: lj[lj.length - 1]?.idx,
    mails: lj.map((a) => a.mail),
  },
  nonLjCount: nonLj.length,
};
fs.writeFileSync(outPath, JSON.stringify(audit, null, 2));
console.log(`\n=== 写入审计 ===`);
console.log(outPath);
