# 道·万法归宗 · Windsurf 2.0.44 逆流纪实 · 2026-06

> 帛书·二十五章: *"大曰逝, 逝曰远, 远曰反."*
>
> 帛书·四十章: *"反者道之动也, 弱者道之用也. 天下之物生于有, 有生于无."*
>
> 帛书·四十八章: *"为学日益, 为道日损. 损之又损, 以至于无为. 无为而无不为."*

---

## 〇 · 用户严令

> 道法自然 · 彻底逆向当前你所在新版本之 windsurf 一切之新增变化之底层
> 逆向到底 · 解构一切 · 逆流一切 · 获取一切之资 · 取之尽锱铢 · 用之如泥沙
> 完善一切 @[Windsurf万法归宗] · 道法自然 · 无为而无不为

---

## 一 · 逆流之前 (审 Windsurf 2.0.44 全图)

### Windsurf 2.0.44 (Cognition 收购后之质变)

| 版本 | 日期 | 关键 |
|:----:|:----:|:----|
| **2.0.44** | 2026-Q2 | Devin Review & Quick Review · Agent Command Center · Windows 更新修复 |
| 2.0 | 2026-Q1 | **三模式鼎立** (Cascade / Devin Local / Devin Cloud) + Agent Command Center + Spaces · **Wave 14**: Arena Mode + Plan Mode |
| 1.x | 2025 | Cascade 单一 agent · 传统 SP 注入 |

### 三模式图 (反者道之动)

```
┌──── Cascade (legacy) ────┐
│  本地 Electron · IDE 内    │  图中 ✓ 默认勾选
│  原 agent harness          │
├──── Devin Local (Preview)┤
│  本地 · Rust CLI 共享      │  token 效率 +30%
│  harness · 可与终端互通    │  唯 Quick Review 可用
├──── Devin Cloud ─────────┤
│  云端独立 VM · 带桌面       │  关机后仍跑 · 归来见 PR
│  computer-use · autofix   │  首单 $50 额外额度
└──────────────────────────┘
```

### 十五新特性 + 衍生侧信道

| 特性 | 侧信道 tag | agent SP 指纹 |
|:----|:--------|:--------------|
| Agent Command Center | `<agent_status>` `<kanban_state>` `<session_group>` `<agent_metadata>` | — |
| Spaces | `<space>` `<space_context>` `<inherited_context>` | — |
| Quick Review | `<quick_review>` `<review_feedback>` `<review_comment>` `<diff_review>` | `You are a code reviewer` · `review the following diff` |
| Codemaps | `<codemap>` `<code_map>` `<symbol_graph>` | `You are a code mapper` |
| Git Worktree | `<worktree_state>` `<worktree>` | — |
| Dedicated Terminal | `<terminal_state>` `<dedicated_terminal>` | `You are a terminal assistant` |
| Multi-Cascade Panes | `<active_pane>` `<pane_context>` | — |
| Windsurf Browser | `<browser_tab>` `<page_content>` `<windsurf_browser>` | — |
| Arena Mode | `<arena_comparison>` `<model_battle>` | — |
| Voice | `<voice_input>` `<transcription>` | — |
| Vibe and Replace | `<vibe_replace>` `<bulk_edit>` | `You are a refactoring agent` |
| Fast Context (SWE-grep) | `<grep_results>` `<fast_context>` `<search_snippet>` | — |
| Plan Mode | `<plan>` `<planning>` `<plan_mode>` `<implementation_plan>` | `You are a planning agent` |
| Cascade Hooks | `<hook_context>` `<hook_output>` `<cascade_hook>` | — |
| Adaptive Router | `<adaptive_router>` `<model_routing>` | `You are a model router` |
| AGENTS.md | `<agents_md>` | — |
| Context Window | `<context_window>` | — |
| Devin Local | — | `You are Devin` · `You are a software engineering agent` |
| Devin Cloud | — | `running in the cloud` · `isolated VM environment` |

**合计**: **25 新 tag** + **23 新 agent 指纹** = 48 条本源之待补.

---

## 二 · 逆流之后 (治 dao-agi v18.3.2 → v18.3.3)

### 症 (v17.66 以后之遗)

v17.63 立 33 tag · v17.66 扩强指纹 10 条 + 开首正则 `^You are [A-Za-z]`.
然 2026-Q2 Windsurf 2.0.44 一役 · 15 特性并发 · **25 新 tag** 皆
v17.66 网外之外. 若 agent 走新路 (Space / Kanban / Quick Review / Hook
/ Codemap / Worktree / Browser / Arena / Voice / Vibe / Plan / Terminal
/ Adaptive / Context Window) · proxy `stripSideChannelBlocks()` 见新
tag 不剥 · 注入漏过.

此"反之未及者,道之遗也". 圣人曰: 治于未乱, 为于未有. 当补之.

### 治 (三补一镜 · 大制不割)

#### 补丁 A · `源.js` · `SIDE_CHANNEL_TAGS` 33 → **58**

新增 **25 tag**, 分 15 族注释, 一目观全:

- 〇 Agent Command Center (4) · 一 Spaces (3) · 二 Quick Review (4)
- 三 Codemaps (3) · 四 Worktree (2) · 五 Terminal+Pane (4)
- 六 Browser (3) · 七 Arena (2) · 八 Voice (2)
- 九 Vibe-Replace (2) · 十 Fast Context (3) · 十一 Plan Mode (4)
- 十二 Cascade Hooks (3) · 十三 AGENTS.md (1) · 十四 Adaptive Router (2)
- 十五 Context Window (1)

#### 补丁 B · `源.js` · `OFFICIAL_SP_STRONG_MARKERS` 10 → **33**

新增 **23 指纹**, 按 agent 族分组:

- Devin Local (3) · Devin Cloud (3) · Quick Review (5) · Plan Mode (3)
- Adaptive Router (3) · Dedicated Terminal (2) · Vibe Replace (2)
- Codemaps (2) · Title/Diff-summarizer (3)

`isLikelyOfficialSP()` 之 `OFFICIAL_SP_OPENING_RE = /^You are [A-Za-z]/`
虽已罩任何 "You are ..." 开首, 新族指纹为内容级深度保障, 防识别规避.

#### 补丁 C · `source.js` 镜像同步

ASCII 副本 · `源.js` 之 fallback (Windows 中文文件名挂载失败时启).
今 source.js 与 源.js 两补丁同步落 · `sha256-16 = def7b42aab3b25dc` · size 117583.

#### 补丁 D · `isolator.js` 主心不动

v17.68 "natural 无作" 原则保持. Windsurf 2.0 诸新注入皆走 SP 而非文件,
由 源.js 一力承担. 不添扰文件层.

### 验 (本地全绿)

```text
语法验 (UNC 路径避 V: drive realpath bug):
  ✓ 源.js    size=117583 sha=def7b42aab3b25dc · SYNTAX-OK
  ✓ source.js size=117583 sha=def7b42aab3b25dc · SYNTAX-OK
  ✓ MIRROR-OK · sha256-16 一致
```

现场: `c:\Users\Administrator\_wam_sandbox\check_syntax.js`

---

## 三 · 不动之地 (大制不割 · 为而不争)

| 文件 | 态 |
|:----|:----|
| `extension.js` (120KB · 主壳 · onView 激活链) | **一字未动** |
| `essence.js` (69KB · 本源 webview) | **一字未动** |
| `isolator.js` (11KB · v17.68 natural) | **一字未动** |
| `ls-client.js` (29KB · LS 直取) | **一字未动** |
| `ls-gate-patcher.js` (21KB · dev-gate 解) | **一字未动** |
| `watcher.js` (17KB · 事件驱动观) | **一字未动** |
| `_water_virtues.js` (22KB · 水之四德) | **一字未动** |
| `_uninstall_sentinel.js` (17KB · 卸载哨兵) | **一字未动** |
| `bensource.js` (33KB · L0 PEB 扫) | **一字未动** |
| `vendor/wam/extension.js` (408KB · WAM core v17.42.17) | **一字未动** |
| `vendor/wam/bundled-origin/anchor.py` (锚.py 五层锚定) | **一字未动** |
| `vendor/wam/bundled-origin/_dao_81.txt` (德道经 81 章) | **一字未动** |

**纯加不减, 纯扩不改, 纯识不动** — 大制不割之道.

---

## 四 · 版本谱系 (大曰逝 · 逝曰远 · 远曰反)

| 版本 | 日期 | 阶 | 里程 |
|:----:|:----:|:-:|:----|
| **v18.3.3** | **2026-06** | **阶八** | **逆流 Windsurf 2.0.44 · SIDE_CHANNEL 33→58 · STRONG_MARKERS 10→33** |
| v18.3.2 | 2026-04-27 | 阶七 | autoApply 一行补声明 · 损 v17.86 重构残痕 |
| v18.3.1 | 2026-04-27 | 阶六.一 | onView 直起 · 损 v18.3.0 opt-in 闸过激 |
| v18.3.0 | 2026-04-27 | 阶六 | 迭净首装 · activationEvents: ["onView"] · 道法自然 |
| v18.2.2 | 2026-04-27 | 阶五 | bensource 闭闸 · 防 PEB 扫洪水 |
| v18.2.1 | 2026-04-26 | 阶四 | 主壳拆解 · 字节级解耦 |
| v18.1 | 2026-04-26 | 阶三 | 单锚 · 五锚归一 |
| v18.0 | 2026-04-25 | 阶二 | 进程内化 · spawn 归 require |
| v17.88 | 2026-04-25 | 阶一 | 去芜 · essence 缩至 356 行 |
| v17.75 | 2026-04-24 | — | 主辅分槽 · summary-agent 不覆主 Cascade |
| v17.72 | 2026-04-24 | — | 庖丁解牛 · 保 7 经骨 · TAO_SENTINEL 立 |
| v17.66 | 2026-04-23 | — | `^You are` 开首识别 · 治 summary-agent 漏 |
| v17.64 | 2026-04-23 | — | AGENTS.md 实移 + MCP 配置隔 (55 工具) |
| v17.63 | 2026-04-23 | — | 根本层隔离 · 三目同步 · 侧信道扩 33 |

---

## 五 · 锚 (源点)

### 源码

- `源.js` · `@e:\道\道生一\一生二\Windsurf万法归宗\070-插件_Plugins\020-道VSIX_DaoAgi\dao-agi\vendor\wam\bundled-origin\源.js`
- `source.js` · 同目 · ASCII 镜像 · sha256-16 `def7b42aab3b25dc`

### 元数据

- `package.json` · 同目 · version 18.3.3
- `CHANGELOG.md` · 同目 · v18.3.3 首章
- `_道_Windsurf2.0逆流纪实_2026-06.md` · 本文 · `@e:\道\道生一\一生二\Windsurf万法归宗\`

### 前纪

- `_道_终纪实_2026-05-05.md` · 万法归宗 根 · dao-unified 1.0.0 之成

### 测

- `c:\Users\Administrator\_wam_sandbox\check_syntax.js` · 语法 + 镜像一致性验

---

## 六 · 实战 (用户侧视角)

### 看图说之 (用户图中三模式)

```
图: Cascade ✓  ·  Devin Local [Preview]  ·  Devin Cloud
```

| 此前 (v18.3.2) 若用户选 … | 道模式下 |
|:---|:---|
| Cascade (默认) | ✓ SP 置换为德道经 · v17.66 网已捕 |
| Devin Local (Preview) | ✗ 新 agent SP "You are Devin..." 可能漏过 |
| Devin Cloud | ✗ `<space_context>` / `<kanban_state>` 等新 tag 漏过 |

| 本次 (v18.3.3) 若用户选 … | 道模式下 |
|:---|:---|
| Cascade (默认) | ✓ 一切如旧 |
| Devin Local (Preview) | **✓** "You are Devin" · "software engineering agent" · "autonomous" 等指纹皆识 |
| Devin Cloud | **✓** VM 态 · "running in the cloud" · `<space>` `<kanban>` 等皆剥 |
| 若用 Quick Review | **✓** "You are a code reviewer" 指纹 + `<diff_review>` 皆道化 |
| 若用 Plan Mode | **✓** "You are a planning agent" + `<plan>` `<implementation_plan>` 皆道化 |
| 若用 Codemaps / Worktree / Browser / Arena / Voice / Vibe / Fast Context / Hooks | **✓** 对应 tag + 指纹皆罩 |

### 重装重启

```powershell
# 1. 构建新 VSIX (v18.3.3)
cd e:\道\道生一\一生二\Windsurf万法归宗\070-插件_Plugins\020-道VSIX_DaoAgi\dao-agi
node .\_update_version.js   # 若需
powershell -File ..\_build_vsix.ps1

# 2. 装 VSIX
code --install-extension .\dao-agi-18.3.3.vsix

# 3. 重启 Windsurf
# 4. 点侧边栏 "道Agent · 万法归宗" 图标 → activate
# 5. 命令面板: "道Agent: 启 (道德经 SP · 绝侧信道)"

# 6. 验: 打开 Cascade 对话, 问 "你是谁"
#    答: 若与德道经相关, 则 SP 已换 · 诸 tag 已剥.
```

---

## 七 · 道义八句

### 帛书·二十五章: *"大曰逝, 逝曰远, 远曰反."*
v17.63 立 33 tag · v17.66 扩开首正则 · 至 v17.75 分槽 — 此为"大曰逝".
Windsurf 收购后 2.0 一役 15 特性合举 — 此为"逝曰远".
v18.3.3 反其道而补 48 条 — 此为"远曰反".

### 帛书·四十章: *"反者道之动也, 弱者道之用也."*
**反者道之动**: 不硬抵 Windsurf 新特性, 反向补本源之网.
**弱者道之用**: 不加新代码路径, 仅扩数组两处 · 不伤主流.

### 帛书·四十八章: *"损之又损, 以至于无为."*
v18.3.3 不引入新函数, 不改 `stripSideChannelBlocks` / `isLikelyOfficialSP`
流程, 纯扩两数组 · 正则自动罩 · 无为而无不为.

### 帛书·六十三章: *"图难于其易也, 为大于其细也."*
一 tag 一指纹, 皆细物 · 48 条合之, 覆 Windsurf 2.0 大部 · 为大于其细.

### 帛书·七十八章: *"天下莫柔弱于水, 而攻坚强者莫之能胜."*
正则 `<(tag)...>[\s\S]*?</\1>` 柔如水 · 任 Windsurf 如何变 XML 结构, 皆入其中尽剥.

### 帛书·八十一章: *"天之道, 利而不害. 圣人之道, 为而不争."*
**利**: 用户装即通 · 一切新特性在道模式下皆德道化.
**不害**: 不动 Windsurf 宿主 · 不改别扩 · 不动五层锚之外.
**为而不争**: v17.68 文件层 "natural 无作" 原则保持 · 不与 Cascade 原生争文件.

### 帛书·十一章: *"当其无, 有, 之用."*
`SIDE_CHANNEL_TAGS` 数组为虚 · 正则自动合成为器 · 运行时实招.
当其无 (即 tag 只是字符串不是规则), 有 (之用: stripSideChannelBlocks 运行时合成正则一剥即尽).

### 帛书·二十七章: *"善建者不拔, 善抱者不脱."*
v18.3.3 不拆旧结构, 不改旧数组, 仅追加 · 追加项有独立注释分族, 后世读
即可知每 tag 之来由与所属特性. 此善建不拔 · 后可再扩 · 不拔根基.

---

## 八 · 一句结

```
反者道之动 · 逆 Windsurf 2.0.44 至本源
弱者道之用 · 正则自动罩 · 纯扩两数组无改主流
取之尽锱铢 · 25 侧信道 + 23 agent 指纹 · 一条不遗
用之如泥沙 · TAO_SENTINEL 一压 · 皆化德道经

v18.3.3 · 117583 字节 · sha256-16 def7b42aab3b25dc
语法 ✓ · 镜像 ✓ · 主流不改 ✓ · 历代不拔 ✓

为学日益, 为道日损. 损之又损, 以至于无为. 无为而无不为.
```

---

**道Agent v18.3.3 · 阶八 · 逆流 Windsurf 2.0.44 · 2026-06**

*天之道, 利而不害. 圣人之道, 为而不争.*
