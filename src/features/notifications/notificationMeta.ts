import type { IconType } from '@/components/ui/Icon';
import type { AppNotification } from '@/types/types';

interface NotificationMeta {
    icon: IconType;
    /** Classi Tailwind per il cerchio dell'icona. */
    tone: string;
    /** Pagina da aprire al clic. */
    href: string;
}

/** Icona, colore e destinazione di ogni tipo di notifica. */
export function notificationMeta(n: AppNotification): NotificationMeta {
    switch (n.type) {
        case 'like':
            return { icon: 'thumb-up', tone: 'bg-blue-100 text-blue-600', href: n.relatedId ? `/post/${n.relatedId}` : '/' };
        case 'comment':
            return { icon: 'chat-bubble', tone: 'bg-indigo-100 text-indigo-600', href: n.relatedId ? `/post/${n.relatedId}` : '/' };
        case 'connection':
            return { icon: 'users', tone: 'bg-sky-100 text-sky-600', href: '/network' };
        case 'application':
            return { icon: 'briefcase', tone: 'bg-amber-100 text-amber-700', href: n.relatedId ? `/jobs?annuncio=${n.relatedId}` : '/jobs' };
        case 'hired':
            return { icon: 'sparkles', tone: 'bg-green-100 text-green-600', href: n.relatedId ? `/profile/${n.relatedId}` : '/jobs' };
        case 'endorsement':
            return { icon: 'star', tone: 'bg-amber-100 text-amber-600', href: '/profile' };
        case 'mention':
            return { icon: 'chat-bubble', tone: 'bg-corsia-100 text-corsia-700', href: n.relatedId ? `/post/${n.relatedId}` : '/' };
        case 'follow':
            return { icon: 'user-plus', tone: 'bg-cloro-100 text-cloro-700', href: n.relatedId ? `/profile/${n.relatedId}` : '/network' };
        case 'group':
            return { icon: 'users', tone: 'bg-corsia-100 text-corsia-700', href: n.relatedId ? `/gruppi/${n.relatedId}` : '/gruppi' };
        case 'repost':
            return { icon: 'share', tone: 'bg-corsia-100 text-corsia-700', href: n.relatedId ? `/post/${n.relatedId}` : '/' };
        case 'profile_view':
            return { icon: 'user', tone: 'bg-cloro-100 text-cloro-700', href: n.relatedId ? `/profile/${n.relatedId}` : '/profile?visite=1' };
        case 'shift':
            return { icon: 'calendar', tone: 'bg-corsia-100 text-corsia-700', href: '/turni' };
        case 'sos':
            return { icon: 'alert-triangle', tone: 'bg-red-100 text-galleggiante', href: n.relatedId ? `/jobs?annuncio=${n.relatedId}` : '/jobs' };
        case 'rejected':
            return { icon: 'briefcase', tone: 'bg-slate-100 text-slate-500', href: '/jobs' };
        default:
            return { icon: 'bell', tone: 'bg-slate-100 text-slate-600', href: '/' };
    }
}
