// Firebase connectivity diagnostic
const http = require("http");
const https = require("https");
const tls = require("tls");

const KEY = "AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY";
const HOST = "identitytoolkit.googleapis.com";
const PATH = `/v1/accounts:signInWithPassword?key=${KEY}`;
const BODY = JSON.stringify({
  email: "test@test.com",
  password: "testpass123",
  returnSecureToken: true,
});

async function testDirect() {
  return new Promise((resolve) => {
    console.log("[direct] Connecting to", HOST);
    const req = https.request(
      {
        hostname: HOST,
        path: PATH,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(BODY),
        },
        timeout: 8000,
        agent: false,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          console.log(
            "[direct] Status:",
            res.statusCode,
            "Body:",
            d.substring(0, 300),
          );
          resolve(d);
        });
      },
    );
    req.on("error", (e) => {
      console.log("[direct] ERROR:", e.code, e.message);
      resolve(null);
    });
    req.on("timeout", () => {
      req.destroy();
      console.log("[direct] TIMEOUT 8s");
      resolve(null);
    });
    req.write(BODY);
    req.end();
  });
}

async function testProxy() {
  return new Promise((resolve) => {
    console.log("[proxy] CONNECT via 127.0.0.1:7890");
    const conn = http.request({
      host: "127.0.0.1",
      port: 7890,
      method: "CONNECT",
      path: `${HOST}:443`,
      timeout: 5000,
      agent: false,
    });
    conn.on("connect", (res, socket) => {
      console.log("[proxy] CONNECT status:", res.statusCode);
      if (res.statusCode !== 200) {
        socket.destroy();
        resolve(null);
        return;
      }
      const tlsSock = tls.connect({ socket, servername: HOST }, () => {
        console.log("[proxy] TLS handshake OK");
        const data = `POST ${PATH} HTTP/1.1\r\nHost: ${HOST}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(BODY)}\r\nConnection: close\r\n\r\n${BODY}`;
        tlsSock.write(data);
        let resp = "";
        tlsSock.on("data", (c) => (resp += c));
        tlsSock.on("end", () => {
          const bodyStart = resp.indexOf("\r\n\r\n");
          const body = bodyStart >= 0 ? resp.substring(bodyStart + 4) : resp;
          console.log("[proxy] Body:", body.substring(0, 800));
          resolve(body);
        });
      });
      tlsSock.on("error", (e) => {
        console.log("[proxy] TLS error:", e.message);
        resolve(null);
      });
      setTimeout(() => {
        tlsSock.destroy();
        console.log("[proxy] TLS TIMEOUT 10s");
        resolve(null);
      }, 10000);
    });
    conn.on("error", (e) => {
      console.log("[proxy] CONNECT error:", e.message);
      resolve(null);
    });
    conn.on("timeout", () => {
      conn.destroy();
      console.log("[proxy] CONNECT TIMEOUT");
      resolve(null);
    });
    conn.end();
  });
}

(async () => {
  await testProxy();
  console.log("---");
  await testDirect();
  process.exit(0);
})();
