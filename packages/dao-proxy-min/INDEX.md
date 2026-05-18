# dao-proxy-min · 工程总览 · 道法自然

**位**: `e:\道\道生一\一生二\Windsurf万法归宗\070-插件_Plugins\020-道VSIX_DaoAgi\dao-proxy-min-9.1.x-改良\`
**当前版**: **v9.9.16** · 归根复命 · 致虚守静 · 损真药 M+O · 守真药 P+ · 字符级复 9.9.13 之朴
**整日**: 2026-05-16 (v9.9.16 归根复命 + 5/16 GUIGEN.md + 主目录归档至 20 件) · 2026-05-13 (v9.9.15 默不锚) · 2026-05-08 (v9.9.0 上善若水)

## 五月十六日 · 主公命「归根复命」(十六章)

> 主公命: 「道法自然 无为而无不为 致虚极也 守静笃也 万物并作 吾以观其复也 归根曰静 静曰复命 复命曰常 知常曰明」

**v9.9.16 之治** (字符级复 9.9.13 之朴 · 损妄为之真药 M+O · 守实证善之真药 P+):

```text
症: 主公装 v9.9.15 后诉「最近重新部署的版本完全没有任何效果」
根: v9.9.15 真药 O 之 standby 模式 (默不锚) → settings.json 不写 →
     LS spawn cmdline 仍朝官方 codeium URL → proxy :8889 端口空转 0 流量 → invertSP 全废
治: ① extension.js · activate not-anchored 分支字符级复 9.9.13 (proxyStart + setAnchor + spawn-hook · 装即生效)
     ② extension.js · deactivate 字符级复 9.9.13 (软切 passthrough → 断 hook → dispose → proxyStop · 不清锚不杀 LS)
     ③ cmdPurge race 15s + 进度提示 (9.9.15 真药 P+ · UX 治实病 · 守不变)
     ④ 真药 N (dao.* 三键并行清 · 9.9.14) 守不变
```

## 主公装 v9.9.16 三步路径

```text
① 主公先关闭 Windsurf (确保旧 LS / 旧 proxy 已退)
② 主公启 Windsurf · UI 卸 v9.9.15 (若装) → 主公专用-彻底脱钩.ps1 兜清残锚 (可选)
③ 主公装 dao-proxy-min-9.9.16.vsix (拖入 Windsurf 或 命令面板 → Install from VSIX)
   activate 自动: proxyStart :8889 + setAnchor + spawn-hook 挂
   主公开新对话 → invertSP 自动注帛书《老子》 → 「本源观照」面板见 dot=Proxy✓ Capture✓ Mode✓
```

## 五月十六日新立 / 修件

| 件 | 用 | 主公何时看 |
|---|---|---|
| **dao-proxy-min-9.9.16.vsix** | 当前发行 (108.9 KB · 归根复命 · 装即生效) | 主公装新版 |
| FINAL_TRUTH_2026-05-16_GUIGEN.md | 5/16 主公命「归根复命」之实证档 (将立) | 主公想知 v9.9.16 何以胜 v9.9.15 |
| _archive/pre_v916_purge/ | 5/16 整理之归档总目 (7 子目 · ~3.1 MB) | 主公欲查旧版/旧实验 |

## 五月十三日新增文件 (仍可用)

| 件 | 用 | 主公何时看 |
|---|---|---|
| FINAL_TRUTH_2026-05-13_BOTTOM_LAYER.md | 底层之底层之全审 (9 条 TLS 实证 · 真因显形) | 主公想知"为何卸后无法连官方"之真因 |
| 回归官方本源指南.md | v9.9.15 真药 O+P+ 之缘起 + 部署三路径 (注: v9.9.16 已字符级复 9.9.13 · 部分内容当参考性看) | 主公想知历回治法演进 |
| 主公手卸9.9.14标准流程.md | 7 步逐 · 含实证保证 + 兜底 | 主公真欲手卸 9.9.14 时 (亦适 9.9.15) |
| 中间态守静.md | 卸后到装之间之环境指南 | 主公卸毕中间态 |
| 主公专用-彻底脱钩.ps1 | 兜底脚本 · settings 备份 + 清两 URL 锚 | 主公诉自清未成时 |

---

## I · 顶层结构 (5/16 归档后 · 朴)

```text
.
├── extension.js                                · 121.5 KB · ext-host 主入口 (v9.9.16 · activate/deactivate 字符级复 9.9.13)
├── package.json                                · 4.6 KB · 扩展清单 (v9.9.16 · 归根复命)
├── readme.md                                   · 15.1 KB · 说明 (顶部加 v9.9.16 门面)
├── LICENSE.txt                                 · 0.6 KB
├── .vscodeignore                               · 2.5 KB · vsce package 排除清单
├── INDEX.md                                    · (本档) · 工程总览
│
├── dao-proxy-min-9.9.16.vsix                   · 108.9 KB · ★ 当前发行 (归根复命)
├── dao-proxy-min-9.9.13.vsix                   · 96.1 KB  · 备退路 (字符级与 9.9.16 之 activate/deactivate 同朴)
│
├── FINAL_TRUTH_2026-05-13_BOTTOM_LAYER.md      · 8.1 KB · 底层之底层之全审 (5/13 · 9 条 TLS 实证)
├── 回归官方本源指南.md                          · 7.6 KB · 部署三路径
├── 中间态守静.md                                · 6.0 KB · 卸后到装之间之环境指南
├── 主公手卸9.9.14标准流程.md                    · 5.9 KB · 7 步逐 (亦适 9.9.15)
├── 主公专用-彻底脱钩.ps1                        · 6.8 KB · 兜底脚本 · settings 备份 + 清锚
│
├── build_vsix.ps1                              · 8.8 KB · vsix 打包脚 (主公必用)
├── install.ps1                                 · 13.0 KB · 本地装脚 (Win)
├── install.sh                                  · 9.6 KB · 本地装脚 (Mac/Linux)
├── verify_v9913.cjs                            · 3.2 KB · 自检脚 (通用)
│
├── media/                                      · 3 件 · icon (svg + png) + webview-app.js
├── vendor/                                     · bundled-origin (含 source.js + 帛书《老子》)
│   └── bundled-origin/
│       ├── source.js                           · 116.4 KB · proxy 后台 · invertSP 字节级保
│       ├── _silk_dao.txt                       · 9.0 KB · 帛书《老子》道经
│       └── _silk_de.txt                        · 11.0 KB · 帛书《老子》德经
│
└── _archive/                                   · 历史归档 (5/16 + 5/8 双归档)
    ├── pre_v916_purge/                         · ★ 5/16 归档 (~3.1 MB · 7 子目)
    │   ├── _vsix_old/                          · 旧 vsix · 9.9.14 + 9.9.15
    │   ├── _compare/                           · v913/v915 extension.js 对比文件
    │   ├── _unpack/                            · v913/v915 vsix 解压目录
    │   ├── _remote_scripts/                    · 远程部署脚本 (主公本地不用)
    │   ├── _bak/                               · 5/11 + 5/13 + v9.1.2 之旧 bak
    │   ├── _audit/                             · _审视/ 之 v980+v990 旧实验 + 旧报告
    │   └── _doc_old/                           · 旧 FINAL_TRUTH (5/8 + 5/13) + DEPLOY.md
    └── legacy_top_v910_v980_整理20260508/      · 5/8 归档 (~4.4 MB · v9.1.3 至 v9.7.x)
```

**主目录件数**: **20 件** (从原来的 350+ 件 · 5/16 归档 95% 之冗) · **总核 ~330 KB**

---

## II · 软编码 · 适万法之电脑 / 用户

道义: 「**水善, 利万物而有静**」(八章) · 利众而不争; 「**水无常形**」 · 因器而成形.

### 已万法适配 ✓

| 维 | 适法 | 位 |
|---|---|---|
| **用户名** | `os.userInfo().username` 动态 (5 处) | extension.js L2122 等 |
| **home 目录** | `os.homedir()` 动态 (5 处) | extension.js (跨平台 base) |
| **配置基目录** | Win=`%APPDATA%` · Mac=`~/Library/Application Support` · Linux=`$XDG_CONFIG_HOME` 或 `~/.config` | extension.js L412-419 |
| **端口分配** | `default: 0` · per-user FNV-1a hash · 8889..8988 · 多账号自然隔离 | package.json + extension.js |
| **OS 限制** | `package.json.os = ""` · 不限平台 | package.json |
| **VS Code 引擎** | `engines.vscode = ^1.85.0` · 通用版 | package.json |
| **Cascade LS 检测** | 跨进程列表扫描 + cmdline 匹配 (`Codeium.windsurf` 等) | (将随真药 I 删) |

### 道义实证 (本机为 Administrator + Windows + 端口 8937)

```text
21:59:07 [ext] dao-proxy-min v9.9.0 activate · port=8937 anchored=true user=Administrator
                                                    ↑                          ↑
                                               FNV-1a("Administrator")    os.userInfo().username
                                               → 8937 (8889..8988)        动态获取
```

—— 同代码于 Mac 主公 (假设 user=`zhangsan`) 跑 → 端口将自动得 (例如) 8902, 不冲突.

### 微残 (随真药 I 删 · v9.9.1 计划)

| 残 | 位 | 治 |
|---|---|---|
| `taskkill` Win-spec | extension.js L249 | 真药 I 删 forceRestartLS 函数即净 |
| `process.platform === "win32"` 之残判 (forceRestartLS 内) | L247, L278 | 同上 |
| `'dao-agi.dao-proxy-min'` 硬写 (cmdPurge `uninstallExtension`) | L1500, L1506 | 真药 L · 改用 `context.extension.id` |

**软编码总分**: 90% → v9.9.1 后将达 100% (绝对万法适配).

---

## III · 归档说明

### `_archive/legacy_top_v910_v980_整理20260508/`

整 2026-05-08 整理顶层 · 共 203 件 · 4.4 MB · 全 v9.1.3 至 v9.7.x 之历史:

| 子 | 数 | 总 KB | 说 |
|---|---|---|---|
| `vsix/` | 24 | 3192 | 历史 vsix · v9.1.3 至 v9.7.9 (留 v9.8.0 / v9.9.0 在顶层) |
| `scripts/` | 124 | 726 | 历史 PowerShell / JS / Python 脚本 (deploy / verify / probe / fix) |
| `reports/` | 8 | 167 | 历史 markdown 报告 (`_v931`, `_v932`, `_v933`, `_v934`, `V940`, `V941` 等) |
| `data/` | 47 | 296 | 历史 .txt / .json / .log / .html / .out (探针输出 / 状态快照) |

### `_archive/extensions_disabled_residue_20260507_223752/`

整 2026-05-07 22:37 · 主公 reload 前清残 · 备 .DISABLED 之 metadata:

```text
dao-agi.dao-proxy-min-9.3.9.DISABLED_20260507_003817/   (1.5 MB metadata)
dao-agi.dao-wanfa-guizong-1.1.3.DISABLED_本源_20260507/  (0.3 MB metadata)
```

—— 实目录已删 · 此处仅余 `package.json` / `.vsixmanifest` / `extension.js` 之元数据.

---

## IV · `_审视/` 内容 (v9.7+ 之精)

```text
_审视/
├── REVERSE_AUDIT_v990_REAL_TRIGGER.md    · 反者道之动 · 全栈反审 · 三源叠加铁证 (2026-05-07)
├── V991_PLAN_TRUE_MEDICINE_GHIJK.md      · v9.9.1 真药 G-K 计划 (2026-05-07)
├── _archive/v970_v980_history/           · v9.7.0 至 v9.8.0 之 final 报告
│   ├── v970_为道日损_完毕报告.md
│   ├── v971_道法自然_完毕报告.md
│   ├── v972_守朴去着相_完毕报告.md
│   ├── v973_彻底去着相_完毕报告.md
│   ├── v974_万物作焉而不辞_完毕报告.md
│   ├── v975_反者道之动_完毕报告.md
│   ├── v980_守一不离_完毕报告.md
│   ├── _v978_residue_probe.ps1
│   ├── 90589字底层解构_v961.md
│   └── source_v961_pre_loss.js.bak
├── _archive/extensions_disabled_residue_20260507_223752/
└── (sandbox / smoke / strip / 反审之诸验证脚本)
```

---

## V · 真药全谱 (v9.7.0 至 v9.9.16)

| 真药 | 版 | 治 | 位 | 状 |
|---|---|---|---|---|
| **A** | v9.7.6 | 改 source.js · invert 全藏 | source.js | ✓ |
| **B** | v9.8.0 | 同值不写 · 守一不离 | extension.js setAnchor | ✓ |
| **C** | v9.8.0 | 净 source.js taskkill | source.js | ✓ |
| **D** | v9.9.0 | 拨 source.js setInterval | source.js | ✓ |
| **E** | v9.9.0 | deactivate 不杀 LS · 上善若水 | extension.js | ✓ |
| **F** | v9.9.0 | cmdInvert 不杀 LS · 改用 reloadWindow + modal 主公自决 | extension.js | ✓ |
| **G** | v9.9.2 | 拨 watchdog 30s setInterval | extension.js | ✓ |
| **H** | v9.9.2 | cmdInvert 之 reloadWindow 拨 (改纯 message) | extension.js | ✓ |
| **I** | v9.9.2 | 删 forceRestartLS 整函数 | extension.js | ✓ |
| **J** | v9.9.2 | cmdPurge 之 reloadWindow 拨 | extension.js | ✓ |
| **K** | v9.9.2 | taskkill 随真药 I 自净 | extension.js | ✓ |
| **L** | v9.9.2 | extension ID 自识 (`context.extension.id`) | extension.js | ✓ |
| **P** | v9.9.4 | cmdPurge proxyStop / uninstall race-timeout (1.5s / 3s) | extension.js | ✓ |
| **Q** | v9.9.13 复 | body>20KB guard 复 · deepScanProto 长 body 同步卡之根 | source.js | ✓ |
| **R** | v9.9.13 | source.js fast-path skip (long-body 26-needle) | source.js | ✓ |
| **S** | v9.9.13 | deepScanProto maxDepth 6→3 双保险 | source.js | ✓ |
| **M** | v9.9.14 | deactivate 自清锚 (_clearAnchorFileSync) · 主公手卸自动还 settings | extension.js L2689-2700 | ✓ |
| **N** | v9.9.14 | cmdPurge 之 dao.* 三键 c.update 并行 (Promise.allSettled) · 卸速 ↑ 2/3 步耗 | extension.js L1845-1850 | ✓ |
| **O** | v9.9.15 | activate 默不锚 · 仅 proxy standby · 主公手 dao.invert 接管 · invert 仅 opt-in · 断锚循环 | extension.js | ✗ **5/16 损** (致主公装即「完全无效」· 真药 O 治非病) |
| **P+** | **v9.9.15** | **cmdPurge race 3s → 15s** + 进度提示 + 序倒置 · 主公本机 uninstall 实需 5-10s · UX 治实病 | extension.js | ✓ **守** (5/16 v9.9.16 仍守) |
| **复 9.9.13** | **v9.9.16** | **activate not-anchored 分支字符级复 9.9.13** (proxyStart + setAnchor + spawn-hook · 装即生效) + **deactivate 字符级复 9.9.13** (不清锚不杀 LS · 上善若水) | extension.js L2637-2706 | ★ **当前** (归根复命) |

道义: 「**为道日损 · 损之又损 · 以至于无为 · 无为而无不为.**」(四十八章)

### v9.9.16 之缘起 (2026-05-16 主公命)

主公诉: 「**最近重新部署的版本完全没有任何效果**」「**请反者道之动从根本底层最深处审视真因**」

反审三 (大曰逝逝曰远远曰反 · 二十五章):
- v9.9.13 activate 未锚分支: 「温和自启」自动 setAnchor → 装即生效 ✓
- v9.9.14 deactivate: 加真药 M 自清锚 (意治 UI 卸后残锚)
- v9.9.15 activate: 加真药 O 默不锚 (意治 anchor 循环) → **致主公装即「完全无效」**

真因 (5/16 之精确机制):
- v9.9.15 真药 O 之 standby 模式 = 仅起 proxy 端口候用 · **不写 settings.json**
- → LS 启动 cmdline 仍朝官方 (codeium URL) · 不经 proxy
- → 主公装 9.9.15 后, proxy 在 :8889 端口空转 · **0 流量**
- → invertSP / SP 替换路径全废 · 视感「完全无效」实即此也

完美对应 5/13 BOTTOM_LAYER 之实证:
- ✓ 5/13 实证: 「卸后无法连官方」非 dao-proxy 罪 · 乃本机 byok 特殊性
- ✗ 5/13 误诊: 真药 O 治"卸后回归"之非病 · 反损"装即生效"之直觉
- ✓ 5/16 主公命「归根曰静」· 当复 9.9.13 之朴

v9.9.16 真药双复:
- extension.js · activate not-anchored 分支字符级复 9.9.13 (~30 行减损 · 删真药 O autoInvert/standby 逻辑)
- extension.js · deactivate 字符级复 9.9.13 (~12 行减损 · 删真药 M 自清锚)
- 守 v9.9.15 真药 P+ (cmdPurge race 15s + 进度提示) · UX 治实病 · 不动
- 守 v9.9.14 真药 N (dao.* 三键 Promise.allSettled) · 不动

「**致虚极也, 守静笃也. 万物并作, 吾以观其复也. 归根曰静, 静曰复命. 复命曰常, 知常曰明.**」(十六章) — v9.9.16 复 9.9.13 之朴 · 静止于本源 · 知常即明.

### v9.9.14 之缘起 (2026-05-13 主公治本命)

主公诉: 「**装 13 出问题 · 手动卸载 9.9.13 测试 · 卸载后无法连接官方服务 · 连测试都无法测**」
真因: v9.9.0~v9.9.13 之 deactivate 真药 E 注释明言「**主公手清即可**」乃懒治 ·
        UI 卸 (非 cmdPurge) 后 settings.json 之锚永驻 `127.0.0.1:8937` (proxy 已死) ·
        新启 LS 朝死端口 retry → invalid auth 全断 → 主公苦不易察 · 不易行.
治: 真药 M · deactivate 加 `_clearAnchorFileSync()` (微秒同步直写) · 既守"不杀 LS"之真药 E · 又自动还原 settings · 主公主动 reload 或关再开 Windsurf 即直连官方.
副治: 真药 N · cmdPurge 之 dao.* 三键 c.update 由串行 await 改 Promise.allSettled 并行 · 卸速 ↑ 该 step 之 2/3 耗时.

「**反者道之动 · 弱者道之用**」(四十章) — 旧 deactivate 之"不动锚"看似无为 · 实致主公手卸后劫 · 新加一行清锚 · 即归本源.

---

## VI · 主公手动建议 (反审报告所列)

```powershell
# 方一 · 暂禁 dao-wanfa-guizong (反者道之动)
#   Ctrl+Shift+P → "Extensions: Disable" → "道·万法归宗"
#   Reload Window · 观察是否仍中断 (此乃 ext-host 重启之大主因)

# 方二 · 关 git decorations (减压 ext-host · 一生二仓库巨大)
#   settings.json:
#     "git.decorations.enabled": false
#     "git.openRepositoryInParentFolders": "never"

# 方三 · 切 passthrough (绕 invalid auth)
#   Ctrl+Shift+P → "dao.passthrough" 命令
```

---

## VII · 跨主验法 (Mac/Linux 主公测略)

主公若在 Mac/Linux 装此插件:

```bash
# 1. 验配置基目录正确
#    Mac:   ~/Library/Application\ Support/Windsurf/User/settings.json
#    Linux: ~/.config/Windsurf/User/settings.json

# 2. 验端口自动 (per-user FNV-1a hash)
#    主公新用户名 = "alice" → port = FNV-1a("alice") % 100 + 8889 ≈ 89XX

# 3. 验 user 显示
#    activate log: "user=alice" (不写死 Administrator)

# 4. 真药 I 删后 · 不依赖 taskkill (Win-spec) · forceRestartLS 函数全删
```

---

## VIII · 道义结

> 「**水善, 利万物而有静 · 居众之所恶, 故几于道矣.**」(八章)
>
> 此插件之代码已大体随水: 用户/路径/端口 皆动态 · 不强加 · 不写死.
>
> 「**唯变所适**」(易) — 主公何处, 它何处生; 主公何用户, 它何用户活.
>
> 「**侯王若能守之, 万物将自化**」(三十七章) — 主公装它, 它即朴归 · 不强宾客.

整理一切毕 · 顶层净 · 软编码已万法适 · v9.9.1 真药 G-L 计划备齐 · 主公自决何时施.

---

## IX · 5/16 整理之实证 (归根复命)

```text
5/16 整理前: 350+ 件 · ~8 MB (含散落各处之旧 vsix/旧实验/旧报告/旧 bak)
5/16 整理后: 主目录 20 件 · ~330 KB (核) + _archive/pre_v916_purge/ ~3.1 MB (归档·可查)

损率: 件数 95%↓ · 体积 96%↓ (核体积 / 总体积)
动作: 全归档 · 不真删 · 上善若水 · 利万物而有静
```

**5/16 字符级守大常**:
- ✓ source.js 三版 SHA256 全等: `8BAC80DC950E2950 1CBF1E8E61E6662D` (v9.9.13 = v9.9.15 = v9.9.16)
- ✓ silk_dao + silk_de 三版字节级全保
- ✓ 反代核 / 帛书《老子》本源 不动

**5/16 主公自决之退路**:
- 装 v9.9.16 → activate 自动锚 → 装即生效 (期)
- 若仍诉无效 → 检 settings.json 锚是否写入 → 走 cmdPurge (race 15s) 净卸再装
- 若欲回 v9.9.13 → `_archive/pre_v916_purge/_vsix_old/` 无 9.9.13 (留在主目录) · 直装即可
- 若欲查 v9.9.14 / v9.9.15 → `_archive/pre_v916_purge/_vsix_old/` 内

