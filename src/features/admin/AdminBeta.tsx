import React, { useCallback, useEffect, useState } from 'react';
import { databaseService, type BetaInvite } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { useAppStatus } from '@/hooks/useAppStatus';
import { Field } from '@/components/form/Field';
import { DatePicker } from '@/components/form/Pickers';
import { Switch } from '@/components/form/Switch';
import { FormModal } from '@/components/form/FormModal';
import { PageLoader } from '@/components/common/PageLoader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { formatDate, todayISO } from '@/utils/dates';

/** Link dell'invito: apre la home, che ricorda il codice e propone l'iscrizione. */
export const inviteLink = (code: string) => `${window.location.origin}/?invito=${code}`;

const stateOf = (i: BetaInvite): { label: string; cls: string } => {
    if (!i.active) return { label: 'Disattivato', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
    if (i.expiresAt && i.expiresAt < todayISO()) return { label: 'Scaduto', cls: 'bg-slate-100 text-slate-700 border-slate-200' };
    if (i.uses >= i.maxUses) return { label: 'Esaurito', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
    return { label: 'Attivo', cls: 'bg-cloro-50 text-cloro-800 border-cloro-200' };
};

/** QR dell'invito, da scaricare (PNG) per stamparlo o mandarlo. */
const QrModal: React.FC<{ invite: BetaInvite | null; onClose: () => void }> = ({ invite, onClose }) => {
    const { showToast } = useToast();
    const [src, setSrc] = useState<string | null>(null);
    useEffect(() => {
        setSrc(null);
        if (!invite) return;
        let alive = true;
        import('qrcode')
            .then((QR) => QR.toDataURL(inviteLink(invite.code), { width: 720, margin: 2, errorCorrectionLevel: 'M' }))
            .then((url) => alive && setSrc(url))
            .catch((err) => {
                console.error('QR non generato:', err);
                showToast('QR non generato. Usa il link.', 'error');
            });
        return () => { alive = false; };
    }, [invite, showToast]);
    if (!invite) return null;
    const link = inviteLink(invite.code);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link);
            showToast('Link copiato.', 'success');
        } catch (err) {
            console.warn('Copia non riuscita:', err);
            showToast('Copia non riuscita: seleziona il link e copialo.', 'error');
        }
    };
    return (
        <FormModal open title={`Invito ${invite.code}`} description={invite.label || 'Inquadra il QR con la fotocamera del telefono: si apre SwimIn con il codice già pronto.'} icon="link" submitLabel="Chiudi" cancelLabel={null} onClose={onClose} onSubmit={(e) => { e.preventDefault(); onClose(); }}>
            <div className="flex flex-col items-center gap-4">
                <div className="w-64 h-64 sm:w-72 sm:h-72 rounded-2xl border border-slate-200 bg-white p-2 grid place-items-center palette-fixed">
                    {src ? <img src={src} alt={`QR dell'invito ${invite.code}`} className="w-full h-full" /> : <span className="w-10 h-10 border-4 border-slate-200 border-t-corsia-600 rounded-full animate-spin" aria-label="Generazione del QR" />}
                </div>
                <p className="text-center text-sm text-slate-600 break-all">{link}</p>
                <div className="flex flex-wrap justify-center gap-2">
                    {src && (
                        <a href={src} download={`swimin-invito-${invite.code}.png`} className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700">
                            <Icon type="download" className="w-4 h-4" /> Scarica il QR
                        </a>
                    )}
                    <Button size="sm" variant="secondary" icon="link" onClick={() => void copy()}>Copia il link</Button>
                </div>
                <p className="text-xs text-slate-500 text-center">Usi: {invite.uses} su {invite.maxUses}{invite.expiresAt ? ` · valido fino al ${formatDate(invite.expiresAt)}` : ''}</p>
            </div>
        </FormModal>
    );
};

/**
 * Fase di test (Admin): iscrizione solo su invito sì/no, codici con QR e link, usi e scadenza.
 * Ogni azione passa dalla Function e finisce nel registro degli accessi.
 */
export const AdminBeta: React.FC = () => {
    const { showToast } = useToast();
    const { refresh } = useAppStatus();
    const [data, setData] = useState<{ inviteOnly: boolean; invites: BetaInvite[] } | null>(null);
    const [label, setLabel] = useState('');
    const [maxUses, setMaxUses] = useState('20');
    const [expiresAt, setExpiresAt] = useState('');
    const [busy, setBusy] = useState(false);
    const [qr, setQr] = useState<BetaInvite | null>(null);

    const load = useCallback(async () => {
        try {
            setData(await databaseService.adminListInvites());
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Inviti non caricati.', 'error');
            setData({ inviteOnly: true, invites: [] });
        }
    }, [showToast]);
    useEffect(() => { void load(); }, [load]);

    const toggleInviteOnly = async (enabled: boolean) => {
        try {
            await databaseService.adminSetInviteOnly(enabled);
            setData((d) => (d ? { ...d, inviteOnly: enabled } : d));
            await refresh();
            showToast(enabled ? 'Iscrizione solo su invito.' : 'Iscrizione aperta a tutti.', 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        }
    };

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        const max = Number(maxUses);
        if (!(max >= 1 && max <= 1000)) return showToast('Usi massimi tra 1 e 1000.', 'error');
        setBusy(true);
        try {
            const inv = await databaseService.adminCreateInvite({ label: label.trim(), maxUses: max, expiresAt });
            setData((d) => (d ? { ...d, invites: [inv, ...d.invites] } : d));
            setLabel('');
            setQr(inv);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Invito non creato.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const setActive = async (inv: BetaInvite, active: boolean) => {
        try {
            const next = await databaseService.adminSetInviteActive(inv.$id, active);
            setData((d) => (d ? { ...d, invites: d.invites.map((x) => (x.$id === inv.$id ? next : x)) } : d));
            showToast(active ? 'Invito riattivato.' : 'Invito disattivato.', 'success', { action: { label: 'Annulla', onClick: () => void setActive(next, !active) } });
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        }
    };

    if (!data) return <PageLoader variant="list" />;

    return (
        <div className="space-y-5">
            <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-bold text-abisso leading-tight">Fase di test</h2>
                    <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                        Con l’iscrizione su invito ci si registra solo con un codice valido (QR o link). Chi ha già un account entra normalmente. Tutti vedono l’avviso della fase di test e lo accettano prima di usare l’app.
                    </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span id="invite-only-label" className="text-sm font-semibold text-abisso">Solo su invito</span>
                    <Switch checked={data.inviteOnly} onChange={(v) => void toggleInviteOnly(v)} label="Iscrizione solo su invito" describedBy="invite-only-label" />
                </div>
            </section>

            <form onSubmit={create} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_12rem_auto] sm:items-end">
                <Field id="invite-label" label="Per chi è" hint="Es. Istruttori Piscina Lido, gruppo master.">
                    <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
                </Field>
                <Field id="invite-max" label="Usi massimi">
                    <input type="number" inputMode="numeric" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
                </Field>
                <Field id="invite-expiry" label="Scadenza" optional>
                    <DatePicker label="Scadenza" value={expiresAt} onChange={setExpiresAt} min={todayISO()} />
                </Field>
                <Button type="submit" icon="plus" busy={busy}>Crea invito</Button>
            </form>

            {data.invites.length === 0 ? (
                <p className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">Nessun invito: creane uno e condividi il QR.</p>
            ) : (
                <ul className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                    {data.invites.map((i) => {
                        const st = stateOf(i);
                        return (
                            <li key={i.$id} className="px-4 py-3 sm:px-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                                <div className="min-w-0 flex-1">
                                    <p className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold text-abisso tracking-widest">{i.code}</span>
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                                    </p>
                                    <p className="text-sm text-slate-500 mt-0.5 break-words">
                                        {[i.label, `${i.uses} su ${i.maxUses} usi`, i.expiresAt ? `fino al ${formatDate(i.expiresAt)}` : '', `creato il ${formatDate(i.createdAt.slice(0, 10))}`].filter(Boolean).join(' · ')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button size="sm" variant="secondary" onClick={() => setQr(i)}>QR e link</Button>
                                    <Button size="sm" variant={i.active ? 'danger' : 'quiet'} onClick={() => void setActive(i, !i.active)}>{i.active ? 'Disattiva' : 'Riattiva'}</Button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            <QrModal invite={qr} onClose={() => setQr(null)} />
        </div>
    );
};
