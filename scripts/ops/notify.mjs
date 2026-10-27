#!/usr/bin/env node
/**
 * Avvisi di GitHub senza servizi esterni: un commento su una issue = una sola email a chi è iscritto.
 *
 *   node scripts/ops/notify.mjs release <file.md>      commento nella issue "Rilasci di SwimIn"
 *   node scripts/ops/notify.mjs incident open <file.md> apre (una volta sola) "Servizio con problemi"
 *   node scripts/ops/notify.mjs incident close          la chiude con un commento, se aperta
 *
 * Variabili: GITHUB_TOKEN, GITHUB_REPOSITORY, NOTIFY_USERS (login separati da virgola, facoltativo;
 * vengono menzionati alla creazione della issue così ricevono le email dei commenti).
 * Nessuna dipendenza: solo fetch.
 */
import { readFileSync } from 'node:fs';

const [kind, arg1, arg2] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
if (!token || !repo) {
  console.error('GITHUB_TOKEN e GITHUB_REPOSITORY sono obbligatori.');
  process.exit(2);
}
const users = String(process.env.NOTIFY_USERS || '').split(',').map((u) => u.trim().replace(/^@/, '')).filter(Boolean);
const mention = users.map((u) => `@${u}`).join(' ');

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
};

const LABELS = { release: { name: 'rilasci', color: '0E6A97', description: 'Riepilogo di ogni rilascio' }, incident: { name: 'servizio', color: 'E23D3D', description: 'Problemi del servizio in produzione' } };

const ensureLabel = async (l) => {
  await api('/labels', { method: 'POST', body: JSON.stringify(l) }).catch(() => null); // esiste già
};

/** Issue aperta con l'etichetta, oppure null. */
const findIssue = async (label) => {
  const list = await api(`/issues?state=open&labels=${encodeURIComponent(label)}&per_page=5`);
  return list.find((i) => !i.pull_request) || null;
};

const body = (file) => readFileSync(file, 'utf8');

if (kind === 'release') {
  await ensureLabel(LABELS.release);
  let issue = await findIssue(LABELS.release.name);
  if (!issue) {
    issue = await api('/issues', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Rilasci di SwimIn',
        labels: [LABELS.release.name],
        body: `Qui arriva il riepilogo di ogni rilascio (verifica, deploy di Appwrite e Vercel, prova reale): un commento = una email.\n\nNon chiudere questa issue. ${mention}`.trim(),
      }),
    });
  }
  await api(`/issues/${issue.number}/comments`, { method: 'POST', body: JSON.stringify({ body: body(arg1) }) });
  console.log(`Riepilogo pubblicato in #${issue.number}`);
} else if (kind === 'incident' && arg1 === 'open') {
  await ensureLabel(LABELS.incident);
  const open = await findIssue(LABELS.incident.name);
  if (open) {
    console.log(`Problema già segnalato in #${open.number}: nessuna nuova email.`);
  } else {
    const issue = await api('/issues', {
      method: 'POST',
      body: JSON.stringify({ title: 'Servizio con problemi', labels: [LABELS.incident.name], body: `${body(arg2)}\n\n${mention}`.trim() }),
    });
    console.log(`Aperta #${issue.number}`);
  }
} else if (kind === 'incident' && arg1 === 'close') {
  const open = await findIssue(LABELS.incident.name);
  if (open) {
    await api(`/issues/${open.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `Tutto di nuovo regolare (${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}).` }) });
    await api(`/issues/${open.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
    console.log(`Chiusa #${open.number}`);
  } else {
    console.log('Nessun problema aperto.');
  }
} else {
  console.error('Uso: notify.mjs release <file> | incident open <file> | incident close');
  process.exit(2);
}
