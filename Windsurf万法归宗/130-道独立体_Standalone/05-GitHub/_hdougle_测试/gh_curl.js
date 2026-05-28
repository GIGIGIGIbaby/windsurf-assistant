#!/usr/bin/env node
/**
 * gh_curl.js · GitHub API 客户端 (基于 curl + :7890 代理)
 * ════════════════════════════════════════════════════════════════════════
 *
 * 「水之胜刚也，弱之胜强也。」「无有入于无间。」
 *
 * 国内 Node.js 直连 GitHub API 经常 Connection Reset。
 * 用系统 curl 走 :7890 (Clash) 代理最稳。
 *
 * 用法:
 *   const gh = require('./gh_curl').make({ token, owner: 'hdougle', repo: 'windsurf-assistant' });
 *   const r = await gh.get('/user');
 *   const r = await gh.put('/repos/owner/repo/contents/path', { message, content, branch });
 */
"use strict";

const { spawnSync, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PROXY = process.env.DAO_PROXY_URL || "http://127.0.0.1:7890";

function _curlOnce(method, url, { token, body, extraHeaders = {} } = {}) {
  const args = [
    "-sS",
    "-x",
    PROXY,
    "--ssl-no-revoke", // Windows schannel 关键: 关闭吊销列表查询
    "--http1.1", // 强 1.1 (避 H2 协商抖动)
    "--retry",
    "0", // 我们外层 retry
    "--connect-timeout",
    "15",
    "--max-time",
    "120",
    "-X",
    method,
    "-H",
    `User-Agent: dao-curl/1.0`,
    "-H",
    `Accept: application/vnd.github+json`,
    "-H",
    `X-GitHub-Api-Version: 2022-11-28`,
    "-w",
    "\n###CURL_STATUS:%{http_code}",
  ];
  if (token) args.push("-H", `Authorization: Bearer ${token}`);
  for (const [k, v] of Object.entries(extraHeaders))
    args.push("-H", `${k}: ${v}`);

  let bodyTmp = null;
  if (body !== undefined && body !== null) {
    args.push("-H", "Content-Type: application/json");
    bodyTmp = path.join(
      os.tmpdir(),
      `gh_curl_body_${Date.now()}_${Math.random().toString(36).slice(2)}.json`,
    );
    fs.writeFileSync(bodyTmp, JSON.stringify(body));
    args.push("--data-binary", "@" + bodyTmp);
  }
  args.push(url);

  try {
    const r = spawnSync("curl", args, {
      encoding: "utf8",
      maxBuffer: 100 * 1024 * 1024,
    });
    if (r.error) throw r.error;
    const out = r.stdout || "";
    const err = r.stderr || "";
    const m = out.match(/\n###CURL_STATUS:(\d+)\s*$/);
    const status = m ? parseInt(m[1], 10) : 0;
    const respBody = m ? out.slice(0, m.index) : out;
    let j = null;
    try {
      j = JSON.parse(respBody);
    } catch {}
    return {
      ok: status >= 200 && status < 300,
      status,
      body: j,
      raw_body: respBody,
      stderr: err,
      exitCode: r.status,
    };
  } finally {
    if (bodyTmp)
      try {
        fs.unlinkSync(bodyTmp);
      } catch {}
  }
}

// 外层重试: schannel 偶发 SSL handshake 错误时退避重试
function curl(method, url, opts = {}, { retries = 4, backoffMs = 800 } = {}) {
  let last = null;
  for (let i = 0; i <= retries; i++) {
    const r = _curlOnce(method, url, opts);
    last = r;
    if (r.status > 0) return r;
    // status=0 说明网络层失败 (SSL handshake / DNS / proxy)
    const stderrLow = (r.stderr || "").toLowerCase();
    const transient =
      stderrLow.includes("schannel") ||
      stderrLow.includes("handshake") ||
      stderrLow.includes("reset") ||
      stderrLow.includes("operation timed out") ||
      stderrLow.includes("connection refused") ||
      stderrLow.includes("could not resolve") ||
      stderrLow.includes("recv failure") ||
      stderrLow.includes("openssl") ||
      stderrLow.includes("(35)") ||
      stderrLow.includes("(7)") ||
      stderrLow.includes("(28)");
    if (!transient) return r;
    if (i < retries) {
      const wait = backoffMs * Math.pow(2, i);
      // 同步 sleep
      const end = Date.now() + wait;
      while (Date.now() < end) {} // 简易但可靠的同步等待
    }
  }
  return last;
}

function make({ token, owner, repo, branch = "main" } = {}) {
  const ep = (p) => p.split("/").map(encodeURIComponent).join("/");
  return {
    token,
    owner,
    repo,
    branch,
    get: (urlPath, opts) =>
      curl("GET", `https://api.github.com${urlPath}`, { token, ...opts }),
    post: (urlPath, body, opts) =>
      curl("POST", `https://api.github.com${urlPath}`, {
        token,
        body,
        ...opts,
      }),
    put: (urlPath, body, opts) =>
      curl("PUT", `https://api.github.com${urlPath}`, { token, body, ...opts }),
    patch: (urlPath, body, opts) =>
      curl("PATCH", `https://api.github.com${urlPath}`, {
        token,
        body,
        ...opts,
      }),
    delete: (urlPath, opts) =>
      curl("DELETE", `https://api.github.com${urlPath}`, { token, ...opts }),
    // 高阶
    encodePath: ep,
    contentsUrl: (remotePath, ref) => {
      let p = `/repos/${owner}/${repo}/contents/${ep(remotePath)}`;
      if (ref) p += `?ref=${encodeURIComponent(ref)}`;
      return p;
    },
  };
}

module.exports = { curl, make, PROXY };

if (require.main === module) {
  // CLI: node gh_curl.js GET /user
  const [method, url] = process.argv.slice(2);
  if (!method || !url) {
    console.error("usage: node gh_curl.js <METHOD> <URL_PATH>");
    console.error("e.g.   node gh_curl.js GET /user");
    process.exit(1);
  }
  const tokFile = path.join(os.homedir(), ".dao", "hdougle", "token");
  const token = fs.readFileSync(tokFile, "utf8").trim();
  const r = curl(
    method.toUpperCase(),
    `https://api.github.com${url.startsWith("/") ? url : "/" + url}`,
    { token },
  );
  console.log(
    JSON.stringify(
      {
        status: r.status,
        body: r.body,
        raw: r.body ? null : r.raw_body.slice(0, 500),
      },
      null,
      2,
    ),
  );
}
