#!/usr/bin/env node
/**
 * apply_devin_cloud_patch.js · 印 83续 · 注入 Devin Cloud BYOK provider 到外接 api 配置
 * ─────────────────────────────────────────────────────────────────────────
 * 道义: 「为无为, 事无事」 · 幂等 · 含备份 · 不破不立
 *
 * 用:
 *   node apply_devin_cloud_patch.js [配置.json 路径] [--dry]
 *   默路径 = 同目录之 配置.json
 *   --dry  = 仅打印改前改后差异 · 不实写
 *
 * 真本源:
 *   - providers.devinCloud (driver=openai · baseUrl=http://127.0.0.1:11441/v1 · noAuth=true)
 *   - cascadeInjection.injectModels 加 3 条 (claude/gpt/default)
 *   - 已存在则跳过 (幂等)
 *   - 写前备份 .bak-YYYYMMDDHHMMSS
 */
"use strict";
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const cfgPath =
  args.find((a) => !a.startsWith("--")) ||
  path.join(__dirname, "配置.json");

if (!fs.existsSync(cfgPath)) {
  console.error(`✗ 配置.json 不存在: ${cfgPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(cfgPath, "utf8");
const cfg = JSON.parse(raw);

let added = { provider: false, models: [] };

// === 1. providers.devinCloud ===
if (!cfg.providers) cfg.providers = {};
if (!cfg.providers.devinCloud) {
  cfg.providers.devinCloud = {
    _注: "Devin Cloud 反代 · 走 :11441 → wss://app.devin.ai · D 限额池 · 印 83 反者道之动",
    enabled: true,
    driver: "openai",
    baseUrl: "http://127.0.0.1:11441/v1",
    apiKey: "",
    noAuth: true,
    label: "Devin Cloud (D 池)",
    models: ["devin-cloud-claude", "devin-cloud-gpt", "devin-cloud"],
  };
  added.provider = true;
} else {
  console.log("ℹ providers.devinCloud 已存在 · 跳过 provider 加");
}

// === 2. cascadeInjection.injectModels ===
if (!cfg.cascadeInjection) cfg.cascadeInjection = { enabled: true, injectModels: [] };
if (!Array.isArray(cfg.cascadeInjection.injectModels)) cfg.cascadeInjection.injectModels = [];

const wantModels = [
  {
    provider: "devinCloud",
    model: "devin-cloud-claude",
    label: "Claude · Devin Cloud (D 池)",
    supportsToolCalls: false, // ★★★ 命门 · :11441 不返 tool_calls · 仅 Chat 子模式
    supportsParallelToolCalls: false,
    supportsImages: false,
    supportsThinking: false,
    maxTokens: 200000,
    maxOutputTokens: 8192,
  },
  {
    provider: "devinCloud",
    model: "devin-cloud-gpt",
    label: "GPT · Devin Cloud (D 池)",
    supportsToolCalls: false,
    supportsParallelToolCalls: false,
    supportsImages: false,
    supportsThinking: false,
    maxTokens: 128000,
    maxOutputTokens: 8192,
  },
  {
    provider: "devinCloud",
    model: "devin-cloud",
    label: "Devin Cloud · Default (D 池)",
    supportsToolCalls: false,
    supportsParallelToolCalls: false,
    supportsImages: false,
    supportsThinking: false,
    maxTokens: 128000,
    maxOutputTokens: 8192,
  },
];

for (const w of wantModels) {
  const exists = cfg.cascadeInjection.injectModels.some(
    (m) => m.provider === w.provider && m.model === w.model,
  );
  if (!exists) {
    cfg.cascadeInjection.injectModels.push(w);
    added.models.push(`${w.provider}/${w.model}`);
  } else {
    console.log(`ℹ injectModels 已含 ${w.provider}/${w.model} · 跳`);
  }
}

if (!added.provider && added.models.length === 0) {
  console.log("✓ 配置.json 已是最新态 · 无需改动 (幂等保护生效)");
  process.exit(0);
}

const newRaw = JSON.stringify(cfg, null, 2);

if (dry) {
  console.log("=== DRY RUN · 不实写 ===");
  console.log("拟加 provider:", added.provider ? "devinCloud" : "(无)");
  console.log("拟加 models:", added.models.length ? added.models.join(", ") : "(无)");
  console.log("总长:", newRaw.length, "B (原:", raw.length, "B)");
  process.exit(0);
}

// 备份
const ts = new Date()
  .toISOString()
  .replace(/[-:T]/g, "")
  .slice(0, 14);
const bakPath = `${cfgPath}.bak-${ts}`;
fs.writeFileSync(bakPath, raw, "utf8");
console.log("✓ 原配置已备份:", bakPath);

// 写新
fs.writeFileSync(cfgPath, newRaw, "utf8");
console.log("✓ 已写入新配置:", cfgPath);
console.log("  - 加 provider:", added.provider ? "devinCloud" : "(无)");
console.log("  - 加 models:", added.models.length ? added.models.join(", ") : "(无)");
console.log("");
console.log("下步: 若 :8878 + :11435 + :11441 皆活, Reload Window 后 Cascade 选择器即多 3 条 Devin Cloud (D 池) 条目");
