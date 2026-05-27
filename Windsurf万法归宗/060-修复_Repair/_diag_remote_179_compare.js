/**
 * 远程 179 对照诊断：对比本机 vs 179 的 cascade-tab-editor-state
 * 反者道之动 · 不出于户以知天下
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const LOCAL_LS = path.join(process.env.APPDATA, 'Windsurf', 'Local Storage', 'leveldb');
const REMOTE_LS = '\\\\192.168.31.179\\C$\\Users\\zhouyoukang\\AppData\\Roaming\\Windsurf\\Local Storage\\leveldb';

console.log('═══════════════════════════════════════════════════════');
console.log('  对照 179 · 反者道之动 · cascade-tab-editor-state');
console.log('═══════════════════════════════════════════════════════\n');

function scanLevelDbForKey(dir, label) {
  console.log(`\n--- ${label} (${dir}) ---`);
  if (!fs.existsSync(dir)) {
    console.log('  [×] 目录不存在');
    return;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ldb') || f.endsWith('.log'));
  const results = {};

  for (const f of files) {
    const fp = path.join(dir, f);
    const content = fs.readFileSync(fp);
    const text = content.toString('utf-8');
    
    // 搜索 cascade-tab-editor-state
    const KEY = 'cascade-tab-editor-state';
    let idx = text.indexOf(KEY);
    if (idx >= 0) {
      // LevelDB 中 value 通常在 key 后面，需要找到值的边界
      // 在 Local Storage LevelDB 中，格式是：\x01 + origin + \x00 + key + \x01 + value
      // 尝试提取 key 后面的一大段内容
      const afterKey = text.substring(idx + KEY.length, idx + KEY.length + 10000);
      
      // 提取值：跳过分隔符字节，找到 JSON 或有意义的内容
      let valueStart = 0;
      // 跳过前面的 null/control 字节
      while (valueStart < afterKey.length && afterKey.charCodeAt(valueStart) < 32) {
        valueStart++;
      }
      
      // 找到值的结束（通常到下一个 control char 序列或 EOF）
      let valueEnd = valueStart;
      let braceCount = 0;
      let bracketCount = 0;
      let inString = false;
      let escaped = false;
      
      for (let i = valueStart; i < afterKey.length; i++) {
        const c = afterKey[i];
        if (escaped) { escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === '{') braceCount++;
        if (c === '}') { braceCount--; if (braceCount === 0 && bracketCount === 0) { valueEnd = i + 1; break; } }
        if (c === '[') bracketCount++;
        if (c === ']') { bracketCount--; if (bracketCount === 0 && braceCount === 0) { valueEnd = i + 1; break; } }
      }
      
      const rawValue = afterKey.substring(valueStart, valueEnd);
      results[f] = rawValue;
      
      console.log(`  [✓] 在 ${f} 中找到 (offset ${idx})`);
      console.log(`  值长度: ${rawValue.length}`);
      console.log(`  前 2000 字符:`);
      console.log(`  ${rawValue.substring(0, 2000)}`);
      if (rawValue.length > 2000) console.log(`  ...[总 ${rawValue.length} 字符]`);
      
      // 尝试解析 JSON
      try {
        const parsed = JSON.parse(rawValue);
        console.log(`\n  [解析成功] JSON 结构:`);
        console.log(`  顶层 keys: ${Object.keys(parsed)}`);
        if (parsed.tabs) console.log(`  tabs 数量: ${parsed.tabs.length}`);
        if (parsed.sessions) console.log(`  sessions 数量: ${parsed.sessions.length}`);
        if (parsed.conversations) console.log(`  conversations 数量: ${parsed.conversations.length}`);
        if (Array.isArray(parsed)) console.log(`  数组长度: ${parsed.length}`);
      } catch (e) {
        console.log(`  [JSON解析失败]: ${e.message}`);
      }
    }
  }
  
  if (Object.keys(results).length === 0) {
    // 尝试更宽泛的搜索
    console.log('  [!] 未找到 cascade-tab-editor-state，尝试其他关键词...');
    const otherKeys = ['cascade-tab', 'cascadeTab', 'agentSession', 'openConversation', 'conversationTab'];
    for (const f of files) {
      const fp = path.join(dir, f);
      const content = fs.readFileSync(fp);
      const text = content.toString('utf-8');
      for (const k of otherKeys) {
        const idx = text.indexOf(k);
        if (idx >= 0) {
          const ctx = text.substring(Math.max(0, idx - 30), Math.min(text.length, idx + k.length + 300));
          console.log(`  [~] "${k}" in ${f} @ ${idx}: ${ctx.replace(/[\x00-\x1f\x7f]/g, '·')}`);
        }
      }
    }
  }
  
  return results;
}

// === 对照执行 ===
const localResults = scanLevelDbForKey(LOCAL_LS, '本机 Local Storage');
const remoteResults = scanLevelDbForKey(REMOTE_LS, '远程 179 Local Storage');

// === 对比分析 ===
console.log('\n\n═══════════════════════════════════════════════════════');
console.log('  对比分析');
console.log('═══════════════════════════════════════════════════════\n');

const localFound = Object.keys(localResults || {}).length > 0;
const remoteFound = Object.keys(remoteResults || {}).length > 0;

console.log(`本机有 cascade-tab-editor-state: ${localFound ? '是' : '否'}`);
console.log(`179 有 cascade-tab-editor-state: ${remoteFound ? '是' : '否'}`);

if (localFound && remoteFound) {
  const lv = Object.values(localResults)[0];
  const rv = Object.values(remoteResults)[0];
  console.log(`\n本机值长度: ${lv.length}`);
  console.log(`179值长度:  ${rv.length}`);
}
