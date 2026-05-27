# 道Agent — ACP 协议层 · 解耦独立态

> 反者道之动 · 弱者道之用 · 无为而无不为
>
> **本目录仅承担 ACP 协议实现. 默认零干扰 Windsurf.**

## 三种使用方式 (按需择一 · 不必都用)

```
┌──────────────────────────────────────────────────────────────┐
│                        本源需求                               │
│           "在 Windsurf/本地使用任意第三方 LLM                 │
│            获得完整 Agent 工具调用体验"                       │
└──────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ↓                   ↓                   ↓
    ┌───────────┐       ┌───────────┐       ┌───────────┐
    │   方式①   │       │   方式②   │       │   方式③   │
    │   反代    │       │  CLI REPL │       │ ACP 接入  │
    │  推荐 ★   │       │           │       │  可选     │
    └───────────┘       └───────────┘       └───────────┘
   零干扰 Windsurf      完全脱离 IDE      有侵入性副作用
```

## 方式 ① — 反代方案 (推荐)

**在 Windsurf 里用任意 LLM, 不改 Windsurf 任何代码/扩展.**

```powershell
cd ../010-反代_Proxy
node core/universal_relay.js    # 启动统一中继 :8878
# Windsurf 原生 Cascade 会透明使用任意上游 LLM
```

- 仅改一处配置 (`apiServerUrl → :8878`)
- 25 个注入模型直接出现在 Cascade 选择器
- 已通过 39/39 验证 (见 `../010-反代_Proxy/STATUS.md`)
- 本目录 `dao-agent` 不涉入

## 方式 ② — 独立 CLI Agent REPL

**脱离任何 IDE, 直接在终端和 Agent 对话.**

```powershell
cd ../010-反代_Proxy
node core/dao_agent.js          # 交互式 REPL
node core/dao_agent.js -m "..."  # 单次任务
```

- 完整工具调用循环 (read/write/edit/run/list/grep/find)
- 内置 7 个工具, 本地执行
- 不依赖 Windsurf, 不依赖本目录

## 方式 ③ — 本目录以 ACP 协议接入 Windsurf (可选)

**将 dao-agent 注册为 Windsurf 的 ACP Custom Agent.**

```powershell
node setup.js                       # 检查环境 (零副作用)
node setup.js --acp-install         # 预览接入操作
node setup.js --acp-install --yes   # 显式执行 (二次确认)
node unwind.js                      # 随时撤销
```

**侵入性副作用 (明示)**:

| 副作用 | 原因 | 撤销 |
|-------|------|------|
| 创建 `~/.windsurf/extensions/codeium.codeium-dev-0.0.1/` | 冒用 `Codeium.codeium-dev` 身份, 绕过 ACP Unleash 特性门 | `node unwind.js` |
| 写入 `~/.windsurf/acp/registry.json` | 注册 dao-agent 条目 | `node unwind.js` |
| 修改 `%APPDATA%/Windsurf/User/settings.json` | 启用 dao-agent + agentEnv | `node unwind.js` |

**为什么默认不接入?**

1. 方式 ① 已实现等效功能 (Cascade 里用任意 LLM), **零副作用**
2. 冒用 Codeium 身份可能被未来版本视为异常
3. Windsurf 升级时 Unleash 规则若变化, 方式 ③ 需同步更新; 方式 ① 几乎不受影响

## 配置 (仅方式 ③ 需要)

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DAO_PROVIDER` | `ag` | `ag` \| `anthropic` \| `openai` \| `gemini` \| `deepseek` \| `openrouter` |
| `DAO_MODEL` | `claude-sonnet-4-6` | 模型名称 |
| `DAO_API_KEY` | (env 推导) | API Key |
| `DAO_API_BASE` | (因 provider 而异) | API 基地址 |
| `DAO_MAX_TURNS` | `30` | Agent Loop 最大轮次 |
| `DAO_TIMEOUT_MS` | `120000` | 请求超时 (ms) |
| `DAO_LOG_LEVEL` | `info` | `error`\|`warn`\|`info`\|`debug`\|`trace` |

### 通过 Windsurf Settings

```json
{
  "windsurf.acp.agentEnv": {
    "dao-agent": {
      "DAO_PROVIDER": "ag",
      "DAO_MODEL": "claude-sonnet-4-6"
    }
  }
}
```

## ACP 协议层细节 (方式 ③ 技术原理)

Windsurf 的 ACP Custom Agent 被 Unleash 特性门门控:

```javascript
// 逆向 — isAcpAgentFamilyUnleashEnabled("custom")
return !!(isWindsurfInsiders() || isWindsurfNext()
       || hasDevExtension() || isDevelopment())
    || (ACP_ENABLED && acp-custom-enabled)   // 服务端, 不可控
```

`hasDevExtension()` 检查 `Codeium.codeium-dev` 是否安装, 这是可本地满足的唯一条件.
`setup.js --acp-install --yes` 放置一个 no-op stub 扩展实现该条件.

## 文件结构

```
dao-agent/
├── index.js          # ACP Server 主体 (stdio · ndjson · JSON-RPC 2.0)
├── setup.js          # 检查 + 可选 ACP 接入 (默认零副作用)
├── unwind.js         # 撤销 ACP 接入 (对称操作)
├── test_acp.js       # 协议本地测试
├── package.json
├── README.md         # 本文件
├── README.md.v1      # 旧版 (保留以备参考)
└── setup.js.old      # 旧版 (保留以备参考)
```

## 设计哲学

```
最小干预, 最大效果.
  ├── 方式 ① 反代 — 只改 apiServerUrl, 一处注入
  ├── 方式 ② REPL — 不改任何配置, 纯本地
  └── 方式 ③ ACP  — 侵入性, 默认不启用, 用则必能撤销

同一需求多解, 用户按场景择优. 不绑定, 不强制.
反者道之动 — 不和 Windsurf 对抗, 而是并行提供等效路径.
```

## 管理命令速查

```powershell
node setup.js                    # 默认: 检查状态 + 打印使用说明
node setup.js --check            # 同上
node setup.js --acp-install      # 预览方式③
node setup.js --acp-install --yes  # 执行方式③
node setup.js --acp-remove       # 撤销方式③ (代理到 unwind.js)
node unwind.js                   # 撤销方式③
node unwind.js --dry             # 预览撤销动作

node test_acp.js                 # 本地协议测试
```
