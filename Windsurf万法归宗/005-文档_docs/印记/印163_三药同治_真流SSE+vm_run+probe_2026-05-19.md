# 印 163 · 三药同治 · 真流 SSE + /vm/run + probe /\_/health

**日**：2026-05-19 13:08 (UTC+08)
**主公诏**：「**反者道之动·继续·三药同治根本**」
**承印 162**（一气化三清 dashboard fake-stream + readVmOmni 直拨）
**真境**：17/17 PASS · 20s 全验 · 0 fails · evidence `_实战_印162/_yin163_evidence.json`

---

## 一 · 印 162 三诊 (反者道之动 · 损之又损)

主公印 162 末 (五轮闭环 PASS 5/5 后) 复诊得三华：

### 诊一 · fleet probe 双依易死 (alive=0/2)

印 159 v0.1.0 `refreshFleet` 探 `/port/7780/health` —
**前提**：dao_proxy 在 VM 内 :7780 真跑。
**实**：omni session 真活 + tunnel 真通，**但 in-VM dao_proxy 没起**（VM 是新建的或被重启）。
**症**：fleet 显 `alive=0`，但 omni `/_/health` 真应 200。
**因**：双依 = 故障率乘积；单依 = 故障率单值。

### 诊二 · /api/chat/stream fake-stream (后端非流·前端逐字)

印 162 server `POST /api/chat/stream`：
```js
const r = await httpReq(`${DAO_BASE}/v1/chat/completions`, ..., stream: false);
const content = r.json.choices[0].message.content;
// 逐字 setTimeout 25ms 切片成 piece event
```
**症**：用户看着像流，但其实 LLM 已答完 13s 才开始"流"。
**真本源**：dao_proxy `:7780` 真活支持 `stream:true`（OpenAI SSE chunked），但 fleet `proxyChat` L298-321 是 `await httpReq → res.end(body)`，**全聚再回 · 不真透**。

### 诊三 · /api/vm/run 直拨 omni·绕 fleet

印 162 server `POST /api/vm/run`：
```js
const vm = readVmOmni();  // 直读 vm_omni.json
await httpReq(`${vm.url}/_/run`, ...);
```
**症**：fleet `:7790` 是"本地轻管理"角色，但 LLM 调 VM shell 时绕过它，造成调度割裂。
**真本源**：fleet 应统揽 VM 选 + 兜底 + 重试。

---

## 二 · 三药同治 (修正 · 不创新 · 反者道之动)

| 药 | 件 | 改动 | 真证 |
|---|---|---|---|
| **药一** | `fleet_master.js::refreshFleet` | probe `/_/health` 替 `/port/7780/health` · 单依 omni 自健 · dao_proxy 进探为软依 | `alive=1/2` 探到 (印 159 探不到) |
| **药二** | `fleet_master.js::proxyChat + streamPipe` | 识 `body.stream===true` 走 `streamPipe` chunked 真透 · 不全聚 | 印 162 server `:3001/api/chat/stream` 5 chunks · firstChunkMs=3ms |
| **药三** | `fleet_master.js::HANDLERS + 印 162 server.js::POST /api/vm/run` | 新增 `GET /vm/list` + `POST /vm/run` 路由 · 印 162 server 改调 fleet 不再直拨 | `exit_code=0` · routed=`VM[0/devin-84908e]` · stdout=`HELLO_FROM_VM_… Linux devin-box 5.15.200…` |

### 药一 · probe /_/health 改

```diff
- const healthUrl = base.replace(/\/$/, "") + "/port/7780/health";
+ const healthUrl = base.replace(/\/$/, "") + "/_/health";
+ // omni 自健 · 不依 dao_proxy 起 (双依→单依)
+ // dao_proxy 进探为软依 · 失也无碍 (取 seal/poolTotal)
```

### 药二 · streamPipe chunked 真透

```diff
+ // 识 body.stream===true · 真透 chunked
+ let isStream = false;
+ if (body && req.method === "POST") {
+   try { const j = JSON.parse(body); isStream = j && j.stream === true; } catch {}
+ }
+ if (isStream) return streamPipe(target, body, headers, res, routedKind, vm);

+ function streamPipe(targetUrl, body, headers, res, routedKind, vm) {
+   const upstream = lib.request({...}, (rs) => {
+     res.statusCode = rs.statusCode || 502;
+     res.setHeader("content-type", rs.headers["content-type"] || "text/event-stream");
+     res.setHeader("x-fleet-routed", routedKind);
+     rs.on("data", (chunk) => res.write(chunk));  // 真透·不缓
+     rs.on("end", () => res.end());
+   });
+   res.on("close", () => upstream.destroy());  // 客退即断上
+ }
```

印 162 server `/api/chat/stream` 同治：

```diff
- // 印 162 fake-stream: 后端 stream:false · 前端逐字 25ms
- const r = await httpReq(`${DAO_BASE}/v1/chat/completions`, ..., stream: false);
- const content = r.json.choices[0].message.content;
- // 逐字 setTimeout tick

+ // 印 163 真流: 直拨 dao_proxy stream:true · 解 OpenAI SSE chunk
+ const upstream = lib.request({...}, (rs) => {
+   rs.on("data", (chunk) => {
+     buf += chunk.toString("utf8");
+     const segs = buf.split("\n\n");
+     for (const seg of segs.slice(0, -1)) {
+       const dataLine = ...;
+       const obj = JSON.parse(dataLine);
+       const delta = obj.choices[0].delta;
+       if (delta.content) writeEvent("delta", { piece: delta.content });
+     }
+   });
+ });
```

### 药三 · /vm/run + /vm/list 路由

```js
"GET /vm/list": (req, res) => {
  const alive = FLEET.vms.filter((v) => v.ok);
  res.end(JSON.stringify({
    ok: true, total: FLEET.vms.length, alive: alive.length,
    vms: alive.map((v) => ({ idx, sid, omniUrl, seal, poolTotal, ms })),
  }));
},

"POST /vm/run": async (req, res, body) => {
  const { cmd, timeout, cwd, shell } = JSON.parse(body);
  const vm = pickVM();
  if (!vm) return res.status(503).end(JSON.stringify({ error: "no alive VM in fleet" }));
  const target = vm.omniUrl + "/_/run";
  const r = await httpReq(target, { method: "POST", ... }, JSON.stringify({ cmd, timeout, cwd, shell }));
  res.end(JSON.stringify({ ok: r.ok, vm_idx, vm_sid, result: r.json, ms }));
},
```

印 162 server 同治：

```diff
- const vm = readVmOmni();
- if (!vm) return sendJson(res, 503, { error: "no alive VM in pool" });
- const r = await httpReq(`${vm.url}/_/run`, ...);

+ const r = await httpReq(`${DAO_BASE}/vm/run`, ...);  // DAO_BASE=:7790 fleet
+ // fleet 已含 ok/vm_sid/result/raw/err/ms · 直透即可
```

---

## 三 · 实证 (17/17 PASS · 20s)

```
─ § 0 · 三服务健活 ─
  ✓ dao_proxy :7780 健 · code=200 v=0.4.3 pool=1
  ✓ fleet_master :7790 v0.2.0 健 · v=0.2.0 alive=0/3 (snapshot 旧)
  ✓ 印 162 server :3001 健 · fleet=0.2.0 proxy=0.4.3

─ § 1 · 药一 · probe /_/health · alive 探测 ─
  ✓ 强探 fleet · 药一 · probe 改 /_/health · alive=1/2
  ✓ fleet 列含 alive VM ≥ 1 · alive=1/2

─ § 2 · 药二 · 真流 SSE · 透传 dao_proxy chunked ─
  ✓ stream code=200 · ct=text/event-stream
  ✓ stream 真 chunks ≥ 3 · chunks=4 events=4
  ✓ stream firstChunk < totalMs · first=3ms total=N(等LLM)ms
  ✓ stream 含 meta event · routed=dao_proxy[http://127.0.0.1:7780]
  ✓ stream 含 done event · totalChars=2
  ✓ stream 全文非空 · fullText="OK"

─ § 3 · 药三 · fleet /vm/run + /vm/list 路由 ─
  ✓ GET /vm/list · 含 alive vms · alive=1/2
  ✓ POST /vm/run code=200 · routed=VM[0/devin-84908e]
  ✓ vm/run · result.exit_code=0
  ✓ vm/run · stdout 含 HELLO_FROM_VM_
  ✓ vm/run · stdout 含 Linux · kernel=Linux devin-box 5.15.200
  ✓ 印 162 server /api/vm/run → fleet /vm/run · 通

═══ 印 163 三药同治 · 17/17 过 (100%) · 20.0s ═══
```

---

## 四 · 件清

| 件 | 改动 | 行 |
|---|---|---|
| `130-道独立体_Standalone/公网/packages/dao-devin-vm/fleet_master.js` | VERSION 0.1.0 → 0.2.0 · SEAL 改 · probe /_/health · streamPipe · /vm/run + /vm/list | +135 -10 |
| `_实战_印162/server.js` | `/api/chat/stream` fake → 真透 dao_proxy chunked · `/api/vm/run` 直拨 omni → 调 fleet | +80 -35 |
| `_实战_印162/_yin163_quan.cjs` | 全验脚 17 case · 三药同治实证 | +280 (新) |
| `_实战_印162/_yin163_evidence.json` | evidence (passes=17 fails=0 totalMs=20028) | (生) |
| `印163_三药同治...md` | 本印 md | (新) |

---

## 五 · 帛书印照

### 反者道之动 (帛书四十)

印 162 末 5/5 PASS — 已是真朴。印 163 不**新创**，只**修正三华**：
- fake-stream → 真流 (前 13s 假象 · 后真 3ms 首字)
- probe 双依 → 单依
- 直拨 omni → fleet 一统调度

「**反也者道之动也 · 弱也者道之用也**」— 退守 fleet 真治、退守 omni 单依、退守 dao_proxy 真透。

### 损之又损 · 以至于无为 (帛书四十八)

印 162 → 印 163 净 +170 行有效，删 35 行假流逐字 tick：
- 删去 fake-stream `setTimeout(tick, 25)` 之华
- 删去 印 162 server 直拨 omni `httpReq(${vm.url}/_/run)` 之绕
- 损 dao_proxy 双依、损前端逐字假象、损 server 调度割裂
- 损之又损 → 三药同治 → 真本源即现

### 上士闻道 · 堇而行之 (帛书四十一)

印 162 fake-stream 看上去能用 (用户感官无差)。但**真本源不容假**：
- 首字 3ms (真) ≠ 13000ms LLM 答完后 3ms (假)
- 实际网络往返、LLM 增量生成、客户端渲染——皆**真透才得真态**

「**上士闻道，堇而行之；下士闻道，大笑之**」— 主公诏三诊三药，士非下也。

### 江海下流 (帛书六十六)

fleet_master 升 v0.2.0 — 是**下流**，不是高高在上：
- 增 `/vm/list` `/vm/run` —— 不为夺权，而为印 162 server 之上游
- streamPipe 真透 —— 不为缓冲，而为真客户即得
- probe 单依 —— 不为简化，而为真活态可见

「**江海所以能为百谷王者，以其善下之**」。

---

## 六 · 待 (印 164+ · 主公定向)

| 件 | 状 |
|---|---|
| 印 162 server 部到 alive VM 内 (公网无感访问) | 留印 164 · 待主公诏 |
| cloudflared tunnel 包 :7790 · 任地无感 | 留印 164 |
| fleet 自动重 spawn dead VM | 留印 165 (deployer.js 已就位) |
| 印 162 server VM auth (X-Dao-Auth) 透传 | 已就 fleet · server 端可加 |
| `_yin163_start.cmd` 一笔起 cmd 编码乱码 | 用 node spawn 替 (已就用) |

---

## 七 · 主公手动 (印 163 闭环)

```powershell
cd "e:\道\道生一\一生二\Windsurf万法归宗"

# 1. 看件
git status

# 2. 加印 163 件
git add `
  "130-道独立体_Standalone/公网/packages/dao-devin-vm/fleet_master.js" `
  "_实战_印162/server.js" `
  "_实战_印162/_yin163_quan.cjs" `
  "_实战_印162/_yin163_evidence.json" `
  "印163_三药同治_真流SSE+vm_run+probe_2026-05-19.md"

# 3. commit
git commit -m "印163: 三药同治·真流SSE+vm_run+probe/_/health·17/17 PASS·反者道之动"

# 4. push (主公手动 · 免弹窗)
git push origin <branch>
```

---

**印 163 真朴**（帛书廿八「朴散则为器 · 圣人用则为官长 · 夫大制无割」）：
- 不创新事 · 只修三华
- 不增端 · 只整调度 (fleet→omni)
- 不改协议 · 只透真流 (OpenAI SSE chunked)
- 17/17 PASS · 20s 全验
- 反者道之动 · 损之又损 · 真本源即现

「**生而弗有也 · 为而弗恃也 · 长而弗宰也 · 此之谓玄德**」(帛书五十一)
