import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import { Icon } from '@/components/ui/Icon';
import type { AppNotification } from '@/types/types';
import { notificationMeta } from '@/features/notifications/notificationMeta';
import { formatRelativeTime } from '@/utils/format';

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayAvatar = useMemo(() => {
    if (!user) return '';
    if (user.userType === 'professional' && user.avatar) return user.avatar;
    if (user.userType === 'structure' && user.logo) return user.logo;
    const name = user.firstName || user.structureName || 'Utente';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=eff6ff&color=1d4ed8&bold=true&size=128`;
  }, [user]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    const currentUserId = user?.$id;
    if (!currentUserId) return;

    const setupNotifications = async () => {
        try {
            if (typeof databaseService.getUnreadNotifications === 'function') {
                const unread = await databaseService.getUnreadNotifications(currentUserId);
                setNotifications(unread || []);
            }

            const notifCollection = (APPWRITE_CONFIG.collections as any).notifications;
            if (notifCollection) {
                const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${notifCollection}.documents`;
                unsubscribe = client.subscribe(channel, (response) => {
                    const payload = response.payload as AppNotification;
                    if (payload?.userId !== currentUserId) return;
                    // Nuova notifica non letta in cima; se diventa letta (anche da un'altra scheda) la togliamo.
                    setNotifications(prev => {
                        const others = prev.filter(n => n.$id !== payload.$id);
                        return payload.isRead ? others : [payload, ...others];
                    });
                });
            }
        } catch (error) {
            console.log("Sincronizzazione notifiche disabilitata o non pronta.");
        }
    };

    setupNotifications();
    
    return () => { 
        if (unsubscribe) unsubscribe(); 
    };
  }, [user?.$id]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
              setIsDropdownOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (notif: AppNotification) => {
      try {
          if (typeof databaseService.markNotificationAsRead === 'function') {
              await databaseService.markNotificationAsRead(notif.$id);
          }
          setNotifications(prev => prev.filter(n => n.$id !== notif.$id));
      } catch (e) {
          console.error('markNotificationAsRead:', e);
      }
      
      setIsDropdownOpen(false);
      navigate(notificationMeta(notif).href);
  };

  return (
    <header className="fixed top-0 left-0 w-full bg-white/90 backdrop-blur-md shadow-sm border-b border-slate-200 z-50 h-16 transition-all duration-300">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex justify-between items-center">
        
        {/* LOGO */}
        <Link to="/" className="flex items-center gap-2 sm:gap-3 transition-transform active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg group">
          <div className="bg-blue-600 text-white p-1.5 sm:p-2 rounded-xl shadow-lg shadow-blue-200 group-hover:rotate-6 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="font-extrabold text-xl sm:text-2xl text-slate-800 tracking-tight">
            SwimWave<span className="text-blue-600">Up</span>
          </span>
        </Link>

        {/* MENU NAVIGAZIONE CENTRALE CON TASTO LIVE */}
        <nav className="hidden md:flex items-center gap-2 font-semibold text-sm">
          {[
            { to: '/', label: 'Feed' },
            { to: '/jobs', label: 'Bacheca Lavoro' },
            { to: '/network', label: 'Il mio Network' },
            { to: '/messages', label: 'Messaggi' },
            { to: '/live', label: 'Live', isLive: true }
          ].map((item) => (
            <NavLink 
              key={item.to} 
              to={item.to} 
              className={({ isActive }) => `
                px-4 py-2 rounded-lg transition-all duration-200 flex items-center gap-2
                ${item.isLive 
                    ? (isActive ? 'text-red-700 bg-red-50 shadow-inner' : 'text-red-600 hover:text-red-700 hover:bg-red-50')
                    : (isActive ? 'text-blue-600 bg-blue-50 shadow-inner' : 'text-slate-600 hover:text-blue-600 hover:bg-slate-50')
                }
              `}
            >
              {item.isLive && (
                  <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
              )}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* MENU DESTRA (UTENTE LOGGATO O TASTO ACCEDI) */}
        <div className="flex items-center">
          {user ? (
            <div className="flex items-center gap-2 sm:gap-4 md:pl-6 md:border-l border-slate-200">
              
              {/* NOTIFICHE */}
              <div className="relative" ref={dropdownRef}>
                  <button 
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      aria-label={notifications.length ? `Notifiche, ${notifications.length} da leggere` : 'Notifiche'}
                      aria-expanded={isDropdownOpen}
                      className="relative p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                      <Icon type="bell" className="w-6 h-6" />
                      
                      {notifications.length > 0 && (
                          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-bold border-2 border-white rounded-full flex items-center justify-center">
                              {notifications.length > 9 ? '9+' : notifications.length}
                          </span>
                      )}
                  </button>

                  {isDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in slide-in-from-top-2">
                          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                              <h3 className="font-bold text-slate-800">Notifiche</h3>
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{notifications.length} nuove</span>
                          </div>
                          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                              {notifications.length === 0 ? (
                                  <div className="p-6 text-center text-slate-400">
                                      <Icon type="bell" className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                      <p className="text-sm font-medium">Nessuna nuova notifica</p>
                                  </div>
                              ) : (
                                  <div className="divide-y divide-slate-50">
                                      {notifications.slice(0, 8).map(n => {
                                          const meta = notificationMeta(n);
                                          return (
                                          <button key={n.$id} onClick={() => handleNotificationClick(n)} className="w-full text-left p-4 hover:bg-slate-50 transition-colors flex gap-3 group outline-none focus-visible:bg-slate-50">
                                              <span className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${meta.tone}`}>
                                                  <Icon type={meta.icon} className="w-4 h-4" />
                                              </span>
                                              <span>
                                                  <span className="block text-sm text-slate-800 font-medium group-hover:text-blue-600 transition-colors line-clamp-2">{n.content}</span>
                                                  <span className="block text-[11px] text-slate-400 mt-1 font-semibold">{formatRelativeTime(n.$createdAt)}</span>
                                              </span>
                                          </button>
                                          );
                                      })}
                                  </div>
                              )}
                          </div>
                          <Link to="/notifiche" onClick={() => setIsDropdownOpen(false)} className="block text-center text-sm font-bold text-blue-600 hover:bg-blue-50 py-3 border-t border-slate-100">
                              Vedi tutte le notifiche
                          </Link>
                      </div>
                  )}
              </div>

              {/* TASTO PROFILO RAPIDO E AVATAR */}
              <Link to="/profile" className="flex items-center gap-2 hover:bg-slate-50 p-1 pr-2 sm:pr-4 rounded-full transition-all border border-transparent hover:border-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 group">
                <div className="relative">
                  <img src={displayAvatar} alt="Profilo" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border-2 border-white shadow-sm ring-1 ring-slate-100 group-hover:ring-blue-400 transition-all" />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></div>
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-sm font-bold text-slate-800 leading-none max-w-[100px] truncate">{user.firstName || user.structureName}</span>
                  <span className="text-[10px] text-slate-500 font-medium">Visualizza profilo</span>
                </div>
              </Link>
              
              {/* TASTO LOGOUT */}
              <button onClick={logout} className="text-slate-400 hover:text-red-600 p-2 rounded-xl hover:bg-red-50 transition-all outline-none focus-visible:ring-2 focus-visible:ring-red-500 active:scale-90" title="Esci da SwimIn">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          ) : (
            // FALLBACK: UTENTE NON LOGGATO
            <div className="flex gap-2 pl-4">
              <Link to="/login" className="bg-blue-600 text-white font-bold px-6 py-2.5 rounded-full hover:bg-blue-700 transition-all active:scale-95 text-sm">
                Accedi a SwimIn
              </Link>
            </div>
          )}
        </div>

      </div>
    </header>
  );
};

export default Header;