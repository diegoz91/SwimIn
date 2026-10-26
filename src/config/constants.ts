/**
 * Variabili d'ambiente obbligatorie mancanti. Se non è vuoto, `index.tsx`
 * mostra una schermata di errore leggibile invece di una pagina bianca.
 */
export const missingEnvVars: string[] = [
    ['VITE_APPWRITE_ENDPOINT', import.meta.env.VITE_APPWRITE_ENDPOINT],
    ['VITE_APPWRITE_PROJECT_ID', import.meta.env.VITE_APPWRITE_PROJECT_ID],
]
    .filter(([, value]) => !value)
    .map(([name]) => name as string);

export interface AppwriteConfig {
    endpoint: string;
    projectId: string;
    databaseId: string;
    collections: {
        profiles: string;
        posts: string;
        comments: string;
        likes: string;
        jobs: string;
        applications: string;
        connections: string;
        messages: string;
        announcements?: string;
        shifts?: string;
        facilities?: string;
        notifications?: string;
        live_rooms?: string;
        swim_meets?: string;
        endorsements: string;
        live_messages: string;
        saves: string;
        reviews: string;
        comment_likes: string;
        follows: string;
        poll_votes: string;
        groups: string;
        group_members: string;
        typing: string;
        signals: string;
    };
    buckets: {
        avatars: string;
        postMedia: string;
        certificates: string;
        chatFiles: string;
        resumes: string;
    };
}

export const APPWRITE_CONFIG: AppwriteConfig = {
    // Fallback a stringa vuota: l'SDK Appwrite chiama .replace() sull'endpoint
    // e andrebbe in crash prima di poter mostrare la schermata di errore.
    endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT ?? '',
    projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID ?? '',
    databaseId: 'swimwaveup_db',
    collections: {
        profiles: 'profiles',
        posts: 'posts',
        comments: 'comments',
        likes: 'likes',
        jobs: 'jobs',
        applications: 'applications',
        connections: 'connections',
        messages: 'messages',
        announcements: 'announcements', 
        shifts: 'shifts',
        facilities: 'facilities',
        notifications: 'notifications',
        live_rooms: 'live_rooms',
        swim_meets: 'swim_meets',
        endorsements: 'endorsements',
        live_messages: 'live_messages',
        saves: 'saves',
        reviews: 'reviews',
        comment_likes: 'comment_likes',
        follows: 'follows',
        poll_votes: 'poll_votes',
        groups: 'groups',
        group_members: 'group_members',
        typing: 'typing',
        signals: 'signals',
    },
    buckets: {
        avatars: 'avatars',
        postMedia: 'post_media',
        certificates: 'certificates',
        chatFiles: 'chat_files',
        resumes: 'resumes',
    }
};

export const APP_CONFIG = {
    name: 'SwimIn',
    fullName: 'SwimIn',
    version: '1.0.0',
    environment: import.meta.env.MODE,
};