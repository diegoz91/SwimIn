import React, { useEffect, useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { confirmTotpSetup, disableTotp, mfaStatus, regenerateRecoveryCodes, startTotpSetup, totpQrUrl } from '@/services/mfa';

const codeInput = 'w-40 px-4 py-2.5 rounded-xl border border-slate-200 focus:border-corsia-400 focus:ring-4 focus:ring-corsia-100 outline-none text-lg tracking-[0.3em] tabular-nums';

const downloadCodes = (codes: string[]) => {
    const text = `Codici di recupero SwimIn\n\nOgni codice si usa una volta sola, se non hai il telefono con l'app di autenticazione.\nConservali in un posto sicuro.\n\n${codes.join('\n')}\n`;
    const href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = href;
    a.download = 'swimin-codici-di-recupero.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
};

const RecoveryCodes: React.FC<{ codes: string[]; onDone: () => void }> = ({ codes, onDone }) => (
    <div className="rounded-2xl border border-cloro-200 bg-cloro-50/60 p-4">
        <p className="font-semibold text-abisso">Salva i codici di recupero</p>
        <p className="text-sm text-slate-600 mt-1">Se perdi il telefono, ognuno di questi codici ti fa entrare una volta. Non te li mostreremo più.</p>
        <ul className="grid grid-cols-2 gap-2 mt-3 font-mono text-sm">
            {codes.map((c) => <li key={c} className="bg-white rounded-lg px-3 py-1.5 border border-slate-200 text-center">{c}</li>)}
        </ul>
        <div className="flex flex-wrap gap-2 mt-4">
            <button type="button" onClick={() => downloadCodes(codes)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-50 flex items-center gap-2">
                <Icon type="download" className="w-4 h-4" /> Scarica
            </button>
            <button type="button" onClick={() => navigator.clipboard?.writeText(codes.join('\n')).catch((err) => console.warn('Copia:', err))} className="px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-50">Copia</button>
            <button type="button" onClick={onDone} className="px-4 py-2 rounded-xl text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700">Li ho salvati</button>
        </div>
    </div>
);

/** Verifica in due passaggi con un'app di autenticazione (impostazioni → Password e accesso). */
export const TwoFactorSetup: React.FC = () => {
    const { showToast } = useToast();
    const [status, setStatus] = useState<{ enabled: boolean } | null>(null);
    const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string | null } | null>(null);
    const [code, setCode] = useState('');
    const [codes, setCodes] = useState<string[] | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        mfaStatus().then((s) => setStatus({ enabled: s.enabled })).catch((err) => { console.warn('Stato 2FA:', err); setStatus({ enabled: false }); });
    }, []);

    const begin = async () => {
        setBusy(true);
        try {
            const s = await startTotpSetup();
            setSetup({ ...s, qr: null });
            totpQrUrl(s.uri).then((qr) => setSetup((prev) => (prev ? { ...prev, qr } : prev))).catch((err) => console.warn('QR:', err));
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Attivazione non riuscita.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const confirm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!/^\d{6}$/.test(code.replace(/\s/g, ''))) return showToast('Inserisci il codice di 6 cifre mostrato dall’app.', 'error');
        setBusy(true);
        try {
            const recovery = await confirmTotpSetup(code);
            setCodes(recovery);
            setSetup(null);
            setCode('');
            setStatus({ enabled: true });
            showToast('Verifica in due passaggi attivata.', 'success');
        } catch (err) {
            showToast(err instanceof Error && /invalid|non valid/i.test(err.message) ? 'Codice non valido: controlla l’ora del telefono e riprova.' : err instanceof Error ? err.message : 'Codice non valido.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const disable = async () => {
        if (!window.confirm('Disattivare la verifica in due passaggi? Per entrare basterà di nuovo la password.')) return;
        setBusy(true);
        try {
            await disableTotp();
            setStatus({ enabled: false });
            setCodes(null);
            showToast('Verifica in due passaggi disattivata.', 'info');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Disattivazione non riuscita.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const newCodes = async () => {
        if (!window.confirm('Generare nuovi codici di recupero? Quelli vecchi non funzioneranno più.')) return;
        try {
            setCodes(await regenerateRecoveryCodes());
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Codici non generati.', 'error');
        }
    };

    if (!status) return <div className="h-10 w-48 rounded-xl bg-slate-100 animate-pulse" aria-hidden="true" />;

    if (codes) return <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />;

    if (setup) {
        return (
            <form onSubmit={confirm} className="space-y-4">
                <ol className="space-y-4 text-sm text-slate-700">
                    <li>
                        <p className="font-semibold text-abisso">1. Inquadra il codice con l’app di autenticazione</p>
                        <p className="text-slate-500">Google Authenticator, Microsoft Authenticator, Authy, 1Password…</p>
                        <div className="mt-3 flex flex-col sm:flex-row gap-4 sm:items-center">
                            <div className="w-[180px] h-[180px] rounded-xl border border-slate-200 bg-white grid place-items-center overflow-hidden flex-shrink-0">
                                {setup.qr ? <img src={setup.qr} alt="Codice QR per l’app di autenticazione" className="w-full h-full" /> : <span className="text-xs text-slate-400 px-4 text-center">Caricamento del QR…</span>}
                            </div>
                            <div className="min-w-0">
                                <p className="text-slate-500">Non riesci a inquadrarlo? Inserisci questa chiave:</p>
                                <p className="font-mono text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mt-1 break-all select-all">{setup.secret}</p>
                            </div>
                        </div>
                    </li>
                    <li>
                        <label htmlFor="totp-setup" className="font-semibold text-abisso block">2. Scrivi il codice di 6 cifre che vedi nell’app</label>
                        <input id="totp-setup" value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, '').slice(0, 7))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className={`${codeInput} mt-2`} />
                    </li>
                </ol>
                <div className="flex gap-2">
                    <button type="submit" disabled={busy} className="px-4 py-2 text-sm font-bold text-white bg-corsia-600 hover:bg-corsia-700 rounded-xl disabled:opacity-60">{busy ? 'Verifica…' : 'Attiva'}</button>
                    <button type="button" onClick={() => { setSetup(null); setCode(''); }} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Annulla</button>
                </div>
            </form>
        );
    }

    return status.enabled ? (
        <div className="space-y-3">
            <p className="text-sm font-semibold text-cloro-700 flex items-center gap-2"><Icon type="shield" className="w-5 h-5" /> Attiva: all’accesso ti chiediamo anche il codice dell’app.</p>
            <div className="flex flex-wrap gap-2">
                <button onClick={newCodes} disabled={busy} className="px-4 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl">Nuovi codici di recupero</button>
                <button onClick={disable} disabled={busy} className="px-4 py-2 text-sm font-semibold text-galleggiante-700 hover:bg-red-50 rounded-xl">Disattiva</button>
            </div>
        </div>
    ) : (
        <button onClick={begin} disabled={busy} className="px-4 py-2 text-sm font-bold text-white bg-corsia-600 hover:bg-corsia-700 rounded-xl disabled:opacity-60 flex items-center gap-2">
            <Icon type="shield" className="w-4 h-4" /> {busy ? 'Preparazione…' : 'Attiva la verifica in due passaggi'}
        </button>
    );
};
