// 公开 (无 PAT) 验两 release 是否对外可见
const tls = require('tls');
const net = require('net');
const fs = require('fs');
const path = require('path');

function pubGet(host, p) {
  return new Promise((resolve) => {
    const sock = net.connect(7890, '127.0.0.1');
    sock.on('error', (e) => resolve({ err: 'proxy-' + e.code }));
    sock.once('connect', () => {
      sock.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`);
    });
    sock.once('data', (d) => {
      if (!d.toString().startsWith('HTTP/1.1 200')) {
        return resolve({ err: 'connect-fail-' + d.toString().slice(0, 50) });
      }
      const t = tls.connect({ socket: sock, servername: host });
      t.on('secureConnect', () => {
        t.write(
          `GET ${p} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: dao\r\nAccept: application/vnd.github+json\r\nConnection: close\r\n\r\n`
        );
      });
      let buf = Buffer.alloc(0);
      t.on('data', (c) => (buf = Buffer.concat([buf, c])));
      t.on('end', () => {
        const text = buf.toString('utf8');
        const headEnd = text.indexOf('\r\n\r\n');
        const head = text.slice(0, headEnd);
        const json = text.slice(headEnd + 4);
        const status = parseInt(head.match(/HTTP\/[\d.]+ (\d+)/)?.[1] || '0', 10);
        try {
          resolve({ status, body: JSON.parse(json) });
        } catch {
          resolve({ status, _raw: text.slice(0, 300) });
        }
      });
      t.on('error', (e) => resolve({ err: 'tls-' + e.code }));
    });
  });
}

(async () => {
  const out = {};
  for (const owner of ['zhouyoukang', 'zhouyoukang1234-spec']) {
    const r = await pubGet(
      'api.github.com',
      `/repos/${owner}/windsurf-assistant/releases/tags/v9.9.53`
    );
    if (r.status === 200 && r.body) {
      out[owner] = {
        tag: r.body.tag_name,
        name: r.body.name,
        html_url: r.body.html_url,
        published_at: r.body.published_at,
        assets: (r.body.assets || []).map((a) => ({
          name: a.name,
          size: a.size,
          download_count: a.download_count,
          download: a.browser_download_url,
        })),
      };
    } else {
      out[owner] = { err: 'lookup-failed', status: r.status, detail: r };
    }
  }
  const result = JSON.stringify(out, null, 2);
  console.log(result);
  fs.writeFileSync(path.join(__dirname, '_verify_releases.out.json'), result, 'utf8');
})();
