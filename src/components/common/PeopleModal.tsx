import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { Icon } from '@/components/ui/Icon';
import { initialsAvatar } from '@/utils/avatar';

export interface PersonRow {
    /** null per chi è anonimo (non cliccabile). */
    id: string | null;
    name: string;
    headline?: string;
    avatar?: string;
    /** Riga secondaria a destra (es. "2 ore fa"). */
    meta?: string;
}

/**
 * Elenco di persone in una finestra (collegamenti, visite al profilo…): foglio dal
 * basso su mobile, finestra al centro su desktop, con ricerca se l'elenco è lungo.
 */
export const PeopleModal: React.FC<{
    open: boolean;
    title: string;
    subtitle?: string;
    load: () => Promise<PersonRow[]>;
    empty: string;
    /** Contenuto sotto l'elenco (es. invito a Premium per vedere tutti). */
    footer?: React.ReactNode;
    onClose: () => void;
}> = ({ open, title, subtitle, load, empty, footer, onClose }) => {
    const navigate = useNavigate();
    const [rows, setRows] = useState<PersonRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [q, setQ] = useState('');
    const closeRef = useRef<HTMLButtonElement>(null);
    const loadRef = useRef(load);
    loadRef.current = load;
    const closeFn = useRef(onClose);
    closeFn.current = onClose;

    useEffect(() => {
        if (!open) return;
        let alive = true;
        setRows(null);
        setError(null);
        setQ('');
        loadRef.current()
            .then((r) => alive && setRows(r))
            .catch((err) => {
                console.error(`${title}:`, err);
                if (alive) setError('Impossibile caricare l’elenco. Riprova tra poco.');
            });
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeFn.current();
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.setTimeout(() => closeRef.current?.focus(), 0);
        return () => {
            alive = false;
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, title]);

    const shown = useMemo(() => {
        const term = q.trim().toLowerCase();
        return (rows || []).filter((r) => !term || `${r.name} ${r.headline || ''}`.toLowerCase().includes(term));
    }, [rows, q]);

    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-abisso/50 backdrop-blur-xs animate-in fade-in duration-150" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div role="dialog" aria-modal="true" aria-labelledby="people-modal-title" className="bg-white w-full sm:max-w-md max-h-[85vh] rounded-t-3xl sm:rounded-2xl shadow-lift flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 motion-reduce:animate-none">
                <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
                    <div>
                        <h2 id="people-modal-title" className="text-2xl font-bold text-abisso leading-tight">{title}</h2>
                        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
                    </div>
                    <button ref={closeRef} onClick={onClose} aria-label="Chiudi" className="p-2 -m-1 rounded-full text-slate-500 hover:bg-slate-100 outline-hidden focus-visible:ring-2 focus-visible:ring-corsia-500">
                        <Icon type="x" className="w-5 h-5" />
                    </button>
                </div>
                {(rows?.length || 0) > 8 && (
                    <div className="px-5 pt-3">
                        <input
                            type="search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Cerca per nome"
                            aria-label="Cerca per nome"
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-corsia-400 focus:ring-4 focus:ring-corsia-100 outline-hidden text-sm"
                        />
                    </div>
                )}
                <div className="overflow-y-auto p-2 flex-1">
                    {error ? (
                        <p className="p-6 text-center text-sm text-galleggiante-700">{error}</p>
                    ) : rows === null ? (
                        <div className="space-y-2 p-2" aria-hidden="true">
                            {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />)}
                        </div>
                    ) : shown.length === 0 ? (
                        <p className="p-8 text-center text-sm text-slate-500">{q ? 'Nessun risultato.' : empty}</p>
                    ) : (
                        <ul>
                            {shown.map((r, i) => {
                                const content = (
                                    <>
                                        <img src={r.avatar || initialsAvatar(r.name)} alt="" className="w-12 h-12 rounded-full object-cover border border-slate-100 shrink-0" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-semibold text-abisso truncate">{r.name}</span>
                                            {r.headline && <span className="block text-sm text-slate-500 truncate">{r.headline}</span>}
                                        </span>
                                        {r.meta && <span className="text-xs text-slate-400 shrink-0">{r.meta}</span>}
                                    </>
                                );
                                return (
                                    <li key={r.id || `anonimo-${i}`}>
                                        {r.id ? (
                                            <button onClick={() => { onClose(); navigate(`/profile/${r.id}`); }} className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover:bg-piastrella outline-hidden focus-visible:bg-piastrella">
                                                {content}
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-3 p-3">{content}</div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {rows !== null && footer}
                </div>
            </div>
        </div>,
        document.body
    );
};
