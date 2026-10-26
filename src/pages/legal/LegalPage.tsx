import React from 'react';
import { Link } from 'react-router-dom';
import { LEGAL } from '@/config/legal';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/hooks/useAuth';

export interface LegalSection {
    title: string;
    body: React.ReactNode;
}

interface LegalPageProps {
    title: string;
    intro?: React.ReactNode;
    sections: LegalSection[];
}

const LEGAL_LINKS = [
    { to: '/privacy', label: 'Privacy' },
    { to: '/termini', label: 'Termini' },
    { to: '/cookie', label: 'Cookie' },
];

/** Impaginazione comune di Privacy Policy, Termini e Cookie Policy. */
export const LegalPage: React.FC<LegalPageProps> = ({ title, intro, sections }) => {
    usePageTitle(title);
    const { authenticated } = useAuth();

    return (
        <article className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">
            <Link to="/" className="text-sm font-semibold text-corsia-700 hover:underline">
                {authenticated ? 'Torna al feed' : 'Torna a SwimIn'}
            </Link>

            <header className="mt-4 mb-8">
                <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">{title}</h1>
                <p className="text-sm text-slate-500 mt-2">Ultimo aggiornamento: {LEGAL.lastUpdated}</p>
                {LEGAL.isDraft && (
                    <p className="mt-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3">
                        <strong>Bozza.</strong> Questo testo è un modello e va completato e verificato da un consulente legale
                        prima del lancio pubblico.
                    </p>
                )}
                {intro && <div className="mt-6 text-slate-700 leading-relaxed">{intro}</div>}
            </header>

            <div className="space-y-8">
                {sections.map((section, i) => (
                    <section key={section.title} aria-labelledby={`sezione-${i}`}>
                        <h2 id={`sezione-${i}`} className="text-xl font-bold text-slate-900 mb-3">
                            {i + 1}. {section.title}
                        </h2>
                        <div className="text-slate-700 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_a]:text-blue-600 [&_a]:underline">
                            {section.body}
                        </div>
                    </section>
                ))}
            </div>

            <nav className="mt-12 pt-6 border-t border-slate-200 flex gap-6 text-sm font-semibold" aria-label="Documenti legali">
                {LEGAL_LINKS.map((l) => (
                    <Link key={l.to} to={l.to} className="text-slate-500 hover:text-blue-600">
                        {l.label}
                    </Link>
                ))}
            </nav>
        </article>
    );
};
