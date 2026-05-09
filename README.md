# Windsurf Assistant

> 为学日益 · 为道日损 · 损之又损 · 以至于无为 · 无为而无不为

二核 · 各臻其极:

| | 所司 | 版 | 取 |
|---|---|---|---|
| [`packages/wam/`](packages/wam/) | **切号** · 万法识号·守道反者 · 三守俱全 (60s 强锁) | `v2.7.0` | 源 + `_dao_deploy.ps1` (道法自然·一令两机) |
| [`packages/dao-proxy-min/`](packages/dao-proxy-min/) | **反代** · Cascade Connect-RPC · 帛书锚 · 守一不离 | `v9.8.0` | [vsix](https://github.com/zhouyoukang/windsurf-assistant/releases/latest) |

## 取 · 切号 (rt-flow v2.7.0 · 道法自然·万家适配)

```powershell
git clone https://github.com/zhouyoukang/windsurf-assistant.git
cd windsurf-assistant/packages/wam

cp _dao_env.local.psd1.example _dao_env.local.psd1   # 主公自填 targets (默仅 local)
cp 账号库.example.md 账号库最新.md                     # 主公自填真账号 (.gitignore 屏蔽)

.\_dao_deploy.ps1                                     # 一令两机部署 v2.7.0
# 主公 Ctrl+Shift+P → Developer: Reload Window
```

详 [`packages/wam/README.md`](packages/wam/README.md) (软编码归一七量·13 测套件·三守俱全实证).

## 取 · 反代

[**最新释放**](https://github.com/zhouyoukang/windsurf-assistant/releases/latest) · `dao-proxy-min-9.8.0.vsix`:

```powershell
windsurf --install-extension dao-proxy-min-9.8.0.vsix
```

## License

MIT (`packages/wam/`) · Apache 2.0 (`packages/dao-proxy-min/`).

---

*道法自然 · 唯变所适 · 改一处万法响应*
