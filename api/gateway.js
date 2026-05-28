// api/gateway.js · Vercel Serverless Function · 印275
// dao-vm代理网关 · 无限调用/月 · 全球CDN · 无需CC
export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '/';
  if (url.includes('/health')) {
    return res.status(200).json({ status: 'ok', provider: 'vercel', ts: Date.now() });
  }

  const backends = (process.env.DAO_BACKENDS || '').split(',').filter(Boolean);
  if (!backends.length) {
    return res.status(503).json({ error: 'No backend', hint: 'Set DAO_BACKENDS in Vercel env vars with VM URLs' });
  }

  const backend = backends[Math.floor(Math.random() * backends.length)];
  const targetPath = url.replace(/^\/api\/gateway/, '') || '/';
  const targetUrl = backend.replace(/\/$/, '') + targetPath;

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: { 'content-type': req.headers['content-type'] || 'application/json' },
      body: ['GET','HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
    });
    const body = await upstream.text();
    res.status(upstream.status);
    if (upstream.headers.get('content-type')) res.setHeader('Content-Type', upstream.headers.get('content-type'));
    res.setHeader('X-Dao-Vm-Backend', backend.slice(0,50));
    res.end(body);
  } catch(e) {
    res.status(502).json({ error: e.message });
  }
}
