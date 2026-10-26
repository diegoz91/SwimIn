/**
 * Test end-to-end dei percorsi principali, nel browser vero contro l'app compilata
 * e un Appwrite finto (scripts/screenshots/mock.mjs). Controllano che ogni passo arrivi
 * alla schermata giusta e che la Function riceva l'azione attesa.
 *
 * Uso: node scripts/e2e/flows.mjs http://localhost:4173 [cartella-risultati]
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mockAppwrite } from '../screenshots/mock.mjs';

const BASE = process.argv[2] || 'http://localhost:4173';
const OUT = process.argv[3] || 'e2e';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
    desktop: { viewport: { width: 1280, height: 800 } },
    mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

const called = (state, action, timeout = 8000) => {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tick = () => {
            const c = state.calls.find((x) => x.action === action);
            if (c) return resolve(c);
            if (Date.now() - start > timeout) return reject(new Error(`la Function non ha ricevuto "${action}" (chiamate: ${state.calls.map((x) => x.action).join(', ') || 'nessuna'})`));
            setTimeout(tick, 100);
        };
        tick();
    });
};

const open = async (page, path) => {
    await page.goto(BASE + path, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
};

/** [nome, viewport, stato iniziale dell'Appwrite finto, passi] */
const FLOWS = [
    ['accesso con email e password', 'desktop', { loggedIn: false, password: 'Password1!' }, async (page) => {
        await open(page, '/login');
        await page.fill('#email', 'giulia.ferri@example.com');
        await page.fill('#password', 'sbagliata');
        await page.getByRole('button', { name: 'Accedi', exact: true }).click();
        await page.getByText(/credenziali|password|non corrett/i).first().waitFor({ timeout: 5000 });
        assert.match(new URL(page.url()).pathname, /\/login/);
        await page.fill('#password', 'Password1!');
        await page.getByRole('button', { name: 'Accedi', exact: true }).click();
        await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10_000 });
        await page.getByText('Di cosa vorresti parlare alla rete di SwimIn?').first().waitFor({ timeout: 10_000 });
    }],
    ['accesso con verifica in due passaggi', 'mobile', { loggedIn: false, mfaRequired: true, mfaCode: '123456' }, async (page, state) => {
        await open(page, '/login');
        await page.fill('#email', 'giulia.ferri@example.com');
        await page.fill('#password', 'Password1!');
        await page.getByRole('button', { name: 'Accedi', exact: true }).click();
        await page.locator('#mfa-code').waitFor({ timeout: 8000 });
        await page.fill('#mfa-code', '000000');
        await page.getByRole('button', { name: 'Accedi', exact: true }).click();
        await page.waitForTimeout(800);
        assert.ok(!state.mfaDone, 'un codice sbagliato non deve completare l’accesso');
        await page.fill('#mfa-code', '123456');
        await page.getByRole('button', { name: 'Accedi', exact: true }).click();
        await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10_000 });
        assert.ok(state.mfaDone);
    }],
    ['registrazione: i campi obbligatori sono segnalati', 'mobile', { loggedIn: false }, async (page, state) => {
        await open(page, '/register');
        await page.getByRole('button', { name: 'Crea account' }).click();
        await page.locator('[aria-invalid="true"]').first().waitFor({ timeout: 5000 });
        assert.ok(!state.accountCalls.some((c) => c === 'POST /account'), 'senza dati non deve creare l’account');
    }],
    ['pubblicare un post', 'desktop', { loggedIn: true }, async (page, state) => {
        await open(page, '/');
        await page.getByText('Di cosa vorresti parlare alla rete di SwimIn?').first().click();
        const box = page.getByPlaceholder(/^Condividi un pensiero/);
        await box.fill('Allenamento di prova: 10x100 stile a 1’40”. #master');
        await page.getByRole('button', { name: 'Pubblica', exact: true }).last().click();
        const c = await called(state, 'createPost');
        assert.match(c.params.content, /10x100/);
    }],
    ['commentare un post', 'mobile', { loggedIn: true }, async (page, state) => {
        await open(page, '/');
        await page.getByRole('button', { name: /^Commenta$/ }).first().click();
        const box = page.getByPlaceholder('Aggiungi un commento…').first();
        await box.fill('Bel lavoro, complimenti!');
        await box.press('Enter');
        const c = await called(state, 'createComment');
        assert.match(c.params.content, /complimenti/);
    }],
    ['inviare un messaggio', 'desktop', { loggedIn: true }, async (page, state) => {
        await open(page, '/messages');
        await page.getByText('Marco Bellini').first().click();
        const box = page.getByPlaceholder('Scrivi un messaggio…');
        await box.fill('Ciao Marco, ci sei domani alle 7?');
        await box.press('Enter');
        const c = await called(state, 'sendMessage');
        assert.match(c.params.content, /domani alle 7/);
    }],
    ['candidarsi a un’offerta', 'mobile', { loggedIn: true }, async (page, state) => {
        await open(page, '/jobs');
        await page.getByRole('button', { name: /Candidati/ }).first().click();
        await page.getByRole('button', { name: /Candidatura rapida/ }).click();
        await page.getByRole('button', { name: /Invia candidatura/ }).click();
        await called(state, 'applyForJob');
        await page.getByText('Inviata!').first().waitFor({ timeout: 5000 });
    }],
    ['creare un avviso di lavoro', 'desktop', { loggedIn: true }, async (page, state) => {
        await open(page, '/jobs');
        await page.getByRole('button', { name: /^Avvisi$/ }).click();
        const dialog = page.getByRole('dialog');
        await dialog.locator('#alert-query').fill('istruttore');
        await dialog.getByRole('button', { name: 'Salva avviso' }).click();
        const c = await called(state, 'createJobAlert');
        assert.equal(c.params.query, 'istruttore');
    }],
    ['offerta pubblica senza account porta alla registrazione', 'mobile', { loggedIn: false }, async (page) => {
        await open(page, '/offerte/j1');
        await page.getByRole('heading', { name: /Assistente bagnanti/ }).first().waitFor({ timeout: 8000 });
        await page.getByText('Iscriviti e candidati').first().click();
        await page.waitForURL((u) => /register|login/.test(u.pathname), { timeout: 8000 });
    }],
    ['intestazione e menu restano fermi mentre la pagina scorre', 'mobile', { loggedIn: true }, async (page) => {
        await open(page, '/profile');
        const nav = page.getByRole('navigation', { name: 'Navigazione principale' });
        const header = page.locator('header').first();
        const before = { nav: await nav.boundingBox(), header: await header.boundingBox() };
        await page.evaluate(() => { const r = document.getElementById('scroll-root'); r?.scrollTo({ top: r.scrollHeight }); });
        await page.mouse.move(195, 400);
        await page.mouse.wheel(0, 1500);
        await page.waitForTimeout(400);
        const scrolled = await page.evaluate(() => document.getElementById('scroll-root')?.scrollTop || 0);
        assert.ok(scrolled > 200, `la pagina non è scorsa (${scrolled})`);
        const after = { nav: await nav.boundingBox(), header: await header.boundingBox() };
        const vh = page.viewportSize().height;
        assert.ok(after.nav && Math.abs(after.nav.y + after.nav.height - vh) <= 2, `menu in basso non attaccato al fondo: ${JSON.stringify(after.nav)}`);
        assert.equal(Math.round(after.nav.y), Math.round(before.nav.y));
        assert.ok(after.header && after.header.y <= 1 && after.header.y >= -1, `intestazione spostata: ${JSON.stringify(after.header)}`);
    }],
    ['la ricerca propone risultati mentre si scrive', 'desktop', { loggedIn: true }, async (page) => {
        await open(page, '/');
        await page.locator('#global-search').click();
        await page.keyboard.type('mar');
        const option = page.getByRole('option', { name: /Marco Bellini/ });
        await option.waitFor({ timeout: 5000 });
        await page.keyboard.press('ArrowDown');
        await option.click();
        await page.waitForURL((u) => u.pathname.startsWith('/profile/'), { timeout: 8000 });
    }],
    ['la chat resta dentro il riquadro: menu del messaggio leggibile', 'mobile', { loggedIn: true }, async (page) => {
        await open(page, '/messages');
        await page.getByText('Marco Bellini').first().click();
        const trigger = page.getByRole('button', { name: 'Azioni sul messaggio' }).last();
        await trigger.click();
        const menu = page.getByRole('menu');
        await menu.waitFor({ timeout: 4000 });
        const box = await menu.boundingBox();
        const vw = page.viewportSize().width;
        assert.ok(box && box.x >= 0 && box.x + box.width <= vw, `menu fuori dallo schermo: ${JSON.stringify(box)}`);
    }],
    ['chi scrive una referenza la vede in attesa, senza poterla pubblicare', 'desktop', { loggedIn: true }, async (page) => {
        await open(page, '/profile/u_marco');
        await page.locator('#recs-title').scrollIntoViewIfNeeded();
        await page.getByText('In attesa di approvazione').waitFor({ timeout: 6000 });
        assert.equal(await page.getByRole('button', { name: 'Pubblica', exact: true }).count(), 0, 'chi ha scritto la referenza non deve vedere "Pubblica"');
        assert.equal(await page.getByRole('button', { name: 'Non pubblicare', exact: true }).count(), 0);
    }],
    ['l’amministratore cambia il prezzo di un piano', 'desktop', { loggedIn: true, responses: { listBlockRelations: () => ({ blocked: [], muted: [], blockedBy: [], isAdmin: true }) } }, async (page, state) => {
        await open(page, '/admin?tab=piani');
        const input = page.locator('#price-person_month');
        await input.waitFor({ timeout: 8000 });
        await input.fill('3');
        await page.getByText('Non può costare più di 12 mesi').waitFor({ timeout: 4000 }); // annuale 47,90 > 12 × 3
        assert.ok(await page.getByRole('button', { name: 'Salva prezzi' }).isDisabled(), 'con un errore non si salva');
        await input.fill('5,49');
        page.once('dialog', (d) => d.accept());
        await page.getByRole('button', { name: 'Salva prezzi' }).click();
        const c = await called(state, 'adminUpdatePlans');
        assert.deepEqual(c.params.prices, { person_month: 549 });
    }],
    ['la struttura valuta e seleziona un candidato', 'mobile', { loggedIn: true, overrides: { profiles: { u_giulia: { userType: 'structure', structureName: 'Piscina Lido di Milano' } }, jobs: { j1: { structureId: 'u_giulia' } } } }, async (page, state) => {
        await open(page, '/jobs/j1?candidati=nuove');
        await page.getByRole('heading', { name: 'Candidati' }).waitFor({ timeout: 8000 });
        await page.getByRole('button', { name: /^Valuta/ }).first().click();
        const seen = await called(state, 'updateApplicationStatus');
        assert.equal(seen.params.status, 'reviewed', 'aprire una candidatura nuova la segna come vista');
        await page.getByRole('button', { name: 'Seleziona per un colloquio' }).click();
        const start = Date.now();
        while (!state.calls.some((c) => c.action === 'updateApplicationStatus' && c.params.status === 'accepted')) {
            if (Date.now() - start > 6000) throw new Error('selezione non inviata');
            await page.waitForTimeout(100);
        }
    }],
    ['chi si candida vede il percorso della candidatura', 'desktop', { loggedIn: true }, async (page) => {
        await open(page, '/jobs/j2');
        await page.getByRole('heading', { name: 'La tua candidatura' }).waitFor({ timeout: 8000 });
        await page.getByText('Selezionata per un colloquio').first().waitFor();
    }],
    ['i link vecchi delle offerte aprono l’annuncio', 'mobile', { loggedIn: true }, async (page) => {
        await open(page, '/jobs?annuncio=j1');
        await page.waitForURL((u) => u.pathname === '/jobs/j1', { timeout: 8000 });
        await page.getByRole('heading', { name: /Assistente bagnanti/ }).first().waitFor();
    }],
    ['le pagine private chiedono l’accesso', 'desktop', { loggedIn: false }, async (page) => {
        await open(page, '/messages');
        await page.waitForURL((u) => /login|^\/$/.test(u.pathname), { timeout: 8000 });
    }],
];

/** Prestazioni percepite: LCP della landing su uno smartphone con CPU rallentata e rete 4G. */
async function measureLcp(browser) {
    const context = await browser.newContext({ ...VIEWPORTS.mobile, locale: 'it-IT' });
    const page = await context.newPage();
    await mockAppwrite(page, { loggedIn: false });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await page.addInitScript(() => {
        window.__lcp = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        window.__cls = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(3000);
    const m = await page.evaluate(() => ({ lcp: Math.round(window.__lcp), cls: Math.round(window.__cls * 1000) / 1000, transfer: Math.round(performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), 0) / 1024) }));
    await context.close();
    return m;
}

const browser = await chromium.launch();
const results = [];
for (const [name, vp, initial, run] of FLOWS) {
    // Le risposte finte della Function sono funzioni: non si clonano.
    const { responses, ...rest } = initial;
    const state = { ...structuredClone(rest), responses };
    const context = await browser.newContext({ ...VIEWPORTS[vp], locale: 'it-IT', timezoneId: 'Europe/Rome' });
    const page = await context.newPage();
    const jsErrors = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));
    await mockAppwrite(page, state);
    const t0 = Date.now();
    try {
        await run(page, state);
        assert.deepEqual(jsErrors, [], `errori JavaScript: ${jsErrors.join(' | ')}`);
        results.push({ name, vp, ok: true, ms: Date.now() - t0 });
        console.log(`✓ e2e ${name} (${vp}, ${Date.now() - t0} ms)`);
    } catch (e) {
        const file = `${OUT}/fallito-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
        await page.screenshot({ path: file }).catch(() => undefined);
        results.push({ name, vp, ok: false, error: e.message.split('\n')[0] });
        console.log(`✗ e2e ${name} (${vp}): ${e.message.split('\n')[0]}`);
        console.log(`    pagina: ${page.url()} · account: ${state.accountCalls.slice(-8).join(', ')} · Function: ${state.calls.map((c) => c.action).slice(-8).join(', ')}`);
    }
    await context.close();
}

// Budget: LCP sotto 2,5 s e CLS sotto 0,1 (soglie "buone" di Google), misurati con rete e CPU rallentate.
const LCP_BUDGET = Number(process.env.LCP_BUDGET || 2500);
const CLS_BUDGET = 0.1;
let perf = null;
try {
    perf = await measureLcp(browser);
    const ok = perf.lcp <= LCP_BUDGET && perf.cls <= CLS_BUDGET;
    console.log(`${ok ? '✓' : '✗'} prestazioni landing (mobile, 4G, CPU ×4): LCP ${perf.lcp} ms (budget ${LCP_BUDGET}), CLS ${perf.cls} (budget ${CLS_BUDGET}), trasferiti ${perf.transfer} KB`);
    if (!ok) results.push({ name: 'prestazioni landing', vp: 'mobile', ok: false, error: `LCP ${perf.lcp} ms, CLS ${perf.cls}` });
} catch (e) {
    console.log(`✗ prestazioni landing: ${e.message}`);
}
await browser.close();

const failed = results.filter((r) => !r.ok);
const md = ['# Test end-to-end', '', `Percorsi: ${results.length}, falliti: ${failed.length}.`, '', '| Percorso | Vista | Esito |', '|---|---|---|',
    ...results.map((r) => `| ${r.name} | ${r.vp} | ${r.ok ? `ok (${r.ms} ms)` : `**fallito**: ${r.error.replace(/\|/g, '/')}`} |`)];
if (perf) md.push('', '## Prestazioni della landing', '', `Smartphone 390 px, rete 4G (1,6 Mbit/s, 150 ms), CPU rallentata 4 volte.`, '', `- LCP: ${perf.lcp} ms (budget ${LCP_BUDGET} ms)`, `- CLS: ${perf.cls} (budget ${CLS_BUDGET})`, `- Dati trasferiti: ${perf.transfer} KB`);
writeFileSync(`${OUT}/e2e.md`, md.join('\n') + '\n');
if (failed.length) {
    console.log(`\n${failed.length} percorsi falliti.`);
    process.exit(1);
}
console.log('\nTutti i percorsi end-to-end sono riusciti.');
