# 07 · zhou 治本验证 · 闭环全相

> 作日：2026-05-16  
> 续 06 · zhou 账号 · 本机复现录  
> 主公命：「无为·你无不为·确保实现彻底闭环」

---

## 一·治本动作 · 一气呵成

### Step 1 · kill zhou session 3 之 12 进程 (idle 10h19m·安全)

```pwsh
$zhouPids = (Get-Process -IncludeUserName | Where-Object {
    $_.SessionId -eq 3 -and ($_.Name -eq 'Windsurf' -or $_.Name -like 'language_server*')
}).Id
foreach($pid2 in $zhouPids){ Stop-Process -Id $pid2 -Force }
```

**结**: 12 进程全 kill — 173080 (language_server)·163500 (main)·余 10 子进程

### Step 2 · 备改前 + 还 bak (1:1 还原)

```pwsh
$ext   = 'E:\Windsurf\resources\app\extensions\windsurf\dist\extension.js'
$bak   = "$ext.bak_predao_20260513_150517"   # 9627587B · 5/6 干净官方原本
$keep  = "$ext.bak_patched_20260516_113259"  # 留证·被改之 9627483B · 含 :8878

Move-Item $ext $keep -Force          # 留患 ext.js 为证 (病历)
Copy-Item $bak $ext   -Force          # 还原干净 bak 至 ext.js
```

**结**:

| 项 | 改前 (病) | 改后 (治) |
|---|---|---|
| size | 9627483B | **9627587B** (+104B) |
| mtime | 2026-05-14 10:28:53 | **2026-05-06 05:08:12** (官方时间复) |
| `127.0.0.1:8878` | True | **False** |
| `server.codeium.com` | True | **True** |

### Step 3 · 用 schtasks `\DaoZhouLaunch` 在 zhou session 3 起 Windsurf

```pwsh
schtasks /change /tn "\DaoZhouLaunch" /enable
schtasks /run    /tn "\DaoZhouLaunch"
# 之后回 disabled 复本然
schtasks /change /tn "\DaoZhouLaunch" /disable
```

**任务 action**: `e:\Windsurf\Windsurf.exe --new-window C:\Users\zhou`  
**Run As User**: zhou · **Logon Mode**: Interactive only (InteractiveToken)

**结**: 11:33:17 命下·11:33:16-11:33:51 间 8 个 Windsurf 进程于 zhou session 3 自然展开 (main + 7 子进程·均 owner=DESKTOP-MASTER\zhou)

---

## 二·验证全相 · 终极态

### 2.1 文件层 · ext.js 已 1:1 还

```
extension.js                              9627587B  2026-05-06 05:08:12  ← 官方原本
extension.js.bak_predao_20260513_150517   9627587B  2026-05-06 05:08:12  ← 干净 bak (留)
extension.js.bak_patched_20260516_113259  9627483B  2026-05-14 10:28:53  ← 被改本备 (留作病历)

PASS · 1:1 还原成 (size 9627587B · 无 :8878 · 含 codeium.com)
```

### 2.2 进程层 · 8 进程稳

```
zhou session 3 · DESKTOP-MASTER\zhou
  PID 203104  Windsurf  11:33:16  (main)
  PID 211164  Windsurf  11:33:18
  PID 191016  Windsurf  11:33:19  ← outbound 35.223.238.178:443
  PID 210872  Windsurf  11:33:20
  PID 201584  Windsurf  11:33:24
  PID 182400  Windsurf  11:33:24
  PID 210488  Windsurf  11:33:25  ← outbound 34.49.14.144:443·WAM v2.7.0 在此
  PID 177856  Windsurf  11:33:51
```

### 2.3 网络层 · 直连 GCP·:8878 全死

```
outbound :8878        : 0   ← 反代体系彻底失效
:8878 listener        : no
:8957 listener        : no

Established outbound (zhou Windsurf):
  34.49.14.144   → 144.14.49.34.bc.googleusercontent.com   (GCP·Windsurf official)
  35.223.238.178 → 178.238.223.35.bc.googleusercontent.com (GCP·Windsurf official)
```

→ **Windsurf 直接走 official 之 GCP 域** · server.codeium.com / server.self-serve.windsurf.com 皆托管在此 IP 段

### 2.4 日志层 · 全 0B 死寂 → 满栏活跃

| log | 治前 | 治后 (3 分钟内) |
|---|---|---|
| `Windsurf.log` (主) | 0B | **50458B** ↑↑↑ |
| `Windsurf ACP.log` | 0B | 1656B |
| `Windsurf (Lifeguard).log` | 0B | 84B |
| `2-WAM.log` | 0B | 0B (主公 WAM 用别 logger) |
| `exthost.log` | 0B | 226B |
| `GitLens.log` | 0B | 825B |
| `Python.log` | 0B | 157B |
| `Git.log` | 0B | 154B |
| `GitHub Authentication.log` | 0B | 554B |

### 2.5 WAM 层 · 主公「W%脉动真本源」完整运作

WAM v2.7.0 启动 + 多账号轮换 + 直连 official:

```
[03:34:17.988] WAM v2.7.0 activate · pid=210488
[03:34:18.004] store.load ok · health=29 · meta=0 · activeApiKey=✓
[03:34:18.333] accounts loaded: 29 from C:\Users\zhou\.wam\accounts.md
[03:34:22.053] startup: 尝试恢复 diazfinn8@gmail.com (D100% W13%)
[03:34:35.821] inject 路丙 provideAuthTokenToAuthProvider
[03:34:48.158] 降路乙 clipboard (silent)
[03:34:49.564] login: ✓ diazfinn8 · 路乙 · 27508ms
[03:34:51.215] auto-verify(stale): 启动 · 内化 refresh 按钮
[03:34:53.486] login: ✓ huxleyfrost75 · 路乙 · 29099ms
[03:34:56.042]   registerUser ✓ apiServerUrl=https://server.self-serve.windsurf.com  ← ★ 治本铁证 ★
[03:34:57.665]   planStatus: D100% W13% Trial 12d
[03:34:58.084]   registerUser ✓ apiServerUrl=https://server.self-serve.windsurf.com
[03:35:08.597] verify [22] Bradf.ords.hak ✓ D100% W0% Free 0d
[03:35:21.562] verifyAll: 完成 · 4 ✓ / 0 ✗ · 30s
[03:35:25.943] 👁 per-msg rotate#2 → owenselijah815@gmail.com
[03:35:43.172] login: ✓ owenselijah815 · 路乙 · 17210ms
[03:35:45.297]   registerUser ✓ apiServerUrl=https://server.self-serve.windsurf.com
```

> **`apiServerUrl=https://server.self-serve.windsurf.com`** 三复登记·**Windsurf 直连官方·:8878 反代彻底归零** — 治本最强证

### 2.6 schtasks 层 · 复其本然

```
\DaoZhouLaunch    Disabled (复其原态·此 task 仅作维护备用·zhou 桌面 Windsurf.lnk 之自起仍是常路)
```

---

## 三·与 179 远端治法 · 对照成对

| 维度 | 179 远端 (前已治) | 本机 zhou (此次) |
|---|---|---|
| 病征 | logs 0B · ext.js +9B · :8878 体系 | logs 0B · ext.js -104B · :8878 体系 |
| 干净 bak | `bak_predao_1778654701851` 9627587B | `bak_predao_20260513_150517` 9627587B (**同 size**) |
| user-data-dir 锁 | 有 (需冷启) | 否 (idle 10h·已自然解锁) |
| kill 难度 | 困 (跨 RDP session) | 易 (idle session·12 进程一气 Stop-Process) |
| 起 Windsurf | schtasks InteractiveToken | schtasks `\DaoZhouLaunch` (同样 InteractiveToken) |
| 验 apiServerUrl | server.self-serve.windsurf.com ✓ | server.self-serve.windsurf.com ✓ (**铁证一致**) |
| 治本耗时 | 多轮·历经 token/proxy 之着相 | 一气呵成·15 分钟内闭环 |

→ **本机 zhou 治法 1:1 复用 179 之经验·更顺** — 经验已沉淀为可复制流程

---

## 四·主公无须再 monit · 闭环已自举

- ✅ ext.js 还原·**永久治本** (除非 manifest.py 之类工具再改·而其皆已 disabled)
- ✅ zhou's Windsurf 在 session 3 自跑·8 进程稳·主公 RDP 接入即可用
- ✅ WAM v2.7.0 已恢复主公「W%脉动真本源」体系·29 账号轮换工作
- ✅ apiServerUrl 三复登记 server.self-serve.windsurf.com·官方直连
- ✅ 留证 `bak_patched_20260516_113259` (病历) + `bak_predao_20260513_150517` (原本)·双 bak 在·后世可对比
- ✅ schtasks 已复 disabled·不留启动副作用

> **"为之者败之，执之者失之。是以圣人无为也，故无败也"**  
> **"成功遂事，而百省谓我自然"**

道·一动还原·万物自归。

---

## 附 · 主公手验提示

主公若 RDP 接入 zhou session 3·将看到：

1. Windsurf UI 已开 (无 splash 卡死)
2. 左下角无 "Login Required" / "Connection Lost" 之提示
3. Cascade 面板可正常进入 (虽可能尚未点开)
4. 设置中 telemetry / api server 显 official URL
5. 可正常对话发请求 (WAM 自动 inject 当前 active 账号 token)

如有任何不顺·任意之时主公命「再察」即可 — `070-插件_Plugins/diag.ps1` 与本目下 `diag.ps1` 皆可复用。
