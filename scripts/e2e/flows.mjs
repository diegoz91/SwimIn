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

// A fine test il contesto si chiude mentre l'app può avere richieste o socket in corso:
// gli errori "Target page, context or browser has been closed" non sono fallimenti.
process.on('unhandledRejection', (e) => {
    if (e?.name === 'TargetClosedError' || /has been closed/.test(String(e?.message || e))) return;
    console.error('Errore non gestito:', e);
    process.exitCode = 1;
});


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

/** Bacheca dello staff con un turno di oggi (09:00–12:00) per Sara, nello stato indicato. */
const teamBoard = (status) => ({
    role: 'admin', announcements: [], chatUnread: 0,
    shifts: [{ $id: 'sh_rt', structureId: 'u_giulia', userId: 'u_sara', userName: 'Sara Colombo', date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }), shiftTime: '09:00–12:00', role: 'Assistente bagnanti', status }],
    members: [{ $id: 'u_sara', userId: 'u_sara', firstName: 'Sara', lastName: 'Colombo', title: 'Assistente bagnanti', avatar: '', city: 'Milano', isOnline: false, certificationsList: [] }],
});

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
    ['fase di test: l’avviso blocca l’app finché non si accetta', 'mobile', { loggedIn: true, betaPending: true }, async (page) => {
        await open(page, '/');
        const gate = page.getByRole('dialog', { name: 'Benvenuto nella prova di SwimIn' });
        await gate.waitFor({ timeout: 8000 });
        assert.equal(await page.locator('#root').getAttribute('inert'), '', 'sotto l’avviso la pagina non deve rispondere');
        await gate.getByRole('button', { name: 'Accetto ed entro' }).click();
        await gate.getByText('Per entrare devi accettare le condizioni.').waitFor({ timeout: 3000 });
        await gate.locator('label[for="beta-accept"]').click();
        await gate.getByRole('button', { name: 'Accetto ed entro' }).click();
        await gate.waitFor({ state: 'detached', timeout: 3000 });
        assert.equal(await page.locator('#root').getAttribute('inert'), null);
        assert.ok(await page.evaluate(() => localStorage.getItem('swimin:beta')), 'l’accettazione resta sul dispositivo');
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(800);
        assert.equal(await page.getByRole('dialog', { name: 'Benvenuto nella prova di SwimIn' }).count(), 0, 'dopo aver accettato non ricompare');
    }],
    ['fase di test: iscrizione con il codice del QR', 'mobile', { loggedIn: false, appStatus: { inviteOnly: true } }, async (page, state) => {
        await open(page, '/?invito=nuoto-2026');
        await page.getByText('Sei stato invitato alla fase di test.').waitFor({ timeout: 8000 });
        await page.getByRole('link', { name: 'Usa l’invito' }).click();
        await page.waitForURL((u) => u.pathname === '/register', { timeout: 8000 });
        const code = page.locator('#invite-code');
        assert.equal(await code.inputValue(), 'NUOTO2026', 'il codice del QR è già compilato');
        await page.locator('#firstName').fill('Luca');
        await page.locator('#lastName').fill('Riva');
        await page.locator('#email').fill('luca.riva@example.com');
        await page.locator('#password').fill('Bracciata!2026');
        // Sulla casella, non sul testo: su smartphone il centro dell'etichetta cade sul link ai Termini.
        await page.locator('label[for="accept-terms"]').click({ position: { x: 12, y: 12 } });
        await code.fill('SBAGLIATO');
        await page.getByRole('button', { name: 'Crea account' }).click();
        await page.getByText('Codice non valido, scaduto o già usato da troppe persone.').waitFor({ timeout: 5000 });
        assert.ok(!state.accountCalls.includes('POST /account'), 'con un codice non valido non si crea l’account');
        await code.fill('nuoto2026');
        await page.getByRole('button', { name: 'Crea account' }).click();
        const c = await called(state, 'initProfile');
        assert.deepEqual([c.params.inviteCode, c.params.betaAccepted, c.params.acceptedTerms], ['NUOTO2026', true, true]);
        assert.equal(await page.evaluate(() => localStorage.getItem('swimin:invito')), null, 'dopo l’iscrizione il codice si dimentica');
    }],
    ['recesso da Premium: due passaggi e ricevuta', 'mobile', { loggedIn: true, responses: { getWithdrawal: () => ({ available: true, contract: { id: 's1', provider: 'stripe', period: 'month', startedAt: new Date(Date.now() - 3 * 86400000).toISOString(), deadline: new Date(Date.now() + 11 * 86400000).toISOString() }, receipts: [] }) } }, async (page, state) => {
        await open(page, '/premium');
        await page.getByRole('button', { name: 'Recedi qui dal contratto' }).click();
        const dialog = page.getByRole('dialog', { name: 'Recedi dal contratto' });
        await dialog.getByText('SwimIn Premium mensile').waitFor({ timeout: 5000 });
        assert.ok(!state.calls.some((c) => c.action === 'withdrawSubscription'), 'il primo passaggio non invia nulla');
        await dialog.getByRole('button', { name: 'Conferma recesso' }).click();
        const c = await called(state, 'withdrawSubscription');
        assert.deepEqual([c.params.contractId, c.params.confirm], ['s1', true]);
        await page.getByText(/ricevuta per email/).first().waitFor({ timeout: 5000 });
    }],
    ['segnalazione: la rimozione si motiva e l’autore vede perché', 'desktop', { loggedIn: true, responses: { listBlockRelations: () => ({ blocked: [], muted: [], blockedBy: [], isAdmin: true }) } }, async (page, state) => {
        await open(page, '/admin?tab=segnalazioni');
        await page.getByRole('button', { name: 'Rimuovi contenuto' }).click();
        const dialog = page.getByRole('dialog', { name: 'Rimuovere il contenuto?' });
        await dialog.locator('#resolve-explanation').fill('Pubblicità ripetuta di un servizio a pagamento.');
        await dialog.getByRole('button', { name: 'Rimuovi e invia la motivazione' }).click();
        const c = await called(state, 'adminResolveReport');
        assert.deepEqual([c.params.decision, c.params.ground, c.params.explanation], ['remove', 'spam', 'Pubblicità ripetuta di un servizio a pagamento.']);
        await open(page, '/moderazione/md1');
        await page.getByRole('heading', { name: 'Abbiamo rimosso un tuo post' }).waitFor({ timeout: 8000 });
        await page.getByText('Spam o pubblicità non richiesta').waitFor();
        await page.getByRole('button', { name: 'Contesta la decisione' }).waitFor();
    }],
    ['registro delle violazioni: si registra con la scadenza per il Garante', 'desktop', { loggedIn: true, responses: { listBlockRelations: () => ({ blocked: [], muted: [], blockedBy: [], isAdmin: true }) } }, async (page, state) => {
        await open(page, '/admin?tab=violazioni');
        await page.getByText(/da avvisare entro il/).first().waitFor({ timeout: 8000 });
        await page.getByRole('button', { name: 'Registra una violazione' }).click();
        const dialog = page.getByRole('dialog', { name: 'Registra una violazione' });
        await dialog.locator('#breach-title').fill('Export dei candidati inviato alla persona sbagliata');
        await dialog.locator('#breach-description').fill('Un file con nomi ed email di 5 candidati è stato inviato a un indirizzo esterno.');
        await dialog.getByRole('button', { name: 'Alto' }).click();
        await dialog.getByRole('button', { name: 'Salva nel registro' }).click();
        const c = await called(state, 'adminSaveBreach');
        assert.equal(c.params.risk, 'high');
        assert.ok(c.params.detectedAt, 'data della scoperta già compilata');
    }],
    ['registrazione: i campi obbligatori sono segnalati', 'mobile', { loggedIn: false }, async (page, state) => {
        await open(page, '/register');
        await page.getByRole('button', { name: 'Crea account' }).click();
        await page.locator('[aria-invalid="true"]').first().waitFor({ timeout: 5000 });
        assert.ok(!state.accountCalls.some((c) => c === 'POST /account'), 'senza dati non deve creare l’account');
    }],
    ['feed: tornando alla home riprendi dallo stesso punto, senza ricaricare', 'mobile', { loggedIn: true }, async (page) => {
        await open(page, '/');
        await page.getByRole('group', { name: 'Ordine del feed' }).waitFor({ timeout: 8000 });
        await page.waitForTimeout(500);
        await page.evaluate(() => document.getElementById('scroll-root').scrollTo({ top: 700 }));
        await page.waitForTimeout(300);
        const before = await page.evaluate(() => document.getElementById('scroll-root').scrollTop);
        assert.ok(before > 300, `il feed deve poter scorrere (${before})`);
        await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Rete' }).click();
        await page.waitForURL((u) => u.pathname === '/network', { timeout: 6000 });
        await page.goBack();
        await page.getByRole('group', { name: 'Ordine del feed' }).waitFor({ timeout: 8000 });
        await page.waitForTimeout(600);
        const after = await page.evaluate(() => document.getElementById('scroll-root').scrollTop);
        assert.ok(Math.abs(after - before) < 60, `stesso punto di lettura (prima ${before}, dopo ${after})`);
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
    ['widget dei messaggi: chat in una finestra senza lasciare la pagina', 'desktop', { loggedIn: true }, async (page, state) => {
        const step = async (label, fn) => { try { await fn(); } catch (e) { throw new Error(`${label}: ${String(e?.message || e).split('\n')[0]}`); } };
        await open(page, '/network');
        const dock = page.locator('[data-chat-dock]');
        await step('dock visibile', () => dock.waitFor({ timeout: 8000 }));
        await step('apri elenco', async () => { const t = dock.getByRole('button', { name: 'Apri i messaggi' }); if (await t.isVisible()) await t.click({ timeout: 5000 }); });
        await step('apri conversazione', () => dock.getByRole('button', { name: /Marco Bellini/ }).first().click({ timeout: 8000 }));
        const win = dock.locator('section[aria-label="Chat con Marco Bellini"]');
        await step('finestra aperta', () => win.waitFor({ timeout: 8000 }));
        assert.equal(new URL(page.url()).pathname, '/network', 'la pagina resta la stessa');
        const box = win.getByPlaceholder('Scrivi un messaggio…');
        await step('scrivi', async () => { await box.fill('Ciao dal widget', { timeout: 8000 }); await box.press('Enter'); });
        const c = await called(state, 'sendMessage');
        assert.match(c.params.content, /dal widget/);
        await step('riduci', () => win.getByRole('button', { name: 'Riduci la chat con Marco Bellini' }).click({ timeout: 5000 }));
        await step('ridotta', () => box.waitFor({ state: 'hidden', timeout: 5000 }));
        await step('riapri', () => win.getByRole('button', { name: 'Apri la chat con Marco Bellini' }).first().click({ timeout: 5000 }));
        await step('chiudi', () => win.getByRole('button', { name: 'Chiudi la chat con Marco Bellini' }).click({ timeout: 5000 }));
        await step('chiusa', () => win.waitFor({ state: 'detached', timeout: 5000 }));
    }],
    ['candidarsi a un’offerta', 'mobile', { loggedIn: true }, async (page, state) => {
        await open(page, '/jobs');
        await page.getByRole('button', { name: /Candidati/ }).first().click();
        await page.getByRole('button', { name: 'Invia candidatura' }).click();
        const c = await called(state, 'applyForJob');
        assert.equal(c.params.attachResume, false, 'senza CV nel profilo non si allega nulla');
        await page.getByRole('heading', { name: 'Candidatura inviata' }).waitFor({ timeout: 5000 });
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
        await page.getByRole('button', { name: 'Salva prezzi' }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Aggiorna i prezzi' }).click();
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
    ['la struttura valuta in privato e propone un colloquio', 'desktop', { loggedIn: true, overrides: { profiles: { u_giulia: { userType: 'structure', structureName: 'Piscina Lido di Milano' } }, jobs: { j1: { structureId: 'u_giulia' } } } }, async (page, state) => {
        await open(page, '/jobs/j1?candidati=nuove');
        await page.getByRole('heading', { name: 'Candidati' }).waitFor({ timeout: 8000 });
        await page.getByRole('button', { name: /^Valuta/ }).first().click();
        await page.getByText('Visibile solo a chi gestisce l’annuncio').waitFor({ timeout: 4000 });
        await page.getByRole('radio', { name: '4 stelle' }).click();
        await page.getByLabel('Nota interna').fill('Brevetto rinnovato, disponibile la sera.');
        await page.getByRole('button', { name: 'Salva la valutazione' }).click();
        const rv = await called(state, 'saveApplicationReview');
        assert.equal(rv.params.rating, 4);
        await page.getByRole('button', { name: 'Proponi un colloquio' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.locator('#iv-place').fill('Reception della piscina');
        await dialog.getByRole('button', { name: 'Invia la proposta' }).click();
        const iv = await called(state, 'proposeInterview');
        assert.equal(iv.params.time, '10:00');
        assert.equal(iv.params.mode, 'presenza');
        assert.match(iv.params.date, /^\d{4}-\d{2}-\d{2}$/);
        await page.getByText(/Proposta inviata/).waitFor({ timeout: 4000 });
        // La candidatura passa tra le selezionate, con il colloquio in evidenza.
        await page.getByRole('tab', { name: /^Selezionat/ }).click();
        await page.getByText(/Colloquio proposto/).first().waitFor({ timeout: 4000 });
    }],
    ['chi si candida conferma il colloquio', 'mobile', { loggedIn: true }, async (page, state) => {
        await open(page, '/jobs/j2');
        await page.getByRole('region', { name: 'Colloquio' }).waitFor({ timeout: 8000 });
        await page.getByRole('button', { name: 'Chiedo un altro orario' }).click();
        await page.getByLabel('Quando saresti disponibile?').fill('Giovedì dopo le 15');
        await page.getByRole('button', { name: 'Invia', exact: true }).click();
        const r = await called(state, 'respondInterview');
        assert.equal(r.params.accept, false);
        assert.equal(r.params.reply, 'Giovedì dopo le 15');
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
    ['chi riceve un invito nello staff lo accetta', 'mobile', { loggedIn: true }, async (page, state) => {
        await open(page, '/turni?inviti=1');
        await page.getByRole('heading', { name: 'Inviti nello staff' }).waitFor({ timeout: 8000 });
        await page.getByRole('button', { name: 'Accetta' }).click();
        const c = await called(state, 'respondStaffInvite');
        assert.deepEqual([c.params.structureId, c.params.accept], ['u_aquae', true]);
    }],
    ['il titolare nomina un co-amministratore dallo staff', 'desktop', { loggedIn: true, overrides: { profiles: { u_giulia: { userType: 'structure', structureName: 'Piscina Lido di Milano' } } }, responses: { getTeamBoard: () => ({ ...teamBoard('confirmed'), isOwner: true }), setCoAdmin: ({ userId, admin }) => ({ coAdmins: admin ? [userId] : [] }) } }, async (page, state) => {
        await open(page, '/profile?area=staff');
        await page.getByRole('tab', { name: /^Squadra/ }).click();
        await page.getByRole('button', { name: 'Rendi co-amministratore' }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Nomina' }).click();
        const c = await called(state, 'setCoAdmin');
        assert.deepEqual([c.params.structureId, c.params.userId, c.params.admin], ['u_giulia', 'u_sara', true]);
    }],
    ['nel profilo personale non si creano pagine struttura', 'desktop', { loggedIn: true }, async (page) => {
        await open(page, '/profile');
        await page.locator('#about-title').waitFor({ timeout: 8000 });
        assert.equal(await page.getByText('Le mie strutture').count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Crea pagina' }).count(), 0);
    }],
    ['la struttura invita una persona nello staff', 'desktop', { loggedIn: true, overrides: { profiles: { u_giulia: { userType: 'structure', structureName: 'Piscina Lido di Milano' } } } }, async (page, state) => {
        await open(page, '/profile?area=staff');
        await page.getByRole('tab', { name: /^Squadra/ }).click();
        await page.getByRole('button', { name: /Invita nello staff/ }).click();
        await page.locator('#invite-search').fill('Marco');
        await page.getByRole('button', { name: 'Invita', exact: true }).first().click();
        const c = await called(state, 'inviteStaff');
        assert.equal(c.params.structureId, 'u_giulia');
    }],
    ['le conferme si aprono nell’app: annullare non fa nulla, confermare sì', 'mobile', { loggedIn: true }, async (page, state) => {
        await open(page, '/jobs/candidature');
        await page.getByRole('button', { name: 'Ritira' }).first().click();
        const dialog = page.getByRole('alertdialog');
        await dialog.getByRole('heading', { name: 'Ritirare la candidatura?' }).waitFor({ timeout: 5000 });
        await dialog.getByRole('button', { name: 'Annulla' }).click();
        await dialog.waitFor({ state: 'detached' });
        assert.ok(!state.calls.some((c) => c.action === 'withdrawApplication'), 'annullando non deve ritirare');
        await page.getByRole('button', { name: 'Ritira' }).first().click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Ritira' }).click();
        await called(state, 'withdrawApplication');
    }],
    ['la struttura vede il turno confermato senza ricaricare la pagina', 'desktop', { loggedIn: true, overrides: { profiles: { u_giulia: { userType: 'structure', structureName: 'Piscina Lido di Milano' } } }, responses: { getTeamBoard: () => teamBoard('scheduled') } }, async (page, state) => {
        await open(page, '/profile?area=staff');
        await page.getByRole('tab', { name: /^Turni/ }).click();
        await page.getByText('Da confermare', { exact: true }).first().waitFor({ timeout: 8000 });
        // Sara conferma dal suo telefono: la Function manda il segnale alla struttura.
        state.responses.getTeamBoard = () => teamBoard('confirmed');
        await page.waitForTimeout(500);
        await state.pushRealtime('signals', 'create', { $id: 'sg1', userId: 'u_giulia', topic: 'team:u_giulia', kind: 'respondShift' });
        await page.getByText('Confermato', { exact: true }).first().waitFor({ timeout: 6000 });
        assert.equal(await page.getByText('Da confermare', { exact: true }).count(), 0, 'il turno deve risultare confermato');
    }],
    ['un post nuovo di un collegamento compare come avviso nel feed', 'mobile', { loggedIn: true }, async (page, state) => {
        await open(page, '/');
        await page.getByRole('group', { name: 'Ordine del feed' }).waitFor({ timeout: 8000 });
        await page.waitForTimeout(500);
        await state.pushRealtime('posts', 'create', { $id: 'p_new', authorId: 'u_marco', content: 'Nuovo post', groupId: null });
        await page.getByRole('button', { name: '1 nuovo post' }).waitFor({ timeout: 6000 });
    }],
    ['feed: un nuovo collegamento non ricarica il feed mentre leggi', 'mobile', { loggedIn: true }, async (page, state) => {
        await open(page, '/');
        await page.getByRole('group', { name: 'Ordine del feed' }).waitFor({ timeout: 8000 });
        await page.waitForTimeout(800);
        const reads = state.lists?.posts || 0;
        assert.ok(reads > 0, 'il feed è stato caricato');
        // Il profilo cambia in tempo reale (es. qualcuno accetta la richiesta di collegamento).
        await state.pushRealtime('profiles', 'update', { $id: 'u_giulia', connections: ['u_marco', 'u_sara', 'u_lido', 'u_nuovo'] });
        await page.waitForTimeout(1500);
        assert.equal(state.lists?.posts || 0, reads, 'nessuna ricarica automatica del feed');
    }],
    ['accesso con Google', 'mobile', { loggedIn: false }, async (page, state) => {
        await open(page, '/login');
        await page.getByRole('button', { name: 'Continua con Google' }).click();
        await page.waitForURL((u) => !u.pathname.startsWith('/login') && !u.pathname.startsWith('/accesso'), { timeout: 10000 });
        assert.ok(state.accountCalls.includes('POST /account/sessions/token'), 'il token di Google deve aprire la sessione');
        await page.getByRole('group', { name: 'Ordine del feed' }).waitFor({ timeout: 8000 });
    }],
    ['primo accesso con Google: si completa l’iscrizione', 'desktop', { loggedIn: false, missing: { profiles: ['u_giulia'] } }, async (page, state) => {
        await open(page, '/register?tipo=struttura');
        await page.getByRole('button', { name: 'Iscriviti con Google' }).click();
        await page.getByRole('heading', { name: 'Completa l’iscrizione' }).waitFor({ timeout: 10000 });
        assert.equal(await page.getByRole('radio', { name: /Struttura/ }).getAttribute('aria-checked'), 'true', 'il tipo scelto prima di Google resta selezionato');
        await page.locator('#structureName').fill('Piscina Comunale di Segrate');
        await page.getByRole('button', { name: 'Crea il mio profilo' }).click();
        await page.getByText('Per creare l’account devi accettare').waitFor({ timeout: 3000 });
        assert.ok(!state.calls.some((c) => c.action === 'initProfile'), 'senza termini accettati non si crea il profilo');
        await page.locator('label[for="accept-terms"]').click();
        await page.getByRole('button', { name: 'Crea il mio profilo' }).click();
        const c = await called(state, 'initProfile');
        assert.deepEqual([c.params.userType, c.params.structureName, c.params.acceptedTerms], ['structure', 'Piscina Comunale di Segrate', true]);
    }],
    ['l’avviso di assunzione compare una volta sola', 'mobile', { loggedIn: true, overrides: { applications: { a1: { status: 'hired', $updatedAt: new Date().toISOString() } } } }, async (page) => {
        await open(page, '/');
        const banner = page.getByRole('heading', { name: 'Sei stato assunto' });
        await banner.waitFor({ timeout: 8000 });
        await page.getByRole('link', { name: 'Entra nell’area staff' }).waitFor();
        await open(page, '/');
        await page.getByRole('group', { name: 'Ordine del feed' }).waitFor({ timeout: 8000 });
        await page.waitForTimeout(1500);
        assert.equal(await banner.count(), 0, 'alla seconda visita l’avviso non deve più comparire');
        // La scorciatoia alle strutture resta sopra il feed.
        await page.getByRole('navigation', { name: 'Le strutture in cui lavori' }).getByRole('link', { name: /Piscina Lido di Milano/ }).waitFor();
    }],
    ['il calendario dei turni riunisce più strutture e segnala le sovrapposizioni', 'desktop', { loggedIn: true }, async (page) => {
        await open(page, '/turni?vista=mese');
        await page.getByRole('group', { name: 'Filtra per struttura' }).waitFor({ timeout: 8000 });
        await page.getByText(/turni si sovrappongono/).waitFor();
        await page.getByRole('button', { name: 'Mostra il giorno' }).click();
        await page.getByText('Sovrapposto').first().waitFor();
        await page.getByRole('group', { name: 'Filtra per struttura' }).getByRole('button', { name: /Centro Nuoto Rozzano/ }).click();
        assert.ok(page.url().includes('struttura=u_rozzano'), 'il filtro resta nell’indirizzo');
    }],
    ['caricare il CV dal profilo', 'desktop', { loggedIn: true }, async (page, state) => {
        await open(page, '/profile');
        const section = page.locator('section[aria-labelledby="resume-title"]');
        await section.getByText('Aggiungi il tuo CV').waitFor({ timeout: 8000 });
        await section.locator('input[type="file"]').setInputFiles({ name: 'Giulia Ferri CV.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(4096, 37) });
        const c = await called(state, 'setMyResume');
        assert.ok(c.params.fileId, 'la Function riceve il file caricato');
        await section.getByText('Giulia Ferri CV.pdf').waitFor();
        await section.getByRole('button', { name: 'Elimina' }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Elimina' }).click();
        await called(state, 'deleteMyResume');
        await section.getByText('Aggiungi il tuo CV').waitFor();
    }],
    ['candidatura rapida con il CV del profilo', 'mobile', { loggedIn: true, responses: { getMyResume: () => ({ fileId: 'cv1', name: 'CV Giulia 2026.pdf', size: 240000, updatedAt: new Date().toISOString() }) } }, async (page, state) => {
        await open(page, '/jobs');
        await page.getByRole('button', { name: /Candidati/ }).first().click();
        await page.getByText('Allega CV Giulia 2026.pdf').waitFor({ timeout: 8000 });
        await page.getByRole('button', { name: 'Invia candidatura' }).click();
        const c = await called(state, 'applyForJob');
        assert.equal(c.params.attachResume, true, 'il CV del profilo è allegato');
        await page.getByRole('heading', { name: 'Candidatura inviata' }).waitFor({ timeout: 5000 });
    }],
    ['notifiche lette dalla campanella', 'desktop', { loggedIn: true }, async (page, state) => {
        await open(page, '/');
        const bell = page.getByRole('button', { name: /^Notifiche, \d+ da leggere/ });
        await bell.waitFor({ timeout: 8000 });
        const before = Number((await bell.getAttribute('aria-label')).match(/\d+/)[0]);
        await bell.click();
        await page.getByRole('button', { name: /^Segna come letta:/ }).first().click();
        if (before > 1) {
            await page.getByText(before - 1 === 1 ? '1 da leggere' : `${before - 1} da leggere`, { exact: true }).waitFor({ timeout: 3000 });
            await page.getByRole('button', { name: 'Segna tutte come lette' }).click();
            await called(state, 'markAllNotificationsRead');
        }
        await page.getByText('Sei in pari: nessuna notifica da leggere.').waitFor({ timeout: 3000 });
        assert.ok(page.url().endsWith('/'), 'si resta sulla pagina: non serve aprire le notifiche');
    }],
    ['Live in arrivo: niente Live nella barra, gli eventi stanno nella Rete', 'mobile', { loggedIn: true }, async (page) => {
        await open(page, '/live');
        await page.getByRole('heading', { name: 'Le dirette arrivano presto' }).waitFor({ timeout: 8000 });
        const nav = page.getByRole('navigation', { name: 'Navigazione principale' });
        await nav.getByRole('link', { name: 'Rete' }).waitFor();
        assert.equal(await nav.getByRole('link', { name: 'Live' }).count(), 0);
        assert.equal(await nav.getByRole('link', { name: 'Eventi' }).count(), 0);
    }],
    ['Rete: prima i collegamenti, accanto i suggerimenti più affini', 'desktop', { loggedIn: true }, async (page, state) => {
        await open(page, '/network');
        await page.getByRole('heading', { name: 'I tuoi collegamenti' }).waitFor({ timeout: 8000 });
        const panel = page.getByRole('complementary', { name: 'Potresti conoscere' });
        await panel.waitFor();
        const connect = panel.getByRole('button', { name: /^Collegati con / }).first();
        const label = await connect.getAttribute('aria-label');
        await connect.click();
        await called(state, 'sendConnectionRequest');
        // Inviata la richiesta, il suggerimento lascia il posto al successivo.
        await page.getByText('Richiesta inviata.').first().waitFor({ timeout: 4000 });
        await panel.getByRole('button', { name: label }).waitFor({ state: 'detached', timeout: 4000 });
    }],
    ['home: la scheda del profilo ha solo le scorciatoie essenziali', 'desktop', { loggedIn: true }, async (page) => {
        await open(page, '/');
        await page.getByRole('link', { name: /Visite al profilo/ }).first().waitFor({ timeout: 8000 });
        for (const name of ['Collegamenti', 'Gruppi', 'Elementi salvati']) await page.getByRole('link', { name: new RegExp(`^${name}`) }).first().waitFor();
        for (const name of ['Brevetti', 'Competenze']) assert.equal(await page.getByRole('link', { name: new RegExp(`^${name}`) }).count(), 0, name);
    }],
    ['Rete: gruppi ed eventi sono schede della stessa sezione', 'desktop', { loggedIn: true }, async (page) => {
        await open(page, '/network');
        const tabs = page.getByRole('navigation', { name: 'Sezioni della rete' });
        await tabs.getByRole('button', { name: 'Gruppi' }).click();
        await page.waitForURL(/\/network\?tab=gruppi$/, { timeout: 6000 });
        await page.getByRole('heading', { name: 'Gruppi', level: 1 }).waitFor({ timeout: 8000 });
        assert.equal(await tabs.getByRole('button', { name: 'Gruppi' }).getAttribute('aria-current'), 'page');
        await tabs.getByRole('button', { name: 'Eventi' }).click();
        await page.getByRole('heading', { name: 'Eventi', level: 1 }).waitFor({ timeout: 8000 });
        await tabs.getByRole('button', { name: 'Collegamenti' }).click();
        await page.waitForURL((u) => u.pathname === '/network' && !u.search, { timeout: 6000 });
        // I vecchi indirizzi portano alle schede; Eventi non è più nella barra ma in Altro.
        await open(page, '/eventi');
        await page.waitForURL(/\/network\?tab=eventi$/, { timeout: 6000 });
        const bar = page.getByRole('navigation', { name: 'Navigazione principale' });
        assert.equal(await bar.getByRole('link', { name: 'Eventi', exact: true }).count(), 0, 'Eventi non sta nella barra');
        // Nella barra: la scheda Eventi ha anche un filtro "Altro".
        await bar.getByRole('button', { name: /^Altro/ }).click();
        await page.getByRole('menu', { name: 'Altro' }).getByRole('menuitem', { name: 'Eventi' }).click();
        await page.waitForURL(/tab=eventi$/, { timeout: 6000 });
    }],
    ['statistiche: chi compare nelle ricerche e chi apre un annuncio viene contato', 'desktop', { loggedIn: true }, async (page, state) => {
        await open(page, '/cerca?q=Marco');
        await page.getByRole('heading', { name: 'Persone' }).first().waitFor({ timeout: 8000 });
        const s = await called(state, 'recordSearchAppearances');
        assert.ok(s.params.profileIds.length > 0 && s.params.profileIds.length <= 30, 'i profili mostrati');
        assert.ok(!s.params.profileIds.includes('u_giulia'), 'mai il proprio profilo');
        await open(page, '/jobs/j2');
        const v = await called(state, 'recordJobView');
        assert.equal(v.params.jobId, 'j2');
    }],
    ['statistiche: "Vedi chi" apre i visitatori senza lasciare la pagina', 'desktop', { loggedIn: true, overrides: { profiles: { u_giulia: { premiumUntil: new Date(Date.now() + 20 * 86400000).toISOString() } } } }, async (page) => {
        await open(page, '/statistiche');
        await page.getByRole('button', { name: 'Vedi chi' }).click();
        const dialog = page.getByRole('dialog', { name: 'Chi ha visto il tuo profilo' });
        await dialog.waitFor({ timeout: 5000 });
        assert.equal(new URL(page.url()).pathname, '/statistiche', 'si resta sulle statistiche');
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached', timeout: 4000 });
        assert.equal(new URL(page.url()).pathname, '/statistiche');
        await page.getByRole('heading', { name: 'Chi ti visita' }).waitFor();
    }],
    ['statistiche Premium: confronto con il mese prima, ruoli e province', 'mobile', { loggedIn: true, overrides: { profiles: { u_giulia: { premiumUntil: new Date(Date.now() + 20 * 86400000).toISOString() } } } }, async (page) => {
        await open(page, '/statistiche');
        await page.getByText('Comparse nelle ricerche').first().waitFor({ timeout: 8000 });
        await page.getByText('+25%').first().waitFor();
        await page.getByRole('heading', { name: 'Province' }).waitFor();
        await page.getByText('Milano', { exact: true }).first().waitFor();
        await page.getByText(/Nelle ricerche ti hanno trovato 18 strutture/).waitFor();
    }],
    ['ricerca: recenti e suggerimenti con il campo vuoto', 'mobile', { loggedIn: true }, async (page) => {
        await open(page, '/cerca?q=Marco');
        await page.getByRole('heading', { name: 'Persone' }).first().waitFor({ timeout: 8000 });
        await open(page, '/cerca');
        await page.getByRole('heading', { name: 'Ricerche recenti' }).waitFor({ timeout: 5000 });
        await page.getByRole('button', { name: 'Marco' }).waitFor();
        await page.getByRole('button', { name: 'Assistente bagnanti' }).click();
        await page.waitForURL(/q=Assistente/);
    }],
    ['un collega cerca un sostituto: lo prendo dai miei turni', 'mobile', { loggedIn: true }, async (page, state) => {
        await open(page, '/turni');
        await page.getByRole('heading', { name: 'Cambi turno' }).waitFor({ timeout: 8000 });
        await page.getByText('Turno disponibile: Sara Colombo cerca un sostituto').waitFor();
        await page.getByRole('button', { name: 'Lo prendo' }).click();
        const c = await called(state, 'respondShiftSwap');
        assert.deepEqual([c.params.swapId, c.params.accept], ['sw1', true]);
    }],
    ['la struttura apre i modelli di settimana', 'desktop', { loggedIn: true, overrides: { profiles: { u_giulia: { userType: 'structure', structureName: 'Piscina Lido di Milano' } } }, responses: { getTeamBoard: () => teamBoard('scheduled') } }, async (page, state) => {
        await open(page, '/profile?area=staff');
        await page.getByRole('tab', { name: /^Turni/ }).click();
        await page.getByRole('button', { name: 'Modelli' }).click();
        await page.getByText('Settimana estiva').waitFor({ timeout: 8000 });
        await page.getByRole('button', { name: 'Applica' }).click();
        await called(state, 'applyShiftTemplate');
    }],
    ['in manutenzione si vede la pagina dedicata, la pagina di stato resta aperta', 'mobile', { loggedIn: true, appStatus: { mode: 'maintenance', message: 'Aggiornamento del database in corso.', until: '' } }, async (page) => {
        await open(page, '/');
        await page.getByRole('heading', { name: 'SwimIn è in manutenzione' }).waitFor({ timeout: 8000 });
        await page.getByText('Aggiornamento del database in corso.').waitFor();
        await page.getByRole('link', { name: 'Stato del servizio' }).click();
        await page.getByRole('heading', { name: 'Manutenzione in corso' }).waitFor({ timeout: 8000 });
    }],
    ['l’amministratore mette SwimIn in manutenzione', 'desktop', { loggedIn: true, responses: { listBlockRelations: () => ({ blocked: [], muted: [], blockedBy: [], isAdmin: true }) } }, async (page, state) => {
        await open(page, '/admin?tab=stato');
        await page.getByRole('radio', { name: /^Manutenzione/ }).click();
        await page.locator('#status-message').fill('Aggiornamento del database: torniamo alle 23:30.');
        await page.getByRole('button', { name: 'Attiva la manutenzione' }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Attiva la manutenzione' }).click();
        const c = await called(state, 'adminSetAppStatus');
        assert.equal(c.params.mode, 'maintenance');
        assert.equal(c.params.message, 'Aggiornamento del database: torniamo alle 23:30.');
    }],
    ['il responsabile legale esporta una conservazione con il motivo', 'desktop', { loggedIn: true, responses: { listBlockRelations: () => ({ blocked: [], muted: [], blockedBy: [], isAdmin: true, isLegal: true }) } }, async (page, state) => {
        await open(page, '/admin?tab=autorita');
        await page.getByText('RGNR 1234/2026').waitFor({ timeout: 8000 });
        await page.getByRole('button', { name: 'Esporta' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: 'Scarica il file cifrato' }).click();
        await dialog.getByText('Indica il motivo').waitFor({ timeout: 3000 });
        assert.ok(!state.calls.some((c) => c.action === 'legalExportHold'), 'senza motivo non si esporta');
        await dialog.locator('#step-reason').fill('Consegna alla Procura, richiesta prot. 55/2026');
        const download = page.waitForEvent('download', { timeout: 8000 });
        await dialog.getByRole('button', { name: 'Scarica il file cifrato' }).click();
        const file = await download;
        assert.match(file.suggestedFilename(), /^conservazione-RGNR_1234_2026-\d{4}-\d{2}-\d{2}\.json$/);
        const c = await called(state, 'legalExportHold');
        assert.deepEqual([c.params.holdId, c.params.reason], ['h1', 'Consegna alla Procura, richiesta prot. 55/2026']);
    }],
    ['un amministratore senza etichetta legal non vede le richieste delle autorità', 'desktop', { loggedIn: true, responses: { listBlockRelations: () => ({ blocked: [], muted: [], blockedBy: [], isAdmin: true }) } }, async (page) => {
        await open(page, '/admin?tab=accessi');
        await page.getByText('Ha esportato una conservazione').waitFor({ timeout: 8000 });
        assert.equal(await page.getByRole('tab', { name: 'Richieste autorità' }).count(), 0);
        assert.equal(await page.getByRole('tab', { name: 'Registro accessi' }).getAttribute('aria-selected'), 'true');
    }],
    ['rallentamenti: avviso in cima che si può chiudere', 'mobile', { loggedIn: true, appStatus: { mode: 'degraded', message: 'Le notifiche arrivano in ritardo.', until: '' } }, async (page) => {
        await open(page, '/');
        const banner = page.getByRole('status').filter({ hasText: 'Le notifiche arrivano in ritardo.' });
        await banner.waitFor({ timeout: 8000 });
        await page.getByRole('button', { name: 'Chiudi l’avviso' }).click();
        await banner.waitFor({ state: 'detached', timeout: 4000 });
    }],
    ['menu essenziale: Altro nella barra, nessun doppione nel menu dell’account', 'desktop', { loggedIn: true }, async (page) => {
        await open(page, '/');
        await page.getByRole('button', { name: /^Altro/ }).click();
        const altro = page.getByRole('menu', { name: 'Altro' });
        await altro.getByRole('menuitem', { name: 'Gruppi' }).waitFor({ timeout: 4000 });
        await altro.getByRole('menuitem', { name: 'Piscine e strutture' }).click();
        await page.waitForURL(/\/strutture$/, { timeout: 6000 });
        await page.getByRole('button', { name: 'Menu account' }).click();
        const names = (await page.getByRole('menuitem').allInnerTexts()).map((t) => t.trim());
        for (const doppione of ['Eventi', 'Gruppi', 'Statistiche', 'Notifiche', 'Piscine e strutture']) {
            assert.ok(!names.some((n) => n === doppione), `"${doppione}" non deve stare nel menu dell'account (${names.join(', ')})`);
        }
        assert.ok(names.includes('Elementi salvati') && names.includes('Impostazioni e privacy') && names.includes('Esci'), names.join(', '));
    }],
    ['su smartphone Gruppi e Piscine sono nel menu dell’account', 'mobile', { loggedIn: true }, async (page) => {
        await open(page, '/');
        await page.getByRole('button', { name: 'Menu account' }).click();
        await page.getByRole('menuitem', { name: 'Gruppi' }).click();
        await page.waitForURL(/\/network\?tab=gruppi$/, { timeout: 6000 });
    }],
    ['scrivere un suggerimento dal menu dell’account', 'desktop', { loggedIn: true }, async (page, state) => {
        await open(page, '/');
        await page.getByRole('button', { name: 'Menu account' }).click();
        await page.getByRole('menuitem', { name: 'Scrivici un suggerimento' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: 'Qualcosa non va' }).click();
        await dialog.locator('#feedback-message').fill('Il calendario dei turni non si apre dal telefono.');
        await dialog.getByRole('button', { name: 'Invia', exact: true }).click();
        const c = await called(state, 'sendFeedback');
        assert.deepEqual([c.params.kind, c.params.page], ['problema', '/']);
        await page.getByText('Grazie: lo guardiamo al più presto.').waitFor({ timeout: 4000 });
    }],
    ['la struttura esporta i turni del mese', 'desktop', { loggedIn: true, overrides: { profiles: { u_giulia: { userType: 'structure', structureName: 'Piscina Lido di Milano' } } }, responses: { getTeamBoard: () => teamBoard('scheduled') } }, async (page, state) => {
        await open(page, '/profile?area=staff');
        await page.getByRole('tab', { name: /^Turni/ }).click();
        await page.getByRole('button', { name: 'Esporta' }).click();
        const download = page.waitForEvent('download', { timeout: 8000 });
        await page.getByRole('dialog').getByRole('button', { name: 'Scarica il file' }).click();
        const file = await download;
        assert.match(file.suggestedFilename(), /^turni-piscina-lido-di-milano-\d{4}-\d{2}\.csv$/);
        await called(state, 'exportShifts');
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
    // La Content Security Policy blocca qualcosa che l'app usa: è un errore da correggere (vite.config.ts).
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) jsErrors.push(`CSP: ${m.text().slice(0, 300)}`); });
    // Nessuna finestra del browser (confirm, alert, prompt): le conferme sono quelle dell'app.
    page.on('dialog', (d) => { jsErrors.push(`finestra del browser: ${d.message()}`); void d.dismiss(); });
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
