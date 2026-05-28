/**
 * 诊断脚本：Cascade 对话标签页状态持久化分析
 * 道法自然 · 执今之道以御今之有
 */
const path = require('path');
let Database;
try {
  Database = require('better-sqlite3');
} catch {
  // Try from 110-对话追踪_Trace which has better-sqlite3 installed
  const tracePath = require('path').join(__dirname, '..', '110-对话追踪_Trace', 'node_modules', 'better-sqlite3');
  Database = require(tracePath);
}

const APPDATA = process.env.APPDATA;

// === 1. 全局 state.vscdb ===
const globalDbPath = path.join(APPDATA, 'Windsurf', 'User', 'globalStorage', 'state.vscdb');
console.log('=== 全局 state.vscdb ===');
console.log('路径:', globalDbPath);

const db = new Database(globalDbPath, { readonly: true });

// 列出所有表
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('\n表:', tables.map(t => t.name));

// 查看 ItemTable 中与 cascade / tab / session / conversation 相关的 key
const cascadeKeys = db.prepare("SELECT key FROM ItemTable WHERE key LIKE '%cascade%' OR key LIKE '%Cascade%' OR key LIKE '%session%' OR key LIKE '%tab%'").all();
console.log('\n相关 key 数量:', cascadeKeys.length);
cascadeKeys.forEach(r => console.log('  ', r.key));

// 查看具体的 cascade tab 状态数据
console.log('\n=== 查找 cascade 多标签页状态的 key ===');
const allKeys = db.prepare("SELECT key FROM ItemTable").all();
const interestingKeys = allKeys.filter(r => {
  const k = r.key.toLowerCase();
  return k.includes('cascade') || k.includes('auxiliarybar') || k.includes('panel') || k.includes('windsurf.cascade');
});
console.log('匹配 key 数量:', interestingKeys.length);
interestingKeys.forEach(r => {
  const val = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(r.key);
  const v = val ? val.value : '(null)';
  const preview = typeof v === 'string' && v.length > 300 ? v.substring(0, 300) + '...[truncated]' : v;
  console.log(`\n  KEY: ${r.key}`);
  console.log(`  VAL: ${preview}`);
});

db.close();

// === 2. 当前工作区的 state.vscdb ===
console.log('\n\n=== 工作区 state.vscdb ===');
const wsStorageDir = path.join(APPDATA, 'Windsurf', 'User', 'workspaceStorage');
const fs = require('fs');

if (fs.existsSync(wsStorageDir)) {
  const entries = fs.readdirSync(wsStorageDir);
  console.log('工作区存储目录数量:', entries.length);
  
  // 找到最近修改的工作区
  const wsInfos = entries.map(e => {
    const wsPath = path.join(wsStorageDir, e);
    const jsonPath = path.join(wsPath, 'workspace.json');
    const dbPath = path.join(wsPath, 'state.vscdb');
    let wsJson = null;
    let dbStat = null;
    try { wsJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')); } catch {}
    try { dbStat = fs.statSync(dbPath); } catch {}
    return { name: e, wsJson, dbPath, dbMtime: dbStat ? dbStat.mtime : null, dbExists: !!dbStat };
  }).filter(w => w.dbExists).sort((a, b) => (b.dbMtime || 0) - (a.dbMtime || 0));

  // 显示最近 5 个
  console.log('\n最近 5 个活跃工作区:');
  wsInfos.slice(0, 5).forEach(w => {
    console.log(`  ${w.name}: ${w.dbMtime?.toISOString()} => ${JSON.stringify(w.wsJson)}`);
  });

  // 查找当前工作区 (Windsurf万法归宗)
  const currentWs = wsInfos.find(w => w.wsJson && JSON.stringify(w.wsJson).includes('Windsurf') && JSON.stringify(w.wsJson).includes('E5%BD%92%E5%AE%97'));
  if (!currentWs) {
    // Try another approach
    const currentWs2 = wsInfos.find(w => w.wsJson && (JSON.stringify(w.wsJson).includes('万法归宗') || JSON.stringify(w.wsJson).includes('%E4%B8%87%E6%B3%95%E5%BD%92%E5%AE%97')));
    if (currentWs2) {
      console.log('\n找到当前工作区:', currentWs2.name);
      analyzeWorkspaceDb(currentWs2.dbPath);
    } else {
      // Use the most recent one
      console.log('\n未精确匹配，使用最近活跃的工作区:', wsInfos[0].name);
      console.log('  workspace.json:', JSON.stringify(wsInfos[0].wsJson));
      analyzeWorkspaceDb(wsInfos[0].dbPath);
    }
  } else {
    console.log('\n找到当前工作区:', currentWs.name);
    analyzeWorkspaceDb(currentWs.dbPath);
  }
}

function analyzeWorkspaceDb(dbPath) {
  console.log('数据库路径:', dbPath);
  const wsDb = new Database(dbPath, { readonly: true });
  
  const wsTables = wsDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('表:', wsTables.map(t => t.name));
  
  // 查找与 cascade / tab / session 相关的 key
  const wsAllKeys = wsDb.prepare("SELECT key FROM ItemTable").all();
  console.log('总 key 数量:', wsAllKeys.length);
  
  const wsCascadeKeys = wsAllKeys.filter(r => {
    const k = r.key.toLowerCase();
    return k.includes('cascade') || k.includes('auxiliarybar') || k.includes('session') || k.includes('windsurf');
  });
  
  console.log('\n与 cascade/auxiliarybar/session/windsurf 相关的 key:');
  wsCascadeKeys.forEach(r => {
    const val = wsDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get(r.key);
    const v = val ? val.value : '(null)';
    const preview = typeof v === 'string' && v.length > 500 ? v.substring(0, 500) + '...[truncated, total=' + v.length + ']' : v;
    console.log(`\n  KEY: ${r.key}`);
    console.log(`  VAL: ${preview}`);
  });
  
  // 额外查看 layout 相关
  const layoutKeys = wsAllKeys.filter(r => {
    const k = r.key.toLowerCase();
    return k.includes('layout') || k.includes('viewlet') || k.includes('panel.') || k.includes('views.');
  });
  
  console.log('\n\nlayout/viewlet/panel/views 相关的 key:');
  layoutKeys.forEach(r => {
    const val = wsDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get(r.key);
    const v = val ? val.value : '(null)';
    const preview = typeof v === 'string' && v.length > 300 ? v.substring(0, 300) + '...[truncated, total=' + v.length + ']' : v;
    console.log(`\n  KEY: ${r.key}`);
    console.log(`  VAL: ${preview}`);
  });
  
  wsDb.close();
}
