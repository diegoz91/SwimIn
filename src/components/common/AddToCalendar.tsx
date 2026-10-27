import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import { downloadIcs, type IcsEvent } from '@/utils/ics';
import { calendarToken, googleCalendarApiEnabled, googleCalendarTemplateUrl, googleIdentity, insertCalendarEvents, startGoogle } from '@/services/google';

/**
 * Salvataggio in Google Calendar: con Google collegato e il permesso del calendario l'evento va
 * direttamente nel calendario (stesso id: salvarlo di nuovo lo aggiorna, niente doppioni);
 * altrimenti si chiede il permesso a Google e si salva al ritorno. Senza account Google un singolo
 * evento si apre in Google Calendar già compilato.
 */
export function useGoogleCalendarSave() {
    const { showToast } = useToast();
    const location = useLocation();
    const [busy, setBusy] = useState(false);

    const save = async (events: IcsEvent[]) => {
        if (!events.length || busy) return;
        setBusy(true);
        try {
            const token = await calendarToken();
            if (token) {
                try {
                    const link = await insertCalendarEvents(token, events);
                    showToast(events.length === 1 ? 'Aggiunto al tuo Google Calendar.' : `${events.length} appuntamenti aggiunti al tuo Google Calendar.`, 'success');
                    if (link) console.info('Google Calendar:', link);
                    return;
                } catch (err) {
                    if ((err as Error).message !== 'google_auth') throw err;
                }
            }
            const linked = googleCalendarApiEnabled ? !!(await googleIdentity()) : false;
            if (googleCalendarApiEnabled && (linked || events.length > 1)) {
                // Un passaggio su Google per il permesso del calendario; al ritorno l'evento viene salvato.
                startGoogle({ intent: 'calendar', returnTo: location.pathname + location.search, events });
                return;
            }
            if (events.length === 1) window.open(googleCalendarTemplateUrl(events[0]), '_blank', 'noopener,noreferrer');
            else downloadIcs('swimin', events);
        } catch (err) {
            console.error('Google Calendar:', err);
            showToast(err instanceof Error && err.message !== 'google_auth' ? err.message : 'Google Calendar non ha risposto. Riprova tra poco.', 'error');
        } finally {
            setBusy(false);
        }
    };
    return { save, busy };
}

type Props = {
    events: IcsEvent[] | (() => IcsEvent[]);
    filename: string;
    label?: string;
    /** Testo per i lettori di schermo quando l'etichetta da sola non basta. */
    ariaLabel?: string;
    className?: string;
    iconClassName?: string;
};

/** Pulsante "Aggiungi al calendario": Google Calendar oppure file .ics (Apple, Outlook e altri). */
export const AddToCalendar: React.FC<Props> = ({ events, filename, label = 'Aggiungi al calendario', ariaLabel, className, iconClassName = 'w-4 h-4' }) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
    const [mobile, setMobile] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const { save, busy } = useGoogleCalendarSave();
    const list = () => (typeof events === 'function' ? events() : events);
    const count = open ? list().length : 0;

    useLayoutEffect(() => {
        if (!open || !buttonRef.current) return;
        const r = buttonRef.current.getBoundingClientRect();
        const isMobile = window.innerWidth < 640;
        setMobile(isMobile);
        const width = 288;
        const up = r.bottom + 180 > window.innerHeight;
        setPos({ top: up ? r.top - 8 : r.bottom + 8, left: Math.max(16, Math.min(r.left, window.innerWidth - width - 16)), up });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            const t = e.target as Node;
            if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
        };
        const close = () => setOpen(false);
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', close);
        document.getElementById('scroll-root')?.addEventListener('scroll', close, { passive: true });
        window.setTimeout(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), 0);
        return () => {
            document.removeEventListener('pointerdown', onDown);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', close);
            document.getElementById('scroll-root')?.removeEventListener('scroll', close);
        };
    }, [open]);

    const item = 'w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-piastrella outline-hidden focus-visible:bg-piastrella rounded-xl';
    const menu = (
        <div
            ref={menuRef}
            role="menu"
            aria-label="Aggiungi al calendario"
            className={
                mobile
                    ? 'fixed inset-x-0 bottom-0 z-[90] bg-white rounded-t-3xl border-t border-slate-200 shadow-lift p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-4 duration-200'
                    : 'fixed z-[90] w-72 bg-white rounded-2xl border border-slate-200 shadow-lift p-1.5 animate-in fade-in duration-150'
            }
            style={!mobile && pos ? { left: pos.left, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) } : undefined}
        >
            {mobile && <p className="px-4 pt-1 pb-2 font-semibold text-abisso">Aggiungi al calendario</p>}
            <button type="button" role="menuitem" className={item} disabled={busy} onClick={() => { const ev = list(); setOpen(false); void save(ev); }}>
                <Icon type="calendar" className="w-5 h-5 text-corsia-600 mt-0.5 shrink-0" />
                <span className="min-w-0">
                    <span className="block text-sm font-semibold text-abisso">Google Calendar</span>
                    <span className="block text-xs text-slate-500">{count > 1 ? 'Salva tutti gli appuntamenti nel tuo calendario' : 'Salva nel tuo calendario Google'}</span>
                </span>
            </button>
            <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); downloadIcs(filename, list()); }}>
                <Icon type="download" className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
                <span className="min-w-0">
                    <span className="block text-sm font-semibold text-abisso">Apple, Outlook e altri</span>
                    <span className="block text-xs text-slate-500">Scarica il file del calendario (.ics)</span>
                </span>
            </button>
        </div>
    );

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={ariaLabel}
                disabled={busy}
                className={className ?? 'px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 disabled:opacity-60'}
            >
                {busy ? <span className={`${iconClassName} border-2 border-slate-300 border-t-corsia-600 rounded-full animate-spin`} aria-hidden="true" /> : <Icon type="calendar" className={iconClassName} />}
                {label}
            </button>
            {open && pos && createPortal(
                <>
                    {mobile && <div className="fixed inset-0 z-[89] bg-abisso/40" aria-hidden="true" />}
                    {menu}
                </>,
                document.body
            )}
        </>
    );
};
