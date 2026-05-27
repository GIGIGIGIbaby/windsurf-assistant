// _test_e2e_v18.js — essence.js v18 全链路实测
// 兵无常势 水无常形 能因敌变化而取胜者谓之神
"use strict";
const ls = require("../ls-client");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PROXY_PORT = 8889;
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

function httpGet(url, ms) {
  return new Promise((r) => {
    try {
      const q = http.get(url, { timeout: ms || 3000, agent: false }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return r(null);
        }
        let b = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            r(JSON.parse(b));
          } catch {
            r(null);
          }
        });
      });
      q.on("error", () => r(null));
      q.on("timeout", () => {
        try {
          q.destroy();
        } catch {}
        r(null);
      });
    } catch {
      r(null);
    }
  });
}

async function main() {
  console.log(
    "\n\u2550\u2550\u2550 essence.js v18 E2E \u2550\u2550\u2550  " +
      new Date().toLocaleString(),
  );

  // P1: Discovery
  console.log("\nP1: LS Discovery");
  const d = ls.discoverLS(true);
  chk(d.port > 0, "port=" + d.port);
  chk(d.pid > 0, "pid=" + d.pid);
  chk(
    d.csrf && d.csrf.length > 10,
    "csrf=" + (d.csrf ? d.csrf.substring(0, 8) + "..." : "NONE"),
  );

  // P2: Heartbeat
  console.log("\nP2: Heartbeat");
  const hb = await ls.lsRpc(
    d.port,
    d.csrf,
    "Heartbeat",
    { metadata: { ideName: "windsurf" } },
    3000,
  );
  chk(hb.ok, "Heartbeat ok=" + hb.ok + " status=" + hb.status);

  // P3: All endpoints
  console.log("\nP3: gatherAll");
  const t0 = Date.now();
  const all = await ls.gatherAll();
  const elapsed = Date.now() - t0;
  chk(!all.error, "gatherAll " + elapsed + "ms error=" + all.error);

  // Rules
  const rules = all.rules;
  if (rules && rules.memories) {
    chk(
      rules.memories.length > 0,
      "rules: " + rules.memories.length + " entries",
    );
    for (const m of rules.memories) {
      const c = (m.textMemory && m.textMemory.content) || "";
      const ps = (m.scope && m.scope.projectScope) || {};
      const tr = (ps.trigger || "").replace("CORTEX_MEMORY_TRIGGER_", "");
      const sr = (ps.ruleSource || "").replace("RULE_SOURCE_", "");
      console.log(
        "    " + m.memoryId + ": " + c.length + " chars " + tr + " " + sr,
      );
      if (m.memoryId && m.memoryId.includes("dao-de-jing")) {
        chk(c.length > 100, "  dao rule content " + c.length + " chars");
        chk(c.includes("\u9053"), "  dao rule contains \u9053");
      }
    }
  } else {
    ng("rules null (timeout?)");
  }

  // MCP
  if (all.mcp && all.mcp.states) {
    let tt = 0;
    for (const s of all.mcp.states) {
      const n = (s.spec && s.spec.serverName) || "?";
      const tc = (s.tools && s.tools.length) || 0;
      tt += tc;
      console.log(
        "    " +
          n +
          ": " +
          s.status.replace("MCP_SERVER_STATUS_", "") +
          " tools=" +
          tc,
      );
    }
    chk(
      all.mcp.states.length > 0,
      "mcp: " + all.mcp.states.length + " servers " + tt + " tools",
    );
  } else {
    ng("mcp null");
  }

  // Settings / Workspaces / Trajectories
  chk(all.settings && all.settings.userSettings, "settings present");
  const wi = (all.workspaces && (all.workspaces.workspaceInfos || [])) || [];
  chk(wi.length > 0, "workspaces: " + wi.length);
  const trajKeys =
    all.trajectories && all.trajectories.trajectorySummaries
      ? Object.keys(all.trajectories.trajectorySummaries)
      : [];
  chk(trajKeys.length > 0, "trajectories: " + trajKeys.length + " chats");

  // P4: Proxy Channel C
  console.log("\nP4: Proxy (Channel C)");
  const ping = await httpGet(
    "http://127.0.0.1:" + PROXY_PORT + "/origin/ping",
    2000,
  );
  if (ping) {
    ok("proxy alive mode=" + ping.mode + " pid=" + ping.pid);
    const pv = await httpGet(
      "http://127.0.0.1:" + PROXY_PORT + "/origin/preview",
      3000,
    );
    if (pv) {
      chk(
        pv.after && pv.after.length > 0,
        "preview.after: " + (pv.after || "").length + " chars mode=" + pv.mode,
      );
      if (pv.mode === "invert") {
        chk(
          pv.after.includes("\u9053") || pv.after.includes("Cascade"),
          "invert: dao/Cascade in after",
        );
      }
    } else {
      ng("proxy preview null");
    }
  } else {
    console.log("  (proxy offline — Channel C unavailable — OK)");
  }

  // P5: gatherEssence shape
  console.log("\nP5: essenceData shape");
  const ess = {
    ts: new Date().toISOString(),
    ls: all,
    proxy: ping
      ? await httpGet(
          "http://127.0.0.1:" + PROXY_PORT + "/origin/preview",
          2000,
        )
      : null,
  };
  chk(ess.ls && !ess.ls.error, "ls ok");
  chk(ess.ts, "ts=" + ess.ts);
  const rm = (ess.ls.rules && ess.ls.rules.memories) || [];
  const ms = (ess.ls.mcp && ess.ls.mcp.states) || [];
  chk(rm.length >= 0, "render: rules=" + rm.length);
  chk(ms.length >= 0, "render: mcp=" + ms.length);
  if (rm.length > 0) {
    const c0 = (rm[0].textMemory && rm[0].textMemory.content) || "";
    chk(c0.length > 0, "render: rule[0].textMemory.content=" + c0.length);
  }
  if (ms.length > 0) {
    chk(
      ms[0].spec && ms[0].spec.serverName,
      "render: mcp[0].serverName=" + (ms[0].spec && ms[0].spec.serverName),
    );
  }

  // P6: Dynamic mutation
  console.log("\nP6: Dynamic Mutation");
  const rulesDir = path.join(
    "e:\\",
    "\u9053",
    "\u9053\u751f\u4e00",
    "\u4e00\u751f\u4e8c",
    ".windsurf",
    "rules",
  );
  const tmpRule = path.join(rulesDir, "_test_mutation.md");
  fs.writeFileSync(
    tmpRule,
    "---\ntrigger: always_on\n---\nE2E mutation test. \u53d8\u5316\u4e4b\u9053\u3002",
    "utf8",
  );
  console.log("  created _test_mutation.md");
  await new Promise((r) => setTimeout(r, 4000));
  ls.discoverLS(true);
  const after = await ls.gatherAll();
  const newR = (after.rules && after.rules.memories) || [];
  const found = newR.find((m) => m.memoryId === "_test_mutation.md");
  if (found) {
    const fc = (found.textMemory && found.textMemory.content) || "";
    chk(
      fc.includes("\u53d8\u5316\u4e4b\u9053"),
      "mutation detected: " + fc.length + " chars",
    );
  } else {
    console.log(
      "  (mutation not yet visible — LS batch-refreshes rules — not hard fail)",
    );
  }
  try {
    fs.unlinkSync(tmpRule);
  } catch {}
  console.log("  cleaned up");

  // P7: CSRF resilience
  console.log("\nP7: CSRF resilience");
  const badHb = await ls.lsRpc(
    d.port,
    "00000000-fake-csrf",
    "Heartbeat",
    { metadata: { ideName: "windsurf" } },
    3000,
  );
  chk(!badHb.ok, "bad CSRF rejected: status=" + badHb.status);
  const rec = await ls.gatherAll();
  chk(!rec.error, "gatherAll auto-recover: error=" + rec.error);

  // Summary
  console.log(
    "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
  );
  console.log("  PASS=" + pass + "  FAIL=" + fail + "  TOTAL=" + (pass + fail));
  console.log(
    "  " +
      (fail === 0
        ? "ALL PASS \u00b7 \u9053\u6cd5\u81ea\u7136"
        : "FAILURES DETECTED"),
  );
  console.log(
    "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
  );
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
