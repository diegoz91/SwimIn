import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useSignal } from '@/hooks/useSignal';
import { useAuth } from '@/hooks/useAuth';
import { useMyTeams } from '@/hooks/useMyTeams';
import { useToast } from '@/context/ToastContext';
import { databaseService, type StaffInvite } from '@/services/database';
import { initialsAvatar } from '@/utils/avatar';
import { formatRelativeTime } from '@/utils/format';
import { Icon } from '@/components/ui/Icon';
import { PageLoader } from '@/components/common/PageLoader';
import { ShiftWeek, shiftStatusBadge, type ShiftItem } from '@/features/profile/components/ShiftWeek';
import { ShiftMonth, shiftDayLabel } from '@/features/profile/components/ShiftMonth';
import { addDaysISO, currentMonth, todayISO, weekStartISO } from '@/utils/dates';
import { hoursLabel, overlappingIds, structureColorMap, totalHours } from '@/utils/shiftCalendar';
import { type IcsEvent } from '@/utils/ics';
import { AddToCalendar } from '@/components/common/AddToCalendar';

const toEvent = (s: ShiftItem): IcsEvent => {
    const [start, end] = s.shiftTime.split('–');
    return { uid: s.$id, title: `Turno ${s.role ? `${s.role.toLowerCase()} ` : ''}· ${s.structureName || 'SwimIn'}`, date: s.date, start, end, location: s.structureName, description: 'Turno assegnato su SwimIn.' };
};

type View = 'settimana' | 'mese';

/**
 * Calendario personale dei turni, anche di più strutture: settimana o mese, un colore per
 * struttura, filtro, ore del periodo e avviso quando due turni si sovrappongono.
 */
const MyShifts: React.FC = () => {
    usePageTitle('I miei turni');
    const { user } = useAuth();
    const { showToast } = useToast();
    const { teams, reload: reloadTeams } = useMyTeams();
    const [params, setParams] = useSearchParams();
    const [shifts, setShifts] = useState<ShiftItem[] | null>(null);
    const [weekStart, setWeekStart] = useState(() => weekStartISO(todayISO()));
    const [month, setMonth] = useState(() => currentMonth());
    const [selectedDay, setSelectedDay] = useState(() => todayISO());
    const [invites, setInvites] = useState<StaffInvite[]>([]);
    const view: View = params.get('vista') === 'mese' ? 'mese' : 'settimana';
    const filter = params.get('struttura') || '';
    const setParam = (k: string, v: string) => {
        const next = new URLSearchParams(params);
        if (v) next.set(k, v);
        else next.delete(k);
        setParams(next, { replace: true });
    };

    const loadInvites = useCallback(async () => {
        setInvites(await databaseService.listMyStaffInvites().catch((err) => { console.error('Inviti:', err); return [] as StaffInvite[]; }));
    }, []);
    useEffect(() => { void loadInvites(); }, [loadInvites]);

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
    useSignal('team:*', () => { void load(); void loadInvites(); });

    const answer = async (inv: StaffInvite, accept: boolean) => {
        try {
            await databaseService.respondStaffInvite(inv.structureId, accept);
            showToast(accept ? `Benvenuto nello staff di ${inv.name}.` : 'Invito rifiutato.', accept ? 'success' : 'info');
            reloadTeams();
            await Promise.all([loadInvites(), load()]);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        }
    };

    const respond = async (s: ShiftItem, status: 'confirmed' | 'declined') => {
        try {
            const updated = await databaseService.respondShift(s.$id, status);
            setShifts((list) => (list || []).map((x) => (x.$id === s.$id ? { ...x, status: updated.status } : x)));
            showToast(status === 'confirmed' ? 'Turno confermato.' : 'Abbiamo avvisato la struttura.', status === 'confirmed' ? 'success' : 'info');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        }
    };

    // Strutture: quelle dello staff più quelle dei turni (anche di strutture lasciate).
    const structures = useMemo(() => {
        const map = new Map<string, { id: string; name: string; logo: string }>();
        for (const t of teams || []) map.set(t.structureId, { id: t.structureId, name: t.name, logo: t.logo });
        for (const s of shifts || []) if (!map.has(s.structureId)) map.set(s.structureId, { id: s.structureId, name: s.structureName || 'Struttura', logo: '' });
        return [...map.values()];
    }, [teams, shifts]);
    const colors = useMemo(() => structureColorMap(structures.map((s) => s.id), (teams || []).map((t) => t.structureId)), [structures, teams]);
    const visible = useMemo(() => (shifts || []).filter((s) => !filter || s.structureId === filter), [shifts, filter]);
    const overlaps = useMemo(() => overlappingIds((shifts || []).filter((s) => s.date >= todayISO())), [shifts]);
    const upcoming = useMemo(() => (shifts || []).filter((s) => s.date >= todayISO()), [shifts]);
    const toConfirm = upcoming.filter((s) => s.status === 'scheduled').length;

    // Periodo mostrato: ore e turni, per struttura quando sono più di una.
    const periodShifts = useMemo(
        () => (view === 'mese' ? visible.filter((s) => s.date.startsWith(month)) : visible.filter((s) => s.date >= weekStart && s.date <= addDaysISO(weekStart, 6))),
        [visible, view, month, weekStart]
    );
    const perStructure = useMemo(
        () => structures.map((st) => ({ ...st, hours: totalHours(periodShifts.filter((s) => s.structureId === st.id)) })).filter((x) => x.hours > 0),
        [structures, periodShifts]
    );
    const firstOverlap = useMemo(() => upcoming.filter((s) => overlaps.has(s.$id)).sort((a, b) => a.date.localeCompare(b.date))[0], [upcoming, overlaps]);

    if (shifts === null) return <PageLoader />;

    const actionsFor = (s: ShiftItem) =>
        s.date < todayISO() ? null : (
            <>
                {s.status !== 'confirmed' && <button type="button" onClick={() => respond(s, 'confirmed')} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-corsia-600 text-white hover:bg-corsia-700">Confermo</button>}
                {s.status !== 'declined' && <button type="button" onClick={() => respond(s, 'declined')} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200">Non posso</button>}
                {s.status !== 'declined' && (
                    <AddToCalendar events={[toEvent(s)]} filename={`turno-${s.date}`} label="Calendario" ariaLabel={`Aggiungi al calendario il turno del ${s.date}`} className="text-xs font-semibold px-2.5 py-1 rounded-full text-corsia-700 hover:bg-corsia-50 inline-flex items-center gap-1" iconClassName="w-3.5 h-3.5" />
                )}
            </>
        );
    const dayShifts = visible.filter((s) => s.date === selectedDay).sort((a, b) => a.shiftTime.localeCompare(b.shiftTime));
    const segment = (v: View, label: string) => (
        <button type="button" aria-pressed={view === v} onClick={() => setParam('vista', v === 'mese' ? 'mese' : '')} className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${view === v ? 'bg-abisso text-white' : 'text-slate-600 hover:text-abisso'}`}>
            {label}
        </button>
    );

    return (
        <div className="pt-4 max-w-5xl mx-auto w-full">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-4xl font-bold text-abisso leading-none">I miei turni</h1>
                    <p className="text-slate-500 mt-2">
                        {upcoming.length === 0 ? 'Nessun turno in programma.' : toConfirm > 0 ? `${toConfirm === 1 ? '1 turno da confermare' : `${toConfirm} turni da confermare`}.` : 'Tutti i prossimi turni sono confermati.'}
                        {structures.length > 1 && ` Turni di ${structures.length} strutture in un solo calendario.`}
                    </p>
                </div>
                {upcoming.length > 0 && (
                    <AddToCalendar events={() => upcoming.filter((s) => s.status !== 'declined' && (!filter || s.structureId === filter)).map(toEvent)} filename="turni-swimin" label="Aggiungi i turni al calendario" />
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

            {shifts.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300 px-4">
                    <Icon type="calendar" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="font-semibold text-abisso">Qui vedrai i turni che ti assegnano le strutture.</p>
                    <p className="text-sm text-slate-500 mt-1">Entri nello staff di una struttura quando ti assume da un annuncio o accetti un suo invito: da lì può assegnarti i turni.</p>
                    <Link to="/jobs" className="inline-block mt-4 text-sm font-semibold text-corsia-700 hover:underline">Cerca lavoro</Link>
                </div>
            ) : (
                <>
                    {firstOverlap && (
                        <div role="status" className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                            <Icon type="alert-triangle" className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-900">
                                {overlaps.size === 2 ? 'Due turni si sovrappongono' : `${overlaps.size} turni si sovrappongono`}, il primo {shiftDayLabel(firstOverlap.date)}.{' '}
                                <button type="button" onClick={() => { setParam('vista', 'mese'); setMonth(firstOverlap.date.slice(0, 7)); setSelectedDay(firstOverlap.date); }} className="py-1 -my-1 font-semibold underline">
                                    Mostra il giorno
                                </button>
                            </p>
                        </div>
                    )}

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div role="group" aria-label="Vista del calendario" className="inline-flex p-1 rounded-full bg-slate-100">
                                {segment('settimana', 'Settimana')}
                                {segment('mese', 'Mese')}
                            </div>
                            <p className="text-sm text-slate-600">
                                {view === 'mese' ? 'Nel mese' : 'Nella settimana'}: <span className="font-semibold text-abisso">{hoursLabel(totalHours(periodShifts))}</span>
                                {periodShifts.filter((s) => s.status !== 'declined').length > 0 && ` · ${periodShifts.filter((s) => s.status !== 'declined').length} turni`}
                            </p>
                        </div>

                        {structures.length > 1 && (
                            <div role="group" aria-label="Filtra per struttura" className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
                                <button type="button" aria-pressed={!filter} onClick={() => setParam('struttura', '')} className={`flex-shrink-0 px-3 py-1.5 rounded-full border text-sm font-semibold ${!filter ? 'bg-abisso border-abisso text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                                    Tutte
                                </button>
                                {structures.map((st) => (
                                    <button key={st.id} type="button" aria-pressed={filter === st.id} onClick={() => setParam('struttura', filter === st.id ? '' : st.id)} className={`flex-shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold max-w-[16rem] ${filter === st.id ? 'bg-abisso border-abisso text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.get(st.id)?.dot}`} aria-hidden="true" />
                                        <span className="truncate">{st.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {view === 'settimana' ? (
                            <ShiftWeek
                                shifts={visible}
                                weekStart={weekStart}
                                onWeekChange={setWeekStart}
                                currentUserId={user?.$id}
                                show="structure"
                                accentOf={structures.length > 1 ? (s) => colors.get(s.structureId)?.bar : undefined}
                                flagged={overlaps}
                                actions={actionsFor}
                            />
                        ) : (
                            <>
                                <ShiftMonth shifts={visible} month={month} onMonthChange={setMonth} selected={selectedDay} onSelect={setSelectedDay} dotOf={(s) => colors.get(s.structureId)?.dot || 'bg-corsia-500'} flagged={overlaps} />
                                <section className="mt-4 pt-4 border-t border-slate-100" aria-live="polite" aria-labelledby="day-title">
                                    <h2 id="day-title" className="text-lg font-bold text-abisso first-letter:uppercase">{shiftDayLabel(selectedDay)}</h2>
                                    {dayShifts.length === 0 ? (
                                        <p className="text-sm text-slate-500 mt-1">Nessun turno in questo giorno.</p>
                                    ) : (
                                        <ul className="mt-3 space-y-2">
                                            {dayShifts.map((s) => {
                                                const badge = shiftStatusBadge(s.status);
                                                return (
                                                    <li key={s.$id} className={`rounded-xl border border-slate-200 border-l-4 ${colors.get(s.structureId)?.bar} p-3 flex flex-col sm:flex-row sm:items-center gap-2`}>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-semibold text-abisso">{s.shiftTime} <span className="font-normal text-slate-600">· {s.structureName}</span></p>
                                                            <p className="text-sm text-slate-500">{s.role}</p>
                                                            <div className="mt-1 flex flex-wrap gap-1">
                                                                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${badge.cls}`}>{badge.text}</span>
                                                                {overlaps.has(s.$id) && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200">Sovrapposto</span>}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5">{actionsFor(s)}</div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </section>
                            </>
                        )}
                    </div>
                </>
            )}

            {structures.length > 0 && (
                <section className="mt-6" aria-labelledby="teams-title">
                    <h2 id="teams-title" className="text-xl font-bold text-abisso mb-3">Le mie strutture</h2>
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {structures.map((st) => {
                            const team = (teams || []).find((t) => t.structureId === st.id);
                            const hours = perStructure.find((p) => p.id === st.id)?.hours || 0;
                            const body = (
                                <>
                                    <img src={st.logo || initialsAvatar(st.name)} alt="" className="w-11 h-11 rounded-xl object-cover bg-white border border-slate-100 flex-shrink-0" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-semibold text-abisso truncate">{st.name}</span>
                                        <span className="block text-sm text-slate-500">
                                            {team ? (team.role === 'admin' ? 'Amministratore' : 'Staff') : 'Non fai più parte dello staff'}
                                            {hours > 0 && ` · ${hoursLabel(hours)} ${view === 'mese' ? 'nel mese' : 'nella settimana'}`}
                                        </span>
                                    </span>
                                </>
                            );
                            const cls = `bg-white rounded-2xl border border-slate-200 border-l-4 ${colors.get(st.id)?.bar} shadow-card p-4 flex items-center gap-3`;
                            return (
                                <li key={st.id}>
                                    {team ? (
                                        <Link to={`/profile/${st.id}?area=staff`} className={`${cls} hover:border-corsia-300 transition-colors`}>
                                            {body}
                                            <Icon type="chevron-right" className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                        </Link>
                                    ) : (
                                        <div className={cls}>{body}</div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}
        </div>
    );
};

export default MyShifts;
