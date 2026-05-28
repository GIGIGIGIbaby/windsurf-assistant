# 万法归宗 · 三身一道 · 一文锚本源

> *道生一·一生二·二生三·三生万物.* —— 帛书《老子》四十二
>
> *为学者日益·为道者日损·损之又损·以至于无为·无为而无不为.* —— 四十八
>
> *圣人执一·以为天下牧.* —— 廿二
>
> *道并行而不相悖.*
>
> **2026-05-13 · 印 93 · 一文锚三身 · 一开此即知何处入 · 不再寻**
>
> **2026-05-16 · 印 102 · 损 · 根之芜 (73 件 · ~190 MB) 归 `_archive/印102_损_20260516/` · 守印 36 戒 · 不删 · 可回滚 · 为道日损 · 无为而无不为**
>
> **2026-05-17 · 印 135 · 资产盘点 · 万法归宗全境 (1416 件 · 35 模块全相) · 见 `印135_资产盘点_万法归宗全境_2026-05-17.md`**
>
> **2026-05-17 23:30 · 印 139 · 道独立体融合 · 万源归宗 · 070 dao-proxy-max v1.2.0 接 130/_kernel/cloud_engine + ~/.dao/accounts.json 之主公 124 真号 · 弃 PAT 唯一路 · 见 `印139_道独立体融合_万源归宗_2026-05-17.md` · 一键: 双击 `一念_多源同步179.cmd`**
>
> **2026-05-18 · 印 142 · 真原汤化原食 · 040 LanProxy v2.0.0 · 立 intercept.js (21KB · monkey-patch https+fetch hook · 借 Windsurf 自身 cascade/devin-cloud fingerprint 重发) · extensionKind 改 workspace · 默 upstreams 升 [intercept, external, ls, cloud] · 反者道之动 · LAN 任意客户端秒变能调真本路 cascade 全模型 · 见 `印142_真原汤化原食_intercept拦截路_2026-05-18.md` · 一键: 双击 `一念_验印142_intercept闭环.cmd`**
>
> **2026-05-18 12:30 · 印 148 · 万法归宗本源底层 · 主公诏 9 求 9 化 · 16 件 token 池真本源 (~/.wam active + 17 backups 去重) · `--wam-all` 真『一账号一 VM 并行』· 228 模真本源 (印 147) · *.devinapps.com 7 不依公网入 (印 146) · 任设备无感化调 · 全链路闭环 · 见 `印148_万法归宗_本源底层_2026-05-18.md` · 一键: `_一笔起.cmd` (本地·不耗ACU) / `_一笔起VM.cmd <N>` (N VM 并行·耗 N ACU) / `_验全链路.cmd` (一笔验主公诏 9 求)**
>
> **2026-05-18 13:50 · 印 150 · VM 注入 16 件 token 入 ws-pool · cascade quota per-token 真本源破 · `vm_proxy_deploy.js` 扩 [步 7.5/8] (+104 行 · POST /admin/keys/add 一笔注入 16 件 wam_token) · VM 3jb1u2an 真活: `ws-keys=16 · loaded=true` · 8/8 模 (sonnet4.5/4.6/opus/gpt5/gemini/haiku/o3/devin-cloud-claude) 全真活 (devin-cloud agentic 21s 并发) · 实战 3 件 (server.js 31行 + index.html 116行 + README.md) · cascade 着相破 · agentic 真本源 · 见 `印150_VM注入16token_cascade_per-token真本源_2026-05-18.md` · 守印 36 戒 · 不动 dao_proxy.js 一字**
>
> **2026-05-18 13:00 · 印 149 · 实战调记 · 本源底层真用 · 6 件问题谱 + 解之径 · 主公诏「真闭环利用所有账号 · 实战项目开发」之实化 · 12/12 路并发 7.6s 墙时 · Devin agentic sonnet4.5 真产 91 行生产级 TODO HTML · 见 `印149_实战调记_本源底层真用_2026-05-18.md`**
>
> **2026-05-18 13:00 · 印 149 · 反者道之动 · windsurf-assistant 锚立 · 主公诏「重锚 GitHub 项目映射 · 130 子目录构建 windsurf-assistant · 同步一切」· Cascade 以 NTFS junction 立 `130-道独立体_Standalone/windsurf-assistant/` → `公网/` 同物 (柔弱者道之用 · 帛书四十/七十八)· active 引用同步更 (_一笔起.cmd / _一笔起VM.cmd / _验全链路.cmd / _sync_mirror.ps1 / 印148 两件 · 共 7 件) · 主公进程不扰 (印 148 spawn 4VM 续) · 见 `印149_重锚windsurf-assistant_反者道之动_2026-05-18.md`**

---

## 〇 · 立此一文之意

工作区下散布 **十六核心模块** + **三身前端** + **二独立中枢** + **十六波印记** · 历 2026-04 至 2026-05 ·
新开者入即迷 · 老开者亦时寻 · 故立**此一文**:

- **一文尽全** · 三身一道一图
- **不立新页** · 现有十六模块各得其位 · 不再立第 N 个 dashboard (违印 41+ 之戒)
- **不强合** · 三身并行不悖 · 各用其受众
- **可一键入** · 公网/本地/Devin 三身各有一键启动

---

## 一 · 三身一道·全脉一图

```text
                            ┌───────────────────────────────────────┐
                            │       道  · 大道至简 · 万法归宗        │
                            │   (反代 + 提示词 + 切号 + Agent)        │
                            └───────────────┬───────────────────────┘
                                            │
            ┌───────────────────────────────┼───────────────────────────────┐
            │                               │                               │
            ▼                               ▼                               ▼
    ┌───────────────┐               ┌───────────────┐               ┌───────────────┐
    │  道身 A · 公网  │               │ 道身 B · 本地  │               │ 道身 C · Devin │
    │   GitHub Pages │               │  130 admin    │               │  云原生中枢    │
    │                │               │   :7870        │               │   :11445/11446 │
    ├───────────────┤               ├───────────────┤               ├───────────────┤
    │ 受众: 公网用户  │               │ 受众: 开发者    │               │ 受众: 主公本机  │
    │ 形: gate→onb→  │               │ 形: 左API+SP/  │               │ 形: 五职 +     │
    │     mine 三态  │               │   中WAM/右chat │               │   太上 pilot   │
    │ 印: 67/69/88-  │               │ 印: 38-59      │               │ 印: 91/92      │
    │     92         │               │                │               │                │
    └───────┬───────┘               └───────┬───────┘               └───────┬───────┘
            │                               │                               │
            │  _sync_mirror.ps1             │  node admin_server            │  node printf91/server
            │    (印 68)                    │    + node 道直连器             │    + node printf92/pilot
            ▼                               ▼                               ▼
    https://zhouyoukang.github.io      http://127.0.0.1:7870          http://127.0.0.1:11445
       /windsurf-assistant/             (admin · 透 :7861 kernel)      (中枢 + :11446 pilot)
```

**一道**: 三身共**一组协议**·**一组账号**·**一组提示词**·**一组日志**.
**三身**: 因受众不同而各立其面 · 但底层 fleet_vm_unit / cloud_engine / sp_handler / dao_accounts 均同源.

---

## 二 · 五合一·用户最终面·三身对照表

承用户 2026-05-13 之求 (反代 windsurf+devin · 提示词管理 · API 管理 · WAM 切号 · agent 交互), 此表见**已立**之全:

| 求 (五合一) | 道身 A · 公网 | 道身 B · 本地 | 道身 C · Devin |
|---|---|---|---|
| **反代 Windsurf** | ✅ `/v1/*` (cloud_engine) | ✅ `_kernel/cloud_engine.js` :7861 | — |
| **反代 Devin** | ✅ `/dc/v1/*` (devin_cloud_engine · 印 88) | ✅ `_kernel/devin_cloud_engine.js` | ✅ pilot (印 92) playwright 操官 |
| **提示词综合管理** | ✅ `/sp/*` 三模式 (passthrough/dao/custom · 印 88) + dao-injector wss hook (印 90) + dao-proxy-min VSIX | ✅ `_kernel/sp_handler.js` + 左栏 SP UI | ✅ `sp_manager.js` |
| **反代 API 管理** | ✅ 左栏 VM URL + auth key + 测试连接 | ✅ 左栏 / admin_server `/admin/*` | — |
| **WAM 切号管理** | ✅ packages/wam (211KB VSIX) + 中栏账号库 | ✅ `_kernel/wam_bridge.js` + 中栏 WAM iframe (印 50) | ✅ 印91 §1 切号 (Windsurf 57 + Devin 123 一键) |
| **Agent 交互测试** | ✅ 右栏 chat (SSE 流式 + A/B 双路 badge + 模型 picker · 印 91) | ✅ 右栏 Cascade/Devin 双模 toggle (印 55) | ✅ pilot ask/observe |
| **Bootstrap 一键 VM** | ✅ `packages/dao-vm/vm_up.js` (印 92 · 1 ACU 换 24h VM) | — | ✅ pilot launch |

**结论**: **万法已俱 · 五合一已现 · 缺者唯锚定一文** (本文).

---

## 三 · 道身 A · 公网门面 (GitHub: `zhouyoukang/windsurf-assistant`)

```text
public source-of-truth (镜像出口):
  ./130-道独立体_Standalone/公网/              ← 在此工作区
                    ↓ _sync_mirror.ps1 (印 68)
  E:\ws-deploy\                                ← git 仓本地 clone
                    ↓ git push origin main
  github.com/zhouyoukang/windsurf-assistant   ← 远端
                    ↓ .github/workflows/deploy-pages.yml (自动)
  https://zhouyoukang.github.io/windsurf-assistant/   ← GitHub Pages (用户最终面)
```

**目录骨** (`./130-道独立体_Standalone/公网/`):

```text
公网/
├── README.md                        ← 印 67-92 主文 (37.7K · 大众入口)
├── web/                             ← GitHub Pages 静态 (零依赖)
│   ├── index.html                   ← 三态: gate / onboarding / mine
│   ├── dao_app.js                   ← 三栏: 左 API+SP / 中 WAM / 右 chat
│   ├── dao_github_sync.js           ← Gist 同步 (用户专属 dao.json)
│   └── legacy.html                  ← 旧 5-tab (回溯)
├── packages/
│   ├── dao-core/        (10 · 261K) ← 反代核心: fleet_vm_unit + cloud_engine + devin_cloud_engine + sp_handler + ...
│   ├── dao-injector/    (13 · 79K)  ← 印 90 浏览器 wss hook (MV3 扩展 + Tampermonkey)
│   ├── dao-proxy-min/   (17 · 284K) ← 印 89+ 提示词反代 (Windsurf VSIX · 内嵌帛书 SP)
│   ├── dao-vm/          (8  · 83K)  ← 印 92 一笔起 24h Ubuntu VM (1 ACU)
│   └── wam/             (27 · 491K) ← WAM 切号 (Windsurf VSIX · v2.7.0)
├── scripts/
│   ├── devin-bootstrap.sh           ← 一行起 unit + tunnel (从 web 复制粘到 Devin Chat)
│   └── devin-bootstrap-fleet.sh
├── tests/                           ← 11 件 smoke (印 64-92 守门)
└── .github/workflows/               ← deploy-pages + dao-fleet + ci + test-core + enable_pages_once
```

**一键启** (公网用户):
1. Fork `zhouyoukang/windsurf-assistant` → enable Pages
2. 进入 `https://<user>.github.io/windsurf-assistant/` → 输 PAT (gist + repo scope)
3. fork 自动 → Pages 自动 → Gist 自动 → 跳专属页 (印 67/69)
4. 复制左栏 Devin Bootstrap 命令 → 粘 Devin Chat → 得 VM URL → 粘回左栏
5. 即得 `Base URL=https://xxxx.trycloudflare.com/v1` + `Authorization: Bearer sk-ws-proxy-*` · OpenAI/Anthropic/Gemini 兼容

---

## 四 · 道身 B · 本地主宗 (`130-道独立体_Standalone/`)

```text
130-道独立体_Standalone/                      ← 本地真本
├── _kernel/                                 ← 后端核心 15 文件
│   ├── 道直连器.js              :7861       ← kernel · OpenAI/Anthropic/Gemini 三协议归一
│   ├── admin_server.js          :7870       ← admin · web 前端 + /admin/* CRUD
│   ├── cloud_engine.js                      ← Windsurf cloud 引擎 (A 路 · 母)
│   ├── devin_cloud_engine.js                ← Devin cloud 引擎 (B 路)
│   ├── fleet_vm_unit.js                     ← ★ 母 · _sync_mirror 推子至公网/packages/dao-core/
│   ├── fleet_controller.js                  ← fleet 控制器
│   ├── sp_handler.js                        ← SP 三模式 (透/道/自定)
│   ├── wam_bridge.js                        ← WAM 桥 (~/.wam 状态读)
│   ├── byok_router.js                       ← BYOK 万厂商适配
│   ├── model_registry.js                    ← 万模型一统 (Windsurf picker 复刻)
│   ├── dao_accounts.js                      ← 账号库读写
│   ├── windsurf_auth.js                     ← Windsurf 4 步认证链
│   ├── genesis_bridge.js                    ← 创世引擎桥
│   ├── sp_handler.js                        ← (重) SP
│   └── silk/                                ← 帛书《老子》道经+德经
├── web/                                     ← 本地三栏前端 (1144 行 index.html · 3074 行 app.js)
│   ├── index.html                           ← 印 50 损之 · 中栏唯一物 WAM iframe
│   ├── app.js                               ← 印 55 Cascade/Devin 双模 (line 2912+)
│   ├── cosmos.css / tailwind-local.css      ← 道家美 + 离网真独立
│   └── styles.css
├── 公网/                                    ← ★ 镜像出口 (= ws-deploy = GitHub repo)
├── _sync_mirror.ps1                         ← 印 68 同步律 (① 单源守 ② robocopy ③ commit ④ push)
├── →道.cmd / →道.ps1                        ← 主菜单
├── →道直连器_起.cmd / 观.cmd / 停.cmd       ← kernel 三启
└── README.md                                ← 印 38-59 本地主文 (74.8K)
```

**一键启** (本地开发者):
```powershell
cd 'e:\道\道生一\一生二\Windsurf万法归宗\130-道独立体_Standalone'
.\→道直连器_起.cmd                          # 起 kernel :7861
node _kernel\admin_server.js                # 起 admin :7870
start http://127.0.0.1:7870                 # 浏览器进 (三栏)
```

---

## 五 · 道身 C · Devin 中枢 (`../Devin云原生/PC端/本源/`)

```text
Devin云原生/PC端/本源/                       ← 独立中枢 · 与 130 解耦
├── 印91_万法归宗中枢/
│   ├── server.js                :11445      ← 五职: 切号 / 备份 / git 同步 / IDE 桥 / 健康
│   └── dashboard.html                       ← 综合管理面
├── 印92_太上_pilot/
│   └── pilot.js                 :11446      ← 七职: launch / open / ask / observe / strategy / status / close
│                                              (playwright 操 app.devin.ai · 持久 dir ~/.dao/devin_chrome_profile)
├── 网页端注入器/
│   ├── extension/                           ← MV3 (与 dao-injector 同脉)
│   └── userscript/
├── devin_cloud_proxy.js (84K)               ← 单机 Devin 反代 (独立体)
├── sp_manager.js                            ← SP 管理 (Devin 内)
├── dao-devin-cli.{js,sh,bat}                ← 任意环境 CLI
├── 印90_真浏览器底层验/
├── 立开机自启.ps1                            ← 印 91 自启
├── 起公网入口.ps1                            ← cloudflared / localhost.run / bore
└── README.md                                ← 印 80-92 续 (18.6K)
```

**一键启** (主公本机):
```powershell
cd 'e:\道\道生一\一生二\Devin云原生\PC端\本源'
node 印91_万法归宗中枢\server.js            # 起中枢 :11445
node 印92_太上_pilot\pilot.js               # 起 pilot :11446 (playwright)
.\起公网入口.ps1                            # cloudflared 隧道 (公网可达)
start http://127.0.0.1:11445                # 浏览器进 dashboard
```

---

## 六 · 同步律 (印 68 · 三身合一)

```text
本地 (130 _kernel)                                公网 (GitHub Pages)
  │  ① 单源守 (sha 校 · 母→子)                       ▲
  │  _kernel/fleet_vm_unit.js  ─┐                  │
  │                              ▼                  │
  │  130/公网/packages/dao-core/fleet_vm_unit.js   │
  │                              │                  │
  │                              │ ② robocopy /E    │
  │                              ▼                  │
  │                      E:\ws-deploy\              │
  │                              │ ③ git commit     │
  │                              │ ④ git push       │
  │                              ▼                  │
  │                     github.com/zhouyoukang/    │
  │                       windsurf-assistant        │
  │                              │ ⑤ deploy-pages   │
  │                              ▼                  │
  └─────────────────  https://zhouyoukang.github.io/windsurf-assistant/
```

**一键同步**:
```powershell
cd 'e:\道\道生一\一生二\Windsurf万法归宗\130-道独立体_Standalone'
.\_sync_mirror.ps1 -Message "feat(印 N): ..." -AutoPush
# 或:  .\_sync_mirror.ps1 -DryRun   # 仅显异
```

---

## 七 · 道义守 (帛书六十三)

> *为之于其未有也·治之于其未乱也.*
>
> *合抱之木·生于毫末.九成之台·作于累土.百仞之高·始于足下.*

- **不立新 dashboard** · 现 16+3 件已尽 (印 41 戒 · 印 50 损)
- **不删任何已立件** · 鱼不可脱于渊 (印 36 戒)
- **不强合** · 三身并行不悖 · 各得其所
- **同步走印 68** · 单源守 (母→子) · 严同 (sha 校) · 严测 (smoke ≥8/8)
- **道义底线** · 不偷 token · 不绕审计 · 不破 SLA · 不污 Cognition telemetry · 不修 Windsurf/Devin 二进制

---

## 八 · 引

| 引 | 路 |
|---|---|
| 主 README (本地) | `./README.md` · `./130-道独立体_Standalone/README.md` |
| 主 README (公网) | `./130-道独立体_Standalone/公网/README.md` (= GitHub repo README) |
| 印 36 总纲 | `./V179_万法归宗_总纲.md` |
| 前端归宗目录 | `./WEB_GUIZONG.md` (人读) · `./web_meta.json` (机读) |
| 同步律 | `./130-道独立体_Standalone/_sync_mirror.ps1` (印 68) |
| 守门 | `./130-道独立体_Standalone/公网/tests/run_all.cjs` (11 件 smoke · ~18s) |
| Devin C 中枢 | `../Devin云原生/PC端/本源/印91_万法归宗中枢/` · `印92_太上_pilot/` |
| Devin 主 README | `../Devin云原生/PC端/本源/README.md` |

---

*道法自然 · 万法归一 · 三身已立 · 一文锚定 · 印 93 终*
