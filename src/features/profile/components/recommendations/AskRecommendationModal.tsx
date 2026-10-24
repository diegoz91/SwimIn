import React, { useEffect, useMemo, useState } from 'react';
import { FormModal } from '@/components/form/FormModal';
import { Field } from '@/components/form/Field';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import { avatarOf, displayNameOf, headlineOf } from '@/utils/profile';
import type { StructureProfile, UserProfile } from '@/types/types';

type Person = UserProfile | StructureProfile;

/**
 * Chiedi una referenza ai tuoi collegamenti reciproci (colleghi o strutture), con un messaggio facoltativo.
 * Chi riceve la richiesta trova nella notifica il link per scriverla.
 */
export const AskRecommendationModal: React.FC<{ open: boolean; me: UserProfile; onClose: () => void }> = ({ open, me, onClose }) => {
    const { showToast } = useToast();
    const myId = me.userId || me.$id;
    const [people, setPeople] = useState<Person[] | null>(null);
    const [q, setQ] = useState('');
    const [message, setMessage] = useState('');
    const [sent, setSent] = useState<Record<string, 'sending' | 'sent' | 'already'>>({});

    useEffect(() => {
        if (!open) return;
        setQ('');
        const ids = me.connections || [];
        if (!ids.length) return setPeople([]);
        databaseService
            .getConnectionsProfiles(ids.slice(0, 100))
            .then((list) => setPeople(list.filter((p) => (p.connections || []).includes(myId))))
            .catch((err) => { console.warn('Collegamenti:', err); setPeople([]); });
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const shown = useMemo(() => {
        const term = q.trim().toLowerCase();
        return (people || []).filter((p) => !term || `${displayNameOf(p)} ${headlineOf(p)}`.toLowerCase().includes(term));
    }, [people, q]);

    const ask = async (p: Person) => {
        const id = p.userId || p.$id;
        setSent((s) => ({ ...s, [id]: 'sending' }));
        try {
            const r = await databaseService.requestRecommendation(id, message.trim());
            setSent((s) => ({ ...s, [id]: r.already ? 'already' : 'sent' }));
        } catch (err) {
            setSent((s) => { const n = { ...s }; delete n[id]; return n; });
            showToast(err instanceof Error ? err.message : 'Richiesta non inviata.', 'error');
        }
    };

    return (
        <FormModal
            open={open}
            title="Chiedi una referenza"
            description="Una referenza di chi ha lavorato con te vale più di qualsiasi descrizione. Puoi chiederla ai collegamenti reciproci."
            icon="star"
            submitLabel="Fatto"
            cancelLabel={null}
            onClose={onClose}
            onSubmit={(e) => { e.preventDefault(); onClose(); }}
        >
            <Field id="ask-rec-message" label="Messaggio" optional hint="Es. “Ti andrebbe di raccontare la stagione al Lido?”" count={{ value: message, max: 120 }}>
                <input value={message} onChange={(e) => setMessage(e.target.value.slice(0, 120))} maxLength={120} />
            </Field>
            {people && people.length > 6 && (
                <Field id="ask-rec-search" label="Cerca tra i collegamenti">
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
                </Field>
            )}
            {people === null ? (
                <ul className="space-y-3" aria-hidden="true">{[0, 1, 2].map((i) => <li key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}</ul>
            ) : people.length === 0 ? (
                <p className="text-slate-600 rounded-xl bg-piastrella p-4">Non hai ancora collegamenti reciproci. Collegati con colleghi e strutture con cui hai lavorato, poi torna qui.</p>
            ) : shown.length === 0 ? (
                <p className="text-slate-500">Nessun collegamento corrisponde alla ricerca.</p>
            ) : (
                <ul className="divide-y divide-slate-100 -mx-1">
                    {shown.map((p) => {
                        const id = p.userId || p.$id;
                        const state = sent[id];
                        return (
                            <li key={id} className="flex items-center gap-3 px-1 py-3">
                                <img src={avatarOf(p)} alt="" className="w-11 h-11 rounded-full object-cover bg-slate-100 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-abisso truncate">{displayNameOf(p)}</p>
                                    <p className="text-sm text-slate-500 truncate">{headlineOf(p)}</p>
                                </div>
                                {state === 'sent' || state === 'already' ? (
                                    <span className="text-sm font-semibold text-cloro-800 px-2">{state === 'sent' ? 'Richiesta inviata' : 'Già richiesta'}</span>
                                ) : (
                                    <button type="button" onClick={() => ask(p)} disabled={state === 'sending'} className="px-4 py-2 rounded-full text-sm font-semibold border border-corsia-200 text-corsia-700 hover:bg-corsia-50 disabled:opacity-60 flex-shrink-0">
                                        {state === 'sending' ? 'Invio…' : 'Chiedi'}
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </FormModal>
    );
};
