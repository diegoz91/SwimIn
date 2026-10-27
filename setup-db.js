/**
 * Configura il progetto Appwrite di SwimWaveUp: database, collezioni, indici,
 * bucket e la Function "api". Si può rilanciare quante volte vuoi: crea ciò
 * che manca e riallinea i permessi di ciò che esiste già.
 *
 * Uso:  npm run setup-db            (schema + deploy della Function)
 *       npm run setup-db -- --skip-function
 *
 * Usa l'API TablesDB (Appwrite 1.8+): tabelle, colonne e righe sono i nuovi
 * nomi di collezioni, attributi e documenti. I dati restano accessibili anche
 * dall'API "Databases" usata dal frontend.
 *
 * Richiede .env.setup (vedi .env.setup.example) con una API key che abbia
 * gli scope: databases.*, tables.*, columns.*, indexes.*, rows.*,
 * buckets.*, files.*, functions.*.
 */
import dotenv from 'dotenv';
import { assertNodeAppwriteVersion } from './scripts/check-sdk.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Functions, ID, Permission, Query, Role, Storage, TablesDB, TablesDBIndexType } from 'node-appwrite';
import { generateVapidKeys } from './functions/api/src/webpush.js';
import { provisionPaypal, provisionStripe } from './scripts/billing/provision.mjs';
import { InputFile } from 'node-appwrite/file';

dotenv.config({ path: '.env.setup' });

/** In GitHub Actions gli errori diventano annotazioni, leggibili senza aprire il log. */
const annotate = (message) => {
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=setup-db::${String(message).replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
};
let phase = 'avvio';

try {
    assertNodeAppwriteVersion();
} catch (e) {
    annotate(e.message);
    throw e;
}

const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY } = process.env;
if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
    const missing = ['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'].filter((k) => !process.env[k]).join(', ');
    console.error(`❌ Mancano le credenziali (${missing}): in .env.setup oppure nei secret di GitHub.`);
    annotate(`Mancano le credenziali: ${missing}`);
    process.exit(1);
}

const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY);
const tablesDB = new TablesDB(client);
const storage = new Storage(client);
const functions = new Functions(client);
// Identifica questo deploy (commit su GitHub, altrimenti data e ora del lancio a mano).
const DEPLOY_VERSION = (process.env.GITHUB_SHA || '').slice(0, 12) || `manuale-${new Date().toISOString().slice(0, 16)}`;
/** Messaggio visibile anche come annotazione su GitHub Actions. */
const notice = (message) => {
    console.log(`   ${message}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Deploy Appwrite::${String(message).replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`);
};
/** Ultimi caratteri del project ID: per riconoscere il progetto senza mostrarlo tutto. */
const projectHint = () => `…${String(APPWRITE_PROJECT_ID).slice(-4)} su ${new URL(APPWRITE_ENDPOINT).host}`;

const DB_ID = 'swimwaveup_db';
const FUNCTION_ID = 'api';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// PERMESSI
// A livello di collezione diamo solo lettura e creazione. Modifiche e
// cancellazioni sono decise documento per documento (documentSecurity):
// chi crea un documento ne è il proprietario. Le collezioni senza "create"
// sono scritte solo dalla Function "api", che verifica chi sta chiamando.
// ---------------------------------------------------------------------------
const READ_CREATE = [Permission.read(Role.users()), Permission.create(Role.users())];
const READ_ONLY = [Permission.read(Role.users())];
const SERVER_ONLY = []; // lettura solo tramite permessi sul singolo documento
const CREATE_ONLY = [Permission.create(Role.users())]; // ognuno legge solo le proprie righe

const str = (key, size, opts = {}) => ({ type: 'string', key, size, ...opts });
const int = (key, opts = {}) => ({ type: 'integer', key, ...opts });
const bool = (key, opts = {}) => ({ type: 'boolean', key, ...opts });
const idx = (key, columns, type = TablesDBIndexType.Key) => ({ key, columns, type });

const schema = [
    {
        // Scritture solo dalla Function (profile.js): validazione e campi protetti.
        id: 'profiles', name: 'Profiles', permissions: READ_ONLY,
        attributes: [
            str('userId', 36, { required: true }),
            str('userType', 50, { required: true }),
            str('email', 255), // non più usata: l'email resta nell'account (vedi migratePrivateInfo)
            str('firstName', 255), str('lastName', 255), str('structureName', 255),
            str('title', 255), str('structureType', 255), str('bio', 2500),
            str('avatar', 2048), str('logo', 2048), str('cover', 2048), str('city', 255), str('province', 10),
            str('typingTo', 36), bool('readReceipts', { default: true }),
            str('experienceList', 2500, { array: true }), str('certificationsList', 2500, { array: true }),
            str('connections', 36, { array: true }),
            bool('isOnline', { default: false }), str('lastActive', 100),
            bool('availableForEmergencies', { default: false }),
            str('skills', 60, { array: true }), // competenze (max 20), confermabili dai collegamenti
            // Contatti e dettagli (validati nei form del client)
            str('phone', 30), str('website', 500),
            str('languages', 40, { array: true }), // professionisti: lingue parlate
            str('availability', 20, { array: true }), // professionisti: fasce "lun-mattina", "sab-sera"…
            // Strutture: sede e impianto
            str('address', 255), str('postalCode', 10), str('vatNumber', 20),
            int('poolLength'), int('lanes'), str('poolSetting', 20), // 'coperta' | 'scoperta' | 'entrambe'
            str('services', 60, { array: true }),
            str('openingHours', 40, { array: true }), // 7 giorni da lunedì: '' non indicato, 'chiuso', '07:00-13:00' o '07:00-13:00,15:00-22:00'
            // Persone: lavoro nel nuoto o appassionato (allievi, master, community)
            str('personType', 20), str('sports', 60, { array: true }),
            // Recensioni ricevute (strutture): media = ratingSum / ratingCount
            int('ratingSum', { default: 0 }), int('ratingCount', { default: 0 }),
            // Moderazione e verifiche
            bool('suspended', { default: false }), bool('pendingVerification', { default: false }),
            str('staff', 36, { array: true }), // profili Struttura: membri dello staff (scritto dalla Function)
            str('coAdmins', 36, { array: true }), // profili Struttura: co-amministratori scelti dallo staff (setCoAdmin)
            bool('publicProfile', { default: false }), bool('hideProfileViews', { default: false }), // scheda visibile anche senza account (scelta della persona)
            str('notificationPrefs', 1000), // scelte push/email per categoria (JSON), scritte dalla Function
            // SwimIn Premium (scritti solo dalla Function): attivo finché premiumUntil è nel futuro
            str('premiumUntil', 40), str('premiumSince', 40), str('premiumSource', 20), bool('premiumTrialUsed', { default: false }),
            int('inmailCredits'), str('inmailResetAt', 40),
            int('followersCount', { default: 0 }), int('followingCount', { default: 0 }),
            str('digestSentAt', 40), // ultimo riepilogo email settimanale (scritto dalla Function)
        ],
        indexes: [idx('by_user', ['userId']), idx('by_type', ['userType']), idx('by_digest', ['digestSentAt'])],
    },
    {
        // Creati dalla Function (autore verificato); l'autore può modificarli ed eliminarli.
        id: 'posts', name: 'Posts', permissions: READ_ONLY,
        attributes: [
            str('authorId', 36, { required: true }), str('authorType', 50, { required: true }),
            str('content', 4000, { required: true }), str('postType', 50, { required: true }),
            str('visibility', 50, { required: true }), str('category', 100),
            str('media', 1000, { array: true }), // ogni elemento: JSON {type,url,alt}
            str('editedAt', 100), // data dell'ultima modifica del testo (non dei contatori)
            int('likesCount', { default: 0 }), int('commentsCount', { default: 0 }),
            str('reactionCounts', 500), // JSON {consiglio, applauso, …}: conteggi per reazione (Function)
            str('repostOf', 36), // ripubblicazione: id del post originale
            int('repostsCount', { default: 0 }),
            str('hashtags', 40, { array: true }), str('mentions', 36, { array: true }), // estratti dal testo dalla Function
            str('pollOptions', 80, { array: true }), str('pollEndsAt', 40), str('pollCounts', 200), // sondaggio (facoltativo)
            str('groupId', 36), // post pubblicato in un gruppo (escluso dal feed principale)
        ],
        indexes: [idx('by_author', ['authorId']), idx('by_repost', ['repostOf']), idx('by_group', ['groupId'])],
    },
    {
        id: 'comments', name: 'Comments', permissions: READ_ONLY,
        attributes: [
            str('postId', 36, { required: true }), str('authorId', 36, { required: true }),
            str('content', 2000, { required: true }), str('parentCommentId', 36),
            int('likesCount', { default: 0 }),
        ],
        indexes: [idx('by_post', ['postId'])],
    },
    {
        id: 'likes', name: 'Likes', permissions: READ_ONLY,
        attributes: [str('postId', 36, { required: true }), str('userId', 36, { required: true }), str('reaction', 20)],
        indexes: [idx('by_post', ['postId']), idx('by_user', ['userId']), idx('by_post_user', ['postId', 'userId'])],
    },
    {
        // Mi piace ai commenti: creati dalla Function, leggibili da tutti gli utenti.
        id: 'comment_likes', name: 'Comment likes', permissions: READ_ONLY,
        attributes: [str('commentId', 36, { required: true }), str('postId', 36, { required: true }), str('userId', 36, { required: true })],
        indexes: [idx('by_comment', ['commentId']), idx('by_post', ['postId']), idx('by_user', ['userId'])],
    },
    {
        // Visite ai profili: le legge solo la Function (il proprietario le vede con listProfileViews).
        id: 'profile_views', name: 'Profile views', permissions: SERVER_ONLY,
        attributes: [
            str('profileId', 36, { required: true }), str('viewerId', 36, { required: true }),
            str('viewedAt', 40, { required: true }), bool('anonymous', { default: false }),
        ],
        indexes: [idx('by_profile', ['profileId']), idx('by_viewer', ['viewerId'])],
    },
    {
        // Creati dalla Function (struttura verificata); chi pubblica può modificarli.
        id: 'jobs', name: 'Jobs', permissions: READ_ONLY,
        attributes: [
            str('structureId', 36, { required: true }), str('title', 255, { required: true }),
            str('description', 4000, { required: true }), str('role', 100, { required: true }),
            str('contractType', 100), str('city', 255, { required: true }), str('province', 10),
            int('salaryMin'), int('salaryMax'), str('workingHours', 255),
            bool('isActive', { default: true }), str('structureName', 255), str('facilityLogo', 2048),
            bool('featured', { default: false }), // annuncio di una struttura Premium (in evidenza)
            str('candidates', 36, { array: true }), str('requirements', 500, { array: true }),
            str('qualificationsRequired', 500, { array: true }),
            bool('isSOS', { default: false }), str('sosDate', 100), str('sosShift', 100),
            str('expiresAt', 100), // data (YYYY-MM-DD) dopo la quale l'annuncio non è più mostrato
        ],
        indexes: [idx('by_active', ['isActive']), idx('by_structure', ['structureId'])],
    },
    {
        id: 'applications', name: 'Applications', permissions: SERVER_ONLY,
        attributes: [
            str('jobId', 36, { required: true }), str('applicantId', 36, { required: true }),
            str('status', 50, { required: true }), str('coverLetter', 3000),
            bool('priority', { default: false }), // candidato Premium: in cima all'elenco della struttura
            // Copia del CV inviata con la candidatura (bucket resumes, leggibile da candidato e selezionatori).
            str('resumeFileId', 36), str('resumeName', 120),
            // Colloquio proposto dalla struttura (il candidato lo vede e risponde).
            str('interviewDate', 10), str('interviewTime', 5), str('interviewMode', 20), str('interviewPlace', 300),
            str('interviewMessage', 500), str('interviewStatus', 20), str('interviewReply', 500), str('interviewReminderAt', 30),
        ],
        indexes: [idx('by_job', ['jobId']), idx('by_applicant', ['applicantId'])],
    },
    {
        // Note e valutazioni interne di chi gestisce l'annuncio (id = candidatura): mai visibili al candidato.
        id: 'application_reviews', name: 'Application reviews', permissions: SERVER_ONLY,
        attributes: [str('jobId', 36, { required: true }), str('applicationId', 36, { required: true }), int('rating'), str('note', 2000), str('updatedBy', 36)],
        indexes: [idx('by_job', ['jobId'])],
    },
    {
        id: 'connections', name: 'Connections', permissions: SERVER_ONLY,
        attributes: [
            str('senderId', 36, { required: true }), str('receiverId', 36, { required: true }),
            str('status', 50, { required: true }),
        ],
        indexes: [idx('by_receiver_status', ['receiverId', 'status']), idx('by_sender', ['senderId'])],
    },
    {
        id: 'messages', name: 'Messages', permissions: SERVER_ONLY,
        attributes: [
            str('conversationId', 100, { required: true }), str('senderId', 36, { required: true }),
            str('receiverId', 36, { required: true }), str('content', 4000), // vuoto se c'è solo un allegato
            bool('isRead', { default: false }),
            str('attachments', 500, { array: true }), // JSON {fileId,name,mime,size}, file nel bucket privato chat_files
            str('replyToId', 36), str('replyPreview', 400), // risposta: anteprima del messaggio citato (JSON)
            str('reactions', 1000), // JSON {userId: reazione}
            bool('deleted', { default: false }), // eliminato per tutti dal mittente
        ],
        indexes: [idx('by_conversation', ['conversationId']), idx('by_receiver_read', ['receiverId', 'isRead'])],
    },
    {
        // Area staff: solo tramite la Function, che verifica l'appartenenza al team a ogni lettura.
        id: 'announcements', name: 'Announcements', permissions: SERVER_ONLY,
        attributes: [
            str('structureId', 36, { required: true }), str('content', 4000, { required: true }),
            bool('isImportant', { default: false }), str('readBy', 36, { array: true }),
        ],
        indexes: [idx('by_structure', ['structureId'])],
    },
    {
        id: 'shifts', name: 'Shifts', permissions: SERVER_ONLY,
        attributes: [
            str('structureId', 36, { required: true }), str('userId', 36, { required: true }),
            str('userName', 255, { required: true }), str('date', 100, { required: true }),
            str('shiftTime', 100, { required: true }), str('role', 100, { required: true }),
            str('status', 50, { required: true }),
            str('seriesId', 36), // turni ricorrenti creati insieme
            str('reminderSentAt', 30), // promemoria della sera prima già inviato
        ],
        indexes: [idx('by_structure', ['structureId'])],
    },
    {
        // Modelli di settimana dei turni (solo la Function li legge e li scrive).
        id: 'shift_templates', name: 'Shift templates', permissions: SERVER_ONLY,
        attributes: [str('structureId', 36, { required: true }), str('name', 80, { required: true }), str('slots', 12000, { required: true }), str('createdBy', 36)],
        indexes: [idx('by_structure', ['structureId'])],
    },
    {
        // Richieste di cambio turno tra colleghi (toUserId vuoto = aperta a tutto lo staff).
        id: 'shift_swaps', name: 'Shift swaps', permissions: SERVER_ONLY,
        attributes: [
            str('structureId', 36, { required: true }), str('shiftId', 36, { required: true }), str('fromUserId', 36, { required: true }),
            str('toUserId', 36), str('status', 20, { required: true }), str('message', 300), str('takenBy', 36),
        ],
        indexes: [idx('by_structure', ['structureId']), idx('by_shift', ['shiftId'])],
    },
    {
        // Blocchi e silenziamenti: ognuno legge solo i propri (scritti dalla Function).
        id: 'blocks', name: 'Blocks', permissions: SERVER_ONLY,
        attributes: [
            str('blockerId', 36, { required: true }), str('blockedId', 36, { required: true }), str('kind', 10, { required: true }),
        ],
        indexes: [idx('by_blocker', ['blockerId']), idx('by_blocked', ['blockedId'])],
    },
    {
        // Chi segue chi (senza collegarsi): pubblico come su LinkedIn, scritto dalla Function.
        id: 'follows', name: 'Follows', permissions: READ_ONLY,
        attributes: [str('followerId', 36, { required: true }), str('followeeId', 36, { required: true })],
        indexes: [idx('by_follower', ['followerId']), idx('by_followee', ['followeeId'])],
    },
    {
        // Voti ai sondaggi: ognuno vede solo il proprio (permesso sulla riga), i totali sono sul post.
        id: 'poll_votes', name: 'Poll votes', permissions: SERVER_ONLY,
        attributes: [str('postId', 36, { required: true }), str('userId', 36, { required: true }), int('option', { required: true })],
        indexes: [idx('by_post', ['postId']), idx('by_user', ['userId'])],
    },
    {
        // Gruppi e community: leggibili da tutti gli iscritti, scritti solo dalla Function.
        id: 'groups', name: 'Groups', permissions: READ_ONLY,
        attributes: [
            str('name', 80, { required: true }), str('description', 2000, { required: true }), str('rules', 2000),
            str('category', 30, { required: true }), str('privacy', 20, { required: true }), str('province', 2),
            str('cover', 1000), str('creatorId', 36, { required: true }), str('admins', 36, { array: true }),
            int('membersCount', { default: 0 }), int('postsCount', { default: 0 }),
        ],
        indexes: [idx('by_creator', ['creatorId']), idx('by_category', ['category'])],
    },
    {
        // Iscritti ai gruppi (status: active | pending | banned), scritti dalla Function.
        id: 'group_members', name: 'Group members', permissions: READ_ONLY,
        attributes: [
            str('groupId', 36, { required: true }), str('userId', 36, { required: true }),
            str('role', 20, { required: true }), str('status', 20, { required: true }),
        ],
        indexes: [idx('by_group', ['groupId']), idx('by_user', ['userId'])],
    },
    {
        // Referenze scritte: permessi sulla riga (in attesa: autore e destinatario; pubblicate: tutti), scritte dalla Function.
        id: 'recommendations', name: 'Recommendations', permissions: SERVER_ONLY,
        attributes: [
            str('profileId', 36, { required: true }), str('authorId', 36, { required: true }), str('relationship', 20),
            str('content', 3000, { required: true }), str('status', 20, { required: true }),
        ],
        indexes: [idx('by_profile', ['profileId']), idx('by_author', ['authorId'])],
    },
    {
        // Avvisi di lavoro (ricerche salvate): ognuno legge i propri, scritti dalla Function.
        id: 'job_alerts', name: 'Job alerts', permissions: SERVER_ONLY,
        attributes: [
            str('userId', 36, { required: true }), str('query', 60), str('province', 2), str('contractType', 100),
            bool('sosOnly', { default: false }),
        ],
        indexes: [idx('by_user', ['userId']), idx('by_province', ['province'])],
    },
    {
        // "Sta scrivendo…": una riga per persona, leggibile solo dal destinatario (scritta dalla Function).
        id: 'typing', name: 'Typing', permissions: SERVER_ONLY,
        attributes: [str('userId', 36, { required: true }), str('targetId', 36, { required: true }), str('until', 40, { required: true })],
        indexes: [],
    },
    {
        // Dati riservati degli eventi (link per collegarsi): restituiti dalla Function solo a iscritti e organizzatore.
        id: 'event_private', name: 'Event private', permissions: SERVER_ONLY,
        attributes: [str('onlineUrl', 500)],
        indexes: [],
    },
    {
        // Chat dello staff di una struttura: solo tramite la Function, che verifica il team a ogni lettura.
        id: 'staff_messages', name: 'Staff messages', permissions: SERVER_ONLY,
        attributes: [str('structureId', 36, { required: true }), str('authorId', 36, { required: true }), str('content', 2000, { required: true })],
        indexes: [idx('by_structure', ['structureId'])],
    },
    {
        // Ultima lettura della chat staff per persona (contatore dei non letti).
        id: 'staff_chat_reads', name: 'Staff chat reads', permissions: SERVER_ONLY,
        attributes: [str('structureId', 36, { required: true }), str('userId', 36, { required: true }), str('lastReadAt', 40, { required: true })],
        indexes: [idx('by_user', ['userId'])],
    },
    {
        // Inviti nello staff (chi lavora già nella struttura): id = hash di struttura e persona. Solo la Function.
        id: 'staff_invites', name: 'Staff Invites', permissions: SERVER_ONLY,
        attributes: [
            str('structureId', 36, { required: true }), str('userId', 36, { required: true }),
            str('invitedBy', 36, { required: true }), str('status', 20, { required: true }), // pending | accepted | declined
        ],
        indexes: [idx('by_user_status', ['userId', 'status']), idx('by_structure_status', ['structureId', 'status'])],
    },
    {
        // Segnali di tempo reale: la Function scrive una riga per destinatario (leggibile solo da lui),
        // il client la riceve con Realtime e aggiorna la pagina. Pulizia programmata dopo un giorno.
        id: 'signals', name: 'Signals', permissions: SERVER_ONLY,
        attributes: [str('userId', 36, { required: true }), str('topic', 80, { required: true }), str('kind', 40)],
        indexes: [],
    },
    {
        // Abbonamenti Premium (Stripe, PayPal): solo la Function li legge e li scrive.
        id: 'subscriptions', name: 'Subscriptions', permissions: SERVER_ONLY,
        attributes: [
            str('userId', 36, { required: true }), str('provider', 20, { required: true }), str('externalId', 100, { required: true }),
            str('customerId', 100), str('status', 30, { required: true }), str('period', 10), str('audience', 20),
            str('currentPeriodEnd', 40), bool('cancelAtPeriodEnd', { default: false }),
        ],
        indexes: [idx('by_user', ['userId'])],
    },
    {
        // Prezzi dei piani Premium decisi dagli amministratori (azioni adminGetPlans/adminUpdatePlans).
        // Id della riga = piano (person_month, enthusiast_year…). Nessun permesso: solo la Function.
        id: 'plans', name: 'Plans', permissions: SERVER_ONLY,
        attributes: [
            int('amount', { required: true }), // centesimi di euro, IVA inclusa
            str('stripePriceId', 100), str('paypalPlanId', 100),
        ],
        indexes: [],
    },
    {
        // Dati privati delle persone (telefono, CV): letti solo dalla Function.
        id: 'private_info', name: 'Private info', permissions: SERVER_ONLY,
        attributes: [
            str('phone', 30),
            // CV personale (PDF nel bucket privato resumes): solo il proprietario lo vede.
            str('resumeFileId', 36), str('resumeName', 120), int('resumeSize'), str('resumeUpdatedAt', 40),
        ],
        indexes: [],
    },
    {
        // Dispositivi registrati per le notifiche push: solo la Function li legge e li scrive.
        id: 'push_subscriptions', name: 'Push subscriptions', permissions: SERVER_ONLY,
        attributes: [
            str('userId', 36, { required: true }), str('endpoint', 1000, { required: true }),
            str('p256dh', 100, { required: true }), str('auth', 50, { required: true }), str('userAgent', 255),
        ],
        indexes: [idx('by_user', ['userId'])],
    },
    {
        // Registro errori dell'app (source 'client') e della Function ('server'), letto dal pannello admin.
        // fingerprint raggruppa gli errori uguali: un solo avviso agli amministratori all'ora per impronta.
        id: 'client_errors', name: 'Client errors', permissions: SERVER_ONLY,
        attributes: [
            str('userId', 36, { required: true }), str('message', 500, { required: true }),
            str('stack', 4000), str('url', 500), str('userAgent', 300),
            str('source', 10), str('action', 80), str('fingerprint', 16),
        ],
        indexes: [idx('by_user', ['userId']), idx('by_fingerprint', ['fingerprint']), idx('by_source', ['source'])],
    },
    {
        // Suggerimenti e segnalazioni dall'app ("Scrivici"): solo la Function, letti dagli amministratori.
        id: 'feedback', name: 'Feedback', permissions: SERVER_ONLY,
        attributes: [
            str('userId', 36, { required: true }), str('kind', 20, { required: true }), str('message', 2000, { required: true }),
            str('page', 300), str('userAgent', 300), str('status', 10, { required: true }),
        ],
        indexes: [idx('by_status', ['status']), idx('by_user', ['userId'])],
    },
    {
        // Stato del servizio (riga "main"): tutto ok, rallentamenti o manutenzione. Leggibile da tutti,
        // anche senza accesso; lo scrivono solo gli amministratori tramite la Function (adminSetAppStatus).
        id: 'app_status', name: 'App status', permissions: [Permission.read(Role.any())],
        attributes: [str('mode', 20, { required: true }), str('message', 500), str('until', 30), str('updatedBy', 36)],
        indexes: [],
    },
    {
        // Recensioni delle strutture: scritte dalla Function (una per persona e struttura).
        id: 'reviews', name: 'Reviews', permissions: READ_ONLY,
        attributes: [
            str('structureId', 36, { required: true }), str('authorId', 36, { required: true }),
            int('rating', { required: true }), str('content', 2000, { required: true }),
            str('visitedAt', 10), str('reply', 1000), str('replyAt', 100), str('editedAt', 100),
            str('status', 20, { default: 'published' }),
        ],
        indexes: [idx('by_structure', ['structureId']), idx('by_author_structure', ['authorId', 'structureId'])],
    },
    {
        id: 'notifications', name: 'Notifications', permissions: SERVER_ONLY,
        attributes: [
            str('userId', 36, { required: true }), str('type', 50, { required: true }),
            str('content', 255, { required: true }), str('relatedId', 36), bool('isRead', { default: false }),
        ],
        indexes: [idx('by_user_read', ['userId', 'isRead'])],
    },
    {
        // Elementi salvati: privati, ogni riga è leggibile ed eliminabile solo da chi l'ha creata.
        id: 'saves', name: 'Saves', permissions: CREATE_ONLY,
        attributes: [
            str('userId', 36, { required: true }), str('targetType', 20, { required: true }),
            str('targetId', 36, { required: true }),
        ],
        indexes: [idx('by_user', ['userId'])],
    },
    {
        // Conferme di competenze tra collegamenti: scritte solo dalla Function.
        id: 'endorsements', name: 'Endorsements', permissions: READ_ONLY,
        attributes: [
            str('profileId', 36, { required: true }), str('endorserId', 36, { required: true }),
            str('skill', 60, { required: true }),
        ],
        indexes: [idx('by_profile', ['profileId']), idx('by_endorser', ['endorserId'])],
    },
    {
        // Segnalazioni di contenuti: scritte solo dalla Function, lette solo dalla Console.
        id: 'reports', name: 'Reports', permissions: SERVER_ONLY,
        attributes: [
            str('reporterId', 36, { required: true }), str('targetType', 50, { required: true }),
            str('targetId', 36, { required: true }), str('reason', 50, { required: true }),
            str('details', 1000), str('status', 50, { required: true }),
            // decisione dell'amministratore
            str('resolution', 20), str('resolvedBy', 36), str('resolvedAt', 100), str('note', 1000),
        ],
        indexes: [idx('by_reporter_target', ['reporterId', 'targetId']), idx('by_status', ['status'])],
    },
    {
        // Aperte dalla Function (host verificato); l'host può chiuderle.
        id: 'live_rooms', name: 'Live Rooms', permissions: READ_ONLY,
        attributes: [
            str('title', 255, { required: true }), str('description', 1000), str('hostId', 36, { required: true }),
            str('status', 50, { required: true }),
            str('speakers', 36, { array: true }), str('listeners', 36, { array: true }),
            str('startedAt', 100, { required: true }),
        ],
        indexes: [idx('by_status', ['status'])],
    },
    {
        // Chat delle stanze live: scritta solo dalla Function (solo partecipanti).
        id: 'live_messages', name: 'Live Messages', permissions: READ_ONLY,
        attributes: [
            str('roomId', 36, { required: true }), str('authorId', 36, { required: true }),
            str('content', 1000, { required: true }), str('kind', 20, { required: true }),
        ],
        indexes: [idx('by_room', ['roomId'])],
    },
    {
        // Creati e annullati dalla Function (organizzatore verificato).
        id: 'swim_meets', name: 'Swim Meets', permissions: READ_ONLY,
        attributes: [
            str('title', 255, { required: true }), str('description', 4000, { required: true }),
            str('date', 100, { required: true }), str('time', 100, { required: true }),
            str('city', 255, { required: true }), str('address', 500), str('creatorId', 36, { required: true }),
            str('participants', 36, { array: true }), int('maxParticipants'), str('status', 50, { required: true }),
            // Eventi: tipo, orario di fine, online, provincia, quota (€, 0 = gratuito), lista d'attesa, gruppo.
            str('type', 20), str('endTime', 5), bool('isOnline', { default: false }), str('onlineUrl', 500),
            str('province', 2), int('price', { default: 0 }), str('waitlist', 36, { array: true }),
            str('cover', 1000), str('groupId', 36),
        ],
        indexes: [idx('by_status', ['status']), idx('by_group', ['groupId'])],
    },
];

// Avatar e media dei post sono pubblici in lettura (vengono mostrati con <img>
// senza sessione); solo il proprietario del file può modificarlo o cancellarlo.
const buckets = [
    { id: 'avatars', name: 'Avatars', maxSizeMB: 5 },
    { id: 'post_media', name: 'Post Media', maxSizeMB: 50 },
    // Documenti dei brevetti: privati (ogni file leggibile solo da chi lo carica e dal server).
    { id: 'certificates', name: 'Certificates', maxSizeMB: 8, permissions: [Permission.create(Role.users())], extensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'] },
    // Allegati dei messaggi: privati, leggibili da mittente e destinatario (permessi impostati dalla Function).
    // CV personali (solo PDF): privati; le copie allegate alle candidature le crea la Function.
    { id: 'resumes', name: 'Resumes', maxSizeMB: 5, permissions: [Permission.create(Role.users())], extensions: ['pdf'] },
    { id: 'chat_files', name: 'Chat files', maxSizeMB: 10, permissions: [Permission.create(Role.users())], extensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx'] },
];
const BUCKET_PERMISSIONS = [Permission.read(Role.any()), Permission.create(Role.users())];

// ---------------------------------------------------------------------------

const exists = (e) => e?.code === 409;

/**
 * Le stringhe brevi (≤ 255) diventano `varchar`, indicizzabili e salvate nella
 * riga; quelle lunghe e gli array diventano `text`, salvati fuori riga, così
 * non si supera il limite di dimensione di una riga MariaDB (~64 KB).
 */
async function createColumn(tableId, a) {
    const base = { databaseId: DB_ID, tableId, key: a.key, required: !!a.required, array: !!a.array };
    // Appwrite non accetta un default sulle colonne obbligatorie o array.
    const xdefault = a.required || a.array ? undefined : a.default;
    if (a.type === 'string') {
        return a.size <= 255 && !a.array
            ? tablesDB.createVarcharColumn({ ...base, size: a.size, xdefault })
            : tablesDB.createTextColumn({ ...base, xdefault });
    }
    if (a.type === 'integer') return tablesDB.createIntegerColumn({ ...base, min: 0, max: 1_000_000_000, xdefault });
    if (a.type === 'boolean') return tablesDB.createBooleanColumn({ ...base, xdefault });
    throw new Error(`Tipo colonna sconosciuto: ${a.type}`);
}

/** Le colonne vengono create in modo asincrono: gli indici richiedono che siano pronte. */
async function waitForColumns(tableId) {
    for (let i = 0; i < 90; i++) {
        const { columns } = await tablesDB.listColumns({ databaseId: DB_ID, tableId });
        const failed = columns.filter((c) => c.status === 'failed');
        if (failed.length) {
            throw new Error(`Colonne fallite in ${tableId}: ${failed.map((c) => `${c.key} (${c.error || 'errore'})`).join(', ')}`);
        }
        if (columns.every((c) => c.status === 'available')) return;
        await sleep(1000);
    }
    throw new Error(`Timeout in attesa delle colonne di ${tableId}`);
}

async function setupDatabase() {
    try {
        await tablesDB.create({ databaseId: DB_ID, name: 'SwimWaveUp DB' });
        console.log('✅ Database creato');
    } catch (e) {
        if (!exists(e)) throw e;
        console.log('⏩ Database già esistente');
    }

    for (const table of schema) {
        const tableArgs = {
            databaseId: DB_ID, tableId: table.id, name: table.name,
            permissions: table.permissions, rowSecurity: true,
        };
        try {
            await tablesDB.createTable(tableArgs);
            console.log(`\n✅ Tabella creata: ${table.name}`);
        } catch (e) {
            if (!exists(e)) throw e;
            await tablesDB.updateTable(tableArgs);
            console.log(`\n🔒 Tabella ${table.name}: permessi riallineati`);
        }

        for (const column of table.attributes) {
            try {
                await createColumn(table.id, column);
                console.log(`   ➕ ${column.key}`);
            } catch (e) {
                if (!exists(e)) throw new Error(`Colonna ${table.id}.${column.key}: ${e.message}`);
            }
        }

        // Aspettiamo sempre: così un errore su una colonna emerge subito.
        await waitForColumns(table.id);
        for (const index of table.indexes) {
            try {
                await tablesDB.createIndex({ databaseId: DB_ID, tableId: table.id, ...index });
                console.log(`   🔎 indice ${index.key}`);
            } catch (e) {
                if (!exists(e)) throw new Error(`Indice ${table.id}.${index.key}: ${e.message}`);
            }
        }
    }
}

/**
 * Tabelle passate alla Function: le righe create in passato dai client hanno ancora
 * permessi di modifica del proprietario. Li togliamo (lettura dagli utenti resta
 * garantita dal permesso della tabella).
 */
async function lockClientWrites(tableId, keep = [Permission.read(Role.users())]) {
    let cursor = null;
    let changed = 0;
    for (;;) {
        const { rows } = await tablesDB.listRows({
            databaseId: DB_ID, tableId,
            queries: [Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
        });
        for (const row of rows) {
            const perms = row.$permissions || [];
            const stale = perms.some((p) => /^(update|delete)\(/.test(p)) || perms.some((p) => !keep.includes(p));
            if (stale) {
                await tablesDB.updateRow({ databaseId: DB_ID, tableId, rowId: row.$id, permissions: keep });
                changed++;
            }
        }
        if (rows.length < 100) break;
        cursor = rows[rows.length - 1].$id;
    }
    if (changed) console.log(`   🔐 ${tableId}: tolti i permessi di modifica dal client a ${changed} righe`);
}

/**
 * Righe create quando la Function dava ai client anche modifica o cancellazione
 * (commenti, annunci, candidature): restano solo i permessi di lettura.
 */
async function stripClientWrites(tableId) {
    let cursor = null;
    let changed = 0;
    for (;;) {
        const { rows } = await tablesDB.listRows({ databaseId: DB_ID, tableId, queries: [Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])] });
        for (const row of rows) {
            const perms = row.$permissions || [];
            const keep = perms.filter((p) => !/^(update|delete)\(/.test(p));
            if (keep.length !== perms.length) {
                await tablesDB.updateRow({ databaseId: DB_ID, tableId, rowId: row.$id, permissions: keep });
                changed++;
            }
        }
        if (rows.length < 100) break;
        cursor = rows[rows.length - 1].$id;
    }
    if (changed) console.log(`   🔐 ${tableId}: tolti modifica e cancellazione dal client a ${changed} righe`);
}

/** Link degli eventi online: dalla riga pubblica alla tabella riservata event_private. */
async function migrateEventLinks() {
    let cursor = null;
    let moved = 0;
    for (;;) {
        const { rows } = await tablesDB.listRows({ databaseId: DB_ID, tableId: 'swim_meets', queries: [Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])] });
        for (const row of rows) {
            if (!row.onlineUrl) continue;
            await tablesDB.upsertRow({ databaseId: DB_ID, tableId: 'event_private', rowId: row.$id, data: { onlineUrl: row.onlineUrl }, permissions: [] });
            await tablesDB.updateRow({ databaseId: DB_ID, tableId: 'swim_meets', rowId: row.$id, data: { onlineUrl: null } });
            moved++;
        }
        if (rows.length < 100) break;
        cursor = rows[rows.length - 1].$id;
    }
    if (moved) console.log(`   🔐 swim_meets: link di ${moved} eventi online resi riservati`);
}

/**
 * Profili creati prima di questa versione: email e telefono delle persone erano sul
 * profilo, leggibile da tutti gli utenti. Il telefono passa in private_info, l'email
 * viene tolta (resta nell'account) e la colonna smette di essere obbligatoria.
 */
async function migratePrivateInfo() {
    // Messaggi con solo un allegato: il testo non è più obbligatorio.
    try {
        await tablesDB.updateTextColumn({ databaseId: DB_ID, tableId: 'messages', key: 'content', required: false, xdefault: null });
    } catch (e) {
        if (!/already|not required|nothing|not found/i.test(e.message || '')) console.warn(`   ⚠️  Colonna messages.content: ${e.message}`);
    }
    try {
        await tablesDB.updateVarcharColumn({ databaseId: DB_ID, tableId: 'profiles', key: 'email', required: false, xdefault: null });
    } catch (e) {
        if (!/already|not required|nothing/i.test(e.message || '')) console.warn(`   ⚠️  Colonna profiles.email: ${e.message}`);
    }
    let cursor = null;
    let moved = 0;
    for (;;) {
        const { rows } = await tablesDB.listRows({ databaseId: DB_ID, tableId: 'profiles', queries: [Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])] });
        for (const row of rows) {
            const patch = {};
            if (row.email) patch.email = null;
            if (row.typingTo) patch.typingTo = null; // "sta scrivendo" ora è nella tabella typing, non sul profilo pubblico
            if (row.userType === 'professional' && row.phone) {
                await tablesDB.upsertRow({ databaseId: DB_ID, tableId: 'private_info', rowId: row.$id, data: { phone: row.phone }, permissions: [] });
                patch.phone = null;
            }
            if (Object.keys(patch).length) {
                await tablesDB.updateRow({ databaseId: DB_ID, tableId: 'profiles', rowId: row.$id, data: patch });
                moved++;
            }
        }
        if (rows.length < 100) break;
        cursor = rows[rows.length - 1].$id;
    }
    if (moved) console.log(`   🔐 profiles: email e telefono resi privati su ${moved} profili`);
}

/**
 * Il database contiene solo ciò che è nello schema qui sopra: tabelle, colonne, indici e bucket
 * che non ci sono più (residui di funzioni tolte) vengono eliminati. `PRUNE=report` li elenca
 * soltanto, `PRUNE=off` salta il passaggio. Gira dopo le migrazioni, che leggono ancora le colonne vecchie.
 */
const PRUNE_MODE = ['report', 'off'].includes(process.env.PRUNE) ? process.env.PRUNE : 'apply';
const pruned = [];
async function pruneDatabase() {
    if (PRUNE_MODE === 'off') return;
    const act = async (what, fn) => {
        pruned.push(what);
        if (PRUNE_MODE === 'apply') {
            await fn();
            console.log(`   🧹 ${what}`);
        } else console.log(`   (da eliminare) ${what}`);
    };
    const wanted = new Map(schema.map((t) => [t.id, t]));
    const tables = [];
    for (let offset = 0; ; offset += 100) {
        const page = await tablesDB.listTables({ databaseId: DB_ID, queries: [Query.limit(100), Query.offset(offset)] });
        tables.push(...page.tables);
        if (page.tables.length < 100) break;
    }
    for (const t of tables) {
        const def = wanted.get(t.$id);
        if (!def) {
            await act(`tabella ${t.$id}`, () => tablesDB.deleteTable({ databaseId: DB_ID, tableId: t.$id }));
            continue;
        }
        const keepIndexes = new Set(def.indexes.map((i) => i.key));
        const { indexes = [] } = await tablesDB.listIndexes({ databaseId: DB_ID, tableId: t.$id });
        for (const i of indexes) if (!keepIndexes.has(i.key)) await act(`indice ${t.$id}.${i.key}`, () => tablesDB.deleteIndex({ databaseId: DB_ID, tableId: t.$id, key: i.key }));
        const keepColumns = new Set(def.attributes.map((a) => a.key));
        const { columns = [] } = await tablesDB.listColumns({ databaseId: DB_ID, tableId: t.$id });
        for (const c of columns) if (!keepColumns.has(c.key)) await act(`colonna ${t.$id}.${c.key}`, () => tablesDB.deleteColumn({ databaseId: DB_ID, tableId: t.$id, key: c.key }));
    }
    const keepBuckets = new Set(buckets.map((b) => b.id));
    const { buckets: existing = [] } = await storage.listBuckets({ queries: [Query.limit(100)] });
    for (const b of existing) {
        if (keepBuckets.has(b.$id)) continue;
        // Un bucket fuori schema con dei file potrebbe ancora servire a immagini vecchie (foto profilo, post):
        // si elimina da solo solo se è vuoto; con file, solo con PRUNE_BUCKETS=force dopo averlo controllato.
        const { total = 0 } = await storage.listFiles({ bucketId: b.$id, queries: [Query.limit(1)] });
        if (total > 0 && process.env.PRUNE_BUCKETS !== 'force') {
            pruned.push(`bucket ${b.$id} "${b.name}" con ${total} file (non eliminato: serve PRUNE_BUCKETS=force)`);
            console.log(`   ⚠️  bucket ${b.$id} "${b.name}": ${total} file, lasciato`);
            continue;
        }
        await act(`bucket ${b.$id} "${b.name}"${total ? ` con ${total} file` : ' (vuoto)'}`, () => storage.deleteBucket({ bucketId: b.$id }));
    }
    if (!pruned.length) console.log('   ✨ Nessun residuo: il database corrisponde allo schema');
    else if (PRUNE_MODE === 'report') notice(`Residui nel database (PRUNE=report, non eliminati): ${pruned.join(', ')}`);
    else notice(`Database ripulito: ${pruned.join(', ')}`);
}

async function setupBuckets() {
    console.log('\n🗂️  Storage');
    for (const b of buckets) {
        const args = {
            bucketId: b.id, name: b.name, permissions: b.permissions || BUCKET_PERMISSIONS, fileSecurity: true,
            enabled: true, maximumFileSize: b.maxSizeMB * 1024 * 1024,
            allowedFileExtensions: b.extensions || ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm'],
        };
        try {
            await storage.createBucket(args);
            console.log(`   ✅ Bucket creato: ${b.name}`);
        } catch (e) {
            if (!exists(e)) throw e;
            await storage.updateBucket(args);
            console.log(`   🔒 Bucket ${b.name}: permessi riallineati`);
        }
    }
}

async function deployFunction() {
    console.log('\n⚙️  Function "api"');
    const settings = {
        functionId: FUNCTION_ID,
        name: 'SwimWaveUp API',
        runtime: process.env.APPWRITE_FUNCTION_RUNTIME || 'node-22',
        // Anche senza login, ma la Function accetta da ospiti solo le azioni pubbliche (PUBLIC_ACTIONS).
        execute: ['any'],
        // Le chiamate dell'app finiscono in pochi secondi; il margine serve al riepilogo settimanale programmato.
        timeout: 120,
        // Ogni ora: promemoria della sera prima (turni e colloqui) e pulizia dei segnali;
        // il riepilogo email parte solo il lunedì dalle 6 alle 18 UTC (deciso nel codice).
        schedule: '0 * * * *',
        entrypoint: 'src/main.js',
        commands: 'npm install --omit=dev',
        // users.write: eliminazione account; files.write: pulizia dei file dell'account eliminato.
        // messages.write: email di notifica tramite Appwrite Messaging.
        scopes: ['databases.read', 'tables.read', 'rows.read', 'rows.write', 'users.read', 'users.write', 'files.read', 'files.write', 'messages.write'],
        logging: true,
        enabled: true,
    };
    try {
        await functions.create(settings);
        console.log('   ✅ Function creata');
    } catch (e) {
        if (!exists(e)) throw e;
        await functions.update(settings);
        console.log('   🔄 Impostazioni aggiornate');
    }

    await setupFunctionVariables();

    // Impacchetta functions/api (senza node_modules) e la carica come nuova versione.
    const tmp = mkdtempSync(path.join(tmpdir(), 'swimwaveup-'));
    const archive = path.join(tmp, 'api.tar.gz');
    try {
        execFileSync('tar', ['-czf', archive, '--exclude=node_modules', '-C', path.join(ROOT, 'functions', 'api'), '.']);
        const deployment = await functions.createDeployment({
            functionId: FUNCTION_ID,
            code: InputFile.fromPath(archive, 'api.tar.gz'),
            activate: true,
            entrypoint: settings.entrypoint,
            commands: settings.commands,
        });
        console.log(`   🚀 Deploy avviato (${deployment.$id}): attendo la build…`);
        await waitForDeployment(deployment.$id);
        await verifyLiveFunction(deployment.$id);
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

/**
 * Aspetta che la build della Function sia pronta: finché non lo è, l'app
 * risponderebbe "Azione sconosciuta" alle funzioni nuove. Fallisce se la build fallisce.
 */
async function waitForDeployment(deploymentId) {
    const started = Date.now();
    for (;;) {
        const d = await functions.getDeployment({ functionId: FUNCTION_ID, deploymentId });
        if (d.status === 'ready') {
            console.log(`   ✅ Function aggiornata e attiva (${Math.round((Date.now() - started) / 1000)} s)`);
            return;
        }
        if (d.status === 'failed' || d.status === 'canceled') {
            console.error(d.buildLogs || '');
            throw new Error(`Build della Function non riuscita (${d.status}): vedi i log sopra o in Console → Functions.`);
        }
        if (Date.now() - started > 10 * 60_000) throw new Error('La build della Function sta impiegando più di 10 minuti: controlla in Console → Functions.');
        await new Promise((r) => setTimeout(r, 5000));
    }
}

/**
 * Controllo finale: la Function che risponde davvero deve essere quella appena caricata.
 * Se non lo è la attiva esplicitamente; se ancora non risponde, il deploy fallisce con un
 * messaggio chiaro (prima il sito poteva dire "Questa funzione è in aggiornamento" senza indizi).
 */
async function verifyLiveFunction(deploymentId) {
    const probe = async () => {
        const ex = await functions.createExecution({ functionId: FUNCTION_ID, body: JSON.stringify({ action: 'health' }), async: false, method: 'POST', headers: { 'content-type': 'application/json' } });
        try {
            return JSON.parse(ex.responseBody || '{}')?.data?.version || null;
        } catch {
            return null;
        }
    };
    let live;
    try {
        live = await probe();
    } catch (e) {
        notice(`⚠️ Function caricata ma non verificata (${e.message}). Progetto ${projectHint()}.`);
        return;
    }
    if (live !== DEPLOY_VERSION && typeof functions.updateFunctionDeployment === 'function') {
        await functions.updateFunctionDeployment({ functionId: FUNCTION_ID, deploymentId });
        await new Promise((r) => setTimeout(r, 5000));
        live = await probe();
    }
    if (live !== DEPLOY_VERSION) throw new Error(`La Function attiva non è quella appena caricata (risponde "${live || 'nessuna versione'}", attesa "${DEPLOY_VERSION}"). Controlla in Console → Functions → api → Deployments.`);
    notice(`✅ Function "api" versione ${DEPLOY_VERSION} attiva sul progetto ${projectHint()}. Il sito deve usare lo stesso progetto (VITE_APPWRITE_PROJECT_ID su Vercel).`);
}

/**
 * Variabili della Function: chiavi VAPID per le push (generate una volta e poi
 * conservate), indirizzo dell'app per i link nelle email, interruttore email.
 */
async function setupFunctionVariables() {
    const { variables } = await functions.listVariables({ functionId: FUNCTION_ID });
    const current = Object.fromEntries(variables.map((v) => [v.key, v]));
    const set = async (key, value, secret = false) => {
        if (value === undefined || value === null) return;
        const v = current[key];
        if (!v) await functions.createVariable({ functionId: FUNCTION_ID, variableId: ID.unique(), key, value: String(value), secret });
        // Le variabili segrete non si possono rileggere: se il valore è fornito, si riscrive.
        else if (v.secret || v.value !== String(value)) await functions.updateVariable({ functionId: FUNCTION_ID, variableId: v.$id, key, value: String(value), secret });
    };
    const env = process.env;
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
        await set('VAPID_PUBLIC_KEY', env.VAPID_PUBLIC_KEY);
        await set('VAPID_PRIVATE_KEY', env.VAPID_PRIVATE_KEY, true);
    } else if (!current.VAPID_PUBLIC_KEY || !current.VAPID_PRIVATE_KEY) {
        // Prima installazione: una coppia nuova. Cambiarla invaliderebbe i dispositivi già registrati.
        const keys = generateVapidKeys();
        if (current.VAPID_PUBLIC_KEY) await functions.deleteVariable({ functionId: FUNCTION_ID, variableId: current.VAPID_PUBLIC_KEY.$id });
        if (current.VAPID_PRIVATE_KEY) await functions.deleteVariable({ functionId: FUNCTION_ID, variableId: current.VAPID_PRIVATE_KEY.$id });
        delete current.VAPID_PUBLIC_KEY;
        delete current.VAPID_PRIVATE_KEY;
        await set('VAPID_PUBLIC_KEY', keys.publicKey);
        await set('VAPID_PRIVATE_KEY', keys.privateKey, true);
        console.log('   🔑 Chiavi per le notifiche push generate');
    }
    await setupBillingVariables(set, current);
    const appUrl = (env.APP_URL || '').replace(/\/$/, '');
    await set('APP_URL', appUrl || undefined);
    if (env.VAPID_SUBJECT || appUrl || !current.VAPID_SUBJECT) {
        await set('VAPID_SUBJECT', env.VAPID_SUBJECT || (appUrl.startsWith('https://') ? appUrl : 'mailto:privacy@swimin.app'));
    }
    // Se la variabile non è indicata (es. deploy automatico) si mantiene la scelta già fatta.
    const email = env.EMAIL_NOTIFICATIONS ? (env.EMAIL_NOTIFICATIONS === 'on' ? 'on' : 'off') : current.EMAIL_NOTIFICATIONS?.value || 'off';
    await set('EMAIL_NOTIFICATIONS', email);
    // Avvisi di errore: webhook facoltativo (Slack, Discord, Telegram) e id di chi riceve gli avvisi oltre agli admin.
    if (env.ALERT_WEBHOOK_URL) await set('ALERT_WEBHOOK_URL', env.ALERT_WEBHOOK_URL, true);
    if (env.ALERT_USER_IDS) await set('ALERT_USER_IDS', env.ALERT_USER_IDS);
    // Versione del codice caricato: la Function la restituisce con l'azione pubblica "health", per verificare il deploy.
    await set('APP_VERSION', DEPLOY_VERSION);
    console.log(`   ✉️  Email di notifica: ${email === 'on' ? 'attive' : 'spente (EMAIL_NOTIFICATIONS=on in .env.setup dopo aver configurato un provider)'}`);
}

/**
 * Pagamenti di SwimIn Premium. Con le chiavi in .env.setup (o nei secret di GitHub) crea
 * prezzi Stripe e piani PayPal, i webhook verso la Function (se c'è FUNCTION_URL) e
 * salva gli identificativi come variabili della Function. Senza chiavi non fa nulla.
 */
async function setupBillingVariables(set, current) {
    const env = process.env;
    const fnUrl = (env.FUNCTION_URL || '').replace(/\/$/, '');
    if (env.STRIPE_SECRET_KEY) {
        const { prices, webhookSecret } = await provisionStripe(env.STRIPE_SECRET_KEY, { webhookUrl: fnUrl ? `${fnUrl}/webhooks/stripe` : undefined });
        await set('STRIPE_SECRET_KEY', env.STRIPE_SECRET_KEY, true);
        for (const [k, id] of Object.entries(prices)) await set(`STRIPE_PRICE_${k.toUpperCase()}`, id);
        const secret = env.STRIPE_WEBHOOK_SECRET || webhookSecret;
        if (secret) await set('STRIPE_WEBHOOK_SECRET', secret, true);
        console.log(`   💳 Stripe: prezzi pronti${secret || current.STRIPE_WEBHOOK_SECRET ? ', webhook configurato' : ' (manca il webhook: imposta FUNCTION_URL e rilancia)'}`);
    }
    if (env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET) {
        const mode = env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox';
        const { plans, webhookId } = await provisionPaypal({ clientId: env.PAYPAL_CLIENT_ID, secret: env.PAYPAL_SECRET, mode, webhookUrl: fnUrl ? `${fnUrl}/webhooks/paypal` : undefined });
        await set('PAYPAL_CLIENT_ID', env.PAYPAL_CLIENT_ID);
        await set('PAYPAL_SECRET', env.PAYPAL_SECRET, true);
        await set('PAYPAL_MODE', mode);
        for (const [k, id] of Object.entries(plans)) await set(`PAYPAL_PLAN_${k.toUpperCase()}`, id);
        if (webhookId) await set('PAYPAL_WEBHOOK_ID', webhookId);
        console.log(`   🅿️  PayPal (${mode}): piani pronti${webhookId || current.PAYPAL_WEBHOOK_ID ? ', webhook configurato' : ' (manca il webhook: imposta FUNCTION_URL e rilancia)'}`);
    }
}

async function main() {
    // Solo pulizia (workflow "Pulizia database"): niente schema né deploy.
    if (process.argv.includes('--prune-only')) {
        phase = 'pulizia dei residui';
        console.log(`🧹 Residui fuori schema (${PRUNE_MODE === 'report' ? 'solo elenco' : 'eliminazione'})`);
        await pruneDatabase();
        return;
    }
    console.log('🚀 Configurazione Appwrite per SwimWaveUp…');
    phase = 'database (tabelle, colonne, indici)';
    await setupDatabase();
    phase = 'migrazione dei dati privati';
    await migratePrivateInfo();
    phase = 'permessi delle righe esistenti';
    for (const t of ['profiles', 'swim_meets', 'posts', 'live_rooms']) await lockClientWrites(t);
    // Bacheca e turni: nessun permesso sulle righe, si leggono solo tramite la Function.
    for (const t of ['announcements', 'shifts']) await lockClientWrites(t, []);
    for (const t of ['comments', 'jobs', 'applications']) await stripClientWrites(t);
    await migrateEventLinks();
    phase = 'bucket di storage';
    await setupBuckets();
    phase = 'pulizia dei residui (tabelle, colonne, indici, bucket fuori schema)';
    console.log('\n🧹 Residui fuori schema');
    await pruneDatabase();
    phase = 'Function api';
    if (!process.argv.includes('--skip-function')) await deployFunction();
    console.log('\n🎉 Setup completato.');
}

main().catch((e) => {
    const detail = [e.message, e.code && `codice ${e.code}`, e.type].filter(Boolean).join(' · ');
    console.error(`\n❌ Setup interrotto (fase: ${phase}):`, detail);
    if (e.response) console.error(typeof e.response === 'string' ? e.response : JSON.stringify(e.response));
    annotate(`Fase: ${phase}\n${detail}`);
    process.exit(1);
});
