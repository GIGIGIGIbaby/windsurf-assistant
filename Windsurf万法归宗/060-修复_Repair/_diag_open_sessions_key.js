/**
 * 诊断7: cascade-open-sessions-by-workspace 真本源追踪
 * 此 key 在 Chromium localStorage (LevelDB) 中
 * 无名万物之始也·有名万物之母也
 */
const fs = require('fs');
const path = require('path');

const LOCAL_LEVELDB = path.join(process.env.APPDATA, 'Windsurf', 'Local Storage', 'leveldb');
const REMOTE_LEVELDB = '\\\\192.168.31.179\\C$\\Users\\zhouyoukang\\AppData\\Roaming\\Windsurf\\Local Storage\\leveldb';

const TARGET_KEY = 'cascade-open-sessions-by-workspace';

function searchLevelDB(dir, label) {
  console.log(`\n═══ ${label} ═══`);
  console.log(`路径: ${dir}`);
  
  if (!fs.existsSync(dir)) {
    console.log('  [×] 目录不存在');
    return;
  }
  
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.log') || f.endsWith('.ldb'));
  console.log(`  文件数: ${files.length}`);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const buf = fs.readFileSync(filePath);
      // Search for the key in the binary data
      const keyBytes = Buffer.from(TARGET_KEY, 'utf-8');
      let offset = 0;
      while (true) {
        const idx = buf.indexOf(keyBytes, offset);
        if (idx === -1) break;
        
        console.log(`\n  ★ 找到 "${TARGET_KEY}" 在 ${file} offset ${idx}`);
        
        // Try to extract the value - look for JSON after the key
        // In LevelDB log format, the value follows the key with some framing bytes
        // Try different offsets after the key to find the JSON value
        const searchStart = idx + keyBytes.length;
        const searchEnd = Math.min(searchStart + 50000, buf.length);
        const afterKey = buf.slice(searchStart, searchEnd);
        
        // Look for JSON-like content starting with { or [
        let jsonStart = -1;
        for (let i = 0; i < Math.min(afterKey.length, 200); i++) {
          const ch = afterKey[i];
          if (ch === 0x7B || ch === 0x5B) { // { or [
            jsonStart = i;
            break;
          }
        }
        
        if (jsonStart !== -1) {
          // Try to extract JSON
          const jsonBuf = afterKey.slice(jsonStart);
          // Find matching end brace
          let depth = 0;
          let jsonEnd = 0;
          const startChar = jsonBuf[0];
          const endChar = startChar === 0x7B ? 0x7D : 0x5D; // } or ]
          
          for (let i = 0; i < jsonBuf.length; i++) {
            const c = jsonBuf[i];
            if (c === startChar) depth++;
            else if (c === endChar) {
              depth--;
              if (depth === 0) { jsonEnd = i + 1; break; }
            }
            // Handle null bytes (LevelDB separators)
            if (c === 0 && i > 10) { jsonEnd = i; break; }
          }
          
          if (jsonEnd > 0) {
            const jsonStr = jsonBuf.slice(0, jsonEnd).toString('utf-8').replace(/\0/g, '');
            console.log(`  JSON (${jsonStr.length} chars):`);
            try {
              const parsed = JSON.parse(jsonStr);
              const pretty = JSON.stringify(parsed, null, 2);
              console.log(`  ${pretty.substring(0, 3000)}`);
              if (pretty.length > 3000) console.log(`  ...[total: ${pretty.length}]`);
            } catch (e) {
              // Show raw
              console.log(`  (非有效JSON) ${jsonStr.substring(0, 1000)}`);
            }
          } else {
            // Just show raw bytes
            const raw = afterKey.slice(jsonStart, jsonStart + 500).toString('utf-8').replace(/[\x00-\x1f]/g, '·');
            console.log(`  Raw: ${raw}`);
          }
        } else {
          // Show context around key
          const context = afterKey.slice(0, 200).toString('utf-8').replace(/[\x00-\x1f]/g, '·');
          console.log(`  Context after key: ${context}`);
        }
        
        offset = idx + keyBytes.length;
      }
    } catch (e) {
      // skip unreadable files
    }
  }
}

searchLevelDB(LOCAL_LEVELDB, '本机 Local Storage LevelDB');
searchLevelDB(REMOTE_LEVELDB, '远程 179 Local Storage LevelDB');
