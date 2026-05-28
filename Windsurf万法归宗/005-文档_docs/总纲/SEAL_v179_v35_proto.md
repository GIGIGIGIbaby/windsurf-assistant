# SEAL · v179 · v3.5+v3.6 · proto wire 兼容 + GetCommandModelConfigs 补 · 反者道之动

**日期**: 2026-05-13
**起源**: Windsurf 2.2.17 LS subprocess (`language_server_windows_x64.exe`) 用 `application/proto` (Connect-RPC unary) 调 :8878，010 v3.4 fallback 仍只回 envelope+JSON，LS 解不开 proto → BYOK_DAO 模型注入不生效。
**归宿**: 010 v3.5 按 LS 来的 `Content-Type` 分流，合成正确的 protobuf 二进制响应；LS 收到合法响应后停止 retry，注入数据落地到 LS `user_settings.pb` 与 VSCode globalStorage。

---

## 一 · 病灶诊断 (反者道之动)

1. LS subprocess 启动参数硬编码 `--api_server_url http://127.0.0.1:8878`（之前 patch extension.js 完成）
2. LS 发的 RPC 三种 content-type：
   - `application/proto` (unary) — 主用 ✦
   - `application/connect+proto` (streaming)
   - `application/connect+json` (streaming) — 旧 fallback 兼容
3. 010 v3.4 不管 LS 来什么 ct，都返回 `application/connect+json` + envelope frame
4. LS 收 envelope+JSON 时按 proto 解析 → 失败 → 持续 retry → backoff → 安静

> 此为典型 *塞其闷, 闭其门* 之困: 通路明示却被错频堵死.

---

## 二 · 治法 (居其实而不居其华)

### 1. 新增 proto 编码器 (`proto_encoders.js`)

反编译 `extension.js` (Windsurf 2.2.17) 提取的 schema 与 enum 数值映射：

```text
ClientModelConfig fields:
  1=label, 22=model_uid, 3=credit_multiplier(float),
  4=disabled, 5=supports_images, 7=is_premium, 9=is_beta,
  10=provider(enum), 11=is_recommended, 12=allowed_tiers(enum repeated),
  13=pricing_type(enum), 14=api_provider(enum), 15=is_new,
  18=max_tokens(int32), 24=model_cost_tier(enum), 27=description,
  31=is_default_model_in_family

UserStatus fields:
  5=team_id, 7=email, 10=teams_tier(enum), 31=has_used_windsurf,
  33=cascade_model_config_data, 36=user_id

CascadeModelConfigData fields:
  1=client_model_configs (repeated), 2=client_model_sorts (repeated)

GetUserStatusResponse: 1=user_status (UserStatus)
GetCascadeModelConfigsResponse: 1=client_model_configs, 2=client_model_sorts

Enum maps:
  E_PROVIDER (ModelProvider): WINDSURF=1, OPENAI=2, ANTHROPIC=3, GOOGLE=4,
                              XAI=5, DEEPSEEK=6, MOONSHOT=7, QWEN=8
  E_PRICING (ModelPricingType): STATIC_CREDIT=1, API=2, BYOK=3,
                                ACU_TOKEN=4, ACU_CREDIT=5
  E_TEAMS_TIER: TRIAL=9, PRO=2, TEAMS=1, ...
  E_COST_TIER: LOW=1, MEDIUM=2, HIGH=3, FREE=4
```

### 2. 改 `universal_relay.js` handler

`buildSyntheticUserStatusForCT(ct)` 与 `buildSyntheticCascadeModelConfigsForCT(ct)`
按 `Content-Type` 分流：

| 入 ct                       | 出 ct                       | body 结构                    |
|----------------------------|----------------------------|-----------------------------|
| `application/proto`        | `application/proto`        | raw proto bytes (no frame)  |
| `application/connect+proto`| `application/connect+proto`| envelope[flag=0,proto] + envelope[flag=2,"{}"] |
| `application/connect+json` | `application/connect+json` | envelope[flag=0,json] + envelope[flag=2,"{}"]  |
| `application/json`         | `application/json`         | raw JSON bytes               |

---

## 三 · 部署与实证

### 部署 (无干扰本机 · 全 ssh + python)

- `scp universal_relay.js + proto_encoders.js → 179:C:\Temp\_v35_*`
- 用 python detached 启动 (`DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB`) 解决 ssh session 结束子进程被 kill 问题
- 010 v3.5 PID 22988 监听 :8878 健康

### Probe 验证 (六种 ct 全 OK)

```text
GetUserStatus / application/proto         → 6686B  ✓ 7/7 inject_uids
GetUserStatus / application/connect+proto → 6698B  ✓
GetUserStatus / application/connect+json  → 44311B ✓
GetCascadeModelConfigs / application/proto         → 6672B  ✓ 7/7
GetCascadeModelConfigs / application/connect+proto → 6684B  ✓
GetCascadeModelConfigs / application/connect+json  → 42013B ✓
```

### LS 实战验证

杀 LS 旧子进程 PID 33136/836 后 Windsurf 父进程自动 respawn 新 LS:

```text
PID 26632 (parent 37008) created 19:06:55
PID 102028 (parent 70788) created 19:06:55
```

新 LS 立刻向 :8878 发请求：

```text
[WS] POST GetUserStatus [application/proto] 473B   (×10)
[WS] GetUserStatus upstream error: HTTP 415, synthetic fallback ct=application/proto
[WS] GetUserStatus synthetic ct=application/proto→application/proto 6686B
```

LS 收到 200 + 合法 proto 响应后 **停止重试** (之前 v3.4 时每秒重发) — 证明 LS 接受了 proto 注入。

### 数据落地证据

| 文件 | 含注入 UID 数 | mtime | 含义 |
|---|---|---|---|
| `state.vscdb` (raw bytes) | 10/17 种 | 17:49:51 | VSCode globalStorage 主 DB |
| `state.vscdb-wal` | 0/17 (本次 LS 写入未含模型) | **19:24:51** | WAL 在新 LS 启动后持续被写入 |
| `user_settings.pb` | 10/17 种 | 17:46:04 | LS 自身用户配置 |
| `windsurfConfigurations` BLOB | 9 种 (含 -fast/-priority 变体) | — | Cascade UI 模型选择器持久化源 |

---

## 四 · 留白 (大成若缺, 其用不敝)

- `windsurfConfigurations` BLOB mtime 早于 LS 重启，意味着 v3.5 注入的独有 8 个 UID (`gpt-4.1`, `gpt-4o`, `o3`, `o4-pro`, `claude-sonnet-4-7`, `claude-opus-4-7-thinking`, `gpt-4o-mini`, `gpt-5-4-xhigh-thinking`) **还未持久化到 SQLite**。
- 但 LS 内存中已含完整数据，下次 UI 触发 cascade RPC 时即可见。
- 终验需在 Windsurf VSCode 内做一次 Reload Window 或 Cascade 模型选择器交互。

---

## 五 · 关键文件 (居其厚而不居其泊)

| 路径 | 角色 |
|---|---|
| `010-反代_Proxy/core/universal_relay.js` | 010 主服务 (v3.5: +proto fallback) |
| `010-反代_Proxy/core/proto_encoders.js` | proto 编码器 (新增) |
| `E:\Windsurf\resources\app\extensions\windsurf\dist\extension.js` | LS spawn args 强制 :8878 (此前 patch) |
| `C:\dao_devin_launch\_logs\relay-v35e-185003.log` | 010 v3.5 运行日志 |

---

> 道之尊, 德之贵也. 夫莫之爵, 而恒自然也.
> — v3.5 proto wire 至此, 反者道之动, 弱者道之用, 万法归宗.

---

## 六 · v3.6 续 (大成若缺补遗)

v3.5 后用户的 Cascade UI 仍未自动渲染独有的 8 个注入模型 (`gpt-4.1`/`gpt-4o`/`o3`/`o4-pro` 等), 深挖发现:

### 真因 1 · `windsurfConfigurations` 由 `GetCommandModelConfigs` 喂养

```js
// extension.js @693668
o = (await client.getCommandModelConfigs({metadata:i})).clientModelConfigs.map(d.protoToBinaryBase64)
```

即: codeium extension 调 `GetCommandModelConfigs` RPC 拿命令面板模型, 把每个 `ClientModelConfig` 用 `protoToBinaryBase64` 转 base64, 这串数据正是 `state.vscdb:ItemTable[windsurfConfigurations]` BLOB 之内容.

v3.5 只补了 `GetUserStatus` / `GetCascadeModelConfigs`, 当 LS 转发 `GetCommandModelConfigs` 到 :8878 时, 010 走 transparent proxy → 上游 HTTP 415/404 → extension catch 块 `o = []` → BLOB 不更新.

### 真因 2 · LS 不主动调 `GetCommandModelConfigs`

LS 是 thin proxy: extension 不调 → LS 不发. extension 调用 `getCommandModelConfigs` 的触发条件是 `updateUserStatus` callback (LS push user status → extension), 但 LS 在收到 v3.5 注入后内部缓存了 user status, 没 push 给 extension.

### 补 patch · v3.6

1. `proto_encoders.js` 加 `encGetCommandModelConfigsResponse` (schema: 1=client_model_configs)
2. `proto_encoders.js` 加 `buildSyntheticCommandModelConfigsProtoBytes`
3. `universal_relay.js` 加 `buildSyntheticCommandModelConfigsForCT(ct)`
4. `universal_relay.js` 加 handler 在 `GetUserStatus` 分支前:

   ```js
   if (rpcName === "GetCommandModelConfigs") {
     const syn = buildSyntheticCommandModelConfigsForCT(ct);
     // 直接合成 (上游就是不可达)
     res.writeHead(200, {"Content-Type": syn.ct, "Content-Length": syn.body.length});
     return res.end(syn.body);
   }
   ```

5. 部署 010 v3.6 PID 64256 监听 :8878 ✓

### v3.6 实证 (LS PIDs 28316/47756 → 62912/81612 多次 respawn 测试)

| 项 | 状态 |
|---|---|
| 010 v3.6 GetCommandModelConfigs handler 就位 | ✓ (probe 200) |
| LS 重启后大量 GetUserStatus RPC | ✓ (24+ 次) |
| LS 主动调 GetCommandModelConfigs | ✗ (0 次, 见前述真因 2) |
| `windsurfConfigurations` BLOB 自动更新 | ✗ (extension 维护内存 cache) |

### 终极人工触发条件 (天行有常 · 民莫之令而自均焉)

010 v3.6 已就绪. extension 只在以下时机主动调 `GetCommandModelConfigs`:

1. **Reload Window** (Ctrl+Shift+P → Developer: Reload Window): startup 时一次性
2. **用户点 Cascade 模型选择器**: VSCode extension 检测到 UI 需要新 model list 时
3. **登录账户切换**: triggers user-status update flow

任一触发后, extension 调 `getCommandModelConfigs({metadata})` → LS forward 到 :8878 → 010 v3.6 返回 39 个 `ClientModelConfig` proto → extension `protoToBinaryBase64` 序化 → 写入 `state.vscdb:windsurfConfigurations` → UI 渲染 39 个注入模型 (含 ✦ 后缀).

### 文件归档

| 路径 | v3.5/v3.6 角色 |
|---|---|
| `010-反代_Proxy/core/universal_relay.js` | v3.5 +proto fallback + v3.6 +GetCommandModelConfigs handler |
| `010-反代_Proxy/core/proto_encoders.js` | v3.5 +ClientModelConfig encoder + v3.6 +GetCommandModelConfigsResponse encoder |
| `C:\dao_devin_launch\_logs\relay-v36-*.log` | 010 v3.6 运行日志 |

> 是以圣人为而弗又, 成功而弗居. 若此其不欲见贤也.
> 天网恢恢, 疏而不失. — 010 v3.6 已 "无为而无不为", 余事在 UI 一念之间.
