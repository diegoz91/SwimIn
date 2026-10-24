/**
 * /u/:id — scheda pubblica di un profilo. Restituisce la stessa app (index.html),
 * ma con titolo, descrizione e immagine del profilo nei meta tag: così l'anteprima
 * su WhatsApp, LinkedIn, Facebook e nei motori di ricerca mostra la persona o la piscina.
 */
import { callPublic, escapeHtml, originOf, setMeta } from './_public.js';

export function renderProfileHtml(html, data, { origin, id }) {
    const url = `${origin}/u/${encodeURIComponent(id)}`;
    if (!data) return setMeta(setMeta(html, 'name', 'robots', 'noindex'), 'property', 'og:url', url);
    const place = [data.city, data.province && `(${data.province})`].filter(Boolean).join(' ');
    const title = `${data.name}${data.headline ? ` · ${data.headline}` : ''} | SwimIn`;
    const description =
        data.kind === 'structure'
            ? [data.headline, place, data.rating ? `${String(data.rating.average).replace('.', ',')} su 5 (${data.rating.count} recensioni)` : '', (data.services || []).slice(0, 4).join(', ')].filter(Boolean).join(' · ')
            : [data.headline, place, (data.certifications || []).slice(0, 3).map((c) => c.name).join(', ')].filter(Boolean).join(' · ');
    const image = /^https:\/\//.test(data.avatar || '') ? data.avatar : `${origin}/og-image.png`;
    let out = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
    out = setMeta(out, 'name', 'description', description);
    out = setMeta(out, 'property', 'og:type', data.kind === 'structure' ? 'place' : 'profile');
    out = setMeta(out, 'property', 'og:title', title);
    out = setMeta(out, 'property', 'og:description', description);
    out = setMeta(out, 'property', 'og:url', url);
    out = setMeta(out, 'property', 'og:image', image);
    out = setMeta(out, 'name', 'twitter:card', image.endsWith('/og-image.png') ? 'summary_large_image' : 'summary');
    if (!image.endsWith('/og-image.png')) {
        out = out.replace(/\s*<meta property="og:image:width"[^>]*>/i, '').replace(/\s*<meta property="og:image:height"[^>]*>/i, '');
    }
    const jsonLd =
        data.kind === 'structure'
            ? { '@context': 'https://schema.org', '@type': 'SportsActivityLocation', name: data.name, url, image, address: { '@type': 'PostalAddress', streetAddress: data.address || undefined, addressLocality: data.city || undefined, addressRegion: data.province || undefined, addressCountry: 'IT' }, telephone: data.phone || undefined, ...(data.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: data.rating.average, reviewCount: data.rating.count } } : {}) }
            : { '@context': 'https://schema.org', '@type': 'Person', name: data.name, jobTitle: data.headline, url, image, address: data.city ? { '@type': 'PostalAddress', addressLocality: data.city, addressCountry: 'IT' } : undefined };
    out = out.replace('</head>', `    <link rel="canonical" href="${escapeHtml(url)}" />\n    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>\n  </head>`);
    return out;
}

export default async function handler(req, res) {
    const id = String(req.query.id || '').slice(0, 36);
    const origin = originOf(req);
    let html;
    try {
        html = await (await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(5000) })).text();
    } catch (err) {
        console.error('index.html non raggiungibile:', err);
        res.setHeader('Location', `/index.html#/u/${encodeURIComponent(id)}`);
        return res.status(302).end();
    }
    let data = null;
    if (/^[A-Za-z0-9_.-]{1,36}$/.test(id)) {
        try {
            data = await callPublic('publicProfile', { id });
        } catch (err) {
            // Profilo privato o inesistente: l'app mostrerà il messaggio, i motori di ricerca non indicizzano.
            if (!err.status || err.status >= 500) console.error('Profilo pubblico:', err.message);
        }
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    return res.status(200).send(renderProfileHtml(html, data, { origin, id }));
}
