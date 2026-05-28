// Probe streaming RPC variations
"use strict";

const http = require("node:http");
const ROOT = "V:\\道\\道生一\\一生二\\Windsurf万法归宗\\070-插件_Plugins\\040-道反代_LanProxy\\dao-lan-proxy";
const lsBridge = require(ROOT + "\\ls-bridge.js");
const codec = require(ROOT + "\\proto-codec.js");
const SVC = "/exa.language_server_pb.LanguageServerService";

async function tryProbe(port, csrf, headers, body, label) {
  return new Promise((resolve) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: `${SVC}/StreamCascadeReactiveUpdates`,
      method: "POST",
      headers: { ...headers, "content-length": body.length, "x-codeium-csrf-token": csrf },
      timeout: 5000,
    }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const parser = new codec.ConnectFrameParser();
        const frames = parser.push(buf);
        const errs = frames.filter(f => f.flags === 0x02).map(f => f.payload.toString("utf8"));
        const datas = frames.filter(f => f.flags !== 0x02).map(f => f.payload.length + "b");
        console.log(`[${label}] status=${res.statusCode} ct=${res.headers["content-type"]} bytes=${buf.length} frames=${frames.length}`);
        if (datas.length) console.log(`  data: ${datas.join(", ")}`);
        if (errs.length) console.log(`  trailer: ${errs.join(" | ")}`);
        resolve();
      });
    });
    req.on("error", e => { console.log(`[${label}] ERR ${e.message}`); resolve(); });
    req.on("timeout", () => { req.destroy(); console.log(`[${label}] timeout`); resolve(); });
    req.write(body);
    req.end();
  });
}

async function main() {
  const ls = lsBridge.discoverLS(true);
  const ak = lsBridge.extractApiKey(true);
  console.log(`LS pid=${ls.pid} port=${ls.port}`);

  const meta = {
    ideName: "windsurf",
    extensionVersion: "1.48.2",
    apiKey: ak.apiKey,
    locale: "en-US",
    ideVersion: "2.0.44",
    extensionName: "windsurf",
  };

  // First start a cascade so there's something to stream
  const startRes = await new Promise(r => {
    const body = Buffer.from(JSON.stringify({ metadata: meta }));
    const req = http.request({
      host: "127.0.0.1", port: ls.port,
      path: SVC + "/StartCascade", method: "POST",
      headers: { "content-type": "application/json", "connect-protocol-version": "1", "x-codeium-csrf-token": ls.csrf, "content-length": body.length },
      timeout: 5000,
    }, (res) => {
      const chunks = []; res.on("data", c => chunks.push(c));
      res.on("end", () => r({ body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", () => r({}));
    req.write(body); req.end();
  });
  const cascadeId = JSON.parse(startRes.body).cascadeId;
  console.log(`cascadeId=${cascadeId}`);

  const reqBody = { metadata: meta, cascadeId };
  const json = JSON.stringify(reqBody);
  const jsonBuf = Buffer.from(json, "utf8");
  const framed = codec.wrapConnectFrame(jsonBuf);

  // Variations
  await tryProbe(ls.port, ls.csrf, { "content-type": "application/connect+json", "connect-protocol-version": "1" }, framed, "1.connect+json,protover=1");
  await tryProbe(ls.port, ls.csrf, { "content-type": "application/connect+json", "Connect-Protocol-Version": "1" }, framed, "2.connect+json,Cap-protover=1");
  await tryProbe(ls.port, ls.csrf, { "content-type": "application/connect+json" }, framed, "3.connect+json,no-version");
  await tryProbe(ls.port, ls.csrf, { "content-type": "application/connect+proto", "connect-protocol-version": "1" }, framed, "4.connect+proto,protover=1");
  await tryProbe(ls.port, ls.csrf, { "content-type": "application/grpc-web+json", "connect-protocol-version": "1" }, framed, "5.grpc-web+json");
  await tryProbe(ls.port, ls.csrf, { "content-type": "application/grpc+json" }, framed, "6.grpc+json");
  await tryProbe(ls.port, ls.csrf, { "content-type": "application/json", "connect-protocol-version": "1" }, jsonBuf, "7.plain-json,unframed");
}
main().catch(e => console.error(e));
