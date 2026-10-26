import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useLiveCollection } from '@/hooks/useLiveCollection';
import { databaseService } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { ChoiceChips } from '@/components/form/Field';
import { ProvinceSelect } from '@/components/form/Pickers';
import { EventCard } from '@/features/events/EventCard';
import { EventFormModal } from '@/features/events/EventFormModal';
import { EVENT_TYPES } from '@/data/events';
import { provinceName } from '@/data/italy';
import { useBlocks } from '@/context/BlocksContext';
import type { EventType, SwimMeet } from '@/types/types';

type View = 'tutti' | 'miei' | 'organizzati';

/** Eventi del mondo del nuoto: allenamenti condivisi, gare, corsi, open day, webinar. */
const Events: React.FC = () => {
    usePageTitle('Eventi');
    const { user } = useAuth();
    const blocks = useBlocks();
    const navigate = useNavigate();
    const [events, setEvents] = useState<SwimMeet[] | null>(null);
    const [view, setView] = useState<View>('tutti');
    const [type, setType] = useState<EventType | ''>('');
    const [province, setProvince] = useState((user?.province || '').toUpperCase());
    const [onlineToo, setOnlineToo] = useState(true);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        let alive = true;
        databaseService.getActiveSwimMeets(200).then((e) => alive && setEvents(e));
        return () => { alive = false; };
    }, []);

    // Tempo reale: eventi nuovi, posti occupati e annullamenti si aggiornano da soli.
    useLiveCollection('swim_meets', () => {
        databaseService.getActiveSwimMeets(200).then(setEvents).catch((err) => console.warn('Eventi (aggiornamento):', err));
    }, 800);

    const me = user?.$id || '';
    const shown = useMemo(() => {
        const list = (events || []).filter((e) => !blocks.isHidden(e.creatorId));
        if (view === 'miei') return list.filter((e) => (e.participants || []).includes(me) || (e.waitlist || []).includes(me));
        if (view === 'organizzati') return list.filter((e) => e.creatorId === me);
        return list
            .filter((e) => !type || e.type === type || (!e.type && type === 'incontro'))
            .filter((e) => !province || (e.isOnline ? onlineToo : e.province === province));
    }, [events, view, type, province, onlineToo, me, blocks]);

    const counts = useMemo(() => ({
        miei: (events || []).filter((e) => (e.participants || []).includes(me) || (e.waitlist || []).includes(me)).length,
        organizzati: (events || []).filter((e) => e.creatorId === me).length,
    }), [events, me]);

    const views: { key: View; label: string }[] = [
        { key: 'tutti', label: 'In programma' },
        { key: 'miei', label: counts.miei ? `A cui partecipi · ${counts.miei}` : 'A cui partecipi' },
        { key: 'organizzati', label: counts.organizzati ? `Organizzati · ${counts.organizzati}` : 'Organizzati' },
    ];

    return (
        <div className="pt-4 max-w-5xl mx-auto w-full">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
                <div>
                    <h1 className="text-4xl font-bold text-abisso leading-none">Eventi</h1>
                    <p className="text-slate-500 mt-2">Allenamenti condivisi, gare, corsi di aggiornamento, open day e webinar.</p>
                </div>
                <button onClick={() => setCreating(true)} className="px-5 py-2.5 rounded-full font-semibold bg-corsia-600 text-white hover:bg-corsia-700 flex items-center gap-2">
                    <Icon type="plus" className="w-5 h-5" /> Crea un evento
                </button>
            </div>

            <nav className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto" aria-label="Quali eventi">
                {views.map((v) => (
                    <button
                        key={v.key}
                        onClick={() => setView(v.key)}
                        aria-current={view === v.key ? 'page' : undefined}
                        className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${view === v.key ? 'border-corsia-600 text-corsia-700' : 'border-transparent text-slate-500 hover:text-abisso'}`}
                    >
                        {v.label}
                    </button>
                ))}
            </nav>

            {view === 'tutti' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 mb-5 space-y-3">
                    <ChoiceChips label="Tipo di evento" options={[{ value: '' as EventType | '', label: 'Tutti' }, ...EVENT_TYPES.map(({ value, label }) => ({ value, label }))]} value={[type]} onChange={(v) => setType(v[0])} />
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
                        <ProvinceSelect value={province} onChange={setProvince} />
                        <div className="flex flex-wrap gap-3 items-center text-sm">
                            {province && (
                                <>
                                    <button onClick={() => setOnlineToo((v) => !v)} aria-pressed={onlineToo} className={`px-3.5 py-2 rounded-full font-semibold border ${onlineToo ? 'bg-corsia-50 border-corsia-200 text-corsia-700' : 'border-slate-200 text-slate-600'}`}>
                                        {onlineToo ? 'Anche online' : 'Solo in presenza'}
                                    </button>
                                    <button onClick={() => setProvince('')} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline">Tutta Italia</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {events === null ? (
                <div className="grid sm:grid-cols-2 gap-4" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 bg-white border border-slate-200 rounded-2xl animate-pulse" />)}
                </div>
            ) : shown.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300 px-4">
                    <Icon type="calendar" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="font-semibold text-abisso">
                        {view === 'miei' ? 'Non sei iscritto a nessun evento.' : view === 'organizzati' ? 'Non hai eventi in programma.' : province ? `Nessun evento in provincia di ${provinceName(province) || province}.` : 'Nessun evento in programma.'}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                        {view === 'tutti' && province ? 'Prova a guardare in tutta Italia, oppure organizzane uno tu.' : 'Organizza un allenamento, un corso o un open day: bastano due minuti.'}
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {view === 'tutti' && province && <button onClick={() => setProvince('')} className="px-5 py-2.5 rounded-full font-semibold text-corsia-700 hover:bg-corsia-50">Tutta Italia</button>}
                        <button onClick={() => setCreating(true)} className="px-5 py-2.5 rounded-full font-semibold border border-corsia-600 text-corsia-700 hover:bg-corsia-50">Crea un evento</button>
                    </div>
                </div>
            ) : (
                <ul className="grid sm:grid-cols-2 gap-4">
                    {shown.map((e) => <li key={e.$id} className="min-w-0"><EventCard event={e} currentUserId={me} /></li>)}
                </ul>
            )}

            <EventFormModal open={creating} onClose={() => setCreating(false)} onSaved={(e) => navigate(`/eventi/${e.$id}`)} />
        </div>
    );
};

export default Events;
