import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '@/components/ui/Brand';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { formatUntil, useAppStatus } from '@/hooks/useAppStatus';

/** Percorsi sempre raggiungibili anche in manutenzione: stato, pagine legali, accesso (gli admin devono poter entrare). */
export const MAINTENANCE_OPEN_PATHS = ['/stato', '/privacy', '/termini', '/cookie', '/login', '/accesso/google'];

const Screen: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="min-h-screen bg-piastrella flex flex-col" style={{ minHeight: '100dvh' }}>
        <div className="lane-rope" aria-hidden="true" />
        <main id="contenuto" className="flex-1 flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md">
                <Brand size="md" />
                <h1 className="mt-10 text-4xl sm:text-5xl font-bold text-abisso leading-[0.95]">{title}</h1>
                {children}
            </div>
        </main>
    </div>
);

/** Pagina mostrata a tutti (tranne gli amministratori) quando SwimIn è in manutenzione. */
export const MaintenanceScreen: React.FC = () => {
    const { status, refresh } = useAppStatus();
    const [checking, setChecking] = useState(false);
    const until = formatUntil(status.until);
    const retry = async () => {
        setChecking(true);
        await refresh();
        setChecking(false);
    };
    return (
        <Screen title="SwimIn è in manutenzione">
            <p className="mt-5 text-lg text-slate-700 whitespace-pre-line break-words">{status.message || 'Stiamo aggiornando SwimIn. Torniamo online a breve.'}</p>
            {until && (
                <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-abisso bg-white border border-slate-200 rounded-full px-3 py-1.5">
                    <Icon type="clock" className="w-4 h-4 text-corsia-700" /> Fine prevista {until}
                </p>
            )}
            <p className="mt-6 text-sm text-slate-600">I tuoi dati sono al sicuro. La pagina si riapre da sola appena abbiamo finito.</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button onClick={() => void retry()} busy={checking} icon="arrow-path">Controlla di nuovo</Button>
                <Button to="/stato" variant="secondary">Stato del servizio</Button>
            </div>
            <p className="mt-10 text-xs text-slate-500">
                Amministratore? <Link to="/login" className="font-semibold text-corsia-700 hover:underline py-1 -my-1">Accedi</Link> per lavorare durante la manutenzione.
            </p>
        </Screen>
    );
};

/** Il server non risponde (non è un problema della rete di chi guarda). */
export const OutageScreen: React.FC = () => {
    const { refresh } = useAppStatus();
    const [checking, setChecking] = useState(false);
    const retry = async () => {
        setChecking(true);
        await refresh();
        setChecking(false);
    };
    return (
        <Screen title="SwimIn non risponde">
            <p className="mt-5 text-lg text-slate-700">I nostri server non rispondono in questo momento. Stiamo già controllando: riproviamo da soli ogni 20 secondi.</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button onClick={() => void retry()} busy={checking} icon="arrow-path">Riprova ora</Button>
                <Button to="/stato" variant="secondary">Stato del servizio</Button>
            </div>
        </Screen>
    );
};

const dismissKey = (updatedAt: string | null, mode: string) => `swimin:status-dismissed:${mode}:${updatedAt || ''}`;
const readDismissed = (key: string) => {
    try {
        return sessionStorage.getItem(key) === '1';
    } catch {
        return false;
    }
};

/**
 * Striscia in cima alla pagina: rallentamenti (per tutti, si può chiudere) oppure, per gli
 * amministratori, il promemoria che la manutenzione è attiva.
 */
export const StatusBanner: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
    const { status } = useAppStatus();
    const key = dismissKey(status.updatedAt, status.mode);
    const [dismissed, setDismissed] = useState<string | null>(null);
    if (status.mode === 'ok') return null;

    if (status.mode === 'maintenance') {
        if (!isAdmin) return null;
        return (
            <div role="status" className="bg-abisso text-white text-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Icon type="shield" className="w-4 h-4 flex-shrink-0" />
                    <span className="min-w-0 flex-1">Manutenzione attiva: gli utenti vedono la pagina di manutenzione.</span>
                    <Link to="/admin?tab=stato" className="font-semibold underline underline-offset-2 py-1 -my-1">Gestisci</Link>
                </div>
            </div>
        );
    }

    if (dismissed === key || readDismissed(key)) return null;
    const until = formatUntil(status.until);
    const close = () => {
        try {
            sessionStorage.setItem(key, '1');
        } catch (err) {
            console.warn('Avviso non memorizzato:', err);
        }
        setDismissed(key);
    };
    return (
        <div role="status" className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-start gap-3">
                <Icon type="alert-triangle" className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="min-w-0 flex-1 break-words">
                    {status.message || 'Alcune funzioni possono essere lente.'}
                    {until && <span className="whitespace-nowrap"> · fine prevista {until}</span>}{' '}
                    <Link to="/stato" className="font-semibold underline underline-offset-2 py-1 -my-1 whitespace-nowrap">Dettagli</Link>
                </p>
                <button type="button" onClick={close} aria-label="Chiudi l’avviso" className="p-1 -m-1 rounded-full hover:bg-amber-100 flex-shrink-0">
                    <Icon type="x" className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};
