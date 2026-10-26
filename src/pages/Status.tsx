import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/hooks/useAuth';
import { formatUntil, useAppStatus } from '@/hooks/useAppStatus';
import { databaseService } from '@/services/database';
import { Brand } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Icon, type IconType } from '@/components/ui/Icon';
import { LEGAL } from '@/config/legal';

type CheckState = 'checking' | 'ok' | 'slow' | 'down';
interface Check { id: string; label: string; description: string; state: CheckState; ms: number | null }

const SLOW_MS = 2500;
const CHECKS: Omit<Check, 'state' | 'ms'>[] = [
    { id: 'site', label: 'Sito', description: 'Pagine e grafica di SwimIn' },
    { id: 'data', label: 'Accesso e dati', description: 'Profili, offerte, post e messaggi' },
    { id: 'api', label: 'Servizi dell’app', description: 'Candidature, turni, notifiche e pagamenti' },
];

const STATE: Record<CheckState, { text: string; dot: string; chip: string }> = {
    checking: { text: 'Controllo…', dot: 'bg-slate-300 animate-pulse', chip: 'text-slate-600' },
    ok: { text: 'Funziona', dot: 'bg-cloro-500', chip: 'text-cloro-800' },
    slow: { text: 'Lento', dot: 'bg-amber-500', chip: 'text-amber-900' },
    down: { text: 'Non risponde', dot: 'bg-galleggiante', chip: 'text-galleggiante-700' },
};

/** Misura una chiamata: "lento" oltre 2,5 secondi, "non risponde" se va in errore. */
const measure = async (fn: () => Promise<unknown>): Promise<{ state: CheckState; ms: number }> => {
    const start = performance.now();
    try {
        await fn();
        const ms = Math.round(performance.now() - start);
        return { state: ms > SLOW_MS ? 'slow' : 'ok', ms };
    } catch (err) {
        console.warn('Controllo del servizio non riuscito:', err);
        return { state: 'down', ms: Math.round(performance.now() - start) };
    }
};

/** /stato — pagina pubblica: avviso degli amministratori e controllo dal vivo dei servizi. */
const Status: React.FC = () => {
    usePageTitle('Stato del servizio');
    const { authenticated } = useAuth();
    const { status } = useAppStatus();
    const [checks, setChecks] = useState<Check[]>(() => CHECKS.map((c) => ({ ...c, state: 'checking', ms: null })));
    const [checkedAt, setCheckedAt] = useState<Date | null>(null);
    const [running, setRunning] = useState(false);

    const run = useCallback(async () => {
        setRunning(true);
        setChecks((list) => list.map((c) => (c.id === 'site' ? { ...c, state: 'ok', ms: null } : { ...c, state: 'checking', ms: null })));
        const [data, api] = await Promise.all([measure(() => databaseService.getAppStatus()), measure(() => databaseService.serviceHealth())]);
        setChecks((list) => list.map((c) => (c.id === 'data' ? { ...c, ...data } : c.id === 'api' ? { ...c, ...api } : c)));
        setCheckedAt(new Date());
        setRunning(false);
    }, []);

    useEffect(() => {
        void run();
        const t = window.setInterval(() => void run(), 60_000);
        return () => window.clearInterval(t);
    }, [run]);

    const anyDown = checks.some((c) => c.state === 'down');
    const anySlow = checks.some((c) => c.state === 'slow');
    const headline: { title: string; icon: IconType; tone: string } =
        status.mode === 'maintenance'
            ? { title: 'Manutenzione in corso', icon: 'shield', tone: 'text-corsia-700' }
            : anyDown
              ? { title: 'Alcuni servizi non rispondono', icon: 'alert-triangle', tone: 'text-galleggiante-700' }
              : status.mode === 'degraded' || anySlow
                ? { title: 'Alcuni servizi sono lenti', icon: 'alert-triangle', tone: 'text-amber-700' }
                : { title: 'Tutto funziona', icon: 'check-circle', tone: 'text-cloro-700' };
    const until = formatUntil(status.until);

    return (
        <div className={`w-full max-w-2xl mx-auto ${authenticated ? 'pt-2' : 'px-4 py-10 sm:py-16'}`}>
            {!authenticated && (
                <Link to="/" aria-label="SwimIn, pagina iniziale" className="inline-flex mb-10">
                    <Brand size="md" />
                </Link>
            )}
            <p className="text-sm font-semibold text-slate-600">Stato del servizio</p>
            <h1 className="mt-1 text-4xl sm:text-5xl font-bold text-abisso leading-[0.95] flex items-center gap-3">
                <Icon type={headline.icon} className={`w-9 h-9 flex-shrink-0 ${headline.tone}`} />
                <span>{headline.title}</span>
            </h1>

            {status.mode !== 'ok' && (
                <section className={`mt-6 rounded-2xl border p-5 ${status.mode === 'maintenance' ? 'bg-corsia-50 border-corsia-200' : 'bg-amber-50 border-amber-200'}`} aria-label="Avviso del team SwimIn">
                    <p className="text-sm font-semibold text-abisso">Dal team SwimIn</p>
                    <p className="mt-1 text-slate-800 whitespace-pre-line break-words">{status.message}</p>
                    {until && <p className="mt-2 text-sm text-slate-700">Fine prevista {until}.</p>}
                </section>
            )}

            <ul className="mt-8 bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100" aria-live="polite">
                {checks.map((c) => {
                    const s = STATE[c.state];
                    return (
                        <li key={c.id} className="px-5 py-4 flex items-center gap-4">
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot}`} aria-hidden="true" />
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold text-abisso">{c.label}</p>
                                <p className="text-sm text-slate-600">{c.description}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                                <p className={`text-sm font-semibold ${s.chip}`}>{s.text}</p>
                                {c.ms !== null && c.state !== 'checking' && <p className="text-xs text-slate-500 tabular-nums">{c.ms < 1000 ? `${c.ms} ms` : `${(c.ms / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} s`}</p>}
                            </div>
                        </li>
                    );
                })}
            </ul>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                    {checkedAt ? `Ultimo controllo alle ${checkedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}, ogni minuto in automatico.` : 'Controllo in corso…'}
                </p>
                <Button variant="secondary" size="sm" icon="arrow-path" busy={running} onClick={() => void run()}>Controlla di nuovo</Button>
            </div>

            {!LEGAL.isDraft && (
                <p className="mt-10 text-sm text-slate-600">
                    Qualcosa non va e qui è tutto verde? Scrivici a{' '}
                    <a href={`mailto:${LEGAL.contactEmail}`} className="font-semibold text-corsia-700 hover:underline py-1 -my-1 break-all">{LEGAL.contactEmail}</a>.
                </p>
            )}
            <p className="mt-6">
                <Link to="/" className="text-sm font-semibold text-corsia-700 hover:underline py-1 -my-1">Torna a SwimIn</Link>
            </p>
        </div>
    );
};

export default Status;
