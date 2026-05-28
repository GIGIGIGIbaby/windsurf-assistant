# `_hdougle_测试` · 道独立体闭环工具链

> 「执大象，天下往」「无有入于无间」「弱之胜强 · 以其无以易之也」

本目录是 **印271 道独立体** 的实证工具链——
脱离 zhouyoukang / zroliu 主账号，仅以独立 GitHub 账号 `hdougle` 走完
**登录 → PAT → 推送 → secret → workflow → tunnel → API 验证** 全链路。

---

## 一、前置准备

### 1.1 创建凭证文件

```bash
mkdir -p ~/.dao/hdougle
cat > ~/.dao/hdougle/creds.json <<'EOF'
{
  "user": "hdougle",
  "pass": "YOUR_PASSWORD",
  "totp_secret": "YOUR_BASE32_TOTP_SECRET"
}
EOF
chmod 600 ~/.dao/hdougle/creds.json
```

`creds.json` 永不入 git（已在 `.gitignore`）。

### 1.2 网络代理（中国大陆必须）

```bash
# 默认假定 :7890 (Clash for Windows 默认)
# 改:  $env:DAO_PROXY_URL = "http://127.0.0.1:8080"
```

---

## 二、工具链顺序

| 步 | 脚本 | 职责 |
|---|---|---|
| 1 | `dao_hdougle_login.js` | Playwright 自动登录 + PAT 创建 |
| 2 | `verify_pat.js` | 验 PAT 是否生效 (TLS over CONNECT) |
| 3 | `gh_curl.js` | GitHub API 包装器 (curl + retry) |
| 4 | `dao_hd_push2.js` | 推 dao-boot.yml + dao_proxy.js |
| 5 | `dao_hd_set_secret.js NAME VALUE` | Web UI 设 GitHub secret |
| 6 | `dao_hd_dispatch.js` | 触发 workflow + 轮询 setup |
| 7 | `dao_hd_wait_tunnel.js` | 抓 Cloudflare tunnel URL |
| 8 | `dao_hd_verify.js [TUNNEL_URL]` | 全链路验 /health · /v1/models · /v1/chat/completions |

---

## 三、一键流程

```bash
cd 130-道独立体_Standalone/05-GitHub/_hdougle_测试

# 1. 登录 + PAT
node dao_hdougle_login.js

# 2. 推工作流
node dao_hd_push2.js

# 3. 设两个 secret
node dao_hd_set_secret.js ACCOUNTS    "email1:pass1,email2:pass2"
node dao_hd_set_secret.js DAO_GH_PAT  "$(cat ~/.dao/hdougle/token)"

# 4. 触发 dao-boot
node dao_hd_dispatch.js

# 5. 等 tunnel
node dao_hd_wait_tunnel.js

# 6. 验全链路
node dao_hd_verify.js https://your-tunnel.trycloudflare.com
```

---

## 四、关键技术 (踩过的坑)

### 关一 · Windows curl SCHANNEL SSL handshake

```bash
curl: (35) schannel: failed to receive handshake, SSL/TLS connection failed
```

**解**: `gh_curl.js` 内置:
- `--ssl-no-revoke` (关吊销列表查询)
- `--http1.1` (避 H2 协商抖动)
- 6 次指数退避重试 (1s → 1.6s → ... → 10.5s)

### 关二 · GitHub Actions YAML permissions

```yaml
permissions:
  secrets: write     # ✗ 不是合法值, 会 422
```

**解**: `permissions` 只支持
`actions / checks / contents / deployments / discussions / id-token / issues
/ models / packages / pages / pull-requests / security-events / statuses`

操作 secrets 通过 PAT 调 API，不需 permissions 配置。

### 关三 · 默认 GITHUB_TOKEN 无 gist scope

dao_proxy.js setup 阶段 gistCreate 403。

**解**: 设 `DAO_GH_PAT` secret = 含 gist scope 的 PAT，yml 改:

```yaml
GITHUB_TOKEN: ${{ secrets.DAO_GH_PAT || secrets.GITHUB_TOKEN }}
```

### 关四 · Playwright 已登录 profile 复用

GitHub 设 secret 涉及 sudo 二次确认，纯 API 不够。
**解**: 复用 `dao_hdougle_login.js` 留下的 `~/.dao/hdougle/browser_profile`
直接 navigate 到 `/secrets/actions/new` → 填表 → 提交。

---

## 五、闭环铭言

1. **TOTP 不必传应用** — 知 base32 密钥即本地 HMAC-SHA1 算码 (counter = floor(now/30))。
2. **Playwright profile 是终极凭证** — 一次登录万次复用。
3. **GitHub default token 不是 PAT** — 凡涉 gist / 跨仓库 / 用户信息皆需 PAT。
4. **schannel 弱于 OpenSSL** — Windows curl 多请求时退避重试是必需。
5. **502 with trace_id ≠ 链路坏** — 是上游真实响应，按 trace_id 类型分辨。
6. **`secrets:write` 非合法 permissions** — 真要操作 secrets 用 PAT 调 API。

---

## 六、相关文档

- `060-修复_Repair/SEAL_印271_道独立体_hdougle第三方账号全自动反代闭环.md` · 全过程实证档案
- `130-道独立体_Standalone/05-GitHub/README.md` · GitHub Actions 反代总览
- `130-道独立体_Standalone/05-GitHub/dao_proxy.js` · 核心反代代理逻辑
- `130-道独立体_Standalone/05-GitHub/workflows/dao-boot.yml` · 一键启动工作流

---

> 道恒无名。朴唯小，而天下弗敢臣。

— 道法自然 · 印271 之器
