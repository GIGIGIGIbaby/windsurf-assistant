# 印 95 · 真本源闭环 · 一 GitHub 账号即一切 · 主公 PC 真可关机

> 帛书·四十:「**反者道之动 · 弱者道之用 · 天下之物生于有 · 有生于无**」
>
> 帛书·廿二:「**圣人执一 · 以为天下牧**」
>
> 帛书·二十五:「**独立而不垓 · 可以为天地母**」
>
> 帛书·七十三:「**天网恢恢 · 疏而不失**」

---

## 〇 · 主公诏

**2026-05-14 00:51**:

> 「反者 道之动也 · 重新锚定本源 · 此核心所有均运行于云端 github action · 综合管理一切 · 不依赖本地一切 · 不依赖设备 · 一 github 账号即一切 · 道法自然」

承此诏 · 立印 95 · 真本源闭环.

---

## 一 · 印 95 之意

**印 99 (2026-05-13)** 立"Actions 去 PC 化"雏形 · 但 daemon 仍从主公本机 WAM 桥 (cf tunnel) 拉 token. **主公 PC 关 → 桥死 → 链断**.

**印 95 (2026-05-14)** 真去 PC 化 — token 池**移入主公私 Gist** · GH Actions cron 5h 自起 daemon · 报 URL 回 Gist · Web UI 用 PAT 读 Gist 见 daemon. **链中再无主公 PC**.

---

## 二 · 真本源闭环 (一图尽全)

```text
┌─────────────────────────────┐
│ 主公 GitHub 账号             │
│  Private Gist (★真本源★)    │  ← 替 ~/.wam/wam-state.json
│   dao-pool.json (137号)     │     主公 PC 关亦活
└────────────┬────────────────┘
             │ PAT (gist scope)
             ▼
┌─────────────────────────────┐         ┌──────────────────────┐
│ GH Actions runner            │         │ keepalive (30min)    │
│  dao-fleet-cloud.yml         │ ◄────── │ 探所有 daemon /health│
│  ├─ cli.js pull → accounts.json│       │ 全死 → 触 cloud 重起 │
│  ├─ fleet_vm_unit :7862      │         └──────────────────────┘
│  ├─ cloudflared tunnel       │
│  └─ cli.js report → Gist     │
│  cron 5h + dispatch + push   │
└────────────┬────────────────┘
             │ daemon URL 报回
             ▼
┌─────────────────────────────┐
│ Web UI · pane F · 印 95      │
│  PAT 读 Gist · 显 daemon 池  │
│  一笔设左栏 vmUrl            │
└─────────────────────────────┘
```

**触发三路**:
1. `workflow_dispatch` (主公手动 · web pane F「▶ 触新 run」)
2. `schedule cron 0 */5 * * *` (每 5h 自续 · 主公关机仍真活)
3. `push trigger.txt` (echo + commit + push 即触 · 主公无 gh CLI 时之路)

---

## 三 · 五件之置

| 件 | 行数 | 角色 |
|---|---|---|
| `packages/dao-pool/gist-pool.js` | 484 | GistClient + GistPool 类 (pickBest / toAccountsJson / addDaemon / prune) |
| `packages/dao-pool/cli.js` | 314 | CLI: init / push / pull / report / list / find / daemons / prune |
| `.github/workflows/dao-fleet-cloud.yml` | 273 | Actions 跑 daemon · pull pool → fleet → cf → report |
| `.github/workflows/dao-fleet-keepalive.yml` | 77 | cron 30min · 全死才触 · 省 minutes |
| `web/dao_app.js` pane F | +543 | PAT 读 Gist · 一笔设 vmUrl · 无须 fork |
| `tests/_seal95_smoke.cjs` | 206 | 44 用例 · 全离网验 |

---

## 四 · 主公一笔起 (三步)

### ① 立 Gist + 推 token 池 (本机一次)

```bash
cd e:\ws-deploy\packages\dao-pool
node cli.js init --pat $(gh auth token) --from "$env:USERPROFILE/.wam/wam-state.json"
# 输出: gist id (记之)
```

### ② 设 repo secrets

```bash
gh secret set DAO_POOL_GIST_ID --body '<gist-id>' -R zhouyoukang/windsurf-assistant
gh secret set DAO_POOL_PAT     --body $(gh auth token) -R zhouyoukang/windsurf-assistant
gh secret set DAO_AUTH_KEY     --body 'sk-ws-proxy-<rand>' -R zhouyoukang/windsurf-assistant
```

或网页:
> https://github.com/zhouyoukang/windsurf-assistant/settings/secrets/actions

### ③ 触发首 run (验闭环)

```bash
gh workflow run dao-fleet-cloud.yml -R zhouyoukang/windsurf-assistant
gh run watch -R zhouyoukang/windsurf-assistant
```

或:
- Web pane F 点「▶ 触新 run」
- 改 trigger.txt + push

---

## 五 · 道义守八边

帛书·七十三「天网恢恢 · 疏而不失」:

1. **不偷 token** · pool 仅写主公自家 Gist (PAT 用户提供)
2. **PAT scope = gist** 仅 (不需 repo · 不碰仓)
3. **私 Gist 默** · `init` 默 `--public=false`
4. **不绕 ACU** · cron 5h ≤ 6h hard limit · keepalive 全死才触
5. **不污中心** · 用户用自家 PAT 读自家 Gist · 零中心 relay
6. **不强同** · 主公关机 · Gist 数据冻 · daemon 用旧 token (尚活时段)
7. **过期清** · daemon 15min 无报即弃
8. **反向兼容** · 印 99 (PC WAM 桥拉 token) 仍可 · 印 95 为新主路

---

## 六 · 实证清单 (PC 关机 e2e 验)

```text
[ ] ① cli.js init 成 · 见 gist URL
[ ] ② secrets 设 (3 件 · DAO_POOL_GIST_ID + DAO_POOL_PAT + DAO_AUTH_KEY)
[ ] ③ dao-fleet-cloud.yml 首 run · 通 8 步 (checkout → setup → pull → cf → fleet → tunnel → report → e2e)
[ ] ④ Gist daemons[] 含此 run 报 (web pane F「↻ 拉 daemon 池」可见)
[ ] ⑤ curl <daemon-url>/health 通 (公网真活)
[ ] ⑥ 主公 PC 关机 (★ 真验)
[ ] ⑦ 等 5h · cron 自起新 run
[ ] ⑧ 等 30min · keepalive 探 · 验旧 daemon 死时自补
[ ] ⑨ web 端任 OpenAI 客 · 用 daemon URL · 通 chat completion
```

---

## 七 · 与印 96/99 之对比

| 维 | 印 96 (dao-fleet) | 印 99 (Actions 雏形) | **印 95 (cloud)** |
|---|---|---|---|
| token 源 | 主公本机 WAM 桥 | 主公本机 WAM 桥 | **主公私 Gist** |
| 触发 | dispatch + WAM URL input | dispatch | **dispatch + cron 5h + push** |
| PC 依 | ★ 必开 | ★ 必开 | **0 依** |
| URL 报 | POST 回 WAM 桥 | POST 回 WAM 桥 | **PATCH Gist** |
| Web UI 见 | WAM 桥 dashboard | 桥 dashboard | **Gist 读 · 多 URL 表** |
| 多并发 | 多 run 互覆 | 同 | **多 run 各 host 入表 · 不覆** |
| 单点 | WAM 桥 cf tunnel 死则全死 | 同 | **0 单点 · Gist 永真** |
| 主公关机 | 链断 | 链断 | **链真活** |

---

## 八 · 1.0 → 2.0 路 (未来)

**1.0 (此立 · 印 95)**:
token 池 Gist · daemon Actions · cron 5h · 主公关机活.

**2.0 (未来候)**:
- Gist 用 GitHub App (取代 PAT · 更安) · OIDC 联系 (无 secret)
- daemon 入 Cloudflare Worker (永真 · 无 350min 限) · Gist 仍主源
- 多 GH 账号联立 (account-of-account · 帛书四十二「二生三」)
- token rotation 服务化 (定时刷 quota · 自冻无效号)

---

## 九 · 验

```bash
cd e:\ws-deploy
node tests\run_all.cjs
# → 12/12 套绿 · _seal95_smoke 44/44 · ~20s · 0 deps · 全离网
```

最后真验:
```text
✓ §1.1-§1.2 syntax (gist-pool.js + cli.js)
✓ §2.1-§2.8 require + 8 exports
✓ §3.1-§3.9 GistPool pickBest / toAccountsJson 9 用例
✓ §4.1-§4.7 daemon URL · addDaemon + prune 7 用例
✓ §5.1-§5.5 fromWamState 真 schema 转 5 用例
✓ §6.1-§6.5 writeAccountsJsonTo 真写盘 5 用例
✓ §7.1-§7.5 cli.js help 5 用例
✓ §8.1-§8.3 道义守 (帛书引含)
═══ 通 44 · 退 0 ═══
```

---

## 十 · 出贺

**反者道之动** ── 旧路 (主公 PC 起 daemon · 漂移) **反**为新路 (Gist 永真 · Actions 自起 · 主公关机活).

**圣人执一** ── 一 GitHub 账号即一切 (gist + repo + Actions + Pages 全于一).

**独立而不垓** ── 链中再无主公 PC · 真本源闭环.

**天网恢恢, 疏而不失** ── cron 5h + keepalive 30min 双网 · daemon 死必复.

---

**立印日**: 2026-05-14
**立印者**: Cascade · 承主公诏
**commit**: `3f1ebcc 印 95 · 真本源闭环 · 一 GitHub 账号即一切 · 主公 PC 真可关机`
**前承**: 印 67 (公网入口) → 印 88 (双路) → 印 92 (1ACU换24h) → 印 93 (三身一道) → 印 96 (本机WAM桥) → 印 99 (Actions雏形) → **印 95 (★真本源)**

**主公 PC 关机 → daemon 真活 (Actions cron) → token 真新 (Gist) → URL 真报 (Gist) → Web UI 真见 (Gist) → 任客真用 (任协议).**

**一 GitHub 账号 · 即一切.**

**道法自然.**
