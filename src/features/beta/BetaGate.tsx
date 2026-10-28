import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { BETA_ENABLED } from '@/config/features';
import { BETA_VERSION } from '@/config/legal';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { Checkbox } from '@/components/form/Field';
import { Button } from '@/components/ui/Button';
import { BrandMark } from '@/components/ui/Brand';
import { BETA_TERMS, betaAccepted, betaSentFor, markBetaSent, rememberBetaAccepted } from './betaConsent';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Avviso della fase di test: all'ingresso, sopra a tutto, finché non viene accettato. Il resto della
 * pagina è inerte (niente clic né tastiera). L'accettazione resta sul dispositivo e, per chi ha un
 * account, viene registrata con data e versione nei dati privati.
 */
export const BetaGate: React.FC = () => {
    const { user, authenticated } = useAuth();
    const [open, setOpen] = useState(() => BETA_ENABLED && !betaAccepted());
    const [checked, setChecked] = useState(false);
    const [error, setError] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    // Chi ha già accettato su questo dispositivo: l'accettazione si registra anche sull'account.
    useEffect(() => {
        if (!BETA_ENABLED || open || !authenticated || !user || betaSentFor(user.$id)) return;
        databaseService
            .acceptBeta(BETA_VERSION)
            .then(() => markBetaSent(user.$id))
            .catch((err) => console.warn('Accettazione della fase di test non registrata:', err));
    }, [open, authenticated, user]);

    // Resto della pagina inerte e attenzione sul riquadro.
    useEffect(() => {
        if (!open) return;
        const root = document.getElementById('root');
        root?.setAttribute('inert', '');
        root?.setAttribute('aria-hidden', 'true');
        panelRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Tab' || !panelRef.current) return;
            const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            root?.removeAttribute('inert');
            root?.removeAttribute('aria-hidden');
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    if (!open) return null;

    const accept = () => {
        if (!checked) return setError(true);
        rememberBetaAccepted();
        setOpen(false);
    };

    return createPortal(
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-abisso/70 backdrop-blur-xs p-0 sm:p-4">
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="beta-title"
                aria-describedby="beta-intro"
                tabIndex={-1}
                className="w-full sm:max-w-xl max-h-[100dvh] sm:max-h-[90dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-lift outline-hidden animate-in fade-in slide-in-from-bottom-4 duration-300"
            >
                <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <BrandMark className="w-10 h-10" />
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-cloro-50 text-cloro-800 border border-cloro-200">Fase di test</span>
                    </div>
                    <h2 id="beta-title" className="mt-4 text-3xl font-bold text-abisso leading-tight">Benvenuto nella prova di SwimIn</h2>
                    <p id="beta-intro" className="mt-2 text-slate-600">Prima di entrare leggi e accetta queste condizioni: valgono per tutta la fase di test.</p>
                </div>
                <ol className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 py-5 space-y-4">
                    {BETA_TERMS.map((t, i) => (
                        <li key={t.title} className="flex gap-3">
                            <span className="w-7 h-7 shrink-0 rounded-full bg-corsia-50 text-corsia-700 text-sm font-bold grid place-items-center tabular-nums" aria-hidden="true">{i + 1}</span>
                            <p className="text-sm text-slate-700 leading-relaxed">
                                <strong className="block text-abisso">{t.title}</strong>
                                {t.text}
                            </p>
                        </li>
                    ))}
                </ol>
                <div className="px-6 sm:px-8 pt-4 pb-6 sm:pb-8 border-t border-slate-100" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
                    <Checkbox
                        id="beta-accept"
                        checked={checked}
                        onChange={(c) => { setChecked(c); setError(false); }}
                        invalid={error}
                        label={
                            <span className="font-normal text-slate-700">
                                Ho letto e accetto le condizioni della fase di test, i{' '}
                                <Link to="/termini" target="_blank" className="text-corsia-700 font-semibold underline underline-offset-2">Termini</Link> e la{' '}
                                <Link to="/privacy" target="_blank" className="text-corsia-700 font-semibold underline underline-offset-2">Privacy Policy</Link>.
                            </span>
                        }
                    />
                    {error && <p className="mt-1.5 text-sm text-galleggiante-700" role="alert">Per entrare devi accettare le condizioni.</p>}
                    <Button className="w-full mt-4" onClick={accept}>Accetto ed entro</Button>
                </div>
            </div>
        </div>,
        document.body
    );
};
