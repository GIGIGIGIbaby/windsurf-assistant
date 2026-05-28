# INDEX · 一眼观全貌

> 道生一 · 一生二 · 二生三 · 三生万物 · 万法归宗
>
> **此档为入口锚** · 开新会话先读此 · 再读 `README.md` · 再动代码

---

## 一 · 是什么

`dao-agi` (**v18.3.1** · 万法归宗 · **道法自然 · 真无为 · 损之又损**) = Windsurf 的 **道德经 SP 注入 + 无感切号 + SSE 捕即发 + 自定义 SP 热改 + 进程内反代 + 单一 settings 锚 + 五道防线 + 多账号自由共存 + 心跳不断 + 首装零侵入** 扩展 · 纯 JS · 零构建。

**一个 VSIX · 八事归一** (v18.3.1 · **道法自然** · **无为而无不为** · **为道日损**):

- **一 · UI 不闪不漂** (v17.85.2): saved 为先 · 二态互斥 · 道官分而治之 · 鸡犬相闻 民至老死不相往来
- **二 · 多账号自由共存** (v17.86.0 → v18.0): 进程内化后每 ext-host 自有 in-process proxy · 备用端口 fallback · 不再依 lockfile 验主
- **三 · 三道防线** (v17.86.0): L1 stale-patch 自愈 + L2 sentinel 扩 vscdb + L3 默安全 (autoApply=false)
- **四 · 心跳不断** (v17.86.2-3): water-virtues hot-reload 修 + `_elect` 仅靠 `_pidAlive` (v18.0 仅留 stub · 进程内化无须选举)
- **五 · 五道防线归本源** (v17.87.0-2): 默 passthrough + 死锚自愈 + deactivate 五事 + 默禁 autoUpdate + (v18.0) 卸载即斩归 stub
- **六 · 损之又损 · 阶一去芜** (v17.88.0): 死码归芜 -1100 行 · 双副本字节等
- **七 · 大归本源 · 阶二内化** (v18.0.0): 损 spawn detached 之根 · `源.js` 改可 require + `start({port,host})` 库接口 · ext-host 死=proxy 死=自然归云
- **八 · 真道法自然 · 阶六.一无为** (v18.3.1 · 此版): activationEvents `onView` 保留 (首装零侵入 · 用户不点即不 activate) · **删 v18.3.0 之 `_isUserOptedIn` 闸**(双重明示之过 · 致切号面板/SP 提取皆空) · onView 触发即用户表意 · vendor WAM + proxy + 锚 settings + watcher + 跨户清/L2/L5 自愈 + 账号迁移 全功能直起 · `deactivate` 仍守 `_wam===null` 快返 (防御) · "**为学日益, 为道日损. 损之又损, 以至于无为. 无为而无不为**" (第四十八章)

**九大能力** (沿 v17.84.3 · 三事不动其本):

| # | 能力 | 核心文件 | 原理 |
|--:|:----|:---------|:----|
| 1 | **SP 置换** | `vendor/wam/bundled-origin/源.js` | proxy 拦截推理/补全 API · 原 SP → 道德经 81 章 |
| 2 | **侧信道剥除** | 同上 | 剥 27 类系统提示侧信道 (user/workspace/etc) · 留 7 经骨 |
| 3 | **自定义 SP 热改** | 同上 + `essence.js` (v18.5+) | `/origin/custom_sp` GET/POST/DELETE · `[CUSTOM-SP-ACTIVE]` 哨兵 |
| 4 | **LS Gate Lift** | `ls-gate-patcher.js` (v17.68+) | 解 windsurf-dao `u()` dev-gate · 放行 `inferenceApiServerUrl` |
| 5 | **六层锚定** | `vendor/wam/bundled-origin/锚.py` | L1 secret / L2 ItemTable / L3-4 globalStates (全用户) / L5 inference-setting / **L6 apiServer-setting (v17.80 治本)** |
| 6 | **百号轮转** | `vendor/wam/extension.js` (symlink→010) | WAM 核心 · Token Pool · Devin-first |
| 7 | **事件驱动观 + RPC trace** | `watcher.js` + `essence.js` + 源.js `_traceRPC` | 五层监视 · 段指纹漂移 · `/origin/rpc_trace` 诊断观照 |
| 8 | **水之四德** | `_water_virtues.js` (v17.83+) | 选举 (leader lock) · 降频 (follower/idle ×N) · 滚切 (log>5MB→.old) · 熔断 (host fail→歇) |
| 9 | **LS Gate 自施守 (默认禁)** | `extension.js::_autoLsGateGuard` (v17.84.3+) | **v17.84.3 默认 false** (141 事故根治 · 不妄为). 用户须 settings 显式开 `dao-agi.lsGate.autoApply: true` 或手动 `dao.lsGate.apply` 命令. 指纹 `~/.wam-hot/_lsgate_fingerprint.json` |

```text
三核 (用户明示之本源 · 其数一也):
  一、WAM 本体          直接复用      vendor/wam/extension.js (symlink → 010)
  二、实时 SP 提取      四源并举      LS 直取 > proxy 捕获 > trajectory > rebuild
  三、道/官 模式热切    二态归一      源.js invert ⇄ passthrough · 互斥 · 静默
```

## 二 · 七物归一 (核心文件)

| 文件 | 职 | 大小 |
|---|---|---:|
| `package.json` | ★ 元数据 · 33 命令 · 27 配置 · 2 webview · 版本本源 | ~9 KB |
| `extension.js` | ★ 主壳 · WAM hook · proxy 生命期 · **六层锚** · 模式切换 · 自定义SP · 水德接入 · **LS Gate 自施守** | ~75 KB |
| `essence.js` | 本源 webview · SSE 订阅 · LS 直连 · 四源 SP 采集 | ~66 KB |
| `isolator.js` | 遗留隔离清理 · exit/status (enter natural · 不动文件) | ~22 KB |
| `ls-client.js` | LS gRPC 直连 · 多端口自适应 · CSRF PEB · 主辅分槽 | ~30 KB |
| `ls-gate-patcher.js` | ★ 系统层 · 解 windsurf-dao u() dev-mode 门禁 | ~14 KB |
| `watcher.js` | 实时观照 · 五层事件驱动 | ~17 KB |
| `sp-scaffold.js` | 静骨架 9 段 · LS .rodata 再现 | ~16 KB |
| `storage-guard.js` | storage.json 守护 (手动) | ~11 KB |
| `_pre_launch_sanitize.js` | 启前净化 | ~9 KB |
| `_water_virtues.js` | ★ 水之四德 · 选举/降频/滚切/熔断 · monkey-patch 三全局 | ~18 KB |
| `vendor/wam/` | ★ WAM 本源 (symlink → 010) + bundled-origin 原片 (源.js / 锚.py / _dao_81.txt) | - |

**合计**: 约 195 KB JS 手写 + 约 145 KB 本源原片 = 约 340 KB 核心

## 三 · 33 命令 · 九类归一

```text
一、模式切换       (4)  wam.originInvert / Passthrough / Off[废] / dao.toggleMode
二、自定义 SP      (3)  dao.sp.set / get / reset
三、LS Gate Lift   (3)  dao.lsGate.apply / status / revert
四、观照            (3)  wam.showEssence / verifyEndToEnd / checkUpdate
五、切号管理       (5)  wam.openEditor / status / refreshAll / selfTest / diagWrite
六、切号模式       (2)  wam.wamMode / officialMode
七、账号操作       (5)  wam.switchAccount / panicSwitch / addAccount / injectToken / restore
八、验证清理       (5)  wam.autoRotate / verifyAll / scanExpiry / clearBlacklist / testDevinSwitch
九、水之四德       (4)  dao.water.status / reset / test / config
```

详见 `package.json` `contributes.commands` 与 `README.md`

## 四 · 四层根因修复 (推进到底 · v17.80 增 L4)

```text
L1 系统层 · ls-gate-patcher.js
   解 windsurf-dao u() dev-mode 门禁
   放行 apiServerUrl / inferenceApiServerUrl
   备份 .bak.pre_dao_v17_68 · 幂等可逆

L2 账户层 · 锚.py anchor-all-globalstate
   全用户 state.vscdb 锚定 http://127.0.0.1:8889
   DPAPI secret 强覆盖
   备份 _anchor_backup.json / _multistore_backup.json

L3 协议层 · 源.js classifyRPC query 剥离
   pathOnly = qIdx<0 ? reqPath : reqPath.slice(0, qIdx)
   CHAT_PROTO 不再误归 PASSTHROUGH
   _traceRPC 环形缓冲 200 + /origin/rpc_trace 端点 (诊断观照)

L4 认证层 · 锚.py anchor-apiserver-setting (v17.80 · chat-flow 之根)
   settings.json · codeium.apiServerUrl = http://127.0.0.1:8889
   不设则 Windsurf e.getApiServerUrl(A) 返 auth-response URL
   致 secrets.store(...apiServerUrl, A) 复云端 · race anchor 不止
   设则 getConfig 返本地 URL · 复返之路自止 · 质真若渝
   备份 _settings_apiserver_backup.json
```

## 五 · 自定义 SP 热替换 (v18.5)

```text
HTTP 控制面 (源.js):
  GET    /origin/custom_sp     查
  POST   /origin/custom_sp     注 (含 keep_blocks=true)
  DELETE /origin/custom_sp     除 · 归道

存:
  ~/.wam-hot/origin/_custom_sp.json (重启不失)

invertSP 分叉:
  有自定义 → [CUSTOM-SP-ACTIVE] + 自定义 + TAO_TRAILER + 留骨
  无       → 道德经 81 章

命令 (Cascade / Agent):
  dao.sp.set / dao.sp.get / dao.sp.reset

脚本 (Cascade 自我热替换):
  node _hotswap_custom_sp.js
```

## 六 · 测试 · 141+ 断言 (不含水德自检)

```text
test/v17_76.spec.js       35  主辅分槽 · SSE · observeSPFromBody
test/v17_75_live.spec.js  20  活端点
test/v1766.spec.js        12+ summary-agent SP 识别
test/watcher.spec.js      22  五层事件驱动
test/v17_78.spec.js       64  v18.5 + trajectory + HTTP
test/origin-synth-chat.js     CHAT_PROTO + lastinject 内容证据
test/origin-verify-remote.ps1 远端 SSH 一键验
─────────────────────────────────────
TOTAL ≥141 断言 · 0 fail
```

## 七 · 五大铁律 (守而不争)

```text
1. 纯 JS 无依赖     dependencies: {} · 用 require('node:...')
2. vendor/wam/ 不改  symlink → 010 · 改 010 不改 020
3. bundled-origin 不改 源.js / 锚.py / _dao_81.txt 原片不动 · ensureHot 自解压
4. 不入库 Key       仅 VS Code 配置 / 环境变量
5. engines ^1.85.0  覆盖 VS Code / Cursor / Windsurf / VS Codium
```

## 八 · 三级软适配常量 (其数一也)

```text
DAO_PORT              env DAO_PORT > vscode dao.origin.port > 8889
DAO_HOT_DIRNAME       env DAO_HOT_DIRNAME > ".wam-hot"
DAO_VENDOR_SUBPATH    env DAO_VENDOR_SUBPATH > "wam/bundled-origin"

PKG_VERSION           require('./package.json').version (运行时唯一本源)
```

## 九 · 二态归一 · 模式切换

```text
┌─ 道模式 invert (默认) ────────────────────────┐
│  源.js: 剥 27 侧信道 · SP → 道德经 81 章       │
│  锚定 : 6 层全锚 apiServerUrl → 127.0.0.1     │
├─ 官方模式 passthrough ────────────────────────┤
│  源.js: 零改写 · 纯透传                        │
│  锚定 : 保持本地 · 但不改 SP                   │
└────────────────────────────────────────────────┘

无 off (二态归一 · v17.76 起 · wam.originOff 静默归 invert)
按钮: 侧栏 wam-container → 道Agent · 本源 webview 顶 bar [道][官]
命令: Cmd Palette → "道Agent: 切换模式" 轮转
```

## 十 · 不入不破 (利而不害 · 为而不争)

```text
守而不动:
  · Windsurf 原生 cascadeViewContainer    一字未动
  · WAM 本源 010 extension.js              symlink 直接复用 · 不改一行
  · vendor/wam/bundled-origin 原片         不改 (~/.wam-hot/ 自解压副本运行)
  · workbench.desktop.main.js              不动
  · Go LS binary                           不动

不争:
  · 自建 wam-container 侧栏 · 不侵 Cascade 面板
  · 未扩入侵 UI · 未注额外命令至 Cascade
  · 未添外部 npm 依赖 · 零污染
  · 默认即用 · 零负担
```

## 十一 · 跳转

- 永存总报: `@/e:/道/道生一/一生二/Windsurf万法归宗/070-插件_Plugins/020-道VSIX_DaoAgi/_DAO_FA_ZI_RAN.md`
- 进度活档: `@/e:/道/道生一/一生二/Windsurf万法归宗/070-插件_Plugins/020-道VSIX_DaoAgi/progress.txt`
- 完整文档: `@/e:/道/道生一/一生二/Windsurf万法归宗/070-插件_Plugins/020-道VSIX_DaoAgi/dao-agi/README.md`
- 开发者档: `@/e:/道/道生一/一生二/Windsurf万法归宗/070-插件_Plugins/020-道VSIX_DaoAgi/dao-agi/_AGENTS.md`
- 本源解剖: `@/e:/道/道生一/一生二/Windsurf万法归宗/000-本源_Origin/解剖_SRC/INDEX.md`
- WAM 链管: `@/e:/道/道生一/一生二/Windsurf万法归宗/070-插件_Plugins/010-WAM本源_Origin/_dao_link.ps1`

---

```text
道冲, 而用之或不盈 · 渊兮, 似万物之宗
挫其锐, 解其纷, 和其光, 同其尘
湛兮, 似或存 · 吾不知谁之子, 象帝之先
```

**dao-agi · INDEX · 一眼观全貌**
