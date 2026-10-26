import { ExecutionMethod, ID, Models, Permission, Query, Role } from 'appwrite';
import { databases, functions } from '@/services/appwrite';
import { storageService } from '@/services/storage';
import { getPostContent } from '@/utils/postMedia';
import { requestPremium } from '@/services/premiumPrompt';
import { isJobOpen } from '@/utils/jobs';
import { APPWRITE_CONFIG } from '@/config/constants';
import type { Audience } from '@/utils/premium';
import type { 
    UserProfile, 
    StructureProfile, 
    Post, 
    Job, 
    Application, 
    Connection,
    Review,
    Certification,
    Like,
    CommentLike,
    Follow,
    Group,
    GroupMember,
    GroupCategory,
    GroupPrivacy,
    PollVote,
    Comment,
    Message,
    EnrichedPost,
    SquadAnnouncement,
    SquadShift,
    Facility,
    AppNotification,
    LiveRoom,
    SwimMeet,
    EventType,
    AppwriteDocument,
    Endorsement,
    LiveMessage,
    SavedItem,
} from '@/types/types';

export interface EventInput {
    title: string;
    description: string;
    type: EventType;
    date: string;
    time: string;
    endTime?: string;
    isOnline?: boolean;
    onlineUrl?: string;
    city: string;
    province?: string;
    address?: string;
    price?: number;
    maxParticipants?: number | null;
    cover?: string;
    groupId?: string;
}

export interface GroupInput {
    name: string;
    description: string;
    rules?: string;
    category: GroupCategory;
    privacy: GroupPrivacy;
    province?: string;
    cover?: string;
}

const { databaseId, collections } = APPWRITE_CONFIG;

const FACILITIES_COLLECTION = (collections as any).facilities || 'facilities_mock_id';
const NOTIFICATIONS_COLLECTION = (collections as any).notifications || 'notifications_mock_id';
const LIVE_ROOMS_COLLECTION = (collections as any).live_rooms || 'live_rooms_mock_id';
const SWIM_MEETS_COLLECTION = (collections as any).swim_meets || 'swim_meets_mock_id'; // 🟢 NUOVA COSTANTE

type Profile = UserProfile | StructureProfile;

export type ConnectionStatus =
    | { state: 'none' }
    | { state: 'sent' }
    | { state: 'received'; connectionId: string }
    | { state: 'connected' };
export type ReportTarget = 'post' | 'comment' | 'profile' | 'job' | 'facility' | 'review';
export type ReportReason = 'spam' | 'molestie' | 'contenuto_inappropriato' | 'falso_profilo' | 'offerta_ingannevole' | 'altro';

const profileDisplayName = (p: Profile) =>
    p.userType === 'professional'
        ? `${(p as UserProfile).firstName || ''} ${(p as UserProfile).lastName || ''}`.trim() || 'Un utente'
        : (p as StructureProfile).structureName || 'Una struttura';

// ==========================================
// FUNCTION "api" (lato server)
// Le operazioni che modificano dati di altri utenti non sono permesse dal
// client: passano dalla Function, che verifica chi chiama e cosa può fare.
// ==========================================
const API_FUNCTION_ID = 'api';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

async function callApi<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    try {
        return await callApiOnce<T>(action, params);
    } catch (err) {
        // Subito dopo un deploy la nuova versione della Function può impiegare qualche secondo ad attivarsi: un secondo tentativo.
        if (!(err instanceof ApiOutdatedError)) throw err;
        await new Promise((r) => setTimeout(r, 2500));
        return await callApiOnce<T>(action, params);
    }
}

async function callApiOnce<T>(action: string, params: Record<string, unknown>): Promise<T> {
    // "action" è il nome dell'azione: un parametro con lo stesso nome lo sovrascriverebbe e la Function risponderebbe "Azione sconosciuta".
    if ('action' in params) throw new Error(`callApi("${action}"): il parametro "action" è riservato, usa un altro nome (es. "decision").`);
    const execution = await functions.createExecution(
        API_FUNCTION_ID,
        JSON.stringify({ action, ...params }),
        false,
        '/',
        ExecutionMethod.POST,
        { 'content-type': 'application/json' }
    );
    let payload: ApiResponse<T>;
    try {
        payload = JSON.parse(execution.responseBody || '{}');
    } catch {
        throw new Error('Risposta del server non valida. Riprova tra poco.');
    }
    if (!payload.ok) {
        // La Function su Appwrite è più vecchia del sito: va ridistribuita (npm run setup-db).
        if (/^Azione sconosciuta/.test(payload.error || '')) {
            console.error(`Function "api" non aggiornata: manca l'azione "${action}". Controlla che il sito e il deploy (GitHub → Deploy Appwrite) usino lo stesso progetto Appwrite, poi lancia npm run setup-db.`);
            throw new ApiOutdatedError(action);
        }
        const err = new ApiError(payload.error || 'Operazione non riuscita.', payload.code);
        // Azione riservata a Premium: si apre l'invito a passare a Premium, ovunque sia partita.
        if (payload.code === 'premium_required' || payload.code === 'inmail_exhausted') requestPremium(err.message, payload.code);
        throw err;
    }
    return payload.data;
}

/** Errore restituito dalla Function, con un codice facoltativo (es. 'premium_required'). */
export class ApiError extends Error {
    constructor(message: string, public code?: string) {
        super(message);
        this.name = 'ApiError';
    }
}

/** Il server non conosce ancora l'azione: il sito è stato aggiornato prima della Function. */
export class ApiOutdatedError extends Error {
    constructor(public action: string) {
        super('Questa funzione è in aggiornamento: riprova tra qualche minuto.');
        this.name = 'ApiOutdatedError';
    }
}

/** Permessi di un documento creato dal client: leggibile dagli utenti, modificabile solo dal proprietario. */
export interface LiveAccess {
    url: string;
    token: string;
    canPublish: boolean;
    endsAt: string;
}
export interface LiveIngress {
    ingressId: string;
    kind: 'rtmp' | 'whip';
    serverUrl: string;
    streamKey: string;
}
export interface AdminPlan {
    key: string;
    audience: Audience;
    period: 'month' | 'year';
    /** Centesimi di euro, IVA inclusa. */
    amount: number;
    defaultAmount: number;
    updatedAt: string | null;
    subscribers: number;
    stripe: boolean;
    paypal: boolean;
}
export interface AdminPlans {
    plans: AdminPlan[];
    providers: { stripe: boolean; paypal: boolean };
    limits: { min: number; max: number };
    changed?: string[];
    warnings?: string[];
}
export interface AdminOverview { people: number; structures: number; posts: number; openReports: number; errors24h: number; pendingCerts: number }
export interface AdminReport {
    $id: string;
    $createdAt: string;
    reporterId: string;
    reporterName: string;
    targetType: string;
    targetId: string;
    reason: string;
    details?: string;
    status: string;
    resolution?: string;
    note?: string;
    target: { exists: boolean; authorId?: string; authorName?: string; suspended?: boolean; text?: string; status?: string };
}
export interface ClientErrorRow { $id: string; $createdAt: string; userId: string; message: string; stack?: string; url?: string; userAgent?: string }
export interface AdminUserRow { $id: string; name: string; email: string; userType: string; personType?: string; city?: string; suspended: boolean }


export interface BillingStatus {
    premium: boolean;
    premiumUntil: string | null;
    source: 'trial' | 'stripe' | 'paypal' | 'admin' | null;
    trialAvailable: boolean;
    trialDays: number;
    audience: Audience;
    prices: { month: number; year: number };
    providers: { stripe: boolean; paypal: boolean };
    inmailCredits: number;
    subscription: { provider: 'stripe' | 'paypal'; status: string; period: 'month' | 'year' | ''; currentPeriodEnd: string; cancelAtPeriodEnd: boolean } | null;
}
export interface ProfileStats {
    viewsLast30: number;
    viewsPerDay: { day: string; views: number }[];
    viewersByKind: { strutture: number; professionisti: number; appassionati: number };
    anonymousViews: number;
    posts: { id: string; createdAt: string; text: string; reactions: number; comments: number; reposts: number }[];
    totals: { reactions: number; comments: number; reposts: number };
}
export interface PublicJob {
    id: string; title: string; description: string; role: string; contractType: string; city: string; province: string;
    salaryMin: number | null; salaryMax: number | null; workingHours: string; requirements: string[]; qualifications: string[];
    isSOS: boolean; sosDate: string; sosShift: string; structureId: string; structureName: string; structureLogo: string;
    postedAt: string; expiresAt: string;
}
export type RecommendationRelationship = 'collega' | 'responsabile' | 'collaboratore' | 'allievo' | 'struttura' | 'altro';
export interface Recommendation {
    $id: string; $createdAt: string; profileId: string; authorId: string; relationship: RecommendationRelationship; content: string;
    status: 'pending' | 'published' | 'hidden'; author: { $id: string; name: string; avatar: string; headline: string };
}
export interface JobAlert { $id: string; $createdAt: string; userId: string; query?: string; province?: string; contractType?: string; sosOnly?: boolean }
export interface PublicProfile {
    kind: 'person' | 'structure';
    id: string;
    name: string;
    headline: string;
    enthusiast?: boolean;
    city: string;
    province: string;
    avatar: string;
    cover: string;
    bio: string;
    skills?: string[];
    languages?: string[];
    experiences?: { title: string; company: string; startDate: string; endDate: string; current: boolean }[];
    certifications?: { name: string; issuer: string; category: string; verified: boolean }[];
    connections?: number;
    address?: string;
    website?: string;
    phone?: string;
    services?: string[];
    poolLength?: number | null;
    lanes?: number | null;
    poolSetting?: string | null;
    rating?: { average: number; count: number } | null;
}
export interface TeamMember {
    $id: string; userId: string; firstName: string; lastName: string; title: string; avatar: string; city: string;
    isOnline: boolean; certificationsList: string[];
}
export interface TeamBoard {
    role: 'admin' | 'staff';
    /** Solo per gli amministratori: persone massime nello staff con il piano Base (null = senza limiti). */
    staffLimit?: number | null;
    members: TeamMember[];
    announcements: SquadAnnouncement[];
    shifts: SquadShift[];
    /** Messaggi della chat staff non ancora letti. */
    chatUnread?: number;
}
export interface StaffMessage { $id: string; $createdAt: string; structureId: string; authorId: string; content: string }
export interface StaffChatMember { $id: string; name: string; avatar: string; role: 'admin' | 'staff' }
export type NotifyCategory = 'messages' | 'connections' | 'social' | 'jobs' | 'sos' | 'general' | 'digest';
export type NotificationPrefs = Record<NotifyCategory, { push: boolean; email: boolean }>;
export interface PushConfig {
    /** Chiave VAPID pubblica, null se le push non sono configurate sul server. */
    publicKey: string | null;
    emailAvailable: boolean;
    devices: number;
    prefs: NotificationPrefs;
    categories: NotifyCategory[];
}

export const databaseService = {
    // ==========================================
    // PROFILI & PRESENZA
    // ==========================================
    /** Crea il profilo alla registrazione (lato server: email e id vengono dall'account). */
    async initializeProfile(
        _userId: string,
        _email: string,
        data: { userType: 'professional' | 'structure'; personType?: 'professional' | 'enthusiast'; firstName?: string; lastName?: string; structureName?: string }
    ) {
        return await callApi<Profile>('initProfile', data as Record<string, unknown>);
    },

    async getProfile(userId: string): Promise<Profile> {
        return await databases.getDocument<Profile>(databaseId, collections.profiles, userId);
    },

    /**
     * Modifica del proprio profilo. Passa dalla Function, che accetta solo i campi
     * modificabili e li valida: il client non ha permessi di scrittura sui profili.
     */
    async updateProfile(_userId: string, data: Partial<Profile>) {
        const clean: Record<string, unknown> = { ...data };
        for (const k of Object.keys(clean)) if (k.startsWith('$')) delete clean[k];
        return await callApi<Profile>('updateMyProfile', clean);
    },

    async updatePresence(_userId: string, isOnline: boolean) {
        try {
            return await callApi('setPresence', { isOnline });
        } catch (error) {
            console.warn('updatePresence non riuscito:', error);
        }
    },

    // ==========================================
    // CHAT & MESSAGING
    // ==========================================
    // conversationId e senderId sono calcolati dal server: restano nella firma per compatibilità.
    async sendMessage(_conversationId: string, _senderId: string, receiverId: string, content: string, extra: { attachments?: string[]; replyToId?: string | null } = {}) {
        return await callApi<Message>('sendMessage', {
            receiverId,
            content,
            ...(extra.attachments?.length ? { attachments: extra.attachments } : {}),
            ...(extra.replyToId ? { replyToId: extra.replyToId } : {}),
        });
    },
    async reactMessage(messageId: string, reaction: string | null) {
        return await callApi<{ reactions: Record<string, string> }>('reactMessage', { messageId, reaction });
    },
    async deleteMessage(messageId: string) {
        return await callApi<{ deleted: boolean }>('deleteMessage', { messageId });
    },

    async setTypingStatus(_userId: string, targetUserId: string | null) {
        try {
            return await callApi('setPresence', { typingTo: targetUserId });
        } catch (error) {
            console.warn('setTypingStatus non riuscito:', error);
        }
    },

    async markMessagesAsRead(conversationId: string, currentUserId: string) {
        try {
            // Controllo locale (economico) prima di invocare la Function.
            const unread = await databases.listDocuments<Message>(databaseId, collections.messages, [
                Query.equal('conversationId', conversationId), 
                Query.equal('receiverId', currentUserId), 
                Query.equal('isRead', false),
                Query.limit(1)
            ]);
            if (unread.total === 0) return;
            await callApi('markConversationRead', { conversationId });
        } catch (error) {
            console.warn('markMessagesAsRead non riuscito:', error);
        }
    },

    // ==========================================
    // NOTIFICHE
    // ==========================================
    async getUnreadNotifications(userId: string) {
        try {
            const res = await databases.listDocuments<AppNotification>(databaseId, NOTIFICATIONS_COLLECTION, [
                Query.equal('userId', userId),
                Query.equal('isRead', false),
                Query.orderDesc('$createdAt')
            ]);
            return res.documents;
        } catch (error) { 
            return []; 
        }
    },
    
    /** Ultime notifiche (lette e non lette) per il centro notifiche. */
    async getNotifications(userId: string, limit = 50) {
        const res = await databases.listDocuments<AppNotification>(databaseId, NOTIFICATIONS_COLLECTION, [
            Query.equal('userId', userId),
            Query.orderDesc('$createdAt'),
            Query.limit(limit),
        ]);
        return res.documents;
    },

    async markAllNotificationsRead() {
        return await callApi<{ updated: number }>('markAllNotificationsRead');
    },

    // ==========================================
    // MODERAZIONE
    // ==========================================
    async listBlockRelations() {
        return await callApi<{ blocked: string[]; muted: string[]; blockedBy: string[]; isAdmin: boolean }>('listBlockRelations');
    },
    async blockUser(userId: string, kind: 'block' | 'mute' = 'block') {
        return await callApi('blockUser', { userId, kind });
    },
    async unblockUser(userId: string, kind: 'block' | 'mute' = 'block') {
        return await callApi('unblockUser', { userId, kind });
    },
    /** Registra un errore del client per il pannello admin (mai bloccante). */
    async logClientError(error: { message: string; stack?: string; url?: string }) {
        try {
            await callApi('logClientError', { ...error, userAgent: navigator.userAgent });
        } catch (e) {
            console.warn('Errore non registrato:', e);
        }
    },
    async adminOverview() {
        return await callApi<AdminOverview>('adminOverview');
    },
    async adminListReports(status: 'open' | 'resolved' | 'dismissed' = 'open') {
        return await callApi<AdminReport[]>('adminListReports', { status });
    },
    async adminResolveReport(reportId: string, decision: 'dismiss' | 'remove' | 'suspend', note = '') {
        return await callApi<{ ok: boolean; closed: number }>('adminResolveReport', { reportId, decision, note });
    },
    async adminSetSuspended(userId: string, suspended: boolean) {
        return await callApi('adminSetSuspended', { userId, suspended });
    },
    async adminListErrors() {
        return await callApi<ClientErrorRow[]>('adminListErrors');
    },
    async adminSearchUsers(query: string) {
        return await callApi<AdminUserRow[]>('adminSearchUsers', { query });
    },

    async requestCertVerification(certId: string, fileId: string) {
        return await callApi<Certification>('requestCertVerification', { certId, fileId });
    },
    async adminListPendingCerts() {
        return await callApi<{ profileId: string; name: string; city: string; cert: Certification }[]>('adminListPendingCerts');
    },
    async adminGetCertDocument(profileId: string, certId: string) {
        return await callApi<{ mimeType: string; name: string; dataUrl: string }>('adminGetCertDocument', { profileId, certId });
    },
    async adminVerifyCert(profileId: string, certId: string, approve: boolean, note = '') {
        return await callApi<Certification>('adminVerifyCert', { profileId, certId, approve, note });
    },

    /** Scheda pubblica di un profilo: funziona anche senza login (azione pubblica della Function). */
    async getPublicProfile(id: string) {
        return await callApi<PublicProfile>('publicProfile', { id });
    },
    /** Annuncio visibile anche senza account (pagina /offerte/:id). */
    async getPublicJob(id: string) {
        return await callApi<PublicJob>('publicJob', { id });
    },
    // ---------------- REFERENZE ----------------
    async listRecommendations(profileId: string) {
        return await callApi<Recommendation[]>('listRecommendations', { profileId });
    },
    async writeRecommendation(profileId: string, relationship: RecommendationRelationship, content: string) {
        return await callApi<Recommendation>('writeRecommendation', { profileId, relationship, content });
    },
    async requestRecommendation(profileId: string, message = '') {
        return await callApi<{ requested: boolean; already?: boolean }>('requestRecommendation', { profileId, message });
    },
    async respondRecommendation(recommendationId: string, action: 'publish' | 'hide' | 'delete') {
        return await callApi<Recommendation | { deleted: boolean }>('respondRecommendation', { recommendationId, decision: action });
    },
    async deleteRecommendation(recommendationId: string) {
        return await callApi<{ deleted: boolean }>('deleteRecommendation', { recommendationId });
    },
    // ---------------- AVVISI DI LAVORO ----------------
    async listJobAlerts() {
        return await callApi<JobAlert[]>('listJobAlerts');
    },
    async createJobAlert(alert: { query?: string; province?: string; contractType?: string; sosOnly?: boolean }) {
        return await callApi<JobAlert>('createJobAlert', alert);
    },
    async deleteJobAlert(alertId: string) {
        return await callApi<{ deleted: boolean }>('deleteJobAlert', { alertId });
    },

    /** Email e telefono di un profilo, se chi chiama può vederli (decide il server). */
    async getContactInfo(profileId: string) {
        return await callApi<{ phone: string; email: string; allowed: boolean }>('getContactInfo', { profileId });
    },

    // ---------------- NOTIFICHE PUSH ED EMAIL ----------------
    async getPushConfig() {
        return await callApi<PushConfig>('getPushConfig');
    },
    async savePushSubscription(sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) {
        return await callApi<{ saved: boolean }>('savePushSubscription', sub);
    },
    async deletePushSubscription(endpoint: string) {
        return await callApi<{ deleted: boolean }>('deletePushSubscription', { endpoint });
    },
    async updateNotificationPrefs(prefs: NotificationPrefs) {
        return await callApi<NotificationPrefs>('updateNotificationPrefs', { prefs });
    },
    async sendTestPush() {
        return await callApi<{ push: number; email: boolean }>('sendTestPush');
    },

    async withdrawApplication(applicationId: string) {
        return await callApi<{ withdrawn: boolean }>('withdrawApplication', { applicationId });
    },

    async reportContent(report: { targetType: ReportTarget; targetId: string; reason: ReportReason; details?: string }) {
        return await callApi<{ reported: boolean; duplicate?: boolean }>('reportContent', report);
    },

    /** Raccoglie i dati dell'utente leggibili dal client, per l'esportazione (portabilità GDPR). */
    async exportMyData(userId: string) {
        const all = async <T extends AppwriteDocument>(collectionId: string, queries: string[]) => {
            const out: T[] = [];
            let cursor: string | null = null;
            for (;;) {
                const res: Models.DocumentList<T> = await databases.listDocuments<T>(databaseId, collectionId, [
                    ...queries, Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : []),
                ]);
                out.push(...res.documents);
                if (res.documents.length < 100) return out;
                cursor = res.documents[res.documents.length - 1].$id;
            }
        };
        const strip = <T extends AppwriteDocument>(rows: T[]) =>
            rows.map(({ $permissions, $databaseId, $collectionId, ...rest }) => rest);

        const [profile, contact, posts, comments, likes, applications, notifications] = await Promise.all([
            this.getProfile(userId),
            // Email e telefono non sono sul profilo pubblico: li chiediamo al server.
            this.getContactInfo(userId).catch(() => null),
            all<Post>(collections.posts, [Query.equal('authorId', userId)]),
            all<Comment>(collections.comments, [Query.equal('authorId', userId)]),
            all<Like>(collections.likes, [Query.equal('userId', userId)]),
            all<Application>(collections.applications, [Query.equal('applicantId', userId)]),
            all<AppNotification>(NOTIFICATIONS_COLLECTION, [Query.equal('userId', userId)]),
        ]);
        return {
            exportedAt: new Date().toISOString(),
            profile: { ...strip([profile])[0], email: contact?.email || undefined, phone: contact?.phone || (profile as Profile).phone || undefined },
            posts: strip(posts),
            comments: strip(comments),
            likes: likes.map((l) => ({ postId: l.postId, date: l.$createdAt })),
            applications: strip(applications),
            notifications: strip(notifications),
        };
    },

    /** Elimina definitivamente l'account e i dati collegati (lato server). */
    async deleteAccount(confirmation: string) {
        return await callApi<{ deleted: boolean }>('deleteAccount', { confirmation });
    },

    // ==========================================
    // ELEMENTI SALVATI (privati)
    // ==========================================
    async getSavedItems(userId: string) {
        const res = await databases.listDocuments<SavedItem>(databaseId, collections.saves, [
            Query.equal('userId', userId),
            Query.orderDesc('$createdAt'),
            Query.limit(500),
        ]);
        return res.documents;
    },

    async saveItem(userId: string, targetType: SavedItem['targetType'], targetId: string) {
        return await databases.createDocument<SavedItem>(databaseId, collections.saves, ID.unique(), { userId, targetType, targetId }, [
            Permission.read(Role.user(userId)),
            Permission.delete(Role.user(userId)),
        ]);
    },

    async unsaveItem(saveId: string) {
        await databases.deleteDocument(databaseId, collections.saves, saveId);
    },

    async getPostsByIds(ids: string[], currentUserId: string) {
        if (ids.length === 0) return [];
        const res = await databases.listDocuments<Post>(databaseId, collections.posts, [Query.equal('$id', ids.slice(0, 100)), Query.limit(100)]);
        return this.withLikedByMe(res.documents, currentUserId);
    },

    async getJobsByIds(ids: string[]) {
        if (ids.length === 0) return [] as Job[];
        const res = await databases.listDocuments<Job>(databaseId, collections.jobs, [Query.equal('$id', ids.slice(0, 100)), Query.limit(100)]);
        return res.documents;
    },

    // ==========================================
    // COMPETENZE
    // ==========================================
    async getEndorsements(profileId: string) {
        const res = await databases.listDocuments<Endorsement>(databaseId, collections.endorsements, [
            Query.equal('profileId', profileId),
            Query.limit(500),
        ]);
        return res.documents;
    },

    async toggleEndorsement(profileId: string, skill: string) {
        return await callApi<{ endorsed: boolean }>('toggleEndorsement', { profileId, skill });
    },

    async markNotificationAsRead(notificationId: string) {
        try { 
            return await databases.updateDocument(databaseId, NOTIFICATIONS_COLLECTION, notificationId, { isRead: true }); 
        } catch (error) { 
            return null; 
        }
    },

    // ==========================================
    // 🌊 FEED E POSTS
    // ==========================================
    /** Crea un post (lato server: l'autore è sempre l'utente che chiama). */
    async createPost(postData: Pick<Post, 'content' | 'postType'> & Partial<Pick<Post, 'media' | 'category'>> & { poll?: { options: string[]; days: number } | null; groupId?: string | null }) {
        return await callApi<Post>('createPost', {
            content: postData.content,
            media: postData.media || [],
            postType: postData.postType,
            category: postData.category,
            poll: postData.poll || null,
            ...(postData.groupId ? { groupId: postData.groupId } : {}),
        });
    },

    // ---------------- GRUPPI ----------------
    /** Gruppi più numerosi (scoperta); il filtro per testo e categoria è nel client. */
    async listGroups(limit = 100) {
        const res = await databases.listDocuments<Group>(databaseId, collections.groups, [Query.orderDesc('membersCount'), Query.limit(limit)]);
        return res.documents;
    },
    async getGroup(groupId: string) {
        return await databases.getDocument<Group>(databaseId, collections.groups, groupId);
    },
    /** Le mie iscrizioni (anche in attesa): stato per gruppo. */
    async getMyGroupMemberships(userId: string) {
        const res = await databases.listDocuments<GroupMember>(databaseId, collections.group_members, [Query.equal('userId', userId), Query.limit(200)]);
        return res.documents;
    },
    async getGroupsByIds(ids: string[]) {
        if (!ids.length) return [];
        const res = await databases.listDocuments<Group>(databaseId, collections.groups, [Query.equal('$id', ids.slice(0, 100)), Query.limit(100)]);
        return res.documents;
    },
    async getGroupMembers(groupId: string) {
        const res = await databases.listDocuments<GroupMember>(databaseId, collections.group_members, [Query.equal('groupId', groupId), Query.orderAsc('$createdAt'), Query.limit(500)]);
        return res.documents;
    },
    async getGroupPosts(groupId: string, currentUserId: string, limit = 30) {
        const res = await databases.listDocuments<Post>(databaseId, collections.posts, [Query.equal('groupId', groupId), Query.orderDesc('$createdAt'), Query.limit(limit)]);
        return this.withLikedByMe(res.documents, currentUserId);
    },
    async createGroup(data: GroupInput) {
        return await callApi<Group>('createGroup', { ...data });
    },
    async updateGroup(groupId: string, data: Partial<GroupInput>) {
        return await callApi<Group>('updateGroup', { groupId, ...data });
    },
    async joinGroup(groupId: string) {
        return await callApi<{ status: 'active' | 'pending' }>('joinGroup', { groupId });
    },
    async leaveGroup(groupId: string) {
        return await callApi<{ left: boolean }>('leaveGroup', { groupId });
    },
    async moderateGroupMember(groupId: string, userId: string, action: 'approve' | 'reject' | 'remove' | 'ban' | 'promote' | 'demote') {
        return await callApi<{ membersCount: number }>('moderateMember', { groupId, userId, decision: action });
    },
    async deleteGroup(groupId: string) {
        return await callApi<{ deleted: boolean }>('deleteGroup', { groupId });
    },

    // ---------------- HASHTAG, SONDAGGI, SEGUI ----------------
    async votePoll(postId: string, option: number | null) {
        return await callApi<{ myVote: number | null; counts: number[] }>('votePoll', { postId, option });
    },
    async getTrends() {
        return await callApi<{ tag: string; posts: number }[]>('getTrends');
    },
    async toggleFollow(profileId: string) {
        return await callApi<{ following: boolean; followersCount: number }>('toggleFollow', { profileId });
    },
    async isFollowing(followerId: string, followeeId: string) {
        const res = await databases.listDocuments<Follow>(databaseId, collections.follows, [Query.equal('followerId', followerId), Query.equal('followeeId', followeeId), Query.limit(1)]);
        return res.total > 0;
    },
    /** Chi seguo (fino a 100): i loro post entrano nel mio feed. */
    async getFollowingIds(userId: string) {
        const res = await databases.listDocuments<Follow>(databaseId, collections.follows, [Query.equal('followerId', userId), Query.limit(100)]);
        return res.documents.map((f) => f.followeeId);
    },
    async getFollowers(profileId: string) {
        const res = await databases.listDocuments<Follow>(databaseId, collections.follows, [Query.equal('followeeId', profileId), Query.orderDesc('$createdAt'), Query.limit(100)]);
        return this.getProfilesByIds(res.documents.map((f) => f.followerId));
    },
    async getPostsByHashtag(tag: string, currentUserId: string, limit = 30) {
        const res = await databases.listDocuments<Post>(databaseId, collections.posts, [Query.contains('hashtags', [tag.toLowerCase()]), Query.orderDesc('$createdAt'), Query.limit(limit)]);
        return this.withLikedByMe(res.documents, currentUserId);
    },
    /** Persone e strutture da menzionare: prima i collegamenti, poi gli altri. */
    async searchMentionCandidates(term: string, connections: string[] = []) {
        const t = term.trim();
        if (t.length < 1) return (await this.getProfilesByIds(connections.slice(0, 8))).slice(0, 8);
        const res = await databases.listDocuments<Profile>(databaseId, collections.profiles, [
            Query.or([Query.startsWith('firstName', t), Query.startsWith('lastName', t), Query.startsWith('structureName', t), Query.contains('firstName', t), Query.contains('structureName', t)]),
            Query.limit(20),
        ]);
        const mine = new Set(connections);
        return res.documents.filter((p) => !p.suspended).sort((a, b) => Number(mine.has(b.$id)) - Number(mine.has(a.$id))).slice(0, 8);
    },

    /**
     * Feed stile LinkedIn, paginato lato server.
     * - Post dei miei collegamenti e miei (filtro su authorId, ordinati per data).
     * - Solo in prima pagina: post di altri che un mio collegamento ha consigliato (like).
     * - Senza collegamenti: post più recenti di tutta la rete, per scoprire persone.
     */
    async getFeed(currentUserId: string, userConnections: string[], limit = 20, offset = 0, following: string[] = []): Promise<EnrichedPost[]> {
        // Appwrite accetta al massimo 100 valori in un filtro equal. Nel feed: io, i collegamenti e chi seguo.
        const authors = [...new Set([currentUserId, ...userConnections, ...following])].slice(0, 100);
        const hasNetwork = authors.length > 1;

        const response = await databases.listDocuments<Post>(databaseId, collections.posts, [
            ...(hasNetwork ? [Query.equal('authorId', authors)] : []),
            Query.isNull('groupId'), // i post dei gruppi restano nei gruppi
            Query.orderDesc('$createdAt'),
            Query.limit(limit),
            Query.offset(offset),
        ]);
        const posts: EnrichedPost[] = await this.withLikedByMe(response.documents, currentUserId);
        if (offset > 0 || !hasNetwork) return posts;

        try {
            const likesRes = await databases.listDocuments<Like>(databaseId, collections.likes, [
                Query.equal('userId', userConnections.slice(0, 100)),
                Query.orderDesc('$createdAt'),
                Query.limit(30),
            ]);
            const shown = new Set(posts.map(p => p.$id));
            const likeByPost = new Map<string, Like>();
            for (const like of likesRes.documents) {
                if (!shown.has(like.postId) && !likeByPost.has(like.postId)) likeByPost.set(like.postId, like);
            }
            if (likeByPost.size === 0) return posts;

            const recommendedRes = await databases.listDocuments<Post>(databaseId, collections.posts, [
                Query.equal('$id', [...likeByPost.keys()].slice(0, 10)),
                Query.limit(10),
            ]);
            const recommenderIds = [...new Set(recommendedRes.documents.map(p => likeByPost.get(p.$id)!.userId))];
            const recommenders = await this.getConnectionsProfiles(recommenderIds);
            const nameById = new Map(recommenders.map(p => [p.$id, profileDisplayName(p)]));

            const recommendedWithLikes = await this.withLikedByMe(recommendedRes.documents, currentUserId);
            const recommended: EnrichedPost[] = recommendedWithLikes
                .filter(p => !authors.includes(p.authorId) && !p.groupId)
                .map(p => {
                    const by = likeByPost.get(p.$id)!.userId;
                    return { ...p, recommendedBy: { id: by, name: nameById.get(by) || 'Un collegamento' } };
                });

            return [...posts, ...recommended].sort((a, b) => b.$createdAt.localeCompare(a.$createdAt));
        } catch (error) {
            // I consigliati sono un extra: se falliscono mostriamo comunque il feed.
            console.warn('Post consigliati non disponibili:', error);
            return posts;
        }
    },

    /** Aggiunge `likedByMe` ai post con una sola query sui like dell'utente. */
    async withLikedByMe(posts: Post[], userId: string): Promise<EnrichedPost[]> {
        if (posts.length === 0) return posts;
        try {
            const res = await databases.listDocuments<Like>(databaseId, collections.likes, [
                Query.equal('userId', userId),
                Query.equal('postId', posts.map(p => p.$id).slice(0, 100)),
                Query.limit(100),
            ]);
            const mine = new Map(res.documents.map((l) => [l.postId, l.reaction || 'consiglio']));
            // Voti ai sondaggi: ognuno legge solo i propri.
            const pollIds = posts.filter((p) => (p.pollOptions || []).length > 0).map((p) => p.$id);
            const votes = pollIds.length
                ? new Map(
                      (await databases.listDocuments<PollVote>(databaseId, collections.poll_votes, [Query.equal('userId', userId), Query.equal('postId', pollIds.slice(0, 100)), Query.limit(100)]).catch(() => ({ documents: [] as PollVote[] })))
                          .documents.map((v) => [v.postId, v.option])
                  )
                : new Map<string, number>();
            return posts.map((p) => ({ ...p, likedByMe: mine.has(p.$id), myReaction: mine.get(p.$id) || null, myVote: votes.has(p.$id) ? votes.get(p.$id)! : null }));
        } catch (error) {
            console.warn('Stato dei like non disponibile:', error);
            return posts;
        }
    },

    async getPost(postId: string, currentUserId?: string): Promise<EnrichedPost> {
        const post = await databases.getDocument<Post>(databaseId, collections.posts, postId);
        if (!currentUserId) return post;
        const [enriched] = await this.withLikedByMe([post], currentUserId);
        return enriched;
    },

    /** Modifica il testo di un proprio post (tramite la Function: contatori e autore non si toccano). */
    async updatePost(postId: string, data: Pick<Post, 'content'> & Partial<Pick<Post, 'category'>>) {
        return await callApi<Post>('updatePost', { postId, ...data });
    },

    /** Elimina un proprio post: prima i file caricati, poi post, like e commenti (Function). */
    async deletePost(post: Post) {
        const { media } = getPostContent(post);
        await callApi('deletePost', { postId: post.$id });
        await Promise.all(media.map(m => storageService.deleteByUrl(m.url)));
    },

    async deleteComment(commentId: string) {
        return await callApi('deleteComment', { commentId });
    },

    /** Restituisce se ora il post è consigliato e il numero aggiornato di like. */
    async toggleLike(postId: string, _userId: string) {
        return await callApi<{ liked: boolean; likesCount: number }>('toggleLike', { postId });
    },

    /** Reazione a un post: la stessa di nuovo la toglie, una diversa la sostituisce. */
    async react(postId: string, reaction: string | null) {
        try {
            return await callApi<{ reaction: string | null; liked: boolean; likesCount: number; reactionCounts: Record<string, number> }>('react', { postId, reaction });
        } catch (err) {
            // Function non ancora aggiornata: il semplice "consiglia" funziona comunque con l'azione vecchia.
            if (!(err instanceof ApiOutdatedError) || (reaction !== null && reaction !== 'consiglio')) throw err;
            const res = await callApi<{ liked: boolean; likesCount: number }>('toggleLike', { postId });
            return { reaction: res.liked ? 'consiglio' : null, liked: res.liked, likesCount: res.likesCount, reactionCounts: res.likesCount ? { consiglio: res.likesCount } : {} };
        }
    },

    async toggleCommentLike(commentId: string) {
        return await callApi<{ liked: boolean; likesCount: number }>('toggleCommentLike', { commentId });
    },

    /** Ripubblica con i propri collegamenti, eventualmente con un pensiero. */
    async repost(postId: string, content = '') {
        return await callApi<Post & { originalRepostsCount: number }>('repost', { postId, content });
    },

    async undoRepost(postId: string) {
        return await callApi<{ removed: number; repostsCount: number }>('undoRepost', { postId });
    },

    /** Ho già ripubblicato (senza pensiero) questo post? */
    async hasReposted(postId: string, userId: string) {
        const res = await databases.listDocuments<Post>(databaseId, collections.posts, [Query.equal('authorId', userId), Query.equal('repostOf', postId), Query.limit(5)]);
        return res.documents.some((p) => !p.content);
    },

    /** Visita di un profilo altrui (notifica al proprietario, decide il server). */
    async recordProfileView(profileId: string) {
        return await callApi<{ recorded: boolean }>('recordProfileView', { profileId });
    },

    async listProfileViews() {
        return await callApi<{ total: number; premium: boolean; locked: number; viewers: { id: string | null; name: string; headline: string; avatar: string; viewedAt: string }[] }>('listProfileViews');
    },

    // ---------------- SWIMIN PREMIUM ----------------
    async getBillingStatus() {
        return await callApi<BillingStatus>('getBillingStatus');
    },
    async startTrial() {
        return await callApi<{ premiumUntil: string }>('startTrial');
    },
    /** Indirizzo della pagina di pagamento (Stripe o PayPal). */
    async createCheckout(provider: 'stripe' | 'paypal', period: 'month' | 'year') {
        return await callApi<{ url: string }>('createCheckout', { provider, period });
    },
    async confirmPaypal(subscriptionId: string) {
        return await callApi<{ status: string }>('confirmPaypal', { subscriptionId });
    },
    async manageSubscription(cancel = false) {
        return await callApi<{ url?: string; cancelled?: boolean }>('manageSubscription', { cancel });
    },
    async getMyStats() {
        return await callApi<ProfileStats>('getMyStats');
    },
    async adminGrantPremium(userId: string, days: number) {
        return await callApi<{ premiumUntil: string }>('adminGrantPremium', { userId, days });
    },
    async adminGetPlans() {
        return await callApi<AdminPlans>('adminGetPlans');
    },
    /** Nuovi prezzi in centesimi, per chiave di piano (person_month, enthusiast_year…). */
    async adminUpdatePlans(prices: Record<string, number>) {
        return await callApi<AdminPlans>('adminUpdatePlans', { prices });
    },

    /** Profili per id (fino a 100), es. l'elenco dei collegamenti. */
    async getProfilesByIds(ids: string[]): Promise<Profile[]> {
        const unique = [...new Set(ids)].slice(0, 100);
        if (unique.length === 0) return [];
        const res = await databases.listDocuments<Profile>(databaseId, collections.profiles, [Query.equal('$id', unique), Query.limit(100)]);
        return res.documents;
    },

    /** Chi ha reagito al post, con il tipo di reazione. */
    async getPostLikers(postId: string): Promise<(Profile & { reaction: string })[]> {
        const likes = await databases.listDocuments<Like>(databaseId, collections.likes, [Query.equal('postId', postId), Query.limit(100)]);
        if (likes.documents.length === 0) return [];
        const reactionBy = new Map(likes.documents.map((l) => [l.userId, l.reaction || 'consiglio']));
        const profiles = await this.getProfilesByIds([...reactionBy.keys()]);
        return profiles.map((p) => ({ ...p, reaction: reactionBy.get(p.$id) || 'consiglio' }));
    },

    async createComment(postId: string, _authorId: string, content: string, parentCommentId: string | null = null) {
        return await callApi<Comment>('createComment', { postId, content, parentCommentId });
    },

    /** Commenti del post con autore, risposte, mi piace e se li ho apprezzati io. */
    async getPostComments(postId: string, currentUserId?: string) {
        const response = await databases.listDocuments<Comment>(databaseId, collections.comments, [
            Query.equal('postId', postId),
            Query.orderAsc('$createdAt'),
            Query.limit(200),
        ]);
        const [authors, myLikes] = await Promise.all([
            this.getProfilesByIds(response.documents.map((c) => c.authorId)).catch(() => [] as Profile[]),
            currentUserId
                ? databases
                      .listDocuments<CommentLike>(databaseId, collections.comment_likes, [Query.equal('postId', postId), Query.equal('userId', currentUserId), Query.limit(200)])
                      .then((r) => new Set(r.documents.map((l) => l.commentId)))
                      .catch(() => new Set<string>())
                : Promise.resolve(new Set<string>()),
        ]);
        const byId = new Map(authors.map((p) => [p.$id, p]));
        const enrichedComments = response.documents.map((comment) => {
            const author = byId.get(comment.authorId) || null;
            return {
                ...comment,
                author,
                authorType: author?.userType || 'professional',
                createdAt: comment.$createdAt,
                likesCount: comment.likesCount || 0,
                likedByMe: myLikes.has(comment.$id),
            };
        });
        const mainComments = enrichedComments.filter((c) => !c.parentCommentId);
        const replies = enrichedComments.filter((c) => c.parentCommentId);
        return mainComments.map((mc) => ({ ...mc, replies: replies.filter((r) => r.parentCommentId === mc.$id) }));
    },

    // ==========================================
    // JOBS & APPLICATIONS
    // ==========================================
    /** Pubblica un annuncio (lato server: verifica che l'utente gestisca la struttura). */
    async createJob(jobData: Partial<Job>) {
        return await callApi<Job>('createJob', jobData as Record<string, unknown>);
    },

    async getActiveJobs() {
        const response = await databases.listDocuments<Job>(databaseId, collections.jobs, [
            Query.equal('isActive', true), 
            Query.orderDesc('$createdAt')
        ]);
        return response.documents.filter((j) => isJobOpen(j));
    },

    async applyForJob(applicationData: Partial<Application>) {
        return await callApi<Application>('applyForJob', {
            jobId: applicationData.jobId,
            coverLetter: applicationData.coverLetter || '',
        });
    },

    async getJobApplications(jobId: string) {
        try {
            const response = await databases.listDocuments<Application>(databaseId, collections.applications, [
                Query.equal('jobId', jobId),
                Query.orderDesc('$createdAt'),
                Query.limit(200),
            ]);
            // Candidati Premium in cima (il campo lo scrive solo la Function), poi dal più recente.
            return [...response.documents].sort((a, b) => Number(!!b.priority) - Number(!!a.priority));
        } catch (error) {
            console.warn('Candidature:', error);
            return [];
        }
    },

    async updateApplicationStatus(applicationId: string, status: 'pending' | 'reviewed' | 'accepted' | 'rejected') {
        try { 
            return await callApi<Application>('updateApplicationStatus', { applicationId, status });
        } catch (error) { 
            console.error('updateApplicationStatus:', error);
            return null; 
        }
    },

    // ==========================================
    // NETWORK & COLLEGAMENTI
    // ==========================================
    async sendConnectionRequest(_senderId: string, receiverId: string) {
        return await callApi<Connection>('sendConnectionRequest', { receiverId });
    },

    async getPendingConnectionRequests(userId: string) {
        const res = await databases.listDocuments<Connection>(databaseId, collections.connections, [
            Query.equal('receiverId', userId), 
            Query.equal('status', 'pending'), 
            Query.orderDesc('$createdAt')
        ]);
        return res.documents;
    },

    async acceptConnectionRequest(connectionId: string, _senderId?: string, _receiverId?: string) {
        return await callApi<Connection>('respondConnectionRequest', { connectionId, accept: true });
    },

    /** Stato del collegamento tra l'utente corrente e un altro profilo. */
    async getConnectionStatus(me: { $id: string; connections?: string[] }, otherId: string): Promise<ConnectionStatus> {
        if ((me.connections || []).includes(otherId)) return { state: 'connected' };
        try {
            const res = await databases.listDocuments<Connection>(databaseId, collections.connections, [
                Query.equal('senderId', [me.$id, otherId]),
                Query.equal('receiverId', [me.$id, otherId]),
                Query.equal('status', 'pending'),
                Query.limit(1),
            ]);
            const req = res.documents[0];
            if (!req) return { state: 'none' };
            return req.senderId === me.$id ? { state: 'sent' } : { state: 'received', connectionId: req.$id };
        } catch (error) {
            console.warn('Stato collegamento non disponibile:', error);
            return { state: 'none' };
        }
    },

    async rejectConnectionRequest(connectionId: string) {
        return await callApi<Connection>('respondConnectionRequest', { connectionId, accept: false });
    },

    /** Professionisti che hanno indicato almeno una delle fasce, preferendo la stessa provincia. */
    async getAvailableProfessionals(slots: string[], province?: string, limit = 5) {
        if (!slots.length) return [] as UserProfile[];
        const base = [Query.equal('userType', 'professional'), Query.contains('availability', slots), Query.orderDesc('$updatedAt')];
        const near = province
            ? (await databases.listDocuments<UserProfile>(databaseId, collections.profiles, [...base, Query.equal('province', province), Query.limit(limit)])).documents
            : [];
        if (near.length >= limit) return near;
        const others = (await databases.listDocuments<UserProfile>(databaseId, collections.profiles, [...base, Query.limit(limit * 2)])).documents;
        return [...near, ...others.filter((o) => !near.some((n) => n.$id === o.$id))].slice(0, limit);
    },

    /**
     * Persone da conoscere: esclude chi è già collegato e chi ha una richiesta
     * in sospeso con l'utente, in entrambe le direzioni.
     */
    // ==========================================
    // RECENSIONI E ELENCO STRUTTURE
    // ==========================================
    async getReviews(structureId: string, limit = 50) {
        const res = await databases.listDocuments<Review>(databaseId, collections.reviews, [
            Query.equal('structureId', structureId),
            Query.equal('status', 'published'),
            Query.orderDesc('$createdAt'),
            Query.limit(limit),
        ]);
        return res.documents;
    },

    async upsertReview(data: { structureId: string; rating: number; content: string; visitedAt?: string }) {
        return await callApi<{ review: Review; ratingSum: number; ratingCount: number }>('upsertReview', data);
    },

    async deleteReview(reviewId: string) {
        return await callApi<{ deleted: boolean; ratingSum: number; ratingCount: number }>('deleteReview', { reviewId });
    },

    async replyReview(reviewId: string, reply: string) {
        return await callApi<Review>('replyReview', { reviewId, reply });
    },

    /** Strutture (profili Struttura e pagine struttura), filtrabili per provincia e nome. */
    async getStructuresDirectory(opts: { province?: string; search?: string } = {}) {
        const term = (opts.search || '').trim();
        const profileQ = [Query.equal('userType', 'structure'), Query.limit(100)];
        const facilityQ = [Query.limit(100)];
        if (opts.province) {
            profileQ.push(Query.equal('province', opts.province));
            facilityQ.push(Query.equal('province', opts.province));
        }
        if (term.length >= 2) {
            profileQ.push(Query.or([Query.contains('structureName', term), Query.contains('city', term)]));
            facilityQ.push(Query.or([Query.contains('name', term), Query.contains('city', term)]));
        }
        const [profiles, facilities] = await Promise.all([
            databases.listDocuments<StructureProfile>(databaseId, collections.profiles, profileQ),
            databases.listDocuments<Facility>(databaseId, FACILITIES_COLLECTION, facilityQ).catch((e) => {
                console.warn('Pagine struttura non disponibili:', e);
                return { documents: [] as Facility[] };
            }),
        ]);
        return { profiles: profiles.documents, facilities: facilities.documents };
    },

    /**
     * Ricerca di personale: professionisti (non appassionati) per provincia, qualifica
     * e fascia di disponibilità. I filtri sui brevetti si applicano nel client.
     */
    async searchTalent(opts: { province?: string; search?: string; slot?: string; emergencies?: boolean } = {}) {
        const q = [Query.equal('userType', 'professional'), Query.limit(100)];
        if (opts.province) q.push(Query.equal('province', opts.province));
        if (opts.slot) q.push(Query.contains('availability', [opts.slot]));
        if (opts.emergencies) q.push(Query.equal('availableForEmergencies', true));
        const term = (opts.search || '').trim();
        if (term.length >= 2) q.push(Query.or([Query.contains('title', term), Query.contains('firstName', term), Query.contains('lastName', term), Query.contains('city', term)]));
        const res = await databases.listDocuments<UserProfile>(databaseId, collections.profiles, q);
        return res.documents.filter((p) => p.personType !== 'enthusiast' && !p.suspended);
    },

    async getNetworkSuggestions(currentUserId: string, currentConnections: string[] = []) {
        const [res, pending] = await Promise.all([
            databases.listDocuments<Profile>(databaseId, collections.profiles, [
                Query.notEqual('userId', currentUserId),
                Query.orderDesc('$createdAt'),
                Query.limit(30),
            ]),
            databases
                .listDocuments<Connection>(databaseId, collections.connections, [
                    Query.or([Query.equal('senderId', currentUserId), Query.equal('receiverId', currentUserId)]),
                    Query.equal('status', 'pending'),
                    Query.limit(100),
                ])
                .then((r) => r.documents)
                .catch((e) => {
                    console.warn('Richieste in sospeso non disponibili:', e);
                    return [] as Connection[];
                }),
        ]);
        const excluded = new Set([...currentConnections, ...pending.flatMap((c) => [c.senderId, c.receiverId])]);
        return res.documents.filter((p) => !excluded.has(p.userId || p.$id)).slice(0, 20);
    },

    async getConnectionsProfiles(connectionIds: string[]) {
        if (!connectionIds || connectionIds.length === 0) return [];
        try {
            const safeIds = connectionIds.slice(0, 100);
            const res = await databases.listDocuments<Profile>(databaseId, collections.profiles, [
                Query.equal('$id', safeIds)
            ]);
            return res.documents;
        } catch(e) { 
            return []; 
        }
    },
    
    /** Rimuove il collegamento tra l'utente corrente e `otherUserId`. */
    async removeConnection(_currentUserId: string, otherUserId: string) {
        try {
            await callApi('removeConnection', { userId: otherUserId });
            return true;
        } catch(e) { 
            console.error('removeConnection:', e);
            return false; 
        }
    },

    /**
     * Ricerca lato server (sottostringa, case-insensitive) su nome, ruolo e città.
     * Con più parole usa la più lunga, che è la più selettiva.
     */
    async searchNetwork(searchQuery: string, currentUserId: string) {
        const term = (searchQuery || '').trim().split(/\s+/).sort((a, b) => b.length - a.length)[0] || '';
        if (term.length < 2) return { profiles: [] as Profile[], facilities: [] as Facility[] };

        const [profRes, facRes] = await Promise.all([
            databases.listDocuments<Profile>(databaseId, collections.profiles, [
                Query.or([
                    Query.contains('firstName', term),
                    Query.contains('lastName', term),
                    Query.contains('structureName', term),
                    Query.contains('title', term),
                    Query.contains('structureType', term),
                    Query.contains('city', term),
                ]),
                Query.limit(30),
            ]),
            databases.listDocuments<Facility>(databaseId, FACILITIES_COLLECTION, [
                Query.or([
                    Query.contains('name', term),
                    Query.contains('type', term),
                    Query.contains('city', term),
                ]),
                Query.limit(20),
            ]).catch((error) => {
                console.warn('Ricerca strutture non disponibile:', error);
                return { documents: [] as Facility[] };
            }),
        ]);

        return {
            profiles: profRes.documents.filter(p => p.$id !== currentUserId && p.userId !== currentUserId),
            facilities: facRes.documents,
        };
    },

    /** Post che contengono il termine (ricerca globale). */
    async searchPosts(searchQuery: string, currentUserId: string, limit = 20): Promise<EnrichedPost[]> {
        const term = searchQuery.trim();
        if (term.length < 2) return [];
        const res = await databases.listDocuments<Post>(databaseId, collections.posts, [
            Query.contains('content', term),
            Query.orderDesc('$createdAt'),
            Query.limit(limit),
        ]);
        return this.withLikedByMe(res.documents, currentUserId);
    },

    /** Gruppi per nome o descrizione. */
    async searchGroups(searchQuery: string, limit = 20) {
        const term = searchQuery.trim();
        if (term.length < 2) return [];
        const res = await databases.listDocuments<Group>(databaseId, collections.groups, [
            Query.or([Query.contains('name', term), Query.contains('description', term)]),
            Query.orderDesc('membersCount'),
            Query.limit(limit),
        ]);
        return res.documents;
    },
    /** Eventi in programma per titolo, descrizione o comune. */
    async searchEvents(searchQuery: string, limit = 20) {
        const term = searchQuery.trim();
        if (term.length < 2) return [];
        const res = await databases.listDocuments<SwimMeet>(databaseId, SWIM_MEETS_COLLECTION, [
            Query.equal('status', 'upcoming'),
            Query.greaterThanEqual('date', new Date().toISOString().slice(0, 10)),
            Query.or([Query.contains('title', term), Query.contains('description', term), Query.contains('city', term)]),
            Query.orderAsc('date'),
            Query.limit(limit),
        ]);
        return res.documents;
    },
    /** Hashtag che corrispondono al termine: quello esatto (se usato) e quelli di tendenza che iniziano così. */
    async searchHashtags(searchQuery: string) {
        const tag = searchQuery.trim().replace(/^#/, '').toLocaleLowerCase('it-IT');
        if (tag.length < 2 || !/^[\p{L}\p{N}_]+$/u.test(tag)) return [];
        const [exact, trends] = await Promise.all([
            databases.listDocuments<Post>(databaseId, collections.posts, [Query.contains('hashtags', [tag]), Query.limit(1)]).then((r) => r.total).catch(() => 0),
            this.getTrends().catch(() => [] as { tag: string; posts: number }[]),
        ]);
        const out = new Map<string, number>();
        if (exact > 0) out.set(tag, exact);
        for (const t of Array.isArray(trends) ? trends : []) if (t.tag.startsWith(tag) && !out.has(t.tag)) out.set(t.tag, t.posts);
        return [...out.entries()].map(([t, posts]) => ({ tag: t, posts }));
    },

    /** Offerte attive che corrispondono al termine (titolo, ruolo, città, struttura). */
    async searchJobs(searchQuery: string, limit = 20) {
        const term = searchQuery.trim();
        if (term.length < 2) return [] as Job[];
        const res = await databases.listDocuments<Job>(databaseId, collections.jobs, [
            Query.equal('isActive', true),
            Query.or([
                Query.contains('title', term),
                Query.contains('role', term),
                Query.contains('city', term),
                Query.contains('structureName', term),
            ]),
            Query.orderDesc('$createdAt'),
            Query.limit(limit),
        ]);
        return res.documents.filter((j) => isJobOpen(j));
    },

    // ==========================================
    // AREA STAFF (bacheca, turni, membri): solo tramite la Function
    // ==========================================
    /** Dati dell'area staff; il server risponde 403 a chi non fa parte del team. */
    async getTeamBoard(structureId: string) {
        return await callApi<TeamBoard>('getTeamBoard', { structureId });
    },
    /** Chat staff (solo amministratori e staff, verificati dalla Function a ogni lettura). */
    async listStaffMessages(structureId: string, opts: { after?: string; before?: string } = {}) {
        return await callApi<{ messages: StaffMessage[]; members?: StaffChatMember[]; hasMore: boolean }>('listStaffMessages', { structureId, ...opts });
    },
    async sendStaffMessage(structureId: string, content: string) {
        return await callApi<StaffMessage>('sendStaffMessage', { structureId, content });
    },
    async deleteStaffMessage(messageId: string) {
        return await callApi<{ deleted: boolean }>('deleteStaffMessage', { messageId });
    },
    async createSquadAnnouncement(structureId: string, content: string, isImportant: boolean) {
        return await callApi<SquadAnnouncement>('createAnnouncement', { structureId, content, isImportant });
    },
    async deleteSquadAnnouncement(announcementId: string) {
        return await callApi<{ deleted: boolean }>('deleteAnnouncement', { announcementId });
    },
    async markAnnouncementsRead(structureId: string) {
        return await callApi<{ updated: number }>('markAnnouncementsRead', { structureId });
    },
    async createSquadShift(data: { structureId: string; userId: string; date: string; shiftTime: string; role?: string }) {
        return await callApi<SquadShift>('createShift', data);
    },
    async deleteSquadShift(shiftId: string) {
        return await callApi<{ deleted: boolean }>('deleteShift', { shiftId });
    },
    /** I miei turni in tutte le strutture di cui faccio parte. */
    async listMyShifts() {
        return await callApi<(SquadShift & { structureName: string })[]>('listMyShifts');
    },
    async respondShift(shiftId: string, status: 'confirmed' | 'declined') {
        return await callApi<SquadShift>('respondShift', { shiftId, status });
    },
    /** Un amministratore toglie un membro, oppure il membro stesso lascia lo staff. */
    async removeStaffMember(structureId: string, staffId: string) {
        return await callApi<{ removed: boolean }>('removeStaffMember', { structureId, staffId });
    },

    // ==========================================
    // 🏢 FACILITIES
    // ==========================================
    async getFacility(facilityId: string) {
        try {
            return await databases.getDocument<Facility>(databaseId, FACILITIES_COLLECTION, facilityId);
        } catch (e) {
            return null;
        }
    },

    /** Nuova pagina struttura: la crea il server, con chi chiama come amministratore. */
    async createFacility(data: Partial<Facility>, _adminId?: string) {
        return await callApi<Facility>('createFacility', data as Record<string, unknown>);
    },

    async updateFacility(facilityId: string, data: Partial<Facility>) {
        const clean: Record<string, unknown> = { ...data };
        for (const k of Object.keys(clean)) if (k.startsWith('$')) delete clean[k];
        return await callApi<Facility>('updateFacility', { ...clean, facilityId });
    },

    async getManagedFacilities(adminId: string) {
        try {
            const userProfile = await this.getProfile(adminId) as UserProfile;
            const facilityIds = userProfile.managedFacilities || [];
            
            if (facilityIds.length === 0) return [];

            const res = await databases.listDocuments<Facility>(databaseId, FACILITIES_COLLECTION, [
                Query.equal('$id', facilityIds),
                Query.orderDesc('$createdAt')
            ]);
            return res.documents;
        } catch(e) { return []; }
    },

    async toggleFollowFacility(facilityId: string, _userId: string) {
        try {
            const { following } = await callApi<{ following: boolean }>('toggleFollowFacility', { facilityId });
            return following;
        } catch(e) { 
            console.error('toggleFollowFacility:', e);
            return null; 
        }
    },

    /** Assunzione: il candidato entra nello staff. Lancia l'errore del server (es. limite staff del piano Base). */
    async hireCandidate(applicationId: string) {
        await callApi('hireCandidate', { applicationId });
        return true;
    },


    // ==========================================
    // 🔴 BORDO VASCA LIVE
    // ==========================================
    /** Apre una diretta (lato server: l'host è l'utente che chiama). */
    async createLiveRoom(data: Pick<LiveRoom, 'title'> & Partial<Pick<LiveRoom, 'description'>>) {
        try {
            return await callApi<LiveRoom>('createLiveRoom', { title: data.title, description: data.description || '' });
        } catch (e) {
            console.error('createLiveRoom:', e);
            throw e;
        }
    },

    async getLiveMessages(roomId: string, limit = 100) {
        const res = await databases.listDocuments<LiveMessage>(databaseId, collections.live_messages, [
            Query.equal('roomId', roomId),
            Query.orderDesc('$createdAt'),
            Query.limit(limit),
        ]);
        return res.documents.reverse();
    },

    async sendLiveMessage(roomId: string, content: string, kind: LiveMessage['kind'] = 'message') {
        return await callApi<LiveMessage>('sendLiveMessage', { roomId, content, kind });
    },

    async setLiveSpeaker(roomId: string, userId: string, onStage: boolean) {
        return await callApi<LiveRoom>('setLiveSpeaker', { roomId, userId, onStage });
    },

    async getActiveLiveRooms() {
        try {
            const res = await databases.listDocuments<LiveRoom>(
                databaseId, 
                LIVE_ROOMS_COLLECTION, 
                [
                    Query.equal('status', 'active'),
                    Query.orderDesc('startedAt')
                ]
            );
            return res.documents;
        } catch (e) { return []; }
    },

    async getLiveRoom(roomId: string) {
        try {
            return await databases.getDocument<LiveRoom>(databaseId, LIVE_ROOMS_COLLECTION, roomId);
        } catch (e) { return null; }
    },

    async joinLiveRoom(roomId: string, _userId: string, role: 'speaker' | 'listener') {
        try {
            return await callApi<LiveRoom>('joinLiveRoom', { roomId, role });
        } catch (e) {
            console.error('joinLiveRoom:', e);
            return null;
        }
    },

    async leaveLiveRoom(roomId: string, _userId: string) {
        try {
            return await callApi<LiveRoom>('leaveLiveRoom', { roomId });
        } catch (e) {
            console.error('leaveLiveRoom:', e);
            return null;
        }
    },

    async endLiveRoom(roomId: string) {
        return await callApi<LiveRoom>('endLiveRoom', { roomId });
    },
    /** Token per la stanza video (permessi secondo il ruolo: chi conduce e chi è sul palco pubblicano). */
    async getLiveAccess(roomId: string) {
        return await callApi<LiveAccess>('getLiveAccess', { roomId });
    },
    /** Chi conduce: crea i dati di trasmissione per OBS Studio o Prism Live Studio (Premium). */
    async createLiveIngress(roomId: string, kind: 'rtmp' | 'whip') {
        return await callApi<LiveIngress>('createLiveIngress', { roomId, kind });
    },
    async getLiveIngress(roomId: string) {
        return await callApi<LiveIngress | null>('getLiveIngress', { roomId });
    },

    // ==========================================
    // EVENTI (tabella swim_meets)
    // ==========================================
    /** Crea l'evento tramite il server (organizzatore = chi chiama). Lancia un errore con il motivo. */
    async createSwimMeet(data: EventInput) {
        return await callApi<SwimMeet>('createSwimMeet', data as unknown as Record<string, unknown>);
    },
    async updateSwimMeet(meetId: string, data: Partial<EventInput>) {
        return await callApi<SwimMeet>('updateSwimMeet', { meetId, ...data });
    },

    /** Eventi in programma (dal più vicino), compresi quelli di oggi. */
    async getActiveSwimMeets(limit = 100) {
        try {
            const res = await databases.listDocuments<SwimMeet>(databaseId, SWIM_MEETS_COLLECTION, [
                Query.equal('status', 'upcoming'),
                Query.greaterThanEqual('date', new Date().toISOString().slice(0, 10)),
                Query.orderAsc('date'),
                Query.limit(limit),
            ]);
            return res.documents;
        } catch (e) {
            console.error('Eventi:', e);
            return [];
        }
    },
    async getGroupEvents(groupId: string) {
        const res = await databases.listDocuments<SwimMeet>(databaseId, SWIM_MEETS_COLLECTION, [
            Query.equal('groupId', groupId),
            Query.equal('status', 'upcoming'),
            Query.greaterThanEqual('date', new Date().toISOString().slice(0, 10)),
            Query.orderAsc('date'),
            Query.limit(50),
        ]);
        return res.documents;
    },

    async getSwimMeet(meetId: string) {
        try {
            return await databases.getDocument<SwimMeet>(databaseId, SWIM_MEETS_COLLECTION, meetId);
        } catch (e) {
            console.warn('Evento:', e);
            return null;
        }
    },

    /** Iscrizione: myStatus dice se si è dentro o in lista d'attesa. */
    async joinSwimMeet(meetId: string, _userId?: string) {
        return await callApi<SwimMeet & { myStatus: 'going' | 'waitlist' }>('joinSwimMeet', { meetId });
    },

    /** Link dell'evento online (solo organizzatore e iscritti). */
    async getEventLink(meetId: string) {
        return await callApi<{ onlineUrl: string | null }>('getEventLink', { meetId });
    },
    async closeJob(jobId: string) {
        return await callApi<Job>('closeJob', { jobId });
    },
    async reopenJob(jobId: string) {
        return await callApi<Job>('reopenJob', { jobId });
    },

    async leaveSwimMeet(meetId: string, _userId?: string) {
        return await callApi<SwimMeet>('leaveSwimMeet', { meetId });
    },

    async cancelSwimMeet(meetId: string) {
        return await callApi<SwimMeet>('cancelSwimMeet', { meetId });
    }
};