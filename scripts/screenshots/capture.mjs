/**
 * Genera schermate dell'app con dati di esempio, per la revisione visiva in CI.
 * Uso: node scripts/screenshots/capture.mjs http://localhost:4173 ./screenshots
 *
 * Le richieste verso Appwrite vengono intercettate e servite dai fixture.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
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
            try { action = JSON.parse(JSON.parse(route.request().postData() || '{}').body || '{}').action || ''; } catch { action = ''; }
            const data = apiResponses[action] ? apiResponses[action]() : {};
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

const VIEWPORTS = [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 }],
];

const browser = await chromium.launch();
const errors = [];

for (const [vpName, viewport] of VIEWPORTS) {
    for (const loggedIn of [false, true]) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.deviceScaleFactor || 1, isMobile: !!viewport.isMobile, locale: 'it-IT', timezoneId: 'Europe/Rome' });
        const page = await context.newPage();
        page.on('pageerror', (e) => errors.push(`[${vpName}] ${e.message}`));
        await mockAppwrite(page, { loggedIn });
        for (const [name, path] of loggedIn ? PRIVATE_PAGES : PUBLIC_PAGES) {
            try {
                await page.goto(BASE + path, { waitUntil: 'load', timeout: 30_000 });
                await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
                await page.waitForTimeout(800);
                await page.screenshot({ path: `${OUT}/${vpName}-${name}.png`, fullPage: vpName === 'desktop' ? false : false });
                console.log(`✓ ${vpName}-${name}`);
            } catch (e) {
                console.log(`✗ ${vpName}-${name}: ${e.message}`);
            }
        }
        for (const [name, path, act] of loggedIn ? PRIVATE_INTERACTIONS : PUBLIC_INTERACTIONS) {
            try {
                await page.goto(BASE + path, { waitUntil: 'load', timeout: 30_000 });
                await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
                await page.waitForTimeout(600);
                await act(page);
                await page.waitForTimeout(700);
                await page.screenshot({ path: `${OUT}/${vpName}-${name}.png` });
                console.log(`✓ ${vpName}-${name}`);
            } catch (e) {
                console.log(`✗ ${vpName}-${name}: ${e.message}`);
            }
        }
        await context.close();
    }
}
await browser.close();

if (errors.length) {
    console.log('\nErrori JavaScript rilevati:');
    for (const e of [...new Set(errors)]) console.log(' - ' + e);
}
console.log(`\nUtente di esempio: ${ME}`);
