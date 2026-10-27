import React, { useEffect, useState } from 'react';
import type { UserProfile } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { FormModal } from '@/components/form/FormModal';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import { DAYS, PARTS, normalizeAvailability, slotKey, summarizeAvailability } from '@/utils/availability';

/** Griglia giorni × fasce; in sola lettura mostra le fasce scelte. */
const AvailabilityGrid: React.FC<{ value: string[]; onToggle?: (slot: string) => void }> = ({ value, onToggle }) => {
    const editable = !!onToggle;
    return (
        <div className="overflow-x-auto -mx-1 px-1" tabIndex={0} role="region" aria-label="Disponibilità settimanale">
            <table className="w-full border-separate border-spacing-1 text-sm min-w-[22rem]">
                <thead>
                    <tr>
                        <th className="w-24" />
                        {DAYS.map((d) => (
                            <th key={d.key} scope="col" className="font-semibold text-slate-500 text-xs pb-1">
                                <abbr title={d.label} className="no-underline">{d.short}</abbr>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {PARTS.map((p) => (
                        <tr key={p.key}>
                            <th scope="row" className="text-left font-semibold text-abisso pr-2 whitespace-nowrap">
                                {p.label}
                                <span className="block text-[11px] font-normal text-slate-400">{p.hours}</span>
                            </th>
                            {DAYS.map((d) => {
                                const key = slotKey(d.key, p.key);
                                const on = value.includes(key);
                                const label = `${d.label} ${p.label.toLowerCase()}`;
                                return (
                                    <td key={key} className="p-0">
                                        {editable ? (
                                            <button
                                                type="button"
                                                aria-pressed={on}
                                                aria-label={label}
                                                onClick={() => onToggle(key)}
                                                className={`w-full h-11 rounded-lg border transition-all duration-150 outline-none focus-visible:ring-4 focus-visible:ring-corsia-100 active:scale-95 ${
                                                    on ? 'bg-cloro-500 border-cloro-500 text-abisso' : 'bg-white border-slate-200 hover:border-cloro-400'
                                                }`}
                                            >
                                                {on && <Icon type="check" className="w-4 h-4 mx-auto" />}
                                            </button>
                                        ) : (
                                            <span
                                                role="img"
                                                aria-label={`${label}: ${on ? 'disponibile' : 'non disponibile'}`}
                                                className={`block h-7 rounded-md ${on ? 'bg-cloro-400' : 'bg-slate-100'}`}
                                            />
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const PRESETS: { label: string; slots: () => string[] }[] = [
    { label: 'Feriali sera', slots: () => DAYS.slice(0, 5).map((d) => slotKey(d.key, 'sera')) },
    { label: 'Weekend', slots: () => DAYS.slice(5).flatMap((d) => PARTS.map((p) => slotKey(d.key, p.key))) },
    { label: 'Sempre', slots: () => DAYS.flatMap((d) => PARTS.map((p) => slotKey(d.key, p.key))) },
];

/** Sezione del profilo: quando il professionista può lavorare. */
export const AvailabilitySection: React.FC<{ profile: UserProfile; isOwnProfile: boolean; onUpdated?: (p: UserProfile) => void }> = ({ profile, isOwnProfile, onUpdated }) => {
    const { showToast } = useToast();
    const saved = normalizeAvailability(profile.availability);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<string[]>(saved);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) setDraft(normalizeAvailability(profile.availability));
    }, [open, profile.availability]);

    if (!isOwnProfile && !saved.length) return null;

    const toggle = (slot: string) => setDraft((prev) => (prev.includes(slot) ? prev.filter((s) => s !== slot) : normalizeAvailability([...prev, slot])));

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const updated = await databaseService.updateProfile(profile.userId || profile.$id, { availability: normalizeAvailability(draft) });
            onUpdated?.({ ...profile, ...updated } as UserProfile);
            showToast('Disponibilità aggiornata.', 'success');
            setOpen(false);
        } catch (error) {
            console.error('Disponibilità:', error);
            showToast('Non è stato possibile salvare la disponibilità.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="bg-white rounded-3xl shadow-xs border border-slate-200 p-6 sm:p-8 mb-6" aria-labelledby="availability-title">
            <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                    <h2 id="availability-title" className="text-xl font-bold text-abisso flex items-center gap-2">
                        <Icon type="calendar" className="w-5 h-5 text-corsia-600" />
                        Disponibilità
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">{saved.length ? summarizeAvailability(saved) : 'Indica quando puoi lavorare: le strutture ti trovano più facilmente per turni e sostituzioni.'}</p>
                </div>
                {isOwnProfile && (
                    <button onClick={() => setOpen(true)} data-html2canvas-ignore="true" className="shrink-0 text-sm font-semibold text-corsia-700 bg-corsia-50 hover:bg-corsia-100 px-3 py-1.5 rounded-full inline-flex items-center gap-1">
                        <Icon type={saved.length ? 'edit' : 'plus'} className="w-4 h-4" /> {saved.length ? 'Modifica' : 'Aggiungi'}
                    </button>
                )}
            </div>
            {saved.length > 0 && <AvailabilityGrid value={saved} />}

            <FormModal
                open={open}
                size="lg"
                title="La tua disponibilità"
                description="Tocca le fasce in cui di solito sei libero. Puoi cambiarla quando vuoi."
                icon="calendar"
                dirty={JSON.stringify(draft) !== JSON.stringify(saved)}
                busy={saving}
                submitLabel="Salva"
                onClose={() => setOpen(false)}
                onSubmit={save}
            >
                <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                        <button key={p.label} type="button" onClick={() => setDraft(normalizeAvailability([...draft, ...p.slots()]))} className="px-3 py-1.5 rounded-full text-sm font-semibold bg-piastrella text-corsia-700 hover:bg-corsia-50 border border-corsia-100">
                            + {p.label}
                        </button>
                    ))}
                    {draft.length > 0 && (
                        <button type="button" onClick={() => setDraft([])} className="px-3 py-1.5 rounded-full text-sm font-semibold text-slate-500 hover:bg-slate-100">
                            Svuota
                        </button>
                    )}
                </div>
                <AvailabilityGrid value={draft} onToggle={toggle} />
                <p className="text-sm text-slate-600 min-h-[1.25rem]" aria-live="polite">
                    {draft.length ? summarizeAvailability(draft) : 'Nessuna fascia selezionata.'}
                </p>
            </FormModal>
        </section>
    );
};
