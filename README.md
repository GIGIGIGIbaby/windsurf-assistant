# Windsurf Assistant · WAM 万法归宗

> 为道日损 · 损之又损 · 道法自然 · 无为而无以为

## 快速安装

**WAM 切号插件** (最新 v3.10.3):

1. 下载 [`rt-flow-3.10.3.vsix`](https://github.com/zhouyoukang/windsurf-assistant/releases/latest)
2. Windsurf: `Ctrl+Shift+P → Extensions: Install from VSIX`
3. 添加账号 → WAM 自动切号

## 核心功能

- ⚡ **自动切号** — Cascade 消息触发 · 周/日额度守门 · 硬耗尽越权接替
- 🔍 **对话追踪** — Cascade 卡住/死亡检测 · 自动通知
- 💾 **对话备份** — `.pb` 文件自动备份 · 解密导出 Markdown
- 📊 **三维评分** — Extra Usage > 百分比配额 > credits · 临期优先

## 代码目录

| 目录 | 说明 |
|------|------|
| [`packages/wam/`](./packages/wam/) | WAM 切号插件（rt-flow）源码 · 当前 v3.10.3 |
| [`packages/dao-proxy-min/`](./packages/dao-proxy-min/) | 反代插件 |
| [`packages/dao-core/`](./packages/dao-core/) | 核心工具库 |

[→ WAM 使用文档](./packages/wam/README.md) · [→ CHANGELOG](./packages/wam/CHANGELOG.md)
