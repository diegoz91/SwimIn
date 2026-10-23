import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import { enablePush, pushState } from '@/services/push';

const DISMISS_KEY = 'swimin:push-prompt-dismissed';

const readDismissed = () => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
};

/** Invito discreto ad attivare le push, solo se il dispositivo le supporta e non sono ancora attive. */
export const PushPrompt: React.FC = () => {
    const { showToast } = useToast();
    const [publicKey, setPublicKey] = useState<string | null>(null);
    const [visible, setVisible] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (readDismissed()) return;
        let alive = true;
        Promise.all([pushState(), databaseService.getPushConfig()])
            .then(([state, cfg]) => {
                if (!alive) return;
                setPublicKey(cfg.publicKey);
                setVisible(state === 'off' && !!cfg.publicKey);
            })
            .catch((err) => console.error('Invito notifiche:', err));
        return () => { alive = false; };
    }, []);

    const dismiss = () => {
        setVisible(false);
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch (err) { console.warn('Preferenza non salvata:', err); }
    };

    const enable = async () => {
        if (!publicKey) return;
        setBusy(true);
        try {
            const state = await enablePush(publicKey);
            if (state === 'on') { showToast('Notifiche attive su questo dispositivo.', 'success'); setVisible(false); }
            else if (state === 'denied') { showToast('Il browser ha bloccato le notifiche.', 'error'); dismiss(); }
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Attivazione non riuscita.', 'error');
        } finally {
            setBusy(false);
        }
    };

    if (!visible) return null;
    return (
        <div className="mb-4 rounded-2xl border border-corsia-200 bg-corsia-50 p-4 flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 motion-reduce:animate-none">
            <Icon type="bell" className="w-6 h-6 text-corsia-600 flex-shrink-0" />
            <p className="flex-1 min-w-[12rem] text-sm text-abisso">
                <strong>Non perdere messaggi e SOS.</strong> Attiva le notifiche su questo dispositivo; puoi scegliere cosa ricevere in{' '}
                <Link to="/profile?tab=impostazioni&sezione=notifiche" className="font-semibold text-corsia-700 underline">Impostazioni</Link>.
            </p>
            <div className="flex gap-2">
                <button type="button" onClick={dismiss} className="px-4 py-2 rounded-full text-sm font-semibold text-slate-600 hover:bg-white">Non ora</button>
                <button type="button" disabled={busy} onClick={enable} className="px-4 py-2 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700 disabled:opacity-60">{busy ? 'Attendi…' : 'Attiva'}</button>
            </div>
        </div>
    );
};
