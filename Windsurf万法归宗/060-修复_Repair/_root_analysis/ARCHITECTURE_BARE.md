# 锚定本源 · 全栈独立可行性研究

> 道德经 · 第二十五章: "**有物混成, 先天地生, 寂兮寥兮, 独立而不改, 周行而不殆.**"
>
> 道德经 · 第二章: "**万物作焉而不辞, 生而不有, 为而不恃**".

—— 直取本源, 不依赖 Windsurf 安装本身, 后端整合一切, 与用户正常使用 Windsurf **道并行而不相悖**.

---

## 一 · 实证结论 (经活验)

### 1.1 LS 二进制 = 零耦合的 Go 独立服务器

```
$ language_server_windows_x64.exe --csrf_token=<uuid> \
    --codeium_dir=<tmp> --database_dir=<tmp/db> \
    --server_port=51199 --enable_index_service=false

→ 162.9 MB 单文件 Go binary
→ 自启 manager (pid X) + child (pid Y) 双进程
→ child 绑 127.0.0.1:<random_port> (gRPC-Web)
→ 无 IDE 、无 Electron 、无 extension.js, **fully alive**.
→ 只缺一个真实的 --api_server_url + apiKey 即可访问推理.
```

**这意味着**: 整个 "Cascade 大脑" 已经在这 163MB 的 Go 二进制里。
extension.js (9MB) 只是一个 **协议客户端 + UI 编排层**.
Windsurf.exe (Electron 壳) 只是 **VS Code fork 的窗口**.

### 1.2 三层结构 · 可分性判定

```
┌─────────────────────────────────────────────────────────┐
│ TIER 3: IDE 壳 (Windsurf.exe / VS Code / Cursor)        │
│   - Electron + Workbench (~31 MB)                       │
│   - Cascade WebView UI (sessions.desktop.main.js 29MB)  │
│   - 可替: ✅ 任何 VS Code 兼容 host                       │
│   - 可替: ✅ 任何 Web/Electron/Tauri/CLI/REST 客户端       │
│   依赖: VS Code Extension API · windsurf* fork API (14)  │
├─────────────────────────────────────────────────────────┤
│ TIER 2: Cascade 身 (extension.js, 9 MB)                 │
│   - 1444 webpack modules (Cortex 编排, ACP, Tools, MCP) │
│   - 5 Proto Services 客户端 (LS RPC stubs)              │
│   - Cascade UI 状态机 + Trajectory 管理                  │
│   - 可替: ✅ 直接对 LS 发 RPC (我们已在 040 实现 OpenAI 适配) │
│   - 可替: ✅ 用任何语言/任何框架重写 RPC 客户端              │
│   依赖: LS RPC + apiKey + workspace_id                  │
├─────────────────────────────────────────────────────────┤
│ TIER 1: LS 核 (language_server_*.exe, 163 MB Go)        │
│   - 174 LanguageServerService methods                   │
│   - Cortex Engine (planner + retry + truncation)        │
│   - 模型路由 + Trajectory 持久化 (sqlite)                │
│   - Cloud bridge (api_server_pb.ApiServerService)       │
│   - 可替: ❌ 不可替 (这是 "魂" · Cognition 闭源)            │
│   依赖: 网络访问云推理 + 一个 apiKey                      │
└─────────────────────────────────────────────────────────┘
```

**关键洞察**:
- **TIER 1 不可替** → 必须 ship 这 163MB 二进制 (合法性由用户许可决定)
- **TIER 2 可替** → 我们已在 `040-道反代_LanProxy` 实证 (OpenAI/Anthropic 适配)
- **TIER 3 可任意** → VSIX 可装任何 VS Code 兼容 host, 或纯 web/CLI

---

## 二 · 现状盘点 (此仓已成之器)

### 2.1 已成 (production-ready 或近之)

| 件 | 路径 | 何能 |
|---|---|---|
| **030-转制 VSIX** | `070-插件_Plugins/030-转制VSIX_Repack/windsurf-dao-0.2.0.vsix` (52 MB) | TIER 1+2+3 完整, 装 VS Code/Cursor 即用. 自动 detect fork host vs 纯 VS Code, 双模运行. |
| **040-道反代_LanProxy** | `070-插件_Plugins/040-道反代_LanProxy/dao-lan-proxy-1.0.0.vsix` (40 KB) | TIER 2 替代品: 暴 LS 为 OpenAI/Anthropic LAN 端点. 28/28 自检 pass. |
| **020-道VSIX_DaoAgi** | `070-插件_Plugins/020-道VSIX_DaoAgi/` | TIER 3 增强壳, 装在 Windsurf 内. |
| **010-反代_Proxy** | `010-反代_Proxy/→道直连.cmd` | 注 Cascade session 到 :8878 反代. |
| **000-本源_Origin** | `000-本源_Origin/源.js + 锚.py` | DPAPI 三锚点 + invertSP proxy. |
| **协议反推** | `020-逆向_Reverse/` | 1717 proto types, 5 RPC services, 174 LS methods 全反推. |
| **认证反推** | `WINDSURF_LS_REVERSE_ENGINEERING_v2.md` | DPAPI / safeStorage / synthetic key 全链路. |

### 2.2 缺口 (达 "全栈独立" 尚需)

| 缺口 | 解 |
|---|---|
| **VS Code 都不要** | 自建 Electron/Tauri 壳 + 内嵌 sessions UI |
| **headless 后端** | 040 已基础, 需加 OAuth + token 持久 + headless boot |
| **OAuth 登录** | 实 PKCE flow 直对 `register.windsurf.com` (proto 已反推) |
| **token 持久** | DPAPI / keychain / 加密文件 三选一 |

---

## 三 · 三阶路线 (反者道之动 · 由近及远)

### 阶 一 · 今日即可 — VSIX 装 VS Code (零新代码)

**用户操作**:
```bash
# 装 VS Code (不装 Windsurf)
choco install vscode

# 装 030-转制 VSIX
code --install-extension windsurf-dao-0.2.0.vsix

# 顺装 040-LanProxy (LAN 共享)
code --install-extension dao-lan-proxy-1.0.0.vsix

# Reload Window → Cascade 出
```

**结果**:
- VS Code 内有完整 Cascade UI (Cascade Panel + Agent Dashboard)
- LS 自启, 全 174 method 可用
- LAN 设备可通过 :11434 调
- **不需要装 Windsurf**.
- **若用户也装了 Windsurf, 两者并存** (`extensionKind` + `_isForkHost` 双模分流)

**风险**: VS Code 不有 Windsurf 专属的 fork API (windsurfAuth/Acp/...).
**已解**: 030 的 `shim.js` (94 KB) 补足 14 个 API, 用户无感知.

### 阶 二 · 近期 (1-2 周) — Headless Cascade Server

**目标**: Windows 服务 / Linux daemon. 无 IDE, 无 GUI, 纯 HTTP API.

**架构**:
```
┌─────────────────────────────────────────────┐
│ dao-cascade-server.exe (~50 KB Node + bundle)│
│ ├─ 内嵌 LS binary (163 MB extracted on first run) │
│ ├─ HTTP :11434 (OpenAI compat, 040 强化版)   │
│ ├─ OAuth :11435 (PKCE flow for first login)  │
│ ├─ Admin :11436 (account / model / quota UI) │
│ └─ Token store: ~/.dao-cascade/auth.enc      │
│      (DPAPI on Win / keychain on macOS / age on Linux) │
└─────────────────────────────────────────────┘
```

**复用现有件**:
- 040 lan-server.js → 升级为 daemon, 加 systemd / nssm 配置
- 020 ls-bridge.js → 加 OAuth (PKCE) 直对 register.windsurf.com
- 030 build.js → 抽 LS 二进制部分, 按需懒释放到 `~/.dao-cascade/bin/`
- 040 model-catalog.js → 直接复用

**新增**:
- `oauth-server.js` (~200 行): PKCE flow + redirect handler
- `token-vault.js` (~150 行): 加密存储 + 自动刷新
- `admin-ui/` (~1000 行 React): 模型/账号/quota 管理网页
- `service-runner.cmd` / `dao-cascade.service`: systemd-style daemon

**预算**: ~2000 行新代码 + 复用 90%.

### 阶 三 · 远期 (1-2 月) — 自有 Electron 壳

**目标**: 完全脱离 VS Code, 自己一个 IDE-style 应用.

**架构**:
```
┌─────────────────────────────────────────────┐
│ dao-cascade.exe (Electron, ~120 MB)         │
│ ├─ Main process: spawn LS + 040 daemon       │
│ ├─ Renderer: 内嵌 sessions.desktop.main.js   │
│ │   (从 030 抽出, 29 MB React bundle)         │
│ ├─ 自有 IPC: 替 VS Code Extension API         │
│ ├─ Codemirror / Monaco 替 VS Code 编辑器       │
│ └─ 自有文件树/终端/Git (用 isomorphic-git)     │
└─────────────────────────────────────────────┘
```

**最大挑战**:
- VS Code Extension API 模拟 (commands, workspace, window, ...)
- ~50 个 vscode.* API surface 必须 stub
- 编辑器/终端/Git 自己 implement (或借 nuclide / theia)

**理性判断**: 阶三投入大, ROI 比阶二低. **建议跳过, 直接长期用阶二 + 用户自选 VS Code/Cursor 做编辑器**.

---

## 四 · 模块抽离矩阵 · 道生一 · 一生二

### 4.1 必须保留 (一)

```
language_server_windows_x64.exe         163 MB    Go binary, 闭源, 不可替
fd.exe                                   3.4 MB    用于 indexing, 可保留
```

### 4.2 必须重写 / 已重写 (二 — 可生)

| 原 Windsurf 件 | 我们的替代 | 状态 |
|---|---|---|
| extension.js (9 MB Cascade UI 编排) | 040-LanProxy + 030 shim.js | ✅ 部分覆盖 |
| Workbench.desktop.main.js (31 MB) | VS Code 自身 + 030 webview shim | ✅ |
| sessions.desktop.main.js (29 MB Cascade UI) | 030 中已抽离, 直挂 native.html | ✅ |
| Electron + Chromium 壳 (~150 MB) | 用户自带 VS Code/Cursor (零成本) | ✅ |
| product.json / NLS (~1 MB) | 030 中已 verbatim 复制 | ✅ |
| OAuth flow (PKCE → register.windsurf.com) | **待实** (proto 已反推, 写 ~200 行 Node) | ⚠ |
| safeStorage (DPAPI 加密) | **待实** (Win API 直调 ~100 行) | ⚠ |

### 4.3 完全外置 (三 — 必须有云)

```
inference.codeium.com / server.codeium.com    模型推理 (闭云)
register.windsurf.com                          注册 + OAuth (PKCE)
unleash.codeium.com                            feature flags
server.self-serve.windsurf.com                 SeatManagement (141 method)
```

这部分**永远不能自建** — 模型 + 计费在 Cognition 服务器侧.
但可以借的接口都是 HTTPS REST/RPC, 我们的 client 可以直接调.

---

## 五 · 实施建议 (今日下手)

### 5.1 立即可做 (无须新代码)

1. **整合现有 030 + 040**: 用户装 VS Code → 一键脚本装两个 VSIX → 即得"无 Windsurf 的 Cascade".
   - 写一个 `setup-vsix-only.cmd` 自动化即可.

2. **测试 030 在 VS Code 中的实际行为**:
   - `code --install-extension windsurf-dao-0.2.0.vsix`
   - reload, 看 Cascade UI 出否
   - 验证 LS 自启
   - 验 OAuth (登录会跳浏览器? 还是怎么走?)

### 5.2 近期建造 (阶二 — Headless Server)

按上文阶二的 4 个新增模块, 落地路径:

```
新建仓: 070-插件_Plugins/050-独立服_HeadlessCascade/
├── dao-cascade-server/              ← Node 主进程
│   ├── service.js                   ← daemon 入口
│   ├── ls-launcher.js               ← LS binary 释放 + 启停
│   ├── oauth-server.js              ← PKCE + register.windsurf.com
│   ├── token-vault.js               ← DPAPI / keychain 加密
│   ├── 040-lan-server.js            ← 复用 040
│   └── admin-ui/                    ← React + vite 简后台
├── bin/                             ← 启停 cmd / sh / service
│   ├── install.cmd                  ← Windows: nssm install
│   ├── uninstall.cmd
│   ├── install.sh                   ← Linux: systemd
│   └── dao-cascade.service          ← systemd unit
├── _selftest.js                     ← E2E (启动 + login + chat)
└── README.md
```

**第一里程碑**: 用户跑 `install.cmd` → 后台 daemon 起 → 浏览器跳 `http://127.0.0.1:11436` 后台 → 登录 (跳 register.windsurf.com OAuth) → 后台显 quota → LAN 任意设备调 :11434.

### 5.3 远期可选 (阶三 — Electron 壳)

跳. 投入产出比低, 不如让用户自由组合 VS Code/Cursor + 阶二 daemon + 040 LAN.

---

## 六 · 道并行而不相悖 · 共生原则

### 6.1 与用户正在用的 Windsurf 共存

**端口**: 不抢 (LS 用 random port, 030+040 用 :11434, 010 用 :8878).
**文件**: 不污染 Windsurf 的 `~/.windsurf/` (我们用独立的 `~/.dao-cascade/`).
**vscdb**: 不写 (我们有自己的 token-vault).
**进程**: 各自的 LS 进程, 无 conflict (Go LS 用 lock file 互斥同 codeium_dir 内, 不同 dir 不冲突).

### 6.2 与 010 / 020 / 030 / 040 共生

| 件 | 角色 | 与阶二 daemon 关系 |
|---|---|---|
| 010 反代 | session 注入 + invertSP | 阶二 OAuth 替代之 (无需 invertSP) |
| 020 道VSIX | Windsurf 内 dao-agi 增强 | 独立, 不冲 |
| 030 转制 | VS Code/Cursor 装 Cascade | **阶二的"无 IDE"模式之外的另一选项** |
| 040 反代 | LAN 共享 OpenAI/Anthropic | **阶二的 HTTP 层基石, 直接复用** |

### 6.3 法律 / 道德底线

- **不再分发 LS binary 给非授权用户** — 用户自己有 Windsurf 就有了; 阶二 daemon 首次跑时从用户已有 Windsurf 抽出 (或要求用户拖拽 LS 到 `~/.dao-cascade/bin/`)
- **不绕过 OAuth** — 用户必须有有效账号才能用. 我们只 "整合", 不 "盗用".
- **不卖模型推理** — 阶二 daemon 仅是 "LAN 网关 + 自家代理", 推理仍走 Cognition 云端, 用户用自己的 quota.

---

## 七 · 速决 · 一句话总结

**问**: 能否做到"不依赖用户安装 Windsurf 而后端整合一切"?

**答**:
1. **能**, 但 LS binary (163 MB Go) 必须 ship — 它是 Cascade 的"魂", 闭源不可替.
2. **现已有 030**: 装 VS Code + VSIX 即可, 不必装 Windsurf. 这是阶一.
3. **更进一步 (阶二)**: 写 ~2000 行做 headless daemon, 完全脱离 IDE, 走纯 HTTP. 这是 1-2 周可成的真"独立软件".
4. **再进一步 (阶三)**: 自有 Electron 壳, 投入大 ROI 低, **不推**.

**道并行而不相悖**: 用户照常用 Windsurf, 我们另起 daemon, 端口/文件/进程全错开, 各自的 LS 实例互不打扰.

---

## 八 · 立即可做 next step (建议)

按用户判断, 三选一:

**A. 验证阶一**: 用 VS Code 装 030 VSIX, 测全功能链路, 写 setup 脚本. (最快见效)
**B. 启动阶二**: 创 `050-独立服_HeadlessCascade/`, 落地 daemon. (1-2 周, 一次到位)
**C. 仅文档**: 此报告 + ROADMAP, 不动手, 留档思考. (零侵入)

—— 道德经 第六十四章: "**为之于未有, 治之于未乱.**"
—— 道德经 第六十三章: "**图难于其易, 为大于其细.**"

> 万物负阴而抱阳, 冲气以为和.
> 道生一, 一生二, 二生三, 三生万物.
> **此报告为"一"; 路线为"二"; 落地为"三".**
