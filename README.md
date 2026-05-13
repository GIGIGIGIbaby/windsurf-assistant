# Windsurf Assistant

> 道生一 · 一生二 · 二生三 · 三生万物
> 反者道之动 · 弱者道之用 · 天下之物生于有 · 有生于无

A fully decentralized Windsurf assistant &mdash; **一气化三清 · 道并行而不悖** &mdash; now with **一账号双路** (印 88).

## 印 88.1 · 双 key 自动载 · 圣人执一 · 以为天下牧

> 帛书·廿二: 「圣人执一 · 以为天下牧 · 不自视故明 · 不自见故章.」

承印 88 之骨 · 立印 88.1 之纹 &mdash; **同一 fleet_vm_unit 自动从 `~/.dao/accounts.json` 双载 A/B 两型 key**:

| 角 | key 型 | 用 | 自动从何取 |
|---|---|---|---|
| **A 路** (`_A_KEY` / `CODEIUM_API_KEY`) | `sk-ws-01-*` | `cloud_engine` 调 `server.codeium.com` Connect-RPC | active 帐若 type=sk-ws · 否则 fallback 第一个 type=sk-ws 帐 |
| **B 路** (`DEVIN_API_KEY`) | `devin-session-token$JWT` | `devin_cloud_engine` 调 `wss://app.devin.ai` ACP | active 帐若 type=devin · 否则 fallback 第一个 type=devin 帐 |
| **主 key** (`RESOLVED_API_KEY`) | 任型 | 兼容旧 `/quota` `/stats` | active 帐 · 或 `--api-key` 显传 |

启动 banner 显双 key 真态:

```text
  API Key  : sk-ws-01-YpSJ6...sy-YlQ (主 · 源=accounts.json[active=optimal-sk-ws@dao.local])
  A key    : sk-ws-01-YpSJ6...sy-YlQ (sk-ws)
  B key    : devin-session-...bn-5Ko (devin-session-token$)
```

`/health.dualPath` 升级 (印 88.1):

```json
{
  "pathA": { "ready": true, "keyType": "sk-ws", "keyPreview": "sk-ws-01-YpSJ6...sy-YlQ" },
  "pathB": { "ready": true, "keyType": "devin-session-token$", "keyPreview": "devin-session-...bn-5Ko" },
  "keysSource": "accounts.json[active=optimal-sk-ws@dao.local]"
}
```

**真验** (本机 unit 起 · 主 key=sk-ws · B 路调 wss):
- B 路 `POST /dc/v1/chat/completions` → 19.1s · `finish=end_turn` · `content="道"` · 自动选 devin key 入 wss
- SP `mode=dao` 真生效 · `/sp/observe` 显 `sysAfter=7238 字` (TAO_HEADER + 帛书 7204) · `silkInjected=True`

## 印 88 · 一账号双路 · 物无非彼物无非是 (整合 Devin 云原生)

> 庄子·齐物论: 「物无非彼，物无非是；自彼则不见，自是则知之.」
> 帛书·四十二: 「道生一 · 一生二 · 二生三 · 三生万物.」

承印 87 终贺报 (`Devin云原生/PC端/本源/_findings/17_印87本脉_彻打通_公网无感_终贺报.md`),
立印 88 之骨 &mdash; **同一 Windsurf 账号同时走两条反代路, 借 Devin Cloud D 桶绕 Windsurf weekly cap**:

| 路 | endpoint | 引擎 | 目标 | 用 | 限额桶 |
|---|---|---|---|---|---|
| **A 路** | `/v1/chat/completions` | `cloud_engine.js` (旧 · 不动) | `server.codeium.com` Connect-RPC | OpenAI 兼容 &middot; 大众客户端 | W (weekly) |
| **B 路** | `/dc/v1/chat/completions` | `devin_cloud_engine.js` (新 · 印 88) | `wss://app.devin.ai/api/acp/live` ACP | Devin Agent 当裸 LLM &middot; opus/sonnet | **D (daily)** |
| **SP** | `/sp/{mode,custom,opts,silk,observe,state}` | `sp_handler.js` (新 · 印 88) | `~/.dao/sp_state.json` | 3 模式: passthrough &middot; **dao (帛书《老子》全文 7204 字)** &middot; custom | &mdash; |

**核心实现** (4 新件 + 2 改件 · 0 npm deps · 0 破坏):

```text
packages/dao-core/
├── cloud_engine.js              (旧 · 不动 · A 路引擎)
├── devin_cloud_engine.js        (★新 · 23K · B 路 wss 引擎 · 与 cloud_engine 同签名)
├── sp_handler.js                (★新 · 24K · SP 3 模式 + 32 SIDE_CHANNEL strip)
├── silk/
│   ├── _silk_dao.txt            (★新 · 9K  · 帛书《老子》道经)
│   └── _silk_de.txt             (★新 · 11K · 帛书《老子》德经)
├── fleet_vm_unit.js             (★改 · +494 -11 · 加 /dc/v1/* + /sp/* + dualPath /health)
└── ...

web/
├── index.html                   (不动 · 已有三栏)
└── dao_app.js                   (★改 · +121 -28 · 模型双路 optgroup + 智能分流 + SP 真同步)

tests/
└── _seal88_smoke.cjs            (★新 · 68 验项 · 守门)
```

**前端无感双路** (web/index.html 三栏不变 · 右栏模型选自动分流):

```
用户在右栏选模型:
  claude-sonnet-4-20250514  ─→  POST /v1/chat/completions   (A 路 · cloud_engine)
  gpt-4o                    ─→  POST /v1/chat/completions   (A 路 · cloud_engine)
  ...
  devin-cloud-claude        ─→  POST /dc/v1/chat/completions (B 路 · devin_cloud_engine)
  devin-cloud-gpt           ─→  POST /dc/v1/chat/completions (B 路 · devin_cloud_engine)
  devin-cloud-agent         ─→  POST /dc/v1/chat/completions (B 路 · devin_cloud_engine)
```

左栏 SP 三模钮 (passthrough / dao / custom) 改即 `POST /sp/mode` 推 VM &mdash; 三者合一 &middot; web 为外 &middot; VM 为内. `测试连接` 钮显双路 `A✓ B✓` &middot; SP mode &middot; silk 字数实态.

**B 路需 `devin-session-token$` 型 apiKey** (Pro Trial · ~/.wam/wam-state.json v2.7.0).
A 路兼容 `sk-ws-01-*` 与 `devin-session-token$` 两型. 一帐两钥同存即两路同跑.

**守门** (`tests/_seal88_smoke.cjs` · 68 验项 · 0 deps · ~425ms):
A: 4 新件存在 + 大小 + syntax 8 项 &middot;
B: devin_cloud_engine 导出 + _buildWssUrl/_messagesToPrompt 单测 12 项 &middot;
C: sp_handler 导出 + 帛书 7204 字 + getState/applyToMessages 16 项 &middot;
D: fleet_vm_unit dual-path 锚 (lazy require + /dc/v1 + /sp + dualPath + X-Dao-Engine + 印 88) 17 项 &middot;
E: web/dao_app.js 双路 UI (modelsByPath + pathPrefix + syncSpToVm + optgroup) 12 项 &middot;
F: README 印 88 印记 1 项.

**全套测试** (`node tests/run_all.cjs` · 9 件 · ~17s): _web_static_audit ✓ &middot; _dao_core_syntax ✓ &middot; _three_pure_smoke ✓ &middot; _seal67_smoke ✓ &middot; _seal69_smoke ✓ &middot; _auth_smoke ✓ &middot; _seal64_smoke ✓ &middot; _seal66_smoke ✓ &middot; **_seal88_smoke ✓ 68/68**.

道义守 (承印 87 之八边):
不偷 token (仅本机本用户 ~/.wam/wam-state.json v2.7.0) &middot;
走官 wss `app.devin.ai/api/acp/live` 真协议 &middot;
不污 telemetry &middot; 不超 ACU &middot; 不修 Windsurf 二进制 &middot; 不绕审计.

---



## 一气化三清 · Three Pure

| 清 | What it is | Where it lives | Who it serves |
|---|---|---|---|
| **反代 API** &middot; [`packages/dao-core/`](packages/dao-core/) | Cloud reverse-proxy &middot; OpenAI-compatible `/v1` &middot; SSE streaming &middot; 0 npm deps | Your own VM (Devin Cloud / VPS / RPi / anywhere) | **Any OpenAI client** (LobeChat, OpenWebUI, NextChat, Cherry Studio, Continue.dev, Aider, `openai` SDK, Cursor "OpenAI override", …) |
| **切号 WAM** &middot; [`packages/wam/`](packages/wam/) | Account-rotation Windsurf extension &middot; 60s strong-lock &middot; quota-aware switch &middot; 236/0 regression-tested | Inside your Windsurf IDE | **Windsurf IDE users with multiple accounts** &mdash; auto-rotate when one runs out |
| **提示词反代 dao-proxy-min** &middot; [`packages/dao-proxy-min/`](packages/dao-proxy-min/) | Cascade Connect-RPC reverse-proxy &middot; injects 《老子》(Mawangdui silk text) as system prompt &middot; tool-root preserved (`<additional_metadata>` kept) | Inside your Windsurf IDE Cascade panel | **Windsurf IDE users who want a custom system prompt** without losing the @-tool ecosystem |

The three are **orthogonal** &mdash; any subset can run alone, all three can run together with zero conflict. Pick by scenario:

| Scenario | Stack |
|---|---|
| Use Windsurf models in *any other client* (web, terminal, your own app) | **反代 API** alone |
| Use Windsurf IDE *daily* and run out of quota on one account | **切号 WAM** alone |
| Use Windsurf IDE and want *Cascade with a custom system prompt* | **提示词反代** alone |
| Power-user &mdash; all three IDE-side + cloud-side workflows | **All three** together |

```text
                       一气化三清 · 道并行而不悖
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
   反代 API                 切号 WAM             提示词反代 dao-proxy-min
   (dao-core)               (wam)                 (dao-proxy-min)
        │                        │                        │
   user's VM                user's IDE               user's IDE
   (Devin Cloud)            (Windsurf)               (Windsurf Cascade)
        │                        │                        │
        ▼                        ▼                        ▼
   OpenAI /v1            account rotation         帛书 SP injection
   any client          (60s lock · quota-aware)   (tool-root preserved)
        │                        │                        │
        └────────────────────────┴────────────────────────┘
                                 ▼
                        Windsurf Cloud
                    inference.codeium.com
```

---

## 0 &middot; 公网入口 · 道独立体 (印 67/69)

> 帛书·四十八: 「为学者日益 &middot; 闻道者日损 &middot; 损之又损 &middot; 以至于无为 &middot; 无为而无不为」
> 帛书·六十四: 「慎终若始 &middot; 则无败事」 &mdash; 印 69 公网用户视角全审, 修四症一并治本.
> 帛书·三十四: 「道氾呵其可左右也 &middot; 万物归焉而弗为主」 &mdash; 上游 setup 一次, 之后无为.

### 印 69 · 首启 Pages (zhouyoukang · 一次 30s · 上游 owner only)

`enablement: true` 需 PAT 而非 `GITHUB_TOKEN` (GitHub 硬规, `actions/configure-pages`
[文档](https://github.com/actions/configure-pages#inputs)明示). 故上游 zhouyoukang
需一次性手动启 Pages, 之后 push 即自动 deploy. 用户 fork 路径完全独立 (走
`dao_github_sync.js` 之 `ensurePages()` 自启 branch source, 无须任何手动操作).

**zhouyoukang one-time setup**:

1. 开 [`https://github.com/zhouyoukang/windsurf-assistant/settings/pages`](https://github.com/zhouyoukang/windsurf-assistant/settings/pages)
2. **Source**: 选 `GitHub Actions` &rarr; **Save**
3. 之后任何对 `web/**` 或 `.github/workflows/deploy-pages.yml` 的 push 自动 deploy
4. 验: 访 `https://zhouyoukang.github.io/windsurf-assistant/` 应返 GATE 页

(用户 fork 不需 setup &mdash; `dao_github_sync.js` 用用户自己的 PAT 调 GitHub API
启他们 fork 的 Pages, source: `main:/web` &mdash; 全自动 · 道法自然.)

---

**One PAT. Zero servers. Zero relay.** Visit the public entry, paste a GitHub
fine-grained PAT *once*, and the page auto-forks the repo, enables Pages on
your fork, creates a private Gist as your data cloud, and redirects you to
**your own** `<you>.github.io/windsurf-assistant/` &mdash; where every byte
(VM URL, accounts, SP presets, chat history) lives in *your* GitHub. The
upstream owner sees **nothing**.

```
   https://zhouyoukang.github.io/windsurf-assistant/    (公网入口 · gate)
              │
              │  ① paste PAT (一次"为")
              ▼
   GitHub API · 自动:
     • fork zhouyoukang/windsurf-assistant → <you>/windsurf-assistant
     • POST /pages   (source: main:/web · Pages enabled)
     • POST /gists   (private "dao.json" · 你的数据云)
              │
              │  ② redirect (5s 倒计时)
              ▼
   https://<you>.github.io/windsurf-assistant/         (专属页 · mine)
   ┌──────────────┬──────────────────┬──────────────┐
   │  左 · API+SP │  中 · WAM 切号    │  右 · 对话    │
   │  VM URL      │  + Windsurf 账号 │  Cascade-like │
   │  Auth Key    │  · quota probe   │  SSE 流       │
   │  SP 三模     │  · rotate active │  历史 + 模型  │
   │  Devin 令    │  · ★ active 切   │  · stop 中止  │
   └──────────────┴──────────────────┴──────────────┘
              │
              │  ③ 起 Devin VM (一键命令复制 · 粘 Devin Chat)
              ▼
   Your Devin VM (`fleet_vm_unit.js` + cloudflared)
              │
              ▼
   Windsurf Cloud · inference.codeium.com
```

**Three "为" total** (粘 PAT · 粘 Devin 命令 · 粘 VM URL), 之后皆 "无为".
每个用户在自己的 fork 下部署相同代码 &mdash; 同源不同身, **道法自然 · 各正性命**.

### 隐私 · Trust model

| 字节 | 在哪 | 谁看见 |
|---|---|---|
| GitHub PAT | 你浏览器 `localStorage` | 你 (退出按钮 = 清) |
| `dao.json` (VM URL · accounts · SP · 对话) | 你的私有 GitHub Gist | 你 + 你的 PAT 持有方 |
| Windsurf API key | 你浏览器 + 你 Devin VM | 你 |
| Public Pages 站 | 你的 GitHub Pages | 公开 (但仅静态代码 · 无数据) |

`zhouyoukang/windsurf-assistant` 上游收到的只有一次 GitHub `POST /forks`
(GitHub 服务器自身行为); 之后你的浏览器**永远不再连**上游 &mdash; 全部数据流
直进你自己的 GitHub + 你自己的 Devin VM. **原汤化原食 · 账号本身即一切**.

### 旁支 · legacy 5-tab

无 PAT 用户可走 `legacy.html` (5-tab Setup/Chat/API/Deploy/Docs &mdash; 印 66 末态),
功能等同, 仅缺 "自动 fork + 同步" 一层. 入口页右下角有链.

---

## I &middot; 反代 API (`packages/dao-core/`)

**One GitHub fork. One web page. One VM per account. Zero npm dependencies.**

Each user runs their own VM with their own account, their own IP, their own
fingerprint. The web UI lives on the user's own GitHub Pages. Browsers talk
directly to the VM &mdash; no relay server, no middleman, no central authority.

```
   ┌─────────────────────────────────────────────────────────────┐
   │  github.com/<your-user>/windsurf-assistant   (your fork)    │
   │   ├─ Pages    →  https://<your-user>.github.io/<repo>/      │
   │   ├─ Actions  →  auto-deploy on push                        │
   │   └─ Repo     →  source                                     │
   └────────────────────────┬────────────────────────────────────┘
                            │ visit
                            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  Browser (your device · all config in localStorage)         │
   │  └─ direct HTTPS, with Authorization: Bearer sk-ws-proxy-*  │
   └────────────────────────┬────────────────────────────────────┘
                            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  fleet_vm_unit.js (Devin Cloud / VPS / EC2 / Pi / anywhere) │
   │  ├─ Node.js zero-dep proxy (5 .js files, builtins only)     │
   │  ├─ OpenAI /v1 compatible · SSE streaming                   │
   │  └─ cloudflared tunnel → public HTTPS URL                   │
   └────────────────────────┬────────────────────────────────────┘
                            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  Windsurf Cloud · inference.codeium.com                     │
   └─────────────────────────────────────────────────────────────┘
```

---

## Three Steps to Self-Host

### 1. Fork & enable Pages

1. **Fork** this repo to your GitHub account.
2. Go to your fork → **Settings → Pages → Source: GitHub Actions**.
   The included `deploy-pages.yml` workflow auto-deploys on every push to `web/`.
3. Push any change (or just wait — initial fork triggers the action).
4. Visit **`https://<your-username>.github.io/windsurf-assistant/`**.

The web UI auto-detects your fork's owner/repo from `location.hostname` and
`location.pathname`. No hardcoded names anywhere &mdash; soft-coded, "适配一切".

### 2. Provision a VM & deploy the unit

On any machine with `curl` + `git` + `node >= 18` (Devin Cloud workspace,
EC2, RPi, your laptop, anywhere):

```bash
curl -sL https://raw.githubusercontent.com/<your-user>/windsurf-assistant/main/scripts/devin-bootstrap.sh | \
  DAO_API_KEY="sk-ws-01-YOUR_WINDSURF_KEY" \
  DAO_AUTH_KEY="sk-ws-proxy-RANDOM_LONG_SECRET" \
  DAO_TUNNEL=yes \
  bash
```

The script installs Node.js if missing, clones your fork, writes
`~/.dao/accounts.json`, starts a `cloudflared` tunnel, and launches
`fleet_vm_unit.js` with your auth-key.

The last lines of the bootstrap log will look like:

```
══════════════════════════════════════════════════════════════
  REVERSE-PROXY READY · 反者道之动
══════════════════════════════════════════════════════════════
  Public URL : https://hippopotamus-XXXX.trycloudflare.com
  Local URL  : http://localhost:7862
  Auth Key   : sk-ws-proxy-RANDOM_LONG_SECRET
  OpenAI cli : base_url=https://hippopotamus-XXXX.trycloudflare.com/v1  api_key=sk-ws-proxy-RANDOM_LONG_SECRET
══════════════════════════════════════════════════════════════
```

> **Even simpler &mdash; let the web UI do it for you**:
> Open the Deploy tab in your hosted page. It generates a Devin task with
> your account + a freshly-generated `sk-ws-proxy-*` already embedded.
> Paste the task into Devin Chat and Devin executes & reports the URL back.

### 3. Plug the credentials into anything OpenAI-compatible

Open the **API tab** in your web page. It shows:

```
Base URL : https://hippopotamus-XXXX.trycloudflare.com/v1
API Key  : sk-ws-proxy-RANDOM_LONG_SECRET
Models   : 54 models
```

Drop those into ChatGPT clients (LobeChat, OpenWebUI, NextChat, Cherry Studio,
…), `openai` Python/JS SDK, Continue.dev, Aider, Cursor's "OpenAI override",
anything that speaks OpenAI &mdash; instant Windsurf access.

### 3.5. Even simpler &mdash; one-click API key from email + password (印 64)

No Windsurf API key on hand? The Setup tab has a **"Windsurf 账号底层 · 一键取 sk-*"**
card. Enter your Windsurf email + password &mdash; the VM walks the four-step
auth chain (`login → postauth → register → status`) on your behalf and the
web page auto-fills `cfg-apikey` with a fresh `sk-ws-*`.

Requires the VM to be started with `--allow-auth` (or `DAO_ALLOW_AUTH=1`),
off by default for safety. The password leaves your browser only to your
own VM; it is **never persisted** unless you explicitly tick "Remember password".

---

## II &middot; 切号 WAM (`packages/wam/`)

> *天下莫柔弱于水, 而攻坚强者莫之能胜也, 以其无以易之也.* &mdash; 帛书《老子》七十八

**Windsurf IDE extension for account rotation.** When you have multiple Windsurf accounts and one runs out of quota, WAM auto-switches in the background &mdash; 60-second strong-lock prevents thrashing, quota-aware switch picks the freshest account, full 236/0 regression suite locks behavior.

### Install &middot; WAM

```powershell
git clone https://github.com/zhouyoukang/windsurf-assistant.git
cd windsurf-assistant/packages/wam

cp _dao_env.local.psd1.example _dao_env.local.psd1   # fill in your targets
cp 账号库.example.md 账号库最新.md                   # fill in your real accounts (.gitignore guards)

.\_dao_deploy.ps1                                     # source-direct deploy (一令两机)
# Ctrl+Shift+P → Developer: Reload Window
```

Full docs: [`packages/wam/README.md`](packages/wam/README.md) (软编码归一七量 &middot; 13 test suites &middot; 三守俱全 60s strong-lock).

**Independence**: WAM is a pure VS Code extension. It does **not** need the
VM, the web UI, or any of dao-core. The three pure are orthogonal &mdash;
you can run WAM alone, or WAM + dao-core, or all three together.

---

## III &middot; 提示词反代 dao-proxy-min (`packages/dao-proxy-min/`)

> *昔之得一者: 天得一以清 &middot; 地得一以宁 &middot; 侯王得一以为天下正.* &mdash; 帛书《老子》三十九

**Cascade Connect-RPC reverse-proxy as a Windsurf extension.** Injects the Mawangdui silk-text 《老子》 as the system prompt while preserving the entire `@`-tool ecosystem (`<additional_metadata>` kept intact, so `trajectory_search`, `read_file`, `view_content_chunk` etc. all keep working). 中性化 identity anchor via SECTION_OVERRIDE. Covers all three RPC tiers. Per-user port isolation. One-key clean uninstall.

### Install &middot; dao-proxy-min

Build the vsix from source (`packages/dao-proxy-min/_build_vsix.ps1`), then:

```powershell
# 1. Build (one-time · from source · zero npm deps · uses extension.js + vendor/)
cd packages/dao-proxy-min
.\_build_vsix.ps1            # produces  dao-proxy-min-9.8.0.vsix

# 2. Install into Windsurf
windsurf --install-extension dao-proxy-min-9.8.0.vsix
```

Full docs: [`packages/dao-proxy-min/README.md`](packages/dao-proxy-min/README.md) (v9.8.0 守一不离 &middot; @-tool root preserved &middot; 三档 RPC 全覆盖 &middot; SSE 实时推送).

**Independence**: dao-proxy-min is a pure VS Code extension. It does **not** need the VM, the web UI, dao-core, or wam. It can coexist with wam in the same IDE without conflict (different concerns: WAM rotates accounts, dao-proxy-min rewrites prompts).

---

## Repository Layout

| Path | Purpose |
|------|---------|
| [`web/index.html`](web/index.html) | The single-page web UI &mdash; 5 tabs (Setup · Chat · API · Deploy · Docs). No build, no npm, no CDN. |
| [`packages/dao-core/`](packages/dao-core/) | The cloud reverse-proxy &mdash; 5 `.js` files, Node.js builtins only, no `package-lock.json`. |
| [`scripts/devin-bootstrap.sh`](scripts/devin-bootstrap.sh) | One-line VM bootstrap &mdash; installs Node, clones, writes config, launches unit + tunnel. |
| [`tests/`](tests/) | Self-contained Node test suite &mdash; 145 assertions, 0 deps, runs in ~3s. |
| [`.github/workflows/`](.github/workflows/) | `deploy-pages.yml` (Pages on `web/**`) + `test-core.yml` (test on every PR). |
| [`packages/wam/`](packages/wam/) | **二清 &middot; 切号 WAM** &mdash; Windsurf IDE extension for account rotation &middot; 60s strong-lock &middot; 236/0 regression-tested. See [II &middot; 切号 WAM](#ii--%E5%88%87%E5%8F%B7-wam-packageswam). |
| [`packages/dao-proxy-min/`](packages/dao-proxy-min/) | **三清 &middot; 提示词反代** &mdash; Cascade Connect-RPC reverse-proxy with custom system-prompt injection &middot; @-tool root preserved. See [III &middot; 提示词反代](#iii--%E6%8F%90%E7%A4%BA%E8%AF%8D%E5%8F%8D%E4%BB%A3-dao-proxy-min-packagesdao-proxy-min). |

The three pure live in `packages/`, can be installed independently, and
combine freely. The web UI in `web/` is the unified front-end for the
first pure (反代 API); the other two are IDE-side and need no front-end.

### Devin VM resource utilisation (取之尽锱铢)

Each Windsurf account = one dedicated VM. Browsers talk **directly** to
your VM (no relay, no middleman). For users with multiple accounts the
repo ships **two bootstrap modes**:

* `scripts/devin-bootstrap.sh` &mdash; *single-account / single-VM* (one VM
  runs one `fleet_vm_unit.js` for one account). Devin Cloud workspace
  uptime is dedicated to that one account.
* `scripts/devin-bootstrap-fleet.sh` &mdash; *multi-account / single-VM* (one
  VM runs N `fleet_vm_unit.js` instances on N ports, all behind one
  `cloudflared` tunnel, coordinated by `fleet_controller.js`). Use this
  when one Devin VM has spare capacity and you want to maximise resource
  yield without paying for N VMs.

Both modes register with the same web UI and the same OpenAI `/v1`
surface; the only difference is whether N accounts share one box.

---

## API Endpoints (`fleet_vm_unit.js`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/v1/chat/completions` | gated | OpenAI-compatible chat &middot; SSE streaming with 15s heartbeat (印 64) |
| `GET`  | `/v1/models`           | gated | Model list (54+ models) |
| `GET`  | `/quota`               | gated | Real-time daily/weekly quota |
| `GET`  | `/stats`               | gated | Latency p50/p95/p99 over 1m/10m/1h windows (印 64) |
| `GET`  | `/health`              | public | Health, uptime, `authRequired`, `authAllowed`, `sseActive`, `draining` |
| `GET`  | `/fleet/info`          | public | Unit metadata for fleet discovery |
| `POST` | `/auth/login`          | gated + `--allow-auth` | Step 1 &middot; email + password → auth1 token (印 64) |
| `POST` | `/auth/postauth`       | gated + `--allow-auth` | Step 2 &middot; auth1 → sessionToken (印 64) |
| `POST` | `/auth/register`       | gated + `--allow-auth` | Step 3 &middot; sessionToken → `sk-ws-*` (印 64) |
| `POST` | `/auth/status`         | gated + `--allow-auth` | Step 4 &middot; `sk-ws-*` → quota (印 64) |
| `POST` | `/auth/auto`           | gated + `--allow-auth` | All four steps in one call (印 64) |

**Auth**: when `--auth-key` (or `DAO_AUTH_KEY`) is set, `/v1/*` and `/quota`
require `Authorization: Bearer <key>`. Multiple keys can be passed
comma-separated. `/health` and `/fleet/info` always stay public so probes /
load-balancers can monitor without secrets. When `DAO_AUTH_KEY` is empty,
the unit runs in *open mode* (local dev only &mdash; never expose to the
public Internet).

Three header forms are accepted:

```
Authorization: Bearer sk-ws-proxy-XXX     # standard
X-Api-Key: sk-ws-proxy-XXX                # for clients that strip Auth
?api_key=sk-ws-proxy-XXX                  # last resort, query string
```

---

## Zero Dependencies

* **`packages/dao-core/`**: no `dependencies` in `package.json`, no
  `node_modules`, no `package-lock.json`. Only Node.js builtins
  (`http`, `https`, `crypto`, `fs`, `path`, `os`, `dns`, `child_process`).
  CI enforces this on every push.
* **`web/index.html`**: single file, no `<script src="…"`, no
  `<link href="…stylesheet"`, no `@import`, no Google Fonts, no
  jsdelivr/unpkg/cdnjs/ajax.googleapis. Static-audit test verifies this.
* **`scripts/devin-bootstrap.sh`**: pure bash + curl. No package manager
  beyond the system one (apt/yum/apk) for installing Node.js if missing.
* **`tunnel`**: `cloudflared` is one optional binary. Free Tier, no signup.

---

## Testing

```bash
node tests/run_all.cjs
```

Runs three independent suites in fresh sub-processes:

| Suite | Asserts | Time | What it checks |
|-------|---------|------|----------------|
| `_web_static_audit.cjs`  | 72  | ~70ms   | 5 tabs, key DOM ids, soft-coded repo, zero CDN, OpenAI examples present |
| `_dao_core_syntax.cjs`   | 47  | ~600ms  | 5 files parse, all expected exports present, fleet_controller logic, zero deps |
| `_auth_smoke.cjs`        | 26  | ~2.3s   | Spawns `fleet_vm_unit`, validates `--auth-key` gate, CORS preflight, multi-header forms, open-mode fallback |
| `_seal64_smoke.cjs`      | 79  | ~2.6s   | `windsurf_auth.js` exports + `parsePlanStatusJson`, `--allow-auth` flag, `/stats` 3-window structure, `/auth/*` 5 routes (incl. live `windsurf.com` step=login round-trip) |
| **Total** | **224** | **~5.5s** | All on Node.js builtins, no real Windsurf account needed (login test uses fake creds and asserts auth_chain_error step=login) |

CI runs the full suite on every PR against `packages/`, `web/`, `tests/`,
or `scripts/`.

---

## Architecture Principles

* **去中心化** &mdash; no central server. Browser ↔ your VM, direct.
* **零依赖** &mdash; everything runs on bare Node.js + bash + curl.
* **软编码** &mdash; URLs, owners, repos, ports, keys all configurable;
  the page auto-detects from `location.*` so a fresh fork "just works".
* **守门有度** &mdash; `/health` and `/fleet/info` are intentionally public
  so probes work without secrets; `/v1/*` `/quota` `/stats` are gated.
  `/auth/*` carries an extra `--allow-auth` flag (default off) on top of
  the auth-key check, because it accepts user passwords.
* **向后兼容** &mdash; running without `--auth-key` is allowed for local dev
  (open mode); production deployments should always set one.
* **道法自然** &mdash; the upstream-default soft-codes default to
  `zhouyoukang/windsurf-assistant`, but every user's fork takes over its
  own identity automatically. *无为而无不为*.

---

## License

MIT (`web/`, `packages/dao-core/`, `scripts/`, `tests/`) &middot;
MIT (`packages/wam/`) &middot; Apache 2.0 (`packages/dao-proxy-min/`).

---

*反者道之动 &middot; 弱者道之用 &middot; 天下之物生于有 &middot; 有生于无*

*印 65 &middot; 一气化三清 &middot; 道并行而不悖*
