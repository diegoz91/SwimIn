/** /sitemap.xml — pagine pubbliche: home, pagine legali, profili pubblici e offerte di lavoro aperte. */
import { callPublic, escapeHtml, originOf } from './_public.js';

export function renderSitemap(origin, rows, jobs = []) {
    const urls = [
        { loc: `${origin}/`, priority: '1.0' },
        { loc: `${origin}/register`, priority: '0.6' },
        { loc: `${origin}/privacy`, priority: '0.2' },
        { loc: `${origin}/termini`, priority: '0.2' },
        { loc: `${origin}/cookie`, priority: '0.2' },
        ...rows.map((r) => ({ loc: `${origin}/u/${encodeURIComponent(r.id)}`, lastmod: (r.updatedAt || '').slice(0, 10), priority: '0.7' })),
        ...jobs.map((j) => ({ loc: `${origin}/offerte/${encodeURIComponent(j.id)}`, lastmod: (j.updatedAt || '').slice(0, 10), priority: '0.8' })),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`)
        .join('\n')}\n</urlset>\n`;
}

export default async function handler(req, res) {
    const [rows, jobs] = await Promise.all([
        callPublic('publicSitemap').catch((err) => { console.error('Sitemap:', err.message); return []; }),
        callPublic('publicJobs').catch((err) => { console.error('Sitemap (offerte):', err.message); return []; }),
    ]);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(renderSitemap(originOf(req), rows, jobs));
}
