# 速通 · 不装 Windsurf 也用 Cascade

> 道德经 · 第六十四章: "**千里之行, 始于足下.**"
>
> 此文为"阶一"路径 (今日即可). 详见 `ARCHITECTURE_BARE.md`.

## 前提验证 (已实证)

✅ `language_server_*.exe` 是**完全独立的** Go 二进制, 命令行直启即活 (实测 PID 35652 + 37312, 绑随机端口, RPC 全可达).

✅ `070-插件_Plugins/030-转制VSIX_Repack/windsurf-dao-0.2.0.vsix` (52 MB) 自含:
- `bin/language_server_windows_x64.exe` (162.89 MB)
- `bin/fd.exe` (3.36 MB)
- `dist/extension.js` (9.15 MB · Windsurf 原 bundle 零修改)
- `dist/cascade-webview/...sessions.desktop.main.js` (29.18 MB · Cascade UI)
- `dist/shim.js` (94 KB · 14 个 fork API 桥)

**结论**: 用户**不必装 Windsurf**, 装 VS Code + 此 VSIX 即得完整 Cascade.

## 三步上手

### 1. 装 VS Code (5 min)

```powershell
# Windows
winget install -e --id Microsoft.VisualStudioCode
# 或 Chocolatey
choco install vscode -y

# macOS
brew install --cask visual-studio-code

# Linux (Ubuntu/Debian)
sudo apt install code
```

### 2. 装两个 VSIX (10 sec)

```powershell
$base = "v:\道\道生一\一生二\Windsurf万法归宗\070-插件_Plugins"

# 主件: 自含 LS + Cascade UI + 14 fork API shim
code --install-extension "$base\030-转制VSIX_Repack\windsurf-dao-0.2.0.vsix"

# 配件: LAN 反代 (其他设备可调)
code --install-extension "$base\040-道反代_LanProxy\dao-lan-proxy-1.0.0.vsix"
```

### 3. Reload VS Code

`Ctrl+Shift+P` → "Reload Window"

## 验证

| 检查点 | 期望 | 命令 |
|---|---|---|
| 扩展加载 | 两个扩展状态 "Activated" | `Ctrl+Shift+X` 看 |
| LS 进程起 | 出现 `language_server_windows_x64.exe` | `Get-Process language_server*` |
| LS 端口活 | 监听在某随机 :3xxxx | `netstat -ano \| findstr <pid>` |
| Cascade UI | 左侧栏出 Cascade 图标 | 点击图标看面板 |
| LAN 端点 | `:11434/v1/models` 返 46 模型 | `curl http://127.0.0.1:11434/v1/models` |
| 状态栏 | "🌐 LanProxy:11434" | 看 VS Code 右下 |

## 与现存 Windsurf 共处

如果用户**也装着 Windsurf**:
- VS Code 内的 030 自动检测 `_isForkHost = !!vscode.windsurfLanguageServer`, 在纯 VS Code 下走完整 activate 路径
- 不动 Windsurf 的安装、设置、vscdb
- LS 进程多开 — 不同 `codeium_dir` 不互斥
- LAN 端口仅 040 占 :11434, 其他独立

**两条道并行而不相悖**.

## 限制 (已知)

⚠ **首次需登录**: 030 装好后, Cascade 面板会跳浏览器登录 (Windsurf 账号 OAuth). 若用户只有 token 没 OAuth 入口, 待"阶二 daemon" 实 PKCE.

⚠ **VS Code 扩展 API 兼容性**: 030 用了少量 proposed APIs. `node post-install.js` 一次修补 product.json 白名单 (只首装).

⚠ **同 publisher.name 唯一冲突**: 若用户同时装了官方 `codeium.windsurf` (Windsurf fork 内自带), 会出双图标. 物理底线无解.

## 快速回滚

```powershell
code --uninstall-extension dao-agi.windsurf-dao
code --uninstall-extension dao-agi.dao-lan-proxy
```

—— 就到这. **图难于其易, 为大于其细**.
