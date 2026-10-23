import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconType } from '@/components/ui/Icon';

interface FormModalProps {
    open: boolean;
    title: string;
    description?: string;
    icon?: IconType;
    /** Ci sono modifiche non salvate: chiudendo si chiede conferma. */
    dirty?: boolean;
    busy?: boolean;
    submitLabel: string;
    busyLabel?: string;
    size?: 'md' | 'lg';
    tone?: 'default' | 'danger';
    onClose: () => void;
    onSubmit: (e: React.FormEvent) => void;
    formRef?: React.RefObject<HTMLFormElement>;
    /** Azione secondaria a sinistra nel piè di pagina (es. Elimina). */
    secondaryAction?: React.ReactNode;
    children: React.ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modale per i form: su mobile si apre dal basso come un foglio, su desktop al centro.
 * Gestisce Esc, focus intrappolato, blocco dello scroll e conferma se ci sono modifiche.
 */
export const FormModal: React.FC<FormModalProps> = ({
    open, title, description, icon, dirty = false, busy = false, submitLabel, busyLabel = 'Salvataggio…', size = 'md', tone = 'default',
    onClose, onSubmit, formRef, secondaryAction, children,
}) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [confirmingClose, setConfirmingClose] = useState(false);
    const titleId = useRef(`modal-${Math.random().toString(36).slice(2, 8)}`).current;

    const requestClose = () => {
        if (busy) return;
        if (dirty && !confirmingClose) return setConfirmingClose(true);
        setConfirmingClose(false);
        onClose();
    };

    useEffect(() => {
        if (!open) return;
        setConfirmingClose(false);
        const previouslyFocused = document.activeElement as HTMLElement | null;
        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';
        // Primo campo del form, non il pulsante di chiusura.
        const t = window.setTimeout(() => {
            const first = panelRef.current?.querySelector<HTMLElement>('form input:not([type=hidden]), form select, form textarea') || panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
            first?.focus({ preventScroll: true });
        }, 60);
        return () => {
            window.clearTimeout(t);
            document.body.style.overflow = overflow;
            previouslyFocused?.focus?.();
        };
    }, [open]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            requestClose();
        }
        if (e.key === 'Tab' && panelRef.current) {
            const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
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

    if (!open) return null;

    const primary = tone === 'danger' ? 'bg-galleggiante hover:bg-red-700 focus-visible:ring-red-200' : 'bg-corsia-600 hover:bg-corsia-700 focus-visible:ring-corsia-200';

    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" onKeyDown={onKeyDown}>
            <div className="absolute inset-0 bg-abisso/60 backdrop-blur-[2px] animate-in fade-in duration-200" onClick={requestClose} aria-hidden="true" />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`relative w-full ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-lift
                    animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 fade-in duration-300 ease-out`}
            >
                <div className="sm:hidden mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden="true" />
                <header className="flex items-start gap-3 px-5 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-slate-100">
                    {icon && (
                        <span className={`flex-shrink-0 w-10 h-10 rounded-xl grid place-items-center ${tone === 'danger' ? 'bg-red-50 text-galleggiante' : 'bg-corsia-50 text-corsia-700'}`}>
                            <Icon type={icon} className="w-5 h-5" />
                        </span>
                    )}
                    <div className="flex-1 min-w-0">
                        <h2 id={titleId} className="text-2xl font-bold text-abisso leading-tight">
                            {title}
                        </h2>
                        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
                    </div>
                    <button type="button" onClick={requestClose} className="p-2 -mr-2 rounded-full text-slate-400 hover:text-abisso hover:bg-slate-100 outline-none focus-visible:ring-4 focus-visible:ring-corsia-100" aria-label="Chiudi">
                        <Icon type="x" className="w-5 h-5" />
                    </button>
                </header>

                <form ref={formRef} onSubmit={onSubmit} noValidate className="flex-1 min-h-0 flex flex-col">
                    <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-5">{children}</div>

                    {confirmingClose ? (
                        <div className="px-5 sm:px-6 py-4 border-t border-amber-200 bg-amber-50 rounded-b-none sm:rounded-b-3xl animate-in fade-in slide-in-from-bottom-2 duration-200" role="alertdialog" aria-label="Modifiche non salvate">
                            <p className="text-sm font-semibold text-amber-900 mb-3">Hai modifiche non salvate. Vuoi uscire senza salvarle?</p>
                            <div className="flex gap-2 justify-end">
                                <button type="button" onClick={() => setConfirmingClose(false)} className="px-4 py-2.5 rounded-full text-sm font-semibold text-abisso bg-white border border-slate-200 hover:border-slate-300" autoFocus>
                                    Continua a modificare
                                </button>
                                <button type="button" onClick={() => { setConfirmingClose(false); onClose(); }} className="px-4 py-2.5 rounded-full text-sm font-semibold text-white bg-abisso hover:bg-black">
                                    Esci senza salvare
                                </button>
                            </div>
                        </div>
                    ) : (
                        <footer className="flex items-center gap-3 px-5 sm:px-6 py-4 border-t border-slate-100 pb-[max(1rem,env(safe-area-inset-bottom))]">
                            <div className="flex-1">{secondaryAction}</div>
                            <button type="button" onClick={requestClose} disabled={busy} className="px-5 py-2.5 rounded-full font-semibold text-slate-600 hover:bg-slate-100 outline-none focus-visible:ring-4 focus-visible:ring-corsia-100 disabled:opacity-50">
                                Annulla
                            </button>
                            <button type="submit" disabled={busy} className={`px-6 py-2.5 rounded-full font-semibold text-white shadow-card outline-none focus-visible:ring-4 disabled:opacity-70 inline-flex items-center gap-2 transition-colors ${primary}`}>
                                {busy && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />}
                                {busy ? busyLabel : submitLabel}
                            </button>
                        </footer>
                    )}
                </form>
            </div>
        </div>,
        document.body
    );
};

/** Raggruppa i campi di un form con un titolo di sezione. */
export const FormSection: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
    <fieldset className="space-y-4">
        <legend className="mb-1">
            <span className="block text-base font-bold text-abisso">{title}</span>
            {description && <span className="block text-sm text-slate-500 mt-0.5">{description}</span>}
        </legend>
        {children}
    </fieldset>
);
