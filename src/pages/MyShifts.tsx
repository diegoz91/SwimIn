import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { PageLoader } from '@/components/common/PageLoader';
import { ShiftWeek, type ShiftItem } from '@/features/profile/components/ShiftWeek';
import { todayISO, weekStartISO } from '@/utils/dates';
import { downloadIcs, type IcsEvent } from '@/utils/ics';

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
                    <button
                        type="button"
                        onClick={() => downloadIcs('turni-swimin', upcoming.filter((s) => s.status !== 'declined').map(toEvent))}
                        className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
                    >
                        <Icon type="calendar" className="w-4 h-4" /> Aggiungi al calendario
                    </button>
                )}
            </div>

            {shifts.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300 px-4">
                    <Icon type="calendar" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="font-semibold text-abisso">Qui vedrai i turni che ti assegnano le strutture.</p>
                    <p className="text-sm text-slate-500 mt-1">Quando una struttura ti assume da un annuncio entri nel suo staff e può assegnarti i turni.</p>
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
                                        <button type="button" onClick={() => downloadIcs(`turno-${s.date}`, [toEvent(s)])} className="text-xs font-semibold px-2.5 py-1 rounded-full text-corsia-700 hover:bg-corsia-50" aria-label={`Aggiungi al calendario il turno del ${s.date}`}>
                                            Calendario
                                        </button>
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
