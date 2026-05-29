// 扫 8889..8988 · 列各端口 proxy 状 · 道法自然
const http = require('http');
const fs = require('fs');
const path = require('path');

const ports = [];
for (let p = 8889; p <= 8988; p++) ports.push(p);

let done = 0;
const found = [];

ports.forEach((p) => {
  const req = http.get(
    { host: '127.0.0.1', port: p, path: '/origin/preview', timeout: 800 },
    (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => {
        try {
          const j = JSON.parse(d);
          found.push({
            port: p,
            pid: j.pid,
            uptime_s: j.uptime_s,
            mode: j.mode,
            dao_chars: j.dao_chars,
            canon: j.canon,
            canon_chars: j.canon_chars,
            tao_header_chars: j.tao_header_chars,
            req_total: j.req_total,
          });
        } catch (e) {
          found.push({ port: p, parse_err: e.message, head: d.slice(0, 80) });
        }
        done++;
        if (done === ports.length) finish();
      });
    }
  );
  req.on('error', () => {
    done++;
    if (done === ports.length) finish();
  });
  req.on('timeout', () => req.destroy());
});

function finish() {
  const out = path.join(__dirname, '_scan_proxies.out.json');
  fs.writeFileSync(out, JSON.stringify(found, null, 2), 'utf8');
  console.log('found ' + found.length + ' proxy/proxies · written: ' + out);
  process.exit(0);
}

setTimeout(() => {
  finish();
}, 6000);
