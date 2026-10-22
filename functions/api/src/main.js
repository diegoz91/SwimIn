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
import { Client, ID, Permission, Query, Role, TablesDB } from 'node-appwrite';

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
};

const APPLICATION_STATUSES = ['pending', 'reviewed', 'accepted', 'rejected', 'hired'];

/** Errore "atteso": il messaggio viene mostrato all'utente. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (status, message) => {
  throw new HttpError(status, message);
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
const createApi = (db) => {
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

  /** Notifica leggibile e aggiornabile (segna come letta) solo dal destinatario. */
  const notify = (userId, type, content, relatedId) =>
    create(C.notifications, { userId, type, content: content.slice(0, 255), relatedId, isRead: false }, [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ]).catch(() => null); // una notifica persa non deve far fallire l'azione principale

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

  const addToArray = (arr = [], value) => (arr.includes(value) ? arr : [...arr, value]);
  const removeFromArray = (arr = [], value) => arr.filter((v) => v !== value);

  // -------------------------------------------------------------------------
  // Azioni
  // -------------------------------------------------------------------------
  return {
    // ---------------- MESSAGGI ----------------
    async sendMessage(me, { receiverId, content }) {
      receiverId = requireString(receiverId, 'receiverId', 36);
      content = requireString(content, 'content', 4000);
      if (receiverId === me) fail(400, 'Non puoi scrivere a te stesso.');
      await get(C.profiles, receiverId);
      return create(
        C.messages,
        { conversationId: conversationIdFor(me, receiverId), senderId: me, receiverId, content, isRead: false },
        [Permission.read(Role.user(me)), Permission.read(Role.user(receiverId))]
      );
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
    async toggleLike(me, { postId }) {
      postId = requireString(postId, 'postId', 36);
      await get(C.posts, postId);
      const existing = await list(C.likes, [Query.equal('postId', postId), Query.equal('userId', me), Query.limit(10)]);
      let liked;
      if (existing.total > 0) {
        await Promise.all(existing.documents.map((l) => remove(C.likes, l.$id)));
        liked = false;
      } else {
        await create(C.likes, { postId, userId: me }, [Permission.read(Role.users())]);
        liked = true;
      }
      // Ricalcolo dal numero reale di like: corretto anche con click simultanei.
      const likesCount = await count(C.likes, [Query.equal('postId', postId)]);
      await update(C.posts, postId, { likesCount });
      return { liked, likesCount };
    },

    async createComment(me, { postId, content, parentCommentId = null }) {
      postId = requireString(postId, 'postId', 36);
      content = requireString(content, 'content', 2000);
      await get(C.posts, postId);
      if (parentCommentId) {
        const parent = await get(C.comments, parentCommentId);
        if (parent.postId !== postId) fail(400, 'Il commento padre appartiene a un altro post.');
      }
      const comment = await create(C.comments, { postId, authorId: me, content, parentCommentId }, [
        Permission.read(Role.users()),
        Permission.update(Role.user(me)),
        Permission.delete(Role.user(me)),
      ]);
      const commentsCount = await count(C.comments, [Query.equal('postId', postId)]);
      await update(C.posts, postId, { commentsCount });
      return comment;
    },

    // ---------------- LAVORO ----------------
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
        managers.map((id) => notify(id, 'general', `Nuova candidatura per "${job.title}".`, jobId))
      );
      return application;
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
      if (facility) {
        structureName = facility.name;
        await update(C.facilities, facility.$id, { staff: addToArray(facility.staff, applicantId) });
      } else {
        // Annuncio di un profilo Struttura: il "team" è rappresentato dai collegamenti reciproci.
        const [structure, applicant] = await Promise.all([
          get(C.profiles, job.structureId),
          get(C.profiles, applicantId),
        ]);
        structureName = structure.structureName || structureName;
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

    // ---------------- SWIM-MEETS ----------------
    async joinSwimMeet(me, { meetId }) {
      meetId = requireString(meetId, 'meetId', 36);
      const meet = await get(C.swimMeets, meetId);
      if (meet.status !== 'upcoming') fail(409, "L'evento non è più aperto.");
      const participants = meet.participants || [];
      if (participants.includes(me)) return meet;
      if (meet.maxParticipants && participants.length >= meet.maxParticipants) {
        fail(409, "L'evento ha raggiunto il limite massimo di partecipanti.");
      }
      return update(C.swimMeets, meetId, { participants: [...participants, me] });
    },

    async leaveSwimMeet(me, { meetId }) {
      meetId = requireString(meetId, 'meetId', 36);
      const meet = await get(C.swimMeets, meetId);
      if (meet.creatorId === me) fail(400, "Sei l'organizzatore: puoi annullare l'evento invece di lasciarlo.");
      return update(C.swimMeets, meetId, { participants: removeFromArray(meet.participants, me) });
    },
  };
};

// ---------------------------------------------------------------------------
// Entrypoint Appwrite
// ---------------------------------------------------------------------------
export default async ({ req, res, log, error }) => {
  const userId = req.headers['x-appwrite-user-id'];
  if (!userId) return res.json({ ok: false, error: 'Devi effettuare il login.' }, 401);

  let body = req.bodyJson;
  if (!body || typeof body !== 'object') {
    try {
      body = JSON.parse(req.bodyText || req.body || '{}');
    } catch {
      return res.json({ ok: false, error: 'Richiesta non valida.' }, 400);
    }
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'] || process.env.APPWRITE_API_KEY);

  const api = createApi(new TablesDB(client));
  const { action, ...params } = body;
  const handler = Object.prototype.hasOwnProperty.call(api, action) ? api[action] : null;
  if (!handler) return res.json({ ok: false, error: `Azione sconosciuta: ${action}` }, 400);

  try {
    const data = await handler(userId, params);
    return res.json({ ok: true, data });
  } catch (e) {
    if (e instanceof HttpError) return res.json({ ok: false, error: e.message }, e.status);
    error(`[${action}] ${e?.message || e}`);
    return res.json({ ok: false, error: 'Errore del server. Riprova tra poco.' }, 500);
  }
};

// Esportato per i test locali.
export { createApi, ownersOf, conversationIdFor, HttpError };
