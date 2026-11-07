// CAIS · 单端口 Node 服务
// 1) 静态托管 cais.html
// 2) 同源抓取代理 /api/fetch?url=<encoded>
// 无外部依赖，Node 18+ 可跑。

const http = require('http');
const fs = require('fs');
const path = require('path');
const dns = require('dns/promises');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const MAX_HOPS = 5;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const BLOCKED_TYPE = /^(image|audio|video|font|application\/(octet-stream|pdf|zip|x-))/i;

const PRIVATE_HOST = [
  /^localhost$/i, /^127\./, /^0\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-2]\d)\./,
  /^::1$/, /^fc/i, /^fd/i, /^fe80:/i,
  /^metadata\.google\.internal$/i, /\.internal$/i, /\.local$/i
];

/* ---------- SSRF 校验 ---------- */

function isPrivateIp(ip) {
  if (!ip) return false;
  const v = String(ip).toLowerCase();
  if (v === '::1' || v === '0:0:0:0:0:0:0:1') return true;
  if (/^f[cd]/i.test(v)) return true;      // fc00::/7 唯一本地
  if (/^fe80:/i.test(v)) return true;      // 链路本地
  const m = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const ip4 = m ? m[1] : v;
  const p = ip4.split('.').map(Number);
  if (p.length !== 4 || p.some(n => isNaN(n))) return false;
  const [a, b] = p;
  if (a === 127 || a === 0 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

// 解析域名全部 A/AAAA 记录，任一命中私有段即拦截
async function dnsGuard(hostname) {
  if (PRIVATE_HOST.some(re => re.test(hostname))) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return isPrivateIp(hostname);
  try {
    const list = await dns.lookup(hostname, { all: true });
    return list.some(r => isPrivateIp(r.address));
  } catch (e) {
    return false; // 解析失败交给 fetch 阶段报错
  }
}

/* ---------- 抓取 ---------- */

async function grab(target, hops) {
  if (hops > MAX_HOPS) return { err: 'too many redirects' };

  let u;
  try { u = new URL(target); } catch (e) { return { err: 'bad url' }; }
  if (!/^https?:$/.test(u.protocol)) return { err: 'protocol not allowed' };
  if (await dnsGuard(u.hostname)) return { err: 'private address blocked', code: 403 };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(u.href, {
      signal: ac.signal,
      redirect: 'manual',
      headers: {
        'user-agent': UA,
        'accept': 'text/html,application/xhtml+xml,application/ld+json;q=0.9,text/plain;q=0.8,*/*;q=0.7',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });
    clearTimeout(timer);

    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get('location');
      if (!loc) return { err: 'redirect without location' };
      return grab(new URL(loc, u.href).href, hops + 1);
    }
    if (!r.ok) return { err: 'upstream returned ' + r.status, code: 502 };

    const ct = r.headers.get('content-type') || '';
    if (BLOCKED_TYPE.test(ct)) return { err: 'content type not allowed: ' + ct, code: 415 };

    const clen = parseInt(r.headers.get('content-length') || '0', 10);
    if (clen && clen > MAX_BYTES) return { err: 'response too large', code: 413 };

    let body = await r.text();
    if (body.length > MAX_BYTES) body = body.slice(0, MAX_BYTES);

    return { body, ct: ct || 'text/html; charset=utf-8', status: r.status };
  } catch (e) {
    clearTimeout(timer);
    const msg = e && e.name === 'AbortError' ? 'upstream timeout' : ('upstream error: ' + (e && e.message));
    return { err: msg, code: 502 };
  }
}

/* ---------- 响应辅助 ---------- */

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  }, headers || {}));
  res.end(body);
}

function sendJson(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'content-type': 'application/json; charset=utf-8' });
}

/* ---------- 静态文件 ---------- */

function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/cais.html';

  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT)) return send(res, 403, 'forbidden');

  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) {
      // 无扩展名时补 .html，兼容 /cais 这类访问
      if (!path.extname(abs)) {
        const html = abs + '.html';
        return fs.stat(html, (e2, s2) => {
          if (e2 || !s2.isFile()) return send(res, 404, 'not found');
          pipe(res, html, s2.size);
        });
      }
      return send(res, 404, 'not found');
    }
    pipe(res, abs, st.size);
  });
}

function pipe(res, file, size) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'content-length': size,
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*'
  });
  fs.createReadStream(file).pipe(res);
}

/* ---------- 主服务 ---------- */

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  if (u.pathname === '/api/fetch') {
    const target = u.searchParams.get('url');

    if (!target) {
      return sendJson(res, 200, {
        ok: true,
        service: 'cais-proxy',
        usage: 'GET /api/fetch?url=<encoded http(s) url>'
      });
    }

    // 带 Referer 时必须同源，防盗用
    const ref = req.headers.referer || req.headers.referrer;
    if (ref) {
      let rh = '';
      try { rh = new URL(ref).hostname; } catch (e) { return sendJson(res, 403, { error: 'bad referer' }); }
      if (rh !== u.hostname) return sendJson(res, 403, { error: 'forbidden' });
    }

    const out = await grab(target, 0);
    if (out.err) return sendJson(res, out.code || 400, { error: out.err });
    return send(res, 200, out.body, {
      'content-type': out.ct,
      'x-upstream-status': String(out.status)
    });
  }

  if (u.pathname === '/healthz') return sendJson(res, 200, { ok: true });

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');

  return serveStatic(res, u.pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[cais] listening on 0.0.0.0:' + PORT);
});
