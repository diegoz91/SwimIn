import React from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '@/components/ui/Brand';

const GROUPS: { title: string; links: { to: string; label: string }[] }[] = [
    { title: 'Scopri', links: [{ to: '/gruppi', label: 'Gruppi' }, { to: '/eventi', label: 'Eventi' }, { to: '/strutture', label: 'Piscine' }, { to: '/premium', label: 'Premium' }] },
    { title: 'Il tuo account', links: [{ to: '/profile?tab=impostazioni', label: 'Impostazioni' }, { to: '/profile?tab=impostazioni&sezione=aspetto', label: 'Tema chiaro o scuro' }, { to: '/profile?tab=impostazioni&sezione=info', label: 'Assistenza' }] },
    { title: 'Legale', links: [{ to: '/privacy', label: 'Privacy' }, { to: '/termini', label: 'Termini' }, { to: '/cookie', label: 'Cookie' }] },
];

/**
 * Piè di pagina dell'app (utenti con accesso): in fondo al contenuto che scorre, non nelle colonne
 * laterali. Su smartphone c'è il menu in basso, quindi qui resta la versione compatta.
 */
export const AppFooter: React.FC = () => (
    <footer className="mt-auto border-t border-slate-200 bg-white/60" aria-label="Informazioni su SwimIn">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 xl:pr-[22rem]">
            <div className="hidden md:grid grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))] gap-8">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <BrandMark className="w-8 h-8" />
                        <span className="font-display text-xl font-bold text-abisso">SwimIn</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-2 max-w-xs">Il network professionale di chi lavora e nuota in piscina.</p>
                </div>
                {GROUPS.map((g) => (
                    <nav key={g.title} aria-label={g.title} className="min-w-0">
                        <p className="text-sm font-semibold text-abisso">{g.title}</p>
                        <ul className="mt-2 space-y-1.5">
                            {g.links.map((l) => (
                                <li key={l.to}>
                                    <Link to={l.to} className="inline-block py-0.5 text-sm text-slate-600 hover:text-corsia-700 hover:underline">{l.label}</Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                ))}
            </div>
            <div className="md:hidden flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-slate-600">
                {[{ to: '/privacy', label: 'Privacy' }, { to: '/termini', label: 'Termini' }, { to: '/cookie', label: 'Cookie' }, { to: '/profile?tab=impostazioni&sezione=info', label: 'Assistenza' }].map((l) => (
                    <Link key={l.to} to={l.to} className="py-1 hover:text-corsia-700">{l.label}</Link>
                ))}
            </div>
            <p className="mt-4 md:mt-6 md:pt-4 md:border-t md:border-slate-100 text-center md:text-left text-xs text-slate-500">© {new Date().getFullYear()} SwimIn · Fatto in Italia per il mondo del nuoto</p>
        </div>
    </footer>
);
