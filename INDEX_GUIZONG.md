# 万法归宗 · 一文锚三身

> *道生一·一生二·二生三·三生万物.* —— 帛书《老子》四十二
>
> *为道日损·损之又损·以至于无为.* —— 四十八
>
> *道并行而不相悖.*
>
> **2026-05-13 · 印 93 · 一文尽全 · 一入即知何处用**
>
> **2026-05-14 · 印 95 · 真本源闭环 · 主公 PC 真可关机 · 一 GitHub 账号即一切**
>
> **2026-05-14 · 印 100 · 太极笙万物 · 一 PAT 即一切 · 闭环自举 · 民莫之令而自均焉**
>
> **2026-05-14 · 印 101 · 万法归宗 · 大道至简 · 用 + 管 · 反者道之动**
>
> **2026-05-16 · 印 115 · 反者道之动 · GH 面板综合管 · Devin VM 反代核心 · 鸡犬相闻 · 民至老死不相往来**

---

## 〇 · 此文之意

`windsurf-assistant` 立印 67 至印 92 · 历**一气化五清**之程 ·
功能已全 (反代 windsurf + devin · 提示词管理 · API 管理 · WAM 切号 · agent 交互测试) ·
唯欠**一文锚之** · 新入者一目即知何处入. 此文即一.

---

## 一 · 三身一道 (一图尽全)

```text
                    ┌─────────────────────────────┐
                    │   道 · 五合一 · 万法归宗     │
                    │  反代+提示词+切号+Agent      │
                    └────────────┬────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
  ┌───────────┐            ┌───────────┐            ┌───────────┐
  │ A · 公网  │            │ B · 本地  │            │ C · Devin │
  │ this repo │            │  自托管   │            │  云原生   │
  │  Pages    │            │ admin:7870│            │ :11445/6  │
  ├───────────┤            ├───────────┤            ├───────────┤
  │ 受众:     │            │ 受众:     │            │ 受众:     │
  │  公网用户 │            │ 开发者    │            │ 主公本机  │
  │ 形:       │            │ 形:       │            │ 形:       │
  │  gate→    │            │ 左API+SP /│            │ 五职中枢+ │
  │  onb→mine │            │ 中WAM /   │            │ 太上pilot │
  │  三态     │            │ 右chat    │            │           │
  └───────────┘            └───────────┘            └───────────┘
```

**一道**: 三身共**一组 fleet_vm_unit + cloud_engine + sp_handler + dao_accounts**.
**三身**: 因受众不同各立其面 · 并行不悖.

---

## 一·丁 · 印 115 · 反者道之动 · GH 面板综合管 · Devin VM 反代核心 (2026-05-16)

> 帛书·四十三:「**天下莫柔弱于水 · 而攻坚强者莫之能胜也 · 弱之胜强 · 柔之胜刚**」
> 帛书·八十: 「**邻邦相望 · 鸡狗之声相闻 · 民至老死不相往来**」

承印 100 (太极笙万物) + 印 101 (用 + 管) + 印 112 (mesh 闭环) · 立**反代核心彻底底移**:

```text
旧 (印 95-101): client → GH Pages → GH Actions runner(fleet_vm_unit + cf tunnel) → wss
新 (印 115):    client → GH Pages → Devin Cloud VM(dao_proxy /v1/* · 自带公网) → wss

             GH Actions runner 仅"接生婆": spawn Devin VM + deploy dao_proxy + 报 Gist + 退
             (鸡犬相闻 · 民至老死不相往来)
```

### 反者三身

```text
                    ┌──────────────────────────────────┐
                    │ 用户 (任公网账号 · 任设备)        │
                    │  · 浏 GitHub Pages               │
                    │  · 用 OpenAI SDK 调反代          │
                    └──────────────┬───────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
      ┌────────────┐       ┌──────────────┐    ┌──────────────────┐
      │ GH Pages   │       │ GH Actions   │    │ Devin Cloud VM   │
      │ (前 · 管)  │       │ (中 · 起)    │    │ (后 · 反代)       │
      ├────────────┤       ├──────────────┤    ├──────────────────┤
      │ index.html │       │ deployer.js  │    │ dao_proxy.js     │
      │ dao_app    │ 触发  │ · 调 Devin   │ 起  │ /v1/chat         │
      │ dao_bootst │ ───→ │ · spawn N VM │───→│ /v1/models       │
      │ Gist 读   │       │ · deploy     │    │ /health          │
      │            │ 显    │ · 报 Gist    │    │ omni router      │
      │            │ ←── │ · 退         │    │ /port/7780       │
      └─────┬──────┘       └──────┬───────┘    └────────┬─────────┘
            │                     │                     │
            │                     ▼                     │
            │             ┌──────────────┐               │
            └────读────→ │ Gist (主公)  │ ←── 写 ──────┘
                          │ dao-pool.json│
                          │ daemons[]    │
                          └──────────────┘
```

### 三件入册

| 件 | 路径 | 用 |
|----|----|-----|
| `packages/dao-devin-vm/` | 新立包 (6 件 · ~177 KB) | deployer + payload + spawner + installer |
| `.github/workflows/dao-fleet-devin-cloud.yml` | 新立 workflow | cron 5h + 5min poll keepalive |
| `tests/_seal115_smoke.cjs` | 新立守门 | 28 项 (件齐 + syntax + yaml + endpoint + fallback) |

**入 (公网用户 · 任 fork)**:
```bash
# 1. Fork 此 repo  →  enable Pages
# 2. 设 repo secrets: DAO_POOL_GIST_ID + DAO_POOL_PAT (印 95 一次 init 输出)
# 3. Actions → dao-fleet-devin-cloud → Run workflow (n=4)
# 4. 等 ~5 min → Gist 之 dao-pool.json 之 daemons[] 现 N 件 alive URL
# 5. 用任意 OpenAI SDK · base_url = "https://*.devinapps.com/port/7780"
```

**入 (本机仿测)**:
```bash
cd packages/dao-devin-vm
node deployer.js --n 1 --reuse-pool --dry-gist  # 用现池 alive · 不耗 ACU
```

**守**: `node tests/_seal115_smoke.cjs` (28/28 真过).
**详**: [`packages/dao-devin-vm/README.md`](packages/dao-devin-vm/README.md).

---

## 一·丙 · 印 101 · 万法归宗 · 大道至简 · 用 + 管 (2026-05-14 17:30)

> 帛书·四十八:「**为道者日损 · 损之又损 · 以至于无为 · 无为而无不为**」
> 帛书·六十四:「**图难于其易 · 为大于其细 · 圣人终不为大 · 故能成其大**」

承印 100 之"主公自身亦可不在" · 立**用户最终见之页归宗** — 旧 8 pane → 主面「用」+ 抽屉「管」二区 · **大道至简 · 为道日损**.

```text
┌────────────────────────────────────────────────┐
│ 印 101 · 用 + 管                                 │
│                                                  │
│  顶栏: ● 反代活 / 号 / 模型 / [复URL] [⚙]       │
│                                                  │
│  用区 (主面 80%):                                 │
│   [Chat]   → SSE 即问即答 · A/B 双路              │
│   [iframe] → chat.windsurf.ai / app.devin.ai     │
│   [批跑]   → 题集 + 通过率                        │
│                                                  │
│  管抽屉 (⚙ · 默收):                              │
│   [切号] [SP] [端点] [测试]                       │
│   账号库 / SP三模+库 / vmUrl+key / 烟测           │
└────────────────────────────────────────────────┘
```

**五大功能 → 印 101 落点**:

| 求 | 用/管 | 印 101 落 |
|---|---|---|
| ① 反代 ws+devin | 用 · iframe tab | 双切 chat.windsurf.ai / app.devin.ai |
| ② 提示词管理 | 管 · SP 节 | 三模 + SP 库 + 套用模板 |
| ③ API 管理 | 管 · 端点节 | vmUrl + auth-key + 测连 |
| ④ 切号 | 管 · 切号节 | 本机号库 + 云端 daemon 池一表 |
| ⑤ agent 测试 | 用 · 批跑 tab | 题集 + 跑 + 通过率统计 |

**反向兼容**: `?v=100` 走旧三栏 · (旧旁支 `legacy.html` 已于 cleanup-2026-05-16 损 · git history 存古).
**守门**: `_seal101_smoke.cjs` 86/86 · 全套 14/14 通.
**详**: [`web/dao_app.js`](web/dao_app.js) · [`web/index.html`](web/index.html).

---

## 一·乙 · 印 100 · 太极笙万物 · 一 PAT 即一切 (2026-05-14 12:00)

> 帛书·三十二:「**道恒无名 · 侯王若能守之 · 万物将自宾 · 天地相合 · 以降甘露 · 民莫之令而自均焉**」

承印 95 之"主公 PC 真可关机" · 立**主公自身亦可不在** — 任 GH 用户开公网入口页 · **仅输一次 PAT** · 之后 `fork → Pages → dao.json → dao-pool.json → auth-key → workflow → daemon → vmUrl` 全自动归位 · **民莫之令而自均**.

```text
                  用户 (任 GH 账号)
                  ◯ 输一次 PAT (gate 框)
                          │
                          ▼ daoBootstrap.oneShot
   ┌─────────────────────────────────────────────────┐
   │ ① whoami      ② fork (自创)    ③ actions (自启) │
   │ ④ pages       ⑤ dao.json       ⑥ dao-pool.json  │
   │ ⑦ auth-key    ⑧ dispatch       ⑨ poll daemon    │
   │ ⑩ probe       ⑪ write vmUrl    ⑫ redirect       │
   └─────────────────────────────────────────────────┘
                          │
                          ▼
              <user>.github.io/windsurf-assistant/
              · 左栏 vmUrl 已填 · daemon 已活 · 即用即活
              · 主公 PC 关 · 主公自身不在 · 系统仍真活
              · 道法自然 · 民莫之令而自均焉
```

**入 (Web)**: 打开 <https://zhouyoukang.github.io/windsurf-assistant/> · 粘 PAT · 完.
**入 (Node)**: `node packages/dao-pool/cli.js bootstrap --pat $GH_PAT`.
**详**: [`web/dao_bootstrap.js`](web/dao_bootstrap.js) · 历之阶见 [`_archive/seal-history.md`](_archive/seal-history.md).

---

## 一·甲 · 印 95 · 云端主路 (2026-05-14)

> 帛书·廿五: 「**独立而不垓 · 可以为天地母**」

承三身一道, 立**真本源闭环** — daemon 不再由主公 PC 起, **token 池**入主公**私 Gist** (替 `~/.wam/wam-state.json`), **GH Actions cron 5h** 自起 fleet_vm_unit + cf tunnel, **报 URL 回 Gist**, Web UI **pane F** 用 PAT 读 Gist 见所有活 daemon → 一笔设左栏 vmUrl.

```text
┌─────────────────────────────┐
│ 主公 GitHub 账号             │
│  Private Gist (真本源)       │  ← 替 ~/.wam (链中再无主公 PC)
│   dao-pool.json              │
└────────────┬────────────────┘
             │ PAT (gist scope)
             ▼
┌─────────────────────────────┐
│ GH Actions runner            │
│  dao-fleet-cloud.yml         │  cron 5h + dispatch + push
│  dao-fleet-keepalive.yml     │  cron 30min · 全死才触
│  dao-fleet-devin-cloud.yml   │  ★ 印 115 · 反者道之动 · 移 daemon 至 Devin VM
└─────────────────────────────┘
             ▲
             │ workflow_dispatch
             │
┌─────────────────────────────┐
│ 任何 fork 之公网用户          │
│  Pane F · PAT 读 Gist 见 URL │  ← 一笔设左栏 vmUrl
└─────────────────────────────┘
```

**入**: `node packages/dao-pool/cli.js init --pat $GH_PAT --from ~/.wam/wam-state.json` → 出 Gist URL.
**详**: [`packages/dao-pool/README.md`](packages/dao-pool/README.md) · 历之阶见 [`_archive/seal-history.md`](_archive/seal-history.md).

---

## 二 · 用户最终面 · 五合一对照

| 用户求 | 道身 A (公网) | 道身 B (本地) | 道身 C (Devin) |
|---|---|---|---|
| 反代 Windsurf | `/v1/*` cloud_engine | admin :7870 透 :7861 | — |
| 反代 Devin | `/dc/v1/*` (印 88) | `_kernel/devin_cloud_engine.js` | pilot playwright (印 92) |
| 反代核心移 Devin VM (★印 115) | `packages/dao-devin-vm/` deployer | 本机 reuse-pool | dao_proxy.js in-VM |
| 提示词管理 | `/sp/*` (透/道/自定) + injector wss hook (印 90) + proxy-min VSIX | `_kernel/sp_handler.js` + 左栏 SP | `sp_manager.js` |
| 反代 API 管理 | 左栏 VM URL/auth key/测试 | 同 | — |
| WAM 切号 | `packages/wam` VSIX + 中栏账号库 | `_kernel/wam_bridge.js` + WAM iframe | 印91 §1 一键切 |
| Agent 交互 | 右栏 SSE chat (A/B 双路) | 右栏 Cascade/Devin 双模 | pilot ask/observe |
| 一笔起 24h VM | `packages/dao-vm/vm_up.js` (印 92 · 1 ACU) | — | pilot launch |

---

## 三 · 一键启 (三身各启)

### A · 公网 (从这个 repo 起 · 给公网用户)

```bash
# 1. Fork 此 repo  →  enable Pages (Settings → Pages → Source: GitHub Actions)
# 2. 进入 https://<your-user>.github.io/windsurf-assistant/
# 3. 输 PAT (gist + repo scope) → 自动 fork + Pages + Gist + 跳专属页
# 4. 复制左栏 Devin Bootstrap 命令 → 粘 Devin Chat → 得 VM URL
# 5. URL 回粘左栏 → 测试连接 → 用任意 OpenAI/Anthropic/Gemini 客户端
#
# ★ 印 115 之新路 (Devin VM 反代核心):
# 6. (一次) 设 repo secrets DAO_POOL_GIST_ID + DAO_POOL_PAT
# 7. Actions → dao-fleet-devin-cloud → Run workflow (n=4)
# 8. 等 ~5 min → Gist daemons[] 现 N 件 → 任 OpenAI SDK base_url 用之
```

### B · 本地 (本机自托管 · 给开发者)

```powershell
git clone https://github.com/zhouyoukang/windsurf-assistant.git
cd windsurf-assistant
# 起反代 unit
node packages/dao-core/fleet_vm_unit.js --port 7862 --allow-auth
# 或起一笔 VM (1 ACU 换 24h)
node packages/dao-vm/vm_up.js
# 或印 115 之 reuse-pool 仿测 (不耗 ACU)
node packages/dao-devin-vm/deployer.js --n 1 --reuse-pool --dry-gist
```

### C · Devin 中枢 (本机·进阶 · 与本 repo 解耦)

```powershell
# 此为独立体 · 在 ../Devin云原生/PC端/本源/
cd Devin云原生/PC端/本源
node 印91_万法归宗中枢/server.js     # :11445 · 切号/备份/git/IDE桥/健康
node 印92_太上_pilot/pilot.js        # :11446 · playwright 操 app.devin.ai
```

---

## 四 · 仓骨

```text
├── README.md                     # 印 65 三清 + 一装三步 + 道义守 (历层印 88-101 入 _archive/seal-history.md)
├── INDEX_GUIZONG.md              # ★ 此文 · 一文锚三身
├── web/                          # GitHub Pages 静态 (零依赖)
│   ├── index.html                # gate/onboarding/mine 三态 + v101 CSS
│   ├── dao_app.js                # 印 101 用+管: renderMineV101 (顶栏+用叺3tab+抽屉节)
│   ├── dao_bootstrap.js          # ★ 印 100 浏览器自举 · oneShot 9 步 (22K)
│   └── dao_github_sync.js        # Gist 同步
├── packages/
│   ├── dao-core/      (10 · 261K) # 反代核心 · fleet_vm_unit + cloud/devin engine + sp + auth
│   ├── dao-injector/  (13 · 79K)  # 印 90 浏览器 wss hook (MV3 + Tampermonkey)
│   ├── dao-pool/      (4  · 45K)  # ★ 印 95 Gist token 池 + 印 100 bootstrap (Node 一笔)
│   ├── dao-proxy-min/ (17 · 284K) # 印 89+ 提示词反代 (Windsurf VSIX)
│   ├── dao-vm/        (8  · 83K)  # 印 92 一笔起 24h Ubuntu VM (1 ACU)
│   ├── dao-devin-vm/  (6  · 177K) # ★ 印 115 反者道之动 · GH Actions deployer + Devin VM dao_proxy
│   └── wam/           (27 · 491K) # WAM 切号 (Windsurf VSIX · v2.7.0)
├── scripts/
│   ├── devin-bootstrap.sh        # 一行起 unit + tunnel
│   └── devin-bootstrap-fleet.sh  # 印 96 fleet workflow
├── tests/                        # 15 件 smoke (~25s · 0 deps · 印 64-115 守门)
└── .github/workflows/            # deploy-pages + dao-fleet + dao-fleet-cloud + dao-fleet-keepalive + dao-fleet-devin-cloud (★印 115) + ci + test-core
```

---

## 五 · 道义守 (本 repo 之自律)

帛书六十三 · *为之于其未有也·治之于其未乱也*:

- **不偷 token** · apiKey 仅本机本用户
- **不绕 ACU** · 印 92 真消 1 ACU 换 24h VM
- **不破 SLA** · 不超 24h TTL · 不并发 100+ session
- **不污 Cognition telemetry**
- **不修 Windsurf/Devin 二进制** · 仅协议层注入
- **去中心化** · 用户自 fork · 自 Pages · 自 VM · 无中心 relay
- **★印 115 三隔离 (帛书 80 · 鸡犬相闻)**:
  - GH Actions 不参 LLM 链 · 仅 deployer
  - Devin VM dao_proxy 不知 GH 存在 · 自管自家 token 池
  - 三方通 Gist 间接交流 · 不互调 (民至老死不相往来)

---

## 六 · 引

- 历层印 88→101 · [`_archive/seal-history.md`](_archive/seal-history.md) (损于 cleanup-2026-05-16)
- 主 README · `./README.md`
- 反代 API · `./packages/dao-core/README.md`
- 提示词反代 VSIX · `./packages/dao-proxy-min/README.md`
- WAM 切号 VSIX · `./packages/wam/README.md`
- 一笔起 VM · `./packages/dao-vm/` (印 92 · 8 件)
- 云端 token 池 · `./packages/dao-pool/` (印 95 · 4 件 · 真本源 · 印 100 加 bootstrap 命)
- ★ **印 115 · Devin VM 反代核心** · [`./packages/dao-devin-vm/`](packages/dao-devin-vm/) (6 件 · 177K · deployer + payload + spawner + installer)
- 印 100 自举模块 · `./web/dao_bootstrap.js` (22K · 浏览器纯 JS · oneShot 9 步)
- 印 101 视图层 · `web/dao_app.js` (renderMineV101 + 顶栏 + 用区 3 tab + 抽屉 4 节)
- 守门 · `node tests/run_all.cjs` (14 件 · ~24s · 0 deps · 印 101 守 86/86)
- 印 115 守门 · `node tests/_seal115_smoke.cjs` (28 项 · 件齐 + syntax + yaml + endpoint + fallback)
- 部署 workflow · `./.github/workflows/deploy-pages.yml`
- 云端 daemon workflow · `./.github/workflows/dao-fleet-cloud.yml` (印 100 解锁 · 任 fork 自跑) + `dao-fleet-keepalive.yml`
- ★ **印 115 反代 workflow** · `./.github/workflows/dao-fleet-devin-cloud.yml` (cron 5h + 5min poll keepalive)

---

*道法自然 · 万法归一 · 三身已立 · 一文锚定 · 真本源闭环 · 主公 PC 真可关机 · 太极笙万物 · 民莫之令而自均焉 · 大道至简 · 用管归宗 · ★ 印 115 反者道之动 · 反代核心移 Devin VM · 鸡犬相闻 · 民至老死不相往来*

---

## 七 · 云端去芜 · cleanup-2026-05-16

> *为道日损 · 损之又损 · 以至于无为* — 帛书 四十八

承印 115 立 · 行去芜存菁 · 损 -9221 行 (-9369 / +148):

| 损 | 备 |
|---|---|
| `README.md` 53 KB → ~10 KB | 印 88-101 历层入 [`_archive/seal-history.md`](_archive/seal-history.md) · 主文复 印 65 三清 |
| `tests/_run_all.out.txt` 39 KB | 误入库之测输 · .gitignore 加 |
| `web/legacy.html` 56 KB | 旧 5-tab 旁支 · git history 存古 |
| `tests/_web_static_audit.cjs` 8 KB | legacy.html 专守 · 同损 |
| `05-文档_docs/SEAL_yin95.md` 8.5 KB | 单 seal 文 · INDEX_GUIZONG 已盖 |
| `_findings/test_fix_印81.md` | 移 [`_archive/test_fix_yin81.md`](_archive/test_fix_yin81.md) |
| `packages/wam/_test_v*.cjs` × 14 | 移 [`_archive/wam-tests-history/`](_archive/wam-tests-history/) · ci.yml 以 _test_in_use 代 _wam_e2e (后者之前已损) |
| `packages/wam/README.md` | 补三清导航首章 (失而复得 · 修 _three_pure_smoke 失项) |

验: `node tests/run_all.cjs` 全套 13/13 · 0 regression (原 14 - _web_static_audit + 印115 _seal115 = 14 件 · cleanup 后含印 115 守).
