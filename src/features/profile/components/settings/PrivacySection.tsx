import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { useBlocks } from '@/context/BlocksContext';
import { databaseService } from '@/services/database';
import { avatarOf, displayNameOf } from '@/utils/profile';
import { isPremium } from '@/utils/premium';
import { requestPremium } from '@/services/premiumPrompt';
import { Switch } from '@/components/form/Switch';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import type { AuthenticatedUser, StructureProfile, UserProfile } from '@/types/types';
import { Group, Row, SectionHeader, btn } from './ui';

type ToggleKey = 'readReceipts' | 'publicProfile' | 'hideProfileViews';

export const PrivacySection: React.FC<{ user: AuthenticatedUser }> = ({ user }) => {
    const { showToast } = useToast();
    const { updateProfile } = useAuth();
    const isPerson = user.userType === 'professional';
    const premium = isPremium(user);
    const [values, setValues] = useState<Record<ToggleKey, boolean>>({
        readReceipts: user.readReceipts !== false,
        publicProfile: !!user.publicProfile,
        hideProfileViews: !!user.hideProfileViews,
    });
    const [exporting, setExporting] = useState(false);
    const publicUrl = `${window.location.origin}/u/${user.$id}`;

    const save = async (key: ToggleKey, next: boolean, done?: string) => {
        setValues((v) => ({ ...v, [key]: next }));
        try {
            const patch: Partial<UserProfile> = key === 'readReceipts' ? { readReceipts: next } : key === 'publicProfile' ? { publicProfile: next } : { hideProfileViews: next };
            await updateProfile(patch);
            if (done) showToast(done, 'success');
        } catch (err) {
            console.error(`Impostazione ${key}:`, err);
            setValues((v) => ({ ...v, [key]: !next }));
            showToast('Impostazione non salvata. Riprova.', 'error');
        }
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(publicUrl);
            showToast('Link copiato.', 'success');
        } catch (err) {
            console.warn('Copia del link:', err);
            showToast('Copia non riuscita: seleziona il link e copialo a mano.', 'error');
        }
    };

    const exportData = async () => {
        setExporting(true);
        try {
            const data = await databaseService.exportMyData(user.$id);
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `swimin-dati-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            showToast('Download avviato.', 'success');
        } catch (err) {
            console.error('Esportazione dati:', err);
            showToast('Esportazione non riuscita. Riprova.', 'error');
        } finally {
            setExporting(false);
        }
    };

    const link = (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-corsia-700 hover:underline break-all">{publicUrl.replace(/^https?:\/\//, '')}</a>
            <button type="button" onClick={copyLink} className="py-1 -my-1 font-semibold text-slate-600 hover:text-abisso hover:underline">Copia</button>
        </span>
    );

    return (
        <>
            <SectionHeader title="Privacy e visibilità" description="Chi vede il tuo profilo e la tua attività, chi hai bloccato e i dati che conserviamo." />
            <div className="space-y-5">
                <Group title="Visibilità">
                    {isPerson ? (
                        <Row
                            icon="globe"
                            title="Pagina pubblica del profilo"
                            descriptionId="pv-public"
                            description={
                                <>
                                    Chi ha il link, o ti trova su un motore di ricerca, vede nome, qualifica, comune, esperienze e brevetti validi. Telefono, email, post e messaggi restano riservati.
                                    {values.publicProfile && link}
                                </>
                            }
                            aside={<Switch label="Pagina pubblica del profilo" describedBy="pv-public" checked={values.publicProfile} onChange={(v) => save('publicProfile', v, v ? 'Il tuo profilo ora ha una pagina pubblica.' : 'Il profilo è visibile solo agli iscritti.')} />}
                        />
                    ) : (
                        <Row icon="globe" title="Pagina pubblica della struttura" description={<>Sempre visibile: chi cerca una piscina la trova anche senza account, con recensioni e servizi.{link}</>} />
                    )}
                    <Row
                        icon="user-circle"
                        title={<span className="flex items-center gap-2">Visite anonime ai profili <PremiumBadge /></span>}
                        descriptionId="pv-anon"
                        description="Quando visiti un profilo Base, la persona vede “Qualcuno ha visualizzato il tuo profilo” invece del tuo nome. Chi è Premium vede sempre chi lo visita."
                        aside={
                            <Switch
                                label="Visite anonime ai profili"
                                describedBy="pv-anon"
                                checked={values.hideProfileViews && premium}
                                onChange={(v) => (premium ? save('hideProfileViews', v) : requestPremium('Le visite anonime ai profili sono incluse in SwimIn Premium.'))}
                            />
                        }
                    />
                    <Row
                        icon="check-double"
                        title="Conferme di lettura"
                        descriptionId="pv-read"
                        description="Chi ti scrive vede quando hai letto i suoi messaggi (spunte blu). Se le spegni, vede solo che il messaggio è stato consegnato."
                        aside={<Switch label="Conferme di lettura" describedBy="pv-read" checked={values.readReceipts} onChange={(v) => save('readReceipts', v)} />}
                    />
                </Group>

                <BlockedGroup />

                <Group title="I tuoi dati">
                    <Row
                        icon="download"
                        title="Scarica una copia dei tuoi dati"
                        description="Profilo, post, commenti, candidature e collegamenti in un file JSON (diritto alla portabilità, art. 20 GDPR)."
                        aside={<button type="button" onClick={exportData} disabled={exporting} className={btn.secondary}>{exporting ? 'Preparazione…' : 'Scarica'}</button>}
                    />
                    <Row
                        icon="document"
                        title="Come trattiamo i tuoi dati"
                        description={<>Leggi la <Link to="/privacy" className="font-semibold text-corsia-700 hover:underline">privacy policy</Link> e la <Link to="/cookie" className="font-semibold text-corsia-700 hover:underline">cookie policy</Link>.</>}
                    />
                </Group>
            </div>
        </>
    );
};

/** Persone bloccate o silenziate, con foto e la possibilità di annullare. */
const BlockedGroup: React.FC = () => {
    const { blocked, muted, unblock } = useBlocks();
    const [profiles, setProfiles] = useState<Record<string, UserProfile | StructureProfile>>({});
    const ids = [...new Set([...blocked, ...muted])];
    const key = ids.join(',');

    useEffect(() => {
        if (!ids.length) return;
        databaseService
            .getConnectionsProfiles(ids)
            .then((list) => setProfiles(Object.fromEntries(list.map((p) => [p.userId || p.$id, p]))))
            .catch((err) => console.warn('Profili bloccati:', err));
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

    const rows = [...blocked.map((id) => ({ id, kind: 'block' as const })), ...muted.map((id) => ({ id, kind: 'mute' as const }))];

    return (
        <Group title="Persone bloccate e silenziate" description="Chi è bloccato non può scriverti né vedere i tuoi contenuti. Chi è silenziato resta collegato, ma non compare nel tuo feed.">
            {rows.length === 0 ? (
                <Row title="Nessuno" description="Puoi bloccare o silenziare una persona dal menu del suo profilo." />
            ) : (
                rows.map((r) => {
                    const p = profiles[r.id];
                    const name = p ? displayNameOf(p) : 'Utente di SwimIn';
                    return (
                        <Row
                            key={`${r.kind}-${r.id}`}
                            leading={<img src={avatarOf(p)} alt="" className="w-10 h-10 rounded-full object-cover bg-slate-100 shrink-0" />}
                            title={<Link to={`/profile/${r.id}`} className="hover:underline">{name}</Link>}
                            description={r.kind === 'block' ? 'Bloccato' : 'Silenziato'}
                            aside={<button type="button" onClick={() => unblock(r.id, r.kind)} className={btn.secondary}>{r.kind === 'block' ? 'Sblocca' : 'Riattiva'}</button>}
                        />
                    );
                })
            )}
        </Group>
    );
};
