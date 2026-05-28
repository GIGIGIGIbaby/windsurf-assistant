#!/usr/bin/env node
// 用 :7890 代理验证 hdougle PAT
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const net = require("net");
const tls = require("tls");

const TOKEN_FILE = path.join(os.homedir(), ".dao", "hdougle", "token");
const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 7890;

const token = fs.readFileSync(TOKEN_FILE, "utf8").trim();
console.log(`token = ${token.slice(0, 12)}...${token.slice(-4)} (len=${token.length})`);

function ghReq(host, urlPath, headers = {}) {
  return new Promise((resolve) => {
    const sock = net.connect(PROXY_PORT, PROXY_HOST);
    sock.setTimeout(20000);
    let phase = "connect"; // connect → tls
    let connectBuf = Buffer.alloc(0);

    sock.on("connect", () => {
      sock.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`);
    });

    sock.on("data", (chunk) => {
      if (phase === "connect") {
        connectBuf = Buffer.concat([connectBuf, chunk]);
        const sepIdx = connectBuf.indexOf("\r\n\r\n");
        if (sepIdx < 0) return; // 等更多
        const head = connectBuf.slice(0, sepIdx).toString("utf8");
        if (!head.startsWith("HTTP/1.1 200")) {
          sock.destroy();
          return resolve({ ok: false, error: "CONNECT failed", head });
        }
        // 切换 TLS。如果 head 之后还有数据 (一般没)，丢弃 (HTTP CONNECT 后 sock 应当干净)
        // 移除监听器，避免数据冲入 net 而非 tls
        sock.removeAllListeners("data");
        phase = "tls";
        const t = tls.connect(
          { socket: sock, servername: host, rejectUnauthorized: false },
          () => {
            const lines = [
              `GET ${urlPath} HTTP/1.1`,
              `Host: ${host}`,
              `User-Agent: dao-hdougle/1.0`,
              `Accept: application/vnd.github+json`,
              `Connection: close`,
            ];
            for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
            lines.push("");
            lines.push("");
            t.write(lines.join("\r\n"));
          },
        );
        const bufs = [];
        t.on("data", (c) => bufs.push(c));
        t.on("end", () => {
          const raw = Buffer.concat(bufs).toString("utf8");
          const i = raw.indexOf("\r\n\r\n");
          if (i < 0) return resolve({ ok: false, error: "no body sep", raw });
          const headStr = raw.slice(0, i);
          let body = raw.slice(i + 4);
          const m = headStr.match(/^HTTP\/1\.1 (\d+)/);
          const status = m ? parseInt(m[1], 10) : 0;
          if (/transfer-encoding:\s*chunked/i.test(headStr)) {
            const parts = [];
            let p = 0;
            while (p < body.length) {
              const nl = body.indexOf("\r\n", p);
              if (nl < 0) break;
              const sz = parseInt(body.slice(p, nl), 16);
              if (!sz) break;
              parts.push(body.slice(nl + 2, nl + 2 + sz));
              p = nl + 2 + sz + 2;
            }
            body = parts.join("");
          }
          let j = null;
          try { j = JSON.parse(body); } catch {}
          resolve({ ok: status === 200, status, body: j, raw_body: body });
        });
        t.on("error", (e) => resolve({ ok: false, error: "tls: " + e.message }));
      }
    });

    sock.on("error", (e) => resolve({ ok: false, error: "sock: " + e.message }));
    sock.on("timeout", () => { sock.destroy(); resolve({ ok: false, error: "timeout" }); });
  });
}

(async () => {
  console.log("=== /user ===");
  const r = await ghReq("api.github.com", "/user", { Authorization: `Bearer ${token}` });
  console.log(JSON.stringify(r, null, 2).slice(0, 800));

  if (r.ok && r.body) {
    console.log("\n=== /user/repos?per_page=3 ===");
    const r2 = await ghReq("api.github.com", "/user/repos?per_page=3", { Authorization: `Bearer ${token}` });
    console.log(`status = ${r2.status}, count = ${Array.isArray(r2.body) ? r2.body.length : '?'}`);
    if (Array.isArray(r2.body)) {
      r2.body.forEach((r) => console.log(`  - ${r.full_name} (${r.private ? "private" : "public"})`));
    }
  }
})();
