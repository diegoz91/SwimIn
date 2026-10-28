import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import { Icon, type IconType } from '@/components/ui/Icon';
import { Brand } from '@/components/ui/Brand';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { notificationMeta } from '@/features/notifications/notificationMeta';
import { formatRelativeTime } from '@/utils/format';
import { initialsAvatar } from '@/utils/avatar';
import type { AppNotification } from '@/types/types';
import { isEnthusiast } from '@/utils/profile';
import { useBlocks } from '@/context/BlocksContext';
import { SearchTypeahead } from '@/components/layout/SearchTypeahead';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { isPremium } from '@/utils/premium';
import { useMyTeams } from '@/hooks/useMyTeams';
import { useToast } from '@/context/ToastContext';
import { LIVE_ENABLED } from '@/config/features';
import { openFeedback } from '@/features/feedback/Feedback';

const NAV: { to: string; label: string; icon: IconType; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/network', label: 'Rete', icon: 'users' },
  { to: '/jobs', label: 'Lavoro', icon: 'briefcase' },
  { to: '/messages', label: 'Messaggi', icon: 'chat-bubble' },
  LIVE_ENABLED ? { to: '/live', label: 'Live', icon: 'video' } : { to: '/eventi', label: 'Eventi', icon: 'calendar' },
];

/** Chi nuota per passione vede le piscine al posto della bacheca lavoro. */
export const navFor = (user: Parameters<typeof isEnthusiast>[0]) =>
  isEnthusiast(user) ? NAV.map((n) => (n.to === '/jobs' ? { to: '/strutture', label: 'Piscine', icon: 'building' as IconType } : n)) : NAV;

/**
 * "Altro" nella barra in alto: le sezioni da esplorare che non stanno nella barra.
 * Su smartphone (barra in fondo, senza "Altro") le stesse voci sono nel menu dell'account.
 */
export const moreFor = (user: Parameters<typeof isEnthusiast>[0]): { to: string; label: string; icon: IconType }[] => [
  { to: '/gruppi', label: 'Gruppi', icon: 'users' },
  ...(isEnthusiast(user) ? [] : [{ to: '/strutture', label: 'Piscine e strutture', icon: 'building' as IconType }]),
  ...(LIVE_ENABLED ? [{ to: '/eventi', label: 'Eventi', icon: 'calendar' as IconType }] : []),
];

/** Chiude un menu a tendina al clic fuori o con Esc. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

const Badge: React.FC<{ count: number }> = ({ count }) =>
  count > 0 ? (
    <span className="absolute -top-1 -right-1.5 min-w-[18px] h-[18px] px-1 bg-galleggiante text-white text-[10px] font-bold border-2 border-white rounded-full flex items-center justify-center leading-none">
      {count > 9 ? '9+' : count}
    </span>
  ) : null;

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const { teams } = useMyTeams();
  const { showToast } = useToast();
  const { isAdmin } = useBlocks();
  const navigate = useNavigate();
  const location = useLocation();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [openMenu, setOpenMenu] = useState<'notifications' | 'account' | 'more' | null>(null);
  const unreadMessages = useUnreadMessages(user?.$id);

  const close = React.useCallback(() => setOpenMenu(null), []);
  const notifRef = useDismiss(openMenu === 'notifications', close);
  const accountRef = useDismiss(openMenu === 'account', close);
  const moreRef = useDismiss(openMenu === 'more', close);
  // Il menu si chiude quando si cambia pagina (anche con indietro/avanti).
  useEffect(() => setOpenMenu(null), [location.pathname]);

  useEffect(close, [location.pathname, close]);

  // Notifiche non lette + aggiornamento in tempo reale.
  useEffect(() => {
    const currentUserId = user?.$id;
    if (!currentUserId) return;
    databaseService.getUnreadNotifications(currentUserId).then(setNotifications);

    const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.notifications}.documents`;
    const unsubscribe = client.subscribe(channel, (response) => {
      const payload = response.payload as AppNotification;
      if (payload?.userId !== currentUserId) return;
      setNotifications((prev) => {
        const others = prev.filter((n) => n.$id !== payload.$id);
        return payload.isRead ? others : [payload, ...others];
      });
    });
    return () => unsubscribe();
  }, [user?.$id]);

  if (!user) return null;

  const isProfessional = user.userType === 'professional';
  const moreItems = moreFor(user);
  const isWorker = isProfessional && !isEnthusiast(user);
  const managesStructure = user.userType === 'structure' || (teams || []).some((t) => t.role === 'admin');
  const menuItem = 'flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella outline-hidden focus-visible:bg-piastrella';
  const displayName = isProfessional
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Il mio profilo'
    : user.structureName || 'La mia struttura';
  const displayAvatar = (isProfessional ? user.avatar : user.logo) || initialsAvatar(displayName);

  // Dalla campanella si segnano come lette senza aprire la pagina delle notifiche.
  const markRead = async (notif: AppNotification) => {
    setNotifications((prev) => prev.filter((n) => n.$id !== notif.$id));
    const ok = await databaseService.markNotificationAsRead(notif.$id);
    if (!ok) {
      setNotifications((prev) => (prev.some((n) => n.$id === notif.$id) ? prev : [notif, ...prev]));
      showToast('Non è stato possibile segnare la notifica come letta.', 'error');
    }
  };
  const markAllRead = async () => {
    const before = notifications;
    setNotifications([]);
    try {
      await databaseService.markAllNotificationsRead();
    } catch (err) {
      console.error('Notifiche:', err);
      setNotifications(before);
      showToast('Non è stato possibile segnare le notifiche come lette.', 'error');
    }
  };

  const openNotification = async (notif: AppNotification) => {
    setNotifications((prev) => prev.filter((n) => n.$id !== notif.$id));
    close();
    databaseService.markNotificationAsRead(notif.$id);
    navigate(notificationMeta(notif).href);
  };

  return (
    <header className="relative shrink-0 z-50 bg-white/95 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 lg:px-8 flex items-center gap-3 md:gap-6">
        <Link to="/" className="shrink-0 rounded-lg outline-hidden focus-visible:ring-2 focus-visible:ring-corsia-500" aria-label="SwimIn, vai alla home">
          <span className="md:hidden"><Brand size="sm" markOnly /></span>
          <span className="hidden md:inline-flex"><Brand size="md" /></span>
        </Link>

        <div className="flex-1 max-w-sm hidden lg:block">
          <SearchTypeahead />
        </div>

        <nav className="hidden sm:flex items-stretch h-full ml-auto" aria-label="Navigazione principale" data-nav="top">
          {navFor(user).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-0.5 w-16 md:w-[4.5rem] lg:w-20 text-[11px] font-semibold transition-colors outline-hidden focus-visible:bg-piastrella ${
                  isActive ? 'text-abisso after:absolute after:bottom-0 after:inset-x-3 after:h-[3px] after:rounded-t-sm after:bg-corsia-600' : 'text-slate-500 hover:text-abisso'
                }`
              }
            >
              <span className="relative">
                <Icon type={item.icon} className="w-6 h-6" />
                {item.to === '/messages' && <Badge count={unreadMessages} />}
                {item.to === '/live' && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-galleggiante ring-2 ring-white" aria-hidden="true" />
                )}
              </span>
              {item.label}
            </NavLink>
          ))}
          <div className="relative flex" ref={moreRef}>
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === 'more' ? null : 'more')}
              aria-expanded={openMenu === 'more'}
              aria-haspopup="menu"
              className={`relative flex flex-col items-center justify-center gap-0.5 w-16 md:w-[4.5rem] lg:w-20 text-[11px] font-semibold transition-colors outline-hidden focus-visible:bg-piastrella ${
                moreItems.some((m) => location.pathname.startsWith(m.to))
                  ? 'text-abisso after:absolute after:bottom-0 after:inset-x-3 after:h-[3px] after:rounded-t-sm after:bg-corsia-600'
                  : 'text-slate-500 hover:text-abisso'
              }`}
            >
              <Icon type="bars" className="w-6 h-6" />
              <span className="flex items-center gap-0.5">Altro <Icon type="chevron-right" className={`w-3 h-3 transition-transform ${openMenu === 'more' ? '-rotate-90' : 'rotate-90'}`} /></span>
            </button>
            {openMenu === 'more' && (
              <div role="menu" aria-label="Altro" className="absolute right-0 top-full mt-1 w-64 bg-white rounded-2xl shadow-lift border border-slate-100 py-2 animate-in fade-in zoom-in-95 duration-150 origin-top-right z-50">
                {moreItems.map((m) => (
                  <Link key={m.to} to={m.to} role="menuitem" className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-abisso hover:bg-piastrella outline-hidden focus-visible:bg-piastrella">
                    <Icon type={m.icon} className="w-5 h-5 text-slate-500" /> {m.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-1 sm:gap-2 ml-auto sm:ml-0 sm:pl-2 md:pl-4 sm:border-l border-slate-200 h-10">
          <Link to="/cerca" className="lg:hidden p-2 text-slate-500 hover:text-abisso rounded-full" aria-label="Cerca">
            <Icon type="search" className="w-6 h-6" />
          </Link>

          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setOpenMenu(openMenu === 'notifications' ? null : 'notifications')}
              aria-label={notifications.length ? `Notifiche, ${notifications.length} da leggere` : 'Notifiche'}
              aria-expanded={openMenu === 'notifications'}
              className="relative p-2 text-slate-500 hover:text-abisso rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-corsia-500"
            >
              <Icon type="bell" className="w-6 h-6" />
              <Badge count={notifications.length} />
            </button>

            {openMenu === 'notifications' && (
              <div className="absolute right-0 mt-3 w-[min(22rem,calc(100vw-2rem))] bg-white rounded-2xl shadow-lift border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top-right">
                <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-xl font-bold text-abisso leading-tight">Notifiche</h2>
                    {notifications.length > 0 && <p className="text-xs text-slate-500">{notifications.length === 1 ? '1 da leggere' : `${notifications.length} da leggere`}</p>}
                  </div>
                  {notifications.length > 0 && (
                    <button type="button" onClick={markAllRead} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-corsia-700 hover:bg-corsia-50 outline-hidden focus-visible:ring-2 focus-visible:ring-corsia-500">
                      <Icon type="check-double" className="w-4 h-4" /> Segna tutte come lette
                    </button>
                  )}
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="p-6 text-center text-sm text-slate-500">Sei in pari: nessuna notifica da leggere.</p>
                  ) : (
                    <ul className="divide-y divide-slate-50">
                      {notifications.slice(0, 8).map((n) => {
                        const meta = notificationMeta(n);
                        return (
                          <li key={n.$id} className="group relative flex items-stretch hover:bg-piastrella">
                            <button onClick={() => openNotification(n)} className="flex-1 min-w-0 text-left pl-4 pr-2 py-3 flex gap-3 outline-hidden focus-visible:bg-piastrella">
                              <span className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${meta.tone}`}>
                                <Icon type={meta.icon} className="w-4 h-4" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm text-abisso line-clamp-2">{n.content}</span>
                                <span className="block text-xs text-slate-400 mt-0.5">{formatRelativeTime(n.$createdAt)}</span>
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => markRead(n)}
                              aria-label={`Segna come letta: ${n.content}`}
                              title="Segna come letta"
                              className="shrink-0 self-center mr-2 w-9 h-9 grid place-items-center rounded-full text-slate-400 hover:text-corsia-700 hover:bg-white lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100 outline-hidden focus-visible:ring-2 focus-visible:ring-corsia-500"
                            >
                              <Icon type="check" className="w-4 h-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <Link to="/notifiche" className="block text-center text-sm font-semibold text-corsia-700 hover:bg-piastrella py-3 border-t border-slate-100">
                  {notifications.length > 8 ? `Vedi tutte (altre ${notifications.length - 8} da leggere)` : 'Vedi tutte le notifiche'}
                </Link>
              </div>
            )}
          </div>

          <div className="relative" ref={accountRef}>
            <button
              onClick={() => setOpenMenu(openMenu === 'account' ? null : 'account')}
              aria-label="Menu account"
              aria-expanded={openMenu === 'account'}
              className="flex items-center gap-2 p-0.5 rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-corsia-500"
            >
              <img src={displayAvatar} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow-card" />
              <Icon type="chevron-right" className="w-4 h-4 text-slate-400 rotate-90 hidden lg:block" />
            </button>

            {openMenu === 'account' && (
              <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-lift border border-slate-100 overflow-x-hidden overflow-y-auto overscroll-contain max-h-[calc(100dvh-5.5rem)] animate-in fade-in zoom-in-95 duration-150 origin-top-right" role="menu">
                <Link to="/profile" role="menuitem" className="flex items-center gap-3 p-4 hover:bg-piastrella">
                  <img src={displayAvatar} alt="" className="w-12 h-12 rounded-full object-cover" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-abisso truncate">{displayName}</span>
                    <span className="block text-xs text-corsia-700 font-semibold">Vedi il profilo</span>
                  </span>
                </Link>
                <Link to="/premium" role="menuitem" className="flex items-center gap-3 mx-3 mb-2 px-3 py-2.5 rounded-xl bg-oro-50 text-sm font-semibold text-abisso hover:bg-oro-100">
                  <PremiumBadge /> {isPremium(user) ? 'Il tuo Premium' : user?.premiumTrialUsed ? 'Passa a Premium' : 'Prova Premium gratis'}
                </Link>
                {/* Solo ciò che non è già nella barra: il proprio lavoro, i salvati, account. */}
                {(isWorker || managesStructure || (teams && teams.length > 0)) && (
                  <div className="border-t border-slate-100 py-1" role="group" aria-label="Il tuo lavoro">
                    {isWorker && (
                      <Link to="/jobs/candidature" role="menuitem" className={menuItem}>
                        <Icon type="send" className="w-5 h-5 text-slate-400" /> Le mie candidature
                      </Link>
                    )}
                    {(isWorker || (teams && teams.length > 0)) && (
                      <Link to="/turni" role="menuitem" className={menuItem}>
                        <Icon type="calendar" className="w-5 h-5 text-slate-400" /> I miei turni
                      </Link>
                    )}
                    {managesStructure && (
                      <>
                        <Link to="/jobs/annunci" role="menuitem" className={menuItem}>
                          <Icon type="briefcase" className="w-5 h-5 text-slate-400" /> I miei annunci
                        </Link>
                        <Link to="/talenti" role="menuitem" className={menuItem}>
                          <Icon type="search" className="w-5 h-5 text-slate-400" /> Cerca personale
                        </Link>
                      </>
                    )}
                  </div>
                )}
                <div className="border-t border-slate-100 py-1">
                  <Link to="/salvati" role="menuitem" className={menuItem}>
                    <Icon type="bookmark" className="w-5 h-5 text-slate-400" /> Elementi salvati
                  </Link>
                  {/* Su smartphone la barra in fondo non ha "Altro": qui le stesse voci. */}
                  {moreItems.map((m) => (
                    <Link key={m.to} to={m.to} role="menuitem" className={`${menuItem} sm:hidden`}>
                      <Icon type={m.icon} className="w-5 h-5 text-slate-400" /> {m.label}
                    </Link>
                  ))}
                  {isAdmin && (
                    <Link to="/admin" role="menuitem" className={menuItem}>
                      <Icon type="shield" className="w-5 h-5 text-slate-400" /> Amministrazione
                    </Link>
                  )}
                </div>
                <div className="border-t border-slate-100 py-1">
                  <Link to="/profile?tab=impostazioni" role="menuitem" className={menuItem}>
                    <Icon type="settings" className="w-5 h-5 text-slate-400" /> Impostazioni e privacy
                  </Link>
                  <button type="button" onClick={() => { setOpenMenu(null); openFeedback(); }} role="menuitem" className={`w-full ${menuItem}`}>
                    <Icon type="chat-bubble" className="w-5 h-5 text-slate-400" /> Scrivici un suggerimento
                  </button>
                  <button type="button" onClick={logout} role="menuitem" className={`w-full ${menuItem}`}>
                    <Icon type="logout" className="w-5 h-5 text-slate-400" /> Esci
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="lane-rope" aria-hidden="true" />
    </header>
  );
};

export default Header;
