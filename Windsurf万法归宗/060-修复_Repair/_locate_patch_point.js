/**
 * 定位 sessions.desktop.main.js 中的精确补丁位置
 */
const fs = require('fs');
const path = require('path');

const sessionsFile = String.raw`E:\道\道生一\一生二\Windsurf万法归宗\020-逆向_Reverse\_归一\01-WindSurf本体\N-本机快照_E_Windsurf\out\vs\sessions\sessions.desktop.main.js`;

const c = fs.readFileSync(sessionsFile, 'utf-8');
console.log(`文件大小: ${c.length} 字符`);

// 1. 找 initializeForWorkspace reducer 的早期返回
const patches = [
  // 早期返回的确切字符串
  `if(m.workspaceKey===u)return;`,
  `if(m.workspaceKey===u) return;`,
  // b8 保存函数
  `function b8(m){if(!m.workspaceKey)return;`,
  `function b8(m){if(!m.workspaceKey)return`,
  // VMt 读取函数
  `function VMt()`,
  `function Bln(`,
  // initializeForWorkspace 字符串标识
  `initializeForWorkspace`,
  // tVr 动作
  `tVr=`,
];

for (const p of patches) {
  const idx = c.indexOf(p);
  if (idx >= 0) {
    console.log(`\n✓ 找到 "${p.substring(0, 50)}" @ offset ${idx}`);
    console.log(`  上下文: ...${c.substring(Math.max(0, idx - 80), Math.min(c.length, idx + p.length + 120))}...`);
  } else {
    console.log(`\n✗ 未找到: "${p.substring(0, 50)}"`);
  }
}

// 2. 找 b8 的调用位置和完整签名
console.log('\n\n═══ b8 函数定位 ═══');
const b8Matches = [];
let pos = 0;
while (true) {
  const idx = c.indexOf('function b8(', pos);
  if (idx === -1) break;
  b8Matches.push(idx);
  pos = idx + 1;
}
console.log(`b8 函数定义数量: ${b8Matches.length}`);
for (const idx of b8Matches) {
  console.log(`  @ ${idx}: ${c.substring(idx, Math.min(c.length, idx + 200))}`);
}

// 3. 找 initializeForWorkspace reducer 核心逻辑
console.log('\n\n═══ initializeForWorkspace reducer 核心 ═══');
const reducerSearch = 'initializeForWorkspace:';
const ridx = c.indexOf(reducerSearch);
if (ridx >= 0) {
  console.log(`找到 @ ${ridx}:`);
  console.log(c.substring(ridx, Math.min(c.length, ridx + 2000)));
} else {
  // Try with tVr
  const tVrSearch = 'tVr=';
  const tIdx = c.indexOf(tVrSearch);
  if (tIdx >= 0) {
    console.log(`tVr= @ ${tIdx}: ${c.substring(tIdx, tIdx + 200)}`);
  }
}
