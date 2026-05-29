// _finalize_dual · 三事一并:
//   1) 下 rt-flow-3.10.3.vsix (自 spec/v9.9.52)
//   2) 改两 repo 之 README (9.9.52 → 9.9.53)
//   3) 补 rt-flow 至两 v9.9.53 release · PATCH body 简化
// 道法自然最小化 · 不动其他

const tls = require("tls");
const net = require("net");
const fs = require("fs");
const path = require("path");

// ── 一次 HTTPS · CONNECT 隧道 + retry ──
function once(host, urlpath, patToken, method, body, extraHeaders) {
  return new Promise((resolve) => {
    const sock = net.connect(7890, "127.0.0.1");
    sock.setTimeout(30000);
    let resolved = false;
    const finish = (v) => {
      if (resolved) return;
      resolved = true;
      try {
        sock.destroy();
      } catch {}
      resolve(v);
    };
    sock.on("error", (e) => finish({ err: "proxy-" + (e.code || e.message) }));
    sock.on("timeout", () => finish({ err: "sock-timeout" }));
    sock.once("connect", () => {
      sock.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`);
    });
    sock.once("data", (d) => {
      const head = d.toString();
      if (
        !head.startsWith("HTTP/1.1 200") &&
        !head.startsWith("HTTP/1.0 200")
      ) {
        return finish({ err: "connect-fail-" + head.slice(0, 80) });
      }
      const t = tls.connect({ socket: sock, servername: host });
      t.on("error", (e) => finish({ err: "tls-" + (e.code || e.message) }));
      t.on("secureConnect", () => {
        let req =
          `${method || "GET"} ${urlpath} HTTP/1.1\r\nHost: ${host}\r\n` +
          `User-Agent: dao-finalize\r\nAccept: application/vnd.github+json\r\n` +
          `Connection: close\r\n`;
        if (patToken) req += `Authorization: Bearer ${patToken}\r\n`;
        if (extraHeaders) {
          for (const k of Object.keys(extraHeaders))
            req += `${k}: ${extraHeaders[k]}\r\n`;
        }
        let bodyBuf = null;
        if (body) {
          bodyBuf = Buffer.isBuffer(body)
            ? body
            : Buffer.from(
                typeof body === "string" ? body : JSON.stringify(body),
              );
          if (
            !extraHeaders ||
            !Object.keys(extraHeaders)
              .map((k) => k.toLowerCase())
              .includes("content-type")
          ) {
            req += `Content-Type: application/json\r\n`;
          }
          req += `Content-Length: ${bodyBuf.length}\r\n`;
        }
        req += `\r\n`;
        t.write(req);
        if (bodyBuf) t.write(bodyBuf);
      });
      let buf = Buffer.alloc(0);
      t.on("data", (c) => (buf = Buffer.concat([buf, c])));
      t.on("end", () => {
        const headEnd = buf.indexOf(Buffer.from("\r\n\r\n"));
        const headText = buf.slice(0, headEnd).toString("utf8");
        const bodyBytes = buf.slice(headEnd + 4);
        const status = parseInt(
          headText.match(/HTTP\/[\d.]+ (\d+)/)?.[1] || "0",
          10,
        );
        // chunked?
        let bodyOut = bodyBytes;
        if (/transfer-encoding:\s*chunked/i.test(headText)) {
          const parts = [];
          let p = 0;
          while (p < bodyBytes.length) {
            const crlf = bodyBytes.indexOf(Buffer.from("\r\n"), p);
            if (crlf === -1) break;
            const sizeHex = bodyBytes.slice(p, crlf).toString("ascii").trim();
            const size = parseInt(sizeHex, 16);
            if (!size || isNaN(size)) break;
            parts.push(bodyBytes.slice(crlf + 2, crlf + 2 + size));
            p = crlf + 2 + size + 2;
          }
          bodyOut = Buffer.concat(parts);
        }
        // 是否文本 (尝 JSON · 否则二进制)
        try {
          const text = bodyOut.toString("utf8");
          finish({ status, body: JSON.parse(text), headers: headText });
        } catch {
          finish({ status, raw: bodyOut, headers: headText });
        }
      });
    });
  });
}

async function pat(
  host,
  urlpath,
  patToken,
  method,
  body,
  extraHeaders,
  retries = 3,
) {
  for (let i = 0; i < retries; i++) {
    const r = await once(host, urlpath, patToken, method, body, extraHeaders);
    if (r.status && r.status > 0) return r;
    if (i < retries - 1) await new Promise((rs) => setTimeout(rs, 1500));
  }
  return await once(host, urlpath, patToken, method, body, extraHeaders);
}

// ── 跟 redirect · once 内置 Accept 双发问题 · 此处直请 raw socket ──
function rawGet(host, urlpath, headers) {
  return new Promise((resolve) => {
    const sock = net.connect(7890, "127.0.0.1");
    sock.setTimeout(30000);
    let resolved = false;
    const finish = (v) => {
      if (resolved) return;
      resolved = true;
      try {
        sock.destroy();
      } catch {}
      resolve(v);
    };
    sock.on("error", (e) => finish({ err: "proxy-" + (e.code || e.message) }));
    sock.on("timeout", () => finish({ err: "sock-timeout" }));
    sock.once("connect", () => {
      sock.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`);
    });
    sock.once("data", (d) => {
      const head = d.toString();
      if (
        !head.startsWith("HTTP/1.1 200") &&
        !head.startsWith("HTTP/1.0 200")
      ) {
        return finish({ err: "connect-fail-" + head.slice(0, 80) });
      }
      const t = tls.connect({ socket: sock, servername: host });
      t.on("error", (e) => finish({ err: "tls-" + (e.code || e.message) }));
      t.on("secureConnect", () => {
        let req = `GET ${urlpath} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n`;
        for (const k of Object.keys(headers || {}))
          req += `${k}: ${headers[k]}\r\n`;
        req += `\r\n`;
        t.write(req);
      });
      let buf = Buffer.alloc(0);
      t.on("data", (c) => (buf = Buffer.concat([buf, c])));
      t.on("end", () => {
        const headEnd = buf.indexOf(Buffer.from("\r\n\r\n"));
        const headText = buf.slice(0, headEnd).toString("utf8");
        const bodyBytes = buf.slice(headEnd + 4);
        const status = parseInt(
          headText.match(/HTTP\/[\d.]+ (\d+)/)?.[1] || "0",
          10,
        );
        let bodyOut = bodyBytes;
        if (/transfer-encoding:\s*chunked/i.test(headText)) {
          const parts = [];
          let p = 0;
          while (p < bodyBytes.length) {
            const crlf = bodyBytes.indexOf(Buffer.from("\r\n"), p);
            if (crlf === -1) break;
            const sizeHex = bodyBytes.slice(p, crlf).toString("ascii").trim();
            const size = parseInt(sizeHex, 16);
            if (!size || isNaN(size)) break;
            parts.push(bodyBytes.slice(crlf + 2, crlf + 2 + size));
            p = crlf + 2 + size + 2;
          }
          bodyOut = Buffer.concat(parts);
        }
        finish({ status, raw: bodyOut, headers: headText });
      });
    });
  });
}

async function followRedirect(host, urlpath, maxHops = 6) {
  let h = host;
  let p = urlpath;
  for (let hop = 0; hop < maxHops; hop++) {
    const r = await rawGet(h, p, { "User-Agent": "dao" });
    if (r.err) return r;
    if (
      r.status === 302 ||
      r.status === 301 ||
      r.status === 307 ||
      r.status === 308
    ) {
      const loc = (r.headers || "").match(/^location:\s*(.+?)\r?$/im);
      if (!loc) return { err: "no-location" };
      const url = new URL(loc[1].trim());
      h = url.host;
      p = url.pathname + (url.search || "");
      continue;
    }
    return r;
  }
  return { err: "too-many-redirects" };
}

// ── README 之新内容 ──
function buildReadme(owner) {
  return (
    `# Windsurf Assistant · WAM 万法归宗\n\n` +
    `| 插件 | 下载 |\n` +
    `| --- | --- |\n` +
    `| WAM 切号插件 | [rt-flow-3.10.3.vsix](https://github.com/${owner}/windsurf-assistant/releases/download/v9.9.53/rt-flow-3.10.3.vsix) |\n` +
    `| 反代替换提示词插件 | [dao-proxy-min-9.9.53.vsix](https://github.com/${owner}/windsurf-assistant/releases/download/v9.9.53/dao-proxy-min-9.9.53.vsix) |\n`
  );
}

// ── release body 之新内容 (简) ──
function buildReleaseBody() {
  return (
    `| 插件 | 下载 |\n` +
    `| --- | --- |\n` +
    `| WAM 切号插件 | rt-flow-3.10.3.vsix |\n` +
    `| 反代替换提示词插件 | dao-proxy-min-9.9.53.vsix |\n`
  );
}

const ACCOUNTS = [
  {
    name: "main",
    owner: "zhouyoukang",
    patkey: "MAIN_PAT",
    v953_id: 330459190,
    readme_sha: "1d618a91ba561cbb3922030003c1cc308d355501",
  },
  {
    name: "spec",
    owner: "zhouyoukang1234-spec",
    patkey: "SPEC_PAT",
    v953_id: 330459229,
    readme_sha: null,
  },
];

(async () => {
  const summary = {};

  // ── 步一: 下 rt-flow-3.10.3.vsix (自 spec/v9.9.52) ──
  const rtFlowPath = path.join(__dirname, "rt-flow-3.10.3.vsix");
  if (fs.existsSync(rtFlowPath) && fs.statSync(rtFlowPath).size === 206013) {
    console.log(
      `[step1] rt-flow-3.10.3.vsix 已存 (${fs.statSync(rtFlowPath).size}B) · 复用`,
    );
  } else {
    console.log("[step1] 下 rt-flow-3.10.3.vsix from spec/v9.9.52 release ...");
    const dl = await followRedirect(
      "github.com",
      `/zhouyoukang1234-spec/windsurf-assistant/releases/download/v9.9.52/rt-flow-3.10.3.vsix`,
    );
    if (dl.err || !dl.raw || dl.status !== 200) {
      console.log("[step1] ✗ 下载败: status=" + dl.status + " err=" + dl.err);
      process.exit(2);
    }
    fs.writeFileSync(rtFlowPath, dl.raw);
    console.log(`[step1] ✓ 下毕 · ${dl.raw.length}B → ${rtFlowPath}`);
    if (dl.raw.length !== 206013) {
      console.log(`[step1] ⚠ 体大不符 · 预期 206013B · 实 ${dl.raw.length}B`);
    }
  }
  const rtFlowBuf = fs.readFileSync(rtFlowPath);
  summary.rtFlow = {
    size: rtFlowBuf.length,
    sha256: require("crypto")
      .createHash("sha256")
      .update(rtFlowBuf)
      .digest("hex"),
  };

  // ── 步二/三/四: 对每 repo: 上传 rt-flow + 改 README + 改 release body ──
  for (const acct of ACCOUNTS) {
    const tag = `[${acct.name}]`;
    const token = process.env[acct.patkey];
    if (!token) {
      console.log(`${tag} 无 PAT · skip`);
      continue;
    }
    summary[acct.name] = {};

    console.log(`\n━━━ ${tag} ${acct.owner}/windsurf-assistant ━━━`);

    // (a) 取 spec README 之 sha (若未知)
    let readmeSha = acct.readme_sha;
    if (!readmeSha) {
      const r = await pat(
        "api.github.com",
        `/repos/${acct.owner}/windsurf-assistant/readme`,
        token,
      );
      if (r.status === 200 && r.body && r.body.sha) {
        readmeSha = r.body.sha;
        console.log(`${tag} README sha=${readmeSha}`);
      } else {
        console.log(
          `${tag} ✗ 取 README sha 败: ${JSON.stringify(r).slice(0, 200)}`,
        );
        summary[acct.name].readme = "sha-fail";
        continue;
      }
    }

    // (b) PUT README
    const newContent = buildReadme(acct.owner);
    const putBody = {
      message: "README · 9.9.52 → 9.9.53 · dao fa zi ran",
      content: Buffer.from(newContent, "utf8").toString("base64"),
      sha: readmeSha,
    };
    const putR = await pat(
      "api.github.com",
      `/repos/${acct.owner}/windsurf-assistant/contents/README.md`,
      token,
      "PUT",
      putBody,
    );
    if (putR.status === 200 || putR.status === 201) {
      const commitSha = (putR.body.commit && putR.body.commit.sha) || "?";
      console.log(`${tag} ✓ README 更新 · commit=${commitSha.slice(0, 8)}`);
      summary[acct.name].readme = { commit: commitSha };
    } else {
      console.log(
        `${tag} ✗ PUT README 败: ${putR.status} · ${JSON.stringify(putR.body || putR.err).slice(0, 200)}`,
      );
      summary[acct.name].readme = { err: putR.status };
    }

    // (c) 删旧 rt-flow asset (若已在 v9.9.53)
    const assetsR = await pat(
      "api.github.com",
      `/repos/${acct.owner}/windsurf-assistant/releases/${acct.v953_id}/assets`,
      token,
    );
    if (assetsR.status === 200 && Array.isArray(assetsR.body)) {
      const existed = assetsR.body.find(
        (a) => a.name === "rt-flow-3.10.3.vsix",
      );
      if (existed) {
        const del = await pat(
          "api.github.com",
          `/repos/${acct.owner}/windsurf-assistant/releases/assets/${existed.id}`,
          token,
          "DELETE",
        );
        console.log(`${tag} 旧 rt-flow asset 删: status=${del.status}`);
      }
    }

    // (d) 上传 rt-flow-3.10.3.vsix
    console.log(`${tag} 上传 rt-flow-3.10.3.vsix (${rtFlowBuf.length}B) ...`);
    const uploadR = await pat(
      "uploads.github.com",
      `/repos/${acct.owner}/windsurf-assistant/releases/${acct.v953_id}/assets?name=rt-flow-3.10.3.vsix`,
      token,
      "POST",
      rtFlowBuf,
      { "Content-Type": "application/octet-stream" },
    );
    if (uploadR.status === 201) {
      console.log(`${tag} ✓ rt-flow 上传成 · asset id=${uploadR.body.id}`);
      summary[acct.name].rt_flow_asset = uploadR.body.id;
    } else {
      console.log(
        `${tag} ✗ rt-flow 上传败: ${uploadR.status} · ${JSON.stringify(uploadR.body || uploadR.err).slice(0, 200)}`,
      );
      summary[acct.name].rt_flow_asset = { err: uploadR.status };
    }

    // (e) PATCH release body (简)
    const patchR = await pat(
      "api.github.com",
      `/repos/${acct.owner}/windsurf-assistant/releases/${acct.v953_id}`,
      token,
      "PATCH",
      { body: buildReleaseBody() },
    );
    if (patchR.status === 200) {
      console.log(`${tag} ✓ release body 简化`);
      summary[acct.name].release_body = "simplified";
    } else {
      console.log(`${tag} ✗ PATCH release 败: ${patchR.status}`);
      summary[acct.name].release_body = { err: patchR.status };
    }
  }

  console.log("\n━━━━━━ 收功 ━━━━━━");
  console.log(JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(__dirname, "_finalize_dual.out.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );
})();
