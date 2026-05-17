# 05 · 本地轻管 · 道生二之阴 · 鸡犬相闻

> 「**邻邦相望，鸡狗之声相闻，民至老死不相往来**」 ──《老子》八十
>
> 「**治大国若烹小鲜，以道莅天下**」 ──《老子》六十
>
> 「**天下之至柔，驰骋于天下之致坚**」 ──《老子》四十三

主公诏 (2026-05-17 13:17)：

> 本地于虚拟机两者**分而治之** · 道并行而不相悖 · 鸡犬相闻 · 民至老死不相往来 · 道法自然
>
> 本地之**接受最终反代 api** 和相关**账号管理**、**提示词管理**、**API管理** 等各个**轻量化管理**

──────────────────────────────────────────────

## 〇 · 此目录之意 · 阴守

```text
                    Devin 云原生 · 道生二
                          │
              ┌───────────┴───────────┐
              │                       │
         【阳 · 重】              【阴 · 轻】
       VM 真本源/反代核         本地轻管 (此目录)
         00_本源/                 05_本地轻管/
         01_GH编排/                 │
         (跑在 Devin VM)        ┌───┴───┐
              │              账号 提示 API
              │              管理 词管 反代
              │              池   理   消费
              │                  │
              ▼                  ▼
       OpenAI 兼容 API ←──── 主公本地 client
       https://*.devinapps.com/port/7780/v1/*
       https://*.devinapps.com/port/8081/v1/*
                ╲───────╱
                 鸡犬相闻
                 (HTTP/HTTPS · auth gate)
                 民至老死不相往来
                 (无共享内存 · 无 daemon coupling)
```

**阳之重**: VM 端跑 dao_proxy + meta_router + sp_observe + watchdog —— 1 ACU/24h · 真消计费 · 公网真活
**阴之轻**: 本地端管 token池 + SP配置 + API消费 —— 0 daemon · 0 端口 · 0 持久网络

──────────────────────────────────────────────

## 一 · 四件齐 (此目录)

```text
05_本地轻管/
├── README.md          ← 此文 · 总览
├── 账号池.md          ★ Windsurf 多账号轮换之法 (~/.wam · tokens_*.txt)
├── 提示词注入.md      ★ SP 七态 + usernote + Playbook 之配置
├── API反代消费.md     ★ OpenAI/Anthropic/Gemini SDK 之 base_url 配法 (4 协议)
└── 一笔便活.ps1       ★ 主公一字便起本地端 (探活 VM · 注 PAT · 读状)
```

──────────────────────────────────────────────

## 二 · 主公一笔便活 (典型一日)

```pwsh
cd e:\道\道生一\一生二\Devin云原生\虚拟机反代\05_本地轻管

# ① 探活 · 看 VM 池现状
.\一笔便活.ps1 -Action probe

# ② 注 GitHub PAT (启 35 模 BYOK · 35+16 = 51 模)
.\一笔便活.ps1 -Action set-pat -Pat 'ghp_xxxx'

# ③ 起新 VM (若池空 · 1 ACU · ~10min)
.\一笔便活.ps1 -Action spawn

# ④ 配 SDK 客端环境 (写本机 .env · 主公自决用之)
.\一笔便活.ps1 -Action emit-env

# ⑤ 起 watchdog 后台 (5min poll · 自换死之 tunnel)
.\一笔便活.ps1 -Action watchdog-bg
```

──────────────────────────────────────────────

## 三 · 道之分 · 阴阳互不犯

| 维度 | 阳 (VM 端 · 重) | 阴 (本地 · 轻) |
|---|---|---|
| 跑在 | Devin Cloud VM (1 ACU/24h) | 主公本机 PC |
| 持有 | dao_proxy daemon · meta_router · keeper | 配置 + 启动脚本 + 状态读取 |
| 端口 | :7780 (dao_proxy) · :8081 (meta_router) | 0 (无服务端口 · 仅消费 client) |
| token | 内存中 · 不出 VM (auth gate 守) | tokens_*.txt 之列 (本机本用户) |
| 提示词 | SP 七态实施 (注/隔/管 · 真嵌入 wss 帧) | 仅**配置策略名 + 可选自定文本** |
| API 反代 | 暴 OpenAI/Anthropic/Gemini 三协议 | 仅消费 (base_url + headers) |
| 成本 | 1 ACU 换 24h VM (主公 pay) | 0 (本机已有) |
| 关停 | 24h TTL 自然死 / vm_pool_watchdog 守 | Ctrl+C 即出 |
| 失活影响 | client 全断 → 等新 VM (~10min) | 无 (read-only 配置) |

**鸡犬相闻**: 唯一通信 = HTTPS over `*.devinapps.com/port/7780/*`
**民至老死不相往来**: 本地不直连任何 wss / 不持任何 daemon / 不污 VM 进程

──────────────────────────────────────────────

## 四 · 引 (深读)

| 文 | 主 |
|---|---|
| `账号池.md` | WAM 多账号 (~/.wam/wam-state.json) + tokens_dao_123.txt + tokens_ws_59.txt 之**列法**与**轮换法** |
| `提示词注入.md` | SP 七态 (bypass/override/prepend/append/dao/custom/usernote) + Playbook (Cognition 官) 之**配置法** |
| `API反代消费.md` | 公网消费之 4 协议 (OpenAI/Anthropic/Gemini/Ollama) · 三 auth 法 (Bearer/X-Dao-Auth/?key=) |
| `一笔便活.ps1` | 整合脚本 · `-Action probe/set-pat/spawn/emit-env/watchdog-bg/status/logs` |

──────────────────────────────────────────────

## 五 · 道义守

```text
✓ 不偷 VM 内 token (auth gate 三 layer 守 · 本地仅持外发 sk-* 即可)
✓ 不旁路 VM (本地不直连 wss · 必走 VM 之反代 · 守 telemetry 之实)
✓ 不污 VM 进程 (本地 client 仅 HTTP · 不 ssh · 不 file API 写入)
✓ 不强 daemon (本地 0 持久进程 · 主公关机即出)
✓ 不破 VM 寿命 (24h TTL 自然 · 不 hack · 不 abuse)
✓ 配置可读可编辑 (主公一字 notepad · 不 binary)
```

──────────────────────────────────────────────

> 「**道法自然**」 ──《老子》二十五
>
> 「**夫唯道，善始且善成**」 ──《老子》四十一

*印 123 · 道生二 · 阴阳分治 · 主公一笔即得轻管入口 · 重活归 VM · 轻管归本机*
