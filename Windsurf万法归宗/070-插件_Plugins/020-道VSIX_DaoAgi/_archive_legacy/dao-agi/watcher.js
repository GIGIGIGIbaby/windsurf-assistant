// watcher.js — 道Agent · 实时观照 · 兵无常势 · 水无常形
//
// 能因敌变化而取胜者，谓之神。
// 天下万物生于有，有生于无。反者道之动，弱者道之用。
//
// 事件驱动架构 · 监视一切注入源:
//   L1 FileSystemWatcher: .windsurf/rules/ · AGENTS.md · MCP configs
//   L2 Configuration:     VS Code settings 变更
//   L3 Editor:            活动编辑器 · 打开文件 · 光标位置
//   L4 LS Polling:        自适应轮询 (事件触发时加速 · 无事时减速)
//   L5 Workspace:         工作区文件夹变更
//
// EventEmitter: 一切变化 → 'change' 事件 → essence 即刷
"use strict";

const vscode = require("vscode");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

// ═══════════════════════ 常 · 无为而无不为 ═══════════════════════

const DEBOUNCE_MS = 300; // 防抖 · 合并密集事件
const FAST_POLL_MS = 2000; // 事件触发后加速轮询
const SLOW_POLL_MS = 10000; // 无事时慢轮询
const FAST_WINDOW_MS = 15000; // 快轮询持续窗口
const HASH_TRUNCATE = 16; // fingerprint 截断

// ═══════════════════════ DaoWatcher · 万物并作 · 吾以观复 ═══════════════════════

class DaoWatcher extends EventEmitter {
  constructor() {
    super();
    this._disposables = [];
    this._debounceTimer = null;
    this._pollTimer = null;
    this._lastEventTs = 0;
    this._lastSnapshot = null;
    this._changeLog = []; // 最近变更记录
    this._maxChangeLog = 50;
    this._started = false;
    this._ideState = {
      activeFile: null,
      activeLanguage: null,
      activeLine: 0,
      activeColumn: 0,
      openFiles: [],
      visibleEditors: [],
      workspaceFolders: [],
      ts: 0,
    };
  }

  // ─── 启 · 万物作焉而不辞 ───

  start() {
    if (this._started) return;
    this._started = true;

    // L1: FileSystem watchers
    this._watchFiles();

    // L2: Configuration changes
    this._watchConfig();

    // L3: Editor state
    this._watchEditor();

    // L5: Workspace folders
    this._watchWorkspace();

    // Initial IDE state capture
    this._captureIdeState();

    // Start adaptive polling
    this._armPoll();
  }

  // ─── 止 · 功成身退 ───

  stop() {
    this._started = false;
    for (const d of this._disposables) {
      try {
        d.dispose();
      } catch {}
    }
    this._disposables = [];
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    this.removeAllListeners();
  }

  // ─── 取 IDE 元信息 · 以神遇而不以目视 ───

  getIdeState() {
    this._captureIdeState();
    return { ...this._ideState };
  }

  // ─── 取变更日志 · 观复知常 ───

  getChangeLog() {
    return [...this._changeLog];
  }

  // ─── 取上次快照哈希 ───

  getLastHash() {
    return this._lastSnapshot;
  }

  // ─── 设快照 (由 essence 调用 · 用于 diff) ───

  setSnapshot(data) {
    const hash = _fingerprint(data);
    const changed = this._lastSnapshot !== hash;
    if (changed && this._lastSnapshot) {
      this._pushChange("data", "LS 数据变化", {
        prev: this._lastSnapshot,
        curr: hash,
      });
    }
    this._lastSnapshot = hash;
    return changed;
  }

  // ═══════════════════════ L1: 文件观 ═══════════════════════

  _watchFiles() {
    const wsBase = vscode.workspace.workspaceFolders?.[0];
    // .windsurf/rules/**
    const rulesWatcher = vscode.workspace.createFileSystemWatcher(
      wsBase
        ? new vscode.RelativePattern(wsBase, ".windsurf/rules/**")
        : ".windsurf/rules/**",
    );
    rulesWatcher.onDidChange((uri) =>
      this._onFileChange("rules", "modify", uri),
    );
    rulesWatcher.onDidCreate((uri) =>
      this._onFileChange("rules", "create", uri),
    );
    rulesWatcher.onDidDelete((uri) =>
      this._onFileChange("rules", "delete", uri),
    );
    this._disposables.push(rulesWatcher);

    // **/AGENTS.md
    const agentsWatcher =
      vscode.workspace.createFileSystemWatcher("**/AGENTS.md");
    agentsWatcher.onDidChange((uri) =>
      this._onFileChange("agents_md", "modify", uri),
    );
    agentsWatcher.onDidCreate((uri) =>
      this._onFileChange("agents_md", "create", uri),
    );
    agentsWatcher.onDidDelete((uri) =>
      this._onFileChange("agents_md", "delete", uri),
    );
    this._disposables.push(agentsWatcher);

    // **/_AGENTS.md (underscore prefixed)
    const agentsWatcher2 =
      vscode.workspace.createFileSystemWatcher("**/_AGENTS.md");
    agentsWatcher2.onDidChange((uri) =>
      this._onFileChange("agents_md", "modify", uri),
    );
    agentsWatcher2.onDidCreate((uri) =>
      this._onFileChange("agents_md", "create", uri),
    );
    agentsWatcher2.onDidDelete((uri) =>
      this._onFileChange("agents_md", "delete", uri),
    );
    this._disposables.push(agentsWatcher2);

    // .windsurf/workflows/**
    const wfWatcher = vscode.workspace.createFileSystemWatcher(
      wsBase
        ? new vscode.RelativePattern(wsBase, ".windsurf/workflows/**")
        : ".windsurf/workflows/**",
    );
    wfWatcher.onDidChange((uri) =>
      this._onFileChange("workflows", "modify", uri),
    );
    wfWatcher.onDidCreate((uri) =>
      this._onFileChange("workflows", "create", uri),
    );
    wfWatcher.onDidDelete((uri) =>
      this._onFileChange("workflows", "delete", uri),
    );
    this._disposables.push(wfWatcher);

    // .windsurf/skills/**
    const skillsWatcher = vscode.workspace.createFileSystemWatcher(
      wsBase
        ? new vscode.RelativePattern(wsBase, ".windsurf/skills/**")
        : ".windsurf/skills/**",
    );
    skillsWatcher.onDidChange((uri) =>
      this._onFileChange("skills", "modify", uri),
    );
    skillsWatcher.onDidCreate((uri) =>
      this._onFileChange("skills", "create", uri),
    );
    skillsWatcher.onDidDelete((uri) =>
      this._onFileChange("skills", "delete", uri),
    );
    this._disposables.push(skillsWatcher);

    // Global memories (home dir)
    try {
      const memDir = path.join(
        os.homedir(),
        ".codeium",
        "windsurf",
        "memories",
      );
      const memPattern = new vscode.RelativePattern(memDir, "**");
      const memWatcher = vscode.workspace.createFileSystemWatcher(memPattern);
      memWatcher.onDidChange((uri) =>
        this._onFileChange("memories", "modify", uri),
      );
      memWatcher.onDidCreate((uri) =>
        this._onFileChange("memories", "create", uri),
      );
      memWatcher.onDidDelete((uri) =>
        this._onFileChange("memories", "delete", uri),
      );
      this._disposables.push(memWatcher);
    } catch {}

    // MCP config (home dir)
    try {
      const mcpDir = path.join(
        os.homedir(),
        ".codeium",
        "windsurf",
        "mcp_config.json",
      );
      const mcpPattern = new vscode.RelativePattern(
        path.dirname(mcpDir),
        "mcp_config*",
      );
      const mcpWatcher = vscode.workspace.createFileSystemWatcher(mcpPattern);
      mcpWatcher.onDidChange((uri) =>
        this._onFileChange("mcp_config", "modify", uri),
      );
      mcpWatcher.onDidCreate((uri) =>
        this._onFileChange("mcp_config", "create", uri),
      );
      this._disposables.push(mcpWatcher);
    } catch {}
  }

  // ═══════════════════════ L2: 配置观 ═══════════════════════

  _watchConfig() {
    const d = vscode.workspace.onDidChangeConfiguration((e) => {
      // 只关心与注入相关的配置
      const relevant = [
        "dao",
        "wam",
        "codeium",
        "editor.fontSize",
        "editor.fontFamily",
        "files.associations",
      ];
      const hit = relevant.some((s) => e.affectsConfiguration(s));
      if (hit) {
        this._pushChange("config", "配置变更", {});
        this._debouncedEmit();
      }
    });
    this._disposables.push(d);
  }

  // ═══════════════════════ L3: 编辑器观 ═══════════════════════

  _watchEditor() {
    // 活动编辑器变更
    const d1 = vscode.window.onDidChangeActiveTextEditor((editor) => {
      this._captureIdeState();
      this._pushChange("editor", "活动编辑器变更", {
        file: editor?.document?.uri?.fsPath || null,
        language: editor?.document?.languageId || null,
      });
      this._debouncedEmit();
    });
    this._disposables.push(d1);

    // 光标位置变更
    const d2 = vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor === vscode.window.activeTextEditor) {
        const pos = e.selections[0]?.active;
        if (pos) {
          this._ideState.activeLine = pos.line + 1;
          this._ideState.activeColumn = pos.character + 1;
          this._ideState.ts = Date.now();
          // 光标变更不触发完整刷新 · 仅更新 IDE state
          // 但每10次发一次 change 防止状态滞后
        }
      }
    });
    this._disposables.push(d2);

    // 打开/关闭文件
    const d3 = vscode.workspace.onDidOpenTextDocument((doc) => {
      this._captureIdeState();
      if (doc.uri.scheme === "file") {
        this._pushChange("file_open", "文件打开", { file: doc.uri.fsPath });
        this._debouncedEmit();
      }
    });
    this._disposables.push(d3);

    const d4 = vscode.workspace.onDidCloseTextDocument((doc) => {
      this._captureIdeState();
      if (doc.uri.scheme === "file") {
        this._pushChange("file_close", "文件关闭", { file: doc.uri.fsPath });
        this._debouncedEmit();
      }
    });
    this._disposables.push(d4);

    // 可见编辑器变更
    const d5 = vscode.window.onDidChangeVisibleTextEditors(() => {
      this._captureIdeState();
      this._debouncedEmit();
    });
    this._disposables.push(d5);
  }

  // ═══════════════════════ L5: 工作区观 ═══════════════════════

  _watchWorkspace() {
    const d = vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      this._captureIdeState();
      this._pushChange("workspace", "工作区变更", {
        added: e.added.map((f) => f.uri.fsPath),
        removed: e.removed.map((f) => f.uri.fsPath),
      });
      this._debouncedEmit();
    });
    this._disposables.push(d);
  }

  // ═══════════════════════ 采 · IDE 元信息 ═══════════════════════

  _captureIdeState() {
    try {
      const editor = vscode.window.activeTextEditor;
      const pos = editor?.selection?.active;
      this._ideState = {
        activeFile: editor?.document?.uri?.fsPath || null,
        activeLanguage: editor?.document?.languageId || null,
        activeLine: pos ? pos.line + 1 : 0,
        activeColumn: pos ? pos.character + 1 : 0,
        openFiles: vscode.workspace.textDocuments
          .filter((d) => d.uri.scheme === "file")
          .map((d) => ({
            path: d.uri.fsPath,
            language: d.languageId,
            dirty: d.isDirty,
            lineCount: d.lineCount,
          })),
        visibleEditors: vscode.window.visibleTextEditors.map((e) => ({
          path: e.document.uri.fsPath,
          language: e.document.languageId,
          viewColumn: e.viewColumn,
        })),
        workspaceFolders: (vscode.workspace.workspaceFolders || []).map(
          (f) => ({
            name: f.name,
            uri: f.uri.fsPath,
            index: f.index,
          }),
        ),
        ts: Date.now(),
      };
    } catch {}
  }

  // ═══════════════════════ 内 · 事件处理 ═══════════════════════

  _onFileChange(source, action, uri) {
    const rel = vscode.workspace.asRelativePath(uri, false);
    this._pushChange(source, `${action}: ${rel}`, { uri: uri.fsPath, action });
    this._debouncedEmit();
  }

  _pushChange(source, detail, meta) {
    const entry = {
      ts: Date.now(),
      source,
      detail,
      meta,
    };
    this._changeLog.push(entry);
    if (this._changeLog.length > this._maxChangeLog) {
      this._changeLog = this._changeLog.slice(-this._maxChangeLog);
    }
  }

  _debouncedEmit() {
    this._lastEventTs = Date.now();
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this.emit("change", {
        ts: Date.now(),
        trigger: this._changeLog.length
          ? this._changeLog[this._changeLog.length - 1]
          : null,
      });
    }, DEBOUNCE_MS);
    // 有事件时切到快轮询
    this._armPoll();
  }

  // ═══════════════════════ L4: 自适应轮询 ═══════════════════════
  // 有事件时快轮询 · 无事时慢轮询 · 动之徐生 · 静之徐清

  _armPoll() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (!this._started) return;

    const tick = () => {
      const sinceLast = Date.now() - this._lastEventTs;
      const inFastWindow = sinceLast < FAST_WINDOW_MS;
      // 在快窗口内 → 快轮询触发刷新
      // 否则 → 慢轮询触发刷新
      this.emit("poll", {
        ts: Date.now(),
        fast: inFastWindow,
        sinceLast,
      });
      // 超出快窗口 → 切回慢速
      if (!inFastWindow && this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = setInterval(tick, SLOW_POLL_MS);
      }
    };

    const sinceLast = Date.now() - this._lastEventTs;
    const interval = sinceLast < FAST_WINDOW_MS ? FAST_POLL_MS : SLOW_POLL_MS;
    this._pollTimer = setInterval(tick, interval);
  }
}

// ═══════════════════════ 指纹 · 知常曰明 ═══════════════════════

function _fingerprint(data) {
  if (!data) return "null";
  try {
    const str = JSON.stringify(data);
    return crypto
      .createHash("md5")
      .update(str)
      .digest("hex")
      .slice(0, HASH_TRUNCATE);
  } catch {
    return "error";
  }
}

// ═══════════════════════ 差 · 有无相生 ═══════════════════════
// 比较两次 gatherAll 结果 · 返回变更摘要

function diffSnapshots(prev, curr) {
  if (!prev || !curr) return { changed: true, sections: ["initial"] };

  const changes = [];

  // Rules diff
  const prevRules = _ruleIds(prev.rules);
  const currRules = _ruleIds(curr.rules);
  if (prevRules !== currRules) changes.push("rules");

  // MCP diff
  const prevMcp = _mcpSig(prev.mcp);
  const currMcp = _mcpSig(curr.mcp);
  if (prevMcp !== currMcp) changes.push("mcp");

  // Settings diff
  if (_fp(prev.settings) !== _fp(curr.settings)) changes.push("settings");

  // Workspaces diff
  if (_fp(prev.workspaces) !== _fp(curr.workspaces)) changes.push("workspaces");

  // Memories diff
  if (_fp(prev.cascadeMemories) !== _fp(curr.cascadeMemories))
    changes.push("cascadeMemories");
  if (_fp(prev.userMemories) !== _fp(curr.userMemories))
    changes.push("userMemories");

  // Skills/Workflows diff
  if (_fp(prev.skills) !== _fp(curr.skills)) changes.push("skills");
  if (_fp(prev.workflows) !== _fp(curr.workflows)) changes.push("workflows");

  // Trajectories diff
  if (_fp(prev.trajectories) !== _fp(curr.trajectories))
    changes.push("trajectories");

  // Model configs diff
  if (_fp(prev.modelConfigs) !== _fp(curr.modelConfigs))
    changes.push("modelConfigs");

  // Unleash diff
  if (_fp(prev.unleash) !== _fp(curr.unleash)) changes.push("unleash");

  return {
    changed: changes.length > 0,
    sections: changes,
    ts: Date.now(),
  };
}

function _fp(obj) {
  if (!obj) return "null";
  try {
    return crypto
      .createHash("md5")
      .update(JSON.stringify(obj))
      .digest("hex")
      .slice(0, 12);
  } catch {
    return "err";
  }
}

function _ruleIds(rules) {
  if (!rules || !rules.memories) return "";
  return rules.memories
    .map(
      (m) =>
        (m.memoryId || m.title || "") +
        ":" +
        (m.textMemory?.content || m.content || "").length,
    )
    .sort()
    .join("|");
}

function _mcpSig(mcp) {
  if (!mcp || !mcp.states) return "";
  return mcp.states
    .map((s) => {
      const name = s.spec?.serverName || s.spec?.name || "?";
      const status = s.status || "?";
      const tc = s.tools?.length || 0;
      return `${name}:${status}:${tc}`;
    })
    .sort()
    .join("|");
}

module.exports = { DaoWatcher, diffSnapshots, _fingerprint };
