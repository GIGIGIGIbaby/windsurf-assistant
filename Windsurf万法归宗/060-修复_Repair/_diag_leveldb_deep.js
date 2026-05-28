/**
 * 深层 LevelDB 全量 key dump - 找到 cascade 多标签页真正存储位置
 * 以身观身 以家观家
 */
const path = require('path');
const fs = require('fs');

function dumpAllKeys(dir, label) {
  console.log(`\n═══ ${label} ═══`);
  console.log(`路径: ${dir}`);
  
  if (!fs.existsSync(dir)) {
    console.log('  [×] 目录不存在');
    return;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ldb') || f.endsWith('.log'));
  
  for (const f of files) {
    const fp = path.join(dir, f);
    const buf = fs.readFileSync(fp);
    const text = buf.toString('utf-8');
    
    console.log(`\n  --- ${f} (${buf.length} bytes) ---`);
    
    // 在 Chromium Local Storage LevelDB 中，key 格式是:
    // _vscode-file://vscode-app\x00<key_name>
    // 提取所有这样的 key
    const keyPattern = /vscode-file:\/\/vscode-app\x00([^\x00\x01]+)/g;
    let match;
    const keys = new Set();
    while ((match = keyPattern.exec(text)) !== null) {
      keys.add(match[1]);
    }
    
    if (keys.size > 0) {
      console.log(`  找到 ${keys.size} 个 key:`);
      for (const k of [...keys].sort()) {
        // 对于每个 key，找到其值
        const fullKey = `vscode-file://vscode-app\x00${k}`;
        const keyIdx = text.indexOf(fullKey);
        if (keyIdx >= 0) {
          // 值紧跟在 key 后面，跳过一些控制字符
          const afterKey = text.substring(keyIdx + fullKey.length, keyIdx + fullKey.length + 500);
          // 清理控制字符，取可读部分
          const cleaned = afterKey.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '·').substring(0, 200);
          console.log(`    [${k}]`);
          console.log(`      preview: ${cleaned.substring(0, 150)}`);
        }
      }
    }
    
    // 也搜索含有 "cascade" / "session" / "tab" / "conversation" 的可见字符串
    const searchTerms = [
      'openSessions', 'sessionTabs', 'pinnedSessions', 'recentSessions',
      'cascadeState', 'cascadeTabs', 'activeSessions', 'tabLayout',
      'windsurf.sessions', 'windsurf.tabs', 'session-list', 'tab-list',
      'windsurf-cascade', 'conversation-list', 'agent-sessions'
    ];
    
    for (const term of searchTerms) {
      let idx = text.indexOf(term);
      while (idx >= 0) {
        const ctx = text.substring(Math.max(0, idx - 50), Math.min(text.length, idx + term.length + 200));
        const cleanCtx = ctx.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '·');
        console.log(`    [FOUND] "${term}" @ ${idx}:`);
        console.log(`      ${cleanCtx.substring(0, 250)}`);
        idx = text.indexOf(term, idx + term.length);
      }
    }
  }
}

const LOCAL_LS = path.join(process.env.APPDATA, 'Windsurf', 'Local Storage', 'leveldb');
const REMOTE_LS = '\\\\192.168.31.179\\C$\\Users\\zhouyoukang\\AppData\\Roaming\\Windsurf\\Local Storage\\leveldb';

dumpAllKeys(LOCAL_LS, '本机 Local Storage');
dumpAllKeys(REMOTE_LS, '远程 179 Local Storage');

// 同时检查 Session Storage
console.log('\n\n═══ 本机 Session Storage ═══');
const localSS = path.join(process.env.APPDATA, 'Windsurf', 'Session Storage');
if (fs.existsSync(localSS)) {
  const files = fs.readdirSync(localSS).filter(f => f.endsWith('.log'));
  for (const f of files) {
    const fp = path.join(localSS, f);
    const buf = fs.readFileSync(fp);
    const text = buf.toString('utf-8');
    console.log(`\n  ${f} (${buf.length} bytes)`);
    
    // 搜索 cascade 相关内容
    const terms = ['cascade', 'session', 'tab', 'conversation', 'pinnedSession', 'Rate Limit', 'Context Loss'];
    for (const term of terms) {
      let idx = text.indexOf(term);
      if (idx >= 0) {
        const ctx = text.substring(Math.max(0, idx - 30), Math.min(text.length, idx + term.length + 200));
        console.log(`    [FOUND] "${term}" @ ${idx}: ${ctx.replace(/[\x00-\x1f\x7f]/g, '·').substring(0, 200)}`);
      }
    }
  }
}
