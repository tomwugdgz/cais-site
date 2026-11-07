// Cloudflare Pages Function · 同源抓取代理
// 路由: GET /api/fetch?url=<encoded http(s) url>
// 无 url 参数时返回自检 JSON，供前端探测通道是否可用。

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 12000;

const BLOCKED_TYPE = /^(image|audio|video|font|application\/(octet-stream|pdf|zip|x-))/i;

// 内网与云元数据地址，防 SSRF
const PRIVATE_HOST = [
  /^localhost$/i, /^127\./, /^0\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./,
  /^::1$/, /^fc/i, /^fd/i, /^fe80:/i,
  /^metadata\.google\.internal$/i, /\.internal$/i, /\.local$/i
];

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestGet(context) {
  return handle(context.request);
}

async function handle(request) {
  const self = new URL(request.url);
  const target = self.searchParams.get('url');

  if (!target) {
    return json({ ok: true, service: 'geo-audit-proxy', usage: 'GET /api/fetch?url=<encoded>' });
  }

  // 防盗链：带 Referer 时必须同源
  const ref = request.headers.get('referer');
  if (ref) {
    let refHost = '';
    try { refHost = new URL(ref).hostname; } catch (e) { return json({ error: 'bad referer' }, 403); }
    if (refHost !== self.hostname) return json({ error: 'forbidden' }, 403);
  }

  let u;
  try { u = new URL(target); } catch (e) { return json({ error: 'bad url' }, 400); }
  if (!/^https?:$/.test(u.protocol)) return json({ error: 'protocol not allowed' }, 400);
  if (PRIVATE_HOST.some(re => re.test(u.hostname))) return json({ error: 'private address blocked' }, 403);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(u.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/ld+json;q=0.9,text/plain;q=0.8,*/*;q=0.7',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      return json({ error: 'upstream returned ' + upstream.status }, 502);
    }

    const ct = upstream.headers.get('content-type') || '';
    if (BLOCKED_TYPE.test(ct)) return json({ error: 'content type not allowed: ' + ct }, 415);

    const clen = parseInt(upstream.headers.get('content-length') || '0', 10);
    if (clen && clen > MAX_BYTES) return json({ error: 'response too large' }, 413);

    let body = await upstream.text();
    if (body.length > MAX_BYTES) body = body.slice(0, MAX_BYTES);

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': ct || 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-upstream-status': String(upstream.status)
      }
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e && e.name === 'AbortError' ? 'upstream timeout' : ('upstream error: ' + (e && e.message));
    return json({ error: msg }, 502);
  }
}
