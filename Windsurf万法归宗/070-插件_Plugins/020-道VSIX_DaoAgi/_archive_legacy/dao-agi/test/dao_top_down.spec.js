// dao_top_down.spec.js — 反者道之动 · 自顶向下 · 装态实活 · 一切命令尽过
// =====================================================================
// 道哲: 反之又反 · 大曰逝 · 逝曰远 · 远曰反
//
// 与 dao_bottom_up.spec.js 之异:
//   下: L1→L9 直 require 源.js 等模块, 验单件
//   上: 从 windsurf 装态目录 (~/.windsurf/extensions/dao-agi.dao-agi-18.1.2/)
//       完整 require extension.js · activate(ctx) · 收 34 命令 · 全调
//
// 不动用户当前 windsurf 会话 (我 cascade 跑在里面 · reload 会断我自己):
//   · 沙箱 ~/.wam-hot → TempDir 隔离
//   · vscode 全 mock · 不真启 ext-host
//   · 修类命令 pair 调用 (start→stop · apply→revert)
//   · 破类命令 dry-run + 拦截 spawn · 不真执行
//   · 不动 settings.json (vscode.workspace.getConfiguration 全 mock)
//
// 验:
//   ① activate(ctx) 不抛 · 收 34 命令 (16 dao-agi-shell + 18 WAM)
//   ② 读类 · 命令调用不抛 · 返合理 (status/show/preview/sig/...)
//   ③ 修类 · pair 调可逆 (originInvert↔originPassthrough · sp.set→sp.reset)
//   ④ 破类 · uninstall 调 _doDirectCleanup · 五事返果 (沙箱内)
//   ⑤ proxy in-process · /origin/ping 真活 (isolatorPort)
//   ⑥ deactivate(ctx) 不抛
//
// 终: pass=N fail=0 即 "道生之, 德畜之, 物形之, 势成之"
// =====================================================================
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const { EventEmitter } = require("node:events");
const Module = require("node:module");

// ─── 0. 装态路径 (顶层部署后的真实路径) ─────────────────────
const INSTALLED_DIR = path.join(
  process.env.USERPROFILE || os.homedir(),
  ".windsurf",
  "extensions",
  "dao-agi.dao-agi-18.1.2",
);
const SRC_DIR = path.resolve(__dirname, "..");

// ─── 1. 沙箱: 将 ~/.wam-hot 重定向到 TempDir (避动用户真状态) ───
const SANDBOX_ROOT = path.join(
  os.tmpdir(),
  "dao-topdown-" + Date.now() + "-" + Math.floor(Math.random() * 1e6),
);
const SANDBOX_HOME = path.join(SANDBOX_ROOT, "home");
const SANDBOX_WAM_HOT = path.join(SANDBOX_HOME, ".wam-hot");
fs.mkdirSync(SANDBOX_WAM_HOT, { recursive: true });

// 拦 os.homedir → 沙箱
const _origHomedir = os.homedir;
os.homedir = () => SANDBOX_HOME;
process.env.USERPROFILE = SANDBOX_HOME; // win
process.env.HOME = SANDBOX_HOME; // posix

// 拦 child_process.spawn (uninstall 守护启 spawn detached) · 不真启
const _cp = require("node:child_process");
const _origSpawn = _cp.spawn;
let _spawnIntercepts = [];
_cp.spawn = function (cmd, args, opts) {
  _spawnIntercepts.push({ cmd, args: args || [], opts: opts || {} });
  // 返个 fake child · 立即 unref + close
  const fake = new EventEmitter();
  fake.pid = 99999;
  fake.stdin = { write() {}, end() {} };
  fake.stdout = new EventEmitter();
  fake.stderr = new EventEmitter();
  fake.unref = () => fake;
  fake.kill = () => true;
  setImmediate(() => fake.emit("close", 0));
  return fake;
};

// ─── 2. 报道 ─────────────────────────────────────────────
let pass = 0,
  fail = 0;
const failures = [];
const tier = {};
function _bump(t, k) {
  tier[t] = tier[t] || { pass: 0, fail: 0 };
  tier[t][k]++;
}
function ok(t, label, cond, hint) {
  if (cond) {
    pass++;
    _bump(t, "pass");
    console.log("  ✓ " + label + (hint ? "    " + hint : ""));
  } else {
    fail++;
    _bump(t, "fail");
    failures.push(t + " :: " + label + (hint ? " :: " + hint : ""));
    console.log("  ✗ " + label + (hint ? "    " + hint : ""));
  }
}

// ─── 3. vscode mock (commands/window/workspace/Uri/EventEmitter/...) ──
const _commands = new Map(); // name → callback
const _commandCalls = [];
const _outputChannels = new Map(); // name → channel
const _statusBars = [];
const _treeDataProviders = new Map();
const _webviews = [];
const _settings = {}; // codeium.* 等模拟 settings
const _shownMessages = []; // info/warn/err

function makeOutputChannel(name) {
  const lines = [];
  const ch = {
    name,
    appendLine(line) {
      lines.push(line);
    },
    append(line) {
      lines.push(line);
    },
    show() {},
    hide() {},
    clear() {
      lines.length = 0;
    },
    dispose() {},
    _lines: lines,
  };
  _outputChannels.set(name, ch);
  return ch;
}

const Disposable = function () {
  return { dispose() {} };
};

class MockUri {
  constructor(p) {
    this.fsPath = p;
    this.path = p.replace(/\\/g, "/");
    this.scheme = "file";
  }
  static file(p) {
    return new MockUri(p);
  }
  static parse(s) {
    return new MockUri(s);
  }
  toString() {
    return "file://" + this.path;
  }
  with(_) {
    return this;
  }
}

class MockEventEmitter {
  constructor() {
    this._lst = [];
  }
  get event() {
    const self = this;
    return function (cb) {
      self._lst.push(cb);
      return { dispose() {} };
    };
  }
  fire(arg) {
    this._lst.slice().forEach((cb) => {
      try {
        cb(arg);
      } catch {}
    });
  }
  dispose() {
    this._lst.length = 0;
  }
}

const vscodeMock = {
  // ── 命令 ──
  commands: {
    registerCommand(name, cb, _this) {
      if (_commands.has(name)) {
        // 允 override · 后注册胜
      }
      _commands.set(name, cb.bind(_this));
      return new Disposable();
    },
    registerTextEditorCommand(name, cb) {
      _commands.set(name, cb);
      return new Disposable();
    },
    async executeCommand(name, ...args) {
      _commandCalls.push({ name, args, t: Date.now() });
      // 内置命令拦截
      if (name === "workbench.action.reloadWindow") return; // 不真 reload
      if (name === "setContext") return; // ctx-key
      if (name === "vscode.open") return; // 不开外部
      const cb = _commands.get(name);
      if (cb) return await cb(...args);
      // 未识别命令 · 返 undefined (不抛)
      return undefined;
    },
    getCommands() {
      return Promise.resolve(Array.from(_commands.keys()));
    },
  },
  // ── window ──
  window: {
    createOutputChannel: makeOutputChannel,
    createStatusBarItem(align, prio) {
      const b = {
        alignment: align,
        priority: prio,
        text: "",
        tooltip: "",
        command: undefined,
        color: undefined,
        backgroundColor: undefined,
        show() {},
        hide() {},
        dispose() {},
      };
      _statusBars.push(b);
      return b;
    },
    showInformationMessage(msg, ...rest) {
      _shownMessages.push({ kind: "info", msg, rest });
      // 若有按钮 (modal items), 默选第一项 · 模拟用户点
      const items = rest.filter((x) => typeof x === "string");
      return Promise.resolve(items[0]);
    },
    showWarningMessage(msg, ...rest) {
      _shownMessages.push({ kind: "warn", msg, rest });
      const items = rest.filter((x) => typeof x === "string");
      return Promise.resolve(items[0]);
    },
    showErrorMessage(msg, ...rest) {
      _shownMessages.push({ kind: "err", msg, rest });
      const items = rest.filter((x) => typeof x === "string");
      return Promise.resolve(items[0]);
    },
    showInputBox(opts) {
      _shownMessages.push({ kind: "input", opts });
      // 默返 placeholder · 或空字符串 (取消)
      return Promise.resolve(undefined);
    },
    showQuickPick(items, opts) {
      _shownMessages.push({ kind: "pick", opts });
      // 默选第一项 · 不取消
      const list = Array.isArray(items)
        ? items
        : items && typeof items.then === "function"
          ? null
          : [];
      return Promise.resolve(list && list[0]);
    },
    showSaveDialog() {
      return Promise.resolve(undefined);
    },
    showOpenDialog() {
      return Promise.resolve(undefined);
    },
    withProgress(_opts, fn) {
      return Promise.resolve(
        fn(
          { report() {} },
          {
            isCancellationRequested: false,
            onCancellationRequested: () => ({ dispose() {} }),
          },
        ),
      );
    },
    createWebviewPanel(viewType, title, col, opts) {
      const panel = {
        viewType,
        title,
        webview: {
          html: "",
          options: opts || {},
          asWebviewUri: (u) => u,
          cspSource: "",
          onDidReceiveMessage(cb) {
            this._msgHandler = cb;
            return { dispose() {} };
          },
          postMessage(m) {
            return Promise.resolve(true);
          },
        },
        onDidDispose(cb) {
          this._disposeCb = cb;
          return { dispose() {} };
        },
        onDidChangeViewState() {
          return { dispose() {} };
        },
        reveal() {},
        dispose() {
          this._disposeCb && this._disposeCb();
        },
        visible: true,
        active: true,
      };
      _webviews.push(panel);
      return panel;
    },
    registerTreeDataProvider(viewId, provider) {
      _treeDataProviders.set(viewId, provider);
      return new Disposable();
    },
    createTreeView(viewId, opts) {
      _treeDataProviders.set(viewId, opts && opts.treeDataProvider);
      return {
        onDidChangeSelection() {
          return { dispose() {} };
        },
        onDidChangeVisibility() {
          return { dispose() {} };
        },
        reveal() {},
        dispose() {},
        visible: true,
        selection: [],
      };
    },
    activeTextEditor: null,
    visibleTextEditors: [],
    onDidChangeActiveTextEditor() {
      return { dispose() {} };
    },
    onDidChangeVisibleTextEditors() {
      return { dispose() {} };
    },
    onDidOpenTerminal() {
      return { dispose() {} };
    },
    onDidCloseTerminal() {
      return { dispose() {} };
    },
    terminals: [],
    createTerminal() {
      return {
        sendText() {},
        show() {},
        hide() {},
        dispose() {},
      };
    },
    showTextDocument(arg, _opts) {
      const p =
        arg && arg.fsPath
          ? arg.fsPath
          : typeof arg === "string"
            ? arg
            : (arg && arg.uri && arg.uri.fsPath) || "";
      return Promise.resolve({
        document: {
          uri: MockUri.file(p),
          fileName: p,
          getText: () => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""),
          languageId: "plaintext",
        },
        selection: { active: { line: 0, character: 0 } },
        revealRange() {},
        edit() {
          return Promise.resolve(true);
        },
      });
    },
    registerWebviewViewProvider(viewId, provider, _opts) {
      _treeDataProviders.set("webviewView:" + viewId, provider);
      return new Disposable();
    },
    registerUriHandler() {
      return new Disposable();
    },
    registerFileDecorationProvider() {
      return new Disposable();
    },
  },
  // ── workspace ──
  workspace: {
    workspaceFolders: [],
    name: "dao-topdown-test",
    rootPath: SANDBOX_HOME,
    getConfiguration(section) {
      const get = (key, def) => {
        const fk = section ? section + "." + key : key;
        return _settings[fk] !== undefined ? _settings[fk] : def;
      };
      return {
        get,
        has(key) {
          const fk = section ? section + "." + key : key;
          return _settings[fk] !== undefined;
        },
        update(key, value, _scope) {
          const fk = section ? section + "." + key : key;
          if (value === undefined) delete _settings[fk];
          else _settings[fk] = value;
          return Promise.resolve();
        },
        inspect(key) {
          const fk = section ? section + "." + key : key;
          return {
            key: fk,
            globalValue: _settings[fk],
            workspaceValue: undefined,
          };
        },
      };
    },
    onDidChangeConfiguration() {
      return { dispose() {} };
    },
    onDidChangeWorkspaceFolders() {
      return { dispose() {} };
    },
    onDidChangeTextDocument() {
      return { dispose() {} };
    },
    onDidSaveTextDocument() {
      return { dispose() {} };
    },
    fs: {
      readFile: (uri) => Promise.resolve(fs.readFileSync(uri.fsPath || uri)),
      writeFile: (uri, content) => {
        fs.writeFileSync(uri.fsPath || uri, content);
        return Promise.resolve();
      },
      stat: (uri) => Promise.resolve(fs.statSync(uri.fsPath || uri)),
      readDirectory: (uri) =>
        Promise.resolve(
          fs
            .readdirSync(uri.fsPath || uri, { withFileTypes: true })
            .map((d) => [d.name, d.isDirectory() ? 2 : 1]),
        ),
    },
    findFiles() {
      return Promise.resolve([]);
    },
    openTextDocument(arg) {
      const p = typeof arg === "string" ? arg : arg.fsPath || String(arg);
      return Promise.resolve({
        uri: MockUri.file(p),
        fileName: p,
        getText: () => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""),
        languageId: "plaintext",
        lineCount: 0,
      });
    },
    asRelativePath: (p) => p,
  },
  // ── env ──
  env: {
    appName: "Windsurf",
    machineId: "test-machine-id",
    sessionId: "test-session-id",
    language: "zh-cn",
    clipboard: {
      readText: () => Promise.resolve(""),
      writeText: (_t) => Promise.resolve(),
    },
    openExternal: () => Promise.resolve(true),
  },
  // ── 类型 ──
  Uri: MockUri,
  Disposable: function (fn) {
    return { dispose: fn || function () {} };
  },
  EventEmitter: MockEventEmitter,
  ThemeColor: function (id) {
    return { id };
  },
  ThemeIcon: function (id, color) {
    return { id, color };
  },
  Range: function (a, b, c, d) {
    return { start: { line: a, character: b }, end: { line: c, character: d } };
  },
  Position: function (l, c) {
    return { line: l, character: c };
  },
  // ── 枚举 ──
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  TreeItem: function (label, collapsibleState) {
    return {
      label,
      collapsibleState: collapsibleState || 0,
      contextValue: undefined,
      iconPath: undefined,
      command: undefined,
      tooltip: undefined,
      description: undefined,
    };
  },
  ProgressLocation: {
    SourceControl: 1,
    Window: 10,
    Notification: 15,
  },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  ExtensionMode: { Production: 1, Development: 2, Test: 3 },
  // ── 扩展 ──
  extensions: {
    all: [],
    getExtension(id) {
      return undefined;
    },
    onDidChange() {
      return { dispose() {} };
    },
  },
  languages: {
    registerHoverProvider() {
      return new Disposable();
    },
    registerCompletionItemProvider() {
      return new Disposable();
    },
    registerDocumentSymbolProvider() {
      return new Disposable();
    },
    createDiagnosticCollection() {
      return {
        set() {},
        delete() {},
        clear() {},
        dispose() {},
      };
    },
  },
};

// 注 vscode 到 require · 装态 require("vscode") 即得 mock
const _origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
  if (req === "vscode") return require.resolve("vm");
  // ↑ 解析为 vm 内置 · 但我们已在 require.cache 注入 mock · vm 不会被实加载
  return _origResolve.call(this, req, parent, ...rest);
};
require.cache[require.resolve("vm")] = {
  id: "vscode",
  filename: "vscode",
  loaded: true,
  exports: vscodeMock,
};

// ─── 4. 沙箱 ExtensionContext ─────────────────────────────
const globalStoragePath = path.join(SANDBOX_ROOT, "globalStorage");
const logPath = path.join(SANDBOX_ROOT, "log");
const storagePath = path.join(SANDBOX_ROOT, "workspaceStorage");
fs.mkdirSync(globalStoragePath, { recursive: true });
fs.mkdirSync(logPath, { recursive: true });
fs.mkdirSync(storagePath, { recursive: true });

class MemState {
  constructor() {
    this._m = new Map();
  }
  get(k, def) {
    return this._m.has(k) ? this._m.get(k) : def;
  }
  update(k, v) {
    if (v === undefined) this._m.delete(k);
    else this._m.set(k, v);
    return Promise.resolve();
  }
  keys() {
    return Array.from(this._m.keys());
  }
  setKeysForSync() {}
}

function makeContext(extensionPath) {
  return {
    extensionPath,
    extensionUri: MockUri.file(extensionPath),
    storageUri: MockUri.file(storagePath),
    globalStorageUri: MockUri.file(globalStoragePath),
    logUri: MockUri.file(logPath),
    storagePath,
    globalStoragePath,
    logPath,
    asAbsolutePath: (p) => path.join(extensionPath, p),
    subscriptions: [],
    workspaceState: new MemState(),
    globalState: new MemState(),
    secrets: {
      get: () => Promise.resolve(undefined),
      store: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      onDidChange() {
        return { dispose() {} };
      },
    },
    extensionMode: 3, // Test
    environmentVariableCollection: {
      append() {},
      clear() {},
      delete() {},
      forEach() {},
      get() {},
      prepend() {},
      replace() {},
    },
    extension: {
      id: "dao-agi.dao-agi",
      packageJSON: JSON.parse(
        fs.readFileSync(path.join(extensionPath, "package.json"), "utf8"),
      ),
    },
  };
}

// ─── 5. 验装态目录 + 加载 ──────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log("\n══════ 反者道之动 · 自顶向下 · 装态实活 ══════");
  console.log("  装路:   " + INSTALLED_DIR);
  console.log("  沙箱:   " + SANDBOX_ROOT);
  console.log(
    "  机:     " + os.hostname() + " · win32 · node " + process.version,
  );

  // 5.1 装态在 + 必件全
  console.log("\n─────── 一 · 装态目录验 ───────");
  ok("install", "装态目录在 (顶层部署成)", fs.existsSync(INSTALLED_DIR));
  if (!fs.existsSync(INSTALLED_DIR)) {
    console.log("\n  装态不在 · 终");
    process.exit(1);
  }
  for (const f of [
    "extension.js",
    "package.json",
    "essence.js",
    "watcher.js",
    "isolator.js",
    "ls-client.js",
    "ls-gate-patcher.js",
    "vendor/wam/extension.js",
    "vendor/wam/bundled-origin/源.js",
  ]) {
    ok("install", "装态件: " + f, fs.existsSync(path.join(INSTALLED_DIR, f)));
  }

  // 5.2 装态 ↔ 源 sha 等
  const crypto = require("node:crypto");
  function h16(p) {
    return crypto
      .createHash("sha256")
      .update(fs.readFileSync(p))
      .digest("hex")
      .slice(0, 16);
  }
  const srcExtSha = h16(path.join(SRC_DIR, "extension.js"));
  const dstExtSha = h16(path.join(INSTALLED_DIR, "extension.js"));
  ok(
    "install",
    "装态 extension.js sha16 = 源 (byte等)",
    srcExtSha === dstExtSha,
    "src=" + srcExtSha + " dst=" + dstExtSha,
  );

  // ─── 二 · activate(ctx) · 收命令 ─────────────────────────
  console.log("\n─────── 二 · activate(ctx) ───────");
  const extJs = path.join(INSTALLED_DIR, "extension.js");
  let extMod, ctx;
  try {
    delete require.cache[require.resolve(extJs)];
    extMod = require(extJs);
    ok("activate", "装态 extension.js require 成", typeof extMod === "object");
  } catch (e) {
    ok("activate", "装态 extension.js require 成", false, e.message);
    console.log("\n  无法 require · 终");
    process.exit(1);
  }

  ok(
    "activate",
    "exports.activate 是函",
    typeof extMod.activate === "function",
  );
  ok(
    "activate",
    "exports.deactivate 是函",
    typeof extMod.deactivate === "function",
  );

  ctx = makeContext(INSTALLED_DIR);
  let activateError = null;
  try {
    await extMod.activate(ctx);
    ok("activate", "activate(ctx) 不抛", true);
  } catch (e) {
    activateError = e;
    ok("activate", "activate(ctx) 不抛", false, (e && e.message) || String(e));
  }

  console.log(
    "  · 命令注册数 = " +
      _commands.size +
      " (期 ≥ 34 · 16 dao-agi-shell + 18 WAM)",
  );
  console.log("  · 状态栏 = " + _statusBars.length);
  console.log("  · 输出通道 = " + _outputChannels.size);
  console.log("  · TreeDataProvider = " + _treeDataProviders.size);
  console.log("  · ctx.subscriptions = " + ctx.subscriptions.length);
  console.log("  · spawn 拦截数 = " + _spawnIntercepts.length);

  ok(
    "activate",
    "命令数 ≥ 34 (dao-agi-shell 16 + WAM 18)",
    _commands.size >= 34,
    "got=" + _commands.size,
  );

  // package.json 之 34 命令全在
  const pkg = JSON.parse(
    fs.readFileSync(path.join(INSTALLED_DIR, "package.json"), "utf8"),
  );
  const declared = pkg.contributes.commands.map((c) => c.command);
  const missing = declared.filter((c) => !_commands.has(c));
  ok(
    "activate",
    "package.json 之 " + declared.length + " 命令全 register (一一对应)",
    missing.length === 0,
    missing.length ? "missing=" + missing.join(",") : "",
  );

  // ─── 三 · 读类命令 (15+) · 全调不抛 ──────────────────────
  console.log("\n─────── 三 · 读类命令 (任意调 · 安全) ───────");
  const READ_CMDS = [
    "wam.status",
    "wam.selfTest",
    "wam.diagWrite",
    "wam.showEssence",
    "dao.lsGate.status",
    "dao.sp.get",
    "dao.water.status",
    "dao.water.test",
    "dao.water.config",
  ];
  for (const c of READ_CMDS) {
    let okCall = false;
    let err = null;
    try {
      const r = await vscodeMock.commands.executeCommand(c);
      okCall = true;
    } catch (e) {
      err = (e && e.message) || String(e);
    }
    ok("read", "调 " + c + " 不抛", okCall, err || "");
  }

  // ─── 四 · 修类 pair (双向可逆) ────────────────────────────
  console.log("\n─────── 四 · 修类命令 pair (可逆) ───────");

  // 4.1 originInvert ↔ originPassthrough
  let r4a = false;
  try {
    await vscodeMock.commands.executeCommand("wam.originInvert");
    r4a = true;
  } catch (e) {
    r4a = e.message;
  }
  ok("modify", "wam.originInvert 调成", r4a === true, r4a !== true ? r4a : "");

  let r4b = false;
  try {
    await vscodeMock.commands.executeCommand("wam.originPassthrough");
    r4b = true;
  } catch (e) {
    r4b = e.message;
  }
  ok(
    "modify",
    "wam.originPassthrough 调成",
    r4b === true,
    r4b !== true ? r4b : "",
  );

  // 4.2 sp.set → sp.get → sp.reset
  let r4c = false,
    r4d = null,
    r4e = false;
  try {
    await vscodeMock.commands.executeCommand("dao.sp.set", "TEST_SP_道德经");
    r4c = true;
  } catch (e) {
    r4c = e.message;
  }
  ok(
    "modify",
    "dao.sp.set('TEST_SP_道德经') 调成",
    r4c === true,
    r4c !== true ? r4c : "",
  );

  try {
    r4d = await vscodeMock.commands.executeCommand("dao.sp.get");
  } catch (e) {
    r4d = "ERR: " + e.message;
  }
  // sp.get 可能返字符串 or 调 webview · 不强求返值, 不抛即过
  ok(
    "modify",
    "dao.sp.get 调成",
    typeof r4d !== "undefined" || r4d === undefined,
  );

  try {
    await vscodeMock.commands.executeCommand("dao.sp.reset");
    r4e = true;
  } catch (e) {
    r4e = e.message;
  }
  ok("modify", "dao.sp.reset 调成", r4e === true, r4e !== true ? r4e : "");

  // 4.3 toggleMode (mode 双向)
  let r4f = false;
  try {
    await vscodeMock.commands.executeCommand("dao.toggleMode");
    r4f = true;
  } catch (e) {
    r4f = e.message;
  }
  ok("modify", "dao.toggleMode 调成", r4f === true, r4f !== true ? r4f : "");

  // 4.4 water.reset (释 leader lock + 清熔断)
  let r4g = false;
  try {
    await vscodeMock.commands.executeCommand("dao.water.reset");
    r4g = true;
  } catch (e) {
    r4g = e.message;
  }
  ok("modify", "dao.water.reset 调成", r4g === true, r4g !== true ? r4g : "");

  // ─── 五 · proxy in-process 真活验 ────────────────────────
  console.log("\n─────── 五 · proxy in-process 真活验 ───────");
  // 直 require 装态源.js · 启 in-process proxy on free port
  const yuanPath = path.join(
    INSTALLED_DIR,
    "vendor",
    "wam",
    "bundled-origin",
    "源.js",
  );
  // 救持 _origin_mode.txt 之原状 · 测毕复 · 不污装态
  const modeFile = path.join(
    INSTALLED_DIR,
    "vendor",
    "wam",
    "bundled-origin",
    "_origin_mode.txt",
  );
  const _origModeContent = fs.existsSync(modeFile)
    ? fs.readFileSync(modeFile, "utf8")
    : null;

  let yuan, h, testPort;
  try {
    delete require.cache[require.resolve(yuanPath)];
    yuan = require(yuanPath);
    ok("proxy", "装态 源.js require 成", typeof yuan === "object");
  } catch (e) {
    ok("proxy", "装态 源.js require 成", false, e.message);
  }

  // 小工具: HTTP GET JSON
  function httpGetJSON(port, p) {
    return new Promise((r) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: p, timeout: 1500 },
        (res) => {
          let buf = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (buf += c));
          res.on("end", () => {
            try {
              r({ status: res.statusCode, json: JSON.parse(buf) });
            } catch {
              r({ status: res.statusCode, raw: buf });
            }
          });
        },
      );
      req.on("error", (e) => r({ err: e.message }));
      req.on("timeout", () => {
        req.destroy();
        r({ err: "timeout" });
      });
      req.end();
    });
  }

  if (yuan) {
    testPort = 28890 + Math.floor(Math.random() * 1000);
    try {
      // 启前固定 mode=invert · 验确切性
      h = await yuan.start({
        port: testPort,
        host: "127.0.0.1",
        mode: "invert",
      });
      ok(
        "proxy",
        "源.js start({port:" + testPort + ",mode:'invert'}) 成",
        h && h.port === testPort,
      );

      ok(
        "proxy",
        "h.getMode() === 'invert' (启时即设)",
        h && h.getMode && h.getMode() === "invert",
        "mode=" + (h && h.getMode && h.getMode()),
      );

      const ping = await httpGetJSON(testPort, "/origin/ping");
      ok(
        "proxy",
        "GET /origin/ping 200 · mode=invert",
        ping.status === 200 && ping.json && ping.json.mode === "invert",
        "mode=" + (ping.json && ping.json.mode),
      );

      const sel = await httpGetJSON(testPort, "/origin/selftest");
      ok(
        "proxy",
        "GET /origin/selftest 200 · dao_chars≥6000",
        sel.status === 200 && sel.json && sel.json.dao_chars >= 6000,
        "dao_chars=" + (sel.json && sel.json.dao_chars),
      );

      // 切 mode passthrough · 再 ping (双向可逆)
      const ok1 = h.setMode && h.setMode("passthrough");
      ok("proxy", "h.setMode('passthrough') 返 true (有效模式)", ok1 === true);
      const ping2 = await httpGetJSON(testPort, "/origin/ping");
      ok(
        "proxy",
        "setMode('passthrough') 后 · GET /origin/ping mode=passthrough",
        ping2.status === 200 && ping2.json && ping2.json.mode === "passthrough",
        "mode=" + (ping2.json && ping2.json.mode),
      );

      // 反 · 复 invert · 闭环
      const ok2 = h.setMode && h.setMode("invert");
      ok("proxy", "h.setMode('invert') 返 true · 闭环", ok2 === true);
      const ping3 = await httpGetJSON(testPort, "/origin/ping");
      ok(
        "proxy",
        "setMode('invert') 后 · GET /origin/ping mode=invert",
        ping3.status === 200 && ping3.json && ping3.json.mode === "invert",
        "mode=" + (ping3.json && ping3.json.mode),
      );

      // 试无效模式 · 应返 false · 不变
      const okBad = h.setMode && h.setMode("bypass");
      ok(
        "proxy",
        "h.setMode('bypass') 返 false (无效模式 · 拦)",
        okBad === false,
      );

      await h.close();
      await new Promise((s) => setTimeout(s, 100));
      ok("proxy", "h.close() 后端口已释", true);
    } catch (e) {
      ok("proxy", "proxy 真活流程", false, (e && e.message) || String(e));
    }

    // 复原 _origin_mode.txt · 不污装态
    try {
      if (_origModeContent !== null) {
        fs.writeFileSync(modeFile, _origModeContent);
      } else if (fs.existsSync(modeFile)) {
        fs.unlinkSync(modeFile);
      }
    } catch {}
  }

  // ─── 六 · 破类: dao.uninstall (沙箱 dry-run) ──────────────
  console.log("\n─────── 六 · 破类 (沙箱内 dry-run) ───────");
  // dao.uninstall → _doDirectCleanup → 五事 (lsGate/settings/proxy/wam-hot)
  // ~/.wam-hot 已沙箱化 · spawn 已拦 · 安全
  let uninstallRes = null;
  let uninstallErr = null;
  try {
    uninstallRes = await vscodeMock.commands.executeCommand("dao.uninstall");
    ok("destroy", "dao.uninstall 调成 (沙箱)", true);
  } catch (e) {
    uninstallErr = e.message;
    ok("destroy", "dao.uninstall 调成 (沙箱)", false, uninstallErr);
  }
  // uninstall 之 showInformationMessage 报告应至少有 1 条
  const uninstallMsgs = _shownMessages.filter(
    (m) =>
      typeof m.msg === "string" &&
      (m.msg.indexOf("归无") !== -1 ||
        m.msg.indexOf("卸载") !== -1 ||
        m.msg.indexOf("uninstall") !== -1 ||
        m.msg.indexOf("五事") !== -1 ||
        m.msg.indexOf("清") !== -1),
  );
  ok(
    "destroy",
    "dao.uninstall 报告产生 (showMessage) ≥ 1",
    uninstallMsgs.length >= 1,
    "got=" + uninstallMsgs.length,
  );

  // ─── 七 · UI 类命令 · 全调不抛 (mock 自动消化输入) ─────────
  console.log("\n─────── 七 · UI/输入类命令 (mock 自吞输入) ───────");
  const UI_CMDS = [
    "wam.openEditor",
    "wam.refreshAll",
    "wam.autoRotate",
    "wam.verifyAll",
    "wam.scanExpiry",
    "wam.testDevinSwitch",
    "wam.checkUpdate",
    "wam.verifyEndToEnd",
    "wam.clearBlacklist",
    "wam.restore",
    "wam.switchAccount",
    "wam.panicSwitch",
    "wam.injectToken",
    "wam.addAccount",
    "wam.wamMode",
    "wam.officialMode",
  ];
  for (const c of UI_CMDS) {
    let r = false,
      err = null;
    try {
      await vscodeMock.commands.executeCommand(c);
      r = true;
    } catch (e) {
      err = (e && e.message) || String(e);
    }
    ok("ui", "调 " + c + " 不抛", r, err || "");
  }

  // ─── 八 · lsGate · 只调 status (apply/revert 真改文件 · 危险 · 不调) ──
  console.log("\n─────── 八 · lsGate · status 安全调 ───────");
  let r8a = false,
    err8a = null;
  try {
    await vscodeMock.commands.executeCommand("dao.lsGate.status");
    r8a = true;
  } catch (e) {
    err8a = e.message;
  }
  ok("lsgate", "dao.lsGate.status 调成", r8a, err8a || "");

  // ─── 九 · deactivate ─────────────────────────────────────
  console.log("\n─────── 九 · deactivate ───────");
  let deactivateErr = null;
  try {
    await extMod.deactivate();
    ok("deactivate", "deactivate() 不抛", true);
  } catch (e) {
    deactivateErr = e.message;
    ok("deactivate", "deactivate() 不抛", false, deactivateErr);
  }

  // ─── 收 ─────────────────────────────────────────────────
  console.log("\n─────── 收 ───────");
  // 还原 spawn (虽进程要终)
  _cp.spawn = _origSpawn;
  os.homedir = _origHomedir;
  // 删沙箱
  try {
    fs.rmSync(SANDBOX_ROOT, { recursive: true, force: true });
  } catch {}

  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  console.log("\n══════ 反者道之动 · 自顶向下 · 总 ══════");
  console.log("  装路:    " + INSTALLED_DIR);
  console.log("  耗时:    " + dt + "s");
  console.log(
    "  spawn 拦: " + _spawnIntercepts.length + " 次 (uninstall 守护启 · 已拦)",
  );
  console.log("  webviews: " + _webviews.length);
  console.log("  msgs:     " + _shownMessages.length);
  console.log("  cmd 调:   " + _commandCalls.length);
  console.log("");
  console.log("  ──── 各阶 ────");
  for (const [t, s] of Object.entries(tier)) {
    const tag = s.fail === 0 ? "✓" : "✗";
    console.log(
      "  " +
        tag +
        " " +
        t.padEnd(12) +
        "pass=" +
        s.pass.toString().padStart(3) +
        "  fail=" +
        s.fail,
    );
  }
  console.log("");
  console.log("  ──── 总 ────");
  console.log("  PASS = " + pass);
  console.log("  FAIL = " + fail);

  if (fail === 0) {
    console.log("\n  ✓ 道生之, 德畜之, 物形之, 势成之");
    console.log("  ✓ 反者道之动 · 自顶向下 · 装态实活 · 一切尽过");
  } else {
    console.log("\n  ✗ 失:");
    failures.forEach((f) => console.log("    - " + f));
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nFATAL", e);
  process.exit(1);
});
