// Local test tooling only. Never import into an application/client bundle.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
function localConfig() {
  try {
  const inspected = JSON.parse(execFileSync('docker', ['inspect', 'supabase_db_maroon-auth-test'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0];
  if (inspected.Config.Labels['com.supabase.cli.project'] !== 'maroon-auth-test'
    || !inspected.NetworkSettings.Ports['5432/tcp'].some(binding => binding.HostPort === '55322')) throw new Error('Wrong local database identity');
  const workdir = inspected.Config.Labels['com.supabase.cli.workdir'];
  const cli = path.join(root, 'node_modules/@supabase/cli-windows-x64/bin/supabase.exe');
  const raw = execFileSync(cli, ['status', '--workdir', workdir, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const config = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  if (config.API_URL !== 'http://127.0.0.1:55321' || !config.SERVICE_ROLE_KEY || !config.ANON_KEY) throw new Error('Wrong isolated Auth endpoint');
  return config;
  } catch {
    // Never include captured CLI/container output (which can contain local secrets).
    throw new Error('Unable to verify the isolated maroon-auth-test configuration.');
  }
}
function isolate(config) {
  for (const key of Object.keys(process.env)) if (/SUPABASE/i.test(key)) delete process.env[key];
  Object.assign(process.env, { SUPABASE_URL: config.API_URL, SUPABASE_ANON_KEY: config.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: config.SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL: config.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: config.ANON_KEY });
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !['3997', '4100', '55321', '55324'].includes(url.port)) throw new Error('Blocked non-isolated fetch destination');
    return original(input, { ...init, redirect: 'error' });
  };
  for (const name of ['http', 'https']) {
    const transport = require(`node:${name}`);
    for (const method of ['request', 'get']) {
      const originalRequest = transport[method];
      transport[method] = function (input, ...rest) {
        const hostname = typeof input === 'string' ? new URL(input).hostname : input instanceof URL ? input.hostname : input.hostname || input.host;
        if (hostname !== '127.0.0.1' && hostname !== 'localhost') throw new Error('Blocked non-local HTTP transport');
        return originalRequest.call(this, input, ...rest);
      };
    }
  }
}
module.exports = { localConfig, isolate, root };
