/**
 * 诊断脚本5: 编辑器布局持久化状态对比
 * 真本源：memento/workbench.parts.editor + editorpart.state
 * 这些 key 存储「哪些编辑器（含 cascade tabs）正在打开」
 */
const path = require('path');
const fs = require('fs');
let Database;
try { Database = require('better-sqlite3'); }
catch { Database = require(path.join(__dirname, '..', '110-对话追踪_Trace', 'node_modules', 'better-sqlite3')); }

const APPDATA = process.env.APPDATA;
const LOCAL_WS_ID = 'b1d4ae41061b5e0db43feaba228276e3';
const localWsDb = path.join(APPDATA, 'Windsurf', 'User', 'workspaceStorage', LOCAL_WS_ID, 'state.vscdb');
const localGlobalDb = path.join(APPDATA, 'Windsurf', 'User', 'globalStorage', 'state.vscdb');
const REMOTE_BASE = '\\\\192.168.31.179\\C$\\Users\\zhouyoukang\\AppData\\Roaming\\Windsurf\\User';
const remoteGlobalDb = path.join(REMOTE_BASE, 'globalStorage', 'state.vscdb');
const remoteWsDir = path.join(REMOTE_BASE, 'workspaceStorage');

console.log('═══════════════════════════════════════════════════════');
console.log('  编辑器布局持久化状态 · 天下之至柔驰骋于天下之致坚');
console.log('═══════════════════════════════════════════════════════\n');

function queryKey(dbPath, key, label) {
  if (!fs.existsSync(dbPath)) { console.log(`  [×] ${label}: DB不存在`); return null; }
  try {
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(key);
    db.close();
    return row ? row.value : null;
  } catch (e) {
    console.log(`  [×] ${label}: ${e.message}`);
    return null;
  }
}

function queryAllEditorKeys(dbPath, label) {
  if (!fs.existsSync(dbPath)) return;
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare("SELECT key, length(value) as len FROM ItemTable WHERE key LIKE '%editor%' OR key LIKE '%Editor%' OR key LIKE '%editorpart%'").all();
  console.log(`\n--- ${label}: 编辑器相关 key (${rows.length}) ---`);
  rows.forEach(r => {
    const val = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(r.key);
    const v = val.value;
    const hasCascade = v.includes('cascadeEditor') || v.includes('cascade');
    const preview = v.length > 500 ? v.substring(0, 500) + `...[${v.length}]` : v;
    console.log(`  [${r.len.toString().padStart(6)}]${hasCascade ? ' ★CASCADE★' : ''} ${r.key}`);
    if (hasCascade || r.key.includes('editorpart') || r.key.includes('workbench.parts.editor')) {
      console.log(`    ${preview}`);
    }
  });
  db.close();
}

// === 1. 本机工作区 ===
queryAllEditorKeys(localWsDb, '本机工作区');

// === 2. 本机全局 ===
queryAllEditorKeys(localGlobalDb, '本机全局');

// === 3. 远程 179 全局 ===
queryAllEditorKeys(remoteGlobalDb, '远程179全局');

// === 4. 远程 179 最近工作区 ===
if (fs.existsSync(remoteWsDir)) {
  const wsEntries = fs.readdirSync(remoteWsDir).map(e => {
    const wsPath = path.join(remoteWsDir, e);
    const dbPath = path.join(wsPath, 'state.vscdb');
    try {
      const stat = fs.statSync(dbPath);
      return { name: e, dbPath, mtime: stat.mtime };
    } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.mtime - a.mtime);
  
  if (wsEntries.length > 0) {
    queryAllEditorKeys(wsEntries[0].dbPath, `远程179最近工作区(${wsEntries[0].name})`);
  }
}

// === 5. 直接对比 memento/workbench.parts.editor ===
console.log('\n\n═══════════════════════════════════════════════════════');
console.log('  关键对比: memento/workbench.parts.editor');
console.log('═══════════════════════════════════════════════════════\n');

const localVal = queryKey(localWsDb, 'memento/workbench.parts.editor', '本机工作区');
console.log(`本机 (${localVal?.length ?? 0} bytes):`);
if (localVal) {
  try {
    const parsed = JSON.parse(localVal);
    console.log(JSON.stringify(parsed, null, 2));
  } catch { console.log(localVal); }
}

// 找远程 179 最近工作区
if (fs.existsSync(remoteWsDir)) {
  const wsEntries = fs.readdirSync(remoteWsDir).map(e => {
    const dbPath = path.join(remoteWsDir, e, 'state.vscdb');
    try { return { name: e, dbPath, mtime: fs.statSync(dbPath).mtime }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.mtime - a.mtime);
  
  if (wsEntries.length > 0) {
    const remoteVal = queryKey(wsEntries[0].dbPath, 'memento/workbench.parts.editor', '远程179');
    console.log(`\n远程179 (${remoteVal?.length ?? 0} bytes):`);
    if (remoteVal) {
      try { console.log(JSON.stringify(JSON.parse(remoteVal), null, 2)); } catch { console.log(remoteVal); }
    }
  }
}

// === 6. editorpart.state key (全局) ===
console.log('\n\n═══════════════════════════════════════════════════════');
console.log('  关键对比: editorpart.state (全局)');
console.log('═══════════════════════════════════════════════════════\n');

const localEP = queryKey(localGlobalDb, 'editorpart.state', '本机全局');
const remoteEP = queryKey(remoteGlobalDb, 'editorpart.state', '远程179全局');
console.log(`本机 editorpart.state: ${localEP?.length ?? 0} bytes`);
if (localEP) {
  const preview = localEP.length > 3000 ? localEP.substring(0,3000)+'...' : localEP;
  try {
    const p = JSON.parse(preview.endsWith('...') ? localEP : preview);
    // 找 cascade 相关
    const str = JSON.stringify(p);
    const cascadeCount = (str.match(/cascadeEditor/g) || []).length;
    console.log(`  含 cascadeEditor: ${cascadeCount} 处`);
    if (cascadeCount > 0) console.log(`  ${str.substring(0, 2000)}`);
    else console.log(`  (无 cascade 信息)`);
  } catch { console.log(`  ${localEP.substring(0,500)}`); }
}

console.log(`\n远程179 editorpart.state: ${remoteEP?.length ?? 0} bytes`);
if (remoteEP) {
  try {
    const p = JSON.parse(remoteEP);
    const str = JSON.stringify(p);
    const cascadeCount = (str.match(/cascadeEditor/g) || []).length;
    console.log(`  含 cascadeEditor: ${cascadeCount} 处`);
    if (cascadeCount > 0) console.log(`  ${str.substring(0, 2000)}`);
    else console.log(`  (无 cascade 信息)`);
  } catch { console.log(`  ${remoteEP.substring(0,500)}`); }
}
