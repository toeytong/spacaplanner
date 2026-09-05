import planner from './index.js';

const encoder = new TextEncoder();
let cachedKeys = { issuer: '', expires: 0, keys: [] };
const reply = (data, status) => Response.json(data, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const decode = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

// Only cryptographically verified Cloudflare Access claims become a planner identity.
// In particular, never trust the OpenAI identity headers supplied by an Internet client.
export async function verifiedIdentity(request, env, ctx = {}) {
  if (!env.ACCESS_ISSUER || !env.ACCESS_AUD) return null;
  const issuer = env.ACCESS_ISSUER.replace(/\/$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)) return null;
  if (ctx.access?.aud === env.ACCESS_AUD) {
    const identity = await ctx.access.getIdentity();
    return identity?.email ? identity : null;
  }
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || token.length > 16000) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Date.now() / 1000;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || claims.iss !== issuer ||
        !Array.isArray(claims.aud) || !claims.aud.includes(env.ACCESS_AUD) ||
        !Number.isFinite(claims.exp) || claims.exp <= now ||
        (claims.nbf != null && (!Number.isFinite(claims.nbf) || claims.nbf > now + 30)) ||
        typeof claims.email !== 'string' || !claims.email.includes('@') || typeof claims.sub !== 'string') return null;
    if (cachedKeys.issuer !== issuer || cachedKeys.expires < Date.now()) {
      const response = await fetch(`${issuer}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      const jwks = await response.json();
      cachedKeys = { issuer, expires: Date.now() + 300000, keys: jwks.keys || [] };
    }
    const jwk = cachedKeys.keys.find(key => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) { cachedKeys.expires = 0; return null; }
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`))) return null;
    return claims;
  } catch { return null; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!['GET','HEAD'].includes(request.method)) {
      if (request.headers.get('origin') !== url.origin || !request.headers.get('content-type')?.startsWith('application/json')) {
        // DELETE has no body, but still requires a same-origin browser request.
        if (request.method !== 'DELETE' || request.headers.get('origin') !== url.origin) return reply({ error: 'Invalid request origin' }, 403);
      }
      if (Number(request.headers.get('content-length')) > 2200000) return reply({ error: 'Request too large' }, 413);
    }
    const identity = await verifiedIdentity(request, env, ctx);
    if (!identity) return reply({ error: 'Sign in required', authenticated: false, access: false }, 401);
    const cleanHeaders = new Headers(request.headers);
    for (const name of [...cleanHeaders.keys()]) if (name.startsWith('oai-authenticated-')) cleanHeaders.delete(name);
    const email = identity.email.trim().toLowerCase();
    cleanHeaders.set('oai-authenticated-user-id', `cloudflare:${email}`);
    cleanHeaders.set('oai-authenticated-user-email', email);
    cleanHeaders.set('oai-authenticated-user-full-name', encodeURIComponent(identity.name || email));
    cleanHeaders.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');
    try {
      return await planner.fetch(new Request(request, { headers: cleanHeaders }), env, ctx);
    } catch {
      return reply({ error: 'Cloud service unavailable. Please retry.' }, 503);
    }
  }
};
