/**
 * 修复 Windsurf cascade tabs 重启后丢失问题
 * 
 * 根因分析：
 * 1. initializeForWorkspace: 当 m.workspaceKey===u 时早期返回，
 *    但如果此时 Redux tabs 已被 reset 为 ["new"]，就不会重新从 localStorage 恢复
 * 
 * 2. attemptOrphanRecovery: 在 `else b8(m)` 分支，当没有 orphan 可恢复时，
 *    用当前 m.tabs（可能是 ["new"]）覆盖 localStorage 中有效的 cascade tabs
 *
 * 双重修复：
 * Fix A: initializeForWorkspace 早期返回只在 Redux 已有 cascade tabs 时生效
 * Fix B: attemptOrphanRecovery 的 else 分支保护已有的 cascade tabs 不被覆盖
 */
const fs = require('fs');
const path = require('path');

const SESSIONS_FILE = String.raw`E:\道\道生一\一生二\Windsurf万法归宗\020-逆向_Reverse\_归一\01-WindSurf本体\N-本机快照_E_Windsurf\out\vs\sessions\sessions.desktop.main.js`;
const BACKUP_FILE = SESSIONS_FILE + '.bak_cascade_fix';

// Verify file exists
if (!fs.existsSync(SESSIONS_FILE)) {
  console.error(`❌ 文件不存在: ${SESSIONS_FILE}`);
  process.exit(1);
}

// Read file
console.log('读取 sessions.desktop.main.js...');
let content = fs.readFileSync(SESSIONS_FILE, 'utf-8');
console.log(`文件大小: ${content.length} 字符`);

// ─────────────────────────────────────────────────────────────
// Fix A: initializeForWorkspace 早期返回弱化
// ─────────────────────────────────────────────────────────────
const FIX_A_OLD = `if(m.workspaceKey===u)return;`;
const FIX_A_NEW = `if(m.workspaceKey===u&&(m.tabs.some(A=>A.type==="cascade"||A.type==="acp")||!VMt()[u]?.tabs?.some(A=>A.type==="cascade"||A.type==="acp")))return;/* cascade-tabs-fix-A */`;

// ─────────────────────────────────────────────────────────────
// Fix B: attemptOrphanRecovery 保护已有 cascade tabs
// ─────────────────────────────────────────────────────────────
// The exact end of orphan recovery: "}else b8(m)}"
// We need to find it in context to avoid false matches
const FIX_B_OLD = `}else b8(m)},migrateFromLegacyKey:`;
const FIX_B_NEW = `}else{const _existing=VMt()[m.workspaceKey];if(!_existing?.tabs?.some(O=>O.type==="cascade"||O.type==="acp"))b8(m)}/* cascade-tabs-fix-B */},migrateFromLegacyKey:`;

// ─────────────────────────────────────────────────────────────
// Verify patches exist
// ─────────────────────────────────────────────────────────────
console.log('\n验证补丁目标...');

const idxA = content.indexOf(FIX_A_OLD);
const idxB = content.indexOf(FIX_B_OLD);

if (idxA < 0) {
  console.error(`❌ Fix A 目标未找到: "${FIX_A_OLD}"`);
  
  // Try to find nearby
  const nearby = content.indexOf('m.workspaceKey===u');
  if (nearby >= 0) {
    console.log(`  找到 m.workspaceKey===u @ ${nearby}: ${content.substring(nearby-20, nearby+60)}`);
  }
}
if (idxB < 0) {
  console.error(`❌ Fix B 目标未找到: "${FIX_B_OLD}"`);
  
  // Show the actual end of attemptOrphanRecovery
  const orphan = content.indexOf('attemptOrphanRecovery:');
  if (orphan >= 0) {
    const end = content.indexOf('},migrateFromLegacyKey:', orphan);
    if (end >= 0) {
      console.log(`  attemptOrphanRecovery 结尾 @ ${end}: ${content.substring(end-100, end+60)}`);
    }
  }
}

if (idxA < 0 || idxB < 0) {
  console.error('\n❌ 无法应用补丁，请检查上述错误');
  process.exit(1);
}

console.log(`✓ Fix A 目标找到 @ offset ${idxA}`);
console.log(`✓ Fix B 目标找到 @ offset ${idxB}`);

// Check if already patched
if (content.includes('cascade-tabs-fix-A') || content.includes('cascade-tabs-fix-B')) {
  console.log('\n⚠️  补丁已经应用过了！跳过...');
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────
// Backup original
// ─────────────────────────────────────────────────────────────
console.log(`\n备份原始文件到: ${BACKUP_FILE}`);
fs.copyFileSync(SESSIONS_FILE, BACKUP_FILE);
console.log('✓ 备份完成');

// ─────────────────────────────────────────────────────────────
// Apply patches
// ─────────────────────────────────────────────────────────────
console.log('\n应用补丁...');

content = content.replace(FIX_A_OLD, FIX_A_NEW);
console.log('✓ Fix A 应用: initializeForWorkspace 早期返回弱化');

content = content.replace(FIX_B_OLD, FIX_B_NEW);
console.log('✓ Fix B 应用: attemptOrphanRecovery 保护已有 cascade tabs');

// ─────────────────────────────────────────────────────────────
// Write patched file
// ─────────────────────────────────────────────────────────────
console.log('\n写入补丁后文件...');
fs.writeFileSync(SESSIONS_FILE, content, 'utf-8');
console.log('✓ 补丁写入完成');

// Verify
const verify = fs.readFileSync(SESSIONS_FILE, 'utf-8');
const hasA = verify.includes('cascade-tabs-fix-A');
const hasB = verify.includes('cascade-tabs-fix-B');
console.log(`\n验证: Fix A ${hasA ? '✓' : '❌'}  Fix B ${hasB ? '✓' : '❌'}`);

if (hasA && hasB) {
  console.log('\n✅ 补丁应用成功！');
  console.log('\n效果:');
  console.log('  Fix A: 当 Redux tabs 已被 reset 且 localStorage 有 cascade tabs 时，重新恢复');
  console.log('  Fix B: orphan 恢复失败时，不覆盖 localStorage 中已有的 cascade tabs');
  console.log('\n下次重启 Windsurf 后，cascade tabs 应正确恢复。');
} else {
  console.error('\n❌ 补丁验证失败，请检查文件');
}
