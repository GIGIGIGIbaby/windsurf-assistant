// _quit_and_verify · POST /_quit 旧 8937 proxy · 让位 · 等 watchdog 复活 · 验 silk loaded
// 道义: 二十二章「夫唯不争 故莫能与之争」 · 让位即胜
const http = require('http');
const fs = require('fs');
const path = require('path');

function httpJson(method, port, urlpath, body) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: urlpath,
        method,
        timeout: 3000,
        headers: data
          ? {
              'content-type': 'application/json',
              'content-length': data.length,
            }
          : {},
      },
      (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          try {
            resolve({ status: r.statusCode, body: JSON.parse(d) });
          } catch {
            resolve({ status: r.statusCode, raw: d.slice(0, 100) });
          }
        });
      }
    );
    req.on('error', (e) => resolve({ err: e.code || e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ err: 'TIMEOUT' });
    });
    if (data) req.write(data);
    req.end();
  });
}

async function scanProxies() {
  const ports = [];
  for (let p = 8889; p <= 8988; p++) ports.push(p);
  const results = await Promise.all(
    ports.map(async (p) => {
      const r = await httpJson('GET', p, '/origin/preview');
      if (r.body && r.body.pid) {
        return {
          port: p,
          pid: r.body.pid,
          uptime_s: r.body.uptime_s,
          dao_chars: r.body.dao_chars,
          tao_header_chars: r.body.tao_header_chars,
          mode: r.body.mode,
          req_total: r.body.req_total,
        };
      }
      return null;
    })
  );
  return results.filter(Boolean);
}

(async () => {
  const log = [];
  function L(msg) {
    console.log(msg);
    log.push(msg);
  }

  L('--- 步一: 扫前 ---');
  const before = await scanProxies();
  L('proxies before: ' + JSON.stringify(before, null, 2));

  if (!before.length) {
    L('NO PROXY · 跳过 quit');
  } else {
    const target = before[0];
    L(
      `--- 步二: POST /origin/_quit @ :${target.port} (pid=${target.pid}) ---`
    );
    const quitResp = await httpJson('POST', target.port, '/origin/_quit', {
      reason: 'silk-files-now-on-disk · need-reload',
    });
    L('quit resp: ' + JSON.stringify(quitResp));
  }

  L('--- 步三: 等 watchdog 周期 (35s · ext.js setInterval 30s + buffer) ---');
  for (let i = 35; i > 0; i -= 5) {
    await new Promise((r) => setTimeout(r, 5000));
    L(`waiting... ${i - 5}s remain`);
  }

  L('--- 步四: 扫后 ---');
  const after = await scanProxies();
  L('proxies after: ' + JSON.stringify(after, null, 2));

  // 写日志
  const outFile = path.join(__dirname, '_quit_and_verify.out.log');
  fs.writeFileSync(outFile, log.join('\n'), 'utf8');
  L('--- log 已写: ' + outFile + ' ---');

  // 判定
  if (after.length && after[0].dao_chars > 0) {
    L('✓ ✓ ✓ SUCCESS · dao_chars=' + after[0].dao_chars + ' · silk loaded');
    process.exit(0);
  } else if (after.length === 0) {
    L('✗ proxy 未复活 · 可能 watchdog 未触 · 主公需重启 Windsurf');
    process.exit(2);
  } else {
    L('✗ dao_chars 仍为 0 · 重起后 silk 未载 · 检查文件路径');
    process.exit(3);
  }
})();
