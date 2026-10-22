import { ID, Permission, Query, Role } from 'appwrite';
import { databases, functions } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import type { 
    UserProfile, 
    StructureProfile, 
    Post, 
    Job, 
    Application, 
    Connection,
    Like,
    Comment,
    Message,
    EnrichedPost,
    SquadAnnouncement,
    SquadShift,
    Facility,
    AppNotification,
    LiveRoom,
    SwimMeet // 🟢 IMPORTATO NUOVO TIPO SWIM MEET
} from '@/types/types';

const { databaseId, collections } = APPWRITE_CONFIG;

const ANNOUNCEMENTS_COLLECTION = (collections as any).announcements || 'announcements_mock_id';
const SHIFTS_COLLECTION = (collections as any).shifts || 'shifts_mock_id';
const FACILITIES_COLLECTION = (collections as any).facilities || 'facilities_mock_id';
const NOTIFICATIONS_COLLECTION = (collections as any).notifications || 'notifications_mock_id';
const LIVE_ROOMS_COLLECTION = (collections as any).live_rooms || 'live_rooms_mock_id';
const SWIM_MEETS_COLLECTION = (collections as any).swim_meets || 'swim_meets_mock_id'; // 🟢 NUOVA COSTANTE

type Profile = UserProfile | StructureProfile;

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
        'POST',
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
const ownedBy = (userId: string) => [
    Permission.read(Role.users()),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
];

export const databaseService = {
    // ==========================================
    // PROFILI & PRESENZA
    // ==========================================
    async initializeProfile(userId: string, email: string, userType: 'professional' | 'structure', name: string) {
        const profileData = userType === 'professional' 
            ? { userId, email, userType, firstName: name, readReceipts: true, availableForEmergencies: false, isOnline: true }
            : { userId, email, userType, structureName: name, readReceipts: true, isOnline: true };

        return await databases.createDocument(databaseId, collections.profiles, userId, profileData, ownedBy(userId));
    },

    async getProfile(userId: string): Promise<Profile> {
        return await databases.getDocument<Profile>(databaseId, collections.profiles, userId);
    },

    async updateProfile(userId: string, data: Partial<Profile>) {
        const cleanData = { ...data };
        delete (cleanData as any).$id;
        delete (cleanData as any).$createdAt;
        delete (cleanData as any).$updatedAt;
        delete (cleanData as any).$permissions;
        delete (cleanData as any).$databaseId;
        delete (cleanData as any).$collectionId;

        return await databases.updateDocument(databaseId, collections.profiles, userId, cleanData);
    },

    async updatePresence(userId: string, isOnline: boolean) {
        try {
            return await databases.updateDocument(databaseId, collections.profiles, userId, {
                isOnline,
                lastActive: new Date().toISOString()
            });
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

    async setTypingStatus(userId: string, targetUserId: string | null) {
        try { 
            return await databases.updateDocument(databaseId, collections.profiles, userId, { typingTo: targetUserId }); 
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
    async createPost(postData: Partial<Post>) {
        return await databases.createDocument<Post>(
            databaseId, collections.posts, ID.unique(), postData, 
            postData.authorId ? ownedBy(postData.authorId) : undefined
        );
    },

    async getFeed(currentUserId: string, userConnections: string[], limit = 20, offset = 0): Promise<EnrichedPost[]> {
        const response = await databases.listDocuments<Post>(databaseId, collections.posts, [
            Query.orderDesc('$createdAt'),
            Query.limit(100) 
        ]);

        const allPosts = response.documents;
        const postIds = allPosts.map(p => p.$id);
        let relevantLikes: Like[] = [];

        const safeConnections = userConnections.slice(0, 50);
        if (postIds.length > 0 && safeConnections.length > 0) {
            try {
                const likesRes = await databases.listDocuments<Like>(databaseId, collections.likes, [
                    Query.equal('userId', safeConnections),
                    Query.limit(100),
                    Query.orderDesc('$createdAt')
                ]);
                relevantLikes = likesRes.documents;
            } catch(e) {}
        }

        const enrichedPosts: EnrichedPost[] = [];

        for (const post of allPosts) {
            const isMine = post.authorId === currentUserId;
            const isConnection = userConnections.includes(post.authorId);
            let recommendedBy: { id: string, name: string } | undefined = undefined;

            if (!isMine && !isConnection) {
                const connectionLike = relevantLikes.find(l => l.postId === post.$id);
                if (connectionLike) {
                    try {
                        const recommender = await this.getProfile(connectionLike.userId);
                        const name = recommender.userType === 'professional'
                            ? `${(recommender as UserProfile).firstName} ${(recommender as UserProfile).lastName}`.trim()
                            : (recommender as StructureProfile).structureName || 'Una struttura';
                        recommendedBy = { id: recommender.userId || recommender.$id, name };
                    } catch (e) {}
                }
            }

            if (isMine || isConnection || recommendedBy) {
                enrichedPosts.push({ ...post, recommendedBy });
            }
        }

        return enrichedPosts.slice(offset, offset + limit);
    },

    async toggleLike(postId: string, _userId: string) {
        const { liked } = await callApi<{ liked: boolean; likesCount: number }>('toggleLike', { postId });
        return liked;
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
    async createJob(jobData: Partial<Job>) {
        return await databases.createDocument<Job>(databaseId, collections.jobs, ID.unique(), jobData);
    },

    async getActiveJobs() {
        const response = await databases.listDocuments<Job>(databaseId, collections.jobs, [
            Query.equal('isActive', true), 
            Query.orderDesc('$createdAt')
        ]);
        return response.documents;
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

    async rejectConnectionRequest(connectionId: string) {
        return await callApi<Connection>('respondConnectionRequest', { connectionId, accept: false });
    },

    async getNetworkSuggestions(currentUserId: string, currentConnections: string[] = []) {
        const res = await databases.listDocuments<Profile>(databaseId, collections.profiles, [
            Query.notEqual('userId', currentUserId), 
            Query.orderDesc('$createdAt'), 
            Query.limit(20)
        ]);
        return res.documents.filter(p => !currentConnections.includes(p.userId || p.$id));
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

    async searchNetwork(searchQuery: string, currentUserId: string) {
        if (!searchQuery || searchQuery.trim().length < 2) return { profiles: [], facilities: [] };
        const q = searchQuery.toLowerCase().trim();
        
        try {
            const profRes = await databases.listDocuments<Profile>(databaseId, collections.profiles, [
                Query.limit(100), 
                Query.orderDesc('$createdAt')
            ]);
            const facRes = await databases.listDocuments<Facility>(databaseId, FACILITIES_COLLECTION, [
                Query.limit(50), 
                Query.orderDesc('$createdAt')
            ]);
            
            const profiles = profRes.documents.filter(p => {
                if (p.userId === currentUserId || p.$id === currentUserId) return false;
                const isProf = p.userType === 'professional';
                const name = isProf 
                    ? `${(p as UserProfile).firstName || ''} ${(p as UserProfile).lastName || ''}`.trim() 
                    : (p as StructureProfile).structureName || '';
                const role = isProf 
                    ? (p as UserProfile).title || '' 
                    : (p as StructureProfile).structureType || '';
                
                return name.toLowerCase().includes(q) || role.toLowerCase().includes(q) || (p.city || '').toLowerCase().includes(q);
            });

            const facilities = facRes.documents.filter(f => {
                return (f.name || '').toLowerCase().includes(q) || 
                       (f.type || '').toLowerCase().includes(q) || 
                       (f.city || '').toLowerCase().includes(q);
            });

            return { profiles, facilities };
        } catch (e) {
            console.error("Search error", e);
            return { profiles: [], facilities: [] };
        }
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
        } catch(e) {}
    },

    // ==========================================
    // 🏢 FACILITIES
    // ==========================================
    async createFacility(data: Partial<Facility>, adminId: string) {
        try {
            const facilityData = {
                ...data,
                admins: [adminId],
                staff: [],
                followers: []
            };
            const facility = await databases.createDocument<Facility>(databaseId, FACILITIES_COLLECTION, ID.unique(), facilityData);
            
            const userProfile = await this.getProfile(adminId) as UserProfile;
            const managed = userProfile.managedFacilities || [];
            await this.updateProfile(adminId, { managedFacilities: [...managed, facility.$id] });
            
            return facility;
        } catch(e) { return null; }
    },
    
    async getFacility(facilityId: string) {
        try {
            return await databases.getDocument<Facility>(databaseId, FACILITIES_COLLECTION, facilityId);
        } catch(e) { return null; }
    },
    
    async updateFacility(facilityId: string, data: Partial<Facility>) {
        try {
            const cleanData = { ...data };
            delete (cleanData as any).$id; delete (cleanData as any).$createdAt; delete (cleanData as any).$updatedAt;
            return await databases.updateDocument<Facility>(databaseId, FACILITIES_COLLECTION, facilityId, cleanData);
        } catch(e) { return null; }
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
            try {
                const fac = await databases.getDocument<Facility>(databaseId, FACILITIES_COLLECTION, structureId);
                const staff = (fac.staff || []).filter(id => id !== staffId);
                await databases.updateDocument(databaseId, FACILITIES_COLLECTION, structureId, { staff });
            } catch {
                const prof = await databases.getDocument<StructureProfile>(databaseId, collections.profiles, structureId);
                const conns = (prof.connections || []).filter(id => id !== staffId);
                await databases.updateDocument(databaseId, collections.profiles, structureId, { connections: conns });
            }
            return true;
        } catch (error) { return false; }
    },

    // ==========================================
    // 🔴 BORDO VASCA LIVE
    // ==========================================
    async createLiveRoom(data: Partial<LiveRoom>) {
        try {
            return await databases.createDocument<LiveRoom>(
                databaseId, 
                LIVE_ROOMS_COLLECTION, 
                ID.unique(), 
                {
                    ...data,
                    status: 'active',
                    speakers: data.speakers || [data.hostId],
                    listeners: data.listeners || [],
                    startedAt: new Date().toISOString()
                }
            );
        } catch (e) {
            console.error("🔥 Errore creazione Live Room:", e);
            return null;
        }
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