/**
 * 诊断脚本4：定位三大可疑 key 的真实内容
 * 反者道之动 - 由表象逆流到本源
 */
const path = require('path');
const fs = require('fs');
let Database;
try { Database = require('better-sqlite3'); }
catch { Database = require(path.join(__dirname, '..', '110-对话追踪_Trace', 'node_modules', 'better-sqlite3')); }

const APPDATA = process.env.APPDATA;
const CURRENT_WS = 'b1d4ae41061b5e0db43feaba228276e3';
const wsDbPath = path.join(APPDATA, 'Windsurf', 'User', 'workspaceStorage', CURRENT_WS, 'state.vscdb');
const globalDbPath = path.join(APPDATA, 'Windsurf', 'User', 'globalStorage', 'state.vscdb');

const wsDb = new Database(wsDbPath, { readonly: true });
const globalDb = new Database(globalDbPath, { readonly: true });

console.log('═══════════════════════════════════════════════════════');
console.log('  追根溯源 · 定位 cascade 多对话标签页存储本源');
console.log('═══════════════════════════════════════════════════════\n');

// === 关键 key 1: chat.ChatSessionStore.index ===
console.log('--- [核心嫌疑1] chat.ChatSessionStore.index (工作区) ---');
let r = wsDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get('chat.ChatSessionStore.index');
console.log(`原始值: ${r ? r.value : '(无)'}`);
console.log();

// === 关键 key 2,3: agentSessions ===
console.log('--- [核心嫌疑2] agentSessions.model.cache ---');
r = wsDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get('agentSessions.model.cache');
console.log(`原始值: ${r ? r.value : '(无)'}`);

console.log('--- [核心嫌疑3] agentSessions.state.cache ---');
r = wsDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get('agentSessions.state.cache');
console.log(`原始值: ${r ? r.value : '(无)'}`);

console.log('--- [核心嫌疑4] agentSessions.readDateBaseline2 ---');
r = wsDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get('agentSessions.readDateBaseline2');
console.log(`原始值: ${r ? r.value : '(无)'}`);
console.log();

// === editor.workingSets / windsurfAgentWindow.workingSets ===
console.log('--- [核心嫌疑5] editor.workingSets (692 bytes) ---');
r = wsDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get('editor.workingSets');
if (r) {
  try {
    console.log(JSON.stringify(JSON.parse(r.value), null, 2));
  } catch {
    console.log(r.value);
  }
}
console.log();

console.log('--- [核心嫌疑6] windsurfAgentWindow.workingSets ---');
r = wsDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get('windsurfAgentWindow.workingSets');
if (r) {
  try {
    console.log(JSON.stringify(JSON.parse(r.value), null, 2));
  } catch {
    console.log(r.value);
  }
}
console.log();

// === 全局 ACP metadataCache 中关于会话的展示 (前 5000 字符已足) ===
console.log('--- [核心嫌疑7] 全局 windsurf.acp.metadataCache 前 8KB ---');
r = globalDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get('windsurf.acp.metadataCache');
if (r) {
  console.log(r.value.substring(0, 8000));
  console.log(`\n... (总 ${r.value.length} 字节)`);
}
console.log();

// === 在全局也找找 chat.ChatSessionStore.index ===
console.log('--- [全局] chat.ChatSessionStore.* ---');
const chatStoreGlobal = globalDb.prepare("SELECT key, length(value) as len FROM ItemTable WHERE key LIKE 'chat.ChatSessionStore%'").all();
chatStoreGlobal.forEach(row => {
  const v = globalDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get(row.key);
  console.log(`  ${row.key} (${row.len} bytes): ${v.value.substring(0, 500)}${v.value.length > 500 ? '...' : ''}`);
});

console.log('\n--- [全局] agentSessions.* ---');
const aSessionGlobal = globalDb.prepare("SELECT key, length(value) as len FROM ItemTable WHERE key LIKE 'agentSessions%'").all();
aSessionGlobal.forEach(row => {
  const v = globalDb.prepare("SELECT value FROM ItemTable WHERE key = ?").get(row.key);
  console.log(`  ${row.key} (${row.len} bytes): ${v.value.substring(0, 500)}${v.value.length > 500 ? '...' : ''}`);
});

wsDb.close();
globalDb.close();

// === 同时探测 LevelDB Local Storage 里是否含有对话标签 ===
console.log('\n\n--- Local Storage leveldb 文件内容指纹 (用 cat 二进制看是否含对话标题) ---');
const lsLevelDb = path.join(APPDATA, 'Windsurf', 'Local Storage', 'leveldb');
if (fs.existsSync(lsLevelDb)) {
  const files = fs.readdirSync(lsLevelDb);
  for (const f of files) {
    if (f.endsWith('.log') || f.endsWith('.ldb')) {
      const content = fs.readFileSync(path.join(lsLevelDb, f));
      const text = content.toString('utf-8', 0, Math.min(content.length, 200000));
      const matches = [
        'Rate Limit', 'Context Loss', 'VM Public', 'WAM Stuck', 'GitHub Account', 'Cascade',
        'cascadePanel', 'sessionId', 'conversationId', 'chatTab', 'tabGroup', 'workingSet'
      ];
      console.log(`\n  ${f} (${content.length} bytes):`);
      matches.forEach(m => {
        const idx = text.indexOf(m);
        if (idx >= 0) {
          // 提取上下文 100 字符
          const ctx = text.substring(Math.max(0, idx - 50), Math.min(text.length, idx + m.length + 200));
          console.log(`    [✓] "${m}" @ ${idx}: ${ctx.replace(/[\x00-\x1f\x7f]/g, '·')}`);
        }
      });
    }
  }
}
