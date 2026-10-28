/**
 * Affidabilità: registro degli errori (app e server) con avvisi agli amministratori,
 * e stato del servizio (tutto ok, rallentamenti, manutenzione) deciso dal pannello admin.
 *
 * - Gli errori finiscono in `client_errors` (nome storico: ora contiene anche quelli della
 *   Function, con `source: 'server'`). Errori uguali hanno la stessa impronta (`fingerprint`):
 *   l'avviso parte una sola volta l'ora per impronta, anche se l'errore si ripete mille volte.
 * - Gli avvisi arrivano agli utenti con l'etichetta `admin` (notifica `system_alert`, quindi
 *   anche push ed email secondo le loro preferenze) e, se impostato, a un webhook
 *   (`ALERT_WEBHOOK_URL`: Slack, Discord o un bot Telegram compatibile).
 * - Lo stato del servizio è la riga `main` di `app_status`, leggibile da tutti (anche ospiti)
 *   e scritta solo da qui: il sito mostra la pagina di manutenzione o un avviso.
 */
export const APP_STATUS_ROW = 'main';
export const STATUS_MODES = ['ok', 'degraded', 'maintenance'];
const ALERT_EVERY_MS = 60 * 60_000;
const TEST_EMAIL = /^swimin-e2e\+[a-z0-9-]+@example\.com$/i;

/**
 * Messaggio leggibile: le pagine d'errore HTML di proxy e CDN (es. "503 first byte timeout" di
 * Varnish davanti ad Appwrite) diventano il loro titolo, senza tutto il markup.
 */
export function readableMessage(message) {
  const text = String(message || '').trim();
  if (!/<html|<!doctype|<\?xml/i.test(text)) return text;
  const title = /<title>([^<]*)<\/title>/i.exec(text)?.[1]?.trim();
  const h1 = /<h1>([^<]*)<\/h1>/i.exec(text)?.[1]?.trim();
  return `Risposta HTML dal servizio: ${title || h1 || 'pagina d’errore'}`;
}

/** Impronta stabile di un errore: numeri, id e indirizzi diventano segnaposto. */
export function fingerprintOf(source, action, message) {
  const norm = String(message || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[0-9a-f]{12,}/g, '<id>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  const text = `${source}|${action || ''}|${norm}`;
  // FNV-1a a 32 bit: basta per raggruppare, non serve un hash crittografico.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${source.slice(0, 1)}${h.toString(16).padStart(8, '0')}`;
}

export function opsActions({ find, create, update, count, fail, C, Query, users, notify, isAdmin, log = () => {}, fetchImpl, alertWebhook = '', alertUserIds = [] }) {
  let admins = null;
  /** Amministratori da avvisare: etichetta `admin` (più eventuali id in ALERT_USER_IDS). */
  const adminIds = async () => {
    if (admins) return admins;
    const ids = new Set(alertUserIds.filter(Boolean));
    if (users?.list) {
      try {
        const { users: rows = [] } = await users.list({ queries: [Query.contains('labels', ['admin']), Query.limit(25)] });
        for (const u of rows) if ((u.labels || []).includes('admin')) ids.add(u.$id);
      } catch (e) {
        log(`elenco amministratori non disponibile: ${e?.message || e}`);
      }
    }
    admins = [...ids];
    return admins;
  };

  const sendAlert = async (text, type = 'system_alert') => {
    for (const id of await adminIds()) await notify(id, type, text, '').catch((e) => log(`avviso admin: ${e?.message || e}`));
    if (alertWebhook && fetchImpl) {
      await fetchImpl(alertWebhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // `text` per Slack e Telegram (via bot compatibili), `content` per Discord.
        body: JSON.stringify({ text: `SwimIn: ${text}`, content: `SwimIn: ${text}` }),
      }).catch((e) => log(`webhook avvisi: ${e?.message || e}`));
    }
  };

  /** Registra un errore e, se è il primo con questa impronta nell'ultima ora, avvisa. */
  const recordError = async ({ source = 'client', userId = 'system', action = '', message, stack = '', url = '', userAgent = '' }) => {
    const msg = readableMessage(message);
    if (!msg) return { ok: true };
    const fingerprint = fingerprintOf(source, action, msg);
    const since = new Date(Date.now() - ALERT_EVERY_MS).toISOString();
    const seen = await count(C.clientErrors, [Query.equal('fingerprint', fingerprint), Query.greaterThan('$createdAt', since)]).catch(() => 0);
    await create(C.clientErrors, {
      userId: String(userId || 'system').slice(0, 36),
      source,
      action: String(action || '').slice(0, 80),
      fingerprint,
      message: msg.slice(0, 500),
      stack: String(stack || '').slice(0, 4000),
      url: String(url || '').slice(0, 500),
      userAgent: String(userAgent || '').slice(0, 300),
    }, []);
    if (seen === 0) {
      const where = source === 'server' ? `nel server${action ? ` (${action})` : ''}` : `nell’app${url ? ` (${url})` : ''}`;
      await sendAlert(`errore ${where}: ${msg.slice(0, 160)}`);
      return { ok: true, alerted: true };
    }
    return { ok: true, alerted: false };
  };

  const statusOut = (row) => ({
    mode: STATUS_MODES.includes(row?.mode) ? row.mode : 'ok',
    message: row?.message || '',
    until: row?.until || '',
    inviteOnly: row?.inviteOnly !== false,
    updatedAt: row?.$updatedAt || row?.$createdAt || null,
  });

  return {
    _recordError: recordError,
    _sendAlert: sendAlert,

    /** Account creati dalla prova automatica su Appwrite reale (scripts/real): niente avvisi ad altri utenti. */
    async _isTestAccount(userId) {
      if (!users || !userId) return false;
      try {
        const u = await users.get({ userId });
        return TEST_EMAIL.test(u.email || '');
      } catch {
        return false;
      }
    },

    // ---------------- ERRORI DELL'APP ----------------
    async logClientError(me, { message, stack = '', url = '', userAgent = '' } = {}) {
      const since = new Date(Date.now() - 60_000).toISOString();
      const recent = await count(C.clientErrors, [Query.equal('userId', me), Query.greaterThan('$createdAt', since)]).catch(() => 0);
      if (recent >= 10) return { ok: true, throttled: true };
      return recordError({ source: 'client', userId: me, message, stack, url, userAgent });
    },

    // ---------------- STATO DEL SERVIZIO ----------------
    async _appStatus() {
      return statusOut(await find(C.appStatus, APP_STATUS_ROW).catch(() => null));
    },

    async adminSetAppStatus(me, { mode, message = '', until = '' } = {}) {
      if (!(await isAdmin(me))) fail(403, 'Area riservata agli amministratori.');
      if (!STATUS_MODES.includes(mode)) fail(400, 'Stato non valido.');
      const text = String(message || '').trim().slice(0, 500);
      if (mode !== 'ok' && text.length < 5) fail(400, 'Scrivi un messaggio per gli utenti.');
      const end = String(until || '').trim();
      if (end && Number.isNaN(Date.parse(end))) fail(400, 'Orario di fine non valido.');
      const data = { mode, message: mode === 'ok' ? '' : text, until: mode === 'ok' ? '' : end.slice(0, 30), updatedBy: me };
      const row = (await find(C.appStatus, APP_STATUS_ROW))
        ? await update(C.appStatus, APP_STATUS_ROW, data)
        : await create(C.appStatus, data, [], APP_STATUS_ROW);
      log(`stato del servizio: ${mode} (${me})`);
      return statusOut(row);
    },
  };
}
