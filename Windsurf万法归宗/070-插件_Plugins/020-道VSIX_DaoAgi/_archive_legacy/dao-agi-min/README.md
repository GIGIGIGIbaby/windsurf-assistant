# 道Agent · 极简 (dao-agi-min) · v20.0

> **反者道之动, 弱者道之用. 天下万物生于有, 有生于无.** —《道德经 · 第四十章》
>
> **为学日益, 为道日损. 损之又损, 以至于无为. 无为而无不为.** —《道德经 · 第四十八章》

## 一 · 是什么

**WAM 010 切号本体 + 进程内反代 SP 替换** 之二核归一.

```text
WAM 010 (vendor/wam/extension.js · 444 KB · 不改一字)         ← 切号 19 命令 + 切号面板
+ 反代 (vendor/wam/bundled-origin/源.js · 109 KB · 不改一字)   ← invert / passthrough 二态热切
+ 道德经 (vendor/wam/bundled-origin/_dao_81.txt · 19 KB)       ← invert 模式注入之本
─────────────────────────────────────────────────────────────────────
= dao-agi-min v20.0 · ~230 KB · 二核归一 · 道法自然
```

## 二 · v20.0 大归本源 (反者道之动)

### 砍 (隔离 v18.3.1 之实时提取 SP 模块 · 用户严令)

| 旧模块 | 大小 | 病 | 去因 |
|--------|------|----|------|
| `bensource.js` | 28 KB | PEB 内存扫 LS 进程 | 损 LS / 卡 IDE / 不稳定 |
| `assembler.js` | 10 KB | 本地数据块拼模 | 假近似 / 非真本源 |
| `essence-view.js` | 13 KB | 前端 SP 显示 | 依前二者 / 一并去 |
| `锚.py` (五层锚) | 32 KB | DPAPI/secret/vscdb 多层改写 | 副作用大 / Python 依赖 |
| `ls-gate-patcher.js` | - | 改 windsurf-dao u() | 全机瘫风险 |
| `_water_virtues.js` | 17 KB | 选举/降频/熔断 | 进程内化后无须 |
| `isolator.js` / `watcher.js` | - | workspace 6套隔离 / 五层事件守 | 多余 / 着相 |

**砍 v18.3.1 之 195 KB 自源码 + 多余 vendor · 留 二核.**

### 立 (wam + proxy · 反代替换提示词本体 · v18.0+ 痛史教训之集成)

| 留 | 来源 | 旨 |
|----|------|----|
| `vendor/wam/extension.js` (444 KB) | WAM 010 本体 | 切号 19 命令 (不改) |
| `vendor/wam/bundled-origin/源.js` (109 KB · v18.0+ start API) | 进程内反代 | invert / passthrough 二态 SP 替换 |
| `vendor/wam/bundled-origin/_dao_81.txt` (19 KB) | 道德经八十一章 | invert 注入之本 |
| `extension.js` (~37 KB) | 本壳 (薄) | 进程内 require + start · settings.json 单一锚 |

### 旨 (道法自然 · 无为而无不为)

> **旧路** (v17.x 实时读): 扫 LS 内存 / 调 LS-RPC / 拼本地数据 → 不可尽 · 多病
>
> **今路** (v20.0 反代换): **截** SP (LS 经反代发) → **换** SP (替道德经 · invert) → **存** SP (持盘 `_lastinject.json`)
>
> "无有入无间, 吾是以知无为之有益. 不言之教, 无为之益, 天下希及之." —《第四十三章》

## 三 · 痛史教训集成 (v17.x → v18.x → v20.0)

| 阶 | 改 | 痛 | 治 |
|----|----|----|------|
| v17.x | spawn detached subprocess | 多 ext-host 共争 proxy · zombie · 须选举守护 | **进程内化** (v18.0+) `require + start({port,host})` · 共生死 |
| v17.x | 锚.py 六层 (secret + ItemTable + globalState×N + settings) | DPAPI race · 多手段冲突 · Python 依赖 · cryptography 必需 | **settings.json 单一锚** (v18.1+) 二键 (api+inference) · 无 Python |
| v18.0 | 默 invert | 首装即改 Cascade · 用户惊 | **默 passthrough** (v17.87+) 首装零侵入 · 锚归云 |
| v18.x | 三态 (off / invert / passthrough) | 第三态冗 · 用户惑 | **二态互斥** (v17.82+) 道 ⇄ 官 · 道官分而治 |
| v18.x | 固定端口 8889 | 多账号同机器抢端口 | **per-user FNV-1a hash** (v18.8+) 8889..8988 · 自然隔离 |
| v18.3.0 | 双重 _isUserOptedIn 闸 | 切号面板/SP提取皆空 | **删闸** (v18.3.1+) onView 触发即用户表意 |

## 四 · vs 历代 dao-agi

| 维 | dao-agi v18.3.1 | dao-agi-min v19.0.x | **dao-agi-min v20.0** |
|----|-----:|-----:|-----:|
| 自源码 JS | 195 KB · 12 物 | 52 KB · 3 物 | **37 KB · 1 物** |
| 反代 | in-process | 无 | **in-process** (require + start) |
| 锚 | 6 层 (锚.py) | 0 | **1 层** (settings.json 二键) |
| Python 依赖 | cryptography 强需 | 无 | **无** |
| LS Gate 补丁 | 有 | 无 | **无** |
| 自动更新 | jsdelivr | 无 | **无** |
| 水之四德 | 选举/降频/滚切/熔断 | 无 | **无** (进程内化后不需) |
| 实时 SP 观 | 四源 (PEB/LS/proxy/重建) | 二源 race | **/origin/preview 端点** (浏览器观) |
| 模式 | 三态 (off/invert/passthrough) | 三态 | **二态互斥** (道/官) |
| 端口 | 8889 固定 | 8889 固定 | **per-user hash** (8889..8988) |
| 入侵 | 高 | 零 | **极低** (settings 二键 · 无其他) |
| 命令 | 33 | 22 | **24** (含 WAM 19 + 反代 5) |
| VSIX 大小 | 387 KB | 164 KB | **230 KB** |

## 五 · 装

```powershell
# 构建 (需 Node 18+ 与 npx)
.\_build_vsix.ps1                  # 校验 + 打包
.\_build_vsix.ps1 -SyncAll         # 双同步 (WAM + 反代源 自活源 dao-agi)
.\_build_vsix.ps1 -InstallLocal    # 打 + 装本机
.\_build_vsix.ps1 -DryRun          # 仅校验

# 或手动
npx @vscode/vsce package --no-dependencies --allow-missing-repository -o dao-agi-min.vsix
windsurf --install-extension dao-agi-min-20.0.0.vsix
# Ctrl+Shift+P → "Reload Window"
```

### 依赖

- **Node 18+** (内置 vscode runtime · 无须额外装)
- **无 Python** (settings.json 单一锚 · 不需 锚.py / cryptography)

## 六 · 用

装后侧栏出 **"道Agent · 极简"** 容器, 内 2 视图:

### 6.1 道Agent · 模式 (dao.toggle)

```
┌────────────────────────────────────┐
│ 道法自然 · 无为而无不为            │
│ [🌊 道Agent]  [☁️ 官方Agent]       │
│ [🔬 自检]     [📜 日志]            │
│ 当前: 官方Agent · 直连云端         │
└────────────────────────────────────┘
```

- **🌊 道Agent** → invert 模式 · 启反代 + 锚 local + 道德经 SP 替换 + 净化侧信道
- **☁️ 官方Agent** → passthrough 模式 · 锚归云 + 反代停 + LS 直飞 server.codeium.com
- **🔬 自检** → 跑 E2E 自检 (反代 + 锚定 + 模式 · 见 OUTPUT 通道 "道Agent · E2E 自检")
- **📜 日志** → 开 OUTPUT 通道 "道·AGI 极简"

### 6.2 切号面板 (wam.panel)

WAM 010 本体原班 · 19 命令. 详见 `010-WAM本源_Origin/_github_src/packages/wam/README.md`.

## 七 · 命令 (24)

### 道Agent (5)
| 命令 | 作用 |
|------|------|
| `wam.originInvert` | 启 invert (道Agent · 道德经 SP) · 锚 local |
| `wam.originPassthrough` | 启 passthrough (官方Agent) · 锚归云 · 反代停 |
| `dao.toggleMode` | 切换模式 (道 ⇄ 官方 · 二态轮转) |
| `dao.openPreview` | 浏览器开 `/origin/preview` (观真 SP) |
| `wam.verifyEndToEnd` | 全链路自检 (E2E · 反代+锚定+模式) |

### WAM 切号 (19)
- `wam.openEditor` / `wam.status` / `wam.wamMode` / `wam.officialMode`
- `wam.switchAccount` / `wam.panicSwitch` / `wam.refreshAll` / `wam.addAccount`
- `wam.autoRotate` / `wam.injectToken` / `wam.verifyAll` / `wam.scanExpiry`
- `wam.selfTest` / `wam.diagWrite` / `wam.healthCheck` / `wam.restore`
- `wam.clearBlacklist` / `wam.testDevinSwitch` / `wam.checkUpdate`

## 八 · 配置

```jsonc
{
  // 反代核心 (3)
  "dao.origin.port": 0,                  // 0 = 自动 per-user hash (8889..8988) · 主动设非0则覆盖 · env DAO_PORT 优先
  "dao.origin.defaultMode": "passthrough",  // 二态默 (invert / passthrough · 无 off · 默 passthrough 首装零侵入)
  "dao.origin.banner": true,              // 启动横幅

  // WAM 切号 (透传 010)
  "wam.autoRotate": true,
  "wam.invisible": false,
  // ... (其他 wam.* 项详见 010 WAM 本源)
}
```

env 覆盖 (优先级最高):

```
DAO_PORT=8889                  反代端口 (覆盖 per-user hash)
DAO_HOT_DIRNAME=.wam-hot       热目录名 (默 ~/.wam-hot)
DAO_VENDOR_SUBPATH=wam/bundled-origin  vendor 子路径
```

## 九 · HTTP 控制面 (反代 :PORT 暴 · PORT 默 per-user)

| 路由 | 方法 | 返 |
|------|------|---|
| `GET /origin/ping` | GET | `{ok, mode, pid, dao_chars, self_size, ...}` |
| `GET /origin/mode` | GET | 当前模式 |
| `POST /origin/mode` | POST | 切模式 `{"mode":"invert"\|"passthrough"}` |
| `GET /origin/preview` | GET | **抱一守中 · 一端口观真 SP** (含 before/after/dissect) |
| `GET /origin/lastinject` | GET | 最近一次真注入 (full=1 取全文) |
| `GET /origin/selftest` | GET | 自证四路径净化 |

**核心**: `/origin/preview` 即用户欲观之"实时初始提示词" — 但非"读取自 LS 内存", 而**反代真截之 SP 持盘记录** (`_lastinject.json`).

## 十 · 路径图

```text
dao-agi-min/
├── README.md                ← 此档
├── package.json             ← 元 · v20.0 · 24 命令 · 3+wam 配置 · 2 视图
├── extension.js             ← ★ 薄壳 · 37 KB · activate WAM + ensureHot + 进程内 require 反代 + 注 dao.toggle
├── _build_vsix.ps1          ← 构建脚本 (-SyncWam / -SyncOrigin / -SyncAll / -DryRun / -InstallLocal)
├── .vscodeignore
├── LICENSE                  ← Apache-2.0
├── media/
│   ├── icon.png
│   └── icon.svg
└── vendor/                  ← 不改一字 · 二本源
    └── wam/                 ← WAM 010 + 反代源 (合一目录 · 与活 dao-agi 同结构)
        ├── extension.js     ← 444 KB · WAM 010 切号本体 (不改)
        ├── package.json     ← 14 KB · WAM 元
        └── bundled-origin/  ← 反代源 (109 KB + 道德经 19 KB)
            ├── 源.js         ← 109 KB · 反代核心 (中文名 · 含 start API)
            ├── source.js    ← 109 KB · ASCII 副本 (VSIX 乱码防御)
            ├── _dao_81.txt  ← 19 KB · 道德经八十一章
            ├── _origin_mode.txt ← 持盘 mode 状态 (反代运行时写)
            └── VERSION
```

## 十一 · 道义归一

- **大制不割** — 不分 wam/wam-proxy 两包, 一壳通杀
- **水善利万物而不争** — 不改 WAM 原片 (vendor/wam/) · 不改反代原片 (vendor/wam/bundled-origin/)
- **太上不知有之** — 默 passthrough · 持盘跨重启 · 用户不需操心
- **利而不害** — anchor() 失败不阻塞激活 · WAM 激活失败有明确 fallback · per-user 端口防多账号冲突
- **为而不争** — dao.toggle 视图独立存在, 与 WAM panel 共存
- **反者道之动** — 不读 SP (扫 LS) · 而截 SP (反代) · 而换 SP (道德经) · 而存 SP (持盘)
- **抱一守中** — `/origin/preview` 万法归于一端点 · 含 before/after/dissect 三辅
- **道生一 · 一生二 · 二生三 · 三生万物** — WAM (一) + 反代 (二) + Webview (三) → 一切命令/视图/HTTP 端点
- **无为而无不为** — 无锚六层之冗 · 无 watcher 之忙 · 无 ls-gate 之入侵 · 无水之四德之繁 · 而 SP 自换

## 十二 · 故障排查

### Q1: 反代未启 (端口不通)

```powershell
# 查看实际端口 (per-user hash · 8889..8988)
# Ctrl+Shift+P → "全链路自检 (E2E)" · 看 OUTPUT 道Agent · E2E 自检
# 或显式设端口
# settings.json: "dao.origin.port": 8889
```

### Q2: 锚定失败 (Cascade 仍走官方云)

settings.json 写入失败可能因权限. 手动检:

```jsonc
// %APPDATA%\Windsurf\User\settings.json
{
  "codeium.apiServerUrl": "http://127.0.0.1:8889",       // 应在
  "codeium.inferenceApiServerUrl": "http://127.0.0.1:8889" // 应在
}
```

### Q3: Cascade 看到的不是道德经

```
Ctrl+Shift+P → "道Agent: 浏览器观真 SP"
浏览器开 http://127.0.0.1:<port>/origin/preview
看 mode 字段:
  invert       → after = 道德经 + TAO_HEADER (Cascade 实收)
  passthrough  → after = before (即官方原 SP)
```

若 `mode=invert` 但 Cascade 仍说 "I am Cascade, your AI assistant" 而非 "你的本源是道德经" — Reload Window. 锚定已下但 Cascade 进程未重读.

### Q4: 装上后侧栏不显面板

`onView:dao.toggle` activationEvents 触发 · 点侧栏图标即活. 若仍不显, Reload Window.

## 一言以蔽之

> v17.x 旧版: 扫 LS 取 SP · 病入膏肓 (PEB 内存扫 / LS-RPC 调 / 锚.py 六层入侵).
> v18.x 痛改: 进程内化 + 单一锚 + 二态 + per-user 端口.
> **v20.0 极简**: 砍 v18.3.1 之冗 · 留 v18.x 之精 · 二核归一 · 道法自然.
>
> "天下之至柔, 驰骋天下之至坚. 无有入无间, 吾是以知无为之有益."
> ——《道德经 · 第四十三章》

道法自然 · 无为而无不为.
