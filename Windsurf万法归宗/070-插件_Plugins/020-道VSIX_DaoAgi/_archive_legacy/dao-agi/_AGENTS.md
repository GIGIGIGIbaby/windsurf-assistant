# dao-agi · AGENTS.md

> 为 AI 编程伙伴而写 · 读这里 · 再读 `README.md` · 再读 `INDEX.md` · 再动代码
>
> 版本本源: `package.json.version` · 此档不重复版本号 · 内固其本

---

## 一句话

`dao-agi` = Windsurf 扩展 · **WAM 本体复用 + 实时 SP 提取 + 道/官 模式热切换** 三核归一 · 纯 JS · 零外依

## 三核归一 · 用户明示之本源

> "当前核心功能模块只有三个，一个为 WAM 本体直接复用，一个为实时提示词提取，一个为道agent模式与官方agent模式可热切换。锚定此本源 完善一切。"

任何修改都应**仅强化此三核**，不应增加无关职责。`v17.77` 已剥离自动 storage/ls-gate/文件层操作，**为道日损**。

`v17.88` (阶一去芜存菁) **再损 -1100 行**:

- `essence.js` 删 `_buildReconstructedSP` (354 行 · 第 4 路 SP 兜底 · 实测 proxy 可达永不显)
- `isolator.js` 删 `exit` / `_restore*` / `_exit*` 系列 (459 行 · 0 调用)
- `storage-guard.js` / `sp-scaffold.js` / `_pre_launch_sanitize.js` 移出 VSIX (归 `_archive/scripts_v17_88/`)
- `dao-agi/assets/` 删 (与 `media/` 重复)
- VSIX 410.11 KB → 379.65 KB (-7.4%) · 26 件
- 三核未触 · 五道防线全留 · 老用户全兼容

`v18.0` (阶二大归本源) **再损 -482 行 · 一根之治 · 七缺尽消**:

> *为者败之, 执者失之. 圣人无为故无败, 无执故无失.* — 第六十四章

- **一根**: spawn detached + unref · 父亡子不死 (179 户实证根因)
- **治法**: `spawn → require + start({port,host})` · ext-host 共生死
- `源.js`: 改为可 `require` 模块 · 加 `start/stop/getMode/setMode` 库接口 · `_runCli` 拆离
- `extension.js` 阶二三: spawn → require · 删 `_proxyProc/lockfile/multi-account/orphan-kill` 全套 (~330 行死路)
- `extension.js` 阶二四: sentinel 三函数全 stub · `_buildSentinelOpts/_spawnUninstallSentinel/_doSoftCleanupSync/_killOrphanProxyByOwnerLock/_ensureSentinelInHot/_resolveSentinelSrc` (~360 行死码归芜)
- `extension.js` 阶二五: 停 require `_water_virtues` + `_uninstall_sentinel` · 永 null · 32 处 if 自然走 else (即"我是 leader")
- 测试套 10/10 PASS · `v17_87_2_l5.spec.js` 改验 v18.0 stub 标记

```text
旧 (v17.88-)                       新 (v18.0)
─────────────────────────────    ─────────────────────────────
spawn detached:true unref()  →   require + start({port,host})
父退子不死 (zombie 永生)      →   ext-host 死 = http.Server.close 自然归云
multi-account lockfile 验主   →   每 ext-host 自有 in-process proxy
sentinel 反 root (488行)      →   无 zombie 可斩 · sentinel 全 stub
water-virtues 选举 (645行)    →   无共争 · 每 ext-host 即 leader
```

## 架构骨架 (v18.0)

```text
extension.js (主壳 · 3091 行 / 99 KB · v18.0 减 482 行)
  ├─ PKG_VERSION = require('./package.json').version  ★ 版本唯一本源
  ├─ loadWamCore(ctx)              · WAM hook (skip 4 stub commands)
  ├─ ensureHot()                   · vendor → ~/.wam-hot/origin/ (jsdelivr 自更兼容 · 留)
  ├─ ★ hijackStart/Stop/Status     · v18.0 require + yuan.start({port,host})
  │                                 · _proxyHandle 替 _proxyProc · ext-host 共生死
  ├─ hijackSetMode(invert/passthrough)  · v18.0 进程内直调优先 · fallback HTTP
  ├─ anchor(url) / anchorRestore() · 六层锚定 (锚.py · 阶三待清)
  ├─ syncAgentMode(mode)           · WAM 共享 agent_mode.json
  ├─ DaoWatcher (五层事件驱动)
  ├─ EssenceProvider (本源 webview · SSE + LS + proxy 四源)
  ├─ _waterVirtues = null          · v18.0 停 require · 进程内化无须选举
  ├─ _uninstallSentinel = null     · v18.0 停 require · 无 zombie 可斩
  ├─ _autoLsGateGuard (v17.84 · 5s 异步 · 阶三待清)
  └─ 33 命令注册 (含 v18.5 dao.sp.* + v17.83 dao.water.*)

vendor/wam/bundled-origin/源.js (proxy 后端 · ~108KB · v18.0 库 + CLI 共体)
  ├─ ★ start({port,host}) → Promise<handle>  · 库接口 (新 · ext-host 调)
  │     handle = {server, port, host, close, getMode, setMode}
  ├─ ★ stop()                      · 库接口 (新)
  ├─ ★ if (require.main === module) _runCli()  · CLI 路径 (向后兼容)
  ├─ classifyRPC(reqPath)          · query 剥离后正则
  ├─ INFERENCE_SERVICES 白名单     · CHAT_PROTO/CHAT_RAW/INFER_STRIP
  ├─ observeSPFromBody             · 主辅分槽 _injects={main,aux}
  ├─ invertSP                      · 道德经 / [CUSTOM-SP-ACTIVE]+自定义 分叉
  ├─ deepStripSideChannels         · 27 侧信道 · 哨兵守护
  ├─ /origin/* 端点                · ping/sig/preview/selftest/lastinject/
  │                                 · custom_sp/stream/mode/rpc_trace
  ├─ _traceRPC 环 (RPC_TRACE_MAX=200) · /origin/rpc_trace
  └─ SSE /origin/stream            · hello/sp/mode/hb 事件
```

## 三层根因 (修内必知)

| 层 | 根 | 治 |
|---|---|---|
| L1 系统层 | `windsurf-dao/dist/extension.js` 之 `u()` 拦 codeium.* 配置 | `ls-gate-patcher.js` 打 `/*dao:v17.68*/` 标记 |
| L2 账户层 | 多用户 `state.vscdb` 之 `codeium.windsurf.apiServerUrl` 未锚副用户 | `锚.py anchor-all-globalstate` 全用户锚定 |
| L3 协议层 | `源.js classifyRPC` 正则未剥 query string · CHAT_PROTO 误归 PASSTHROUGH | `qIdx = reqPath.indexOf("?")` · `pathOnly` 后正则 |

## 自定义 SP 热替换 (v18.5)

```text
真本源直注 · 不破 KEEP_BLOCKS · [CUSTOM-SP-ACTIVE] 哨兵不被 deepStripSideChannels 剥

数据流:
  Cascade 命令 dao.sp.set
    → essence.setCustomSP(sp, opts)
    → POST http://127.0.0.1:8889/origin/custom_sp { sp, keep_blocks, source }
    → 源.js _saveCustomSP(result, blocks, src)
    → 落盘 ~/.wam-hot/origin/_custom_sp.json + 内存 _customSP

真流量到达:
  observeSPFromBody → invertSP
  if (_customSP) {
    [CUSTOM-SP-ACTIVE] + _customSP + TAO_TRAILER + extractKeepBlocks(原SP)
  } else {
    TAO_HEADER + 道德经 + TAO_TRAILER + extractKeepBlocks(原SP)
  }

回归:
  dao.sp.reset → DELETE → 删 _customSP → 归道德经
```

## 模式二态 (v17.76 起 · 无 off)

```text
invert (道 · 默认):
  源.js     SP → 道德经 / 自定义 + 留骨 + 27 侧信道剥
  五层锚   apiServerUrl → http://127.0.0.1:8889
  syncAgentMode("dao") · WAM 见 agent_mode.json

passthrough (官方):
  源.js     零改写 · 纯透传
  五层锚   仍指 127.0.0.1:8889 (透传至云)
  syncAgentMode("official")

互斥 · 收音机 · 无第三态 · wam.originOff 静默归 invert
SSE 广播 mode 事件 · UI 按钮即变色
```

## 测试套件 (141+ 断言 · 0 fail)

```text
test/v17_76.spec.js       35  主辅分槽 · SSE · observeSPFromBody · invertSP
test/v17_75_live.spec.js  20  活端点 · 需先起 proxy
test/v1766.spec.js        12+ summary-agent SP 识别 · plain_utf8
test/watcher.spec.js      22  五层事件驱动
test/v17_78.spec.js       64  v18.5 自定义SP + trajectory + HTTP 控制面
test/origin-synth-chat.js     CHAT_PROTO 合成 (无活 Windsurf 时验)
test/origin-verify-remote.ps1 远端 SSH 一键验
test/e2e.js               55  跨 6 层 (proxy / control / LS / file / mode / essence)
```

跑测:
```powershell
node test/v17_78.spec.js          # 64 断言
node test/v17_76.spec.js          # 35 断言
node test/origin-synth-chat.js    # 需先起 ~/.wam-hot/origin/源.js
```

## 五大铁律

1. **纯 JS 无依赖** — `dependencies: {}` · 仅 `require('node:...')`
2. **vendor/wam/ 不改** — symlink → 010 · 改 WAM 去 `010-WAM本源_Origin/_github_src/packages/wam/`
3. **bundled-origin 不改** — `源.js` / `锚.py` / `_dao_81.txt` 原片不动 · `ensureHot()` 自解压副本到 `~/.wam-hot/origin/` 运行
4. **不入库 Key** — API Key 只走 VS Code 配置 / 环境变量
5. **engines `^1.85.0`** — 覆盖 VS Code / Cursor / Windsurf / VS Codium

## 不入原生 Cascade (自成一极)

自建 `wam-container` 侧栏 · 挂 2 webview (`dao.essence` + `wam.panel`) · **不侵占** Windsurf 原生 `cascadeViewContainer`。

为而不争 — 自成一极即得其成。官方 Cascade 与道 Agent 各司其所 · 不相犯 · 是谓玄同。

## WAM 本源 (010 → 020 符号链接)

```text
010-WAM本源_Origin/.../packages/wam/extension.js  ← SYMLINK ─ vendor/wam/extension.js
010-WAM本源_Origin/.../packages/wam/package.json  ← SYMLINK ─ vendor/wam/package.json
```

改 010 WAM = 改 020 vendor WAM · 无需同步

首次设置:
```powershell
.\_setup_wam_link.ps1
```

校验:
```powershell
.\_setup_wam_link.ps1 -Verify
```

## 构建 / 部署

```powershell
# 一键 (从 020 根)
.\_build_vsix.ps1                   # 构建 + 校验
.\_build_vsix.ps1 -Deploy179        # 构建 + 远程部署
.\_build_vsix.ps1 -DeployLocal      # 构建 + 本机部署
.\_build_vsix.ps1 -DryRun           # 仅校验

# 远程笔记本 (179)
.\deploy-dao-agi-179.ps1 -Force -Restart
```

## 提交前自检

- [ ] `node --check extension.js` 语法通过
- [ ] `node --check essence.js` · `node --check isolator.js` · `node --check _water_virtues.js`
- [ ] `node --check vendor/wam/bundled-origin/源.js`
- [ ] 源.js ≡ source.js (字节等 · sha256 一致)
- [ ] `_setup_wam_link.ps1 -Verify` 链接完好
- [ ] `_build_vsix.ps1 -DryRun` 测试套件全绿 (≥141)
- [ ] VSIX 大小约 370 KB · 36 文件 · 无 .ts/.map/dist
- [ ] `package.json.version` 同步 (扩展运行时已自读 · 无需手动改 extension.js)

## 陷阱

- **VS Code 1.84** 是下限
- **Windows 路径** — 中文路径需 utf8 代码页
- **activationEvents** — `"*"` 保证立即可达 (所有工作区)
- **多用户 Windsurf** — 必须用 `锚.py anchor-all-globalstate` 锚全部用户
- **多窗口 Windsurf** — autoRestoreOrigin 仅主 workspace 参锚守 (避 SQLite 争锁) · v17.83 水德选举后 follower 让出
- **水之四德** — `.vscodeignore` 必含 `!_water_virtues.js` 白名单 (否则 VSIX 不含此模块)
- **CLI 安装 EPERM** — 后须手补 `extensions.json` (含 fsPath / path / metadata)

## 防回归 · session 断后复工

```powershell
# 一、验 proxy 自况
curl http://127.0.0.1:8889/origin/ping
# 期望: ok=true · self_size 与 vendor/wam/bundled-origin/源.js 大小一致

# 二、验 RPC 走代
curl http://127.0.0.1:8889/origin/rpc_trace
# 期望: kinds.CHAT_PROTO > 0 · kinds.PASSTHROUGH > 0 (mgmt/auth)

# 三、若 traced=0 · 流量未到 proxy:
#   · 验 LS gate patch (系统 bundle 含 /*dao:v17.68*/)
#   · 验 anchor (锚.py status 双层 secret + globalState)
#   · 验 LS 子进程参数 (--inference_api_server_url=http://127.0.0.1:8889)

# 四、若 traced>0 但 kinds 全 PASSTHROUGH:
#   · query string bug · 应 v17.79 已修
#   · 检源.js classifyRPC 是否含 pathOnly 变量
```

## 哲

```text
信言不美, 美言不信 · 善者不辩, 辩者不善
天之道, 利而不害 · 圣人之道, 为而不争
内固其本, 外彰其形 · 表里相依, 浑然一统
为学日益, 为道日损 · 损之又损, 以至于无为, 无为而无不为
```
