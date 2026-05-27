// 反者道之动 · 印272 chat 实证 (非流式 · 直接看 raw body)
// usage: node chat_nostream.js <tunnel_url> <model> "<msg>"
"use strict";
const net = require("net");
const tls = require("tls");

const TUNNEL_URL = process.argv[2];
const MODEL = process.argv[3] || "openai/gpt-4o-mini";
const MSG = process.argv[4] || "Reply in one short sentence: 道法自然";

if (!TUNNEL_URL) {
  console.error("usage: node chat_nostream.js <tunnel_url> <model> <msg>");
  process.exit(2);
}

const u = new URL(TUNNEL_URL);
const HOST = u.hostname;

function postChat(streamMode) {
  return new Promise((resolve) => {
    const sock = net.connect(7890, "127.0.0.1");
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
        return resolve({ ok: false, err: "CONNECT: " + head.slice(0, 80) });
      }
      sock.removeAllListeners("data");
      phase = "tls";
      const t = tls.connect(
        { socket: sock, servername: HOST, rejectUnauthorized: false },
        () => {
          const body = JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content: MSG }],
            max_tokens: 80,
            stream: streamMode,
          });
          t.write(
            [
              `POST /v1/chat/completions HTTP/1.1`,
              `Host: ${HOST}`,
              `Content-Type: application/json`,
              `Content-Length: ${Buffer.byteLength(body)}`,
              `Accept: ${streamMode ? "text/event-stream" : "application/json"}`,
              `Connection: close`,
              ``,
              body,
            ].join("\r\n"),
          );
        },
      );
      t.setTimeout(120000);
      const bufs = [];
      t.on("data", (c) => bufs.push(c));
      t.on("end", () => {
        const raw = Buffer.concat(bufs).toString("utf8");
        const i = raw.indexOf("\r\n\r\n");
        const head2 = raw.slice(0, i);
        let body2 = raw.slice(i + 4);
        const m = head2.match(/^HTTP\/1\.1 (\d+)/);
        const status = m ? parseInt(m[1], 10) : 0;
        if (/transfer-encoding:\s*chunked/i.test(head2)) {
          const parts = [];
          let p = 0;
          while (p < body2.length) {
            const nl = body2.indexOf("\r\n", p);
            if (nl < 0) break;
            const sz = parseInt(body2.slice(p, nl), 16);
            if (!sz) break;
            parts.push(body2.slice(nl + 2, nl + 2 + sz));
            p = nl + 2 + sz + 2;
          }
          body2 = parts.join("");
        }
        resolve({ ok: true, status, body: body2, head: head2 });
      });
      t.on("error", (e) => resolve({ ok: false, err: "tls: " + e.message }));
      t.on("timeout", () => {
        t.destroy();
        resolve({ ok: false, err: "tls_timeout" });
      });
    });
    sock.on("error", (e) => resolve({ ok: false, err: "sock: " + e.message }));
    sock.on("timeout", () => {
      sock.destroy();
      resolve({ ok: false, err: "sock_timeout" });
    });
  });
}

(async () => {
  console.log(`tunnel: ${TUNNEL_URL}`);
  console.log(`model:  ${MODEL}`);
  console.log(`msg:    ${MSG}`);

  // 1. non-stream
  console.log(`\n── non-stream ──`);
  const r1 = await postChat(false);
  if (!r1.ok) {
    console.log(`fail: ${r1.err}`);
  } else {
    console.log(`status: ${r1.status}`);
    console.log(`body  : ${r1.body.slice(0, 1500)}`);
    try {
      const j = JSON.parse(r1.body);
      const c = j.choices?.[0]?.message?.content || j.choices?.[0]?.delta?.content;
      if (c) console.log(`\n✓ AI 真答: ${c}`);
    } catch {}
  }
})();
