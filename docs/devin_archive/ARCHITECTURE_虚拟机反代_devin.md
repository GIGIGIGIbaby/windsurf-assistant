# ARCHITECTURE · 本地↔VM 之契约 · 接口规范 (印 125 升)

> 「**圣人执一，以为天下牧**」 ──《老子》二十二
>
> 「**为之于其未有也，治之于其未乱也**」 ──《老子》六十四

──────────────────────────────────────────────

## 〇 · 此文之意

主公诏「分而治之 · 道并行而不相悖」之**实施契约**。

凡新立 client (本地端) · 凡修 daemon (VM 端) · **必依此契约**。

──────────────────────────────────────────────

## 一 · 鸡犬相闻 · 唯一通信道

```text
本地 client                  ◄══ HTTPS only ══►              VM dao_proxy
                                                              VM meta_router
                                                              VM omni router

不允: ssh / wss 直连 / file API 写入 / 共享内存 / Unix socket
```

**真据**：印 121 之实证。tunnel cloudfront 30-60min drift 之事 · 仅此唯一通信路 · 一断全断 · 不靠侧路。

──────────────────────────────────────────────

## 二 · VM 端暴露之契约 (服务端 spec)

### 2.1 单层入口 :7780 · dao_proxy (印 119)

```yaml
service: dao_proxy
version: ">=0.4.0"
host: 127.0.0.1:7780 (VM 内) | https://*.devinapps.com/port/7780/* (公网)
deps: 0  # Node 22+ 原生 WebSocket
auth_gate: required  # X-Dao-Auth | Bearer | ?key=

endpoints:
  GET  /health                         # 200 · {version, uptime, pool, sp_strategy}
  GET  /v1/models                      # 200 · {object: "list", data: [16 件]}
  POST /v1/chat/completions            # OpenAI 兼容 · stream/non-stream
  POST /v1/messages                    # Anthropic 兼容
  POST /v1beta/models/{m}:generateContent  # Gemini 兼容
  GET  /v1/system/prompt               # 现 SP 状 (印 122 部分移除)
  POST /v1/system/prompt               # 热换 SP (印 122 部分移除)
  GET  /v1/system/prompt/observe       # 印 122 · wss 帧观察日记 (n=10 默)
  GET  /metrics                        # 计数 (无 token 全文)
  GET  /                               # dashboard

response_meta:
  x_dao.sp.strategy: bypass|override|prepend|append|dao|custom|usernote
  x_dao.sp.finalSpLen: int
  x_dao.sp.daemonSource: silk_chapter_N | env | none

auth_token_source:
  primary: 00_本源/.dao_auth_token (32 hex · 部署时立 · 写 VM 内同名)
  header: X-Dao-Auth: <token>     # ★ 推 (cloudfront tunnel 兼容)
  header: Authorization: Bearer <token>  # ⚠ tunnel 上不通
  query: ?key=<token>              # URL-only · 兼容 curl
```

### 2.2 双层入口 :8081 · meta_router (印 120)

```yaml
service: meta_router
version: ">=0.6.0"  # 印 121 streaming pipe + OpenAI-spec error
host: 127.0.0.1:8081 (VM 内) | https://*.devinapps.com/port/8081/* (公网)
deps: 0
auth_gate: required (双护 Basic + X-Dao-Auth)

endpoints:
  GET  /health                         # 200 · {version, backends, hasAuth}
  GET  /v1/models                      # 200 · 51 件 (16 dao + 35 github)
  POST /v1/chat/completions            # 默 fallback [dao, github]
  POST /v1/messages                    # 同
  POST /devin/v1/*                     # 强 dao 路 (绕 fallback)
  POST /github/v1/*                    # 强 github 路 (绕 fallback)
  GET  /backends/status                # 三池健康

routing:
  default: ["dao", "github"]   # 任 1 200 即返
  prefix:
    "github/openai/gpt-4o": -> github 路
    "openai/gpt-4o": -> default fallback
  stream: true 时之 streamDao/streamGithub 真 pipe (非 buffered)

error_format: # OpenAI-spec
  {
    "error": {
      "message": str,
      "type": "upstream_error" | "invalid_request_error" | ...,
      "code": "all_failed" | "unauthorized" | "timeout" | ...,
      "tries": [{ "backend": str, "status": int, "ms": int }]
    }
  }
```

### 2.3 启动 ENV 全表 (印 123 续补 · 部署时必读)

```yaml
# ─── dao_proxy (:7780) 之 ENV ───
PORT: 7780              # 端口 (默)
BIND: 127.0.0.1         # 绑定地址
DAO_AUTH_TOKEN: <hex>   # ★ auth · client 之 X-Dao-Auth 头值 (32 hex)
DAO_AUTH_PUBLIC: ""     # 空 = auth 必 · "1" = /v1/models 等可无 auth
DAO_TOKENS_FILE: tokens_dao_123.txt  # Devin session token 池件路径
WS_TOKENS_FILE: tokens_ws_59.txt     # Windsurf SDK token 池件路径
WS_DEFAULT_MODEL: ...   # cascade/cortex 路默模 (默 "claude-sonnet-4")
WS_COOLDOWN_MS: 60000   # token 池冷却毫秒
DEFAULT_MODEL: ...      # /chat/completions 缺 model 时之默 (默 "openai/gpt-4o")
SP_STRATEGY: bypass     # SP 七态默 (bypass|override|prepend|append|dao|custom|usernote)
SP_CUSTOM: ""           # custom 态下之 SP 文 (大字符串)
SP_NEUTRALIZE: "1"      # 中和注入套路 (e.g. "ignore previous instructions")
SP_STRIP_MEM: "1"       # 剥 <memory>...</memory> 块
SP_STRIP_SIDE: "1"      # 剥 32 客端侧道注入标签 (REMINDER, SYSTEM, ...)
SP_NOTE: ""             # ★ 印 125 · usernote 态之 user note 文 (贴 SP §3.17 槽)
SP_DAO_CHAPTER: ""      # ★ 印 125 · dao/prepend/append 态之帛书章号 (1-81)
DAO_SILK_DIR: ""        # silk 帛书目录 (dao 态用)
DAO_SILK_FILE: ""       # silk 帛书单件 (覆 DAO_SILK_DIR)
PROMPT_TIMEOUT_MS: 60000 # ConnectRPC 调超时
VERBOSE: ""             # "1" = 启冗日
DEBUG: ""               # "1" = 启 debug 日 + 暴露内部态
DEVIN_TOKEN: ""         # 覆 tokens_dao_123.txt 之单 token (调试用)
DEVIN_TOKENS: ""        # 逗号分隔 token 串 (覆件)
WAM_FILE: ~/.wam/wam-state.json  # WAM 状态件 (activeApiKey 读源)
WINDSURF_UPSTREAM: ...  # cascade 路上游 (默 "https://server.codeium.com")
WSS_URL: wss://app.devin.ai/api/acp/live  # dao 路 wss

# ─── meta_router (:8081) 之 ENV ───
META_PORT: 8081         # 端口 (默)
META_AUTH_TOKEN: <hex>  # ★ auth · client 之 X-Dao-Auth 头值 (32 hex)
META_DIR: 00_本源       # 工目录
META_FALLBACK: dao,github  # ★ fallback 顺 (逗号分 · 默 "dao,github")
DAO_PROXY_URL: http://127.0.0.1:7780  # 内 dao_proxy 之 URL (默 localhost)
DAO_PROXY_AUTH: <hex>   # dao_proxy 之 DAO_AUTH_TOKEN (内 RPC 用)
GITHUB_BASE: https://models.inference.ai.azure.com  # GitHub Models endpoint
GITHUB_TOKEN: <PAT>     # ★ GitHub PAT scope=models (启 35 模 BYOK)

# ─── vm_pool_watchdog 之 ENV ───
DAO_POOL_JSON: _state/vm_pool.json
DAO_OMNI_JS: ../00_本源/vm_omni.js
DAO_DEPLOY_JS: ../00_本源/vm_proxy_deploy.js
DAO_AUTH_FILE: ../00_本源/.dao_auth_token
DAO_WATCHDOG_LOG: _state/watchdog.log
```

──────────────────────────────────────────────

### 2.4 omni router (Devin 自带 · 主公不动)

```yaml
service: devin omni router
host: https://omni-router-app-tunnel-XXX.devinapps.com (Devin 自配)
auth: Basic user:<sandbox-id>  # Devin 之 cloudfront 限

endpoints:
  GET  /_/health   # omni 自健康
  POST /_/run      # 跑 shell 命 (vm_omni 用 · 印 102)
  *    /port/{7780|8081}/*  # 转发至 VM 内端口

stability:
  ttl: 24h (VM 自然死)
  tunnel_drift: 30-60min (cloudfront S3 drift · 印 121 实证)
  fix: vm_pool_watchdog 5min poll + spawn 替 (印 122)
```

──────────────────────────────────────────────

## 三 · 本地端契约 (client side spec)

### 3.1 必守 (read-only · 0 daemon)

```text
✓ 仅消费 HTTPS API
✓ 不直连 VM 之 wss
✓ 不写 VM 之文件
✓ 不持久 daemon (除 vm_pool_watchdog)
✓ 不污 ~/.wam · ~/.dao 之外的目录
✓ 关停 = Ctrl+C · 0 残留 (除 watchdog.pid · 一字 watchdog-stop 清)
```

### 3.2 配置文件之主 (主公本地)

```text
~/.wam/wam-state.json           ← Windsurf 账号 (主公 OAuth · 不动)
~/.dao/playbooks.json           ← Cognition Playbook 配置 (主公自编)
00_本源/_state/vm_pool.json     ← VM 池真据 (vm_omni/watchdog 写)
00_本源/_state/watchdog.log     ← watchdog 日记 (无 ANSI · grep 友好)
00_本源/.dao_auth_token         ← per-deploy 之 dao_proxy auth (32 hex)
01_GH编排/.dao_meta_auth_token  ← per-deploy 之 meta_router auth
05_本地轻管/.env.local          ← 主公 SDK 之 env (emit-env 生成)
```

### 3.3 启动顺 (主公一日)

```text
Step 1: 主公 OAuth Windsurf (~/.wam/wam-state.json 自动有 activeApiKey)
Step 2: cd 05_本地轻管
Step 3: .\一笔便活.ps1 spawn          # 1 ACU · ~10min · 起 1 件 VM
Step 4: .\一笔便活.ps1 set-pat -Pat   # 注 GitHub PAT (启 35 模 BYOK)
Step 5: .\一笔便活.ps1 watchdog-bg    # 起后台 daemon (5min poll)
Step 6: .\一笔便活.ps1 emit-env       # 写 .env.local
Step 7: 主公 SDK source .env.local · 真用
```

### 3.3' 启动顺 · 印 125 · N 件 VM 之极 (推)

```text
Step 1: 主公 · 备 N 个账号 token 至 00_本源/tokens_dao_123.txt
Step 2: 主公 · 准备 _sp_configs/ 之 per-VM SP 配置 (如需)
        可备 vm-甲.json (dao 态) + vm-乙.json (override) + ...
        或直用 7 sample (bypass/override/prepend/append/dao/custom/usernote)
Step 3: cd 05_本地轻管
Step 4: .\spawn_N.ps1 -Count N -Action preview   # 0 ACU 预览
Step 5: .\spawn_N.ps1 -Count N -Action go        # N ACU 真起
Step 6: .\spawn_N.ps1 -Action wait               # 等齐起 (~10min)
Step 7: .\spawn_N.ps1 -Action deploy             # 自动 vm_proxy_deploy --sp-config
Step 8: .\一笔便活.ps1 emit-env -All        # 多 VM URL 出 .env.local
Step 9: 主公 SDK source .env.local · 多 VM 分流真用

# 任什 · 7 件一一对一 7 SP 态 (round-robin):
.\spawn_N.ps1 -Count 7 -Action go
# 64 件真池满:
.\spawn_N.ps1 -Count 64 -Action go
```

──────────────────────────────────────────────

## 四 · token 之契约

### 4.1 真本源之"一" (主公一 Windsurf 账号)

```yaml
source: ~/.wam/wam-state.json
field: activeApiKey  # str · sk-* | devin-session-token$*
purpose: 起 VM 之凭 (vm_omni 之必)
```

### 4.2 池之"二" (VM 内 dao_proxy 之双池)

```yaml
devin_pool:
  source: 00_本源/tokens_dao_123.txt
  count: 64
  format: devin-session-token$xxx (一行一)
  upload: vm_proxy_deploy.js 自动上传
  use: dao 路 (wss://app.devin.ai/api/acp/live)

windsurf_pool:
  source: 00_本源/tokens_ws_59.txt
  count: 59
  format: sk-xxx (一行一)
  upload: vm_proxy_deploy.js 自动上传
  use: cascade/cortex 路 (ConnectRPC over gRPC-Web)
```

### 4.3 三守 (道义)

```text
① 仅本机本用户读 (NTFS ACL 守)
② 仅 VM 内之 dao_proxy 进程读 (chmod 600)
③ 不日志全文 · 仅 last4 (e.g. "...a1b2")
```

──────────────────────────────────────────────

## 五 · SP 七态之契约 (印 84-122)

```yaml
strategies:
  bypass:
    description: 任 client SP 完全透
    impl: 不动 message
    config: {}

  override:
    description: 强用 dao SP · 替 client SP
    impl: replace messages[0].role==system
    config: { custom: str }

  prepend:
    description: dao + client SP
    impl: messages = [{role:system, content:dao}, *messages]
    config: { dao_chapter: int? | custom: str? }

  append:
    description: client SP + dao
    impl: messages[0].content = client_sp + "\n\n" + dao
    config: { dao_chapter: int? }

  dao:
    description: silk 帛书 N 章
    impl: SP = silk[chapter] | random
    config: { chapter: int? }

  custom:
    description: 主公任意文 (env)
    impl: SP = env.SP_CUSTOM
    config: { custom: str }

  usernote: # 印 122 立 · SP §3.17 合法槽 · 印 125 加 SP_NOTE ENV 接入
    description: 注 user notes (官认槽 · 不抗 persona)
    impl: prepend "用户特别说明: <note>" 至 user message
    config: { note: str }
    env_source: SP_NOTE  # 印 125 加 · vm_proxy_deploy --sp-note 写入此 ENV

config_layer_order:  # 印 125 立 · 三层覆顺 (高优 → 低优)
  1: process.env.SP_*                  # 主公本机 ENV (兼容老法)
  2: cli --sp-* 参                    # vm_proxy_deploy.js 之 cli 参
  3: _sp_configs/{vm-name}.json        # 主公编件 · per-VM SP 隔离
  4: 默 bypass                         # 无配置时之安全态

_sp_configs_schema:  # 印 125 · per-VM SP 隔离仓 (00_本源/_sp_configs/)
  fields:
    name: str       # VM 名 (仅文档用)
    strategy: enum  # bypass | override | prepend | append | dao | custom | usernote
    custom: str?    # override / prepend / append / custom 之 SP 文
    dao_chapter: int? # 1-81 · dao / prepend / append 之帛书章
    neutralize: bool? # 默 true
    strip_mem: bool? # 默 true
    strip_side: bool? # 默 true
    note: str?      # usernote 之 user note 文
    memo: str?      # 人读说明 (他场合不读)

side_channel_strip:
  enabled: true (永)
  strip:
    - 32 客端常见之注入标签 (REMINDER, SYSTEM, ...)
    - MEMORY 块 (<memory>...</memory>)
    - override 套路中和 ("ignore previous instructions...")

response_meta: # 印 122 立
  x_dao.sp:
    strategy: <strategy>
    finalSpLen: int
    daemonSource: silk_chapter_N | env | none
```

──────────────────────────────────────────────

## 六 · Playbook 之契约 (印 122 · Cognition 官)

```yaml
config: ~/.dao/playbooks.json
schema:
  playbooks:
    - name: str (unique)
      trigger:
        match: regex (per request 之 message[-1].content 匹之)
      steps:
        - sp_override: str (本步之 SP)
          max_tokens: int
          post_process: str?  # 后处理函式名 (可选)

trigger_header: X-Dao-Playbook: <name>  # 主公 client 显示触发
auto_trigger: per request 之 message · regex match (自动)

state:
  ~/.dao/playbooks.<name>.state.json (持久 multi-turn state)
```

──────────────────────────────────────────────

## 七 · GH 编排之契约 (印 95-115)

```yaml
runner: GH Actions ubuntu-latest
trigger:
  - workflow_dispatch
  - cron "0 */5 * * *"  # 5h 自续

steps:
  1. checkout
  2. setup-node 18+
  3. cd packages/dao-devin-vm
  4. node deployer.js --gist-id $DAO_POOL_GIST_ID --pat $DAO_POOL_PAT --n $N_VMS
  5. while keepalive (350min 之 5min poll · 替死者)
  6. (runner 自然 6h 死)

secrets_required:
  DAO_POOL_GIST_ID: str  # 主公 Gist id (含 dao-pool.json)
  DAO_POOL_PAT: str       # PAT scope: gist

gist_schema:
  daemons:
    - sessionId: str
      tunnelUrl: https://*.devinapps.com
      status: alive | dead
      spawnedAt: ISO8601
      ttlExpire: ISO8601
```

──────────────────────────────────────────────

## 八 · 三隔离 (帛书八十)

```text
GH Actions runner    ←─ 不知 ─→ Devin VM dao_proxy
       │                                   │
       └─── 通 Gist 间接交流 ───────────────┘
              (rest API · 5min poll)

GH Pages 网页       ←─ 不知 ─→ GH Actions runner
       │                                   │
       └─── 直读 Gist 之 daemons[] ─────────┘
              (主公 client 直得 alive URL)

主公 client         ←─ 直 HTTPS ─→ Devin VM
       │                                   │
       └─── 不通过 GH Actions/Pages ────────┘
              (零中继 · 真公网)
```

**真意**：三方 (GH Actions / Devin VM / 主公 client) **鸡犬相闻 · 民至老死不相往来**。任一方死，其余仍真活。

──────────────────────────────────────────────

## 九 · 改动此契约之诫

```text
✗ 不可在 VM 端开 wss server (除 dao_proxy 之内部 ConnectRPC)
✗ 不可在本地端开 server 端口 (除 watchdog 之被动 client)
✗ 不可加新通信路 (除 HTTPS over devinapps.com)
✗ 不可改 :7780/:8081 端口号 (vm_proxy_deploy/vm_meta_deploy 硬码)
✗ 不可破 SP 七态枚举 (新增需主公诏 + 印 + ARCHITECTURE.md 升)
✗ 不可移除 X-Dao-Auth header 兼容 (cloudfront tunnel 限之实)
```

──────────────────────────────────────────────

## 十 · 升级此契约之程

```text
① 主公诏 · 立新印号 (e.g. 印 124+)
② SEAL_印XXX_*.md · 详写新契约段
③ ARCHITECTURE.md · 升此文 (此文为唯一 source of truth)
④ 真测 · _seal{XXX}_*.cjs 守门 (印 115 模式)
⑤ 真据 · 04_evidence/ 立 seal{XXX}_*.json
⑥ 旧契约入 _archive/印XXX_SEAL历程/
```

──────────────────────────────────────────────

> 「**夫唯不欲盈，所以能敝而不成**」 ──《老子》十五

*印 125 · 锚定本源 · 推进到极 · per-VM SP 隔离 · N VM 并发之契约 · 道法自然*
