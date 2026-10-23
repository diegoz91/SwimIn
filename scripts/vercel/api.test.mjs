import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderProfileHtml } from '../../api/og.js';
import { renderSitemap } from '../../api/sitemap.js';

const html = `<!DOCTYPE html><html><head><title>SwimIn</title>
<meta name="description" content="x" />
<meta property="og:title" content="x" />
<meta property="og:image" content="/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
</head><body></body></html>`;

test('anteprima di un profilo pubblico', () => {
    const out = renderProfileHtml(html, { kind: 'person', id: 'abc', name: 'Giulia "Ferri"', headline: 'Istruttrice FIN', city: 'Milano', province: 'MI', avatar: 'https://cloud.appwrite.io/v1/storage/x.jpg', certifications: [{ name: 'Assistente bagnanti' }] }, { origin: 'https://swimin.it', id: 'abc' });
    assert.match(out, /<title>Giulia &quot;Ferri&quot; · Istruttrice FIN \| SwimIn<\/title>/);
    assert.match(out, /<meta property="og:url" content="https:\/\/swimin.it\/u\/abc" \/>/);
    assert.match(out, /<meta property="og:image" content="https:\/\/cloud.appwrite.io\/v1\/storage\/x.jpg" \/>/);
    assert.match(out, /Milano \(MI\)/);
    assert.ok(!out.includes('og:image:width'));
    assert.match(out, /"@type":"Person"/);
    assert.match(out, /<link rel="canonical" href="https:\/\/swimin.it\/u\/abc" \/>/);
});

test('profilo privato o inesistente: non indicizzare', () => {
    const out = renderProfileHtml(html, null, { origin: 'https://swimin.it', id: 'zzz' });
    assert.match(out, /<meta name="robots" content="noindex" \/>/);
});

test('struttura con valutazione e niente script iniettati', () => {
    const out = renderProfileHtml(html, { kind: 'structure', id: 'p1', name: '</script><script>alert(1)</script>', headline: 'Piscina', city: 'Roma', rating: { average: 4.5, count: 12 }, services: ['Nuoto libero'] }, { origin: 'https://swimin.it', id: 'p1' });
    assert.ok(!out.includes('<script>alert(1)'));
    assert.match(out, /4,5 su 5 \(12 recensioni\)/);
    assert.match(out, /og-image.png/);
});

test('sitemap', () => {
    const xml = renderSitemap('https://swimin.it', [{ id: 'a&b', updatedAt: '2026-10-20T10:00:00Z' }]);
    assert.match(xml, /<loc>https:\/\/swimin.it\/u\/a%26b<\/loc><lastmod>2026-10-20<\/lastmod>/);
    assert.match(xml, /<loc>https:\/\/swimin.it\/privacy<\/loc>/);
});
