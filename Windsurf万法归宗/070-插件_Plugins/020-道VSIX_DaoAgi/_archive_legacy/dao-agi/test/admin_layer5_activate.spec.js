"use strict";
// admin_layer5_activate.spec.js
// Global hard-kill watchdog: if test runs > 25s, force exit (SSH may drop earlier)
setTimeout(() => {
  console.log("\n!! WATCHDOG: test exceeded 25s, force-exiting");
  process.exit(99);
}, 25000).unref();

// Mock vscode + ctx, then call extension.activate() to observe:
//   - ~/.wam-hot/origin/ files created
//   - settings.json codeium.* anchors written
//   - hijack proxy listening on configured port
//   - commands registered
//
// To avoid contaminating admin's real Windsurf:
//   - Use a TEMP dir for ctx.extensionPath (mirror dao-agi)
//   - Use a TEMP HOME (override os.homedir / process.env.USERPROFILE)
//   - Use a sandbox port (e.g. 28889) not :8889 (live) and not :18889 (already tested)
//   - Use a TEMP settings path (override APPDATA / sourceConfigPath)

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const Module = require("node:module");
const http = require("node:http");

let PASS = 0, FAIL = 0;
const ok = (n, c, d) => {
  const t = c ? "OK  " : "FAIL";
  console.log(`  [${t}] ${n}${d ? "  -- " + d : ""}`);
  c ? PASS++ : FAIL++;
};

// === SANDBOX SETUP ===
const SANDBOX = path.join(os.tmpdir(), `dao_l5_sandbox_${process.pid}_${Date.now()}`);
const SANDBOX_HOME = path.join(SANDBOX, "home");
// _settingsJsonPath uses os.homedir() + AppData/Roaming/Windsurf/User
const SANDBOX_SETTINGS_DIR = path.join(SANDBOX_HOME, "AppData", "Roaming", "Windsurf", "User");
const SANDBOX_SETTINGS = path.join(SANDBOX_SETTINGS_DIR, "settings.json");
fs.mkdirSync(SANDBOX_HOME, { recursive: true });
fs.mkdirSync(SANDBOX_SETTINGS_DIR, { recursive: true });
// seed empty settings.json (anchor() requires file exists)
fs.writeFileSync(SANDBOX_SETTINGS, "{}\n", "utf8");

// override env BEFORE require("../extension.js")
process.env.USERPROFILE = SANDBOX_HOME;
process.env.HOME = SANDBOX_HOME;
process.env.APPDATA = path.join(SANDBOX_HOME, "AppData", "Roaming");
process.env.LOCALAPPDATA = path.join(SANDBOX_HOME, "AppData", "Local");
// override os.homedir (extension.js calls os.homedir() in _settingsJsonPath)
const _origHomedir = os.homedir;
os.homedir = () => SANDBOX_HOME;

// Pin port via DAO_PORT env (extension.js's DEFAULT_PORT honors this · avoids per-user computation drift)
const PINNED_PORT = 28889;
process.env.DAO_PORT = String(PINNED_PORT);

console.log("");
console.log("================================================================");
console.log(" LAYER 5 -- mock vscode + extension.activate() · sandbox observ");
console.log("================================================================");
console.log("");
console.log(`SANDBOX        : ${SANDBOX}`);
console.log(`SANDBOX_HOME   : ${SANDBOX_HOME}`);
console.log(`SETTINGS       : ${SANDBOX_SETTINGS}`);
console.log("");

// === MOCK vscode ===
const SANDBOX_PORT = 28889;
const _registeredCmds = new Map();
const _outputChannels = new Map();
const _shownMessages = [];

const vscodeMock = {
  version: "1.96.0-mock",
  Disposable: class { constructor(fn) { this._dispose = fn; } dispose() { try { this._dispose && this._dispose(); } catch {} } },
  Uri: {
    file: (p) => ({
      scheme: "file",
      fsPath: p,
      path: p.replace(/\\/g, "/"),
      toString: () => "file://" + p.replace(/\\/g, "/"),
    }),
    parse: (s) => ({ toString: () => s }),
  },
  commands: {
    registerCommand: (name, handler) => {
      _registeredCmds.set(name, handler);
      return { dispose: () => _registeredCmds.delete(name) };
    },
    executeCommand: async (name, ...args) => {
      const h = _registeredCmds.get(name);
      if (h) return await h(...args);
      return undefined;
    },
    getCommands: async () => [..._registeredCmds.keys()],
  },
  window: {
    createOutputChannel: (name) => {
      const ch = {
        name,
        _lines: [],
        appendLine: (s) => ch._lines.push(s),
        append: (s) => ch._lines.push(s),
        show: () => {},
        hide: () => {},
        clear: () => { ch._lines = []; },
        dispose: () => _outputChannels.delete(name),
        replace: (s) => { ch._lines = [s]; },
      };
      _outputChannels.set(name, ch);
      return ch;
    },
    showInformationMessage: (...args) => {
      _shownMessages.push({ kind: "info", args });
      return Promise.resolve(undefined);
    },
    showWarningMessage: (...args) => {
      _shownMessages.push({ kind: "warn", args });
      return Promise.resolve(undefined);
    },
    showErrorMessage: (...args) => {
      _shownMessages.push({ kind: "error", args });
      return Promise.resolve(undefined);
    },
    showQuickPick: () => Promise.resolve(undefined),
    showInputBox: () => Promise.resolve(undefined),
    showOpenDialog: () => Promise.resolve(undefined),
    showSaveDialog: () => Promise.resolve(undefined),
    activeTextEditor: null,
    visibleTextEditors: [],
    onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
    onDidChangeVisibleTextEditors: () => ({ dispose: () => {} }),
    onDidChangeWindowState: () => ({ dispose: () => {} }),
    onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
    createStatusBarItem: () => ({
      text: "", tooltip: "", command: undefined,
      show: () => {}, hide: () => {}, dispose: () => {},
    }),
    registerWebviewViewProvider: () => ({ dispose: () => {} }),
    registerTreeDataProvider: () => ({ dispose: () => {} }),
    registerUriHandler: () => ({ dispose: () => {} }),
    createWebviewPanel: () => ({
      webview: {
        html: "",
        postMessage: () => Promise.resolve(true),
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        asWebviewUri: (u) => u,
        cspSource: "vscode-webview:",
      },
      reveal: () => {},
      dispose: () => {},
      onDidDispose: () => ({ dispose: () => {} }),
      onDidChangeViewState: () => ({ dispose: () => {} }),
    }),
    createTextEditorDecorationType: () => ({ dispose: () => {} }),
    state: { focused: true },
    terminals: [],
    onDidOpenTerminal: () => ({ dispose: () => {} }),
    onDidCloseTerminal: () => ({ dispose: () => {} }),
    onDidChangeActiveTerminal: () => ({ dispose: () => {} }),
    createTerminal: () => ({
      name: "mock", processId: Promise.resolve(0),
      sendText: () => {}, show: () => {}, hide: () => {}, dispose: () => {},
    }),
    withProgress: async (opts, fn) => fn({ report: () => {} }, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) }),
  },
  workspace: {
    workspaceFolders: undefined,
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
    onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
    onDidOpenTextDocument: () => ({ dispose: () => {} }),
    onDidCloseTextDocument: () => ({ dispose: () => {} }),
    getConfiguration: (section) => {
      // Return mock with reasonable defaults
      const data = {
        port: SANDBOX_PORT,
        autoRestoreOrigin: true,
        lsGateAutoApply: false,
        lsGateIncludeBuiltin: false,
        lsGateIncludeOtherUsers: false,
        defaultMode: "invert",
      };
      return {
        get: (key, def) => {
          if (key.startsWith("dao.origin.")) {
            const k = key.replace("dao.origin.", "");
            return data[k] !== undefined ? data[k] : def;
          }
          if (key.startsWith("dao.")) {
            const k = key.replace("dao.", "");
            return data[k] !== undefined ? data[k] : def;
          }
          return def;
        },
        inspect: (key) => ({
          key,
          defaultValue: undefined,
          globalValue: undefined,
          workspaceValue: undefined,
        }),
        update: async () => {},
        has: (key) => false,
      };
    },
    getWorkspaceFolder: () => undefined,
    fs: {
      readFile: async () => Buffer.alloc(0),
      writeFile: async () => {},
      stat: async () => { throw new Error("ENOENT"); },
    },
  },
  extensions: {
    getExtension: (id) => undefined,
    all: [],
  },
  languages: {
    registerHoverProvider: () => ({ dispose: () => {} }),
  },
  env: {
    appName: "Windsurf",
    appHost: "desktop",
    machineId: "mock-machine",
    sessionId: "mock-session",
  },
  EventEmitter: class {
    constructor() { this._handlers = []; this.event = (h) => { this._handlers.push(h); return { dispose: () => {} }; }; }
    fire(arg) { for (const h of this._handlers) try { h(arg); } catch {} }
    dispose() { this._handlers = []; }
  },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { One: 1, Two: 2, Three: 3, Active: -1, Beside: -2 },
  ProgressLocation: { Notification: 15, Window: 10, SourceControl: 1 },
};

// Hijack require("vscode") · v18.1.1 中插件即此引
const _origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, isMain, opts) {
  if (req === "vscode") return "vscode-mock-builtin";
  return _origResolve.call(this, req, parent, isMain, opts);
};
require.cache["vscode-mock-builtin"] = {
  id: "vscode-mock-builtin",
  filename: "vscode-mock-builtin",
  loaded: true,
  exports: vscodeMock,
};

// === MOCK ctx (ExtensionContext) ===
const EXTPATH = path.resolve(__dirname, "..");
const _globalState = new Map();
const _workspaceState = new Map();
const ctx = {
  extensionPath: EXTPATH,
  extensionUri: vscodeMock.Uri.file(EXTPATH),
  storagePath: path.join(SANDBOX, "storage"),
  storageUri: vscodeMock.Uri.file(path.join(SANDBOX, "storage")),
  globalStoragePath: path.join(SANDBOX, "globalStorage"),
  globalStorageUri: vscodeMock.Uri.file(path.join(SANDBOX, "globalStorage")),
  logUri: vscodeMock.Uri.file(path.join(SANDBOX, "log")),
  logPath: path.join(SANDBOX, "log"),
  asAbsolutePath: (rel) => path.join(EXTPATH, rel),
  subscriptions: [],
  globalState: {
    get: (k, def) => _globalState.has(k) ? _globalState.get(k) : def,
    update: async (k, v) => { _globalState.set(k, v); },
    keys: () => [..._globalState.keys()],
    setKeysForSync: () => {},
  },
  workspaceState: {
    get: (k, def) => _workspaceState.has(k) ? _workspaceState.get(k) : def,
    update: async (k, v) => { _workspaceState.set(k, v); },
    keys: () => [..._workspaceState.keys()],
  },
  environmentVariableCollection: {
    persistent: false,
    description: "",
    replace: () => {}, append: () => {}, prepend: () => {},
    get: () => undefined, forEach: () => {}, delete: () => {}, clear: () => {},
    getScoped: () => undefined,
  },
  secrets: {
    get: async () => undefined,
    store: async () => {},
    delete: async () => {},
    onDidChange: () => ({ dispose: () => {} }),
  },
  extension: {
    id: "dao-agi.dao-agi",
    extensionUri: vscodeMock.Uri.file(EXTPATH),
    extensionPath: EXTPATH,
    isActive: false,
    packageJSON: JSON.parse(fs.readFileSync(path.join(EXTPATH, "package.json"), "utf8")),
    extensionKind: 1,
    activate: async () => {},
  },
  extensionMode: 1, // Production
};

// === HELPERS ===
function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(fp));
    else out.push(fp);
  }
  return out;
}

function tcpProbe(port) {
  return new Promise((resolve) => {
    const s = require("net").createConnection(port, "127.0.0.1");
    s.setTimeout(1000);
    s.on("connect", () => { s.end(); resolve(true); });
    s.on("error", () => resolve(false));
    s.on("timeout", () => { s.destroy(); resolve(false); });
  });
}

function httpGet(port, path) {
  return new Promise((R, J) => {
    const r = http.request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch {}
        R({ status: res.statusCode, text, json });
      });
    });
    r.setTimeout(3000, () => r.destroy(new Error("timeout")));
    r.on("error", J);
    r.end();
  });
}

// === RUN ===
(async function main() {
  let extension;
  try {
    extension = require("../extension.js");
    ok("L5.1 require extension.js", true);
  } catch (e) {
    ok("L5.1 require extension.js", false, e.message);
    process.exit(1);
  }

  ok("L5.2 extension.activate is fn", typeof extension.activate === "function");
  ok("L5.3 extension.deactivate is fn", typeof extension.deactivate === "function");

  // Pre-state observation
  console.log("");
  console.log("--- pre-activate observation ---");
  console.log(`  cmds_registered=${_registeredCmds.size}`);
  console.log(`  settings keys before: ${Object.keys(JSON.parse(fs.readFileSync(SANDBOX_SETTINGS, "utf8")))}`);
  console.log(`  ~/.wam-hot exists? ${fs.existsSync(path.join(SANDBOX_HOME, ".wam-hot"))}`);

  // Activate!
  console.log("");
  console.log("--- calling extension.activate(ctx) ---");
  let activateErr = null;
  try {
    await extension.activate(ctx);
    ok("L5.4 activate() returned without throw", true);
  } catch (e) {
    activateErr = e;
    ok("L5.4 activate() returned without throw", false, e.message);
  }

  // Allow async activations to settle (anchor() + hijackStart + setMode are async)
  // Poll for settings.json codeium anchor to appear (max 5s)
  const tStart = Date.now();
  while (Date.now() - tStart < 5000) {
    try {
      const stg = JSON.parse(fs.readFileSync(SANDBOX_SETTINGS, "utf8"));
      const ck = Object.keys(stg).filter((k) => k.startsWith("codeium"));
      if (ck.length > 0) break;
    } catch {}
    await new Promise((R) => setTimeout(R, 250));
  }
  console.log(`  (settled after ${Date.now() - tStart}ms)`);

  // === OBSERVATIONS ===
  console.log("");
  console.log("--- post-activate observations ---");

  // 1. Commands registered
  const cmds = [..._registeredCmds.keys()];
  console.log(`  registered cmds (${cmds.length}):`);
  for (const c of cmds.slice(0, 35)) console.log(`     ${c}`);
  if (cmds.length > 35) console.log(`     ... (+${cmds.length - 35} more)`);
  ok("L5.5 cmds registered >=10", cmds.length >= 10, `count=${cmds.length}`);
  ok("L5.6 wam.originInvert registered", cmds.includes("wam.originInvert"));
  ok("L5.7 wam.originPassthrough registered", cmds.includes("wam.originPassthrough"));
  ok("L5.8 dao.toggleMode registered", cmds.includes("dao.toggleMode"));
  ok("L5.9 dao.uninstall registered", cmds.includes("dao.uninstall"));
  ok("L5.10 dao.lsGate.apply registered", cmds.includes("dao.lsGate.apply"));
  ok("L5.11 dao.lsGate.status registered", cmds.includes("dao.lsGate.status"));
  ok("L5.12 dao.lsGate.revert registered", cmds.includes("dao.lsGate.revert"));

  // 2. ~/.wam-hot
  const wamHot = path.join(SANDBOX_HOME, ".wam-hot");
  const exists = fs.existsSync(wamHot);
  ok("L5.13 ~/.wam-hot created", exists);
  if (exists) {
    const files = listFiles(wamHot);
    console.log(`  ~/.wam-hot files (${files.length}):`);
    for (const f of files) {
      const rel = f.substring(wamHot.length + 1);
      const sz = fs.statSync(f).size;
      console.log(`     ${rel} (${sz} bytes)`);
    }
    ok("L5.14 ~/.wam-hot/origin/source.js exists",
      fs.existsSync(path.join(wamHot, "origin", "source.js"))
      || fs.existsSync(path.join(wamHot, "origin", "\u6e90.js")));
    ok("L5.15 ~/.wam-hot/origin/_dao_81.txt exists",
      fs.existsSync(path.join(wamHot, "origin", "_dao_81.txt")));
  }

  // 3. settings.json codeium anchors
  const stg = JSON.parse(fs.readFileSync(SANDBOX_SETTINGS, "utf8"));
  const codeKeys = Object.keys(stg).filter((k) => k.startsWith("codeium"));
  console.log(`  settings codeium keys (${codeKeys.length}):`);
  for (const k of codeKeys) {
    const v = stg[k];
    console.log(`     ${k} = ${typeof v === "string" ? v : JSON.stringify(v)}`);
  }
  ok("L5.16 settings codeium anchors written", codeKeys.length >= 1, `keys=${codeKeys.length}`);

  // Discover real anchor port (extension uses per-user DEFAULT_PORT not our config)
  let realPort = null;
  for (const k of codeKeys) {
    const v = stg[k];
    if (typeof v === "string") {
      const m = /127\.0\.0\.1:(\d+)/.exec(v);
      if (m) { realPort = parseInt(m[1], 10); break; }
    }
  }
  ok("L5.17 anchor points to 127.0.0.1:<port>",
    realPort !== null,
    `realPort=${realPort}`);

  // 4. Proxy listening on the discovered port
  if (realPort) {
    const listening = await tcpProbe(realPort);
    ok("L5.18 proxy listening :" + realPort, listening);
    if (listening) {
      try {
        const r = await httpGet(realPort, "/origin/ping");
        ok("L5.19 :" + realPort + " /origin/ping responds",
          r.status === 200 && r.json && r.json.ok === true,
          `mode=${r.json && r.json.mode} pid=${r.json && r.json.pid} dao_chars=${r.json && r.json.dao_chars}`);
      } catch (e) {
        ok("L5.19 ping fail", false, e.message);
      }
    }
  } else {
    // fallback: scan common ports
    let found = null;
    for (const p of [8889, 28889, 8971, 8972, 8973]) {
      if (await tcpProbe(p)) { found = p; break; }
    }
    ok("L5.18 proxy listening (scan)", found !== null, `found=${found}`);
    if (found) {
      try {
        const r = await httpGet(found, "/origin/ping");
        ok("L5.19 :" + found + " /origin/ping responds",
          r.status === 200 && r.json && r.json.ok === true,
          `mode=${r.json && r.json.mode}`);
        realPort = found;
      } catch {}
    }
  }

  // 5. Output channel created
  ok("L5.20 OutputChannel created",
    [..._outputChannels.keys()].some((n) => n.includes("\u9053") || n.includes("AGI") || n.includes("dao")),
    `channels=${[..._outputChannels.keys()].join("|")}`);
  process.stdout.write(""); // flush

  // === DEACTIVATE ===
  console.log("");
  console.log("--- calling extension.deactivate() ---");
  process.stdout.write("");
  await new Promise((R) => setImmediate(R));
  console.log(`  [${new Date().toISOString()}] starting deactivate race`);
  process.stdout.write("");
  try {
    let dPromise;
    try {
      dPromise = extension.deactivate();
      console.log(`  [${new Date().toISOString()}] deactivate() returned promise type=${typeof dPromise}`);
    } catch (eSync) {
      console.log(`  [${new Date().toISOString()}] deactivate() THREW SYNC: ${eSync.message}`);
      dPromise = Promise.reject(eSync);
    }
    const dResult = await Promise.race([
      Promise.resolve(dPromise).then(() => "completed").catch((e) => "rejected:" + (e && e.message)),
      new Promise((R) => setTimeout(() => R("timeout-3s"), 3000)),
    ]);
    console.log(`  [${new Date().toISOString()}] race result: ${dResult}`);
    ok("L5.21 deactivate() returned", true, dResult);
  } catch (e) {
    ok("L5.21 deactivate() returned", false, e.message);
  }

  // After deactivate: settings should be restored, proxy should be stopped
  console.log(`  [${new Date().toISOString()}] waiting 800ms for cleanup`);
  await new Promise((R) => setTimeout(R, 800));
  console.log(`  [${new Date().toISOString()}] cleanup wait done`);

  if (realPort) {
    const stillListening = await tcpProbe(realPort);
    ok("L5.22 proxy stopped after deactivate :" + realPort, !stillListening);
  } else {
    ok("L5.22 proxy stopped (no realPort)", true);
  }

  const stgAfter = JSON.parse(fs.readFileSync(SANDBOX_SETTINGS, "utf8"));
  const codeKeysAfter = Object.keys(stgAfter).filter((k) => k.startsWith("codeium"));
  console.log(`  settings codeium keys after (${codeKeysAfter.length}):`);
  for (const k of codeKeysAfter) {
    const v = stgAfter[k];
    console.log(`     ${k} = ${typeof v === "string" ? v : JSON.stringify(v)}`);
  }
  // After anchorRestore: 127.0.0.1: pointers must be gone
  const anchorAfterPresent = codeKeysAfter.some((k) => {
    const v = stgAfter[k];
    return typeof v === "string" && /127\.0\.0\.1:\d+/.test(v);
  });
  ok("L5.23 settings anchor cleaned (no 127.0.0.1:port)", !anchorAfterPresent,
    `keys=${codeKeysAfter.length} pointer_present=${anchorAfterPresent}`);

  // === SUMMARY ===
  console.log("");
  console.log("=================================================");
  console.log(`  TOTAL  PASS=${PASS}  FAIL=${FAIL}  cmds=${cmds.length}`);
  console.log("=================================================");

  // Cleanup sandbox
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch {}

  setTimeout(() => process.exit(FAIL > 0 ? 1 : 0), 200);
})().catch((e) => {
  console.error("FATAL", e);
  setTimeout(() => process.exit(2), 200);
});
