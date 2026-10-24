/** Test del filtro automatico dei testi pubblici (insulti e spam evidente). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textProblem, normalizeText, makeAssertClean } from '../src/textfilter.js';

test('normalizzazione', () => {
  assert.equal(normalizeText('  StR0nZ0ooo!! '), 'stronzo');
  assert.equal(normalizeText('Perché è così'), 'perche e cosi');
});

test('blocca insulti, anche camuffati', () => {
  for (const t of ['Sei uno stronzo', 'vaffanculo a tutti', 'sei un c0gl10ne davvero', 'STRONZOOOO', 'ti ammazzo', 'sei un ritardato']) {
    assert.ok(textProblem(t, 'comment'), t);
  }
});

test('lascia passare testi innocui', () => {
  for (const t of [
    'Che stronzata di traffico stamattina',
    'Il treno è ritardato di 20 minuti',
    'Gara regionale a Troia, provincia di Foggia',
    'Il figlio di Marco ha vinto i 100 stile libero',
    'Cerchiamo un assistente bagnanti per la stagione estiva a Rimini.',
    'La zingarella è una canzone popolare',
    'NUOVO CORSO',
    '',
  ]) {
    assert.equal(textProblem(t, 'post'), null, t);
  }
});

test('spam evidente', () => {
  assert.ok(textProblem('a https://a.it b https://b.it c https://c.it d https://d.it', 'comment'));
  assert.equal(textProblem('a https://a.it b https://b.it', 'comment'), null);
  assert.ok(textProblem('QUESTO È UN ANNUNCIO URGENTISSIMO PER TUTTI I NUOTATORI DELLA ZONA', 'post'));
  assert.ok(textProblem('compra ora '.repeat(10), 'post'));
});

test('makeAssertClean lancia un errore 400 con codice', () => {
  const fail = (status, message, code) => { const e = new Error(message); e.status = status; e.code = code; throw e; };
  const assertClean = makeAssertClean(fail);
  assert.doesNotThrow(() => assertClean('Buongiorno a tutti', 'post'));
  assert.throws(() => assertClean('vaffanculo', 'post'), (e) => e.status === 400 && e.code === 'text_blocked');
});
