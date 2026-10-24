import React, { useCallback, useEffect, useState } from 'react';
import { Icon, type IconType } from '@/components/ui/Icon';
import { Switch } from '@/components/form/Switch';
import { useToast } from '@/context/ToastContext';
import { databaseService, type NotificationPrefs, type NotifyCategory, type PushConfig } from '@/services/database';
import { disablePush, enablePush, pushState, type PushState } from '@/services/push';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { Badge, Group, Row, RowSkeleton, SectionHeader, btn } from './settings/ui';

const CATEGORIES: { id: NotifyCategory; label: string; hint: string; icon: IconType }[] = [
    { id: 'messages', label: 'Messaggi', hint: 'Quando qualcuno ti scrive.', icon: 'chat-bubble' },
    { id: 'connections', label: 'Collegamenti', hint: 'Richieste ricevute e accettate.', icon: 'user-plus' },
    { id: 'jobs', label: 'Candidature e lavoro', hint: 'Nuove candidature, esiti, assunzioni e avvisi di lavoro.', icon: 'briefcase' },
    { id: 'sos', label: 'Sostituzioni urgenti', hint: 'SOS nella tua provincia quando sei disponibile.', icon: 'alert-triangle' },
    { id: 'social', label: 'Attività e visite', hint: 'Reazioni, commenti, ripubblicazioni, conferme di competenze, visite al profilo.', icon: 'like' },
    { id: 'general', label: 'Turni, verifiche e avvisi', hint: 'Turni assegnati, brevetti verificati, risposte alle recensioni, referenze.', icon: 'calendar' },
    { id: 'digest', label: 'Riepilogo settimanale', hint: 'Il lunedì, un’email con richieste, messaggi, visite e offerte della settimana.', icon: 'mail' },
];

const DEVICE_TEXT: Record<PushState, { title: string; text: string; tone: 'ok' | 'neutral' | 'warn' }> = {
    on: { title: 'Attive', text: 'Ricevi gli avvisi anche quando SwimIn è chiuso.', tone: 'ok' },
    off: { title: 'Spente', text: 'Attivale per ricevere messaggi, candidature e SOS anche a SwimIn chiuso.', tone: 'neutral' },
    denied: { title: 'Bloccate dal browser', text: 'Apri le impostazioni del sito (il lucchetto nella barra degli indirizzi) e consenti le notifiche.', tone: 'warn' },
    unsupported: { title: 'Non disponibili', text: 'Questo browser non supporta le notifiche push.', tone: 'neutral' },
    'ios-install': { title: 'Serve l’app', text: 'Su iPhone e iPad le notifiche arrivano solo dall’app installata: aggiungila alla schermata Home (qui sotto) e aprila da lì.', tone: 'warn' },
};

/** Push su questo dispositivo, preferenze per tipo di avviso e installazione dell'app. */
export const NotificationsTab: React.FC = () => {
    const { showToast } = useToast();
    const [config, setConfig] = useState<PushConfig | null>(null);
    const [state, setState] = useState<PushState | null>(null);
    const [busy, setBusy] = useState(false);
    const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
    const [failed, setFailed] = useState(false);
    const { mode: installMode, install } = useInstallPrompt();

    const load = useCallback(async () => {
        try {
            const [cfg, st] = await Promise.all([databaseService.getPushConfig(), pushState()]);
            setConfig(cfg);
            setPrefs(cfg.prefs);
            setState(st);
        } catch (err) {
            console.error('Notifiche:', err);
            setFailed(true);
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

    const email = !!config?.emailAvailable;
    const visible = CATEGORIES.filter((c) => c.id !== 'digest' || email);
    const loading = !failed && (config === null || state === null);

    return (
        <>
            <SectionHeader title="Notifiche" description="Scegli cosa ricevere e dove. Le notifiche dentro SwimIn restano sempre nella pagina Notifiche." />
            <div className="space-y-5">
                <Group title="Questo dispositivo">
                    {loading ? (
                        <RowSkeleton rows={1} />
                    ) : !config?.publicKey || !state ? (
                        <Row icon="bell" title="Notifiche push" description="Le notifiche push non sono ancora attive sul server." />
                    ) : (
                        <Row
                            icon="bell"
                            title={<span className="flex flex-wrap items-center gap-2">Notifiche push <Badge tone={DEVICE_TEXT[state].tone}>{DEVICE_TEXT[state].title}</Badge></span>}
                            description={DEVICE_TEXT[state].text}
                            aside={
                                <>
                                    {state === 'on' && <button type="button" onClick={test} className={btn.quiet}>Invia una prova</button>}
                                    {(state === 'on' || state === 'off') && (
                                        <button type="button" disabled={busy} onClick={toggleDevice} className={state === 'on' ? btn.secondary : btn.primary}>
                                            {busy ? 'Attendi…' : state === 'on' ? 'Disattiva' : 'Attiva'}
                                        </button>
                                    )}
                                </>
                            }
                        />
                    )}
                    <InstallRow mode={installMode} onInstall={async () => { if (await install()) showToast('SwimIn è stata installata.', 'success'); }} />
                </Group>

                <Group
                    title="Cosa ricevere"
                    description={email ? 'Per ogni tipo di avviso scegli la notifica push, l’email o entrambe.' : 'Per ogni tipo di avviso scegli se ricevere la notifica push.'}
                >
                    {loading ? (
                        <RowSkeleton rows={4} />
                    ) : !prefs ? (
                        <Row title="Preferenze non disponibili" description="Riprova tra qualche minuto." />
                    ) : (
                        visible.map((c) => (
                            <Row
                                key={c.id}
                                icon={c.icon}
                                title={c.label}
                                description={c.hint}
                                aside={
                                    <div className="flex items-end gap-4">
                                        {c.id !== 'digest' && <Channel id={`push-${c.id}`} label="Push" name={`${c.label}: notifica push`} checked={prefs[c.id].push} onChange={(v) => setPref(c.id, 'push', v)} />}
                                        {email && <Channel id={`email-${c.id}`} label="Email" name={`${c.label}: email`} checked={prefs[c.id].email} onChange={(v) => setPref(c.id, 'email', v)} />}
                                    </div>
                                }
                            />
                        ))
                    )}
                </Group>
            </div>
        </>
    );
};

const Channel: React.FC<{ id: string; label: string; name: string; checked: boolean; onChange: (v: boolean) => void }> = ({ id, label, name, checked, onChange }) => (
    <div className="flex flex-col items-center gap-1 w-14">
        <span className="text-xs font-semibold text-slate-500" aria-hidden="true">{label}</span>
        <Switch id={id} label={name} checked={checked} onChange={onChange} />
    </div>
);

const InstallRow: React.FC<{ mode: ReturnType<typeof useInstallPrompt>['mode']; onInstall: () => void }> = ({ mode, onInstall }) => (
    <Row
        icon="device-phone"
        title="App SwimIn"
        description={
            mode === 'installed' ? (
                <span className="inline-flex items-center gap-1.5"><Icon type="check" className="w-4 h-4 text-cloro-700" /> Stai usando l’app installata.</span>
            ) : mode === 'ios' ? (
                <>In Safari tocca <strong>Condividi</strong>, poi <strong>Aggiungi alla schermata Home</strong>.</>
            ) : mode === 'prompt' ? (
                'Aprila dalla schermata Home come un’app: si avvia più in fretta e riceve le notifiche.'
            ) : (
                <>Dal menu del browser scegli <strong>Installa app</strong> o <strong>Aggiungi alla schermata Home</strong>.</>
            )
        }
        aside={mode === 'prompt' && <button type="button" onClick={onInstall} className={btn.secondary}>Installa</button>}
    />
);
