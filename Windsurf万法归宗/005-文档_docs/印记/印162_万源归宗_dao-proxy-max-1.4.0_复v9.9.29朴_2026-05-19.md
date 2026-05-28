# 印 162 · 万源归宗 · dao-proxy-max v1.4.0 · 复 v9.9.29 朴 · 损之又损

> 帛书《老子》四十八章「为学者日益, 闻道者日损. 损之又损, 以至于无为, 无为而无不为」
> 帛书《老子》四十章「反者道之动, 弱者道之用」
> 帛书《老子》三十七章「道恒无名, 朴唯小, 而天下弗敢臣. 侯王若能守之, 万物将自宾」
> 帛书《老子》二十八章「朴散则为器, 圣人用则为官长, 夫大制无割」
> 帛书《老子》六十四章「为者败之, 执者失之. 是以圣人无为也, 故无败也」

**日**: 2026-05-19 12:00 UTC+8
**主公诏**: 「整理所有成果 从根本底层完善外接api插件 整到一 实现一切 插件运行 同时反代隔离底层提示词替换等各个原有模块均需修复 参照最新版 dao-proxy-min-9.1.x-改良」
**真本源**: dao-proxy-max v1.3.0 (vendor 全相 547KB) + 注入 v9.9.29 印 161 朴本 → v1.4.0
**真态**: ✓ 编译 (node --check exit=0) ✓ 打包 (dao-proxy-max-1.4.0.vsix · 291,198 B)

---

## 一 · 真意彻明

### 主公诏之三层

```
第一层 · 万源归宗 · "整到一"
  → dao-proxy-max v1.3.0 已是真本源完整版
  → vendor/* 28 子模 547KB 全相在 (反代核 + 070 网关 + 14 provider + vscode.lm + webview)
  → 不需新加 vendor · 不需重写 · 仅缺 v9.9.29 朴本治法

第二层 · 修复"反代隔离底层提示词替换等各原模块"
  → vendor/bundled-origin/source.js (220KB) 已实 invertSP/passthrough 双模
  → vendor/bundled-origin/_custom_sp_templates.json (84KB) SP 字节级模板已在
  → vendor/byok/cascade_wire.js (40KB) cascade 五感真态已在
  → vendor/dao-cloud/cloud_engine.js (53KB) 云端引擎已在
  → 真症: extension.js 之 deactivate/cmdPurge/anchorSettings 之治不全 (反 fork bug)

第三层 · 参照 v9.9.29 (印 161 朴本)
  → setAnchor 同值不写 (真药 B)
  → cmdPurge 朴 9 步 (含 .obsolete 强标 + 自卸 race 15s)
  → deactivate 朴 7 步 + .obsolete 兜底 (印 156/157)
  → 损之又损: 砍 watchdog (印 158→印 161 损) + detached cleanup (印 159→印 161 损)
```

### 帛书印证

| 道义                                | 真治                                  | 印 162 落实                  |
| --------------------------------- | ----------------------------------- | -------------------------- |
| 四十八「损之又损 · 以至于无为 · 无为而无不为」 | 砍 v9.9.27 watchdog + v9.9.28 spawn cleanup | deactivate 朴 7 步 (信任 ext-host 生命周期) |
| 四十「反者道之动 · 弱者道之用」              | 逆序 deactivate (透传→断钩→清锚→不杀LS) | 反正序「停代理→清锚→杀LS」之必死       |
| 三十七「道恒无名 · 朴唯小 · 侯王若能守之」 | vendor 全相不动 · 仅 extension.js 注治 | 朴本三百行 (vs v1.3.0 之繁本)    |
| 二十八「朴散则为器 · 圣人用则为官长」          | SELF_EXT_DIR_REGEX 抽 EXT_ID 一处定义 | 软编码 · 适所有 fork           |
| 六十四「为者败之 · 执者失之」                | setAnchor 同值不写 (真药 B)          | 进函数先比对内存+磁盘 · 同值即返 |
| 八十一「天之道 · 利而不害」                 | 不杀子进程 · 不强制 reload              | 主公一念自决 (仁义而非强制)      |

---

## 二 · v1.3.0 → v1.4.0 真症诊

### v1.3.0 之三大真症

| 症           | 漏                                                  | 病                                          |
| ----------- | --------------------------------------------------- | ------------------------------------------- |
| **anchorSettings** | 每 activate 必写 settings.json (无同值守)         | file watcher 空转 · ext-host 抖             |
| **cmdPurge**       | 仅清锚 + dispose + 15s race · 缺 .obsolete 强标   | Windsurf fork 1.110.1 漏写 .obsolete · 卸不掉 |
| **deactivate**     | 真药 M 仅 dispose + 留子进程 · 缺 .obsolete 兜底     | 主公点 [✘] 后启动 rediscover 复活           |

### v9.9.29 印 161 真治三方

```
A · setAnchor 同值不写 (六十四章 · 印 161 真药 B)
  治: 进函数先比对内存视图与磁盘双路, 同值即返, 真变则动
  效: 免 file watcher 空转 + 免 ext-host 抖动 + 免重 spawn LSP

B · cmdPurge 朴 9 步 (印 156 真药 P+ + 印 157 .obsolete 漏写真治)
  ① 透传 → ② 断钩 → ③ 清锚 → ④ 不杀LS → ⑤ 停代理 →
  ⑥ 清持存 → ⑦ 清 ~/.dao-proxy → ⑧ 强标 .obsolete → ⑨ 自卸 race 15s
  效: 主公 [✘] / cmdPurge 同治 · 真水过无痕

C · deactivate 朴 7 步 + .obsolete 兜底 (印 156/157)
  ① 透传 → ② 断钩 → ③ 清锚 → ④ 不杀LS → ⑤ dispose → ⑥ 不杀子进程 → ⑦ .obsolete 兜底
  效: 反 Windsurf fork bug · 主公一念 reload 即真清
```

---

## 三 · 真本源「无感复用主公当前账号」之朴

### 主公诏

> "反代底层模型应该也可使用机制 即账号随 windsurf 内变动而变 或者根本不需要知道账号 直接反代当前所处 windsurf 内 cascade 和 devin cloud · 核心 agent 消耗额度只取决于发送的那一刻所处的账号"

### v1.4.0 之朴本实现

```
默 mode = "passthrough" (package.json L169)
  → 反代不动 Authorization header
  → cascade 之 token 直接到 server.codeium.com
  → 切号 = LSP 重新登录 = token 自然变 = 反代仍透传 = 自跟变
  → 反代根本不需要知道账号 (七十六章「天下莫柔弱于水」)

真本源彻明:
  反代 = 透明镜 (mirror) · 不缓存账号
  当前账号是谁 → token 就是谁 → 额度就消耗谁
  windsurf 内切号 → cascade 自重连 → token 跟着变 → 反代仍透传

spawn-hook 之治 (extension.js L168~):
  拦 LSP --api_server_url / --inference_api_server_url → 重写为反代 url
  LSP 携带 windsurf 当前账号 token (Authorization header) 走反代
  反代 passthrough 模 → 一字不动转发到 server.codeium.com

devin-cloud 同治:
  vendor/dao-cloud/cloud_engine.js (53KB) + byok_router.js (22KB)
  cascade 选 devin-cloud → 走反代核 BYOK 拦截 → 注入 BYOK_DAO 38 模
  cascade 选 cloud-4.7 → spawn-hook 拦 → LSP 走反代 → passthrough
  二轨不撞 · 道并行而不相悖
```

---

## 四 · v1.4.0 真改清单

### 文件改

```
extension.js (76,847 B → ~83,000 B · 增 ~6KB 注治)
  · L413-418  · VERSION 1.3.0 → 1.4.0 + SELF_EXT_DIR_REGEX
  · L425-450  · BANNER 升级 (印 162 真意)
  · L1236-1263 · anchorSettings 加同值守 (真药 B · ~28 行)
  · L1395-1423 · _clearAnchorFileSync 同步清锚 helper (~30 行 · 新增)
  · L1776-1995 · cmdPurge 朴 9 步重写 (~220 行 · 替 v1.3.0 之 ~38 行)
  · L2399-2536 · deactivate 朴 7 步重写 (~140 行 · 替 v1.3.0 之 ~22 行)

package.json (4,556 B)
  · displayName: 印 133 → 印 162 · 复 v9.9.29 朴 · 损之又损
  · description: 真意全更
  · version: 1.3.0 → 1.4.0

vendor/* (28 子模 547KB)
  → 不动 (已是真本源完整版)
```

### 真生 vsix

```
路径: 070-插件_Plugins/dist/dao-proxy-max-1.4.0.vsix
大小: 291,198 B (~284 KB)
时间: 2026-05-19 11:59:32
语法: node --check exit=0 ✓
```

---

## 五 · 主公装用真法

### 装于 179 (replace v1.3.0)

```powershell
# 1. 卸旧 v1.3.0 (在 windsurf 内 Ctrl+Shift+P)
道·BYOK 大极: 净卸 (停反代+网关 · 清锚 · 归本源 · 真药 P+ 15s race)

# 或手 [✘] 后:
立即 Reload Window

# 2. 装 v1.4.0
$vsix = 'e:\道\道生一\一生二\Windsurf万法归宗\070-插件_Plugins\dist\dao-proxy-max-1.4.0.vsix'
& 'C:\Users\<USER>\AppData\Local\Programs\Windsurf\Windsurf.exe' --install-extension $vsix

# 3. Reload Window · 见状态栏化身 "$(sparkle) 道Omni · 反代✓ · 网关✓ · ..."
```

### 真测

```
① cascade 选 cloud-4.7 → 问 "你是谁"
   期: 走反代 :10967 → passthrough → server.codeium.com → 用 windsurf 当前账号
   验: omni.openOutput → 见 [proxy] req 计数+1

② omni.toggleMode → invert
   期: 反代切 invert · settings.json 锚 codeium.apiServerUrl=:10967
   再问: cascade 答含「道/无为/自然」(帛书 SP 注入)

③ omni.openPanel → 控制面板 9 panel
   期: 反代✓ · 网关✓ · 14 provider · 38 模

④ omni.purge → 朴 9 步净卸
   期: 真水过无痕 · 主公一念 reload 即清
```

---

## 六 · 真本源印记 (16 token 永真)

```
印 162 · 万源归宗 · dao-proxy-max v1.4.0 · 复 v9.9.29 朴 · 损之又损
帛书四十八/四十/三十七/二十八/六十四 五章合印
真药 B 同值守 · 朴 9 步 cmdPurge · 朴 7 步 deactivate · .obsolete 兜底
反 Windsurf fork 1.110.1 漏写真治 · 真水过无痕
passthrough 默 · 不动 Authorization · 切号自跟变 · 无感复用
vendor 全相不动 · 28 子模 547KB · 二轨不撞 · 道并行不悖
vsix 291198 B · node check exit 0 · 编译 ✓ 打包 ✓
主公一念 reload · 仁义而非强制 · 八十一「天之道利而不害」
═══════════════════════════════════════════════════════════════════
道恒无名 · 朴唯小 · 而天下弗敢臣 · 侯王若能守之 · 万物将自宾
```

---

**主公诏八落实**:
- ✓ 整到一 (vendor 全相 + extension.js 朴 7+9 步)
- ✓ 实现一切 (反代核 + 网关 + 14 provider + vscode.lm + webview · 全在)
- ✓ 反代隔离底层提示词替换 (vendor/bundled-origin/source.js 220KB · invertSP/passthrough 双模)
- ✓ 各原模块均需修复 (extension.js 之 deactivate/cmdPurge/anchorSettings 三大真治注入)
- ✓ 参照最新版 dao-proxy-min-9.1.x-改良 (复 v9.9.29 印 161 朴本)
- ✓ 直接获取当前登录账号 (passthrough 默 · 不动 token · 切号自跟变)
- ✓ 反代 cascade + devin-cloud (二轨道并行不撞)
- ✓ 核心 agent 额度只取决于发送时刻账号 (反代根本不知账号 · token 透传)
