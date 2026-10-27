#!/usr/bin/env node
/**
 * Testo del riepilogo di un rilascio (una tabella con l'esito di ogni fase), scritto su file e
 * nel riepilogo del run. Legge gli esiti dalle variabili d'ambiente impostate da rilascio.yml.
 *
 *   node scripts/ops/release-summary.mjs <file.md>
 */
import { writeFileSync } from 'node:fs';

const e = process.env;
const ICON = { success: '✅', failure: '❌', cancelled: '⏹️', skipped: '➖' };
const label = (r) => ({ success: 'riuscito', failure: 'non riuscito', cancelled: 'annullato', skipped: 'saltato' })[r] || r || 'sconosciuto';
const row = (fase, result, note = '') => `| ${ICON[result] || '❔'} ${fase} | ${label(result)} | ${note} |`;

const results = [e.VERIFICA, e.APPWRITE, e.VERCEL, e.PROVA];
const failed = results.includes('failure') || results.includes('cancelled');
const run = `${e.GITHUB_SERVER_URL}/${e.GITHUB_REPOSITORY}/actions/runs/${e.GITHUB_RUN_ID}`;
const commit = `${e.GITHUB_SERVER_URL}/${e.GITHUB_REPOSITORY}/commit/${e.GITHUB_SHA}`;
const title = (e.COMMIT_TITLE || '').split('\n')[0];
const when = new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'medium', timeStyle: 'short' });

const md = `## ${failed ? '❌ Rilascio non riuscito' : '✅ Rilascio riuscito'}

**${title || 'Rilascio manuale'}** · [${(e.GITHUB_SHA || '').slice(0, 7)}](${commit}) · ${when}

| Fase | Esito | Note |
|---|---|---|
${row('Build e test', e.VERIFICA, e.VERIFICA === 'success' ? 'build, tipi, test, schermate, accessibilità, end-to-end' : `[dettagli](${run})`)}
${row('Appwrite (database e Function)', e.APPWRITE, e.APPWRITE_NOTE || '')}
${row('Vercel (sito)', e.VERCEL, e.VERCEL_URL ? `[apri il sito](${e.VERCEL_URL})` : e.VERCEL_NOTE || '')}
${row('Prova reale', e.PROVA, e.PROVA === 'skipped' ? 'non eseguita' : '')}

[Dettagli del rilascio](${run})${e.NOTIFY_USERS ? `\n\n${e.NOTIFY_USERS.split(',').map((u) => `@${u.trim().replace(/^@/, '')}`).join(' ')}` : ''}
`;

writeFileSync(process.argv[2] || 'riepilogo.md', md);
if (e.GITHUB_STEP_SUMMARY) writeFileSync(e.GITHUB_STEP_SUMMARY, md, { flag: 'a' });
console.log(md);
