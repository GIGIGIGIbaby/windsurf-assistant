# 锚定本源 · 全栈独立可行性研究 + 阶一落地

> 道德经 · 第二十五章: "**有物混成, 先天地生... 独立而不改, 周行而不殆.**"
>
> 此目录回答用户问: **能否不依赖 Windsurf 安装本身, 后端整合一切?**

## 文件清单

| 件 | 用途 |
|---|---|
| `ARCHITECTURE_BARE.md` | 完整架构分析: 三层划分 (LS核/Cascade身/IDE壳) + 三阶路线图 |
| `QUICKSTART_NO_WINDSURF.md` | 速通文档: 三步装 VS Code + 030 + 040 = 无 Windsurf 的 Cascade |
| `setup-vsix-only.ps1` | 阶一一键脚本: 自动 detect VS Code → 装 VSIX → 验证 |
| `setup-vsix-only.cmd` | 上述脚本的双击启动器 |

## 核心实证

✅ **LS 二进制独立可活**: `language_server_windows_x64.exe` 命令行直启即活, 自启 manager+child, 绑随机端口, gRPC 全可达. 实测 PID 35652+37312, 与 Windsurf IDE 零耦合.

✅ **VSIX 自含**: `070-插件_Plugins/030-转制VSIX_Repack/windsurf-dao-0.2.0.vsix` (52 MB) 已包含:
  - `bin/language_server_windows_x64.exe` (162.89 MB)
  - `bin/fd.exe` (3.36 MB)
  - `dist/extension.js` (9.15 MB · 零修改)
  - `dist/cascade-webview/...` (29.18 MB UI)
  - `dist/shim.js` (94 KB · 14 fork API 桥)

✅ **VS Code CLI 已装**: `D:\Microsoft VS Code\bin\code.cmd`

## 阶一立即可做

```powershell
# Dry-run (看会做啥)
powershell -ExecutionPolicy Bypass -File setup-vsix-only.ps1 -DryRun

# 真装
powershell -ExecutionPolicy Bypass -File setup-vsix-only.ps1

# Reload VS Code 后验证
powershell -ExecutionPolicy Bypass -File setup-vsix-only.ps1 -Verify

# 卸 (反者道之动)
powershell -ExecutionPolicy Bypass -File setup-vsix-only.ps1 -Uninstall
```

或双击 `setup-vsix-only.cmd`.

## 三阶路线 (摘自 ARCHITECTURE_BARE.md)

| 阶 | 时长 | 投入 | 状态 |
|---|---|---|---|
| 一 · VSIX 装 VS Code | 今日 | 0 行新代码 | ✅ **件就绪 + 脚本就绪 · 待 Reload 验证** |
| 二 · Headless daemon | 1-2 周 | ~2000 行新代码 | ⚠ 待启动 |
| 三 · Electron 自有壳 | 1-2 月 | 大量 | ❌ 不推 (ROI 低) |

## 道并行而不相悖

用户照常用 Windsurf, 此独立件:
- 端口错开 (LS 用 random, 我们 :11434, 010 用 :8878, 020 用 :8889+)
- 文件错开 (`~/.dao-cascade/` ≠ `~/.windsurf/`)
- 进程不抢 (Go LS lock file 同 dir 互斥, 异 dir 不冲)
- vscdb 不动 (我们将自带 token vault)

> **道德经 · 第七十九章**: "天道无亲, 常与善人."
> **道德经 · 第六十四章**: "为之于未有, 治之于未乱."

—— 此为"一", 路线"二", 落地"三". 三者俱备, 待用户决.
