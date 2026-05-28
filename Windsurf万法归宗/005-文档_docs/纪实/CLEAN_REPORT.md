# 整理一切 · 去芜存菁 · 道法自然

**时**: 2026-04-23
**行者**: Cascade
**原则**: 软删可逆 · 硬删仅限可再生 · 结构冲突必解 · 永存不动

---

## 一 · 成果

| 项 | 量 |
| --- | ---:|
| **硬删** (缓存/日志, 可再生) | **211 件 · 3.59 MB** |
| **软移** (`_archive/_cleanup_20260423/`) | **26 件 · 2,120 MB** |
| **结构重命名** | **1** (080-CDP道桥 → 120-CDP道桥) |
| **活目录净缩** | **≈ 2 GB** |
| **失败** | **24** (Windows MAX_PATH 或活进程锁) |

---

## 二 · 活目录前后对比

| 目录 | 之前 | 现 | 减 |
| --- | ---:| ---:| ---:|
| `020-逆向_Reverse` | 1,280 MB | **167 MB** | **-1,113 MB** |
| `030-额度_Credits` | 452 MB | **79 MB** | **-373 MB** |
| `060-修复_Repair` | 387 MB | **65 MB** | **-322 MB** |
| `070-插件_Plugins` | 729 MB | **551 MB** | **-178 MB** |
| `000-本源_Origin` | 112 MB | **77 MB** | **-35 MB** |
| `110-对话追踪_Trace` | 2,508 MB | **2,498 MB** | -10 MB (永存 2.42 GB 不动) |
| `_archive` (归墟) | 7.6 MB | **2,102 MB** | +2,094 MB (容所有软移) |

---

## 三 · 已做之事

### 3.1 硬删 (无值 · 可再生)
- `__pycache__/` 目录树 (散布)
- `*.pyc`, `*.log`, `*.out`, `*.cache`, `*.tmp` 文件 (除 110-对话追踪/永存 / .git / .windsurf 之外)
- 计 211 件 · 3.59 MB

### 3.2 软移 · 大块归墟
至 `_archive/_cleanup_20260423/`:

| 源 | 目 | MB |
| --- | --- | ---:|
| `020-逆向_Reverse/_AIswitch_legacy/` | `020-逆向_Reverse__AIswitch_legacy/` | 1,113 |
| `060-修复_Repair/_fingerprint_backups/` | `060-修复_Repair__fingerprint_backups/` | 322 |
| `070-插件_Plugins/030-转制VSIX_Repack/_archive/` | `070-插件_Plugins__030-转制VSIX_Repack__archive/` | 224 |
| `110-对话追踪_Trace/backup/` | `110-对话追踪_Trace__backup/` | 56 |
| `000-本源_Origin/archive/` | `000-本源_Origin__archive/` | 34 |
| **21 个 `.bak*` 文件** (超 2 份的历史备份) | `bak_dedup/<sha-10>/<name>` | 371 |

每组备份只留**最新 2 份** (原位留), 其余归墟.

### 3.3 结构解冲突
- `080-CDP道桥_Bridge` → `120-CDP道桥_Bridge`
- 原 `080-号池管理_PoolAdmin` 独占 080 号.

### 3.4 失败不动
- `110-对话追踪_Trace/logs/` — 被活进程 (CodeTracker) 锁, 未移.
- 23 个 `.bak` 文件首轮失手于 Windows MAX_PATH (260 字), 第二轮 `_cleanup_phase2.ps1` 用 SHA-10 短路径补齐 21 件, 剩 2 件因锁未动.

---

## 四 · 如逆 · 回滚术

全部软移以原路径+文件名编码, 可逆:

```powershell
# 总览所移
Get-Content 'e:\道\道生一\一生二\Windsurf万法归宗\_archive\_cleanup_20260423\_MANIFEST.md'

# 逆全部 (若后悔)
Get-ChildItem 'e:\道\道生一\一生二\Windsurf万法归宗\_archive\_cleanup_20260423' -Directory |
    ForEach-Object {
        # 还需按 _MANIFEST.md 中记录逐项 Move-Item 反向
    }

# 或直接逆大块 (最常用):
Move-Item 'e:\道\道生一\一生二\Windsurf万法归宗\_archive\_cleanup_20260423\020-逆向_Reverse__AIswitch_legacy' 'e:\道\道生一\一生二\Windsurf万法归宗\020-逆向_Reverse\_AIswitch_legacy'
```

为免误删, **`_archive/_cleanup_20260423/` 保留 90 天**, 确无用后再彻底删.

---

## 五 · .gitignore 更新

已增:
- `*.bak`, `*.bak_*`, `*.old`, `*.orig`, `*.broken`, `*.corrupted` 家族
- `_archive/`, `**/_archive/`, `**/backup/`, `**/logs/`
- `_fingerprint_backups/`, `_windsurf_backups/`
- `*.vscdb`, `*.vscdb-journal`
- `070-插件_Plugins/**/dist/`, `out/`
- `000-本源_Origin/解剖_SRC/_symbols/` 等 (大 · 可再生)
- `.windsurf/` (工具本地态)
- `_cleanup_*.log`

---

## 六 · 未动之物 (守而不动)

- `110-对话追踪_Trace/永存/` · **2.42 GB** · 名即"永存", 不犯.
- `.git/` · 版本库.
- 本源解剖 `000-本源_Origin/解剖_SRC/` 当前产出 (67 MB · 刚解剖之物, 未过夜).
- `.windsurf/` 目录 (工具 workflow 状态 · 本地活跃).
- `_cleanup_20260423.ps1`, `_cleanup_phase2.ps1`, `.log` 文件 · 作本次施行留痕, 后可一并删.

---

## 七 · 结构今貌

```
Windsurf万法归宗/
├── .git/                              (版本库)
├── .gitignore                         (已丰)
├── .vscode/
├── .windsurf/                         (工具态 · gitignored)
├── 000-本源_Origin/                    77 MB · 本源 + 解剖_SRC/
├── 010-反代_Proxy/                     63 MB
├── 020-逆向_Reverse/                   167 MB · legacy 归墟
├── 030-额度_Credits/                   79 MB · bak dedup
├── 040-切号_Switch/                    4 MB
├── 050-拯救者_Savior/                  0.04 MB
├── 060-修复_Repair/                    66 MB · fingerprint 归墟
├── 070-插件_Plugins/                   551 MB · VSIX archive 归墟
├── 080-号池管理_PoolAdmin/             108 MB · 独占 080
├── 090-仪表盘_Dashboard/               0.2 MB
├── 100-隔离_Isolation/                 0.13 MB
├── 110-对话追踪_Trace/                 2,498 MB (永存 2.42 GB + 活数据)
├── 120-CDP道桥_Bridge/                 0.03 MB · 新编
├── _archive/                          2,102 MB · 归墟 (gitignored)
│   ├── _cleanup_20260423/              2,094 MB · 本次所移 (可逆)
│   └── (其他历史归墟)
├── CLEAN_REPORT.md                    (此档)
├── README.md
├── _AGENTS.md
├── _cleanup_20260423.ps1              (清扫器 · 可删)
├── _cleanup_phase2.ps1                (补遗器 · 可删)
├── _cleanup_*.log                     (施行日志 · 可删)
├── dao-agent/
├── data/
└── →万法归宗.cmd
```

---

## 八 · 道纪

> 万物并作, 吾以观复. 夫物芸芸, 各复归其根. 归根曰静, 静曰复命.
>
> — 《道德经》第十六

芜已归墟, 菁已复位. 二 GB 如流水入海, 不失不毁. 道纪已观.

**大音希声, 大象无形, 道隐无名.**
