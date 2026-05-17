# 06 · 号VM绑定 · 印 128 · 一 Windsurf 账号 一虚拟机

> 「**圣人执一，以为天下牧**」 ──《老子》二十二
>
> 「**善建者不拔，善抱者不脱，子孙以祭祀不绝**」 ──《老子》五十四
>
> 「**深根固柢，长生久视之道也**」 ──《老子》五十九

──────────────────────────────────────────────

## 〇 · 此目之意 · 1:1 绑定持久化

主公诏：「**实现一 windsurf 账号一虚拟机**」

**真意之实** —— 不只是"起 N VM 各号一件"（spawn_N.ps1 已实），而是**持久化的 1:1 绑定关系**：

```text
                  ~/.dao/accounts.json  +  ~/.wam/wam-state.json
                     71 号 windsurf 之大同盟 (印 127 unify)
                                  │
                                  ▼ pick --count N --status fresh
                          ┌───────────────────┐
                          │  N 个 fresh 号    │
                          │  email/tag/token  │
                          └─────────┬─────────┘
                                    │
                             ┌──────┴──────┐
                             │  一号一VM.ps1 │
                             │   (此目)      │
                             └──────┬──────┘
                                    │
                                    ▼ 一号严格对应一 VM
                          ┌───────────────────────────┐
                          │  bindings.json (持久化)   │
                          │  · 号 ↔ VM session ↔ tunnel│
                          │  · spawnedAt / ttlExpire  │
                          │  · spStrategy             │
                          │  · status alive/dead/...  │
                          └───────────┬───────────────┘
                                      │
                ┌─────────────────────┼─────────────────────┐
                ▼                     ▼                     ▼
          号 c7d9bf15            号 a1b2c3d4            号 ...
          → VM idx 0             → VM idx 1            → VM idx N
            (sessionId 唯一)       (sessionId 唯一)        ...
            tunnel URL 唯一        tunnel URL 唯一
            dao_proxy 真活          dao_proxy 真活
                ↓                     ↓
          windsurf 池 cascade   windsurf 池 cascade
          + devin 池 cortex      + devin 池 cortex
          (各 VM 独立 SP 态)     (各 VM 独立 SP 态)
```

**与 spawn_N.ps1 之分**:

| 维度 | spawn_N.ps1 (印 125) | 一号一VM.ps1 (印 128 · 此目) |
|------|---------------------|---------------------------|
| 用途 | 任 N 并发 · 推到极 (Count 64 等) | **1:1 严格绑定** · 主公买 1 号即起 1 VM |
| 输入 | `tokens_dao_123.txt` (任行) | `vm_unify.cmd pick --status fresh` (真活号) |
| 持久化 | `_state/spawn_N_state.json` (临时) | `06_号VM绑定/bindings.json` (主公真据) |
| 重起 | 每次 spawn 即新 (无关联) | 同号只起 1 VM · 已有则探活/续 (idempotent) |
| 解绑 | 无概念 (jobs 完即弃) | 显 `unbind` action · 留 record (守玄德) |
| SP 态 | round-robin 7 sample | 主公自配每号 SP (bindings.json 持久) |
| 反代 | 用于试验/压测 | **用于生产** · 长跑 |

──────────────────────────────────────────────

## 一 · 三件 (此目)

```text
06_号VM绑定/
├── README.md            ← 此文 · 印 128 · 总图
├── 绑定法.md            ★ schema + 持久化 + 故障恢复 + 道义守
├── 一号一VM.ps1         ★ 主公一字 · 选 N 号 + 起 N VM + 持久绑定
├── bindings.json.sample ← schema 样本 (主公复 → bindings.json)
└── bindings.json        ← 真活之持久绑定表 (主公本机生 · git ignore)
```

──────────────────────────────────────────────

## 二 · 主公一日 (典型)

```pwsh
cd v:\道\道生一\一生二\Devin云原生\虚拟机反代\06_号VM绑定

# ─ ① 看现状 (主公已绑定几件) ─
.\一号一VM.ps1 status

# ─ ② 看号源大同盟之 fresh 数 (印 127 借桥) ─
..\00_本源\_VM底层桥\vm_unify.cmd list --status fresh

# ─ ③ 计 (0 ACU · 看会选哪 N 号) ─
.\一号一VM.ps1 plan -Count 4

# ─ ④ 真起 (4 ACU · ~10 min) ─
.\一号一VM.ps1 go -Count 4

# ─ ⑤ 等齐起 (~10 min · poll) ─
.\一号一VM.ps1 wait

# ─ ⑥ 验各绑定 (探 /health) ─
.\一号一VM.ps1 verify

# ─ ⑦ 主公自配某号之 SP 态 ─
.\一号一VM.ps1 set-sp -Idx 0 -SpStrategy dao -SpDaoChapter 22

# ─ ⑧ 某号之 VM 死 (24h TTL 过) → 重起新 VM 续绑 ─
.\一号一VM.ps1 rebind -Idx 0

# ─ ⑨ 主公主动解绑 (留 record · 守玄德) ─
.\一号一VM.ps1 unbind -Idx 0

# ─ ⑩ 导出 bindings.json (主公备份) ─
.\一号一VM.ps1 export > bindings_backup_$(Get-Date -Format yyyyMMdd).json
```

──────────────────────────────────────────────

## 三 · 与上层之契

```text
                       06_号VM绑定/  (此目)
                       一号一VM.ps1
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
     00_本源/_VM底层桥/                00_本源/
     · vm_unify.cmd                   · vm_omni.js  (起 VM)
       (取 fresh 号源)                 · vm_proxy_deploy.js (装 dao_proxy)
                                       · vm_pool_watchdog.js (守活)
              │                               │
              └───────────────┬───────────────┘
                              ▼
                 00_本源/_state/vm_pool.json
                 + 06_号VM绑定/bindings.json
                 (二表互验 · 真据交叉)
                              │
                              ▼
              ┌───────────────────────────────┐
              │  Devin Cloud VM 池 (N alive)   │
              │  各持 dao_proxy 真活           │
              │  各 SP 隔离 · 独立 telemetry   │
              └───────────────────────────────┘
                              │
                              ▼
              05_本地轻管/一笔便活.ps1
              (主公本地客端 · 消费)
```

──────────────────────────────────────────────

## 四 · 道义守 (一无破)

```text
✓ 不偷 token · 仅本机本用户读 · auth gate 守 · 不出 VM
✓ 不绕 ACU   · 1 ACU/号/24h · 真消计费 · 不复用 session 跨号
✓ 不破 SLA   · 一号最多 1 alive VM 在 24h 内 · idempotent
✓ 不污 telemetry · spawn 走真本源协议 (vm_omni 之 wss)
✓ 守玄德     · unbind 不删 record · 留主公自决 (帛书五十一)
✓ 道并行     · bindings.json 与 vm_pool.json 不互依 · 各自然
✓ 鸡犬相闻   · 此目调 _VM底层桥/vm_unify · 不犯虚拟机资源独立
```

──────────────────────────────────────────────

## 五 · 印传

| 印 | 立 | 件位 |
|----|----|-----|
| 印 125 (2026-05-17) | spawn_N.ps1 任 N 并发 (推到极 · 64 件) | `05_本地轻管/spawn_N.ps1` |
| 印 127 (2026-05-17) | vm_dao_unify · 71 号大同盟 (三源合一) | `虚拟机资源/vm_dao_unify.{js,cmd}` |
| **印 128 · 此目** | **1:1 持久化绑定 · 一号一 VM · bindings.json** | `06_号VM绑定/` (此目) |

──────────────────────────────────────────────

> 「**善建者不拔，善抱者不脱**」 ──《老子》五十四
>
> 一号一 VM 之绑定 · 善建善抱 · 持久化 · 子孙以祭祀不绝

*印 128 · 道生三 · 一 windsurf 账号一虚拟机 · bindings.json 持久 · 鸡犬相闻*
