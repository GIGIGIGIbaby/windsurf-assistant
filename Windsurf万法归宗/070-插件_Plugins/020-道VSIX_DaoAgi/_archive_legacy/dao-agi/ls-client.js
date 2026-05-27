// ls-client.js — 直连 Language Server · 道法自然 · 无需代理
//
// 致虚极,守静笃。万物并作,吾以观复。
// 兵无常势,水无常形,能因敌变化而取胜者,谓之神。
//
// v18.1: 全量端点 · 实时注入 · 增量指纹 · 自适应刷新
//   Channel A: LS gRPC — 直连 Language Server (Connect-JSON)
//   全端点覆盖: Rules + MCP + Settings + Workspaces + Memories +
//     ModelConfigs + Unleash + User + Trajectories + Skills + Workflows +
//     EditState + Processes
//   增量指纹: 每次采集生成 section-level hash · 供 diff 比对
"use strict";

const http = require("node:http");
const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const IS_WIN = process.platform === "win32";
const LS_SERVICE = "exa.language_server_pb.LanguageServerService";

// ═══════════════════════ Discovery Cache ═══════════════════════

let _lsCache = null; // { port, csrf, pid, ts }
let _candidatePorts = []; // v18.2 · 多端口候选 · LS 可能同时监听 gRPC/LSP/index
const CACHE_TTL = 120000; // 2 min

// Inline PowerShell script: reads CSRF from LS process environment via PEB
// Self-contained · no external script dependency · works in distributed VSIX
const _CSRF_PS1 = [
  'Add-Type -TypeDefinition @"',
  "using System; using System.Runtime.InteropServices; using System.Text;",
  "public class PER {",
  '  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h,int c,ref PBI p,int l,ref int r);',
  '  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint a,bool b,int p);',
  '  [DllImport("kernel32.dll",SetLastError=true)] static extern bool ReadProcessMemory(IntPtr h,IntPtr b,byte[] l,int s,out int r);',
  '  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);',
  "  [StructLayout(LayoutKind.Sequential)] public struct PBI{public IntPtr R1;public IntPtr Peb;public IntPtr R2a;public IntPtr R2b;public IntPtr Pid;public IntPtr R3;}",
  "  public static string Get(int pid,string vn){",
  '    IntPtr h=OpenProcess(0x0410,false,pid);if(h==IntPtr.Zero)return"";',
  '    try{var p=new PBI();int r=0;if(NtQueryInformationProcess(h,0,ref p,Marshal.SizeOf(p),ref r)!=0)return"";',
  '    byte[] pb=new byte[0x30];int rd;if(!ReadProcessMemory(h,p.Peb,pb,pb.Length,out rd))return"";',
  "    IntPtr pa=(IntPtr)BitConverter.ToInt64(pb,0x20);",
  '    byte[] pp=new byte[0x400];if(!ReadProcessMemory(h,pa,pp,pp.Length,out rd))return"";',
  "    IntPtr ea=(IntPtr)BitConverter.ToInt64(pp,0x80);",
  '    byte[] eb=new byte[65536];if(!ReadProcessMemory(h,ea,eb,eb.Length,out rd))return"";',
  "    string es=Encoding.Unicode.GetString(eb,0,rd);",
  "    foreach(string v in es.Split(new char[]{'\\0'},StringSplitOptions.RemoveEmptyEntries))",
  '      if(v.StartsWith(vn+"=",StringComparison.OrdinalIgnoreCase))return v.Substring(vn.Length+1);',
  '    return"";}finally{CloseHandle(h);}}',
  "}",
  '"@',
  "$p=Get-Process language_server_windows_x64 -EA SilentlyContinue|Select -First 1",
  'if($p){$c=(Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)").CommandLine',
  '"PID=$($p.Id)"',
  '"CMD=$c"',
  '$t=[PER]::Get($p.Id,"WINDSURF_CSRF_TOKEN")',
  'if($t){"CSRF=$t"}',
  "# v18.2 · 所有监听端口 · gRPC 与 LSP 异动 · 逐个 probe 择优",
  "$allPorts = Get-NetTCPConnection -OwningProcess $p.Id -State Listen -EA SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' } | Select-Object -ExpandProperty LocalPort | Sort-Object",
  "if($allPorts){\"LISTEN=$($allPorts -join ',')\"}}",
].join("\n");

/**
 * Discover LS process: port + CSRF token + PID
 * Caches result for 2 minutes; returns null if LS not found.
 */
function discoverLS(forceRefresh) {
  if (!forceRefresh && _lsCache && Date.now() - _lsCache.ts < CACHE_TTL) {
    return _lsCache;
  }

  let port = 0,
    csrf = "",
    pid = 0;

  try {
    if (IS_WIN) {
      // Write script to temp file to avoid quoting issues, then execute
      const tmpPs1 = path.join(os.tmpdir(), "_dao_ls_discover.ps1");
      fs.writeFileSync(tmpPs1, _CSRF_PS1, "utf8");
      const out = execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPs1}"`,
        {
          encoding: "utf8",
          timeout: 10000,
          windowsHide: true,
          stdio: ["ignore", "pipe", "ignore"],
        },
      );

      const pidM = out.match(/PID=(\d+)/);
      if (pidM) pid = parseInt(pidM[1]);

      const csrfM = out.match(/CSRF=([0-9a-f-]+)/i);
      if (csrfM) csrf = csrfM[1];

      // v18.2 · LS 多端口 (gRPC + LSP + index) · 选对的 gRPC
      // 缓存所有候选 · 首次调用会按顺序 probe · 择应答 200 者
      const listenM = out.match(/LISTEN=([\d,]+)/);
      if (listenM) {
        _candidatePorts = listenM[1]
          .split(",")
          .map((s) => parseInt(s))
          .filter((n) => n > 0);
        if (_candidatePorts.length > 0) port = _candidatePorts[0];
      }
      if (!port) {
        // fallback · 命令行 --server_port
        const cmdM = out.match(/CMD=(.+)/);
        if (cmdM) {
          const portM = cmdM[1].match(/--server_port[= ](\d+)/);
          if (portM) port = parseInt(portM[1]);
        }
      }
    } else {
      // Linux/macOS
      try {
        const out = execSync("pgrep -a language_server 2>/dev/null || true", {
          encoding: "utf8",
          timeout: 5000,
        });
        const pm = out.match(/--server_port[= ](\d+)/);
        if (pm) port = parseInt(pm[1]);
        const pidm = out.match(/^(\d+)/m);
        if (pidm) pid = parseInt(pidm[1]);
        // CSRF from /proc on Linux
        if (pid > 0) {
          try {
            const env = fs.readFileSync(`/proc/${pid}/environ`, "utf8");
            const cm = env.match(/WINDSURF_CSRF_TOKEN=([0-9a-f-]+)/);
            if (cm) csrf = cm[1];
          } catch {}
        }
      } catch {}
    }
  } catch {}

  if (!port) port = 27771;

  _lsCache = { port, csrf, pid, ts: Date.now() };
  return _lsCache;
}

// ═══════════════════════ gRPC Connect-JSON ═══════════════════════

/**
 * Call LS via Connect-JSON protocol.
 * Returns { ok, status, data } where data is parsed JSON.
 */
function lsRpc(port, csrf, method, body, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify(body || {});
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path: `/${LS_SERVICE}/${method}`,
          method: "POST",
          headers: {
            "content-type": "application/json",
            "connect-protocol-version": "1",
            ...(csrf ? { "x-codeium-csrf-token": csrf } : {}),
            "content-length": Buffer.byteLength(payload),
          },
          timeout: timeoutMs || 5000,
          agent: false,
        },
        (res) => {
          let buf = "";
          res.setEncoding("utf8");
          res.on("data", (c) => {
            buf += c;
          });
          res.on("end", () => {
            let data = null;
            try {
              data = JSON.parse(buf);
            } catch {
              data = buf;
            }
            resolve({
              ok: res.statusCode === 200,
              status: res.statusCode,
              data,
            });
          });
        },
      );
      req.on("error", () => resolve({ ok: false, status: 0, data: null }));
      req.on("timeout", () => {
        try {
          req.destroy();
        } catch {}
        resolve({ ok: false, status: 0, data: "timeout" });
      });
      req.write(payload);
      req.end();
    } catch {
      resolve({ ok: false, status: 0, data: null });
    }
  });
}

// ═══════════════════════ Metadata 构造 · 道法自然 ═══════════════════════
// 某些 RPC (如 GetSystemPromptAndTools) 强校验 metadata · apiKey/ideVersion/
// extensionVersion 皆必填 · 仅 ideName 不够. 此函数提供最小可过校验的 metadata.

function _buildFullMetadata(opts) {
  opts = opts || {};
  return {
    ideName: opts.ideName || "windsurf",
    ideVersion: opts.ideVersion || "2.0.44",
    extensionName: opts.extensionName || "windsurf",
    extensionVersion: opts.extensionVersion || "1.48.2",
    apiKey: opts.apiKey || "placeholder",
    locale: opts.locale || "en-us",
    sessionId: opts.sessionId || "00000000-0000-0000-0000-000000000001",
    os:
      opts.os || (process.platform === "win32" ? "windows" : process.platform),
  };
}

// ═══════════════════════ Heartbeat + CSRF 自愈 ═══════════════════════

async function _ensureHeartbeat(ls) {
  const hb = await lsRpc(
    ls.port,
    ls.csrf,
    "Heartbeat",
    { metadata: { ideName: "windsurf" } },
    3000,
  );
  if (hb.ok) return ls;

  // v18.2 · LS 多端口 · 首选失败 · 逐个候选 port probe
  for (const p of _candidatePorts) {
    if (p === ls.port) continue;
    const hbP = await lsRpc(
      p,
      ls.csrf,
      "Heartbeat",
      { metadata: { ideName: "windsurf" } },
      2000,
    );
    if (hbP.ok) {
      ls.port = p;
      _lsCache = ls;
      return ls;
    }
  }

  // CSRF 过期 → 强刷 · 重走 discovery
  const ls2 = discoverLS(true);
  const hb2 = await lsRpc(
    ls2.port,
    ls2.csrf,
    "Heartbeat",
    { metadata: { ideName: "windsurf" } },
    3000,
  );
  if (hb2.ok) {
    Object.assign(ls, ls2);
    return ls;
  }
  // 再 probe 候选
  for (const p of _candidatePorts) {
    if (p === ls2.port) continue;
    const hbP = await lsRpc(
      p,
      ls2.csrf,
      "Heartbeat",
      { metadata: { ideName: "windsurf" } },
      2000,
    );
    if (hbP.ok) {
      Object.assign(ls, ls2, { port: p });
      _lsCache = ls;
      return ls;
    }
  }
  return null;
}

// ═══════════════════════ Gather All · 万物并作 ═══════════════════════

// v18.1 全端点 · 覆盖一切注入源
// 注: GetSystemPromptAndTools 独立探测 (probeLatestSP) · 不入批量 gatherAll
//     因其强校验 metadata · 基本 ideName 不够 · 入批量会产生 400 噪声
const ENDPOINTS_CORE = [
  { key: "rules", method: "GetAllRules", timeout: 20000 },
  { key: "mcp", method: "GetMcpServerStates", timeout: 8000 },
  { key: "settings", method: "GetUserSettings", timeout: 8000 },
  { key: "workspaces", method: "GetWorkspaceInfos", timeout: 8000 },
  { key: "cascadeMemories", method: "GetCascadeMemories", timeout: 8000 },
  { key: "userMemories", method: "GetUserMemories", timeout: 8000 },
  { key: "skills", method: "GetAllSkills", timeout: 8000 },
  { key: "workflows", method: "GetAllWorkflows", timeout: 8000 },
  { key: "trajectories", method: "GetAllCascadeTrajectories", timeout: 8000 },
];

// v18.1 扩展端点 · 深层注入上下文
const ENDPOINTS_EXTENDED = [
  { key: "modelConfigs", method: "GetCascadeModelConfigs", timeout: 5000 },
  { key: "unleash", method: "GetUnleashData", timeout: 5000 },
  { key: "userStatus", method: "GetUserStatus", timeout: 5000 },
  { key: "currentUser", method: "GetCurrentUser", timeout: 5000 },
  { key: "editState", method: "GetWorkspaceEditState", timeout: 5000 },
  { key: "processes", method: "GetProcesses", timeout: 5000 },
  { key: "mcpRegistry", method: "GetMcpRegistryServers", timeout: 5000 },
  { key: "plugins", method: "GetAvailableCascadePlugins", timeout: 5000 },
  {
    key: "commandModelConfigs",
    method: "GetCommandModelConfigs",
    timeout: 5000,
  },
];

/**
 * Call all injection-relevant LS endpoints in parallel.
 * Returns structured object with all injection data.
 * v18.1: extended=true 时含扩展端点 (ModelConfigs, Unleash, User, EditState...)
 */
async function gatherAll(opts) {
  opts = opts || {};
  const ls = discoverLS();
  if (!ls || !ls.port) return { ls: null, error: "LS not found" };

  const valid = await _ensureHeartbeat(ls);
  if (!valid) return { ls, error: "LS heartbeat failed" };

  const endpoints =
    opts.extended !== false
      ? [...ENDPOINTS_CORE, ...ENDPOINTS_EXTENDED]
      : ENDPOINTS_CORE;

  const meta = { metadata: { ideName: "windsurf" } };
  const results = await Promise.all(
    endpoints.map((ep) => lsRpc(ls.port, ls.csrf, ep.method, meta, ep.timeout)),
  );

  const data = { ls, error: null, _ts: Date.now() };
  for (let i = 0; i < endpoints.length; i++) {
    data[endpoints[i].key] = results[i].ok ? results[i].data : null;
  }

  return data;
}

/**
 * Quick refresh — only call the most critical endpoints.
 * Faster than gatherAll for polling. 用于快轮询周期。
 */
async function gatherQuick() {
  const ls = discoverLS();
  if (!ls || !ls.port) return { ls: null, error: "LS not found" };

  const meta = { metadata: { ideName: "windsurf" } };
  const [rules, mcp, settings, memories] = await Promise.all([
    lsRpc(ls.port, ls.csrf, "GetAllRules", meta, 8000),
    lsRpc(ls.port, ls.csrf, "GetMcpServerStates", meta, 4000),
    lsRpc(ls.port, ls.csrf, "GetUserSettings", meta, 4000),
    lsRpc(ls.port, ls.csrf, "GetCascadeMemories", meta, 4000),
  ]);

  return {
    ls,
    error: !rules.ok && !mcp.ok && !settings.ok ? "All endpoints failed" : null,
    rules: rules.ok ? rules.data : null,
    mcp: mcp.ok ? mcp.data : null,
    settings: settings.ok ? settings.data : null,
    cascadeMemories: memories.ok ? memories.data : null,
    _ts: Date.now(),
  };
}

/**
 * v18.1 · 单端点刷新 · 精确按需 · 无为而无不为
 * 当 watcher 检测到特定变化时 · 仅刷对应端点
 */
async function gatherSection(sectionKey) {
  const ls = discoverLS();
  if (!ls || !ls.port) return null;

  const all = [...ENDPOINTS_CORE, ...ENDPOINTS_EXTENDED];
  const ep = all.find((e) => e.key === sectionKey);
  if (!ep) return null;

  const meta = { metadata: { ideName: "windsurf" } };
  const r = await lsRpc(ls.port, ls.csrf, ep.method, meta, ep.timeout);
  return r.ok ? r.data : null;
}

/**
 * v18.1 · 获取活动对话的步骤 · 观照当前注入的完整上下文
 */
async function getTrajectorySteps(trajectoryId) {
  const ls = discoverLS();
  if (!ls || !ls.port) return null;

  const r = await lsRpc(
    ls.port,
    ls.csrf,
    "GetCascadeTrajectorySteps",
    { metadata: { ideName: "windsurf" }, trajectoryId },
    10000,
  );
  return r.ok ? r.data : null;
}

// ═══════════════════════ 本源 SP 直取 · v18.3 ═══════════════════════
// 道可道,非常道。反者道之动 · 弱者道之用。
//
// 此组函数实现用户诉求 "从根本直接获取最底层注入于你widnsurf内的agent
// 所有实时初始全部一切提示词":
//
//   (1) getSystemPromptAndTools  → LS 内部 Cortex 组装的 SP + Tools 直返
//       请求无需经网络,不依代理,不依活官方 SP 截流
//       需活 Cascade 会话 (planner config 已初始化)
//
//   (2) getLatestTrajectorySP    → 兜底: 从最近 trajectory steps 反向提取
//       若当前无活跃会话但已有历史对话,仍能拿到上一次注入的完整 SP
//
//   (3) probeLatestSP            → 合流: 先 (1) 后 (2),一站式取本源
//
// 此 SP 即 L8 Cascade 真正看到的系统提示 · 本源即真实 · 展示即本源.

/**
 * v18.3 · GetSystemPromptAndTools · 直取本源
 * 返 { systemPrompt, tools, chars, source, error }
 */
async function getSystemPromptAndTools(opts) {
  opts = opts || {};
  const ls = discoverLS();
  if (!ls || !ls.port) {
    return {
      systemPrompt: null,
      tools: [],
      error: "LS not found",
      source: null,
    };
  }
  const valid = await _ensureHeartbeat(ls);
  if (!valid) {
    return {
      systemPrompt: null,
      tools: [],
      error: "LS heartbeat failed",
      source: null,
    };
  }
  const r = await lsRpc(
    ls.port,
    ls.csrf,
    "GetSystemPromptAndTools",
    { metadata: _buildFullMetadata(opts.metadata), ...(opts.request || {}) },
    opts.timeout || 10000,
  );
  if (!r.ok) {
    // 提炼 gRPC 错误 · "planner config not set" = 无活会话 · 非真异常
    let errMsg = `status=${r.status}`;
    if (r.data && typeof r.data === "object" && r.data.message) {
      errMsg = r.data.message;
    } else if (typeof r.data === "string") {
      errMsg = r.data.slice(0, 200);
    }
    const noSession = /planner config not set|no active/i.test(errMsg);
    return {
      systemPrompt: null,
      tools: [],
      error: noSession
        ? "等待活跃 Cascade 会话 · 请在 Cascade 面板发一条消息"
        : errMsg,
      noActiveSession: noSession,
      source: null,
      raw: r.data,
    };
  }
  // Connect-JSON 响应结构 (camelCase 还原自 proto):
  //   { systemPrompt: "...",     // field 1 · 完整 SP 文本
  //     tools: [ { name, description, ... } ],  // field 2 · 工具清单
  //     ...其他 metadata }
  const d = r.data || {};
  let sp =
    d.systemPrompt ||
    d.system_prompt ||
    d.prompt ||
    d.systemInstruction ||
    null;
  // 容错: 有些变种把 SP 放在嵌套 metadata 里
  if (!sp && d.metadata) {
    sp = d.metadata.systemPrompt || d.metadata.system_prompt || null;
  }
  // 若仍无 SP 但返回体非空,可能是 proto-encoded (二进制) 经 JSON 包装失败
  if (!sp && typeof d === "string" && d.length > 200) sp = d;

  const tools = Array.isArray(d.tools)
    ? d.tools
    : Array.isArray(d.toolList)
      ? d.toolList
      : [];
  return {
    systemPrompt: sp || null,
    tools,
    toolCount: tools.length,
    chars: sp ? sp.length : 0,
    source: sp ? "ls-direct" : null,
    ls: { port: ls.port, pid: ls.pid },
    error: sp ? null : "empty (no active Cascade session?)",
    _raw_keys: Object.keys(d),
  };
}

/**
 * v18.3 · 从 trajectory steps 递归提取 SP 字符串 · 观复知常
 */
function _extractSPFromStepsData(data) {
  if (!data || typeof data !== "object") return null;
  const candidates = [];
  const seen = new WeakSet();
  const SP_MARKER_RE =
    /You are Cascade|<user_rules>|<communication_style>|<tool_calling>|<making_code_changes>|<memory_system>|<MEMORY\[/;

  function walk(v, path, depth) {
    if (!v || depth > 12) return;
    if (typeof v === "string") {
      if (v.length >= 500 && SP_MARKER_RE.test(v)) {
        candidates.push({ path, chars: v.length, text: v });
      }
      return;
    }
    if (typeof v !== "object") return;
    if (seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length && i < 500; i++) {
        walk(v[i], path + "[" + i + "]", depth + 1);
      }
      return;
    }
    // 显式键优先
    const SP_KEYS = [
      "systemPrompt",
      "system_prompt",
      "systemInstruction",
      "system_instruction",
    ];
    for (const k of SP_KEYS) {
      if (typeof v[k] === "string" && v[k].length >= 200) {
        candidates.push({
          path: path + "." + k,
          chars: v[k].length,
          text: v[k],
        });
      }
    }
    // role=system/0 的兄弟 content/text
    const role = v.role;
    if (
      (role === 0 ||
        role === "0" ||
        role === "system" ||
        role === "SYSTEM" ||
        role === "ROLE_SYSTEM") &&
      typeof (v.content || v.text) === "string"
    ) {
      const c = v.content || v.text;
      if (c.length >= 200) {
        candidates.push({
          path: path + ".content[role=system]",
          chars: c.length,
          text: c,
        });
      }
    }
    // 继续下钻
    for (const k of Object.keys(v)) {
      walk(v[k], path + "." + k, depth + 1);
    }
  }
  walk(data, "$", 0);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.chars - a.chars);

  // v17.76.1 · 主Agent过滤 · 剔除 summary-agent 等辅助短SP · 优先主Cascade
  // 大直若屈 · 根因: 摘要Agent(479字)"You are an expert AI coding assistant"
  // 与主Cascade Agent(50k+字)"You are Cascade, a powerful agentic AI coding assistant"
  // 必须精确区分 · 不可混淆
  const MAIN_MARKERS = [
    "<user_rules>",
    "<MEMORY[",
    "<workspace_information>",
    "<memory_system>",
    "<user_information>",
    "<tool_calling>",
    "<making_code_changes>",
    "<communication_style>",
  ];
  // 摘要/辅助Agent的特征串 · 命中则非主SP
  const AUX_SIGNATURES = [
    "summaries of conversations",
    "summary of the conversation",
    "grounded in the conversation",
    "extreme attention to detail",
  ];
  function isMainSP(text) {
    if (!text) return false;
    // 显式排除已知辅助Agent
    for (const sig of AUX_SIGNATURES) {
      if (text.includes(sig) && text.length < 2000) return false;
    }
    if (text.length >= 5000 && text.includes("You are Cascade")) return true;
    let hits = 0;
    for (const m of MAIN_MARKERS) {
      if (text.includes(m)) hits++;
    }
    return text.length >= 2000 && hits >= 2;
  }
  const mainCandidates = candidates.filter((c) => isMainSP(c.text));
  if (mainCandidates.length > 0) return mainCandidates[0];
  // 无主Agent匹配 · 仍返回最长 (降级)
  return candidates[0]; // { path, chars, text }
}

/**
 * v17.78.0 · trajectory 结构归一 · 字典/数组皆容 · 反者道之动
 *
 * LS 2.0.67 实测返回 `{ trajectorySummaries: { [id]: summary, ... } }` 字典。
 * 历史及未来版本可能返回 `{ trajectories: [...] }` 数组或同等键位。
 * 此函数将任一形态归一为数组 · 无则返 null。
 *
 * @param {object} data — `GetAllCascadeTrajectories` 的 `.data`
 * @returns {Array<object>|null}
 */
function _normalizeTrajectoryList(data) {
  if (!data || typeof data !== "object") return null;
  const raw =
    data.trajectorySummaries ||
    data.trajectory_summaries ||
    data.trajectories ||
    data.cascadeTrajectories ||
    data.cascade_trajectories ||
    (Array.isArray(data) ? data : null);
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") return Object.values(raw);
  return null;
}

/**
 * v17.78.0 · trajectory 时间戳归一 · 散字段皆容 · 皆归 ms · 大直若屈
 *
 * 支持:
 *   - ISO 8601 字符串 (`lastModifiedTime` / `createdTime`) — LS 2.0.67 实际返回
 *   - number (ms since epoch) — 历史
 *   - `{seconds, nanos}` protobuf Timestamp — 备用
 *
 * @param {object} t — trajectory summary
 * @returns {number} — ms since epoch · 无则 0
 */
function _pickTrajTs(t) {
  if (!t || typeof t !== "object") return 0;
  const raw =
    t.lastModifiedTime ||
    t.last_modified_time ||
    t.lastUpdatedTime ||
    t.last_updated_time ||
    t.lastUpdatedTimestamp ||
    t.lastUpdated ||
    t.updatedAt ||
    t.createdTime ||
    t.created_time ||
    t.startTime ||
    t.start_time ||
    t.startTimestamp ||
    t.createdAt ||
    0;
  // ISO 8601 字符串 → ms
  if (typeof raw === "string" && raw.includes("T")) {
    const ms = new Date(raw).getTime();
    if (ms > 0) return ms;
  }
  // Timestamp 可能是 {seconds, nanos} 对象
  if (raw && typeof raw === "object" && raw.seconds != null) {
    return Number(raw.seconds) * 1000 + Math.floor((raw.nanos || 0) / 1e6);
  }
  return Number(raw) || 0;
}

/**
 * v17.78.0 · trajectory 标题归一 · summary > title > name > ""
 * LS 2.0.67 的标题字段实际是 `summary`。
 */
function _pickTrajTitle(t) {
  if (!t || typeof t !== "object") return "";
  return t.summary || t.title || t.name || "";
}

/**
 * v17.78.0 · trajectoryId 归一 · 支持多键位
 */
function _pickTrajId(t) {
  if (!t || typeof t !== "object") return "";
  return (
    t.trajectoryId || t.trajectory_id || t.id || t.cascadeId || t.cascade_id || ""
  );
}

/**
 * v18.3 · 取最近 trajectory 的 SP · 兜底 GetSystemPromptAndTools 失败
 * v18.3.1 (2026-04-24): 实测修正 · GetAllCascadeTrajectories 返
 *   { trajectorySummaries: [...] } · summary 结构含 trajectoryId + title + timestamps
 * v17.78.0 (2026-04-25): 抽出 `_normalizeTrajectoryList` / `_pickTrajTs` / `_pickTrajTitle`
 *   为纯函数 · 可单元测
 */
async function getLatestTrajectorySP() {
  const ls = discoverLS();
  if (!ls || !ls.port) return null;
  const valid = await _ensureHeartbeat(ls);
  if (!valid) return null;

  const fullMeta = { metadata: _buildFullMetadata() };
  const allT = await lsRpc(
    ls.port,
    ls.csrf,
    "GetAllCascadeTrajectories",
    fullMeta,
    8000,
  );
  if (!allT.ok || !allT.data) return null;

  // v17.77.0 · trajectorySummaries 是实测返回键名 · 优先识别
  // 实测: LS 2.0.67 返 { trajectorySummaries: { [id]: {...} } } 字典
  // 历史: 可能是 { trajectories: [...] } 数组
  // 兼容两种形态 · 字典→数组 · 大直若屈
  const tList = _normalizeTrajectoryList(allT.data);
  if (!tList || !tList.length) return null;

  // 按最近活跃倒序 · 时间戳散在多字段 · 皆容
  // v17.77.0 实测: LS 2.0.67 返 lastModifiedTime / createdTime (ISO 8601 字符串)
  const sorted = tList.slice().sort((a, b) => _pickTrajTs(b) - _pickTrajTs(a));

  // v17.76.1 · 扩大扫描范围 · 从 5 条扩至 10 条 · 确保找到主SP
  for (let i = 0; i < Math.min(sorted.length, 10); i++) {
    const t = sorted[i];
    const tid = _pickTrajId(t);
    if (!tid) continue;
    const steps = await lsRpc(
      ls.port,
      ls.csrf,
      "GetCascadeTrajectorySteps",
      { ...fullMeta, trajectoryId: tid, trajectory_id: tid },
      10000,
    );
    if (!steps.ok || !steps.data) continue;
    const best = _extractSPFromStepsData(steps.data);
    if (best && best.text && best.text.length >= 400) {
      return {
        systemPrompt: best.text,
        chars: best.chars,
        trajectoryId: tid,
        trajectoryTitle: _pickTrajTitle(t),
        trajectoryTs: _pickTrajTs(t),
        source: "ls-trajectory",
        path: best.path,
      };
    }
  }
  return null;
}

/**
 * v18.3.2 · 合流一站 · 先直取后兜底
 *   v17.76.1 · 大直若屈 · 根因修正:
 *     直取结果也须通过 isMainSP 过滤 · 摘要Agent(479字)不得占位
 *     分三挡: 主SP(≥2000字+标记) · 辅SP(≥500字) · 垃圾(<500字)
 *     主SP直返 · 辅SP暂存 · 继续尝试 trajectory 寻主SP · 终无主则返辅
 *   返 { systemPrompt, source, chars, tools?, error, diagnostics }
 */
async function probeLatestSP() {
  const diagnostics = { attempts: [] };
  let fallbackSP = null; // 辅助Agent SP 暂存 · 有主不用

  // 主Agent判定 (与 _extractSPFromStepsData 内 isMainSP 同源)
  const MAIN_MARKERS = [
    "<user_rules>",
    "<MEMORY[",
    "<workspace_information>",
    "<memory_system>",
    "<user_information>",
  ];
  function _isMainSP(text) {
    if (!text) return false;
    if (text.length >= 5000 && text.includes("You are Cascade")) return true;
    let hits = 0;
    for (const m of MAIN_MARKERS) {
      if (text.includes(m)) hits++;
    }
    return text.length >= 2000 && hits >= 2;
  }

  // 1. 首选: GetSystemPromptAndTools (活会话 + planner config 已初始化时命中)
  let direct = null;
  try {
    direct = await getSystemPromptAndTools({});
    const isMain = direct && direct.systemPrompt && _isMainSP(direct.systemPrompt);
    diagnostics.attempts.push({
      method: "GetSystemPromptAndTools",
      ok: !!(direct && direct.systemPrompt),
      isMain,
      chars: direct ? direct.chars : 0,
      error: direct ? direct.error : "exception",
    });
    if (isMain) {
      // 主Cascade SP · 直返 · 不犹豫
      return { ...direct, diagnostics };
    }
    // 非主SP但有内容 → 暂存为 fallback · 继续尝试 trajectory
    if (direct && direct.systemPrompt && direct.systemPrompt.length >= 200) {
      fallbackSP = { ...direct, _fallback: true };
    }
  } catch (e) {
    diagnostics.attempts.push({
      method: "GetSystemPromptAndTools",
      ok: false,
      error: (e && e.message) || "throw",
    });
  }
  // 2. 兜底: trajectory steps (寻主SP · isMainSP 过滤已在 _extractSPFromStepsData 内)
  try {
    const fromTraj = await getLatestTrajectorySP();
    diagnostics.attempts.push({
      method: "GetCascadeTrajectorySteps",
      ok: !!(fromTraj && fromTraj.systemPrompt),
      chars: fromTraj ? fromTraj.chars : 0,
    });
    if (fromTraj && fromTraj.systemPrompt) {
      return { ...fromTraj, diagnostics };
    }
  } catch (e) {
    diagnostics.attempts.push({
      method: "GetCascadeTrajectorySteps",
      ok: false,
      error: (e && e.message) || "throw",
    });
  }
  // 3. 终极降级: 返辅助Agent SP (总比空好)
  if (fallbackSP) {
    diagnostics.attempts.push({
      method: "fallback-aux-sp",
      ok: true,
      chars: fallbackSP.chars,
      note: "非主SP降级返回",
    });
    return { ...fallbackSP, source: "ls-direct-aux", diagnostics };
  }
  return {
    systemPrompt: null,
    source: null,
    chars: 0,
    error:
      "no active Cascade session + no trajectory SP available. 请在 Cascade 聊天面板发送一条消息后重试",
    diagnostics,
  };
}

module.exports = {
  discoverLS,
  lsRpc,
  gatherAll,
  gatherQuick,
  gatherSection,
  getTrajectorySteps,
  // v18.3 · 本源SP直取
  getSystemPromptAndTools,
  getLatestTrajectorySP,
  probeLatestSP,
  _extractSPFromStepsData,
  // v17.78.0 · trajectory 辅助纯函数 · 可单元测
  _normalizeTrajectoryList,
  _pickTrajTs,
  _pickTrajTitle,
  _pickTrajId,
  ENDPOINTS_CORE,
  ENDPOINTS_EXTENDED,
};
