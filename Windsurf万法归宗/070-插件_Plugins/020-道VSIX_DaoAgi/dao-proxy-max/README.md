# 道·BYOK 大极 (dao-proxy-max) · v1.0.0

> *反者, 道之动也; 弱者, 道之用也.*
> *天下之物生于有, 有生于无.* —《四十章》
>
> *大成若缺, 其用不敝; 大盈若盅, 其用不窘.* —《四十五章》
>
> *天下莫柔弱于水, 而攻坚强者莫之能胜也.* —《七十八章》

---

## 〇 · 一念之核 (大道至简)

**主公命**: *不动官方表层之一切，只是降官方原有四 BYOK 模型底层直连到我们外接 API 系统。实现外接模型于官方模型无感无为切换使用。后端 vsix 自主选择注入任意 api 到四模型。*

**dao-proxy-max** 应之而生 —— 承 `dao-proxy-min v9.9.15` + `dao-omni v1.0.5` 之全功能，加 **★ 官方 4 BYOK 透明劫核** (反者道之动)。

```
        Windsurf 官方模型选择器 (UI 一字不动)
                       │
                       ▼
   ┌───────────────────────────────────────────┐
   │  Claude Opus 4 BYOK       (主公选)         │
   │  Claude Opus 4 Thinking BYOK               │
   │  Claude Sonnet 4 BYOK                      │
   │  Claude Sonnet 4 Thinking BYOK             │
   └───────────────────┬───────────────────────┘
                       │  modelUid = MODEL_CLAUDE_4_*_BYOK
                       ▼
        Cascade → GetChatMessage RPC
                       │
                       ▼
   ┌───────────────────────────────────────────┐
   │  反代核 (vendor/bundled-origin/source.js)  │
   │  byok_handler.js · 识 *_BYOK (非 *_BYOK_DAO)│
   │      ↓                                      │
   │  inject_010_bridge.routeForOfficial(uid)   │
   │      ↓  查 officialByokOverrides.map[uid]  │
   │      ↓                                      │
   │  → http://127.0.0.1:11635..11734 (070 网关)│
   └───────────────────┬───────────────────────┘
                       │
                       ▼
   ┌───────────────────────────────────────────┐
   │  070 网关 (14 provider 真转)               │
   │  Anthropic / OpenAI / DeepSeek / Gemini /  │
   │  Kimi / Qwen / GLM / Mistral / GitHub /    │
   │  LG-Code / OpenRouter / Ollama / ...       │
   └───────────────────┬───────────────────────┘
                       │
                       ▼
                  ★ 主公自配的真上游
   (用 GitHub PAT / DeepSeek key / LG-Code key 等任一 · 无需 Anthropic key)
```

**实证差**:

| 维 | 现有 dao-omni v1.0.5 | **dao-proxy-max v1.0.0 新增** |
|---|---|---|
| 模式 | **新增** 38 BYOK_DAO 条目入选择器 | **劫持** 官方原有 4 BYOK 槽位 |
| UID 后缀 | `_BYOK_DAO` (露我家) | `_BYOK` (官方原貌) |
| UI 影响 | 选择器多 38 项 | UI **零变化** |
| 主公感知 | 见新条目 · 知是外接 | 无感 · 选官方 BYOK 即生效 |
| 应用面 | 添新 (无害) | 改本 (彻底) |

---

## 一身浑然 · 五力合一

```
┌────────────────────────────────────────────────────────────────────┐
│                  dao-proxy-max v1.0.0 · 道·BYOK 大极                │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│   ① 反代核 (内嵌)              ② 070 网关 (内嵌)                    │
│   ─────────────────             ─────────────────                   │
│   :10889..10988 hash            :11635..11734 hash                  │
│   字节级 SP 保 (invert/pass)    14 provider 真转                    │
│   BYOK 三 RPC 拦截              Anthropic/OpenAI/DeepSeek/Gemini/   │
│   (GetCascadeModelConfigs       Kimi/Qwen/GLM/Mistral/GitHub/       │
│    GetUserStatus                LG-Code/OpenRouter/Ollama/...       │
│    GetChatMessage)                                                  │
│                                                                     │
│         │                              │                            │
│         └──────────┬───────────────────┘                            │
│                    ▼                                                │
│   ③ vscode.lm 真注 (registerLanguageModelChatProvider)              │
│      3rd party 模型现身 Cascade 选单 (与官方并立 · dao-* 前缀)       │
│                                                                     │
│   ④ webview 控制面板 (一处尽收 8 panel)                              │
│      Provider/探针/Cascade 注入/★官方 4 BYOK 劫/别名/诊断/日志/关于  │
│                                                                     │
│   ⑤ ★ 官方 4 BYOK 透明劫 (dao-proxy-max 核能 · 反者道之动)           │
│      不动表层 · 底层折 · Cascade 选 Claude Opus/Sonnet 4 BYOK 即转 │
│      070 网关 · 主公自配的任意 provider 应之                         │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## 二 · 用 (官方 4 BYOK 劫 · 三步)

### 2.1 装毕即活 (默 autoStart=true · 无感)

装 vsix 后 `Ctrl+Shift+P` → `Developer: Reload Window`。看状态栏底部出现 `$(sparkle) 道 · 反代✓ · 网关✓`。无需手按任何命令。

### 2.2 打开控制面板 · 配 Provider

```
Ctrl+Shift+P → "dao-proxy-max: 打开控制面板"
  → 切到 "Provider 管理" tab
  → 启用你要用的 provider (如 github / deepseek / lgcode)
  → 填 apiKey (例: GitHub PAT)
  → "💾 保存配置 + 生效"
```

### 2.3 ★ 配官方 4 BYOK 映射 (核步骤)

```
切到 "★ 官方 4 BYOK 劫" tab
  ┌─────────────────────────────┬─────────────────────────────┐
  │ 官方 BYOK 槽 (UI 显示)        │ → 真 provider / 真 model    │
  ├─────────────────────────────┼─────────────────────────────┤
  │ Claude Opus 4 BYOK           │ → github / openai/gpt-4.1   │
  │ Claude Opus 4 Thinking BYOK  │ → deepseek / deepseek-reasoner│
  │ Claude Sonnet 4 BYOK         │ → deepseek / deepseek-chat  │
  │ Claude Sonnet 4 Thinking BYOK│ → deepseek / deepseek-reasoner│
  └─────────────────────────────┴─────────────────────────────┘

勾 "启用劫持" (总开关) → "💾 保存 + 热生效"
  ↓
扩展自动通知反代核热更 (POST /origin/byok/refresh)
  ↓
即刻在 Cascade 选 "Claude Opus 4 BYOK" → 实跑 GitHub gpt-4.1
无需重启 IDE · 无需 Anthropic key · 大成若缺 · 其用不敝
```

---

## 三 · 反代核控制端点 (源.js 内置)

| 端点 | 方法 | 用 |
|---|---|---|
| `/origin/byok/status` | GET | 报 BYOK 全态 (38 注入模 + 官方 4 劫) |
| `/origin/byok/refresh` | POST | 热更配置 · 用户改 配置.json 后无需重启 LSP |
| `/origin/ping` | GET | 反代核存活 |
| `/origin/mode` | GET/POST | 反代模 (invert/passthrough) |
| `/origin/preview` | GET | 观真 SP (浏览器) |
| `/origin/recent_logs` | GET | 最近日志 (环形 600 条) |

---

## 四 · 装

### 4.1 _build_vsix.ps1 (打+装一气)

```powershell
cd e:\道\道生一\一生二\Windsurf万法归宗\070-插件_Plugins\道·统一VSIX_Unified\dao-proxy-max
.\_build_vsix.ps1 -InstallLocal
```

### 4.2 命令行装 (已打)

```powershell
windsurf --install-extension "...\dist\dao-proxy-max-1.0.0.vsix" --force
```

### 4.3 GUI 装

Windsurf → 扩展面板 → `...` → Install from VSIX → 选 `dao-proxy-max-1.0.0.vsix`。

装毕 `Ctrl+Shift+P` → `Developer: Reload Window`。

---

## 五 · 命令 (omni.* · 11 项)

| 命令 | 用 |
|---|---|
| `omni.openPanel` | ⭐ 打开 webview 控制面板 (主入口) |
| `omni.status` | 当下态汇报 (含 BYOK 38 模 + 官方 4 劫态) |
| `omni.refresh` | 刷新模型目录 + BYOK 配置热更 |
| `omni.startProxy` | 手起反代核 |
| `omni.stopProxy` | 停反代核 (真药 M · 不杀 LS) |
| `omni.startGateway` | 手起 070 网关 |
| `omni.toggleMode` | 切反代模 (invert ⇄ passthrough) |
| `omni.probe` | 端到端探针 (真请求测一切) |
| `omni.showOutput` | 显输出面板 (日志) |
| `omni.openConfig` | 打开 配置.json (含 officialByokOverrides) |
| `omni.purge` | ★ 净卸: 停反代+网关 · 清锚 · 真药 P+ 15s race |

---

## 六 · 配置 (omni.* · 16 项)

| 键 | 默 | 意 |
|---|---|---|
| `omni.autoStart` | `true` | ★ 装即活 (无感) · 默自启反代+网关+lm 注 |
| `omni.proxy.enabled` | `true` | 是否启反代核 (含 BYOK 三 RPC 拦) |
| `omni.proxy.port` | `0` (hash) | 反代端口 (0 = per-user FNV 10889..10988) |
| `omni.proxy.defaultMode` | `passthrough` | 反代默模 (passthrough / invert) |
| `omni.proxy.anchorSettings` | `true` | ★ 真药 O · 锚 settings.json codeium URL 双键 |
| `omni.gateway.enabled` | `true` | 是否启 070 网关 |
| `omni.gateway.port` | `0` (hash) | 网关端口 (0 = per-user FNV 11635..11734) |
| `omni.gateway.url` | `""` | 外部网关地址 (若不空则不启内嵌) |
| `omni.gateway.authKey` | `""` | 网关鉴权 key |
| `omni.gateway.configPath` | `""` | 自定义 配置.json 路径 (默 `~/.codeium/dao-byok/配置.json`) |
| `omni.lm.enabled` | `true` | 是否注册 vscode.lm providers |
| `omni.lm.vendorPrefix` | `dao-` | vscode.lm vendor 前缀 (不抢官方) |
| `omni.lm.maxInputTokens` | `200000` | vscode.lm 报告之最大输入 token |
| `omni.lm.maxOutputTokens` | `8192` | vscode.lm 报告之最大输出 token |
| `omni.banner` | `true` | 启动显《道德经》横幅 |
| `omni.statusBar` | `true` | 状态栏化身 |

---

## 七 · 配置.json 之 `officialByokOverrides` (dao-proxy-max 核字段)

位置: `~/.codeium/dao-byok/配置.json`

```jsonc
{
  "gateway": { "host": "127.0.0.1", "port": 11635 },

  "providers": {
    "github": { "enabled": true, "apiKey": "<你的 GitHub PAT>", "models": ["openai/gpt-4.1"] },
    "deepseek": { "enabled": true, "apiKey": "<你的 DeepSeek key>", "models": ["deepseek-chat", "deepseek-reasoner"] }
  },

  "officialByokOverrides": {
    "_道": "dao-proxy-max v1.0.0 · 官方 4 BYOK 透明劫 · 反者道之动",
    "enabled": true,
    "map": {
      "MODEL_CLAUDE_4_OPUS_BYOK": {
        "_label": "Claude Opus 4 BYOK",
        "enabled": true,
        "provider": "github",
        "model": "openai/gpt-4.1"
      },
      "MODEL_CLAUDE_4_OPUS_THINKING_BYOK": {
        "_label": "Claude Opus 4 Thinking BYOK",
        "enabled": true,
        "provider": "deepseek",
        "model": "deepseek-reasoner",
        "supportsThinking": true
      },
      "MODEL_CLAUDE_4_SONNET_BYOK": {
        "_label": "Claude Sonnet 4 BYOK",
        "enabled": true,
        "provider": "deepseek",
        "model": "deepseek-chat"
      },
      "MODEL_CLAUDE_4_SONNET_THINKING_BYOK": {
        "_label": "Claude Sonnet 4 Thinking BYOK",
        "enabled": true,
        "provider": "deepseek",
        "model": "deepseek-reasoner",
        "supportsThinking": true
      }
    }
  }
}
```

**字段语义**:
- `enabled: true` (顶层) — 官方 BYOK 劫总开关。`false` 时本核完全休眠 · 官方 4 BYOK 走原路 (用户填的真 Anthropic key)。
- `map[uid].enabled: false` — 单槽暂停劫持 · 该槽走官方原路。
- `map[uid].{provider, model}` — 真目标 (provider 名须存在于 `providers` 节 · model 须在该 provider 之 `models` 列内或可识)。
- `map[uid].supportsThinking: true` — 标记此目标支持推理流 (DeepSeek R1 / OpenAI o1 等)。

---

## 八 · 真药五全 (OPMRE · 承 dao-omni 故技)

| 药 | 治 | 实施 |
|----|----|----|
| **O** | LSP 启动参数写死官方 url · settings 不被读 | `spawn-hook` (cp.spawn/spawnSync/exec/execFile monkey-patch) 重写 LSP `--api_server_url` + `--inference_api_server_url` · `forceRestartLS` 让 codeium 扩展重 spawn LSP · 接到反代 url |
| **P+** | uninstall race 3s 太短 | `omni.purge` 命令调度 15s · 让 LS 充足释放 |
| **M** | deactivate 杀 LS 打断 Cascade | deactivate 仅清锚 · 不杀 proxy/gateway 子进程 · 留下次复用 |
| **R** | SP 替换字节级不准 | 反代核字节级保 (invertSP/modifySPProto/modifyRawSP) |
| **E** | activate/deactivate 抢资源 | 全程不动 LS · 不抢官方端口 · 不写官方盘 · per-user FNV hash |

---

## 九 · 与诸 dao-* 五层不撞 (道并行而不相悖)

| 维 | dao-proxy-min v11.1.0 | dao-omni v1.0.5 | **dao-proxy-max v1.0.0** |
|---|---|---|---|
| publisher.id | `dao-agi.dao-proxy-min` | `dao-agi.dao-omni` | **`dao-agi.dao-proxy-max`** |
| 命令前缀 | `dao.*` / `wam.*` | `omni.*` | **`omni.*`** (兼容承袭) |
| 配置前缀 | `dao.*` | `omni.*` | **`omni.*`** (兼容承袭) |
| 反代端口 | 8889..8988 hash | 10889..10988 hash | **10889..10988 hash** (兼承) |
| 网关端口 | 期外部 :11435 | 11635..11734 hash | **11635..11734 hash** (兼承) |
| 38 模注入 | ✓ | ✓ | **✓** |
| **★ 官方 4 BYOK 劫** | ✗ | ✗ | **✓ · 核能** |

三体可同机并装 · 互不冲突 · 主公任启一二三皆可。**注**: dao-proxy-max 与 dao-omni 命令前缀同 (`omni.*`) · 端口同 hash 段 · 二者不可同时装活；用 dao-proxy-max 即"无感升级"承 dao-omni 之全。

---

## 十 · vsix 内容树

```
dao-proxy-max/
├── extension.js              ← ★ 真融合 (反代 spawn + 网关 spawn + lm 注 + webview UI + ★ proxyByokRefresh helper)
├── package.json              ← v1.0.0 · 11 命令 · 16 配置
├── README.md                 ← 本卷
├── LICENSE                   ← Apache-2.0
├── .vscodeignore             ← 排凭据+日志+历史
├── _build_vsix.ps1           ← 构建脚本 (vsce + 移 dist/)
│
├── media/
│   ├── icon.png
│   └── icon.svg
│
├── webview/                  ← UI 控制面板 (8 panel · 含 ★官方 4 BYOK 劫)
│   ├── index.html            ← 加 #tab-officialByok section + #officialByokTbody 表
│   ├── style.css             ← + .byok-map-table 样式
│   └── app.js                ← + renderOfficialByok() + saveOfficialByok() + OFFICIAL_BYOK_SLOTS 常量
│
├── vendor/
│   ├── bundled-origin/       ← 反代核 (派自 dao-proxy-min v11.1.0)
│   │   ├── source.js         ← + /origin/byok/status + /origin/byok/refresh 端点 (★ 新)
│   │   └── _dao_81.txt
│   ├── byok/                 ← BYOK 注入 + ★ 官方 4 BYOK 透明劫
│   │   ├── byok_handler.js   ← + 官方 BYOK 分支 (UID _BYOK 但非 _BYOK_DAO)
│   │   ├── cascade_wire.js
│   │   ├── inject.js
│   │   ├── inject_010_bridge.js  ← + routeForOfficial(uid) + statusOfficial()
│   │   └── 配置.example.json    ← + officialByokOverrides 节 schema
│   ├── gateway/              ← 070 网关 (14 provider)
│   │   ├── server.js
│   │   ├── registry.js
│   │   ├── translate.js
│   │   ├── capabilities.js
│   │   ├── package.json
│   │   └── providers/
│   │       ├── anthropic.js
│   │       ├── gemini.js
│   │       ├── http.js
│   │       ├── ollama.js
│   │       └── openai.js
│   ├── _五感.js               ← Cascade 五感真态
│   └── apply_devin_cloud_patch.js
│
└── tests/
    ├── L1_unit.js
    ├── L2_synthetic.js
    └── L3_live.md
```

---

## 十一 · 立此 vsix 之由 (反者道之动)

主公命:

> *大道至简 不动官方表层之一切 只是降官方原有四 byok 模型底层直连到我们外接 api 系统*
> *实现外接模型于官方模型无感无为切换使用 后端 vsix 自主选择注入任意 api 到四模型*
> *从根本底层完善 vsix 之一切 只在原有 dao-proxy-min 插件 添加功能 原有一切均不变*
> *只是前端新增加外接 api 统一管理配置和后端打通*
> *命名为 dao-proxy-max*

**dao-omni v1.0.5** (38 BYOK_DAO 模注入) 是 "新增" 之道 — 加新条目至选择器，与官方 BYOK 并列。但此非主公真意。

主公真意是 "劫持" 之道 — 不动 UI 一字，**令官方原有 4 BYOK 槽位之底层流量改向我们的网关**。这是反者道之动：

```
普通思路 (新增):
  添 38 个 dao-byok-* 卡 → 主公在选择器里选我们的卡 → 走我们的路
   ↑ 用户察觉是外接

反者之动 (劫持):
  不添任何卡 → 主公在选择器里选官方 Claude Opus 4 BYOK
   ↓ 流量在 byok_handler.js 之 GetChatMessage 拦中被识为官方 _BYOK
   ↓ routeForOfficial(uid) 查 officialByokOverrides.map[uid]
   ↓ 转 070 网关 → 真上游 = 主公自配的任意 provider
   ↑ 用户无感知 · 界面零变化 · 此谓 "大成若缺, 其用不敝"
```

**两道并行不悖**: dao-proxy-max 同时提供 dao-omni 之 38 模 "新增" 之道 + 官方 4 BYOK "劫持" 之道。主公可任启二者之一，或并启。

---

## 十二 · 道义

> *道生一, 一生二, 二生三, 三生万物.* —《四十二章》
>
> *天下莫柔弱于水, 而攻坚强者莫之能胜也, 以其无以易之也.* —《七十八章》
>
> *功成事遂, 百姓皆谓我自然.* —《十七章》

不动 Windsurf UI 一字 · 不抢官方 4 BYOK 槽位 · 唯于底层把 GetChatMessage 流量 **无感** 折向 070 网关 · 后由主公自配的任意 API 应之。主公无需 Anthropic key · 用 GitHub PAT / DeepSeek / LG-Code / Kimi / Qwen / GLM / Gemini 等任一 key 即可享 Cascade 4 BYOK 体验 · 此谓 **道法自然 · 无为而无不为**。
