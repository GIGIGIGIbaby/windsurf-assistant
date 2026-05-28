// bensource.js — 本源提取器 v1 · 独立隔离 · 热取实时底层 SP
//
// 致虚极, 守静笃. 万物并作, 吾以观复.
// 反者道之动 · 弱者道之用 · 道法自然.
//
// 此模块之职 (用户严令):
//   "并行修复解决提示词提取模块问题 · 从根本底层实现热提取当前实时底层初始
//    提示词 · 此模块之专注于本源 · 于其他模块相互隔离"
//
// 设计原则:
//   一、隔离: 不依赖 ls-client / essence / source.js / proxy 任何活态
//             以 require('./bensource') 单一引入即用 · 单元可独测
//   二、本源: 直读 LS 进程内存 (PEB + ReadProcessMemory 跨进程)
//             此为 L8 Cascade 真正看到的 SP 之最深源 · 不受 LS RPC 之障
//   三、并行: 三路同发 · race + cache · 任何一路出即返
//             (1) PEB 内存扫       (Win32 ReadProcessMemory · 真本源)
//             (2) LS RPC 直取      (GetSystemPromptAndTools · 备槽)
//             (3) 轨迹 RPC 兜底    (GetCascadeTrajectorySteps · 备备槽)
//   四、热: 无活会话亦能取 · LS 启过即载 SP 入内存 · 内存中即真
//   五、自愈: 任一路失不弃 · 缓存 30s · 失误指纹 · 不刷屏
//
// 唯一暴露接口:
//   const ben = require('./bensource');
//   const r = await ben.extract(opts);
//     opts.force?  跳缓存
//     opts.timeoutMs?  全旁 race timeout (默 8000)
//     opts.scanMaxRegions?  PEB 扫上限 (默 5000)
//     opts.preferPid?  指定 LS pid (默自检)
//   r = { systemPrompt, source, chars, ts, scanMs, lsPid, attempts[], error? }
//
// 不破现有任何路径. 与 ls-client.js / essence.js 互不耦合.
"use strict";

const { execSync, execFileSync, execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");

const IS_WIN = process.platform === "win32";

// ═══════════════════════ 缓存 · 致虚守静 ═══════════════════════
let _cache = null; // { ts, result }
const DEFAULT_TTL_MS = 30000; // 30s · 主SP 罕变, scan 6s · 不宜过频

// v18.2.2 · in-flight 去重 + LS 发现缓存 · 损 PowerShell 反复 fork (141 事故根治)
//   病: extract() 多 webview 并发调时, 各自 fork PS 三连 (pid+ports+csrf) ~14s 阻塞
//       _cache 只校已成结果, 进行中无去重 → 同一时刻 N 路并起 N 个 PS 子树
//   修: ① _inflight Promise 去重 (同步态多调即得同一 Promise)
//       ② _disco 缓存 LS pid+ports+csrf 2 分钟 (与 ls-client.js 同 TTL)
//          首调付一次 ~14s, 之后 2 分钟内同步直返
let _inflight = null; // 进行中的 extract() Promise · 多调归一
let _disco = null; // { ts, lsPid, ports, csrf } · 2 分钟 TTL
const DISCO_TTL_MS = 120000;

// ═══════════════════════ LS PID 自检 · 不依 ls-client ═══════════════════════
// v1.0 · 独立 discoverLS · 仅当前用户 · 不扫他户 (民至老死不相往来)
function _discoverLsPid() {
  if (!IS_WIN) return null;
  try {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-Process -Name 'language_server_windows_x64' -EA 0 | Where-Object { $_.SessionId -eq (Get-Process -Id $PID).SessionId } | Select-Object -First 1).Id",
      ],
      { encoding: "utf8", timeout: 5000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    const pid = parseInt(String(out).trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

// 取 LS gRPC port 与 CSRF (供 RPC 备槽)
// 仅复用 ls-client.js 的发现逻辑思路 · 但完全独立实现
const _LS_PORT_PROBE_PS1 = [
  "$p = Get-Process language_server_windows_x64 -EA SilentlyContinue | Select-Object -First 1",
  "if ($p) {",
  '  $ports = (Get-NetTCPConnection -OwningProcess $p.Id -State Listen -EA 0 | Where-Object { $_.LocalAddress -eq "127.0.0.1" } | Select-Object -ExpandProperty LocalPort | Sort-Object) -join ","',
  '  Write-Output ("PORTS=" + $ports)',
  "}",
].join("\n");

function _discoverLsPorts() {
  if (!IS_WIN) return [];
  try {
    const out = execFileSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", _LS_PORT_PROBE_PS1],
      { encoding: "utf8", timeout: 4000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    const m = String(out).match(/PORTS=([\d,]+)/);
    if (!m) return [];
    return m[1].split(",").map((s) => parseInt(s, 10)).filter((n) => n > 0);
  } catch {
    return [];
  }
}

// 取本户 cascade-auth.json 的 apiKey (供 RPC 备槽 · 真用户态)
function _readCascadeAuth() {
  try {
    const candidates = [
      path.join(os.homedir(), "AppData", "Roaming", "Windsurf", "User", "globalStorage", "cascade-auth.json"),
      path.join(process.env.APPDATA || "", "Windsurf", "User", "globalStorage", "cascade-auth.json"),
    ].filter(Boolean);
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        return {
          apiKey: j.api_key || j.apiKey || "",
          token: j.token || j.authToken || "",
          email: j.email || "",
        };
      }
    }
  } catch {}
  return { apiKey: "", token: "", email: "" };
}

// ═══════════════════════ 路一 · PEB 内存扫 (本源直取) ═══════════════════════
// 致虚极 守静笃 · 万物并作 吾以观复
//
// 进程内存中 LS 启动后即载 SP 文本入堆 · 跨进程 ReadProcessMemory 可观
// 此为最深源: 不依 RPC, 不依 proxy, 不依轨迹 · LS 进程在即真在
//
// 性能: 2GB 进程 ~6s · 故缓存 30s
// v1.3: 输出走 OutFile · 防真换行 (0x0A in SP body) 与行分序撞
//       C# 内 base64 编码每段 snippet · Node 端解码 · 二进字节安然
const _PEB_SCAN_PS1 = [
  "param([int]$LsPid, [string]$Marker, [int]$MaxRegions, [int]$MaxSnippet, [string]$OutFile)",
  "$ErrorActionPreference = 'SilentlyContinue'",
  "Add-Type -TypeDefinition @\"",
  "using System;",
  "using System.IO;",
  "using System.Runtime.InteropServices;",
  "using System.Text;",
  "public class BENSCAN {",
  '  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint a, bool b, int p);',
  '  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr h);',
  '  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, int sz, out int rd);',
  '  [DllImport("kernel32.dll")] public static extern int VirtualQueryEx(IntPtr h, IntPtr addr, ref MBI mbi, uint cb);',
  "  [StructLayout(LayoutKind.Sequential)] public struct MBI {",
  "    public IntPtr BaseAddress; public IntPtr AllocationBase; public uint AllocationProtect;",
  "    public IntPtr RegionSize; public uint State; public uint Protect; public uint Type;",
  "  }",
  "  public static int Scan(int pid, string marker, int maxRegions, int maxSnippet, string outFile) {",
  "    int hitCount = 0;",
  "    IntPtr h = OpenProcess(0x0410, false, pid);",
  "    if (h == IntPtr.Zero) return -1;",
  "    using (var fw = new StreamWriter(outFile, false, new UTF8Encoding(false))) {",
  "    try {",
  "      byte[] mb = Encoding.UTF8.GetBytes(marker);",
  "      IntPtr addr = IntPtr.Zero;",
  "      var mbi = new MBI();",
  "      int rs = 0; long total = 0;",
  "      while (rs < maxRegions) {",
  "        int qres = VirtualQueryEx(h, addr, ref mbi, (uint)Marshal.SizeOf(typeof(MBI)));",
  "        if (qres == 0) break;",
  "        long sz = mbi.RegionSize.ToInt64();",
  "        bool isCommit = (mbi.State & 0x1000) != 0;",
  "        bool isReadable = (mbi.Protect & 0xEE) != 0;",
  "        bool isGuard = (mbi.Protect & 0x100) != 0;",
  "        if (isCommit && isReadable && !isGuard && sz > 0) {",
  "          rs++;",
  "          int chunk = (int)Math.Min(sz, 16 * 1024 * 1024);",
  "          byte[] buf = new byte[chunk]; int rd;",
  "          if (ReadProcessMemory(h, mbi.BaseAddress, buf, chunk, out rd) && rd > 0) {",
  "            total += rd;",
  "            int idx = 0;",
  "            while (idx < rd - mb.Length) {",
  "              int i;",
  "              for (i = 0; i < mb.Length; i++) { if (buf[idx + i] != mb[i]) break; }",
  "              if (i == mb.Length) {",
  "                int snipEnd = Math.Min(rd, idx + maxSnippet);",
  "                int snipLen = snipEnd - idx;",
  // v1.4 C# 预过滤: 真 SP 头部即应为 \"...assistant.\\nThe USER\"
  //   (54+1+13 字 后即第二字句) · 字面 \\n 之坑 (源码引用) byte 56 为 0x5C (反斜) 不为 0x0A
  //   故 byte 56 须为 0x0A (real LF) 才 emit
  "                bool maybeReal = false;",
  "                if (snipLen > 100) {",
  "                  int afterPeriod = idx + 56;",
  "                  if (afterPeriod < rd && (buf[afterPeriod] == 0x0A || buf[afterPeriod-1] == 0x0A)) {",
  "                    maybeReal = true;",
  "                  } else if (afterPeriod < rd - 4 &&",
  "                             buf[afterPeriod] == (byte)'T' && buf[afterPeriod+1] == (byte)'h' && buf[afterPeriod+2] == (byte)'e') {",
  "                    maybeReal = true;",
  "                  }",
  "                }",
  "                if (maybeReal) {",
  "                  byte[] snipBytes = new byte[snipLen];",
  "                  Array.Copy(buf, idx, snipBytes, 0, snipLen);",
  "                  string b64 = Convert.ToBase64String(snipBytes);",
  "                  long abs = mbi.BaseAddress.ToInt64() + idx;",
  '                  fw.WriteLine(abs.ToString("X16") + "|" + snipLen + "|" + b64);',
  "                  hitCount++;",
  "                }",
  "                idx += mb.Length;",
  "              } else { idx++; }",
  "            }",
  "          }",
  "        }",
  "        long nb = mbi.BaseAddress.ToInt64() + sz;",
  "        if (nb <= addr.ToInt64()) break;",
  "        addr = (IntPtr)nb;",
  "      }",
  '      fw.WriteLine("STATS|" + rs + "|" + total);',
  "    } finally { CloseHandle(h); }",
  "    }",
  "    return hitCount;",
  "  }",
  "}",
  '"@',
  "$n = [BENSCAN]::Scan($LsPid, $Marker, $MaxRegions, $MaxSnippet, $OutFile)",
  'Write-Output ("HITS=" + $n)',
].join("\n");

// v1.5: scanProcessMemory 同步包 (兼容现测) · 内调 scanProcessMemoryAsync (主路)
function scanProcessMemory(opts) {
  opts = opts || {};
  const lsPid = opts.lsPid;
  const marker = opts.marker || "You are Cascade, a powerful agentic";
  const maxRegions = opts.maxRegions || 5000;
  const maxSnippet = opts.maxSnippet || 65536;
  if (!lsPid || !IS_WIN) return { hits: [], regions: 0, bytes: 0, error: "no-pid-or-non-win" };

  const stamp = `${process.pid}_${Date.now()}`;
  const tmpPs1 = path.join(os.tmpdir(), `_ben_scan_${stamp}.ps1`);
  const tmpOut = path.join(os.tmpdir(), `_ben_scan_${stamp}.out`);
  fs.writeFileSync(tmpPs1, _PEB_SCAN_PS1, "utf8");
  let stdout = "";
  try {
    stdout = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        tmpPs1,
        "-LsPid", String(lsPid),
        "-Marker", marker,
        "-MaxRegions", String(maxRegions),
        "-MaxSnippet", String(maxSnippet),
        "-OutFile", tmpOut,
      ],
      {
        encoding: "utf8",
        timeout: opts.timeoutMs || 60000,
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  } catch (e) {
    try { fs.unlinkSync(tmpPs1); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
    return { hits: [], regions: 0, bytes: 0, error: (e && e.message) || "exec-failed" };
  }

  return _readScanOut(tmpPs1, tmpOut, stdout);
}

// v1.5 · 异步 PEB 扫 · 不阻 Node main thread (供 essence.js 调用)
function scanProcessMemoryAsync(opts) {
  return new Promise((resolve) => {
    opts = opts || {};
    const lsPid = opts.lsPid;
    const marker = opts.marker || "You are Cascade, a powerful agentic";
    const maxRegions = opts.maxRegions || 5000;
    const maxSnippet = opts.maxSnippet || 65536;
    if (!lsPid || !IS_WIN) return resolve({ hits: [], regions: 0, bytes: 0, error: "no-pid-or-non-win" });

    const stamp = `${process.pid}_${Date.now()}`;
    const tmpPs1 = path.join(os.tmpdir(), `_ben_scan_${stamp}.ps1`);
    const tmpOut = path.join(os.tmpdir(), `_ben_scan_${stamp}.out`);
    try { fs.writeFileSync(tmpPs1, _PEB_SCAN_PS1, "utf8"); }
    catch (e) { return resolve({ hits: [], regions: 0, bytes: 0, error: "ps1-write-failed: " + e.message }); }

    const child = execFile(
      "powershell",
      [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
        "-File", tmpPs1,
        "-LsPid", String(lsPid),
        "-Marker", marker,
        "-MaxRegions", String(maxRegions),
        "-MaxSnippet", String(maxSnippet),
        "-OutFile", tmpOut,
      ],
      {
        encoding: "utf8",
        timeout: opts.timeoutMs || 60000,
        windowsHide: true,
      },
      (err, stdout) => {
        if (err) {
          try { fs.unlinkSync(tmpPs1); } catch {}
          try { fs.unlinkSync(tmpOut); } catch {}
          return resolve({ hits: [], regions: 0, bytes: 0, error: err.message || "exec-failed" });
        }
        resolve(_readScanOut(tmpPs1, tmpOut, stdout || ""));
      },
    );
    if (child && child.stdin) { try { child.stdin.end(); } catch {} }
  });
}

// 公用读结果 · 同步异步皆通
function _readScanOut(tmpPs1, tmpOut, stdout) {
  let regions = 0, bytes = 0;
  const hits = [];
  if (fs.existsSync(tmpOut)) {
    const raw = fs.readFileSync(tmpOut, "utf8");
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      if (!line) continue;
      const parts = line.split("|");
      if (parts.length < 3) continue;
      if (parts[0] === "STATS") {
        regions = parseInt(parts[1] || "0", 10);
        bytes = parseInt(parts[2] || "0", 10);
      } else {
        try {
          const snippet = Buffer.from(parts[2], "base64").toString("utf8");
          hits.push({
            addr: parts[0],
            len: parseInt(parts[1], 10) || 0,
            snippet,
          });
        } catch {}
      }
    }
  }
  try { fs.unlinkSync(tmpPs1); } catch {}
  try { fs.unlinkSync(tmpOut); } catch {}
  return { hits, regions, bytes, hitCountFromPs: parseInt((stdout.match(/HITS=(-?\d+)/) || [])[1] || "0", 10) };
}

// ═══════════════════════// 选最优 SP · 大直若屈 ═══════════════════════
// 命中数千皆为字串 · 多为源码引用. 须严格过滤:
//
// v1.2 实证修正 (2026-04-27): 真 SP 经 LS 渲染后 不含 XML 标签 (<user_rules>
//   <MEMORY[ 等皆为模板源标记 · LS 渲染时去标只留内容). 故须改判:
//   ① 长 ≥ 10KB (基本 Cascade SP 即 10-15KB · 加 user_rules 可 30-50KB)
//   ② 头含 "You are Cascade, a powerful agentic AI coding assistant." (真句点)
//   ③ 头含 "The USER is interacting with you" (真 SP 第二段)
//   ④ 真换行 0x0A · 不含字面 \\n (源码 JSON-encoded 之坑)
//   ⑤ 头 1000 内不见 "console.log(" "function (" 等代码模板
//   ⑥ 排序: 长度 desc (越长越含上下文 · 用户 rules / memories 都展)
const _CODE_NEEDLES_HEAD1000 = [
  '\\"', // 转义引号 · JSON-encoded 源标志
  "\\n//", // 反斜+n+注释符 · 源码注释标志
  "\\n   ", // 反斜+n+三空格 · line-number prefix
  "→\\n", // line-number markdown citation
  "console.log",
  "Write-Host",
  "function ", // 源代码声明
  "const _MAIN", // bensource.js 自身常量
  "Get-Process",
];
// 真 SP 必现之串 · 头 1000 字内须全见
const _SP_TRUE_HEAD_NEEDLES = [
  "You are Cascade, a powerful agentic AI coding assistant.",
  "The USER is interacting with you",
];

const _AUX_MARKERS = [
  // 摘要/辅Agent 之 SP 特征 (短 SP · 不应占主)
  "summaries of conversations",
  "summary of the conversation",
  "extreme attention to detail",
];

function _isMainSP(text) {
  if (!text || text.length < 10000) return false;
  // 必含真起句
  for (const m of _SP_TRUE_HEAD_NEEDLES) {
    if (!text.includes(m)) return false;
  }
  // v1.3 关键修: 真 SP 必有真换行 (0x0A) · JSON-encoded 源用字面 \\n
  //   头 2000 字内 真换行 ≥ 5 (基本介绍数行) 且 字面 \\n ≤ 真换行 (源码占多)
  const head2k = text.slice(0, 2000);
  let realLF = 0, literalBackN = 0;
  for (let i = 0; i < head2k.length; i++) {
    const c = head2k.charCodeAt(i);
    if (c === 0x0A) realLF++;
    else if (c === 0x5C && i + 1 < head2k.length && head2k.charCodeAt(i + 1) === 0x6E) literalBackN++;
  }
  if (realLF < 5) return false; // 真 SP 头 2KB 至少 5 行
  if (literalBackN > realLF) return false; // 字面 \n 多于真换行 → 源码引用
  // 头 1000 字内不得有源码标志
  const head1k = text.slice(0, 1000);
  for (const c of _CODE_NEEDLES_HEAD1000) {
    if (head1k.includes(c)) return false;
  }
  // 排除辅Agent
  for (const a of _AUX_MARKERS) {
    if (text.includes(a) && text.length < 15000) return false;
  }
  // 排除子Agent (senior pair programmer / codebase intelligence / etc)
  // 这些 SP 头都非标版 Cascade
  if (text.startsWith("You are Cascade, a powerful agentic AI coding assistant acting as")) return false;
  if (text.startsWith("You are Cascade, a powerful agentic AI coding assistant for codebase")) return false;
  if (text.startsWith("You are Cascade, a powerful agentic AI coding assistant designed by the Codeium")) return false;
  return true;
}

function _countMemories(text) {
  if (!text) return 0;
  let c = 0, i = 0;
  while ((i = text.indexOf("<MEMORY[", i)) !== -1) {
    c++;
    i += 8;
  }
  return c;
}

function pickBestSP(hits) {
  if (!hits || !hits.length) return null;
  const valid = hits.filter((h) => _isMainSP(h.snippet));
  if (!valid.length) return null;
  // v1.2 · 真 SP 渲染后无 <MEMORY[ 标. 排: 长度 desc 即可
  // (长度越长 → 含越多 user_rules / memories / tool_definitions 段)
  valid.sort((a, b) => b.snippet.length - a.snippet.length);
  return valid[0];
}

// 修边 · SP 实长通 30-80KB · 但 maxSnippet 截 64KB · 末尾常掺其他堆数据
// v1.2: 按字符性质找尾 (text→noise 过渡处)
function trimSP(rawSnippet) {
  if (!rawSnippet) return "";
  let text = rawSnippet;

  // 1. 头部归位: 跳前置 noise 直至 "You are Cascade"
  const startIdx = text.indexOf("You are Cascade");
  if (startIdx > 0 && startIdx < 200) text = text.slice(startIdx);

  // 2. 截首 \x00
  const nullIdx = text.indexOf("\x00");
  if (nullIdx > 5000) text = text.slice(0, nullIdx);

  // 3. 截到第二 "You are Cascade" (堆相邻有时双载)
  const secondCascade = text.indexOf("You are Cascade", 1000);
  if (secondCascade > 5000) text = text.slice(0, secondCascade);

  // 4. 末尾噪声去除 · 200 字滑窗按良率截
  // 真 SP 良率 ≥85% (printable ASCII + CJK + LF + Tab) · 二进/原始字节 ≤30%
  const minBoundary = 5000;
  if (text.length > minBoundary + 200) {
    const win = 200;
    const goodThreshold = 0.65; // 65% 以上为良 · 否则截
    let cutAt = -1;
    for (let i = minBoundary; i + win <= text.length; i += 100) {
      const seg = text.slice(i, i + win);
      let good = 0;
      for (let j = 0; j < seg.length; j++) {
        const cc = seg.charCodeAt(j);
        const isPrintAscii = (cc >= 0x20 && cc <= 0x7E);
        const isLfTab = (cc === 0x0A || cc === 0x0D || cc === 0x09);
        const isCjk = (cc >= 0x4E00 && cc <= 0x9FFF);
        const isFwPunct = (cc >= 0x3000 && cc <= 0x303F);
        const isLatinExt = (cc >= 0xA0 && cc <= 0x024F);
        if (isPrintAscii || isLfTab || isCjk || isFwPunct || isLatinExt) good++;
      }
      if (good / win < goodThreshold) {
        cutAt = i;
        break;
      }
    }
    if (cutAt > 0) {
      // 退至 cutAt 前最近换行 (尽可能保留完整段)
      const lastN = text.lastIndexOf("\n", cutAt);
      text = text.slice(0, lastN > minBoundary ? lastN + 1 : cutAt);
    }
  }

  return text;
}

// ═══════════════════════ 路二 · LS RPC 直取 (备槽) ═══════════════════════
function _lsRpc(port, csrf, method, body, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify(body || {});
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path: `/exa.language_server_pb.LanguageServerService/${method}`,
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
          res.on("data", (c) => { buf += c; });
          res.on("end", () => {
            let data = null;
            try { data = JSON.parse(buf); } catch { data = buf; }
            resolve({ ok: res.statusCode === 200, status: res.statusCode, data });
          });
        },
      );
      req.on("error", () => resolve({ ok: false, status: 0, data: null }));
      req.on("timeout", () => { try { req.destroy(); } catch {} resolve({ ok: false, status: 0, data: "timeout" }); });
      req.write(payload);
      req.end();
    } catch {
      resolve({ ok: false, status: 0, data: null });
    }
  });
}

// 取 LS CSRF · 内联 PEB read (与 ls-client 同源但独立 instance)
const _CSRF_PS1 = [
  "param([int]$LsPid)",
  "$ErrorActionPreference = 'SilentlyContinue'",
  "Add-Type -TypeDefinition @\"",
  "using System; using System.Runtime.InteropServices; using System.Text;",
  "public class BENPER {",
  '  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int c, ref PBI p, int l, ref int r);',
  '  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint a, bool b, int p);',
  '  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadProcessMemory(IntPtr h, IntPtr b, byte[] l, int s, out int r);',
  '  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);',
  "  [StructLayout(LayoutKind.Sequential)] public struct PBI{public IntPtr R1;public IntPtr Peb;public IntPtr R2a;public IntPtr R2b;public IntPtr Pid;public IntPtr R3;}",
  "  public static string Get(int pid, string vn) {",
  '    IntPtr h = OpenProcess(0x0410, false, pid); if (h == IntPtr.Zero) return "";',
  "    try {",
  "      var p = new PBI(); int r = 0;",
  '      if (NtQueryInformationProcess(h, 0, ref p, Marshal.SizeOf(p), ref r) != 0) return "";',
  '      byte[] pb = new byte[0x30]; int rd; if (!ReadProcessMemory(h, p.Peb, pb, pb.Length, out rd)) return "";',
  "      IntPtr pa = (IntPtr)BitConverter.ToInt64(pb, 0x20);",
  '      byte[] pp = new byte[0x400]; if (!ReadProcessMemory(h, pa, pp, pp.Length, out rd)) return "";',
  "      IntPtr ea = (IntPtr)BitConverter.ToInt64(pp, 0x80);",
  '      byte[] eb = new byte[65536]; if (!ReadProcessMemory(h, ea, eb, eb.Length, out rd)) return "";',
  "      string es = Encoding.Unicode.GetString(eb, 0, rd);",
  "      foreach (string v in es.Split(new char[]{'\\0'}, StringSplitOptions.RemoveEmptyEntries))",
  '        if (v.StartsWith(vn + "=", StringComparison.OrdinalIgnoreCase)) return v.Substring(vn.Length + 1);',
  '      return "";',
  "    } finally { CloseHandle(h); }",
  "  }",
  "}",
  '"@',
  '$t = [BENPER]::Get($LsPid, "WINDSURF_CSRF_TOKEN")',
  'if ($t) { Write-Output ("CSRF=" + $t) }',
].join("\n");

function _readLsCsrf(lsPid) {
  if (!IS_WIN || !lsPid) return "";
  try {
    const tmpPs1 = path.join(os.tmpdir(), `_ben_csrf_${process.pid}.ps1`);
    fs.writeFileSync(tmpPs1, _CSRF_PS1, "utf8");
    const out = execFileSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", tmpPs1, "-LsPid", String(lsPid)],
      { encoding: "utf8", timeout: 5000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    try { fs.unlinkSync(tmpPs1); } catch {}
    const m = String(out).match(/CSRF=([0-9a-f-]+)/i);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

async function _viaLsRpc(port, csrf, auth, timeoutMs) {
  const meta = {
    ideName: "windsurf",
    ideVersion: "2.0.44",
    extensionName: "windsurf",
    extensionVersion: "1.48.2",
    apiKey: auth.apiKey || "placeholder",
    locale: "en-us",
    sessionId: auth.token || "00000000-0000-0000-0000-000000000001",
    os: "windows",
  };
  const r = await _lsRpc(port, csrf, "GetSystemPromptAndTools", { metadata: meta }, timeoutMs || 6000);
  if (!r.ok || !r.data) return null;
  const sp = r.data.systemPrompt || r.data.system_prompt || r.data.prompt || null;
  if (!sp || sp.length < 1000) return null;
  return { systemPrompt: sp, source: "ls-rpc-direct", chars: sp.length };
}

// ═══════════════════════ 路三 · 轨迹 RPC 兜底 ═══════════════════════
async function _viaLsTrajectory(port, csrf, auth, timeoutMs) {
  const meta = {
    ideName: "windsurf",
    ideVersion: "2.0.44",
    extensionName: "windsurf",
    extensionVersion: "1.48.2",
    apiKey: auth.apiKey || "placeholder",
    locale: "en-us",
    sessionId: auth.token || "00000000-0000-0000-0000-000000000001",
    os: "windows",
  };
  const allT = await _lsRpc(port, csrf, "GetAllCascadeTrajectories", { metadata: meta }, timeoutMs || 5000);
  if (!allT.ok || !allT.data) return null;
  const summaries = allT.data.trajectorySummaries || allT.data.trajectory_summaries || allT.data.trajectories || null;
  if (!summaries) return null;
  let entries;
  if (Array.isArray(summaries)) entries = summaries.map((v, k) => ({ key: String(k), val: v }));
  else entries = Object.entries(summaries).map(([k, v]) => ({ key: k, val: v }));
  // 按 lastModifiedTime 倒序
  entries.sort((a, b) => {
    const ta = new Date(a.val.lastModifiedTime || a.val.createdTime || 0).getTime();
    const tb = new Date(b.val.lastModifiedTime || b.val.createdTime || 0).getTime();
    return tb - ta;
  });
  // 试取前 5 个 trajectory 的 steps
  for (const e of entries.slice(0, 5)) {
    const ids = [e.val.trajectoryId, e.key].filter(Boolean);
    for (const tid of ids) {
      const r = await _lsRpc(
        port, csrf, "GetCascadeTrajectorySteps",
        { metadata: meta, trajectoryId: tid, trajectory_id: tid },
        timeoutMs || 6000,
      );
      if (r.ok && r.data) {
        const sp = _walkForSP(r.data);
        if (sp && sp.length >= 5000) {
          return { systemPrompt: sp, source: "ls-rpc-trajectory", chars: sp.length, trajectoryId: tid };
        }
      }
    }
  }
  return null;
}

function _walkForSP(data) {
  if (!data || typeof data !== "object") return null;
  let best = null;
  const seen = new WeakSet();
  function walk(v, depth) {
    if (!v || depth > 12 || best) return;
    if (typeof v === "string") {
      if (v.length >= 2000 && v.includes("You are Cascade")) {
        if (!best || v.length > best.length) best = v;
      }
      return;
    }
    if (typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { for (let i = 0; i < v.length && i < 500; i++) walk(v[i], depth + 1); return; }
    for (const k of Object.keys(v)) walk(v[k], depth + 1);
  }
  walk(data, 0);
  return best;
}

// ═══════════════════════ 主入口 · 二路并发 race ═══════════════════════
//
// v18.2.2 修订 (141 性能事故根治 · 2026-04-27):
//   ① in-flight 去重 (_inflight Promise) · 多 webview 并发调归一
//   ② _disco 缓存 (lsPid + ports + csrf · 2min TTL) · 不再每调 fork 三 PS
//   ③ 路三 _viaLsTrajectory (洪水路) 默关 · 仅 opts.includeTrajectory=true 启
//      旧实测: 每调 ~10 RPC 至 LS · 失败时 LS 报 "trajectory not found" 刷屏
//      新: 默仅路一 PEB scan (真本源) + 路二 RPC 直取 (轻一调)
//
// "为者败之, 执者失之. 圣人无为故无败, 无执故无失." (第六十四章)
function extract(opts) {
  opts = opts || {};
  // 进行中即归一 · 不再 fork 二副 PS (致同时调归一)
  if (_inflight && !opts.force) return _inflight;
  const p = _doExtract(opts).finally(() => {
    if (_inflight === p) _inflight = null;
  });
  if (!opts.force) _inflight = p;
  return p;
}

async function _doExtract(opts) {
  opts = opts || {};
  const ttlMs = opts.ttlMs != null ? opts.ttlMs : DEFAULT_TTL_MS;
  // 缓存 (force 跳过)
  if (!opts.force && _cache && Date.now() - _cache.ts < ttlMs) {
    return { ..._cache.result, fromCache: true };
  }
  const t0 = Date.now();
  const attempts = [];

  // v18.2.2 · 用 _disco 缓存 · 2min TTL · 损 fork PowerShell 三连 (~14s) 之根
  let lsPid, ports, csrf;
  if (!opts.force && _disco && Date.now() - _disco.ts < DISCO_TTL_MS) {
    ({ lsPid, ports, csrf } = _disco);
    attempts.push({ step: "disco-cache", lsPid, hit: true });
  } else {
    lsPid = opts.preferPid || _discoverLsPid();
    if (!lsPid) {
      const r = { systemPrompt: null, source: null, chars: 0, error: "LS process not found", ts: new Date().toISOString(), attempts };
      _cache = { ts: Date.now(), result: r };
      return r;
    }
    ports = _discoverLsPorts();
    csrf = _readLsCsrf(lsPid);
    _disco = { ts: Date.now(), lsPid, ports, csrf };
    attempts.push({ step: "disco-fresh", lsPid, ports: ports.length, hasCsrf: !!csrf });
  }
  const auth = _readCascadeAuth();

  // 1. 路一: PEB scan (本源 · 不需 RPC) · 大~6-20s · v1.5 异步 execFile · 不阻主线程
  const pebP = (async () => {
    const t1 = Date.now();
    const scan = await scanProcessMemoryAsync({
      lsPid,
      maxRegions: opts.scanMaxRegions || 8000,
      maxSnippet: opts.maxSnippet || 65536,
      timeoutMs: opts.scanTimeoutMs || 60000,
    });
    const scanMs = Date.now() - t1;
    if (scan.error) return { error: scan.error, scanMs, regions: scan.regions, bytes: scan.bytes };
    const best = pickBestSP(scan.hits);
    if (!best) return { error: "no-main-sp-in-mem", scanMs, regions: scan.regions, hits: scan.hits.length };
    const sp = trimSP(best.snippet);
    return {
      systemPrompt: sp,
      source: "peb-memory-scan",
      chars: sp.length,
      scanMs,
      regions: scan.regions,
      hits: scan.hits.length,
      addr: best.addr,
    };
  })();

  // 2. 路二: RPC 直取 · 默 only (路三 trajectory 默关 · 防洪水)
  const rpcP = (async () => {
    if (!ports.length || !csrf) return { error: "no-port-or-csrf", ports: ports.length, hasCsrf: !!csrf };
    for (const p of ports) {
      const hb = await _lsRpc(p, csrf, "Heartbeat", { metadata: { ideName: "windsurf" } }, 2000);
      if (!hb.ok) continue;
      const r2 = await _viaLsRpc(p, csrf, auth, 6000);
      if (r2 && r2.systemPrompt) return { ...r2, port: p };
      // v18.2.2 · 路三 trajectory 仅 opts.includeTrajectory=true 时启
      //   旧默路: 每调 ~10 GetCascadeTrajectorySteps 至 LS, 失败时刷屏 "trajectory not found"
      //   修: 默关 · 由用户/上层显式启 (运维/调试场景)
      if (opts.includeTrajectory) {
        const r3 = await _viaLsTrajectory(p, csrf, auth, 8000);
        if (r3 && r3.systemPrompt) return { ...r3, port: p };
      }
    }
    return { error: "rpc-no-sp" };
  })();

  // race · 任一路成出 · 都不出取最长
  const [pebRes, rpcRes] = await Promise.all([pebP, rpcP]);
  attempts.push({ step: "peb-scan", ok: !!pebRes.systemPrompt, scanMs: pebRes.scanMs, regions: pebRes.regions, hits: pebRes.hits, error: pebRes.error });
  attempts.push({ step: "ls-rpc",  ok: !!rpcRes.systemPrompt, source: rpcRes.source, chars: rpcRes.chars, error: rpcRes.error });

  // 优先级: PEB > RPC (PEB 真本源, RPC 受会话限)
  let chosen = pebRes.systemPrompt ? pebRes : (rpcRes.systemPrompt ? rpcRes : null);
  if (!chosen) {
    const r = {
      systemPrompt: null,
      source: null,
      chars: 0,
      lsPid,
      error: "no-sp-via-any-path",
      ts: new Date().toISOString(),
      totalMs: Date.now() - t0,
      attempts,
    };
    _cache = { ts: Date.now(), result: r };
    return r;
  }
  const result = {
    systemPrompt: chosen.systemPrompt,
    source: chosen.source,
    chars: chosen.chars,
    lsPid,
    ts: new Date().toISOString(),
    totalMs: Date.now() - t0,
    scanMs: chosen.scanMs,
    regions: chosen.regions,
    addr: chosen.addr,
    port: chosen.port,
    attempts,
  };
  _cache = { ts: Date.now(), result };
  return result;
}

function clearCache() {
  _cache = null;
  _disco = null;
  _inflight = null;
}

module.exports = {
  extract,
  clearCache,
  // 暴露子函数 · 单元测可独验
  _discoverLsPid,
  _discoverLsPorts,
  _readCascadeAuth,
  _readLsCsrf,
  scanProcessMemory,
  scanProcessMemoryAsync, // v1.5 · 异步版 · 不阻主线
  pickBestSP,
  trimSP,
  _isMainSP,
  _countMemories,
  _walkForSP,
};
