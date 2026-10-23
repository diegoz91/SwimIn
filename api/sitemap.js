/** /sitemap.xml — pagine pubbliche: home, pagine legali e profili pubblici. */
import { callPublic, escapeHtml, originOf } from './_public.js';

export function renderSitemap(origin, rows) {
    const urls = [
        { loc: `${origin}/`, priority: '1.0' },
        { loc: `${origin}/register`, priority: '0.6' },
        { loc: `${origin}/privacy`, priority: '0.2' },
        { loc: `${origin}/termini`, priority: '0.2' },
        { loc: `${origin}/cookie`, priority: '0.2' },
        ...rows.map((r) => ({ loc: `${origin}/u/${encodeURIComponent(r.id)}`, lastmod: (r.updatedAt || '').slice(0, 10), priority: '0.7' })),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`)
        .join('\n')}\n</urlset>\n`;
}

export default async function handler(req, res) {
    let rows = [];
    try {
        rows = await callPublic('publicSitemap');
    } catch (err) {
        console.error('Sitemap:', err.message);
    }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(renderSitemap(originOf(req), rows));
}
