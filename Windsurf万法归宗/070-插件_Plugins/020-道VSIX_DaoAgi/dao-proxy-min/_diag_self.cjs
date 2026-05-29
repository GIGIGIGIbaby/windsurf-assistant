// 诊 8937 proxy · 看 self_file 路径与 silk 状态
const http = require('http');
const fs = require('fs');
const path = require('path');

http
  .get('http://127.0.0.1:8937/origin/ping', (r) => {
    let d = '';
    r.on('data', (c) => (d += c));
    r.on('end', () => {
      try {
        const j = JSON.parse(d);
        const out = {
          port: j.port,
          pid: j.pid,
          uptime_s: j.uptime_s,
          mode: j.mode,
          self_file: j.self_file,
          self_size: j.self_size,
          dao_chars: j.dao_chars,
          dao_loaded: j.dao_loaded,
          canon: j.canon,
          canon_chars: j.canon_chars,
          canon_name: j.canon_name,
          features: j.features
            ? {
                tao_header_chars: j.features.tao_header_chars,
                dao_chars: j.features.dao_chars,
              }
            : null,
        };
        console.log(JSON.stringify(out, null, 2));

        // 检查 self_file 处的 vendor/bundled-origin 是否有 silk files
        if (j.self_file) {
          const vendorDir = path.dirname(j.self_file);
          console.log('--- vendor dir: ' + vendorDir + ' ---');
          const silkFiles = ['_silk_de.txt', '_silk_dao.txt', '_yinfu.txt'];
          for (const f of silkFiles) {
            const fp = path.join(vendorDir, f);
            const exists = fs.existsSync(fp);
            const size = exists ? fs.statSync(fp).size : 0;
            console.log(`  ${f}: exists=${exists} size=${size}`);
          }
        }

        fs.writeFileSync(
          path.join(__dirname, '_diag_self.out.json'),
          JSON.stringify(out, null, 2),
          'utf8'
        );
      } catch (e) {
        console.log('parse err:', e.message, 'body:', d.slice(0, 500));
      }
    });
  })
  .on('error', (e) => console.log('ERR:', e.message));
