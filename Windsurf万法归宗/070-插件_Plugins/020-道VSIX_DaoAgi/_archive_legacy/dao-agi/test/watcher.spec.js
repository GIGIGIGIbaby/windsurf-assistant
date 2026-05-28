// _test_v181_watcher.js — DaoWatcher + EssenceProvider 集成测 · 道法自然
// 验: (1) DaoWatcher EventEmitter 行为 (2) EssenceProvider bind watcher (3) 事件驱动刷新
"use strict";

// Stub vscode · 提供 EventEmitter-ready API
const Module = require("node:module");
const _origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === "vscode") return req;
  return _origResolve.call(this, req, ...rest);
};

// 模拟工作区 + 编辑器 · 事件注册器收集回调供测试触发
const evtCallbacks = {};
function mkDisposableRegistrar(key) {
  return (cb) => {
    (evtCallbacks[key] = evtCallbacks[key] || []).push(cb);
    return { dispose() {} };
  };
}
function mkFsWatcher() {
  const w = {
    _onChange: [],
    _onCreate: [],
    _onDelete: [],
    onDidChange(cb) {
      w._onChange.push(cb);
      return { dispose() {} };
    },
    onDidCreate(cb) {
      w._onCreate.push(cb);
      return { dispose() {} };
    },
    onDidDelete(cb) {
      w._onDelete.push(cb);
      return { dispose() {} };
    },
    dispose() {},
  };
  (evtCallbacks.fsWatchers = evtCallbacks.fsWatchers || []).push(w);
  return w;
}

require.cache["vscode"] = {
  id: "vscode",
  filename: "vscode",
  loaded: true,
  exports: {
    workspace: {
      getConfiguration: () => ({ get: (_k, d) => d }),
      workspaceFolders: [
        { uri: { fsPath: "E:/fake/ws", scheme: "file" }, name: "ws", index: 0 },
      ],
      textDocuments: [],
      createFileSystemWatcher: mkFsWatcher,
      onDidChangeConfiguration: mkDisposableRegistrar("cfg"),
      onDidOpenTextDocument: mkDisposableRegistrar("open"),
      onDidCloseTextDocument: mkDisposableRegistrar("close"),
      onDidChangeWorkspaceFolders: mkDisposableRegistrar("wsFolders"),
      asRelativePath: (u) => (u && u.fsPath) || String(u),
    },
    window: {
      activeTextEditor: null,
      visibleTextEditors: [],
      onDidChangeActiveTextEditor: mkDisposableRegistrar("activeEd"),
      onDidChangeTextEditorSelection: mkDisposableRegistrar("selection"),
      onDidChangeVisibleTextEditors: mkDisposableRegistrar("visibleEd"),
      createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
      showTextDocument: async () => {},
    },
    commands: {
      registerCommand: () => ({ dispose() {} }),
      executeCommand: async () => {},
    },
    RelativePattern: function (base, pattern) {
      this.base = base;
      this.pattern = pattern;
    },
    Uri: { file: (p) => ({ fsPath: p, scheme: "file" }) },
  },
};

const { DaoWatcher } = require("../watcher");
const { EssenceProvider } = require("../essence");

let pass = 0,
  fail = 0;
function ok(l) {
  pass++;
  console.log("  \u2713 " + l);
}
function ng(l, d) {
  fail++;
  console.log("  \u2717 " + l + (d ? " — " + d : ""));
}
function chk(c, l, d) {
  c ? ok(l) : ng(l, d);
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(
    "\n\u2550\u2550\u2550 v18.1 watcher + provider \u2550\u2550\u2550 " +
      new Date().toLocaleString(),
  );

  // P1: DaoWatcher.start · 注册观察者
  console.log("\nP1: DaoWatcher start/stop");
  const w = new DaoWatcher();
  chk(w._started === false, "initial _started=false");
  w.start();
  chk(w._started === true, "_started=true after start");
  chk(
    evtCallbacks.fsWatchers && evtCallbacks.fsWatchers.length >= 5,
    "fsWatchers >= 5 (rules/agents/agents2/workflows/skills)",
  );
  chk(evtCallbacks.cfg && evtCallbacks.cfg.length === 1, "config listener reg");
  chk(
    evtCallbacks.activeEd && evtCallbacks.activeEd.length === 1,
    "activeEditor listener reg",
  );

  // 幂等 · 重入无害
  w.start();
  chk(w._started === true, "idempotent: 2nd start no throw");

  // P2: IDE state snapshot
  console.log("\nP2: getIdeState");
  const ide = w.getIdeState();
  chk(typeof ide === "object", "returns object");
  chk("activeFile" in ide, "has activeFile");
  chk("workspaceFolders" in ide, "has workspaceFolders");
  chk(Array.isArray(ide.workspaceFolders), "workspaceFolders is array");

  // P3: 事件触发 · change 发 (file watcher)
  console.log("\nP3: file change → 'change' event");
  let changeCount = 0;
  let pollCount = 0;
  w.on("change", () => changeCount++);
  w.on("poll", () => pollCount++);
  // 触发文件变更 · 模拟 rules 目录下文件修改
  const fw0 = evtCallbacks.fsWatchers[0];
  fw0._onChange.forEach((cb) =>
    cb({ fsPath: "E:/fake/ws/.windsurf/rules/x.md" }),
  );
  chk(
    w.getChangeLog().length >= 1,
    "changeLog push after file event · got " + w.getChangeLog().length,
  );
  await wait(400); // debounce
  chk(changeCount >= 1, "'change' event emitted · got " + changeCount);

  // P4: config change → 'change' event
  console.log("\nP4: config change → 'change' event");
  const prevCount = changeCount;
  const cfgCb = evtCallbacks.cfg[0];
  cfgCb({ affectsConfiguration: (s) => s === "dao" });
  await wait(400);
  chk(
    changeCount > prevCount,
    "'change' emitted on config (dao) · delta=" + (changeCount - prevCount),
  );

  // P5: config change on unrelated section → no emit
  console.log("\nP5: unrelated config → no change");
  const prev2 = changeCount;
  cfgCb({ affectsConfiguration: (s) => s === "unrelated.foo" });
  await wait(400);
  chk(
    changeCount === prev2,
    "unrelated cfg ignored · got delta=" + (changeCount - prev2),
  );

  // P6: setSnapshot detects drift · 首次 null→值 == 变化 · 但不推 log (无噪)
  console.log("\nP6: setSnapshot drift");
  w._lastSnapshot = null; // reset
  const clBefore = w.getChangeLog().length;
  const changed1 = w.setSnapshot({ rules: "a", mcp: "b" });
  chk(
    changed1 === true,
    "first snapshot: null→hash returns true (drift) · got " + changed1,
  );
  chk(
    w.getChangeLog().length === clBefore,
    "first snapshot: no log push (无噪)",
  );
  const changed2 = w.setSnapshot({ rules: "a", mcp: "b" });
  chk(changed2 === false, "same snapshot not changed");
  const clBefore2 = w.getChangeLog().length;
  const changed3 = w.setSnapshot({ rules: "A", mcp: "b" }); // different
  chk(changed3 === true, "different snapshot flagged");
  chk(w.getChangeLog().length > clBefore2, "real drift → log pushed");

  // P7: EssenceProvider binds watcher · verify on/off listener counts
  console.log("\nP7: EssenceProvider binds watcher");
  const provider = new EssenceProvider({}, { watcher: w, pollMs: 60000 });
  chk(w.listenerCount("change") >= 1, "provider subscribed 'change'");
  chk(w.listenerCount("poll") >= 1, "provider subscribed 'poll'");
  provider.dispose();
  // listenerCount should drop by our bound pair
  // (other test listeners may still be attached · just verify decrease)

  // P8: stop
  console.log("\nP8: DaoWatcher stop");
  w.stop();
  chk(w._started === false, "_started=false after stop");

  // Summary
  console.log("\n" + "\u2550".repeat(40));
  console.log("  PASS=" + pass + "  FAIL=" + fail + "  TOTAL=" + (pass + fail));
  console.log(
    "  " +
      (fail === 0
        ? "ALL PASS \u00b7 \u4e8b\u4ef6\u9a71\u52a8\u5b9e\u65f6 \u00b7 \u9053\u6cd5\u81ea\u7136"
        : "FAILURES"),
  );
  console.log("\u2550".repeat(40));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
