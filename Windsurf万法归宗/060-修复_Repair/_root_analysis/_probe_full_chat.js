// FULL e2e chat: StartCascade -> SendUserCascadeMessage -> poll GetCascadeTrajectorySteps
"use strict";

const http = require("node:http");
const crypto = require("node:crypto");

const ROOT = "V:\\道\\道生一\\一生二\\Windsurf万法归宗\\070-插件_Plugins\\040-道反代_LanProxy\\dao-lan-proxy";
const lsBridge = require(ROOT + "\\ls-bridge.js");

const SVC = "/exa.language_server_pb.LanguageServerService";

function rpc(port, csrf, method, jsonObj, ct = "application/json") {
  return new Promise((resolve) => {
    const buf = Buffer.from(JSON.stringify(jsonObj), "utf8");
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: `${SVC}/${method}`,
      method: "POST",
      headers: {
        "content-type": ct,
        "connect-protocol-version": "1",
        "x-codeium-csrf-token": csrf,
        "content-length": buf.length,
      },
      timeout: 60000,
    }, (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let parsed;
        try { parsed = JSON.parse(body); } catch {}
        resolve({ status: res.statusCode, body, parsed });
      });
    });
    req.on("error", e => resolve({ err: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ err: "timeout" }); });
    req.write(buf);
    req.end();
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const ls = lsBridge.discoverLS(true);
  const ak = lsBridge.extractApiKey(true);
  console.log(`LS pid=${ls.pid} port=${ls.port}, apiKey=${ak.apiKey.slice(0, 30)}...`);

  const meta = {
    ideName: "windsurf",
    extensionVersion: "1.48.2",
    apiKey: ak.apiKey,
    locale: "en-US",
    ideVersion: "2.0.44",
    extensionName: "windsurf",
  };

  const userPrompt = process.argv[2] || "Reply with a single word: ping";
  const modelUid = process.env.MODEL || "claude-sonnet-4-6";
  console.log(`\nPrompt: "${userPrompt}"`);
  console.log(`Model: ${modelUid}\n`);

  // ── 1. StartCascade ──
  console.log("[1] StartCascade...");
  const r1 = await rpc(ls.port, ls.csrf, "StartCascade", { metadata: meta });
  if (r1.status !== 200) { console.log("FAIL:", r1.body); return; }
  const cascadeId = r1.parsed.cascadeId;
  console.log(`   cascadeId=${cascadeId}`);

  // ── 2. SendUserCascadeMessage ──
  console.log("[2] SendUserCascadeMessage...");
  const r2 = await rpc(ls.port, ls.csrf, "SendUserCascadeMessage", {
    metadata: meta,
    cascadeId,
    items: [{ text: userPrompt }],
    cascadeConfig: {
      plannerConfig: {
        conversational: {},
        requestedModelUid: modelUid,
        planModelUid: modelUid,
      },
    },
    blocking: false,
  });
  console.log(`   status=${r2.status} body=${r2.body.slice(0, 200)}`);
  if (r2.status !== 200) return;

  // ── 3. Poll GetCascadeTrajectorySteps ──
  console.log("\n[3] Polling for response...");
  const start = Date.now();
  let lastText = "";
  let inProgress = true;
  for (let i = 0; i < 90 && inProgress; i++) {
    await sleep(1000);
    const r3 = await rpc(ls.port, ls.csrf, "GetCascadeTrajectorySteps", {
      metadata: meta,
      trajectoryId: cascadeId,
      cascadeId,
    });
    if (r3.status !== 200) {
      console.log(`   [${i}s] poll status=${r3.status}: ${r3.body.slice(0, 200)}`);
      continue;
    }
    if (!r3.parsed) continue;

    // Walk steps for text content + completion status
    const steps = r3.parsed.steps || r3.parsed.cortexTrajectorySteps || [];
    let foundText = "";
    let stillRunning = false;
    for (const step of steps) {
      // Check various step shapes
      const sJson = JSON.stringify(step);
      if (step.step?.plannerResponse) {
        const pr = step.step.plannerResponse;
        if (pr.responseText) foundText += pr.responseText;
        if (pr.text) foundText += pr.text;
      }
      // Generic: scan for "text" or "responseText" properties recursively
      function scan(obj, depth = 0) {
        if (depth > 5 || !obj || typeof obj !== "object") return;
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === "string" && (k === "responseText" || k === "text" || k === "content") && v.length > 5) {
            if (!foundText.includes(v)) foundText += "[" + k + "]:" + v + "\n";
          } else if (typeof v === "object") {
            scan(v, depth + 1);
          }
        }
      }
      // Don't fully scan in production, only for first probe
      if (i === 0 && step.step) console.log(`   step types: ${Object.keys(step.step || {}).join(",")}`);
    }

    // Look for "in_progress" / "isDone" / "completed" markers
    const bodyStr = r3.body;
    const isComplete = bodyStr.includes('"is_done":true') || bodyStr.includes('"isDone":true') || bodyStr.includes('"completed":true');
    const hasError = bodyStr.includes('"isError":true') || bodyStr.includes('"is_error":true');

    if (foundText && foundText !== lastText) {
      console.log(`   [${i}s] new text (${foundText.length}): ${foundText.slice(0, 200)}`);
      lastText = foundText;
    }
    if (isComplete) {
      console.log(`   [${i}s] DONE (completed marker found)`);
      inProgress = false;
    }
    if (hasError) {
      console.log(`   [${i}s] ERROR detected`);
      // dump first 2000 chars of body
      console.log("   body excerpt:", bodyStr.slice(0, 2000));
      inProgress = false;
    }
    if (!steps.length && i === 0) {
      console.log(`   [${i}s] body keys: ${Object.keys(r3.parsed).join(",")}`);
      // dump small body
      if (bodyStr.length < 2000) console.log(`   body: ${bodyStr}`);
    }
    if (i % 5 === 0 && i > 0) {
      console.log(`   [${i}s] still polling, body bytes=${bodyStr.length} steps=${steps.length}`);
    }
  }
  console.log(`\nDone after ${((Date.now() - start) / 1000).toFixed(1)}s`);
  if (lastText) {
    console.log("\n=== FINAL TEXT ===");
    console.log(lastText);
  }
}

main().catch(e => console.error("FATAL:", e));
