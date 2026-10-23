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
import { billingActions, isPremium, audienceOf, INMAIL_CREDITS, BASE_ACTIVE_JOBS } from './billing.js';
import { publicActions, PUBLIC_ACTIONS } from './public.js';
import { pushActions } from './push.js';

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
  pushSubscriptions: 'push_subscriptions',
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

  const update = (tableId, rowId, data) => db.updateRow({ databaseId: DB, tableId, rowId, data });

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
   */
  const alertSOS = async (job, me) => {
    const day = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][new Date(`${job.sosDate}T12:00:00Z`).getUTCDay()];
    const hour = job.sosShift ? Number(job.sosShift.slice(0, 2)) : null;
    const part = hour === null ? null : hour < 13 ? 'mattina' : hour < 18 ? 'pomeriggio' : 'sera';
    const people = await listAll(C.profiles, [Query.equal('province', job.province), Query.equal('userType', 'professional')]);
    const targets = people
      .filter((p) => p.$id !== me && !p.suspended && p.personType !== 'enthusiast')
      .filter((p) => (p.availability || []).some((slot) => (part ? slot === `${day}-${part}` : slot.startsWith(`${day}-`))))
      .slice(0, 100);
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
  const chat = chatActions({ get, update, fail, C, storage, Permission, Role });
  const groups = groupActions({ find, get, list, listAll, create, update, remove, removeAll, count, fail, notify, C, Query, Permission, Role, displayName, storageUrl: storageImage, onGroupDeleted: (id) => events._cancelGroupEvents(id) });
  const events = eventActions({ get, list, listAll, create, update, fail, notify, C, Query, Permission, Role, displayName, find, isoDay, groups, storageUrl: storageImage });
  const content_ = contentActions({ find, get, list, listAll, create, update, remove, count, fail, notify, C, Query, Permission, Role, displayName, assertNotBlocked: (a, b) => moderation._assertNotBlocked(a, b) });
  const social = socialActions({ find, get, list, listAll, create, update, remove, removeAll, count, fail, notify, C, Query, Permission, Role, displayName, assertNotBlocked: (a, b) => moderation._assertNotBlocked(a, b) });
  const team = teamActions({ find, get, list, listAll, create, update, remove, removeAll, fail, notify, C, Query, displayName });
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
    ...events,
    ...billingApi,
    ...publicActions({ find, listAll, list, fail, C, Query }),
    ...push,
    ...certificateActions({ get, update, list, fail, storage, notify, C, isAdmin: moderation._isAdmin, Query }),
    // ---------------- PROFILI E PAGINE STRUTTURA (profile.js) ----------------
    ...profileActions({ find, get, create, update, fail, users, endpoint, C, isRecruiterOf }),
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
      const post = await get(C.posts, postId);
      await assertNotBlocked(me, post.authorId);
      let parent = null;
      if (parentCommentId) {
        parent = await get(C.comments, parentCommentId);
        if (parent.postId !== postId) fail(400, 'Il commento padre appartiene a un altro post.');
      }
      const comment = await create(C.comments, { postId, authorId: me, content, parentCommentId }, [
        Permission.read(Role.users()),
        Permission.update(Role.user(me)),
        Permission.delete(Role.user(me)),
      ]);
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
      const allowed = ownersOf(comment).includes(me) || comment.authorId === me || (post && (post.authorId === me || ownersOf(post).includes(me)));
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
      const created = await create(C.jobs, job, [Permission.read(Role.users()), Permission.update(Role.user(me)), Permission.delete(Role.user(me))]);
      if (job.isSOS && job.province) created.notified = await alertSOS(created, me);
      return created;
    },

    async applyForJob(me, { jobId, coverLetter = '' }) {
      jobId = requireString(jobId, 'jobId', 36);
      const job = await get(C.jobs, jobId);
      if (!job.isActive) fail(409, 'Questa posizione non è più disponibile.');
      const applicant = await get(C.profiles, me);
      if (applicant.userType !== 'professional') fail(403, 'Solo i professionisti possono candidarsi.');

      const existing = await count(C.applications, [Query.equal('jobId', jobId), Query.equal('applicantId', me)]);
      if (existing > 0) fail(409, 'Ti sei già candidato per questa posizione.');

      const managers = await jobManagers(job);
      const application = await create(
        C.applications,
        { jobId, applicantId: me, status: 'pending', coverLetter: String(coverLetter).slice(0, 3000) },
        [
          Permission.read(Role.user(me)),
          Permission.delete(Role.user(me)), // il candidato può ritirarsi
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

      const updated = await update(C.applications, applicationId, { status });
      if (status === 'rejected') {
        await notify(application.applicantId, 'rejected', `La tua candidatura per "${job.title}" non è stata selezionata.`, job.$id);
      } else if (status === 'accepted') {
        await notify(application.applicantId, 'general', `La tua candidatura per "${job.title}" è avanzata!`, job.$id);
      }
      return updated;
    },

    async hireCandidate(me, { applicationId }) {
      applicationId = requireString(applicationId, 'applicationId', 36);
      const application = await get(C.applications, applicationId);
      const job = await get(C.jobs, application.jobId);
      if (!(await jobManagers(job)).includes(me)) fail(403, 'Non gestisci questo annuncio.');

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
      prices: { person_month: env.STRIPE_PRICE_PERSON_MONTH, person_year: env.STRIPE_PRICE_PERSON_YEAR, structure_month: env.STRIPE_PRICE_STRUCTURE_MONTH, structure_year: env.STRIPE_PRICE_STRUCTURE_YEAR },
    },
    paypal: {
      clientId: env.PAYPAL_CLIENT_ID,
      secret: env.PAYPAL_SECRET,
      webhookId: env.PAYPAL_WEBHOOK_ID,
      mode: env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox',
      plans: { person_month: env.PAYPAL_PLAN_PERSON_MONTH, person_year: env.PAYPAL_PLAN_PERSON_YEAR, structure_month: env.PAYPAL_PLAN_STRUCTURE_MONTH, structure_year: env.PAYPAL_PLAN_STRUCTURE_YEAR },
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
