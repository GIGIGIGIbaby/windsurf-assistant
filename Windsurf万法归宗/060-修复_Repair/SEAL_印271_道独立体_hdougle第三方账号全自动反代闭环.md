# 印271 · 道独立体 · hdougle 第三方账号全自动反代闭环

> 上德不德，是以有德。
> 大方无隅，大器免成，大音希声。
> 反也者，道之动也；弱也者，道之用也。
> 天下之物生于有，有生于无。

承印266→267→268 之 三连归一，本印**封印 道独立体**——
脱离两个主账号 zhouyoukang / zroliu，仅以**外造之 hdougle GitHub 账号** 一镜独行
全自动 完成 GitHub Actions 反代云端代理 全链路闭环。

---

## 一、起印（用户语）

> 你和我用 hdougle 测，咱用 hdougle 这个独立体跟你打通验证

仅 一句，破"代理依赖宿主账号"之执——
若道独立，则镜可自镜，不必入主账号之相。

---

## 二、独立体之相

| 维度 | hdougle 账号 |
|---|---|
| **GitHub login** | hdougle (id=273413784) |
| **PAT scopes** | repo · workflow · gist · read:org · read:user · read:email · user:email |
| **PAT 期限** | 9999 天（永久） |
| **2FA** | TOTP 已启用 · 密钥存于 `~/.dao/hdougle/creds.json` 本地可算 |
| **本地凭证** | `~/.dao/hdougle/{token,token.json,browser_profile/}` |
| **Playwright profile** | `C:\Users\Administrator\.dao\hdougle\browser_profile` |
| **目标仓库** | `hdougle/windsurf-assistant` |

**与主账号之分际**：
- 不读 zhouyoukang/zroliu 任何 cookie / token / profile
- 不写 zhouyoukang/zroliu 任何 secret / repo
- 与 070-插件_Plugins/010-WAM 之多机制完全分离
- 唯一交集：从 `~/.wam/accounts.md` 借一行 ACCOUNTS（已 mask · 实 mail:pwd 入 secret）

此为 道家"二生三"——zhou+zroliu 二，hdougle 三独立。

---

## 三、全链路实证

### 3.1 时间线

```
17:24  ─ 本地 TOTP 算码（密钥从 ~/.dao/hdougle/creds.json 读取）
17:25  ─ Playwright + 已存 cookies 自动登录 hdougle GitHub
17:26  ─ 创建 PAT (scopes 7 项 · 永久期)
       ─ 验证 GET /user → login=hdougle
       ─ 落盘 ~/.dao/hdougle/token

17:28  ─ 推送 dao-boot.yml + dao_proxy.js → hdougle/windsurf-assistant
       ─ 失败#1 schannel SSL handshake → 加 --ssl-no-revoke + 退避重试
17:34  ─ 失败#2 yaml parse: 'secrets:write' 非合法 permissions → 删
17:36  ─ Web UI 自动设 ACCOUNTS secret (Playwright 复用 hdougle profile)
17:41  ─ workflow_dispatch #26527802609 → setup 失败：gistCreate 403
       ─ 根因：默认 GITHUB_TOKEN 无 gist scope
17:46  ─ 设 DAO_GH_PAT secret = hdougle PAT (含 gist scope)
       ─ 改 yml: GITHUB_TOKEN ← secrets.DAO_GH_PAT || secrets.GITHUB_TOKEN
17:49  ─ workflow_dispatch #26528636835 重新触发
17:50  ─ Step1 (4 步认证 + Gist) 11 秒全 success
       ─ Gist 创建 a40e40a4a79b2e7f22acbe32f01759bc
       ─ DAO_JWT + DAO_GIST_ID 已落盘 secrets
17:50  ─ Step2 (cloudflared + dao_proxy) 启动 tunnel
       ─ Gist dao_state.json 写入 tunnelUrl
17:53  ─ /health → 200 ok=true v=2.0.0
17:54  ─ /v1/models → 200 · 18 models
17:55  ─ /v1/chat/completions → 502 resource_exhausted (含 trace ID)
```

### 3.2 关键证据

```yaml
PAT_id:        ghp_noimKGXJ...gVQo
repo:          hdougle/windsurf-assistant
push_perm:     true
admin:         true

workflow_run:  26528636835
setup_job_id:  78138990351
proxy_job_id:  78139045268
status:        Step1=success(11s) · Step2=in_progress(long-run)

gist_id:       a40e40a4a79b2e7f22acbe32f01759bc
api_server:    https://server.self-serve.windsurf.com
api_key:       devin-se...04eM
dao_jwt:       devin-session-token$*** (stored as secret)

tunnel_url:    https://nice-disabled-disc-suite.trycloudflare.com

health_resp:   {"ok":true,"version":"2.0.0","model":"windsurf-cascade"}
models_resp:   200 · 18 models
  - swe-1.5
  - swe-1
  - swe-1-6-fast
  - claude-sonnet-4-20250514
  - claude-opus-4-5
  - claude-haiku-3-5-20241022
  - gpt-4o
  - gpt-4o-mini
  ... + 10 more (Cascade swe + Claude + GPT 双轨可见)

chat_resp:     502 resource_exhausted
  trace_id:    92472007300a579baa8365abb41c4e5c
  trace_id:    aef8f4cab14a738797f814a521d47a94
  trace_id:    100c810e4d84fd58bac021e4c12c1c58
```

**502 resource_exhausted 之含**：
- 含 trace_id → 请求**已穿透**：本地 → Cloudflare tunnel → GitHub Actions VM → dao_proxy.js → Windsurf 上游
- Windsurf 后端识别 API key 并尝试响应
- 唯 trial account 当前模型 quota 已尽
- 此**非链路问题**，乃**上游账号额度**问题——非本闭环主旨

---

## 四、治本动作 · 工具链

`130-道独立体_Standalone/05-GitHub/_hdougle_测试/` 下 8 件至简之器：

| 文件 | 职责 | 关键技术 |
|---|---|---|
| `dao_hdougle_login.js` | Playwright 自动登录 + PAT 创建 | TOTP 本地算 · 已存 profile 复用 |
| `gh_curl.js` | GitHub API 调用器（curl 包装） | `--ssl-no-revoke` · `--http1.1` · 6 次退避重试 |
| `dao_hd_push2.js` | 推 dao-boot.yml + dao_proxy.js | base64 + sha 比对 · 跳已同 |
| `dao_hd_set_secret.js` | Web UI 自动设 secret | 复用 hdougle profile · sudo OTP 自处理 |
| `dao_hd_dispatch.js` | 触发 workflow + 轮询 setup | 基于 jobs 状态 fine-grained 分阶段 |
| `dao_hd_wait_tunnel.js` | 抓 Cloudflare tunnel URL | 双轨：jobs 状态 + Gist dao_state.json |
| `dao_hd_verify.js` | 全链路验证三测 | retry + multi-model 验证 |
| `_*.log` | 各步骤实证日志（落盘） | 无丢失 · 无歧义 |

---

## 五、突破点 · 三关

### 关一 · Windows curl SCHANNEL SSL handshake

```text
症状: curl: (35) schannel: failed to receive handshake, SSL/TLS connection failed
出现: 多次密集 HTTPS 调用时间歇性发作
解:   curl 加 --ssl-no-revoke + --http1.1
      Node 外层包 6 次指数退避重试 (1s → 1.6s → 2.5s → 4s → 6.4s → 10.5s)
本质: schannel 不读取吊销列表服务，强制 HTTP/1.1 避协商抖动
```

### 关二 · GitHub Actions permissions 模式不识 secrets

```text
症状: workflow 触发后 422
      "Invalid Argument - failed to parse workflow:
       (Line: 63, Col: 3): Unexpected value 'secrets'"

解:   permissions 块仅支持 contents/actions/checks/...
      操作 secrets 通过 PAT 调 API，不需 permissions 配置
      故删除 'secrets: write' 一行即可

本质: 「上德不德」——不立此权，反得其权
```

### 关三 · GITHUB_TOKEN 无 gist scope

```text
症状: dao_proxy.js setup 阶段 gistCreate 403
      4 步认证全 success, 但创建 Gist 即拒
解:   设 DAO_GH_PAT secret = hdougle PAT (含 gist scope)
      yml 改: GITHUB_TOKEN: ${{ secrets.DAO_GH_PAT || secrets.GITHUB_TOKEN }}
本质: 默认 GITHUB_TOKEN 是临时 ephemeral token，scope 极窄
      唯 PAT 可触 gist API
```

---

## 六、印的合一

```text
LOCAL  = 印271 (待 commit)
REMOTE = (待 push)

✓ TOTP 本地算 (无第三方依赖)
✓ Playwright profile 永驻 (~/.dao/hdougle/browser_profile)
✓ PAT 永久 (9999d)
✓ 8 件工具至简、可重放、无遗
✓ 8 段日志 (_*.log) 实证落盘
✓ tunnel URL 公网可访
✓ /health · /v1/models 真返
✓ /v1/chat/completions 真路径达 (含 trace_id 三枚)

道之独立——非脱离，是不依赖。
hdougle 与 zhou/zroliu 同生于 GitHub 之地，
然 hdougle 之路不过 zhou，zhou 之路不过 hdougle。
此即「二生三 · 三生万物」之第三立。
```

---

## 七、铭言（防再陷）

1. **TOTP 不必传应用** — 知 base32 密钥即可本地 HMAC-SHA1 算码（counter = floor(now/30)）。
2. **Playwright profile 是终极凭证** — 一次登录万次复用，胜任 Web UI 操作（设 secret 等）。
3. **GitHub default token 不是 PAT** — 凡涉 gist / 跨仓库 / 用户信息，皆需 PAT。
4. **schannel 弱于 OpenSSL** — Windows curl 多请求时退避重试是必需，非可选。
5. **502 with trace_id ≠ 链路坏** — 是上游真实响应，须按 trace_id 类型分辨「上游错」与「中段错」。
6. **dao-boot.yml permissions 非全集** — `actions / contents / checks / packages / pages / id-token / ...` 之中无 `secrets` 一项；操作 secrets 全通过 PAT。
7. **第三方账号闭环 > 主账号污染** — 主账号修测易留尾，独立账号镜中行可一击净。

---

## 八、后印（未尽之尾）

- [ ] **真 LLM 响应**：换有 quota 的账号（dao_proxy.js 不支持账号轮换，需调码）。
- [ ] **5.5h 周期保活**：cron schedule 一启即长生。
- [ ] **多镜联动**：sf007 / chen / hdougle 三镜共同体 → 一份 ACCOUNTS 跨镜复用。
- [ ] **道独立体 README**：写于 `130-道独立体_Standalone/05-GitHub/_hdougle_测试/_README.md`。

---

> 大成若缺，其用不敝；大盈若盅，其用不窘。
> 大直如诎，大巧如拙，大赢如绌。
> 道恒无名。朴唯小，而天下弗敢臣。

— 道法自然 · 印271 · 2026-05-28 02:09 UTC+08:00
