# 060-修复_Repair · 道法索引

> **道德经第四十八章**：为道日损，损之又损，以至于无为，无为而无不为。  
> **本目录定位**：Windsurf 体系一切疑难杂症的"修复方剂房"。后续 agent 进入此目录，应先读本文档。

---

## 一、目录全景（去芜存菁后）

### 历史成果（01-07 系列：早期 dao 体系故障复盘）
| 文件 | 主题 |
|---|---|
| `01-真本源_七层金字塔.md` | 故障层次模型 |
| `02-治本动作_1to1还原.md` | 1对1还原方法 |
| `03-验证全相_终极态.md` | 终极态验证 |
| `04-时间线_全过程.md` | 时间线还原 |
| `05-经验_着相破除录.md` | 经验教训 |
| `06-zhou账号_本机复现录.md` | zhou 账号本机复现 |
| `07-zhou治本验证_闭环全相.md` | zhou 闭环验证 |

### 本次新增（08 系列：WebView 黑屏根因 + 工具法器）
| 文件 | 主题 | 用法 |
|---|---|---|
| **`08-WebView黑屏根因_CSP_sha256失配.md`** | **核心根因文档**（七层根因解构 + 修复方案对照） | 阅读 |
| `08_diagnose.ps1` | 诊断脚本 · 检测 CSP 失配 | `& .\08_diagnose.ps1` |
| `08_apply.ps1`    | 修复脚本 · 自动/hash/unsafe-inline 三模式 | `& .\08_apply.ps1` |
| `08_revert.ps1`   | 回滚脚本 · 从 .bak 恢复 | `& .\08_revert.ps1` |
| `08_verify.ps1`   | 验证脚本 · CDP 闭环健康检查 | `& .\08_verify.ps1` |
| `_archive_20260527_道法CSP/` | 本次会话所有诊断产物归档 | 参考资料 |

### 历史脚本（根目录保留 4 个主脚本）
| 文件 | 用途 |
|---|---|
| `diag.ps1` / `repair.ps1` / `verify.ps1` / `repair_user.ps1` | 早期通用脚本（不针对 CSP，针对其他故障层次） |

### 历史诊断细文件（归档至 `_archive_20260527_道法CSP/04-历史诊断/`）
| 类型 | 说明 |
|---|---|
| `_remote_R*.txt` / `_remote_*.js` | 早期远程诊断步骤记录 |
| `_phase*.ps1` / `_phase*.txt` | 早期分阶段清理脚本 |
| `_check_*.ps1` / `_check_*.json` | 各类版本/插件校验脚本 |
| `_dao_verify_*.js` / `_diag_*.txt` | 早期 dao 验证产物 |
| `_snap_20260515135811/` / `agent-remote-repair-main/` / `phaseA/` | 历史快照与远程 agent 工程 |

---

## 二、后续 agent 标准入口（三步法）

### 第 1 步：辨识病灶
如果用户报告"Windsurf 插件 UI 不显示 / webview 空白"类问题，**首先执行**：
```powershell
& "e:\道\道生一\一生二\Windsurf万法归宗\060-修复_Repair\08_diagnose.ps1"
```
- **STATUS: HEALTHY** → 不是 CSP 问题，去看 01-07 历史诊断模型
- **STATUS: DAMAGED** → 转入第 2 步
- **STATUS: UNKNOWN** → 看 `08-WebView黑屏根因_CSP_sha256失配.md` 的诊断指纹章节，手工排查

### 第 2 步：施药修复
```powershell
& "e:\道\道生一\一生二\Windsurf万法归宗\060-修复_Repair\08_apply.ps1"
```
- 默认 `-Mode auto`（采 unsafe-inline 稳态路径）
- 如需更保守的 hash 同步：`-Mode hash`
- 干跑预览：`-DryRun`

修复后**必须重启 Windsurf** 才能生效（CSP 在 webview 加载时读取，已加载的 webview 不会重新读 CSP）。

### 第 3 步：闭环验证
```powershell
& "e:\道\道生一\一生二\Windsurf万法归宗\060-修复_Repair\08_verify.ps1"
```
启动一个独立的 Windsurf 实例（不干扰用户当前窗口），通过 CDP 直接探测 webview 健康度，截图证据保存到 `C:\Temp\windsurf_verify_<ts>\`。

**判定标准**：
- `PASS: All webview iframes have SW controller + inner iframe.` → 修复成功
- `FAIL: ...` → 回滚后改用其他模式重试：`08_revert.ps1` → `08_apply.ps1 -Mode hash`（或 unsafe-inline）

---

## 三、为何这是"道法自然"

### 1. 反者道之动
- 用户报告"插件 UI 不显示"
- 反推七层：iframe 黑 → SW 无 controller → bootstrap 未运行 → CSP 拒绝
- 最深一层的根因（hash 失配）只是字符串比较，但表象却铺盖整个 IDE 的 webview 层
- **越深的根因，越简洁；越简洁的根因，越彻底**

### 2. 弱者道之用
- 修复**只动一行 CSP 字符串**
- 不重写扩展、不改 Windsurf 业务逻辑、不重新打包 vsix
- 损伤最小，效果最彻底

### 3. 无为而无不为
- 不试图理解 dao-fix patch 的全部增量改动（让它继续存在）
- 不试图重构 webview 三层架构
- 只让 CSP 与 patched script "**重新一致**"
- 一切自然恢复

---

## 四、长期维护（重要！）

**Windsurf 升级会覆盖 `index.html`** —— 升级后需重新 apply。建议做法：

1. **手动**：升级后立即跑 `08_diagnose.ps1` → 若 DAMAGED → 跑 `08_apply.ps1`
2. **半自动**：把 `08_apply.ps1` 加入 Windsurf 启动钩子（如 dao-proxy-min 的 activate 时检测 CSP，自动 apply）
3. **完全自动**：在系统 Task Scheduler 中设置每天检测 + 自动修复

但请注意：每次 Windsurf 升级，**hash 同步路径会失效**（新版本 inline script 内容不同），需重新检测。**unsafe-inline 路径则一劳永逸**。

---

## 五、修复成败的可观察证据（如何确认修复成功）

| 证据层 | 修复前 | 修复后 |
|---|---|---|
| CDP `/json/list` 是否含 `[service_worker]` target | ❌ 无 | ✅ 有，URL 含 `service-worker.js?v=4&vscode-resource-base-authority=...` |
| webview iframe DOM `navigator.serviceWorker.controller` | `null` | 非 null（state: "activated"） |
| webview iframe DOM `document.body.children.length` | 1（只有 bootstrap script tag） | 2（script tag + inner iframe） |
| webview iframe DOM `document.querySelectorAll('iframe').length` | 0 | 1（inner fake.html） |
| 用户视角 | 任何插件 webview view 空白 | 内容正常显示 |

详细的 CDP 探针实现见 `_archive_20260527_道法CSP/01-诊断脚本/`。

---

## 六、紧急联系方式（应急回滚）

如果修复后 Windsurf 反而无法启动或行为异常：

```powershell
# 列出所有备份
& "e:\道\道生一\一生二\Windsurf万法归宗\060-修复_Repair\08_revert.ps1" -ListOnly

# 回滚到最近备份
& "e:\道\道生一\一生二\Windsurf万法归宗\060-修复_Repair\08_revert.ps1"

# 回滚到特定备份
& "e:\道\道生一\一生二\Windsurf万法归宗\060-修复_Repair\08_revert.ps1" -BackupName "index.html.bak_dao_csp_fix_20260527_023550"
```

所有备份位于 `E:\Windsurf\resources\app\out\vs\workbench\contrib\webview\browser\pre\`，文件名带 `.bak_*` 后缀。

---

## 七、最终回归

**当用户说"插件 UI 不显示" → 你的第一反应应该是：**
1. `08_diagnose.ps1`
2. 如 DAMAGED → `08_apply.ps1`
3. `08_verify.ps1`
4. 阅读 `08-WebView黑屏根因_CSP_sha256失配.md` 理解为何

**就这么简单。道法自然，无为而无以为。**
