/**
 * 诊断6: 辅助栏编辑器状态查询
 * Cascade tabs 存在于 auxiliary bar 的 editor area
 */
const path = require('path');
const fs = require('fs');
let Database;
try { Database = require('better-sqlite3'); }
catch { Database = require(path.join(__dirname, '..', '110-对话追踪_Trace', 'node_modules', 'better-sqlite3')); }

const APPDATA = process.env.APPDATA;
const LOCAL_WS_ID = 'b1d4ae41061b5e0db43feaba228276e3';
const localWsDb = path.join(APPDATA, 'Windsurf', 'User', 'workspaceStorage', LOCAL_WS_ID, 'state.vscdb');

const db = new Database(localWsDb, { readonly: true });

// 搜索所有 auxiliary 或 cascade 相关
console.log('=== 1. 本机工作区: auxiliary/cascade/agent 相关 key ===\n');
const rows = db.prepare(`
  SELECT key, length(value) as len FROM ItemTable 
  WHERE key LIKE '%auxiliary%' OR key LIKE '%Auxiliary%' 
    OR key LIKE '%cascade%' OR key LIKE '%Cascade%'
    OR key LIKE '%windsurfAgent%'
`).all();

rows.forEach(r => {
  const v = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(r.key).value;
  console.log(`[${r.len.toString().padStart(6)}] ${r.key}`);
  console.log(`  ${v.substring(0, 300)}\n`);
});

// 搜索所有 memento 相关（可能有 auxiliary bar editor memento）
console.log('\n=== 2. 本机工作区: 所有 memento/ 开头的 key ===\n');
const mementos = db.prepare("SELECT key, length(value) as len FROM ItemTable WHERE key LIKE 'memento/%'").all();
mementos.forEach(r => {
  const v = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(r.key).value;
  const hasCascade = v.includes('cascade') || v.includes('Cascade');
  console.log(`[${r.len.toString().padStart(6)}]${hasCascade ? ' ★' : ''} ${r.key}`);
  if (hasCascade) console.log(`  ${v.substring(0, 400)}`);
});

// 搜索含 "serializedGrid" 的所有 key（编辑器布局核心）
console.log('\n\n=== 3. 本机工作区: 含 serializedGrid 的 key ===\n');
const allKeys = db.prepare("SELECT key, value FROM ItemTable").all();
allKeys.forEach(r => {
  if (r.value.includes('serializedGrid') || r.value.includes('cascadeEditor')) {
    console.log(`[${r.value.length.toString().padStart(6)}] ★ ${r.key}`);
    console.log(`  ${r.value.substring(0, 600)}\n`);
  }
});

// 搜索包含 vscode-cascade-editor schema 的 key
console.log('\n=== 4. 含 vscode-cascade-editor 的 key ===\n');
allKeys.forEach(r => {
  if (r.value.includes('vscode-cascade-editor')) {
    console.log(`[${r.value.length}] ${r.key}: ${r.value.substring(0, 400)}`);
  }
});

db.close();

// 全局 state.vscdb 也查一下
console.log('\n\n=== 5. 本机全局: 含 serializedGrid/cascadeEditor 的 key ===\n');
const globalDb = new Database(path.join(APPDATA, 'Windsurf', 'User', 'globalStorage', 'state.vscdb'), { readonly: true });
const gKeys = globalDb.prepare("SELECT key, value FROM ItemTable").all();
gKeys.forEach(r => {
  if (r.value.includes('serializedGrid') || r.value.includes('cascadeEditor')) {
    console.log(`[${r.value.length.toString().padStart(6)}] ★ ${r.key}`);
    console.log(`  ${r.value.substring(0, 600)}\n`);
  }
});
globalDb.close();
