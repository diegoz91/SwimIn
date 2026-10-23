import { ExecutionMethod, ID, Models, Permission, Query, Role } from 'appwrite';
import { databases, functions } from '@/services/appwrite';
import { storageService } from '@/services/storage';
import { getPostContent } from '@/utils/postMedia';
import { isJobOpen } from '@/utils/jobs';
import { APPWRITE_CONFIG } from '@/config/constants';
import type { 
    UserProfile, 
    StructureProfile, 
    Post, 
    Job, 
    Application, 
    Connection,
    Review,
    Like,
    Comment,
    Message,
    EnrichedPost,
    SquadAnnouncement,
    SquadShift,
    Facility,
    AppNotification,
    LiveRoom,
    SwimMeet,
    AppwriteDocument,
    Endorsement,
    LiveMessage,
    SavedItem,
} from '@/types/types';

const { databaseId, collections } = APPWRITE_CONFIG;

const ANNOUNCEMENTS_COLLECTION = (collections as any).announcements || 'announcements_mock_id';
const SHIFTS_COLLECTION = (collections as any).shifts || 'shifts_mock_id';
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

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

async function callApi<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
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
        throw new Error(payload.error || 'Operazione non riuscita.');
    }
    return payload.data;
}

/** Permessi di un documento creato dal client: leggibile dagli utenti, modificabile solo dal proprietario. */
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

const ownedBy = (userId: string) => [
    Permission.read(Role.users()),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
];

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
    async sendMessage(_conversationId: string, _senderId: string, receiverId: string, content: string) {
        return await callApi<Message>('sendMessage', { receiverId, content });
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

        const [profile, posts, comments, likes, applications, notifications] = await Promise.all([
            this.getProfile(userId),
            all<Post>(collections.posts, [Query.equal('authorId', userId)]),
            all<Comment>(collections.comments, [Query.equal('authorId', userId)]),
            all<Like>(collections.likes, [Query.equal('userId', userId)]),
            all<Application>(collections.applications, [Query.equal('applicantId', userId)]),
            all<AppNotification>(NOTIFICATIONS_COLLECTION, [Query.equal('userId', userId)]),
        ]);
        return {
            exportedAt: new Date().toISOString(),
            profile: strip([profile])[0],
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
    async createPost(postData: Pick<Post, 'content' | 'postType'> & Partial<Pick<Post, 'media' | 'category'>>) {
        return await callApi<Post>('createPost', {
            content: postData.content,
            media: postData.media || [],
            postType: postData.postType,
            category: postData.category,
        });
    },

    /**
     * Feed stile LinkedIn, paginato lato server.
     * - Post dei miei collegamenti e miei (filtro su authorId, ordinati per data).
     * - Solo in prima pagina: post di altri che un mio collegamento ha consigliato (like).
     * - Senza collegamenti: post più recenti di tutta la rete, per scoprire persone.
     */
    async getFeed(currentUserId: string, userConnections: string[], limit = 20, offset = 0): Promise<EnrichedPost[]> {
        // Appwrite accetta al massimo 100 valori in un filtro equal.
        const authors = [currentUserId, ...userConnections].slice(0, 100);
        const hasNetwork = userConnections.length > 0;

        const response = await databases.listDocuments<Post>(databaseId, collections.posts, [
            ...(hasNetwork ? [Query.equal('authorId', authors)] : []),
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
                .filter(p => !authors.includes(p.authorId))
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
            const liked = new Set(res.documents.map(l => l.postId));
            return posts.map(p => ({ ...p, likedByMe: liked.has(p.$id) }));
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

    /** Modifica il testo di un proprio post (permesso di update del proprietario). */
    async updatePost(postId: string, data: Pick<Post, 'content'> & Partial<Pick<Post, 'category'>>) {
        return await databases.updateDocument<Post>(databaseId, collections.posts, postId, { ...data, editedAt: new Date().toISOString() });
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

    async getPostLikers(postId: string): Promise<Profile[]> {
        const likes = await databases.listDocuments<Like>(databaseId, collections.likes, [Query.equal('postId', postId)]);
        if (likes.documents.length === 0) return [];
        const userIds = likes.documents.map(like => like.userId);
        const profiles = await Promise.all(userIds.map(id => databases.getDocument<Profile>(databaseId, collections.profiles, id).catch(() => null)));
        return profiles.filter((p): p is Profile => p !== null);
    },

    async createComment(postId: string, _authorId: string, content: string, parentCommentId: string | null = null) {
        return await callApi<Comment>('createComment', { postId, content, parentCommentId });
    },

    async getPostComments(postId: string) {
        const response = await databases.listDocuments<Comment>(databaseId, collections.comments, [
            Query.equal('postId', postId), 
            Query.orderAsc('$createdAt')
        ]);
        const enrichedComments = await Promise.all(response.documents.map(async (comment) => {
            try {
                const author = await databases.getDocument<Profile>(databaseId, collections.profiles, comment.authorId);
                return { ...comment, author, authorType: author.userType, createdAt: comment.$createdAt };
            } catch {
                return { ...comment, author: null, authorType: 'professional', createdAt: comment.$createdAt };
            }
        }));
        const mainComments = enrichedComments.filter(c => !c.parentCommentId);
        const replies = enrichedComments.filter(c => c.parentCommentId);
        return mainComments.map(mc => ({ ...mc, replies: replies.filter(r => r.parentCommentId === mc.$id) }));
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
                Query.orderDesc('$createdAt')
            ]);
            return response.documents;
        } catch (error) { 
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
    // 🏊‍♂️ SWIM-SQUAD
    // ==========================================
    async createSquadAnnouncement(data: Partial<SquadAnnouncement>) {
        try {
            return await databases.createDocument<SquadAnnouncement>(databaseId, ANNOUNCEMENTS_COLLECTION, ID.unique(), data);
        } catch(e) { return null; }
    },
    async getSquadAnnouncements(structureId: string) {
        try {
            const res = await databases.listDocuments<SquadAnnouncement>(databaseId, ANNOUNCEMENTS_COLLECTION, [
                Query.equal('structureId', structureId), 
                Query.orderDesc('$createdAt')
            ]);
            return res.documents;
        } catch(e) { return []; }
    },
    async deleteSquadAnnouncement(announcementId: string) {
        try {
            await databases.deleteDocument(databaseId, ANNOUNCEMENTS_COLLECTION, announcementId);
            return true;
        } catch(e) { return false; }
    },
    async createSquadShift(data: Partial<SquadShift>) {
        try {
            return await databases.createDocument<SquadShift>(databaseId, SHIFTS_COLLECTION, ID.unique(), data);
        } catch(e) { return null; }
    },
    async getSquadShifts(structureId: string) {
        try {
            const res = await databases.listDocuments<SquadShift>(databaseId, SHIFTS_COLLECTION, [
                Query.equal('structureId', structureId), 
                Query.orderAsc('date')
            ]);
            return res.documents;
        } catch(e) { return []; }
    },
    async deleteSquadShift(shiftId: string) {
        try {
            await databases.deleteDocument(databaseId, SHIFTS_COLLECTION, shiftId);
        } catch(e) {
            console.error('deleteSquadShift:', e);
        }
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

    async hireCandidate(applicationId: string, _jobId?: string, _structureId?: string, _applicantId?: string) {
        try {
            await callApi('hireCandidate', { applicationId });
            return true;
        } catch (error) {
            console.error('hireCandidate:', error);
            return false;
        }
    },

    async removeStaffMember(structureId: string, staffId: string) {
        try {
            const facility = await databases
                .getDocument<Facility>(databaseId, FACILITIES_COLLECTION, structureId)
                .catch(() => null);
            if (facility) {
                const staff = (facility.staff || []).filter(id => id !== staffId);
                await databases.updateDocument(databaseId, FACILITIES_COLLECTION, structureId, { staff });
            } else {
                // Profilo Struttura: lo staff è rappresentato dal collegamento reciproco.
                await callApi('removeConnection', { userId: staffId });
            }
            return true;
        } catch (error) {
            console.error('removeStaffMember:', error);
            return false;
        }
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
        try {
            return await databases.updateDocument<LiveRoom>(
                databaseId, 
                LIVE_ROOMS_COLLECTION, 
                roomId, 
                { status: 'ended' }
            );
        } catch (e) { return null; }
    },

    // ==========================================
    // 🟢 SWIM-MEETS
    // ==========================================
    async createSwimMeet(data: Partial<SwimMeet>) {
        try {
            return await databases.createDocument<SwimMeet>(
                databaseId, 
                SWIM_MEETS_COLLECTION, 
                ID.unique(), 
                {
                    ...data,
                    status: 'upcoming',
                    participants: data.participants || [data.creatorId]
                }
            );
        } catch (e) {
            console.error("🔥 Errore creazione Swim-Meet:", e);
            return null;
        }
    },

    async getActiveSwimMeets() {
        try {
            const res = await databases.listDocuments<SwimMeet>(
                databaseId, 
                SWIM_MEETS_COLLECTION, 
                [
                    Query.equal('status', 'upcoming'),
                    Query.orderAsc('date')
                ]
            );
            return res.documents;
        } catch (e) { return []; }
    },

    async getSwimMeet(meetId: string) {
        try {
            return await databases.getDocument<SwimMeet>(databaseId, SWIM_MEETS_COLLECTION, meetId);
        } catch (e) { return null; }
    },

    /** Lancia un errore con il motivo (es. evento pieno), mostrato all'utente. */
    async joinSwimMeet(meetId: string, _userId: string) {
        return await callApi<SwimMeet>('joinSwimMeet', { meetId });
    },

    async leaveSwimMeet(meetId: string, _userId: string) {
        return await callApi<SwimMeet>('leaveSwimMeet', { meetId });
    },

    async cancelSwimMeet(meetId: string) {
        try {
            return await databases.updateDocument<SwimMeet>(
                databaseId, 
                SWIM_MEETS_COLLECTION, 
                meetId, 
                { status: 'cancelled' }
            );
        } catch (e) { return null; }
    }
};