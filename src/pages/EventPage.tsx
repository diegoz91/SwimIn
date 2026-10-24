import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { DateTile } from '@/features/events/EventCard';
import { EventFormModal } from '@/features/events/EventFormModal';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { downloadEventIcs, eventTypeOf, priceLabel, seatsLeft, timeRange } from '@/data/events';
import { provinceName } from '@/data/italy';
import { formatDate } from '@/utils/dates';
import { avatarOf, displayNameOf, headlineOf } from '@/utils/profile';
import { isPremium } from '@/utils/premium';
import { RichText } from '@/utils/richText';
import type { Group, StructureProfile, SwimMeet, UserProfile } from '@/types/types';

type Profile = UserProfile | StructureProfile;

/** Pagina di un evento: dettagli, iscrizione o lista d'attesa, calendario, partecipanti. */
const EventPage: React.FC = () => {
    const { id = '' } = useParams();
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [event, setEvent] = useState<SwimMeet | null | undefined>(undefined);
    const [people, setPeople] = useState<Map<string, Profile>>(new Map());
    const [group, setGroup] = useState<Group | null>(null);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    /** Link per collegarsi: lo restituisce la Function solo a organizzatore e iscritti. */
    const [link, setLink] = useState<string | null>(null);
    usePageTitle(event?.title || 'Evento');

    useEffect(() => {
        let alive = true;
        setEvent(undefined);
        databaseService.getSwimMeet(id).then((e) => alive && setEvent(e));
        return () => { alive = false; };
    }, [id]);

    useEffect(() => {
        if (!event) return;
        let alive = true;
        const ids = [event.creatorId, ...(event.participants || [])].slice(0, 100);
        databaseService.getProfilesByIds(ids).then((list) => alive && setPeople(new Map(list.map((p) => [p.$id, p])))).catch((err) => console.warn('Partecipanti:', err));
        if (event.groupId) databaseService.getGroup(event.groupId).then((g) => alive && setGroup(g)).catch((err) => console.warn('Gruppo dell’evento:', err));
        return () => { alive = false; };
    }, [event]);

    // Oggetto stabile: la modale si reimposta quando cambia l'evento.
    const editEvent = useMemo(() => (event ? { ...event, onlineUrl: link } : null), [event, link]);
    const canSeeLink = !!event?.isOnline && !!user && (event.creatorId === user.$id || (event.participants || []).includes(user.$id));
    useEffect(() => {
        if (!event || !canSeeLink) { setLink(null); return; }
        let alive = true;
        databaseService.getEventLink(event.$id).then((r) => alive && setLink(r.onlineUrl)).catch((err) => console.warn('Link dell’evento:', err));
        return () => { alive = false; };
    }, [event?.$id, canSeeLink]); // eslint-disable-line react-hooks/exhaustive-deps

    if (event === null) {
        return (
            <div className="pt-16 max-w-md mx-auto text-center">
                <Icon type="calendar" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <h1 className="text-3xl font-bold text-abisso">Evento non trovato</h1>
                <p className="text-slate-500 mt-2">Il link potrebbe essere sbagliato o l’evento è stato rimosso.</p>
                <Link to="/eventi" className="inline-block mt-5 px-5 py-2.5 rounded-full font-semibold bg-corsia-600 text-white hover:bg-corsia-700">Vai agli eventi</Link>
            </div>
        );
    }
    if (!event) return <div className="pt-4 max-w-3xl mx-auto w-full" aria-hidden="true"><div className="h-72 bg-white border border-slate-200 rounded-2xl animate-pulse" /></div>;

    const me = user?.$id || '';
    const type = eventTypeOf(event.type);
    const isOrganizer = event.creatorId === me;
    const going = (event.participants || []).includes(me);
    const waitPos = (event.waitlist || []).indexOf(me);
    const left = seatsLeft(event);
    const past = event.date < new Date().toISOString().slice(0, 10);
    const cancelled = event.status === 'cancelled';
    const open = !cancelled && !past && event.status === 'upcoming';
    const organizer = people.get(event.creatorId);

    const run = async (fn: () => Promise<SwimMeet & { myStatus?: string }>, ok: (e: SwimMeet & { myStatus?: string }) => string) => {
        setBusy(true);
        try {
            const saved = await fn();
            setEvent((prev) => ({ ...(prev as SwimMeet), ...saved }));
            showToast(ok(saved), 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        } finally {
            setBusy(false);
        }
    };
    const join = () => run(() => databaseService.joinSwimMeet(event.$id), (s) => (s.myStatus === 'waitlist' ? 'Posti esauriti: sei in lista d’attesa, ti avvisiamo se si libera un posto.' : 'Sei iscritto. Aggiungilo al calendario per non dimenticarlo.'));
    const leave = () => {
        if (!window.confirm(waitPos >= 0 ? 'Uscire dalla lista d’attesa?' : 'Annullare la tua partecipazione?')) return;
        run(() => databaseService.leaveSwimMeet(event.$id), () => (waitPos >= 0 ? 'Sei uscito dalla lista d’attesa.' : 'Partecipazione annullata.'));
    };
    const cancel = () => {
        if (!window.confirm('Annullare l’evento? Iscritti e lista d’attesa riceveranno una notifica. Non si può tornare indietro.')) return;
        run(() => databaseService.cancelSwimMeet(event.$id), () => 'Evento annullato: abbiamo avvisato gli iscritti.');
    };
    const share = async () => {
        const url = `${window.location.origin}/eventi/${event.$id}`;
        try {
            if (navigator.share) await navigator.share({ title: event.title, url });
            else { await navigator.clipboard.writeText(url); showToast('Link copiato.', 'info'); }
        } catch (err) {
            if ((err as Error)?.name !== 'AbortError') console.warn('Condivisione:', err);
        }
    };

    const cityLine = event.province && provinceName(event.province) !== event.city ? `${event.city} (${event.province})` : event.city;
    const where = event.isOnline ? 'Online' : [event.address, cityLine].filter(Boolean).join(', ');

    return (
        <div className="pt-4 max-w-3xl mx-auto w-full space-y-4">
            <section className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 sm:p-6">
                {cancelled && <p className="mb-4 rounded-xl bg-red-50 text-galleggiante font-semibold px-4 py-2.5 text-sm">Questo evento è stato annullato dall’organizzatore.</p>}
                {!cancelled && past && <p className="mb-4 rounded-xl bg-slate-100 text-slate-600 font-semibold px-4 py-2.5 text-sm">Evento concluso.</p>}
                <div className="flex gap-4 sm:gap-5">
                    <DateTile date={event.date} size="lg" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-corsia-700 flex items-center gap-1.5"><Icon type={type.icon} className="w-4 h-4" /> {type.label}</p>
                        <h1 className="text-3xl sm:text-4xl font-bold text-abisso leading-tight mt-1 break-words">{event.title}</h1>
                        {organizer && (
                            <p className="text-sm text-slate-500 mt-1">
                                Organizzato da <Link to={`/profile/${event.creatorId}`} className="font-semibold text-abisso hover:underline">{displayNameOf(organizer)}</Link>
                                {group && <> nel gruppo <Link to={`/gruppi/${group.$id}`} className="font-semibold text-abisso hover:underline">{group.name}</Link></>}
                            </p>
                        )}
                    </div>
                </div>

                <dl className="grid sm:grid-cols-2 gap-3 mt-5 text-sm">
                    <div className="flex gap-3 items-start">
                        <Icon type="clock" className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div><dt className="sr-only">Quando</dt><dd className="text-abisso font-semibold first-letter:uppercase">{formatDate(event.date, 'weekday')}</dd><dd className="text-slate-500">{timeRange(event)}</dd></div>
                    </div>
                    <div className="flex gap-3 items-start">
                        <Icon type={event.isOnline ? 'video' : 'location'} className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                            <dt className="sr-only">Dove</dt>
                            <dd className="text-abisso font-semibold break-words">{where}</dd>
                            {event.isOnline && link && (going || isOrganizer) && open && (
                                <dd><a href={link} target="_blank" rel="noopener noreferrer" className="text-corsia-700 font-semibold hover:underline break-all">Collegati all’evento</a></dd>
                            )}
                            {event.isOnline && !going && !isOrganizer && open && <dd className="text-slate-500">Il link compare quando ti iscrivi.</dd>}
                            {!event.isOnline && (
                                <dd><a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(where)}`} target="_blank" rel="noopener noreferrer" className="text-corsia-700 font-semibold hover:underline">Apri la mappa</a></dd>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-3 items-start">
                        <Icon type="sparkles" className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div><dt className="sr-only">Quota</dt><dd className="text-abisso font-semibold">{priceLabel(event.price)}</dd>{!!event.price && <dd className="text-slate-500">Da pagare all’organizzatore</dd>}</div>
                    </div>
                    <div className="flex gap-3 items-start">
                        <Icon type="users" className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <dt className="sr-only">Posti</dt>
                            <dd className="text-abisso font-semibold">{(event.participants || []).length} {(event.participants || []).length === 1 ? 'partecipante' : 'partecipanti'}{event.maxParticipants ? ` su ${event.maxParticipants}` : ''}</dd>
                            <dd className="text-slate-500">{left === null ? 'Posti illimitati' : left === 0 ? `Al completo${(event.waitlist || []).length ? ` · ${(event.waitlist || []).length} in attesa` : ''}` : left === 1 ? 'Ultimo posto' : `${left} posti liberi`}</dd>
                        </div>
                    </div>
                </dl>

                <div className="flex flex-wrap gap-2 mt-6">
                    {open && !isOrganizer && !going && waitPos < 0 && (
                        <button onClick={join} disabled={busy} className="px-5 py-2.5 rounded-full font-semibold bg-corsia-600 text-white hover:bg-corsia-700 disabled:opacity-60 flex items-center gap-2">
                            <Icon type="check" className="w-5 h-5" /> {left === 0 ? 'Mettiti in lista d’attesa' : 'Partecipa'}
                        </button>
                    )}
                    {going && !isOrganizer && (
                        <button onClick={leave} disabled={busy || !open} className="px-5 py-2.5 rounded-full font-semibold border border-cloro-300 bg-cloro-50 text-cloro-800 hover:bg-cloro-100 flex items-center gap-2">
                            <Icon type="check" className="w-5 h-5" /> Partecipi{open ? ' · annulla' : ''}
                        </button>
                    )}
                    {waitPos >= 0 && (
                        <button onClick={leave} disabled={busy} className="px-5 py-2.5 rounded-full font-semibold border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100">
                            {waitPos + 1}° in lista d’attesa · esci
                        </button>
                    )}
                    {open && (going || isOrganizer || waitPos >= 0) && (
                        <button onClick={() => downloadEventIcs(event)} className="px-5 py-2.5 rounded-full font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                            <Icon type="calendar" className="w-5 h-5" /> Aggiungi al calendario
                        </button>
                    )}
                    <button onClick={share} className="px-5 py-2.5 rounded-full font-semibold text-slate-600 hover:bg-slate-100 flex items-center gap-2">
                        <Icon type="share" className="w-5 h-5" /> Condividi
                    </button>
                    {isOrganizer && open && (
                        <>
                            <button onClick={() => setEditing(true)} className="px-5 py-2.5 rounded-full font-semibold text-corsia-700 hover:bg-corsia-50 flex items-center gap-2"><Icon type="pencil" className="w-4 h-4" /> Modifica</button>
                            <button onClick={cancel} disabled={busy} className="px-5 py-2.5 rounded-full font-semibold text-galleggiante hover:bg-red-50">Annulla evento</button>
                        </>
                    )}
                </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 sm:p-6">
                <h2 className="text-2xl font-bold text-abisso mb-2">Programma</h2>
                <p className="text-slate-700 whitespace-pre-line break-words"><RichText text={event.description} /></p>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden" aria-labelledby="event-people">
                <h2 id="event-people" className="px-5 pt-5 pb-2 text-2xl font-bold text-abisso">Partecipanti</h2>
                <ul className="divide-y divide-slate-100">
                    {(event.participants || []).map((pid) => {
                        const p = people.get(pid);
                        return (
                            <li key={pid}>
                                <button onClick={() => navigate(`/profile/${pid}`)} className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-piastrella">
                                    <img src={p ? avatarOf(p) : ''} alt="" className="w-10 h-10 rounded-full object-cover bg-slate-100" />
                                    <span className="min-w-0 flex-1">
                                        <span className="font-semibold text-abisso flex items-center gap-1.5 truncate">
                                            {p ? displayNameOf(p) : 'Utente'}
                                            {p && isPremium(p) && <PremiumBadge size="sm" />}
                                            {pid === event.creatorId && <span className="text-xs font-semibold text-corsia-700 bg-corsia-50 px-2 py-0.5 rounded-full">Organizzatore</span>}
                                        </span>
                                        <span className="block text-sm text-slate-500 truncate">{p ? headlineOf(p) : ''}</span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </section>

            <EventFormModal open={editing} event={editEvent} onClose={() => setEditing(false)} onSaved={(e) => {
                setEvent(e);
                if (e.isOnline) databaseService.getEventLink(e.$id).then((r) => setLink(r.onlineUrl)).catch((err) => console.warn('Link dell’evento:', err));
                else setLink(null);
            }} />
        </div>
    );
};

export default EventPage;
