#!/usr/bin/env node
/**
 * dao_hd_push.js · 用 hdougle PAT 把核心文件推到 hdougle/windsurf-assistant
 * ════════════════════════════════════════════════════════════════════════
 *
 * 「执大象，天下往。」「无有入于无间。」
 *
 * 推送 (走 :7890 代理, GitHub Contents API):
 *   - .github/workflows/dao-boot.yml
 *   - 130-道独立体_Standalone/05-GitHub/dao_proxy.js
 *
 * 路径含中文 → URL 编码处理
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const os   = require("os");
const net  = require("net");
const tls  = require("tls");

const TOKEN = fs.readFileSync(path.join(os.homedir(), ".dao", "hdougle", "token"), "utf8").trim();
const OWNER = "hdougle";
const REPO  = "windsurf-assistant";
const BRANCH = "main";

const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 7890;

// 待推送
const ROOT = path.resolve(__dirname, "..", "..", "..");  // → Windsurf万法归宗 父
const FILES = [
  {
    local:  path.resolve(__dirname, "..", "workflows", "dao-boot.yml"),
    remote: ".github/workflows/dao-boot.yml",
    msg:    "feat: 添加 dao-boot.yml 一键启动全链路 workflow",
  },
  {
    local:  path.resolve(__dirname, "..", "dao_proxy.js"),
    remote: "130-道独立体_Standalone/05-GitHub/dao_proxy.js",
    msg:    "feat: 添加 dao_proxy.js 零依赖反代核心 (v2.0.0)",
  },
];

// ─── HTTP via :7890 ─────────────────────────────────────────────────────
function ghReq(method, urlPath, body = null, extraHeaders = {}) {
  return new Promise((resolve) => {
    const sock = net.connect(PROXY_PORT, PROXY_HOST);
    sock.setTimeout(30000);
    let phase = "connect";
    let connectBuf = Buffer.alloc(0);
    const HOST = "api.github.com";

    sock.on("connect", () => {
      sock.write(`CONNECT ${HOST}:443 HTTP/1.1\r\nHost: ${HOST}:443\r\n\r\n`);
    });

    sock.on("data", (chunk) => {
      if (phase !== "connect") return;
      connectBuf = Buffer.concat([connectBuf, chunk]);
      const sepIdx = connectBuf.indexOf("\r\n\r\n");
      if (sepIdx < 0) return;
      const head = connectBuf.slice(0, sepIdx).toString("utf8");
      if (!head.startsWith("HTTP/1.1 200")) {
        sock.destroy();
        return resolve({ ok: false, status: 0, error: "CONNECT failed", head });
      }
      sock.removeAllListeners("data");
      phase = "tls";

      const t = tls.connect(
        { socket: sock, servername: HOST, rejectUnauthorized: false },
        () => {
          const bodyStr = body ? JSON.stringify(body) : "";
          const lines = [
            `${method} ${urlPath} HTTP/1.1`,
            `Host: ${HOST}`,
            `Authorization: Bearer ${TOKEN}`,
            `User-Agent: dao-hdougle/1.0`,
            `Accept: application/vnd.github+json`,
            `X-GitHub-Api-Version: 2022-11-28`,
            `Connection: close`,
          ];
          if (body) {
            lines.push(`Content-Type: application/json`);
            lines.push(`Content-Length: ${Buffer.byteLength(bodyStr)}`);
          }
          for (const [k, v] of Object.entries(extraHeaders)) lines.push(`${k}: ${v}`);
          lines.push("");
          lines.push("");
          t.write(lines.join("\r\n"));
          if (body) t.write(bodyStr);
        },
      );
      const bufs = [];
      t.on("data", (c) => bufs.push(c));
      t.on("end", () => {
        const raw = Buffer.concat(bufs).toString("utf8");
        const i = raw.indexOf("\r\n\r\n");
        if (i < 0) return resolve({ ok: false, status: 0, error: "no body sep", raw: raw.slice(0, 300) });
        const headStr = raw.slice(0, i);
        let respBody = raw.slice(i + 4);
        const m = headStr.match(/^HTTP\/1\.1 (\d+)/);
        const status = m ? parseInt(m[1], 10) : 0;
        if (/transfer-encoding:\s*chunked/i.test(headStr)) {
          const parts = [];
          let p = 0;
          while (p < respBody.length) {
            const nl = respBody.indexOf("\r\n", p);
            if (nl < 0) break;
            const sz = parseInt(respBody.slice(p, nl), 16);
            if (!sz) break;
            parts.push(respBody.slice(nl + 2, nl + 2 + sz));
            p = nl + 2 + sz + 2;
          }
          respBody = parts.join("");
        }
        let j = null;
        try { j = JSON.parse(respBody); } catch {}
        resolve({ ok: status >= 200 && status < 300, status, body: j, raw_body: respBody, head: headStr });
      });
      t.on("error", (e) => resolve({ ok: false, status: 0, error: "tls: " + e.message }));
    });
    sock.on("error", (e) => resolve({ ok: false, status: 0, error: "sock: " + e.message }));
    sock.on("timeout", () => { sock.destroy(); resolve({ ok: false, status: 0, error: "timeout" }); });
  });
}

// ─── 路径需 URL-encode (中文路径) ────────────────────────────────────────
function ep(remotePath) {
  return remotePath.split("/").map((s) => encodeURIComponent(s)).join("/");
}

// ─── 推送 ────────────────────────────────────────────────────────────────
async function pushFile(local, remote, msg) {
  console.log(`\n──── ${remote} ────`);
  console.log(`  local:  ${local}`);

  if (!fs.existsSync(local)) {
    console.log(`  ✗ local 不存在`);
    return false;
  }
  const content = fs.readFileSync(local);
  const b64 = content.toString("base64");
  console.log(`  size:   ${content.length} bytes (b64=${b64.length})`);

  // GET 当前是否存在 (拿 sha)
  const apiPath = `/repos/${OWNER}/${REPO}/contents/${ep(remote)}?ref=${BRANCH}`;
  console.log(`  GET ${apiPath} (查 sha) ...`);
  const get = await ghReq("GET", apiPath);
  console.log(`    GET status=${get.status}`);

  let sha = null;
  if (get.status === 200 && get.body && get.body.sha) {
    sha = get.body.sha;
    if (get.body.size === content.length) {
      // 进一步比内容
      const remoteContent = Buffer.from((get.body.content || "").replace(/\n/g, ""), "base64");
      if (remoteContent.equals(content)) {
        console.log(`  = 内容一致, 跳过`);
        return true;
      }
    }
    console.log(`  existing sha=${sha.slice(0, 8)}...`);
  } else if (get.status === 404) {
    console.log(`  not exist, will create`);
  } else {
    console.log(`  GET 异常 body: ${JSON.stringify(get.body || get.error || get.raw_body || "").slice(0, 200)}`);
  }

  // PUT 创建/更新
  const payload = {
    message: msg,
    content: b64,
    branch:  BRANCH,
  };
  if (sha) payload.sha = sha;

  console.log(`  PUT ${apiPath.split("?")[0]} ...`);
  const put = await ghReq("PUT", `/repos/${OWNER}/${REPO}/contents/${ep(remote)}`, payload);
  console.log(`    PUT status=${put.status}`);

  if (put.ok) {
    console.log(`  ✓ ${sha ? "更新" : "创建"}成功`);
    if (put.body && put.body.commit) {
      console.log(`    commit ${put.body.commit.sha.slice(0, 10)}: ${put.body.commit.message.split('\n')[0]}`);
    }
    return true;
  } else {
    console.log(`  ✗ 失败: ${JSON.stringify(put.body || put.error || put.raw_body || "").slice(0, 400)}`);
    return false;
  }
}

(async () => {
  console.log(`══ hdougle PAT 推送 ══`);
  console.log(`  token: ${TOKEN.slice(0, 12)}...${TOKEN.slice(-4)}`);
  console.log(`  repo:  ${OWNER}/${REPO} @ ${BRANCH}`);

  // 验登录态
  const me = await ghReq("GET", "/user");
  if (!me.ok) {
    console.error(`✗ 验证 PAT 失败: ${JSON.stringify(me).slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`  ✓ verified login=${me.body.login} (id=${me.body.id})`);

  // 验仓库
  const repo = await ghReq("GET", `/repos/${OWNER}/${REPO}`);
  if (!repo.ok) {
    console.error(`✗ 找不到 ${OWNER}/${REPO}: ${JSON.stringify(repo.body || repo.error).slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`  ✓ repo: ${repo.body.full_name} default=${repo.body.default_branch} push_perm=${repo.body.permissions && repo.body.permissions.push}`);

  // 推送
  let okCount = 0;
  for (const f of FILES) {
    const ok = await pushFile(f.local, f.remote, f.msg);
    if (ok) okCount++;
  }

  console.log(`\n══ 推送完成: ${okCount}/${FILES.length} ══`);
  process.exit(okCount === FILES.length ? 0 : 1);
})().catch((e) => { console.error("✗ " + e.stack); process.exit(1); });
