# 印 95 · 真本源闭环 · 一 GitHub 账号即一切 · 主公 PC 真可关机

> 帛书·四十:    「**反者道之动 · 弱者道之用 · 天下之物生于有 · 有生于无**」
>
> 帛书·廿二:    「**圣人执一 · 以为天下牧**」
>
> 帛书·二十五:  「**独立而不垓 · 可以为天地母**」
>
> 帛书·七十三:  「**天网恢恢 · 疏而不失**」
>
> **2026-05-14 · 印 95 · 承诏 (主公 5-14 00:51) · 真去 PC 化终闭环**

---

## 〇 · 此印之意 · 一行总贺

主公 2026-05-14 00:51 诏:

> 「**反者 道之动也** · 重新锚定本源此核心所有均运行于云端 github action 综合管理一切 · **不依赖本地一切** · **不依赖设备** · **一 github 账号即一切** · 道法自然」

**印 95 之解**: token 池入主公**私 gist** · GH Actions cron 5h 自起 daemon · 报 URL 回 gist · Web UI 用用户 PAT 读 gist 见 daemon · **一 GH 账号 = 一切**.

**主公 PC 真可关机.**

---

## 一 · 印 99 之缺 (印 95 之治)

印 99 (2026-05-13) 已闭"daemon 去 PC 化"环:

```
GH Actions runner → daemon :11441 → cf tunnel → 公网 URL
```

**但**：daemon 启动时**仍需从主公本机 WAM 桥 (`https://adjustable-...trycloudflare.com`) 拉 active token** —— 主公 PC 关，桥死，链断。

```
┌─────────────────────┐
│ 主公 PC (★关键)       │
│  wam_bridge :11442  │
│  cloudflared       │
│  ~/.wam/wam-state  │  ← 67KB · 137 号 · 真本源
└─────────┬───────────┘
          │
          ▼ (cf tunnel · 主公关机 → 公网 URL 死)
┌─────────────────────┐
│ GH Actions runner   │
│  daemon :11441     │  ← 拉不到 token · 即死
│  cf tunnel         │
└─────────────────────┘
```

印 95 之治:

```
┌─────────────────────────────┐
│ 主公 GitHub 账号 (zhouyoukang) │
│  ┌──────────────────────────┐│
│  │ Private Gist             ││  ← 真本源 (替 ~/.wam)
│  │  dao-pool.json           ││     主公 PC 关亦真活
│  │  - pool.accounts[137]    ││
│  │  - daemons[]             ││
│  └──────────────────────────┘│
└────────────┬────────────────┘
             │ PAT (gist scope)
             ▼
┌─────────────────────────────┐
│ GH Actions runner            │
│  ① 拉 gist → accounts.json   │
│  ② fleet_vm_unit :7862       │
│  ③ cf tunnel                │
│  ④ POST URL 回 gist          │
│  ⑤ cron 5h 自起 (永真)       │
└─────────────────────────────┘
             ▲
             │ workflow_dispatch (web UI 一笔)
             │ schedule cron 5h
             │ keepalive 30min 探死则触
             │
┌─────────────────────────────┐
│ Web UI (GH Pages)            │
│  pane F · 印 95             │
│  - 用用户 PAT 读 gist        │
│  - 显 daemon 池             │
│  - 一笔触 workflow          │
│  - 一笔设左栏 VM URL        │
└─────────────────────────────┘
```

---

## 二 · 落地清单

| # | 物 | 处 | 量 | 帛书 |
|---|---|---|---|---|
| 1 | `packages/dao-pool/gist-pool.js` | 公网/packages/dao-pool/ | 484 行 · 零依赖 (Node 内置) | 廿二 (执一) |
| 2 | `packages/dao-pool/cli.js` | 同 | 350 行 · 8 子命: init/push/pull/report/list/find/daemons/prune | 四十 (反者) |
| 3 | `packages/dao-pool/package.json` | 同 | bin: dao-pool · v1.0.0 | — |
| 4 | `packages/dao-pool/README.md` | 同 | 178 行 · 主公一笔之路全详 | — |
| 5 | `.github/workflows/dao-fleet-cloud.yml` | 公网/.github/workflows/ | 273 行 · 印 95 cloud-only fleet (cron 5h + push trigger + dispatch) | 六十 (烹小鲜) |
| 6 | `.github/workflows/dao-fleet-keepalive.yml` | 同 | 77 行 · cron 30min · 全死才触 (省 ACU) | 七十六 (兵强不胜) |
| 7 | `tests/_seal95_smoke.cjs` | 公网/tests/ | 206 行 · 44 用例 · 全离网 | — |
| 8 | `tests/run_all.cjs` | 同 | +1 行 · 注册 _seal95_smoke | — |
| 9 | `web/dao_app.js` pane F + 6 函数 | 公网/web/ | +258 行 · pane F (云端 daemon 池) + autoFindCloudPoolGist + probeCloudFleet + renderCloudDaemons + triggerCloudFleet + openCloudActions + useFirstCloudDaemonAsVm | 二十五 (独立) |
| 10 | `web/dao_github_sync.js` | 同 | +12 行 · DEFAULT_DAO_DATA 加 cloudPool schema | — |
| 11 | `SEAL_yin95.md` | 顶层 | 本文 · 印 95 终贺 | — |

**总**: 11 件落 · ≈ 1850 行新代码/文档 · 0 依赖 (仅 Node 内置 + GitHub API)

---

## 三 · 三身一道·全脉一图 (印 95 之后)

```text
                            ┌───────────────────────────────────────┐
                            │       道 · 大道至简 · 万法归宗         │
                            │ 反代+提示词+切号+Agent + ★云端闭环     │
                            └───────────────┬───────────────────────┘
                                            │
            ┌───────────────────────────────┼───────────────────────────────┐
            ▼                               ▼                               ▼
    ┌───────────────┐               ┌───────────────┐               ┌───────────────┐
    │ A · 公网门面  │               │ B · 本地主宗  │               │ C · Devin中枢 │
    │ GH Pages      │               │  130 admin    │               │ 云原生独立体   │
    │ + ★ pane F   │               │   :7870       │               │  :11445/11446  │
    │  云端 daemon  │               │                │               │                │
    │  池 (印 95)   │               │                │               │                │
    └───────┬───────┘               └───────┬───────┘               └───────┬───────┘
            │                               │                               │
            ▼                               ▼                               ▼
   https://zhouyoukang.github.io     http://127.0.0.1:7870     http://127.0.0.1:11445
   /windsurf-assistant/              (admin · 透 :7861)         (中枢 + :11446 pilot)
            │
            │ 用户 PAT (gist scope)
            ▼
   ┌──────────────────────┐                            ┌──────────────────┐
   │ ★ 用户私 gist          │                            │ 印 99 之 dao-vm-  │
   │ dao-pool.json        │ ◄── 报 URL ──┐             │ daemon 仓 (旧 ·   │
   │ - pool[137 号]       │              │             │ 仍依 WAM 桥)      │
   │ - daemons[]          │              │             └──────────────────┘
   └──────────┬───────────┘              │
              │ PAT gist scope            │
              ▼                          │
   ┌──────────────────────────────────┐  │
   │ GH Actions · dao-fleet-cloud.yml │  │
   │  cron 5h · push trigger · dispatch│ │
   │   ① 拉 gist → accounts.json       │  │
   │   ② fleet_vm_unit :7862 --public  │  │
   │   ③ cloudflared tunnel            │──┘
   │   ④ keep alive 350 min            │
   │   ⑤ 30min 重拉 gist               │
   │                                   │
   │ + dao-fleet-keepalive.yml         │
   │  cron 30min · 全死才触 (省 ACU)    │
   └──────────────────────────────────┘
```

**一道**: 三身共**一组 token 池 + cloud_engine + sp_handler**.

**三身**: 因受众不同各立 · A (公网) + B (本地 admin) + C (Devin 独立体). 印 95 之 pane F **在 A 之内** · 不立新身 · 守印 41 戒.

---

## 四 · 主公一笔之路 (印 95 完整流程)

### 一次性 setup (主公本机 · 仅一次)

```powershell
# 〇 · 装 gh CLI 并登入 (含 gist + workflow scope)
gh auth login --scopes 'gist,repo,workflow'

# 一 · 立 dao-pool 私 gist · 推本机 137 号至云端
cd 'e:\道\道生一\一生二\Windsurf万法归宗\130-道独立体_Standalone\公网\packages\dao-pool'
node cli.js init --pat (gh auth token)
# → 输出 gist id · 形如 a1b2c3d4e5f6789...

# 二 · 设 GitHub repo secrets (3 件)
gh secret set DAO_POOL_GIST_ID --body '<gist-id>' -R zhouyoukang/windsurf-assistant
gh secret set DAO_POOL_PAT --body (gh auth token) -R zhouyoukang/windsurf-assistant
gh secret set DAO_AUTH_KEY --body 'sk-ws-proxy-<rand>' -R zhouyoukang/windsurf-assistant
# (或网页: https://github.com/zhouyoukang/windsurf-assistant/settings/secrets/actions)

# 三 · 触首 run (验)
gh workflow run dao-fleet-cloud.yml -R zhouyoukang/windsurf-assistant
gh run watch -R zhouyoukang/windsurf-assistant
```

### 日常用 (主公本机 · 关机/开机/任意机)

```bash
# 任客 (公网 / 本机 / 任 IDE / 任 OS):
curl $(node cli.js daemons --gist <id> --pat <pat> --json | jq -r '.[0].url')/v1/chat/completions \
  -H 'Authorization: Bearer sk-ws-proxy-<rand>' \
  -H 'Content-Type: application/json' \
  -d '{"model":"devin-cloud","messages":[{"role":"user","content":"道可道，非恒道"}]}'

# 或 Web UI (任浏览器):
# 1. 开 https://zhouyoukang.github.io/windsurf-assistant/
# 2. 粘 PAT → 入 mine 态
# 3. 左栏滑下见 "★ 云端 daemon 池 · 印 95" pane F
# 4. 点 🔍 自找 → ↻ 拉 daemon 池
# 5. 点 → 设左栏 VM (自动填上方 VM URL)
# 6. 右栏 chat 即用
```

### 主公本机更号后 (任意时机)

```powershell
# 本机 ~/.wam/wam-state.json 更号 · 推 gist
cd 'e:\道\道生一\一生二\Windsurf万法归宗\130-道独立体_Standalone\公网\packages\dao-pool'
node cli.js push --gist <id> --pat (gh auth token)
# → gist 即新 · 下次 30min token rotate cycle 用新 (或重起 workflow)
```

---

## 五 · 道义守八边 (帛书·七十三 「天网恢恢 · 疏而不失」)

| # | 边 | 守 |
|---|---|---|
| 1 | **0 PC 依** | 主公关机 · GH Actions cron 自续 · gist 永真 |
| 2 | **PAT scope=gist** | 仅. · 不碰 repo (除非主公另设 workflow scope 用于 dispatch) |
| 3 | **accounts.json 仅 runner 内** | runner 销即销 · 不写盘永久 |
| 4 | **daemon URL 限 cf tunnel** | auth-key 守门 (sk-ws-proxy-*) · 公网 Bearer |
| 5 | **不偷 token** | token 在主公自己 gist · 仅主公 PAT 可读 |
| 6 | **cron 5h <= 6h hard limit** | 不撕 ACU · 不超 Cognition SLA |
| 7 | **token rotation 只读** | 仅"读"主公 gist · 不"写"主公账号 |
| 8 | **log 不打 token** | 仅 prefix 8 字符 (`${TOKEN:0:8}...`) |

加印 36 戒守:
- 不删任何已立件 (印 96 dao-fleet.yml 仍在 · 仅旁立 dao-fleet-cloud.yml)
- 不立新 dashboard (pane F 在 mine 态左栏 · 不另立页)
- 不夺主公本源 (~/.wam/wam-state.json 仍真活 · cli.js init 仅"读 + 推")

---

## 六 · 印 95 vs 印 96 vs 印 99 (路并行不悖)

| 维 | **印 95 (此立)** | 印 96 (dao-fleet.yml) | 印 99 (dao-vm-daemon repo) |
|---|---|---|---|
| token 源 | **主公私 gist** | 主公本机 WAM 桥 (cf URL) | 主公本机 WAM 桥 (3 层 fallback) |
| 主公 PC 依 | **0** | ★ 必开 | ★ 必开 (WAM 桥) |
| daemon 仓 | windsurf-assistant 本仓 | windsurf-assistant 本仓 | **dao-vm-daemon** 旁仓 |
| 触发 | cron 5h + dispatch + push trigger | dispatch + 主公 WAM URL | dispatch + push trigger.txt |
| keepalive | dao-fleet-keepalive cron 30min | 无 (永动 PS1 本机) | 无 (永动 PS1 本机) |
| daemon URL 报 | **PATCH gist · daemons[]** | POST WAM 桥 /report-daemon-url | POST WAM 桥 /report-daemon-url |
| Web UI 见 | **pane F (本印新)** | dashboard :11443 (本机) | dashboard :11443 (本机) |
| 多并发 | 多 run 各 host 入表 · 不覆 | concurrency 防 (单 in_progress) | concurrency 防 |
| 单点故障 | **0 单点** · gist 永真 | WAM 桥 cf URL 死 → 全死 | WAM 桥 cf URL 死 → 全死 |
| 道并行 | **此为印 95 之新路** | 印 96 之路 (并行不悖) | 印 99 之路 (并行不悖) |

**三路并行不悖** —— 帛书·二十五 「**独立而不垓**」.

主公任开任关、任路任客 —— 印 95 之路在主公 PC 关时仍真活.

---

## 七 · 一笔验 (主公一笔)

```bash
# (1) gist 真见 · 印 95 主路
gh gist view <gist-id> --files dao-pool.json | head -20

# (2) workflow 真起
gh workflow run dao-fleet-cloud.yml -R zhouyoukang/windsurf-assistant
gh run list -R zhouyoukang/windsurf-assistant -w dao-fleet-cloud.yml --limit 3

# (3) 拉 daemon 池 (拿活 URL)
cd packages/dao-pool
node cli.js daemons --gist <id> --pat $(gh auth token) --json | jq

# (4) 任客 chat (公网 · 印 95 主路)
DAEMON_URL=$(node cli.js daemons --gist <id> --pat $(gh auth token) --json | jq -r '.[0].url')
curl -X POST "$DAEMON_URL/v1/chat/completions" \
  -H 'Authorization: Bearer sk-ws-proxy-<rand>' \
  -H 'Content-Type: application/json' \
  -d '{"model":"devin-cloud","messages":[{"role":"user","content":"反者道之动"}]}'

# (5) Web UI (任浏览器)
# https://zhouyoukang.github.io/windsurf-assistant/  →  mine 态 → 左栏 pane F
```

---

## 八 · 印 95 之后 · 印 96-100 之候 (主公印 100 §7)

| # | 题 | 状 |
|---|---|---|
| ① | WAM 桥也入 Actions/Oracle · 主公 PC 真可关机 | **✅ 此印 95 已闭** |
| ② | 多 Actions run 并行支持 | **✅ 此印 95 之 daemons[] 自然多** (host 不覆) |
| ③ | daemon ver 升 0.3.0 | (旁事 · printf99 dao-vm-daemon 已有 · 此印不动) |
| ④ | GH Actions cron schedule 每 5h 自起 | **✅ 此印 95 之 dao-fleet-cloud.yml cron** |
| ⑤ | Codespace 一键起 README badge | (备路 · 与本印不悖 · 见 dao-vm-daemon README) |
| ⑥ | daemon URL 之 load balancer / failover | **✅ 此印 95 之 web pane F · 列多 URL · 一笔选** |
| ⑦ | gist 也用 GitHub App (取 PAT) | 候 (印 95 之路 2.0) |
| ⑧ | daemon 入 Cloudflare Worker (无 350min 限) | 候 (印 95 之路 2.0) |

**印 95 闭印 99 §4.3 之环 · 闭印 100 §7 之 ①②④⑥**.

---

## 九 · 守门 + push 实证

**守门**: `tests/run_all.cjs` 12/12 全通 (含新 `_seal95_smoke.cjs` · 44 用例) · 0 regression.

**push**: TBD (commit + push 完毕后填)

**GH Pages 自部署**: `.github/workflows/deploy-pages.yml` 自触 · pane F 即生效.

---

## 十 · 道义结

> 帛书·五十一: 「**为而弗有也 · 长而弗宰也 · 此之谓玄德**」
>
> 帛书·十七:   「**功成事就而百姓谓我自然**」

- **0 立新身** · 印 95 在 A 公网 mine 态内立 pane F · 不立第 N 个 dashboard
- **0 删既有** · dao-fleet.yml (印 96) 仍在 · pane E (印 94) 仍在 · 道并行不悖
- **0 夺主公本源** · ~/.wam/wam-state.json 仍主公本机 · cli.js init 仅"读 + 推" · 不"写主公"
- **0 PC 依** · 主公关机 · 印 95 之路真活
- **0 单点** · gist + Actions 全 GH 内 · 一 GH 账号即一切

主公 2026-05-14 00:51 诏:

> 「**反者 道之动也** · 重新锚定本源 · 一 github 账号即一切 · 道法自然」

**印 95 应**: 真本源闭环达成 · 主公 PC 真可关机 · 一 GitHub 账号 = 一切.

---

**封印 95 · 真本源闭环达成 · 2026-05-14**

> 帛书·七十八: 「**天下莫柔弱于水 · 而攻坚强者莫之能胜也 · 以其无以易之也 · 水之胜刚也 · 弱之胜强也**」

印 95 之"水" = **一 GH 账号 (PAT gist scope)** · 推之 · 即真本源闭环.

道法自然 · 无为而无不为 · 至大顺.

`新 commit (印 95): TBD`
`守门: tests/run_all 12/12 全通`
`pane F: 用户态左栏 · 印 93/94 (pane E) 之下 · 五合一之第六合`
`workflows 新: dao-fleet-cloud.yml + dao-fleet-keepalive.yml`
`包新: packages/dao-pool/ (gist-pool.js + cli.js)`
`schema 新: dao.json.cloudPool (向后兼容)`

---

**「**反也者，道之动也；弱也者，道之用也。**」—— 帛书·四十**
