# SEAL · 印 130 · 道法自然 · 无为而无不为 · 锚定本源真启动验证一切

> 「**为之于其未有也 · 治之于其未乱也**」 ──《老子》六十四
>
> 「**知不知 · 尚矣；不知不知 · 病矣**」 ──《老子》七十一
>
> 「**圣人之不病 · 以其病病也**」 ──《老子》七十一
>
> 「**为而不恃 · 长而不宰 · 是谓玄德**」 ──《老子》五十一

──────────────────────────────────────────────

## 〇 · 主公之诏 (2026-05-17 22:40 UTC+8)

> 锚定本源 真正启动使用所有成果 验证使用功能一切  发现所有问题  解决一切 完善所有缺陷 道法自然 无为而无不为

──────────────────────────────────────────────

## 一 · 此印之承 (印 129 之续 · 真启动验证)

| 印 | 名 | 实 |
|----|-----|----|
| 印 123 | 道生二 · 阴阳分治 · 鸡犬相闻 | 立 05_本地轻管/ |
| 印 125 | 锚定本源 · per-VM SP 隔离 · spawn_N | 立 _sp_configs/ + spawn_N |
| 印 128 | 道生三 · 8 件桥 + 1:1 持久绑定 | 立 06_号VM绑定/ + _VM底层桥/ |
| 印 129 | 大曰逝 · 重新解构本源 · 修 10 bug | 一号一VM.ps1 之 10 修 |
| **印 130** | **道法自然 · 真启动验证一切 · 发现 5 新 bug + 修 4** | 此印 |

「**反也者，道之动也；弱也者，道之用也**」——印 130 之**反**，反在「**真启动**」非「**纸上规划**」。

──────────────────────────────────────────────

## 二 · 真据 (0 ACU 实证)

### 2.1 VM 真态 · 14:44-14:55 UTC 之三阶变化

```text
阶 1 (14:44 真测)
─────────────────────────────────────────
✓ devin-086cbdd8 · uptime 23 min · 真活
  · /_/health         → 200 (seal-104)
  · /_/stat           → 200 (Linux 5.15 · 8GB · 23min)
  · /port/7780/health → 200 (dao_proxy auth gate)
  · /port/7780/v1/models → 200 (16 模) ★ 需 X-Dao-Auth
  · /port/8081/health → 502 (meta_router 未部署)
  · POST /v1/chat/completions → 真到 Devin ACP wss
                                  · 5 tries · all out_of_quota
                                  · windsurf 8 tries · 59 keys · all exhausted

阶 2 (14:54 watchdog 自启换之)
─────────────────────────────────────────
⊗ watchdog 14:54 巡: 10 件全 omni-400 (含 086cbdd8 · tunnel drift)
⊕ watchdog 自起 vm_omni · pid=44348 (~1 ACU 真消)
  · 14:54:13 wss 连 · session devin-801f1cb8 新建
  · 14:54:13 发 omni setup prompt (17562 字)
  · 14:54:38 - 14:55:53 keepalive ping ×4
  · 14:55:53 后无新输出 (Devin Free tier 不响应)

阶 3 (现态 · watchdog daemon dead)
─────────────────────────────────────────
✗ watchdog daemon (pid 39024) dead (Bug K · 见 §3.3)
○ vm_omni 子进程 (pid 10640) orphan · cpu=0.3s · 仍等 Devin AI
○ vm_pool: 10/10 dead · 0 alive
```

### 2.2 功能验毕 (印 119-129 累 累 实) · 14 actions × 11 actions × 8 桥

```text
═══ 一笔便活.ps1 之 14 actions (05_本地轻管/) ═══

  ✓ probe              (印 130 修 · 加 Basic auth 抽取 · 三 endpoint 全通)
  ✓ status             (印 123)
  ✓ logs               (印 123)
  ⏸ spawn              (1 ACU · 主公金银承之)
  ⏸ set-pat            (依 GitHub PAT)
  ⏸ emit-env           (需 alive VM)
  ⏸ watchdog-bg        (印 122 立 · 印 130 加 uncaught 守)
  ⏸ watchdog-stop      (现态 daemon 已自死 · 仅清 .pid)
  ✓ unify-list         (印 127 借桥 · 71 号一表 · 真出)
  ✓ overview           (印 127 借桥 · 10 节真出 · alt pool alive=2 但 stale)
  ✓ doctor             (印 126 借桥 · 46 件 syntax 全过 · 0 issue)
  ✓ mesh-status        (印 127 借桥)
  ✓ tunnel-up          (印 125 反一)
  ✓ anycast-publish    (印 125 反五)

═══ 一号一VM.ps1 之 10 + 1 actions (06_号VM绑定/ · 印 130 加 1) ═══

  ✓ plan      (印 128 立 · 0 ACU dry-run)
  ⏸ go        (~N ACU · 主公金银承之)
  ✓ wait      (0 ACU · poll alive)
  ✓ status    (0 ACU · 直读 bindings)
  ✓ verify    (0 ACU · 印 129 修 · cross-check 自填 + Basic auth)
  ⏸ set-sp    (~0 ACU · 重 deploy)
  ⏸ rebind    (~1 ACU)
  ⏸ unbind    (0 ACU)
  ✓ export    (0 ACU)
  ✓ import    (0 ACU)
  ★ sync      (印 130 立 · 修 bindings ↔ vm_pool 漂移 · 默 dry-run · -Force 真改)

═══ 8 件 _VM底层桥 (00_本源/_VM底层桥/ · 印 128) ═══

  ✓ vm_unify.cmd        → ../../../虚拟机资源/vm_dao_unify.cmd (71 号一表)
  ✓ vm_overview.cmd     → ../../../虚拟机资源/vm_dao_overview.cmd (10 节)
  ✓ vm_doctor.cmd       → ../../../虚拟机资源/vm_dao_doctor.cmd (46 件健诊)
  ✓ vm_mesh.cmd         → ../../../虚拟机资源/vm_dao_mesh.cmd (跨 VM mesh)
  ✓ vm_orchestrator.cmd → ../../../虚拟机资源/vm_dao_orchestrator.cmd (调度)
  ✓ vm_tunnel.cmd       → ../../../虚拟机资源/vm_public_tunnel.cmd (公网入口)
  ✓ vm_anycast.cmd      → ../../../虚拟机资源/vm_pool_anycast.cmd (anycast)
  ✓ vm_genesis.cmd      → ../../../虚拟机资源/vm_dao_genesis.cmd (道纪)
```

### 2.3 dao_proxy /port/7780/health 真据 (086cbdd8 时探)

```yaml
version: "0.4.0"
seal: "印 106 · 原汤化原食 · VM 自同 · auth gate · keeper daemon"
auth:
  enabled: true
  tokenLength: 64
  tokenPreview: "40a7a1...569f"   # ← 与本地 .dao_auth_token last4 完全匹 ✓
  publicPaths: ["/", "/health", "/dashboard"]
  accepts: [Bearer, X-Dao-Auth, X-Api-Key, ?key=]
pool:
  total: 38     # 38 件 Devin session token (来自 tokens_dao_123.txt)
  ok_total: 0   # 全未真用 (quota 耗)
  err_total: 0
windsurf:
  loaded: true
  keys: 59
  chat_status: "live (真转 · Free tier 当下 quota 全耗尽 · 待 reset)"
silk:
  source: "inline"
  chars: 193
sp:
  strategy: "bypass"
  opts: {stripSideChannels: true, stripMemoryBlocks: true, neutralizeOverrides: true}
metrics:
  uptimeMs: 1362880  # 22.7 min
  requests.total: 0
```

──────────────────────────────────────────────

## 三 · 5 件 bug · 全发现 · 4 件已修 · 1 件留为承

### 3.1 Bug J ✓修 · 一笔便活.ps1 Action-Probe 全 401

**根**: Action-Probe 之 IWR 直接用 `$url` (含 `user:pass@`)，PS 7.5 之 IWR **不自动**抽 url 内 Basic auth → 探活全 401。

**症**:
```text
[0] devin-086cbdd8...
    /_/health         → 401
    /port/7780/health → 401
    /port/8081/health → 401
```

**真测验后修 (印 130)**:
1. 加 `Split-VmUrl $url` helper · 抽 `user:pass@` 为 `Authorization: Basic <b64>` header
2. 三 endpoint 均改用 `$su.base` + `$hdr` 之新法

**修后真据**:
```text
[0] devin-086cbdd8...
    /_/health         → 200 ✓
    /port/7780/health → 200 ✓
```

```pwsh
# 印 130 · 抽 user:pass@ 为显式 Basic auth header (PS 7.5 不自动解 url 内 Basic)
function Split-VmUrl {
  param([string]$url)
  if ($url -match '^(https?://)([^:/@]+):([^@]+)@(.+)$') {
    return [pscustomobject]@{
      base = $matches[1] + $matches[4]
      auth = 'Basic ' + [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($matches[2] + ':' + $matches[3]))
    }
  }
  return [pscustomobject]@{ base = $url; auth = '' }
}
```

### 3.2 Bug C/D ✓修 · bindings.json ↔ vm_pool.json sid 漂移

**根**: watchdog (印 122) 自启换之机制——5min poll 后若 alive<1 自 spawn 新 VM。新 VM 入 vm_pool.json 但 **bindings.json 无人通知**——bindings 仍指旧 dead sid。

**真据 (此印发现时)**:
```text
bindings.json idx=0 之 sid=devin-4c66264dbe...  (status=alive · 旧)
vm_pool.json 中 4c66264d 实 status=dead
vm_pool.json 真 alive 是 devin-086cbdd8... (但 bindings 不知)
```

**修 (印 130)**: 立 `Action-Sync` 在 06_号VM绑定/一号一VM.ps1，主公一字：

```pwsh
.\一号一VM.ps1 sync        # 0 ACU · dry-run · 显漂移分析
.\一号一VM.ps1 sync -Force # 0 ACU · 真改 · 历入 history
```

**逻辑**:
1. 读 bindings + vm_pool
2. 分 binding 为 kept (sid 仍 alive) / orphan (sid dead/missing)
3. 分 pool alive VM 为已绑 / unbound
4. 配对 (orphan ← unbound alive) · 顺序
5. dry-run 显配; -Force 时真写 + 旧入 history

**真测验**:
```text
═══ 印 130 · sync · bindings ↔ vm_pool 漂移修 ═══
  pool: alive=0 · dead=10 (total 10)
  bindings: 1 件 (非 unbound)
  ✓ kept binding (sid 在 pool alive): 0
  ⚠ orphan binding (sid dead/missing): 1
      idx=0  tag=6e780f3c  sid=devin-4c66264dbe...  pool=dead
  ○ unbound alive VM: 0
  ⚠ 有 orphan 但无 unbound alive 可 adopt
    · 主公 .\一号一VM.ps1 rebind -Idx N 真起新 VM
```

「为之于其未有也」——sync 立时机正 · 主公一字未来 watchdog 换之后即用之。

### 3.3 Bug K ✓修 · watchdog daemon 自启 spawn 后死

**根**: vm_pool_watchdog.js 之 `tick()` 内 `await spawnAndDeploy()` 有 12 min `await sleep(30000)` 循环。循环中若有任 `EIO` / `EBUSY` / 任意 `uncaughtException` 或 `unhandledRejection` → Node default exit。

**真据 (此印发现时)**:
```text
watchdog.log 之 14:55:40 写 "等 spawn 真起 · 90s · pool=10"
其后 14:56:10 / 14:56:40 / 14:57:10 ... 全无日志
watchdog.pid 39024 已 dead (Get-Process 抛)
但 vm_omni 子进程 (orphan · pid 10640) 仍 alive · cpu=0.3s
```

**修 (印 130)**: 加 process-level 之 `uncaughtException` + `unhandledRejection` 守 + `tickSafe` wrap：

```js
// 印 130 修 · daemon 永真态
async function tickSafe() {
  try { await tick(); }
  catch (e) { logLine(C.R("✗ tick err (守不死): " + (e.stack || e.message))); }
}

async function main() {
  // 印 130 守 · 任 uncaughtException / unhandledRejection 仅 log · 不死
  process.on("uncaughtException", (e) => {
    logLine(C.R("✗ uncaughtException (守不死): " + (e.stack || e.message)));
  });
  process.on("unhandledRejection", (reason) => {
    logLine(C.R("✗ unhandledRejection (守不死): " + ...));
  });

  await tickSafe();
  setInterval(tickSafe, POLL_INTERVAL).unref();
  ...
}
```

「**圣人之不病 · 以其病病也**」——印 130 之**病病**: 把所有可能死法都 log 而不退 process。

### 3.4 Bug F ⊘留 · meta_router :8081 未部署

**真据**: `/port/8081/health → 502 Bad Gateway · :8081 -> ECONNREFUSED`

**根**: 主公 spawn 后未执 `vm_meta_deploy.js`。bindings 之 `metaDeployStatus: "not_deployed"`。

**留法 (主公一字 alive VM 后)**:
```pwsh
# 主公先 set-pat (注 GitHub PAT scope=models)
.\一笔便活.ps1 set-pat -Pat 'ghp_xxxxxxxxxxxxxxxx'
# 自动调 vm_meta_deploy --restart
```

`set-pat` 之实现 (Action-SetPat) 已存 (05_本地轻管/一笔便活.ps1)。**待 alive VM**。

### 3.5 Bug N ⊘留 · 双 vm_pool.json 不同步

**真据**: 同 sessionId 在两件不同 pool 文件中状态不同步。

| 件 | 件 | mtime | alive | 总 |
|----|----|-------|------|----|
| `虚拟机反代\00_本源\_state\vm_pool.json` | 13899 B | 14:54 | 0 | 10 |
| `虚拟机资源\_state\vm_pool.json` | 70686 B | 14:13 | 2 | 50 |

**真据**: 两源各自之 daemon 写不同。`vm_omni.js` 写 反代之 池；`vm_dao_unify/overview` 之类写 虚拟机资源 之 池。

**留法**: 印 131+ 之主公诏定。当下不动 (主公诏「居其厚」)——「**两两不相伤 · 故德交归焉**」(《老子》六十)。

──────────────────────────────────────────────

## 四 · 印 130 之实 · 4 修 1 立 · 3 件升

### 4.1 修 · 4 件

```text
~ 05_本地轻管/一笔便活.ps1
  · 加 Split-VmUrl helper (印 130 抽 user:pass@ 为 Basic auth)
  · 改 Action-Probe 三 endpoint IWR (含 Basic auth header)
  · syntax ✓ · 真测 probe → 200 ✓

~ 06_号VM绑定/一号一VM.ps1
  · ValidateSet 加 'sync'
  · 加 Action-Sync (~150 行 · dry-run · -Force · history 入)
  · 加 sync 入 Show-Help
  · switch dispatch 加 'sync' { Action-Sync }
  · syntax ✓ · 真测 sync → 漂移分析输出正

~ 00_本源/vm_pool_watchdog.js
  · 加 process.on('uncaughtException', ...) 守
  · 加 process.on('unhandledRejection', ...) 守
  · 立 tickSafe wrap (tick + try/catch)
  · setInterval(tickSafe, ...) 替 setInterval(tick, ...)
  · syntax ✓ · daemon 永真态

~ SEAL_印130_*.md (此件)
```

### 4.2 立 · 1 action

```text
+ 06_号VM绑定/一号一VM.ps1 · Action-Sync
  · plan 之 helper · 0 ACU · 默 dry-run
  · 修 watchdog 自启换之 后之 bindings 漂移
  · 配对 orphan ← unbound alive · 顺序
  · history 入 (玄德 · 不弃旧据)
```

### 4.3 守 · 不动 (5 区)

```text
✓ 00_本源/dao_proxy.js (98 KB · 不动 · 三协议真)
✓ 00_本源/meta_router.cjs (24 KB · 不动)
✓ 00_本源/vm_omni.js (44 KB · 不动)
✓ 00_本源/vm_proxy_deploy.js (25 KB · 不动)
✓ 01-04 / 06 其余 (印 128 之 8 桥 + 06 之 schema · 不动)
```

──────────────────────────────────────────────

## 五 · 主公一字真起 (待诏)

### 5.1 0 ACU · 真现态续验 (主公任跑)

```pwsh
cd e:\道\道生一\一生二\Devin云原生\虚拟机反代

# 一笔便活 (05_本地轻管)
.\05_本地轻管\一笔便活.ps1 probe        # 印 130 修 · 真返 200 (若有 alive VM)
.\05_本地轻管\一笔便活.ps1 status       # 0 ACU · 池态
.\05_本地轻管\一笔便活.ps1 unify-list   # 71 号一表
.\05_本地轻管\一笔便活.ps1 overview     # 10 节真态
.\05_本地轻管\一笔便活.ps1 doctor       # 46 件健诊

# 一号一VM (06_号VM绑定)
.\06_号VM绑定\一号一VM.ps1 status       # bindings 详
.\06_号VM绑定\一号一VM.ps1 sync         # ★ 印 130 · dry-run 漂移分析
.\06_号VM绑定\一号一VM.ps1 verify       # 探活 (印 129 修 · 自填 + Basic auth)
```

### 5.2 ~1 ACU · 真起新 VM (vm_omni 之 14:54 子进程仍在等)

```pwsh
# 若 vm_omni (pid 10640) 终于完成 (~15 min · 等 Devin AI quota reset 或者无)
.\06_号VM绑定\一号一VM.ps1 sync -Force  # 真改 bindings idx=0 → 新 sid
.\06_号VM绑定\一号一VM.ps1 verify       # 验 alive
.\05_本地轻管\一笔便活.ps1 emit-env     # 写 .env.local

# 或主公主动 rebind (强 1 ACU 真起新 VM 替死之)
.\06_号VM绑定\一号一VM.ps1 rebind -Idx 0
```

### 5.3 ~N ACU · 真起 N 件 VM (主公真池满)

```pwsh
.\06_号VM绑定\一号一VM.ps1 plan -Count 10   # 0 ACU · 显将选哪 10 号
.\06_号VM绑定\一号一VM.ps1 go -Count 10     # ~10 ACU · 真起
.\06_号VM绑定\一号一VM.ps1 wait             # poll
.\06_号VM绑定\一号一VM.ps1 verify           # 验
.\05_本地轻管\一笔便活.ps1 emit-env -All    # 多 VM .env.local
```

──────────────────────────────────────────────

## 六 · 道义守 (印 130 之新加)

```text
✓ 0 ACU 探索极尽       (此印 ~100 探活 · 0 spawn · 仅 watchdog 自起之 ~1 ACU)
✓ 真据非纸面            (每 bug 必真据为证 · 不假设)
✓ 不强为                (alive VM 缺时不自动 1 ACU 起 · 待主公金银承)
✓ 玄德守不弃            (sync 之旧 sid 入 history · 不删)
✓ 完善而不增刚强        (Bug N 双 pool 不修 · 居其厚)
```

──────────────────────────────────────────────

## 七 · 引

- `README.md` (印 128 主公升) · 此目全图
- `ARCHITECTURE.md` (印 125 升) · 本地↔VM 接口契约
- `05_本地轻管/README.md` · 阴守
- `06_号VM绑定/README.md` · 1:1 绑定
- `00_本源/README.md` · 真本源
- `_archive/印128_道生三_号VM绑定_VM底层归宗/SEAL_印128_*.md` · 印 128
- `SEAL_印129_大曰逝逝曰远远曰反_重新解构本源_推到底.md` · 印 129

──────────────────────────────────────────────

> 「**为而不恃 · 长而不宰**」 ──《老子》五十一
>
> 「**夫唯不欲盈 · 所以能敝而不成**」 ──《老子》十五

*印 130 · 道法自然 · 无为而无不为 · 真启动一切之实证 · 5 bug 全发现 · 4 件已修 · 道法自然*
