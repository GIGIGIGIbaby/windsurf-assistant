// 走 :7890 代理调 hdougle proxy 之 chat · 含 retry
const net = require("net");
const tls = require("tls");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TUNNEL_URL =
  process.argv[2] ||
  (() => {
    // 从 last_run.json 不能拿 url, 但可从 ~/.dao/hdougle/tunnel.json (若 wait_tunnel 写盘) 或参数
    return null;
  })();

if (!TUNNEL_URL) {
  console.error(
    "usage: node chat_via_proxy.js https://xxx.trycloudflare.com [model] [msg]",
  );
  process.exit(2);
}

const u = new URL(TUNNEL_URL);
const HOST = u.hostname;
const MODEL = process.argv[3] || "swe-1.5";
const MSG = process.argv[4] || "Reply briefly with: hello world";

const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 7890;

function postChat() {
  return new Promise((resolve) => {
    const sock = net.connect(PROXY_PORT, PROXY_HOST);
    sock.setTimeout(60000);
    let phase = "connect";
    let connectBuf = Buffer.alloc(0);
    sock.on("connect", () => {
      sock.write(`CONNECT ${HOST}:443 HTTP/1.1\r\nHost: ${HOST}:443\r\n\r\n`);
    });
    sock.on("data", (chunk) => {
      if (phase !== "connect") return;
      connectBuf = Buffer.concat([connectBuf, chunk]);
      if (connectBuf.indexOf("\r\n\r\n") < 0) return;
      const head = connectBuf.toString("utf8").split("\r\n\r\n")[0];
      if (!head.startsWith("HTTP/1.1 200")) {
        sock.destroy();
        return resolve({
          ok: false,
          error: "CONNECT_failed: " + head.slice(0, 80),
        });
      }
      sock.removeAllListeners("data");
      phase = "tls";
      const t = tls.connect(
        { socket: sock, servername: HOST, rejectUnauthorized: false },
        () => {
          const body = JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content: MSG }],
            max_tokens: 50,
            stream: true, // dao_proxy 默认 stream 真生效
          });
          const lines = [
            `POST /v1/chat/completions HTTP/1.1`,
            `Host: ${HOST}`,
            `Content-Type: application/json`,
            `Content-Length: ${Buffer.byteLength(body)}`,
            `Accept: application/json`,
            `Connection: close`,
            ``,
            body,
          ];
          t.write(lines.join("\r\n"));
        },
      );
      t.setTimeout(120000);
      const bufs = [];
      t.on("data", (c) => bufs.push(c));
      t.on("end", () => {
        const raw = Buffer.concat(bufs).toString("utf8");
        const i = raw.indexOf("\r\n\r\n");
        if (i < 0) return resolve({ ok: false, error: "no_body_sep" });
        const headStr = raw.slice(0, i);
        let bodyStr = raw.slice(i + 4);
        const m = headStr.match(/^HTTP\/1\.1 (\d+)/);
        const status = m ? parseInt(m[1], 10) : 0;
        if (/transfer-encoding:\s*chunked/i.test(headStr)) {
          const parts = [];
          let p = 0;
          while (p < bodyStr.length) {
            const nl = bodyStr.indexOf("\r\n", p);
            if (nl < 0) break;
            const sz = parseInt(bodyStr.slice(p, nl), 16);
            if (!sz) break;
            parts.push(bodyStr.slice(nl + 2, nl + 2 + sz));
            p = nl + 2 + sz + 2;
          }
          bodyStr = parts.join("");
        }
        let j = null;
        try {
          j = JSON.parse(bodyStr);
        } catch {}
        resolve({ ok: true, status, body: j, raw_body: bodyStr });
      });
      t.on("error", (e) => resolve({ ok: false, error: "tls: " + e.message }));
      t.on("timeout", () => {
        t.destroy();
        resolve({ ok: false, error: "tls_timeout" });
      });
    });
    sock.on("error", (e) =>
      resolve({ ok: false, error: "sock: " + e.message }),
    );
    sock.on("timeout", () => {
      sock.destroy();
      resolve({ ok: false, error: "sock_timeout" });
    });
  });
}

(async () => {
  console.log(`tunnel: ${TUNNEL_URL}`);
  console.log(`model:  ${MODEL}`);
  console.log(`msg:    ${MSG}`);
  console.log(``);
  for (let i = 0; i < 6; i++) {
    process.stdout.write(`attempt ${i + 1}/6 ... `);
    const r = await postChat();
    if (r.ok) {
      console.log(`status=${r.status}`);
      if (r.status === 200) {
        const c =
          r.body?.choices?.[0]?.message?.content ||
          r.body?.choices?.[0]?.delta?.content ||
          JSON.stringify(r.body);
        console.log(`\n=== AI 真返答 ===`);
        console.log(c);
      } else {
        console.log(JSON.stringify(r.body, null, 2).slice(0, 800));
      }
      return;
    }
    console.log(`fail: ${r.error}`);
    await new Promise((r) => setTimeout(r, 2000 + i * 1000));
  }
  console.log("✗ 6 retries all failed");
})();
