// Router 専用の中継サーバー（Cloudflare Workers 用）
// 食べログ・Googleマップの公開ページを取得し、名前・位置・写真を読み取れるようにする。
// 許可したサイト以外には中継しない。
const ALLOW = /^(?:[a-z0-9-]+\.)*(tabelog\.com|google\.com|google\.co\.jp|goo\.gl|maps\.app\.goo\.gl|g\.co)$/i;
const ORIGIN = 'https://dnts2100-droid.github.io';

export default {
  async fetch(req) {
    const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Expose-Headers': 'X-Final-URL' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    const target = new URL(req.url).searchParams.get('url');
    let u;
    try { u = new URL(target); } catch { return new Response('bad url', { status: 400, headers: cors }); }
    if (u.protocol !== 'https:' || !ALLOW.test(u.hostname)) return new Response('not allowed', { status: 403, headers: cors });
    const res = await fetch(u.toString(), {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'Accept-Language': 'ja-JP,ja;q=0.9' },
      cf: { cacheTtl: 86400 }
    });
    const html = (await res.text()).slice(0, 1500000);
    return new Response(html, { status: res.status, headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'X-Final-URL': res.url, 'Cache-Control': 'public, max-age=86400' } });
  }
};
