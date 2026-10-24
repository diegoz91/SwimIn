import React from 'react';
import { Icon, type IconType } from '@/components/ui/Icon';
import { MONTHS, toISODate } from '@/utils/dates';

/** Pulsanti delle impostazioni: stesse dimensioni ovunque, così le righe restano allineate. */
export const btn = {
    primary: 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700 disabled:opacity-60 transition-colors',
    secondary: 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border border-slate-300 text-abisso bg-white hover:bg-slate-50 hover:border-slate-400 disabled:opacity-60 transition-colors',
    quiet: 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60 transition-colors',
    danger: 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border border-red-200 text-galleggiante-700 bg-white hover:bg-red-50 disabled:opacity-60 transition-colors',
    dangerSolid: 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors',
};

/** Intestazione di una sezione: titolo e una riga che dice a cosa serve. */
export const SectionHeader: React.FC<{ title: string; description: string }> = ({ title, description }) => (
    <header className="mb-5">
        <h2 tabIndex={-1} className="text-2xl font-bold text-abisso">{title}</h2>
        <p className="text-slate-500 mt-1">{description}</p>
    </header>
);

/** Gruppo di impostazioni affini, in una scheda con le righe separate da una linea. */
export const Group: React.FC<{ title: string; description?: string; children: React.ReactNode; tone?: 'default' | 'danger'; footer?: React.ReactNode; id?: string }> = ({
    title, description, children, tone = 'default', footer, id,
}) => (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={`bg-white rounded-2xl border shadow-sm overflow-hidden scroll-mt-24 ${tone === 'danger' ? 'border-red-200' : 'border-slate-200'}`}>
        <div className="px-5 sm:px-6 pt-5 pb-1">
            <h3 id={id ? `${id}-title` : undefined} className={`font-bold ${tone === 'danger' ? 'text-galleggiante-700' : 'text-abisso'}`}>{title}</h3>
            {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
        </div>
        <div className="divide-y divide-slate-100">{children}</div>
        {footer && <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-100">{footer}</div>}
    </section>
);

/**
 * Una impostazione: titolo, spiegazione o valore attuale a sinistra, azione a destra.
 * `children` è il pannello che si apre sotto la riga (es. il modulo per cambiare la password).
 */
export const Row: React.FC<{
    title: React.ReactNode;
    description?: React.ReactNode;
    icon?: IconType;
    /** Al posto dell'icona, es. la foto del profilo. */
    leading?: React.ReactNode;
    aside?: React.ReactNode;
    children?: React.ReactNode;
    descriptionId?: string;
}> = ({ title, description, icon, leading, aside, children, descriptionId }) => (
    <div className="px-5 sm:px-6 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            {leading}
            {icon && !leading && (
                <span className="w-10 h-10 rounded-xl bg-piastrella text-corsia-700 grid place-items-center flex-shrink-0" aria-hidden="true">
                    <Icon type={icon} className="w-5 h-5" />
                </span>
            )}
            <div className="min-w-0 flex-1 basis-56">
                <div className="font-semibold text-abisso">{title}</div>
                {description && <div id={descriptionId} className="text-sm text-slate-500 mt-0.5 break-words">{description}</div>}
            </div>
            {aside && <div className="flex flex-wrap items-center gap-2 flex-shrink-0">{aside}</div>}
        </div>
        {children}
    </div>
);

/** Pannello che si apre sotto una riga, allineato al testo. */
export const RowPanel: React.FC<{ children: React.ReactNode; withIcon?: boolean }> = ({ children, withIcon }) => (
    <div className={`mt-4 rounded-xl bg-piastrella/70 border border-slate-100 p-4 sm:p-5 ${withIcon ? 'sm:ml-14' : ''}`}>{children}</div>
);

export const Badge: React.FC<{ tone?: 'ok' | 'warn' | 'neutral' | 'info'; children: React.ReactNode }> = ({ tone = 'neutral', children }) => {
    const cls = {
        ok: 'bg-cloro-50 text-cloro-800 border-cloro-200',
        warn: 'bg-amber-50 text-amber-800 border-amber-200',
        neutral: 'bg-slate-100 text-slate-700 border-slate-200',
        info: 'bg-corsia-50 text-corsia-800 border-corsia-200',
    }[tone];
    return <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{children}</span>;
};

/** Righe di caricamento della stessa altezza di quelle vere. */
export const RowSkeleton: React.FC<{ rows?: number }> = ({ rows = 2 }) => (
    <>
        {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="px-5 sm:px-6 py-4 flex items-center gap-4" aria-hidden="true">
                <span className="w-10 h-10 rounded-xl bg-slate-100 animate-pulse" />
                <span className="flex-1 space-y-2">
                    <span className="block h-3.5 w-40 bg-slate-100 rounded animate-pulse" />
                    <span className="block h-3 w-64 max-w-full bg-slate-100 rounded animate-pulse" />
                </span>
            </div>
        ))}
    </>
);

/** "oggi alle 14:05", "ieri alle 9:10", "12 ottobre 2026". */
export function whenOf(iso?: string | null, now: Date = new Date()): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const day = toISODate(d);
    const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    if (day === toISODate(now)) return `oggi alle ${time}`;
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    if (day === toISODate(y)) return `ieri alle ${time}`;
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
