# 020-道VSIX_DaoAgi

> 朴散则为器 · 圣人用之 · 则为官长 · 故大制不割

---

## 三器 · 一目了然

| 器 | 版本 | 定位 | 状态 |
|:---|:---|:---|:---|
| **`dao-proxy-min/`** | v3.0.0 | 极简反代 · source.js 本源 · 3命令 · ~40KB | **当前部署** (zhou) |
| **`dao-agi/`** | v18.3.2 | 全功能 (WAM切号 + SP + essence + ls-gate + 水之四德) | 完备 · 备用 |
| **`dao-agi-min/`** | v20.0.0 | WAM+反代合一 (010 WAM 444KB + source.js) | 完备 · 备用 |

**本源核心**: `source.js` — 字段级 proto 解析 + 深度侧信道剥离 (27标签递归) + TAO_HEADER 身份锚 + 三档 RPC

---

## 目录结构

```text
020-道VSIX_DaoAgi/
│
├── dao-proxy-min/           ★ 当前活跃 · 极简反代插件
│   ├── extension.js            扩展入口 (锚定 + daemon 管理)
│   ├── package.json            v3.0.0 · 3 命令
│   ├── vendor/bundled-origin/
│   │   ├── origin.js           source.js 本源 (54KB · 字段级 proto)
│   │   └── _dao_81.txt         道德经全 81 章 (6776字)
│   ├── tests/                  L1 单元 + L2 回放
│   └── *.vsix                  最新构建产物
│
├── dao-agi/                 ★ 全功能版源码
│   ├── extension.js / essence.js / bensource.js / ...
│   ├── vendor/wam/bundled-origin/   source.js + 源.js
│   ├── test/                        30 spec 文件
│   └── *.vsix                       最新 v18.3.2
│
├── dao-agi-min/             ★ WAM+反代合一版源码
│   ├── extension.js              合一入口
│   ├── vendor/wam/               WAM 010 本体 + bundled-origin
│   └── *.vsix                    最新 v20.0.0
│
├── _build_vsix.ps1          构建 (verify + package)
├── _sync_origin.{js,ps1}    source.js 同步 (vendor ↔ installed ↔ hot-dir)
├── _sync_wam_core.ps1       WAM 核心同步 (010 ⇄ 020)
├── _update_version.js       版本号同步
│
└── _archive/                归档 (历史版本 · 旧脚本 · 旧文档)
    ├── vsix_all/            20 个历史 VSIX (v17.69 → v18.3.2)
    ├── scripts_legacy/      28 个一次性部署/诊断脚本
    ├── docs_legacy/         7 个历史文档
    ├── cline-fusion/        Cline v3.77 实验性 fork (独立 · 不并主线)
    ├── v17.84-v17.87_20260426/  万法归宗去芜归档
    └── history_misc/        调试产物 + 旧分析
```

---

## 快速操作

```powershell
# 构建
.\_build_vsix.ps1                  # verify + package
.\_build_vsix.ps1 -DryRun          # 仅验证

# 同步 source.js
node .\_sync_origin.js              # 源.js → vendor → installed-ext → hot-dir

# 测试 dao-proxy-min
cd dao-proxy-min
npm run test:l1                     # L1 字节级单元
npm run test:l2                     # L2 回放

# 测试 dao-agi
cd dao-agi
node test\e2e.js                    # 跨六层 55 项
```

---

## 铁律

1. **source.js 本源唯一** — 改核 → `010-WAM本源_Origin/_github_src/.../source.js` → `_sync_origin` 同步
2. **三器各安其位** — 不混源码 · 不跨目录引用
3. **vendor/ 为原片** — 不入此目录脚本之手
4. **_archive/ 只进不出** — 旧物归档 · 不复用

---

*为学日益 · 为道日损 · 损之又损 · 以至于无为 · 无为而无不为*

**2026-04-28 · 大规模整理 · 道法自然**
