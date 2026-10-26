import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
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
import { ThemeSegmented } from '@/components/common/ThemePicker';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { isPremium } from '@/utils/premium';
import { useMyTeams } from '@/hooks/useMyTeams';

const NAV: { to: string; label: string; icon: IconType; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/network', label: 'Rete', icon: 'users' },
  { to: '/jobs', label: 'Lavoro', icon: 'briefcase' },
  { to: '/messages', label: 'Messaggi', icon: 'chat-bubble' },
  { to: '/live', label: 'Live', icon: 'video' },
];

/** Chi nuota per passione vede le piscine al posto della bacheca lavoro. */
export const navFor = (user: Parameters<typeof isEnthusiast>[0]) =>
  isEnthusiast(user) ? NAV.map((n) => (n.to === '/jobs' ? { to: '/strutture', label: 'Piscine', icon: 'building' as IconType } : n)) : NAV;

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
  const { isAdmin } = useBlocks();
  const navigate = useNavigate();
  const location = useLocation();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [openMenu, setOpenMenu] = useState<'notifications' | 'account' | null>(null);
  const unreadMessages = useUnreadMessages(user?.$id);

  const close = React.useCallback(() => setOpenMenu(null), []);
  const notifRef = useDismiss(openMenu === 'notifications', close);
  const accountRef = useDismiss(openMenu === 'account', close);

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
  const displayName = isProfessional
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Il mio profilo'
    : user.structureName || 'La mia struttura';
  const displayAvatar = (isProfessional ? user.avatar : user.logo) || initialsAvatar(displayName);

  const openNotification = async (notif: AppNotification) => {
    setNotifications((prev) => prev.filter((n) => n.$id !== notif.$id));
    close();
    databaseService.markNotificationAsRead(notif.$id);
    navigate(notificationMeta(notif).href);
  };

  return (
    <header className="relative flex-shrink-0 z-50 bg-white/95 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 lg:px-8 flex items-center gap-3 sm:gap-6">
        <Link to="/" className="flex-shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-corsia-500" aria-label="SwimIn, vai alla home">
          <span className="sm:hidden"><Brand size="sm" markOnly /></span>
          <span className="hidden sm:inline-flex"><Brand size="md" /></span>
        </Link>

        <div className="flex-1 max-w-sm hidden lg:block">
          <SearchTypeahead />
        </div>

        <nav className="hidden md:flex items-stretch h-full ml-auto" aria-label="Navigazione principale">
          {navFor(user).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-0.5 w-[4.5rem] lg:w-20 text-[11px] font-semibold transition-colors outline-none focus-visible:bg-piastrella ${
                  isActive ? 'text-abisso after:absolute after:bottom-0 after:inset-x-3 after:h-[3px] after:rounded-t after:bg-corsia-600' : 'text-slate-500 hover:text-abisso'
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
        </nav>

        <div className="flex items-center gap-1 sm:gap-2 ml-auto md:ml-0 md:pl-4 md:border-l border-slate-200 h-10">
          <Link to="/cerca" className="lg:hidden p-2 text-slate-500 hover:text-abisso rounded-full" aria-label="Cerca">
            <Icon type="search" className="w-6 h-6" />
          </Link>

          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setOpenMenu(openMenu === 'notifications' ? null : 'notifications')}
              aria-label={notifications.length ? `Notifiche, ${notifications.length} da leggere` : 'Notifiche'}
              aria-expanded={openMenu === 'notifications'}
              className="relative p-2 text-slate-500 hover:text-abisso rounded-full outline-none focus-visible:ring-2 focus-visible:ring-corsia-500"
            >
              <Icon type="bell" className="w-6 h-6" />
              <Badge count={notifications.length} />
            </button>

            {openMenu === 'notifications' && (
              <div className="absolute right-0 mt-3 w-[min(22rem,calc(100vw-2rem))] bg-white rounded-2xl shadow-lift border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top-right">
                <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                  <h2 className="font-display text-xl font-bold text-abisso">Notifiche</h2>
                  {notifications.length > 0 && <span className="text-xs font-semibold text-corsia-700">{notifications.length} da leggere</span>}
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="p-6 text-center text-sm text-slate-500">Sei in pari: nessuna notifica da leggere.</p>
                  ) : (
                    <ul className="divide-y divide-slate-50">
                      {notifications.slice(0, 8).map((n) => {
                        const meta = notificationMeta(n);
                        return (
                          <li key={n.$id}>
                            <button onClick={() => openNotification(n)} className="w-full text-left px-4 py-3 hover:bg-piastrella flex gap-3 outline-none focus-visible:bg-piastrella">
                              <span className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${meta.tone}`}>
                                <Icon type={meta.icon} className="w-4 h-4" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm text-abisso line-clamp-2">{n.content}</span>
                                <span className="block text-xs text-slate-400 mt-0.5">{formatRelativeTime(n.$createdAt)}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <Link to="/notifiche" className="block text-center text-sm font-semibold text-corsia-700 hover:bg-piastrella py-3 border-t border-slate-100">
                  Vedi tutte le notifiche
                </Link>
              </div>
            )}
          </div>

          <div className="relative" ref={accountRef}>
            <button
              onClick={() => setOpenMenu(openMenu === 'account' ? null : 'account')}
              aria-label="Menu account"
              aria-expanded={openMenu === 'account'}
              className="flex items-center gap-2 p-0.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-corsia-500"
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
                <div className="px-3 pb-2">
                  <ThemeSegmented />
                </div>
                {teams && teams.length > 0 && (
                  <div className="border-t border-slate-100 py-1" role="group" aria-labelledby="menu-teams">
                    <p id="menu-teams" className="px-4 pt-2 pb-1 text-xs font-semibold text-slate-500">Lavori presso</p>
                    {teams.slice(0, 5).map((t) => (
                      <Link key={t.structureId} to={`/profile/${t.structureId}?area=staff`} role="menuitem" className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-piastrella">
                        <img src={t.logo || initialsAvatar(t.name)} alt="" className="w-7 h-7 rounded-lg object-cover bg-white border border-slate-100 flex-shrink-0" />
                        <span className="min-w-0 flex-1 truncate font-medium text-abisso">{t.name}</span>
                      </Link>
                    ))}
                    <Link to="/turni" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella">
                      <Icon type="calendar" className="w-5 h-5 text-slate-400" /> Calendario dei turni
                    </Link>
                  </div>
                )}
                <div className="border-t border-slate-100 py-1">
                  <Link to="/statistiche" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella">
                    <Icon type="chart" className="w-5 h-5 text-slate-400" /> Statistiche
                  </Link>
                  <Link to="/profile?tab=impostazioni" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella">
                    <Icon type="settings" className="w-5 h-5 text-slate-400" /> Impostazioni e privacy
                  </Link>
                  {user?.userType === 'professional' && !isEnthusiast(user) && (
                    <>
                      <Link to="/jobs/candidature" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella">
                        <Icon type="send" className="w-5 h-5 text-slate-400" /> Le mie candidature
                      </Link>
                      {!(teams && teams.length > 0) && (
                        <Link to="/turni" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella">
                          <Icon type="calendar" className="w-5 h-5 text-slate-400" /> I miei turni
                        </Link>
                      )}
                    </>
                  )}
                  {(user?.userType === 'structure' || ((user as { managedFacilities?: string[] } | null)?.managedFacilities || []).length > 0) && (
                    <>
                      <Link to="/jobs/annunci" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella">
                        <Icon type="briefcase" className="w-5 h-5 text-slate-400" /> I miei annunci
                      </Link>
                      <Link to="/talenti" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella">
                        <Icon type="search" className="w-5 h-5 text-slate-400" /> Cerca personale
                      </Link>
                    </>
                  )}
                  {!isEnthusiast(user) && (
                    <Link to="/strutture" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella">
                      <Icon type="building" className="w-5 h-5 text-slate-400" /> Piscine e strutture
                    </Link>
                  )}
                  <Link to="/gruppi" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella">
                    <Icon type="users" className="w-5 h-5 text-slate-400" /> Gruppi
                  </Link>
                  <Link to="/eventi" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella">
                    <Icon type="calendar" className="w-5 h-5 text-slate-400" /> Eventi
                  </Link>
                  <Link to="/salvati" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella">
                    <Icon type="bookmark" className="w-5 h-5 text-slate-400" /> Elementi salvati
                  </Link>
                  {isAdmin && (
                    <Link to="/admin" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella">
                      <Icon type="shield" className="w-5 h-5 text-slate-400" /> Amministrazione
                    </Link>
                  )}
                  <Link to="/notifiche" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella">
                    <Icon type="bell" className="w-5 h-5 text-slate-400" /> Notifiche
                  </Link>
                  <button onClick={logout} role="menuitem" className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-piastrella">
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
