// A1-P: a local door to a protected Vercel Preview. Every request to http://127.0.0.1:<port> is sent to PREVIEW_URL
// with the access header added here, so the capture tools, the Playwright suite and a browser can use the Preview as
// if it were a local server, and the credential never appears in a command line, a page, a trace or a screenshot.
//
// usage: PREVIEW_URL=https://<deployment>.vercel.app node preview-proxy.mjs [port=3150]
// access (one of, read from the environment, never printed):
//   VERCEL_AUTOMATION_BYPASS_SECRET  -> x-vercel-protection-bypass      (Protection Bypass for Automation)
//   VERCEL_OIDC_TOKEN                -> x-vercel-trusted-oidc-idp-token (a linked project's development token)
// With neither, requests go through unchanged (a public deployment, or to see the protection page).
// GET /__proxy/status reports how many responses were the Vercel login instead of the app: a run with any is void.
import http from 'node:http';
import https from 'node:https';

if (!process.env.PREVIEW_URL) { console.error('PREVIEW_URL is not set'); process.exit(2); }
const target = new URL(process.env.PREVIEW_URL), port = Number(process.argv[2] ?? 3150), local = `http://127.0.0.1:${port}`;
if (/^logic-island-psi\.vercel\.app$/.test(target.hostname) && process.env.ALLOW_PRODUCTION !== '1') { console.error('PREVIEW_URL is the production address; set ALLOW_PRODUCTION=1 only to compare against it'); process.exit(2); }
const access = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? ['x-vercel-protection-bypass', process.env.VERCEL_AUTOMATION_BYPASS_SECRET]
  : process.env.VERCEL_OIDC_TOKEN ? ['x-vercel-trusted-oidc-idp-token', process.env.VERCEL_OIDC_TOKEN] : null;
const client = target.protocol === 'https:' ? https : http;
const seen = { requests: 0, loginPages: 0, errors: 0, firstLoginPath: null };
/** Vercel's own login or protection page instead of the deployment. */
const isLogin = (status, headers) => (status >= 300 && status < 400 && /vercel\.com\/(sso-api|login|sso)/.test(String(headers.location ?? ''))) || (status === 401 && /_vercel_sso_nonce/.test(String(headers['set-cookie'] ?? '')));

http.createServer((req, res) => {
  if (req.url === '/__proxy/status') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ target: target.origin, access: access?.[0] ?? 'none', ...seen })); return; }
  seen.requests++;
  const headers = { ...req.headers, host: target.host };
  delete headers.connection;
  if (access) headers[access[0]] = access[1];
  const upstream = client.request({ protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, method: req.method, path: req.url, headers }, reply => {
    const out = { ...reply.headers };
    if (isLogin(reply.statusCode, out)) { seen.loginPages++; seen.firstLoginPath ??= req.url; }
    // Redirects stay on the door; the deployment's own cookies and transport rules are for its real origin.
    if (out.location) out.location = String(out.location).split(target.origin).join(local);
    delete out['strict-transport-security']; delete out['set-cookie'];
    res.writeHead(reply.statusCode ?? 502, out);
    reply.pipe(res);
  });
  upstream.on('error', error => { seen.errors++; res.writeHead(502, { 'content-type': 'text/plain' }); res.end(`proxy: ${error.code ?? error.message}`); });
  req.pipe(upstream);
}).listen(port, '127.0.0.1', () => console.log(`${local} -> ${target.origin} (access: ${access?.[0] ?? 'none'})`));
