/**
 * 查找 shutdown 时可能 reset tabs 的代码路径
 * 以及 openSessionsList slice 的所有 reducers
 */
const fs = require('fs');
const sessionsFile = String.raw`E:\道\道生一\一生二\Windsurf万法归宗\020-逆向_Reverse\_归一\01-WindSurf本体\N-本机快照_E_Windsurf\out\vs\sessions\sessions.desktop.main.js`;
const c = fs.readFileSync(sessionsFile, 'utf-8');

// Find the FULL openSessionsList slice reducers
const sliceIdx = c.indexOf('m8({name:"openSessionsList"');
if (sliceIdx < 0) {
  console.log('找不到 openSessionsList slice');
} else {
  console.log(`openSessionsList slice @ ${sliceIdx}:`);
  // Find the end of the reducers object
  let depth = 0, start = sliceIdx + c.indexOf('{', sliceIdx - sliceIdx + 30), end = -1;
  // Actually just show 4000 chars
  console.log(c.substring(sliceIdx, Math.min(c.length, sliceIdx + 3000)));
}

// Find all actions that might reset tabs
console.log('\n\n═══ 搜索 tabs 重置相关的 reducer ═══');
const resetPatterns = [
  'tabs:[{type:"new"',
  'tabs:[{type:\'new\'',
  '.tabs=A.tabs',
  '.tabs=D.tabs', 
  'wii()',
  'resetOpenSessionsList',
  'resetTabs',
  'clearTabs',
  'openNewTab',
];

for (const p of resetPatterns) {
  let pos = 16100000;
  let count = 0;
  while (count < 5) {
    const idx = c.indexOf(p, pos);
    if (idx < 0 || idx > 16300000) break;
    count++;
    const ctx = c.substring(Math.max(0, idx - 60), Math.min(c.length, idx + 120));
    console.log(`  "${p}" @ ${idx}: ${ctx.replace(/\n/g, ' ')}`);
    pos = idx + 1;
  }
}

// Find beforeunload usage
console.log('\n\n═══ beforeunload / onWillSaveState 用法 ═══');
const buPatterns = ['beforeunload', 'onWillSaveState', 'willShutdown'];
for (const p of buPatterns) {
  let pos = 16000000;
  let count = 0;
  while (count < 3) {
    const idx = c.indexOf(p, pos);
    if (idx < 0 || idx > 16500000) break;
    count++;
    const ctx = c.substring(Math.max(0, idx - 80), Math.min(c.length, idx + 150));
    console.log(`  "${p}" @ ${idx}: ${ctx.replace(/\n/g, ' ')}`);
    pos = idx + 1;
  }
}

// Check if there's a "reset" action in the slice
console.log('\n\n═══ vbo.actions 所有 action 名称 ═══');
const actIdx = c.indexOf('vbo=m8({name:"openSessionsList"');
if (actIdx >= 0) {
  const slice = c.substring(actIdx, Math.min(c.length, actIdx + 5000));
  const actionNames = [...slice.matchAll(/(\w+):\s*\(m,l\)=>/g)];
  actionNames.forEach(m => console.log(`  action: ${m[1]}`));
}
