const { localConfig, isolate, root } = require('./runtime.cjs');
const config = localConfig();
isolate(config);
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const next = require('next');
const identity = { environment: 'maroon-auth-test', backend: 'main', supabase: config.API_URL,
  buildId: fs.readFileSync(path.join(root, '.next/BUILD_ID'), 'utf8').trim(),
  readContractHash: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'lib/platform/golfTripReadApi.ts'))).digest('hex') };
const app = next({ dev: false, dir: root, hostname: '127.0.0.1', port: 3997 });
app.prepare().then(() => {
  const handler = app.getRequestHandler();
  require('node:http').createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:3997');
    if (url.pathname === '/__local_identity' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify(identity));
    }
    const read = req.method === 'GET' && (/^\/api\/golf-trips(?:\/[0-9a-f-]{36})?$/.test(url.pathname) || url.pathname === '/api/account/me');
    if (!read && !(req.method === 'POST' && url.pathname === '/api/auth/signout')) {
      res.writeHead(404); return res.end();
    }
    return handler(req, res);
  }).listen(3997, '127.0.0.1', () => console.log('Isolated main ready on 127.0.0.1:3997; maroon-auth-test verified.'));
}).catch(() => { console.error('Isolated main startup failed.'); process.exitCode = 1; });
