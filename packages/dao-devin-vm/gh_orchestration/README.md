# 01_GH编排 · 公网无感入口 · 印 115 · 反者道之动

> 「**邻邦相望，鸡狗之声相闻，民至老死不相往来**」（帛书八十）
>
> 「**为之于其未有也，治之于其未乱也**」（帛书六十四）

---

## 〇 · 此目录之意

承印 95→101 之"主公 PC 真可关机 · 一 PAT 即一切"，立**反代核心彻底底移**:

```text
旧 (印 95-101): client → GH Pages → GH Actions runner (fleet_vm_unit + cf tunnel) → wss
新 (印 115):    client → GH Pages → Devin Cloud VM  (dao_proxy /v1/*  · 自带公网)  → wss

             GH Actions runner 仅"接生婆": spawn Devin VM + deploy dao_proxy + 报 Gist + 退
             (鸡犬相闻 · 民至老死不相往来)
```

---

## 一 · 件 (5)

```text
01_GH编排/
├── deployer.js                       (14.9 KB · orchestrator · GH Actions runner 主入口)
├── workflow/
│   └── dao-fleet-devin-cloud.yml     (8.1 KB · cron 5h + 5min poll keepalive)
├── package.json                      (1 KB · npm pkg meta · @windsurf-assistant/dao-devin-vm)
├── _pkg_README.md                    (7.8 KB · PR 入 GH repo 子包 README)
├── _seal115_smoke.cjs                (4.3 KB · PR 守门 · 期望 packages/dao-devin-vm/ + .github/workflows/ 子结构)
└── INDEX_GUIZONG.md                  (19.3 KB · 万法归宗 · 三身一道 · 印 95-115 全图)
```

---

## 二 · deployer.js 工作流 (反者道之动)

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

★ 三隔离 (帛书 80 · 鸡犬相闻):
  · GH Pages   直调 Devin VM URL  (不通过 GH Actions)
  · GH Actions 仅写 Gist URL      (不参与 LLM 链)
  · Devin VM   不知 GH 存在       (自管 token 池)
  · 三方通 Gist 间接交流          (民至老死不相往来)
```

---

## 三 · 一笔启 (三态)

### A · GH Actions runner (主用 · 公网无人值守)

repo secrets 设:

- `DAO_POOL_GIST_ID` (印 95 一次 cli.js init 输出 · 含 dao-pool.json)
- `DAO_POOL_PAT` (PAT · scope: gist)

workflow trigger:

- workflow_dispatch (主公手动 / Web UI 一键)
- `cron '0 */5 * * *'` (5h 自续 · 主公关机时仍真活)
- push paths: workflow yaml 自身改动

runner 内 step 4 主跑:

```bash
cd packages/dao-devin-vm           # 仅 GH repo 之路径 (本家 = 01_GH编排/)
node deployer.js \
  --gist-id "$DAO_POOL_GIST_ID" \
  --pat "$DAO_POOL_PAT" \
  --n "$N_VMS"
```

step 5 跑 keepalive (350 min · 5 min poll · 替死者):

```bash
while true; do
  sleep 300
  timeout 200 node deployer.js \
    --gist-id "$DAO_POOL_GIST_ID" --pat "$DAO_POOL_PAT" \
    --n "$N_VMS"
done
```

### B · 本机仿测 (dry-gist · 不写 Gist)

```bash
node deployer.js --n 2 --dry-gist
# 起 2 件 Devin VM · deploy · 不报 Gist · 仅 evidence 立本地
```

### C · reuse-pool (用现池 alive · 不耗 ACU)

```bash
node deployer.js --n 1 --reuse-pool --dry-gist
# 不 spawn 新 · 用 vm_pool.json 中 status=alive · 仅 deploy dao_proxy
```

---

## 四 · 路径同包 fallback (反者道之动 · 不依本机外资)

deployer.js 之路径全用 env + 同包 fallback (无 hardcode 外部路径):

| env | 默 (同包) | 用 |
|-----|-----------|-----|
| `DAO_OMNI_JS` | `<本目录>/vm_omni.js` | spawn VM 子脚本 |
| `DAO_DEPLOY_JS` | `<本目录>/vm_proxy_deploy.js` | install 子脚本 |
| `DAO_POOL_JSON` | `<本目录>/_state/vm_pool.json` | VM 池状态 |
| `DAO_AUTH_FILE` | `<本目录>/.dao_auth_token` | per-deploy sk-* token (32B hex) |
| `DAO_PROXY_FILE` | `<本目录>/dao_proxy.js` | LLM 主体 (装至 VM /home/ubuntu/dao_proxy/) |

★ 在 GH repo 之 packages/dao-devin-vm/ 结构下，dao_proxy.js + vm_omni.js + vm_proxy_deploy.js 与 deployer.js 同目录。
★ 在本家 (01_GH编排/) 下，需设 DAO_OMNI_JS / DAO_DEPLOY_JS / DAO_PROXY_FILE 指向 ../00_本源/ 之件。

---

## 五 · 入 GH repo 之路 (PR 备件)

`_pkg_README.md` 与 `_seal115_smoke.cjs` 与 `INDEX_GUIZONG.md` 皆是入 GH repo 之 PR 准备。在 GH repo 下:

```text
windsurf-assistant/
├── packages/
│   └── dao-devin-vm/                ← 此包 (与 00_本源/ + 此目录之件合)
│       ├── dao_proxy.js             ← cp 自 ../../00_本源/dao_proxy.js
│       ├── vm_omni.js               ← cp 自 ../../00_本源/vm_omni.js
│       ├── vm_proxy_deploy.js       ← cp 自 ../../00_本源/vm_proxy_deploy.js
│       ├── silk/                    ← cp 自 ../../00_本源/silk/
│       ├── deployer.js              ← cp 自 ./deployer.js
│       ├── package.json             ← cp 自 ./package.json
│       └── README.md                ← cp 自 ./_pkg_README.md
├── .github/workflows/
│   └── dao-fleet-devin-cloud.yml    ← cp 自 ./workflow/dao-fleet-devin-cloud.yml
├── tests/
│   └── _seal115_smoke.cjs           ← cp 自 ./_seal115_smoke.cjs
└── INDEX_GUIZONG.md                 ← cp 自 ./INDEX_GUIZONG.md
```

PR 命令:

```bash
# 在 windsurf-assistant repo 下
mkdir -p packages/dao-devin-vm/silk
cp ../虚拟机反代/00_本源/dao_proxy.js packages/dao-devin-vm/
cp ../虚拟机反代/00_本源/vm_omni.js packages/dao-devin-vm/
cp ../虚拟机反代/00_本源/vm_proxy_deploy.js packages/dao-devin-vm/
cp -r ../虚拟机反代/00_本源/silk/* packages/dao-devin-vm/silk/
cp ../虚拟机反代/01_GH编排/deployer.js packages/dao-devin-vm/
cp ../虚拟机反代/01_GH编排/package.json packages/dao-devin-vm/
cp ../虚拟机反代/01_GH编排/_pkg_README.md packages/dao-devin-vm/README.md
cp ../虚拟机反代/01_GH编排/workflow/*.yml .github/workflows/
cp ../虚拟机反代/01_GH编排/_seal115_smoke.cjs tests/
cp ../虚拟机反代/01_GH编排/INDEX_GUIZONG.md ./

# 跑守门
node tests/_seal115_smoke.cjs        # 期 28/28 真过

# 提 PR
git checkout -b yin115-reverse-direction
git add packages/dao-devin-vm/ .github/workflows/dao-fleet-devin-cloud.yml tests/_seal115_smoke.cjs INDEX_GUIZONG.md
git commit -m "印 115 · 反者道之动 · GH 面板综合管 · Devin VM 反代核心"
git push origin yin115-reverse-direction
gh pr create --title "印 115 · 反者道之动" --body-file INDEX_GUIZONG.md
```

---

## 六 · 真测真态

```bash
# 1. syntax 验
node --check deployer.js                              # ✓ 已 pass

# 2. workflow yaml 验 (需 actionlint 或 yamllint)
# (此处不重 · GH 入仓后自跑)

# 3. dry-run deployer (需 ~/.wam 有 token)
node deployer.js --n 1 --dry-gist --reuse-pool
# 若 vm_pool.json 无 alive · 退 1
# 若有 alive · 仅 deploy · 不消 ACU

# 4. 真起 N=1 VM (耗 1 ACU)
node deployer.js --n 1 --dry-gist
# 真消 1 ACU · 24h TTL · 出公网 URL
```

---

## 七 · 印传

| 印 | 立 |
|----|----|
| 95 | Gist token 池 + GH Actions cron 5h fleet_vm_unit (旧路) |
| 100 | dao_bootstrap.js 浏览器自举 oneShot 9 步 |
| 101 | 用 + 管 · 主面 80% + 抽屉 4 节 |
| 112 | 4 VM × 12 mesh edge = 100% 真通 |
| **115** | **反者道之动 · daemon 移 Devin VM · GH 仅接生婆 · 三隔离** |
| 116 | mesh chat 真返 (历测真态) |
| 117 | full probe (omni 受 Devin 限) |

---

*「天下莫柔弱于水，而攻坚强者莫之能胜也，以其无以易之也」* —— 帛书《老子》七十八

*印 115 · 反者道之动 · daemon 移 Devin VM · 主公 PC 真可关机 · 民莫之令而自均焉*
