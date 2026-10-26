/**
 * Genera schermate dell'app con dati di esempio, per la revisione visiva in CI.
 * Uso: node scripts/screenshots/capture.mjs http://localhost:4173 ./screenshots
 *
 * Le richieste verso Appwrite vengono intercettate e servite dai fixture.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { ME } from './fixtures.mjs';
import { mockAppwrite } from './mock.mjs';

const BASE = process.argv[2] || 'http://localhost:4173';
const OUT = process.argv[3] || 'screenshots';
mkdirSync(OUT, { recursive: true });

const PUBLIC_PAGES = [
    ['landing', '/'],
    ['login', '/login'],
    ['registrazione', '/register'],
    ['privacy', '/privacy'],
    ['404', '/pagina-inesistente'],
    ['profilo-pubblico', '/u/u_giulia'],
    ['offerta-pubblica', '/offerte/j1'],
];

const PRIVATE_PAGES = [
    ['home', '/'],
    ['profilo', '/profile'],
    ['profilo-altro', '/profile/u_marco'],
    ['struttura', '/profile/u_lido'],
    ['lavoro', '/jobs'],
    ['offerta', '/jobs/j1'],
    ['offerta-candidatura', '/jobs/j2'],
    ['candidature', '/jobs/candidature'],
    ['rete', '/network'],
    ['messaggi', '/messages'],
    ['notifiche', '/notifiche'],
    ['cerca', '/cerca?q=mi'],
    ['live', '/live'],
    ['impostazioni', '/profile?tab=impostazioni'],
    ['impostazioni-account', '/profile?tab=impostazioni&sezione=account'],
    ['impostazioni-sicurezza', '/profile?tab=impostazioni&sezione=sicurezza'],
    ['impostazioni-notifiche', '/profile?tab=impostazioni&sezione=notifiche'],
    ['impostazioni-privacy', '/profile?tab=impostazioni&sezione=privacy'],
    ['impostazioni-info', '/profile?tab=impostazioni&sezione=info'],
    ['benvenuto', '/benvenuto'],
    ['salvati', '/salvati'],
    ['statistiche', '/statistiche'],
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
    ['visite-profilo', '/profile', (p) => p.getByRole('button', { name: /visite al profilo/ }).first().click()],
    ['collegamenti', '/profile', (p) => p.getByRole('button', { name: /collegament/ }).first().click()],
    ['chat', '/messages', (p) => p.getByText('Marco Bellini').first().click()],
    ['squadra-staff', '/profile/u_lido?area=staff', async (p) => { await p.getByRole('tab', { name: /^Squadra/ }).click(); await p.getByText('Sara Colombo').first().waitFor(); }],
    ['chat-staff', '/profile/u_lido?area=chat-staff', async (p) => { await p.getByText('Grazie Giulia!').waitFor(); await p.waitForTimeout(900); }],
    ['gruppo-membri', '/gruppi/g1', (p) => p.getByRole('button', { name: /^Membri/ }).click()],
    ['form-referenza', '/profile/u_marco', (p) => p.getByRole('button', { name: /Scrivi una referenza|Modifica la tua referenza/ }).click()],
    ['referenze', '/profile?sezione=referenze', async (p) => { await p.locator('#recs-title').scrollIntoViewIfNeeded(); }],
    ['ricerca-suggerimenti', '/', async (p) => { const box = p.locator('#global-search'); if (await box.isVisible()) { await box.click(); await p.keyboard.type('ma'); await p.waitForTimeout(900); } }],
    ['chat-menu', '/messages', async (p) => { await p.getByText('Marco Bellini').first().click(); await p.waitForTimeout(500); await p.getByRole('button', { name: 'Azioni sul messaggio' }).last().click(); }],
    ['piede-pagina', '/', async (p) => { await p.evaluate(() => { const r = document.getElementById('scroll-root'); r?.scrollTo({ top: r.scrollHeight }); }); }],
    ['referenze-da-approvare', '/profile', async (p) => { await p.locator('#pending-recs-title').scrollIntoViewIfNeeded(); await p.mouse.wheel(0, -120); }],
    ['referenze-revisione', '/profile?referenze=approva', async (p) => { await p.getByRole('dialog').waitFor(); }],
    ['chiedi-referenza', '/profile?sezione=referenze', async (p) => { await p.getByRole('button', { name: /Chiedi una referenza/ }).first().click(); }],
    ['cerca-tutto', '/cerca?q=master', async () => undefined],
    ['impostazioni-password', '/profile?tab=impostazioni&sezione=sicurezza', (p) => p.getByRole('button', { name: 'Cambia', exact: true }).first().click()],
    ['impostazioni-elimina', '/profile?tab=impostazioni&sezione=account', (p) => p.getByRole('button', { name: 'Elimina', exact: true }).click()],
    ['avvisi-lavoro', '/jobs', (p) => p.getByRole('button', { name: /^Avvisi$/ }).click()],
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
                // L'area che scorre tra intestazione e menu non è un ritaglio: chi esce da lì esce dallo schermo.
                if (p.id === 'scroll-root') return false;
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
        const root = document.getElementById('scroll-root');
        const overflow = Math.max(0, document.documentElement.scrollWidth - vw, root ? root.scrollWidth - root.clientWidth : 0);
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
// Accessibilità: axe-core (WCAG 2.1 A/AA) su computer e smartphone, se installato.
const require = createRequire(import.meta.url);
let AXE = null;
try { AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { console.log('axe-core non installato: controllo accessibilità saltato.'); }
const A11Y_VIEWPORTS = (process.env.A11Y_VIEWPORTS || 'desktop,mobile').split(',');
const a11y = [];
async function auditA11y(page, pageName) {
    if (!AXE) return;
    await page.evaluate(AXE);
    const result = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] });
        // Gli elenchi dei menu a tendina si scorrono con le frecce dal campo che li apre: non sono regioni da raggiungere col tab.
        // Testo decorativo o anteprima sfocata, nascosto alle tecnologie assistive: il contrasto non conta.
        const hidden = (n) => { try { return !!document.querySelector(n.target.join(' '))?.closest('[aria-hidden="true"]'); } catch { return false; } };
        for (const v of r.violations) if (v.id === 'color-contrast') v.nodes = v.nodes.filter((n) => !hidden(n));
        for (const v of r.violations) if (v.id === 'scrollable-region-focusable') v.nodes = v.nodes.filter((n) => !n.html.includes('data-keyboard-scroll'));
        return r.violations.filter((v) => v.nodes.length).map((v) => ({ id: v.id, impact: v.impact, help: v.help, pairs: v.id === 'color-contrast' ? v.nodes.map((n) => { const d = n.any?.[0]?.data || {}; return `${d.fgColor} su ${d.bgColor} (${d.contrastRatio}, ${d.fontSize} ${d.fontWeight}) «${(n.html.match(/class="([^"]*)"/)?.[1] || '').split(' ').filter((c) => /text-|bg-/.test(c)).join(' ')}»`; }) : [], nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 160), summary: (n.failureSummary || '').split('\n').slice(1, 3).join(' ').slice(0, 200) })), count: v.nodes.length }));
    });
    for (const v of result) a11y.push({ page: pageName, ...v });
}

const report = [];
const shot = async (page, vpName, name, touch) => {
    if (A11Y_VIEWPORTS.includes(vpName)) await auditA11y(page, `${vpName}-${name}`).catch((e) => console.log(`  (accessibilità non controllata su ${vpName}-${name}: ${e.message})`));
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
// Tema scuro (preferenza "automatico" con il sistema in modalità scura): pagine principali, con layout e accessibilità.
const DARK_PAGES = [
    [false, 'landing', '/'],
    [false, 'login', '/login'],
    [true, 'home', '/'],
    [true, 'profilo', '/profile'],
    [true, 'lavoro', '/jobs'],
    [true, 'rete', '/network'],
    [true, 'messaggi', '/messages'],
    [true, 'notifiche', '/notifiche'],
    [true, 'gruppo', '/gruppi/g1'],
    [true, 'evento', '/eventi/e1'],
    [true, 'impostazioni-aspetto', '/profile?tab=impostazioni&sezione=aspetto'],
    [true, 'impostazioni-notifiche', '/profile?tab=impostazioni&sezione=notifiche'],
    [true, 'premium', '/premium'],
];
for (const [vpName, viewport] of VIEWPORTS.filter(([n]) => ['desktop', 'mobile'].includes(n))) {
    if (ONLY.length && !ONLY.includes(vpName)) continue;
    const touch = !!viewport.hasTouch;
    for (const loggedIn of [false, true]) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor || 1, isMobile: !!viewport.isMobile, hasTouch: touch, locale: 'it-IT', timezoneId: 'Europe/Rome', colorScheme: 'dark' });
        const page = await context.newPage();
        page.on('pageerror', (e) => errors.push(`[${vpName} scuro] ${e.message}`));
        await mockAppwrite(page, { loggedIn });
        for (const [auth, name, path] of DARK_PAGES.filter(([a]) => a === loggedIn)) {
            try {
                await page.goto(BASE + path, { waitUntil: 'load', timeout: 30_000 });
                await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
                await page.waitForTimeout(800);
                await page.screenshot({ path: `${OUT}/${vpName}-scuro-${name}.png` });
                await shot(page, vpName, `scuro-${name}`, touch);
                console.log(`✓ ${vpName}-scuro-${name}${auth ? '' : ' (ospite)'}`);
            } catch (e) {
                console.log(`✗ ${vpName}-scuro-${name}: ${e.message}`);
            }
        }
        await context.close();
    }
}

// Le stesse pagine con un profilo Premium: statistiche complete e riquadro "Analisi" sbloccato.
for (const [vpName, viewport] of VIEWPORTS.filter(([n]) => ['desktop', 'mobile'].includes(n))) {
    if (ONLY.length && !ONLY.includes(vpName)) continue;
    const touch = !!viewport.hasTouch;
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor || 1, isMobile: !!viewport.isMobile, hasTouch: touch, locale: 'it-IT', timezoneId: 'Europe/Rome' });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`[${vpName}] ${e.message}`));
    await mockAppwrite(page, { loggedIn: true, overrides: { profiles: { [ME]: { premiumUntil: new Date(Date.now() + 20 * 86400000).toISOString() } } } });
    for (const [name, path, act] of [
        ['statistiche-premium', '/statistiche'],
        ['analisi-profilo', '/profile', async (p) => { await p.locator('#analytics-title').scrollIntoViewIfNeeded(); await p.mouse.wheel(0, -120); }],
    ]) {
        try {
            await page.goto(BASE + path, { waitUntil: 'load', timeout: 30_000 });
            await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
            await page.waitForTimeout(800);
            if (act) { await act(page); await page.waitForTimeout(500); }
            await page.screenshot({ path: `${OUT}/${vpName}-${name}.png`, fullPage: name === 'statistiche-premium' });
            await shot(page, vpName, name, touch);
            console.log(`✓ ${vpName}-${name}`);
        } catch (e) {
            console.log(`✗ ${vpName}-${name}: ${e.message}`);
        }
    }
    await context.close();
}

// Vista della struttura: Giulia diventa la piscina, l'annuncio j1 è suo (gestionale annunci e candidati).
const asStructure = {
    profiles: { [ME]: { userType: 'structure', structureName: 'Piscina Lido di Milano', structureType: 'Piscina comunale', firstName: '', lastName: '', title: '', openingHours: ['07:00-22:00', '07:00-13:00,15:00-21:00', '', '', '', '', 'chiuso'] } },
    jobs: { j1: { structureId: ME } },
};
for (const [vpName, viewport] of VIEWPORTS.filter(([n]) => ['desktop', 'mobile', 'mobile-piccolo'].includes(n))) {
    if (ONLY.length && !ONLY.includes(vpName)) continue;
    const touch = !!viewport.hasTouch;
    for (const [name, path, act] of [
        ['annunci', '/jobs/annunci'],
        ['annunci-candidati', '/jobs/j1?candidati=nuove', async (p) => { await p.getByRole('button', { name: /^Valuta/ }).first().click(); }],
        ['lavoro-struttura', '/jobs'],
        ['struttura-propria', '/profile'],
        ['squadra-gestione', '/profile?area=staff', async (p) => { await p.getByRole('tab', { name: /^Squadra/ }).click(); await p.getByText('Sara Colombo').first().waitFor(); }],
        ['invita-staff', '/profile?area=staff', async (p) => { await p.getByRole('tab', { name: /^Squadra/ }).click(); await p.getByRole('button', { name: /Invita nello staff/ }).click(); await p.locator('#invite-search').fill('ma'); await p.waitForTimeout(900); }],
        ['form-orari', '/profile', async (p) => { await p.getByRole('button', { name: /Modifica pagina/ }).first().click(); await p.getByText('Orari di apertura', { exact: true }).scrollIntoViewIfNeeded(); }],
    ]) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor || 1, isMobile: !!viewport.isMobile, hasTouch: touch, locale: 'it-IT', timezoneId: 'Europe/Rome' });
        const page = await context.newPage();
        page.on('pageerror', (e) => errors.push(`[${vpName}] ${e.message}`));
        await mockAppwrite(page, { loggedIn: true, overrides: asStructure });
        try {
            await page.goto(BASE + path, { waitUntil: 'load', timeout: 30_000 });
            await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
            await page.waitForTimeout(800);
            if (act) { await act(page); await page.waitForTimeout(600); }
            await page.screenshot({ path: `${OUT}/${vpName}-${name}.png`, fullPage: true });
            await shot(page, vpName, name, touch);
            console.log(`✓ ${vpName}-${name}`);
        } catch (e) {
            console.log(`✗ ${vpName}-${name}: ${e.message}`);
        }
        await context.close();
    }
}

// Piani per ogni tipo di profilo e prezzi nel pannello amministratori.
const enthusiastStatus = { premium: false, premiumUntil: null, source: null, trialAvailable: true, trialDays: 30, audience: 'enthusiast', prices: { month: 199, year: 1900 }, providers: { stripe: true, paypal: true }, inmailCredits: 0, subscription: null };
const structureStatus = { ...enthusiastStatus, audience: 'structure', prices: { month: 1900, year: 17900 } };
for (const [vpName, viewport] of VIEWPORTS.filter(([n]) => ['desktop', 'mobile'].includes(n))) {
    if (ONLY.length && !ONLY.includes(vpName)) continue;
    const touch = !!viewport.hasTouch;
    for (const [name, path, responses, dark] of [
        ['premium-appassionato', '/premium', { getBillingStatus: () => enthusiastStatus }],
        ['premium-struttura', '/premium', { getBillingStatus: () => structureStatus }],
        ['admin-prezzi', '/admin?tab=piani', { listBlockRelations: () => ({ blocked: [], muted: [], blockedBy: [], isAdmin: true }) }],
        ['scuro-admin-prezzi', '/admin?tab=piani', { listBlockRelations: () => ({ blocked: [], muted: [], blockedBy: [], isAdmin: true }) }, true],
    ]) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor || 1, isMobile: !!viewport.isMobile, hasTouch: touch, locale: 'it-IT', timezoneId: 'Europe/Rome', colorScheme: dark ? 'dark' : 'light' });
        const page = await context.newPage();
        page.on('pageerror', (e) => errors.push(`[${vpName}] ${e.message}`));
        await mockAppwrite(page, { loggedIn: true, responses });
        try {
            await page.goto(BASE + path, { waitUntil: 'load', timeout: 30_000 });
            await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
            await page.waitForTimeout(800);
            await page.screenshot({ path: `${OUT}/${vpName}-${name}.png`, fullPage: true });
            await shot(page, vpName, name, touch);
            console.log(`✓ ${vpName}-${name}`);
        } catch (e) {
            console.log(`✗ ${vpName}-${name}: ${e.message}`);
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

// Rapporto di accessibilità: per regola, con le pagine coinvolte.
if (AXE) {
    const byRule = new Map();
    for (const v of a11y) {
        const r = byRule.get(v.id) || { id: v.id, impact: v.impact, help: v.help, pages: [], nodes: 0, examples: [], pairs: {} };
        r.pages.push(v.page);
        r.nodes += v.count;
        for (const p of v.pairs || []) r.pairs[p] = (r.pairs[p] || 0) + 1;
        for (const n of v.nodes) if (r.examples.length < 15 && !r.examples.some((e) => e.target === n.target)) r.examples.push(n);
        byRule.set(v.id, r);
    }
    const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    const rules = [...byRule.values()].sort((a, b) => (order[a.impact] ?? 9) - (order[b.impact] ?? 9) || b.nodes - a.nodes);
    const blocking = rules.filter((r) => r.impact === 'critical' || r.impact === 'serious');
    const md = ['# Accessibilità (axe-core, WCAG 2.1 A/AA)', '', `Viste controllate: ${A11Y_VIEWPORTS.join(', ')}. Regole violate: ${rules.length} (gravi o critiche: ${blocking.length}).`, ''];
    for (const r of rules) {
        md.push(`## ${r.id} (${r.impact}) — ${r.help}`, '', `${r.nodes} elementi in ${r.pages.length} pagine: ${r.pages.slice(0, 12).join(', ')}${r.pages.length > 12 ? '…' : ''}`, '');
        for (const [p, n] of Object.entries(r.pairs).sort((a, b) => b[1] - a[1]).slice(0, 40)) md.push(`- ${n}× ${p}`);
        for (const e of r.examples) md.push(`- \`${e.target}\` ${e.summary}`, `  \`${e.html.replace(/`/g, "'")}\``);
        md.push('');
    }
    writeFileSync(`${OUT}/a11y.md`, md.join('\n') + '\n');
    writeFileSync(`${OUT}/a11y.json`, JSON.stringify(rules, null, 2));
    console.log(`\nAccessibilità: ${rules.length} regole violate, ${blocking.length} gravi o critiche (vedi a11y.md).`);
    for (const r of blocking) console.log(`♿ ${r.id} (${r.impact}): ${r.help} — ${r.nodes} elementi, ${r.pages.length} pagine`);
}

if (errors.length) {
    console.log('\nErrori JavaScript rilevati:');
    for (const e of [...new Set(errors)]) console.log(' - ' + e);
}
console.log(`\nUtente di esempio: ${ME}`);
