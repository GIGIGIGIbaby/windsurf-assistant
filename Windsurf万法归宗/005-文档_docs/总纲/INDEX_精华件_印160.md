# INDEX · 精华件清单 · 去芜存菁 · 印 160

> 「**为学者日益，闻道者日损。损之又损，以至于无为，无为而无不为**」（帛书四十八）
>
> 「**信言不美，美言不信；知者不博，博者不知；善者不多，多者不善**」（帛书八十一）
>
> 「**反也者，道之动也；弱也者，道之用也**」（帛书四十）

**立**: 2026-05-19 10:15 UTC+08:00 · **承**: 印 156-159 实战盘点

---

## 一 · Devin云原生/虚拟机资源 · 件清单态

### 1.1 总数 + 分布

```
总件数:                  130+
精华件 (印 156-160):       10 件 ~358 KB
冗余件:                  88 件 ~665 KB  (vm_dao_* · vm_avd_* · vm_kvm_* · 老 vm_* · .bak)
SEAL 印记:                17 件 ~217 KB  (印 124-141 + 156)
辅助 (qqyc / probe / e2e): 13 件 ~120 KB
```

### 1.2 精华件 · 印 156-160 真本源

| 件 | 行 | KB | 印 | 何为 | 现态 |
|----|----|----|----|----|----|
| `vm_omni.js` | 1222 | 47 | 104+157+158 | 单 vm cold-start · wss + keepalive + rotation timer | ✓ 含 L811-836 印 158 rotation |
| `vm_omni_client.js` | 604 | 18 | 104 | omni client SDK + CLI | ✓ |
| `vm_master_genesis.js` | ~580 | 28 | 154+156 | 主公本机种子 · 6 phase 全部署 | ⚠ 旧 fire 时本机 vm_omni 老版 |
| `vm_genesis_lite.js` | ~210 | ~7 | **160 新立** | **简化 fire · 单 vm · ~1 ACU · 直 vm_omni detached** | ✓ 立成 |
| `vm_dao.js` | ~3500 | 138 | 137-141 | dashboard :9090 · /api/pool · /api/vm-any · 10 cap | ✓ |
| `vm_dao_pool.cjs` | 299 | 14 | 138 | pool daemon :18138 · 30s 健康 | ✓ |
| `vm_pool_start.js` | ~? | 13 | 122 | cold-start round | ✓ |
| `vm_pool_watchdog.js` | ~? | 12 | 124 | target=N 自补 · 5 min poll | ✓ |
| `vm_public_tunnel.js` | ~430 | 29 | 125 | master VM 内自起 cloudflared 反代 | ✓ |
| `vm_bridge.js` | 707 | 27 | 157 | 本机桥 :11460 · keepalive + reload + probedDead | ✓ |
| `vm_bridge_start.cmd` / `_stop.cmd` | - | 1.6 | 157 | 一笔起停 | ✓ |

**总精华 ~10 件 ~365 KB**

### 1.3 _archive 候选（建议归档 · 88 件 ~665 KB）

#### vm_dao_* 系列（28 件 · ~270 KB）— 印 137-141 之路 · 已被 vm_dao.js + vm_dao_pool.cjs 二件统替

```
vm_dao_avd.js (35 KB · AVD 路 · 已被 vm_dao.js 之 mock 统包)
vm_dao_devin.cjs (33 KB · devin mock · 印 137 · 已并入 vm_dao.js)
vm_dao_doctor.js (17 KB · 健康自诊)
vm_dao_genesis.js (18 KB · 老 master 启)
vm_dao_heal.js (12 KB · 自愈)
vm_dao_keeper.js (7 KB · 旧 keeper)
vm_dao_mesh.js (15 KB · mesh 实验)
vm_dao_omni_boot.js (24 KB · omni boot 老版)
vm_dao_omni_mockvm.cjs (16 KB · mock vm)
vm_dao_orchestrator.js (14 KB · 编排器)
vm_dao_overview.js (16 KB · 总览)
vm_dao_rdp_mock.cjs (14 KB · RDP mock)
vm_dao_remote.cjs (21 KB · 远调)
vm_dao_udp.js (18 KB · UDP 路)
vm_dao_unify.js (15 KB · 统)
vm_dao_wam.js (10 KB · WAM 路)
vm_dao_wam_chain.js (6 KB · 链)
vm_dao_wam_harvest.py (2 KB · 收割)
+ 9 件 .cmd 包装 (~5 KB)
```

#### vm_avd_* / vm_kvm_* 系列（13 件 · ~120 KB）— 老路 nested KVM / Android emulator · 已废

```
vm_avd.js / .cmd
vm_avd_direct.js / .cmd
vm_avd_full.js
vm_avd_grid.js / .cmd
vm_avd_multi.js / .cmd
vm_avd_parallel.js
vm_kvm_eternal.js / .cmd
vm_kvm_nested.js / .cmd
```

#### 老印过 / 已废（24 件 · ~245 KB）— 印 88-103 之实验 · 被印 104 之 vm_omni 替

```
vm_deploy.js (14 KB)
vm_direct.js (19 KB)
vm_expose.js (22 KB)
vm_hotpatch_v2.js (6 KB)
vm_inner_archive.js (16 KB · 已废)
vm_keeper.js (13 KB · 老 keeper)
vm_omni_upgrade.js (9 KB · 老 upgrade)
vm_parallel_test.js (19 KB · 老测)
vm_path_fix.js (10 KB)
vm_pool.js (10 KB · 老 pool · 被 vm_dao_pool.cjs 替)
vm_pool_anycast.js (15 KB · anycast 实验)
vm_pool_ls.js (10 KB · ls)
vm_pool_sync.js (12 KB · sync · 被印 158 rotation 替)
vm_realcode_test.js (10 KB)
vm_status.js (5 KB · 老状态查)
vm_tunnel.js (8 KB · 老 tunnel)
vm_up.js (26 KB · 老 up)
vm_use.js (8 KB · 老 use)
vm_uptime_check.js (5 KB)
vm_limits.md (6 KB · 旧 spec)
vm_spec.md (6 KB · 旧 spec)
+ 3 件 .cmd 包装
```

#### .bak 备份（23 件 · ~30 KB）— 老版本备份

```
vm_*.bak.2026-05-17T12-02-* (统一时戳备份)
```

### 1.4 SEAL 印记（17 件 · ~217 KB · 全留）

| 印 | 件 | KB |
|----|----|----|
| 124 | SEAL_印124_道冲弗盈_双类底层全打通.md | 13 |
| 125 | SEAL_印125_反者道之动_推道极_无为而无不为.md | 14 |
| 126 | SEAL_印126_道纪长存_深根固柢_长生久视.md | 11 |
| 127 | SEAL_印127_道法自然_万物归焉而弗为主_无限并发联调.md | 15 |
| 128 | SEAL_印128_居其厚不居其薄_主公本机即一切_本机公网入口.md | 12 |
| 129 | SEAL_印129_治之未乱_为之未有_一笔自启自验自愈.md | 11 |
| 130 | SEAL_印130_反者道之动_主公一切之资真探_wam真本源归一.md | 12 |
| 131 | SEAL_印131_道法自然_代主公一切_真测Devin云原生VM全维.md | 8 |
| 132 | SEAL_印132_无为而无不为_网页一笔起_主公自手测一切.md | 5 |
| 133 | SEAL_印133_反者道之动_proxy同源重写_闭环自举.md | 7 |
| 134 | SEAL_印134_道法自然_远程无为调用_弗为而成.md | 11 |
| 135 | SEAL_印135_道法自然_重启网页公网入_弱也者道之用.md | 10 |
| 136 | SEAL_印136_道法自然_类Windows_RDP模式_6前端desktop全兑.md | 12 |
| 137 | SEAL_印137_道法自然_devin网页UX全提取_本地一统主公镜像.md | 26 |
| 138 | SEAL_印138_反者道之动_vm_tunnel池守_不依赖账号登一切.md | 10 |
| 139 | SEAL_印139_道法自然_大曰逝逝曰远远曰反_八入口全图归一.md | 11 |
| 140 | SEAL_印140_道法自然_agent十能力归一_闭环用户底层目标.md | 15 |
| 141 | SEAL_印141_物无非彼物无非是_完整omni_mockvm_十能力真打.md | 13 |
| 156 | SEAL_印156_无为而无不为_devin_vm_全闭环.md (镜像 workspace) | 12 |

---

## 二 · 真本源 bug 揭破（印 159 之省）

### 2.1 印 156 fire 之真态

| 节 | 时 | 实 |
|----|----|----|
| fire | 2026-05-19 02:25 | `node vm_master_genesis.js --target 4` |
| Phase 1 raymond fail | 02:25-02:37 | 12 min timeout · ~0.5 ACU |
| Phase 1 heroifygc 真起 | 02:37-02:42 | 5 min cold-start · ~1 ACU |
| Phase 2-6 全过 | 02:42-02:43 | dashboard + watchdog spawn |
| watchdog spawn 4 worker | 02:43-02:51 | ~4 ACU 并发 |
| **5 vm 全活** | 02:55 | 5/5 真验 4-6ms 返 |
| **印 157 SEAL 立** | 03:08 | rotation reissue 代码加 |
| **印 158 SEAL 立** | 03:55 | rotation timer 代码加 |
| HTTP ping 400 起 | 03:14 (cf 30 min) | cf hard TTL · 死锁 |
| log 末写 | 03:25 | vm_omni silent · 进程死 |

### 2.2 真本源 bug

```
fire 时本机 vm_omni.js = 印 104 老版 (无印 157 reissue · 无印 158 rotation)
                ↓
master VM 内 vm_omni.js = 同样老版 (PUT 时 fire 已起 · 用旧件)
                ↓
cf 30 min 死后 · vm_omni 仅 ping 400 · 无 reissue · 无 rotation
                ↓
~42 min 后 (vm_omni log 末时) · vm_omni 死 (wss 断 / OOM / 抛错)
                ↓
master_genesis.json 仍标 alive · vm_bridge spam 1155 次 ✗
```

### 2.3 修

```diff
- fire 时本机 vm_omni 老版
+ 主公本机 vm_omni.js 已是新版 (含印 158 rotation L811-836)
+ 任何新 fire → 本机 vm_omni 自含印 158 rotation
+ ★ 关键: 印 158 rotation timer 真生效需 vm_omni 本机 detached + 25 min 跑

- master_genesis 之 5 phase 复杂 · ~5.5 ACU/启 · cf 30 min 锁
+ vm_genesis_lite.js (印 160 新立) · 单 vm 直 detach · ~1 ACU/启
+ 抛 dashboard + watchdog · 走 rotation 自治 · 真本源 1 vm 闭环
```

---

## 三 · 印 160 之全相 · 三选

### 选 A · 0 ACU 仅整理（已成）

- ✓ stop 旧 vm_bridge spam (pid=80352 · 1155 次报错)
- ✓ 立 vm_genesis_lite.js / .cmd (简化 fire)
- ✓ 立此 INDEX_精华件清单 (去芜存菁)
- ✓ DRY-RUN 全过验件齐

**ACU 投入: 0 · 兑「审视所有成果 · 去芜存菁 · 设计完成」**

### 选 B · ~1 ACU 单 vm 真验印 158 rotation

```pwsh
cd "E:\道\道生一\一生二\Devin云原生\虚拟机资源"
node vm_genesis_lite.js --target 1
# 等 5-8 min cold-start
# fire 起 vm_bridge :11460
.\vm_bridge_start.cmd
# 全 10 cap 并发验
```

**ACU 投入: ~1 · 兑「单 vm 全 10 cap · 25 min rotation 真验 · 6.4h 实活」**

### 选 C · ~4 ACU 4 vm 并发真验（无限制并发）

```pwsh
cd "E:\道\道生一\一生二\Devin云原生\虚拟机资源"
node vm_genesis_lite.js --target 4
# 等 4×5 min cold-start (~20 min 串行 · ~5 min 并发)
.\vm_bridge_start.cmd
```

**ACU 投入: ~4 · 兑「真兑无限制并发 · 4 vm 同时 24h tunnel · 永真 URL」**

---

## 四 · 「去芜存菁」之实施

### 4.1 立即可执行（0 ACU）

```pwsh
cd "E:\道\道生一\一生二\Devin云原生\虚拟机资源"
mkdir _archive\yin160 -EA 0
# vm_dao_* 系列归档 (除 vm_dao.js + vm_dao_pool.cjs)
Get-ChildItem vm_dao_*.* | Where-Object {
  $_.Name -ne "vm_dao.js" -and $_.Name -ne "vm_dao_pool.cjs"
} | Move-Item -Destination _archive\yin160 -Force
# vm_avd_* / vm_kvm_* 归档
Get-ChildItem vm_avd_*.*, vm_kvm_*.* | Move-Item -Destination _archive\yin160 -Force
# 老 vm_* 归档
@("vm_deploy.js","vm_direct.js","vm_expose.js","vm_hotpatch_v2.js","vm_inner_archive.js",
  "vm_keeper.js","vm_omni_upgrade.js","vm_parallel_test.js","vm_path_fix.js","vm_pool.js",
  "vm_pool_anycast.js","vm_pool_ls.js","vm_pool_sync.js","vm_realcode_test.js","vm_status.js",
  "vm_tunnel.js","vm_up.js","vm_use.js","vm_uptime_check.js") | ForEach-Object {
    if (Test-Path $_) { Move-Item $_ _archive\yin160 -Force }
  }
# .bak 归档
Get-ChildItem *.bak.* | Move-Item -Destination _archive\yin160 -Force
```

### 4.2 净化后

```
件总数: 130+ → ~25  (10 精华 + 17 SEAL + 5 辅助测试 + qqyc-dao + 配置)
存空间: ~1.5 MB → ~580 KB (减 60%)
认知载: 大降 · 主公一索即得
```

---

## 五 · 印 158 rotation 验路（fire 后）

```
T+0    fire vm_genesis_lite (~1 ACU)
T+5    vm_omni 抓 URL_1 · 入 vm_pool.json · master_genesis.json 写
       本机 vm_omni 持 wss (含印 158 rotation timer)
T+5    起 vm_bridge :11460 · 自动 follow URL_1
T+5-30 全 10 cap 实证 (shell · file · editor · browser · desktop · network · git · secrets · spawn · ACP)
T+30   ★ 印 158 rotation timer 触发 (25 min interval)
       本机 vm_omni · wss send "session/prompt" 让 agent 重 deploy expose
       agent 出新 URL_2 · stdout 抓 · 入 vm_pool.json (isRotation: true)
       vm_bridge keepalive 第二轮 check URL_1 → 400 → reload pool → 切 URL_2
T+35   cf URL_1 真死 (cf 30 min) · 但 URL_2 已活 5 min · 0 间隙
T+55   ★ 第二轮 rotation · URL_3
T+24h  master VM 24h TTL · 主公需新 fire (~1 ACU 续)
```

---

## 六 · 道印

> **「为学者日益，闻道者日损」** —— 印 156-158 之华丽 master + dashboard + watchdog 是「日益」之路 · 5.5 ACU 大费
>
> **「损之又损 至于无为」** —— 印 160 之 vm_genesis_lite 是「日损」之路 · 1 ACU 单 vm 真闭环
>
> **「反也者，道之动也」** —— 抛 5 phase 复杂 · 直 vm_omni detached + rotation · 反者得真本源

主公诏「**审视所有成果 · 去芜存菁**」之兑：

- ✓ 130+ 件清 · 10 精华 + 88 _archive 候选
- ✓ 真本源 bug 揭破 · 印 158 rotation 修法已立
- ✓ vm_genesis_lite.js · 1 ACU 单 vm 全 10 cap
- ✓ 立此 INDEX 主公一索即得
