import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { APP_CONFIG } from '@/config/constants';
import { Icon } from '@/components/ui/Icon';
import type { AuthenticatedUser } from '@/types/types';

interface SettingsProps {
  currentUser: AuthenticatedUser;
  onNavigate: (view: string, id?: string) => void;
  onLogout?: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ 
  currentUser, 
  onNavigate, 
  onLogout 
}) => {
  const [activeTab, setActiveTab] = useState<'account' | 'privacy' | 'notifications' | 'about'>('account');
  
  const isProfessional = currentUser.userType === 'professional';

  const menuItems = [
    { id: 'account', label: 'Account', icon: 'user' },
    { id: 'privacy', label: 'Privacy e Sicurezza', icon: 'building' },
    { id: 'notifications', label: 'Notifiche', icon: 'bell' },
    { id: 'about', label: 'Info App', icon: 'info' }
  ] as const;

  const displayName = isProfessional 
    ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || 'Utente'
    : currentUser.structureName || 'Struttura';
    
  const displayAvatar = (isProfessional ? currentUser.avatar : currentUser.logo) || 
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=eff6ff&color=1d4ed8`;

  return (
    <div className="min-h-[calc(100vh-6rem)] max-w-5xl mx-auto w-full pb-20 md:pb-8 animate-in fade-in duration-300">
      
      <div className="mb-6 px-4 sm:px-0">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
          <Icon type="settings" className="w-8 h-8 text-slate-400" />
          Impostazioni
        </h1>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Sidebar Navigazione Menu */}
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden sticky top-24">
            
            {/* Riepilogo Utente */}
            <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                <img 
                    src={displayAvatar} 
                    alt={displayName} 
                    className="w-12 h-12 rounded-full object-cover border border-slate-200 shadow-sm bg-white" 
                />
                <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{displayName}</p>
                    <p className="text-xs text-slate-500 font-medium truncate">{currentUser.email}</p>
                </div>
            </div>

            {/* Menu Items */}
            <nav className="p-2 space-y-1">
                {menuItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            activeTab === item.id 
                            ? 'bg-blue-50 text-blue-700' 
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                    >
                        <Icon type={item.icon as any} className={`w-5 h-5 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`} />
                        {item.label}
                    </button>
                ))}
            </nav>
          </div>
        </div>

        {/* Area Contenuto Destra */}
        <div className="flex-1">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px]">
            
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-xl font-extrabold text-slate-800">
                  {menuItems.find(m => m.id === activeTab)?.label}
              </h2>
            </div>

            <div className="p-6">
              
              {activeTab === 'account' && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                  <div>
                    <h3 className="font-bold text-slate-800 mb-2">Informazioni Personali</h3>
                    <p className="text-sm text-slate-500 mb-4">Gestisci le informazioni del tuo profilo base e la tua email.</p>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="flex justify-between items-center py-2 border-b border-slate-200 last:border-0">
                            <span className="text-sm text-slate-500 font-medium">Email Registrata</span>
                            <span className="text-sm font-bold text-slate-800">{currentUser.email}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-200 last:border-0">
                            <span className="text-sm text-slate-500 font-medium">Tipologia Account</span>
                            <span className="text-sm font-bold text-slate-800 capitalize">{currentUser.userType}</span>
                        </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-bold text-red-600 mb-2">Zona Pericolosa</h3>
                    <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center justify-between">
                        <div>
                            <p className="font-bold text-slate-800 text-sm">Elimina Account</p>
                            <p className="text-xs text-slate-500 mt-1">Questa azione è irreversibile e cancellerà tutti i tuoi dati.</p>
                        </div>
                        <button className="px-4 py-2 bg-white border border-red-200 text-red-600 font-bold rounded-lg hover:bg-red-600 hover:text-white transition-colors text-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500 shadow-sm">
                            Elimina
                        </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'about' && (
                <div className="animate-in slide-in-from-right-4 duration-300 max-w-lg mx-auto text-center py-8">
                  <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="mb-8">
                    <h3 className="text-2xl font-extrabold text-slate-900 mb-1">
                        SwimWave<span className="text-blue-600">Up</span>
                    </h3>
                    <p className="text-slate-500 font-medium">Versione {APP_CONFIG.version}</p>
                  </div>

                  <div className="space-y-2">
                    {[
                        { to: '/termini', label: 'Termini di servizio' },
                        { to: '/privacy', label: 'Privacy Policy' },
                        { to: '/cookie', label: 'Cookie Policy' },
                    ].map((item) => (
                        <Link key={item.to} to={item.to} className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors text-left group outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                            <span className="font-bold text-slate-700">{item.label}</span>
                            <span className="text-slate-400 group-hover:text-slate-600 font-bold">&rarr;</span>
                        </Link>
                    ))}
                  </div>

                  {onLogout && (
                    <div className="pt-8 mt-8 border-t border-slate-100">
                      <button 
                        onClick={onLogout}
                        className="w-full flex items-center justify-center space-x-2 p-4 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-600 hover:text-white transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-red-500 shadow-sm"
                      >
                        <Icon type="logout" className="w-5 h-5" />
                        <span>Esci dall'Account</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {(activeTab === 'privacy' || activeTab === 'notifications') && (
                <div className="animate-in slide-in-from-right-4 duration-300 flex flex-col items-center justify-center py-20 text-center">
                    <Icon type="settings" className="w-16 h-16 text-slate-200 mb-4 animate-[spin_4s_linear_infinite]" />
                    <h3 className="text-lg font-bold text-slate-700">Impostazioni in arrivo</h3>
                    <p className="text-slate-500 text-sm mt-1 max-w-sm">Queste preferenze verranno sbloccate con i prossimi aggiornamenti di sistema.</p>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};