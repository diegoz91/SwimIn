import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { databaseService } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { DateTile } from './EventCard';
import { eventTypeOf, timeRange } from '@/data/events';
import type { SwimMeet } from '@/types/types';
import { EVENTS_PATH } from '@/config/routes';

/** Colonna destra della home: i prossimi eventi nella tua provincia (o online). */
export const UpcomingEventsCard: React.FC<{ province?: string; userId: string }> = ({ province, userId }) => {
    const [events, setEvents] = useState<SwimMeet[] | null>(null);
    useEffect(() => {
        let alive = true;
        databaseService.getActiveSwimMeets(60).then((list) => {
            if (!alive) return;
            const p = (province || '').toUpperCase();
            const mine = list.filter((e) => (e.participants || []).includes(userId));
            const near = list.filter((e) => !mine.includes(e) && (!p || e.province === p || e.isOnline));
            setEvents([...mine, ...near].slice(0, 3));
        });
        return () => { alive = false; };
    }, [province, userId]);
    if (!events || events.length === 0) return null;
    return (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden" aria-labelledby="upcoming-events">
            <h2 id="upcoming-events" className="px-4 pt-4 pb-1 text-xl font-bold text-abisso flex items-center gap-2"><Icon type="calendar" className="w-5 h-5 text-corsia-600" /> Prossimi eventi</h2>
            <ul>
                {events.map((e) => (
                    <li key={e.$id}>
                        <Link to={`/eventi/${e.$id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-piastrella">
                            <DateTile date={e.date} />
                            <span className="min-w-0">
                                <span className="block text-xs text-corsia-700 font-semibold">{eventTypeOf(e.type).label}{(e.participants || []).includes(userId) ? ' · partecipi' : ''}</span>
                                <span className="block font-semibold text-abisso text-sm leading-snug line-clamp-2">{e.title}</span>
                                <span className="block text-xs text-slate-500 truncate">{timeRange(e)} · {e.isOnline ? 'Online' : e.city}</span>
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
            <Link to={EVENTS_PATH} className="block text-center text-sm font-semibold text-corsia-700 hover:bg-piastrella py-3 border-t border-slate-100">Tutti gli eventi</Link>
        </section>
    );
};
