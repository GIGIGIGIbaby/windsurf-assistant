/**
 * 诊断脚本2：深层查找 Cascade 对话标签页状态
 * 重点：找到存储多开对话 tab 的关键 key
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

// === 1. 全局 state.vscdb - 深入搜索 cascade tab 状态 ===
const globalDbPath = path.join(APPDATA, 'Windsurf', 'User', 'globalStorage', 'state.vscdb');
const db = new Database(globalDbPath, { readonly: true });

console.log('=== 全局 state.vscdb 中所有含 "cascade" 的 key ===');
const cascadeRows = db.prepare("SELECT key, length(value) as len FROM ItemTable WHERE key LIKE '%cascade%' OR key LIKE '%Cascade%'").all();
cascadeRows.forEach(r => {
  const val = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(r.key);
  console.log(`\nKEY: ${r.key} (${r.len} bytes)`);
  console.log(`VAL: ${val.value}`);
});

console.log('\n\n=== 全局 state.vscdb 中含 "conversationId" 或 "chatSession" 的值 ===');
const convRows = db.prepare("SELECT key, length(value) as len FROM ItemTable WHERE value LIKE '%conversationId%' OR value LIKE '%chatSession%' OR value LIKE '%cascadeTab%' OR value LIKE '%openConversation%'").all();
console.log('匹配数:', convRows.length);
convRows.forEach(r => {
  const val = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(r.key);
  const v = val.value;
  const preview = v.length > 1000 ? v.substring(0, 1000) + '...[total=' + v.length + ']' : v;
  console.log(`\nKEY: ${r.key} (${r.len} bytes)`);
  console.log(`VAL: ${preview}`);
});

db.close();

// === 2. 工作区 state.vscdb ===
const wsStorageDir = path.join(APPDATA, 'Windsurf', 'User', 'workspaceStorage');
const entries = fs.readdirSync(wsStorageDir);
const wsInfos = entries.map(e => {
  const wsPath = path.join(wsStorageDir, e);
  const jsonPath = path.join(wsPath, 'workspace.json');
  const dbPath = path.join(wsPath, 'state.vscdb');
  let wsJson = null;
  try { wsJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')); } catch {}
  const dbExists = fs.existsSync(dbPath);
  return { name: e, wsJson, dbPath, dbExists };
}).filter(w => w.dbExists);

// 查找所有工作区的 cascade 相关 key
console.log('\n\n=== 遍历所有工作区寻找 cascade tab 状态 ===');
for (const ws of wsInfos) {
  const wsDb = new Database(ws.dbPath, { readonly: true });
  
  // Search for cascade-related data
  const cascadeWs = wsDb.prepare("SELECT key, length(value) as len FROM ItemTable WHERE key LIKE '%cascade%' OR key LIKE '%Cascade%' OR value LIKE '%conversationId%' OR value LIKE '%cascadeTab%'").all();
  
  if (cascadeWs.length > 0) {
    console.log(`\n--- 工作区: ${ws.name} (${JSON.stringify(ws.wsJson)}) ---`);
    cascadeWs.forEach(r => {
      const val = wsDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get(r.key);
      const v = val.value;
      const preview = v.length > 1000 ? v.substring(0, 1000) + '...[total=' + v.length + ']' : v;
      console.log(`  KEY: ${r.key} (${r.len} bytes)`);
      console.log(`  VAL: ${preview}`);
    });
  }
  
  wsDb.close();
}

// === 3. 查看 Backups 目录 ===
console.log('\n\n=== Backups 目录结构 ===');
const backupDir = path.join(APPDATA, 'Windsurf', 'Backups');
if (fs.existsSync(backupDir)) {
  const bEntries = fs.readdirSync(backupDir);
  console.log('备份目录数:', bEntries.length);
  bEntries.forEach(e => {
    const bp = path.join(backupDir, e);
    const stat = fs.statSync(bp);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(bp);
      console.log(`  ${e}/: ${files.length} files (${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''})`);
    }
  });
}

// === 4. Session Storage ===
console.log('\n\n=== Session Storage ===');
const sessionDir = path.join(APPDATA, 'Windsurf', 'Session Storage');
if (fs.existsSync(sessionDir)) {
  const sEntries = fs.readdirSync(sessionDir);
  console.log('文件:', sEntries);
  sEntries.forEach(e => {
    const fp = path.join(sessionDir, e);
    const stat = fs.statSync(fp);
    console.log(`  ${e}: ${stat.size} bytes, mtime: ${stat.mtime.toISOString()}`);
  });
}

// === 5. IndexedDB (可能存放对话数据) ===
console.log('\n\n=== IndexedDB ===');
const idbDir = path.join(APPDATA, 'Windsurf', 'IndexedDB');
if (fs.existsSync(idbDir)) {
  const iEntries = fs.readdirSync(idbDir);
  console.log('数据库数:', iEntries.length);
  iEntries.forEach(e => {
    const ip = path.join(idbDir, e);
    const stat = fs.statSync(ip);
    console.log(`  ${e}: ${stat.isDirectory() ? 'DIR' : stat.size + ' bytes'}`);
  });
}
