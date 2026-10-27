import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { databaseService } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { ChoiceChips } from '@/components/form/Field';
import { GroupFormModal } from '@/features/groups/GroupFormModal';
import { GROUP_CATEGORIES, groupCategoryLabel } from '@/data/groups';
import type { Group, GroupCategory, GroupMember } from '@/types/types';

const membersLabel = (n: number) => (n === 1 ? '1 membro' : `${n.toLocaleString('it-IT')} membri`);

const GroupRow: React.FC<{ group: Group; status?: GroupMember['status'] }> = ({ group, status }) => (
    <Link to={`/gruppi/${group.$id}`} className="group flex gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-card hover:border-corsia-200 hover:shadow-lift transition-shadow h-full">
        <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-linear-to-br from-corsia-700 to-cloro-500 grid place-items-center">
            {group.cover ? <img src={group.cover} alt="" className="w-full h-full object-cover" /> : <Icon type="users" className="w-7 h-7 text-white/90" />}
        </div>
        <div className="min-w-0 flex-1">
            <p className="font-semibold text-abisso group-hover:text-corsia-700 truncate">{group.name}</p>
            <p className="text-sm text-slate-500 truncate">
                {[groupCategoryLabel(group.category), group.province, membersLabel(group.membersCount || 0)].filter(Boolean).join(' · ')}
            </p>
            <p className="text-sm text-slate-600 mt-1 line-clamp-2">{group.description}</p>
            {status === 'pending' && <p className="text-xs font-semibold text-amber-700 mt-1.5">Richiesta in attesa di approvazione</p>}
            {group.privacy === 'approval' && !status && (
                <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1"><Icon type="lock-closed" className="w-3.5 h-3.5" /> Su approvazione</p>
            )}
        </div>
    </Link>
);

/** Gruppi e community: i miei gruppi e quelli da scoprire. */
const Groups: React.FC = () => {
    usePageTitle('Gruppi');
    const { user } = useAuth();
    const navigate = useNavigate();
    const [groups, setGroups] = useState<Group[] | null>(null);
    const [mine, setMine] = useState<GroupMember[]>([]);
    const [mineGroups, setMineGroups] = useState<Group[]>([]);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<GroupCategory | ''>('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (!user) return;
        let alive = true;
        Promise.all([databaseService.listGroups(), databaseService.getMyGroupMemberships(user.$id)])
            .then(async ([all, memberships]) => {
                const relevant = memberships.filter((m) => m.status !== 'banned');
                const known = new Set(all.map((g) => g.$id));
                const missing = relevant.map((m) => m.groupId).filter((id) => !known.has(id));
                const extra = missing.length ? await databaseService.getGroupsByIds(missing) : [];
                if (!alive) return;
                setGroups(all);
                setMine(relevant);
                const byId = new Map([...all, ...extra].map((g) => [g.$id, g]));
                setMineGroups(relevant.map((m) => byId.get(m.groupId)).filter((g): g is Group => !!g));
            })
            .catch((err) => {
                console.error('Gruppi:', err);
                if (alive) setGroups([]);
            });
        return () => { alive = false; };
    }, [user]);

    const statusOf = useMemo(() => new Map(mine.map((m) => [m.groupId, m.status])), [mine]);
    const discover = useMemo(() => {
        const q = search.trim().toLocaleLowerCase('it-IT');
        const myProvince = (user?.province || '').toUpperCase();
        return (groups || [])
            .filter((g) => !statusOf.has(g.$id))
            .filter((g) => !category || g.category === category)
            .filter((g) => !q || `${g.name} ${g.description}`.toLocaleLowerCase('it-IT').includes(q))
            // Prima i gruppi della mia provincia, poi i più numerosi.
            .sort((a, b) => Number(b.province === myProvince && !!myProvince) - Number(a.province === myProvince && !!myProvince) || (b.membersCount || 0) - (a.membersCount || 0));
    }, [groups, statusOf, category, search, user?.province]);

    return (
        <div className="pt-4 max-w-5xl mx-auto w-full">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
                <div>
                    <h1 className="text-4xl font-bold text-abisso leading-none">Gruppi</h1>
                    <p className="text-slate-500 mt-2">Confrontati con chi vive la tua stessa vasca: master, bagnini, istruttori, allenatori.</p>
                </div>
                <button onClick={() => setCreating(true)} className="px-5 py-2.5 rounded-full font-semibold bg-corsia-600 text-white hover:bg-corsia-700 flex items-center gap-2">
                    <Icon type="plus" className="w-5 h-5" /> Crea un gruppo
                </button>
            </div>

            {mineGroups.length > 0 && (
                <section className="mb-8" aria-labelledby="my-groups">
                    <h2 id="my-groups" className="text-2xl font-bold text-abisso mb-3">I tuoi gruppi</h2>
                    <ul className="grid sm:grid-cols-2 gap-4">
                        {mineGroups.map((g) => <li key={g.$id} className="min-w-0"><GroupRow group={g} status={statusOf.get(g.$id)} /></li>)}
                    </ul>
                </section>
            )}

            <section aria-labelledby="discover-groups">
                <h2 id="discover-groups" className="text-2xl font-bold text-abisso mb-3">Scopri</h2>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 mb-5 space-y-3">
                    <div className="relative">
                        <Icon type="search" className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Cerca per nome o argomento"
                            aria-label="Cerca un gruppo"
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-corsia-400 focus:ring-4 focus:ring-corsia-100 outline-hidden"
                        />
                    </div>
                    <ChoiceChips
                        label="Categoria"
                        options={[{ value: '' as GroupCategory | '', label: 'Tutti' }, ...GROUP_CATEGORIES]}
                        value={[category]}
                        onChange={(v) => setCategory(v[0])}
                    />
                </div>

                {groups === null ? (
                    <div className="grid sm:grid-cols-2 gap-4" aria-hidden="true">
                        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 bg-white border border-slate-200 rounded-2xl animate-pulse" />)}
                    </div>
                ) : discover.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300 px-4">
                        <Icon type="users" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                        <p className="font-semibold text-abisso">{search || category ? 'Nessun gruppo con questi filtri.' : 'Ancora nessun gruppo da scoprire.'}</p>
                        <p className="text-sm text-slate-500 mt-1">Crea tu il primo: basta un nome e due righe di descrizione.</p>
                        <button onClick={() => setCreating(true)} className="mt-4 px-5 py-2.5 rounded-full font-semibold border border-corsia-600 text-corsia-700 hover:bg-corsia-50">Crea un gruppo</button>
                    </div>
                ) : (
                    <ul className="grid sm:grid-cols-2 gap-4">
                        {discover.map((g) => <li key={g.$id} className="min-w-0"><GroupRow group={g} /></li>)}
                    </ul>
                )}
            </section>

            <GroupFormModal open={creating} onClose={() => setCreating(false)} onSaved={(g) => navigate(`/gruppi/${g.$id}`)} />
        </div>
    );
};

export default Groups;
