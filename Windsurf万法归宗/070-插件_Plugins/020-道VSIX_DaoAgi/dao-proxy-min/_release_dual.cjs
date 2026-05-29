// _release_dual · 推 v9.9.53 VSIX 至两 github 账号 · 道法自然最小化
// 主: zhouyoukang/windsurf-assistant
// 子: zhouyoukang1234-spec/windsurf-assistant
// 仅创 release + 上传一 vsix · 不动其他
const https = require("https");
const http = require("http");
const tls = require("tls");
const net = require("net");
const fs = require("fs");
const path = require("path");

// :7890 本地代理 (PAT_INDEX.md · CONNECT 隧道)
const USE_PROXY = process.env.NO_PROXY !== "1";
const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 7890;

// ── 入参 ──
const VSIX_PATH = path.join(__dirname, "dao-proxy-min-9.9.53.vsix");
const TAG = "v9.9.53";
const RELEASE_NAME = "WAM v3.10.3 |dao-proxy-min v9.9.53";
const RELEASE_BODY = [
  "版本 v9.9.53",
  "",
  "## 修复 · silk 三经文复归",
  "",
  "- 根: `DAO_DE_JING_81` 在 source.js module 加载时从 `_silk_de.txt + _silk_dao.txt` 读, 历版本之 vsix 漏此三文件, 致 `invertSP` 退化为 passthrough · LLM 实收 ~20K 字英文 SP 而非帛书",
  "- 药: 加 `_silk_de.txt` (3951 字) + `_silk_dao.txt` (3255 字) + `_yinfu.txt` (588 字) 至 vendor/bundled-origin/",
  "- 验: 主公本机 live 验毕 · `dao_chars=7204` (`silk_de + silk_dao` 合) · `dao_loaded=true`",
  "",
  "## 道义",
  "",
  "> 万物负阴而抱阳 · 中气以为和 (帛书四十二章)",
  "",
  "三经文是道经 (3255 字) · 德经 (3951 字) · 阴符经 (588 字), 缺一则 invertSP 失锚.",
].join("\n");

const ACCOUNTS = [
  {
    name: "main",
    owner: "zhouyoukang",
    repo: "windsurf-assistant",
    pat: process.env.MAIN_PAT,
    target_commitish: "main", // tag 据 main · v9.9.53 commit e7ffc0e25 已在
  },
  {
    name: "spec",
    owner: "zhouyoukang1234-spec",
    repo: "windsurf-assistant",
    pat: process.env.SPEC_PAT,
    target_commitish: undefined, // 默仓默认分支 HEAD
  },
];

// ── HTTPS helper · 走 :7890 CONNECT 隧道 ──
function ghReq(opts, body) {
  return new Promise((resolve) => {
    const data = body
      ? Buffer.isBuffer(body)
        ? body
        : Buffer.from(typeof body === "string" ? body : JSON.stringify(body))
      : null;

    const doRequest = (createConnection) => {
      const reqOpts = Object.assign({}, opts, { createConnection });
      const req = https.request(reqOpts, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = { _raw: raw.slice(0, 500) };
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        });
      });
      req.on("error", (e) =>
        resolve({ err: e.code || e.message, body: undefined }),
      );
      if (data) req.write(data);
      req.end();
    };

    if (!USE_PROXY) {
      doRequest(undefined);
      return;
    }
    // CONNECT 隧道
    const sock = net.connect(PROXY_PORT, PROXY_HOST);
    sock.on("error", (e) =>
      resolve({
        err: "proxy-connect-" + (e.code || e.message),
        body: undefined,
      }),
    );
    sock.once("connect", () => {
      sock.write(
        `CONNECT ${opts.host}:${opts.port || 443} HTTP/1.1\r\nHost: ${opts.host}:${opts.port || 443}\r\n\r\n`,
      );
    });
    sock.once("data", (chunk) => {
      const head = chunk.toString();
      if (
        !head.startsWith("HTTP/1.1 200") &&
        !head.startsWith("HTTP/1.0 200")
      ) {
        resolve({ err: "proxy-CONNECT-" + head.slice(0, 80), body: undefined });
        sock.destroy();
        return;
      }
      doRequest(() =>
        tls.connect({
          socket: sock,
          servername: opts.host,
          ALPNProtocols: ["http/1.1"],
        }),
      );
    });
  });
}

async function ghApi(pat, host, urlPath, method, body, extraHeaders) {
  const opts = {
    host,
    port: 443,
    path: urlPath,
    method,
    headers: Object.assign(
      {
        Authorization: `Bearer ${pat}`,
        "User-Agent": "dao-release-9953",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      extraHeaders || {},
    ),
  };
  if (body && !Buffer.isBuffer(body) && typeof body !== "string") {
    body = JSON.stringify(body);
    opts.headers["Content-Type"] = "application/json";
    opts.headers["Content-Length"] = Buffer.byteLength(body);
  } else if (Buffer.isBuffer(body)) {
    opts.headers["Content-Length"] = body.length;
  }
  return ghReq(opts, body);
}

// ── main 流 ──
(async () => {
  if (!fs.existsSync(VSIX_PATH)) {
    console.log("VSIX not found: " + VSIX_PATH);
    process.exit(2);
  }
  const vsixBuf = fs.readFileSync(VSIX_PATH);
  const vsixSha256 = require("crypto")
    .createHash("sha256")
    .update(vsixBuf)
    .digest("hex");
  console.log(`VSIX: ${VSIX_PATH}`);
  console.log(`  size: ${vsixBuf.length} bytes`);
  console.log(`  sha256: ${vsixSha256}`);
  console.log("");

  const summary = [];

  for (const acct of ACCOUNTS) {
    const tag = `[${acct.name}]`;
    console.log(`\n━━━ ${tag} ${acct.owner}/${acct.repo} ━━━`);
    if (!acct.pat) {
      console.log(`${tag} PAT 未提供 · skip`);
      summary.push({ name: acct.name, status: "skip-no-pat" });
      continue;
    }

    // 1. 验 PAT
    const me = await ghApi(acct.pat, "api.github.com", "/user", "GET");
    if (me.status !== 200) {
      const detail = me.err
        ? `err=${me.err}`
        : `body=${JSON.stringify(me.body).slice(0, 200)}`;
      console.log(`${tag} PAT 验证失败: status=${me.status} · ${detail}`);
      summary.push({
        name: acct.name,
        status: "pat-invalid",
        detail: me.err || me.body,
      });
      continue;
    }
    console.log(`${tag} login=${me.body.login} · id=${me.body.id}`);

    // 2. 检查 release 是否已存在
    const existing = await ghApi(
      acct.pat,
      "api.github.com",
      `/repos/${acct.owner}/${acct.repo}/releases/tags/${TAG}`,
      "GET",
    );
    let releaseId = null;
    if (existing.status === 200 && existing.body && existing.body.id) {
      console.log(
        `${tag} release ${TAG} 已存在 · id=${existing.body.id} · 复用`,
      );
      releaseId = existing.body.id;
    } else if (existing.status === 404) {
      // 3. 建 release
      const createBody = {
        tag_name: TAG,
        name: RELEASE_NAME,
        body: RELEASE_BODY,
        draft: false,
        prerelease: false,
      };
      if (acct.target_commitish)
        createBody.target_commitish = acct.target_commitish;

      const created = await ghApi(
        acct.pat,
        "api.github.com",
        `/repos/${acct.owner}/${acct.repo}/releases`,
        "POST",
        createBody,
      );
      if (created.status !== 201) {
        console.log(
          `${tag} 建 release 败: status=${created.status} · ${JSON.stringify(created.body).slice(0, 300)}`,
        );
        summary.push({
          name: acct.name,
          status: "create-failed",
          detail: created.body,
        });
        continue;
      }
      releaseId = created.body.id;
      console.log(
        `${tag} 建 release ${TAG} 成 · id=${releaseId} · html=${created.body.html_url}`,
      );
    } else {
      console.log(
        `${tag} 查 release 异常: status=${existing.status} · ${JSON.stringify(existing.body).slice(0, 200)}`,
      );
      summary.push({ name: acct.name, status: "query-failed" });
      continue;
    }

    // 4. 检查同名 asset 是否已存
    const assets = await ghApi(
      acct.pat,
      "api.github.com",
      `/repos/${acct.owner}/${acct.repo}/releases/${releaseId}/assets`,
      "GET",
    );
    if (assets.status === 200 && Array.isArray(assets.body)) {
      const existed = assets.body.find(
        (a) => a.name === "dao-proxy-min-9.9.53.vsix",
      );
      if (existed) {
        console.log(
          `${tag} asset dao-proxy-min-9.9.53.vsix 已存 (id=${existed.id} · size=${existed.size}) · 删旧再上`,
        );
        const del = await ghApi(
          acct.pat,
          "api.github.com",
          `/repos/${acct.owner}/${acct.repo}/releases/assets/${existed.id}`,
          "DELETE",
        );
        console.log(`${tag} delete asset: status=${del.status}`);
      }
    }

    // 5. 上传 VSIX (走 uploads.github.com)
    console.log(
      `${tag} 上传 dao-proxy-min-9.9.53.vsix (${vsixBuf.length} bytes)...`,
    );
    const uploadResp = await ghApi(
      acct.pat,
      "uploads.github.com",
      `/repos/${acct.owner}/${acct.repo}/releases/${releaseId}/assets?name=dao-proxy-min-9.9.53.vsix`,
      "POST",
      vsixBuf,
      { "Content-Type": "application/octet-stream" },
    );
    if (uploadResp.status === 201) {
      console.log(
        `${tag} ✓ 上传成 · asset id=${uploadResp.body.id} · url=${uploadResp.body.browser_download_url}`,
      );
      summary.push({
        name: acct.name,
        status: "ok",
        release_id: releaseId,
        asset_id: uploadResp.body.id,
        download: uploadResp.body.browser_download_url,
        html_url: existing.body && existing.body.html_url,
      });
    } else {
      console.log(
        `${tag} 上传败: status=${uploadResp.status} · ${JSON.stringify(uploadResp.body).slice(0, 300)}`,
      );
      summary.push({
        name: acct.name,
        status: "upload-failed",
        release_id: releaseId,
        detail: uploadResp.body,
      });
    }
  }

  console.log("\n━━━━━━━━━━━━━━━ 收功 ━━━━━━━━━━━━━━━");
  console.log(JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(__dirname, "_release_dual.out.json"),
    JSON.stringify(
      {
        ts: new Date().toISOString(),
        vsix: { size: vsixBuf.length, sha256: vsixSha256 },
        accounts: summary,
      },
      null,
      2,
    ),
    "utf8",
  );

  const allOk = summary.every((s) => s.status === "ok");
  process.exit(allOk ? 0 : 1);
})();
