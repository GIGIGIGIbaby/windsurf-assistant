/**
 * 找 Dln 前缀值 + 当前 localStorage 中 tab ID 格式
 * Ait(id) = id.startsWith(Dln) - 只保留前缀为 Dln 的 acp tab
 */
const fs = require('fs');
const path = require('path');
const sessionsFile = String.raw`E:\道\道生一\一生二\Windsurf万法归宗\020-逆向_Reverse\_归一\01-WindSurf本体\N-本机快照_E_Windsurf\out\vs\sessions\sessions.desktop.main.js`;
const c = fs.readFileSync(sessionsFile, 'utf-8');

// Find Dln definition
const dlnIdx = c.lastIndexOf('Dln=', 16130539); // look before Ait
if (dlnIdx >= 0) {
  console.log(`Dln 定义 @ ${dlnIdx}:`);
  console.log(c.substring(dlnIdx, dlnIdx + 200));
}

// Also search forward
const dlnIdx2 = c.indexOf('let Dln=', 16120000);
const dlnIdx3 = c.indexOf('var Dln=', 16120000);
const dlnIdx4 = c.indexOf(',Dln=', 16120000);
[dlnIdx2, dlnIdx3, dlnIdx4].filter(x => x > 0 && x < 16135000).forEach(idx => {
  console.log(`\nDln @ ${idx}: ${c.substring(idx, idx + 100)}`);
});

// Also find Tln (used in rbo function nearby)
const tlnIdx = c.lastIndexOf('Tln=', 16130539);
if (tlnIdx >= 0) {
  console.log(`\nTln @ ${tlnIdx}: ${c.substring(tlnIdx, tlnIdx + 100)}`);
}

// Now read CURRENT .ldb files to find tab data (using raw search for "acp/" or similar)
console.log('\n\n═══ 搜索 .ldb 文件中的 tab 数据 (cascade-open-sessions) ═══');
const leveldbDir = path.join(process.env.APPDATA, 'Windsurf', 'Local Storage', 'leveldb');
const files = fs.readdirSync(leveldbDir).filter(f => f.endsWith('.ldb') || f.endsWith('.log'));
console.log('文件:', files.join(', '));

// Read the .log file (uncompressed)  
for (const f of files) {
  const buf = fs.readFileSync(path.join(leveldbDir, f));
  
  // Search for tab ID patterns - look for "acp/" or common cascade session ID formats
  const patterns = [
    Buffer.from('"type":"acp"'),
    Buffer.from('"type":"cascade"'),
    Buffer.from('"type":"new"'),
    Buffer.from('cascade-open-sessions'),
  ];
  
  for (const pat of patterns) {
    const idx = buf.indexOf(pat);
    if (idx >= 0) {
      console.log(`${f}: 找到 "${pat.toString()}" @ ${idx}`);
      // Show surrounding context
      const ctx = buf.slice(Math.max(0, idx - 50), Math.min(buf.length, idx + 200)).toString('utf-8').replace(/\x00/g, '·');
      console.log(`  ${ctx}`);
    }
  }
}

// Also look at the sessions.desktop.main.js for what IDs look like  
console.log('\n\n═══ ACP session ID 格式 ═══');
const acpIdPattern = /["']acp\/[^"']{5,40}["']/g;
const matches = [...c.substring(16100000, 16200000).matchAll(acpIdPattern)];
matches.slice(0, 5).forEach(m => console.log(`  ${m[0]}`));
