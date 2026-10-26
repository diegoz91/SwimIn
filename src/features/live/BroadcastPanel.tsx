import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, databaseService, type LiveIngress } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/hooks/useAuth';
import { Icon } from '@/components/ui/Icon';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { isPremium } from '@/utils/premium';
import { detectDevice } from '@/utils/device';

type App = 'obs' | 'prism';

const STEPS: Record<App, { rtmp: string[]; whip?: string[] }> = {
    obs: {
        rtmp: [
            'Apri OBS Studio › Impostazioni › Trasmissione (Stream).',
            'Servizio: «Personalizzato».',
            'Incolla il server e la chiave qui sotto, poi OK.',
            'Prepara le scene (fotocamera, presentazione, video del corso) e premi «Avvia trasmissione».',
        ],
        whip: [
            'OBS Studio 30 o successivo › Impostazioni › Trasmissione (Stream).',
            'Servizio: «WHIP».',
            'Server = indirizzo qui sotto; Bearer Token = la chiave.',
            'Premi «Avvia trasmissione»: il ritardo scende sotto il secondo.',
        ],
    },
    prism: {
        rtmp: [
            'Apri Prism Live Studio (computer o app per smartphone) e tocca «Vai in diretta».',
            'Aggiungi una piattaforma › «RTMP personalizzato» (Custom RTMP).',
            'Incolla l’indirizzo del server e la chiave di trasmissione qui sotto.',
            'Sullo smartphone puoi trasmettere anche lo schermo del telefono; poi avvia la diretta.',
        ],
    },
};

/** Campo da copiare (server o chiave), con la chiave nascosta finché non la si mostra. */
const CopyField: React.FC<{ label: string; value: string; secret?: boolean }> = ({ label, value, secret }) => {
    const { showToast } = useToast();
    const [shown, setShown] = useState(!secret);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            showToast(`${label} copiato.`, 'success');
        } catch (err) {
            console.warn('Copia:', err);
            showToast('Copia non riuscita: selezionalo e copialo a mano.', 'error');
        }
    };
    return (
        <div>
            <p className="text-xs font-semibold text-abisso">{label}</p>
            <div className="mt-1 flex items-center gap-1 rounded-xl border border-slate-200 bg-piastrella pl-3">
                <code className="flex-1 min-w-0 truncate text-sm text-abisso py-2.5">{shown ? value : '•'.repeat(Math.min(24, value.length))}</code>
                {secret && (
                    <button type="button" onClick={() => setShown((v) => !v)} className="w-10 h-10 grid place-items-center rounded-lg text-slate-600 hover:text-abisso" aria-label={shown ? `Nascondi ${label.toLowerCase()}` : `Mostra ${label.toLowerCase()}`}>
                        <Icon type="eye" className="w-4 h-4" />
                    </button>
                )}
                <button type="button" onClick={copy} className="w-10 h-10 grid place-items-center rounded-lg text-corsia-700 hover:bg-white" aria-label={`Copia ${label.toLowerCase()}`}>
                    <Icon type="clipboard" className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

/**
 * Per chi conduce: trasmettere con OBS Studio o Prism Live Studio. SwimIn crea indirizzo e
 * chiave (validi solo per questa diretta, li vede solo chi conduce). Su smartphone propone Prism,
 * l'unico modo per trasmettere lo schermo del telefono.
 */
export const BroadcastPanel: React.FC<{ roomId: string }> = ({ roomId }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const device = useMemo(() => detectDevice(), []);
    const [app, setApp] = useState<App>(device.kind === 'desktop' ? 'obs' : 'prism');
    const [ingress, setIngress] = useState<LiveIngress | null>(null);
    const [busy, setBusy] = useState(false);
    const premium = isPremium(user);

    useEffect(() => {
        databaseService.getLiveIngress(roomId).then(setIngress).catch((err) => console.warn('Dati di trasmissione:', err));
    }, [roomId]);

    const create = async (kind: 'rtmp' | 'whip') => {
        setBusy(true);
        try {
            setIngress(await databaseService.createLiveIngress(roomId, kind));
            showToast('Dati di trasmissione pronti: incollali nel programma.', 'success');
        } catch (err) {
            // Riservato a Premium: l'invito si apre da solo.
            if (!(err instanceof ApiError && err.code === 'premium_required')) showToast(err instanceof Error ? err.message : 'Non è stato possibile preparare la trasmissione.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const kind = app === 'prism' ? 'rtmp' : ingress?.kind || 'rtmp';
    const steps = (kind === 'whip' ? STEPS.obs.whip : STEPS[app].rtmp) || [];
    const matching = ingress && (app === 'prism' ? ingress.kind === 'rtmp' : true);

    return (
        <section className="bg-white rounded-3xl border border-slate-200 shadow-card p-5" aria-labelledby="broadcast-title">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="broadcast-title" className="text-xl font-bold text-abisso">Trasmetti con un programma</h2>
                {!premium && <span className="inline-flex items-center gap-1 text-xs font-semibold text-oro-700"><PremiumBadge /> Premium</span>}
            </div>
            <p className="mt-1 text-sm text-slate-600">Scene, più telecamere, slide e video del corso: usa OBS Studio o Prism Live Studio e manda tutto qui.</p>

            <div className="mt-3 inline-flex bg-piastrella rounded-full p-1" role="radiogroup" aria-label="Programma">
                {(['obs', 'prism'] as const).map((a) => (
                    <button key={a} role="radio" aria-checked={app === a} onClick={() => setApp(a)} className={`px-4 py-1.5 rounded-full text-sm font-semibold ${app === a ? 'bg-white text-abisso shadow-card' : 'text-slate-600'}`}>
                        {a === 'obs' ? 'OBS Studio' : 'Prism Live Studio'}
                    </button>
                ))}
            </div>
            {device.kind !== 'desktop' && app === 'obs' && <p className="mt-2 text-sm text-slate-600">OBS Studio funziona solo su computer: dallo smartphone usa Prism Live Studio.</p>}

            {!premium ? (
                <div className="mt-4 rounded-2xl bg-oro-50 border border-oro-200 p-4 text-sm text-slate-800">
                    Trasmettere da OBS o Prism è incluso in SwimIn Premium. Dal browser puoi andare in diretta con fotocamera, microfono{device.canShareScreen ? ' e schermo' : ''} anche con il piano Base.
                    <Link to="/premium" className="block mt-2 font-semibold text-oro-700 hover:underline py-1 -my-1">Scopri Premium</Link>
                </div>
            ) : matching ? (
                <div className="mt-4 space-y-3">
                    <CopyField label={kind === 'whip' ? 'Indirizzo WHIP' : 'Server'} value={ingress!.serverUrl} />
                    <CopyField label={kind === 'whip' ? 'Bearer token' : 'Chiave di trasmissione'} value={ingress!.streamKey} secret />
                    <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-700">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
                    <p className="text-xs text-slate-500">La chiave vale solo per questa diretta e la vedi solo tu: non condividerla. Chiudendo la diretta smette di funzionare.</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {app === 'obs' && ingress!.kind === 'rtmp' && <button disabled={busy} onClick={() => create('whip')} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline disabled:opacity-60">Usa WHIP (meno ritardo, OBS 30+)</button>}
                        {app === 'obs' && ingress!.kind === 'whip' && <button disabled={busy} onClick={() => create('rtmp')} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline disabled:opacity-60">Usa RTMP (versioni precedenti)</button>}
                        <button disabled={busy} onClick={() => create(kind)} className="py-1 -my-1 font-semibold text-slate-600 hover:text-abisso disabled:opacity-60">Genera una nuova chiave</button>
                    </div>
                </div>
            ) : (
                <div className="mt-4">
                    <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-700">{STEPS[app].rtmp.map((s) => <li key={s}>{s}</li>)}</ol>
                    <button disabled={busy} onClick={() => create('rtmp')} className="mt-4 px-4 py-2.5 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900 disabled:opacity-60 inline-flex items-center gap-1.5">
                        <Icon type="key" className="w-4 h-4" /> {busy ? 'Preparazione…' : 'Crea server e chiave'}
                    </button>
                </div>
            )}
        </section>
    );
};
