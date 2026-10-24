/**
 * /offerte/:id — pagina pubblica di un annuncio. Restituisce la stessa app (index.html)
 * con titolo, descrizione e dati strutturati schema.org/JobPosting: così l'offerta compare
 * in Google Jobs e l'anteprima su WhatsApp e social mostra ruolo, struttura e città.
 */
import { callPublic, escapeHtml, originOf, safeJson, setMeta } from './_public.js';

const EMPLOYMENT = { 'full-time': 'FULL_TIME', 'part-time': 'PART_TIME', stagionale: 'TEMPORARY', collaborazione: 'CONTRACTOR', tirocinio: 'INTERN' };

export function jobPosting(job, url) {
    const validThrough = job.expiresAt ? `${job.expiresAt}T23:59:59+01:00` : undefined;
    const salary = job.salaryMin || job.salaryMax
        ? { '@type': 'MonetaryAmount', currency: 'EUR', value: { '@type': 'QuantitativeValue', ...(job.salaryMin ? { minValue: job.salaryMin } : {}), ...(job.salaryMax ? { maxValue: job.salaryMax } : {}), unitText: job.isSOS ? 'DAY' : 'MONTH' } }
        : undefined;
    const details = [
        job.requirements?.length ? `<p><strong>Requisiti</strong></p><ul>${job.requirements.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : '',
        job.qualifications?.length ? `<p><strong>Brevetti richiesti</strong></p><ul>${job.qualifications.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : '',
    ].join('');
    return {
        '@context': 'https://schema.org',
        '@type': 'JobPosting',
        title: job.title,
        description: `<p>${escapeHtml(job.description).replace(/\n+/g, '</p><p>')}</p>${details}`,
        datePosted: (job.postedAt || '').slice(0, 10) || undefined,
        validThrough,
        employmentType: EMPLOYMENT[job.contractType] || 'OTHER',
        hiringOrganization: { '@type': 'Organization', name: job.structureName, ...(job.structureLogo ? { logo: job.structureLogo } : {}) },
        jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.city || undefined, addressRegion: job.province || undefined, addressCountry: 'IT' } },
        ...(salary ? { baseSalary: salary } : {}),
        directApply: true,
        url,
    };
}

export function renderJobHtml(html, job, { origin, id }) {
    const url = `${origin}/offerte/${encodeURIComponent(id)}`;
    if (!job) return setMeta(setMeta(html, 'name', 'robots', 'noindex'), 'property', 'og:url', url);
    const place = [job.city, job.province && `(${job.province})`].filter(Boolean).join(' ');
    const title = `${job.title} · ${job.structureName}${place ? `, ${place}` : ''} | SwimIn`;
    const description = `${job.isSOS ? 'Sostituzione urgente' : 'Offerta di lavoro'} a ${place || 'Italia'}: ${job.description}`.replace(/\s+/g, ' ').slice(0, 200);
    const image = job.structureLogo || `${origin}/og-image.png`;
    let out = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
    out = setMeta(out, 'name', 'description', description);
    out = setMeta(out, 'property', 'og:type', 'website');
    out = setMeta(out, 'property', 'og:title', title);
    out = setMeta(out, 'property', 'og:description', description);
    out = setMeta(out, 'property', 'og:url', url);
    out = setMeta(out, 'property', 'og:image', image);
    out = setMeta(out, 'name', 'twitter:card', job.structureLogo ? 'summary' : 'summary_large_image');
    if (job.structureLogo) out = out.replace(/\s*<meta property="og:image:width"[^>]*>/i, '').replace(/\s*<meta property="og:image:height"[^>]*>/i, '');
    return out.replace('</head>', `    <link rel="canonical" href="${escapeHtml(url)}" />\n    <script type="application/ld+json">${safeJson(jobPosting(job, url))}</script>\n  </head>`);
}

export default async function handler(req, res) {
    const id = String(req.query.id || '').slice(0, 36);
    const origin = originOf(req);
    let html;
    try {
        html = await (await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(5000) })).text();
    } catch (err) {
        console.error('index.html non raggiungibile:', err);
        res.setHeader('Location', '/');
        return res.status(302).end();
    }
    let job = null;
    if (/^[A-Za-z0-9_.-]{1,36}$/.test(id)) {
        try {
            job = await callPublic('publicJob', { id });
        } catch (err) {
            // Annuncio chiuso, scaduto o inesistente: la pagina lo dice, i motori di ricerca non indicizzano.
            if (!err.status || err.status >= 500) console.error('Annuncio pubblico:', err.message);
        }
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    return res.status(job ? 200 : 404).send(renderJobHtml(html, job, { origin, id }));
}
