/**
 * Windsurf Account Switch — 官方模式切号脚本
 *
 * 流程: Firebase Login → RegisterUser → 写入auth.json → 重启Windsurf
 *
 * 用法:
 *   node windsurf-switch.js <email> <password>
 *   node windsurf-switch.js --list                  # 列出账号池
 *   node windsurf-switch.js --next                  # 切换到下一个有额度的账号
 *   node windsurf-switch.js --status                # 查看当前登录状态
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Firebase API Keys (dual, from Windsurf official)
const FB_KEYS = [
  'AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY',
  'AIzaSyDKm6GGxMJfCbNf-k0kPytiGLaqFJpeSac'
];

// Relay endpoints (国内直连，无需VPN)
const RELAYS = [
  'https://168666okfa.xyz',
  'https://aiotvr.xyz/wam'
];

// Windsurf RegisterUser endpoints
const REG_URLS = [
  'https://register.windsurf.com/exa.seat_management_pb.SeatManagementService/RegisterUser',
  'https://server.codeium.com/exa.seat_management_pb.SeatManagementService/RegisterUser'
];

// Paths
function getAuthPath() {
  const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appdata, 'Windsurf', 'User', 'globalStorage', 'windsurf-auth.json');
}

function getAccountsPath() {
  return path.join(__dirname, 'windsurf-accounts.json');
}

// ========== HTTP Helpers ==========

function httpsPost(url, body, contentType) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = typeof body === 'string' ? body : body;
    const headers = { 'Content-Type': contentType || 'application/json' };
    if (contentType === 'application/proto') headers['connect-protocol-version'] = '1';
    headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request({
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search,
      method: 'POST', headers
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

// ========== Firebase Login (via relay) ==========

async function firebaseLogin(email, password) {
  const payload = JSON.stringify({
    email, password,
    returnSecureToken: true,
    clientType: 'CLIENT_TYPE_WEB'
  });

  // Try relays first (国内直连)
  for (const relay of RELAYS) {
    try {
      const r = await httpsPost(`${relay}/firebase/login`, payload, 'application/json');
      if (r.status === 200) {
        const j = JSON.parse(r.buf.toString());
        if (j.idToken) return { ok: true, idToken: j.idToken, email: j.email || email, channel: 'relay' };
        if (j.error) return { ok: false, error: j.error.message };
      }
    } catch (e) { /* try next */ }
  }

  // Try direct Firebase (需要代理/VPN)
  for (const key of FB_KEYS) {
    try {
      const r = await httpsPost(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`,
        payload, 'application/json'
      );
      if (r.status === 200) {
        const j = JSON.parse(r.buf.toString());
        if (j.idToken) return { ok: true, idToken: j.idToken, email: j.email || email, channel: 'firebase-direct' };
      }
    } catch (e) { /* try next */ }
  }

  return { ok: false, error: 'All login channels failed' };
}

// ========== RegisterUser → apiKey ==========

function encodeProtoString(value) {
  const bytes = Buffer.from(value, 'utf8');
  const lenBytes = [];
  let len = bytes.length;
  while (len > 127) { lenBytes.push((len & 0x7f) | 0x80); len >>= 7; }
  lenBytes.push(len);
  return Buffer.concat([Buffer.from([0x0a]), Buffer.from(lenBytes), bytes]);
}

function parseProtoString(buf) {
  if (buf.length < 3 || buf[0] !== 0x0a) return null;
  let pos = 1, val = 0, shift = 0;
  while (pos < buf.length) {
    const b = buf[pos++];
    val |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return buf.slice(pos, pos + val).toString('utf8');
}

async function registerUser(idToken) {
  const proto = encodeProtoString(idToken);

  // Try direct endpoints first
  for (const url of REG_URLS) {
    try {
      const r = await httpsPost(url, proto, 'application/proto');
      if (r.status === 200 && r.buf.length > 5) {
        const apiKey = parseProtoString(r.buf);
        if (apiKey && apiKey.startsWith('sk-')) return { ok: true, apiKey };
      }
    } catch (e) { /* try next */ }
  }

  // Try relays
  for (const relay of RELAYS) {
    try {
      const r = await httpsPost(`${relay}/windsurf/register`, proto, 'application/proto');
      if (r.status === 200 && r.buf.length > 5) {
        const apiKey = parseProtoString(r.buf);
        if (apiKey && apiKey.startsWith('sk-')) return { ok: true, apiKey };
      }
    } catch (e) { /* try next */ }
  }

  return { ok: false, error: 'RegisterUser failed on all endpoints' };
}

// ========== Auth File Management ==========

function writeAuth(apiKey) {
  const authPath = getAuthPath();
  const data = JSON.stringify({ authToken: apiKey, token: apiKey, api_key: apiKey, timestamp: Date.now() }, null, 2);
  fs.writeFileSync(authPath, data, 'utf8');
  return authPath;
}

function readCurrentAuth() {
  try {
    const authPath = getAuthPath();
    if (!fs.existsSync(authPath)) return null;
    return JSON.parse(fs.readFileSync(authPath, 'utf8'));
  } catch { return null; }
}

// ========== Account Pool ==========

function loadAccounts() {
  const p = getAccountsPath();
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
}

function saveAccounts(accounts) {
  fs.writeFileSync(getAccountsPath(), JSON.stringify(accounts, null, 2), 'utf8');
}

// ========== Windsurf Process Management ==========

function killWindsurf() {
  try { execSync('taskkill /F /IM Windsurf.exe 2>nul', { stdio: 'pipe' }); } catch { }
}

function startWindsurf() {
  try { execSync('start "" "E:\\Windsurf\\Windsurf.exe"', { stdio: 'pipe', shell: true }); } catch { }
}

// ========== Main Switch Flow ==========

async function switchAccount(email, password, opts = {}) {
  console.log(`\n=== Windsurf Account Switch ===`);
  console.log(`Target: ${email}`);

  // Step 1: Firebase Login
  console.log('\n[1/4] Firebase Login...');
  const login = await firebaseLogin(email, password);
  if (!login.ok) {
    console.log(`  FAIL: ${login.error}`);
    return { ok: false, error: login.error };
  }
  console.log(`  OK via ${login.channel} (tokenLen=${login.idToken.length})`);

  // Step 2: RegisterUser
  console.log('[2/4] RegisterUser...');
  const reg = await registerUser(login.idToken);
  if (!reg.ok) {
    console.log(`  FAIL: ${reg.error}`);
    return { ok: false, error: reg.error };
  }
  console.log(`  OK apiKey=${reg.apiKey.substring(0, 25)}...`);

  // Step 3: Write Auth
  console.log('[3/4] Writing auth...');
  if (!opts.noKill) killWindsurf();
  await new Promise(r => setTimeout(r, 2000));
  const authPath = writeAuth(reg.apiKey);
  console.log(`  Written to ${authPath}`);

  // Step 4: Restart Windsurf
  if (!opts.noRestart) {
    console.log('[4/4] Restarting Windsurf...');
    startWindsurf();
    await new Promise(r => setTimeout(r, 5000));
    console.log('  Windsurf started');
  } else {
    console.log('[4/4] Skipped restart (--no-restart)');
  }

  console.log(`\n=== Switch Complete: ${email} ===\n`);
  return { ok: true, email, apiKey: reg.apiKey };
}

// ========== CLI ==========

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--status') {
    const auth = readCurrentAuth();
    if (!auth) { console.log('Not logged in'); return; }
    console.log('Current auth:');
    const token = auth.authToken || auth.api_key || '';
    if (token.includes('.')) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        console.log(`  Email: ${payload.email}`);
        console.log(`  Name: ${payload.name}`);
        console.log(`  Expires: ${new Date(payload.exp * 1000).toLocaleString()}`);
      } catch { console.log(`  Token: ${token.substring(0, 30)}...`); }
    } else {
      console.log(`  ApiKey: ${token.substring(0, 30)}...`);
    }
    console.log(`  Timestamp: ${new Date(auth.timestamp).toLocaleString()}`);
    return;
  }

  if (args[0] === '--list') {
    const accounts = loadAccounts();
    if (accounts.length === 0) { console.log('No accounts in pool. Add with: node windsurf-switch.js --add <email> <password>'); return; }
    console.log(`Account pool (${accounts.length}):`);
    accounts.forEach((a, i) => {
      const credits = a.credits !== undefined ? ` credits=${a.credits}` : '';
      const plan = a.plan || '';
      console.log(`  ${i + 1}. ${a.email}${credits} ${plan}`);
    });
    return;
  }

  if (args[0] === '--add') {
    if (!args[1] || !args[2]) { console.log('Usage: --add <email> <password>'); return; }
    const accounts = loadAccounts();
    const exists = accounts.find(a => a.email.toLowerCase() === args[1].toLowerCase());
    if (exists) { console.log('Account already in pool'); return; }
    accounts.push({ email: args[1], password: args[2], addedAt: Date.now() });
    saveAccounts(accounts);
    console.log(`Added ${args[1]} to pool (total: ${accounts.length})`);
    return;
  }

  if (args[0] === '--switch' || args[0] === '-s') {
    const accounts = loadAccounts();
    if (accounts.length === 0) { console.log('No accounts in pool'); return; }
    const target = args[1];
    let account;
    if (/^\d+$/.test(target)) {
      const idx = parseInt(target) - 1;
      account = accounts[idx];
      if (!account) { console.log(`Invalid index: ${target} (pool has ${accounts.length})`); return; }
    } else {
      account = accounts.find(a => a.email.toLowerCase() === target.toLowerCase());
      if (!account) { console.log(`Account not found: ${target}`); return; }
    }
    if (!account.password) { console.log(`No password for ${account.email}`); return; }
    const noRestart = args.includes('--no-restart');
    const noKill = args.includes('--no-kill');
    await switchAccount(account.email, account.password, { noRestart, noKill });
    return;
  }

  if (args[0] === '--next') {
    const accounts = loadAccounts();
    if (accounts.length === 0) { console.log('No accounts in pool'); return; }
    // Find account with most credits
    const best = accounts.reduce((a, b) => ((a.credits || 0) >= (b.credits || 0) ? a : b));
    console.log(`Best account: ${best.email} (credits=${best.credits || '?'})`);
    await switchAccount(best.email, best.password);
    return;
  }

  if (args.length >= 2) {
    const email = args[0];
    const password = args[1];
    const noRestart = args.includes('--no-restart');
    const noKill = args.includes('--no-kill');
    await switchAccount(email, password, { noRestart, noKill });
    return;
  }

  console.log(`
Windsurf Account Switch — 官方模式切号

Usage:
  node windsurf-switch.js <email> <password>     Switch to account
  node windsurf-switch.js --status               Current login status
  node windsurf-switch.js --list                 List account pool
  node windsurf-switch.js --add <email> <pass>   Add account to pool
  node windsurf-switch.js --next                 Switch to best account

Options:
  --no-restart    Don't restart Windsurf after switch
  --no-kill       Don't kill Windsurf before switch
`);
}

main().catch(e => console.error('Fatal:', e.message));
