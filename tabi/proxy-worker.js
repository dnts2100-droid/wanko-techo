const ALLOW = /^(?:[a-z0-9-]+\.)*(tabelog\.com|google\.com|google\.co\.jp|goo\.gl|maps\.app\.goo\.gl|g\.co)$/i;
const ORIGIN = 'https://dnts2100-droid.github.io';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export default {
  async fetch(req) {
    const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Expose-Headers': 'X-Final-URL' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    let u;
    try { u = new URL(new URL(req.url).searchParams.get('url')); } catch { return new Response('bad url', { status: 400, headers: cors }); }
    if (u.protocol !== 'https:' || !ALLOW.test(u.hostname)) return new Response('not allowed', { status: 403, headers: cors });
    const headers = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'ja-JP,ja;q=0.9' };
    // 転送（短縮URL）を1段ずつたどる。Googleマップの場所URLに着いたら中身は読まずにURLだけ返す
    let url = u.toString(), res;
    for (let i = 0; i < 6; i++) {
      const isMapsPage = /^https:\/\/(www\.)?google\.[^/]+\/maps|^https:\/\/maps\.google\./.test(url);
      if (isMapsPage) return new Response('', { headers: { ...cors, 'X-Final-URL': url, 'Cache-Control': 'public, max-age=86400' } });
      res = await fetch(url, { redirect: 'manual', headers, cf: { cacheTtl: 86400 } });
      const loc = res.headers.get('Location');
      if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url).toString(); continue; }
      break;
    }
    const html = (await res.text()).slice(0, 1500000);
    return new Response(html, { status: res.status, headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'X-Final-URL': url, 'Cache-Control': 'public, max-age=86400' } });
  }
};
