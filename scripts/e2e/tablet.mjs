/**
 * Tablet e telefoni con WebKit (il motore di Safari e anche di Chrome su iPad/iPhone):
 * - da 640 px in su la navigazione sta nell'intestazione e la barra in fondo non c'è;
 * - sotto i 640 px (telefoni) c'è la barra in fondo;
 * - l'intestazione resta ferma mentre il contenuto scorre.
 * Formati: iPad Air 11" in verticale e orizzontale, iPad mini, iPad con "Testo più grande" o in
 * Split View (700 e 640 px), iPhone. Ognuno con lo user agent di Safari e di Chrome (CriOS).
 * Uso: node scripts/e2e/tablet.mjs http://localhost:4173 [cartella]   (rapporto in tablet.md)
 */
import { webkit, devices } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mockAppwrite } from '../screenshots/mock.mjs';

const BASE = process.argv[2] || 'http://localhost:4173';
const OUT = process.argv[3] || 'tablet';
mkdirSync(OUT, { recursive: true });
const CHROME_IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1';
const CASES = [
  ['ipad-air-11-verticale', 820, 1180],
  ['ipad-air-11-orizzontale', 1180, 820],
  ['ipad-mini-verticale', 744, 1133],
  ['ipad-testo-grande-o-split-view', 700, 1000],
  ['tablet-640', 640, 900],
  ['iphone', 390, 844],
];

const probe = (page) => page.evaluate(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { visible: false };
    const r = el.getBoundingClientRect();
    return { visible: getComputedStyle(el).display !== 'none' && r.height > 0, top: Math.round(r.top), height: Math.round(r.height) };
  };
  return { width: innerWidth, header: box('header'), top: box('[data-nav="top"]'), bottom: box('[data-nav="bottom"]') };
});

const browser = await webkit.launch();
const report = ['# Tablet e telefoni (WebKit)', '', '| Formato | Browser | Larghezza | Navigazione | Intestazione ferma | Esito |', '|---|---|---|---|---|---|'];
let problems = 0;
for (const [name, width, height] of CASES) {
  for (const [label, ua] of [['Safari', devices['iPad Pro 11'].userAgent], ['Chrome', CHROME_IPAD]]) {
    const context = await browser.newContext({ viewport: { width, height }, userAgent: ua, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'it-IT', timezoneId: 'Europe/Rome' });
    const page = await context.newPage();
    await mockAppwrite(page, { loggedIn: true });
    let ok = false;
    let detail = '';
    try {
      await page.goto(`${BASE}/`, { waitUntil: 'load' });
      await page.waitForSelector('header', { timeout: 15_000 });
      await page.waitForTimeout(800);
      const before = await probe(page);
      await page.evaluate(() => {
        const root = document.getElementById('scroll-root');
        if (root) root.scrollTop = 2000;
        window.scrollTo(0, 2000);
      });
      await page.waitForTimeout(300);
      const after = await probe(page);
      const tablet = width >= 640;
      const navOk = tablet ? before.top.visible && !before.bottom.visible : before.bottom.visible && !before.top.visible;
      const fixed = after.header.visible && Math.abs(after.header.top) <= 1;
      ok = navOk && fixed;
      detail = `| ${name} | ${label} | ${before.width} px | ${navOk ? (tablet ? 'in alto' : 'in fondo') : `**sbagliata** (alto ${before.top.visible}, fondo ${before.bottom.visible})`} | ${fixed ? 'sì' : '**no**'} | ${ok ? 'ok' : '**problema**'} |`;
      if (!ok) await page.screenshot({ path: `${OUT}/${name}-${label.toLowerCase()}.png` });
    } catch (e) {
      detail = `| ${name} | ${label} | ${width} px | errore: ${String(e.message).split('\n')[0]} | | **problema** |`;
    }
    if (!ok) problems++;
    report.push(detail);
    console.log(`${ok ? '✓' : '✗'} tablet ${name} ${label}`);
    await context.close();
  }
}
await browser.close();
writeFileSync(`${OUT}/tablet.md`, report.join('\n') + '\n');
if (problems) console.log(`::error::Navigazione su tablet o telefono non corretta in ${problems} casi (vedi tablet.md).`);
process.exit(problems ? 1 : 0);
