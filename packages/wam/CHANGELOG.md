# CHANGELOG · packages/wam (rt-flow 道极版)

> 反者道之动 · 弱者道之用 · 天下之物生于有 · 有生于无. —— 帛书《老子》德经

## v3.10.1 (2026-05-27) · ⚡ 零额度紧急重触 · 切号防御双完善 · 道法自然 · 当前

> *损之又损，以至于无为。无为而无不为。—— 帛书《老子》四十八章*

### 两大完善

#### 问题一：切到零额度账号后仍卡 10s 才换号

**根因**: `loginAccount` 切号成功后，旧逻辑仅异步更新健康数据 → 下次 `_tick`（最多 10s 后）才能发现 D=0/W=0 → 用户在此期间看到 "Trial - Quota Exhausted"

**修复 (v3.10.1 `loginAccount`)**:
```js
// planStatus 异步回调中，若发现 D=0/W=0 且无 credits
const _isD0 = !_hasUsableCredits(q) && (drought ? (q.daily<=0) : (q.daily<=0 || q.weekly<=0));
if (_isD0) {
  setTimeout(() => {
    if (_engine && !_switching && !_engine.rotating) {
      _engine._tick().catch(...);  // 2s 后重触，而非等最多 10s
    }
  }, 2000);
}
```

**效果**: 切到零额度账号 → 2s 内自动检测并继续换号 · 用户无感知

#### 问题二：切号时仍可能选到 D<5% 或 W≤3% 账号

**现状** (v3.8.4 / v3.10.0 已有基本过滤):
- `_isValidAutoTarget`: D<5 → false · W≤3 (非干旱) → false ✓
- `_scoreOf`: D<5 或 W≤3 → -Infinity ✓

**残余边缘**: 未验证账号 (`!h.checked`) 在 `_isValidAutoTarget` 返回 `true` (无法预判) · 若全量已验账号均为 D0，系统会轮转尝试未验号 → 可能切到真实也是 D0 的账号 → 被「零额度紧急重触」立即捞救

**两层协同防御 (最终体系)**:

| 层次 | 机制 | 时机 | 覆盖场景 |
|------|------|------|---------|
| **预防层** | `_isValidAutoTarget` D<5/W≤3 过滤 | 选号时 | 已知低额账号不入候选 |
| **评分层** | `_scoreOf` D<5/W≤3 → -Infinity | `getBestIndex` | 已验低额账号彻底排除 |
| **救火层** | `_tick` `isHardExhausted` | 10s 巡检 | D=0/W=0 当前号 → 必切 |
| **紧急层** ★ | `loginAccount` 异步验额 | 切号后 2s | 切入即 D=0 → 2s 再切 |

**道义**: 损之又损，以至于无为。两层过滤尽量「不切」低额号；切了之后若发现是 D=0，「2s 紧急重触」即为顺势补救，非违心，乃自然之道。

### 改动文件

- `packages/wam/extension.js` (VERSION → 3.10.1, `loginAccount` 新增零额度紧急重触)
- `packages/wam/package.json` (3.10.0 → 3.10.1)
- `packages/wam/CHANGELOG.md` (本条目)

---

## v3.10.0 (2026-05-27) · 归一 · 卡住引擎集成 · 道法自然 · 当前

> *道生一，一生二，二生三，三生万物。万物负阴而抱阳，中气以为和。—— 帛书《老子》道经*

### 归一 · 万法归宗 — 卡住检测从独立进程集成到 WAM 扩展

**根因**: 之前卡住检测引擎 (`dao_stuck_v9.js`) 作为独立 Node.js 进程运行在 `110-对话追踪_Trace/` 目录：
- 需手动启动/管理生命周期
- 代码分散两处，修改需同步
- 崩溃无自动恢复

**归一治法**: 引擎归入 WAM 扩展包，由 extension.js 自动管理：

| 改动 | 说明 |
|------|------|
| `dao_stuck.js` | 引擎脚本打入 VSIX 包 · 路径改为 `~/.wam/stuck-detect/` |
| `_launchStuckEngine()` | activate 时自动启动子进程 · 3秒延迟 (让 Hub watcher 先就绪) |
| 崩溃自动重启 | 非正常退出 5s 后重启 · 滑动窗口限流 (5min内最多3次) |
| `_stopStuckEngine()` | deactivate 时优雅关闭 · SIGTERM |
| `--toast false` | 通知由 extension.js 统一管理 · 引擎不弹 Windows toast |
| stdout/stderr → Output Channel | 引擎输出实时转发到 WAM 日志面板 |

**架构图**:
```
extension.js (VS Code 宿主)
  ├─ activate → _launchStuckEngine()
  │    └─ dao_stuck.js (子进程 · 独立 Node.js)
  │         ├─ 读 .pb + vscdb → 判定卡住状态
  │         └─ 写 ~/.wam/_hub.json
  ├─ _installHubWatcher → 监听 _hub.json 变化
  │    └─ _processHubStuck → 通知/状态栏
  └─ deactivate → _stopStuckEngine()
```

### v12.9 卡住检测核心改进 (状态驱动 · 识别用户行为)

**去掉 POST_STREAM_GRACE (10分钟时间延迟)**，改为 `_awaitingUser` 状态标志：

| 状态 | 条件 | 行为 |
|------|------|------|
| AI 从未响应 | `_turnGrowth < 4KB` | 60s WARNING · 120s STUCK |
| AI 已完成回复 | `_turnGrowth > 4KB` + 停止增长 | `_awaitingUser=true` · 永不误报 |
| 用户发新提示词 | `USER_PROMPT_DETECT` | `_awaitingUser=false` · 恢复检测 |

**实战验证**: v12.9 运行 51分钟 · stuck=0 · 零 WARN_STUCK · 零误报。

---

## v3.9.1 (2026-05-27) · 🚨 硬耗尽越权 + 双层耗尽分离 · 损之又损归一活分支

> *损之又损，以至于无为。损至零，则强为之，非违心，乃顺势 — 道德经第四十八章*

### 反者道之动 · 反向审视上次对话成果

上次对话在 `_build_v321` 冷分支上完成的 v3.5.2 / v3.5.3 改动，反向审视发现：

| 成果 | 评 | 处置 |
|------|----|----|
| v3.5.2 `_convScan` 跨 turn 修复 | `dao_stuck_v9.js (v12.7)` 早已有 `INITIAL_SEND_GRACE` + `prevVscdbStatus` 转换 + `activeSinceTs` 重置 + 重启清零 + WAL 保护 | **废弃** — 重复劳动 |
| v3.5.3 硬耗尽越权 `skipAutoSwitch` | 真正的新逻辑 · 活分支 v3.9.0 仍是单层 `isExhausted` 尊重锁 → 0% 时卡死 | **保留** — 移植入活 |
| `_build_v321` 整个冷分支 | 早分叉自 v3.3.x · 与活分支 v3.9.0 架构差异巨大 · 已不可融合 | **归档** |
| `_test_v351/v352.cjs` 镜像测试 | 复制实现到测试 · 不验证真实代码 · 反模式 | **归档** |

「上德不德，是以有德」—— 真正的成果不在写了多少代码，而在多少代码真正运行、真正击中需求。

### 核心修复 (移植自 v3.5.1 / v3.5.3 · 适配活分支)

**根因**: v3.9.0 `_tick()` 耗尽分支仍是**单层** `isExhausted`：

```js
const isExhausted = effQuota < threshold && !_hasCreditsActive;
if (isExhausted && !_switching && !switchCooldown && !acc.skipAutoSwitch) {
  if (q.daily < threshold && hrsToDaily <= waitResetHours) return;  // Bug: 0% 也等待
}
```

→ D=0% 与 D=3% 同等对待 → 走 reset 等待 → **0% 用户彻底卡死最多 3 小时**

### 道义辨别

| 额度状态 | 锁 (skipAutoSwitch) | 含义 | 处置 |
|---------|--------------------|------|------|
| 1% ~ 100% | 锁住 | 用户「主动消耗权」· 我要用光这个号 | **尊重锁** · 不切 |
| 0% (硬耗尽) | 锁住 | 「主动消耗权」自然失效（无可消耗）· 锁成困局 | **越权接替** · 必切 |

道理：损之又损，损至零则强为之。锁住 1%-100% 是「为」的过程，归用户；
损至 0% 已是「无为」之境，再固执反成执念，此时强切非违心，乃顺势救人。

### 双层耗尽分离

```js
// v3.9.1 双层 (取代 v3.7.6 单层 isExhausted)
const isHardExhausted = !_hasCreditsActive && (drought
  ? (q.daily <= 0)
  : (q.daily <= 0 || q.weekly <= 0));
const isSoftExhausted = !isHardExhausted && !_hasCreditsActive && effQuota < threshold;

// ─── 硬耗尽: 账号已死 · bypass 一切守卫 ───
if (isHardExhausted && !_switching) {
  if (acc.skipAutoSwitch) log("🚨 硬耗尽越权 skipAutoSwitch: ...");
  // 强切, 不查 cooldown/reset/锁
}
// ─── 软耗尽: 仍有余量 · 尊重所有守卫 ───
else if (isSoftExhausted && !_switching && !switchCooldown && !acc.skipAutoSwitch) {
  // 临期保留 / reset等待 (加 >0 守卫) / 切号
}
```

### 整体自动切号体系 (v3.9.1 全图)

| 触发源 | 时机 | 阈值 | skipAutoSwitch | 冷却 | 重置等待 |
|--------|------|------|---------------|------|---------|
| **预防层 · per-msg 轮转** | 用户每发一条消息 | `autoSwitchThreshold` | 尊重 | 尊重 | 尊重 |
| **预防层 · W% 脉动边缘** | quota 变化检测 | 当前下降 ≥0.3% | 尊重 | 尊重 | 尊重 |
| **预防层 · ⚖额度变动** | daily%/credits 下降 | `quotaDeltaCreditsMin` 等 | 尊重 | 尊重 | 尊重 |
| **救火层 · 软耗尽** | `_tick()` 10s 巡检 | `effQ < threshold` 且 >0 | 尊重 | 尊重 | 尊重 |
| **救火层 · 硬耗尽** ★ | `_tick()` 10s 巡检 | `effQ <= 0` (D 或 W) | **越权** | bypass | bypass |
| **定时层 · 周期轮转** | `rotatePeriodMs` 到期 | — | 尊重 | 尊重 | 尊重 |
| **拦截层 · 429 rate-limit** | HTTP 拦截 | rate-limit 文本 | — | 尊重 | — |

**层层防御 · 道法自然**：

1. 预防层在 quota 下降时就预切，避免触底
2. 救火层是兜底，账号在 AI 响应中突然耗尽时接替
3. 硬耗尽越权是终极防线，确保 0% 不困死用户
4. 用户「主动消耗权」在 1%-100% 范围内完全保留
5. credits 充裕时 ($promptCredits + $flowCredits ≥ creditsThreshold) 一切耗尽判定失效（v3.7.6 保留）

### 改动文件 (本版 · 活分支)

- `_github_src/packages/wam/extension.js` (VERSION → 3.9.1, _tick() 双层耗尽)
- `_github_src/packages/wam/package.json` (3.9.0 → 3.9.1)
- `_github_src/packages/wam/CHANGELOG.md` (本条目)

### 整理目录 (反向审视的副产品)

冷分支与镜像测试归档：

- `_build_v321/` → `_archive/_build_v321_obsolete_v3.5.3/`
- `_test_v351_exhaust_dual_layer.cjs` → `_archive/_tests_镜像_obsolete/`
- `_test_v352_conv_turn_grace.cjs` → `_archive/_tests_镜像_obsolete/`
- `_deployed_v3xx.js.bak_pre_*` → `_archive/_deployed_backups/`

---

## v3.8.7 (2026-05-26) · 道法自然 · 对话备份MD彻底重推

> *反者道之动，弱者道之用* —— 帛书《老子》

### 实证根因 (diag_pb.js 实证 · 字段级别)

通过诊断脚本对真实PB逐字段扫描，确认：

- `fn=2@depth=0` = 对话步骤容器
- `fn=19@depth=1` = 用户输入子消息（其 `fn=3@depth=2` 字段存放干净文本）
- `fn=72@depth=1` = AI 轨迹（`CORTEX_STEP_TYPE_PLANNER_RESPONSE` 标记 AI 文本输出）
- **覆盖率根因**: 316 PB / 19 MD → 密钥发现在初始备份之后，大量 PB 永远没有等到 MD 生成

### 修复 (四项重构)

**① `_extractBestStringFromMsg` (新增)**
- 从 fn=19 子消息扫一层子字段，取最长可读字符串 = 干净用户文本
- URL编码路径过滤：`%XX` 占比 > 8% → 跳过（文件路径引用，非用户输入）
- 效果：`file:///e%3A/...` 这类路径不再被误识为用户消息

**② `_extractAiResponseFromTrajectory` (新增)**
- 从 fn=72@depth=1 提取 `CORTEX_STEP_TYPE_PLANNER_RESPONSE` 后的文本
- 去重：多个 context snapshot 中相同段落只保留一次
- 取最后一条（轨迹末尾 = 最新 AI 响应）

**③ `_parsePbConversation` 重构**
- 用户消息：`fn=19@depth=1` → `_extractBestStringFromMsg(f.data)`
- AI 响应：`fn=72@depth=1` → `_extractAiResponseFromTrajectory(f.data)`
- 按字节偏移排序 → 对话顺序正确
- 返回 `turns[]`（user/ai 交织）+ `userMsgs[]`（向后兼容）

**④ `_retroactiveMdGeneration` (新增) + 全覆盖补全**
- 密钥缓存命中时调用（每次启动）
- 密钥首次发现时调用
- 扫全部批次所有 PB，对缺失 MD 的逐一补生成
- 实测：296 个缺失 MD 将被自动补全

**`_pbToMdContent` 格式升级**
- 显示完整对话（👤 用户 N / 🤖 AI N 交织轮次）
- 标头增加 AI响应条数统计

---

## v3.8.6 (2026-05-26) · 反者道之动 · 三处根本修复 · 大道至简

> *道法自然，无为而无以为* —— 帛书《老子》

### 修复 (反向审视 v3.8.5 · 从根本底层)

**① `_cleanPbText` 大道至简 (形式归一)**
- 12行字符循环 → 1行正则，行为完全等价
- 正则引擎底层JIT比逐字符循环更快
- 覆盖范围不变: ASCII可见 + CJK统一 + 全角/半角 + 通用标点 + 换行

**② `_pbToMdContent` 消除双重IO + 中文对话标题盲区 (根本性修复)**
- 根因: `_extractPbTitle` 只扫 ASCII(0x20-0x7E)，中文字符(U+4E00+)完全不可见
  → 中文对话MD标题一直是UUID前缀如 `# 2f867281`
- 根因: `_extractPbTitle(pbPath)` 在 `_pbToMdContent` 内第2次 readFileSync + 第2次 decryptPb
- 修复: 三级兜底，利用已有 `conv.userMsgs[0]` (无需额外IO)
  ```
  ① meta.title (调用方已提供) → 直接使用
  ② conv.userMsgs[0].text[:60]  → 中/英文对话均适用 · 零额外开销
  ③ uuid[:8]                    → 无消息的空对话兜底
  ```
- 效果: 中文对话MD标题从 `# 2f867281` → `# 道法自然，审视本对话的所有核心成果...`

**③ `_initDecryptKey` 加单次重试 (覆盖竞争条件)**
- 根因: 启动期杀软锁住LS二进制时，5s扫描失败后永不重试
  → 密钥为null → 所有备份仅有PB无MD，直到重启
- 修复: 扫描无结果时，60s后单次重试（`setTimeout(_initDecryptKey, 60000)`）
- 覆盖场景: 杀软延迟释放 / LS二进制延迟写入 / 首次安装就绪竞争

---

## v3.8.3 (2026-05-26) · 额度链路回溯 · 道法自然 · 当前

> *反者道之动 · 无为而无以为* —— 帛书《老子》

### 修复 (回溯早期错误隔离)

**额度显示与切号链路完整恢复**
- `getStats()` 恢复 `checkedNoOverage` 字段 — 已验但无 Extra Usage 账号统计
- 侧边栏统计栏恢复 `X/Y激活 $Z` 展示 — 每个账号 Extra Usage 激活状态一目了然
- 正确隔离边界: 仅移除「领取$200」激活按钮 + 激活函数，保留全部显示与切号逻辑

**已验证完整额度链路 (五路)**
- `tick` 每30s轮询 `tryFetchPlanStatus` → 实时拉取 D%/W%
- `verify` 完成后 D%/W% 写入 health → 账号旁实时显示
- ⚡W%脉动信号 (ΔW≥0.3%) → `_maybeTrigger` → 自动切号
- 🔮 预判: 额度<25% 时预选下一健康号
- `_scheduleResetRefresh` 精准等到重置时刻 → 自动触发 verify 复活

### 保持隔离
- ~~`_activateOverageFull`~~ · ~~`_pollForOverage`~~ · ~~`_tryAllTriggers`~~ · ~~`doActivateAll`~~ — 领取$200 激活按钮，不需要

---

## v3.8.2 (2026-05-26) · PB→MD 彻底贯通

**备份对话全自动解密为可读 Markdown**
- raw protobuf 解析 (无需 schema) — `_protoReadVarint` / `_protoFields` / `_parsePbConversation`
- AES-256-GCM 解密 → f19@depth1 提取用户消息 → 格式化为 MD
- 全自动触发: 全量备份 + 增量备份均同步生成 .md
- `_exportConversationsMd` 增强: 补生成历史未 MD 的 .pb + 索引含 MD 状态列

---

## v3.8.1 (2026-05-26) · 道极归一 · 版本归正 · 软编码完备

> *知止不殆 · 可以长久* —— 帛书《老子》

### 版本号归正

v3.8.0 之后迭代过快（4.0/4.1/4.2），统一回归 v3.8.1 语义版本规范。

### 新增 (相对 v3.8.0)

**v3.8.1 · 自动消失通知**
- `_notifyTimed(level, msg, ttlMs)` — 卡住/死亡通知 10min 后自动从通知中心消失
- 有时效性的通知不再永久积压，用户无感知清洁

**对话解密引擎**
- `_decryptPb(ciphertext, key)` — AES-256-GCM 解密 .pb 文件
- `_extractPbTitle(pbPath)` — 从二进制扫描用户可读标题（v4.1 扩展过滤：排除模型名/AI推理/路径/JSON）
- `_initDecryptKey()` — 启动时异步自动发现解密密钥（扫 LS 二进制）
- `_resolveLanguageServerBin()` — 跨平台 LS 路径自适应（扫全盘符/平台候选/vscode.env.appRoot）

**备份增强**
- `_exportConversationsMd()` — 导出备份目录为 Markdown 文档（含标题/UUID/大小/@引用状态）
- webview handler `openPbDir` / `openBackupDir` / `exportConvMd` — 后端已就绪

**跨平台修正**
- `PB_DIR` 改用 `os.homedir()` 替代 `process.env.USERPROFILE`（Linux/macOS 更干净）
- `_initDecryptKey` 内 `HOME → os.homedir()`（修复潜在 ReferenceError）

### 移除 (相对 v3.8.0)

- `_activateOverageFull` / `_tryAllTriggers` / `_pollForOverage` — 自动激活200额度链路整体删除
- `_pendingAct` / `wam.autoActivate` 配置项 — 随激活链路一并删除
- `verifyOneAccount` 不再自动触发激活，只做被动探额（`_tryDevinBillingFallback` 保留）

### 对话追踪完备 (v3.7.3 ~ v3.8.0 累积)

- v3.7.3: .pb 健康检测 + 断电防护
- v3.7.4: 根治「未验号永远未验」三处修复
- v3.7.5: 对话追踪前端关闭按钮 + 提醒频率根治
- v3.7.6: 切号守门 + dismiss持久化 + 多窗口同步
- v3.7.7: 启动围栏（预启动卡住对话自动清零）
- v3.8.0: 四根修（10min静默 + 通知次数限制 + 有效计数修正 + 启动围栏）

---

## v3.7.2 (2026-05-25) · 两向根治「未验证」· 无为而无不为 · 当前

> *无为而无不为 · 民莫之令而自均焉* —— 帛书《老子》

### 病灶

断电/崩溃后全部账号显示「未验证」，用户须手动逐一重验，极大干扰体验。

### 两向并进（最小化）

**正向（防止）**
- `store.load()` 备份恢复链：主文件损坏/缺失 → 自动降级 `~/.wam/backups/` 日备份 → 无感恢复
- `_persistSessionCache` 防抖 500ms→100ms：缩短断电丢 token 时间窗口

**反向（出现即自动修复）**
- startup auto-verify：不管何因，只要检测到未验号 → 立即 `verifyAllAccounts({onlyStale:false})` 全量加速
- 现有 `isFirstTime` 保护（>50% 未验 → parallel=2 · 1500ms gap）自动激活，天网恢恢疏而不失
- 用户启动 IDE → 后台自动验 → 2-5min 全池复活 · 无需任何手动操作
- cache 非空 → 走原 `_cacheOnly` 快路，v3.7.1 行为完全兼容，零退化

### 守门

```
_test_v372_bidir.cjs · 25/25 全通
§A版本 · §B备份恢复(4静态+4vm) · §C启动反向(5静态+4vm) · §D sessionCache
```

---

## v3.7.1 (2026-05-25) · 大道至简 · 软编码归一 · 整合对话追踪全链路成果

> *为学者日益，为道者日损，损之又损，以至于无为，无为而无不为*

### 软编码完善 (7处硬编码→可配置)

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `wam.expiryFirst` | `true` | 临期账号优先加分开关 (v3.3.1已用，首次声明) |
| `wam.hubNotifyCooldownMs` | `300000` | 同一对话5min内只通知一次 |
| `wam.hubNotifyGlobalCdMs` | `5000` | 全局通知最小间隔5s |
| `wam.hubRenotifyIntervalMs` | `300000` | 持续卡住周期再通知间隔 |
| `wam.hubDataStaleMs` | `60000` | Hub引擎数据过期阈值 |
| `wam.autoBackupStartDelayMs` | `8000` | 启动后备份延迟 |
| `wam.incrementalBackupDebounceMs` | `3000` | 增量备份防抖延迟 |

### 归档整合 (对话追踪对话成果确认已全部集成)

以下功能均已在 v3.5.0-v3.6.0 期间完整集成，本版本确认并补全配置声明：

- `_hubLastStuckUuids` Map带时间戳 · 5min自动过期 · 允许重复通知
- `streamingList` 多对话逐行展示 (不再只显示1个)
- `_truncTitle(t,25)` 标题超长自动截断
- `_autoBackupDone` 今日已备份时立即标记(不误显"待备份")
- `_broadcastConvSection()` 定向更新conv区块(不全量重建sidebar)
- `dao-conv-collapsed` localStorage持久化折叠状态
- `convUpdate` 消息类型 — webview侧收到后保持折叠状态
- `_restoreConversationFromBackup()` @conversation 50限制突破
- `_writeAgentApi()` → `~/.wam/_api.json` 7个Agent能力接口
- RECOVER通知已移除 (减少密度，面板可见)

---

## v3.7.0 (2026-05-25) · 三维度归一 · 锁止复元 · 道法自然 · 彻底完善自动切号底层

> *大成若缺·其用不敝·大盈若盅·其用不窘 · 知止所以不殆 · 知常·明也*

### 五大根治

#### 「一」三维度归一 · promptCredits/flowCredits 余额入场

**根因**: `_scoreOf` / `_isValidAutoTarget` / `_tick` 三处完全忽略 `promptCredits` + `flowCredits` 独立资源池

**现象**: quota% 耗尽但余额充裕的账号被误判「不可用」→ 不用即废（不可逆损失）

**治法**:
- 新增 `_hasUsableCredits(h)` 辅助函数（门控: `wam.creditsThreshold` 默 1000）
- `_isValidAutoTarget`: credits 可用 → 放行（quota% 耗但 credits 在，仍可服务 flow/prompt 类请求）
- `_scoreOf`: `creditsBonus = min(500, totalCredits/200)` · 10K credits → +50分 · 100K → +500分（门控: `wam.creditsInScore`）
- `_tick` 耗尽判定: `isExhausted = effQuota < threshold && !_creditsStillOk` · credits 充裕时不触发切号

#### 「二」锁止机制复元 · isInUse 降分回归 `_scoreOf`

**根因**: v3.0 以「全号平等」为由移除 `isInUse` 检查 → 锁止形存实亡

**现象**: A→B 切号后 A 立即可回选 → 来回震荡 · `inUseLockMs` 配置有名无实

**治法**: `_applyInUse(s) = isInUse ? max(1, round(s×0.01)) : s` · 降至1%分值 · 非 -∞ 仍可作最后兜底

#### 「三」周日边沿修正 · `hoursUntilWeeklyReset` 精准化

**根因**: `(7-0)%7=0 → ||7` 强制跳7天 → 周日 UTC 07:59（距重置1分钟）却算7天后

**现象**: 周日16:00前（BJT）`waitResetHours` 判断失准 → 应等重置却误判为距重置遥远

**治法**: `dts=(7-day)%7` · 若算出时刻 `<=now` 再 `+7天` · 正确定位当前轮次

#### 「四」临期+余额协同 · 双重加持

`daysLeft<7` 且 credits 充裕 → `expBonus + creditsBonus` 同时叠加 → 即将过期且余额充裕的账号分值极高，优先被消耗

#### 「五」三维度状态可视化

`tick` 日志由 `D%/W%` 扩展为 `D%/W%/PC/FC` · Output:WAM 可实时观测三个维度消耗情况

### 新增配置项

| 配置 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `wam.creditsThreshold` | number | 1000 | credits 视为「可用」的最低总量 |
| `wam.creditsInScore` | boolean | true | credits 是否纳入 `_scoreOf` 评分 |

### 评分层级（更新后）

```
第三层 💎 overage   [1_000_000, 1_099_950]  存量·绝对优先（不变）
第二层 📊 pct+credits [1, 999_999]          quota% + expBonus + creditsBonus 三维综合
候补层 ⏳ 未验号     1~100                  inUse时×0.01降至1（v3.7.0复元）
-∞   永禁           无密码 / skipAutoSwitch / planEnd已过期
```

---

## v3.3.1 (2026-05-25) · 📅 临期优先微调 · 反者道之动 · 最小不侵入

> *反者道之动 · 不用即废先消耗 · 道法自然 · 无为而无不为*

**底层目标 (反向解构·只一句)**: `daysLeft` 升序作主键、quota 作次键、锁号已豁免。

**最小化改动 (3 处·共 ~5 行)**:

1. `_scoreOf` 末尾加 `expBonus = max(0, (60-daysLeft)) × 2000`
2. `planEnd < Date.now()` → 返 `-Infinity` (过期号不浪费切号)
3. 百分比层封顶 `9_999 → 999_999` (容纳临期分·仍远低于 overage 1_000_000)

**数学守门**:

- 1日差 = 2000 分 > quota 最大差 ~1880 → 临期维度**主导** quota 维度
- `daysLeft ≥ 60` 或 `planEnd=0` (永久/Pro) → bonus = 0 · **完全等同 v3.3.0**
- `daysLeft = 2` (截图红色): bonus = 116_000 · 远超普通账号 ~1500 总分

**新软门控**: `wam.expiryFirst` (默认 `true`) · `false` 则关闭临期主导 · 回退 v3.3.0 完整行为

**回归保护**: v3.3.0 overage 绝对优先逻辑、effQ 守门、`skipAutoSwitch=-∞`、未验号=100 **全部不变**

**守门测试**: `_test_v331_expiry_priority.cjs`

---

## v3.3.0 (2026-05-24) · 💎 额度绝对优先分层 · 反者道之动 · 存量先于流量

> *天之至私 · 用之至公 · 禽之制在炁*

**解构本源 (反者道之动 · 先解构隐藏在需求下的底层目标)**:

| 维度 | overage 美元 | 百分比配额 |
|---|---|---|
| 经济学性质 | **存量 (Stock)** | **流量 (Flow)** |
| 再生性 | 不可再生 · 用一分少一分 | 可循环 · 周期重置 |
| 不用的代价 | **沉没浪费** (废账户即损失真金白银) | 等待即回来 (无损失) |
| 道家映射 | "天下之物生于有" · 已生之物即损 | "有生于无" · 无穷归来 |

**病灶 (v3.2.1 之前 · 错误抽象)**:

`_scoreOf` 把两种本质不同的资源放在**同一个连续分数坐标系**里比大小:

- overage 账号:  `300 + min(100, $) + 时效` ≈ **150~460 分**
- 百分比账号:    `W*8 + D*3 + 时效`         ≈ **0~1830 分** (W50/D50 即 480+)

→ **主公图1 实证**: $195/$189/$208/$193/$185 等额度账号全部得 **400 分** (被 `min(100,$)` 封顶)  
→ 百分比账号 W50 反超之 → **实际行为与用户诉求完全相反** → 额度账号被冷落浪费 · 真金白银沉没

**治法 (九竅之邪在乎三要 · 可以動靜 · 分层各得其所)**:

```
═════════════════════════════════════════════════════════
║  切号决策金字塔 (绝对分层 · 各得其所 · 天之至私用之至公)
═════════════════════════════════════════════════════════
│
├─ 第三层 💎 OVERAGE 池 (存量·不用即损·绝对优先)
│   触发: overageActive = true (Extra Usage 余额 > 0)
│   主权: 1_000_000 基础分 · 永远凌驾百分比层
│   内排: overageDollars × 100 (全幅可比 · 去 min(100,$) 封顶)
│        $208=1_020_800 > $195=1_019_500 > $193=1_019_300
│   区间: [999_970, 1_099_950]
│
├─ 第二层 📊 百分比池 (流量·周期重置·次选)
│   触发: overageActive = false · effQ ≥ threshold
│   内排: W*8+D*3 + 时效 (沿用 v3.1.3 effQ 守门)
│   区间: [1, 9_999]  上限封顶 · 永不突破第三层
│
├─ 候补层 ⏳ 未验号 (待 verify 决定真相)
│   分数: 100  与 v3.0 一致 · 不夺主权
│
└─ -∞   永禁 (无密码 / 用户主动锁 skipAutoSwitch)
```

**自然顺应 (无为而无不为 · 一以贯之)**:

1. `getBestIndex`/`getSortedIndices` 天然受益 · **无需改动任何调用方**
2. 当前 active 是 overage 切号 → 自然选下一 overage (excludeIdx 排自己)
3. overage 全耗 (`overageActive=false`) → 自然下沉百分比层
4. 重置时刻 overage 复活 → `_scheduleResetRefresh` 触发 verify → 自然上跃

**软门控**: `wam.preferOverageFirst` (默认 `true` · 道法自然 · 推荐)

- `true`: 严格分层 · overage 绝对优先于百分比 (本版默认 · 实现用户诉求)
- `false`: 回退 v3.2.1 统一坐标系 · 兼容旧行为

**守门**: `_test_v330_overage_priority.cjs` 全通

- overage 永远 > 百分比 (无论 W%/D% 多高)
- overage 内部按金额排 ($208>$195>$193 顺序保留)
- overage 全锁 → 下沉百分比
- overage 全无 → 自然百分比
- 锁号 (skipAutoSwitch) 即使有 overage 也跳过

**诉求印证 (用户原话)**:

> "就是有额外额度的，就有额度的就先用额度的"  
> "百分比制的是没有额度之后才会跳转到百分比制"  
> "优先把有额度的账号先用完，而非先把有百分比的账号先用完"  
> "道法自然，无为而无不为"

→ **完全实现** · 道法自然 · 无为而无不为

---

## v3.2.1 (2026-05-23) · 额度重置感知 · 无为而无不为

> *迅雷烈风 · 莫不蠢然 · 至乐性余 · 至静性廉*

**额度重置感知 (天人合发)**:

- 「感知」 `_scheduleResetRefresh()` — 精准 setTimeout 到下次重置时刻
  - 每日 UTC 08:00 (北京 16:00) → 日额度重置 · 全池自动刷新
  - 周日 UTC 08:00 (北京 周日 16:00) → 周+日额度重置 · 全池自动刷新
  - 复用 `hoursUntilDailyReset()` / `hoursUntilWeeklyReset()` · 零重复
- 「效果」 耗尽号在重置瞬间自动复活 · 用户无感 · 无需等 30min 周期扫描
- 「联动」 `_setMode()` 模式切换自动管理定时器
  - WAM 模式 → 启动重置感知
  - 官方模式 → 停止重置感知
- 「安全」 verifyAll 进行中 → 30s 后重试 · 刷新完毕 → 自动重调度下次
- 「软编码」 `resetRefreshBufferMs` (默认 30s) — 重置后缓冲等待

**精简效果**: 6492 → 6546 行 (净增 54 行 · 换取用户无感体验)

**守门**: `_test_v321_validate.cjs` 30/30 全通

---

## v3.2.0 (2026-05-24) · 大道至简 · 三处归一 · 去芜存菁

> *圣人抱一而得天下事 · 至静之道 · 律曆所不能契*

**结构性改革 (为道者日损)**:

- 「归一」 `_setMode(mode)` — 模式切换三处归一
  - 旧: `case "setMode"` webview handler + `wam.setModeWam` cmd + `wam.setModeOfficial` cmd 三处独立实现
  - 新: 单一 `_setMode(m)` async 函数 · 三处均调用 · 逻辑一源
  - 官方模式: 停引擎 + `windsurf.logout` + 卸 guard (v3.1.4 三步净身)
  - WAM模式: 装 guard + 启引擎
  - 返回 `true`/`false` 示是否实际变更
- 「去芜」 删 `isTrialPlan()` (定义未调用 · `_isTrialLike` 已替代)
- 「去芜」 删 `URL_GET_PLAN_STATUS` 别名 (定义未引用 · `_LIST` 版保留)
- 「承」 v3.1.4 官方模式根治 + activate 条件守卫

**精简效果**: 6519 → 6492 行 (净减 27 行 · 逻辑更清晰)

**守门**: `_test_v320_validate.cjs` 20/20 全通

---

## v3.1.4 (2026-05-23) · 官方模式根治 · 自然之道静

> *自然之道静 · 故天地万物生*

**病灶**: 切官方模式后 WAM session token 残留 + openExternal guard 拦截官方登录 URL.

**三步净身** (切官方时):
1. 停引擎 (WAM 不再切号/扫描)
2. `windsurf.logout` 清 WAM 注入的 session
3. `_removeOpenExternalGuard` 放行官方浏览器登录

**activate 条件守卫**: WAM模式装 guard / 官方模式不装.

---

## v3.1.3 (2026-05-22) · effQuota 守门 · 一以贯之

## v3.1.2 (2026-05-22) · 限速感知 · cache全走 · v3.1.1 prewarm 已损

## v3.1.1 (2026-05-22) · sessionCache 持久化 · 零批量 devinLogin

## v3.1.0 (2026-05-22) · openExternal 持久守卫 · 切号零弹窗

## v3.0.6 (2026-05-21) · devinLogin 全局最小间隔 · broadcastUI 防抖

## v3.0.5 (2026-05-21) · UI状态持久 · 添加展开不闪烁

## v3.0.4 (2026-05-21) · 统一通知层 · URL多源健康度

## v3.0.2 (2026-05-21) · 独立持久化 · refresh驱动验证

## v3.0.1 (2026-05-21) · 反者道之动 · 手动至高优先 · 一锁覆万源

## v3.0.0 (2026-05-21) · 道法自然 · 无为而无不为 · 全量解构自封体系

## v2.8.5 (2026-05-20) · Devin 双轨 + 自动激活 + overage 走的弄比天下

---

## v2.7.5 (2026-05-14) · 治「单独 token 无法添加登录」· 道恒无名·万物自宾

> *道恒无名 · 朴唯小 · 而天下弗敢臣 · 侯王若能守之 · 万物将自宾 · 民莫之令而自均焉*

**缘起 · 主公图1 实证**: 5 行 `auth1_xxx` (无 email 同行配对) 粘入 + 添加账号 → 入 tokens 数组成孤儿 · accounts 不增 → 用户视觉 "未添加" → 无法直登.

**根因**: v2.7.1.1 「孤儿 token 入 tokens 数组待显式反查 email」之契约 · 对单 token 流派 (用户仅有 token · 无 email) 留无解之地.

**治法 · 道恒无名 · 名不可名 · 万物自宾**:

- §A `parseAccountText` 末段 · 孤儿 token → 占位 email 入 accounts (10 行)
  - 占位形 `<kind>.<sha8>@token.wam` (合法 email · 通过 `_isValidEmail`)
  - password 槽 = 原 token · 重启 `parseAccountText` 自然读回 (tryPair 识 email+token)
  - 防重: 同 token 反复粘贴不重复 (sha8 决定 placeholder 唯一)
- §B 立 `_isPlaceholderEmail(s)` 工具识别占位号 · UI/verify/rename 路径快判 (一函)
  - 位居 `_normalizeAccCreds` 之后/`parseAccountText` 之前 · 公器同列 · 大制无割
  - 此位令 parseAccountText 末 return 紧邻 loadAccountsFromFs (守 v2.7.0 schema 静态契约)
- §C webview domainBadge 加 "tk" · 占位号视觉可识 (`.dm.tk { bg:#5a3a14; color:#f0c674 }`)
- §D 5 kind 全适配: `auth1`/`session`/`jwt`/`apikey`/`refresh`/`raw`
  - 下游 `_normalizeAccCreds(acc)` 之 `_detectTokenKind(acc.password)` 自动分流 → loginViaToken
  - verify/login 后 quota/plan/expiry 等账号信息均可查询 · 用户无为

**老测套 8 处行为断言更新** (随 v2.7.5 主公诏唯变所适):
- `_test_v270_omni_recognize` §10.1/10.2/11.1/11.2 (4 处) — `r.accounts.length === 1` + placeholder regex
- `_test_v271_omni_token` §6.4/11.1/11.2 (3 处) — 孤儿 JSON auth1 / 综合识入 accounts
- `_test_v2711_main` §5.9 (1 处) — 单孤儿 token → 占位

**回归测 `_test_v275_single_token_omni.cjs · 57/0`**:

```text
[§1]  静态契约 (banner/VERSION/末段/_isPlaceholderEmail/.dm.tk)   12 测
[§2]  _isPlaceholderEmail 严判 5 kind × pos/neg                    10 测
[§3]  占位 email 通 _isValidEmail (合法 email 全栈兼容)             5 测
[§4]  主公图1 端到端 · 5 行 auth1 token → accounts.length===5      10 测
[§5]  5 形混粘 → 各形各号 · detectKind 分流                        10 测
[§6]  幂等 · 同 token 反复粘 · sha8 决定不重                        3 测
[§7]  不退化 · v2.7.0/v2.7.1.1/v2.7.4 兼容                          7 测
═════════════════════════════════════════
        57 过 / 0 败
```

**全测套 17/18 套 0 败 · 总 666/0** (v267 28/4 历史滞后 v2.6.9-2.6.10 中间态 · 不计).

**道一以贯之**: 32 章「道恒无名·朴唯小·而天下弗敢臣·侯王若能守之·万物将自宾」· 占位即真 · 名不可名 · 道隐无名而无不为.

## v2.7.4 (2026-05-14) · 🔒 独立持久化 · multi-window race-safe · 治🔒回退真本源

> *上善若水 · 水善利万物而有静 · 居众之所恶 · 故几于道矣*

**缘起 · v2.7.3 实证**: 多窗口并行运行时 · 一窗 lock 写入 wam-state.json 被另一窗覆盖 · 切号 🔒 状态回退.

**根因**: `wam-state.json` 单文件多字段 · 多 window 同时 save 之 race condition 致 `inUseUntil` 字段冲洗.

**治法**:

- §A `inUseUntil` 独立 持久化 `lock-state.json` · 与 wam-state.json 解耦
- §B `_persistLockState()` / `_loadLockState()` 一组工具
- §C 优先读独立 lock-state.json (multi-window race-safe)
- §D 兼容: 老 wam-state.json 含 inUseUntil 字段 · 仍读取 (向前兼容 · 一次性迁移)

**回归测 `_test_v274_lock_state_isolation.cjs · 26/0`** + `_test_v273_lock_persistence.cjs · 23/0`.

**道一以贯之**: 8 章「上善若水 · 居善地」· 数据居其位 · 不与他争 · 故多窗口和而不冲.

## v2.7.3 (2026-05-14) · 治🔒回退根 · 守一 · 大道至简

**根因**: v2.7.1/v2.7.2 lock-on-rotate 后 save 漏写 inUseUntil 字段 → reload 后🔒丢失.

**治法**: save 守一 — inUseUntil 入 _serialize 出口 · 一次写入 · 不破契约.

**回归测 `_test_v273_lock_persistence.cjs · 23/0`**.

**道一以贯之**: 39 章「昔之得一者:天得一以清·地得一以宁·神得一以灵」· 序列化守一·所有状态一齐入盘.

## v2.7.2 (2026-05-14) · 主公三诏 SemVer patch bump · 内涵同 v2.7.1.1

主公三诏「token 看做账号密码 · 直接复用一切 · 顺其自然」之 SemVer 合规版本号 patch bump · 内涵同 v2.7.1.1 · 三段为道 · 信言不美.

## v2.7.1 (2026-05-14) · 万法归一·token 直登 · 反者道之动·逆流解析所有 windsurf token

> *反者道之动 · 弱者道之用 · 天下之物生于有 · 有生于无*

**缘起 · 主公三图实证**:

| 图 | 实证 | 现象 |
|---|---|---|
| 图1 | 5 行单 `auth1_xxx` | 入 tokens 数组成孤儿 · UI 视为 "未添加" |
| 图2 | `email----auth1_xxx` 单行格式 | tryPair 错把 token 当 password (字面同居) |
| 图3 | v2.7.0 在 179 端实证 138 号·1 未验·25 耗尽·trial 状态混乱 | parseAccountText 残漏 |

**根因 · `parseAccountText` 失道之三病**:

- ① 反序 `token+email` (token 先 email 后) · token 缓存等下一 email 后未配对
- ② 单行 token + pendingEmail · token 入 password 槽路径未通
- ③ JSON {email, auth1_token} / {auth1: xxx} / refresh_token 等多形未识

**治法 · 反者道之动**:

- §A tryPair 升级 · email+token 优先返 `{email, token, kind}` (kind 来自 _detectTokenKind)
- §B items 加 'pair-token' 类型 · 配对循环加 token + pendingEmail 多行配对
- §C 反序 token+email · 单行 token+pendingEmail · 均入 accounts.password 槽 (token 与密码同居)
- §D 下游 `_normalizeAccCreds(acc)` 之 `_detectTokenKind(acc.password)` 自动分流 → loginViaToken
- §E 损 addBatch 之 tokenPairs/tokenUpdated 中转 · 仅返 `{ added, duplicate, tokens, addedEmails }`
- §F webview UI **完全不变** · 同 v2.7.0 placeholder + 单 textarea (主公二诏 · 太上下知有之)

**主公三诏 (v2.7.1.1 · 闻道者日损)**: "将 token 看做账号密码 · 直接复用一切 · 顺其自然"

- parseAccountText 复 v2.7.0 schema · 不再单存 tokenPairs · token 直入 password 槽
- 复制/落盘/UI/复用 一切 同 v2.7.0 · 自然无为 · 不惧方能成其大

**回归测**:
- `_test_v271_omni_token.cjs · 65/0` (主公三诏 · 经典+token 同居 password 槽)
- `_test_v2711_main.cjs · 46/0` (parseAccountText 复 v2.7.0 schema · addBatch 仅返 addedEmails)

**道一以贯之**: 40 章「反也者·道之动也·弱也者·道之用也」· token 看做密码 · 万法复归于一.

## v2.7.0 (2026-05-09) · 万法识号·守道反者 · 唯变所适·适应万法之格式

> *天下莫柔弱于水，而攻坚强者莫之能胜也，以其无以易之也*

**缘起 · 主公实证四图**:

| 图 | 实证 | 现象 |
|---|---|---|
| 图1 | 账号列表 117 号大量 "?天/未验/D?/W?" | 入库 email 严重污染 |
| 图2 | "+ 添加账号" placeholder | 用户依此粘贴 |
| 图3 | 微信发货 ("账号:..\n密码:含@\n账号管理器:点tps://..(去掉点)") | 含@密码灾难性误判 |
| 图4 | "卡号N: a@b.com / 卡密N: pass" | 词典缺·5 卡全军覆没 |

**根因 · `parseAccountText` 失道之四病**:

| 病 | 失道之处 | 行为 |
|---|---|---|
| ① | `卡号N:`/`卡密N:` 未在标签词典 | tryPair 错把 "卡号1" 当密码 |
| ② | `if(!v.includes("@"))` 排除带 @ 的"密码" → 兜底 `^\S+@\S+$` 误为新 email | 正主丢失 |
| ③ | tryPair 仅以 `includes("@")` 认 email | `XuE2@UXoq7JD` (是密码) 被认为 email |
| ④ | 配对仅 email→pass 单向 | 反序 (pass 先 email 后) 无法配对 |

**治法 · 反者道之动 · 弱者道之用 · 守一不退**:

- §A 立 `_isValidEmail` 严判 (local@domain.tld · 长度 5-254 · 不含全角分隔符) — 替代 `includes("@")` 草率认 email
- §B 扩标签词典 + 兼容 `\d*` 数字编号:
  - email +`卡号|号码|账户名|登录名|登陆名|number|num|e-mail`
  - pass  +`卡密|密钥|令牌|key|token|access(-token)?`
- §C 标签即定锚·守一不退 · 密码标签后**含 @ 仍为密码** · 邮箱标签后必须 `_isValidEmail` 才认
- §D tryPair 用 `_isValidEmail` 严判 + 双向兜底
- §E `pendingPass` 反向配对 (顺逆皆通)
- §F `_stripWxHints` 行尾剥离 `(无任何空格)`/`(去掉点)` 等微信提示
- §G `_isNoiseLine` 整行模板嗅探 (开头明确者跳: 自动发货/订单编号/账号管理器: URL)

**回归测 `_test_v270_omni_recognize.cjs · 73/0`** (v2.7.5 +1 行为对齐).

**软编码归一 · 单一信源 wamHomeDir**:

- 立 `Get-WamDir` 助手于 `_dao_lib.ps1` (尊 `_dao_env(.local).psd1` `wamHomeDir`)
- 6 PS 脚本字面 `'.wam'` → `Get-WamDir`
- Linux/macOS 兼: `USERPROFILE` → `HOME` 兜底

**道一以贯之**: 78 章「天下莫柔弱于水, 而攻坚强者莫之能胜也, 以其无以易之也」· 万法之格式如水, 守一者如石.

## v2.6.14 (2026-05-08) · 三守俱全·守一·大制无割·反者道之动

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
| **阴·辅** | ⚖额度变动 | `daily%` / `promptCredits` / `flowCredits` 多维度+微观 | `quotaDeltaDailyMin` (默 0.3%) + `quotaDeltaCreditsMin` (默 1) | 触发 → 进 `_maybeTrigger` 出口 |

**回归测 `_test_v2613_quota_delta.cjs · 44/0`**.

**道一以贯之**: 1 章「两者同出·异名同谓·玄之又玄·众眇之门」.

## v2.6.12 (2026-05-07) · 守一·抢跑治·道恒无名

- 修一: setActive 真切号时清基线 (`_lastQuotaPercent = null`) — 解跨账号假信号
- 修二: 加 `_lastQuotaEmail` · W% 比较只在同账号内进行
- 修三: 加 `_lastQuotaPulseAt` 时间戳 — ⚡W%脉动 触发后 60s 内 WAL/pb 让位

**净变**: +50 行 · 24 配置项.

## v2.6.11 (2026-05-07) · 真本源至·道恒无名·民自均焉

**实证**: WAL 信号本质不可靠 · settle 模型累积静默与 user send 频次解耦.

**根本治法 · 三守三损**:

- 损一: 删 settle 模型整段
- 损二: 删 max filter
- 损三: 删 三防抖
- 守一: ⚡ W%脉动 — Engine._tick 10s 周期查 weeklyQuotaRemainingPercent
- 守二: 配额自均 — 让账号配额自然均衡耗尽
- 守三: 长链路监控

**净变**: -3.1KB / 删 4 配置 / 删 2 死变量.

## v2.6.10 (2026-05-07) · 治人事天·莫若啬·checkpoint 过滤

- 加 `wam.walEdgeMaxBytes` 默 65536B (64KB) · delta > 此视为 checkpoint 噪
- 加 `_skipWalEdge` 函数 · log `wal·edge·skip[checkpoint:XXX > 64KB]`
- 二道互补: 空间过滤 (max 64KB) + 时间强锁 (60s minInterval)

## v2.6.9 (2026-05-07) · 道法自然·损 settle·留真信号

- 删 `_firePbSettle` · 删 watcher settle 分支 · 删 `_fireWalSettle`
- 留 `pb·new` 唯一信号源 (1:1 精确)
- 加 WAL 边沿首发 (单次 delta ≥ 512B 即 fire)
- 强 60s 全局强锁

**净变**: -120 行 · 为道日损.

## v2.6.8 (2026-05-06) · 实证调参 · 损泥灌沙

参数微调 · 实证证伪 cooloff 解除即触发病灶.

## v2.6.7 (2026-05-06) · 整文 debounce · 道之疏

- `perMessageDebounce(QUIET_MS=4000)` 全 reason 入口防抖
- 道一以贯之: 73 章「天网恢恢, 疏而不失」.

## v2.6.6 (2026-05-06) · 反者道之动 · 解构一切 · 逆流到底

**反者解** (40 章): cooloff → **settle** · debounce trailing edge 模式 · 静默 N ms 后才切号.

**实现**: `pb·send → pb·settle` / `wal·send → wal·settle` · `SETTLE_MS=15000`.

## v2.6.5 (2026-05-06) · 锚定本源 · 慎终若始

仅升版本号 + changelog · 行为零变化 · 治 v2.6.4 hotfix 进程缓存锁定.

## v2.6.4 (2026-05-06) · 去芜存菁 + quietSec 哨兵修

- 删死: `wam.netHookDisabled` · `wam.perMessageMinIntervalMs` (默 0 关·从未读)
- 补活: 三参数族 (sendDetect / walDetect)
- Hotfix: `lastGrow=0` 哨兵化 · 首检测 quiet="init"

## v2.6.3 (2026-05-06) · WAL 直达触发 · 大道至简 · 回归本源

**信号源**: `state.vscdb-wal` (用户 click Send 后 SQLite 同步写入的 WAL 帧).

**实现**: `_installWalWatcher` · 300ms 轮询 · `quiet=2s` · `cooloff=6s` · `min=1024B`.

## v2.6.2 (2026-05-05) · 跨实例声明锁 · 观复知常 · 万物并作

**修法**: `~/.wam/_l6_claim/` 声明目录 + `flag:"wx"` 原子排他创建.

## v2.6.1 (2026-05-05) · Layer 6 双信号 · 逆流到底

- 信号① `pb·new`: 新 .pb 文件 = 新对话 → 立即切号
- 信号② `pb·send`: 存量 .pb 文件大小增量 + 安静期检测 = 已有对话用户发消息

## v2.6.0 (2026-05-05) · 底层软编码 · 唯变所适 · 水无常形

- `RE_SESSION_TOKEN` 常量统一
- `_isTrialLike(h)` 全链对齐
- `_resolveCascadePbDir` Linux fallback 用 `os.homedir()`
- startup recovery 阈值用 `_cfg("autoSwitchThreshold",5)`

## v2.5.6 (2026-05-05) · 真根因 · Layer 6 信号文件 + 路径双修

- 文件改为 `globalStorage/state.vscdb-wal` (真信号)
- 旧 `path.dirname(path.dirname(storageUri))` → ONE dirname 修正
- delta 策略 WAL 正增量 ≥1KB
- fallback 四级: globalStorage WAL → globalStorage main → workspace → scan

## v2.5.5 (2026-05-04) · ideVersion 根因解

**修**: `tryFetchPlanStatus` metadata default `ideVersion` 由 `"1.0.0"` 改为 `"1.99.0"`.

## v2.5.4 (2026-05-04) · `_isTrialLike` 软判据

`_buildExpTag / _cleanseHealthOnLoad` 同步用软判据 (正则 `/trial/i`).

## v2.5.3 (2026-05-04) · Trial 脏数据自洁

`_buildExpTag` 增第 5 态 `Trial?` (黄·提示需重验).

## v2.5.2 (2026-05-03) · `_buildExpTag` 5 态 UI 标签

`?天` / `N天` (颜色阶梯) / `已过期` / `Trial?` / `∞`.

## v2.5.1 (2026-05-03) · `X-Devin-Auth1-Token` HTTP header

`windsurfPostAuth` body `auth1_token` → HTTP header `X-Devin-Auth1-Token`.

## v2.5.0 (2026-05-02) · 大减法 · Layer 6 跨进程触发

**修**: 引入 Layer 6 — `fs.watchFile()` 监听 `state.vscdb` mtime 变化. **跨进程稳**.

**减**: 删 Layer 1-5 全部网络钩代码 (-2300 行).

## v2.4.x → v2.5.0 减法路 (-62%)

| 减项 | 行 | 减因 |
|---|---|---|
| Layer 1-5 网络钩 | -2300 | cross-process 无效 |
| TurnTracker | -800 | Layer 6 已替 |
| AutoUpdate | -600 | 用户自部署 |
| 代币池跨账号管理 | -400 | 单文件本地 state 即可 |
| Firebase / Devin 全套登录链 | -2200 | `devinLogin + windsurfPostAuth` 双步即足 |
| 多重 fallback 兜底 | -200 | 信道单点已稳 |
| **共减** | **-6648** | **(10913 → 4265)** |

## 测试矩阵 (v2.7.5 · 18 套 · 17 套 0 败 666/0 + v267 历史滞后)

| 测试 | 断言 | 关注 |
|---|---|---|
| `_test_set_health.cjs` | 24/0 | health 写入幂等 |
| `_test_v241_real.cjs` | 20/0 | proto3 default + 真账号 (网络依赖) |
| `_test_in_use.cjs` | 57/0 | 使用中锁 + 失败计数 |
| `_test_e2e_msg_rotate.cjs` | 33/0 | 消息轮转 E2E |
| `_test_quota.cjs` | 12/0 | 配额波动检测 |
| `_test_v251_postauth_header.cjs` | 8/0 | postAuth header 协议 |
| `_test_v252_exptag.cjs` | 73/0 | UI 5 态 + Trial 清洗 |
| `_test_v255_ideversion.cjs` | 9/0 | ideVersion 1.99.0 锁 |
| `_test_v256_layer6_path.cjs` | 30/0 | Layer 6 路径双修 |
| `_test_v267_debounce.cjs` | 28/4 ⚠ | §1 baseline 滞后 · 历史不计 |
| `_test_v2613_quota_delta.cjs` | 44/0 | 阴阳结合 ⚖额度变动 |
| `_test_v2614_triple_throttle.cjs` | 66/0 | 三守俱全 |
| `_test_v270_omni_recognize.cjs` | 73/0 | 万法识号 |
| `_test_v271_omni_token.cjs` | 65/0 | 万法归一·token 直登 |
| `_test_v2711_main.cjs` | 46/0 | parseAccountText 守 v2.7.0 schema |
| `_test_v273_lock_persistence.cjs` | 23/0 | 🔒 持久化 |
| `_test_v274_lock_state_isolation.cjs` | 26/0 | 🔒 multi-window 隔离 |
| `_test_v275_single_token_omni.cjs` | 57/0 | 单 token 占位 email · 主公诏 |
| **合计** | **666/0** | **17/18 套全过 · v267 历史滞后** |

## 历史: v17.42.x 系满载版

v17.42.20 (2026-04-末) 及 v17.42.x 全系**满载本体**已归档于 [`_archive/wam-v17.42.20/`](../../_archive/wam-v17.42.20/):

- 完整 `extension.js` 437 KB / 10913 行
- 387 E2E 断言
- 完整 v17 CHANGELOG 72 KB · `_archive/wam-v17.42.20/CHANGELOG.md`

二者为**同名异体 · 各臻其极** · 不相代而相成.

---

*德经曰: 上士闻道 · 堇而行之. 道极版即「闻道而行」之践*
