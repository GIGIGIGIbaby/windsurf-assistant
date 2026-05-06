# CHANGELOG · packages/wam (rt-flow 道极版)

> 反者道之动 · 弱者道之用 · 天下之物生于有 · 有生于无. —— 帛书《老子》德经

## v2.6.8 (2026-05-06) · 实证回归 · 字面归一 · 部署归宿 · 当前

**实证 v2.6.7**: 文件 sha 一致 / 测 24/0 / 软重启 ext host (双轮 kill) / `WAM v2.6.7 activate` / `_per_msg_diag.json totalDebounced` 字段写入 / wal·settle 信号工作 / state ver=2.6.7 / switches+3.

**修字面**: activate log `三源[pb·new+pb·send+wal·send]` 是 v2.6.4 旧描述. 实际架构自 v2.6.6 已重构为 settle 模型. 改 → `settle 模型[pb·new+pb·settle+wal·settle] · 4s 防抖 [开]`.

**修部署根因**: `_v267_deploy.ps1` 硬编 `devaid.rt-flow-2.1.1` · 实际 windsurf 加载的是 `extensions.json` 内 `location.path = devaid.rt-flow-2.5.5` (vsix 多版本残留). `_v268_deploy.ps1` (后归并入 `_dao_deploy.ps1`) 改读 `extensions.json` 自动定位.

**新软部署套件** (零硬编 · 唯变所适):

- `_dao_env.psd1` · 目标配置 (local + remote, 可被 `WAM_TARGETS_JSON` 环境覆盖)
- `_dao_lib.ps1` · 共享 helpers (Get-DaoEnv / Get-WamSourceVersion / Resolve-DevaidLocation / Get-Targets)
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

**配置** (新 7 配置 / 删 4):
- `wam.sendDetectSettleMs` (15000) / `wam.sendDetectGrowMin` (30) / `wam.sendDetectAccumMin` (5120)
- `wam.walDetectSettleMs` (15000) / `wam.walDetectGrowMin` (1024) / `wam.walDetectAccumMin` (10240)
- 删: `sendDetectQuietMs` / `sendDetectCooloffMs` / `walDetectQuietMs` / `walDetectCooloffMs`

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

## 测试矩阵 (本仓 8 测 · 公开 repo 模式 231 过 · 0 败 · 本地真打模式 236 过)

| 测试 | 断言 | 关注 |
|---|---|---|
| `_test_set_health.cjs` | 24 | health 写入幂等 + planEnd 保留 |
| `_test_v241_real.cjs` | 15 (公开) / 20 (真打) | proto3 default + 真 5 号验证 |
| `_test_in_use.cjs` | 57 | 使用中锁 + 失败计数 (不禁号) |
| `_test_e2e_msg_rotate.cjs` | 33 | 消息轮转 E2E |
| `_test_quota.cjs` | 12 | 配额波动检测 |
| `_test_v251_postauth_header.cjs` | 8 | postAuth header 协议 |
| `_test_v252_exptag.cjs` | 73 | UI 5 态 + Trial 清洗 |
| `_test_v255_ideversion.cjs` | 9 | ideVersion 1.99.0 锁 |

## 历史: v17.42.x 系满载版

v17.42.20 (2026-04-末) 及 v17.42.x 全系**满载本体**已归档于 [`_archive/wam-v17.42.20/`](../../_archive/wam-v17.42.20/):

- 完整 `extension.js` 437 KB / 10913 行
- 387 E2E 断言
- 完整 v17 CHANGELOG 72 KB · `_archive/wam-v17.42.20/CHANGELOG.md`

二者为**同名异体 · 各臻其极** · 不相代而相成.

---

*德经曰: 上士闻道 · 堇而行之. 道极版即「闻道而行」之践*
