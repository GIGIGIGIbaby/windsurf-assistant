#!/usr/bin/env node
/**
 * 道藏采经引擎 · dao_acquire.js
 * ═══════════════════════════════════════
 * 道法自然 · 损之又损 · 无为而无不为
 * 
 * 最小化操作 · 最大化成果:
 *   一命令 → 遍历注册表 → 逐经采集 → 落盘 → 生成索引
 * 
 * 用法:
 *   node dao_acquire.js              # 采集全部 pending 经典
 *   node dao_acquire.js --id yijing  # 采集指定经典
 *   node dao_acquire.js --index      # 仅重建 INDEX.md
 *   node dao_acquire.js --status     # 显示采集状态
 * 
 * 道生一，一生二，二生三，三生万物。
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ═══ 配置 ═══
const BASE_DIR = __dirname;
const CANON_FILE = path.join(BASE_DIR, 'dao_canon.json');
const INDEX_FILE = path.join(BASE_DIR, 'INDEX.md');
const DELAY_MS = 2000; // 请求间隔 · 道法自然 · 不急不躁

// ═══ 核心: HTTP 请求 (零依赖) ═══
function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'DaoCanon/1.0 (Classical Text Research)',
        'Accept': 'text/html,application/json,text/plain;q=0.9',
        ...opts.headers
      },
      timeout: 30000
    };
    
    const req = mod.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 跟随重定向
        const redirect = res.headers.location.startsWith('http') 
          ? res.headers.location 
          : new URL(res.headers.location, url).href;
        return fetch(redirect, opts).then(resolve).catch(reject);
      }
      
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ═══ 源适配器 · 万法归一 ═══

/**
 * 维基文库采集器 (中/英)
 * MediaWiki API → 纯文本提取
 */
async function fetchWikisource(source, entry) {
  const isZh = source.type === 'wikisource_zh';
  const apiBase = isZh 
    ? 'https://zh.wikisource.org/w/api.php'
    : 'https://en.wikisource.org/w/api.php';
  
  const title = encodeURIComponent(source.title);
  const url = `${apiBase}?action=query&titles=${title}&prop=revisions&rvprop=content&rvslots=main&format=json`;
  
  log(`  ↳ 维基文库: ${source.title}`);
  const resp = await fetch(url);
  
  if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
  
  const json = JSON.parse(resp.body);
  const pages = json.query.pages;
  const pageId = Object.keys(pages)[0];
  
  if (pageId === '-1') throw new Error(`页面不存在: ${source.title}`);
  
  const content = pages[pageId].revisions[0].slots.main['*'];
  
  // 清洗 wiki 标记 → 纯文本
  return cleanWikitext(content, entry);
}

/**
 * ctext.org 采集器
 * 页面抓取 → 正文提取 (API 需订阅, 回退到页面解析)
 */
async function fetchCtext(source, entry) {
  const url = `https://ctext.org${source.path}/zh`;
  log(`  ↳ ctext.org: ${source.path}`);
  
  const resp = await fetch(url);
  if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
  
  // ctext 返回 HTML, 提取纯文本
  return cleanCtextHtml(resp.body, entry);
}

/**
 * Project Gutenberg 采集器
 * 直取 UTF-8 纯文本
 */
async function fetchGutenberg(source, entry) {
  const id = source.id;
  const url = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
  log(`  ↳ Gutenberg #${id}`);
  
  const resp = await fetch(url);
  if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
  
  return cleanGutenberg(resp.body, entry);
}

/**
 * Sacred-Texts 采集器
 */
async function fetchSacredTexts(source, entry) {
  const url = `https://www.sacred-texts.com${source.path}`;
  log(`  ↳ sacred-texts: ${source.path}`);
  
  const resp = await fetch(url);
  if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
  
  return cleanHtml(resp.body, entry);
}

// ═══ 文本清洗器 ═══

function cleanWikitext(raw, entry) {
  let text = raw;
  // 去除分类/模板/ref标签
  text = text.replace(/\{\{[^}]*\}\}/g, '');
  text = text.replace(/\[\[Category:[^\]]*\]\]/g, '');
  text = text.replace(/<ref[^>]*>.*?<\/ref>/gs, '');
  text = text.replace(/<ref[^>]*\/>/g, '');
  text = text.replace(/<\/?[^>]+>/g, '');
  // 处理wiki链接 [[显示文字|链接目标]] → 显示文字
  text = text.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2');
  // 去多余空行
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return formatOutput(text.trim(), entry);
}

function cleanCtextHtml(html, entry) {
  // 提取 <td class="ctext"> 中的文本
  const blocks = [];
  const regex = /<td[^>]*class="ctext"[^>]*>(.*?)<\/td>/gs;
  let match;
  while ((match = regex.exec(html)) !== null) {
    let t = match[1].replace(/<[^>]+>/g, '').trim();
    if (t) blocks.push(t);
  }
  
  if (blocks.length === 0) {
    // 回退: 提取所有中文文本段落
    const pRegex = /<p[^>]*>(.*?)<\/p>/gs;
    while ((match = pRegex.exec(html)) !== null) {
      let t = match[1].replace(/<[^>]+>/g, '').trim();
      if (t && /[\u4e00-\u9fff]/.test(t)) blocks.push(t);
    }
  }
  
  return formatOutput(blocks.join('\n\n'), entry);
}

function cleanGutenberg(raw, entry) {
  // 去除 Gutenberg header/footer
  let text = raw;
  const startMarkers = ['*** START OF', '***START OF'];
  const endMarkers = ['*** END OF', '***END OF'];
  
  for (const m of startMarkers) {
    const idx = text.indexOf(m);
    if (idx !== -1) {
      text = text.substring(text.indexOf('\n', idx) + 1);
      break;
    }
  }
  for (const m of endMarkers) {
    const idx = text.indexOf(m);
    if (idx !== -1) {
      text = text.substring(0, idx);
      break;
    }
  }
  
  return formatOutput(text.trim(), entry);
}

function cleanHtml(html, entry) {
  let text = html;
  // 去除 script/style
  text = text.replace(/<script[^>]*>.*?<\/script>/gs, '');
  text = text.replace(/<style[^>]*>.*?<\/style>/gs, '');
  // 标签 → 换行
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  // HTML 实体
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#?\w+;/g, '');
  // 多余空行
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return formatOutput(text.trim(), entry);
}

function formatOutput(text, entry) {
  const header = [
    entry.name,
    `名: ${entry.name_en}`,
    `底本: ${entry.sources[0].type}`,
    `时代: ${entry.era}`,
    `传统: ${entry.tradition}`,
    `采集: ${new Date().toISOString().split('T')[0]}`,
    '',
    '═'.repeat(50),
    ''
  ].join('\n');
  
  return header + text;
}

// ═══ 调度器 · 道法自然 ═══

async function acquireOne(entry, canon) {
  const filename = `_${entry.id}.txt`;
  const filepath = path.join(BASE_DIR, filename);
  
  if (entry.status === 'acquired' && fs.existsSync(filepath)) {
    log(`  ✓ 已存: ${entry.name} (${entry.file || filename})`);
    return { success: true, skipped: true };
  }
  
  log(`\n◈ 采集: ${entry.name} (${entry.name_en})`);
  
  // 逐源尝试 · 首成即止
  for (const source of entry.sources) {
    try {
      let text;
      switch (source.type) {
        case 'wikisource_zh':
        case 'wikisource_en':
          text = await fetchWikisource(source, entry);
          break;
        case 'ctext':
          text = await fetchCtext(source, entry);
          break;
        case 'gutenberg':
          text = await fetchGutenberg(source, entry);
          break;
        case 'sacred_texts':
          text = await fetchSacredTexts(source, entry);
          break;
        default:
          log(`  ⚠ 未知源类型: ${source.type}`);
          continue;
      }
      
      if (text && text.length > 100) {
        fs.writeFileSync(filepath, text, 'utf8');
        const stats = fs.statSync(filepath);
        
        // 更新注册表状态
        entry.status = 'acquired';
        entry.file = filename;
        entry.bytes = stats.size;
        entry.chars = text.length;
        entry.acquired_at = new Date().toISOString();
        
        log(`  ✓ 落盘: ${filename} (${stats.size} bytes / ${text.length} chars)`);
        return { success: true, skipped: false };
      } else {
        log(`  ⚠ 内容不足 (${text ? text.length : 0} chars), 尝试下一源...`);
      }
    } catch (err) {
      log(`  ✗ ${source.type} 失败: ${err.message}`);
    }
  }
  
  log(`  ✗ 所有源均失败: ${entry.name}`);
  return { success: false, skipped: false };
}

async function acquireAll(canon, targetId) {
  const targets = targetId 
    ? canon.canon.filter(e => e.id === targetId)
    : canon.canon.filter(e => e.status === 'pending');
  
  if (targets.length === 0) {
    log('\n道成。全部经典已收或无匹配。');
    return;
  }
  
  log(`\n═══ 道藏采经 · ${targets.length} 经待取 ═══\n`);
  
  let acquired = 0, failed = 0, skipped = 0;
  
  for (const entry of targets) {
    const result = await acquireOne(entry, canon);
    if (result.skipped) skipped++;
    else if (result.success) acquired++;
    else failed++;
    
    // 每次成功后保存状态
    if (result.success && !result.skipped) {
      fs.writeFileSync(CANON_FILE, JSON.stringify(canon, null, 2), 'utf8');
    }
    
    // 请求间隔 · 居善地
    if (!result.skipped) await sleep(DELAY_MS);
  }
  
  log(`\n═══ 采经完毕 ═══`);
  log(`  采集: ${acquired} | 跳过: ${skipped} | 失败: ${failed}`);
  
  // 保存最终状态
  fs.writeFileSync(CANON_FILE, JSON.stringify(canon, null, 2), 'utf8');
}

// ═══ INDEX.md 生成器 ═══

function generateIndex(canon) {
  const acquired = canon.canon.filter(e => e.status === 'acquired');
  const pending = canon.canon.filter(e => e.status === 'pending');
  
  // 统计
  let totalBytes = 0, totalChars = 0;
  for (const e of acquired) {
    const fp = path.join(BASE_DIR, e.file || `_${e.id}.txt`);
    if (fs.existsSync(fp)) {
      const st = fs.statSync(fp);
      e.bytes = st.size;
      e.chars = fs.readFileSync(fp, 'utf8').length;
      totalBytes += st.size;
      totalChars += e.chars;
    }
  }
  
  const lines = [
    '# 道藏经典 · 万法归宗',
    '',
    '> 道生一，一生二，二生三，三生万物。',
    '> 损之又损，以至于无为，无为而无不为。',
    '> 取天下，恒无事。',
    '',
    `## 已收 (${acquired.length} 经 · ${fmtBytes(totalBytes)} · ${fmtNum(totalChars)} chars)`,
    '',
    '| # | 经 | 文件 | 传统 | 时代 | bytes | chars |',
    '|---|---|---|---|---|---|---|',
  ];
  
  acquired.sort((a, b) => (a.era || '').localeCompare(b.era || ''));
  acquired.forEach((e, i) => {
    lines.push(`| ${i + 1} | **${e.name}** | \`${e.file || '_' + e.id + '.txt'}\` | ${e.tradition} | ${e.era} | ${fmtNum(e.bytes || 0)} | ${fmtNum(e.chars || 0)} |`);
  });
  
  if (pending.length > 0) {
    lines.push('');
    lines.push(`## 待采 (${pending.length} 经)`);
    lines.push('');
    lines.push('| # | 经 | 传统 | 时代 | 优先 | 备注 |');
    lines.push('|---|---|---|---|---|---|');
    pending.forEach((e, i) => {
      lines.push(`| ${i + 1} | **${e.name}** (${e.name_en}) | ${e.tradition} | ${e.era} | P${e.priority} | ${e.note} |`);
    });
  }
  
  lines.push('');
  lines.push('## 架构');
  lines.push('');
  lines.push('```');
  lines.push('05-文档_docs/经/');
  lines.push('├── dao_canon.json    ← 经典注册表 (元数据+状态)');
  lines.push('├── dao_acquire.js    ← 采集引擎 (零依赖Node.js)');
  lines.push('├── 一念_采经.cmd     ← 一键启动');
  lines.push('├── INDEX.md          ← 本文件 (自动生成)');
  lines.push('├── _*.txt            ← 经典原文');
  lines.push('└── *.md              ← 深审/分析文档');
  lines.push('```');
  lines.push('');
  lines.push('## 用法');
  lines.push('');
  lines.push('```powershell');
  lines.push('# 采集全部待取经典');
  lines.push('node dao_acquire.js');
  lines.push('');
  lines.push('# 采集指定经典');
  lines.push('node dao_acquire.js --id yijing');
  lines.push('');
  lines.push('# 仅重建索引');
  lines.push('node dao_acquire.js --index');
  lines.push('');
  lines.push('# 查看状态');
  lines.push('node dao_acquire.js --status');
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('> 天下之物生于有，有生于无。');
  lines.push(`> 更新: ${new Date().toISOString().split('T')[0]}`);
  lines.push('');
  
  const content = lines.join('\n');
  fs.writeFileSync(INDEX_FILE, content, 'utf8');
  log(`\n✓ INDEX.md 已重建 (${acquired.length} 已收 / ${pending.length} 待采)`);
}

// ═══ 辅助 ═══

function log(msg) { console.log(msg); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmtBytes(b) { return b > 1024*1024 ? (b/1024/1024).toFixed(1)+'MB' : b > 1024 ? (b/1024).toFixed(1)+'KB' : b+'B'; }
function fmtNum(n) { return n.toLocaleString(); }

// ═══ 状态显示 ═══

function showStatus(canon) {
  const acquired = canon.canon.filter(e => e.status === 'acquired');
  const pending = canon.canon.filter(e => e.status === 'pending');
  
  log('\n═══ 道藏状态 ═══\n');
  log(`已收: ${acquired.length} 经`);
  acquired.forEach(e => log(`  ✓ ${e.name} (${e.file || '_' + e.id + '.txt'})`));
  log(`\n待采: ${pending.length} 经`);
  pending.forEach(e => log(`  ○ ${e.name} [P${e.priority}] — ${e.note}`));
  log('');
}

// ═══ 主入口 ═══

async function main() {
  const args = process.argv.slice(2);
  
  log('');
  log('  道藏采经引擎 v1.0');
  log('  道法自然 · 损之又损 · 无为而无不为');
  log('');
  
  // 加载注册表
  if (!fs.existsSync(CANON_FILE)) {
    log('✗ 未找到 dao_canon.json');
    process.exit(1);
  }
  const canon = JSON.parse(fs.readFileSync(CANON_FILE, 'utf8'));
  
  // 解析参数
  if (args.includes('--status')) {
    showStatus(canon);
    return;
  }
  
  if (args.includes('--index')) {
    generateIndex(canon);
    return;
  }
  
  const idIdx = args.indexOf('--id');
  const targetId = idIdx !== -1 ? args[idIdx + 1] : null;
  
  if (targetId) {
    const entry = canon.canon.find(e => e.id === targetId);
    if (!entry) {
      log(`✗ 未找到经典: ${targetId}`);
      log(`  可用: ${canon.canon.map(e => e.id).join(', ')}`);
      process.exit(1);
    }
  }
  
  // 执行采集
  await acquireAll(canon, targetId);
  
  // 采集完毕 → 重建索引
  generateIndex(canon);
}

main().catch(err => {
  console.error('✗ 致命错误:', err.message);
  process.exit(1);
});
