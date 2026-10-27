#!/usr/bin/env node
/**
 * Prova completa su Appwrite REALE (non il finto delle schermate).
 *
 * Crea quattro account veri e temporanei, con le stesse chiamate dell'app (iscrizione, accesso,
 * JWT, Function `api`, archivio file, letture dirette delle tabelle) e percorre i flussi principali:
 * iscrizione, CV, annuncio, candidatura con CV, colloquio, valutazione interna, assunzione,
 * invito nello staff, turni, cambio turno, chat con allegato. A ogni passo controlla anche
 * quello che NON deve succedere (letture e scritture vietate a chi non c'entra).
 * Alla fine elimina gli account (azione deleteAccount) e, se c'è la chiave API, ripulisce
 * le righe rimaste.
 *
 * Gli account usano email `swimin-e2e+<run>-<ruolo>@example.com`: la Function li riconosce e
 * i loro annunci non avvisano le persone vere (avvisi di lavoro).
 *
 * Uso:  APPWRITE_ENDPOINT=… APPWRITE_PROJECT_ID=… [APPWRITE_API_KEY=…] node scripts/real/flows.mjs
 * In CI: workflow "Prova reale" (.github/workflows/real-e2e.yml). Rapporto in real-e2e.md.
 */
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const ENDPOINT = (process.env.APPWRITE_ENDPOINT || '').replace(/\/$/, '');
const PROJECT = process.env.APPWRITE_PROJECT_ID || '';
const KEY = process.env.APPWRITE_API_KEY || '';
const REPORT = process.env.REAL_E2E_REPORT || 'real-e2e.md';
const DB = 'swimwaveup_db';
const FUNCTION = 'api';
if (!ENDPOINT || !PROJECT) {
  console.error('Servono APPWRITE_ENDPOINT e APPWRITE_PROJECT_ID.');
  process.exit(2);
}

const RUN = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex')}`;
const PASSWORD = `Prova-${randomBytes(9).toString('base64url')}!7`;
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Chiamate REST come le fa l'app (stessi endpoint dell'SDK web)
// ---------------------------------------------------------------------------
class HttpError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function rest(method, path, { jwt, cookie, body, form, key } = {}) {
  const headers = { 'X-Appwrite-Project': PROJECT };
  if (jwt) headers['X-Appwrite-JWT'] = jwt;
  if (key) headers['X-Appwrite-Key'] = key;
  if (cookie) {
    headers.Cookie = cookie.header;
    if (cookie.fallback) headers['X-Fallback-Cookies'] = cookie.fallback;
  }
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${ENDPOINT}${path}`, { method, headers, body: payload, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new HttpError(res.status, data?.message || `${method} ${path}: ${res.status}`, data);
  return { data, res };
}

const users = {}; // ruolo -> { id, email, jwt, cookie }

async function signUp(role, name) {
  const email = `swimin-e2e+${RUN}-${role}@example.com`;
  const { data } = await rest('POST', '/account', { body: { userId: 'unique()', email, password: PASSWORD, name } });
  users[role] = { id: data.$id, email, name };
  await logIn(role);
  return users[role];
}

/** Accesso con email e password (come l'app) e JWT della sessione per le chiamate successive. */
async function logIn(role) {
  const u = users[role];
  const { res } = await rest('POST', '/account/sessions/email', { body: { email: u.email, password: PASSWORD } });
  const pairs = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).filter(Boolean);
  u.cookie = { header: pairs.join('; '), fallback: res.headers.get('x-fallback-cookies') || '' };
  await refreshJwt(role);
}

async function refreshJwt(role) {
  const u = users[role];
  const { data } = await rest('POST', '/account/jwts', { cookie: u.cookie });
  u.jwt = data.jwt;
}

/** Azione della Function `api` con l'identità dell'utente (x-appwrite-user-id lo mette Appwrite). */
async function api(role, action, params = {}) {
  const { data: ex } = await rest('POST', `/functions/${FUNCTION}/executions`, {
    jwt: users[role].jwt,
    body: { body: JSON.stringify({ action, ...params }), async: false, path: '/', method: 'POST', headers: { 'content-type': 'application/json' } },
  });
  let payload;
  try {
    payload = JSON.parse(ex.responseBody || '{}');
  } catch {
    throw new HttpError(ex.responseStatusCode || 500, `${action}: risposta non valida (${String(ex.responseBody).slice(0, 120)})`);
  }
  if (!payload.ok) throw new HttpError(ex.responseStatusCode || 400, `${action}: ${payload.error || 'errore'}`, payload);
  return payload.data;
}

/** Un PDF minimo ma valido (per CV e allegati). */
const pdf = (title) =>
  Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 20 100 Td (${title}) Tj ET\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`
  );

async function upload(role, bucket, name, bytes) {
  const form = new FormData();
  form.append('fileId', 'unique()');
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), name);
  form.append('permissions[]', `read("user:${users[role].id}")`);
  form.append('permissions[]', `delete("user:${users[role].id}")`);
  const { data } = await rest('POST', `/storage/buckets/${bucket}/files`, { jwt: users[role].jwt, form });
  created.files.push({ bucket, id: data.$id });
  return data.$id;
}

const readDoc = (role, table, id) => rest('GET', `/databases/${DB}/collections/${table}/documents/${id}`, { jwt: users[role].jwt }).then((r) => r.data);
const readFile = (role, bucket, id) => rest('GET', `/storage/buckets/${bucket}/files/${id}`, { jwt: users[role].jwt }).then((r) => r.data);
const writeDoc = (role, table, id, data) => rest('PATCH', `/databases/${DB}/collections/${table}/documents/${id}`, { jwt: users[role].jwt, body: { data } });

// ---------------------------------------------------------------------------
// Passi e rapporto
// ---------------------------------------------------------------------------
const results = [];
const created = { files: [], jobId: null, applicationId: null, shiftIds: [], swapIds: [], messageIds: [] };

function ok(cond, message) {
  if (!cond) throw new Error(message);
}

/** Deve fallire: con uno di questi stati HTTP (o qualunque errore se non indicati). */
async function denied(promise, what, statuses = [401, 403, 404]) {
  try {
    await promise;
  } catch (e) {
    if (!statuses.length || statuses.includes(e.status)) return;
    throw new Error(`${what}: errore inatteso ${e.status} ${e.message}`);
  }
  throw new Error(`${what}: doveva essere vietato e invece è riuscito`);
}

async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`✅ ${name} (${Date.now() - t} ms)`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t, error: e.message });
    console.log(`❌ ${name}: ${e.message}`);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Flussi
// ---------------------------------------------------------------------------
async function flows() {
  await step('Function raggiungibile (health)', async () => {
    const { data: ex } = await rest('POST', `/functions/${FUNCTION}/executions`, { body: { body: JSON.stringify({ action: 'health' }), async: false, path: '/', method: 'POST', headers: { 'content-type': 'application/json' } } });
    const p = JSON.parse(ex.responseBody || '{}');
    ok(p.ok && p.data.actions > 50, `health non valido: ${ex.responseBody}`);
    console.log(`   versione ${p.data.version || '?'}, stato ${p.data.status?.mode || 'ok'}`);
  });

  await step('Iscrizione: struttura, candidata, collega ed esterno', async () => {
    await signUp('struttura', `Piscina prova ${RUN}`);
    await api('struttura', 'initProfile', { userType: 'structure', structureName: `Piscina prova automatica ${RUN}`, acceptedTerms: true, termsVersion: 'prova' });
    for (const [role, first] of [['candidata', 'Carla'], ['collega', 'Paolo'], ['esterno', 'Ettore']]) {
      await signUp(role, `${first} Prova`);
      await api(role, 'initProfile', { userType: 'professional', personType: 'professional', firstName: first, lastName: 'Prova', acceptedTerms: true, termsVersion: 'prova' });
    }
    const p = await readDoc('esterno', 'profiles', users.candidata.id);
    ok(p.firstName === 'Carla', 'il profilo appena creato non si legge');
    ok(!('email' in p) || !p.email, 'l’email non deve stare sul profilo pubblico');
  });

  await step('Il profilo si modifica solo dalla Function', async () => {
    await denied(writeDoc('candidata', 'profiles', users.candidata.id, { premiumUntil: day(365) }), 'scrittura diretta di premiumUntil', []);
    await denied(writeDoc('candidata', 'profiles', users.collega.id, { firstName: 'Hacker' }), 'modifica del profilo di un altro', []);
  });

  await step('CV personale (PDF privato)', async () => {
    const fileId = await upload('candidata', 'resumes', 'CV Carla Prova.pdf', pdf('CV Carla Prova'));
    const info = await api('candidata', 'setMyResume', { fileId });
    ok(info.name && info.size > 0, 'CV non registrato');
    ok((await api('candidata', 'getMyResume'))?.fileId === fileId, 'getMyResume non restituisce il CV');
    await denied(readFile('esterno', 'resumes', fileId), 'un estraneo legge il CV');
  });

  await step('Annuncio della struttura', async () => {
    const job = await api('struttura', 'createJob', {
      structureId: users.struttura.id,
      title: `Assistente bagnanti (prova automatica ${RUN})`,
      description: 'Annuncio creato dalla prova automatica di SwimIn: viene chiuso ed eliminato entro pochi minuti.',
      role: 'Assistente bagnanti',
      contractType: 'part-time',
      city: 'Milano',
      province: 'MI',
      expiryDays: 1,
    });
    created.jobId = job.$id;
    ok(job.alerted === 0, 'l’annuncio di prova non deve avvisare le persone vere');
    await denied(writeDoc('struttura', 'jobs', job.$id, { featured: true }), 'scrittura diretta sull’annuncio', []);
  });

  await step('Candidatura con CV allegato', async () => {
    const app = await api('candidata', 'applyForJob', { jobId: created.jobId, coverLetter: 'Brevetto FIN valido, disponibile la sera.', attachResume: true });
    created.applicationId = app.$id;
    ok(app.resumeFileId, 'la candidatura non ha la copia del CV');
    await readFile('struttura', 'resumes', app.resumeFileId); // chi seleziona la vede
    await denied(readFile('esterno', 'resumes', app.resumeFileId), 'un estraneo legge il CV della candidatura');
    await denied(readDoc('esterno', 'applications', app.$id), 'un estraneo legge la candidatura');
    await denied(writeDoc('candidata', 'applications', app.$id, { status: 'hired' }), 'la candidata si auto-assume', []);
  });

  await step('Valutazione interna (invisibile alla candidata)', async () => {
    await api('struttura', 'saveApplicationReview', { applicationId: created.applicationId, rating: 4, note: 'Prova automatica: ottima.' });
    const reviews = await api('struttura', 'getApplicationReviews', { jobId: created.jobId });
    ok(reviews[created.applicationId]?.rating === 4, 'valutazione non salvata');
    await denied(api('candidata', 'getApplicationReviews', { jobId: created.jobId }), 'la candidata legge le note', [400, 403]);
    await denied(readDoc('candidata', 'application_reviews', created.applicationId), 'la candidata legge la riga delle note');
  });

  await step('Colloquio: proposta e conferma', async () => {
    const proposed = await api('struttura', 'proposeInterview', { applicationId: created.applicationId, date: day(2), time: '10:00', mode: 'presenza', place: 'Reception della piscina', message: 'Porta il brevetto.' });
    ok(proposed.interviewStatus === 'proposed' && proposed.status === 'accepted', 'proposta non registrata');
    await denied(api('esterno', 'respondInterview', { applicationId: created.applicationId, accept: true }), 'un estraneo conferma il colloquio', [400, 403]);
    const answered = await api('candidata', 'respondInterview', { applicationId: created.applicationId, accept: true });
    ok(answered.interviewStatus === 'accepted', 'conferma non registrata');
  });

  await step('Assunzione: la candidata entra nello staff', async () => {
    await api('struttura', 'hireCandidate', { applicationId: created.applicationId });
    const teams = await api('candidata', 'listMyTeams');
    ok(teams.some((t) => t.structureId === users.struttura.id), 'la struttura non compare in "Lavori presso"');
    await denied(api('esterno', 'getTeamBoard', { structureId: users.struttura.id }), 'un estraneo apre l’area staff', [400, 403]);
  });

  await step('Invito nello staff accettato dal collega', async () => {
    await api('struttura', 'inviteStaff', { structureId: users.struttura.id, userId: users.collega.id });
    const invites = await api('collega', 'listMyStaffInvites');
    ok(invites.some((i) => i.structureId === users.struttura.id), 'invito non ricevuto');
    await api('collega', 'respondStaffInvite', { structureId: users.struttura.id, accept: true });
    ok((await api('collega', 'listMyTeams')).some((t) => t.structureId === users.struttura.id), 'il collega non è nello staff');
  });

  await step('Turni: singolo confermato e serie settimanale', async () => {
    const shift = await api('struttura', 'createShift', { structureId: users.struttura.id, userId: users.candidata.id, date: day(3), shiftTime: '09:00–13:00' });
    created.shiftIds.push(shift.$id);
    await api('candidata', 'respondShift', { shiftId: shift.$id, status: 'confirmed' });
    const series = await api('struttura', 'createShiftSeries', { structureId: users.struttura.id, userId: users.collega.id, startDate: day(1), endDate: day(14), weekdays: [1, 3], shiftTime: '14:00–18:00' });
    ok(series.created.length >= 2, 'serie non creata');
    created.shiftIds.push(...series.created.map((s) => s.$id));
    const mine = await api('candidata', 'listMyShifts');
    ok(mine.some((s) => s.$id === shift.$id && s.status === 'confirmed'), 'il turno non compare nel calendario personale');
    await denied(readDoc('esterno', 'shifts', shift.$id), 'un estraneo legge un turno');
  });

  await step('Cambio turno tra colleghi', async () => {
    const swap = await api('candidata', 'proposeShiftSwap', { shiftId: created.shiftIds[0], toUserId: users.collega.id, message: 'Prova automatica' });
    created.swapIds.push(swap.$id);
    await denied(api('esterno', 'respondShiftSwap', { swapId: swap.$id, accept: true }), 'un estraneo prende il turno', [400, 403, 404]);
    const pending = await api('collega', 'listMySwaps');
    ok(pending.some((w) => w.$id === swap.$id || w.swap?.$id === swap.$id), 'richiesta di cambio non ricevuta');
    await api('collega', 'respondShiftSwap', { swapId: swap.$id, accept: true });
    const board = await api('struttura', 'getTeamBoard', { structureId: users.struttura.id });
    ok(board.shifts.some((s) => s.$id === created.shiftIds[0] && s.userId === users.collega.id), 'il turno non è passato al collega');
  });

  await step('Chat con allegato: solo mittente e destinatario', async () => {
    const fileId = await upload('candidata', 'chat_files', 'Brevetto.pdf', pdf('Brevetto prova'));
    const msg = await api('candidata', 'sendMessage', { receiverId: users.struttura.id, content: `Messaggio di prova ${RUN}`, attachments: [fileId] });
    created.messageIds.push(msg.$id);
    const seen = await readDoc('struttura', 'messages', msg.$id);
    ok(seen.content.includes(RUN), 'il destinatario non legge il messaggio');
    await readFile('struttura', 'chat_files', fileId);
    await denied(readDoc('esterno', 'messages', msg.$id), 'un estraneo legge il messaggio');
    await denied(readFile('esterno', 'chat_files', fileId), 'un estraneo scarica l’allegato');
    const reply = await api('struttura', 'sendMessage', { receiverId: users.candidata.id, content: 'Ricevuto, grazie!' });
    created.messageIds.push(reply.$id);
  });

  await step('Notifiche arrivate a chi doveva riceverle', async () => {
    const { data } = await rest('GET', `/databases/${DB}/collections/notifications/documents?queries[]=${encodeURIComponent(JSON.stringify({ method: 'equal', attribute: 'userId', values: [users.candidata.id] }))}&queries[]=${encodeURIComponent(JSON.stringify({ method: 'limit', values: [50] }))}`, { jwt: users.candidata.jwt });
    const types = new Set((data.documents || []).map((n) => n.type));
    for (const t of ['application_update', 'hired', 'shift']) ok(types.has(t), `manca la notifica "${t}" (arrivate: ${[...types].join(', ') || 'nessuna'})`);
  });
}

// ---------------------------------------------------------------------------
// Pulizia: sempre, anche se un passo è fallito
// ---------------------------------------------------------------------------
async function cleanup() {
  const notes = [];
  for (const role of ['collega', 'candidata', 'esterno', 'struttura']) {
    const u = users[role];
    if (!u) continue;
    try {
      await refreshJwt(role);
      await api(role, 'deleteAccount', { confirmation: 'ELIMINA' });
      u.deleted = true;
    } catch (e) {
      notes.push(`account ${role}: ${e.message}`);
    }
  }
  if (KEY) {
    const ids = Object.values(users).map((u) => u.id);
    const sweep = [
      ['applications', 'applicantId'], ['shifts', 'userId'], ['shifts', 'structureId'], ['shift_swaps', 'structureId'],
      ['staff_invites', 'structureId'], ['messages', 'senderId'], ['messages', 'receiverId'], ['notifications', 'userId'],
      ['signals', 'userId'], ['client_errors', 'userId'], ['typing', 'userId'], ['shift_templates', 'structureId'], ['staff_chat_reads', 'userId'], ['jobs', 'structureId'], ['private_info', '$id'], ['profiles', '$id'],
    ];
    if (created.jobId) sweep.push(['application_reviews', 'jobId', [created.jobId]]);
    let removed = 0;
    for (const [table, field, values = ids] of sweep) {
      try {
        const q = [encodeURIComponent(JSON.stringify({ method: 'equal', attribute: field, values })), encodeURIComponent(JSON.stringify({ method: 'limit', values: [100] }))];
        // API TablesDB con la chiave (scope rows.*): le letture come utente restano sull'API dell'app.
        const { data } = await rest('GET', `/tablesdb/${DB}/tables/${table}/rows?queries[]=${q[0]}&queries[]=${q[1]}`, { key: KEY });
        for (const d of data.rows || []) {
          await rest('DELETE', `/tablesdb/${DB}/tables/${table}/rows/${d.$id}`, { key: KEY }).catch(() => null);
          removed++;
        }
      } catch (e) {
        if (e.status !== 404) notes.push(`pulizia ${table}: ${e.message}`);
      }
    }
    for (const f of created.files) await rest('DELETE', `/storage/buckets/${f.bucket}/files/${f.id}`, { key: KEY }).catch(() => null);
    for (const u of Object.values(users)) if (!u.deleted) await rest('DELETE', `/users/${u.id}`, { key: KEY }).then(() => { u.deleted = true; }).catch((e) => notes.push(`utente ${u.email}: ${e.message}`));
    if (removed) notes.push(`righe rimaste dopo l’eliminazione degli account e ripulite: ${removed} (deleteAccount dovrebbe toglierle)`);
  }
  // Verifica: gli account eliminati non entrano più.
  for (const [role, u] of Object.entries(users)) {
    if (!u.deleted) continue;
    try {
      await rest('POST', '/account/sessions/email', { body: { email: u.email, password: PASSWORD } });
      notes.push(`l’account ${role} entra ancora dopo l’eliminazione`);
    } catch (e) {
      if (e.status !== 401) notes.push(`verifica eliminazione ${role}: ${e.status}`);
    }
  }
  return notes;
}

function writeReport(notes, fatal) {
  const failed = results.filter((r) => !r.ok);
  const lines = [
    '# Prova completa su Appwrite reale',
    '',
    `Esecuzione \`${RUN}\` su ${new URL(ENDPOINT).host} (progetto …${PROJECT.slice(-4)}). Passi: ${results.length}, falliti: ${failed.length}.`,
    '',
    '| Passo | Esito |',
    '|---|---|',
    ...results.map((r) => `| ${r.name} | ${r.ok ? `ok (${r.ms} ms)` : `**fallito**: ${String(r.error).replace(/\|/g, '\\|')}`} |`),
    '',
    '## Pulizia',
    '',
    ...(notes.length ? notes.map((n) => `- ${n}`) : ['- Account eliminati, nessun dato rimasto.']),
  ];
  if (fatal) lines.push('', `Errore: ${fatal}`);
  const md = lines.join('\n') + '\n';
  writeFileSync(REPORT, md);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, md, { flag: 'a' });
}

let fatal = null;
try {
  await flows();
} catch (e) {
  fatal = e.message;
}
const notes = await cleanup().catch((e) => [`pulizia interrotta: ${e.message}`]);
writeReport(notes, fatal && !results.some((r) => !r.ok) ? fatal : null);
const problems = results.some((r) => !r.ok) || notes.some((n) => /entra ancora|interrotta/.test(n));
console.log(problems ? '\nProva reale: ci sono problemi (vedi il rapporto).' : '\nProva reale: tutto ok.');
process.exit(problems ? 1 : 0);
