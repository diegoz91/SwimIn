/** Orari di apertura delle strutture: validazione e salvataggio sul profilo. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validators } from '../src/profile.js';

test('orari di apertura', () => {
  const ok = validators.openingHours(['07:00-22:00', 'Chiuso', '', '07:00-13:00, 15:00-22:00', '06:30-24:00', '', 'chiuso']);
  assert.deepEqual(ok, [['07:00-22:00', 'chiuso', '', '07:00-13:00,15:00-22:00', '06:30-24:00', '', 'chiuso'], null]);
  assert.deepEqual(validators.openingHours([]), [[], null]);
  assert.equal(validators.openingHours(['07:00-22:00'])[0], null); // servono 7 giorni
  assert.equal(validators.openingHours(['22:00-07:00', '', '', '', '', '', ''])[0], null); // fine prima dell'inizio
  assert.equal(validators.openingHours(['07:00-13:00,12:00-20:00', '', '', '', '', '', ''])[0], null); // sovrapposte
  assert.equal(validators.openingHours(['7-13', '', '', '', '', '', ''])[0], null);
  assert.equal(validators.openingHours(['07:00-09:00,10:00-11:00,12:00-13:00', '', '', '', '', '', ''])[0], null); // massimo due fasce
});
