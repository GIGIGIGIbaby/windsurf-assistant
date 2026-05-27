#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// v3.11.4 全功能验证脚本 · 道法自然 · 无为而无以为
// 验证: ① vscdb裸读 ② 标题提取 ③ 对话显示管线 ④ 外部标题缓存
// ═══════════════════════════════════════════════════════════════════════
'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PASS = '\x1b[32m[OK]\x1b[0m';
const FAIL = '\x1b[31m[FAIL]\x1b[0m';
const INFO = '\x1b[36m[INFO]\x1b[0m';
const WARN = '\x1b[33m[WARN]\x1b[0m';

let passed = 0, failed = 0;
function ok(label) { console.log(PASS + ' ' + label); passed++; }
function fail(label, detail) { console.log(FAIL + ' ' + label + (detail ? ' :: ' + detail : '')); failed++; }
function info(label) { console.log(INFO + ' ' + label); }
function warn(label) { console.log(WARN + ' ' + label); }

// ─── 路径 ───
const APPDATA   = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const VSCDB     = path.join(APPDATA, 'Windsurf', 'User', 'globalStorage', 'state.vscdb');
const PB_DIR    = path.join(os.homedir(), '.codeium', 'windsurf', 'cascade');
const WAM_DIR   = path.join(os.homedir(), '.wam');
const HB_FILE   = path.join(WAM_DIR, 'stuck-detect', 'heartbeat_v9.json');
const EXT_TITLE = path.join(WAM_DIR, '_conv_titles.json');
const BK_ROOT   = path.join(WAM_DIR, 'conversation_backups');

console.log('\n\x1b[1m══════════════ WAM v3.11.4 全功能验证 ══════════════\x1b[0m\n');

// ═══════════════════════════════════════════════════════════════════════
// MODULE 1: 路径 & 文件存在性
// ═══════════════════════════════════════════════════════════════════════
console.log('\x1b[1m【模块1】文件路径验证\x1b[0m');

if (fs.existsSync(VSCDB))   ok('vscdb 存在: ' + VSCDB);
else                        fail('vscdb 不存在', VSCDB);

if (fs.existsSync(PB_DIR))  ok('PB_DIR 存在: ' + PB_DIR);
else                        fail('PB_DIR 不存在', PB_DIR);

const walPath = VSCDB + '-wal';
if (fs.existsSync(walPath)) ok('WAL 文件存在 (size=' + fs.statSync(walPath).size + ')');
else                        warn('WAL 文件不存在 (可能已合并到主文件)');

// ═══════════════════════════════════════════════════════════════════════
// MODULE 2: vscdb 裸读核心算法
// ═══════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m【模块2】vscdb 裸读 (无 better-sqlite3)\x1b[0m');

function tryExtractSessionsFromBuf(buf) {
  const needle = Buffer.from('{"sessions":[');
  let pos = 0, best = null;
  while (pos < buf.length) {
    const idx = buf.indexOf(needle, pos);
    if (idx < 0) break;
    let depth = 0, i = idx;
    const limit = Math.min(idx + 8 * 1024 * 1024, buf.length);
    while (i < limit) {
      const c = buf[i];
      if (c === 0x7B) depth++;
      else if (c === 0x7D) { depth--; if (depth === 0) { i++; break; } }
      i++;
    }
    if (depth === 0 && i > idx + needle.length) {
      try {
        const obj = JSON.parse(buf.slice(idx, i).toString('utf8'));
        if (obj.sessions && Array.isArray(obj.sessions)) {
          if (!best || obj.sessions.length >= best.length) best = obj.sessions;
        }
      } catch {}
    }
    pos = idx + 1;
  }
  return best;
}

function tryReadVscdbSessionsRaw() {
  for (const fpath of [VSCDB + '-wal', VSCDB]) {
    if (!fs.existsSync(fpath)) continue;
    try {
      const buf = fs.readFileSync(fpath);
      const sessions = tryExtractSessionsFromBuf(buf);
      if (sessions && sessions.length > 0) {
        info('从文件读取: ' + fpath + ' (' + buf.length + ' bytes)');
        return sessions;
      }
    } catch (e) { warn('读取失败: ' + fpath + ' :: ' + e.message); }
  }
  return null;
}

const sessions = tryReadVscdbSessionsRaw();
if (!sessions) {
  fail('vscdb 裸读失败 — sessions=null');
} else {
  ok('vscdb 裸读成功: sessions=' + sessions.length);
  const withTitle = sessions.filter(s => s.title);
  const active    = sessions.filter(s => s.status === 'active');
  ok('有标题的会话: ' + withTitle.length + '/' + sessions.length);
  ok('active状态: '   + active.length);

  console.log('\n  前10条会话标题:');
  sessions.slice(0, 10).forEach((s, i) => {
    const t = s.title ? s.title.substring(0, 50) : '(无标题)';
    const status = s.status || 'unknown';
    console.log('  ' + (i+1) + '. [' + status + '] ' + t + '  uuid=' + (s.sessionId||'').substring(0,8));
  });
}

// ═══════════════════════════════════════════════════════════════════════
// MODULE 3: .pb 文件与对话识别
// ═══════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m【模块3】.pb 文件 & 对话识别\x1b[0m');

let pbFiles = [];
try {
  pbFiles = fs.readdirSync(PB_DIR).filter(f => f.endsWith('.pb'));
  ok('.pb 文件数: ' + pbFiles.length);
} catch(e) { fail('读取 PB_DIR 失败', e.message); }

// 近期活跃 (1小时内 mtime 变化的 .pb)
const now = Date.now();
const recentPb = pbFiles.map(f => {
  const fp = path.join(PB_DIR, f);
  const st = fs.statSync(fp);
  return { uuid: f.replace('.pb',''), size: st.size, mtime: st.mtimeMs };
}).filter(p => now - p.mtime < 3600000).sort((a,b) => b.mtime - a.mtime);

ok('1小时内活跃 .pb: ' + recentPb.length);
console.log('\n  最近活跃对话 (top 5):');
recentPb.slice(0,5).forEach((p,i) => {
  const ageSec = Math.round((now - p.mtime)/1000);
  const sizeKB = Math.round(p.size/1024);
  const title = sessions ? (sessions.find(s => s.sessionId === p.uuid)||{}).title : null;
  const display = title ? title.substring(0,45) : '(无标题)';
  console.log('  ' + (i+1) + '. uuid=' + p.uuid.substring(0,8) + ' size=' + sizeKB + 'KB age=' + ageSec + 's title="' + display + '"');
});

// ═══════════════════════════════════════════════════════════════════════
// MODULE 4: 标题显示管线完整测试
// ═══════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m【模块4】标题显示管线\x1b[0m');

function cleanTitle(t) { return String(t==null?'':t).replace(/\s+/g,' ').trim(); }
function isReadableTitle(t, uuid) {
  const s = cleanTitle(t);
  if (!s) return false;
  const low = s.toLowerCase();
  const u   = String(uuid||'').toLowerCase();
  const sid = u ? u.substring(0,8) : '';
  if (low === '?' || low === '(unnamed)' || low === 'unnamed') return false;
  if (u && low === u) return false;
  if (sid && low === sid) return false;
  if (/^[0-9a-f]{8,36}$/i.test(s.replace(/-/g,''))) return false;
  if (/^\d{6,}$/.test(s)) return false;
  // v3.11.4: 拒绝 UUID 兜底格式
  if (/^对话\s*#[0-9a-f]{6,}/i.test(s)) return false;
  return true;
}
function displayTitle(uuid, ...cands) {
  for (const c of cands) if (isReadableTitle(c, uuid)) return cleanTitle(c);
  return '';
}

// 测试过滤规则
const testCases = [
  { input: '对话 #b1828bba',  uuid: 'b1828bba', expect: false, desc: 'UUID兜底格式' },
  { input: 'b1828bba-2010-4b72-abdf', uuid: 'b1828bba', expect: false, desc: '完整UUID' },
  { input: 'b1828bba', uuid: 'b1828bba', expect: false, desc: '短UUID' },
  { input: '', uuid: 'any', expect: false, desc: '空字符串' },
  { input: 'WAM Plugin Debug', uuid: 'abc', expect: true, desc: '正常中文标题' },
  { input: 'Fix conversation display', uuid: 'abc', expect: true, desc: '正常英文标题' },
  { input: '道法自然·修复对话追踪', uuid: 'abc', expect: true, desc: '中文标题' },
  { input: '对话 #abcdef12', uuid: 'xyz', expect: false, desc: 'UUID兜底(不同uuid)' },
];
testCases.forEach(tc => {
  const got = isReadableTitle(tc.input, tc.uuid);
  if (got === tc.expect) ok('isReadableTitle "' + tc.input + '" → ' + tc.expect + ' (' + tc.desc + ')');
  else fail('isReadableTitle "' + tc.input + '"', '期望=' + tc.expect + ' 实际=' + got);
});

// ═══════════════════════════════════════════════════════════════════════
// MODULE 5: 备份标题缓存
// ═══════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m【模块5】备份标题缓存\x1b[0m');

const backupTitleCache = {};
let totalBkTitles = 0;
if (fs.existsSync(BK_ROOT)) {
  const batches = fs.readdirSync(BK_ROOT)
    .filter(d => d.startsWith('backup_')).sort().reverse();
  ok('备份批次总数: ' + batches.length);
  for (const b of batches) {
    const idxPath = path.join(BK_ROOT, b, '_index.json');
    if (!fs.existsSync(idxPath)) continue;
    try {
      const idx = JSON.parse(fs.readFileSync(idxPath,'utf8'));
      for (const [uuid, m] of Object.entries(idx)) {
        if (m.title && !backupTitleCache[uuid]) {
          backupTitleCache[uuid] = m.title;
          totalBkTitles++;
        }
      }
    } catch {}
  }
  ok('备份标题总缓存: ' + totalBkTitles + ' 个对话');
} else { warn('备份目录不存在: ' + BK_ROOT); }

// ═══════════════════════════════════════════════════════════════════════
// MODULE 6: 外部标题文件 (extension.js → dao_stuck.js)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m【模块6】外部标题提示文件\x1b[0m');

// 构建从 vscdb 裸读获得的标题 map
const vscdbTitleMap = {};
if (sessions) {
  for (const s of sessions) {
    if (s.sessionId && s.title) vscdbTitleMap[s.sessionId] = s.title;
  }
}
// 合并备份缓存
const mergedTitles = Object.assign({}, backupTitleCache, vscdbTitleMap);
info('合并后标题总数: ' + Object.keys(mergedTitles).length);

// 写入外部标题文件 (模拟 extension.js 的 _persistConvTitleHints)
try {
  if (!fs.existsSync(WAM_DIR)) fs.mkdirSync(WAM_DIR, { recursive: true });
  fs.writeFileSync(EXT_TITLE, JSON.stringify(mergedTitles, null, 0));
  ok('写入 _conv_titles.json: ' + Object.keys(mergedTitles).length + ' 条');
} catch(e) { fail('写入失败', e.message); }

// ═══════════════════════════════════════════════════════════════════════
// MODULE 7: heartbeat 数据验证 + 完整显示管线模拟
// ═══════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m【模块7】Hub 数据 & UI 显示模拟\x1b[0m');

if (!fs.existsSync(HB_FILE)) {
  warn('heartbeat_v9.json 不存在 (引擎未运行)');
} else {
  const hub = JSON.parse(fs.readFileSync(HB_FILE,'utf8'));
  const ageMs = Date.now() - (hub.ts || 0);
  if (ageMs > 60000) warn('Hub 数据过期: ' + Math.round(ageMs/1000) + 's');
  else ok('Hub 数据新鲜: ' + Math.round(ageMs/1000) + 's ago');

  info('Hub: active=' + hub.active + ' streaming=' + hub.streaming +
       ' sessions=' + (hub.totalSessions||0));

  const streamList = hub.streamingList || [];
  info('streamingList 条数: ' + streamList.length);

  if (streamList.length === 0 && hub.current) {
    info('使用 hub.current: uuid=' + (hub.current.uuid||'').substring(0,8) +
         ' title="' + (hub.current.title||'') + '"');
  }

  // 模拟完整显示管线
  console.log('\n  === UI 显示模拟 (v3.11.4 管线) ===');
  const allItems = streamList.length > 0 ? streamList
    : (hub.current ? [hub.current] : []);

  allItems.forEach((c, i) => {
    const uuid  = c.uuid || '';
    const short = uuid.replace(/-/g,'').slice(0,8);
    // 标题候选优先级: hub.title → vscdbTitleMap → mergedTitles
    const titleFromHub    = c.title;
    const titleFromVscdb  = vscdbTitleMap[uuid];
    const titleFromBackup = mergedTitles[uuid];
    const finalTitle = displayTitle(uuid, titleFromHub, titleFromVscdb, titleFromBackup);
    const displayStr = finalTitle || ('对话 #' + short);
    const isUuid = !finalTitle;
    console.log('  ' + (i+1) + '. uuid=' + short +
      ' | hub="' + (titleFromHub||'').substring(0,30) + '"' +
      ' | vscdb="' + (titleFromVscdb||'').substring(0,30) + '"' +
      ' | 显示=\x1b[' + (isUuid?'33':'32') + 'm"' + displayStr.substring(0,40) + '"\x1b[0m' +
      (isUuid ? ' ← 需要获取真实标题' : ' ✓')
    );
  });

  if (allItems.length === 0) warn('无活跃对话 (streamingList 空 + current 空)');
}

// ═══════════════════════════════════════════════════════════════════════
// MODULE 8: 当前实时对话完整验证
// ═══════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m【模块8】实时对话完整匹配验证\x1b[0m');

console.log('\n  活跃 .pb 对话 → 标题匹配情况:');
recentPb.slice(0, 10).forEach((p, i) => {
  const uuid = p.uuid;
  const short = uuid.replace(/-/g,'').slice(0,8);
  const fromVscdb  = sessions ? (sessions.find(s=>s.sessionId===uuid)||{}).title : null;
  const fromBackup = backupTitleCache[uuid];
  const finalTitle = displayTitle(uuid, fromVscdb, fromBackup);
  const sizeKB = Math.round(p.size/1024);
  const ageSec = Math.round((now-p.mtime)/1000);
  const display = finalTitle || ('对话 #' + short + ' · ' + sizeKB + 'KB');
  const hasTitle = !!finalTitle;
  console.log('  ' + (i+1) + '. \x1b[' + (hasTitle?'32':'33') + 'm' + display.substring(0,50) + '\x1b[0m' +
    ' [age=' + ageSec + 's, vscdb=' + (fromVscdb?'✓':'✗') + ', bk=' + (fromBackup?'✓':'✗') + ']');
});

// ═══════════════════════════════════════════════════════════════════════
// MODULE 9: 部署验证
// ═══════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m【模块9】部署状态验证\x1b[0m');

const extDir = path.join(os.homedir(), '.windsurf', 'extensions', 'devaid.rt-flow-3.11.4');
if (fs.existsSync(extDir)) {
  ok('3.11.4 部署目录存在: ' + extDir);
  const extJs = fs.readFileSync(path.join(extDir,'extension.js'),'utf8');
  const daoJs = fs.readFileSync(path.join(extDir,'dao_stuck.js'),'utf8');
  if (extJs.includes('VERSION = "3.11.4"'))           ok('extension.js VERSION=3.11.4');
  else                                                  fail('extension.js VERSION 不正确');
  if (extJs.includes('_refreshTitlesFromVscdbRaw'))   ok('extension.js: vscdb裸读');
  else                                                  fail('extension.js: 缺少vscdb裸读');
  if (extJs.includes('对话\\s*#[0-9a-f]'))            ok('extension.js: UUID兜底过滤');
  else if (extJs.includes('^对话'))                   ok('extension.js: UUID兜底过滤(备选)');
  else                                                  fail('extension.js: 缺少UUID兜底过滤');
  if (daoJs.includes('_tryExtractSessionsFromBuf'))   ok('dao_stuck.js: raw buffer scan');
  else                                                  fail('dao_stuck.js: 缺少raw scan');
  if (daoJs.includes('_refreshVscdbRaw'))             ok('dao_stuck.js: raw vscdb refresh');
  else                                                  fail('dao_stuck.js: 缺少raw refresh');
} else {
  fail('3.11.4 部署目录不存在', extDir);
}

const oldDir = path.join(os.homedir(), '.windsurf', 'extensions', 'devaid.rt-flow-3.11.3');
if (!fs.existsSync(oldDir)) ok('旧版 3.11.3 已清理');
else warn('旧版 3.11.3 目录仍存在: ' + oldDir);

const extJson = JSON.parse(fs.readFileSync(
  path.join(os.homedir(),'.windsurf','extensions','extensions.json'),'utf8'));
const rtEntry = extJson.find ? extJson.find(e=>e.identifier&&e.identifier.id==='devaid.rt-flow')
  : (Array.isArray(extJson) ? extJson.find(e=>e.identifier&&e.identifier.id==='devaid.rt-flow') : null);
if (rtEntry && rtEntry.version === '3.11.4') ok('extensions.json: version=3.11.4');
else fail('extensions.json: version 不正确', JSON.stringify(rtEntry||'未找到'));

// ═══════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════
console.log('\n\x1b[1m══════════════ 验证结果 ══════════════\x1b[0m');
console.log('\x1b[32m通过: ' + passed + '\x1b[0m  \x1b[31m失败: ' + failed + '\x1b[0m');
console.log('');

if (failed === 0) {
  console.log('\x1b[32m✓ 全部通过 · 后端处理完整可用\x1b[0m');
} else {
  console.log('\x1b[31m✗ 存在失败项 · 需要进一步排查\x1b[0m');
}

// 结论
console.log('\n\x1b[1m═══ 结论 ═══\x1b[0m');
if (sessions && sessions.filter(s=>s.title).length > 0) {
  console.log('✓ vscdb 裸读成功: 可获取真实对话标题，无需 better-sqlite3');
  console.log('✓ 当前活跃对话标题已写入 ' + EXT_TITLE);
  console.log('✓ 重启 Windsurf (Ctrl+Shift+P → Reload Window) 后:');
  console.log('  · dao_stuck.js 将读取真实 title (非 UUID 兜底)');
  console.log('  · extension.js 将从 vscdb 裸读补充标题');
  console.log('  · 对话显示将展示真实名称而非 "对话 #b1828bba"');
} else {
  console.log('⚠ vscdb 裸读未获取标题 — 需要进一步排查 (文件锁定或格式变化)');
}
