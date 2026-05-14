# CHANGELOG · packages/wam (rt-flow 道极版)

> 反者道之动 · 弱者道之用 · 天下之物生于有 · 有生于无. —— 帛书《老子》德经

## v2.7.0 (2026-05-09) · 万法识号·守道反者 · 唯变所适·适应万法之格式 · 当前

> *天下莫柔弱于水，而攻坚强者莫之能胜也，以其无以易之也*

**缘起 · 主公实证四图**:

| 图 | 实证 | 现象 |
|---|---|---|
| 图1 | 账号列表 117 号大量 "?天/未验/D?/W?" | 入库 email 严重污染 |
| 图2 | "+ 添加账号" placeholder | 用户依此粘贴 |
| 图3 | 微信发货 ("账号:..\\n密码:含@\\n账号管理器:点tps://..(去掉点)") | 含@密码灾难性误判 |
| 图4 | "卡号N: a@b.com / 卡密N: pass" | 词典缺·5 卡全军覆没 |

**根因 · `parseAccountText` 失道之四病**:

| 病 | 失道之处 | 行为 |
|---|---|---|
| ① | `卡号N:`/`卡密N:` 未在标签词典 | tryPair 错把 "卡号1" 当密码 |
| ② | `if(!v.includes("@"))` 排除带 @ 的"密码" → 兜底 `^\\S+@\\S+$` 误为新 email | 正主丢失 |
| ③ | tryPair 仅以 `includes("@")` 认 email | `XuE2@UXoq7JD` (是密码) 被认为 email |
| ④ | 配对仅 email→pass 单向 | 反序 (pass 先 email 后) 无法配对 |

**治法 · 反者道之动 · 弱者道之用 · 守一不退**:

- §A 立 `_isValidEmail` 严判 (local@domain.tld · 长度 5-254 · 不含全角分隔符) — 替代 `includes("@")` 草率认 email
- §B 扩标签词典 + 兼容 `\\d*` 数字编号:
  - email +`卡号|号码|账户名|登录名|登陆名|number|num|e-mail`
  - pass  +`卡密|密钥|令牌|key|token|access(-token)?`
- §C 标签即定锚·守一不退 · 密码标签后**含 @ 仍为密码** · 邮箱标签后必须 `_isValidEmail` 才认
- §D tryPair 用 `_isValidEmail` 严判 + 双向兜底
- §E `pendingPass` 反向配对 (顺逆皆通)
- §F `_stripWxHints` 行尾剥离 `(无任何空格)`/`(去掉点)` 等微信提示 · 不弃真主之身·只剥提示尾
- §G `_isNoiseLine` 整行模板嗅探 (开头明确者跳: 自动发货/订单编号/账号管理器: URL)

**回归测 `_test_v270_omni_recognize.cjs · 72/0`**:

```text
[§3]  _isValidEmail       严判单元 14 测   (合法/非法 各 7)
[§4]  图3 微信自动发货     5 测            (含@密码守一)
[§5]  图4 卡号N:/卡密N:    11 测           (5 卡全识)
[§6]  标签数字编号         5 测            (账号1:/Email3:/卡密1: 等)
[§7]  经典格式不退化       9 测            (8 种分隔)
[§8]  反序配对             3 测            (pass 先 email 后)
[§9]  噪声免疫             1 测            (微信广告 9 行 → 唯识 1 真)
[§10] token 直登           2 测            (devin-session/JWT)
[§11] 综合极端 (一文混万法) 9 测            (6 账号 + 1 token)
═════════════════════════════════════════
        72 过 / 0 败
```

**软编码归一 · 单一信源 wamHomeDir**:

- 立 `Get-WamDir` 助手于 `_dao_lib.ps1` (尊 `_dao_env(.local).psd1` `wamHomeDir`)
- 6 PS 脚本字面 `'.wam'` → `Get-WamDir`: `_v2611_status` / `_v2611_omni_monitor` / `_v2611_send_mark` / `_v2611_omni_probe` / `_v2611_hourly_dist` / `_dao_postreload_verify`
- Linux/macOS 兼: `USERPROFILE` → `HOME` 兜底

**道一以贯之**: 78 章「天下莫柔弱于水, 而攻坚强者莫之能胜也, 以其无以易之也」· 万法之格式如水, 守一者如石.

## v2.6.14 (2026-05-08) · 三守俱全·守一·大制无割·反者道之动

**缘起** (179 wam.log 21225 行实证 · v2.6.13 生命):

- 声设 ⚡W%脉动 = 主信号·WAL/pb 让位 60s
- 实证信号占比 ⚡W%脉动 4.3% (11/253) · 📡WAL·edge 68.8% (174/253) · "主信号优先" 形同虚设
- 5 分钟爆发 WAL 174 火 · 38 次真切号 · 每 8s 切一 · 雪崩复返

**根因三破**:

| 破 | 层 | 本 |
|---|---|---|
| ① 公理破 | "1 user send = 1 信号" | 不成立 · 流式响应连续 N quanta · 单账号 40s W 82→72 = 4 脉动 |
| ② 栏破 | v2.6.11 弃 `perMessageMinIntervalMs` | 最终兜底失 |
| ③ 守破 | v2.6.12 `quotaPulsePriorityMs` 只守 WAL/pb | 不守 W% 自身 · 阳自决堤 |

**三守俱全** (大制无割·一全锁覆万源):

| 守 | 位 | 默 | 道 |
|---|---|---|---|
| **守一** | `_maybeTrigger` 入口 | `perMessageMinIntervalMs=60000` | 全 reason 强锁·适 ⚡/📡/📃/⚖ 万源·1 user send ≤ 1 切 |
| **守二** | `_fireWalEdge` 内 | `walEdgeCooldownMs=2000` | WAL 同源最小间隔·避 4KB 帧连火·削 log 噪 |
| **守三** | `_fireWalEdge` 入 | `walWarmupMs=5000` | WAL 启动暖启窗·防 activate 首 stat 累积差引雪崩 |

**回归测 `_test_v2614_triple_throttle.cjs · 66/0`** · §2d-3 mock 实证降幅 **-97.2%** (177→5).

**道一以贯之**: 64 章「为之者败之·执之者失之·圣人无为故无败」· 单行全栏 > 多处细栏 · 守一 > 守多.

## v2.6.13 (2026-05-08) · 阴阳结合·⚖额度变动·物无非彼物无非是

| 极 | 信号 | 维度 | 阈值 | 动态 |
|---|---|---|---|---|
| **阳·主** | ⚡W%脉动 | `weekly%` 宏观 | `quotaPulseMinDelta` (默 0.3%) | 触发 → 设 `_lastQuotaPulseAt` → 主信号窗 60s 内 WAL/pb/⚖ 让位 |
| **阴·辅** | ⚖额度变动 | `daily%` / `promptCredits` / `flowCredits` 多维度+微观 | `quotaDeltaDailyMin` (默 0.3%) + `quotaDeltaCreditsMin` (默 1) | 触发 → 进 `_maybeTrigger` 出口 → 主信号窗内自动 skip · 60s 强锁仍护 |

**配置默值**:

```jsonc
"wam.quotaDeltaEnable":     true,   // 全开关
"wam.quotaDeltaCreditsMin": 1,      // promptCredits/flowCredits 任何减少即触
"wam.quotaDeltaDailyMin":   0.3,    // daily% 跨0.3% 即触 · 与 weekly 同量级
```

**回归测 `_test_v2613_quota_delta.cjs · 44/0`**.

**道一以贯之**: 1 章「两者同出·异名同谓·玄之又玄·众眇之门」· 双都防跨账号假脉动 (`_lastQuotaEmail` 同账号判).

## v2.6.12 (2026-05-07) · 守一·抢跑治·道恒无名

**v2.6.11 reload 实证 24h**: ratio pulse:rotate = 1:1.75 (主信号外有 WAL/pb 抢跑) · 假脉动 7 次 (跨账号 setActive 致 W% 跳变误判).

**修法**:

- 修一: setActive 真切号时清基线 (`_lastQuotaPercent = null`) — 解跨账号 W% 跳变假信号
- 修二: 加 `_lastQuotaEmail` · W% 比较只在同账号内进行
- 修三: 加 `_lastQuotaPulseAt` 时间戳 — ⚡W%脉动 触发后 `quotaPulsePriorityMs` (默 60s) 内 WAL/pb 备用信号让位 (skip)

**净变**: +50 行 · 24 配置项 (新增 `quotaPulsePriorityMs`).

## v2.6.11 (2026-05-07) · 真本源至·道恒无名·民自均焉

**实证发现** (v2.6.10 24h 后): WAL 信号本质不可靠 (SQLite batch+checkpoint 模型) · pb.new 仅捕新对话 · settle 模型累积静默与 user send 频次解耦.

**根本治法 · 三守三损**:

```text
损一: 删 settle 模型整段 (_installSettleWatcher)
损二: 删 max filter (v2.6.10 walEdgeMaxBytes=0)
损三: 删 三防抖 (perMessageDebounce/MinInterval/Delay)

守一: ⚡ W%脉动 — Engine._tick 10s 周期查 weeklyQuotaRemainingPercent
        增量 ≥ 0.3% (默) → 立即 _maybeTrigger
        真本源 = 后端 GCP 计费 · 零中间噪音 · 1 send→1 W%-降→1 切
守二: 配额自均 — 当前号 W% 大降 主动切 · 让账号配额自然均衡耗尽
守三: 长链路监控 — _v2611_omni_monitor.ps1 24h CSV 持续观测
```

**净变**: -3.1KB / 删 4 配置 / 删 2 死变量 · 23 配置项.

## v2.6.10 (2026-05-07) · 治人事天·莫若啬·checkpoint 过滤

**v2.6.9 reload 后实证 37min**: 降幅 vs v2.6.8 = 98.9% (median 22s→2070s) · 但 wal·edge 6 次中 2 次 delta=840KB/708KB 是 SQLite checkpoint 噪 (非 user send).

**损法** (59 章·啬):

- 加 `wam.walEdgeMaxBytes` 默 65536B (64KB) · delta > 此视为 checkpoint 噪 · skip 不 fire
- 加 `_skipWalEdge` 函数 · log `wal·edge·skip[checkpoint:XXX > 64KB]` · 与 fire 双轨
- 加 diag 三新字段 · `lastEdgeDelta`/`lastCheckpointDelta`/`edgeSkipCount`
- 兼容: `walEdgeMaxBytes=0` ⇒ 关上限 (v2.6.9 行为)

**二道互补**: 空间过滤 (max 64KB) + 时间强锁 (60s minInterval).

## v2.6.9 (2026-05-07) · 道法自然·损 settle·留真信号

**实证** (window1 5-WAM.log · 11min13s): 切号 34 次 / 22s 中位间隔 / pb·settle fired 36 + skip 6 (全错触发源) / wal·settle fired 0 / 4 个并行 .pb 文件 / debounced 仅 2 次.

**根因 10 层** (从象到本): 多源 + 50 个历史会话 + cascade reindex daemon 噪 · settle 模型本错 · v2.5 弃 L1-L5 hook 落到 .pb 信号 · 比原 hook 还吵.

**修法 · 反者道之动·损之又损**:

- **减**: 删 `_firePbSettle` · 删 watcher 存量增量 settle 分支 · 删 `_fireWalSettle` settle 模型 · 删 `pb·new` 路径 reset (最后一处自夺)
- **留**: `pb·new` 唯一信号源 (新对话 1:1 精确)
- **加**: WAL 边沿首发 (单次 delta ≥ 512B 即 fire · 不累积不等 settle)
- **强**: 60s 全局强锁 (`perMessageMinIntervalMs=60000`) · 任何信号源 60s 内最多 1 次
- **锁**: claim key 改纯 bucket (多实例派生收一道)

**净变**: 删 ~150 行 (settle) + 加 30 行 (边沿) = 净减 120 行 · 为道日损.

**道一以贯之**: 73 章「天网恢恢, 疏而不失」· 防抖才是疏 · settle = 着相妄为.

## v2.6.8 (2026-05-06) · 实证回归 · 字面归一 · 部署归宿

**实证 v2.6.7**: 文件 sha 一致 / 测 24/0 / 软重启 ext host (双轮 kill) / `WAM v2.6.7 activate` / `_per_msg_diag.json totalDebounced` 字段写入 / wal·settle 信号工作 / state ver=2.6.7 / switches+3.

**修字面**: activate log `三源[pb·new+pb·send+wal·send]` 是 v2.6.4 旧描述. 实际架构自 v2.6.6 已重构为 settle 模型. 改 → `settle 模型[pb·new+pb·settle+wal·settle] · 4s 防抖 [开]`.

**修部署根因**: `_v267_deploy.ps1` 硬编 `devaid.rt-flow-2.1.1` · 实际 windsurf 加载的是 `extensions.json` 内 `location.path = devaid.rt-flow-2.5.5` (vsix 多版本残留). `_v268_deploy.ps1` (后归并入 `_dao_deploy.ps1`) 改读 `extensions.json` 自动定位.

**新软部署套件** (零硬编 · 唯变所适):

- `_dao_env.psd1` · 目标配置 (local + remote, 可被 `WAM_TARGETS_JSON` 环境覆盖)
- `_dao_lib.ps1` · 共享 helpers (Get-DaoEnv / Get-WamSourceVersion / Resolve-DevaidLocation / Get-Targets / **Get-WamDir** v2.7.0 新立)
- `_dao_deploy.ps1` · 通用部署器 · 版本/路径/目标全自适配 · `-Target` `-LocalOnly` `-DryRun`
- `_dao_postreload_verify.ps1` · 通用验证器 · `-ExpectVersion` (默认读源)

**道一以贯之**: 24 章「自见者不明」· v2.6.7 自以为已部署, 实际加载旧目录. 必"不自见故章" — 实证驱动 · 读权威源 (extensions.json) 而非假设目录命名.

## v2.6.7 (2026-05-06) · 守一 · 减二 · 不自夺

**实证**: 4 分钟 18 切号 / 24 hits / 末段 4 连 Rate-limit 雪崩. `11:27:02.543/.551` 同 8ms 内 `0c3ec7c1 + fd300a99` 双 fire (同一 send 派生多 .pb) · 全部应被 `perMessageDebounceMs=4000` 拦, 实际全过 → 防抖完全失效.

**病灶**: pb·settle / wal·settle 两处 fire 前强制 `_lastPerMsgTriggerAt = 0` · 自夺防抖 · 一条 send 派生 N 文件 settle = N 切号.

**减法**:

- 删 pb·settle 之前 `_lastPerMsgTriggerAt = 0`
- 删 wal·settle 之前 `_lastPerMsgTriggerAt = 0`
- 保 pb·new 队列里的 reset (queue gap 3500ms < debounce 4000ms · 串行排队需绕)

**加法 (诊断)**: `_perMsgDebounced` 计数 · 防抖拦截入 `_per_msg_diag.json totalDebounced` · 可读比例验证.

**回归测试**: `_test_v267_debounce.cjs` 三关 (静态规约 + 行为隔离 + 实战追演) 全过.

**道一以贯之**: 73 章「天网恢恢, 疏而不失」· 防抖才是疏 · reset = 着相妄为.

## v2.6.6 (2026-05-06) · 反者道之动 · 解构一切 · 逆流到底

**实证**: 40 分钟 wam.log 析 — pb·send 触发 186 次 / 4 个 .pb 并发 / 主公真实 send ~5 条. 单文件 `56d148d6` 触发 102 次 (23s/次) · quiets 主峰 8s×46 (= cooloff 解除即触发).

**病灶 (cooloff 模型三大缺陷)**:

1. cooloff 解除即触发 · AI 流式期间反复切号
2. `GROW≥50B` 太低 · 60-280B cascade 心跳/元数据被误判为 send
3. 多 .pb 并发 · 4 倍触发噪声

**反者解** (40 章「反者, 道之动也」): cooloff (看见动就切) → **settle (看见停才切)** · debounce trailing edge 模式 · 静默 N ms 后才切号. 流式期间所有续写吸收到一次 settle · 主公一条 send → 1 次 AI 响应 → 1 次切号.

**实现**: `pb·send → pb·settle` / `wal·send → wal·settle` · `SETTLE_MS=15000` · `ACCUM_MIN=5120` · `LARGE_DELTA=131072` 兜底.

## v2.6.5 (2026-05-06) · 锚定本源 · 慎终若始

**根因**: v2.6.4 hotfix 写入源后未提版本 · 部署 sha 与源一致 · 但运行进程加载的是旧 v2.6.4 (无 hotfix). VS Code extension host 不热重载 · Node module 缓存把启动时读到的旧 disk 锁定.

**道法**: 64 章「慎终若始 · 则无败事」· v2.6.5 仅升版本号 + changelog · 行为零变化. 主公 Reload Window 后 wam.log 出现 `WAM v2.6.5 activate` → 秒证 hotfix 生效.

## v2.6.4 (2026-05-06) · 去芜存菁 + quietSec 哨兵修

**删死**: `wam.netHookDisabled` (v2.5.0 删 Layer 1-5 net.Socket hook 后零引用) · `wam.perMessageMinIntervalMs` (默认 0 关 · 从未被 _cfg 读取).

**补活**: `wam.sendDetect{QuietMs,CooloffMs,GrowMin}` (v2.6.1 pb·send 三参数) · `wam.walDetect{,QuietMs,CooloffMs,GrowMin}` (v2.6.3 WAL 四参数) · VS Code 设置界面可见.

**Hotfix**: pb·send / wal·send 首检测时 `lastGrow=0` · quietSec 计算泄入 Unix 时戳 (~56年). 修: `lastGrow=0` 哨兵化 · 首检测 quiet="init" · isQuiet 仍 true 保留触发逻辑.

## v2.6.3 (2026-05-06) · WAL 直达触发 · 大道至简 · 回归本源

**信号源**: `state.vscdb-wal` (用户 click Send 后 SQLite 同步写入的 WAL 帧). 实证: globalStorage/state.vscdb-wal 11MB 且持续增长. 比 pb 文件增长**早一个 IO 层**.

**实现**: `_installWalWatcher(context)` · 300ms 轮询 · `quiet=2s` · `cooloff=6s` · `min=1024B` (1 个 WAL 帧).

**大道至简**: pb·send 需 3s 安静期延迟切号 · WAL 在 click Send 的第一个 300ms 轮询内即可检测.

## v2.6.2 (2026-05-05) · 跨实例声明锁 · 观复知常 · 万物并作

**根因**: 多 Windsurf 窗口各含独立 WAM 实例 · 共享同一 cascade 目录. 实证: wam.log 显示同一 pb 文件在 495ms 内被记录两次 → 2 次切号.

**修法**: `~/.wam/_l6_claim/` 声明目录 + `flag:"wx"` 原子排他创建.

- pb·new → `<uuid>.pb.new` 声明文件 · 第一个实例到者得之 · 其余静默跳过
- pb·send → `<prefix8>.<timebucket>.send` 声明文件 · COOLOFF_MS 时间桶内唯一

声明文件启动时清理 >5min 旧文件 · 零积累.

## v2.6.1 (2026-05-05) · Layer 6 双信号 · 逆流到底

**信号①** `pb·new`: 新 .pb 文件 = 新对话 → 立即切号.

**信号②** `pb·send`: 存量 .pb 文件大小增量 + 安静期检测 = 已有对话用户发消息.

- 用户 send → 文件首次写入 (小增量·安静后) · AI 流式续写 → 连续写 (不安静)
- 安静期 `QUIET_MS=3s` · 每文件冷却 `COOLOFF_MS=8s` · 最小增量 `GROW_MIN=50B`

**效果**: 新对话/已有对话每发一条消息均触发切号 · 真正 per-send 级精度.

## v2.6.0 (2026-05-05) · 底层软编码 · 唯变所适 · 水无常形

- `RE_SESSION_TOKEN` 常量统一 · `"devin-session-token$"` 两处字面量 → 单点定义 · 后端格式变时单行修
- `buildHtml planTag` 改用 `_isTrialLike(h)` · 与 `_cleanseHealthOnLoad/_buildExpTag` 全链对齐
- `_resolveCascadePbDir` Linux fallback 改用 `os.homedir()` · 跨发行版自适应
- startup recovery 阈值改用 `_cfg("autoSwitchThreshold",5)` · 与 Engine._tick 对齐 · 配置一源

## v2.5.6 (2026-05-05) · 真根因 · Layer 6 信号文件 + 路径双修

**根源**: v2.5.0~v2.5.5 Layer 6 从未命中 · 日志永远 `Layer 6 · skip`. 实测: globalStorage/state.vscdb-wal 11MB 实时随 Cascade 消息增长 · workspaceStorage/<hash>/state.vscdb 16:01 停更 · 非 Cascade 写入.

**修**:

1. 文件改为 `globalStorage/state.vscdb-wal` (真信号) · `context.globalStorageUri` 导出
2. 旧 `path.dirname(path.dirname(storageUri))` → ONE dirname 修正
3. delta 策略 WAL 正增量 ≥1KB (过滤 checkpoint 缩减) · debounce 兜底
4. fallback 四级: globalStorage WAL → globalStorage main → workspace → scan

## v2.5.5 (2026-05-04) · ideVersion 根因解

**根因发现**: 后端按 `metadata.ideVersion` 能力协商返回字段.

- `ideVersion="1.0.0"` → 后端省略 `planEnd / planStart` (老客户端不懂)
- `ideVersion="1.99.0"` → 后端返完整 `planEnd="2026-05-09T20:56:09Z"`

实证 (`_probe_ideversion.cjs`): 同账号同 API · 仅版本差异 · `planEnd` 字段有无之别.

此为 Trial 类账号 `planEnd=0` 脏数据的真正根因 (比 postAuth 401 更本).

**修**: `tryFetchPlanStatus` metadata default `ideVersion` 由 `"1.0.0"` 改为 `"1.99.0"`.

## v2.5.4 (2026-05-04) · `_isTrialLike` 软判据

**问题**: `_cleanseHealthOnLoad` 硬编码 `h.plan === "Trial"` · 漏 `Team Trial / Free Trial / 小写 trial` 等变体.

**修**: 抽 `_isTrialLike(h)` 软判 (正则 `/trial/i`) · `_buildExpTag / _cleanseHealthOnLoad` 同步用软判据.

## v2.5.3 (2026-05-04) · Trial 脏数据自洁

**问题**: `plan="Trial" && planEnd=0 && checked=true` 的状态 → UI 误显 "永久" (∞).

**修**:

1. `_buildExpTag` 增第 5 态 `Trial?` (黄色 · 提示需重验)
2. `_cleanseHealthOnLoad` 加规则: `Trial && planEnd=0 && checked=true` → `checked=false` (下次自动重验)
3. `store.load` log 加 `trialNoPlanEnd` 计数

## v2.5.2 (2026-05-03) · `_buildExpTag` 5 态 UI 标签

UI 列每行账号有效期 5 态:

- `?天` (灰) — 未验
- `N天` (颜色阶梯: 红 ≤2 / 橙 ≤5 / 绿 >5)
- `已过期` (红)
- `Trial?` (黄) — Trial 脏数据 · 需重验
- `∞` (灰) — Pro 永久或字段缺

## v2.5.1 (2026-05-03) · `X-Devin-Auth1-Token` HTTP header

**问题**: 后端协议变 · postAuth 401 未认证.

**修**: `windsurfPostAuth` body `auth1_token` → HTTP header `X-Devin-Auth1-Token`.

实证 (`_probe_postauth.cjs`): 真账号 + 真后端 · 修前 401 / 修后 200.

## v2.5.0 (2026-05-02) · 大减法 · Layer 6 跨进程触发

**根因**: Layer 1-5 网络钩 (http.request / net.Socket / undici / fetch / WebSocket) 在 cross-process 隔离下无效 — 切号工作进程与 Cascade 渲染进程不共享 hook.

**修**: 引入 Layer 6 — `fs.watchFile()` 监听 `%APPDATA%\Windsurf\User\workspaceStorage\<hash>\state.vscdb` 的 mtime 变化.

每条 Cascade 消息发送会触发 `state.vscdb` 写 → Layer 6 收到 → 触发切号. **跨进程稳**.

**减**: 删 Layer 1-5 全部网络钩代码 (-2300 行).

## v2.4.x → v2.5.0 减法路 (-62%)

| 减项 | 行 | 减因 |
|---|---|---|
| Layer 1-5 网络钩 | -2300 | cross-process 无效 |
| TurnTracker | -800 | Layer 6 已替 |
| AutoUpdate (`_DEFAULT_PUBLIC_SOURCE`) | -600 | 用户自部署 · 公开 repo 无源 |
| 代币池跨账号管理 | -400 | 单文件本地 state 即可 |
| Firebase / Devin 全套登录链 | -2200 | `devinLogin + windsurfPostAuth` 双步即足 |
| 多重 fallback 兜底 | -200 | 信道单点已稳 |
| **共减** | **-6648** | **(10913 → 4265)** |

## 测试矩阵 (v2.7.0 · 13 套 · 11 套核心 458/0 + 2 套 baseline 跟新滞后)

| 测试 | 断言 | 关注 |
|---|---|---|
| `_test_set_health.cjs` | 24 | health 写入幂等 + planEnd 保留 |
| `_test_v241_real.cjs` | 20 | proto3 default + 真账号验证 (网络依赖) |
| `_test_in_use.cjs` | 57 | 使用中锁 + 失败计数 (不禁号) · v2.6.14 体积上限 220 KB |
| `_test_e2e_msg_rotate.cjs` | 33 | 消息轮转 E2E |
| `_test_quota.cjs` | 12 | 配额波动检测 |
| `_test_v251_postauth_header.cjs` | 8 | postAuth header 协议 |
| `_test_v252_exptag.cjs` | 73 | UI 5 态 + Trial 清洗 |
| `_test_v255_ideversion.cjs` | 9 | ideVersion 1.99.0 锁 |
| `_test_v256_layer6_path.cjs` | 30 | Layer 6 路径双修 |
| `_test_v267_debounce.cjs` | 28/14 ⚠ | §1 v2.6.10 baseline 滞后 / §2/§3/§4 行为 14/0 |
| `_test_v2613_quota_delta.cjs` | 44 | v2.6.13 阴阳结合 ⚖额度变动 |
| `_test_v2614_triple_throttle.cjs` | 66 | v2.6.14 三守俱全 · 雪崩拟消 -97.2% |
| `_test_v270_omni_recognize.cjs` | 72 | v2.7.0 万法识号 · 4 图全识 · 一文混万法 6+1 token 皆通 |

## 历史: v17.42.x 系满载版

v17.42.20 (2026-04-末) 及 v17.42.x 全系**满载本体**已归档于 [`_archive/wam-v17.42.20/`](../../_archive/wam-v17.42.20/):

- 完整 `extension.js` 437 KB / 10913 行
- 387 E2E 断言
- 完整 v17 CHANGELOG 72 KB · `_archive/wam-v17.42.20/CHANGELOG.md`

二者为**同名异体 · 各臻其极** · 不相代而相成.

---

*德经曰: 上士闻道 · 堇而行之. 道极版即「闻道而行」之践*
