# 道舰队 · 云原生并行 · 印 165
> 「道生一 · 一生二 · 二生三 · 三生万物」 帛书·四十二  
> 「天下之至柔 · 驰骋于天下之致坚 · 无有入于无间」 帛书·四十三  
> 「独立而不垓 · 可以为天地母」 帛书·廿五  
> 「损之又损 · 以至于无为 · 无为而无不为」 帛书·四十八

---

## 一、总体架构

```
╔═══════════════════════════════════════════════════════════════════════╗
║               道舰队 · 印 165 · 云原生全闭环                          ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  云端 (VPS / Docker Fleet)                                            ║
║  ┌─────────────────────────────────────────────────────────────┐     ║
║  │ VM-001: fleet_vm_unit.js · 账号1 · SP1 → Windsurf/Cascade  │     ║
║  │ VM-002: fleet_vm_unit.js · 账号2 · SP2 → Windsurf/Cascade  │     ║
║  │ VM-003: fleet_vm_unit.js · 账号3 · SP3 → Devin Cloud       │     ║
║  │   ...                                                        │     ║
║  │ VM-150: fleet_vm_unit.js · 账号150 · SP→ 多模型并行         │     ║
║  └─────────────────────────────────────────────────────────────┘     ║
║          │ cloudflare tunnel → 公网 HTTPS URL                        ║
║          ▼                                                            ║
║  fleet_controller.js (注册/心跳/摘除/路由)                           ║
║          │                                                            ║
╠══════════╪════════════════════════════════════════════════════════════╣
║          ▼  本地 (极简 · 零业务逻辑)                                 ║
║  local_gateway_min.js :7880                                           ║
║  (仅 fleet route 选择 + HTTP 代理转发)                               ║
║          │                                                            ║
║  OpenAI/Anthropic/Gemini 标准客户端                                  ║
║  dao_cloud.html 管理面板                                              ║
╚═══════════════════════════════════════════════════════════════════════╝
```

### 核心原则 (帛书·四十八)
- **云端**: 所有业务逻辑 · SP注入 · 账号管理 · 模型协议
- **本地**: 最轻量 · 仅接收 API · 仅路由转发 · 不含任何 AI 业务
- **隔离**: 每 VM 独立 SP · 独立账号 · 独立指纹 · 独立出口 IP

---

## 二、文件清单 (印 165 新增)

| 文件 | 职责 | 尺寸估 |
|------|------|--------|
| `docker/Dockerfile.unit` | 单账号VM最小镜像 (~45MB) | 新建 |
| `docker/entrypoint.unit.sh` | VM启动器 (cloudflare tunnel + 注册) | 新建 |
| `_kernel/fleet_compose_gen.js` | 动态生成150+ docker-compose | 新建 |
| `_kernel/fleet_parallel_test.js` | 并行测试Claude4.7/GPT5.5 | 新建 |
| `_kernel/local_gateway_min.js` | 本地极简网关 :7880 | 新建 |
| `→全军起.cmd` | 一键拉起/停止/测试全舰队 | 新建 |
| `web/dao_cloud.html` | 扩展: 舰队+测试面板导航 | 修改 |
| `web/dao_cloud.js` | 扩展: §F1-F6 舰队管理逻辑 | 修改 |
| `web/dao_cloud.css` | 扩展: VM卡片/测试结果样式 | 修改 |

### 已有基础 (上期 印 164 及以前)

| 文件 | 职责 |
|------|------|
| `_kernel/fleet_controller.js` | Fleet 控制核心 (注册/心跳/路由) ✅ |
| `_kernel/fleet_vm_unit.js` | 单VM微服务 (双路 Windsurf+Devin) ✅ |
| `_kernel/cloud_engine.js` | Windsurf 底层协议 ✅ |
| `_kernel/sp_handler.js` | SP 提示词管理 (3模式) ✅ |
| `_kernel/dao_accounts.js` | 账号池 (154账号) ✅ |
| `_kernel/admin_server.js` | Admin HTTP + fleet 路由 ✅ |
| `docker/Dockerfile` | 单容器基础设施 ✅ |

---

## 三、VM 单元架构

```
dao-fleet-unit 镜像 (每账号一个)
┌─────────────────────────────────────────────────────┐
│  环境变量:                                           │
│    DAO_FLEET_API_KEY   = sk-ws-01-xxx 或 devin-...   │
│    DAO_FLEET_ACCOUNT   = user@example.com             │
│    DAO_FLEET_UNIT_ID   = unit-001                     │
│    DAO_FLEET_SECRET    = fleet-xxx (注册身份)         │
│    DAO_FLEET_CONTROLLER= http://host:7870             │
│    DAO_SP_MODE         = passthrough|dao|custom       │
│    DAO_CLOUDFLARE_TUNNEL = 0|1                        │
│                                                       │
│  进程: fleet_vm_unit.js --port 7862 --public         │
│                                                       │
│  端点:                                                │
│    POST /v1/chat/completions  (A路 Windsurf)         │
│    POST /dc/v1/chat/completions (B路 Devin Cloud)    │
│    GET  /v1/models                                    │
│    GET  /health · /fleet/info                        │
│    POST /sp/mode · GET /sp/state (SP 管理)           │
│    POST /auth/* (windsurf_auth 登录流)               │
│                                                       │
│  SP 隔离:                                             │
│    ~/.dao/sp_state.json (容器内独立 · 不共享)         │
│    三模式: passthrough / dao(帛书) / custom           │
└─────────────────────────────────────────────────────┘
         │ cloudflare tunnel (可选)
         ▼
  https://xxx.trycloudflare.com (公网 HTTPS)
         │
  向 fleet_controller 注册 (POST /admin/fleet/register)
```

---

## 四、快速起步

### 4.1 首次部署 (全流程)

```cmd
cd e:\道\道生一\一生二\Windsurf万法归宗\130-道独立体_Standalone

:: 一键: 构建镜像 → 生成 compose → 拉起所有 VM → 测试
→全军起.cmd

:: 带 cloudflare tunnel (获取公网 URL)
→全军起.cmd --tunnel

:: 指定 SP 模式 (全舰队使用帛书《老子》)
→全军起.cmd --sp dao

:: 只部署前 20 个账号 (测试)
→全军起.cmd --max 20
```

### 4.2 分步操作

```cmd
:: 仅生成 fleet-compose.yml
→全军起.cmd --gen-only

:: 仅拉起 (已有 compose)
→全军起.cmd --up-only

:: 并行模型测试 (Claude 4.7 + GPT 5.5)
→全军起.cmd --test

:: 停止全军
→全军起.cmd --stop

:: 查看状态
→全军起.cmd --status
```

### 4.3 独立命令

```cmd
:: 生成 fleet-compose.yml (自定义)
node _kernel/fleet_compose_gen.js --sp dao --tunnel --max 150

:: 本地极简网关
node _kernel/local_gateway_min.js --port 7880 --mode best-quota

:: 并行模型测试 (命令行)
node _kernel/fleet_parallel_test.js --port-start 18100 --count 150

:: 长链路压测 Claude 4.7 × GPT 5.5
node _kernel/fleet_parallel_test.js --long-chain --concurrency 5

:: 测试指定模型
node _kernel/fleet_parallel_test.js --model claude-opus-4-7-max --gateway http://127.0.0.1:7880
```

---

## 五、管理面板新增功能

### 5.1 舰队面板 (导航: 舰队)

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚡ 道舰队 · 云原生并行 · 印 165  [⚙生成] [▶拉起] [■停] [↻]    │
├────────┬────────┬────────┬────────┬────────┬────────────────────┤
│  150   │  148   │   1    │   1    │  D42%  │  本地网关          │
│ 总 VM  │ 活跃   │ 限速   │ 离线   │ 均配额 │  在线              │
├─────────────────────────────────────────────────────────────────┤
│ 全舰队 SP: ○透传 ○道 ○自定  [广播 SP]                          │
├─────────────────────────────────────────────────────────────────┤
│ [搜索账号/ID] [全部▼]  148/150 个 VM                           │
├──────────────────────────────────────────────────────────────── │
│ ┌unit-001┐ ┌unit-002┐ ┌unit-003┐ ┌unit-004┐ ┌unit-005┐ ...   │
│ │abc...  │ │def...  │ │ghi...  │ │jkl...  │ │mno...  │       │
│ │D23%    │ │D45%    │ │D78%    │ │D12%    │ │D67%    │       │
│ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 测试面板 (导航: 测试)

```
┌─────────────────────────────────────────────────────────────────┐
│ 🧪 并行模型测试  [▶启动] [⚡长链路] [■停止] [↓导出]            │
├─────────────────────────────────────────────────────────────────┤
│ 并发: [20]  超时: [30000ms]  Prompt: [道可道，非恒道...]        │
├─────────────────────────────────────────────────────────────────┤
│ ☑Claude4.7 ☑Sonnet4.7 ☑GPT-5.5 □GPT5.5T ☑GPT-4o □Cascade   │
├─────────────────────────────────────────────────────────────────┤
│ ████████████████████████░░░ 890 / 1050                         │
├──────────┬────────┬────────┬────────┬────────────────────────── │
│ C·opus4.7│C·son4.7│G·5.5   │G·4o    │...                      │
│  94%     │  97%   │  88%   │  99%   │                          │
│ 141/150  │145/150 │132/150 │148/150 │                          │
│ ~3420ms  │~2180ms │~4560ms │~1890ms │                          │
├─────────────────────────────────────────────────────────────────┤
│ ✓ unit-001  claude-opus-4-7-max  3421ms  反者道之动...         │
│ ✓ unit-002  claude-sonnet-4-7   2183ms  天下之至柔...          │
│ ✗ unit-003  gpt-5.5            TIMEOUT  Connection timeout     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 六、SP 隔离管理

每 VM 独立 SP 配置，三个层次：

```
全局广播 (管理面板 → 全舰队):
  mode=dao      · 所有 VM 注入帛书《老子》全文作 system
  mode=pass     · 所有 VM 透传 (不改 system)
  mode=custom   · 所有 VM 使用自定义文本

per-VM 独立:
  VM 卡片 → hover → SP按钮 → 单独设置此 VM 的 mode

生效路径:
  POST /sp/mode → fleet_vm_unit sp_handler
  ~/.dao/sp_state.json (容器内隔离 · 不跨 VM)
```

---

## 七、模型目标 (Claude 4.7 × GPT 5.5 长链路)

### Claude 4.7 系
| 模型 UID | 说明 | 路由 |
|----------|------|------|
| `claude-opus-4-7-max` | Claude 4.7 Opus Max (最强) | Windsurf |
| `claude-sonnet-4-7` | Claude Sonnet 4.7 | Windsurf |
| `claude-sonnet-4-7-thinking` | Sonnet 4.7 + Extended Thinking | Windsurf |

### GPT-5.5 系
| 模型 UID | 说明 | 路由 |
|----------|------|------|
| `gpt-5.5` | GPT-5.5 | Windsurf |
| `gpt-5.5-turbo` | GPT-5.5 Turbo (快速) | Windsurf |
| `o3` | o3 推理模型 | Windsurf |

### 长链路测试场景
```
5步骤复合任务:
1. 哲学层: 「反者道之动」→ 微服务降级原则映射
2. 架构层: 一虚拟机一账号一反代 数据流 ASCII 图
3. 代码层: round-robin 负载均衡器 JS 实现
4. 验证层: Claude4.7 vs GPT5.5 代码差异对比测试用例
5. 总结:  帛书风格四句总结

对比维度: 响应长度 / 质量 / 延迟 / 逻辑一致性
```

---

## 八、端口规划

| 服务 | 端口 | 说明 |
|------|------|------|
| `admin_server.js` | :7870 | 管理面板 + fleet 控制 |
| `道直连器.js` | :7861 | 本地 kernel (三协议) |
| `local_gateway_min.js` | :7880 | 本地极简网关 (fleet 转发) |
| `fleet-unit-001` | :18100 | 账号1 VM |
| `fleet-unit-002` | :18101 | 账号2 VM |
| `...` | `:18100+N` | ... |
| `fleet-unit-150` | :18249 | 账号150 VM |

---

## 九、后续行动

### 立即可执行
```
1. →全军起.cmd --max 5   (先测试 5 个 VM)
2. 打开 http://127.0.0.1:7870/dao_cloud.html → 舰队页
3. 点「▶ 一键拉起」验证 5 VM 全活
4. 切到「测试」页 → 启动并行测试 → 验证 Claude 4.7 / GPT 5.5
5. 验证通后: →全军起.cmd (全 150 VM)
```

### 下期 (印 166+)
- [ ] Fly.io / Railway 真正的云端部署脚本 (替代本地 Docker)
- [ ] VM 自动补充 (账号耗尽 → genesis_bridge 自动 forge 新账号)
- [ ] SP 版本管理 (git 形式追踪每次 SP 改动)
- [ ] Claude 4.7 × GPT 5.5 对比评估报告自动生成
- [ ] fleet_controller webhook (VM 宕机 → 自动告警 + 重启)

---

> 「慎终若始 · 则无败事矣」 帛书·六十四  
> 一切核心功能运行于云端 VM · 本地仅做最轻量接收  
> 150+ 账号 = 150+ VM = 150+ 反代 = 并行无限制使用一切模型
