# dao-proxy-min · 工程总览 · 道法自然

**位**: `e:\道\道生一\一生二\Windsurf万法归宗\070-插件_Plugins\020-道VSIX_DaoAgi\dao-proxy-min\`

**当前版**: **v9.9.52** · 损之又损 · 道法自然 · 反者道之动

**整日**: 2026-05-27 (v9.9.52 整理归一) · 承 v9.9.36 三窗口连环重载根治 → v9.9.52 删 CHECKPOINT 死代码

---

## I · 主目结构 (2026-05-27 v9.9.52 · 精简归一)

```text
.
├── extension.js                                · ~122 KB · ext-host 主入口 (v9.9.52 · ~3090行)
├── package.json                                · 5.0 KB · 10 命令 · 4 配置 · version=9.9.52
├── INDEX.md                                    · (本档) · 工程总览
├── LICENSE.txt                                 · Apache-2.0
│
├── dao-proxy-min-9.9.52.vsix                   · ~120 KB · ★ 当前发行 (from 9935 无感升至此)
│
├── install.ps1                                 · 13 KB · Windows 装脚 · 软编码自检测端口+vsix
├── install.sh                                  · 9.8 KB · Mac/Linux 装脚 · 软编码等价
├── build_vsix.ps1                              · 9.4 KB · 打包脚 (vsce-free · .NET ZipFile)
├── readme.md                                   · 28 KB · 用户文档 · 完整变更链
│
├── media/
│   ├── icon.svg / icon.png                     · 道Agent 图标
│   └── webview-app.js                          · 「本源观照」面板
│
└── vendor/bundled-origin/                      · ★ 真本源
    ├── source.js                               · ~200 KB · proxy 后台 · v9.9.52 · invertSP
    ├── _silk_dao.txt                           · 9.0 KB · 帛书《老子》道经
    ├── _silk_de.txt                            · 11 KB · 帛书《老子》德经
    └── _yinfu.txt                              · 1.7 KB · 道藏《阴符经》
```

---

## II · v9.9.36 → v9.9.52 · SP 注入精炼链 (source.js 侧 · ext 侧降频/延迟锚定)

### ext 侧 · v9.9.36 三窗口连环重载根治

**根因七层**:
- 触发层: activate 立写 settings.json → ~800ms → "Installation Modified" → ext-host 死 → 循环
- 放大层: deactivate 清锚 → 下个 ext-host 重走 setAnchor → 再触写风暴
- 堵塞层: 反代+6 定时器+SSE 全在 ext-host 事件循环 → UNRESPONSIVE × N → 杀

**四治**:
- ① 延迟锚定: activate 不立写 settings.json · 内存先锚 · 15s 后持久化
- ② 智能保锚: ext-host 存活 < 30s → deactivate 不清锚 · 零写入
- ③ 去 API 噪: codeium.* 非注册键 · VS Code API 写永 FAIL · 直删
- ④ 降频减压: sig 5s(原1.5) · refresh 30s(原12) · watchdog 60s(原30)

### source.js 侧 · SP 注入精炼 (v9.9.38 → v9.9.52)

| 版 | 变 | 道义 |
|---|---|---|
| **v9.9.38** | 去 `_cachedAnchored` 门控 · LS args 无条件重写 · TAO_HEADER 帧宽修正 | 十七章「太上下知有之」 |
| **v9.9.41** | `viewed_file`+`learnings` 移出 SCT | 四十八章「损之又损」 |
| **v9.9.42** | `SECTION_OVERRIDE` 全删 · 真无为 | 二章「为而弗之」 |
| **v9.9.43** | `session_context`+`code_interaction_summary` 移出 SCT | 同上 |
| **v9.9.44** | 双线融合 · `deepStrip` 无条件 | 四十章「反者道之动」 |
| **v9.9.45** | proto 损坏根治 · `nestedOk` 移出 if 块 | 七十六章「柔弱者生之徒」 |
| **v9.9.47** | 书名号复归 · 动态经藏名 · 认知锚点 | 一章「名可名也 非恒名也」 |
| **v9.9.49** | 移除"及其后文本"· 精准指向经典 | 六十四章「慎终若始」 |
| **v9.9.50** | INFER_STRIP 回退 `modifyAnyInferenceSP` · `trimUserInfo` 截断终端历史 | 四十章「弱者道之用」 |
| **v9.9.51** | CHECKPOINT 不再剥除 · reload 后上下文桥完整 | 十六章「归根曰静 静曰复命」 |
| **v9.9.52** | 损 `CHECKPOINT_BLOCK_RE` / `CHECKPOINT_MARKER_RE` 死代码 · 两常量无引用 | 四十八章「损之又损」 |

---

## III · v9.9.29 之治 · 印 160 · 终端会话池 (2026-05-19)

**主公诏 (5/19 03:11)**: 「**专注于最本源最核心的终端问题 · 反者道之动 · 不依赖任何第三方 · 推进到底 实现一切**」

### 七层污染 · 一招治

| 层 | 病 | 真因 |
|---|---|---|
| ① OS cwd | 进程单例 | 共享一 shell |
| ② OS env | 继承可变 | 共享一 shell |
| ③ PTY | 字节流交织 | 共享一 shell |
| ④ Shell `%ERRORLEVEL%`/`$?` | 会话单例 | 共享一 shell |
| ⑤ IDE 终端池 | 复用 | 共享一 shell |
| ⑥ Agent 调用无状态 + 终端有状态 | 错配 | 共享一 shell |
| ⑦ 多 agent race | 抢 | 共享一 shell |

**真治** (反者道之动 · 弱者道之用):

每 agent 一独立 `cmd.exe`/`bash` 子进程 (`cp.spawn /k mode` · OS 进程级隔离)
+ stdin pipe 持续写
+ sentinel (RS+UUID) 包夹切片
+ `ver>nul` 重置 ERRORLEVEL

**零第三方** · 全 Node 内置 `child_process` · ~280 行新增 · `_test_v9929_term_pool.js` **15/15 PASS**.

### 三路调

| 路 | 用 | 端 |
|---|---|---|
| ① 命令面板 | 主公手控 · GUI | `dao.term.exec` / `dao.term.list` / `dao.term.close` |
| ② HTTP | agent 远调 · localhost only | `:12780~12829` (per-user FNV) `/term/exec` `/term/list` `/term/close` `/term/ping` |
| ③ ext.js 内调 | 本扩展自调 | `_ensureTermPool().exec(sid, cmd)` |

### 道义

- 四十「**反者道之动 · 弱者道之用**」— 反共享一终端 · 用 `child_process` 弱柔
- 六十一「**大邦下流 · 牝以靓胜牡**」— 每 sid 处下一 shell · 不争一终端
- 二十八「**朴散为器 · 圣人用则为官长**」— `spawn` 之朴 · 散为多 shell 之器
- 四十八「**损之又损**」— 零依赖 · 七层一招

---

## III · 真药全谱 (v9.7.0 → v9.9.29)

| 真药 | 版 | 治 | 位 |
|---|---|---|---|
| **A** | v9.7.6 / v9.2.0 | source.js · invertSP 字节级保 · H2 stream 三路监听 | source.js |
| **B** | v9.8.0 | setAnchor 同值不写 · 守一不离 | extension.js |
| **C** | v9.9.0 | 拨 source.js setInterval | source.js |
| **D** | v9.9.0 | proxyStart EADDRINUSE 1ping · 活复用死归直连 | extension.js |
| **E** | v9.9.0 | deactivate 不杀 LS · 上善若水 | extension.js |
| **F** | v9.9.0 | cmdInvert 不杀 LS | extension.js |
| **G-K** | v9.9.2 | 删 forceRestartLS / taskkill / 主动 reloadWindow 全废 | extension.js |
| **L** | v9.9.2 | 扩展 ID 自识 (`context.extension.id`) | extension.js |
| **M-N** | v9.9.14 | deactivate 自清锚 + dao.* 三键 Promise.allSettled | extension.js |
| **P+** | v9.9.15 | cmdPurge race 15s + 进度提示 | extension.js |
| **Q-S** | v9.9.13 | body>20KB skip · long-body 26-needle · maxDepth 3 | source.js |
| **复 9.9.13** | v9.9.16 | activate/deactivate 字符级复 9.9.13 之朴 (归根复命) | extension.js |
| **两经归一** | v9.9.20 | _silk_dao + _silk_de + _yinfu 加载 (帛书 + 阴符) | extension.js + source.js |
| **三诉同治** | v9.9.22 | 五层同治 (印 154) | extension.js |
| **软编码归一** | v9.9.25 | `SELF_EXT_ID` / `SELF_EXT_DIR_REGEX` 抽自 package.json · 适所有 fork | extension.js |
| **三招齐发** | v9.9.26 | deactivate ⑦ 强标 .obsolete + cmdPurge 末 reloadWindow + 三平台主进程退 | extension.js |
| **软编码彻终** | v9.9.27 | cmdPurge step 7/9 + deactivate 兜底 5 处全归一 (印 158) | extension.js |
| **detached cleanup spawn** | v9.9.28 | spawn detached child_process · 脱 ext-host / 主父子链 · 自卸自身本体 (印 159) | extension.js + 内嵌 _cleanup_spawn.js |
| **终端会话池** | **v9.9.29** | **七层污染一招治 · 每 agent 一独立 cmd.exe/bash · OS 进程级隔离 (印 160)** | **extension.js · ~280 行新** |
| **延迟锚定+降频** | v9.9.36 | activate 15s 延迟锚 · deactivate 智能保锚 · 去 API 噪 · 降频减压 · 三窗口连环重载根治 | extension.js |
| **无条件重写** | v9.9.38 | 去 `_cachedAnchored` 门控 · spawn hook 无条件重写 LS args | extension.js + source.js |
| **SCT 精炼** | v9.9.41-44 | `viewed_file`/`learnings`/`SECTION_OVERRIDE`/`session_context` 移出或全删 | source.js |
| **proto 根治** | v9.9.45 | `nestedOk` 移出 if 块 · 消灭偶发 proto 损坏 | source.js |
| **书名号复归** | v9.9.47 | 动态经藏名 · 认知锚点复归 | source.js |
| **精准指经** | v9.9.49 | 移除"及其后文本"冗余补丁 | source.js |
| **双修** | v9.9.50 | INFER_STRIP 回退 · trimUserInfo 截断终端历史 | source.js |
| **CHECKPOINT 桥** | v9.9.51 | 不再剥除 CHECKPOINT · reload 后上下文完整连续 | source.js |
| **损死代码** | **v9.9.52** | **损 CHECKPOINT_BLOCK_RE / CHECKPOINT_MARKER_RE 两未用常量 · 损之又损** | **source.js** |

---

## IV · 软编码 · 适所有用户 / 所有 fork

| 维 | 适法 | 实证 |
|---|---|---|
| 用户名 | `os.userInfo().username` 动态 | extension.js (`forceRestartLS` USERNAME 过滤) |
| home 目录 | `os.homedir()` 跨平台 | extension.js (settings 路径 / .obsolete 路径 / .windsurf/extensions) |
| 配置基目录 | Win=`%APPDATA%` / Mac=`~/Library/Application Support` / Linux=`$XDG_CONFIG_HOME` 或 `~/.config` | extension.js `_settingsJsonPath()` |
| 端口分配 | `default: 0` · per-user **FNV-1a hash** · 8889..8988 (proxy) / 12780..12829 (term) | package.json + extension.js |
| 平台 LS 杀 | Win=`taskkill /F /FI` · Mac+Linux=`pkill -f` (含 `-u $uid`) | extension.js `forceRestartLS` |
| 平台主进程退 | Win=`wmic`+`taskkill /F /PID` · Mac=`ps`+`kill -9 Windsurf.app/MacOS/Windsurf` · Linux=`ps`+`kill -9 windsurf` | extension.js `cmdPurge` F 层 |
| OS 限制 | `package.json.os = ""` · 不限平台 | package.json |
| **扩展 ID 自识** | `SELF_EXT_ID` 抽自 publisher+name | extension.js (v9.9.25) |
| **目录前缀自识** | `SELF_EXT_DIR_REGEX = ^${SELF_EXT_ID}-` | extension.js (v9.9.25) |
| 端口冲突避让 | EADDRINUSE 不抢 · 1 ping 验 · 活复用 · 死归直连 | extension.js `proxyStart` |

**实证**: 主公若 fork 此 repo · 改 `package.json` 之 `publisher` / `name` (e.g. `myorg.dao-mini`) → **不改一行 .js** → 自身 .obsolete 标 / uninstallExtension 调 / deactivate 兜底 全部自适新 ID. 玄同 · 名实终一.

---

## V · 主公装/卸路径

### 装 (三路)

```powershell
# 路 1: install.ps1 (推荐 · 自动检测最新 vsix · Win)
cd dao-proxy-min
.\install.ps1
# install.ps1 软编码: 自动 sort -Descending 找最新 dao-proxy-min-*.vsix · 无需指定版本号

# 路 2: GUI · 命令面板 → "Extensions: Install from VSIX..." → 选 dao-proxy-min-9.9.52.vsix

# 路 3: CLI
windsurf --install-extension dao-proxy-min-9.9.52.vsix --force

# 路 4: Mac/Linux
./install.sh  # 同样软编码自检测最新 vsix
```

### 卸 (二路 · 全自治)

| 路 | 触发 | 内 |
|---|---|---|
| ① **dao.purge** (命令面板「了事拂衣去」) | 主公点 | F 段后 spawn detached cleanup → reloadWindow |
| ② **扩展面板 [✘]** (UI 卸 · CLI uninstall) | 主公手 | watchdog 监 onDidChange → self 不在 extensions.all → 立 spawn detached cleanup + reloadWindow (3s 后) |

**spawn detached cleanup 五招**:

1. sleep 2s — 等 ext-host 真死 + Windows 文件 lock 释放
2. rm 物理目录 — 扫 `<ext-dir>/<self-id>-*` → `fs.rmSync` (10 次重试)
3. patch `extensions.json` — 删 `<self-id>` 条目
4. patch `.obsolete` — 删 `<self-id>-*` 死标
5. kill `:8889~:8988` LISTENING utility — 三法查 cmdline + 兜底 kill

---

## VI · 验

```powershell
# ★ 装毕验 · /origin/preview 三 dot 全亮 (v9.9.52)
# 1. .\install.ps1  (自动检测 dao-proxy-min-9.9.52.vsix · 软编码)
# 2. 重启 Windsurf (或 Reload Window)
# 3. 命令面板 → "道Agent: 启 (invert)"
# 4. 命令面板 → "道Agent: 浏览器观真 SP" → 浏览器开 /origin/preview
# 5. 期: 三 dot=Proxy✓ Capture✓ Mode✓ · 道魂 ~7237 字 (帛书《老子》+ 阴符)
# 6. 期: /origin/ping 返 {"ok":true,"version":"v9.9.52",...}

# 软编码守门 (smoke · 结构自检)
node ../_smoke_v9952.cjs
# 期: 全 PASS · 自动检测最新安装版本 · 无硬编码路径

# SP 注入验: Cascade 新建对话 → 看道Agent Output 频道
# 期: [invertSP] injected · TAO_HEADER + 帛书全文可见

# 无感升级验 (9935→9952):
# 用旧版用户只需重跑 install.ps1 · 自动识别最新 vsix · 旧版标 .obsolete · 新版装毕
```

---

## VII · 主公自决之退路

```text
若 v9.9.52 装即生效 → 期 ✓ · 「本源观照」三 dot 全亮 · 终端三命令可调
若仍诉问题 → 走 dao.purge (官方 [✘] + Reload Window) 净卸再装
若欲打包新版 → 改 package.json.version → .\build_vsix.ps1 → 生成新 vsix
若欲查历史VSIX → ../_归档/vsix_v9929-v9932/
若欲查印161备份 → ../_归档/bak_v9929_yin161/
若仍有连环重载 → 查 Output:道Agent 频道 · 看 activate/deactivate 时间差是否 <30s
若欲验 CHECKPOINT 桥 → reload Windsurf 后开新 chat · 模型仍能引用 reload 前上下文
```

---

## VIII · 道义结

> **损之又损, 以至于无为, 无为而无不为.** ——《四十八章》
>
> v9.9.52 · 损 CHECKPOINT 死代码 · 无引用之常量不留 · 反者道之动 · 损之之极.
> v9.9.51 · 不剥除 CHECKPOINT · 知其本为上下文桥 · 反误判而复命.
> v9.9.36 · 延迟锚定 · 智能保锚 · 降频减压 · 三窗口连环重载根治.
>
> **反者道之动, 弱者道之用.** ——《四十章》
>
> 反硬编码之执 · 用软编码之柔 · SELF_EXT_ID 抽自 package.json · 适所有 fork.
> 反 install.ps1 固化版本 · sort -Descending 自取最新 vsix · 无感升级.
>
> **道法自然.** ——《二十五章》
>
> 软编码、延迟锚定、智能保锚、无条件重写 — 皆顺其自然之道.

---

**2026-05-27 · v9.9.52 整理归一** · 9935→9952 无感升级 · 所有模块软编码适配一切
