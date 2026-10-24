/**
 * Genera schermate dell'app con dati di esempio, per la revisione visiva in CI.
 * Uso: node scripts/screenshots/capture.mjs http://localhost:4173 ./screenshots
 *
 * Le richieste verso Appwrite vengono intercettate e servite dai fixture.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { account, apiResponses, collections, ME } from './fixtures.mjs';

const BASE = process.argv[2] || 'http://localhost:4173';
const OUT = process.argv[3] || 'screenshots';
mkdirSync(OUT, { recursive: true });

const json = (route, body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Applica i filtri `equal` più comuni delle query Appwrite (formato JSON). */
function applyQueries(rows, rawQueries) {
    let out = rows;
    for (const raw of rawQueries) {
        let q;
        try { q = JSON.parse(raw); } catch { continue; }
        if (q.method === 'equal' && q.attribute && !q.attribute.startsWith('$')) {
            out = out.filter((r) => q.values.includes(r[q.attribute]));
        }
        if (q.method === 'equal' && q.attribute === '$id') out = out.filter((r) => q.values.includes(r.$id));
        if (q.method === 'isNull' && q.attribute) out = out.filter((r) => r[q.attribute] == null);
        if (q.method === 'notEqual' && q.attribute) out = out.filter((r) => !q.values.includes(r[q.attribute]));
        if (q.method === 'contains' && q.attribute) {
            out = out.filter((r) => {
                const v = r[q.attribute];
                return Array.isArray(v) ? v.some((x) => q.values.includes(x)) : typeof v === 'string' && q.values.some((x) => v.toLowerCase().includes(String(x).toLowerCase()));
            });
        }
        if (q.method === 'limit') out = out.slice(0, q.values[0]);
    }
    return out;
}

async function mockAppwrite(page, { loggedIn }) {
    await page.route(/\/v1\/realtime/, (route) => route.abort());
    await page.route(/cloud\.appwrite\.io\/v1\//, async (route) => {
        const url = new URL(route.request().url());
        const path = url.pathname.replace(/^\/v1/, '');
        const method = route.request().method();

        if (path === '/account' && method === 'GET') {
            return loggedIn ? json(route, account) : json(route, { message: 'Unauthorized', code: 401, type: 'general_unauthorized_scope' }, 401);
        }
        if (path.startsWith('/account')) return json(route, {});

        if (path.startsWith('/functions/api/executions')) {
            let action = '';
            let params = {};
            try { ({ action = '', ...params } = JSON.parse(JSON.parse(route.request().postData() || '{}').body || '{}')); } catch { action = ''; }
            const data = apiResponses[action] ? apiResponses[action](params) : {};
            return json(route, { $id: 'x', status: 'completed', responseStatusCode: 200, responseBody: JSON.stringify({ ok: true, data }) });
        }

        const one = path.match(/^\/databases\/[^/]+\/collections\/([^/]+)\/documents\/([^/]+)$/);
        if (one) {
            const row = (collections[one[1]] || []).find((r) => r.$id === one[2]);
            return row ? json(route, row) : json(route, { message: 'Not found', code: 404, type: 'document_not_found' }, 404);
        }
        const list = path.match(/^\/databases\/[^/]+\/collections\/([^/]+)\/documents$/);
        if (list && method === 'GET') {
            const queries = [...url.searchParams.entries()].filter(([k]) => k.startsWith('queries')).map(([, v]) => v);
            const rows = applyQueries(collections[list[1]] || [], queries);
            return json(route, { total: rows.length, documents: rows });
        }
        return json(route, {});
    });
}

const PUBLIC_PAGES = [
    ['landing', '/'],
    ['login', '/login'],
    ['registrazione', '/register'],
    ['privacy', '/privacy'],
    ['404', '/pagina-inesistente'],
    ['profilo-pubblico', '/u/u_giulia'],
];

const PRIVATE_PAGES = [
    ['home', '/'],
    ['profilo', '/profile'],
    ['profilo-altro', '/profile/u_marco'],
    ['struttura', '/profile/u_lido'],
    ['lavoro', '/jobs'],
    ['rete', '/network'],
    ['messaggi', '/messages'],
    ['notifiche', '/notifiche'],
    ['cerca', '/cerca?q=mi'],
    ['live', '/live'],
    ['impostazioni', '/profile?tab=impostazioni'],
    ['benvenuto', '/benvenuto'],
    ['salvati', '/salvati'],
    ['strutture', '/strutture'],
    ['appassionato', '/profile/u_paolo'],
    ['talenti', '/talenti'],
    ['premium', '/premium'],
    ['hashtag', '/hashtag/master'],
    ['gruppi', '/gruppi'],
    ['gruppo', '/gruppi/g1'],
    ['eventi', '/eventi'],
    ['evento', '/eventi/e1'],
    ['turni', '/turni'],
];

/** Schermate di form aperti: [nome, pagina, azione da eseguire prima dello scatto]. */
const PRIVATE_INTERACTIONS = [
    ['recensioni', '/profile/u_lido', async (p) => {
        await p.locator('#reviews-title').scrollIntoViewIfNeeded();
        await p.mouse.wheel(0, -80);
    }],
    ['commenti', '/', (p) => p.getByRole('button', { name: /^Commenta$/ }).first().click()],
    ['reazioni', '/', (p) => p.getByRole('button', { name: /^Consiglia$/ }).first().hover()],
    ['visite-profilo', '/profile', (p) => p.getByRole('button', { name: /visite al profilo/ }).click()],
    ['collegamenti', '/profile', (p) => p.getByRole('button', { name: /collegament/ }).first().click()],
    ['chat', '/messages', (p) => p.getByText('Marco Bellini').first().click()],
    ['chat-staff', '/profile/u_lido?area=chat-staff', async (p) => { await p.getByText('Grazie Giulia!').waitFor(); await p.waitForTimeout(900); }],
    ['gruppo-membri', '/gruppi/g1', (p) => p.getByRole('button', { name: /^Membri/ }).click()],
    ['form-evento', '/eventi', (p) => p.getByRole('button', { name: 'Crea un evento' }).first().click()],
    ['form-gruppo', '/gruppi', (p) => p.getByRole('button', { name: 'Crea un gruppo' }).first().click()],
    ['ripubblica', '/', (p) => p.getByRole('button', { name: /Ripubblica/ }).first().click()],
    ['form-recensione', '/profile/u_lido', (p) => p.getByRole('button', { name: /Scrivi una recensione/ }).click()],
    ['form-profilo', '/profile', (p) => p.getByRole('button', { name: /^Modifica( profilo)?$/ }).first().click()],
    ['form-esperienza', '/profile', (p) => p.locator('section[aria-labelledby="career-title"] button').first().click()],
    ['form-brevetto-errori', '/profile', async (p) => {
        await p.locator('section[aria-labelledby="certs-title"] button').first().click();
        await p.waitForTimeout(300);
        await p.getByRole('dialog').getByRole('button', { name: 'Aggiungi' }).click();
    }],
    ['form-disponibilita', '/profile', (p) => p.locator('section[aria-labelledby="availability-title"] button').first().click()],
    ['menu-provincia', '/profile', async (p) => {
        await p.getByRole('button', { name: /^Modifica( profilo)?$/ }).first().click();
        await p.waitForTimeout(400);
        await p.locator('#pe-prov').click();
    }],
    ['menu-comuni', '/profile', async (p) => {
        await p.getByRole('button', { name: /^Modifica( profilo)?$/ }).first().click();
        await p.waitForTimeout(400);
        await p.locator('#pe-city').click();
        await p.waitForTimeout(300);
        await p.keyboard.press('Control+A');
        await p.keyboard.type('se');
    }],
    ['calendario', '/profile', async (p) => {
        await p.locator('section[aria-labelledby="certs-title"] button').first().click();
        await p.waitForTimeout(400);
        await p.getByRole('button', { name: /Apri il calendario: data di scadenza/ }).click();
    }],
];
const PUBLIC_INTERACTIONS = [
    ['registrazione-passione', '/register?tipo=passione', async () => undefined],
    ['registrazione-errori', '/register', (p) => p.getByRole('button', { name: 'Crea account' }).click()],
];

// Computer, tablet (verticale e orizzontale), smartphone standard e piccolo.
const VIEWPORTS = [
    ['desktop', { width: 1440, height: 900 }],
    ['laptop', { width: 1280, height: 720 }, { interactions: false }],
    ['tablet', { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ['tablet-orizzontale', { width: 1180, height: 820, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { interactions: false }],
    ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ['mobile-piccolo', { width: 360, height: 740, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
];
const ONLY = (process.env.VIEWPORTS || '').split(',').filter(Boolean);

/**
 * Controllo del layout: niente scorrimento orizzontale della pagina, nessun elemento
 * visibile che esce dallo schermo (salvo dentro contenitori che scorrono), e sui
 * dispositivi touch pulsanti abbastanza grandi da toccare.
 */
async function auditLayout(page, touch) {
    return page.evaluate((touch) => {
        const vw = document.documentElement.clientWidth;
        const describe = (el) => {
            const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 4).join('.') : '';
            const text = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
            return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${text ? ` «${text}»` : ''}`;
        };
        const clipped = (el) => {
            for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
                const ox = getComputedStyle(p).overflowX;
                if (ox === 'hidden' || ox === 'auto' || ox === 'scroll' || ox === 'clip') return true;
            }
            return false;
        };
        const visible = (el, r) => {
            if (r.width === 0 || r.height === 0) return false;
            const st = getComputedStyle(el);
            return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0' && st.position !== 'fixed';
        };
        const overflow = Math.max(0, document.documentElement.scrollWidth - vw);
        const offenders = [];
        for (const el of document.body.querySelectorAll('*')) {
            if (offenders.length >= 6) break;
            const r = el.getBoundingClientRect();
            if (!visible(el, r) || (r.right <= vw + 1 && r.left >= -1)) continue;
            if (el.closest('[aria-hidden="true"], .sr-only, [role="dialog"] ~ *')) continue;
            if (clipped(el)) continue;
            // Solo l'elemento più esterno che sborda (i figli lo seguono).
            if (offenders.some((o) => o.el.contains(el))) continue;
            offenders.push({ el, text: `${describe(el)} (${Math.round(r.left)}→${Math.round(r.right)} su ${vw})` });
        }
        const small = [];
        if (touch) {
            for (const el of document.querySelectorAll('button, a[href], [role="button"], input, textarea, [role="tab"], [role="menuitem"]')) {
                const r = el.getBoundingClientRect();
                if (!visible(el, r) || r.bottom < 0 || r.top > innerHeight) continue;
                // Elementi nascosti per l'accessibilità (link "salta al contenuto", input dei toggle).
                if (r.width <= 2 || r.height <= 2 || el.closest('.sr-only')) continue;
                // I link dentro un testo seguono la riga: si escludono.
                if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
                if (r.height < 24 || r.width < 24) small.push(`${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
            }
        }
        return { overflow, offenders: offenders.map((o) => o.text), small: small.slice(0, 8), smallCount: small.length };
    }, touch);
}
const report = [];
const shot = async (page, vpName, name, touch) => {
    const a = await auditLayout(page, touch).catch((e) => ({ overflow: 0, offenders: [`controllo non riuscito: ${e.message}`], small: [], smallCount: 0 }));
    if (a.overflow > 0 || a.offenders.length) {
        console.log(`↔ ${vpName}-${name}: la pagina scorre in orizzontale di ${a.overflow}px`);
        for (const o of a.offenders) console.log(`    ${o}`);
    }
    report.push({ page: `${vpName}-${name}`, ...a });
};

const browser = await chromium.launch();
const errors = [];

for (const [vpName, viewport, opts = {}] of VIEWPORTS) {
    if (ONLY.length && !ONLY.includes(vpName)) continue;
    const touch = !!viewport.hasTouch;
    for (const loggedIn of [false, true]) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor || 1, isMobile: !!viewport.isMobile, hasTouch: touch, locale: 'it-IT', timezoneId: 'Europe/Rome' });
        const page = await context.newPage();
        page.on('pageerror', (e) => errors.push(`[${vpName}] ${e.message}`));
        await mockAppwrite(page, { loggedIn });
        for (const [name, path] of loggedIn ? PRIVATE_PAGES : PUBLIC_PAGES) {
            try {
                await page.goto(BASE + path, { waitUntil: 'load', timeout: 30_000 });
                await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
                await page.waitForTimeout(800);
                await page.screenshot({ path: `${OUT}/${vpName}-${name}.png` });
                await shot(page, vpName, name, touch);
                console.log(`✓ ${vpName}-${name}`);
            } catch (e) {
                console.log(`✗ ${vpName}-${name}: ${e.message}`);
            }
        }
        for (const [name, path, act] of opts.interactions === false ? [] : loggedIn ? PRIVATE_INTERACTIONS : PUBLIC_INTERACTIONS) {
            try {
                await page.goto(BASE + path, { waitUntil: 'load', timeout: 30_000 });
                await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
                await page.waitForTimeout(600);
                await act(page);
                await page.waitForTimeout(700);
                await page.screenshot({ path: `${OUT}/${vpName}-${name}.png` });
                await shot(page, vpName, name, touch);
                console.log(`✓ ${vpName}-${name}`);
            } catch (e) {
                console.log(`✗ ${vpName}-${name}: ${e.message}`);
            }
        }
        await context.close();
    }
}
await browser.close();

// Rapporto del layout (sul branch ci-screenshots, accanto alle immagini).
const lines = ['# Controllo del layout', '', `Pagine controllate: ${report.length}`, ''];
const bad = report.filter((r) => r.overflow > 0 || r.offenders.length);
lines.push(`## Elementi fuori dallo schermo (${bad.length})`, '');
for (const r of bad) lines.push(`- **${r.page}** — scorrimento orizzontale ${r.overflow}px`, ...r.offenders.map((o) => `  - ${o}`));
const tiny = report.filter((r) => r.smallCount);
lines.push('', `## Pulsanti piccoli da toccare, sotto 24 px (WCAG 2.5.8) (${tiny.length} pagine)`, '');
for (const r of tiny) lines.push(`- **${r.page}** (${r.smallCount})`, ...r.small.map((o) => `  - ${o}`));
writeFileSync(`${OUT}/layout.md`, lines.join('\n') + '\n');
writeFileSync(`${OUT}/layout.json`, JSON.stringify(report, null, 2));
console.log(`\nLayout: ${bad.length} pagine con elementi fuori dallo schermo, ${tiny.length} con pulsanti piccoli (vedi layout.md).`);

if (errors.length) {
    console.log('\nErrori JavaScript rilevati:');
    for (const e of [...new Set(errors)]) console.log(' - ' + e);
}
console.log(`\nUtente di esempio: ${ME}`);
