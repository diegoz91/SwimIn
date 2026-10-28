import type { IconType } from '@/components/ui/Icon';
import type { AppNotification } from '@/types/types';
import { EVENTS_PATH, GROUPS_PATH } from '@/config/routes';

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
            return { icon: 'briefcase', tone: 'bg-amber-100 text-amber-700', href: n.relatedId ? `/jobs/${n.relatedId}?candidati=nuove` : '/jobs/annunci' };
        case 'application_update':
            return { icon: 'check-circle', tone: 'bg-cloro-100 text-cloro-700', href: n.relatedId ? `/jobs/${n.relatedId}` : '/jobs/candidature' };
        case 'hired':
            return { icon: 'sparkles', tone: 'bg-green-100 text-green-600', href: n.relatedId ? `/profile/${n.relatedId}` : '/jobs' };
        case 'endorsement':
            return { icon: 'star', tone: 'bg-amber-100 text-amber-600', href: '/profile' };
        case 'mention':
            return { icon: 'chat-bubble', tone: 'bg-corsia-100 text-corsia-700', href: n.relatedId ? `/post/${n.relatedId}` : '/' };
        case 'follow':
            return { icon: 'user-plus', tone: 'bg-cloro-100 text-cloro-700', href: n.relatedId ? `/profile/${n.relatedId}` : '/network' };
        case 'group':
            return { icon: 'users', tone: 'bg-corsia-100 text-corsia-700', href: n.relatedId ? `/gruppi/${n.relatedId}` : GROUPS_PATH };
        case 'recommendation':
            // Le notifiche vecchie "ha pubblicato la tua referenza" avevano lo stesso tipo: portano al profilo di chi l'ha pubblicata.
            if (n.relatedId && /ha pubblicato la tua referenza/.test(n.content || '')) return { icon: 'star', tone: 'bg-cloro-100 text-cloro-700', href: `/profile/${n.relatedId}?sezione=referenze` };
            return { icon: 'star', tone: 'bg-cloro-100 text-cloro-700', href: '/profile?referenze=approva' };
        case 'recommendation_published':
            return { icon: 'star', tone: 'bg-cloro-100 text-cloro-700', href: n.relatedId ? `/profile/${n.relatedId}?sezione=referenze` : '/profile' };
        case 'recommendation_request':
            return { icon: 'pencil', tone: 'bg-corsia-100 text-corsia-700', href: n.relatedId ? `/profile/${n.relatedId}?referenza=scrivi` : '/profile' };
        case 'job_alert':
            return { icon: 'briefcase', tone: 'bg-corsia-100 text-corsia-700', href: n.relatedId ? `/jobs/${n.relatedId}` : '/jobs' };
        case 'event':
            return { icon: 'calendar', tone: 'bg-cloro-100 text-cloro-700', href: n.relatedId ? `/eventi/${n.relatedId}` : EVENTS_PATH };
        case 'repost':
            return { icon: 'share', tone: 'bg-corsia-100 text-corsia-700', href: n.relatedId ? `/post/${n.relatedId}` : '/' };
        case 'profile_view':
            return { icon: 'user', tone: 'bg-cloro-100 text-cloro-700', href: n.relatedId ? `/profile/${n.relatedId}` : '/profile?visite=1' };
        case 'shift':
            return { icon: 'calendar', tone: 'bg-corsia-100 text-corsia-700', href: '/turni' };
        case 'staff_invite':
            return { icon: 'users', tone: 'bg-cloro-100 text-cloro-700', href: '/turni?inviti=1' };
        case 'sos':
            return { icon: 'alert-triangle', tone: 'bg-red-100 text-galleggiante-700', href: n.relatedId ? `/jobs/${n.relatedId}` : '/jobs' };
        case 'feedback':
            return { icon: 'chat-bubble', tone: 'bg-corsia-100 text-corsia-700', href: '/admin?tab=feedback' };
        case 'system_alert':
            return { icon: 'alert-triangle', tone: 'bg-red-100 text-galleggiante-700', href: '/admin?tab=errori' };
        case 'moderation':
            return { icon: 'shield', tone: 'bg-amber-100 text-amber-800', href: n.relatedId ? `/moderazione/${n.relatedId}` : '/notifiche' };
        case 'data_breach':
            return { icon: 'shield', tone: 'bg-red-100 text-galleggiante-700', href: '/admin?tab=violazioni' };
        case 'rejected':
            return { icon: 'briefcase', tone: 'bg-slate-100 text-slate-500', href: n.relatedId ? `/jobs/${n.relatedId}` : '/jobs/candidature' };
        default:
            return { icon: 'bell', tone: 'bg-slate-100 text-slate-600', href: '/' };
    }
}
