import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Checkbox } from '@/components/form/Field';
import { useToast } from '@/context/ToastContext';
import { databaseService, type NotificationPrefs, type NotifyCategory, type PushConfig } from '@/services/database';
import { disablePush, enablePush, pushState, type PushState } from '@/services/push';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

const CATEGORY_LABELS: Record<NotifyCategory, { label: string; hint: string }> = {
    messages: { label: 'Messaggi', hint: 'Quando qualcuno ti scrive.' },
    connections: { label: 'Collegamenti', hint: 'Richieste ricevute e accettate.' },
    social: { label: 'Attività e visite', hint: 'Reazioni, commenti, ripubblicazioni, conferme di competenze, visite al profilo.' },
    jobs: { label: 'Candidature e lavoro', hint: 'Nuove candidature, esiti, assunzioni.' },
    sos: { label: 'Sostituzioni urgenti', hint: 'SOS nella tua provincia quando sei disponibile.' },
    general: { label: 'Turni, verifiche e avvisi', hint: 'Turni assegnati, brevetti verificati, risposte alle recensioni.' },
    digest: { label: 'Riepilogo settimanale', hint: 'Il lunedì, un’email con richieste, messaggi, visite e offerte della settimana.' },
};

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-bold text-slate-900">{title}</h3>
        {description && <p className="text-sm text-slate-500 mt-1 mb-4">{description}</p>}
        {children}
    </section>
);

/** Push su questo dispositivo, preferenze per categoria e installazione dell'app. */
export const NotificationsTab: React.FC = () => {
    const { showToast } = useToast();
    const [config, setConfig] = useState<PushConfig | null>(null);
    const [state, setState] = useState<PushState | null>(null);
    const [busy, setBusy] = useState(false);
    const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
    const { mode: installMode, install } = useInstallPrompt();

    const load = useCallback(async () => {
        try {
            const [cfg, st] = await Promise.all([databaseService.getPushConfig(), pushState()]);
            setConfig(cfg);
            setPrefs(cfg.prefs);
            setState(st);
        } catch (err) {
            console.error('Notifiche:', err);
            showToast('Impossibile caricare le preferenze di notifica.', 'error');
        }
    }, [showToast]);

    useEffect(() => { void load(); }, [load]);

    const toggleDevice = async () => {
        if (!config?.publicKey) return;
        setBusy(true);
        try {
            const next = state === 'on' ? await disablePush() : await enablePush(config.publicKey);
            setState(next);
            if (next === 'on') showToast('Notifiche attive su questo dispositivo.', 'success');
            else if (next === 'denied') showToast('Il browser ha bloccato le notifiche: riattivale dalle impostazioni del sito.', 'error');
            else showToast('Notifiche disattivate su questo dispositivo.', 'info');
        } catch (err) {
            console.error('Push:', err);
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const test = async () => {
        try {
            await databaseService.sendTestPush();
            showToast('Notifica di prova inviata.', 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Invio non riuscito.', 'error');
        }
    };

    const setPref = async (cat: NotifyCategory, channel: 'push' | 'email', value: boolean) => {
        if (!prefs) return;
        const next = { ...prefs, [cat]: { ...prefs[cat], [channel]: value } };
        setPrefs(next);
        try {
            setPrefs(await databaseService.updateNotificationPrefs(next));
        } catch (err) {
            setPrefs(prefs);
            showToast(err instanceof Error ? err.message : 'Salvataggio non riuscito.', 'error');
        }
    };

    const deviceText: Record<PushState, string> = {
        on: 'Attive su questo dispositivo.',
        off: 'Spente su questo dispositivo.',
        denied: 'Bloccate dal browser. Per riattivarle apri le impostazioni del sito (icona del lucchetto nella barra degli indirizzi) e consenti le notifiche.',
        unsupported: 'Questo browser non supporta le notifiche push.',
        'ios-install': 'Su iPhone e iPad le notifiche arrivano solo dall’app installata: aggiungi SwimIn alla schermata Home (qui sotto), poi aprila da lì.',
    };

    return (
        <>
            <Section title="Notifiche su questo dispositivo" description="Ricevi un avviso anche quando SwimIn è chiuso: messaggi, candidature, SOS vicino a te.">
                {config === null || state === null ? (
                    <p className="text-sm text-slate-500">Caricamento…</p>
                ) : !config.publicKey ? (
                    <p className="text-sm text-slate-600">Le notifiche push non sono ancora attive sul server.</p>
                ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-slate-700 flex items-start gap-2 max-w-md">
                            <Icon type="bell" className={`w-5 h-5 flex-shrink-0 ${state === 'on' ? 'text-corsia-600' : 'text-slate-400'}`} />
                            {deviceText[state]}
                        </p>
                        <div className="flex gap-2">
                            {state === 'on' && (
                                <button type="button" onClick={test} className="px-4 py-2 rounded-full text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200">Invia una prova</button>
                            )}
                            {(state === 'on' || state === 'off') && (
                                <button type="button" disabled={busy} onClick={toggleDevice} className={`px-4 py-2 rounded-full text-sm font-semibold disabled:opacity-60 ${state === 'on' ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-corsia-600 text-white hover:bg-corsia-700'}`}>
                                    {busy ? 'Attendi…' : state === 'on' ? 'Disattiva' : 'Attiva le notifiche'}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </Section>

            {prefs && (
                <Section title="Cosa ricevere" description={config?.emailAvailable ? 'Scegli per ogni tipo di avviso se riceverlo come notifica push, per email o entrambi. Le notifiche nell’app restano sempre.' : 'Scegli quali avvisi ricevere come notifica push. Le notifiche nell’app restano sempre.'}>
                    <ul className="divide-y divide-slate-100">
                        {(Object.keys(CATEGORY_LABELS) as NotifyCategory[]).map((cat) => (
                            <li key={cat} className="py-3 flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-abisso">{CATEGORY_LABELS[cat].label}</p>
                                    <p className="text-xs text-slate-500">{CATEGORY_LABELS[cat].hint}</p>
                                </div>
                                <div className="flex gap-5">
                                    {cat !== 'digest' && <Checkbox id={`push-${cat}`} checked={prefs[cat].push} onChange={(v) => setPref(cat, 'push', v)} label="Push" />}
                                    {config?.emailAvailable && <Checkbox id={`email-${cat}`} checked={prefs[cat].email} onChange={(v) => setPref(cat, 'email', v)} label="Email" />}
                                </div>
                            </li>
                        ))}
                    </ul>
                </Section>
            )}

            <Section title="Installa SwimIn" description="Aprila dalla schermata Home come un’app: si avvia più in fretta e su iPhone abilita le notifiche.">
                {installMode === 'installed' ? (
                    <p className="text-sm text-slate-700 flex items-center gap-2"><Icon type="check" className="w-5 h-5 text-corsia-600" /> Stai già usando l’app installata.</p>
                ) : installMode === 'prompt' ? (
                    <button
                        type="button"
                        onClick={async () => { if (await install()) showToast('SwimIn è stata installata.', 'success'); }}
                        className="px-5 py-2.5 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700"
                    >
                        Installa l’app
                    </button>
                ) : installMode === 'ios' ? (
                    <p className="text-sm text-slate-700">In Safari tocca <strong>Condividi</strong>, poi <strong>Aggiungi alla schermata Home</strong>.</p>
                ) : (
                    <p className="text-sm text-slate-600">Dal menu del browser scegli <strong>Installa app</strong> o <strong>Aggiungi alla schermata Home</strong>.</p>
                )}
            </Section>
        </>
    );
};
