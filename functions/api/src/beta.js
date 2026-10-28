/**
 * Fase di test chiusa: iscrizione solo con un codice di invito (QR o link /register?invito=CODICE)
 * e accettazione delle condizioni della fase di test, registrata nei dati privati.
 *
 * - `inviteOnly` sulla riga `main` di `app_status` (leggibile da tutti, così l'app sa se chiedere il
 *   codice); se manca vale acceso. Lo cambiano gli amministratori (Admin › Fase di test).
 * - Tabella `beta_invites` senza permessi per i client: codice, a chi è destinato, usi massimi, usi,
 *   scadenza, attivo. Gli account della prova automatica non hanno bisogno del codice.
 */
import { APP_STATUS_ROW } from './ops.js';

// Niente lettere e cifre che si confondono (0/O, 1/I/L): il codice si può anche dettare.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const normalizeCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

export function betaActions({ find, get, list, create, update, fail, C, Query, isAdmin, isTestAccount, randomBytes, savePrivate }) {
  const requireAdmin = async (me) => {
    if (!(await isAdmin(me))) fail(403, 'Area riservata agli amministratori.');
  };
  const newCode = () => [...randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join('');

  const inviteOnly = async () => (await find(C.appStatus, APP_STATUS_ROW).catch(() => null))?.inviteOnly !== false;

  const findInvite = async (code) => {
    const c = normalizeCode(code);
    if (c.length < 6) return null;
    const { documents } = await list(C.betaInvites, [Query.equal('code', c), Query.limit(1)]);
    return documents[0] || null;
  };
  const usable = (inv) => !!inv && inv.active !== false && (inv.uses || 0) < (inv.maxUses || 0) && (!inv.expiresAt || inv.expiresAt >= new Date().toISOString().slice(0, 10));

  const out = (inv) => ({
    $id: inv.$id, code: inv.code, label: inv.label || '', maxUses: inv.maxUses, uses: inv.uses || 0,
    expiresAt: inv.expiresAt || '', active: inv.active !== false, createdAt: inv.$createdAt,
  });

  return {
    /** Pubblica: il codice è valido? (nessun altro dato sull'invito). */
    async checkInvite(_me, { code } = {}) {
      return { valid: usable(await findInvite(code)), inviteOnly: await inviteOnly() };
    },

    /**
     * Prima di creare un profilo: con l'iscrizione su invito serve un codice valido. Restituisce
     * l'invito da consumare dopo la creazione (null se non serve).
     */
    async _checkSignup(me, { inviteCode, betaAccepted } = {}) {
      if (betaAccepted !== true) fail(400, 'Per iscriverti devi accettare le condizioni della fase di test.');
      if (!(await inviteOnly())) return null;
      if (await isTestAccount(me)) return null;
      const inv = await findInvite(inviteCode);
      if (!usable(inv)) fail(403, 'Durante la fase di test ci si iscrive solo con un invito valido. Usa il QR o il link che hai ricevuto.', 'invite_required');
      return inv;
    },

    /** Dopo la creazione del profilo: un uso in meno e il codice nei dati privati (mai sul profilo). */
    async _afterSignup(me, inv, { betaVersion } = {}) {
      await savePrivate(me, {
        betaAcceptedAt: new Date().toISOString(),
        betaVersion: String(betaVersion || '').slice(0, 40) || null,
        ...(inv ? { inviteCode: inv.code } : {}),
      });
      if (inv) await update(C.betaInvites, inv.$id, { uses: (inv.uses || 0) + 1 });
    },

    /** Chi aveva già un account accetta le condizioni della fase di test: resta la data. */
    async acceptBeta(me, { version = '' } = {}) {
      await savePrivate(me, { betaAcceptedAt: new Date().toISOString(), betaVersion: String(version).slice(0, 40) || null });
      return { ok: true };
    },

    async adminListInvites(me) {
      await requireAdmin(me);
      const { documents } = await list(C.betaInvites, [Query.orderDesc('$createdAt'), Query.limit(200)]);
      return { inviteOnly: await inviteOnly(), invites: documents.map(out) };
    },

    async adminCreateInvite(me, { label = '', maxUses = 10, expiresAt = '' } = {}) {
      await requireAdmin(me);
      const max = Math.floor(Number(maxUses));
      if (!(max >= 1 && max <= 1000)) fail(400, 'Usi massimi tra 1 e 1000.');
      if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) fail(400, 'Data di scadenza non valida.');
      let code = newCode();
      for (let i = 0; i < 5 && (await findInvite(code)); i++) code = newCode();
      const inv = await create(C.betaInvites, { code, label: String(label).trim().slice(0, 120), maxUses: max, uses: 0, expiresAt: expiresAt || null, active: true, createdBy: me }, []);
      return out(inv);
    },

    async adminSetInviteActive(me, { inviteId, active } = {}) {
      await requireAdmin(me);
      await get(C.betaInvites, inviteId);
      return out(await update(C.betaInvites, inviteId, { active: !!active }));
    },

    /** Iscrizione solo su invito (fase di test) oppure aperta a tutti. */
    async adminSetInviteOnly(me, { enabled } = {}) {
      await requireAdmin(me);
      const data = { inviteOnly: !!enabled, updatedBy: me };
      if (await find(C.appStatus, APP_STATUS_ROW)) await update(C.appStatus, APP_STATUS_ROW, data);
      else await create(C.appStatus, { mode: 'ok', message: '', until: '', ...data }, [], APP_STATUS_ROW);
      return { inviteOnly: !!enabled };
    },
  };
}
