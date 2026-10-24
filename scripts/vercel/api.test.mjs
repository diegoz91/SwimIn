import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderProfileHtml } from '../../api/og.js';
import { renderSitemap } from '../../api/sitemap.js';
import { renderJobHtml, jobPosting } from '../../api/job.js';

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

test('pagina pubblica di un\'offerta con JobPosting', () => {
    const job = { id: 'j1', title: 'Assistente bagnanti', description: 'Turni serali.\nBrevetto FIN.', role: 'assistente bagnanti', contractType: 'part-time', city: 'Milano', province: 'MI', salaryMin: 900, salaryMax: 1200, requirements: ['Disponibilità serale'], qualifications: ['Brevetto Assistente Bagnanti <FIN>'], isSOS: false, structureName: 'Piscina Lido', structureLogo: '', postedAt: '2026-10-20T08:00:00Z', expiresAt: '2026-11-19' };
    const out = renderJobHtml(html, job, { origin: 'https://swimin.it', id: 'j1' });
    assert.match(out, /<title>Assistente bagnanti · Piscina Lido, Milano \(MI\) \| SwimIn<\/title>/);
    assert.match(out, /<link rel="canonical" href="https:\/\/swimin.it\/offerte\/j1" \/>/);
    assert.match(out, /"@type":"JobPosting"/);
    assert.ok(!out.includes('<FIN>'));
    const ld = jobPosting(job, 'https://swimin.it/offerte/j1');
    assert.equal(ld.employmentType, 'PART_TIME');
    assert.deepEqual(ld.baseSalary.value, { '@type': 'QuantitativeValue', minValue: 900, maxValue: 1200, unitText: 'MONTH' });
    assert.equal(ld.validThrough, '2026-11-19T23:59:59+01:00');
    assert.equal(ld.jobLocation.address.addressRegion, 'MI');
});

test('offerta chiusa: non indicizzare', () => {
    assert.match(renderJobHtml(html, null, { origin: 'https://swimin.it', id: 'x' }), /noindex/);
});

test('sitemap con le offerte', () => {
    assert.match(renderSitemap('https://swimin.it', [], [{ id: 'j1', updatedAt: '2026-10-21T00:00:00Z' }]), /<loc>https:\/\/swimin.it\/offerte\/j1<\/loc><lastmod>2026-10-21<\/lastmod>/);
});
