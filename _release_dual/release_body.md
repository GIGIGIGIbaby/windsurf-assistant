# 风帆冲浪助理 · 双轨并行 · 道法自然

> 损之又损 · 以至于无为 · 无为而无不为 —— 帛书《老子》四十八章
> 道恒无名 · 朴唯小 · 而天下弗敢臣 · 侯王若能守之 · 万物将自宾 —— 三十七章

## 二核 一释

| 所司 | 司 | 版 | VSIX |
| --- | --- | --- | --- |
| [packages/wam](https://github.com/zhouyoukang/windsurf-assistant/tree/main/packages/wam) | 切号 · 万法识号 · 守道反者 · 三守俱全 | **v2.7.5** | `rt-flow-2.7.5.vsix` |
| [packages/dao-proxy-min](https://github.com/zhouyoukang/windsurf-assistant/tree/main/packages/dao-proxy-min) | 反代 · 帛书锚 · 守一不离 · 大道至简 · 三清终结 · 官方卸载全包 | **v9.9.32** ★ | `dao-proxy-min-9.9.32.vsix` |

## 装

```bash
windsurf --install-extension dao-proxy-min-9.9.32.vsix
```

或图形界面拖入 Windsurf · 或命令面板 → "Install from VSIX..."。

**卸载 (大道至简)**:
```
Extensions面板 → 道Agent → [✘] Uninstall → Reload Window
# 官方全包 · 无需额外操作 · 真水过无痕
```

## 印164 · 一气化三清 · 竣工

### 第一清 · 卸载大道至简

`deactivate()` **极简 5 步** (印164 -76行):

```
① passthrough → ② unhook → ③ 清锚(settings.json) → ④.5 停外接API → ⑤ dispose webview → ⑥ proxyStop
```

- ✂ 删 `forceRestartLS()` — 不主动杀 LS · 官方 Reload Window 时 LS 自然重启直连官方
- ✂ 删 `.obsolete` 自写逻辑 — 信任官方 VSCode 卸载机制
- ✂ 删 净卸伴侣 — 持存文件在 ext 目录内 · 官方卸载自动清
- ✅ `settings.json` 锚已在 ③ 清除 · LS 下次重启直连官方
- ✅ 官方 `[✘]` + Reload Window 全包 · **无固化 · 无残留**

### 第二清 · 终端零污染

`DaoTerminalPool` — OS 进程级隔离 · 多 Agent 零交织:

- ✅ **15/15 PASS** (印164 再验)
- ✅ 10 并发零字节交织
- ✅ 多会话 cwd / env / 退出码完全隔离
- ✅ 七层污染一招治 · ext-host 内无 IDE 终端污染

### 第三清 · Windsurf重载根治

`source.js` **五药全到位** (v9.9.30 印162 真治 · 印164 确认):

| 药 | 位置 | 效果 |
| --- | --- | --- |
| 写盘 slim (`_capForDisk`) | head 3KB + tail 256B | 磁盘写量 -99% |
| 写盘 async (`fs.writeFile`) | 非 writeFileSync | 主线程不阻 |
| 写盘 debounce 500ms | 连续仅触一次 | N 次推理只写一次 |
| 观察后置 `setImmediate` | 转发先行 · 观察异步 | 大对话不堵主线程 |
| `process.on` 顶层安装 | globalThis 幂等 | ext-host require 路径永装 |

## 版本演进

| 版本 | 印 | 核心成就 |
| --- | --- | --- |
| v9.9.27 | 158 | 软编码彻终 + selfWatchdog |
| v9.9.28 | 159 | detached spawn + 双账号首次同步 |
| v9.9.29 | 160/161 | DaoTerminalPool 15/15 · 七层污染治 |
| v9.9.30 | 162 | 写盘三损 + setImmediate + process.on顶层 |
| v9.9.31 | 163 | webview卸载按钮删 + dao.purge删 |
| **v9.9.32** | **164** | **deactivate极简(-76行) · 三清终结 · 大道至简** ★ |

## 印 (帛书《老子》)

> 损之又损 · 以至于无为 · 无为而无不为
> — 四十八章

> 反者道之动 · 弱者道之用
> — 四十章

> 道恒无名 · 朴唯小 · 而天下弗敢臣 · 侯王若能守之 · 万物将自宾
> — 三十七章

> 为之于其未有也 · 治之于其未乱也
> — 六十四章

---

**vsix 信息**:

- `dao-proxy-min-9.9.32.vsix` · **108.6 KB** (111217 B) · 印164 大道至简 三清终结 ★
- `rt-flow-2.7.5.vsix` · 121.1 KB (主公附)

**双账号同步**:
- `origin` = `https://github.com/zhouyoukang/windsurf-assistant.git` (主)
- `spec`   = `https://github.com/zhouyoukang1234-spec/windsurf-assistant.git` (子 · 镜)

---

「**损之又损 · 以至于无为 · 无为而无不为**」 — 四十八章 · 大道至简 · 官方卸载全包 · 万物自宾.
