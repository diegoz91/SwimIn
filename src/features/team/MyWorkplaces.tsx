import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/ui/Icon';
import { databaseService } from '@/services/database';
import { useMyTeams } from '@/hooks/useMyTeams';
import { useSignal } from '@/hooks/useSignal';
import { initialsAvatar } from '@/utils/avatar';
import { formatDate, todayISO } from '@/utils/dates';
import { structureColorMap } from '@/utils/shiftCalendar';
import type { SquadShift } from '@/types/types';

type Shift = SquadShift & { structureName?: string };

/** Turni in arrivo (per il prossimo turno di ogni struttura e quelli da confermare). */
function useUpcomingShifts(enabled: boolean) {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const load = () => {
        databaseService.listMyShifts().then(setShifts).catch((err) => console.warn('Turni:', err));
    };
    useEffect(() => { if (enabled) load(); }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
    useSignal(enabled ? 'team:*' : null, load, 800);
    return useMemo(() => shifts.filter((s) => s.date >= todayISO() && s.status !== 'declined').sort((a, b) => (a.date + a.shiftTime).localeCompare(b.date + b.shiftTime)), [shifts]);
}

const nextLabel = (s?: Shift) => {
    if (!s) return 'Nessun turno in programma';
    const day = s.date === todayISO() ? 'oggi' : formatDate(s.date, 'weekday');
    return `Prossimo turno ${day}, ${s.shiftTime}`;
};

/**
 * Scorciatoia alle strutture in cui lavoro: nella colonna sinistra della home (computer) con il
 * prossimo turno di ognuna; su smartphone come striscia scorrevole sopra il feed.
 */
export const MyWorkplaces: React.FC<{ variant: 'card' | 'strip' }> = ({ variant }) => {
    const { teams } = useMyTeams();
    const has = !!teams && teams.length > 0;
    const upcoming = useUpcomingShifts(has);
    const colors = useMemo(() => structureColorMap((teams || []).map((t) => t.structureId)), [teams]);
    if (!has || !teams) return null;
    const toConfirm = upcoming.filter((s) => s.status === 'scheduled').length;

    if (variant === 'strip') {
        return (
            <nav aria-label="Le strutture in cui lavori" className="-mx-4 sm:mx-0">
                <ul className="flex gap-2 overflow-x-auto px-4 sm:px-0 pb-1 scroll-px-4">
                    <li className="shrink-0">
                        <Link to="/turni" className="h-full inline-flex items-center gap-2 pl-3 pr-4 py-2 rounded-full bg-abisso text-white text-sm font-semibold">
                            <Icon type="calendar" className="w-4 h-4" /> Turni
                            {toConfirm > 0 && <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-white text-abisso text-xs font-bold grid place-items-center" aria-label={`${toConfirm} da confermare`}>{toConfirm}</span>}
                        </Link>
                    </li>
                    {teams.map((t) => (
                        <li key={t.structureId} className="shrink-0">
                            <Link to={`/profile/${t.structureId}?area=staff`} className="inline-flex items-center gap-2 pl-1.5 pr-4 py-1.5 rounded-full bg-white border border-slate-200 text-sm font-semibold text-abisso max-w-[16rem]">
                                <span className="relative shrink-0">
                                    <img src={t.logo || initialsAvatar(t.name)} alt="" className="w-7 h-7 rounded-full object-cover bg-white" />
                                    <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${colors.get(t.structureId)?.dot}`} aria-hidden="true" />
                                </span>
                                <span className="truncate">{t.name}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
        );
    }

    return (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden" aria-labelledby="workplaces-title">
            <h2 id="workplaces-title" className="px-4 pt-4 pb-2 text-lg font-bold text-abisso">Lavori presso</h2>
            <ul>
                {teams.map((t) => {
                    const next = upcoming.find((s) => s.structureId === t.structureId);
                    return (
                        <li key={t.structureId}>
                            <Link to={`/profile/${t.structureId}?area=staff`} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-piastrella border-l-4 ${colors.get(t.structureId)?.bar}`}>
                                <img src={t.logo || initialsAvatar(t.name)} alt="" className="w-9 h-9 rounded-lg object-cover bg-white border border-slate-100 shrink-0" />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-abisso truncate">{t.name}</span>
                                    <span className="block text-xs text-slate-500 leading-snug">{nextLabel(next)}</span>
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
            <Link to="/turni" className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 text-sm font-semibold text-corsia-700 hover:bg-piastrella">
                <span>Calendario dei turni{toConfirm > 0 ? ` · ${toConfirm} da confermare` : ''}</span>
                <Icon type="chevron-right" className="w-4 h-4" />
            </Link>
        </section>
    );
};
