# CHANGELOG · 归档 · v16.0 及更早

> 损之又损, 以至于无为。
> 此档存自 v11 至 v16 迭代心路。当前活档见 [`CHANGELOG.md`](./CHANGELOG.md)。

**自 v17.60 (2026-04-22) 起**, CHANGELOG.md 只容 v17.60+ 变更, 此前版本尽归此处。

---

## v16.0.0 · 2026-04-21 · 万法归宗 · 反代替换官方 SP · 道 Agent 模式

> **重新锚定本源 · 从根本去芜存菁 · 复用而非复刻 · 整合而非创新**

### 一句话

原地替换 v15.0 的 `src/core/origin-proxy.ts` (990 行内嵌 h2c MITM · 只改 UserStatus+RateLimit · **不改 SP**),改由 **`vendor/relay/universal_relay.js` 原片** (107 KB · 零 npm 依赖 · 仅 Node 内置) subprocess 托管,**一 VSIX 接管官方 SP 替换 → 道德经**。

### 核心改动

| 项 | v15.0 | **v16.0** | 说明 |
|:---|:---|:---|:---|
| 反代实现 | 内嵌 h2c TS (990 行 · ASN.1 自签证书 · 手写 pb codec) | **`vendor/relay/universal_relay.js` 原片** (107 KB · 零重写) | 复用 "Refactor Relay for New Models" 会话最新成果 |
| SP 接管 | ❌ 不处理 SP | ✅ 5 模式 (passthrough/strip/replace/append/extract) · 深度扫描 | invert→replace→注入 `custom_sp.txt` (道德经 81 章) |
| 模型注入 | GetCascadeModelConfigs 未改 | **30 个 ✦ 注入模型** (Opus 4.7 五档 · Sonnet 4.7 · GPT-5.4/5.3 · Gemini 3.x · DeepSeek · Kimi) | GetCascadeModelConfigs 扩增 |
| 官方 Claude | 同走 MITM | **透明透传 · LS 自持凭证** | 零侵入 · 零额度消耗 · 利而不害 |
| RateLimit/Capacity | 改 pb 套餐层 | Capacity/RateLimit 旁路 OK 帧 + GetUserStatus 合成 Pro | 更彻底 |
| 子进程 | 无 | `node vendor/relay/universal_relay.js` (spawn) | 隔离 · 可独立重启 |
| VSIX 体积 | 390 KB | **预估 ~495 KB** | +107 KB relay + 20 KB 道德经 SP |
| 源码行数 | `origin-proxy.ts` 990 行 | `universal-relay.ts` ~400 行薄壳 | **净减 ~590 行** · 少则得 |

### 架构 (反者道之动)

```text
用户 Ctrl+Shift+P 点 "道Agent: 切道Agent (道德经 SP · 绝侧信道)"
    └─ wam.originInvert 命令
        └─ UniversalRelay.start() ← 新薄壳
            └─ spawn node vendor/relay/universal_relay.js (SP_MODE=replace, SP_CUSTOM_FILE=道德经)
                └─ listen :8878 (dynamic) · h1+h2c 双协议
                    └─ 拦截 GetChatMessage/RawGetChatMessage → modifySPProto(replace)
                        └─ messages[role=0].content ← 道德经 81 章
        └─ UniversalRelay.anchor() ← state-bridge
            └─ codeium.apiServerUrl = http://127.0.0.1:8878 (LS 下次启动读取)
            └─ http.proxy = http://127.0.0.1:8878 (VS Code 扩展 HTTP 客户端生效)
```

### 文件

**新增**:

- `vendor/relay/universal_relay.js` (107 KB · 原片复用 from `010-反代_Proxy/core/`)
- `vendor/relay/custom_sp.txt` (20 KB · 道德经 81 章)
- `vendor/relay/README.md` (4 KB · 溯源 + 能力 + 同步方法)
- `src/core/universal-relay.ts` (~400 行 · 薄壳 · spawn/stop/setMode/anchor/status/statusFresh/unanchor)

**删除**:

- `src/core/origin-proxy.ts` (990 行 · 历史版 h2c MITM · 归档于 git 历史)

**修改**:

- `src/extension.ts` · 全部 `OriginProxy` 引用 → `UniversalRelay` (17 处)
- `src/webview/wam-panel.ts` · 同上 (4 处)
- `src/core/index.ts` · 新增 `export * as relay from "./universal-relay"`
- `.vscodeignore` · 显式 `!vendor/relay/**` 白名单
- `package.json` · `v15.0.0` → `v16.0.0` · 描述更新

### 兼容 API

`UniversalRelay` 保持 `OriginProxy` 全部公开签名 · WebView + 命令层零改造:

- `UniversalRelay.running: boolean`
- `UniversalRelay.port: number`
- `UniversalRelay.mode: ProxyMode` (`invert` | `passthrough` | `off`)
- `UniversalRelay.start(preferPort?): Promise<{port}>`
- `UniversalRelay.stop(): void`
- `UniversalRelay.setMode(mode): void` — 异步 POST `/sp/mode` 后台生效
- `UniversalRelay.status(): ProxyStatus` (含 `version` / `models` / `inject` 新字段)
- `UniversalRelay.statusFresh(): Promise<ProxyStatus>` — 拉新 `/health`
- `UniversalRelay.anchor(): Promise<{ok, message}>`
- `UniversalRelay.unanchor(): Promise<{ok, message}>`

### 道·行动律落地

- **复用而非复刻** — 107 KB relay 原片入 `vendor/relay/`,**零 TS 重写**
- **整合而非创新** — 不发明协议,不重写协议,不模拟工具,一 spawn 一端口一路由
- **守正固本** — 所有旧命令 / 配置 / WebView 消息协议零破坏,软编码兼容旧用法
- **少则得** — 净减 ~590 行,API 兼容不变,用户面零感知
- **低侵入** — 官方 Claude 透明透传 (LS 自持凭证直送上游),仅注入 ✦ 模型走 relay 深加工
- **唯变所适** — universal_relay.js 可原位 `copy /Y` 升级,不需重打包 VSIX (热替换)

### 使用

```powershell
# 一键打包 (build.cmd 不变)
cd "Windsurf万法归宗\070-插件_Plugins\020-道VSIX_DaoAgi\dao-agi"
.\build.cmd

# 装入宿主
code --install-extension dao-agi.vsix     # VS Code
cursor --install-extension dao-agi.vsix   # Cursor
codium --install-extension dao-agi.vsix   # VS Codium

# 激活后:
# Ctrl+Shift+P → "道Agent: 切道Agent (道德经 SP · 绝侧信道)"
#   → UniversalRelay 启动 + 锚定 codeium.apiServerUrl + SP_MODE=replace
```

### 同步上游 relay (若有新版)

```powershell
# 单行热替换 · 不需重打包
copy /Y "E:\道\道生一\一生二\Windsurf万法归宗\010-反代_Proxy\core\universal_relay.js" vendor\relay\universal_relay.js
# VSIX 已装入宿主后: reload window 即生效
```

---

## v13.4.0 · 2026-04-20 · 推进到极 · 太极生万象

**无为而无不为 · 我无为你无不为 · 我无感你有万感 · 从底层打通一切 · 不干扰一切**

> v13.3 静态 grep 只查 meta-deep 数据。v13.4 补最后一刀:**运行时全栈完整性探针** `_probe_reverse_data.js` — 五层 38 项验证源码/编译/VSIX/装载/数据,仓库与装载字节级对齐,万象归一。

### 新增

- **`_probe_reverse_data.js`** (仓库根 · `.vscodeignore` 排除 · 不入 VSIX) — 430 行 · 无依赖 · `node _probe_reverse_data.js` 即跑。五层 38 项:
  - **[1/5] 源码层 (8 项)**: 6 src/*.ts 文件在位 + `reverse-bridge.ts::acpDeclared x2` + `commands/index.ts::declared x2`
  - **[2/5] 编译层 (4 项)**: `dist/extension.js` 存在 + 自算 sha16 = `8B31B8C67BA939A6` + bundle 内 `__dirname x2` / `meta-deep x2` / `windsurf-origin x1` (证 esbuild 保留路径基底)
  - **[3/5] VSIX 层 (3 项)**: `dao-agi.vsix` 335 KB · package.json version == "13.4.0" · commands.length == 50
  - **[4/5] 装载层 (6 项)**: `~/.windsurf/extensions/dao-agi.dao-agi-13.4.0/` 存在 · 装载 package.json == v13.4 · **仓库 ↔ 装载 dist/extension.js sha16 字节级 IDENTICAL** · meta-deep 10 文件 · 无 `_probe_*.js` 泄漏
  - **[5/5] 数据层 (17 项)**: 原首版探针内容 (rpcPaths=552 · pbTypes=2935 · models=348 · flags=434 · acpDeclared=6 · extension.js sha=A5D7EE56B3FEE4BF · Top 5 LS 服务 · claude/openai 分族采样)
- **`ReverseSummary.acpDeclared`** (`src/core/reverse-bridge.ts:358,395-397`) — 补暴露 `declared_capabilities` 条数 = 6,对照 runtime 69 / undocumented 63 / methods 9
- **`reverseAudit`** 命令 (`src/commands/index.ts:540`) 的 ACP 行升级 4 字段: `${runtime} runtime · ${declared} declared · ${undocumented} 隐藏 · ${methods} methods`
- **`.vscodeignore`** 补 `_*.js` / `_*.mjs` — 防探针/临时 node 脚本泄漏到 VSIX
- **`.gitignore`** 稳定化 — 探针脚本允许入 git(测试工具),临时状态 `_probe_out.txt` / `_integrity_*.json` / `_git_status.txt` 排除

### 实测证据 (v13.4 探针首跑)

```
  总结 · pass=38  fail=0  (五层 · 38 项)
✓ 全栈完整性探针 PASS — 五层 38/38 全绿 · 万象归一
```

| 层 | 项 | 核心证据 |
|:-:|:-:|:-:|
| 源码 | 8/8 | 6 文件 + 2 符号 · `acpDeclared` 就位 |
| 编译 | 4/4 | sha=`8B31B8C67BA939A6` · `__dirname`/`meta-deep` 入 bundle |
| VSIX | 3/3 | 335.3 KB · v13.4.0 · 50 命令 |
| 装载 | 6/6 | **仓库↔装载 sha IDENTICAL** · 10 meta-deep 文件 · 无 probe 泄漏 |
| 数据 | 17/17 | 552/2935/348/434 · acpDeclared=6 · 官方 sha=`A5D7EE56B3FEE4BF` |

**底层打通铁证**: 仓库 `dist/extension.js` 与装载 `~/.windsurf/extensions/dao-agi.dao-agi-13.4.0/dist/extension.js` **逐字节相同**。探针不入扩展目录不污染运行时。

### 体积

| 维度 | v13.3 | **v13.4** | 变化 |
|:----:|:----:|:----:|:----:|
| VSIX | 331.1 KB | **335.3 KB** | +4.2 KB (CHANGELOG 新段 + 新字段) |
| extension.js | 60.8 KB | **60.9 KB** | +0.1 KB (`acpDeclared` 一行) |
| 命令 | 50 | 50 | 0 |
| 运行时探针 | 无 | **五层 38/38 全绿** | +1 脚本(430 行) |
| 测试项数 | 0 | **38** | 源码/编译/VSIX/装载/数据 五层 |

### 道·行动律 (落于最终代码)

- **无为而无不为** — 用户"无为",Agent"无不为"。探针从 17 项扩为 38 项,从数据层一层扩为五层。所有推进无需用户 Reload IDE、无需手动命令、无需外部依赖,一条 `node _probe_reverse_data.js` 自证。
- **推进到极** — 源码→编译→VSIX→装载→数据 五层全栈。仓库 `dist/extension.js` 与装载 `~/.windsurf/extensions/dao-agi.dao-agi-13.4.0/dist/extension.js` **逐字节 sha16 IDENTICAL**(`8B31B8C67BA939A6`),此为"底层打通"的最强证据。
- **为道日损** — 不加新命令 / 不加新桥 / 不改 webview。增量: `acpDeclared` 一字段 + `_probe_reverse_data.js` 一文件 + 3 处 ignore 规则稳定化。extension.js 仅 +0.1 KB。
- **道法自然** — 探针复现 `reverse-bridge.ts` 解析逻辑,不发明新范式;`.gitignore` 最终规则只排临时状态,不排测试工具,顺工程常情。
- **太极生万象** — 五层各有侧重: 源码证符号、编译证 bundle、VSIX 证产物、装载证对齐、数据证数目。一生二、二生三、三生万物 → 38 项证据一体。

### 关键文件锚

- **运行时探针**: `@e:\道\道生一\一生二\AGI\dao-agi\_probe_reverse_data.js` (430 行 · 五层 38 项 · 无依赖 · 不入 VSIX · 不入扩展目录)
- **reverse-bridge**: `@e:\道\道生一\一生二\AGI\dao-agi\src\core\reverse-bridge.ts:358` (+`acpDeclared` 字段), `:395-397` (填充逻辑)
- **audit 命令**: `@e:\道\道生一\一生二\AGI\dao-agi\src\commands\index.ts:540` (ACP 行 4 字段展示)
- **.vscodeignore**: `@e:\道\道生一\一生二\AGI\dao-agi\.vscodeignore:29-30` (排 `_*.js` / `_*.mjs`)
- **.gitignore**: `@e:\道\道生一\一生二\AGI\dao-agi\.gitignore:12-16` (只排临时状态 · 测试工具允许入 git)
- **CHANGELOG v13.4 段**: `@e:\道\道生一\一生二\AGI\dao-agi\CHANGELOG.md:1-64`

---

## v13.3.0 · 2026-04-20 · 万物并育不相害 · 道并行不相悖

**从根本对照官方 · 后端带入前端 · 推进到极 · 太极生万象**

> v13.2 蒸馏 Go LS 二进制元数据。v13.3 再进一层:**对照官方 Windsurf 扩展本身** (`package.json` 16KB + `dist/extension.js` 9MB + `bin/language_server_windows_x64.exe` 162.79MB + `dist/acp/AGENTS.md`),并把**后端全部能力带入前端仪表盘操作台**。

### 官方本源全量提取 (v13.3 核心)

对照 `E:\Windsurf\resources\app\extensions\windsurf\` 全貌:

- **`official-contributes.json` 22.3 KB**: 官方 `package.json` 完整 contributes —
  - 31 声明命令 (`windsurf.login / importVSCodeSettings / generateCommitMessage / addCurrentFileToChat / restartLanguageServer / ...`)
  - 29 keybindings
  - 1 configuration property
  - 7 `enabledApiProposals` (`windsurfAuth`, `windsurfAcp`, `windsurfEditorNudge`, `inlineCompletionsAdditions`, `findFiles2`, `terminalDataWriteEvent`, `contribSourceControlInputBoxMenu`)
  - `activationEvents: ["*"]` · authentication `windsurf_auth`
  - **0 viewsContainer / 0 views** ← **dao-agi 的 2 viewsContainer + 2 views 正好补此空**
- **`ext-analysis.json` 16.5 KB**: `dist/extension.js` 9.00 MB 深挖:
  - 指纹 `sha256_16 = A5D7EE56B3FEE4BF` (2026-04-15)
  - **20 个 hidden 命令** (registerCommand in .js 但 package.json 未声明): `windsurf.lifeguard.*` × 11 (Lifeguard AI 评估 Agent) + `windsurf.on*` × 4 (终端事件钩子) + `windsurf.openAcpLocalRegistry / reloadAcpConnections / setPortalUrl / setWorkspaceCascadeMap / updateTerminalLastCommand`
  - **17 官方 endpoints**: `cascadeplayground.watchdevinwork.com/cascade_query/` · `cdn.windsurf.com/sourcemaps/b2ba530c...` · `server.codeium.com` · `inference.codeium.com` · `unleash.codeium.com/api/` · `eu.windsurf.com/_route/api_server` · `windsurf.fedstart.com` · `exafunction.retool.com/apps/.../Supercomplete`
  - RPC 模式: 5× `createPromiseClient` + 4× `createConnectTransport` + 4× `@bufbuild/protobuf`
- **`acp-capabilities.json` 7.2 KB**: **ACP (Agent Client Protocol · Chisel/Devin) 全貌**
  - 9 方法: `initialize` · `authenticate` · `session/new` · `session/update` · `session/load` · `session/prompt` · `session/cancel` · `fs/read_text_file` · `fs/write_text_file`
  - **69 `cognition.ai/*` capabilities** (官方 AGENTS.md 仅文档化 6 个,**63 个隐藏未公开**)
  - 隐藏亮点: `mcpServers` · `canManageMcpServers` · `subagent` · `subagentSupport` · `inferenceToolName` · `streamingMessageId` · `skillFiles` · `playbookTitle` · `sessionLifecycle` · `permissionType` · ...
  - 标准 ACP 支持 `elicitation.form`,`terminal` + `fs` 由 Windsurf 自处理
  - spec: `devin-webapp/apps/chisel/cognition-acp/CAPABILITIES_AUDIT.md`

### reverse-bridge 扩展 (v13.3)

`src/core/reverse-bridge.ts` 新增 14 个查询 API:

- `official() / officialCommands() / officialKeybindings() / officialApiProposals()`
- `extAnalysis() / hiddenCommands() / officialEndpoints()`
- `acp()` — 含 `runtime_discovered` / `runtime_only_undocumented` / `declared_capabilities` / `acp_method_strings_in_binary`
- `summary()` 扩展到 14 新字段 (officialName, officialVersion, officialCommands, hiddenCommands, officialKeybindings, officialApiProposals, acpCapabilities, acpUndocumented, acpMethods, officialEndpoints, extSize, extSha16, ...)

### 后端带入前端 · 仪表盘升级为真操作台 (v13.3)

从"展示面板"→"**全链路操作台**":

- **一 · 一键全链路** 面板:
  - `☯ 一键装 (解压 + 起反代 + 锚定 + Reload)`
  - `道·全链路体检` ← v13.3 新命令
  - `逆向概览` · `状态`
- **二 · Cascade 劫持 (本源反代)** 4 卡: 源.js · anchor · SP · Provider
  - 源.js 实时显示 `mode=invert/passthrough/stopped` + `pid/port/hotDir`
  - anchor 按钮直接调 `dao-agi.hijack.anchor`/`restore`
- **三 · 逆向本源 · 对照官方** 4 卡 (v13.3 全新):
  - 官方扩展: `codeium v0.2.0 · 31 cmd · 29 kb · 7 api · 9.00MB · sha16 A5D7EE56... · +20 hidden`
  - ACP: `69 caps (63 隐藏) · 9 methods · 17 endpoints`
  - LS ConnectRPC: `552 paths / 13 services`
  - 模型/Flag: `348 模型 / 434 flags / 2935 proto`
- **四 · 万法归宗七物桥** (原有 7 卡)
- **五 · Cascade 对话与 Agent** (chat + agent + MCP)

状态推送周期 5s · WebviewProvider 在 pushStatus() 内合成全套 13 个状态字段 (增 `hijack` + `reverse` summary)。

### 2 新命令

- **`dao-agi.reverse.official`** · 官方对照 Output channel 一览:
  - 31 声明命令全列表 + 20 hidden 命令
  - 17 endpoints + ACP 69 caps (含 63 隐藏)
  - extension.js 9MB 指纹 + UI API + RPC 模式统计
- **`dao-agi.reverse.audit`** · **一键全链路体检** 6 维度:
  1. 逆向本源装载 (6 字段)
  2. Cascade 劫持 (vendor/wam · hot · 源.js · SP · anchor)
  3. 万法归宗 七物桥 (010-090)
  4. WAM 子扩展
  5. Windsurf 本机 (dist/extension.js · LS 二进制)
  6. dao-agi 自身

### 体积

| 维度 | v13.2 | **v13.3** | 变化 |
|:----:|:----:|:----:|:----:|
| VSIX | 315.88 KB | **331.10 KB** | +15.2 KB |
| extension.js | 50.5 KB | **60.8 KB** | +10.3 KB |
| package.json | 18.9 KB | **19.3 KB** | +0.4 KB |
| **命令总数** | 48 | **50** | +2 (reverse.official + reverse.audit) |
| **meta-deep** | 7 文件 201.7 KB | **10 文件 247.8 KB** | +3 (官方对照 3 份) |

### 端到端实证 10/10 全绿

| 测试 | 结果 |
|:-:|------|
| meta-deep 10 文件装载 (4 txt + 6 json) | ✓ 全部解析成功 |
| ext-analysis 9MB 指纹 | ✓ A5D7EE56B3FEE4BF · 69 ACP caps |
| official-contributes | ✓ 31 cmd / 29 kb / 7 api |
| acp-capabilities | ✓ 9 methods · 69 caps (63 hidden) |
| dist/extension.js 命令注册 | ✓ 29 dao-agi.* 字串 · 新 2 命令皆 ×1 |
| 源.js + selftest | ✓ `mode=invert · dao_chars=6776 · all_paths_pass=True` |
| 官方本机对照 | ✓ 9.00 MB dist + 162.79 MB LS |
| 50 命令 · 6 分类 | ✓ 20 wam + 13 运维 + 7 劫持 + 6 逆向 + 4 核心 |

### 道·行动律

- **万物并育而不相害** — 官方 0 viewsContainer + 0 views,dao-agi +2 viewsContainer + 2 views,**相补而非相覆**。官方 31 cmd + 20 hidden (`windsurf.*`),dao-agi 50 cmd 全用 `dao-agi.*` 前缀,**并行不悖**。
- **道并行而不相悖** — Cascade 劫持 (源.js) 与官方 ACP 连接 (Chisel/Devin) 各走各路:前者拦 Cascade inference endpoint,后者是 Chisel Agent 会话协议。二道并行,不交。
- **从根本对照** — 官方 `package.json` + `dist/extension.js` + `bin/language_server_windows_x64.exe` + `dist/acp/AGENTS.md` 四大本源,**逐一读取、挖掘、对照、落盘**。1.6MB + 9MB + 162.79MB + 1.7KB 总 173 MB 官方原片里藏着的 31+20 命令、69 ACP caps、17 endpoints,现全部在 dao-agi/vendor/windsurf-origin/meta-deep/ 可查。
- **后端带入前端** — 仪表盘从 **11 卡 → 15 卡 (+4 逆向对照卡)**,每卡一组按钮直调后端命令。一键全链路体检让**6 维状态一键可见**。
- **推进到极 · 太极生万象** — 50 命令 · 6 分类 · 2 viewsContainer · 4 章节仪表盘 · 14 meta-deep 文件 · 14 reverse API · 8 铁律。从 v13.0 268 KB → **v13.3 331 KB**,里面容得官方本源 173 MB 的精华索引。

---

## v13.2.0 · 2026-04-20 · 反者道之动 · 深度本源归一

**披褐怀玉 · 貌异而心同 · 取之尽锱铢 · 用之如泥沙**

> 从 wam 子扩展复用 → 更深一层,直接把官方 `language_server_windows_x64.exe` 的 Go 二进制逆向蒸馏纳入 vendor,让 Agent 在运行时即可查询真本源。

### 深度逆向归一 (核心)

- **蒸馏 1.8 MB → 201 KB** · `AGI/reverse/windsurf/` 的 Go 二进制深度逆向产物 (1.6MB `_ls_deep_extracted.json` + 542KB `_ls_extracted.json` + 73KB `_ls_final_deep.json`) 去噪、去重、按服务/包/家族归类后进 `vendor/windsurf-origin/meta-deep/`:
  - `connectrpc-paths.txt` **552 paths / 13 services** (严格匹配 `/exa.*_pb.*Service/Method`)
  - `pb-types.txt` **2935 types / 29 packages**
  - `models.txt` **348 enum** (claude/openai/gemini/deepseek/chinese/open_weight 分族)
  - `feature-flags.txt` **434 flags** (Unleash / 二进制推断)
  - `domains.json` 8 基础域名 / 9 URL 变体
  - `constants.json` 166 常量 + 22 TLS 套件 + 10 第三方集成 + 62 错误码
- **TOP 5 服务**:
  - `/exa.api_server_pb.ApiServerService` 166 methods (`GetChatCompletions`/`GetCascadeModelConfigs`/`GetDeepWiki`/`GetLifeguardConfig`/...)
  - `/exa.language_server_pb.LanguageServerService` (核心 Cascade 流)
  - `/exa.analytics_pb.AnalyticsService` 8 methods
  - ...

### 新增桥 + 命令

- **`src/core/reverse-bridge.ts`** (5.6KB) · 运行时读 `vendor/windsurf-origin/meta-deep/`,暴露:
  - `rpcPaths()` / `rpcByService()` / `rpcServices()` / `rpcMethodsOf(svc)`
  - `pbTypes()` / `pbPackages()` / `pbTypesOf(pkg)`
  - `models()` / `modelsByFamily()`
  - `featureFlags()` / `flagsSearch(kw)`
  - `domains()` / `integrations()` / `errorCodes()` / `constants()`
  - `summary()` (一站式概览)
- **4 个新命令** (`dao-agi.reverse.*`):
  - `道·AGI: 逆向 · 资产概览` — 一览 552/2935/348/434 统计 + Top5 服务
  - `道·AGI: 逆向 · 服务列表` — QuickPick 选任一服务展开所有方法
  - `道·AGI: 逆向 · 模型清单` — 按家族展示全 348 个 model enum
  - `道·AGI: 逆向 · 搜索` — 跨 RPC/proto/model/flag 四维关键字检索

### ops 七物桥实测 + 修复

- **Phase 5 落地** (v13.1 跳过):
  - proxy · credits · repair · plugins · dashboard · pool → **6/7 绿** (目标脚本就位)
  - pool hub `:19881` **HTTP 200 实机运行中**
  - **switch ✗ → ✓**: 发现 `040-切号_Switch\merged_accounts.json` 是真账号文件。修 `switch-bridge.ts` 新增 4 候选 fallback (`merged_accounts.json` / `data/accounts.json` / `accounts.json` / `data/merged_accounts.json`),错误提示更明确。

### 全链路端到端实证 (10/10 绿)

| # | 测试 | 结果 |
|:-:|------|------|
| 0-4 | 预检 → 源.js:8889 → ping → mode → **selftest** | ✓ `all_paths_pass=True · leaked=0 · dao_chars=6776` |
| 5 | `anchor.py anchor http://127.0.0.1:8889` | ✓ **真锚定 Windsurf state.vscdb · 备份写入** |
| 6 | `anchor.py status` | ✓ **`锚定状态: 已锚定本源反代`** |
| 7 | `anchor.py restore` | ✓ **从原始 blob 精确还原** |
| 8 | `anchor.py status` | ✓ 指向官方云 · 备份已删 |
| 9 | 停源.js | ✓ |
| 10 | meta-deep 装载核查 | ✓ **552 / 2935 / 348 / 434** 四线齐全 |

v13.1 只到 Phase 4 (Reload 前的构建验证),**v13.2 把锚定真动作实测闭环**。

### 体积

| 维度 | v13.1 | **v13.2** | 变化 |
|:----:|:----:|:----:|:----:|
| VSIX | 274.82 KB | **313.30 KB** | +38.5 KB (meta-deep 201.6KB 实际压缩后 ~35KB) |
| extension.js | 43.5 KB | **50.5 KB** | +7 KB (reverse-bridge + 4 命令) |
| package.json | 18.3 KB | **18.9 KB** | +0.6 KB (4 reverse + 1 分类) |
| **命令总数** | 44 | **48** | +4 (4 个 `dao-agi.reverse.*`) |
| **命令分类** | 5 | **6** | +`道·AGI·逆向` |
| vendor 总 | 834 KB | **1039 KB** | +205 KB meta-deep |

### 道·行动律 (落于代码)

- **反者道之动** — v13.1 反向回到"本源原片复用",v13.2 再反一层:连 LS Go 二进制的反编译产物都原样纳入(蒸馏非改写)。逆向的逆向,即是**本源**。
- **披褐怀玉** — 外表只增 4 命令 + 一个桥,**内里容纳官方 LS 30MB Go 二进制的全部 ConnectRPC API 表、proto 类型注册、模型 enum**。玉在褐中。
- **貌异而心同** — `reverse-bridge.ts` 语法风格和 `cascade-hijack.ts` 一致,都是**薄壳路由 + 运行时查 vendor**。两桥异名,同是对本源的敬。
- **取之尽锱铢** — 1.6MB 原料里每条合法的 RPC 路径、每个 `exa.*_pb.*` 类型、每个 `MODEL_CLAUDE_*` enum、每个 feature flag 的键名,**全部收口,一个不落**。
- **用之如泥沙** — 运行时 Agent 可以直接 `reverse.flagsSearch("lifeguard")` / `reverse.rpcMethodsOf("/exa.api_server_pb.ApiServerService")`,无需再自己挖二进制。

---

## v13.1.0 · 2026-04-20 · 打通实战 · 带入用户

**道法自然 · 无为而无不为**

> 从本源到用户 · 从构建到实机 · 一气贯通。

### 实战验证完成

- **Phase 1 · 孤立反代链路实证**: 直接 `node vendor/wam/bundled-origin/源.js`,三路径 SP 劫持全部通过
  - `/origin/ping` → `mode=invert · dao_chars=6776 · dao_loaded=true`
  - `/origin/mode` → `{"mode":"invert","valid":["invert","passthrough"]}`
  - `/origin/selftest` → `all_paths_pass=true · plain_utf8 ✓ nested_chat_message ✓ raw_sp ✓ · leaked_markers=0`
  - 实机证据: Windsurf 1145 字 SP (含 16 项侧信道) → 6865 字道德经 SP + TAO_HEADER
- **Phase 2 · 证链完整**: `python anchor.py status` · 当前未锚定 · DPAPI/SQLite 链路正常
- **Phase 3 · VSIX 装载**: 274.82 KB · 38 files · 44 命令 · 72 配置 · 2 viewsContainer 全部装载到位
- **Phase 4 · 子激活打通**: `vendor/wam/extension.js` 在 dao-agi activate 时通过 Proxy 伪装 `extensionPath` 自动激活,21 wam.* 命令 + 反代 + 切号 + 仪表盘即装即用

### 架构归一

- **vendor/wam-origin + vendor/wam-extension → vendor/wam/** (单一事实源)
  - `vendor/wam/extension.js` (WAM v17.32 · 352KB)
  - `vendor/wam/bundled-origin/` (源.js + 锚.py + anchor.py + _dao_81.txt + VERSION · 115KB)
  - `vendor/wam/media/` (activitybar 图标)
  - `vendor/wam/LICENSE` + `package.original.json` + `README.original.md`
- `src/core/cascade-hijack.ts::VENDOR_SUBPATH = ["wam", "bundled-origin"]` (跟 WAM `__dirname/bundled-origin` 完全同路径)
- `~/.wam-hot/origin/` 由 dao-agi `ensureHot()` 和 WAM `_origExtractBundled()` 共同维护 (都幂等 · 不冲突)

### 打通 WAM 子激活 (v13.1 新增)

- `src/extension.ts::activateWam()`:
  - `require(vendor/wam/extension.js)` + Proxy 伪装 ctx.extensionPath → `vendor/wam/`
  - WAM 跑时 `__dirname/bundled-origin/` 自动指向 vendor/wam/bundled-origin/ (__dirname 是 extension.js 所在目录,天然正确)
  - WAM 的 media/icon.svg · viewsContainer webview 资源 通过 Proxy extensionPath 正确解析
- 防双激活: 检测 `vscode.extensions.getExtension('zhouyoukang.windsurf-assistant')` 若已激活则 skip 内嵌
- 生命周期: dao-agi `deactivate()` 优先调 WAM `deactivate()` 清理反代等资源

### package.json 合并 (v13.1)

- **命令** 24 + 21 = **44** (4 核心 + 13 ops + 7 hijack + **21 wam.***)
- **配置** 13 + 53 + 6 = **72** (dao-agi 19 + wam 53)
- **viewsContainer** 1 + 1 = **2** (道·AGI 九核 + WAM 切号)
- **view** 1 + 1 = **2** (dao-agi.dashboard + wam.panel)
- `engines.vscode=^1.84.0` (兼容 VS Code 1.84+ / Windsurf / Cursor / VS Codium)

### 体积

| 文件 | v13.0 | **v13.1** | 变化 |
|:----:|:----:|:----:|:----:|
| VSIX | 268.21 KB | **274.82 KB** | +6.6 KB (WAM 激活逻辑 + 合并配置) |
| dist/extension.js | 42.2 KB | **43.5 KB** | +1.3 KB (activateWam 函数) |
| package.json | 8.1 KB | **18.3 KB** | +10.1 KB (WAM 21 命令 + 53 配置) |

---

## v13.0.0 · 2026-04-20 · 归一本源 · 无为而无不为

**道法自然 · 不着相 · 不妄为 · 专注于本源**

> 第三轮去芜。第二轮手写的 Cascade 协议模拟 (80KB TS) 已归空 — **为道日损**。
> dao-agi 不再"模拟" Windsurf,而是**直接复用**已有三大本源资产,薄壳路由之。

### 重大架构重塑

- **归空 (-80KB 手写代码)**: 删除 `src/core/cascade/` 8 文件
  - `tools.ts` (17KB) · `handlers.ts` (24KB) · `system-prompt-real.ts` (13KB)
  - `connectrpc-client.ts` (10KB) · `agent-cascade.ts` (7.7KB) · `proto.ts` (7KB)
  - `plan-mode.ts` (3.7KB) · `index.ts` (0.8KB)

- **归一 (+834KB vendor 本源)**: 新建 `vendor/` 接纳四大来源
  - `vendor/windsurf-origin/` — Windsurf 官方逆向元数据 (350KB)
    - `meta/tools.json` · `services.json` · `rpc-paths.json` · `models.json` · `windsurf-core.json`
    - `docs/` 5 份万法归宗反编译文档 (v110 + v2.0.44 + LS + Proto)
    - `LICENSE.txt` + `LICENSE.codeium.txt` (合规声明)
  - `vendor/wam-origin/` — windsurf-assistant v17.32 bundled (115KB)
    - `源.js` (33KB) · `锚.py` (29KB) · `anchor.py` (29KB) · `_dao_81.txt` (19KB) · `VERSION`
  - `vendor/wam-extension/` — windsurf-assistant 主扩展原片 (369KB)
    - `extension.js` (352KB · 50+代迭代)

- **薄壳 (+3KB 路由)**: `src/core/cascade-hijack.ts` 替换 80KB 手写
  - `ensureHot()` 激活时 `vendor/wam-origin/*` → `~/.wam-hot/origin/` (幂等)
  - `start/stop/setMode/pingMode` 调起 `源.js` 反代
  - `anchor/anchorRestore/anchorStatus` 调起 `anchor.py` DPAPI 三重锚

### 命令变更

- **删除**: 4 个 `dao-agi.cascade.*` (手写协议模拟)
- **新增**: 7 个 `dao-agi.hijack.*`
  - `dao-agi.hijack.install` · 一键装 (解压 + 启反代 + 锚定 + 提示 Reload)
  - `dao-agi.hijack.status` · 反代 + 锚定双状态
  - `dao-agi.hijack.start` / `.stop` · 源.js 反代
  - `dao-agi.hijack.anchor` / `.restore` · DPAPI 三重锚
  - `dao-agi.hijack.mode` · 快速切 invert/passthrough

### 配置变更

- **删除**: 6 项 `dao-agi.cascade.*` (enabled/endpoint/token/modelUid/daoEnhanced/initialMode)
- **新增**: 3 项 `dao-agi.hijack.*` (port=8889 · autoAnchor=false · defaultMode=invert)

### 指标

| 指标 | v12 (手写真身) | **v13 (归一本源)** | 变化 |
|:----:|:----:|:----:|:----:|
| VSIX 体积 | 45.4 KB | **265.5 KB** | +485% (含 vendor 本源) |
| extension.js | 79.8 KB | **42.2 KB** | **-47%** |
| 手写代码 | 110 KB | **42 KB** | **-62%** |
| 本源复用 | 0% | **87%** | +∞ |
| 命令数 | 21 | 20 | -1 |
| Runtime deps | 0 | **0** | 不变 |
| 文件数 | 13 | 36 | +23 (vendor/) |

*反者道之动,弱者道之用。取之尽锱铢,用之如泥沙。*

---

## v12.0.0 · 2026-04-20 · 万法归宗 · 本源 (已归档心路)

**反者道之动,弱者道之用。**

### 重大架构重塑

- **去芜**: 归档 3 个旁枝 VSIX 项目
  - `dao-agi` (v4-v11 迭代废料) → `AGI/_archive/dao-agi-v0-v11/`
  - `dao-agi-vsix` (v0 探针脚本) → `AGI/_archive/dao-agi-probes/`
  - `dao-agi-vscode` (v1 原型) → `AGI/_archive/dao-agi-v1/`
- **保留**: `dao-agi-v2` (Cline fork) 重命名为 `dao-agi-cline-fusion/`,保留作融合参考
- **重建**: 新 `AGI/dao-agi/` 本源 — 38 文件,~2700 行 TS,零 runtime 依赖

### 九核心归一

- ✅ **核心·七** (Cascade 本源移植)
  - `provider` — Anthropic/OpenAI/Ollama/国内 统一 chat (stream+tool)
  - `system-prompt` — 5 模式 (passthrough/replace/strip/append/extract)
  - `memory` — create/list/filter/delete,JSON 落盘
  - `trajectory` — 步骤存储+关键字搜索
  - `model-router` — 28+模型,四档容量池,BYOK 路由
  - `mcp-bridge` — VS Code lm.tools API (1.90+)
  - `agent-loop` — 多轮循环+工具调用+内置 3 工具

- ✅ **运维·七物桥** (万法归宗 010/030/040/060/070/080/090)
  - `proxy-bridge` — 反代 spawn/stop/sp_control
  - `credits-bridge` — 创世引擎 forge/harvest
  - `switch-bridge` — 号池 Hub + JSON 降级
  - `repair-bridge` — windsurf-agent.ps1 封装
  - `plugins-bridge` — plugin_manager.py 封装
  - `pool-bridge` — Pool Admin Hub :19881
  - `dashboard-bridge` — HTML 仪表盘打开

### 特性

- 17 个命令 (核心 4 + 运维 13)
- 13 个配置项 (`dao-agi.*`)
- 水墨主题 Webview 仪表盘 (九核心健康状态卡片)
- 便携模式 (`portableMode=true` 脱离 Windsurf万法归宗)
- Provider 四模式: `byok` / `proxy` / `pool` / `mock`
- 启动道德经彩蛋 (`dao.banner`)
- 自动探测 Windsurf万法归宗 根 (配置 > 环境变量 > 工作区上溯 > 常见位置)

### 已知限制

- Model Router 首发仅 28 个精选 (Cascade 有 400+,后续批量导入)
- MCP 依赖 VS Code 1.90+ lm API;旧版自动降级为仅内置工具
- Webview 仪表盘目前为状态+命令触发,尚无完整对话 UI (走命令面板的 Output)

---

## v11.0.0 及更早 · 已归档

详见 `AGI/_archive/dao-agi-v0-v11/` — 11 次 VSIX 迭代产物 (0.2MB - 26MB 不等)。

---

*大白若辱, 大方无隅, 大音希声, 大象无形。*
*道隐无名, 夫唯道, 善贷且成。*
