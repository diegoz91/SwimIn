import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconType } from '@/components/ui/Icon';
import type { AuthenticatedUser } from '@/types/types';
import { avatarOf, displayNameOf } from '@/utils/profile';
import { NotificationsTab } from './NotificationSettings';
import { AccountSection } from './settings/AccountSection';
import { SecuritySection } from './settings/SecuritySection';
import { PrivacySection } from './settings/PrivacySection';
import { AboutSection } from './settings/AboutSection';

interface SettingsProps {
    currentUser: AuthenticatedUser;
    onNavigate: (view: string, id?: string) => void;
    onLogout?: () => void;
}

type SectionId = 'account' | 'sicurezza' | 'notifiche' | 'privacy' | 'info';

const SECTIONS: { id: SectionId; label: string; hint: string; icon: IconType }[] = [
    { id: 'account', label: 'Account', hint: 'Email, piano, uscita ed eliminazione', icon: 'user' },
    { id: 'sicurezza', label: 'Accesso e sicurezza', hint: 'Password, verifica in due passaggi, dispositivi', icon: 'lock-closed' },
    { id: 'notifiche', label: 'Notifiche', hint: 'Push ed email per ogni tipo di avviso', icon: 'bell' },
    { id: 'privacy', label: 'Privacy e visibilità', hint: 'Profilo pubblico, blocchi, i tuoi dati', icon: 'shield' },
    { id: 'info', label: 'Info e assistenza', hint: 'Documenti legali, contatti, versione', icon: 'info' },
];

// Nomi accettati nei link (anche quelli già inviati per email o nelle notifiche).
const ALIASES: Record<string, SectionId> = { notifications: 'notifiche', security: 'sicurezza', 'password-e-accesso': 'sicurezza', legale: 'info', about: 'info' };
const sectionFrom = (v: string | null): SectionId | null => {
    if (!v) return null;
    if (SECTIONS.some((s) => s.id === v)) return v as SectionId;
    return ALIASES[v] ?? null;
};

/**
 * Impostazioni con indirizzo per ogni sezione (/profile?tab=impostazioni&sezione=…), così il tasto
 * indietro funziona e le sezioni si possono linkare. Su smartphone si parte dall'elenco delle sezioni.
 */
export const Settings: React.FC<SettingsProps> = ({ currentUser, onNavigate, onLogout }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const active = sectionFrom(new URLSearchParams(location.search).get('sezione'));
    const shown: SectionId = active ?? 'account';
    const contentRef = useRef<HTMLDivElement>(null);

    const open = (id: SectionId) => navigate({ search: `?tab=impostazioni&sezione=${id}` });

    // Cambiando sezione si riparte dall'inizio, con il focus sul titolo per chi usa la tastiera o uno screen reader.
    useEffect(() => {
        if (!active) return;
        window.scrollTo({ top: 0 });
        contentRef.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    }, [active]);

    return (
        <div className="max-w-5xl mx-auto w-full">
            <div className="flex flex-col md:flex-row gap-6 lg:gap-8 items-start">
                <aside className={`w-full md:w-72 flex-shrink-0 md:sticky md:top-24 ${active ? 'hidden md:block' : ''}`}>
                    <h1 className="text-3xl font-bold text-abisso mb-4">Impostazioni</h1>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-4 flex items-center gap-3 border-b border-slate-100">
                            <img src={avatarOf(currentUser)} alt="" className="w-11 h-11 rounded-full object-cover bg-slate-100 flex-shrink-0" />
                            <div className="min-w-0">
                                <p className="font-semibold text-abisso truncate">{displayNameOf(currentUser)}</p>
                                <p className="text-sm text-slate-500 truncate">{currentUser.email}</p>
                            </div>
                        </div>
                        <nav aria-label="Sezioni delle impostazioni" className="p-2">
                            <ul className="space-y-0.5">
                                {SECTIONS.map((s) => {
                                    const current = s.id === shown;
                                    return (
                                        <li key={s.id}>
                                            <button
                                                type="button"
                                                onClick={() => open(s.id)}
                                                aria-current={active && current ? 'page' : undefined}
                                                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-corsia-400 ${
                                                    current ? 'md:bg-corsia-50 md:text-corsia-800' : ''
                                                } hover:bg-piastrella text-abisso`}
                                            >
                                                <span className={`w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 ${current ? 'md:bg-white text-corsia-700' : 'text-slate-500'} bg-piastrella md:bg-transparent`} aria-hidden="true">
                                                    <Icon type={s.icon} className="w-5 h-5" />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block font-semibold">{s.label}</span>
                                                    <span className="block text-sm text-slate-500 md:hidden">{s.hint}</span>
                                                </span>
                                                <Icon type="chevron-right" className="w-5 h-5 text-slate-400 md:hidden flex-shrink-0" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </nav>
                    </div>
                </aside>

                <div ref={contentRef} className={`flex-1 min-w-0 w-full ${active ? '' : 'hidden md:block'}`}>
                    <button
                        type="button"
                        onClick={() => navigate({ search: '?tab=impostazioni' })}
                        className="md:hidden mb-4 -ml-1 inline-flex items-center gap-1.5 py-1 px-1 text-sm font-semibold text-corsia-700"
                    >
                        <Icon type="arrow-left" className="w-4 h-4" /> Impostazioni
                    </button>
                    <div className="[&_h2]:outline-none" key={shown}>
                        {shown === 'account' && <AccountSection user={currentUser} onEditProfile={() => onNavigate('profile')} onLogout={onLogout} />}
                        {shown === 'sicurezza' && <SecuritySection user={currentUser} />}
                        {shown === 'notifiche' && <NotificationsTab />}
                        {shown === 'privacy' && <PrivacySection user={currentUser} />}
                        {shown === 'info' && <AboutSection />}
                    </div>
                </div>
            </div>
        </div>
    );
};
