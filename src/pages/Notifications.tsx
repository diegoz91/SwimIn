import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { databaseService } from '@/services/database';
import { client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import { Icon } from '@/components/ui/Icon';
import { PageLoader } from '@/components/common/PageLoader';
import { notificationMeta } from '@/features/notifications/notificationMeta';
import { formatRelativeTime } from '@/utils/format';
import type { AppNotification } from '@/types/types';
import { PushPrompt } from '@/components/common/PushPrompt';

type Filter = 'all' | 'unread';

const Notifications: React.FC = () => {
    usePageTitle('Notifiche');
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [items, setItems] = useState<AppNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<Filter>('all');
    const [isMarking, setIsMarking] = useState(false);

    const load = useCallback(async () => {
        if (!user) return;
        try {
            setItems(await databaseService.getNotifications(user.$id));
        } catch (error) {
            console.error('getNotifications:', error);
            showToast('Impossibile caricare le notifiche.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [user, showToast]);

    useEffect(() => {
        load();
    }, [load]);

    // Nuove notifiche in tempo reale.
    useEffect(() => {
        if (!user) return;
        const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.notifications}.documents`;
        const unsubscribe = client.subscribe(channel, (event) => {
            const payload = event.payload as AppNotification;
            if (payload?.userId !== user.$id) return;
            setItems((prev) => [payload, ...prev.filter((n) => n.$id !== payload.$id)]);
        });
        return () => unsubscribe();
    }, [user]);

    const unreadCount = items.filter((n) => !n.isRead).length;
    const visible = filter === 'unread' ? items.filter((n) => !n.isRead) : items;

    const open = async (n: AppNotification) => {
        if (!n.isRead) {
            setItems((prev) => prev.map((x) => (x.$id === n.$id ? { ...x, isRead: true } : x)));
            databaseService.markNotificationAsRead(n.$id);
        }
        navigate(notificationMeta(n).href);
    };

    const markAll = async () => {
        setIsMarking(true);
        try {
            await databaseService.markAllNotificationsRead();
            setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Operazione non riuscita.', 'error');
        } finally {
            setIsMarking(false);
        }
    };

    if (isLoading) return <PageLoader />;

    return (
        <div className="pt-4 max-w-2xl mx-auto w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h1 className="text-2xl font-extrabold text-slate-900">Notifiche</h1>
                <button
                    onClick={markAll}
                    disabled={unreadCount === 0 || isMarking}
                    className="text-sm font-bold text-blue-600 hover:text-blue-800 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                    Segna tutte come lette
                </button>
            </div>

            <PushPrompt />

            <div className="inline-flex bg-slate-200/60 p-1 rounded-full mb-4" role="tablist">
                {(['all', 'unread'] as Filter[]).map((f) => (
                    <button
                        key={f}
                        role="tab"
                        aria-selected={filter === f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-1.5 rounded-full text-sm font-bold transition ${filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        {f === 'all' ? 'Tutte' : `Da leggere${unreadCount ? ` (${unreadCount})` : ''}`}
                    </button>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {visible.length === 0 ? (
                    <div className="p-10 text-center">
                        <Icon type="bell" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                        <p className="font-bold text-slate-700">{filter === 'unread' ? 'Sei in pari!' : 'Ancora nessuna notifica'}</p>
                        <p className="text-sm text-slate-500 mt-1">Qui vedrai consigli, commenti, richieste di collegamento e aggiornamenti sulle candidature.</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {visible.map((n) => {
                            const meta = notificationMeta(n);
                            return (
                                <li key={n.$id}>
                                    <button
                                        onClick={() => open(n)}
                                        className={`w-full text-left flex gap-3 p-4 hover:bg-slate-50 transition outline-none focus-visible:bg-slate-50 ${n.isRead ? '' : 'bg-blue-50/40'}`}
                                    >
                                        <span className={`mt-0.5 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${meta.tone}`}>
                                            <Icon type={meta.icon} className="w-5 h-5" />
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <span className={`block text-sm ${n.isRead ? 'text-slate-700' : 'text-slate-900 font-semibold'}`}>{n.content}</span>
                                            <span className="block text-xs text-slate-400 mt-1">{formatRelativeTime(n.$createdAt)}</span>
                                        </span>
                                        {!n.isRead && <span className="w-2.5 h-2.5 mt-2 rounded-full bg-blue-600 flex-shrink-0" aria-label="Non letta" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default Notifications;
