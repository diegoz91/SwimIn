import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { databaseService } from '@/services/database';
import { ProvinceSelect, Select } from '@/components/form/Pickers';
import { Icon } from '@/components/ui/Icon';
import { Stars } from '@/features/reviews/Stars';
import { POOL_SERVICES } from '@/data/swimming';
import { provinceName } from '@/data/italy';
import { avatarOf, ratingOf } from '@/utils/profile';
import type { Facility, StructureProfile } from '@/types/types';

type Item = {
    id: string;
    name: string;
    type?: string;
    city?: string;
    province?: string;
    logo: string;
    services: string[];
    poolLength?: number | null;
    rating: { average: number; count: number } | null;
};

const fromProfile = (p: StructureProfile): Item => ({
    id: p.userId || p.$id,
    name: p.structureName || 'Struttura',
    type: p.structureType,
    city: p.city,
    province: p.province,
    logo: avatarOf(p),
    services: p.services || [],
    poolLength: p.poolLength,
    rating: ratingOf(p),
});
const fromFacility = (f: Facility): Item => ({
    id: f.$id,
    name: f.name,
    type: f.type,
    city: f.city,
    province: f.province,
    logo: avatarOf(f),
    services: [],
    rating: ratingOf(f),
});

/** Elenco di piscine e strutture: per chi cerca dove nuotare, lavorare o fare un corso. */
const Structures: React.FC = () => {
    usePageTitle('Piscine e strutture');
    const { user } = useAuth();
    const [province, setProvince] = useState((user?.province || '').toUpperCase());
    const [search, setSearch] = useState('');
    const [service, setService] = useState('');
    const [sort, setSort] = useState<'rating' | 'name'>('rating');
    const [items, setItems] = useState<Item[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        setItems(null);
        const t = window.setTimeout(() => {
            databaseService
                .getStructuresDirectory({ province, search })
                .then(({ profiles, facilities }) => !cancelled && setItems([...profiles.map(fromProfile), ...facilities.map(fromFacility)]))
                .catch((e) => {
                    console.error('Strutture:', e);
                    if (!cancelled) setItems([]);
                });
        }, search ? 350 : 0);
        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
    }, [province, search]);

    const shown = useMemo(() => {
        const list = (items || []).filter((i) => !service || i.services.includes(service));
        return list.sort((a, b) =>
            sort === 'rating' ? (b.rating?.average || 0) - (a.rating?.average || 0) || (b.rating?.count || 0) - (a.rating?.count || 0) || a.name.localeCompare(b.name, 'it') : a.name.localeCompare(b.name, 'it')
        );
    }, [items, service, sort]);

    return (
        <div className="pt-4 max-w-5xl mx-auto w-full">
            <h1 className="text-4xl font-bold text-abisso leading-none">Piscine e strutture</h1>
            <p className="text-slate-500 mt-2 mb-5">Trova dove nuotare, seguire un corso o lavorare, con le recensioni di chi ci va.</p>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 mb-5">
                <div className="relative">
                    <Icon type="search" className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Nome o comune"
                        aria-label="Cerca per nome o comune"
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-corsia-400 focus:ring-4 focus:ring-corsia-100 outline-none"
                    />
                </div>
                <ProvinceSelect value={province} onChange={setProvince} />
                <Select label="Attività" value={service} onChange={setService} placeholder="Tutte le attività" clearLabel="Tutte le attività" options={POOL_SERVICES.map((s) => ({ value: s, label: s }))} />
                <div className="sm:w-44">
                    <Select label="Ordina" value={sort} onChange={(v) => setSort(v as 'rating' | 'name')} options={[{ value: 'rating', label: 'Più apprezzate' }, { value: 'name', label: 'Nome (A–Z)' }]} />
                </div>
            </div>
            {province && (
                <button onClick={() => setProvince('')} className="mb-4 text-sm font-semibold text-corsia-700 hover:underline">
                    Mostra tutta Italia invece di {provinceName(province) || province}
                </button>
            )}

            {items === null ? (
                <div className="grid sm:grid-cols-2 gap-4" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 bg-white border border-slate-200 rounded-2xl animate-pulse" />)}
                </div>
            ) : shown.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Icon type="building" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="font-semibold text-abisso">Nessuna struttura trovata.</p>
                    <p className="text-sm text-slate-500 mt-1">Prova un’altra provincia o togli il filtro sulle attività.</p>
                </div>
            ) : (
                <ul className="grid sm:grid-cols-2 gap-4">
                    {shown.map((s) => (
                        <li key={s.id}>
                            <Link to={`/profile/${s.id}`} className="group flex gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-card hover:border-corsia-200 hover:shadow-lift transition-shadow h-full">
                                <img src={s.logo} alt="" className="w-16 h-16 rounded-xl object-cover border border-slate-100 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-abisso group-hover:text-corsia-700 truncate">{s.name}</p>
                                    <p className="text-sm text-slate-500 truncate">{[s.type, s.city && `${s.city}${s.province ? ` (${s.province})` : ''}`].filter(Boolean).join(' · ')}</p>
                                    <div className="flex items-center gap-2 mt-1.5 text-sm">
                                        {s.rating ? (
                                            <>
                                                <Stars value={s.rating.average} />
                                                <span className="font-semibold text-abisso">{s.rating.average.toLocaleString('it-IT', { minimumFractionDigits: 1 })}</span>
                                                <span className="text-slate-500">({s.rating.count})</span>
                                            </>
                                        ) : (
                                            <span className="text-slate-400">Ancora nessuna recensione</span>
                                        )}
                                    </div>
                                    {(s.poolLength || s.services.length > 0) && (
                                        <p className="text-xs text-slate-500 mt-2 truncate">
                                            {[s.poolLength ? `Vasca da ${s.poolLength} m` : '', ...s.services.slice(0, 3)].filter(Boolean).join(' · ')}
                                        </p>
                                    )}
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default Structures;
