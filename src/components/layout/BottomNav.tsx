import React, { useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconType } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { isEnthusiast } from '@/utils/profile';

const ITEMS: { to: string; icon: IconType; label: string; end?: boolean }[] = [
    { to: '/', icon: 'home', label: 'Home', end: true },
    { to: '/network', icon: 'users', label: 'Rete' },
    { to: '/jobs', icon: 'briefcase', label: 'Lavoro' },
    { to: '/messages', icon: 'chat-bubble', label: 'Messaggi' },
    { to: '/live', icon: 'video', label: 'Live' },
];

/** Barra di navigazione inferiore per smartphone. */
const BottomNav: React.FC = () => {
    const { user, authenticated } = useAuth();
    const { showToast } = useToast();
    const location = useLocation();

    const onNewMessage = useCallback(() => {
        if (!location.pathname.startsWith('/messages')) showToast('Hai ricevuto un nuovo messaggio.', 'info');
    }, [location.pathname, showToast]);
    const unread = useUnreadMessages(user?.$id, onNewMessage);

    if (!authenticated) return null;

    return (
        <nav
            className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 flex"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            aria-label="Navigazione principale"
        >
            {(isEnthusiast(user) ? ITEMS.map((n) => (n.to === '/jobs' ? { to: '/strutture', icon: 'building' as IconType, label: 'Piscine' } : n)) : ITEMS).map((item) => (
                <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                        `relative flex-1 flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-semibold outline-none ${
                            isActive ? 'text-abisso before:absolute before:top-0 before:inset-x-5 before:h-[3px] before:rounded-b before:bg-corsia-600' : 'text-slate-500'
                        }`
                    }
                >
                    <span className="relative">
                        <Icon type={item.icon} className="w-6 h-6" />
                        {item.to === '/messages' && unread > 0 && (
                            <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-1 bg-galleggiante text-white text-[10px] font-bold border-2 border-white rounded-full flex items-center justify-center leading-none">
                                {unread > 9 ? '9+' : unread}
                            </span>
                        )}
                    </span>
                    {item.label}
                </NavLink>
            ))}
        </nav>
    );
};

export default BottomNav;
