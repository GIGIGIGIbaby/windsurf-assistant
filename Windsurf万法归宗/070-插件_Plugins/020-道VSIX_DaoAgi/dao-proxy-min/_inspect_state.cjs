// 取两 repo 之 README + v9.9.52 release (取 rt-flow asset url) + v9.9.53 release 当前状
const tls = require("tls");
const net = require("net");
const fs = require("fs");
const path = require("path");

function pat(host, urlpath, patToken, method, body, extraHeaders) {
  return new Promise((resolve) => {
    const sock = net.connect(7890, "127.0.0.1");
    sock.setTimeout(15000);
    let resolved = false;
    const finish = (v) => {
      if (resolved) return;
      resolved = true;
      resolve(v);
    };
    sock.on("error", (e) => finish({ err: "proxy-" + e.code }));
    sock.on("timeout", () => {
      finish({ err: "sock-timeout" });
      sock.destroy();
    });
    sock.once("connect", () => {
      sock.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`);
    });
    sock.once("data", (d) => {
      const head = d.toString();
      if (
        !head.startsWith("HTTP/1.1 200") &&
        !head.startsWith("HTTP/1.0 200")
      ) {
        return finish({ err: "connect-fail-" + head.slice(0, 100) });
      }
      const t = tls.connect({ socket: sock, servername: host });
      t.on("secureConnect", () => {
        let req =
          `${method || "GET"} ${urlpath} HTTP/1.1\r\nHost: ${host}\r\n` +
          `Authorization: Bearer ${patToken}\r\n` +
          `User-Agent: dao\r\nAccept: application/vnd.github+json\r\n` +
          `Connection: close\r\n`;
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
          if (!extraHeaders || !extraHeaders["Content-Type"]) {
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
        const text = buf.toString("utf8");
        const headEnd = text.indexOf("\r\n\r\n");
        const head = text.slice(0, headEnd);
        const json = text.slice(headEnd + 4);
        const status = parseInt(
          head.match(/HTTP\/[\d.]+ (\d+)/)?.[1] || "0",
          10,
        );
        // 去 chunked encoding (只看完整 body)
        let body = json;
        if (/transfer-encoding:\s*chunked/i.test(head)) {
          const parts = [];
          let p = 0;
          while (p < json.length) {
            const lineEnd = json.indexOf("\r\n", p);
            if (lineEnd === -1) break;
            const sizeHex = json.slice(p, lineEnd).trim();
            const size = parseInt(sizeHex, 16);
            if (!size || isNaN(size)) break;
            parts.push(json.slice(lineEnd + 2, lineEnd + 2 + size));
            p = lineEnd + 2 + size + 2;
          }
          body = parts.join("");
        }
        try {
          finish({ status, body: JSON.parse(body) });
        } catch {
          finish({ status, _raw: text.slice(0, 1500) });
        }
      });
      t.on("error", (e) => finish({ err: "tls-" + e.code }));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const out = {};
  for (const [name, owner, patkey] of [
    ["main", "zhouyoukang", "MAIN_PAT"],
    ["spec", "zhouyoukang1234-spec", "SPEC_PAT"],
  ]) {
    const acct = { name, owner, pat: process.env[patkey] };
    out[name] = {};

    // 1. README
    await sleep(800);
    const readme = await pat(
      "api.github.com",
      `/repos/${owner}/windsurf-assistant/readme`,
      acct.pat,
    );
    console.error(
      `[${name}] readme status=${readme.status} err=${readme.err || "-"}`,
    );
    if (readme.status === 200) {
      out[name].readme = {
        path: readme.body.path,
        sha: readme.body.sha,
        size: readme.body.size,
        content_b64_len: (readme.body.content || "").length,
        decoded: Buffer.from(readme.body.content || "", "base64").toString(
          "utf8",
        ),
      };
    } else {
      out[name].readme = {
        err: readme.status,
        body: readme.body || readme._raw,
      };
    }

    // 2. v9.9.52 release (取 rt-flow asset)
    await sleep(800);
    const v52 = await pat(
      "api.github.com",
      `/repos/${owner}/windsurf-assistant/releases/tags/v9.9.52`,
      acct.pat,
    );
    console.error(`[${name}] v952 status=${v52.status} err=${v52.err || "-"}`);
    if (v52.status === 200) {
      out[name].v952 = {
        id: v52.body.id,
        assets: (v52.body.assets || []).map((a) => ({
          id: a.id,
          name: a.name,
          size: a.size,
          download: a.browser_download_url,
          api_url: a.url,
        })),
      };
    } else {
      out[name].v952 = { err: v52.status };
    }

    // 3. v9.9.53 release 当前状
    await sleep(800);
    const v53 = await pat(
      "api.github.com",
      `/repos/${owner}/windsurf-assistant/releases/tags/v9.9.53`,
      acct.pat,
    );
    console.error(`[${name}] v953 status=${v53.status} err=${v53.err || "-"}`);
    if (v53.status === 200) {
      out[name].v953 = {
        id: v53.body.id,
        name: v53.body.name,
        body_len: (v53.body.body || "").length,
        body_preview: (v53.body.body || "").slice(0, 200),
        assets: (v53.body.assets || []).map((a) => ({
          id: a.id,
          name: a.name,
          size: a.size,
        })),
      };
    } else {
      out[name].v953 = { err: v53.status };
    }
  }

  const result = JSON.stringify(out, null, 2);
  console.log(result);
  fs.writeFileSync(
    path.join(__dirname, "_inspect_state.out.json"),
    result,
    "utf8",
  );
})();
