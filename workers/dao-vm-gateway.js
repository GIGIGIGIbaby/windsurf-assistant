// dao-vm Cloudflare Workers Gateway · 印275
// 100K requests/day FREE · Global edge · No CC
// 部署: wrangler publish 或 dash.cloudflare.com/workers

const BACKENDS = (typeof DAO_BACKENDS !== 'undefined' ? DAO_BACKENDS : '').split(',').filter(Boolean);

async function getBackend() {
  if (BACKENDS.length === 0) return null;
  return BACKENDS[Math.floor(Math.random() * BACKENDS.length)];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', provider: 'cloudflare-workers', ts: Date.now(), backends: BACKENDS.length }), 
        { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': '*' } });
    }
    
    const backend = await getBackend();
    if (!backend) return new Response(JSON.stringify({ error: 'No backend', hint: 'Set DAO_BACKENDS binding' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    
    const target = backend.replace(/\/$/, '') + url.pathname + url.search;
    const headers = new Headers(request.headers);
    headers.delete('host');
    
    try {
      const resp = await fetch(target, { method: request.method, headers, body: request.method !== 'GET' ? request.body : undefined });
      const h = new Headers(resp.headers);
      h.set('Access-Control-Allow-Origin', '*');
      return new Response(resp.body, { status: resp.status, headers: h });
    } catch(e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
  }
};
