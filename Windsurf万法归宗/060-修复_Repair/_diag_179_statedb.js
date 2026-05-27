/**
 * 直接对比本机 vs 179 的 state.vscdb 中 agentSessions 相关 key
 * 核心怀疑: agentSessions.model.cache / agentSessions.state.cache 为空
 * 反者道之动 · 弱者道之用
 */
const path = require('path');
const fs = require('fs');
let Database;
try { Database = require('better-sqlite3'); }
catch { Database = require(path.join(__dirname, '..', '110-对话追踪_Trace', 'node_modules', 'better-sqlite3')); }

const APPDATA = process.env.APPDATA;

// === 本机工作区 ===
const LOCAL_WS_ID = 'b1d4ae41061b5e0db43feaba228276e3';
const localWsDb = path.join(APPDATA, 'Windsurf', 'User', 'workspaceStorage', LOCAL_WS_ID, 'state.vscdb');
const localGlobalDb = path.join(APPDATA, 'Windsurf', 'User', 'globalStorage', 'state.vscdb');

// === 远程 179 工作区 ===
const REMOTE_BASE = '\\\\192.168.31.179\\C$\\Users\\zhouyoukang\\AppData\\Roaming\\Windsurf\\User';
const remoteGlobalDb = path.join(REMOTE_BASE, 'globalStorage', 'state.vscdb');
const remoteWsDir = path.join(REMOTE_BASE, 'workspaceStorage');

console.log('═══════════════════════════════════════════════════════');
console.log('  本机 vs 179 · state.vscdb 深层对照');
console.log('═══════════════════════════════════════════════════════\n');

function analyzeDb(dbPath, label) {
  console.log(`\n--- ${label} ---`);
  console.log(`路径: ${dbPath}`);
  
  if (!fs.existsSync(dbPath)) {
    console.log('  [×] 文件不存在');
    return null;
  }
  
  const stat = fs.statSync(dbPath);
  console.log(`大小: ${stat.size} bytes, 修改时间: ${stat.mtime.toISOString()}`);
  
  try {
    const db = new Database(dbPath, { readonly: true });
    
    const results = {};
    const targetKeys = [
      'agentSessions.model.cache',
      'agentSessions.state.cache',
      'agentSessions.readDateBaseline2',
      'chat.ChatSessionStore.index',
      'windsurf.acp.metadataCache',
      'windsurf.cascadeViewContainerId.state',
      'windsurf.cascadeViewContainerId.numberOfVisibleViews',
      'windsurfAgentWindow.workingSets',
      'workbench.auxiliarybar.activepanelid',
    ];
    
    for (const key of targetKeys) {
      const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(key);
      if (row) {
        results[key] = row.value;
        const v = row.value;
        const preview = v.length > 500 ? v.substring(0, 500) + `...[total=${v.length}]` : v;
        console.log(`  ${key} (${v.length} bytes): ${preview}`);
      }
    }
    
    // 同时列出所有包含 "agent" / "cascade" / "session" / "chat" 的 key
    const allKeys = db.prepare("SELECT key, length(value) as len FROM ItemTable WHERE key LIKE '%agent%' OR key LIKE '%cascade%' OR key LIKE '%session%' OR key LIKE '%chat%' OR key LIKE '%Cascade%' OR key LIKE '%Session%'").all();
    
    console.log(`\n  所有 agent/cascade/session/chat 相关 key (${allKeys.length} 个):`);
    for (const r of allKeys) {
      const val = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(r.key);
      const v = val.value;
      const preview = v.length > 200 ? v.substring(0, 200) + `...[${v.length}]` : v;
      console.log(`    [${r.len.toString().padStart(8)}] ${r.key}: ${preview}`);
    }
    
    db.close();
    return results;
  } catch (e) {
    console.log(`  [×] 打开失败: ${e.message}`);
    return null;
  }
}

// === 1. 本机工作区 ===
const localWsResults = analyzeDb(localWsDb, '本机工作区 state.vscdb');

// === 2. 本机全局 ===
const localGlobalResults = analyzeDb(localGlobalDb, '本机全局 state.vscdb');

// === 3. 远程 179 全局 ===
const remoteGlobalResults = analyzeDb(remoteGlobalDb, '远程179 全局 state.vscdb');

// === 4. 远程 179 工作区 - 先找到最近的工作区 ===
console.log('\n\n--- 远程 179 工作区列表 ---');
if (fs.existsSync(remoteWsDir)) {
  const wsEntries = fs.readdirSync(remoteWsDir);
  console.log(`工作区数: ${wsEntries.length}`);
  
  const wsInfos = wsEntries.map(e => {
    const wsPath = path.join(remoteWsDir, e);
    const jsonPath = path.join(wsPath, 'workspace.json');
    const dbPath = path.join(wsPath, 'state.vscdb');
    let wsJson = null;
    let dbStat = null;
    try { wsJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')); } catch {}
    try { dbStat = fs.statSync(dbPath); } catch {}
    return { name: e, wsJson, dbPath, dbMtime: dbStat ? dbStat.mtime : null, dbExists: !!dbStat };
  }).filter(w => w.dbExists).sort((a, b) => (b.dbMtime || 0) - (a.dbMtime || 0));
  
  // 显示最近的几个
  wsInfos.slice(0, 5).forEach(w => {
    console.log(`  ${w.name}: ${w.dbMtime?.toISOString()} => ${JSON.stringify(w.wsJson)}`);
  });
  
  // 分析最近的工作区
  if (wsInfos.length > 0) {
    console.log(`\n选取 179 最近活跃工作区: ${wsInfos[0].name}`);
    const remoteWsResults = analyzeDb(wsInfos[0].dbPath, `远程179 工作区 ${wsInfos[0].name}`);
    
    // === 对照 ===
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('  关键对照总结');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const compareKeys = [
      'agentSessions.model.cache',
      'agentSessions.state.cache',
      'agentSessions.readDateBaseline2',
    ];
    
    for (const key of compareKeys) {
      const localVal = localWsResults?.[key] || '(无)';
      const remoteVal = remoteWsResults?.[key] || '(无)';
      const localLen = typeof localVal === 'string' ? localVal.length : 0;
      const remoteLen = typeof remoteVal === 'string' ? remoteVal.length : 0;
      
      console.log(`[${key}]`);
      console.log(`  本机:  ${localLen} bytes → ${localVal.substring(0, 200)}`);
      console.log(`  179:   ${remoteLen} bytes → ${remoteVal.substring(0, 200)}`);
      console.log(`  差异:  ${localVal === remoteVal ? '相同' : '不同 ★'}`);
      console.log();
    }
  }
}
