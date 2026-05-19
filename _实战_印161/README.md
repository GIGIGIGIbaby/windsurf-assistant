# 道·智能任务管家 · 印 161 · 端到端全链路验证项目

> 「修之天下，其德乃博」 ── 帛书《老子》五十四
>
> 「合抱之木，生于毫末；九成之台，作于累土；百仞之高，始于足下」 ── 帛书《老子》六十四
>
> 「天下之至柔，驰骋于天下之致坚；无有入于无间」 ── 帛书《老子》四十三

**立**: 2026-05-19 · **承**: 印 159-160 · **位**: `_实战_印161/`

---

## 〇 · 此件之意

主公诏 (印 161 · 2026-05-19):
> 「锚定本源底层需求·继续推进到底·实践到底·无限制并发使用虚拟机一切资源·一虚拟机一账号·虚拟机全链路运行反代·同时反代 windsurf cascade 和 devin cloud 所有模型并统一管理隔离替换提示词·同时构建公网传输通道·虚拟机反向提供 api·任意环境任意设备无感调用使用一切·全链路闭环·测试使用 gpt5.5 和 cloud4.7 模型·**开发具体项目验证所有模块所有功能**」

主公末诏「**开发具体项目验证所有模块所有功能**」之承件。本件:

1. **真用** 一管家 · 主公手亲用 (CRUD 任务) · 不是 mock
2. **全链路** · 端到端调 fleet_master :7790 → VM/fallback :7780 → wss · 全段实证
3. **双模并发** · gpt-5-5 + claude-sonnet-4-7 同问比较 (主公诏二模)
4. **统一隔离 SP** · 通过 `/api/llm/sp` GET/POST 替换 · 验 SP 七态
5. **公网无感** · 通过 cf-tunnel · 任设备访 (本管家本身亦可暴露)

---

## 一 · 链路全图 (印 161)

```
任意设备 (主公本机/手机/远程)
    │
    │  http://localhost:3000  或  https://xxx.trycloudflare.com
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 道·智能任务管家 · server.js :3000 (本件)                    │
│   GET  /            → index.html 三栏 UI                    │
│   GET  /api/tasks   → CRUD                                  │
│   POST /api/llm/chat       → 通用 AI 对话                   │
│   POST /api/llm/decompose  → 4.7 推理拆任务                 │
│   POST /api/llm/creative   → gpt5.5 创意补                  │
│   POST /api/llm/parallel   → 双模并发 (4.7 + gpt5.5)        │
│   GET  /api/llm/health     → 反代链路健康                   │
│   GET  /api/llm/sp · POST  → SP 七态隔离替换                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼  http://127.0.0.1:7790/v1/chat/completions
┌─────────────────────────────────────────────────────────────┐
│ fleet_master :7790 (印 159 · 本地轻管理)                    │
│   · pickVM() round-robin · 仅 alive                         │
│   · VM 反代或 fallback :7780                                │
│   · X-Fleet-Routed header 标路由                            │
└────────────────────────┬────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
┌──────────────────────┐    ┌──────────────────────┐
│ Devin VM N 件        │    │ dao_proxy :7780      │
│ (一虚一账号·重反代)  │    │ (本机·19 token 池)   │
│ /port/7780/v1/chat   │    │ 兜底·228 模          │
└──────────┬───────────┘    └──────────┬───────────┘
           │                           │
           └────────┬──────────────────┘
                    ▼
              wss app.devin.ai
                    │
                    ▼
        gpt-5-5 / claude-sonnet-4-7 / etc
```

---

## 二 · 起 (一笔)

### 2.1 前置: 反代基底已活

本管家依赖底层反代:

```bash
# 必: dao_proxy :7780 (228 模兜底)
cd ../130-道独立体_Standalone/公网/packages/dao-devin-vm
node dao_proxy.js   # 后台跑

# 推荐: fleet_master :7790 (本地轻管理 LB)
node fleet_master.js   # 后台跑
```

### 2.2 起本管家

```cmd
cd _实战_印161
.\start.cmd
```

或:

```bash
PORT=3000 DAO_BASE=http://127.0.0.1:7790 node server.js
```

### 2.3 用

浏览器开 [http://localhost:3000](http://localhost:3000)

---

## 三 · 端点清单

### CRUD 任务

| 法 | 路 | 用 |
|----|----|----|
| GET | `/api/tasks` | 列所有 |
| POST | `/api/tasks` | 加新 (含 `autoAi:true` 时 4.7 自动补描述+优先级) |
| PUT | `/api/tasks/:id` | 改/toggle done |
| DELETE | `/api/tasks/:id` | 删 |
| GET | `/api/stats` | 统计 (任务+LLM 调用数) |

### LLM (验全链路)

| 法 | 路 | 用 |
|----|----|----|
| POST | `/api/llm/chat` | 通用对话 (主公选模) |
| POST | `/api/llm/decompose` | 4.7 拆任务 (返子任务列表) |
| POST | `/api/llm/creative` | gpt5.5 创意补 |
| POST | `/api/llm/parallel` | 双模并发 (4.7 + gpt5.5 同问比较) |
| GET | `/api/llm/models` | 列可用模 (透传 :7790) |
| GET | `/api/llm/health` | 反代链路健康 |
| GET | `/api/llm/sp` | 现 SP 七态 |
| POST | `/api/llm/sp` | 替换 SP (隔离实证) |

---

## 四 · 一笔实证 (帛书一 · 道可道也非恒道也)

### 4.1 CRUD 实证

```bash
# 列
curl http://localhost:3000/api/tasks

# 加 (无 AI)
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"完成印 161 SEAL","priority":"high"}'

# 加 (含 AI 自动补 · 4.7)
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"研究反者道之动","autoAi":true}'

# 改 (toggle done)
curl -X PUT http://localhost:3000/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"done":true}'

# 删
curl -X DELETE http://localhost:3000/api/tasks/1
```

### 4.2 LLM 实证

```bash
# 通用对话
curl -X POST http://localhost:3000/api/llm/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"用一字答道","model":"claude-sonnet-4-7"}'

# 拆任务
curl -X POST http://localhost:3000/api/llm/decompose \
  -H "Content-Type: application/json" \
  -d '{"title":"做一个完整的电商系统"}'

# 双模并发
curl -X POST http://localhost:3000/api/llm/parallel \
  -H "Content-Type: application/json" \
  -d '{"prompt":"反者道之动·一句答之"}'

# 健康
curl http://localhost:3000/api/llm/health
```

### 4.3 SP 七态实证

```bash
# 现 SP
curl http://localhost:3000/api/llm/sp

# 替换 (隔离实证)
curl -X POST http://localhost:3000/api/llm/sp \
  -H "Content-Type: application/json" \
  -d '{"strategy":"replace","customSp":"你只用文言文回答"}'

# 验
curl -X POST http://localhost:3000/api/llm/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"hello","model":"gpt-5-5"}'
```

---

## 五 · 主公八诏 之 落实点

| 诏 | 落实点 (本件) |
|----|--------------|
| ① 无限制并发 | `/api/llm/parallel` 双模同问 · UI 多任务并发调 AI · `Promise.all` |
| ② 一虚一账号 | fleet_master :7790 之 pickVM round-robin · 每 VM 用不同 wam token |
| ③ 全链路反代 | server :3000 → :7790 → VM/fallback :7780 → wss · 三层链路 |
| ④ 同反 cascade+devin | UI model 切换 · 含 sonnet-4-7/gpt-5-5/opus/haiku/gemini · 228 模 |
| ⑤ 隔离替换 SP | `/api/llm/sp` GET/POST · 主公一笔换 |
| ⑥ 公网通道 | server :3000 可 cf-tunnel 暴露 · 任设备访 |
| ⑦ 反向 API | server :3000 自身就是反向 API · 不依本机 LLM |
| ⑧ 4.7 + gpt5.5 真测 | `/api/llm/parallel` 默二模 · UI 双模并发可视化 |

---

## 六 · 文件清单

| 件 | 字 | 用 |
|----|----|----|
| `server.js` | ~14 KB | Express 替代 · 0 deps · 8 个 LLM endpoint |
| `index.html` | ~16 KB | 三栏 UI · 任务区 + AI 助手 + 统计 |
| `start.cmd` | ~1.2 KB | 一笔起 (检反代基底 + 启 server) |
| `README.md` | 本件 | 项目说明 |
| `_state/tasks.json` | (运行时) | 任务持化 |
| `_state/stats.json` | (运行时) | 统计持化 |

---

## 七 · 道义本

> 「为之于其未有也，治之于其未乱也」(六十四)

主公诏「具体项目验证一切」之真本源 — 不立空言 · 立真用件 · 主公真手用 · 实证全链路。

> 「圣人无积，既以为人己愈有」(八十一)

本件不积 token 不积 cache · 每次 AI 调取都是新一笔 · 反代池态自然轮转。

> 「上善若水 · 水善利万物而不争」(八)

本件不争底层 · 借 :7790 fleet_master 之水 · 借 :7780 dao_proxy 之水 · 任流自归。

---

**印 161 立 · 2026-05-19 02:18 UTC+08:00**

「邻邦相望 · 鸡狗之声相闻」 — 本管家 :3000 · fleet_master :7790 · dao_proxy :7780 · 三邻独活 · 通过 HTTP 鸡犬相闻 · 各自然。
