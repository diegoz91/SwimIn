import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconType } from '@/components/ui/Icon';

export interface ConfirmOptions {
    title: string;
    /** Spiegazione delle conseguenze (testo semplice; gli a capo vengono mantenuti). */
    message?: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** "danger" per azioni distruttive o che non si possono annullare. */
    tone?: 'default' | 'danger';
    icon?: IconType;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Conferme dell'app al posto di window.confirm/alert del browser: stessa grafica del sito,
 * tema chiaro e scuro, foglio dal basso su smartphone, tastiera (Esc annulla, Tab resta dentro).
 * Uso: `const confirm = useConfirm(); if (!(await confirm({ title: '…', tone: 'danger' }))) return;`
 */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

    const confirm = useCallback<Confirm>(
        (options) =>
            new Promise<boolean>((resolve) => {
                setRequest((prev) => {
                    prev?.resolve(false); // una richiesta nuova annulla quella aperta
                    return { ...options, resolve };
                });
            }),
        []
    );

    const close = (ok: boolean) => {
        request?.resolve(ok);
        setRequest(null);
    };

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {request && <ConfirmDialog request={request} onClose={close} />}
        </ConfirmContext.Provider>
    );
};

const ConfirmDialog: React.FC<{ request: ConfirmOptions; onClose: (ok: boolean) => void }> = ({ request, onClose }) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const confirmRef = useRef<HTMLButtonElement>(null);
    const danger = request.tone === 'danger';
    const titleId = 'confirm-title';
    const descId = 'confirm-desc';

    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null;
        // Per le azioni distruttive il focus parte da "Annulla": un Invio distratto non cancella nulla.
        (danger ? cancelRef : confirmRef).current?.focus({ preventScroll: true });
        return () => previouslyFocused?.focus?.({ preventScroll: true });
    }, [danger]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            onClose(false);
        }
        if (e.key === 'Tab' && panelRef.current) {
            const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4" onKeyDown={onKeyDown}>
            <div className="absolute inset-0 bg-abisso/60 backdrop-blur-[2px] animate-in fade-in duration-150" onClick={() => onClose(false)} aria-hidden="true" />
            <div
                ref={panelRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={request.message ? descId : undefined}
                className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-lift p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 fade-in duration-200"
            >
                <div className="sm:hidden mx-auto -mt-2 mb-3 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden="true" />
                <div className="flex items-start gap-3">
                    <span className={`flex-shrink-0 w-10 h-10 rounded-xl grid place-items-center ${danger ? 'bg-red-50 text-galleggiante-700' : 'bg-corsia-50 text-corsia-700'}`} aria-hidden="true">
                        <Icon type={request.icon || (danger ? 'alert-triangle' : 'info')} className="w-5 h-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 id={titleId} className="text-xl font-bold text-abisso leading-tight">{request.title}</h2>
                        {request.message && <div id={descId} className="mt-1.5 text-sm text-slate-600 whitespace-pre-line">{request.message}</div>}
                    </div>
                </div>
                <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <button ref={cancelRef} type="button" onClick={() => onClose(false)} className="px-5 py-2.5 rounded-full font-semibold text-abisso bg-white border border-slate-200 hover:border-slate-300 outline-none focus-visible:ring-4 focus-visible:ring-corsia-100">
                        {request.cancelLabel || 'Annulla'}
                    </button>
                    <button
                        ref={confirmRef}
                        type="button"
                        onClick={() => onClose(true)}
                        className={`px-5 py-2.5 rounded-full font-semibold text-white outline-none focus-visible:ring-4 ${danger ? 'bg-galleggiante-700 hover:bg-red-800 focus-visible:ring-red-200' : 'bg-abisso hover:bg-corsia-900 focus-visible:ring-corsia-200'}`}
                    >
                        {request.confirmLabel || 'Conferma'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

/** Chiede una conferma con la finestra dell'app; restituisce true se la persona conferma. */
export function useConfirm(): Confirm {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm va usato dentro ConfirmProvider');
    return ctx;
}
