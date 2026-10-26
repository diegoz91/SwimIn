import React, { useEffect, useState } from 'react';
import { scrollPageTo } from '@/utils/scroll';

export interface ProfileSection { id: string; label: string }

/** Porta alla sezione (titolo con quell'id), tenendo conto dell'indice fisso in alto. */
export function goToSection(id: string) {
    const el = document.getElementById(id);
    const root = document.getElementById('scroll-root');
    if (!el) return;
    const top = root ? el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 72 : el.getBoundingClientRect().top + window.scrollY - 72;
    scrollPageTo(Math.max(0, top), true);
}

/**
 * Indice del profilo, fisso in alto mentre si scorre: salta a Chi sono, CV, Esperienze, Brevetti…
 * Mostra solo le sezioni presenti e mette in evidenza quella che si sta leggendo.
 */
export const ProfileSectionNav: React.FC<{ sections: ProfileSection[] }> = ({ sections }) => {
    const [present, setPresent] = useState<ProfileSection[]>([]);
    const [active, setActive] = useState<string>('');

    useEffect(() => {
        // Le sezioni compaiono dopo il caricamento dei dati: si ricontrolla a ogni cambio.
        const check = () => setPresent((prev) => {
            const next = sections.filter((s) => document.getElementById(s.id));
            return next.length === prev.length && next.every((s, i) => s.id === prev[i].id) ? prev : next;
        });
        const timers = [0, 800, 2500].map((ms) => window.setTimeout(check, ms));
        return () => timers.forEach((t) => window.clearTimeout(t));
    }, [sections]);

    useEffect(() => {
        if (!present.length) return;
        const root = document.getElementById('scroll-root');
        const io = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]) setActive(visible[0].target.id);
            },
            { root, rootMargin: '-80px 0px -60% 0px' }
        );
        present.forEach((s) => { const el = document.getElementById(s.id); if (el) io.observe(el); });
        return () => io.disconnect();
    }, [present]);

    if (present.length < 3) return null;
    return (
        <nav aria-label="Sezioni del profilo" className="sticky top-0 z-20 -mx-4 sm:mx-0 mb-4 px-4 sm:px-0 py-2 bg-piastrella/95 backdrop-blur">
            <ul className="flex gap-2 overflow-x-auto">
                {present.map((s) => (
                    <li key={s.id} className="flex-shrink-0">
                        <button
                            type="button"
                            onClick={() => goToSection(s.id)}
                            aria-current={active === s.id ? 'true' : undefined}
                            className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors ${active === s.id ? 'bg-abisso border-abisso text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}
                        >
                            {s.label}
                        </button>
                    </li>
                ))}
            </ul>
        </nav>
    );
};
