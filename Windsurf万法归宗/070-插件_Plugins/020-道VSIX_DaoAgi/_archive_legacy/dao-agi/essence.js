// essence.js — 道Agent · 本源 · v26 · 主辅分槽 + 无第三态 · 为学日益为道日损
//
// 为学日益 为道日损 · 损之又损 · 以至于无为 · 无为而无不为
//
// v25 (2026-04-24): 道/官方双模式按钮 · 庖丁解牛 · 目无全牛
//   道Agent模式: 底层注入道德经SP · 隔离全部 · 仅保留必要模块(工具说明等)
//   官方Agent模式: 取消替换 · 回归初始 · 原味SP
//   顶 bar: ●●●● [道][官] ⟳ ⊕ 12345字 · 为学日益为道日损
//
// v24 (2026-04-24): 去芜存菁 · 去视图下拉 · 无为而无不为
//   自动呈现最优源: L1 LS直取 > L3 代理捕获 > L4 实时重建 > L3 LLM实收
//
// v23 (2026-04-24): 实时重建 SP 彻底深化 · 大器晚成 · 大音希声
//   重建骨架自 LS 二进制 .rodata (sp-scaffold.js) + 动态注入全合 · 14 段一屏.
//   静态骨架 9 段: header / communication_style / tool_calling /
//     making_code_changes / task_management / running_commands / debugging /
//     calling_external_apis / trailing (尾部通则)
//   动态注入 ≥5 段: user_information / workspace_information / user_rules /
//     memory_system (cascade + user + shell) / mcp_servers + tool_definitions /
//     skills / workflows / settings / model_configs / unleash / trajectory
//     / isolation / ide_metadata (shell)
//   防御式多路径 · 每项数据 2-4 候选键 · LS 响应 shape 变 不崩
//
// v22 (2026-04-24): 直取本源 · LS GetSystemPromptAndTools + Trajectory 兜底
//   L1 ls-direct  → LS 内部 Cortex 组装 SP · 无需代理 · 本源即真实
//   L2 trajectory → 从最近会话 steps 反向提取 · 无活会话时兜底
//   L3 proxy      → 反代截流 (需 LS 启动后 reload window 生效)
//   L4 rebuild    → 基于 rules/memories 片段拼接 · 永远可得 · v23 全源大成
// 四源并举 · 优先级 L1 > L3 > L2 > L4 · 一屏观九源 · 展示本源
"use strict";

const vscode = require("vscode");
const http = require("node:http");
const { EventEmitter } = require("node:events");
const lsClient = require("./ls-client");
// v18.2 · 本源直取 · 隔离模块 · L0 顶优先源 (PEB 内存扫)
//   于其他模块 (ls-client/source.js/proxy) 全互不依赖 · 唯 require 入口
//
// v18.2.2 · 默闭 · 为道日损 · 无为而无不为 (141 性能事故根治 · 2026-04-27)
//   病: bensource.extract() 每次 fork PowerShell + Add-Type JIT + 80GB 扫 LS 内存
//       webview 8s/SSE/watcher 任意事件即触发 · 多路并发无去重 · LS 反受洪水
//       (实证 141 : LS 收 ~150 RPC/s GetCascadeTrajectorySteps · ext-host 阻塞 14s)
//   修: 默闭 · 仅当用户显式置 dao-agi.bensource.enabled=true 方载
//       proxy 可达时本路全无须 (proxy.before = LS 真注 SP, L0 重) · 圣人无为故无败
let bensource = null;
function _bensourceEnabled() {
  try {
    return !!vscode.workspace
      .getConfiguration()
      .get("dao-agi.bensource.enabled", false);
  } catch {
    return false;
  }
}
function _ensureBensource() {
  if (bensource) return bensource;
  if (!_bensourceEnabled()) return null;
  try {
    bensource = require("./bensource");
  } catch {
    bensource = null;
  }
  return bensource;
}
// v17.88 · sp-scaffold 死引去 (_buildReconstructedSP 删 · proxy 可达时永不显)

// ═══════════════════════ 工具 ═══════════════════════

function httpGetJson(url, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const req = http.get(
        url,
        {
          timeout: timeoutMs || 2500,
          headers: { connection: "close" },
          agent: false,
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return resolve(null);
          }
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => {
            body += c;
          });
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        try {
          req.destroy();
        } catch {}
        resolve(null);
      });
    } catch {}
  });
}

// v18.5 · HTTP POST JSON · 供 custom SP 注入
function httpPostJson(url, data, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify(data);
      const u = new (require("node:url").URL)(url);
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          method: "POST",
          timeout: timeoutMs || 3000,
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload),
            connection: "close",
          },
          agent: false,
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => {
            body += c;
          });
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        try {
          req.destroy();
        } catch {}
        resolve(null);
      });
      req.write(payload);
      req.end();
    } catch {
      resolve(null);
    }
  });
}

// v18.5 · HTTP DELETE · 供 custom SP 清除
function httpDelete(url, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const u = new (require("node:url").URL)(url);
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          method: "DELETE",
          timeout: timeoutMs || 3000,
          headers: { connection: "close" },
          agent: false,
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => {
            body += c;
          });
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        try {
          req.destroy();
        } catch {}
        resolve(null);
      });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

// ═══════════════════════ v17.75 · SSE 订阅客户端 ═══════════════════════
// 能因敌变化而取胜者 · 谓之神 · 推式订阅 · 无轮询间隙
//
// 订阅 源.js 之 /origin/stream · 事件类型:
//   hello : 连上时首发 · { pid, mode, turn_count, uptime_s }
//   turn  : 每次捕 inject · { turn_id, at, messages[], sp_sig, ... }
//   mode  : POST /origin/mode 广播 · { mode, previous }
//   hb    : 15s 心跳 · 仅保活
//
// 断自愈: http.request 断流后 3s 重连 · 指数退避 max 30s
// 无 proxy 时安静重试 · 不扰主流
class DaoSseClient extends EventEmitter {
  constructor(port) {
    super();
    this._port = port || 8889;
    this._req = null;
    this._res = null;
    this._reconnectTimer = null;
    this._backoffMs = 1000;
    this._stopped = false;
    this._connected = false;
    this._buf = "";
    this._lastEventAt = 0;
  }
  setPort(port) {
    if (port && port !== this._port) {
      this._port = port;
      // 端口变 · 强断重连
      this._close();
      if (!this._stopped) this._scheduleReconnect(100);
    }
  }
  isConnected() {
    return this._connected;
  }
  start() {
    this._stopped = false;
    this._connect();
  }
  stop() {
    this._stopped = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._close();
    this.removeAllListeners();
  }
  _close() {
    this._connected = false;
    try {
      if (this._req) this._req.destroy();
    } catch {}
    this._req = null;
    this._res = null;
    this._buf = "";
  }
  _scheduleReconnect(ms) {
    if (this._stopped) return;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(
      () => {
        this._reconnectTimer = null;
        this._connect();
      },
      ms != null ? ms : this._backoffMs,
    );
    // 指数退避 · 上限 30s
    this._backoffMs = Math.min(30000, Math.max(1000, this._backoffMs * 2));
  }
  _connect() {
    if (this._stopped) return;
    if (this._req) return; // 已在连
    const url = `http://127.0.0.1:${this._port}/origin/stream?replay=1`;
    try {
      this._req = http.get(
        url,
        {
          headers: {
            accept: "text/event-stream",
            "cache-control": "no-cache",
          },
          agent: false,
          // SSE 无 timeout · 但给 socket 一个 connect 超时兜底
          timeout: 5000,
        },
        (res) => {
          this._res = res;
          if (res.statusCode !== 200) {
            res.resume();
            this._close();
            this._scheduleReconnect();
            return;
          }
          this._connected = true;
          this._backoffMs = 1000; // 成功连 · 重置退避
          this._lastEventAt = Date.now();
          // 一旦连上 · 清 timeout 以免误杀长连 (SSE 本长)
          try {
            if (res.socket && res.socket.setTimeout) res.socket.setTimeout(0);
          } catch {}
          try {
            this.emit("connect", { port: this._port });
          } catch {}
          res.setEncoding("utf8");
          res.on("data", (chunk) => this._onData(chunk));
          res.on("end", () => {
            this._close();
            if (!this._stopped) this._scheduleReconnect();
          });
          res.on("error", () => {
            this._close();
            if (!this._stopped) this._scheduleReconnect();
          });
        },
      );
      this._req.on("error", () => {
        this._close();
        if (!this._stopped) this._scheduleReconnect();
      });
      this._req.on("timeout", () => {
        // connect 超时 · 非 SSE idle
        try {
          this._req && this._req.destroy();
        } catch {}
      });
    } catch {
      this._close();
      if (!this._stopped) this._scheduleReconnect();
    }
  }
  _onData(chunk) {
    this._lastEventAt = Date.now();
    this._buf += chunk;
    let idx;
    // SSE 事件以空行 (\n\n) 分隔
    while ((idx = this._buf.indexOf("\n\n")) >= 0) {
      const raw = this._buf.slice(0, idx);
      this._buf = this._buf.slice(idx + 2);
      this._dispatch(raw);
    }
  }
  _dispatch(raw) {
    // 解析 event: X\ndata: Y
    let eventType = "message";
    const dataLines = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) eventType = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      // ignore id: / retry: / comments
    }
    if (dataLines.length === 0) return;
    const dataStr = dataLines.join("\n");
    let data = dataStr;
    try {
      data = JSON.parse(dataStr);
    } catch {}
    try {
      this.emit(eventType, data);
      this.emit("event", { type: eventType, data });
    } catch {}
  }
}

// ═══════════════════════ 数据采集 · 反者道之动 ═══════════════════════
// proxy.before = Windsurf 拟发完整 SP (最终注入于 agent 的完整提示词)
// proxy.after  = LLM 实收 (invert→道德经 / passthrough→同 before)
// proxy.before_dissect = 结构解剖 (身份首言 + XML 块 + 末尾)
// lsSections = LS 全端点综合回退 (proxy 无数据时用)

async function gatherEssence(ctx, proxyPort) {
  // v17.76 · 回归本源 · 三路并行 (去 turns 着相)
  // 致虚极 守静笃 · 万物并作 吾以观复
  // v17.86.2-wd · race timeout 防 hang · 任一路 6s 不返即兜底 · webview 必收 type='data'
  // v18.2 · 加 L0 本源直取 (bensource 模块 · 进程内存扫) · 不依任他路
  const _wTO = (p, ms, fb) =>
    Promise.race([
      Promise.resolve(p).catch(() => fb),
      new Promise((r) => setTimeout(() => r(fb), ms)),
    ]);
  // v18.2.2 · L0 bensource 默闭 · 为道日损 · 不入 race
  //   旧: _wTO(_probeBensource(), 35000, null) 全过 35s timeout 绑首屏
  //   新: 仅当 dao-agi.bensource.enabled=true 才入 race (用户显式启)
  //       默路: 直返 null · webview 不显 L0 卡片 · 首屏 6s 即出
  const _bsP = _ensureBensource()
    ? _wTO(_probeBensource(), 12000, null) // 启即收 12s · 不再 35s 黑洞
    : Promise.resolve(null);
  const [proxyAns, lsAllAns, lsDirectAns, bensourceAns] = await Promise.all([
    _wTO(_probeProxy(proxyPort), 6000, {
      proxy: null,
      realprompt: null,
      proxyUp: false,
    }),
    _wTO(_probeLsAll(), 6000, {
      lsData: null,
      lsSections: null,
      reconstructed: null,
    }),
    _wTO(_probeLsDirect(), 6000, null),
    _bsP,
  ]);

  const { proxy, realprompt, proxyUp } = proxyAns;
  const { lsData, lsSections, reconstructed } = lsAllAns;
  const lsDirectSP = lsDirectAns;
  const bensourceSP = bensourceAns;

  // v22 · 诊断 · 四源状态一目了然 (v18.2 加 bensource)
  const diag = _diagnose(proxy, proxyUp, lsData, lsDirectSP, bensourceSP);

  return {
    ts: new Date().toISOString(),
    proxy,
    realprompt, // v18.9 · 捕获轨独立载 · webview 优先取为 "原发" 源
    proxyUp,
    lsSections,
    reconstructed,
    lsDirectSP, // v22 · LS RPC 直取 SP
    bensourceSP, // v18.2 · 本源直采 (PEB 内存扫) · L0 最深源
    diag,
  };
}

async function _probeProxy(proxyPort) {
  if (!proxyPort) return { proxy: null, realprompt: null, proxyUp: false };
  const ping = await httpGetJson(
    `http://127.0.0.1:${proxyPort}/origin/ping`,
    1500,
  );
  if (!ping) return { proxy: null, realprompt: null, proxyUp: false };
  // v18.9 · 道并行而不相悖 · 两轨并调 (鸡犬相闻)
  // · /origin/preview · 替换轨 (含 mode + after + dissect)
  // · /origin/realprompt · 捕获轨 (唯真原 + identity_head)
  // 两端点并调 · 互不交状
  const [proxy, realprompt] = await Promise.all([
    httpGetJson(`http://127.0.0.1:${proxyPort}/origin/preview`, 4000),
    httpGetJson(`http://127.0.0.1:${proxyPort}/origin/realprompt?full=1`, 4000),
  ]);
  return { proxy, realprompt, proxyUp: true };
}

async function _probeLsAll() {
  // v17.88 · _buildReconstructedSP 死路删 (proxy 可达时永不显 · LS 直取 + proxy 捕已足)
  try {
    const lsData = await lsClient.gatherAll({ extended: true });
    if (lsData && !lsData.error) {
      return {
        lsData,
        lsSections: _extractLSSections(lsData),
        reconstructed: null,
      };
    }
    return { lsData, lsSections: null, reconstructed: null };
  } catch {
    return { lsData: null, lsSections: null, reconstructed: null };
  }
}

// v18.2 · L0 · 本源直采 · PEB 内存扫 (隔离模块)
// 用户严令: "从根本底层实现热提取当前实时底层初始提示词
//          此模块之专注于本源 · 于其他模块相互隔离"
//
// 三大特征:
//   ① 不依 LS RPC (planner config not set 时 RPC 失 · 此路活)
//   ② 不依轨迹 (trajectory not found 时此路活)
//   ③ 不依 proxy (proxy 未捕时此路活)
//   故 LS 进程在 即可热取 · 无任何先决条件
async function _probeBensource() {
  // v18.2.2 · _ensureBensource 已守闭闸 · 此处为兜底
  const bs = _ensureBensource();
  if (!bs || typeof bs.extract !== "function") return null;
  try {
    const r = await bs.extract({});
    if (!r) return null;
    return {
      systemPrompt: r.systemPrompt || null,
      chars: r.chars || 0,
      source: r.source || null,  // "peb-memory-scan" | "ls-rpc-direct" | "ls-rpc-trajectory"
      lsPid: r.lsPid || null,
      addr: r.addr || null,
      scanMs: r.scanMs || 0,
      regions: r.regions || 0,
      totalMs: r.totalMs || 0,
      attempts: r.attempts || [],
      error: r.error || null,
      fromCache: !!r.fromCache,
    };
  } catch (e) {
    return { error: (e && e.message) || "throw", systemPrompt: null };
  }
}

// v22 · 直取本源 · LS GetSystemPromptAndTools + trajectory 兜底
// 此函数之果即用户诉求之根: "从根本底层完善提示词捕获 · 正本清源"
async function _probeLsDirect() {
  try {
    const res = await lsClient.probeLatestSP();
    if (!res) return null;
    return {
      systemPrompt: res.systemPrompt || null,
      chars: res.chars || 0,
      source: res.source || null,
      tools: res.tools || [],
      toolCount: res.toolCount || (res.tools ? res.tools.length : 0),
      trajectoryId: res.trajectoryId || null,
      trajectoryTs: res.trajectoryTs || null,
      error: res.error || null,
      diagnostics: res.diagnostics || null,
    };
  } catch (e) {
    return { error: (e && e.message) || "throw", systemPrompt: null };
  }
}

// ═══════════════════════ SP 重建 · v17.88 · 大段死路归芜 (~400 行) ═══════════════════════
// 史: v23 大成路径 (静骨架 + 动注入 14+ 段) 实测 proxy 可达时永不显
// v17.88 · _DAO_SUBTRACT_v17_82.md 第 184 行示路径 · 此次行
// 三核唯一: WAM 复用 + 实时 SP 提取 (LS 直取 + proxy 捕) + 模式热切
//   重建路径属第四级兜底 · 与 sp-scaffold (Cascade SP 模板硬编) 一并去
// "为学日益, 为道日损. 损之又损, 以至于无为, 无为而无不为"

// v17.88 · 留 stub 接收 d 参数 · 永返 null · webview 仍可降级到 LS 直取/proxy 捕
function _buildReconstructedSP(_d) {
  return null;
}
// v17.88 · 354 行死路全删 · sp-scaffold.js 配同删 · webview 改走 LS 直取/proxy 捕兜底
//          (历史: v23 静骨架+动注入 14+ 段 · 但 proxy 可达永不显, 且静骨架硬编 Cascade SP 模板含 Windsurf 内部知识)

function _diagnose(proxy, proxyUp, lsData, lsDirectSP, bensourceSP) {
  const d = {
    proxy_up: proxyUp,
    proxy_capturing: !!(proxy && proxy.has_captured_before),
    ls_up: !!(lsData && !lsData.error),
    // v22 · 本源直取状态 (LS GetSystemPromptAndTools / trajectory)
    ls_direct_sp: !!(lsDirectSP && lsDirectSP.systemPrompt),
    ls_direct_source: lsDirectSP ? lsDirectSP.source : null,
    ls_direct_chars: lsDirectSP ? lsDirectSP.chars || 0 : 0,
    // v18.2 · 本源直采状态 (PEB 内存扫 · L0 最深源)
    bensource_sp: !!(bensourceSP && bensourceSP.systemPrompt),
    bensource_source: bensourceSP ? bensourceSP.source : null,
    bensource_chars: bensourceSP ? bensourceSP.chars || 0 : 0,
    bensource_pid: bensourceSP ? bensourceSP.lsPid : null,
    bensource_scan_ms: bensourceSP ? bensourceSP.scanMs : 0,
    bensource_from_cache: bensourceSP ? !!bensourceSP.fromCache : false,
    // v17.75 · 主辅分槽透传
    agent_class: proxy && proxy.agent_class ? proxy.agent_class : null,
    has_main: proxy ? !!proxy.has_main : false,
    aux_count: proxy ? proxy.aux_count || 0 : 0,
    // v17.76.1 · proxy 陈旧/辅助 诊断
    proxy_stale: proxy && proxy.age_s != null && proxy.age_s > 300,
    proxy_short: proxy && proxy.before && proxy.before.length < 2000,
    advice: null,
  };
  // v18.2 · 建议语 · 优先级: bensource > ls_direct > proxy > LS
  if (d.bensource_sp && d.bensource_chars >= 2000) {
    const tag = d.bensource_from_cache ? "缓" : "新";
    d.advice = `✓ 本源直采 · PID ${d.bensource_pid} · ${d.bensource_chars}字 · ${tag} · ${d.bensource_scan_ms}ms`;
  } else if (d.ls_direct_sp && d.ls_direct_chars >= 2000) {
    const src = d.ls_direct_source === "ls-direct" ? "Cortex直返" : "轨迹回放";
    d.advice = `✓ 本源已达 · ${src} · ${d.ls_direct_chars} 字`;
  } else if (d.ls_direct_sp && d.ls_direct_chars < 2000) {
    d.advice = `⚠ LS 返辅助Agent SP (${d.ls_direct_chars}字) · L4重建补位`;
  } else if (d.proxy_capturing && d.has_main && !d.proxy_stale) {
    d.advice = "✓ 主槽Cascade SP 已捕 · 实时流量在观";
  } else if (d.proxy_capturing && (d.proxy_stale || d.proxy_short)) {
    d.advice = `⚠ 代理缓存${d.proxy_stale ? "陈旧" : ""}${d.proxy_short ? "(疑辅助Agent)" : ""} · L4全源重建补位`;
  } else if (d.proxy_capturing && !d.has_main) {
    d.advice = "⚠ 仅辅助Agent SP · 待主 Cascade 交互";
  } else if (d.ls_up && proxyUp && !d.proxy_capturing) {
    d.advice = "致虚守静 · 请向 Cascade 发一条消息触发本源采集";
  } else {
    d.advice = "致虚守静 · 等待首次 Cascade 交互";
  }
  return d;
}

// ═══════════════════════ LS 全源提取 ═══════════════════════

function _extractLSSections(data) {
  const sections = [];
  // Rules (workspace rules + global rules)
  if (data.rules && data.rules.memories && data.rules.memories.length) {
    for (const m of data.rules.memories) {
      const content = (m.textMemory && m.textMemory.content) || m.content || "";
      const title = m.title || m.memoryId || m.id || "(rule)";
      const source = m.source || m.ruleType || "";
      if (content)
        sections.push({
          type: source || "rule",
          title,
          content,
          chars: content.length,
        });
    }
  }
  // Cascade memories
  if (data.cascadeMemories) {
    const arr = Array.isArray(data.cascadeMemories.memories)
      ? data.cascadeMemories.memories
      : Array.isArray(data.cascadeMemories)
        ? data.cascadeMemories
        : [];
    for (const m of arr) {
      const content = (m.textMemory && m.textMemory.content) || m.content || "";
      const title = m.title || m.memoryId || "(cascade memory)";
      if (content)
        sections.push({
          type: "cascade_memory",
          title,
          content,
          chars: content.length,
        });
    }
  }
  // User memories
  if (data.userMemories) {
    const arr = Array.isArray(data.userMemories.memories)
      ? data.userMemories.memories
      : Array.isArray(data.userMemories)
        ? data.userMemories
        : [];
    for (const m of arr) {
      const content = (m.textMemory && m.textMemory.content) || m.content || "";
      const title = m.title || m.memoryId || "(user memory)";
      if (content)
        sections.push({
          type: "user_memory",
          title,
          content,
          chars: content.length,
        });
    }
  }
  // Skills
  if (data.skills) {
    const arr = Array.isArray(data.skills.skills || data.skills)
      ? data.skills.skills || data.skills
      : [];
    if (arr.length) {
      const txt = arr
        .map((s) => `[${s.name || s.id || "?"}] ${s.description || ""}`)
        .join("\n");
      sections.push({
        type: "skills",
        title: "Skills",
        content: txt,
        chars: txt.length,
      });
    }
  }
  // Workflows
  if (data.workflows) {
    const arr = Array.isArray(data.workflows.workflows || data.workflows)
      ? data.workflows.workflows || data.workflows
      : [];
    if (arr.length) {
      const txt = arr
        .map((w) => `[${w.name || w.id || "?"}] ${w.description || ""}`)
        .join("\n");
      sections.push({
        type: "workflows",
        title: "Workflows",
        content: txt,
        chars: txt.length,
      });
    }
  }
  // MCP servers
  if (data.mcp) {
    const states = data.mcp.states || data.mcp.mcpServerStates || [];
    if (states.length) {
      const txt = states
        .map((s) => {
          const name = (s.spec && (s.spec.serverName || s.spec.name)) || "?";
          const status = s.status || s.state || "?";
          const tools = (s.tools || []).map((t) => t.name || t).join(", ");
          return `[${name}] ${status} tools=[${tools}]`;
        })
        .join("\n");
      sections.push({
        type: "mcp",
        title: "MCP Servers",
        content: txt,
        chars: txt.length,
      });
    }
  }
  // Settings
  if (data.settings && typeof data.settings === "object") {
    const txt = JSON.stringify(data.settings, null, 2);
    sections.push({
      type: "settings",
      title: "Settings",
      content: txt,
      chars: txt.length,
    });
  }
  // Workspaces
  if (data.workspaces) {
    const txt =
      typeof data.workspaces === "string"
        ? data.workspaces
        : JSON.stringify(data.workspaces, null, 2);
    sections.push({
      type: "workspaces",
      title: "Workspaces",
      content: txt,
      chars: txt.length,
    });
  }
  return sections.length ? sections : null;
}

// ═══════════════════════ HTML · 损之又损 · 以至于无为 · 无为而无不为 ═══════════════════════
// 去芜存菁 · 无选择 · 自动呈现最优本源 · 道法自然
// 顶 bar: ●●●● ⟳ ⊕ 12345字   (无模式按钮 · 无视图下拉)
// 一条源标: 源: ...
// 下方主显: SP 全文 (优先级: LS直取 > 代理捕获 > 实时重建 > LLM实收)
const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src https: http:; img-src data:;">
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    font-family: var(--vscode-font-family); color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, transparent);
    margin: 0; padding: 6px 8px; font-size: 12px; line-height: 1.55;
    display: flex; flex-direction: column;
  }
  .bar {
    display: flex; gap: 3px; align-items: center; margin-bottom: 3px;
    flex: 0 0 auto; font-size: 10px; flex-wrap: wrap;
  }
  /* icon 按 · refresh/copy */
  .ib {
    padding: 2px 5px; font-size: 12px; border: 1px solid transparent;
    background: transparent; color: var(--vscode-foreground);
    cursor: pointer; border-radius: 2px; font-family: inherit;
    opacity: 0.65; min-width: 20px; line-height: 1;
  }
  .ib:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.15)); }
  .ib.vw-act { opacity:1; color:#6bb86b; border-color:#6bb86b; background:rgba(107,184,107,0.06); }
  .ib.vw-orig { opacity:1; color:#d9a200; border-color:#d9a200; background:rgba(217,162,0,0.06); }
  .age-tick { font-family:monospace; font-size:9px; opacity:0.5; margin-left:3px; }
  /* 模式按钮 · 道/官 · 庖丁解牛 · 目无全牛 */
  .mb {
    padding: 1px 7px; font-size: 11px; border: 1px solid rgba(128,128,128,0.3);
    background: transparent; color: var(--vscode-foreground);
    cursor: pointer; border-radius: 3px; font-family: inherit;
    opacity: 0.55; line-height: 1.3; transition: all 0.15s; font-weight: 500;
  }
  .mb:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.15)); }
  .mb.active {
    opacity: 1; border-color: var(--vscode-textLink-foreground, #4fc1ff);
    color: var(--vscode-textLink-foreground, #4fc1ff);
    background: rgba(79,193,255,0.1); font-weight: 700;
  }
  .mb.active-dao {
    border-color: #6bb86b; color: #6bb86b; background: rgba(107,184,107,0.1);
  }
  .mode-hint { font-size: 9px; opacity: 0.4; margin-left: 2px; }
  /* v17.76 · 回归本源 · 4 点态 (本源·Proxy·Cap·LS) · SSE 藏于内 · 太上不知有之 */
  .dots { display: inline-flex; gap: 2px; align-items: center; padding: 0 4px; cursor: help; }
  .dot {
    display: inline-block; width: 6px; height: 6px; border-radius: 50%;
    background: rgba(128,128,128,0.3);
  }
  .dot.ok { background: #6bb86b; }
  .dot.warn { background: #d9a200; }
  .dot.err { background: #e08080; }
  .meta { margin-left: auto; opacity: 0.5; font-family: monospace; font-size: 10px; }
  .source { font-size: 9px; opacity: 0.5; margin: 0 0 3px; min-height: 12px; line-height: 1.4; }
  #sp {
    flex: 1 1 auto; overflow: auto; margin: 0;
    padding: 10px 12px;
    font-family: "Noto Serif CJK SC", "Microsoft YaHei", var(--vscode-editor-font-family), serif;
    font-size: 11.5px; line-height: 1.75;
    white-space: pre-wrap; word-break: break-word;
    background: rgba(0,0,0,0.08); border-radius: 3px;
  }
  #sp.quiet {
    text-align: center; opacity: 0.35; font-style: italic;
    padding: 40px 0; letter-spacing: 1px;
  }
  .blk { margin: 4px 0; padding: 4px 8px; background: rgba(128,128,128,0.06);
    border-radius: 2px; border-left: 2px solid rgba(128,128,128,0.2); }
  .blk-tag { font-weight: bold; font-size: 11px; color: var(--vscode-textLink-foreground); }
  .blk-meta { font-size: 9px; opacity: 0.5; margin-left: 6px; }
  .blk pre { margin: 4px 0 0; font-size: 10px; white-space: pre-wrap;
    word-break: break-word; max-height: 160px; overflow: auto; }
  /* v18.5 · 编辑模式 · 用户可实时改动提示词 · 热注入 */
  .ib.edit-active {
    opacity: 1; color: #e8a040; border-color: #e8a040;
    background: rgba(232,160,64,0.1);
  }
  #editArea {
    display: none; flex: 1 1 auto; flex-direction: column;
  }
  #editArea.show { display: flex; }
  #editArea textarea {
    flex: 1 1 auto; resize: none; border: 1px solid rgba(128,128,128,0.3);
    border-radius: 3px; padding: 8px 10px;
    font-family: "Noto Serif CJK SC", "Microsoft YaHei", var(--vscode-editor-font-family), serif;
    font-size: 11.5px; line-height: 1.75;
    background: var(--vscode-input-background, rgba(0,0,0,0.12));
    color: var(--vscode-input-foreground, var(--vscode-foreground));
    outline: none; min-height: 120px;
  }
  #editArea textarea:focus { border-color: var(--vscode-focusBorder, #007fd4); }
  .edit-bar {
    display: flex; gap: 4px; align-items: center; margin-top: 4px;
    flex: 0 0 auto; font-size: 10px;
  }
  .edit-bar .eb {
    padding: 2px 8px; font-size: 10px; border: 1px solid rgba(128,128,128,0.3);
    background: transparent; color: var(--vscode-foreground);
    cursor: pointer; border-radius: 3px; font-family: inherit;
    line-height: 1.4; transition: all 0.15s;
  }
  .edit-bar .eb:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.15)); }
  .edit-bar .eb.save {
    border-color: #6bb86b; color: #6bb86b;
  }
  .edit-bar .eb.save:hover { background: rgba(107,184,107,0.15); }
  .edit-bar .eb.reset { border-color: #e08080; color: #e08080; }
  .edit-bar .eb.reset:hover { background: rgba(224,128,128,0.15); }
  .edit-bar .edit-status { opacity: 0.5; margin-left: auto; font-size: 9px; }
  .custom-badge {
    display: inline-block; font-size: 8px; padding: 0 4px;
    border-radius: 2px; background: rgba(232,160,64,0.2);
    color: #e8a040; border: 1px solid rgba(232,160,64,0.3);
    margin-left: 4px; line-height: 1.4; vertical-align: middle;
  }
  .kb-hint { font-size: 8px; opacity: 0.35; margin-left: 4px; }
</style>
</head>
<body>
  <div class="bar">
    <span class="dots" id="dots" title="\u672c\u6e90\u00b7Proxy\u00b7Capture\u00b7LS"></span>
    <button class="mb" id="btnDao" title="\u9053Agent \u00b7 \u9053\u5fb7\u7ecfSP\u6ce8\u5165 \u00b7 \u5e96\u4e01\u89e3\u725b">\u9053</button>
    <button class="mb" id="btnOff" title="\u5b98\u65b9Agent \u00b7 \u539f\u5473SP \u00b7 \u65e0\u6539\u5199">\u5b98</button>
    <span class="mode-hint" id="modeHint"></span>
    <button class="ib" id="refresh" title="\u5237\u65b0">\u27f3</button>
    <button class="ib" id="copy" title="\u590d\u5236">\u29c9</button>
    <button class="ib vw-act" id="viewToggle" title="LLM\u5b9e\u6536/Windsurf\u539f\u53d1">\u5b9e</button>
    <button class="ib" id="editToggle" title="\u7f16\u8f91\u6ce8\u5165SP \u00b7 \u5b9e\u65f6\u70ed\u6539\u52a8">\u270e</button>
    <span id="customBadge"></span>
    <span class="meta" id="meta">\u2014</span>
    <span class="age-tick" id="ageTick"></span>
  </div>
  <div class="source" id="source"></div>
  <pre id="sp" class="quiet">\u89c2\u2026</pre>
  <div id="editArea">
    <textarea id="editText" placeholder="\u8f93\u5165\u81ea\u5b9a\u4e49\u63d0\u793a\u8bcd...\n\u4fdd\u5b58\u540e\u5c06\u70ed\u6ce8\u5165\u4e3aCascade\u7684\u521d\u59cbSP\u3002\n\u5fc5\u8981\u6a21\u5757(\u5de5\u5177\u8bf4\u660e\u7b49)\u9ed8\u8ba4\u4fdd\u7559 \u00b7 \u4e2d\u6027\u5316\u8fc7\u6ee4 (\u635f\u4fdd\u62a4\u5012\u503e\u5411 / \u6307\u6325\u5f3a\u52bf\u53e5)\u3002"></textarea>
    <div class="edit-bar">
      <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:9px;opacity:0.7;">
        <input type="checkbox" id="keepBlocks" checked> \u4fdd\u7559\u4e2d\u6027\u5316\u5fc5\u8981\u6a21\u5757
      </label>
      <button class="eb save" id="editSave" title="\u4fdd\u5b58\u5e76\u6ce8\u5165">\u2714 \u6ce8\u5165</button>
      <button class="eb reset" id="editReset" title="\u6e05\u9664\u81ea\u5b9a\u4e49SP \u00b7 \u5f52\u9053">\u2716 \u5f52\u9053</button>
      <span class="edit-status" id="editStatus"></span>
    </div>
  </div>
<script>
(function() {
  var vsc = acquireVsCodeApi();
  var $sp = document.getElementById('sp');
  var $meta = document.getElementById('meta');
  var $source = document.getElementById('source');
  var $dots = document.getElementById('dots');
  var lastText = '';
  var $btnDao = document.getElementById('btnDao');
  var $btnOff = document.getElementById('btnOff');
  var $modeHint = document.getElementById('modeHint');
  var curMode = '';
  var viewMode = 'actual';
  var lastProxyData = null;
  var _ageBase = null;
  var _ageTimer = null;

  // v18.1.3 · 二态收音 · 默认官 (与 package.json defaultMode=passthrough 对齐)
  //   旧: mode || 'invert' → 首装/错位时 UI 闪道 高亮 · 违安全默认
  //   新: 缺态默 'passthrough' · 圣人之道为而不争 · 首装无副作用
  function setModeUI(mode) {
    curMode = mode || 'passthrough';
    $btnDao.classList.remove('active', 'active-dao');
    $btnOff.classList.remove('active');
    if (curMode === 'invert') {
      $btnDao.classList.add('active', 'active-dao');
      $modeHint.textContent = '\u9053';
    } else {
      // passthrough / 未知 / off / null → 一律官 (安全默认)
      $btnOff.classList.add('active');
      $modeHint.textContent = '\u5b98';
    }
  }

  // v17.76.1 · 收音机互斥 · 点即切 · 无off · 即时视觉反馈
  $btnDao.addEventListener('click', function() {
    if (curMode === 'invert') return; // 已是道 · 无为
    setModeUI('invert');
    $source.textContent = '\u5207\u6362\u4e2d \u2192 \u9053Agent\u2026';
    vsc.postMessage({ command: 'setMode', mode: 'dao' });
  });
  $btnOff.addEventListener('click', function() {
    if (curMode === 'passthrough') return; // 已是官 · 无为
    setModeUI('passthrough');
    $source.textContent = '\u5207\u6362\u4e2d \u2192 \u5b98\u65b9Agent\u2026';
    vsc.postMessage({ command: 'setMode', mode: 'official' });
  });

  document.getElementById('refresh').addEventListener('click', function() {
    vsc.postMessage({ command: 'refresh' });
  });
  document.getElementById('copy').addEventListener('click', function() {
    if (!lastText) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastText);
    } else {
      var ta = document.createElement('textarea');
      ta.value = lastText; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch(e) {}
      document.body.removeChild(ta);
    }
  });

  // v18.7 \u00b7 \u5b9e\u6536/\u539f\u53d1\u53cc\u89c6 \u00b7 \u9053\u6cd5\u81ea\u7136
  var $viewToggle = document.getElementById('viewToggle');
  var $ageTick = document.getElementById('ageTick');
  function updateViewToggle() {
    if (!$viewToggle) return;
    $viewToggle.classList.remove('vw-act', 'vw-orig');
    if (viewMode === 'actual') {
      $viewToggle.textContent = '\u5b9e';
      $viewToggle.title = '\u5f53\u524d: LLM\u5b9e\u6536 \u00b7 \u70b9\u51fb\u5207\u539f\u53d1';
      $viewToggle.classList.add('vw-act');
    } else {
      $viewToggle.textContent = '\u539f';
      $viewToggle.title = '\u5f53\u524d: Windsurf\u539f\u53d1 \u00b7 \u70b9\u51fb\u5207\u5b9e\u6536';
      $viewToggle.classList.add('vw-orig');
    }
  }
  if ($viewToggle) $viewToggle.addEventListener('click', function() {
    viewMode = viewMode === 'actual' ? 'original' : 'actual';
    updateViewToggle();
    if (lastProxyData) reRenderProxy();
  });
  function reRenderProxy() {
    if (!lastProxyData) return;
    var proxy = lastProxyData;
    var ts = new Date().toLocaleTimeString();
    if (viewMode === 'actual' && proxy.mode === 'invert' && proxy.after) {
      showText(proxy.after, ts);
      var src = '\u5b9e\u6536 \u00b7 LLM\u5b9e\u9645\u63a5\u6536';
      if (proxy.custom_sp) src += ' \u00b7 \u81ea\u5b9a\u4e49SP';
      src += ' \u00b7 ' + (proxy.after_chars || proxy.after.length) + '\u5b57';
      $source.textContent = src;
    } else if (proxy.before) {
      showText(proxy.before, ts);
      $source.textContent = '\u539f\u53d1 \u00b7 Windsurf\u62df\u53d1SP \u00b7 ' + (proxy.before_chars || proxy.before.length) + '\u5b57';
    } else if (proxy.after) {
      showText(proxy.after, ts);
      $source.textContent = proxy.synthesized ? '\u9053\u5fb7\u7ecf\u6ce8\u5165' : '\u900f\u4f20';
    }
    startAgeTick(proxy.age_s);
  }
  function startAgeTick(age_s) {
    if (_ageTimer) { clearInterval(_ageTimer); _ageTimer = null; }
    if (!$ageTick) return;
    if (age_s == null) { $ageTick.textContent = ''; return; }
    _ageBase = { s: age_s, at: Date.now() };
    var tick = function() {
      if (!_ageBase || !$ageTick) return;
      var cur = _ageBase.s + Math.round((Date.now() - _ageBase.at) / 1000);
      $ageTick.textContent = cur + 's\u524d';
    };
    tick();
    _ageTimer = setInterval(tick, 1000);
  }
  updateViewToggle();

  // v18.5 \u00b7 \u7f16\u8f91\u6a21\u5f0f \u00b7 \u7528\u6237\u53ef\u5b9e\u65f6\u6539\u52a8\u63d0\u793a\u8bcd \u00b7 \u70ed\u6ce8\u5165
  var $editToggle = document.getElementById('editToggle');
  var $editArea = document.getElementById('editArea');
  var $editText = document.getElementById('editText');
  var $editSave = document.getElementById('editSave');
  var $editReset = document.getElementById('editReset');
  var $editStatus = document.getElementById('editStatus');
  var $keepBlocks = document.getElementById('keepBlocks');
  var $customBadge = document.getElementById('customBadge');
  var editMode = false;
  var hasCustomSP = false;

  function toggleEdit() {
    editMode = !editMode;
    if (editMode) {
      $editArea.classList.add('show');
      $editToggle.classList.add('edit-active');
      $sp.style.display = 'none';
      // \u9884\u586b\u5f53\u524d SP \u6587\u672c\u4f9b\u7f16\u8f91
      if (!$editText.value && lastText) {
        $editText.value = lastText;
      }
      // \u8bf7\u6c42\u5f53\u524d\u81ea\u5b9a\u4e49 SP (\u82e5\u6709)
      vsc.postMessage({ command: 'getCustomSP' });
      $editText.focus();
    } else {
      $editArea.classList.remove('show');
      $editToggle.classList.remove('edit-active');
      $sp.style.display = '';
    }
  }

  $editToggle.addEventListener('click', toggleEdit);

  $editSave.addEventListener('click', function() {
    var sp = $editText.value;
    if (!sp || !sp.trim()) {
      $editStatus.textContent = '\u2716 \u5185\u5bb9\u4e0d\u53ef\u4e3a\u7a7a';
      return;
    }
    $editStatus.textContent = '\u4fdd\u5b58\u4e2d\u2026';
    vsc.postMessage({
      command: 'setCustomSP',
      sp: sp.trim(),
      keep_blocks: $keepBlocks.checked,
    });
  });

  $editReset.addEventListener('click', function() {
    $editStatus.textContent = '\u6e05\u9664\u4e2d\u2026';
    vsc.postMessage({ command: 'resetCustomSP' });
  });

  // Ctrl+Enter \u5feb\u6377\u4fdd\u5b58
  $editText.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      $editSave.click();
    }
  });

  function updateCustomBadge(isCustom, chars) {
    hasCustomSP = isCustom;
    if (isCustom) {
      $customBadge.innerHTML = '<span class="custom-badge">\u81ea\u5b9a\u4e49' + (chars ? ' ' + chars + '\u5b57' : '') + '</span>';
    } else {
      $customBadge.innerHTML = '';
    }
  }

  function setDots(dg) {
    $dots.innerHTML = '';
    if (!dg) { $dots.title = ''; return; }
    // v17.76 · 4 点 · 本源·Proxy·Capture·LS · SSE 藏于内不显
    // v18.2: 本源点优先取 bensource_sp (PEB 内存扫 · L0) 否则 ls_direct_sp
    var items = [
      { k: 'bensource_sp',    label: '\u672c\u6e90', altK: 'ls_direct_sp' },
      { k: 'proxy_up',        label: 'Proxy' },
      { k: 'proxy_capturing', label: 'Capture' },
      { k: 'ls_up',           label: 'LS' }
    ];
    var tipBits = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      // v18.2: altK 兜底 · 本源点 = bensource_sp || ls_direct_sp
      var on = !!dg[item.k] || (item.altK && !!dg[item.altK]);
      var d = document.createElement('span');
      d.className = 'dot ' + (on ? 'ok' : (item.k === 'proxy_capturing' ? 'warn' : 'err'));
      d.title = item.label + ': ' + (on ? '\u2713' : '\u2717');
      $dots.appendChild(d);
      tipBits.push(item.label + ':' + (on ? '\u2713' : '\u2717'));
    }
    $dots.title = tipBits.join(' \u00b7 ') + (dg.advice ? ' \u2014 ' + dg.advice : '');
  }

  // v18.7 · 实收/原发双视 · 道法自然
  // viewMode='actual': invert→proxy.after(LLM实收) passthrough→proxy.before
  // viewMode='original': 始终proxy.before(Windsurf原发) · 兼容旧多源优先级
  function renderView(d) {
    var proxy = d.proxy;
    var ts = d.ts ? new Date(d.ts).toLocaleTimeString() : '';
    setDots(d.diag);
    if (proxy) lastProxyData = proxy;
    updateViewToggle();

    // v18.7 · 实收视图 · invert + after → 显 LLM 实收 (道德经/自定义SP)
    if (viewMode === 'actual' && proxy && proxy.mode === 'invert' && proxy.after) {
      showText(proxy.after, ts);
      var src = (proxy.source === 'captured' ? '\u5b9e\u65f6\u6355\u83b7' : '\u9053\u5fb7\u7ecf\u6ce8\u5165') + ' \u00b7 LLM\u5b9e\u6536';
      if (proxy.custom_sp) src += ' \u00b7 \u81ea\u5b9a\u4e49SP';
      src += ' \u00b7 ' + (proxy.after_chars || proxy.after.length) + '\u5b57';
      $source.textContent = src;
      startAgeTick(proxy.age_s);
      setModeUI('invert');
      return;
    }

    // v18.9 · 原发视 · 优先取捕获轨 (/origin/realprompt) · 道并行而不相悖
    // realprompt.sp 与 proxy.before 价同 · 但源不同 (此为独立轨 · 不识 mode)
    // 有则用之 · 无则退使 proxy.before
    var realprompt = d.realprompt;
    var rpReliable = !!(realprompt && realprompt.has && realprompt.sp && realprompt.chars >= 2000);
    if (rpReliable) {
      showText(realprompt.sp, ts);
      var ageR = realprompt.age_s != null
        ? (realprompt.age_s < 60 ? realprompt.age_s + 's' : Math.round(realprompt.age_s / 60) + 'min')
        : '?';
      $source.textContent = '\u6355\u83b7\u8f68 \u00b7 \u539f\u53d1 \u00b7 ' + realprompt.chars + '\u5b57'
        + ' \u00b7 \u8eab\u4efd\u9996\u6bb5' + realprompt.identity_head_chars + '\u5b57'
        + ' \u00b7 ' + ageR + '\u524d';
      startAgeTick(realprompt.age_s);
      return;
    }

    // 判 proxy 是否可信(非陈旧 · 非摘要Agent · 足够长)
    var proxyReliable = false;
    if (proxy && proxy.before) {
      var isFresh = proxy.age_s == null || proxy.age_s < 300;
      var isLong = proxy.before.length >= 2000;
      var isMain = proxy.agent_class === 'main' || (!proxy.agent_class && isLong);
      proxyReliable = isFresh && isLong && isMain;
    }

    // v18.2 · 原发视图: L0 本源直采 > L1 LS直取 > L3 代理 > L4 重建 > 降级
    if (d.bensourceSP && d.bensourceSP.systemPrompt && d.bensourceSP.systemPrompt.length >= 2000) {
      renderBensource(d.bensourceSP, ts);
      startAgeTick(null);
    } else if (d.lsDirectSP && d.lsDirectSP.systemPrompt && d.lsDirectSP.systemPrompt.length >= 2000) {
      renderLsDirect(d.lsDirectSP, ts);
      startAgeTick(null);
    } else if (proxyReliable) {
      showText(proxy.before, ts);
      var acLabel = proxy.agent_class === 'main' ? '\u4e3b' : (proxy.agent_class === 'aux' ? '\u8f85' : '');
      $source.textContent = (proxy.source === 'captured' ? '\u5b9e\u65f6\u6355\u83b7' : '\u6301\u76d8\u7f13\u5b58')
        + ' \u00b7 \u539f\u53d1'
        + (acLabel ? ' \u00b7 ' + acLabel + 'Agent' : '');
      startAgeTick(proxy.age_s);
    } else if (d.reconstructed && d.reconstructed.text && d.reconstructed.text.length >= 1000) {
      renderRebuild(d.reconstructed, ts);
      startAgeTick(null);
    } else if (d.bensourceSP && d.bensourceSP.systemPrompt) {
      renderBensource(d.bensourceSP, ts);
      startAgeTick(null);
    } else if (d.lsDirectSP && d.lsDirectSP.systemPrompt) {
      renderLsDirect(d.lsDirectSP, ts);
      startAgeTick(null);
    } else if (proxy && proxy.before) {
      showText(proxy.before, ts);
      var staleTag = (proxy.age_s != null && proxy.age_s > 300) ? ' \u00b7 \u2757\u9648\u65e7' : '';
      var shortTag = proxy.before.length < 2000 ? ' \u00b7 \u2757\u7591\u8f85\u52a9Agent' : '';
      $source.textContent = '\u964d\u7ea7: ' + (proxy.source === 'captured' ? '\u6355\u83b7\u7f13\u5b58' : '\u6301\u76d8')
        + staleTag + shortTag;
      startAgeTick(proxy.age_s);
    } else if (proxy && proxy.after) {
      showText(proxy.after, ts);
      $source.textContent = proxy.synthesized ? '\u9053\u5fb7\u7ecf\u6ce8\u5165 (invert)' : '\u539f\u6837\u900f\u4f20 (passthrough)';
      startAgeTick(proxy.age_s);
    } else {
      showEmpty(ts);
      startAgeTick(null);
      // v18.2 · 失败诊断 · 优先报 bensource error (最常用)
      var errMsg = '';
      if (d.bensourceSP && d.bensourceSP.error) errMsg = d.bensourceSP.error;
      else if (d.lsDirectSP && d.lsDirectSP.error) errMsg = d.lsDirectSP.error;
      if (errMsg) {
        $source.textContent = '\u672a\u76f4\u53d6\u672c\u6e90: ' + errMsg.slice(0, 120);
      }
    }
  }

  // v18.9 · 内容变则锦锥顶 · 令 "You are Cascade..." 首段常见
  function _scrollSpTop() {
    try {
      $sp.scrollTop = 0;
      var p = $sp.parentElement;
      while (p) { p.scrollTop = 0; p = p.parentElement; }
      // v18.9.1 · 微延二敢 · 防渲染后 contentSize 变付 scrollTop 被重量
      setTimeout(function () { try { $sp.scrollTop = 0; } catch (_) {} }, 0);
    } catch (_) {}
  }

  function showText(text, ts) {
    var changed = text !== lastText;
    lastText = text;
    $sp.classList.remove('quiet');
    $sp.innerHTML = '';
    $sp.textContent = text;
    $meta.textContent = text.length + ' \u5b57 \u00b7 ' + ts;
    // 新文则锦锥首段 · 同文不动 (保用户阅位)
    if (changed) _scrollSpTop();
  }

  function showEmpty(ts) {
    $sp.classList.add('quiet');
    $sp.innerHTML = '';
    $sp.textContent = '\u81f4\u865a\u5b88\u9759 \u00b7 \u5f85\u4e3bCascade\u4ea4\u4e92\\n\u8bf7\u53d1\u4e00\u6761\u6d88\u606f\u89e6\u53d1\u672c\u6e90\u91c7\u96c6';
    $meta.textContent = ts;
    $source.textContent = '';
    lastText = '';
  }

  // v23 · 重建SP渲染 · 合众流为一 · 大成
  function renderRebuild(r, ts) {
    var changed = r.text !== lastText;
    lastText = r.text;
    $sp.classList.remove('quiet');
    $sp.textContent = r.text;
    if (changed) _scrollSpTop();
    var srcBits = [];
    if (r.sources) {
      if (r.sources.rules) srcBits.push('rules\u00d7' + r.sources.rules);
      if (r.sources.memories) srcBits.push('memories\u00d7' + r.sources.memories);
      if (r.sources.tools) srcBits.push('tools\u00d7' + r.sources.tools);
      if (r.sources.mcp) srcBits.push('mcp\u00d7' + r.sources.mcp);
      if (r.sources.skills) srcBits.push('skills\u00d7' + r.sources.skills);
      if (r.sources.workflows) srcBits.push('wf\u00d7' + r.sources.workflows);
      if (r.sources.workspaces) srcBits.push('ws\u00d7' + r.sources.workspaces);
      if (r.sources.trajectories) srcBits.push('traj\u00d7' + r.sources.trajectories);
      if (r.sources.settings) srcBits.push('settings');
      if (r.sources.modelConfigs) srcBits.push('model');
      if (r.sources.unleash) srcBits.push('unleash');
      if (r.sources.isolation) srcBits.push('iso');
    }
    var staticN = (r.sections || []).filter(function(s){return s.kind==='static';}).length;
    var dynN = (r.sections || []).filter(function(s){return s.kind==='dynamic';}).length;
    var staticC = r.staticChars != null ? r.staticChars : '?';
    var dynC = r.dynamicChars != null ? r.dynamicChars : '?';
    $meta.textContent = r.chars + ' \u5b57 \u00b7 ' + staticN + '\u9759+' + dynN + '\u52a8 \u00b7 ' + ts;
    $source.textContent = '\u5168\u6e90\u91cd\u5efa \u00b7 \u9759' + staticC + '/\u52a8' + dynC + ' \u00b7 ' + (srcBits.length ? srcBits.join(' + ') : '\u65e0\u52a8\u6e90');
  }

  // v17.76.1 · 本源直取渲染 · LS Cortex 直返 / 轨迹回放 / 辅助降级
  function renderLsDirect(ld, ts) {
    var changed = ld.systemPrompt !== lastText;
    lastText = ld.systemPrompt;
    $sp.classList.remove('quiet');
    $sp.textContent = ld.systemPrompt;
    if (changed) _scrollSpTop();
    var srcLabel;
    if (ld.source === 'ls-direct') {
      srcLabel = '\u672c\u6e90 \u00b7 GetSystemPromptAndTools (LS Cortex \u76f4\u8fd4)';
    } else if (ld.source === 'ls-trajectory') {
      srcLabel = '\u672c\u6e90 \u00b7 \u8f68\u8ff9\u56de\u653e (Trajectory ' +
        (ld.trajectoryId ? ld.trajectoryId.slice(0, 8) : '?') + ')';
    } else if (ld.source === 'ls-direct-aux') {
      srcLabel = '\u26a0 \u8f85\u52a9Agent SP \u00b7 \u975e\u4e3bCascade \u00b7 \u8bf7\u53d1\u6d88\u606f\u540e\u5237\u65b0';
    } else {
      srcLabel = '\u672c\u6e90 \u00b7 LS \u76f4\u53d6';
    }
    var metaStr = ld.chars + ' \u5b57';
    if (ld.toolCount) metaStr += ' \u00b7 ' + ld.toolCount + ' \u5de5\u5177';
    metaStr += ' \u00b7 ' + ts;
    $meta.textContent = metaStr;
    $source.textContent = srcLabel;
  }

  // v18.2 · 本源直采渲染 · L0 PEB 内存扫 (最深源 · 隔离模块)
  function renderBensource(bs, ts) {
    var changed = bs.systemPrompt !== lastText;
    lastText = bs.systemPrompt;
    $sp.classList.remove('quiet');
    $sp.textContent = bs.systemPrompt;
    if (changed) _scrollSpTop();
    var srcLabel = '\u672c\u6e90\u76f4\u91c7';
    if (bs.source === 'peb-memory-scan') {
      srcLabel += ' \u00b7 PEB\u5185\u5b58\u626b';
    } else if (bs.source === 'ls-rpc-direct') {
      srcLabel += ' \u00b7 LS RPC\u76f4\u53d6';
    } else if (bs.source === 'ls-rpc-trajectory') {
      srcLabel += ' \u00b7 \u8f68\u8ff9\u56de\u653e';
    }
    if (bs.lsPid) srcLabel += ' \u00b7 PID ' + bs.lsPid;
    if (bs.scanMs) srcLabel += ' \u00b7 ' + bs.scanMs + 'ms';
    if (bs.fromCache) srcLabel += ' \u00b7 \u7f13';
    $source.textContent = srcLabel;
    var metaStr = bs.chars + ' \u5b57';
    if (bs.regions) metaStr += ' \u00b7 ' + bs.regions + '\u533a';
    metaStr += ' \u00b7 ' + ts;
    $meta.textContent = metaStr;
  }

  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'data') {
      renderView(e.data.data);
      // v18.1.3 · 官方为先 · 缺 ml 归官 (安全默) · 仅"道Agent"显式时方启道高亮
      // ml 三态: "官方Agent · 直连云端" / "官方Agent · 运行中" / "道Agent ..."
      // 旧 v17.85.2: 见"官方Agent"即官 · 否则一律归道 (空 ml 时 UI 闪道 高亮)
      // 新 v18.1.3: 见"道Agent"即道 · 否则一律归官 (与 package.json defaultMode 对齐)
      var ml = e.data.data.modeLabel || '';
      if (/\u9053\s*Agent/.test(ml)) setModeUI('invert');
      else setModeUI('passthrough');
      // v18.5 · 自定义 SP badge 更新
      var proxy = e.data.data.proxy;
      if (proxy && proxy.custom_sp != null) {
        updateCustomBadge(proxy.custom_sp, proxy.custom_sp_chars);
      }
    }
    if (e.data.type === 'mode') {
      setModeUI(e.data.mode);
    }
    // v18.5 · 自定义 SP 操作结果
    if (e.data.type === 'customSP') {
      var r = e.data;
      if (r.action === 'get') {
        if (r.has_custom && r.sp) {
          $editText.value = r.sp;
          $keepBlocks.checked = r.keep_blocks !== false;
          updateCustomBadge(true, r.chars);
        }
        $editStatus.textContent = r.has_custom ? '\u5f53\u524d\u5df2\u8bbe\u81ea\u5b9a\u4e49SP' : '\u672a\u8bbe\u7f6e\u81ea\u5b9a\u4e49SP';
      } else if (r.action === 'set') {
        if (r.ok) {
          $editStatus.textContent = '\u2714 \u5df2\u6ce8\u5165 \u00b7 ' + (r.chars || 0) + '\u5b57 \u00b7 \u4e0b\u6b21\u5bf9\u8bdd\u751f\u6548';
          updateCustomBadge(true, r.chars);
        } else {
          $editStatus.textContent = '\u2716 \u4fdd\u5b58\u5931\u8d25: ' + (r.error || '\u672a\u77e5');
        }
      } else if (r.action === 'reset') {
        if (r.ok) {
          $editStatus.textContent = '\u2714 \u5df2\u6e05\u9664 \u00b7 \u5f52\u9053';
          $editText.value = '';
          updateCustomBadge(false);
        } else {
          $editStatus.textContent = '\u2716 \u6e05\u9664\u5931\u8d25';
        }
      }
    }
  });

  // v17.86.2-wd · webview watchdog · 3s 未收 type='data' 重发 refresh · 8s 仍无显式提示
  // 道法自然 · 永不卡 placeholder · 民至老死不再相忘
  var _hasData = false;
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'data') _hasData = true;
  });
  setTimeout(function() {
    if (!_hasData) {
      try { $source.textContent = '\u91cd\u8bd5\u4e2d \u00b7 watchdog 3s'; } catch (_e) {}
      vsc.postMessage({ command: 'refresh' });
    }
  }, 3000);
  setTimeout(function() {
    if (!_hasData) {
      vsc.postMessage({ command: 'refresh' });
    }
  }, 6000);
  setTimeout(function() {
    if (!_hasData) {
      try {
        $source.textContent = 'webview \u5904 stale \u00b7 \u8bf7 Ctrl+Shift+P \u2192 Reload Window';
        $sp.classList.add('quiet');
        $sp.textContent = '\u672a\u6536\u5230\u540e\u7aef\u6570\u636e \u00b7 IPC stale \u00b7 Reload Window \u5373\u89e3';
      } catch (_e) {}
    }
  }, 10000);

  vsc.postMessage({ command: 'refresh' });
})();
</script>
</body>
</html>`;

// ═══════════════════════ Provider · 无为 ═══════════════════════

class EssenceProvider {
  constructor(ctx, opts) {
    this._ctx = ctx;
    this._view = null;
    this._timer = null;
    this._sigTimer = null; // v17.73 · 高频 sig 轻敲
    this._auto = true;
    this._busy = false;
    // v17.73 · 三频策略: 签 1s · 详 6s · 此谓"观复守静"
    // v17.75 · SSE 推至 · 签与轮询皆降级为兜底
    this._pollMs = (opts && opts.pollMs) || 6000; // 全 refresh 兜底 (远端 LS + proxy preview)
    this._sigMs = (opts && opts.sigMs) || 1000; // 签名轻敲 (~200B)
    this._lastSig = ""; // 上次 sp_sig · 签未变不触全 refresh
    this._lastSigMode = "";
    this._getPort =
      (opts && opts.getPort) ||
      (() =>
        ctx.globalState.get("wam.originPort") ||
        vscode.workspace.getConfiguration().get("dao.origin.port", 8889));

    // getIsolation · 文件层隔离状态查询
    this._getIsolation = (opts && opts.getIsolation) || null;

    // v17.69 · 归一 · 模式切换回调 + 状态文本获取 (合并 DaoToggleProvider 职能)
    this._onModeChange = (opts && opts.onModeChange) || null; // async (mode) => void
    this._getModeLabel = (opts && opts.getModeLabel) || null; // async () => string

    // watcher 仅作刷新触发器 · 不持任何业务态
    this._watcher = (opts && opts.watcher) || null;
    this._watcherHandlers = null;
    this._refreshPending = false;
    this._lastRefreshTs = 0;
    this._minGapMs = 400;

    // v17.76 · SSE 推式订阅 · 捕即发 · 无轮询间隙 · 太上不知有之
    // 事件 sp → forceRefresh (fetch /origin/preview 得完整最终 SP)
    // 无 proxy 时静默重试 · 指数退避 · 用户无感
    this._sse = null;
    this._sseLastSpSig = ""; // 上次 sp 事件签名 · 防同签重刷
    this._setupSse();

    if (this._watcher) this._bindWatcher();
  }

  // v17.76 · 建 SSE 客户端 · 简事件处理 · 只听 sp/mode · 无着相
  _setupSse() {
    try {
      this._sse = new DaoSseClient(this._getPort());
      // 捕 inject → forceRefresh (取 preview 完整最终 SP)
      // 载荷仅签名 + 字符计 · 不带全文 (全文经 /origin/preview 取)
      this._sse.on("sp", (ev) => {
        if (!this._view) return;
        const sig = ev && ev.sig;
        if (sig && sig === this._sseLastSpSig) return; // 同签不重刷
        this._sseLastSpSig = sig || "";
        // 立刷 · 不走 busy/gap 限流 (SSE 事件即真 · 新鲜)
        this.forceRefresh().catch(() => {});
      });
      // 模式变广播 · UI 按钮即变色
      this._sse.on("mode", (ev) => {
        if (!this._view) return;
        try {
          this._view.webview.postMessage({
            type: "mode",
            mode: ev && ev.mode,
            label: "",
          });
        } catch {}
      });
      this._sse.on("connect", () => {
        // 连上后 · 触一次 refresh 同步 UI
        if (this._view) this.forceRefresh().catch(() => {});
      });
      // 立启 · 连不上时静默重试 (不依赖 webview 生命期)
      this._sse.start();
    } catch {
      this._sse = null;
    }
  }

  // v17.75 · 若端口变 (用户切 dao.origin.port) · 更新 SSE 端口
  _refreshSsePort() {
    try {
      if (this._sse) {
        const port = this._getPort();
        this._sse.setPort(port);
      }
    } catch {}
  }

  _bindWatcher() {
    const onTrigger = () => this._scheduleRefresh();
    this._watcherHandlers = { onTrigger };
    try {
      this._watcher.on("change", onTrigger);
      this._watcher.on("poll", onTrigger);
    } catch {}
  }

  _unbindWatcher() {
    if (!this._watcher || !this._watcherHandlers) return;
    try {
      this._watcher.off("change", this._watcherHandlers.onTrigger);
      this._watcher.off("poll", this._watcherHandlers.onTrigger);
    } catch {}
    this._watcherHandlers = null;
  }

  _scheduleRefresh() {
    if (!this._auto || !this._view || !this._view.visible) return;
    const now = Date.now();
    const gap = now - this._lastRefreshTs;
    if (this._refreshPending) return;
    if (this._busy || gap < this._minGapMs) {
      this._refreshPending = true;
      setTimeout(
        () => {
          this._refreshPending = false;
          this.refresh().catch(() => {});
        },
        Math.max(this._minGapMs - gap, 0) + 50,
      );
      return;
    }
    this.refresh().catch(() => {});
  }

  async resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (!msg) return;
      try {
        if (msg.command === "refresh") await this.refresh();
        else if (msg.command === "refreshLS") await this._refreshLS();
        else if (msg.command === "setMode") await this._handleSetMode(msg.mode);
        // v18.5 · 自定义 SP 注入接口
        else if (msg.command === "getCustomSP") await this._handleGetCustomSP();
        else if (msg.command === "setCustomSP")
          await this._handleSetCustomSP(msg);
        else if (msg.command === "resetCustomSP")
          await this._handleResetCustomSP();
      } catch {}
    });

    webviewView.webview.html = HTML_TEMPLATE;

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.refresh().catch(() => {});
        this._armTimer();
      } else {
        this._stopTimer();
      }
    });

    webviewView.onDidDispose(() => {
      this._view = null;
      this._stopTimer();
    });

    this._armTimer();
    this.refresh().catch(() => {});
  }

  _armTimer() {
    this._stopTimer();
    if (!this._auto || !this._view || !this._view.visible) return;
    // v17.73 · 双轨计时: 全 refresh 兜底 (6s) + sig 轻敲 (1s · 变即刷)
    const fullMs = this._watcher ? this._pollMs * 2 : this._pollMs;
    this._timer = setInterval(() => this.refresh().catch(() => {}), fullMs);
    this._sigTimer = setInterval(
      () => this._sigTick().catch(() => {}),
      this._sigMs,
    );
  }

  _stopTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (this._sigTimer) {
      clearInterval(this._sigTimer);
      this._sigTimer = null;
    }
  }

  // v17.73 · 签名轻敲 · 致虚守静 · 观复知常
  // /origin/sig 载荷 < 200B · 1s 一敲无负担
  // 签未变: 静 · 签一变: 立触全 refresh (不等 6s 兜底)
  // v17.75 · SSE 连上时 · sig 降为兜底 (稀敲 · 无需 1s) · SSE 主导
  async _sigTick() {
    if (!this._view || !this._view.visible || this._busy) return;
    const port = this._getPort();
    if (!port) return;
    // 端口或变 · 顺便同步 SSE 端口
    this._refreshSsePort();
    // v17.75 · SSE 已连 · sig 稀敲 (每第 10 次方敲 · 即 10s 一轮)
    if (this._sse && this._sse.isConnected()) {
      this._sigSkipCounter = (this._sigSkipCounter || 0) + 1;
      if (this._sigSkipCounter % 10 !== 0) return;
    }
    try {
      const sig = await httpGetJson(`http://127.0.0.1:${port}/origin/sig`, 800);
      if (!sig || !sig.ok) return;
      const cur = `${sig.mode}|${sig.sp_sig}`;
      if (cur === this._lastSig) return; // 恒 · 静
      this._lastSig = cur;
      this._lastSigMode = sig.mode;
      // 签变 → 立触 refresh · 不走 busy/gap 限流 (变为新鲜 · 速知)
      this.refresh().catch(() => {});
    } catch {}
  }

  async refresh() {
    if (!this._view || this._busy) return;
    this._busy = true;
    this._lastRefreshTs = Date.now();
    try {
      const port = this._getPort();
      const data = await gatherEssence(this._ctx, port);
      if (!this._view) return;
      if (this._getIsolation) {
        try {
          data.isolation = this._getIsolation();
        } catch {}
      }
      // v17.69 · 归一 · 同步模式状态文本 ("道Agent 运行中 :8889" 等) 供按钮 tooltip
      if (this._getModeLabel) {
        try {
          data.modeLabel = await this._getModeLabel();
        } catch {}
      }
      // v17.76 · SSE 藏于内 · UI 不显其形 · 太上不知有之
      try {
        await this._view.webview.postMessage({ type: "data", data });
      } catch {}
    } finally {
      this._busy = false;
    }
  }

  // v17.69 · 归一 · 模式切换 · webview setMode 消息入口
  // v17.73 · 无感热切: 清 _lastSig 令下一 sigTick 必触全 refresh
  //         不再空等 800ms · 立即 forceRefresh (proxy 已 persist · 读即新)
  async _handleSetMode(mode) {
    if (!this._onModeChange) return;
    try {
      await this._onModeChange(mode);
    } catch {}
    // 清签 · 令立刻识变
    this._lastSig = "";
    this._lastSigMode = "";
    // 50ms 后推模式状态 (proxy POST 已同步 · 只需一个事件循环)
    setTimeout(() => this._postMode().catch(() => {}), 50);
    // 200ms 后立触 forceRefresh (proxy 启停 / mode 持化 · 200ms 足)
    setTimeout(() => this.forceRefresh().catch(() => {}), 200);
  }

  // v17.69 · 轻量推送 · 仅模式变 · 不 gather 全数据
  // v17.85.2 · 广识 "官方Agent" 任态 (运行中/直连云端) · 兜底归道 · 不闪不漂
  async _postMode() {
    if (!this._view || !this._getModeLabel) return;
    try {
      const label = await this._getModeLabel();
      if (!this._view) return;
      // label 三态: "官方Agent · 直连云端" / "官方Agent · 运行中" / "道Agent ..."
      // v18.1.3 · 安全默: 缺 label 或奇异填充 → 归 passthrough (不干预)
      //   旧: 默 invert · 错位时 UI 闪道
      //   新: 默 passthrough · 与 package.json defaultMode 一致
      let mode = "passthrough";
      if (/道\s*Agent/.test(label)) mode = "invert";
      else if (/官方\s*Agent/.test(label)) mode = "passthrough";
      await this._view.webview.postMessage({ type: "mode", mode, label });
    } catch {}
  }

  // v20 · 模式切换即刷 · 不受 busy 阻
  async forceRefresh() {
    this._busy = false;
    await this.refresh();
  }

  // v20 · LS 全端点强制采集 (webview 请求 refreshLS 时)
  async _refreshLS() {
    if (!this._view) return;
    try {
      const lsData = await lsClient.gatherAll({ extended: true });
      let lsSections = null;
      if (lsData && !lsData.error) {
        lsSections = _extractLSSections(lsData);
      }
      const data = { ts: new Date().toISOString(), proxy: null, lsSections };
      try {
        await this._view.webview.postMessage({ type: "data", data });
      } catch {}
    } catch {}
  }

  // v18.5 · 自定义 SP 注入处理 · webview → proxy HTTP API
  async _handleGetCustomSP() {
    if (!this._view) return;
    try {
      const port = this._getPort();
      const r = await httpGetJson(
        `http://127.0.0.1:${port}/origin/custom_sp`,
        2000,
      );
      await this._view.webview.postMessage({
        type: "customSP",
        action: "get",
        has_custom: r && r.has_custom,
        sp: r && r.sp,
        chars: r && r.chars,
        keep_blocks: r && r.keep_blocks,
      });
    } catch {
      try {
        await this._view.webview.postMessage({
          type: "customSP",
          action: "get",
          has_custom: false,
          error: "proxy unreachable",
        });
      } catch {}
    }
  }

  async _handleSetCustomSP(msg) {
    if (!this._view) return;
    try {
      const port = this._getPort();
      const r = await httpPostJson(
        `http://127.0.0.1:${port}/origin/custom_sp`,
        {
          sp: msg.sp,
          keep_blocks: msg.keep_blocks,
          source: "webview",
        },
        3000,
      );
      await this._view.webview.postMessage({
        type: "customSP",
        action: "set",
        ok: r && r.ok,
        chars: r && r.chars,
        error: r && r.error,
      });
      // 立刷 UI
      if (r && r.ok) {
        this._lastSig = "";
        setTimeout(() => this.forceRefresh().catch(() => {}), 300);
      }
    } catch (e) {
      try {
        await this._view.webview.postMessage({
          type: "customSP",
          action: "set",
          ok: false,
          error: e.message || "exception",
        });
      } catch {}
    }
  }

  async _handleResetCustomSP() {
    if (!this._view) return;
    try {
      const port = this._getPort();
      const r = await httpDelete(
        `http://127.0.0.1:${port}/origin/custom_sp`,
        2000,
      );
      await this._view.webview.postMessage({
        type: "customSP",
        action: "reset",
        ok: r && r.ok,
      });
      // 立刷 UI
      if (r && r.ok) {
        this._lastSig = "";
        setTimeout(() => this.forceRefresh().catch(() => {}), 300);
      }
    } catch {
      try {
        await this._view.webview.postMessage({
          type: "customSP",
          action: "reset",
          ok: false,
        });
      } catch {}
    }
  }

  // v18.5 · 公共接口 · agent / 命令可直接调用 (不经 webview)
  async setCustomSP(sp, opts) {
    opts = opts || {};
    const port = this._getPort();
    return await httpPostJson(
      `http://127.0.0.1:${port}/origin/custom_sp`,
      {
        sp,
        keep_blocks: opts.keep_blocks !== false,
        source: opts.source || "command",
      },
      3000,
    );
  }

  async getCustomSP() {
    const port = this._getPort();
    return await httpGetJson(`http://127.0.0.1:${port}/origin/custom_sp`, 2000);
  }

  async resetCustomSP() {
    const port = this._getPort();
    return await httpDelete(`http://127.0.0.1:${port}/origin/custom_sp`, 2000);
  }

  reveal() {
    if (this._view && this._view.show) {
      try {
        this._view.show(true);
      } catch {}
    }
  }

  dispose() {
    this._stopTimer();
    this._unbindWatcher();
    // v17.75 · 解 SSE
    try {
      if (this._sse) this._sse.stop();
    } catch {}
    this._sse = null;
    this._view = null;
  }
}

module.exports = {
  EssenceProvider,
  gatherEssence,
  // v17.88 · _buildReconstructedSP stub 仍 export 防外测试引 · 但实永返 null
  _buildReconstructedSP,
  _diagnose,
  // v17.75 · SSE 订阅客户端 · 可独测 · 可单用
  DaoSseClient,
};
