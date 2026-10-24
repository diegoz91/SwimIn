/**
 * Filtro automatico dei testi pubblici (post, commenti, gruppi, eventi, referenze):
 * blocca insulti e discriminazioni gravi e lo spam evidente (troppi link, testo ripetuto,
 * maiuscolo urlato). Le parolacce generiche non vengono bloccate: è un social professionale,
 * ma tra adulti; i casi dubbi passano dalla segnalazione e dal pannello admin.
 */

// Radici di insulti e discriminazioni (dopo normalizzazione: minuscole, senza accenti, 0→o, 1→i, 3→e, 4→a, 5→s, @→a, $→s).
const BLOCKED = [
  // Le voci con lo spazio finale valgono solo come parola intera ("ritardato" nel senso di "in ritardo" passa).
  'vaffanculo', 'fanculo', 'stronzo ', 'stronza ', 'stronzi ', 'stronze ', 'coglione ', 'cogliona ', 'coglioni ',
  'bastardo ', 'bastarda ', 'bastardi ', 'bastarde ', 'puttan', 'zoccol', 'mignott',
  'frocio', 'froci ', 'ricchion', 'negro ', 'negri ', 'negra ', 'negre ', 'terrone ', 'terroni ', 'terrona ',
  'zingaro ', 'zingari ', 'zingara ', 'zingare ', 'ritardato mentale', 'ritardata mentale', 'sei un ritardato', 'sei una ritardata',
  'mongoloid', 'handicappat', 'ti ammazzo', 'ti uccido', 'devi morire',
  'pezzo di merda', 'testa di cazzo', 'faccia di merda', 'leccaculo',
];
// Parole che contengono una radice bloccata ma sono innocue.
const ALLOWED = ['zingarella'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
export const normalizeText = (text) =>
  String(text || '')
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[013457@$]/g, (c) => LEET[c] || c)
    .replace(/(.)\1{2,}/g, '$1') // "stronzooooo" → "stronzo"
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const MAX_LINKS = { post: 5, comment: 3, message: 8, text: 3 };

/** Motivo per cui il testo va bloccato, o null se è pubblicabile. */
export function textProblem(text, kind = 'text') {
  const raw = String(text || '');
  if (!raw.trim()) return null;
  let norm = ` ${normalizeText(raw)} `;
  for (const ok of ALLOWED) norm = norm.split(ok).join(' ');
  // Radici controllate a inizio parola, per non colpire parole come "abbastardito" o "tronzo".
  if (BLOCKED.some((w) => norm.includes(` ${w}`))) return 'Il testo contiene insulti o parole offensive: modificalo prima di pubblicare.';
  const links = (raw.match(/https?:\/\/|www\./gi) || []).length;
  if (links > (MAX_LINKS[kind] ?? 3)) return 'Troppi link nello stesso testo: lasciane al massimo qualcuno.';
  const letters = raw.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length >= 40 && letters.replace(/[^A-ZÀ-Þ]/g, '').length / letters.length > 0.8) return 'Scrivi senza tutto maiuscolo: sembra che urli.';
  if (/(.{3,}?)\1{6,}/s.test(raw.replace(/\s+/g, ' '))) return 'Il testo sembra ripetuto più volte: controllalo prima di pubblicare.';
  return null;
}

export const makeAssertClean = (fail) => (text, kind) => {
  const problem = textProblem(text, kind);
  if (problem) fail(400, problem, 'text_blocked');
};
