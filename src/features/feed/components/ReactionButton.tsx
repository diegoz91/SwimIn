import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { REACTIONS, reactionOf, type ReactionKey } from '@/data/reactions';

/**
 * "Consiglia" con scelta della reazione, come su LinkedIn: un tocco mette (o toglie)
 * il consiglio; tenendo premuto, passando sopra col mouse o con la freccia si
 * apre la barra delle reazioni.
 */
export const ReactionButton: React.FC<{
    value: string | null;
    disabled?: boolean;
    onReact: (reaction: ReactionKey | null) => void;
}> = ({ value, disabled, onReact }) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const hoverTimer = useRef<number | undefined>(undefined);
    const pressTimer = useRef<number | undefined>(undefined);
    const longPressed = useRef(false);
    const current = reactionOf(value);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent | TouchEvent) => wrapRef.current && !wrapRef.current.contains(e.target as Node) && setOpen(false);
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('touchstart', close);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('touchstart', close);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    useEffect(() => () => { window.clearTimeout(hoverTimer.current); window.clearTimeout(pressTimer.current); }, []);

    const pick = (key: ReactionKey) => {
        setOpen(false);
        onReact(key === value ? null : key);
    };

    return (
        <div
            ref={wrapRef}
            className="relative flex-1 flex"
            onMouseEnter={() => { window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => !disabled && setOpen(true), 450); }}
            onMouseLeave={() => { window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setOpen(false), 300); }}
        >
            {open && (
                <div
                    role="menu"
                    aria-label="Scegli una reazione"
                    className="absolute bottom-full left-0 mb-2 z-30 flex gap-1 bg-white rounded-full shadow-lift border border-slate-200 px-2 py-1.5 animate-in fade-in zoom-in-90 slide-in-from-bottom-1 duration-150 origin-bottom-left motion-reduce:animate-none"
                >
                    {REACTIONS.map((r, i) => (
                        <button
                            key={r.key}
                            type="button"
                            role="menuitem"
                            onClick={() => pick(r.key)}
                            title={r.label}
                            aria-label={r.label}
                            style={{ animationDelay: `${i * 25}ms` }}
                            className={`group relative w-10 h-10 grid place-items-center rounded-full text-2xl leading-none transition-transform duration-150 hover:scale-125 hover:-translate-y-1 focus-visible:scale-125 outline-none focus-visible:ring-2 focus-visible:ring-corsia-500 animate-in fade-in zoom-in-50 motion-reduce:animate-none ${value === r.key ? 'bg-corsia-50' : ''}`}
                        >
                            <span aria-hidden="true">{r.emoji}</span>
                            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-abisso text-white text-[11px] font-semibold px-1.5 py-0.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                                {r.label}
                            </span>
                        </button>
                    ))}
                </div>
            )}
            <button
                type="button"
                disabled={disabled}
                aria-pressed={!!current}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => {
                    if (longPressed.current) { longPressed.current = false; return; }
                    onReact(current ? null : 'consiglio');
                }}
                onKeyDown={(e) => { if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); } }}
                onTouchStart={() => { longPressed.current = false; pressTimer.current = window.setTimeout(() => { longPressed.current = true; setOpen(true); }, 420); }}
                onTouchEnd={() => window.clearTimeout(pressTimer.current)}
                onTouchMove={() => window.clearTimeout(pressTimer.current)}
                onContextMenu={(e) => e.preventDefault()}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-corsia-500 select-none ${current ? `${current.color} hover:bg-corsia-50` : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'}`}
            >
                {current ? (
                    <span aria-hidden="true" className="text-lg leading-none animate-in zoom-in-50 duration-200 motion-reduce:animate-none">{current.emoji}</span>
                ) : (
                    <Icon type="thumb-up" className="w-5 h-5" />
                )}
                {current ? current.past : 'Consiglia'}
            </button>
        </div>
    );
};
