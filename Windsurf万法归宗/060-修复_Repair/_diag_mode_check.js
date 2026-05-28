const path = require('path');
const fs = require('fs');
let Database;
try { Database = require('better-sqlite3'); }
catch { Database = require(path.join(__dirname, '..', '110-对话追踪_Trace', 'node_modules', 'better-sqlite3')); }

const APPDATA = process.env.APPDATA;
const wsDb = path.join(APPDATA, 'Windsurf', 'User', 'workspaceStorage', 'b1d4ae41061b5e0db43feaba228276e3', 'state.vscdb');
const globalDb = path.join(APPDATA, 'Windsurf', 'User', 'globalStorage', 'state.vscdb');

function search(dbPath, label) {
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare("SELECT key, value FROM ItemTable WHERE key LIKE '%workbenchMode%' OR key LIKE '%workbench.mode%' OR key LIKE '%windsurf-agent-window%' OR key LIKE '%windsurfMode%'").all();
  console.log(`\n--- ${label} (${rows.length}) ---`);
  rows.forEach(r => console.log(`  ${r.key}: ${r.value.substring(0, 300)}`));
  
  // Also check for mode-related storage
  const rows2 = db.prepare("SELECT key, value FROM ItemTable WHERE key LIKE '%agentWindow%' OR key LIKE '%workbench.panel.chat%' OR key = 'workbench.panel.chatSidebarPanel'").all();
  rows2.forEach(r => console.log(`  ${r.key}: ${r.value.substring(0, 300)}`));
  db.close();
}

search(wsDb, '工作区 DB');
search(globalDb, '全局 DB');

// Also check the settings.json for windsurf mode
const settingsPath = path.join(APPDATA, 'Windsurf', 'User', 'settings.json');
if (fs.existsSync(settingsPath)) {
  const settings = fs.readFileSync(settingsPath, 'utf-8');
  const modeMatch = settings.match(/windsurf.*mode|mode.*windsurf|agent.*window/gi);
  console.log(`\n--- settings.json mode相关 ---`);
  if (modeMatch) modeMatch.forEach(m => console.log(`  ${m}`));
  else console.log('  (无 mode 相关设置)');
}
