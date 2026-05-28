/**
 * 诊断8: 在 LevelDB 中搜索 ALL occurrences of cascade-open-sessions-by-workspace
 * 检查是否有后续写入覆盖了 tab 列表
 */
const fs = require('fs');
const path = require('path');

const LOCAL_LEVELDB = path.join(process.env.APPDATA, 'Windsurf', 'Local Storage', 'leveldb');
const TARGET_KEY = 'cascade-open-sessions-by-workspace';

console.log('═══ 搜索所有 cascade-open-sessions-by-workspace 条目 ═══\n');

const files = fs.readdirSync(LOCAL_LEVELDB)
  .filter(f => f.endsWith('.log') || f.endsWith('.ldb'))
  .sort();

console.log(`文件列表: ${files.join(', ')}\n`);

let totalFound = 0;
for (const file of files) {
  const filePath = path.join(LOCAL_LEVELDB, file);
  const buf = fs.readFileSync(filePath);
  const keyBytes = Buffer.from(TARGET_KEY, 'utf-8');
  
  let offset = 0;
  let fileCount = 0;
  while (true) {
    const idx = buf.indexOf(keyBytes, offset);
    if (idx === -1) break;
    fileCount++;
    totalFound++;
    
    // Look for value
    const searchStart = idx + keyBytes.length;
    const afterKey = buf.slice(searchStart, Math.min(searchStart + 10000, buf.length));
    
    // Find first { or [
    let jsonStart = -1;
    for (let i = 0; i < Math.min(afterKey.length, 100); i++) {
      if (afterKey[i] === 0x7B || afterKey[i] === 0x5B) { jsonStart = i; break; }
    }
    
    let value = '(无法提取)';
    if (jsonStart !== -1) {
      const jsonBuf = afterKey.slice(jsonStart);
      let depth = 0;
      let jsonEnd = 0;
      const startChar = jsonBuf[0];
      const endChar = startChar === 0x7B ? 0x7D : 0x5D;
      for (let i = 0; i < Math.min(jsonBuf.length, 5000); i++) {
        if (jsonBuf[i] === startChar) depth++;
        else if (jsonBuf[i] === endChar) { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
        if (jsonBuf[i] === 0 && i > 5) { jsonEnd = i; break; }
      }
      if (jsonEnd > 0) {
        value = jsonBuf.slice(0, jsonEnd).toString('utf-8').replace(/\0/g, '');
      }
    }
    
    console.log(`[${file}] 条目 #${fileCount} @ offset ${idx}:`);
    
    // Parse and show brief summary
    try {
      const parsed = JSON.parse(value);
      const wsKeys = Object.keys(parsed);
      for (const k of wsKeys) {
        const ws = parsed[k];
        const tabCount = ws.tabs?.length ?? 0;
        const cascadeTabs = ws.tabs?.filter(t => t.type === 'cascade').length ?? 0;
        const acpTabs = ws.tabs?.filter(t => t.type === 'acp').length ?? 0;
        const newTabs = ws.tabs?.filter(t => t.type === 'new').length ?? 0;
        console.log(`  workspace=${k}: ${tabCount}tabs (cascade=${cascadeTabs}, acp=${acpTabs}, new=${newTabs}), active=${ws.activeTabId?.substring(0,8)}`);
      }
    } catch {
      console.log(`  raw(${value.length}): ${value.substring(0, 200)}`);
    }
    console.log('');
    
    offset = idx + keyBytes.length;
  }
}

console.log(`\n总计找到 ${totalFound} 个条目`);

// Also check: is there a MANIFEST or CURRENT file that might indicate compaction?
const manifest = files.find(f => f.startsWith('MANIFEST'));
const current = path.join(LOCAL_LEVELDB, 'CURRENT');
if (fs.existsSync(current)) {
  console.log(`\nCURRENT: ${fs.readFileSync(current, 'utf-8').trim()}`);
}
