# Windsurf 远程修复工具箱 v1.0

> 道生一·一生二·二生三·三生万物
> 一站式解决 Windsurf 登录失败、限流、Continue中断、额度耗尽等所有问题

---

## 快速开始

**双击 `一键修复.cmd` → 选9(全自动) → 等待完成 → 启动Windsurf → 登录**

---

## 前提条件

- Windows 10/11
- Python 3.8+ (用于py脚本)
- Windsurf 已安装 (D:\Windsurf 或 默认用户安装路径)
- **修复前请先关闭 Windsurf**

---

## 文件清单

| 文件 | 功能 | 使用方式 |
|------|------|----------|
| `一键修复.cmd` | **总入口** — 菜单式选择或全自动 | 双击运行 |
| `fix_windsurf_login.ps1` | 登录修复 — 清理缓存/代理/DNS/auth残留/验证连通性 | 选项1 |
| `telemetry_reset.py` | 设备指纹重置 — 5个UUID+session日期+plan缓存 | 选项2 |
| `patch_continue_bypass.py` | Continue无限续接 — P1-P5(maxGen=9999+AutoContinue+ParallelRollout) | 选项3 |
| `patch_rate_limit_bypass.py` | 限流绕过 — P6-P10(hasCapacity=true+quota永不耗尽) | 选项4 |
| `ws_repatch.py` | workbench深度补丁 — GBe静默拦截+resetAt精确时间戳+per-model窗口 | 选项5 |
| `credit_toolkit.py` | 积分监控 — 实时plan状态/模型成本矩阵/SWE委派 | 选项6 |
| `windsurf-login-helper-9.0.0.vsix` | 登录助手扩展 — 辅助登录流程 | 选项7 |
| `restore_windsurf.py` | 恢复原始文件 — 从备份回滚所有patch | 选项8 |
| `windsurf-multi.ps1` | 多实例管理 — 多账号并行运行 | 高级用法 |

---

## 详细说明

### 1. 登录修复 (`fix_windsurf_login.ps1`)

**解决问题**: 登录页面打不开、登录后无响应、代理残留导致连接失败

**执行步骤**:
1. 关闭所有Windsurf进程
2. 清理Chromium Network缓存(死代理缓存)
3. 清理Cache/GPUCache/Service Worker
4. 清理Session Storage
5. 修复settings.json(禁用代理)
6. 确保系统代理已禁用
7. 刷新DNS缓存
8. 清理auth残留(user_settings.pb/SharedStorage/DIPS)
9. 验证(hosts文件/代理/WAM证书/防火墙/HTTPS连通性)

```powershell
# 以管理员身份运行
powershell -ExecutionPolicy Bypass -File fix_windsurf_login.ps1
```

### 2. 设备指纹重置 (`telemetry_reset.py`)

**解决问题**: Trial额度用完、设备被标记、需要重新获得免费额度

**重置的5个标识符**:
- `telemetry.machineId` (64-char SHA256)
- `telemetry.macMachineId` (32-char UUID)
- `telemetry.devDeviceId`
- `telemetry.sqmId`
- `storage.serviceMachineId`

```bash
python telemetry_reset.py              # 重置遥测ID
python telemetry_reset.py --show       # 仅查看当前ID
python telemetry_reset.py --cache      # 同时重置cachedPlanInfo(推荐)
python telemetry_reset.py --restore    # 从备份恢复
```

### 3. Continue无限续接 (`patch_continue_bypass.py`)

**解决问题**: 每25次tool call就弹出Continue按钮、中断工作流

**5处patch**:
- **P1**: extension.js maxGen 0→9999
- **P2**: workbench.js maxGen 0→9999 (×2处)
- **P3**: chat-client maxGen 0→9999
- **P4**: AutoContinue DISABLED→ENABLED (核心突破)
- **P5**: ParallelRollout注入 (2并行×50invocations, 实验性)

```bash
python patch_continue_bypass.py              # 应用所有patch
python patch_continue_bypass.py --verify     # 仅验证状态
python patch_continue_bypass.py --status     # 完整报告
python patch_continue_bypass.py --rollback   # 回滚
python patch_continue_bypass.py --watch      # 检测更新自动重patch
```

### 4. 限流绕过 (`patch_rate_limit_bypass.py`)

**解决问题**: "You have reached your message limit"、高需求模型被阻断

**patch列表**:
- **P6**: Rate Limit Bypass — `!Q1.hasCapacity` → `!1` (永不阻断)
- **P7**: Capacity Check — `!Pu.hasCapacity` → `!1`
- **P8**: Input Blocker — INSUFFICIENT_CASCADE_CREDITS不再阻止输入
- **P9**: gRPC Credit Error — 信用检查函数永远返回false
- **P10**: Quota Exhaustion — `DVe()→!1` (日/周配额永不耗尽)

```bash
python patch_rate_limit_bypass.py status   # 查看状态
python patch_rate_limit_bypass.py apply    # 应用
python patch_rate_limit_bypass.py revert   # 回滚
```

### 5. workbench深度补丁 (`ws_repatch.py`)

**解决问题**: 限流错误消息打扰用户、无精确重置时间

**patch内容**:
- **Patch 3**: GBe全静默 — 限流错误消息完全不显示，信号通过globalThis传递
- **Patch 5**: _resetAt精确时间戳 — 从"Resets in: Xm Ys"提取精确毫秒
- **Patch 6**: per-model窗口常量 — claude-opus各变体冷却窗口注入

```bash
python ws_repatch.py           # 检查并按需打补丁
python ws_repatch.py --force   # 强制重新打
python ws_repatch.py --check   # 仅检查状态
python ws_repatch.py --status  # 详细状态+根因分析
```

### 6. 积分监控 (`credit_toolkit.py`)

```bash
python credit_toolkit.py monitor     # 实时积分状态
python credit_toolkit.py models      # 模型成本矩阵
python credit_toolkit.py recommend   # 优化建议
python credit_toolkit.py serve       # HTTP Dashboard :19910
```

**0成本模型**(无限免费):
- SWE-1.5 / SWE-1.6 — 0x
- Gemini 3 Flash — 0x
- Kimi K2.5 — 0x
- DeepSeek R1 — 0x

---

## 常见问题

### Q: 登录页面一直转圈？
A: 执行选项1(登录修复)，重点检查火绒/安全软件是否拦截了Windsurf网络请求。

### Q: 提示"corrupt installation"？
A: 正常现象，patch修改了文件校验和。点击齿轮图标 → "Don't Show Again"。

### Q: Windsurf更新后patch失效？
A: 重新运行选项9(全自动)。或使用 `python patch_continue_bypass.py --watch` 自动检测并重patch。

### Q: 想恢复原始状态？
A: 选项8可恢复。每次patch前都会自动备份到 `_windsurf_backups/` 目录。

### Q: 没有Python怎么办？
A: 选项1(登录修复)只需PowerShell，无需Python。下载Python: https://python.org/downloads/

### Q: 火绒/杀毒软件拦截？
A: 将Windsurf安装目录加入信任区: 火绒 → 安全防护 → 信任区 → 添加 Windsurf.exe

---

## 最优使用策略

```
P0: BYOK自带API Key → 0 Windsurf成本(最优解)
P1: 使用0成本模型(SWE-1.5/Gemini Flash/DeepSeek) → 无限免费
P2: 减少Context/Rules → 新体系按token计费，少=省
P3: 并行tool calls → 减少invocations消耗
P4: 选高性价比模型 → GPT-4.1(1x) > Sonnet(2-4x) > Opus(4-12x)
```

---

## 技术架构

```
Windsurf认证链:
  Firebase登录 → idToken(JWT) → GetOneTimeAuthToken → authToken → 注入LS session

计费体系 (3/18定价改革后):
  Credits → Quota/ACU (日+周双重刷新)
  billingStrategy: CREDITS=1 / QUOTA=2 / ACU=3
  服务端控制一切，客户端patch仅影响UI门禁

设备指纹 (5个UUID):
  machineId(SHA256) + macMachineId + devDeviceId + sqmId + serviceMachineId
  → 重置 = 服务端视为新设备 = 新Trial

gRPC服务端点:
  server.codeium.com / server.self-serve.windsurf.com / register.windsurf.com
  inference.codeium.com / unleash.codeium.com (功能开关)
```

---

## Agent 统一中枢 (`windsurf-agent.ps1`)

**整合所有工具的单一入口，Agent底层直接调用，本地/远程双模。**

| Action | 功能 | 用法 |
|--------|------|------|
| `status` | 进程/认证/patch/连通性全检 | `.\windsurf-agent.ps1 status` |
| `fix` | 一键全修(缓存+指纹+patch+hosts) | `.\windsurf-agent.ps1 fix` |
| `patch` | Continue+限流+workbench补丁 | `.\windsurf-agent.ps1 patch` |
| `guard` | 系统安全诊断+hosts守护 | `.\windsurf-agent.ps1 guard` |
| `deploy` | 推送工具箱到远程机器 | `.\windsurf-agent.ps1 deploy -Remote` |

**远程执行**: 任何Action加 `-Remote` 即在对端机器执行(WinRM)

```powershell
# 本地状态
.\windsurf-agent.ps1 status

# 远程状态(自动检测对端)
.\windsurf-agent.ps1 status -Remote

# 远程全修
.\windsurf-agent.ps1 fix -Remote

# JSON输出(Agent解析用)
.\windsurf-agent.ps1 status -Json
```

**部署路径**:
- 台式机(141): `E:\道\道生一\一生二\远程windsurf修复\`
- 笔记本(179): `C:\Tools\WindsurfAgent\`

---

*Generated 2026-04 | 道法自然*
