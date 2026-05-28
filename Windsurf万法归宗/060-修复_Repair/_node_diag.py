#!/usr/bin/env python3
"""Run Node.js network diagnostic on ZROLIU to find exact CONNECT tunnel failure."""
import urllib.request, json, time, base64, sys, zlib
sys.stdout.reconfigure(line_buffering=True)

S = 'http://127.0.0.1:9910'
T = 'dao-ps-agent-2026'
AID = 'ZROLIU_c6aeb86a'

def api(m, p, b=None):
    d = json.dumps(b).encode() if b is not None else None
    req = urllib.request.Request(S + p, data=d, method=m)
    req.add_header('Authorization', 'Bearer ' + T)
    req.add_header('Content-Type', 'application/json')
    return json.loads(urllib.request.urlopen(req, timeout=60).read())

def run(cmd, timeout=45):
    r = api('POST', '/api/exec', {'agent_id': AID, 'type': 'shell', 'payload': {'command': cmd}})
    cid = r['cmd_id']
    for _ in range(timeout):
        time.sleep(1)
        o = api('GET', f'/api/agent/{AID}/output/{cid}')
        if o.get('status') == 'completed':
            return o.get('result', {})
    return {'error': 'TIMEOUT'}

def show(label, result):
    print(f'\n=== {label} ===')
    print(result.get('stdout', '')[:12000])
    if result.get('stderr'):
        print('STDERR:', result['stderr'][:3000])
    return result

# Node.js diagnostic script — test CONNECT tunnel + direct + proxy detection
node_script = r'''
const http = require("http");
const https = require("https");
const net = require("net");

const PROXY_HOST = "127.0.0.1";
const PROXY_PORTS = [20808, 20809];
const FIREBASE_HOST = "identitytoolkit.googleapis.com";
const FIREBASE_KEY = "AIzaSyDsOl-1XpT5err0Tcnx8FFod1H8gVGIycY";

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// Test 1: TCP connect to proxy ports
async function testTcpConnect() {
    log("--- TCP CONNECT TEST ---");
    for (const port of PROXY_PORTS) {
        try {
            const ok = await new Promise((resolve) => {
                const s = new net.Socket();
                s.setTimeout(2000);
                s.connect(port, PROXY_HOST, () => { s.destroy(); resolve(true); });
                s.on("error", (e) => { s.destroy(); log(`  TCP ${port}: ERROR ${e.message}`); resolve(false); });
                s.on("timeout", () => { s.destroy(); log(`  TCP ${port}: TIMEOUT`); resolve(false); });
            });
            if (ok) log(`  TCP ${port}: OPEN`);
        } catch (e) { log(`  TCP ${port}: EXCEPTION ${e.message}`); }
    }
}

// Test 2: HTTP CONNECT tunnel
async function testConnectTunnel(proxyPort) {
    log(`--- CONNECT TUNNEL TEST (port ${proxyPort}) ---`);
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            log(`  CONNECT ${proxyPort}: OVERALL TIMEOUT (15s)`);
            resolve(false);
        }, 15000);

        const connReq = http.request({
            host: PROXY_HOST,
            port: proxyPort,
            method: "CONNECT",
            path: `${FIREBASE_HOST}:443`,
            timeout: 10000,
        });

        connReq.on("connect", (res, socket) => {
            log(`  CONNECT ${proxyPort}: statusCode=${res.statusCode}`);
            if (res.statusCode !== 200) {
                clearTimeout(timer);
                socket.destroy();
                resolve(false);
                return;
            }

            // Test TLS handshake over tunnel
            const tlsReq = https.request({
                socket: socket,
                hostname: FIREBASE_HOST,
                path: "/",
                method: "GET",
                servername: FIREBASE_HOST,
                rejectUnauthorized: false,
                timeout: 8000,
            }, (resp) => {
                clearTimeout(timer);
                log(`  TLS over CONNECT ${proxyPort}: status=${resp.statusCode}`);
                resp.on("data", () => {});
                resp.on("end", () => {
                    socket.destroy();
                    resolve(true);
                });
            });
            tlsReq.on("error", (e) => {
                clearTimeout(timer);
                log(`  TLS over CONNECT ${proxyPort}: ERROR ${e.message}`);
                socket.destroy();
                resolve(false);
            });
            tlsReq.on("timeout", () => {
                clearTimeout(timer);
                log(`  TLS over CONNECT ${proxyPort}: TIMEOUT`);
                tlsReq.destroy();
                socket.destroy();
                resolve(false);
            });
            tlsReq.end();
        });

        connReq.on("error", (e) => {
            clearTimeout(timer);
            log(`  CONNECT ${proxyPort}: ERROR ${e.message}`);
            resolve(false);
        });

        connReq.on("timeout", () => {
            clearTimeout(timer);
            log(`  CONNECT ${proxyPort}: TIMEOUT`);
            connReq.destroy();
            resolve(false);
        });

        connReq.end();
    });
}

// Test 3: Full Firebase login via CONNECT tunnel
async function testFirebaseViaProxy(proxyPort, email, password) {
    log(`--- FIREBASE VIA PROXY ${proxyPort} ---`);
    const payload = JSON.stringify({ email, password, returnSecureToken: true });
    const url = `https://${FIREBASE_HOST}/v1/accounts:signInWithPassword?key=${FIREBASE_KEY}`;
    const parsed = new URL(url);

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            log(`  FIREBASE proxy ${proxyPort}: OVERALL TIMEOUT (15s)`);
            resolve(null);
        }, 15000);

        const connReq = http.request({
            host: PROXY_HOST,
            port: proxyPort,
            method: "CONNECT",
            path: `${parsed.hostname}:443`,
            timeout: 5000,
        });

        connReq.on("connect", (res, socket) => {
            log(`  FIREBASE proxy ${proxyPort}: CONNECT status=${res.statusCode}`);
            if (res.statusCode !== 200) {
                clearTimeout(timer);
                socket.destroy();
                resolve(null);
                return;
            }

            const req = https.request({
                socket,
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payload),
                    Host: parsed.hostname,
                },
                servername: parsed.hostname,
                rejectUnauthorized: false,
                timeout: 10000,
            }, (resp) => {
                let data = "";
                resp.on("data", (c) => data += c);
                resp.on("end", () => {
                    clearTimeout(timer);
                    try {
                        const j = JSON.parse(data);
                        if (j.idToken) {
                            log(`  FIREBASE proxy ${proxyPort}: OK token=${j.idToken.length}c`);
                            resolve(j);
                        } else {
                            log(`  FIREBASE proxy ${proxyPort}: NO_TOKEN resp=${data.substring(0, 200)}`);
                            resolve(null);
                        }
                    } catch {
                        log(`  FIREBASE proxy ${proxyPort}: PARSE_FAIL resp=${data.substring(0, 200)}`);
                        resolve(null);
                    }
                });
            });
            req.on("error", (e) => {
                clearTimeout(timer);
                log(`  FIREBASE proxy ${proxyPort}: REQ_ERROR ${e.message}`);
                socket.destroy();
                resolve(null);
            });
            req.on("timeout", () => {
                clearTimeout(timer);
                log(`  FIREBASE proxy ${proxyPort}: REQ_TIMEOUT`);
                req.destroy();
                socket.destroy();
                resolve(null);
            });
            req.write(payload);
            req.end();
        });

        connReq.on("error", (e) => {
            clearTimeout(timer);
            log(`  CONNECT ${proxyPort}: ERROR ${e.message}`);
            resolve(null);
        });
        connReq.on("timeout", () => {
            clearTimeout(timer);
            log(`  CONNECT ${proxyPort}: TIMEOUT`);
            connReq.destroy();
            resolve(null);
        });
        connReq.end();
    });
}

// Test 4: Direct HTTPS (no proxy)
async function testFirebaseDirect(email, password) {
    log("--- FIREBASE DIRECT (no proxy) ---");
    const payload = JSON.stringify({ email, password, returnSecureToken: true });
    const url = `https://${FIREBASE_HOST}/v1/accounts:signInWithPassword?key=${FIREBASE_KEY}`;
    const parsed = new URL(url);

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            log("  DIRECT: OVERALL TIMEOUT (10s)");
            resolve(null);
        }, 10000);

        const req = https.request({
            hostname: parsed.hostname,
            port: 443,
            path: parsed.pathname + parsed.search,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
                Host: parsed.hostname,
            },
            timeout: 8000,
            rejectUnauthorized: true,
        }, (resp) => {
            let data = "";
            resp.on("data", (c) => data += c);
            resp.on("end", () => {
                clearTimeout(timer);
                try {
                    const j = JSON.parse(data);
                    if (j.idToken) {
                        log(`  DIRECT: OK token=${j.idToken.length}c`);
                    } else {
                        log(`  DIRECT: NO_TOKEN resp=${data.substring(0, 200)}`);
                    }
                } catch {
                    log(`  DIRECT: PARSE_FAIL status=${resp.statusCode} resp=${data.substring(0, 200)}`);
                }
                resolve(data);
            });
        });
        req.on("error", (e) => {
            clearTimeout(timer);
            log(`  DIRECT: ERROR ${e.message}`);
            resolve(null);
        });
        req.on("timeout", () => {
            clearTimeout(timer);
            log("  DIRECT: TIMEOUT");
            req.destroy();
            resolve(null);
        });
        req.write(payload);
        req.end();
    });
}

(async () => {
    // Get first account
    const fs = require("fs");
    const storePath = "C:\\Users\\zro\\AppData\\Roaming\\Windsurf\\User\\globalStorage\\windsurf-login-accounts.json";
    let email, password;
    try {
        const data = JSON.parse(fs.readFileSync(storePath, "utf8"));
        const acc = Array.isArray(data) ? data.find(a => a.password) : Object.values(data).find(a => a.password);
        email = acc.email;
        password = acc.password;
        log(`Account: ${email.substring(0, 15)}...`);
    } catch (e) {
        log(`ACCOUNT LOAD FAIL: ${e.message}`);
        process.exit(1);
    }

    await testTcpConnect();

    for (const port of PROXY_PORTS) {
        await testConnectTunnel(port);
    }

    for (const port of PROXY_PORTS) {
        const r = await testFirebaseViaProxy(port, email, password);
        if (r) break;
    }

    await testFirebaseDirect(email, password);

    log("--- ALL TESTS DONE ---");
    process.exit(0);
})();
'''

# Compress and transfer the node script
compressed = zlib.compress(node_script.encode('utf-8'), 9)
b64 = base64.b64encode(compressed).decode('ascii')
print(f'Node script: {len(node_script)}B -> compressed {len(compressed)}B -> b64 {len(b64)} chars')

# Write the node script to remote
tmp_path = r'C:\Users\zro\.wam-hot\_node_diag.js.gz.b64'
script_path = r'C:\Users\zro\.wam-hot\_node_diag.js'

show('WRITE_SCRIPT', run(
    f"Set-Content -Path '{tmp_path}' -Value '{b64}' -NoNewline; "
    f"$b64=Get-Content -Raw '{tmp_path}'; "
    f"$compressed=[Convert]::FromBase64String($b64); "
    f"$ms=New-Object System.IO.MemoryStream(,$compressed); "
    f"$ms.Position=2; "
    f"$ds=New-Object System.IO.Compression.DeflateStream($ms,[System.IO.Compression.CompressionMode]::Decompress); "
    f"$out=New-Object System.IO.MemoryStream; "
    f"$ds.CopyTo($out); $ds.Close(); $ms.Close(); "
    f"[System.IO.File]::WriteAllBytes('{script_path}',$out.ToArray()); $out.Close(); "
    f"Remove-Item '{tmp_path}' -ErrorAction SilentlyContinue; "
    f"Write-Output ('SIZE=' + (Get-Item '{script_path}').Length)"
))

# Run the node script
print('\n--- RUNNING NODE DIAGNOSTIC ---')
show('NODE_DIAG', run(
    f'node "{script_path}" 2>&1',
    timeout=60
))

print('\n=== NODE DIAGNOSTIC COMPLETE ===')
