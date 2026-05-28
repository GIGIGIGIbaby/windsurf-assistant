# vendor/ · 本源 (原片复用 · 不刻一字)

> 取之尽锱铢, 用之如泥沙 · **复用而非复刻** · 利而不害 · 无为而无不为

本目录**不含**重写代码。一切皆已有、成熟的本源资产，**原片复用**。

## 结构

```text
vendor/
├── README.md                    本档
└── wam/                         WAM 本源 (010 → 020 symlink)
    ├── extension.js             → 010-WAM 核心 (符号链接 · 0 byte = 未建链)
    ├── package.json             → 010-WAM 元数据 (符号链接)
    └── bundled-origin/          proxy 资产 (原片不改)
        ├── 源.js                ★ 零依赖 Node proxy (~90 KB)
        │                         · SP 置换 / 27 侧信道剥 / 主辅分槽
        │                         · query 剥离 (CHAT_PROTO 不误归 PASSTHROUGH)
        │                         · _traceRPC 环形缓冲 + /origin/rpc_trace 端点
        │                         · 自定义 SP 热改 (POST /origin/custom_sp)
        │                         · SSE /origin/stream
        ├── source.js            源.js ASCII 别名 (字节等 · sha256 同)
        ├── 锚.py                ★ 五层锚定 (~35 KB)
        │                         · L1 safeStorage(secret · DPAPI+AES-GCM)
        │                         · L2 ItemTable
        │                         · L3 native globalState
        │                         · L4 multi-publisher globalStates
        │                         · L5 settings.json
        │                         · anchor-all-globalstate (全用户)
        ├── anchor.py            锚.py ASCII 别名 (字节等)
        ├── _dao_81.txt          道德经 81 章 (~19 KB · 6776 字)
        └── VERSION              版本 + sha256-16 + size 指纹
```

## 归属

| 路径 | 来源 | 许可 |
|---|---|---|
| `wam/extension.js` | [`zhouyoukang/windsurf-assistant`](https://github.com/zhouyoukang/windsurf-assistant) | MIT |
| `wam/bundled-origin/*` | 同上 · bundled-origin 三件套 | MIT |
| `wam/bundled-origin/_dao_81.txt` | 老子《道德经》王弼本 · 公版 | Public Domain |

## 运行期 (四步无中生有 → 至无不为)

1. `extension.js::ensureHot()` — 把 `bundled-origin/` 复制到 `~/.wam-hot/origin/` (size 幂等 · 不重复写)
2. `hijackStart()` — `spawn` `~/.wam-hot/origin/源.js` 作为反代进程 (默认 `:8889`)
3. `anchor()` — 调 `~/.wam-hot/origin/锚.py` 五层锚定 state.vscdb
4. `loadWamCore()` — `require` `wam/extension.js` 激活 WAM 切号引擎

**原片就地运行 · 零重写 · 利而不害**

## 三层根因 (proxy 真生效之根)

```text
L1 系统层 · ls-gate-patcher.js (在 dao-agi/ 而非 vendor/)
   解 windsurf-dao u() dev-mode 门禁 · 放行 codeium.* 配置读取

L2 账户层 · 锚.py anchor-all-globalstate
   全用户 state.vscdb 锚定 (含 secret + globalState)

L3 协议层 · 源.js classifyRPC
   query string 剥离 · pathOnly 后再正则
   CHAT_PROTO 不再误归 PASSTHROUGH
```

## 自定义 SP 热替换 (v18.5)

```text
源.js HTTP 控制面:
  GET    /origin/custom_sp     {has_custom, sp, chars, keep_blocks, source}
  POST   /origin/custom_sp     {sp, keep_blocks, source} → 落 ~/.wam-hot/origin/_custom_sp.json
  DELETE /origin/custom_sp     归道德经

invertSP 分叉:
  有 → [CUSTOM-SP-ACTIVE] 哨兵 + 自定义 SP + TAO_TRAILER + 留骨 (KEEP_BLOCKS)
  无 → 道德经 81 章 (本源默认)
```

## 符号链接 · WAM 010 → 020

```powershell
# 020 根
.\_setup_wam_link.ps1                  # 建链 (默认 -Fix)
.\_setup_wam_link.ps1 -Verify          # 校验 4 条 symlink
.\_sync_wam_core.ps1 -Watch            # 监 010 变更 实时推 020
```

若 `vendor/wam/extension.js` 为 0 字节 — 表示链接未建立。`deploy-dao-agi-179.ps1` 等部署脚本会**自动复制真实 WAM 文件**至远端。

## 不改之约 (守而不动)

- `源.js` / `source.js` / `锚.py` / `anchor.py` / `_dao_81.txt` — 原片不动 · 改在 `~/.wam-hot/origin/` 自副本
- `wam/extension.js` / `wam/package.json` — 010 之 symlink · 改 010 不改此

## 更新

| 资产 | 同步 |
|---|---|
| `wam/extension.js` | `_setup_wam_link.ps1` 重建 symlink · 或 `_sync_wam_core.ps1` |
| `wam/bundled-origin/*` | 020 根 `_sync_origin.js` (源.js → source.js → installed-ext + hot-dir) |

---

*道冲, 而用之或不盈 · 渊兮, 似万物之宗*
*挫其锐, 解其纷, 和其光, 同其尘 · 湛兮, 似或存*
