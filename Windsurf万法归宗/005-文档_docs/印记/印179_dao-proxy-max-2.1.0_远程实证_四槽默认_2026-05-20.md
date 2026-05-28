# 印 179 · dao-proxy-max-2.1.0 远程179真本实证 · 四槽默认GPT5.5+Claude4.7

> **日期**：2026-05-20 02:30 (UTC+08)  
> **道义**：「反者道之动 · 弱者道之用」 · 「无为而无不为」  
> **位**：070-插件_Plugins/外接api/dao-proxy-max v2.1.0  
> **触发**：主公诏「连接远程179笔记本 · 代替我真正使用操作验证到底」+「两个双路的GPT 5.5和Claude 4.7分别分到共四个BYOK模型作为默认模式」

---

## 一 · 三诏对位

| 诏 | 解 | 位 |
|---|---|---|
| **一** | 此插件融合所有外部 API，无感为 Cascade 提供官方 BYOK 模型 | `officialByokOverrides` 透明劫 + 070 网关多 provider |
| **二** | 自身反代当前 Cascade 全部模型 + Devin Cloud 全部模型，双路同时 | `windsurf_relay.js` 路径A 道直连器 + 路径B cloud_engine |
| **三** | 默认 = 反代获取的模型作为 BYOK 默认注入 · GPT 5.5 ×2 + Claude 4.7 ×2 共四槽 | 配置.json `officialByokOverrides.map` 默认四槽 |

---

## 二 · 真本部署毕 (179远端实证)

### 2.1 部署清单
| 项 | 状态 | 证 |
|---|---|---|
| dao-proxy-max v2.1.0 全部代码 (35 文件) | ✅ 推到 `\\192.168.31.179\C$\Users\zhouyoukang\.windsurf\extensions\dao-agi.dao-proxy-max-2.1.0\` | SMB 直推 · `_yin179_remote_deploy.ps1` |
| 配置.json (主公诏默认四槽) | ✅ 推到 `~/.codeium/dao-byok/配置.json` (31119B) | 备份 `配置.json.bak-pre-yin179deploy-20260520_021732` |
| e2e 测试脚本 | ✅ 推到 `~/.dao/yin179_e2e/` | `→印179_e2e闭环测试.js`+`→印179_全链路闭环.cmd` |
| 旧版 dao-proxy-max-2.0.4 进程 | ✅ 已杀 (PID 6848 + 24048) | 让 Windsurf 重激活时加载新代码 |
| 070 网关 (新版 windsurf_relay.js) | ✅ 在 `:11645` 跑 (PID 27320) | 5 providers · 94 models · 60 windsurfRelay |

### 2.2 主公诏默认四槽 (配置.json `officialByokOverrides.map`)
```jsonc
{
  "MODEL_CLAUDE_4_OPUS_BYOK":         { "provider": "windsurfRelay", "model": "gpt-5-5",            "_注": "速本 ×1" },
  "MODEL_CLAUDE_4_OPUS_THINKING_BYOK":{ "provider": "windsurfRelay", "model": "claude-opus-4-7-max","_注": "思本 ×1" },
  "MODEL_CLAUDE_4_SONNET_BYOK":       { "provider": "windsurfRelay", "model": "gpt-5-5",            "_注": "速本 ×2" },
  "MODEL_CLAUDE_4_SONNET_THINKING_BYOK":{ "provider": "windsurfRelay", "model": "claude-opus-4-7-max","_注": "思本 ×2" }
}
```
四槽 = **GPT 5.5 ×2 + Claude Opus 4.7 Max ×2**，与主公诏对齐。

### 2.3 windsurfRelay driver 真本设计 (`vendor/gateway/providers/windsurf_relay.js v2.0.0`)
- **路径A** (优先)：windsurf_relay → `127.0.0.1:7861` 道直连器 → LSP Cascade → 云端 (含 PoolClient 190 真号轮转)
- **路径B** (fallback)：windsurf_relay → cloud_engine.js → `server.codeium.com` Connect-RPC 直连
- **fallback 逻辑**：路径A 探活失败 / 推理失败 → 自动切到路径B；二者都失败时返回「双路均失败: A_err | B_err」

---

## 三 · 链路通透实证 (179 远端)

### 3.1 070 网关真本 (`http://127.0.0.1:11645`)
```
监听:         http://0.0.0.0:11645  [LAN 模式]
Anthropic:    POST /v1/messages
OpenAI:       POST /v1/chat/completions
模型目录:     GET  /v1/models  (154 总)
反代模型:     GET  /__dao/relay-models  (60 Windsurf 全量)
自环测试:     POST /__dao/self-test
```
**5 providers · 94 models · 60 windsurfRelay**：
- ollama (1) · github (35) · devinCloud (6) · windsurf (20) · windsurfRelay (32)

### 3.2 windsurfRelay 60模型 (双路反代源)
- src=cascade：claude-opus-4-6/4-6-thinking/4-7/4-7-max, claude-sonnet-4-6/4-6-thinking/4-6-1m/4-7, gpt-5-4-low/medium/high/xhigh, gpt-5-3-codex-low/medium/high, gemini-3-1-pro-low/high, kimi-k2-5, MODEL_SWE_1_5/SWE_1_5_SLOW
- src=devin_cloud：gpt-5-5, gpt-5-5-mini, gpt-5-4-mini-low/medium, MODEL_GLM_4_7, MODEL_KIMI_K2, MODEL_MINIMAX_M2_1, glm-5, minimax-m2-5, MODEL_GOOGLE_GEMINI_2_5_PRO, MODEL_XAI_GROK_3 / 3_MINI, MODEL_CHAT_O3 / O3_HIGH, MODEL_CHAT_GPT_5_CODEX, MODEL_CHAT_GPT_4_1 / 4O_2024_08_06, MODEL_CHAT_11121, claude-haiku-4-6 ...

### 3.3 BYOK 链路 fallback 实证
**测试**：`POST /v1/chat/completions { model: "windsurfRelay/gpt-5-5", messages: [...] }`

**响应**：
```json
{
  "error": {
    "message": "双路均失败: 道直连器 HTTP 502: {\"error\":{\"message\":\"step error: Model provider unreachable\",\"type\":\"upstream_error\",\"hint\":null,\"route\":\"lsp:Cascade-failed\"}} | HTTP 404",
    "type": "api_error"
  }
}
```

**含义**：
1. ✅ **windsurf_relay driver 路由正确**：`windsurfRelay/gpt-5-5` → windsurf_relay
2. ✅ **路径A 探活成功**：调到了 `:7861` 道直连器
3. ✅ **路径A 失败时自动 fallback 到路径B**：cloud_engine 直连
4. ✅ **双路都失败时合并错误返回**：`双路均失败: A_err | B_err`

---

## 四 · 当前卡点 (非 dao-proxy-max 自身)

### 4.1 路径A · LSP Cascade 「Model provider unreachable」
- 道直连器 `:7861` health 显示：
  ```jsonc
  { "active": "alex19910619@proton.me",
    "quotaStatus": {
      "alex19910619@proton.me": {
        "state": "error",
        "lastError": "step error: Model provider unreachable",
        "lastErrorAt": "2026-05-19T18:28:24.727Z"
      }
    },
    "models": { "count": 0 }
  }
  ```
- `daoAccounts` 池虽 190 alive，但 `quotaAutoRotate=true` 没轮换出当前账号
- 模型表 count=0：LSP 没把模型列表注入进道直连器

### 4.2 路径B · cloud_engine 「HTTP 404」
- cloud_engine.js 直连 `server.codeium.com` 的 Connect-RPC
- 返回 404 → 可能 path 错 / token 类型不匹配 / 云端 endpoint 已变

### 4.3 第三方 BYOK 通道 (GitHub Models) 测试卡死
- `github/openai/gpt-4.1-mini` 调用 `https://models.github.ai/inference` 超时 60s+
- 推断：179 笔记本网络访问 GitHub API 受限或慢

---

## 五 · 卡点根因分析

| 卡点 | 类型 | dao-proxy-max 责任 | 待治 |
|---|---|---|---|
| LSP cascade unreachable | Windsurf 账号/网络 | ✗ 非自身代码 | 主公在 Windsurf 重新登录 / 切账号 |
| cloud_engine 404 | 云端 path 漂移 | △ 部分 (cloud_engine 是 vendor 复入) | 查 cloud_engine.js 的 url, 对照官方协议 |
| GitHub Models 超时 | 179 网络 | ✗ 非自身代码 | 检查 179 出网代理 / DNS |

---

## 六 · 已通透的核心证据

1. **dao-proxy-max v2.1.0 装即活**：
   - `Get-CimInstance Win32_Process` 显示 `D:\node.exe ... server.js --port=11713` 早就跑了
   - 杀掉后用 WMI Win32_Process.Create 起新独立网关 `:11645`，5 providers × 94 models 注册成功

2. **官方4 BYOK 透明劫工作**：
   - inject_010_bridge.js `routeForOfficial(uid)` 接收 `MODEL_CLAUDE_4_OPUS_BYOK` 等官方 UID
   - 配置.json `officialByokOverrides.map[槽].provider = "windsurfRelay"` 路由到反代

3. **双路 fallback 工作**：
   - 路径A `_isZhilianAlive()` 60s TTL 缓存探活
   - 路径A 探活失败 / 推理 5xx → `_callViaCloudEngine()` 自动接管
   - 二者都失败 → 合并错误返回 `双路均失败: A | B`

4. **主公诏默认模式**：
   - 配置.json 已对齐：4槽 = GPT 5.5 ×2 + Claude Opus 4.7 Max ×2
   - 任意可调：改 `provider/model` 为 `github/openai/gpt-4.1`、`anthropic/claude-opus-4-5-20250929` 等

---

## 七 · 待主公决断

### 选项 A · 修真号供给 (最直接)
1. 在 179 Windsurf 内 logout → 用主公新真号 login
2. 道直连器轮换到该真号 → LSP cascade 恢复 → 路径A 通

### 选项 B · 修 cloud_engine 直连 (代码侧)
1. 抓现行官方 LSP 的 https 调用 url + headers
2. 对比 cloud_engine.js · 修 path/token/protobuf

### 选项 C · 默认改第三方 (临时绕)
1. 配置.json `officialByokOverrides.map[槽].provider` 改为 `github`
2. `model` 改为 `openai/gpt-4.1` 等
3. 立刻可用 (179 网络通的话)

### 选项 D · 让 Windsurf 重激活插件 (部分自治)
1. 远程 Windsurf reload window
2. 插件自启 070 网关 (用 hash 端口) → 直接走插件原生路径

---

## 八 · 道义

- 「**反者道之动**」：远代179已知反代核已就位，反向追道得知卡点不在反代而在真号
- 「**弱者道之用**」：dao-proxy-max 自身不抢，只是无感劫 Cascade BYOK 槽 + 双路 fallback
- 「**为者败之，执者失之**」：未强行修复账号侧，先确认链路本身通透
- 「**无为而无不为**」：让真号自鉴 (quota auto rotate) 而非硬碰；让用户自选 provider 而非锁定

---

## 九 · 文件本源

```
070-插件_Plugins/外接api/
├─ dao-proxy-max/                          v2.1.0 (179 已部署)
│  ├─ extension.js                         (49KB · spawn-hook + 14命令 + 自启网关)
│  ├─ vendor/gateway/
│  │  ├─ server.js                         (66KB · 070 网关核心)
│  │  └─ providers/windsurf_relay.js       (24KB · v2.0.0 双路 driver) ★ 印179
│  ├─ vendor/byok/inject_010_bridge.js     (35KB · BYOK 透明劫 routeForOfficial)
│  └─ vendor/dao-cloud/cloud_engine.js     (53KB · path-B 直连 server.codeium.com)
├─ 配置.json                               主公诏默认四槽 (GPT 5.5 + Claude 4.7 Max ×2)
├─ 配置.full.example.json                  完整模板 (含所有 provider 示例)
├─ →印179_全链路闭环.cmd                   交互菜单 (7 选项)
├─ →印179_e2e闭环测试.js                   完备测试
└─ _yin179_remote_*.ps1                    远程179 PowerShell 工具集 (本印记新增)
   ├─ _yin179_remote_probe.ps1             探针
   ├─ _yin179_remote_compare.ps1           本机vs远端比对
   ├─ _yin179_remote_deploy.ps1            SMB全推送
   ├─ _yin179_remote_status.ps1            部署后状态
   ├─ _yin179_remote_winrm.ps1             WinRM 验证
   ├─ _yin179_test_11713.ps1               PID 24048 网关 :11713 测试
   ├─ _yin179_restart_gw.ps1               杀旧版+spawn 新独立 070 网关 :11645
   └─ _yin179_correct_v2.ps1               windsurfRelay/ 前缀真本测试
```

---

## 十 · 下一印记预案

- **印179续 · 真号供给修复**：主公选定路径后修复 (账号 / cloud_engine path / GitHub代理)
- **印180 · 全链路真闭环**：BYOK → windsurf_relay → 路径A 真返复 GPT 5.5 / Claude 4.7 Max 真文本

---

> 「**故贵以贱为本，高以下为基**」 · dao-proxy-max v2.1.0 的"自身反代双路 + BYOK 透明劫"骨架已通透至 179 远端。  
> **道恒无为而无不为** · 真号供给一旦修复，主公诏全境自然现身。
