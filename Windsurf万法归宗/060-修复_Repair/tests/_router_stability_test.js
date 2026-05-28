// Self-contained router stability test
// Writes ALL results to C:\Users\zhouyoukang\_rst_result.txt
const cp = require("child_process");
const fs = require("fs");
const http = require("http");
const NODE = process.execPath;
const OUT = "C:\\Users\\zhouyoukang\\_rst_result.txt";
const o = [];
const w = (m) => { o.push(m); fs.writeFileSync(OUT, o.join("\n")); };

w("START " + new Date().toISOString());

// 1. Check settings.json
try {
  const sPath = process.env.APPDATA + "\\Windsurf\\User\\settings.json";
  const s = JSON.parse(fs.readFileSync(sPath, "utf8"));
  w("apiServerUrl=" + (s["codeium.apiServerUrl"] || "DEFAULT"));
} catch(e) { w("settings_err:" + e.message); }

// 2. Check bridge  
w("bridge_check...");
const bridgeCheck = (port) => new Promise(r => {
  http.get(`http://127.0.0.1:${port}/health`, {timeout:3000}, res => {
    let d=""; res.on("data",c=>d+=c); res.on("end",()=>r({s:res.statusCode,b:d}));
  }).on("error",e=>r({s:0,b:e.message}));
});

// 3. Kill any existing routers
try {
  const wm = cp.execSync('wmic process where "CommandLine like \'%dao_h2c_router%\'" get ProcessId /value', {encoding:"utf8"});
  const pids = (wm.match(/ProcessId=(\d+)/g)||[]).map(x=>parseInt(x.split("=")[1]));
  pids.forEach(p => { try { process.kill(p,"SIGKILL"); } catch{} });
  w("killed_routers=" + JSON.stringify(pids));
} catch { w("no_routers_to_kill"); }

// 4. Check port 8879 availability
try {
  const ns = cp.execSync("netstat -ano", {encoding:"utf8"});
  const tw = (ns.match(/.*:8879.*/g)||[]).length;
  w("port_8879_entries=" + tw);
} catch {}

// 5. Start router as child process with full stdio capture
w("starting_router...");
const child = cp.spawn(NODE, ["C:\\Users\\zhouyoukang\\dao_h2c_router.js"], {
  cwd: "C:\\Users\\zhouyoukang",
  stdio: ["ignore", "pipe", "pipe"],
  env: Object.assign({}, process.env),
});

let stdout_lines = [];
let stderr_lines = [];

child.stdout.on("data", c => {
  const lines = c.toString().split("\n").filter(l=>l.trim());
  stdout_lines.push(...lines);
});
child.stderr.on("data", c => {
  const lines = c.toString().split("\n").filter(l=>l.trim());
  stderr_lines.push(...lines);
});

child.on("exit", (code, signal) => {
  w("CHILD_EXIT code=" + code + " signal=" + signal);
  w("stdout_last5=" + JSON.stringify(stdout_lines.slice(-5)));
  w("stderr_last5=" + JSON.stringify(stderr_lines.slice(-5)));
});
child.on("error", e => w("CHILD_ERROR: " + e.message));

w("router_pid=" + child.pid);

// 6. Monitor for 120 seconds
let checks = 0;
const interval = setInterval(async () => {
  checks++;
  const alive = !child.killed && !child.exitCode;
  
  let health = "unknown";
  try {
    const r = await bridgeCheck(8879);
    if (r.s === 200) {
      try { const j = JSON.parse(r.b); health = "UP routes=" + (j.router?.count||0); } 
      catch { health = "UP raw"; }
    } else { health = "status=" + r.s; }
  } catch { health = "DOWN"; }
  
  w(`check#${checks} (${checks*10}s): alive=${alive} health=${health} stdout=${stdout_lines.length} stderr=${stderr_lines.length}`);
  
  if (checks >= 12) {
    clearInterval(interval);
    w("FINAL: alive=" + alive + " stdout_lines=" + stdout_lines.length);
    w("stdout_all=" + JSON.stringify(stdout_lines.slice(-20)));
    w("stderr_all=" + JSON.stringify(stderr_lines));
    
    // Try a test request if alive
    if (alive) {
      w("ROUTER_STABLE_120S");
    } else {
      w("ROUTER_CRASHED");
    }
    
    // Clean up
    try { child.kill(); } catch {}
    setTimeout(() => process.exit(0), 2000);
  }
}, 10000);
