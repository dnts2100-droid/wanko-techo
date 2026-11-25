const ALLOW = /^(?:[a-z0-9-]+\.)*(tabelog\.com|google\.com|google\.co\.jp|goo\.gl|maps\.app\.goo\.gl|g\.co|share\.google)$/i;
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const ORIGIN = 'https://dnts2100-droid.github.io';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export default {
  async fetch(req) {
    const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Expose-Headers': 'X-Final-URL, X-Place' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    let u;
    try { u = new URL(new URL(req.url).searchParams.get('url')); } catch { return new Response('bad url', { status: 400, headers: cors }); }
    if (u.protocol !== 'https:' || !ALLOW.test(u.hostname)) return new Response('not allowed', { status: 403, headers: cors });
    const headers = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'ja-JP,ja;q=0.9' };
    // 転送（短縮URL）を1段ずつたどる。Googleマップの場所URLに着いたら中身は読まずにURLだけ返す
    let url = u.toString(), res;
    for (let i = 0; i < 6; i++) {
      const isMapsPage = /^https:\/\/(www\.)?google\.[^/]+\/(maps|search)|^https:\/\/maps\.google\./.test(url);
      if (isMapsPage) {
        // 位置（座標）がURLに入っていれば、そのまま返す
        if (/!3d-?[\d.]+!4d-?[\d.]+|@-?[\d.]+,-?[\d.]+/.test(url)) return new Response('', { headers: { ...cors, 'X-Final-URL': url, 'Cache-Control': 'public, max-age=86400' } });
        // 座標が無い形式（店名だけ・cid・q= など）は、Googleマップのページを読んで名前・住所・座標を取り出す
        let html = '', st = 0;
        try {
          const g = new URL(url); g.searchParams.set('hl', 'ja');
          const r2 = await fetch(g.toString(), { redirect: 'follow', headers: { 'User-Agent': DESKTOP, 'Accept': 'text/html', 'Accept-Language': 'ja-JP,ja;q=0.9', 'Cookie': 'CONSENT=YES+; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmphIAEaBgiA_LyaBg' }, cf: { cacheTtl: 86400 } });
          st = r2.status; if (r2.ok) html = (await r2.text()).slice(0, 1500000);
        } catch (e) {}
        const out = { final: url, status: st };
        if (html) {
          const meta = k => { const m = html.match(new RegExp('<meta[^>]+(?:property|itemprop|name)="' + k + '"[^>]*content="([^"]*)"')) || html.match(new RegExp('<meta[^>]+content="([^"]*)"[^>]*(?:property|itemprop|name)="' + k + '"')); return m ? m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"') : '' };
          const title = meta('og:title') || meta('name');
          if (title) { const [n, ...a] = title.split(/\s*·\s*/); out.name = n; out.addr = a.join(' ') }
          const c = (meta('og:image') + ' ' + meta('image')).match(/center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/) || html.match(/\[\[\[[\d.]+,(-?\d+\.\d+),(-?\d+\.\d+)\]/);
          if (c) { if (c[0].startsWith('[')) { out.lat = +c[2]; out.lng = +c[1] } else { out.lat = +c[1]; out.lng = +c[2] } }
          out.image = meta('og:image');
        }
        return new Response(JSON.stringify(out), { headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'X-Final-URL': url, 'X-Place': '1', 'Cache-Control': 'public, max-age=86400' } });
      }
      res = await fetch(url, { redirect: 'manual', headers, cf: { cacheTtl: 86400 } });
      const loc = res.headers.get('Location');
      if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url).toString(); continue; }
      break;
    }
    const html = (await res.text()).slice(0, 1500000);
    return new Response(html, { status: res.status, headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'X-Final-URL': url, 'Cache-Control': 'public, max-age=86400' } });
  }
};
