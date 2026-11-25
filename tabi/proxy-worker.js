// Router 中継サーバー（Cloudflare Workers）
// ・食べログ／Googleマップの短縮リンクをたどり、最終URLとページ内容を返す
// ・Googleマップは本ページが読めない（429）ため、埋め込み用ページから名前・住所・座標を取り出す
// ・?q=店名 エリア で、Googleマップの検索結果の位置を返す
const ALLOW = /^(?:[a-z0-9-]+\.)*(tabelog\.com|google\.com|google\.co\.jp|goo\.gl|maps\.app\.goo\.gl|g\.co|share\.google)$/i;
const ORIGIN = 'https://dnts2100-droid.github.io';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const GH = { 'User-Agent': DESKTOP, 'Accept': 'text/html', 'Accept-Language': 'ja-JP,ja;q=0.9' };

async function getHTML(u) {
  try { const r = await fetch(u, { headers: GH, cf: { cacheTtl: 86400 } }); return { st: r.status, html: r.ok ? (await r.text()).slice(0, 1500000) : '' }; }
  catch (e) { return { st: 0, html: '' }; }
}
// 埋め込みページ・通常ページの両方から、名前・住所・座標を取り出す
function pick(html) {
  const o = {};
  const c = html.match(/\[\[\[[\d.]+,(-?\d+\.\d+),(-?\d+\.\d+)\]/);
  if (c) { o.lat = +c[2]; o.lng = +c[1]; }
  else { const s = html.match(/center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/) || html.match(/\[null,null,(-?\d+\.\d{3,}),(-?\d+\.\d{3,})\]/); if (s) { o.lat = +s[1]; o.lng = +s[2]; } }
  const og = html.match(/<meta[^>]+(?:property|itemprop)="(?:og:title|name)"[^>]*content="([^"]*)"/) || html.match(/<meta[^>]+content="([^"]*)"[^>]*(?:property|itemprop)="(?:og:title|name)"/);
  if (og) { const [n, ...a] = og[1].replace(/&amp;/g, '&').split(/\s*·\s*/); if (n && !/^Google/.test(n)) o.name = n; if (a.length) o.addr = a.join(' '); }
  if (!o.addr) { const a = html.match(/〒\s?\d{3}-\d{4}\s?[^"\\]{3,80}/); if (a) o.addr = a[0]; }
  return o;
}
const embedQ = q => 'https://www.google.com/maps/embed?pb=!1m2!2m1!1s' + encodeURIComponent(q.replace(/!/g, ' '));
async function placeFromQuery(q) { const { st, html } = await getHTML(embedQ(q)); return { ...pick(html), st, via: 'embed-q' }; }
function placeFromURL(url) {
  const o = {}; let d = url; try { d = decodeURIComponent(url); } catch (e) {}
  const n = d.match(/\/maps\/place\/([^/@?]+)/); if (n) o.name = n[1].replace(/\+/g, ' ');
  const q = d.match(/[?&](?:q|query|daddr)=([^&]+)/); if (q && !o.name && !/^-?[\d.]+,/.test(q[1])) { const [a, ...b] = q[1].replace(/\+/g, ' ').split(/\s*[,，、]\s*/); o.name = a; if (b.length) o.addr = b.join(' '); }
  const cid = d.match(/[?&]cid=(\d+)/) || null; if (cid) o.cid = cid[1];
  const ft = d.match(/(?:!1s|ftid=)0x[0-9a-f]+:(0x[0-9a-f]+)/i); if (ft && !o.cid) o.cid = BigInt(ft[1]).toString();
  return o;
}

export default {
  async fetch(req) {
    const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Expose-Headers': 'X-Final-URL, X-Place' };
    const J = (o, extra = {}) => new Response(JSON.stringify(o), { headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'X-Place': '1', 'Cache-Control': 'public, max-age=86400', ...extra } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    const sp = new URL(req.url).searchParams;
    // 店名での位置検索
    if (sp.get('q')) return J(await placeFromQuery(sp.get('q').slice(0, 120)));
    let u;
    try { u = new URL(sp.get('url')); } catch { return new Response('bad url', { status: 400, headers: cors }); }
    if (u.protocol !== 'https:' || !ALLOW.test(u.hostname)) return new Response('not allowed', { status: 403, headers: cors });
    const headers = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'ja-JP,ja;q=0.9' };
    let url = u.toString(), res;
    for (let i = 0; i < 6; i++) {
      if (/^https:\/\/(www\.)?google\.[^/]+\/(maps|search)|^https:\/\/maps\.google\./.test(url)) {
        // 座標がURLに入っていれば、そのまま返す
        if (/!3d-?[\d.]+!4d-?[\d.]+|@-?[\d.]+,-?[\d.]+/.test(url) && !/\/maps\/embed/.test(url)) return new Response('', { headers: { ...cors, 'X-Final-URL': url, 'Cache-Control': 'public, max-age=86400' } });
        const base = placeFromURL(url); let out = { final: url, ...base };
        if (sp.get('raw') === '1' && /output=embed|\/maps\/embed/.test(url)) { const { html } = await getHTML(url); return new Response(html, { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } }); }
        if (base.cid) { const { st, html } = await getHTML('https://maps.google.com/maps?cid=' + base.cid + '&output=embed&hl=ja'); const p = pick(html); out = { ...out, ...p, name: base.name || p.name, st, via: 'embed-cid' }; }
        if (out.lat == null && (out.name || base.addr)) { const p = await placeFromQuery([out.name, base.addr || out.addr].filter(Boolean).join(' ')); out = { ...out, lat: p.lat, lng: p.lng, addr: out.addr || p.addr, st: p.st, via: 'embed-q' }; }
        return J(out, { 'X-Final-URL': url });
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
