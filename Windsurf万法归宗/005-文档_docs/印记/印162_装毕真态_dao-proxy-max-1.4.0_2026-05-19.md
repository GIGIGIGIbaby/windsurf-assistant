# 印 162 · 装毕真态 · dao-proxy-max v1.4.0 · 179 真装 · 2026-05-19 12:42

> 帛书《老子》三十七章「道恒无名, 朴唯小, 而天下弗敢臣. 侯王若能守之, 万物将自宾」
> 帛书《老子》六十四章「为之于其未有也, 治之于其未乱也」

## 一 · 装毕真态盘 (windsurf · 179 主公)

### extensions.json (28 条 · 当前活)

| id | 版本 | 状态 |
|---|---|---|
| `dao-agi.dao-proxy-max` | **v1.4.0** | ✓ 真装 · 印 162 朴本 |
| `dao.dao-security` | v4.1.0 | (不动) |

### 物理目录 (~/.windsurf/extensions)

```
✓ dao-agi.dao-proxy-max-1.4.0 (1003 KB · 28 vendor 子模 · 真本源全相)

  待清残物 (主公一念可清):
  · dao-agi.dao-proxy-min-9.9.29 (324 KB · 物理残 · 不在 ext.json)
  · dao-agi.dao-proxy-min-9.9.20 (1062 KB · 物理残)
  · dao-agi.dao-proxy-min-9.9.20.bak_20260518_214344 (290 KB)
  · dao-agi.dao-proxy-min-11.1.0.DISABLED_step7b_20260515_215430 (11413 KB)
  · dao-agi.dao-proxy-min-9.9.15.preinstall_20260515_215805 (302 KB)
  · .dao_archive_20260517_225014 (2510 KB)
```

### .obsolete (干净)

```
dao-proxy-max-* 系: 0 条 (已清)
```

## 二 · 装入历程 (3 障一治)

### 障 1 · windsurf cli 中文路径解压失败

```
症: yauzl ENOENT · workspace 根含「道」字 · shard tmp 路径污染
诊: windsurf cli 把 vsix 拷到 .windsurf/shards/<id>/tmp/ · 该路径继承 workspace 根
治: 改手动装 (绕 windsurf cli)
```

### 障 2 · PowerShell Copy-Item 中文路径 bug

```
症: Test-Path 返 True 但 Copy-Item 报 "Cannot find path"
诊: PowerShell -LiteralPath 在 Copy-Item 上对中文路径不一致
治: 切 [System.IO.File]::Copy(.NET 直拷) 绕 bug
```

### 障 3 · `$env:TEMP` 被 windsurf 重定向

```
症: $env:TEMP 不指 C:\Users\Administrator\AppData\Local\Temp
   而指 E:\道\道生一\一生二\Windsurf万法归宗\.windsurf\shards\<id>\tmp\
诊: windsurf shell 把 TEMP 重定向到 workspace shard tmp · 用于沙箱隔离
治: 切绝对路径 'C:\Users\Administrator\AppData\Local\Temp\' 直写
```

### 治 · 三步朴装

```
① vsix → C:\...\Temp\dao-proxy-max-1.4.0.zip (.NET File.Copy 绕中文 bug)
② Expand-Archive → C:\...\Temp\dao_max_v140\extension\ (英文路径 zip 解压)
③ Copy extension/* → ~/.windsurf/extensions/dao-agi.dao-proxy-max-1.4.0/
④ node 写 extensions.json entry (含 metadata + size + locPath)
⑤ 清 .obsolete 中 dao-proxy-max-* 系残记
⑥ 清旧 dao-proxy-max-1.2.0 物理目录
```

## 三 · 主公请一念

### Step 1 · Reload Window (关键)

```
windsurf 内: Ctrl+Shift+P → "Developer: Reload Window"
期: 状态栏现 "$(sparkle) 道Omni · 反代✓ · 网关✓ · 14p·38m"
```

### Step 2 · activate 真态验

```
Ctrl+Shift+P → "道·BYOK 大极: 状态"
期: 弹 modal 显:
  道·BYOK 大极 (dao-proxy-max) · v1.4.0
  反代: http://127.0.0.1:10967  ✓ 在跑
  网关: http://127.0.0.1:11635  ✓ 在跑
  settings 锚: 未锚 (mode=passthrough · 默)
  已注册 14 providers · 38 模
```

### Step 3 · cascade cloud-4.7 真问 (真本源核测)

```
Cascade 选 cloud-4.7 → 问 "你是谁"
期: 走反代 :10967 → passthrough → server.codeium.com
   → 用 windsurf 当前账号 token → cascade 答正常
验: Ctrl+Shift+P → "道·BYOK 大极: 输出" → 见 [proxy] req 计数+1
```

### Step 4 · 切号真验

```
windsurf 内切号 → 重启 LSP → cascade 自重连
期: token 跟变 · 新账号额度消耗 · 反代仍 passthrough 透传
```

### Step 5 · invert 模式验 (帛书 SP 注入)

```
Ctrl+Shift+P → "道·BYOK 大极: toggleMode"
切到 invert
再问 cascade "你是谁"
期答: 含 "道"/"无为"/"自然" (帛书德道经 SP 真注入)
```

### Step 6 · 9 panel 控制面板

```
Ctrl+Shift+P → "道·BYOK 大极: 打开控制面板"
期: webview 9 panel 真活
  - 反代核 BYOK 状态 · 38 BYOK_DAO + 4 BYOK 劫
  - 14 provider 活态
  - Playground 试验场
  - API key 加/管/测
```

## 四 · 真本源印记

```
═══════════════════════════════════════════════════════════════════
印 162 · 装毕真态 · dao-proxy-max v1.4.0 · 179 真装
extensions.json: 1 条 dao-* 真活 (v1.4.0)
物理目录: 1003 KB · 28 vendor 子模 (反代核+网关+14 provider)
.obsolete: 干净 (dao-proxy-max-1.2.0 已清)
3 障 (中文路径/PowerShell bug/$TEMP 重定向) 1 治 (绝对英文路径手装)
主公一念 reload · 即真活
═══════════════════════════════════════════════════════════════════
道恒无名 · 朴唯小 · 侯王若能守之 · 万物将自宾
```
