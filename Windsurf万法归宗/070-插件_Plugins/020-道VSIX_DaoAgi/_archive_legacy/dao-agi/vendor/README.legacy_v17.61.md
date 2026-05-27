# vendor/ · 本源 (dao-agi v17.61.1 · WAM v17.42.13)

> 取之尽锱铢,用之如泥沙。**复用而非复刻**。无为而无不为。

本目录**不含**重写代码。一切皆为已有、成熟的本源资产,**原片复用**。

## 结构

```
vendor/
├── README.md                    ← 本文件
└── wam/                         ← WAM 本源 (v17.42)
    ├── extension.js               → 010-WAM 核心 (符号链接 · 0 byte = 未建链)
    ├── package.json               → 010-WAM 元数据 (符号链接)
    └── bundled-origin/            proxy 资产 (原片不改)
        ├── source.js                · 源.js ASCII 别名 (52KB · SP 置换 + 侧信道剥除)
        ├── 源.js                    · 零依赖 Node proxy (52KB · Connect-RPC 三路径)
        ├── anchor.py                · 锚.py ASCII 别名 (32KB · 五层锚定)
        ├── 锚.py                    · DPAPI+AES-GCM+SQLite 五重锚 (32KB)
        ├── _dao_81.txt              · 道德经 81 章 (19KB · 6776 字)
        └── VERSION                  · 版本 + sha256-16 指纹
```

## 归属

| 路径 | 来源 | 许可 |
|------|------|------|
| `wam/extension.js` | [`zhouyoukang/windsurf-assistant`](https://github.com/zhouyoukang/windsurf-assistant) v17.42 | MIT |
| `wam/bundled-origin/*` | 同上 · bundled-origin 三件套 | MIT |
| `wam/bundled-origin/_dao_81.txt` | 老子《道德经》王弼本 · 公版 | Public Domain |

## 运行期

1. `extension.js::ensureHot()` 把 `bundled-origin/` 复制到 `~/.wam-hot/origin/` (size 幂等 · 不重复写)
2. `hijackStart()` spawn `~/.wam-hot/origin/源.js` 作为反代进程 (:8889)
3. `anchor()` 调用 `~/.wam-hot/origin/anchor.py` 五层锚定 state.vscdb
4. `loadWamCore()` require `wam/extension.js` 激活 WAM 切号引擎

**原片就地运行 · 零重写 · 利而不害**

## 符号链接

`vendor/wam/extension.js` 和 `package.json` 应为符号链接指向 010-WAM 核心。

建链:
```powershell
cd 020-道VSIX_DaoAgi
.\_setup_wam_link.ps1
```

验证:
```powershell
.\_setup_wam_link.ps1 -Verify
```

若文件为 0 字节, 表示链接未建立。部署脚本 (`deploy-dao-agi-179.ps1`) 会自动复制真实 WAM 文件。

## 更新

| 资产 | 同步方法 |
|------|----------|
| `wam/extension.js` | 重建符号链接或 `.\_sync_wam_core.ps1` |
| `wam/bundled-origin/*` | 从上游 windsurf-assistant 同步 |

---

*道冲,而用之或不盈。渊兮,似万物之宗。*
