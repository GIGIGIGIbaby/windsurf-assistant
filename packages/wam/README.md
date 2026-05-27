# WAM · RT Flow · v3.10.2 · 道法自然 · 万法归宗

> 太上，下知有之 · 道法自然 · 用户无为 · 插件无不为
>
> *天下莫柔弱于水，而攻坚强者莫之能胜也，以其无以易之也*

WAM (`rt-flow`) · Windsurf Account Manager · 自动切号 · 对话追踪 · 额度守护 · 道法自然

---

## 〇 · 一句话目标

```
用户在 Windsurf Cascade panel 发消息 → WAM 自动切到下一健康号
↑
用户无为（无任何额外操作）
插件无不为（auto-verify · 评分 · 切号 · 流式避让 · 额度守护 · 对话追踪）
```

---

## 一 · 快速开始

### 1. 安装

**方式 A · VSIX 本地安装（推荐）**

```
Ctrl+Shift+P → Extensions: Install from VSIX → 选择 rt-flow-3.10.2.vsix
```

最新 VSIX 见 [Releases](https://github.com/zhouyoukang/windsurf-assistant/releases)

**方式 B · 开发者部署（从源码）**

```powershell
# 克隆后进入 packages/wam 目录
cd packages/wam

# 一令部署到本机（自动读取 VERSION 和 extensions.json）
.\_dao_deploy.ps1 -LocalOnly

# 重载生效
# Ctrl+Shift+P → Developer: Reload Window
```

### 2. 添加账号

打开 WAM 面板（左侧活动栏 **RT Flow** 图标）→ `+ 添加账号`

支持任意格式粘贴（`email password` / 微信发货文本 / 卡号卡密 / Token 等）

或直接编辑 `~/.wam/accounts.md`（每行一个账号：`email password`）

### 3. 开始使用

WAM 启动后自动：

- 验证所有账号额度（D%/W%）
- 选择最优账号登录
- 用户发 Cascade 消息后自动切到下一健康号
- 额度归零时立即切号（硬耗尽越权保护）

---

## 二 · 核心功能

### ⚡ 自动切号（Auto-Switch）

| 触发 | 条件 | skipAutoSwitch 锁 |
|------|------|-----------------|
| 每条消息 | 用户发 Cascade 消息 | 尊重 |
| W% 脉动 | 周额度下降 ≥ 0.3% | 尊重 |
| 软耗尽 | effQuota < threshold (默 5%) | 尊重 |
| **硬耗尽** ★ | D=0% 或 W=0% | **越权**（0% 已无可消耗） |
| 零额度紧急 | 切入后 2s 发现 D=0/W=0 | — |
| 时间轮转 | rotatePeriodMs 到期 | 尊重 |

**切号守门（防切入低额号）**：

- `D < autoSwitchDailyMin (默 5%)` → 不进候选池
- `W ≤ autoSwitchWeeklyMin (默 3%，非干旱)` → 不进候选池
- 切入后发现 D=0/W=0 → 2s 内重触（`wam.zeroQuotaRetickMs`）

### 📊 账号评分体系

```
第一层  💎 Extra Usage（overageActive）     [1_000_000+]  存量绝对优先
第二层  📊 百分比配额 + credits + 临期加成   [1~999_999]   综合评分
候补层  ⏳ 未验证账号                         100
−∞      永禁  无密码 / skipAutoSwitch / 过期
```

### 🔍 对话追踪（Stuck Detection）

内置 Cascade 对话卡住引擎（`dao_stuck.js`），自动：

- 检测 Cascade 对话卡住 / 死亡 / 恢复
- 在 Windsurf 左下角弹通知（可配置冷却）
- WAM 激活时自动启动，崩溃自动重启

### 💾 对话备份

- 自动全量备份 `.pb` 对话文件到 `~/.wam/conversation_backups/`
- 增量备份（防抖 3s）
- 多密钥池兜底解密（应对 Windsurf 版本升级换密钥）
- 全字段 Markdown 导出：用户消息 + AI思考 + 工具调用 + 错误 + 代码上下文

---

## 三 · 关键配置（`wam.*`）

> 全部配置均可在 `Ctrl+,` → 搜索 `RT Flow` 中查看和修改

### 切号行为

| 配置项 | 默认 | 说明 |
|--------|------|------|
| `wam.autoSwitchThreshold` | 5 | 自动切号阈值（effQuota < 此值触发） |
| `wam.autoSwitchDailyMin` | 5 | 日额度最低门槛（D<5% 不进候选池） |
| `wam.autoSwitchWeeklyMin` | 3 | 周额度最低门槛（W≤3% 非干旱不进候选） |
| `wam.zeroQuotaRetickMs` | 2000 | 切入零额度账号后紧急重触延迟（ms，0=禁用） |
| `wam.rotateOnEveryMessage` | true | 每条消息自动切号 |
| `wam.switchCooldownMs` | 15000 | 两次自动切号最小间隔 |
| `wam.waitResetHours` | 3 | 距重置 N 小时内等待重置而非切号 |
| `wam.preferOverageFirst` | true | Extra Usage 账号绝对优先 |
| `wam.expiryFirst` | true | 临期账号（<60天）加分优先消耗 |
| `wam.creditsThreshold` | 1000 | credits 可用的最低总量（promptCredits + flowCredits） |

### 额度检测信号

| 配置项 | 默认 | 说明 |
|--------|------|------|
| `wam.scanIntervalMs` | 10000 | W% 轮询周期（ms，最小 5000） |
| `wam.quotaPulseMinDelta` | 0.3 | W% 脉动触发阈值（%） |
| `wam.walDetect` | true | WAL 直达触发（click Send 底层信号） |
| `wam.perMessageMinIntervalMs` | 60000 | 全局切号最小间隔（全 reason 强锁） |

### 验证 & 启动

| 配置项 | 默认 | 说明 |
|--------|------|------|
| `wam.autoVerifyOnStartupMs` | 30000 | 启动后自动验号延迟（0=关） |
| `wam.autoVerifyPeriodMs` | 1800000 | 周期自动验号间隔（30min） |
| `wam.verify.parallel` | 3 | 批量验号并发数 |
| `wam.startupDelayMs` | 3500 | 启动后延迟首次登录 |

### 对话追踪 & 备份

| 配置项 | 默认 | 说明 |
|--------|------|------|
| `wam.stuckNotify` | true | 对话卡住/死亡通知 |
| `wam.hubNotifyCooldownMs` | 300000 | 同一对话通知冷却（5min） |
| `wam.conversationBackupDir` | "" | 备份目录（空=默认 `~/.wam/conversation_backups`） |
| `wam.autoBackupStartDelayMs` | 8000 | 启动后备份延迟 |
| `wam.incrementalBackupDebounceMs` | 3000 | 增量备份防抖 |

---

## 四 · 账号格式（万法识号）

支持任意粘贴格式：

```text
# 标准格式
email@example.com  password123

# 卡号卡密格式
卡号1: a@b.com
卡密1: pass123

# 微信发货文本（含"密码:含@的字符串"等复杂格式）
账号: a@b.com
密码: My@Pass!1

# Token 直登（auth1/session/JWT/apikey）
auth1_xxxxxxxxxxxxxxxxxxxxx
```

---

## 五 · 数据目录（`~/.wam/`）

```text
~/.wam/
├── accounts.md              账号库（主私产 · gitignored）
├── wam-state.json           账号健康数据 + 验证结果
├── lock-state.json          skipAutoSwitch 锁持久化
├── wam.log                  运行日志（Output:WAM）
├── _hub.json                对话追踪引擎心跳数据
├── _api.json                Agent API 接口（供外部调用）
├── conversation_backups/    Cascade 对话备份
│   ├── *.pb                 原始对话文件
│   └── *.md                 解密导出 Markdown
└── stuck-detect/            卡住检测引擎（dao_stuck.js）
```

---

## 六 · 部署工具（PowerShell）

仅需安装了 PowerShell 的 Windows 系统，无其他依赖：

```powershell
# 部署到本机（自动找 extensions.json · 不硬编码路径）
.\_dao_deploy.ps1 -LocalOnly

# 部署到本机 + 远程（需先配置 _dao_env.local.psd1）
.\_dao_deploy.ps1

# 干跑（仅显示计划 · 不写文件）
.\_dao_deploy.ps1 -DryRun

# 部署后验证
.\_dao_postreload_verify.ps1
```

**三层配置（后者覆盖前者）**：

1. `_dao_env.psd1` — git 跟踪 · 仅 local target · 任何 clone 即可工作
2. `_dao_env.local.psd1` — gitignored · 本机专属（远程主机等）
3. `WAM_TARGETS_JSON` 环境变量 — 临时 override

---

## 七 · 文件清单

```text
# 核心（不可动）
extension.js           ~410 KB   插件核心（v3.10.2）
package.json            ~13 KB   配置声明（42 配置项）
dao_stuck.js           ~100 KB   对话追踪引擎（内嵌 VSIX）
媒体/图标              media/

# 部署工具（dao_* 系列 · 版本无关 · 万家通用）
_dao_env.psd1                    默认配置（git 跟踪）
_dao_env.local.psd1.example      本地配置模板
_dao_deploy.ps1                  一令部署
_dao_lib.ps1                     共享函数库
_dao_postreload_verify.ps1       部署后验证

# 账号库（用户私产 · gitignored）
账号库.example.md               模板（git 跟踪）
账号库最新.md                   实际账号库（gitignored）
```

---

## 八 · 版本历史（精要）

| 版本 | 日期 | 核心 |
|------|------|------|
| **v3.10.2** | 2026-05-27 | 备份体系完善：多密钥池 · stub MD · retroactive三重重试 · PB全字段提取(fn=20/28/24/13/72) |
| v3.10.1 | 2026-05-27 | 零额度紧急重触（切入 D=0 → 2s 再切）· autoSwitchDailyMin/WeeklyMin 软编码 |
| v3.10.0 | 2026-05-27 | 卡住引擎归一（dao_stuck.js 内嵌 VSIX · 自动管理生命周期） |
| v3.9.1 | 2026-05-27 | 硬耗尽双层（D=0 越权 skipAutoSwitch · 软耗尽尊重用户主动消耗权） |
| v3.8.4 | 2026-05-26 | 绝对最低门槛（D<5 或 W≤3 不入候选池） |
| v3.7.0 | 2026-05-25 | 三维度归一（credits 独立资源池 · 锁止复元 · 临期+余额协同） |
| v3.3.0 | 2026-05-24 | Extra Usage 绝对优先分层（存量>流量） |
| v2.7.0 | 2026-05-09 | 万法识号（任意格式账号文本解析） |
| v2.6.14 | 2026-05-08 | 三守俱全（全栏 60s + WAL 冷却 2s + 启动暖启 5s） |
| v2.6.11 | 2026-05-07 | W% 脉动真本源（后端计费信号 · 零噪音） |

完整历史见 [CHANGELOG.md](./CHANGELOG.md)

---

## 九 · GitHub

- 仓库: <https://github.com/zhouyoukang/windsurf-assistant>
- 插件目录: [`packages/wam/`](https://github.com/zhouyoukang/windsurf-assistant/tree/main/packages/wam)
- Releases: <https://github.com/zhouyoukang/windsurf-assistant/releases>

---

*道法自然 · 用户无为 · 插件无不为 · 无为而无以为*

