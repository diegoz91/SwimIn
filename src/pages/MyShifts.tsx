import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useSignal } from '@/hooks/useSignal';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService, type MyTeam, type StaffInvite } from '@/services/database';
import { initialsAvatar } from '@/utils/avatar';
import { formatRelativeTime } from '@/utils/format';
import { Icon } from '@/components/ui/Icon';
import { PageLoader } from '@/components/common/PageLoader';
import { ShiftWeek, type ShiftItem } from '@/features/profile/components/ShiftWeek';
import { todayISO, weekStartISO } from '@/utils/dates';
import { type IcsEvent } from '@/utils/ics';
import { AddToCalendar } from '@/components/common/AddToCalendar';

const toEvent = (s: ShiftItem): IcsEvent => {
    const [start, end] = s.shiftTime.split('–');
    return { uid: s.$id, title: `Turno ${s.role ? `${s.role.toLowerCase()} ` : ''}· ${s.structureName || 'SwimIn'}`, date: s.date, start, end, location: s.structureName, description: 'Turno assegnato su SwimIn.' };
};

/** I turni di chi lavora in una o più strutture: settimana, conferma, calendario. */
const MyShifts: React.FC = () => {
    usePageTitle('I miei turni');
    const { user } = useAuth();
    const { showToast } = useToast();
    const [shifts, setShifts] = useState<ShiftItem[] | null>(null);
    const [weekStart, setWeekStart] = useState(() => weekStartISO(todayISO()));
    const [invites, setInvites] = useState<StaffInvite[]>([]);
    const [teams, setTeams] = useState<MyTeam[]>([]);

    // Inviti nello staff da accettare e strutture di cui faccio parte.
    const loadTeams = useCallback(async () => {
        const [inv, tm] = await Promise.all([
            databaseService.listMyStaffInvites().catch((err) => { console.error('Inviti:', err); return [] as StaffInvite[]; }),
            databaseService.listMyTeams().catch((err) => { console.error('Strutture:', err); return [] as MyTeam[]; }),
        ]);
        setInvites(inv);
        setTeams(tm);
    }, []);
    useEffect(() => { void loadTeams(); }, [loadTeams]);

    const answer = async (inv: StaffInvite, accept: boolean) => {
        try {
            await databaseService.respondStaffInvite(inv.structureId, accept);
            showToast(accept ? `Benvenuto nello staff di ${inv.name}.` : 'Invito rifiutato.', accept ? 'success' : 'info');
            await Promise.all([loadTeams(), load()]);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        }
    };

    const load = useCallback(async () => {
        try {
            setShifts(await databaseService.listMyShifts());
        } catch (err) {
            console.error('Turni:', err);
            showToast('Impossibile caricare i turni.', 'error');
            setShifts([]);
        }
    }, [showToast]);

    useEffect(() => { void load(); }, [load]);

    // Tempo reale: turni proposti, modificati o annullati e inviti arrivano senza ricaricare.
    useSignal('team:*', () => { void load(); void loadTeams(); });

    const upcoming = useMemo(() => (shifts || []).filter((s) => s.date >= todayISO()), [shifts]);
    const toConfirm = upcoming.filter((s) => s.status === 'scheduled').length;

    const respond = async (s: ShiftItem, status: 'confirmed' | 'declined') => {
        try {
            const updated = await databaseService.respondShift(s.$id, status);
            setShifts((list) => (list || []).map((x) => (x.$id === s.$id ? { ...x, status: updated.status } : x)));
            showToast(status === 'confirmed' ? 'Turno confermato.' : 'Abbiamo avvisato la struttura.', status === 'confirmed' ? 'success' : 'info');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        }
    };

    if (shifts === null) return <PageLoader />;

    return (
        <div className="pt-4 max-w-5xl mx-auto w-full">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-4xl font-bold text-abisso leading-none">I miei turni</h1>
                    <p className="text-slate-500 mt-2">
                        {upcoming.length === 0 ? 'Nessun turno in programma.' : toConfirm > 0 ? `${toConfirm === 1 ? '1 turno da confermare' : `${toConfirm} turni da confermare`}.` : 'Tutti i prossimi turni sono confermati.'}
                    </p>
                </div>
                {upcoming.length > 0 && (
                    <AddToCalendar events={() => upcoming.filter((s) => s.status !== 'declined').map(toEvent)} filename="turni-swimin" label="Aggiungi i turni al calendario" />
                )}
            </div>

            {invites.length > 0 && (
                <section className="mb-5 rounded-3xl border border-cloro-200 bg-cloro-50 p-5" aria-labelledby="invites-title">
                    <h2 id="invites-title" className="text-xl font-bold text-abisso">Inviti nello staff</h2>
                    <ul className="mt-3 space-y-3">
                        {invites.map((inv) => (
                            <li key={inv.structureId} className="bg-white rounded-2xl border border-cloro-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <img src={inv.logo || initialsAvatar(inv.name)} alt="" className="w-11 h-11 rounded-xl object-cover bg-white border border-slate-100 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <p className="font-semibold text-abisso truncate">{inv.name}</p>
                                        <p className="text-sm text-slate-600">Ti invita nel suo staff: bacheca, turni e chat della squadra · {formatRelativeTime(inv.invitedAt)}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => answer(inv, true)} className="px-4 py-2 rounded-full text-sm font-semibold bg-cloro-700 text-white hover:bg-cloro-800">Accetta</button>
                                    <button onClick={() => answer(inv, false)} className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:border-slate-300">Rifiuta</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {teams.length > 0 && (
                <section className="mb-5" aria-labelledby="teams-title">
                    <h2 id="teams-title" className="text-xl font-bold text-abisso mb-3">Le mie strutture</h2>
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {teams.map((t) => (
                            <li key={t.structureId}>
                                <Link to={`/profile/${t.structureId}?area=staff`} className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 flex items-center gap-3 hover:border-corsia-300 transition-colors">
                                    <img src={t.logo || initialsAvatar(t.name)} alt="" className="w-11 h-11 rounded-xl object-cover bg-white border border-slate-100 flex-shrink-0" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-semibold text-abisso truncate">{t.name}</span>
                                        <span className="block text-sm text-slate-500 truncate">{t.role === 'admin' ? 'Amministratore' : 'Staff'}{t.city ? ` · ${t.city}` : ''}</span>
                                    </span>
                                    <Icon type="chevron-right" className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {shifts.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300 px-4">
                    <Icon type="calendar" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="font-semibold text-abisso">Qui vedrai i turni che ti assegnano le strutture.</p>
                    <p className="text-sm text-slate-500 mt-1">Entri nello staff di una struttura quando ti assume da un annuncio o accetti un suo invito: da lì può assegnarti i turni.</p>
                    <Link to="/jobs" className="inline-block mt-4 text-sm font-semibold text-corsia-700 hover:underline">Cerca lavoro</Link>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4">
                    <ShiftWeek
                        shifts={shifts}
                        weekStart={weekStart}
                        onWeekChange={setWeekStart}
                        currentUserId={user?.$id}
                        show="structure"
                        actions={(s) =>
                            s.date < todayISO() ? null : (
                                <>
                                    {s.status !== 'confirmed' && <button type="button" onClick={() => respond(s, 'confirmed')} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-corsia-600 text-white hover:bg-corsia-700">Confermo</button>}
                                    {s.status !== 'declined' && <button type="button" onClick={() => respond(s, 'declined')} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200">Non posso</button>}
                                    {s.status !== 'declined' && (
                                        <AddToCalendar events={[toEvent(s)]} filename={`turno-${s.date}`} label="Calendario" ariaLabel={`Aggiungi al calendario il turno del ${s.date}`} className="text-xs font-semibold px-2.5 py-1 rounded-full text-corsia-700 hover:bg-corsia-50 inline-flex items-center gap-1" iconClassName="w-3.5 h-3.5" />
                                    )}
                                </>
                            )
                        }
                    />
                </div>
            )}
        </div>
    );
};

export default MyShifts;
