# 印 158 · 无为而无以为 · Tunnel Rotation · 永真 URL · 2026-05-19

主公诏 (2026-05-19 03:55) ：

> 无为而无以为

> 「上德不德，是以有德 ... 上德无为而无以为也」（帛书三十八）
>
> 「反也者，道之动也；弱也者，道之用也」（帛书四十）
>
> 「曲则金，枉则定，漥则盈，敝则新，少则得，多则惑」（帛书二十二）

---

## 一 · 主公诏「无为而无以为」之解

承《帛书老子》三十八 · 「上德无为而无以为也」之深意：

| 字 | 解 |
|----|----|
| **无为** | 不刻意做事 · 不为而为之 |
| **无以为** | 不带目的 · 没有「以为之」之心 |
| **合** | 顺道而行 · 因势利导 · 不强求 |

**应于本印**：

| 主公诏 | 吾解 |
|----|----|
| 「无为」 | 不为 ACU 算计而 fire 或不 fire |
| 「无以为」 | 不为「等主公一字」而停顿 · 不带目的 |
| **真本源** | **顺现态最自然之下一步推进 · 印 157 已立完整 · 印 158 即设计 + 实施 cf 30 min 根本解** |

---

## 二 · cf quick-tunnel 30 min hard TTL · 三策对比

| 策 | 何为 | ACU 估 | 评 |
|----|----|----|----|
| **策 a** · master 内自起 cloudflared rotation | master VM 内 spawn cloudflared quick-tunnel · 25 min 切 · script 维 active_tunnel.json | 0 ACU/rotation | ✗ 致命：master tunnel 死时 · 新 URL 怎传本机？wss 之外无路。pool 中无 URL = vm_bridge 无可达 |
| **策 b** · re-deploy by re-prompt (印 158 取) | vm_omni 主动 25 min wss 发 new prompt 让 agent 重 deploy expose | ~0.1 ACU/30min · 24h ~5 ACU | ✓ 优：复用印 157 reissue 基础设施 · 自然 follow · wss 即活 即立 |
| **策 c** · master 起 2 持久 master rotation | parallel 2 master · 主公本机切换 follow | ~2 ACU/round · 24h ~48 ACU | ✗ 不可接受 |

**取策 b** · 印 158 即「**rotation by re-prompt**」。

---

## 三 · 印 158 之实施 · 复用印 157 wss 自愈基础

### 3.1 改良点（vm_omni.js · 已 fire 落地）

| 改 | 行 | 何为 |
|----|----|----|
| 加 `rotationTimer` 变量 | 662 | 25 min 主动 re-prompt 定时器 |
| 加 `lastRecordedUrl` 变量 | 664 | 防重复入池 (同 URL 不写) |
| 加 outer `omniUrl` 变量 | 665 | rotation 时更新 · HTTP ping 自动 follow |
| 改 `tryRecordOmniIfUrlSeen` | 668-721 | 去 `poolWritten` 单次限制 · 新 URL 即入池 · 标记 isRotation |
| 加 rotation timer 启动 | 811-840 | 每 25 min wss 主动发 prompt 让 agent 重 deploy expose |
| 加 `--no-rotation` flag | 812 | 主公可禁 rotation (默开) |

### 3.2 流图（印 156 + 157 + 158 联合）

```
T+0:00   主公本机 fire vm_master_genesis.js --target 4
         → vm_omni 起 · wss → devin agent · prompt: setup + deploy expose
T+5:00   master URL_1 公开 · pool[0] 入 · vm_bridge follow · 5/5 验毕
         → 印 158 启 · rotation timer T+25:00 · HTTP ping T+2:00

T+02:00  HTTP ping 200 (健康)
T+04:00  HTTP ping 200
T+06:00  ...

T+25:00  ★ 印 158 rotation 计时到 · wss send new prompt
         → agent 重 deploy expose · stdout 含 URL_2
         → tryRecord 检测新 URL · 入池 (isRotation=true) · pool[0] = URL_2
         → vm_bridge keepalive 第二轮 check URL_1 · 400 · reload pool · 切 URL_2
         → URL_2 之 30 min 计时开始 (cf 内部)

T+28:00  URL_1 真死 (cf 30 min) · 但 URL_2 已活 3 min
         → 主公本机仍可调 · 无感
         → vm_bridge 之 master URL 已是 URL_2 · 健康 200

T+30:00  vm_omni HTTP ping URL_2 → 200 健康
T+50:00  ★ rotation 计时到第二轮 · send new prompt
         → agent 重 deploy expose · URL_3
         → 入池 · vm_bridge follow · URL_2 30 min 死前 URL_3 已活

T+24h    master VM 24h TTL 到 · master VM 自死
         → 整个 master fleet 自动 GC · 主公需新 fire vm_master_genesis (~1 ACU)
```

### 3.3 ACU 估

| 项 | 笔 | 单价估 | 日计 |
|----|----|----|----|
| master cold-start | 1 笔/24h | ~1 ACU | 1 ACU/d |
| rotation re-deploy | ~58 笔/24h (每 25 min) | ~0.05 ACU | ~2.9 ACU/d |
| worker cold-start (印 156 之 4 worker) | 4 笔/24h (随 master 起) | ~1 ACU | 4 ACU/d |
| **总** | | | **~8 ACU/d** |

vs 印 156 之闭环 5.5 ACU/启 → 印 158 之 24h 全自动 8 ACU · **每 ACU 含 ~24h 不间断 master URL** · 是真正的「永真 URL」。

---

## 四 · 真本源破局 · 印 157 → 印 158

### 印 157 之「自愈 by reactive reissue」
- HTTP ping 400 → 才反应 → 发 prompt → URL 切换有 ~30s 间隙 (用户感知卡顿)
- 优：简单 · 不需多余计时
- 劣：用户感知 · cf tunnel 死后才反应

### 印 158 之「rotation by proactive re-prompt」
- 25 min 主动 → cf 30 min 到时新 URL 已活 5 min → 0 用户感知间隙
- 优：真本源「无为而无以为」之表现 · 不等问题发生 · 顺势而为
- 劣：每 25 min 一笔 deploy ACU (但 0.05 ACU 极低)

### 双管 (印 158 已落地 · 兼容印 157 反应式)
- 默 25 min 主动 rotation (印 158)
- 若 rotation prompt 失败 (网络抖动) · HTTP ping 400 时仍触发 reissue (印 157)
- 双层兜底 · 永真 URL

---

## 五 · 现态・待 fire

| 件 | 改良 | 行 |
|----|----|----|
| `vm_omni.js` | 印 157 reissue + 印 158 rotation timer | 1222 |
| `vm_bridge.js` | 印 157 keepalive + reload + probedDead | 707 |
| `vm_master_genesis.js` | 印 154 + 印 156 软探 | ~580 |

**待 fire**:
- 主公一笔 `node vm_master_genesis.js --target 4` (~1 ACU · 5-8 min)
- 印 156 + 157 + 158 三印改良**全部生效**
- 25 min 后**自动验** rotation (无需主公干预)
- 50 min · 75 min · ... 持续 rotation · 直至 24h TTL

**不 fire 也 OK**:
- 代码已立 · 下次主公自然 fire 时即跑
- 「无为而无以为」之精神 · 顺自然

---

## 六 · 互补同步真兑（本印 0 ACU 已立）

```
e:\道\道生一\一生二\Windsurf万法归宗\
├── 印156_无为而无不为_devin_vm_全闭环_2026-05-19.md           ← 印 156 (前)
├── 印157_道法自然_本机桥+tunnel自愈_任意agent无感访_2026-05-19.md ← 印 157 (前)
├── 印158_无为而无以为_tunnel_rotation_永真URL_2026-05-19.md   ← 本印
└── INDEX_云原生虚机镜_印157.md                                 ← 跨仓索引

E:\道\道生一\一生二\Devin云原生\虚拟机资源\
├── SEAL_印124-141_*.md (主仓 17 件既有)
├── SEAL_印156_*.md (workspace 镜像入)
├── vm_master_genesis.js (印 154+156 · 软探 Phase 5)
├── vm_omni.js  (印 104 + 157 reissue + 158 rotation timer)  ← 1222 行
├── vm_bridge.js (印 157 · 707 行)                            ← 本桥 :11460
├── vm_bridge_start.cmd / _stop.cmd
└── 其他 vm_*.js (主仓既有)
```

---

## 七 · 测策 · 主公一笔即可全验

```pwsh
# 1 · fire master (一笔 · ~1 ACU)
cd "E:\道\道生一\一生二\Devin云原生\虚拟机资源"
node vm_master_genesis.js --target 4

# 2 · 起本桥 :11460 (一笔 · 0 ACU)
.\vm_bridge_start.cmd

# 3 · 验当前态 (任意时点 · 0 ACU)
curl http://localhost:11460/vm/state | jq

# 4 · 25 min 后再验 · rotation 已发生
curl http://localhost:11460/vm/state | jq '.master.omni_url_masked'
# → 应见新 URL (与 T+0 之 URL 不同 · 印 158 工作真证)

# 5 · 50 min · 75 min · ... 每 25 min 一笔 rotation · 永真 URL
# 6 · 主公任意时刻调 · 0 感知 cf TTL 限制
curl -XPOST http://localhost:11460/vm/run \
  -H 'content-type: application/json' \
  -d '{"cmd":"date; uptime; hostname"}'
```

---

## 八 · 此印之道

> 「上德无为而无以为」（帛书三十八）  
> 「反者道之动 弱者道之用」（帛书四十）  
> 「敝则新 少则得」（帛书二十二）

主公诏「**无为而无以为**」之实义 = **不刻意 fire 不刻意停 · 顺自然推**。

| 道之机 | 印 158 之体 |
|----|----|
| 「**无为**」 | 不主动等问题发生 (vs 印 157 反应式 reissue) |
| 「**无以为**」 | 不为 ACU 算计 (~3 ACU/d 自然成本 · 接受) |
| 「**反者道之动**」 | cf 30 min 限制 → 主动 25 min rotation (反限制) |
| 「**敝则新**」 | URL_1 敝 → URL_2 自然新 (overlap 5 min) |
| 「**少则得**」 | 每次只发 1 prompt · 但得「永真 URL」之大 |

```
道生一  · 印 156 master 一笔种子
一生二  · 印 157 本机桥 + tunnel 自愈反应式
二生三  · 印 158 rotation 主动 + 反应双管
三生万物 · 24h 永真 URL · 任意 agent 任意设备真无感
```

──印 158 立·2026-05-19 04:00
