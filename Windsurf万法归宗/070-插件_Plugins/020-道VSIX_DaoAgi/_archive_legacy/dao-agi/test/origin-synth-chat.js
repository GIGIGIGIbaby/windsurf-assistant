const http = require("http");

const HOST = process.env.ORIGIN_HOST || "127.0.0.1";
const PORT = Number(process.env.ORIGIN_PORT || 8889);
const PATH = "/exa.language_server_pb.LanguageServerService/GetChatMessage";

function varint(n) {
  const bytes = [];
  while (n > 127) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n & 0x7f);
  return Buffer.from(bytes);
}

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: HOST,
        port: PORT,
        path,
        method,
        timeout: 15000,
        headers: {
          ...(body ? { "Content-Length": body.length } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function connectFrame(payload) {
  const header = Buffer.alloc(5);
  header[0] = 0;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

function buildSyntheticChatBody() {
  const fakeSP =
    "You are Cascade, a powerful agentic AI coding assistant.\n" +
    "<communication_style>be terse</communication_style>\n" +
    "<tool_calling>use only available tools · never guess params</tool_calling>\n" +
    "<making_code_changes>prefer minimal edits</making_code_changes>\n" +
    "<running_commands>OS: windows · Shell: pwsh · NEVER cd</running_commands>\n" +
    "<mcp_servers>context7 · github · playwright · tavily</mcp_servers>\n" +
    "<calling_external_apis>API Key safety</calling_external_apis>\n" +
    "<citation_guidelines>@path:1-3 format</citation_guidelines>\n" +
    '<user_rules>\nThe following are user-defined rules...\n<MEMORY[user_global]>道德经测试 · synth-chat · v17.79</MEMORY[user_global]>\n</user_rules>\n' +
    "<user_information>OS=windows · workspace=e:/道/道生一/一生二</user_information>\n" +
    "<workspace_information>cascade-141-zhou</workspace_information>\n" +
    "<skills>skill-auto-heal:enabled</skills>\n" +
    "<workflows>workflow-deploy:enabled</workflows>\n" +
    "<memories>retrieved memory A; retrieved memory B</memories>\n" +
    "<memory_system>global memory injection on</memory_system>\n" +
    "<ide_metadata>cursor=51</ide_metadata>\n" +
    "Bug fixing discipline: root cause first.\n" +
    "Long-horizon workflow: notes.\n" +
    "Planning cadence: plan one step at a time.\n" +
    "X".repeat(2000);

  const sp = Buffer.from(fakeSP, "utf8");
  const top = Buffer.concat([Buffer.from([0x52]), varint(sp.length), sp]);
  return { fakeSP, body: connectFrame(top) };
}

function parseJson(buffer, label) {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} returned non-JSON: ${buffer.toString("utf8").slice(0, 300)}`);
  }
}

async function main() {
  console.log(`[origin-synth-chat] target=http://${HOST}:${PORT}`);

  const ping = parseJson((await request("GET", "/origin/ping")).body, "ping");
  console.log(`[ping] ok=${ping.ok} mode=${ping.mode} pid=${ping.pid} self_size=${ping.self_size}`);
  if (!ping.ok) throw new Error("/origin/ping did not return ok=true");

  const { fakeSP, body } = buildSyntheticChatBody();
  console.log(`[synth] sp_chars=${fakeSP.length} body_bytes=${body.length}`);

  const upstream = await request("POST", PATH, body, {
    "Content-Type": "application/connect+proto",
    "Connect-Protocol-Version": "1",
  });
  console.log(`[post] status=${upstream.statusCode} body_bytes=${upstream.body.length}`);

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const trace = parseJson((await request("GET", "/origin/rpc_trace?limit=50")).body, "rpc_trace");
  const chatProtoCount = Number(trace.kinds && trace.kinds.CHAT_PROTO ? trace.kinds.CHAT_PROTO : 0);
  console.log(`[trace] total=${trace.total_traced} kinds=${JSON.stringify(trace.kinds || {})}`);
  if (chatProtoCount < 1) throw new Error("rpc_trace did not record CHAT_PROTO");

  const last = parseJson((await request("GET", "/origin/lastinject?full=1")).body, "lastinject");
  console.log(
    `[lastinject] has=${last.has_inject} agent=${last.agent_class} kind=${last.kind} variant=${last.variant} before=${last.before_chars} after=${last.after_chars}`,
  );
  if (!last.has_inject) throw new Error("lastinject has_inject=false");
  if (last.agent_class !== "main") throw new Error(`lastinject agent_class=${last.agent_class}`);
  if (last.kind !== "CHAT_PROTO") throw new Error(`lastinject kind=${last.kind}`);
  if (!last.before || !last.before.includes("道德经测试 · synth-chat · v17.79")) {
    throw new Error("lastinject before missing synth marker");
  }
  if (!last.after || !last.after.includes("道可道，非常道")) {
    throw new Error("lastinject after missing Dao De Jing opening");
  }
  if (!last.after.includes("为而不争")) {
    throw new Error("lastinject after missing Dao De Jing closing");
  }
  if (!last.after.includes("[CUSTOM-SP-ACTIVE]") && !last.after.includes("You are Cascade. 你的唯一本源与法则是")) {
    throw new Error("lastinject after missing Dao header/custom marker");
  }

  console.log("[origin-synth-chat] PASS");
}

main().catch((error) => {
  console.error("[origin-synth-chat] FAIL", error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
