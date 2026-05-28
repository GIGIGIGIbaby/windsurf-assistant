# 道Agent · dao-proxy-min · **v9.2.0** · 反者道之动 · 弱者道之用

> **反者道之动, 弱者道之用.** —《四十章》
> **为道日损. 损之又损, 以至于无为, 无为而无不为.** —《四十八章》
> **为者败之, 执者失之.** —《六十四章》

## 9.2.0 摘要 (2026-05-03)

**去芜存菁 · 道法自然**: 于 v9.1.2 之上, 仅施四味真药, 净减码量, 不增功能, 不增状态. 与 v10.x 主源并行不悖.

| 真药 | 漏 | 药 | 道义 |
|---|---|---|---|
| **A** | `proxyToCloud` 无 `req.aborted` / `res.close` / `upStream.setTimeout`, H2 stream 泄漏致 HOL 阻塞 | `req.aborted` + `res.close` + `upStream.setTimeout(180s)` → `NGHTTP2_CANCEL` | 四十章·**弱者道之用** |
| **B** | `setAnchor` 每次 activate 必写 `settings.json`, file watcher 空转, ext-host 抖动 | API+文件双路同值不写 | 六十四章·**为者败之** |
| **C** | `proxyStart` EADDRINUSE 仅单次 ping, 假定远端永活, dead remote 成 phantom | 1 ping → 活则 remote handle, 死则返 null (本窗口直连, 不抢端口) | 八章·**上善若水** |
| **D** | `activate` 首装即 `forceRestartLS()` 广域杀, 多窗口连锁 ext-host crash | activate 仅装 hook + 锚 settings, 不主动杀 LS, 自然重启时挂钩 | 四十八章·**为道日损** |

**默认改动**: `dao.origin.banner` true → false (不言之教)

**向后兼容**: 命令 / SP 置换逻辑 / 端口计算 / 锚定格式 全无变.

## v9.1.3 之过 · 前车之鉴 · 损之未足复益

v9.1.3 试图修补但 **加六事**: PID 簿 / `_trackChild` 跟踪 / `forceRestartLS` 广窄分级 / EADDRINUSE 三验 / 8s 复查 / 60s 健康探针 / 离线 handle.

```text
为学者日益 (v9.1.3 走的路)  ←  反者道之动  →  闻道者日损 (v9.2.0 复归)
```

新增的 `_startRemoteHealthProbe()` (60s setInterval), `_spawnedLsPids` (Set), `_createOfflineHandle` (虚兜底), `三路验证 + setTimeout(8s)` — 此 6 处皆 **执** (六十四章: 执者失之). 净增 200+ 行码, 增分支, 增计时器, 增状态. 反伤本源.

v9.1.3 之 vsix 已留作 **前车之鉴** (`dao-proxy-min-9.1.3.vsix` 80.14 KB), 不再使用. v9.2.0 之 vsix 76.31 KB · 较 v9.1.3 净减 1.96 KB.

## 文件清单

```text
dao-proxy-min-9.1.x-改良/
├─ extension.js                              # ~2120 行 · 主体 (净于 9.1.3)
├─ package.json                              # version=9.2.0
├─ vendor/bundled-origin/
│  ├─ source.js                              # 真药 A 在此 (proxyToCloud · 行 ~2398)
│  └─ _dao_81.txt                            # 道德经八十一章
├─ media/                                    # icon
├─ _selftest.js                              # 离线自测 · 27 项 (T1-T8) · 道恒无名
├─ _pack_vsix.ps1                            # 打包脚本 · 自 package.json 取版本
├─ _install_gentle.ps1                       # 温和装 · 不杀 LS · 不重启
├─ _emergency_revert_to_origin.ps1           # 紧急回退至本源 (无插件无锚)
├─ _verify_install.ps1                       # 装后验证
├─ _verify_vsix.ps1                          # vsix 内容检
├─ _peek_ext_manifest.ps1                    # 看 extensions.json
├─ _probe_running_proxy.ps1                  # 探在跑反代
├─ dao-proxy-min-9.2.0.vsix                # 当前出品
├─ dao-proxy-min-9.1.3.vsix                  # 前车之鉴 (勿装)
├─ LICENSE.txt
└─ readme.md
```

## 自检 · 27/27 全过

```powershell
node _selftest.js
# T1 start · port=58937
# T2 ping · mode=passthrough
# T3 preview
# T4 setMode · invert ↔ passthrough
# T5 abort_cleanup · 20×abort 后 server 存活
# T6 invertSP · 含道
# T7 EADDRINUSE_raises
# T8/A1-A4 真药 A 在 (req.aborted/res.close/setTimeout/NGHTTP2_CANCEL)
# T8/B1-B2 真药 B 在 (同值不写)
# T8/C1-C2 真药 C 在 (1 ping fallthrough)
# T8/D1-D2 真药 D 在 (activate 不调 forceRestartLS, deactivate 仍调)
# T8/W1-W7 七味芜全去 (PID簿/track/offline/probe/timer/broad参 全无)
# T8/M1-M2 元数据 v9.2.0 + banner=false
```

## 装

```powershell
.\_pack_vsix.ps1            # 打 dao-proxy-min-9.2.0.vsix
.\_install_gentle.ps1       # 温和装 (不杀 LS, 等自然 reload 生效)
```

或:

```powershell
windsurf --install-extension dao-proxy-min-9.2.0.vsix --force
```

## 一句话

反代 Windsurf Cascade 之 Connect-RPC, 道德经八十一章直为 SP 起首, 彻底去除官方一切着相之名 (身份/风格/规训), **工具本身全保不动**, 三档 RPC 全覆盖. per-user 端口自然隔离, 二态零代价热切, SSE 实时推送, 一键净卸归本源.

## v9.2.0 较 v9.1.2 改动定位

| 文件 | 行 | 改动 |
|---|---|---|
| `vendor/bundled-origin/source.js` | ~2398-2476 (proxyToCloud) | 真药 A: 加 `req.aborted`/`res.close`/`upStream.setTimeout`/`NGHTTP2_CANCEL` |
| `extension.js` | ~415-470 (setAnchor) | 真药 B: 同值不写 (API+文件双路比对) |
| `extension.js` | ~285-336 (proxyStart) | 真药 C: EADDRINUSE 1 ping → 活则 remote, 死则 null |
| `extension.js` | ~2029-2081 (activate) | 真药 D: 不调 `forceRestartLS()`, 锚 settings 后等自然重启 |
| `package.json` | line 5 | version 9.1.2 → 9.2.0 |
| `package.json` | line 124 | `dao.origin.banner` default true → false |

七味芜不在 (相较 v9.1.3): `_spawnedLsPids` / `_trackChild` / `_createOfflineHandle` / `_startRemoteHealthProbe` / `_stopRemoteHealthProbe` / `_healthProbeTimer` / `forceRestartLS({broad})` 参数.

## 7 命令

| 命令 | 道义 |
|---|---|
| **道Agent: 启** (`wam.originInvert`) | 启代理 + 锚 settings + LS 重启 (用户显式触发, 不在 activate 自调) |
| **官方Agent: 启** (`wam.originPassthrough`) | 上善若水 · 透传观照 |
| **道Agent: 切换模式** | 二态热切 · 零代价翻转 · 下次对话生效 |
| **道Agent: 浏览器观真 SP** | 打开 `/origin/preview` |
| **全链路自检** (E2E) | 致虚守静 · L1+L2 报告 |
| **闭环自检** (L1+L2) | 同上 |
| **了事拂衣去** · 净卸 | 停反代 · 清设置 · 卸插件 · 归本源 |

## 控制面端点

```http
GET  /origin/ping           # 状态
GET  /origin/mode           # 当前模式
POST /origin/mode           # 切模式 {"mode":"invert"|"passthrough"}
GET  /origin/preview        # 实时全貌
GET  /origin/last           # 最近一次 SP 注入
GET  /origin/realprompt     # 捕获轨实 SP
GET  /origin/selftest       # 4 路径闭环自检
GET  /origin/paths          # 路径直方图
GET  /origin/stream         # SSE 推式
GET  /origin/custom_sp      # 读自定义 SP
POST /origin/custom_sp      # 写自定义 SP
DELETE /origin/custom_sp    # 清自定义 SP
```

## 配置

| key | 默认 | 说明 |
|---|---|---|
| `dao.origin.port` | `0` (自动) | 反代端口 · 0=per-user FNV-1a hash (8889..8988) · 非0覆盖 |
| `dao.origin.defaultMode` | `invert` | 首激默模 · `invert`/`passthrough` |
| `dao.origin.banner` | `false` | 启动时显道德经横幅 (默认 false · 不言之教) |

运行时自动锚定:

| key | 说明 |
|---|---|
| `codeium.apiServerUrl` | 道Agent 启时设 `http://127.0.0.1:{port}` · 净卸时清 |
| `codeium.inferenceApiServerUrl` | 同上 |

## per-user 端口隔离

多账号同机时, 每用户自动分配唯一端口 (FNV-1a hash → 8889..8988). 无需配置, 自然隔离.

## 道义记

> 大道甚夷, 民甚好解. —《五十三章》
>
> 大成若缺, 其用不敝; 大盈若盅, 其用不窘. —《四十五章》
>
> 上士闻道, 堇而行之; 中士闻道, 若存若亡; 下士闻道, 大笑之. —《四十一章》

v9.1.3 大笑而行, 益其名而损其本. v9.2.0 反之, 损其名而存其本. 此谓**反者道之动**.
