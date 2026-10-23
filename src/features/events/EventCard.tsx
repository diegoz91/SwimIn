import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { dateTile, eventTypeOf, priceLabel, seatsLeft, timeRange } from '@/data/events';
import type { SwimMeet } from '@/types/types';

/** Riquadro calendario: giorno grande, mese e giorno della settimana. */
export const DateTile: React.FC<{ date: string; size?: 'md' | 'lg' }> = ({ date, size = 'md' }) => {
    const t = dateTile(date);
    return (
        <div className={`flex-shrink-0 rounded-xl overflow-hidden border border-slate-200 bg-white text-center ${size === 'lg' ? 'w-20' : 'w-14'}`} aria-hidden="true">
            <div className={`bg-corsia-600 text-white font-semibold ${size === 'lg' ? 'text-sm py-1' : 'text-[11px] py-0.5'}`}>{t.month}</div>
            <div className={`font-display font-bold text-abisso leading-none ${size === 'lg' ? 'text-4xl pt-2' : 'text-2xl pt-1'}`}>{t.day}</div>
            <div className={`text-slate-500 ${size === 'lg' ? 'text-sm pb-2' : 'text-[11px] pb-1'}`}>{t.weekday}</div>
        </div>
    );
};

export const EventCard: React.FC<{ event: SwimMeet; currentUserId?: string }> = ({ event, currentUserId }) => {
    const type = eventTypeOf(event.type);
    const going = !!currentUserId && (event.participants || []).includes(currentUserId);
    const waiting = !!currentUserId && (event.waitlist || []).includes(currentUserId);
    const left = seatsLeft(event);
    return (
        <Link to={`/eventi/${event.$id}`} className="group flex gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-card hover:border-corsia-200 hover:shadow-lift transition-shadow h-full">
            <DateTile date={event.date} />
            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-corsia-700 flex items-center gap-1">
                    <Icon type={type.icon} className="w-3.5 h-3.5" /> {type.label}
                </p>
                <p className="font-semibold text-abisso group-hover:text-corsia-700 leading-snug mt-0.5 line-clamp-2">{event.title}</p>
                <p className="text-sm text-slate-500 mt-1 truncate">
                    {timeRange(event)} · {event.isOnline ? 'Online' : `${event.city}${event.province ? ` (${event.province})` : ''}`}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
                    <span className="text-slate-600">{priceLabel(event.price)}</span>
                    <span className="text-slate-600">{(event.participants || []).length} {(event.participants || []).length === 1 ? 'partecipante' : 'partecipanti'}</span>
                    {left === 0 && <span className="font-semibold text-amber-700">Al completo · lista d’attesa</span>}
                    {left !== null && left > 0 && left <= 5 && <span className="font-semibold text-amber-700">{left === 1 ? 'Ultimo posto' : `Ultimi ${left} posti`}</span>}
                    {going && <span className="font-semibold text-cloro-700 flex items-center gap-1"><Icon type="check" className="w-3.5 h-3.5" /> Partecipi</span>}
                    {waiting && <span className="font-semibold text-amber-700">In lista d’attesa</span>}
                </div>
            </div>
        </Link>
    );
};
