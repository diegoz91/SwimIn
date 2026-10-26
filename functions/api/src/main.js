/**
 * SwimWaveUp — Appwrite Function "api"
 *
 * Esegue lato server le operazioni che toccano dati di più utenti. I client
 * non hanno permessi di scrittura su questi documenti: passano da qui, e qui
 * verifichiamo chi sta chiamando (header x-appwrite-user-id, impostato da
 * Appwrite e non falsificabile dal browser) e se ne ha diritto.
 *
 * Richiesta: POST con body JSON { "action": "<nome>", ...parametri }
 * Risposta:  { ok: true, data } oppure { ok: false, error } con status HTTP 4xx/5xx
 */
import { Client, ID, Messaging, Permission, Query, Role, Storage, TablesDB, Users } from 'node-appwrite';
import { profileActions } from './profile.js';
import { reviewActions } from './reviews.js';
import { moderationActions } from './moderation.js';
import { certificateActions, CERT_BUCKET } from './certificates.js';
import { teamActions } from './team.js';
import { socialActions } from './social.js';
import { contentActions, extractHashtags, extractMentions, cleanPoll } from './content.js';
import { groupActions } from './groups.js';
import { chatActions } from './chat.js';
import { eventActions } from './events.js';
import { alertActions } from './alerts.js';
import { recommendationActions } from './recommendations.js';
import { billingActions, isPremium, audienceOf, INMAIL_CREDITS, BASE_ACTIVE_JOBS, BASE_STAFF, PLAN_KEYS } from './billing.js';
import { regionProvinces } from './regions.js';
import { publicActions, PUBLIC_ACTIONS } from './public.js';
import { pushActions } from './push.js';
import { makeAssertClean } from './textfilter.js';
import { digestActions } from './digest.js';

const DB = 'swimwaveup_db';
const C = {
  profiles: 'profiles',
  posts: 'posts',
  comments: 'comments',
  likes: 'likes',
  jobs: 'jobs',
  applications: 'applications',
  connections: 'connections',
  messages: 'messages',
  facilities: 'facilities',
  notifications: 'notifications',
  liveRooms: 'live_rooms',
  swimMeets: 'swim_meets',
  shifts: 'shifts',
  announcements: 'announcements',
  reports: 'reports',
  endorsements: 'endorsements',
  liveMessages: 'live_messages',
  reviews: 'reviews',
  blocks: 'blocks',
  clientErrors: 'client_errors',
  privateInfo: 'private_info',
  commentLikes: 'comment_likes',
  profileViews: 'profile_views',
  subscriptions: 'subscriptions',
  follows: 'follows',
  pollVotes: 'poll_votes',
  groups: 'groups',
  groupMembers: 'group_members',
  staffMessages: 'staff_messages',
  typing: 'typing',
  jobAlerts: 'job_alerts',
  recommendations: 'recommendations',
  eventPrivate: 'event_private',
  staffChatReads: 'staff_chat_reads',
  staffInvites: 'staff_invites',
  pushSubscriptions: 'push_subscriptions',
  plans: 'plans',
};

const REPORT_TARGETS = ['post', 'comment', 'profile', 'job', 'facility', 'review'];
const REPORT_REASONS = ['spam', 'molestie', 'contenuto_inappropriato', 'falso_profilo', 'offerta_ingannevole', 'altro'];
const DELETE_ACCOUNT_CONFIRMATION = 'ELIMINA';

/** Estrae bucket e file da un URL di Appwrite Storage, se lo è. */
const parseFileUrl = (url) => {
  const m = typeof url === 'string' && url.match(/\/storage\/buckets\/([^/]+)\/files\/([^/?]+)/);
  return m ? { bucketId: m[1], fileId: m[2] } : null;
};

/** URL dei media di un post (campo `media` o vecchio blocco [MEDIA] nel testo). */
const postMediaUrls = (post) => {
  const urls = [];
  for (const raw of post.media || []) {
    try { urls.push(JSON.parse(raw).url); } catch { /* ignorato */ }
  }
  const legacy = (post.content || '').match(/\[MEDIA\](.*?)\[\/MEDIA\]/s);
  if (legacy) {
    try { JSON.parse(legacy[1]).forEach((m) => urls.push(m.url)); } catch { /* ignorato */ }
  }
  return urls.filter(Boolean);
};

const APPLICATION_STATUSES = ['pending', 'reviewed', 'accepted', 'rejected', 'hired'];
const POST_TYPES = ['text', 'image', 'video', 'link', 'video-analysis'];
const POST_CATEGORIES = ['generale', 'allenamento', 'gara', 'tecnica', 'normative', 'pensiero', 'esperienza'];
const MAX_POST_MEDIA = 10;

/** Errore "atteso": il messaggio viene mostrato all'utente. */
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** `code` (facoltativo) permette al client di reagire, es. 'premium_required' mostra l'offerta Premium. */
const fail = (status, message, code) => {
  throw new HttpError(status, message, code);
};

/** Data di calendario UTC "YYYY-MM-DD". */
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const requireString = (value, name, max = 5000) => {
  if (typeof value !== 'string' || value.trim() === '') fail(400, `Parametro mancante: ${name}`);
  if (value.length > max) fail(400, `Il campo ${name} supera i ${max} caratteri.`);
  return value.trim();
};

/**
 * Proprietario di un documento creato da un client. Un client può assegnare
 * permessi solo a se stesso, quindi l'utente che ha `update("user:ID")` è chi
 * lo ha creato: è un dato affidabile, a differenza di un campo scritto dal client.
 */
const ownersOf = (doc) =>
  (doc.$permissions || [])
    .map((p) => /^update\("user:([^"]+)"\)$/.exec(p))
    .filter(Boolean)
    .map((m) => m[1]);

const conversationIdFor = (a, b) => [a, b].sort().join('_');

/**
 * @param db istanza di TablesDB (API Appwrite 1.8+). "Tabella" e "riga" sono
 *           i nuovi nomi di "collezione" e "documento": i dati sono gli stessi.
 */
const createApi = (db, { users = null, storage = null, endpoint = '', messaging = null, vapid = null, appUrl = '', log = () => {}, fetchImpl, billing = {} } = {}) => {
  /** Riga o null se non esiste. */
  const find = (tableId, rowId) =>
    db.getRow({ databaseId: DB, tableId, rowId }).catch((e) => {
      if (e?.code === 404) return null;
      throw e;
    });

  const get = async (tableId, rowId) => (await find(tableId, rowId)) ?? fail(404, 'Elemento non trovato.');

  const list = async (tableId, queries) => {
    const res = await db.listRows({ databaseId: DB, tableId, queries });
    return { total: res.total, documents: res.rows };
  };

  const create = (tableId, data, permissions, rowId = ID.unique()) =>
    db.createRow({ databaseId: DB, tableId, rowId, data, permissions });

  /** Con `permissions` sostituisce anche i permessi della riga. */
  const update = (tableId, rowId, data, permissions) => db.updateRow({ databaseId: DB, tableId, rowId, data, ...(permissions ? { permissions } : {}) });

  const remove = (tableId, rowId) => db.deleteRow({ databaseId: DB, tableId, rowId });

  const count = async (tableId, queries) => (await list(tableId, [...queries, Query.limit(1)])).total;

  /** Tutte le righe che soddisfano le query (a pagine di 100, con cursore). */
  const listAll = async (tableId, queries) => {
    const rows = [];
    let cursor = null;
    for (;;) {
      const page = await list(tableId, [...queries, Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])]);
      rows.push(...page.documents);
      if (page.documents.length < 100) return rows;
      cursor = page.documents[page.documents.length - 1].$id;
    }
  };

  /** Elimina tutte le righe che soddisfano le query, a blocchi di 100. */
  const removeAll = async (tableId, queries) => {
    let removed = 0;
    for (;;) {
      const page = await list(tableId, [...queries, Query.limit(100)]);
      if (page.documents.length === 0) return removed;
      await Promise.all(page.documents.map((row) => remove(tableId, row.$id)));
      removed += page.documents.length;
    }
  };

  /** Notifica leggibile e aggiornabile (segna come letta) solo dal destinatario. */
  const push = pushActions({ find, get, list, create, update, remove, fail, C, Query, messaging, ID, vapid, appUrl, log, fetchImpl });

  /** Notifica nell'app più, secondo le preferenze dell'utente, push ed email. */
  const notify = async (userId, type, content, relatedId) => {
    const row = await create(C.notifications, { userId, type, content: content.slice(0, 255), relatedId, isRead: false }, [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ]).catch(() => null); // una notifica persa non deve far fallire l'azione principale
    await push._deliver(userId, type, content.slice(0, 255), relatedId);
    return row;
  };

  /**
   * Limite anti-spam: al massimo `max` righe create da chi chiama in `windowMs`
   * (conta le righe della tabella, nessuna tabella in più).
   */
  const assertClean = makeAssertClean(fail);

  const rateLimit = async (tableId, field, me, max, windowMs, message, extra = []) => {
    const since = new Date(Date.now() - windowMs).toISOString();
    const recent = await count(tableId, [Query.equal(field, me), Query.greaterThan('$createdAt', since), ...extra]);
    if (recent >= max) fail(429, message);
  };

  const displayName = (profile) =>
    profile.userType === 'structure'
      ? profile.structureName || 'Una struttura'
      : `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Un utente';

  /** Chi gestisce un annuncio: il creatore del job, più gli admin della struttura se è una Facility. */
  const jobManagers = async (job) => {
    const managers = new Set(ownersOf(job));
    const facility = await find(C.facilities, job.structureId);
    (facility?.admins || []).forEach((id) => managers.add(id));
    if (!facility) managers.add(job.structureId); // job pubblicato da un profilo Struttura
    return [...managers];
  };

  /**
   * Chi può scrivere a chi, come su LinkedIn: liberi i collegamenti, le conversazioni già
   * avviate, candidati e selezionatori, i messaggi alle strutture. Per tutti gli altri serve
   * Premium, che consuma un messaggio diretto (InMail) al primo messaggio della conversazione.
   */
  const checkMessagingAllowed = async (me, receiver) => {
    const receiverId = receiver.$id;
    const sender = await get(C.profiles, me);
    const connected = (sender.connections || []).includes(receiverId) && (receiver.connections || []).includes(me);
    if (connected || receiver.userType === 'structure') return;
    const before = await count(C.messages, [Query.equal('conversationId', conversationIdFor(me, receiverId))]);
    if (before > 0) return;
    if ((await isRecruiterOf(me, receiverId)) || (await isRecruiterOf(receiverId, me))) return;
    if (!isPremium(sender)) {
      fail(402, 'Per scrivere a chi non è tra i tuoi collegamenti serve SwimIn Premium. In alternativa invia una richiesta di collegamento.', 'premium_required');
    }
    const audience = audienceOf(sender);
    const expired = !sender.inmailResetAt || new Date(sender.inmailResetAt).getTime() < Date.now();
    const credits = expired ? INMAIL_CREDITS[audience] : sender.inmailCredits ?? INMAIL_CREDITS[audience];
    if (credits <= 0) fail(402, 'Hai usato tutti i messaggi diretti di questo mese: si ricaricano a inizio periodo.', 'inmail_exhausted');
    await update(C.profiles, me, {
      inmailCredits: credits - 1,
      ...(expired ? { inmailResetAt: new Date(Date.now() + 30 * 86_400_000).toISOString() } : {}),
    });
  };

  /** Chi chiama gestisce un annuncio a cui la persona si è candidata? */
  const isRecruiterOf = async (me, applicantId) => {
    const { documents } = await list(C.applications, [Query.equal('applicantId', applicantId), Query.limit(50)]);
    for (const app of documents) {
      const job = await find(C.jobs, app.jobId);
      if (job && (await jobManagers(job)).includes(me)) return true;
    }
    return false;
  };

  /**
   * Avvisa della sostituzione urgente i professionisti della stessa provincia
   * che hanno dato disponibilità per quel giorno (e fascia, se c'è l'orario).
   * Con Premium anche quelli delle altre province della stessa regione (prima i più vicini).
   */
  const alertSOS = async (job, me, premium = false) => {
    const day = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][new Date(`${job.sosDate}T12:00:00Z`).getUTCDay()];
    const hour = job.sosShift ? Number(job.sosShift.slice(0, 2)) : null;
    const part = hour === null ? null : hour < 13 ? 'mattina' : hour < 18 ? 'pomeriggio' : 'sera';
    const provinces = premium ? regionProvinces(job.province) : [job.province];
    const people = await listAll(C.profiles, [Query.equal('province', provinces), Query.equal('userType', 'professional')]);
    const targets = people
      .filter((p) => p.$id !== me && !p.suspended && p.personType !== 'enthusiast')
      .filter((p) => (p.availability || []).some((slot) => (part ? slot === `${day}-${part}` : slot.startsWith(`${day}-`))))
      .sort((a, b) => Number(b.province === job.province) - Number(a.province === job.province))
      .slice(0, premium ? 250 : 100);
    const when = `${job.sosDate.slice(8, 10)}/${job.sosDate.slice(5, 7)}${job.sosShift ? `, ${job.sosShift}` : ''}`;
    for (const p of targets) await notify(p.$id, 'sos', `SOS ${job.structureName || 'piscina'} (${job.city}): cercano "${job.title}" il ${when}.`, job.$id);
    return targets.length;
  };

  const addToArray = (arr = [], value) => (arr.includes(value) ? arr : [...arr, value]);
  const removeFromArray = (arr = [], value) => arr.filter((v) => v !== value);

  const billingApi = billingActions({ find, get, list, create, update, fail, C, Query, users, notify, isAdmin: (id) => moderation._isAdmin(id), config: { ...billing, appUrl }, fetchImpl: fetchImpl || fetch, log });
  /** Immagine caricata nello storage di SwimIn (niente link esterni). */
  const storageImage = (v, label) => {
    if (v == null || v === '') return '';
    const url = String(v);
    const host = (() => { try { return new URL(url).host; } catch { return ''; } })();
    const ok = /^https:\/\//.test(url) && (host.endsWith('appwrite.io') || (endpoint && endpoint.includes(`//${host}`))) && /\/storage\/buckets\/(avatars|post_media)\/files\//.test(url);
    if (!ok || url.length > 2048) fail(400, `${label}: immagine non valida.`);
    return url;
  };
  const alertsApi = alertActions({ find, list, listAll, create, remove, fail, notify, C, Query, Permission, Role });
  const recs = recommendationActions({ assertClean, find, get, list, listAll, create, update, remove, fail, notify, C, Query, Permission, Role, displayName, assertNotBlocked: (a, b) => moderation._assertNotBlocked(a, b), isRecruiterOf: (a, b) => isRecruiterOf(a, b) });
  const digest = digestActions({ list, count, update, C, Query, messaging, ID, displayName, appUrl, log });
  const chat = chatActions({ get, update, fail, C, storage, Permission, Role });
  const groups = groupActions({ find, get, list, listAll, create, update, remove, removeAll, count, fail, notify, C, Query, Permission, Role, displayName, assertClean, storageUrl: storageImage, onGroupDeleted: (id) => events._cancelGroupEvents(id) });
  const events = eventActions({ assertClean, get, list, listAll, create, update, remove, fail, notify, C, Query, Permission, Role, displayName, find, isoDay, groups, storageUrl: storageImage });
  const content_ = contentActions({ find, get, list, listAll, create, update, remove, count, fail, notify, C, Query, Permission, Role, displayName, assertNotBlocked: (a, b) => moderation._assertNotBlocked(a, b) });
  const social = socialActions({ find, get, list, listAll, create, update, remove, removeAll, count, fail, notify, C, Query, Permission, Role, displayName, assertNotBlocked: (a, b) => moderation._assertNotBlocked(a, b) });
  const team = teamActions({ find, get, list, listAll, create, update, remove, removeAll, count, fail, notify, deliver: (...a) => push._deliver(...a), C, Query, displayName });
  const moderation = moderationActions({ find, get, create, update, remove, list, listAll, removeAll, count, fail, users, notify, C, displayName });
  const assertNotBlocked = moderation._assertNotBlocked;

  // -------------------------------------------------------------------------
  // Azioni
  // -------------------------------------------------------------------------
  return {
    ...moderation,
    ...team,
    ...social,
    ...content_,
    ...groups,
    ...chat,
    ...digest,
    ...alertsApi,
    ...recs,
    ...events,
    ...billingApi,
    ...publicActions({ find, listAll, list, fail, C, Query }),
    ...push,
    ...certificateActions({ get, update, list, fail, storage, notify, C, isAdmin: moderation._isAdmin, Query }),
    // ---------------- PROFILI E PAGINE STRUTTURA (profile.js) ----------------
    ...profileActions({ find, get, create, update, remove, fail, users, endpoint, C, isRecruiterOf, Permission, Role }),
    ...reviewActions({ find, get, create, update, remove, list, fail, notify, C }),

    // ---------------- MESSAGGI ----------------
    async sendMessage(me, { receiverId, content = '', attachments = null, replyToId = null }) {
      receiverId = requireString(receiverId, 'receiverId', 36);
      content = typeof content === 'string' ? content.trim() : '';
      if (content.length > 4000) fail(400, 'Il messaggio supera i 4000 caratteri.');
      const hasFiles = Array.isArray(attachments) && attachments.length > 0;
      if (!content && !hasFiles) fail(400, 'Scrivi un messaggio o allega un file.');
      if (receiverId === me) fail(400, 'Non puoi scrivere a te stesso.');
      const receiver = await get(C.profiles, receiverId);
      await assertNotBlocked(me, receiverId);
      const conversationId = conversationIdFor(me, receiverId);
      await rateLimit(C.messages, 'senderId', me, 30, 60_000, 'Stai inviando troppi messaggi: aspetta qualche secondo.');
      const replyPreview = await chat._replyPreview(me, conversationId, replyToId);
      await checkMessagingAllowed(me, receiver);
      const files = await chat._attach(me, receiverId, attachments);
      const message = await create(
        C.messages,
        {
          conversationId, senderId: me, receiverId, content, isRead: false,
          ...(files.length ? { attachments: files } : {}),
          ...(replyPreview ? { replyToId, replyPreview } : {}),
        },
        [Permission.read(Role.user(me)), Permission.read(Role.user(receiverId))]
      );
      // Push al destinatario, a meno che non abbia silenziato il mittente.
      const muted = await count(C.blocks, [Query.equal('blockerId', receiverId), Query.equal('blockedId', me), Query.equal('kind', 'mute')]);
      if (!muted) {
        const sender = await find(C.profiles, me);
        await push._deliver(receiverId, 'message', content.slice(0, 140) || (files.length === 1 ? 'Ti ha inviato un allegato.' : `Ti ha inviato ${files.length} allegati.`), me, { title: sender ? displayName(sender) : 'Nuovo messaggio' });
      }
      return message;
    },

    async markConversationRead(me, { conversationId }) {
      conversationId = requireString(conversationId, 'conversationId', 100);
      const unread = await list(C.messages, [
        Query.equal('conversationId', conversationId),
        Query.equal('receiverId', me),
        Query.equal('isRead', false),
        Query.limit(100),
      ]);
      await Promise.all(unread.documents.map((m) => update(C.messages, m.$id, { isRead: true })));
      return { updated: unread.documents.length };
    },

    // ---------------- COLLEGAMENTI ----------------
    async sendConnectionRequest(me, { receiverId }) {
      receiverId = requireString(receiverId, 'receiverId', 36);
      if (receiverId === me) fail(400, 'Non puoi collegarti con te stesso.');
      await assertNotBlocked(me, receiverId);
      await rateLimit(C.connections, 'senderId', me, 100, 86_400_000, 'Hai inviato molte richieste di collegamento oggi: riprova domani.');
      const [sender] = await Promise.all([get(C.profiles, me), get(C.profiles, receiverId)]);
      if ((sender.connections || []).includes(receiverId)) fail(409, 'Siete già collegati.');

      const existing = await list(C.connections, [
        Query.equal('senderId', [me, receiverId]),
        Query.equal('receiverId', [me, receiverId]),
        Query.equal('status', 'pending'),
        Query.limit(1),
      ]);
      if (existing.total > 0) fail(409, 'Esiste già una richiesta in sospeso.');

      const req = await create(C.connections, { senderId: me, receiverId, status: 'pending' }, [
        Permission.read(Role.user(me)),
        Permission.read(Role.user(receiverId)),
      ]);
      await notify(receiverId, 'connection', `${displayName(sender)} vuole collegarsi con te.`, me);
      return req;
    },

    async respondConnectionRequest(me, { connectionId, accept }) {
      connectionId = requireString(connectionId, 'connectionId', 36);
      const conn = await get(C.connections, connectionId);
      if (conn.receiverId !== me) fail(403, 'Solo il destinatario può rispondere alla richiesta.');
      if (conn.status !== 'pending') fail(409, 'Richiesta già gestita.');

      if (!accept) return update(C.connections, connectionId, { status: 'rejected' });

      const [sender, receiver] = await Promise.all([get(C.profiles, conn.senderId), get(C.profiles, me)]);
      await Promise.all([
        update(C.profiles, sender.$id, { connections: addToArray(sender.connections, me) }),
        update(C.profiles, me, { connections: addToArray(receiver.connections, sender.$id) }),
      ]);
      const updated = await update(C.connections, connectionId, { status: 'accepted' });
      await notify(sender.$id, 'connection', `${displayName(receiver)} ha accettato la tua richiesta.`, me);
      return updated;
    },

    async removeConnection(me, { userId }) {
      userId = requireString(userId, 'userId', 36);
      const [mine, theirs] = await Promise.all([get(C.profiles, me), get(C.profiles, userId)]);
      await Promise.all([
        update(C.profiles, me, { connections: removeFromArray(mine.connections, userId) }),
        update(C.profiles, userId, { connections: removeFromArray(theirs.connections, me) }),
      ]);
      return { removed: true };
    },

    // ---------------- FEED ----------------
    /**
     * Crea un post a nome dell'utente che chiama: autore e tipo di account sono
     * decisi qui, così nessuno può pubblicare a nome di altri.
     */
    async createPost(me, { content = '', media = [], postType = 'text', category = 'generale', poll = null, groupId = null }) {
      content = typeof content === 'string' ? content.trim() : '';
      if (content.length > 4000) fail(400, 'Il post supera i 4000 caratteri.');
      if (!Array.isArray(media) || media.length > MAX_POST_MEDIA) fail(400, `Puoi allegare al massimo ${MAX_POST_MEDIA} file.`);
      const cleanMedia = media.map((raw) => {
        let m;
        try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { fail(400, 'Allegato non valido.'); }
        if (!m || !['image', 'video'].includes(m.type) || typeof m.url !== 'string') fail(400, 'Allegato non valido.');
        // Solo file caricati nel nostro storage: niente link esterni mascherati da foto.
        if (endpoint && !m.url.startsWith(endpoint)) fail(400, 'Gli allegati devono essere caricati su SwimIn.');
        return JSON.stringify({ type: m.type, url: m.url, ...(m.alt ? { alt: String(m.alt).slice(0, 200) } : {}) });
      });
      if (!content && cleanMedia.length === 0) fail(400, 'Il post è vuoto.');
      if (!POST_TYPES.includes(postType)) postType = 'text';
      if (!POST_CATEGORIES.includes(category)) category = 'generale';
      const pollData = cleanPoll(poll);
      if (pollData?.error) fail(400, pollData.error);
      if (pollData && !content) fail(400, 'Scrivi la domanda del sondaggio.');
      assertClean(content, 'post');
      if (pollData) assertClean(pollData.options.join(' '), 'post');
      // Lo stesso testo ripubblicato a pochi minuti di distanza è quasi sempre spam o un doppio invio.
      if (content) {
        const last = (await list(C.posts, [Query.equal('authorId', me), Query.orderDesc('$createdAt'), Query.limit(1)])).documents[0];
        if (last && last.content === content && Date.now() - new Date(last.$createdAt).getTime() < 10 * 60_000) fail(409, 'Hai appena pubblicato lo stesso post.');
      }

      await rateLimit(C.posts, 'authorId', me, 15, 3_600_000, 'Hai pubblicato molti post nell’ultima ora: riprova più tardi.');
      const author = await get(C.profiles, me);
      const group = groupId ? await groups._assertCanPost(me, requireString(groupId, 'groupId', 36)) : null;
      const mentions = extractMentions(content);
      const row = await create(C.posts, {
        ...(group ? { groupId: group.$id } : {}),
        authorId: me, authorType: author.userType, content, media: cleanMedia, postType, category,
        visibility: 'public', likesCount: 0, commentsCount: 0,
        hashtags: extractHashtags(content), mentions,
        ...(pollData ? { pollOptions: pollData.options, pollEndsAt: pollData.endsAt, pollCounts: JSON.stringify(pollData.options.map(() => 0)) } : {}),
      }, [Permission.read(Role.users())]); // modifiche ed eliminazione solo tramite la Function
      await content_._notifyMentions(me, mentions, row.$id);
      if (group) await groups._recountPosts(group.$id);
      return row;
    },

    /** Compatibilità: il vecchio "consiglia" è la reazione predefinita. */
    async toggleLike(me, { postId }) {
      const res = await social.react(me, { postId, reaction: 'consiglio' });
      return { liked: res.liked, likesCount: res.likesCount, reaction: res.reaction, reactionCounts: res.reactionCounts };
    },

    async createComment(me, { postId, content, parentCommentId = null }) {
      postId = requireString(postId, 'postId', 36);
      content = requireString(content, 'content', 2000);
      assertClean(content, 'comment');
      const post = await get(C.posts, postId);
      await assertNotBlocked(me, post.authorId);
      // Nei gruppi commentano solo i membri.
      if (post.groupId) await groups._assertCanPost(me, post.groupId).catch(() => fail(403, 'Entra nel gruppo per commentare.'));
      await rateLimit(C.comments, 'authorId', me, 20, 60_000, 'Stai commentando troppo velocemente: aspetta qualche secondo.');
      let parent = null;
      if (parentCommentId) {
        parent = await get(C.comments, parentCommentId);
        if (parent.postId !== postId) fail(400, 'Il commento padre appartiene a un altro post.');
      }
      // Solo lettura per i client: autore, post e contatori non devono essere modificabili dal client.
      const comment = await create(C.comments, { postId, authorId: me, content, parentCommentId }, [Permission.read(Role.users())]);
      const commentsCount = await count(C.comments, [Query.equal('postId', postId)]);
      await update(C.posts, postId, { commentsCount });

      const author = await find(C.profiles, me);
      const name = author ? displayName(author) : 'Qualcuno';
      if (post.authorId !== me) await notify(post.authorId, 'comment', `${name} ha commentato il tuo post.`, postId);
      if (parent && parent.authorId !== me && parent.authorId !== post.authorId) {
        await notify(parent.authorId, 'comment', `${name} ha risposto al tuo commento.`, postId);
      }
      await content_._notifyMentions(me, extractMentions(content).filter((id) => id !== post.authorId), postId, 'in un commento');
      return comment;
    },

    /** Elimina un post dell'utente insieme a like e commenti collegati. */
    /** Modifica di un proprio post: solo testo e categoria (contatori e autore restano del server). */
    async updatePost(me, { postId, content, category } = {}) {
      postId = requireString(postId, 'postId', 36);
      const post = await get(C.posts, postId);
      if (post.authorId !== me) fail(403, 'Puoi modificare solo i tuoi post.');
      const text = typeof content === 'string' ? content.trim() : '';
      if (text.length > 4000) fail(400, 'Il post supera i 4000 caratteri.');
      if (!text && !(post.media || []).length) fail(400, 'Il post è vuoto.');
      assertClean(text, 'post');
      const mentions = extractMentions(text);
      const patch = { content: text, editedAt: new Date().toISOString(), hashtags: extractHashtags(text), mentions };
      if (category !== undefined) patch.category = POST_CATEGORIES.includes(category) ? category : 'generale';
      const updated = await update(C.posts, postId, patch);
      // Solo chi viene menzionato per la prima volta riceve l'avviso.
      await content_._notifyMentions(me, mentions.filter((id) => !(post.mentions || []).includes(id)), postId);
      return updated;
    },

    async deletePost(me, { postId }) {
      postId = requireString(postId, 'postId', 36);
      const post = await get(C.posts, postId);
      // L'autore, oppure un amministratore del gruppo in cui è pubblicato (moderazione).
      const groupAdmin = post.groupId ? await groups._isGroupAdmin(post.groupId, me) : false;
      if (post.authorId !== me && !ownersOf(post).includes(me) && !groupAdmin) fail(403, 'Puoi eliminare solo i tuoi post.');
      for (const tableId of [C.likes, C.comments, C.commentLikes, C.pollVotes]) {
        await removeAll(tableId, [Query.equal('postId', postId)]);
      }
      await remove(C.posts, postId);
      if (post.repostOf) await social._recountReposts(post.repostOf);
      if (post.groupId) await groups._recountPosts(post.groupId);
      return { deleted: true };
    },

    /** L'autore del commento o l'autore del post possono eliminare un commento (e le sue risposte). */
    async deleteComment(me, { commentId }) {
      commentId = requireString(commentId, 'commentId', 36);
      const comment = await get(C.comments, commentId);
      const post = await find(C.posts, comment.postId);
      const allowed = ownersOf(comment).includes(me) || comment.authorId === me || (post && (post.authorId === me || ownersOf(post).includes(me)))
        || (post?.groupId && (await groups._isGroupAdmin(post.groupId, me)));
      if (!allowed) fail(403, 'Non puoi eliminare questo commento.');

      for (const reply of await listAll(C.comments, [Query.equal('parentCommentId', commentId)])) {
        await removeAll(C.commentLikes, [Query.equal('commentId', reply.$id)]);
      }
      await removeAll(C.commentLikes, [Query.equal('commentId', commentId)]);
      await removeAll(C.comments, [Query.equal('parentCommentId', commentId)]);
      await remove(C.comments, commentId);
      if (post) {
        const commentsCount = await count(C.comments, [Query.equal('postId', post.$id)]);
        await update(C.posts, post.$id, { commentsCount });
      }
      return { deleted: true };
    },

    // ---------------- COMPETENZE ----------------
    /**
     * Conferma (o ritira la conferma di) una competenza di un collegamento,
     * come gli endorsement di LinkedIn. Solo tra utenti collegati.
     */
    async toggleEndorsement(me, { profileId, skill }) {
      profileId = requireString(profileId, 'profileId', 36);
      skill = requireString(skill, 'skill', 60);
      if (profileId === me) fail(400, 'Non puoi confermare le tue competenze.');
      const [profile, endorser] = await Promise.all([get(C.profiles, profileId), get(C.profiles, me)]);
      if (!(profile.skills || []).includes(skill)) fail(404, 'Competenza non presente nel profilo.');
      // Controlliamo entrambi i lati: l'elenco del destinatario può modificarlo solo lui o il server.
      if (!(endorser.connections || []).includes(profileId) || !(profile.connections || []).includes(me)) {
        fail(403, 'Puoi confermare le competenze solo dei tuoi collegamenti.');
      }

      const existing = await list(C.endorsements, [
        Query.equal('profileId', profileId), Query.equal('endorserId', me), Query.equal('skill', skill), Query.limit(5),
      ]);
      if (existing.total > 0) {
        await Promise.all(existing.documents.map((e) => remove(C.endorsements, e.$id)));
        return { endorsed: false };
      }
      await create(C.endorsements, { profileId, endorserId: me, skill }, [Permission.read(Role.users())]);
      await notify(profileId, 'endorsement', `${displayName(endorser)} ha confermato la tua competenza "${skill}".`, me);
      return { endorsed: true };
    },

    // ---------------- NOTIFICHE ----------------
    async markAllNotificationsRead(me) {
      const unread = await listAll(C.notifications, [Query.equal('userId', me), Query.equal('isRead', false)]);
      await Promise.all(unread.map((n) => update(C.notifications, n.$id, { isRead: true })));
      return { updated: unread.length };
    },

    // ---------------- SEGNALAZIONI ----------------
    async reportContent(me, { targetType, targetId, reason, details = '' }) {
      if (!REPORT_TARGETS.includes(targetType)) fail(400, 'Tipo di contenuto non valido.');
      if (!REPORT_REASONS.includes(reason)) fail(400, 'Motivo non valido.');
      targetId = requireString(targetId, 'targetId', 36);
      const duplicate = await count(C.reports, [
        Query.equal('reporterId', me), Query.equal('targetId', targetId), Query.equal('status', 'open'),
      ]);
      if (duplicate > 0) return { reported: true, duplicate: true };
      await rateLimit(C.reports, 'reporterId', me, 30, 3_600_000, 'Hai inviato molte segnalazioni: le stiamo esaminando, riprova più tardi.');
      // Nessun permesso: le segnalazioni sono visibili solo dalla Console di Appwrite.
      await create(C.reports, {
        reporterId: me, targetType, targetId, reason,
        details: String(details).slice(0, 1000), status: 'open',
      }, []);
      return { reported: true };
    },

    // ---------------- ACCOUNT ----------------
    /**
     * Elimina l'account e i dati collegati (diritto alla cancellazione, art. 17 GDPR).
     * I messaggi già inviati restano al destinatario, come indicato nella Privacy Policy.
     */
    async deleteAccount(me, { confirmation }) {
      if (confirmation !== DELETE_ACCOUNT_CONFIRMATION) fail(400, `Per confermare scrivi ${DELETE_ACCOUNT_CONFIRMATION}.`);
      if (!users) fail(500, 'Servizio utenti non disponibile.');
      const profile = await find(C.profiles, me);
      const files = [profile?.avatar, profile?.logo, profile?.cover];
      // Documenti dei brevetti (bucket privato)
      for (const raw of profile?.certificationsList || []) {
        try {
          const c = JSON.parse(raw);
          if (c.documentFileId && storage) await storage.deleteFile({ bucketId: CERT_BUCKET, fileId: c.documentFileId }).catch(() => null);
        } catch { /* ignorato */ }
      }
      const touchedPosts = new Set();

      // Post propri, con relativi like, commenti e file.
      for (const post of await listAll(C.posts, [Query.equal('authorId', me)])) {
        files.push(...postMediaUrls(post));
        await removeAll(C.likes, [Query.equal('postId', post.$id)]);
        await removeAll(C.comments, [Query.equal('postId', post.$id)]);
        await removeAll(C.commentLikes, [Query.equal('postId', post.$id)]);
        await remove(C.posts, post.$id);
        if (post.repostOf) await social._recountReposts(post.repostOf);
      }
      await removeAll(C.commentLikes, [Query.equal('userId', me)]);
      await removeAll(C.profileViews, [Query.equal('viewerId', me)]);
      await removeAll(C.profileViews, [Query.equal('profileId', me)]);
      await billingApi._cancelAllFor(me);
      await groups._leaveAll(me);
      await removeAll(C.pollVotes, [Query.equal('userId', me)]);
      await removeAll(C.jobAlerts, [Query.equal('userId', me)]);
      await recs._removeAllFor(me);
      for (const f of await listAll(C.follows, [Query.equal('followerId', me)])) {
        await remove(C.follows, f.$id);
        const other = await find(C.profiles, f.followeeId);
        if (other) await update(C.profiles, other.$id, { followersCount: Math.max(0, (other.followersCount || 1) - 1) });
      }
      await removeAll(C.follows, [Query.equal('followeeId', me)]);
      await removeAll(C.subscriptions, [Query.equal('userId', me)]);
      // Like e commenti lasciati su post altrui: i contatori vanno ricalcolati.
      for (const like of await listAll(C.likes, [Query.equal('userId', me)])) {
        touchedPosts.add(like.postId);
        await remove(C.likes, like.$id);
      }
      for (const comment of await listAll(C.comments, [Query.equal('authorId', me)])) {
        touchedPosts.add(comment.postId);
        await removeAll(C.comments, [Query.equal('parentCommentId', comment.$id)]);
        await remove(C.comments, comment.$id).catch(() => null); // già rimosso come risposta
      }
      for (const postId of touchedPosts) {
        if (!(await find(C.posts, postId))) continue;
        await update(C.posts, postId, {
          likesCount: await count(C.likes, [Query.equal('postId', postId)]),
          commentsCount: await count(C.comments, [Query.equal('postId', postId)]),
        });
      }

      // Rete: richieste di collegamento e presenza negli elenchi altrui.
      await removeAll(C.connections, [Query.equal('senderId', me)]);
      await removeAll(C.connections, [Query.equal('receiverId', me)]);
      await removeAll(C.blocks, [Query.equal('blockerId', me)]);
      await removeAll(C.blocks, [Query.equal('blockedId', me)]);
      await remove(C.privateInfo, me).catch(() => null);
      await removeAll(C.pushSubscriptions, [Query.equal('userId', me)]);
      // Recensioni scritte: rimosse, con media delle strutture ricalcolata.
      for (const r of await listAll(C.reviews, [Query.equal('authorId', me)])) {
        await remove(C.reviews, r.$id);
        const published = await listAll(C.reviews, [Query.equal('structureId', r.structureId), Query.equal('status', 'published')]);
        const table = (await find(C.profiles, r.structureId)) ? C.profiles : C.facilities;
        await update(table, r.structureId, { ratingSum: published.reduce((sum, x) => sum + x.rating, 0), ratingCount: published.length }).catch(() => null);
      }
      for (const otherId of profile?.connections || []) {
        const other = await find(C.profiles, otherId);
        if (other) await update(C.profiles, otherId, { connections: removeFromArray(other.connections, me) });
      }

      // Lavoro: candidature inviate, annunci pubblicati come Struttura e loro candidature.
      await removeAll(C.applications, [Query.equal('applicantId', me)]);
      for (const job of await listAll(C.jobs, [Query.equal('structureId', me)])) {
        await removeAll(C.applications, [Query.equal('jobId', job.$id)]);
        await remove(C.jobs, job.$id);
      }

      // Pagine struttura: eliminate se ne ero l'unico amministratore, altrimenti esco dagli elenchi.
      for (const field of ['admins', 'staff', 'followers']) {
        for (const facility of await listAll(C.facilities, [Query.contains(field, [me])])) {
          const current = await find(C.facilities, facility.$id);
          if (!current) continue;
          if (field === 'admins' && (current.admins || []).length <= 1) {
            files.push(current.logo, current.cover);
            for (const job of await listAll(C.jobs, [Query.equal('structureId', current.$id)])) {
              await removeAll(C.applications, [Query.equal('jobId', job.$id)]);
              await remove(C.jobs, job.$id);
            }
            await remove(C.facilities, current.$id);
          } else {
            await update(C.facilities, current.$id, { [field]: removeFromArray(current[field], me) });
          }
        }
      }

      // Staff dei profili Struttura.
      for (const structure of await listAll(C.profiles, [Query.contains('staff', [me])])) {
        const current = await find(C.profiles, structure.$id);
        if (current) await update(C.profiles, current.$id, { staff: removeFromArray(current.staff, me) });
      }

      // Eventi, dirette, turni, bacheca e notifiche.
      await events._leaveAllEvents(me);
      for (const room of await listAll(C.liveRooms, [Query.equal('hostId', me)])) {
        await update(C.liveRooms, room.$id, { status: 'ended', speakers: [], listeners: [] });
      }
      await removeAll(C.shifts, [Query.equal('userId', me)]);
      await removeAll(C.staffInvites, [Query.equal('userId', me)]);
      await removeAll(C.staffInvites, [Query.equal('structureId', me)]);
      await removeAll(C.shifts, [Query.equal('structureId', me)]);
      await removeAll(C.announcements, [Query.equal('structureId', me)]);
      await removeAll(C.notifications, [Query.equal('userId', me)]);
      await removeAll(C.endorsements, [Query.equal('profileId', me)]);
      await removeAll(C.endorsements, [Query.equal('endorserId', me)]);

      if (profile) await remove(C.profiles, me);
      if (storage) {
        for (const ref of files.map(parseFileUrl).filter(Boolean)) {
          await storage.deleteFile({ bucketId: ref.bucketId, fileId: ref.fileId }).catch(() => null);
        }
      }
      await users.delete({ userId: me });
      return { deleted: true };
    },

    // ---------------- LAVORO ----------------
    /**
     * Pubblica un annuncio. La struttura deve essere l'utente stesso (account
     * Struttura) o una Pagina Struttura di cui è amministratore; nome e logo
     * vengono presi dalla struttura, non dal client.
     */
    async createJob(me, data) {
      const structureId = requireString(data.structureId, 'structureId', 36);
      let structureName;
      let facilityLogo;
      if (structureId === me) {
        const profile = await get(C.profiles, me);
        if (profile.userType !== 'structure') fail(403, 'Solo le strutture possono pubblicare annunci.');
        structureName = profile.structureName;
        facilityLogo = profile.logo;
      } else {
        const facility = await find(C.facilities, structureId);
        if (!facility || !(facility.admins || []).includes(me)) fail(403, 'Non sei amministratore di questa struttura.');
        structureName = facility.name;
        facilityLogo = facility.logo;
      }
      const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
      const int = (v) => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Math.max(0, Math.min(1_000_000_000, Math.round(Number(v)))) : undefined);
      const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim().slice(0, 500)).filter(Boolean).slice(0, 20) : []);

      const job = {
        structureId,
        structureName: str(structureName, 255),
        facilityLogo: str(facilityLogo, 2048),
        title: requireString(data.title, 'title', 255),
        description: requireString(data.description, 'description', 4000),
        role: requireString(data.role, 'role', 100),
        contractType: str(data.contractType, 100),
        city: requireString(data.city, 'city', 255),
        province: str(data.province, 10)?.toUpperCase(),
        salaryMin: int(data.salaryMin),
        salaryMax: int(data.salaryMax),
        workingHours: str(data.workingHours, 255),
        requirements: list(data.requirements),
        qualificationsRequired: list(data.qualificationsRequired),
        isActive: true,
        isSOS: !!data.isSOS,
        sosDate: str(data.sosDate, 100),
        sosShift: str(data.sosShift, 100),
        expiresAt: isoDay(Date.now() + clampInt(data.expiryDays, 1, 90, 30) * 86_400_000),
        candidates: [],
      };
      if (job.salaryMin !== undefined && job.salaryMax !== undefined && job.salaryMin > job.salaryMax) fail(400, 'Il compenso minimo supera il massimo.');
      if (job.isSOS) {
        // Le sostituzioni urgenti hanno una data precisa: entro 60 giorni, non nel passato.
        const today = isoDay(Date.now());
        if (!job.sosDate || !/^\d{4}-\d{2}-\d{2}$/.test(job.sosDate)) fail(400, 'Indica la data della sostituzione.');
        if (job.sosDate < isoDay(Date.now() - 86_400_000) || job.sosDate > isoDay(Date.now() + 60 * 86_400_000)) fail(400, 'La data della sostituzione deve essere entro 60 giorni.');
        if (job.sosShift && !/^([01]\d|2[0-3]):[0-5]\d–([01]\d|2[0-3]):[0-5]\d$/.test(job.sosShift)) fail(400, 'Orario del turno non valido.');
        // L'annuncio SOS sparisce il giorno dopo il turno.
        job.expiresAt = job.sosDate > today ? job.sosDate : today;
      }
      // Premium: annunci in evidenza e senza limite; Base: al massimo BASE_ACTIVE_JOBS annunci attivi (gli SOS non contano).
      const publisher = await get(C.profiles, me);
      const premium = isPremium(publisher);
      job.featured = premium;
      if (!premium && !job.isSOS) {
        const today = isoDay(Date.now());
        const open = (await listAll(C.jobs, [Query.equal('structureId', structureId), Query.equal('isActive', true)])).filter((j) => !j.isSOS && (!j.expiresAt || j.expiresAt >= today));
        if (open.length >= BASE_ACTIVE_JOBS) {
          fail(402, `Con il piano Base puoi avere ${BASE_ACTIVE_JOBS} annunci attivi alla volta. Chiudine uno o passa a Premium per pubblicarne senza limiti, in evidenza.`, 'premium_required');
        }
      }
      for (const k of Object.keys(job)) if (job[k] === undefined) delete job[k];
      // Solo lettura per i client: chiusura e riapertura passano da closeJob/reopenJob (limiti Base, evidenza Premium).
      const created = await create(C.jobs, job, [Permission.read(Role.users())]);
      if (job.isSOS && job.province) created.notified = await alertSOS(created, me, premium);
      created.alerted = await alertsApi._notifyJobAlerts(created, me).catch((e) => { log(`avvisi di lavoro: ${e?.message || e}`); return 0; });
      return created;
    },

    /**
     * Modifica di un annuncio da parte di chi lo gestisce: testo, compenso, requisiti, luogo e,
     * con `expiryDays`, una nuova scadenza a partire da oggi. Le sostituzioni urgenti (SOS)
     * cambiano solo descrizione e compenso: data e turno restano quelli annunciati.
     */
    async updateJob(me, { jobId, ...data } = {}) {
      jobId = requireString(jobId, 'jobId', 36);
      const job = await get(C.jobs, jobId);
      if (!(await jobManagers(job)).includes(me)) fail(403, 'Non gestisci questo annuncio.');
      const has = (k) => Object.prototype.hasOwnProperty.call(data, k);
      const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
      const int = (v) => (v === '' || v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Math.max(0, Math.min(1_000_000_000, Math.round(Number(v)))) : null);
      const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim().slice(0, 500)).filter(Boolean).slice(0, 20) : []);
      const allowed = job.isSOS ? ['description', 'salaryMin', 'salaryMax'] : ['title', 'description', 'role', 'contractType', 'city', 'province', 'salaryMin', 'salaryMax', 'workingHours', 'requirements', 'qualificationsRequired', 'expiryDays'];
      const patch = {};
      for (const k of Object.keys(data)) if (!allowed.includes(k)) fail(400, job.isSOS ? 'Di una sostituzione urgente puoi cambiare solo descrizione e compenso.' : `Campo non modificabile: ${k}.`);
      if (has('title')) patch.title = requireString(data.title, 'title', 255);
      if (has('description')) patch.description = requireString(data.description, 'description', 4000);
      if (has('role')) patch.role = requireString(data.role, 'role', 100);
      if (has('city')) patch.city = requireString(data.city, 'city', 255);
      if (has('province')) patch.province = str(data.province, 10)?.toUpperCase() || null;
      if (has('contractType')) patch.contractType = str(data.contractType, 100);
      if (has('workingHours')) patch.workingHours = str(data.workingHours, 255);
      if (has('salaryMin')) patch.salaryMin = int(data.salaryMin);
      if (has('salaryMax')) patch.salaryMax = int(data.salaryMax);
      if (has('requirements')) patch.requirements = list(data.requirements);
      if (has('qualificationsRequired')) patch.qualificationsRequired = list(data.qualificationsRequired);
      if (has('expiryDays') && data.expiryDays !== null && data.expiryDays !== '') patch.expiresAt = isoDay(Date.now() + clampInt(data.expiryDays, 1, 90, 30) * 86_400_000);
      for (const t of [patch.title, patch.description]) if (t) assertClean(t, 'text');
      const min = has('salaryMin') ? patch.salaryMin : job.salaryMin;
      const max = has('salaryMax') ? patch.salaryMax : job.salaryMax;
      if (min != null && max != null && min > max) fail(400, 'Il compenso minimo supera il massimo.');
      if (!Object.keys(patch).length) return job;
      return update(C.jobs, jobId, patch);
    },

    /**
     * Annunci di una struttura per chi li gestisce: attivi, chiusi e scaduti, con il conteggio
     * delle candidature per fase (nuove, viste, selezionate, assunte, scartate).
     */
    async listStructureJobs(me, { structureId } = {}) {
      structureId = requireString(structureId || me, 'structureId', 36);
      const facility = await find(C.facilities, structureId);
      const managers = facility ? facility.admins || [] : [structureId];
      if (!managers.includes(me)) fail(403, 'Non gestisci questa struttura.');
      const jobs = (await listAll(C.jobs, [Query.equal('structureId', structureId)])).sort((a, b) => b.$createdAt.localeCompare(a.$createdAt)).slice(0, 200);
      const counts = {};
      for (let i = 0; i < jobs.length; i += 50) {
        const ids = jobs.slice(i, i + 50).map((j) => j.$id);
        for (const app of await listAll(C.applications, [Query.equal('jobId', ids)])) {
          const c = (counts[app.jobId] ??= { total: 0, pending: 0, reviewed: 0, accepted: 0, hired: 0, rejected: 0 });
          c.total += 1;
          if (c[app.status] !== undefined) c[app.status] += 1;
        }
      }
      return jobs.map((j) => ({ ...j, applications: counts[j.$id] || { total: 0, pending: 0, reviewed: 0, accepted: 0, hired: 0, rejected: 0 } }));
    },

    /** Chiude un annuncio (non riceve più candidature); solo chi lo gestisce. */
    async closeJob(me, { jobId }) {
      jobId = requireString(jobId, 'jobId', 36);
      const job = await get(C.jobs, jobId);
      if (!(await jobManagers(job)).includes(me)) fail(403, 'Non gestisci questo annuncio.');
      return update(C.jobs, jobId, { isActive: false });
    },

    /** Riapre un annuncio chiuso, se non è scaduto; con il piano Base vale il limite di annunci attivi. */
    async reopenJob(me, { jobId }) {
      jobId = requireString(jobId, 'jobId', 36);
      const job = await get(C.jobs, jobId);
      if (!(await jobManagers(job)).includes(me)) fail(403, 'Non gestisci questo annuncio.');
      if (job.isActive) return job;
      const today = isoDay(Date.now());
      if (job.expiresAt && job.expiresAt < today) fail(409, 'L’annuncio è scaduto: pubblicane uno nuovo.');
      if (job.isSOS) fail(409, 'Le sostituzioni urgenti non si riaprono: pubblicane una nuova.');
      const publisher = await get(C.profiles, me);
      if (!isPremium(publisher)) {
        const open = (await listAll(C.jobs, [Query.equal('structureId', job.structureId), Query.equal('isActive', true)])).filter((j) => !j.isSOS && (!j.expiresAt || j.expiresAt >= today));
        if (open.length >= BASE_ACTIVE_JOBS) fail(402, `Con il piano Base puoi avere ${BASE_ACTIVE_JOBS} annunci attivi alla volta. Chiudine uno o passa a Premium.`, 'premium_required');
      }
      return update(C.jobs, jobId, { isActive: true });
    },

    async applyForJob(me, { jobId, coverLetter = '' }) {
      jobId = requireString(jobId, 'jobId', 36);
      const job = await get(C.jobs, jobId);
      if (!job.isActive || (job.expiresAt && job.expiresAt < isoDay(Date.now()))) fail(409, 'Questa posizione non è più disponibile.');
      const applicant = await get(C.profiles, me);
      if (applicant.userType !== 'professional') fail(403, 'Solo i professionisti possono candidarsi.');

      const existing = await count(C.applications, [Query.equal('jobId', jobId), Query.equal('applicantId', me)]);
      if (existing > 0) fail(409, 'Ti sei già candidato per questa posizione.');

      const managers = await jobManagers(job);
      const application = await create(
        C.applications,
        // Premium: la candidatura compare in cima all'elenco della struttura.
        { jobId, applicantId: me, status: 'pending', coverLetter: String(coverLetter).slice(0, 3000), priority: isPremium(applicant) },
        [
          Permission.read(Role.user(me)),
          ...managers.map((id) => Permission.read(Role.user(id))),
        ]
      );
      await update(C.jobs, jobId, { candidates: addToArray(job.candidates, me) });
      await Promise.all(
        managers.map((id) => notify(id, 'application', `Nuova candidatura per "${job.title}".`, jobId))
      );
      return application;
    },

    /** Il candidato ritira la propria candidatura (non dopo l'assunzione). */
    async withdrawApplication(me, { applicationId }) {
      applicationId = requireString(applicationId, 'applicationId', 36);
      const application = await get(C.applications, applicationId);
      if (application.applicantId !== me) fail(403, 'Puoi ritirare solo le tue candidature.');
      if (application.status === 'hired') fail(409, 'Sei già stato assunto per questa posizione.');
      await remove(C.applications, applicationId);
      const job = await find(C.jobs, application.jobId);
      if (job) await update(C.jobs, job.$id, { candidates: removeFromArray(job.candidates, me) });
      return { withdrawn: true };
    },

    async updateApplicationStatus(me, { applicationId, status }) {
      applicationId = requireString(applicationId, 'applicationId', 36);
      if (!APPLICATION_STATUSES.includes(status) || status === 'hired') fail(400, 'Stato non valido.');
      const application = await get(C.applications, applicationId);
      const job = await get(C.jobs, application.jobId);
      if (!(await jobManagers(job)).includes(me)) fail(403, 'Non gestisci questo annuncio.');

      if (application.status === 'hired') fail(409, 'Questa persona è già stata assunta.');
      if (application.status === status) return application;
      const updated = await update(C.applications, applicationId, { status });
      // "Vista" non manda notifiche: il candidato la vede nel percorso della candidatura.
      if (status === 'rejected') {
        await notify(application.applicantId, 'rejected', `La tua candidatura per "${job.title}" non è stata selezionata.`, job.$id);
      } else if (status === 'accepted') {
        await notify(application.applicantId, 'application_update', `${job.structureName || 'La struttura'} ti ha selezionato per "${job.title}": potrebbe contattarti per un colloquio.`, job.$id);
      }
      return updated;
    },

    async hireCandidate(me, { applicationId }) {
      applicationId = requireString(applicationId, 'applicationId', 36);
      const application = await get(C.applications, applicationId);
      const job = await get(C.jobs, application.jobId);
      if (!(await jobManagers(job)).includes(me)) fail(403, 'Non gestisci questo annuncio.');
      if (application.status === 'hired') return { hired: true };

      // Piano Base: area staff fino a BASE_STAFF membri; Premium senza limite (basta un amministratore Premium).
      const current = await team._teamOf(job.structureId);
      if (!current.staff.includes(application.applicantId) && current.staff.length >= BASE_STAFF) {
        const admins = await Promise.all([...new Set([...current.admins, me])].slice(0, 10).map((id) => find(C.profiles, id)));
        if (!admins.some((p) => isPremium(p))) {
          fail(402, `Con il piano Base l'area staff arriva a ${BASE_STAFF} persone. Togli qualcuno dallo staff o passa a Premium per una squadra senza limiti.`, 'premium_required');
        }
      }

      await update(C.applications, applicationId, { status: 'hired' });
      await update(C.jobs, job.$id, { isActive: false });

      const applicantId = application.applicantId;
      let structureName = job.structureName || 'Una struttura';
      const facility = await find(C.facilities, job.structureId);
      // Chi viene assunto entra nello staff (accesso all'area staff della struttura).
      const hiredTeam = await team._addStaff(job.structureId, applicantId);
      structureName = hiredTeam.name || structureName;
      if (!facility) {
        // Profilo Struttura: anche collegamento reciproco, come tra colleghi.
        const [structure, applicant] = await Promise.all([get(C.profiles, job.structureId), get(C.profiles, applicantId)]);
        await Promise.all([
          update(C.profiles, structure.$id, { connections: addToArray(structure.connections, applicantId) }),
          update(C.profiles, applicantId, { connections: addToArray(applicant.connections, structure.$id) }),
        ]);
      }
      await notify(applicantId, 'hired', `🎉 Congratulazioni! Sei stato assunto da ${structureName}.`, job.structureId);
      return { hired: true };
    },

    // ---------------- STRUTTURE ----------------
    async toggleFollowFacility(me, { facilityId }) {
      facilityId = requireString(facilityId, 'facilityId', 36);
      const facility = await get(C.facilities, facilityId);
      const following = (facility.followers || []).includes(me);
      await update(C.facilities, facilityId, {
        followers: following ? removeFromArray(facility.followers, me) : addToArray(facility.followers, me),
      });
      return { following: !following };
    },

    // ---------------- BORDO VASCA LIVE ----------------
    /** Apre una stanza: l'host è sempre chi chiama. */
    async createLiveRoom(me, { title, description = '' }) {
      title = requireString(title, 'title', 120);
      const open = await count(C.liveRooms, [Query.equal('hostId', me), Query.equal('status', 'active')]);
      if (open > 0) fail(409, 'Hai già una diretta in corso: chiudila prima di aprirne un\'altra.');
      return create(C.liveRooms, {
        title, description: String(description).trim().slice(0, 1000), hostId: me, status: 'active',
        speakers: [me], listeners: [], startedAt: new Date().toISOString(),
      }, [Permission.read(Role.users())]);
    },

    async endLiveRoom(me, { roomId }) {
      roomId = requireString(roomId, 'roomId', 36);
      const room = await get(C.liveRooms, roomId);
      if (room.hostId !== me) fail(403, 'Solo chi conduce può chiudere la diretta.');
      return update(C.liveRooms, roomId, { status: 'ended', speakers: [], listeners: [] });
    },

    /** Messaggio nella chat della stanza: domanda, intervento o mano alzata. */
    async sendLiveMessage(me, { roomId, content = '', kind = 'message' }) {
      roomId = requireString(roomId, 'roomId', 36);
      if (!['message', 'question', 'hand'].includes(kind)) fail(400, 'Tipo di messaggio non valido.');
      const room = await get(C.liveRooms, roomId);
      if (room.status !== 'active') fail(409, 'La diretta è terminata.');
      const participants = [...(room.speakers || []), ...(room.listeners || []), room.hostId];
      if (!participants.includes(me)) fail(403, 'Entra nella stanza per scrivere.');
      const text = kind === 'hand' ? '✋' : requireString(content, 'content', 1000);
      if (kind !== 'hand') assertClean(text, 'comment');
      return create(C.liveMessages, { roomId, authorId: me, content: text, kind }, [Permission.read(Role.users())]);
    },

    /** L'host porta un partecipante sul palco o lo riporta tra il pubblico. */
    async setLiveSpeaker(me, { roomId, userId, onStage }) {
      roomId = requireString(roomId, 'roomId', 36);
      userId = requireString(userId, 'userId', 36);
      const room = await get(C.liveRooms, roomId);
      if (room.hostId !== me) fail(403, 'Solo chi conduce la diretta può gestire il palco.');
      if (userId === room.hostId) fail(400, "L'host resta sempre sul palco.");
      const updated = await update(C.liveRooms, roomId, {
        speakers: onStage ? addToArray(room.speakers, userId) : removeFromArray(room.speakers, userId),
        listeners: onStage ? removeFromArray(room.listeners, userId) : addToArray(room.listeners, userId),
      });
      if (onStage) await notify(userId, 'general', `Sei stato invitato sul palco in "${room.title}".`, roomId);
      return updated;
    },

    async joinLiveRoom(me, { roomId, role }) {
      roomId = requireString(roomId, 'roomId', 36);
      const room = await get(C.liveRooms, roomId);
      if (room.status !== 'active') fail(409, 'La diretta è terminata.');
      // Solo l'host può salire sul palco liberamente; gli altri entrano come ascoltatori.
      const asSpeaker = role === 'speaker' && (room.hostId === me || (room.speakers || []).includes(me));
      return update(C.liveRooms, roomId, {
        speakers: asSpeaker ? addToArray(room.speakers, me) : removeFromArray(room.speakers, me),
        listeners: asSpeaker ? removeFromArray(room.listeners, me) : addToArray(room.listeners, me),
      });
    },

    async leaveLiveRoom(me, { roomId }) {
      roomId = requireString(roomId, 'roomId', 36);
      const room = await get(C.liveRooms, roomId);
      return update(C.liveRooms, roomId, {
        speakers: removeFromArray(room.speakers, me),
        listeners: removeFromArray(room.listeners, me),
      });
    },
  };
};

// ---------------------------------------------------------------------------
// Entrypoint Appwrite
// ---------------------------------------------------------------------------
export default async ({ req, res, log, error }) => {
  const userId = req.headers['x-appwrite-user-id'] || null;

  const env = process.env;
  const billing = {
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      prices: Object.fromEntries(PLAN_KEYS.map((k) => [k, env[`STRIPE_PRICE_${k.toUpperCase()}`]])),
    },
    paypal: {
      clientId: env.PAYPAL_CLIENT_ID,
      secret: env.PAYPAL_SECRET,
      webhookId: env.PAYPAL_WEBHOOK_ID,
      mode: env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox',
      plans: Object.fromEntries(PLAN_KEYS.map((k) => [k, env[`PAYPAL_PLAN_${k.toUpperCase()}`]])),
    },
  };
  const makeClient = () =>
    new Client()
      .setEndpoint(env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(req.headers['x-appwrite-key'] || env.APPWRITE_API_KEY);

  // Webhook dei pagamenti: corpo grezzo (serve per la firma), nessun utente.
  const path = String(req.path || '/');
  if (path.startsWith('/webhooks/')) {
    const client = makeClient();
    const api = createApi(new TablesDB(client), { users: new Users(client), appUrl: env.APP_URL || '', log: (m) => log(m), billing });
    const raw = typeof req.bodyText === 'string' ? req.bodyText : typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    try {
      if (path.startsWith('/webhooks/stripe')) return res.json(await api._stripeWebhook(raw, req.headers['stripe-signature']));
      if (path.startsWith('/webhooks/paypal')) return res.json(await api._paypalWebhook(raw, req.headers));
      return res.json({ ok: false }, 404);
    } catch (e) {
      error(`[webhook ${path}] ${e?.message || e}`);
      return res.json({ ok: false, error: e?.message || 'Errore' }, e instanceof HttpError ? e.status : 500);
    }
  }

  // Esecuzione programmata (impostata da setup-db): riepilogo email settimanale.
  if (req.headers['x-appwrite-trigger'] === 'schedule' && !userId) {
    const client = makeClient();
    const api = createApi(new TablesDB(client), {
      messaging: env.EMAIL_NOTIFICATIONS === 'on' ? new Messaging(client) : null,
      appUrl: env.APP_URL || '',
      log: (m) => log(m),
    });
    try {
      const result = await api._weeklyDigest();
      log(`riepilogo settimanale: ${JSON.stringify(result)}`);
      return res.json({ ok: true, data: result });
    } catch (e) {
      error(`[riepilogo] ${e?.message || e}`);
      return res.json({ ok: false }, 500);
    }
  }

  let body = req.bodyJson;
  if (!body || typeof body !== 'object') {
    try {
      body = JSON.parse(req.bodyText || req.body || '{}');
    } catch {
      return res.json({ ok: false, error: 'Richiesta non valida.' }, 400);
    }
  }

  const client = makeClient();
  const api = createApi(new TablesDB(client), {
    users: new Users(client),
    storage: new Storage(client),
    endpoint: env.APPWRITE_FUNCTION_API_ENDPOINT || '',
    // Email solo se in Appwrite Messaging c'è un provider (setup-db imposta EMAIL_NOTIFICATIONS=on).
    messaging: env.EMAIL_NOTIFICATIONS === 'on' ? new Messaging(client) : null,
    vapid: env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || 'mailto:info@swimin.it' } : null,
    appUrl: env.APP_URL || '',
    log: (m) => log(m),
    billing,
  });
  const { action, ...params } = body;
  // Controllo di salute (anche da ospiti): quale versione del codice risponde. Lo usa setup-db dopo il deploy.
  if (action === 'health') return res.json({ ok: true, data: { version: env.APP_VERSION || '', actions: Object.keys(api).filter((k) => !k.startsWith('_')).length } });
  // Senza login si possono chiamare solo le azioni pubbliche (profili pubblici, sitemap).
  if (!userId && !PUBLIC_ACTIONS.includes(action)) return res.json({ ok: false, error: 'Devi effettuare il login.' }, 401);
  // Le azioni che iniziano con "_" sono helper interni, non chiamabili dal client.
  const handler = typeof action === 'string' && !action.startsWith('_') && Object.prototype.hasOwnProperty.call(api, action) ? api[action] : null;
  if (!handler) return res.json({ ok: false, error: `Azione sconosciuta: ${action}` }, 400);

  try {
    const data = await handler(userId, params);
    return res.json({ ok: true, data });
  } catch (e) {
    if (e instanceof HttpError) return res.json({ ok: false, error: e.message, ...(e.code ? { code: e.code } : {}) }, e.status);
    error(`[${action}] ${e?.message || e}`);
    return res.json({ ok: false, error: 'Errore del server. Riprova tra poco.' }, 500);
  }
};

// Esportato per i test locali.
export { createApi, ownersOf, conversationIdFor, parseFileUrl, postMediaUrls, HttpError };
