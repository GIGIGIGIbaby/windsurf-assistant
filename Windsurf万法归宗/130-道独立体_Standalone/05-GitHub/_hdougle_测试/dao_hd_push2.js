#!/usr/bin/env node
/**
 * dao_hd_push2.js · 用 hdougle PAT 推核心文件 (基于 gh_curl)
 * 「道之动」「无有入于无间」
 */
"use strict";

const fs   = require("fs");
const os   = require("os");
const path = require("path");
const gh_curl = require("./gh_curl");

const TOKEN  = fs.readFileSync(path.join(os.homedir(), ".dao", "hdougle", "token"), "utf8").trim();
const OWNER  = "hdougle";
const REPO   = "windsurf-assistant";
const BRANCH = "main";

const gh = gh_curl.make({ token: TOKEN, owner: OWNER, repo: REPO, branch: BRANCH });

const FILES = [
  {
    local:  path.resolve(__dirname, "..", "workflows", "dao-boot.yml"),
    remote: ".github/workflows/dao-boot.yml",
    msg:    "feat(dao): add dao-boot.yml · one-shot bring-up workflow",
  },
  {
    local:  path.resolve(__dirname, "..", "dao_proxy.js"),
    remote: "130-道独立体_Standalone/05-GitHub/dao_proxy.js",
    msg:    "feat(dao): add dao_proxy.js v2.0.0 · zero-dep reverse-proxy core",
  },
];

async function pushFile(local, remote, msg) {
  console.log(`\n──── ${remote} ────`);
  console.log(`  local:  ${local}`);
  if (!fs.existsSync(local)) { console.log("  ✗ local 不存在"); return false; }

  const buf = fs.readFileSync(local);
  const b64 = buf.toString("base64");
  console.log(`  size:   ${buf.length} bytes (b64=${b64.length})`);

  // 先 GET 看 sha
  const apiPath = gh.contentsUrl(remote, BRANCH);
  console.log(`  GET ${apiPath} ...`);
  const get = gh.get(apiPath);
  console.log(`    status=${get.status}`);

  let sha = null;
  if (get.status === 200 && get.body && get.body.sha) {
    sha = get.body.sha;
    console.log(`    existing sha=${sha.slice(0, 10)}, size=${get.body.size}`);

    // 比内容 (base64 of remote vs local)
    if (get.body.size === buf.length && get.body.encoding === "base64") {
      const remoteContent = Buffer.from((get.body.content || "").replace(/\n/g, ""), "base64");
      if (remoteContent.equals(buf)) {
        console.log("  = 内容一致, 跳");
        return true;
      }
    }
  } else if (get.status === 404) {
    console.log("    not exist, will create");
  } else {
    console.log(`    GET 异常 body: ${JSON.stringify(get.body || get.raw_body || "").slice(0, 200)}`);
  }

  // PUT
  const payload = { message: msg, content: b64, branch: BRANCH };
  if (sha) payload.sha = sha;
  console.log(`  PUT contents/${remote} ${sha ? "(更新)" : "(创建)"} ...`);
  const put = gh.put(`/repos/${OWNER}/${REPO}/contents/${gh.encodePath(remote)}`, payload);
  console.log(`    status=${put.status}`);

  if (put.ok) {
    console.log(`  ✓ ${sha ? "更新" : "创建"}成功`);
    if (put.body && put.body.commit) {
      console.log(`    commit ${put.body.commit.sha.slice(0, 10)}: ${put.body.commit.message.split("\n")[0]}`);
    }
    return true;
  } else {
    console.log(`  ✗ 失败: ${JSON.stringify(put.body || put.raw_body || "").slice(0, 400)}`);
    return false;
  }
}

(async () => {
  console.log("══ hdougle 推送 ══");
  console.log(`  token: ${TOKEN.slice(0, 12)}...${TOKEN.slice(-4)}`);
  console.log(`  repo:  ${OWNER}/${REPO} @ ${BRANCH}`);

  const me = gh.get("/user");
  if (!me.ok) {
    console.error(`✗ verify token: ${JSON.stringify(me).slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`  ✓ login=${me.body.login} id=${me.body.id}`);

  const repo = gh.get(`/repos/${OWNER}/${REPO}`);
  if (!repo.ok) {
    console.error(`✗ repo not found: ${JSON.stringify(repo.body).slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`  ✓ repo: ${repo.body.full_name} default=${repo.body.default_branch}`);
  console.log(`    push_perm=${repo.body.permissions?.push} admin=${repo.body.permissions?.admin}`);
  console.log(`    fork=${repo.body.fork} parent=${repo.body.parent?.full_name}`);

  let okCount = 0;
  for (const f of FILES) {
    const ok = await pushFile(f.local, f.remote, f.msg);
    if (ok) okCount++;
  }

  console.log(`\n══ 推送完成: ${okCount}/${FILES.length} ══`);
  process.exit(okCount === FILES.length ? 0 : 1);
})();
