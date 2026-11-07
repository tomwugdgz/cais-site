// 独立 Cloudflare Worker · 抓取代理
// 用途：当你把 cais.html 部署到不支持 Function 的静态托管（如 GitHub Pages、
// 腾讯云 COS、任意虚拟主机）时，单独部署这个 Worker，把它的地址填进页面的
// 「高级 → 独立代理地址」，或直接用 ?proxy=地址 预置在分享链接里。
//
// 部署：Cloudflare Dashboard → Workers & Pages → Create Worker → 粘贴本文件 → Deploy

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 12000;
const BLOCKED_TYPE = /^(image|audio|video|font|application\/(octet-stream|pdf|zip|x-))/i;

const PRIVATE_HOST = [
  /^localhost$/i, /^127\./, /^0\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./,
  /^::1$/, /^fc/i, /^fd/i, /^fe80:/i,
  /^metadata\.google\.internal$/i, /\.internal$/i, /\.local$/i
];

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': cors ? '*' : 'null'
    }
  });
}

export default {
  async fetch(request) {
    const self = new URL(request.url);
    const target = self.searchParams.get('url');

    // 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,OPTIONS',
          'access-control-allow-headers': '*',
          'access-control-max-age': '86400'
        }
      });
    }

    if (!target) {
      return json({ ok: true, service: 'geo-audit-proxy', usage: 'GET ?url=<encoded>' }, 200, true);
    }

    let u;
    try { u = new URL(target); } catch (e) { return json({ error: 'bad url' }, 400, true); }
    if (!/^https?:$/.test(u.protocol)) return json({ error: 'protocol not allowed' }, 400, true);
    if (PRIVATE_HOST.some(re => re.test(u.hostname))) return json({ error: 'private address blocked' }, 403, true);

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

      if (!upstream.ok) return json({ error: 'upstream returned ' + upstream.status }, 502, true);

      const ct = upstream.headers.get('content-type') || '';
      if (BLOCKED_TYPE.test(ct)) return json({ error: 'content type not allowed: ' + ct }, 415, true);

      const clen = parseInt(upstream.headers.get('content-length') || '0', 10);
      if (clen && clen > MAX_BYTES) return json({ error: 'response too large' }, 413, true);

      let body = await upstream.text();
      if (body.length > MAX_BYTES) body = body.slice(0, MAX_BYTES);

      return new Response(body, {
        status: 200,
        headers: {
          'content-type': ct || 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'access-control-allow-origin': '*',
          'x-upstream-status': String(upstream.status)
        }
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = e && e.name === 'AbortError' ? 'upstream timeout' : ('upstream error: ' + (e && e.message));
      return json({ error: msg }, 502, true);
    }
  }
};
