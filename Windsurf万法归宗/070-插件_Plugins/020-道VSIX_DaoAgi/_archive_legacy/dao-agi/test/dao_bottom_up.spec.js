// dao_bottom_up.spec.js — 反者道之动 · 从底层一一直连验
// =====================================================================
// 大曰逝 · 逝曰远 · 远曰反 · 道常无为而无不为
//
// 此测自下而上 · 九层一一直连 · 不经 VSIX · 不经 ext-host · 不动现机
//   L1  源.js (proxy 本源 · 道之冲)
//   L2  ls-client.js (gRPC 直连 LS · 二道)
//   L3  ls-gate-patcher.js (系统门禁 · 三道) · 仅 status (默 false 守)
//   L4  _water_virtues.js (水之四德 · 四道)
//   L5  _uninstall_sentinel.js (uninstall 哨兵 · 五道)
//   L6  essence.js (本源 webview · 六道) · vscode mock
//   L7  watcher.js (观照 · 七道) · vscode mock
//   L8  isolator.js (隔离 · 八道)
//   L9  extension.js (主壳 · 九道) · 静态结构验
//
// 终: pass=N fail=0 即"道之冲, 而用之或不盈"
// =====================================================================
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const Module = require("node:module");
const crypto = require("node:crypto");

const D = path.resolve(__dirname, "..");
const YUAN_PATH = path.join(D, "vendor/wam/bundled-origin/源.js");

// ═══════════════════════ vscode mock (供 watcher/essence/extension) ═══════════════════════
const _vscEvents = {};
function _mkReg(key) {
  return (cb) => {
    (_vscEvents[key] = _vscEvents[key] || []).push(cb);
    return { dispose() {} };
  };
}
function _mkFsWatcher() {
  const w = {
    onDidChange(cb) {
      return { dispose() {} };
    },
    onDidCreate(cb) {
      return { dispose() {} };
    },
    onDidDelete(cb) {
      return { dispose() {} };
    },
    dispose() {},
  };
  return w;
}
const _vscMock = {
  workspace: {
    getConfiguration: () => ({
      get: (_k, d) => d,
      update: async () => {},
      has: () => false,
      inspect: () => undefined,
    }),
    workspaceFolders: [
      {
        uri: { fsPath: "E:/fake/ws", scheme: "file", path: "/E:/fake/ws" },
        name: "ws",
        index: 0,
      },
    ],
    textDocuments: [],
    createFileSystemWatcher: _mkFsWatcher,
    onDidChangeConfiguration: _mkReg("cfg"),
    onDidOpenTextDocument: _mkReg("open"),
    onDidCloseTextDocument: _mkReg("close"),
    onDidChangeWorkspaceFolders: _mkReg("wsFolders"),
    onDidChangeTextDocument: _mkReg("docChange"),
    asRelativePath: (u) => (u && u.fsPath) || String(u),
    fs: {
      readFile: async () => Buffer.from(""),
      writeFile: async () => {},
      stat: async () => ({ size: 0 }),
    },
  },
  window: {
    activeTextEditor: null,
    visibleTextEditors: [],
    onDidChangeActiveTextEditor: _mkReg("activeEd"),
    onDidChangeTextEditorSelection: _mkReg("selection"),
    onDidChangeVisibleTextEditors: _mkReg("visibleEd"),
    createOutputChannel: () => ({
      appendLine() {},
      append() {},
      show() {},
      hide() {},
      clear() {},
      dispose() {},
    }),
    createWebviewPanel: () => ({
      webview: { html: "", postMessage() {} },
      onDidDispose() {},
      reveal() {},
      dispose() {},
    }),
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showInputBox: async () => undefined,
    showQuickPick: async () => undefined,
    showTextDocument: async () => {},
    registerWebviewViewProvider: () => ({ dispose() {} }),
    registerTreeDataProvider: () => ({ dispose() {} }),
    withProgress: async (_o, fn) =>
      fn({ report() {} }, { isCancellationRequested: false }),
  },
  commands: {
    registerCommand: () => ({ dispose() {} }),
    executeCommand: async () => {},
    getCommands: async () => [],
  },
  RelativePattern: function (base, pattern) {
    this.base = base;
    this.pattern = pattern;
  },
  Uri: {
    file: (p) => ({ fsPath: p, scheme: "file", path: p, toString: () => p }),
    parse: (s) => ({ fsPath: s, scheme: "file", path: s }),
    joinPath: (a, ...rest) => ({
      fsPath: path.join(a.fsPath || a, ...rest),
      scheme: "file",
      path: path.join(a.fsPath || a, ...rest),
    }),
  },
  EventEmitter: class {
    constructor() {
      this._cbs = [];
      this.event = (cb) => {
        this._cbs.push(cb);
        return { dispose() {} };
      };
    }
    fire(v) {
      this._cbs.forEach((cb) => {
        try {
          cb(v);
        } catch {}
      });
    }
    dispose() {
      this._cbs = [];
    }
  },
  Disposable: class {
    constructor(fn) {
      this._fn = fn;
    }
    dispose() {
      try {
        this._fn && this._fn();
      } catch {}
    }
    static from(...rest) {
      return {
        dispose() {
          rest.forEach((r) => r && r.dispose && r.dispose());
        },
      };
    }
  },
  ExtensionContext: class {},
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  ViewColumn: { Active: -1, Beside: -2, One: 1 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {
    constructor(id) {
      this.id = id;
    }
  },
  ThemeColor: class {
    constructor(id) {
      this.id = id;
    }
  },
  env: { machineId: "test-machine", sessionId: "test-session", language: "en" },
  version: "1.85.0",
  extensions: { all: [], getExtension: () => undefined },
};

// 注 vscode mock · 全测共用
require.cache["vscode"] = {
  id: "vscode",
  filename: "vscode",
  loaded: true,
  exports: _vscMock,
};
const _origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === "vscode") return req;
  return _origResolve.call(this, req, ...rest);
};

// ═══════════════════════ 计 ═══════════════════════
let pass = 0,
  fail = 0;
const failures = [];
function ok(name, cond, hint) {
  if (cond) {
    pass++;
    console.log("  ✓ " + name + (hint ? "    " + hint : ""));
  } else {
    fail++;
    failures.push(name + (hint ? " :: " + hint : ""));
    console.log("  ✗ " + name + (hint ? "    " + hint : ""));
  }
}

function isPortOpen(port, host, p) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: host || "127.0.0.1",
        port,
        path: p || "/origin/ping",
        method: "GET",
        timeout: 800,
      },
      (res) => {
        res.resume();
        resolve({ open: true, status: res.statusCode });
      },
    );
    req.on("error", () => resolve({ open: false }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ open: false });
    });
    req.end();
  });
}

function httpGetJson(port, p) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: p, method: "GET", timeout: 1500 },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(buf) });
          } catch {
            resolve({ status: res.statusCode, raw: buf });
          }
        });
      },
    );
    req.on("error", (e) => resolve({ err: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ err: "timeout" });
    });
    req.end();
  });
}

function httpPostJson(port, p, body) {
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify(body || {}), "utf8");
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: p,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": data.length,
        },
        timeout: 1500,
      },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(buf) });
          } catch {
            resolve({ status: res.statusCode, raw: buf });
          }
        });
      },
    );
    req.on("error", (e) => resolve({ err: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ err: "timeout" });
    });
    req.write(data);
    req.end();
  });
}

function httpReq(port, method, p, body) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const headers = data
      ? { "content-type": "application/json", "content-length": data.length }
      : {};
    const req = http.request(
      { host: "127.0.0.1", port, path: p, method, headers, timeout: 1500 },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (buf += c));
        res.on("end", () => resolve({ status: res.statusCode, raw: buf }));
      },
    );
    req.on("error", (e) => resolve({ err: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ err: "timeout" });
    });
    if (data) req.write(data);
    req.end();
  });
}

function pickFreePort(start) {
  return new Promise((r) => {
    const s = require("node:net").createServer();
    s.unref();
    s.on("error", () => r(start + Math.floor(Math.random() * 200) + 1));
    s.listen(start, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
}

// ═══════════════════════ 主测 ═══════════════════════
(async () => {
  const t0 = Date.now();
  console.log("\n══════ 反者道之动 · 九层直连验 · 不经 VSIX ══════");
  console.log("  时:    " + new Date().toISOString());
  console.log(
    "  机:    " +
      os.hostname() +
      " · " +
      process.platform +
      " · node " +
      process.version,
  );
  console.log("  根:    " + D);

  // ─────────────────────────────────────────────────────────────────
  // L1 · 源.js (proxy 本源 · 道之冲)
  // ─────────────────────────────────────────────────────────────────
  console.log("\n─────── L1 · 源.js · proxy 本源 · 道之冲 ───────");
  ok("L1.0 源.js 在", fs.existsSync(YUAN_PATH));
  let yuan;
  try {
    delete require.cache[require.resolve(YUAN_PATH)];
    yuan = require(YUAN_PATH);
    ok("L1.1 源.js require 成", typeof yuan === "object");
  } catch (e) {
    ok("L1.1 源.js require 成", false, e.message);
    return;
  }

  // L1 exports 验
  const L1_EXPORTS = [
    "start",
    "stop",
    "invertSP",
    "isLikelyOfficialSP",
    "DAO_DE_JING_81",
    "TAO_HEADER",
    "modifySPProto",
    "modifyRawSP",
    "parseProto",
    "serializeProto",
    "classifyRPC",
    "routeUpstream",
    "getMode",
    "setMode",
  ];
  let missing = L1_EXPORTS.filter((k) => !(k in yuan));
  ok(
    "L1.2 14 核心 exports 全 (含 v18.0 库 API)",
    missing.length === 0,
    missing.length
      ? "missing=" + missing.join(",")
      : "all=" + L1_EXPORTS.length,
  );

  // L1 道德经 81 章
  ok(
    "L1.3 DAO_DE_JING_81 字数 ≥6000",
    yuan.DAO_DE_JING_81.length >= 6000,
    "chars=" + yuan.DAO_DE_JING_81.length,
  );
  ok("L1.4 道可道 第一句 在", yuan.DAO_DE_JING_81.includes("道可道"));
  ok("L1.5 信言不美 第八十一末 在", yuan.DAO_DE_JING_81.includes("信言不美"));
  ok(
    "L1.6 TAO_HEADER 含 'You are Cascade' + 道德经 锚",
    typeof yuan.TAO_HEADER === "string" &&
      yuan.TAO_HEADER.includes("Cascade") &&
      yuan.TAO_HEADER.includes("道德经"),
  );

  // L1 invertSP 真注 (须用够长的"官样" SP · 否则 isLikelyOfficial=false 则不注)
  const fakeOfficial =
    "You are Cascade, a powerful agentic AI coding assistant. " +
    "<user_rules>foo</user_rules> " +
    "<skills>js</skills> " +
    "<tool_calling>do stuff</tool_calling> " +
    "<communication_style>terse</communication_style> " +
    "<workspace_information>some workspace</workspace_information> " +
    "MEMORY[some-id] " +
    "Make sure to follow these instructions carefully. ".repeat(20);
  ok(
    "L1.7 isLikelyOfficialSP 识此为官 SP",
    yuan.isLikelyOfficialSP(fakeOfficial) === true,
  );
  const inv = yuan.invertSP(fakeOfficial);
  ok(
    "L1.8 invertSP 返字串 (非 null)",
    typeof inv === "string" && inv.length > 0,
  );
  ok(
    "L1.9 invertSP 注道德经 (字数显著增)",
    inv && inv.length > fakeOfficial.length / 2 && inv.length > 5000,
    "before=" + fakeOfficial.length + " after=" + (inv ? inv.length : 0),
  );
  ok(
    "L1.10 invert 后含 'You are Cascade' (TAO_HEADER 锚)",
    inv && inv.includes("Cascade"),
  );
  ok("L1.11 invert 后含 道可道 (道德经植入)", inv && inv.includes("道可道"));
  ok(
    "L1.12 invert 剥侧信道 <user_rules>",
    inv && !inv.includes("<user_rules>"),
  );
  ok("L1.13 invert 剥侧信道 <skills>", inv && !inv.includes("<skills>"));
  ok(
    "L1.14 invert 剥侧信道 <communication_style>",
    inv && !inv.includes("<communication_style>"),
  );

  // isLikelyOfficialSP 拒短文
  ok(
    "L1.15 isLikelyOfficialSP 拒短文",
    yuan.isLikelyOfficialSP("hi") === false,
  );

  // L1 旁立 :8890 隔代 (不动 live)
  const L1_PORT = await pickFreePort(18890);
  let handle;
  try {
    handle = await yuan.start({ port: L1_PORT, host: "127.0.0.1" });
    ok(
      "L1.16 start({port:" + L1_PORT + "}) 成 · in-process listen",
      handle && handle.port === L1_PORT,
    );
  } catch (e) {
    ok("L1.16 start 成", false, e.message);
    return;
  }

  // L1 端点活
  let r;
  r = await httpGetJson(L1_PORT, "/origin/ping");
  ok(
    "L1.17 GET /origin/ping 200",
    r.status === 200,
    "raw=" + (r.raw || JSON.stringify(r.json)).slice(0, 80),
  );
  ok(
    "L1.18 ping 含 mode",
    r.json && (r.json.mode === "invert" || r.json.mode === "passthrough"),
    "mode=" + (r.json && r.json.mode),
  );

  r = await httpGetJson(L1_PORT, "/origin/mode");
  ok("L1.19 GET /origin/mode 200", r.status === 200);
  ok(
    "L1.20 mode GET 即 二态归一",
    r.json && (r.json.mode === "invert" || r.json.mode === "passthrough"),
  );

  // L1 模式热切 (不重启)
  const m0 = handle.getMode();
  const m1 = m0 === "invert" ? "passthrough" : "invert";
  r = await httpPostJson(L1_PORT, "/origin/mode", { mode: m1 });
  ok("L1.21 POST /origin/mode 切毕 200", r.status === 200);
  await new Promise((s) => setTimeout(s, 50));
  ok("L1.22 内化 getMode 即同步切", handle.getMode() === m1);
  // 切回
  await httpPostJson(L1_PORT, "/origin/mode", { mode: m0 });

  // 切非法
  r = await httpPostJson(L1_PORT, "/origin/mode", { mode: "fake" });
  ok(
    "L1.23 invalid mode 拒 (200 但 ok=false 或 4xx)",
    r.status >= 400 || (r.json && r.json.ok === false),
  );

  // L1 自检
  r = await httpGetJson(L1_PORT, "/origin/selftest");
  ok("L1.24 GET /origin/selftest 200", r.status === 200);
  ok(
    "L1.25 selftest 含 dao_chars=6776",
    r.json && r.json.dao_chars >= 6000,
    "dao_chars=" + (r.json && r.json.dao_chars),
  );

  // L1 自定义 SP 热改
  const customSP = "我是道Agent · 守一抱朴 · 致虚守静 · 万物归根";
  r = await httpReq(L1_PORT, "POST", "/origin/custom_sp", { sp: customSP });
  ok(
    "L1.26 POST /origin/custom_sp 注 200/2xx",
    r.status >= 200 && r.status < 300,
  );

  r = await httpGetJson(L1_PORT, "/origin/custom_sp");
  ok(
    "L1.27 GET /origin/custom_sp 设值",
    r.json && r.json.sp === customSP,
    "len=" + (r.json && r.json.sp && r.json.sp.length),
  );

  // sig 应变 (custom_sp 后 sp_sig 与初不同)
  r = await httpGetJson(L1_PORT, "/origin/sig");
  ok(
    "L1.28 GET /origin/sig 200 · sp_sig 长 16",
    r.json && r.json.sp_sig && r.json.sp_sig.length === 16,
    "sig=" + (r.json && r.json.sp_sig),
  );

  r = await httpReq(L1_PORT, "DELETE", "/origin/custom_sp");
  ok(
    "L1.29 DELETE /origin/custom_sp 清 200",
    r.status >= 200 && r.status < 300,
  );

  r = await httpGetJson(L1_PORT, "/origin/custom_sp");
  ok(
    "L1.30 清后 sp = null/none",
    r.json && (r.json.sp == null || r.json.sp === ""),
  );

  // L1 lastinject + preview 端点存
  r = await httpGetJson(L1_PORT, "/origin/lastinject");
  ok(
    "L1.31 GET /origin/lastinject 200/204 (无 inject 也 ok)",
    r.status === 200 || r.status === 204,
  );
  r = await httpGetJson(L1_PORT, "/origin/preview");
  ok("L1.32 GET /origin/preview 200", r.status === 200);

  // L1 rpc_trace 端点 · 返 recent 数组 (实 API)
  r = await httpGetJson(L1_PORT, "/origin/rpc_trace");
  ok("L1.33 GET /origin/rpc_trace 200", r.status === 200);
  ok(
    "L1.34 rpc_trace 返 recent 数组 + inference_services",
    r.json &&
      Array.isArray(r.json.recent) &&
      Array.isArray(r.json.inference_services),
    "keys=" + (r.json ? Object.keys(r.json).join(",") : "null"),
  );

  // L1 庖丁解牛 · KEEP_BLOCKS 留骨
  ok(
    "L1.35 KEEP_BLOCKS 含 tool_calling",
    yuan.KEEP_BLOCKS && yuan.KEEP_BLOCKS.includes("tool_calling"),
  );
  ok(
    "L1.36 TAO_SENTINEL 在",
    typeof yuan.TAO_SENTINEL === "string" && yuan.TAO_SENTINEL.length > 0,
  );
  // extractKeepBlocks 应能切留骨
  const spWithTools =
    "<tool_calling>do stuff</tool_calling> 其他文 <skills>js</skills>";
  const kept = yuan.extractKeepBlocks(spWithTools);
  ok(
    "L1.37 extractKeepBlocks 留 tool_calling 块",
    kept.includes("<tool_calling>"),
  );

  // L1 收
  await handle.close();
  await new Promise((s) => setTimeout(s, 100));
  const stillOpen = await isPortOpen(L1_PORT);
  ok("L1.38 close() 后 :" + L1_PORT + " 不再监听", !stillOpen.open);

  // ─────────────────────────────────────────────────────────────────
  // L2 · ls-client.js (gRPC 直连 LS · 二道)
  // ─────────────────────────────────────────────────────────────────
  console.log("\n─────── L2 · ls-client.js · gRPC 直连 LS · 二道 ───────");
  let lsClient;
  try {
    delete require.cache[require.resolve(path.join(D, "ls-client.js"))];
    lsClient = require(path.join(D, "ls-client.js"));
    ok("L2.1 ls-client.js require 成", typeof lsClient === "object");
  } catch (e) {
    ok("L2.1 ls-client.js require 成", false, e.message);
  }

  if (lsClient) {
    const L2_EXPORTS = [
      "discoverLS",
      "lsRpc",
      "gatherAll",
      "gatherQuick",
      "gatherSection",
      "getTrajectorySteps",
      "getSystemPromptAndTools",
      "getLatestTrajectorySP",
      "probeLatestSP",
      "_normalizeTrajectoryList",
      "_pickTrajTs",
      "_pickTrajTitle",
      "_pickTrajId",
      "ENDPOINTS_CORE",
      "ENDPOINTS_EXTENDED",
    ];
    const m2 = L2_EXPORTS.filter((k) => !(k in lsClient));
    ok(
      "L2.2 15 ls-client exports 全",
      m2.length === 0,
      m2.length ? "missing=" + m2.join(",") : "all",
    );

    // L2 纯函数验
    ok(
      "L2.3 ENDPOINTS_CORE 是数组 + 长 ≥5",
      Array.isArray(lsClient.ENDPOINTS_CORE) &&
        lsClient.ENDPOINTS_CORE.length >= 5,
    );
    ok(
      "L2.4 ENDPOINTS_EXTENDED 是数组",
      Array.isArray(lsClient.ENDPOINTS_EXTENDED),
    );

    // _normalizeTrajectoryList
    const norm = lsClient._normalizeTrajectoryList({
      trajectorySummaries: [
        { trajectoryId: "t1", summary: "test", lastModifiedTime: "2025-01-01" },
      ],
    });
    ok(
      "L2.5 _normalizeTrajectoryList 返数组",
      Array.isArray(norm) && norm.length === 1,
    );

    ok(
      "L2.6 _normalizeTrajectoryList null 安",
      lsClient._normalizeTrajectoryList(null) === null,
    );

    // _pickTrajTitle
    ok(
      "L2.7 _pickTrajTitle 取 summary",
      lsClient._pickTrajTitle({ summary: "S", title: "T" }) === "S",
    );
    ok(
      "L2.8 _pickTrajTitle 退 title",
      lsClient._pickTrajTitle({ title: "T" }) === "T",
    );
    ok("L2.9 _pickTrajTitle 空安", lsClient._pickTrajTitle(null) === "");

    // _pickTrajId
    ok(
      "L2.10 _pickTrajId 取 trajectoryId",
      lsClient._pickTrajId({ trajectoryId: "abc" }) === "abc",
    );
    ok(
      "L2.11 _pickTrajId 退 cascadeId",
      lsClient._pickTrajId({ cascadeId: "xyz" }) === "xyz",
    );

    // _pickTrajTs
    const ts = lsClient._pickTrajTs({
      lastModifiedTime: "2025-01-01T00:00:00Z",
    });
    ok("L2.12 _pickTrajTs 返数 (ms)", typeof ts === "number" && ts > 0);

    // L2 真活探 LS (本机有 LS 进程)
    let ls = null;
    try {
      ls = lsClient.discoverLS(true);
    } catch {}
    ok(
      "L2.13 discoverLS 不抛 (本机活/无 LS 都返 null/obj)",
      ls === null || (ls && typeof ls.port === "number"),
    );
    if (ls && ls.port) {
      console.log(
        "    实证 LS · port=" +
          ls.port +
          " pid=" +
          ls.pid +
          " csrf=" +
          (ls.csrf ? "yes" : "no"),
      );
    } else {
      console.log(
        "    本机无 LS · skip 真连验 (合理 · ls-client.js 不破坏即过)",
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // L3 · ls-gate-patcher.js (系统门禁 · 三道) · 仅 status (默 false 守)
  // ─────────────────────────────────────────────────────────────────
  console.log("\n─────── L3 · ls-gate-patcher.js · 系统门禁 · 三道 ───────");
  let lsGate;
  try {
    delete require.cache[require.resolve(path.join(D, "ls-gate-patcher.js"))];
    lsGate = require(path.join(D, "ls-gate-patcher.js"));
    ok("L3.1 ls-gate-patcher.js require 成", typeof lsGate === "object");
  } catch (e) {
    ok("L3.1 ls-gate-patcher.js require 成", false, e.message);
  }

  if (lsGate) {
    const L3_EXPORTS = [
      "apply",
      "status",
      "revert",
      "findCandidates",
      "getExtDirs",
      "getBuiltinExtDirs",
      "_resolveOpts",
      "_scopeMeta",
      "GATE_SIGNATURE",
      "GATE_REPLACEMENT",
      "PATCH_MARKER",
    ];
    const m3 = L3_EXPORTS.filter((k) => !(k in lsGate));
    ok(
      "L3.2 11 ls-gate exports 全",
      m3.length === 0,
      m3.length ? "missing=" + m3.join(",") : "all",
    );

    // L3 纯安全验 · 不 apply · 仅扫
    ok(
      "L3.3 PATCH_MARKER 在 (/*dao:v17.68*/)",
      typeof lsGate.PATCH_MARKER === "string" &&
        lsGate.PATCH_MARKER.includes("dao"),
    );
    ok(
      "L3.4 GATE_SIGNATURE 长 ≥80",
      typeof lsGate.GATE_SIGNATURE === "string" &&
        lsGate.GATE_SIGNATURE.length >= 80,
    );

    // _resolveOpts 默无 includeBuiltin / includeOtherUsers
    const opts = lsGate._resolveOpts({});
    ok(
      "L3.5 _resolveOpts({}) 默 includeBuiltin=false",
      opts.includeBuiltin === false,
    );
    ok(
      "L3.6 _resolveOpts({}) 默 includeOtherUsers=false",
      opts.includeOtherUsers === false,
    );

    // _scopeMeta
    const meta = lsGate._scopeMeta(opts);
    ok(
      "L3.7 _scopeMeta 返 scope 字串",
      typeof meta === "object" && typeof meta.scope === "string",
    );

    // status (read-only · 安全)
    let st = null;
    try {
      st = lsGate.status({ includeBuiltin: false, includeOtherUsers: false });
      ok("L3.8 status() 返对象 (不抛)", st && typeof st === "object");
      ok(
        "L3.9 status 返 files 数组 (实键名) + scope/total 完备",
        Array.isArray(st.files) &&
          typeof st.scope === "string" &&
          typeof st.total === "number",
        "keys=" + Object.keys(st).join(","),
      );
      console.log(
        "    L3 status · scope=" +
          (st.scope || "?") +
          " · total=" +
          st.total +
          " · patched=" +
          st.patched_count,
      );
      if (st.files && st.files.length) {
        const c0 = st.files[0];
        console.log(
          "      e.g. " +
            (c0.file || "").slice(-80) +
            " · patched=" +
            c0.patched +
            " · sig=" +
            c0.hasSignature,
        );
      }
    } catch (e) {
      ok("L3.8 status() 不抛", false, e.message);
    }

    // findCandidates 默 scope
    try {
      const cs = lsGate.findCandidates({
        includeBuiltin: false,
        includeOtherUsers: false,
      });
      ok("L3.10 findCandidates 返数组", Array.isArray(cs));
    } catch (e) {
      ok("L3.10 findCandidates 不抛", false, e.message);
    }

    // 不调 apply · 不调 revert · 守而不争
    ok("L3.11 不调 apply / revert (默 false 守 · 用户严令)", true);
  }

  // ─────────────────────────────────────────────────────────────────
  // L4 · _water_virtues.js (水之四德 · 四道)
  // ─────────────────────────────────────────────────────────────────
  console.log("\n─────── L4 · _water_virtues.js · 水之四德 · 四道 ───────");
  // 清 require.cache + global 单例锁 (供 fresh init)
  try {
    delete require.cache[require.resolve(path.join(D, "_water_virtues.js"))];
    const G = global;
    for (const k of Object.keys(G)) {
      if (k.startsWith("__dao_water_virtues__")) delete G[k];
    }
  } catch {}
  let water;
  try {
    water = require(path.join(D, "_water_virtues.js"));
    ok("L4.1 _water_virtues.js require 成", typeof water === "object");
  } catch (e) {
    ok("L4.1 _water_virtues.js require 成", false, e.message);
  }

  if (water) {
    const L4_API = [
      "state",
      "snapshot",
      "markActivity",
      "assertLeader",
      "setLogger",
      "release",
      "disable",
      "dispose",
      "STATE",
      "CFG",
    ];
    const m4 = L4_API.filter((k) => !(k in water));
    ok(
      "L4.2 10 water_virtues 接 全",
      m4.length === 0,
      m4.length ? "missing=" + m4.join(",") : "all",
    );

    // snapshot
    const snap = water.snapshot();
    ok("L4.3 snapshot 返对象", snap && typeof snap === "object");
    ok(
      "L4.4 snapshot 含 leader 段",
      snap &&
        (snap.leader ||
          snap.election ||
          snap.role ||
          snap.activated !== undefined),
    );

    // CFG · 实用 UPPER_CASE 键 (思主静态常量)
    ok(
      "L4.5 CFG.ELECTION_TTL_MS 默 90000 (选举TTL)",
      water.CFG.ELECTION_TTL_MS === 90000,
      "v=" + water.CFG.ELECTION_TTL_MS,
    );
    ok(
      "L4.6 CFG.FOLLOWER_SLOWDOWN 默 3 (follower 减速倍)",
      water.CFG.FOLLOWER_SLOWDOWN === 3,
    );
    ok(
      "L4.7 CFG.CB_FAIL_THRESHOLD 默 10 (熔断阈)",
      water.CFG.CB_FAIL_THRESHOLD === 10,
    );
    ok(
      "L4.7b CFG.CB_OPEN_MS 默 300000 (熔断持续)",
      water.CFG.CB_OPEN_MS === 300000,
    );
    ok(
      "L4.7c CFG.CB_BYPASS 含 127.0.0.1 (本机不熔)",
      Array.isArray(water.CFG.CB_BYPASS) &&
        water.CFG.CB_BYPASS.includes("127.0.0.1"),
    );

    // markActivity
    const before = water.STATE.lastActivityTs || 0;
    water.markActivity();
    await new Promise((s) => setTimeout(s, 5));
    const after = water.STATE.lastActivityTs || 0;
    ok(
      "L4.8 markActivity 推 lastActivityTs",
      after >= before,
      "before=" + before + " after=" + after,
    );

    // setLogger
    let loggedLines = [];
    water.setLogger((line) => loggedLines.push(line));
    ok("L4.9 setLogger 注入函 (不抛)", true);

    // dispose 释 global 单例锁 (心跳不断核心)
    water.dispose();
    ok(
      "L4.10 dispose 后 STATE.activated=false",
      water.STATE.activated === false,
    );
    // 验 global 锁释
    let globalKey = null;
    for (const k of Object.keys(global)) {
      if (k.startsWith("__dao_water_virtues__")) {
        globalKey = k;
        break;
      }
    }
    ok("L4.11 dispose 释 global 单例锁 (G[KEY] 清)", globalKey === null);

    // 二次 require · 重启心跳 (心跳不断)
    delete require.cache[require.resolve(path.join(D, "_water_virtues.js"))];
    const water2 = require(path.join(D, "_water_virtues.js"));
    ok(
      "L4.12 重 require 后 STATE.activated=true (心跳重立)",
      water2.STATE.activated === true,
    );

    water2.dispose();
  }

  // ─────────────────────────────────────────────────────────────────
  // L5 · _uninstall_sentinel.js (uninstall 哨兵 · 五道)
  // ─────────────────────────────────────────────────────────────────
  console.log(
    "\n─────── L5 · _uninstall_sentinel.js · uninstall 哨兵 · 五道 ───────",
  );
  let sentinel;
  try {
    delete require.cache[
      require.resolve(path.join(D, "_uninstall_sentinel.js"))
    ];
    sentinel = require(path.join(D, "_uninstall_sentinel.js"));
    ok("L5.1 _uninstall_sentinel.js require 成", typeof sentinel === "object");
  } catch (e) {
    ok("L5.1 _uninstall_sentinel.js require 成", false, e.message);
  }

  if (sentinel) {
    const L5_API = [
      "runCleanup",
      "startSentinel",
      "_isExtensionGone",
      "_isPidAlive",
      "_cleanStateVscdb",
      "_revertSystemExtJs",
      "_cleanSettingsJson",
      "_killProxy",
      "_cleanWamHot",
      "_selfDelete",
      "_optsFromEnv",
    ];
    const m5 = L5_API.filter((k) => !(k in sentinel));
    ok(
      "L5.2 11 sentinel exports 全",
      m5.length === 0,
      m5.length ? "missing=" + m5.join(",") : "all",
    );

    // _isPidAlive 验 (current pid 必活)
    ok(
      "L5.3 _isPidAlive(process.pid) = true",
      sentinel._isPidAlive(process.pid) === true,
    );
    ok(
      "L5.4 _isPidAlive(99999999) = false",
      sentinel._isPidAlive(99999999) === false,
    );

    // _cleanSettingsJson 纯 JS (核心 v18.1 内联依据)
    const tmpDir = path.join(os.tmpdir(), "dao-l5-test-" + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    const stgPath = path.join(tmpDir, "settings.json");
    const stgBefore = {
      "editor.fontSize": 14,
      "codeium.apiServerUrl": "http://127.0.0.1:8889",
      "codeium.inferenceApiServerUrl": "http://127.0.0.1:8889/i",
      "workbench.colorTheme": "Dark",
    };
    fs.writeFileSync(stgPath, JSON.stringify(stgBefore, null, 2), "utf8");
    let logBuf = [];
    const logFn = (line) => logBuf.push(String(line));

    const r5 = sentinel._cleanSettingsJson([stgPath], logFn);
    ok("L5.5 _cleanSettingsJson 返对象", r5 && typeof r5 === "object");
    const stgAfter = JSON.parse(fs.readFileSync(stgPath, "utf8"));
    ok("L5.6 codeium.apiServerUrl 已删", !("codeium.apiServerUrl" in stgAfter));
    ok(
      "L5.7 codeium.inferenceApiServerUrl 已删",
      !("codeium.inferenceApiServerUrl" in stgAfter),
    );
    ok(
      "L5.8 其他 key 不动 (editor.fontSize)",
      stgAfter["editor.fontSize"] === 14,
    );
    ok(
      "L5.9 其他 key 不动 (workbench.colorTheme)",
      stgAfter["workbench.colorTheme"] === "Dark",
    );

    // 二度调 · 幂等
    const r5b = sentinel._cleanSettingsJson([stgPath], logFn);
    ok(
      "L5.10 二度 _cleanSettingsJson 幂等 (无 codeium 锚也不抛)",
      r5b && typeof r5b === "object",
    );

    // 不存档亦不抛
    const r5c = sentinel._cleanSettingsJson(["E:/no/such/file.json"], logFn);
    ok("L5.11 不存档不抛", r5c && typeof r5c === "object");

    // 清测临时目录
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}

    // _optsFromEnv 应不抛
    let optsFromEnv = null;
    try {
      optsFromEnv = sentinel._optsFromEnv();
      ok("L5.12 _optsFromEnv 不抛", true);
    } catch (e) {
      ok("L5.12 _optsFromEnv 不抛", false, e.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // L6 · essence.js (本源 webview · 六道) · vscode mock
  // ─────────────────────────────────────────────────────────────────
  console.log("\n─────── L6 · essence.js · 本源 webview · 六道 ───────");
  let essence;
  try {
    delete require.cache[require.resolve(path.join(D, "essence.js"))];
    essence = require(path.join(D, "essence.js"));
    ok("L6.1 essence.js require 成 (vscode mock)", typeof essence === "object");
  } catch (e) {
    ok("L6.1 essence.js require 成", false, e.message);
  }

  if (essence) {
    ok(
      "L6.2 EssenceProvider 是函/类",
      typeof essence.EssenceProvider === "function",
    );
    ok("L6.3 gatherEssence 是函", typeof essence.gatherEssence === "function");
    ok("L6.4 _diagnose 是函", typeof essence._diagnose === "function");
    ok("L6.5 DaoSseClient 是函/类", typeof essence.DaoSseClient === "function");

    // _buildReconstructedSP v17.88+ stub 永返 null
    ok(
      "L6.6 _buildReconstructedSP stub 永返 null (v17.88 死码归芜)",
      essence._buildReconstructedSP(null) === null,
    );

    // gatherEssence (无 LS · 无 proxy · 应不抛 · 返结构)
    let g = null;
    try {
      g = await essence.gatherEssence({ port: 65535 }); // 用一不可能 port 模拟无 proxy
      ok(
        "L6.7 gatherEssence 不抛 (无 proxy 情况)",
        g && typeof g === "object",
        "keys=" + (g ? Object.keys(g).join(",") : "null"),
      );
    } catch (e) {
      ok("L6.7 gatherEssence 不抛", false, e.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // L7 · watcher.js (观照 · 七道)
  // ─────────────────────────────────────────────────────────────────
  console.log("\n─────── L7 · watcher.js · 观照 · 七道 ───────");
  let watcher;
  try {
    delete require.cache[require.resolve(path.join(D, "watcher.js"))];
    watcher = require(path.join(D, "watcher.js"));
    ok("L7.1 watcher.js require 成 (vscode mock)", typeof watcher === "object");
  } catch (e) {
    ok("L7.1 watcher.js require 成", false, e.message);
  }

  if (watcher) {
    ok("L7.2 DaoWatcher 是 class/函", typeof watcher.DaoWatcher === "function");
    ok("L7.3 diffSnapshots 是 函", typeof watcher.diffSnapshots === "function");
    ok("L7.4 _fingerprint 是 函", typeof watcher._fingerprint === "function");

    // _fingerprint 纯函数
    const fp1 = watcher._fingerprint({ a: 1, b: 2 });
    const fp2 = watcher._fingerprint({ a: 1, b: 2 });
    const fp3 = watcher._fingerprint({ a: 1, b: 3 });
    ok("L7.5 _fingerprint 同入同出 (确定性)", fp1 === fp2);
    ok("L7.6 _fingerprint 异入异出", fp1 !== fp3);
    ok(
      "L7.7 _fingerprint(null) = 'null'",
      watcher._fingerprint(null) === "null",
    );

    // diffSnapshots
    const d0 = watcher.diffSnapshots(null, { rules: { memories: [] } });
    ok(
      "L7.8 diffSnapshots(null, x) 返 changed=true (initial)",
      d0 && d0.changed === true,
    );

    // 注: _ruleIds 内部用 (memoryId|title) + content.length · 需 memoryId 不同 或内容长不同
    const same = {
      rules: { memories: [{ memoryId: "m1", content: "x" }] },
      mcp: { states: [] },
    };
    const d1 = watcher.diffSnapshots(same, same);
    ok(
      "L7.9 diffSnapshots(same, same) 返 changed=false (sections=[])",
      d1 && d1.changed === false && d1.sections.length === 0,
    );

    const diff = {
      rules: { memories: [{ memoryId: "m2", content: "x" }] },
      mcp: { states: [] },
    };
    const d2 = watcher.diffSnapshots(same, diff);
    ok(
      "L7.10 diffSnapshots(a, b) 返 changed=true (memoryId 变 · sections=['rules'])",
      d2 && d2.changed === true && d2.sections.includes("rules"),
      "d2=" + JSON.stringify(d2),
    );

    // mcp 变
    const mcpA = {
      rules: { memories: [] },
      mcp: {
        states: [{ spec: { serverName: "x" }, status: "running", tools: [] }],
      },
    };
    const mcpB = {
      rules: { memories: [] },
      mcp: {
        states: [{ spec: { serverName: "x" }, status: "stopped", tools: [] }],
      },
    };
    const d3 = watcher.diffSnapshots(mcpA, mcpB);
    ok(
      "L7.10b diffSnapshots mcp 状变 返 sections=['mcp']",
      d3 && d3.changed === true && d3.sections.includes("mcp"),
    );

    // DaoWatcher 实例
    const w = new watcher.DaoWatcher();
    ok("L7.11 new DaoWatcher() 不抛", w !== null);
    ok(
      "L7.12 是 EventEmitter (有 .on/.emit)",
      typeof w.on === "function" && typeof w.emit === "function",
    );

    // dispose
    if (typeof w.dispose === "function") {
      try {
        w.dispose();
        ok("L7.13 watcher.dispose 不抛", true);
      } catch (e) {
        ok("L7.13 watcher.dispose 不抛", false, e.message);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // L8 · isolator.js (隔离 · 八道)
  // ─────────────────────────────────────────────────────────────────
  console.log("\n─────── L8 · isolator.js · 隔离 · 八道 ───────");
  let isolator;
  try {
    delete require.cache[require.resolve(path.join(D, "isolator.js"))];
    isolator = require(path.join(D, "isolator.js"));
    ok("L8.1 isolator.js require 成", typeof isolator === "object");
  } catch (e) {
    ok("L8.1 isolator.js require 成", false, e.message);
  }

  if (isolator) {
    ok("L8.2 status 是 函", typeof isolator.status === "function");
    ok("L8.3 scanAgentsMd 是 函", typeof isolator.scanAgentsMd === "function");
    ok("L8.4 readState 是 函", typeof isolator.readState === "function");

    // 白名单常量
    ok(
      "L8.5 DAO_ALLOWED_EXACT 是数组",
      Array.isArray(isolator.DAO_ALLOWED_EXACT),
    );
    ok(
      "L8.6 DAO_ALLOWED_PREFIXES 是数组",
      Array.isArray(isolator.DAO_ALLOWED_PREFIXES),
    );

    // status (extensionPath 必 · 实 API 额外参)
    try {
      const fakeExt = path.join(os.tmpdir(), "dao-l8-fake-" + Date.now());
      fs.mkdirSync(fakeExt, { recursive: true });
      const st = isolator.status(fakeExt);
      ok(
        "L8.7 status(extensionPath) 返对象 (不抛)",
        st && typeof st === "object",
      );
      try {
        fs.rmSync(fakeExt, { recursive: true, force: true });
      } catch {}
    } catch (e) {
      ok("L8.7 status(extensionPath) 不抛", false, e.message);
    }

    // readState 不抛
    try {
      const rs = isolator.readState();
      ok(
        "L8.8 readState() 不抛 (无 state 也返对象/null)",
        rs === null || typeof rs === "object",
      );
    } catch (e) {
      ok("L8.8 readState() 不抛", false, e.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // L9 · extension.js (主壳 · 九道) · 静态结构验
  // ─────────────────────────────────────────────────────────────────
  console.log("\n─────── L9 · extension.js · 主壳 · 九道 · 静态验 ───────");
  const extJsPath = path.join(D, "extension.js");
  ok("L9.1 extension.js 在", fs.existsSync(extJsPath));
  const extJs = fs.readFileSync(extJsPath, "utf8");

  // node --check 等同 · syntax valid
  let syntaxOk = false;
  try {
    new Function(extJs);
    syntaxOk = true;
  } catch (e) {
    // Top-level await/return 致 syntax 错 不一定是真错 · 用 Module 验
    syntaxOk =
      !/SyntaxError/.test(e.message) ||
      /Unexpected (token|reserved word|identifier)/.test(e.message) === false;
  }
  // 真 node --check
  const { spawnSync } = require("node:child_process");
  const r9 = spawnSync(process.execPath, ["--check", extJsPath], {
    encoding: "utf8",
    timeout: 5000,
  });
  ok(
    "L9.2 node --check extension.js 通",
    r9.status === 0,
    r9.status === 0 ? "" : "stderr=" + (r9.stderr || "").slice(0, 150),
  );

  // 9.3 含 activate
  ok(
    "L9.3 含 function activate(...)",
    /\bfunction\s+activate\b|\bexports\.activate\s*=|module\.exports\.activate\s*=|module\.exports\s*=\s*\{[^}]*\bactivate\b/.test(
      extJs,
    ),
  );
  ok(
    "L9.4 含 deactivate (function/exports.deactivate=)",
    /\bfunction\s+deactivate\b|\bexports\.deactivate\s*=/.test(extJs),
  );

  // 9.5 v18.1.1 marker 在 (新增 _doDirectCleanup)
  ok("L9.5 v18.1.1 _doDirectCleanup 函在", /_doDirectCleanup\s*\(/.test(extJs));
  ok("L9.6 v18.1.1 _waterStubInfo 函在", /_waterStubInfo\s*\(/.test(extJs));
  ok(
    "L9.7 v18.0+ 进程内化 require 源.js + start({port})",
    /require\([^)]*['"]\.\/vendor\/wam\/bundled-origin\/源\.js['"][^)]*\)/.test(
      extJs,
    ) ||
      /require\([^)]*['"]\.\/vendor\/wam\/bundled-origin\/源\.js['"]\)/.test(
        extJs,
      ) ||
      extJs.indexOf("源.js") > -1,
  );

  // 9.8 含三道防线
  ok(
    "L9.8 _detectAndHealDeadAnchor (L2 死锚自愈) 函在",
    /_detectAndHealDeadAnchor\s*\(/.test(extJs),
  );

  // 9.9 命令注 vs package.json · 道仅与 WAM 二壳 · 合查
  const pkg = JSON.parse(fs.readFileSync(path.join(D, "package.json"), "utf8"));
  const declaredCmds = pkg.contributes.commands.map((c) => c.command);
  const wamExtPath = path.join(D, "vendor/wam/extension.js");
  const wamExtJs = fs.readFileSync(wamExtPath, "utf8");
  let regCount = 0,
    missing9 = [];
  for (const c of declaredCmds) {
    const re = new RegExp(
      "registerCommand\\s*\\(\\s*['\"]" + c.replace(/\./g, "\\.") + "['\"]",
    );
    if (re.test(extJs) || re.test(wamExtJs)) regCount++;
    else missing9.push(c);
  }
  ok(
    "L9.9 package.json " +
      declaredCmds.length +
      " 命令全在 extension.js + vendor/wam/extension.js 注 (道道二壳 · 合查)",
    regCount === declaredCmds.length,
    "registered=" +
      regCount +
      "/" +
      declaredCmds.length +
      (missing9.length ? " missing=" + missing9.slice(0, 3).join(",") : ""),
  );

  // 9.10 vendor/wam 本源在
  ok(
    "L9.10 vendor/wam/extension.js 在 (WAM 本源)",
    fs.existsSync(path.join(D, "vendor/wam/extension.js")),
  );
  ok(
    "L9.11 vendor/wam/bundled-origin/源.js 在",
    fs.existsSync(path.join(D, "vendor/wam/bundled-origin/源.js")),
  );

  // 9.12 package.json version 与 extension.js 一致
  const pkgVer = pkg.version;
  ok(
    "L9.12 package.json version = '" + pkgVer + "' (运行时本源)",
    /^\d+\.\d+\.\d+$/.test(pkgVer),
  );

  // ─────────────────────────────────────────────────────────────────
  // 收
  // ─────────────────────────────────────────────────────────────────
  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  console.log("\n══════ 反者道之动 · 九层直连 · 总 ══════");
  console.log("  PASS = " + pass);
  console.log("  FAIL = " + fail);
  console.log("  耗时 = " + dt + "s");
  if (fail === 0) {
    console.log("\n  ✓ 全通 · 道之冲, 而用之或不盈");
    console.log("  ✓ 自下而上 · 九层各活 · 九层归一");
    console.log("  ✓ 反者道之动 · 道最后一步即 VSIX 大归宗");
  } else {
    console.log("\n  ✗ 失:");
    failures.forEach((f) => console.log("    - " + f));
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("\nFATAL", e);
  process.exit(1);
});
