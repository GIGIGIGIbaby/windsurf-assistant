# 水之四德 · `_water_virtues.js` 完善纪要

> 上善若水。水善利万物而不争, 处众人之所恶, 故几于道。
> 居善地, 心善渊, 与善仁, 言善信, 政善治, 事善能, 动善时。
> 夫唯不争, 故无尤。

## 一、为何加此补丁

诊断 (反者道之动) 发现 Windsurf 卡顿之根本机理:

1. **三宫并立** — 多 Windows 用户 (zhou / zhou1 / Administrator) 同时运行 Windsurf, 各自加载一份完整 WAM 引擎。
2. **多重并发定时器** — 单实例 6+ 个定时器 (3s 监测 / 1.5s 突发 / 45s 扫描 / 30s 心跳 / 5s 锁 / 60s 预热), 三宫并立 → 18+ 并发。
3. **切号死循环** — 4 通道 (direct-auto / proxy / direct-raw / native) 全 timeout 时, 程序立即重试同一号, `wam.log` 高速膨胀至 28MB+。
4. **互抢账号锁** — `instance_claims.json` 跨实例互踢, 自相打架。
5. **日志无限增长** — 无 rotation 机制, 月度日志 GB 级膨胀触发文件系统压力。

最终导致 Windows Desktop Heap / GDI Object 饱和, 系统级 fork 失败 (`STATUS_DLL_INIT_FAILED`), 用户感知为 "对话不输出 / 插件不响应 / 命令延迟"。

## 二、四德设计 (大成若缺, 其用不弊)

`_water_virtues.js` 是一个**自包含、零依赖、可逆**的 monkey-patch 模块。
require 后立即生效, 不动任何既有代码:

### 一德 · 选举 (Leader Election)

- 文件锁: `~/.wam-hot/.water_leader.lock` (`{ pid, ts }`)
- 每 60 秒续锁; TTL 90 秒。
- 多实例并立时, 仅 leader 记自己为 LEADER, 其他记为 FOLLOWER。
- LEADER 进程死亡后, 其他实例自动接管。

### 二德 · 降频 (Idle / Follower Throttle)

monkey-patch `global.setInterval`:

- FOLLOWER 实例: 所有 ≥1s 定时器 ×3 倍 (减 67% 频率)
- 用户 IDLE > 10 分钟 (无键盘 / 编辑 / 焦点变化): 再 ×4 倍
- 复合最大上限 5 分钟 (避免完全冻结)

→ 三宫并立时的轮询压力从 18+ 降至 ≤ 6 并发。

### 三德 · 滚切 (Log Rotation)

monkey-patch `fs.appendFileSync` / `fs.appendFile`:

- 任何 `*.log` 写入前, 至多每 30 秒检查一次大小
- 超过 5MB → `rename` 为 `.old` (保留一份历史)
- 不删除任何数据, 不破坏业务流

→ `wam.log` 永不会 > 10MB (5MB 主 + 5MB .old)。

### 四德 · 熔断 (Circuit Breaker)

monkey-patch `https.request` / `https.get` / `http.request` / `http.get`:

- 同一 host 在 60 秒窗口内累计失败 ≥ 10 次 → 熔断 5 分钟
- 熔断期内的请求**立即返回错误** (不真正发包), 不堵 socket、不写日志、不重试
- 5 分钟后自动半开探试
- 本地 host (`127.0.0.1` / `localhost`) 永不熔断 (反代/中继不受影响)

→ 切号死循环被根斩: Devin login 4 通道全失败累计, fastly/gcore CDN auto-update 失败累计, 都将进入熔断期。

## 三、激活点 (require 处)

| 路径 | 已加载 | 备注 |
|---|---|---|
| `~/.wam-hot/_water_virtues.js` | ✓ | 当前运行版本即时治标 (重启 Windsurf 后生效) |
| `010-WAM本源_Origin/_github_src/packages/wam/_water_virtues.js` | ✓ | WAM 主体本源, vsix 打包后随发布带 |
| `020-道VSIX_DaoAgi/dao-agi/_water_virtues.js` | ✓ | dao-agi 本源, vsix 打包后随发布带 |

三处 `extension.js` 顶部各加一行 (失败也 noop, 不影响主插件):

```js
try { require("./_water_virtues.js"); } catch (_e) {}
```

## 四、可调参数 (env 覆盖, 不需重打 vsix)

```bash
DAO_WATER_ELECTION_TTL_MS=90000        # 锁 TTL
DAO_WATER_ELECTION_HEART_MS=60000      # 心跳
DAO_WATER_FOLLOWER_SLOWDOWN=3.0        # follower 减速倍数
DAO_WATER_IDLE_AFTER_MS=600000         # idle 阈值 (10 分钟)
DAO_WATER_IDLE_SLOWDOWN=4.0            # idle 减速倍数
DAO_WATER_LOG_MAX_BYTES=5242880        # 日志滚切阈值 (5MB)
DAO_WATER_CB_FAIL_THRESHOLD=10         # 熔断阈值
DAO_WATER_CB_FAIL_WINDOW_MS=60000      # 熔断窗口
DAO_WATER_CB_OPEN_MS=300000            # 熔断时长 (5min)
DAO_WATER_LOG=~/.wam-hot/water.log     # 水德日志位置
```

## 五、运行时检查

水德活动日志在: `~/.wam-hot/water.log`

```
[2026-04-25T...] [boot] water_virtues active · pid=24948 role=LEADER · cfg=...
[2026-04-25T...] [election] follower · leader=pid24948 (locked 30s ago)
[2026-04-25T...] [rotate] wam.log (5.1MB) → .old
[2026-04-25T...] [circuit] OPEN api.codeium.com for 5min (fail=10 in 60s)
```

通过 `node` REPL (在 Windsurf 内嵌终端):

```js
require('~/.wam-hot/_water_virtues.js').snapshot()
// {
//   activated: true, pid: 24948, role: 'LEADER',
//   upMs: 600000, idle: false,
//   intervalCount: 23, intervalThrottled: 12,
//   cbHosts: 2, cbBlocked: 0, rotChecked: 1,
// }
```

## 六、卸载

三种方式任一:

1. **温和**: 删除三处 `_water_virtues.js`, 主插件 require 失败 → noop, 一切回到补丁前。
2. **彻底**: 删除三处 `extension.js` 顶部 require 一行 + 三处 `_water_virtues.js`。
3. **临时禁用**: `set DAO_WATER_FOLLOWER_SLOWDOWN=1.0 & set DAO_WATER_IDLE_SLOWDOWN=1.0` (取消降频)。

## 七、与既有机制兼容

- **不动** WAM 切号链路: `_devinLogin` / `_firebaseLogin` / `_afterSwitchSuccess` 等仍在; 只是失败累计达阈后**外层熔断**, 不再无限重试。
- **不动** 切号 UI: 用户仍可手动 `wam.switchAccount` 立刻切; 熔断只阻 LS 自动重试。
- **不动** state.vscdb 写入: log rotation 只针对 `*.log`, 不动数据库。
- **不动** dao-agi essence/SP 注入: `_water_virtues.js` 不修改任何业务模块。

## 八、当前部署状态 (2026-04-25)

| 项 | 状态 |
|---|---|
| `~/.wam-hot/_water_virtues.js` | ✓ 已写入 |
| `~/.wam-hot/extension.js` | ✓ 已注入 require |
| `010/.../wam/_water_virtues.js` | ✓ 已写入 |
| `010/.../wam/extension.js` | ✓ 已注入 require |
| `020/dao-agi/_water_virtues.js` | ✓ 已写入 |
| `020/dao-agi/extension.js` | ✓ 已注入 require |

> ⚠ Windsurf 已加载的旧 extension.js 在内存中, **必须 Reload Window** (Ctrl+Shift+P → `Developer: Reload Window`) 或重启 Windsurf 才能生效。

## 九、下一步建议 (大制不割)

1. 一刀斩 zhou1 / Administrator 实例 (任务管理器手动 kill, 不依赖 fork)
2. Windsurf 内 `Ctrl+Shift+P` → `Developer: Reload Window` 让水德接入
3. 观察 `~/.wam-hot/water.log` 5 分钟, 应见 `[boot]` `[election]` `[rotate]` `[circuit]` 等记录
4. 观察 `~/.wam-hot/wam.log` 应停止疯涨 (滚切到 5MB 即 `.old`)
5. 任务管理器 Windsurf.exe 数应稳定在 ≤ 12

> 大方无隅, 大器晚成, 大音希声, 大象无形。 道隐无名, 夫唯道, 善贷且成。
