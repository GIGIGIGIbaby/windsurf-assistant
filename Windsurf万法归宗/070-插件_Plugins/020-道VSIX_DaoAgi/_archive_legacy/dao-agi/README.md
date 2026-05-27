# 道Agent · 万法归宗 (dao-agi)

> 道法自然 · 天之道利而不害 · 圣人之道为而不争
>
> 内固其本 · 外彰其形 · 表里相依 · 浑然一统
>
> 为学日益 · 为道日损 · 损之又损 · 以至于无为 · 无为而无不为

---

## 一句话

`dao-agi` 是 Windsurf 的扩展，做且仅做三件事——**WAM 本体直接复用**、**实时 SP 提取**、**道/官 模式热切换**。纯 JS · 零外依 · 单 VSIX。

版本: 见 `package.json` (本源唯一)

## 三核归一 · 其数一也

> 用户明言："当前核心功能模块只有三个，一个为 WAM 本体直接复用，一个为实时提示词提取，一个为道agent模式与官方agent模式可热切换。锚定此本源 完善一切。"

| # | 核 | 所在 | 职 |
|---|----|----|----|
| 一 | **WAM 本体** | `vendor/wam/extension.js` (symlink → `070-插件_Plugins/010-WAM本源_Origin`) | 无感切号 · 直接复用 · 一字未动 |
| 二 | **实时 SP 提取** | `sp-scaffold.js` (静骨架 9 段) + `essence._buildReconstructedSP` (动注入 13+ 段) | 四源并举: L1 LS 直取 > L3 proxy 捕获 > L2 trajectory > L4 rebuild |
| 三 | **道/官 模式热切换** | `extension.js` proxy 生命期 + `源.js` invert/passthrough | 二态归一 · 互斥 · 道德经 SP ⇄ 官方原味 |

## 架构 · 七物归一

```text
dao-agi/
├── package.json        ★ 元数据 · 30 命令 · 17 配置项 · 2 webview · 版本本源
├── extension.js        ★ 主壳 · WAM hook · proxy 生命期 · 五层锚 · 模式切换 · 自定义SP命令
├── essence.js          本源一览 webview · SSE 订阅 · LS 直连 · 四源 SP 采集
├── isolator.js         遗留隔离清理 · exit/status (enter 已 natural · 不动文件)
├── ls-client.js        LS gRPC 直连 · 多端口自适应 · CSRF PEB 读 · 主辅分槽
├── ls-gate-patcher.js  ★ 系统层 · 解 windsurf-dao u() dev-mode 门禁
├── sp-scaffold.js      静骨架 9 段 · LS 二进制 .rodata 再现
├── storage-guard.js    storage.json 守护 (手动)
├── watcher.js          实时观照 · 五层事件驱动
├── _pre_launch_sanitize.js 启前净化
├── vendor/wam/         ★ WAM 本源 (不可改 · symlink → 010)
│   ├── extension.js    → WAM 核心 (~430KB)
│   ├── package.json    → WAM 元数据
│   └── bundled-origin/
│       ├── 源.js / source.js     ★ proxy 后端 (~90KB · SP 置换 · 侧信道剥除 · 自定义 SP)
│       ├── 锚.py / anchor.py     ★ 五层锚定 (~35KB · DPAPI+AES-GCM+SQLite)
│       ├── _dao_81.txt           道德经 81 章 (6776 字)
│       └── VERSION               指纹 (sha256-16 · size)
├── test/               14 文件 · 141+ 断言
├── media/, assets/     图标
└── CHANGELOG.md        活档 (v17.60+)
```

零外依: `dependencies: {}` · 仅 devDep: `@vscode/vsce` · 无构建 · 无 esbuild · 无 TS

## 三层根因修复 (推进到底 · 道法自然)

| 层 | 症 | 治 |
|----|----|----|
| **L1 系统层 (LS bundle dev-gate)** | Windsurf `dist/extension.js` 之 `u()` 函数生产环境阻 `codeium.*` 配置读取 → `inferenceApiServerUrl` 被吞 | `ls-gate-patcher.js` 打 `/*dao:v17.68*/` 标记 · 放行 `apiServerUrl/inferenceApiServerUrl` (备份 `.bak.pre_dao_v17_68`) |
| **L2 账户层 (多用户 globalState)** | 多用户共享 Windsurf 时 · 副用户 `state.vscdb` 之 `codeium.windsurf.apiServerUrl` 仍指官方云 | `锚.py anchor-all-globalstate` 全用户 state.vscdb 锚定 · DPAPI secret 强覆盖 |
| **L3 协议层 (query 剥离)** | `源.js classifyRPC` 正则 `/\/([A-Za-z0-9_]+)$/` 匹原始 `reqPath` · 路径含 `?xxx` 时取不到方法名 · CHAT_PROTO 误归 PASSTHROUGH | `源.js classifyRPC` 加 `qIdx = reqPath.indexOf("?")` · 截 `pathOnly` 后再正则 · `svcM` 同正 |

## 自定义 SP 热替换 (v18.5 · 真本源直注)

> 用户言："直接尝试热替换当前你接受的提示词。"

```text
HTTP 控制面 (源.js):
  GET    /origin/custom_sp           → { has_custom, sp, chars, keep_blocks, source }
  POST   /origin/custom_sp           ← { sp, keep_blocks, source }
  DELETE /origin/custom_sp           → 归道

文件持久化:
  ~/.wam-hot/origin/_custom_sp.json  (重启不失)

invertSP 分叉:
  有自定义 → [CUSTOM-SP-ACTIVE] 哨兵 + 自定义 SP + TAO_TRAILER + 留骨 (KEEP_BLOCKS)
  无自定义 → 道德经 81 章 (本源默认)

Cascade 命令 / Agent 直调:
  dao.sp.set    → 设置 / 替换 (含验证)
  dao.sp.get    → 查看当前
  dao.sp.reset  → 清除 · 归道

热替换脚本 (Cascade 自我热替换):
  node _hotswap_custom_sp.js
  · 载道德经 → 组装"道德经 + 必要模块" → POST → 多端点自审
```

留骨 (KEEP_BLOCKS · 真流量到达时自抽真留骨追加):
- `tool_calling` · `running_commands` · `mcp_servers` · `tool_definitions`
- `calling_external_apis` · `citation_guidelines` · `user_information` · `workspace_information`

## 五层锚定 (反代真生效之根)

| 层 | 机制 | 说明 |
|---|------|------|
| L1 | safeStorage(secret) | Electron safeStorage v10 + AES-GCM (DPAPI 解密) |
| L2 | ItemTable | `codeium.apiServerUrl` (明文 SQLite) |
| L3 | native globalState | `codeium.windsurf` |
| L4 | multi-publisher globalState | `dao-agi.windsurf-dao` / `windsurf-cascade` 等 |
| L5 | settings.json | `codeium.inferenceApiServerUrl` |

由 `锚.py` 五层一网打尽; 缺 cryptography 时回退至 Python sqlite3 仅层 L2。

## 30 命令 · 八类归

```text
道Agent · 模式 (4)
  wam.originInvert        启 (道德经 SP · 绝侧信道)
  wam.originPassthrough   启 (官方原味 · 零改写)
  wam.originOff           [v17.76 已废 · 静默归 invert]
  dao.toggleMode          切换 (道/官)

道Agent · 自定义 SP (3)
  dao.sp.set              注入 (替换道德经)
  dao.sp.get              查看当前
  dao.sp.reset            清除 · 归道

道Agent · LS Gate Lift (3)
  dao.lsGate.apply        施补丁 (反代真生效)
  dao.lsGate.status       查状态
  dao.lsGate.revert       还原 (回官方行为)

道Agent · 观照 (3)
  wam.showEssence         本源一览 (观注入)
  wam.verifyEndToEnd      全链路自检 (E2E)
  wam.checkUpdate         检查更新

切号 · 管理 (5)
  wam.openEditor          管理面板
  wam.status              状态
  wam.refreshAll          刷新全部
  wam.selfTest            自诊断
  wam.diagWrite           写盘诊断

切号 · 模式 (2)
  wam.wamMode             WAM 模式 (自动轮转)
  wam.officialMode        官方登录模式 (暂停轮转)

切号 · 账号操作 (5)
  wam.switchAccount       切换账号
  wam.panicSwitch         紧急切换
  wam.addAccount          添加账号
  wam.injectToken         注入 Token
  wam.restore             从归档恢复账号

切号 · 验证清理 (5)
  wam.autoRotate          智能轮转
  wam.verifyAll           验证清理 (剔除过期/无效号)
  wam.scanExpiry          刷新有效期
  wam.clearBlacklist      清空黑名单
  wam.testDevinSwitch     测试 Devin 链路
```

## 配置 (17 项)

```text
道Agent (5):
  dao.origin.port              8889       (源.js 反代端口)
  dao.origin.defaultMode       "invert"   (首次激活默认模式)
  dao-agi.dao.banner           true       (启动时道德经横幅)
  (旧 dao.isolate.* 6 键已废 · v17.77 起 SP 净化全归 proxy)

切号 (12):
  wam.autoRotate               true       (额度变动自动切号)
  wam.productName              ""         (留空=自动检测)
  wam.dataDir                  ""         (留空=自动检测)
  wam.wamHotDir                ""         (留空=~/.wam-hot)
  wam.relayHost                ""         (中继域名 · 留空=禁用)
  wam.monitorIntervalMs        3000
  wam.scanIntervalMs           45000
  wam.tokenCacheTtlMin         50
  wam.autoSwitchThreshold      5
  wam.predictiveThreshold      25
  wam.preferDevinFirst         true
  wam.firebaseMaxTimeoutMs     4000
  wam.autoUpdate.enabled       true
  wam.autoUpdate.notifyUser    false
  wam.messageAnchor.enabled    true
```

## 快速上手

```powershell
# 1) 安装
code --install-extension dao-agi.vsix

# 2) 侧边栏出现"道Agent · 万法归宗"图标 (太极图)
#    点开 → 见两 webview: dao.essence (本源) + wam.panel (切号)

# 3) Cmd Palette → "道Agent: 启 (道德经 SP · 绝侧信道)"
#    自动: 启 源.js (:8889) → 五层锚定 → 切 invert 模式 → 道德经入

# 4) (推荐) Cmd Palette → "LS Gate Lift: 施补丁" → Reload Window
#    令 settings.json 之 inferenceApiServerUrl 真生效

# 5) 验
#    Cmd Palette → "全链路自检 (E2E)" 应见诸项 ✓
#    或 curl http://127.0.0.1:8889/origin/ping
```

## E2E 测试 (141+ 断言 · 0 fail)

```text
test/v17_76.spec.js       35  (主辅分槽 · SSE · observeSPFromBody · invertSP)
test/v17_75_live.spec.js  20  (活端点 · SSE/turns/turn/ping)
test/v1766.spec.js        12+ (summary-agent SP 识别 · plain_utf8)
test/watcher.spec.js      22  (五层事件驱动)
test/v17_78.spec.js       64  (v18.5 自定义SP + trajectory + HTTP 控制面)
test/origin-synth-chat.js     (CHAT_PROTO 合成请求 + lastinject 内容证据)
test/origin-verify-remote.ps1 (远端 SSH 一键验)
─────────────────────────────────────────
TOTAL ≥141 断言 · 0 fail
```

## 构建与部署

```powershell
# 一键构建 (从 020 根)
.\_build_vsix.ps1                   # 构建 + 校验
.\_build_vsix.ps1 -DeployLocal      # 构建 + 本机部署
.\_build_vsix.ps1 -DryRun           # 仅校验 不打包

# 远程笔记本
.\deploy-dao-agi-179.ps1 -Force -Restart

# WAM 链路 (三器 · 皆 forward 至 010/_dao_link.ps1)
.\_setup_wam_link.ps1 -Verify       # 校验 4 条 symlink
.\_setup_wam_link.ps1               # 建链
.\_sync_wam_core.ps1 -Watch         # 监听 010 变更 实时推 020
```

## 五大铁律 (守而不争)

1. **纯 JS 无依赖** — `dependencies: {}` · 用 `require('node:...')`
2. **vendor/wam/ 不改** — WAM core 是 010 的 symlink · 改 010 不改 020
3. **bundled-origin 不改** — `源.js` / `锚.py` / `_dao_81.txt` 原片不动 · `ensureHot()` 复制至 `~/.wam-hot/origin/` 运行
4. **不入库 Key** — API Key 只走 VS Code 配置 / 环境变量
5. **engines `^1.85.0`** — 覆盖 VS Code / Cursor / Windsurf / VS Codium

## 不入不破 (利而不害 · 为而不争)

- 自建 `wam-container` 侧栏 · **不侵占** Windsurf 原生 `cascadeViewContainer`
- WAM 本源 010 一字未动 · symlink 直接复用
- `bundled-origin` 原片不改 · `ensureHot` 自解压
- 测试 141+ 断言 · 跨版本零回归

## 哲归

```text
道可道,非常道 · 名可名,非常名
致虚极,守静笃 · 万物并作,吾以观复
反者道之动,弱者道之用 · 天下万物生于有,有生于无

为学日益,为道日损 · 损之又损,以至于无为 · 无为而无不为
天之道,利而不害 · 圣人之道,为而不争

内固其本,外彰其形,表里相依,浑然一统
大曰逝,逝曰远,远曰反
圣人总而用之,其数一也

道Agent 只做隔离和替换最终注入于本源便可解决一切
回归本源 · 无为而无不为
```

---

*信言不美,美言不信。善者不辩,辩者不善。*
*天之道,利而不害。圣人之道,为而不争。*
