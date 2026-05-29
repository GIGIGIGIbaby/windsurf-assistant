// _force_reload · POST /_quit · 等 ext-host watchdog 周期 · 验 silk 已载
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8937;
const log = [];
function L(msg) {
  console.log(msg);
  log.push(msg);
}

function req(method, p, body) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: p,
        method,
        timeout: 3000,
        headers: data
          ? { 'content-type': 'application/json', 'content-length': data.length }
          : {},
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(d) });
          } catch {
            resolve({ status: res.statusCode, raw: d.slice(0, 200) });
          }
        });
      }
    );
    r.on('error', (e) => resolve({ err: e.code || e.message }));
    r.on('timeout', () => {
      r.destroy();
      resolve({ err: 'TIMEOUT' });
    });
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  L('--- BEFORE ---');
  const before = await req('GET', '/origin/ping');
  L(JSON.stringify({ uptime: before.body && before.body.uptime_s, dao_chars: before.body && before.body.dao_chars, dao_loaded: before.body && before.body.dao_loaded }));

  L('--- POST /origin/_quit ---');
  const quit = await req('POST', '/origin/_quit', { reason: 'force-reload-after-silk-restore' });
  L(JSON.stringify(quit));

  L('--- 等 60s · watchdog 周期是 30s · 给 2 个周期余量 ---');
  for (let s = 60; s > 0; s -= 10) {
    await new Promise((r) => setTimeout(r, 10000));
    const ping = await req('GET', '/origin/ping');
    if (ping.body && ping.body.ok) {
      L(`t=${60 - s + 10}s · UP · uptime=${ping.body.uptime_s} · dao_chars=${ping.body.dao_chars} · dao_loaded=${ping.body.dao_loaded}`);
      if (ping.body.uptime_s < 60 && ping.body.dao_chars > 0) {
        L('✓ ✓ RELOAD SUCCESS · 新 module 起 · silk 载入');
        fs.writeFileSync(path.join(__dirname, '_force_reload.out.log'), log.join('\n'), 'utf8');
        process.exit(0);
      }
    } else {
      L(`t=${60 - s + 10}s · DOWN · ${ping.err || 'no resp'}`);
    }
  }

  const after = await req('GET', '/origin/ping');
  L('--- AFTER ---');
  L(JSON.stringify({ ok: after.body && after.body.ok, uptime: after.body && after.body.uptime_s, dao_chars: after.body && after.body.dao_chars, dao_loaded: after.body && after.body.dao_loaded }));

  fs.writeFileSync(path.join(__dirname, '_force_reload.out.log'), log.join('\n'), 'utf8');
  if (after.body && after.body.dao_chars > 0) process.exit(0);
  process.exit(2);
})();
