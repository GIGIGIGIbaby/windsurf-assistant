/**
 * 诊断脚本3：极深探查 — Cascade 多对话标签页的存储本源
 * 天下之至柔，驰骋于天下之致坚
 */
const path = require('path');
const fs = require('fs');
let Database;
try {
  Database = require('better-sqlite3');
} catch {
  const tracePath = path.join(__dirname, '..', '110-对话追踪_Trace', 'node_modules', 'better-sqlite3');
  Database = require(tracePath);
}

const APPDATA = process.env.APPDATA;

// 当前工作区 ID: b1d4ae41061b5e0db43feaba228276e3 (Windsurf万法归宗)
const CURRENT_WS = 'b1d4ae41061b5e0db43feaba228276e3';
const wsDbPath = path.join(APPDATA, 'Windsurf', 'User', 'workspaceStorage', CURRENT_WS, 'state.vscdb');

console.log('=== 当前工作区 state.vscdb 全量 key 扫描 ===');
console.log('路径:', wsDbPath);
const wsDb = new Database(wsDbPath, { readonly: true });

// 列出所有 key，看完整的存储
const allKeys = wsDb.prepare("SELECT key, length(value) as len FROM ItemTable ORDER BY key").all();
console.log(`\n总 key 数: ${allKeys.length}\n`);
allKeys.forEach(r => {
  console.log(`  [${r.len.toString().padStart(8)}] ${r.key}`);
});

// 找关键的 memento/workbench.auxiliarybar 和 windsurfAgent 相关的值
console.log('\n\n=== workbench.auxiliarybar 全部内容 ===');
const auxKeys = allKeys.filter(r => r.key.includes('auxiliarybar') || r.key.includes('auxiliaryBar') || r.key.includes('AuxiliaryBar'));
auxKeys.forEach(r => {
  const val = wsDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get(r.key);
  console.log(`\nKEY: ${r.key} (${r.len} bytes)`);
  console.log(`VAL: ${val.value}`);
});

// windsurfAgent 完整内容
console.log('\n\n=== windsurfAgent 全部内容 ===');
const agentKeys = allKeys.filter(r => r.key.toLowerCase().includes('windsurfagent'));
agentKeys.forEach(r => {
  const val = wsDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get(r.key);
  const v = val.value;
  const preview = v.length > 2000 ? v.substring(0, 2000) + '...[total=' + v.length + ']' : v;
  console.log(`\nKEY: ${r.key} (${r.len} bytes)`);
  console.log(`VAL: ${preview}`);
});

wsDb.close();

// === 全局 state.vscdb 深入 ===
const globalDbPath = path.join(APPDATA, 'Windsurf', 'User', 'globalStorage', 'state.vscdb');
const globalDb = new Database(globalDbPath, { readonly: true });

// 找 windsurfAgent / cascadeSession / tabGroup 相关的值
console.log('\n\n=== 全局 state.vscdb windsurfAgent / tabGroup / session 搜索 ===');
const globalAll = globalDb.prepare("SELECT key, length(value) as len FROM ItemTable ORDER BY key").all();

const globalInteresting = globalAll.filter(r => {
  const k = r.key.toLowerCase();
  return k.includes('windsurfagent') || k.includes('tabgroup') || k.includes('cascadesession') || 
         k.includes('cascade.tab') || k.includes('editorpart');
});
globalInteresting.forEach(r => {
  const val = globalDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get(r.key);
  const v = val.value;
  const preview = v.length > 2000 ? v.substring(0, 2000) + '...[total=' + v.length + ']' : v;
  console.log(`\nKEY: ${r.key} (${r.len} bytes)`);
  console.log(`VAL: ${preview}`);
});

// 还要搜索value里包含了多个对话标题的
console.log('\n\n=== 搜索值中包含 "Rate Limit" 或 "Context Loss" 或 conversationId 的 key ===');
const titleSearch = globalDb.prepare("SELECT key, length(value) as len FROM ItemTable WHERE value LIKE '%Rate Limit%' OR value LIKE '%Context Loss%' OR value LIKE '%VM Public%' OR value LIKE '%WAM Stuck%'").all();
console.log('匹配数:', titleSearch.length);
titleSearch.forEach(r => {
  const val = globalDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get(r.key);
  const v = val.value;
  const preview = v.length > 1000 ? v.substring(0, 1000) + '...[total=' + v.length + ']' : v;
  console.log(`\nKEY: ${r.key} (${r.len} bytes)`);
  console.log(`VAL: ${preview}`);
});

globalDb.close();

// === 工作区级别也搜索对话标题 ===
const wsDb2 = new Database(wsDbPath, { readonly: true });
console.log('\n\n=== 工作区 state.vscdb 搜索对话标题 ===');
const wsTitleSearch = wsDb2.prepare("SELECT key, length(value) as len FROM ItemTable WHERE value LIKE '%Rate Limit%' OR value LIKE '%Context Loss%' OR value LIKE '%VM Public%' OR value LIKE '%WAM Stuck%'").all();
console.log('匹配数:', wsTitleSearch.length);
wsTitleSearch.forEach(r => {
  const val = wsDb2.prepare("SELECT value FROM ItemTable WHERE key = ?").get(r.key);
  const v = val.value;
  const preview = v.length > 1000 ? v.substring(0, 1000) + '...[total=' + v.length + ']' : v;
  console.log(`\nKEY: ${r.key} (${r.len} bytes)`);
  console.log(`VAL: ${preview}`);
});
wsDb2.close();

// === ACP 目录检查 ===
console.log('\n\n=== ACP 目录 ===');
const acpDir = path.join(APPDATA, 'Windsurf', 'User', 'acp');
if (fs.existsSync(acpDir)) {
  function listDir(dir, prefix = '') {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        console.log(`${prefix}${item}/`);
        listDir(full, prefix + '  ');
      } else {
        console.log(`${prefix}${item} (${stat.size} bytes, ${stat.mtime.toISOString()})`);
      }
    });
  }
  listDir(acpDir);
}

// === Local Storage (LevelDB) 检查 ===
console.log('\n\n=== Local Storage ===');
const lsDir = path.join(APPDATA, 'Windsurf', 'Local Storage');
if (fs.existsSync(lsDir)) {
  const lsItems = fs.readdirSync(lsDir);
  lsItems.forEach(item => {
    const full = path.join(lsDir, item);
    const stat = fs.statSync(full);
    console.log(`  ${item}: ${stat.isDirectory() ? 'DIR' : stat.size + ' bytes'} (${stat.mtime.toISOString()})`);
  });
  // Check leveldb subdirectory
  const leveldbDir = path.join(lsDir, 'leveldb');
  if (fs.existsSync(leveldbDir)) {
    const dbFiles = fs.readdirSync(leveldbDir);
    console.log('\n  leveldb/ 内容:');
    dbFiles.forEach(f => {
      const stat = fs.statSync(path.join(leveldbDir, f));
      console.log(`    ${f}: ${stat.size} bytes`);
    });
  }
}

// === Windsurf Extension 的 globalStorage 内数据 ===
console.log('\n\n=== Extension globalStorage 中可能的对话缓存 ===');
const extStorageBase = path.join(APPDATA, 'Windsurf', 'User', 'globalStorage');
const extDirs = fs.readdirSync(extStorageBase).filter(e => {
  return fs.statSync(path.join(extStorageBase, e)).isDirectory();
});
extDirs.forEach(d => {
  const dp = path.join(extStorageBase, d);
  const files = fs.readdirSync(dp);
  if (files.length > 0) {
    console.log(`\n  ${d}/:`);
    files.forEach(f => {
      const fp = path.join(dp, f);
      const stat = fs.statSync(fp);
      console.log(`    ${f}: ${stat.isDirectory() ? 'DIR' : stat.size + ' bytes'} (${stat.mtime.toISOString()})`);
    });
  }
});
