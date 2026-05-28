/**
 * 定位 Ait() 函数 - 这是过滤 acp tabs 的关键函数
 * 如果 ACP 服务在启动时未初始化，Ait() 返回 false → 所有 acp tabs 被过滤 → localStorage 被覆盖为空
 */
const fs = require('fs');
const sessionsFile = String.raw`E:\道\道生一\一生二\Windsurf万法归宗\020-逆向_Reverse\_归一\01-WindSurf本体\N-本机快照_E_Windsurf\out\vs\sessions\sessions.desktop.main.js`;
const c = fs.readFileSync(sessionsFile, 'utf-8');

// Find Ait function definition
const searches = ['function Ait(', 'Ait=(', 'Ait=function', 'Ait=m=>', 'Ait=l=>'];
let aitIdx = -1;
for (const s of searches) {
  const idx = c.indexOf(s);
  if (idx >= 0) {
    aitIdx = idx;
    console.log(`✓ Ait 定义 "${s}" @ ${idx}:`);
    console.log(c.substring(idx, Math.min(c.length, idx + 800)));
    console.log('');
    break;
  }
}
if (aitIdx === -1) {
  // Search for all occurrences of Ait(
  let pos = 0, count = 0;
  while (pos < c.length && count < 10) {
    const idx = c.indexOf('Ait(', pos);
    if (idx === -1) break;
    console.log(`  Ait( @ ${idx}: ${c.substring(Math.max(0,idx-50), idx+100)}`);
    pos = idx + 1; count++;
  }
}

// Also check what types of tabs are stored in localStorage right now
console.log('\n\n═══ 读取当前 localStorage 中的 tab 类型 ═══');
const path = require('path');
const leveldbDir = path.join(process.env.APPDATA, 'Windsurf', 'Local Storage', 'leveldb');
const files = fs.readdirSync(leveldbDir);
const KEY = 'cascade-open-sessions-by-workspace';
const keyBuf = Buffer.from(KEY);

for (const f of files.filter(x => x.endsWith('.log'))) {
  const buf = fs.readFileSync(path.join(leveldbDir, f));
  const idx = buf.indexOf(keyBuf);
  if (idx < 0) continue;
  const after = buf.slice(idx + keyBuf.length, idx + keyBuf.length + 10000);
  let jsonStart = -1;
  for (let i = 0; i < 50; i++) {
    if (after[i] === 0x7B) { jsonStart = i; break; }
  }
  if (jsonStart < 0) continue;
  try {
    const jsonStr = after.slice(jsonStart).toString('utf-8');
    const end = jsonStr.indexOf('\x00\x00\x00');
    const clean = (end > 0 ? jsonStr.substring(0, end) : jsonStr.substring(0, 8000)).trim();
    const data = JSON.parse(clean.match(/^(\{.*\}|\[.*\])/s)?.[0] || clean);
    for (const [ws, wsData] of Object.entries(data)) {
      console.log(`\n工作区: ${ws}`);
      (wsData.tabs || []).forEach((t, i) => {
        console.log(`  tab[${i}]: type=${t.type}, id=${t.id?.substring(0,20) || 'n/a'}`);
      });
    }
  } catch(e) { console.log(`解析失败: ${e.message}`); }
}

// Find what Ait checks - look for its usage context
console.log('\n\n═══ Ait 检测的逻辑 (前后文) ═══');
const iiiFull = c.substring(16149277, 16149277 + 100);
console.log('Iii函数:', iiiFull);

// Search nearby for Ait definition (it should be near Iii)
const nearIii = c.substring(Math.max(0, 16149277 - 3000), 16149277);
const aitInNear = nearIii.lastIndexOf('Ait');
if (aitInNear >= 0) {
  const absAit = 16149277 - 3000 + aitInNear;
  // go back to find full function
  const lookback = c.substring(Math.max(0, absAit - 500), absAit + 200);
  const funcDef = lookback.lastIndexOf('function');
  if (funcDef >= 0) {
    const absFunc = absAit - 500 + funcDef;
    console.log(`\n靠近 Iii 的 Ait 相关函数 @ ${absFunc}:`);
    console.log(c.substring(absFunc, Math.min(c.length, absFunc + 300)));
  }
}
