/**
 * 对实际 Windsurf 安装应用 cascade tabs 修复补丁
 * 目标: E:\Windsurf\resources\app\out\vs\sessions\sessions.desktop.main.js
 */
const fs = require('fs');

const TARGET = String.raw`E:\Windsurf\resources\app\out\vs\sessions\sessions.desktop.main.js`;
const BACKUP = TARGET + '.bak_cascade_fix';

if (!fs.existsSync(TARGET)) {
  console.error('❌ 目标文件不存在: ' + TARGET);
  process.exit(1);
}

let content = fs.readFileSync(TARGET, 'utf-8');
console.log(`文件大小: ${content.length} 字符`);

// 检查是否已打过补丁
if (content.includes('cascade-tabs-fix-A')) {
  console.log('⚠️  补丁已存在，无需重复应用');
  process.exit(0);
}

// Fix A: initializeForWorkspace 早期返回弱化
// 原: 只要 workspaceKey 匹配就跳过 → 可能跳过了本应从 localStorage 恢复的时机
// 新: 仅当 Redux 已有 cascade tabs 或 localStorage 也没有时才跳过
const FIX_A_OLD = `if(m.workspaceKey===u)return;`;
const FIX_A_NEW = `if(m.workspaceKey===u&&(m.tabs.some(A=>A.type==="cascade"||A.type==="acp")||!VMt()[u]?.tabs?.some(A=>A.type==="cascade"||A.type==="acp")))return;/* cascade-tabs-fix-A */`;

// Fix B: attemptOrphanRecovery else 分支保护
// 原: 找不到 orphan 时无条件 b8(m) → 用空 tabs 覆盖 localStorage 中有效数据
// 新: 仅当 localStorage 中本就没有 cascade tabs 时才保存
const FIX_B_OLD = `}else b8(m)},migrateFromLegacyKey:`;
const FIX_B_NEW = `}else{const _ex=VMt()[m.workspaceKey];if(!_ex?.tabs?.some(O=>O.type==="cascade"||O.type==="acp"))b8(m)}/* cascade-tabs-fix-B */},migrateFromLegacyKey:`;

const idxA = content.indexOf(FIX_A_OLD);
const idxB = content.indexOf(FIX_B_OLD);

console.log(`Fix A 目标: ${idxA >= 0 ? '✓ @ ' + idxA : '❌ 未找到'}`);
console.log(`Fix B 目标: ${idxB >= 0 ? '✓ @ ' + idxB : '❌ 未找到'}`);

if (idxA < 0 || idxB < 0) {
  console.error('❌ 补丁目标未找到，放弃');
  process.exit(1);
}

// 备份
console.log(`\n备份 → ${BACKUP}`);
fs.copyFileSync(TARGET, BACKUP);

// 应用
content = content.replace(FIX_A_OLD, FIX_A_NEW);
content = content.replace(FIX_B_OLD, FIX_B_NEW);

fs.writeFileSync(TARGET, content, 'utf-8');

// 验证
const v = fs.readFileSync(TARGET, 'utf-8');
const okA = v.includes('cascade-tabs-fix-A');
const okB = v.includes('cascade-tabs-fix-B');

console.log(`\n验证: Fix A ${okA ? '✓' : '❌'}  Fix B ${okB ? '✓' : '❌'}`);
if (okA && okB) {
  console.log('\n✅ 实际 Windsurf 安装补丁成功！');
  console.log('重启 Windsurf 后 cascade tabs 将正确恢复。');
} else {
  console.error('❌ 验证失败');
  process.exit(1);
}
