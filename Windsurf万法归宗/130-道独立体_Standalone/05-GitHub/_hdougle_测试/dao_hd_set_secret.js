#!/usr/bin/env node
/**
 * dao_hd_set_secret.js · 用 hdougle 已登录 profile 设 ACCOUNTS secret
 *
 * 「无有入于无间」「弱之胜强 · 以其无以易之也」
 *
 * 方案: 复用 dao_hdougle_login.js 留下的已登录 profile
 *       直接 navigate 到 secrets/actions/new → 填表 → 提交
 *       (零依赖: 不用 NaCl sealed box 加密)
 *
 * 用法:
 *   node dao_hd_set_secret.js                                # 用默认 ACCOUNTS
 *   node dao_hd_set_secret.js ACCOUNTS "email:pw"            # 设任意 secret
 *   node dao_hd_set_secret.js --list                         # 列已存 secrets
 */
"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");

// 用 01-VM 的 playwright (已装)
const PLAYWRIGHT_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "01-VM",
  "node_modules",
);
const { chromium } = require(path.join(PLAYWRIGHT_DIR, "playwright"));

const CHROME_EXE_CANDIDATES = [
  "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1212\\chrome-win64\\chrome.exe",
  "C:\\Users\\Administrator\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe",
];
function findChrome() {
  for (const p of CHROME_EXE_CANDIDATES) if (fs.existsSync(p)) return p;
  return null;
}

const HD_DIR = path.join(os.homedir(), ".dao", "hdougle");
const PROFILE_DIR = path.join(HD_DIR, "browser_profile");

// ─── 凭证: 从 ~/.dao/hdougle/creds.json 读 (绝不硬编码) ──────────────────
const CREDS_FILE = path.join(HD_DIR, "creds.json");
function loadCreds() {
  if (!fs.existsSync(CREDS_FILE)) {
    console.error(`✗ 凭证文件不存在: ${CREDS_FILE}`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(CREDS_FILE, "utf8"));
}
const CREDS = loadCreds();
const HD_PASS = CREDS.pass; // 用于 sudo 二次确认
const HD_SECRET = CREDS.totp_secret; // TOTP

const OWNER = "hdougle";
const REPO = "windsurf-assistant";

// 默认 secret 名 · 值需通过 CLI 参数或 env 传入 (绝不硬编码 ACCOUNTS 凭证)
const DEFAULT_SECRET_NAME = "ACCOUNTS";
const DEFAULT_SECRET_VALUE = process.env.DAO_DEFAULT_SECRET_VALUE || "";

// ─── TOTP (重用 dao_hdougle_login 的实现) ────────────────────────────────
const crypto = require("crypto");
function base32ToBuffer(b32) {
  const c = b32.replace(/=+$/, "").toUpperCase().replace(/\s+/g, "");
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of c) bits += a.indexOf(ch).toString(2).padStart(5, "0");
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secret = HD_SECRET) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const h = crypto
    .createHmac("sha1", base32ToBuffer(secret))
    .update(buf)
    .digest();
  const off = h[h.length - 1] & 0xf;
  const code =
    (((h[off] & 0x7f) << 24) |
      ((h[off + 1] & 0xff) << 16) |
      ((h[off + 2] & 0xff) << 8) |
      (h[off + 3] & 0xff)) %
    1000000;
  return code.toString().padStart(6, "0");
}

const ts = () => new Date().toISOString().slice(11, 19);

async function passSudoIfNeeded(page) {
  // GitHub 在敏感操作 (settings/secrets) 前会要 sudo (二次身份验证)
  const url = page.url();
  if (url.includes("/sessions/sudo")) {
    console.log(`[${ts()}] 触发 sudo · 重输密码`);
    // 先看是否是 OTP 模式 (已输过密码 · GitHub 直接走 OTP)
    const otpFirst = await page
      .locator(
        'input[autocomplete="one-time-code"], input[name="app_otp"], input[name="otp"]',
      )
      .first()
      .count()
      .catch(() => 0);

    if (otpFirst > 0) {
      console.log(`[${ts()}]   sudo 模式直接需 OTP`);
      const code = totp();
      await page
        .locator(
          'input[autocomplete="one-time-code"], input[name="app_otp"], input[name="otp"]',
        )
        .first()
        .fill(code);
      await page.waitForTimeout(2500);
      try {
        await page
          .locator(
            'input[autocomplete="one-time-code"], input[name="app_otp"], input[name="otp"]',
          )
          .first()
          .press("Enter");
      } catch {}
      await page.waitForTimeout(4000);
    } else {
      // 密码模式
      const pwInput = page
        .locator('input[name="sudo_password"], input[name="password"]')
        .first();
      await pwInput.fill(HD_PASS);
      const btn = page
        .locator('button[type="submit"], input[type="submit"]')
        .first();
      await btn.click();
      await page.waitForTimeout(3000);

      // 之后可能要 OTP
      if (
        page.url().includes("two-factor") ||
        page.url().includes("two_factor") ||
        (await page
          .locator('input[autocomplete="one-time-code"]')
          .count()
          .catch(() => 0)) > 0
      ) {
        const code = totp();
        await page
          .locator(
            'input[autocomplete="one-time-code"], input[name="app_otp"], input[name="otp"]',
          )
          .first()
          .fill(code);
        await page.waitForTimeout(2500);
        try {
          await page
            .locator(
              'input[autocomplete="one-time-code"], input[name="app_otp"], input[name="otp"]',
            )
            .first()
            .press("Enter");
        } catch {}
        await page.waitForTimeout(4000);
      }
    }
  }
}

async function setSecret(name, value, { headless = false } = {}) {
  const exe = findChrome();
  if (!exe) throw new Error("找不到 chrome.exe");
  console.log(`[${ts()}] 启动 Chromium · profile=${PROFILE_DIR}`);
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    executablePath: exe,
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  let result = { ok: false };
  try {
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);

    // 先验证已登录
    console.log(`[${ts()}] 验证登录态 ...`);
    await page.goto("https://github.com/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const meta = await page.evaluate(() => {
      const m = document.querySelector('meta[name="user-login"]');
      return m ? m.getAttribute("content") : null;
    });
    if (meta !== OWNER) {
      throw new Error(`未以 hdougle 登录 (current=${meta || "(none)"})`);
    }
    console.log(`[${ts()}]   ✓ logged-in as ${meta}`);

    // 直接到 secret/new
    const url = `https://github.com/${OWNER}/${REPO}/settings/secrets/actions/new`;
    console.log(`[${ts()}] navigate to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    await passSudoIfNeeded(page);
    await page.waitForTimeout(2000);

    if (!page.url().includes("/secrets/actions/new")) {
      // 可能跳到 sudo 后没回来 · 再 nav 一次
      console.log(`[${ts()}]   sudo 后 URL=${page.url()}, 重 nav`);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
    }

    const finalUrl = page.url();
    console.log(`[${ts()}] 当前 URL = ${finalUrl}`);
    if (!finalUrl.includes("/secrets/actions/new")) {
      const shot = path.join(HD_DIR, `secret_form_fail_${Date.now()}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      throw new Error(`未到 secrets/new 页面: url=${finalUrl} · 截图=${shot}`);
    }

    // 填 name + value
    console.log(
      `[${ts()}] 填 secret name=${name} value=*** (len=${value.length})`,
    );
    const nameInput = page
      .locator(
        'input[name="secret_name"], input#secret_name, input[id*="secret_name"]',
      )
      .first();
    await nameInput.waitFor({ state: "visible", timeout: 15000 });
    await nameInput.fill(name);

    const valueInput = page
      .locator(
        'textarea[name="secret_value"], textarea#secret_value, textarea[id*="secret_value"]',
      )
      .first();
    await valueInput.fill(value);
    await page.waitForTimeout(800);

    // 提交
    console.log(`[${ts()}] 提交 ...`);
    const submitBtn = page
      .locator(
        'button[type="submit"]:has-text("Add secret"), button:has-text("Add secret"), input[type="submit"][value*="Add"]',
      )
      .first();
    await submitBtn.click();
    await page.waitForTimeout(4000);

    // 验证: 跳到 list 页 + 看到 ACCOUNTS
    const afterUrl = page.url();
    console.log(`[${ts()}] 提交后 URL = ${afterUrl}`);

    // 看 list
    await page.goto(
      `https://github.com/${OWNER}/${REPO}/settings/secrets/actions`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForTimeout(2500);

    const secretsList = await page.evaluate(() => {
      const items = Array.from(
        document.querySelectorAll(
          '[class*="ActionListItem"], [data-testid*="secret"], li',
        ),
      );
      return items
        .map((li) => li.textContent || "")
        .filter((t) => /[A-Z][A-Z0-9_]{2,}/.test(t))
        .map((t) => t.trim().slice(0, 100));
    });
    console.log(`[${ts()}] 已存 secrets (snippets):`);
    secretsList.slice(0, 30).forEach((s) => console.log(`    ${s}`));

    const found = secretsList.some((s) => s.includes(name));
    if (found) {
      console.log(`[${ts()}] ✓ secret ${name} 已设置`);
      result = { ok: true, name };
    } else {
      const shot = path.join(HD_DIR, `secret_not_found_${Date.now()}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      console.log(
        `[${ts()}] ⚠ list 中未直接找到 ${name}, 但可能成功了 · 截图=${shot}`,
      );
      result = {
        ok: false,
        name,
        screenshot: shot,
        list: secretsList.slice(0, 30),
      };
    }
  } catch (e) {
    console.error(`[${ts()}] 出错: ${e.message}`);
    result = { ok: false, error: e.message };
  } finally {
    await ctx.close();
  }

  return result;
}

async function main() {
  let name = DEFAULT_SECRET_NAME;
  let value = DEFAULT_SECRET_VALUE;
  let listOnly = false;

  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--list" || a === "list") listOnly = true;
    else if (i === 2) name = a;
    else if (i === 3) value = a;
  }

  const headless = process.env.HEADLESS === "1";

  if (listOnly) {
    // TODO: list-only mode
    console.log("list-only mode 待实现");
    return;
  }

  const r = await setSecret(name, value, { headless });
  console.log("\n══ 结果 ══");
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}

if (require.main === module) main();
module.exports = { setSecret, totp };
