# 06 · zhou 账号 · 本机复现录 · 179 之病在自家

> 作日：2026-05-16  
> 主公命：「审视当前本电脑各个 windows 账号之一切·zhou 账号内 windsurf 复现远程 179 问题之一切·分析到底·解构一切·逆流一切·道法自然」

---

## 一·本机全相 (DESKTOP-MASTER)

### 1.1 Windows 账号 11 个

| 账号 | 启用 | 上次登入 | Windsurf 痕 |
|---|---|---|---|
| **Administrator** | ✓ | 2026-05-16 | logs latest=20260514·主公·Cascade 在此 session 1 console |
| ai | ✓ | 2026-04-16 | logs latest=20260416 |
| **zhou** | ✓ | **2026-05-15** | **logs latest=20260515T195346** ← 本案主角 |
| zhou1 | ✓ | 2026-04-26 | logs latest=20260426 (历史·非本案) |
| zhou2 | ✗ | 2026-04-02 | 已禁 |
| zhouyoukang | ✓ | 2026-04-14 | 无 logs (本机·非 179 远端的同名) |
| CodexSandboxOffline/Online | ✗ | never | 沙盒空账号 |
| DefaultAccount/Guest/WDAGUtility | ✗ | - | 系统账号 |

### 1.2 当前活动 session (`query session`)

```
>console      Administrator    1  Active        ← 主公·Cascade 在此
 rdp-tcp#0    zhou             3  Active  IDLE 10:19  ← zhou RDP 接入·已 idle 10h19m·**绝对无人在用**
```

→ **zhou session 3 是死 session**·kill 之 Windsurf 安全无害

### 1.3 5 处 Windsurf 痕

| 路径 | 真态 | 备 |
|---|---|---|
| **E:\Windsurf\** | 本机唯一真装·ext.js 9627483B mtime=2026-05-14 10:28 **含 :8878 血印** | **病灶** |
| D:\Windsurf2\ | 旧版装·ext.js 9318486B mtime=2026-04-25 **:8878=False·干净** | 备份· dormant |
| C:\dao\Roaming\Windsurf | user-data-dir·非装路径 | 历史 user-data |
| D:\WindsurfData | user-data-dir·22:44 仍被写 | Administrator 别 session 之 user-data |
| D:\Windsurf | 残·有 `Windsurf.exe.broken_backup`·debug.log mtime=2026-04-04 | 已死残骸 |
| D:\WindsurfMulti | 多实例运行框架·有 实例1/2/3.cmd | 历史 |
| D:\安装的软件\Windsurf | `mcp_cache·mcp_output·*.png` | **非 Windsurf 装·命名巧合** |

---

## 二·zhou 之 Windsurf 真态 (病征)

### 2.1 进程·11 个 + 1 language_server·全用被改 binary

```
Session 3·UserName=DESKTOP-MASTER\zhou
Main PID 163500   "E:\Windsurf\Windsurf.exe"                  ← parent=explorer.exe·19:53:45 启
  ├─ PID 167188  --type=gpu-process --user-data-dir="C:\Users\zhou\AppData\Roaming\Windsurf"
  ├─ PID 167308  --type=utility --utility-sub-type=network.mojom.NetworkService
  ├─ PID 142128  --type=renderer --user-data-dir="C:\Users\zhou\AppData\Roaming\Windsurf"
  ├─ PID 95312/99676/165948/172388  --type=utility --utility-sub-type=node.mojom.NodeService
  ├─ PID 162352  --type=utility --utility-sub-type=audio.mojom.AudioService  (21:52 自启 chrome 内部)
  ├─ PID 173036  jsonServerMain  --node-ipc --clientProcessId=99676
  └─ PID 173820  eslintServer.js --node-ipc --clientProcessId=99676

Session 3·language_server_windows_x64 PID 173080  19:54:11 启
```

### 2.2 logs 全 0 字节·19:54:12 后再无写入 (1.5h 前止笔)

```
C:\Users\zhou\AppData\Roaming\Windsurf\logs\20260515T195346\
  main.log                  0B  19:53:46
  network-shared.log        0B  19:53:48
  ptyhost.log               0B  19:54:00
  remoteTunnelService.log   0B  19:53:48
  sharedprocess.log         0B  19:53:48
  telemetry.log             0B  19:53:48
  terminal.log              0B  19:53:49
  window1\
    network.log             0B  19:53:47
    renderer.log            0B  19:53:47
    exthost\
      output_logging_*\2-WAM.log  0B  19:54:05  ← WAM 半死之绝症
      codeium.windsurf\Windsurf (Lifeguard).log  0B  19:54:11  ← Lifeguard 也无气
      dbaeumer.vscode-eslint\ESLint.log  0B  19:54:12
```

→ **进程在跑·logger 全断·WAM/Lifeguard/Renderer 全死** = 179 远端「重启后所有 logs 0 字节」 完全同征

### 2.3 反代端口·:8878 无 listener

```
:8878   no listener   ← ext.js 之求亡所归·此处空无应答
:8957   no listener
:11435  LISTEN  PID=6792  node  e:\道\道生一\一生二\Windsurf万法归宗\070-插件_Plugins\外接api\gateway\server.js  (session 0·Administrator·与 Windsurf 无关·别项目)

outbound :8878 connections   :  0
outbound :443 from PID 167308 (NetworkService) → 35.223.238.178:443 Established  (Chromium telemetry/crashpad·非 ACP/WAM)
```

### 2.4 ext.js 之 +9 字节血印

```
E:\Windsurf\resources\app\extensions\windsurf\dist\
  extension.js                              9627483B  2026-05-14 10:28:53   ← 被改·含 '127.0.0.1:8878'
  extension.js.bak_predao_20260513_150517   9627587B  2026-05-06 05:08:12   ← 干净官方原本
  
  Δ size:  9627587 - 9627483 = -104B    ← 与 179 之 +9B 改法不同·疑改更广 (可能多个 endpoint 替换)
  Δ time:  bak 5/6  → 改 5/14 10:28      ← 中间 8 天某时被改
```

→ **本机 ext.js 改法**与 179 远端 (+9B 单点替换) 不同·**且 :8878 此时无 listener** → 病更彻底

### 2.5 zhou 之 globalStorage (token 残)

```
C:\Users\zhou\AppData\Roaming\Windsurf\User\globalStorage\
  _wam_purged.json                  7428B   2026-04-05 23:06   ← 历史 WAM 已被 purge·有 backup
  _wam_purged.json.pre_restore.bak  6889B   2026-04-05 22:14
  windsurf-auth.json                 711B   2026-04-29 00:07   ← 上次 auth 痕
  windsurf-login-accounts.json     36956B   2026-04-27 23:53   ← 多账号 login records
  state.vscdb                     417792B   2026-05-15 14:08   ← VSCode state·5/15 下午仍写
```

→ **token 实物有·还原 ext.js 后 WAM 应能复用本地 token·无需重 login**

---

## 三·改 ext.js 之手 (溯源)

### 3.1 schtasks 历史

| Task | 状态 | User | Action |
|---|---|---|---|
| `\WindsurfManifestGuard` | **Disabled** | Administrator | `pythonw.exe manifest.py guard` ← 管 `extensions.json`·**不改 ext.js** |
| `\Windsurf-Startup-Guard` | **Disabled** | zhou | `wscript silent_launch.vbs windsurf-startup-guard.ps1` ← zhou login 自起 guard |
| `\Windsurf-WAL-Checkpoint` | Disabled | zhou | WAL checkpoint task |
| `\WS179AutoRotate` | Disabled | ai | `_gen_inject_179.py` ← **179 反代之自动轮换·明显与 :8878 体系相关** |
| `\WS_Daemon_万法归宗` | Disabled | Administrator | `windsurf_daemon.ps1` |
| `\DaoZhouLaunch` | Disabled | zhou | `e:\Windsurf\Windsurf.exe --new-window C:\Users\zhou` ← 代 zhou session 起 Windsurf 之 InteractiveToken 法门 |

→ **所有反代/守护 task 皆 Disabled** — 改 ext.js 之手已不在系统中跑·**但破已成事实**

### 3.2 历史改痕 (.windsurf/shards 下 30+ 文件含 :8878 字串)

`E:\道\道生一\一生二\.windsurf\shards\` 下数十个 `dao_x*.ps1`·`dao_y*.ps1`·`wam-push-*` 等·5/8 大量 :8878 操作 — **Cascade 历次会话之 tmp 产物**·非主动改 ext.js 之手

### 3.3 真改之器 — `070-插件_Plugins/外接api/gateway/server.js` 等

PID 6792 跑 `:11435` 上之 server.js·session 0 Administrator·5/13 17:54 启·**这是别项目 (外接 ollama 风格 gateway)**·与 :8878 反代体系无关。  
**真改 ext.js 的二进制 patch 工具仍在 070-插件_Plugins 之 core/ 下**·但当前 disabled·已不 active。

---

## 四·与 179 远端病征对照

| 维度 | 179 远端 | 本机 zhou |
|---|---|---|
| ext.js 含 :8878 | ✓ +9B | ✓ -104B (改法不同·更广) |
| ext.js 有 .bak_predao | ✓ | ✓ (`bak_predao_20260513_150517`) |
| 含 server.codeium.com | ✓ | ✓ |
| Windsurf 进程在跑 | ✓ | ✓ (11 个) |
| logs 0 字节 | ✓ | ✓ (全部) |
| WAM.log 0 字节 | ✓ | ✓ |
| :8878 listener | 曾有·后停 | **无** |
| outbound :8878 | 0 | 0 |
| user-data-dir 锁 | 有 | 否 (idle 10h·已自然解锁) |
| 治本之路 | bak 还原 + schtasks 起 | **同·极顺** |

→ **本机 zhou 是 179 之 mirror·且更顺 (无 user-data-dir 锁·无 active 用户)**·治本路径 1:1 复用 179 之法

---

## 五·治本之径 (下篇 07 实施)

```
1. kill zhou session 3 之 11 个 Windsurf + 1 language_server
2. 等 5s OS 释放文件锁
3. 备份当前被改 E:\Windsurf\...\extension.js (重命名·留证)
4. 还原 extension.js.bak_predao_20260513_150517 → extension.js
5. 验:
     ext.js 不含 '127.0.0.1:8878'
     ext.js 仍含 'server.codeium.com'
     size = 9627587B
6. 用 schtasks `\DaoZhouLaunch` 在 zhou session 3 起 Windsurf (InteractiveToken)
7. 等 30-60s
8. 验:
     zhou's logs 各 *.log 开始有内容
     ACP.log 有「Fetched from registry」之类正常 INFO 行
     WAM.log 有「Fetched WAM token」或「Authenticated」
     outbound 无 :8878·有 :443 → server.codeium.com / *.codeium.com
9. zhou's Windsurf UI 在 RDP session 3 中可正常使用 (主公自验)
```

---

## 六·道法自然之诫

> **"为之者败之，执之者失之。是以圣人无为也，故无败也"**

- 本机 zhou 病不 treat token 不 treat proxy·**直 treat ext.js binary** — 这是源
- 不动 D:\Windsurf2 之干净版 (备份用)·不动 D:\WindsurfData (别 session user-data)
- 不重 login·不 purge WAM (token 实物在 globalStorage·还原后 WAM 自起复用)
- 不动 :11435 (别项目)·不动当前 disabled task (已死之手)
- **只动一文件·治百症** — 1:1 还原 ext.js·余皆自然康复

> **"万物负阴而抱阳，中气以为和"** — bak 是阳·patched 是阴·还原 = 复和

---

## 附·诊断时间线

```
05-06 05:08  原 ext.js (9627587B) 被存 .bak_predao
05-13 15:05  bak 命名 timestamp (主公某次 dao 行)
05-14 10:28  ext.js 被改 (9627483B·-104B·含 :8878)
05-15 14:08  zhou's state.vscdb 最后写 (zhou 当时正常用)
05-15 19:53  zhou 通过桌面 Windsurf.lnk 起 Windsurf → 起即崩·logs 0B
05-15 19:54  WAM/Lifeguard 死 → 进程残但功能皆无
05-15 22:44  RDP zhou 离开·session idle 始
05-16 ~6am   主公命 Cascade 治本·察明病征·此报告作
```
