// isolator.js — 道Agent · 文件层观照 · v17.88 · 损之又损
//
// 为学日益,为道日损. 损之又损,以至于无为. 无为而无不为.
// 天之道, 利而不害 · 圣人之道, 为而不争 · 水善利万物而不争.
//
// v17.88 (2026-04-26) · 大成若缺 · 仅留观 (status/scanAgentsMd) · 删一切 enter/exit
//   史: v17.75 enter() 删 · v17.82 _isolateExit() 删
//   实: 全代码遍查 · isolator.exit / _exit* / _restore* / writeState 0 调用
//   故: 459 行死码归芜 · 留 ~280 行 (status + scanAgentsMd + 隔离区只读观照)
//   "为者败之, 执者失之. 圣人无为故无败, 无执故无失" (第六十四章)
//
// 三核唯一本源 = proxy 源.js invert · 此 isolator 不触发任何隔离 / 文件移动 / 备份恢复.
// 仅 essence.js 之 isolator.status(ws) 调 · 用于 webview 显隔离区状态.
//
// 幂等: status() / scanAgentsMd() 只读. 重入无害.
// 安全: 不动任一用户文件 · 仅观目录列表.

"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// ═══════════════════════ 常 · 道白名单 ═══════════════════════
// 保留: 道德经本源 · 其他一切工作区 rules/workflows/skills 皆入隔离
// v17.63 · 白名单前缀化 · 支持 dao-*.md / 道*.md / 000-dao*.md 皆护持
const DAO_ALLOWED_EXACT = new Set([
  "dao-de-jing.md",
  "dao-de-jing-xia.md",
  "000-dao.md",
  "dao.md",
  "道德经.md",
  "道德经-上.md",
  "道德经-下.md",
]);
const DAO_ALLOWED_PREFIXES = [
  "dao-de-jing",
  "道德经",
  "000-dao",
  "dao-",
  "道-",
];

// v17.63 · 扩展注入源 · workflows / skills 亦为 Cascade 注入路径 (LS GetAllWorkflows/GetAllSkills)
// 默认一并隔离 · 保留同样白名单规则 (无道字前缀者皆入隔离区)
const WORKFLOWS_SUBDIR = path.join(".windsurf", "workflows");
const SKILLS_SUBDIR = path.join(".windsurf", "skills");

// 隔离区目录名 (工作区根下) · 分类子目
const QUARANTINE_SUBDIR = path.join(".windsurf", "_quarantine", "道隔离");
const QUARANTINE_RULES_SUBDIR = path.join(QUARANTINE_SUBDIR, "rules");
const QUARANTINE_WORKFLOWS_SUBDIR = path.join(QUARANTINE_SUBDIR, "workflows");
const QUARANTINE_SKILLS_SUBDIR = path.join(QUARANTINE_SUBDIR, "skills");
// v17.64 · AGENTS.md 实移子目 (历) · v17.88 · 观照路径仅留, _index.json 死路弃
const QUARANTINE_AGENTS_SUBDIR = path.join(QUARANTINE_SUBDIR, "agents");
const STATE_FILE = path.join(".windsurf", "_isolation_state.json");

// v17.64 · 全局 MCP 配置观 · ~/.codeium/windsurf/mcp_config.json
// v17.88 · MCP_CONFIG_EMPTY 死常量删 (无 enter/exit · 无写)
function _globalMcpConfigPath() {
  return path.join(os.homedir(), ".codeium", "windsurf", "mcp_config.json");
}
function _globalMcpBackupDir() {
  return path.join(os.homedir(), ".codeium", "windsurf", "mcp_dao_quarantine");
}

// ═══════════════════════ 柔弱 · 皆护盾 ═══════════════════════

function _list(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
function _stat(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}
function _exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}
// v17.88 · _mkdir 死函数删 (无 writeState/_restore* · 无写)
// v17.63 · 白名单判: 精确匹配 + 前缀匹配 (皆按文件名小写比)
function _isAllowed(name) {
  const low = String(name).toLowerCase();
  if (DAO_ALLOWED_EXACT.has(low)) return true;
  for (const pfx of DAO_ALLOWED_PREFIXES) {
    if (low.startsWith(pfx.toLowerCase())) return true;
  }
  // 原名保留大小写亦查 (中文 toLowerCase 无效 · 直接比)
  const raw = String(name);
  for (const pfx of DAO_ALLOWED_PREFIXES) {
    if (raw.startsWith(pfx)) return true;
  }
  return false;
}
function _rulesDir(wsRoot) {
  return path.join(wsRoot, ".windsurf", "rules");
}
function _workflowsDir(wsRoot) {
  return path.join(wsRoot, WORKFLOWS_SUBDIR);
}
function _skillsDir(wsRoot) {
  return path.join(wsRoot, SKILLS_SUBDIR);
}
function _quarantineDir(wsRoot) {
  return path.join(wsRoot, QUARANTINE_SUBDIR);
}
function _quarantineRulesDir(wsRoot) {
  return path.join(wsRoot, QUARANTINE_RULES_SUBDIR);
}
function _quarantineWorkflowsDir(wsRoot) {
  return path.join(wsRoot, QUARANTINE_WORKFLOWS_SUBDIR);
}
function _quarantineSkillsDir(wsRoot) {
  return path.join(wsRoot, QUARANTINE_SKILLS_SUBDIR);
}
function _statePath(wsRoot) {
  return path.join(wsRoot, STATE_FILE);
}

function readState(wsRoot) {
  try {
    return JSON.parse(fs.readFileSync(_statePath(wsRoot), "utf8"));
  } catch {
    return null;
  }
}
// v17.88 · writeState 死函数删 (status 仅读 · 无写状态来源)

// ═══════════════════════ 观 · AGENTS.md 扫描 ═══════════════════════
// 仅观察不移动 · 返数量 · 供 UI 提示
// Windsurf GLOB trigger 递归扫非下划线前缀 AGENTS.md · 此扫描助用户自察

function scanAgentsMd(wsRoot, opts) {
  const maxDepth = (opts && opts.maxDepth) || 6;
  const skipDirs = new Set([
    "node_modules",
    ".git",
    "_archive",
    "_quarantine",
    "dist",
    "build",
    "target",
  ]);
  const found = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    if (found.length >= 50) return; // 封顶 · 避免病态扫描
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".windsurf") continue;
      if (skipDirs.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, depth + 1);
      } else if (e.isFile() && e.name === "AGENTS.md") {
        found.push(path.relative(wsRoot, full));
      }
    }
  }
  walk(wsRoot, 0);
  return found;
}

// v17.88 · _readAgentsIndex / _writeAgentsIndex / _restoreAgentsMd 三函数死码删
//          (无 exit() · 无写 · 无恢复路径 · 仅状态观照留)
// v17.88 · _exitGlobalMcp / _restoreDirectory 死码删 (同上)

// ═══════════════════════ 出道 · v17.88 · exit 已删 (459 行死码归芜) ═══════════════════════
// v17.75 · enter() 已删 · 本源 SP 净化全由 proxy 源.js invert 承担 · 着相已去
// v17.88 · exit() 0 调用 · 删 · "为者败之, 执者失之. 圣人无为故无败" (第六十四章)
//          (历史 v17.65- enter 残迹清理路径不再保 · 用户 rm .windsurf/_quarantine 直清)

// ═══════════════════════ 全局记忆观 · v17.88 · _exitGlobalMemories 死码删 ═══════════════════════
// v17.75 · _enterGlobalMemories 已删 · v17.88 · _exitGlobalMemories 0 调用删 · 留 _globalMemoriesDir 供 status() 观

function _globalMemoriesDir() {
  return path.join(os.homedir(), ".codeium", "windsurf", "memories");
}

// ═══════════════════════ 状 · 观复知常 ═══════════════════════

// v17.63 · 单目录观: 取活/隔/道留/非道活 四统
function _dirStatus(srcDir, quarantineDir) {
  const active = _list(srcDir).filter((n) => n.toLowerCase().endsWith(".md"));
  const quarantined = _list(quarantineDir).filter((n) =>
    n.toLowerCase().endsWith(".md"),
  );
  const daoKept = active.filter(_isAllowed);
  const nonDaoActive = active.filter((n) => !_isAllowed(n));
  return {
    active,
    active_count: active.length,
    quarantined,
    quarantined_count: quarantined.length,
    dao_kept: daoKept,
    dao_kept_count: daoKept.length,
    non_dao_active: nonDaoActive,
    non_dao_active_count: nonDaoActive.length,
  };
}

function status(wsRoot) {
  const s = readState(wsRoot);
  const md = _globalMemoriesDir();
  const globalMemFiles = _list(md).filter((n) => n !== "image");

  // v17.63 · 三目统观 + 向后兼容旧 qd 根下残文件
  const rulesSt = _dirStatus(_rulesDir(wsRoot), _quarantineRulesDir(wsRoot));
  const workflowsSt = _dirStatus(
    _workflowsDir(wsRoot),
    _quarantineWorkflowsDir(wsRoot),
  );
  const skillsSt = _dirStatus(_skillsDir(wsRoot), _quarantineSkillsDir(wsRoot));

  // 旧布局 legacy quarantine 根下文件 · 计入 rules.quarantined
  const qdRoot = _quarantineDir(wsRoot);
  if (_exists(qdRoot)) {
    for (const name of _list(qdRoot)) {
      const full = path.join(qdRoot, name);
      const st = _stat(full);
      if (st && st.isFile() && name.toLowerCase().endsWith(".md")) {
        rulesSt.quarantined.push(name);
        rulesSt.quarantined_count++;
      }
    }
  }

  // v17.64 · AGENTS.md 观 (活在 ws 中 + 已隔之)
  const agentsActive = scanAgentsMd(wsRoot);
  const agentsQuarantineDir = path.join(wsRoot, QUARANTINE_AGENTS_SUBDIR);
  const agentsQuarantined = _list(agentsQuarantineDir).filter(
    (n) => n !== "_index.json",
  );

  // v17.64 · MCP 配置观
  const mcpPath = _globalMcpConfigPath();
  let mcpServerCount = 0;
  let mcpIsEmpty = true;
  try {
    if (_exists(mcpPath)) {
      const raw = fs.readFileSync(mcpPath, "utf8");
      const j = JSON.parse(raw);
      mcpServerCount =
        (j && j.mcpServers && Object.keys(j.mcpServers).length) || 0;
      mcpIsEmpty = mcpServerCount === 0;
    }
  } catch {}
  const mcpBackupDir = _globalMcpBackupDir();
  const mcpBackups = _list(mcpBackupDir).filter((n) =>
    /^mcp_config\.\d+\.json$/.test(n),
  );

  return {
    mode: s ? s.mode : "unknown",
    ts: s ? s.ts : null,
    rules: rulesSt,
    workflows: workflowsSt,
    skills: skillsSt,
    agents_md: {
      active: agentsActive,
      active_count: agentsActive.length,
      quarantined: agentsQuarantined,
      quarantined_count: agentsQuarantined.length,
    },
    mcp: {
      config_path: mcpPath,
      server_count: mcpServerCount,
      is_empty: mcpIsEmpty,
      backup_dir: mcpBackupDir,
      backup_count: mcpBackups.length,
    },
    global_memories: {
      dir: md,
      files: globalMemFiles,
      file_count: globalMemFiles.length,
    },
    allowed: {
      exact: [...DAO_ALLOWED_EXACT],
      prefixes: [...DAO_ALLOWED_PREFIXES],
    },
    paths: {
      workspace: wsRoot,
      rules_dir: _rulesDir(wsRoot),
      workflows_dir: _workflowsDir(wsRoot),
      skills_dir: _skillsDir(wsRoot),
      quarantine_dir: qdRoot,
      quarantine_rules_dir: _quarantineRulesDir(wsRoot),
      quarantine_workflows_dir: _quarantineWorkflowsDir(wsRoot),
      quarantine_skills_dir: _quarantineSkillsDir(wsRoot),
      quarantine_agents_dir: agentsQuarantineDir,
      state_file: _statePath(wsRoot),
    },
  };
}

module.exports = {
  // v17.88 · 仅留观 · status/scanAgentsMd/readState (essence 用 status · 余皆纯只读)
  status,
  scanAgentsMd,
  readState,
  // 白名单常量 (供外部观照)
  DAO_ALLOWED_EXACT: [...DAO_ALLOWED_EXACT],
  DAO_ALLOWED_PREFIXES: [...DAO_ALLOWED_PREFIXES],
  DAO_ALLOWED_RULES: [...DAO_ALLOWED_EXACT],
};
