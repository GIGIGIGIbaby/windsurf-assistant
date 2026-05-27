#!/usr/bin/env node
// Fix: Windsurf sets NODE_EXTRA_CA_CERTS to a broken path, poisoning OpenSSL TLS handshakes
if (process.env.NODE_EXTRA_CA_CERTS) {
  try { require('fs').accessSync(process.env.NODE_EXTRA_CA_CERTS); } catch { delete process.env.NODE_EXTRA_CA_CERTS; }
}
/**
 * 道·Agent — 完全脱离Windsurf IDE的独立Agent运行时
 * ====================================================
 * 反者道之动 · 弱者道之用 · 天下万物生于有，有生于无
 *
 * 直连 server.codeium.com ConnectRPC API，绕过一切IDE中间层。
 * 用Windsurf的apiKey，调Windsurf的模型，不用Windsurf的IDE。
 *
 * 五层架构:
 *   L0 Proto   — Protobuf编解码 (手工，零依赖)
 *   L1 Net     — 智能TLS连接 (直连真实IP / Clash隧道 / Keep-Alive)
 *   L2 Auth    — Firebase认证链 + RegisterUser + apiKey管理
 *   L3 Agent   — GetChatMessage + 流式响应 + 多轮对话 + 模型切换
 *   L4 Runtime — CLI REPL + HTTP API (:19878) + 号池集成
 *
 * 命令:
 *   node dao_agent.js                  — 交互式REPL
 *   node dao_agent.js chat "消息"      — 单轮对话
 *   node dao_agent.js serve            — HTTP API服务
 *   node dao_agent.js auth             — 认证链测试
 *   node dao_agent.js status           — 号池状态
 *   node dao_agent.js models           — 可用模型列表
 */

const https = require('https');
const http = require('http');
const tls = require('tls');
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const VERSION = '1.0.0';
const SCRIPT_DIR = __dirname;
const HTTP_PORT = 19878;
const CLASH_PORT = 7890;

// ═══════════════════════════════════════════════════════════════════════
// L0: Protobuf 编解码 (手工实现, 零依赖)
// ═══════════════════════════════════════════════════════════════════════

function encodeVarint(value) {
  const bytes = [];
  let v = typeof value === 'bigint' ? Number(value) : value;
  if (v < 0) v = 0;
  do { bytes.push((v & 0x7f) | (v > 127 ? 0x80 : 0)); v >>>= 7; } while (v > 0);
  return Buffer.from(bytes);
}

function readVarint(data, pos) {
  let result = 0, shift = 0;
  while (pos < data.length) {
    const b = data[pos++];
    if (shift < 28) result |= (b & 0x7f) << shift;
    else result += (b & 0x7f) * (2 ** shift);
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result, nextPos: pos };
}

function encodeTag(fieldNumber, wireType) {
  return encodeVarint((fieldNumber << 3) | wireType);
}

function encodeString(value, fieldNumber) {
  const bytes = Buffer.from(value, 'utf8');
  return Buffer.concat([encodeTag(fieldNumber, 2), encodeVarint(bytes.length), bytes]);
}

function encodeMessage(payload, fieldNumber) {
  return Buffer.concat([encodeTag(fieldNumber, 2), encodeVarint(payload.length), payload]);
}

function encodeVarintField(value, fieldNumber) {
  return Buffer.concat([encodeTag(fieldNumber, 0), encodeVarint(value)]);
}

function parseProtoMsg(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const fields = {};
  let pos = 0;
  while (pos < bytes.length) {
    const tagResult = readVarint(bytes, pos);
    if (tagResult.nextPos === pos) break; // stuck
    pos = tagResult.nextPos;
    const fieldNum = tagResult.value >>> 3;
    const wireType = tagResult.value & 0x07;
    if (fieldNum === 0 || fieldNum > 2000 || pos >= bytes.length) break;
    if (!fields[fieldNum]) fields[fieldNum] = [];
    switch (wireType) {
      case 0: { // varint
        const r = readVarint(bytes, pos);
        fields[fieldNum].push({ wire: 0, value: r.value });
        pos = r.nextPos;
        break;
      }
      case 2: { // length-delimited
        const r = readVarint(bytes, pos);
        const len = r.value;
        pos = r.nextPos;
        if (len < 0 || len > 4194304 || pos + len > bytes.length) { pos = bytes.length; break; }
        const slice = bytes.slice(pos, pos + len);
        fields[fieldNum].push({ wire: 2, bytes: slice, length: len });
        pos += len;
        break;
      }
      case 1: { // fixed64
        if (pos + 8 > bytes.length) { pos = bytes.length; break; }
        fields[fieldNum].push({ wire: 1, bytes: bytes.slice(pos, pos + 8) });
        pos += 8;
        break;
      }
      case 5: { // fixed32
        if (pos + 4 > bytes.length) { pos = bytes.length; break; }
        fields[fieldNum].push({ wire: 5, bytes: bytes.slice(pos, pos + 4) });
        pos += 4;
        break;
      }
      default: pos = bytes.length;
    }
  }
  return fields;
}

function protoString(fields, fieldNum) {
  const f = fields[fieldNum];
  if (!f || !f[0] || f[0].wire !== 2) return null;
  return Buffer.from(f[0].bytes).toString('utf8');
}

function protoVarint(fields, fieldNum) {
  const f = fields[fieldNum];
  if (!f || !f[0] || f[0].wire !== 0) return null;
  return f[0].value;
}

function protoBytes(fields, fieldNum) {
  const f = fields[fieldNum];
  if (!f || !f[0] || f[0].wire !== 2) return null;
  return Buffer.from(f[0].bytes);
}

function protoFixed64AsNumber(fields, fieldNum) {
  const f = fields[fieldNum];
  if (!f || !f[0]) return null;
  if (f[0].wire === 0) return f[0].value;
  if (f[0].wire === 1 && f[0].bytes) {
    const b = Buffer.from(f[0].bytes);
    return Number(b.readBigUInt64LE(0));
  }
  return null;
}

function deepDecode(buf, depth = 0) {
  if (depth > 8 || !buf || buf.length < 2) return null;
  try {
    const fields = parseProtoMsg(buf);
    const r = {};
    for (const [fn, entries] of Object.entries(fields)) {
      r[`F${fn}`] = entries.map(e => {
        if (e.wire === 0) return { t: 'varint', v: e.value };
        if (e.wire === 2) {
          const s = Buffer.from(e.bytes).toString('utf8');
          const printable = /^[\x20-\x7e\u00a0-\uffff\n\r\t]+$/.test(s) && s.length > 0;
          const nested = deepDecode(Buffer.from(e.bytes), depth + 1);
          if (printable && nested && Object.keys(nested).length > 0)
            return { t: 'msg+str', str: s.substring(0, 300), nested };
          if (printable) return { t: 'str', v: s.substring(0, 1000) };
          if (nested && Object.keys(nested).length > 0) return { t: 'msg', nested };
          return { t: 'bytes', len: e.length, hex: Buffer.from(e.bytes).toString('hex').substring(0, 80) };
        }
        if (e.wire === 1) {
          const b = Buffer.from(e.bytes);
          return { t: 'f64', double: b.readDoubleBE(0), le: Number(b.readBigUInt64LE(0)) };
        }
        if (e.wire === 5) return { t: 'f32', v: Buffer.from(e.bytes).readUInt32LE(0) };
        return e;
      });
    }
    return r;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════
// L1: 网络层 — 智能TLS连接 (直连 / Clash隧道)
// ═══════════════════════════════════════════════════════════════════════

const IP_CACHE = {};

async function resolveRealIP(hostname) {
  if (IP_CACHE[hostname]) return IP_CACHE[hostname];
  return new Promise((resolve, reject) => {
    const resolver = new dns.Resolver();
    resolver.setServers(['8.8.8.8', '1.1.1.1']);
    resolver.resolve4(hostname, (err, addresses) => {
      if (err || !addresses?.length) return reject(err || new Error('no addresses'));
      IP_CACHE[hostname] = addresses[0];
      resolve(addresses[0]);
    });
  });
}

// When connecting via resolved IP (bypassing DNS pollution), cert CN may not match host.
// Set DAO_TLS_STRICT=1 to enforce full certificate validation.
const TLS_STRICT = process.env.DAO_TLS_STRICT === '1';

function directTLS(hostname, timeout = 15000) {
  return new Promise(async (resolve, reject) => {
    try {
      const ip = await resolveRealIP(hostname);
      const sock = tls.connect({
        host: ip, port: 443, servername: hostname,
        rejectUnauthorized: TLS_STRICT, timeout,
      }, () => resolve(sock));
      sock.on('error', reject);
      sock.on('timeout', () => { sock.destroy(); reject(new Error('tls timeout')); });
    } catch (e) { reject(e); }
  });
}

// Global connection throttle — GFW resets rapid sequential TLS handshakes through Clash
let _lastConnectTime = 0;
const CONNECT_COOLDOWN_MS = 800; // minimum ms between Clash tunnel attempts

async function _waitCooldown() {
  const now = Date.now();
  const elapsed = now - _lastConnectTime;
  if (elapsed < CONNECT_COOLDOWN_MS) {
    await new Promise(r => setTimeout(r, CONNECT_COOLDOWN_MS - elapsed));
  }
  _lastConnectTime = Date.now();
}

function clashTLS(hostname, proxyPort = CLASH_PORT, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: proxyPort,
      method: 'CONNECT', path: `${hostname}:443`, timeout,
    });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); return reject(new Error(`CONNECT ${res.statusCode}`)); }
      const sock = tls.connect({ socket, servername: hostname, rejectUnauthorized: false }, () => resolve(sock));
      sock.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('tunnel timeout')); });
    req.end();
  });
}

async function smartConnect(hostname, retries = 3) {
  // Behind GFW: Clash proxy with throttle + retry + backoff
  let lastErr;
  for (let i = 0; i < retries; i++) {
    await _waitCooldown();
    try { return await clashTLS(hostname); } catch (e) { lastErr = e; }
    if (i < retries - 1) await new Promise(r => setTimeout(r, 500 * (i + 1)));
  }
  // Fallback: direct TLS (may work for some hosts not blocked by GFW)
  try { return await directTLS(hostname); } catch (e) { lastErr = e; }
  throw new Error(`cannot connect to ${hostname}: ${lastErr?.message || 'unknown'}`);
}

function decodeChunked(buf) {
  const parts = [];
  let pos = 0;
  while (pos < buf.length) {
    const lineEnd = buf.indexOf(Buffer.from('\r\n'), pos);
    if (lineEnd < 0) break;
    const sizeStr = buf.slice(pos, lineEnd).toString('utf8').trim();
    const size = parseInt(sizeStr, 16);
    if (isNaN(size) || size === 0) break;
    pos = lineEnd + 2;
    if (pos + size > buf.length) { parts.push(buf.slice(pos)); break; }
    parts.push(buf.slice(pos, pos + size));
    pos += size + 2;
  }
  return Buffer.concat(parts);
}

/**
 * Raw HTTP/1.1 request over TLS socket
 * Returns: { status, headers (string), body (Buffer) }
 */
function rawHTTP(sock, host, urlPath, method, headers, body, timeout = 30000) {
  return new Promise((resolve, reject) => {
    let h = `${method} ${urlPath} HTTP/1.1\r\nHost: ${host}\r\n`;
    for (const [k, v] of Object.entries(headers)) h += `${k}: ${v}\r\n`;
    if (body) h += `Content-Length: ${body.length}\r\n`;
    h += `Connection: close\r\n\r\n`;
    sock.write(h);
    if (body) sock.write(body);
    const chunks = [];
    sock.on('data', c => chunks.push(c));
    sock.on('end', () => {
      const raw = Buffer.concat(chunks);
      const idx = raw.indexOf('\r\n\r\n');
      if (idx < 0) return reject(new Error('no header boundary'));
      const hdr = raw.slice(0, idx).toString();
      let bodyBuf = raw.slice(idx + 4);
      if (/transfer-encoding:\s*chunked/i.test(hdr)) bodyBuf = decodeChunked(bodyBuf);
      const m = hdr.match(/HTTP\/\S+ (\d+)/);
      resolve({ status: parseInt((m || [])[1] || '0'), headers: hdr, body: bodyBuf });
    });
    sock.on('error', reject);
    const timer = setTimeout(() => { sock.destroy(); reject(new Error(`timeout ${timeout}ms`)); }, timeout);
    sock.on('end', () => clearTimeout(timer));
    sock.on('close', () => clearTimeout(timer));
  });
}

/**
 * Streaming HTTP — calls onChunk(buffer) for each incoming data chunk.
 * Returns: { status, headers }
 */
function streamingHTTP(sock, host, urlPath, method, headers, body, onChunk, timeout = 120000) {
  return new Promise((resolve, reject) => {
    let h = `${method} ${urlPath} HTTP/1.1\r\nHost: ${host}\r\n`;
    for (const [k, v] of Object.entries(headers)) h += `${k}: ${v}\r\n`;
    if (body) h += `Content-Length: ${body.length}\r\n`;
    h += `Connection: close\r\n\r\n`;
    sock.write(h);
    if (body) sock.write(body);

    let headerStr = '';
    let headerDone = false;
    let status = 0;
    let bodyBuf = Buffer.alloc(0);
    let isChunked = false;

    sock.on('data', c => {
      if (!headerDone) {
        bodyBuf = Buffer.concat([bodyBuf, c]);
        const idx = bodyBuf.indexOf('\r\n\r\n');
        if (idx >= 0) {
          headerDone = true;
          headerStr = bodyBuf.slice(0, idx).toString();
          const m = headerStr.match(/HTTP\/\S+ (\d+)/);
          status = parseInt((m || [])[1] || '0');
          isChunked = /transfer-encoding:\s*chunked/i.test(headerStr);
          const remainder = bodyBuf.slice(idx + 4);
          bodyBuf = Buffer.alloc(0);
          if (remainder.length > 0) onChunk(remainder);
        }
      } else {
        onChunk(c);
      }
    });

    sock.on('end', () => resolve({ status, headers: headerStr }));
    sock.on('error', reject);
    const timer = setTimeout(() => { sock.destroy(); reject(new Error(`stream timeout ${timeout}ms`)); }, timeout);
    sock.on('end', () => clearTimeout(timer));
    sock.on('close', () => clearTimeout(timer));
  });
}

/**
 * ConnectRPC call — POST protobuf to a Connect-RPC endpoint
 */
const VERBOSE = process.env.DAO_VERBOSE === '1' || process.argv.includes('--verbose');

// Content-Type per service:
//   SeatManagementService → application/proto
//   ApiServerService      → application/connect+proto (changed post-2025)
const CT_SEAT = 'application/proto';
const CT_API  = 'application/connect+proto';

async function connectRPC(hostname, servicePath, bodyBuffer, contentType = CT_SEAT, timeout = 30000) {
  try {
    if (VERBOSE) process.stderr.write(`  [net] connecting ${hostname}...`);
    const sock = await smartConnect(hostname);
    if (VERBOSE) process.stderr.write(` ok, sending ${servicePath.split('/').pop()}...`);
    const resp = await rawHTTP(sock, hostname, servicePath, 'POST', {
      'Content-Type': contentType,
      'connect-protocol-version': '1',
    }, bodyBuffer, timeout);
    if (VERBOSE) process.stderr.write(` ${resp.status} ${resp.body.length}B\n`);
    if (VERBOSE && resp.status >= 400 && resp.body.length > 0 && resp.body.length < 500) {
      process.stderr.write(`    body: ${resp.body.toString('utf8').substring(0, 200)}\n`);
    }
    return { ok: resp.status === 200, status: resp.status, body: resp.body, headers: resp.headers };
  } catch (e) {
    if (VERBOSE) process.stderr.write(` ERR: ${e.message}\n`);
    return { ok: false, status: 0, error: e.message };
  }
}

/**
 * ConnectRPC streaming call — streams response chunks via callback
 */
async function connectRPCStream(hostname, servicePath, bodyBuffer, onChunk, contentType = CT_SEAT, timeout = 120000) {
  try {
    if (VERBOSE) process.stderr.write(`  [net] stream connecting ${hostname}...`);
    const sock = await smartConnect(hostname);
    if (VERBOSE) process.stderr.write(` ok, streaming ${servicePath.split('/').pop()}...\n`);
    const resp = await streamingHTTP(sock, hostname, servicePath, 'POST', {
      'Content-Type': contentType,
      'connect-protocol-version': '1',
    }, bodyBuffer, onChunk, timeout);
    return { ok: resp.status === 200, status: resp.status, headers: resp.headers };
  } catch (e) {
    if (VERBOSE) process.stderr.write(` ERR: ${e.message}\n`);
    return { ok: false, status: 0, error: e.message };
  }
}

async function httpsJson(url, body) {
  const u = new URL(url);
  const data = JSON.stringify(body);
  const sock = await smartConnect(u.hostname);
  const resp = await rawHTTP(sock, u.hostname, u.pathname + u.search, 'POST', {
    'Content-Type': 'application/json',
  }, Buffer.from(data));
  return { ok: resp.status === 200, status: resp.status, data: JSON.parse(resp.body.toString('utf8')) };
}

// ═══════════════════════════════════════════════════════════════════════
// L2: 认证层 — Firebase + RegisterUser + apiKey管理
// ═══════════════════════════════════════════════════════════════════════

// Firebase web API keys — loaded from env or secrets.env, fallback to well-known public keys
// (These are Google Identity Platform *web* keys, not secret credentials,
//  but we still prefer env-based config per project rule #4)
const FIREBASE_KEYS = (() => {
  const envKeys = process.env.FIREBASE_API_KEYS;
  if (envKeys) return envKeys.split(',').map(k => k.trim()).filter(Boolean);
  // Try secrets.env
  try {
    const secretsPath = path.join(SCRIPT_DIR, '..', 'secrets.env');
    if (fs.existsSync(secretsPath)) {
      const content = fs.readFileSync(secretsPath, 'utf8');
      const m = content.match(/FIREBASE_API_KEYS=(.+)/);
      if (m) return m[1].split(',').map(k => k.trim()).filter(Boolean);
    }
  } catch {}
  // Fallback: well-known Codeium/Windsurf public web API keys
  return [
    'AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY',
    'AIzaSyDKm6GGxMJfCbNf-k0kPytiGLaqFJpeSac',
  ];
})();

// SeatManagementService hosts (RegisterUser, GetPlanStatus)
const SEAT_HOSTS = ['register.windsurf.com', 'server.codeium.com'];
// ApiServerService hosts (GetChatMessage, CheckRateLimit)
const API_HOSTS = ['web-backend.windsurf.com', 'server.codeium.com'];

async function firebaseLogin(email, password) {
  for (const key of FIREBASE_KEYS) {
    try {
      const r = await httpsJson(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`,
        { email, password, returnSecureToken: true, clientType: 'CLIENT_TYPE_WEB' }
      );
      if (r.ok && r.data.idToken) {
        return { ok: true, idToken: r.data.idToken, refreshToken: r.data.refreshToken, email: r.data.email || email };
      }
    } catch {}
  }
  return { ok: false };
}

async function firebaseRefresh(refreshToken) {
  for (const key of FIREBASE_KEYS) {
    try {
      const r = await httpsJson(
        `https://securetoken.googleapis.com/v1/token?key=${key}`,
        { grant_type: 'refresh_token', refresh_token: refreshToken }
      );
      if (r.ok && r.data.id_token) {
        return { ok: true, idToken: r.data.id_token, refreshToken: r.data.refresh_token || refreshToken };
      }
    } catch {}
  }
  return { ok: false };
}

async function registerUser(idToken) {
  const reqData = encodeString(idToken, 1);
  for (const host of SEAT_HOSTS) {
    const r = await connectRPC(host, '/exa.seat_management_pb.SeatManagementService/RegisterUser', reqData);
    if (r.ok && r.body && r.body.length > 10) {
      const fields = parseProtoMsg(r.body);
      const apiKey = protoString(fields, 1);
      if (apiKey && apiKey.startsWith('sk-ws-01-')) return { apiKey, host };
    }
  }
  return null;
}

async function getPlanStatus(apiKey) {
  const reqData = encodeString(apiKey, 1);
  // Try all known hosts — web-backend works with valid apiKeys
  for (const host of [...SEAT_HOSTS, ...API_HOSTS]) {
    const r = await connectRPC(host, '/exa.seat_management_pb.SeatManagementService/GetPlanStatus', reqData);
    if (r.ok && r.body) {
      const fields = parseProtoMsg(r.body);
      const planFields = fields[1]?.[0]?.bytes ? parseProtoMsg(fields[1][0].bytes) : {};
      return {
        planName: protoString(planFields, 2) || 'unknown',
        creditsUsed: protoFixed64AsNumber(fields, 6) || 0,
        creditsAvailable: protoFixed64AsNumber(fields, 8) || 0,
        dailyQuotaPercent: protoVarint(fields, 14) ?? -1,
        weeklyQuotaPercent: protoVarint(fields, 15) ?? -1,
        host,
        raw: deepDecode(r.body),
      };
    }
  }
  return null;
}

async function checkRateLimit(apiKey, modelUid) {
  const akBuf = Buffer.from(apiKey, 'utf8');
  const inner = Buffer.concat([encodeTag(1, 2), encodeVarint(akBuf.length), akBuf]);
  const modelBuf = Buffer.from(modelUid, 'utf8');
  const reqData = Buffer.concat([
    encodeTag(1, 2), encodeVarint(inner.length), inner,
    encodeTag(3, 2), encodeVarint(modelBuf.length), modelBuf,
  ]);
  // Try both Content-Types (server behavior varies)
  for (const ct of [CT_API, CT_SEAT]) {
    for (const host of API_HOSTS) {
      const r = await connectRPC(host, '/exa.api_server_pb.ApiServerService/CheckUserMessageRateLimit', reqData, ct);
    if (r.ok && r.body) {
      const fields = parseProtoMsg(r.body);
      return {
        hasCapacity: protoVarint(fields, 1) !== 0,
        messagesRemaining: protoVarint(fields, 3) ?? -1,
        maxMessages: protoVarint(fields, 4) ?? -1,
        resetsInSeconds: protoVarint(fields, 5) ?? 0,
        host,
      };
    }
  }}
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// L3: Agent核心 — GetChatMessage + 多轮对话
// ═══════════════════════════════════════════════════════════════════════

const MODELS = {
  'swe':            { uid: 'MODEL_SWE_1_5', name: 'SWE-1.5 Fast', acu: 0, tier: 'free' },
  'swe-slow':       { uid: 'MODEL_SWE_1_5_SLOW', name: 'SWE-1.5 Slow', acu: 0, tier: 'free' },
  'gpt5':           { uid: 'MODEL_CHAT_GPT_5_CODEX', name: 'GPT-5 Codex', acu: 1, tier: 'low' },
  'kimi':           { uid: 'MODEL_KIMI_K2', name: 'Kimi K2', acu: 1, tier: 'low' },
  'gpt4':           { uid: 'MODEL_CHAT_GPT_4_1_2025_04_14', name: 'GPT-4.1', acu: 2, tier: 'standard' },
  'gemini':         { uid: 'MODEL_GOOGLE_GEMINI_2_5_PRO', name: 'Gemini 2.5 Pro', acu: 2, tier: 'standard' },
  'o3':             { uid: 'MODEL_CHAT_O3', name: 'o3', acu: 3, tier: 'standard' },
  'haiku':          { uid: 'MODEL_PRIVATE_11', name: 'Claude Haiku 4.5', acu: 1, tier: 'claude' },
  'sonnet':         { uid: 'MODEL_CLAUDE_4_SONNET', name: 'Claude Sonnet 4', acu: 2, tier: 'claude' },
  'sonnet4.5':      { uid: 'MODEL_PRIVATE_2', name: 'Claude Sonnet 4.5', acu: 3, tier: 'claude' },
  'sonnet4.6':      { uid: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', acu: 3, tier: 'claude' },
  'sonnet4.6t':     { uid: 'claude-sonnet-4-6-thinking', name: 'Claude Sonnet 4.6 Thinking', acu: 4, tier: 'claude' },
  'opus':           { uid: 'claude-opus-4-6', name: 'Claude Opus 4.6', acu: 6, tier: 'opus' },
  'opus-t':         { uid: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 Thinking', acu: 8, tier: 'opus' },
  'opus-1m':        { uid: 'claude-opus-4-6-thinking-1m', name: 'Claude Opus 4.6 T1M', acu: 10, tier: 'opus' },
  'opus-fast':      { uid: 'claude-opus-4-6-fast', name: 'Claude Opus 4.6 Fast', acu: 6, tier: 'opus' },
};

const DEFAULT_MODEL = 'sonnet4.6t';

// Metadata template — simulates Windsurf IDE headers
const META_TEMPLATE = {
  ideName: 'windsurf',
  ideVersion: '1.108.2',
  extensionVersion: '3.14.2',
  extensionName: 'Windsurf',
  locale: 'en-US',
};

/**
 * Build GetChatMessage request protobuf
 *
 * Schema (逆向自extension.js):
 *   F1 metadata: { F1 apiKey, F2 ideName, F3 ideVersion, F4 extVersion, F5 extName, F6 locale }
 *   F2 messages: repeated { F1 role(varint: 0=system,1=user,2=assistant), F2 content(string) }
 *   F3 modelUid: string
 */
function buildChatRequest(apiKey, modelUid, messages) {
  // Metadata (F1)
  const metaParts = [
    encodeString(apiKey, 1),
    encodeString(META_TEMPLATE.ideName, 2),
    encodeString(META_TEMPLATE.ideVersion, 3),
    encodeString(META_TEMPLATE.extensionVersion, 4),
    encodeString(META_TEMPLATE.extensionName, 5),
    encodeString(META_TEMPLATE.locale, 6),
  ];
  const metaPayload = Buffer.concat(metaParts);
  const metaField = encodeMessage(metaPayload, 1);

  // Messages (F2 repeated)
  const msgFields = messages.map(msg => {
    const roleMap = { system: 0, user: 1, assistant: 2 };
    const role = roleMap[msg.role] ?? 1;
    const parts = [
      encodeVarintField(role, 1),
      encodeString(msg.content, 2),
    ];
    const msgPayload = Buffer.concat(parts);
    return encodeMessage(msgPayload, 2);
  });

  // ModelUid (F3)
  const modelField = encodeString(modelUid, 3);

  return Buffer.concat([metaField, ...msgFields, modelField]);
}

/**
 * Parse Connect-RPC framed response
 *
 * Connect-RPC frame format:
 *   [flag:1B] [length:4B big-endian] [payload]
 *   flag 0x00 = data frame (protobuf payload)
 *   flag 0x02 = trailer frame (JSON payload with error/status)
 *
 * Response protobuf (data frames):
 *   F1: text (string) — AI回复文本
 *   F25: cumulativeTokens (uint64)
 *   F30: quotaCostBasisPoints (int32)
 */
function parseConnectFrames(body) {
  const frames = [];
  let pos = 0;
  while (pos + 5 <= body.length) {
    const flag = body[pos];
    const len = body.readUInt32BE(pos + 1);
    pos += 5;
    if (len > 0 && pos + len <= body.length) {
      frames.push({ flag, data: body.slice(pos, pos + len) });
      pos += len;
    } else if (len === 0) {
      frames.push({ flag, data: Buffer.alloc(0) });
    } else {
      break;
    }
  }
  // If no valid frames found, treat entire body as raw protobuf
  if (frames.length === 0 && body.length > 5) {
    frames.push({ flag: 0x00, data: body });
  }
  return frames;
}

function parseChatResponse(body) {
  if (!body || body.length < 2) return { text: '', error: 'empty response' };

  const frames = parseConnectFrames(body);
  let text = '';
  let tokens = null;
  let quotaCost = null;
  let error = null;

  for (const frame of frames) {
    if (frame.flag === 0x02) {
      // Trailer frame — JSON error/status
      try {
        const json = JSON.parse(frame.data.toString('utf8'));
        if (json.error) {
          error = `${json.error.code}: ${json.error.message}`;
        }
      } catch {}
      continue;
    }

    // Data frame — protobuf
    if (frame.data.length < 2) continue;
    const fields = parseProtoMsg(frame.data);
    const t = protoString(fields, 1);
    if (t) text += t;
    const tok = protoFixed64AsNumber(fields, 25);
    if (tok !== null) tokens = tok;
    const qc = protoVarint(fields, 30);
    if (qc !== null) quotaCost = qc;
  }

  // If no text extracted from frames, try deep decode
  if (!text && !error) {
    const decoded = deepDecode(body);
    const texts = [];
    _extractTexts(decoded, texts, 0);
    const filtered = texts.filter(s => s.length > 1 && !s.startsWith('sk-ws-') && !s.includes('windsurf'));
    return { text: filtered.join(''), tokens, quotaCost, decoded };
  }

  if (error && !text) return { text: '', error, tokens, quotaCost };
  return { text, tokens, quotaCost };
}

function _extractTexts(obj, out, depth) {
  if (depth > 10 || !obj) return;
  if (typeof obj === 'string' && obj.length > 0) { out.push(obj); return; }
  if (Array.isArray(obj)) { for (const item of obj) _extractTexts(item, out, depth + 1); return; }
  if (typeof obj === 'object') {
    if (obj.v && typeof obj.v === 'string') out.push(obj.v);
    if (obj.str && typeof obj.str === 'string') out.push(obj.str);
    if (obj.nested) _extractTexts(obj.nested, out, depth + 1);
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object') _extractTexts(v, out, depth + 1);
    }
  }
}

/**
 * Send a chat message and get response (non-streaming)
 */
async function chat(apiKey, modelUid, messages, timeout = 120000) {
  const reqData = buildChatRequest(apiKey, modelUid, messages);

  for (const host of API_HOSTS) {
    const r = await connectRPC(host, '/exa.api_server_pb.ApiServerService/GetChatMessage', reqData, CT_API, timeout);
    if (r.status === 0) continue; // Connection failed, try next host

    if (r.ok && r.body && r.body.length > 5) {
      const parsed = parseChatResponse(r.body);
      // Connect-RPC may return 200 with error in trailer frame
      if (parsed.error) {
        if (parsed.error.includes('resource_exhausted')) {
          return { ok: false, error: 'rate_limit', detail: parsed.error, host, status: r.status };
        }
        return { ok: false, error: parsed.error, host, status: r.status };
      }
      if (parsed.text) {
        return { ok: true, ...parsed, host, rawLength: r.body.length };
      }
    }
    // Non-200 or empty response
    if (r.body && r.body.length > 0) {
      const errText = r.body.toString('utf8').substring(0, 500);
      if (errText.includes('resource_exhausted') || errText.includes('rate limit')) {
        return { ok: false, error: 'rate_limit', detail: errText, host, status: r.status };
      }
      return { ok: false, error: errText, host, status: r.status };
    }
  }
  return { ok: false, error: 'all hosts failed' };
}

/**
 * Send a chat message with streaming output
 * onText(chunk) is called for each text chunk received
 */
async function chatStream(apiKey, modelUid, messages, onText, timeout = 120000) {
  const reqData = buildChatRequest(apiKey, modelUid, messages);
  let fullBody = Buffer.alloc(0);
  let lastTextLen = 0;
  let streamError = null;

  for (const host of API_HOSTS) {
    fullBody = Buffer.alloc(0);
    lastTextLen = 0;
    streamError = null;

    const result = await connectRPCStream(
      host,
      '/exa.api_server_pb.ApiServerService/GetChatMessage',
      reqData,
      (chunk) => {
        fullBody = Buffer.concat([fullBody, chunk]);
        // Parse Connect-RPC frames from accumulated buffer
        try {
          const frames = parseConnectFrames(fullBody);
          let totalText = '';
          for (const frame of frames) {
            if (frame.flag === 0x02) {
              // Trailer frame — check for errors
              try {
                const json = JSON.parse(frame.data.toString('utf8'));
                if (json.error) streamError = `${json.error.code}: ${json.error.message}`;
              } catch {}
              continue;
            }
            if (frame.data.length < 2) continue;
            const fields = parseProtoMsg(frame.data);
            const t = protoString(fields, 1);
            if (t) totalText += t;
          }
          if (totalText.length > lastTextLen) {
            onText(totalText.substring(lastTextLen));
            lastTextLen = totalText.length;
          }
        } catch {}
      },
      CT_API,
      timeout
    );

    if (result.status === 0) continue; // connection failed, try next host
    const parsed = parseChatResponse(fullBody);
    if (streamError && !parsed.text) {
      if (streamError.includes('resource_exhausted')) {
        return { ok: false, error: 'rate_limit', detail: streamError, host, status: result.status };
      }
      return { ok: false, error: streamError, host, rawLength: fullBody.length, status: result.status };
    }
    return { ok: result.ok, ...parsed, host, rawLength: fullBody.length, status: result.status };
  }
  return { ok: false, error: 'all hosts failed' };
}

/**
 * Streaming chat with automatic key rotation on resource_exhausted
 */
async function chatStreamWithRotation(messages, modelUid, onText, maxRotations = 3) {
  for (let attempt = 0; attempt <= maxRotations; attempt++) {
    const keyInfo = attempt === 0 ? await keyManager.getKey() : await keyManager.rotateOnExhausted();
    if (!keyInfo) return { ok: false, error: 'no keys available' };

    const result = await chatStream(keyInfo.apiKey, modelUid, messages, onText);
    if (result.ok) return { ...result, email: keyInfo.email };
    if (result.error !== 'rate_limit') return result;
  }
  return { ok: false, error: `all ${keyManager.exhaustedCount} tried keys exhausted` };
}

// ═══════════════════════════════════════════════════════════════════════
// L4: Runtime — 号池集成 + CLI + HTTP API
// ═══════════════════════════════════════════════════════════════════════

// Key sources (ordered by priority)
const KEYPOOL_PATHS = [
  path.join(SCRIPT_DIR, '..', 'Windsurf万法归宗', 'data', 'keypool.json'),
  path.join(SCRIPT_DIR, '..', 'Windsurf万法归宗', '020-逆向_Reverse', 'data', 'keypool.json'),
  path.join(SCRIPT_DIR, '..', 'Windsurf万法归宗', '030-额度_Credits', 'engine', '_wam_snapshots.json'),
];

const ACCOUNTS_PATHS = [
  path.join(process.env.APPDATA || '', 'Windsurf', 'User', 'globalStorage', 'zhouyoukang.windsurf-assistant', 'windsurf-login-accounts.json'),
  path.join(process.env.APPDATA || '', 'Windsurf', 'User', 'globalStorage', 'undefined_publisher.windsurf-login-helper', 'windsurf-login-accounts.json'),
];

function loadKeyPool() {
  for (const p of KEYPOOL_PATHS) {
    try {
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (typeof data === 'object' && !Array.isArray(data)) return data;
      }
    } catch {}
  }
  return {};
}

function loadAccounts() {
  for (const p of ACCOUNTS_PATHS) {
    try {
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch {}
  }
  return [];
}

/**
 * Refresh a single pool entry via refreshToken → idToken → RegisterUser → fresh apiKey
 */
async function refreshPoolEntry(email, entry) {
  if (!entry.refreshToken) return null;
  try {
    const ref = await firebaseRefresh(entry.refreshToken);
    if (!ref.ok) return null;
    const reg = await registerUser(ref.idToken);
    if (!reg) return null;
    return { apiKey: reg.apiKey, email, source: 'refreshed', refreshToken: ref.refreshToken };
  } catch { return null; }
}

/**
 * Get best available apiKey — refreshes stale keys automatically
 * Priority: refresh pool tokens > state.vscdb > live Firebase login
 * @param {number} maxKeys — maximum number of keys to try refreshing
 */
async function getBestApiKey(maxKeys = 3) {
  const pool = loadKeyPool();
  const poolEntries = Object.entries(pool).filter(([, v]) => v.refreshToken);

  // Strategy 1: Refresh pool keys (most reliable — refreshTokens are long-lived)
  if (poolEntries.length > 0) {
    // Shuffle to distribute load across accounts
    for (let i = poolEntries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [poolEntries[i], poolEntries[j]] = [poolEntries[j], poolEntries[i]];
    }
    for (const [email, entry] of poolEntries.slice(0, maxKeys)) {
      process.stderr.write(`  trying ${email.substring(0, 20)}...`);
      const result = await refreshPoolEntry(email, entry);
      if (result) { process.stderr.write(' ✅\n'); return { ...result, count: poolEntries.length }; }
      process.stderr.write(' ✗\n');
    }
  }

  // Strategy 2: Windsurf state.vscdb (currently active session key)
  try {
    const stateDb = path.join(process.env.APPDATA || '', 'Windsurf', 'User', 'globalStorage', 'state.vscdb');
    if (fs.existsSync(stateDb)) {
      const dbBuf = fs.readFileSync(stateDb);
      const dbStr = dbBuf.toString('utf8');
      const m = dbStr.match(/sk-ws-01-[a-zA-Z0-9_-]{80,120}/);
      if (m) return { apiKey: m[0], source: 'state.vscdb' };
    }
  } catch {}

  // Strategy 3: Live Firebase login (slowest, needs email+password)
  const accounts = loadAccounts();
  for (const a of accounts.slice(0, 5)) {
    if (!a.email || !a.password) continue;
    try {
      const login = await firebaseLogin(a.email, a.password);
      if (!login.ok) continue;
      const reg = await registerUser(login.idToken);
      if (reg) return { apiKey: reg.apiKey, email: a.email, source: 'firebase_live' };
    } catch {}
  }

  return null;
}

/**
 * KeyManager — lazy key rotation with automatic refresh on exhaustion
 * Refreshes one key at a time to minimize TLS handshakes (GFW friendly)
 */
class KeyManager {
  constructor() {
    this._pool = [];       // [{email, entry}] — shuffled pool entries
    this._current = null;  // current refreshed keyInfo
    this._exhausted = new Set(); // emails of exhausted accounts
    this._pos = 0;         // position in pool
  }

  async init() {
    const pool = loadKeyPool();
    this._pool = Object.entries(pool)
      .filter(([, v]) => v.refreshToken)
      .map(([email, entry]) => ({ email, entry }));
    // Shuffle
    for (let i = this._pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this._pool[i], this._pool[j]] = [this._pool[j], this._pool[i]];
    }
    // Also try state.vscdb key as first candidate
    try {
      const stateDb = path.join(process.env.APPDATA || '', 'Windsurf', 'User', 'globalStorage', 'state.vscdb');
      if (fs.existsSync(stateDb)) {
        const dbStr = fs.readFileSync(stateDb).toString('latin1');
        const m = dbStr.match(/sk-ws-01-[a-zA-Z0-9_-]{80,120}/);
        if (m) this._current = { apiKey: m[0], source: 'state.vscdb', email: 'vscdb' };
      }
    } catch {}
    if (VERBOSE) process.stderr.write(`  KeyManager: ${this._pool.length} pool entries\n`);
  }

  /** Get current key, refreshing if needed */
  async getKey() {
    if (this._current) return this._current;
    return this._refreshNext();
  }

  /** Mark current key as exhausted and rotate to next */
  async rotateOnExhausted() {
    if (this._current?.email) {
      this._exhausted.add(this._current.email);
      if (VERBOSE) process.stderr.write(`  ⚠ ${this._current.email.substring(0, 20)} exhausted, rotating...\n`);
    }
    this._current = null;
    return this._refreshNext();
  }

  async _refreshNext() {
    for (let i = 0; i < Math.min(this._pool.length, 5); i++) {
      const idx = (this._pos + i) % this._pool.length;
      const { email, entry } = this._pool[idx];
      if (this._exhausted.has(email)) continue;
      const result = await refreshPoolEntry(email, entry);
      if (result) {
        this._current = result;
        this._pos = (idx + 1) % this._pool.length;
        return result;
      }
    }
    this._pos = (this._pos + 5) % this._pool.length;
    return null;
  }

  get poolSize() { return this._pool.length; }
  get exhaustedCount() { return this._exhausted.size; }
}

// Global key manager instance
const keyManager = new KeyManager();

/**
 * Chat with automatic key rotation on resource_exhausted
 */
async function chatWithRotation(messages, modelUid, maxRotations = 3) {
  for (let attempt = 0; attempt <= maxRotations; attempt++) {
    const keyInfo = attempt === 0 ? await keyManager.getKey() : await keyManager.rotateOnExhausted();
    if (!keyInfo) return { ok: false, error: 'no keys available (all exhausted or refresh failed)' };

    const result = await chat(keyInfo.apiKey, modelUid, messages);
    if (result.ok) return { ...result, email: keyInfo.email };
    if (result.error !== 'rate_limit') return result; // non-recoverable error
    // rate_limit → try next key
  }
  return { ok: false, error: `all ${keyManager.exhaustedCount} tried keys exhausted` };
}

// ═══════════════════════════════════════════════════════════════════════
// CLI REPL — 交互式Agent对话
// ═══════════════════════════════════════════════════════════════════════

async function runREPL() {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  道·Agent v${VERSION} — 独立运行时                  ║`);
  console.log(`║  反者道之动 · 完全脱离Windsurf IDE                ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);

  // Initialize KeyManager
  process.stdout.write('🔑 初始化密钥管理器...');
  await keyManager.init();
  const keyInfo = await keyManager.getKey();
  if (!keyInfo) {
    console.log(' ❌ 无可用apiKey');
    console.log('请确保: keypool.json 存在且包含有效 refreshToken');
    return;
  }
  console.log(` ✅ ${keyInfo.apiKey.substring(0, 20)}... (${keyInfo.source}) pool=${keyManager.poolSize}`);

  let currentModel = DEFAULT_MODEL;
  const modelInfo = MODELS[currentModel];
  console.log(`🤖 模型: ${modelInfo.name} (${modelInfo.uid}) ACU=${modelInfo.acu}`);
  console.log(`\n命令: /model <name> | /models | /status | /clear | /system <prompt> | /raw | /quit`);
  console.log(`────────────────────────────────────────────────────\n`);

  const history = []; // { role, content }
  let systemPrompt = '你是道·Agent，一个独立于任何IDE的AI助手。用中文回答。简洁直接。';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '道> ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // Commands
    if (input.startsWith('/')) {
      const [cmd, ...args] = input.split(/\s+/);
      switch (cmd) {
        case '/quit':
        case '/exit':
        case '/q':
          console.log('道法自然 · 再见');
          process.exit(0);
          break;

        case '/clear':
          history.length = 0;
          console.log('✅ 对话历史已清空\n');
          break;

        case '/model': {
          const name = args[0];
          if (!name) {
            console.log(`当前模型: ${MODELS[currentModel].name} (${currentModel})`);
          } else if (MODELS[name]) {
            currentModel = name;
            console.log(`✅ 切换到: ${MODELS[name].name} (${MODELS[name].uid}) ACU=${MODELS[name].acu}\n`);
          } else {
            // Try matching by uid
            const found = Object.entries(MODELS).find(([, v]) => v.uid === name);
            if (found) {
              currentModel = found[0];
              console.log(`✅ 切换到: ${found[1].name}\n`);
            } else {
              console.log(`❌ 未知模型: ${name}. 用 /models 查看可用模型\n`);
            }
          }
          break;
        }

        case '/models':
          console.log('\n可用模型:');
          for (const [alias, info] of Object.entries(MODELS)) {
            const mark = alias === currentModel ? ' ◄' : '';
            console.log(`  ${alias.padEnd(16)} ${info.name.padEnd(30)} ACU=${info.acu} [${info.tier}]${mark}`);
          }
          console.log('');
          break;

        case '/status': {
          console.log('查询账号状态...');
          const plan = await getPlanStatus(keyInfo.apiKey);
          if (plan) {
            console.log(`  计划: ${plan.planName}`);
            console.log(`  额度: 已用 ${plan.creditsUsed / 100} / 可用 ${plan.creditsAvailable / 100}`);
            console.log(`  配额: 日 ${plan.dailyQuotaPercent}% | 周 ${plan.weeklyQuotaPercent}%`);
          }
          const rl2 = await checkRateLimit(keyInfo.apiKey, MODELS[currentModel].uid);
          if (rl2) {
            console.log(`  速率: ${rl2.hasCapacity ? '✅有容量' : '❌已满'} ${rl2.messagesRemaining}/${rl2.maxMessages} 重置 ${rl2.resetsInSeconds}s`);
          }
          console.log('');
          break;
        }

        case '/system':
          if (args.length > 0) {
            systemPrompt = args.join(' ');
            console.log(`✅ System prompt 已更新: ${systemPrompt.substring(0, 80)}...\n`);
          } else {
            console.log(`当前 system prompt: ${systemPrompt}\n`);
          }
          break;

        case '/raw':
          if (history.length > 0) {
            const last = history[history.length - 1];
            console.log(`最近一轮:\n${JSON.stringify(last, null, 2)}\n`);
          }
          break;

        case '/key': {
          const cur = await keyManager.getKey();
          console.log(`apiKey: ${cur?.apiKey.substring(0, 30)}... (${cur?.source}) pool=${keyManager.poolSize} exhausted=${keyManager.exhaustedCount}\n`);
          break;
        }

        default:
          console.log(`未知命令: ${cmd}\n`);
      }
      rl.prompt();
      return;
    }

    // Chat message
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    // Add history
    for (const h of history) messages.push(h);
    // Add current user message
    messages.push({ role: 'user', content: input });

    process.stdout.write('\n');
    const t0 = Date.now();

    try {
      const result = await chatWithRotation(messages, MODELS[currentModel].uid);
      const elapsed = Date.now() - t0;

      if (result.ok && result.text) {
        history.push({ role: 'user', content: input });
        history.push({ role: 'assistant', content: result.text });

        console.log(result.text);
        const meta = [`${elapsed}ms`, `${result.rawLength}B`, MODELS[currentModel].name];
        if (result.tokens) meta.push(`${result.tokens}tok`);
        if (result.quotaCost) meta.push(`${result.quotaCost}bp`);
        if (result.email) meta.push(result.email.substring(0, 15));
        console.log(`\n  [${meta.join(' | ')}]\n`);
      } else {
        console.log(`❌ ${result.error?.substring(0, 200) || 'unknown error'}`);
        if (result.status) console.log(`  HTTP ${result.status}`);
        console.log('');
      }
    } catch (e) {
      console.log(`❌ ${e.message}\n`);
    }

    rl.prompt();
  });

  rl.on('close', () => { process.exit(0); });
}

// ═══════════════════════════════════════════════════════════════════════
// HTTP API 服务
// ═══════════════════════════════════════════════════════════════════════

async function runHTTPServer() {
  await keyManager.init();
  const keyInfo = await keyManager.getKey();
  if (!keyInfo) { console.log('❌ 无可用apiKey'); return; }

  console.log(`道·Agent HTTP API — :${HTTP_PORT}`);
  console.log(`apiKey: ${keyInfo.apiKey.substring(0, 20)}... (${keyInfo.source}) pool=${keyManager.poolSize}`);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    if (url.pathname === '/health' || url.pathname === '/') {
      res.end(JSON.stringify({ ok: true, version: VERSION, engine: 'dao-agent', pool: keyManager.poolSize, exhausted: keyManager.exhaustedCount }));
      return;
    }

    if (url.pathname === '/models') {
      res.end(JSON.stringify({ ok: true, models: MODELS }));
      return;
    }

    if (url.pathname === '/status') {
      const cur = await keyManager.getKey();
      const plan = cur ? await getPlanStatus(cur.apiKey) : null;
      res.end(JSON.stringify({ ok: !!plan, plan, pool: keyManager.poolSize, exhausted: keyManager.exhaustedCount }));
      return;
    }

    if (url.pathname === '/rate-limit') {
      const cur = await keyManager.getKey();
      const model = url.searchParams.get('model') || MODELS[DEFAULT_MODEL].uid;
      const rl = cur ? await checkRateLimit(cur.apiKey, model) : null;
      res.end(JSON.stringify({ ok: !!rl, rateLimit: rl }));
      return;
    }

    if (url.pathname === '/chat' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { messages, model, system } = JSON.parse(body);
          const modelUid = (model && MODELS[model]?.uid) || MODELS[DEFAULT_MODEL].uid;
          const msgs = [];
          if (system) msgs.push({ role: 'system', content: system });
          if (Array.isArray(messages)) msgs.push(...messages);

          const result = await chatWithRotation(msgs, modelUid);
          res.end(JSON.stringify(result));
        } catch (e) {
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    // OpenAI-compatible /v1/chat/completions endpoint (supports stream:true for SSE)
    if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { messages, model, stream } = JSON.parse(body);
          const modelAlias = Object.entries(MODELS).find(([, v]) => v.uid === model || v.name === model);
          const modelUid = modelAlias ? modelAlias[1].uid : MODELS[DEFAULT_MODEL].uid;
          const chatId = `dao-${Date.now()}`;

          if (stream) {
            // SSE streaming mode
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });
            const result = await chatStreamWithRotation(messages || [], modelUid, (delta) => {
              const chunk = { id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: modelUid, choices: [{ index: 0, delta: { content: delta }, finish_reason: null }] };
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            });
            // Send final chunk
            const done = { id: chatId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: modelUid, choices: [{ index: 0, delta: {}, finish_reason: result.ok ? 'stop' : 'error' }] };
            res.write(`data: ${JSON.stringify(done)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } else {
            // Non-streaming mode
            const result = await chatWithRotation(messages || [], modelUid);
            res.end(JSON.stringify({
              id: chatId,
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model: modelUid,
              choices: [{
                index: 0,
                message: { role: 'assistant', content: result.text || '' },
                finish_reason: result.ok ? 'stop' : 'error',
              }],
              usage: { total_tokens: result.tokens || 0, quota_cost_bp: result.quotaCost || 0 },
            }));
          }
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: { message: e.message } }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });

  server.listen(HTTP_PORT, '127.0.0.1', () => {
    console.log(`\n端点:`);
    console.log(`  GET  /health                  — 健康检查`);
    console.log(`  GET  /models                  — 可用模型`);
    console.log(`  GET  /status                  — 账号状态`);
    console.log(`  GET  /rate-limit?model=...    — 速率检查`);
    console.log(`  POST /chat                    — 对话 ({"messages":[...],"model":"..."})`);
    console.log(`  POST /v1/chat/completions     — OpenAI兼容 (drop-in替换)\n`);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 命令: auth — 认证链测试
// ═══════════════════════════════════════════════════════════════════════

async function cmdAuth() {
  console.log('═══ 认证链测试 ═══\n');

  const pool = loadKeyPool();
  const poolEntries = Object.entries(pool).filter(([, v]) => v.refreshToken);
  console.log(`keypool: ${Object.keys(pool).length}个 | 有refreshToken: ${poolEntries.length}个\n`);

  // Step 1: KeyManager init + first key
  console.log('[1] KeyManager初始化...');
  const t0 = Date.now();
  await keyManager.init();
  const keyInfo = await keyManager.getKey();
  const e0 = Date.now() - t0;
  if (keyInfo) {
    console.log(`  ✅ ${e0}ms — ${keyInfo.apiKey.substring(0, 25)}... (${keyInfo.source}) pool=${keyManager.poolSize}`);
    if (keyInfo.email) console.log(`  email: ${keyInfo.email.substring(0, 30)}`);
  } else {
    console.log(`  ❌ ${e0}ms — 无可用apiKey`);
    console.log('\n═══ 完成 ═══');
    return;
  }

  // Step 2: Quick chat test with auto-rotation
  console.log('\n[2] 快速Agent调用 (SWE-1.5 Free, 自动轮转)...');
  const t2 = Date.now();
  const chatResult = await chatWithRotation(
    [{ role: 'user', content: 'Reply exactly: DAO_OK' }],
    'MODEL_SWE_1_5', 5 // try up to 5 key rotations
  );
  const e2 = Date.now() - t2;
  if (chatResult.ok) {
    console.log(`  ✅ ${e2}ms — "${chatResult.text?.substring(0, 100)}"`);
    if (chatResult.email) console.log(`  account: ${chatResult.email.substring(0, 30)}`);
  } else {
    console.log(`  ❌ ${e2}ms — ${chatResult.error?.substring(0, 200)}`);
  }
  console.log(`  exhausted: ${keyManager.exhaustedCount}/${keyManager.poolSize}`);

  console.log('\n═══ 完成 ═══');
}

// ═══════════════════════════════════════════════════════════════════════
// 命令: status — 号池状态
// ═══════════════════════════════════════════════════════════════════════

async function cmdStatus() {
  console.log('═══ 号池状态 ═══\n');

  const pool = loadKeyPool();
  const entries = Object.entries(pool).filter(([, v]) => v.apiKey?.startsWith('sk-ws-01-'));
  console.log(`总账号: ${Object.keys(pool).length} | 有效apiKey: ${entries.length}\n`);

  for (const [email, entry] of entries.slice(0, 10)) {
    process.stdout.write(`  ${email.substring(0, 30).padEnd(32)}`);
    try {
      const rl = await checkRateLimit(entry.apiKey, MODELS[DEFAULT_MODEL].uid);
      if (rl) {
        const cap = rl.hasCapacity ? '✅' : '❌';
        console.log(`${cap} ${rl.messagesRemaining}/${rl.maxMessages} reset=${rl.resetsInSeconds}s`);
      } else {
        console.log('⚠ no response');
      }
    } catch (e) {
      console.log(`⚠ ${e.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 命令: chat — 单轮对话
// ═══════════════════════════════════════════════════════════════════════

async function cmdChat(message, modelAlias) {
  await keyManager.init();
  const keyInfo = await keyManager.getKey();
  if (!keyInfo) { console.log('❌ 无可用apiKey'); return; }

  const model = modelAlias && MODELS[modelAlias] ? modelAlias : DEFAULT_MODEL;
  const modelUid = MODELS[model].uid;

  console.log(`[${MODELS[model].name}] ${keyInfo.apiKey.substring(0, 15)}...\n`);

  const messages = [
    { role: 'system', content: '你是道·Agent。简洁回答。' },
    { role: 'user', content: message },
  ];

  const t0 = Date.now();
  const result = await chatWithRotation(messages, modelUid);
  const elapsed = Date.now() - t0;

  if (result.ok) {
    console.log(result.text);
    const meta = [`${elapsed}ms`, `${result.rawLength}B`];
    if (result.tokens) meta.push(`${result.tokens}tok`);
    if (result.email) meta.push(result.email.substring(0, 20));
    console.log(`\n[${meta.join(' | ')}]`);
  } else {
    console.log(`❌ ${result.error?.substring(0, 300)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 命令: scan — 快速扫描号池 (不刷新, 直接用stale key测试)
// ═══════════════════════════════════════════════════════════════════════

async function cmdScan() {
  console.log('═══ 号池快速扫描 ═══\n');
  const pool = loadKeyPool();
  const keys = Object.entries(pool).filter(([, v]) => v.apiKey?.startsWith('sk-ws-01-'));
  console.log(`扫描 ${keys.length} 个stale key (不刷新, 直接测试)...\n`);

  let ok = 0, exh = 0, err = 0;
  for (let i = 0; i < keys.length; i++) {
    const [email, entry] = keys[i];
    try {
      const r = await connectRPC(
        API_HOSTS[0],
        '/exa.api_server_pb.ApiServerService/GetChatMessage',
        buildChatRequest(entry.apiKey, 'MODEL_SWE_1_5', [{ role: 'user', content: 'OK' }]),
        CT_API, 15000
      );
      if (r.status === 0) { err++; process.stdout.write('E'); continue; }
      const txt = r.body ? r.body.toString('utf8') : '';
      if (txt.includes('resource_exhausted')) { exh++; process.stdout.write('.'); }
      else if (r.ok && !txt.includes('error')) {
        ok++;
        process.stdout.write('\n  ✅ ' + email.substring(0, 25) + ' — OK!\n');
      } else { err++; process.stdout.write('x'); }
    } catch (e) { err++; process.stdout.write('E'); }
  }
  console.log(`\n\n结果: ${ok} ✅可用 | ${exh} ⏳耗尽 | ${err} ❌错误 / ${keys.length} 总计`);
  if (ok === 0) console.log('\n所有账号配额耗尽, 等待配额重置或注册新账号');
}

// ═══════════════════════════════════════════════════════════════════════
// Main Entry
// ═══════════════════════════════════════════════════════════════════════

const cmd = process.argv[2];

if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(`
道·Agent v${VERSION} — 独立Agent运行时 (脱离Windsurf IDE)

用法: node dao_agent.js [command] [options]

命令:
  (无)           交互式REPL (默认)
  serve          启动HTTP API服务 (:${HTTP_PORT})
  auth           认证链测试 + 快速Agent调用
  scan           快速扫描号池 (不刷新, 直接测试所有key)
  chat <msg>     单轮对话
  status         号池状态 (CheckRateLimit)
  models         列出可用模型
  help           显示此帮助

选项:
  --verbose      详细网络日志

HTTP API 端点 (serve模式):
  GET  /health                    健康检查
  GET  /models                    可用模型
  GET  /status                    账号状态
  POST /chat                      对话 {"messages":[...],"model":"..."}
  POST /v1/chat/completions       OpenAI兼容 (支持stream:true SSE)

启动器: →道Agent.cmd (自动清理NODE_EXTRA_CA_CERTS)
`);
  process.exit(0);
}

switch (cmd) {
  case 'chat':
    cmdChat(process.argv[3] || 'Hello, reply OK', process.argv[4]).catch(console.error);
    break;
  case 'serve':
  case 'server':
    runHTTPServer().catch(console.error);
    break;
  case 'auth':
    cmdAuth().catch(console.error);
    break;
  case 'status':
    cmdStatus().catch(console.error);
    break;
  case 'scan':
    cmdScan().catch(console.error);
    break;
  case 'models':
    console.log('\n道·Agent 可用模型:\n');
    for (const [alias, info] of Object.entries(MODELS)) {
      console.log(`  ${alias.padEnd(16)} ${info.name.padEnd(30)} ACU=${info.acu} [${info.tier}]`);
    }
    console.log(`\n默认: ${DEFAULT_MODEL} (${MODELS[DEFAULT_MODEL].name})`);
    break;
  default:
    runREPL().catch(console.error);
}
