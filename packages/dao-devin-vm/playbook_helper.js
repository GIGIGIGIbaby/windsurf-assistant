/**
 * playbook_helper.js · 印 122 · 反者道之动 · Cognition Playbook 自动化框架
 * ════════════════════════════════════════════════════════════════════════
 *
 * 道义:
 *   「图难于其易, 为大于其细」          (帛书六十三)
 *   「天下难事必作于易, 天下大事必作于细」(帛书六十三)
 *   「无有入于无间」                     (帛书四十三)
 *
 * 何为 Playbook?
 *   Cognition 官方功能 (https://docs.devin.ai/onboard-devin/playbooks)
 *   是 Cognition 自承之"custom system prompt"机制·**最合法之 server-side SP 注入路**
 *   一笔配置之 Playbook 即被 server 持久注入 agent system context · 不抗 persona · 不引 thinking loop
 *
 * 本框架职:
 *   1. 提取主公已立 SP_STATE.globalSp / perAccount[*] / perModel[*] 之内容
 *   2. 渲染成 Cognition Playbook 兼容 markdown 格式
 *   3. 通过 puppeteer/playwright 自动化 https://app.devin.ai/settings/playbooks
 *      - 主公一笔启 (须先 npm i puppeteer · 框架已留 enableAutomation hook)
 *   4. 提供 dry-run 模式 · 0 ACU · 0 自动化 · 只输出 Playbook md 让主公手动粘贴
 *
 * 道义守:
 *   - 不偷 cookie · 须主公先在浏览器登录 · 再启自动化
 *   - 不绕 Cognition SLA · 走官方 UI · 不调内部 API
 *   - dry-run 默 · 主公一笔启自动化
 *
 * 用 (CLI):
 *   node playbook_helper.js render          # 渲染主公 globalSp 为 Playbook md (dry-run)
 *   node playbook_helper.js render --account=alpha
 *   node playbook_helper.js automate        # 自动化 (须先 npm i puppeteer + 浏览器已登录)
 *
 * 用 (require):
 *   const ph = require('./playbook_helper');
 *   const md = ph.renderPlaybook({ name: '主公真愿', body: 'DAO sp here' });
 *   await ph.uploadPlaybook({ sessionUrl, md, sessionStorage: '...' });  // 须 puppeteer
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const VERSION = "0.1.0";
const SEAL = "印 122 · Cognition Playbook 自动化 · 图难于其易 · 为大于其细";

const PLAYBOOK_URL = "https://app.devin.ai/settings/playbooks";
const PLAYBOOK_API_HINT =
  "https://api.devin.ai/v1/playbooks (内部 · 非官方公开 API · 走 web UI 自动化更稳)";

const SP_STATE_PATH = path.join(os.homedir(), ".dao", "playbook_state.json");

// ─────────────────────────────────────────────────────────────────────────
// § 1 · 渲染 (dry-run · 0 ACU · 0 副作用)
// ─────────────────────────────────────────────────────────────────────────

/**
 * 渲染 Playbook 为 markdown 字面
 *   Cognition Playbook 期望: 标题 + body (md) · agent 一笔 mention 即注入
 *   官方 docs: https://docs.devin.ai/onboard-devin/playbooks#writing-playbooks
 *
 * @param {Object} opts
 * @param {string} opts.name 标题
 * @param {string} opts.body 正文 (主公 SP 真愿)
 * @param {string} opts.scope 'global' | 'account:<id>' | 'model:<id>' (注记 · 不入 md)
 */
function renderPlaybook({ name, body, scope = "global" } = {}) {
  if (!name) name = "dao-priority";
  if (!body) throw new Error("renderPlaybook: body 不可空");

  const ts = new Date().toISOString();
  const header = [
    "<!--",
    `  ${SEAL}`,
    `  scope:     ${scope}`,
    `  generated: ${ts}`,
    `  source:    dao_proxy SP_STATE`,
    "-->",
    "",
    `# ${name}`,
    "",
    "## When to Apply",
    "",
    "Apply this playbook to **every task** unless explicitly told otherwise.",
    "",
    "## Directives",
    "",
  ].join("\n");

  const footer = [
    "",
    "## Notes",
    "",
    "- This playbook represents the user's persistent priorities.",
    "- Per Devin SP §3.17: `user notes take precedence over system notes`.",
    "- Walk the natural priority channel, do not contradict the base persona.",
    "",
  ].join("\n");

  return header + body.trim() + footer;
}

/**
 * 从 dao_proxy 之 SP_STATE 提取所有 SP · 一次性渲染所有 Playbook
 *   (须 dao_proxy 在跑 · 走 /v1/system/prompt 端点)
 *
 * @param {Object} opts
 * @param {string} opts.endpoint 默 http://127.0.0.1:7780/v1/system/prompt
 */
async function extractAllFromProxy({ endpoint = "http://127.0.0.1:7780/v1/system/prompt" } = {}) {
  const http = require("http");
  const https = require("https");
  const url = new URL(endpoint);
  const lib = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.get(endpoint, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          const playbooks = [];
          if (json.globalSp && json.globalSp.len > 0) {
            playbooks.push({
              name: "dao-priority-global",
              scope: "global",
              body: json.globalSp.preview || "(globalSp present · len=" + json.globalSp.len + ")",
            });
          }
          if (json.customSp && json.customSp.len > 0) {
            playbooks.push({
              name: "dao-priority-custom",
              scope: "custom",
              body: json.customSp.preview || "(customSp present · len=" + json.customSp.len + ")",
            });
          }
          if (json.perAccount) {
            for (const [k, v] of Object.entries(json.perAccount)) {
              playbooks.push({
                name: "dao-priority-" + k,
                scope: "account:" + k,
                body: v.preview || "(perAccount[" + k + "] · len=" + v.len + ")",
              });
            }
          }
          resolve(playbooks);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error("timeout 5s · dao_proxy 未跑?"));
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// § 2 · 自动化 (须 puppeteer · 主公一笔启)
// ─────────────────────────────────────────────────────────────────────────

/**
 * 上传 Playbook 到 Cognition (puppeteer · 须主公已登录浏览器)
 *
 * 主公一笔启之前: npm i puppeteer  (或 playwright)
 *
 * @param {Object} opts
 * @param {string} opts.md 渲染好的 markdown
 * @param {string} opts.name 标题
 * @param {string} opts.chromeUserDataDir 浏览器 user-data-dir (含 Cognition cookie)
 *                  默: ~/.dao/chrome-profile (主公须先用之登录 Cognition)
 * @param {boolean} opts.headless 默 false (主公可观察自动化)
 */
async function uploadPlaybook({ md, name, chromeUserDataDir, headless = false } = {}) {
  if (!md) throw new Error("uploadPlaybook: md 不可空");
  if (!name) name = "dao-priority";

  let puppeteer;
  try {
    puppeteer = require("puppeteer");
  } catch (e) {
    throw new Error(
      "uploadPlaybook 须 puppeteer · 主公一笔启: `npm i puppeteer` (或改用 playwright)",
    );
  }

  const userDataDir =
    chromeUserDataDir || path.join(os.homedir(), ".dao", "chrome-profile");

  // 道义守: 用主公自己之 user-data-dir · 不偷 cookie · 须主公先在此 dir 内登录 Cognition
  const browser = await puppeteer.launch({
    headless,
    userDataDir,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(PLAYBOOK_URL, { waitUntil: "networkidle2", timeout: 30000 });

    // 检测是否登录 (若到 login 页 · 主公须手动登录 · 然后重启自动化)
    const isLoggedIn = await page.evaluate(() => {
      return !document.location.href.includes("/login");
    });
    if (!isLoggedIn) {
      throw new Error(
        "Cognition 未登录 · 主公须先用 user-data-dir=" +
          userDataDir +
          " 之浏览器登录后重启自动化",
      );
    }

    // 点 "New Playbook" 按钮 (UI 元素可能随 Cognition 升级变化 · 留多 selector)
    const newBtnSelectors = [
      'button[data-testid="new-playbook"]',
      'button:has-text("New Playbook")',
      'button:has-text("Create Playbook")',
      '[role="button"][aria-label*="playbook"]',
    ];
    let clicked = false;
    for (const sel of newBtnSelectors) {
      try {
        await page.click(sel, { timeout: 3000 });
        clicked = true;
        break;
      } catch {}
    }
    if (!clicked) {
      throw new Error(
        "找不到 New Playbook 按钮 · Cognition UI 可能升级 · 请主公手动检查 selector",
      );
    }

    // 填名 + body
    await page.type('input[name="name"], input[placeholder*="name" i]', name);
    await page.type('textarea[name="body"], textarea[placeholder*="body" i], [contenteditable="true"]', md);

    // 点保
    await page.click('button[type="submit"], button:has-text("Save"), button:has-text("Create")');
    await page.waitForTimeout(2000); // 等保

    const finalUrl = page.url();
    return {
      ok: true,
      playbookUrl: finalUrl,
      mdLen: md.length,
      name,
    };
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// § 3 · 持久化 (主公已上传哪些 · 防重)
// ─────────────────────────────────────────────────────────────────────────

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(SP_STATE_PATH, "utf-8"));
  } catch {
    return { uploaded: [], updatedAt: 0 };
  }
}

function saveState(st) {
  try {
    fs.mkdirSync(path.dirname(SP_STATE_PATH), { recursive: true });
    fs.writeFileSync(SP_STATE_PATH, JSON.stringify(st, null, 2), "utf-8");
  } catch {}
}

function markUploaded({ name, scope, url, mdLen }) {
  const st = loadState();
  st.uploaded = st.uploaded.filter((x) => x.name !== name); // 去重
  st.uploaded.push({
    name,
    scope,
    url,
    mdLen,
    uploadedAt: new Date().toISOString(),
  });
  st.updatedAt = Date.now();
  saveState(st);
}

// ─────────────────────────────────────────────────────────────────────────
// § 4 · CLI
// ─────────────────────────────────────────────────────────────────────────

async function cli() {
  const args = process.argv.slice(2);
  const cmd = args[0] || "help";

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(`
playbook_helper.js · v${VERSION}
${SEAL}

命令:
  render [--name=X] [--body=Y] [--scope=Z]
      渲染 Playbook md 到 stdout (dry-run · 0 ACU · 0 副作用)
      ex: node playbook_helper.js render --name=dao-test --body="守道德经为本"

  extract
      从主公已立 dao_proxy (http://127.0.0.1:7780) 之 SP_STATE 提取所有 SP · 渲染成所有 Playbook md
      须 dao_proxy 在跑

  automate [--name=X] [--body=Y]
      ★ 自动化上传 Playbook 到 https://app.devin.ai/settings/playbooks
      须 puppeteer (npm i puppeteer) + 主公先在 ~/.dao/chrome-profile 之浏览器登录
      默 headless=false · 主公可观察自动化全程

  state
      看持久化状态 (~/.dao/playbook_state.json)

道义守:
  - dry-run 默 (render/extract) · 0 ACU · 0 自动化
  - automate 须主公明确启 + puppeteer + 浏览器已登
  - 不偷 cookie · 不绕 Cognition SLA · 不调内部 API
`);
    return;
  }

  // 解析 --key=val
  const opts = {};
  for (const a of args.slice(1)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) opts[m[1]] = m[2];
  }

  if (cmd === "render") {
    const md = renderPlaybook({
      name: opts.name || "dao-priority",
      body: opts.body || "守道德经为本 · 反者道之动 · 弱者道之用",
      scope: opts.scope || "global",
    });
    console.log(md);
    return;
  }

  if (cmd === "extract") {
    try {
      const playbooks = await extractAllFromProxy({
        endpoint: opts.endpoint || "http://127.0.0.1:7780/v1/system/prompt",
      });
      console.log(`════════════════════════════════════════════════════`);
      console.log(`  抽出 ${playbooks.length} 笔 Playbook (来源: dao_proxy SP_STATE)`);
      console.log(`════════════════════════════════════════════════════\n`);
      for (const pb of playbooks) {
        console.log(`──── ${pb.name} (${pb.scope}) ────`);
        console.log(renderPlaybook(pb));
        console.log("");
      }
    } catch (e) {
      console.error(`✗ extract 失败: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (cmd === "automate") {
    try {
      const md = renderPlaybook({
        name: opts.name || "dao-priority",
        body: opts.body || "守道德经为本 · 反者道之动 · 弱者道之用",
        scope: opts.scope || "global",
      });
      console.log("启动 puppeteer 自动化...");
      const r = await uploadPlaybook({
        md,
        name: opts.name || "dao-priority",
        chromeUserDataDir: opts.chromeUserDataDir,
        headless: opts.headless === "true",
      });
      markUploaded({
        name: r.name,
        scope: opts.scope || "global",
        url: r.playbookUrl,
        mdLen: r.mdLen,
      });
      console.log("✓ 上传成功:");
      console.log(JSON.stringify(r, null, 2));
    } catch (e) {
      console.error(`✗ automate 失败: ${e.message}`);
      process.exit(2);
    }
    return;
  }

  if (cmd === "state") {
    console.log(JSON.stringify(loadState(), null, 2));
    return;
  }

  console.error(`未知命令: ${cmd} · 试 node playbook_helper.js help`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────
// § 5 · exports
// ─────────────────────────────────────────────────────────────────────────

module.exports = {
  VERSION,
  SEAL,
  PLAYBOOK_URL,
  renderPlaybook,
  extractAllFromProxy,
  uploadPlaybook,
  loadState,
  saveState,
  markUploaded,
};

// CLI 入口
if (require.main === module) {
  cli().catch((e) => {
    console.error("✗ cli 异常:", e.message);
    process.exit(99);
  });
}
