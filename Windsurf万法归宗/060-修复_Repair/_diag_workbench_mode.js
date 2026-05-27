/**
 * 诊断9: 检查 workbench mode 和启动时模式决策
 * xf = "windsurf-agent-window" → cascade VIEW 不初始化 → tabs 不从 localStorage 恢复！
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

console.log('═══ 工作台模式诊断 ═══\n');

function queryAll(dbPath, pattern, label) {
  if (!fs.existsSync(dbPath)) { console.log(`[×] ${label}: 不存在`); return; }
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare(`SELECT key, value FROM ItemTable WHERE key LIKE ?`).all(pattern);
  console.log(`--- ${label}: "${pattern}" (${rows.length} 条) ---`);
  rows.forEach(r => {
    console.log(`  ${r.key}: ${r.value.substring(0, 500)}`);
  });
  db.close();
  return rows;
}

// 搜索 workbenchMode / mode 相关 key
queryAll(localWsDb, '%mode%', '本机工作区 mode');
queryAll(localWsDb, '%Mode%', '本机工作区 Mode');
queryAll(localWsDb, '%windsurf%agent%window%', '本机工作区 windsurf-agent-window');
queryAll(localWsDb, '%workingSets%', '本机工作区 workingSets');

console.log('');
queryAll(localGlobalDb, '%mode%', '本机全局 mode');
queryAll(localGlobalDb, '%Mode%', '本机全局 Mode');
queryAll(localGlobalDb, '%workbenchMode%', '本机全局 workbenchMode');
queryAll(localGlobalDb, '%windsurf%agent%', '本机全局 windsurf-agent');

// 直接查 windsurfAgentWindow.workingSets 完整值
console.log('\n\n═══ windsurfAgentWindow.workingSets 完整值 ═══\n');
const db = new Database(localWsDb, { readonly: true });
const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'windsurfAgentWindow.workingSets'").get();
if (row) {
  try {
    const parsed = JSON.parse(row.value);
    console.log(JSON.stringify(parsed, null, 2));
  } catch { console.log(row.value); }
}
db.close();
