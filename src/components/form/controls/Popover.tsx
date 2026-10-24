import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { normalizeText } from '@/utils/text';

/** Sotto questa larghezza i menu si aprono come foglio dal basso. */
const SHEET_BREAKPOINT = 640;

export const useIsSheet = () => {
    const get = () => typeof window !== 'undefined' && window.innerWidth < SHEET_BREAKPOINT;
    const [sheet, setSheet] = useState(get);
    useEffect(() => {
        const onResize = () => setSheet(get());
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    return sheet;
};

interface PopoverProps {
    open: boolean;
    anchorRef: React.RefObject<HTMLElement>;
    onClose: () => void;
    /** Titolo mostrato nel foglio su mobile. */
    title: string;
    /** Larghezza minima del pannello su desktop (di default quella del campo). */
    minWidth?: number;
    /** Altezza massima del pannello su desktop. */
    maxHeight?: number;
    id?: string;
    children: React.ReactNode;
    /** Contenuto fisso in fondo (es. pulsanti "Oggi"/"Cancella"). */
    footer?: React.ReactNode;
    /** Su mobile il foglio occupa sempre la stessa altezza (elenchi con ricerca: non "salta" filtrando). */
    tallSheet?: boolean;
}

/**
 * Pannello agganciato a un campo: su desktop si apre sotto (o sopra, se non c'è spazio),
 * su mobile come foglio dal basso. Vive in un portale, così non viene tagliato
 * dalle modali con scorrimento. Esc e clic fuori lo chiudono.
 */
export const Popover: React.FC<PopoverProps> = ({ open, anchorRef, onClose, title, minWidth, maxHeight = 320, id, children, footer, tallSheet }) => {
    const sheet = useIsSheet();
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number; placement: 'below' | 'above'; available: number } | null>(null);

    const place = useCallback(() => {
        const a = anchorRef.current?.getBoundingClientRect();
        if (!a) return;
        const gap = 6;
        const below = window.innerHeight - a.bottom - gap - 12;
        const above = a.top - gap - 12;
        const placement = below >= Math.min(maxHeight, 240) || below >= above ? 'below' : 'above';
        const width = Math.max(a.width, minWidth || 0);
        const left = Math.min(Math.max(8, a.left), window.innerWidth - width - 8);
        setPos({
            top: placement === 'below' ? a.bottom + gap : a.top - gap,
            left,
            width,
            placement,
            available: Math.max(160, Math.min(maxHeight, placement === 'below' ? below : above)),
        });
    }, [anchorRef, minWidth, maxHeight]);

    useLayoutEffect(() => {
        if (open && !sheet) place();
    }, [open, sheet, place]);

    useEffect(() => {
        if (!open) return;
        const onScroll = () => !sheet && place();
        const onPointer = (e: PointerEvent) => {
            const t = e.target as Node;
            if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
            onClose();
        };
        window.addEventListener('resize', onScroll);
        window.addEventListener('scroll', onScroll, true);
        document.addEventListener('pointerdown', onPointer, true);
        return () => {
            window.removeEventListener('resize', onScroll);
            window.removeEventListener('scroll', onScroll, true);
            document.removeEventListener('pointerdown', onPointer, true);
        };
    }, [open, sheet, place, onClose, anchorRef]);

    // Su mobile il foglio blocca lo scorrimento della pagina sotto.
    useEffect(() => {
        if (!open || !sheet) return;
        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = overflow;
        };
    }, [open, sheet]);

    if (!open) return null;

    const stopEsc = (e: React.KeyboardEvent) => {
        // Esc chiude solo il menu, non la modale che lo contiene.
        if (e.key === 'Escape') {
            e.stopPropagation();
            e.preventDefault();
            onClose();
            anchorRef.current?.focus();
        }
    };

    if (sheet) {
        return createPortal(
            <div className="fixed inset-0 z-[80] flex items-end" onKeyDown={stopEsc}>
                <div className="absolute inset-0 bg-abisso/50 animate-in fade-in duration-150" onClick={onClose} aria-hidden="true" />
                <div
                    ref={panelRef}
                    id={id}
                    className={`relative w-full ${tallSheet ? 'h-[78vh]' : 'max-h-[78vh]'} flex flex-col bg-white rounded-t-3xl shadow-lift animate-in slide-in-from-bottom-6 duration-200 ease-out pb-[env(safe-area-inset-bottom)]`}
                >
                    <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden="true" />
                    <div className="flex items-center justify-between px-5 pt-3 pb-2">
                        <p className="font-display text-xl font-bold text-abisso">{title}</p>
                        <button type="button" onClick={onClose} className="p-2 -mr-2 rounded-full text-slate-400 hover:bg-slate-100" aria-label="Chiudi">
                            <Icon type="x" className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" data-keyboard-scroll="combobox">{children}</div>
                    {footer && <div className="border-t border-slate-100 px-4 py-3">{footer}</div>}
                </div>
            </div>,
            document.body
        );
    }

    if (!pos) return null;
    return createPortal(
        <div
            ref={panelRef}
            id={id}
            onKeyDown={stopEsc}
            style={{
                position: 'fixed',
                left: pos.left,
                width: pos.width,
                ...(pos.placement === 'below' ? { top: pos.top } : { bottom: window.innerHeight - pos.top }),
            }}
            className={`z-[80] bg-white rounded-2xl border border-slate-200 shadow-lift overflow-hidden flex flex-col animate-in fade-in duration-150 ${
                pos.placement === 'below' ? 'slide-in-from-top-1' : 'slide-in-from-bottom-1'
            }`}
        >
            {/* L'elenco si scorre con le frecce dal campo che lo apre (aria-activedescendant), non serve un focus suo. */}
            <div className="overflow-y-auto overscroll-contain" data-keyboard-scroll="combobox" style={{ maxHeight: pos.available - (footer ? 52 : 0) }}>
                {children}
            </div>
            {footer && <div className="border-t border-slate-100 px-3 py-2">{footer}</div>}
        </div>,
        document.body
    );
};

export { normalizeText } from '@/utils/text';

/** Evidenzia la parte che corrisponde alla ricerca. */
export const Highlight: React.FC<{ text: string; query: string }> = ({ text, query }) => {
    const q = normalizeText(query);
    if (!q) return <>{text}</>;
    const i = normalizeText(text).indexOf(q);
    if (i < 0) return <>{text}</>;
    return (
        <>
            {text.slice(0, i)}
            <mark className="bg-cloro-100 text-abisso rounded-sm">{text.slice(i, i + q.length)}</mark>
            {text.slice(i + q.length)}
        </>
    );
};
