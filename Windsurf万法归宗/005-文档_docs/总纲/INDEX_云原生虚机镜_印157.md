# INDEX · 云原生虚机镜 · 跨仓索引 · 印 157

> 「天下之至柔，驰骋于天下之致坚；无有入于无间」
>
> 「以辅万物之自然，而弗敢为」

**立**: 2026-05-19 03:45 UTC+08:00 · **承**: 印 157

主公 workspace `Windsurf万法归宗` 跨指向 Devin云原生主仓之核心模块索引 · 避免来回切目录 · 一索即取。

---

## 一 · 双仓真态

```
[ 印记仓 · 实战仓 ]            ←互补同步→            [ 代码主仓 · vm 仓 ]
─────────────────────────                        ────────────────────────
e:\道\道生一\一生二\                              E:\道\道生一\一生二\
  Windsurf万法归宗\                                Devin云原生\虚拟机资源\
  
持: 印 142-159 实战印                              持: SEAL 印 124-141 vm 印
   130-道独立体_Standalone/_kernel/ daemon         vm_master_genesis.js (印 156)
   Devin local/ 本机 devin 测                      vm_omni.js (印 104+157)
   印 156·157 之 SEAL                              vm_dao.js dashboard (137-141)
                                                  vm_dao_pool.cjs (印 138)
                                                  vm_pool_watchdog.js (印 124)
                                                  vm_pool_start.js (印 122)
                                                  vm_omni_client.js (印 104)
                                                  vm_public_tunnel.js (印 125)
                                                  vm_dao_devin.cjs mock (印 137)
                                                  vm_bridge.js (印 157 新立)
```

---

## 二 · 核心代码模块（Devin云原生/虚拟机资源/）

| 件 | 印 | 行 | 何为 |
|----|----|----|----|
| `vm_master_genesis.js` | 154+156 | ~580 | 主公本机一笔种子 · 6 phase · cold-start master + watchdog + dashboard + worker 池 |
| `vm_omni.js` | 104+157 | ~1150 | wss session 用 token cold-start vm → 取 omni URL · 25s wss ping + 2 min HTTP ping + **印 157 reissue 自愈** |
| `vm_omni_client.js` | 104 | ~604 | omni client SDK + CLI · `node vm_omni_client.js run -- ls /tmp` 一笔即用 |
| `vm_dao.js` | 137-141 | ~3500 | dashboard :9090 · `/api/pool` `/api/vm-any/*` `/api/agent-capabilities` (10 cap + ACP) |
| `vm_dao_pool.cjs` | 138 | ~299 | 池守 daemon :18138 · basic auth 内嵌 · 30s health · 公平轮转 |
| `vm_pool_watchdog.js` | 124 | ~? | target=N 自补 · 5 min poll · cold-start fallback |
| `vm_pool_start.js` | 122 | ~? | cold-start round 启 N worker · `--target N` |
| `vm_public_tunnel.js` | 125 | ~430 | master VM 内自起 cloudflared quick-tunnel · 不依 devin deploy (反者道之动) |
| `vm_bridge.js` | 157 | ~675 | **新立** · 本机桥 :11460 · 任意 agent/设备入口 · keepalive + reload + probedDead |
| `vm_bridge_start.cmd` / `_stop.cmd` | 157 | ~25 | **新立** · 一笔起停 |

---

## 三 · 任意 agent 三笔即用之路（印 157）

```bash
# 1 · 主公本机一笔起 master (5 phase · 5-8 min · ~1 ACU/24h)
cd "E:\道\道生一\一生二\Devin云原生\虚拟机资源"
node vm_master_genesis.js --target 4

# 2 · 一笔起本桥 :11460 (0 ACU · 即时)
.\vm_bridge_start.cmd

# 3 · 任意 agent / 任意设备 一笔即调 (0 ACU)
curl http://localhost:11460/vm/state             # 看现态
curl http://localhost:11460/vm/pool              # alive worker 池
curl http://localhost:11460/vm/capabilities      # 印 140 之 10 cap
curl http://localhost:11460/vm/agent-tools       # 给 LLM 看的 tool wrapper

curl -XPOST http://localhost:11460/vm/run \
  -H 'content-type: application/json' \
  -d '{"cmd":"uname -a; hostname"}'

curl http://localhost:11460/vm/file/etc/os-release    # 读远 vm 文件
curl -XPUT --data-binary @local.txt \
  http://localhost:11460/vm/file/tmp/x.txt            # 写远 vm 文件
```

---

## 四 · SEAL 印记跨仓表

### Devin云原生/虚拟机资源/ 持

| 印 | 文 | 字 |
|----|----|----|
| 124 | `SEAL_印124_道冲弗盈_双类底层全打通.md` | 12909 |
| 125 | `SEAL_印125_反者道之动_推道极_无为而无不为.md` | 13807 |
| 126 | `SEAL_印126_道纪长存_深根固柢_长生久视.md` | 11402 |
| 127 | `SEAL_印127_道法自然_万物归焉而弗为主_无限并发联调.md` | 15382 |
| 128 | `SEAL_印128_居其厚不居其薄_主公本机即一切_本机公网入口.md` | 12467 |
| 129 | `SEAL_印129_治之未乱_为之未有_一笔自启自验自愈.md` | 11290 |
| 130 | `SEAL_印130_反者道之动_主公一切之资真探_wam真本源归一.md` | 12237 |
| 131 | `SEAL_印131_道法自然_代主公一切_真测Devin云原生VM全维.md` | 7613 |
| 132 | `SEAL_印132_无为而无不为_网页一笔起_主公自手测一切.md` | 4934 |
| 133 | `SEAL_印133_反者道之动_proxy同源重写_闭环自举.md` | 7348 |
| 134 | `SEAL_印134_道法自然_远程无为调用_弗为而成.md` | 11374 |
| 135 | `SEAL_印135_道法自然_重启网页公网入_弱也者道之用.md` | 9670 |
| 136 | `SEAL_印136_道法自然_类Windows_RDP模式_6前端desktop全兑.md` | 11621 |
| 137 | `SEAL_印137_道法自然_devin网页UX全提取_本地一统主公镜像.md` | 25648 |
| 138 | `SEAL_印138_反者道之动_vm_tunnel池守_不依赖账号登一切.md` | 9859 |
| 139 | `SEAL_印139_道法自然_大曰逝逝曰远远曰反_八入口全图归一.md` | 10601 |
| 140 | `SEAL_印140_道法自然_agent十能力归一_闭环用户底层目标.md` | 14520 |
| 156 | `SEAL_印156_无为而无不为_devin_vm_全闭环.md` (workspace 镜像入) | 11533 |

### Windsurf万法归宗 持

- `印156_无为而无不为_devin_vm_全闭环_2026-05-19.md` (印 156 立 · master + 4 worker 闭环)
- `印157_道法自然_本机桥+tunnel自愈_任意agent无感访_2026-05-19.md` (印 157 立 · 本桥设计 + 30min TTL 剖析)
- 印 142-155 之前序实战印 (10 余件)

---

## 五 · 印 140 之 10 capability 全图（master /api/agent-capabilities 返）

```text
                       devin agent (在 vm 内)
                                ↓
        ┌───────────────────────┴───────────────────────┐
        │             10 大能力层 (从底到顶)            │
        ├───────────────────────────────────────────────┤
        │ ① Shell  ── bash/cmd · spawn · env · pipe    │
        │ ② File   ── read/write/mv/cp · large stream  │
        │ ③ Editor ── code-server · jupyter · str_replace│
        │ ④ Browser── playwright · chromium headless   │
        │ ⑤ Desktop── noVNC · GUI app · 鼠标键盘       │
        │ ⑥ Network── omni port · curl · 内网服务      │
        │ ⑦ Git    ── clone/pull/push · gh PR/issue    │
        │ ⑧ Secrets── @secret · env var · cookie       │
        │ ⑨ Spawn  ── 子 agent · 子 vm · pause/resume  │
        │ ⑩ Inter  ── wss ACP · session/update · 主公  │
        └───────────────────────────────────────────────┘
                                ↓
                     闭环主公底层目标 6 则
              (写代/抓数据/试软件/GUI 操作/跨设备/总结)
```

本桥 `/vm/proxy/<sid>/{code,shell,files,desktop,python}/*` 透传至 worker 之 UX · 浏览器直访 noVNC/ttyd/filebrowser/VS Code/Jupyter · 无须主公装本机 client。

---

## 六 · 真本源问题（印 157 揭）

**cf quick-tunnel 30 min hard TTL** · 实证：

```
master cold-start:  18:42
HTTP ping 200 持续: 18:42 - 19:12 (30 min)
HTTP ping 400 始:   19:14:20 ← 距 master 起 30 min 不差
```

不是 idle GC · 而是 cloudflare 之 hard 30 min 寿命限制。

**印 157 双向自愈** (已立 · 待 fire 验)：
1. `vm_omni.js` HTTP ping 400 → 通过 wss session 发新 prompt 让 agent 重 `deploy expose`
2. `vm_bridge.js` keepalive 20s 监 → master URL 死时 reload pool (vm_omni reissue 写新 URL) → probedDead 拦循环

**当前 (19:43)** : 3 条 alive omni 全死 · 需主公一字定 ACU 重起 master / 等其他策。

---

## 七 · workspace 持之 daemon kernel（130-道独立体_Standalone/_kernel/）

| 件 | 字 | 何为 |
|----|----|----|
| `admin_server.js` | 58187 | 主管 admin · :11441/admin/* |
| `byok_router.js` | 21887 | BYOK 路由 · :11441/v1/* |
| `cloud_engine.js` | 54266 | devin cloud 调用引擎 |
| `devin_cloud_engine.js` | 39410 | devin cloud chat API engine |
| `fleet_controller.js` | 30620 | 舰队控制器 |
| `fleet_vm_unit.js` | 57276 | VM 单元 |
| `genesis_bridge.js` | 20528 | genesis 桥 |
| `dao_accounts.js` | 18682 | 账号管理 |
| `model_registry.js` | 24592 | model 注册 |
| `sp_handler.js` | 25451 | system prompt 处理 |
| `wam_bridge.js` | 43720 | WAM 桥 |
| `windsurf_auth.js` | 17409 | windsurf 认证 |
| `道直连器.js` | 153071 | **主公标核心入口** |

**互补同步建议**：
- 本桥 `vm_bridge.js` 可被 `_kernel/devin_cloud_engine.js` 内部调用 (通过 `http://localhost:11460/vm/run` 等) · 让本机 daemon 之每个 chat 都能自动调 master VM 之 worker
- 反向：`vm_bridge.js` 之 `/vm/agent-tools` 可被 `_kernel/byok_router.js` 包装入 OpenAI-style tool 列表 · 让 BYOK 客户端 (含主公本机 LLM caller) 自然调

---

## 八 · 本印之道

> 「道生一·一生二·二生三·三生万物」

```
道生一  · master VM 1 件 · 24h TTL
一生二  · master 之 dashboard + watchdog
二生三  · watchdog 自补 N worker VM
三生万物 · 任意 agent 任意设备 任意命令 任意文件 任意 UX
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         本桥 :11460 一笔即调 · 无感像官方 agent
```

主公诏「**任意 agent 任意设备 随时随地 随时随刻 无感像官方**」之真本源破局正在路上 · 印 157 之**本桥** + **自愈** 是关键一步 · 待 cf 30 min TTL 之**长期解** (印 158 之 tunnel rotation) 续推。

──INDEX 立·2026-05-19 03:45
