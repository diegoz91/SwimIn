/**
 * Conservazione su ordine dell'autorità (preservation order, art. 8 reg. UE 2023/1543 "e-Evidence").
 *
 * Il responsabile (etichette `admin` + `legal`) registra l'ordine ricevuto (autorità, protocollo,
 * data) su una persona o su una conversazione. La Function fa subito una COPIA SIGILLATA dei dati
 * esistenti in quel momento (account e accessi, profilo, dati privati, messaggi, post, commenti,
 * candidature) cifrata con la chiave pubblica della società: nessuno la può leggere dal sistema.
 * Se poi l'utente cancella messaggi o l'account, la copia resta fino alla scadenza.
 * Esportazione = file cifrato con le impronte SHA-256 di ogni parte; si decifra solo fuori linea
 * con la chiave privata (scripts/legal/decrypt.mjs). Alla scadenza o al rilascio le copie si
 * cancellano (pulizia notturna). Ogni azione finisce nel registro degli accessi (audit.js).
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;
export const HOLD_DAYS = [30, 60, 90, 180, 365];
const CHUNK = 50;
const EXPORT_PAGE = 20;

export function legalActions({ find, get, create, update, list, listAll, removeAll, fail, C, Query, users, isLegal, sealer, conversationIdFor, isoDay }) {
  const requireLegal = async (me) => {
    if (!(await isLegal(me))) fail(403, 'Area riservata al responsabile delle richieste delle autorità.');
  };
  const requireSealer = () => {
    if (!sealer) fail(503, 'Chiave di conservazione non configurata: imposta ESCROW_PUBLIC_KEY (vedi docs/SETUP-APPWRITE.md §14).');
  };
  const reasonOf = (r) => {
    const text = String(r || '').trim();
    if (text.length < 5) fail(400, 'Indica il motivo (es. "Consegna all\'autorità, prot. 123/2026").');
    return text.slice(0, 500);
  };

  /** Toglie i campi interni di Appwrite che non servono all'autorità (permessi, id del database). */
  const clean = (row) => {
    if (!row) return row;
    const { $permissions, $databaseId, $tableId, $collectionId, $sequence, ...rest } = row;
    return rest;
  };

  /** Raccoglie i dati esistenti oggi per l'oggetto dell'ordine, a pezzi da sigillare. */
  const collect = async (hold) => {
    const parts = [];
    const push = (kind, sourceId, data) => parts.push({ kind, sourceId, data });
    const pushChunks = (kind, rows) => {
      for (let i = 0; i < rows.length; i += CHUNK) push(kind, `${kind}:${i / CHUNK + 1}`, rows.slice(i, i + CHUNK).map(clean));
    };
    if (hold.subjectType === 'user') {
      const id = hold.subjectId;
      if (users) {
        const account = await users.get({ userId: id }).catch(() => null);
        if (account) {
          push('account', id, {
            id: account.$id, name: account.name, email: account.email, phone: account.phone || '',
            registration: account.registration || account.$createdAt, status: account.status,
            emailVerification: account.emailVerification, mfa: account.mfa, labels: account.labels,
            accessedAt: account.accessedAt || '',
          });
          // Dati di traffico disponibili presso il fornitore: accessi e sessioni (IP, paese, dispositivo).
          const logs = users.listLogs ? await users.listLogs({ userId: id, queries: [Query.limit(100)] }).catch(() => null) : null;
          if (logs?.logs?.length) push('accessi', id, logs.logs.map((l) => ({ event: l.event, ip: l.ip, time: l.time, countryName: l.countryName, clientName: l.clientName, osName: l.osName, deviceName: l.deviceName })));
          const sessions = users.listSessions ? await users.listSessions({ userId: id }).catch(() => null) : null;
          if (sessions?.sessions?.length) push('sessioni', id, sessions.sessions.map((s) => ({ createdAt: s.$createdAt, ip: s.ip, countryName: s.countryName, clientName: s.clientName, osName: s.osName, provider: s.provider })));
        }
      }
      const profile = await find(C.profiles, id);
      if (profile) push('profilo', id, clean(profile));
      const priv = await find(C.privateInfo, id);
      if (priv) push('dati_privati', id, clean(priv));
      const sent = await listAll(C.messages, [Query.equal('senderId', id)]);
      const received = await listAll(C.messages, [Query.equal('receiverId', id)]);
      pushChunks('messaggi', [...sent, ...received].sort((a, b) => String(a.$createdAt).localeCompare(String(b.$createdAt))));
      pushChunks('post', await listAll(C.posts, [Query.equal('authorId', id)]));
      pushChunks('commenti', await listAll(C.comments, [Query.equal('authorId', id)]));
      pushChunks('candidature', await listAll(C.applications, [Query.equal('applicantId', id)]));
    } else {
      pushChunks('messaggi', (await listAll(C.messages, [Query.equal('conversationId', hold.subjectId)])).sort((a, b) => String(a.$createdAt).localeCompare(String(b.$createdAt))));
    }
    return parts;
  };

  const sealAll = async (hold, at) => {
    let n = 0;
    for (const p of await collect(hold)) {
      const { sealed, hash } = sealer.seal({ hold: hold.$id, reference: hold.reference, collectedAt: at, kind: p.kind, sourceId: p.sourceId, data: p.data });
      await create(C.heldItems, { holdId: hold.$id, kind: p.kind, sourceId: String(p.sourceId).slice(0, 80), sealed, hash, collectedAt: at }, []);
      n++;
    }
    return n;
  };

  const activeHoldsFor = async ({ userIds = [], conversationId = '' } = {}) => {
    const today = isoDay(Date.now());
    const rows = await listAll(C.legalHolds, [Query.equal('status', 'active')]);
    return rows.filter((h) => h.until >= today && ((h.subjectType === 'user' && userIds.includes(h.subjectId)) || (h.subjectType === 'conversation' && h.subjectId === conversationId)));
  };

  const holdOut = async (h) => ({ ...clean(h), items: (await list(C.heldItems, [Query.equal('holdId', h.$id), Query.limit(1)])).total });

  return {
    /** Oggetti sotto conservazione attiva (persona o conversazione): le eliminazioni sigillano una copia. */
    _activeHoldsFor: activeHoldsFor,

    /** Prima di eliminare un account sotto conservazione: copia sigillata completa dei dati di oggi. */
    async _snapshotUser(userId) {
      if (!sealer) return 0;
      const holds = await activeHoldsFor({ userIds: [userId] });
      let n = 0;
      for (const h of holds) n += await sealAll(h, new Date().toISOString());
      return n;
    },

    /** Prima di un'eliminazione chiesta dall'utente: se l'oggetto è sotto conservazione, ne resta una copia sigillata. */
    async _sealBeforeDelete(kind, row, holds) {
      if (!sealer || !holds?.length) return 0;
      const at = new Date().toISOString();
      for (const h of holds) {
        const { sealed, hash } = sealer.seal({ hold: h.$id, reference: h.reference, collectedAt: at, kind: `${kind}_eliminato`, sourceId: row.$id, data: clean(row) });
        await create(C.heldItems, { holdId: h.$id, kind: `${kind}_eliminato`, sourceId: row.$id, sealed, hash, collectedAt: at }, []);
      }
      return holds.length;
    },

    async legalCreateHold(me, { subjectType, userId = '', otherUserId = '', authority = '', reference = '', orderDate = '', days = 90, reason = '' } = {}) {
      await requireLegal(me);
      requireSealer();
      if (!['user', 'conversation'].includes(subjectType)) fail(400, 'Scegli se conservare i dati di una persona o una conversazione.');
      if (typeof userId !== 'string' || !userId) fail(400, 'Indica la persona.');
      const auth = String(authority || '').trim().slice(0, 200);
      const ref = String(reference || '').trim().slice(0, 100);
      if (auth.length < 3) fail(400, 'Indica l\'autorità che ha emesso l\'ordine.');
      if (ref.length < 2) fail(400, 'Indica il numero di protocollo o il riferimento dell\'ordine.');
      if (!ISO_DATE.test(orderDate || '') || orderDate > isoDay(Date.now())) fail(400, 'Data dell\'ordine non valida.');
      if (!HOLD_DAYS.includes(Number(days))) fail(400, 'Durata non valida.');
      let subjectId = userId;
      if (subjectType === 'conversation') {
        if (typeof otherUserId !== 'string' || !otherUserId || otherUserId === userId) fail(400, 'Indica le due persone della conversazione.');
        subjectId = conversationIdFor(userId, otherUserId);
      } else if (users && !(await users.get({ userId }).catch(() => null))) fail(404, 'Account non trovato.');
      const at = new Date().toISOString();
      const hold = await create(C.legalHolds, {
        subjectType, subjectId, authority: auth, reference: ref, orderDate,
        until: isoDay(Date.now() + Number(days) * DAY), status: 'active', createdBy: me, note: reasonOf(reason),
      }, []);
      const items = await sealAll(hold, at);
      return { ...(await holdOut(hold)), items };
    },

    async legalListHolds(me) {
      await requireLegal(me);
      const { documents } = await list(C.legalHolds, [Query.orderDesc('$createdAt'), Query.limit(100)]);
      return Promise.all(documents.map(holdOut));
    },

    /** Proroga (es. +30 giorni come prevede l'e-Evidence) ed eventualmente nuova copia dei dati di oggi. */
    async legalExtendHold(me, { holdId, days = 30, refresh = false, reason = '' } = {}) {
      await requireLegal(me);
      reasonOf(reason);
      if (!HOLD_DAYS.includes(Number(days))) fail(400, 'Durata non valida.');
      const hold = await get(C.legalHolds, holdId);
      if (hold.status !== 'active') fail(409, 'La conservazione non è più attiva.');
      const base = Math.max(Date.parse(`${hold.until}T12:00:00Z`), Date.now());
      const updated = await update(C.legalHolds, holdId, { until: isoDay(base + Number(days) * DAY) });
      let items = 0;
      if (refresh) {
        requireSealer();
        items = await sealAll(updated, new Date().toISOString());
      }
      return { ...(await holdOut(updated)), added: items };
    },

    /** Fine della conservazione: le copie sigillate si cancellano subito. */
    async legalReleaseHold(me, { holdId, reason = '' } = {}) {
      await requireLegal(me);
      reasonOf(reason);
      const hold = await get(C.legalHolds, holdId);
      const removed = await removeAll(C.heldItems, [Query.equal('holdId', holdId)]);
      await update(C.legalHolds, holdId, { status: 'released', releasedBy: me, releasedAt: new Date().toISOString() });
      return { released: true, removed, reference: hold.reference };
    },

    /**
     * Pacchetto cifrato da consegnare: manifesto con le impronte e le copie sigillate (illeggibili
     * senza la chiave privata). A pagine (`offset`) per non superare il limite di una risposta:
     * il client chiede le pagine finché `nextOffset` è null e salva un unico file.
     */
    async legalExportHold(me, { holdId, reason = '', offset = 0 } = {}) {
      await requireLegal(me);
      const why = reasonOf(reason);
      const hold = await get(C.legalHolds, holdId);
      const items = (await listAll(C.heldItems, [Query.equal('holdId', holdId)])).sort((a, b) => String(a.collectedAt).localeCompare(String(b.collectedAt)) || a.$id.localeCompare(b.$id));
      if (!items.length) fail(404, 'Nessuna copia da esportare.');
      const from = Math.max(0, Number(offset) || 0);
      const page = items.slice(from, from + EXPORT_PAGE);
      return {
        manifest: {
          format: 'swimin-conservazione-v1',
          alg: 'RSA-OAEP-256+A256GCM',
          hold: { id: hold.$id, subjectType: hold.subjectType, subjectId: hold.subjectId, authority: hold.authority, reference: hold.reference, orderDate: hold.orderDate, until: hold.until, createdAt: hold.$createdAt },
          exportedAt: new Date().toISOString(),
          exportedBy: me,
          reason: why,
          items: items.map((i) => ({ id: i.$id, kind: i.kind, sourceId: i.sourceId, collectedAt: i.collectedAt, sha256: i.hash })),
        },
        items: page.map((i) => ({ id: i.$id, sealed: i.sealed })),
        nextOffset: from + EXPORT_PAGE < items.length ? from + EXPORT_PAGE : null,
      };
    },

    /** Pulizia notturna: conservazioni scadute → copie cancellate (limitazione della conservazione). */
    async _expireHolds({ now = Date.now() } = {}) {
      const today = isoDay(now);
      let n = 0;
      for (const h of await listAll(C.legalHolds, [Query.equal('status', 'active')])) {
        if (h.until >= today) continue;
        n += await removeAll(C.heldItems, [Query.equal('holdId', h.$id)]);
        await update(C.legalHolds, h.$id, { status: 'expired' });
      }
      return n;
    },
  };
}
