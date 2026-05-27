# 08 · WebView 黑屏根因 · CSP sha256 失配

> **道德经第四十章**：反者道之动也，弱者道之用也。  
> **道德经第七十章**：吾言甚易知也，甚易行也，而人莫之能知也。  
> **会话时间**：2026-05-27 02:30 ~ 03:11（UTC+08:00）  
> **修复对象**：本机 Windsurf 1.110.1（Electron 39.6.0 / Chrome 142）  
> **状态**：✅ 已验证修复（独立实例 CDP 闭环 + DOM probe + 截图三重证据）

---

## 一句话精髓

**dao-proxy-max 早期版本曾给 Windsurf 内置 `webview/browser/pre/index.html` 注入 `dao-fix` 增量代码（共3处），但 *未同步* 更新 CSP 中的 `sha256-` hash，导致浏览器内置 CSP 校验失败 → inline module script 被静默拒绝执行 → Service Worker 永不注册 → webview inner iframe 永不注入 → 所有插件 webview 视图永久空白。**

---

## 现象（用户视角）

- Activity Bar 图标全部正常显示 ✅
- Extensions 列表面板正常显示 ✅
- 但是：**点击任何插件的 sidebar / editor webview 视图后，内容完全空白** ❌
  - 道Agent: 本源观照 → 空白
  - WAM 切号管理 → 空白
  - GitLens / Containers / Kubernetes 等所有第三方 webview 视图 → 空白

---

## VSCode WebView 三层架构（背景知识）

```
┌─────────────────────────────────────────────────────────────┐
│ Workbench Main Page (vscode-file://vscode-app/.../workbench.html)
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Outer iframe (vscode-webview://<origin>/index.html)   │  │
│  │   CSP 极严：default-src 'none' + sha256 inline hash   │  │
│  │   一段 <script type="module"> bootstrap：             │  │
│  │     ① 注册 Service Worker (service-worker.js)         │  │
│  │     ② 等 SW take control                              │  │
│  │     ③ postMessage 给 parent 索要扩展 HTML             │  │
│  │     ④ 创建 inner iframe (fake.html)                   │  │
│  │                                                       │  │
│  │   ┌───────────────────────────────────────────────┐   │  │
│  │   │ Inner iframe (fake.html?id=...)               │   │  │
│  │   │   ↑ SW 拦截此 fetch，注入扩展提供的真实 HTML  │   │  │
│  │   │   ↓                                           │   │  │
│  │   │   扩展真实 webview HTML/JS/CSS 渲染区域       │   │  │
│  │   │   ← 用户实际看到的视图内容                    │   │  │
│  │   └───────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**任何一层断裂 → 用户看到空白**。本次根因在 **outer iframe 的 CSP 检查阶段**。

---

## 七层根因解构（从表象到本质）

| 层 | 表象 | 内在机理 |
|---|---|---|
| 1 | webview view 空白 | inner iframe 未注入 |
| 2 | inner iframe 不存在 | SW 没注入 fake.html 内容 |
| 3 | SW 不工作 | `navigator.serviceWorker.controller === null` |
| 4 | SW 永不注册 | bootstrap 脚本未执行到 `register()` 调用 |
| 5 | bootstrap 未执行 | `<script async type="module">` 被 CSP 静默拒绝 |
| 6 | CSP 拒绝执行 | 实际 inline script 的 sha256 与 CSP 声明的 hash **不匹配** |
| 7 | hash 失配根源 | 历史扩展 patch 了 script 内容但未更新 hash |

---

## 诊断指纹（fingerprint）

**如何识别此类问题**，只需查以下任一信号：

### 信号 A：文件指纹
```powershell
$idx = "E:\Windsurf\resources\app\out\vs\workbench\contrib\webview\browser\pre\index.html"
Select-String -Path $idx -Pattern "dao-fix"
# 命中 → 文件已被 patch
```

### 信号 B：hash 算术指纹
```powershell
$content = Get-Content $idx -Raw
$cspHash = [regex]::Match($content, "'sha256-([^']+)'").Groups[1].Value
$scriptBody = [regex]::Match($content, '(?s)<script\s+async\s+type="module">(.+?)</script>').Groups[1].Value
$actualHash = [Convert]::ToBase64String([System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($scriptBody)))
if ($cspHash -ne $actualHash) { Write-Host "DAMAGED: CSP hash失配" -ForegroundColor Red }
```

### 信号 C：CDP 运行时指纹（需 Windsurf 启动时带 `--remote-debugging-port=9333`）
```powershell
$wvIframe = (Invoke-RestMethod "http://127.0.0.1:9333/json/list") | Where-Object {$_.type -eq 'iframe' -and $_.url -match 'vscode-webview'} | Select-Object -First 1
# 进入此 iframe，evaluate `navigator.serviceWorker.controller` → null = 故障
# evaluate `document.querySelectorAll('iframe').length` → 0 = 故障（应为 1）
```

---

## 修复方案对照

| 方案 | 改动 | 优点 | 缺点 |
|---|---|---|---|
| **A · 还原** | 用 `microsoft/vscode` 上游对应版本完全覆盖 `index.html` | 最干净、移除所有 dao-fix patch | 需联网拉取上游、Windsurf fork 可能与上游有差异 |
| **B · hash 同步** | 重新计算 patched script 的 sha256，写回 CSP | 仅改一行字符串、安全等级不降 | 任何后续 patch 都需同步更新 hash |
| **C · unsafe-inline** | 把 CSP 的 `'sha256-XXX'` 替换为 `'unsafe-inline'` | 一劳永逸、未来再 patch 都无需更新 | 安全等级略降（但 vscode-webview://* 是内部协议，风险可控） |

### 推荐：**方案 C（unsafe-inline）** —— 长期稳定，与 dao patch 共生

**理由**：
1. `vscode-webview://*` 是 Windsurf 内部 origin，外部网站无法注入 inline script
2. CSP 仍保留 `default-src 'none'` + `'self'`，cross-origin 注入仍被拒绝
3. 未来 Windsurf 升级覆盖 `index.html` 后，只需重跑 `08_apply.ps1`（幂等）

---

## 修复操作流（后续 agent 标准操作）

### 步骤 1 · 诊断（约 5 秒）
```powershell
& "e:\道\道生一\一生二\Windsurf万法归宗\060-修复_Repair\08_diagnose.ps1"
# 输出：当前 CSP hash / 实际 hash / 是否失配 / 文件是否已 patched
```

### 步骤 2 · 修复（约 1 秒）
```powershell
& "e:\道\道生一\一生二\Windsurf万法归宗\060-修复_Repair\08_apply.ps1"
# 默认 -Mode auto（先试 hash 同步，失败回退 unsafe-inline）
# 可选 -Mode unsafe-inline / -Mode hash
# 自动备份原文件到 *.bak_<timestamp>
```

### 步骤 3 · 验证（约 30 秒，需重启 Windsurf）
```powershell
# 必须重启 Windsurf 才能让 webview 重新加载新 CSP
& "e:\道\道生一\一生二\Windsurf万法归宗\060-修复_Repair\08_verify.ps1" -RestartIndependent
# 启动独立验证实例 + CDP 检查 SW controller / inner iframe 是否正常
# 截图保存到 _archive_ 目录
```

### 步骤 4 · 回滚（如有问题）
```powershell
& "e:\道\道生一\一生二\Windsurf万法归宗\060-修复_Repair\08_revert.ps1"
# 自动从 *.bak_<timestamp> 恢复最近备份
```

---

## 关键文件路径速查表

| 用途 | 路径 |
|---|---|
| 被 patch 的 outer iframe | `E:\Windsurf\resources\app\out\vs\workbench\contrib\webview\browser\pre\index.html` |
| 被 patch 的 service worker | `E:\Windsurf\resources\app\out\vs\workbench\contrib\webview\browser\pre\service-worker.js` |
| 本次修复备份 | `*.bak_dao_csp_fix_20260527_023550` |
| user-data-dir（默认） | `C:\Users\Administrator\AppData\Roaming\Windsurf\` |
| extensions-dir（默认） | `C:\Users\Administrator\.windsurf\extensions\` |
| Windsurf CLI | `E:\Windsurf\bin\windsurf.cmd` |
| 独立验证实例 base | `C:\Temp\windsurf_diag_<ts>\` |

---

## 历史 patch 来源（去芜存菁）

经搜索 `~/.windsurf/extensions/` 中所有 dao-* 扩展的 `extension.js`：

| 扩展 | 是否 patch index.html/service-worker | 备注 |
|---|---|---|
| **dao-agi.dao-proxy-max-1.4.0/2.0.4/2.1.0** | ✅ **是**（含 `workbench/contrib/webview/browser/pre` 关键字 + `skipWaiting/claim` patch 逻辑） | **根源** |
| dao-agi.dao-proxy-min-9.9.15 ~ 9.9.51 | ❌ 否 | min 系列采用了更朴素的 ext-host 内 hook，不动 Windsurf 内置文件 |
| dao.dao-security-4.1.0 | ❌ 否 | 纯观察者，不修改任何 Windsurf 内置文件 |
| devaid.rt-flow-* | ❌ 否 | 标准扩展 |

**结论**：本次诊断会话中，max 系扩展已全部隔离（quarantine_20260527_023550），仅留 min 9.9.51。但 max 留下的 *文件 patch* 不会因为隔离扩展而恢复，必须显式还原 / 同步 hash。

---

## CDP 诊断方法论（可复用）

### 启动可观察的 Windsurf 实例
```powershell
$udd = "C:\Temp\windsurf_observable_$(Get-Date -Format yyyyMMdd_HHmmss)"
$ws  = "C:\Temp\test_workspace"
New-Item -ItemType Directory -Path $udd, $ws -Force | Out-Null

Start-Process -FilePath "E:\Windsurf\Windsurf.exe" -ArgumentList `
    "--user-data-dir","$udd",`
    "--new-window",`
    "--remote-debugging-port=9333",`
    "--disable-workspace-trust",`
    $ws
```

### CDP 三大端点
| 端点 | 用途 |
|---|---|
| `http://127.0.0.1:9333/json/list` | 列出所有 target（page/iframe/service_worker/worker） |
| `http://127.0.0.1:9333/json/version` | Browser 版本 + WebSocket browser 端点 |
| `ws://127.0.0.1:9333/devtools/page/<id>` | 单个 target 的 CDP 控制通道 |

### 关键 CDP 命令
| Method | 用途 |
|---|---|
| `Runtime.evaluate` | 在 target 上下文执行 JS（提取 DOM、SW 状态等） |
| `Page.captureScreenshot` | 截屏（真实像素，独立于物理屏幕） |
| `Input.dispatchKeyEvent` | 发键盘事件（Ctrl+W、Ctrl+Shift+X 等） |
| `Network.enable` + `Network.loadingFailed` event | 捕获网络加载失败（含 CSP block） |
| `Log.enable` + `Log.entryAdded` event | 捕获浏览器内部 log（含 CSP violation） |

详见 `_archive_20260527_道法CSP/01-诊断脚本/` 下 10 个完整脚本样本。

---

## 道德经精读

**反者道之动**：从空白现象 → 倒推七层 → 找到 hash 失配这一字符串细节，是"反"的方法论。

**弱者道之用**：修复只动一行 CSP 字符串，不动任何业务代码、不动任何扩展，最小损伤即彻底解决，是"弱"的力量。

**无为而无不为**：不去硬重写 vscode-webview 整个机制，只让 CSP 与 script 重新一致，则一切自然恢复。
