# CSRF Token 内存提取法

> 「天下之至柔，驰骋于天下之致坚；无有入于无间。」

## 问题

Windsurf LSP (`language_server_windows_x64.exe`) 在 `server_port` 上验证 CSRF token。
Token 由扩展主机运行时生成（UUID v4），通过 `--stdin_initial_metadata` 管道传入 LSP。
**不落盘、不入日志**——纯内存态。

## 方法：MiniDump + UUID 暴力验证

### 步骤 1：定位 LSP PID

```powershell
netstat -ano | findstr ":32661.*LISTEN"
# → LISTENING  41588
```

### 步骤 2：Full MiniDump

```powershell
rundll32.exe comsvcs.dll, MiniDump <PID> C:\Users\<user>\_lsp_dump.dmp full
```

需要管理员权限。dump 大小约 200-500MB。

### 步骤 3：分块扫描 UUID v4

```powershell
# UUID v4 正则: [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
# 分 10MB 块读取避免 OOM
```

典型结果：1000-2000 个 UUID v4 候选。

### 步骤 4：Heartbeat 暴力验证

```javascript
// 每 30 个一批并发测试
POST /exa.language_server_pb.LanguageServerService/Heartbeat
Headers: { "x-codeium-csrf-token": <candidate>, ... }
// status=200 → 命中
```

典型在 ~900/1103 个候选内命中。

## 注意

- CSRF 每次 LSP 重启都变
- 扩展主机进程 (utility/node.mojom.NodeService) 也有 CSRF 但格式不同
- 从扩展主机 dump 的 UUID 无法匹配 LSP（token 由扩展生成后传给 LSP）
- 正确目标：dump **LSP 进程本身** (language_server_windows_x64.exe)

## 架构图

```
IDE Extension (PID 69300, port 64663)
    │ generates CSRF, passes via stdin
    ▼
LSP Binary (PID 41588, server_port=32661)
    │ validates CSRF on all /exa.* RPC calls
    │ sends outbound requests to api_server_url
    ▼
Router/MITM (PID 52948, port=8878)
    │ intercepts GetChatMessage, routes models
    ▼
Gateway (PID 58480, port=11435)
    │ GitHub Models API adapter
    ▼
GitHub Models / Official Upstream
```

## 自动化

参见 `tests/_yin210_全链路CSRF_e2e.cjs`

---

*2026-05-26 · 印210*
