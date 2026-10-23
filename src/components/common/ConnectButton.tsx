import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService, type ConnectionStatus } from '@/services/database';
import { emitNetworkChange } from '@/utils/networkEvents';

/**
 * Pulsante di collegamento con lo stato reale: "Collegati", "Richiesta inviata",
 * "Accetta" (se è l'altra persona ad averla inviata) o "Collegato".
 */
export const ConnectButton: React.FC<{ profileId: string; className?: string }> = ({ profileId, className = '' }) => {
    const { user, refreshProfile } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [status, setStatus] = useState<ConnectionStatus | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        databaseService.getConnectionStatus(user, profileId).then((s) => !cancelled && setStatus(s));
        return () => {
            cancelled = true;
        };
    }, [user, profileId]);

    if (!user || !status || profileId === user.$id) return null;

    const run = async (fn: () => Promise<unknown>, success: string, next: ConnectionStatus) => {
        setBusy(true);
        try {
            await fn();
            setStatus(next);
            showToast(success, 'success');
            emitNetworkChange({ type: next.state === 'connected' ? 'accepted' : 'sent', userId: profileId });
            if (next.state === 'connected') await refreshProfile();
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Operazione non riuscita.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const base = `px-5 py-2.5 rounded-full font-semibold flex items-center gap-2 transition disabled:opacity-60 outline-none focus-visible:ring-2 focus-visible:ring-corsia-500 ${className}`;

    switch (status.state) {
        case 'connected':
            return (
                <button onClick={() => navigate('/network')} className={`${base} bg-white border border-slate-200 text-slate-700 hover:bg-slate-50`}>
                    <Icon type="check" className="w-4 h-4" /> Collegato
                </button>
            );
        case 'sent':
            return (
                <button disabled className={`${base} bg-white border border-slate-200 text-slate-500`}>
                    <Icon type="clock" className="w-4 h-4" /> Richiesta inviata
                </button>
            );
        case 'received':
            return (
                <button
                    onClick={() => run(() => databaseService.acceptConnectionRequest(status.connectionId), 'Ora siete collegati.', { state: 'connected' })}
                    disabled={busy}
                    className={`${base} bg-cloro-500 text-abisso hover:bg-cloro-400`}
                >
                    <Icon type="check" className="w-4 h-4" /> Accetta collegamento
                </button>
            );
        default:
            return (
                <button
                    onClick={() => run(() => databaseService.sendConnectionRequest(user.$id, profileId), 'Richiesta di collegamento inviata.', { state: 'sent' })}
                    disabled={busy}
                    className={`${base} bg-corsia-600 text-white hover:bg-corsia-700`}
                >
                    <Icon type="plus" className="w-4 h-4" /> Collegati
                </button>
            );
    }
};
