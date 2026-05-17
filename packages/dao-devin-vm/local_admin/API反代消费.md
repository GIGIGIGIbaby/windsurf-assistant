# API 反代消费 · 公网无感去中心化

> 「**江海所以能为百谷王者，以其善下之**」 ──《老子》六十六
>
> 「**大道甚夷，民甚好解**」 ──《老子》五十三

──────────────────────────────────────────────

## 〇 · 一图一道

```text
                       主公 client (任设备 · 任 SDK)
                              │
                  ┌───────────┼───────────┐
                  ▼           ▼           ▼
              OpenAI    Anthropic    Gemini SDK
              SDK         SDK
                  │           │           │
                  └───────────┼───────────┘
                              │ HTTPS
                              ▼
              https://*.devinapps.com/port/{7780|8081}/v1/*
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        :7780 dao_proxy  :8081 meta_router  (印 120 双层)
        (16 模 dao)      (51 模 dao+github)
              │               │
              ▼               ▼
        wss/ConnectRPC   fallback 链
        (双池真活)        (dao→github→...)
```

──────────────────────────────────────────────

## 一 · 入口选 (二端口)

### 1.1 单层入口 :7780 · dao_proxy 直 (印 119)

**仅 dao 池** (Devin + Windsurf · 16 模) · 直接 · 0 路由开销

```text
GET  /port/7780/health
GET  /port/7780/v1/models                      # 16 模 (dao 池)
POST /port/7780/v1/chat/completions            # OpenAI 兼容
POST /port/7780/v1/messages                    # Anthropic 兼容
POST /port/7780/v1beta/models/{m}:generateContent  # Gemini 兼容
```

### 1.2 双层入口 :8081 · meta_router (印 120)

**三池打通** (dao + GitHub Models BYOK + 主公自加) · auto-fallback

```text
GET  /port/8081/health
GET  /port/8081/v1/models                      # 51 模 (dao 16 + github 35)
POST /port/8081/v1/chat/completions            # 默 fallback [dao, github]
POST /port/8081/v1/messages                    # 同
POST /port/8081/devin/v1/chat/completions      # 强 dao 路 (绕 fallback)
POST /port/8081/github/v1/chat/completions     # 强 github 路 (绕 fallback)
GET  /port/8081/backends/status                # 三池健康
```

──────────────────────────────────────────────

## 二 · 三 auth 法 (印 121 · cloudfront tunnel 之实)

| 法 | 写 | 何时 |
|----|----|----|
| **X-Dao-Auth** ★推荐 | `default_headers={"X-Dao-Auth": "<auth>"}` | 默 · 任 SDK 兼容 |
| **?key=** | `base_url=".../v1?key=<auth>"` | URL-only · curl 测试 |
| **Bearer** ⚠ tunnel 限 | SDK 之标准 `api_key` | **tunnel 上不通** (cloudfront 自吞) · 仅本地直连 dao_proxy 时用 |

`<auth>` = `00_本源/.dao_auth_token` (单层) 或 `01_GH编排/.dao_meta_auth_token` (双层)

```pwsh
# 主公本地一字得 auth
$auth = (Get-Content "..\00_本源\.dao_auth_token" -Raw).Trim()
$metaAuth = (Get-Content "..\01_GH编排\.dao_meta_auth_token" -Raw).Trim()
```

──────────────────────────────────────────────

## 三 · 四协议消费 (主公任意 SDK)

### 3.1 OpenAI SDK (Python · 默最广)

```python
from openai import OpenAI

vm_url = "https://omni-router-app-tunnel-XXX.devinapps.com"
auth = "<auth-token>"

client = OpenAI(
    base_url=f"{vm_url}/port/8081/v1",   # 双层入口 · 51 模
    api_key="placeholder",                # 不用 (X-Dao-Auth 替代)
    default_headers={"X-Dao-Auth": auth},
)

# 默 fallback (dao 优先 · 502 接 github)
resp = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "道可道"}],
)
print(resp.choices[0].message.content)

# 强 github 路
resp = client.chat.completions.create(
    model="github/openai/gpt-4o",   # 前缀 github/ 自识
    messages=[{"role": "user", "content": "道可道"}],
)
```

### 3.2 Anthropic SDK (Python · Claude)

```python
from anthropic import Anthropic

client = Anthropic(
    base_url=f"{vm_url}/port/8081",
    api_key="placeholder",
    default_headers={"X-Dao-Auth": auth},
)

resp = client.messages.create(
    model="devin-cloud-claude",
    max_tokens=256,
    messages=[{"role": "user", "content": "道可道"}],
)
print(resp.content[0].text)
```

### 3.3 Gemini SDK (Python · 自带)

```python
import google.generativeai as genai

# Gemini 不支 base_url 注入 · 用 transport 法 (复杂) · 或直 HTTP curl
import requests
resp = requests.post(
    f"{vm_url}/port/7780/v1beta/models/devin-cloud:generateContent",
    headers={"X-Dao-Auth": auth, "Content-Type": "application/json"},
    json={"contents": [{"role": "user", "parts": [{"text": "道可道"}]}]},
)
print(resp.json())
```

### 3.4 Ollama 兼容 (主公本地 ollama client)

```pwsh
# Ollama client 默走 :11434 · 主公可改之指 VM
$env:OLLAMA_HOST = "$vmUrl/port/8081"
ollama run openai/gpt-4o "道可道"
# (ollama 不直支 X-Dao-Auth · 需 sidecar proxy)
```

──────────────────────────────────────────────

## 四 · curl 真测 (主公一字探活)

```pwsh
$vmUrl = "https://omni-router-app-tunnel-XXX.devinapps.com"
$auth = (Get-Content "..\00_本源\.dao_auth_token" -Raw).Trim()
$metaAuth = (Get-Content "..\01_GH编排\.dao_meta_auth_token" -Raw).Trim()

# 探 :7780 (单层)
curl.exe "$vmUrl/port/7780/health"
curl.exe "$vmUrl/port/7780/v1/models" -H "X-Dao-Auth: $auth"

# 探 :8081 (双层)
curl.exe -u user:bbb421a7e6d076eda1b653c8abf68d6f `
  "$vmUrl/port/8081/health" -H "X-Dao-Auth: $metaAuth"
curl.exe -u user:bbb421a7e6d076eda1b653c8abf68d6f `
  "$vmUrl/port/8081/v1/models?key=$metaAuth"
curl.exe -u user:bbb421a7e6d076eda1b653c8abf68d6f `
  "$vmUrl/port/8081/backends/status?key=$metaAuth"

# chat 真测 (默 fallback)
curl.exe -u user:bbb421a7e6d076eda1b653c8abf68d6f `
  -X POST "$vmUrl/port/8081/v1/chat/completions" `
  -H "X-Dao-Auth: $metaAuth" -H "Content-Type: application/json" `
  -d '{"model":"openai/gpt-4o","messages":[{"role":"user","content":"道可道"}]}'
```

──────────────────────────────────────────────

## 五 · streaming SSE (印 121 · v0.6.0 真修)

主公 yin121 之 meta_router v0.6.0 · streaming 真 pipe (非 buffered)：

```python
# OpenAI SDK · stream=True
stream = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "道生一"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

**真证**: response CT=`text/event-stream` · `data: {...}` SSE 帧 · 多 chunk 即时 (非 buffered)

──────────────────────────────────────────────

## 六 · 故障与修

| 状 | 真因 | 修 |
|----|------|----|
| 401 Bearer fail | tunnel cloudfront 吞 Authorization | 改 `X-Dao-Auth` 头或 `?key=` |
| 400 全路 | tunnel 死 (cloudfront drift) | watchdog 自换 (5min poll) 或主公手起新 VM |
| 502 chat | 上游 quota 耗 | 等 reset · 或换 token (`tokens_*.txt` 加新行) |
| /v1/models 18 件 (期望 35) | GITHUB_TOKEN 未注 | 主公注 PAT: `$env:GITHUB_TOKEN='ghp_*'; node vm_meta_deploy.js --idx 0 --restart` |
| streaming 不 SSE (单 chunk) | 老 v0.5.x meta_router | 升 v0.6.0 (印 121) |

──────────────────────────────────────────────

## 七 · 主公 OAuth 多账号 → 多 VM → 多入口

主公**多 Windsurf 账号** = **多 omni URL**，可以 client side 加权或随机分流：

```python
# 主公自配多 VM 之池 (本地 .env 或 config)
VM_URLS = [
    "https://omni-router-app-tunnel-A.devinapps.com",
    "https://omni-router-app-tunnel-B.devinapps.com",
    "https://omni-router-app-tunnel-C.devinapps.com",
]
import random
client = OpenAI(
    base_url=f"{random.choice(VM_URLS)}/port/8081/v1",
    api_key="placeholder",
    default_headers={"X-Dao-Auth": auth},
)
```

──────────────────────────────────────────────

## 八 · 多 VM 池管理 + 分流 (★ 印 125 · 推到极)

### 8.1 主公一字读 vm_pool.json (本地真据)

```pwsh
# 列 alive 之 N 件 URL
$pool = Get-Content "..\00_本源\_state\vm_pool.json" -Raw | ConvertFrom-Json
$alive = $pool | Where-Object { $_.status -eq 'alive' }
Write-Host ("alive VM 数: {0}" -f $alive.Count)
$alive | ForEach-Object { Write-Host ("  {0}  {1}" -f $_.sessionId.Substring(0, 16), $_.tunnelUrl) }
```

### 8.2 一字 emit-env 多 VM (主公 client 即用)

```pwsh
# 默 emit-env 仅出第 0 件 · 印 125 加 -All 出全 alive
.\一笔便活.ps1 -Action emit-env -All > .env.local
# 内含 DAO_VM_URL_0, DAO_VM_URL_1, ... DAO_VM_URL_N  (N 件 alive)

# 主公 source 之
. .\.env.local
```

### 8.3 主公 client 之三种分流 (按需选)

#### 8.3.1 随机分流 (轮流公允)

```python
import os, random
N = int(os.environ.get('DAO_VM_COUNT', '1'))
urls = [os.environ[f'DAO_VM_URL_{i}'] for i in range(N)]
url = random.choice(urls)
client = OpenAI(base_url=f"{url}/port/8081/v1", api_key="x", default_headers={"X-Dao-Auth": auth})
```

#### 8.3.2 按 SP 态分流 (主公 per-VM SP 隔离时用)

```python
# 主公 7 件 VM · 一 VM 一 SP 态 (印 125 之 spawn_N -Count 7)
SP_TO_URL = {
    'bypass':   os.environ['DAO_VM_URL_0'],   # vm000-bypass
    'override': os.environ['DAO_VM_URL_1'],   # vm001-override
    'prepend':  os.environ['DAO_VM_URL_2'],   # vm002-prepend
    'append':   os.environ['DAO_VM_URL_3'],   # vm003-append
    'dao':      os.environ['DAO_VM_URL_4'],   # vm004-dao
    'custom':   os.environ['DAO_VM_URL_5'],   # vm005-custom
    'usernote': os.environ['DAO_VM_URL_6'],   # vm006-usernote
}
# 主公 client 一笔: 问 dao 风 → 走 dao VM · 问 transparent → 走 bypass VM
client = OpenAI(base_url=f"{SP_TO_URL['dao']}/port/8081/v1", api_key="x", ...)
```

#### 8.3.3 LiteLLM / OpenAI Router 之 N 件 backend (大并发负载)

```python
# litellm router (N 件 backend · 自动 retry + 加权)
from litellm import Router
model_list = [
    {
        "model_name": "openai/gpt-4o",
        "litellm_params": {
            "model": "openai/gpt-4o",
            "api_base": f"{urls[i]}/port/8081/v1",
            "api_key": "x",
            "extra_headers": {"X-Dao-Auth": auth},
        },
    } for i in range(N)
]
router = Router(model_list=model_list, routing_strategy="least-busy")
```

### 8.4 health 巡检 (本地一字 · 0 ACU)

```pwsh
.\一笔便活.ps1 -Action probe -All     # 巡 N 件 · 5s timeout/件 · 出 alive 列
```

──────────────────────────────────────────────

## 九 · 池态去中心化 (★ 印 125 反五 · 印 128 借桥)

> 「**江海所以能为百谷王者，以其善下之**」 ──《老子》六十六

**真意**: 主公本地宕之 · vm_pool.json 即丢 · 反代池失 truth source。`vm_pool_anycast` 反此 —— 推池态至 N alive VM 之公网 URL · 主公任设备 (异地 PC / 手机 / 任浏览器) GET 即得全池真态。

### 9.1 主公一字推 (借桥)

```pwsh
# 路 1 · 一笔便活.ps1
.\一笔便活.ps1 anycast-publish        # 推全 alive · 出 N anycast URLs

# 路 2 · 直调桥
cd ..\00_本源\_VM底层桥
.\vm_anycast.cmd publish              # 推 → 出 anycast URLs
.\vm_anycast.cmd status               # 列 anycast URLs (主公可 share)
.\vm_anycast.cmd rotate               # 探 + 自切到先活
```

### 9.2 主公任设备拉 (公网真访)

```pwsh
# 主公手机 / 异地 PC / 任浏览器
curl https://x.trycloudflare.com/_/file/home/ubuntu/dao_pool_anycast.json

# 或本机 node 拉合
node vm_pool_anycast.js pull --from <anycast-url>
```

**真兑**: 主公 PC 关机 → 池态在 N alive VM 上 · 异地仍可 GET → 配 SDK base_url 即可继续消费。

──────────────────────────────────────────────

## 十 · 公网入口备路 (★ 印 125 反一 · 印 128 借桥)

> 「**反者道之动也，弱者道之用也**」 ──《老子》四十

**真意**: omni URL 经 Devin ingress (`*.devinapps.com`) · Devin 服宕则全死。`vm_public_tunnel` 反此 —— 各 VM 自暴 cloudflared / serveo 公网 URL · 不依 Devin · 0 注册 0 token · Devin 宕亦活。

### 10.1 主公一字暴 (借桥)

```pwsh
# 路 1 · 一笔便活.ps1
.\一笔便活.ps1 tunnel-up              # 各 alive VM 暴 cloudflared

# 路 2 · 直调桥 (含选项)
cd ..\00_本源\_VM底层桥
.\vm_tunnel.cmd up --all              # 全 alive 暴
.\vm_tunnel.cmd up --idx 0 --mode serveo   # 备选 serveo (SSH · 无需 install)
.\vm_tunnel.cmd status                # 列各 VM 之 *.trycloudflare.com URL
.\vm_tunnel.cmd probe                 # 探各 URL 真活
```

### 10.2 SDK 之双入口 (主公备路)

```python
# 备路: tunnelUrl (Devin) ↔ publicTunnelUrl (cloudflared)
import os
PUB = os.environ.get('DAO_PUBLIC_TUNNEL', '')   # *.trycloudflare.com
DEV = os.environ.get('DAO_VM_URL', '')          # *.devinapps.com

base = PUB if PUB else DEV   # 优先 cloudflared (Devin 宕亦活)
client = OpenAI(
    base_url=f"{base}/port/7780/v1",
    api_key="placeholder",
    default_headers={"X-Dao-Auth": auth},
)
```

**真兑**: Devin Cloud 服宕 (历测 30-60 min cf drift) → 主公仍可走 cloudflared URL → 0 中断。

──────────────────────────────────────────────

## 十一 · 健诊 (★ 印 126 三 · 印 128 借桥)

> 「**不知不知 · 病矣 · 圣人之不病 · 以其病病也 · 是以不病**」 ──《老子》七十一

**真意**: 反代池累 38+ 件 vm_*.{js,cmd,html} (印 104-127) · 主公无法一笔知健。`vm_dao_doctor` 自动扫之 · syntax + .cmd wrapper + state file + daemon log + Node 内置 deps · 道法自然不预定 catalog。

### 11.1 主公一字诊 (借桥)

```pwsh
# 路 1 · 一笔便活.ps1
.\一笔便活.ps1 doctor                 # 默 · 全诊

# 路 2 · 直调桥
cd ..\00_本源\_VM底层桥
.\vm_doctor.cmd                       # 全诊 · 0 issue 即"全件健"
.\vm_doctor.cmd --quiet               # 仅出问题
.\vm_doctor.cmd --json                # CI/CD 可用
```

**何时用**: 主公升级新版 vm_*.js 后 · 主公新加 token / 删件后 · 反代池久未跑 (~24h+) 检查。

──────────────────────────────────────────────

## 十二 · 一笔总观 (★ 印 127 道四 · 印 128 借桥)

> 「**圣人执一，以为天下牧**」 ──《老子》二十二
>
> 「**万物归焉而弗为主**」 ──《老子》三十四

**真意**: 14+ 件 .cmd 各报各 · 主公无总观。`vm_dao_overview` 归一 · 10 节 (accounts/pool/tunnels/kvm/udp/anycast/genesis/archive/mesh/orchestrator) · ~50ms 出。

### 12.1 主公一字观 (借桥)

```pwsh
# 路 1 · 一笔便活.ps1
.\一笔便活.ps1 overview                          # quick · 10 节 ~50ms
.\一笔便活.ps1 overview -BridgeArgs '--full'     # 含真探活
.\一笔便活.ps1 overview -BridgeArgs '--json'     # CI/CD 可

# 路 2 · 直调桥
cd ..\00_本源\_VM底层桥
.\vm_overview.cmd                                # 默 quick
.\vm_overview.cmd --section pool                 # 仅一节
.\vm_overview.cmd --json                         # JSON 输出
```

### 12.2 10 节之意

| 节 | 何为 | 反代之得 |
|----|------|---------|
| accounts | 71 号大同盟之 fresh/used/dead 数 | 主公知"还有几号可用" |
| pool | 反代 VM 池 alive 数 + sessionId + ttl | 主公知"反代真活几件" |
| tunnels | 各 alive 之 publicTunnelUrl + 状 | 主公知"备路几件" |
| anycast | anycast 池态 URLs + 推时 | 主公知"任设备访问可" |
| genesis | termbin root URL + 历代链 | 主公知"道纪长存" |
| mesh | 跨 VM 联通态 | 主公知"协作可" |
| orchestrator | 真载分布 + 推荐之 next dispatch | 主公知"打哪 VM 闲" |
| kvm/udp/archive | inner VM/UDP relay/disk archive (不日常) | (用之少) |

──────────────────────────────────────────────

> 「**圣人无积，既以为人己愈有；既以予人，已愈多**」 ──《老子》八十一

*主公一 client 配置 → 公网四协议任用 → 51 模 (含 thinking) 真活 → N VM 大并发*
