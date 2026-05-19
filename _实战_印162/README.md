# 道·一气化三清 dashboard · 印 162

> 「反者道之动也·大曰逝逝曰远远曰反」(帛书四十/二十五)
>
> 「为学者日益·闻道者日损·损之又损·以至于无为·无为而无不为」(帛书四十八)

主公诏 (印 162)：**回归本源需求·实现不依赖本电脑之一切·一气化三清**

## 三清

| 栏 | 任 | 关 |
|----|----|----|
| 左 (1/4) | 云端 API + SP 管理 | 反代基底状·VM 池·SP 七态实时切·228 模列 |
| 中 (1/4) | WAM rtflow 切号 | 主公 ~/.wam 178 件·一键 active 切·原汤化原食 VM 工具 |
| 右 (1/2) | devin.ai 级 chat | gpt5.5/4.7 真测·SSE 流式·多轮上下文·思考链 |

## 一笔起步

```cmd
e:
cd "道\道生一\一生二\Windsurf万法归宗\_实战_印162"
start.cmd
```

→ 浏览器开 [http://localhost:3001](http://localhost:3001)

## 端点

| 法 | 路 | 用 |
|----|----|----|
| GET | `/` | 三栏 UI |
| GET | `/api/state` | 一汇总 (fleet+proxy+sp+vm+wam) |
| GET | `/api/wam/list` | 主公 ~/.wam 178 件 |
| POST | `/api/wam/use` | 切 active token |
| GET/POST | `/api/sp` | SP 七态 (bypass/override/prepend/append/dao/custom/usernote) |
| GET | `/api/sp/observe` | SP 注入观察 (近 16 笔) |
| GET | `/api/models` | 228 模 |
| POST | `/api/chat` | 普 chat |
| POST | `/api/chat/stream` | **SSE 流式 chat** (右栏用) |
| POST | `/api/vm/run` | 原汤化原食: VM shell 透传 |

## 反者之实

- **印 161** server.js 跑业务 (CRUD + LLM 真用 endpoint)
- **印 162** server.js 仅 gateway · 业务全在 VM 内 dao_proxy
- 「大曰逝逝曰远远曰反」── 远即返 · 不依赖本机即本机价值最大

## 端口分布

| 印 | 端 | 角 |
|----|----|----|
| :3000 | 印 161 任务管家 (CRUD demo) |
| :3001 | **印 162 一气化三清 dashboard** |
| :7780 | dao_proxy (本机 fallback) |
| :7790 | fleet_master (LB → VM/fallback) |
| 公网 cf | `https://liable-public-wise-structured.trycloudflare.com` → :7790 |
| VM omni | `https://...devinapps.com/port/7780/` → VM 内 dao_proxy |

## 实证

```
node _yin162_quan.cjs
# → _yin162_evidence.json
```

测口: state · wam · models · sp 七态 · 普 chat (4.7+gpt5.5) · SSE 流式 chat (4.7+gpt5.5) · 公网 cf

## 依

| 件 | 何 |
|----|----|
| `dao_proxy.js` | VM 内 (印 122/130) · 真反代 LLM |
| `fleet_master.js` | 本机 :7790 (印 159) · LB → VM/fallback |
| `vm_omni.js` | 本机 (印 104+157) · spawn VM + tunnel |
| `vm_proxy_deploy.js` | 本机 (印 106) · 装 dao_proxy 入 VM |
| `_state/vm_pool.json` | VM 池 (本机) |
| `~/.wam/wam-state.json` | 主公真号池 178 件 (本机·读) |

## 道义本

> 「上士闻道·堇而行之」(帛书四十一)
>
> 主公诏「**实现不依赖本电脑**」之真本源 — 反代基底全在 VM 内 · 本机仅留**轻量 dashboard** · 关之即停 · 真反代仍真活。

> 「邻邦相望·鸡狗之声相闻·民至老死不相往来」(帛书八十)
>
> 三栏并立 · 左中右各自然 · 通过 HTTP 接而不强 · 各栏互不依 · 任栏故障不损余 · 道法自然。

---

**印 162 · 2026-05-19 · 反者道之动 · 道·一气化三清**
