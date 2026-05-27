/**
 * 诊断10: 检查当前 LevelDB 所有文件中 cascade-open-sessions-by-workspace 的最新状态
 * 重点看 .log 文件（最新写入的位置）
 */
const fs = require('fs');
const path = require('path');

const LOCAL_LEVELDB = path.join(process.env.APPDATA, 'Windsurf', 'Local Storage', 'leveldb');
const KEY1 = 'cascade-open-sessions-by-workspace';
const KEY2 = 'cascade-tab-editor-state';

console.log('═══ 当前 LevelDB 状态分析 ═══');
console.log(`目录: ${LOCAL_LEVELDB}`);
const files = fs.readdirSync(LOCAL_LEVELDB).sort();
console.log(`文件: ${files.join(', ')}\n`);

// Read CURRENT to know which MANIFEST is active
const current = fs.readFileSync(path.join(LOCAL_LEVELDB, 'CURRENT'), 'utf-8').trim();
console.log(`CURRENT: ${current}\n`);

// For each file, search for our keys
for (const file of files) {
  if (!file.endsWith('.log') && !file.endsWith('.ldb')) continue;
  const isLog = file.endsWith('.log');
  const filePath = path.join(LOCAL_LEVELDB, file);
  const stat = fs.statSync(filePath);
  const buf = fs.readFileSync(filePath);
  
  console.log(`\n─── ${file} (${stat.size} bytes, ${isLog ? 'LOG' : 'LDB'}) ───`);
  
  for (const key of [KEY1, KEY2]) {
    const keyBytes = Buffer.from(key, 'utf-8');
    let offset = 0;
    let count = 0;
    
    while (true) {
      const idx = buf.indexOf(keyBytes, offset);
      if (idx === -1) break;
      count++;
      
      // Extract value
      const afterKey = buf.slice(idx + keyBytes.length, Math.min(idx + keyBytes.length + 8000, buf.length));
      let value = '(unreadable)';
      
      // Find JSON start
      let jsonStart = -1;
      for (let i = 0; i < Math.min(afterKey.length, 50); i++) {
        if (afterKey[i] === 0x7B || afterKey[i] === 0x5B) { jsonStart = i; break; }
      }
      
      if (jsonStart !== -1) {
        const jsonBuf = afterKey.slice(jsonStart);
        let depth = 0;
        let jsonEnd = 0;
        const sc = jsonBuf[0];
        const ec = sc === 0x7B ? 0x7D : 0x5D;
        for (let i = 0; i < Math.min(jsonBuf.length, 6000); i++) {
          if (jsonBuf[i] === sc) depth++;
          else if (jsonBuf[i] === ec) { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
          if (jsonBuf[i] === 0 && i > 10) { jsonEnd = i; break; }
        }
        if (jsonEnd > 0) {
          value = jsonBuf.slice(0, jsonEnd).toString('utf-8').replace(/\0/g, '');
        }
      }
      
      // Parse and summarize
      let summary = value;
      if (key === KEY1) {
        try {
          const parsed = JSON.parse(value);
          const parts = [];
          for (const [ws, data] of Object.entries(parsed)) {
            const tabs = data.tabs || [];
            const cascade = tabs.filter(t => t.type === 'cascade').length;
            const newt = tabs.filter(t => t.type === 'new').length;
            parts.push(`${ws.substring(0,8)}:[${cascade}cascade,${newt}new]`);
          }
          summary = `{${parts.join(', ')}}`;
        } catch { summary = `(JSON parse failed) ${value.substring(0, 100)}`; }
      } else if (key === KEY2) {
        try {
          const parsed = JSON.parse(value);
          summary = `keys=${Object.keys(parsed).length}`;
        } catch { summary = `(${value.length} chars)`; }
      }
      
      console.log(`  [${key.substring(0,20)}] #${count} @ offset ${idx}: ${summary}`);
      offset = idx + keyBytes.length;
    }
    
    if (count === 0) {
      if (isLog) console.log(`  [${key.substring(0,20)}] NOT FOUND in this log`);
    }
  }
}

// Summary: what's the EFFECTIVE value (last entry in last file wins for .ldb; for .log, last occurrence wins)
console.log('\n\n═══ 摘要 ═══');
console.log('LevelDB 读取优先级: 最新的 .log 文件中的最后一条记录 > 旧 .ldb 文件中的记录');
console.log('如果 .log 文件中没有该 key，则从 .ldb 文件中读取（需要 Snappy 解压缩）');
console.log('当前 Windsurf 进程可以正确读取 .ldb 文件（自动解压）');
