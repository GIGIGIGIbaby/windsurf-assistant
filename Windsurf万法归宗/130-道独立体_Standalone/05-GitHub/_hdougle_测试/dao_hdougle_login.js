#!/usr/bin/env node
/**
 * dao_hdougle_login.js · hdougle 账号独立自动化登录 + PAT 创建
 * ════════════════════════════════════════════════════════════════════════
 *
 * 「执大象，天下往」「无有入于无间」「损之又损，以至于无为」
 *
 * 目的:
 *   完全脱离 zhouyoukang 主账号，用 hdougle 独立账号验证 GitHub Actions 反带
 *
 * 流程:
 *   1. 本地计算 TOTP（密钥从 ~/.dao/hdougle/creds.json 读 · 算法 RFC 6238）
 *   2. Playwright 打开 GitHub 登录
 *   3. 填账号 + 密码（从 creds.json 读）
 *   4. 填 2FA TOTP
 *   5. 创建 PAT (scopes: public_repo, gist, workflow)
 *   6. 保存 PAT 到 ~/.dao/hdougle/token (独立路径 · 避免与 zhouyoukang 冲突)
 *
 * 用法:
 *   node dao_hdougle_login.js                # 完整流程
 *   node dao_hdougle_login.js totp          # 仅打印当前 TOTP
 *   node dao_hdougle_login.js whoami        # 验证已存的 PAT 还活
 *   node dao_hdougle_login.js token         # 静默输出 token (供管道用)
 */
"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

// 用 01-VM 的 playwright (已装)
const PLAYWRIGHT_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "01-VM",
  "node_modules",
);
const { chromium } = require(path.join(PLAYWRIGHT_DIR, "playwright"));

// Playwright 1.60 默认要 chromium-1223，本地只有 1212/1208/1187，强指 1212
const CHROME_EXE_CANDIDATES = [
  "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1212\\chrome-win64\\chrome.exe",
  "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe",
  "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1187\\chrome-win\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
function findChrome() {
  for (const p of CHROME_EXE_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ─── 独立存储位 (避开 zhouyoukang 的 ~/.dao/github_token) ─────────────────
const HD_DIR = path.join(os.homedir(), ".dao", "hdougle");

// ─── 凭证: 从 ~/.dao/hdougle/creds.json 读 (绝不硬编码) ──────────────────
const CREDS_FILE = path.join(HD_DIR, "creds.json");
function loadCreds() {
  if (!fs.existsSync(CREDS_FILE)) {
    console.error(`✗ 凭证文件不存在: ${CREDS_FILE}`);
    console.error(`  请创建一份, 格式:`);
    console.error(
      `  {"user":"hdougle","pass":"YOUR_PASSWORD","totp_secret":"YOUR_TOTP_BASE32"}`,
    );
    process.exit(2);
  }
  try {
    return JSON.parse(fs.readFileSync(CREDS_FILE, "utf8"));
  } catch (e) {
    console.error(`✗ 凭证文件格式错: ${e.message}`);
    process.exit(2);
  }
}
const CREDS = loadCreds();
const HD_USER = CREDS.user || "hdougle";
const HD_PASS = CREDS.pass;
const HD_SECRET = CREDS.totp_secret;
if (!HD_PASS || !HD_SECRET) {
  console.error(`✗ creds.json 缺 pass 或 totp_secret`);
  process.exit(2);
}
const TOKEN_FILE = path.join(HD_DIR, "token");
const META_FILE = path.join(HD_DIR, "meta.json");
const COOKIE_FILE = path.join(HD_DIR, "cookies.json");
const PROFILE_DIR = path.join(HD_DIR, "browser_profile");

function ensureDir() {
  if (!fs.existsSync(HD_DIR)) fs.mkdirSync(HD_DIR, { recursive: true });
  if (!fs.existsSync(PROFILE_DIR))
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

// ─── TOTP (RFC 6238) ──────────────────────────────────────────────────────
function base32ToBuffer(b32) {
  const clean = b32.replace(/=+$/, "").toUpperCase().replace(/\s+/g, "");
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of clean) {
    const i = alpha.indexOf(ch);
    if (i < 0) throw new Error(`bad base32 char ${ch}`);
    bits += i.toString(2).padStart(5, "0");
  }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    out.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(out);
}

function totp(
  secret = HD_SECRET,
  { period = 30, digits = 6, algo = "sha1", time = Date.now() } = {},
) {
  const counter = Math.floor(time / 1000 / period);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const key = base32ToBuffer(secret);
  const h = crypto.createHmac(algo, key).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code =
    (((h[off] & 0x7f) << 24) |
      ((h[off + 1] & 0xff) << 16) |
      ((h[off + 2] & 0xff) << 8) |
      (h[off + 3] & 0xff)) %
    10 ** digits;
  return code.toString().padStart(digits, "0");
}

function totpRemainSec({ period = 30, time = Date.now() } = {}) {
  const sec = Math.floor(time / 1000);
  return period - (sec % period);
}

// ─── HTTP (验证 PAT) · 支持 :7890 代理 ────────────────────────────────────
const https = require("https");
const net = require("net");
const tls = require("tls");

const PROXY_HOST = process.env.DAO_PROXY_HOST || "127.0.0.1";
const PROXY_PORT = parseInt(process.env.DAO_PROXY_PORT || "7890", 10);
const NO_PROXY = process.env.DAO_NO_PROXY === "1";

function ghVerifyViaProxy(token) {
  return new Promise((resolve) => {
    const reqLines = [
      "GET /user HTTP/1.1",
      "Host: api.github.com",
      `Authorization: Bearer ${token}`,
      "User-Agent: dao-hdougle/1.0",
      "Accept: application/vnd.github+json",
      "Connection: close",
      "",
      "",
    ].join("\r\n");

    const sock = net.connect(PROXY_PORT, PROXY_HOST, () => {
      sock.write(
        `CONNECT api.github.com:443 HTTP/1.1\r\nHost: api.github.com:443\r\n\r\n`,
      );
    });
    sock.setTimeout(20000);
    sock.once("data", (chunk) => {
      if (!chunk.toString().startsWith("HTTP/1.1 200")) {
        return resolve({
          status: 0,
          error: "CONNECT failed: " + chunk.toString().slice(0, 200),
        });
      }
      const t = tls.connect(
        {
          socket: sock,
          servername: "api.github.com",
          rejectUnauthorized: false,
        },
        () => {
          t.write(reqLines);
        },
      );
      const bufs = [];
      t.on("data", (c) => bufs.push(c));
      t.on("end", () => {
        const raw = Buffer.concat(bufs).toString("utf8");
        const i = raw.indexOf("\r\n\r\n");
        if (i < 0)
          return resolve({
            status: 0,
            error: "no body sep",
            raw: raw.slice(0, 200),
          });
        const head = raw.slice(0, i);
        const body = raw.slice(i + 4);
        const m = head.match(/^HTTP\/1\.1 (\d+)/);
        const status = m ? parseInt(m[1], 10) : 0;
        // 去 chunk encoding 头
        let bodyStr = body;
        if (/transfer-encoding:\s*chunked/i.test(head)) {
          const parts = [];
          let p = 0;
          while (p < body.length) {
            const nl = body.indexOf("\r\n", p);
            if (nl < 0) break;
            const sz = parseInt(body.slice(p, nl), 16);
            if (!sz) break;
            parts.push(body.slice(nl + 2, nl + 2 + sz));
            p = nl + 2 + sz + 2;
          }
          bodyStr = parts.join("");
        }
        let j = null;
        try {
          j = JSON.parse(bodyStr);
        } catch {}
        resolve({ status, body: j, raw_body: bodyStr });
      });
      t.on("error", (e) => resolve({ status: 0, error: "tls: " + e.message }));
    });
    sock.on("error", (e) =>
      resolve({ status: 0, error: "sock: " + e.message }),
    );
    sock.on("timeout", () => {
      sock.destroy();
      resolve({ status: 0, error: "proxy timeout" });
    });
  });
}

function ghVerifyDirect(token) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.github.com",
        port: 443,
        path: "/user",
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "dao-hdougle/1.0",
          Accept: "application/vnd.github+json",
        },
        timeout: 15000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const data = Buffer.concat(chunks).toString("utf8");
          let j = null;
          try {
            j = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode, body: j, raw_body: data });
        });
      },
    );
    req.on("error", (e) => resolve({ status: 0, error: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, error: "timeout" });
    });
    req.end();
  });
}

// 包装: 先尝试代理 (Windows 一般用 :7890)，再回退直连
async function ghVerify(token) {
  if (!NO_PROXY) {
    const r = await ghVerifyViaProxy(token);
    if (r.status === 200 && r.body) return r;
    if (r.status === 0) {
      // 代理本身不通才回退；其它非 200 不回退（避免重复消耗 ratelimit）
      console.log(
        `[${ts()}] 代理 ${PROXY_HOST}:${PROXY_PORT} 不通 (${r.error}), 回退直连 ...`,
      );
    } else {
      return r; // 拿到 status 就返
    }
  }
  return ghVerifyDirect(token);
}

// ─── Playwright 自动登录 + 创建 PAT ─────────────────────────────────────
async function doLogin({ headless = false } = {}) {
  ensureDir();

  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  const exe = findChrome();
  if (!exe)
    throw new Error("找不到 chrome.exe (检查 ms-playwright/chromium-1212 等)");
  console.log(`[${ts()}] 启动 Chromium (headless=${headless}, exe=${exe})`);
  console.log(`[${ts()}]   profile=${PROFILE_DIR}`);

  // 用 persistentContext: 可以保留登录态 (cookies)，下次启动直接复用
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    executablePath: exe,
    viewport: { width: 1280, height: 800 },
    userAgent,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  // 反检测
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  let token = null;
  let user = null;
  let pageError = null;

  try {
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);

    // === 第一步: 看是否已登录 ===
    console.log(`[${ts()}] 访问 github.com/settings/profile 探登录态 ...`);
    await page.goto("https://github.com/settings/profile", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    const url = page.url();
    const needLogin = url.includes("/login") || url.includes("/session");

    if (needLogin) {
      console.log(`[${ts()}] 需要登录: 当前 URL = ${url}`);

      // 跳转登录页
      if (!url.includes("/login")) {
        await page.goto("https://github.com/login", {
          waitUntil: "domcontentloaded",
        });
        await page.waitForTimeout(1500);
      }

      // 填账号
      console.log(`[${ts()}] 填账号 ${HD_USER} ...`);
      await page.fill('input[name="login"]', HD_USER);
      await page.fill('input[name="password"]', HD_PASS);
      await page.waitForTimeout(500);

      console.log(`[${ts()}] 点 Sign in ...`);
      await page.click('input[type="submit"][name="commit"]');
      await page.waitForTimeout(4000);

      // 探: 是否有错误闪屏
      const flashErr = await page
        .locator(
          '#js-flash-container .flash-error, .flash-error, [data-test-selector="flash-error"]',
        )
        .first()
        .textContent({ timeout: 2000 })
        .catch(() => null);
      if (flashErr) {
        const shot = path.join(HD_DIR, `flash_err_${Date.now()}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        console.log(`[${ts()}] flash error: ${flashErr.trim()} · shot=${shot}`);
      }

      // === 2FA 处理 (多种 URL 形式 + 检 OTP 输入框) ===
      const url2 = page.url();
      console.log(`[${ts()}] 登录后 URL = ${url2}`);

      // 总是先截图保留现场
      const shotPostLogin = path.join(HD_DIR, `post_login_${Date.now()}.png`);
      await page
        .screenshot({ path: shotPostLogin, fullPage: true })
        .catch(() => {});
      console.log(`[${ts()}] 截图: ${shotPostLogin}`);

      // 检 OTP 输入框存在 (无论 URL)
      const otpProbe = await page
        .locator(
          'input[name="app_otp"], input[name="otp"], input#totp, input#app_totp, input[autocomplete="one-time-code"]',
        )
        .first()
        .count()
        .catch(() => 0);

      const isTwoFactor =
        url2.includes("/sessions/two-factor") ||
        url2.includes("/two_factor") ||
        otpProbe > 0;

      if (isTwoFactor) {
        // 等待 TOTP 在 30s 区间稳定的中位 (避临界)
        const remain = totpRemainSec();
        if (remain < 5) {
          console.log(`[${ts()}] TOTP 仅剩 ${remain}s 即过期，等下一轮 ...`);
          await page.waitForTimeout((remain + 1) * 1000);
        }

        const code = totp();
        console.log(`[${ts()}] 计算 TOTP = ${code} (剩 ${totpRemainSec()}s)`);

        // 填 TOTP
        const otpInput = await page
          .locator(
            'input[name="app_otp"], input[name="otp"], input#totp, input[autocomplete="one-time-code"]',
          )
          .first();
        await otpInput.waitFor({ state: "visible", timeout: 15000 });
        await otpInput.fill(code);
        console.log(`[${ts()}] TOTP 已填 · 等待提交 ...`);
        await page.waitForTimeout(2500);

        // GitHub 现版本 OTP 输入完会自动提交，但保险起见再敲 Enter
        try {
          await otpInput.press("Enter");
        } catch {}
        await page.waitForTimeout(4000);
      }

      // 等待跳转完
      try {
        await page.waitForURL(
          (u) =>
            !u.toString().includes("/sessions/") &&
            !u.toString().includes("/login"),
          { timeout: 25000 },
        );
      } catch (e) {
        console.log(`[${ts()}] 等待跳转超时: ${e.message}`);
      }

      const finalUrl = page.url();
      console.log(`[${ts()}] 登录后最终 URL = ${finalUrl}`);

      if (finalUrl.includes("/login") || finalUrl.includes("/sessions/")) {
        // 截图保留现场
        const shot = path.join(HD_DIR, `login_fail_${Date.now()}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        throw new Error(`登录失败 · 仍在 ${finalUrl} · 截图: ${shot}`);
      }

      console.log(`[${ts()}] ✓ 登录成功`);
    } else {
      console.log(`[${ts()}] ✓ 已登录 (复用 profile cookie)`);
    }

    // === 验证当前用户 ===
    await page.goto("https://github.com/settings/profile", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);
    const realUser = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="user-login"]');
      return meta ? meta.getAttribute("content") : null;
    });
    user = realUser;
    console.log(`[${ts()}] 当前登录用户 = ${user}`);
    if (user !== HD_USER) {
      throw new Error(`期望 ${HD_USER}, 实际 ${user}`);
    }

    // === 创建 PAT (Classic) ===
    console.log(`[${ts()}] 访问 PAT 创建页 ...`);
    await page.goto("https://github.com/settings/tokens/new", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    // 如果遇到 sudo 模式提示 (二次密码确认)
    const sudoUrl = page.url();
    if (sudoUrl.includes("/sessions/sudo")) {
      console.log(`[${ts()}] 触发 sudo 二次确认，重输密码 ...`);
      // GitHub sudo 现在用户名是固定的 (已登录)，只需密码
      const pwInput = await page
        .locator('input[name="sudo_password"], input[name="password"]')
        .first();
      await pwInput.fill(HD_PASS);
      const sudoBtn = await page
        .locator('button:has-text("Confirm"), input[type="submit"]')
        .first();
      await sudoBtn.click();
      await page.waitForTimeout(3000);

      // sudo 后可能再要 2FA
      if (
        page.url().includes("two-factor") ||
        page.url().includes("two_factor")
      ) {
        const code = totp();
        const otpInput = await page
          .locator(
            'input[name="app_otp"], input[name="otp"], input[autocomplete="one-time-code"]',
          )
          .first();
        await otpInput.fill(code);
        await page.waitForTimeout(2500);
        try {
          await otpInput.press("Enter");
        } catch {}
        await page.waitForTimeout(4000);
      }

      // 再次访问 PAT 页
      await page.goto("https://github.com/settings/tokens/new", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(2000);
    }

    // 填 PAT 表单
    console.log(`[${ts()}] 填 PAT 表单 ...`);
    const noteName = `dao-hdougle-${Date.now()}`;
    await page.fill("input#oauth_access_description", noteName);

    // expiration: 90 天 (默)，可以不动；或者改成 No expiration
    try {
      const expSelect = await page
        .locator("select#oauth_access_default_expires_at")
        .first();
      await expSelect.selectOption({ label: "No expiration" });
    } catch (e) {
      console.log(
        `[${ts()}] 设过期失败 (可能 GitHub 不允许 No expiration): ${e.message}`,
      );
    }

    // 勾选 scopes: repo, gist, workflow
    // GitHub 用 checkbox · id 形如 #oauth_access_scopes_repo
    const scopesToCheck = ["repo", "gist", "workflow"];
    for (const s of scopesToCheck) {
      const cb = page.locator(`input[type="checkbox"][value="${s}"]`).first();
      try {
        await cb.check({ timeout: 5000 });
        console.log(`[${ts()}]   ✓ 勾选 scope: ${s}`);
      } catch (e) {
        console.log(`[${ts()}]   ✗ 勾选 ${s} 失败: ${e.message}`);
      }
    }

    // 提交
    console.log(`[${ts()}] 提交创建 PAT ...`);
    const submitBtn = await page
      .locator(
        'button[type="submit"]:has-text("Generate token"), input[type="submit"][value*="Generate"]',
      )
      .first();
    await submitBtn.click();
    await page.waitForTimeout(4000);

    // 提取 PAT
    // GitHub 显示 PAT 在 .token 类的 code 元素里，或 input 里
    try {
      // 新版 UI: <input id="new-oauth-token" readonly value="ghp_xxx">
      const tokenInput = page
        .locator("#new-oauth-token, input.token, code.token")
        .first();
      await tokenInput.waitFor({ state: "visible", timeout: 10000 });
      const v1 = await tokenInput.inputValue().catch(() => null);
      const v2 = !v1 ? await tokenInput.textContent() : null;
      token = (v1 || v2 || "").trim();
    } catch (e) {
      // 备选: 在页面文本中找 ghp_xxx 格式
      const html = await page.content();
      const m = html.match(/ghp_[A-Za-z0-9]{36,}/);
      if (m) token = m[0];
    }

    if (!token || !token.startsWith("ghp_")) {
      const shot = path.join(HD_DIR, `pat_fail_${Date.now()}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      throw new Error(`未提取到 PAT · 截图: ${shot}`);
    }

    console.log(
      `[${ts()}] ✓ PAT 已创建 = ${token.slice(0, 12)}...${token.slice(-4)} (len=${token.length})`,
    );

    // 保存 cookies
    const cookies = await ctx.cookies();
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
    console.log(`[${ts()}] cookies 已存: ${COOKIE_FILE}`);
  } catch (e) {
    pageError = e;
    console.error(`[${ts()}] 出错: ${e.message}`);
  } finally {
    await ctx.close();
  }

  if (pageError) throw pageError;

  // === 关键: token 立即落盘 (即使后续验证失败也不丢 PAT) ===
  fs.writeFileSync(TOKEN_FILE, token + "\n", { mode: 0o600 });
  console.log(`[${ts()}] ✓ Token 即时落盘: ${TOKEN_FILE}`);

  // === 验证 PAT ===
  console.log(`[${ts()}] 验证 PAT 可调 /user ...`);
  const v = await ghVerify(token);
  if (v.status !== 200 || !v.body) {
    const debug = JSON.stringify(v.body || v.error || v.raw_body || "").slice(
      0,
      300,
    );
    console.warn(
      `[${ts()}] ⚠ PAT 验证非 200 (status=${v.status}, debug=${debug}), 但 token 已落盘可继续手动验证`,
    );
    // 不再 throw — token 已存
    fs.writeFileSync(
      META_FILE,
      JSON.stringify(
        {
          user: HD_USER,
          id: null,
          created_at: new Date().toISOString(),
          token_prefix: token.slice(0, 12),
          token_suffix: token.slice(-4),
          token_len: token.length,
          verify_status: v.status,
          verify_error: v.error || null,
          verify_raw: (v.raw_body || "").slice(0, 200),
        },
        null,
        2,
      ),
    );
    return { token, login: HD_USER, id: null, verify_failed: true };
  }
  console.log(
    `[${ts()}] ✓ PAT 验证通 · login=${v.body.login} · id=${v.body.id}`,
  );
  if (v.body.login !== HD_USER) {
    throw new Error(`PAT 属于 ${v.body.login}，期望 ${HD_USER}`);
  }

  // === 持久化 meta ===
  fs.writeFileSync(
    META_FILE,
    JSON.stringify(
      {
        user: v.body.login,
        id: v.body.id,
        created_at: new Date().toISOString(),
        token_prefix: token.slice(0, 12),
        token_suffix: token.slice(-4),
        token_len: token.length,
        verify_status: 200,
      },
      null,
      2,
    ),
  );

  console.log(`[${ts()}] ✓ Meta 已保存:  ${META_FILE}`);

  return { token, login: v.body.login, id: v.body.id };
}

// ─── 复用已存 PAT ─────────────────────────────────────────────────────────
function loadToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const t = fs.readFileSync(TOKEN_FILE, "utf8").trim();
      if (t && t.startsWith("ghp_")) return t;
    }
  } catch {}
  return null;
}

async function whoami() {
  const t = loadToken();
  if (!t) {
    console.log("× 未存 token · 需先 login");
    process.exit(1);
  }
  const v = await ghVerify(t);
  if (v.status !== 200) {
    console.log(`× token 失效 · status=${v.status}`);
    process.exit(1);
  }
  console.log(
    `✓ login=${v.body.login} id=${v.body.id} token=${t.slice(0, 12)}...${t.slice(-4)}`,
  );
}

// ─── ts ──────────────────────────────────────────────────────────────────
function ts() {
  return new Date().toISOString().slice(11, 19);
}

// ─── 入口 ────────────────────────────────────────────────────────────────
async function main() {
  const cmd = process.argv[2] || "login";

  switch (cmd) {
    case "totp": {
      console.log(`TOTP = ${totp()} (剩 ${totpRemainSec()}s)`);
      break;
    }
    case "whoami":
    case "status": {
      await whoami();
      break;
    }
    case "token": {
      const t = loadToken();
      if (t) process.stdout.write(t);
      else process.exit(1);
      break;
    }
    case "login":
    default: {
      // 若已有有效 token · 直接跳过
      const existing = loadToken();
      if (existing) {
        const v = await ghVerify(existing);
        if (v.status === 200 && v.body.login === HD_USER) {
          console.log(`✓ 已有有效 PAT · login=${v.body.login} · 跳过登录`);
          console.log(
            `  token=${existing.slice(0, 12)}...${existing.slice(-4)}`,
          );
          console.log(`  欲强制重创: del ${TOKEN_FILE} && 再 run`);
          return;
        }
      }
      const headless =
        process.argv.includes("--headless") || process.env.HEADLESS === "1";
      const r = await doLogin({ headless });
      console.log("");
      console.log(`══ hdougle 入网完成 ══`);
      console.log(`  login: ${r.login}`);
      console.log(`  id:    ${r.id}`);
      console.log(`  token: ${r.token.slice(0, 12)}...${r.token.slice(-4)}`);
      console.log(`  路径:  ${TOKEN_FILE}`);
      break;
    }
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error("✗ " + e.message);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  });
}

module.exports = {
  totp,
  totpRemainSec,
  loadToken,
  ghVerify,
  doLogin,
  HD_USER,
  HD_SECRET,
  TOKEN_FILE,
  META_FILE,
  HD_DIR,
};
