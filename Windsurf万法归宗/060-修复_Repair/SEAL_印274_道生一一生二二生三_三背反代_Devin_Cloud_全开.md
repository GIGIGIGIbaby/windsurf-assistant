# SEAL · 印274 · 道生一一生二二生三 · 三背反代 · Devin Cloud 全开

> 「道生一，一生二，二生三，三生万物。万物负阴而抱阳，中气以为和。」── 帛书四十二

---

## 本印概要

将 `dao_proxy.js` 从 v3 (dual-backend: Windsurf + GitHub Models) 升级为 **v4 triple-backend**:
- **GitHub Models** (永久免费 · GITHUB_TOKEN)
- **Windsurf Cascade** (sk-ws-* · GetChatMessage RPC · W100 额度)
- **Devin Cloud** (devin-session-token$JWT · ACP WebSocket · D100 额度)

**核心突破**: 同一组账号 (accounts.md) 同时拥有三个 backend 的凭证：
- Step 1 登录 → auth1Token
- Step 2 WindsurfPostAuth → `devin-session-token$JWT` (Devin Cloud 凭证)
- Step 3 RegisterUser → `sk-ws-*` (Windsurf Cascade 凭证)
- GitHub Actions 内置 `GITHUB_TOKEN` → GitHub Models 凭证

**三背一源 · 无为而无不为**

---

## 架构

```
                     ┌─────────────┐
                     │  用户请求    │
                     │ /v1/chat/   │
                     │ completions │
                     └─────┬───────┘
                           │
                    ┌──────▼──────┐
                    │ proxyChat   │
                    │ 三背 router │
                    └──────┬──────┘
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌────────────┐ ┌──────────┐ ┌──────────┐
     │ gh_models  │ │ windsurf │ │  devin   │
     │ REST API   │ │ RPC JSON │ │ ACP WSS  │
     │ (免费)     │ │ (W100)   │ │ (D100)   │
     └────────────┘ └──────────┘ └──────────┘
         │              │            │
    models.github.ai  server.     app.devin.ai
                      codeium.com   /api/acp/live
```

---

## 路由策略

| 模型前缀 | 路由 |
|---------|------|
| `windsurf/xxx` · `MODEL_xxx` | windsurf only |
| `gh/xxx` · `openai/xxx` · `deepseek/xxx` | gh only |
| `devin/xxx` · `devin-cloud` · `devin` | devin only |
| 其他 (`swe-1.5` · `gpt-4o-mini` 等) | gh → windsurf → devin fallback |
| `DAO_BACKEND_PRIORITY=devin,gh,windsurf` | 自定义顺序 |

---

## Devin Cloud 集成细节

### §5.6 技术栈

- **协议**: ACP (Agent Communication Protocol) · JSON-RPC 2.0 over WebSocket
- **端点**: `wss://app.devin.ai/api/acp/live?token=<JWT>`
- **依赖**: Node 22+ 内置 `globalThis.WebSocket` (零外部依赖)
- **超时**: 120s (Devin Agent 首帧 20-60s)

### ACP 四步链

```
1. ws.onopen → initialize (id=1)
   ↓ protocolVersion=1 · clientCapabilities
2. ← initialize result · authMethods=[]
   → session/new (id=3) · cwd · mcpServers=[]
3. ← session/new result · sessionId
   → session/prompt (id=4) · prompt[]
4. ← session/update* (streaming · agent_message_chunk)
   ← session/prompt result (completion)
```

### 消息格式转换

- OpenAI messages `[{role, content}]` → ACP `[{type: "text", text}]`
- system + user/assistant 合并为单 prompt block
- ACP `agent_message_chunk` → OpenAI SSE `data: {"choices":[{delta:{content}}]}`

### Token 来源优先级

```
1. CRED_BOX.sessionToken (windsurfAuth Step 2 · devin-session-token$JWT)
2. process.env.DAO_DEVIN_TOKEN (显式环境变量)
3. CRED_BOX.apiKey (若本身是 devin-session-token$ 格式)
```

### 优雅降级

- Node < 22: `DEVIN_HAS_WS = false` → 跳过 Devin → 回落到 gh/windsurf
- 无 session token: 返回 `{ok:false, error:"no_devin_session_token"}` → 回落
- WSS 超时 120s: 若已收到部分文本 → 视为部分成功 · 否则回落

---

## 变更文件

### `dao_proxy.js`
- **v3.0.0 → v4.0.0**
- `CRED_BOX` 新增 `sessionToken` 字段
- `rotateCred()` 保存 `cred.sessionToken`
- `resolveAuth()` 返回 `sessionToken` (devin-session-token$ case)
- **新增 §5.6**: 完整 Devin Cloud ACP WebSocket 引擎 (~430 行)
  - `DEVIN_WSS_BASE`, `DEVIN_TOKEN_PREFIX`, `DEVIN_HAS_WS`
  - `DEVIN_MODELS_LIST`, `DEVIN_MODEL_ALIAS`
  - `resolveDevinModel()`, `getDevinSessionToken()`
  - `messagesToDevinPrompt()`, `extractDevinDelta()`
  - `proxyChatDevin()` — 完整 ACP 四步链 · 流式/非流式 · OpenAI 兼容输出
- `proxyChat()`: dual → triple · 新增 `explicitDevin` 检测 · `devin` backend case
- `/health`: triple-backend 状态 · devin_cloud info (websocket · node_version · token)
- `/v1/models`: 新增 devin-cloud · devin-cloud-claude · devin-agent
- `modeProxy()` / `modeLocal()`: 保存 `sessionToken` · 三背状态日志

### `workflows/dao-boot.yml`
- Node.js 20 → **22** (Devin Cloud WebSocket 需内置 WS)
- `DAO_BACKEND_PRIORITY` 默认 `gh,windsurf,devin`
- 注释更新 印272 → 印274

---

## 实证计划

```bash
# 1. 本地启动 (Node 22+)
export DAO_ACCOUNTS="email:pass"
node dao_proxy.js local

# 2. 检查三背状态
curl http://localhost:7799/health | jq

# 3. 三背逐一测试
# gh backend
curl http://localhost:7799/v1/chat/completions \
  -d '{"model":"gh/openai/gpt-4o-mini","messages":[{"role":"user","content":"ping"}]}'

# windsurf backend
curl http://localhost:7799/v1/chat/completions \
  -d '{"model":"windsurf/swe-1.5","messages":[{"role":"user","content":"ping"}]}'

# devin backend
curl http://localhost:7799/v1/chat/completions \
  -d '{"model":"devin/devin-cloud","messages":[{"role":"user","content":"ping"}]}'

# 4. 自动路由 (fallback chain: gh → windsurf → devin)
curl http://localhost:7799/v1/chat/completions \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

---

## 道义

- **三背一源**: 同一组账号 · 三条路径 · 一个接口 · 用户无感
- **无为而无不为**: 零配置即可三背全开 · 用户只需 fork + 设 ACCOUNTS
- **反者道之动**: Node 22 WebSocket 是内置的 · 无需 `npm install` · 零依赖不变
- **道法自然**: fallback 链自动处理 · 每个 backend 独立失败 · 不影响其他

---

*印274 · 道生一一生二二生三三生万物 · 2026-05-29*
