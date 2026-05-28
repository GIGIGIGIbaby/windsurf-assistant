// 不走代理直连 trycloudflare · 测 chat (cn 国内 cloudflare 通)
const https = require("https");

const TUNNEL = process.argv[2] || process.exit(2);
const MODEL = process.argv[3] || "swe-1.5";
const MSG = process.argv[4] || "Say only: ok";

const u = new URL(TUNNEL);

const body = JSON.stringify({
  model: MODEL,
  messages: [{ role: "user", content: MSG }],
  max_tokens: 30,
  stream: false,
});

const req = https.request(
  {
    hostname: u.hostname,
    port: 443,
    path: "/v1/chat/completions",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
    timeout: 180000,
    rejectUnauthorized: false,
  },
  (r) => {
    let d = "";
    r.on("data", (c) => (d += c));
    r.on("end", () => {
      console.log("STATUS=", r.statusCode);
      console.log("BODY:", d.slice(0, 2500));
      try {
        const j = JSON.parse(d);
        const c = j.choices?.[0]?.message?.content;
        if (c) console.log("\n=== AI ===\n" + c);
      } catch {}
    });
  },
);
req.on("error", (e) => console.log("ERR:", e.message));
req.on("timeout", () => {
  req.destroy();
  console.log("TIMEOUT");
});
req.end(body);
