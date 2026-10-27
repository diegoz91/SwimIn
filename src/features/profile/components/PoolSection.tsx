import React from 'react';
import type { StructureProfile } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { POOL_SETTINGS } from '@/data/swimming';

/** Strutture: dati dell'impianto e attività proposte. */
export const PoolSection: React.FC<{ profile: StructureProfile; isOwnProfile: boolean; onEdit: () => void }> = ({ profile, isOwnProfile, onEdit }) => {
    const facts = [
        profile.poolLength ? { label: 'Vasca principale', value: `${profile.poolLength} m` } : null,
        profile.lanes ? { label: 'Corsie', value: String(profile.lanes) } : null,
        profile.poolSetting ? { label: 'Vasche', value: POOL_SETTINGS.find((p) => p.value === profile.poolSetting)?.label || '' } : null,
    ].filter((f): f is { label: string; value: string } => !!f);
    const services = profile.services || [];
    const address = [profile.address, [profile.postalCode, profile.city].filter(Boolean).join(' '), profile.province].filter(Boolean).join(', ');
    if (!facts.length && !services.length && !profile.address && !isOwnProfile) return null;

    return (
        <section className="bg-white rounded-3xl shadow-xs border border-slate-200 p-6 sm:p-8 mb-6" aria-labelledby="pool-title">
            <div className="flex items-start justify-between gap-4 mb-5">
                <h2 id="pool-title" className="text-xl font-bold text-abisso">L’impianto</h2>
                {isOwnProfile && (
                    <button onClick={onEdit} className="text-sm font-semibold text-corsia-700 bg-corsia-50 hover:bg-corsia-100 px-3 py-1.5 rounded-full inline-flex items-center gap-1">
                        <Icon type="edit" className="w-4 h-4" /> Modifica
                    </button>
                )}
            </div>
            {facts.length > 0 && (
                <dl className="grid grid-cols-3 gap-3 mb-5">
                    {facts.map((f) => (
                        <div key={f.label} className="rounded-2xl bg-piastrella px-4 py-3">
                            <dt className="text-xs text-slate-500">{f.label}</dt>
                            <dd className="font-display text-2xl font-bold text-abisso leading-tight">{f.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
            {services.length > 0 && (
                <ul className="flex flex-wrap gap-2 mb-4" aria-label="Attività proposte">
                    {services.map((s) => (
                        <li key={s} className="text-sm font-semibold text-corsia-800 bg-corsia-50 border border-corsia-100 px-3 py-1 rounded-full">{s}</li>
                    ))}
                </ul>
            )}
            {profile.address && (
                <a
                    href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-1 -my-1 inline-flex items-center gap-1.5 text-sm text-corsia-700 font-semibold hover:underline"
                >
                    <Icon type="location" className="w-4 h-4" /> {address}
                </a>
            )}
            {!facts.length && !services.length && !profile.address && (
                <p className="text-slate-500 text-sm">Indica lunghezza della vasca, corsie e attività: i professionisti capiscono subito dove andranno a lavorare.</p>
            )}
        </section>
    );
};
