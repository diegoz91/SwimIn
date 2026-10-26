import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { databaseService, type AppStatusMode } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { formatUntil, useAppStatus } from '@/hooks/useAppStatus';
import { Field, fieldClass } from '@/components/form/Field';
import { DatePicker, TimePicker } from '@/components/form/Pickers';
import { Button } from '@/components/ui/Button';
import { Icon, type IconType } from '@/components/ui/Icon';
import { formatRelativeTime } from '@/utils/format';
import { isValidISODate, todayISO, toISODate } from '@/utils/dates';

const MODES: { id: AppStatusMode; label: string; hint: string; icon: IconType }[] = [
    { id: 'ok', label: 'Tutto funziona', hint: 'Nessun avviso.', icon: 'check-circle' },
    { id: 'degraded', label: 'Rallentamenti', hint: 'Striscia gialla in cima a ogni pagina, l’app resta usabile.', icon: 'alert-triangle' },
    { id: 'maintenance', label: 'Manutenzione', hint: 'Tutti vedono la pagina di manutenzione. Tu e gli altri amministratori continuate a usare l’app.', icon: 'shield' },
];

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Stato del servizio deciso dagli amministratori: si applica subito a tutti, senza rilasciare
 * il sito (riga `app_status` letta dall'app e dalla pagina /stato).
 */
export const AdminStatus: React.FC = () => {
    const { status, refresh } = useAppStatus();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [mode, setMode] = useState<AppStatusMode>(status.mode);
    const [message, setMessage] = useState(status.message);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setMode(status.mode);
        setMessage(status.message);
        const d = status.until ? new Date(status.until) : null;
        if (d && !Number.isNaN(d.getTime())) {
            setDate(toISODate(d));
            setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
        } else {
            setDate('');
            setTime('');
        }
    }, [status]);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (mode !== 'ok' && message.trim().length < 5) return setError('Scrivi un messaggio per gli utenti.');
        if ((date && !time) || (!date && time)) return setError('Indica sia il giorno sia l’ora di fine, oppure lasciali vuoti.');
        if (date && !isValidISODate(date)) return setError('Giorno non valido.');
        const until = date && time ? new Date(`${date}T${time}:00`).toISOString() : '';
        if (mode === 'maintenance' && status.mode !== 'maintenance') {
            const ok = await confirm({
                title: 'Mettere SwimIn in manutenzione?',
                message: 'Da subito tutti gli utenti vedranno la pagina di manutenzione e non potranno usare l’app. Gli amministratori continuano a lavorare.',
                confirmLabel: 'Attiva la manutenzione',
                tone: 'danger',
            });
            if (!ok) return;
        }
        setSaving(true);
        try {
            await databaseService.adminSetAppStatus(mode, message.trim(), mode === 'ok' ? '' : until);
            await refresh();
            showToast(mode === 'ok' ? 'Avvisi tolti: per gli utenti è tutto normale.' : mode === 'maintenance' ? 'Manutenzione attiva.' : 'Avviso di rallentamenti pubblicato.', 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Stato non salvato.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const current = MODES.find((m) => m.id === status.mode)!;
    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <form onSubmit={save} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5" noValidate>
                <fieldset>
                    <legend className="text-sm font-semibold text-abisso mb-2">Cosa vedono gli utenti</legend>
                    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Stato del servizio">
                        {MODES.map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                role="radio"
                                aria-checked={mode === m.id}
                                onClick={() => setMode(m.id)}
                                className={`text-left rounded-xl border p-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-corsia-500 ${mode === m.id ? 'border-corsia-600 bg-corsia-50' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                <span className="flex items-center gap-2 font-semibold text-abisso"><Icon type={m.icon} className="w-4 h-4" />{m.label}</span>
                                <span className="block mt-1 text-xs text-slate-600">{m.hint}</span>
                            </button>
                        ))}
                    </div>
                </fieldset>

                {mode !== 'ok' && (
                    <>
                        <Field id="status-message" label="Messaggio per gli utenti" count={{ value: message, max: 500 }}>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                rows={3}
                                maxLength={500}
                                placeholder={mode === 'maintenance' ? 'Es. Stiamo aggiornando il database. Torniamo online entro le 23:30.' : 'Es. Le notifiche possono arrivare con qualche minuto di ritardo.'}
                                className={fieldClass(undefined, 'resize-y')}
                            />
                        </Field>
                        <div>
                            <p className="text-sm font-semibold text-abisso mb-1.5">Fine prevista <span className="font-normal text-slate-500">facoltativa</span></p>
                            <div className="grid grid-cols-2 gap-3 max-w-sm">
                                <DatePicker label="Giorno di fine" value={date} onChange={setDate} min={todayISO()} />
                                <TimePicker label="Ora di fine" value={time} onChange={setTime} from="00:00" to="23:45" />
                            </div>
                        </div>
                    </>
                )}

                {error && <p role="alert" className="text-sm font-medium text-galleggiante-700">{error}</p>}
                <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" busy={saving} variant={mode === 'maintenance' ? 'dark' : 'primary'}>
                        {mode === 'ok' ? 'Togli gli avvisi' : mode === status.mode ? 'Aggiorna l’avviso' : mode === 'maintenance' ? 'Attiva la manutenzione' : 'Pubblica l’avviso'}
                    </Button>
                    <Link to="/stato" className="text-sm font-semibold text-corsia-700 hover:underline py-1 -my-1">Apri la pagina di stato</Link>
                </div>
            </form>

            <aside className="space-y-3 text-sm">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <p className="text-slate-600">Adesso</p>
                    <p className="mt-1 font-semibold text-abisso flex items-center gap-2"><Icon type={current.icon} className="w-4 h-4" />{current.label}</p>
                    {status.until && <p className="mt-1 text-slate-600">Fine prevista {formatUntil(status.until)}</p>}
                    {status.updatedAt && <p className="mt-1 text-xs text-slate-500">Aggiornato {formatRelativeTime(status.updatedAt)}</p>}
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 text-slate-600 space-y-2">
                    <p className="font-semibold text-abisso">Se Appwrite non risponde</p>
                    <p>Questo pannello non funziona. Su Vercel imposta <code className="text-xs">VITE_MAINTENANCE=on</code> (e se vuoi <code className="text-xs">VITE_MAINTENANCE_MESSAGE</code>) e rilancia il deploy: la manutenzione compare a tutti in un paio di minuti.</p>
                </div>
            </aside>
        </div>
    );
};
