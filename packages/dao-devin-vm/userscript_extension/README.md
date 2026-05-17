# 03_网页注入 · 浏览器侧 wss hook · 印 90 (备用)

> 「**天下之至柔，驰骋于天下之致坚；无有入于无间**」（帛书四十三）

---

## 〇 · 此目录之意

承印 88-91 之"道法自然 · 闭环自举"，立**浏览器侧 wss hook**——一直接在 `app.devin.ai` 浏览器内 hook WebSocket · 实现底层 system prompt 替换 · 不依本机 daemon。

**与 `00_本源/dao_proxy.js` 之关系**：

| 路 | 适 | 优 | 劣 |
|----|----|-----|----|
| `00_本源/` (主路) | 公网 API 反代 | 任客端 SDK · 任设备 · 可批 | 需 Devin VM (1 ACU/件) |
| `03_网页注入/` (备路) | 浏览器内 chat | 不需 VM · 不消 ACU | 仅本机 chrome · 单 tab |

主路 + 备路 = **并行不悖** (《老子》六十)。

---

## 一 · 件 (extension 8 + userscript 1)

```text
03_网页注入/
├── extension/                        ← Chrome MV3 extension (主路)
│   ├── manifest.json                 (manifest_version 3)
│   ├── content.js                    (4.8 KB · document_start · all_frames)
│   ├── inject.js                     (14 KB · page-world · hook WebSocket constructor)
│   ├── sw.js                         (10.4 KB · service_worker · MV3 module)
│   ├── popup.html                    (UI · 三态切换)
│   ├── popup.css                     (style)
│   ├── popup.js                      (5.3 KB · UI 逻辑)
│   └── icons/                        (16 · 48 · 128 三件 png)
│
└── userscript/                       ← Tampermonkey 同源 (备路 · 简)
    └── (UserScript 单文件)
```

---

## 二 · 工作流

```text
浏览器加载 https://app.devin.ai/
    ↓
content.js (document_start, all_frames)
    ↓ inject <script src="inject.js">
inject.js 在 page-world 内
    ↓ override WebSocket constructor
new WebSocket("wss://app.devin.ai/api/acp/live", subprotocols)
    ↓ 包装 send / 解析 ACP frame
    ↓ 见 system prompt envelope → 替换 (策略 6)
    ↓ 见 user message → strip side_channel (32 标签)
    ↓ 透传至原 wss
    ↓ 返回原 chat 流
```

---

## 三 · 与 dao_proxy.js 之 SP 对照

| 策略 | inject.js (浏览器) | dao_proxy.js (反代) |
|-----|------------------|--------------------|
| bypass | 不动 | 不动 |
| override | 全替为 customPrompt | 同 |
| prepend | customPrompt + "\n\n" + orig | 同 |
| append | orig + "\n\n" + customPrompt | 同 |
| dao | silk N 章 | 同 |
| custom | = override | 同 |

★ 策略名 + 行为完全一致 · 两路可互换 · 用户不知差。

---

## 四 · 安装

```text
A · extension (推荐):
  1. chrome://extensions/ → "开发者模式" ON
  2. "加载已解压的扩展程序" → 选 extension/ 目录
  3. 钉到工具栏 → 点图标见 popup
  4. 选策略 + 输 customPrompt → 保存
  5. 打开 app.devin.ai 任意 chat → 真生效

B · userscript:
  1. 装 Tampermonkey 扩展
  2. 创建新脚本 → 粘 userscript/ 内之文件
  3. 保存 → 打开 app.devin.ai 即生效
```

---

## 五 · 道义

```text
✓ 浏览器侧 hook 之 wss 仅自身 tab · 不外联
✓ customPrompt 仅 localStorage 本机本浏览器
✓ 不修 Devin 客端 (web SPA) · 仅 wss 拦截
✓ 不污 telemetry (仅注入 SP 不动 chat)
✓ 备路 fallback · 主路 (dao_proxy) 故障时仍可用
```

---

## 六 · 与主路之并立

```text
主公诏 (帛书六十):「治大国若烹小鲜 · 以道莅天下」

主路 (00_本源/dao_proxy.js) · 公网 API · 任客端 SDK
  └─ 适: 公开服务 · 批跑 · 程式化 · 跨设备

备路 (03_网页注入/extension) · 浏览器 chat · 即用即活
  └─ 适: 单人单 chat · app.devin.ai 之原 UI · 低门槛

两路并立 · 用户自择 · 各取所需 · 道法自然
```

---

*「为而弗有也 · 长而弗宰也 · 此之谓玄德」 —— 帛书《老子》五十一*

*印 90 · 浏览器侧 wss hook · 备路并立 · 不依 VM · 道法自然*
