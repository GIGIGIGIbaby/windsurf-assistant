// dao_vm_runner.js · 万源VM通用节点服务器 · 印273
// 「爰有奇器，是生萬象。」── 阴符经
// 依赖: 仅Node.js内置模块 · 零npm安装
// 支持: GHA / Cirrus / Azure / GitLab / Render / Koyeb / Fly.io
"use strict";

const http  = require("http");
const https = require("https");
const os    = require("os");

const PORT     = parseInt(process.env.PORT || process.env.VM_PORT || "7862");
const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const SLOT     = process.env.VM_SLOT || "main";
const START_TS = Date.now();
const GH_HOST  = "models.inference.ai.azure.com";

const MODELS = [
  "gpt-4o","gpt-4o-mini","gpt-4.1","gpt-4.1-mini",
  "claude-3-5-sonnet-20241022","claude-3-5-haiku-20241022",
  "llama-3.3-70b-instruct","llama-3.1-405b-instruct",
  "mistral-large-2411","deepseek-r1","phi-4"
];

function log(msg) {
  process.stdout.write("[" + new Date().toISOString().slice(11,23) + "][vm:" + SLOT + "] " + msg + "\n");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json"
};

function proxy(reqBody, res) {
  const body = Object.assign({}, reqBody);
  if (body.model && body.model.startsWith("gh/")) body.model = body.model.slice(3);
  if (!body.model || body.model === "auto") body.model = "gpt-4o-mini";
  const bs = JSON.stringify(body);
  const req = https.request({
    hostname: GH_HOST, port: 443, path: "/chat/completions", method: "POST",
    headers: {
      "Authorization": "Bearer " + GH_TOKEN,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(bs),
      "User-Agent": "dao-vm/273"
    },
    timeout: 120000
  }, function(ur) {
    const h = Object.assign({}, CORS);
    if (ur.headers["content-type"]) h["Content-Type"] = ur.headers["content-type"];
    res.writeHead(ur.statusCode, h);
    ur.pipe(res);
  });
  req.on("error", function(e) {
    if (!res.headersSent) { res.writeHead(502, CORS); res.end(JSON.stringify({ error: { message: e.message } })); }
  });
  req.setTimeout(120000, function() {
    req.destroy();
    if (!res.headersSent) { res.writeHead(504, CORS); res.end(JSON.stringify({ error: { message: "timeout" } })); }
  });
  req.write(bs); req.end();
}

http.createServer(function(req, res) {
  if (req.method === "OPTIONS") { res.writeHead(200, CORS); return res.end(); }
  const url = req.url.split("?")[0];

  if (url === "/health" || url === "/" || url === "/_/health") {
    res.writeHead(200, CORS);
    return res.end(JSON.stringify({
      ok: true, provider: "gha", slot: SLOT, version: "273",
      uptime: Math.round((Date.now() - START_TS) / 1000),
      hostname: os.hostname(), gh_models: !!GH_TOKEN, ts: Date.now()
    }));
  }

  if (url === "/v1/models") {
    res.writeHead(200, CORS);
    return res.end(JSON.stringify({
      object: "list",
      data: GH_TOKEN ? MODELS.map(function(id) { return { id: "gh/" + id, object: "model", owned_by: "github" }; }) : []
    }));
  }

  if (url === "/v1/chat/completions" && req.method === "POST") {
    if (!GH_TOKEN) {
      res.writeHead(503, CORS);
      return res.end(JSON.stringify({ error: { message: "GITHUB_TOKEN not configured on this VM" } }));
    }
    var b = "";
    req.on("data", function(c) { b += c; });
    req.on("end", function() {
      try { proxy(JSON.parse(b || "{}"), res); }
      catch(e) { res.writeHead(400, CORS); res.end(JSON.stringify({ error: { message: e.message } })); }
    });
    return;
  }

  res.writeHead(404, CORS);
  res.end(JSON.stringify({ error: "not_found", path: url }));

}).listen(PORT, "0.0.0.0", function() {
  log("ready :" + PORT + " | slot=" + SLOT + " | gh_models=" + !!GH_TOKEN);
});

process.on("uncaughtException", function(e) { log("ERR " + e.message); });
process.on("unhandledRejection", function(e) { log("REJ " + e); });
