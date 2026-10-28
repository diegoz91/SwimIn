/**
 * iPad con WebKit (il motore di Safari e anche di Chrome su iPad): intestazione con la barra di
 * navigazione visibile e ferma mentre si scorre, in verticale e in orizzontale.
 * Uso: node scripts/e2e/ipad.mjs http://localhost:4173 [cartella]
 */
import { webkit, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mockAppwrite } from '../screenshots/mock.mjs';

const BASE = process.argv[2] || 'http://localhost:4173';
const OUT = process.argv[3] || 'ipad';
mkdirSync(OUT, { recursive: true });
// Chrome su iPadOS: WebKit con lo user agent di Chrome (CriOS).
const CHROME_IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1';
const CASES = [
  ['ipad-air-11-verticale', { viewport: { width: 820, height: 1180 } }],
  ['ipad-air-11-orizzontale', { viewport: { width: 1180, height: 820 } }],
  ['ipad-mini-verticale', { viewport: { width: 744, height: 1133 } }],
];

const probe = (page) => page.evaluate(() => {
  const header = document.querySelector('header');
  const nav = document.querySelector('nav[aria-label="Navigazione principale"]');
  const bottom = document.querySelector('nav[aria-label="Navigazione"]') || [...document.querySelectorAll('nav')].find((n) => n !== nav && n.closest('header') == null);
  const r = (el) => (el ? (({ top, bottom, height, width }) => ({ top: Math.round(top), bottom: Math.round(bottom), height: Math.round(height), width: Math.round(width) }))(el.getBoundingClientRect()) : null);
  const root = document.getElementById('scroll-root');
  return {
    innerWidth, innerHeight, scrollY, md: matchMedia('(min-width: 768px)').matches,
    header: r(header), nav: r(nav), navDisplay: nav ? getComputedStyle(nav).display : 'assente',
    bottomNav: r(bottom), bottomDisplay: bottom ? getComputedStyle(bottom).display : 'assente',
    scrollRoot: root ? { scrollTop: root.scrollTop, clientHeight: root.clientHeight, scrollHeight: root.scrollHeight } : null,
    docHeight: document.documentElement.scrollHeight,
  };
});

const browser = await webkit.launch();
const report = ['# iPad (WebKit)', ''];
let problems = 0;
for (const [name, opts] of CASES) {
  for (const [ua, label] of [[devices['iPad Pro 11'].userAgent, 'safari'], [CHROME_IPAD, 'chrome']]) {
    const context = await browser.newContext({ ...opts, userAgent: ua, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'it-IT', timezoneId: 'Europe/Rome' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await mockAppwrite(page, { loggedIn: true });
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForSelector('header', { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const before = await probe(page);
    await page.screenshot({ path: `${OUT}/${name}-${label}-1.png` });
    // Scorrimento come con il dito e con la rotella.
    const { width, height } = opts.viewport;
    await page.touchscreen?.tap?.(width / 2, height / 2).catch?.(() => undefined);
    await page.mouse.move(width / 2, height * 0.6);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 500);
    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForTimeout(600);
    const after = await probe(page);
    await page.screenshot({ path: `${OUT}/${name}-${label}-2.png` });
    const navOk = before.md ? before.navDisplay !== 'none' && before.nav?.height > 0 : before.bottomDisplay !== 'none';
    const fixedOk = after.header && after.header.top >= -1 && after.header.top <= 1;
    if (!navOk || !fixedOk || errors.length) problems++;
    report.push(`## ${name} · ${label}`, '', `- navigazione visibile: ${navOk ? 'sì' : '**no**'} · intestazione ferma dopo lo scorrimento: ${fixedOk ? 'sì' : '**no**'}`,
      `- prima: \`${JSON.stringify(before)}\``, `- dopo: \`${JSON.stringify(after)}\``, errors.length ? `- errori: ${errors.join(' | ')}` : '', '');
    console.log(`${navOk && fixedOk && !errors.length ? '✓' : '✗'} ${name} ${label}: nav ${navOk} fermo ${fixedOk} ${JSON.stringify({ b: before.header, a: after.header, sy: after.scrollY })}`);
    await context.close();
  }
}
await browser.close();
writeFileSync(`${OUT}/ipad.md`, report.join('\n'));
process.exit(problems ? 1 : 0);
