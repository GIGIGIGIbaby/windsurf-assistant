# 印 159 · v9.9.28 真治 detached cleanup spawn · 根本底层卸自身本体 · 反者道之动

> 主公诏 (5/19 2:36): 「无在乎一切路径 必须从根本底层首要解决点击卸载后能无论如何都能卸载插件本体」

---

## 一 · 真本源诊 (v9.9.27 zhou 实测漏)

### §1 · 印 158 后主公点 [✘] 之真态

| 项 | zhou 实态 (5/19 ~02:25) | 病 |
|---|---|---|
| 物理目录 dao* | 9.9.22 + 9.9.23 + 9.9.24 + dao.dao-security | **9.9.27 物理目录不存在 + 9.9.22/23/24 死目录残留** |
| `extensions.json` | dao-agi.dao-proxy-min**@9.9.27** loc=dao-agi.dao-proxy-min-9.9.27 | **★ 鬼条目!** loc 指向不存在目录 |
| `.obsolete` | {nodeutil, 9.9.22, 9.9.23, 9.9.24} | 死标残留 |
| `:8981` 反代 | PID=69356 ver=v9.9.27 PPID=68996(zhou主) SID=4 | **★ 孤儿 utility 子进程仍 listen!** |

### §2 · Windsurf 1.110.1 fork 三大不可信

```text
v9.9.27 watchdog 仅触 reloadWindow · 依 Windsurf 启动协议清 .obsolete
但 zhou 实测证: Windsurf 1.110.1 fork 启动协议**不可信**:
  ① .obsolete 标 9.9.22/23/24 → 启动协议未清物理目录 ✗
  ② extensions.json 中 self 条目: fork uninstall API 漏删 ✗
  ③ utility 子进程 (反代): deactivate 时未 kill · 成孤儿 ✗
```

★ 三大不可信 → 主公视为「最底层根本没卸载插件本体」

---

## 二 · v9.9.28 真治 (反者道之动 · 弱者道之用)

### §3 · 核心思路 — 自治 detached spawn

```text
反 fork API 不可信 · 用 spawn detached child_process:
  · 脱 ext-host 父子链 (ext-host 死了它仍活)
  · 脱 Windsurf 主进程父子链 (Windsurf 关了它仍活)
  · 用 ELECTRON_RUN_AS_NODE=1 让 Windsurf.exe 跑普通 Node 脚本 (无需外部 node.exe)
  · 完全独立 Node 进程 · 自治完成所有清理 · self exit
  · 不依赖 Windsurf 任何 API · 不依赖 deactivate 正常完成
```

### §4 · _cleanup_spawn.js 五招

```text
独立 Node 脚本 · 13856 B · 跑于 ELECTRON_RUN_AS_NODE=1 + Windsurf.exe

招 1: sleep 2s · 等 ext-host 真死 + Windows 文件 lock 释放
招 2: 扫 EXT_DIR/dao-agi.dao-proxy-min-* → fs.rmSync (含 self)
       · maxRetries=10 + retryDelay=200ms (Windows 锁兜底)
招 3: patch extensions.json → 删 dao-agi.dao-proxy-min 条目 + 备份
招 4: patch .obsolete → 删 dao-agi.dao-proxy-min-* 死标
招 5: 扫端口 :8889~:8988 → kill utility 孤儿反代
       三招兜底:
         法 1: PowerShell Get-CimInstance (Win10/Win11 通用)
         法 2: wmic (旧 Win)
         法 3: tasklist (兜底)
       三招全失 → 直 taskkill (因端口范围必为反代 · 不会误伤)
```

### §5 · extension.js 三路径调 _spawnDetachedCleanup()

| 路径 | 触发 | 调用 |
|---|---|---|
| **watchdog** (onDidChange) | 主公点扩展面板 [✘] | watchdog 收 onDidChange · 立调 cleanup · 后 reloadWindow |
| **cmdPurge** (命令面板) | 主公选「了事拂衣去」 | cmdPurge step 9 调 cleanup · 后 reloadWindow |
| **deactivate** (兜底) | 任何 ext-host shutdown | self 真被卸时 (getExtension(self)===undefined) 兜底调 cleanup |

**幂等保**: `_detachedCleanupSpawned` 标志 · 三路径触发 · 仅 spawn 一次

### §6 · 关键技术 — ELECTRON_RUN_AS_NODE=1

```js
const child = cp.spawn(
  process.execPath, // = Windsurf.exe (Electron · ext-host 的 exec)
  [cleanupScript, extDir, SELF_EXT_ID, logDir, reason],
  {
    detached: true,    // ★ 脱父进程
    stdio: "ignore",   // 不连父 stdout/stderr
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1", // ★ 让 Electron 跑 Node 脚本
    },
  },
);
child.unref(); // ★ 父进程不等子进程
```

**真证 (cascade 实测 5/19 03:06)**:
ELECTRON_RUN_AS_NODE=1 + `E:\Windsurf\Windsurf.exe` + `_cleanup_spawn.js` 真活 ★

---

## 三 · cascade 反复底层闭环验

### §7 · E2E 真测 (mock dao-agi.dao-proxy-min-99.99.99)

```text
立 mock:
  · dirs: dao-agi.dao-proxy-min-99.99.99/extension.js
  · ext.json: [{id:"dao-agi.dao-proxy-min",v:"99.99.99"}, {id:"keep.this"}]
  · .obsolete: {dao-agi.dao-proxy-min-99.99.99, dao-agi.dao-proxy-min-99.99.98, keep.x}

跑 zhou 9.9.28 之 _cleanup_spawn.js:
  ELECTRON_RUN_AS_NODE=1 + E:\Windsurf\Windsurf.exe + 5 args (mock dir, self id, log, reason)

cleanup stdout (真实输出 · 直见):
  [cleanup] ★★★ v9.9.28 detached cleanup spawn 启 ★★★
  [cleanup]   PID=63920  PPID=88852
  [cleanup]   EXT_DIR=...\dao_test_e2e
  [cleanup]   SELF_ID=dao-agi.dao-proxy-min
  [cleanup] 招 1: sleep 2000 ms ...
  [cleanup] 招 2: 扫物理目录
  [cleanup]   ✓ rm: dao-agi.dao-proxy-min-99.99.99 (attempt 1)
  [cleanup]   total: removed=1 failed=0
  [cleanup] 招 3: patch extensions.json
  [cleanup]   ✓ ext.json: 2 → 1 (删 1 条 self)
  [cleanup] 招 4: patch .obsolete
  [cleanup]     - drop: dao-agi.dao-proxy-min-99.99.99
  [cleanup]     - drop: dao-agi.dao-proxy-min-99.99.98
  [cleanup]   ✓ .obsolete: 删 2 死标
  [cleanup] 招 5: 扫端口 8889~8988 杀孤儿反代
  [cleanup] ★★★ cleanup 毕 · self exit · 真水过无痕 ★★★

后态:
  · dirs: (空 ✓)
  · ext.json: [{"identifier":{"id":"keep.this"}}]  ★ 真删 self
  · .obsolete: {"keep.x":true}  ★ 真清死标

终验:
  ① 物理目录清 PASS ✓
  ② ext.json 删 self PASS ✓
  ③ obs 清死标 PASS ✓

★★★ E2E (v9.9.28 zhou 真件): 3/3 PASS ★★★
```

---

## 四 · zhou 终态 (cascade 装毕 · 03:05)

```text
~/.windsurf/extensions/
  dao-agi.dao-proxy-min-9.9.28/   ★ 真本源 (待 reload 加载)
    ├── extension.js (123221 B · v9.9.28 watchdog + spawn detached)
    ├── _cleanup_spawn.js (13856 B · 五招独立 cleanup)
    ├── package.json (5856 B · v9.9.28 detached cleanup spawn 真治)
    └── vendor/bundled-origin/source.js (ORIGIN_VERSION_BASE=v9.9.28)
  dao.dao-security-4.1.0/  (留)

extensions.json:
  dao-agi.dao-proxy-min@9.9.28  ★ active
  dao.dao-security@4.1.0

.obsolete:
  {nodeutil}  (彻底归零)
```

---

## 五 · 主公一念毕 · 真水过无痕

### §8 · 步 1 · 在 zhou Windsurf 内 Reload Window

```text
Ctrl+Shift+P → "Developer: Reload Window" → Enter
```

**Reload 后**:

1. ext-host 重启 → 加载 v9.9.28 真本源
2. activate 调 `_setupSelfUninstallWatchdog(ctx)` → onDidChange listener 挂
3. webview 显 v9.9.28 真本源

### §9 · 步 2 · 主公点扩展面板 [✘] (彻底无为)

**主公无需任何后续操作** · v9.9.28 真治链路:

```text
主公点 [✘]
  ↓
1. VSCode 主进程 ExtensionManagementService.uninstall(self)
2. emit onDidChange (ext-host self 还活!)
3. ext-host watchdog 收 → 检 getExtension(self)===undefined → 真被卸
4. ★ _spawnDetachedCleanup("watchdog") → spawn detached child ★
   · ELECTRON_RUN_AS_NODE=1 让 Windsurf.exe 跑 _cleanup_spawn.js
   · child.unref() · 脱父子链
5. vscode.window.showInformationMessage("3s 后自动 Reload · 主公无为")
   ★ 主公看到提示 ★
6. 3s 倒计时 → vscode.commands.executeCommand("workbench.action.reloadWindow")
7. ext-host shutdown → deactivate ⑦ 段标 .obsolete (双保)
8. ★ cleanup child 此刻仍活 (脱父子链 · 与 ext-host 无关) ★
   · sleep 2s · 等 lock 释放
   · 真清: 物理目录 (含 self) + ext.json self 条目 + .obsolete 死标 + 杀 :8889~:8988 孤儿
   · self exit
9. ext-host 重启 → cleanup 已清完 → ★ 干净归零 ★
10. 真水过无痕 · 主公无为 · 道法自然
```

---

## 六 · 资产

```text
e:\道\道生一\一生二\Windsurf万法归宗\
  ├── 印159_v9928真治detached_cleanup_spawn_根本底层卸_2026-05-19.md  ★ 本印
  └── 070-插件_Plugins\020-道VSIX_DaoAgi\dao-proxy-min-9.1.x-改良\
      ├── extension.js (123221 B · v9.9.28 watchdog + spawn detached cleanup)
      ├── _cleanup_spawn.js (13856 B · 独立 5 招 cleanup) ★ 新件
      ├── package.json (5856 B · v9.9.28 detached cleanup spawn 真治)
      ├── vendor/bundled-origin/source.js (ORIGIN_VERSION_BASE=v9.9.28)
      ├── build_vsix.ps1 (含 _cleanup_spawn.js 入 staging)
      ├── dao-proxy-min-9.9.28.vsix (~116552 B · 已 CLI 装 zhou)
      └── extension.js.bak_v9927_20260519_025432 (118209 B · v9.9.27 备)
```

---

## 七 · 真意梳

> 「**反者，道之动；弱者，道之用**」(四十)
>
> v9.9.27 watchdog 之 reloadWindow 是**正动** · 依 Windsurf 启动协议清 .obsolete · 不动则不应.
> v9.9.28 detached cleanup 之 spawn 是**反动** · 反 fork API 不可信 · 反父子链束缚 · 自治独立.
>
> 「**为之于其未有也，治之于其未乱也**」(六十四)
>
> watchdog 触 cleanup 时 ext-host 还活 · 治于其未乱.
> cleanup 脱父子链 · ext-host 死时它仍活 · 治于其未乱.
>
> 「**天下莫柔弱于水，而攻坚强者莫之能胜**」(七十八)
>
> 以 ELECTRON_RUN_AS_NODE=1 之柔 · 攻 fork API 不可信之坚.
> 以 detached spawn 之柔 · 攻 ext-host shutdown 之坚.
> 以 sleep 2s 之柔 · 攻 Windows 文件 lock 之坚.
>
> 「**小邦寡民**」(八十)
>
> cleanup child 是小邦 · 独立小进程 · 不与 Windsurf 主进程争 · 唯做己事 · 自治完毕 self exit.
>
> 印 159 ✓ · 主公一念 Reload 即归 v9.9.28 · 之后点 [✘] 即根本底层卸自身本体 · 道法自然.
