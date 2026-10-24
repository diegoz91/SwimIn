/** /robots.txt — con l'indirizzo assoluto della sitemap del dominio in uso. */
import { originOf } from './_public.js';

export default function handler(req, res) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=86400');
    return res.status(200).send(
        [
            '# Indicizziamo la pagina iniziale, le pagine legali i profili pubblici (/u/…) e le offerte (/offerte/…).',
            "# Il resto dell'app è riservato agli utenti registrati.",
            'User-agent: *',
            'Allow: /$',
            'Allow: /u/',
            'Allow: /offerte/',
            'Allow: /register',
            'Allow: /privacy',
            'Allow: /termini',
            'Allow: /cookie',
            'Disallow: /',
            '',
            `Sitemap: ${originOf(req)}/sitemap.xml`,
            '',
        ].join('\n')
    );
}
